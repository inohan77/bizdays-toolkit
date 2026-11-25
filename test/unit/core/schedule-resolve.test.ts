// Unit tests of the functions of src/core/schedule.ts that compile schedule options, judge one day and build a
// schedule. One describe per function, named after the function; each test is one statement of the function's
// specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCalendar } from "../../../src/core/calendar.ts";
import { toDayNumber } from "../../../src/core/date.ts";
import { IssueCollector } from "../../../src/core/errors.ts";
import {
  buildSchedule,
  compileRecurringRule,
  compileScheduleOptions,
  createBasis,
  createDateRuleFinder,
  createHolidayLookup,
  createResolver,
  createSchedule,
  ignoreLostShift,
  infoOfSchedule,
  isHolidayBasedRule,
  lostShiftMessage,
  mapDays,
  matchAnnual,
  matchMonthDay,
  PARTS,
  partsHolder,
  partsOf,
  RECURRING_RULE_KEYS,
  resultIgnoresHolidays,
  shiftedOriginOf,
  throwLostShift,
  valuesOfSchedule,
  weekdayOfDate,
  type AnnualRule,
  type CompiledSchedule,
  type DateRule,
  type LostShiftHandler,
  type PartsHolder,
} from "../../../src/core/schedule.ts";
import type { Holiday, HolidayProvider } from "../../../src/core/types.ts";

const day = toDayNumber;
const dateOf = (n: number): string => new Date(n * 86400000).toISOString().slice(0, 10);
const issues = (c: IssueCollector): string[] =>
  c.issues.map((i) => `${i.severity} ${i.code} ${i.path}`);
type Week = [string, string, string, string, string, string, string];
const WEEK: Week = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const holiday = (date: string, extra: Partial<Holiday<string>> = {}): Holiday<string> => ({
  date,
  name: `N ${date}`,
  nameEn: `E ${date}`,
  kind: "regular",
  confirmed: true,
  ...extra,
});
const provider = (
  id: string,
  list: readonly Holiday<string>[],
  extra: Record<string, unknown> = {},
): HolidayProvider<string> =>
  ({
    id,
    timeZone: "UTC",
    supportedYears: { from: 2000, to: 2050 },
    dataVersion: "1",
    holidaysInYear: (year: number) => list.filter((h) => h.date.startsWith(`${year}-`)),
    ...extra,
  }) as unknown as HolidayProvider<string>;
/** Tuesday 3 and Monday 23 November 2026, and an unconfirmed holiday in 2030 */
const HOLIDAYS = [
  holiday("2026-11-03"),
  holiday("2026-11-23"),
  holiday("2030-03-20", { confirmed: false }),
];
const withHolidays = { holidayProvider: provider("X", HOLIDAYS), weekdayValues: WEEK };
function compile(options: unknown) {
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<unknown, string>(c, options);
  return { compiled, issues: issues(c) };
}
/** The judgement of one day of valid schedule options */
function resolverOf(
  options: Record<string, unknown>,
  onLostShift: LostShiftHandler<unknown> = throwLostShift,
) {
  const { compiled, issues: found } = compile(options);
  assert.deepEqual(
    found.filter((i) => i.startsWith("error")),
    [],
  );
  return {
    compiled: compiled!,
    resolve: createResolver(compiled!, createHolidayLookup(compiled!.source), onLostShift),
  };
}
/** Compiles one rule of a calendar */
function rule(entry: Record<string, unknown>) {
  const c = new IssueCollector();
  const compiled = compileRecurringRule(
    c,
    "r",
    "r",
    entry,
    () => ({ value: "R" }),
    RECURRING_RULE_KEYS,
    "calendar",
    "none",
  );
  assert.deepEqual(issues(c), []);
  return compiled!;
}

