/**
 * Comparison of the results of options with the previous version (the result-compare job of CI; RELEASING.md,
 * reasons for the quality mechanisms, "compare with the previous version").
 *
 * A set of options decided by a seed, and fixed options that record past regressions, are passed to both the
 * previous version and this dist, and the results of calendars (direct, combined, from a schedule) and schedules
 * are compared day by day. Compared: business day or not (the value), reason, name, shiftedFrom and the option
 * position. For the diagnostics, every result of the previous version (severity, code, path, relatedPath) must
 * be among the results of this version (the diagnostics item of the compatibility promise of RELEASING.md;
 * results that disappeared because a wrong diagnostic was fixed are allowed in etc/result-changes.json).
 *
 * Option names: when the previous version is from before the rename (before 0.30.0), only the old names;
 * otherwise both the new and the old names. Compared with a version from before the rename, the renamed returned
 * values (reason "regular" → "default") and the renamed keys in option positions are aligned first.
 *
 * Intended differences are allowed in etc/result-changes.json with a feature of the options (trait), the version
 * they came in and the source. Differences of diagnostics can also be narrowed by the codes of the results that
 * disappeared (removedCodes).
 * A difference is allowed only when the previous version is from before the change (at least affectedSince and
 * below introducedIn) and this version contains it.
 * It fails when: there is a difference that is not allowed; in this version some options unintentionally failed
 * to be created (wrong inputs the generators mixed in on purpose - options with a rule marked by
 * test/support/catalog.ts - are counted and shown in the Job Summary, and 0 of them fails as an empty run; any
 * other failure to create fails because no result was compared. They are counted per way of naming (new names,
 * old names), and the number of options that also failed in the previous version is shown: the same mistake in
 * both versions is no difference, so without counting it would silently be an empty run); in the old-name round,
 * some options that have properties writable under a new name were not rewritten to the old names.
 *
 * Usage: node scripts/result-compare.ts --base <dir> [--head .] [--base-label <label>] [--seed <n>] [--scale <n>]
 *        [--changes <file>]
 *   --base is the directory of the unpacked previous version (package/ of the npm pack tgz). --head is this
 *   repository (after pnpm build).
 *   --scale multiplies the number of options (default 1). --changes is the list of intended differences
 *   (default: etc/result-changes.json of --head; pass this repository's list when comparing two published
 *   versions to see whether the check works)
 * Exit code: 0 = pass, 1 = a difference that is not allowed or options that unintentionally failed to be
 * created, 2 = wrong arguments, a loading error or an unexpected error (thrown outside the comparison of an
 * option; the comparison did not finish, so whether there are differences is unknown). The result is written as
 * Markdown on standard output.
 */

// The first import: turns an unexpected error into exit code 2 (loaded before the others, to catch errors thrown
// while another import is evaluated)
import "./exit-on-unexpected.ts";
import "./strict-warnings.ts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isIntendedInvalid } from "../test/support/catalog.ts";
import {
  fixedCases,
  generateCases,
  traitsOfCase,
  withCalendars,
  type Case,
} from "../test/support/result-cases.ts";

type Obj = Record<string, unknown>;
type Fn = (...args: unknown[]) => unknown;

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const baseDir = argValue("--base");
if (baseDir === undefined) {
  console.error(
    "usage: node scripts/result-compare.ts --base <dir> [--head .] [--base-label <label>] [--seed <n>] [--scale <n>] [--changes <file>]",
  );
  process.exit(2);
}
const headDir = argValue("--head") ?? ".";
/**
 * A numeric argument (a value that is not a number or is out of range is a usage error, so that 0 compared
 * options do not pass silently)
 */
const numberArg = (name: string, fallback: string, valid: (n: number) => boolean): number => {
  const text = argValue(name) ?? fallback;
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n) || !valid(n)) {
    console.error(`${name}: invalid value ${JSON.stringify(text)}`);
    process.exit(2);
  }
  return n;
};
const seed = numberArg("--seed", "20261030", Number.isInteger);
const scale = numberArg("--scale", "1", (n) => n > 0);
const versionOf = (dir: string): string =>
  (JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")) as { version: string }).version;
const headVersion = versionOf(headDir);
const baseVersion = versionOf(baseDir);
const baseLabel = argValue("--base-label") ?? baseVersion;

/** Compares "a.b.c" versions (prereleases are not used) */
const cmp = (a: string, b: string): number => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};
/** Whether the base version is from before the rename (0.30.0) */
const baseIsBeforeRename = cmp(baseVersion, "0.30.0") < 0;

