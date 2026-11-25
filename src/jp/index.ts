/**
 * Holidays of Japan.
 *
 * @example
 * import { createCalendar } from "bizdays-toolkit";
 * import { jp } from "bizdays-toolkit/jp";
 * const calendar = createCalendar({ holidayProvider: jp });
 *
 * @example To look up holidays only, the functions of this module can be used directly
 * import { isHoliday } from "bizdays-toolkit/jp";
 * isHoliday("2026-11-23"); // true
 */

import type { DateString } from "../core/date.ts";
import type { CivilDateTimeParts, DateInput, DateTimeInput } from "../core/input.ts";
import type { Holiday, HolidayProvider } from "../core/types.ts";
import {
  CONFIRMED_THROUGH,
  DATA_VERSION,
  SUPPORTED_YEARS,
  computeJapaneseHolidays,
  sharedCalendar,
  type JpHolidayKind,
  type KnownJpHolidayKey,
  type KnownJpHolidayKind,
} from "./rules.ts";

export type { JpHolidayKind, KnownJpHolidayKey, KnownJpHolidayKind } from "./rules.ts";

/**
 * A holiday of Japan.
 * @public
 */
export type JpHoliday = Holiday<JpHolidayKind>;

const cache = new Map<number, readonly JpHoliday[]>();

/**
 * The holiday provider of Japan (pass it as holidayProvider of createCalendar / createSchedule).
 * @public
 */
export const jp: HolidayProvider<JpHolidayKind> = Object.freeze({
  id: "JP",
  timeZone: "Asia/Tokyo",
  supportedYears: SUPPORTED_YEARS,
  dataVersion: DATA_VERSION,
  confirmedThrough: CONFIRMED_THROUGH,
  /**
   * The holidays of a year, computed once and cached.
   * @param year - A supported year.
   * @returns A frozen array of frozen holidays sorted by date.
   * @throws RangeError `invalid-argument` when the year is not an integer; `out-of-range` outside the supported
   *   years.
   */
  holidaysInYear(year: number): readonly JpHoliday[] {
    let list = cache.get(year);
    if (!list) {
      list = Object.freeze(computeJapaneseHolidays(year));
      cache.set(year, list);
    }
    return list;
  },
});

/**
 * Whether a day is a Japanese public holiday.
 * @param input - A date input; an instant (Date etc.) is read in Japan time.
 * @returns true for a holiday.
 * @throws RangeError `out-of-range` outside the supported years; the input errors of the date conversion.
 * @public
 */
export function isHoliday(input: DateInput): boolean {
  return sharedCalendar(jp).isHoliday(input);
}

/**
 * The Japanese public holiday on a day.
 * @param input - A date input; an instant is read in Japan time.
 * @returns The holiday, or undefined.
 * @throws As {@link isHoliday}.
 * @public
 */
export function holidayOn(input: DateInput): JpHoliday | undefined {
  return sharedCalendar(jp).holidayOn(input);
}

/**
 * The Japanese public holidays of a year.
 * @param year - Integer within the supported years.
 * @returns A frozen array sorted by date.
 * @throws RangeError `invalid-argument` when not an integer; `out-of-range` outside the supported years.
 * @public
 */
export function holidaysInYear(year: number): readonly JpHoliday[] {
  return sharedCalendar(jp).holidaysInYear(year);
}

/**
 * The Japanese public holidays of a period.
 * @param from - First day.
 * @param to - Last day (inclusive).
 * @returns A frozen array sorted by date.
 * @throws RangeError `invalid-range` when `from` is after `to`; `out-of-range` outside the supported years.
 * @public
 */
export function holidaysBetween(from: DateInput, to: DateInput): readonly JpHoliday[] {
  return sharedCalendar(jp).holidaysBetween(from, to);
}

/**
 * The calendar date in Japan time.
 * @param input - A date input.
 * @returns "YYYY-MM-DD".
 * @deprecated Since 0.10.0. Use `toDateString(input, "Asia/Tokyo")` from the root, or `dateOf(input)` of a calendar
 *   or schedule (same conversion; see docs/migration.md). Removed in 1.0.0.
 * @public
 */
export function toJapanDate(input: DateInput): DateString {
  return sharedCalendar(jp).dateOf(input);
}

/**
 * The calendar date and time ("HH:mm"; null for a date-only input) in Japan time.
 * @param input - A date input.
 * @returns A frozen `{ date, time }`.
 * @deprecated Since 0.10.0. Use `toDateTimeParts(input, "Asia/Tokyo")` from the root, or `civilOf(input)` of a
 *   calendar or schedule (same conversion and types; see docs/migration.md). Removed in 1.0.0.
 * @public
 */
export function toJapanDateTime(input: DateTimeInput): CivilDateTimeParts<string>;
/**
 * @deprecated Deprecated in 0.10.0. Use toDateTimeParts(input, "Asia/Tokyo") or civilOf(input)
 * @public
 */
export function toJapanDateTime(input: DateInput): CivilDateTimeParts;
export function toJapanDateTime(input: DateInput): CivilDateTimeParts {
  return sharedCalendar(jp).civilOf(input);
}

/**
 * Year and month of the reflected official gazette.
 * @deprecated Deprecated in 0.12.0. Use the provider's property jp.dataVersion (same value; docs/migration.md).
 *   Removed in 1.0.0
 * @public
 */
export const dataVersion: string = DATA_VERSION;
/**
 * The last year whose equinox days are confirmed by the official gazette.
 * @deprecated Deprecated in 0.12.0. Use the provider's property jp.confirmedThrough (same value;
 *   docs/migration.md). Removed in 1.0.0
 * @public
 */
export const confirmedThrough: number = CONFIRMED_THROUGH;

/**
 * @deprecated Renamed to `holidayOn` in 0.30.0 (same behaviour). Removed in 1.0.0.
 * @public
 */
export function getHoliday(input: DateInput): JpHoliday | undefined {
  return sharedCalendar(jp).holidayOn(input);
}

/**
 * @deprecated Renamed to JpHoliday in 0.30.0. Removed in 1.0.0
 * @public
 */
export type JapaneseHoliday = JpHoliday;

/**
 * @deprecated Renamed to JpHolidayKind in 0.30.0. Removed in 1.0.0
 * @public
 */
export type JapaneseHolidayKind = JpHolidayKind;

/**
 * @deprecated Renamed to KnownJpHolidayKind in 0.30.0 (the value "national" is "regular"). Removed in 1.0.0
 * @public
 */
export type KnownJapaneseHolidayKind = KnownJpHolidayKind;

/**
 * @deprecated Renamed to KnownJpHolidayKey in 0.30.0. Removed in 1.0.0
 * @public
 */
export type KnownJapaneseHolidayKey = KnownJpHolidayKey;
