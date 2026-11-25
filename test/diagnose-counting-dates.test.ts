/**
 * The diagnostics of options with an nth-business-day rule counting on the own options and specific dates, and
 * the conditions of redundant with unconfirmedHolidayPolicy: "throw" and of counting-basis (the mistakes fixed in
 * 0.32.8). Specific dates change the count (one extra closed day shifts the nth business day of its month and
 * week. decisions.md #16), so the diagnostics examine the scan range (2001-2028 without a provider) without
 * specific dates and, in addition, the months and weeks at both ends of each specific date with the dates, also
 * outside the scan range (decisions.md #31).
 * Every test checks the diagnostics' items and, with the judgement, what the items claim (removal changes
 * nothing / changes something; there are business days)
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, type CalendarOptions } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { england } from "../src/uk/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";

type Obj = Record<string, unknown>;

/** The items of the diagnostics (severity, code, path) */
const items = (list: readonly { severity: string; code: string; path: string }[]): string[] =>
  list.map((d) => `${d.severity} ${d.code} ${d.path}`.trim());
const diagnosed = (o: Obj): string[] => items(diagnoseCalendar(o as CalendarOptions));
/** The judgement (the error code when it throws) */
const at = (o: Obj, date: string): string => {
  try {
    return String(createCalendar(o as CalendarOptions).isBusinessDay(date));
  } catch (e) {
    return `throws ${(e as { code?: string }).code}`;
  }
};
/** The options without the i-th element of the array `key` */
const drop = (o: Obj, key: string, i: number): Obj => ({
  ...o,
  [key]: (o[key] as unknown[]).filter((_, k) => k !== i),
});
const COUNT_ALL_BUT_FIRST = { businessDayOfMonth: Array.from({ length: 30 }, (_, i) => i + 2) };
const WEEK_RULES = [{ weekday: 6 }, { businessDayOfWeek: 6, weekStart: 1 }];

test("0.32.8 P7: 数える規則と臨時休業日のある設定に営業日があれば、no-business-day を出さない（日付のない設定・全曜日を閉じた設定には出す）", () => {
  // Closes the 1st, and the 2nd to 31st business days. With 2026-01-01 as an extra closed day, the 2nd becomes
  // the first business day of January and stays a business day
  const options = { closedRecurringRules: [{ dayOfMonth: 1 }, COUNT_ALL_BUT_FIRST] };
  const withDate = { ...options, closedDates: ["2026-01-01"] };
  assert.equal(at(withDate, "2026-01-02"), "true");
  assert.deepEqual(diagnosed(withDate), []);
  // The same options without the extra closed day really have no business day
  assert.deepEqual(diagnosed(options), ["warning no-business-day"]);
  // Options closing every weekday have no business day even with a counting rule and an extra closed day (a
  // correct item is not lost)
  const allClosed = {
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    closedRecurringRules: [{ businessDayOfMonth: 1 }],
    closedDates: ["2029-03-05", { from: "2040-01-10", to: "2040-02-20" }],
  };
  assert.ok(diagnosed(allClosed).includes("warning no-business-day"), diagnosed(allClosed).join());
});

test("0.32.8 P7: 規則が残した月を個別の日付がすべて閉じる設定には、今までどおり no-business-day を出さない（出る設定を増やさない）", () => {
  // The rule closes everything but the last business day of January 2026, and extra closed days close that
  // month. There is no business day, but 0.32.7 did not report it either (specific dates closing every business
  // day are handled in 0.33.0)
  const all = Array.from({ length: 31 }, (_, i) => i + 1);
  const options = {
    closedWeekdays: [],
    closedRecurringRules: [
      { dayOfMonth: all, effectiveTo: "2025-12-31" },
      { dayOfMonth: all, effectiveFrom: "2026-02-01" },
      { businessDayOfMonth: -1 },
    ],
    closedDates: [{ from: "2026-01-01", to: "2026-01-31" }],
  };
  assert.deepEqual(diagnosed(options), ["info redundant closedRecurringRules[2]"]);
});

