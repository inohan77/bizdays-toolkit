// The result stays the same under a transformation (T4 of the test expansion plan). For rewrites the documents
// promise to mean the same, checks with the options of the catalog generator (test/support/catalog.ts) that the
// results of all days, and the diagnostics with positions translated back, do not change. The options include a
// home-made provider with few supported years (2025-2027), the union of that provider with another home-made
// one, and no provider.
// pnpm check runs a fixed sample only (METAMORPHIC_FULL=1 raises the numbers). Every relation follows from
// calendar dates alone, so runs with another time zone skip them. The number of options tried is printed per
// relation, and 0 fails.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createSchedule,
  isBizdaysError,
  type CalendarOptions,
  type Holiday,
  type HolidayProvider,
  type ScheduleOptions,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import type { RenamedPlace } from "../src/core/renamed.ts";
import { CALENDAR_OPTION_KEYS } from "../src/core/calendar.ts";
import { PERIOD_KEYS, RECURRING_RULE_KEYS, SCHEDULE_OPTION_KEYS } from "../src/core/schedule.ts";
import { jp } from "../src/jp/index.ts";
import {
  CALENDAR_REF,
  CONTEXTS,
  addDays,
  picker,
  random,
  randomCalendarOptions,
  randomScheduleOptions,
  withoutHolidays,
  type Context,
  type Obj,
} from "./support/catalog.ts";
import { flagEnv } from "./support/env.ts";
import { OLD_RULE_LISTS, RULE_LISTS, renamedTo, toOld } from "./support/old-names.ts";
import { SHORT_DAYS, SHORT_PROVIDER } from "./support/provider.ts";

/**
 * Number of options per relation and kind (splitting periods and reordering apply to few options and are light,
 * so 4 times as many)
 */
const RUNS = flagEnv("METAMORPHIC_FULL") ? 40 : 5;
const RUNS_LIGHT = RUNS * 4;
type Kind = "calendar" | "schedule";

/** The second home-made provider for the union (the same supported years; August 15 and November 3 are holidays) */
const SECOND_PROVIDER: HolidayProvider<string> = {
  id: "YY",
  timeZone: "UTC",
  supportedYears: { from: 2025, to: 2027 },
  dataVersion: "2026-10",
  holidaysInYear: (year) =>
    [
      [`${year}-08-15`, "obon"],
      [`${year}-11-03`, "culture"],
    ].map(([date, key]) => ({
      date: date!,
      name: key!,
      nameEn: key!,
      kind: "regular",
      key: key!,
      confirmed: true,
    })),
};
const SHORT_CTX: Context = CONTEXTS["diagnose-properties"];
/** The combinations of providers (the home-made provider, the union, no provider) */
const SOURCES: readonly (readonly HolidayProvider<string>[] | undefined)[] = [
  [SHORT_PROVIDER],
  [SHORT_PROVIDER, SECOND_PROVIDER],
  undefined,
];
const sourceOf = (providers: readonly HolidayProvider<string>[] | undefined): Obj =>
  providers === undefined
    ? {}
    : {
        holidayProvider: providers.length === 1 ? providers[0] : [...providers],
        timeZone: "UTC",
      };

/**
 * Options of the catalog (the providers rotate with `run`; nth-business-day rules of schedules count on a calendar
 * with the same providers and closed weekends)
 */
function optionsOf(
  kind: Kind,
  rand: () => number,
  run: number,
  sources: readonly (readonly HolidayProvider<string>[] | undefined)[] = SOURCES,
): Obj {
  const providers = sources[run % sources.length];
  // The Japanese provider is generated in the context of Japan's kinds and keys
  const ctx =
    providers === undefined
      ? withoutHolidays(SHORT_CTX)
      : providers.some((p) => p.id === "JP")
        ? CONTEXTS.properties
        : SHORT_CTX;
  const p = picker(rand);
  const o: Obj = {
    ...sourceOf(providers),
    ...(kind === "calendar" ? randomCalendarOptions(p, ctx) : randomScheduleOptions(p, ctx)),
  };
  if (Array.isArray(o["recurringRules"])) {
    const basis = createCalendar({
      ...sourceOf(providers),
      closedWeekdays: [0, 6],
    } as CalendarOptions);
    o["recurringRules"] = (o["recurringRules"] as Obj[]).map((r) =>
      r["calendar"] === CALENDAR_REF ? { ...r, calendar: basis } : r,
    );
  }
  return o;
}

type Made = { dayInfoOn(d: string): unknown; isBusinessDay?(d: string): boolean };
/** Creation (the error code as a string when the options are wrong and cannot be created) */
function make(kind: Kind, options: Obj): Made | string {
  try {
    return kind === "calendar"
      ? createCalendar(options as CalendarOptions)
      : createSchedule(options as unknown as ScheduleOptions<unknown>);
  } catch (e) {
    if (!isBizdaysError(e)) throw e;
    return `error ${e.code}`;
  }
}
/** Translation of results and diagnostics (positions and holiday kinds of the transformed side back to the original's) */
interface Mapping {
  readonly mapPath?: (path: string) => string;
  readonly fixKind?: (k: string) => string;
}
/**
 * The result of one day (the result of dayInfoOn; decidedBy and decidedByPath of a combination are left out, and
 * positions and holiday kinds are translated back; the error code when it throws)
 */
