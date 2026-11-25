// The catalog of rules and options (T2 of the test expansion plan). The random tests, the oracle and the
// generator of result-compare build their options from here.
// test/tools/catalog.test.ts checks that every option key, rule shape and choice value of the public types
// (etc/api.md) is here or excluded with a reason. A new rule shape or key is added here too (otherwise pnpm check
// stops).
// Narrowing the candidate values makes test/tools/generator-features.test.ts stop with "does not produce a
// feature the previous version's generator produced".

/**
 * mulberry32: reproducible random numbers decided by a seed (no new dependency; RELEASING.md, reasons for the
 * quality mechanisms, "add no dependency")
 */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Obj = Record<string, unknown>;

/** Tools for picking values with random numbers */
export interface Picker {
  readonly rand: () => number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** 1 to max distinct items */
  some<T>(items: readonly T[], max: number): T[];
}

export function picker(rand: () => number): Picker {
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  return {
    rand,
    int,
    chance: (p) => rand() < p,
    pick: (items) => items[int(0, items.length - 1)]!,
    some: (items, max) => {
      const pool = [...items];
      const n = int(1, Math.min(max, pool.length));
      return Array.from({ length: n }, () => pool.splice(int(0, pool.length - 1), 1)[0]!);
    },
  };
}

/** The context of generation (the values per caller are in CONTEXTS) */
export interface Context {
  /**
   * Whether rules that depend on holidays are made (holiday, day after, day before) (meaningful only with a
   * provider)
   */
  readonly holidays: boolean;
  /** Candidate holiday kinds and keys (matching the provider; values the provider lacks may be mixed in) */
  readonly kinds: readonly string[];
  readonly keys: readonly string[];
  /** The range of years for candidate dates (anchors, specific dates) */
  readonly years: readonly [from: number, to: number];
  /** The range of years for the start of an effective period (the end is up to 400 days after the start) */
  readonly effectiveYears: readonly [from: number, to: number];
  /**
   * Whether the shape that came in 0.30.0 is made (nth business day of a week) (not when comparing with a
   * version from before the rename)
   */
  readonly newShapes: boolean;
  /**
   * Whether rules with a wrong input are mixed in (an anchor on another weekday, skipped weekdays that include
   * the rule's own) (to compare error codes with the previous version)
   */
  readonly invalid: boolean;
  /**
   * Whether specific dates are also made as periods of months to decades, periods of more than 200 years, periods
   * from 1000-01-01 and periods to 9999-12-31, besides periods of up to 21 days (0.32.8; to make dates outside
   * the scan range in which the diagnostics examine rules against each other (2001-2028 without a provider) and
   * long dates covering the range; the years come from `years`). Omission makes none (the random sequence of
   * the existing contexts does not change)
   */
  readonly wideDates?: boolean;
}

/**
 * The mark of a rule the generator made wrong on purpose (creation gives invalid-option). The mark is on the
 * rule object; the option keys do not change. result-compare tells a failed creation of options with a marked
 * rule ("an intended wrong input") from one without ("options that unintentionally failed to be created") (not
 * by error code, so that an unintended failure with the same code is still recognised)
 */
const INTENDED_INVALID = new WeakSet<object>();
const markInvalid = (rule: Obj): Obj => {
  INTENDED_INVALID.add(rule);
  return rule;
};
/** Whether a rule has the mark of an intended wrong input */
export const isIntendedInvalid = (rule: unknown): boolean =>
  typeof rule === "object" && rule !== null && INTENDED_INVALID.has(rule);

