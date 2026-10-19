/**
 * 日ごとに値を返すスケジュール（営業時間・受付枠など、曜日・祝日・特定日で変わるもの）。
 *
 * 1 日の値は次の優先順位で決まる（上が優先）:
 *   1. dates   … 個別の日付・期間（配列で先に書いたものが優先）
 *   2. annual  … 毎年の月日・月日の期間（年をまたぐ期間も可。配列で先に書いたものが優先）
 *   3. recurring（onHolidayRule: "over-holiday"）… 祝日でも当てはめる繰り返しの規則
 *   4. 祝日     … holiday の規則（"weekday": 曜日どおり / { sameAs: 曜日 }: その曜日の値 / { value }: 指定の値）
 *   5. recurring（"under-holiday"・"after-holiday" の振替先）… 繰り返しの規則（配列で先に書いたものが優先）
 *   6. weekly  … 曜日ごとの値
 *
 * "under-holiday" の規則は、祝日の扱いが "weekday"（曜日どおり）なら祝日にも当てはまる。
 * "after-holiday" の規則は、祝日には当てはめず、その日以降で最初の祝日でない日に当てはめる（振替）。
 * 毎年の月日・繰り返しの規則の有効期間（effectiveFrom・effectiveTo）の外では、その規則は書かれていないのと同じ。
 * 祝日の翌日の規則（dayAfterHoliday）は、前日が祝日でその日自身は祝日でない日に当てはまる（提供元の祝日だけで判定）。
 * 祝日の規則（holiday: true。kinds で種別を絞れる）は、「祝日の上」の段階で判定する
 *
 * 営業日カレンダー（createCalendar）は、このスケジュールの真偽値版として作られている。
 */

import {
  addDays,
  daysInMonth,
  fromDayNumber,
  isValidDate,
  parseDate,
  toDayNumber,
  weekdayOf,
  type DateString,
  type Weekday,
} from "./date.ts";
import { checkUnknownKeys, IssueCollector, rangeError, type KnownErrorCode } from "./errors.ts";
import {
  instantToCivil,
  toCivil,
  toDateTimeParts,
  validateTimeZone,
  type CivilDateTimeParts,
  type DateInput,
  type DateTimeInput,
} from "./input.ts";

export type { CivilDateTimeParts } from "./input.ts";
import type { Holiday, HolidayProvider } from "./types.ts";

// ------------------------------------------------------------
// 公開する型
// ------------------------------------------------------------

/**
 * 祝日の値の決め方（スケジュールの holiday の設定）。
 * @public
 */
export type HolidayValueRule<T> =
  /** 祝日を考えず、曜日の値を使う */
  | "weekday"
  /** 指定した曜日の値を使う（例: 祝日は日曜日の営業時間） */
  | { readonly sameAs: Weekday }
  /** 指定した値を使う */
  | { readonly value: T };

/**
 * 月の第 n 回目（1〜5）。-1 は最終（その月の最後のその曜日）。
 * @public
 */
export type Nth = 1 | 2 | 3 | 4 | 5 | -1;

/**
 * 月の日（1〜31）。-1 は末日。
 * @public
 */
export type DayOfMonth =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | -1;

/**
 * 月（1〜12）。
 * @public
 */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * 繰り返しの規則が祝日に当たったときの扱い。
 * - "under-holiday": 祝日の下。祝日の扱いに従う（既定）
 * - "over-holiday": 祝日の上。祝日でも当てはめる
 * - "after-holiday": 祝日の後。祝日には当てはめず、祝日でない翌日に振り替える
 * @public
 */
export type OnHolidayRule = "under-holiday" | "over-holiday" | "after-holiday";

/**
 * 規則の有効期間（両端を含む "YYYY-MM-DD"）。期間の外では、その規則は書かれていないのと同じに扱う。
 * @public
 */
export interface EffectivePeriod {
  /** この日から有効（省略時は期限なし） */
  readonly effectiveFrom?: DateString;
  /** この日まで有効（省略時は期限なし） */
  readonly effectiveTo?: DateString;
}

/**
 * 曜日の繰り返し。nth を省略すると毎週、指定すると月の第 n 回目（例: 第 3 水曜日）。
 * interval と anchor を指定すると、anchor と同じ曜日で、anchor から interval 週おきの日（例: 隔週水曜日）。
 * @public
 */
export interface WeekdayPattern {
  readonly weekday: Weekday;
  /** 月の第 n 回目（その月で n 回目のその曜日。1〜7 日が第 1）。配列で複数指定できる。interval とは併用できない */
  readonly nth?: Nth | readonly Nth[];
  /** 周期（週）。2 以上の整数。anchor と一緒に指定する（例: 2 で隔週） */
  readonly interval?: number;
  /**
   * 周期の起点の日付 "YYYY-MM-DD"（weekday と同じ曜日）。この日の前後に interval 週おきに当てはまる。
   * 起点より前の日にも当てはまるので、起点から始めるには effectiveFrom を併せて指定する
   */
  readonly anchor?: DateString;
  /** 当てはめる月（省略時はすべての月） */
  readonly months?: readonly Month[];
  readonly day?: never;
  readonly dayAfterHoliday?: never;
  readonly holiday?: never;
}

/**
 * 毎月の日の繰り返し（例: 毎月 20 日、毎月末日）。その月にない日（2 月 30 日など）は当てはまらない。
 * @public
 */
