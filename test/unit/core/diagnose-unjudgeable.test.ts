// Unit tests of the functions of src/core/diagnose.ts that validate provider data, find the days that cannot
// be judged and build the state of the rule diagnostics. One describe per function, named after the function;
// each test is one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCalendar } from "../../../src/core/calendar.ts";
import {
  analyze,
  checkLostShifts,
  checkProviderData,
  createRuleContext,
  DIAGNOSTIC_YEARS,
  dateUnitsOf,
  dropUnsure,
  guardBases,
  inRanges,
  patternCycle,
  reportOutsideRange,
  resolverIn,
  rulesScanWindow,
  unjudgeableDays,
  unjudgeableInDates,
  unsureOf,
} from "../../../src/core/diagnose.ts";
import { IssueCollector, rangeError } from "../../../src/core/errors.ts";
import {
  compileRecurringRule,
  compileScheduleOptions,
  createHolidayLookup,
  dateOfDayNumber,
  dayNumberOf,
  lostShiftMessage,
  RECURRING_RULE_KEYS,
  type BasisOfMonth,
  type CompiledSchedule,
} from "../../../src/core/schedule.ts";
import type { Holiday, HolidayProvider } from "../../../src/core/types.ts";

const day = dayNumberOf;
const dates = (days: Iterable<number>): string[] =>
  [...days].sort((a, b) => a - b).map(dateOfDayNumber);
const monthIndex = (year: number, month: number): number => year * 12 + month - 1;
type Week = [unknown, unknown, unknown, unknown, unknown, unknown, unknown];
const WEEK: Week = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const OPEN_WEEK: Week = [false, true, true, true, true, true, false];
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
  from: number,
  to: number,
  list: readonly Holiday<string>[] = [],
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    timeZone: "UTC",
    supportedYears: { from, to },
    dataVersion: "1",
    holidaysInYear: (year: number) => list.filter((h) => h.date.startsWith(`${year}-`)),
    ...extra,
  }) as unknown as HolidayProvider<string>;
const issuesOf = (c: IssueCollector): string[] =>
  c.issues.map((i) => `${i.severity} ${i.code} ${i.path}`);
/** Compiled valid schedule options */
function compiledOf(options: Record<string, unknown>): CompiledSchedule<unknown, string> {
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<unknown, string>(c, { weekdayValues: WEEK, ...options })!;
  assert.deepEqual(
    c.issues.filter((i) => i.severity === "error"),
    [],
  );
  return compiled;
}
/** Compiled options of a calendar: boolean values, and recurring rules that count the options' own business days */
function calendarOf(
  options: Record<string, unknown>,
  ...entries: Record<string, unknown>[]
): CompiledSchedule<unknown, string> {
  const c = new IssueCollector();
  const base = compiledOf({ weekdayValues: OPEN_WEEK, ...options });
  const recurring = entries.map((entry, i) =>
    compileRecurringRule(
      c,
      `closedRecurringRules[${i}]`,
      `closedRecurringRules[${i}]`,
      entry,
      () => ({ value: false }),
      RECURRING_RULE_KEYS,
      "calendar",
      "none",
    )!,
  );
  assert.deepEqual(issuesOf(c), []);
  return { ...base, recurring };
}
/** A basis that throws an error with the code in the given months and has every day otherwise; `calls` counts */
function throwingBasis(code: string, ...months: [number, number][]) {
  const calls: [number, number][] = [];
  const basis: BasisOfMonth = (year, month) => {
    calls.push([year, month]);
    if (months.some(([y, m]) => y === year && m === month))
      throw code === "TypeError"
        ? new TypeError("boom")
        : rangeError(code as never, "thrown by the basis");
    return Array.from({ length: 28 }, (_, i) => i + 1);
  };
  return { basis, calls };
}
/** Schedule options whose rules with a calendar get the given basis */
function withBasis(
  basis: BasisOfMonth,
  options: Record<string, unknown>,
): CompiledSchedule<unknown, string> {
  const compiled = compiledOf(options);
  return {
    ...compiled,
    recurring: compiled.recurring.map((r) => (r.calendar === null ? r : { ...r, basis })),
  };
}
const calendar = createCalendar({ closedWeekdays: [0, 6] });
/** The options with their bases wrapped, as the diagnostics pass them to unjudgeableDays */
const wrap = (compiled: CompiledSchedule<unknown, string>): CompiledSchedule<unknown, string> =>
  guardBases(compiled, new Set());
const windowOf = (from: string, to: string) => ({
  ranges: [{ from: day(from), to: day(to) }],
  label: "",
});
/** Holidays on 45 consecutive days from 2026-01-15 to 2026-02-28 */
const LONG_RUN = Array.from({ length: 45 }, (_, i) =>
  holiday(dateOfDayNumber(day("2026-01-15") + i)),
);