function dayOf(made: Made, day: string, mapping: Mapping): string {
  try {
    const info = made.dayInfoOn(day) as Obj;
    const { decidedBy: _decidedBy, decidedByPath: _decidedByPath, ...rest } = info;
    const holiday = rest["holiday"] as Obj | null | undefined;
    if (holiday && mapping.fixKind)
      rest["holiday"] = { ...holiday, kind: mapping.fixKind(holiday["kind"] as string) };
    for (const key of ["rulePath", "optionPath"])
      if (typeof rest[key] === "string" && mapping.mapPath)
        rest[key] = mapping.mapPath(rest[key] as string);
    return JSON.stringify(rest);
  } catch (e) {
    if (!isBizdaysError(e)) throw e;
    return `error ${e.code}`;
  }
}
/** The results of all days of the supported years */
function resultsOf(made: Made | string, mapping: Mapping = {}): string[] {
  if (typeof made === "string") return [made];
  return SHORT_DAYS.map((d) => dayOf(made, d, mapping));
}

/**
 * The essentials of the diagnostics (severity, code, translated position and the position of the related item,
 * relatedPath). deprecated-option of old names is left out (it only reports the use of an old name). relatedPath
 * gets the same translation as the position
 */
function diagnosticsOf(kind: Kind, options: Obj, mapPath: (path: string) => string = (p) => p) {
  const issues = kind === "calendar" ? diagnoseCalendar(options) : diagnoseSchedule(options);
  return [
    ...new Set(
      issues
        .filter((d) => d.code !== "deprecated-option")
        .map(
          (d) =>
            `${d.severity} ${d.code} ${mapPath(d.path)}` +
            (d.relatedPath === undefined ? "" : ` -> ${mapPath(d.relatedPath)}`),
        ),
    ),
  ].sort();
}

/** The results and diagnostics of the original options (compared with several transformations, so computed once) */
const baselines = new WeakMap<Obj, { results: string[]; diagnostics: string[] }>();
function baselineOf(kind: Kind, original: Obj): { results: string[]; diagnostics: string[] } {
  let b = baselines.get(original);
  if (b === undefined) {
    b = {
      results: resultsOf(make(kind, original)),
      diagnostics: diagnosticsOf(kind, original),
    };
    baselines.set(original, b);
  }
  return b;
}

/**
 * Checks that the results of the transformed options, and their diagnostics with positions translated back, equal
 * those of the original options
 */
function assertSame(
  kind: Kind,
  context: string,
  original: Obj,
  changed: Obj,
  mapping: Mapping = {},
): void {
  const base = baselineOf(kind, original);
  assert.deepEqual(
    resultsOf(make(kind, changed), mapping),
    base.results,
    `${context}: 結果が変わった`,
  );
  assert.deepEqual(
    diagnosticsOf(kind, changed, mapping.mapPath),
    base.diagnostics,
    `${context}: 診断が変わった`,
  );
}

const tried: Record<string, number> = {};
/** Prints the line with the count and fails on 0 (`unit` is what was counted) */
const report = (relation: string, unit = "設定"): void => {
  console.log(`# ${relation}: 試した${unit} ${tried[relation] ?? 0} 件`);
  assert.ok((tried[relation] ?? 0) > 0, `${relation}: 試した${unit}が 0 件（空振り）`);
};
const count = (relation: string): void => {
  tried[relation] = (tried[relation] ?? 0) + 1;
};

/** Tries a relation with the catalog options of calendars and schedules */
function eachOptions(
  seed: number,
  kinds: readonly Kind[],
  body: (kind: Kind, o: Obj, context: string, run: number) => void,
  runs = RUNS,
  sources: readonly (readonly HolidayProvider<string>[] | undefined)[] = SOURCES,
) {
  const rand = random(seed);
  for (let run = 0; run < runs; run++)
    for (const kind of kinds)
      body(kind, optionsOf(kind, rand, run, sources), `run=${run} ${kind}`, run);
}

// ------------------------------------------------------------
// 1. Old names and new names
// ------------------------------------------------------------

/**
 * Turns the old names in a diagnostic position into the new ones. Each segment of the position is looked up among
 * the old names of its place: the first segment in the place of the options (source, and calendar or schedule),
 * a segment directly under an element of a list of recurring rules in the place of rules. Other segments (inside
 * an annual date, ...) are not translated
 */
function pathToNew(kind: Kind): (path: string) => string {
  return (path) => {
    const segments = path.split(".");
    let parent = "";
    return segments
      .map((segment, i) => {
        const name = /^[A-Za-z]+/.exec(segment)?.[0] ?? "";
        const places: readonly RenamedPlace[] =
          i === 0
            ? ["source", kind]
            : i === 1 && (RULE_LISTS.includes(parent) || OLD_RULE_LISTS.includes(parent))
              ? ["rule"]
              : [];
        const to = renamedTo(places, name);
        if (i === 0) parent = name;
        return to === undefined ? segment : to + segment.slice(name.length);
      })
      .join(".");
  };
}