export interface DayOfMonthPattern {
  /** 月の日（1〜31、-1 は末日）。配列で複数指定できる */
  readonly day: DayOfMonth | readonly DayOfMonth[];
  /** 当てはめる月（省略時はすべての月） */
  readonly months?: readonly Month[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayAfterHoliday?: never;
  readonly holiday?: never;
}

/**
 * 祝日の翌日（祝日が続く場合は連休が明けた日。その日自身は祝日でない）。「祝日」は提供元の祝日だけ。
 * 当てはまる日は祝日でないので、onHolidayRule は指定できない（指定すると invalid-option）。
 * @public
 */
export interface DayAfterHolidayPattern {
  readonly dayAfterHoliday: true;
  /** 当てはめる月（翌日の月。省略時はすべての月） */
  readonly months?: readonly Month[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly day?: never;
  readonly holiday?: never;
}

/**
 * 祝日（提供元の祝日である日）。kinds で祝日の種別を絞れる（省略時はすべての祝日）。
 * 「祝日の上」の段階（holidayPolicy・スケジュールの holiday より先）で判定し、祝日の既定の扱いの例外を書く
 * （例: 「2027 年 4 月から祝日も営業」「振替休日は診療」「5 月の祝日は特別営業時間」）。
 * 当てはまる日は祝日なので、onHolidayRule は指定できない（指定すると invalid-option）。
 * @public
 */
export interface HolidayPattern {
  readonly holiday: true;
  /** 当てはめる祝日の種別（Holiday.kind。省略時はすべて） */
  readonly kinds?: readonly string[];
  /** 当てはめる月（省略時はすべての月） */
  readonly months?: readonly Month[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly day?: never;
  readonly dayAfterHoliday?: never;
}

/**
 * 繰り返しのパターン。
 * @public
 */
export type RecurringPattern =
  | WeekdayPattern
  | DayOfMonthPattern
  | DayAfterHolidayPattern
  | HolidayPattern;

/**
 * 繰り返しの規則（営業日カレンダーの closedRecurring・openRecurring）。
 * @public
 */
export type RecurringRule = RecurringPattern &
  EffectivePeriod & {
    readonly name?: string;
    /** 祝日に当たったときの扱い（既定: "under-holiday"） */
    readonly onHolidayRule?: OnHolidayRule;
  };

/**
 * 繰り返しの規則の値（スケジュールの recurring）。
 * @public
 */
export type RecurringValue<T> = RecurringRule & { readonly value: T };

/**
 * 毎年の月日 "MM-DD" の値。
 * @public
 */
export interface AnnualValue<T> extends EffectivePeriod {
  readonly date: string;
  readonly value: T;
  readonly name?: string;
}

/**
 * 毎年の月日の期間の値（from > to なら年をまたぐ。例: 12-31 〜 01-03）。
 * @public
 */
export interface AnnualRangeValue<T> extends EffectivePeriod {
  readonly from: string;
  readonly to: string;
  readonly value: T;
  readonly name?: string;
}

/**
 * 個別の日付 "YYYY-MM-DD" の値。
 * @public
 */
export interface DateValue<T> {
  readonly date: DateString;
  readonly value: T;
  readonly name?: string;
}

/**
 * 個別の日付の期間（両端を含む）の値。
 * @public
 */
export interface DateRangeValue<T> {
  readonly from: DateString;
  readonly to: DateString;
  readonly value: T;
  readonly name?: string;
}

/**
 * 祝日の提供元とタイムゾーンの設定（スケジュールと営業日カレンダーで共通）。
 * @public
 */
export interface HolidaySourceOptions<Kind extends string = string> {
  /** 祝日の提供元（例: jp）。複数渡すと和集合になる */
  readonly holidays?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
  /**
   * 日時の入力（Date・オフセット付き文字列など）を暦日に変換するタイムゾーン。
   * 省略時は祝日の提供元のタイムゾーン、提供元もなければ "UTC"
   */
  readonly timeZone?: string;
  /** 祝日の提供元の対応年を外れた日付の扱い（既定: "throw"） */
  readonly outOfRange?: "throw" | "ignore";
}

/**
 * スケジュールの設定。
 * @public
 */
export interface ScheduleOptions<
  T,
  Kind extends string = string,
> extends HolidaySourceOptions<Kind> {
  /** 曜日ごとの値（[日, 月, 火, 水, 木, 金, 土]） */
  readonly weekly: readonly [T, T, T, T, T, T, T];
  /** 祝日の値の決め方（既定: "weekday"） */
  readonly holiday?: HolidayValueRule<T>;
  /** 繰り返しの規則（毎週・毎月の第 n 曜日・毎月の日）の値 */
  readonly recurring?: readonly RecurringValue<T>[];
  /** 毎年の月日の値 */
  readonly annual?: readonly (AnnualValue<T> | AnnualRangeValue<T>)[];
  /** 個別の日付の値 */
  readonly dates?: readonly (DateValue<T> | DateRangeValue<T>)[];
}

/**
 * 値を決めた規則（既知の値）。
 * @public
 */
export type KnownScheduleReason = "date" | "annual" | "recurring" | "holiday" | "weekday";

/**
 * 値を決めた規則。将来の版で値が増えることがあるので、分岐では「その他」も扱うこと。
 * すべての値を網羅したことを型で確かめたい場合は KnownScheduleReason を使う。
 * @public
 */
export type ScheduleReason = KnownScheduleReason | (string & {});

/**
 * 1 日分の値と、その値を決めた規則。
 * @public
 */
export interface ScheduleDay<T, Kind extends string = string> {
  readonly date: DateString;
  readonly weekday: Weekday;
  readonly value: T;
  /** 値を決めた規則 */
  readonly reason: ScheduleReason;
  /** 値を決めた規則の名前（dates・annual・recurring の name、祝日なら祝日名） */
  readonly name?: string;
  /** その日が祝日なら祝日（holiday の規則に関係なく付く） */
  readonly holiday?: Holiday<Kind>;
  /** 祝日から振り替えられた規則で値が決まった場合、振替の元の日付（onHolidayRule: "after-holiday"） */
  readonly shiftedFrom?: DateString;
  /**
   * 値を決めた規則の設定の中の位置（規則の診断の path と同じ形。例: "recurring[0]"）。
   * dates・annual・recurring（振替先を含む）で決まった日にだけ付き、祝日・曜日で決まった日には付かない
   */
  readonly rulePath?: string;
}

/**
 * 祝日を調べる機能（スケジュールと営業日カレンダーで共通）。
 * @public
 */
export interface HolidayLookup<Kind extends string = string> {
  /** 日時の入力を暦日に変換するタイムゾーン */
  readonly timeZone: string;
  /** 祝日の提供元 */
  readonly providers: readonly HolidayProvider<Kind>[];
  /** 祝日の提供元の対応年を外れた日付の扱い（設定の outOfRange） */
  readonly outOfRange: "throw" | "ignore";

  /** 入力をタイムゾーンでの暦日に変換する */
  dateOf(input: DateInput): DateString;
  /** 入力をタイムゾーンでの暦日と時刻に変換する */
  civilOf(input: DateTimeInput): CivilDateTimeParts<string>;
  civilOf(input: DateInput): CivilDateTimeParts;
  /** 今日の日付（タイムゾーン） */
  today(now?: Date): DateString;

