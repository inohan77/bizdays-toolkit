// Unit tests of the functions of src/core/diagnose.ts that decide which days the diagnostics examine. One
// describe per function, named after the function (scripts/check-unit-tests.ts matches the names); each test is
// one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  atEdge,
  dayOfYear,
  DIAGNOSTIC_YEARS,
  gcd,
  inDiagnosticRange,
  isLostShift,
  judgeableSpan,
  lcm,
  matchesAnyDay,
  mergeRanges,
  patternCycle,
  scanWindow,
  scopeNote,
  yearOf,
} from "../../../src/core/diagnose.ts";
import { IssueCollector } from "../../../src/core/errors.ts";
import { compileScheduleOptions, dayNumberOf } from "../../../src/core/schedule.ts";

const FROM = dayNumberOf(`${DIAGNOSTIC_YEARS.from}-01-01`);
const TO = dayNumberOf(`${DIAGNOSTIC_YEARS.to}-12-31`);
const DAYS = TO - FROM + 1;
const YEARS_28 = dayNumberOf("2028-12-31") - dayNumberOf("2001-01-01") + 1;
const NOTE = ` (checked ${DIAGNOSTIC_YEARS.from}-${DIAGNOSTIC_YEARS.to} only)`;
const day = dayNumberOf;

/** A holiday source with providers of the given supported years */
const source = (policy: "throw" | "ignore", ...years: [number, number][]) =>
  ({
    providers: years.map(([from, to]) => ({ supportedYears: { from, to } })),
    outOfRangePolicy: policy,
  }) as never;
/** The compiled first recurring rule of schedule options */
const rule = (r: Record<string, unknown>) =>
  compileScheduleOptions<unknown, string>(new IssueCollector(), {
    timeZone: "UTC",
    recurringRules: [{ ...r, value: "x" }],
  } as never)!.recurring[0]!;
/** A period for scanWindow */
const period = (from: string | null, to: string | null) => ({
  path: "p",
  effectiveFrom: from === null ? null : day(from),
  effectiveTo: to === null ? null : day(to),
});
const years = (ranges: readonly { from: number; to: number }[]) =>
  ranges.map((r) => `${yearOf(r.from)}-${yearOf(r.to)}`);

describe("gcd", () => {
  test("the greatest common divisor; gcd(a, 0) is a", () => {
    assert.equal(gcd(12, 18), 6);
    assert.equal(gcd(7, 13), 1);
    assert.equal(gcd(5, 0), 5);
  });
});

describe("lcm", () => {
  test("the least common multiple", () => {
    assert.equal(lcm(4, 6), 12);
    assert.equal(lcm(7, 13), 91);
    assert.equal(lcm(8, 8), 8);
  });
});

describe("dayOfYear", () => {
  test("January 1 or December 31 of the year, also for a year below 1000 digits", () => {
    assert.equal(dayOfYear(2026, false), day("2026-01-01"));
    assert.equal(dayOfYear(2026, true), day("2026-12-31"));
    assert.equal(dayOfYear(1000, false), day("1000-01-01"));
    assert.equal(dayOfYear(2024, true) - dayOfYear(2024, false), 365);
  });
});

describe("yearOf", () => {
  test("the year of a day number", () => {
    assert.equal(yearOf(day("1999-12-31")), 1999);
    assert.equal(yearOf(day("2000-01-01")), 2000);
  });
});

describe("mergeRanges", () => {
  test("sorts, and merges overlapping and adjacent ranges", () => {
    assert.deepEqual(
      mergeRanges([
        { from: 10, to: 12 },
        { from: 1, to: 3 },
        { from: 4, to: 5 },
        { from: 11, to: 20 },
      ]),
      [
        { from: 1, to: 5 },
        { from: 10, to: 20 },
      ],
    );
  });
  test("keeps ranges with a gap apart, and returns [] for []", () => {
    assert.deepEqual(
      mergeRanges([
        { from: 1, to: 3 },
        { from: 5, to: 6 },
      ]),
      [
        { from: 1, to: 3 },
        { from: 5, to: 6 },
      ],
    );
    assert.deepEqual(mergeRanges([]), []);
  });
});

