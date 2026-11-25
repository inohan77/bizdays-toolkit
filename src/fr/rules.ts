/**
 * Calculation of the public holidays of France (jours fériés: the 11 days of article L3133-1 of the Labour Code
 * and the 2 days of Alsace-Moselle).
 *
 * - Fixed-date holidays (1/1, 5/1, 5/8, 7/14, 8/15, 11/1, 11/11, 12/25; also 12/26 in Alsace-Moselle) and
 *   holidays tied to Easter (Lundi de Pâques = +1 day, Ascension = +39 days, Lundi de Pentecôte = +50 days; also
 *   Vendredi saint = −2 days in Alsace-Moselle) are computed by rule. There is no substitution
 * - In years in which two holidays fall on the same day (Easter on March 23: May 1 = Ascension; on March 30:
 *   May 8 = Ascension), they become one entry with the name and key of the holiday tied to Easter (as in the JSON
 *   of data.gouv.fr; a provider's contract is one entry per day)
 * - Names follow data.gouv.fr (French). nameEn is the library's English translation
 * - Keys: one per holiday, from the English name (KnownFrHolidayKey)
 *
 * A test fixture (test/fixtures/datagouv-jours-feries.json) verifies that every date and name agrees in the part
 * of the supported years published by data.gouv.fr (20 years back, 5 years ahead). Holidays are set by law
 * without yearly announcements, so all supported years are confirmed: true (a change in the law would be
 * reflected as an amendment of the Labour Code).
 */

import { addDays, easterSunday, formatDate, type DateString } from "../core/date.ts";
import { describeValue, rangeError } from "../core/errors.ts";
import type { Holiday, HolidayProvider } from "../core/types.ts";

/**
 * Kinds of holidays of France (known values).
 * @public
 */
export type KnownFrHolidayKind =
  /** Holiday set by the Labour Code or local law (there are no substitute or special holidays) */
  "regular";

/**
 * Kind of a holiday of France. Later versions may add values, so handle "anything else" when branching.
 * Use KnownFrHolidayKind to check by type that every value is handled.
 * @public
 */
export type FrHolidayKind = KnownFrHolidayKind | (string & {});

/**
 * Keys of the holidays of France (Holiday.key; known values). One per holiday, from the English name.
 * Used for completion when writing `keys` of a rule (the type is open, so other strings pass too).
 * @namingSource holiday-key
 * @public
 */
export type KnownFrHolidayKey =
  | "new-year"
  | "easter-monday"
  | "labour-day"
  | "victory-in-europe"
  | "ascension"
  | "pentecost-monday"
  | "bastille"
  | "assumption"
  | "all-saints"
  | "armistice"
  | "christmas"
  | "good-friday"
  | "saint-stephens";

/** @internal Region (zone of data.gouv.fr) */
export type FrZone = "metropole" | "alsace-moselle";

/** @internal Supported years */
export const SUPPORTED_YEARS = Object.freeze({ from: 2000, to: 2099 });
/** @internal Year and month of the reflected data.gouv.fr data (publication of 2006-2031) */
export const DATA_VERSION = "2026-10";

interface Entry {
  readonly date: DateString;
  readonly name: string;
  readonly nameEn: string;
  readonly key: KnownFrHolidayKey;
}

/** Fixed-date holidays [month, day, name, English name, key] */
const FIXED: readonly (readonly [number, number, string, string, KnownFrHolidayKey])[] = [
  [1, 1, "1er janvier", "New Year’s Day", "new-year"],
  [5, 1, "1er mai", "Labour Day", "labour-day"],
  [5, 8, "8 mai", "Victory in Europe Day", "victory-in-europe"],
  [7, 14, "14 juillet", "Bastille Day", "bastille"],
  [8, 15, "Assomption", "Assumption", "assumption"],
  [11, 1, "Toussaint", "All Saints’ Day", "all-saints"],
  [11, 11, "11 novembre", "Armistice Day", "armistice"],
  [12, 25, "Jour de Noël", "Christmas Day", "christmas"],
];
const FIXED_ALSACE_MOSELLE: readonly (readonly [
  number,
  number,
  string,
  string,
  KnownFrHolidayKey,
])[] = [[12, 26, "2ème jour de Noël", "Saint Stephen’s Day", "saint-stephens"]];