describe("compileScheduleOptions", () => {
  test("undefined and invalid-option at the root when options is not an options object", () => {
    for (const options of [undefined, null, "x", 5, []])
      assert.deepEqual(compile(options), {
        compiled: undefined,
        issues: ["error invalid-option "],
      });
  });
  test("the compiled schedule: source, weekly values (a frozen copy), holiday policy and rules", () => {
    const weekdayValues = [...WEEK];
    const { compiled, issues: found } = compile({ weekdayValues });
    assert.deepEqual(found, []);
    assert.deepEqual(compiled, {
      source: {
        providers: [],
        providerIndexes: [],
        timeZone: "UTC",
        outOfRangePolicy: "throw",
        unconfirmedHolidayPolicy: "accept",
      },
      weekly: WEEK,
      holiday: "ignore",
      annual: [],
      dates: [],
      recurring: [],
    });
    assert.notEqual(compiled!.weekly, weekdayValues);
    assert.ok(Object.isFrozen(compiled!.weekly));
  });
  test("the provider and time zone options are read", () => {
    const { compiled } = compile({
      ...withHolidays,
      timeZone: "Asia/Tokyo",
      outOfRangePolicy: "ignore",
      unconfirmedHolidayPolicy: "throw",
    });
    const { source } = compiled!;
    assert.deepEqual(
      [
        source.providers.length,
        source.timeZone,
        source.outOfRangePolicy,
        source.unconfirmedHolidayPolicy,
      ],
      [1, "Asia/Tokyo", "ignore", "throw"],
    );
  });
  test("weekdayValues must have 7 entries; a result is returned even then", () => {
    for (const weekdayValues of [undefined, "x", [1, 2, 3], [1, 2, 3, 4, 5, 6, 7, 8]]) {
      const { compiled, issues: found } = compile({ weekdayValues });
      assert.deepEqual(found, ["error invalid-option weekdayValues"]);
      assert.deepEqual(compiled!.weekly, []);
    }
  });
  test("holidayPolicy: ignore by default, { sameAs: weekday } or { value }", () => {
    const policy = (holidayPolicy: unknown) => compile({ weekdayValues: WEEK, holidayPolicy });
    assert.equal(policy(undefined).compiled!.holiday, "ignore");
    assert.equal(policy("ignore").compiled!.holiday, "ignore");
    const sameAs = policy({ sameAs: 0 });
    assert.deepEqual([sameAs.compiled!.holiday, sameAs.issues], [{ sameAs: 0 }, []]);
    assert.ok(Object.isFrozen(sameAs.compiled!.holiday));
    const value = policy({ value: undefined });
    assert.deepEqual([value.compiled!.holiday, value.issues], [{ value: undefined }, []]);
    assert.ok(Object.isFrozen(value.compiled!.holiday));
    // An explicit undefined for sameAs is an omission
    assert.deepEqual(policy({ sameAs: undefined, value: "H" }).compiled!.holiday, { value: "H" });
  });
  test("holidayPolicy: invalid values are reported and the policy stays ignore", () => {
    const policy = (holidayPolicy: unknown) => compile({ weekdayValues: WEEK, holidayPolicy });
    for (const wrong of [{ sameAs: 0, value: "H" }, "skip", {}, 5, null, { sameAs: undefined }])
      assert.deepEqual(
        [policy(wrong).issues, policy(wrong).compiled!.holiday],
        [["error invalid-option holidayPolicy"], "ignore"],
      );
    for (const sameAs of [7, "0", null])
      assert.deepEqual(
        [policy({ sameAs }).issues, policy({ sameAs }).compiled!.holiday],
        [["error invalid-weekday holidayPolicy.sameAs"], "ignore"],
      );
  });
  test("holidayPolicy: an unknown key inside the object gets a warning", () => {
    assert.deepEqual(
      compile({ weekdayValues: WEEK, holidayPolicy: { value: "H", sameAS: 0 } }).issues,
      ["warning unknown-option holidayPolicy.sameAS"],
    );
  });
  test("the old value weekday of holidayPolicy is read as ignore with a warning at the written key", () => {
    const fresh = compile({ weekdayValues: WEEK, holidayPolicy: "weekday" });
    assert.deepEqual(
      [fresh.issues, fresh.compiled!.holiday],
      [["warning deprecated-option holidayPolicy"], "ignore"],
    );
    const old = compile({ weekdayValues: WEEK, holiday: "weekday" });
    assert.deepEqual(
      [old.issues, old.compiled!.holiday],
      [["warning deprecated-option holiday", "warning deprecated-option holiday"], "ignore"],
    );
  });
  test("renamed keys are read with a warning; unknown keys get a warning", () => {
    const { compiled, issues: found } = compile({
      weekly: WEEK,
      annual: [{ date: "12-31", value: "A" }],
      recurring: [{ day: 20, value: "R" }],
      outOfRange: "ignore",
      extra: 1,
    });
    assert.deepEqual([...found].sort(), [
      "warning deprecated-option annual",
      "warning deprecated-option outOfRange",
      "warning deprecated-option recurring",
      "warning deprecated-option recurring[0].day",
      "warning deprecated-option weekly",
      "warning unknown-option extra",
    ]);
    assert.deepEqual(
      [
        compiled!.weekly,
        compiled!.annual.length,
        compiled!.recurring[0]!.path,
        compiled!.source.outOfRangePolicy,
      ],
      [WEEK, 1, "recurringRules[0]", "ignore"],
    );
  });
  test("an explicit undefined is an omission", () => {
    const { compiled, issues: found } = compile({
      weekdayValues: WEEK,
      holidayPolicy: undefined,
      dates: undefined,
      timeZone: undefined,
    });
    assert.deepEqual(found, []);
    assert.deepEqual([compiled!.holiday, compiled!.source.timeZone], ["ignore", "UTC"]);
  });
  test("annual dates, specific dates and recurring rules need a value, and a bare string is not accepted", () => {
    const { compiled, issues: found } = compile({
      weekdayValues: WEEK,
      annualDates: [{ date: "12-31", value: "A" }, { date: "12-30" }, "12-29"],
      dates: [{ date: "2026-11-23", value: undefined }, { date: "2026-11-24" }, "2026-11-25"],
      recurringRules: [{ weekday: 1, value: "R" }, { weekday: 2 }],
    });
    assert.deepEqual(found, [
      "error invalid-option annualDates[1]",
      "error invalid-option annualDates[2]",
      "error invalid-option dates[1]",
      "error invalid-option dates[2]",
      "error invalid-option recurringRules[1]",
    ]);
    assert.deepEqual(
      [
        compiled!.annual.map((r) => r.value),
        compiled!.dates.map((r) => r.value),
        compiled!.recurring.map((r) => r.value),
      ],
      [["A"], [undefined], ["R"]],
    );
  });
  test("kinds national is reported when the Japanese provider is used", () => {
    const rules = [{ holiday: true, kinds: ["national"], value: "R" }];
    const jp = compile({
      holidayProvider: provider("JP", []),
      weekdayValues: WEEK,
      recurringRules: rules,
    });
    assert.deepEqual(jp.issues, ["warning deprecated-option recurringRules[0].kinds[0]"]);
    assert.equal(jp.compiled!.recurring[0]!.nationalOfJp, true);
    assert.deepEqual(compile({ ...withHolidays, recurringRules: rules }).issues, []);
  });
  test("the calendar of an nth-business-day rule must have the schedule's time zone", () => {
    const tokyo = createCalendar({ timeZone: "Asia/Tokyo" });
    const utc = createCalendar({});
    const rules = (calendar: unknown) => [
      { weekday: 1, value: "W" },
      { businessDayOfMonth: 1, calendar, value: "R" },
    ];
    assert.deepEqual(compile({ weekdayValues: WEEK, recurringRules: rules(utc) }).issues, []);
    const conflict = compile({ weekdayValues: WEEK, recurringRules: rules(tokyo) });
    assert.deepEqual(conflict.issues, ["error time-zone-conflict recurringRules[1].calendar"]);
    assert.equal(conflict.compiled!.recurring.length, 2);
    assert.deepEqual(
      compile({ weekdayValues: WEEK, timeZone: "Asia/Tokyo", recurringRules: rules(tokyo) }).issues,
      [],
    );
  });
  test("the time zones are not compared when the schedule's time zone has an error", () => {
    const tokyo = createCalendar({ timeZone: "Asia/Tokyo" });
    assert.deepEqual(
      compile({
        weekdayValues: WEEK,
        timeZone: "Not/AZone",
        recurringRules: [{ businessDayOfMonth: 1, calendar: tokyo, value: "R" }],
      }).issues,
      ["error invalid-time-zone timeZone"],
    );
  });
});

