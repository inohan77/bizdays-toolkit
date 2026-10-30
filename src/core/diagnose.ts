/**
 * 規則の診断（diagnoseCalendar・diagnoseSchedule）。
 *
 * 設定を作るときと同じ検証（IssueCollector）で誤りと知らないキーを集め、誤りがなければ
 * 規則どうしの関係を調べる。例外は投げず、見つけた問題を配列で返す。
 *
 * - error   … createCalendar・createSchedule で例外になる誤り（code は例外と同じ）
 * - warning … 作れるが、意図と違う可能性が高いもの
 *     unknown-option … 知らないキー（作成時は無視される）。近い既知のキーがあれば message に候補を挙げる
 *     shadowed       … 同じ種類の先の規則に完全に覆われ、決して使われない（relatedPath に先の規則）
 *     never-matches  … 当てはまる日がない繰り返しの規則（2 月 30 日、有効期間の中に第 5 水曜日がない、提供元のない設定の祝日の翌日・祝前日、など）
 *     out-of-range   … 個別の日付、または規則の有効期間が祝日の提供元の対応年の外にある（relatedPath に提供元）
 *     no-business-day … 営業日が 1 日もない設定（営業日カレンダーのみ）
 * - info    … redundant: 取り除いても結果が変わらない規則・設定（判定に祝日を使わない設定の unconfirmedHolidayPolicy: "throw" を含む）
 *             expired: 第 2 引数の asOf より前に終わった規則・日付（asOf を渡したときだけ）
 *             counting-basis: 第 n 営業日の規則（businessDayOfMonth）の数える基準は繰り返しの規則を除くので、
 *                             同じ設定の毎週の曜日の規則（{ weekday }）の曜日は営業日として数えられる（relatedPath にその規則）
 *
 * 未確定の祝日の扱い（unconfirmedHolidayPolicy）は診断では常に "accept" で評価する。診断は設定の形を調べるもので、
 * 祝日が確定しているかどうかは関係がなく、"throw" のまま評価すると例外を握りつぶして「当てはまらない」と誤判定するため
 *
 * 判定の順番（個別の日付 → 毎年の月日 → 繰り返し（over）→ 祝日 → 繰り返し（under・振替先）→ 曜日）は
 * 固定なので、shadowed は同じ種類の規則どうしに限って調べる。種類をまたいで使われない規則は
 * redundant（取り除いても結果が変わらない）として見つかる。
 * 有効期間（effectiveFrom・effectiveTo）のある規則は期間の包含も、周期（interval・cycle）のある規則は周期の包含も
 * shadowed の条件にする。redundant の走査の範囲は、周期がそろう長さと、範囲の外にある有効期間まで広げる
 */

import {
  lengthOfMonth,
  fromDayNumber,
  isValidDate,
  parseDate,
  toDayNumber,
  type DateString,
} from "./date.ts";
import { compileCalendarOptions, type CalendarOptions } from "./calendar.ts";
import { IssueCollector, rangeError, type KnownErrorCode } from "./errors.ts";
import { RENAMED_KEYS, RENAMED_VALUES } from "./renamed.ts";
import {
  compileScheduleOptions,
  createBasis,
  createHolidayLookup,
  createResolver,
  inPeriod,
  jpUsage,
  matchMonthDay,
  matchPattern,
  type AnnualRule,
  type CompiledPeriod,
  type CompiledSchedule,
  type DecidingRule,
  type HolidaySource,
  type RecurringRuleCompiled,
  type ScheduleOptions,
} from "./schedule.ts";
import type { Holiday } from "./types.ts";

// ------------------------------------------------------------
// 公開する型
// ------------------------------------------------------------

/**
 * 診断の重さ。
 * - "error": 作成すると例外になる誤り
 * - "warning": 作れるが、意図と違う可能性が高い
 * - "info": 結果には影響しないが、整理できる
 *
 * 出力の列挙だが、重さの段階は増やさないため閉じた型にしている（docs/decisions.md の 15）。
 * @public
 */
export type DiagnosticSeverity = "error" | "warning" | "info";

/**
 * 既知の診断コード（増えることがある）。error の code は例外の code（KnownErrorCode）と同じ。
 * @public
 */
export type KnownDiagnosticCode =
  | KnownErrorCode
  /** 知らないキー（作成時は無視される） */
  | "unknown-option"
  /** 0.30.0 で改名した旧名のキー・値（新しい名前と同じに扱う。1.0.0 で invalid-option になる） */
  | "deprecated-option"
  /** 同じ種類の先の規則に完全に覆われ、決して使われない */
  | "shadowed"
  /** 当てはまる日がない繰り返しの規則 */
  | "never-matches"
  /** 取り除いても結果が変わらない */
  | "redundant"
  /** 基準日（asOf）より前に終わった規則・日付（整理の候補） */
  | "expired"
  /** 第 n 営業日の規則の数える基準に、同じ設定の曜日の規則が入らない（その曜日を営業日として数える） */
  | "counting-basis";

/**
 * 診断コード。将来の版で値が増えることがあるので、分岐では「その他」も扱うこと。
 * @public
 */
export type DiagnosticCode = KnownDiagnosticCode | (string & {});

