/**
 * Month ("YYYY-MM") arithmetic: the closing month (closingMonth), the month n months later (monthOf).
 *
 * Pure calendar arithmetic without business days, so it works without a calendar. Month calculations that
 * consider business days (nth business day of a month, due dates) are methods of the business calendar.
 */

import { addDays, lengthOfMonth, formatDate, parseDate, type DateString } from "./date.ts";
import { describeValue, rangeError } from "./errors.ts";

/**
 * A month as a "YYYY-MM" string.
 * @public
 */
export type MonthString = string;

const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** @internal Year and month */
export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/**
 * Splits a month string into year and month.
 * @param value - "YYYY-MM" with a year of 1000 or later and a month 01-12.
 * @returns `{ year, month }`.
 * @throws RangeError `invalid-month` for any other value, including non-strings.
 * @internal
 */
export function parseMonth(value: unknown): YearMonth {
  const m = typeof value === "string" ? MONTH_RE.exec(value) : null;
  const year = Number(m?.[1]);
  const month = Number(m?.[2]);
  if (!m || year < 1000 || month < 1 || month > 12) {
    throw rangeError("invalid-month", `Invalid month: ${describeValue(value)} (expected YYYY-MM)`);
  }
  return { year, month };
}

/**
 * Builds "YYYY-MM" from a year and a month.
 * @param ym - Year and month (the month is not validated).
 * @returns The month string.
 * @throws RangeError `out-of-range` when the year is outside 1000-9999.
 * @internal
 */
