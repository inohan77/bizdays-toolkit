/**
 * Diagnostics of rules (diagnoseCalendar, diagnoseSchedule).
 *
 * The same validation as at creation (IssueCollector) collects errors and unknown keys; without errors the
 * relations between the rules are examined. Problems found are returned as an array.
 *
 * There are three severities: error (a mistake that throws in createCalendar / createSchedule; the code equals
 * the error's code), warning (can be created, but probably not what was meant) and info (a notice). The list of
 * codes and severities is the table of diagnostics in the guide ("Option diagnostics" in docs/guide.md); the
 * sequential removal of `redundant` and relatedPath: decisions.md #31
 *
 * The diagnostics always evaluate unconfirmed holidays (unconfirmedHolidayPolicy) as "accept". They examine the
 * shape of the options, for which it does not matter whether a holiday is confirmed, and evaluating with
 * "throw" would swallow the error and wrongly conclude "does not match"
 *
 * The order of the judgement is fixed (decisions.md #11), so `shadowed` is examined only among rules of the
 * same kind. A rule unused across kinds is found as `redundant` (removing it changes no result).
 * For rules with an effective period (effectiveFrom, effectiveTo) the containment of the periods, and for rules
 * with a cycle (interval, cycle) the containment of the cycles, are conditions of `shadowed` too. The scan of
 * `redundant` is widened to the length in which the cycles align and to effective periods outside the range
 */

import {
  formatDate,
  lengthOfMonth,
  isValidDate,
  parseDate,
  weekdayOf,
  type DateString,
} from "./date.ts";
import { compileCalendarOptions, type CalendarOptions } from "./calendar.ts";
import {
  internalError,
  InternalError,
  describeValue,
  IssueCollector,
  rangeError,
  type KnownErrorCode,
} from "./errors.ts";
import { isOptionsObject } from "./options.ts";
import { RENAMED_KEYS, RENAMED_VALUES } from "./renamed.ts";
import {
  compileScheduleOptions,
  createBasis,
  createHolidayLookup,
  createResolver,
  lostShiftMessage,
  throwLostShift,
  inPeriod,
  MAX_HOLIDAY_RUN,
  jpUsage,
  matchMonthDay,
  matchPattern,
  partsOf,
  type AnnualRule,
  type BasisOfMonth,
  type CompiledPeriod,
  type CompiledSchedule,
  type DateRule,
  type DecidingRule,
  type HolidaySource,
  type RecurringRuleCompiled,
  type ScheduleOptions,
  isHolidayBasedRule,
  resultIgnoresHolidays,
  dateOfDayNumber,
  dayNumberOf,
} from "./schedule.ts";
import type { Holiday } from "./types.ts";

// ------------------------------------------------------------
// Public types
// ------------------------------------------------------------

/**
 * Severity of a diagnostic.
 * - "error": a mistake that throws at creation
 * - "warning": can be created, but probably not what was meant
 * - "info": does not affect results, but can be tidied up
 *
 * An output enumeration, but a closed type because no severity will be added (docs/decisions.md #2).
 * @public
 */
export type DiagnosticSeverity = "error" | "warning" | "info";

/**
 * Known diagnostic codes (more may be added). The code of an error equals the error code (KnownErrorCode).
 * @public
 */
export type KnownDiagnosticCode =
  | KnownErrorCode
  /** An unknown key (ignored at creation) */
  | "unknown-option"
  /**
   * A key or value under its old name renamed in 0.30.0 (treated as the new name; the handling in 1.0.0 is in
   * the migration guide's section on the API to be removed in 1.0.0)
   */
  | "deprecated-option"
  /** Completely covered by an earlier rule of the same kind and never used */
  | "shadowed"
  /** A recurring rule that matches no day */
  | "never-matches"
  /** Removing it changes no result */
  | "redundant"
  /** A rule or date that ended before the reference date (asOf) (a candidate for tidying up) */
  | "expired"
  /**
   * A weekday rule of the same options is not part of the counting basis of an nth-business-day rule (that
   * weekday is counted as a business day)
   */
  | "counting-basis";

/**
 * Diagnostic code. Later versions may add values, so handle "anything else" when branching.
 * @public
 */
export type DiagnosticCode = KnownDiagnosticCode | (string & {});

/**
 * One diagnostic. `message` is in English and its wording is not part of the API (use `code` to branch).
 * @public
 */
export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: DiagnosticCode;
  /** Position in the options (e.g. "closedRecurringRules[1]", "closedDates[0].date"); "" for the whole options */
  readonly path: string;
  readonly message: string;
  /**
   * Another related position. For shadowed, the earlier rule that covers it; for redundant, the rule that
   * decides instead after the removal (only when there is exactly one); for counting-basis, the weekday rule
   * that is not counted; for out-of-range, the holiday provider
   */
  readonly relatedPath?: string;
}

// ------------------------------------------------------------
// Suggestions for unknown keys
// ------------------------------------------------------------

/**
 * Edit distance between two strings, counting an insertion, a deletion, a substitution and a swap of two
 * adjacent characters as 1 each (optimal string alignment).
 * @param a - First string.
 * @param b - Second string.
 * @returns The distance (0 when the strings are equal).
 * @internal
 */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Suggestion for an unknown option key.
 * Works like {@link closestOf}, but also matches keys renamed in 0.30.0: a typo close to an old name suggests
 * the new name.
 * @param key - The unknown key as written.
 * @param known - Keys that are valid at that position.
 * @returns The suggested key, or undefined when nothing is close enough.
 * @internal
 */
export function closestKey(key: string, known: readonly string[]): string | undefined {
  // A typo close to an old name (renamed in 0.30.0) suggests the new name of that old name
  const renamed = RENAMED_KEYS.filter((r) => known.includes(r.to));
  const found = closestOf(key, [...known, ...renamed.map((r) => r.from)]);
  return renamed.find((r) => r.from === found && !known.includes(found))?.to ?? found;
}

/**
 * Closest entry of `known` to `key`. Tried in this order: (1) equal ignoring case; (2) `key` has 4 or more
 * characters and is a case-insensitive prefix of an entry; (3) the entry with the smallest edit distance, if
 * that distance is at most max(1, floor(key.length / 4)). Ties keep the first entry.
 * @param key - The string to look up.
 * @param known - Candidates.
 * @returns The closest candidate, or undefined.
 * @internal
 */
export function closestOf(key: string, known: readonly string[]): string | undefined {
  const lower = key.toLowerCase();
  const sameCase = known.find((k) => k.toLowerCase() === lower);
  if (sameCase !== undefined) return sameCase;
  // A prefix of a known key takes priority over the edit distance to another short key
  if (key.length >= 4) {
    const prefixOf = known.find((k) => k.toLowerCase().startsWith(lower));
    if (prefixOf !== undefined) return prefixOf;
  }
  const limit = Math.max(1, Math.floor(key.length / 4));
  let best: string | undefined;
  let bestDistance = limit + 1;
  for (const k of known) {
    const distance = editDistance(lower, k.toLowerCase());
    if (distance < bestDistance) {
      best = k;
      bestDistance = distance;
    }
  }
  return best;
}

// ------------------------------------------------------------
// The period examined
// ------------------------------------------------------------

/**
 * The diagnostic range: the years whose days the rule diagnostics examine. Every statement of the rule
 * diagnostics is about days of these years, and no day outside them is examined. This is the only place where
 * the years are written; messages, tests and the check of the documents read them from here.
 * The years are the supported years of the Japanese provider. They contain no year divisible by 100 but not by
 * 400 (1900, 2100, ...), so a recurring pattern repeats every 28 years everywhere in the range, and they are
 * far from the ends of the calendar range (years 1000 and 9999).
 * @internal
 * @see decisions.md #31
 */
export const DIAGNOSTIC_YEARS = Object.freeze({ from: 1955, to: 2099 });
/**
 * {@link DIAGNOSTIC_YEARS} as written in messages.
 * @internal
 */
export const DIAGNOSTIC_YEARS_LABEL = `${DIAGNOSTIC_YEARS.from}-${DIAGNOSTIC_YEARS.to}`;
/** Day numbers of the first and the last day of the diagnostic range */
const RANGE_FROM = dayNumberOf(`${DIAGNOSTIC_YEARS.from}-01-01`);
const RANGE_TO = dayNumberOf(`${DIAGNOSTIC_YEARS.to}-12-31`);
const RANGE_DAYS = RANGE_TO - RANGE_FROM + 1;

/**
 * How recurring rules match is decided by the 14 kinds of year (weekday of January 1 × leap year or not) and
 * repeats every 28 years in the diagnostic range. For rules with a cycle (interval, cycle), 28 years (10,227
 * days) need not be a multiple of the cycle, so the cycle is computed separately (patternCycle)
 */
const PATTERN_FROM = dayNumberOf("2001-01-01");
const PATTERN_DAYS = dayNumberOf("2028-12-31") - PATTERN_FROM + 1;

/**
 * The part of a period of days that lies in the diagnostic range.
 * @param from - First day number, or null for no start.
 * @param to - Last day number, or null for no end.
 * @returns The clipped range, or undefined when the period has no day in the diagnostic range.
 * @internal
 */
export function inDiagnosticRange(from: number | null, to: number | null): Range | undefined {
  const a = Math.max(from ?? RANGE_FROM, RANGE_FROM);
  const b = Math.min(to ?? RANGE_TO, RANGE_TO);
  return a <= b ? { from: a, to: b } : undefined;
}

/**
 * A note for a message whose statement was decided from the days of the diagnostic range alone and may differ
 * on the days of the same rule or date outside the range.
 * @param from - First day number of the rule's effective period or of the date, or null for no start.
 * @param to - Last day number, or null for no end.
 * @param cycle - Pattern cycle in days; omit for a specific date.
 * @returns " (checked 1955-2099 only)" (with the years of {@link DIAGNOSTIC_YEARS}) when the period has a day
 *   outside the range and its part inside the range is shorter than one cycle or the cycle is capped; otherwise
 *   "" (a whole cycle was examined, so the days outside repeat it).
 * @internal
 */
export function scopeNote(from: number | null, to: number | null, cycle = Infinity): string {
  const inside = inDiagnosticRange(from, to);
  const beyond = (from ?? -Infinity) < RANGE_FROM || (to ?? Infinity) > RANGE_TO;
  const whole = inside && inside.to - inside.from + 1 >= cycle && cycle < RANGE_DAYS;
  return beyond && !whole ? ` (checked ${DIAGNOSTIC_YEARS_LABEL} only)` : "";
}

/**
 * Whether `error` is the `holiday-run-too-long` RangeError (an "after-holiday" day that cannot be moved).
 * The scans treat a day that throws it as a day that cannot be judged.
 * @param error - A caught value.
 * @returns true for that error code.
 * @internal
 * @see decisions.md #17
 */
export const isLostShift = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === "holiday-run-too-long";

/**
 * Number of days by which the days a rule looks at can leave a provider's supported years (counted from the end
 * of the scan range). The detection of a move out of reach goes back farthest (367 days, as
 * MAX_HOLIDAY_RUN_SCAN in schedule.ts: when holidays last from the first supported day, the judgement of the day
 * after the run looks beyond the start of the run, outside the supported years). Day-before / day-after rules,
 * original days of moves and nth business days of a week stay nearer
 */
const PROVIDER_EDGE_DAYS = 367;
/**
 * Whether `error` is an `out-of-range` error that is expected on day `n` because a rule looked at a day
 * outside the days that can be judged: `n` lies within PROVIDER_EDGE_DAYS days of the first or the last day of
 * `window` (with outOfRangePolicy "throw" the window starts and ends at the supported years, or at the
 * diagnostic range when the supported years reach beyond it).
 * @param n - Day number of the evaluated day.
 * @param error - A caught value.
 * @param window - The scanned window, or undefined when there is none.
 * @returns true when the day counts as "cannot be judged"; false means the caller must rethrow.
 * @internal
 * @see decisions.md #17
 */
export const atEdge = (n: number, error: unknown, window: Window | undefined): boolean => {
  if ((error as { code?: unknown } | null)?.code !== "out-of-range" || !window) return false;
  const first = window.ranges[0]!.from;
  const last = window.ranges[window.ranges.length - 1]!.to;
  return n < first + PROVIDER_EDGE_DAYS || n > last - PROVIDER_EDGE_DAYS;
};

/**
 * Greatest common divisor of two non-negative integers.
 * @internal
 */
export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
/**
 * Least common multiple of two positive integers.
 * @internal
 */
export const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/**
 * Number of days after which the match pattern of all `rules` repeats, ignoring effective periods and holidays.
 * The base is 28 years (10,227 days); an every-k-weeks rule adds 7k days and an n-day cycle rule adds n days
 * to the least common multiple.
 * @param rules - Recurring rules.
 * @returns The cycle in days, capped at the number of days of the diagnostic range (a cycle of that length
 *   means "the whole range").
 * @internal
 */