  /** 祝日か */
  isHoliday(input: DateInput): boolean;
  /** 祝日なら祝日を返す */
  getHoliday(input: DateInput): Holiday<Kind> | undefined;
  /** その年の祝日 */
  holidaysInYear(year: number): readonly Holiday<Kind>[];
  /** 期間内の祝日（両端を含む） */
  holidaysBetween(from: DateInput, to: DateInput): readonly Holiday<Kind>[];
}

/**
 * 日ごとに値を返すスケジュール。
 * @public
 */
export interface Schedule<T, Kind extends string = string> extends HolidayLookup<Kind> {
  /** その日の値 */
  valueOn(input: DateInput): T;
  /**
   * その日の値と、値を決めた規則（reason）。reason は値を決めた規則なので、祝日の規則が "weekday"（曜日どおり）の
   * ときは、祝日でも "weekday" になる。祝日かどうかは holiday の有無で判定する
   */
  dayInfo(input: DateInput): ScheduleDay<T, Kind>;
  /** 期間内の日ごとの値と規則（両端を含む。from が to より後ならエラー） */
  daysBetween(from: DateInput, to: DateInput): readonly ScheduleDay<T, Kind>[];
}

// ------------------------------------------------------------
// 入力チェック（誤りを集める。作成時は最初の誤りを例外にする）
// ------------------------------------------------------------

const MONTH_DAY_RE = /^(\d{2})-(\d{2})$/;
const MAX_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** @internal "MM-DD" として正しいか（2 月 29 日は可） */
export function isValidMonthDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = MONTH_DAY_RE.exec(value);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= MAX_DAYS_IN_MONTH[month - 1]!;
}

/** @internal 曜日の番号として正しいか */
export const isWeekday = (value: unknown): value is Weekday =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;

/** @internal 個別の日付の規則（日数で表した期間） */
export interface DateRule<T> {
  /** 設定の中の位置（例: "closedDates[1]"） */
  readonly path: string;
  readonly from: number;
  readonly to: number;
  readonly value: T;
  readonly name: string | undefined;
}

/** @internal 有効期間（日数。省略した側は null） */
export interface CompiledPeriod {
  readonly effectiveFrom: number | null;
  readonly effectiveTo: number | null;
}

/** @internal 毎年の月日の規則 */
export interface AnnualRule<T> extends CompiledPeriod {
  /** 設定の中の位置（例: "closedAnnual[0]"） */
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly value: T;
  readonly name: string | undefined;
}

/** @internal 日数 n が有効期間の中か */
export const inPeriod = (rule: CompiledPeriod, n: number): boolean =>
  (rule.effectiveFrom === null || n >= rule.effectiveFrom) &&
  (rule.effectiveTo === null || n <= rule.effectiveTo);

/** 有効期間（effectiveFrom・effectiveTo）を検証して日数にする（誤りは c に記録して undefined） */
function checkPeriod(
  c: IssueCollector,
  path: string,
  entry: Record<string, unknown>,
): CompiledPeriod | undefined {
  let ok = true;
  const read = (key: "effectiveFrom" | "effectiveTo"): number | null => {
    const raw = entry[key];
    if (raw === undefined) return null;
    const n = checkDate(c, `${path}.${key}`, raw);
    if (n === undefined) ok = false;
    return n ?? null;
  };
  const effectiveFrom = read("effectiveFrom");
  const effectiveTo = read("effectiveTo");
  if (!ok) return undefined;
  if (effectiveFrom !== null && effectiveTo !== null && effectiveFrom > effectiveTo) {
    c.error(
      "invalid-range",
      path,
      `"effectiveFrom" must not be after "effectiveTo" (${String(entry["effectiveFrom"])} > ${String(entry["effectiveTo"])})`,
    );
    return undefined;
  }
  return { effectiveFrom, effectiveTo };
}

function checkName(c: IssueCollector, path: string, name: unknown): string | undefined {
  if (name === undefined) return undefined;
  if (typeof name !== "string") {
    c.error("invalid-option", `${path}.name`, "name must be a string");
    return undefined;
  }
  return name;
}

function checkDate(c: IssueCollector, path: string, value: unknown): number | undefined {
  if (!isValidDate(value)) {
    c.error("invalid-date", path, `Invalid date ${JSON.stringify(value)} (expected YYYY-MM-DD)`);
    return undefined;
  }
  return toDayNumber(value);
}

function checkMonthDay(c: IssueCollector, path: string, value: unknown): string | undefined {
  if (!isValidMonthDay(value)) {
    c.error(
      "invalid-month-day",
      path,
      `Invalid month-day ${JSON.stringify(value)} (expected MM-DD)`,
    );
    return undefined;
  }
  return value;
}

/**
 * @internal 個別の日付の規則を検証して取り込む。
 * entry は "YYYY-MM-DD"・{ date }・{ from, to } のいずれか。値は valueOf で決める
 */
export function compileDateRules<T>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: (entry: Record<string, unknown>, path: string) => T | undefined,
  allowString: boolean,
): DateRule<T>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: DateRule<T>[] = [];
  entries.forEach((raw: unknown, i) => {
    const p = `${path}[${i}]`;
    const entry: unknown = allowString && typeof raw === "string" ? { date: raw } : raw;
    if (!isObject(entry)) {
      c.error(
        "invalid-option",
        p,
        allowString ? "must be a date string or an object" : "must be an object",
      );
      return;
    }
    const value = valueOf(entry, p);
    const name = checkName(c, p, entry["name"]);
    if ("date" in entry) {
      checkUnknownKeys(c, p, entry, ["date", "name", "value"]);
      const n = checkDate(c, `${p}.date`, entry["date"]);
      if (n !== undefined && value !== undefined)
        rules.push({ path: p, from: n, to: n, value, name });
      return;
    }
    if (!("from" in entry) || !("to" in entry)) {
      c.error("invalid-option", p, 'must have "date" or both "from" and "to"');
      return;
    }
    checkUnknownKeys(c, p, entry, ["from", "to", "name", "value"]);
    const from = checkDate(c, `${p}.from`, entry["from"]);
    const to = checkDate(c, `${p}.to`, entry["to"]);
    if (from === undefined || to === undefined) return;
    if (from > to) {
      c.error(
        "invalid-range",
        p,
        `"from" must not be after "to" (${String(entry["from"])} > ${String(entry["to"])})`,
      );
      return;
    }
    if (value !== undefined) rules.push({ path: p, from, to, value, name });
  });
  return rules;
}

