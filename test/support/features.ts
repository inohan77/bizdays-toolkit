// Extracts the set of "feature" strings from options (the inclusion check of the generated range;
// test/tools/generator-features.test.ts).
// Features are as fine as needed to tell apart the forms of options the generator makes: rule shape, keys,
// elements of values, array lengths, the era of dates, the years of effective periods, the kind of wrong input.
// Options written with old names are brought to the new names first (old values such as "national" stay).

import { DIAGNOSTIC_YEARS } from "../../src/core/diagnose.ts";
import { RENAMED_KEYS } from "../../src/core/renamed.ts";

type Obj = Record<string, unknown>;

/**
 * Rule shapes (identifying key → name of the public type). The same mapping as SHAPES of the catalog
 * (test/tools/catalog.test.ts compares them)
 */
export const PATTERN_OF: Readonly<Record<string, string>> = {
  weekday: "WeekdayPattern",
  dayOfMonth: "DayOfMonthPattern",
  businessDayOfMonth: "BusinessDayOfMonthPattern",
  businessDayOfWeek: "BusinessDayOfWeekPattern",
  cycle: "CyclePattern",
  holiday: "HolidayPattern",
  dayAfterHoliday: "DayAfterHolidayPattern",
  dayBeforeHoliday: "DayBeforeHolidayPattern",
};

/** Provider name (the options of result-compare keep providers by name) → ID */
export const PROVIDER_IDS: Readonly<Record<string, string>> = {
  jp: "JP",
  england: "GB-ENG",
  scotland: "GB-SCT",
  metropole: "FR",
  sg: "SG",
};

/** Provider name → supported years (the options of result-compare keep providers by name) */
const PROVIDER_YEARS: Readonly<Record<string, readonly [number, number]>> = {
  jp: [1955, 2099],
  england: [1974, 2099],
  scotland: [1974, 2099],
  metropole: [2000, 2099],
  sg: [2020, 2027],
};

const RULE_LISTS = ["closedRecurringRules", "openRecurringRules", "recurringRules"] as const;
const DATE_LISTS = ["closedDates", "openDates", "dates"] as const;
const ANNUAL_LISTS = ["closedAnnualDates", "annualDates"] as const;
/** The rule keys that get a feature per element of the value (other keys only get "present") */
const VALUE_KEYS = new Set([
  "weekday",
  "nth",
  "interval",
  "dayOfMonth",
  "businessDayOfMonth",
  "businessDayOfWeek",
  "weekStart",
  "cycle",
  "months",
  "weekdays",
  "kinds",
  "keys",
  "skipWeekdays",
  "holidayOverlapPolicy",
]);

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** Array length (4 or more are merged) */
const size = (n: number): string => (n >= 4 ? "4+" : String(n));
const year = (d: unknown): string | undefined =>
  typeof d === "string" && /^\d{4}-/.test(d) ? d.slice(0, 4) : undefined;
const decade = (d: unknown): string | undefined => {
  const y = year(d);
  return y === undefined ? undefined : `${y.slice(0, 3)}0`;
};
const weekdayOf = (d: string): number => new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay();

/** Turns old-name keys into the new names (`places` are the rename places that apply) */
function renameKeys(value: Obj, places: readonly string[]): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(value)) {
    const r = RENAMED_KEYS.find((x) => places.includes(x.place) && x.from === k);
    out[r ? r.to : k] = v;
  }
  return out;
}

/**
 * Brings the old names of options to the new names (`kind`: schedule or calendar; the old value "weekday" is
 * translated too)
 */
export function normalizeOptions(options: Obj, kind: "calendar" | "schedule"): Obj {
  const o = renameKeys(options, ["source", kind]);
  for (const k of RULE_LISTS)
    if (Array.isArray(o[k]))
      o[k] = (o[k] as unknown[]).map((r) => (isObj(r) ? renameKeys(r, ["rule"]) : r));
  if (kind === "schedule" && o["holidayPolicy"] === "weekday") o["holidayPolicy"] = "ignore";
  return o;
}

const providerId = (p: unknown): string =>
  typeof p === "string"
    ? (PROVIDER_IDS[p] ?? p)
    : isObj(p) && typeof p["id"] === "string"
      ? (p["id"] as string)
      : "?";

/** The IDs of the providers of options (a union is joined with +; "none" without a provider) */
export function providerKey(options: Obj): string {
  const p = options["holidayProvider"] ?? options["holidays"];
  if (p === undefined) return "none";
  return (Array.isArray(p) ? p : [p]).map(providerId).sort().join("+");
}

const DAY = 86_400_000;
const dayNumber = (d: string): number => Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY;
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/**
 * The base range of the diagnostics' scan (both ends as "YYYY-MM-DD"). The range before widening by effective
 * periods, decided as in scanWindow of src/core/diagnose.ts and clipped to the diagnostic range
 * (DIAGNOSTIC_YEARS): with providers the supported years (the union for outOfRangePolicy "ignore", otherwise
 * the intersection); without, from 2001 for the least common multiple of 28 years and the rules' cycles
 * (interval, cycle), or the whole diagnostic range when that does not fit into it. undefined when no day of the
 * diagnostic range can be judged. docs/decisions.md #31
 */