describe("inDiagnosticRange", () => {
  test("a period inside the range is returned unchanged", () => {
    assert.deepEqual(inDiagnosticRange(day("2026-01-01"), day("2026-12-31")), {
      from: day("2026-01-01"),
      to: day("2026-12-31"),
    });
  });
  test("null means no start or no end: the range's own end is used", () => {
    assert.deepEqual(inDiagnosticRange(null, null), { from: FROM, to: TO });
    assert.deepEqual(inDiagnosticRange(day("2090-01-01"), null), {
      from: day("2090-01-01"),
      to: TO,
    });
    assert.deepEqual(inDiagnosticRange(null, day("1960-12-31")), {
      from: FROM,
      to: day("1960-12-31"),
    });
  });
  test("a period that crosses an end of the range is clipped", () => {
    assert.deepEqual(inDiagnosticRange(FROM - 100, FROM + 5), { from: FROM, to: FROM + 5 });
    assert.deepEqual(inDiagnosticRange(TO - 5, TO + 100), { from: TO - 5, to: TO });
  });
  test("the first and the last day of the range are in it; the days next to them are not", () => {
    assert.deepEqual(inDiagnosticRange(FROM - 9, FROM), { from: FROM, to: FROM });
    assert.deepEqual(inDiagnosticRange(TO, TO + 9), { from: TO, to: TO });
    assert.equal(inDiagnosticRange(FROM - 9, FROM - 1), undefined);
    assert.equal(inDiagnosticRange(TO + 1, TO + 9), undefined);
    assert.equal(inDiagnosticRange(null, FROM - 1), undefined);
    assert.equal(inDiagnosticRange(TO + 1, null), undefined);
  });
});

describe("scopeNote", () => {
  test("a specific date (no cycle) with a day outside the range gets the note", () => {
    assert.equal(scopeNote(FROM - 1, FROM + 10), NOTE);
    assert.equal(scopeNote(TO - 10, TO + 1), NOTE);
  });
  test("a period inside the range gets no note", () => {
    assert.equal(scopeNote(FROM, TO), "");
    assert.equal(scopeNote(day("2026-01-01"), day("2026-01-01"), 7), "");
  });
  test("an open or outside-reaching period whose part in the range holds a whole cycle gets no note", () => {
    assert.equal(scopeNote(null, null, YEARS_28), "");
    assert.equal(scopeNote(TO - YEARS_28 + 1, null, YEARS_28), "");
    assert.equal(scopeNote(null, FROM + YEARS_28 - 1, YEARS_28), "");
  });
  test("one day less than a whole cycle in the range gets the note", () => {
    assert.equal(scopeNote(TO - YEARS_28 + 2, null, YEARS_28), NOTE);
    assert.equal(scopeNote(null, FROM + YEARS_28 - 2, YEARS_28), NOTE);
  });
  test("a cycle capped at the length of the range gets the note even though the whole range was examined", () => {
    assert.equal(scopeNote(null, null, DAYS), NOTE);
  });
});

describe("isLostShift", () => {
  test("true only for a value whose code is holiday-run-too-long", () => {
    assert.equal(isLostShift({ code: "holiday-run-too-long" }), true);
    assert.equal(isLostShift({ code: "out-of-range" }), false);
    assert.equal(isLostShift(new Error("x")), false);
    assert.equal(isLostShift(null), false);
    assert.equal(isLostShift(undefined), false);
    assert.equal(isLostShift("holiday-run-too-long"), false);
  });
});

describe("atEdge", () => {
  const window = {
    ranges: [
      { from: 1000, to: 3000 },
      { from: 5000, to: 9000 },
    ],
    label: "",
  };
  const error = { code: "out-of-range" };
  test("true within 367 days of the first or the last day of the window", () => {
    assert.equal(atEdge(1000, error, window), true);
    assert.equal(atEdge(1366, error, window), true);
    assert.equal(atEdge(8634, error, window), true);
    assert.equal(atEdge(9000, error, window), true);
  });
  test("false one day further inside, also at the inner ends of the ranges", () => {
    assert.equal(atEdge(1367, error, window), false);
    assert.equal(atEdge(8633, error, window), false);
    assert.equal(atEdge(3000, error, window), false);
    assert.equal(atEdge(5000, error, window), false);
  });
  test("false for another error code and without a window", () => {
    assert.equal(atEdge(1000, { code: "holiday-run-too-long" }, window), false);
    assert.equal(atEdge(1000, null, window), false);
    assert.equal(atEdge(1000, error, undefined), false);
  });
});

describe("patternCycle", () => {
  const r = (interval: number | null, cycle: number | null) => ({ interval, cycle }) as never;
  test("28 years without rules and for rules without interval and cycle", () => {
    assert.equal(patternCycle([]), YEARS_28);
    assert.equal(patternCycle([r(null, null)]), YEARS_28);
  });
  test("an every-k-weeks rule: the least common multiple of 28 years and 7k days", () => {
    assert.equal(patternCycle([r(2, null)]), 2 * YEARS_28);
    assert.equal(patternCycle([r(3, null)]), YEARS_28);
  });
  test("several rules: the least common multiple of all cycles", () => {
    assert.equal(patternCycle([r(2, null), r(4, null)]), 4 * YEARS_28);
  });
  test("an n-day cycle rule: the least common multiple of 28 years and n days", () => {
    assert.equal(patternCycle([r(null, 5)]), 5 * YEARS_28);
    assert.equal(patternCycle([r(null, 7)]), YEARS_28);
  });
  test("capped at the number of days of the diagnostic range", () => {
    assert.ok(5 * YEARS_28 < DAYS && 6 * YEARS_28 > DAYS);
    assert.equal(patternCycle([r(null, 324)]), DAYS);
    assert.equal(patternCycle([r(2, null), r(null, 5)]), DAYS);
  });
});

