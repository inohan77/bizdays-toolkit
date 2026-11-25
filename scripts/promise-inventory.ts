import "./strict-warnings.ts";
/**
 * The promise inventory (G4 of the plan; RELEASING.md, "Checks that keep the promises of the diagnostics"): random
 * options over many dimensions, on which the two promises of the diagnostics are checked directly.
 *
 *   (1) removing all reported rules together (shadowed, never-matches, redundant, out-of-range "so this rule is
 *       never used"; with asOf also expired) does not change the result of a day that could be judged before;
 *   (2) when no-business-day is reported, no day is a business day.
 *
 * The days compared are every day of the diagnostic range (test/support/promise-days.ts; never the scan ranges of
 * the diagnostics). The options come from the catalog (test/support/catalog.ts, the context "promise-inventory"
 * with years chosen per options) with providers of several lengths of supported years, outOfRangePolicy "throw"
 * and "ignore", unconfirmedHolidayPolicy "throw", rules counting business days, specific dates and effective
 * periods inside, across and outside the diagnostic range, schedule values that are objects and arrays, basis
 * calendars with rules and dates, the old kind "national", long runs of holidays, and calendars closed on every
 * weekday.
 * The library is loaded from src (so that scripts/check-promise-coverage.ts can measure which lines of
 * src/core/diagnose.ts the promise checks reach).
 *
 * The full set is the groups of GROUPS (the promise-inventory job of CI). Options found to break a promise are
 * printed as FINDING with what is needed to reproduce them, and make the exit code 1.
 *
 *   node scripts/promise-inventory.ts                  ... the full set (every group)
 *   node scripts/promise-inventory.ts --shard 1/4      ... the groups of one shard (CI splits the full set)
 *   node scripts/promise-inventory.ts --every 100       ... builds every option but checks 1 in 100 (pnpm check)
 *   node scripts/promise-inventory.ts --dimensions     ... builds the options of the full set without running the
 *                                                          diagnostics and checks the cells against
 *                                                          etc/promise-dimensions.json (pnpm check)
 *   node scripts/promise-inventory.ts --group cal-1    ... one group (to reproduce a FINDING)
 *   --verbose prints the count of every cell.
 * Exit code: 0 = pass, 1 = a FINDING, an empty run or a problem of the table of dimensions, 2 = wrong arguments.
 */

import { readFileSync } from "node:fs";
import { DIAGNOSTIC_YEARS } from "../src/core/diagnose.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { sg } from "../src/sg/index.ts";
import {
  CALENDAR_REF,
  CONTEXTS,
  picker,
  random,
  randomCalendarOptions,
  randomScheduleOptions,
  withoutHolidays,
  type Obj,
  type Picker,
} from "../test/support/catalog.ts";
import {
  compareRemoval,
  promiseDays,
  removablePaths,
  removePaths,
  resultsOf,
} from "../test/support/promise-days.ts";
import {
  INVENTORY_GROUPS,
  PROVIDER_CLASSES,
  YEAR_CLASSES,
  cellKey,
  checkConditions,
  checkDimensions,
  hasCountingRule,
  periodClass,
  periodsOf,
  providerClass,
  yearClass,
  type DimensionTable,
  type InventoryGroup,
  type Years,
} from "./promise-parts.ts";

/** One group of the full set (the groups are in scripts/promise-parts.ts, shared with the coverage of the promises) */
type Group = InventoryGroup;

/** The full set: the groups of {@link INVENTORY_GROUPS} */
export const GROUPS: readonly Group[] = INVENTORY_GROUPS;
/** The number of shards of CI (--shard i/4): the groups are dealt out in order */
const SHARDS = 4;

const RANGE: Years = DIAGNOSTIC_YEARS;
const pad4 = (y: number): string => String(y).padStart(4, "0");

// ------------------------------------------------------------
// Arguments
// ------------------------------------------------------------

const args = process.argv.slice(2);
const usage = (message: string): never => {
  console.error(message);
  console.error(
    "usage: node scripts/promise-inventory.ts [--shard <i>/<n>] [--group <name>] [--every <n>] [--dimensions] [--verbose]",
  );
  process.exit(2);
};
const known = new Set(["--shard", "--group", "--every", "--dimensions", "--verbose"]);
for (let i = 0; i < args.length; i++) {
  if (!known.has(args[i]!)) usage(`unknown argument ${args[i]!}`);
  if (["--shard", "--group", "--every"].includes(args[i]!)) i++;
}
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined) usage(`${name} needs a value`);
  return v;
};
const DIMENSIONS = args.includes("--dimensions");
const VERBOSE = args.includes("--verbose");
const everyText = argValue("--every") ?? "1";
const EVERY = Number(everyText);
if (!Number.isInteger(EVERY) || EVERY < 1) usage(`--every: invalid value ${everyText}`);
let groups = [...GROUPS];
const shardText = argValue("--shard");
if (shardText !== undefined) {
  const m = /^(\d+)\/(\d+)$/.exec(shardText);
  if (!m || Number(m[2]) !== SHARDS || Number(m[1]) < 1 || Number(m[1]) > SHARDS)
    usage(`--shard: invalid value ${shardText} (1/${SHARDS} to ${SHARDS}/${SHARDS})`);
  groups = groups.filter((_, i) => i % SHARDS === Number(m![1]) - 1);
}
const groupText = argValue("--group");
if (groupText !== undefined) {
  groups = groups.filter((g) => g.name === groupText);
  if (groups.length === 0) usage(`--group: unknown group ${groupText}`);
}
if (DIMENSIONS && (shardText !== undefined || groupText !== undefined || EVERY !== 1))
  usage("--dimensions builds the full set and takes no other argument");

