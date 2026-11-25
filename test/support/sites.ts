// How the callers of the random tests (test/properties.test.ts, test/diagnose-properties.test.ts) build their
// options, and the list of options the three callers (including result-compare) build. The callers build
// options with the functions here, and the inclusion check of the generated range
// (test/tools/generator-features.test.ts) calls the same functions with the same seeds and numbers of trials and
// counts the features (for all three callers, even the order of the options equals the caller's).
// Providers are kept as a name ("jp") or as a home-made provider object (the caller replaces a name by the real
// provider).

import {
  CONTEXTS,
  addDays,
  picker,
  random,
  randomCalendarOptions,
  randomRules,
  randomScheduleOptions,
  type Context,
  type Obj,
} from "./catalog.ts";
import { scanFeatures, providerKey, diagnoseRangeOf } from "./features.ts";
import { contextOf, fixedCases, generateCases } from "./result-cases.ts";
import { SHORT_PROVIDER } from "./provider.ts";
import { PROMISE_RANGE } from "./promise-days.ts";

// ------------------------------------------------------------
// test/properties.test.ts (the Japanese provider)
// ------------------------------------------------------------

/** The default seed and number of trials of the property tests */
export const PROPERTY = { seed: 20261015, runs: 300 } as const;
/**
 * Compares the number of skipped trials with a limit (used by tests that skip trials not meeting the premise of
 * a property). Above the limit it throws.
 * The caller always prints the count line (skipped trials, n of N, with the reason)
 */
export function checkSkipped(skipped: number, runs: number, limit: number, reason: string): string {
  const line = `飛ばした試行: ${skipped} / ${runs}（${reason}）`;
  if (skipped > limit)
    throw new Error(`飛ばした試行が上限（${limit}）を超えた: ${skipped} / ${runs}（${reason}）`);
  return line;
}

/**
 * The dates the property tests ask about (within the supported years of Japan's holidays, with a margin so that
 * a search does not leave the range at the ends)
 */
export const PROPERTY_DATES = { from: "1960-01-01", days: 365 * 130 } as const;

/** The random generator of the property tests (it has `date`, which makes dates) */
export interface PropertyGen {
  readonly rand: () => number;
  int(min: number, max: number): number;
  date(): string;
  pick<T>(items: readonly T[]): T;
}

export function propertyGen(rand: () => number): PropertyGen {
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  return {
    rand,
    int,
    date: () => addDays(PROPERTY_DATES.from, int(0, PROPERTY_DATES.days)),
    pick: (items) => items[int(0, items.length - 1)]!,
  };
}

/** Options of a business calendar (at most 5 closed weekdays; recurring rules come from the catalog) */
export function propertyCalendarOptions(g: PropertyGen): Obj {
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter(() => g.int(0, 3) === 0).slice(0, 5);
  const closedDates = Array.from({ length: g.int(0, 5) }, () => {
    const from = g.date();
    return { from, to: addDays(from, g.int(0, 10)) };
  });
  const openDates = Array.from({ length: g.int(0, 3) }, () => g.date());
  const closedAnnualDates = g.int(0, 1) ? [{ from: "12-29", to: "01-03" }] : [];
  const holidayPolicy = g.pick(["closed", "open", "ignore"] as const);
  const p = picker(g.rand);
  const ctx: Context = CONTEXTS.properties;
  return {
    closedWeekdays: weekdays,
    closedDates,
    openDates,
    closedAnnualDates,
    holidayPolicy,
    ...(g.int(0, 2) > 0 ? { closedRecurringRules: randomRules(p, ctx, 3) } : {}),
    ...(g.int(0, 3) === 0 ? { openRecurringRules: randomRules(p, ctx, 2) } : {}),
  };
}

/** From a boolean per weekday, builds options of a business calendar and of a schedule with the same rules */
export function propertyWeeklyOptions(g: PropertyGen): { calendar: Obj; schedule: Obj } {
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map(() => g.int(0, 2) > 0);
  const holidayValue = g.int(0, 1) === 1;
  return {
    calendar: {
      closedWeekdays: [0, 1, 2, 3, 4, 5, 6].filter((w) => !weekdays[w]),
      holidayPolicy: holidayValue ? "open" : "closed",
    },
    schedule: { weekdayValues: weekdays, holidayPolicy: { value: holidayValue } },
  };
}

