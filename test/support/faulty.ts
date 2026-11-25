// Holiday providers into which failures are injected (T3 of the test expansion plan). They wrap the home-made
// provider with few supported years (test/support/provider.ts) and, in a given year only, throw, return wrong
// data or make the holidays unconfirmed. The supported years are 2025-2027, so that checks over all days stay
// fast.
import type { Holiday, HolidayProvider } from "../../src/index.ts";
import { SHORT_PROVIDER } from "./provider.ts";

type Provider = HolidayProvider<string>;
const base = SHORT_PROVIDER;
const wrap = (
  id: string,
  holidaysInYear: Provider["holidaysInYear"],
  extra: Partial<Provider> = {},
): Provider => ({
  ...base,
  id,
  holidaysInYear,
  ...extra,
});

/** Throws (a RangeError) when the year `year` is looked up */
export function throwingInYear(year: number): Provider {
  return wrap(`THROW-${year}`, (y) => {
    if (y === year) throw new RangeError(`injected failure for ${y}`);
    return base.holidaysInYear(y);
  });
}

/**
 * Kinds of wrong data: a wrong date format, a duplicate day, an entry that is not an object, an array with a hole
 * (a hole equals an undefined entry)
 */
export type InvalidData = "format" | "duplicate" | "type" | "hole";

/** Returns wrong data (of kind `kind`) for the year `year` only */
export function invalidDataInYear(year: number, kind: InvalidData): Provider {
  return wrap(`BAD-${kind}-${year}`, (y) => {
    const list = base.holidaysInYear(y);
    if (y !== year) return list;
    if (kind === "format")
      return [
        ...list,
        { date: `${y}/07/01`, name: "x", nameEn: "x", kind: "regular", key: "x", confirmed: true },
      ];
    if (kind === "duplicate") return [...list, list[0]!];
    if (kind === "hole") {
      // Leaves one hole before the correct entries (map and forEach skip holes: does the validation miss the
      // hole? The entries after the hole are correct, so skipping the hole would hide the mistake)
      const holed: Holiday<string>[] = [...list];
      holed[holed.length + 1] = {
        date: `${y}-12-30`,
        name: "x",
        nameEn: "x",
        kind: "regular",
        key: "x",
        confirmed: true,
      };
      return holed;
    }
    return [...list, 42 as unknown as Holiday<string>];
  });
}

/**
 * Makes only the holidays of the year `year` unconfirmed (confirmed: false) (the years around stay confirmed;
 * confirmedThrough is the year before `year`)
 */
export function unconfirmedInYear(year: number): Provider {
  return wrap(
    `UNCONFIRMED-${year}`,
    (y) => base.holidaysInYear(y).map((h) => (y === year ? { ...h, confirmed: false } : h)),
    { confirmedThrough: year - 1 },
  );
}

/**
 * Per year, returns correct data up to the `calls`-th call and throws afterwards (with `year`, in that year
 * only; with `code`, the error gets the code). A provider outside the provider contract (the same result for
 * the same year): it passes the first check of the diagnostics (which looks up every supported year once) and
 * throws during the diagnostics between rules. Used by the test that the catch clauses of the diagnostics are
 * reached (test/catch-paths.test.ts)
 */
export function throwingAfter(
  calls: number,
  options: { year?: number; code?: string } = {},
): Provider {
  const count = new Map<number, number>();
  return wrap(`LATE-${calls}-${options.year ?? "all"}`, (y) => {
    const n = (count.get(y) ?? 0) + 1;
    count.set(y, n);
    if (n > calls && (options.year === undefined || y === options.year)) {
      const error = new RangeError(`injected late failure for ${y}`) as RangeError & {
        code?: string;
      };
      if (options.code !== undefined) error.code = options.code;
      throw error;
    }
    return base.holidaysInYear(y);
  });
}

/** Days of the injected year (2026), its holidays, and days of the years around */
export const INJECTED_YEAR = 2026;
export const DAY_IN_INJECTED_YEAR = "2026-03-03";
export const HOLIDAY_IN_INJECTED_YEAR = "2026-05-04";
export const DAY_BEFORE = "2025-03-03";
export const HOLIDAY_AFTER = "2027-05-04";