/** The contexts of the callers. The reachability of the generator (test/tools/catalog.test.ts) is checked per context listed here */
export const CONTEXTS = {
  /** test/properties.test.ts (the Japanese provider) */
  properties: {
    holidays: true,
    kinds: ["regular", "substitute", "citizens"],
    keys: ["new-year", "vernal-equinox", "culture"],
    years: [2026, 2026],
    effectiveYears: [2026, 2027],
    newShapes: true,
    invalid: false,
  },
  /** test/diagnose-properties.test.ts (a home-made provider with few supported years; kinds it lacks are mixed in) */
  "diagnose-properties": {
    holidays: true,
    kinds: ["regular", "substitute", "citizens", "x"],
    keys: ["new-year", "b", "mon", "xmas"],
    years: [2026, 2026],
    effectiveYears: [2026, 2031],
    newShapes: true,
    invalid: false,
  },
  /** test/diagnose-properties.test.ts (no provider) */
  "diagnose-properties（提供元なし）": {
    holidays: false,
    kinds: [],
    keys: [],
    years: [2026, 2026],
    effectiveYears: [2026, 2031],
    newShapes: true,
    invalid: false,
  },
  /**
   * test/diagnose-properties.test.ts (0.32.8: long specific dates and effective periods outside the scan range
   * (2001-2028) and covering it; a home-made provider with few supported years, and no provider (the caller
   * removes holidays))
   */
  "diagnose-properties（範囲の外と長い日付）": {
    holidays: true,
    kinds: ["regular", "substitute", "citizens", "x"],
    keys: ["new-year", "b", "mon", "xmas"],
    years: [1990, 2060],
    effectiveYears: [1990, 2060],
    newShapes: true,
    invalid: false,
    wideDates: true,
  },
  /**
   * test/diagnose-properties.test.ts (0.32.8: the Japanese provider with outOfRangePolicy: "throw" and
   * unconfirmedHolidayPolicy: "throw". Dates and effective periods are also made near both ends of the supported
   * years (1955-2099) and in unconfirmed years (after confirmedThrough))
   */
  "diagnose-properties（日本・throw）": {
    holidays: true,
    kinds: ["regular", "substitute", "citizens", "x"],
    keys: ["new-year", "vernal-equinox", "autumnal-equinox", "culture"],
    years: [1950, 2105],
    effectiveYears: [1950, 2105],
    newShapes: true,
    invalid: false,
    wideDates: true,
  },
  /** test/diagnose-properties.test.ts (scans the whole range of the Japanese provider) */
  "diagnose-properties（日本の全範囲）": {
    holidays: true,
    kinds: ["regular", "substitute", "citizens", "x"],
    keys: ["new-year", "vernal-equinox", "culture"],
    years: [2026, 2026],
    effectiveYears: [2026, 2031],
    newShapes: true,
    invalid: false,
  },
  /**
   * scripts/promise-inventory.ts (the promise inventory). The caller chooses the years of dates and effective
   * periods per options (inside, across and outside the diagnostic range) and whether long dates are made; the
   * years here are those of the reachability check of the generator
   */
  "promise-inventory": {
    holidays: true,
    kinds: ["regular", "substitute", "x"],
    keys: ["new-year", "christmas-day"],
    years: [1955, 2099],
    effectiveYears: [1955, 2099],
    newShapes: true,
    invalid: false,
  },
  /** scripts/result-compare.ts (comparison with the previous version; with providers) */
  "result-compare": {
    holidays: true,
    kinds: ["national", "regular", "substitute", "citizens", "special"],
    keys: [
      "new-year",
      "christmas",
      "boxing-day",
      "labor-thanksgiving",
      "culture",
      "spring",
      "easter-monday",
      "labour-day",
      "national-day",
      "st-andrews",
    ],
    years: [2021, 2026],
    effectiveYears: [2021, 2026],
    newShapes: true,
    invalid: true,
  },
} as const satisfies Record<string, Context>;

/** Variants of a context (no provider for result-compare; comparison with a version from before the rename) */
export const withoutHolidays = (ctx: Context): Context => ({ ...ctx, holidays: false });
export const beforeRename = (ctx: Context): Context => ({ ...ctx, newShapes: false });

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** A rule shape (one per name of a public type). `make` builds a rule with the keys the shape can have, by chance */
export interface Shape {
  /** The type name in etc/api.md */
  readonly pattern: string;
  /** The key that identifies the shape */
  readonly discriminator: string;
  /** The keys given to a rule of this shape (compared with the keys of the public type that are not never) */
  readonly keys: readonly string[];
  /** Keys given only in rules of schedules (the calendar used as counting basis) */
  readonly scheduleKeys?: readonly string[];
  /** Whether the shape depends on holidays */
  readonly holiday?: boolean;
  /** Whether the shape came in 0.30.0 */
  readonly sinceRename?: boolean;
  make(p: Picker, ctx: Context): Obj;
}

/** What happens when the rule falls on a holiday (`values` are the values the shape accepts) */
const overlap = (p: Picker, rule: Obj, values: readonly string[]): void => {
  if (p.chance(0.5)) rule["holidayOverlapPolicy"] = p.pick(values);
};
/**
 * The skipped weekdays with "after-holiday" (`own` is the weekday of a weekday rule; including it would be
 * invalid-option, so it is left out)
 */
