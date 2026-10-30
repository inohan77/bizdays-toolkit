/**
 * 前の版との設定の結果の比較（CI の result-compare ジョブ。decisions.md の 56 番）。
 *
 * 種（シード）で決まる設定の集まりと、過去の退行を書き留めた固定の設定を、前の版と今回の dist の両方に渡し、
 * カレンダー（直接・合成・スケジュールから）とスケジュールの結果を 1 日ずつ比べる。比べる項目は、営業日か（値）・
 * reason・name・shiftedFrom・設定の位置。診断は、前の版の結果（severity・code・path・relatedPath）がすべて
 * 今回の結果に含まれることを確かめる（RELEASING.md の互換性の約束の「診断の結果は増えるだけ」）。
 *
 * 設定の名前: 前の版が改名の前（0.30.0 より前）なら旧名だけ、そうでなければ新しい名前と旧名の両方で書く。
 * 改名の前の版と比べるときは、返す値の改名（reason の "regular" → "default"）と設定の位置のキーの改名をそろえてから比べる。
 *
 * 意図した差分は etc/result-changes.json に、設定の特徴（trait）・入った版・出典を書いて許す。
 * 許すのは、前の版がその変更より前（affectedSince 以上・introducedIn 未満）で、今回の版がその変更を含むときだけ。
 * 失敗にする条件: 許していない差分がある。
 *
 * 使い方: node scripts/result-compare.ts --base <dir> [--head .] [--base-label <label>] [--seed <n>] [--scale <n>] [--changes <file>]
 *   --base は前の版を展開したパッケージのディレクトリ（npm pack した tgz の package/）。--head は今回のリポジトリ（pnpm build 済み）。
 *   --scale は設定の数の倍率（既定 1）。--changes は意図した差分の一覧（既定は --head の etc/result-changes.json。
 *   公開済みの版どうしを比べて検査が働くかを確かめるときに、このリポジトリの一覧を渡す）
 * 終了コード: 0 合格、1 失敗、2 使い方・読み込みの誤り。結果は Markdown で標準出力に書く。
 */

import "./strict-warnings.ts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
const seed = Number(argValue("--seed") ?? "20261030");
const scale = Number(argValue("--scale") ?? "1");
const versionOf = (dir: string): string =>
  (JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")) as { version: string }).version;
const headVersion = versionOf(headDir);
const baseVersion = versionOf(baseDir);
const baseLabel = argValue("--base-label") ?? baseVersion;

/** "a.b.c" の版を比べる（プレリリースは使わない） */
const cmp = (a: string, b: string): number => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};
/** 改名（0.30.0）より前の版か */
const baseIsBeforeRename = cmp(baseVersion, "0.30.0") < 0;

// ------------------------------------------------------------
// 読み込み
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
// 乱数（種で決まる。decisions.md の 10 番: 依存を足さない）
// ------------------------------------------------------------

