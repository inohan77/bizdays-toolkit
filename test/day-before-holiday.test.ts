import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCalendar,
  createSchedule,
  isBizdaysError,
  type RecurringRule,
} from "../src/index.ts";
import { JP_NARROW as jp } from "./support/provider.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";

const brief = (options: object) =>
  diagnoseCalendar(options).map((d) => [d.severity, d.code, d.path, d.relatedPath ?? ""]);

test("祝前日: 翌日が祝日でその日自身は祝日でない日だけに当てはまる（連休の初日の前日）", () => {
  const eve = createSchedule<string>({
    holidayProvider: jp,
    weekdayValues: ["normal", "normal", "normal", "normal", "normal", "normal", "normal"],
    holidayPolicy: { value: "holiday" },
    recurringRules: [{ dayBeforeHoliday: true, value: "eve", name: "祝前日料金" }],
  });
  // 2026-04-29 (Showa Day), 05-03 to 05-06 (Constitution Memorial Day, Greenery Day, Children's Day, a
  // substitute)
  assert.deepEqual(
    ["2026-04-28", "2026-04-29", "2026-04-30", "2026-05-01", "2026-05-02", "2026-05-03"].map((d) =>
      eve.valueOn(d),
    ),
    ["eve", "holiday", "normal", "normal", "eve", "holiday"],
    "連休の中の日（05-04・05-05）は祝日なので当てはまらず、連休の前日は 05-02 だけ",
  );
  assert.deepEqual(eve.dayInfoOn("2026-05-02"), {
    date: "2026-05-02",
    weekday: 6,
    value: "eve",
    reason: "recurring",
    name: "祝前日料金",
    optionPath: "recurringRules[0]",
    rulePath: "recurringRules[0]",
  });
  // The day before New Year's Day (12-31 is not a holiday)
  assert.equal(eve.valueOn("2026-12-31"), "eve");
  // Day after and day before a holiday are a pair (2026-05-07 is the day after a holiday, not the day before one)
  const both = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedRecurringRules: [
      { dayBeforeHoliday: true, name: "祝前日" },
      { dayAfterHoliday: true, name: "祝日の翌日" },
    ],
  });
  assert.equal(both.dayInfoOn("2026-05-02").name, "祝前日");
  assert.equal(both.dayInfoOn("2026-05-07").name, "祝日の翌日");
  assert.equal(both.isBusinessDay("2026-05-08"), true);
});

test("祝前日: 曜日・月の絞り込み、有効期間、配列の順番", () => {
  // "Open until late on the day before a holiday (as usual when that day is on a weekend)"
  const weekdaysOnly = createSchedule<string>({
    holidayProvider: jp,
    weekdayValues: ["-20", "-20", "-20", "-20", "-20", "-20", "-20"],
    recurringRules: [{ dayBeforeHoliday: true, weekdays: [1, 2, 3, 4, 5], value: "-26" }],
  });
  assert.equal(weekdaysOnly.valueOn("2026-11-02"), "-26", "11-03（文化の日）の前日の月曜");
  assert.equal(
    weekdaysOnly.valueOn("2026-11-22"),
    "-20",
    "11-23（勤労感謝の日）の前日の日曜は除く",
  );
  const may = createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ dayBeforeHoliday: true, months: [5], effectiveTo: "2026-12-31" }],
  });
  assert.equal(may.isBusinessDay("2026-05-02"), false);
  assert.equal(may.isBusinessDay("2026-04-28"), true, "5 月以外");
  assert.equal(may.isBusinessDay("2027-05-02"), true, "有効期間の外");
  // In a year with one day between two holidays, that day is both the day after and the day before a holiday.
  // The rule written first decides.
  // 2027-09-20 (Mon, Respect for the Aged Day) and 2027-09-23 (Thu, Autumnal Equinox Day): 09-21 is only a day
  // after, 09-22 only a day before
  const rules: RecurringRule[] = [
    { dayAfterHoliday: true, name: "翌日" },
    { dayBeforeHoliday: true, name: "前日" },
  ];
  const sep = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedRecurringRules: rules,
  });
  assert.equal(sep.dayInfoOn("2027-09-21").name, "翌日");
  assert.equal(sep.dayInfoOn("2027-09-22").name, "前日");
  // 2026-09-21 (Respect for the Aged Day), 09-22 (citizens' holiday) and 09-23 (Autumnal Equinox Day) are a run,
  // and 09-20 (Sun) is the day before it
  assert.equal(sep.dayInfoOn("2026-09-20").name, "前日");
  assert.equal(sep.dayInfoOn("2026-09-22").reason, "holiday", "連休の中の日は祝日");
});

