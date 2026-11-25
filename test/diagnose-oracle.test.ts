/**
 * Brute-force oracle test of the diagnostics (T1 of the test expansion plan). The diagnostics are an "optimized
 * judgement", so their correctness is checked against the naive definition: the items the diagnostics report as
 * shadowed, never-matches or redundant are really removed from the options, and the results are compared on every
 * day of a home-made provider with few supported years. The items are an explicit list
 * (test/fixtures/oracle-items.json: representatives of the rule shapes of the catalog, specific dates and annual
 * dates), and every combination of up to two of them is tried (no luck of a random seed, and changing the catalog
 * does not change the items).
 *
 * - The conditions of the judgement follow the diagnostics (outOfRangePolicy: "ignore". docs/decisions.md #31)
 * - pnpm check tries a fixed sample only. All combinations run with ORACLE_FULL=1 (the oracle job of CI; the time
 *   rule and the split of the matrix are in the quality checks of RELEASING.md)
 * - Checks that the reported items can be removed together (the definition of the sequential removal) and that no
 *   removable item is left afterwards (completeness).
 *   Completeness is checked with the diagnostics without asOf, so expired (reported only with asOf) is not among
 *   the removed items.
 *   For completeness, an item removable within the supported years is checked again over the period in which the
 *   diagnostics examine rules against each other (computed with the diagnostics' own function rulesScanWindow)
 *   before it is counted, and a mismatch with the list of known items (KNOWN_INCOMPLETE) fails
 * - ORACLE_TARGET=<package directory> tries another built version (a published one, ...). ORACLE_SHARD=k/n tries
 *   only the k-th of n parts of all combinations (to split a long run; only together with ORACLE_FULL=1; a wrong
 *   format, k >= n or no ORACLE_FULL throws)
 */

import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import { COMMON_RULE_KEYS, SHAPES, random, shapeOf, type Obj } from "./support/catalog.ts";
import { type DayLike, linesOf } from "./support/compare.ts";
import { SHORT_DAYS, SHORT_PROVIDER } from "./support/provider.ts";
import { flagEnv } from "./support/env.ts";

type Fn = (...args: unknown[]) => unknown;
const target = process.env["ORACLE_TARGET"];
const lib = (await import(
  target ? pathToFileURL(resolve(target, "dist/index.js")).href : "../src/index.ts"
)) as Record<string, Fn>;
const diag = (await import(
  target
    ? pathToFileURL(resolve(target, "dist/diagnose/index.js")).href
    : "../src/diagnose/index.ts"
)) as Record<string, Fn>;
/**
 * The period in which the diagnostics examine rules against each other (a list of date ranges; undefined when the
 * options cannot be created or the period cannot be computed). Computed with the diagnostics' own functions: the
 * options are compiled with compileCalendarOptions, and the period is rulesScanWindow, used by analyzeRules.
 * When the version of ORACLE_TARGET has no rulesScanWindow (up to 0.30.6), the function of the current source is
 * used (how the period is decided did not change during 0.30.x)
 */
type Core = Record<string, Fn>;
const coreOf = async (dir: string | undefined, name: string): Promise<Core> =>
  (await import(
    dir ? pathToFileURL(resolve(dir, `dist/core/${name}.js`)).href : `../src/core/${name}.ts`
  )) as Core;
const scanCore = await (async () => {
  const fromTarget = target ? await coreOf(target, "diagnose") : undefined;
  const dir = fromTarget?.["rulesScanWindow"] ? target : undefined;
  return {
    compile: (await coreOf(dir, "calendar"))["compileCalendarOptions"]!,
    collector: (await coreOf(dir, "errors"))["IssueCollector"] as unknown as new () => unknown,
    window: (fromTarget?.["rulesScanWindow"] ??
      (await coreOf(undefined, "diagnose"))["rulesScanWindow"])!,
    fromDay: (await coreOf(dir, "date"))["fromDayNumber"]!,
  };
})();
const calendarScanWindow = (
  options: object,
): readonly { from: string; to: string }[] | undefined => {
  const compiled = (
    scanCore.compile(new scanCore.collector(), options) as { schedule?: unknown } | undefined
  )?.schedule;
  if (compiled === undefined) return undefined;
  const window = scanCore.window(compiled) as
    | { ranges: { from: number; to: number }[] }
    | undefined;
  return window?.ranges.map((r) => ({
    from: scanCore.fromDay(r.from) as string,
    to: scanCore.fromDay(r.to) as string,
  }));
};

const FULL = flagEnv("ORACLE_FULL");
/**
 * "k/n": tries only the k-th (0-based) of n parts of all combinations (to split a long run; the oracle job of CI).
 * A wrong format, k >= n or no ORACLE_FULL throws, so that nothing passes without being tried
 */
const SHARD = ((): { k: number; n: number } | undefined => {
  const text = process.env["ORACLE_SHARD"];
  if (text === undefined || text === "") return undefined;
  const m = /^(\d+)\/(\d+)$/.exec(text);
  if (!m) throw new Error(`ORACLE_SHARD must be "k/n" (e.g. 0/4), got ${JSON.stringify(text)}`);
  const k = Number(m[1]);
  const n = Number(m[2]);
  if (n === 0 || k >= n)
    throw new Error(`ORACLE_SHARD ${text}: k must be less than n (0 <= k < n)`);
  // Splitting without the full set throws: splitting the fixed sample of pnpm check (1 in 111) further can leave
  // a part with 0 items through a common divisor of the interval and n (with 111 and 3, parts 1/3 and 2/3 are
  // empty). Only the full set (the oracle job of CI) is split
  if (!FULL)
    throw new Error(
      `ORACLE_SHARD ${text} needs ORACLE_FULL=1 (the sample of pnpm check is not split)`,
    );
  return { k, n };
})();
/**
 * Reference dates for checking expired. 2026-07-21 tries the day an "after-holiday" rule moves to (a day after
 * its last day; decisions.md #13) when the rule ends on the third Monday of July of the short provider
 * (2026-07-20, a holiday)
 */
const AS_OFS = ["2026-07-01", "2026-07-21"] as const;

