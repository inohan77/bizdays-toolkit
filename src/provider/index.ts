/**
 * Calendar calculations for people who implement a holiday provider (HolidayProvider) (bizdays-toolkit/provider).
 *
 * The holidays of many countries and regions can be written as "the nth weekday of a month" (US federal
 * holidays, ...) and "days from Easter" (many European countries). These two calculations, the length of a month
 * and the leap-year test are published as the implementation the library uses internally (the Easter calculation
 * is verified against the official data of the bundled providers). Use them with addDays and weekdayOf of the
 * root.
 * The substitution of holidays that fall on a weekend (withSubstituteDays) has the same definition as the
 * calculation of the bundled providers with substitute days, and tests confirm that it agrees with their
 * verified results (the implementation of the bundled providers itself is not replaced).
 * Kept in a subpath, apart from the bundled providers, so that nothing unneeded enters the application.
 *
 */

import {
  addDays,
  lengthOfMonth as daysInMonthOf,
  easterSunday as easterSundayOf,
  formatDate,
  isLeapYear as isLeapYearOf,
  nthWeekdayOfMonth as nthWeekdayOfMonthIn,
  weekdayOf,
  type DateString,
  type Weekday,
} from "../core/date.ts";
import { describeValue, rangeError } from "../core/errors.ts";
import type { Holiday } from "../core/types.ts";
import { checkHolidays, checkMonth, checkOptions, checkYear } from "./checks.ts";

/**
 * Easter Sunday of a year (Gregorian calendar). Good Friday is 2 days before, Easter Monday 1 day after, Ascension
 * 39, Whit Monday 50 and Corpus Christi 60 days after (use addDays).
 * @param year - Integer from 1000 to 9999.
 * @returns "YYYY-MM-DD".
 * @throws RangeError `invalid-argument` for any other year.
 * @public
 */
export function easterSunday(year: number): DateString {
  checkYear(year);
  return easterSundayOf(year);
}

/**
 * The n-th given weekday of a month. Example: the third Monday of January is `nthWeekdayOfMonth(2026, 1, 1, 3)`; the
 * last Monday of May is `nthWeekdayOfMonth(2026, 5, 1, -1)`.
 * @param year - Integer from 1000 to 9999.
 * @param month - 1-12.
 * @param weekday - 0 (Sunday) to 6 (Saturday).
 * @param n - 1 to 5, or -1 for the last.
 * @returns "YYYY-MM-DD".
 * @throws RangeError `invalid-argument` for an invalid year, month or n, or when the month has no n-th such weekday
 *   (a fifth); `invalid-weekday` for an invalid weekday.
 * @public
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  n: number,
): DateString {
  checkYear(year);
  checkMonth(month);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw rangeError(
      "invalid-weekday",
      `weekday must be an integer from 0 (Sunday) to 6 (Saturday): ${describeValue(weekday)}`,
    );
  }
  if (!Number.isInteger(n) || n === 0 || n < -1 || n > 5) {
    throw rangeError(
      "invalid-argument",
      `n must be an integer from 1 to 5, or -1 (last): ${describeValue(n)}`,
    );
  }
  const days = daysInMonthOf(year, month);
  if (n === -1) {
    const last = formatDate(year, month, days);
    const offset = (weekdayOf(last) - weekday + 7) % 7;
    return formatDate(year, month, days - offset);
  }
  const first = ((weekday - weekdayOf(formatDate(year, month, 1)) + 7) % 7) + 1;
  if (first + (n - 1) * 7 > days) {
    throw rangeError(
      "invalid-argument",
      `${year}-${String(month).padStart(2, "0")} has no ${n}th weekday ${weekday}`,
    );
  }
  return nthWeekdayOfMonthIn(year, month, weekday, n);
}

/**
 * Number of days in a month (28-31).
 * @param year - Integer from 1000 to 9999.
 * @param month - 1-12.
 * @returns The number of days.
 * @throws RangeError `invalid-argument` for an invalid year or month.
 * @public
 */
