/**
 * 規則の診断（diagnoseCalendar・diagnoseSchedule）。
 *
 * 設定を作るときと同じ検証（IssueCollector）で誤りと知らないキーを集め、誤りがなければ
 * 規則どうしの関係を調べる。例外は投げず、見つけた問題を配列で返す。
 *
 * 重さは error（createCalendar・createSchedule で例外になる誤り。code は例外と同じ）・warning（作れるが、意図と違う可能性が
 * 高いもの）・info（知らせ）の 3 つ。診断のコードと重さの一覧はガイドの診断の表（docs/guide.md の「Option diagnostics」）、
 * redundant の逐次除去と relatedPath は decisions.md の 31 番
 *
 * 未確定の祝日の扱い（unconfirmedHolidayPolicy）は診断では常に "accept" で評価する。診断は設定の形を調べるもので、
 * 祝日が確定しているかどうかは関係がなく、"throw" のまま評価すると例外を握りつぶして「当てはまらない」と誤判定するため
 *
 * 判定の順番は固定（decisions.md の 11 番）なので、shadowed は同じ種類の規則どうしに限って調べる。種類をまたいで使われない規則は
 * redundant（取り除いても結果が変わらない）として見つかる。
 * 有効期間（effectiveFrom・effectiveTo）のある規則は期間の包含も、周期（interval・cycle）のある規則は周期の包含も
 * shadowed の条件にする。redundant の走査の範囲は、周期がそろう長さと、範囲の外にある有効期間まで広げる
 */

