// 暦日の範囲（1000〜9999 年）の端・循環する値・穴のある配列・Date の範囲を超える瞬間（0.31.6 の修正）。
// どれも「作成できる設定に診断が error を返さない」「例外は code を持つ」という約束の、入力の種類ごとの確認。
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, isBizdaysError, toDateString } from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { jp } from "../src/jp/index.ts";
import { withSubstituteDays } from "../src/provider/index.ts";

const codeOf = (f: () => unknown): unknown => {
  try {
    f();
  } catch (error) {
    assert.ok(isBizdaysError(error), `code のない例外: ${String(error)}`);
    return error.code;
  }
  return undefined;
};

/** 規則の種類ごとに、有効期間を範囲の端に片側だけ置く */
const EDGE_RULES: readonly Record<string, unknown>[] = [
  { weekday: 1 },
  { weekday: 2, interval: 50, anchor: "2026-01-06" },
  { dayOfMonth: -1 },
  { weekday: 1, holidayOverlapPolicy: "after-holiday" },
  { dayOfMonth: 15, holidayOverlapPolicy: "after-holiday", skipWeekdays: [0, 6] },
  { holiday: true },
  { dayAfterHoliday: true },
  { dayBeforeHoliday: true, skipWeekdays: [0, 6] },
  { businessDayOfMonth: -1 },
  { businessDayOfWeek: 1, weekStart: 3 },
  { cycle: 400, anchor: "2026-01-01", positions: [1] },
];
const EDGE_PERIODS: readonly Record<string, unknown>[] = [
  {}, // 有効期間なし（対応年が範囲の端にある提供元では、走査の窓そのものが端に来る）
  { effectiveTo: "1000-01-10" },
  { effectiveTo: "1000-12-31" },
  { effectiveFrom: "9999-12-20" },
  { effectiveFrom: "9999-12-31" },
];
/** 対応年が暦日の範囲の端にある提供元（毎年 1 月 1 日が祝日） */
const edgeProvider = (from: number, to: number) => ({
  id: `EDGE-${from}`,
  timeZone: "UTC",
  supportedYears: { from, to },
  dataVersion: "x",
  holidaysInYear: (y: number) => [
    { date: `${y}-01-01`, name: "a", nameEn: "a", kind: "regular", key: "a", confirmed: true },
  ],
});
const EDGE_BASES: readonly Record<string, unknown>[] = [
  {},
  { holidayProvider: jp },
  { holidayProvider: jp, outOfRangePolicy: "ignore" },
  { holidayProvider: edgeProvider(1000, 1002) },
  { holidayProvider: edgeProvider(9997, 9999) },
];
/** 第 n 営業日の規則か（スケジュールでは数える基準のカレンダーが要る） */
const isCounting = (rule: Record<string, unknown>): boolean =>
  "businessDayOfMonth" in rule || "businessDayOfWeek" in rule;

test("範囲の端: 有効期間が 1000 年・9999 年の端にある設定で、診断の error と作成の成否が一致する", () => {
  for (const rule of EDGE_RULES)
    for (const period of EDGE_PERIODS)
      for (const base of EDGE_BASES) {
        // 対応年が範囲の端にある提供元は、走査の窓そのものが端に来るので、有効期間のない規則だけで調べる。ほかの提供元は、
        // 有効期間を端に置いた規則で調べる（日本の提供元の全対応年の走査は端に関係がなく遅い）
        const edge = String(
          (base["holidayProvider"] as { id?: string } | undefined)?.id,
        ).startsWith("EDGE");
        if (edge !== (Object.keys(period).length === 0)) continue;
        const options = { ...base, closedRecurringRules: [{ ...rule, ...period }] };
        const created = codeOf(() => createCalendar(options as never)) === undefined;
        const errors = diagnoseCalendar(options).filter((d) => d.severity === "error");
        assert.equal(errors.length === 0, created, JSON.stringify([options, errors]));
        // スケジュールの第 n 営業日の規則は、同じ提供元のカレンダー（規則なし）を数える基準にする
        const basis = isCounting(rule) ? { calendar: createCalendar(base as never) } : {};
        const schedule = {
          ...base,
          weekdayValues: [1, 1, 1, 1, 1, 1, 1],
          recurringRules: [{ ...rule, ...period, ...basis, value: 2 }],
        };
        const scheduleCreated = codeOf(() => createSchedule(schedule as never)) === undefined;
        const scheduleErrors = diagnoseSchedule(schedule).filter((d) => d.severity === "error");
        assert.equal(
          scheduleErrors.length === 0,
          scheduleCreated,
          JSON.stringify([schedule, scheduleErrors]),
        );
      }
  for (const period of EDGE_PERIODS)
    assert.deepEqual(
      diagnoseCalendar({ closedAnnualDates: [{ date: "01-01", ...period }] }).filter(
        (d) => d.severity === "error",
      ),
      [],
    );
});

