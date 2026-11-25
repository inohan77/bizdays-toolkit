import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
  type RecurringRule,
} from "../src/index.ts";
import { JP_NARROW as jp } from "./support/provider.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";

const brief = (
  issues: readonly { severity: string; code: string; path: string; relatedPath?: string }[],
) => issues.map((d) => [d.severity, d.code, d.path, d.relatedPath ?? ""]);

test("第 n 営業日: 月末最終営業日・第 n 営業日を、定休日・祝日・毎年の休業日を除いて数える", () => {
  const branch = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedAnnualDates: [{ from: "12-31", to: "01-03" }],
    closedRecurringRules: [
      { businessDayOfMonth: -1, name: "月末最終営業日は来店予約を停止" },
      { businessDayOfMonth: [1, 5], months: [1, 4, 7, 10], name: "四半期初の第 1・第 5 営業日" },
    ],
  });
  // October 31 is a Saturday, so the 30th is the last business day
  assert.deepEqual(branch.dayInfoOn("2026-10-30"), {
    date: "2026-10-30",
    weekday: 5,
    open: false,
    businessDay: false,
    reason: "closed-recurring",
    name: "月末最終営業日は来店予約を停止",
    optionPath: "closedRecurringRules[0]",
    rulePath: "closedRecurringRules[0]",
  });
  assert.equal(branch.isBusinessDay("2026-10-29"), true);
  // Closed from December 31, so the 30th is the last business day (annual closed days are not counted)
  assert.equal(branch.dayInfoOn("2026-12-30").reason, "closed-recurring");
  assert.equal(branch.isBusinessDay("2026-12-29"), true);
  // Start of a quarter: in January 2027 the 4th is the first business day (the 1st-3rd are closed) and the 8th
  // the fifth
  assert.equal(branch.dayInfoOn("2027-01-04").name, "四半期初の第 1・第 5 営業日");
  assert.equal(branch.dayInfoOn("2027-01-08").name, "四半期初の第 1・第 5 営業日");
  assert.equal(branch.isBusinessDay("2027-01-07"), true);
  assert.equal(branch.isBusinessDay("2026-02-02"), true, "months の外の第 1 営業日は営業");
  // Holidays are not counted: in May 2026 the 1st (Fri) is the first business day and the 7th (Thu) the second
  // (the 3rd-6th are holidays and a substitute)
  const may = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: 2 }],
  });
  assert.equal(may.isBusinessDay("2026-05-07"), false);
  assert.equal(may.isBusinessDay("2026-05-01"), true);
  // The methods return the actual business days after the rule is applied
  assert.equal(branch.lastBusinessDayOfMonth("2026-10"), "2026-10-29");
  assert.equal(branch.firstBusinessDayOfMonth("2027-01"), "2027-01-05");
  // -2 is the one before; when the last day of a 31-day month is a Monday, the last business day is the last
  // calendar day
  const prev = createCalendar({
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: -2 }],
  });
  assert.equal(
    prev.isBusinessDay("2026-08-28"),
    false,
    "8 月 31 日（月）が最終、28 日（金）がその前",
  );
  assert.equal(prev.isBusinessDay("2026-08-31"), true);
});