/** @internal 毎年の月日の規則を検証して取り込む（entry は "MM-DD"・{ date }・{ from, to }） */
export function compileAnnualRules<T>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: (entry: Record<string, unknown>, path: string) => T | undefined,
  allowString: boolean,
): AnnualRule<T>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: AnnualRule<T>[] = [];
  entries.forEach((raw: unknown, i) => {
    const p = `${path}[${i}]`;
    const entry: unknown = allowString && typeof raw === "string" ? { date: raw } : raw;
    if (!isObject(entry)) {
      c.error(
        "invalid-option",
        p,
        allowString ? "must be a month-day string or an object" : "must be an object",
      );
      return;
    }
    const value = valueOf(entry, p);
    const name = checkName(c, p, entry["name"]);
    const period = checkPeriod(c, p, entry);
    if ("date" in entry) {
      checkUnknownKeys(c, p, entry, ["date", "name", "value", ...PERIOD_KEYS]);
      const md = checkMonthDay(c, `${p}.date`, entry["date"]);
      if (md !== undefined && value !== undefined && period) {
        rules.push({ path: p, from: md, to: md, value, name, ...period });
      }
      return;
    }
    if (!("from" in entry) || !("to" in entry)) {
      c.error("invalid-option", p, 'must have "date" or both "from" and "to"');
      return;
    }
    checkUnknownKeys(c, p, entry, ["from", "to", "name", "value", ...PERIOD_KEYS]);
    const from = checkMonthDay(c, `${p}.from`, entry["from"]);
    const to = checkMonthDay(c, `${p}.to`, entry["to"]);
    if (from !== undefined && to !== undefined && value !== undefined && period) {
      rules.push({ path: p, from, to, value, name, ...period });
    }
  });
  return rules;
}

/** @internal 繰り返しの規則（検証済み） */
export interface RecurringRuleCompiled<T> extends CompiledPeriod {
  /** 設定の中の位置（例: "closedRecurring[0]"） */
  readonly path: string;
  /** 曜日の規則なら曜日、日の規則なら null */
  readonly weekday: Weekday | null;
  /** 第 n 回目の集合（null は毎週） */
  readonly nth: ReadonlySet<number> | null;
  /** 周期（週）。null は毎週・第 n 回目・日の規則 */
  readonly interval: number | null;
  /** 周期の起点（日数）。interval が null なら null */
  readonly anchor: number | null;
  /** 日の集合（曜日の規則では null） */
  readonly days: ReadonlySet<number> | null;
  /** 祝日の翌日の規則か */
  readonly dayAfterHoliday: boolean;
  /** 祝日の規則か */
  readonly holiday: boolean;
  /** 祝日の規則で絞る種別（null はすべての祝日） */
  readonly kinds: ReadonlySet<string> | null;
  /** 月の集合（null はすべての月） */
  readonly months: ReadonlySet<number> | null;
  readonly onHolidayRule: OnHolidayRule;
  readonly value: T;
  readonly name: string | undefined;
}

const NTH_VALUES = [1, 2, 3, 4, 5, -1];
const ON_HOLIDAY_RULES: readonly OnHolidayRule[] = [
  "under-holiday",
  "over-holiday",
  "after-holiday",
];
const isDayOfMonth = (v: unknown): boolean =>
  v === -1 || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31);
const isMonth = (v: unknown): boolean =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;

/** 単独の値または空でない配列を検証し、集合にする（誤りは c に記録して undefined） */
function checkSet(
  c: IssueCollector,
  path: string,
  raw: unknown,
  valid: (v: unknown) => boolean,
  expected: string,
): Set<number> | undefined {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0 || !list.every(valid)) {
    c.error("invalid-option", path, `must be ${expected}, or a non-empty array of them`);
    return undefined;
  }
  return new Set(list as number[]);
}

/** @internal 繰り返しの規則を検証して取り込む */
export function compileRecurringRules<T>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: (entry: Record<string, unknown>, path: string) => T | undefined,
  keys: readonly string[],
): RecurringRuleCompiled<T>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: RecurringRuleCompiled<T>[] = [];
  entries.forEach((entry: unknown, i) => {
    const p = `${path}[${i}]`;
    if (!isObject(entry)) {
      c.error("invalid-option", p, "must be an object");
      return;
    }
    checkUnknownKeys(c, p, entry, keys);
    const value = valueOf(entry, p);
    const name = checkName(c, p, entry["name"]);
    const hasWeekday = "weekday" in entry;
    const hasDay = "day" in entry;
    const hasAfter = "dayAfterHoliday" in entry;
    const hasHoliday = "holiday" in entry;
    if (Number(hasWeekday) + Number(hasDay) + Number(hasAfter) + Number(hasHoliday) !== 1) {
      c.error(
        "invalid-option",
        p,
        'must have exactly one of "weekday", "day", "dayAfterHoliday" or "holiday"',
      );
      return;
    }
    let kinds: Set<string> | null = null;
    let ok = true;
    let weekday: Weekday | null = null;
    let nth: Set<number> | null = null;
    let days: Set<number> | null = null;
    let interval: number | null = null;
    let anchor: number | null = null;
    const hasInterval = "interval" in entry;
    const hasAnchor = "anchor" in entry;
    if (hasWeekday) {
      if (isWeekday(entry["weekday"])) weekday = entry["weekday"];
      else {
        c.error(
          "invalid-weekday",
          `${p}.weekday`,
          "must be an integer from 0 (Sunday) to 6 (Saturday)",
        );
        ok = false;
      }
      if (entry["nth"] !== undefined) {
        const set = checkSet(
          c,
          `${p}.nth`,
          entry["nth"],
          (v) => NTH_VALUES.includes(v as number),
          "1-5 or -1 (last)",
        );
        if (set) nth = set;
        else ok = false;
      }
      if (hasInterval !== hasAnchor) {
        c.error("invalid-option", p, '"interval" and "anchor" must be specified together');
        ok = false;
      } else if (hasInterval) {
        if ("nth" in entry) {
          c.error("invalid-option", `${p}.interval`, '"interval" cannot be used with "nth"');
          ok = false;
        }
        const i = entry["interval"];
        if (!Number.isInteger(i) || (i as number) < 2) {
          c.error("invalid-option", `${p}.interval`, "must be an integer of 2 or more (weeks)");
          ok = false;
        } else interval = i as number;
        const a = checkDate(c, `${p}.anchor`, entry["anchor"]);
        if (a === undefined) ok = false;
        else if (weekday !== null && weekdayOf(entry["anchor"] as DateString) !== weekday) {
          c.error(
            "invalid-option",
            `${p}.anchor`,
            `must be on the same weekday as "weekday" (${String(entry["anchor"])} is weekday ${weekdayOf(entry["anchor"] as DateString)})`,
          );
          ok = false;
        } else anchor = a;
      }
    } else {
      for (const key of ["nth", "interval", "anchor"] as const) {
        if (key in entry) {
          c.error("invalid-option", `${p}.${key}`, `"${key}" can be used only with "weekday"`);
          ok = false;
        }
      }
      if (hasDay) {
        const set = checkSet(c, `${p}.day`, entry["day"], isDayOfMonth, "1-31 or -1 (last day)");
        if (set) days = set;
        else ok = false;
      } else {
        const key = hasAfter ? "dayAfterHoliday" : "holiday";
        if (entry[key] !== true) {
          c.error("invalid-option", `${p}.${key}`, "must be true");
          ok = false;
        }
        if ("onHolidayRule" in entry) {
          c.error(
            "invalid-option",
            `${p}.onHolidayRule`,
            hasAfter
              ? 'cannot be used with "dayAfterHoliday" (the day after a holiday is never a holiday)'
              : 'cannot be used with "holiday" (the rule applies on holidays; it is judged before holidayPolicy)',
          );
          ok = false;
        }
        if (hasHoliday && entry["kinds"] !== undefined && !Array.isArray(entry["kinds"])) {
          c.error(
            "invalid-option",
            `${p}.kinds`,
            "must be a non-empty array of holiday kinds (Holiday.kind)",
          );
          ok = false;
        } else if (hasHoliday && entry["kinds"] !== undefined) {
          const set = checkSet(
            c,
            `${p}.kinds`,
            entry["kinds"],
            (v) => typeof v === "string" && v.length > 0,
            "a non-empty string (Holiday.kind)",
          );
          if (set) kinds = set as unknown as Set<string>;
          else ok = false;
        }
      }
    }
    if (!hasHoliday && "kinds" in entry) {
      c.error("invalid-option", `${p}.kinds`, '"kinds" can be used only with "holiday"');
      ok = false;
    }
    let months: Set<number> | null = null;
    if (entry["months"] !== undefined) {
      if (!Array.isArray(entry["months"])) {
        c.error("invalid-option", `${p}.months`, "must be a non-empty array of months (1-12)");
        ok = false;
      } else {
        const set = checkSet(c, `${p}.months`, entry["months"], isMonth, "a month (1-12)");
        if (set) months = set;
        else ok = false;
      }
    }
    // 祝日の規則は「祝日の上」の段階で判定する（当てはまる日は祝日なので、祝日の下・振替は意味を持たない）
    const onHoliday = entry["onHolidayRule"] ?? (hasHoliday ? "over-holiday" : "under-holiday");
    if (!ON_HOLIDAY_RULES.includes(onHoliday as OnHolidayRule)) {
      c.error(
        "invalid-option",
        `${p}.onHolidayRule`,
        `must be one of ${ON_HOLIDAY_RULES.map((v) => `"${v}"`).join(", ")}`,
      );
      ok = false;
    }
    const period = checkPeriod(c, p, entry);
    if (ok && period && value !== undefined) {
      rules.push(
        Object.freeze({
          path: p,
          weekday,
          nth,
          interval,
          anchor,
          days,
          dayAfterHoliday: hasAfter,
          holiday: hasHoliday,
          kinds,
          months,
          onHolidayRule: onHoliday as OnHolidayRule,
          value,
          name,
          ...period,
        }),
      );
    }
  });
  return rules;
}