const ON_HOLIDAY = ["under-holiday", "over-holiday", "after-holiday"] as const;

/** Recurring weekday and day-of-month rules (for the property tests of moves) */
export function propertyRecurringRules(g: PropertyGen): Obj[] {
  return Array.from({ length: g.int(1, 3) }, (): Obj => {
    const holidayOverlapPolicy = g.pick(ON_HOLIDAY);
    const months = g.int(0, 3) === 0 ? { months: [g.int(1, 12)] } : {};
    if (g.int(0, 1) === 0) {
      const nth = g.int(0, 2) === 0 ? {} : { nth: g.pick([1, 2, 3, 4, 5, -1] as const) };
      return { weekday: g.int(0, 6), ...nth, ...months, holidayOverlapPolicy };
    }
    return {
      dayOfMonth: g.pick([1, 10, 15, 20, 28, 31, -1] as const),
      ...months,
      holidayOverlapPolicy,
    };
  });
}

/** The property of moves: a business calendar with every rule "after-holiday" */
export function propertyShiftOptions(g: PropertyGen): Obj {
  const rules = propertyRecurringRules(g).map((r) => ({
    ...r,
    holidayOverlapPolicy: "after-holiday",
  }));
  return { holidayPolicy: g.pick(["open", "closed"] as const), closedRecurringRules: rules };
}

/** The property of moving business days: closing rules and, sometimes, opening rules */
export function propertyMoveOptions(g: PropertyGen): Obj {
  return {
    holidayPolicy: g.pick(["open", "closed", "ignore"] as const),
    closedRecurringRules: propertyRecurringRules(g),
    openRecurringRules: g.int(0, 2) === 0 ? propertyRecurringRules(g) : [],
  };
}

/** The property that calendar and schedule agree: a business calendar and a boolean schedule with the same rules */
export function propertyPairOptions(g: PropertyGen): { calendar: Obj; schedule: Obj } {
  const open = g.int(0, 1) ? propertyRecurringRules(g) : [];
  const closed = propertyRecurringRules(g);
  const holidayOpen = g.int(0, 1) === 1;
  return {
    calendar: {
      holidayPolicy: holidayOpen ? "open" : "closed",
      openRecurringRules: open,
      closedRecurringRules: closed,
    },
    schedule: {
      weekdayValues: [true, true, true, true, true, true, true],
      holidayPolicy: { value: holidayOpen },
      recurringRules: [
        ...open.map((r) => ({ ...r, value: true })),
        ...closed.map((r) => ({ ...r, value: false })),
      ],
    },
  };
}

/** The kinds of how the property tests build options (one per property) */
export type PropertyConfigKind = "calendar" | "weekly" | "shift" | "move" | "pair";

/**
 * The properties that build options, and how. A property keeps the random generator for options (seeds derived
 * from the property's name) apart from the one that draws dates and so on, so siteTrials can build from this
 * list the same options in the same order as the property. test/properties.test.ts checks that the way a
 * property really used equals this list (a property missing in the list that builds options fails)
 */
export const PROPERTY_CONFIGS: Readonly<Record<string, PropertyConfigKind>> = {
  "休業日を起点にした addBusinessDays は、翌営業日を 1 と数える（diffBusinessDays は起点が営業日のときだけ逆算になる）":
    "calendar",
  "businessDatesBetween の件数は diffBusinessDays と一致する": "calendar",
  "営業日カレンダーと、同じ規則の真偽値のスケジュールは一致する": "weekly",
  "振替先は振替元より後の祝日でない日で、その間はすべて祝日": "shift",
  "繰り返しの規則があっても、営業日の移動と数え上げの性質は保たれる": "move",
  "繰り返しの規則でも、営業日カレンダーと真偽値のスケジュールは一致する": "pair",
  "adjust の結果は営業日で、方法ごとの定義どおり。もう一度調整しても変わらない": "calendar",
  "月の第 n 営業日は、その月の営業日の一覧の n 番目（負なら後ろから）": "calendar",
  "dueDate は、末日に読み替えた日付を adjust したもの": "calendar",
};

/** The seed of the generator for a property's options (from the test's seed and the property's name; FNV-1a) */
export function propertyConfigSeed(seed: number, name: string): number {
  let h = 0x811c9dc5;
  for (const ch of name) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ seed) >>> 0;
}