describe("lostShiftMessage", () => {
  test("names the day that cannot be moved and the limit of 31 days", () => {
    assert.equal(
      lostShiftMessage("2026-03-01", "2026-01-20"),
      "the day 2026-01-20 cannot be moved to 2026-03-01: the run of holidays between them is longer than 31 days (write a long closure with closedDates or closedAnnualDates, not as holidays)",
    );
  });
  test("without an origin: the day cannot be determined because the run is longer than 367 days", () => {
    assert.equal(
      lostShiftMessage("2026-03-01", undefined),
      "no day can be moved to 2026-03-01: the run of holidays before it is longer than 367 days, so the day to move cannot be determined (write a long closure with closedDates or closedAnnualDates, not as holidays)",
    );
  });
});

describe("throwLostShift", () => {
  test("throws RangeError holiday-run-too-long, the message prefixed by the rule's path", () => {
    const r = rule({ weekday: 1, holidayOverlapPolicy: "after-holiday" });
    assert.throws(() => throwLostShift(r, "2026-03-01", "2026-01-20"), {
      name: "RangeError",
      code: "holiday-run-too-long",
      message: `r: ${lostShiftMessage("2026-03-01", "2026-01-20")}`,
    });
    assert.throws(() => throwLostShift(r, "2026-03-01", undefined), {
      message: `r: ${lostShiftMessage("2026-03-01", undefined)}`,
    });
  });
});

describe("ignoreLostShift", () => {
  test("does nothing", () => {
    assert.equal(ignoreLostShift(rule({ weekday: 1 }), "2026-03-01", undefined), undefined);
  });
});

describe("matchMonthDay", () => {
  const annual = (from: string, to: string) => ({ from, to }) as AnnualRule<unknown>;
  test("a month-day inside the range, both ends included", () => {
    const r = annual("08-13", "08-16");
    assert.deepEqual(
      ["08-12", "08-13", "08-15", "08-16", "08-17"].map((d) => matchMonthDay(r, d)),
      [false, true, true, true, false],
    );
    assert.equal(matchMonthDay(annual("12-31", "12-31"), "12-31"), true);
    assert.equal(matchMonthDay(annual("12-31", "12-31"), "12-30"), false);
  });
  test("a range with from after to wraps over the year end", () => {
    const r = annual("12-29", "01-03");
    assert.deepEqual(
      ["12-28", "12-29", "12-31", "01-01", "01-03", "01-04", "06-15"].map((d) =>
        matchMonthDay(r, d),
      ),
      [false, true, true, true, true, false, false],
    );
  });
});

describe("matchAnnual", () => {
  test("true when the date is in the effective period and the month-day matches", () => {
    const r = {
      from: "12-29",
      to: "01-03",
      effectiveFrom: day("2026-12-30"),
      effectiveTo: day("2028-01-01"),
    } as AnnualRule<unknown>;
    assert.deepEqual(
      [
        "2026-12-29",
        "2026-12-30",
        "2027-01-03",
        "2027-06-15",
        "2027-12-29",
        "2028-01-01",
        "2028-01-02",
      ].map((d) => matchAnnual(r, d)),
      [false, true, true, false, true, true, false],
    );
    const open = {
      from: "02-29",
      to: "02-29",
      effectiveFrom: null,
      effectiveTo: null,
    } as AnnualRule<unknown>;
    assert.equal(matchAnnual(open, "2024-02-29"), true);
    assert.equal(matchAnnual(open, "2024-02-28"), false);
  });
});

describe("isHolidayBasedRule", () => {
  test("true for a holiday, dayAfterHoliday or dayBeforeHoliday rule", () => {
    assert.equal(isHolidayBasedRule({ holiday: true }), true);
    assert.equal(isHolidayBasedRule({ dayAfterHoliday: true }), true);
    assert.equal(isHolidayBasedRule({ dayBeforeHoliday: true }), true);
    assert.equal(isHolidayBasedRule(rule({ holiday: true })), true);
  });
  test("false otherwise", () => {
    assert.equal(isHolidayBasedRule({}), false);
    assert.equal(
      isHolidayBasedRule({ holiday: false, dayAfterHoliday: false, dayBeforeHoliday: false }),
      false,
    );
    assert.equal(isHolidayBasedRule(rule({ weekday: 1 })), false);
  });
});

describe("resultIgnoresHolidays", () => {
  test("true when the holiday policy is ignore and no rule depends on holidays", () => {
    assert.equal(resultIgnoresHolidays({ holiday: "ignore", recurring: [] }), true);
    assert.equal(
      resultIgnoresHolidays({
        holiday: "ignore",
        recurring: [{ holidayOverlapPolicy: "under-holiday" }],
      }),
      true,
    );
  });
  test("false with another holiday policy", () => {
    assert.equal(resultIgnoresHolidays({ holiday: { value: 1 }, recurring: [] }), false);
    assert.equal(resultIgnoresHolidays({ holiday: { sameAs: 0 }, recurring: [] }), false);
  });
  test("false with a holiday-based, after-holiday or over-holiday rule", () => {
    for (const r of [
      { holiday: true },
      { dayAfterHoliday: true },
      { dayBeforeHoliday: true },
      { holidayOverlapPolicy: "after-holiday" },
      { holidayOverlapPolicy: "over-holiday" },
    ])
      assert.equal(
        resultIgnoresHolidays({
          holiday: "ignore",
          recurring: [{ holidayOverlapPolicy: "under-holiday" }, r],
        }),
        false,
      );
  });
});

describe("createDateRuleFinder", () => {
  const date = (from: string, to: string, value: string): DateRule<string> => ({
    path: value,
    from: day(from),
    to: day(to),
    value,
    name: undefined,
  });
  /** The value found for every day of November 2026, with a "-" for none; asked `rounds` times */
  const found = (dates: readonly DateRule<string>[], rounds = 1): string[] => {
    const find = createDateRuleFinder(dates);
    const out: string[] = [];
    for (let round = 0; round < rounds; round++) {
      let line = "";
      for (let n = day("2026-11-01"); n <= day("2026-11-30"); n++) line += find(n)?.value ?? "-";
      out.push(line);
    }
    return out;
  };
  test("undefined for every day without dates", () => {
    assert.deepEqual(found([]), ["-".repeat(30)]);
  });
  test("the rule whose period contains the day, for dates written in order", () => {
    assert.deepEqual(
      found(
        [
          date("2026-11-02", "2026-11-04", "a"),
          date("2026-11-05", "2026-11-05", "b"),
          date("2026-11-29", "2026-11-30", "c"),
        ],
        2,
      ),
      ["-aaab-----------------------cc", "-aaab-----------------------cc"],
    );
  });
  test("the same result for dates written out of order, before and after they are sorted", () => {
    const dates = [
      date("2026-11-29", "2026-11-30", "c"),
      date("2026-11-02", "2026-11-04", "a"),
      date("2026-11-05", "2026-11-05", "b"),
    ];
    assert.deepEqual(found(dates, 2), [
      "-aaab-----------------------cc",
      "-aaab-----------------------cc",
    ]);
  });
  test("with overlapping dates, the first in the written order", () => {
    const dates = [
      date("2026-11-10", "2026-11-12", "a"),
      date("2026-11-02", "2026-11-04", "b"),
      date("2026-11-11", "2026-11-14", "c"),
    ];
    assert.deepEqual(found(dates, 2), [
      "-bbb-----aaacc----------------",
      "-bbb-----aaacc----------------",
    ]);
    const sameStart = [
      date("2026-11-20", "2026-11-20", "x"),
      date("2026-11-10", "2026-11-12", "a"),
      date("2026-11-10", "2026-11-11", "b"),
    ];
    assert.deepEqual(found(sameStart, 2), [
      "---------aaa-------x----------",
      "---------aaa-------x----------",
    ]);
  });
});