export function patternCycle(rules: readonly RecurringRuleCompiled<unknown>[]): number {
  let days = 7;
  for (const rule of rules) {
    if (rule.interval !== null) days = Math.min(lcm(days, 7 * rule.interval), RANGE_DAYS);
    if (rule.cycle !== null) days = Math.min(lcm(days, rule.cycle), RANGE_DAYS);
  }
  return Math.min(lcm(PATTERN_DAYS, days), RANGE_DAYS);
}

interface Range {
  readonly from: number;
  readonly to: number;
}

interface Window {
  readonly ranges: readonly Range[];
  readonly label: string;
}

/** @internal Inputs inside a basis calendar that make the result differ by year (decisions.md #31) */
export interface BasisInside {
  /**
   * Boundary days (a different section starts on the day): both ends of effective periods, of specific dates
   * and of providers' supported years
   */
  readonly edges: number[];
  /** Periods examined in full: providers' supported years (holidays differ by year) */
  readonly spans: Range[];
  /** Recurring rules (to compute the length in which the rules with a cycle align) */
  readonly rules: RecurringRuleCompiled<unknown>[];
}

/**
 * Day number of January 1 (or December 31) of a year.
 * @param year - Year, 1000-9999.
 * @param last - true for December 31, false for January 1.
 * @returns The day number.
 * @internal
 */
export const dayOfYear = (year: number, last: boolean): number =>
  dayNumberOf(`${String(year).padStart(4, "0")}-${last ? "12-31" : "01-01"}`);

/**
 * Collects, from a counting-basis calendar, the inputs that make its results differ between years.
 * Follows nested calendars (parts of a combined calendar, and the basis of rules inside a basis).
 * @param calendar - A calendar object used as `calendar` of an nth-business-day rule.
 * @param inside - Output, appended to: `edges` (first day of each new section: both ends of effective periods,
 *   of specific dates and of the providers' supported years), `spans` (providers' supported years) and `rules`
 *   (recurring rules).
 * @returns false when a calendar's contents are unknown (not created by this library); `inside` may then be partial.
 * @internal
 * @see decisions.md #31
 */
export function collectBasis(calendar: object, inside: BasisInside): boolean {
  const parts = partsOf(calendar);
  if (parts === undefined) return false;
  if (Array.isArray(parts)) return parts.every((c: object) => collectBasis(c, inside));
  const { source, annual, recurring, dates } = parts as CompiledSchedule<unknown, string>;
  // Providers' supported years: examined in full, and both ends are boundaries too (with "ignore" the outside
  // is another section without holidays; with "throw" it is a section in which the basis throws. When a section
  // that throws is in the scan, a rule touching it touches days that cannot be judged and is not called
  // removable. unsureOf)
  for (const { supportedYears } of source.providers) {
    const from = dayOfYear(supportedYears.from, false);
    const to = dayOfYear(supportedYears.to, true);
    inside.spans.push({ from, to });
    inside.edges.push(from, to + 1);
  }
  for (const r of [...annual, ...recurring]) {
    if (r.effectiveFrom !== null) inside.edges.push(r.effectiveFrom);
    if (r.effectiveTo !== null) inside.edges.push(r.effectiveTo + 1);
  }
  for (const r of dates) inside.edges.push(r.from, r.to + 1);
  inside.rules.push(...recurring);
  return recurring.every((r) => r.calendar === null || collectBasis(r.calendar, inside));
}

/**
 * Days of the diagnostic range on which a judgement cannot throw `out-of-range` merely because the day is
 * outside the providers' supported years. The rule diagnostics examine no day outside this span.
 * @param source - Providers and outOfRangePolicy of the options.
 * @returns With providers and outOfRangePolicy "throw": the part of the diagnostic range from January 1 of the
 *   latest first supported year to December 31 of the earliest last supported year (`from > to` when the
 *   providers do not overlap each other or the diagnostic range). Otherwise the whole diagnostic range.
 * @internal
 * @see decisions.md #31
 */
export function judgeableSpan(source: HolidaySource<string>): Range {
  if (source.providers.length === 0 || source.outOfRangePolicy === "ignore")
    return { from: RANGE_FROM, to: RANGE_TO };
  const years = source.providers.map((p) => p.supportedYears);
  return {
    from: Math.max(dayOfYear(Math.max(...years.map((y) => y.from)), false), RANGE_FROM),
    to: Math.min(dayOfYear(Math.min(...years.map((y) => y.to)), true), RANGE_TO),
  };
}

/**
 * Days that represent every day of {@link judgeableSpan} for the rule diagnostics: a rule relation that
 * holds on all returned days holds on every day of the span.
 * The span is divided into sections by boundaries (days on which an input that makes the result differ by year
 * starts or ends). Inside a section without holidays the results repeat every `cycle` days, so one cycle on
 * each side of every boundary represents the section; a section shorter than a cycle is examined in full, and
 * years with holidays are examined in full. The returned ranges are the union of the following, clipped to the
 * span and merged:
 * - `full`: the whole span, and nothing else;
 * - without providers: `cycle` days from 2001-01-01, or the whole span when they do not fit into it;
 * - with providers: the supported years ("throw": the years all providers support; "ignore": first to last
 *   supported year), and with "ignore" one cycle before and after them (days without holidays);
 * - per rule with an effective period: the period, and one cycle on each side of both of its ends;
 * - per `inside` edge: one cycle on each side of it; and every `inside` span;
 * - "throw" with providers only: the first and the last PROVIDER_EDGE_DAYS + 1 days of the span.
 * A boundary outside the span is moved to the nearer end of the span (the cycle then starts at that end).
 * @param source - Providers and outOfRangePolicy.
 * @param rules - Annual and recurring rules (only effective periods are read).
 * @param cycle - Pattern cycle in days ({@link patternCycle}).
 * @param inside - Inputs collected from the counting-basis calendars, if all are known.
 * @param full - true to return the whole span (used when the contents of a basis calendar are unknown).
 * @returns `ranges` (sorted, disjoint, non-adjacent) and `label` (the years of the ranges without the edge
 *   days, for messages); undefined when the span is empty.
 * @internal
 * @see decisions.md #31
 */
export function scanWindow(
  source: HolidaySource<string>,
  rules: readonly (CompiledPeriod & { readonly path: string })[],
  cycle: number,
  inside?: BasisInside,
  full = false,
): Window | undefined {
  const span = judgeableSpan(source);
  if (span.from > span.to) return undefined;
  const ranges: Range[] = [];
  /**
   * One cycle ending on the day before `edge` and one cycle starting on `edge` (the first day of a new
   * section). An edge outside the span is moved to the nearer end of the span.
   */
  const around = (edge: number): Range[] => {
    const before = Math.min(edge - 1, span.to);
    const after = Math.max(edge, span.from);
    return [
      { from: before - cycle + 1, to: before },
      { from: after, to: after + cycle - 1 },
    ];
  };
  if (full) {
    ranges.push(span);
  } else if (source.providers.length === 0) {
    const to = PATTERN_FROM + cycle - 1;
    ranges.push(to <= span.to ? { from: PATTERN_FROM, to } : span);
  } else {
    const years = source.providers.map((p) => p.supportedYears);
    const ignore = source.outOfRangePolicy === "ignore";
    const from = dayOfYear((ignore ? Math.min : Math.max)(...years.map((r) => r.from)), false);
    const to = dayOfYear((ignore ? Math.max : Math.min)(...years.map((r) => r.to)), true);
    ranges.push({ from, to });
    // Options that treat the outside of the supported years as without holidays also get one cycle before and
    // after the supported years (days without holidays)
    if (ignore) ranges.push(...around(from), ...around(to + 1));
  }
  if (!full) {
    for (const rule of rules) {
      if (rule.effectiveFrom === null && rule.effectiveTo === null) continue;
      const period = inDiagnosticRange(rule.effectiveFrom, rule.effectiveTo);
      if (period) ranges.push(period);
      // The outside of an effective period (after the rule ends, before it starts) gets one cycle too: another
      // rule may take effect only there
      if (rule.effectiveFrom !== null) ranges.push(...around(rule.effectiveFrom));
      if (rule.effectiveTo !== null) ranges.push(...around(rule.effectiveTo + 1));
    }
    // Inside the basis calendar of nth-business-day rules: one cycle before and after each boundary (both ends
    // of effective periods, specific dates and providers' supported years), and the years with holidays
    // (providers' supported years) in full
    if (inside) {
      for (const e of inside.edges) ranges.push(...around(e));
      ranges.push(...inside.spans);
    }
  }
  /**
   * Clips ranges to the span, drops empty ones, sorts them and merges overlapping or adjacent ones.
   */
  const fit = (list: readonly Range[]): Range[] =>
    mergeRanges(
      list
        .map((r) => ({ from: Math.max(r.from, span.from), to: Math.min(r.to, span.to) }))
        .filter((r) => r.from <= r.to),
    );
  // The years in the message are the ranges up to here (the two edges below are not written)
  const label = fit(ranges)
    .map((r) => `${yearOf(r.from)}-${yearOf(r.to)}`)
    .join(", ");
  // The two ends of the span with "throw" (days on which a rule looks outside the supported years, so the
  // judgement can be out-of-range) are always examined
  if (source.providers.length > 0 && source.outOfRangePolicy !== "ignore")
    ranges.push(
      { from: span.from, to: span.from + PROVIDER_EDGE_DAYS },
      { from: span.to - PROVIDER_EDGE_DAYS, to: span.to },
    );
  return { ranges: fit(ranges), label };
}

/**
 * Window scanned by the rule diagnostics (`shadowed`, `never-matches`, `redundant`, `no-business-day`).
 * @param compiled - Compiled options (source, annual and recurring rules).
 * @returns The window of {@link scanWindow} including the inside of the counting-basis calendars, or undefined
 *   when no day can be judged. When a basis calendar has unknown contents (not created by this library), the
 *   window is the whole {@link judgeableSpan}: every day is examined, so nothing needs to be known about it.
 * @internal
 * @see decisions.md #31
 */
export function rulesScanWindow(
  compiled: Pick<CompiledSchedule<unknown, string>, "source" | "annual" | "recurring">,
): Window | undefined {
  const source = compiled.source as HolidaySource<string>;
  const inside: BasisInside = { edges: [], spans: [], rules: [] };
  const known = compiled.recurring.every(
    (r) => r.calendar === null || collectBasis(r.calendar, inside),
  );
  // The cycles inside the bases are part of the length in which everything aligns
  const cycle = patternCycle([...compiled.recurring, ...inside.rules]);
  return scanWindow(source, [...compiled.annual, ...compiled.recurring], cycle, inside, !known);
}

/**
 * Calls `fn` for every day of the window in ascending order.
 * @param window - Ranges to visit.
 * @param fn - Receives the day number; returning true stops the iteration.
 * @internal
 */
export function eachDay(window: Window, fn: (dayNumber: number) => boolean | void): void {
  for (const { from, to } of window.ranges) {
    for (let n = from; n <= to; n++) if (fn(n) === true) return;
  }
}

// ------------------------------------------------------------
// Days a rule matches (to judge whether it is covered)
// ------------------------------------------------------------

/**
 * Days of the representative 28 years (2001-2028) on which the rule's shape matches, ignoring its effective
 * period, the phase of `interval` (treated as every week), holidays and shifts.
 * @param rule - A recurring rule that is not holiday-based and not an nth-business-day rule.
 * @returns One byte per day from 2001-01-01 (1 = matches), PATTERN_DAYS long.
 * @internal
 */
export function patternBits(rule: RecurringRuleCompiled<unknown>): Uint8Array {
  const bits = new Uint8Array(PATTERN_DAYS);
  // A rule with a cycle is examined in its form without the phase (every week); cycle and phase are compared
  // by intervalCovers
  const weekly = rule.interval === null ? rule : { ...rule, interval: null, anchor: null };
  for (let i = 0; i < PATTERN_DAYS; i++) {
    if (matchPattern(weekly, dateOfDayNumber(PATTERN_FROM + i))) bits[i] = 1;
  }
  return bits;
}

/**
 * Whether a recurring rule (not holiday-based, not nth-business-day) matches at least one day of its effective
 * period in the diagnostic range.
 * Precondition: the effective period has a day in the diagnostic range.
 * @param rule - The rule.
 * @param cycle - Pattern cycle in days.
 * @returns true when a matching day exists in: one cycle from 2001-01-01, or the whole range when the cycle
 *   does not fit (no effective period); the last cycle of the period (no start); otherwise the first cycle of
 *   the period. Each is clipped to the diagnostic range.
 * @internal
 */