// ------------------------------------------------------------
// The list of items (the explicit list of test/fixtures/oracle-items.json; put into both closing and opening rules)
// ------------------------------------------------------------

type Item = readonly [key: string, value: unknown];
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/oracle-items.json", import.meta.url), "utf8"),
) as {
  items: Item[];
  jointFixed: { items: Item[]; policy: string; weekdays: number[] }[];
};
const items: readonly Item[] = fixture.items;

/**
 * Keys of shapes the list of items does not have yet, with the reason. In the same form as the reachability of
 * test/tools/catalog.test.ts, it is checked that the list contains every shape and key of the catalog, and a gap
 * not listed here fails (an entry here that is not a gap also fails as stale)
 */
const ITEM_GAPS: Readonly<Record<string, string>> = {};

const build = (
  list: readonly Item[],
  holidayPolicy: string,
  closedWeekdays: readonly number[] = [0, 6],
): Obj => {
  const o: Obj = {
    holidayProvider: SHORT_PROVIDER,
    timeZone: "UTC",
    closedWeekdays: [...closedWeekdays],
    holidayPolicy,
    outOfRangePolicy: "ignore",
  };
  for (const [k, v] of list) ((o[k] ??= []) as unknown[]).push(v);
  return o;
};
/** Whether each day of a period (a list of date ranges) is a business day (the error code on a day that throws) */
const openOver = (o: Obj, ranges: readonly { from: string; to: string }[]): string => {
  // Uses isBusinessDay, not dayInfoOn (only `open` is needed; skipping reason and name is faster)
  const calendar = lib["createCalendar"]!(o) as { isBusinessDay: (d: string) => boolean };
  const out: string[] = [];
  for (const { from, to } of ranges)
    for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      try {
        out.push(String(calendar.isBusinessDay(d)));
      } catch (error) {
        out.push(`E:${String((error as { code?: unknown }).code)}`);
      }
    }
  return out.join(",");
};
/**
 * Checks again, over the period in which the diagnostics examine rules against each other (calendarScanWindow),
 * whether an item removable within the supported years is removable. The diagnostics examine a rule whose
 * effective period continues outside the supported years also outside them, so comparing the supported years
 * alone would count an item that cannot be removed as "nothing reported"
 */
/**
 * The period in which the diagnostics examine the original options, and the results of all its days (not
 * computed again per removable item)
 */
const scanned = new WeakMap<
  Obj,
  { ranges: ReturnType<typeof calendarScanWindow>; open: unknown }
>();
function removableInScanWindow(full: Obj, rest: Obj): boolean {
  let base = scanned.get(full);
  if (base === undefined) {
    const ranges = calendarScanWindow(full);
    base = { ranges, open: ranges === undefined ? undefined : openOver(full, ranges) };
    scanned.set(full, base);
  }
  if (base.ranges === undefined) return true;
  return openOver(rest, base.ranges) === base.open;
}

/**
 * The results of all days of the supported years (linesOf of test/support/compare.ts; with `full`, also reason,
 * name and the original day of a move)
 */
const snapshot = (o: Obj, full: boolean): string[] =>
  linesOf(lib["createCalendar"]!(o) as { dayInfoOn: (d: string) => DayLike }, SHORT_DAYS, full);
const same = (a: readonly string[], b: readonly string[], from = 0) =>
  a.every((x, i) => i < from || x === b[i]);
const pathsOf = (list: readonly Item[]): string[] => {
  const count: Record<string, number> = {};
  return list.map(([k]) => `${k}[${(count[k] = (count[k] ?? -1) + 1)}]`);
};

/**
 * Holiday policies and closed weekdays (options with one item: all 3 × 3; options with two items: the 3 policies
 * × weekends)
 */
const POLICIES = ["closed", "open", "ignore"] as const;
const WEEKDAY_SETS: readonly (readonly number[])[] = [[0, 6], [0], []];
/** Of the options with two items, those combined with closed weekdays [0] and [] are a seeded sample (this rate) */
const OTHER_WEEKDAYS_RATE = 1 / 8;
/** pnpm check (no ORACLE_FULL) tries only a fixed sample of all options, at this interval */
const SAMPLE_EVERY = 111;

interface Config {
  readonly list: readonly Item[];
  readonly policy: string;
  readonly weekdays: readonly number[];
}

/**
 * The information for rebuilding the options, for failure messages (items, holiday policy, closed weekdays,
 * removed items). Passing it to build(items, holidayPolicy, closedWeekdays) gives the same options
 */
function describeConfig(
  list: readonly Item[],
  policy: string,
  weekdays: readonly number[],
  removed?: string | readonly string[],
): string {
  return JSON.stringify({
    items: list,
    holidayPolicy: policy,
    closedWeekdays: weekdays,
    ...(removed === undefined ? {} : { removed }),
  });
}

/**
 * All options (in a fixed order; the combinations of two with closed weekdays [0] and [] are a seeded sample)
 * and their breakdown
 */
const plan = (() => {
  const all: Config[] = [];
  const pick = random(20261102);
  let other = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i; j < items.length; j++) {
      const list = i === j ? [items[i]!] : [items[i]!, items[j]!];
      for (const policy of POLICIES)
        for (const weekdays of WEEKDAY_SETS) {
          if (i !== j && weekdays.length !== 2) {
            other++;
            if (pick() >= OTHER_WEEKDAYS_RATE) continue;
          }
          all.push({ list, policy, weekdays });
        }
    }
  const chosen = all.filter(
    (_, n) => (FULL || n % SAMPLE_EVERY === 0) && (!SHARD || n % SHARD.n === SHARD.k),
  );
  const count = (f: (c: Config) => string) => {
    const out: Record<string, number> = {};
    for (const c of chosen) out[f(c)] = (out[f(c)] ?? 0) + 1;
    return out;
  };
  const sampledOther = all.filter((c) => c.list.length === 2 && c.weekdays.length !== 2).length;
  return {
    chosen,
    lines: [
      `項目 ${items.length} 件、全件の設定 ${all.length} 件（${FULL ? "全件" : `${SAMPLE_EVERY} 件に 1 件の抜き出し`}${SHARD ? `、${SHARD.n} 個に分けた ${SHARD.k} 番目` : ""}）。試す設定 ${chosen.length} 件`,
      `方針ごと: ${JSON.stringify(count((c) => c.policy))}`,
      `定休日ごと: ${JSON.stringify(count((c) => JSON.stringify(c.weekdays)))}`,
      `項目 2 つと定休日 [0]・[] の組み合わせの抜き出し: ${sampledOther} / ${other} 件（割合 ${OTHER_WEEKDAYS_RATE}）`,
    ],
  };
})();

