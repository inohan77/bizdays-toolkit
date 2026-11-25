// The set of options result-compare (scripts/result-compare.ts) compares: options decided by a seed and fixed
// options that record past regressions.
// The inclusion check of the generated range (test/tools/generator-features.test.ts) builds the same options
// with the same functions and counts their features.
// Providers are kept by name and replaced, when comparing, by the providers of the loaded version.

import {
  CALENDAR_REF,
  CONTEXTS,
  beforeRename,
  picker,
  random,
  randomCalendarOptions,
  randomScheduleOptions,
  withoutHolidays,
  type Context,
  type Obj,
} from "./catalog.ts";

/** A provider's name (the form before it is replaced by the provider of the loaded version) */
export type ProviderName = "jp" | "england" | "scotland" | "metropole" | "sg";
export const PROVIDERS: readonly ProviderName[] = ["jp", "england", "scotland", "metropole", "sg"];
export const TIME_ZONES: Record<ProviderName, string> = {
  jp: "Asia/Tokyo",
  england: "Europe/London",
  scotland: "Europe/London",
  metropole: "Europe/Paris",
  sg: "Asia/Singapore",
};
export const YEARS: Record<ProviderName, readonly [number, number]> = {
  jp: [1955, 2099],
  england: [1974, 2099],
  scotland: [1974, 2099],
  metropole: [2000, 2099],
  sg: [2020, 2027],
};

export interface Case {
  readonly id: string;
  readonly kind: "calendar" | "schedule";
  readonly providers: readonly ProviderName[];
  /** Providers stay names. When comparing they are replaced by the providers of the loaded version */
  readonly options: Obj;
  readonly from: string;
  readonly to: string;
  /** Not compared with versions before this one (fixed options that use a shape introduced in that version) */
  readonly minBase?: string;
  /** The other calendar of a combination */
  readonly partner?: Case;
  readonly combine?: "all" | "any";
}

/** Random numbers decided by a seed (the default seed of result-compare is 20261030) */
export class Gen {
  readonly next: () => number;
  constructor(start: number) {
    this.next = random(start);
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
  some<T>(items: readonly T[], max: number): T[] {
    const n = this.int(1, Math.min(max, items.length));
    const pool = [...items];
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]!);
    return out;
  }
}

const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/**
 * The period compared: the inside of the years all providers support (so that rules looking at a neighbouring day
 * do not touch an end of the supported years), at most 6 years
 */
export function rangeOf(providers: readonly ProviderName[]): [string, string] {
  let from = 2021;
  let to = 2026;
  for (const p of providers) {
    from = Math.max(from, YEARS[p][0] + 1);
    to = Math.min(to, YEARS[p][1] - 1);
  }
  return [iso(from, 1, 1), iso(to, 12, 31)];
}

/**
 * The context (with providers or not; comparing with a version from before the rename or not). The name shows
 * in the names of the reachability tests of the generator
 */
export function contextOf(
  withHolidays: boolean,
  newShapes: boolean,
): { name: string; ctx: Context } {
  let ctx: Context = CONTEXTS["result-compare"];
  if (!withHolidays) ctx = withoutHolidays(ctx);
  if (!newShapes) ctx = beforeRename(ctx);
  const notes = [
    ...(newShapes ? [] : ["0.22.2 と比べる"]),
    ...(withHolidays ? [] : ["提供元なし"]),
  ];
  return { name: `result-compare${notes.length > 0 ? `（${notes.join("・")}）` : ""}`, ctx };
}

function providersOf(g: Gen): ProviderName[] {
  const n = g.pick([0, 1, 1, 2, 2]);
  return n === 0 ? [] : g.some(PROVIDERS, n);
}

function sourceOptions(g: Gen, providers: readonly ProviderName[]): Obj {
  const o: Obj = {};
  if (providers.length > 0) {
    o["holidayProvider"] = providers.length === 1 && g.chance(0.5) ? providers[0] : [...providers];
    o["timeZone"] = TIME_ZONES[providers[0]!];
  }
  return o;
}