test("0.32.8 P8: 走査の範囲の外の臨時営業日の月で決める数える規則に、never-matches を出さない（月の形・週の形）", () => {
  // With the Saturdays of January 2050 as extra business days, only that month has 26 business days and the rule
  // closes 2050-01-31
  const month = {
    closedWeekdays: [0, 6],
    openDates: ["2050-01-01", "2050-01-08", "2050-01-15", "2050-01-22", "2050-01-29"],
    closedRecurringRules: [{ businessDayOfMonth: 26 }],
  };
  assert.equal(
    `${at(month, "2050-01-31")} / ${at(drop(month, "closedRecurringRules", 0), "2050-01-31")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(month), []);
  // The same with the extra business days inside the scan range (2026)
  assert.deepEqual(
    diagnosed({
      ...month,
      openDates: ["2026-01-03", "2026-01-10", "2026-01-17", "2026-01-24", "2026-01-31"],
    }),
    [],
  );
  // The week form: opening 2045-03-05, one of the closed Sundays, gives only that week (starting on Sunday) 6
  // business days, and the rule closes its Friday (2045-03-10)
  const week = {
    closedWeekdays: [0, 6],
    openDates: ["2045-03-05"],
    closedRecurringRules: [{ businessDayOfWeek: 6, weekStart: 0 }],
  };
  assert.equal(
    `${at(week, "2045-03-10")} / ${at(drop(week, "closedRecurringRules", 0), "2045-03-10")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(week), []);
});

test("0.32.8 P9: 走査の範囲の外（2029 年・2000 年以前）の臨時休業日の月・週で決める規則に、redundant を出さない（週の形・月の形）", () => {
  // The week form: in a week with an extra closed day the sixth business day moves to Sunday, and only the
  // Saturday rule closes the Saturday of that week
  for (const [date, saturday] of [
    ["2029-05-08", "2029-05-12"],
    ["1999-05-11", "1999-05-15"],
  ] as const) {
    const week = { closedWeekdays: [], closedRecurringRules: WEEK_RULES, closedDates: [date] };
    assert.equal(
      `${at(week, saturday)} / ${at(drop(week, "closedRecurringRules", 0), saturday)}`,
      "false / true",
      date,
    );
    assert.deepEqual(diagnosed(week), ["info counting-basis closedRecurringRules[1]"], date);
  }
  // Options with the date inside the scan range (2028) and options without a date behave as before
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [],
      closedRecurringRules: WEEK_RULES,
      closedDates: ["2028-05-09"],
    }),
    ["info counting-basis closedRecurringRules[1]"],
  );
  assert.deepEqual(diagnosed({ closedWeekdays: [], closedRecurringRules: WEEK_RULES }), [
    "info counting-basis closedRecurringRules[1]",
    "info redundant closedRecurringRules[0]",
  ]);
  // The month form: closing 2042-05-01 moves the second business day to May 3, and only the rule of the 2nd
  // closes May 2
  const month = {
    closedWeekdays: [],
    closedRecurringRules: [{ dayOfMonth: 2 }, { businessDayOfMonth: 2 }],
    closedDates: ["2042-05-01"],
  };
  assert.equal(
    `${at(month, "2042-05-02")} / ${at(drop(month, "closedRecurringRules", 0), "2042-05-02")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(month), []);
});

test("0.32.8 P9: 日付の期間の終わりの月（始まりと違う月）で決める規則に、redundant を出さない", () => {
  const options = {
    closedWeekdays: [],
    closedRecurringRules: [{ dayOfMonth: 2 }, { businessDayOfMonth: 2 }],
    closedDates: [{ from: "2042-03-10", to: "2042-05-01" }],
  };
  assert.equal(
    `${at(options, "2042-05-02")} / ${at(drop(options, "closedRecurringRules", 0), "2042-05-02")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(options), []);
});

