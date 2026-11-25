// Argument checks of the helpers for building holiday providers (src/provider/index.ts). They are in a module
// of their own so that unit tests can import them: a function exported from an entry file is public at run time.

import { isValidDate, parseDate, type Weekday } from "../core/date.ts";
import { renameKeys } from "../core/renamed.ts";
import { describeValue, rangeError } from "../core/errors.ts";
import { checkNames } from "../core/names.ts";
import { isOptionsObject } from "../core/options.ts";
import { HOLIDAY_KEY_PATTERN, type Holiday } from "../core/types.ts";
import type { SubstituteDirection } from "./index.ts";

/**
 * Validates a year argument.
 * @throws RangeError `invalid-argument` unless it is an integer from 1000 to 9999.
 * @internal
 */
export function checkYear(year: unknown): asserts year is number {
  if (!Number.isInteger(year) || (year as number) < 1000 || (year as number) > 9999) {
    throw rangeError(
      "invalid-argument",
      `year must be an integer from 1000 to 9999: ${describeValue(year)}`,
    );
  }
}

/**
 * Validates a month argument.
 * @throws RangeError `invalid-argument` unless it is an integer from 1 to 12.
 * @internal
 */
export function checkMonth(month: unknown): asserts month is number {
  if (!Number.isInteger(month) || (month as number) < 1 || (month as number) > 12) {
    throw rangeError(
      "invalid-argument",
      `month must be an integer from 1 to 12: ${describeValue(month)}`,
    );
  }
}

/**
 * Validates the `holidays` argument of {@link withSubstituteDays}.
 * @param holidays - Expected: an array of Holiday objects of one year, without duplicate dates.
 * @returns The same array.
 * @throws RangeError `invalid-argument` when it is not an array, an item is not an object, the items span several
 *   years, a date repeats, or name, nameEn, kind, confirmed, key or names is invalid; `invalid-date` for an invalid
 *   date.
 * @see decisions.md #26
 * @internal
 */
export function checkHolidays<Kind extends string>(holidays: unknown): readonly Holiday<Kind>[] {
  if (!Array.isArray(holidays)) {
    throw rangeError("invalid-argument", "holidays must be an array of Holiday");
  }
  let year: number | undefined;
  const seen = new Set<string>();
  // A hole in an array is checked as one entry too (forEach skips holes)
  Array.from(holidays as unknown[]).forEach((h: unknown, i) => {
    if (typeof h !== "object" || h === null) {
      throw rangeError("invalid-argument", `holidays[${i}] is not an object`);
    }
    const { date, name, nameEn, kind, confirmed, key, names } = h as Record<string, unknown>;
    if (!isValidDate(date)) {
      throw rangeError("invalid-date", `holidays[${i}] has an invalid date ${describeValue(date)}`);
    }
    const y = parseDate(date).year;
    if (year === undefined) year = y;
    else if (y !== year) {
      throw rangeError(
        "invalid-argument",
        `holidays must be in one year: ${holidays[0].date} and ${date}`,
      );
    }
    if (seen.has(date))
      throw rangeError("invalid-argument", `holidays has a duplicate date ${date}`);
    seen.add(date);
    if (typeof name !== "string" || typeof nameEn !== "string" || typeof kind !== "string") {
      throw rangeError(
        "invalid-argument",
        `holidays[${i}] (${date}) must have string name, nameEn and kind`,
      );
    }
    if (typeof confirmed !== "boolean") {
      throw rangeError("invalid-argument", `holidays[${i}] (${date}) must have boolean confirmed`);
    }
    if (key !== undefined && (typeof key !== "string" || !HOLIDAY_KEY_PATTERN.test(key))) {
      throw rangeError(
        "invalid-argument",
        `holidays[${i}] (${date}) key must match ${String(HOLIDAY_KEY_PATTERN)}: ${describeValue(key)}`,
      );
    }
    // The same validation as for provider data (decisions.md #26)
    const problem = names === undefined ? undefined : checkNames(names);
    if (problem !== undefined)
      throw rangeError("invalid-argument", `holidays[${i}] (${date}) names: ${problem}`);
  });
  return holidays as readonly Holiday<Kind>[];
}

export interface CheckedOptions<Kind extends string> {
  readonly directions: Readonly<Partial<Record<Weekday, SubstituteDirection>>>;
  readonly kind: Kind;
  readonly renameSubstitute?: (holiday: Holiday<Kind>) => {
    readonly name: string;
    readonly nameEn: string;
  };
  readonly originalPolicy?: "keep" | "drop";
}

/**
 * Validates the options of {@link withSubstituteDays}; keys renamed in 0.30.0 are read.
 * @param options - The options as given.
 * @returns The options with `directions` reduced to the weekdays that have a direction (undefined entries dropped).
 * @throws RangeError `invalid-argument` when options or `directions` is not a plain object, a direction is not "next"
 *   or "previous", all seven weekdays have a direction, `kind` is not a non-empty string, `renameSubstitute` is not a
 *   function, or `originalPolicy` is not "keep" or "drop"; `invalid-option` when an old key and its new name are
 *   both given; `invalid-weekday` for a key that is not 0-6.
 * @see decisions.md #6, #8, #13
 * @internal
 */
export function checkOptions<Kind extends string>(options: unknown): CheckedOptions<Kind> {
  if (!isOptionsObject(options)) {
    throw rangeError("invalid-argument", "options must be an object");
  }
  const o = renameKeys("throw", ["substitute"], "options", options as Record<string, unknown>);
  const { directions: rules, kind, renameSubstitute: name, originalPolicy: original } = o;
  // Only a plain object is accepted (a Map or an array is not silently taken as empty. decisions.md #8)
  if (!isOptionsObject(rules)) {
    throw rangeError(
      "invalid-argument",
      `options.directions must be an object of { [weekday]: "next" | "previous" }: ${describeValue(rules)}`,
    );
  }
  // A weekday whose value is undefined equals omission (decisions.md #6)
  const entries = Object.entries(rules).filter(([, direction]) => direction !== undefined);
  for (const [weekday, direction] of entries) {
    if (!/^[0-6]$/.test(weekday)) {
      throw rangeError(
        "invalid-weekday",
        `options.directions has a weekday that is not 0 (Sunday) to 6 (Saturday): ${describeValue(weekday)}`,
      );
    }
    if (direction !== "next" && direction !== "previous") {
      throw rangeError(
        "invalid-argument",
        `options.directions[${weekday}] must be "next" or "previous": ${describeValue(direction)}`,
      );
    }
  }
  // With a direction for every weekday there is no substitute day (stopped at the entry; the same idea as
  // skipWeekdays. decisions.md #13)
  if (entries.length === 7) {
    throw rangeError(
      "invalid-argument",
      "options.directions must leave at least one weekday without a direction (there would be no day to move a holiday to)",
    );
  }
  if (typeof kind !== "string" || kind === "") {
    throw rangeError("invalid-argument", "options.kind must be a non-empty string (Holiday.kind)");
  }
  if (name !== undefined && typeof name !== "function") {
    throw rangeError(
      "invalid-argument",
      "options.renameSubstitute must be a function (holiday) => { name, nameEn }",
    );
  }
  if (original !== undefined && original !== "keep" && original !== "drop") {
    throw rangeError("invalid-argument", 'options.originalPolicy must be "keep" or "drop"');
  }
  return { ...o, directions: Object.fromEntries(entries) } as unknown as CheckedOptions<Kind>;
}