/** The options of one trial per kind (calendar and schedule; without providers) */
export function propertyConfig(
  kind: PropertyConfigKind,
  g: PropertyGen,
): { calendar: Obj; schedule?: Obj } {
  switch (kind) {
    case "calendar":
      return { calendar: propertyCalendarOptions(g) };
    case "weekly":
      return propertyWeeklyOptions(g);
    case "shift":
      return { calendar: propertyShiftOptions(g) };
    case "move":
      return { calendar: propertyMoveOptions(g) };
    case "pair":
      return propertyPairOptions(g);
  }
}

// ------------------------------------------------------------
// test/diagnose-properties.test.ts
// ------------------------------------------------------------

/**
 * Seeds and numbers of trials of the diagnostics property tests (comparing all days; with nth business days;
 * scanning the whole range of the Japanese provider)
 */
export const DIAGNOSE_PROPERTY = {
  seed: 20261016,
  runs: 100,
  countingRuns: 30,
  fullRangeRuns: 6,
  /**
   * The sample of trials checked by pnpm check (only trials whose run number divided by this leaves 0; options
   * are built every time, so the random sequence does not change).
   * The full set runs with DIAGNOSE_PROPERTY_FULL=1 (the diagnose-consistency job of CI). With 3, the sample is
   * not empty for any of 100, 30 and 6
   */
  sampleEvery: 3,
} as const;
/**
 * The whole range of the Japanese provider (the supported years of src/jp; test/tools/generator-features.test.ts
 * checks that it equals them)
 */
export const JP_FULL_RANGE = { from: "1955-01-01", to: "2099-12-31" } as const;
/** All days of the home-made provider with few supported years */
export const SHORT_RANGE = { from: "2025-01-01", to: "2027-12-31" } as const;

/**
 * The providers of the diagnostics property tests: the home-made provider with few supported years, none, Japan
 * ("jp", which the caller replaces by the real one)
 */
export type DiagnoseSource = "short" | "none" | "jp";

const DIAGNOSE_CONTEXT: Record<DiagnoseSource, Context> = {
  short: CONTEXTS["diagnose-properties"],
  none: CONTEXTS["diagnose-properties（提供元なし）"],
  jp: CONTEXTS["diagnose-properties（日本の全範囲）"],
};

/**
 * Builds options for the diagnostics property tests from the catalog. The conditions of the judgement follow
 * the diagnostics (outOfRangePolicy: "ignore". decisions.md #31).
 * Array keys are written even when empty (to try both an empty array and omission, those not overwritten by the
 * catalog options stay empty)
 */
export function diagnoseOptions(rand: () => number, source: DiagnoseSource): Obj {
  const options = randomCalendarOptions(picker(rand), DIAGNOSE_CONTEXT[source]);
  return {
    ...(source === "short" ? { holidayProvider: SHORT_PROVIDER, timeZone: "UTC" } : {}),
    ...(source === "jp" ? { holidayProvider: "jp", timeZone: "Asia/Tokyo" } : {}),
    outOfRangePolicy: "ignore",
    closedDates: [],
    openDates: [],
    closedAnnualDates: [],
    openRecurringRules: [],
    closedRecurringRules: [],
    ...options,
  };
}

/**
 * Adds an nth-business-day rule (month, week) and specific dates near the start of a month or week, where it
 * easily matches
 */
export function withCountingRule(rand: () => number, options: Obj): Obj {
  const counting = [
    { businessDayOfMonth: [1, 2, -1][Math.floor(rand() * 3)]! },
    { businessDayOfWeek: [1, -1][Math.floor(rand() * 2)]!, weekStart: Math.floor(rand() * 2) },
  ][Math.floor(rand() * 2)]!;
  const key = rand() < 0.5 ? "closedRecurringRules" : "openRecurringRules";
  return {
    ...options,
    [key]: [...(options[key] as unknown[]), counting],
    closedDates: [
      ...(options["closedDates"] as unknown[]),
      addDays("2026-01-01", 30 * Math.floor(rand() * 12) + Math.floor(rand() * 7)),
    ],
  };
}