/** The options tried */
const configs = (): readonly Config[] => plan.chosen;

interface Report {
  configs: number;
  unsound: string[];
  incomplete: Map<string, number>;
  codes: Record<string, number>;
  /**
   * The number of items removable within the supported years but not when checked again over the diagnostics'
   * period, and the time of the re-check (milliseconds)
   */
  rechecked: number;
  recheckMs: number;
}

/**
 * The diagnostics (without asOf) per options, shared between tests (the same diagnostics of the same options are
 * not computed again). The diagnostics are deterministic (decisions.md #30) and the returned array is frozen
 * (decisions.md #4), so what one test does cannot affect another's result.
 * The key is the options object itself (an element of plan.chosen; as JSON, differences such as an explicit
 * undefined would disappear)
 */
const DIAG_CACHE = new WeakMap<Config, Obj[]>();
const diagnoseOnce = (config: Config): Obj[] => {
  let d = DIAG_CACHE.get(config);
  if (d === undefined) {
    d = diag["diagnoseCalendar"]!(build(config.list, config.policy, config.weekdays)) as Obj[];
    DIAG_CACHE.set(config, d);
  }
  return d;
};

function run(
  check: (
    list: readonly Item[],
    policy: string,
    d: Obj[],
    report: Report,
    weekdays: readonly number[],
  ) => void,
  list: readonly Config[] = configs(),
): Report {
  const report: Report = {
    configs: 0,
    unsound: [],
    incomplete: new Map(),
    codes: {},
    rechecked: 0,
    recheckMs: 0,
  };
  for (const config of list) {
    const { list: items, policy, weekdays } = config;
    const d = diagnoseOnce(config);
    if (d.some((x) => x["severity"] === "error")) continue;
    report.configs++;
    for (const x of d)
      report.codes[x["code"] as string] = (report.codes[x["code"] as string] ?? 0) + 1;
    check(items, policy, d, report, weekdays);
  }
  return report;
}

/**
 * Time per test (milliseconds). The full run prints it in the Job Summary with the number of options of the
 * part (so that, from the next run on, an uneven time of a part can be told apart: uneven cost of the options or
 * a difference in runner performance. The diagnostics oracle in the quality checks of RELEASING.md)
 */
const testTimes: [string, number][] = [];
let testStart = 0;
beforeEach(() => {
  testStart = performance.now();
});
afterEach((t) => {
  testTimes.push([t.name, performance.now() - testStart]);
});
after(() => {
  const total = testTimes.reduce((s, [, ms]) => s + ms, 0);
  const lines = [
    "### テストごとの時間",
    "",
    plan.lines[0]!,
    "",
    "| テスト | 時間 |",
    "| --- | --- |",
    ...testTimes.map(([name, ms]) => `| ${name} | ${(ms / 1000).toFixed(1)} 秒 |`),
    `| 合計 | ${(total / 1000).toFixed(1)} 秒 |`,
    "",
  ];
  console.log(lines.join("\n"));
  if (FULL && process.env["GITHUB_STEP_SUMMARY"])
    appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `${lines.join("\n")}\n`);
});

const summarize = (name: string, report: Report): void => {
  const top = [...report.incomplete].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const lines = [
    `### ${name}`,
    "",
    ...plan.lines,
    "",
    `設定 ${report.configs} 件（作成の誤りの設定を除く）、誤り ${report.unsound.length} 件、診断のコード: ${JSON.stringify(report.codes)}`,
    "",
    `対応年では取り除けたが、診断の期間で確かめ直して取り除けなかった項目: ${report.rechecked} 件（確かめ直し ${Math.round(report.recheckMs)} ms）`,
    "",
    "取り除いても変わらないのに何も出ない項目（完全性。既知の項目の一覧 KNOWN_INCOMPLETE と合わなければ失敗）:",
    ...(top.length > 0 ? top.map(([k, v]) => `- ${v} 件 ${k}`) : ["- なし"]),
    "",
  ];
  console.log(lines.join("\n"));
  if (FULL && process.env["GITHUB_STEP_SUMMARY"])
    appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `${lines.join("\n")}\n`);
};

test("オラクル: 項目の一覧は目録のすべての形とキーを含む（不足は ITEM_GAPS に理由付きで載せたものだけ）", () => {
  const made = new Map<string, Set<string>>();
  for (const [key, value] of items) {
    if (!key.endsWith("RecurringRules")) continue;
    const shape = shapeOf(value as Obj);
    assert.ok(shape, `形の分からない項目: ${JSON.stringify(value)}`);
    const set = made.get(shape.pattern) ?? new Set<string>();
    for (const k of Object.keys(value as Obj)) set.add(k);
    made.set(shape.pattern, set);
  }
  const all = new Set([...made.values()].flatMap((s) => [...s]));
  const gaps: string[] = [];
  for (const s of SHAPES) {
    if (!made.has(s.pattern)) gaps.push(`${s.pattern}`);
    for (const k of s.keys) if (!made.get(s.pattern)?.has(k)) gaps.push(`${s.pattern}.${k}`);
  }
  for (const k of COMMON_RULE_KEYS) if (!all.has(k)) gaps.push(`*.${k}`);
  assert.deepEqual(gaps, Object.keys(ITEM_GAPS), "項目の一覧の不足と ITEM_GAPS が食い違う");
});

// ------------------------------------------------------------
// Soundness: removing the reported items changes no result
// ------------------------------------------------------------