export function formatMonth({ year, month }: YearMonth): MonthString {
  if (year < 1000 || year > 9999) {
    throw rangeError("out-of-range", `Year out of range (1000-9999): ${year}`);
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * The year and month `offset` months later (earlier when negative).
 * @param ym - Year and month.
 * @param offset - Integer number of months.
 * @returns A new `{ year, month }`; the year is not range-checked.
 * @internal
 */
export function shiftMonth({ year, month }: YearMonth, offset: number): YearMonth {
  const index = year * 12 + (month - 1) + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * A day of a month as a date, with "last day" handling.
 * @param ym - Year and month.
 * @param day - 1-31, or -1 for the last day. A day beyond the end of the month reads as the last day.
 * @returns "YYYY-MM-DD".
 * @throws RangeError `invalid-date` for a day below 1 other than -1; `out-of-range` for a year outside 1000-9999.
 * @internal
 */
export function dayOfMonth({ year, month }: YearMonth, day: number): DateString {
  const last = lengthOfMonth(year, month);
  return formatDate(year, month, day === -1 || day > last ? last : day);
}

/**
 * Whether a value is a valid day-of-month setting: an integer 1-31, or -1 (last day).
 * @internal
 */
export const isDayOfMonthValue = (v: unknown): v is number =>
  v === -1 || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31);

/**
 * The month `offset` months after the month of a date or a month.
 *
 * @example
 * monthOf("2026-10-16"); // "2026-10"
 * monthOf("2026-10-16", 1); // "2026-11"
 * monthOf("2026-01", -1); // "2025-12"
 * @param input - "YYYY-MM-DD" or "YYYY-MM". A string with three or more hyphen-separated parts is read as a date.
 * @param offset - Integer number of months; default 0.
 * @returns "YYYY-MM".
 * @throws RangeError `invalid-argument` when offset is not an integer; `invalid-date` or `invalid-month` for an
 *   invalid input; `out-of-range` when the result is outside the years 1000-9999.
 * @public
 * @see decisions.md #8
 */
export function monthOf(input: DateString | MonthString, offset = 0): MonthString {
  if (!Number.isInteger(offset)) {
    throw rangeError("invalid-argument", `offset must be an integer: ${describeValue(offset)}`);
  }
  // Read like closingPeriod (three or more hyphen-separated parts mean a calendar date. decisions.md #8)
  const base: YearMonth =
    typeof input === "string" && readsAsDate(input) ? parseDate(input) : parseMonth(input);
  return formatMonth(shiftMonth(base, offset));
}

/**
 * The month a date belongs to when months are cut at a closing day: the day after a closing day up to the next
 * closing day belongs to the month of that next closing day (closing on the 20th: October 21 to November 20 is
 * November).
 *
 * @example
 * closingMonth("2026-10-20", 20); // "2026-10"
 * closingMonth("2026-10-21", 20); // "2026-11"
 * closingMonth("2026-10-31", -1); // "2026-10" (closing on the last day)
 * @param date - "YYYY-MM-DD".
 * @param closingDayOfMonth - 1-31, or -1 for the last day. A day beyond the end of a month reads as its last day (31
 *   in February: the 28th or 29th).
 * @returns "YYYY-MM".
 * @throws RangeError `invalid-argument` for an invalid closing day; `invalid-date` for an invalid date;
 *   `out-of-range` when the result is outside the years 1000-9999.
 * @public
 */
export function closingMonth(date: DateString, closingDayOfMonth: number): MonthString {
  checkClosingDay(closingDayOfMonth);
  const { year, month, day } = parseDate(date);
  return formatMonth(
    shiftMonth({ year, month }, day <= closingDayIn({ year, month }, closingDayOfMonth) ? 0 : 1),
  );
}

/**
 * Validates a closing day.
 * @param closingDayOfMonth - Expected: an integer 1-31, or -1.
 * @throws RangeError `invalid-argument` otherwise.
 * @internal
 */
export function checkClosingDay(closingDayOfMonth: number): void {
  if (!isDayOfMonthValue(closingDayOfMonth)) {
    throw rangeError(
      "invalid-argument",
      `closingDayOfMonth must be an integer from 1 to 31, or -1 (last day): ${describeValue(closingDayOfMonth)}`,
    );
  }
}

/**
 * The closing day (day of the month) in a given month.
 * @param ym - Year and month.
 * @param closingDayOfMonth - A valid closing day (1-31 or -1).
 * @returns The last day of the month for -1 or a day beyond its end; otherwise `closingDayOfMonth`.
 * @internal
 * @see decisions.md #23
 */
export function closingDayIn({ year, month }: YearMonth, closingDayOfMonth: number): number {
  const last = lengthOfMonth(year, month);
  return closingDayOfMonth === -1 || closingDayOfMonth > last ? last : closingDayOfMonth;
}

/**
 * Whether an argument that accepts both a month and a date is read as a date: true when the string has three or more
 * hyphen-separated parts.
 * @internal
 * @see decisions.md #8
 */
export const readsAsDate = (input: string): boolean => input.split("-").length >= 3;

/**
 * The period (both ends inclusive) of a month cut at a closing day: from the day after the previous month's closing
 * day to the month's closing day. Inverse of {@link closingMonth}.
 *
 * @example
 * closingPeriod("2026-11", 20); // { from: "2026-10-21", to: "2026-11-20" }
 * closingPeriod("2026-10", -1); // { from: "2026-10-01", to: "2026-10-31" } (closing on the last day)
 * closingPeriod("2026-03", 31); // { from: "2026-03-01", to: "2026-03-31" } (February closes on its last day)
 * closingPeriod("2026-11-05", 20); // { from: "2026-10-21", to: "2026-11-20" } (the period this day belongs to)
 * @param input - "YYYY-MM", or a date "YYYY-MM-DD" meaning the period that day belongs to. A non-string is reported
 *   as an invalid month.
 * @param closingDayOfMonth - 1-31, or -1 for the last day.
 * @returns A frozen `{ from, to }` of date strings (the shape of a DateRange, without `name`).
 * @throws RangeError `invalid-argument` for an invalid closing day; `invalid-month` or `invalid-date` for an invalid
 *   input; `out-of-range` when a date is outside the years 1000-9999.
 * @public
 */
export function closingPeriod(
  input: DateString | MonthString,
  closingDayOfMonth: number,
): { readonly from: DateString; readonly to: DateString } {
  checkClosingDay(closingDayOfMonth);
  // A value that is not a string is read as a wrong month (invalid-month); the parameter type is string only
  const month =
    typeof input === "string" && readsAsDate(input)
      ? parseMonth(closingMonth(input as DateString, closingDayOfMonth))
      : parseMonth(input);
  const previous = shiftMonth(month, -1);
  const to = dayOfMonth(month, closingDayIn(month, closingDayOfMonth));
  const from = addDays(dayOfMonth(previous, closingDayIn(previous, closingDayOfMonth)), 1);
  return Object.freeze({ from, to });
}
