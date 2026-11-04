/**
 * 前の版との設定の結果の比較（CI の result-compare ジョブ。decisions.md の 37 番）。
 *
 * 種（シード）で決まる設定の集まりと、過去の退行を書き留めた固定の設定を、前の版と今回の dist の両方に渡し、
 * カレンダー（直接・合成・スケジュールから）とスケジュールの結果を 1 日ずつ比べる。比べる項目は、営業日か（値）・
 * reason・name・shiftedFrom・設定の位置。診断は、前の版の結果（severity・code・path・relatedPath）がすべて
 * 今回の結果に含まれることを確かめる（RELEASING.md の「互換性の約束」の診断の項。誤った診断を直して消えた結果は、etc/result-changes.json で許す）。
 *
 * 設定の名前: 前の版が改名の前（0.30.0 より前）なら旧名だけ、そうでなければ新しい名前と旧名の両方で書く。
 * 改名の前の版と比べるときは、返す値の改名（reason の "regular" → "default"）と設定の位置のキーの改名をそろえてから比べる。
 *
 * 意図した差分は etc/result-changes.json に、設定の特徴（trait）・入った版・出典を書いて許す。診断の差分は、消えた結果のコード
 * （removedCodes）でも絞れる。
 * 許すのは、前の版がその変更より前（affectedSince 以上・introducedIn 未満）で、今回の版がその変更を含むときだけ。
 * 失敗にする条件: 許していない差分がある。今回の版で、意図せず作成に失敗した設定がある（生成器が意図して混ぜた入力の誤り
 * （test/support/catalog.ts の印を付けた規則を含む設定）は数えて Job Summary に出し（0 件なら空振りとして失敗）、それ以外の作成の失敗は、結果を比べられていないので失敗にする。
 * 名前の書き方（新しい名前・旧名）ごとに数え、前の版でも失敗した設定の数も出す。前の版と誤りが同じなら差分にならないので、
 * 数えなければ黙って空振りになるため）。旧名の回で、新しい名前で書ける項目があるのに旧名に書き換わらなかった設定がある。
 *
 * 使い方: node scripts/result-compare.ts --base <dir> [--head .] [--base-label <label>] [--seed <n>] [--scale <n>] [--changes <file>]
 *   --base は前の版を展開したパッケージのディレクトリ（npm pack した tgz の package/）。--head は今回のリポジトリ（pnpm build 済み）。
 *   --scale は設定の数の倍率（既定 1）。--changes は意図した差分の一覧（既定は --head の etc/result-changes.json。
 *   公開済みの版どうしを比べて検査が働くかを確かめるときに、このリポジトリの一覧を渡す）
 * 終了コード: 0 = 合格、1 = 許していない差分・意図せず作成に失敗した設定、2 = 引数・読み込みの誤り・予期しない例外
 * （設定ごとの比較の外で投げたもの。比較が終わっていないので、差分の有無は分からない）。結果は Markdown で標準出力に書く。
 */

// 最初の import: 予期しない例外を終了コード 2 にする（ほかの import の評価の途中で投げた例外も受けるため、ほかより先に読み込む）
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
/** 数の引数（数でない値や範囲の外の値は、比べる設定が 0 件になって黙って合格しないよう使い方の誤りにする） */
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
  /** 診断の差分で、前の版にあって今回の版にない結果のコード */
  readonly removedCodes?: readonly string[];
}

/**
 * 比べた対象の特徴（意図した差分を許す単位）。合成は組のカレンダーの両方の設定、ほかはその設定だけから付ける
 * （相手のカレンダーの特徴で、単独の結果の差分を許さないため）
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

/** 意図した入力の誤り（生成器が印を付けた規則。test/support/catalog.ts の isIntendedInvalid）を含む設定か */
const intendedInvalid = (c: Case): boolean =>
  ["closedRecurringRules", "openRecurringRules", "recurringRules"].some(
    (k) => Array.isArray(c.options[k]) && (c.options[k] as unknown[]).some(isIntendedInvalid),
  );

/**
 * 作成の結果の集計（今回の版で、意図した入力の誤りの設定・意図せず作成に失敗した設定）。bothFailed は、意図せず作成に失敗した
 * 設定のうち、前の版でも作成に失敗したもの（誤りが同じなら差分にならず、結果を何も比べていない空振り）。notRenamed は、旧名の回で
 * 旧名に書き換わらなかった設定（新しい名前で書ける項目があるのに、書き換えた設定が新しい名前の設定と同じ）
 */