test("変形 1 の位置の読み替え: 位置の各段を、その段の場所の旧名で引く", () => {
  const cal = pathToNew("calendar");
  const sch = pathToNew("schedule");
  assert.equal(cal("closedRecurring[0].day"), "closedRecurringRules[0].dayOfMonth");
  assert.equal(cal("openRecurring[2].onHolidayRule"), "openRecurringRules[2].holidayOverlapPolicy");
  assert.equal(cal("closedAnnual[1]"), "closedAnnualDates[1]");
  assert.equal(cal("holidays"), "holidayProvider");
  // The old names of the rule place (day, onHolidayRule) are translated only directly under an element of a list
  // of rules
  assert.equal(cal("closedAnnualDates[0].day"), "closedAnnualDates[0].day");
  assert.equal(cal("closedDates[0].day"), "closedDates[0].day");
  assert.equal(cal("closedRecurringRules[0].kinds[0].day"), "closedRecurringRules[0].kinds[0].day");
  // The old name `holiday` of schedules is translated only as the first segment; `holiday` of a rule (a holiday
  // rule) is not
  assert.equal(sch("holiday"), "holidayPolicy");
  assert.equal(sch("recurring[1].holiday"), "recurringRules[1].holiday");
  assert.equal(sch("annual[0].day"), "annualDates[0].day");
  // Old names of calendars are not translated in schedules (and vice versa)
  assert.equal(sch("closedRecurring[0]"), "closedRecurring[0]");
  assert.equal(cal("weekly"), "weekly");
});

/**
 * The combinations of providers for relation 1 (options with only the Japanese provider are added, to try the
 * old value "national" of kinds)
 */
const SOURCES_WITH_JAPAN: readonly (readonly HolidayProvider<string>[] | undefined)[] = [
  ...SOURCES,
  [jp as HolidayProvider<string>],
];

/**
 * Fixed options for relation 1 (only the Japanese provider; the rules have "regular" in kinds, so the old value
 * "national" is tried every time).
 * Both rules match only days whose holiday kind is "regular", so changing "regular" to a wrong value changes
 * the result (checked inside the test of transformation 1 by comparing with the result of "regular" changed to
 * "substitute"). The schedule also tries "ignore" of holidayPolicy (old value "weekday")
 */
const JAPAN_FIXED: readonly { kind: Kind; options: Obj }[] = [
  {
    kind: "calendar",
    options: {
      holidayProvider: jp,
      timeZone: "Asia/Tokyo",
      holidayPolicy: "open",
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ holiday: true, kinds: ["regular"] }],
    },
  },
  {
    kind: "schedule",
    options: {
      holidayProvider: jp,
      timeZone: "Asia/Tokyo",
      weekdayValues: ["closed", "A", "A", "A", "A", "A", "closed"],
      holidayPolicy: "ignore",
      recurringRules: [{ holiday: true, kinds: ["regular"], value: "closed" }],
    },
  },
];
/** Changes "regular" in kinds of the rules to another value (to check that the fixed options rely on "regular") */
function withKind(options: Obj, kind: string): Obj {
  const out: Obj = { ...options };
  for (const list of RULE_LISTS)
    if (Array.isArray(out[list]))
      out[list] = (out[list] as Obj[]).map((r) =>
        Array.isArray(r["kinds"])
          ? { ...r, kinds: (r["kinds"] as string[]).map((k) => (k === "regular" ? kind : k)) }
          : r,
      );
  return out;
}

test("変形 1: 旧名・旧い値で書いた設定は、新しい名前の設定と結果・診断が同じ（和集合を含む）", () => {
  const check = (kind: Kind, o: Obj, context: string): void => {
    const { options: old, oldValues } = toOld(o, kind);
    // Options without a property that is rewritten to an old name or old value are not counted
    if (JSON.stringify(old) === JSON.stringify(o)) return;
    assertSame(kind, context, o, old, { mapPath: pathToNew(kind) });
    count("変形 1（旧名）");
    if (oldValues > 0) count("変形 1（旧い値）");
  };
  JAPAN_FIXED.forEach(({ kind, options }, i) => {
    const context = `fixed=${i} ${kind}`;
    // Changing "regular" to a wrong value ("substitute") changes the result (the options are such that a wrong
    // way of turning the old value back would not go unnoticed)
    assert.notDeepEqual(
      resultsOf(make(kind, withKind(options, "substitute"))),
      baselineOf(kind, options).results,
      `${context}: "regular" を変えても結果が変わらない（旧い値を試す設定にならない）`,
    );
    check(kind, options, context);
    count("変形 1（日本の提供元の決まった設定）");
  });
  eachOptions(20261121, ["calendar", "schedule"], check, RUNS, SOURCES_WITH_JAPAN);
  report("変形 1（旧名）");
  report("変形 1（旧い値）");
  report("変形 1（日本の提供元の決まった設定）");
});

// ------------------------------------------------------------
// 2. Providers wrapped again under the same id, and providers with replaced kinds
// ------------------------------------------------------------

/** Wraps a provider again (the same id; holidaysInYear copies the original result and replaces `kind`) */
function wrapProvider(
  p: HolidayProvider<string>,
  kindOf: (k: string) => string = (k) => k,
): HolidayProvider<string> {
  return {
    id: p.id,
    timeZone: p.timeZone,
    supportedYears: { ...p.supportedYears },
    dataVersion: p.dataVersion,
    holidaysInYear: (year: number) =>
      p.holidaysInYear(year).map((h): Holiday<string> => ({ ...h, kind: kindOf(h.kind) })),
  };
}
/**
 * Wraps the providers of the options again (also those of the basis calendar of a schedule's nth-business-day
 * rule) and replaces kinds of the rules too
 */