describe("judgeableSpan", () => {
  test("the whole diagnostic range without providers and with outOfRangePolicy ignore", () => {
    assert.deepEqual(judgeableSpan(source("throw")), { from: FROM, to: TO });
    assert.deepEqual(judgeableSpan(source("ignore", [2020, 2027])), { from: FROM, to: TO });
  });
  test("throw: the years all providers support", () => {
    assert.deepEqual(judgeableSpan(source("throw", [2000, 2050], [2020, 2099])), {
      from: day("2020-01-01"),
      to: day("2050-12-31"),
    });
  });
  test("throw: supported years reaching outside the range are clipped to it", () => {
    assert.deepEqual(judgeableSpan(source("throw", [1800, 2400])), { from: FROM, to: TO });
    assert.deepEqual(judgeableSpan(source("throw", [1900, 1960])), {
      from: FROM,
      to: day("1960-12-31"),
    });
  });
  test("throw: from > to when the providers share no year, or none in the range", () => {
    const apart = judgeableSpan(source("throw", [2000, 2010], [2020, 2030]));
    assert.ok(apart.from > apart.to);
    const before = judgeableSpan(source("throw", [1800, 1954]));
    assert.ok(before.from > before.to);
    const after = judgeableSpan(source("throw", [2100, 2200]));
    assert.ok(after.from > after.to);
  });
});

describe("scanWindow", () => {
  test("without providers: one cycle from 2001-01-01", () => {
    const w = scanWindow(source("throw"), [], YEARS_28)!;
    assert.deepEqual(w.ranges, [{ from: day("2001-01-01"), to: day("2028-12-31") }]);
    assert.equal(w.label, "2001-2028");
  });
  test("without providers: the whole range when the cycle does not fit after 2001", () => {
    const fits = day("2099-12-31") - day("2001-01-01") + 1;
    assert.deepEqual(years(scanWindow(source("throw"), [], fits)!.ranges), ["2001-2099"]);
    assert.deepEqual(scanWindow(source("throw"), [], fits + 1)!.ranges, [{ from: FROM, to: TO }]);
  });
  test("full: the whole span and nothing else", () => {
    assert.deepEqual(
      scanWindow(source("throw"), [period("2030-01-01", null)], YEARS_28, undefined, true)!.ranges,
      [{ from: FROM, to: TO }],
    );
    assert.deepEqual(
      years(scanWindow(source("throw", [2020, 2027]), [], YEARS_28, undefined, true)!.ranges),
      ["2020-2027"],
    );
  });
  test("throw with providers: the supported years; the label has the same years", () => {
    const w = scanWindow(source("throw", [2020, 2027]), [], YEARS_28)!;
    assert.deepEqual(w.ranges, [{ from: day("2020-01-01"), to: day("2027-12-31") }]);
    assert.equal(w.label, "2020-2027");
  });
  test("throw with providers that share no year in the range: undefined", () => {
    assert.equal(scanWindow(source("throw", [2000, 2010], [2020, 2030]), [], YEARS_28), undefined);
    assert.equal(scanWindow(source("throw", [2100, 2200]), [], YEARS_28), undefined);
  });
  test("ignore: the supported years and one cycle before and after them", () => {
    const w = scanWindow(source("ignore", [2020, 2027]), [], YEARS_28)!;
    assert.deepEqual(w.ranges, [
      { from: day("2020-01-01") - YEARS_28, to: day("2027-12-31") + YEARS_28 },
    ]);
  });
  test("ignore with supported years outside the range: the cycle starts at the nearer end of the range", () => {
    const before = scanWindow(source("ignore", [1800, 1900]), [], YEARS_28)!;
    assert.deepEqual(before.ranges, [{ from: FROM, to: FROM + YEARS_28 - 1 }]);
    const after = scanWindow(source("ignore", [2200, 2300]), [], YEARS_28)!;
    assert.deepEqual(after.ranges, [{ from: TO - YEARS_28 + 1, to: TO }]);
  });
  test("a rule's effective period is examined in full, with one cycle on each side of both ends", () => {
    const w = scanWindow(source("throw"), [period("2040-01-01", "2040-12-31")], YEARS_28)!;
    assert.deepEqual(w.ranges, [{ from: day("2001-01-01"), to: day("2040-12-31") + YEARS_28 }]);
    const far = scanWindow(source("throw"), [period("2090-01-01", "2090-12-31")], YEARS_28)!;
    assert.deepEqual(far.ranges, [
      { from: day("2001-01-01"), to: day("2028-12-31") },
      { from: day("2090-01-01") - YEARS_28, to: TO },
    ]);
  });
  test("an effective period outside the range: one cycle from the nearer end of the range", () => {
    const w = scanWindow(source("throw"), [period("1940-01-01", "1945-12-31")], YEARS_28)!;
    assert.deepEqual(w.ranges, [
      { from: FROM, to: FROM + YEARS_28 - 1 },
      { from: day("2001-01-01"), to: day("2028-12-31") },
    ]);
  });
  test("a rule without an effective period adds nothing", () => {
    assert.deepEqual(
      scanWindow(source("throw"), [period(null, null)], YEARS_28)!.ranges,
      scanWindow(source("throw"), [], YEARS_28)!.ranges,
    );
  });
  test("inside: one cycle on each side of every edge, and every span in full", () => {
    const inside = {
      edges: [day("2060-06-01")],
      spans: [{ from: day("1960-01-01"), to: day("1961-12-31") }],
      rules: [],
    };
    const w = scanWindow(source("throw"), [], 366, inside)!;
    assert.deepEqual(w.ranges, [
      { from: day("1960-01-01"), to: day("1961-12-31") },
      { from: day("2001-01-01"), to: day("2001-01-01") + 365 },
      { from: day("2060-06-01") - 366, to: day("2060-06-01") + 365 },
    ]);
  });
  test("throw with providers: nothing outside the span is returned, whatever the rules say", () => {
    const w = scanWindow(
      source("throw", [2020, 2027]),
      [period("1990-01-01", "2050-12-31")],
      YEARS_28,
    )!;
    assert.deepEqual(w.ranges, [{ from: day("2020-01-01"), to: day("2027-12-31") }]);
  });
  test("the ranges are sorted, disjoint and not adjacent", () => {
    const w = scanWindow(
      source("ignore", [2020, 2027]),
      [period("1960-01-01", "1960-12-31"), period("2095-01-01", null)],
      366,
    )!;
    for (let i = 1; i < w.ranges.length; i++)
      assert.ok(w.ranges[i]!.from > w.ranges[i - 1]!.to + 1);
    assert.ok(w.ranges.length > 1);
    assert.ok(w.ranges[0]!.from >= FROM && w.ranges[w.ranges.length - 1]!.to <= TO);
  });
});