export function matchesAnyDay(rule: RecurringRuleCompiled<unknown>, cycle: number): boolean {
  const period = inDiagnosticRange(rule.effectiveFrom, rule.effectiveTo)!;
  let { from, to } = period;
  if (rule.effectiveFrom !== null) to = Math.min(to, from + cycle - 1);
  else if (rule.effectiveTo !== null) from = Math.max(from, to - cycle + 1);
  else if (PATTERN_FROM + cycle - 1 <= to) [from, to] = [PATTERN_FROM, PATTERN_FROM + cycle - 1];
  for (let n = from; n <= to; n++) if (matchPattern(rule, dateOfDayNumber(n))) return true;
  return false;
}

/** Month-days an annual rule can match (the 366 days of a leap year) */
const LEAP_MONTH_DAYS: readonly string[] = (() => {
  const list: string[] = [];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= lengthOfMonth(2028, m); d++) {
      list.push(`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return list;
})();

/**
 * Month-days on which an annual rule matches.
 * @param rule - An annual date rule.
 * @returns One byte per month-day of a leap year (366 entries, "01-01" first; 1 = matches).
 * @internal
 */
export function annualBits(rule: AnnualRule<unknown>): Uint8Array {
  return Uint8Array.from(LEAP_MONTH_DAYS, (md) => (matchMonthDay(rule, md) ? 1 : 0));
}

/**
 * Whether every index set in `a` is also set in `b`.
 * @param a - Bit array.
 * @param b - Bit array of the same length.
 * @returns true when a ⊆ b.
 * @internal
 */
export const isSubset = (a: Uint8Array, b: Uint8Array): boolean =>
  a.every((v, i) => v === 0 || b[i] === 1);

/**
 * Whether two effective periods share at least one day (an open end extends without limit).
 * @internal
 */
export const periodsOverlap = (a: CompiledPeriod, b: CompiledPeriod): boolean =>
  (a.effectiveFrom ?? -Infinity) <= (b.effectiveTo ?? Infinity) &&
  (b.effectiveFrom ?? -Infinity) <= (a.effectiveTo ?? Infinity);

/**
 * Whether the effective period of `earlier` contains that of `later` (an open end of `earlier` covers
 * anything; an open end of `later` is covered only by an open end).
 * @internal
 */
export const periodCovers = (earlier: CompiledPeriod, later: CompiledPeriod): boolean =>
  (earlier.effectiveFrom === null ||
    (later.effectiveFrom !== null && earlier.effectiveFrom <= later.effectiveFrom)) &&
  (earlier.effectiveTo === null ||
    (later.effectiveTo !== null && earlier.effectiveTo >= later.effectiveTo));

/**
 * Whether, as far as `interval` and `anchor` go, `earlier` can match every day `later` matches.
 * @param earlier - The rule written first.
 * @param later - The rule written later.
 * @returns true when `earlier` has no interval; false when only `earlier` has one; otherwise true when
 *    later.interval is a multiple of earlier.interval and the anchors differ by a multiple of 7 × earlier.interval
 *   days.
 * @internal
 */
export function intervalCovers(
  earlier: RecurringRuleCompiled<unknown>,
  later: RecurringRuleCompiled<unknown>,
): boolean {
  if (earlier.interval === null) return true;
  if (later.interval === null) return false;
  return (
    later.interval % earlier.interval === 0 &&
    (later.anchor! - earlier.anchor!) % (7 * earlier.interval) === 0
  );
}

/**
 * Whether an n-day cycle rule `earlier` matches every day the cycle rule `later` matches (months are compared
 * separately).
 * Precondition: both rules have `cycle`, `positions` and `anchor`.
 * @returns true when later.cycle is a multiple of earlier.cycle and every position of `later` falls on a position of
 *   `earlier`.
 * @internal
 */
export function cycleCovers(
  earlier: RecurringRuleCompiled<unknown>,
  later: RecurringRuleCompiled<unknown>,
): boolean {
  const e = earlier.cycle!;
  if (later.cycle! % e !== 0) return false;
  return [...later.positions!].every((position) => {
    const offset = (later.anchor! + position - 1 - earlier.anchor!) % e;
    return earlier.positions!.has(((offset + e) % e) + 1);
  });
}

/**
 * Whether the holidayOverlapPolicy of `earlier` allows it to shadow `later`.
 * @returns "over-holiday" is covered only by "over-holiday"; "under-holiday" by "over-holiday" and
 *   "under-holiday"; "after-holiday" only by "after-holiday".
 * @internal
 */
export function canCover(
  earlier: RecurringRuleCompiled<unknown>,
  later: RecurringRuleCompiled<unknown>,
): boolean {
  switch (later.holidayOverlapPolicy) {
    case "over-holiday":
      return earlier.holidayOverlapPolicy === "over-holiday";
    case "under-holiday":
      return earlier.holidayOverlapPolicy !== "after-holiday";
    case "after-holiday":
      return earlier.holidayOverlapPolicy === "after-holiday";
    default: {
      const unreachable: never = later.holidayOverlapPolicy;
      return unreachable;
    }
  }
}

// ------------------------------------------------------------
// Comparing values (does removal change a result?)
// ------------------------------------------------------------

/**
 * Whether two schedule values are the same for the diagnostics.
 * @param a - A value.
 * @param b - A value.
 * @returns true when Object.is holds, or both are arrays of equal length, or plain objects (prototype
 *   Object.prototype or null) with the same own enumerable keys, whose elements are the same recursively.
 *   Cyclic values are supported. Values that cannot be compared are not the same: values nested too deeply
 *   (stack overflow), and values whose reading throws (a getter or a proxy that throws).
 * @internal
 * @see decisions.md #31
 */
export function sameValue(a: unknown, b: unknown): boolean {
  try {
    return sameValueIn(a, b, new Map());
  } catch {
    // Values that cannot be compared are treated as different (never in favour of removal). Passing the error on
    // would make the diagnostics report it as an error of a holiday provider (run)
    return false;
  }
}

/**
 * Recursive part of {@link sameValue}.
 * @param seen - Pairs being compared (a → set of b); returning to a pair on a cycle counts as the same.
 * @internal
 */
export function sameValueIn(a: unknown, b: unknown, seen: Map<object, Set<object>>): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const pairs = seen.get(a);
  if (pairs?.has(b)) return true;
  if (pairs) pairs.add(b);
  else seen.set(a, new Set([b]));
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => sameValueIn(v, b[i], seen))
    );
  }
  const plain = (o: object): boolean => {
    const proto: unknown = Object.getPrototypeOf(o);
    return proto === Object.prototype || proto === null;
  };
  if (!plain(a) || !plain(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every(
      (k) =>
        Object.hasOwn(b, k) &&
        sameValueIn((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], seen),
    )
  );
}

// ------------------------------------------------------------
// Diagnostics between rules
// ------------------------------------------------------------

/**
 * Year of a day number.
 * @internal
 */
export const yearOf = (dayNumber: number): number => parseDate(dateOfDayNumber(dayNumber)).year;

/**
 * Copy of the compiled options without one rule, or without all specific dates.
 * @param compiled - Compiled options.
 * @param rule - The date, annual or recurring rule to drop, or null to drop none.
 * @param dropDates - true to drop every specific date.
 * @returns A new object; `compiled` is not changed.
 * @internal
 */
export function without<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  rule: DecidingRule<Value> | null,
  dropDates: boolean,
): CompiledSchedule<Value, Kind> {
  return {
    ...compiled,
    dates: dropDates ? [] : compiled.dates.filter((r) => r !== rule),
    annual: compiled.annual.filter((r) => r !== rule),
    recurring: compiled.recurring.filter((r) => r !== rule),
  };
}

/**
 * Path of a provider in diagnostics.
 * @param source - Providers of the options.
 * @param i - Index in `source.providers`.
 * @returns "holidayProvider" with one provider; otherwise "holidayProvider[k]" where k is the index as written
 *   in the options (before duplicates were removed).
 * @internal
 */
export const providerPath = (source: HolidaySource<string>, i: number): string =>
  source.providers.length === 1
    ? "holidayProvider"
    : `holidayProvider[${source.providerIndexes?.[i] ?? i}]`;

/**
 * Validates the data every provider returns, for every supported year in the diagnostic range.
 * Creation validates a year only when it is first used; this finds errors in unused years.
 * @param c - Receives one `invalid-provider-data` error per failing provider.
 * @param source - Providers of the options.
 * @returns false when any provider failed.
 * @internal
 */
export function checkProviderData(c: IssueCollector, source: HolidaySource<string>): boolean {
  let ok = true;
  source.providers.forEach((provider, i) => {
    const path = providerPath(source, i);
    const lookup = createHolidayLookup({
      ...source,
      providers: [provider],
      outOfRangePolicy: "ignore",
    });
    const from = Math.max(provider.supportedYears.from, DIAGNOSTIC_YEARS.from);
    const to = Math.min(provider.supportedYears.to, DIAGNOSTIC_YEARS.to);
    try {
      for (let y = from; y <= to; y++) lookup.holidaysInYear(y);
    } catch (error) {
      ok = false;
      c.error(
        "invalid-provider-data",
        path,
        error instanceof Error ? error.message : `Holiday provider threw ${String(error)}`,
      );
    }
  });
  return ok;
}

/**
 * What a basis wrapped by {@link guardBases} returns for a month in which the basis threw: this very array (a
 * month without business days). A basis that returns no business day without throwing returns another array, so
 * {@link unjudgeableDays} tells the two apart by identity.
 */
const UNJUDGED_MONTH: readonly number[] = Object.freeze([]);

/**
 * Wraps the counting basis of each schedule rule with a `calendar`, so that during one diagnosis every month
 * is evaluated at most once and a month in which the basis throws counts as a month without business days
 * instead of throwing.
 * - Any exception counts, whatever it is: the day cannot be judged, as when the basis is outside its supported
 *   years. The diagnostics report problems of the options they are given; what is wrong inside a basis calendar
 *   (or an object shaped like a calendar) is reported when that calendar's own options are diagnosed.
 * - The first outcome of a month (its business days, or that it threw) is kept and used for the rest of the
 *   diagnosis, so an object shaped like a calendar that answers differently from call to call is seen as one
 *   consistent basis.
 * @param compiled - Compiled options.
 * @param unknownMonths - Output: months (year × 12 + month - 1) in which a basis threw.
 * @returns `compiled` itself when no rule has a basis calendar; otherwise a copy with wrapped bases.
 * @internal
 * @see decisions.md #4, #16, #31
 */
export function guardBases<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  unknownMonths: Set<number>,
): CompiledSchedule<Value, Kind> {
  if (!compiled.recurring.some((r) => r.basis !== null && r.calendar !== null)) return compiled;
  return {
    ...compiled,
    recurring: compiled.recurring.map((r) => {
      const basis = r.basis;
      if (basis === null || r.calendar === null) return r;
      // The outcome of each month: its business days, or UNJUDGED_MONTH when the basis threw. Kept for one run of the
      // diagnostics and discarded afterwards. A month that threw is not evaluated again and again, creating an
      // error each time (most of the time of creating an error is recording the stack. 0.32.7)
      const outcomes = new Map<number, readonly number[]>();
      const guarded: BasisOfMonth = (year, month) => {
        const m = year * 12 + month - 1;
        let days = outcomes.get(m);
        if (days === undefined) {
          try {
            days = basis(year, month);
          } catch {
            // Only months that threw are recorded (how week rules look at neighbouring months is decided by
            // unjudgeableDays). The record is used by the watch
            days = UNJUDGED_MONTH;
            unknownMonths.add(m);
          }
          outcomes.set(m, days);
        }
        return days;
      };
      return { ...r, basis: guarded };
    }),
  };
}

/**
 * Diagnostics withheld when some days cannot be judged (nothing unknown is claimed). `shadowed` follows from
 * the shape of the rules alone (set containment, same basis calendar) without evaluating the basis calendar,
 * so it is always reported
 */
const UNSURE_CODES = new Set(["never-matches", "redundant"]);

/**
 * @internal Days that cannot be judged (day numbers in the window) and months in which a basis throws
 * (year × 12 + month - 1; used by the watch)
 */
export interface Unjudgeable {
  readonly days: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
}

/**
 * Days of the window on which the result of some rule with a basis calendar is unknown because the basis
 * throws (any exception: outside the supported years, an unconfirmed holiday, a move out of reach, or an error
 * of an object shaped like a calendar). Computed without evaluating rules.
 * - month rule: days of (effective period ∩ window) in a selected month in which the basis throws;
 * - week rule: the 7 days of each week (by weekStart) touching (effective period ∩ window) that contains a
 *   day of a selected month, when the basis throws in a month of one of the 7 days.
 * @param compiled - Compiled options whose bases are wrapped by {@link guardBases}: the outcome of each month is
 *   the one the rest of the diagnosis uses, and a month that threw is recognized by what the wrapped basis
 *   returns.
 * @param window - Scanned ranges, or undefined.
 * @returns `days` (day numbers) and `months` (year × 12 + month - 1 in which a basis throws); both empty
 *   without a window or without basis calendars.
 * @internal
 * @see decisions.md #17, #31
 */
export function unjudgeableDays<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  window:
    | { readonly ranges: readonly { readonly from: number; readonly to: number }[] }
    | undefined,
): Unjudgeable {
  const days = new Set<number>();
  const months = new Set<number>();
  const bases = compiled.recurring.filter((r) => r.basis !== null && r.calendar !== null);
  if (!window || bases.length === 0) return { days, months };
  // year × 12 + month - 1 from a day number (without building a date string: called per day. 0.32.7)
  const monthOf = (day: number): number => {
    const d = new Date(day * 86_400_000);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };
  for (const r of bases) {
    const thrown = new Map<number, boolean>();
    const throws = (m: number): boolean => {
      let result = thrown.get(m);
      if (result === undefined) {
        result = r.basis!(Math.floor(m / 12), (m % 12) + 1) === UNJUDGED_MONTH;
        thrown.set(m, result);
        if (result) months.add(m);
      }
      return result;
    };
    const inMonths = (m: number): boolean => r.months === null || r.months.has((m % 12) + 1);
    for (const range of window.ranges) {
      const from = Math.max(range.from, r.effectiveFrom ?? -Infinity);
      const to = Math.min(range.to, r.effectiveTo ?? Infinity);
      if (from > to) continue;
      if (r.weekStart === null) {
        for (let n = from; n <= to; n++) {
          const m = monthOf(n);
          if (inMonths(m) && throws(m)) days.add(n);
        }
        continue;
      }
      // Week rules: per week delimited by weekStart, whether the basis throws in a month its 7 days belong to
      const start = from - ((weekdayOf(dateOfDayNumber(from)) - r.weekStart + 7) % 7);
      for (let w = start; w <= to; w += 7) {
        const week = [0, 1, 2, 3, 4, 5, 6].map((i) => w + i);
        const weekMonths = [...new Set(week.map(monthOf))];
        if (!weekMonths.some(inMonths)) continue;
        // Every month that throws is recorded (input of the watch; `some` must not stop early)
        if (weekMonths.map(throws).some(Boolean)) for (const n of week) days.add(n);
      }
    }
  }
  return { days, months };
}

/**
 * Days in the periods of specific dates on which a basis calendar throws. A specific date is judged over the
 * part of its own period in the diagnostic range, which can lie outside the window, so these days are found
 * separately.
 * @param compiled - Compiled options whose bases are wrapped by {@link guardBases}.
 * @returns As {@link unjudgeableDays}, over the periods of the specific dates, clipped to the diagnostic range.
 * @internal
 * @see decisions.md #31
 */
export function unjudgeableInDates<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
): Unjudgeable {
  return unjudgeableDays(compiled, {
    ranges: compiled.dates.flatMap((r) => inDiagnosticRange(r.from, r.to) ?? []),
  });
}

/**
 * Builds the predicate "this diagnostic cannot be decided", used to withhold `never-matches` and `redundant`.
 * @param compiled - Compiled options.
 * @param unknown - Result of {@link unjudgeableDays}.
 * @param dateDays - Unjudgeable days in the periods of specific dates ({@link unjudgeableInDates}); they count
 *   for specific dates only.
 * @returns (code, path) => boolean. Always false for other codes. For the two codes: true when the path
 *   belongs to no rule; false for a recurring rule without a basis calendar when the code is `never-matches`
 *   or the path is an option inside the rule; for a specific date, true when an unjudgeable day lies in its
 *   period; otherwise true when an unjudgeable day lies in the rule's effective period.
 * @internal
 */
export function unsureOf<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  unknown: Unjudgeable,
  dateDays: ReadonlySet<number> = new Set(),
): (code: string, path: string) => boolean {
  if (unknown.days.size === 0 && dateDays.size === 0) return () => false;
  const ascending = (days: Iterable<number>): number[] => [...days].sort((a, b) => a - b);
  const inWindow = ascending(unknown.days);
  const inDates =
    dateDays.size === 0 ? inWindow : ascending(new Set([...unknown.days, ...dateDays]));
  const overlaps = (
    sorted: readonly number[],
    start: number | null,
    end: number | null,
  ): boolean => {
    const a = start ?? -Infinity;
    const b = end ?? Infinity;
    // Binary search for the first day at or after a, then whether it is at or before b
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! < a) lo = mid + 1;
      else hi = mid;
    }
    return lo < sorted.length && sorted[lo]! <= b;
  };
  const items: readonly DecidingRule<Value>[] = [
    ...compiled.dates,
    ...compiled.annual,
    ...compiled.recurring,
  ];
  const isRecurring = (r: DecidingRule<Value>): r is RecurringRuleCompiled<Value> =>
    (compiled.recurring as readonly DecidingRule<Value>[]).includes(r);
  const isDate = (r: DecidingRule<Value>): r is DateRule<Value> =>
    (compiled.dates as readonly DecidingRule<Value>[]).includes(r);
  return (code, path) => {
    if (!UNSURE_CODES.has(code)) return false;
    const item = items.find((r) => path === r.path || path.startsWith(`${r.path}.`));
    if (item === undefined) return true;
    if (
      isRecurring(item) &&
      item.calendar === null &&
      (code === "never-matches" || path !== item.path)
    )
      return false;
    if (isDate(item)) return overlaps(inDates, item.from, item.to);
    return overlaps(inWindow, item.effectiveFrom, item.effectiveTo);
  };
}

/**
 * Months and weeks in which specific dates change the count of nth-business-day rules that count the
 * options' own business days.
 * @param window - The rule window; undefined yields no ranges.
 * @param compiled - Compiled options.
 * @returns Empty unless such a rule and a specific date both exist. Otherwise, for the first and the last day
 *   of every specific date, its month extended by 6 days on both sides, clipped to {@link judgeableSpan}
 *   (not to `window`), merged. At most 86 days per date.
 * @internal
 * @see decisions.md #31
 */
export function dateUnitsOf<Value, Kind extends string>(
  window: Window | undefined,
  compiled: CompiledSchedule<Value, Kind>,
): Range[] {
  const { dates, recurring, source } = compiled;
  if (!window || dates.length === 0) return [];
  if (!recurring.some((r) => r.businessDays !== null && r.calendar === null)) return [];
  const { from: lo, to: hi } = judgeableSpan(source as HolidaySource<string>);
  const ranges: Range[] = [];
  for (const d of dates) {
    for (const edge of d.from === d.to ? [d.from] : [d.from, d.to]) {
      const { year, month, day } = parseDate(dateOfDayNumber(edge));
      const from = Math.max(edge - day + 1 - 6, lo);
      const to = Math.min(edge - day + lengthOfMonth(year, month) + 6, hi);
      if (from <= to) ranges.push({ from, to });
    }
  }
  return mergeRanges(ranges);
}

/**
 * Sorts ranges by `from` and merges overlapping or adjacent ones.
 * @param ranges - Ranges in any order.
 * @returns New sorted, disjoint, non-adjacent ranges.
 * @internal
 */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const merged: Range[] = [];
  for (const r of [...ranges].sort((x, y) => x.from - y.from)) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to + 1)
      merged[merged.length - 1] = { from: last.from, to: Math.max(last.to, r.to) };
    else merged.push(r);
  }
  return merged;
}

/**
 * Reports, as one `holiday-run-too-long` warning per rule, "after-holiday" rules whose day cannot be moved
 * past a long run of holidays (judging that day throws).
 * @param c - Receives the warnings.
 * @param compiled - Compiled options.
 * @param lookup - Holiday lookup that accepts unconfirmed holidays.
 * @param window - The rule window. Nothing is checked without a window, providers or "after-holiday" rules.
 * @remarks Limit: only holiday runs inside the window are examined.
 * @internal
 * @see decisions.md #24, #31
 */
export function checkLostShifts<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
  lookup: ReturnType<typeof createHolidayLookup<Kind>>,
  window: ReturnType<typeof rulesScanWindow>,
): void {
  const { source, recurring } = compiled;
  const shifting = recurring.filter((r) => r.holidayOverlapPolicy === "after-holiday");
  if (!window || source.providers.length === 0 || shifting.length === 0) return;
  /** Per rule, the description of the first move out of reach that was found */
  const found = new Map<RecurringRuleCompiled<Value>, string>();
  const resolve = createResolver(compiled, lookup, (rule, date, origin) => {
    if (!found.has(rule)) found.set(rule, lostShiftMessage(date, origin));
  });
  // The day a rule moves to (the day after the run) is the first day that is neither a holiday nor a skipped
  // weekday, preceded by holidays or skipped weekdays. Skipped weekdays alone never last 7 days, so that day is
  // always within 7 days after some holiday and before the next holiday. Therefore, for every holiday whose
  // next day is not a holiday, the 7 days after it (up to the next holiday) are evaluated. With a rule that
  // skips weekdays, the length of the run is not used as a filter (filtering by the holidays alone would miss
  // sequences that reach the limit together with skipped weekdays before, after or in between; without a move
  // out of reach, evaluating collects nothing)
  const skipping = shifting.some((r) => r.skipWeekdays !== null);
  for (const { from, to } of window.ranges) {
    const days: number[] = [];
    for (let y = yearOf(from); y <= yearOf(to); y++)
      for (const h of lookup.holidaysInYear(y)) days.push(dayNumberOf(h.date));
    for (let i = 0; i < days.length; i++) {
      // Without a rule that skips weekdays, a move is out of reach only after holidays alone lasted the limit,
      // so only that place is evaluated
      const back = MAX_HOLIDAY_RUN - 1;
      if (!skipping && days[i - back] !== days[i]! - back) continue;
      const last = Math.min(days[i]! + 7, (days[i + 1] ?? Infinity) - 1, to);
      for (let n = days[i]! + 1; n <= last; n++) {
        try {
          resolve(dateOfDayNumber(n), false);
        } catch (error) {
          // At an end of the supported years, a rule that looks at a neighbouring day leaves the supported
          // years and throws (the judgement throws too, so nothing is examined here)
          if (!atEdge(n, error, window)) throw error;
        }
      }
    }
  }
  for (const [rule, message] of found)
    c.warning(
      "holiday-run-too-long",
      rule.path,
      message,
      source.providers.length === 1 ? providerPath(source as HolidaySource<string>, 0) : undefined,
    );
}

/**
 * Self-check after the rule diagnostics; does not change the issues.
 * @param c - The collector.
 * @param from - Index of the first issue added by the rule diagnostics.
 * @param unsure - Predicate of {@link unsureOf}.
 * @param recorded - Months in which a basis threw during the scan ({@link guardBases}).
 * @param unknown - Result of {@link unjudgeableDays}.
 * @throws InternalError when a basis threw in a month not found beforehand, or when a withheld diagnostic was
 *   reported.
 * @internal
 * @see decisions.md #31
 */
export function dropUnsure(
  c: IssueCollector,
  from: number,
  unsure: (code: string, path: string) => boolean,
  recorded: ReadonlySet<number>,
  unknown: Unjudgeable,
): void {
  for (const m of recorded)
    if (!unknown.months.has(m))
      throw internalError(`a basis threw in a month that was not found beforehand: ${m}`);
  const left = c.issues.slice(from).find((d) => unsure(d.code, d.path));
  if (left)
    throw internalError(
      `a diagnostic about an unjudgeable month was left: ${left.code} ${left.path}`,
    );
}

/**
 * Runs the rule diagnostics: guards the bases, computes the window and the unjudgeable days, then
 * {@link analyzeRules}, then the self-check {@link dropUnsure}.
 * @param c - Receives the issues.
 * @param original - Compiled options without errors.
 * @param isCalendar - true for a business calendar (enables `no-business-day`).
 * @internal
 */
export function analyze<Value, Kind extends string>(
  c: IssueCollector,
  original: CompiledSchedule<Value, Kind>,
  isCalendar: boolean,
): void {
  // The days that cannot be judged are decided before any rule is evaluated, by evaluating the bases directly
  // (a basis does not depend on recurring rules, so the order of the rules and of the removal does not matter).
  // Rules that are unsure get no never-matches / redundant and are not removed by the sequential removal
  // (decisions.md #31)
  // The bases are guarded first, so that the months found here and the months the rules see later are the same
  // evaluations (an object shaped like a calendar may answer differently from call to call)
  const recorded = new Set<number>();
  const compiled = guardBases(original, recorded);
  const window = rulesScanWindow(original);
  const unknown = unjudgeableDays(compiled, window);
  // A specific date is judged over its own period, also outside the window: a date whose period has a day on
  // which a basis throws is not judged either
  const dated = unjudgeableInDates(compiled);
  const unsure = unsureOf(original, unknown, dated.days);
  const from = c.issues.length;
  analyzeRules(c, compiled, isCalendar, unsure);
  dropUnsure(c, from, unsure, recorded, {
    days: unknown.days,
    months: new Set([...unknown.months, ...dated.months]),
  });
}

type Lookup<Kind extends string> = ReturnType<typeof createHolidayLookup<Kind>>;
type Resolver<Value, Kind extends string> = ReturnType<typeof createResolver<Value, Kind>>;

/**
 * State shared by the steps of one run of the rule diagnostics. Built by {@link createRuleContext}.
 * @internal
 */
export interface RuleContext<Value, Kind extends string> {
  /** Receives the issues. */
  readonly c: IssueCollector;
  /** Compiled options (bases guarded). */
  readonly compiled: CompiledSchedule<Value, Kind>;
  /** Diagnostics that cannot be decided: not reported, and their rules are not removed. */
  readonly unsure: (code: string, path: string) => boolean;
  /** Holiday lookup that accepts unconfirmed holidays (the diagnostics always judge with it). */
  readonly lookup: Lookup<Kind>;
  /** Lookup with the options' own policy, only when unconfirmedHolidayPolicy is "throw"; otherwise null. */
  readonly strictLookup: Lookup<Kind> | null;
  /** Counting basis of the options' own business days (with specific dates), or undefined when not needed. */
  readonly basis: BasisOfMonth | undefined;
  /** The same basis without specific dates; equals `basis` when there are no date units. */
  readonly basisNoDates: BasisOfMonth | undefined;
  /** Pattern cycle of the recurring rules, in days. */
  readonly cycle: number;
  /** Window of {@link rulesScanWindow}: judged without specific dates when date units exist. */
  readonly rulesWindow: Window | undefined;
  /** Months and weeks around specific dates ({@link dateUnitsOf}): judged with the specific dates. */
  readonly dateUnits: readonly Range[];
  /** `rulesWindow` merged with `dateUnits`: every day the rule diagnostics examine. */
  readonly window: Window | undefined;
  /** Rules found to be never used (out of range, never-matches, shadowed). Filled by the steps, in order. */
  readonly unused: Set<DecidingRule<Value>>;
}

/**
 * Builds the shared state of the rule diagnostics.
 * @param c - Receives the issues.
 * @param compiled - Compiled options whose provider data is valid.
 * @param unsure - Predicate of {@link unsureOf}; default: nothing is unsure.
 * @returns The context. With an own-counting nth-business-day rule and specific dates, two ranges are examined:
 *   `rulesWindow` without the specific dates (months and weeks the dates do not touch) and `dateUnits` with them
 *   (months and weeks whose count the dates change), also outside the window.
 * @internal
 * @see decisions.md #17, #31
 */
export function createRuleContext<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
  unsure: (code: string, path: string) => boolean = () => false,
): RuleContext<Value, Kind> {
  const { source, recurring } = compiled;
  // The diagnostics judge with unconfirmed holidays accepted; outOfRangePolicy stays as the user set it, so a
  // judgement that looks outside the supported years throws as it does for the user.
  const lookup = createHolidayLookup({ ...source, unconfirmedHolidayPolicy: "accept" });
  const basis = createBasis(compiled, lookup);
  const strictLookup =
    source.unconfirmedHolidayPolicy === "throw" ? createHolidayLookup({ ...source }) : null;
  const cycle = patternCycle(recurring);
  const rulesWindow = rulesScanWindow(compiled);
  const dateUnits = dateUnitsOf(rulesWindow, compiled);
  const window =
    rulesWindow && dateUnits.length > 0
      ? { ...rulesWindow, ranges: mergeRanges([...rulesWindow.ranges, ...dateUnits]) }
      : rulesWindow;
  const basisNoDates =
    dateUnits.length > 0 ? createBasis({ ...compiled, dates: [] }, lookup) : basis;
  return {
    c,
    compiled,
    unsure,
    lookup,
    strictLookup,
    basis,
    basisNoDates,
    cycle,
    rulesWindow,
    dateUnits,
    window,
    unused: new Set(),
  };
}

/**
 * Whether a day number lies in one of the ranges.
 * @internal
 */
export const inRanges = (ranges: readonly Range[], n: number): boolean =>
  ranges.some((r) => r.from <= n && n <= r.to);

/**
 * Resolver that keeps the specific dates of `base` on the days of `ctx.dateUnits` and ignores them on other days.
 * @param ctx - The context.
 * @param base - Compiled options to judge.
 * @param using - Holiday lookup; default `ctx.lookup`.
 * @returns The plain resolver of `base` when there are no date units; otherwise a resolver that switches per day.
 *   An unreachable "after-holiday" shift throws.
 * @internal
 */
export function resolverIn<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
  base: CompiledSchedule<Value, Kind>,
  using: Lookup<Kind> = ctx.lookup,
): Resolver<Value, Kind> {
  const withDates = createResolver(base, using, throwLostShift);
  if (ctx.dateUnits.length === 0) return withDates;
  const noDates = createResolver({ ...base, dates: [] }, using, throwLostShift);
  return (date, withHoliday) =>
    (inRanges(ctx.dateUnits, dayNumberOf(date)) ? withDates : noDates)(date, withHoliday);
}

/**
 * The `out-of-range` warning for a rule or date written with no day in the diagnostic range. Such an item is
 * not examined: the usual cause is a mistyped year. Reported only when no provider reported the item as
 * outside its supported years.
 * @param c - Receives the warning.
 * @param path - Path of the rule or date.
 * @param what - "date" or "effective period".
 * @internal
 */
export function reportOutsideRange(c: IssueCollector, path: string, what: string): void {
  c.warning(
    "out-of-range",
    path,
    `The ${what} has no day in ${DIAGNOSTIC_YEARS_LABEL}, the years the diagnostics examine, ` +
      "so it was not examined; check the year",
  );
}

/**
 * Reports, per specific date, `out-of-range` (the date is outside a provider's supported years, or has no day
 * in the diagnostic range) and `shadowed` (an earlier specific date covers all of its days). Shadowed dates
 * and dates without a day in the diagnostic range are added to `ctx.unused`.
 * @internal
 */
export function reportDateIssues<Value, Kind extends string>(ctx: RuleContext<Value, Kind>): void {
  const { c, unused } = ctx;
  const { source, dates } = ctx.compiled;
  dates.forEach((rule, j) => {
    const fromYear = yearOf(rule.from);
    const toYear = yearOf(rule.to);
    let reported = false;
    source.providers.forEach((p, i) => {
      const { from, to } = p.supportedYears;
      if (fromYear >= from && toYear <= to) return;
      reported = true;
      const related = providerPath(source, i);
      c.warning(
        "out-of-range",
        rule.path,
        `The date is outside the years supported by holiday provider ${p.id} (${from}-${to}); ` +
          (source.outOfRangePolicy === "throw"
            ? "looking up this date throws"
            : "holidays are not considered for this date"),
        related,
      );
    });
    if (!inDiagnosticRange(rule.from, rule.to)) {
      unused.add(rule);
      if (!reported) reportOutsideRange(c, rule.path, "date");
      return;
    }
    const cover = dates.slice(0, j).find((r) => r.from <= rule.from && rule.to <= r.to);
    if (cover) {
      unused.add(rule);
      c.warning(
        "shadowed",
        rule.path,
        `This rule is never used: the earlier rule ${cover.path} covers all of its days`,
        cover.path,
      );
    }
  });
}

/**
 * Reports `out-of-range` for annual and recurring rules whose effective period lies entirely before or after a
 * provider's supported years, or has no day in the diagnostic range. A rule that is never used (outOfRangePolicy
 * "throw") or has no day in the diagnostic range is added to `ctx.unused`.
 * @internal
 */
export function reportPeriodsOutOfRange<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
): void {
  const { c, unused } = ctx;
  const { source, annual, recurring } = ctx.compiled;
  for (const rule of [...annual, ...recurring]) {
    if (rule.effectiveFrom === null && rule.effectiveTo === null) continue;
    let reported = false;
    source.providers.forEach((p, i) => {
      const { from, to } = p.supportedYears;
      const after = rule.effectiveFrom !== null && yearOf(rule.effectiveFrom) > to;
      const before = rule.effectiveTo !== null && yearOf(rule.effectiveTo) < from;
      if (!after && !before) return;
      reported = true;
      if (source.outOfRangePolicy === "throw") unused.add(rule);
      c.warning(
        "out-of-range",
        rule.path,
        `The effective period is outside the years supported by holiday provider ${p.id} (${from}-${to}); ` +
          (source.outOfRangePolicy === "throw"
            ? "looking up these dates throws, so this rule is never used"
            : "holidays are not considered for these dates"),
        providerPath(source, i),
      );
    });
    if (!inDiagnosticRange(rule.effectiveFrom, rule.effectiveTo)) {
      unused.add(rule);
      if (!reported) reportOutsideRange(c, rule.path, "effective period");
    }
  }
}

/**
 * Reports `shadowed` for an annual date when an earlier annual date matches every month-day it matches and its
 * effective period contains the later one's. Shadowed rules are added to `ctx.unused`.
 * @internal
 */
export function reportShadowedAnnual<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
): void {
  const { c, unused } = ctx;
  const { annual } = ctx.compiled;
  const annualMatches = annual.map(annualBits);
  annual.forEach((rule, j) => {
    if (!inDiagnosticRange(rule.effectiveFrom, rule.effectiveTo)) return;
    const k = annualMatches.findIndex(
      (bits, i) => i < j && periodCovers(annual[i]!, rule) && isSubset(annualMatches[j]!, bits),
    );
    if (k < 0) return;
    unused.add(rule);
    c.warning(
      "shadowed",
      rule.path,
      `This rule is never used: the earlier rule ${annual[k]!.path} covers all of its days`,
      annual[k]!.path,
    );
  });
}

/**
 * The holiday on a date, or undefined when the lookup throws (outside the supported years counts as no holiday).
 * @internal
 */
export function holidayOfSafe<Kind extends string>(
  lookup: Lookup<Kind>,
  date: DateString,
): Holiday<string> | undefined {
  try {
    return lookup.holidayOfDate(date);
  } catch {
    return undefined;
  }
}

/**
 * Whether a holiday-based rule (holiday, day after, day before) matches at least one day of `ctx.window` inside
 * its effective period. Every day is examined because holidays differ by year.
 * @returns false without providers or without a window.
 * @internal
 */
export function holidayRuleMatches<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
  rule: RecurringRuleCompiled<unknown>,
): boolean {
  const { window, lookup } = ctx;
  if (ctx.compiled.source.providers.length === 0 || !window) return false;
  const holidayOf = (date: DateString): Holiday<string> | undefined => holidayOfSafe(lookup, date);
  let found = false;
  eachDay(window, (n) => {
    if (!inPeriod(rule, n)) return false;
    found = matchPattern(rule, dateOfDayNumber(n), holidayOf, undefined, lookup.fromJp);
    return found;
  });
  return found;
}

/**
 * Whether an nth-business-day rule matches at least one day of `ctx.window` inside its effective period.
 * A day matches when the rule matches with the basis that keeps the specific dates or, outside the date units,
 * with the basis without them. Because both are tried, `never-matches` is never reported more often than when
 * the window is judged with the dates only. A day whose evaluation throws does not match.
 * @returns false without a window.
 * @internal
 */
export function businessDayRuleMatches<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
  rule: RecurringRuleCompiled<unknown>,
): boolean {
  const { window, basis, basisNoDates, dateUnits } = ctx;
  if (!window) return false;
  let found = false;
  eachDay(window, (n) => {
    if (!inPeriod(rule, n)) return false;
    try {
      // An nth-business-day rule is matched with the basis alone (matchPattern looks up no holiday for it)
      const date = dateOfDayNumber(n);
      found =
        matchPattern(rule, date, undefined, basis) ||
        (basisNoDates !== basis &&
          !inRanges(dateUnits, n) &&
          matchPattern(rule, date, undefined, basisNoDates));
    } catch {
      found = false;
    }
    return found;
  });
  return found;
}

/**
 * Whether set `a` contains set `b`; null means "everything".
 * @internal
 */
export const setCovers = <V>(a: ReadonlySet<V> | null, b: ReadonlySet<V> | null): boolean =>
  a === null || (b !== null && [...b].every((v) => a.has(v)));

/**
 * Whether two rules skip the same weekdays when shifting (both none, or the same set).
 * @internal
 */
export const sameSkip = (
  a: RecurringRuleCompiled<unknown>,
  b: RecurringRuleCompiled<unknown>,
): boolean =>
  a.skipWeekdays === null
    ? b.skipWeekdays === null
    : b.skipWeekdays !== null &&
      a.skipWeekdays.size === b.skipWeekdays.size &&
      [...a.skipWeekdays].every((w) => b.skipWeekdays!.has(w));

/**
 * Builds the reader of a rule's `kinds` for the cover comparison.
 * @returns (rule) => its kinds. With only the Japanese provider and no holiday of kind "national" in
 *   `ctx.window`, the old name "national" is read as "regular" (decided once, on first use).
 * @internal
 * @see decisions.md #10, #31
 */
export function createKindsOf<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
): (r: RecurringRuleCompiled<unknown>) => ReadonlySet<string> | null {
  const { window, lookup } = ctx;
  const source = ctx.compiled.source as HolidaySource<string>;
  const renamedKind = RENAMED_VALUES.find((x) => x.key === "kinds")!;
  let nationalAsRegular: boolean | undefined;
  return (r) => {
    if (!r.nationalOfJp || r.kinds === null) return r.kinds;
    if (nationalAsRegular === undefined) {
      let found = false;
      if (window && jpUsage(source) === "only") {
        eachDay(
          window,
          (n) => (found = holidayOfSafe(lookup, dateOfDayNumber(n))?.kind === renamedKind.from),
        );
        nationalAsRegular = !found;
      } else nationalAsRegular = false;
    }
    return nationalAsRegular
      ? new Set([...r.kinds].map((k) => (k === renamedKind.from ? renamedKind.to : k)))
      : r.kinds;
  };
}

/**
 * Whether the earlier recurring rule `r` matches every day the later rule `rule` matches, judged by shape.
 * Requires a compatible holidayOverlapPolicy ({@link canCover}), a containing effective period and the same
 * skipWeekdays. Shapes are compared only within the same kind: holiday rules with holiday rules (kinds, keys,
 * weekdays, months), day-after / day-before rules likewise, day cycles with day cycles, nth-business-day rules
 * with the same weekStart and the same basis calendar, and weekday / day-of-month rules by their matching days
 * in the representative 28 years plus the interval.
 * @param r - The rule written first.
 * @param rule - The rule written later.
 * @param kindsOf - Reader from {@link createKindsOf}.
 * @param bitsOf - Matching days of a rule in the representative years ({@link patternBits}); called only for
 *   weekday and day-of-month rules.
 * @internal
 */
export function ruleCovers(
  r: RecurringRuleCompiled<unknown>,
  rule: RecurringRuleCompiled<unknown>,
  kindsOf: (r: RecurringRuleCompiled<unknown>) => ReadonlySet<string> | null,
  bitsOf: (r: RecurringRuleCompiled<unknown>) => Uint8Array,
): boolean {
  return (
    canCover(r, rule) &&
    periodCovers(r, rule) &&
    sameSkip(r, rule) &&
    (rule.holiday
      ? r.holiday &&
        setCovers(kindsOf(r), kindsOf(rule)) &&
        setCovers(r.keys, rule.keys) &&
        setCovers(r.weekdays, rule.weekdays) &&
        setCovers(r.months, rule.months)
      : rule.dayAfterHoliday || rule.dayBeforeHoliday
        ? r.dayAfterHoliday === rule.dayAfterHoliday &&
          r.dayBeforeHoliday === rule.dayBeforeHoliday &&
          setCovers(kindsOf(r), kindsOf(rule)) &&
          setCovers(r.keys, rule.keys) &&
          setCovers(r.weekdays, rule.weekdays) &&
          setCovers(r.months, rule.months)
        : rule.cycle !== null
          ? r.cycle !== null && cycleCovers(r, rule) && setCovers(r.months, rule.months)
          : rule.businessDays !== null
            ? r.businessDays !== null &&
              r.weekStart === rule.weekStart &&
              r.calendar === rule.calendar &&
              setCovers(r.businessDays, rule.businessDays) &&
              setCovers(r.months, rule.months)
            : !r.holiday &&
              !r.dayAfterHoliday &&
              !r.dayBeforeHoliday &&
              r.businessDays === null &&
              r.cycle === null &&
              intervalCovers(r, rule) &&
              isSubset(bitsOf(rule), bitsOf(r)))
  );
}

/**
 * Reports, per recurring rule in array order: `never-matches` (no matching day; the rule is added to
 * `ctx.unused` and nothing else is reported for it), the `redundant` "over-holiday" option of an own-counting
 * nth-business-day rule when holidays are closed, and `shadowed` (an earlier rule covers it, {@link ruleCovers}).
 * `never-matches` is withheld when `ctx.unsure` says so.
 * @internal
 */
export function reportRecurring<Value, Kind extends string>(ctx: RuleContext<Value, Kind>): void {
  const { c, compiled, unused, unsure, cycle } = ctx;
  const { recurring } = compiled;
  const source = compiled.source as HolidaySource<string>;
  // The matching days in the representative 28 years are computed only when a shadow comparison needs them
  // (each rule judges 10,227 days). ruleCovers asks for them only for weekday and day-of-month rules:
  // nth-business-day rules are compared by shape, never by these days (computing them would evaluate the basis
  // calendar in the representative years, which unjudgeableDays does not cover).
  const bits = new Map<RecurringRuleCompiled<unknown>, Uint8Array>();
  const bitsOf = (r: RecurringRuleCompiled<unknown>): Uint8Array => {
    let b = bits.get(r);
    if (b === undefined) bits.set(r, (b = patternBits(r)));
    return b;
  };
  const kindsOf = createKindsOf(ctx);
  recurring.forEach((rule, j) => {
    // A rule without a day in the diagnostic range is not examined (reported by reportPeriodsOutOfRange)
    if (!inDiagnosticRange(rule.effectiveFrom, rule.effectiveTo)) return;
    const holidayBased = isHolidayBasedRule(rule);
    const businessDayBased = rule.businessDays !== null;
    const matches = holidayBased
      ? holidayRuleMatches(ctx, rule)
      : businessDayBased
        ? businessDayRuleMatches(ctx, rule)
        : matchesAnyDay(rule, cycle);
    if (!matches && !unsure("never-matches", rule.path)) {
      unused.add(rule);
      // kinds "national" written without a provider whose ID is "JP": mention the rename as a possible cause.
      const national =
        holidayBased &&
        source.providers.length > 0 &&
        jpUsage(source) === "none" &&
        rule.kinds?.has(RENAMED_VALUES.find((x) => x.key === "kinds")!.from) === true;
      c.warning(
        "never-matches",
        rule.path,
        (holidayBased
          ? source.providers.length === 0
            ? "This rule matches no day: there are no holidays without a holiday provider"
            : rule.holiday
              ? "This rule matches no day: no holiday of the selected kinds, keys, weekdays and months within its effective period"
              : rule.dayAfterHoliday
                ? "This rule matches no day: no day after a holiday of the selected kinds and keys on the selected weekdays and months within its effective period"
                : "This rule matches no day: no day before a holiday of the selected kinds and keys on the selected weekdays and months within its effective period"
          : businessDayBased
            ? rule.weekStart !== null
              ? "This rule matches no day: no week has that many business days of the counting basis in the selected months within its effective period"
              : "This rule matches no day: no month has that many business days of the counting basis in the selected months within its effective period"
            : rule.effectiveFrom === null && rule.effectiveTo === null
              ? "This rule matches no day (for example, a day that does not exist in the selected months)"
              : "This rule matches no day within its effective period") +
          scopeNote(rule.effectiveFrom, rule.effectiveTo, cycle) +
          (national
            ? '; "national" was renamed to "regular" in 0.30.0 and is not read so without a provider whose ID is "JP"'
            : ""),
      );
      return;
    }
    // "over-holiday" on an own-counting nth-business-day rule changes nothing when holidays are closed.
    if (
      businessDayBased &&
      rule.basis === null &&
      rule.holidayOverlapPolicy === "over-holiday" &&
      typeof compiled.holiday === "object" &&
      "value" in compiled.holiday &&
      compiled.holiday.value === false
    ) {
      c.info(
        "redundant",
        `${rule.path}.holidayOverlapPolicy`,
        'This option does not change the result: holidays are closed (holidayPolicy: "closed"), so an nth business day is never a holiday',
      );
    }
    const k = recurring.findIndex((r, i) => i < j && ruleCovers(r, rule, kindsOf, bitsOf));
    if (k < 0) return;
    unused.add(rule);
    c.warning(
      "shadowed",
      rule.path,
      `This rule is never used: the earlier rule ${recurring[k]!.path} covers all of its days`,
      recurring[k]!.path,
    );
  });
}

/**
 * Reports `counting-basis` (info) for each own-counting nth-business-day rule and each plain weekly weekday rule
 * (no nth, interval or months) that is used, overlaps its effective period and gives that weekday a value
 * different from `closedWeekdays`: the count ignores recurring rules, so that weekday is counted differently
 * from what the rule says. Must run after the steps that fill `ctx.unused`.
 * @internal
 * @see decisions.md #16
 */
export function reportCountingBasis<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
): void {
  const { c, compiled, unused } = ctx;
  const { recurring } = compiled;
  for (const rule of recurring) {
    if (rule.businessDays === null || rule.basis !== null) continue;
    const weeklies = recurring.filter(
      (r) =>
        r.weekday !== null &&
        r.nth === null &&
        r.interval === null &&
        r.months === null &&
        !unused.has(r) &&
        !sameValue(compiled.weekly[r.weekday], r.value) &&
        periodsOverlap(rule, r),
    );
    for (const weekly of weeklies) {
      c.info(
        "counting-basis",
        rule.path,
        weekly.value === true
          ? `The business days are counted without recurring rules, so the days opened by the weekday rule ${weekly.path} are not counted`
          : `The business days are counted without recurring rules, so the weekday rule ${weekly.path} does not reduce the count; ` +
              "write regular closed weekdays as closedWeekdays if they should not be counted",
        weekly.path,
      );
    }
  }
}

/**
 * Reports `no-business-day` (warning, path "") for a business calendar in which no examined day is a business
 * day. Not examined when there is no window or when a specific date opens a day (`openDates`).
 * Examined: the days of `ctx.rulesWindow` judged without specific dates (the dates are finite, so they cannot
 * close every year) and, when date units exist, their days judged with the dates. A day whose judgement throws
 * at an edge or with `holiday-run-too-long` is not a business day.
 * @internal
 * @see decisions.md #17, #24, #30
 */
export function reportNoBusinessDay<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
): void {
  const { c, compiled, window, rulesWindow, dateUnits, lookup } = ctx;
  if (!window || !rulesWindow || compiled.dates.some((r) => r.value === true)) return;
  const noDates = createResolver(without(compiled, null, true), lookup, throwLostShift);
  const withDates = dateUnits.length > 0 ? createResolver(compiled, lookup, throwLostShift) : null;
  const open = (resolve: typeof noDates, n: number): boolean => {
    try {
      return resolve(dateOfDayNumber(n)).day.value === true;
    } catch (error) {
      if (!atEdge(n, error, window) && !isLostShift(error)) throw error;
      return false;
    }
  };
  let found = false;
  eachDay(window, (n) => {
    found =
      (inRanges(rulesWindow.ranges, n) && open(noDates, n)) ||
      (withDates !== null && inRanges(dateUnits, n) && open(withDates, n));
    return found;
  });
  if (!found) {
    c.warning(
      "no-business-day",
      "",
      `No day is a business day with these options (checked ${window.label}); ` +
        "searching for a business day throws",
    );
  }
}

/**
 * All days of the counting units (months and weeks) that contain the given days.
 * @param days - Day numbers.
 * @param countsMonth - Whether a rule counts the business days of a month.
 * @param weekStarts - First weekdays of the weeks counted by week rules.
 * @returns The given days plus, when `countsMonth`, every day of their months and, per week start, the 7 days
 *   of their weeks.
 * @internal
 */
export function countingUnitsOf(
  days: Iterable<number>,
  countsMonth: boolean,
  weekStarts: readonly number[],
): Set<number> {
  const out = new Set<number>();
  for (const n of days) {
    out.add(n);
    if (countsMonth) {
      const { year, month, day } = parseDate(dateOfDayNumber(n));
      for (let k = 0; k < lengthOfMonth(year, month); k++) out.add(n - day + 1 + k);
    }
    for (const start of weekStarts) {
      const first = n - ((weekdayOf(dateOfDayNumber(n)) - start + 7) % 7);
      for (let k = 0; k < 7; k++) out.add(first + k);
    }
  }
  return out;
}

/**
 * Marks a day whose judgement throws.
 * @internal
 */
export const FAILED = Symbol("failed");

/**
 * Memoized judgement: day number → value, or {@link FAILED} when the judgement throws. Each day is judged once.
 * @internal
 */
export function originalOf<Value, Kind extends string>(
  resolve: Resolver<Value, Kind>,
): (n: number) => unknown {
  const values = new Map<number, unknown>();
  return (n) => {
    if (!values.has(n)) {
      let value: unknown;
      try {
        value = resolve(dateOfDayNumber(n)).day.value;
      } catch {
        value = FAILED;
      }
      values.set(n, value);
    }
    return values.get(n);
  };
}

/**
 * Whether removing `rule` from `base` leaves the result of every day in `days` unchanged.
 * @param ctx - The context.
 * @param rule - The rule to remove.
 * @param base - Compiled options that contain the rule.
 * @param days - Day numbers to compare.
 * @param original - Result of `base` per day (a value or {@link FAILED}).
 * @param split - true to judge with {@link resolverIn} (annual and recurring rules); false to keep every
 *   specific date (specific dates).
 * @returns false as soon as a day differs: different values ({@link sameValue}); a day that throws on one side
 *   only (throwing on both sides is "unchanged"); or, with unconfirmedHolidayPolicy "throw", a day on which only
 *   one side throws `unconfirmed-holiday` when judged with the options' own policy.
 * @internal
 * @see decisions.md #17, #31
 */
export function removalKeeps<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
  rule: DecidingRule<Value>,
  base: CompiledSchedule<Value, Kind>,
  days: Iterable<number>,
  original: (n: number) => unknown,
  split = false,
): boolean {
  const { lookup, strictLookup } = ctx;
  const make = (b: CompiledSchedule<Value, Kind>, using: Lookup<Kind>): Resolver<Value, Kind> =>
    split ? resolverIn(ctx, b, using) : createResolver(b, using, throwLostShift);
  const resolve = make(without(base, rule, false), lookup);
  const strictAfter = strictLookup ? make(without(base, rule, false), strictLookup) : null;
  const strictBefore = strictLookup ? make(base, strictLookup) : null;
  const throwsUnconfirmed = (r: Resolver<Value, Kind>, n: number): boolean => {
    try {
      r(dateOfDayNumber(n));
      return false;
    } catch (error) {
      return (error as { code?: unknown }).code === "unconfirmed-holiday";
    }
  };
  for (const n of days) {
    let value: unknown;
    try {
      value = resolve(dateOfDayNumber(n)).day.value;
    } catch {
      value = FAILED;
    }
    const before = original(n);
    if (value === FAILED || before === FAILED) {
      if (value !== before) return false;
    } else if (!sameValue(before, value)) return false;
    if (
      strictAfter &&
      strictBefore &&
      throwsUnconfirmed(strictBefore, n) !== throwsUnconfirmed(strictAfter, n)
    )
      return false;
  }
  return true;
}

/**
 * Path of the single rule that decides all the given days.
 * @param resolve - Resolver of the options with every reported rule removed.
 * @param days - Day numbers.
 * @returns The path when one rule decides every day; undefined when different rules, a weekday or the holiday
 *   handling decide some of them, when a day throws, or when `days` is empty.
 * @internal
 */
export function relatedPathOf<Value, Kind extends string>(
  resolve: Resolver<Value, Kind>,
  days: readonly number[],
): string | undefined {
  const paths = new Set<string | null>();
  for (const n of days) {
    try {
      paths.add(resolve(dateOfDayNumber(n)).rule?.path ?? null);
    } catch {
      paths.add(null);
    }
  }
  const [only] = paths;
  return paths.size === 1 && only !== null ? only : undefined;
}

/**
 * The counting units of the nth-business-day rules that count on the own options.
 * @param recurring - Recurring rules.
 * @returns `counts`: whether such a rule exists; `of(days)`: {@link countingUnitsOf} for the months and week
 *   starts those rules count (with such rules, specific dates and annual dates change the count, so removing one
 *   can change other days of the same month or week).
 * @internal
 */
export function ownCountingUnits(recurring: readonly RecurringRuleCompiled<unknown>[]): {
  readonly counts: boolean;
  readonly of: (days: Iterable<number>) => Set<number>;
} {
  const counting = recurring.filter((r) => r.businessDays !== null && r.calendar === null);
  const countsMonth = counting.some((r) => r.weekStart === null);
  const weekStarts = [
    ...new Set(counting.flatMap((r) => (r.weekStart === null ? [] : [r.weekStart]))),
  ];
  return {
    counts: counting.length > 0,
    of: (days) => countingUnitsOf(days, countsMonth, weekStarts),
  };
}

/**
 * A removal that changes no result: the message, the days the rule decided, and the days whose deciding rule
 * may have changed.
 * @internal
 */
export interface Removal {
  readonly message: string;
  readonly decided: readonly number[];
  readonly affected: Iterable<number>;
}

/**
 * Judges whether a specific date can be removed from `base` without changing a result.
 * @param ctx - The context.
 * @param rule - The specific date.
 * @param base - The options without the rules reported so far (with specific dates).
 * @param units - Result of {@link ownCountingUnits}.
 * @returns The removal, or undefined when no day of the period can be judged or a result changes. Only the
 *   part of the period in the diagnostic range is examined (precondition: it has such a day). Compared on the
 *   days the rule decides; with own-counting rules, on the counting units of its period.
 * @internal
 */
export function dateRemoval<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
  rule: DateRule<Value>,
  base: CompiledSchedule<Value, Kind>,
  units: ReturnType<typeof ownCountingUnits>,
): Removal | undefined {
  const period = inDiagnosticRange(rule.from, rule.to)!;
  const resolve = createResolver(base, ctx.lookup, throwLostShift);
  const decided: number[] = [];
  const span: number[] = [];
  let checked = 0;
  for (let n = period.from; n <= period.to; n++) {
    span.push(n);
    let decidedBy: DecidingRule<Value> | null;
    try {
      decidedBy = resolve(dateOfDayNumber(n)).rule;
    } catch {
      continue;
    }
    checked++;
    if (decidedBy === rule) decided.push(n);
  }
  // The original result of a day the rule decides is the rule's value, so it is not judged again.
  const ok = units.counts
    ? removalKeeps(ctx, rule, base, units.of(span), originalOf(resolve))
    : removalKeeps(ctx, rule, base, decided, () => rule.value);
  if (checked === 0 || !ok) return undefined;
  return {
    message:
      (decided.length === 0
        ? "This rule is never used: earlier rules cover all of its days"
        : "Removing this rule does not change any result") + scopeNote(rule.from, rule.to),
    decided,
    affected: units.counts ? units.of(span) : [],
  };
}

/**
 * Judges whether an annual date or recurring rule can be removed from `base` without changing a result.
 * @param ctx - The context.
 * @param rule - The rule.
 * @param base - The options without the rules reported so far.
 * @param days - Days of the window the rule decides in `base`.
 * @param checkedDays - Days to compare: `days` itself, or the counting units of an annual date.
 * @param original - Results before any removal (used when `checkedDays` is not `days`; on `days` the original
 *   result is the rule's value).
 * @param label - Years of the window, for the message.
 * @returns The removal, or undefined when a result changes.
 * @internal
 */
export function ruleRemoval<Value, Kind extends string>(
  ctx: RuleContext<Value, Kind>,
  rule: DecidingRule<Value>,
  base: CompiledSchedule<Value, Kind>,
  days: readonly number[],
  checkedDays: Iterable<number>,
  original: (n: number) => unknown,
  label: string,
): Removal | undefined {
  const ok =
    checkedDays === days
      ? removalKeeps(ctx, rule, base, days, () => rule.value, true)
      : removalKeeps(ctx, rule, base, checkedDays, original, true);
  if (!ok) return undefined;
  return {
    message:
      days.length === 0
        ? `This rule is never used: other rules decide every day it matches (checked ${label})`
        : `Removing this rule does not change any result (checked ${label})`,
    decided: days,
    affected: [...days, ...checkedDays],
  };
}

/**
 * Reports `redundant` (info) for rules whose removal changes no result, so that all reported rules can be
 * removed together. Sequential removal: the rules in `ctx.unused` are removed first; then annual dates and
 * recurring rules in array order, then specific dates, are judged one at a time against the options without the
 * rules reported so far; the pass repeats until nothing more can be removed. Reported in the order specific
 * dates, annual dates, recurring rules.
 * - Annual and recurring rules: compared on the days they decide in `ctx.window` (an annual date with
 *   own-counting rules: on its counting units), judged with {@link resolverIn}.
 * - Specific dates: compared on the part of their period in the diagnostic range (with own-counting rules: on
 *   the counting units of that part); never reported when no day of that part can be judged.
 * - Rules for which `ctx.unsure("redundant", path)` holds are not judged.
 * `relatedPath` is {@link relatedPathOf} of the days the rule decided.
 * @throws InternalError when the removal does not converge.
 * @internal
 * @see decisions.md #16, #31
 */
export function reportRedundant<Value, Kind extends string>(ctx: RuleContext<Value, Kind>): void {
  const { c, compiled, window, unused, unsure } = ctx;
  const { dates, annual, recurring } = compiled;
  const units = ownCountingUnits(recurring);
  const counts = units.counts;
  const countingUnits = units.of;

  /** Reported rules, with the days each decided at that time (for relatedPath). */
  const reported = new Map<
    DecidingRule<Value>,
    { readonly message: string; readonly decided: readonly number[] }
  >();
  const gone = (r: DecidingRule<Value>): boolean => unused.has(r) || reported.has(r);
  /** The options without the rules reported so far (without any specific date when keepDates is false). */
  const current = (keepDates: boolean): CompiledSchedule<Value, Kind> => ({
    ...compiled,
    dates: keepDates ? dates.filter((r) => !gone(r)) : [],
    annual: annual.filter((r) => !gone(r)),
    recurring: recurring.filter((r) => !gone(r)),
  });
  /** Days that the last removal may have changed (set by the judging function). */
  let affected: Iterable<number> = [];

  const judgeDate = (rule: DateRule<Value>): boolean => {
    const removal = dateRemoval(ctx, rule, current(true), units);
    if (!removal) return false;
    affected = removal.affected;
    reported.set(rule, removal);
    return true;
  };

  const candidates = window
    ? [...annual, ...recurring].filter((r) => !unused.has(r) && !unsure("redundant", r.path))
    : [];
  /** Days of the window each candidate decides in the current options; updated after each removal. */
  let decided: Map<DecidingRule<Value>, Set<number>> | undefined;
  /** Days that could not be judged when `decided` was computed; no rule decides them and they are not re-judged. */
  const unjudged = new Set<number>();
  const decidedIn = (rule: DecidingRule<Value>): Set<number> => {
    if (!decided && window) {
      const map = new Map<DecidingRule<Value>, Set<number>>(candidates.map((r) => [r, new Set()]));
      const resolveNow = resolverIn(ctx, current(counts));
      eachDay(window, (n) => {
        let by: DecidingRule<Value> | null;
        try {
          by = resolveNow(dateOfDayNumber(n)).rule;
        } catch {
          unjudged.add(n);
          return;
        }
        if (by) map.get(by)?.add(n);
      });
      decided = map;
    }
    return decided?.get(rule) ?? new Set();
  };
  // Re-judges the deciding rule of the days a removal may have changed. These days did not throw in the
  // removalKeeps call that allowed the removal (a throwing day counts as changed), so judging them here does not
  // throw. Days that could not be judged at first stay unjudged: the promise covers only days that can be judged
  // before the removal.
  const refresh = (days: Iterable<number>): void => {
    if (!decided || !window) return;
    const resolveNow = resolverIn(ctx, current(counts));
    for (const n of days) {
      if (!inRanges(window.ranges, n) || unjudged.has(n)) continue;
      for (const set of decided.values()) set.delete(n);
      const by = resolveNow(dateOfDayNumber(n)).rule;
      if (by) decided.get(by)?.add(n);
    }
  };
  // Results of the options before any removal by this step. A removal does not change the result of an examined
  // day, and other days do not depend on the removed rule, so the same memo stays valid.
  const originalNow = originalOf(resolverIn(ctx, current(counts)));
  const unitsOf = new Map<AnnualRule<Value>, Set<number>>();
  const annualUnits = (rule: AnnualRule<Value>): Set<number> => {
    const known = unitsOf.get(rule);
    if (known) return known;
    const matched: number[] = [];
    if (window)
      eachDay(window, (n) => {
        if (matchMonthDay(rule, dateOfDayNumber(n).slice(5))) matched.push(n);
      });
    const units = countingUnits(matched);
    unitsOf.set(rule, units);
    return units;
  };
  const judgeRule = (rule: DecidingRule<Value>): boolean => {
    if (!window) return false;
    const days = [...decidedIn(rule)];
    const removal = ruleRemoval(
      ctx,
      rule,
      current(counts),
      days,
      counts && annual.includes(rule as AnnualRule<Value>)
        ? annualUnits(rule as AnnualRule<Value>)
        : days,
      originalNow,
      window.label,
    );
    if (!removal) return false;
    affected = removal.affected;
    reported.set(rule, removal);
    return true;
  };

  // A pass that removes nothing ends the loop, so there are at most (candidates + dates + 1) passes. A rule
  // judged since the last removal is skipped: judging it again with the same options gives the same answer.
  const maxPasses = candidates.length + dates.length + 1;
  let version = 0;
  const judgedAt = new Map<DecidingRule<Value>, number>();
  const judge = (rule: DecidingRule<Value>, run: (r: DecidingRule<Value>) => boolean): void => {
    if (gone(rule) || judgedAt.get(rule) === version) return;
    judgedAt.set(rule, version);
    if (!run(rule)) return;
    version++;
    refresh(affected);
  };
  for (let passes = 0, before = -1; before !== version;) {
    if (++passes > maxPasses)
      throw internalError("redundant: the sequential removal did not converge");
    before = version;
    for (const rule of candidates) judge(rule, judgeRule);
    for (const rule of dates)
      if (!unsure("redundant", rule.path)) judge(rule, (r) => judgeDate(r as DateRule<Value>));
  }
  if (reported.size === 0) return;
  const resolveFinal = resolverIn(ctx, current(true));
  for (const rule of [...dates, ...candidates]) {
    const found = reported.get(rule);
    if (found)
      c.info("redundant", rule.path, found.message, relatedPathOf(resolveFinal, found.decided));
  }
}

/**
 * Runs the steps of the rule diagnostics in a fixed order (the order of the issues): provider data errors
 * (stops there), `holiday-run-too-long`, specific dates, effective periods out of range, shadowed annual dates,
 * recurring rules, `counting-basis`, `no-business-day` (calendars only), `redundant`.
 * Guarantees, both about the days of the diagnostic range ({@link DIAGNOSTIC_YEARS}): (1) removing all reported
 * `shadowed`, `never-matches`, `redundant` and "never used" `out-of-range` rules together changes no result on
 * a day of the range that could be judged before the removal; (2) `no-business-day` is reported only when no
 * day of the range is a business day. Rules and dates without a day in the range are not examined (they get an
 * `out-of-range` warning) and nothing is said about days outside the range.
 * @param c - Receives the issues.
 * @param compiled - Compiled options (bases guarded).
 * @param isCalendar - true for a business calendar.
 * @param unsure - Predicate of {@link unsureOf}; such diagnostics are not reported and the rules are not removed.
 * @internal
 * @see decisions.md #16, #17, #30, #31
 */
export function analyzeRules<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
  isCalendar: boolean,
  unsure: (code: string, path: string) => boolean = () => false,
): void {
  if (!checkProviderData(c, compiled.source as HolidaySource<string>)) return;
  const ctx = createRuleContext(c, compiled, unsure);
  checkLostShifts(c, compiled, ctx.lookup, ctx.rulesWindow);
  reportDateIssues(ctx);
  reportPeriodsOutOfRange(ctx);
  reportShadowedAnnual(ctx);
  reportRecurring(ctx);
  reportCountingBasis(ctx);
  if (isCalendar) reportNoBusinessDay(ctx);
  reportRedundant(ctx);
}

/**
 * Options of the diagnostics (second argument).
 * @public
 */
export interface DiagnoseOptions {
  /**
   * Reference date "YYYY-MM-DD". When given, rules and dates that ended before this day (effectiveTo of an
   * effective period, the end of a specific date or period) are returned as info `expired` (candidates for
   * tidying up). Not returned when omitted (the current time is never used, to keep the result deterministic)
   */
  readonly asOf?: DateString;
}

/**
 * Validates the second argument of the diagnose functions. Unknown keys are ignored.
 * @param options - undefined, or an object with an optional `asOf` date string.
 * @returns `asOf` as a day number, or null when not given.
 * @throws RangeError `invalid-argument` when not an object; `invalid-date` when `asOf` is not "YYYY-MM-DD".
 * @internal
 */
export function compileDiagnoseOptions(options: unknown): { asOf: number | null } {
  if (options === undefined) return { asOf: null };
  if (!isOptionsObject(options)) {
    throw rangeError(
      "invalid-argument",
      "the second argument must be an object of diagnose options",
    );
  }
  const asOf = (options as { asOf?: unknown }).asOf;
  if (asOf === undefined) return { asOf: null };
  if (!isValidDate(asOf)) {
    throw rangeError(
      "invalid-date",
      `asOf must be a date string "YYYY-MM-DD": ${describeValue(asOf)}`,
    );
  }
  return { asOf: dayNumberOf(asOf) };
}

/**
 * Reports, as `expired` info, every specific date and every rule with `effectiveTo` that ended before `asOf`.
 * Compares day numbers only; holidays are not looked up. The end is moved later when the item can still affect
 * results: with own-counting month rules to the end of the month, with own-counting week rules by 6 days
 * (specific dates and annual dates), and by MAX_HOLIDAY_RUN days for "after-holiday" rules.
 * @param c - Receives the issues.
 * @param compiled - Compiled options.
 * @param asOf - Reference day number; an item ending on it is not expired.
 * @internal
 * @see decisions.md #13, #16, #30
 */
export function checkExpired<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
  asOf: number,
): void {
  /**
   * Reports `expired` for `path` when `reach` (the last day the item can affect; defaults to `last`) is before
   * `asOf`.
   */
  const ended = (path: string, last: number, what: string, reach = last, why = ""): void => {
    if (reach < asOf) {
      const until =
        reach > last ? ` (it could affect results until ${dateOfDayNumber(reach)}: ${why})` : "";
      c.info(
        "expired",
        path,
        `This ${what} ended on ${dateOfDayNumber(last)}${until}, before ${dateOfDayNumber(asOf)}; it no longer affects results and can be removed if the past need not be reproduced`,
      );
    }
  };
  // With rules that count nth business days on the own options (decisions.md #16), specific dates and annual
  // month-days change the count, so after their last day they can still affect the results of the month of
  // that day (month rules) and of the 6 days after it (week rules) (on the safe side; no holiday lookup)
  const counting = compiled.recurring.filter((r) => r.businessDays !== null && r.basis === null);
  const byMonth = counting.some((r) => r.weekStart === null);
  const byWeek = counting.some((r) => r.weekStart !== null);
  /**
   * Last day a date ending on `last` can change the count of own-counting rules.
   */
  const countedReach = (last: number): number => {
    let reach = last;
    if (byMonth) {
      const { year, month } = parseDate(dateOfDayNumber(last));
      reach = dayNumberOf(formatDate(year, month, lengthOfMonth(year, month)));
    }
    return byWeek ? Math.max(reach, last + 6) : reach;
  };
  const COUNTED = "a rule counting the business days of a month or week counts it";
  for (const r of compiled.dates) ended(r.path, r.to, "date", countedReach(r.to), COUNTED);
  for (const r of compiled.annual)
    if (r.effectiveTo !== null)
      ended(r.path, r.effectiveTo, "rule", countedReach(r.effectiveTo), COUNTED);
  // An "after-holiday" rule judges its effective period on the original day (decisions.md #13), so a day it
  // moved to can lie after the last day. To avoid looking up holidays, the farthest day a move can reach
  // (MAX_HOLIDAY_RUN days later) is taken as the end (on the safe side. decisions.md #30).
  // Recurring rules are not part of the basis of counting rules (the options without recurring rules), so they
  // do not change the count
  for (const r of compiled.recurring)
    if (r.effectiveTo !== null)
      ended(
        r.path,
        r.effectiveTo,
        "rule",
        r.holidayOverlapPolicy === "after-holiday"
          ? r.effectiveTo + MAX_HOLIDAY_RUN
          : r.effectiveTo,
        `a day moved by "after-holiday" falls at most ${MAX_HOLIDAY_RUN} days after it`,
      );
}

/**
 * Reports unconfirmedHolidayPolicy "throw" as `redundant` info when it cannot change a result: there is no
 * provider, or the results do not depend on holidays (`resultIgnoresHolidays`).
 * @param c - Receives the issue (path "unconfirmedHolidayPolicy").
 * @param compiled - Compiled options.
 * @internal
 */
export function checkUnconfirmedOption<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
): void {
  if (compiled.source.unconfirmedHolidayPolicy !== "throw") return;
  const noProvider = compiled.source.providers.length === 0;
  const holidayUnused = resultIgnoresHolidays(compiled);
  if (!noProvider && !holidayUnused) return;
  c.info(
    "redundant",
    "unconfirmedHolidayPolicy",
    noProvider
      ? 'unconfirmedHolidayPolicy: "throw" has no effect: there is no holiday provider'
      : `unconfirmedHolidayPolicy: "throw" has no effect on results: holidays are not used (holidayPolicy: "ignore" and no holiday-based, "after-holiday" or "over-holiday" rule); dayInfoOn still throws when it looks up the holiday to report`,
  );
}

/**
 * Runs all diagnostics on compiled options and builds the public result.
 * @param c - Collector holding the validation issues.
 * @param compiled - Compiled options, or undefined when compilation failed.
 * @param isCalendar - true for a business calendar.
 * @param asOf - Day number for `expired`, or null.
 * @returns Frozen diagnostics. With validation errors, only those. Otherwise `expired`, the
 *   unconfirmedHolidayPolicy check and the rule diagnostics; if a provider throws during the rule diagnostics,
 *   their partial issues are replaced by one error at "holidayProvider" (`out-of-range` or `invalid-provider-data`).
 *   Adds "did you mean" suggestions to unknown-key messages.
 * @throws InternalError on a defect of the diagnostics themselves.
 * @internal
 */
export function run<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind> | undefined,
  isCalendar: boolean,
  asOf: number | null,
): readonly Diagnostic[] {
  if (compiled && !c.hasErrors) {
    if (asOf !== null) checkExpired(c, compiled, asOf);
    checkUnconfirmedOption(c, compiled);
    const before = c.issues.length;
    try {
      analyze(c, compiled, isCalendar);
    } catch (error) {
      // A defect would be hidden if reported as a provider error, so it is rethrown
      if (error instanceof InternalError) throw error;
      // The intermediate results of the diagnostics between rules cannot be trusted after a provider error and
      // are discarded
      c.issues.length = before;
      const code = (error as { code?: unknown } | null)?.code;
      c.error(
        code === "out-of-range" ? "out-of-range" : "invalid-provider-data",
        "holidayProvider",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return Object.freeze(
    c.issues.map(({ unknownKey, knownKeys, nationalInUnion, ...issue }) => {
      if (nationalInUnion) {
        const { from, to } = RENAMED_VALUES.find((r) => r.key === "kinds")!;
        issue.message += `; here it matches Japan's "${to}" and other providers' "${from}" holidays. From 1.0.0 it is an invalid-option with a "JP" provider: wrap the Japanese provider and rename your own "${from}" kind (see the migration guide)`;
      }
      const suggestion =
        unknownKey === undefined || knownKeys === undefined
          ? undefined
          : closestKey(unknownKey, knownKeys);
      if (suggestion !== undefined) {
        issue.message += ` (did you mean ${JSON.stringify(suggestion)}?)`;
      }
      return Object.freeze(issue) as Diagnostic;
    }),
  );
}

/**
 * Diagnoses business-calendar options.
 * @param options - Calendar options; values of the wrong type are accepted and reported.
 * @param diagnoseOptions - `{ asOf }` to report rules that ended before that date.
 * @returns The problems found, in a frozen array (empty when there is none). With an `error`, the relations
 *   between rules (`shadowed`, `redundant`, ...) are not examined.
 * @throws RangeError for an invalid second argument (`invalid-argument`, `invalid-date`). Problems in `options`
 *   never throw.
 * @public
 */
export function diagnoseCalendar(
  options: CalendarOptions | object = {},
  diagnoseOptions?: DiagnoseOptions,
): readonly Diagnostic[] {
  const { asOf } = compileDiagnoseOptions(diagnoseOptions);
  const c = new IssueCollector();
  const compiled = compileCalendarOptions<string>(c, options);
  return run(c, compiled?.schedule, true, asOf);
}

/**
 * Diagnoses schedule options.
 * @param options - Schedule options; values of the wrong type are accepted and reported.
 * @param diagnoseOptions - `{ asOf }` to report rules that ended before that date.
 * @returns The problems found, in a frozen array (empty when there is none). Values are compared by content
 *   for arrays and plain objects and by Object.is otherwise. With an `error`, the relations between rules are
 *   not examined.
 * @throws RangeError for an invalid second argument (`invalid-argument`, `invalid-date`). Problems in `options`
 *   never throw.
 * @public
 */
export function diagnoseSchedule(
  options: ScheduleOptions<unknown> | object,
  diagnoseOptions?: DiagnoseOptions,
): readonly Diagnostic[] {
  const { asOf } = compileDiagnoseOptions(diagnoseOptions);
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<unknown, string>(c, options);
  return run(c, compiled, false, asOf);
}