/** @internal その日の祝日を返す関数（祝日・祝日の翌日の規則の判定に使う。提供元の対応年の外は祝日でないとみなすこと） */
export type HolidayOf = (date: DateString) => Holiday<string> | undefined;

/**
 * @internal 繰り返しの規則の形（曜日・第 n 回目・周期・日・祝日の翌日・月）がその日に当てはまるか。
 * 有効期間は考えない（規則の診断で、形どうしの包含を調べるために分けている）。
 * 祝日の翌日の規則は isHoliday で判定し、isHoliday を渡さなければ当てはまらない
 */
export function matchPattern(
  rule: RecurringRuleCompiled<unknown>,
  date: DateString,
  holidayOf?: HolidayOf,
): boolean {
  const { year, month, day } = parseDate(date);
  if (rule.months && !rule.months.has(month)) return false;
  if (rule.holiday) {
    const h = holidayOf?.(date);
    return h !== undefined && (rule.kinds === null || rule.kinds.has(h.kind));
  }
  if (rule.dayAfterHoliday) {
    return (
      holidayOf !== undefined &&
      holidayOf(date) === undefined &&
      holidayOf(addDays(date, -1)) !== undefined
    );
  }
  const dim = daysInMonth(year, month);
  if (rule.weekday !== null) {
    if (weekdayOf(date) !== rule.weekday) return false;
    if (rule.interval !== null)
      return (toDayNumber(date) - rule.anchor!) % (7 * rule.interval) === 0;
    if (rule.nth === null) return true;
    return rule.nth.has(Math.ceil(day / 7)) || (rule.nth.has(-1) && day + 7 > dim);
  }
  return rule.days!.has(day) || (rule.days!.has(-1) && day === dim);
}

/** @internal 繰り返しの規則がその日に当てはまるか（有効期間を含む） */
export function matchRecurring(
  rule: RecurringRuleCompiled<unknown>,
  date: DateString,
  holidayOf: HolidayOf,
): boolean {
  return inPeriod(rule, toDayNumber(date)) && matchPattern(rule, date, holidayOf);
}

/** 規則の value を取り出す（value が必須の規則用） */
function requiredValue<T>(c: IssueCollector) {
  return (entry: Record<string, unknown>, path: string): T | undefined => {
    if (!("value" in entry)) {
      c.error("invalid-option", path, 'must have "value"');
      return undefined;
    }
    return entry["value"] as T;
  };
}

function validateProvider(c: IssueCollector, path: string, p: unknown): p is HolidayProvider {
  const bad = (message: string): false => {
    c.error("invalid-provider", path, message);
    return false;
  };
  if (!isObject(p)) return bad("must be a holiday provider object");
  if (typeof p["id"] !== "string" || p["id"] === "") return bad('"id" must be a non-empty string');
  if (typeof p["timeZone"] !== "string") return bad('"timeZone" must be a string');
  try {
    validateTimeZone(p["timeZone"]);
  } catch {
    return bad(`"timeZone" is not a valid IANA time zone: ${JSON.stringify(p["timeZone"])}`);
  }
  const years = p["supportedYears"];
  if (
    !isObject(years) ||
    !Number.isInteger(years["from"]) ||
    !Number.isInteger(years["to"]) ||
    (years["from"] as number) < 1000 ||
    (years["to"] as number) > 9999 ||
    (years["from"] as number) > (years["to"] as number)
  ) {
    return bad(
      '"supportedYears" must be { from, to } with integer years in 1000-9999 and from <= to',
    );
  }
  if (typeof p["dataVersion"] !== "string") return bad('"dataVersion" must be a string');
  if (p["confirmedThrough"] !== undefined && !Number.isInteger(p["confirmedThrough"])) {
    return bad('"confirmedThrough" must be an integer year');
  }
  if (typeof p["holidaysInYear"] !== "function") return bad('"holidaysInYear" must be a function');
  return true;
}