test("祝前日: 締め時刻の繰り上げ、対応年の終わり、提供元なし", () => {
  // "Same-day shipping is accepted until 12:00 on the day before a holiday": the cutoff time is a schedule value
  // passed to cutoff
  const shipping = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const cutoffs = createSchedule<string>({
    holidayProvider: jp,
    weekdayValues: ["14:00", "14:00", "14:00", "14:00", "14:00", "14:00", "14:00"],
    recurringRules: [{ dayBeforeHoliday: true, value: "12:00" }],
  });
  const at = (iso: string) => {
    const { date } = shipping.civilOf(iso);
    return shipping.businessDayOnOrAfter(iso, { cutoff: cutoffs.valueOn(date) });
  };
  assert.equal(at("2026-11-02T11:30"), "2026-11-02", "祝前日の 12:00 前は当日");
  assert.equal(at("2026-11-02T13:00"), "2026-11-04", "祝前日の 12:00 後は翌営業日（11-03 は祝日）");
  assert.equal(at("2026-11-04T13:00"), "2026-11-04", "通常の日は 14:00 まで当日");
  // The day before a holiday on the last supported day is out-of-range, because the holiday of the next day
  // (outside the supported years) is unknown (0.30.0; with outOfRangePolicy: "ignore" the outside has no holidays)
  const edge = createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ dayBeforeHoliday: true }],
  });
  assert.throws(
    () => edge.isBusinessDay(`${jp.supportedYears.to}-12-31`),
    (e: Error & { code?: string }) => e.code === "out-of-range",
  );
  assert.equal(edge.isBusinessDay(`${jp.supportedYears.to - 1}-12-31`), false, "元日の前日");
  const ignore = createCalendar({
    holidayProvider: jp,
    outOfRangePolicy: "ignore",
    closedRecurringRules: [{ dayBeforeHoliday: true }],
  });
  assert.equal(ignore.isBusinessDay(`${jp.supportedYears.to}-12-31`), true);
  // Without a provider no day matches
  const none = createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true }] });
  assert.equal(none.isBusinessDay("2026-12-31"), true);
});

test("祝前日: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { dayBeforeHoliday: true, holidayOverlapPolicy: "over-holiday" },
      /closedRecurringRules\[0\]\.holidayOverlapPolicy: cannot be used with "dayBeforeHoliday"/,
    ],
    [{ dayBeforeHoliday: false }, /closedRecurringRules\[0\]\.dayBeforeHoliday: must be true/],
    [{ dayBeforeHoliday: true, weekday: 1 }, /must have exactly one of/],
    [{ dayBeforeHoliday: true, dayOfMonth: 1 }, /must have exactly one of/],
    [{ dayBeforeHoliday: true, dayAfterHoliday: true }, /must have exactly one of/],
    [{ dayBeforeHoliday: true, holiday: true }, /must have exactly one of/],
    [{ dayBeforeHoliday: true, nth: 1 }, /closedRecurringRules\[0\]\.nth/],
    [{ dayBeforeHoliday: true, kinds: "regular" }, /closedRecurringRules\[0\]\.kinds/],
    [{ dayBeforeHoliday: true, keys: ["Bad Key"] }, /closedRecurringRules\[0\]\.keys/],
    [
      { dayBeforeHoliday: true, skipWeekdays: [0, 1, 2, 3, 4, 5, 6] },
      /closedRecurringRules\[0\]\.skipWeekdays: cannot include every weekday/,
    ],
    [
      { dayBeforeHoliday: true, interval: 2, anchor: "2026-01-07" },
      /closedRecurringRules\[0\]\.interval/,
    ],
  ];
  for (const [entry, message] of cases) {
    assert.throws(
      () => createCalendar({ holidayProvider: jp, closedRecurringRules: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-option" && message.test(e.message),
      JSON.stringify(entry),
    );
  }
});

test("祝前日: 診断（never-matches・shadowed・redundant）。祝日の翌日とは同じ形として比べない", () => {
  assert.deepEqual(brief({ closedRecurringRules: [{ dayBeforeHoliday: true }] }), [
    ["warning", "never-matches", "closedRecurringRules[0]", ""],
  ]);
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      closedRecurringRules: [
        { dayBeforeHoliday: true },
        { dayBeforeHoliday: true, months: [5], weekdays: [6] },
        {
          dayBeforeHoliday: true,
          months: [6],
          effectiveFrom: "2027-01-01",
          effectiveTo: "2027-12-31",
        },
      ],
    }),
    [
      ["warning", "shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"],
      ["warning", "never-matches", "closedRecurringRules[2]", ""],
    ],
    "曜日・月の絞り込みで覆われる。2027 年 6 月に祝前日はない",
  );
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      closedRecurringRules: [{ dayBeforeHoliday: true }, { dayAfterHoliday: true }],
    }),
    [],
    "祝前日と祝日の翌日は別の形で、互いに覆わない",
  );
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
      closedRecurringRules: [{ dayBeforeHoliday: true }],
    }).filter((d) => d[1] !== "no-business-day"),
    [["info", "redundant", "closedRecurringRules[0]", ""]],
  );
});