const skipWeekdays = (p: Picker, own?: number): number[] => {
  const pool = [0, 6, 3].filter((d) => d !== own);
  return p.some(pool, 2);
};
/** The month filter (common combinations are mixed in, so that rules overlap easily) */
const months = (p: Picker, rule: Obj): void => {
  if (p.chance(0.5))
    rule["months"] = p.chance(0.6)
      ? [...p.pick([[2], [1, 2], [4], [2, 4, 6, 9, 11]])]
      : p.some(MONTHS, 5);
};
/** The weekday filter of a holiday rule (the common forms weekdays, Saturday and weekend are mixed in) */
const weekdays = (p: Picker): number[] =>
  p.chance(0.5) ? [...p.pick([[1, 2, 3, 4, 5], [6], [0, 6]])] : p.some(WEEKDAYS, 3);
const holidayFilters = (p: Picker, rule: Obj, ctx: Context): void => {
  if (p.chance(0.5)) rule["kinds"] = p.some(ctx.kinds, 2);
  if (p.chance(0.2) && ctx.keys.length > 0) rule["keys"] = p.some(ctx.keys, 3);
  if (p.chance(0.4)) rule["weekdays"] = weekdays(p);
  months(p, rule);
};
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
/** A date in the context's range of years */
const date = (p: Picker, years: readonly [number, number]): string => {
  const from = Date.UTC(years[0], 0, 1);
  return iso(
    from +
      p.int(0, Math.round((Date.UTC(years[1] + 1, 0, 1) - from) / 86_400_000) - 1) * 86_400_000,
  );
};