/**
 * Counts soundness and completeness (the definition of the sequential removal, docs/decisions.md #31).
 * - Soundness: an item reported as shadowed or never-matches can be removed alone without changing the result
 *   of any day (it is never used). The items reported as shadowed, never-matches or redundant can be removed
 *   together without changing the result of any day
 * - Completeness: in the options without the reported items, removing any one remaining item changes a result
 *   (nothing more can be removed). An item that changes nothing is checked again over the period in which the
 *   diagnostics examine rules against each other before it is counted
 */
function checkRemovals(
  list: readonly Item[],
  policy: string,
  d: Obj[],
  r: Report,
  weekdays: readonly number[],
): void {
  const paths = pathsOf(list);
  const codesOf = (path: string): string[] =>
    d.filter((x) => x["path"] === path).map((x) => x["code"] as string);
  const original = build(list, policy, weekdays);
  const baseOpen = snapshot(original, false);
  const baseFull = snapshot(original, true);
  paths.forEach((path, p) => {
    const codes = codesOf(path);
    if (!codes.includes("shadowed") && !codes.includes("never-matches")) return;
    const rest = build(
      list.filter((_, q) => q !== p),
      policy,
      weekdays,
    );
    if (!same(snapshot(rest, true), baseFull))
      r.unsound.push(`${codes.join(",")} ${describeConfig(list, policy, weekdays, path)}`);
  });
  const removed = paths.filter((path) =>
    codesOf(path).some((c) => ["shadowed", "never-matches", "redundant"].includes(c)),
  );
  const remaining = list.filter((_, p) => !removed.includes(paths[p]!));
  const restConfig = build(remaining, policy, weekdays);
  const restOpen = snapshot(restConfig, false);
  if (!same(restOpen, baseOpen)) {
    r.unsound.push(`まとめて取り除くと変わる ${describeConfig(list, policy, weekdays, removed)}`);
    return;
  }
  remaining.forEach((item, q) => {
    const smaller = build(
      remaining.filter((_, k) => k !== q),
      policy,
      weekdays,
    );
    if (!same(snapshot(smaller, false), restOpen)) return;
    const started = performance.now();
    const removable = removableInScanWindow(restConfig, smaller);
    r.recheckMs += performance.now() - started;
    if (!removable) {
      r.rechecked++;
      return;
    }
    const key = `${item[0]} ${JSON.stringify(item[1])}`;
    r.incomplete.set(key, (r.incomplete.get(key) ?? 0) + 1);
  });
}

/**
 * Items that change nothing when removed although the diagnostics say nothing (the items in the completeness
 * report) that are accepted with a known reason (item → reason). An item missing here fails, and an item here
 * that no longer appears fails too (so that the list does not go stale).
 * Empty: 0.30.7 removed, through the re-check, the 2 items that appeared only because the supported years alone
 * were compared (neither can be removed over the diagnostics' period)
 */
const KNOWN_INCOMPLETE: Readonly<Record<string, string>> = {};

/**
 * Watch over the counting of completeness. With empty diagnostics passed in, it checks that (1) an item that
 * really can be removed (a specific date on a Saturday, a closed weekday) is counted, and (2) items removable
 * within the supported years but not over the diagnostics' period (a rule closing the 1st of every month from
 * 2026 and a rule opening Mondays in May and July; the result changes on 2028-05-01 and other days) are not
 * counted, thanks to the re-check. It stops both a reporting mechanism that broke and counts nothing, and a
 * re-check that broke by always answering "cannot be removed" and hiding misses
 */
test("オラクル: 完全性の数え方は、診断が何も言わない取り除ける項目を数え、診断の期間で取り除けない項目は数えない", () => {
  const report: Report = {
    configs: 1,
    unsound: [],
    incomplete: new Map(),
    codes: {},
    rechecked: 0,
    recheckMs: 0,
  };
  const saturday: Item = ["closedDates", "2025-03-01"];
  checkRemovals([saturday], "closed", [], report, [0, 6]);
  assert.equal(
    report.incomplete.get(`closedDates ${JSON.stringify("2025-03-01")}`),
    1,
    `取り除ける項目を数えない: ${JSON.stringify([...report.incomplete])}`,
  );
  const openMondays: Item = ["openRecurringRules", { weekday: 1, months: [5, 7] }];
  const firstDays: Item = ["closedRecurringRules", { dayOfMonth: 1, effectiveFrom: "2026-01-01" }];
  checkRemovals([openMondays, firstDays], "closed", [], report, [0, 6]);
  assert.equal(
    report.incomplete.get(`openRecurringRules ${JSON.stringify({ weekday: 1, months: [5, 7] })}`),
    undefined,
    "診断の期間では取り除けない項目を数えた",
  );
  assert.ok(report.rechecked >= 1, "確かめ直しが働いていない");
});

// ------------------------------------------------------------

test("オラクル: shadowed・never-matches・redundant と出た項目は、まとめて取り除いても全日の結果が変わらず、取り除いた後にこれ以上取り除ける項目がない（既知の項目を除く）", () => {
  const report = run(checkRemovals, [
    ...configs(),
    // Fixed options with three items (jointFixed of oracle-items.json; the brute-force combinations go up to two
    // items, so these are added here)
    ...fixture.jointFixed.map((c) => ({ list: c.items, policy: c.policy, weekdays: c.weekdays })),
  ]);
  summarize("健全性と完全性", report);
  assert.deepEqual(
    report.unsound,
    [],
    "診断が取り除いても変わらないと言った項目（1 つずつ、またはまとめて）で、結果が変わった",
  );
  // Completeness: an item "removable but nothing reported" that is not in the list fails. A listed item that no
  // longer appears fails (only when the full set runs in one go; in a split run a listed item may be in another
  // part)
  assert.deepEqual(
    [...report.incomplete.keys()].filter((k) => !(k in KNOWN_INCOMPLETE)),
    [],
    "出た項目をまとめて取り除いた後に、まだ取り除いても結果が変わらない項目がある（診断の取りこぼし。理由が分かって受け入れるなら KNOWN_INCOMPLETE に載せる）",
  );
  if (FULL && SHARD === undefined)
    assert.deepEqual(
      Object.keys(KNOWN_INCOMPLETE).filter((k) => !report.incomplete.has(k)),
      [],
      "KNOWN_INCOMPLETE の項目が出なくなった（直ったか、網から外れた。一覧から外す）",
    );
  assert.ok(report.configs > 0 && (report.codes["redundant"] ?? 0) > 0, "オラクルが空振りしている");
  // In the full set, all three codes of removable items appear (expired is checked by the next test)
  if (FULL)
    for (const code of ["shadowed", "never-matches", "redundant"])
      assert.ok(
        (report.codes[code] ?? 0) > 0,
        `${code} が 1 件も出ていない（オラクルが空振りしている）`,
      );
});