describe("shiftedOriginOf", () => {
  const calls: [string, string | undefined][] = [];
  const record: LostShiftHandler<unknown> = (_rule, date, origin) => {
    calls.push([date, origin]);
  };
  const none = () => false;
  const holidaysOn = (from: string, to: string) => (date: string) =>
    date >= from && date <= to ? holiday(date) : undefined;
  const origin = (
    r: ReturnType<typeof rule>,
    date: string,
    holidayOf: (date: string) => Holiday<string> | undefined,
  ) => {
    calls.length = 0;
    return { origin: shiftedOriginOf(r, date, holidayOf, none, record), calls: [...calls] };
  };
  const monday = rule({ weekday: 1, holidayOverlapPolicy: "after-holiday" });
  test("the day of the run of holidays before the date that the rule matches", () => {
    assert.deepEqual(origin(monday, "2026-11-24", holidaysOn("2026-11-23", "2026-11-23")), {
      origin: "2026-11-23",
      calls: [],
    });
    assert.deepEqual(origin(monday, "2026-11-26", holidaysOn("2026-11-23", "2026-11-25")), {
      origin: "2026-11-23",
      calls: [],
    });
  });
  test("undefined when the day before is not a holiday, and when the run holds no day of the rule", () => {
    assert.deepEqual(
      origin(monday, "2026-11-24", () => undefined),
      { origin: undefined, calls: [] },
    );
    assert.deepEqual(origin(monday, "2026-11-26", holidaysOn("2026-11-24", "2026-11-25")), {
      origin: undefined,
      calls: [],
    });
  });
  test("the weekdays of skipWeekdays belong to the run", () => {
    const r = rule({ dayOfMonth: 28, holidayOverlapPolicy: "after-holiday", skipWeekdays: [0, 6] });
    assert.deepEqual(
      origin(r, "2026-11-30", () => undefined),
      { origin: "2026-11-28", calls: [] },
    );
  });
  test("the rule's effective period applies to the original day", () => {
    const r = rule({
      weekday: 1,
      holidayOverlapPolicy: "after-holiday",
      effectiveFrom: "2026-11-24",
    });
    assert.deepEqual(origin(r, "2026-11-24", holidaysOn("2026-11-23", "2026-11-23")), {
      origin: undefined,
      calls: [],
    });
  });
  test("a run longer than 31 days: onLostShift is called with the matching day that lies further back", () => {
    const r = rule({ dayOfMonth: 20, months: [1], holidayOverlapPolicy: "after-holiday" });
    assert.deepEqual(origin(r, "2026-03-01", holidaysOn("2026-01-15", "2026-02-28")), {
      origin: undefined,
      calls: [["2026-03-01", "2026-01-20"]],
    });
    // The 31st day back is still within reach
    const within = rule({ dayOfMonth: 29, months: [1], holidayOverlapPolicy: "after-holiday" });
    assert.deepEqual(origin(within, "2026-03-01", holidaysOn("2026-01-15", "2026-02-28")), {
      origin: "2026-01-29",
      calls: [],
    });
    const beyond = rule({ dayOfMonth: 28, months: [1], holidayOverlapPolicy: "after-holiday" });
    assert.deepEqual(origin(beyond, "2026-03-01", holidaysOn("2026-01-15", "2026-02-28")).calls, [
      ["2026-03-01", "2026-01-28"],
    ]);
  });
  test("a run longer than 31 days that holds no day of the rule: undefined, and onLostShift is not called", () => {
    const r = rule({ dayOfMonth: 10, months: [1], holidayOverlapPolicy: "after-holiday" });
    assert.deepEqual(origin(r, "2026-03-01", holidaysOn("2026-01-15", "2026-02-28")), {
      origin: undefined,
      calls: [],
    });
  });
  test("a run longer than 367 days: onLostShift is called without an origin", () => {
    const never = rule({
      weekday: 1,
      holidayOverlapPolicy: "after-holiday",
      effectiveTo: "1999-12-31",
    });
    assert.deepEqual(origin(never, "2026-03-01", holidaysOn("2000-01-01", "2026-02-28")), {
      origin: undefined,
      calls: [["2026-03-01", undefined]],
    });
  });
  test("the search stops at 1000-01-01", () => {
    const never = rule({
      weekday: 1,
      holidayOverlapPolicy: "after-holiday",
      effectiveFrom: "2000-01-01",
    });
    assert.deepEqual(origin(never, "1000-03-01", holidaysOn("1000-01-01", "1000-02-28")), {
      origin: undefined,
      calls: [],
    });
  });
  test("what the holiday lookup or onLostShift throws is thrown", () => {
    assert.throws(
      () =>
        shiftedOriginOf(
          monday,
          "2026-11-24",
          () => {
            throw new RangeError("boom");
          },
          none,
          record,
        ),
      { message: "boom" },
    );
    const r = rule({ dayOfMonth: 20, months: [1], holidayOverlapPolicy: "after-holiday" });
    assert.throws(
      () =>
        shiftedOriginOf(
          r,
          "2026-03-01",
          holidaysOn("2026-01-15", "2026-02-28"),
          none,
          throwLostShift,
        ),
      {
        code: "holiday-run-too-long",
      },
    );
  });
});