test("0.32.8 P9: 日付の月をまたぐ端の週（翌月の初めの日）で決める規則に、redundant を出さない", () => {
  // Closing 2029-04-30 (Mon) moves the sixth business day of that week (to Saturday, May 5) to Sunday
  const options = {
    closedWeekdays: [],
    closedRecurringRules: WEEK_RULES,
    closedDates: ["2029-04-30"],
  };
  assert.equal(
    `${at(options, "2029-05-05")} / ${at(drop(options, "closedRecurringRules", 0), "2029-05-05")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(options), ["info counting-basis closedRecurringRules[1]"]);
});

test("0.32.8 P9: 診断の範囲に日のない日付と並べても、走査の範囲の外の日付の週で決める規則に redundant を出さない", () => {
  const options = {
    closedWeekdays: [],
    closedRecurringRules: WEEK_RULES,
    closedDates: ["2029-05-08", { from: "2300-01-01", to: "2600-01-01" }],
  };
  assert.equal(
    `${at(options, "2029-05-12")} / ${at(drop(options, "closedRecurringRules", 0), "2029-05-12")}`,
    "false / true",
  );
  // The date of 2300-2600 has no day in the diagnostic range: it is not examined and gets out-of-range
  assert.deepEqual(diagnosed(options), [
    "warning out-of-range closedDates[1]",
    "info counting-basis closedRecurringRules[1]",
  ]);
});

test("0.32.8 P11: 走査の範囲を覆う長い臨時休業日の外の年で決める規則を、使われないと出さない（数える規則のない設定と同じ）", () => {
  // Options closing 2000-2030. Up to 1999 and from 2031 the rule decides the judgement
  const options = {
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: -1 }],
    closedDates: [{ from: "2000-01-01", to: "2030-12-31" }],
  };
  assert.equal(
    `${at(options, "1999-06-01")} / ${at(drop(options, "closedRecurringRules", 0), "1999-06-01")}`,
    "false / true",
  );
  assert.equal(
    `${at(options, "2031-06-30")} / ${at(drop(options, "closedRecurringRules", 1), "2031-06-30")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(options), []);
  // The same options without a counting rule report nothing either
  assert.deepEqual(diagnosed({ ...options, closedRecurringRules: [{ dayOfMonth: 1 }] }), []);
});

test("0.32.8 P11: 開業の前（1000-01-01 から）・9999 年までの長い臨時休業日でも、日付の外の年で決める規則を使われないと出さない", () => {
  const rules = {
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: -1 }],
  };
  for (const [range, day] of [
    [{ from: "1000-01-01", to: "2029-03-31" }, "2029-05-01"],
    [{ from: "2000-01-01", to: "9999-12-31" }, "1999-06-01"],
  ] as const) {
    const options = { ...rules, closedDates: [range] };
    assert.equal(
      `${at(options, day)} / ${at(drop(options, "closedRecurringRules", 0), day)}`,
      "false / true",
      JSON.stringify(range),
    );
    assert.deepEqual(diagnosed(options), [], JSON.stringify(range));
  }
});

test("0.32.8 P11: 長い臨時営業日の内側の月でだけ当てはまる数える規則は、never-matches ではなく redundant（使われない）", () => {
  // Every weekday is closed, and 2026-09-10 to 2276-06-15 are extra business days. A 22nd business day exists
  // only in months inside the extra business days, where the extra business days decide, so the rule has
  // matching days but is never used
  const options = {
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    openDates: [{ from: "2026-09-10", to: "2276-06-15" }],
    closedRecurringRules: [{ dayOfMonth: 2 }, { businessDayOfMonth: 22 }],
  };
  assert.deepEqual(diagnosed(options), [
    "info redundant closedRecurringRules[0]",
    "info redundant closedRecurringRules[1]",
  ]);
  const found = diagnoseCalendar(options as CalendarOptions).find(
    (d) => d.path === "closedRecurringRules[1]",
  );
  assert.match(found!.message, /never used: other rules decide every day it matches/);
});

