// Unit tests of the functions of src/core/diagnose.ts that suggest keys, read the inside of counting-basis
// calendars and compare rules and values. One describe per function, named after the function; each test is one
// statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
} from "../../../src/core/calendar.ts";
import {
  annualBits,
  canCover,
  closestKey,
  closestOf,
  collectBasis,
  cycleCovers,
  DIAGNOSTIC_YEARS,
  eachDay,
  editDistance,
  intervalCovers,
  isSubset,
  patternBits,
  periodCovers,
  periodsOverlap,
  providerPath,
  rulesScanWindow,
  sameValue,
  sameValueIn,
  without,
  type BasisInside,
} from "../../../src/core/diagnose.ts";
import { IssueCollector } from "../../../src/core/errors.ts";
import {
  compileScheduleOptions,
  createSchedule,
  dayNumberOf,
  type AnnualRule,
  type CompiledSchedule,
  type HolidaySource,
} from "../../../src/core/schedule.ts";
import type { HolidayProvider } from "../../../src/core/types.ts";

const day = dayNumberOf;
const FROM = day(`${DIAGNOSTIC_YEARS.from}-01-01`);
const TO = day(`${DIAGNOSTIC_YEARS.to}-12-31`);
const P2001 = day("2001-01-01");
const DAYS_28 = day("2028-12-31") - P2001 + 1;
type Week = [string, string, string, string, string, string, string];
const WEEK: Week = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const provider = (id: string, from: number, to: number): HolidayProvider<string> => ({
  id,
  timeZone: "UTC",
  supportedYears: { from, to },
  dataVersion: "1",
  holidaysInYear: () => [],
});
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
/** The compiled first recurring rule */
const rule = (entry: Record<string, unknown>) =>
  compiledOf({ recurringRules: [{ value: "R", ...entry }] }).recurring[0]!;
const inside = (): BasisInside => ({ edges: [], spans: [], rules: [] });

describe("editDistance", () => {
  test("0 for equal strings", () => {
    assert.equal(editDistance("", ""), 0);
    assert.equal(editDistance("weekday", "weekday"), 0);
  });
  test("an insertion, a deletion and a substitution count 1 each", () => {
    assert.equal(editDistance("", "abc"), 3);
    assert.equal(editDistance("abc", ""), 3);
    assert.equal(editDistance("weekday", "weekdays"), 1);
    assert.equal(editDistance("weekdays", "weekday"), 1);
    assert.equal(editDistance("weekday", "weakday"), 1);
    assert.equal(editDistance("kitten", "sitting"), 3);
  });
  test("a swap of two adjacent characters counts 1", () => {
    assert.equal(editDistance("weekday", "wekeday"), 1);
    assert.equal(editDistance("ab", "ba"), 1);
    // Optimal string alignment: a swapped pair is not edited again
    assert.equal(editDistance("ca", "abc"), 3);
  });
});

describe("closestOf", () => {
  const known = ["weekday", "dayOfMonth", "months", "name"];
  test("an entry equal ignoring case", () => {
    assert.equal(closestOf("WeekDay", known), "weekday");
    assert.equal(closestOf("dayofmonth", known), "dayOfMonth");
  });
  test("a key of 4 or more characters that is a case-insensitive prefix of an entry", () => {
    assert.equal(closestOf("dayO", known), "dayOfMonth");
    assert.equal(closestOf("WEEK", known), "weekday");
    // 3 characters are not enough for the prefix rule, and too far for the distance rule
    assert.equal(closestOf("day", known), undefined);
    // The prefix has priority over a nearer entry
    assert.equal(closestOf("name", ["nam", "names"]), "names");
  });
  test("the entry with the smallest edit distance within max(1, floor(length / 4)); ties keep the first", () => {
    assert.equal(closestOf("weekdya", known), "weekday");
    assert.equal(closestOf("nam", known), "name");
    assert.equal(closestOf("montsh", known), "months");
    assert.equal(closestOf("dayOfMnoth", known), "dayOfMonth");
    // Distance 2 with 8 characters is within the limit; with 7 it is not
    assert.equal(closestOf("abcdefxy", ["abcdefgh"]), "abcdefgh");
    assert.equal(closestOf("abcdexy", ["abcdefg"]), undefined);
    assert.equal(closestOf("ab", ["ax", "ay"]), "ax");
    assert.equal(closestOf("ab", ["xy", "ay"]), "ay");
  });
  test("undefined when nothing is close enough, and without candidates", () => {
    assert.equal(closestOf("holiday", known), undefined);
    assert.equal(closestOf("weekday", []), undefined);
  });
});