function rewrap(options: Obj, kindOf?: (k: string) => string): Obj {
  const providers = options["holidayProvider"];
  if (providers === undefined) return options;
  const wrapped = Array.isArray(providers)
    ? providers.map((p: HolidayProvider<string>) => wrapProvider(p, kindOf))
    : wrapProvider(providers as HolidayProvider<string>, kindOf);
  const out: Obj = { ...options, holidayProvider: wrapped };
  const basis = createCalendar({
    holidayProvider: wrapped,
    timeZone: "UTC",
    closedWeekdays: [0, 6],
  } as CalendarOptions);
  for (const list of RULE_LISTS) {
    if (!Array.isArray(out[list])) continue;
    out[list] = (out[list] as Obj[]).map((r) => {
      const rule: Obj = { ...r };
      if (kindOf && Array.isArray(rule["kinds"]))
        rule["kinds"] = (rule["kinds"] as string[]).map(kindOf);
      if ("calendar" in rule && rule["calendar"] !== undefined) rule["calendar"] = basis;
      return rule;
    });
  }
  return out;
}

test("変形 2: 同じ id で包み直した提供元と、種別を付け替えて kinds も直した提供元は、結果・診断が同じ", () => {
  const renamed = (k: string): string => `renamed-${k}`;
  const back = (k: string): string => k.replace(/^renamed-/, "");
  eachOptions(20261122, ["calendar", "schedule"], (kind, o, context, run) => {
    if (o["holidayProvider"] === undefined) return;
    // Two transformations per options are heavy, so they alternate by trial
    if (run % 2 === 0) {
      assertSame(kind, `${context} 包み直し`, o, rewrap(o));
      count("変形 2（包み直し）");
    } else {
      assertSame(kind, `${context} 種別の付け替え`, o, rewrap(o, renamed), { fixKind: back });
      count("変形 2（種別の付け替え）");
    }
  });
  report("変形 2（包み直し）");
  report("変形 2（種別の付け替え）");
});

// ------------------------------------------------------------
// 3. A specific date with a period, and the dates it is split into
// ------------------------------------------------------------

/** The lists of specific dates that can have a period (closedDates and openDates of calendars, dates of schedules) */
const DATE_LISTS = ["closedDates", "openDates", "dates"];

/**
 * The result of splitting periods: the options after the split, the table from positions after the split to
 * original positions, and from the original position of a split period to its two positions
 */
interface Split {
  readonly options: Obj;
  readonly origin: Record<string, number[]>;
  readonly pieces: Map<string, [string, string]>;
}

/**
 * Splits the specific dates with a period (from differs from to) in the middle into two (with `only`, only the
 * periods at those positions)
 */
function splitPeriods(options: Obj, only?: ReadonlySet<string>): Split | undefined {
  const out: Obj = { ...options };
  const origin: Record<string, number[]> = {};
  const pieces = new Map<string, [string, string]>();
  for (const list of DATE_LISTS) {
    if (!Array.isArray(options[list])) continue;
    const entries: unknown[] = [];
    origin[list] = [];
    (options[list] as unknown[]).forEach((entry, i) => {
      const e = entry as Obj;
      if (
        typeof entry === "object" &&
        typeof e["from"] === "string" &&
        e["to"] !== e["from"] &&
        (only === undefined || only.has(`${list}[${i}]`))
      ) {
        const from = e["from"] as string;
        const to = e["to"] as string;
        const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
        const mid = addDays(from, Math.floor(days / 2));
        pieces.set(`${list}[${i}]`, [
          `${list}[${entries.length}]`,
          `${list}[${entries.length + 1}]`,
        ]);
        entries.push({ ...e, from, to: mid }, { ...e, from: addDays(mid, 1), to });
        origin[list]!.push(i, i);
      } else {
        entries.push(entry);
        origin[list]!.push(i);
      }
    });
    out[list] = entries;
  }
  return pieces.size > 0 ? { options: out, origin, pieces } : undefined;
}

/**
 * How the original diagnostics of a split period appear on its two parts (the direction per code, and as which
 * code it may appear after the split).
 * - redundant: when the original period can be removed, so can a part of it: on both. But when one part is
 *   contained in another period of the same list, that part gets shadowed instead of redundant (the diagnostic
 *   that says it can be removed and names the covering item)
 * - expired: both end on or before the original end: on both
 * - out-of-range: part of the original period is outside the supported years: on at least the one containing it
 * - shadowed: when the original period is contained in another period, so is a part of it: on both. But when the
 *   covering period is split too, one part may no longer be contained completely in either, and redundant
 *   appears instead of shadowed (that it can be removed does not change)
 */
const ORIGINAL_SPREAD: Readonly<
  Record<string, { readonly spread: "both" | "either"; readonly as: readonly string[] }>
> = {
  redundant: { spread: "both", as: ["redundant", "shadowed"] },
  expired: { spread: "both", as: ["expired"] },
  "out-of-range": { spread: "either", as: ["out-of-range"] },
  shadowed: { spread: "both", as: ["shadowed", "redundant"] },
};
/**
 * When relatedPath is not compared, and why. When an original diagnostic appears after the split as another code
 * of ORIGINAL_SPREAD (an original redundant as shadowed, an original shadowed as redundant), whether there is a
 * related item depends on the code, so relatedPath is not compared (the count line for items whose code changed
 * and whose relatedPath is not compared)
 */