export function calendarCase(g: Gen, id: string, newShapes: boolean): Case {
  const providers = providersOf(g);
  const { ctx } = contextOf(providers.length > 0, newShapes);
  const options = { ...sourceOptions(g, providers), ...randomCalendarOptions(picker(g.next), ctx) };
  const [from, to] = rangeOf(providers);
  return { id, kind: "calendar", providers, options, from, to };
}

export function scheduleCase(g: Gen, id: string, newShapes: boolean): Case {
  const providers = providersOf(g);
  const { ctx } = contextOf(providers.length > 0, newShapes);
  const options = { ...sourceOptions(g, providers), ...randomScheduleOptions(picker(g.next), ctx) };
  const [from, to] = rangeOf(providers);
  return { id, kind: "schedule", providers, options, from, to };
}

/**
 * The set of options decided by a seed (240 calendars and 100 schedules, times the scale; one in four is a pair
 * for a combination)
 */
export function generateCases(seed: number, scale: number, newShapes: boolean): Case[] {
  const g = new Gen(seed);
  const cases: Case[] = [];
  const counts = { calendars: Math.round(240 * scale), schedules: Math.round(100 * scale) };
  for (let i = 0; i < counts.calendars; i++) {
    const c = calendarCase(g, `calendar-${i}`, newShapes);
    if (g.chance(0.25)) {
      cases.push({
        ...c,
        partner: calendarCase(g, `calendar-${i}-partner`, newShapes),
        combine: g.pick(["all", "any"]),
      });
    } else cases.push(c);
  }
  for (let i = 0; i < counts.schedules; i++)
    cases.push(scheduleCase(g, `schedule-${i}`, newShapes));
  return cases;
}

/**
 * Fixed options that record past regressions (shapes random numbers rarely hit). A newly found regression adds
 * its minimal options (they stay after the fixing version is out, to stop the same regression if it returns)
 */
