// Unit tests of the functions of src/core/diagnose.ts that report problems of single rules and of pairs of
// rules: out-of-range, shadowed and never-matches. One describe per function, named after the function; each
// test is one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCalendar } from "../../../src/core/calendar.ts";
import {
  businessDayRuleMatches,
  createKindsOf,
  DIAGNOSTIC_YEARS,
  holidayOfSafe,
  holidayRuleMatches,
  patternBits,
  reportDateIssues,
  reportPeriodsOutOfRange,
  reportRecurring,
  reportShadowedAnnual,
  ruleCovers,
  sameSkip,
  setCovers,
} from "../../../src/core/diagnose.ts";
import { createHolidayLookup, type RecurringRuleCompiled } from "../../../src/core/schedule.ts";
import {
  calendarOf,
  compiledOf,
  contextOf,
  holiday,
  issuesOf,
  provider,
  unusedOf,
} from "./diagnose-support.ts";

const LABEL = `${DIAGNOSTIC_YEARS.from}-${DIAGNOSTIC_YEARS.to}`;
const NOTE = ` (checked ${LABEL} only)`;
const calendar = createCalendar({ closedWeekdays: [0, 6] });
const messagesOf = (ctx: ReturnType<typeof contextOf>): string[] =>
  ctx.c.issues.map((i) => i.message);