/**
 * Seeds and numbers of trials of the diagnostics property tests of 0.32.8. They compare all days of the
 * diagnostic range (test/support/promise-days.ts), so one trial is heavy (0.2-1 second). pnpm check runs
 * a sample of 1 in sampleEvery; the full set runs with DIAGNOSE_PROPERTY_FULL=1 (diagnose-consistency of CI).
 * The numbers were chosen so that, with src/core/diagnose.ts of 0.32.7, the full set fails the property of dates
 * outside the range and long dates (the development log of 0.32.8)
 */
export const DIAGNOSE_WIDE = {
  seed: 20261122,
  /** Dates outside the range and long dates (the home-made short provider, no provider) */
  runs: 240,
  /** The Japanese provider with outOfRangePolicy: "throw" and unconfirmedHolidayPolicy: "throw" (calendars, schedules) */
  throwRuns: 120,
  /** The sample is not empty for either 240 or 120 */
  sampleEvery: 20,
} as const;
/**
 * The period compared by the property of dates outside the range and long dates: the diagnostic range, in which
 * the promises hold (test/support/promise-days.ts)
 */
export const WIDE_RANGE = PROMISE_RANGE;

const WIDE_CONTEXT: Record<"short" | "none", Context> = {
  short: CONTEXTS["diagnose-properties（範囲の外と長い日付）"],
  none: { ...CONTEXTS["diagnose-properties（範囲の外と長い日付）"], holidays: false },
};

/**
 * Adds one nth-business-day rule counting on the own options (month, week; also at positions that easily hit
 * the ends of the count) and, in half of the options, a day or weekday rule before it that can decide the same
 * day as the counting rule (to make pairs for removing and comparing)
 */
export function withOwnCountingRule(rand: () => number, options: Obj): Obj {
  const p = picker(rand);
  const counting = p.pick<Obj>([
    { businessDayOfMonth: p.pick([1, 2, 3, -1, -2, 20, 22, 23, 26]) },
    { businessDayOfMonth: [1, 2] },
    { businessDayOfWeek: p.pick([1, 2, 5, 6, -1]), weekStart: p.pick([0, 1]) },
  ]);
  const key = p.chance(0.7) ? "closedRecurringRules" : "openRecurringRules";
  const out: Obj = { ...options, [key]: [...((options[key] as unknown[]) ?? []), counting] };
  if (p.chance(0.5))
    out["closedRecurringRules"] = [
      p.pick<Obj>([{ weekday: p.int(0, 6) }, { dayOfMonth: p.pick([1, 2, 3, -1]) }]),
      ...((out["closedRecurringRules"] as unknown[]) ?? []),
    ];
  return out;
}

/**
 * Options for the property of dates outside the range and long dates (the home-made short provider or no
 * provider; outOfRangePolicy: "ignore"; a counting rule is always included, and 30% close every weekday or none,
 * to make options with few business days too (for checking no-business-day))
 */
export function diagnoseWideOptions(rand: () => number, source: "short" | "none"): Obj {
  const p = picker(rand);
  const options = withOwnCountingRule(rand, randomCalendarOptions(p, WIDE_CONTEXT[source]));
  if (p.chance(0.3)) {
    if (p.chance(0.5)) options["closedWeekdays"] = [0, 1, 2, 3, 4, 5, 6];
    else {
      options["closedWeekdays"] = [];
      options["closedRecurringRules"] = [
        ...((options["closedRecurringRules"] as unknown[]) ?? []),
        { dayOfMonth: 1 },
        { businessDayOfMonth: Array.from({ length: 30 }, (_, i) => i + 2) },
      ];
    }
  }
  if (source === "none") delete options["holidayPolicy"];
  return {
    ...(source === "short" ? { holidayProvider: SHORT_PROVIDER, timeZone: "UTC" } : {}),
    outOfRangePolicy: "ignore",
    ...options,
  };
}

/**
 * The kinds of options of the "throw" properties with the Japanese provider (which of outOfRangePolicy and
 * unconfirmedHolidayPolicy is "throw")
 */
export type ThrowKind = "out-of-range" | "unconfirmed";
/** The kind of a trial of the "throw" properties (calendar out-of-range, calendar unconfirmed, schedule unconfirmed, in turn) */
export const throwKindOf = (run: number): { kind: ThrowKind; schedule: boolean } =>
  [
    { kind: "out-of-range" as const, schedule: false },
    { kind: "unconfirmed" as const, schedule: false },
    { kind: "unconfirmed" as const, schedule: true },
  ][run % 3]!;