describe("matchesAnyDay", () => {
  // The fifth Monday of February exists only in leap years in which February 29 is a Monday (1960, 1988, 2016,
  // 2044, 2072; the next is 2112)
  const fifthMonday = (r: Record<string, unknown>) =>
    rule({ weekday: 1, nth: [5], months: [2], ...r });
  test("no effective period: found within one cycle from 2001", () => {
    assert.equal(matchesAnyDay(fifthMonday({}), YEARS_28), true);
  });
  test("a start only: the first cycle from the start, clipped to the range", () => {
    assert.equal(matchesAnyDay(fifthMonday({ effectiveFrom: "2045-01-01" }), YEARS_28), true);
    assert.equal(matchesAnyDay(fifthMonday({ effectiveFrom: "2073-01-01" }), YEARS_28), false);
  });
  test("an end only: the last cycle up to the end, clipped to the range", () => {
    assert.equal(matchesAnyDay(fifthMonday({ effectiveTo: "1960-12-31" }), YEARS_28), true);
    assert.equal(matchesAnyDay(fifthMonday({ effectiveTo: "1959-12-31" }), YEARS_28), false);
  });
  test("both ends: only the days of the period count", () => {
    assert.equal(
      matchesAnyDay(
        fifthMonday({ effectiveFrom: "2016-02-29", effectiveTo: "2016-02-29" }),
        YEARS_28,
      ),
      true,
    );
    assert.equal(
      matchesAnyDay(
        fifthMonday({ effectiveFrom: "2016-03-01", effectiveTo: "2043-12-31" }),
        YEARS_28,
      ),
      false,
    );
  });
  test("a period reaching outside the range is examined inside the range only", () => {
    assert.equal(
      matchesAnyDay(
        fifthMonday({ effectiveFrom: "1900-01-01", effectiveTo: "1959-12-31" }),
        YEARS_28,
      ),
      false,
    );
    assert.equal(
      matchesAnyDay(
        fifthMonday({ effectiveFrom: "1900-01-01", effectiveTo: "1960-12-31" }),
        YEARS_28,
      ),
      true,
    );
  });
});