describe("checkProviderData", () => {
  const check = (...providers: HolidayProvider<string>[]) => {
    const c = new IssueCollector();
    const ok = checkProviderData(
      c,
      compiledOf({ holidayProvider: providers, timeZone: "UTC" }).source,
    );
    return { ok, issues: c.issues.map((i) => `${i.code} ${i.path}: ${i.message}`) };
  };
  test("true and no issue for valid data, and without providers", () => {
    assert.deepEqual(check(provider("A", 2000, 2050, [holiday("2026-11-23")])), {
      ok: true,
      issues: [],
    });
    assert.deepEqual(check(), { ok: true, issues: [] });
  });
  test("every supported year in the diagnostic range is validated, and no other year", () => {
    const years: number[] = [];
    const counting = (from: number, to: number) =>
      provider("A", from, to, [], {
        holidaysInYear: (year: number) => {
          years.push(year);
          return [];
        },
      });
    check(counting(2000, 2003));
    assert.deepEqual(years, [2000, 2001, 2002, 2003]);
    years.length = 0;
    check(counting(1900, 2200));
    assert.deepEqual(
      [years[0], years.at(-1), years.length],
      [DIAGNOSTIC_YEARS.from, DIAGNOSTIC_YEARS.to, DIAGNOSTIC_YEARS.to - DIAGNOSTIC_YEARS.from + 1],
    );
    years.length = 0;
    assert.equal(check(counting(1800, 1900)).ok, true);
    assert.deepEqual(years, []);
  });
  test("false and one invalid-provider-data error per failing provider, at the provider's path", () => {
    const bad = (id: string) =>
      provider(id, 2000, 2050, [
        holiday("2040-01-01"),
        holiday("2040-01-01"),
        { ...holiday("2041-01-01"), name: 1 } as never,
      ]);
    assert.deepEqual(check(bad("A")), {
      ok: false,
      issues: [
        "invalid-provider-data holidayProvider: Holiday provider A returned invalid data for 2040: duplicate date 2040-01-01",
      ],
    });
    const three = check(bad("A"), provider("B", 2000, 2050), bad("C"));
    assert.equal(three.ok, false);
    assert.deepEqual(
      three.issues.map((i) => i.split(":")[0]),
      ["invalid-provider-data holidayProvider[0]", "invalid-provider-data holidayProvider[2]"],
    );
  });
  test("a value that is not an Error thrown by a provider is reported with its string form", () => {
    const throwing = provider("A", 2000, 2050, [], {
      holidaysInYear: () => {
        // eslint-disable-next-line no-throw-literal -- the function handles a thrown value that is not an Error
        throw "broken";
      },
    });
    assert.deepEqual(check(throwing), {
      ok: false,
      issues: ["invalid-provider-data holidayProvider: Holiday provider threw broken"],
    });
  });
});

describe("guardBases", () => {
  const options = {
    recurringRules: [
      { weekday: 1, value: "W" },
      { businessDayOfMonth: 1, calendar, value: "R" },
    ],
  };
  test("the options themselves when no rule has a basis calendar", () => {
    const compiled = compiledOf({ recurringRules: [{ weekday: 1, value: "W" }] });
    assert.equal(guardBases(compiled, new Set()), compiled);
    const own = calendarOf({}, { businessDayOfMonth: 1 });
    assert.equal(guardBases(own, new Set()), own);
  });
  test("a copy whose rules with a basis calendar have a wrapped basis; other rules are kept", () => {
    const { basis } = throwingBasis("out-of-range");
    const compiled = withBasis(basis, options);
    const guarded = guardBases(compiled, new Set());
    assert.notEqual(guarded, compiled);
    assert.equal(guarded.recurring[0], compiled.recurring[0]);
    assert.notEqual(guarded.recurring[1]!.basis, basis);
    assert.deepEqual(guarded.recurring[1]!.basis!(2026, 11), basis(2026, 11));
    assert.equal(compiled.recurring[1]!.basis, basis);
  });
  test("a month in which the basis throws counts as a month without business days and is recorded, whatever is thrown", () => {
    for (const code of [
      "out-of-range",
      "unconfirmed-holiday",
      "holiday-run-too-long",
      "invalid-provider-data",
      "TypeError",
    ]) {
      const { basis, calls } = throwingBasis(code, [2026, 11]);
      const months = new Set<number>();
      const guarded = guardBases(withBasis(basis, options), months).recurring[1]!.basis!;
      assert.deepEqual(guarded(2026, 11), []);
      assert.deepEqual([...months], [monthIndex(2026, 11)]);
      // The same month is not evaluated again
      assert.deepEqual(guarded(2026, 11), []);
      assert.equal(calls.length, 1);
      assert.equal(guarded(2026, 12).length, 28);
      assert.deepEqual([...months], [monthIndex(2026, 11)]);
    }
  });
  test("every month is evaluated at most once: the first outcome is kept for the rest of the diagnosis", () => {
    // A basis that answers differently from call to call: business days first, then an exception
    let calls = 0;
    const unstable: BasisOfMonth = () => {
      if (++calls > 1) throw rangeError("out-of-range", "changed");
      return [1, 2, 3];
    };
    const months = new Set<number>();
    const guarded = guardBases(withBasis(unstable, options), months).recurring[1]!.basis!;
    assert.deepEqual(guarded(2026, 11), [1, 2, 3]);
    assert.deepEqual(guarded(2026, 11), [1, 2, 3]);
    assert.equal(calls, 1);
    assert.equal(months.size, 0);
    // Another month is evaluated once, throws, and stays a month without business days
    assert.deepEqual(guarded(2026, 12), []);
    assert.deepEqual(guarded(2026, 12), []);
    assert.equal(calls, 2);
    assert.deepEqual([...months], [monthIndex(2026, 12)]);
  });
});