/**
 * Options for the "throw" properties with the Japanese provider (the provider is the name "jp"; the caller
 * replaces it by the real one). Half of the calendars get a counting rule. unconfirmed means
 * unconfirmedHolidayPolicy: "throw" with outOfRangePolicy: "ignore"; out-of-range means the default "throw".
 * The basis of an nth-business-day rule of a schedule stays CALENDAR_REF (the caller replaces it)
 */
export function diagnoseThrowOptions(rand: () => number, run: number): Obj {
  const p = picker(rand);
  const { kind, schedule } = throwKindOf(run);
  const ctx = CONTEXTS["diagnose-properties（日本・throw）"];
  const source: Obj = {
    holidayProvider: "jp",
    timeZone: "Asia/Tokyo",
    ...(kind === "unconfirmed"
      ? { unconfirmedHolidayPolicy: "throw", outOfRangePolicy: "ignore" }
      : {}),
  };
  const made = schedule ? randomScheduleOptions(p, ctx) : randomCalendarOptions(p, ctx);
  const options = !schedule && p.chance(0.5) ? withOwnCountingRule(rand, made) : made;
  // Half of the unconfirmed ones get a weekday rule first and a moving ("after-holiday") weekday rule after it (to
  // make pairs in which the remaining rule looks up an unconfirmed holiday instead of the removed one)
  if (kind === "unconfirmed" && p.chance(0.5)) {
    // The earlier rule of a schedule gives weekends the same value ("closed" of the catalog's weekdayValues)
    options[schedule ? "recurringRules" : "closedRecurringRules"] = [
      schedule ? { weekday: p.pick([0, 6]), value: "closed" } : { weekday: p.int(0, 6) },
      ...((options[schedule ? "recurringRules" : "closedRecurringRules"] as unknown[]) ?? []),
      {
        weekday: p.int(1, 5),
        holidayOverlapPolicy: "after-holiday",
        ...(schedule ? { value: p.pick(["A", "B"]) } : {}),
      },
    ];
  }
  return { ...source, ...options };
}

/**
 * The provider of the tests that compare all days (3 of 4 trials the provider with few supported years, the rest
 * no provider)
 */
export const diagnoseSourceOf = (run: number): DiagnoseSource => (run % 4 === 3 ? "none" : "short");
/** The provider of the tests that scan the whole range (Japan and no provider in turn) */
export const fullRangeSourceOf = (run: number): DiagnoseSource => (run % 2 === 0 ? "jp" : "none");

// ------------------------------------------------------------
// The options the three callers build (the inclusion check of the generated range)
// ------------------------------------------------------------

export interface Trial {
  readonly kind: "calendar" | "schedule";
  readonly options: Obj;
  /**
   * The range of dates asked about with these options. Unless `wide`, each trial asks about only some dates of
   * the range
   */
  readonly scan?: { readonly from: string; readonly to: string; readonly wide: boolean };
}