describe("closestKey", () => {
  test("the closest valid key, as closestOf", () => {
    assert.equal(closestKey("weekdya", ["weekday", "dayOfMonth"]), "weekday");
    assert.equal(closestKey("zzz", ["weekday", "dayOfMonth"]), undefined);
  });
  test("a typo close to an old name suggests the new name", () => {
    assert.equal(
      closestKey("closedAnual", ["closedAnnualDates", "closedDates"]),
      "closedAnnualDates",
    );
    assert.equal(closestKey("maxSearchDay", ["searchDayLimit"]), "searchDayLimit");
    assert.equal(closestKey("holidys", ["holidayProvider", "timeZone"]), "holidayProvider");
  });
  test("an old name is not suggested when its new name is not valid at the position", () => {
    assert.equal(closestKey("maxSearchDay", ["timeZone"]), undefined);
  });
  test("a valid key that is also an old name of another key is suggested as it is", () => {
    // "holiday" is a key of a recurring rule and the old name of holidayPolicy
    assert.equal(closestKey("holidya", ["holiday", "holidayPolicy"]), "holiday");
  });
});

describe("collectBasis", () => {
  test("false for a calendar not created by this library", () => {
    const out = inside();
    assert.equal(collectBasis({ isBusinessDay: () => true, timeZone: "UTC" }, out), false);
    assert.equal(collectBasis({ ...createCalendar({}) }, out), false);
    assert.deepEqual(out, inside());
  });
  test("edges: both ends of effective periods, of specific dates and of the providers' supported years; spans: the supported years; rules: the recurring rules", () => {
    const calendar = createCalendar({
      holidayProvider: provider("X", 2000, 2050),
      closedAnnualDates: [{ date: "12-31", effectiveFrom: "2010-01-01" }],
      closedDates: ["2026-11-23", { from: "2026-12-29", to: "2027-01-03" }],
      closedRecurringRules: [{ weekday: 3, effectiveTo: "2030-12-31" }, { weekday: 4 }],
    });
    const out = inside();
    assert.equal(collectBasis(calendar, out), true);
    assert.deepEqual(out.spans, [{ from: day("2000-01-01"), to: day("2050-12-31") }]);
    assert.deepEqual(out.edges, [
      day("2000-01-01"),
      day("2051-01-01"),
      day("2010-01-01"),
      day("2031-01-01"),
      day("2026-11-23"),
      day("2026-11-24"),
      day("2026-12-29"),
      day("2027-01-04"),
    ]);
    assert.deepEqual(
      out.rules.map((r) => r.weekday),
      [3, 4],
    );
  });
  test("the output is appended to", () => {
    const out: BasisInside = { edges: [1], spans: [{ from: 1, to: 2 }], rules: [] };
    assert.equal(collectBasis(createCalendar({ closedDates: ["2026-11-23"] }), out), true);
    assert.deepEqual(out.edges, [1, day("2026-11-23"), day("2026-11-24")]);
    assert.equal(out.spans.length, 1);
  });
  test("the parts of a combined calendar are followed; false when one of them is unknown", () => {
    const a = createCalendar({ closedDates: ["2026-11-23"] });
    const b = createCalendar({ closedRecurringRules: [{ weekday: 3 }] });
    const out = inside();
    assert.equal(collectBasis(combineCalendars([a, b], { open: "all" }), out), true);
    assert.deepEqual([out.edges.length, out.rules.length], [2, 1]);
    const unknown = { ...a };
    assert.equal(
      collectBasis(combineCalendars([unknown as typeof a, b], { open: "all" }), inside()),
      false,
    );
  });
  test("the basis of a rule inside a basis is followed; false when it is unknown", () => {
    const innermost = createCalendar({ closedDates: ["2026-11-23"] });
    const schedule = createSchedule({
      weekdayValues: WEEK,
      recurringRules: [
        { businessDayOfMonth: 1, calendar: innermost, value: "first", effectiveFrom: "2020-01-01" },
      ],
    });
    const out = inside();
    assert.equal(
      collectBasis(
        createCalendarFromSchedule(schedule, (value) => value !== "first"),
        out,
      ),
      true,
    );
    assert.deepEqual(out.edges, [day("2020-01-01"), day("2026-11-23"), day("2026-11-24")]);
    assert.equal(out.rules.length, 1);
    const foreign = createSchedule({
      weekdayValues: WEEK,
      recurringRules: [{ businessDayOfMonth: 1, calendar: { ...innermost }, value: "first" }],
    });
    assert.equal(
      collectBasis(
        createCalendarFromSchedule(foreign, () => true),
        inside(),
      ),
      false,
    );
  });
});

