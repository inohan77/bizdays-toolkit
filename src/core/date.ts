/**
 * Calendar-date arithmetic (dates without a time zone).
 *
 * A date is always a "YYYY-MM-DD" string; calculations convert it to the number of days since 1970-01-01
 * (the day number). The local time of Date objects is never used.
 */

import { describeValue, rangeError } from "./errors.ts";

/**
 * A calendar date as a "YYYY-MM-DD" string.
 * @public
 */
export type DateString = string;

/**
 * Day of the week (0 = Sunday ... 6 = Saturday, as Date#getDay).
 * @public
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

// The last parsed value (one judgement parses the same date string many times; only the parse result is kept,
// never a judgement result. decisions.md #16). It starts with a valid entry: an empty state would equal a
// value that is not a string.
let lastValue = "2000-01-01";
let lastParts: { readonly year: number; readonly month: number; readonly day: number } =
  Object.freeze({ year: 2000, month: 1, day: 1 });

/**
 * Splits a calendar date string into year, month and day.
 * @param value - "YYYY-MM-DD" with a 4-digit year from 1000 to 9999.
 * @returns A frozen `{ year, month, day }`. The last parsed string is cached, so the same object may be returned
 *   again.
 * @throws RangeError `invalid-date` when the value is not a string, not in that form, has a year below 1000, or is
 *   not a day that exists.
 * @see decisions.md #16
 */
export function parseDate(value: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  if (value === lastValue) return lastParts;
  // A value that is not a string is not passed to the regular expression (a Symbol cannot become a string: TypeError)
  const m = typeof value === "string" ? DATE_RE.exec(value) : null;
  if (!m) {
    throw rangeError(
      "invalid-date",
      `Invalid date string: ${describeValue(value)} (expected YYYY-MM-DD)`,
    );
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > lengthOfMonth(year, month)) {
    throw rangeError("invalid-date", `Invalid date: ${describeValue(value)}`);
  }
  lastValue = value;
  return (lastParts = Object.freeze({ year, month, day }));
}

/**
 * Whether the input is a valid calendar date string "YYYY-MM-DD" (year 1000-9999, an existing day).
 * @param input - Any value.
 * @returns true only for such a string; never throws.
 * @public
 */
export function isValidDate(input: unknown): input is DateString {
  if (typeof input !== "string") return false;
  try {
    parseDate(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds "YYYY-MM-DD" from year, month and day.
 * @param year - Integer from 1000 to 9999.
 * @param month - 1-12.
 * @param day - Day of the month.
 * @param exists - true when the caller guarantees the day exists: month and day are then not validated and the result
 *   is stored in the cache of {@link parseDate}.
 * @returns The date string.
 * @throws RangeError `out-of-range` when the year is not an integer from 1000 to 9999; `invalid-date` when the day
 *   does not exist (only without `exists`).
 * @see decisions.md #16
 */
export function formatDate(year: number, month: number, day: number, exists?: boolean): DateString {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw rangeError("out-of-range", `Year out of range (1000-9999): ${year}`);
  }
  const s = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!exists) parseDate(s);
  else [lastValue, lastParts] = [s, Object.freeze({ year, month, day })];
  return s;
}

/**
 * Whether a year is a leap year in the Gregorian calendar.
 * @param year - Year.
 * @returns true for a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Number of days in a month.
 * @param year - Year (only used for February).
 * @param month - 1-12.
 * @returns 28 to 31.
 * @throws RangeError `invalid-date` when the month is not 1-12.
 */
export function lengthOfMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const days = MONTH_DAYS[month - 1];
  if (days === undefined)
    throw rangeError("invalid-date", `Invalid month: ${describeValue(month)}`);
  return days;
}

/**
 * Day number of a date: days since 1970-01-01 (negative before it).
 * @param date - "YYYY-MM-DD".
 * @returns An integer.
 * @throws RangeError `invalid-date` for an invalid date string.
 */
export function toDayNumber(date: DateString): number {
  const { year, month, day } = parseDate(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/**
 * Date string of a day number. Inverse of {@link toDayNumber}.
 * @param dayNumber - Integer number of days since 1970-01-01. Not validated to be an integer.
 * @returns "YYYY-MM-DD".
 * @throws RangeError `out-of-range` when the year is outside 1000-9999.
 */
export function fromDayNumber(dayNumber: number): DateString {
  const d = new Date(dayNumber * MS_PER_DAY);
  return formatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), true);
}

/**
 * The date n days after a date (before it when n is negative).
 * @param date - "YYYY-MM-DD".
 * @param n - Integer number of days.
 * @returns "YYYY-MM-DD".
 * @throws RangeError `invalid-argument` when n is not an integer; `invalid-date` for an invalid date; `out-of-range`
 *   when the result is outside the years 1000-9999.
 * @public
 */
export function addDays(date: DateString, n: number): DateString {
  if (!Number.isInteger(n)) {
    throw rangeError("invalid-argument", `n must be an integer: ${describeValue(n)}`);
  }
  return fromDayNumber(toDayNumber(date) + n);
}

/**
 * Number of days from one date to another.
 * @param from - "YYYY-MM-DD".
 * @param to - "YYYY-MM-DD".
 * @returns `to` minus `from` in days (positive when `to` is later).
 * @throws RangeError `invalid-date` for an invalid date.
 * @public
 */
export function diffDays(from: DateString, to: DateString): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * Day of the week of a date.
 * @param date - "YYYY-MM-DD".
 * @returns 0 (Sunday) to 6 (Saturday), as Date#getDay.
 * @throws RangeError `invalid-date` for an invalid date.
 * @public
 */
export function weekdayOf(date: DateString): Weekday {
  // 1970-01-01 is a Thursday (4)
  return ((((toDayNumber(date) + 4) % 7) + 7) % 7) as Weekday;
}

/**
 * The n-th given weekday of a month.
 * @param year - Year, 1000-9999.
 * @param month - 1-12.
 * @param weekday - 0 (Sunday) to 6.
 * @param n - 1 for the first, 2 for the second, ...
 * @returns "YYYY-MM-DD".
 * @throws RangeError `invalid-date` when the month has no n-th such weekday; `out-of-range` for a year outside
 *   1000-9999.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  n: number,
): DateString {
  const offset = (weekday - weekdayOf(formatDate(year, month, 1)) + 7) % 7;
  return formatDate(year, month, 1 + offset + (n - 1) * 7);
}

/**
 * Easter Sunday of a year in the Gregorian calendar (anonymous Gregorian algorithm).
 * @param year - Year; not validated here (the public entry in bizdays-toolkit/provider validates it).
 * @returns "YYYY-MM-DD".
 * @throws RangeError `out-of-range` for a year outside 1000-9999.
 */
export function easterSunday(year: number): DateString {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatDate(year, month, day);
}
