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
 *
 * 内部では、営業日かどうか（真偽値）を返すスケジュール（createSchedule）として作っている。
 */

import { addDays, fromDayNumber, toDayNumber, type DateString, type Weekday } from "./date.ts";
import { parseTimeOfDay, toCivil, type DateInput } from "./input.ts";
import {
  createSchedule,
  parseMonthDay,
  type DateRangeValue,
  type DateValue,
  type HolidayLookup,
  type HolidaySourceOptions,
} from "./schedule.ts";
import type { Holiday } from "./types.ts";

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

export interface CalendarOptions<Kind extends string = string> extends HolidaySourceOptions<Kind> {
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

export interface Calendar<Kind extends string = string> extends HolidayLookup<Kind> {
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

function toDateValues(
  entries: readonly (SpecificDate | DateRange)[] | undefined,
  value: boolean,
): (DateValue<boolean> | DateRangeValue<boolean>)[] {
  return (entries ?? []).map((e) => {
    if (typeof e === "string") return { date: e, value };
    if ("date" in e) return e.name === undefined ? { date: e.date, value } : { ...e, value };
    return e.name === undefined ? { from: e.from, to: e.to, value } : { ...e, value };
  });
}

/** 祝日と休業日の規則から営業日カレンダーを作る */
export function createCalendar<Kind extends string = string>(
  options: CalendarOptions<Kind> = {},
): Calendar<Kind> {
  const closedWeekdays = new Set<number>();
  for (const w of options.closedWeekdays ?? []) {
    if (!Number.isInteger(w) || w < 0 || w > 6) throw new RangeError(`Invalid weekday: ${w}`);
    closedWeekdays.add(w);
  }
  const holidayPolicy: HolidayPolicy = options.holidayPolicy ?? "closed";
  if (!["closed", "open", "ignore"].includes(holidayPolicy)) {
    throw new RangeError(`Invalid holidayPolicy: ${String(holidayPolicy)}`);
  }
  const maxSearchDays = options.maxSearchDays ?? 3660;
  if (!Number.isInteger(maxSearchDays) || maxSearchDays < 1) {
    throw new RangeError(`Invalid maxSearchDays: ${maxSearchDays}`);
  }

  const weekly = [0, 1, 2, 3, 4, 5, 6].map((w) => !closedWeekdays.has(w)) as [
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
  ];
  const sourceOptions: HolidaySourceOptions<Kind> = {
    ...(options.holidays !== undefined && { holidays: options.holidays }),
    ...(options.timeZone !== undefined && { timeZone: options.timeZone }),
    ...(options.outOfRange !== undefined && { outOfRange: options.outOfRange }),
  };
  const schedule = createSchedule<boolean, Kind>({
    ...sourceOptions,
    weekly,
    holiday: holidayPolicy === "ignore" ? "weekday" : { value: holidayPolicy === "open" },
    annual: (options.closedAnnual ?? []).map((e) => {
      if (typeof e === "string") return { date: parseMonthDay(e), value: false };
      if ("date" in e)
        return e.name === undefined ? { date: e.date, value: false } : { ...e, value: false };
      return e.name === undefined
        ? { from: e.from, to: e.to, value: false }
        : { ...e, value: false };
    }),
    // 臨時営業日を先に並べて、臨時休業日より優先する
    dates: [...toDateValues(options.openDates, true), ...toDateValues(options.closedDates, false)],
  });

  function info(date: DateString): DayInfo<Kind> {
    const day = schedule.dayInfo(date);
    let reason: DayReason;
    switch (day.reason) {
      case "date":
        reason = day.value ? "open-date" : "closed-date";
        break;
      case "annual":
        reason = "closed-annual";
        break;
      case "holiday":
        reason = "holiday";
        break;
      case "weekday":
        reason = day.value ? "regular" : "closed-weekday";
        break;
    }
    const result: { -readonly [K in keyof DayInfo<Kind>]: DayInfo<Kind>[K] } = {
      date: day.date,
      weekday: day.weekday,
      businessDay: day.value,
      reason,
    };
    // 曜日で決まった日には名前を付けない（祝日名は holiday で分かる）
    if (day.name !== undefined && day.reason !== "weekday") result.name = day.name;
    if (day.holiday !== undefined) result.holiday = day.holiday;
    return Object.freeze(result);
  }

  const isOpen = (date: DateString): boolean => schedule.valueOn(date);
  const dateOf = schedule.dateOf;

  function search(start: DateString, step: 1 | -1): DateString {
    let n = toDayNumber(start);
    for (let i = 0; i < maxSearchDays; i++, n += step) {
      const date = fromDayNumber(n);
      if (isOpen(date)) return date;
    }
    throw new Error(`No business day found within ${maxSearchDays} days from ${start}`);
  }

  function countOpen(from: number, toExclusive: number): number {
    let count = 0;
    for (let n = from; n < toExclusive; n++) if (isOpen(fromDayNumber(n))) count++;
    return count;
  }

  const calendar: Calendar<Kind> = {
    timeZone: schedule.timeZone,
    providers: schedule.providers,
    dateOf,
    civilOf: schedule.civilOf,
    today: schedule.today,
    isHoliday: schedule.isHoliday,
    getHoliday: schedule.getHoliday,
    holidaysInYear: schedule.holidaysInYear,
    holidaysBetween: schedule.holidaysBetween,

    dayInfo: (input) => info(dateOf(input)),
    isBusinessDay: (input) => isOpen(dateOf(input)),
    nextBusinessDay: (input) => search(addDays(dateOf(input), 1), 1),
    previousBusinessDay: (input) => search(addDays(dateOf(input), -1), -1),
    businessDayOnOrAfter(input, opts = {}) {
      const civil = toCivil(input, schedule.timeZone);
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
      const a = dateOf(from);
      const b = dateOf(to);
      if (a > b) throw new RangeError(`"from" must not be after "to" (${a} > ${b})`);
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
