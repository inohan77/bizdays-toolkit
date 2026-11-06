// 診断の catch 節に届く経路（テスト拡充案の T3。scripts/check-catch-coverage.ts が、src/core の catch 節がテストで通ることを確かめる）。
// 途中から例外を投げる提供元（test/support/faulty.ts の throwingAfter）は、提供元の約束（同じ年に同じ結果を返す）の外なので、
// 診断の結果の中身は決まらない（docs/providers.ja.md の「提供元の約束と誤りの扱い」）。ここでは、診断が例外を投げずに一覧を返し、
// 規則どうしの診断の途中で投げた例外を error として報告することだけを確かめる。
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { throwingAfter } from "./support/faulty.ts";

/** 祝日に従属する規則・第 n 営業日の規則・振替・個別の日付・取り除いて比べる規則（redundant の候補）を含む設定 */
const CONFIGS: readonly Record<string, unknown>[] = [
  { closedRecurringRules: [{ holiday: true, months: [5] }, { holiday: true }] },
  { closedRecurringRules: [{ dayAfterHoliday: true }, { dayAfterHoliday: true, months: [1] }] },
  {
    closedRecurringRules: [{ businessDayOfMonth: 1 }, { weekday: 3 }],
    closedDates: ["2026-02-02"],
  },
  {
    closedRecurringRules: [
      { weekday: 1, holidayOverlapPolicy: "after-holiday" },
      { weekday: 1, months: [2] },
    ],
  },
  {
    holidayPolicy: "open",
    closedRecurringRules: [
      { dayOfMonth: 5 },
      { dayOfMonth: 5, months: [3] },
      { holiday: true, kinds: ["regular"] },
    ],
    openDates: ["2026-05-04"],
  },
  {
    closedRecurringRules: [
      { dayBeforeHoliday: true, skipWeekdays: [0, 6] },
      { cycle: 3, anchor: "2026-01-01", positions: [1] },
    ],
    closedDates: ["2026-05-01"],
  },
];

test("診断の catch 節: 途中から例外を投げる提供元でも、診断は例外を投げずに一覧を返す", () => {
  let reported = 0;
  // 届く組み合わせ（投げ始める呼び出しの回数・投げる年）。全年で投げると祝日の規則の判定・規則どうしの診断の全体の catch 節に、
  // 2026 年だけで投げると日ごとの値を求める catch 節に届く（scripts/check-catch-coverage.ts で確かめた）
  for (const [calls, year] of [
    [1, undefined],
    [2, undefined],
    [1, 2026],
  ] as const)
    for (const options of CONFIGS) {
      const provider = throwingAfter(calls, year === undefined ? {} : { year });
      const list = diagnoseCalendar({ holidayProvider: provider, ...options });
      assert.ok(Array.isArray(list));
      if (list.some((d) => d.severity === "error" && d.path === "holidayProvider")) reported++;
      const schedule = diagnoseSchedule({
        holidayProvider: throwingAfter(calls, year === undefined ? {} : { year }),
        weekdayValues: ["c", "o", "o", "o", "o", "o", "c"],
        holidayPolicy: { value: "h" },
        recurringRules: ((options["closedRecurringRules"] as Record<string, unknown>[]) ?? []).map(
          (r) => ({
            ...r,
            value: "x",
          }),
        ),
      });
      assert.ok(Array.isArray(schedule));
    }
  // 規則どうしの診断の途中で投げた例外は、途中の結果を捨てて error として報告する経路がある
  assert.ok(
    reported > 0,
    "規則どうしの診断の途中の例外を error として報告した設定がない（空振り）",
  );
});

test("診断の catch 節: 途中から投げた例外の code が out-of-range なら、out-of-range として報告する", () => {
  const list = diagnoseCalendar({
    holidayProvider: throwingAfter(1, { code: "out-of-range" }),
    closedRecurringRules: [{ holiday: true }],
  });
  assert.ok(
    list.some(
      (d) => d.severity === "error" && d.code === "out-of-range" && d.path === "holidayProvider",
    ),
    JSON.stringify(list),
  );
});