export function fixedCases(): Case[] {
  const holiday = (kinds: string[]): Obj => ({ holiday: true, kinds });
  const cal = (id: string, providers: ProviderName[], options: Obj): Case => {
    const [from, to] = rangeOf(providers);
    return {
      id,
      kind: "calendar",
      providers,
      options: { holidayProvider: providers, timeZone: TIME_ZONES[providers[0]!], ...options },
      from,
      to,
    };
  };
  const sch = (id: string, providers: ProviderName[], options: Obj): Case => {
    const [from, to] = rangeOf(providers);
    return {
      id,
      kind: "schedule",
      providers,
      options: { holidayProvider: providers, timeZone: TIME_ZONES[providers[0]!], ...options },
      from,
      to,
    };
  };
  /** A calendar without a provider */
  const cal0 = (id: string, options: Obj): Case => ({
    id,
    kind: "calendar",
    providers: [],
    options,
    from: "2021-01-01",
    to: "2026-12-31",
  });
  return [
    // The old name "national" in a union matches only the annual holidays of the Japanese provider (not "regular"
    // of other providers)
    cal("fixed-union-national", ["jp", "england"], {
      holidayPolicy: "open",
      closedRecurringRules: [holiday(["national"])],
    }),
    // "regular" in a union with Japan also matches Japan's national holidays (the rename widened its meaning;
    // allowed in etc/result-changes.json)
    cal("fixed-union-regular", ["jp", "england"], {
      holidayPolicy: "open",
      closedRecurringRules: [holiday(["regular"])],
    }),
    // With only the Japanese provider, the same rule with "regular" and with the old name "national" makes the
    // later rule shadowed
    cal("fixed-jp-regular-national", ["jp"], {
      closedRecurringRules: [holiday(["regular"]), holiday(["national"])],
    }),
    cal("fixed-jp-national-regular", ["jp"], {
      closedRecurringRules: [holiday(["national"]), holiday(["regular"])],
    }),
    // With a rule counting nth business days, specific dates and annual dates that change the count are not
    // redundant
    cal0("fixed-counting-date", {
      closedDates: ["2026-05-01"],
      closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: 1 }],
    }),
    cal0("fixed-counting-annual", {
      closedAnnualDates: ["05-01"],
      closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: 1 }],
    }),
    // Options with only a month rule that has a basis calendar do not evaluate the basis in months outside the
    // window and create no unjudgeable month (the form of the regression during the rebuild of 0.31.0-B, which
    // counted months outside the window and lost never-matches / redundant; the loss of the diagnostics of a
    // single rule is allowed by no feature)
    sch("fixed-unjudgeable-month-rule-day25", ["jp"], {
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      recurringRules: [{ businessDayOfMonth: 25, calendar: CALENDAR_REF, value: "x" }],
    }),
    sch("fixed-unjudgeable-month-rules-january", ["jp"], {
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      recurringRules: [
        { businessDayOfMonth: 1, months: [1], calendar: CALENDAR_REF, value: "x" },
        { businessDayOfMonth: 1, calendar: CALENDAR_REF, value: "x" },
      ],
    }),
    // The basis calendar of an nth-business-day rule of a schedule inherits the schedule's outOfRangePolicy
    // (basisOutOfRangePolicy). An "ignore" basis does not throw outside the supported years, so the diagnostics
    // create no unjudgeable month. In the old-name comparison it is passed as outOfRange.
    // The compared period extends outside Singapore's supported years (2020-2027) (inside them "ignore" and
    // "throw" give the same results)
    {
      ...sch("fixed-schedule-basis-ignore", ["sg"], {
        outOfRangePolicy: "ignore",
        weekdayValues: ["closed", "A", "A", "A", "A", "A", "closed"],
        recurringRules: [
          { businessDayOfMonth: 1, calendar: CALENDAR_REF, value: "B" },
          { businessDayOfMonth: -1, months: [12], calendar: CALENDAR_REF, value: "C" },
        ],
      }),
      from: "2018-01-01",
      to: "2029-12-31",
    },
    {
      ...cal0("fixed-counting-week", {
        closedDates: ["2026-05-04"],
        closedRecurringRules: [{ weekday: 1 }, { businessDayOfWeek: 1, weekStart: 1 }],
      }),
      minBase: "0.30.0",
    },
    // No counting-basis for a weekday rule whose effective period does not overlap the nth-business-day rule's
    // (reported up to 0.30.7)
    cal("fixed-counting-basis-no-overlap", ["jp"], {
      closedWeekdays: [0, 6],
      closedRecurringRules: [
        { weekday: 3, effectiveTo: "2026-12-31" },
        { businessDayOfMonth: 1, effectiveFrom: "2027-01-01" },
      ],
    }),
    // Two weekday rules give two counting-basis items (up to 0.30.7 only the first)
    cal("fixed-counting-basis-two-weekly", ["jp"], {
      closedWeekdays: [0],
      closedRecurringRules: [{ weekday: 3 }, { weekday: 6 }, { businessDayOfMonth: 1 }],
    }),
    // One weekday rule each among the opening and the closing rules gives two counting-basis items (up to 0.30.7
    // only the one of the opening rules)
    cal("fixed-counting-basis-open-closed-weekly", ["jp"], {
      closedWeekdays: [0, 6],
      openRecurringRules: [{ weekday: 6 }],
      closedRecurringRules: [{ weekday: 3 }, { businessDayOfMonth: 1 }],
    }),
    // When a weekday rule after the nth-business-day rule is shadowed, only used rules are counted (judging before
    // `unused` is settled would count the unused rule too and give 2 items)
    cal("fixed-counting-basis-shadowed-weekly", ["jp"], {
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ businessDayOfMonth: 1 }, { weekday: 3 }, { weekday: 3 }],
    }),
    // `value` written in a specific date of a calendar is unknown-option (passed silently up to 0.30.7)
    cal("fixed-calendar-date-with-value", ["jp"], {
      closedDates: [{ date: "2026-12-01", value: true }],
    }),
    // 0.32.8: the diagnostics of options with a rule counting on the own options and specific dates (the same
    // options as test/diagnose-counting-dates.test.ts).
    // No no-business-day for options in which extra closed days change the count and business days remain (P7).
    // Not compared with versions before 0.30.3 (the wrong redundant of specific dates fixed in 0.30.3 disappears
    // with the same options too, which does not fit into one allowance)
    {
      ...cal0("fixed-counting-closed-date-business-day", {
        closedRecurringRules: [
          { dayOfMonth: 1 },
          { businessDayOfMonth: Array.from({ length: 30 }, (_, i) => i + 2) },
        ],
        closedDates: ["2026-01-01"],
      }),
      minBase: "0.30.3",
    },
    // No never-matches / redundant for rules decided in the months and weeks of extra business days and extra
    // closed days outside the scan range (2001-2028) (P8, P9)
    cal0("fixed-counting-open-dates-2050", {
      closedWeekdays: [0, 6],
      openDates: ["2050-01-01", "2050-01-08", "2050-01-15", "2050-01-22", "2050-01-29"],
      closedRecurringRules: [{ businessDayOfMonth: 26 }],
    }),
    {
      ...cal0("fixed-counting-week-closed-date-2029", {
        closedWeekdays: [],
        closedRecurringRules: [{ weekday: 6 }, { businessDayOfWeek: 6, weekStart: 1 }],
        closedDates: ["2029-05-08"],
      }),
      minBase: "0.30.0",
    },
    cal0("fixed-counting-month-closed-date-2042", {
      closedWeekdays: [],
      closedRecurringRules: [{ dayOfMonth: 2 }, { businessDayOfMonth: 2 }],
      closedDates: [{ from: "2042-03-10", to: "2042-05-01" }],
    }),
    // A rule decided in the years outside a long extra closed date covering the scan range is not reported as
    // unused (P11)
    cal0("fixed-counting-long-closed-date", {
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: -1 }],
      closedDates: [{ from: "1000-01-01", to: "2029-03-31" }],
    }),
    // With unconfirmedHolidayPolicy: "throw", a rule whose removal would make a day throw for an unconfirmed
    // holiday is not redundant (P10)
    cal("fixed-unconfirmed-throw-after-holiday", ["jp"], {
      unconfirmedHolidayPolicy: "throw",
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ weekday: 6 }, { weekday: 1, holidayOverlapPolicy: "after-holiday" }],
    }),
    sch("fixed-unconfirmed-throw-after-holiday-schedule", ["jp"], {
      unconfirmedHolidayPolicy: "throw",
      weekdayValues: [null, "a", "a", "a", "a", "a", null],
      recurringRules: [
        { weekday: 6, value: null },
        { weekday: 1, holidayOverlapPolicy: "after-holiday", value: "b" },
      ],
    }),
    // No counting-basis for a weekly weekday rule that does not change how the closed weekday is treated (K6)
    cal("fixed-counting-basis-weekday-as-closed-weekday", ["jp"], {
      closedWeekdays: [1],
      closedRecurringRules: [{ weekday: 1 }, { businessDayOfMonth: 3 }],
    }),
  ];
}

