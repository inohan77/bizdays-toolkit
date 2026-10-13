/**
 * 日ごとに値を返すスケジュール（営業時間・受付枠など、曜日・祝日・特定日で変わるもの）。
 *
 * 1 日の値は次の優先順位で決まる（上が優先）:
 *   1. dates   … 個別の日付・期間（配列で先に書いたものが優先）
 *   2. annual  … 毎年の月日・月日の期間（年をまたぐ期間も可。配列で先に書いたものが優先）
 *   3. 祝日     … holiday の規則（"weekday": 曜日どおり / { sameAs: 曜日 }: その曜日の値 / { value }: 指定の値）
 *   4. weekly  … 曜日ごとの値
 *
 * 営業日カレンダー（createCalendar）は、このスケジュールの真偽値版として作られている。
 */

import { parseDate, toDayNumber, weekdayOf, type DateString, type Weekday } from "./date.ts";
import {
  instantToCivil,
  toCivil,
  toDateTimeParts,
  validateTimeZone,
  type DateInput,
} from "./input.ts";
import type { Holiday, HolidayProvider } from "./types.ts";

/** 祝日の値の決め方 */
export type HolidayRule<T> =
  /** 祝日を考えず、曜日の値を使う */
  | "weekday"
  /** 指定した曜日の値を使う（例: 祝日は日曜日の営業時間） */
  | { readonly sameAs: Weekday }
  /** 指定した値を使う */
  | { readonly value: T };

/** 毎年の月日 "MM-DD" の値 */
export interface AnnualValue<T> {
  readonly date: string;
  readonly value: T;
  readonly name?: string;
}
/** 毎年の月日の期間の値（from > to なら年をまたぐ。例: 12-31 〜 01-03） */
export interface AnnualRangeValue<T> {
  readonly from: string;
  readonly to: string;
  readonly value: T;
  readonly name?: string;
}
/** 個別の日付 "YYYY-MM-DD" の値 */
export interface DateValue<T> {
  readonly date: DateString;
  readonly value: T;
  readonly name?: string;
}
/** 個別の日付の期間（両端を含む）の値 */
export interface DateRangeValue<T> {
  readonly from: DateString;
  readonly to: DateString;
  readonly value: T;
  readonly name?: string;
}

/** 祝日の提供元とタイムゾーンの設定（スケジュールと営業日カレンダーで共通） */
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

export interface ScheduleOptions<
  T,
  Kind extends string = string,
> extends HolidaySourceOptions<Kind> {
  /** 曜日ごとの値（[日, 月, 火, 水, 木, 金, 土]） */
  readonly weekly: readonly [T, T, T, T, T, T, T];
  /** 祝日の値の決め方（既定: "weekday"） */
  readonly holiday?: HolidayRule<T>;
  /** 毎年の月日の値 */
  readonly annual?: readonly (AnnualValue<T> | AnnualRangeValue<T>)[];
  /** 個別の日付の値 */
  readonly dates?: readonly (DateValue<T> | DateRangeValue<T>)[];
}

/** 値を決めた規則 */
export type ScheduleReason = "date" | "annual" | "holiday" | "weekday";

/** 1 日分の値と、その値を決めた規則 */
export interface ScheduleDay<T, Kind extends string = string> {
  readonly date: DateString;
  readonly weekday: Weekday;
  readonly value: T;
  /** 値を決めた規則 */
  readonly reason: ScheduleReason;
  /** 値を決めた規則の名前（dates・annual の name、祝日なら祝日名） */
  readonly name?: string;
  /** その日が祝日なら祝日（holiday の規則に関係なく付く） */
  readonly holiday?: Holiday<Kind>;
}

/** 暦日と時刻（カレンダーのタイムゾーン） */
export interface CivilDateTimeParts {
  /** 暦日 "YYYY-MM-DD" */
  readonly date: DateString;
  /** 時刻 "HH:mm"。暦日だけの入力では null */
  readonly time: string | null;
}

/** 祝日を調べる機能（スケジュールと営業日カレンダーで共通） */
export interface HolidayLookup<Kind extends string = string> {
  /** 日時の入力を暦日に変換するタイムゾーン */
  readonly timeZone: string;
  /** 祝日の提供元 */
  readonly providers: readonly HolidayProvider<Kind>[];