// ------------------------------------------------------------
// Promises per diagnostic code
// ------------------------------------------------------------

/** The last day of an item (only for a date "YYYY-MM-DD"; undefined for annual dates and rules without an end) */
const endOf = (item: Item): string | undefined => {
  const v = item[1] as Obj | string;
  const end = typeof v === "string" ? v : ((v["effectiveTo"] ?? v["to"]) as string | undefined);
  return end !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : undefined;
};

test("オラクル: expired は、終わりが基準日より前で、基準日以降の結果に影響しない", () => {
  // expired follows from comparing calendar dates alone, so it does not appear for options without an item that
  // ends before the reference date. The diagnostics of such options are skipped (a trade to lower the cost: a
  // wrong expired on skipped options is not caught here. That it is not reported is checked by the unit tests of
  // test/diagnose-as-of.test.ts, with options of rules without an end and annual dates, for several reference
  // dates)
  let checked = 0;
  let diagnosed = 0;
  for (const asOf of AS_OFS) {
    const fromIndex = SHORT_DAYS.indexOf(asOf);
    // Only options with an item that ends before the reference date are chosen first and run (diagnostics that
    // are not used are not computed)
    const chosen = configs().filter(
      (c) =>
        c.list.some((item) => (endOf(item) ?? asOf) < asOf) &&
        !diagnoseOnce(c).some((x) => x["severity"] === "error"),
    );
    assert.ok(chosen.length > 0, `診断した設定が 0 件（基準日 ${asOf}。オラクルが空振りしている）`);
    for (const { list, policy, weekdays } of chosen) {
      diagnosed++;
      const unsound: string[] = [];
      const d = diag["diagnoseCalendar"]!(build(list, policy, weekdays), { asOf }) as Obj[];
      const paths = pathsOf(list);
      const base = snapshot(build(list, policy, weekdays), false);
      paths.forEach((path, p) => {
        if (!d.some((x) => x["path"] === path && x["code"] === "expired")) return;
        checked++;
        const end = endOf(list[p]!);
        if (end === undefined || end >= asOf)
          unsound.push(
            `expired の終わりが基準日以降（基準日 ${asOf}） ${describeConfig(list, policy, weekdays, path)}`,
          );
        if (
          !same(
            snapshot(
              build(
                list.filter((_, q) => q !== p),
                policy,
                weekdays,
              ),
              false,
            ),
            base,
            fromIndex,
          )
        )
          unsound.push(
            `expired を取り除くと基準日以降が変わる（基準日 ${asOf}） ${describeConfig(list, policy, weekdays, path)}`,
          );
      });
      assert.deepEqual(unsound, []);
    }
  }
  console.log(
    `expired: 基準日 ${AS_OFS.join("・")} で診断した設定 ${diagnosed} 件、expired ${checked} 件`,
  );
  assert.ok(checked > 0, "expired が 1 件も出ていない（オラクルが空振りしている）");
});

test("オラクル: no-business-day は営業日が本当にない設定だけ、counting-basis は数え方の限界がある設定だけに出る", () => {
  const report = run((list, policy, d, r, weekdays) => {
    if (
      d.some((x) => x["code"] === "no-business-day") &&
      snapshot(build(list, policy, weekdays), false).includes("true")
    )
      r.unsound.push(
        `no-business-day なのに営業日がある ${describeConfig(list, policy, weekdays)}`,
      );
    // A limit of the counting: there is an nth-business-day rule and a recurring rule that closes or opens a
    // weekday every week (a weekday rule without nth occurrence, every-other-week or month filter), and their
    // effective periods overlap (the counting basis leaves out recurring rules, so that weekday is not part of
    // the count. decisions.md #16). However, the counting basis includes the closed weekdays (closedWeekdays),
    // so the count changes only when the weekday rule changes how that weekday is treated (a closing rule when
    // the weekday is not a closed weekday, an opening rule when it is). counting-basis appears exactly for the
    // pairs that satisfy the premise (per nth-business-day rule, the number of overlapping weekday rules).
    // The oracle uses outOfRangePolicy: "ignore", so no weekday rule is unused outside the supported years
    const rules = list
      .filter(([k]) => k.endsWith("RecurringRules"))
      .map(([k, v]) => ({ open: k === "openRecurringRules", v: v as Obj }));
    const from = (v: Obj): string => (v["effectiveFrom"] as string | undefined) ?? "0000-01-01";
    const to = (v: Obj): string => (v["effectiveTo"] as string | undefined) ?? "9999-12-31";
    const pairs = rules
      .filter(({ v }) => "businessDayOfMonth" in v || "businessDayOfWeek" in v)
      .flatMap(({ v: n }) =>
        rules.filter(
          ({ open, v }) =>
            "weekday" in v &&
            !("nth" in v) &&
            !("interval" in v) &&
            !("months" in v) &&
            weekdays.includes(v["weekday"] as number) === open &&
            from(n) <= to(v) &&
            from(v) <= to(n),
        ),
      ).length;
    const found = d.filter((x) => x["code"] === "counting-basis").length;
    if (found > 0 && pairs === 0)
      r.unsound.push(`counting-basis の前提がない ${describeConfig(list, policy, weekdays)}`);
    else if (found === 0 && pairs > 0)
      r.unsound.push(
        `counting-basis の前提があるのに出ない ${describeConfig(list, policy, weekdays)}`,
      );
    else if (found !== pairs)
      r.unsound.push(
        `counting-basis が ${found} 件で、前提を満たす組の数 ${pairs} と違う ${describeConfig(list, policy, weekdays)}`,
      );
    assert.deepEqual(r.unsound, []);
  });
  assert.ok(report.configs > 0, "試した設定が 0 件（オラクルが空振りしている）");
});