describe("unjudgeableDays", () => {
  const monthRule = (extra: Record<string, unknown> = {}) => ({
    recurringRules: [{ businessDayOfMonth: 1, calendar, value: "R", ...extra }],
  });
  const weekRule = (extra: Record<string, unknown> = {}) => ({
    recurringRules: [{ businessDayOfWeek: 1, weekStart: 1, calendar, value: "R", ...extra }],
  });
  const find = (
    code: string,
    months: [number, number][],
    options: Record<string, unknown>,
    window: ReturnType<typeof windowOf> | undefined,
  ) => {
    const { basis } = throwingBasis(code, ...months);
    const { days, months: found } = unjudgeableDays(wrap(withBasis(basis, options)), window);
    return { days: dates(days), months: [...found] };
  };
  const NOV: [number, number][] = [[2026, 11]];
  const window = windowOf("2026-10-20", "2026-12-10");
  test("both empty without a window and without basis calendars", () => {
    assert.deepEqual(find("out-of-range", NOV, monthRule(), undefined), { days: [], months: [] });
    const own = unjudgeableDays(calendarOf({}, { businessDayOfMonth: 1 }), window);
    assert.deepEqual([own.days.size, own.months.size], [0, 0]);
  });
  test("month rule: the days of the window in a month in which the basis throws, whatever is thrown", () => {
    for (const code of [
      "out-of-range",
      "unconfirmed-holiday",
      "holiday-run-too-long",
      "invalid-provider-data",
      "TypeError",
    ]) {
      const found = find(code, NOV, monthRule(), window);
      assert.deepEqual(
        [found.days[0], found.days.at(-1), found.days.length],
        ["2026-11-01", "2026-11-30", 30],
      );
      assert.deepEqual(found.months, [monthIndex(2026, 11)]);
    }
    assert.deepEqual(
      find("out-of-range", NOV, monthRule(), windowOf("2026-11-28", "2026-12-10")).days,
      ["2026-11-28", "2026-11-29", "2026-11-30"],
    );
  });
  test("month rule: only days in the effective period and in the selected months", () => {
    const period = find(
      "out-of-range",
      NOV,
      monthRule({ effectiveFrom: "2026-11-15", effectiveTo: "2026-11-17" }),
      window,
    );
    assert.deepEqual(period.days, ["2026-11-15", "2026-11-16", "2026-11-17"]);
    assert.deepEqual(
      find("out-of-range", NOV, monthRule({ effectiveFrom: "2027-01-01" }), window),
      { days: [], months: [] },
    );
    // A month that is not selected is not evaluated
    assert.deepEqual(find("out-of-range", NOV, monthRule({ months: [10, 12] }), window), {
      days: [],
      months: [],
    });
    assert.equal(find("out-of-range", NOV, monthRule({ months: [11] }), window).days.length, 30);
  });
  test("the outcome of a month is the one the wrapped basis keeps; a month without business days that did not throw is judgeable", () => {
    // Throws on the first call only: the month is unjudgeable here and for the wrapped basis afterwards
    let calls = 0;
    const once: BasisOfMonth = () => {
      if (++calls === 1) throw new TypeError("boom");
      return [1];
    };
    const recorded = new Set<number>();
    const wrapped = guardBases(withBasis(once, monthRule()), recorded);
    const found = unjudgeableDays(wrapped, windowOf("2026-11-29", "2026-12-01"));
    assert.deepEqual(dates(found.days), ["2026-11-29", "2026-11-30"]);
    assert.deepEqual([...found.months], [monthIndex(2026, 11)]);
    assert.deepEqual([...recorded], [monthIndex(2026, 11)]);
    assert.deepEqual(wrapped.recurring[0]!.basis!(2026, 11), []);
    assert.deepEqual(wrapped.recurring[0]!.basis!(2026, 12), [1]);
    assert.equal(calls, 2);
    const empty = unjudgeableDays(
      wrap(withBasis(() => [], monthRule())),
      windowOf("2026-11-29", "2026-12-01"),
    );
    assert.deepEqual([empty.days.size, empty.months.size], [0, 0]);
  });
  test("week rule: the 7 days of each week that touches the window when the basis throws in a month of one of the 7 days", () => {
    // Weeks start on Monday; the week of Monday 30 November reaches into December
    const found = find(
      "out-of-range",
      [[2026, 12]],
      weekRule(),
      windowOf("2026-11-25", "2026-12-02"),
    );
    assert.deepEqual(found.days, [
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
      "2026-12-06",
    ]);
    assert.deepEqual(found.months, [monthIndex(2026, 12)]);
    const before = find("out-of-range", NOV, weekRule(), windowOf("2026-11-25", "2026-12-02"));
    assert.deepEqual(
      [before.days[0], before.days.at(-1), before.days.length],
      ["2026-11-23", "2026-12-06", 14],
    );
  });
  test("week rule: a week without a day of a selected month is skipped; every month that throws is recorded", () => {
    const selected = find(
      "out-of-range",
      [[2026, 12]],
      weekRule({ months: [11] }),
      windowOf("2026-11-25", "2026-12-20"),
    );
    assert.deepEqual(
      [selected.days[0], selected.days.at(-1), selected.days.length],
      ["2026-11-30", "2026-12-06", 7],
    );
    const both = find(
      "out-of-range",
      [
        [2026, 11],
        [2026, 12],
      ],
      weekRule(),
      windowOf("2026-11-30", "2026-11-30"),
    );
    assert.deepEqual(both.months.sort(), [monthIndex(2026, 11), monthIndex(2026, 12)]);
    assert.deepEqual(find("out-of-range", NOV, weekRule({ effectiveTo: "2026-10-01" }), window), {
      days: [],
      months: [],
    });
  });
  test("the days of several rules and ranges are collected", () => {
    const { basis } = throwingBasis("out-of-range", [2026, 11]);
    const compiled = withBasis(basis, {
      recurringRules: [
        { businessDayOfMonth: 1, calendar, value: "A", effectiveTo: "2026-11-02" },
        { businessDayOfMonth: 2, calendar, value: "B", effectiveFrom: "2026-11-29" },
      ],
    });
    const found = unjudgeableDays(wrap(compiled), {
      ranges: [
        ...windowOf("2026-10-30", "2026-11-01").ranges,
        ...windowOf("2026-11-28", "2026-12-05").ranges,
      ],
    });
    assert.deepEqual(dates(found.days), ["2026-11-01", "2026-11-29", "2026-11-30"]);
  });
});

