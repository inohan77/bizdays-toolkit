// Unit tests of the functions of src/core/diagnose.ts that report counting-basis, no-business-day and
// redundant, and of the entry points of the diagnostics. One describe per function, named after the function;
// each test is one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCalendar } from "../../../src/core/calendar.ts";
import {
  analyzeRules,
  checkExpired,
  checkUnconfirmedOption,
  compileDiagnoseOptions,
  countingUnitsOf,
  dateRemoval,
  diagnoseCalendar,
  diagnoseSchedule,
  DIAGNOSTIC_YEARS,
  FAILED,
  originalOf,
  ownCountingUnits,
  relatedPathOf,
  removalKeeps,
  reportCountingBasis,
  reportNoBusinessDay,
  reportRedundant,
  resolverIn,
  ruleRemoval,
  run,
} from "../../../src/core/diagnose.ts";
import { internalError, IssueCollector, rangeError } from "../../../src/core/errors.ts";
import {
  compileScheduleOptions,
  createResolver,
  dateOfDayNumber,
  throwLostShift,
  weekdayOfDate,
  type CompiledSchedule,
} from "../../../src/core/schedule.ts";
import {
  calendarOf,
  compiledOf,
  contextOf,
  day,
  holiday,
  holidayRun,
  issuesOf,
  provider,
  WEEK,
} from "./diagnose-support.ts";

const LABEL = `${DIAGNOSTIC_YEARS.from}-${DIAGNOSTIC_YEARS.to}`;
const calendar = createCalendar({ closedWeekdays: [0, 6] });
const dates = (days: Iterable<number>): string[] =>
  [...days].sort((a, b) => a - b).map(dateOfDayNumber);
const messagesOf = (ctx: { readonly c: IssueCollector }): string[] =>
  ctx.c.issues.map((i) => i.message);
const ALL_CLOSED = [false, false, false, false, false, false, false];
const LONG_RUN = holidayRun("2026-01-15", 45);
/** The plain resolver of compiled options with the context's lookup */
const plain = (ctx: ReturnType<typeof contextOf>, compiled: CompiledSchedule<unknown, string>) =>
  createResolver(compiled, ctx.lookup, throwLostShift);
const days = (from: string, to: string): number[] =>
  Array.from({ length: day(to) - day(from) + 1 }, (_, i) => day(from) + i);