/** @internal 祝日の提供元とタイムゾーンの設定を検証した結果 */
export interface HolidaySource<Kind extends string> {
  readonly providers: readonly HolidayProvider<Kind>[];
  readonly timeZone: string;
  readonly outOfRange: "throw" | "ignore";
}

/** @internal 祝日の提供元とタイムゾーンの設定を検証する */
export function compileHolidaySource<Kind extends string>(
  c: IssueCollector,
  options: Record<string, unknown>,
): HolidaySource<Kind> {
  const raw = options["holidays"];
  const list: unknown[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const providers: HolidayProvider<Kind>[] = [];
  list.forEach((p, i) => {
    const path = Array.isArray(raw) ? `holidays[${i}]` : "holidays";
    if (validateProvider(c, path, p)) providers.push(p as HolidayProvider<Kind>);
  });

  let timeZone = "UTC";
  if (options["timeZone"] !== undefined) {
    try {
      timeZone = validateTimeZone(options["timeZone"] as string);
    } catch {
      c.error(
        "invalid-time-zone",
        "timeZone",
        `Invalid time zone: ${JSON.stringify(options["timeZone"])}`,
      );
    }
  } else {
    const zones = [...new Set(providers.map((p) => validateTimeZone(p.timeZone)))];
    if (zones.length > 1) {
      c.error(
        "time-zone-conflict",
        "timeZone",
        `Holiday providers use different time zones (${zones.join(", ")}); specify timeZone`,
      );
    }
    timeZone = zones[0] ?? "UTC";
  }

  const outOfRange = options["outOfRange"] ?? "throw";
  if (outOfRange !== "throw" && outOfRange !== "ignore") {
    c.error("invalid-option", "outOfRange", 'must be "throw" or "ignore"');
  }
  return {
    providers: Object.freeze(providers),
    timeZone,
    outOfRange: outOfRange === "ignore" ? "ignore" : "throw",
  };
}

// ------------------------------------------------------------
// 祝日を調べる機能
// ------------------------------------------------------------

function providerDataError(provider: HolidayProvider, year: number, message: string): RangeError {
  return rangeError(
    "invalid-provider-data" satisfies KnownErrorCode,
    `Holiday provider ${provider.id} returned invalid data for ${year}: ${message}`,
  );
}

/** 提供元が返したデータを検証し、契約の項目だけを持つ変更できないオブジェクトにする */
function loadProviderYear<Kind extends string>(
  provider: HolidayProvider<Kind>,
  year: number,
): Holiday<Kind>[] {
  const list: unknown = provider.holidaysInYear(year);
  if (!Array.isArray(list))
    throw providerDataError(provider, year, "holidaysInYear must return an array");
  const seen = new Set<string>();
  return list.map((h: unknown, i) => {
    if (!isObject(h)) throw providerDataError(provider, year, `item ${i} is not an object`);
    const { date, name, nameEn, kind, confirmed } = h;
    if (!isValidDate(date) || parseDate(date).year !== year) {
      throw providerDataError(
        provider,
        year,
        `item ${i} has an invalid date ${JSON.stringify(date)}`,
      );
    }
    if (seen.has(date)) throw providerDataError(provider, year, `duplicate date ${date}`);
    seen.add(date);
    if (typeof name !== "string" || typeof nameEn !== "string" || typeof kind !== "string") {
      throw providerDataError(
        provider,
        year,
        `item ${i} (${date}) must have string name, nameEn and kind`,
      );
    }
    if (typeof confirmed !== "boolean") {
      throw providerDataError(provider, year, `item ${i} (${date}) must have boolean confirmed`);
    }
    const holiday: { -readonly [K in keyof Holiday<Kind>]: Holiday<Kind>[K] } = {
      date,
      name,
      nameEn,
      kind: kind as Kind,
      confirmed,
    };
    if (h["names"] !== undefined) {
      const problem = checkNames(h["names"]);
      if (problem) throw providerDataError(provider, year, `item ${i} (${date}) names: ${problem}`);
      holiday.names = Object.freeze(Object.fromEntries(Object.entries(h["names"] as object)));
    }
    return Object.freeze(holiday);
  });
}

/** 祝日のほかの言語の名称を検証する（誤りがあれば理由を返す） */
function checkNames(names: unknown): string | undefined {
  // 普通のオブジェクト（別の実行環境で作られたものも可）。継承した項目を持つものは受け付けない
  const proto: unknown = isObject(names) ? Object.getPrototypeOf(names) : undefined;
  if (!isObject(names) || (proto !== null && Object.getPrototypeOf(proto) !== null)) {
    return "must be a plain object of { [language tag]: name }";
  }
  for (const [tag, value] of Object.entries(names)) {
    let canonical: string | undefined;
    try {
      canonical = Intl.getCanonicalLocales(tag)[0];
    } catch {
      return `${JSON.stringify(tag)} is not a BCP 47 language tag`;
    }
    if (canonical !== tag) {
      return `${JSON.stringify(tag)} must be written in canonical form ${JSON.stringify(canonical)}`;
    }
    if (typeof value !== "string" || value === "") {
      return `${JSON.stringify(tag)} must be a non-empty string`;
    }
  }
  return undefined;
}

/** @internal 祝日を調べる機能を作る（設定は検証済みであること） */
export function createHolidayLookup<Kind extends string>(
  source: HolidaySource<Kind>,
): HolidayLookup<Kind> & { holidayOn(date: DateString): Holiday<Kind> | undefined } {
  const { providers, timeZone, outOfRange } = source;
  const yearCache = new Map<number, Map<DateString, Holiday<Kind>>>();

  function holidayMap(year: number): Map<DateString, Holiday<Kind>> {
    let map = yearCache.get(year);
    if (!map) {
      map = new Map();
      for (const provider of providers) {
        const { from, to } = provider.supportedYears;
        if (year < from || year > to) {
          if (outOfRange === "ignore") continue;
          throw rangeError(
            "out-of-range",
            `Holidays for ${provider.id} are supported for ${from}-${to}; requested ${year}`,
          );
        }
        for (const h of loadProviderYear(provider, year)) {
          // 同じ日に複数の提供元の祝日がある場合は、先に渡した提供元を優先する
          if (!map.has(h.date)) map.set(h.date, h);
        }
      }
      yearCache.set(year, map);
    }
    return map;
  }

  function holidayOn(date: DateString): Holiday<Kind> | undefined {
    if (providers.length === 0) return undefined;
    return holidayMap(parseDate(date).year).get(date);
  }

  const dateOf = (input: DateInput): DateString => toCivil(input, timeZone).date;

  function holidaysInYear(year: number): readonly Holiday<Kind>[] {
    if (!Number.isInteger(year)) throw rangeError("invalid-argument", `Invalid year: ${year}`);
    return Object.freeze(
      [...holidayMap(year).values()].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
      ),
    );
  }

  return {
    timeZone,
    providers,
    outOfRange,
    holidayOn,
    dateOf,
    civilOf: ((input: DateInput) =>
      toDateTimeParts(input, timeZone)) as HolidayLookup<Kind>["civilOf"],
    today: (now = new Date()) => instantToCivil(now.getTime(), timeZone).date,
    isHoliday: (input) => holidayOn(dateOf(input)) !== undefined,
    getHoliday: (input) => holidayOn(dateOf(input)),
    holidaysInYear,
    holidaysBetween(from, to) {
      const a = dateOf(from);
      const b = dateOf(to);
      if (a > b) throw rangeError("invalid-range", `"from" must not be after "to" (${a} > ${b})`);
      const result: Holiday<Kind>[] = [];
      for (let y = parseDate(a).year; y <= parseDate(b).year; y++) {
        for (const h of holidaysInYear(y)) if (h.date >= a && h.date <= b) result.push(h);
      }
      return Object.freeze(result);
    },
  };
}

