// 設定から「特徴」の文字列の集合を取り出す（生成範囲の包含の検査。test/tools/generator-features.test.ts）。
// 特徴は、生成器が作った設定の形を区別する細かさで付ける: 規則の形・キー・値の要素・配列の長さ・日付の年代・有効期間の年・
// 入力の誤りの種類。旧名で書いた設定は新しい名前にそろえてから付ける（値の旧名 "national" などはそのまま残す）。

import { RENAMED_KEYS } from "../../src/core/renamed.ts";

type Obj = Record<string, unknown>;

/** 規則の形（判別のキー → 公開の型の名前）。目録の SHAPES と同じ対応（test/tools/catalog.test.ts が突き合わせる） */
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

/** 提供元の名前（result-compare の設定は提供元を名前で持つ） → ID */
export const PROVIDER_IDS: Readonly<Record<string, string>> = {
  jp: "JP",
  england: "GB-ENG",
  scotland: "GB-SCT",
  metropole: "FR",
  sg: "SG",
};

/** 提供元の名前 → 対応年（result-compare の設定は提供元を名前で持つ） */
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
/** 値の要素ごとに特徴を付ける規則のキー（ほかのキーは「ある」ことだけ） */
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
/** 配列の長さ（4 以上はまとめる） */
const size = (n: number): string => (n >= 4 ? "4+" : String(n));
const year = (d: unknown): string | undefined =>
  typeof d === "string" && /^\d{4}-/.test(d) ? d.slice(0, 4) : undefined;
const decade = (d: unknown): string | undefined => {
  const y = year(d);
  return y === undefined ? undefined : `${y.slice(0, 3)}0`;
};
const weekdayOf = (d: string): number => new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay();

/** 旧名のキーを新しい名前にする（places はその置き場所の改名） */
function renameKeys(value: Obj, places: readonly string[]): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(value)) {
    const r = RENAMED_KEYS.find((x) => places.includes(x.place) && x.from === k);
    out[r ? r.to : k] = v;
  }
  return out;
}

/** 設定の旧名を新しい名前にそろえる（kind はスケジュールかカレンダーか。値の旧名 "weekday" も読み替える） */
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

/** 設定の提供元の ID（和集合は + でつなぐ。提供元がなければ "none"） */
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
 * 診断の走査の基準の範囲（"YYYY-MM-DD" の両端）。有効期間で広げる前の範囲で、src/core/diagnose.ts の scanWindow と同じ決め方:
 * 提供元があれば対応年（outOfRangePolicy が "ignore" なら和、ほかは共通部分。200 年を超えれば 1900〜2099 年に絞る）、
 * なければ 2001 年から、28 年と規則の周期（interval・cycle）の最小公倍数（上限 200 年）。docs/decisions.md の 31 番
 */
export function diagnoseRangeOf(options: Obj): { from: string; to: string } | undefined {
  const p = options["holidayProvider"] ?? options["holidays"];
  const list = p === undefined ? [] : Array.isArray(p) ? p : [p];
  if (list.length === 0) {
    const max = 366 * 200;
    let days = 7;
    for (const k of RULE_LISTS)
      for (const r of Array.isArray(options[k]) ? (options[k] as unknown[]) : [])
        if (isObj(r)) {
          if (typeof r["interval"] === "number") days = Math.min(lcm(days, 7 * r["interval"]), max);
          if (typeof r["cycle"] === "number") days = Math.min(lcm(days, r["cycle"]), max);
        }
    const from = dayNumber("2001-01-01");
    const span = Math.min(lcm(dayNumber("2028-12-31") - from + 1, days), max);
    return { from: "2001-01-01", to: new Date((from + span - 1) * DAY).toISOString().slice(0, 10) };
  }
  const years = list.map((x): readonly [number, number] => {
    if (typeof x === "string") return PROVIDER_YEARS[x] ?? [0, -1];
    const y = isObj(x)
      ? (x["supportedYears"] as { from: number; to: number } | undefined)
      : undefined;
    return y ? [y.from, y.to] : [0, -1];
  });
  const ignore = (options["outOfRangePolicy"] ?? options["outOfRange"]) === "ignore";
  let from = ignore ? Math.min(...years.map((y) => y[0])) : Math.max(...years.map((y) => y[0]));
  let to = ignore ? Math.max(...years.map((y) => y[1])) : Math.min(...years.map((y) => y[1]));
  if (from > to) return undefined;
  // 200 年を超える範囲は 1900〜2099 年に絞り、重ならなければ先頭の 200 年にする（src/core/diagnose.ts の clipYears）
  if (to - from + 1 > 200) {
    const a = Math.max(from, 1900);
    const b = Math.min(to, 2099);
    [from, to] = a <= b ? [a, b] : [from, from + 199];
  }
  return { from: `${from}-01-01`, to: `${to}-12-31` };
}

function addValues(out: Set<string>, prefix: string, value: unknown): void {
  if (Array.isArray(value)) {
    out.add(`${prefix}.size=${size(value.length)}`);
    for (const v of value) out.add(`${prefix}=${String(v)}`);
  } else out.add(`${prefix}=${String(value)}`);
}

/** 繰り返しの規則 1 つの特徴 */
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
  // 有効期間（年・形・年をまたぐか）
  const from = year(rule["effectiveFrom"]);
  const to = year(rule["effectiveTo"]);
  if (from !== undefined) out.add(`effectiveFrom.year=${from}`);
  if (to !== undefined) out.add(`effectiveTo.year=${to}`);
  if (from !== undefined || to !== undefined)
    out.add(
      `effectivePeriod=${from !== undefined && to !== undefined ? "both" : from !== undefined ? "from-only" : "to-only"}`,
    );
  if (from !== undefined && to !== undefined && from !== to) out.add("effectivePeriod=spans-years");
  // 診断の走査の範囲との関係（範囲の端をまたぐ・範囲の外に丸ごとある）
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
  // 周期の最後の日（positions に cycle を含む）
  if (
    typeof rule["cycle"] === "number" &&
    Array.isArray(rule["positions"]) &&
    (rule["positions"] as unknown[]).includes(rule["cycle"])
  )
    out.add("CyclePattern.positions=last");
  // 入力の誤り（作成が invalid-option になる設定。前の版とエラーコードをそろえる比較に使う）
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

/** 毎年の月日 1 つの特徴 */
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

/** 個別の日付 1 つの特徴 */
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
 * 設定の特徴。kind はスケジュールかカレンダーか（旧名の読み替えに使う）
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
 * 問い合わせた日付の範囲の特徴（提供元ごとに、範囲が覆う年代・数十年にわたるか・診断の走査の範囲の外を含むか）。
 * from・to は "YYYY-MM-DD"、range は diagnoseRangeOf の結果
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