// ------------------------------------------------------------
// The providers (the dimension of the supported years)
// ------------------------------------------------------------

/**
 * A home-made provider with a holiday on January 1 and, in odd years, one in May (unconfirmed from a year on).
 * @param id - The id.
 * @param from - The first supported year.
 * @param to - The last supported year.
 * @param unconfirmedFrom - The first year whose May holiday is unconfirmed.
 * @returns The provider.
 */
const custom = (id: string, from: number, to: number, unconfirmedFrom = 99999): Obj => ({
  id,
  timeZone: "UTC",
  supportedYears: { from, to },
  dataVersion: "1",
  holidaysInYear: (y: number) => [
    { date: `${pad4(y)}-01-01`, name: "N", nameEn: "N", kind: "regular", confirmed: true },
    ...(y % 2
      ? [
          {
            date: `${pad4(y)}-05-0${1 + (y % 7)}`,
            name: "M",
            nameEn: "M",
            kind: "regular",
            confirmed: y < unconfirmedFrom,
          },
        ]
      : []),
  ],
});
/**
 * A provider with runs of holidays from May 1, with kinds mixed: 40 days in every fourth year (longer than an
 * "after-holiday" rule can reach back, so the rule cannot be moved: holiday-run-too-long), 12 days in other years
 * divisible by 3, 3 days in the rest
 */
const runs = (): Obj => ({
  id: "R",
  timeZone: "UTC",
  supportedYears: { from: 2000, to: 2100 },
  dataVersion: "1",
  holidaysInYear: (y: number) =>
    Array.from({ length: y % 4 === 0 ? 40 : y % 3 === 0 ? 12 : 3 }, (_, i) => {
      const t = new Date(Date.UTC(y, 4, 1 + i));
      return {
        date: `${y}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`,
        name: "G",
        nameEn: "G",
        kind: i % 2 ? "regular" : "national",
        confirmed: true,
      };
    }),
});
/** [name, the provider (or providers), the common part of the supported years] */
const SOURCES: readonly [string, () => unknown, Years | null][] = [
  ["none", () => undefined, null],
  ["jp", () => jp, { from: 1955, to: 2099 }],
  ["sg", () => sg, { from: 2020, to: 2027 }],
  ["custom 1955-2099", () => custom("D", 1955, 2099, 2031), { from: 1955, to: 2099 }],
  ["custom 1960-2090", () => custom("I", 1960, 2090, 2031), { from: 1960, to: 2090 }],
  ["custom 2000-2100", () => custom("C", 2000, 2100, 2031), { from: 2000, to: 2100 }],
  ["custom 2200-2300", () => custom("O", 2200, 2300), { from: 2200, to: 2300 }],
  ["custom 1800-2400", () => custom("W", 1800, 2400, 2031), { from: 1800, to: 2400 }],
  ["custom 1000-9999", () => custom("H", 1000, 9999), { from: 1000, to: 9999 }],
  ["runs 2000-2100", runs, { from: 2000, to: 2100 }],
  [
    "two: 1800-2400 + 2000-2100",
    () => [custom("W", 1800, 2400), custom("C", 2000, 2100)],
    { from: 2000, to: 2100 },
  ],
  ["two: jp + 2000-2100", () => [jp, custom("C", 2000, 2100)], { from: 2000, to: 2099 }],
  ["runs two: runs + 2000-2100", () => [runs(), custom("C", 2000, 2100)], { from: 2000, to: 2100 }],
  [
    "two: 1800-2400 + 1700-2300",
    () => [custom("W", 1800, 2400), custom("V", 1700, 2300)],
    { from: 1800, to: 2300 },
  ],
];
/** The years from which dates and effective periods are made */
const YEARS: readonly [number, number][] = [
  [2026, 2026],
  [1960, 2095],
  [2029, 2035],
  [1995, 2001],
  [2090, 2099],
  [1950, 1957],
  [2097, 2102],
  [1850, 1860],
  [2150, 2160],
  [2390, 2399],
  [1801, 1803],
  [2298, 2300],
  [2600, 2610],
  [1001, 1003],
  [9990, 9998],
];
const DATE_YEARS = [
  2026, 2010, 1950, 1954, 1955, 2098, 2099, 2100, 2150, 1850, 2350, 1800, 2400, 2300, 2600, 1500,
  1000, 9999, 1899,
];
/** The years of options whose dates and effective periods all lie inside the diagnostic range */
const INSIDE_YEARS: readonly [number, number] = [1960, 2090];
const INSIDE_DATE_YEARS = [1960, 2010, 2026, 2050, 2090];

// ------------------------------------------------------------
// Building the options
// ------------------------------------------------------------

const DAY = 86_400_000;
const addDays = (d: string, n: number): string => {
  const t = new Date(Date.parse(`2000${d.slice(4)}T00:00:00Z`));
  t.setUTCFullYear(Number(d.slice(0, 4)));
  const r = new Date(t.getTime() + n * DAY);
  return `${pad4(r.getUTCFullYear())}-${String(r.getUTCMonth() + 1).padStart(2, "0")}-${String(r.getUTCDate()).padStart(2, "0")}`;
};