describe("rulesScanWindow", () => {
  test("the window of scanWindow for options without a basis calendar", () => {
    const window = rulesScanWindow(compiledOf({ recurringRules: [{ weekday: 1, value: "R" }] }))!;
    assert.deepEqual(window.ranges, [{ from: P2001, to: P2001 + DAYS_28 - 1 }]);
  });
  test("the edges and the cycles inside a known basis calendar are part of the window", () => {
    const basis = createCalendar({
      closedDates: ["2040-06-15"],
      closedRecurringRules: [{ cycle: 5, anchor: "2026-11-23", positions: [1] }],
    });
    const compiled = compiledOf({
      recurringRules: [{ businessDayOfMonth: 1, calendar: basis, value: "R" }],
    });
    const window = rulesScanWindow(compiled)!;
    const cycle = DAYS_28 * 5;
    const edge = day("2040-06-15");
    assert.ok(
      window.ranges.some((r) => r.from <= edge - cycle + 1 || r.from === FROM),
      JSON.stringify(window.ranges),
    );
    assert.ok(window.ranges.some((r) => r.from <= edge && r.to >= edge + 1));
    const plain = rulesScanWindow(
      compiledOf({
        recurringRules: [{ businessDayOfMonth: 1, calendar: createCalendar({}), value: "R" }],
      }),
    )!;
    assert.deepEqual(plain.ranges, [{ from: P2001, to: P2001 + DAYS_28 - 1 }]);
  });
  test("the whole judgeable span when a basis calendar has unknown contents", () => {
    const foreign = { ...createCalendar({}) };
    const compiled = compiledOf({
      recurringRules: [{ businessDayOfMonth: 1, calendar: foreign, value: "R" }],
    });
    assert.deepEqual(rulesScanWindow(compiled)!.ranges, [{ from: FROM, to: TO }]);
    const limited = compiledOf({
      holidayProvider: provider("X", 2000, 2050),
      recurringRules: [{ businessDayOfMonth: 1, calendar: foreign, value: "R" }],
    });
    assert.deepEqual(rulesScanWindow(limited)!.ranges, [
      { from: day("2000-01-01"), to: day("2050-12-31") },
    ]);
  });
  test("undefined when no day can be judged", () => {
    const compiled = compiledOf({
      holidayProvider: [provider("A", 2000, 2010), provider("B", 2020, 2030)],
    });
    assert.equal(rulesScanWindow(compiled), undefined);
  });
});

describe("eachDay", () => {
  const window = {
    ranges: [
      { from: 3, to: 5 },
      { from: 9, to: 10 },
    ],
    label: "",
  } as never;
  test("fn receives every day of the window in ascending order", () => {
    const seen: number[] = [];
    eachDay(window, (n) => {
      seen.push(n);
    });
    assert.deepEqual(seen, [3, 4, 5, 9, 10]);
  });
  test("returning true stops the iteration; any other value does not", () => {
    const seen: number[] = [];
    eachDay(window, (n) => {
      seen.push(n);
      return n === 4;
    });
    assert.deepEqual(seen, [3, 4]);
    const all: number[] = [];
    eachDay(window, (n) => {
      all.push(n);
      return false;
    });
    assert.equal(all.length, 5);
  });
});