import {
  formatDate,
  lengthOfMonth,
  fromDayNumber,
  isValidDate,
  parseDate,
  toDayNumber,
  weekdayOf,
  type DateString,
} from "./date.ts";
import { compileCalendarOptions, type CalendarOptions } from "./calendar.ts";
import {
  internalError,
  InternalError,
  describeValue,
  IssueCollector,
  rangeError,
  type KnownErrorCode,
} from "./errors.ts";
import { isOptionsObject } from "./options.ts";
import { RENAMED_KEYS, RENAMED_VALUES } from "./renamed.ts";
import {
  compileScheduleOptions,
  createBasis,
  createHolidayLookup,
  createResolver,
  inPeriod,
  MAX_HOLIDAY_RUN,
  jpUsage,
  matchMonthDay,
  matchPattern,
  type AnnualRule,
  type CompiledPeriod,
  type CompiledSchedule,
  type DateRule,
  type DecidingRule,
  type HolidaySource,
  type RecurringRuleCompiled,
  type ScheduleOptions,
  isHolidayBasedRule,
  resultIgnoresHolidays,
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
 * 出力の列挙だが、重さの段階は増やさないため閉じた型にしている（docs/decisions.md の 2 番）。
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
  /** 0.30.0 で改名した旧名のキー・値（新しい名前と同じに扱う。1.0.0 での扱いは移行ガイドの「1.0.0 で削除する予定の API」） */
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
 * 診断コード。将来のバージョンで値が増えることがあるので、分岐では「その他」も扱うこと。
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

/**
 * 規則どうしの診断（redundant など）が調べる期間。analyzeRules が使う。テストのオラクル（test/diagnose-oracle.test.ts）も、
 * 診断と同じ期間で「取り除いても結果が変わらない」かを確かめるために、同じ関数を使う
 * @internal
 */
export function rulesScanWindow(
  compiled: Pick<CompiledSchedule<unknown, string>, "source" | "annual" | "recurring">,
  cycle: number = patternCycle(compiled.recurring),
): Window | undefined {
  return scanWindow(
    compiled.source as HolidaySource<string>,
    [...compiled.annual, ...compiled.recurring],
    cycle,
  );
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

/** 有効期間が 1 日でも重なる（どちらかが無期限なら重なる） */
const periodsOverlap = (a: CompiledPeriod, b: CompiledPeriod): boolean =>
  (a.effectiveFrom ?? -Infinity) <= (b.effectiveTo ?? Infinity) &&
  (b.effectiveFrom ?? -Infinity) <= (a.effectiveTo ?? Infinity);

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
 * 提供元の診断の位置。提供元が 1 つなら "holidayProvider"、2 つ以上なら設定に書いた位置（同じ提供元を除いた後も、書いた
 * 添字のまま）
 */
const providerPath = (source: HolidaySource<string>, i: number): string =>
  source.providers.length === 1
    ? "holidayProvider"
    : `holidayProvider[${source.providerIndexes?.[i] ?? i}]`;

/**
 * 祝日の提供元が返すデータを、対応年（長すぎる場合は絞った範囲）のすべての年で検証する。
 * 作成時は年ごとに初めて使うときに検証するので、使っていない年の誤りもここで見つける
 */
function checkProviderData(c: IssueCollector, source: HolidaySource<string>): boolean {
  let ok = true;
  source.providers.forEach((provider, i) => {
    const path = providerPath(source, i);
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

/** 基準のカレンダーが投げて判定できない日として扱う例外の code（対応年の外・未確定の祝日） */
const UNJUDGEABLE = new Set(["out-of-range", "unconfirmed-holiday"]);

/**
 * スケジュールの第 n 営業日の規則の基準のカレンダーを、投げた月を記録しながら評価する（その月は営業日がないとみなす）。
 * 診断の走査で基準のカレンダーが対応年の外・未確定の祝日で投げても、診断が例外にならず、誤った error を出さないため。
 * 記録は見張り（dropUnsure）の入力にだけ使い、投げた月だけを記録する。判定できない日の集合 U は、規則を評価する前に
 * unjudgeableDays が求める（週の規則が隣の月を見る扱いも、そこで決める。docs/decisions.md の 31 番）
 */
function guardBases<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  unknownMonths: Set<number>,
): CompiledSchedule<Value, Kind> {
  if (!compiled.recurring.some((r) => r.basis !== null && r.calendar !== null)) return compiled;
  return {
    ...compiled,
    recurring: compiled.recurring.map((r) => {
      const basis = r.basis;
      if (basis === null || r.calendar === null) return r;
      return {
        ...r,
        basis: (year: number, month: number) => {
          try {
            return basis(year, month);
          } catch (error) {
            if (!UNJUDGEABLE.has(String((error as { code?: unknown }).code))) throw error;
            // 投げた月だけを記録する（週の規則が隣の月を見る扱いは unsureOf が決める）。記録は見張りに使う
            unknownMonths.add(year * 12 + month - 1);
            return [];
          }
        },
      };
    }),
  };
}

/**
 * 判定できない日があるときに出さない診断（分からないことは言わない）。shadowed は規則の形（集合の包含・同じ基準のカレンダーか）
 * だけで決まり、基準のカレンダーを評価しないので、いつも出す
 */
const UNSURE_CODES = new Set(["never-matches", "redundant"]);

/** @internal 判定できない日（窓の日の通し番号）と、基準が投げる月（年 × 12 + 月 - 1。見張りに使う） */
export interface Unjudgeable {
  readonly days: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
}

/**
 * @internal 判定できない日の集合 U を、規則を評価せずに決める（docs/decisions.md の 31 番）。単位は「その日について、結果の
 * 分からない規則があるか」。基準のカレンダーを持つ規則ごとに、
 *
 * - 月の規則: 有効期間 ∩ 窓のうち months に当てはまる月で、基準が投げる月の日（有効期間 ∩ 窓の中）
 * - 週の規則: 有効期間 ∩ 窓に 1 日でも入る週（weekStart で区切る）のうち、months に当てはまる日を含む週で、その 7 日が
 *   属する月のどれかで基準が投げる週の 7 日
 *
 * U はその和。規則の形を調べる代表の 28 年間は含めない（第 n 営業日の規則の形は setCovers で比べ、代表の 28 年間で基準を
 * 評価しない）。基準は繰り返しの規則に依存しないので、規則の並びや取り除きの順に左右されない
 */
export function unjudgeableDays<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  window:
    | { readonly ranges: readonly { readonly from: number; readonly to: number }[] }
    | undefined,
): Unjudgeable {
  const days = new Set<number>();
  const months = new Set<number>();
  const bases = compiled.recurring.filter((r) => r.basis !== null && r.calendar !== null);
  if (!window || bases.length === 0) return { days, months };
  const monthOf = (day: number): number => {
    const { year, month } = parseDate(fromDayNumber(day));
    return year * 12 + month - 1;
  };
  for (const r of bases) {
    const thrown = new Map<number, boolean>();
    const throws = (m: number): boolean => {
      let result = thrown.get(m);
      if (result === undefined) {
        try {
          r.basis!(Math.floor(m / 12), (m % 12) + 1);
          result = false;
        } catch (error) {
          // 判定できない日の印（対応年の外・未確定の祝日）だけを数える。ほかの例外は、規則どうしの診断が報告する
          result = UNJUDGEABLE.has(String((error as { code?: unknown }).code));
        }
        thrown.set(m, result);
        if (result) months.add(m);
      }
      return result;
    };
    const inMonths = (m: number): boolean => r.months === null || r.months.has((m % 12) + 1);
    for (const range of window.ranges) {
      const from = Math.max(range.from, r.effectiveFrom ?? -Infinity);
      const to = Math.min(range.to, r.effectiveTo ?? Infinity);
      if (from > to) continue;
      if (r.weekStart === null) {
        for (let n = from; n <= to; n++)
          if (inMonths(monthOf(n)) && throws(monthOf(n))) days.add(n);
        continue;
      }
      // 週の規則: weekStart で区切った週ごとに、その 7 日が属する月で基準が投げるか
      const start = from - ((weekdayOf(fromDayNumber(from)) - r.weekStart + 7) % 7);
      for (let w = start; w <= to; w += 7) {
        const week = [0, 1, 2, 3, 4, 5, 6].map((i) => w + i);
        const weekMonths = [...new Set(week.map(monthOf))];
        if (!weekMonths.some(inMonths)) continue;
        // 投げる月はすべて記録する（見張りの入力。some で途中で止めない）
        if (weekMonths.map(throws).some(Boolean)) for (const n of week) days.add(n);
      }
    }
  }
  return { days, months };
}

/**
 * @internal 判定できない日の影響を受けうる診断（never-matches・redundant）か。診断の項目は、path の先頭が規則の位置と一致する
 * もので引く（規則の中のオプションの位置も同じ規則に当たる）。
 *
 * - 基準のカレンダーを持たない繰り返しの規則の never-matches と、その規則の中のオプションの診断は、規則の形と設定だけで
 *   決まり、基準のカレンダーを評価しないので分かる
 * - それ以外は、その項目の有効期間（個別の日付はその期間。期間がなければ全期間）に判定できない日があれば分からない。
 *   redundant は、取り除いた設定と元の設定の結果を比べるので、ほかの規則の基準のカレンダーの評価にも依存する
 * - 規則に当たらない path の診断は分からない
 */
export function unsureOf<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  unknown: Unjudgeable,
): (code: string, path: string) => boolean {
  if (unknown.days.size === 0) return () => false;
  const sorted = [...unknown.days].sort((a, b) => a - b);
  const overlaps = (start: number | null, end: number | null): boolean => {
    const a = start ?? -Infinity;
    const b = end ?? Infinity;
    // a 以上の最初の日を二分探索で求め、それが b 以下か
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! < a) lo = mid + 1;
      else hi = mid;
    }
    return lo < sorted.length && sorted[lo]! <= b;
  };
  const items: readonly DecidingRule<Value>[] = [
    ...compiled.dates,
    ...compiled.annual,
    ...compiled.recurring,
  ];
  const isRecurring = (r: DecidingRule<Value>): r is RecurringRuleCompiled<Value> =>
    (compiled.recurring as readonly DecidingRule<Value>[]).includes(r);
  const isDate = (r: DecidingRule<Value>): r is DateRule<Value> =>
    (compiled.dates as readonly DecidingRule<Value>[]).includes(r);
  return (code, path) => {
    if (!UNSURE_CODES.has(code)) return false;
    const item = items.find((r) => path === r.path || path.startsWith(`${r.path}.`));
    if (item === undefined) return true;
    if (
      isRecurring(item) &&
      item.calendar === null &&
      (code === "never-matches" || path !== item.path)
    )
      return false;
    if (isDate(item)) return overlaps(item.from, item.to);
    return overlaps(item.effectiveFrom, item.effectiveTo);
  };
}

