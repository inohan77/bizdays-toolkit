/**
 * Performance measurement (pnpm bench). Uses only the standard features of Node.js, no dependency.
 *
 * Results depend on the machine, so this is not part of pnpm check.
 * It is for comparing, on the same machine, before and after a change to internal processing.
 * By default the source is loaded directly (Node.js strips the types, so the processing equals dist).
 *
 * Arguments:
 *   --package <dir>  Measure the package in that directory (<dir>/dist/index.js and <dir>/dist/jp/index.js).
 *                    CI uses it to compare the previous published version with this dist on the same machine
 *                    (scripts/bench-compare.ts)
 *   --json <file>    Write the results (measurement name and milliseconds per run) as JSON
 */

import "./strict-warnings.ts";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RENAMED_KEYS } from "../src/core/renamed.ts";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const packageDir = argValue("--package");
const jsonFile = argValue("--json");

type Root = typeof import("../src/index.ts");
type Jp = typeof import("../src/jp/index.ts");
type Diagnose = typeof import("../src/diagnose/index.ts");
type Sg = typeof import("../src/sg/index.ts");
const root: Root = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/index.js")).href)
  : await import("../src/index.ts");
const jpModule: Jp = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/jp/index.js")).href)
  : await import("../src/jp/index.ts");
const { jp } = jpModule;
const diagnoseModule: Diagnose = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/diagnose/index.js")).href)
  : await import("../src/diagnose/index.ts");
const { sg }: Sg = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/sg/index.js")).href)
  : await import("../src/sg/index.ts");

// When the previous version's dist is older than 0.30.0 (it does not know the new names), the new option names
// are turned back into the old ones. The bench of CI compares the same scenes with the previous version (with
// the new names, the previous version would silently ignore them as unknown keys)
const legacy =
  typeof (root.createCalendar({}) as { diffBusinessDays?: unknown }).diffBusinessDays !==
  "function";
const RULE_LISTS = ["closedRecurringRules", "openRecurringRules", "recurringRules"];
function toLegacy(
  value: Record<string, unknown>,
  places: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const renamed = RENAMED_KEYS.find((r) => places.includes(r.place) && r.to === key);
    out[renamed ? renamed.from : key] = RULE_LISTS.includes(key)
      ? (v as Record<string, unknown>[]).map((rule) => toLegacy(rule, ["rule"]))
      : v;
  }
  return out;
}
const createCalendar: Root["createCalendar"] = (options) =>
  root.createCalendar(
    (legacy ? toLegacy(options as never, ["source", "calendar"]) : options) as never,
  );
const createSchedule: Root["createSchedule"] = (options) =>
  root.createSchedule(
    (legacy ? toLegacy(options as never, ["source", "schedule"]) : options) as never,
  );
const diff = (calendar: ReturnType<Root["createCalendar"]>, from: string, to: string): number =>
  legacy ? calendar.businessDaysBetween(from, to) : calendar.diffBusinessDays(from, to);

interface Case {
  readonly name: string;
  readonly run: () => unknown;
}

function addDaysSimple(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Options of a typical shop (closed on Sundays, on holidays and over the New Year)
const store = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "年末年始" }],
});

// Options with many specific dates (500 extra closed days).
// The 500 days are passed in the order of a seeded random shuffle (dates written in order of start cost almost
// nothing to sort for the judgement, so a regression there would not be caught. 0.32.7)
const closed500 = Array.from({ length: 500 }, (_, i) => addDaysSimple("2020-01-01", i * 7 + 3));
for (let i = closed500.length - 1, seed = 7; i > 0; i--) {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  const j = seed % (i + 1);
  [closed500[i], closed500[j]] = [closed500[j]!, closed500[i]!];
}
const manyDatesOptions = {
  holidayProvider: jp,
  closedWeekdays: [0, 6] as const,
  closedDates: closed500,
};
const manyDates = createCalendar(manyDatesOptions);
// The same 500 days written in order of start, and the 20 days judged (spread over 2020-2023). Dates written in
// order of start are checked at the first judgement and looked up without sorting, so this catches a regression
// in which that check fails (0.32.7). 20 is the count at which the difference from the failing form was largest
const sortedDatesOptions = { ...manyDatesOptions, closedDates: [...closed500].sort() };
const probe20 = Array.from({ length: 20 }, (_, i) => addDaysSimple("2020-01-02", i * 59));
// 30 extra closed days outside the scan range (2001-2028): every year from 2029 (for the diagnostics
// measurement. 0.32.8)
const outsideDates = Array.from({ length: 30 }, (_, i) => addDaysSimple("2029-01-05", i * 365));

