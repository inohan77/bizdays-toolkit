/**
 * 祝日と、会社・店舗の休業日を組み合わせた営業日カレンダー。
 *
 * 1 日の判定は次の優先順位で行う（上が優先）:
 *   1. openDates      … 臨時営業日（個別の日付・期間）
 *   2. closedDates    … 臨時休業日（個別の日付・期間）
 *   3. closedAnnual   … 毎年の休業日（月日・月日の期間。年をまたぐ期間も可）
 *   4. 祝日            … holidayPolicy に従う（closed: 休業 / open: 営業 / ignore: 判定に使わない）
 *   5. closedWeekdays … 定休日の曜日
 *   6. それ以外は営業日
 */

import {
  addDays,
  fromDayNumber,
  parseDate,
  toDayNumber,
  weekdayOf,
  type DateString,
  type Weekday,
} from "./date.ts";
import {
  instantToCivil,
  parseTimeOfDay,
  toCivil,
  validateTimeZone,
  type DateInput,
} from "./input.ts";
import type { Holiday, HolidayProvider } from "./types.ts";

/** 祝日の扱い */
export type HolidayPolicy = "closed" | "open" | "ignore";

/** 毎年の月日 "MM-DD"（名前付きも可） */
export type AnnualDate = string | { readonly date: string; readonly name?: string };
/** 毎年の月日の期間（from > to なら年をまたぐ。例: 12-31 〜 01-03） */
export interface AnnualRange {
  readonly from: string;
  readonly to: string;
  readonly name?: string;
}
/** 個別の日付 "YYYY-MM-DD"（名前付きも可） */
export type SpecificDate = DateString | { readonly date: DateString; readonly name?: string };
/** 個別の日付の期間（両端を含む） */
export interface DateRange {
  readonly from: DateString;
  readonly to: DateString;
  readonly name?: string;
}

export interface CalendarOptions<Kind extends string = string> {
  /** 祝日の提供元（例: jp）。複数渡すと和集合になる */
  readonly holidays?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
  /**
   * 日時の入力（Date・オフセット付き文字列など）を暦日に変換するタイムゾーン。
   * 省略時は祝日の提供元のタイムゾーン、提供元もなければ "UTC"
   */
  readonly timeZone?: string;
  /** 定休日の曜日（0 = 日曜日） */
  readonly closedWeekdays?: readonly Weekday[];
  /** 毎年の休業日 */
  readonly closedAnnual?: readonly (AnnualDate | AnnualRange)[];
  /** 臨時休業日 */
  readonly closedDates?: readonly (SpecificDate | DateRange)[];
  /** 臨時営業日（ほかのすべての規則より優先） */
  readonly openDates?: readonly (SpecificDate | DateRange)[];
  /** 祝日の扱い（既定: "closed"） */
  readonly holidayPolicy?: HolidayPolicy;
  /** 祝日の提供元の対応年を外れた日付の扱い（既定: "throw"） */
  readonly outOfRange?: "throw" | "ignore";
  /** 営業日を探すときに調べる最大日数（既定: 3660）。超えたら Error */
  readonly maxSearchDays?: number;
}

/** 営業・休業を決めた規則 */
export type DayReason =
  | "open-date"
  | "closed-date"
  | "closed-annual"
  | "holiday"
  | "closed-weekday"
  | "regular";

/** 1 日分の判定結果 */
export interface DayInfo<Kind extends string = string> {
  readonly date: DateString;
  readonly weekday: Weekday;
  readonly businessDay: boolean;
  /** 判定を決めた規則 */
  readonly reason: DayReason;
  /** 判定を決めた規則の名前（休業日の名前・祝日名など） */
  readonly name?: string;
  /** その日が祝日なら祝日（holidayPolicy に関係なく付く） */
  readonly holiday?: Holiday<Kind>;
}

export interface BusinessDayOptions {
  /**
   * 締め時刻 "HH:mm"（カレンダーのタイムゾーン）。
   * 入力の時刻がこの時刻以降なら、その日は対象にしない。暦日だけの入力は 0 時として扱う
   */
  readonly cutoff?: string;
}

export interface Calendar<Kind extends string = string> {
  /** 日時の入力を暦日に変換するタイムゾーン */
  readonly timeZone: string;
  /** 祝日の提供元 */
  readonly providers: readonly HolidayProvider<Kind>[];

  /** 入力をカレンダーのタイムゾーンでの暦日に変換する */
  dateOf(input: DateInput): DateString;
  /** 今日の日付（カレンダーのタイムゾーン） */
  today(now?: Date): DateString;

  /** 祝日か */
  isHoliday(input: DateInput): boolean;
  /** 祝日なら祝日を返す */
  getHoliday(input: DateInput): Holiday<Kind> | undefined;
  /** その年の祝日 */
  holidaysInYear(year: number): readonly Holiday<Kind>[];
  /** 期間内の祝日（両端を含む） */
  holidaysBetween(from: DateInput, to: DateInput): readonly Holiday<Kind>[];