/**
 * @internal 見張り: 判定できない日にかかわる never-matches・redundant が残っていないことと、診断の途中で基準が投げた月が、
 * 前もって求めた基準の投げる月（unjudgeableDays の months）に含まれることを確かめる。分からない規則は走査の前に決めて出さないので（走査の後で消すと、
 * ほかの規則が「消した規則を外した設定」で判定されたままになる。31 番）、ここで見つかれば作りの誤り（黙って外れる検査を
 * 作らない。RELEASING.md の「品質の仕組みの理由」の「規則を 1 か所に書く」）
 */
export function dropUnsure(
  c: IssueCollector,
  from: number,
  unsure: (code: string, path: string) => boolean,
  recorded: ReadonlySet<number>,
  unknown: Unjudgeable,
): void {
  for (const m of recorded)
    if (!unknown.months.has(m))
      throw internalError(`a basis threw in a month that was not found beforehand: ${m}`);
  const left = c.issues.slice(from).find((d) => unsure(d.code, d.path));
  if (left)
    throw internalError(
      `a diagnostic about an unjudgeable month was left: ${left.code} ${left.path}`,
    );
}

function analyze<Value, Kind extends string>(
  c: IssueCollector,
  original: CompiledSchedule<Value, Kind>,
  isCalendar: boolean,
): void {
  // 判定できない日を、規則を評価する前に、基準を直接求めて決める（基準は繰り返しの規則に依存しないので、規則の並びや
  // 取り除きの順に左右されない）。分からない規則は never-matches・redundant を出さず、逐次除去でも取り除かない（31 番）
  const unknown = unjudgeableDays(original, rulesScanWindow(original));
  const recorded = new Set<number>();
  const compiled = guardBases(original, recorded);
  const unsure = unsureOf(original, unknown);
  const from = c.issues.length;
  analyzeRules(c, compiled, isCalendar, unsure);
  dropUnsure(c, from, unsure, recorded, unknown);
}

