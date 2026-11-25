import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, isBizdaysError, type CalendarOptions } from "../src/index.ts";
import { SHORT_PROVIDER } from "./support/provider.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";

const brief = (list: readonly { severity: string; code: string; path: string }[]) =>
  list.map((d) => [d.severity, d.code, d.path]);

// expired follows from comparing day numbers alone and looks up no holiday (decisions.md #30), so it is checked
// with the short provider (2025-2027)
const options = {
  holidayProvider: SHORT_PROVIDER,
  closedWeekdays: [0, 6],
  closedRecurringRules: [
    { weekday: 1, name: "月曜定休", effectiveTo: "2027-03-31" },
    { weekday: 2, name: "火曜定休", effectiveFrom: "2027-04-01" },
  ],
  closedAnnualDates: [
    { from: "08-13", to: "08-16", effectiveTo: "2026-12-31" },
    { from: "12-29", to: "01-03" },
  ],
  closedDates: [
    "2025-11-28",
    { from: "2026-07-13", to: "2026-07-16", name: "臨時休業" },
    "2027-11-29",
  ],
  openDates: ["2026-07-15"],
};

test("asOf: 基準日より前に終わった規則・日付が info の expired になる。省略時の結果は変わらない", () => {
  assert.deepEqual(brief(diagnoseCalendar(options)), [], "asOf なし");
  assert.deepEqual(brief(diagnoseCalendar(options, {})), [], "空のオプション");
  // The order is the priority of the judgement (openDates → closedDates → closedAnnualDates →
  // closedRecurringRules)
  assert.deepEqual(brief(diagnoseCalendar(options, { asOf: "2027-10-23" })), [
    ["info", "expired", "openDates[0]"],
    ["info", "expired", "closedDates[0]"],
    ["info", "expired", "closedDates[1]"],
    ["info", "expired", "closedAnnualDates[0]"],
    ["info", "expired", "closedRecurringRules[0]"],
  ]);
  // A last day equal to the reference date is not expired (effective through that day)
  assert.deepEqual(brief(diagnoseCalendar(options, { asOf: "2026-12-31" })), [
    ["info", "expired", "openDates[0]"],
    ["info", "expired", "closedDates[0]"],
    ["info", "expired", "closedDates[1]"],
  ]);
  const d = diagnoseCalendar(options, { asOf: "2027-10-23" }).find(
    (x) => x.path === "closedRecurringRules[0]",
  )!;
  assert.match(d.message, /2027-03-31/);
  assert.match(d.message, /2027-10-23/);
});

test("asOf: スケジュールでも同じ。redundant などとは独立に返す", () => {
  const schedule = {
    holidayProvider: SHORT_PROVIDER,
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    dates: [{ date: "2026-01-02", value: 0 }],
    annualDates: [{ from: "08-13", to: "08-16", value: 0, effectiveTo: "2026-12-31" }],
    recurringRules: [{ weekday: 1, value: 2, effectiveTo: "2026-06-30" }],
  };
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2027-01-01" })), [
    ["info", "expired", "dates[0]"],
    ["info", "expired", "annualDates[0]"],
    ["info", "expired", "recurringRules[0]"],
  ]);
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2026-01-01" })), []);
});

test("asOf: 対応年の外の基準日でも例外にならず（祝日を引かない）、知らないキーは無視、誤りは例外", () => {
  assert.deepEqual(
    brief(
      diagnoseCalendar(
        { holidayProvider: SHORT_PROVIDER, closedDates: ["2026-01-02"] },
        { asOf: "2200-01-01" },
      ),
    ),
    [["info", "expired", "closedDates[0]"]],
  );
  assert.deepEqual(
    brief(diagnoseCalendar({}, { asOf: "2026-10-23", future: true } as object)),
    [],
    "知らないキーは無視",
  );
  const cases: [unknown, string][] = [
    ["2026-10-23", "invalid-argument"],
    [null, "invalid-argument"],
    [[1], "invalid-argument"],
    [{ asOf: 20261023 }, "invalid-date"],
    [{ asOf: "2026-13-01" }, "invalid-date"],
    [{ asOf: new Date() }, "invalid-date"],
    [{ asOf: "2026-10-23T10:00" }, "invalid-date"],
  ];
  for (const [arg, code] of cases) {
    assert.throws(
      () => diagnoseCalendar({}, arg as never),
      (e: unknown) => isBizdaysError(e) && e.code === code,
      JSON.stringify(arg),
    );
  }
  // A mistake in the options is a diagnostic result, not an error (the handling differs)
  assert.equal(diagnoseCalendar("not an object" as never)[0]?.code, "invalid-option");
});