// Options with recurring rules and moves (a museum: closed on Mondays, or on the next day that is not a holiday
// when Monday is a holiday; closed on the third Wednesday; stocktaking at the end of the month)
const museum = createCalendar({
  holidayProvider: jp,
  holidayPolicy: "open",
  closedRecurringRules: [
    { weekday: 1, holidayOverlapPolicy: "after-holiday" },
    { weekday: 3, nth: 3 },
    { dayOfMonth: -1, holidayOverlapPolicy: "over-holiday" },
  ],
});

const hours = createSchedule({
  holidayProvider: jp,
  weekdayValues: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
  holidayPolicy: { sameAs: 0 },
  annualDates: [{ date: "01-01", value: "closed" }],
});

// A schedule whose nth-business-day rule has a basis calendar with a provider of few supported years
// (Singapore, "throw"). The scan of the diagnostics reaches outside the basis's supported years; this catches a
// regression on the path where the diagnostics evaluate a throwing month again and again (0.32.7 remembers the
// months that threw)
const sgBasis = createCalendar({ holidayProvider: sg, closedWeekdays: [0, 6] });

// Ten years of dates in the order of a seeded random shuffle. The measurement of a single day repeats the same
// day, so the conversion that remembers the last pair (0.32.7) always hits and looks faster than real use. The
// measurement with a different day each time catches regressions that depend on hit or miss
const shuffledDays = Array.from({ length: 3653 }, (_, i) => addDaysSimple("2020-01-01", i));
for (let i = shuffledDays.length - 1, seed = 1; i > 0; i--) {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  const j = seed % (i + 1);
  [shuffledDays[i], shuffledDays[j]] = [shuffledDays[j]!, shuffledDays[i]!];
}
let nextDay = 0;
const anotherDay = (): string => shuffledDays[nextDay++ % shuffledDays.length]!;