describe("unjudgeableInDates", () => {
  test("the unjudgeable days in the periods of the specific dates, clipped to the diagnostic range", () => {
    const { basis } = throwingBasis("out-of-range", [2026, 11], [1954, 12], [1955, 1]);
    const compiled = withBasis(basis, {
      dates: [
        { from: "2026-11-10", to: "2026-11-12", value: "D" },
        { date: "2026-12-01", value: "D" },
        { date: "1954-12-31", value: "D" },
        { from: "1954-12-30", to: "1955-01-02", value: "D" },
      ],
      recurringRules: [{ businessDayOfMonth: 1, calendar, value: "R" }],
    });
    const found = unjudgeableInDates(wrap(compiled));
    assert.deepEqual(dates(found.days), [
      "1955-01-01",
      "1955-01-02",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
    assert.deepEqual([...found.months].sort(), [monthIndex(1955, 1), monthIndex(2026, 11)]);
  });
  test("empty without specific dates", () => {
    const { basis } = throwingBasis("out-of-range", [2026, 11]);
    const found = unjudgeableInDates(
      wrap(withBasis(basis, { recurringRules: [{ businessDayOfMonth: 1, calendar, value: "R" }] })),
    );
    assert.deepEqual([found.days.size, found.months.size], [0, 0]);
  });
});

describe("unsureOf", () => {
  const compiled = compiledOf({
    dates: [{ date: "2026-11-10", value: "D" }],
    annualDates: [{ date: "12-31", value: "A", effectiveFrom: "2027-01-01" }],
    recurringRules: [
      { weekday: 1, value: "R0", effectiveTo: "2026-10-31" },
      { weekday: 2, value: "R1" },
      { businessDayOfMonth: 1, calendar, value: "R2" },
      { businessDayOfMonth: 2, calendar, value: "R3", effectiveFrom: "2026-11-06" },
    ],
  });
  const unknown = (...days: string[]) => ({
    days: new Set(days.map(day)),
    months: new Set<number>(),
  });
  const inWindow = unsureOf(compiled, unknown("2026-11-05"));
  test("always false when no day is unjudgeable", () => {
    const none = unsureOf(compiled, unknown());
    assert.equal(none("redundant", "recurringRules[2]"), false);
    assert.equal(none("redundant", "elsewhere"), false);
  });
  test("always false for codes other than never-matches and redundant", () => {
    for (const code of ["shadowed", "no-business-day", "out-of-range"])
      assert.equal(inWindow(code, "recurringRules[2]"), false);
  });
  test("true when the path belongs to no rule", () => {
    assert.equal(inWindow("redundant", "holidayPolicy"), true);
    assert.equal(inWindow("never-matches", "recurringRules[20]"), true);
  });
  test("a recurring rule without a basis calendar: false for never-matches and for an option inside the rule", () => {
    assert.equal(inWindow("never-matches", "recurringRules[1]"), false);
    assert.equal(inWindow("redundant", "recurringRules[1].months"), false);
    assert.equal(inWindow("redundant", "recurringRules[1]"), true);
  });
  test("true when an unjudgeable day lies in the rule's effective period", () => {
    assert.equal(inWindow("redundant", "recurringRules[0]"), false);
    assert.equal(inWindow("redundant", "recurringRules[2]"), true);
    assert.equal(inWindow("never-matches", "recurringRules[2]"), true);
    assert.equal(inWindow("redundant", "recurringRules[2].months"), true);
    assert.equal(inWindow("never-matches", "recurringRules[3]"), false);
    assert.equal(
      unsureOf(compiled, unknown("2026-11-05", "2026-11-06"))("never-matches", "recurringRules[3]"),
      true,
    );
    assert.equal(inWindow("redundant", "annualDates[0]"), false);
    assert.equal(
      unsureOf(compiled, unknown("2026-11-05", "2027-02-01"))("redundant", "annualDates[0]"),
      true,
    );
  });
  test("a specific date: true when an unjudgeable day lies in its period; the days of the dates count for dates only", () => {
    assert.equal(inWindow("redundant", "dates[0]"), false);
    assert.equal(unsureOf(compiled, unknown("2026-11-10"))("redundant", "dates[0]"), true);
    const dated = unsureOf(compiled, unknown(), new Set([day("2026-11-10")]));
    assert.equal(dated("redundant", "dates[0]"), true);
    assert.equal(dated("redundant", "recurringRules[2]"), false);
    const mixed = unsureOf(compiled, unknown("2026-11-05"), new Set([day("2026-11-10")]));
    assert.equal(mixed("redundant", "dates[0]"), true);
    assert.equal(mixed("redundant", "recurringRules[2]"), true);
    assert.equal(mixed("redundant", "recurringRules[0]"), false);
  });
});

describe("dateUnitsOf", () => {
  const anyWindow = { ranges: [], label: "" };
  const own = (options: Record<string, unknown>) => calendarOf(options, { businessDayOfMonth: 1 });
  const units = (compiled: CompiledSchedule<unknown, string>) =>
    dateUnitsOf(anyWindow, compiled).map((r) => [dateOfDayNumber(r.from), dateOfDayNumber(r.to)]);
  test("empty without a window, without specific dates, and without a rule that counts the options' own business days", () => {
    assert.deepEqual(
      dateUnitsOf(undefined, own({ dates: [{ date: "2026-11-23", value: false }] })),
      [],
    );
    assert.deepEqual(units(own({})), []);
    assert.deepEqual(
      units(calendarOf({ dates: [{ date: "2026-11-23", value: false }] }, { weekday: 3 })),
      [],
    );
    const withCalendar = compiledOf({
      dates: [{ date: "2026-11-23", value: "D" }],
      recurringRules: [{ businessDayOfMonth: 1, calendar, value: "R" }],
    });
    assert.deepEqual(units(withCalendar), []);
  });
  test("the month of a date extended by 6 days on both sides", () => {
    assert.deepEqual(units(own({ dates: [{ date: "2026-11-23", value: false }] })), [
      ["2026-10-26", "2026-12-06"],
    ]);
    assert.deepEqual(units(own({ dates: [{ date: "2024-02-29", value: false }] })), [
      ["2024-01-26", "2024-03-06"],
    ]);
  });
  test("for the first and the last day of a range, merged", () => {
    assert.deepEqual(
      units(own({ dates: [{ from: "2026-11-28", to: "2026-12-02", value: false }] })),
      [["2026-10-26", "2027-01-06"]],
    );
    assert.deepEqual(
      units(own({ dates: [{ from: "2026-03-10", to: "2026-11-10", value: false }] })),
      [
        ["2026-02-23", "2026-04-06"],
        ["2026-10-26", "2026-12-06"],
      ],
    );
    assert.deepEqual(
      units(
        own({
          dates: [
            { date: "2026-11-23", value: false },
            { date: "2026-03-10", value: false },
            { date: "2026-12-24", value: false },
          ],
        }),
      ),
      [
        ["2026-02-23", "2026-04-06"],
        ["2026-10-26", "2027-01-06"],
      ],
    );
  });
  test("clipped to the judgeable span; a date outside it gives no range", () => {
    const limited = (date: string) =>
      own({ holidayProvider: provider("X", 2000, 2026), dates: [{ date, value: false }] });
    assert.deepEqual(units(limited("2026-12-10")), [["2026-11-25", "2026-12-31"]]);
    assert.deepEqual(units(limited("2000-01-10")), [["2000-01-01", "2000-02-06"]]);
    assert.deepEqual(units(limited("2030-06-15")), []);
    assert.deepEqual(units(own({ dates: [{ date: "1900-06-15", value: false }] })), []);
  });
});

describe("checkLostShifts", () => {
  const afterHoliday = {
    dayOfMonth: 20,
    months: [1],
    value: "R",
    holidayOverlapPolicy: "after-holiday",
  };
  const check = (
    compiled: CompiledSchedule<unknown, string>,
    ...window: [ReturnType<typeof rulesScanWindow>?]
  ) => {
    const c = new IssueCollector();
    checkLostShifts(
      c,
      compiled,
      createHolidayLookup({ ...compiled.source, unconfirmedHolidayPolicy: "accept" }),
      window.length > 0 ? window[0] : rulesScanWindow(compiled),
    );
    return c.issues;
  };
  test("one holiday-run-too-long warning per rule whose day cannot be moved, with the provider as the related path", () => {
    const compiled = compiledOf({
      holidayProvider: provider("X", 2000, 2050, LONG_RUN),
      recurringRules: [
        { weekday: 1, value: "W" },
        afterHoliday,
        { ...afterHoliday, dayOfMonth: 19 },
        { ...afterHoliday, dayOfMonth: 29 },
      ],
    });
    assert.deepEqual(check(compiled), [
      {
        severity: "warning",
        code: "holiday-run-too-long",
        path: "recurringRules[1]",
        message: lostShiftMessage("2026-03-01", "2026-01-20"),
        relatedPath: "holidayProvider",
      },
      {
        severity: "warning",
        code: "holiday-run-too-long",
        path: "recurringRules[2]",
        message: lostShiftMessage("2026-03-01", "2026-01-19"),
        relatedPath: "holidayProvider",
      },
    ]);
  });
  test("no related path with several providers", () => {
    const compiled = compiledOf({
      holidayProvider: [provider("X", 2000, 2050, LONG_RUN), provider("Y", 2000, 2050)],
      recurringRules: [afterHoliday],
    });
    assert.deepEqual(check(compiled), [
      {
        severity: "warning",
        code: "holiday-run-too-long",
        path: "recurringRules[0]",
        message: lostShiftMessage("2026-03-01", "2026-01-20"),
      },
    ]);
  });
  test("nothing without a window, without providers and without after-holiday rules", () => {
    const withAll = compiledOf({
      holidayProvider: provider("X", 2000, 2050, LONG_RUN),
      recurringRules: [afterHoliday],
    });
    assert.deepEqual(check(withAll, undefined), []);
    assert.deepEqual(check(compiledOf({ recurringRules: [afterHoliday] })), []);
    assert.deepEqual(
      check(
        compiledOf({
          holidayProvider: provider("X", 2000, 2050, LONG_RUN),
          recurringRules: [{ dayOfMonth: 20, months: [1], value: "R" }],
        }),
      ),
      [],
    );
  });
  test("nothing when every day can be moved, and only holiday runs inside the window are examined", () => {
    const short = compiledOf({
      holidayProvider: provider("X", 2000, 2050, LONG_RUN.slice(0, 20)),
      recurringRules: [afterHoliday],
    });
    assert.deepEqual(check(short), []);
    const withAll = compiledOf({
      holidayProvider: provider("X", 2000, 2050, LONG_RUN),
      recurringRules: [afterHoliday],
    });
    assert.deepEqual(check(withAll, windowOf("2027-01-01", "2028-12-31") as never), []);
  });
  test("a run made of holidays and skipped weekdays is found for a rule with skipWeekdays", () => {
    // Holidays on Monday to Friday from 2026-01-12 to 2026-02-27; with the weekends the run lasts 49 days
    const weekdays = Array.from({ length: 47 }, (_, i) => day("2026-01-12") + i)
      .map(dateOfDayNumber)
      .filter((date) => ![0, 6].includes(new Date(date).getUTCDay()))
      .map((date) => holiday(date));
    const compiled = compiledOf({
      holidayProvider: provider("X", 2000, 2050, weekdays),
      recurringRules: [
        {
          dayOfMonth: 13,
          months: [1],
          value: "R",
          holidayOverlapPolicy: "after-holiday",
          skipWeekdays: [0, 6],
        },
      ],
    });
    assert.deepEqual(
      check(compiled).map((i) => [i.path, i.message]),
      [["recurringRules[0]", lostShiftMessage("2026-03-02", "2026-01-13")]],
    );
  });
  test("an out-of-range error of a judgement at an end of the supported years is ignored", () => {
    const compiled = compiledOf({
      holidayProvider: provider("X", 2000, 2026, [holiday("2026-12-30")]),
      recurringRules: [
        { dayOfMonth: 13, value: "R", holidayOverlapPolicy: "after-holiday", skipWeekdays: [0] },
        { dayBeforeHoliday: true, value: "B" },
      ],
    });
    assert.deepEqual(check(compiled), []);
  });
  test("any other error of a judgement is thrown", () => {
    const base = compiledOf({
      holidayProvider: provider("X", 2000, 2050, [holiday("2026-11-23")]),
      recurringRules: [
        { dayOfMonth: 13, value: "R", holidayOverlapPolicy: "after-holiday", skipWeekdays: [0] },
        { businessDayOfMonth: 1, calendar, value: "B" },
      ],
    });
    const broken = {
      ...base,
      recurring: base.recurring.map((r) =>
        r.calendar === null ? r : { ...r, basis: throwingBasis("TypeError", [2026, 11]).basis },
      ),
    };
    assert.throws(() => check(broken), { name: "TypeError", message: "boom" });
  });
});

describe("dropUnsure", () => {
  const collector = () => {
    const c = new IssueCollector();
    c.warning("redundant", "dates[0]", "before");
    c.warning("shadowed", "recurringRules[1]", "after");
    c.warning("redundant", "recurringRules[2]", "after");
    return c;
  };
  const unknown = { days: new Set<number>(), months: new Set([monthIndex(2026, 11)]) };
  test("nothing happens when the recorded months were found beforehand and no withheld diagnostic was reported; the issues are not changed", () => {
    const c = collector();
    const before = [...c.issues];
    dropUnsure(
      c,
      1,
      (_code, path) => path === "dates[0]",
      new Set([monthIndex(2026, 11)]),
      unknown,
    );
    dropUnsure(c, 3, () => true, new Set(), unknown);
    assert.deepEqual(c.issues, before);
  });
  test("InternalError when a basis threw in a month not found beforehand", () => {
    assert.throws(
      () =>
        dropUnsure(
          collector(),
          1,
          () => false,
          new Set([monthIndex(2026, 11), monthIndex(2026, 12)]),
          unknown,
        ),
      {
        name: "InternalError",
        message: /a basis threw in a month that was not found beforehand: 24323/,
      },
    );
  });
  test("InternalError when a withheld diagnostic was reported by the rule diagnostics", () => {
    assert.throws(
      () =>
        dropUnsure(
          collector(),
          1,
          (code, path) => code === "redundant" && path === "recurringRules[2]",
          new Set(),
          unknown,
        ),
      {
        name: "InternalError",
        message: /a diagnostic about an unjudgeable month was left: redundant recurringRules\[2\]/,
      },
    );
  });
});

describe("analyze", () => {
  const run = (compiled: CompiledSchedule<unknown, string>, isCalendar = false) => {
    const c = new IssueCollector();
    c.warning("unknown-option", "extra", "recorded before");
    analyze(c, compiled, isCalendar);
    return issuesOf(c).slice(1);
  };
  test("the issues of the rule diagnostics are added to the collector", () => {
    const compiled = compiledOf({
      recurringRules: [
        { weekday: 1, value: "A" },
        { weekday: 1, nth: 1, value: "B" },
        { dayOfMonth: 31, months: [2], value: "C" },
      ],
    });
    assert.deepEqual(run(compiled), [
      "warning shadowed recurringRules[1]",
      "warning never-matches recurringRules[2]",
    ]);
    assert.deepEqual(run(compiledOf({})), []);
  });
  test("no-business-day is reported only for a business calendar", () => {
    const closed = compiledOf({ weekdayValues: [false, false, false, false, false, false, false] });
    assert.deepEqual(run(closed, true), ["warning no-business-day "]);
    assert.deepEqual(run(closed, false), []);
  });
  test("never-matches and redundant are withheld for a rule whose basis calendar cannot be judged on a day of its period", () => {
    const limited = createCalendar({
      holidayProvider: provider("X", 2020, 2030),
      closedWeekdays: [0, 6],
    });
    const never = (basis: unknown) =>
      compiledOf({ recurringRules: [{ businessDayOfMonth: 31, calendar: basis, value: "R" }] });
    assert.deepEqual(run(never(calendar)), ["warning never-matches recurringRules[0]"]);
    assert.deepEqual(run(never(limited)), []);
  });
});

describe("createRuleContext", () => {
  test("the collector, the options, the predicate, the cycle, the window and an empty set of unused rules", () => {
    const c = new IssueCollector();
    const compiled = compiledOf({
      recurringRules: [{ cycle: 5, anchor: "2026-11-23", positions: [1], value: "R" }],
    });
    const unsure = () => true;
    const ctx = createRuleContext(c, compiled, unsure);
    assert.equal(ctx.c, c);
    assert.equal(ctx.compiled, compiled);
    assert.equal(ctx.unsure, unsure);
    assert.equal(ctx.cycle, patternCycle(compiled.recurring));
    assert.deepEqual(ctx.rulesWindow, rulesScanWindow(compiled));
    assert.deepEqual(ctx.window, ctx.rulesWindow);
    assert.deepEqual(ctx.dateUnits, []);
    assert.deepEqual([ctx.basis, ctx.basisNoDates], [undefined, undefined]);
    assert.deepEqual([ctx.unused instanceof Set, ctx.unused.size], [true, 0]);
    assert.equal(c.issues.length, 0);
  });
  test("by default nothing is unsure", () => {
    assert.equal(
      createRuleContext(new IssueCollector(), compiledOf({})).unsure("redundant", "dates[0]"),
      false,
    );
  });
  test("lookup accepts unconfirmed holidays; strictLookup has the options' policy only when it is throw", () => {
    const unconfirmed = provider("X", 2000, 2050, [holiday("2030-03-20", { confirmed: false })]);
    const strict = createRuleContext(
      new IssueCollector(),
      compiledOf({
        holidayProvider: unconfirmed,
        unconfirmedHolidayPolicy: "throw",
        outOfRangePolicy: "ignore",
      }),
    );
    assert.equal(strict.lookup.holidayOfDate("2030-03-20")!.confirmed, false);
    assert.equal(strict.lookup.outOfRangePolicy, "ignore");
    assert.throws(() => strict.strictLookup!.holidayOfDate("2030-03-20"), {
      code: "unconfirmed-holiday",
    });
    const accepting = createRuleContext(
      new IssueCollector(),
      compiledOf({ holidayProvider: unconfirmed }),
    );
    assert.equal(accepting.strictLookup, null);
    assert.throws(() => accepting.lookup.holidayOfDate("2051-01-01"), { code: "out-of-range" });
  });
  test("with a rule that counts the options' own business days: basis with the specific dates", () => {
    const ctx = createRuleContext(new IssueCollector(), calendarOf({}, { businessDayOfMonth: 1 }));
    assert.deepEqual(ctx.basis!(2026, 11).slice(0, 3), [2, 3, 4]);
    assert.equal(ctx.basisNoDates, ctx.basis);
    assert.deepEqual(ctx.dateUnits, []);
  });
  test("with such a rule and specific dates: the date units, the window merged with them, and a basis without the dates", () => {
    const compiled = calendarOf(
      { dates: [{ date: "2040-06-15", value: false }] },
      { businessDayOfMonth: 1 },
    );
    const ctx = createRuleContext(new IssueCollector(), compiled);
    assert.deepEqual(ctx.dateUnits, [{ from: day("2040-05-26"), to: day("2040-07-06") }]);
    assert.deepEqual(ctx.rulesWindow, rulesScanWindow(compiled));
    assert.equal(ctx.window!.label, ctx.rulesWindow!.label);
    assert.ok(
      inRanges(ctx.window!.ranges, day("2040-05-26")) &&
        inRanges(ctx.window!.ranges, day("2040-07-06")),
    );
    assert.ok(
      ctx.rulesWindow!.ranges.every(
        (r) => inRanges(ctx.window!.ranges, r.from) && inRanges(ctx.window!.ranges, r.to),
      ),
    );
    assert.equal(ctx.basis!(2040, 6).includes(15), false);
    assert.equal(ctx.basisNoDates!(2040, 6).includes(15), true);
  });
});

describe("inRanges", () => {
  const ranges = [
    { from: 3, to: 5 },
    { from: 9, to: 9 },
  ];
  test("true when the day lies in one of the ranges, an end included", () => {
    for (const n of [3, 4, 5, 9]) assert.equal(inRanges(ranges, n), true);
  });
  test("false otherwise, and without ranges", () => {
    for (const n of [2, 6, 8, 10]) assert.equal(inRanges(ranges, n), false);
    assert.equal(inRanges([], 3), false);
  });
});

describe("resolverIn", () => {
  test("the plain resolver of the options when there are no date units", () => {
    const compiled = compiledOf({ dates: [{ date: "2026-11-24", value: "D" }] });
    const resolve = resolverIn(createRuleContext(new IssueCollector(), compiled), compiled);
    assert.equal(resolve("2026-11-24").day.value, "D");
    assert.equal(resolve("2026-11-25").day.value, "wed");
  });
  test("with date units: the specific dates of the options are kept on the days of the units and ignored on other days", () => {
    const compiled = calendarOf(
      { dates: [{ date: "2040-06-15", value: false }] },
      { businessDayOfMonth: 1 },
    );
    const ctx = createRuleContext(new IssueCollector(), compiled);
    const base = {
      ...compiled,
      dates: [
        ...compiled.dates,
        ...compiledOf({
          dates: [
            { date: "2026-11-24", value: "far" },
            { date: "2040-07-06", value: "near" },
          ],
        }).dates,
      ],
    };
    const resolve = resolverIn(ctx, base);
    assert.deepEqual(
      ["2040-06-15", "2040-07-06", "2040-07-07", "2026-11-24"].map((d) => resolve(d).day.value),
      [false, "near", false, true],
    );
    assert.equal(resolve("2040-06-15").day.reason, "date");
  });
  test("the given lookup is used instead of the context's", () => {
    const unconfirmed = provider("X", 2000, 2050, [holiday("2030-03-20", { confirmed: false })]);
    const compiled = compiledOf({
      holidayProvider: unconfirmed,
      unconfirmedHolidayPolicy: "throw",
    });
    const ctx = createRuleContext(new IssueCollector(), compiled);
    assert.equal(resolverIn(ctx, compiled)("2030-03-20").day.holiday!.confirmed, false);
    assert.throws(() => resolverIn(ctx, compiled, ctx.strictLookup!)("2030-03-20"), {
      code: "unconfirmed-holiday",
    });
  });
  test("a move out of reach throws, with and without date units", () => {
    const rules = { holidayProvider: provider("X", 2000, 2050, LONG_RUN) };
    const plain = compiledOf({
      ...rules,
      recurringRules: [
        { dayOfMonth: 20, months: [1], value: "R", holidayOverlapPolicy: "after-holiday" },
      ],
    });
    assert.throws(
      () => resolverIn(createRuleContext(new IssueCollector(), plain), plain)("2026-03-01"),
      { code: "holiday-run-too-long" },
    );
    const c = new IssueCollector();
    const shifting = compileRecurringRule(
      c,
      "r",
      "r",
      { dayOfMonth: 20, months: [1], holidayOverlapPolicy: "after-holiday" },
      () => ({ value: false }),
      RECURRING_RULE_KEYS,
      "calendar",
      "none",
    )!;
    const own = calendarOf(
      { ...rules, dates: [{ date: "2040-06-15", value: false }] },
      { businessDayOfMonth: 1 },
    );
    const withUnits = { ...own, recurring: [...own.recurring, shifting] };
    const ctx = createRuleContext(new IssueCollector(), withUnits);
    assert.equal(ctx.dateUnits.length, 1);
    assert.throws(() => resolverIn(ctx, withUnits)("2026-03-01"), { code: "holiday-run-too-long" });
  });
});

describe("reportOutsideRange", () => {
  test("an out-of-range warning that names the diagnostic range and what has no day in it", () => {
    const c = new IssueCollector();
    reportOutsideRange(c, "dates[0]", "date");
    reportOutsideRange(c, "recurringRules[1]", "effective period");
    const label = `${DIAGNOSTIC_YEARS.from}-${DIAGNOSTIC_YEARS.to}`;
    assert.deepEqual(c.issues, [
      {
        severity: "warning",
        code: "out-of-range",
        path: "dates[0]",
        message: `The date has no day in ${label}, the years the diagnostics examine, so it was not examined; check the year`,
      },
      {
        severity: "warning",
        code: "out-of-range",
        path: "recurringRules[1]",
        message: `The effective period has no day in ${label}, the years the diagnostics examine, so it was not examined; check the year`,
      },
    ]);
  });
});