const RELATED_NOT_COMPARED = {
  label: "変形 3（コードが変わり relatedPath を比べない項目）",
  reason:
    "診断のコードが変わると、関わる項目（relatedPath）があるかどうかも変わる（shadowed は覆う項目を指し、redundant は指さない）",
} as const;

/** Codes that may newly appear after the split although the original period did not have them, with the reason */
const NEW_AFTER_SPLIT: Readonly<Record<string, string>> = {
  redundant: "分けた片方だけが、ほかの設定（定休日など）で休業日の日だけからなり、取り除ける",
  "out-of-range":
    "分けた片方だけが対応年の外の日を含む（元の期間の out-of-range は少なくとも一方に出る）",
  shadowed:
    "分けた片方が、同じ一覧のほかの期間に含まれる（元の期間は、ほかの期間と一部だけが重なっていた）",
};

type Issue = { severity: string; code: string; path: string; relatedPath?: string | undefined };
const issuesOf = (kind: Kind, options: Obj): Issue[] =>
  (kind === "calendar" ? diagnoseCalendar(options) : diagnoseSchedule(options))
    .filter((d) => d.code !== "deprecated-option")
    .map((d) => ({ severity: d.severity, code: d.code, path: d.path, relatedPath: d.relatedPath }));
const line = (d: Issue): string =>
  `${d.severity} ${d.code} ${d.path}` + (d.relatedPath === undefined ? "" : ` -> ${d.relatedPath}`);
/** The first item of a diagnostic position (closedDates[3], ...) and the position below it */
const headOf = (path: string): { head: string; rest: string } => {
  const m = /^([A-Za-z]+\[\d+\])(.*)$/.exec(path);
  return m ? { head: m[1]!, rest: m[2]! } : { head: path, rest: "" };
};

/**
 * When a diagnostic at another position than the split period may change, and why. An original shadowed that
 * points at the split period as the covering one (relatedPath is the split period) may become redundant after
 * the split: once the covering period is split, the other may no longer be contained completely in either part,
 * but that it can be removed does not change
 */
const OTHERS_MAY_CHANGE = {
  from: "shadowed",
  to: "redundant",
  reason:
    "覆っていた期間が分かれて、どちらの片方にもすっかりは含まれなくなった（取り除けることは変わらない）",
} as const;

/**
 * Fixed options (closed weekends and specific dates with periods). They always include the cases where only one
 * part or both parts can be removed, a period outside the supported years, another period that was covered by
 * the split period, and a period of a schedule (the catalog generator makes no periods for schedules)
 */
const SPLIT_FIXED: readonly { kind: Kind; options: Obj; only?: ReadonlySet<string> }[] = [
  ...[
    // A period of a weekend only (the original is redundant → both parts are redundant)
    { closedDates: [{ from: "2025-03-01", to: "2025-03-02" }] },
    // Saturday to Tuesday (the original cannot be removed → only the first part, the weekend, is newly redundant)
    { closedDates: [{ from: "2025-03-01", to: "2025-03-04" }] },
    // A period across the end of the supported years (the original is out-of-range → only the second part is)
    { closedDates: [{ from: "2027-12-29", to: "2028-01-03" }] },
    // The second period is contained in the first (shadowed) and spans the middle of the first (between 03-05
    // and 03-06)
    {
      closedDates: [
        { from: "2025-03-03", to: "2025-03-07" },
        { from: "2025-03-04", to: "2025-03-06" },
      ],
    },
  ].map((o) => ({
    kind: "calendar" as Kind,
    options: {
      holidayProvider: SHORT_PROVIDER,
      timeZone: "UTC",
      closedWeekdays: [0, 6],
      ...o,
    } as Obj,
  })),
  // Of the two periods above only the first is split (the second, not split, turns from shadowed to redundant.
  // OTHERS_MAY_CHANGE)
  {
    kind: "calendar",
    options: {
      holidayProvider: SHORT_PROVIDER,
      timeZone: "UTC",
      closedWeekdays: [0, 6],
      closedDates: [
        { from: "2025-03-03", to: "2025-03-07" },
        { from: "2025-03-04", to: "2025-03-06" },
      ],
    },
    only: new Set(["closedDates[0]"]),
  },
  // shadowed between periods that are not split and come after the split period (the split shifts the numbers, so
  // relatedPath is translated before comparing)
  {
    kind: "calendar",
    options: {
      holidayProvider: SHORT_PROVIDER,
      timeZone: "UTC",
      closedWeekdays: [0, 6],
      closedDates: [
        { from: "2025-03-03", to: "2025-03-07" },
        { from: "2025-03-10", to: "2025-03-14" },
        "2025-03-12",
      ],
    },
    only: new Set(["closedDates[0]"]),
  },
  ...[
    // A weekend-only period of a schedule (the original is redundant → both parts are redundant)
    [{ from: "2025-03-01", to: "2025-03-02", value: "closed" }],
    // Saturday to Tuesday of a schedule (only the first part, the weekend, is newly redundant)
    [{ from: "2025-03-01", to: "2025-03-04", value: "closed" }],
  ].map((dates) => ({
    kind: "schedule" as Kind,
    options: {
      holidayProvider: SHORT_PROVIDER,
      timeZone: "UTC",
      weekdayValues: ["closed", "A", "A", "A", "A", "A", "closed"],
      holidayPolicy: { sameAs: 0 },
      dates,
    } as Obj,
  })),
];