export function lengthOfMonth(year: number, month: number): number {
  checkYear(year);
  checkMonth(month);
  return daysInMonthOf(year, month);
}

/**
 * Whether a year is a leap year (Gregorian calendar).
 * @param year - Integer from 1000 to 9999.
 * @returns true for a leap year.
 * @throws RangeError `invalid-argument` for an invalid year.
 * @public
 */
export function isLeapYear(year: number): boolean {
  checkYear(year);
  return isLeapYearOf(year);
}

/**
 * Direction of a substitution. "next" is the first candidate after the day, "previous" the first one before it.
 * @public
 */
export type SubstituteDirection = "next" | "previous";

/**
 * Options of withSubstituteDays.
 * @public
 */
export interface WithSubstituteDaysOptions<Kind extends string> {
  /**
   * The weekdays to substitute and their directions (0 = Sunday ... 6 = Saturday). Only holidays on the listed
   * weekdays are substituted. Examples: Japan and Singapore { 0: "next" }, the UK { 6: "next", 0: "next" }, US
   * federal holidays { 6: "previous", 0: "next" }.
   * The substitute is the first day that is not an input holiday, not a substitute decided so far and not on a
   * weekday listed here
   */
  readonly directions: Readonly<Partial<Record<Weekday, SubstituteDirection>>>;
  /** Kind given to substitute days (Holiday.kind; e.g. "substitute", "observed") */
  readonly kind: Kind;
  /**
   * Names of a substitute day (name, nameEn). When omitted, those of the original holiday are inherited (the
   * practice of GOV.UK and MOM). `names` are inherited from the original holiday even when the name is changed
   * (decisions.md #26).
   * To change them, give a function that takes the original holiday (e.g. Japan's substitute holiday name, the
   * US "(observed)")
   */
  readonly renameSubstitute?: (holiday: Holiday<Kind>) => {
    readonly name: string;
    readonly nameEn: string;
  };
  /**
   * Whether the original holiday (the day on a substituted weekday) stays in the result. "keep" (default) keeps
   * it (Japan, Singapore); "drop" leaves only the substitute (the GOV.UK list omits the weekend day)
   */
  readonly originalPolicy?: "keep" | "drop";
  /** @deprecated Renamed to renameSubstitute in 0.30.0. Removed in 1.0.0 */
  readonly name?: (holiday: Holiday<Kind>) => { readonly name: string; readonly nameEn: string };
  /** @deprecated Renamed to originalPolicy in 0.30.0. Removed in 1.0.0 */
  readonly original?: "keep" | "drop";
}

/**
 * Computes the substitute days for holidays that fall on given weekdays, and returns the input holidays plus the
 * substitutes, sorted by date. A tool for implementing providers.
 *
 * The holidays are processed in date order. For each holiday on a weekday listed in `directions`, the substitute is
 * the first day in that direction that is not an input holiday, not an earlier substitute and not on a listed
 * weekday. A substitute is never substituted again. It inherits `key`, `names` and `confirmed` of its holiday; its
 * `kind` is `options.kind`; its name is the holiday's unless `renameSubstitute` is given.
 *
 * @example US federal holidays (Saturday to the Friday before, Sunday to the Monday after)
 * withSubstituteDays(federal, { directions: { 6: "previous", 0: "next" }, kind: "observed",
 *   renameSubstitute: (h) => ({ name: `${h.name} (observed)`, nameEn: `${h.nameEn} (observed)` }) });
 * @example Japanese substitute holidays (a Sunday holiday moves to the next day that is not a holiday)
 * withSubstituteDays(holidays, { directions: { 0: "next" }, kind: "substitute",
 *   renameSubstitute: () => ({ name: "振替休日", nameEn: "Substitute Holiday" }) });
 * @param holidays - Holidays of one year, with valid and distinct dates.
 * @param options - `directions` (weekday → "next" | "previous"), `kind` of the substitutes, optional
 *   `renameSubstitute`, and `originalPolicy` ("keep", the default, keeps the holiday that was moved; "drop" returns
 *   only its substitute).
 * @returns A frozen array of frozen holidays (copies holding only the contract's properties). A substitute can fall
 *   in the adjacent year (December 31 on a Sunday moves to January 1); a provider must return it for the year it
 *   falls in. Country-specific rules (a day between two holidays) are not included.
 * @throws RangeError `invalid-argument`, `invalid-date`, `invalid-weekday` for invalid arguments or an invalid result
 *   of `renameSubstitute`; `invalid-option` when a key renamed in 0.30.0 is given under both its old and its new
 *   name; `out-of-range` when a substitute falls outside the years 1000-9999.
 * @public
 * @see decisions.md #4, #26
 */