const cases: Case[] = [
  { name: "isBusinessDay（店舗・1 日）", run: () => store.isBusinessDay("2026-11-23") },
  { name: "isBusinessDay（店舗・毎回違う日）", run: () => store.isBusinessDay(anotherDay()) },
  {
    name: "addBusinessDays（店舗・250 営業日）",
    run: () => store.addBusinessDays("2026-01-05", 250),
  },
  {
    name: "diffBusinessDays（店舗・10 年）",
    run: () => diff(store, "2020-01-01", "2030-01-01"),
  },
  {
    name: "diffBusinessDays（臨時休業日 500 件・1 年）",
    run: () => diff(manyDates, "2026-01-01", "2027-01-01"),
  },
  {
    name: "diffBusinessDays（繰り返し・振替・1 年）",
    run: () => diff(museum, "2026-01-01", "2027-01-01"),
  },
  { name: "valueOn（スケジュール・1 日）", run: () => hours.valueOn("2026-11-03") },
  { name: "valueOn（スケジュール・毎回違う日）", run: () => hours.valueOn(anotherDay()) },
  {
    name: "createCalendar（店舗の設定）",
    run: () => createCalendar({ holidayProvider: jp, closedWeekdays: [0] }),
  },
  {
    // Specific dates are sorted by start only after the number of sequential lookups exceeds twice the logarithm
    // of the number of dates (0.32.7). Catches a regression in which a use that creates and judges once pays
    // for the sort
    name: "createCalendar と 1 回の判定（臨時休業日 500 件）",
    run: () => createCalendar(manyDatesOptions).isBusinessDay("2026-11-24"),
  },
  {
    // The path that checks, at the first judgement, that specific dates are written in order of start and looks
    // them up without sorting (0.32.7). bench-compare of CI fails from 2x; the delay when this check fails
    // (about 10%) is read from the table in the Job Summary
    name: "createCalendar と 20 回の判定（臨時休業日 500 件・始まりの順）",
    run: () => {
      const calendar = createCalendar(sortedDatesOptions);
      let open = 0;
      for (const date of probe20) if (calendar.isBusinessDay(date)) open++;
      return open;
    },
  },
  {
    // Catches regressions of the scan of the diagnostics (date conversion per day) and of the comparison between
    // rules (matching in the representative 28 years). Options without a provider, about 20 ms per run (1-3
    // seconds with the 50 warm-up runs, so the bench of CI does not get much longer)
    name: "diagnoseCalendar（提供元なし・規則 2 つ）",
    run: () =>
      diagnoseModule.diagnoseCalendar(
        (legacy ? toLegacy : (o: Record<string, unknown>) => o)(
          {
            closedWeekdays: [0, 6],
            closedRecurringRules: [
              { weekday: 3, nth: [2] },
              { weekday: 5, nth: [4] },
            ],
          },
          ["source", "calendar"],
        ) as never,
      ),
  },
  {
    // Options with a rule counting on the own options and specific dates outside the scan range (2001-2028)
    // (0.32.8). The months and weeks at both ends of each specific date are examined in addition, so more dates
    // outside the range take longer. Watches for that regression. About 10 ms per run (the implementer's machine)
    name: "diagnoseCalendar（提供元なし・数える規則と走査の範囲の外の臨時休業日 30 件）",
    run: () =>
      diagnoseModule.diagnoseCalendar(
        (legacy ? toLegacy : (o: Record<string, unknown>) => o)(
          {
            closedWeekdays: [0, 6],
            closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: -1 }],
            closedDates: outsideDates,
          },
          ["source", "calendar"],
        ) as never,
      ),
  },
  {
    // About 100 ms per run in 0.32.6 and about 20 ms in 0.32.7 (the implementer's machine). A few seconds
    // including the 50 warm-up runs
    name: "diagnoseSchedule（基準: シンガポールの提供元）",
    run: () =>
      diagnoseModule.diagnoseSchedule(
        (legacy ? toLegacy : (o: Record<string, unknown>) => o)(
          {
            timeZone: sgBasis.timeZone,
            weekdayValues: [0, 1, 1, 1, 1, 1, 0],
            recurringRules: [{ businessDayOfMonth: 1, calendar: sgBasis, value: 2 }],
          },
          ["source", "schedule"],
        ) as never,
      ),
  },
];

/** Measures the time per run with a number of runs that totals about 300 ms (after warming up) */
function measure(run: () => unknown): { perOp: number; ops: number } {
  for (let i = 0; i < 50; i++) run();
  let ops = 1;
  for (;;) {
    const start = performance.now();
    for (let i = 0; i < ops; i++) run();
    const elapsed = performance.now() - start;
    if (elapsed > 300 || ops > 1e7) return { perOp: elapsed / ops, ops };
    ops *= 4;
  }
}

const format = (ms: number): string =>
  ms >= 1
    ? `${ms.toFixed(2)} ms`
    : ms >= 0.001
      ? `${(ms * 1000).toFixed(2)} µs`
      : `${(ms * 1e6).toFixed(0)} ns`;

console.log(`node ${process.version}${packageDir ? ` (${packageDir})` : ""}`);
const results: Record<string, number> = {};
for (const c of cases) {
  const { perOp, ops } = measure(c.run);
  results[c.name] = perOp;
  console.log(`${c.name.padEnd(44)} ${format(perOp).padStart(12)} / 回  (${ops} 回)`);
}
if (jsonFile) writeFileSync(jsonFile, `${JSON.stringify(results, null, 2)}\n`);