/** The starts and ends of the specific dates ("YYYY-MM-DD", { date } and { from, to }) */
const dateEndsOf = (options: Obj): { from: string; to: string }[] =>
  ["closedDates", "openDates"].flatMap((k) =>
    Array.isArray(options[k])
      ? (options[k] as unknown[]).map((d) =>
          typeof d === "string"
            ? { from: d, to: d }
            : {
                from: String((d as Obj)["from"] ?? (d as Obj)["date"]),
                to: String((d as Obj)["to"] ?? (d as Obj)["date"]),
              },
        )
      : [],
  );
const dayCount = (from: string, to: string): number =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
/** A weekly weekday rule (a weekday rule without nth occurrence, every-other-week or month filter) */
const isWeeklyRule = (r: Obj): boolean =>
  "weekday" in r && !("nth" in r) && !("interval" in r) && !("months" in r);

/** The shape of a rule that depends on holidays (to compare rules of the same shape) */
const holidayShape = (r: Obj): string | undefined =>
  r["holiday"] === true
    ? "holiday"
    : r["dayAfterHoliday"] === true
      ? "dayAfterHoliday"
      : r["dayBeforeHoliday"] === true
        ? "dayBeforeHoliday"
        : undefined;

/**
 * The outOfRangePolicy of the basis calendar (which replaces CALENDAR_REF) of an nth-business-day rule of a
 * schedule. It inherits the one of the schedule's options (the default "throw" when omitted). Used by how
 * result-compare builds basis calendars and by how features are assigned
 */