// ------------------------------------------------------------
// スケジュールの組み立て
// ------------------------------------------------------------

/** @internal 検証済みのスケジュールの規則 */
export interface CompiledSchedule<T, Kind extends string> {
  readonly source: HolidaySource<Kind>;
  readonly weekly: readonly T[];
  readonly holiday: HolidayValueRule<T>;
  readonly annual: readonly AnnualRule<T>[];
  readonly dates: readonly DateRule<T>[];
  readonly recurring: readonly RecurringRuleCompiled<T>[];
}

const SCHEDULE_OPTION_KEYS = [
  "holidays",
  "timeZone",
  "outOfRange",
  "weekly",
  "holiday",
  "annual",
  "dates",
  "recurring",
];
/** @internal 繰り返しの規則の項目 */
/** @internal 有効期間の項目 */
export const PERIOD_KEYS = ["effectiveFrom", "effectiveTo"];
export const RECURRING_RULE_KEYS = [
  "weekday",
  "nth",
  "interval",
  "anchor",
  "day",
  "dayAfterHoliday",
  "holiday",
  "kinds",
  "months",
  "name",
  "onHolidayRule",
  ...PERIOD_KEYS,
];

/** @internal スケジュールの設定を検証して取り込む（誤りは c に集める） */
export function compileScheduleOptions<T, Kind extends string>(
  c: IssueCollector,
  options: unknown,
): CompiledSchedule<T, Kind> | undefined {
  if (!isObject(options)) {
    c.error("invalid-option", "", "options must be an object");
    return undefined;
  }
  checkUnknownKeys(c, "", options, SCHEDULE_OPTION_KEYS);
  const source = compileHolidaySource<Kind>(c, options);

  const weeklyRaw = options["weekly"];
  let weekly: readonly T[] = [];
  if (!Array.isArray(weeklyRaw) || weeklyRaw.length !== 7) {
    c.error("invalid-option", "weekly", "must have 7 values ([Sunday, Monday, ..., Saturday])");
  } else {
    weekly = Object.freeze([...(weeklyRaw as T[])]);
  }

  let holiday: HolidayValueRule<T> = "weekday";
  const holidayRaw = options["holiday"];
  if (holidayRaw === undefined || holidayRaw === "weekday") {
    holiday = "weekday";
  } else if (isObject(holidayRaw) && "sameAs" in holidayRaw) {
    if (isWeekday(holidayRaw["sameAs"])) holiday = Object.freeze({ sameAs: holidayRaw["sameAs"] });
    else
      c.error(
        "invalid-weekday",
        "holiday.sameAs",
        "must be an integer from 0 (Sunday) to 6 (Saturday)",
      );
  } else if (isObject(holidayRaw) && "value" in holidayRaw) {
    holiday = Object.freeze({ value: holidayRaw["value"] as T });
  } else {
    c.error("invalid-option", "holiday", 'must be "weekday", { sameAs: weekday } or { value }');
  }

  const annual = compileAnnualRules<T>(c, "annual", options["annual"], requiredValue<T>(c), false);
  const dates = compileDateRules<T>(c, "dates", options["dates"], requiredValue<T>(c), false);
  const recurring = compileRecurringRules<T>(
    c,
    "recurring",
    options["recurring"],
    requiredValue<T>(c),
    [...RECURRING_RULE_KEYS, "value"],
  );
  return { source, weekly, holiday, annual, dates, recurring };
}

/** 振替元をさかのぼる最大日数（祝日が続く日数の上限。2019 年の大型連休でも 10 日） */
const MAX_HOLIDAY_RUN = 31;

/** @internal 毎年の月日の規則の形がその月日 "MM-DD" に当てはまるか（有効期間は考えない） */
export function matchMonthDay(rule: AnnualRule<unknown>, monthDay: string): boolean {
  return rule.from <= rule.to
    ? monthDay >= rule.from && monthDay <= rule.to
    : monthDay >= rule.from || monthDay <= rule.to;
}

/** @internal 毎年の月日の規則がその日に当てはまるか（有効期間を含む） */
export function matchAnnual(rule: AnnualRule<unknown>, date: DateString): boolean {
  return inPeriod(rule, toDayNumber(date)) && matchMonthDay(rule, date.slice(5));
}

/** @internal 値を決めた規則（祝日・曜日で決まった場合は null） */
export type DecidingRule<T> = DateRule<T> | AnnualRule<T> | RecurringRuleCompiled<T>;

/** @internal 1 日分の結果と、値を決めた規則 */
export interface Resolution<T, Kind extends string> {
  readonly day: ScheduleDay<T, Kind>;
  readonly rule: DecidingRule<T> | null;
}

type HolidayLookupInternal<Kind extends string> = ReturnType<typeof createHolidayLookup<Kind>>;

/**
 * @internal 検証済みの規則から、1 日分の値と値を決めた規則を返す関数を作る。
 * 規則の診断では、規則を取り除いた版と結果を比べるために、祝日を調べる機能（lookup）を共有して作る
 */