test("変形 3: 期間の個別の日付を分けても結果が同じで、診断は分けた期間のほかは同じ、分けた期間はコードごとの向きに従う", () => {
  const check = (kind: Kind, o: Obj, context: string, only?: ReadonlySet<string>): void => {
    const split = splitPeriods(o, only);
    if (split === undefined) return;
    const mapPath = (path: string): string =>
      path.replace(
        /^(closedDates|openDates|dates)\[(\d+)\]/,
        (_, list: string, i: string) => `${list}[${split.origin[list]![Number(i)]}]`,
      );
    assert.deepEqual(
      resultsOf(make(kind, split.options), { mapPath }),
      baselineOf(kind, o).results,
      `${context}: 結果が変わった`,
    );
    const before = issuesOf(kind, o);
    const after = issuesOf(kind, split.options);
    const pieceOf = new Map<string, string>();
    for (const [original, [a, b]] of split.pieces) {
      pieceOf.set(a, original);
      pieceOf.set(b, original);
    }
    // The diagnostics at positions other than the split period are exactly the same (the results of all days are
    // the same, so there is no reason to change). But a shadowed that pointed at the split period as the covering
    // one may become redundant after the split (OTHERS_MAY_CHANGE)
    const othersBefore = before
      .filter((d) => !split.pieces.has(headOf(d.path).head))
      .map(line)
      .sort();
    // The positions of the items that may change, with the original diagnostic (its severity is used when turning back)
    const mayChange = new Map(
      before
        .filter(
          (d) =>
            !split.pieces.has(headOf(d.path).head) &&
            d.code === OTHERS_MAY_CHANGE.from &&
            d.relatedPath !== undefined &&
            split.pieces.has(headOf(d.relatedPath).head),
        )
        .map((d) => [d.path, d] as const),
    );
    const othersAfter = after
      .filter((d) => !pieceOf.has(headOf(d.path).head))
      .map((d): string => {
        const mapped = {
          ...d,
          path: mapPath(d.path),
          relatedPath: d.relatedPath === undefined ? undefined : mapPath(d.relatedPath),
        };
        if (mapped.code === OTHERS_MAY_CHANGE.to && mayChange.has(mapped.path)) {
          count("変形 3（覆っていた期間が分かれて shadowed から redundant になった項目）");
          return line(mayChange.get(mapped.path)!);
        }
        return line(mapped);
      })
      .sort();
    assert.deepEqual(
      othersAfter,
      othersBefore,
      `${context}: 分けた期間のほかの位置の診断が変わった`,
    );
    // The diagnostics of a split period follow the direction per code
    for (const [original, [a, b]] of split.pieces) {
      // The diagnostics of a split period are compared by code, the position below the item and relatedPath
      // (translated on the split side) (shadowed and redundant differ in severity, so severity is not compared)
      type Entry = { code: string; rest: string; rel: string };
      const at = (list: Issue[], head: string, mapped: boolean): Entry[] =>
        list
          .filter((d) => headOf(d.path).head === head)
          .map((d) => ({
            code: d.code,
            rest: headOf(d.path).rest,
            rel: d.relatedPath === undefined ? "" : mapped ? mapPath(d.relatedPath) : d.relatedPath,
          }));
      const show = (e: Entry): string => `${e.code}${e.rest}${e.rel ? ` -> ${e.rel}` : ""}`;
      const orig = at(before, original, false);
      const first = at(after, a, true);
      const second = at(after, b, true);
      const accepted = new Set<Entry>();
      for (const d of orig) {
        const rule = ORIGINAL_SPREAD[d.code];
        assert.ok(rule !== undefined, `${context}: ${original} の ${d.code} の向きを決めていない`);
        // With the same code, relatedPath is the same too. When it appeared as another code
        // (RELATED_NOT_COMPARED), relatedPath is not compared
        const matches = (e: Entry): boolean =>
          e.rest === d.rest && (e.code === d.code ? e.rel === d.rel : rule.as.includes(e.code));
        const inA = first.filter(matches);
        const inB = second.filter(matches);
        for (const e of [...inA, ...inB]) {
          accepted.add(e);
          if (e.code !== d.code) count(RELATED_NOT_COMPARED.label);
        }
        assert.ok(
          rule.spread === "both" ? inA.length > 0 && inB.length > 0 : inA.length + inB.length > 0,
          `${context}: ${original} の「${show(d)}」が、分けた${rule.spread === "both" ? "両方" : "どちらか"}に出ない`,
        );
        if (d.code === "redundant") count("変形 3（元の redundant を分けた組）");
      }
      for (const [piece, list, other] of [
        [a, first, second],
        [b, second, first],
      ] as const) {
        for (const e of list.filter((x) => !accepted.has(x))) {
          assert.ok(
            e.code in NEW_AFTER_SPLIT,
            `${context}: 分けた ${piece} に、元の ${original} にない「${show(e)}」が出た（新しく出てよいコードではない）`,
          );
          if (!other.some((x) => show(x) === show(e)))
            count("変形 3（分けた片方だけの新しい診断）");
        }
      }
    }
    count(kind === "schedule" ? "変形 3（スケジュールの期間の分割）" : "変形 3（期間の分割）");
  };
  SPLIT_FIXED.forEach(({ kind, options, only }, i) =>
    check(kind, options, `fixed=${i} ${kind}`, only),
  );
  eachOptions(20261123, ["calendar"], (kind, o, context) => check(kind, o, context), RUNS_LIGHT);
  report("変形 3（期間の分割）");
  report("変形 3（元の redundant を分けた組）", "組");
  report("変形 3（分けた片方だけの新しい診断）", "診断の項目");
  report("変形 3（覆っていた期間が分かれて shadowed から redundant になった項目）", "診断の項目");
  report("変形 3（スケジュールの期間の分割）");
  report(RELATED_NOT_COMPARED.label, "診断の項目");
});

