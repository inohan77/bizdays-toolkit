import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCalendar,
  createSchedule,
  isBizdaysError,
  type RecurringRule,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";

const brief = (options: object) =>
  diagnoseCalendar(options).map((d) => [d.severity, d.code, d.path, d.relatedPath ?? ""]);

test("祝日の翌日: 連休が明けた日だけに当てはまり、その日自身が祝日なら当てはまらない", () => {
  const library = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [{ dayAfterHoliday: true, name: "祝日の翌日休館" }],
  });
  // 2026-05-03〜05-06 は祝日（憲法記念日・みどりの日・こどもの日・振替休日）
  assert.deepEqual(
    ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"].map(
      (d) => library.dayInfo(d).reason,
    ),
    ["holiday", "holiday", "holiday", "closed-recurring", "regular"],
  );
  assert.deepEqual(library.dayInfo("2026-05-07"), {
    date: "2026-05-07",
    weekday: 4,
    businessDay: false,
    reason: "closed-recurring",
    name: "祝日の翌日休館",
    rulePath: "closedRecurring[0]",
  });
  // 2026-02-11（水・建国記念の日）の翌日
  assert.equal(library.isBusinessDay("2026-02-12"), false);
  assert.equal(library.isBusinessDay("2026-02-13"), true);
  // 元日の翌日（12-31 は祝日でない）
  assert.equal(library.isBusinessDay("2027-01-02"), false);
  assert.equal(library.isBusinessDay("2026-12-31"), true);
});

test("祝日の翌日: 配列の順番・holidayPolicy・months・有効期間と組み合わせる", () => {
  const rules: RecurringRule[] = [
    { weekday: 1, name: "月曜休館", onHolidayRule: "after-holiday" },
    { dayAfterHoliday: true, name: "祝日の翌日休館" },
  ];
  const library = createCalendar({ holidays: jp, holidayPolicy: "open", closedRecurring: rules });
  // 2026-11-23（月・勤労感謝の日）の翌日は、月曜の振替先でもあり祝日の翌日でもある。先に書いた規則が決める
  assert.deepEqual(library.dayInfo("2026-11-24"), {
    date: "2026-11-24",
    weekday: 2,
    businessDay: false,
    reason: "closed-recurring",
    name: "月曜休館",
    shiftedFrom: "2026-11-23",
    rulePath: "closedRecurring[0]",
  });
  const reversed = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [...rules].reverse(),
  });
  assert.equal(reversed.dayInfo("2026-11-24").name, "祝日の翌日休館");
  assert.equal(reversed.dayInfo("2026-11-24").shiftedFrom, undefined);

  // 祝日が休業（既定）でも、翌日の規則は提供元の祝日で判定する
  const closed = createCalendar({ holidays: jp, closedRecurring: [{ dayAfterHoliday: true }] });
  assert.equal(closed.dayInfo("2026-02-11").reason, "holiday");
  assert.equal(closed.dayInfo("2026-02-12").reason, "closed-recurring");

  const may = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [{ dayAfterHoliday: true, months: [5], effectiveTo: "2026-12-31" }],
  });
  assert.equal(may.isBusinessDay("2026-05-07"), false);
  assert.equal(may.isBusinessDay("2026-02-12"), true, "5 月以外");
  assert.equal(may.isBusinessDay("2027-05-06"), true, "有効期間の外");
});

test("祝日の翌日: スケジュールの値、対応年の始まり、提供元なし", () => {
  const hours = createSchedule({
    holidays: jp,
    weekly: ["10-17", "10-19", "10-19", "10-19", "10-19", "10-19", "10-17"],
    holiday: { sameAs: 0 },
    recurring: [{ dayAfterHoliday: true, value: "12-17", name: "連休明けは短縮" }],
  });
  assert.equal(hours.valueOn("2026-05-06"), "10-17");
  assert.equal(hours.dayInfo("2026-05-07").value, "12-17");
  assert.equal(hours.dayInfo("2026-05-07").reason, "recurring");
  // 対応年の始まり（1955-01-01）の前日は対応年の外だが、例外にならず祝日でないとみなす
  const edge = createCalendar({ holidays: jp, closedRecurring: [{ dayAfterHoliday: true }] });
  assert.equal(edge.isBusinessDay("1955-01-01"), false, "元日は祝日");
  assert.equal(edge.isBusinessDay("1955-01-02"), false, "元日の翌日");
  // 提供元がなければ、1 日も当てはまらない
  const none = createCalendar({ closedRecurring: [{ dayAfterHoliday: true }] });
  assert.equal(none.isBusinessDay("2027-01-02"), true);
});

test("祝日の翌日: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { dayAfterHoliday: true, onHolidayRule: "over-holiday" },
      /closedRecurring\[0\]\.onHolidayRule: cannot be used with "dayAfterHoliday"/,
    ],
    [{ dayAfterHoliday: false }, /closedRecurring\[0\]\.dayAfterHoliday: must be true/],
    [{ dayAfterHoliday: true, weekday: 1 }, /must have exactly one of/],
    [{ dayAfterHoliday: true, day: 1 }, /must have exactly one of/],
    [{ dayAfterHoliday: true, nth: 1 }, /closedRecurring\[0\]\.nth/],
    [
      { dayAfterHoliday: true, interval: 2, anchor: "2026-01-07" },
      /closedRecurring\[0\]\.interval/,
    ],
  ];
  for (const [entry, message] of cases) {
    assert.throws(
      () => createCalendar({ holidays: jp, closedRecurring: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-option" && message.test(e.message),
      JSON.stringify(entry),
    );
  }
});

test("祝日の翌日: 診断（never-matches・shadowed・redundant）", () => {
  assert.deepEqual(brief({ closedRecurring: [{ dayAfterHoliday: true }] }), [
    ["warning", "never-matches", "closedRecurring[0]", ""],
  ]);
  assert.deepEqual(
    brief({
      holidays: jp,
      closedRecurring: [
        { dayAfterHoliday: true },
        { dayAfterHoliday: true, months: [5] },
        {
          dayAfterHoliday: true,
          months: [6],
          effectiveFrom: "2027-01-01",
          effectiveTo: "2027-12-31",
        },
      ],
    }),
    [
      ["warning", "shadowed", "closedRecurring[1]", "closedRecurring[0]"],
      ["warning", "never-matches", "closedRecurring[2]", ""],
    ],
    "月の絞り込みで覆われる。2027 年 6 月に祝日の翌日はない",
  );
  assert.deepEqual(
    brief({
      holidays: jp,
      closedRecurring: [{ dayAfterHoliday: true, months: [5] }, { dayAfterHoliday: true }],
    }),
    [["info", "redundant", "closedRecurring[0]", ""]],
    "後の規則のほうが広いので、先の規則は覆われないが取り除いても変わらない",
  );
  // 曜日の規則とは shadowed で比べない（祝日次第で年ごとに変わる）が、取り除いて変わらなければ redundant
  assert.deepEqual(
    brief({
      holidays: jp,
      closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
      closedRecurring: [{ dayAfterHoliday: true }],
    }).filter((d) => d[1] !== "no-business-day"),
    [["info", "redundant", "closedRecurring[0]", ""]],
  );
});