test('asOf: "after-holiday" の規則は、振替先が終わりの日の後に残るので、終わりから 31 日を過ぎるまで expired にしない', () => {
  // Mondays closed, ending on July 20 (Marine Day), moves to the 21st (the effective period is judged on the
  // original day. decisions.md #13)
  const shifted = {
    holidayProvider: SHORT_PROVIDER,
    closedRecurringRules: [
      {
        weekday: 1 as const,
        holidayOverlapPolicy: "after-holiday" as const,
        effectiveTo: "2026-07-20",
        name: "Mon",
      },
    ],
  };
  const info = createCalendar(shifted).dayInfoOn("2026-07-21");
  assert.equal(info.open, false);
  assert.equal(info.shiftedFrom, "2026-07-20");
  for (const asOf of ["2026-07-21", "2026-08-20"])
    assert.deepEqual(brief(diagnoseCalendar(shifted, { asOf })), [], asOf);
  // expired once 31 days (the farthest a move can reach) have passed. The last day in the message stays
  // effectiveTo
  const d = diagnoseCalendar(shifted, { asOf: "2026-08-21" });
  assert.deepEqual(brief(d), [["info", "expired", "closedRecurringRules[0]"]]);
  assert.match(d[0]!.message, /ended on 2026-07-20/);
  // A rule without a move is expired from the day after its last day, as before
  const plain = {
    ...shifted,
    closedRecurringRules: [{ weekday: 1 as const, effectiveTo: "2026-07-20", name: "Mon" }],
  };
  assert.deepEqual(brief(diagnoseCalendar(plain, { asOf: "2026-07-21" })), [
    ["info", "expired", "closedRecurringRules[0]"],
  ]);
  // The same for a rule of a schedule
  const schedule = {
    holidayProvider: SHORT_PROVIDER,
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    recurringRules: [
      {
        weekday: 1 as const,
        holidayOverlapPolicy: "after-holiday" as const,
        effectiveTo: "2026-07-20",
        value: 0,
      },
    ],
  };
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2026-07-21" })), []);
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2026-08-21" })), [
    ["info", "expired", "recurringRules[0]"],
  ]);
});

test("asOf: 終わりのない設定には、どの基準日でも expired を出さない", () => {
  // The expired test of the oracle skips the diagnostics of options without an item ending before the reference
  // date, so it is checked here
  const endless = {
    holidayProvider: SHORT_PROVIDER,
    closedWeekdays: [0, 6],
    closedRecurringRules: [
      { weekday: 1 as const, holidayOverlapPolicy: "after-holiday" as const },
      { dayOfMonth: 15, effectiveFrom: "2026-01-01" },
    ],
    closedAnnualDates: ["12-31", { from: "08-13", to: "08-16" }],
  };
  for (const asOf of ["1955-01-01", "2026-07-21", "2099-12-31", "2200-01-01"])
    assert.deepEqual(
      brief(diagnoseCalendar(endless, { asOf })).filter(([, code]) => code === "expired"),
      [],
      asOf,
    );
});

test("asOf: 第 n 営業日を数える規則があれば、日付は数え方を変えるので、その月・週を過ぎるまで expired にしない", () => {
  // Closing July 20 (a Monday) moves the first business day of that week to the 21st (the counting basis is the
  // options without recurring rules. decisions.md #16)
  const week: CalendarOptions = {
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfWeek: [1], weekStart: 1 }],
    closedDates: ["2026-07-20"],
  };
  assert.equal(createCalendar(week).isBusinessDay("2026-07-21"), false);
  assert.equal(createCalendar({ ...week, closedDates: [] }).isBusinessDay("2026-07-21"), true);
  for (const asOf of ["2026-07-21", "2026-07-26"])
    assert.deepEqual(brief(diagnoseCalendar(week, { asOf })), [], asOf);
  const d = diagnoseCalendar(week, { asOf: "2026-07-27" });
  assert.deepEqual(brief(d), [["info", "expired", "closedDates[0]"]]);
  assert.match(d[0]!.message, /ended on 2026-07-20 \(it could affect results until 2026-07-26/);
  // For a month rule, until the end of that month. The same for the effective period of an annual date
  const month: CalendarOptions = {
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: -1 }],
    closedAnnualDates: [{ from: "07-20", to: "07-20", effectiveTo: "2026-07-20" }],
  };
  assert.deepEqual(brief(diagnoseCalendar(month, { asOf: "2026-07-31" })), []);
  assert.deepEqual(brief(diagnoseCalendar(month, { asOf: "2026-08-01" })), [
    ["info", "expired", "closedAnnualDates[0]"],
  ]);
  // When the counting rule uses another calendar as its basis (`calendar` of a schedule), the schedule's dates
  // do not change the count
  const schedule = {
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    dates: [{ date: "2026-07-20", value: 0 }],
    recurringRules: [
      {
        businessDayOfWeek: [1],
        weekStart: 1 as const,
        calendar: createCalendar({ closedWeekdays: [0, 6] }),
        value: 2,
      },
    ],
  };
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2026-07-21" })), [
    ["info", "expired", "dates[0]"],
  ]);
});