  /** 入力をタイムゾーンでの暦日に変換する */
  dateOf(input: DateInput): DateString;
  /** 入力をタイムゾーンでの暦日と時刻に変換する */
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

export interface Schedule<T, Kind extends string = string> extends HolidayLookup<Kind> {
  /** その日の値 */
  valueOn(input: DateInput): T;
  /** その日の値と、値を決めた規則 */
  dayInfo(input: DateInput): ScheduleDay<T, Kind>;
}

// ------------------------------------------------------------
// 内部の共通処理
// ------------------------------------------------------------

const MONTH_DAY_RE = /^(\d{2})-(\d{2})$/;
const MAX_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** "MM-DD" を検証する（2 月 29 日は可） */
export function parseMonthDay(value: string): string {
  const m = MONTH_DAY_RE.exec(value);
  const month = Number(m?.[1]);
  const day = Number(m?.[2]);
  if (!m || month < 1 || month > 12 || day < 1 || day > MAX_DAYS_IN_MONTH[month - 1]!) {
    throw new RangeError(`Invalid month-day: ${JSON.stringify(value)} (expected MM-DD)`);
  }
  return value;
}

interface DateRule<T> {
  readonly from: number;
  readonly to: number;
  readonly value: T;
  readonly name: string | undefined;
}

interface AnnualRule<T> {
  readonly from: string;
  readonly to: string;
  readonly value: T;
  readonly name: string | undefined;
}

function compileDates<T>(
  entries: readonly (DateValue<T> | DateRangeValue<T>)[] | undefined,
  label: string,
): DateRule<T>[] {
  return (entries ?? []).map((e) => {
    if ("date" in e) {
      const n = toDayNumber(e.date);
      return { from: n, to: n, value: e.value, name: e.name };
    }
    const from = toDayNumber(e.from);
    const to = toDayNumber(e.to);
    if (from > to) {
      throw new RangeError(`${label}: "from" must not be after "to" (${e.from} > ${e.to})`);
    }
    return { from, to, value: e.value, name: e.name };
  });
}

function compileAnnual<T>(
  entries: readonly (AnnualValue<T> | AnnualRangeValue<T>)[] | undefined,
): AnnualRule<T>[] {
  return (entries ?? []).map((e) => {
    if ("date" in e) {
      const md = parseMonthDay(e.date);
      return { from: md, to: md, value: e.value, name: e.name };
    }
    return { from: parseMonthDay(e.from), to: parseMonthDay(e.to), value: e.value, name: e.name };
  });
}

function matchAnnual(rule: AnnualRule<unknown>, monthDay: string): boolean {
  return rule.from <= rule.to
    ? monthDay >= rule.from && monthDay <= rule.to
    : monthDay >= rule.from || monthDay <= rule.to;
}

/** 祝日を調べる機能を作る（スケジュールと営業日カレンダーで共通） */
export function createHolidayLookup<Kind extends string>(
  options: HolidaySourceOptions<Kind>,
): HolidayLookup<Kind> & { holidayOn(date: DateString): Holiday<Kind> | undefined } {
  const providers: readonly HolidayProvider<Kind>[] = Object.freeze(
    options.holidays === undefined
      ? []
      : Array.isArray(options.holidays)
        ? [...(options.holidays as readonly HolidayProvider<Kind>[])]
        : [options.holidays as HolidayProvider<Kind>],
  );

  let timeZone: string;
  if (options.timeZone !== undefined) {
    timeZone = validateTimeZone(options.timeZone);
  } else {
    const zones = [...new Set(providers.map((p) => validateTimeZone(p.timeZone)))];
    if (zones.length > 1) {
      throw new RangeError(
        `Holiday providers use different time zones (${zones.join(", ")}); specify options.timeZone`,
      );
    }
    timeZone = zones[0] ?? "UTC";
  }
  const outOfRange = options.outOfRange ?? "throw";

  const yearCache = new Map<number, Map<DateString, Holiday<Kind>>>();

  function providerYears(provider: HolidayProvider<Kind>, year: number): readonly Holiday<Kind>[] {
    const { from, to } = provider.supportedYears;
    if (year < from || year > to) {
      if (outOfRange === "ignore") return [];
      throw new RangeError(
        `Holidays for ${provider.id} are supported for ${from}-${to}; requested ${year}`,
      );
    }
    return provider.holidaysInYear(year);
  }

  function holidayMap(year: number): Map<DateString, Holiday<Kind>> {
    let map = yearCache.get(year);
    if (!map) {
      map = new Map();
      for (const provider of providers) {
        for (const h of providerYears(provider, year)) {
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
    if (!Number.isInteger(year)) throw new RangeError(`Invalid year: ${year}`);
    return Object.freeze(
      [...holidayMap(year).values()].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
      ),
    );
  }

  return {
    timeZone,
    providers,
    holidayOn,
    dateOf,
    civilOf: (input) => toDateTimeParts(input, timeZone),
    today: (now = new Date()) => instantToCivil(now.getTime(), timeZone).date,
    isHoliday: (input) => holidayOn(dateOf(input)) !== undefined,
    getHoliday: (input) => holidayOn(dateOf(input)),
    holidaysInYear,
    holidaysBetween(from, to) {
      const a = dateOf(from);
      const b = dateOf(to);
      if (a > b) throw new RangeError(`"from" must not be after "to" (${a} > ${b})`);
      const result: Holiday<Kind>[] = [];
      for (let y = parseDate(a).year; y <= parseDate(b).year; y++) {
        for (const h of holidaysInYear(y)) if (h.date >= a && h.date <= b) result.push(h);
      }
      return Object.freeze(result);
    },
  };
}

// ------------------------------------------------------------
// createSchedule
// ------------------------------------------------------------

/** 曜日・祝日・特定日の規則から、日ごとに値を返すスケジュールを作る */
export function createSchedule<T, Kind extends string = string>(
  options: ScheduleOptions<T, Kind>,
): Schedule<T, Kind> {
  const weekly = options.weekly;
  if (!Array.isArray(weekly) || weekly.length !== 7) {
    throw new RangeError("weekly must have 7 values ([Sunday, Monday, ..., Saturday])");
  }
  const holidayRule: HolidayRule<T> = options.holiday ?? "weekday";
  if (typeof holidayRule === "object" && "sameAs" in holidayRule) {
    const w = holidayRule.sameAs;
    if (!Number.isInteger(w) || w < 0 || w > 6) throw new RangeError(`Invalid weekday: ${w}`);
  } else if (
    holidayRule !== "weekday" &&
    !(typeof holidayRule === "object" && "value" in holidayRule)
  ) {
    throw new RangeError(`Invalid holiday rule: ${JSON.stringify(holidayRule)}`);
  }
  const dates = compileDates(options.dates, "dates");
  const annual = compileAnnual(options.annual);
  const lookup = createHolidayLookup(options);

  function info(date: DateString): ScheduleDay<T, Kind> {
    const dayNumber = toDayNumber(date);
    const weekday = weekdayOf(date);
    const holiday = lookup.holidayOn(date);
    const make = (
      value: T,
      reason: ScheduleReason,
      name: string | undefined,
    ): ScheduleDay<T, Kind> => {
      const result: { -readonly [K in keyof ScheduleDay<T, Kind>]: ScheduleDay<T, Kind>[K] } = {
        date,
        weekday,
        value,
        reason,
      };
      if (name !== undefined) result.name = name;
      if (holiday !== undefined) result.holiday = holiday;
      return Object.freeze(result);
    };

    const byDate = dates.find((r) => dayNumber >= r.from && dayNumber <= r.to);
    if (byDate) return make(byDate.value, "date", byDate.name);
    const monthDay = date.slice(5);
    const byAnnual = annual.find((r) => matchAnnual(r, monthDay));
    if (byAnnual) return make(byAnnual.value, "annual", byAnnual.name);
    if (holiday && holidayRule !== "weekday") {
      const value = "sameAs" in holidayRule ? weekly[holidayRule.sameAs] : holidayRule.value;
      return make(value as T, "holiday", holiday.name);
    }
    return make(weekly[weekday] as T, "weekday", undefined);
  }

  const schedule: Schedule<T, Kind> = {
    timeZone: lookup.timeZone,
    providers: lookup.providers,
    dateOf: lookup.dateOf,
    civilOf: lookup.civilOf,
    today: lookup.today,
    isHoliday: lookup.isHoliday,
    getHoliday: lookup.getHoliday,
    holidaysInYear: lookup.holidaysInYear,
    holidaysBetween: lookup.holidaysBetween,
    valueOn: (input) => info(lookup.dateOf(input)).value,
    dayInfo: (input) => info(lookup.dateOf(input)),
  };
  return Object.freeze(schedule);
}