  /** 1 日分の判定結果（営業日か・理由・祝日） */
  dayInfo(input: DateInput): DayInfo<Kind>;
  /** 営業日か */
  isBusinessDay(input: DateInput): boolean;
  /** 翌営業日（入力日の翌日以降） */
  nextBusinessDay(input: DateInput): DateString;
  /** 前営業日（入力日の前日以前） */
  previousBusinessDay(input: DateInput): DateString;
  /** 入力日が営業日ならその日、そうでなければ翌営業日。cutoff で締め時刻を指定できる */
  businessDayOnOrAfter(input: DateInput, options?: BusinessDayOptions): DateString;
  /** 入力日が営業日ならその日、そうでなければ前営業日 */
  businessDayOnOrBefore(input: DateInput): DateString;
  /**
   * n 営業日後（負なら前）。入力日自身は数えない。
   * n = 0 のときは businessDayOnOrAfter と同じ
   */
  addBusinessDays(input: DateInput, n: number): DateString;
  /** from 以上 to 未満の営業日の数（to が前なら負） */
  businessDaysBetween(from: DateInput, to: DateInput): number;
  /** 期間内の営業日（両端を含む） */
  listBusinessDays(from: DateInput, to: DateInput): readonly DateString[];
}

const MONTH_DAY_RE = /^(\d{2})-(\d{2})$/;
const MAX_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function parseMonthDay(value: string): string {
  const m = MONTH_DAY_RE.exec(value);
  const month = Number(m?.[1]);
  const day = Number(m?.[2]);
  if (!m || month < 1 || month > 12 || day < 1 || day > MAX_DAYS_IN_MONTH[month - 1]!) {
    throw new RangeError(`Invalid month-day: ${JSON.stringify(value)} (expected MM-DD)`);
  }
  return value;
}

interface DayRule {
  readonly from: number;
  readonly to: number;
  readonly name: string | undefined;
}

function compileDates(
  entries: readonly (SpecificDate | DateRange)[] | undefined,
  label: string,
): DayRule[] {
  return (entries ?? []).map((e) => {
    if (typeof e === "string") {
      const n = toDayNumber(e);
      return { from: n, to: n, name: undefined };
    }
    if ("date" in e) {
      const n = toDayNumber(e.date);
      return { from: n, to: n, name: e.name };
    }
    const from = toDayNumber(e.from);
    const to = toDayNumber(e.to);
    if (from > to)
      throw new RangeError(`${label}: "from" must not be after "to" (${e.from} > ${e.to})`);
    return { from, to, name: e.name };
  });
}

interface AnnualRule {
  readonly from: string;
  readonly to: string;
  readonly name: string | undefined;
}

function compileAnnual(entries: readonly (AnnualDate | AnnualRange)[] | undefined): AnnualRule[] {
  return (entries ?? []).map((e) => {
    if (typeof e === "string") {
      const md = parseMonthDay(e);
      return { from: md, to: md, name: undefined };
    }
    if ("date" in e) {
      const md = parseMonthDay(e.date);
      return { from: md, to: md, name: e.name };
    }
    return { from: parseMonthDay(e.from), to: parseMonthDay(e.to), name: e.name };
  });
}

function matchAnnual(rule: AnnualRule, monthDay: string): boolean {
  return rule.from <= rule.to
    ? monthDay >= rule.from && monthDay <= rule.to
    : monthDay >= rule.from || monthDay <= rule.to;
}