// ------------------------------------------------------------
// Loading
// ------------------------------------------------------------

interface Lib {
  readonly createCalendar: Fn;
  readonly createSchedule: Fn;
  readonly combineCalendars: Fn;
  readonly createCalendarFromSchedule: Fn;
  readonly diagnoseCalendar: Fn;
  readonly diagnoseSchedule: Fn;
  readonly providers: ReadonlyMap<string, Obj>;
}

async function load(dir: string): Promise<Lib> {
  const at = (sub: string): string => pathToFileURL(resolve(dir, "dist", sub, "index.js")).href;
  const root = (await import(pathToFileURL(resolve(dir, "dist", "index.js")).href)) as Obj;
  const diagnose = (await import(at("diagnose"))) as Obj;
  const jp = (await import(at("jp"))) as Obj;
  const uk = (await import(at("uk"))) as Obj;
  const sg = (await import(at("sg"))) as Obj;
  const fr = (await import(at("fr"))) as Obj;
  const providers = new Map<string, Obj>([
    ["jp", jp["jp"] as Obj],
    ["england", uk["england"] as Obj],
    ["scotland", uk["scotland"] as Obj],
    ["metropole", fr["metropole"] as Obj],
    ["sg", sg["sg"] as Obj],
  ]);
  for (const [name, p] of providers) {
    if (p === undefined) throw new Error(`${dir}: provider ${name} is not exported`);
  }
  return {
    createCalendar: root["createCalendar"] as Fn,
    createSchedule: root["createSchedule"] as Fn,
    combineCalendars: root["combineCalendars"] as Fn,
    createCalendarFromSchedule: root["createCalendarFromSchedule"] as Fn,
    diagnoseCalendar: diagnose["diagnoseCalendar"] as Fn,
    diagnoseSchedule: diagnose["diagnoseSchedule"] as Fn,
    providers,
  };
}

// ------------------------------------------------------------
// Writing with old names, aligning the names in results
// ------------------------------------------------------------

interface Renamed {
  readonly place: string;
  readonly from: string;
  readonly to: string;
}
/** The rename table (the internal table of this dist; used only against a version from before the rename) */
let renamedKeys: readonly Renamed[] = [];

const renameObject = (places: readonly string[], value: Obj, toOld: boolean): Obj => {
  const out: Obj = {};
  for (const [k, v] of Object.entries(value)) {
    const r = renamedKeys.find((x) => places.includes(x.place) && (toOld ? x.to : x.from) === k);
    out[r ? (toOld ? r.from : r.to) : k] = v;
  }
  return out;
};

/** Writes options with new names under the old names (renamed value: holidayPolicy "ignore" → "weekday" of schedules) */
function toOld(c: Case): Obj {
  const ruleList = (list: unknown): unknown =>
    Array.isArray(list) ? list.map((r) => renameObject(["rule"], r as Obj, true)) : list;
  const top = c.kind === "calendar" ? ["source", "calendar"] : ["source", "schedule"];
  const o: Obj = { ...c.options };
  for (const k of ["closedRecurringRules", "openRecurringRules", "recurringRules"])
    if (k in o) o[k] = ruleList(o[k]);
  if (c.kind === "schedule" && o["holidayPolicy"] === "ignore") o["holidayPolicy"] = "weekday";
  return renameObject(top, o, true);
}