/** One set of options of the inventory, before the providers are put in */
interface Made {
  readonly source: (typeof SOURCES)[number];
  readonly policy: "-" | "throw" | "ignore";
  readonly unconfirmed: boolean;
  readonly options: Obj;
  readonly basisOptions: Obj;
  /** How the basis calendar of a schedule is made */
  readonly basisKind: "plain" | "combined" | "from schedule" | "not readable";
  /**
   * What a basis that is "not readable" throws in the months {@link foreignThrowsIn} names: nothing, a TypeError,
   * or the value null (an object shaped like a calendar may throw anything)
   */
  readonly basisThrows: "nothing" | "TypeError" | "null";
  /**
   * Whether a basis that is "not readable" is a copy of a created calendar made with spread (the holder of its
   * contents is copied, but its owner differs, so the diagnostics must not read the contents; decisions.md #31)
   */
  readonly basisCopy: boolean;
  /**
   * The provider and the policies of the basis calendar: those of the schedule ("same"), or another provider
   * with its own policies (the supported years of the basis then differ from those of the schedule, and the
   * basis may throw out-of-range or unconfirmed-holiday where the schedule can be judged)
   */
  readonly basisSource:
    | "same"
    | readonly [name: string, policy: "throw" | "ignore", unconfirmed: boolean];
  readonly objValues: boolean;
  readonly asOf: string | undefined;
}

/**
 * Builds one set of options.
 * @param p - The random picker of the group.
 * @param group - The group.
 * @returns The options and how to complete them.
 */
function build(p: Picker, group: Group): Made {
  const cal = group.kind === "calendar";
  // The cell is chosen first (each value of a dimension equally often), then options of that cell are built
  // (a class without a source is not chosen; the check of the dimensions then finds its cells empty)
  const providerTarget = p.pick(
    PROVIDER_CLASSES.filter((c) => SOURCES.some((s) => providerClass(s[2], RANGE) === c)),
  );
  const source = p.pick(SOURCES.filter((s) => providerClass(s[2], RANGE) === providerTarget));
  const counting = p.chance(0.5);
  const yearsTarget = p.pick(YEAR_CLASSES);
  const name = source[0];
  const policy = name === "none" ? "-" : p.pick<"throw" | "ignore">(["throw", "ignore"]);
  const unconfirmed = p.chance(name === "none" ? 0.1 : 0.35);
  const inside = yearsTarget === "inside" || yearsTarget === "no items";
  const base = {
    ...CONTEXTS["promise-inventory"],
    years: inside ? INSIDE_YEARS : p.pick(YEARS),
    effectiveYears: inside ? INSIDE_YEARS : p.pick(YEARS),
    ...(!inside && p.chance(0.4) ? { wideDates: true } : {}),
  };
  // Without a provider, no rule tied to holidays is made from the catalog
  const ctx = name === "none" ? withoutHolidays(base) : base;
  const options: Obj = { ...(cal ? randomCalendarOptions(p, ctx) : randomScheduleOptions(p, ctx)) };
  if (name === "none") delete options["holidayPolicy"];
  const DK = cal ? ["closedDates", "openDates"] : ["dates"];
  const RK = cal ? ["closedRecurringRules", "openRecurringRules"] : ["recurringRules"];
  const val = (): Obj => (cal ? {} : { value: p.pick(["A", "B", "closed"]) });
  const append = (key: string, items: unknown[], front = false): void => {
    const old = (options[key] as unknown[] | undefined) ?? [];
    options[key] = front ? [...items, ...old] : [...old, ...items];
  };
  if (counting) {
    // A rule counting business days (on the own options; for a schedule, on the basis calendar), a day or
    // weekday rule before it, and specific dates in many years
    append(RK[0 + (RK.length > 1 && p.chance(0.5) ? 1 : 0)]!, [
      {
        ...p.pick<Obj>([
          { businessDayOfMonth: p.pick([1, 2, 3, -1, -2, 20, 23]) },
          { businessDayOfWeek: p.pick([1, 2, 5, 6, -1]), weekStart: p.pick([0, 1]) },
        ]),
        ...val(),
        ...(cal ? {} : { calendar: CALENDAR_REF }),
      },
    ]);
    if (p.chance(0.5))
      append(
        RK[0]!,
        [
          {
            ...p.pick<Obj>([{ weekday: p.int(0, 6) }, { dayOfMonth: p.pick([1, 2, 3, -1]) }]),
            ...val(),
          },
        ],
        true,
      );
    const date = (): Obj => {
      const y = p.pick(inside ? INSIDE_DATE_YEARS : DATE_YEARS);
      const d = `${pad4(y)}-${String(p.int(1, 12)).padStart(2, "0")}-${String(p.int(1, 28)).padStart(2, "0")}`;
      const to = p.chance(0.6) ? d : addDays(d, p.pick([1, 4, 30, 400]));
      return {
        from: d,
        to: to > "9999-12-31" || to.length > 10 ? d : to,
        ...(cal ? {} : { value: "X" }),
      };
    };
    if (p.chance(0.8))
      for (const k of DK)
        if (k === DK[0] || p.chance(0.4)) append(k, [date(), ...(p.chance(0.3) ? [date()] : [])]);
  }
  const objValues = !cal && p.chance(0.4);
  const basisOptions: Obj = p.chance(0.6)
    ? { ...randomCalendarOptions(p, { ...ctx, wideDates: !inside }) }
    : { closedWeekdays: [0, 6] };
  if (name === "none") delete basisOptions["holidayPolicy"];
  for (const k of ["closedRecurringRules", "openRecurringRules"])
    if (basisOptions[k])
      basisOptions[k] = (basisOptions[k] as Obj[]).filter(
        (r) => !("businessDayOfMonth" in r) || p.chance(0.5),
      );
  // A rule tied to holidays without a provider matches no day
  if (name === "none" && p.chance(0.15)) append(RK[0]!, [{ holiday: true, ...val() }]);
  // With the runs of holidays, a rule on May 1 moved after the run cannot be moved (the run lasts 40 days)
  if (name.startsWith("runs"))
    append(RK[0]!, [
      { dayOfMonth: 1, months: [5], holidayOverlapPolicy: "after-holiday", ...val() },
    ]);
  // With only the Japanese provider, the old kind "national" is read as "regular" when no holiday of the kind
  // "national" is examined; two holiday rules make the diagnostics compare their kinds
  if (name === "jp" && p.chance(0.6))
    append(RK[0]!, [
      { holiday: true, kinds: ["national"], ...val() },
      { holiday: true, kinds: p.pick([["regular"], ["regular", "substitute"]]), ...val() },
    ]);
  if (name !== "none" && p.chance(0.5))
    append(RK[0]!, [
      {
        ...p.pick<Obj>([
          { holiday: true, kinds: p.pick([["national"], ["national", "regular"], ["regular"]]) },
          { weekday: p.int(0, 6), holidayOverlapPolicy: "after-holiday" },
          { weekday: p.int(1, 5), holidayOverlapPolicy: "after-holiday", skipWeekdays: [0, 6] },
        ]),
        ...val(),
      },
    ]);
  // A calendar closed on every weekday (no-business-day is reported unless something opens a day of the range),
  // half of them with a rule that opens the day after holidays
  if (cal && p.chance(name.startsWith("runs") ? 0.4 : 0.12)) {
    options["closedWeekdays"] = [0, 1, 2, 3, 4, 5, 6];
    if (name !== "none" && p.chance(0.5))
      append("openRecurringRules", [
        p.pick<Obj>([
          { weekday: p.int(0, 6), holidayOverlapPolicy: "after-holiday" },
          { dayOfMonth: 1, months: [5], holidayOverlapPolicy: "after-holiday" },
        ]),
      ]);
  }
  if (!counting)
    for (const k of RK)
      if (Array.isArray(options[k]))
        options[k] = (options[k] as Obj[]).filter(
          (r) => !("businessDayOfMonth" in r) && !("businessDayOfWeek" in r),
        );
  shapeYears(p, options, yearsTarget, cal);
  const basisKind = cal
    ? "plain"
    : p.pick<Made["basisKind"]>([
        "plain",
        "plain",
        "plain",
        "combined",
        "from schedule",
        "not readable",
      ]);
  const asOf = group.asOf
    ? `${p.pick([2026, 2030, 2010, 2099, 2150, 1850])}-${String(p.int(1, 12)).padStart(2, "0")}-15`
    : undefined;
  // Chosen in turn, not with the picker (the options made so far stay the same)
  const foreign = basisKind === "not readable" ? foreignBases++ % 4 : -1;
  const basisThrows = foreign === 1 ? "TypeError" : foreign === 2 ? "null" : "nothing";
  const basisCopy = foreign === 3;
  // Half of the bases have the provider and the policies of the schedule; the others take the providers in
  // turn, with "throw" (and unconfirmed holidays thrown) or "ignore"
  const turn = basisSources++;
  const other = SOURCES[(turn >> 2) % SOURCES.length]![0];
  const basisSource: Made["basisSource"] =
    turn % 4 < 2 ? "same" : [other, turn % 4 === 2 ? "throw" : "ignore", turn % 4 === 2];
  return {
    source,
    policy,
    unconfirmed,
    options,
    basisOptions,
    basisKind,
    basisThrows,
    basisCopy,
    basisSource,
    objValues,
    asOf,
  };
}