/** 祝日と休業日の規則から営業日カレンダーを作る */
export function createCalendar<Kind extends string = string>(
  options: CalendarOptions<Kind> = {},
): Calendar<Kind> {
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

  const closedWeekdays = new Set<number>();
  for (const w of options.closedWeekdays ?? []) {
    if (!Number.isInteger(w) || w < 0 || w > 6) throw new RangeError(`Invalid weekday: ${w}`);
    closedWeekdays.add(w);
  }
  const closedAnnual = compileAnnual(options.closedAnnual);
  const closedDates = compileDates(options.closedDates, "closedDates");
  const openDates = compileDates(options.openDates, "openDates");
  const holidayPolicy: HolidayPolicy = options.holidayPolicy ?? "closed";
  if (!["closed", "open", "ignore"].includes(holidayPolicy)) {
    throw new RangeError(`Invalid holidayPolicy: ${String(holidayPolicy)}`);
  }
  const outOfRange = options.outOfRange ?? "throw";
  const maxSearchDays = options.maxSearchDays ?? 3660;
  if (!Number.isInteger(maxSearchDays) || maxSearchDays < 1) {
    throw new RangeError(`Invalid maxSearchDays: ${maxSearchDays}`);
  }

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

  const dateOf = (input: DateInput): DateString => toCivil(input, timeZone).date;

  function holidayOn(date: DateString): Holiday<Kind> | undefined {
    if (providers.length === 0) return undefined;
    return holidayMap(parseDate(date).year).get(date);
  }

  function findRule(rules: readonly DayRule[], dayNumber: number): DayRule | undefined {
    return rules.find((r) => dayNumber >= r.from && dayNumber <= r.to);
  }

  function info(date: DateString): DayInfo<Kind> {
    const dayNumber = toDayNumber(date);
    const weekday = weekdayOf(date);
    const holiday = holidayOn(date);
    const make = (
      businessDay: boolean,
      reason: DayReason,
      name: string | undefined,
    ): DayInfo<Kind> => {
      const result: { -readonly [K in keyof DayInfo<Kind>]: DayInfo<Kind>[K] } = {
        date,
        weekday,
        businessDay,
        reason,
      };
      if (name !== undefined) result.name = name;
      if (holiday !== undefined) result.holiday = holiday;
      return Object.freeze(result);
    };

    const open = findRule(openDates, dayNumber);
    if (open) return make(true, "open-date", open.name);
    const closed = findRule(closedDates, dayNumber);
    if (closed) return make(false, "closed-date", closed.name);
    const monthDay = date.slice(5);
    const annual = closedAnnual.find((r) => matchAnnual(r, monthDay));
    if (annual) return make(false, "closed-annual", annual.name);
    if (holiday && holidayPolicy !== "ignore") {
      return make(holidayPolicy === "open", "holiday", holiday.name);
    }
    if (closedWeekdays.has(weekday)) return make(false, "closed-weekday", undefined);
    return make(true, "regular", undefined);
  }

  const isOpen = (date: DateString): boolean => info(date).businessDay;

  function search(start: DateString, step: 1 | -1): DateString {
    let n = toDayNumber(start);
    for (let i = 0; i < maxSearchDays; i++, n += step) {
      const date = fromDayNumber(n);
      if (isOpen(date)) return date;
    }
    throw new Error(`No business day found within ${maxSearchDays} days from ${start}`);
  }

  function ordered(from: DateInput, to: DateInput): [DateString, DateString] {
    const a = dateOf(from);
    const b = dateOf(to);
    if (a > b) throw new RangeError(`"from" must not be after "to" (${a} > ${b})`);
    return [a, b];
  }

  function countOpen(from: number, toExclusive: number): number {
    let count = 0;
    for (let n = from; n < toExclusive; n++) if (isOpen(fromDayNumber(n))) count++;
    return count;
  }

  const calendar: Calendar<Kind> = {
    timeZone,
    providers,
    dateOf,
    today: (now = new Date()) => instantToCivil(now.getTime(), timeZone).date,

    isHoliday: (input) => holidayOn(dateOf(input)) !== undefined,
    getHoliday: (input) => holidayOn(dateOf(input)),
    holidaysInYear(year) {
      if (!Number.isInteger(year)) throw new RangeError(`Invalid year: ${year}`);
      return Object.freeze(
        [...holidayMap(year).values()].sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
        ),
      );
    },
    holidaysBetween(from, to) {
      const [a, b] = ordered(from, to);
      const result: Holiday<Kind>[] = [];
      for (let y = parseDate(a).year; y <= parseDate(b).year; y++) {
        for (const h of calendar.holidaysInYear(y)) if (h.date >= a && h.date <= b) result.push(h);
      }
      return Object.freeze(result);
    },

    dayInfo: (input) => info(dateOf(input)),
    isBusinessDay: (input) => isOpen(dateOf(input)),
    nextBusinessDay: (input) => search(addDays(dateOf(input), 1), 1),
    previousBusinessDay: (input) => search(addDays(dateOf(input), -1), -1),
    businessDayOnOrAfter(input, opts = {}) {
      const civil = toCivil(input, timeZone);
      let start = civil.date;
      if (opts.cutoff !== undefined) {
        const cutoff = parseTimeOfDay(opts.cutoff);
        if (civil.minutes !== null && civil.minutes >= cutoff) start = addDays(start, 1);
      }
      return search(start, 1);
    },
    businessDayOnOrBefore: (input) => search(dateOf(input), -1),
    addBusinessDays(input, n) {
      if (!Number.isInteger(n)) throw new RangeError(`n must be an integer: ${n}`);
      let date = dateOf(input);
      if (n === 0) return search(date, 1);
      const step = n > 0 ? 1 : -1;
      for (let remaining = Math.abs(n); remaining > 0; remaining--) {
        date = search(addDays(date, step), step);
      }
      return date;
    },
    businessDaysBetween(from, to) {
      const a = toDayNumber(dateOf(from));
      const b = toDayNumber(dateOf(to));
      return a <= b ? countOpen(a, b) : -countOpen(b, a);
    },
    listBusinessDays(from, to) {
      const [a, b] = ordered(from, to);
      const result: DateString[] = [];
      for (let n = toDayNumber(a); n <= toDayNumber(b); n++) {
        const date = fromDayNumber(n);
        if (isOpen(date)) result.push(date);
      }
      return Object.freeze(result);
    },
  };
  return Object.freeze(calendar);
}