// ------------------------------------------------------------
// 4. Reordering arrays whose order has no meaning
// ------------------------------------------------------------

const UNORDERED = ["closedWeekdays", "kinds", "keys", "weekdays"];

/** Reverses closedWeekdays and kinds, keys and weekdays of the rules (returned when an array's order changed) */
function reverseUnordered(options: Obj): Obj | undefined {
  let changed = false;
  const reverse = (o: Obj): Obj => {
    const out: Obj = { ...o };
    for (const key of UNORDERED) {
      const list = o[key];
      if (Array.isArray(list) && list.length >= 2) {
        out[key] = [...list].reverse();
        changed = true;
      }
    }
    return out;
  };
  const out = reverse(options);
  for (const list of RULE_LISTS)
    if (Array.isArray(out[list])) out[list] = (out[list] as Obj[]).map(reverse);
  return changed ? out : undefined;
}
/** Positions inside a reordered array are not counted (closedWeekdays[2] → closedWeekdays[]) */
const withoutInnerIndex = (path: string): string =>
  path.replace(new RegExp(`\\b(${UNORDERED.join("|")})\\[\\d+\\]`, "g"), "$1[]");

test("変形 4: 順番が意味を持たない配列（closedWeekdays・kinds・keys・weekdays）を並べ替えても、結果・診断が同じ", () => {
  eachOptions(
    20261124,
    ["calendar", "schedule"],
    (kind, o, context) => {
      const reversed = reverseUnordered(o);
      if (reversed === undefined) return;
      assert.deepEqual(
        resultsOf(make(kind, reversed)),
        baselineOf(kind, o).results,
        `${context}: 結果が変わった`,
      );
      assert.deepEqual(
        diagnosticsOf(kind, reversed, withoutInnerIndex),
        baselineOf(kind, o).diagnostics.map(withoutInnerIndex),
        `${context}: 診断が変わった`,
      );
      count("変形 4（並べ替え）");
    },
    RUNS_LIGHT,
  );
  report("変形 4（並べ替え）");
});

// ------------------------------------------------------------
// 5. A round trip of the options through JSON
// ------------------------------------------------------------

/**
 * Turns the options into JSON and reads them back (providers and basis calendars, which cannot become JSON, are
 * attached again after reading back, as a user who saves options does)
 */
function viaJson(options: Obj): Obj {
  const { holidayProvider, ...rest } = options;
  const calendars: unknown[] = [];
  const stored = JSON.stringify(rest, (key, value: unknown) => {
    if (key === "calendar" && typeof value === "object" && value !== null) {
      calendars.push(value);
      return { calendarIndex: calendars.length - 1 };
    }
    return value;
  });
  const restored = JSON.parse(stored, (key, value: unknown) =>
    key === "calendar" && typeof value === "object" && value !== null
      ? calendars[(value as { calendarIndex: number }).calendarIndex]
      : value,
  ) as Obj;
  return holidayProvider === undefined ? restored : { ...restored, holidayProvider };
}

test("変形 5: 設定を JSON で往復しても（提供元と基準のカレンダーは付け直す）、結果・診断が同じ", () => {
  eachOptions(20261125, ["calendar", "schedule"], (kind, o, context) => {
    const back = viaJson(o);
    assertSame(kind, context, o, back);
    count("変形 5（JSON の往復）");
  });
  report("変形 5（JSON の往復）");
});

// ------------------------------------------------------------
// 7. Omission and an explicit undefined
// ------------------------------------------------------------

const DATE_ENTRY_KEYS = ["date", "from", "to", "name"];
const ANNUAL_LISTS = ["closedAnnualDates", "annualDates"];

/**
 * Adds every known property that is not written (old names left out) as an explicit undefined (options, rules,
 * specific dates, annual dates)
 */
function withExplicitUndefined(kind: Kind, options: Obj): Obj {
  const fill = (o: Obj, keys: readonly string[]): Obj => {
    const out: Obj = { ...o };
    for (const key of keys) if (!Object.hasOwn(out, key)) out[key] = undefined;
    return out;
  };
  const out = fill(options, kind === "calendar" ? CALENDAR_OPTION_KEYS : SCHEDULE_OPTION_KEYS);
  for (const list of RULE_LISTS)
    if (Array.isArray(out[list]))
      out[list] = (out[list] as Obj[]).map((r) => fill(r, RECURRING_RULE_KEYS));
  for (const list of DATE_LISTS)
    if (Array.isArray(out[list]))
      out[list] = (out[list] as unknown[]).map((e) =>
        typeof e === "object" && e !== null ? fill(e as Obj, DATE_ENTRY_KEYS) : e,
      );
  for (const list of ANNUAL_LISTS)
    if (Array.isArray(out[list]))
      out[list] = (out[list] as unknown[]).map((e) =>
        typeof e === "object" && e !== null
          ? fill(e as Obj, [...DATE_ENTRY_KEYS, ...PERIOD_KEYS])
          : e,
      );
  return out;
}