/**
 * 診断の結果 1 件。message は英語で、文言は API に含まない（判定には code を使う）。
 * @public
 */
export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: DiagnosticCode;
  /** 設定の中の位置（例: "closedRecurringRules[1]"・"closedDates[0].date"）。設定全体なら "" */
  readonly path: string;
  readonly message: string;
  /** 関係する別の位置（shadowed では覆っている先の規則、out-of-range では祝日の提供元） */
  readonly relatedPath?: string;
}

// ------------------------------------------------------------
// 知らないキーの候補
// ------------------------------------------------------------

/** 2 つの文字列の編集距離（挿入・削除・置換・隣り合う 2 文字の入れ替えを 1 と数える） */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * 知らないキーに近い既知のキーを返す（なければ undefined）。
 * 大文字・小文字の違い、打ち間違い（編集距離が短いキーで 1・長いキーで 2〜3）、
 * 既知のキーの先頭部分（4 文字以上）の順に探す
 */
function closestKey(key: string, known: readonly string[]): string | undefined {
  // 改名した旧名（0.30.0）に近い打ち間違いは、旧名の新しい名前を候補に挙げる
  const renamed = RENAMED_KEYS.filter((r) => known.includes(r.to));
  const found = closestOf(key, [...known, ...renamed.map((r) => r.from)]);
  return renamed.find((r) => r.from === found && !known.includes(found))?.to ?? found;
}

function closestOf(key: string, known: readonly string[]): string | undefined {
  const lower = key.toLowerCase();
  const sameCase = known.find((k) => k.toLowerCase() === lower);
  if (sameCase !== undefined) return sameCase;
  // 既知のキーの先頭部分は、短い別のキーとの編集距離より優先する
  if (key.length >= 4) {
    const prefixOf = known.find((k) => k.toLowerCase().startsWith(lower));
    if (prefixOf !== undefined) return prefixOf;
  }
  const limit = Math.max(1, Math.floor(key.length / 4));
  let best: string | undefined;
  let bestDistance = limit + 1;
  for (const k of known) {
    const distance = editDistance(lower, k.toLowerCase());
    if (distance < bestDistance) {
      best = k;
      bestDistance = distance;
    }
  }
  return best;
}

// ------------------------------------------------------------
// 調べる期間
// ------------------------------------------------------------

/**
 * 繰り返しの規則の当てはまり方は、年の種類（1 月 1 日の曜日 × うるう年か）の 14 通りで決まり、28 年でそろう。
 * 周期（interval・cycle）のある規則は、28 年（10,227 日）が周期の倍数とは限らないので、別に周期を求める（patternCycle）
 */
const PATTERN_FROM = toDayNumber("2001-01-01");
const PATTERN_DAYS = toDayNumber("2028-12-31") - PATTERN_FROM + 1;

/** 祝日の提供元があるときに調べる年の上限（長すぎる対応年は 1900〜2099 年に絞る）。周期・有効期間で広げる長さの上限でもある */
const MAX_WINDOW_YEARS = 200;
/** 個別の日付の期間で、取り除いた結果と比べる最大日数 */
const MAX_DATE_RULE_DAYS = 366 * MAX_WINDOW_YEARS;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/**
 * 繰り返しの規則の当てはまり方がそろう日数（最大 MAX_WINDOW_YEARS 年）。
 * 周期 k 週の規則は 28 年と 7k 日の、周期 n 日の規則は 28 年と n 日の最小公倍数でそろう（隔週なら 56 年）
 */
function patternCycle(rules: readonly RecurringRuleCompiled<unknown>[]): number {
  const max = 366 * MAX_WINDOW_YEARS;
  let days = 7;
  for (const rule of rules) {
    if (rule.interval !== null) days = Math.min(lcm(days, 7 * rule.interval), max);
    if (rule.cycle !== null) days = Math.min(lcm(days, rule.cycle), max);
  }
  return Math.min(lcm(PATTERN_DAYS, days), max);
}

interface Range {
  readonly from: number;
  readonly to: number;
}

interface Window {
  readonly ranges: readonly Range[];
  readonly label: string;
}

/** 長すぎる年の範囲を 1900〜2099 年（重ならなければ先頭の 200 年）に絞る */
function clipYears(from: number, to: number): [number, number] {
  if (to - from + 1 <= MAX_WINDOW_YEARS) return [from, to];
  const a = Math.max(from, 1900);
  const b = Math.min(to, 2099);
  return a <= b ? [a, b] : [from, from + MAX_WINDOW_YEARS - 1];
}

const dayOfYear = (year: number, last: boolean): number =>
  toDayNumber(`${String(year).padStart(4, "0")}-${last ? "12-31" : "01-01"}`);

/**
 * 毎年の月日・繰り返しの規則を調べる期間。祝日が年ごとに変わるので、提供元の対応年を使う。
 * 提供元がなければ、繰り返しの規則がそろう周期（2001 年から 28 年、周期のある規則があれば長く）。
 * 規則の有効期間が基準の範囲の外にあれば、その期間（期限のない側は周期の長さ）も加える
 * （対応年の外で例外になる設定では加えない）
 */