describe("patternBits", () => {
  const at = (date: string): number => day(date) - P2001;
  test("one byte per day of 2001-2028, 1 on the days the shape matches", () => {
    const bits = patternBits(rule({ dayOfMonth: 20, months: [11] }));
    assert.equal(bits.length, DAYS_28);
    assert.equal(
      bits.reduce((sum, v) => sum + v, 0),
      28,
    );
    assert.deepEqual(
      [bits[at("2026-11-20")], bits[at("2026-11-21")], bits[at("2001-11-20")]],
      [1, 0, 1],
    );
  });
  test("the effective period is ignored", () => {
    const bits = patternBits(
      rule({ weekday: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" }),
    );
    assert.deepEqual([bits[0], bits[at("2028-12-25")]], [1, 1]);
  });
  test("a rule with interval is treated as every week", () => {
    const every = patternBits(rule({ weekday: 3 }));
    const second = patternBits(rule({ weekday: 3, interval: 2, anchor: "2026-11-25" }));
    assert.deepEqual(second, every);
  });
});

describe("annualBits", () => {
  const annual = (from: string, to: string) => ({ from, to }) as AnnualRule<unknown>;
  const count = (bits: Uint8Array) => bits.reduce((sum, v) => sum + v, 0);
  test("366 bytes from 01-01, 1 on the month-days the rule matches", () => {
    const bits = annualBits(annual("01-02", "01-03"));
    assert.equal(bits.length, 366);
    assert.deepEqual(Array.from(bits.subarray(0, 4)), [0, 1, 1, 0]);
    assert.equal(count(bits), 2);
    // 02-29 is the 60th entry
    assert.deepEqual(
      [annualBits(annual("02-29", "02-29"))[59], count(annualBits(annual("02-29", "02-29")))],
      [1, 1],
    );
    assert.equal(annualBits(annual("12-31", "12-31"))[365], 1);
  });
  test("a range that wraps over the year end", () => {
    const bits = annualBits(annual("12-29", "01-03"));
    assert.equal(count(bits), 6);
    assert.deepEqual([bits[0], bits[2], bits[3], bits[362], bits[363]], [1, 1, 0, 0, 1]);
  });
});

describe("isSubset", () => {
  const bits = (...v: number[]) => Uint8Array.from(v);
  test("true when every index set in a is set in b", () => {
    assert.equal(isSubset(bits(0, 1, 0), bits(1, 1, 0)), true);
    assert.equal(isSubset(bits(1, 1, 0), bits(1, 1, 0)), true);
    assert.equal(isSubset(bits(0, 0, 0), bits(0, 0, 0)), true);
  });
  test("false when an index is set only in a", () => {
    assert.equal(isSubset(bits(1, 1, 0), bits(0, 1, 0)), false);
    assert.equal(isSubset(bits(0, 0, 1), bits(1, 1, 0)), false);
  });
});

describe("periodsOverlap", () => {
  const period = (effectiveFrom: number | null, effectiveTo: number | null) => ({
    effectiveFrom,
    effectiveTo,
  });
  test("true when the periods share a day, an end included", () => {
    assert.equal(periodsOverlap(period(1, 5), period(5, 9)), true);
    assert.equal(periodsOverlap(period(5, 9), period(1, 5)), true);
    assert.equal(periodsOverlap(period(1, 9), period(3, 4)), true);
  });
  test("false when they do not", () => {
    assert.equal(periodsOverlap(period(1, 4), period(5, 9)), false);
    assert.equal(periodsOverlap(period(5, 9), period(1, 4)), false);
  });
  test("an open end extends without limit", () => {
    assert.equal(periodsOverlap(period(null, null), period(5, 9)), true);
    assert.equal(periodsOverlap(period(null, 4), period(5, null)), false);
    assert.equal(periodsOverlap(period(null, 5), period(5, null)), true);
    assert.equal(periodsOverlap(period(6, null), period(null, 5)), false);
    assert.equal(periodsOverlap(period(null, 1), period(null, 9)), true);
  });
});

describe("periodCovers", () => {
  const period = (effectiveFrom: number | null, effectiveTo: number | null) => ({
    effectiveFrom,
    effectiveTo,
  });
  test("true when the earlier period contains the later one", () => {
    assert.equal(periodCovers(period(1, 9), period(1, 9)), true);
    assert.equal(periodCovers(period(1, 9), period(3, 4)), true);
    assert.equal(periodCovers(period(2, 9), period(1, 9)), false);
    assert.equal(periodCovers(period(1, 8), period(1, 9)), false);
  });
  test("an open end of the earlier covers anything", () => {
    assert.equal(periodCovers(period(null, null), period(1, 9)), true);
    assert.equal(periodCovers(period(null, null), period(null, null)), true);
    assert.equal(periodCovers(period(null, 9), period(1, 9)), true);
    assert.equal(periodCovers(period(1, null), period(1, 9)), true);
  });
  test("an open end of the later is covered only by an open end", () => {
    assert.equal(periodCovers(period(1, 9), period(null, 9)), false);
    assert.equal(periodCovers(period(1, 9), period(1, null)), false);
    assert.equal(periodCovers(period(null, 9), period(null, 9)), true);
    assert.equal(periodCovers(period(1, null), period(2, null)), true);
  });
});

describe("intervalCovers", () => {
  const weekly = rule({ weekday: 3 });
  const every2 = rule({ weekday: 3, interval: 2, anchor: "2026-11-25" });
  test("true when the earlier rule has no interval", () => {
    assert.equal(intervalCovers(weekly, every2), true);
    assert.equal(intervalCovers(weekly, weekly), true);
  });
  test("false when only the earlier rule has one", () => {
    assert.equal(intervalCovers(every2, weekly), false);
  });
  test("true when the later interval is a multiple and the anchors differ by a multiple of 7 x the earlier interval", () => {
    const every4 = rule({ weekday: 3, interval: 4, anchor: "2026-12-09" });
    const every4Off = rule({ weekday: 3, interval: 4, anchor: "2026-12-02" });
    const every3 = rule({ weekday: 3, interval: 3, anchor: "2026-11-25" });
    assert.equal(intervalCovers(every2, every4), true);
    assert.equal(intervalCovers(every2, every4Off), false);
    assert.equal(intervalCovers(every2, every3), false);
    assert.equal(intervalCovers(every4, every2), false);
    assert.equal(
      intervalCovers(every2, rule({ weekday: 3, interval: 2, anchor: "2026-10-28" })),
      true,
    );
  });
});

describe("cycleCovers", () => {
  const cycle = (length: number, anchor: string, positions: number[]) =>
    rule({ cycle: length, anchor, positions });
  test("true when the later cycle is a multiple and every position of the later falls on a position of the earlier", () => {
    const earlier = cycle(4, "2026-11-23", [1, 3]);
    assert.equal(cycleCovers(earlier, cycle(4, "2026-11-23", [1])), true);
    assert.equal(cycleCovers(earlier, cycle(8, "2026-11-23", [1, 3, 5, 7])), true);
    // Another anchor: position 1 from the 25th is position 3 from the 23rd, also before the earlier anchor
    assert.equal(cycleCovers(earlier, cycle(4, "2026-11-25", [1, 3])), true);
    assert.equal(cycleCovers(earlier, cycle(4, "2026-11-21", [1, 3])), true);
  });
  test("false when a position of the later is not a position of the earlier", () => {
    const earlier = cycle(4, "2026-11-23", [1, 3]);
    assert.equal(cycleCovers(earlier, cycle(4, "2026-11-23", [1, 2])), false);
    assert.equal(cycleCovers(earlier, cycle(4, "2026-11-24", [1])), false);
    assert.equal(cycleCovers(earlier, cycle(8, "2026-11-23", [1, 2])), false);
  });
  test("false when the later cycle is not a multiple of the earlier", () => {
    assert.equal(cycleCovers(cycle(4, "2026-11-23", [1, 3]), cycle(6, "2026-11-23", [1])), false);
    assert.equal(cycleCovers(cycle(4, "2026-11-23", [1, 3]), cycle(2, "2026-11-23", [1])), false);
  });
});

describe("canCover", () => {
  const policy = (holidayOverlapPolicy: string) => rule({ weekday: 3, holidayOverlapPolicy });
  const table = (later: string) =>
    ["over-holiday", "under-holiday", "after-holiday"].map((earlier) =>
      canCover(policy(earlier), policy(later)),
    );
  test("over-holiday is covered only by over-holiday", () => {
    assert.deepEqual(table("over-holiday"), [true, false, false]);
  });
  test("under-holiday is covered by over-holiday and under-holiday", () => {
    assert.deepEqual(table("under-holiday"), [true, true, false]);
  });
  test("after-holiday is covered only by after-holiday", () => {
    assert.deepEqual(table("after-holiday"), [false, false, true]);
  });
});

describe("sameValue", () => {
  test("true when Object.is holds", () => {
    const object = new Date(0);
    for (const v of [1, "a", null, undefined, Number.NaN, object])
      assert.equal(sameValue(v, v), true);
    assert.equal(sameValue(0, -0), false);
    assert.equal(sameValue(1, "1"), false);
    assert.equal(sameValue(null, undefined), false);
  });
  test("arrays of equal length whose elements are the same", () => {
    assert.equal(sameValue([1, [2, { a: 3 }]], [1, [2, { a: 3 }]]), true);
    assert.equal(sameValue([1, 2], [1, 2, 3]), false);
    assert.equal(sameValue([1, 2], [1, 3]), false);
    assert.equal(sameValue([], {}), false);
    assert.equal(sameValue({}, []), false);
  });
  test("plain objects with the same own enumerable keys whose values are the same", () => {
    assert.equal(sameValue({ a: 1, b: { c: [1] } }, { b: { c: [1] }, a: 1 }), true);
    assert.equal(sameValue(Object.create(null), {}), true);
    assert.equal(sameValue({ a: 1 }, { a: 1, b: 2 }), false);
    assert.equal(sameValue({ a: 1, b: 2 }, { a: 1, c: 2 }), false);
    assert.equal(sameValue({ a: 1 }, { a: 2 }), false);
    assert.equal(sameValue({ a: undefined }, { b: undefined }), false);
  });
  test("objects that are not plain are the same only when identical", () => {
    assert.equal(sameValue(new Date(0), new Date(0)), false);
    assert.equal(sameValue(new Map(), new Map()), false);
    assert.equal(sameValue({}, new (class A {})()), false);
    assert.equal(sameValue(new (class A {})(), {}), false);
    assert.equal(sameValue({ a: 1 }, null), false);
    assert.equal(sameValue("a", { a: 1 }), false);
  });
  test("cyclic values are supported", () => {
    const a: Record<string, unknown> = { v: 1 };
    a["self"] = a;
    const b: Record<string, unknown> = { v: 1 };
    b["self"] = b;
    assert.equal(sameValue(a, b), true);
    const c: Record<string, unknown> = { v: 2 };
    c["self"] = c;
    assert.equal(sameValue(a, c), false);
    // The same object compared with two partners
    const shared = { x: [1] };
    assert.equal(sameValue([shared, shared], [{ x: [1] }, { x: [1] }]), true);
    assert.equal(sameValue([shared, shared], [{ x: [1] }, { x: [2] }]), false);
  });
  test("values nested too deeply to compare are not the same", () => {
    const deep = (): unknown[] => {
      let v: unknown[] = [];
      for (let i = 0; i < 200000; i++) v = [v];
      return v;
    };
    assert.equal(sameValue(deep(), deep()), false);
  });
  test("values whose reading throws are not the same", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new TypeError("boom");
        },
      },
    );
    assert.equal(sameValue(hostile, {}), false);
    const getter = {
      get x(): number {
        throw new Error("boom");
      },
    };
    assert.equal(sameValue(getter, { x: 1 }), false);
  });
});