export function diagnoseRangeOf(options: Obj): { from: string; to: string } | undefined {
  const whole = { from: `${DIAGNOSTIC_YEARS.from}-01-01`, to: `${DIAGNOSTIC_YEARS.to}-12-31` };
  const p = options["holidayProvider"] ?? options["holidays"];
  const list = p === undefined ? [] : Array.isArray(p) ? p : [p];
  if (list.length === 0) {
    const max = dayNumber(whole.to) - dayNumber(whole.from) + 1;
    let days = 7;
    for (const k of RULE_LISTS)
      for (const r of Array.isArray(options[k]) ? (options[k] as unknown[]) : [])
        if (isObj(r)) {
          if (typeof r["interval"] === "number") days = Math.min(lcm(days, 7 * r["interval"]), max);
          if (typeof r["cycle"] === "number") days = Math.min(lcm(days, r["cycle"]), max);
        }
    const from = dayNumber("2001-01-01");
    const to = from + Math.min(lcm(dayNumber("2028-12-31") - from + 1, days), max) - 1;
    if (to > dayNumber(whole.to)) return whole;
    return { from: "2001-01-01", to: new Date(to * DAY).toISOString().slice(0, 10) };
  }
  const years = list.map((x): readonly [number, number] => {
    if (typeof x === "string") return PROVIDER_YEARS[x] ?? [0, -1];
    const y = isObj(x)
      ? (x["supportedYears"] as { from: number; to: number } | undefined)
      : undefined;
    return y ? [y.from, y.to] : [0, -1];
  });
  const ignore = (options["outOfRangePolicy"] ?? options["outOfRange"]) === "ignore";
  const from = Math.max(
    ignore ? Math.min(...years.map((y) => y[0])) : Math.max(...years.map((y) => y[0])),
    DIAGNOSTIC_YEARS.from,
  );
  const to = Math.min(
    ignore ? Math.max(...years.map((y) => y[1])) : Math.min(...years.map((y) => y[1])),
    DIAGNOSTIC_YEARS.to,
  );
  if (from > to) return undefined;
  return { from: `${from}-01-01`, to: `${to}-12-31` };
}

function addValues(out: Set<string>, prefix: string, value: unknown): void {
  if (Array.isArray(value)) {
    out.add(`${prefix}.size=${size(value.length)}`);
    for (const v of value) out.add(`${prefix}=${String(v)}`);
  } else out.add(`${prefix}=${String(value)}`);
}

/** The features of one recurring rule */
function ruleFeatures(
  out: Set<string>,
  list: string,
  rule: Obj,
  range: { from: string; to: string } | undefined,
  kind: "calendar" | "schedule",
): void {
  const discriminator = Object.keys(PATTERN_OF).find((k) => k in rule);
  const pattern = discriminator === undefined ? "UnknownPattern" : PATTERN_OF[discriminator]!;
  out.add(`${list}.pattern=${pattern}`);
  for (const [k, v] of Object.entries(rule)) {
    if (k === "effectiveFrom" || k === "effectiveTo") continue;
    if (VALUE_KEYS.has(k)) addValues(out, `${pattern}.${k}`, v);
    else out.add(`${pattern}.${k}=present`);
  }
  // The effective period (years, form, across a year end or not)
  const from = year(rule["effectiveFrom"]);
  const to = year(rule["effectiveTo"]);
  if (from !== undefined) out.add(`effectiveFrom.year=${from}`);
  if (to !== undefined) out.add(`effectiveTo.year=${to}`);
  if (from !== undefined || to !== undefined)
    out.add(
      `effectivePeriod=${from !== undefined && to !== undefined ? "both" : from !== undefined ? "from-only" : "to-only"}`,
    );
  if (from !== undefined && to !== undefined && from !== to) out.add("effectivePeriod=spans-years");
  // The relation to the diagnostics' scan range (across an end of the range, entirely outside it)
  const f = rule["effectiveFrom"] as string | undefined;
  const t = rule["effectiveTo"] as string | undefined;
  if (range !== undefined && (f !== undefined || t !== undefined)) {
    if (f !== undefined && t !== undefined && f <= range.to && t > range.to)
      out.add("effectivePeriod.scanRange=crosses-end");
    if (f !== undefined && t !== undefined && f < range.from && t >= range.from)
      out.add("effectivePeriod.scanRange=crosses-start");
    if ((f !== undefined && f > range.to) || (t !== undefined && t < range.from))
      out.add("effectivePeriod.scanRange=outside");
  }
  // The last day of the cycle (positions includes cycle)
  if (
    typeof rule["cycle"] === "number" &&
    Array.isArray(rule["positions"]) &&
    (rule["positions"] as unknown[]).includes(rule["cycle"])
  )
    out.add("CyclePattern.positions=last");
  // A wrong input (options whose creation gives invalid-option; used for the comparison that aligns error codes
  // with the previous version)
  if (
    kind === "schedule" &&
    ("businessDayOfMonth" in rule || "businessDayOfWeek" in rule) &&
    !("calendar" in rule)
  )
    out.add("invalid=counting-without-calendar");
  if (typeof rule["weekday"] === "number") {
    if (typeof rule["anchor"] === "string" && weekdayOf(rule["anchor"]) !== rule["weekday"])
      out.add("invalid=anchor-mismatch");
    if (
      Array.isArray(rule["skipWeekdays"]) &&
      (rule["skipWeekdays"] as unknown[]).includes(rule["weekday"])
    )
      out.add("invalid=skip-own-weekday");
  }
}

