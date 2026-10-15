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
 *     never-matches  … 当てはまる日がない繰り返しの規則（2 月 30 日など）
 *     out-of-range   … 個別の日付が祝日の提供元の対応年の外にある（relatedPath に提供元）
 *     no-business-day … 営業日が 1 日もない設定（営業日カレンダーのみ）
 * - info    … redundant: 取り除いても結果が変わらない規則
 *
 * 判定の順番（個別の日付 → 毎年の月日 → 繰り返し（over）→ 祝日 → 繰り返し（under・振替先）→ 曜日）は
 * 固定なので、shadowed は同じ種類の規則どうしに限って調べる。種類をまたいで使われない規則は
 * redundant（取り除いても結果が変わらない）として見つかる。
 */

import { daysInMonth, fromDayNumber, parseDate, toDayNumber } from "./date.ts";
import { compileCalendarOptions, type CalendarOptions } from "./calendar.ts";
import { IssueCollector, type KnownErrorCode } from "./errors.ts";
import {
  compileScheduleOptions,
  createHolidayLookup,
  createResolver,
  matchAnnual,
  matchRecurring,
  type AnnualRule,
  type CompiledSchedule,
  type DecidingRule,
  type HolidaySource,
  type RecurringRuleCompiled,
  type ScheduleOptions,
} from "./schedule.ts";

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
  /** 同じ種類の先の規則に完全に覆われ、決して使われない */
  | "shadowed"
  /** 当てはまる日がない繰り返しの規則 */
  | "never-matches"
  /** 取り除いても結果が変わらない */
  | "redundant";

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
  /** 設定の中の位置（例: "closedRecurring[1]"・"closedDates[0].date"）。設定全体なら "" */
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
  const lower = key.toLowerCase();
  const sameCase = known.find((k) => k.toLowerCase() === lower);
  if (sameCase !== undefined) return sameCase;
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
  if (best !== undefined) return best;
  if (key.length >= 4) return known.find((k) => k.toLowerCase().startsWith(lower));
  return undefined;
}

// ------------------------------------------------------------
// 調べる期間
// ------------------------------------------------------------

/** 繰り返しの規則の当てはまり方は、年の種類（1 月 1 日の曜日 × うるう年か）の 14 通りで決まる。28 年でそろう */
const PATTERN_FROM = toDayNumber("2001-01-01");
const PATTERN_TO = toDayNumber("2028-12-31");

/** 祝日の提供元があるときに調べる年の上限（長すぎる対応年は 1900〜2099 年に絞る） */
const MAX_WINDOW_YEARS = 200;
/** 個別の日付の期間で、取り除いた結果と比べる最大日数 */
const MAX_DATE_RULE_DAYS = 366 * MAX_WINDOW_YEARS;

interface Window {
  readonly from: number;
  readonly to: number;
  readonly label: string;
}

/** 長すぎる年の範囲を 1900〜2099 年（重ならなければ先頭の 200 年）に絞る */
function clipYears(from: number, to: number): [number, number] {
  if (to - from + 1 <= MAX_WINDOW_YEARS) return [from, to];
  const a = Math.max(from, 1900);
  const b = Math.min(to, 2099);
  return a <= b ? [a, b] : [from, from + MAX_WINDOW_YEARS - 1];
}

/** 毎年の月日・繰り返しの規則を調べる期間（祝日が年ごとに変わるので、提供元の対応年を使う） */
function scanWindow(source: HolidaySource<string>): Window | undefined {
  if (source.providers.length === 0) {
    return { from: PATTERN_FROM, to: PATTERN_TO, label: "2001-2028" };
  }
  const ranges = source.providers.map((p) => p.supportedYears);
  let from: number;
  let to: number;
  if (source.outOfRange === "ignore") {
    from = Math.min(...ranges.map((r) => r.from));
    to = Math.max(...ranges.map((r) => r.to));
  } else {
    from = Math.max(...ranges.map((r) => r.from));
    to = Math.min(...ranges.map((r) => r.to));
  }
  if (from > to) return undefined;
  [from, to] = clipYears(from, to);
  return {
    from: toDayNumber(`${String(from).padStart(4, "0")}-01-01`),
    to: toDayNumber(`${String(to).padStart(4, "0")}-12-31`),
    label: `${from}-${to}`,
  };
}

// ------------------------------------------------------------
// 規則の当てはまる日（覆われているかの判定用）
// ------------------------------------------------------------

/** 繰り返しの規則が当てはまる日（代表の 28 年間）。祝日・振替は考えない */
function recurringMatches(rule: RecurringRuleCompiled<unknown>): Uint8Array {
  const bits = new Uint8Array(PATTERN_TO - PATTERN_FROM + 1);
  for (let n = PATTERN_FROM; n <= PATTERN_TO; n++) {
    if (matchRecurring(rule, fromDayNumber(n))) bits[n - PATTERN_FROM] = 1;
  }
  return bits;
}