export const basisOutOfRangePolicy = (c: Case): unknown => c.options["outOfRangePolicy"];

/**
 * The features of one set of options (the unit by which intended differences are allowed; `trait` of
 * etc/result-changes.json). For a pair of a combination the caller joins the features of both
 */
export function traitsOfCase(one: Case): string[] {
  const traits = new Set<string>();
  const hasJp = one.providers.includes("jp");
  const jpOnly = hasJp && one.providers.every((p) => p === "jp");
  // A calendar with a rule counting nth business days on its own options, and specific dates or annual dates
  // that change the count
  const counts = ["closedRecurringRules", "openRecurringRules"].some(
    (key) =>
      Array.isArray(one.options[key]) &&
      (one.options[key] as Obj[]).some(
        (r) => "businessDayOfMonth" in r || "businessDayOfWeek" in r,
      ),
  );
  if (
    one.kind === "calendar" &&
    counts &&
    ["closedDates", "openDates", "closedAnnualDates"].some(
      (k) => Array.isArray(one.options[k]) && (one.options[k] as unknown[]).length > 0,
    )
  )
    traits.add("counting-rules-with-dates");
  // Of the options above, those in which a specific date touches an edge month of the scan range (2001-2028
  // without a provider) or lies outside it, or is longer than 28 days. The diagnostics examine the scan range
  // without specific dates, and the months and weeks at both ends of each specific date with the dates, also
  // outside the range (0.32.8), so never-matches / redundant of rules can change, unlike for options with only
  // short dates inside the range
  if (
    one.kind === "calendar" &&
    counts &&
    dateEndsOf(one.options).some(
      ({ from, to }) => from < "2001-02-01" || to > "2028-11-30" || dayCount(from, to) > 27,
    )
  )
    traits.add("counting-rules-with-long-or-outside-dates");
  // Options with unconfirmedHolidayPolicy: "throw". A rule whose removal would make a day throw for an
  // unconfirmed holiday is not redundant (0.32.8)
  if (one.options["unconfirmedHolidayPolicy"] === "throw") traits.add("unconfirmed-holidays-throw");
  // Options with two or more rules and dates. redundant is judged by sequential removal (the judgement after
  // later rules were removed) and the rule that decides instead goes into relatedPath, so the redundant results
  // can change (0.31.0; a single one does not depend on other rules)
  const RULE_LISTS = [
    "closedDates",
    "openDates",
    "dates",
    "closedAnnualDates",
    "annualDates",
    "closedRecurringRules",
    "openRecurringRules",
    "recurringRules",
  ];
  const ruleCount = RULE_LISTS.reduce(
    (n, k) => n + (Array.isArray(one.options[k]) ? (one.options[k] as unknown[]).length : 0),
    0,
  );
  if (ruleCount >= 2) traits.add("redundant-sequential");
  // The supported years of the basis calendar (same providers) of an nth-business-day rule of a schedule do not
  // cover the representative 28 years (2001-2028) in which the diagnostics examine the shapes of rules, and the
  // basis calendar throws outside its supported years (outOfRangePolicy is not "ignore").
  // Allows the difference that the diagnostics treat a month in which the basis calendar threw as unjudgeable
  // and no longer report an out-of-range error
  if (
    one.kind === "schedule" &&
    basisOutOfRangePolicy(one) !== "ignore" &&
    Array.isArray(one.options["recurringRules"]) &&
    (one.options["recurringRules"] as Obj[]).some((r) => r["calendar"] === CALENDAR_REF) &&
    one.providers.some((p) => YEARS[p][0] > 2001 || YEARS[p][1] < 2028)
  )
    traits.add("schedule-counting-basis-narrower-than-scan");
  // Of the options above, those with a rule counting nth business days of a week on the basis calendar. The
  // diagnostics also make the months around a month in which the basis calendar threw unjudgeable (a week
  // across months is decided by the basis of the neighbouring month. 0.30.7). Allows the difference that the
  // wrong never-matches / redundant of 0.30.6 are no longer reported
  if (
    traits.has("schedule-counting-basis-narrower-than-scan") &&
    (one.options["recurringRules"] as Obj[]).some(
      (r) => r["calendar"] === CALENDAR_REF && "businessDayOfWeek" in r,
    )
  )
    traits.add("schedule-week-counting-basis-narrower-than-scan");
  // There is an nth-business-day rule without a basis calendar, and a weekly weekday rule with an effective
  // period or two or more weekly weekday rules.
  // Allows the difference that counting-basis is reported per used weekday rule whose effective period overlaps
  // (0.30.8)
  const ownRules = ["closedRecurringRules", "openRecurringRules"].flatMap((key) =>
    Array.isArray(one.options[key]) ? (one.options[key] as Obj[]) : [],
  );
  const weeklyRules = ownRules.filter(
    (r) => "weekday" in r && !("nth" in r) && !("interval" in r) && !("months" in r),
  );
  if (
    ownRules.some(
      (r) => ("businessDayOfMonth" in r || "businessDayOfWeek" in r) && !("calendar" in r),
    ) &&
    (weeklyRules.some((r) => "effectiveFrom" in r || "effectiveTo" in r) || weeklyRules.length >= 2)
  )
    traits.add("counting-rule-with-period-weekly-rule");
  // There is an nth-business-day rule without a basis calendar, and a weekly weekday rule that does not change
  // how that closed weekday is treated (a rule closing a closed weekday, a rule opening a weekday that is not
  // closed). No counting-basis for that rule (0.32.8)
  const closedWeekdays = Array.isArray(one.options["closedWeekdays"])
    ? (one.options["closedWeekdays"] as number[])
    : [0, 6];
  if (
    one.kind === "calendar" &&
    counts &&
    ["closedRecurringRules", "openRecurringRules"].some(
      (key) =>
        Array.isArray(one.options[key]) &&
        (one.options[key] as Obj[]).some(
          (r) =>
            isWeeklyRule(r) &&
            closedWeekdays.includes(r["weekday"] as number) === (key === "closedRecurringRules"),
        ),
    )
  )
    traits.add("counting-rule-with-weekly-rule-as-closed-weekdays");
  // An element of the specific dates or annual dates of a calendar has `value` (the way schedules write it). The
  // diagnostics gain an unknown-option (0.30.8)
  if (
    one.kind === "calendar" &&
    ["closedDates", "openDates", "closedAnnualDates"].some(
      (k) =>
        Array.isArray(one.options[k]) &&
        (one.options[k] as unknown[]).some(
          (e) => typeof e === "object" && e !== null && "value" in e,
        ),
    )
  )
    traits.add("calendar-date-with-value");
  for (const key of ["closedRecurringRules", "openRecurringRules", "recurringRules"]) {
    const list = one.options[key];
    if (!Array.isArray(list)) continue;
    const kindsOf = (r: Obj): string[] =>
      Array.isArray(r["kinds"]) ? (r["kinds"] as string[]) : [];
    for (const r of list as Obj[]) {
      if (hasJp && kindsOf(r).includes("regular")) traits.add("kinds-regular-with-jp");
      if (hasJp && !jpOnly && kindsOf(r).includes("national"))
        traits.add("kinds-national-in-union-with-jp");
      // Only when the same array also has a rule of the same shape with "regular" (a pair compared for covering)
      const shape = holidayShape(r);
      if (
        jpOnly &&
        shape !== undefined &&
        kindsOf(r).includes("national") &&
        (list as Obj[]).some(
          (x) => x !== r && holidayShape(x) === shape && kindsOf(x).includes("regular"),
        )
      )
        traits.add("kinds-national-and-regular-with-jp-only");
    }
  }
  return [...traits];
}