describe("createBasis", () => {
  /** A compiled calendar: closed on weekends and holidays, with the given recurring rules of a calendar */
  const calendarOf = (...entries: Record<string, unknown>[]): CompiledSchedule<unknown, string> => {
    const c = new IssueCollector();
    const base = compileScheduleOptions<unknown, string>(c, {
      holidayProvider: provider("X", HOLIDAYS),
      weekdayValues: [false, true, true, true, true, true, false],
      holidayPolicy: { value: false },
      dates: [{ date: "2026-11-10", value: false }],
    })!;
    const recurring = entries.map((entry, i) =>
      compileRecurringRule(
        c,
        `r[${i}]`,
        `r[${i}]`,
        entry,
        () => ({ value: false }),
        RECURRING_RULE_KEYS,
        "calendar",
        "none",
      )!,
    );
    assert.deepEqual(issues(c), []);
    return { ...base, recurring };
  };
  test("undefined when no rule counts the options' own business days", () => {
    const compiled = calendarOf({ weekday: 3 });
    assert.equal(createBasis(compiled, createHolidayLookup(compiled.source)), undefined);
    const own = {
      ...compiled,
      recurring: [{ ...rule({ businessDayOfMonth: 1 }), basis: () => [] }],
    };
    assert.equal(createBasis(own, createHolidayLookup(own.source)), undefined);
  });
  test("the days whose value is true with all recurring rules removed", () => {
    const compiled = calendarOf({ weekday: 3 }, { businessDayOfMonth: 1 });
    const basis = createBasis(compiled, createHolidayLookup(compiled.source))!;
    // November 2026 without weekends, the holidays on the 3rd and the 23rd and the closed 10th; Wednesdays count
    assert.deepEqual(
      basis(2026, 11),
      [2, 4, 5, 6, 9, 11, 12, 13, 16, 17, 18, 19, 20, 24, 25, 26, 27, 30],
    );
  });
  test("a value other than true does not count", () => {
    const compiled = {
      ...calendarOf({ businessDayOfMonth: 1 }),
      weekly: [false, 1, "true", true, true, true, false],
    };
    const basis = createBasis(compiled, createHolidayLookup(compiled.source))!;
    assert.deepEqual(basis(2026, 11).slice(0, 4), [4, 5, 6, 11]);
  });
});