/**
 * Makes the dates and effective periods of options fit a class of years (yearClass of scripts/promise-parts.ts):
 * "no items" removes them; "inside" removes those not inside the diagnostic range; "straddle" removes those
 * outside it; and every class but "no items" adds one item of its own class when none is left.
 * @param p - The random picker.
 * @param options - The options (changed in place).
 * @param target - The class of years to make.
 * @param cal - Whether the options are of a calendar (otherwise of a schedule).
 */
function shapeYears(
  p: Picker,
  options: Obj,
  target: (typeof YEAR_CLASSES)[number],
  cal: boolean,
): void {
  const DK = cal ? ["closedDates", "openDates"] : ["dates"];
  const RK = cal
    ? ["closedRecurringRules", "openRecurringRules", "closedAnnualDates"]
    : ["recurringRules", "annualDates"];
  const keep = (c: "inside" | "straddle" | "outside"): boolean =>
    target === "outside" || (target === "straddle" ? c !== "outside" : c === "inside");
  for (const k of DK) {
    if (!Array.isArray(options[k])) continue;
    options[k] =
      target === "no items"
        ? []
        : (options[k] as unknown[]).filter((d) => {
            const [[from, to]] = periodsOf({ dates: [d] }) as [[string, string]];
            return keep(periodClass(from, to, RANGE));
          });
  }
  for (const k of RK) {
    if (!Array.isArray(options[k])) continue;
    options[k] = (options[k] as Obj[]).map((r) => {
      const period = periodsOf({ recurringRules: [r] })[0];
      if (
        period === undefined ||
        (target !== "no items" && keep(periodClass(period[0], period[1], RANGE)))
      )
        return r;
      const { effectiveFrom: _from, effectiveTo: _to, ...rest } = r;
      return rest;
    });
  }
  if (target === "no items" || yearClass(options, RANGE) === target) return;
  const value = cal ? {} : { value: "X" };
  const added =
    target === "inside"
      ? p.pick<Obj>([
          { from: "2026-03-02", to: "2026-03-06" },
          { from: "1955-01-01", to: "1955-01-10" },
        ])
      : target === "straddle"
        ? p.pick<Obj>([
            { from: "2099-12-20", to: "2100-01-10" },
            { from: "1954-12-25", to: "1955-01-05" },
          ])
        : p.pick<Obj>([
            { from: "2206-05-01", to: "2206-05-01" },
            { from: "1940-08-01", to: "1940-08-31" },
          ]);
  const key = DK[p.int(0, DK.length - 1)]!;
  options[key] = [...((options[key] as unknown[] | undefined) ?? []), { ...added, ...value }];
}