export const SHAPES: readonly Shape[] = [
  {
    pattern: "WeekdayPattern",
    discriminator: "weekday",
    keys: [
      "weekday",
      "nth",
      "interval",
      "anchor",
      "months",
      "holidayOverlapPolicy",
      "skipWeekdays",
    ],
    make: (p, ctx) => {
      const weekday = p.int(0, 6);
      const rule: Obj = { weekday };
      if (p.chance(0.4))
        rule["nth"] = p.chance(0.5) ? p.pick([1, 2, 3, 4, 5, -1]) : p.some([1, 2, 3, 4, 5, -1], 2);
      else if (p.chance(0.35)) {
        rule["interval"] = p.pick([2, 3, 4]);
        // The anchor is on the rule's weekday (a context that mixes in mistakes also makes one that is not)
        const anchor = Date.parse(`${date(p, ctx.years)}T00:00:00Z`);
        const shift = ctx.invalid && p.chance(0.2) ? p.int(1, 6) : 0;
        const day = new Date(anchor).getUTCDay();
        rule["anchor"] = iso(anchor + (((weekday - day + 7) % 7) + shift) * 86_400_000);
        if (shift > 0) markInvalid(rule);
      }
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday", "after-holiday"]);
      if (rule["holidayOverlapPolicy"] === "after-holiday" && p.chance(0.4))
        rule["skipWeekdays"] = skipWeekdays(p, weekday);
      // A context that mixes in mistakes also makes skipped weekdays that include the rule's own (invalid-option)
      if (ctx.invalid && p.chance(0.1)) {
        rule["holidayOverlapPolicy"] = "after-holiday";
        rule["skipWeekdays"] = [weekday, ...(p.chance(0.5) ? [weekday === 0 ? 6 : 0] : [])];
        markInvalid(rule);
      }
      return rule;
    },
  },
  {
    pattern: "DayOfMonthPattern",
    discriminator: "dayOfMonth",
    keys: ["dayOfMonth", "months", "holidayOverlapPolicy", "skipWeekdays"],
    make: (p) => {
      const rule: Obj = {
        dayOfMonth: p.chance(0.5)
          ? p.pick([1, 5, 7, 10, 15, 20, 25, 28, 29, 30, 31, -1])
          : p.some([1, 2, 3, 4, 5, 6, 7, 10, 20, 30, 31, -1], 7),
      };
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday", "after-holiday"]);
      if (rule["holidayOverlapPolicy"] === "after-holiday" && p.chance(0.4))
        rule["skipWeekdays"] = skipWeekdays(p);
      return rule;
    },
  },
  {
    pattern: "BusinessDayOfMonthPattern",
    discriminator: "businessDayOfMonth",
    keys: ["businessDayOfMonth", "months", "holidayOverlapPolicy"],
    scheduleKeys: ["calendar"],
    make: (p) => {
      const rule: Obj = {
        businessDayOfMonth: p.chance(0.7) ? p.pick([1, 2, 3, 5, -1, -2]) : p.some([1, 2, -1], 2),
      };
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday"]);
      return rule;
    },
  },
  {
    pattern: "BusinessDayOfWeekPattern",
    discriminator: "businessDayOfWeek",
    keys: ["businessDayOfWeek", "weekStart", "months", "holidayOverlapPolicy"],
    scheduleKeys: ["calendar"],
    sinceRename: true,
    make: (p) => {
      const rule: Obj = {
        businessDayOfWeek: p.chance(0.7) ? p.pick([1, 2, -1]) : p.some([1, 2, 3, -1], 2),
        weekStart: p.pick([0, 1]),
      };
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday"]);
      return rule;
    },
  },
  {
    pattern: "CyclePattern",
    discriminator: "cycle",
    keys: ["cycle", "anchor", "positions", "months", "holidayOverlapPolicy"],
    make: (p, ctx) => {
      const cycle = p.pick([3, 4, 5, 6, 10]);
      const rule: Obj = {
        cycle,
        anchor: date(p, ctx.years),
        // The last day of the cycle (cycle) is included too
        positions: p.some(
          Array.from({ length: cycle }, (_, i) => i + 1),
          2,
        ),
      };
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday"]);
      return rule;
    },
  },
  {
    pattern: "HolidayPattern",
    discriminator: "holiday",
    keys: ["holiday", "kinds", "keys", "weekdays", "months"],
    holiday: true,
    make: (p, ctx) => {
      const rule: Obj = { holiday: true };
      holidayFilters(p, rule, ctx);
      return rule;
    },
  },
  {
    pattern: "DayAfterHolidayPattern",
    discriminator: "dayAfterHoliday",
    keys: ["dayAfterHoliday", "kinds", "keys", "weekdays", "months", "skipWeekdays"],
    holiday: true,
    make: (p, ctx) => {
      const rule: Obj = { dayAfterHoliday: true };
      holidayFilters(p, rule, ctx);
      if (p.chance(0.3)) rule["skipWeekdays"] = p.some([0, 6], 2);
      return rule;
    },
  },
  {
    pattern: "DayBeforeHolidayPattern",
    discriminator: "dayBeforeHoliday",
    keys: ["dayBeforeHoliday", "kinds", "keys", "weekdays", "months", "skipWeekdays"],
    holiday: true,
    make: (p, ctx) => {
      const rule: Obj = { dayBeforeHoliday: true };
      holidayFilters(p, rule, ctx);
      if (p.chance(0.3)) rule["skipWeekdays"] = p.some([0, 6], 2);
      return rule;
    },
  },
];

/** The keys given to every shape (effective period, name) */
export const COMMON_RULE_KEYS = ["effectiveFrom", "effectiveTo", "name"] as const;

/**
 * Keys that the public types have but the generator does not make ("Type.key"), with the reason.
 * test/tools/catalog.test.ts stops a key missing here as an omission, and a key listed here that is not in
 * etc/api.md or that the generator really makes as a discrepancy
 */
export const EXCLUDED_KEYS: Readonly<Record<string, string>> = {
  "CalendarOptions.searchDayLimit":
    "作らない。理由: 探索の上限で、判定の結果を変えない（上限の検査は探索の関数のテストで確かめる）",
};

/** The catalog of choice values (the string unions of the public types) */
export const POLICY_VALUES: Readonly<Record<string, readonly string[]>> = {
  HolidayPolicy: ["closed", "open", "ignore"],
  HolidayOverlapPolicy: ["under-holiday", "over-holiday", "after-holiday"],
  outOfRangePolicy: ["throw", "ignore"],
  unconfirmedHolidayPolicy: ["accept", "throw"],
};

/** Identifies the shape of a rule */
export const shapeOf = (rule: Obj): Shape | undefined =>
  SHAPES.find((s) => s.discriminator in rule);

/** The shapes made in a context */
export const shapesIn = (ctx: Context): Shape[] =>
  SHAPES.filter((s) => (ctx.holidays || !s.holiday) && (ctx.newShapes || !s.sinceRename));

/**
 * An effective period (start only, end only, or both; the end up to 400 days after the start; periods across a
 * year end are made too)
 */