// ------------------------------------------------------------
// Oracle for schedules: options with a month in which the basis calendar throws (docs/decisions.md #31)
// ------------------------------------------------------------
// The nth-business-day rules of a business calendar count on its own options and cannot have a basis calendar, so
// months that cannot be judged occur only in schedules (`calendar` of recurringRules). The items are extended to
// recurringRules and annualDates of schedules, and the bases are written in oracle-items.json as reference marks
// (BASIS_*). valueOn is compared, and days on which the original options throw are not (as in consistency 10)

interface ScheduleItem {
  readonly key: "recurringRules" | "annualDates";
  readonly entry: Obj;
  /** The form of the fixed options of ZIP-B and B_3 moved into the short window (the number tried is printed per form) */
  readonly shape?: string;
}
const scheduleItems: readonly ScheduleItem[] = (
  fixture as unknown as { scheduleItems: ScheduleItem[] }
).scheduleItems;
/** Wraps the short provider of 2025-2027 with other supported years or unconfirmed years */
const shortWith = (id: string, to: number, unconfirmedFrom?: number): unknown => ({
  ...SHORT_PROVIDER,
  id,
  supportedYears: { from: 2025, to },
  holidaysInYear: (year: number) =>
    SHORT_PROVIDER.holidaysInYear(year).map((h) =>
      unconfirmedFrom !== undefined && year >= unconfirmedFrom ? { ...h, confirmed: false } : h,
    ),
});
/** The basis calendars (mark → calendar). All in UTC like the schedules */
const BASES: Readonly<Record<string, unknown>> = {
  // Never throws (no provider)
  BASIS_NONE: lib["createCalendar"]!({ timeZone: "UTC", closedWeekdays: [0, 6] }),
  // Throws in a year inside the window (2025-2027): 2027
  BASIS_IN: lib["createCalendar"]!({
    holidayProvider: shortWith("SHORT-2026", 2026),
    timeZone: "UTC",
    closedWeekdays: [0, 6],
  }),
  // Throws outside both ends of the window (and in 2001-2024 and 2028 of the representative 28 years in which
  // the shapes of rules are examined)
  BASIS_EDGE: lib["createCalendar"]!({
    holidayProvider: SHORT_PROVIDER,
    timeZone: "UTC",
    closedWeekdays: [0, 6],
  }),
  // Throws only inside the window (2027): the supported years are 2001-2028 and only the holidays of 2027 are
  // unconfirmed (it does not throw in the representative 28 years, so the effect of narrowing weeks alone can be
  // measured separately)
  BASIS_INSIDE: lib["createCalendar"]!({
    holidayProvider: {
      ...SHORT_PROVIDER,
      id: "SHORT-INSIDE",
      supportedYears: { from: 2001, to: 2028 },
      holidaysInYear: (year: number) =>
        year < 2025 || year > 2027
          ? []
          : SHORT_PROVIDER.holidaysInYear(year).map((h) =>
              year === 2027 ? { ...h, confirmed: false } : h,
            ),
    },
    timeZone: "UTC",
    closedWeekdays: [0, 6],
    unconfirmedHolidayPolicy: "throw",
  }),
  // The holidays from 2026 are unconfirmed, and it throws in months with an unconfirmed holiday (and outside the
  // supported years)
  BASIS_UNCONFIRMED: lib["createCalendar"]!({
    holidayProvider: shortWith("SHORT-UNCONFIRMED", 2027, 2026),
    timeZone: "UTC",
    closedWeekdays: [0, 6],
    unconfirmedHolidayPolicy: "throw",
  }),
};
const basisOf = (item: ScheduleItem): string =>
  typeof item.entry["calendar"] === "string" ? (item.entry["calendar"] as string) : "なし";
const buildSchedule = (
  list: readonly ScheduleItem[],
  policy: string,
  weekdays: readonly number[],
): Obj => {
  const o: Obj = {
    holidayProvider: SHORT_PROVIDER,
    timeZone: "UTC",
    outOfRangePolicy: "ignore",
    weekdayValues: [0, 1, 2, 3, 4, 5, 6].map((w) => (weekdays.includes(w) ? "closed" : "open")),
    holidayPolicy:
      policy === "closed" ? { value: "closed" } : policy === "open" ? { value: "open" } : "ignore",
  };
  for (const { key, entry } of list) {
    const calendar = entry["calendar"];
    ((o[key] ??= []) as unknown[]).push(
      typeof calendar === "string" ? { ...entry, calendar: BASES[calendar] } : entry,
    );
  }
  return o;
};
/** The values of all days of the window ("E" on a day that throws) */
const scheduleValues = (o: Obj): string[] => {
  const schedule = lib["createSchedule"]!(o) as { valueOn(d: string): unknown };
  return SHORT_DAYS.map((d) => {
    try {
      return JSON.stringify(schedule.valueOn(d));
    } catch {
      return "E";
    }
  });
};
/**
 * The values of all days of the period in which the diagnostics examine rules against each other
 * (rulesScanWindow) ("E" on a day that throws). Empty when the period cannot be computed
 */
const scheduleWindowValues = (o: Obj, windowOf: Obj): string[] => {
  const compiled = scheduleCompile(new scanCore.collector(), windowOf);
  if (compiled === undefined) return [];
  const window = scanCore.window(compiled) as
    | { ranges: { from: number; to: number }[] }
    | undefined;
  if (window === undefined) return [];
  const schedule = lib["createSchedule"]!(o) as { valueOn(d: string): unknown };
  const out: string[] = [];
  for (const { from, to } of window.ranges)
    for (let n = from; n <= to; n++) {
      try {
        out.push(JSON.stringify(schedule.valueOn(scanCore.fromDay(n) as string)));
      } catch {
        out.push("E");
      }
    }
  return out;
};
/** Compares only the days the original options can judge (the days that did not throw) */
const sameOnJudgeable = (base: readonly string[], other: readonly string[]): boolean =>
  base.every((v, i) => v === "E" || v === other[i]);