test("第 n 営業日: 数える基準は繰り返しの規則を除いた判定（自分自身・ほかの繰り返しの規則・臨時休業日の扱い）", () => {
  // Closed days written as weekday rules in closedRecurringRules are counted as business days (a limit; the
  // diagnostics report it)
  const byRule = createCalendar({
    closedRecurringRules: [
      { businessDayOfMonth: -1, name: "最終" },
      { weekday: 0 },
      { weekday: 6 },
    ],
  });
  assert.equal(byRule.dayInfoOn("2026-10-31").name, "最終", "土曜日の 31 日が基準の最終営業日");
  assert.equal(byRule.dayInfoOn("2026-10-31").reason, "closed-recurring");
  assert.equal(byRule.dayInfoOn("2026-10-30").reason, "default");
  // Extra closed days (closedDates) are not counted. Specific dates take priority over rules
  const closed = createCalendar({
    closedWeekdays: [0, 6],
    closedDates: ["2026-10-30"],
    closedRecurringRules: [{ businessDayOfMonth: -1, name: "最終" }],
  });
  assert.equal(closed.dayInfoOn("2026-10-29").name, "最終");
  assert.equal(closed.dayInfoOn("2026-10-30").reason, "closed-date");
  // Extra business days (openDates) are counted
  const open = createCalendar({
    closedWeekdays: [0, 6],
    openDates: ["2026-10-31"],
    closedRecurringRules: [{ businessDayOfMonth: -1, name: "最終" }],
  });
  assert.equal(open.dayInfoOn("2026-10-31").reason, "open-date", "個別の日付が優先");
  assert.equal(open.dayInfoOn("2026-10-30").reason, "default", "基準では 31 日が最終営業日");
  // With holidayPolicy: "open" holidays count as business days (an nth business day can be a holiday).
  // The holiday itself is handled by the holiday stage (holidayPolicy) and this rule does not apply (write
  // exceptions as holiday rules)
  const openHolidays = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: [1, 2], name: "第 1・2 営業日" }],
  });
  assert.equal(
    openHolidays.dayInfoOn("2026-01-01").reason,
    "holiday",
    "元日が第 1 営業日だが祝日の扱いが優先",
  );
  assert.equal(openHolidays.isBusinessDay("2026-01-01"), true);
  assert.equal(openHolidays.dayInfoOn("2026-01-02").name, "第 1・2 営業日", "2 日が第 2 営業日");
  assert.equal(openHolidays.isBusinessDay("2026-01-05"), true, "5 日は第 3 営業日");
  // "The first business day is closed even on a holiday" is written with "over-holiday" (judged before the
  // holiday stage)
  const over = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedWeekdays: [0, 6],
    closedRecurringRules: [
      { businessDayOfMonth: 1, holidayOverlapPolicy: "over-holiday", name: "棚卸" },
    ],
  });
  assert.equal(over.dayInfoOn("2026-01-01").name, "棚卸");
  assert.equal(over.dayInfoOn("2026-01-01").holiday?.key, "new-year", "holiday は付く");
  assert.equal(over.dayInfoOn("2026-02-02").name, "棚卸", "祝日でない月も同じ");
  // With holidayPolicy: "ignore" holidays follow the weekday and this rule applies too
  const ignore = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "ignore",
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: 1, name: "第 1 営業日" }],
  });
  assert.equal(ignore.dayInfoOn("2026-01-01").name, "第 1 営業日");
  // Effective periods and array order (the rule written first wins)
  const ordered = createCalendar({
    closedWeekdays: [0, 6],
    openRecurringRules: [
      { businessDayOfMonth: -1, name: "最終は営業", effectiveFrom: "2027-01-01" },
    ],
    closedRecurringRules: [{ businessDayOfMonth: -1, name: "最終は休業" }],
  });
  assert.equal(ordered.dayInfoOn("2026-10-30").name, "最終は休業");
  assert.equal(ordered.dayInfoOn("2027-01-29").name, "最終は営業", "openRecurringRules が優先");
});