function random(start: number): () => number {
  let a = start >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Gen {
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

// ------------------------------------------------------------
// 設定を作る（新しい名前で作り、旧名で書くときは toOld で書き換える）
// ------------------------------------------------------------

/** 提供元の名前（読み込んだ版の提供元に置き換える前の形） */
type ProviderName = "jp" | "england" | "scotland" | "metropole" | "sg";
const PROVIDERS: readonly ProviderName[] = ["jp", "england", "scotland", "metropole", "sg"];
const TIME_ZONES: Record<ProviderName, string> = {
  jp: "Asia/Tokyo",
  england: "Europe/London",
  scotland: "Europe/London",
  metropole: "Europe/Paris",
  sg: "Asia/Singapore",
};
const YEARS: Record<ProviderName, readonly [number, number]> = {
  jp: [1955, 2099],
  england: [1974, 2099],
  scotland: [1974, 2099],
  metropole: [2000, 2099],
  sg: [2020, 2027],
};
const KINDS = ["national", "regular", "substitute", "citizens", "special"] as const;
const KEYS = [
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
] as const;

interface Case {
  readonly id: string;
  readonly kind: "calendar" | "schedule";
  readonly providers: readonly ProviderName[];
  /** 提供元は名前のまま。比べるときに読み込んだ版の提供元に置き換える */
  readonly options: Obj;
  readonly from: string;
  readonly to: string;
  /** 合成するときのもう 1 つのカレンダー */
  readonly partner?: Case;
  readonly combine?: "all" | "any";
}

const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/** 比べる期間: 提供元の対応年が重なる範囲の内側（隣の日を見る規則が対応年の端に触れない）を、最大 6 年 */
function rangeOf(providers: readonly ProviderName[]): [string, string] {
  let from = 2021;
  let to = 2026;
  for (const p of providers) {
    from = Math.max(from, YEARS[p][0] + 1);
    to = Math.min(to, YEARS[p][1] - 1);
  }
  return [iso(from, 1, 1), iso(to, 12, 31)];
}

function effective(g: Gen, rule: Obj): Obj {
  if (g.chance(0.15)) rule["effectiveFrom"] = iso(g.int(2021, 2024), g.int(1, 12), g.int(1, 28));
  if (g.chance(0.15)) rule["effectiveTo"] = iso(g.int(2024, 2026), g.int(1, 12), g.int(1, 28));
  if (
    typeof rule["effectiveFrom"] === "string" &&
    typeof rule["effectiveTo"] === "string" &&
    rule["effectiveFrom"] > rule["effectiveTo"]
  )
    delete rule["effectiveTo"];
  return rule;
}

function filters(g: Gen, rule: Obj): Obj {
  if (g.chance(0.6)) rule["kinds"] = g.some(KINDS, 2);
  if (g.chance(0.15)) rule["keys"] = g.some(KEYS, 3);
  if (g.chance(0.2)) rule["weekdays"] = g.some([0, 1, 2, 3, 4, 5, 6], 3);
  if (g.chance(0.15)) rule["months"] = g.some([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 4);
  return rule;
}

/** 繰り返しの規則 1 つ（新しい名前）。newShapes は改名と同時に入った形（週の第 n 営業日）を使うか */
function makeRule(g: Gen, newShapes: boolean, withHolidays: boolean): Obj {
  const shapes = ["weekday", "dayOfMonth", "businessDayOfMonth", "cycle"];
  if (withHolidays) shapes.push("holiday", "holiday", "dayAfterHoliday", "dayBeforeHoliday");
  if (newShapes) shapes.push("businessDayOfWeek");
  const shape = g.pick(shapes);
  const policy = (all: boolean): void => {
    if (g.chance(0.4))
      rule["holidayOverlapPolicy"] = g.pick(
        all
          ? ["under-holiday", "over-holiday", "after-holiday"]
          : ["under-holiday", "over-holiday"],
      );
    if (rule["holidayOverlapPolicy"] === "after-holiday" && g.chance(0.4))
      rule["skipWeekdays"] = g.some([0, 6, 3], 2);
  };
  const rule: Obj = {};
  switch (shape) {
    case "weekday":
      rule["weekday"] = g.int(0, 6);
      if (g.chance(0.4))
        rule["nth"] = g.chance(0.5) ? g.pick([1, 2, 3, 4, -1]) : g.some([1, 2, 3, 4, 5, -1], 2);
      else if (g.chance(0.25)) {
        rule["interval"] = 2;
        rule["anchor"] = iso(2024, 1, g.int(1, 14));
      }
      if (g.chance(0.2)) rule["months"] = g.some([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 4);
      policy(true);
      break;
    case "dayOfMonth":
      rule["dayOfMonth"] = g.chance(0.5)
        ? g.pick([1, 5, 10, 15, 20, 25, 31, -1])
        : g.some([1, 10, 20, 31, -1], 2);
      if (g.chance(0.2)) rule["months"] = g.some([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 4);
      policy(true);
      break;
    case "businessDayOfMonth":
      rule["businessDayOfMonth"] = g.chance(0.6)
        ? g.pick([1, 2, 3, 5, -1, -2])
        : g.some([1, 2, -1], 2);
      if (g.chance(0.2)) rule["months"] = g.some([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 4);
      policy(false);
      break;
    case "businessDayOfWeek":
      rule["businessDayOfWeek"] = g.chance(0.6) ? g.pick([1, 2, -1]) : g.some([1, 3, -1], 2);
      rule["weekStart"] = g.pick([0, 1]);
      policy(false);
      break;
    case "cycle":
      rule["cycle"] = g.pick([3, 4, 5, 10]);
      rule["anchor"] = iso(2024, g.int(1, 12), g.int(1, 28));
      rule["positions"] = g.some([1, 2, 3], 2);
      break;
    case "holiday":
      rule["holiday"] = true;
      filters(g, rule);
      break;
    default:
      rule[shape] = true;
      filters(g, rule);
      if (g.chance(0.3)) rule["skipWeekdays"] = g.some([0, 6], 2);
  }
  if (g.chance(0.3)) rule["name"] = `r${g.int(1, 9)}`;
  return effective(g, rule);
}

/** 祝日の規則を 1 つ、種別だけ変えて写す（覆う関係を作るため） */
function variant(g: Gen, rules: Obj[]): Obj | undefined {
  const holidayRules = rules.filter(
    (r) => r["holiday"] === true || r["dayAfterHoliday"] === true || r["dayBeforeHoliday"] === true,
  );
  if (holidayRules.length === 0) return undefined;
  const copy = { ...g.pick(holidayRules) };
  copy["kinds"] = g.some(KINDS, 2);
  return copy;
}

function rules(g: Gen, newShapes: boolean, withHolidays: boolean, max: number): Obj[] {
  const out: Obj[] = [];
  const n = g.int(1, max);
  for (let i = 0; i < n; i++) {
    const v = withHolidays && g.chance(0.25) ? variant(g, out) : undefined;
    out.push(v ?? makeRule(g, newShapes, withHolidays));
  }
  return out;
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

function calendarCase(g: Gen, id: string, newShapes: boolean): Case {
  const providers = providersOf(g);
  const options = sourceOptions(g, providers);
  const withHolidays = providers.length > 0;
  options["holidayPolicy"] = g.pick(["closed", "open", "ignore"]);
  if (g.chance(0.6)) options["closedWeekdays"] = g.some([0, 6, 3], 2);
  if (g.chance(0.8)) options["closedRecurringRules"] = rules(g, newShapes, withHolidays, 4);
  if (g.chance(0.3)) options["openRecurringRules"] = rules(g, newShapes, withHolidays, 2);
  if (g.chance(0.25))
    options["closedAnnualDates"] = [
      g.pick(["12-31", "01-02", "08-13", { from: "12-29", to: "01-03" }]),
    ];
  if (g.chance(0.2)) options["closedDates"] = [iso(g.int(2021, 2026), g.int(1, 12), g.int(1, 28))];
  if (g.chance(0.2)) options["openDates"] = [iso(g.int(2021, 2026), g.int(1, 12), g.int(1, 28))];
  const [from, to] = rangeOf(providers);
  return { id, kind: "calendar", providers, options, from, to };
}

function scheduleCase(g: Gen, id: string, newShapes: boolean): Case {
  const providers = providersOf(g);
  const options = sourceOptions(g, providers);
  const values = ["A", "B", "C", "closed"];
  options["weekdayValues"] = Array.from({ length: 7 }, (_, i) =>
    i === 0 || i === 6 ? "closed" : g.pick(values),
  );
  options["holidayPolicy"] = g.pick<unknown>(["ignore", { sameAs: 0 }, { value: "H" }]);
  if (g.chance(0.85))
    options["recurringRules"] = rules(g, newShapes, providers.length > 0, 4).map((r) => ({
      ...r,
      value: g.pick(values),
    }));
  if (g.chance(0.25)) options["annualDates"] = [{ date: "12-31", value: "closed" }];
  if (g.chance(0.2))
    options["dates"] = [{ date: iso(g.int(2021, 2026), g.int(1, 12), g.int(1, 28)), value: "X" }];
  const [from, to] = rangeOf(providers);
  return { id, kind: "schedule", providers, options, from, to };
}

/**
 * 過去の退行を書き留めた固定の設定（乱数では当たりにくい形）。新しい退行を見つけたら、その最小の設定を足す
 * （直した版を出した後も残す。同じ退行が戻ったら止めるため）
 */
function fixedCases(): Case[] {
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
  return [
    // 和集合の旧名 "national" は、日本の提供元の毎年の祝日だけに当たる（ほかの提供元の "regular" には当たらない）
    cal("fixed-union-national", ["jp", "england"], {
      holidayPolicy: "open",
      closedRecurringRules: [holiday(["national"])],
    }),
    // 日本を含む和集合の "regular" は、日本の国民の祝日にも当たる（改名で意味が広がった。etc/result-changes.json で許す）
    cal("fixed-union-regular", ["jp", "england"], {
      holidayPolicy: "open",
      closedRecurringRules: [holiday(["regular"])],
    }),
    // 日本の提供元だけの設定の "regular" と旧名の "national" の同じ規則は、後の規則が shadowed になる
    cal("fixed-jp-regular-national", ["jp"], {
      closedRecurringRules: [holiday(["regular"]), holiday(["national"])],
    }),
    cal("fixed-jp-national-regular", ["jp"], {
      closedRecurringRules: [holiday(["national"]), holiday(["regular"])],
    }),
  ];
}

// ------------------------------------------------------------
// 旧名で書く・結果の名前をそろえる
// ------------------------------------------------------------

interface Renamed {
  readonly place: string;
  readonly from: string;
  readonly to: string;
}
/** 改名の表（今回の dist の内部の表。改名の前の版と比べるときだけ使う） */
let renamedKeys: readonly Renamed[] = [];

const renameObject = (places: readonly string[], value: Obj, toOld: boolean): Obj => {
  const out: Obj = {};
  for (const [k, v] of Object.entries(value)) {
    const r = renamedKeys.find((x) => places.includes(x.place) && (toOld ? x.to : x.from) === k);
    out[r ? (toOld ? r.from : r.to) : k] = v;
  }
  return out;
};

/** 新しい名前の設定を旧名で書く（値の改名: スケジュールの holidayPolicy の "ignore" → "weekday"） */
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

/** 設定の位置（"closedRecurring[0].kinds[0]" など）の旧名のキーを新しい名前にそろえる */
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
// 比べる
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

/** 改名したエラーコード（改名の前の版と比べるときにそろえる） */
const RENAMED_CODES: Readonly<Record<string, string>> = {
  "invalid-month-day": "invalid-annual-date",
};
const errorCode = (error: unknown): string => {
  const code = String((error as { code?: unknown } | null)?.code ?? "error");
  return `throws ${RENAMED_CODES[code] ?? code}`;
};

/**
 * 1 日の結果を比べる形にそろえる。改名の前の版の reason "regular" は、改名の後の語にそろえる
 * （createCalendarFromSchedule のカレンダーは "open-weekday"、それ以外は "default"。docs/migration.md の 0.30.0 の「返す値」）
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
}

/** 設定の特徴（意図した差分を許す単位） */
function traitsOf(c: Case): string[] {
  const traits = new Set<string>();
  for (const one of [c, c.partner]) {
    if (one === undefined) continue;
    const hasJp = one.providers.includes("jp");
    const jpOnly = hasJp && one.providers.every((p) => p === "jp");
    for (const key of ["closedRecurringRules", "openRecurringRules", "recurringRules"]) {
      const list = one.options[key];
      if (!Array.isArray(list)) continue;
      for (const r of list as Obj[]) {
        const kinds = Array.isArray(r["kinds"]) ? (r["kinds"] as string[]) : [];
        if (hasJp && kinds.includes("regular")) traits.add("kinds-regular-with-jp");
        if (jpOnly && kinds.includes("national")) traits.add("kinds-national-with-jp-only");
      }
    }
  }
  return [...traits];
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

function runCase(c: Case, base: Lib, head: Lib, naming: "new" | "old", diag: boolean): Diff[] {
  const diffs: Diff[] = [];
  const traits = traitsOf(c);
  const written = naming === "old" ? toOld(c) : c.options;
  const opts = (lib: Lib): Obj =>
    naming === "old" ? withProvidersOld(lib, written) : withProviders(lib, written);
  const meta = (target: string): Omit<Diff, "detail"> => ({ id: c.id, naming, target, traits });
  if (c.kind === "calendar") {
    const b = build(() => base.createCalendar(opts(base)));
    const h = build(() => head.createCalendar(opts(head)));
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
      if (missing.length > 0)
        diffs.push({ ...meta("diagnose"), detail: `前の版の結果がない: ${missing.join(" ")}` });
    }
  }
  return diffs;
}

// ------------------------------------------------------------
// 意図した差分
// ------------------------------------------------------------

interface KnownChange {
  readonly trait: string;
  readonly targets: readonly string[];
  readonly affectedSince?: string;
  readonly introducedIn: string;
  readonly source: string;
  readonly summary: string;
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

/** その差分を許すか: 前の版が変更の前で、今回の版が変更を含み、設定がその特徴を持ち、比べた対象が合う */
const allowedBy = (known: readonly KnownChange[], d: Diff): KnownChange | undefined =>
  known.find(
    (k) =>
      d.traits.includes(k.trait) &&
      k.targets.includes(d.target) &&
      cmp(baseVersion, k.introducedIn) < 0 &&
      (k.affectedSince === undefined || cmp(baseVersion, k.affectedSince) >= 0) &&
      cmp(headVersion, k.introducedIn) >= 0,
  );

// ------------------------------------------------------------
// 実行
// ------------------------------------------------------------

let base: Lib;
let head: Lib;
let known: KnownChange[];
try {
  base = await load(baseDir);
  head = await load(headDir);
  known = knownChanges();
  if (baseIsBeforeRename) {
    const table = (await import(pathToFileURL(resolve(headDir, "dist/core/renamed.js")).href)) as {
      RENAMED_KEYS?: readonly Renamed[];
    };
    if (!table.RENAMED_KEYS) throw new Error("dist/core/renamed.js has no RENAMED_KEYS");
    renamedKeys = table.RENAMED_KEYS;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const g = new Gen(seed);
const newShapes = !baseIsBeforeRename;
const counts = { calendars: Math.round(240 * scale), schedules: Math.round(100 * scale) };
const cases: Case[] = [...fixedCases()];
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
for (let i = 0; i < counts.schedules; i++) cases.push(scheduleCase(g, `schedule-${i}`, newShapes));
/** 診断は時間がかかるので、固定の設定と、設定 4 件に 1 件だけ */
const diagnosed = (c: Case, i: number): boolean => c.id.startsWith("fixed-") || i % 4 === 0;

const namings: ("new" | "old")[] = baseIsBeforeRename ? ["old"] : ["new", "old"];
const diffs: Diff[] = [];
let diagnosedCount = 0;
cases.forEach((c, i) => {
  const diag = diagnosed(c, i);
  if (diag) diagnosedCount++;
  for (const naming of namings) diffs.push(...runCase(c, base, head, naming, diag));
});

const unexpected = diffs.filter((d) => allowedBy(known, d) === undefined);
const allowed = diffs.filter((d) => allowedBy(known, d) !== undefined);

const out: string[] = [];
out.push(`## 設定の結果の差分（${baseLabel} → ${headVersion}）`, "");
out.push(
  `設定 ${cases.length} 件（カレンダー ${cases.filter((c) => c.kind === "calendar").length}・スケジュール ${cases.filter((c) => c.kind === "schedule").length}。` +
    `診断 ${diagnosedCount} 件）、名前: ${namings.join("・")}、種 ${seed}`,
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
  for (const [k, n] of byChange)
    out.push(`- ${k.trait}（${k.introducedIn}）: ${n} 件 — ${k.summary}（${k.source}）`);
  out.push("");
}
if (unexpected.length > 0) {
  out.push(
    `許していない差分（${unexpected.length} 件${unexpected.length > LIMIT ? `。先頭の ${LIMIT} 件` : ""}）:`,
    "",
    "```text",
    ...unexpected.slice(0, LIMIT).map(describe),
    "```",
    "",
    "**失敗**（意図した変更なら、etc/result-changes.json に特徴・版・出典を書く）",
  );
} else {
  out.push(allowed.length > 0 ? "**合格**（差分は意図した変更だけ）" : "**合格**（差分なし）");
}
console.log(out.join("\n"));
process.exit(unexpected.length > 0 ? 1 : 0);