/** 毎年の月日の規則が当てはまる月日（うるう年の 366 日） */
const LEAP_MONTH_DAYS: readonly string[] = (() => {
  const list: string[] = [];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth(2028, m); d++) {
      list.push(`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return list;
})();

function annualMatches(rule: AnnualRule<unknown>): Uint8Array {
  return Uint8Array.from(LEAP_MONTH_DAYS, (md) => (matchAnnual(rule, md) ? 1 : 0));
}

const isEmpty = (bits: Uint8Array): boolean => bits.every((b) => b === 0);
/** a が当てはまる日に、b もすべて当てはまるか（a ⊆ b） */
const isSubset = (a: Uint8Array, b: Uint8Array): boolean =>
  a.every((v, i) => v === 0 || b[i] === 1);

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
  switch (later.onHolidayRule) {
    case "over-holiday":
      return earlier.onHolidayRule === "over-holiday";
    case "under-holiday":
      return earlier.onHolidayRule !== "after-holiday";
    case "after-holiday":
      return earlier.onHolidayRule === "after-holiday";
    default: {
      const unreachable: never = later.onHolidayRule;
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

function without<T, Kind extends string>(
  compiled: CompiledSchedule<T, Kind>,
  rule: DecidingRule<T> | null,
  dropDates: boolean,
): CompiledSchedule<T, Kind> {
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
    const path = source.providers.length === 1 ? "holidays" : `holidays[${i}]`;
    const lookup = createHolidayLookup({ ...source, providers: [provider], outOfRange: "ignore" });
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

function analyze<T, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<T, Kind>,
  isCalendar: boolean,
): void {
  const { source, dates, annual, recurring } = compiled;
  if (!checkProviderData(c, source as HolidaySource<string>)) return;
  const lookup = createHolidayLookup(source);
  const window = scanWindow(source as HolidaySource<string>);
  /** 使われないことが分かった規則（redundant を重ねて出さない） */
  const unused = new Set<DecidingRule<T>>();

  // --- 個別の日付: 対応年の外・覆われている ---
  dates.forEach((rule, j) => {
    const fromYear = yearOf(rule.from);
    const toYear = yearOf(rule.to);
    source.providers.forEach((p, i) => {
      const { from, to } = p.supportedYears;
      if (fromYear >= from && toYear <= to) return;
      const related = source.providers.length === 1 ? "holidays" : `holidays[${i}]`;
      c.warning(
        "out-of-range",
        rule.path,
        `The date is outside the years supported by holiday provider ${p.id} (${from}-${to}); ` +
          (source.outOfRange === "throw"
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

  // --- 毎年の月日: 覆われている ---
  const annualBits = annual.map(annualMatches);
  annual.forEach((rule, j) => {
    const k = annualBits.findIndex((bits, i) => i < j && isSubset(annualBits[j]!, bits));
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
  const recurringBits = recurring.map(recurringMatches);
  recurring.forEach((rule, j) => {
    const bits = recurringBits[j]!;
    if (isEmpty(bits)) {
      unused.add(rule);
      c.warning(
        "never-matches",
        rule.path,
        "This rule matches no day (for example, a day that does not exist in the selected months)",
      );
      return;
    }
    const k = recurring.findIndex(
      (r, i) => i < j && canCover(r, rule) && isSubset(bits, recurringBits[i]!),
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
    for (let n = window.from; n <= window.to && !found; n++) {
      if (resolve(fromDayNumber(n)).day.value === true) found = true;
    }
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
  const redundant = (rule: DecidingRule<T>, base: CompiledSchedule<T, Kind>, days: number[]) => {
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
      let decidedBy: DecidingRule<T> | null;
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
  const decided = new Map<DecidingRule<T>, number[]>(candidates.map((r) => [r, []]));
  for (let n = window.from; n <= window.to; n++) {
    const rule = resolveBase(fromDayNumber(n)).rule;
    if (rule) decided.get(rule)?.push(n);
  }
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
function run<T, Kind extends string>(
  c: IssueCollector,
  compiled: CompiledSchedule<T, Kind> | undefined,
  isCalendar: boolean,
): readonly Diagnostic[] {
  if (compiled && !c.hasErrors) {
    const before = c.issues.length;
    try {
      analyze(c, compiled, isCalendar);
    } catch (error) {
      // 規則どうしの診断の途中の結果は、提供元の誤りで信頼できないので捨てる
      c.issues.length = before;
      const code = (error as { code?: unknown } | null)?.code;
      c.error(
        code === "out-of-range" ? "out-of-range" : "invalid-provider-data",
        "holidays",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return Object.freeze(
    c.issues.map(({ unknownKey, knownKeys, ...issue }) => {
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
export function diagnoseCalendar(options: CalendarOptions | object = {}): readonly Diagnostic[] {
  const c = new IssueCollector();
  const compiled = compileCalendarOptions<string>(c, options);
  return run(c, compiled?.schedule, true);
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
): readonly Diagnostic[] {
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<unknown, string>(c, options);
  return run(c, compiled, false);
}