function scanWindow(
  source: HolidaySource<string>,
  rules: readonly (CompiledPeriod & { readonly path: string })[],
  cycle: number,
): Window | undefined {
  const ranges: Range[] = [];
  let extend = true;
  if (source.providers.length === 0) {
    ranges.push({ from: PATTERN_FROM, to: PATTERN_FROM + cycle - 1 });
  } else {
    const years = source.providers.map((p) => p.supportedYears);
    let from: number;
    let to: number;
    if (source.outOfRangePolicy === "ignore") {
      from = Math.min(...years.map((r) => r.from));
      to = Math.max(...years.map((r) => r.to));
    } else {
      from = Math.max(...years.map((r) => r.from));
      to = Math.min(...years.map((r) => r.to));
      extend = false;
    }
    if (from > to) return undefined;
    [from, to] = clipYears(from, to);
    ranges.push({ from: dayOfYear(from, false), to: dayOfYear(to, true) });
  }
  if (extend) {
    for (const rule of rules) {
      if (rule.effectiveFrom === null && rule.effectiveTo === null) continue;
      const from = rule.effectiveFrom ?? rule.effectiveTo! - cycle + 1;
      const to = Math.min(rule.effectiveTo ?? from + cycle - 1, from + 366 * MAX_WINDOW_YEARS - 1);
      ranges.push({ from, to });
    }
  }
  ranges.sort((a, b) => a.from - b.from);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to + 1)
      merged[merged.length - 1] = { from: last.from, to: Math.max(last.to, r.to) };
    else merged.push(r);
  }
  const yearOf = (n: number): number => parseDate(fromDayNumber(n)).year;
  const label = merged.map((r) => `${yearOf(r.from)}-${yearOf(r.to)}`).join(", ");
  return { ranges: merged, label };
}

/** 期間の日ごとに fn を呼ぶ（true を返したら止める） */
function eachDay(window: Window, fn: (dayNumber: number) => boolean | void): void {
  for (const { from, to } of window.ranges) {
    for (let n = from; n <= to; n++) if (fn(n) === true) return;
  }
}

// ------------------------------------------------------------
// 規則の当てはまる日（覆われているかの判定用）
// ------------------------------------------------------------

/** 繰り返しの規則の形（有効期間・周期の位相は除く）が当てはまる日（代表の 28 年間）。祝日・振替は考えない */
function patternBits(rule: RecurringRuleCompiled<unknown>): Uint8Array {
  const bits = new Uint8Array(PATTERN_DAYS);
  // 周期のある規則は、位相を除いた形（毎週）で調べ、周期と位相は intervalCovers で比べる
  const weekly = rule.interval === null ? rule : { ...rule, interval: null, anchor: null };
  for (let i = 0; i < PATTERN_DAYS; i++) {
    if (matchPattern(weekly, fromDayNumber(PATTERN_FROM + i))) bits[i] = 1;
  }
  return bits;
}

/**
 * 繰り返しの規則が当てはまる日が 1 日でもあるか。
 * 有効期間があればその期間（期限のない側は、当てはまり方がそろう周期の長さ）を、なければ周期の長さを 1 日ずつ調べる
 */
function matchesAnyDay(rule: RecurringRuleCompiled<unknown>, cycle: number): boolean {
  const from =
    rule.effectiveFrom ?? (rule.effectiveTo === null ? PATTERN_FROM : rule.effectiveTo - cycle + 1);
  const to = Math.min(rule.effectiveTo ?? Infinity, from + cycle - 1);
  for (let n = from; n <= to; n++) if (matchPattern(rule, fromDayNumber(n))) return true;
  return false;
}