function effective(p: Picker, ctx: Context, rule: Obj): void {
  const r = p.rand();
  if (r >= 0.4) return;
  const from = date(p, ctx.effectiveYears);
  if (r < 0.15) rule["effectiveFrom"] = from;
  else if (r < 0.25) rule["effectiveTo"] = from;
  else {
    rule["effectiveFrom"] = from;
    rule["effectiveTo"] = iso(Date.parse(`${from}T00:00:00Z`) + p.int(0, 400) * 86_400_000);
  }
}

/** Makes one recurring rule */
export function randomRule(p: Picker, ctx: Context): Obj {
  const rule = p.pick(shapesIn(ctx)).make(p, ctx);
  effective(p, ctx, rule);
  if (p.chance(0.2)) rule["name"] = `r${p.int(1, 9)}`;
  return rule;
}

/**
 * A list of rules. To create covering relations (shadowed) and overlapping counts, copies of earlier rules are
 * mixed in (as they are, or with months or kinds narrowed)
 */
export function randomRules(p: Picker, ctx: Context, max: number): Obj[] {
  const out: Obj[] = [];
  for (let i = 0, n = p.int(1, max); i < n; i++) {
    if (out.length > 0 && p.chance(0.3)) {
      const source = p.pick(out);
      const copy: Obj = { ...source };
      const r = p.rand();
      let made: Obj;
      if (r < 0.4) made = copy;
      else if (r < 0.7) made = { ...copy, months: p.some(MONTHS, 3) };
      else if (shapeOf(copy)?.holiday) made = { ...copy, kinds: p.some(ctx.kinds, 2) };
      else {
        const from = date(p, ctx.effectiveYears);
        made = { ...copy, effectiveFrom: from };
        if (typeof made["effectiveTo"] === "string" && made["effectiveTo"] < from)
          delete made["effectiveTo"];
      }
      // A copy inherits the mistake of its source rule
      out.push(isIntendedInvalid(source) ? markInvalid(made) : made);
    } else out.push(randomRule(p, ctx));
  }
  return out;
}

/** Candidate annual dates (a leap day, a period across the year end and the { date } form are mixed in) */
const ANNUAL: readonly unknown[] = [
  "01-01",
  "01-02",
  "02-29",
  "05-01",
  "05-05",
  "08-13",
  "12-31",
  { from: "12-29", to: "01-03" },
  { from: "12-30", to: "01-02" },
  { from: "05-01", to: "05-06" },
  { date: "01-01" },
  { date: "05-05" },
];
const annualDate = (p: Picker, ctx: Context): unknown => {
  const a = p.pick(ANNUAL);
  if (typeof a === "string" || !p.chance(0.3)) return a;
  const withPeriod: Obj = { ...(a as Obj), effectiveFrom: date(p, ctx.effectiveYears) };
  if (p.chance(0.5))
    withPeriod["effectiveTo"] = addDays(withPeriod["effectiveFrom"] as string, p.int(0, 400));
  return withPeriod;
};
/** A specific date (a date or a period of up to 21 days; with wideDates of the context, long periods too) */
const specificDate = (p: Picker, ctx: Context): unknown => {
  const from = date(p, ctx.years);
  if (ctx.wideDates) return wideDate(p, from);
  return p.chance(0.5) ? from : { from, to: addDays(from, p.int(0, 20)) };
};
const YEAR_DAYS = 366;
/**
 * The specific dates for wideDates of a context: a date 30%, a period of up to 45 days 20%, 46 days to 3 years
 * 10%, 9 to 40 years 10%, more than 200 years 10%, from 1000-01-01 10%, to 9999-12-31 10%
 */
const wideDate = (p: Picker, from: string): unknown => {
  const r = p.rand();
  if (r < 0.3) return from;
  if (r < 0.5) return { from, to: addDays(from, p.int(0, 45)) };
  if (r < 0.6) return { from, to: addDays(from, p.int(46, 3 * YEAR_DAYS)) };
  if (r < 0.7) return { from, to: addDays(from, p.int(9 * YEAR_DAYS, 40 * YEAR_DAYS)) };
  if (r < 0.8) return { from, to: addDays(from, p.int(201 * YEAR_DAYS, 300 * YEAR_DAYS)) };
  if (r < 0.9) return { from: "1000-01-01", to: from };
  return { from, to: "9999-12-31" };
};