test("第 n 営業日: スケジュールでは基準のカレンダーを calendar で指定する", () => {
  const branch = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const hours = createSchedule<string>({
    holidayProvider: jp,
    weekdayValues: ["closed", "full", "full", "full", "full", "full", "half"],
    recurringRules: [
      {
        businessDayOfMonth: -1,
        calendar: branch,
        value: "short",
        name: "月末最終営業日は締め作業で短縮",
      },
    ],
  });
  assert.deepEqual(hours.dayInfoOn("2026-10-30"), {
    date: "2026-10-30",
    weekday: 5,
    value: "short",
    reason: "recurring",
    name: "月末最終営業日は締め作業で短縮",
    optionPath: "recurringRules[0]",
    rulePath: "recurringRules[0]",
  });
  assert.equal(hours.valueOn("2026-10-29"), "full");
  // The basis is the actual business days of the calendar (after its rules are applied)
  const withRule = createCalendar({
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: -1 }],
  });
  const s2 = createSchedule<number>({
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    recurringRules: [{ businessDayOfMonth: -1, calendar: withRule, value: 9 }],
  });
  assert.equal(s2.valueOn("2026-10-29"), 9, "カレンダーでは 30 日が休業なので 29 日が最終営業日");
  assert.equal(s2.valueOn("2026-10-30"), 1);
  // The basis of a calendar made from a schedule may refer to another calendar (no cycle)
  const fromSchedule = createCalendarFromSchedule(hours, (v) => v !== "closed");
  assert.equal(fromSchedule.isBusinessDay("2026-10-30"), true);
  assert.equal(fromSchedule.dayInfoOn("2026-10-30").name, "月末最終営業日は締め作業で短縮");
  // It can be used in a combination too
  const combined = combineCalendars(
    [
      createCalendar({
        holidayProvider: jp,
        closedWeekdays: [0, 6],
        closedRecurringRules: [{ businessDayOfMonth: -1 }],
      }),
      branch,
    ],
    { open: "all" },
  );
  assert.equal(combined.isBusinessDay("2026-10-30"), false);
  assert.equal(combined.dayInfoOn("2026-10-30").decidedBy, 0);
});