/** 毎年の月日の規則が当てはまる月日（うるう年の 366 日） */
const LEAP_MONTH_DAYS: readonly string[] = (() => {
  const list: string[] = [];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= lengthOfMonth(2028, m); d++) {
      list.push(`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return list;
})();

function annualBits(rule: AnnualRule<unknown>): Uint8Array {
  return Uint8Array.from(LEAP_MONTH_DAYS, (md) => (matchMonthDay(rule, md) ? 1 : 0));
}

/** a が当てはまる日に、b もすべて当てはまるか（a ⊆ b） */
const isSubset = (a: Uint8Array, b: Uint8Array): boolean =>
  a.every((v, i) => v === 0 || b[i] === 1);

/** 先の規則の有効期間が、後の規則の有効期間を含むか */
const periodCovers = (earlier: CompiledPeriod, later: CompiledPeriod): boolean =>
  (earlier.effectiveFrom === null ||
    (later.effectiveFrom !== null && earlier.effectiveFrom <= later.effectiveFrom)) &&
  (earlier.effectiveTo === null ||
    (later.effectiveTo !== null && earlier.effectiveTo >= later.effectiveTo));

/**
 * 周期の点で、先の規則が後の規則を覆えるか（形の包含は patternBits で別に調べる）。
 * 周期のある先の規則は、後の規則の周期がその倍数で、位相も同じ（起点の差が先の周期の倍数）ときだけ覆う
 */
function intervalCovers(
  earlier: RecurringRuleCompiled<unknown>,
  later: RecurringRuleCompiled<unknown>,
): boolean {
  if (earlier.interval === null) return true;
  if (later.interval === null) return false;
  return (
    later.interval % earlier.interval === 0 &&
    (later.anchor! - earlier.anchor!) % (7 * earlier.interval) === 0
  );
}

/**
 * 日単位の周期の規則どうしで、先の規則が後の規則の当てはまる日をすべて含むか（月の絞り込みは別に比べる）。
 * 後の周期が先の周期の倍数なら、後の規則の各位置は先の周期の決まった位置に当たる
 */
function cycleCovers(
  earlier: RecurringRuleCompiled<unknown>,
  later: RecurringRuleCompiled<unknown>,
): boolean {
  const e = earlier.cycle!;
  if (later.cycle! % e !== 0) return false;
  return [...later.positions!].every((position) => {
    const offset = (later.anchor! + position - 1 - earlier.anchor!) % e;
    return earlier.positions!.has(((offset + e) % e) + 1);
  });
}

/**
 * 先の繰り返しの規則 earlier が、後の規則 later を完全に覆えるか（祝日の扱いの組み合わせ）。
 * - "over-holiday" の規則は、祝日でも先に当てはめる "over-holiday" の規則にしか覆われない
 * - "under-holiday" の規則は、"over-holiday"・"under-holiday" の規則に覆われる
 * - "after-holiday" の規則は、振替先まで同じになる "after-holiday" の規則にしか覆われない
 */
function canCover(
  earlier: RecurringRuleCompiled<unknown>,
  later: RecurringRuleCompiled<unknown>,
): boolean {
  switch (later.holidayOverlapPolicy) {
    case "over-holiday":
      return earlier.holidayOverlapPolicy === "over-holiday";
    case "under-holiday":
      return earlier.holidayOverlapPolicy !== "after-holiday";
    case "after-holiday":
      return earlier.holidayOverlapPolicy === "after-holiday";
    default: {
      const unreachable: never = later.holidayOverlapPolicy;
      return unreachable;
    }
  }
}

// ------------------------------------------------------------
// 値の比較（取り除いても結果が変わらないか）
// ------------------------------------------------------------

/** 値が同じか。配列と普通のオブジェクトは中身で比べ、それ以外は Object.is で比べる */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => sameValue(v, b[i]))
    );
  }
  const plain = (o: object): boolean => {
    const proto: unknown = Object.getPrototypeOf(o);
    return proto === Object.prototype || proto === null;
  };
  if (!plain(a) || !plain(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every(
      (k) =>
        Object.hasOwn(b, k) &&
        sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  );
}

// ------------------------------------------------------------
// 規則どうしの診断
// ------------------------------------------------------------

const yearOf = (dayNumber: number): number => parseDate(fromDayNumber(dayNumber)).year;

function without<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  rule: DecidingRule<Value> | null,
  dropDates: boolean,
): CompiledSchedule<Value, Kind> {
  return {
    ...compiled,
    dates: dropDates ? [] : compiled.dates.filter((r) => r !== rule),
    annual: compiled.annual.filter((r) => r !== rule),
    recurring: compiled.recurring.filter((r) => r !== rule),
  };
}

/**
 * 祝日の提供元が返すデータを、対応年（長すぎる場合は絞った範囲）のすべての年で検証する。
 * 作成時は年ごとに初めて使うときに検証するので、使っていない年の誤りもここで見つける
 */
function checkProviderData(c: IssueCollector, source: HolidaySource<string>): boolean {
  let ok = true;
  source.providers.forEach((provider, i) => {
    const path = source.providers.length === 1 ? "holidayProvider" : `holidayProvider[${i}]`;
    const lookup = createHolidayLookup({
      ...source,
      providers: [provider],
      outOfRangePolicy: "ignore",
    });
    const [from, to] = clipYears(provider.supportedYears.from, provider.supportedYears.to);
    try {
      for (let y = from; y <= to; y++) lookup.holidaysInYear(y);
    } catch (error) {
      ok = false;
      c.error(
        "invalid-provider-data",
        path,
        error instanceof Error ? error.message : `Holiday provider threw ${String(error)}`,
      );
    }
  });
  return ok;
}

function analyze<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
  isCalendar: boolean,
): void {
  const { source, dates, annual, recurring } = compiled;
  if (!checkProviderData(c, source as HolidaySource<string>)) return;
  // 規則どうしの診断は、対応年の外を祝日なしとして扱う（走査の範囲の端で、隣の日を見る規則が例外にならないため）
  const lookup = createHolidayLookup({
    ...source,
    outOfRangePolicy: "ignore",
    unconfirmedHolidayPolicy: "accept",
  });
  const basis = createBasis(compiled, lookup);
  const cycle = patternCycle(recurring);
  const window = scanWindow(source as HolidaySource<string>, [...annual, ...recurring], cycle);
  /** 使われないことが分かった規則（redundant を重ねて出さない） */
  const unused = new Set<DecidingRule<Value>>();

  // --- 個別の日付: 対応年の外・覆われている ---
  dates.forEach((rule, j) => {
    const fromYear = yearOf(rule.from);
    const toYear = yearOf(rule.to);
    source.providers.forEach((p, i) => {
      const { from, to } = p.supportedYears;
      if (fromYear >= from && toYear <= to) return;
      const related = source.providers.length === 1 ? "holidayProvider" : `holidayProvider[${i}]`;
      c.warning(
        "out-of-range",
        rule.path,
        `The date is outside the years supported by holiday provider ${p.id} (${from}-${to}); ` +
          (source.outOfRangePolicy === "throw"
            ? "looking up this date throws"
            : "holidays are not considered for this date"),
        related,
      );
    });
    const cover = dates.slice(0, j).find((r) => r.from <= rule.from && rule.to <= r.to);
    if (cover) {
      unused.add(rule);
      c.warning(
        "shadowed",
        rule.path,
        `This rule is never used: the earlier rule ${cover.path} covers all of its days`,
        cover.path,
      );
    }
  });

  // --- 有効期間が提供元の対応年の外にある（対応年の外で例外になる設定では、その規則は決して使われない） ---
  for (const rule of [...annual, ...recurring]) {
    if (rule.effectiveFrom === null && rule.effectiveTo === null) continue;
    source.providers.forEach((p, i) => {
      const { from, to } = p.supportedYears;
      const after = rule.effectiveFrom !== null && yearOf(rule.effectiveFrom) > to;
      const before = rule.effectiveTo !== null && yearOf(rule.effectiveTo) < from;
      if (!after && !before) return;
      if (source.outOfRangePolicy === "throw") unused.add(rule);
      c.warning(
        "out-of-range",
        rule.path,
        `The effective period is outside the years supported by holiday provider ${p.id} (${from}-${to}); ` +
          (source.outOfRangePolicy === "throw"
            ? "looking up these dates throws, so this rule is never used"
            : "holidays are not considered for these dates"),
        source.providers.length === 1 ? "holidayProvider" : `holidayProvider[${i}]`,
      );
    });
  }

  // --- 毎年の月日: 覆われている（月日と有効期間の両方で） ---
  const annualMatches = annual.map(annualBits);
  annual.forEach((rule, j) => {
    const k = annualMatches.findIndex(
      (bits, i) => i < j && periodCovers(annual[i]!, rule) && isSubset(annualMatches[j]!, bits),
    );
    if (k < 0) return;
    unused.add(rule);
    c.warning(
      "shadowed",
      rule.path,
      `This rule is never used: the earlier rule ${annual[k]!.path} covers all of its days`,
      annual[k]!.path,
    );
  });

  // --- 繰り返しの規則: 当てはまる日がない・覆われている ---
  const recurringBits = recurring.map(patternBits);
  /** 祝日・祝日の翌日・祝前日の規則の判定に使う（提供元の対応年の外は祝日でないとみなす） */
  const holidayOfSafe = (date: DateString): Holiday<string> | undefined => {
    try {
      return lookup.holidayOfDate(date);
    } catch {
      return undefined;
    }
  };
  /** 祝日に従属する規則（祝日・祝日の翌日・祝前日）が、調べる期間と有効期間の中で 1 日でも当てはまるか（祝日は年ごとに違うので、全日を調べる） */
  const holidayRuleMatches = (rule: RecurringRuleCompiled<unknown>): boolean => {
    if (source.providers.length === 0 || !window) return false;
    let found = false;
    eachDay(
      window,
      (n) =>
        (found =
          inPeriod(rule, n) &&
          matchPattern(rule, fromDayNumber(n), holidayOfSafe, undefined, lookup.fromJp)),
    );
    return found;
  };
  /** 第 n 営業日の規則が、調べる期間と有効期間の中で 1 日でも当てはまるか（基準は祝日次第で年ごとに違うので、全日を調べる。対応年の外は当てはまらないとみなす） */
  const businessDayRuleMatches = (rule: RecurringRuleCompiled<unknown>): boolean => {
    if (!window) return false;
    let found = false;
    eachDay(window, (n) => {
      if (!inPeriod(rule, n)) return false;
      try {
        found = matchPattern(rule, fromDayNumber(n), holidayOfSafe, basis, lookup.fromJp);
      } catch {
        found = false;
      }
      return found;
    });
    return found;
  };
  /** 集合 a（null はすべて）が集合 b（null はすべて）を含むか */
  const setCovers = <V>(a: ReadonlySet<V> | null, b: ReadonlySet<V> | null): boolean =>
    a === null || (b !== null && [...b].every((v) => a.has(v)));
  // 日本の提供元だけの設定で、調べる期間に種別 "national" の祝日がなければ、kinds の旧名 "national" は "regular" と
  // 同じ祝日に当たるので、覆う関係は "regular" として比べる（和集合ではほかの提供元の "regular" があるので比べない。54 番）
  const renamedKind = RENAMED_VALUES.find((x) => x.key === "kinds")!;
  let nationalAsRegular: boolean | undefined;
  const kindsOf = (r: RecurringRuleCompiled<unknown>): ReadonlySet<string> | null => {
    if (!r.nationalOfJp || r.kinds === null) return r.kinds;
    if (nationalAsRegular === undefined) {
      let found = false;
      if (window && jpUsage(source as HolidaySource<string>) === "only") {
        eachDay(
          window,
          (n) => (found = holidayOfSafe(fromDayNumber(n))?.kind === renamedKind.from),
        );
        nationalAsRegular = !found;
      } else nationalAsRegular = false;
    }
    return nationalAsRegular
      ? new Set([...r.kinds].map((k) => (k === renamedKind.from ? renamedKind.to : k)))
      : r.kinds;
  };
  /** 振替で飛ばす曜日が同じか（違えば当てはまる日が違うので覆わない） */
  const sameSkip = (
    a: RecurringRuleCompiled<unknown>,
    b: RecurringRuleCompiled<unknown>,
  ): boolean =>
    a.skipWeekdays === null
      ? b.skipWeekdays === null
      : b.skipWeekdays !== null &&
        a.skipWeekdays.size === b.skipWeekdays.size &&
        [...a.skipWeekdays].every((w) => b.skipWeekdays!.has(w));
  recurring.forEach((rule, j) => {
    const bits = recurringBits[j]!;
    const holidayBased = rule.holiday || rule.dayAfterHoliday || rule.dayBeforeHoliday;
    const businessDayBased = rule.businessDays !== null;
    const matches = holidayBased
      ? holidayRuleMatches(rule)
      : businessDayBased
        ? businessDayRuleMatches(rule)
        : matchesAnyDay(rule, cycle);
    if (!matches) {
      unused.add(rule);
      // kinds の "national" を、ID "JP" の提供元のない設定で書いた（id を変えて包んだ日本の提供元を含む）。
      // 改名の前の名前の可能性を添える。1.0.0 で旧名を削除した後も残す（docs/decisions.md の 54 番）
      const national =
        holidayBased &&
        source.providers.length > 0 &&
        jpUsage(source as HolidaySource<string>) === "none" &&
        rule.kinds?.has(RENAMED_VALUES.find((x) => x.key === "kinds")!.from) === true;
      c.warning(
        "never-matches",
        rule.path,
        (holidayBased
          ? source.providers.length === 0
            ? "This rule matches no day: there are no holidays without a holiday provider"
            : rule.holiday
              ? "This rule matches no day: no holiday of the selected kinds, keys, weekdays and months within its effective period"
              : rule.dayAfterHoliday
                ? "This rule matches no day: no day after a holiday of the selected kinds and keys on the selected weekdays and months within its effective period"
                : "This rule matches no day: no day before a holiday of the selected kinds and keys on the selected weekdays and months within its effective period"
          : businessDayBased
            ? rule.weekStart !== null
              ? "This rule matches no day: no week has that many business days of the counting basis in the selected months within its effective period"
              : "This rule matches no day: no month has that many business days of the counting basis in the selected months within its effective period"
            : rule.effectiveFrom === null && rule.effectiveTo === null
              ? "This rule matches no day (for example, a day that does not exist in the selected months)"
              : "This rule matches no day within its effective period") +
          (national
            ? '; "national" was renamed to "regular" in 0.30.0 and is not read so without a provider whose ID is "JP"'
            : ""),
      );
      return;
    }
    // 第 n 営業日の規則の "over-holiday" は、祝日が基準の営業日にならない設定（holidayPolicy: "closed"）では結果を変えない
    if (
      businessDayBased &&
      rule.basis === null &&
      rule.holidayOverlapPolicy === "over-holiday" &&
      typeof compiled.holiday === "object" &&
      "value" in compiled.holiday &&
      compiled.holiday.value === false
    ) {
      c.info(
        "redundant",
        `${rule.path}.holidayOverlapPolicy`,
        'This option does not change the result: holidays are closed (holidayPolicy: "closed"), so an nth business day is never a holiday',
      );
    }
    // 第 n 営業日の規則の数える基準は繰り返しの規則を除くので、同じ設定の毎週の曜日の規則があれば知らせる（定休日を曜日の規則で書いた設定）
    if (businessDayBased && rule.basis === null) {
      const weekly = recurring.find(
        (r) => r.weekday !== null && r.nth === null && r.interval === null && r.months === null,
      );
      if (weekly) {
        c.info(
          "counting-basis",
          rule.path,
          `The business days are counted without recurring rules, so the weekday rule ${weekly.path} does not reduce the count; ` +
            "write regular closed weekdays as closedWeekdays if they should not be counted",
          weekly.path,
        );
      }
    }
    // 祝日・祝日の翌日・祝前日の規則は祝日次第で年ごとに変わるので、形の包含は同じ形の規則どうし（種別・識別子・曜日・月の絞り込み）だけで調べる。
    // 日単位の周期の規則は、周期の規則どうしだけで調べる（曜日・日の規則とは周期がそろわない）
    const k = recurring.findIndex(
      (r, i) =>
        i < j &&
        canCover(r, rule) &&
        periodCovers(r, rule) &&
        sameSkip(r, rule) &&
        (rule.holiday
          ? r.holiday &&
            setCovers(kindsOf(r), kindsOf(rule)) &&
            setCovers(r.keys, rule.keys) &&
            setCovers(r.weekdays, rule.weekdays) &&
            setCovers(r.months, rule.months)
          : rule.dayAfterHoliday || rule.dayBeforeHoliday
            ? r.dayAfterHoliday === rule.dayAfterHoliday &&
              r.dayBeforeHoliday === rule.dayBeforeHoliday &&
              setCovers(kindsOf(r), kindsOf(rule)) &&
              setCovers(r.keys, rule.keys) &&
              setCovers(r.weekdays, rule.weekdays) &&
              setCovers(r.months, rule.months)
            : rule.cycle !== null
              ? r.cycle !== null && cycleCovers(r, rule) && setCovers(r.months, rule.months)
              : rule.businessDays !== null
                ? r.businessDays !== null &&
                  r.weekStart === rule.weekStart &&
                  r.calendar === rule.calendar &&
                  setCovers(r.businessDays, rule.businessDays) &&
                  setCovers(r.months, rule.months)
                : !r.holiday &&
                  !r.dayAfterHoliday &&
                  !r.dayBeforeHoliday &&
                  r.businessDays === null &&
                  r.cycle === null &&
                  intervalCovers(r, rule) &&
                  isSubset(bits, recurringBits[i]!)),
    );
    if (k < 0) return;
    unused.add(rule);
    c.warning(
      "shadowed",
      rule.path,
      `This rule is never used: the earlier rule ${recurring[k]!.path} covers all of its days`,
      recurring[k]!.path,
    );
  });

  // --- 営業日が 1 日もない（営業日カレンダー） ---
  // 個別の日付は有限なので、臨時営業日（値が true）がなければ、個別の日付を除いて調べる
  if (isCalendar && window && !dates.some((r) => r.value === true)) {
    const resolve = createResolver(without(compiled, null, true), lookup);
    let found = false;
    eachDay(window, (n) => (found = resolve(fromDayNumber(n)).day.value === true));
    if (!found) {
      c.warning(
        "no-business-day",
        "",
        `No day is a business day with these options (checked ${window.label}); ` +
          "searching for a business day throws",
      );
    }
  }

  // --- 取り除いても結果が変わらない ---
  const redundant = (
    rule: DecidingRule<Value>,
    base: CompiledSchedule<Value, Kind>,
    days: number[],
  ) => {
    const resolve = createResolver(without(base, rule, false), lookup);
    return days.every((n) => sameValue(rule.value, resolve(fromDayNumber(n)).day.value));
  };

  // 個別の日付は、その期間を調べる（対応年の外で例外になる日は除く）
  const full = createResolver(compiled, lookup);
  for (const rule of dates) {
    if (unused.has(rule)) continue;
    const decided: number[] = [];
    let checked = 0;
    const last = Math.min(rule.to, rule.from + MAX_DATE_RULE_DAYS - 1);
    for (let n = rule.from; n <= last; n++) {
      let decidedBy: DecidingRule<Value> | null;
      try {
        decidedBy = full(fromDayNumber(n)).rule;
      } catch {
        continue;
      }
      checked++;
      if (decidedBy === rule) decided.push(n);
    }
    if (checked > 0 && redundant(rule, compiled, decided)) {
      c.info(
        "redundant",
        rule.path,
        decided.length === 0
          ? "This rule is never used: earlier rules cover all of its days"
          : "Removing this rule does not change any result",
      );
    }
  }

  // 毎年の月日・繰り返しの規則は、調べる期間の全日を調べる。個別の日付は有限なので除いて調べる
  if (!window) return;
  const candidates = [...annual, ...recurring].filter((r) => !unused.has(r));
  if (candidates.length === 0) return;
  const base = without(compiled, null, true);
  const resolveBase = createResolver(base, lookup);
  const decided = new Map<DecidingRule<Value>, number[]>(candidates.map((r) => [r, []]));
  eachDay(window, (n) => {
    const rule = resolveBase(fromDayNumber(n)).rule;
    if (rule) decided.get(rule)?.push(n);
  });
  for (const rule of candidates) {
    const days = decided.get(rule)!;
    if (!redundant(rule, base, days)) continue;
    c.info(
      "redundant",
      rule.path,
      days.length === 0
        ? `This rule is never used: other rules decide every day it matches (checked ${window.label})`
        : `Removing this rule does not change any result (checked ${window.label})`,
    );
  }
}

/** 診断を実行する。祝日の提供元の誤り（年ごとに初めて使うときに分かる）も error として返す */
/**
 * 診断のオプション（第 2 引数）。
 * @public
 */
export interface DiagnoseOptions {
  /**
   * 基準日 "YYYY-MM-DD"。指定すると、この日より前に終わった規則・日付（有効期間の effectiveTo、個別の日付・期間の終わり）を
   * info の expired として返す（整理の候補）。省略時は返さない（現在時刻は使わず、結果を決定的に保つ）
   */
  readonly asOf?: DateString;
}

/** 第 2 引数を検証する（設定の誤りは診断結果で返すが、引数の誤りは例外。知らないキーは無視する） */
function compileDiagnoseOptions(options: unknown): { asOf: number | null } {
  if (options === undefined) return { asOf: null };
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw rangeError(
      "invalid-argument",
      "the second argument must be an object of diagnose options",
    );
  }
  const asOf = (options as { asOf?: unknown }).asOf;
  if (asOf === undefined) return { asOf: null };
  if (!isValidDate(asOf)) {
    throw rangeError(
      "invalid-date",
      `asOf must be a date string "YYYY-MM-DD": ${JSON.stringify(asOf)}`,
    );
  }
  return { asOf: toDayNumber(asOf) };
}

/** 基準日より前に終わった規則・日付を expired にする（暦日の大小比較だけで、祝日は引かない） */
function checkExpired<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
  asOf: number,
): void {
  const ended = (path: string, last: number, what: string): void => {
    if (last < asOf) {
      c.info(
        "expired",
        path,
        `This ${what} ended on ${fromDayNumber(last)}, before ${fromDayNumber(asOf)}; it no longer affects results and can be removed if the past need not be reproduced`,
      );
    }
  };
  for (const r of compiled.dates) ended(r.path, r.to, "date");
  for (const r of compiled.annual) if (r.effectiveTo !== null) ended(r.path, r.effectiveTo, "rule");
  for (const r of compiled.recurring)
    if (r.effectiveTo !== null) ended(r.path, r.effectiveTo, "rule");
}

/**
 * 判定に祝日を使わない設定（提供元がない、または holidayPolicy: "ignore" で祝日に従属する規則もない）の
 * unconfirmedHolidayPolicy: "throw" は、結果に影響しないので redundant にする。dayInfoOn が holiday を付けるために祝日を引くので実行時には投げるが、
 * 投げても結果が変わらない設定であることを知らせる
 */
function checkUnconfirmedOption<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
): void {
  if (compiled.source.unconfirmedHolidayPolicy !== "throw") return;
  const noProvider = compiled.source.providers.length === 0;
  const holidayUnused =
    compiled.holiday === "ignore" &&
    !compiled.recurring.some(
      (r) =>
        r.holiday ||
        r.dayAfterHoliday ||
        r.dayBeforeHoliday ||
        r.holidayOverlapPolicy === "after-holiday",
    );
  if (!noProvider && !holidayUnused) return;
  c.info(
    "redundant",
    "unconfirmedHolidayPolicy",
    noProvider
      ? 'unconfirmedHolidayPolicy: "throw" has no effect: there is no holiday provider'
      : `unconfirmedHolidayPolicy: "throw" has no effect on results: holidays are not used (holidayPolicy: "ignore" and no holiday-based rule); dayInfoOn still throws when it looks up the holiday to report`,
  );
}

function run<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind> | undefined,
  isCalendar: boolean,
  asOf: number | null,
): readonly Diagnostic[] {
  if (compiled && !c.hasErrors) {
    if (asOf !== null) checkExpired(c, compiled, asOf);
    checkUnconfirmedOption(c, compiled);
    const before = c.issues.length;
    try {
      analyze(c, compiled, isCalendar);
    } catch (error) {
      // 規則どうしの診断の途中の結果は、提供元の誤りで信頼できないので捨てる
      c.issues.length = before;
      const code = (error as { code?: unknown } | null)?.code;
      c.error(
        code === "out-of-range" ? "out-of-range" : "invalid-provider-data",
        "holidayProvider",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return Object.freeze(
    c.issues.map(({ unknownKey, knownKeys, nationalInUnion, ...issue }) => {
      if (nationalInUnion) {
        const { from, to } = RENAMED_VALUES.find((r) => r.key === "kinds")!;
        issue.message += `; here it matches Japan's "${to}" and other providers' "${from}" holidays. From 1.0.0 it is an invalid-option with a "JP" provider: wrap the Japanese provider and rename your own "${from}" kind (see the migration guide)`;
      }
      const suggestion =
        unknownKey === undefined || knownKeys === undefined
          ? undefined
          : closestKey(unknownKey, knownKeys);
      if (suggestion !== undefined) {
        issue.message += ` (did you mean ${JSON.stringify(suggestion)}?)`;
      }
      return Object.freeze(issue) as Diagnostic;
    }),
  );
}

/**
 * 営業日カレンダーの設定を診断する。例外は投げず、見つけた問題を返す（問題がなければ空の配列）。
 *
 * error があるときは、規則どうしの診断（shadowed・redundant など）は行わない。
 * JavaScript から渡された型の合わない設定も受け付ける。
 * @public
 */
export function diagnoseCalendar(
  options: CalendarOptions | object = {},
  diagnoseOptions?: DiagnoseOptions,
): readonly Diagnostic[] {
  const { asOf } = compileDiagnoseOptions(diagnoseOptions);
  const c = new IssueCollector();
  const compiled = compileCalendarOptions<string>(c, options);
  return run(c, compiled?.schedule, true, asOf);
}

/**
 * スケジュールの設定を診断する。例外は投げず、見つけた問題を返す（問題がなければ空の配列）。
 *
 * 値が同じかは、配列と普通のオブジェクトは中身で、それ以外は Object.is で比べる。
 * error があるときは、規則どうしの診断（shadowed・redundant など）は行わない。
 * @public
 */
export function diagnoseSchedule(
  options: ScheduleOptions<unknown> | object,
  diagnoseOptions?: DiagnoseOptions,
): readonly Diagnostic[] {
  const { asOf } = compileDiagnoseOptions(diagnoseOptions);
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<unknown, string>(c, options);
  return run(c, compiled, false, asOf);
}