/** The parts of a version needed to build basis calendars (the creating function, and provider name → provider) */
export interface BasisLib {
  readonly createCalendar: (options: Obj) => unknown;
  readonly providers: ReadonlyMap<string, unknown>;
}

/**
 * The closed weekdays of the basis calendar (closedWeekdays; undefined means not written). Chosen by a separate
 * random generator decided by the id of the options (so that the generator's random sequence does not change).
 * In the forms the catalog generator makes (not written, a subset of the weekdays), with more closed weekends,
 * the common real case: not written 30%, weekends 40%, a subset chosen with 1/4 per weekday 30% (up to 0.30.7
 * never written)
 */
export function basisClosedWeekdays(c: Case): number[] | undefined {
  let seed = 0;
  for (const ch of c.id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const r = random(seed ^ 0x2c1b3c6d);
  const pick = r();
  if (pick < 0.3) return undefined;
  if (pick < 0.7) return [0, 6];
  const days = [0, 1, 2, 3, 4, 5, 6].filter(() => r() < 0.25);
  return days.length === 7 ? [0, 6] : days; // a calendar with every weekday closed cannot be created: weekends
}

/**
 * The mark put on the options of a basis calendar (so that the check of the generated range counts the features
 * of basis calendars separately; the library ignores it)
 */
export const BASIS_MARK = Symbol.for("bizdays-toolkit.result-compare.basis");

/**
 * Replaces the mark (CALENDAR_REF) for the basis calendar of an nth-business-day rule of a schedule by a
 * calendar with the same providers created with that version (per version: a calendar of another version is not
 * accepted). The closed weekdays are basisClosedWeekdays. The outOfRangePolicy of the basis calendar inherits
 * the one of the schedule's options (basisOutOfRangePolicy, the same function as for the features).
 * result-compare (scripts/result-compare.ts) uses it for both the previous and the current version. Both are
 * compared built the same way, so a break here would be no difference; therefore it is here and checked directly
 * by test/tools/result-traits.test.ts
 */
export function withCalendars(lib: BasisLib, c: Case, naming: "new" | "old", options: Obj): Obj {
  const key = naming === "old" ? "recurring" : "recurringRules";
  const list = options[key];
  if (!Array.isArray(list) || !list.some((r) => (r as Obj)["calendar"] === CALENDAR_REF))
    return options;
  const providers = c.providers.map((p) => lib.providers.get(p));
  const source: Obj =
    providers.length === 0
      ? {}
      : {
          [naming === "old" ? "holidays" : "holidayProvider"]: providers,
          timeZone: TIME_ZONES[c.providers[0]!],
        };
  const policy = basisOutOfRangePolicy(c);
  if (policy !== undefined) source[naming === "old" ? "outOfRange" : "outOfRangePolicy"] = policy;
  const closed = basisClosedWeekdays(c);
  if (closed !== undefined) source["closedWeekdays"] = closed;
  (source as Record<symbol, unknown>)[BASIS_MARK] = true;
  const calendar = lib.createCalendar(source);
  return {
    ...options,
    [key]: (list as Obj[]).map((r) => (r["calendar"] === CALENDAR_REF ? { ...r, calendar } : r)),
  };
}