test("第 n 営業日: 入力の誤り", () => {
  const branch = createCalendar({ holidayProvider: jp });
  const cases: [unknown, string, RegExp][] = [
    [
      { businessDayOfMonth: 0 },
      "invalid-option",
      /closedRecurringRules\[0\]\.businessDayOfMonth: must be 1-31/,
    ],
    [{ businessDayOfMonth: 32 }, "invalid-option", /closedRecurringRules\[0\]\.businessDayOfMonth/],
    [{ businessDayOfMonth: [] }, "invalid-option", /closedRecurringRules\[0\]\.businessDayOfMonth/],
    [
      { businessDayOfMonth: "last" },
      "invalid-option",
      /closedRecurringRules\[0\]\.businessDayOfMonth/,
    ],
    [
      { businessDayOfMonth: -1, holidayOverlapPolicy: "after-holiday" },
      "invalid-option",
      /closedRecurringRules\[0\]\.holidayOverlapPolicy: "after-holiday" cannot be used with "businessDayOfMonth"/,
    ],
    [
      { businessDayOfMonth: -1, holidayOverlapPolicy: "nearest" },
      "invalid-option",
      /closedRecurringRules\[0\]\.holidayOverlapPolicy/,
    ],
    [
      { businessDayOfMonth: -1, calendar: branch },
      "invalid-option",
      /closedRecurringRules\[0\]\.calendar: "calendar" cannot be used in a calendar/,
    ],
    [
      { weekday: 1, calendar: branch },
      "invalid-option",
      /closedRecurringRules\[0\]\.calendar: "calendar" can be used only with "businessDayOfMonth"/,
    ],
    [{ businessDayOfMonth: -1, dayOfMonth: 1 }, "invalid-option", /must have exactly one of/],
    [{ businessDayOfMonth: -1, nth: 1 }, "invalid-option", /closedRecurringRules\[0\]\.nth/],
    [
      { businessDayOfMonth: -1, weekdays: [1] },
      "invalid-option",
      /closedRecurringRules\[0\]\.weekdays/,
    ],
    [
      { businessDayOfMonth: -1, skipWeekdays: [6] },
      "invalid-option",
      /closedRecurringRules\[0\]\.skipWeekdays/,
    ],
  ];
  for (const [entry, code, message] of cases) {
    assert.throws(
      () => createCalendar({ holidayProvider: jp, closedRecurringRules: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === code && message.test(e.message),
      JSON.stringify(entry),
    );
  }
  // Schedule: calendar is required, must be a created calendar and must have the same time zone
  assert.throws(
    () =>
      createSchedule({
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        recurringRules: [{ businessDayOfMonth: 1, value: 2 } as never],
      }),
    (e: unknown) =>
      isBizdaysError(e) &&
      e.code === "invalid-option" &&
      /recurringRules\[0\]\.calendar: must be a calendar/.test(e.message),
  );
  assert.throws(
    () =>
      createSchedule({
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        recurringRules: [
          { businessDayOfMonth: 1, calendar: { isBusinessDay: 1 }, value: 2 } as never,
        ],
      }),
    (e: unknown) => isBizdaysError(e) && e.code === "invalid-option",
  );
  assert.throws(
    () =>
      createSchedule({
        timeZone: "UTC",
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        recurringRules: [{ businessDayOfMonth: 1, calendar: branch, value: 2 }],
      }),
    (e: unknown) =>
      isBizdaysError(e) &&
      e.code === "time-zone-conflict" &&
      /recurringRules\[0\]\.calendar/.test(e.message),
  );
  // The diagnostics return the same mistakes as errors
  assert.deepEqual(
    brief(diagnoseCalendar({ closedRecurringRules: [{ businessDayOfMonth: 0 }] })).map((x) =>
      x.slice(0, 3),
    ),
    [["error", "invalid-option", "closedRecurringRules[0].businessDayOfMonth"]],
  );
});

test("第 n 営業日: 診断（never-matches・counting-basis・shadowed・redundant）", () => {
  // No month has more than 23 business days (23 is the maximum with closed weekends), so the rule never matches
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidayProvider: jp,
        closedWeekdays: [0, 6],
        closedRecurringRules: [{ businessDayOfMonth: 24 }],
      }),
    ),
    [["warning", "never-matches", "closedRecurringRules[0]", ""]],
  );
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [0, 6],
        closedRecurringRules: [{ businessDayOfMonth: 23 }],
      }),
    ),
    [],
    "提供元がなくても判定する（2026 年 12 月は 23 営業日）",
  );
  // Options with closed days written as weekday rules get counting-basis (info)
  assert.deepEqual(
    brief(diagnoseCalendar({ closedRecurringRules: [{ weekday: 0 }, { businessDayOfMonth: -1 }] })),
    [["info", "counting-basis", "closedRecurringRules[1]", "closedRecurringRules[0]"]],
  );
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [0],
        closedRecurringRules: [{ weekday: 3, nth: 3 }, { businessDayOfMonth: -1 }],
      }),
    ),
    [],
    "第 n 曜日の規則は定休日ではないので知らせない",
  );
  // With holidayPolicy: "closed", "over-holiday" does not change the result (info)
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidayProvider: jp,
        closedRecurringRules: [{ businessDayOfMonth: 1, holidayOverlapPolicy: "over-holiday" }],
      }),
    ),
    [["info", "redundant", "closedRecurringRules[0].holidayOverlapPolicy", ""]],
  );
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidayProvider: jp,
        holidayPolicy: "open",
        closedRecurringRules: [{ businessDayOfMonth: 1, holidayOverlapPolicy: "over-holiday" }],
      }),
    ),
    [],
  );
  // shadowed between rules of the same shape (containment of n and months)
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [0, 6],
        closedRecurringRules: [
          { businessDayOfMonth: [-1, -2] },
          { businessDayOfMonth: -1, months: [3] },
          { businessDayOfMonth: 1 },
        ],
      }),
    ),
    [["warning", "shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"]],
  );
  // An overlap across kinds is redundant (no options make the last business day always the last calendar day)
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [0, 6],
        closedRecurringRules: [{ dayOfMonth: -1 }, { businessDayOfMonth: -1, months: [2] }],
      }),
    ),
    [],
  );
  // Schedule: a different basis calendar does not cover
  const a = createCalendar({ closedWeekdays: [0, 6] });
  const b = createCalendar({ closedWeekdays: [0] });
  assert.deepEqual(
    brief(
      diagnoseSchedule({
        weekdayValues: [0, 1, 1, 1, 1, 1, 0],
        recurringRules: [
          { businessDayOfMonth: -1, calendar: a, value: 2 },
          { businessDayOfMonth: -1, calendar: b, value: 3 },
          { businessDayOfMonth: -1, calendar: a, value: 4 },
        ],
      }),
    ),
    [["warning", "shadowed", "recurringRules[2]", "recurringRules[0]"]],
  );
});