describe("createResolver", () => {
  const info = (options: Record<string, unknown>, date: string, withHoliday?: boolean) =>
    resolverOf({ ...withHolidays, ...options }).resolve(date, withHoliday).day;
  test("6: the weekday value on a day no rule decides; the day info is frozen and the rule null", () => {
    const { resolve } = resolverOf(withHolidays);
    const result = resolve("2026-11-24");
    assert.deepEqual(result, {
      day: { date: "2026-11-24", weekday: 2, value: "tue", reason: "weekday" },
      rule: null,
    });
    assert.ok(Object.isFrozen(result.day));
  });
  test("1: a specific date decides first, in array order, on a holiday too", () => {
    const options = {
      holidayPolicy: { value: "H" },
      dates: [
        { from: "2026-11-23", to: "2026-11-24", value: "D1", name: "first" },
        { date: "2026-11-23", value: "D2" },
      ],
      annualDates: [{ date: "11-23", value: "A" }],
      recurringRules: [{ weekday: 1, value: "R", holidayOverlapPolicy: "over-holiday" }],
    };
    const { compiled, resolve } = resolverOf({ ...withHolidays, ...options });
    const result = resolve("2026-11-23");
    assert.deepEqual(result.day, {
      date: "2026-11-23",
      weekday: 1,
      value: "D1",
      reason: "date",
      name: "first",
      holiday: HOLIDAYS[1],
      optionPath: "dates[0]",
      rulePath: "dates[0]",
    });
    assert.equal(result.rule, compiled.dates[0]);
    assert.deepEqual(resolve("2026-11-24").day, {
      date: "2026-11-24",
      weekday: 2,
      value: "D1",
      reason: "date",
      name: "first",
      optionPath: "dates[0]",
      rulePath: "dates[0]",
    });
  });
  test("2: an annual date decides next, the first that matches", () => {
    const options = {
      holidayPolicy: { value: "H" },
      annualDates: [
        { date: "11-24", value: "A0" },
        { from: "11-20", to: "11-25", value: "A1", name: "week" },
        { date: "11-23", value: "A2" },
      ],
      recurringRules: [{ weekday: 1, value: "R", holidayOverlapPolicy: "over-holiday" }],
    };
    const { compiled, resolve } = resolverOf({ ...withHolidays, ...options });
    const result = resolve("2026-11-23");
    assert.deepEqual(
      [
        result.day.value,
        result.day.reason,
        result.day.name,
        result.day.rulePath,
        result.day.holiday,
      ],
      ["A1", "annual", "week", "annualDates[1]", HOLIDAYS[1]],
    );
    assert.equal(result.rule, compiled.annual[1]);
    assert.equal(resolve("2026-11-24").day.value, "A0");
  });
  test("3: on a holiday an over-holiday rule decides before the holiday policy; a holiday rule is one", () => {
    const over = info(
      {
        holidayPolicy: { value: "H" },
        recurringRules: [
          { weekday: 1, value: "under" },
          { weekday: 2, value: "tuesday", holidayOverlapPolicy: "over-holiday" },
          { weekday: 1, value: "over", name: "O", holidayOverlapPolicy: "over-holiday" },
        ],
      },
      "2026-11-23",
    );
    assert.deepEqual(
      [over.value, over.reason, over.name, over.rulePath, over.optionPath],
      ["over", "recurring", "O", "recurringRules[2]", "recurringRules[2]"],
    );
    assert.equal(
      info(
        { holidayPolicy: { value: "H" }, recurringRules: [{ holiday: true, value: "HR" }] },
        "2026-11-23",
      ).value,
      "HR",
    );
  });
  test("4: on a holiday the holiday policy decides: the value, or the value of the weekday sameAs", () => {
    const value = resolverOf({
      ...withHolidays,
      holidayPolicy: { value: "H" },
      recurringRules: [{ weekday: 1, value: "under" }],
    }).resolve("2026-11-23");
    assert.deepEqual(value, {
      day: {
        date: "2026-11-23",
        weekday: 1,
        value: "H",
        reason: "holiday",
        name: "N 2026-11-23",
        holiday: HOLIDAYS[1],
      },
      rule: null,
    });
    assert.equal(info({ holidayPolicy: { sameAs: 0 } }, "2026-11-23").value, "sun");
    assert.equal(info({ holidayPolicy: { value: undefined } }, "2026-11-23").reason, "holiday");
  });
  test("4: with the policy ignore an under-holiday rule applies on a holiday, an after-holiday rule does not", () => {
    const under = info({ recurringRules: [{ weekday: 1, value: "under" }] }, "2026-11-23");
    assert.deepEqual(
      [under.value, under.reason, under.holiday],
      ["under", "recurring", HOLIDAYS[1]],
    );
    const after = info(
      { recurringRules: [{ weekday: 1, value: "after", holidayOverlapPolicy: "after-holiday" }] },
      "2026-11-23",
    );
    assert.deepEqual(after, {
      date: "2026-11-23",
      weekday: 1,
      value: "mon",
      reason: "weekday",
      holiday: HOLIDAYS[1],
    });
  });
  test("5: on other days the first recurring rule in array order that matches", () => {
    const options = {
      recurringRules: [
        { dayOfMonth: 25, value: "25th" },
        { weekday: 2, value: "tuesday", name: "T" },
        { dayOfMonth: 24, value: "24th" },
      ],
    };
    const { compiled, resolve } = resolverOf({ ...withHolidays, ...options });
    const result = resolve("2026-11-24");
    assert.deepEqual(result.day, {
      date: "2026-11-24",
      weekday: 2,
      value: "tuesday",
      reason: "recurring",
      name: "T",
      optionPath: "recurringRules[1]",
      rulePath: "recurringRules[1]",
    });
    assert.equal(result.rule, compiled.recurring[1]);
  });
  test("5: the day an after-holiday rule moved to, with shiftedFrom", () => {
    const options = {
      recurringRules: [{ weekday: 1, value: "moved", holidayOverlapPolicy: "after-holiday" }],
    };
    assert.deepEqual(info(options, "2026-11-24"), {
      date: "2026-11-24",
      weekday: 2,
      value: "moved",
      reason: "recurring",
      shiftedFrom: "2026-11-23",
      optionPath: "recurringRules[0]",
      rulePath: "recurringRules[0]",
    });
    assert.equal(info(options, "2026-11-25").value, "wed");
    assert.equal(info(options, "2026-11-30").shiftedFrom, undefined);
    // A rule written before decides the day the later rule would move to
    const first = { recurringRules: [{ weekday: 2, value: "tuesday" }, ...options.recurringRules] };
    assert.equal(info(first, "2026-11-24").value, "tuesday");
  });
  test("5: a rule is not applied on a weekday of its skipWeekdays and moves past it", () => {
    const options = {
      recurringRules: [
        {
          dayOfMonth: 28,
          value: "28th",
          holidayOverlapPolicy: "after-holiday",
          skipWeekdays: [0, 6],
        },
      ],
    };
    assert.equal(info(options, "2026-11-28").value, "sat");
    assert.equal(info(options, "2026-11-29").value, "sun");
    assert.deepEqual(
      [info(options, "2026-11-30").value, info(options, "2026-11-30").shiftedFrom],
      ["28th", "2026-11-28"],
    );
  });
  test("an nth-business-day rule of a schedule counts with its calendar", () => {
    const calendar = createCalendar({ closedWeekdays: [0, 1, 6] });
    const options = { recurringRules: [{ businessDayOfMonth: 1, calendar, value: "first" }] };
    assert.equal(info(options, "2026-11-03").value, "first");
    assert.equal(info(options, "2026-11-02").value, "mon");
  });
  test("an nth-business-day rule without a basis of its own counts the options' own business days", () => {
    const c = new IssueCollector();
    const base = compileScheduleOptions<unknown, string>(c, {
      ...withHolidays,
      weekdayValues: [false, true, true, true, true, true, false],
      holidayPolicy: { value: false },
    })!;
    const first = compileRecurringRule(
      c,
      "r",
      "r",
      { businessDayOfMonth: 2 },
      () => ({ value: "second" }),
      RECURRING_RULE_KEYS,
      "calendar",
      "none",
    )!;
    const compiled = { ...base, recurring: [first] };
    const resolve = createResolver(compiled, createHolidayLookup(compiled.source), throwLostShift);
    // Monday 2 is the first business day, Tuesday 3 is a holiday, Wednesday 4 the second
    assert.deepEqual(
      ["2026-11-02", "2026-11-03", "2026-11-04"].map((d) => resolve(d).day.value),
      [true, false, "second"],
    );
  });
  test("kinds national selects the regular holidays of the JP provider", () => {
    const jp = provider("JP", [holiday("2026-11-23")]);
    const other = provider("X", [holiday("2026-11-03")]);
    const { resolve } = resolverOf({
      holidayProvider: [jp, other],
      weekdayValues: WEEK,
      recurringRules: [{ holiday: true, kinds: ["national"], value: "national" }],
    });
    assert.deepEqual(
      [resolve("2026-11-23").day.value, resolve("2026-11-03").day.value],
      ["national", "tue"],
    );
  });
  test("an unconfirmed holiday throws with the policy throw, except for a value-only judgement of results that do not depend on holidays", () => {
    const strict = { ...withHolidays, unconfirmedHolidayPolicy: "throw" };
    const { resolve } = resolverOf({ ...strict, recurringRules: [{ weekday: 1, value: "R" }] });
    assert.throws(() => resolve("2030-03-20"), { name: "RangeError", code: "unconfirmed-holiday" });
    assert.throws(() => resolve("2030-03-20", true), { code: "unconfirmed-holiday" });
    const value = resolve("2030-03-20", false).day;
    assert.deepEqual(
      [value.value, value.holiday],
      [WEEK[weekdayOfDate("2030-03-20")], HOLIDAYS[2]],
    );
    const dependent = resolverOf({ ...strict, holidayPolicy: { value: "H" } }).resolve;
    assert.throws(() => dependent("2030-03-20", false), { code: "unconfirmed-holiday" });
  });
  test("what the lookup throws is thrown, for the day and for the neighbouring days the rules look at", () => {
    const { resolve } = resolverOf({
      ...withHolidays,
      recurringRules: [{ dayAfterHoliday: true, value: "R" }],
    });
    assert.throws(() => resolve("2051-01-01"), { code: "out-of-range" });
    assert.throws(() => resolve("2000-01-01"), { code: "out-of-range" });
    assert.equal(resolve("2000-01-02").day.value, "sun");
    const broken = provider("X", [], { holidaysInYear: () => null });
    assert.throws(
      () => resolverOf({ holidayProvider: broken, weekdayValues: WEEK }).resolve("2026-11-24"),
      {
        code: "invalid-provider-data",
      },
    );
  });
  test("out-of-range when a neighbouring day is outside the years 1000-9999", () => {
    const { resolve } = resolverOf({
      weekdayValues: WEEK,
      recurringRules: [{ weekday: 1, value: "R", holidayOverlapPolicy: "after-holiday" }],
    });
    assert.throws(() => resolve("1000-01-01"), { code: "out-of-range" });
    assert.equal(resolve("1000-01-02").day.reason, "weekday");
  });
  test("onLostShift is called when an after-holiday day cannot be moved; what it throws is thrown", () => {
    const run = Array.from({ length: 45 }, (_, i) => holiday(dateOf(day("2026-01-15") + i)));
    const options = {
      holidayProvider: provider("X", run),
      weekdayValues: WEEK,
      recurringRules: [
        { dayOfMonth: 20, months: [1], value: "R", holidayOverlapPolicy: "after-holiday" },
      ],
    };
    assert.throws(() => resolverOf(options).resolve("2026-03-01"), {
      name: "RangeError",
      code: "holiday-run-too-long",
    });
    const calls: unknown[] = [];
    const quiet = resolverOf(options, (_rule, date, origin) => calls.push([date, origin]));
    assert.equal(quiet.resolve("2026-03-01").day.value, "sun");
    assert.deepEqual(calls, [["2026-03-01", "2026-01-20"]]);
  });
});