const creation = {
  intended: 0,
  unintended: [] as string[],
  bothFailed: 0,
  notRenamed: [] as string[],
};

/**
 * 作成の結果を数える。意図した入力の誤りは、名前の書き方のうち最初の 1 つだけで数える（同じ設定を 2 回数えないため）。
 * 意図せず作成に失敗した設定は、名前の書き方ごとに数える（旧名の回だけで失敗する設定も見つけるため）
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

/** 新しい名前で書ける項目（旧名の表にある名前）を持つ設定か（旧名の回で、書き換わったことを確かめる対象） */
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
      // 合成の相手も、本体の設定と同じに数える（前の版の結果を渡し、旧名の回で旧名に書き換わったかも確かめる）
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
      // 増えた結果は約束の範囲内（失敗にしない）。CHANGELOG に書くべき変化に気付くため、一覧に出す。旧名の設定の比較では、
      // deprecated-option は旧名で書いたことを知らせるだけ（改名の前の版にはない）なので数えない。新しい名前の設定で
      // deprecated-option が増えたら、利用者に見える変化なので数える
      const added = [...hk].filter(
        (k) =>
          !bk.has(k) &&
          !(naming === "old" && (JSON.parse(k) as unknown[])[1] === "deprecated-option"),
      );
      if (added.length > 0) increases.push(`${c.id} [${naming}]: ${added.join(" ")}`);
      if (missing.length > 0) {
        diffs.push({
          ...meta("diagnose"),
          detail: `前の版の結果がない: ${missing.join(" ")}`,
          removedCodes: missing.map((k) => String((JSON.parse(k) as unknown[])[1])),
        });
      }
    }
  }
  return diffs;
}

/** 診断の結果が増えた設定（前の版になかった結果。約束の範囲内なので失敗にしない） */
const increases: string[] = [];

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
  /** 診断の差分を、前の版の結果が消えたもので、消えた結果のコードがすべてこの中にあるものだけに絞る */
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

/** その差分を許すか: 前の版が変更の前で、今回の版が変更を含み、設定がその特徴を持ち、比べた対象が合う */
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
// 実行
// ------------------------------------------------------------

let base: Lib;
let head: Lib;
let known: KnownChange[];
try {
  base = await load(baseDir);
  head = await load(headDir);
  known = knownChanges();
  // 旧名の回（どの比較にもある）で設定を旧名に書き換えるので、旧名の表はいつも読み込む（0.30.7 までは、改名の前の版との
  // 比較でだけ読み込んでいたので、latest との比較の旧名の回は旧名に書き換わっていなかった）
  const table = (await import(pathToFileURL(resolve(headDir, "dist/core/renamed.js")).href)) as {
    RENAMED_KEYS?: readonly Renamed[];
  };
  // 空の表は読み込みの誤りとする（空だと旧名の回が旧名に書き換わらず、「旧名に書き換わらなかった設定」の検査も表を使うので
  // 何も見つけない。0.30.7 で直した穴そのものを、この検査が止められるように）
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
 * 診断は時間がかかるので、固定の設定と、種で作った設定の 4 件に 1 件だけ。種で作った設定は、その中の番号を 4 で割った余り
 * （DIAGNOSED_REMAINDER）で選ぶ。固定の設定を足しても、診断する種で作った設定が変わらないようにするため。余りは、固定の設定の
 * 数で選んでいた 0.30.6 までと同じ設定になるように、改名の前の版との比較とそれ以外で分ける（生成範囲の記録を保つため）
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
// 生成器は誤りを混ぜる文脈で作るので、入力の誤りの設定が 0 件なら、エラーコードの比較を黙って見なくなっている
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
  `入力の誤りの設定: ${creation.intended} 件（エラーコードを比較）。意図せず作成に失敗した設定: ${creation.unintended.length} 件（名前の書き方ごと。うち前の版でも失敗した設定 ${creation.bothFailed} 件）。旧名に書き換わらなかった設定: ${creation.notRenamed.length} 件`,
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
  for (const [k, n] of byChange)
    out.push(`- ${k.trait}（${k.introducedIn}）: ${n} 件 — ${k.summary}（${k.source}）`);
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
    "**失敗**（意図した変更なら、etc/result-changes.json に特徴・版・出典を書く）",
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
