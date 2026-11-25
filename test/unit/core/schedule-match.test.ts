// Unit tests of the functions of src/core/schedule.ts that compile the list of recurring rules, match a rule
// against a date, validate holiday providers and look up holidays. One describe per function, named after the
// function; each test is one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCalendar } from "../../../src/core/calendar.ts";
import { toDayNumber } from "../../../src/core/date.ts";
import { IssueCollector } from "../../../src/core/errors.ts";
import {
  basisFromPredicate,
  compileHolidaySource,
  compileRecurringRule,
  compileRecurringRules,
  createHolidayLookup,
  jpUsage,
  loadProviderYear,
  matchPattern,
  matchRecurring,
  mergeProviderYear,
  providerDataError,
  RECURRING_RULE_KEYS,
  reportNational,
  requiredValue,
  unconfirmedHolidayError,
  validateProvider,
  weekdayOfDate,
  type HolidaySource,
  type JpUsage,
} from "../../../src/core/schedule.ts";
import type { Holiday, HolidayProvider } from "../../../src/core/types.ts";

const day = toDayNumber;
const issues = (c: IssueCollector): string[] =>
  c.issues.map((i) => `${i.severity} ${i.code} ${i.path}`);
const closed = () => ({ value: false });
const holiday = (date: string, extra: Partial<Holiday<string>> = {}): Holiday<string> => ({
  date,
  name: `N ${date}`,
  nameEn: `E ${date}`,
  kind: "regular",
  confirmed: true,
  ...extra,
});
/** A provider that returns the holidays of the list that are in the asked year */
const provider = (
  id: string,
  list: readonly unknown[],
  extra: Record<string, unknown> = {},
): HolidayProvider<string> =>
  ({
    id,
    timeZone: "UTC",
    supportedYears: { from: 2000, to: 2050 },
    dataVersion: "1",
    holidaysInYear: (year: number) =>
      list.filter(
        (h) =>
          typeof (h as { date?: unknown })?.date !== "string" ||
          (h as { date: string }).date.startsWith(`${year}-`),
      ),
    ...extra,
  }) as unknown as HolidayProvider<string>;
/** Compiles one rule of a calendar (or of a schedule when it has `calendar`) */
function rule(entry: Record<string, unknown>, jp: JpUsage = "none") {
  const c = new IssueCollector();
  const context = "calendar" in entry ? "schedule" : "calendar";
  const compiled = compileRecurringRule(
    c,
    "r",
    "r",
    entry,
    closed,
    RECURRING_RULE_KEYS,
    context,
    jp,
  );
  assert.deepEqual(
    c.issues.filter((i) => i.severity === "error"),
    [],
  );
  return compiled!;
}
/** A holiday lookup from a list of holidays */
const lookupOf = (list: readonly Holiday<string>[]) => {
  const map = new Map(list.map((h) => [h.date, h]));
  return (date: string) => map.get(date);
};
/** The days of a period (both ends included) on which the rule's pattern matches */
function matches(
  r: ReturnType<typeof rule>,
  from: string,
  to: string,
  ...rest: unknown[]
): string[] {
  const out: string[] = [];
  for (let n = day(from); n <= day(to); n++) {
    const date = new Date(n * 86400000).toISOString().slice(0, 10);
    if (matchPattern(r, date, ...(rest as []))) out.push(date);
  }
  return out;
}
/** Monday to Friday */
const weekdaysBasis = basisFromPredicate((date) => ![0, 6].includes(weekdayOfDate(date)));

describe("compileRecurringRules", () => {
  const compile = (entries: unknown, writtenPath?: string, jp?: JpUsage) => {
    const c = new IssueCollector();
    const rules = compileRecurringRules(
      c,
      "rules",
      entries,
      closed,
      RECURRING_RULE_KEYS,
      "calendar",
      writtenPath,
      jp,
    );
    return { rules, issues: issues(c) };
  };
  test("[] for undefined, and invalid-option when it is not an array", () => {
    assert.deepEqual(compile(undefined), { rules: [], issues: [] });
    assert.deepEqual(compile({ weekday: 1 }), {
      rules: [],
      issues: ["error invalid-option rules"],
    });
  });
  test("one compiled rule per valid entry, in array order", () => {
    const { rules, issues: found } = compile([{ weekday: 1 }, { weekday: 9 }, { dayOfMonth: 20 }]);
    assert.deepEqual(found, ["error invalid-weekday rules[1].weekday"]);
    assert.deepEqual(
      rules.map((r) => r.path),
      ["rules[0]", "rules[2]"],
    );
    assert.equal(rules[0]!.holidayOverlapPolicy, "under-holiday");
  });
  test("a hole is validated as an undefined entry", () => {
    // eslint-disable-next-line no-sparse-arrays
    assert.deepEqual(compile([, { weekday: 1 }]).issues, ["error invalid-option rules[0]"]);
  });
  test("deprecation warnings are reported at the written path, which defaults to the path", () => {
    assert.deepEqual(compile([{ day: 20 }], "old").issues, [
      "warning deprecated-option old[0].day",
    ]);
    assert.deepEqual(compile([{ day: 20 }]).issues, ["warning deprecated-option rules[0].day"]);
  });
  test("kinds national is reported only when the Japanese provider is used", () => {
    const entry = [{ holiday: true, kinds: ["national"] }];
    assert.deepEqual(compile(entry).issues, []);
    assert.equal(compile(entry).rules[0]!.nationalOfJp, false);
    const only = compile(entry, "rules", "only");
    assert.deepEqual(only.issues, ["warning deprecated-option rules[0].kinds[0]"]);
    assert.equal(only.rules[0]!.nationalOfJp, true);
  });
});