/** The number of bases that are "not readable" made so far in the group (decides what the next one throws) */
let foreignBases = 0;
/** The number of options built so far in the group (decides the provider of the next basis) */
let basisSources = 0;
/**
 * The provider and the policies of the basis calendar of a schedule.
 * @param made - What was built.
 * @param sourceOptions - The provider and the policies of the schedule.
 * @returns The options to merge into the options of the basis.
 */
function basisSourceOptions(made: Made, sourceOptions: Obj): Obj {
  if (made.basisSource === "same") return sourceOptions;
  const [name, policy, unconfirmed] = made.basisSource;
  if (name === "none") return {};
  const source = SOURCES.find((s) => s[0] === name)!;
  return {
    holidayProvider: source[1](),
    timeZone: "UTC",
    ...(policy === "ignore" ? { outOfRangePolicy: "ignore" } : {}),
    ...(unconfirmed ? { unconfirmedHolidayPolicy: "throw" } : {}),
  };
}
/**
 * The months in which a throwing basis throws: 1 month in 7, counted from year 0 (so every month of the year and
 * both ends of the diagnostic range occur).
 * @param date - A date.
 * @returns Whether the basis throws for the date.
 */
const foreignThrowsIn = (date: string): boolean =>
  (Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))) % 7 === 3;

/** Nesting deeper than the diagnostics can compare (they treat such values as different) */
const DEEP = 20_000;
/**
 * Schedule values that are objects and arrays (the diagnostics compare plain objects and arrays by content and
 * other objects by identity): a plain object, an array, an object that refers to itself, an object without a
 * prototype, a Date, an object holding the same object twice (or two equal objects), and an array nested DEEP
 * times.
 * @param v - A value as built ("A", "B", "C", "closed", "X", ...).
 * @returns The value to put into the options (a new object each time).
 */
const toObjectValue = (v: unknown): unknown => {
  if (typeof v === "string" && VALUE_KINDS[v] !== undefined) valueLetters.add(VALUE_KINDS[v]);
  switch (v) {
    case "T":
      // A value whose reading throws: a getter that throws
      return Object.defineProperty({ k: "T" }, "boom", {
        enumerable: true,
        get: () => {
          throw new TypeError("unreadable value");
        },
      });
    case "P":
      // A value whose reading throws: a proxy whose prototype cannot be read
      return new Proxy(
        { k: "P" },
        {
          getPrototypeOf: () => {
            throw new TypeError("unreadable value");
          },
        },
      );
    case "A":
      return { k: "A", n: [1, 2] };
    case "B":
      return ["B", { deep: { x: 1 } }];
    case "C": {
      const self: Obj = { k: "C" };
      self["self"] = self;
      return self;
    }
    case "H":
      return Object.assign(Object.create(null) as Obj, { k: "H" });
    case "S": {
      // The same object under two keys
      const one = { k: "S" };
      return { x: one, y: one };
    }
    case "E":
      // Two equal objects (compared object by object). Removing a rule whose value is "S" on a day whose value
      // becomes "E" compares one object of the first value with two of the second (the record of pairs on the
      // way: sameValueIn)
      return { x: { k: "S" }, y: { k: "S" } };
    case "X":
      return new Date(Date.UTC(2026, 0, 1));
    case "D": {
      let deep: unknown = "D";
      for (let i = 0; i < DEEP; i++) deep = [deep];
      return deep;
    }
    default:
      return v;
  }
};

/**
 * Puts the providers, the basis calendar and the object values into options.
 * @param made - The options as built.
 * @param kind - The kind of options.
 * @returns The options to diagnose and evaluate.
 */