const schedulePathsOf = (list: readonly ScheduleItem[]): string[] => {
  const count: Record<string, number> = {};
  return list.map(({ key }) => `${key}[${(count[key] = (count[key] ?? -1) + 1)}]`);
};
/**
 * The naive definition of an "unsure rule" (without the internals of how unjudgeable days are found.
 * docs/decisions.md #31): unsure when, in the item's effective period ∩ the window, valueOn of the original
 * options throws on at least one day (thrown days follow from the actual evaluation, so no margin of weeks
 * around is needed).
 * The window is the period in which the diagnostics examine rules against each other (rulesScanWindow; it can be
 * wider than the compared 2025-2027), and valueOn of all its days is examined. never-matches of a recurring rule
 * without a basis calendar follows from the rule's shape alone and is sure (the same exception as the
 * implementation)
 */
const naiveUnsureFor = (
  list: readonly ScheduleItem[],
  thrown: readonly string[],
): ((code: string, path: string) => boolean) => {
  const paths = schedulePathsOf(list);
  return (code, path) => {
    if (code !== "never-matches" && code !== "redundant") return false;
    const index = paths.indexOf(path);
    if (index < 0 || thrown.length === 0) return false;
    const { key, entry } = list[index]!;
    if (key === "recurringRules" && entry["calendar"] === undefined && code === "never-matches")
      return false;
    const from = typeof entry["effectiveFrom"] === "string" ? entry["effectiveFrom"] : "0000-01-01";
    const to = typeof entry["effectiveTo"] === "string" ? entry["effectiveTo"] : "9999-12-31";
    return thrown.some((day) => day >= from && day <= to);
  };
};
/**
 * The "unsure rules" of the implementation (unjudgeableDays and unsureOf of the current source). Used only for
 * the exclusion from completeness (a rule the implementation decided not to report is not reported). Nothing is
 * excluded for a version of ORACLE_TARGET
 */
const unsureCore = target
  ? undefined
  : {
      compile: (await coreOf(undefined, "schedule"))["compileScheduleOptions"]!,
      collector: (await coreOf(undefined, "errors"))[
        "IssueCollector"
      ] as unknown as new () => unknown,
      diagnose: await coreOf(undefined, "diagnose"),
    };
const unsureFor = (o: Obj): ((code: string, path: string) => boolean) => {
  if (!unsureCore) return () => false;
  const compiled = unsureCore.compile(new unsureCore.collector(), o);
  if (compiled === undefined) return () => false;
  const window = unsureCore.diagnose["rulesScanWindow"]!(compiled);
  // The bases are guarded first, as the diagnostics do: a month in which a basis throws is recognized by what
  // the guarded basis returns
  const guarded = unsureCore.diagnose["guardBases"]!(compiled, new Set<number>());
  const unknown = unsureCore.diagnose["unjudgeableDays"]!(guarded, window);
  // Options in which the inside of a basis calendar cannot be examined completely (blind) are also left out as
  // rules the implementation decided not to report
  const blind = (window as { blind?: boolean } | undefined)?.blind;
  return unsureCore.diagnose["unsureOf"]!(compiled, unknown, blind) as (
    c: string,
    p: string,
  ) => boolean;
};
/**
 * Of all days of the period in which the diagnostics examine rules against each other, the days on which
 * valueOn of the original options throws (the input of the naive definition)
 */
const scheduleCompile = (await coreOf(undefined, "schedule"))["compileScheduleOptions"]!;
const thrownInWindow = (o: Obj): string[] => {
  const compiled = scheduleCompile(new scanCore.collector(), o);
  if (compiled === undefined) return [];
  const window = scanCore.window(compiled) as
    | { ranges: { from: number; to: number }[] }
    | undefined;
  if (window === undefined) return [];
  const schedule = lib["createSchedule"]!(o) as { valueOn(d: string): unknown };
  const thrown: string[] = [];
  for (const { from, to } of window.ranges)
    for (let n = from; n <= to; n++) {
      const day = scanCore.fromDay(n) as string;
      try {
        schedule.valueOn(day);
      } catch {
        thrown.push(day);
      }
    }
  return thrown;
};
/**
 * pnpm check (no ORACLE_FULL) tries only a fixed sample of all options, at this interval (the forms of the fixed
 * options are always included)
 */
const SCHEDULE_SAMPLE_EVERY = 20;
const schedulePlan = (() => {
  const all: { list: ScheduleItem[]; policy: string; weekdays: readonly number[] }[] = [];
  const pick = random(20261108);
  for (let i = 0; i < scheduleItems.length; i++)
    for (let j = i; j < scheduleItems.length; j++) {
      const list = i === j ? [scheduleItems[i]!] : [scheduleItems[i]!, scheduleItems[j]!];
      for (const policy of POLICIES)
        for (const weekdays of WEEKDAY_SETS) {
          if (i !== j && weekdays.length !== 2 && pick() >= OTHER_WEEKDAYS_RATE) continue;
          all.push({ list, policy, weekdays });
        }
    }
  // Also in a sample, the forms of the fixed options always include the options with one item, policy closed
  // and closed weekdays [0, 6]
  const always = (c: (typeof all)[number]) =>
    c.list.length === 1 &&
    c.list[0]!.shape !== undefined &&
    c.policy === "closed" &&
    c.weekdays.length === 2;
  return all.filter(
    (c, n) =>
      (FULL || n % SCHEDULE_SAMPLE_EVERY === 0 || always(c)) && (!SHARD || n % SHARD.n === SHARD.k),
  );
})();