/** Holidays tied to Easter [offset in days, name, English name, key] */
const EASTER_BASED: readonly (readonly [number, string, string, KnownFrHolidayKey])[] = [
  [1, "Lundi de Pâques", "Easter Monday", "easter-monday"],
  [39, "Ascension", "Ascension Day", "ascension"],
  [50, "Lundi de Pentecôte", "Pentecost Monday", "pentecost-monday"],
];
const EASTER_BASED_ALSACE_MOSELLE: readonly (readonly [
  number,
  string,
  string,
  KnownFrHolidayKey,
])[] = [[-2, "Vendredi saint", "Good Friday", "good-friday"]];

/**
 * Computes the French public holidays of a year for a zone: fixed dates and days counted from Easter; Alsace-Moselle
 * adds its two local holidays.
 * @param zone - "metropole" or "alsace-moselle".
 * @param year - Integer within SUPPORTED_YEARS.
 * @returns New frozen holidays sorted by date, one per date, all of kind "regular" and confirmed.
 * @throws RangeError `invalid-argument` when the year is not an integer; `out-of-range` outside the supported years.
 * @internal
 */
export function computeFrHolidays(zone: FrZone, year: number): Holiday<FrHolidayKind>[] {
  // A year that is not an integer (the string "2026", ...) is a wrong argument, not out of range (see
  // KnownErrorCode)
  if (!Number.isInteger(year))
    throw rangeError(
      "invalid-argument",
      `Invalid year: ${describeValue(year)} (expected an integer)`,
    );
  if (year < SUPPORTED_YEARS.from || year > SUPPORTED_YEARS.to) {
    throw rangeError(
      "out-of-range",
      `French public holidays are supported for ${SUPPORTED_YEARS.from}-${SUPPORTED_YEARS.to}; requested ${year}`,
    );
  }
  const alsaceMoselle = zone === "alsace-moselle";
  const byDate = new Map<DateString, Entry>();
  for (const [month, day, name, nameEn, key] of alsaceMoselle
    ? [...FIXED, ...FIXED_ALSACE_MOSELLE]
    : FIXED) {
    byDate.set(formatDate(year, month, day), {
      date: formatDate(year, month, day),
      name,
      nameEn,
      key,
    });
  }
  // In a year in which a holiday tied to Easter falls on a fixed date, the Easter side overwrites it (as in the
  // JSON of data.gouv.fr)
  const easter = easterSunday(year);
  for (const [offset, name, nameEn, key] of alsaceMoselle
    ? [...EASTER_BASED_ALSACE_MOSELLE, ...EASTER_BASED]
    : EASTER_BASED) {
    const date = addDays(easter, offset);
    byDate.set(date, { date, name, nameEn, key });
  }
  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) =>
      Object.freeze({
        date: e.date,
        name: e.name,
        nameEn: e.nameEn,
        kind: "regular" as const,
        confirmed: true,
        key: e.key,
      }),
    );
}

/**
 * Creates a French provider for a zone.
 * @param id - Provider ID.
 * @param zone - "metropole" or "alsace-moselle".
 * @returns A frozen HolidayProvider (time zone Europe/Paris) that caches each year.
 * @internal
 */
export function createFrProvider(id: string, zone: FrZone): HolidayProvider<FrHolidayKind> {
  const cache = new Map<number, readonly Holiday<FrHolidayKind>[]>();
  return Object.freeze({
    id,
    timeZone: "Europe/Paris",
    supportedYears: SUPPORTED_YEARS,
    dataVersion: DATA_VERSION,
    /**
     * The holidays of a year, computed once and cached.
     * @param year - A supported year.
     * @returns A frozen array of frozen holidays sorted by date.
     * @throws RangeError `invalid-argument` when the year is not an integer; `out-of-range` outside the supported
     *   years.
     */
    holidaysInYear(year: number): readonly Holiday<FrHolidayKind>[] {
      let list = cache.get(year);
      if (!list) {
        list = Object.freeze(computeFrHolidays(zone, year));
        cache.set(year, list);
      }
      return list;
    },
  });
}