describe("matchPattern", () => {
  test("false outside the rule's months", () => {
    const r = rule({ dayOfMonth: 20, months: [11] });
    assert.equal(matchPattern(r, "2026-11-20"), true);
    assert.equal(matchPattern(r, "2026-12-20"), false);
  });
  test("the day of the month; -1 is the last day", () => {
    assert.deepEqual(matches(rule({ dayOfMonth: [5, 20] }), "2026-11-01", "2026-11-30"), [
      "2026-11-05",
      "2026-11-20",
    ]);
    const last = rule({ dayOfMonth: -1 });
    assert.deepEqual(matches(last, "2026-11-01", "2026-12-01"), ["2026-11-30"]);
    assert.deepEqual(matches(last, "2024-02-27", "2024-03-01"), ["2024-02-29"]);
    assert.deepEqual(matches(last, "2026-02-27", "2026-03-01"), ["2026-02-28"]);
  });
  test("the weekday", () => {
    assert.deepEqual(matches(rule({ weekday: 1 }), "2026-11-01", "2026-11-30"), [
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
  });
  test("the weekday with nth: the nth of the month, -1 the last", () => {
    assert.deepEqual(matches(rule({ weekday: 1, nth: [1, 3] }), "2026-11-01", "2026-11-30"), [
      "2026-11-02",
      "2026-11-16",
    ]);
    assert.deepEqual(matches(rule({ weekday: 1, nth: -1 }), "2026-11-01", "2026-12-31"), [
      "2026-11-30",
      "2026-12-28",
    ]);
    assert.deepEqual(matches(rule({ weekday: 1, nth: 5 }), "2026-11-01", "2026-12-31"), [
      "2026-11-30",
    ]);
  });
  test("the weekday with interval: every interval weeks from the anchor, before it too", () => {
    const r = rule({ weekday: 3, interval: 2, anchor: "2026-11-25" });
    assert.deepEqual(matches(r, "2026-11-01", "2026-12-31"), [
      "2026-11-11",
      "2026-11-25",
      "2026-12-09",
      "2026-12-23",
    ]);
  });
  test("a position of the day cycle, before the anchor too", () => {
    const r = rule({ cycle: 4, anchor: "2026-11-23", positions: [1, 3] });
    assert.deepEqual(matches(r, "2026-11-19", "2026-11-28"), [
      "2026-11-19",
      "2026-11-21",
      "2026-11-23",
      "2026-11-25",
      "2026-11-27",
    ]);
  });
  test("the nth business day of the month by the caller's basis; a negative index counts from the end", () => {
    assert.deepEqual(
      matches(
        rule({ businessDayOfMonth: [1, 3] }),
        "2026-11-01",
        "2026-11-30",
        undefined,
        weekdaysBasis,
      ),
      ["2026-11-02", "2026-11-04"],
    );
    assert.deepEqual(
      matches(
        rule({ businessDayOfMonth: [-1, -2] }),
        "2026-10-25",
        "2026-11-30",
        undefined,
        weekdaysBasis,
      ),
      ["2026-10-29", "2026-10-30", "2026-11-27", "2026-11-30"],
    );
  });
  test("an nth-business-day rule never matches without a basis, and never on a day that is not a business day of the basis", () => {
    assert.deepEqual(matches(rule({ businessDayOfMonth: 1 }), "2026-11-01", "2026-11-30"), []);
    assert.deepEqual(
      matches(rule({ businessDayOfWeek: 1, weekStart: 1 }), "2026-11-01", "2026-11-30"),
      [],
    );
    const everyIndex = rule({ businessDayOfMonth: Array.from({ length: 31 }, (_, i) => i + 1) });
    assert.equal(matchPattern(everyIndex, "2026-11-01", undefined, weekdaysBasis), false);
    assert.equal(matchPattern(everyIndex, "2026-11-02", undefined, weekdaysBasis), true);
  });
  test("the rule's own basis is used instead of the caller's", () => {
    const r = rule({
      businessDayOfMonth: 1,
      calendar: createCalendar({ closedWeekdays: [0, 1, 6] }),
    });
    assert.deepEqual(matches(r, "2026-11-01", "2026-11-30", undefined, weekdaysBasis), [
      "2026-11-03",
    ]);
    assert.deepEqual(matches(r, "2026-11-01", "2026-11-30"), ["2026-11-03"]);
  });
  test("the nth business day of the week that starts on weekStart, across two months", () => {
    const first = rule({ businessDayOfWeek: 1, weekStart: 1 });
    assert.deepEqual(matches(first, "2026-11-22", "2026-12-06", undefined, weekdaysBasis), [
      "2026-11-23",
      "2026-11-30",
    ]);
    const second = rule({ businessDayOfWeek: [2, -1], weekStart: 1 });
    assert.deepEqual(matches(second, "2026-11-22", "2026-12-06", undefined, weekdaysBasis), [
      "2026-11-24",
      "2026-11-27",
      "2026-12-01",
      "2026-12-04",
    ]);
    // A week that starts on Thursday: Thu, Fri, Mon, Tue, Wed are its business days
    const thursday = rule({ businessDayOfWeek: 3, weekStart: 4 });
    assert.deepEqual(matches(thursday, "2026-11-22", "2026-12-06", undefined, weekdaysBasis), [
      "2026-11-23",
      "2026-11-30",
    ]);
  });
  test("holiday-based rules never match without a holiday lookup", () => {
    for (const key of ["holiday", "dayAfterHoliday", "dayBeforeHoliday"])
      assert.deepEqual(matches(rule({ [key]: true }), "2026-11-20", "2026-11-26"), []);
  });
  test("a holiday rule matches a holiday that passes weekdays, kinds and keys", () => {
    const holidayOf = lookupOf([
      holiday("2026-11-03", { key: "culture" }),
      holiday("2026-11-23", { kind: "substitute" }),
      holiday("2026-11-28", { key: "extra" }),
    ]);
    const on = (entry: Record<string, unknown>) =>
      matches(rule({ holiday: true, ...entry }), "2026-11-01", "2026-11-30", holidayOf);
    assert.deepEqual(on({}), ["2026-11-03", "2026-11-23", "2026-11-28"]);
    assert.deepEqual(on({ weekdays: [1, 6] }), ["2026-11-23", "2026-11-28"]);
    assert.deepEqual(on({ kinds: ["substitute"] }), ["2026-11-23"]);
    // A holiday without a key does not pass a keys filter
    assert.deepEqual(on({ keys: ["culture", "other"] }), ["2026-11-03"]);
    assert.deepEqual(on({ kinds: ["regular"], keys: ["extra"] }), ["2026-11-28"]);
  });
  test("kinds national selects the regular holidays that come from the JP provider", () => {
    const holidayOf = lookupOf([
      holiday("2026-11-03"),
      holiday("2026-11-23"),
      holiday("2026-11-24", { kind: "substitute" }),
    ]);
    const r = rule({ holiday: true, kinds: ["national"] }, "mixed");
    const fromJp = (date: string) => date !== "2026-11-23";
    assert.deepEqual(matches(r, "2026-11-01", "2026-11-30", holidayOf, undefined, fromJp), [
      "2026-11-03",
    ]);
    assert.deepEqual(matches(r, "2026-11-01", "2026-11-30", holidayOf), []);
    // Without the JP provider the name is an ordinary kind
    assert.deepEqual(
      matches(
        rule({ holiday: true, kinds: ["national"] }),
        "2026-11-01",
        "2026-11-30",
        holidayOf,
        undefined,
        fromJp,
      ),
      [],
    );
  });
  test("dayAfterHoliday: a day that is not a holiday and follows one", () => {
    const holidayOf = lookupOf([
      holiday("2026-11-03"),
      holiday("2026-11-22"),
      holiday("2026-11-23"),
    ]);
    assert.deepEqual(
      matches(rule({ dayAfterHoliday: true }), "2026-11-01", "2026-11-30", holidayOf),
      ["2026-11-04", "2026-11-24"],
    );
  });
  test("dayBeforeHoliday: a day that is not a holiday and precedes one", () => {
    const holidayOf = lookupOf([
      holiday("2026-11-03"),
      holiday("2026-11-22"),
      holiday("2026-11-23"),
    ]);
    assert.deepEqual(
      matches(rule({ dayBeforeHoliday: true }), "2026-11-01", "2026-11-30", holidayOf),
      ["2026-11-02", "2026-11-21"],
    );
  });
  test("with skipWeekdays: the first day after or before a run of holidays and those weekdays", () => {
    // Friday 27 is a holiday; Monday 23 is a holiday
    const holidayOf = lookupOf([holiday("2026-11-23"), holiday("2026-11-27")]);
    assert.deepEqual(
      matches(
        rule({ dayAfterHoliday: true, skipWeekdays: [0, 6] }),
        "2026-11-15",
        "2026-12-05",
        holidayOf,
      ),
      ["2026-11-24", "2026-11-30"],
    );
    assert.deepEqual(
      matches(
        rule({ dayBeforeHoliday: true, skipWeekdays: [0, 6] }),
        "2026-11-15",
        "2026-12-05",
        holidayOf,
      ),
      ["2026-11-20", "2026-11-26"],
    );
    assert.deepEqual(
      matches(rule({ dayAfterHoliday: true }), "2026-11-15", "2026-12-05", holidayOf),
      ["2026-11-24", "2026-11-28"],
    );
  });
  test("the filters of a day-after or day-before rule apply to the nearest holiday; weekdays to the day itself", () => {
    const holidayOf = lookupOf([
      holiday("2026-11-03", { key: "culture" }),
      holiday("2026-11-23", { kind: "substitute" }),
    ]);
    const after = (entry: Record<string, unknown>) =>
      matches(rule({ dayAfterHoliday: true, ...entry }), "2026-11-01", "2026-11-30", holidayOf);
    assert.deepEqual(after({ kinds: ["substitute"] }), ["2026-11-24"]);
    assert.deepEqual(after({ keys: ["culture"] }), ["2026-11-04"]);
    assert.deepEqual(after({ weekdays: [2] }), ["2026-11-24"]);
  });
  test("what the holiday lookup or the basis throws is thrown", () => {
    const boom = () => {
      throw new RangeError("boom");
    };
    assert.throws(() => matchPattern(rule({ holiday: true }), "2026-11-23", boom), {
      message: "boom",
    });
    assert.throws(
      () => matchPattern(rule({ businessDayOfMonth: 1 }), "2026-11-23", undefined, boom),
      { message: "boom" },
    );
  });
  test("out-of-range when a neighbouring day is outside the years 1000-9999", () => {
    assert.throws(
      () => matchPattern(rule({ dayAfterHoliday: true }), "1000-01-01", () => undefined),
      { code: "out-of-range" },
    );
    assert.throws(
      () => matchPattern(rule({ dayBeforeHoliday: true }), "9999-12-31", () => undefined),
      { code: "out-of-range" },
    );
  });
});

describe("matchRecurring", () => {
  test("true when the date is in the effective period and the pattern matches", () => {
    const r = rule({ weekday: 1, effectiveFrom: "2026-11-09", effectiveTo: "2026-11-23" });
    const none = () => undefined;
    assert.deepEqual(
      ["2026-11-02", "2026-11-09", "2026-11-10", "2026-11-23", "2026-11-30"].map((d) =>
        matchRecurring(r, d, none),
      ),
      [false, true, false, true, false],
    );
  });
  test("the holiday lookup, the basis and fromJp are passed to the pattern", () => {
    const holidayOf = lookupOf([holiday("2026-11-23")]);
    assert.equal(matchRecurring(rule({ holiday: true }), "2026-11-23", holidayOf), true);
    assert.equal(
      matchRecurring(rule({ businessDayOfMonth: 1 }), "2026-11-02", holidayOf, weekdaysBasis),
      true,
    );
    const national = rule({ holiday: true, kinds: ["national"] }, "only");
    assert.equal(
      matchRecurring(national, "2026-11-23", holidayOf, undefined, () => true),
      true,
    );
    assert.equal(
      matchRecurring(national, "2026-11-23", holidayOf, undefined, () => false),
      false,
    );
  });
});

describe("requiredValue", () => {
  test("the value of an entry that has the key value, undefined included", () => {
    const c = new IssueCollector();
    const valueOf = requiredValue<unknown>(c);
    assert.deepEqual(valueOf({ value: 5 }, "p"), { value: 5 });
    assert.deepEqual(valueOf({ value: undefined }, "p"), { value: undefined });
    assert.deepEqual(issues(c), []);
  });
  test("undefined and invalid-option at the path when the key is missing", () => {
    const c = new IssueCollector();
    assert.equal(requiredValue<unknown>(c)({}, "p"), undefined);
    assert.deepEqual(issues(c), ["error invalid-option p"]);
  });
});

describe("validateProvider", () => {
  const good = () => ({
    id: "X",
    timeZone: "Asia/Tokyo",
    supportedYears: { from: 1000, to: 9999 },
    dataVersion: "",
    holidaysInYear: () => [],
  });
  const check = (p: unknown) => {
    const c = new IssueCollector();
    return { ok: validateProvider(c, "hp", p), issues: issues(c) };
  };
  test("true for a provider with every required member, with or without confirmedThrough", () => {
    assert.deepEqual(check(good()), { ok: true, issues: [] });
    assert.deepEqual(check({ ...good(), confirmedThrough: 2027 }), { ok: true, issues: [] });
    assert.deepEqual(check({ ...good(), confirmedThrough: undefined }), { ok: true, issues: [] });
  });
  test("false and one invalid-provider error for anything else", () => {
    const wrong: unknown[] = [
      null,
      "JP",
      [],
      { ...good(), id: "" },
      { ...good(), id: 1 },
      { ...good(), timeZone: 9 },
      { ...good(), timeZone: "Not/AZone" },
      { ...good(), supportedYears: null },
      { ...good(), supportedYears: { from: 2000.5, to: 2010 } },
      { ...good(), supportedYears: { from: 2000, to: "2010" } },
      { ...good(), supportedYears: { from: 999, to: 2010 } },
      { ...good(), supportedYears: { from: 2000, to: 10000 } },
      { ...good(), supportedYears: { from: 2011, to: 2010 } },
      { ...good(), dataVersion: 1 },
      { ...good(), confirmedThrough: "2027" },
      { ...good(), confirmedThrough: 2027.5 },
      { ...good(), holidaysInYear: [] },
    ];
    for (const p of wrong)
      assert.deepEqual(
        check(p),
        { ok: false, issues: ["error invalid-provider hp"] },
        JSON.stringify(p),
      );
  });
});

describe("reportNational", () => {
  const report = (kinds: unknown, mixed = false) => {
    const c = new IssueCollector();
    return { found: reportNational(c, "r.kinds", kinds, mixed), issues: c.issues };
  };
  test("a deprecated-option warning for every national, at its index", () => {
    const { found, issues: list } = report(["national", "substitute", "national"]);
    assert.equal(found, true);
    assert.deepEqual(list, [
      {
        severity: "warning",
        code: "deprecated-option",
        path: "r.kinds[0]",
        message: '"national" was renamed to "regular" in 0.30.0',
      },
      {
        severity: "warning",
        code: "deprecated-option",
        path: "r.kinds[2]",
        message: '"national" was renamed to "regular" in 0.30.0',
      },
    ]);
  });
  test("with mixed the warning is marked nationalInUnion", () => {
    assert.deepEqual(report(["national"], true).issues, [
      {
        severity: "warning",
        code: "deprecated-option",
        path: "r.kinds[0]",
        message: '"national" was renamed to "regular" in 0.30.0',
        nationalInUnion: true,
      },
    ]);
  });
  test("false and no warning without national, and when kinds is not an array; the value is not rewritten", () => {
    assert.deepEqual(report(["regular"]), { found: false, issues: [] });
    assert.deepEqual(report("national"), { found: false, issues: [] });
    assert.deepEqual(report(undefined), { found: false, issues: [] });
    const kinds = ["national"];
    report(kinds);
    assert.deepEqual(kinds, ["national"]);
  });
});

describe("jpUsage", () => {
  const source = (...ids: string[]): HolidaySource<string> => ({
    providers: ids.map((id) => provider(id, [])),
    timeZone: "UTC",
    outOfRangePolicy: "throw",
    unconfirmedHolidayPolicy: "accept",
  });
  test("none without a JP provider, only when every provider is JP, otherwise mixed", () => {
    assert.equal(jpUsage(source()), "none");
    assert.equal(jpUsage(source("UK", "FR")), "none");
    assert.equal(jpUsage(source("JP")), "only");
    assert.equal(jpUsage(source("JP", "JP")), "only");
    assert.equal(jpUsage(source("JP", "UK")), "mixed");
  });
});

describe("compileHolidaySource", () => {
  const compile = (options: Record<string, unknown>) => {
    const c = new IssueCollector();
    return { source: compileHolidaySource<string>(c, options), issues: issues(c) };
  };
  const tokyo = provider("A", [], { timeZone: "Asia/Tokyo" });
  const london = provider("B", [], { timeZone: "Europe/London" });
  test("without providers: no provider, UTC and the default policies", () => {
    const { source, issues: found } = compile({});
    assert.deepEqual(found, []);
    assert.deepEqual(source, {
      providers: [],
      providerIndexes: [],
      timeZone: "UTC",
      outOfRangePolicy: "throw",
      unconfirmedHolidayPolicy: "accept",
    });
    assert.ok(Object.isFrozen(source.providers) && Object.isFrozen(source.providerIndexes));
  });
  test("a single provider or an array; the time zone is the providers' common zone", () => {
    const single = compile({ holidayProvider: tokyo });
    assert.deepEqual(
      [single.source.providers, single.source.providerIndexes, single.source.timeZone],
      [[tokyo], [0], "Asia/Tokyo"],
    );
    const two = compile({
      holidayProvider: [tokyo, provider("C", [], { timeZone: "Asia/Tokyo" })],
    });
    assert.deepEqual(two.issues, []);
    assert.deepEqual([two.source.providers.length, two.source.timeZone], [2, "Asia/Tokyo"]);
  });
  test("a provider object given twice is kept once; providerIndexes holds the positions as written", () => {
    const { source, issues: found } = compile({
      holidayProvider: [tokyo, tokyo, london, tokyo],
      timeZone: "UTC",
    });
    assert.deepEqual(found, []);
    assert.deepEqual(source.providers, [tokyo, london]);
    assert.deepEqual(source.providerIndexes, [0, 2]);
  });
  test("an invalid provider is reported at its position and left out", () => {
    assert.deepEqual(compile({ holidayProvider: {} }).issues, [
      "error invalid-provider holidayProvider",
    ]);
    const { source, issues: found } = compile({ holidayProvider: [null, tokyo] });
    assert.deepEqual(found, ["error invalid-provider holidayProvider[0]"]);
    assert.deepEqual([source.providers, source.providerIndexes], [[tokyo], [1]]);
  });
  test("providers in different zones are a time-zone-conflict unless timeZone is given", () => {
    const conflict = compile({ holidayProvider: [tokyo, london] });
    assert.deepEqual(conflict.issues, ["error time-zone-conflict timeZone"]);
    assert.equal(conflict.source.timeZone, "Asia/Tokyo");
    const given = compile({ holidayProvider: [tokyo, london], timeZone: "Europe/Paris" });
    assert.deepEqual([given.issues, given.source.timeZone], [[], "Europe/Paris"]);
  });
  test("an invalid timeZone is invalid-time-zone and falls back to UTC", () => {
    const { source, issues: found } = compile({ holidayProvider: tokyo, timeZone: "Not/AZone" });
    assert.deepEqual(found, ["error invalid-time-zone timeZone"]);
    assert.equal(source.timeZone, "UTC");
  });
  test("the policies as written; an invalid value, null included, is invalid-option and falls back to the default", () => {
    const written = compile({ outOfRangePolicy: "ignore", unconfirmedHolidayPolicy: "throw" });
    assert.deepEqual(
      [written.issues, written.source.outOfRangePolicy, written.source.unconfirmedHolidayPolicy],
      [[], "ignore", "throw"],
    );
    const wrong = compile({ outOfRangePolicy: null, unconfirmedHolidayPolicy: "reject" });
    assert.deepEqual(wrong.issues, [
      "error invalid-option outOfRangePolicy",
      "error invalid-option unconfirmedHolidayPolicy",
    ]);
    assert.deepEqual(
      [wrong.source.outOfRangePolicy, wrong.source.unconfirmedHolidayPolicy],
      ["throw", "accept"],
    );
  });
});

describe("providerDataError", () => {
  test("a RangeError invalid-provider-data that names the provider and the year", () => {
    const error = providerDataError(provider("X", []), 2026, "broken");
    assert.ok(error instanceof RangeError);
    assert.equal((error as RangeError & { code: string }).code, "invalid-provider-data");
    assert.equal(error.message, "Holiday provider X returned invalid data for 2026: broken");
  });
});

describe("loadProviderYear", () => {
  const load = (list: unknown) =>
    loadProviderYear(provider("X", [], { holidaysInYear: () => list }), 2026);
  const bad = { name: "RangeError", code: "invalid-provider-data" };
  test("new frozen holidays with only the contract's properties", () => {
    const names = { ja: "N" };
    const given = { ...holiday("2026-11-23", { key: "labour-day", names }), extra: 1 };
    const [h, plain] = load([given, holiday("2026-11-03", { confirmed: false })]);
    assert.deepEqual(h, {
      date: "2026-11-23",
      name: "N 2026-11-23",
      nameEn: "E 2026-11-23",
      kind: "regular",
      confirmed: true,
      names: { ja: "N" },
      key: "labour-day",
    });
    assert.notEqual(h, given);
    assert.notEqual(h!.names, names);
    assert.ok(Object.isFrozen(h) && Object.isFrozen(h!.names));
    assert.deepEqual(Object.keys(plain!), ["date", "name", "nameEn", "kind", "confirmed"]);
    assert.equal(plain!.confirmed, false);
    assert.deepEqual(load([]), []);
  });
  test("the provider is called with the year", () => {
    const years: number[] = [];
    loadProviderYear(
      provider("X", [], {
        holidaysInYear: (year: number) => {
          years.push(year);
          return [];
        },
      }),
      2031,
    );
    assert.deepEqual(years, [2031]);
  });
  test("invalid-provider-data when the result is not an array", () => {
    for (const list of [undefined, null, {}, "x"]) assert.throws(() => load(list), bad);
  });
  test("invalid-provider-data when an item is not an object; a hole is an item", () => {
    assert.throws(() => load([null]), bad);
    assert.throws(() => load(["2026-11-23"]), bad);
    // eslint-disable-next-line no-sparse-arrays
    assert.throws(() => load([holiday("2026-11-23"), ,]), /item 1 is not an object/);
  });
  test("invalid-provider-data for an invalid date and a date outside the year", () => {
    assert.throws(() => load([holiday("2026-02-30")]), bad);
    assert.throws(() => load([{ ...holiday("2026-11-23"), date: 20261123 }]), bad);
    assert.throws(() => load([holiday("2027-01-01")]), bad);
  });
  test("invalid-provider-data for a repeated date", () => {
    assert.throws(
      () => load([holiday("2026-11-23"), holiday("2026-11-23")]),
      /duplicate date 2026-11-23/,
    );
  });
  test("invalid-provider-data for a name, nameEn or kind that is not a string, and a confirmed that is not a boolean", () => {
    for (const extra of [
      { name: 1 },
      { nameEn: undefined },
      { kind: null },
      { confirmed: "yes" },
      { confirmed: undefined },
    ])
      assert.throws(
        () => load([{ ...holiday("2026-11-23"), ...extra }]),
        bad,
        JSON.stringify(extra),
      );
  });
  test("invalid-provider-data for invalid names and an invalid key", () => {
    assert.throws(() => load([{ ...holiday("2026-11-23"), names: "N" }]), bad);
    assert.throws(() => load([{ ...holiday("2026-11-23"), names: { ja: 1 } }]), bad);
    assert.throws(() => load([{ ...holiday("2026-11-23"), key: "Labour Day" }]), bad);
    assert.throws(() => load([{ ...holiday("2026-11-23"), key: 1 }]), bad);
  });
});

describe("mergeProviderYear", () => {
  test("holidays by date; on a shared date the provider passed first wins", () => {
    const a = provider("A", [holiday("2026-11-23", { name: "a" })]);
    const b = provider("B", [
      holiday("2026-11-23", { name: "b" }),
      holiday("2026-11-03", { name: "b3" }),
    ]);
    const { map, jpDates } = mergeProviderYear([a, b], "throw", 2026);
    assert.deepEqual([...map.keys()], ["2026-11-23", "2026-11-03"]);
    assert.deepEqual([map.get("2026-11-23")!.name, map.get("2026-11-03")!.name], ["a", "b3"]);
    assert.deepEqual([...jpDates], []);
    assert.equal(mergeProviderYear([b, a], "throw", 2026).map.get("2026-11-23")!.name, "b");
  });
  test("jpDates: the dates whose remaining holiday comes from a provider whose ID is JP", () => {
    const jp = provider("JP", [holiday("2026-11-23"), holiday("2026-11-03")]);
    const other = provider("B", [holiday("2026-11-23"), holiday("2026-12-25")]);
    assert.deepEqual(
      [...mergeProviderYear([jp, other], "throw", 2026).jpDates],
      ["2026-11-23", "2026-11-03"],
    );
    assert.deepEqual([...mergeProviderYear([other, jp], "throw", 2026).jpDates], ["2026-11-03"]);
  });
  test("an empty map without providers", () => {
    const { map, jpDates } = mergeProviderYear([], "throw", 2026);
    assert.deepEqual([map.size, jpDates.size], [0, 0]);
  });
  test("outside a provider's supported years: out-of-range with throw, the provider is skipped with ignore", () => {
    const narrow = provider("A", [holiday("2051-01-01")]);
    const wide = provider("B", [holiday("2051-05-05")], {
      supportedYears: { from: 2000, to: 2099 },
    });
    assert.throws(() => mergeProviderYear([wide, narrow], "throw", 2051), {
      name: "RangeError",
      code: "out-of-range",
    });
    assert.throws(() => mergeProviderYear([narrow], "throw", 1999), { code: "out-of-range" });
    assert.deepEqual(
      [...mergeProviderYear([narrow, wide], "ignore", 2051).map.keys()],
      ["2051-05-05"],
    );
    assert.equal(mergeProviderYear([narrow], "throw", 2050).map.size, 0);
    assert.equal(mergeProviderYear([narrow], "throw", 2000).map.size, 0);
  });
  test("invalid-provider-data for invalid data", () => {
    assert.throws(
      () => mergeProviderYear([provider("A", [], { holidaysInYear: () => null })], "ignore", 2026),
      {
        code: "invalid-provider-data",
      },
    );
  });
});

describe("unconfirmedHolidayError", () => {
  const h = holiday("2030-03-20", { name: "Equinox", confirmed: false });
  test("a RangeError unconfirmed-holiday that names the date and the holiday", () => {
    const error = unconfirmedHolidayError([provider("A", [h])], h);
    assert.ok(error instanceof RangeError);
    assert.equal((error as RangeError & { code: string }).code, "unconfirmed-holiday");
    assert.equal(
      error.message,
      "2030-03-20 Equinox is not yet confirmed; this evaluation looked up a predicted holiday",
    );
  });
  test("with confirmedThrough of the provider whose unconfirmed holiday it is", () => {
    const confirmedElsewhere = provider("A", [{ ...h, confirmed: true }], {
      confirmedThrough: 2040,
    });
    const outside = provider("B", [h], {
      supportedYears: { from: 2000, to: 2029 },
      confirmedThrough: 2028,
    });
    const before = provider("D", [h], {
      supportedYears: { from: 2031, to: 2050 },
      confirmedThrough: 2029,
    });
    const owner = provider("C", [h], { confirmedThrough: 2027 });
    assert.equal(
      unconfirmedHolidayError([confirmedElsewhere, outside, before, owner], h).message,
      "2030-03-20 Equinox is not yet confirmed (C is confirmed through 2027); this evaluation looked up a predicted holiday",
    );
  });
  test("without the note when no provider has it", () => {
    assert.equal(
      unconfirmedHolidayError([provider("A", [], { confirmedThrough: 2027 })], h).message,
      "2030-03-20 Equinox is not yet confirmed; this evaluation looked up a predicted holiday",
    );
  });
});

describe("createHolidayLookup", () => {
  const list = [
    holiday("2026-11-03"),
    holiday("2026-11-23"),
    holiday("2027-01-01"),
    holiday("2030-03-20", { confirmed: false }),
  ];
  const lookupFor = (
    extra: Partial<HolidaySource<string>> = {},
    providers = [provider("JP", list, { timeZone: "Asia/Tokyo" })],
  ) =>
    createHolidayLookup<string>({
      providers,
      timeZone: "Asia/Tokyo",
      outOfRangePolicy: "throw",
      unconfirmedHolidayPolicy: "accept",
      ...extra,
    });
  test("the source's providers, time zone and policies, under the new and the old names", () => {
    const providers = [provider("JP", list)];
    const lookup = lookupFor(
      { outOfRangePolicy: "ignore", unconfirmedHolidayPolicy: "throw" },
      providers,
    );
    assert.equal(lookup.providers, providers);
    assert.deepEqual(
      [
        lookup.timeZone,
        lookup.outOfRangePolicy,
        lookup.outOfRange,
        lookup.unconfirmedHolidayPolicy,
        lookup.unconfirmedHolidays,
      ],
      ["Asia/Tokyo", "ignore", "ignore", "throw", "throw"],
    );
  });
  test("holidayOfDate: the holiday on a date string, or undefined; always undefined without providers", () => {
    const lookup = lookupFor();
    assert.equal(lookup.holidayOfDate("2026-11-23")!.name, "N 2026-11-23");
    assert.equal(lookup.holidayOfDate("2026-11-24"), undefined);
    assert.equal(lookupFor({}, []).holidayOfDate("1000-01-01"), undefined);
  });
  test("provider data is loaded once per year", () => {
    const years: number[] = [];
    const counting = provider("X", [], {
      holidaysInYear: (year: number) => {
        years.push(year);
        return [];
      },
    });
    const lookup = lookupFor({}, [counting]);
    lookup.holidayOfDate("2026-01-01");
    lookup.isHoliday("2026-12-31");
    lookup.holidaysInYear(2026);
    lookup.holidayOfDate("2027-01-01");
    assert.deepEqual(years, [2026, 2027]);
  });
  test("holidayOfDate: unconfirmed-holiday for an unconfirmed holiday with the policy throw, unless allowed", () => {
    const lookup = lookupFor({ unconfirmedHolidayPolicy: "throw" });
    assert.throws(() => lookup.holidayOfDate("2030-03-20"), {
      name: "RangeError",
      code: "unconfirmed-holiday",
    });
    assert.equal(lookup.holidayOfDate("2030-03-20", true)!.confirmed, false);
    assert.equal(lookup.holidayOfDate("2026-11-23")!.confirmed, true);
    assert.equal(lookup.holidayOfDate("2030-03-21"), undefined);
    assert.equal(lookupFor().holidayOfDate("2030-03-20")!.confirmed, false);
  });
  test("holidayOfDate: out-of-range outside the supported years with throw; undefined with ignore", () => {
    assert.throws(() => lookupFor().holidayOfDate("2051-01-01"), { code: "out-of-range" });
    assert.equal(lookupFor({ outOfRangePolicy: "ignore" }).holidayOfDate("2051-01-01"), undefined);
  });
  test("fromJp: whether the holiday of a loaded year comes from the JP provider", () => {
    const lookup = lookupFor({}, [provider("X", [holiday("2026-11-23")]), provider("JP", list)]);
    assert.equal(lookup.fromJp("2026-11-03"), false);
    lookup.holidayOfDate("2026-01-01");
    assert.deepEqual(
      ["2026-11-03", "2026-11-23", "2026-11-24"].map((d) => lookup.fromJp(d)),
      [true, false, false],
    );
  });
  test("dateOf and civilOf: the calendar date and the date-time parts in the lookup's time zone", () => {
    const lookup = lookupFor();
    assert.equal(lookup.dateOf("2026-11-23"), "2026-11-23");
    assert.equal(lookup.dateOf(new Date("2026-11-22T15:00:00Z")), "2026-11-23");
    assert.equal(lookup.dateOf(new Date("2026-11-22T14:59:59Z")), "2026-11-22");
    const parts = lookup.civilOf(new Date("2026-11-22T15:30:00Z"));
    assert.deepEqual(parts, { date: "2026-11-23", time: "00:30" });
    assert.deepEqual(lookup.civilOf("2026-11-23"), { date: "2026-11-23", time: null });
    assert.throws(() => lookup.dateOf("2026-02-30"), { code: "invalid-date" });
  });
  test("instantOf: the instant of a date and a time in the lookup's time zone", () => {
    assert.equal(
      lookupFor().instantOf("2026-11-23", "09:00").toISOString(),
      "2026-11-23T00:00:00.000Z",
    );
  });
  test("today: the date of a Date in the lookup's time zone; the current time by default", () => {
    const lookup = lookupFor();
    assert.equal(lookup.today(new Date("2026-11-22T15:00:00Z")), "2026-11-23");
    assert.match(lookup.today(), /^\d{4}-\d{2}-\d{2}$/);
    for (const now of [Date.now(), "2026-11-23", null])
      assert.throws(() => lookup.today(now as unknown as Date), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("isHoliday, holidayOn and getHoliday take a date input", () => {
    const lookup = lookupFor();
    assert.equal(lookup.isHoliday("2026-11-23"), true);
    assert.equal(lookup.isHoliday(new Date("2026-11-22T15:00:00Z")), true);
    assert.equal(lookup.isHoliday("2026-11-24"), false);
    assert.equal(lookup.holidayOn("2026-11-23")!.date, "2026-11-23");
    assert.equal(lookup.holidayOn("2026-11-24"), undefined);
    assert.equal(lookup.getHoliday("2026-11-23"), lookup.holidayOn("2026-11-23"));
    const strict = lookupFor({ unconfirmedHolidayPolicy: "throw" });
    for (const call of [
      () => strict.isHoliday("2030-03-20"),
      () => strict.holidayOn("2030-03-20"),
      () => strict.getHoliday("2030-03-20"),
    ])
      assert.throws(call, { code: "unconfirmed-holiday" });
  });
  test("holidaysInYear: the holidays of the year in date order, frozen; unconfirmed ones do not throw", () => {
    const unordered = provider("X", [
      holiday("2026-11-23"),
      holiday("2026-11-03"),
      holiday("2026-05-05"),
    ]);
    const lookup = lookupFor({ unconfirmedHolidayPolicy: "throw" }, [
      unordered,
      provider("JP", list),
    ]);
    const year = lookup.holidaysInYear(2026);
    assert.deepEqual(
      year.map((h) => h.date),
      ["2026-05-05", "2026-11-03", "2026-11-23"],
    );
    assert.ok(Object.isFrozen(year));
    assert.equal(lookup.holidaysInYear(2030)[0]!.confirmed, false);
    assert.deepEqual(lookupFor({}, []).holidaysInYear(2026), []);
  });
  test("holidaysInYear: invalid-argument for a year that is not an integer; out-of-range outside 1000-9999 and outside the supported years", () => {
    const lookup = lookupFor({ outOfRangePolicy: "ignore" });
    for (const year of [2026.5, "2026", Number.NaN])
      assert.throws(() => lookup.holidaysInYear(year as number), {
        name: "RangeError",
        code: "invalid-argument",
      });
    assert.throws(() => lookup.holidaysInYear(999), { code: "out-of-range" });
    assert.throws(() => lookup.holidaysInYear(10000), { code: "out-of-range" });
    assert.deepEqual(lookup.holidaysInYear(2051), []);
    assert.throws(() => lookupFor().holidaysInYear(2051), { code: "out-of-range" });
  });
  test("holidaysBetween: the holidays of a period, both ends included, across years, frozen", () => {
    const lookup = lookupFor();
    const between = lookup.holidaysBetween("2026-11-23", "2027-01-01");
    assert.deepEqual(
      between.map((h) => h.date),
      ["2026-11-23", "2027-01-01"],
    );
    assert.ok(Object.isFrozen(between));
    assert.deepEqual(lookup.holidaysBetween("2026-11-04", "2026-11-22"), []);
    assert.equal(lookup.holidaysBetween("2026-11-23", "2026-11-23").length, 1);
  });
  test("holidaysBetween: invalid-range when from is after to", () => {
    assert.throws(() => lookupFor().holidaysBetween("2026-11-24", "2026-11-23"), {
      name: "RangeError",
      code: "invalid-range",
    });
  });
});