describe("mapDays", () => {
  test("the results of fn for every day of the period, both ends included, in date order, frozen", () => {
    const days = mapDays("2026-12-30", "2027-01-02", (date) => date);
    assert.deepEqual(days, ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    assert.ok(Object.isFrozen(days));
    assert.deepEqual(
      mapDays("2026-11-23", "2026-11-23", (date) => date.length),
      [10],
    );
  });
  test("invalid-range when from is after to; fn is not called", () => {
    let calls = 0;
    assert.throws(() => mapDays("2026-11-24", "2026-11-23", () => calls++), {
      name: "RangeError",
      code: "invalid-range",
    });
    assert.equal(calls, 0);
  });
  test("what fn throws is thrown", () => {
    assert.throws(
      () =>
        mapDays("2026-11-23", "2026-11-24", () => {
          throw new Error("boom");
        }),
      { message: "boom" },
    );
  });
});

describe("partsHolder", () => {
  test("a holder with the value and no owner", () => {
    const value = [{}];
    const holder = partsHolder(value);
    assert.deepEqual(holder, { owner: undefined, value });
    assert.equal(holder.value, value);
    assert.deepEqual(partsHolder(undefined), { owner: undefined, value: undefined });
  });
});

describe("partsOf", () => {
  test("the value of the holder whose owner is the object", () => {
    const value = [{}];
    const holder = partsHolder(value);
    const object = { [PARTS]: holder };
    holder.owner = object;
    assert.equal(partsOf(object), value);
    const schedule = createSchedule({ weekdayValues: WEEK });
    assert.deepEqual((partsOf(schedule) as CompiledSchedule<unknown, string>).weekly, WEEK);
  });
  test("undefined without a holder, and when the holder belongs to another object, such as a spread copy", () => {
    assert.equal(partsOf({}), undefined);
    const schedule = createSchedule({ weekdayValues: WEEK });
    assert.equal(partsOf({ ...schedule }), undefined);
    assert.equal(partsOf({ [PARTS]: partsHolder([]) }), undefined);
  });
});

describe("valuesOfSchedule", () => {
  test("the 7 weekday values and, with holidayPolicy { value }, the holiday value", () => {
    assert.deepEqual(valuesOfSchedule(createSchedule({ weekdayValues: WEEK })), WEEK);
    assert.deepEqual(
      valuesOfSchedule(createSchedule({ weekdayValues: WEEK, holidayPolicy: { value: "H" } })),
      [...WEEK, "H"],
    );
    assert.deepEqual(
      valuesOfSchedule(createSchedule({ weekdayValues: WEEK, holidayPolicy: { sameAs: 0 } })),
      WEEK,
    );
  });
  test("empty for an object not created by createSchedule", () => {
    const schedule = createSchedule({ weekdayValues: WEEK });
    assert.deepEqual(
      valuesOfSchedule({ ...schedule, valueOn: schedule.valueOn } as typeof schedule).length,
      7,
    );
    assert.deepEqual(
      valuesOfSchedule({ valueOn: schedule.valueOn } as unknown as typeof schedule),
      [],
    );
  });
});

describe("infoOfSchedule", () => {
  test("the judgement by date string of a schedule", () => {
    const schedule = createSchedule({ weekdayValues: WEEK });
    const info = infoOfSchedule(schedule)!;
    assert.deepEqual(info("2026-11-24"), {
      date: "2026-11-24",
      weekday: 2,
      value: "tue",
      reason: "weekday",
    });
    assert.deepEqual(info("2026-11-24"), schedule.dayInfoOn("2026-11-24"));
  });
  test("undefined for an object not created by createSchedule", () => {
    const schedule = createSchedule({ weekdayValues: WEEK });
    assert.equal(
      infoOfSchedule({ dayInfoOn: schedule.dayInfoOn } as unknown as typeof schedule),
      undefined,
    );
  });
});

describe("buildSchedule", () => {
  const build = (options: Record<string, unknown>) =>
    buildSchedule(compile({ ...withHolidays, ...options }).compiled!);
  test("a frozen schedule with the source's providers, time zone and policies", () => {
    const schedule = build({
      timeZone: "Asia/Tokyo",
      outOfRangePolicy: "ignore",
      unconfirmedHolidayPolicy: "throw",
    });
    assert.ok(Object.isFrozen(schedule));
    assert.deepEqual(
      [
        schedule.timeZone,
        schedule.providers.length,
        schedule.outOfRangePolicy,
        schedule.outOfRange,
        schedule.unconfirmedHolidayPolicy,
        schedule.unconfirmedHolidays,
      ],
      ["Asia/Tokyo", 1, "ignore", "ignore", "throw", "throw"],
    );
  });
  test("the members of the holiday lookup", () => {
    const schedule = build({ timeZone: "Asia/Tokyo" });
    assert.equal(schedule.dateOf(new Date("2026-11-22T15:00:00Z")), "2026-11-23");
    assert.deepEqual(schedule.civilOf(new Date("2026-11-22T15:30:00Z")), {
      date: "2026-11-23",
      time: "00:30",
    });
    assert.equal(
      schedule.instantOf("2026-11-23", "09:00").toISOString(),
      "2026-11-23T00:00:00.000Z",
    );
    assert.equal(schedule.today(new Date("2026-11-22T15:00:00Z")), "2026-11-23");
    assert.equal(schedule.isHoliday("2026-11-23"), true);
    assert.equal(schedule.holidayOn("2026-11-23")!.date, "2026-11-23");
    assert.equal(schedule.getHoliday, schedule.holidayOn);
    assert.equal(schedule.holidaysInYear(2026).length, 2);
    assert.equal(schedule.holidaysBetween("2026-11-01", "2026-11-03").length, 1);
  });
  test("valueOn, dayInfoOn, dayInfo and daysBetween take date inputs in the schedule's time zone", () => {
    const schedule = build({ timeZone: "Asia/Tokyo", holidayPolicy: { value: "H" } });
    assert.equal(schedule.valueOn("2026-11-24"), "tue");
    assert.equal(schedule.valueOn(new Date("2026-11-22T15:00:00Z")), "H");
    const expected = {
      date: "2026-11-23",
      weekday: 1,
      value: "H",
      reason: "holiday",
      name: "N 2026-11-23",
      holiday: HOLIDAYS[1],
    };
    assert.deepEqual(schedule.dayInfoOn(new Date("2026-11-22T15:00:00Z")), expected);
    assert.deepEqual(schedule.dayInfo("2026-11-23"), expected);
    const days = schedule.daysBetween("2026-11-22", new Date("2026-11-23T15:00:00Z"));
    assert.deepEqual(
      days.map((d) => d.value),
      ["sun", "H", "tue"],
    );
    assert.ok(Object.isFrozen(days));
    assert.throws(() => schedule.daysBetween("2026-11-24", "2026-11-23"), {
      code: "invalid-range",
    });
  });
  test("valueOn does not throw for an unconfirmed holiday when the results do not depend on holidays; dayInfoOn does", () => {
    const schedule = build({ unconfirmedHolidayPolicy: "throw" });
    assert.equal(schedule.valueOn("2030-03-20"), WEEK[weekdayOfDate("2030-03-20")]);
    assert.throws(() => schedule.dayInfoOn("2030-03-20"), { code: "unconfirmed-holiday" });
    const dependent = build({ unconfirmedHolidayPolicy: "throw", holidayPolicy: { value: "H" } });
    assert.throws(() => dependent.valueOn("2030-03-20"), { code: "unconfirmed-holiday" });
  });
  test("a move out of reach throws holiday-run-too-long", () => {
    const run = Array.from({ length: 45 }, (_, i) => holiday(dateOf(day("2026-01-15") + i)));
    const schedule = build({
      holidayProvider: provider("X", run),
      recurringRules: [
        { dayOfMonth: 20, months: [1], value: "R", holidayOverlapPolicy: "after-holiday" },
      ],
    });
    assert.throws(() => schedule.valueOn("2026-03-01"), { code: "holiday-run-too-long" });
  });
  test("carries its contents for the diagnostics, its weekday values and its judgement by date string", () => {
    const { compiled } = compile({ ...withHolidays, holidayPolicy: { value: "H" } });
    const schedule = buildSchedule(compiled!);
    assert.equal(partsOf(schedule), compiled);
    const holder = (schedule as unknown as { [PARTS]: PartsHolder })[PARTS];
    assert.ok(Object.isFrozen(holder));
    assert.equal(holder.owner, schedule);
    assert.deepEqual(valuesOfSchedule(schedule), [...WEEK, "H"]);
    assert.ok(Object.isFrozen(valuesOfSchedule(schedule)));
    assert.equal(infoOfSchedule(schedule)!("2026-11-23").value, "H");
    assert.deepEqual(Object.keys(schedule).includes("timeZone"), true);
    assert.equal(JSON.stringify(schedule).includes("weekly"), false);
  });
});

describe("createSchedule", () => {
  test("a frozen schedule that returns a value per day from the options", () => {
    const schedule = createSchedule({
      holidayProvider: provider("X", HOLIDAYS),
      weekdayValues: WEEK,
      holidayPolicy: { value: "H" },
      annualDates: [{ date: "12-31", value: "A" }],
      dates: [{ date: "2026-11-25", value: "D" }],
      recurringRules: [{ dayOfMonth: 20, value: "R" }],
    });
    assert.ok(Object.isFrozen(schedule));
    assert.deepEqual(
      ["2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2026-12-31"].map((d) =>
        schedule.valueOn(d),
      ),
      ["R", "H", "tue", "D", "A"],
    );
  });
  test("the options are copied at creation: changing them afterwards changes nothing", () => {
    const weekdayValues: Week = [...WEEK];
    const dates = [{ date: "2026-11-25", value: "D" }];
    const schedule = createSchedule({ weekdayValues, dates });
    weekdayValues[2] = "changed";
    dates[0]!.value = "changed";
    dates.push({ date: "2026-11-24", value: "new" });
    assert.deepEqual(
      [schedule.valueOn("2026-11-24"), schedule.valueOn("2026-11-25")],
      ["tue", "D"],
    );
  });
  test("RangeError with the code of the first invalid option, the message prefixed by the option's path", () => {
    assert.throws(() => createSchedule({ weekdayValues: [1, 2, 3] } as never), {
      name: "RangeError",
      code: "invalid-option",
      message: /^weekdayValues: /,
    });
    assert.throws(
      () =>
        createSchedule({
          weekdayValues: WEEK,
          dates: [{ date: "2026-02-30", value: "x" }],
          annualDates: [{ date: "13-01", value: "x" }],
        }),
      {
        name: "RangeError",
        code: "invalid-annual-date",
        message: /^annualDates\[0\]\.date: /,
      },
    );
    assert.throws(() => createSchedule(null as never), {
      name: "RangeError",
      code: "invalid-option",
    });
  });
  test("warnings do not throw", () => {
    const schedule = createSchedule({ weekly: WEEK, extra: 1 } as never);
    assert.equal(schedule.valueOn("2026-11-24"), "tue");
  });
});