test('0.32.8 P10: unconfirmedHolidayPolicy: "throw" で、取り除くと未確定の祝日で例外になる日ができる規則を redundant にしない（日本・英国。"accept" では出る）', () => {
  for (const [provider, day] of [
    [jp, "2028-09-23"],
    [england, "2029-03-31"],
  ] as const) {
    const options = {
      holidayProvider: provider,
      unconfirmedHolidayPolicy: "throw",
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ weekday: 6 }, { weekday: 1, holidayOverlapPolicy: "after-holiday" }],
    };
    assert.equal(
      `${at(options, day)} / ${at(drop(options, "closedRecurringRules", 0), day)}`,
      "false / throws unconfirmed-holiday",
      provider.id,
    );
    assert.deepEqual(diagnosed(options), [], provider.id);
    assert.deepEqual(
      diagnosed({ ...options, unconfirmedHolidayPolicy: "accept" }),
      ["info redundant closedRecurringRules[0]"],
      provider.id,
    );
  }
  // A rule whose removal does not throw (closing Sundays, with the UK provider) is reported as before with
  // "throw" too
  assert.deepEqual(
    diagnosed({
      holidayProvider: england,
      unconfirmedHolidayPolicy: "throw",
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ weekday: 0 }, { weekday: 1, holidayOverlapPolicy: "after-holiday" }],
    }),
    ["info redundant closedRecurringRules[0]"],
  );
});

test('0.32.8 P10: スケジュールでも、unconfirmedHolidayPolicy: "throw" で取り除くと例外になる日ができる規則を redundant にしない', () => {
  const options = {
    holidayProvider: jp,
    unconfirmedHolidayPolicy: "throw",
    weekdayValues: [null, "a", "a", "a", "a", "a", null],
    recurringRules: [
      { weekday: 6, value: null },
      { weekday: 1, holidayOverlapPolicy: "after-holiday", value: "b" },
    ],
  } as const;
  const valueAt = (o: Obj): string => {
    try {
      return JSON.stringify(createSchedule(o as never).valueOn("2028-09-23"));
    } catch (e) {
      return `throws ${(e as { code?: string }).code}`;
    }
  };
  assert.equal(
    `${valueAt(options)} / ${valueAt(drop(options, "recurringRules", 0))}`,
    "null / throws unconfirmed-holiday",
  );
  assert.deepEqual(items(diagnoseSchedule(options)), []);
  assert.deepEqual(items(diagnoseSchedule({ ...options, unconfirmedHolidayPolicy: "accept" })), [
    "info redundant recurringRules[0]",
  ]);
});

test("0.32.8 K6: 定休日の扱いを変えない毎週の曜日の規則に counting-basis を出さない（変える規則には出す）", () => {
  // When Monday is a closed weekday, a rule closing Mondays does not affect the count (the rule is redundant)
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [1],
      closedRecurringRules: [{ weekday: 1 }, { businessDayOfMonth: 3 }],
    }),
    ["info redundant closedRecurringRules[0]"],
  );
  // When Monday is not a closed weekday, a rule opening Mondays does not affect the count
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [0],
      openRecurringRules: [{ weekday: 1 }],
      closedRecurringRules: [{ businessDayOfMonth: 3 }],
    }),
    [],
  );
  // A rule closing a weekday that is not closed, and a rule opening a closed weekday, affect the count and are
  // reported
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [0],
      closedRecurringRules: [{ weekday: 1 }, { businessDayOfMonth: 3 }],
    }),
    ["info counting-basis closedRecurringRules[1]"],
  );
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [0],
      openRecurringRules: [{ weekday: 0 }],
      closedRecurringRules: [{ businessDayOfMonth: 3 }],
    }),
    ["info counting-basis closedRecurringRules[0]"],
  );
});