test("スケジュールのオラクル: 基準のカレンダーが投げる月のある設定で、出た項目をまとめて取り除いても判定できる日の結果が変わらず、分からない規則には出ず、取り除いた後に取り除ける項目が残らない（分からない規則を除く）", () => {
  const unsound: string[] = [];
  const incomplete = new Map<string, number>();
  let unsureBoth = 0;
  let unsureOnlyImpl = 0;
  const byBasis: Record<string, number> = {};
  const byShape: Record<string, number> = {};
  for (const { list, policy, weekdays } of schedulePlan) {
    const o = buildSchedule(list, policy, weekdays);
    const describe = (removed?: readonly string[]) =>
      JSON.stringify({ items: list.map((x) => [x.key, x.entry]), policy, weekdays, removed });
    let d: Obj[];
    try {
      d = diag["diagnoseSchedule"]!(o) as Obj[];
    } catch (error) {
      unsound.push(`診断が投げた ${String(error)} ${describe()}`);
      continue;
    }
    if (d.some((x) => x["severity"] === "error")) continue;
    for (const item of list) byBasis[basisOf(item)] = (byBasis[basisOf(item)] ?? 0) + 1;
    for (const item of list) if (item.shape) byShape[item.shape] = (byShape[item.shape] ?? 0) + 1;
    const paths = schedulePathsOf(list);
    const unsure = unsureFor(o);
    const base = scheduleValues(o);
    const naive = naiveUnsureFor(
      list,
      list.some((x) => typeof x.entry["calendar"] === "string") ? thrownInWindow(o) : [],
    );
    // The promise about unsure rules (checked with the naive definition; finds an implementation whose set is
    // too narrow and reports a diagnostic it must not report)
    for (const x of d)
      if (naive(x["code"] as string, x["path"] as string))
        unsound.push(
          `素朴な定義で分からない規則に ${String(x["code"])} ${String(x["path"])} ${describe()}`,
        );
    // Soundness: removing the reported items together does not change the result of a day that can be judged
    const removed = paths.filter((path) =>
      d.some(
        (x) =>
          x["path"] === path &&
          ["shadowed", "never-matches", "redundant"].includes(x["code"] as string),
      ),
    );
    const remaining = list.filter((_, p) => !removed.includes(paths[p]!));
    const rest = buildSchedule(remaining, policy, weekdays);
    const restValues = scheduleValues(rest);
    if (!sameOnJudgeable(base, restValues)) {
      unsound.push(`まとめて取り除くと変わる ${describe(removed)}`);
      continue;
    }
    // Completeness: after the removal, no item is left whose removal does not change the result of a day that
    // can be judged. Unsure rules are left out of the count
    const remainingPaths = paths.filter((p) => !removed.includes(p));
    /**
     * The values, over the period in which the diagnostics examine rules against each other, of the options
     * after removing the reported items (rest) (not computed again per removable item)
     */
    let windowBase: string[] | undefined;
    remaining.forEach((item, q) => {
      const smallerSchedule = buildSchedule(
        remaining.filter((_, k) => k !== q),
        policy,
        weekdays,
      );
      if (!sameOnJudgeable(base, scheduleValues(smallerSchedule))) return;
      // An item removable within the supported years is checked again over the period in which the diagnostics
      // examine rules against each other. As in the oracle for business calendars (removableInScanWindow), the
      // options after removing the reported items (rest) are the basis, compared over their scan range (with the
      // original options as the basis, a reported item that changes a value outside the supported years would
      // silently drop the item out of the completeness check through that difference. decisions.md #31)
      windowBase ??= scheduleWindowValues(rest, rest);
      if (!sameOnJudgeable(windowBase, scheduleWindowValues(smallerSchedule, rest))) return;
      if (unsure("redundant", remainingPaths[q]!)) {
        // An item the implementation does not report as unsure. Counted separately: also unsure by the naive
        // definition (the limit of the month as unit), or judgeable by the naive definition (the implementation
        // asks for too much; what narrowing the unjudgeable months reduces)
        if (naive("redundant", remainingPaths[q]!)) unsureBoth++;
        else unsureOnlyImpl++;
        return;
      }
      const key = `${item.key} ${JSON.stringify(item.entry)}`;
      incomplete.set(key, (incomplete.get(key) ?? 0) + 1);
    });
  }
  const lines = [
    "### スケジュールのオラクル",
    "",
    `試した設定 ${schedulePlan.length} 件（${FULL ? "全件" : `${SCHEDULE_SAMPLE_EVERY} 件に 1 件の抜き出しと、固定の設定の形`}${SHARD ? `、${SHARD.n} 個に分けた ${SHARD.k} 番目` : ""}）、誤り ${unsound.length} 件`,
    `基準ごとの項目: ${JSON.stringify(byBasis)}`,
    `固定の設定の形ごと: ${JSON.stringify(byShape)}`,
    `取り除けるのに出ない項目（素朴な定義でも分からない）: ${unsureBoth} 件`,
    `取り除けるのに出ない項目（実装だけが分からないとする。求めすぎ）: ${unsureOnlyImpl} 件`,
    `取り除けるのに出ない項目（分からない規則を除く）: ${incomplete.size === 0 ? "なし" : JSON.stringify([...incomplete])}`,
    "",
  ];
  console.log(lines.join("\n"));
  if (FULL && process.env["GITHUB_STEP_SUMMARY"])
    appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `${lines.join("\n")}\n`);
  assert.deepEqual(unsound, [], "スケジュールのオラクルの健全性");
  assert.deepEqual(
    [...incomplete.keys()],
    [],
    "スケジュールのオラクルの完全性（分からない規則を除く）",
  );
  // Not an empty run: the 4 kinds of bases and every form of the fixed options were tried (in a split run they
  // may be in another part)
  if (SHARD === undefined) {
    for (const basis of Object.keys(BASES))
      assert.ok((byBasis[basis] ?? 0) > 0, `基準 ${basis} を試していない`);
    for (const shape of new Set(scheduleItems.flatMap((x) => (x.shape ? [x.shape] : []))))
      assert.ok((byShape[shape] ?? 0) > 0, `形「${shape}」を試していない`);
    // The unjudgeable days (by day) make the same items unsure as the naive definition (0 items asked for too
    // much; the result of the narrowing in 0.31.0)
    assert.equal(unsureOnlyImpl, 0, "実装の求めすぎ（素朴な定義では判定できるのに出さない項目）");
    assert.ok(unsureBoth > 0, "素朴な定義でも分からない項目が 0 件（素朴な定義が働いていない）");
  }
});