describe("reportDateIssues", () => {
  const report = (options: Record<string, unknown>) => {
    const ctx = contextOf(compiledOf(options));
    reportDateIssues(ctx);
    return ctx;
  };
  test("out-of-range for a date outside a provider's supported years, with the provider as the related path", () => {
    const ctx = report({
      holidayProvider: provider("X", 2000, 2050),
      dates: [
        { date: "2026-11-23", value: "in" },
        { date: "2060-01-01", value: "after" },
        { from: "2050-12-30", to: "2051-01-02", value: "partly" },
        { date: "1999-12-31", value: "before" },
      ],
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning out-of-range dates[1] <- holidayProvider",
      "warning out-of-range dates[2] <- holidayProvider",
      "warning out-of-range dates[3] <- holidayProvider",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      "The date is outside the years supported by holiday provider X (2000-2050); looking up this date throws",
    );
    assert.deepEqual(unusedOf(ctx), []);
  });
  test("with outOfRangePolicy ignore the message says that holidays are not considered", () => {
    const ctx = report({
      holidayProvider: provider("X", 2000, 2050),
      outOfRangePolicy: "ignore",
      dates: [{ date: "2060-01-01", value: "D" }],
    });
    assert.deepEqual(messagesOf(ctx), [
      "The date is outside the years supported by holiday provider X (2000-2050); holidays are not considered for this date",
    ]);
  });
  test("one warning per provider that does not support the date", () => {
    const ctx = report({
      holidayProvider: [
        provider("A", 2000, 2050),
        provider("B", 2000, 2070),
        provider("C", 2000, 2040),
      ],
      dates: [{ date: "2060-01-01", value: "D" }],
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning out-of-range dates[0] <- holidayProvider[0]",
      "warning out-of-range dates[0] <- holidayProvider[2]",
    ]);
  });
  test("out-of-range for a date without a day in the diagnostic range; the date is added to the unused rules", () => {
    const ctx = report({
      dates: [
        { date: "1900-01-01", value: "D" },
        { from: "1954-12-30", to: "1955-01-01", value: "partly inside" },
        { date: "2100-01-01", value: "D" },
      ],
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning out-of-range dates[0]",
      "warning out-of-range dates[2]",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      `The date has no day in ${LABEL}, the years the diagnostics examine, so it was not examined; check the year`,
    );
    assert.deepEqual(unusedOf(ctx), ["dates[0]", "dates[2]"]);
  });
  test("a date reported by a provider is not reported again, but is unused without a day in the diagnostic range", () => {
    const ctx = report({
      holidayProvider: provider("X", 2000, 2050),
      dates: [{ date: "1900-01-01", value: "D" }],
    });
    assert.deepEqual(issuesOf(ctx), ["warning out-of-range dates[0] <- holidayProvider"]);
    assert.deepEqual(unusedOf(ctx), ["dates[0]"]);
  });
  test("shadowed when an earlier specific date covers all of its days; the date is added to the unused rules", () => {
    const ctx = report({
      dates: [
        { from: "2026-11-20", to: "2026-11-25", value: "first" },
        { date: "2026-11-23", value: "inside" },
        { from: "2026-11-24", to: "2026-11-26", value: "partly" },
        { from: "2026-11-20", to: "2026-11-25", value: "same" },
        { from: "2026-11-24", to: "2026-11-26", value: "covered by [2]" },
      ],
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning shadowed dates[1] <- dates[0]",
      "warning shadowed dates[3] <- dates[0]",
      "warning shadowed dates[4] <- dates[2]",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      "This rule is never used: the earlier rule dates[0] covers all of its days",
    );
    assert.deepEqual(unusedOf(ctx), ["dates[1]", "dates[3]", "dates[4]"]);
  });
  test("a date without a day in the diagnostic range is not examined for a cover", () => {
    const ctx = report({
      dates: [
        { date: "1900-01-01", value: "D" },
        { date: "1900-01-01", value: "D" },
      ],
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning out-of-range dates[0]",
      "warning out-of-range dates[1]",
    ]);
  });
});

describe("reportPeriodsOutOfRange", () => {
  const report = (options: Record<string, unknown>) => {
    const ctx = contextOf(compiledOf(options));
    reportPeriodsOutOfRange(ctx);
    return ctx;
  };
  const rules = {
    annualDates: [
      { date: "12-31", value: "open" },
      { date: "12-30", value: "after", effectiveFrom: "2051-01-01" },
      { date: "12-29", value: "overlaps", effectiveFrom: "2050-12-31" },
    ],
    recurringRules: [
      { weekday: 1, value: "before", effectiveTo: "1999-12-31" },
      { weekday: 2, value: "inside", effectiveFrom: "2010-01-01", effectiveTo: "2010-12-31" },
      { weekday: 3, value: "overlaps", effectiveTo: "2000-01-01" },
    ],
  };
  test("out-of-range for a rule whose effective period lies entirely before or after a provider's supported years", () => {
    const ctx = report({ holidayProvider: provider("X", 2000, 2050), ...rules });
    assert.deepEqual(issuesOf(ctx), [
      "warning out-of-range annualDates[1] <- holidayProvider",
      "warning out-of-range recurringRules[0] <- holidayProvider",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      "The effective period is outside the years supported by holiday provider X (2000-2050); looking up these dates throws, so this rule is never used",
    );
    assert.deepEqual(unusedOf(ctx), ["annualDates[1]", "recurringRules[0]"]);
  });
  test("with outOfRangePolicy ignore the rule stays in use and the message says that holidays are not considered", () => {
    const ctx = report({
      holidayProvider: provider("X", 2000, 2050),
      outOfRangePolicy: "ignore",
      ...rules,
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning out-of-range annualDates[1] <- holidayProvider",
      "warning out-of-range recurringRules[0] <- holidayProvider",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      "The effective period is outside the years supported by holiday provider X (2000-2050); holidays are not considered for these dates",
    );
    assert.deepEqual(unusedOf(ctx), []);
  });
  test("one warning per provider", () => {
    const ctx = report({
      holidayProvider: [
        provider("A", 2000, 2050),
        provider("B", 1990, 2050),
        provider("C", 2001, 2050),
      ],
      timeZone: "UTC",
      ...rules,
    });
    assert.deepEqual(
      issuesOf(ctx).filter((i) => i.includes("recurringRules[0]")),
      [
        "warning out-of-range recurringRules[0] <- holidayProvider[0]",
        "warning out-of-range recurringRules[0] <- holidayProvider[2]",
      ],
    );
  });
  test("out-of-range for a rule whose effective period has no day in the diagnostic range; the rule is added to the unused rules", () => {
    const ctx = report({
      annualDates: [{ date: "12-31", value: "A", effectiveFrom: "2100-01-01" }],
      recurringRules: [
        { weekday: 1, value: "R", effectiveTo: "1954-12-31" },
        { weekday: 2, value: "R", effectiveTo: "1955-01-01" },
        { weekday: 3, value: "R" },
      ],
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning out-of-range annualDates[0]",
      "warning out-of-range recurringRules[0]",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      `The effective period has no day in ${LABEL}, the years the diagnostics examine, so it was not examined; check the year`,
    );
    assert.deepEqual(unusedOf(ctx), ["annualDates[0]", "recurringRules[0]"]);
  });
  test("a rule reported by a provider is not reported again, but is unused without a day in the diagnostic range", () => {
    const ctx = report({
      holidayProvider: provider("X", 2000, 2050),
      outOfRangePolicy: "ignore",
      recurringRules: [{ weekday: 1, value: "R", effectiveTo: "1954-12-31" }],
    });
    assert.deepEqual(issuesOf(ctx), ["warning out-of-range recurringRules[0] <- holidayProvider"]);
    assert.deepEqual(unusedOf(ctx), ["recurringRules[0]"]);
  });
});

describe("reportShadowedAnnual", () => {
  const report = (...annualDates: Record<string, unknown>[]) => {
    const ctx = contextOf(
      compiledOf({ annualDates: annualDates.map((a, i) => ({ value: i, ...a })) }),
    );
    reportShadowedAnnual(ctx);
    return ctx;
  };
  test("shadowed when an earlier annual date matches every month-day it matches and its period contains the later one's", () => {
    const ctx = report(
      { from: "12-29", to: "01-03" },
      { date: "12-31" },
      { date: "01-04" },
      { from: "12-30", to: "01-02", effectiveFrom: "2026-01-01" },
      { from: "12-29", to: "01-03" },
    );
    assert.deepEqual(issuesOf(ctx), [
      "warning shadowed annualDates[1] <- annualDates[0]",
      "warning shadowed annualDates[3] <- annualDates[0]",
      "warning shadowed annualDates[4] <- annualDates[0]",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      "This rule is never used: the earlier rule annualDates[0] covers all of its days",
    );
    assert.deepEqual(unusedOf(ctx), ["annualDates[1]", "annualDates[3]", "annualDates[4]"]);
  });
  test("not when the earlier period does not contain the later one's, and not by a later rule", () => {
    assert.deepEqual(
      issuesOf(report({ date: "12-31", effectiveFrom: "2026-01-01" }, { date: "12-31" })),
      [],
    );
    assert.deepEqual(
      issuesOf(
        report(
          { date: "12-31", effectiveTo: "2030-12-31" },
          { date: "12-31", effectiveTo: "2031-12-31" },
        ),
      ),
      [],
    );
    assert.deepEqual(issuesOf(report({ date: "12-31" }, { from: "12-30", to: "12-31" })), []);
  });
  test("a rule without a day in the diagnostic range is not reported", () => {
    assert.deepEqual(
      issuesOf(report({ date: "12-31" }, { date: "12-31", effectiveTo: "1954-12-31" })),
      [],
    );
  });
});

describe("holidayOfSafe", () => {
  const lookup = createHolidayLookup(
    compiledOf({ holidayProvider: provider("X", 2000, 2050, [holiday("2026-11-23")]) }).source,
  );
  test("the holiday on a date, or undefined", () => {
    assert.equal(holidayOfSafe(lookup, "2026-11-23")!.date, "2026-11-23");
    assert.equal(holidayOfSafe(lookup, "2026-11-24"), undefined);
  });
  test("undefined when the lookup throws", () => {
    assert.throws(() => lookup.holidayOfDate("2051-01-01"), { code: "out-of-range" });
    assert.equal(holidayOfSafe(lookup, "2051-01-01"), undefined);
  });
});

describe("holidayRuleMatches", () => {
  const matches = (options: Record<string, unknown>, entry: Record<string, unknown>) => {
    const ctx = contextOf(compiledOf({ ...options, recurringRules: [{ value: "R", ...entry }] }));
    return holidayRuleMatches(ctx, ctx.compiled.recurring[0]!);
  };
  const x = {
    holidayProvider: provider("X", 2000, 2050, [holiday("2026-11-23", { key: "labour" })]),
  };
  test("true when the rule matches a day of the window inside its effective period", () => {
    assert.equal(matches(x, { holiday: true }), true);
    assert.equal(
      matches(x, { holiday: true, keys: ["labour"], weekdays: [1], months: [11] }),
      true,
    );
    assert.equal(matches(x, { dayAfterHoliday: true }), true);
    assert.equal(
      matches(x, {
        dayBeforeHoliday: true,
        effectiveFrom: "2026-11-22",
        effectiveTo: "2026-11-22",
      }),
      true,
    );
  });
  test("false when no day matches", () => {
    assert.equal(matches(x, { holiday: true, kinds: ["substitute"] }), false);
    assert.equal(matches(x, { holiday: true, weekdays: [2] }), false);
    assert.equal(matches(x, { holiday: true, effectiveFrom: "2026-11-24" }), false);
    assert.equal(matches(x, { holiday: true, effectiveTo: "2026-11-22" }), false);
    assert.equal(matches({ holidayProvider: provider("X", 2000, 2050) }, { holiday: true }), false);
  });
  test("false without providers and without a window", () => {
    assert.equal(matches({}, { holiday: true }), false);
    const apart = {
      holidayProvider: [
        provider("A", 2000, 2010, [holiday("2005-05-05")]),
        provider("B", 2020, 2030),
      ],
    };
    assert.equal(matches(apart, { holiday: true }), false);
  });
  test("a day outside the supported years counts as no holiday", () => {
    // The day before 2000-01-01 and the day after 2050-12-31 cannot be looked up
    const edges = {
      holidayProvider: provider("X", 2000, 2050, [holiday("2000-01-01"), holiday("2050-12-31")]),
    };
    assert.equal(matches(edges, { dayAfterHoliday: true, effectiveTo: "2000-01-01" }), false);
    assert.equal(matches(edges, { dayBeforeHoliday: true, effectiveFrom: "2050-12-31" }), false);
    assert.equal(matches(edges, { dayAfterHoliday: true, effectiveTo: "2000-01-02" }), true);
  });
  test("kinds national selects the regular holidays of the JP provider", () => {
    const jp = { holidayProvider: provider("JP", 2000, 2050, [holiday("2026-11-23")]) };
    assert.equal(matches(jp, { holiday: true, kinds: ["national"] }), true);
    assert.equal(matches(x, { holiday: true, kinds: ["national"] }), false);
  });
});

describe("businessDayRuleMatches", () => {
  const own = (options: Record<string, unknown>, entry: Record<string, unknown>) => {
    const ctx = contextOf(calendarOf(options, entry));
    return businessDayRuleMatches(ctx, ctx.compiled.recurring[0]!);
  };
  test("true when the rule matches a day of the window inside its effective period", () => {
    assert.equal(own({}, { businessDayOfMonth: 1 }), true);
    assert.equal(own({}, { businessDayOfMonth: 23 }), true);
    assert.equal(own({}, { businessDayOfWeek: 5, weekStart: 1 }), true);
    assert.equal(
      own({}, { businessDayOfMonth: 1, effectiveFrom: "2026-11-02", effectiveTo: "2026-11-02" }),
      true,
    );
  });
  test("false when no day matches", () => {
    assert.equal(own({}, { businessDayOfMonth: 24 }), false);
    assert.equal(own({}, { businessDayOfWeek: 6, weekStart: 1 }), false);
    assert.equal(
      own({}, { businessDayOfMonth: 1, effectiveFrom: "2026-11-03", effectiveTo: "2026-11-30" }),
      false,
    );
  });
  test("a rule with a basis calendar is counted with it", () => {
    const withCalendar = (entry: Record<string, unknown>) => {
      const ctx = contextOf(compiledOf({ recurringRules: [{ calendar, value: "R", ...entry }] }));
      return businessDayRuleMatches(ctx, ctx.compiled.recurring[0]!);
    };
    assert.equal(withCalendar({ businessDayOfMonth: 23 }), true);
    assert.equal(withCalendar({ businessDayOfMonth: 24 }), false);
  });
  test("false without a window", () => {
    const apart = {
      holidayProvider: [provider("A", 2000, 2010), provider("B", 2020, 2030)],
      timeZone: "UTC",
    };
    assert.equal(own(apart, { businessDayOfMonth: 1 }), false);
  });
  test("outside the date units a day also matches with the basis without the specific dates", () => {
    // The closure covers all of July 2026; only March and November 2026 are date units
    const closure = { dates: [{ from: "2026-03-10", to: "2026-11-10", value: false }] };
    assert.equal(
      own(closure, {
        businessDayOfMonth: 1,
        effectiveFrom: "2026-07-01",
        effectiveTo: "2026-07-31",
      }),
      true,
    );
    // In a date unit only the basis with the dates counts: every day of 11 to 31 March is closed
    assert.equal(
      own(closure, {
        businessDayOfMonth: 8,
        effectiveFrom: "2026-03-01",
        effectiveTo: "2026-03-31",
      }),
      false,
    );
    assert.equal(
      own({}, { businessDayOfMonth: 8, effectiveFrom: "2026-03-01", effectiveTo: "2026-03-31" }),
      true,
    );
  });
  test("a day whose evaluation throws does not match", () => {
    const compiled = compiledOf({
      recurringRules: [{ businessDayOfMonth: 1, calendar, value: "R" }],
    });
    const throwing = {
      ...compiled.recurring[0]!,
      basis: () => {
        throw new RangeError("boom");
      },
    };
    assert.equal(businessDayRuleMatches(contextOf(compiled), throwing), false);
  });
});

describe("setCovers", () => {
  test("null covers everything", () => {
    assert.equal(setCovers(null, null), true);
    assert.equal(setCovers(null, new Set([1])), true);
  });
  test("a set is covered only by a set that contains it; everything is covered only by null", () => {
    assert.equal(setCovers(new Set([1, 2]), new Set([1])), true);
    assert.equal(setCovers(new Set([1, 2]), new Set([1, 2])), true);
    assert.equal(setCovers(new Set([1]), new Set([1, 2])), false);
    assert.equal(setCovers(new Set([1]), null), false);
    assert.equal(setCovers(new Set([1]), new Set()), true);
  });
});

describe("sameSkip", () => {
  const skip = (...days: number[]) =>
    ({ skipWeekdays: days.length === 0 ? null : new Set(days) }) as RecurringRuleCompiled<unknown>;
  test("true when both skip no weekday or the same weekdays", () => {
    assert.equal(sameSkip(skip(), skip()), true);
    assert.equal(sameSkip(skip(0, 6), skip(6, 0)), true);
  });
  test("false otherwise", () => {
    assert.equal(sameSkip(skip(), skip(0)), false);
    assert.equal(sameSkip(skip(0), skip()), false);
    assert.equal(sameSkip(skip(0, 6), skip(0)), false);
    assert.equal(sameSkip(skip(0), skip(0, 6)), false);
    assert.equal(sameSkip(skip(0, 6), skip(0, 5)), false);
  });
});

describe("createKindsOf", () => {
  const rules = [
    { holiday: true, kinds: ["national", "substitute"], value: "A" },
    { holiday: true, kinds: ["substitute"], value: "B" },
    { holiday: true, value: "C" },
  ];
  const kinds = (holidayProvider: unknown) => {
    const ctx = contextOf(compiledOf({ holidayProvider, timeZone: "UTC", recurringRules: rules }));
    const kindsOf = createKindsOf(ctx);
    return ctx.compiled.recurring.map((r) => {
      const set = kindsOf(r);
      return { same: set === r.kinds, kinds: set && [...set] };
    });
  };
  test("with only the Japanese provider and no holiday of kind national in the window, national is read as regular", () => {
    assert.deepEqual(kinds(provider("JP", 2000, 2050, [holiday("2026-11-23")])), [
      { same: false, kinds: ["regular", "substitute"] },
      { same: true, kinds: ["substitute"] },
      { same: true, kinds: null },
    ]);
  });
  test("the kinds as written when the provider has a holiday of kind national in the window", () => {
    assert.deepEqual(
      kinds(provider("JP", 2000, 2050, [holiday("2026-11-23", { kind: "national" })]))[0],
      {
        same: true,
        kinds: ["national", "substitute"],
      },
    );
  });
  test("the kinds as written with other providers, and without a window", () => {
    assert.equal(kinds([provider("JP", 2000, 2050), provider("X", 2000, 2050)])[0]!.same, true);
    assert.equal(kinds(provider("X", 2000, 2050))[0]!.same, true);
    assert.equal(kinds(provider("JP", 1800, 1900))[0]!.same, true);
  });
  test("the reading is decided once, on first use", () => {
    let calls = 0;
    const counting = provider("JP", 2000, 2050, [], {
      holidaysInYear: () => {
        calls++;
        return [];
      },
    });
    const ctx = contextOf(compiledOf({ holidayProvider: counting, recurringRules: rules }));
    const kindsOf = createKindsOf(ctx);
    assert.equal(calls, 0);
    assert.deepEqual([...kindsOf(ctx.compiled.recurring[0]!)!], ["regular", "substitute"]);
    const after = calls;
    assert.ok(after > 0);
    assert.deepEqual([...kindsOf(ctx.compiled.recurring[0]!)!], ["regular", "substitute"]);
    assert.equal(calls, after);
  });
});

describe("ruleCovers", () => {
  const asWritten = (r: RecurringRuleCompiled<unknown>) => r.kinds;
  /** Whether the first rule covers the second, both compiled as rules of a schedule */
  const covers = (
    earlier: Record<string, unknown>,
    later: Record<string, unknown>,
    kindsOf = asWritten,
  ) => {
    const [r, rule] = compiledOf({
      recurringRules: [earlier, later].map((e) => ({ value: "R", ...e })),
    }).recurring;
    return ruleCovers(r!, rule!, kindsOf, patternBits);
  };
  test("weekday and day-of-month rules: by their matching days", () => {
    assert.equal(covers({ weekday: 1 }, { weekday: 1, nth: [1, 3] }), true);
    assert.equal(covers({ weekday: 1, nth: [1, 3] }, { weekday: 1 }), false);
    assert.equal(covers({ weekday: 1 }, { weekday: 2 }), false);
    assert.equal(covers({ weekday: 1 }, { weekday: 1, months: [3] }), true);
    assert.equal(covers({ weekday: 1, months: [3] }, { weekday: 1 }), false);
    assert.equal(covers({ dayOfMonth: [1, 2, 3, 4, 5, 6, 7] }, { weekday: 1, nth: 1 }), true);
    assert.equal(covers({ dayOfMonth: [29, 30, 31] }, { dayOfMonth: -1 }), false);
    assert.equal(covers({ dayOfMonth: [28, 29, 30, 31] }, { dayOfMonth: -1 }), true);
  });
  test("weekday rules: and by the interval", () => {
    assert.equal(covers({ weekday: 3 }, { weekday: 3, interval: 2, anchor: "2026-11-25" }), true);
    assert.equal(covers({ weekday: 3, interval: 2, anchor: "2026-11-25" }, { weekday: 3 }), false);
    assert.equal(
      covers(
        { weekday: 3, interval: 2, anchor: "2026-11-25" },
        { weekday: 3, interval: 4, anchor: "2026-12-09" },
      ),
      true,
    );
    assert.equal(
      covers(
        { weekday: 3, interval: 2, anchor: "2026-11-25" },
        { weekday: 3, interval: 4, anchor: "2026-12-02" },
      ),
      false,
    );
  });
  test("requires a compatible holidayOverlapPolicy, a containing effective period and the same skipWeekdays", () => {
    assert.equal(
      covers({ weekday: 1, holidayOverlapPolicy: "after-holiday" }, { weekday: 1 }),
      false,
    );
    assert.equal(
      covers({ weekday: 1, holidayOverlapPolicy: "over-holiday" }, { weekday: 1 }),
      true,
    );
    assert.equal(covers({ weekday: 1, effectiveTo: "2030-12-31" }, { weekday: 1 }), false);
    assert.equal(covers({ weekday: 1 }, { weekday: 1, effectiveTo: "2030-12-31" }), true);
    const shifted = { weekday: 1, holidayOverlapPolicy: "after-holiday" };
    assert.equal(covers(shifted, shifted), true);
    assert.equal(covers({ ...shifted, skipWeekdays: [0] }, shifted), false);
    assert.equal(
      covers({ ...shifted, skipWeekdays: [0] }, { ...shifted, skipWeekdays: [0] }),
      true,
    );
  });
  test("holiday rules with holiday rules: kinds, keys, weekdays and months", () => {
    assert.equal(
      covers(
        { holiday: true },
        { holiday: true, kinds: ["a"], keys: ["k"], weekdays: [1], months: [5] },
      ),
      true,
    );
    for (const filter of [{ kinds: ["a"] }, { keys: ["k"] }, { weekdays: [1] }, { months: [5] }]) {
      assert.equal(
        covers({ holiday: true, ...filter }, { holiday: true }),
        false,
        JSON.stringify(filter),
      );
      assert.equal(covers({ holiday: true, ...filter }, { holiday: true, ...filter }), true);
    }
    assert.equal(
      covers({ holiday: true, kinds: ["a", "b"] }, { holiday: true, kinds: ["b"] }),
      true,
    );
    assert.equal(
      covers(
        { weekday: 1, holidayOverlapPolicy: "over-holiday" },
        { holiday: true, weekdays: [1] },
      ),
      false,
    );
    assert.equal(covers({ dayAfterHoliday: true }, { holiday: true }), false);
  });
  test("the kinds are read with the given reader", () => {
    const regular = (r: RecurringRuleCompiled<unknown>) =>
      r.kinds?.has("national") ? new Set(["regular"]) : r.kinds;
    assert.equal(
      covers({ holiday: true, kinds: ["regular"] }, { holiday: true, kinds: ["national"] }),
      false,
    );
    assert.equal(
      covers(
        { holiday: true, kinds: ["regular"] },
        { holiday: true, kinds: ["national"] },
        regular,
      ),
      true,
    );
    assert.equal(
      covers(
        { dayAfterHoliday: true, kinds: ["national"] },
        { dayAfterHoliday: true, kinds: ["regular"] },
        regular,
      ),
      true,
    );
  });
  test("day-after and day-before rules with rules of the same kind", () => {
    assert.equal(
      covers(
        { dayAfterHoliday: true },
        { dayAfterHoliday: true, kinds: ["a"], keys: ["k"], weekdays: [1], months: [5] },
      ),
      true,
    );
    assert.equal(covers({ dayBeforeHoliday: true }, { dayBeforeHoliday: true, months: [5] }), true);
    assert.equal(covers({ dayAfterHoliday: true }, { dayBeforeHoliday: true }), false);
    assert.equal(covers({ dayBeforeHoliday: true }, { dayAfterHoliday: true }), false);
    assert.equal(
      covers({ holiday: true, holidayOverlapPolicy: undefined }, { dayAfterHoliday: true }),
      false,
    );
    for (const filter of [{ kinds: ["a"] }, { keys: ["k"] }, { weekdays: [1] }, { months: [5] }])
      assert.equal(
        covers({ dayAfterHoliday: true, ...filter }, { dayAfterHoliday: true }),
        false,
        JSON.stringify(filter),
      );
    assert.equal(covers({ weekday: 1 }, { dayAfterHoliday: true, weekdays: [1] }), false);
  });
  test("day cycles with day cycles, and the months", () => {
    const cycle = { cycle: 4, anchor: "2026-11-23", positions: [1, 3] };
    assert.equal(covers(cycle, { ...cycle, positions: [1] }), true);
    assert.equal(covers(cycle, { ...cycle, positions: [2] }), false);
    assert.equal(covers(cycle, { ...cycle, months: [5] }), true);
    assert.equal(covers({ ...cycle, months: [5] }, cycle), false);
    assert.equal(covers({ dayOfMonth: Array.from({ length: 31 }, (_, i) => i + 1) }, cycle), false);
    assert.equal(covers(cycle, { weekday: 1 }), false);
  });
  test("nth-business-day rules with the same weekStart and the same basis calendar", () => {
    const other = createCalendar({ closedWeekdays: [0, 6] });
    assert.equal(
      covers(
        { businessDayOfMonth: [1, 2], calendar },
        { businessDayOfMonth: 1, calendar, months: [5] },
      ),
      true,
    );
    assert.equal(
      covers({ businessDayOfMonth: 1, calendar }, { businessDayOfMonth: [1, 2], calendar }),
      false,
    );
    assert.equal(
      covers({ businessDayOfMonth: 1, calendar, months: [5] }, { businessDayOfMonth: 1, calendar }),
      false,
    );
    assert.equal(
      covers({ businessDayOfMonth: 1, calendar: other }, { businessDayOfMonth: 1, calendar }),
      false,
    );
    assert.equal(
      covers(
        { businessDayOfWeek: 1, weekStart: 1, calendar },
        { businessDayOfWeek: 1, weekStart: 1, calendar },
      ),
      true,
    );
    assert.equal(
      covers(
        { businessDayOfWeek: 1, weekStart: 0, calendar },
        { businessDayOfWeek: 1, weekStart: 1, calendar },
      ),
      false,
    );
    assert.equal(
      covers({ businessDayOfMonth: 1, calendar }, { businessDayOfWeek: 1, weekStart: 1, calendar }),
      false,
    );
    assert.equal(covers({ weekday: 1 }, { businessDayOfMonth: 1, calendar }), false);
    assert.equal(covers({ businessDayOfMonth: 1, calendar }, { weekday: 1 }), false);
    const [first, second] = calendarOf(
      {},
      { businessDayOfMonth: [1, 2] },
      { businessDayOfMonth: 2 },
    ).recurring;
    assert.equal(ruleCovers(first!, second!, asWritten, patternBits), true);
  });
  test("the matching days are asked only for weekday and day-of-month rules", () => {
    let calls = 0;
    const counting = (r: RecurringRuleCompiled<unknown>) => {
      calls++;
      return patternBits(r);
    };
    const [a, b, c, d] = compiledOf({
      recurringRules: [
        { holiday: true },
        { holiday: true },
        { cycle: 4, anchor: "2026-11-23", positions: [1] },
        { businessDayOfMonth: 1, calendar },
      ].map((e) => ({ value: "R", ...e })),
    }).recurring;
    ruleCovers(a!, b!, asWritten, counting);
    ruleCovers(c!, c!, asWritten, counting);
    ruleCovers(d!, d!, asWritten, counting);
    assert.equal(calls, 0);
  });
});

describe("reportRecurring", () => {
  const report = (
    options: Record<string, unknown>,
    unsure?: (code: string, path: string) => boolean,
  ) => {
    const ctx = contextOf(compiledOf(options), unsure);
    reportRecurring(ctx);
    return ctx;
  };
  const rules = (...entries: Record<string, unknown>[]) =>
    entries.map((e) => ({ value: "R", ...e }));
  test("never-matches for a rule without a matching day; the rule is added to the unused rules and nothing else is reported for it", () => {
    const ctx = report({
      recurringRules: rules(
        { dayOfMonth: 31 },
        { dayOfMonth: 31, months: [2] },
        { dayOfMonth: 31, months: [2, 4] },
        { dayOfMonth: 30 },
      ),
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning never-matches recurringRules[1]",
      "warning never-matches recurringRules[2]",
    ]);
    assert.deepEqual(messagesOf(ctx), [
      "This rule matches no day (for example, a day that does not exist in the selected months)",
      "This rule matches no day (for example, a day that does not exist in the selected months)",
    ]);
    assert.deepEqual(unusedOf(ctx), ["recurringRules[1]", "recurringRules[2]"]);
  });
  test("never-matches within an effective period, with the note when the period was not examined whole", () => {
    const ctx = report({
      recurringRules: rules(
        { dayOfMonth: 31, effectiveFrom: "2026-11-01", effectiveTo: "2026-11-30" },
        { weekday: 1, effectiveFrom: "2026-11-24", effectiveTo: "2026-11-29" },
        { dayOfMonth: 31, months: [2], effectiveFrom: "2026-01-01" },
        { dayOfMonth: 31, months: [2], effectiveFrom: "2090-01-01" },
      ),
    });
    assert.deepEqual(messagesOf(ctx), [
      "This rule matches no day within its effective period",
      "This rule matches no day within its effective period",
      // The period reaches beyond the range, and 28 years of it are inside
      "This rule matches no day within its effective period",
      // Less than 28 years of the period are inside the range
      `This rule matches no day within its effective period${NOTE}`,
    ]);
    // A cycle longer than the range: no whole cycle can be examined
    const capped = report({
      recurringRules: rules({
        cycle: 400000,
        anchor: "1900-01-01",
        positions: [1],
        effectiveFrom: "2000-01-01",
      }),
    });
    assert.deepEqual(messagesOf(capped), [
      `This rule matches no day within its effective period${NOTE}`,
    ]);
  });
  test("never-matches of holiday-based rules: without a provider, and per kind of rule", () => {
    assert.deepEqual(messagesOf(report({ recurringRules: rules({ holiday: true }) })), [
      "This rule matches no day: there are no holidays without a holiday provider",
    ]);
    const x = { holidayProvider: provider("X", 2000, 2050, [holiday("2026-11-23")]) };
    const ctx = report({
      ...x,
      recurringRules: rules(
        { holiday: true, kinds: ["other"] },
        { dayAfterHoliday: true, kinds: ["other"] },
        { dayBeforeHoliday: true, kinds: ["other"] },
        { holiday: true },
      ),
    });
    assert.deepEqual(messagesOf(ctx), [
      "This rule matches no day: no holiday of the selected kinds, keys, weekdays and months within its effective period",
      "This rule matches no day: no day after a holiday of the selected kinds and keys on the selected weekdays and months within its effective period",
      "This rule matches no day: no day before a holiday of the selected kinds and keys on the selected weekdays and months within its effective period",
    ]);
  });
  test("never-matches of a holiday rule with kinds national and no JP provider mentions the rename", () => {
    const national = rules({ holiday: true, kinds: ["national"] });
    const ctx = report({
      holidayProvider: provider("X", 2000, 2050, [holiday("2026-11-23")]),
      recurringRules: national,
    });
    assert.deepEqual(messagesOf(ctx), [
      'This rule matches no day: no holiday of the selected kinds, keys, weekdays and months within its effective period; "national" was renamed to "regular" in 0.30.0 and is not read so without a provider whose ID is "JP"',
    ]);
    assert.deepEqual(messagesOf(report({ recurringRules: national })), [
      "This rule matches no day: there are no holidays without a holiday provider",
    ]);
    assert.deepEqual(
      issuesOf(
        report({
          holidayProvider: provider("JP", 2000, 2050, [holiday("2026-11-23")]),
          recurringRules: national,
        }),
      ),
      [],
    );
  });
  test("never-matches of nth-business-day rules: of a month and of a week", () => {
    const ctx = report({
      recurringRules: rules(
        { businessDayOfMonth: 24, calendar },
        { businessDayOfWeek: 6, weekStart: 1, calendar },
        { businessDayOfMonth: 23, calendar },
      ),
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning never-matches recurringRules[0]",
      "warning never-matches recurringRules[1]",
    ]);
    assert.deepEqual(messagesOf(ctx), [
      "This rule matches no day: no month has that many business days of the counting basis in the selected months within its effective period",
      "This rule matches no day: no week has that many business days of the counting basis in the selected months within its effective period",
    ]);
  });
  test("never-matches is withheld when the predicate says so; the rule stays in use and is examined for a cover", () => {
    const options = {
      recurringRules: rules({ dayOfMonth: 31, months: [2] }, { dayOfMonth: 31, months: [2] }),
    };
    const ctx = report(
      options,
      (code, path) => code === "never-matches" && path === "recurringRules[1]",
    );
    assert.deepEqual(issuesOf(ctx), [
      "warning never-matches recurringRules[0]",
      "warning shadowed recurringRules[1] <- recurringRules[0]",
    ]);
  });
  test("shadowed when an earlier rule covers the rule, with the first such rule as the related path", () => {
    const ctx = report({
      recurringRules: rules(
        { weekday: 2 },
        { weekday: 1 },
        { weekday: 1 },
        { weekday: 1, nth: 1 },
        { weekday: 3 },
      ),
    });
    assert.deepEqual(issuesOf(ctx), [
      "warning shadowed recurringRules[2] <- recurringRules[1]",
      "warning shadowed recurringRules[3] <- recurringRules[1]",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      "This rule is never used: the earlier rule recurringRules[1] covers all of its days",
    );
    assert.deepEqual(unusedOf(ctx), ["recurringRules[2]", "recurringRules[3]"]);
  });
  test("shadowed of holiday rules reads national as regular with only the JP provider", () => {
    const options = {
      holidayProvider: provider("JP", 2000, 2050, [holiday("2026-11-23")]),
      recurringRules: rules(
        { holiday: true, kinds: ["regular"] },
        { holiday: true, kinds: ["national"] },
      ),
    };
    assert.deepEqual(issuesOf(report(options)), [
      "warning shadowed recurringRules[1] <- recurringRules[0]",
    ]);
  });
  test("nth-business-day rules are compared by shape", () => {
    const ctx = report({
      recurringRules: rules(
        { businessDayOfMonth: [1, 2], calendar },
        { businessDayOfMonth: 2, calendar },
        { dayOfMonth: 1 },
        { weekday: 1 },
      ),
    });
    assert.deepEqual(issuesOf(ctx), ["warning shadowed recurringRules[1] <- recurringRules[0]"]);
  });
  test("a rule without a day in the diagnostic range is not examined", () => {
    const ctx = report({
      recurringRules: rules(
        { weekday: 1 },
        { weekday: 1, effectiveTo: "1954-12-31" },
        { dayOfMonth: 31, months: [2], effectiveFrom: "2100-01-01" },
      ),
    });
    assert.deepEqual(issuesOf(ctx), []);
    assert.deepEqual(unusedOf(ctx), []);
  });
  test("redundant (info) for over-holiday on a rule that counts the options' own business days when holidays are closed", () => {
    const own = (holidayPolicy: unknown, policy: string) => {
      const ctx = contextOf(
        calendarOf({ holidayPolicy }, { businessDayOfMonth: 1, holidayOverlapPolicy: policy }),
      );
      reportRecurring(ctx);
      return ctx;
    };
    const ctx = own({ value: false }, "over-holiday");
    assert.deepEqual(issuesOf(ctx), [
      "info redundant closedRecurringRules[0].holidayOverlapPolicy",
    ]);
    assert.equal(
      messagesOf(ctx)[0],
      'This option does not change the result: holidays are closed (holidayPolicy: "closed"), so an nth business day is never a holiday',
    );
    assert.deepEqual(unusedOf(ctx), []);
    assert.deepEqual(issuesOf(own({ value: false }, "under-holiday")), []);
    assert.deepEqual(issuesOf(own({ value: true }, "over-holiday")), []);
    assert.deepEqual(issuesOf(own("ignore", "over-holiday")), []);
    assert.deepEqual(issuesOf(own({ sameAs: 0 }, "over-holiday")), []);
    const withCalendar = report({
      holidayPolicy: { value: false },
      recurringRules: rules({
        businessDayOfMonth: 1,
        calendar,
        holidayOverlapPolicy: "over-holiday",
      }),
    });
    assert.deepEqual(issuesOf(withCalendar), []);
  });
});