export function withSubstituteDays<Kind extends string>(
  holidays: readonly Holiday<Kind>[],
  options: WithSubstituteDaysOptions<Kind>,
): readonly Holiday<Kind>[] {
  const input = checkHolidays<Kind>(holidays);
  const {
    directions: rules,
    kind,
    renameSubstitute: name,
    originalPolicy: original,
  } = checkOptions<Kind>(options);
  const sorted = [...input].sort((a, b) => (a.date < b.date ? -1 : 1));
  // Names in other languages become frozen copies not shared with the input (everything returned is frozen.
  // decisions.md #4)
  const namesOf = new Map(
    sorted.map((h) => [h, h.names === undefined ? undefined : Object.freeze({ ...h.names })]),
  );
  const taken = new Set<DateString>(sorted.map((h) => h.date));
  // Holidays returned as given also become frozen copies with the same properties as substitute days
  const result: Holiday<Kind>[] = sorted
    .filter((h) => original !== "drop" || rules[weekdayOf(h.date)] === undefined)
    .map((h) =>
      Object.freeze({
        date: h.date,
        name: h.name,
        nameEn: h.nameEn,
        ...(namesOf.get(h) === undefined ? {} : { names: namesOf.get(h)! }),
        kind: h.kind,
        confirmed: h.confirmed,
        ...(h.key === undefined ? {} : { key: h.key }),
      }),
    );
  for (const h of sorted) {
    const direction = rules[weekdayOf(h.date)];
    if (direction === undefined) continue;
    const step = direction === "next" ? 1 : -1;
    let day = addDays(h.date, step);
    while (taken.has(day) || rules[weekdayOf(day)] !== undefined) day = addDays(day, step);
    taken.add(day);
    const named = name === undefined ? { name: h.name, nameEn: h.nameEn } : name(h);
    // The names returned by the caller's function are checked too (so that a mistake does not surface only after
    // the result is used as a provider. decisions.md #26)
    if (
      typeof named !== "object" ||
      named === null ||
      typeof named.name !== "string" ||
      typeof named.nameEn !== "string"
    ) {
      throw rangeError(
        "invalid-argument",
        `options.renameSubstitute must return { name, nameEn } as strings (for ${h.date}): ${describeValue(named)}`,
      );
    }
    result.push(
      Object.freeze({
        date: day,
        name: named.name,
        nameEn: named.nameEn,
        ...(namesOf.get(h) === undefined ? {} : { names: namesOf.get(h)! }),
        kind,
        confirmed: h.confirmed,
        ...(h.key === undefined ? {} : { key: h.key }),
      }),
    );
  }
  // The returned array is frozen too (everything returned is frozen. decisions.md #4)
  return Object.freeze(result.sort((a, b) => (a.date < b.date ? -1 : 1)));
}

/**
 * @deprecated Renamed to withSubstituteDays in 0.30.0. Removed in 1.0.0
 * @public
 */
export const substituteDays: typeof withSubstituteDays = withSubstituteDays;

/**
 * @deprecated Renamed to lengthOfMonth in 0.30.0. Removed in 1.0.0
 * @public
 */
export const daysInMonth: typeof lengthOfMonth = lengthOfMonth;

/**
 * @deprecated Renamed to WithSubstituteDaysOptions in 0.30.0. Removed in 1.0.0
 * @public
 */
export type SubstituteDaysOptions<Kind extends string> = WithSubstituteDaysOptions<Kind>;