function complete(made: Made, kind: Group["kind"]): Obj {
  valueLetters.clear();
  const { source, policy, unconfirmed, objValues } = made;
  const provider = source[1]();
  const sourceOptions: Obj =
    source[0] === "none"
      ? {}
      : {
          holidayProvider: provider,
          timeZone: "UTC",
          ...(policy === "ignore" ? { outOfRangePolicy: "ignore" } : {}),
        };
  const o: Obj = {
    ...made.options,
    ...sourceOptions,
    ...(unconfirmed ? { unconfirmedHolidayPolicy: "throw" } : {}),
  };
  if (kind === "schedule") {
    const plain = createCalendar({
      ...made.basisOptions,
      ...basisSourceOptions(made, sourceOptions),
    } as never);
    const basis =
      made.basisKind === "combined"
        ? combineCalendars(
            [plain, createCalendar({ closedWeekdays: [0], ...sourceOptions } as never)],
            { open: "all" },
          )
        : made.basisKind === "from schedule"
          ? createCalendarFromSchedule(
              createSchedule({
                weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
                recurringRules: [{ businessDayOfMonth: -1, calendar: plain, value: "closed" }],
                ...sourceOptions,
              } as never),
              (v) => v === "open",
            )
          : made.basisKind === "not readable"
            ? // An object shaped like a calendar that this library did not make. In some months it may throw
              // something that is not an error of this library (the same for every call: the days of those
              // months cannot be judged, before and after a removal)
              made.basisCopy
              ? { ...plain }
              : {
                  timeZone: plain.timeZone,
                  isBusinessDay: (d: string) => {
                    if (made.basisThrows !== "nothing" && foreignThrowsIn(d)) {
                      if (made.basisThrows === "TypeError") throw new TypeError("foreign basis");
                      // eslint-disable-next-line no-throw-literal -- what a foreign object may do
                      throw null;
                    }
                    return plain.isBusinessDay(d);
                  },
                }
            : plain;
    if (Array.isArray(o["recurringRules"]))
      o["recurringRules"] = (o["recurringRules"] as Obj[]).map((r) =>
        r["calendar"] === CALENDAR_REF ? { ...r, calendar: basis } : r,
      );
    if (objValues) {
      for (const k of ["recurringRules", "dates", "annualDates"])
        if (Array.isArray(o[k]))
          o[k] = (o[k] as Obj[]).map((r, i) => {
            // Some values of rules and dates become the other kinds of objects. The deeply nested value is
            // given only to a specific date of one day (writing such a value as the result of every day would
            // take much memory and time)
            const oneDay = k === "dates" && (r["date"] !== undefined || r["from"] === r["to"]);
            const choices = oneDay ? ["D"] : ["C", "T", "S", "P", "H", "X", r["value"]];
            return {
              ...r,
              value: toObjectValue(
                r["value"] === "closed" ? r["value"] : choices[i % choices.length],
              ),
            };
          });
      // A later date of three days around it with a deeply nested value too: removing the date of one day
      // makes the diagnostics compare the two values
      const oneDay = ((o["dates"] as Obj[] | undefined) ?? []).find(
        (r) => r["value"] !== "closed" && (r["date"] !== undefined || r["from"] === r["to"]),
      );
      if (oneDay) {
        const d = (oneDay["date"] ?? oneDay["from"]) as string;
        o["dates"] = [
          ...(o["dates"] as Obj[]),
          { from: addDays(d, -1), to: addDays(d, 1), value: toObjectValue("D") },
        ];
      }
      o["weekdayValues"] = (o["weekdayValues"] as unknown[]).map((v, i) =>
        toObjectValue(v === "closed" ? v : ["A", "E", "B", "S", "C", "T", "P"][i]),
      );
      const hp = o["holidayPolicy"];
      if (typeof hp === "object" && hp !== null && "value" in hp)
        o["holidayPolicy"] = { value: toObjectValue((hp as Obj)["value"]) };
    }
  }
  return o;
}

/** The options as JSON (providers and calendars by name) to reproduce a FINDING */
const describe = (made: Made, group: Group, run: number): string =>
  JSON.stringify({
    group: group.name,
    run,
    provider: made.source[0],
    policy: made.policy,
    unconfirmed: made.unconfirmed,
    asOf: made.asOf,
    objValues: made.objValues,
    basisKind: made.basisKind,
    basisThrows: made.basisThrows,
    basisCopy: made.basisCopy,
    basisSource: made.basisSource,
    options: made.options,
    basisOptions: group.kind === "schedule" ? made.basisOptions : undefined,
  });

// ------------------------------------------------------------
// The conditions of the specification
// ------------------------------------------------------------

/**
 * The conditions the specification of the diagnostics names (docs/decisions.md #30, #31 and the parts of #16,
 * #17 and #24 they refer to), found in options and in the result of the diagnostics. A full run counts the
 * options per condition and compares the names with the list of etc/promise-dimensions.json (checkConditions): a
 * sentence of the specification whose inputs the inventory does not make is not checked by it.
 * @param options - The options passed to the diagnostics.
 * @param made - What was built.
 * @param cal - Whether the options are of a calendar.
 * @param list - The result of the diagnostics.
 * @returns The names of the conditions that hold.
 */