test("変形 7: 書いていない項目を明示的な undefined で書いても、結果・診断が同じ（省略と同じ。decisions.md の 6 番）", () => {
  eachOptions(20261127, ["calendar", "schedule"], (kind, o, context) => {
    assertSame(kind, context, o, withExplicitUndefined(kind, o));
    count("変形 7（明示的な undefined）");
  });
  report("変形 7（明示的な undefined）");
});

/**
 * The options with the value `target` turned into undefined at the value positions of a schedule (weekday,
 * holiday, specific dates, annual dates, recurring rules)
 */
function withUndefinedValue(options: Obj, target: string): Obj {
  const swap = (v: unknown): unknown => (v === target ? undefined : v);
  const o: Obj = { ...options };
  o["weekdayValues"] = (options["weekdayValues"] as unknown[]).map(swap);
  const policy = options["holidayPolicy"];
  if (typeof policy === "object" && policy !== null && "value" in policy)
    o["holidayPolicy"] = { value: swap((policy as Obj)["value"]) };
  for (const list of ["dates", "annualDates", "recurringRules"])
    if (Array.isArray(options[list]))
      o[list] = (options[list] as Obj[]).map((e) => ({ ...e, value: swap(e["value"]) }));
  return o;
}

/** The string values that occur in a schedule (weekday, holiday, `value` of rules) */
function valuesIn(options: Obj): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown): void => void (typeof v === "string" && out.add(v));
  for (const v of options["weekdayValues"] as unknown[]) add(v);
  const policy = options["holidayPolicy"];
  if (typeof policy === "object" && policy !== null) add((policy as Obj)["value"]);
  for (const list of ["dates", "annualDates", "recurringRules"])
    if (Array.isArray(options[list])) for (const e of options[list] as Obj[]) add(e["value"]);
  return out;
}

test("変形 8: スケジュールの値の 1 つを、書いたすべての位置で undefined にしても、その値が undefined になるだけで、理由・位置・診断は同じ（value: undefined も値。decisions.md の 6 番）", () => {
  eachOptions(20261111, ["schedule"], (kind, o, context) => {
    const original = make(kind, o);
    if (typeof original === "string") return;
    for (const target of valuesIn(o)) {
      const changed = make(kind, withUndefinedValue(o, target));
      assert.ok(
        typeof changed !== "string",
        `${context} ${target}: 作成できなかった（${changed}）`,
      );
      for (const day of SHORT_DAYS) {
        const info = (made: Made): unknown => {
          try {
            return made.dayInfoOn(day);
          } catch (e) {
            if (!isBizdaysError(e)) throw e;
            return `error ${e.code}`;
          }
        };
        const before = info(original);
        const expected =
          typeof before === "object" && before !== null && (before as Obj)["value"] === target
            ? { ...(before as Obj), value: undefined }
            : before;
        assert.deepStrictEqual(info(changed as Made), expected, `${context} ${target} ${day}`);
      }
      assert.deepEqual(
        diagnosticsOf(kind, withUndefinedValue(o, target)),
        baselineOf(kind, o).diagnostics,
        `${context} ${target}: 診断が変わった`,
      );
      count("変形 8（値を undefined に）");
    }
  });
  report("変形 8（値を undefined に）", "設定と値の組");
});

// ------------------------------------------------------------
// 6. The combination of calendars made from the same options, and the original calendar
// ------------------------------------------------------------

test("変形 6: 同じ設定から作った 2 つのカレンダーの合成は、元のカレンダーと結果が同じ（decidedBy・decidedByPath を除く）", () => {
  eachOptions(20261126, ["calendar"], (_kind, o, context) => {
    const calendar = make("calendar", o);
    const twin = make("calendar", o);
    if (typeof calendar === "string" || typeof twin === "string") return;
    for (const open of ["all", "any"] as const) {
      // A combination takes two or more distinct calendars (one alone, or the same object twice, is
      // invalid-argument), so two calendars made from the same options are combined. From the compared results
      // of dayInfoOn only decidedBy and decidedByPath, which only a combined calendar has, are left out (dayOf).
      // `holiday` is the same because the same provider object counts once, and is compared
      const combined = combineCalendars([calendar as never, twin as never], {
        open,
      }) as unknown as Made;
      assert.deepEqual(
        resultsOf(combined),
        baselineOf("calendar", o).results,
        `${context} open: ${open}: 結果が変わった`,
      );
      assert.deepEqual(
        SHORT_DAYS.map((d): string => tryBusinessDay(combined, d)),
        SHORT_DAYS.map((d): string => tryBusinessDay(calendar, d)),
        `${context} open: ${open}: isBusinessDay が変わった`,
      );
    }
    count("変形 6（同じ設定の合成）");
  });
  report("変形 6（同じ設定の合成）");
});

function tryBusinessDay(made: Made, day: string): string {
  try {
    return String(made.isBusinessDay!(day));
  } catch (e) {
    if (!isBizdaysError(e)) throw e;
    return `error ${e.code}`;
  }
}