/** Options of a business calendar (the caller adds providers and the time zone) */
export function randomCalendarOptions(p: Picker, ctx: Context): Obj {
  const o: Obj = { holidayPolicy: p.pick(POLICY_VALUES["HolidayPolicy"]!) };
  // Closed weekdays: omitted (the default: no closed weekday), empty, or any combination of weekdays
  if (p.chance(0.85)) o["closedWeekdays"] = WEEKDAYS.filter(() => p.chance(0.25));
  if (p.chance(0.8)) o["closedRecurringRules"] = randomRules(p, ctx, 4);
  if (p.chance(0.4)) o["openRecurringRules"] = randomRules(p, ctx, 2);
  if (p.chance(0.45))
    o["closedAnnualDates"] = Array.from({ length: p.int(1, 3) }, () => annualDate(p, ctx));
  if (p.chance(0.45))
    o["closedDates"] = Array.from({ length: p.int(1, 4) }, () => specificDate(p, ctx));
  if (p.chance(0.3))
    o["openDates"] = Array.from({ length: p.int(1, 2) }, () => specificDate(p, ctx));
  return o;
}

/**
 * Options of a schedule (the caller adds providers and the time zone). The values are "A", "B", "C" and
 * "closed".
 * An nth-business-day rule gets CALENDAR_REF as `calendar`, the counting basis (the caller replaces it by a real
 * calendar).
 * A context that mixes in mistakes also makes an nth-business-day rule without calendar (invalid-option)
 */
export function randomScheduleOptions(p: Picker, ctx: Context): Obj {
  const values = ["A", "B", "C", "closed"];
  const o: Obj = {
    weekdayValues: WEEKDAYS.map((d) => (d === 0 || d === 6 ? "closed" : p.pick(values))),
    holidayPolicy: p.pick<unknown>(["ignore", { sameAs: 0 }, { value: "H" }]),
  };
  if (p.chance(0.85))
    o["recurringRules"] = randomRules(p, ctx, 4).map((r) => {
      const rule: Obj = { ...r, value: p.pick(values) };
      if (isIntendedInvalid(r)) markInvalid(rule);
      if (shapeOf(r)?.scheduleKeys !== undefined) {
        if (ctx.invalid && p.chance(0.2)) markInvalid(rule);
        else rule["calendar"] = CALENDAR_REF;
      }
      return rule;
    });
  if (p.chance(0.3)) o["annualDates"] = [{ date: "12-31", value: "closed" }];
  if (p.chance(0.25)) {
    const d = date(p, ctx.years);
    o["dates"] = [ctx.newShapes ? scheduleDate(d) : { date: d, value: "X" }];
  }
  return o;
}

/**
 * A specific date of a schedule. About half become a period ({ from, to }; 2-7 days within the same year).
 * Whether it is a period and its length are chosen by a separate random generator decided by the date (so that
 * the caller's random sequence does not change; changing it would change every option the other tests try)
 */
function scheduleDate(d: string): Obj {
  let seed = 0;
  for (const ch of d) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const side = random(seed ^ 0x5bd1e995);
  if (side() < 0.5) return { date: d, value: "X" };
  const to = addDays(d, 1 + Math.floor(side() * 6));
  return to.slice(0, 4) === d.slice(0, 4) ? { from: d, to, value: "X" } : { date: d, value: "X" };
}

/**
 * The mark for the basis calendar of an nth-business-day rule of a schedule. The caller replaces it by a
 * calendar with the same providers (closed weekends in the consistency checks and the metamorphic tests; in
 * result-compare the closed weekdays chosen per options by basisClosedWeekdays)
 */
export const CALENDAR_REF: Readonly<Obj> = Object.freeze({ calendarRef: "weekends-and-holidays" });

/** Adds days to "YYYY-MM-DD" */
export const addDays = (d: string, n: number): string =>
  iso(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000);

/** The rule shapes that occur in generated options, and the keys per shape (for the reachability check of the generator) */
export function shapeKeysIn(options: Obj): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const k of ["closedRecurringRules", "openRecurringRules", "recurringRules"]) {
    const list = options[k];
    if (!Array.isArray(list)) continue;
    for (const r of list as Obj[]) {
      const s = shapeOf(r);
      if (!s) continue;
      const keys = out.get(s.pattern) ?? new Set<string>();
      for (const key of Object.keys(r)) keys.add(key);
      out.set(s.pattern, keys);
    }
  }
  return out;
}