/** Aligns the old-name keys of an option position ("closedRecurring[0].kinds[0]", ...) to the new names */
function normalizePath(path: string | undefined): string | undefined {
  if (path === undefined || renamedKeys.length === 0) return path;
  return path
    .split(".")
    .map((segment, i) => {
      const m = /^([^[]+)(.*)$/.exec(segment);
      if (!m) return segment;
      const places = i === 0 ? ["source", "calendar", "schedule"] : ["rule"];
      const r = renamedKeys.find((x) => places.includes(x.place) && x.from === m[1]);
      return r ? `${r.to}${m[2]}` : segment;
    })
    .join(".");
}

// ------------------------------------------------------------
// Comparing
// ------------------------------------------------------------

const withProviders = (lib: Lib, options: Obj): Obj => {
  const p = options["holidayProvider"];
  const one = (name: unknown): unknown => lib.providers.get(name as string) ?? name;
  return p === undefined
    ? options
    : { ...options, holidayProvider: Array.isArray(p) ? p.map(one) : one(p) };
};
const withProvidersOld = (lib: Lib, options: Obj): Obj => {
  const p = options["holidays"];
  if (p === undefined) return withProviders(lib, options);
  const one = (name: unknown): unknown => lib.providers.get(name as string) ?? name;
  return { ...options, holidays: Array.isArray(p) ? p.map(one) : one(p) };
};

/** Renamed error codes (aligned when comparing with a version from before the rename) */
const RENAMED_CODES: Readonly<Record<string, string>> = {
  "invalid-month-day": "invalid-annual-date",
};
const errorCode = (error: unknown): string => {
  const code = String((error as { code?: unknown } | null)?.code ?? "error");
  return `throws ${RENAMED_CODES[code] ?? code}`;
};

/**
 * Brings the result of one day into the compared form. The reason "regular" of a version from before the rename
 * becomes the word after the rename ("open-weekday" for a calendar of createCalendarFromSchedule, otherwise
 * "default"; the returned values of 0.30.0 in docs/migration.md)
 */
function dayRecord(day: Obj, fromSchedule: boolean): string {
  const reason =
    day["reason"] === "regular" ? (fromSchedule ? "open-weekday" : "default") : day["reason"];
  return JSON.stringify([
    "value" in day ? day["value"] : (day["open"] ?? day["businessDay"]),
    reason,
    day["name"] ?? null,
    day["shiftedFrom"] ?? null,
    normalizePath((day["optionPath"] ?? day["rulePath"]) as string | undefined) ?? null,
  ]);
}

type Built = { ok: true; value: Obj } | { ok: false; error: string };
const build = (fn: () => unknown): Built => {
  try {
    return { ok: true, value: fn() as Obj };
  } catch (error) {
    return { ok: false, error: errorCode(error) };
  }
};
const days = (built: Built, from: string, to: string, fromSchedule = false): string[] | string => {
  if (!built.ok) return built.error;
  try {
    return ((built.value["daysBetween"] as Fn)(from, to) as Obj[]).map((d) =>
      dayRecord(d, fromSchedule),
    );
  } catch (error) {
    return errorCode(error);
  }
};

interface Diff {
  readonly id: string;
  readonly naming: "new" | "old";
  readonly target: string;
  readonly detail: string;
  readonly traits: readonly string[];
  /** For a difference of diagnostics: the codes of the results the previous version has and this one lacks */
  readonly removedCodes?: readonly string[];
}

/**
 * The features of what was compared (the unit by which intended differences are allowed). A combination gets
 * them from the options of both calendars of the pair, anything else from its own options only (so that the
 * features of the partner calendar do not allow a difference of a single result)
 */
function traitsOf(c: Case, target: string): string[] {
  const own = traitsOfCase(c);
  if (target !== "combine" || c.partner === undefined) return own;
  return [...new Set([...own, ...traitsOfCase(c.partner)])];
}

function compareDays(
  diffs: Diff[],
  base: string[] | string,
  head: string[] | string,
  meta: Omit<Diff, "detail">,
  from: string,
): void {
  if (typeof base === "string" || typeof head === "string") {
    if (JSON.stringify(base) !== JSON.stringify(head))
      diffs.push({
        ...meta,
        detail: `${typeof base === "string" ? base : "ok"} → ${typeof head === "string" ? head : "ok"}`,
      });
    return;
  }
  const start = Date.parse(`${from}T00:00:00Z`);
  let count = 0;
  let first = "";
  for (let i = 0; i < Math.max(base.length, head.length); i++) {
    if (base[i] === head[i]) continue;
    if (count === 0)
      first = `${new Date(start + i * 86400000).toISOString().slice(0, 10)}: ${base[i]} → ${head[i]}`;
    count++;
  }
  if (count > 0) diffs.push({ ...meta, detail: `${count} 日（最初 ${first}）` });
}

function diagnosticKeys(list: unknown): Set<string> | string {
  if (!Array.isArray(list)) return "not an array";
  return new Set(
    (list as Obj[]).map((d) =>
      JSON.stringify([
        d["severity"],
        RENAMED_CODES[d["code"] as string] ?? d["code"],
        normalizePath(d["path"] as string),
        normalizePath(d["relatedPath"] as string | undefined) ?? null,
      ]),
    ),
  );
}

/**
 * Whether the options contain an intended wrong input (a rule marked by the generator; isIntendedInvalid of
 * test/support/catalog.ts)
 */
const intendedInvalid = (c: Case): boolean =>
  ["closedRecurringRules", "openRecurringRules", "recurringRules"].some(
    (k) => Array.isArray(c.options[k]) && (c.options[k] as unknown[]).some(isIntendedInvalid),
  );

/**
 * Tally of creation (in this version: options with an intended wrong input, options that unintentionally failed
 * to be created). bothFailed: of the unintended failures, those that also failed in the previous version (the
 * same mistake is no difference, an empty run that compares no result). notRenamed: options that were not
 * rewritten to old names in the old-name round (they have properties writable under a new name, yet the
 * rewritten options equal the new-name ones)
 */
const creation = {
  intended: 0,
  unintended: [] as string[],
  bothFailed: 0,
  notRenamed: [] as string[],
};

/**
 * Counts the results of creation. An intended wrong input is counted in the first way of naming only (the same
 * options are not counted twice). An unintended failure to create is counted per way of naming (to find options
 * that fail only in the old-name round)
 */
function tally(c: Case, h: Built, naming: "new" | "old", b?: Built): void {
  if (intendedInvalid(c)) {
    if (naming !== namings[0]) return;
    if (h.ok) creation.unintended.push(`${c.id} [${naming}]: 意図した入力の誤りなのに作成できた`);
    else creation.intended++;
  } else if (!h.ok) {
    creation.unintended.push(`${c.id} [${naming}]: ${h.error}`);
    if (b !== undefined && !b.ok) creation.bothFailed++;
  }
}

/**
 * Whether the options have a property writable under a new name (a name in the table of old names): the ones
 * checked for being rewritten in the old-name round
 */
function hasRenamable(c: Case): boolean {
  const places = c.kind === "calendar" ? ["source", "calendar"] : ["source", "schedule"];
  const top = Object.keys(c.options).some((k) =>
    renamedKeys.some((r) => places.includes(r.place) && r.to === k),
  );
  const rules = ["closedRecurringRules", "openRecurringRules", "recurringRules"].some(
    (k) =>
      Array.isArray(c.options[k]) &&
      (c.options[k] as Obj[]).some((r) =>
        Object.keys(r).some((rk) => renamedKeys.some((x) => x.place === "rule" && x.to === rk)),
      ),
  );
  return top || rules;
}

function runCase(c: Case, base: Lib, head: Lib, naming: "new" | "old", diag: boolean): Diff[] {
  const diffs: Diff[] = [];
  const written = naming === "old" ? toOld(c) : c.options;
  if (naming === "old" && hasRenamable(c) && JSON.stringify(written) === JSON.stringify(c.options))
    creation.notRenamed.push(c.id);
  const opts = (lib: Lib): Obj =>
    withCalendars(
      lib,
      c,
      naming,
      naming === "old" ? withProvidersOld(lib, written) : withProviders(lib, written),
    );
  const meta = (target: string): Omit<Diff, "detail"> => ({
    id: c.id,
    naming,
    target,
    traits: traitsOf(c, target),
  });
  if (c.kind === "calendar") {
    const b = build(() => base.createCalendar(opts(base)));
    const h = build(() => head.createCalendar(opts(head)));
    tally(c, h, naming, b);
    if (c.partner) {
      // The partner of a combination is counted like the options themselves (the previous version's result is
      // passed, and the rewrite to old names in the old-name round is checked too)
      const partner = c.partner;
      const partnerOpts = (lib: Lib): Obj =>
        naming === "old"
          ? withProvidersOld(lib, toOld(partner))
          : withProviders(lib, partner.options);
      if (
        naming === "old" &&
        hasRenamable(partner) &&
        JSON.stringify(toOld(partner)) === JSON.stringify(partner.options)
      )
        creation.notRenamed.push(`${c.id} (partner)`);
      tally(
        partner,
        build(() => head.createCalendar(partnerOpts(head))),
        naming,
        build(() => base.createCalendar(partnerOpts(base))),
      );
    }
    compareDays(diffs, days(b, c.from, c.to), days(h, c.from, c.to), meta("calendar"), c.from);
    if (c.partner && b.ok && h.ok) {
      const partner = (lib: Lib): Obj =>
        naming === "old"
          ? withProvidersOld(lib, toOld(c.partner!))
          : withProviders(lib, c.partner!.options);
      const combineKey = naming === "old" ? "businessDay" : "open";
      const bc = build(() =>
        base.combineCalendars([b.value, base.createCalendar(partner(base))], {
          [combineKey]: c.combine,
        }),
      );
      const hc = build(() =>
        head.combineCalendars([h.value, head.createCalendar(partner(head))], {
          [combineKey]: c.combine,
        }),
      );
      const from = c.from > c.partner.from ? c.from : c.partner.from;
      const to = c.to < c.partner.to ? c.to : c.partner.to;
      if (from <= to)
        compareDays(diffs, days(bc, from, to), days(hc, from, to), meta("combine"), from);
    }
  } else {
    const b = build(() => base.createSchedule(opts(base)));
    const h = build(() => head.createSchedule(opts(head)));
    tally(c, h, naming, b);
    compareDays(diffs, days(b, c.from, c.to), days(h, c.from, c.to), meta("schedule"), c.from);
    if (b.ok && h.ok) {
      const isOpen = (v: unknown): boolean => v !== "closed";
      const bc = build(() => base.createCalendarFromSchedule(b.value, isOpen));
      const hc = build(() => head.createCalendarFromSchedule(h.value, isOpen));
      compareDays(
        diffs,
        days(bc, c.from, c.to, true),
        days(hc, c.from, c.to, true),
        meta("from-schedule"),
        c.from,
      );
    }
  }
  if (diag) {
    const fn = c.kind === "calendar" ? "diagnoseCalendar" : "diagnoseSchedule";
    const bd = build(() => ({ list: base[fn](opts(base)) }) as Obj);
    const hd = build(() => ({ list: head[fn](opts(head)) }) as Obj);
    const bk = bd.ok ? diagnosticKeys(bd.value["list"]) : bd.error;
    const hk = hd.ok ? diagnosticKeys(hd.value["list"]) : hd.error;
    if (typeof bk === "string" || typeof hk === "string") {
      if (bk !== hk) diffs.push({ ...meta("diagnose"), detail: `${String(bk)} → ${String(hk)}` });
    } else {
      const missing = [...bk].filter((k) => !hk.has(k));
      // Additional results are within the promise (not a failure). They are listed, to notice changes that
      // belong in the CHANGELOG. In the comparison of old-name options deprecated-option only reports the use of
      // an old name (absent in a version from before the rename), so it is not counted. A deprecated-option
      // added for new-name options is a change users see and is counted
      const added = [...hk].filter(
        (k) =>
          !bk.has(k) &&
          !(naming === "old" && (JSON.parse(k) as unknown[])[1] === "deprecated-option"),
      );
      if (added.length > 0) increases.push(`${c.id} [${naming}]: ${added.join(" ")}`);
      if (missing.length > 0) {
        diffs.push({
          ...meta("diagnose"),
          detail: `前のバージョンの結果がない: ${missing.join(" ")}`,
          removedCodes: missing.map((k) => String((JSON.parse(k) as unknown[])[1])),
        });
      }
    }
  }
  return diffs;
}

/** Options with more diagnostics (results the previous version lacks; within the promise, so not a failure) */
const increases: string[] = [];

// ------------------------------------------------------------
// Intended differences
// ------------------------------------------------------------

interface KnownChange {
  readonly trait: string;
  readonly targets: readonly string[];
  readonly affectedSince?: string;
  readonly introducedIn: string;
  readonly source: string;
  readonly summary: string;
  /**
   * Narrows a difference of diagnostics to disappeared results of the previous version whose codes are all in
   * this list
   */
  readonly removedCodes?: readonly string[];
}

function knownChanges(): KnownChange[] {
  const path = argValue("--changes") ?? resolve(headDir, "etc/result-changes.json");
  const list = JSON.parse(readFileSync(path, "utf8")) as { changes: KnownChange[] };
  for (const k of list.changes) {
    const file = k.source.split("#")[0]!;
    if (!existsSync(resolve(path, "../..", file)))
      throw new Error(`${path}: ${file} does not exist`);
  }
  return list.changes;
}

/**
 * Whether a difference is allowed: the previous version is from before the change, this version contains it,
 * the options have the feature and the compared target matches
 */
const allowedBy = (known: readonly KnownChange[], d: Diff): KnownChange | undefined =>
  known.find(
    (k) =>
      d.traits.includes(k.trait) &&
      k.targets.includes(d.target) &&
      (k.removedCodes === undefined ||
        (d.removedCodes !== undefined &&
          d.removedCodes.every((code) => k.removedCodes!.includes(code)))) &&
      cmp(baseVersion, k.introducedIn) < 0 &&
      (k.affectedSince === undefined || cmp(baseVersion, k.affectedSince) >= 0) &&
      cmp(headVersion, k.introducedIn) >= 0,
  );

// ------------------------------------------------------------
// Running
// ------------------------------------------------------------

let base: Lib;
let head: Lib;
let known: KnownChange[];
try {
  base = await load(baseDir);
  head = await load(headDir);
  known = knownChanges();
  // The old-name round (part of every comparison) rewrites options to the old names, so the table of old names
  // is always loaded (up to 0.30.7 it was loaded only against a version from before the rename, so the old-name
  // round of the comparison with latest was not rewritten)
  const table = (await import(pathToFileURL(resolve(headDir, "dist/core/renamed.js")).href)) as {
    RENAMED_KEYS?: readonly Renamed[];
  };
  // An empty table is a loading error (with an empty table the old-name round is not rewritten, and the check
  // for options not rewritten uses the table too and finds nothing; this check must be able to stop the very
  // hole fixed in 0.30.7)
  if (!table.RENAMED_KEYS || table.RENAMED_KEYS.length === 0)
    throw new Error("dist/core/renamed.js has no RENAMED_KEYS (or it is empty)");
  renamedKeys = table.RENAMED_KEYS;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const newShapes = !baseIsBeforeRename;
const fixed = fixedCases().filter(
  (c) => c.minBase === undefined || cmp(baseVersion, c.minBase) >= 0,
);
const cases: Case[] = [...fixed, ...generateCases(seed, scale, newShapes)];
/**
 * Diagnostics take time, so they run on the fixed options and on one in four of the seeded options. A seeded
 * option is chosen by the remainder of its number divided by 4 (DIAGNOSED_REMAINDER), so that adding fixed
 * options does not change which seeded options are diagnosed. The remainder differs between the comparison with
 * a version from before the rename and the others, so that the same options are chosen as up to 0.30.6, when the
 * choice depended on the number of fixed options (to keep the record of the generated range)
 */
const DIAGNOSED_REMAINDER = newShapes ? 1 : 2;
const diagnosed = (c: Case, i: number): boolean =>
  c.id.startsWith("fixed-") || (i - fixed.length) % 4 === DIAGNOSED_REMAINDER;

const namings: ("new" | "old")[] = baseIsBeforeRename ? ["old"] : ["new", "old"];
const diffs: Diff[] = [];
let diagnosedCount = 0;
cases.forEach((c, i) => {
  const diag = diagnosed(c, i);
  if (diag) diagnosedCount++;
  for (const naming of namings) diffs.push(...runCase(c, base, head, naming, diag));
});

const unexpected = diffs.filter((d) => allowedBy(known, d) === undefined);
// The generators work in a context that mixes in mistakes, so 0 options with a wrong input means that the
// comparison of error codes is silently no longer looked at
const noInvalid = creation.intended === 0;
const failed =
  unexpected.length > 0 ||
  creation.unintended.length > 0 ||
  creation.notRenamed.length > 0 ||
  noInvalid;
const allowed = diffs.filter((d) => allowedBy(known, d) !== undefined);

const out: string[] = [];
out.push(`## 設定の結果の差分（${baseLabel} → ${headVersion}）`, "");
out.push(
  `設定 ${cases.length} 件（カレンダー ${cases.filter((c) => c.kind === "calendar").length}・スケジュール ${cases.filter((c) => c.kind === "schedule").length}。` +
    `診断 ${diagnosedCount} 件）、名前: ${namings.join("・")}、種 ${seed}`,
  "",
);
out.push(
  `入力の誤りの設定: ${creation.intended} 件（エラーコードを比較）。意図せず作成に失敗した設定: ${creation.unintended.length} 件（名前の書き方ごと。うち前のバージョンでも失敗した設定 ${creation.bothFailed} 件）。旧名に書き換わらなかった設定: ${creation.notRenamed.length} 件`,
  "",
);
if (creation.unintended.length > 0)
  out.push(
    "意図せず作成に失敗した設定（生成器が誤った設定を作っている。結果を比べられていない）:",
    "",
    "```text",
    ...creation.unintended.slice(0, 100),
    "```",
    "",
  );
const describe = (d: Diff): string =>
  `${d.id} [${d.naming}] ${d.target}: ${d.detail}${d.traits.length > 0 ? `（${d.traits.join(", ")}）` : ""}`;
const LIMIT = 100;
if (allowed.length > 0) {
  const byChange = new Map<KnownChange, number>();
  for (const d of allowed) {
    const k = allowedBy(known, d)!;
    byChange.set(k, (byChange.get(k) ?? 0) + 1);
  }
  out.push("意図した差分（etc/result-changes.json）:", "");
  for (const [k, n] of byChange) {
    out.push(`- ${k.trait}（${k.introducedIn}）: ${n} 件 — ${k.summary}（${k.source}）`);
    // The options of the allowed differences (to compare with the allowed side when an unintended difference appears)
    const ids = allowed
      .filter((d) => allowedBy(known, d) === k)
      .map((d) => `${d.id} [${d.target}]`);
    out.push(...[...new Set(ids)].slice(0, LIMIT).map((id) => `  - ${id}`));
  }
  out.push("");
}
out.push(
  `診断の結果が増えた設定（約束の範囲内。CHANGELOG に書くべき変化かを確かめる）: ${increases.length} 件`,
  "",
);
if (increases.length > 0)
  out.push(
    "```text",
    ...increases.slice(0, LIMIT),
    ...(increases.length > LIMIT ? [`…（ほか ${increases.length - LIMIT} 件）`] : []),
    "```",
    "",
  );
if (unexpected.length > 0) {
  out.push(
    `許していない差分（${unexpected.length} 件${unexpected.length > LIMIT ? `。先頭の ${LIMIT} 件` : ""}）:`,
    "",
    "```text",
    ...unexpected.slice(0, LIMIT).map(describe),
    "```",
    "",
    "**失敗**（意図した変更なら、etc/result-changes.json に特徴・バージョン・出典を書く）",
  );
} else if (creation.unintended.length > 0) {
  out.push("**失敗**（意図せず作成に失敗した設定がある）");
} else if (creation.notRenamed.length > 0) {
  out.push(
    `**失敗**（旧名の回で旧名に書き換わらなかった設定がある: ${creation.notRenamed.slice(0, 20).join("、")}）`,
  );
} else if (noInvalid) {
  out.push("**失敗**（入力の誤りの設定が 0 件。エラーコードの比較が空振りしている）");
} else {
  out.push(allowed.length > 0 ? "**合格**（差分は意図した変更だけ）" : "**合格**（差分なし）");
}
console.log(out.join("\n"));
process.exit(failed ? 1 : 0);