function analyzeRules<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
  isCalendar: boolean,
  unsure: (code: string, path: string) => boolean = () => false,
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
  const window = rulesScanWindow(compiled, cycle);
  /** 使われないことが分かった規則（redundant を重ねて出さない） */
  const unused = new Set<DecidingRule<Value>>();

  // --- 個別の日付: 対応年の外・覆われている ---
  dates.forEach((rule, j) => {
    const fromYear = yearOf(rule.from);
    const toYear = yearOf(rule.to);
    source.providers.forEach((p, i) => {
      const { from, to } = p.supportedYears;
      if (fromYear >= from && toYear <= to) return;
      const related = providerPath(source, i);
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
        providerPath(source, i),
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
  // 第 n 営業日の規則の shadowed は形の包含（setCovers）で決まり、当てはまる日の印はどの診断も使わないので求めない（求めると、
  // 代表の 28 年間で基準のカレンダーを評価してしまう）。第 n 営業日の規則の印を使う診断を足すときは、ここと
  // unjudgeableDays（代表の 28 年間を U に含めていない）を見直す（docs/decisions.md の 31 番）
  const noBits = new Uint8Array(PATTERN_DAYS);
  const recurringBits = recurring.map((r) => (r.businessDays !== null ? noBits : patternBits(r)));
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
  // 同じ祝日に当たるので、覆う関係は "regular" として比べる（和集合ではほかの提供元の "regular" があるので比べない。docs/decisions.md の 31 番）
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
    const holidayBased = isHolidayBasedRule(rule);
    const businessDayBased = rule.businessDays !== null;
    const matches = holidayBased
      ? holidayRuleMatches(rule)
      : businessDayBased
        ? businessDayRuleMatches(rule)
        : matchesAnyDay(rule, cycle);
    if (!matches && !unsure("never-matches", rule.path)) {
      unused.add(rule);
      // kinds の "national" を、ID "JP" の提供元のない設定で書いた（id を変えて包んだ日本の提供元を含む）。
      // 改名の前の名前の可能性を添える。旧名を削除した後も残す（docs/decisions.md の 10 番。RELEASING.md の「1.0.0 で行う作業」）
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

  // --- 第 n 営業日の規則の数え方の限界（counting-basis） ---
  // 数える基準は繰り返しの規則を除くので、同じ設定の毎週の曜日の規則があれば知らせる（定休日を曜日の規則で書いた設定）。
  // 有効期間が重なり、使われている曜日の規則ごとに 1 件。使われない規則（対応年の外・never-matches・shadowed）は
  // 上の走査で unused に入り終えているので、ここで判定する（規則の並び順で結果が変わらないように）
  for (const rule of recurring) {
    if (rule.businessDays === null || rule.basis !== null) continue;
    const weeklies = recurring.filter(
      (r) =>
        r.weekday !== null &&
        r.nth === null &&
        r.interval === null &&
        r.months === null &&
        !unused.has(r) &&
        periodsOverlap(rule, r),
    );
    for (const weekly of weeklies) {
      c.info(
        "counting-basis",
        rule.path,
        weekly.value === true
          ? `The business days are counted without recurring rules, so the days opened by the weekday rule ${weekly.path} are not counted`
          : `The business days are counted without recurring rules, so the weekday rule ${weekly.path} does not reduce the count; ` +
              "write regular closed weekdays as closedWeekdays if they should not be counted",
        weekly.path,
      );
    }
  }

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
  // 自分の設定を基準に第 n 営業日を数える規則（閉じる・開くの両方）があれば、個別の日付と毎年の月日は数え方を変える（16 番）。
  // それらを取り除くと、決めていた日のほかに、同じ月・週の別の日も変わりうるので、その月・週の日をすべて調べる（31 番）
  const counting = recurring.filter((r) => r.businessDays !== null && r.calendar === null);
  const countsMonth = counting.some((r) => r.weekStart === null);
  const weekStarts = [
    ...new Set(counting.flatMap((r) => (r.weekStart === null ? [] : [r.weekStart]))),
  ];
  /** 日を含む月・週（数える単位）のすべての日 */
  const countingUnits = (days: Iterable<number>): Set<number> => {
    const out = new Set<number>();
    for (const n of days) {
      out.add(n);
      if (countsMonth) {
        const { year, month, day } = parseDate(fromDayNumber(n));
        for (let k = 0; k < lengthOfMonth(year, month); k++) out.add(n - day + 1 + k);
      }
      for (const start of weekStarts) {
        const first = n - ((weekdayOf(fromDayNumber(n)) - start + 7) % 7);
        for (let k = 0; k < 7; k++) out.add(first + k);
      }
    }
    return out;
  };
  /** 元の設定の結果（日ごとに 1 回だけ判定する。判定できない日は undefined の代わりに印を返す） */
  const FAILED = Symbol("failed");
  const originalOf = (resolve: ReturnType<typeof createResolver<Value, Kind>>) => {
    const values = new Map<number, unknown>();
    return (n: number): unknown => {
      if (!values.has(n)) {
        let value: unknown;
        try {
          value = resolve(fromDayNumber(n)).day.value;
        } catch {
          value = FAILED;
        }
        values.set(n, value);
      }
      return values.get(n);
    };
  };
  /**
   * 規則を取り除いた設定で、days の結果が元の設定と同じか。片方だけが判定できない日は変わったとみなし（取り除ける側に
   * 倒さない）、両方とも判定できない日は同じとみなす
   */
  const redundant = (
    rule: DecidingRule<Value>,
    base: CompiledSchedule<Value, Kind>,
    days: Iterable<number>,
    original: (n: number) => unknown,
  ): boolean => {
    const resolve = createResolver(without(base, rule, false), lookup);
    for (const n of days) {
      let value: unknown;
      try {
        value = resolve(fromDayNumber(n)).day.value;
      } catch {
        value = FAILED;
      }
      const before = original(n);
      if (value === FAILED || before === FAILED) {
        if (value !== before) return false;
      } else if (!sameValue(before, value)) return false;
    }
    return true;
  };

  // 出た項目をまとめて取り除いても結果が変わらないよう、逐次除去で判定する（31 番）: 使われないことが分かった規則
  // （shadowed など）を先に取り除き、毎年の月日 → 繰り返しの規則 → 個別の日付の順に 1 つずつ、それまでに出た規則を
  // 取り除いた設定で判定する。取り除いた規則があれば、その前に取り除けなかった規則も取り除けるようになりうるので、
  // 取り除ける規則がなくなるまで繰り返す（出た項目をまとめて取り除いた設定で、ほかの規則はどれも取り除けない）。報告は配列の順
  /** 出た規則と、その時点で決めていた日（relatedPath を求めるため） */
  const reported = new Map<
    DecidingRule<Value>,
    { readonly message: string; readonly decided: readonly number[] }
  >();
  const gone = (r: DecidingRule<Value>): boolean => unused.has(r) || reported.has(r);
  /** 出た規則を取り除いた設定（keepDates が false なら個別の日付も除く） */
  const current = (keepDates: boolean): CompiledSchedule<Value, Kind> => ({
    ...compiled,
    dates: keepDates ? dates.filter((r) => !gone(r)) : [],
    annual: annual.filter((r) => !gone(r)),
    recurring: recurring.filter((r) => !gone(r)),
  });

  // 個別の日付は、その期間を調べる（対応年の外で例外になる日は除く）。第 n 営業日を数える規則があれば、
  // 決めている日がなくても数え方を変えるので、期間の日を含む月・週の日をすべて調べる
  const judgeDate = (rule: DateRule<Value>): boolean => {
    const base = current(true);
    const resolve = createResolver(base, lookup);
    const decided: number[] = [];
    const span: number[] = [];
    let checked = 0;
    const last = Math.min(rule.to, rule.from + MAX_DATE_RULE_DAYS - 1);
    for (let n = rule.from; n <= last; n++) {
      span.push(n);
      let decidedBy: DecidingRule<Value> | null;
      try {
        decidedBy = resolve(fromDayNumber(n)).rule;
      } catch {
        continue;
      }
      checked++;
      if (decidedBy === rule) decided.push(n);
    }
    // 決めていた日の元の結果はその規則の値なので、判定し直さない
    const ok =
      counting.length > 0
        ? redundant(rule, base, countingUnits(span), originalOf(resolve))
        : redundant(rule, base, decided, () => rule.value);
    if (checked === 0 || !ok) return false;
    affected = counting.length > 0 ? countingUnits(span) : [];
    reported.set(rule, {
      message:
        decided.length === 0
          ? "This rule is never used: earlier rules cover all of its days"
          : "Removing this rule does not change any result",
      decided,
    });
    return true;
  };

  // 毎年の月日・繰り返しの規則は、調べる期間の全日を調べる。個別の日付は有限なので除いて調べる
  // （第 n 営業日を数える規則があれば、個別の日付が数え方を変えるので残す）
  const candidates = window
    ? [...annual, ...recurring].filter((r) => !unused.has(r) && !unsure("redundant", r.path))
    : [];
  /** 今の設定で各規則が決める日（調べる期間の日だけ。規則を取り除いたら、変わりうる日だけ判定し直す） */
  let decided: Map<DecidingRule<Value>, Set<number>> | undefined;
  /** 決める日を求めたときに判定できなかった日（どの規則も決めていない。取り除いた後も判定し直さない） */
  const unjudged = new Set<number>();
  const inWindow = (n: number): boolean =>
    window !== undefined && window.ranges.some((r) => r.from <= n && n <= r.to);
  const decidedIn = (rule: DecidingRule<Value>): Set<number> => {
    if (!decided && window) {
      const map = new Map<DecidingRule<Value>, Set<number>>(candidates.map((r) => [r, new Set()]));
      const resolveNow = createResolver(current(counting.length > 0), lookup);
      eachDay(window, (n) => {
        let by: DecidingRule<Value> | null;
        try {
          by = resolveNow(fromDayNumber(n)).rule;
        } catch {
          unjudged.add(n);
          return;
        }
        if (by) map.get(by)?.add(n);
      });
      decided = map;
    }
    return decided?.get(rule) ?? new Set();
  };
  /**
   * 規則を取り除いた後、変わりうる日（取り除いた規則が決めていた日と、判定で調べた日）の決める規則を判定し直す。
   * 決める日を求めたときに判定できなかった日は、どの規則も決めていないので飛ばす。ほかの日は投げない: refresh が判定し直す
   * 日は、直前の redundant() が同じ設定（without(base, rule)）で評価して投げなかった日だけ。redundant() は投げた日を
   * FAILED として「変わった」側に倒すので、投げる日のある規則は取り除かれず、ここには届かない。元の設定で判定できなかった
   * 日は、取り除いた後に判定できるようになっても判定し直さない（約束は、判定できる日の結果についてのみ）
   */
  const refresh = (affected: Iterable<number>): void => {
    if (!decided) return;
    const resolveNow = createResolver(current(counting.length > 0), lookup);
    for (const n of affected) {
      if (!inWindow(n) || unjudged.has(n)) continue;
      for (const days of decided.values()) days.delete(n);
      const by = resolveNow(fromDayNumber(n)).rule;
      if (by) decided.get(by)?.add(n);
    }
  };
  /**
   * 元の設定の結果（日ごとに 1 回だけ判定する）。出た規則を取り除いても、調べた日の結果は変わらず、ほかの日は取り除いた規則に
   * 左右されないので、取り除いた後も同じものを使う
   */
  const originalNow = originalOf(createResolver(current(counting.length > 0), lookup));
  /** 毎年の月日が当てはまる日を含む月・週（第 n 営業日を数える規則があるとき、取り除くと変わりうる日） */
  const unitsOf = new Map<AnnualRule<Value>, Set<number>>();
  const annualUnits = (rule: AnnualRule<Value>): Set<number> => {
    // 規則と調べる期間だけで決まるので、走査を繰り返しても 1 回だけ求める
    const known = unitsOf.get(rule);
    if (known) return known;
    const matched: number[] = [];
    if (window)
      eachDay(window, (n) => {
        if (matchMonthDay(rule, fromDayNumber(n).slice(5))) matched.push(n);
      });
    const units = countingUnits(matched);
    unitsOf.set(rule, units);
    return units;
  };
  const judgeRule = (rule: DecidingRule<Value>): boolean => {
    if (!window) return false;
    const days = [...decidedIn(rule)];
    const base = current(counting.length > 0);
    const checkedDays =
      counting.length > 0 && annual.includes(rule as AnnualRule<Value>)
        ? annualUnits(rule as AnnualRule<Value>)
        : days;
    const ok =
      checkedDays === days
        ? redundant(rule, base, days, () => rule.value)
        : redundant(rule, base, checkedDays, originalNow);
    if (!ok) return false;
    affected = [...days, ...checkedDays];
    reported.set(rule, {
      message:
        days.length === 0
          ? `This rule is never used: other rules decide every day it matches (checked ${window.label})`
          : `Removing this rule does not change any result (checked ${window.label})`,
      decided: days,
    });
    return true;
  };

  // 毎年の月日・繰り返しの規則を先に判定する。第 n 営業日を数える規則がないときは個別の日付を除いて判定するので、個別の
  // 日付の判定に依存しない。あるときは日付を残して判定し、日付を取り除いた後は、調べた月・週の日を判定し直す（refresh）
  // 1 回の走査で 1 件以上取り除かなければ終わるので、走査の回数は候補の数 + 1 を超えない（超えたら作りの誤り）。
  // 最後に取り除いた後に判定した規則は、同じ設定で判定し直しても同じなので、次の走査では飛ばす（version で数える）
  const maxPasses = candidates.length + dates.length + 1;
  let version = 0;
  const judgedAt = new Map<DecidingRule<Value>, number>();
  /** 最後に取り除いた規則で変わりうる日（判定した関数が入れる） */
  let affected: Iterable<number> = [];
  const judge = (rule: DecidingRule<Value>, run: (r: DecidingRule<Value>) => boolean): void => {
    if (gone(rule) || judgedAt.get(rule) === version) return;
    judgedAt.set(rule, version);
    if (!run(rule)) return;
    version++;
    refresh(affected);
  };
  for (let passes = 0, before = -1; before !== version;) {
    if (++passes > maxPasses)
      throw internalError("redundant: the sequential removal did not converge");
    before = version;
    for (const rule of candidates) judge(rule, judgeRule);
    for (const rule of dates)
      if (!unsure("redundant", rule.path)) judge(rule, (r) => judgeDate(r as DateRule<Value>));
  }
  if (reported.size === 0) return;
  // relatedPath は、出た規則をすべて取り除いた設定で、その規則が決めていた日を決める規則（1 つに定まるときだけ。
  // 曜日・祝日の扱いが決める日や、判定できない日があれば付けない）
  const resolveFinal = createResolver(current(true), lookup);
  const relatedOf = (days: readonly number[]): string | undefined => {
    const paths = new Set<string | null>();
    for (const n of days) {
      try {
        paths.add(resolveFinal(fromDayNumber(n)).rule?.path ?? null);
      } catch {
        paths.add(null);
      }
    }
    const [only] = paths;
    return paths.size === 1 && only !== null ? only : undefined;
  };
  for (const rule of [...dates, ...candidates]) {
    const found = reported.get(rule);
    if (found) c.info("redundant", rule.path, found.message, relatedOf(found.decided));
  }
}

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
  if (!isOptionsObject(options)) {
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
      `asOf must be a date string "YYYY-MM-DD": ${describeValue(asOf)}`,
    );
  }
  return { asOf: toDayNumber(asOf) };
}

/**
 * 基準日より前に終わった規則・日付を expired にする（暦日の大小比較だけで、祝日は引かない）。終わりの日の後にも結果に影響しうる
 * 項目（"after-holiday" の振替、第 n 営業日を数える規則の基準になる日付）は、影響しうる最後の日で比べる（30 番）
 */
function checkExpired<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
  asOf: number,
): void {
  /** last は終わりの日、reach は結果に影響しうる最後の日、why はその理由（reach が last より後のとき） */
  const ended = (path: string, last: number, what: string, reach = last, why = ""): void => {
    if (reach < asOf) {
      const until =
        reach > last ? ` (it could affect results until ${fromDayNumber(reach)}: ${why})` : "";
      c.info(
        "expired",
        path,
        `This ${what} ended on ${fromDayNumber(last)}${until}, before ${fromDayNumber(asOf)}; it no longer affects results and can be removed if the past need not be reproduced`,
      );
    }
  };
  // 自分の設定を基準に第 n 営業日を数える規則（16 番）があれば、個別の日付・毎年の月日は数え方を変えるので、終わりの日の後も、
  // その日の属する月（月の規則）・その日から 6 日後まで（週の規則）の結果に影響しうる（安全側。祝日を引かない）
  const counting = compiled.recurring.filter((r) => r.businessDays !== null && r.basis === null);
  const byMonth = counting.some((r) => r.weekStart === null);
  const byWeek = counting.some((r) => r.weekStart !== null);
  const countedReach = (last: number): number => {
    let reach = last;
    if (byMonth) {
      const { year, month } = parseDate(fromDayNumber(last));
      reach = toDayNumber(formatDate(year, month, lengthOfMonth(year, month)));
    }
    return byWeek ? Math.max(reach, last + 6) : reach;
  };
  const COUNTED = "a rule counting the business days of a month or week counts it";
  for (const r of compiled.dates) ended(r.path, r.to, "date", countedReach(r.to), COUNTED);
  for (const r of compiled.annual)
    if (r.effectiveTo !== null)
      ended(r.path, r.effectiveTo, "rule", countedReach(r.effectiveTo), COUNTED);
  // "after-holiday" の規則は振替元の日で有効期間を判定するので（13 番）、終わりの日の後にも振替先の日がありうる。
  // 祝日を引かずに済むよう、振替が届きうる最も遠い日（MAX_HOLIDAY_RUN 日後）を終わりとする（安全側。30 番）。
  // 繰り返しの規則は、数える規則の基準（繰り返しの規則を除いた設定）に入らないので、数え方は変えない
  for (const r of compiled.recurring)
    if (r.effectiveTo !== null)
      ended(
        r.path,
        r.effectiveTo,
        "rule",
        r.holidayOverlapPolicy === "after-holiday"
          ? r.effectiveTo + MAX_HOLIDAY_RUN
          : r.effectiveTo,
        `a day moved by "after-holiday" falls at most ${MAX_HOLIDAY_RUN} days after it`,
      );
}

/**
 * 判定に祝日を使わない設定（提供元がない、または結果が祝日に依存しない設定。schedule.ts の resultIgnoresHolidays。
 * 判定が未確定の祝日で投げるかも同じ関数で決める）の unconfirmedHolidayPolicy: "throw" は、結果に影響しないので redundant にする。dayInfoOn が holiday を付けるために祝日を引くので実行時には投げるが、
 * 投げても結果が変わらない設定であることを知らせる
 */
function checkUnconfirmedOption<Value, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<Value, Kind>,
): void {
  if (compiled.source.unconfirmedHolidayPolicy !== "throw") return;
  const noProvider = compiled.source.providers.length === 0;
  const holidayUnused = resultIgnoresHolidays(compiled);
  if (!noProvider && !holidayUnused) return;
  c.info(
    "redundant",
    "unconfirmedHolidayPolicy",
    noProvider
      ? 'unconfirmedHolidayPolicy: "throw" has no effect: there is no holiday provider'
      : `unconfirmedHolidayPolicy: "throw" has no effect on results: holidays are not used (holidayPolicy: "ignore" and no holiday-based, "after-holiday" or "over-holiday" rule); dayInfoOn still throws when it looks up the holiday to report`,
  );
}

/** 診断を実行する。祝日の提供元の誤り（年ごとに初めて使うときに分かる）も error として返す */
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
      // 作りの誤りは、提供元の誤りとして報告すると隠れるので、そのまま投げる
      if (error instanceof InternalError) throw error;
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