describe("reportCountingBasis", () => {
  const report = (
    entries: Record<string, unknown>[],
    unused: number[] = [],
    options: Record<string, unknown> = {},
  ) => {
    const ctx = contextOf(calendarOf(options, ...entries));
    for (const i of unused) ctx.unused.add(ctx.compiled.recurring[i]!);
    reportCountingBasis(ctx);
    return ctx;
  };
  test("info for a rule that counts the options' own business days and a weekly weekday rule that closes an open weekday", () => {
    const ctx = report([{ businessDayOfMonth: 1 }, { weekday: 3 }]);
    assert.deepEqual(issuesOf(ctx), [
      "info counting-basis closedRecurringRules[0] <- closedRecurringRules[1]",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      "The business days are counted without recurring rules, so the weekday rule closedRecurringRules[1] does not reduce the count; write regular closed weekdays as closedWeekdays if they should not be counted",
    );
  });
  test("a weekday rule that opens a closed weekday: its days are not counted", () => {
    const ctx = report([
      { businessDayOfWeek: 1, weekStart: 1 },
      { weekday: 6, value: true },
    ]);
    assert.deepEqual(issuesOf(ctx), [
      "info counting-basis closedRecurringRules[0] <- closedRecurringRules[1]",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      "The business days are counted without recurring rules, so the days opened by the weekday rule closedRecurringRules[1] are not counted",
    );
  });
  test("one info per pair of a counting rule and such a weekday rule", () => {
    const ctx = report([
      { weekday: 3 },
      { businessDayOfMonth: 1 },
      { weekday: 4 },
      { businessDayOfMonth: 2 },
    ]);
    assert.deepEqual(issuesOf(ctx), [
      "info counting-basis closedRecurringRules[1] <- closedRecurringRules[0]",
      "info counting-basis closedRecurringRules[1] <- closedRecurringRules[2]",
      "info counting-basis closedRecurringRules[3] <- closedRecurringRules[0]",
      "info counting-basis closedRecurringRules[3] <- closedRecurringRules[2]",
    ]);
  });
  test("not for a weekday rule with nth, interval or months, with the value of closedWeekdays, or that is unused", () => {
    assert.deepEqual(issuesOf(report([{ businessDayOfMonth: 1 }, { weekday: 3, nth: 1 }])), []);
    assert.deepEqual(
      issuesOf(
        report([{ businessDayOfMonth: 1 }, { weekday: 3, interval: 2, anchor: "2026-11-25" }]),
      ),
      [],
    );
    assert.deepEqual(
      issuesOf(report([{ businessDayOfMonth: 1 }, { weekday: 3, months: [5] }])),
      [],
    );
    assert.deepEqual(issuesOf(report([{ businessDayOfMonth: 1 }, { weekday: 6 }])), []);
    assert.deepEqual(
      issuesOf(report([{ businessDayOfMonth: 1 }, { weekday: 3, value: true }])),
      [],
    );
    assert.deepEqual(issuesOf(report([{ businessDayOfMonth: 1 }, { dayOfMonth: 3 }])), []);
    assert.deepEqual(issuesOf(report([{ businessDayOfMonth: 1 }, { weekday: 3 }], [1])), []);
  });
  test("not when the effective periods do not overlap", () => {
    assert.deepEqual(
      issuesOf(
        report([
          { businessDayOfMonth: 1, effectiveTo: "2026-12-31" },
          { weekday: 3, effectiveFrom: "2027-01-01" },
        ]),
      ),
      [],
    );
    assert.equal(
      report([
        { businessDayOfMonth: 1, effectiveTo: "2027-01-01" },
        { weekday: 3, effectiveFrom: "2027-01-01" },
      ]).c.issues.length,
      1,
    );
  });
  test("not for a rule with a basis calendar, and not without a counting rule", () => {
    const ctx = contextOf(
      compiledOf({
        recurringRules: [
          { businessDayOfMonth: 1, calendar, value: "R" },
          { weekday: 3, value: "W" },
        ],
      }),
    );
    reportCountingBasis(ctx);
    assert.deepEqual(issuesOf(ctx), []);
    assert.deepEqual(issuesOf(report([{ weekday: 3 }])), []);
  });
});

describe("reportNoBusinessDay", () => {
  const report = (compiled: CompiledSchedule<unknown, string>) => {
    const ctx = contextOf(compiled);
    reportNoBusinessDay(ctx);
    return ctx;
  };
  test("a warning at the root when no examined day is a business day", () => {
    const ctx = report(calendarOf({ weekdayValues: ALL_CLOSED }));
    assert.deepEqual(issuesOf(ctx), ["warning no-business-day "]);
    assert.equal(
      messagesOf(ctx)[0],
      `No day is a business day with these options (checked ${ctx.window!.label}); searching for a business day throws`,
    );
    assert.deepEqual(
      issuesOf(
        report(
          calendarOf(
            {},
            { weekday: 1 },
            { weekday: 2 },
            { weekday: 3 },
            { weekday: 4 },
            { weekday: 5 },
          ),
        ),
      ),
      ["warning no-business-day "],
    );
  });
  test("nothing when a day is a business day", () => {
    assert.deepEqual(issuesOf(report(calendarOf({}))), []);
    assert.deepEqual(
      issuesOf(
        report(
          calendarOf({ weekdayValues: ALL_CLOSED }, { dayOfMonth: 29, months: [2], value: true }),
        ),
      ),
      [],
    );
  });
  test("not examined when a specific date opens a day, and without a window", () => {
    assert.deepEqual(
      issuesOf(
        report(
          calendarOf({ weekdayValues: ALL_CLOSED, dates: [{ date: "2026-11-23", value: true }] }),
        ),
      ),
      [],
    );
    const apart = {
      holidayProvider: [provider("A", 2000, 2010), provider("B", 2020, 2030)],
      timeZone: "UTC",
    };
    assert.deepEqual(issuesOf(report(calendarOf({ ...apart, weekdayValues: ALL_CLOSED }))), []);
  });
  test("the window is judged without the specific dates: dates that close days do not make a calendar without business days", () => {
    const closure = { dates: [{ from: "1955-01-01", to: "2099-12-31", value: false }] };
    assert.deepEqual(issuesOf(report(calendarOf(closure))), []);
  });
  test("with date units their days are judged with the specific dates", () => {
    const closed = calendarOf(
      { weekdayValues: ALL_CLOSED, dates: [{ date: "2040-06-15", value: false }] },
      { businessDayOfMonth: 1 },
    );
    const ctx = report(closed);
    assert.equal(ctx.dateUnits.length, 1);
    assert.deepEqual(issuesOf(ctx), ["warning no-business-day "]);
  });
  test("a day whose judgement throws holiday-run-too-long or at an edge of the supported years is not a business day", () => {
    const lost = calendarOf(
      {
        holidayProvider: provider("X", 2000, 2050, LONG_RUN),
        weekdayValues: ALL_CLOSED,
        holidayPolicy: { value: false },
      },
      {
        dayOfMonth: 20,
        months: [1],
        value: true,
        holidayOverlapPolicy: "after-holiday",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
      },
    );
    assert.deepEqual(issuesOf(report(lost)), ["warning no-business-day "]);
    const edge = calendarOf(
      {
        holidayProvider: provider("X", 2000, 2050, [holiday("2000-01-01")]),
        weekdayValues: ALL_CLOSED,
      },
      { dayAfterHoliday: true, value: true, effectiveTo: "2000-01-01" },
    );
    assert.deepEqual(issuesOf(report(edge)), ["warning no-business-day "]);
  });
  test("any other error of a judgement is thrown", () => {
    const base = compiledOf({
      weekdayValues: ALL_CLOSED,
      recurringRules: [{ businessDayOfMonth: 1, calendar, value: false }],
    });
    const broken = {
      ...base,
      recurring: base.recurring.map((r) => ({
        ...r,
        basis: () => {
          throw new TypeError("boom");
        },
      })),
    };
    assert.throws(() => report(broken), { name: "TypeError", message: "boom" });
  });
});

describe("countingUnitsOf", () => {
  test("the given days when no month and no week is counted", () => {
    assert.deepEqual(dates(countingUnitsOf([day("2026-11-23"), day("2026-12-01")], false, [])), [
      "2026-11-23",
      "2026-12-01",
    ]);
    assert.equal(countingUnitsOf([], true, [1]).size, 0);
  });
  test("with countsMonth: every day of the months of the days", () => {
    const units = dates(countingUnitsOf([day("2024-02-10"), day("2026-11-30")], true, []));
    assert.deepEqual(
      [units[0], units[28], units[29], units.at(-1), units.length],
      ["2024-02-01", "2024-02-29", "2026-11-01", "2026-11-30", 59],
    );
  });
  test("per week start: the 7 days of the weeks of the days", () => {
    // 2026-11-25 is a Wednesday
    assert.deepEqual(dates(countingUnitsOf([day("2026-11-25")], false, [1])), [
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ]);
    const two = dates(countingUnitsOf([day("2026-11-25")], false, [1, 4]));
    assert.deepEqual([two[0], two.at(-1), two.length], ["2026-11-19", "2026-11-29", 11]);
    assert.deepEqual(dates(countingUnitsOf([day("2026-11-23")], false, [1]))[0], "2026-11-23");
  });
  test("months and weeks together", () => {
    const units = dates(countingUnitsOf([day("2026-11-30")], true, [1]));
    assert.deepEqual([units[0], units.at(-1), units.length], ["2026-11-01", "2026-12-06", 36]);
  });
});

describe("originalOf", () => {
  test("the value of a day, or FAILED when the judgement throws; each day is judged once", () => {
    const calls: string[] = [];
    const original = originalOf(((date: string) => {
      calls.push(date);
      if (date === "2026-11-24") throw new RangeError("boom");
      return { day: { value: date === "2026-11-25" ? undefined : `v${date}` }, rule: null };
    }) as never);
    assert.equal(original(day("2026-11-23")), "v2026-11-23");
    assert.equal(original(day("2026-11-24")), FAILED);
    assert.equal(original(day("2026-11-25")), undefined);
    assert.equal(original(day("2026-11-23")), "v2026-11-23");
    assert.equal(original(day("2026-11-24")), FAILED);
    assert.equal(original(day("2026-11-25")), undefined);
    assert.deepEqual(calls, ["2026-11-23", "2026-11-24", "2026-11-25"]);
  });
});

describe("removalKeeps", () => {
  const november = days("2026-11-01", "2026-11-30");
  /** Whether removing the first recurring rule keeps the results of the days */
  const keeps = (
    options: Record<string, unknown>,
    on: number[] = november,
    split = false,
    remove = 0,
  ) => {
    const compiled = compiledOf(options);
    const ctx = contextOf(compiled);
    const resolve = split ? resolverIn(ctx, compiled) : plain(ctx, compiled);
    return removalKeeps(ctx, compiled.recurring[remove]!, compiled, on, originalOf(resolve), split);
  };
  test("true when the value of every day is the same without the rule", () => {
    assert.equal(keeps({ recurringRules: [{ weekday: 1, value: "mon" }] }), true);
    assert.equal(
      keeps({
        recurringRules: [
          { weekday: 1, value: ["x", { y: 1 }] },
          { weekday: 1, value: ["x", { y: 1 }] },
        ],
      }),
      true,
    );
    assert.equal(keeps({ recurringRules: [{ weekday: 1, value: "X" }] }, []), true);
  });
  test("false as soon as a value differs", () => {
    assert.equal(keeps({ recurringRules: [{ weekday: 1, value: "X" }] }), false);
    assert.equal(
      keeps({ recurringRules: [{ weekday: 1, value: "X" }] }, [day("2026-11-24")]),
      true,
    );
  });
  test("a day that throws on one side only differs; a day that throws on both sides is unchanged", () => {
    const options = {
      holidayProvider: provider("X", 2000, 2050, LONG_RUN),
      recurringRules: [
        { dayOfMonth: 20, months: [1], value: "sun", holidayOverlapPolicy: "after-holiday" },
        { weekday: 2, value: "tue" },
      ],
    };
    const lostDay = [day("2026-03-01"), day("2026-03-02"), day("2026-03-03")];
    assert.equal(keeps(options, lostDay, false, 0), false);
    assert.equal(keeps(options, lostDay, false, 1), true);
    assert.equal(keeps(options, [day("2026-03-02")], false, 0), true);
  });
  test("with unconfirmedHolidayPolicy throw: a day on which only one side throws unconfirmed-holiday differs", () => {
    const after = WEEK[weekdayOfDate("2030-03-21")];
    const options = (policy: string) => ({
      holidayProvider: provider("X", 2000, 2050, [holiday("2030-03-20", { confirmed: false })]),
      unconfirmedHolidayPolicy: policy,
      recurringRules: [{ dayAfterHoliday: true, value: after }],
    });
    const on = [day("2030-03-21"), day("2030-03-22")];
    assert.equal(keeps(options("accept"), on), true);
    assert.equal(keeps(options("throw"), on), false);
    assert.equal(keeps(options("throw"), [day("2030-03-22")]), true);
    // The day of the unconfirmed holiday throws on both sides
    assert.equal(keeps(options("throw"), [day("2030-03-20")]), true);
  });
  test("without split every specific date is kept; with split the dates are ignored outside the date units", () => {
    const base = calendarOf(
      {
        dates: [
          { date: "2040-06-15", value: false },
          { date: "2026-11-24", value: false },
        ],
      },
      { businessDayOfMonth: 1 },
      { dayOfMonth: 24, months: [11], effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" },
    );
    // Only the date of 2040 makes a date unit in this context
    const ctx = contextOf({ ...base, dates: base.dates.slice(0, 1) });
    const rule = base.recurring[1]!;
    const on = [day("2026-11-24")];
    assert.equal(removalKeeps(ctx, rule, base, on, originalOf(plain(ctx, base))), true);
    assert.equal(removalKeeps(ctx, rule, base, on, originalOf(resolverIn(ctx, base)), true), false);
  });
});

describe("relatedPathOf", () => {
  const compiled = compiledOf({
    dates: [{ date: "2026-11-24", value: "D" }],
    recurringRules: [{ weekday: 1, value: "R" }],
  });
  const resolve = plain(contextOf(compiled), compiled);
  test("the path of the single rule that decides every day", () => {
    assert.equal(
      relatedPathOf(resolve, [day("2026-11-23"), day("2026-11-30")]),
      "recurringRules[0]",
    );
    assert.equal(relatedPathOf(resolve, [day("2026-11-24")]), "dates[0]");
  });
  test("undefined when different rules or a weekday decide some days, and without days", () => {
    assert.equal(relatedPathOf(resolve, [day("2026-11-23"), day("2026-11-24")]), undefined);
    assert.equal(relatedPathOf(resolve, [day("2026-11-23"), day("2026-11-25")]), undefined);
    assert.equal(relatedPathOf(resolve, [day("2026-11-25")]), undefined);
    assert.equal(relatedPathOf(resolve, []), undefined);
  });
  test("undefined when a day throws", () => {
    const limited = compiledOf({
      holidayProvider: provider("X", 2000, 2050),
      recurringRules: [{ weekday: 1, value: "R" }],
    });
    const throwing = plain(contextOf(limited), limited);
    assert.equal(relatedPathOf(throwing, [day("2050-12-26")]), "recurringRules[0]");
    assert.equal(relatedPathOf(throwing, [day("2050-12-26"), day("2051-01-02")]), undefined);
    assert.equal(relatedPathOf(throwing, [day("2051-01-02")]), undefined);
  });
});

describe("ownCountingUnits", () => {
  const on = [day("2026-11-25")];
  test("counts is false without a rule that counts the options' own business days; the units are the days", () => {
    const withCalendar = compiledOf({
      recurringRules: [
        { businessDayOfMonth: 1, calendar, value: "R" },
        { weekday: 1, value: "W" },
      ],
    });
    const units = ownCountingUnits(withCalendar.recurring);
    assert.equal(units.counts, false);
    assert.deepEqual(dates(units.of(on)), ["2026-11-25"]);
    assert.equal(ownCountingUnits([]).counts, false);
  });
  test("with a month rule the units are the months of the days", () => {
    const units = ownCountingUnits(
      calendarOf({}, { weekday: 3 }, { businessDayOfMonth: 1 }).recurring,
    );
    assert.equal(units.counts, true);
    assert.equal(units.of(on).size, 30);
  });
  test("with week rules the units are the weeks of the days, per distinct week start", () => {
    const one = ownCountingUnits(
      calendarOf({}, { businessDayOfWeek: 1, weekStart: 1 }, { businessDayOfWeek: 2, weekStart: 1 })
        .recurring,
    );
    assert.deepEqual([one.counts, one.of(on).size], [true, 7]);
    const two = ownCountingUnits(
      calendarOf({}, { businessDayOfWeek: 1, weekStart: 1 }, { businessDayOfWeek: 1, weekStart: 4 })
        .recurring,
    );
    assert.equal(two.of(on).size, 11);
    const both = ownCountingUnits(
      calendarOf({}, { businessDayOfWeek: 1, weekStart: 1 }, { businessDayOfMonth: 1 }).recurring,
    );
    assert.equal(both.of(on).size, 30);
    assert.equal(both.of([day("2026-11-30")]).size, 36);
  });
});

describe("dateRemoval", () => {
  /** The removal of the specific date at the index */
  const removal = (compiled: CompiledSchedule<unknown, string>, index = 0) => {
    const ctx = contextOf(compiled);
    const found = dateRemoval(
      ctx,
      compiled.dates[index]!,
      compiled,
      ownCountingUnits(compiled.recurring),
    );
    return (
      found && {
        message: found.message,
        decided: dates(found.decided),
        affected: dates(found.affected),
      }
    );
  };
  test("the removal when no result changes: the days the date decided and no affected day", () => {
    const compiled = compiledOf({
      dates: [{ from: "2026-11-23", to: "2026-11-24", value: "mon" }],
      recurringRules: [{ dayOfMonth: 24, value: "mon" }],
    });
    assert.deepEqual(removal(compiled), {
      message: "Removing this rule does not change any result",
      decided: ["2026-11-23", "2026-11-24"],
      affected: [],
    });
  });
  test("undefined when a result changes", () => {
    assert.equal(
      removal(compiledOf({ dates: [{ from: "2026-11-23", to: "2026-11-24", value: "mon" }] })),
      undefined,
    );
  });
  test("never used when earlier dates decide all of its days", () => {
    const compiled = compiledOf({
      dates: [
        { from: "2026-11-20", to: "2026-11-22", value: "A" },
        { from: "2026-11-23", to: "2026-11-25", value: "B" },
        { from: "2026-11-21", to: "2026-11-24", value: "C" },
      ],
    });
    assert.deepEqual(removal(compiled, 2), {
      message: "This rule is never used: earlier rules cover all of its days",
      decided: [],
      affected: [],
    });
  });
  test("only the part of the period in the diagnostic range is examined, with the note", () => {
    const compiled = compiledOf({
      dates: [{ from: "1954-12-30", to: "1955-01-02", value: WEEK[weekdayOfDate("1955-01-01")] }],
      recurringRules: [{ dayOfMonth: 2, value: WEEK[weekdayOfDate("1955-01-01")] }],
    });
    assert.deepEqual(removal(compiled), {
      message: `Removing this rule does not change any result (checked ${LABEL} only)`,
      decided: ["1955-01-01", "1955-01-02"],
      affected: [],
    });
  });
  test("undefined when no day of the period can be judged", () => {
    const compiled = compiledOf({
      holidayProvider: provider("X", 2000, 2050),
      dates: [{ date: "2060-01-01", value: WEEK[weekdayOfDate("2060-01-01")] }],
    });
    assert.equal(removal(compiled), undefined);
    const ignoring = compiledOf({
      holidayProvider: provider("X", 2000, 2050),
      outOfRangePolicy: "ignore",
      dates: [{ date: "2060-01-01", value: WEEK[weekdayOfDate("2060-01-01")] }],
    });
    assert.equal(removal(ignoring)!.message, "Removing this rule does not change any result");
  });
  test("with rules that count the options' own business days: compared on the counting units of the period, which are the affected days", () => {
    // Saturday 7 November 2026 is closed anyway
    const saturday = removal(
      calendarOf({ dates: [{ date: "2026-11-07", value: false }] }, { businessDayOfMonth: 1 }),
    );
    assert.equal(saturday!.message, "Removing this rule does not change any result");
    assert.deepEqual(saturday!.decided, ["2026-11-07"]);
    assert.deepEqual(
      [saturday!.affected[0], saturday!.affected.at(-1), saturday!.affected.length],
      ["2026-11-01", "2026-11-30", 30],
    );
    // Monday 2 November is closed with and without the date (it is the first business day, which the rule
    // closes), but with the date the first business day is the 3rd
    const monday = calendarOf(
      { dates: [{ date: "2026-11-02", value: false }] },
      { businessDayOfMonth: 1 },
    );
    assert.equal(removal(monday), undefined);
    const ctx = contextOf(monday);
    const notCounting = dateRemoval(ctx, monday.dates[0]!, monday, {
      counts: false,
      of: (on) => new Set(on),
    });
    assert.deepEqual(dates(notCounting!.decided), ["2026-11-02"]);
  });
});

describe("ruleRemoval", () => {
  const compiled = compiledOf({
    recurringRules: [
      {
        dayOfMonth: 2,
        months: [11],
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
        value: "mon",
      },
      {
        dayOfMonth: 3,
        months: [11],
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
        value: "X",
      },
    ],
  });
  const ctx = contextOf(compiled);
  const never = (): unknown => {
    throw new Error("the original results are not asked");
  };
  test("the removal when no result changes on the days the rule decides, whose original result is the rule's value", () => {
    const on = [day("2026-11-02")];
    const found = ruleRemoval(ctx, compiled.recurring[0]!, compiled, on, on, never, "2001-2028")!;
    assert.equal(
      found.message,
      "Removing this rule does not change any result (checked 2001-2028)",
    );
    assert.equal(found.decided, on);
    assert.deepEqual(dates(found.affected), ["2026-11-02", "2026-11-02"]);
  });
  test("undefined when a result changes", () => {
    const on = [day("2026-11-03")];
    assert.equal(
      ruleRemoval(ctx, compiled.recurring[1]!, compiled, on, on, never, "2001-2028"),
      undefined,
    );
  });
  test("never used when the rule decides no day", () => {
    const none: number[] = [];
    const found = ruleRemoval(
      ctx,
      compiled.recurring[0]!,
      compiled,
      none,
      none,
      never,
      "2001-2028",
    )!;
    assert.equal(
      found.message,
      "This rule is never used: other rules decide every day it matches (checked 2001-2028)",
    );
    assert.deepEqual([...found.affected], []);
  });
  test("other days to compare are compared with the original results; the affected days are both", () => {
    const decided = [day("2026-11-02")];
    const checked = new Set([day("2026-11-02"), day("2026-11-03"), day("2026-11-04")]);
    const original = originalOf(resolverIn(ctx, compiled));
    const found = ruleRemoval(
      ctx,
      compiled.recurring[0]!,
      compiled,
      decided,
      checked,
      original,
      "2001-2028",
    )!;
    assert.equal(
      found.message,
      "Removing this rule does not change any result (checked 2001-2028)",
    );
    assert.deepEqual(dates(found.affected), [
      "2026-11-02",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
    assert.equal(
      ruleRemoval(ctx, compiled.recurring[1]!, compiled, [], checked, original, "2001-2028"),
      undefined,
    );
    const wrong = (n: number): unknown => (n === day("2026-11-04") ? "other" : original(n));
    assert.equal(
      ruleRemoval(ctx, compiled.recurring[0]!, compiled, decided, checked, wrong, "2001-2028"),
      undefined,
    );
  });
});

describe("reportRedundant", () => {
  const report = (
    compiled: CompiledSchedule<unknown, string>,
    unsure?: (code: string, path: string) => boolean,
    unused: string[] = [],
  ) => {
    const ctx = contextOf(compiled, unsure);
    for (const r of [...compiled.dates, ...compiled.annual, ...compiled.recurring])
      if (unused.includes(r.path)) ctx.unused.add(r);
    reportRedundant(ctx);
    return ctx;
  };
  const in2026 = { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" };
  test("redundant (info) for a rule whose removal changes no result", () => {
    const ctx = report(
      compiledOf({
        recurringRules: [
          { weekday: 1, value: "mon" },
          { weekday: 2, value: "X" },
        ],
      }),
    );
    assert.deepEqual(issuesOf(ctx), ["info redundant recurringRules[0]"]);
    assert.equal(
      messagesOf(ctx)[0],
      `Removing this rule does not change any result (checked ${ctx.window!.label})`,
    );
  });
  test("the related path is the single rule that decides the rule's days after the removal", () => {
    const ctx = report(
      compiledOf({
        recurringRules: [
          { dayOfMonth: 2, months: [11], ...in2026, value: "X" },
          { weekday: 1, value: "X" },
        ],
      }),
    );
    assert.deepEqual(issuesOf(ctx), ["info redundant recurringRules[0] <- recurringRules[1]"]);
  });
  test("never used when other rules decide every day the rule matches", () => {
    const ctx = report(
      compiledOf({
        annualDates: [{ date: "11-02", ...in2026, value: "A" }],
        recurringRules: [{ dayOfMonth: 2, months: [11], ...in2026, value: "X" }],
      }),
    );
    assert.deepEqual(issuesOf(ctx), ["info redundant recurringRules[0]"]);
    assert.equal(
      messagesOf(ctx)[0],
      `This rule is never used: other rules decide every day it matches (checked ${ctx.window!.label})`,
    );
  });
  test("annual dates and recurring rules are judged without the specific dates outside the date units", () => {
    // The date decides 2 November 2026, but without it the rule decides that day with another value
    const ctx = report(
      compiledOf({
        dates: [{ date: "2026-11-02", value: "D" }],
        recurringRules: [{ dayOfMonth: 2, months: [11], ...in2026, value: "X" }],
      }),
    );
    assert.deepEqual(issuesOf(ctx), []);
  });
  test("sequential removal: the reported rules can be removed together", () => {
    // Each of the two rules can be removed alone, but not both
    const ctx = report(
      compiledOf({
        annualDates: [{ date: "11-02", ...in2026, value: "X" }],
        recurringRules: [{ dayOfMonth: 2, months: [11], ...in2026, value: "X" }],
      }),
    );
    assert.deepEqual(issuesOf(ctx), ["info redundant annualDates[0] <- recurringRules[0]"]);
    // Three rules with the same effect: all but the last can be removed
    const three = report(
      compiledOf({
        dates: [{ date: "2026-11-02", value: "X" }],
        annualDates: [{ date: "11-02", ...in2026, value: "X" }],
        recurringRules: [{ dayOfMonth: 2, months: [11], ...in2026, value: "X" }],
      }),
    );
    assert.deepEqual(issuesOf(three), [
      "info redundant dates[0] <- recurringRules[0]",
      "info redundant annualDates[0] <- recurringRules[0]",
    ]);
  });
  test("reported in the order specific dates, annual dates, recurring rules", () => {
    const ctx = report(
      compiledOf({
        dates: [
          { date: "2026-11-23", value: "mon" },
          { date: "2026-11-24", value: "X" },
          { date: "2026-11-25", value: "wed" },
        ],
        annualDates: [{ date: "11-26", ...in2026, value: "thu" }],
        recurringRules: [{ weekday: 5, value: "fri" }],
      }),
    );
    assert.deepEqual(issuesOf(ctx), [
      "info redundant dates[0]",
      "info redundant dates[2]",
      "info redundant annualDates[0]",
      "info redundant recurringRules[0]",
    ]);
    assert.equal(messagesOf(ctx)[0], "Removing this rule does not change any result");
  });
  test("the unused rules are removed first and are not reported", () => {
    const options = {
      recurringRules: [
        { weekday: 1, value: "X" },
        { weekday: 1, nth: 1, value: "X" },
        { weekday: 2, value: "tue" },
      ],
    };
    assert.deepEqual(issuesOf(report(compiledOf(options), undefined, ["recurringRules[1]"])), [
      "info redundant recurringRules[2]",
    ]);
    // Without the first rule, the second decides the first Monday with another value than the weekday
    assert.deepEqual(issuesOf(report(compiledOf(options), undefined, ["recurringRules[0]"])), [
      "info redundant recurringRules[2]",
    ]);
    assert.deepEqual(
      issuesOf(
        report(compiledOf({ dates: [{ date: "2026-11-23", value: "mon" }] }), undefined, [
          "dates[0]",
        ]),
      ),
      [],
    );
  });
  test("rules for which the predicate holds are not judged", () => {
    const compiled = compiledOf({
      dates: [{ date: "2026-11-23", value: "mon" }],
      annualDates: [{ date: "11-26", ...in2026, value: "thu" }],
      recurringRules: [{ weekday: 5, value: "fri" }],
    });
    const asked: string[] = [];
    const ctx = report(compiled, (code, path) => {
      asked.push(`${code} ${path}`);
      return path !== "recurringRules[0]";
    });
    assert.deepEqual(issuesOf(ctx), ["info redundant recurringRules[0]"]);
    assert.ok(asked.every((a) => a.startsWith("redundant ")));
    assert.deepEqual(issuesOf(report(compiled, () => true)), []);
  });
  test("nothing when no rule can be removed, and without rules", () => {
    assert.deepEqual(
      issuesOf(
        report(
          compiledOf({
            dates: [{ date: "2026-11-23", value: "D" }],
            annualDates: [{ date: "12-31", value: "A" }],
            recurringRules: [{ weekday: 1, value: "R" }],
          }),
        ),
      ),
      [],
    );
    assert.deepEqual(issuesOf(report(compiledOf({}))), []);
  });
  test("without a window annual dates and recurring rules are not judged", () => {
    const apart = {
      holidayProvider: [provider("A", 2000, 2010), provider("B", 2020, 2030)],
      timeZone: "UTC",
    };
    const ctx = report(
      compiledOf({
        ...apart,
        dates: [{ date: "2026-11-23", value: "mon" }],
        recurringRules: [{ weekday: 1, value: "mon" }],
      }),
    );
    assert.equal(ctx.window, undefined);
    assert.deepEqual(issuesOf(ctx), []);
  });
  test("a day that cannot be judged is decided by no rule and stays out of the comparison", () => {
    // 2050-12-31 looks at the day after, outside the supported years, and throws
    const ctx = report(
      compiledOf({
        holidayProvider: provider("X", 2000, 2050),
        recurringRules: [
          { dayBeforeHoliday: true, value: "B" },
          { weekday: 1, value: "mon" },
        ],
      }),
    );
    assert.deepEqual(issuesOf(ctx), [
      "info redundant recurringRules[0]",
      "info redundant recurringRules[1]",
    ]);
  });
  test("after a removal, a day that could not be judged at first is not judged again", () => {
    // 26 December 2026 is a Saturday. The counting unit of the annual date is December, whose last day looks
    // at 2027-01-01, outside the supported years, and throws
    const ctx = report(
      calendarOf(
        {
          holidayProvider: provider("X", 2000, 2026),
          annualDates: [{ date: "12-26", ...in2026, value: false }],
        },
        { businessDayOfMonth: 1 },
        { dayBeforeHoliday: true },
      ),
    );
    assert.deepEqual(issuesOf(ctx), [
      "info redundant annualDates[0]",
      "info redundant closedRecurringRules[1]",
    ]);
  });
  test("with rules that count the options' own business days, an annual date is compared on its counting units", () => {
    // 7 November is a Saturday in 2026; 2 November 2026 is the first business day of its month
    const saturday = report(
      calendarOf(
        { annualDates: [{ date: "11-07", ...in2026, value: false }] },
        { businessDayOfMonth: 1 },
      ),
    );
    assert.deepEqual(issuesOf(saturday), ["info redundant annualDates[0]"]);
    const monday = report(
      calendarOf(
        { annualDates: [{ date: "11-02", ...in2026, value: false }] },
        { businessDayOfMonth: 1 },
      ),
    );
    assert.deepEqual(issuesOf(monday), []);
    const dated = report(
      calendarOf(
        {
          dates: [
            { date: "2026-11-07", value: false },
            { date: "2026-11-02", value: false },
          ],
        },
        { businessDayOfMonth: 1 },
      ),
    );
    assert.deepEqual(issuesOf(dated), ["info redundant dates[0]"]);
  });
});

describe("analyzeRules", () => {
  const analyzed = (
    compiled: CompiledSchedule<unknown, string>,
    isCalendar: boolean,
    unsure?: (code: string, path: string) => boolean,
  ) => {
    const c = new IssueCollector();
    analyzeRules(c, compiled, isCalendar, unsure);
    return issuesOf({ c });
  };
  test("the steps run in a fixed order, which is the order of the issues", () => {
    const compiled = calendarOf(
      {
        holidayProvider: provider("X", 2000, 2050, LONG_RUN),
        dates: [
          { date: "2060-01-01", value: false },
          // A Saturday, closed anyway
          { date: "2026-11-21", value: false },
        ],
        annualDates: [
          { date: "12-31", value: false },
          { date: "12-31", value: false },
          { date: "12-30", value: false, effectiveFrom: "2051-01-01" },
        ],
      },
      { dayOfMonth: 20, months: [1], holidayOverlapPolicy: "after-holiday" },
      { dayOfMonth: 31, months: [2] },
      { businessDayOfMonth: 1 },
      { weekday: 3 },
      { weekday: 3 },
    );
    assert.deepEqual(analyzed(compiled, true), [
      "warning holiday-run-too-long closedRecurringRules[0] <- holidayProvider",
      "warning out-of-range dates[0] <- holidayProvider",
      "warning out-of-range annualDates[2] <- holidayProvider",
      "warning shadowed annualDates[1] <- annualDates[0]",
      "warning never-matches closedRecurringRules[1]",
      "warning shadowed closedRecurringRules[4] <- closedRecurringRules[3]",
      "info counting-basis closedRecurringRules[2] <- closedRecurringRules[3]",
      "info redundant dates[1]",
    ]);
    // no-business-day comes before redundant
    assert.deepEqual(analyzed(calendarOf({ weekdayValues: ALL_CLOSED }, { weekday: 1 }), true), [
      "warning no-business-day ",
      "info redundant closedRecurringRules[0]",
    ]);
  });
  test("no-business-day only for a business calendar", () => {
    const closed = calendarOf({ weekdayValues: ALL_CLOSED });
    assert.deepEqual(analyzed(closed, true), ["warning no-business-day "]);
    assert.deepEqual(analyzed(closed, false), []);
  });
  test("stops at provider data errors", () => {
    const bad = provider("X", 2000, 2050, [holiday("2040-01-01"), holiday("2040-01-01")]);
    const compiled = compiledOf({
      holidayProvider: bad,
      recurringRules: [
        { weekday: 1, value: "A" },
        { weekday: 1, value: "B" },
      ],
    });
    assert.deepEqual(analyzed(compiled, false), ["error invalid-provider-data holidayProvider"]);
  });
  test("diagnostics for which the predicate holds are not reported; by default nothing is unsure", () => {
    const compiled = compiledOf({
      recurringRules: [
        { dayOfMonth: 31, months: [2], value: "A" },
        { weekday: 1, value: "mon" },
      ],
    });
    assert.deepEqual(analyzed(compiled, false), [
      "warning never-matches recurringRules[0]",
      "info redundant recurringRules[1]",
    ]);
    assert.deepEqual(
      analyzed(compiled, false, (code) => code === "redundant"),
      ["warning never-matches recurringRules[0]"],
    );
    assert.deepEqual(
      analyzed(compiled, false, () => true),
      [],
    );
  });
});

describe("compileDiagnoseOptions", () => {
  test("asOf as a day number, or null when not given", () => {
    assert.deepEqual(compileDiagnoseOptions(undefined), { asOf: null });
    assert.deepEqual(compileDiagnoseOptions({}), { asOf: null });
    assert.deepEqual(compileDiagnoseOptions({ asOf: undefined }), { asOf: null });
    assert.deepEqual(compileDiagnoseOptions({ asOf: "2026-11-23" }), { asOf: day("2026-11-23") });
  });
  test("unknown keys are ignored", () => {
    assert.deepEqual(compileDiagnoseOptions({ asOf: "2026-11-23", other: 1 }), {
      asOf: day("2026-11-23"),
    });
  });
  test("invalid-argument when it is not an object", () => {
    for (const options of [null, "2026-11-23", 5, []])
      assert.throws(() => compileDiagnoseOptions(options), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("invalid-date when asOf is not a date string", () => {
    for (const asOf of ["2026-02-30", "2026/11/23", 20261123, null, new Date(0)])
      assert.throws(() => compileDiagnoseOptions({ asOf }), {
        name: "RangeError",
        code: "invalid-date",
      });
  });
});

describe("checkExpired", () => {
  const expired = (compiled: CompiledSchedule<unknown, string>, asOf: string) => {
    const c = new IssueCollector();
    checkExpired(c, compiled, day(asOf));
    return c.issues.map((i) => `${i.severity} ${i.code} ${i.path}: ${i.message}`);
  };
  const TAIL = "it no longer affects results and can be removed if the past need not be reproduced";
  const options = {
    dates: [
      { date: "2026-11-23", value: false },
      { from: "2026-11-20", to: "2026-11-24", value: false },
    ],
    annualDates: [
      { date: "12-31", value: false, effectiveTo: "2026-11-23" },
      { date: "12-30", value: false },
      { date: "12-29", value: false, effectiveFrom: "2020-01-01" },
    ],
    recurringRules: [
      { weekday: 1, value: false, effectiveTo: "2026-11-23" },
      { weekday: 2, value: false },
    ],
  };
  test("info for every specific date and every rule with effectiveTo that ended before asOf", () => {
    assert.deepEqual(expired(compiledOf(options), "2026-11-24"), [
      `info expired dates[0]: This date ended on 2026-11-23, before 2026-11-24; ${TAIL}`,
      `info expired annualDates[0]: This rule ended on 2026-11-23, before 2026-11-24; ${TAIL}`,
      `info expired recurringRules[0]: This rule ended on 2026-11-23, before 2026-11-24; ${TAIL}`,
    ]);
    assert.equal(expired(compiledOf(options), "2026-11-25").length, 4);
  });
  test("an item ending on asOf is not expired", () => {
    assert.deepEqual(expired(compiledOf(options), "2026-11-23"), []);
  });
  test("with a rule that counts the business days of a month, dates and annual dates reach to the end of the month", () => {
    const compiled = calendarOf(options, { businessDayOfMonth: 1 });
    assert.deepEqual(expired(compiled, "2026-11-30"), []);
    const why =
      "(it could affect results until 2026-11-30: a rule counting the business days of a month or week counts it)";
    assert.deepEqual(expired(compiled, "2026-12-01"), [
      `info expired dates[0]: This date ended on 2026-11-23 ${why}, before 2026-12-01; ${TAIL}`,
      `info expired dates[1]: This date ended on 2026-11-24 ${why}, before 2026-12-01; ${TAIL}`,
      `info expired annualDates[0]: This rule ended on 2026-11-23 ${why}, before 2026-12-01; ${TAIL}`,
    ]);
  });
  test("with a rule that counts the business days of a week, they reach 6 days further", () => {
    const compiled = calendarOf(
      {
        dates: [
          { date: "2026-11-23", value: false },
          { date: "2026-11-30", value: false },
        ],
      },
      { businessDayOfWeek: 1, weekStart: 1 },
    );
    assert.deepEqual(expired(compiled, "2026-11-29"), []);
    assert.deepEqual(expired(compiled, "2026-11-30"), [
      `info expired dates[0]: This date ended on 2026-11-23 (it could affect results until 2026-11-29: a rule counting the business days of a month or week counts it), before 2026-11-30; ${TAIL}`,
    ]);
    // With both kinds of rule the later of the two days is taken
    const both = calendarOf(
      {
        dates: [
          { date: "2026-11-23", value: false },
          { date: "2026-11-30", value: false },
        ],
      },
      { businessDayOfWeek: 1, weekStart: 1 },
      { businessDayOfMonth: 1 },
    );
    assert.deepEqual(
      expired(both, "2026-12-07").map((m) => m.slice(0, 95)),
      [
        "info expired dates[0]: This date ended on 2026-11-23 (it could affect results until 2026-11-30:",
        "info expired dates[1]: This date ended on 2026-11-30 (it could affect results until 2026-12-06:",
      ],
    );
    assert.equal(expired(both, "2026-12-06").length, 1);
  });
  test("a rule with a basis calendar does not extend the reach, and recurring rules are not extended by counting rules", () => {
    const withCalendar = compiledOf({
      dates: [{ date: "2026-11-23", value: "D" }],
      recurringRules: [{ businessDayOfMonth: 1, calendar, value: "R" }],
    });
    assert.equal(expired(withCalendar, "2026-11-24").length, 1);
    const own = calendarOf(
      {},
      { businessDayOfMonth: 1 },
      { weekday: 1, effectiveTo: "2026-11-23" },
    );
    assert.deepEqual(expired(own, "2026-11-24"), [
      `info expired closedRecurringRules[1]: This rule ended on 2026-11-23, before 2026-11-24; ${TAIL}`,
    ]);
  });
  test("an after-holiday rule reaches 31 days further", () => {
    const compiled = compiledOf({
      recurringRules: [
        {
          weekday: 1,
          value: "R",
          effectiveTo: "2026-11-23",
          holidayOverlapPolicy: "after-holiday",
        },
      ],
    });
    assert.deepEqual(expired(compiled, "2026-12-24"), []);
    assert.deepEqual(expired(compiled, "2026-12-25"), [
      `info expired recurringRules[0]: This rule ended on 2026-11-23 (it could affect results until 2026-12-24: a day moved by "after-holiday" falls at most 31 days after it), before 2026-12-25; ${TAIL}`,
    ]);
  });
});

describe("checkUnconfirmedOption", () => {
  const check = (options: Record<string, unknown>) => {
    const c = new IssueCollector();
    checkUnconfirmedOption(c, compiledOf(options));
    return c.issues.map((i) => `${i.severity} ${i.code} ${i.path}: ${i.message}`);
  };
  const x = provider("X", 2000, 2050);
  test("redundant (info) for unconfirmedHolidayPolicy throw without a provider", () => {
    assert.deepEqual(check({ unconfirmedHolidayPolicy: "throw", holidayPolicy: { value: "H" } }), [
      'info redundant unconfirmedHolidayPolicy: unconfirmedHolidayPolicy: "throw" has no effect: there is no holiday provider',
    ]);
  });
  test("redundant (info) when the results do not depend on holidays", () => {
    assert.deepEqual(
      check({
        holidayProvider: x,
        unconfirmedHolidayPolicy: "throw",
        recurringRules: [{ weekday: 1, value: "R" }],
      }),
      [
        'info redundant unconfirmedHolidayPolicy: unconfirmedHolidayPolicy: "throw" has no effect on results: holidays are not used (holidayPolicy: "ignore" and no holiday-based, "after-holiday" or "over-holiday" rule); dayInfoOn still throws when it looks up the holiday to report',
      ],
    );
  });
  test("nothing when the results depend on holidays, and with the policy accept", () => {
    assert.deepEqual(
      check({
        holidayProvider: x,
        unconfirmedHolidayPolicy: "throw",
        holidayPolicy: { value: "H" },
      }),
      [],
    );
    assert.deepEqual(
      check({
        holidayProvider: x,
        unconfirmedHolidayPolicy: "throw",
        recurringRules: [{ holiday: true, value: "R" }],
      }),
      [],
    );
    assert.deepEqual(check({}), []);
    assert.deepEqual(check({ holidayProvider: x }), []);
  });
});

describe("run", () => {
  /** Compiles schedule options and runs all diagnostics */
  const diagnose = (options: unknown, asOf: string | null = null, isCalendar = false) => {
    const c = new IssueCollector();
    const compiled = compileScheduleOptions<unknown, string>(c, options);
    return run(c, compiled, isCalendar, asOf === null ? null : day(asOf));
  };
  const summary = (found: readonly { severity: string; code: string; path: string }[]) =>
    found.map((i) => `${i.severity} ${i.code} ${i.path}`);
  test("frozen diagnostics with only the public properties", () => {
    const found = diagnose({
      weekdayValues: WEEK,
      recurringRules: [
        { weekday: 1, value: "A" },
        { weekday: 1, value: "B" },
      ],
    });
    assert.deepEqual(found, [
      {
        severity: "warning",
        code: "shadowed",
        path: "recurringRules[1]",
        message:
          "This rule is never used: the earlier rule recurringRules[0] covers all of its days",
        relatedPath: "recurringRules[0]",
      },
    ]);
    assert.ok(Object.isFrozen(found) && Object.isFrozen(found[0]));
    assert.deepEqual(diagnose({ weekdayValues: WEEK }), []);
  });
  test("with validation errors, only the validation issues", () => {
    const found = diagnose(
      {
        weekdayValues: WEEK,
        extra: 1,
        dates: [{ date: "2026-02-30", value: "D" }],
        recurringRules: [
          { weekday: 1, value: "A" },
          { weekday: 1, value: "B" },
        ],
      },
      "2030-01-01",
    );
    assert.deepEqual(summary(found), [
      "warning unknown-option extra",
      "error invalid-date dates[0].date",
    ]);
    assert.deepEqual(summary(diagnose(null)), ["error invalid-option "]);
  });
  test("expired is reported only with asOf, before the unconfirmedHolidayPolicy check and the rule diagnostics", () => {
    const options = {
      weekdayValues: WEEK,
      unconfirmedHolidayPolicy: "throw",
      dates: [{ date: "2026-11-23", value: "mon" }],
    };
    assert.deepEqual(summary(diagnose(options, "2026-11-24")), [
      "info expired dates[0]",
      "info redundant unconfirmedHolidayPolicy",
      "info redundant dates[0]",
    ]);
    assert.deepEqual(summary(diagnose(options)), [
      "info redundant unconfirmedHolidayPolicy",
      "info redundant dates[0]",
    ]);
  });
  test("no-business-day for a business calendar", () => {
    assert.deepEqual(summary(diagnose({ weekdayValues: ALL_CLOSED }, null, true)), [
      "warning no-business-day ",
    ]);
    assert.deepEqual(summary(diagnose({ weekdayValues: ALL_CLOSED })), []);
  });
  test("an unknown key gets a suggestion when a key is close enough", () => {
    const found = diagnose({
      weekdayValues: WEEK,
      holidayPolcy: "ignore",
      zzz: 1,
      recurringRules: [{ weekdya: 1, weekday: 1, value: "X" }],
    });
    assert.deepEqual(
      found.map((i) => [i.path, / \(did you mean "[A-Za-z]+"\?\)$/.exec(i.message)?.[0]]),
      [
        ["holidayPolcy", ' (did you mean "holidayPolicy"?)'],
        ["zzz", undefined],
        ["recurringRules[0].weekdya", ' (did you mean "weekday"?)'],
      ],
    );
    assert.ok(found.every((i) => !("unknownKey" in i) && !("knownKeys" in i)));
  });
  test("kinds national with the Japanese provider and other providers: the message explains what it matches", () => {
    const options = (holidayProvider: unknown) => ({
      holidayProvider,
      timeZone: "UTC",
      weekdayValues: WEEK,
      recurringRules: [{ holiday: true, kinds: ["national"], value: "R" }],
    });
    const jp = provider("JP", 2000, 2050, [holiday("2026-11-23")]);
    const other = provider("X", 2000, 2050, [holiday("2026-11-03", { kind: "national" })]);
    const mixed = diagnose(options([jp, other]));
    assert.deepEqual(summary(mixed), ["warning deprecated-option recurringRules[0].kinds[0]"]);
    assert.equal(
      mixed[0]!.message,
      '"national" was renamed to "regular" in 0.30.0; here it matches Japan\'s "regular" and other providers\' "national" holidays. From 1.0.0 it is an invalid-option with a "JP" provider: wrap the Japanese provider and rename your own "national" kind (see the migration guide)',
    );
    assert.ok(!("nationalInUnion" in mixed[0]!));
    assert.equal(
      diagnose(options(jp))[0]!.message,
      '"national" was renamed to "regular" in 0.30.0',
    );
  });
  test("when a provider throws during the rule diagnostics, their issues are replaced by one error at holidayProvider", () => {
    /** A provider that answers the first pass over its years and throws afterwards */
    const failingLater = (thrown: unknown) => {
      const seen = new Set<number>();
      return provider("X", 2000, 2003, [], {
        holidaysInYear: (year: number) => {
          if (seen.has(year)) throw thrown;
          seen.add(year);
          return [];
        },
      });
    };
    const options = (thrown: unknown) => ({
      holidayProvider: failingLater(thrown),
      weekdayValues: WEEK,
      unconfirmedHolidayPolicy: "throw",
      recurringRules: [{ weekday: 1, value: "R", holidayOverlapPolicy: "after-holiday" }],
    });
    const outOfRange = diagnose(options(rangeError("out-of-range", "late out of range")));
    assert.deepEqual(
      outOfRange.map((i) => `${i.severity} ${i.code} ${i.path}: ${i.message}`),
      ["error out-of-range holidayProvider: late out of range"],
    );
    const other = diagnose(options(new TypeError("late failure")));
    assert.deepEqual(
      other.map((i) => `${i.severity} ${i.code} ${i.path}: ${i.message}`),
      ["error invalid-provider-data holidayProvider: late failure"],
    );
    for (const thrown of ["text", null])
      assert.deepEqual(
        diagnose(options(thrown)).map((i) => `${i.code} ${i.path}: ${i.message}`),
        [`invalid-provider-data holidayProvider: ${String(thrown)}`],
      );
  });
  test("the issues recorded before the rule diagnostics are kept when a provider throws", () => {
    const seen = new Set<number>();
    const failing = provider("X", 2000, 2003, [], {
      holidaysInYear: (year: number) => {
        if (seen.has(year)) throw new TypeError("late failure");
        seen.add(year);
        return [];
      },
    });
    const found = diagnose(
      {
        holidayProvider: failing,
        weekdayValues: WEEK,
        extra: 1,
        dates: [{ date: "2001-01-01", value: "D" }],
        recurringRules: [{ weekday: 1, value: "R", holidayOverlapPolicy: "after-holiday" }],
      },
      "2030-01-01",
    );
    assert.deepEqual(summary(found), [
      "warning unknown-option extra",
      "info expired dates[0]",
      "error invalid-provider-data holidayProvider",
    ]);
  });
  test("an InternalError raised inside the rule diagnostics is thrown", () => {
    // No input reaches the watches of the rule diagnostics, so the error is raised by a stand-in for compiled
    // options whose rules cannot be read
    const c = new IssueCollector();
    const base = compileScheduleOptions<unknown, string>(c, { weekdayValues: WEEK })!;
    const broken = Object.defineProperty({ ...base }, "recurring", {
      get: () => {
        throw internalError("raised for the test");
      },
    });
    assert.throws(() => run(c, broken, false, null), {
      name: "InternalError",
      message: /raised for the test/,
    });
  });
  test("an object shaped like a calendar that changes how it answers during one diagnosis does not make the diagnostics throw", () => {
    let calls = 0;
    const unstable = {
      timeZone: "UTC",
      isBusinessDay: () => {
        if (++calls > 40000) throw rangeError("out-of-range", "changed");
        return true;
      },
    };
    assert.deepEqual(
      diagnose({
        weekdayValues: WEEK,
        recurringRules: [{ businessDayOfMonth: 1, calendar: unstable, value: "R" }],
      }),
      [],
    );
  });
});

describe("diagnoseCalendar", () => {
  const summary = (found: readonly { severity: string; code: string; path: string }[]) =>
    found.map((i) => `${i.severity} ${i.code} ${i.path}`);
  test("an empty frozen array when there is no problem, also without options", () => {
    const found = diagnoseCalendar();
    assert.deepEqual(found, []);
    assert.ok(Object.isFrozen(found));
    assert.deepEqual(diagnoseCalendar({ closedWeekdays: [0, 6] }), []);
  });
  test("the problems of calendar options", () => {
    assert.deepEqual(summary(diagnoseCalendar({ closedWeekdays: [0, 1, 2, 3, 4, 5, 6] })), [
      "warning no-business-day ",
    ]);
    assert.deepEqual(summary(diagnoseCalendar({ closedDates: ["2026-11-23", "2026-11-23"] })), [
      "warning shadowed closedDates[1]",
    ]);
    assert.deepEqual(
      summary(diagnoseCalendar({ closedWeekdays: [0, 6], closedRecurringRules: [{ weekday: 6 }] })),
      ["info redundant closedRecurringRules[0]"],
    );
  });
  test("values of the wrong type are reported and never throw; with an error the relations between rules are not examined", () => {
    assert.deepEqual(
      summary(diagnoseCalendar({ closedWeekdays: [7], closedDates: ["2026-11-23", "2026-11-23"] })),
      ["error invalid-weekday closedWeekdays[0]"],
    );
    assert.deepEqual(summary(diagnoseCalendar(null as never)), ["error invalid-option "]);
    assert.deepEqual(summary(diagnoseCalendar({ closedWeekday: [0] })), [
      "warning unknown-option closedWeekday",
    ]);
  });
  test("with asOf, rules that ended before that date are reported as expired", () => {
    assert.deepEqual(
      summary(diagnoseCalendar({ closedDates: ["2026-11-24"] }, { asOf: "2026-11-25" })),
      ["info expired closedDates[0]"],
    );
    assert.deepEqual(
      summary(diagnoseCalendar({ closedDates: ["2026-11-24"] }, { asOf: "2026-11-24" })),
      [],
    );
    assert.deepEqual(summary(diagnoseCalendar({ closedDates: ["2026-11-24"] }, {})), []);
  });
  test("RangeError for an invalid second argument", () => {
    assert.throws(() => diagnoseCalendar({}, null as never), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.throws(() => diagnoseCalendar({}, { asOf: "2026-02-30" }), {
      name: "RangeError",
      code: "invalid-date",
    });
  });
});

describe("diagnoseSchedule", () => {
  const summary = (found: readonly { severity: string; code: string; path: string }[]) =>
    found.map((i) => `${i.severity} ${i.code} ${i.path}`);
  test("an empty frozen array when there is no problem", () => {
    const found = diagnoseSchedule({ weekdayValues: WEEK });
    assert.deepEqual(found, []);
    assert.ok(Object.isFrozen(found));
  });
  test("the problems of schedule options; no-business-day is not reported for a schedule", () => {
    assert.deepEqual(
      summary(
        diagnoseSchedule({
          weekdayValues: WEEK,
          recurringRules: [
            { weekday: 1, value: "A" },
            { weekday: 1, value: "B" },
          ],
        }),
      ),
      ["warning shadowed recurringRules[1]"],
    );
    assert.deepEqual(summary(diagnoseSchedule({ weekdayValues: ALL_CLOSED })), []);
  });
  test("values are compared by content for arrays and plain objects and by Object.is otherwise", () => {
    const week = (value: unknown) => [value, value, value, value, value, value, value];
    assert.deepEqual(
      summary(
        diagnoseSchedule({
          weekdayValues: week({ a: [1] }),
          recurringRules: [{ weekday: 1, value: { a: [1] } }],
        }),
      ),
      ["info redundant recurringRules[0]"],
    );
    assert.deepEqual(
      summary(
        diagnoseSchedule({
          weekdayValues: week(new Date(0)),
          recurringRules: [{ weekday: 1, value: new Date(0) }],
        }),
      ),
      [],
    );
    assert.deepEqual(
      summary(
        diagnoseSchedule({
          weekdayValues: week(Number.NaN),
          recurringRules: [{ weekday: 1, value: Number.NaN }],
        }),
      ),
      ["info redundant recurringRules[0]"],
    );
  });
  test("values of the wrong type are reported and never throw; with an error the relations between rules are not examined", () => {
    assert.deepEqual(summary(diagnoseSchedule({})), ["error invalid-option weekdayValues"]);
    assert.deepEqual(summary(diagnoseSchedule(null as never)), ["error invalid-option "]);
    assert.deepEqual(
      summary(
        diagnoseSchedule({
          weekdayValues: [1],
          recurringRules: [
            { weekday: 1, value: "A" },
            { weekday: 1, value: "B" },
          ],
        }),
      ),
      ["error invalid-option weekdayValues"],
    );
  });
  test("with asOf, rules that ended before that date are reported as expired", () => {
    const options = {
      weekdayValues: WEEK,
      recurringRules: [{ weekday: 1, value: "R", effectiveTo: "2026-11-23" }],
    };
    assert.deepEqual(summary(diagnoseSchedule(options, { asOf: "2026-11-24" })), [
      "info expired recurringRules[0]",
    ]);
    assert.deepEqual(summary(diagnoseSchedule(options)), []);
  });
  test("RangeError for an invalid second argument", () => {
    assert.throws(() => diagnoseSchedule({ weekdayValues: WEEK }, "2026-11-24" as never), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.throws(() => diagnoseSchedule({ weekdayValues: WEEK }, { asOf: 20261124 as never }), {
      name: "RangeError",
      code: "invalid-date",
    });
  });
});