export function createResolver<T, Kind extends string>(
  compiled: CompiledSchedule<T, Kind>,
  lookup: HolidayLookupInternal<Kind>,
): (date: DateString) => Resolution<T, Kind> {
  const { weekly, holiday: holidayRule, annual, dates, recurring } = compiled;
  const hasShift = recurring.some((r) => r.onHolidayRule === "after-holiday");

  /** 振替・祝日の規則の判断に使う祝日。提供元の対応年の外は祝日でないとみなす（振替元をさかのぼる途中で範囲を出る場合のため） */
  function holidayOfSafe(date: DateString): Holiday<Kind> | undefined {
    try {
      return lookup.holidayOn(date);
    } catch {
      return undefined;
    }
  }
  const isHolidaySafe = (date: DateString): boolean => holidayOfSafe(date) !== undefined;

  /**
   * "after-holiday" の規則が、date（祝日でない日）に振り替えられてきたか。
   * date の前日からさかのぼって祝日が続く間に、規則に当たる日があれば、その日付を返す
   */
  function shiftedOrigin(rule: RecurringRuleCompiled<T>, date: DateString): DateString | undefined {
    for (let k = 1; k <= MAX_HOLIDAY_RUN; k++) {
      const prev = addDays(date, -k);
      if (!isHolidaySafe(prev)) return undefined;
      if (matchRecurring(rule, prev, holidayOfSafe)) return prev;
    }
    return undefined;
  }

  return function resolve(date: DateString): Resolution<T, Kind> {
    const dayNumber = toDayNumber(date);
    const weekday = weekdayOf(date);
    const holiday = lookup.holidayOn(date);
    const make = (
      value: T,
      reason: KnownScheduleReason,
      rule: DecidingRule<T> | null,
      name: string | undefined,
      shiftedFrom?: DateString,
    ): Resolution<T, Kind> => {
      const result: { -readonly [K in keyof ScheduleDay<T, Kind>]: ScheduleDay<T, Kind>[K] } = {
        date,
        weekday,
        value,
        reason,
      };
      if (name !== undefined) result.name = name;
      if (holiday !== undefined) result.holiday = holiday;
      if (shiftedFrom !== undefined) result.shiftedFrom = shiftedFrom;
      if (rule !== null) result.rulePath = rule.path;
      return { day: Object.freeze(result), rule };
    };

    // 1. 個別の日付  2. 毎年の月日
    const byDate = dates.find((r) => dayNumber >= r.from && dayNumber <= r.to);
    if (byDate) return make(byDate.value, "date", byDate, byDate.name);
    const byAnnual = annual.find((r) => matchAnnual(r, date));
    if (byAnnual) return make(byAnnual.value, "annual", byAnnual, byAnnual.name);

    if (holiday) {
      // 3. 祝日の上（"over-holiday"。祝日の規則 { holiday: true } もここ）
      const over = recurring.find(
        (r) => r.onHolidayRule === "over-holiday" && matchRecurring(r, date, holidayOfSafe),
      );
      if (over) return make(over.value, "recurring", over, over.name);
      // 4. 祝日
      if (holidayRule !== "weekday") {
        const value = "sameAs" in holidayRule ? weekly[holidayRule.sameAs] : holidayRule.value;
        return make(value as T, "holiday", null, holiday.name);
      }
      // 祝日の扱いが「曜日どおり」なら、祝日の下（"under-holiday"）の規則も当てはまる。
      // "after-holiday" の規則は祝日には当てはめない（振り替える）
      const under = recurring.find(
        (r) => r.onHolidayRule === "under-holiday" && matchRecurring(r, date, holidayOfSafe),
      );
      if (under) return make(under.value, "recurring", under, under.name);
      return make(weekly[weekday] as T, "weekday", null, undefined);
    }

    // 5. 繰り返しの規則（祝日でない日。配列で先に書いたものが優先）。振替先も同じ段階で判定する
    for (const rule of recurring) {
      if (matchRecurring(rule, date, holidayOfSafe))
        return make(rule.value, "recurring", rule, rule.name);
      if (hasShift && rule.onHolidayRule === "after-holiday") {
        const origin = shiftedOrigin(rule, date);
        if (origin !== undefined) return make(rule.value, "recurring", rule, rule.name, origin);
      }
    }
    // 6. 曜日
    return make(weekly[weekday] as T, "weekday", null, undefined);
  };
}

/** @internal 期間（両端を含む）の日ごとに fn を呼んだ結果。from が to より後ならエラー */
export function mapDays<R>(
  from: DateString,
  to: DateString,
  fn: (date: DateString) => R,
): readonly R[] {
  if (from > to) {
    throw rangeError("invalid-range", `"from" must not be after "to" (${from} > ${to})`);
  }
  const result: R[] = [];
  for (let n = toDayNumber(from); n <= toDayNumber(to); n++) result.push(fn(fromDayNumber(n)));
  return Object.freeze(result);
}

/** @internal 検証済みの規則からスケジュールを作る */
export function buildSchedule<T, Kind extends string>(
  compiled: CompiledSchedule<T, Kind>,
): Schedule<T, Kind> {
  const lookup = createHolidayLookup(compiled.source);
  const resolve = createResolver(compiled, lookup);
  const info = (date: DateString): ScheduleDay<T, Kind> => resolve(date).day;

  const schedule: Schedule<T, Kind> = {
    timeZone: lookup.timeZone,
    providers: lookup.providers,
    outOfRange: lookup.outOfRange,
    dateOf: lookup.dateOf,
    civilOf: lookup.civilOf,
    today: lookup.today,
    isHoliday: lookup.isHoliday,
    getHoliday: lookup.getHoliday,
    holidaysInYear: lookup.holidaysInYear,
    holidaysBetween: lookup.holidaysBetween,
    valueOn: (input) => info(lookup.dateOf(input)).value,
    dayInfo: (input) => info(lookup.dateOf(input)),
    daysBetween: (from, to) => mapDays(lookup.dateOf(from), lookup.dateOf(to), info),
  };
  return Object.freeze(schedule);
}

/**
 * 曜日・祝日・特定日の規則から、日ごとに値を返すスケジュールを作る。
 *
 * 設定は作る時点で複製されるので、あとから元の配列やオブジェクトを書き換えても結果は変わらない
 * （値 T そのものは複製しない）。設定の誤りは code 付きの RangeError になる。
 * @public
 */
export function createSchedule<T, Kind extends string = string>(
  options: ScheduleOptions<T, Kind>,
): Schedule<T, Kind> {
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<T, Kind>(c, options);
  c.throwFirstError();
  return buildSchedule(compiled!);
}