describe("sameValueIn", () => {
  test("the comparison of sameValue with the pairs being compared", () => {
    assert.equal(sameValueIn({ a: [1] }, { a: [1] }, new Map()), true);
    assert.equal(sameValueIn({ a: [1] }, { a: [2] }, new Map()), false);
    assert.equal(sameValueIn(1, 1, new Map()), true);
  });
  test("a pair already in seen counts as the same; a compared pair is added", () => {
    const a = { v: 1 };
    const b = { v: 2 };
    assert.equal(sameValueIn(a, b, new Map([[a, new Set([b])]])), true);
    const seen = new Map<object, Set<object>>();
    const other = { v: 1 };
    assert.equal(sameValueIn(a, other, seen), true);
    assert.deepEqual([...seen.get(a)!], [other]);
    const third = { v: 1 };
    assert.equal(sameValueIn(a, third, seen), true);
    assert.deepEqual([...seen.get(a)!], [other, third]);
  });
  test("a stack overflow is thrown as a RangeError", () => {
    let a: unknown[] = [];
    let b: unknown[] = [];
    for (let i = 0; i < 200000; i++) [a, b] = [[a], [b]];
    assert.throws(() => sameValueIn(a, b, new Map()), RangeError);
  });
});

describe("without", () => {
  const compiled = compiledOf({
    dates: [
      { date: "2026-11-23", value: "D0" },
      { date: "2026-11-24", value: "D1" },
    ],
    annualDates: [
      { date: "12-31", value: "A0" },
      { date: "01-02", value: "A1" },
    ],
    recurringRules: [
      { weekday: 1, value: "R0" },
      { weekday: 2, value: "R1" },
    ],
  });
  const values = (c: CompiledSchedule<unknown, string>) =>
    [c.dates, c.annual, c.recurring].map((list) => list.map((r) => r.value));
  test("a copy without the given date, annual or recurring rule; the options are not changed", () => {
    assert.deepEqual(values(without(compiled, compiled.dates[0]!, false)), [
      ["D1"],
      ["A0", "A1"],
      ["R0", "R1"],
    ]);
    assert.deepEqual(values(without(compiled, compiled.annual[1]!, false)), [
      ["D0", "D1"],
      ["A0"],
      ["R0", "R1"],
    ]);
    assert.deepEqual(values(without(compiled, compiled.recurring[0]!, false)), [
      ["D0", "D1"],
      ["A0", "A1"],
      ["R1"],
    ]);
    assert.deepEqual(values(compiled), [
      ["D0", "D1"],
      ["A0", "A1"],
      ["R0", "R1"],
    ]);
    const copy = without(compiled, compiled.dates[0]!, false);
    assert.notEqual(copy, compiled);
    assert.deepEqual(
      [copy.source, copy.weekly, copy.holiday],
      [compiled.source, compiled.weekly, compiled.holiday],
    );
  });
  test("null drops no rule", () => {
    assert.deepEqual(values(without(compiled, null, false)), values(compiled));
  });
  test("dropDates drops every specific date, with or without a rule", () => {
    assert.deepEqual(values(without(compiled, null, true)), [[], ["A0", "A1"], ["R0", "R1"]]);
    assert.deepEqual(values(without(compiled, compiled.recurring[1]!, true)), [
      [],
      ["A0", "A1"],
      ["R0"],
    ]);
  });
});

describe("providerPath", () => {
  const source = (count: number, providerIndexes?: number[]) =>
    ({
      providers: Array.from({ length: count }, (_, i) => provider(`P${i}`, 2000, 2050)),
      providerIndexes,
    }) as unknown as HolidaySource<string>;
  test("holidayProvider with one provider", () => {
    assert.equal(providerPath(source(1, [0]), 0), "holidayProvider");
    assert.equal(providerPath(source(1), 0), "holidayProvider");
  });
  test("holidayProvider[k] with the index as written in the options", () => {
    assert.equal(providerPath(source(2, [0, 3]), 0), "holidayProvider[0]");
    assert.equal(providerPath(source(2, [0, 3]), 1), "holidayProvider[3]");
  });
  test("the index in providers when the written positions are not known", () => {
    assert.equal(providerPath(source(2), 1), "holidayProvider[1]");
  });
});