/** The list of options per caller (the same functions, seeds and numbers of trials as the caller) */
export function siteTrials(site: string): Trial[] {
  const out: Trial[] = [];
  if (site === "properties") {
    const scan = {
      from: PROPERTY_DATES.from,
      to: addDays(PROPERTY_DATES.from, PROPERTY_DATES.days),
      wide: false,
    };
    const jp = (o: Obj): Obj => ({ holidayProvider: "jp", ...o });
    for (const [name, kind] of Object.entries(PROPERTY_CONFIGS)) {
      const g = propertyGen(random(propertyConfigSeed(PROPERTY.seed, name)));
      for (let run = 0; run < PROPERTY.runs; run++) {
        const made = propertyConfig(kind, g);
        out.push({ kind: "calendar", options: jp(made.calendar), scan });
        if (made.schedule) out.push({ kind: "schedule", options: jp(made.schedule), scan });
      }
    }
    out.push({ kind: "calendar", options: jp({}), scan });
  } else if (site === "diagnose-properties") {
    const short = { ...SHORT_RANGE, wide: true };
    let rand = random(DIAGNOSE_PROPERTY.seed);
    for (let run = 0; run < DIAGNOSE_PROPERTY.runs; run++)
      out.push({
        kind: "calendar",
        options: diagnoseOptions(rand, diagnoseSourceOf(run)),
        scan: short,
      });
    rand = random(DIAGNOSE_PROPERTY.seed + 2);
    for (let run = 0; run < DIAGNOSE_PROPERTY.countingRuns; run++) {
      const options = diagnoseOptions(rand, run % 2 === 0 ? "short" : "none");
      out.push({ kind: "calendar", options: withCountingRule(rand, options), scan: short });
    }
    rand = random(DIAGNOSE_PROPERTY.seed + 3);
    for (let run = 0; run < DIAGNOSE_PROPERTY.fullRangeRuns; run++)
      out.push({
        kind: "calendar",
        options: diagnoseOptions(rand, fullRangeSourceOf(run)),
        scan: { ...JP_FULL_RANGE, wide: true },
      });
    rand = random(DIAGNOSE_WIDE.seed);
    for (let run = 0; run < DIAGNOSE_WIDE.runs; run++)
      out.push({
        kind: "calendar",
        options: diagnoseWideOptions(rand, run % 2 === 0 ? "short" : "none"),
        scan: { ...WIDE_RANGE, wide: true },
      });
    rand = random(DIAGNOSE_WIDE.seed + 1);
    for (let run = 0; run < DIAGNOSE_WIDE.throwRuns; run++)
      out.push({
        kind: throwKindOf(run).schedule ? "schedule" : "calendar",
        options: diagnoseThrowOptions(rand, run),
        scan: { ...JP_FULL_RANGE, wide: true },
      });
  } else if (site === "result-compare") {
    const seen = new Set<string>();
    for (const newShapes of [true, false])
      for (const c of [...fixedCases(), ...generateCases(20261030, 1, newShapes)])
        for (const one of c.partner ? [c, c.partner] : [c]) {
          if (seen.has(`${newShapes}:${one.id}`)) continue;
          seen.add(`${newShapes}:${one.id}`);
          out.push({
            kind: one.kind,
            options: one.options,
            scan: { from: one.from, to: one.to, wide: true },
          });
        }
  } else throw new Error(`unknown site ${site}`);
  return out;
}

/** The scan features of a list entry */
export function trialScanFeatures(t: Trial): Set<string> {
  if (t.scan === undefined) return new Set();
  const f = scanFeatures(
    providerKey(t.options),
    t.scan.from,
    t.scan.to,
    diagnoseRangeOf(t.options),
  );
  if (!t.scan.wide) for (const x of f) if (x.endsWith(".span=decades")) f.delete(x);
  return f;
}

// ------------------------------------------------------------
// The contexts of the callers (the reachability of the generator is checked per context of this list)
// ------------------------------------------------------------

export interface ContextUse {
  readonly site: string;
  readonly name: string;
  readonly ctx: Context;
  /** The kinds of options made in the context */
  readonly kinds: readonly ("calendar" | "schedule")[];
}

export const CONTEXT_USES: readonly ContextUse[] = [
  { site: "properties", name: "properties", ctx: CONTEXTS.properties, kinds: ["calendar"] },
  ...(["short", "none", "jp"] as const).map((source): ContextUse => ({
    site: "diagnose-properties",
    name: Object.entries(CONTEXTS).find(([, c]) => c === DIAGNOSE_CONTEXT[source])![0],
    ctx: DIAGNOSE_CONTEXT[source],
    kinds: ["calendar"],
  })),
  ...(["short", "none"] as const).map((source): ContextUse => ({
    site: "diagnose-properties",
    name: `diagnose-properties（範囲の外と長い日付${source === "none" ? "・提供元なし" : ""}）`,
    ctx: WIDE_CONTEXT[source],
    kinds: ["calendar"],
  })),
  {
    site: "diagnose-properties",
    name: "diagnose-properties（日本・throw）",
    ctx: CONTEXTS["diagnose-properties（日本・throw）"],
    kinds: ["calendar", "schedule"],
  },
  {
    site: "promise-inventory",
    name: "promise-inventory",
    ctx: CONTEXTS["promise-inventory"],
    kinds: ["calendar", "schedule"],
  },
  ...[true, false].flatMap((newShapes) =>
    [true, false].map((withHolidays): ContextUse => {
      const { name, ctx } = contextOf(withHolidays, newShapes);
      return { site: "result-compare", name, ctx, kinds: ["calendar", "schedule"] };
    }),
  ),
];