/** The features of one annual date */
function annualFeatures(out: Set<string>, list: string, value: unknown): void {
  if (typeof value === "string") {
    out.add(`${list}.form=string`);
    out.add(`${list}.value=${value}`);
    return;
  }
  if (!isObj(value)) return;
  if (typeof value["date"] === "string") {
    out.add(`${list}.form=date`);
    out.add(`${list}.value=${value["date"] as string}`);
  } else if (typeof value["from"] === "string") {
    out.add(`${list}.form=range`);
    out.add(`${list}.value=${value["from"] as string}..${String(value["to"])}`);
  }
  if ("effectiveFrom" in value || "effectiveTo" in value) out.add(`${list}.effective=present`);
  if ("value" in value) out.add(`${list}.scheduleValue=present`);
  if ("name" in value) out.add(`${list}.name=present`);
}

/** The features of one specific date */
function dateFeatures(out: Set<string>, list: string, value: unknown): void {
  const from =
    typeof value === "string" ? value : isObj(value) ? (value["from"] ?? value["date"]) : undefined;
  out.add(
    `${list}.form=${typeof value === "string" ? "string" : isObj(value) && "from" in value ? "range" : "date"}`,
  );
  const d = decade(from);
  if (d !== undefined) out.add(`${list}.decade=${d}`);
  if (isObj(value) && "name" in value) out.add(`${list}.name=present`);
}

/**
 * The features of options. `kind`: schedule or calendar (used for translating old names)
 */
export function featuresOf(options: Obj, kind: "calendar" | "schedule" = "calendar"): Set<string> {
  const out = new Set<string>();
  const o = normalizeOptions(options, kind);
  out.add(`kind=${kind}`);
  const provider = providerKey(o);
  const range = diagnoseRangeOf(o);
  out.add(`holidayProvider=${provider}`);
  if (provider.includes("+")) out.add("holidayProvider.union=present");
  for (const [k, v] of Object.entries(o)) {
    if (k === "holidayProvider") continue;
    if (k === "closedWeekdays") {
      if (Array.isArray(v)) addValues(out, "closedWeekdays", v);
    } else if (k === "holidayPolicy") {
      out.add(`holidayPolicy=${isObj(v) ? Object.keys(v).join("+") : String(v)}`);
    } else if (k === "weekdayValues") {
      out.add(
        `weekdayValues.type=${Array.isArray(v) ? [...new Set(v.map((x) => typeof x))].join("+") : "?"}`,
      );
    } else if ((RULE_LISTS as readonly string[]).includes(k)) {
      if (!Array.isArray(v)) continue;
      out.add(`${k}.size=${size(v.length)}`);
      for (const r of v) if (isObj(r)) ruleFeatures(out, k, r, range, kind);
    } else if ((DATE_LISTS as readonly string[]).includes(k)) {
      if (!Array.isArray(v)) continue;
      out.add(`${k}.size=${size(v.length)}`);
      for (const d of v) dateFeatures(out, k, d);
    } else if ((ANNUAL_LISTS as readonly string[]).includes(k)) {
      if (!Array.isArray(v)) continue;
      out.add(`${k}.size=${size(v.length)}`);
      for (const a of v) annualFeatures(out, k, a);
    } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out.add(`${k}=${String(v)}`);
    } else out.add(`${k}=present`);
  }
  if (!("closedWeekdays" in o) && kind === "calendar") out.add("closedWeekdays=absent");
  return out;
}

/**
 * The features of the range of dates asked about (per provider: the eras the range covers, whether it spans
 * decades, whether it includes days outside the diagnostics' scan range).
 * from and to are "YYYY-MM-DD"; range is the result of diagnoseRangeOf
 */
export function scanFeatures(
  provider: string,
  from: string,
  to: string,
  range?: { from: string; to: string },
): Set<string> {
  const out = new Set<string>();
  for (let y = Number(from.slice(0, 3)) * 10; y <= Number(to.slice(0, 4)); y += 10)
    out.add(`scan[${provider}].decade=${y}`);
  if (Number(to.slice(0, 4)) - Number(from.slice(0, 4)) >= 20)
    out.add(`scan[${provider}].span=decades`);
  if (range !== undefined && (from < range.from || to > range.to))
    out.add(`scan[${provider}].outsideDiagnoseRange=present`);
  return out;
}