function conditionsOf(
  options: Obj,
  made: Made,
  cal: boolean,
  list: readonly {
    severity: string;
    code: string;
    path: string;
    message: string;
    relatedPath?: string;
  }[],
): Set<string> {
  const found = new Set<string>();
  const rules = (cal ? ["closedRecurringRules", "openRecurringRules"] : ["recurringRules"]).flatMap(
    (k) => (Array.isArray(options[k]) ? (options[k] as Obj[]) : []),
  );
  const annual = Array.isArray(options[cal ? "closedAnnualDates" : "annualDates"])
    ? (options[cal ? "closedAnnualDates" : "annualDates"] as unknown[])
    : [];
  const dates = (cal ? ["closedDates", "openDates"] : ["dates"]).flatMap((k) =>
    Array.isArray(options[k]) ? (options[k] as unknown[]) : [],
  );
  // The result
  for (const d of list) {
    found.add(`result: ${d.code}`);
    if (d.code === "redundant")
      found.add(
        d.relatedPath === undefined
          ? "result: redundant without relatedPath"
          : "result: redundant with relatedPath",
      );
    if (d.code === "out-of-range" && d.message.endsWith("so this rule is never used"))
      found.add("result: out-of-range of a rule that is never used");
    if (d.code === "out-of-range" && d.message.includes("the years the diagnostics examine"))
      found.add("result: out-of-range of an item without a day in the diagnostic range");
    if (d.message.includes(" only)")) found.add("result: a message with the years examined");
    if (/^(?:closedDates|openDates|dates)\[/.test(d.path) && d.code === "redundant")
      found.add("result: redundant specific date");
  }
  // The rules
  for (const entry of annual)
    found.add(typeof entry === "string" ? "annual date: a string" : "annual date: an object");
  for (const r of [
    ...rules,
    ...(annual.filter((a) => typeof a === "object" && a !== null) as Obj[]),
  ]) {
    for (const key of [
      "weekday",
      "dayOfMonth",
      "businessDayOfMonth",
      "businessDayOfWeek",
      "cycle",
      "holiday",
      "dayAfterHoliday",
      "dayBeforeHoliday",
    ])
      if (key in r) found.add(`rule: ${key}`);
    if (r["holidayOverlapPolicy"] !== undefined)
      found.add(`rule: holidayOverlapPolicy ${String(r["holidayOverlapPolicy"])}`);
    if (r["skipWeekdays"] !== undefined) found.add("rule: skipWeekdays");
    if (r["interval"] !== undefined) found.add("rule: interval");
    if (r["kinds"] !== undefined) found.add("rule: kinds");
    if (r["keys"] !== undefined) found.add("rule: keys");
    if (r["months"] !== undefined) found.add("rule: months");
    if (r["weekdays"] !== undefined) found.add("rule: weekdays");
    const from = r["effectiveFrom"] !== undefined;
    const to = r["effectiveTo"] !== undefined;
    if (from && !to) found.add("rule: effective period open at the end");
    if (!from && to) found.add("rule: effective period open at the start");
    if (from && to) found.add("rule: effective period closed");
    if ("businessDayOfMonth" in r || "businessDayOfWeek" in r)
      found.add(
        r["calendar"] === undefined
          ? "counting rule on the own options"
          : "counting rule on another calendar",
      );
  }
  // The specific dates
  for (const d of dates) {
    const [[from, to]] = periodsOf({ dates: [d] }) as [[string, string]];
    found.add(from === to ? "date: one day" : "date: a period");
    if (to >= "9000-01-01" || from <= "1100-01-01")
      found.add("date: reaches an end of the calendar dates");
    found.add(`date: ${periodClass(from, to, RANGE)} the diagnostic range`);
  }
  if (cal && Array.isArray(options["openDates"]) && (options["openDates"] as unknown[]).length > 0)
    found.add("date: openDates");
  // The provider and the policies
  found.add(options["holidayProvider"] === undefined ? "provider: none" : "provider: present");
  if (options["holidayProvider"] !== undefined) found.add(`provider: ${made.source[0]}`);
  if (options["outOfRangePolicy"] !== undefined)
    found.add(`policy: outOfRangePolicy ${String(options["outOfRangePolicy"])}`);
  if (options["unconfirmedHolidayPolicy"] !== undefined)
    found.add(`policy: unconfirmedHolidayPolicy ${String(options["unconfirmedHolidayPolicy"])}`);
  if (options["holidayPolicy"] !== undefined)
    found.add(
      `policy: holidayPolicy ${typeof options["holidayPolicy"] === "object" ? "object" : String(options["holidayPolicy"])}`,
    );
  if (made.asOf !== undefined) found.add("asOf");
  // The basis of a schedule
  if (!cal && rules.some((r) => r["calendar"] !== undefined)) {
    found.add(`basis: ${made.basisKind}`);
    if (made.basisThrows !== "nothing") found.add(`basis: throws ${made.basisThrows}`);
    if (made.basisCopy) found.add("basis: a copy of a created calendar");
    if (made.basisSource === "same")
      found.add("basis: the provider and the policies of the schedule");
    else {
      const [name, policy, unconfirmed] = made.basisSource;
      found.add(name === "none" ? "basis: no provider" : `basis: another provider, ${policy}`);
      if (name !== "none" && name !== made.source[0])
        found.add("basis: supported years differ from those of the schedule");
      if (unconfirmed && name !== "none") found.add("basis: unconfirmedHolidayPolicy throw");
    }
  }
  for (const kind of valueLetters) found.add(`value: ${kind}`);
  valueLetters.clear();
  return found;
}
/** The kinds of values {@link toObjectValue} made for the options being completed */
const valueLetters = new Set<string>();
/**
 * The values of the comparison of schedule values (decisions.md #31 names plain objects and arrays, objects without
 * a prototype, other objects such as a Date, values nested too deeply and values whose reading throws; the
 * comparison of contents must also handle an object that refers to itself and the same object twice): letter →
 * name of the condition
 */
const VALUE_KINDS: Readonly<Record<string, string>> = {
  A: "a plain object or an array",
  B: "a plain object or an array",
  C: "an object that refers to itself",
  H: "an object without a prototype",
  S: "the same object twice, or two equal objects",
  E: "the same object twice, or two equal objects",
  X: "a Date",
  D: "nested too deeply to compare",
  T: "a getter that throws",
  P: "a proxy whose reading throws",
};

// ------------------------------------------------------------
// The run
// ------------------------------------------------------------

const stats: Record<string, number> = {};
const bump = (key: string, n = 1): void => {
  stats[key] = (stats[key] ?? 0) + n;
};
const cells = new Map<string, number>();
/** The number of options checked per condition of the specification ({@link conditionsOf}) */
const conditions: Record<string, number> = {};
const findings: string[] = [];
const finding = (type: string, detail: string): void => {
  bump(`FINDING ${type}`);
  findings.push(`FINDING ${type}: ${detail}`);
};

for (const group of groups) {
  // The counters that choose shapes in turn start again in every group, like the random numbers: a group makes
  // the same options whether it runs in the full set, in a shard (--shard) or alone (--group), so a FINDING of
  // one shard of CI can be reproduced with --group
  foreignBases = 0;
  basisSources = 0;
  const cal = group.kind === "calendar";
  const p = picker(random(group.seed * 104729 + (cal ? 11 : 12) + (group.asOf ? 100 : 0)));
  for (let run = 0; run < group.runs; run++) {
    const made = build(p, group);
    let options: Obj;
    try {
      options = complete(made, group.kind);
      // Options that cannot be created are not part of the promise (the consistency tests compare the
      // diagnostics with creation)
      if (cal) createCalendar(options as never);
      else createSchedule(options as never);
    } catch {
      bump("options that cannot be created (skipped)");
      continue;
    }
    bump("options");
    const key = cellKey({
      kind: group.kind,
      provider: providerClass(made.source[2], RANGE),
      policy: made.policy,
      counting: hasCountingRule(made.options) ? "counting rule" : "no counting rule",
      years: yearClass(made.options, RANGE),
    });
    cells.set(key, (cells.get(key) ?? 0) + 1);
    if (DIMENSIONS || run % EVERY !== 0) continue;
    bump("options checked");
    // Without asOf, the second argument is omitted, or an object without asOf
    const asOfArg = made.asOf === undefined ? (run % 2 ? {} : undefined) : { asOf: made.asOf };
    let list: readonly { severity: string; code: string; path: string; message: string }[];
    try {
      list = cal
        ? diagnoseCalendar(options as never, asOfArg)
        : diagnoseSchedule(options as never, asOfArg);
    } catch (error) {
      finding("the diagnostics throw", `${String(error)} ${describe(made, group, run)}`);
      continue;
    }
    // Options that can be created have no error (decisions.md #30). The consistency tests compare this on the
    // options of the catalog; the objects made here only (bases that throw, values whose reading throws) are
    // compared here
    const errors = list.filter((d) => d.severity === "error");
    if (errors.length > 0)
      finding(
        "an error is reported for options that can be created",
        `${errors[0]!.code} ${errors[0]!.path} ${describe(made, group, run)}`,
      );
    for (const c of conditionsOf(options, made, cal, list))
      conditions[c] = (conditions[c] ?? 0) + 1;
    const days = promiseDays(made.asOf);
    const judgeOf = (o: Obj): ((d: string) => unknown) => {
      if (cal) {
        const c = createCalendar(o as never);
        return (d) => c.isBusinessDay(d);
      }
      const s = createSchedule(o as never);
      return (d) => s.valueOn(d);
    };
    const nbd = cal && list.some((d) => d.code === "no-business-day");
    const paths = removablePaths(list, made.asOf !== undefined);
    if (!nbd && paths.length === 0) continue;
    const before = resultsOf(judgeOf(options), days);
    if (nbd) {
      bump("no-business-day checked");
      const i = before.indexOf("true");
      if (i >= 0)
        finding(
          "no-business-day is reported but a day is a business day",
          `${days[i]!} ${describe(made, group, run)}`,
        );
    }
    if (paths.length === 0) continue;
    bump("removal checked");
    bump("items removed", paths.length);
    let after: string[];
    try {
      after = resultsOf(judgeOf(removePaths(options, paths)), days);
    } catch (error) {
      finding(
        "the options cannot be created after the removal",
        `${JSON.stringify(paths)} ${String(error)} ${describe(made, group, run)}`,
      );
      continue;
    }
    const diff = compareRemoval(before, after);
    if (diff.outside > 0) bump("removals that changed a day outside the promise (allowed)");
    for (const [type, list] of [
      ["the removal changes a value", diff.changed],
      ["the removal makes a day throw", diff.throws],
    ] as const)
      if (list.length > 0)
        finding(
          type,
          `${days[list[0]!]!} ${before[list[0]!]!} -> ${after[list[0]!]!} removed ${JSON.stringify(paths)} ${describe(made, group, run)}`,
        );
  }
}

if (!DIMENSIONS && VERBOSE)
  for (const key of Object.keys(conditions).sort())
    console.log(`condition: ${conditions[key]!} ${key}`);
const zeroOrdered = (o: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
console.log(
  `groups: ${groups.map((g) => g.name).join(", ")}${EVERY > 1 ? ` (1 in ${EVERY} checked)` : ""}`,
);
console.log(`counts: ${JSON.stringify(zeroOrdered(stats))}`);
if (VERBOSE)
  for (const [key, n] of [...cells].sort(([a], [b]) => a.localeCompare(b)))
    console.log(`cell ${key}: ${n}`);

const problems: string[] = [];
if (DIMENSIONS) {
  const table = JSON.parse(readFileSync("etc/promise-dimensions.json", "utf8")) as DimensionTable;
  problems.push(...checkDimensions(cells, table));
  console.log(
    `cells: ${cells.size} made, ${Object.keys(table.excluded).length} excluded in etc/promise-dimensions.json`,
  );
} else {
  for (const f of findings) console.log(f);
  // An empty run is no pass: the checks must really remove items (and, in the full set, meet no-business-day)
  if ((stats["removal checked"] ?? 0) === 0) problems.push("no options were removed and compared");
  const full = EVERY === 1 && groupText === undefined;
  if (
    full &&
    groups.some((g) => g.kind === "calendar") &&
    (stats["no-business-day checked"] ?? 0) === 0
  )
    problems.push("no options with no-business-day were checked");
  // The conditions the specification names must all have been made (every shard of the full set makes them)
  if (full)
    problems.push(
      ...checkConditions(
        conditions,
        JSON.parse(readFileSync("etc/promise-dimensions.json", "utf8")) as DimensionTable,
      ),
    );
  if (findings.length > 0) problems.push(`${findings.length} FINDING(s)`);
}
if (problems.length > 0) {
  for (const p of problems) console.error(`NG   ${p}`);
  process.exit(1);
}
console.log(
  DIMENSIONS
    ? "OK   promise dimensions: every cell that is not excluded is made"
    : `OK   promise inventory: ${stats["options checked"] ?? 0} options checked, 0 FINDING`,
);