test("範囲の端の判定: 規則の種類ごとに、1000 年・9999 年の端の日の判定・探索は、範囲の中の日を返すか out-of-range を投げる（ほかの code・code のない例外・範囲の外の日付を返さない。decisions.md の 1 番）", () => {
  const days = [
    ...["01", "02", "03", "04", "05", "06", "07"].map((d) => `1000-01-${d}`),
    ...["25", "26", "27", "28", "29", "30", "31"].map((d) => `9999-12-${d}`),
  ];
  const allowed = new Set(["out-of-range", "no-business-day", "no-closed-day"]);
  const outcome = (f: () => unknown): string => {
    let value: unknown;
    try {
      value = f();
    } catch (error) {
      assert.ok(isBizdaysError(error), `code のない例外: ${String(error)}`);
      assert.ok(allowed.has(error.code), `${error.code}: ${error.message}`);
      return error.code;
    }
    // 日付の形の文字列は、範囲の中の暦日であること（理由などの文字列は数字で始まらない）
    if (typeof value === "string" && /^[+-]?\d/.test(value))
      assert.match(value, /^[1-9]\d{3}-\d{2}-\d{2}$/, `範囲の外の日付: ${value}`);
    return "value";
  };
  const wide = edgeProvider(1000, 9999);
  for (const rule of EDGE_RULES)
    for (const base of [{}, { holidayProvider: wide }]) {
      const calendar = createCalendar({ ...base, closedRecurringRules: [rule] } as never);
      const basis = isCounting(rule) ? { calendar: createCalendar(base as never) } : {};
      const schedule = createSchedule({
        ...base,
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        recurringRules: [{ ...rule, ...basis, value: 2 }],
      } as never);
      for (const day of days) {
        const label = `${JSON.stringify(rule)} ${JSON.stringify(Object.keys(base))} ${day}`;
        for (const f of [
          () => calendar.isBusinessDay(day),
          () => calendar.dayInfoOn(day).reason,
          () => calendar.nextBusinessDay(day),
          () => calendar.previousBusinessDay(day),
          () => calendar.addBusinessDays(day, 1),
          () => calendar.addBusinessDays(day, -1),
          () => schedule.valueOn(day),
          () => schedule.dayInfoOn(day).reason,
        ])
          outcome(f);
        // 判定の例外は、範囲の外の日を見るときの out-of-range だけ（その日の判定に、暦日として存在しない日が要る）
        assert.ok(
          ["value", "out-of-range"].includes(outcome(() => calendar.isBusinessDay(day))),
          label,
        );
      }
    }
});

test("値の比較: 循環する値は形が同じなら同じ、違えば違う。深すぎる入れ子は同じとみなさない", () => {
  const cyclic = (open: string): Record<string, unknown> => {
    const value: Record<string, unknown> = { open };
    value["self"] = value;
    return value;
  };
  const diagnose = (weekday: unknown, rule: unknown) =>
    diagnoseSchedule({
      weekdayValues: [weekday, weekday, weekday, weekday, weekday, weekday, weekday],
      recurringRules: [{ weekday: 1, value: rule }],
    }).map((d) => d.code);
  assert.deepEqual(diagnose(cyclic("10:00"), cyclic("10:00")), ["redundant"]);
  assert.deepEqual(diagnose(cyclic("10:00"), cyclic("11:00")), []);
  const deep = (): unknown => {
    let value: unknown = 1;
    for (let i = 0; i < 20000; i++) value = { value };
    return value;
  };
  assert.deepEqual(diagnose(deep(), deep()), []);
  createSchedule({ weekdayValues: Array.from({ length: 7 }, () => cyclic("10:00")) } as never);
});

test("穴のある配列: 提供元の返すデータは invalid-provider-data、withSubstituteDays は invalid-argument", () => {
  const holes = (year: number): unknown[] => {
    const list: unknown[] = [];
    list[2] = { date: `${year}-01-01`, name: "a", nameEn: "a", kind: "k", confirmed: true };
    return list;
  };
  const provider = {
    id: "XX",
    timeZone: "UTC",
    supportedYears: { from: 2020, to: 2030 },
    dataVersion: "x",
    holidaysInYear: holes,
  };
  const calendar = createCalendar({ holidayProvider: provider as never });
  assert.equal(
    codeOf(() => calendar.isHoliday("2026-01-01")),
    "invalid-provider-data",
  );
  assert.equal(
    codeOf(() => calendar.holidaysInYear(2026)),
    "invalid-provider-data",
  );
  assert.deepEqual(
    diagnoseCalendar({ holidayProvider: provider }).map((d) => d.code),
    ["invalid-provider-data"],
  );
  assert.equal(
    codeOf(() =>
      withSubstituteDays(holes(2026) as never, { directions: { 6: "next" }, kind: "s" }),
    ),
    "invalid-argument",
  );
});

test("瞬間: Date の範囲を超える epochMilliseconds は out-of-range、文字列でない calendarId は invalid-input", () => {
  for (const ms of [1e20, -1e20, 8.64e15 + 1, 8.64e15, -8.64e15, Number.MAX_VALUE])
    assert.equal(
      codeOf(() => toDateString({ epochMilliseconds: ms }, "UTC")),
      "out-of-range",
      String(ms),
    );
  for (const calendarId of [Symbol("x"), 1, {}, "japanese"])
    assert.equal(
      codeOf(() => toDateString({ year: 2026, month: 1, day: 1, calendarId } as never, "UTC")),
      "invalid-input",
    );
});
