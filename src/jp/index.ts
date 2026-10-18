/**
 * 日本の祝日。
 *
 * @example
 * import { createCalendar } from "bizdays-toolkit";
 * import { jp } from "bizdays-toolkit/jp";
 * const calendar = createCalendar({ holidays: jp });
 *
 * @example 祝日だけを調べるなら、このモジュールの関数をそのまま使える
 * import { isHoliday } from "bizdays-toolkit/jp";
 * isHoliday("2026-11-23"); // true
 */

import { createCalendar, type Calendar } from "../core/calendar.ts";
import type { DateString } from "../core/date.ts";
import type { CivilDateTimeParts, DateInput, DateTimeInput } from "../core/input.ts";
import type { Holiday, HolidayProvider } from "../core/types.ts";
import {
  CONFIRMED_THROUGH,
  DATA_VERSION,
  SUPPORTED_YEARS,
  computeJapaneseHolidays,
  type JapaneseHolidayKind,
} from "./rules.ts";

export type { JapaneseHolidayKind, KnownJapaneseHolidayKind } from "./rules.ts";

/**
 * 日本の祝日。
 * @public
 */
export type JapaneseHoliday = Holiday<JapaneseHolidayKind>;

const cache = new Map<number, readonly JapaneseHoliday[]>();

/**
 * 日本の祝日の提供元（createCalendar・createSchedule の holidays に渡す）。
 * @public
 */
export const jp: HolidayProvider<JapaneseHolidayKind> = Object.freeze({
  id: "JP",
  timeZone: "Asia/Tokyo",
  supportedYears: SUPPORTED_YEARS,
  dataVersion: DATA_VERSION,
  confirmedThrough: CONFIRMED_THROUGH,
  holidaysInYear(year: number): readonly JapaneseHoliday[] {
    let list = cache.get(year);
    if (!list) {
      list = Object.freeze(computeJapaneseHolidays(year));
      cache.set(year, list);
    }
    return list;
  },
});

let defaultCalendar: Calendar<JapaneseHolidayKind> | undefined;
const calendar = (): Calendar<JapaneseHolidayKind> =>
  (defaultCalendar ??= createCalendar({ holidays: jp }));

/**
 * 祝日か（Date などの瞬間は日本時間で判定する）。
 * @public
 */
export function isHoliday(input: DateInput): boolean {
  return calendar().isHoliday(input);
}

/**
 * 祝日なら祝日を返す。
 * @public
 */
export function getHoliday(input: DateInput): JapaneseHoliday | undefined {
  return calendar().getHoliday(input);
}

/**
 * その年の祝日。
 * @public
 */
export function holidaysInYear(year: number): readonly JapaneseHoliday[] {
  return calendar().holidaysInYear(year);
}

/**
 * 期間内の祝日（両端を含む）。
 * @public
 */
export function holidaysBetween(from: DateInput, to: DateInput): readonly JapaneseHoliday[] {
  return calendar().holidaysBetween(from, to);
}

/**
 * 日本時間での暦日。
 * @public
 */
export function toJapanDate(input: DateInput): DateString {
  return calendar().dateOf(input);
}

/**
 * 日本時間での暦日と時刻（"HH:mm"。暦日だけの入力では null）。
 * 時刻を必ず持つ入力（Date・Temporal.Instant など）では、time の型が string になる。
 * @public
 */
export function toJapanDateTime(input: DateTimeInput): CivilDateTimeParts<string>;
/** @public */
export function toJapanDateTime(input: DateInput): CivilDateTimeParts;
export function toJapanDateTime(input: DateInput): CivilDateTimeParts {
  return calendar().civilOf(input);
}

/**
 * 反映済みの官報の年月。
 * @public
 */
export const dataVersion: string = DATA_VERSION;
/**
 * 春分・秋分の日が官報で確定している最後の年。
 * @public
 */
export const confirmedThrough: number = CONFIRMED_THROUGH;
