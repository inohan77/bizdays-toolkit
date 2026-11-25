/**
 * Table of the public holidays of Singapore, and the substitution rule.
 *
 * Chinese New Year, Hari Raya, Vesak Day and Deepavali follow the lunar, Islamic and Hindu calendars and cannot
 * be computed by rule. Unlike the countries computed by rule, the dates gazetted per year by MOM (Ministry of
 * Manpower) are the authority and are kept in a table.
 * Only substitution is computed, by section 4 of the Holidays Act (1998 edition) - when a holiday falls on a
 * Sunday, the first following day that is not itself a holiday is a holiday - and is not in the table. A holiday
 * on a Saturday is not substituted (the employer gives a day off or pay).
 *
 * Keys: one per annual holiday (KnownSgHolidayKey; the two days of Chinese New Year share a key). A substitute
 * day has the key of its holiday; Polling Day has none.
 * Names follow the spelling of MOM's press releases (the apostrophe is ’). All days are verified against the
 * data of collection 691 (MOM) of data.gov.sg (test/fixtures/datagovsg-public-holidays.json). The 2022 data of
 * data.gov.sg differs from MOM's revised gazette (KNOWN_DIFFERENCES in scripts/verify-datagovsg.ts), so the
 * gazette is the authority.
 */

import { addDays, formatDate, weekdayOf, type DateString } from "../core/date.ts";
import { describeValue, rangeError } from "../core/errors.ts";
import type { Holiday } from "../core/types.ts";

/**
 * Kinds of holidays of Singapore (known values).
 * @public
 */
export type KnownSgHolidayKind =
  /** Annual holiday (the schedule to the Holidays Act and the dates gazetted per year) */
  | "regular"
  /** Substitute for a holiday on a Sunday (section 4 of the Holidays Act) */
  | "substitute"
  /** Special holiday by gazette (Polling Day, ...) */
  | "special";

/**
 * Kind of a holiday of Singapore. Later versions may add values, so handle "anything else" when branching.
 * Use KnownSgHolidayKind to check by type that every value is handled.
 * @public
 */
export type SgHolidayKind = KnownSgHolidayKind | (string & {});

/**
 * Keys of the annual holidays of Singapore (Holiday.key; known values). One per annual holiday (the two days of
 * Chinese New Year share a key).
 * A substitute day has the key of its holiday; a special holiday (Polling Day) has no key.
 * Used for completion when writing `keys` of a rule (the type is open, so other strings pass too).
 * @namingSource holiday-key
 * @public
 */
export type KnownSgHolidayKey =
  | "new-year"
  | "chinese-new-year"
  | "good-friday"
  | "labour-day"
  | "hari-raya-puasa"
  | "vesak"
  | "hari-raya-haji"
  | "national-day"
  | "deepavali"
  | "christmas";

/** @internal Supported years (the years in the table; later years cannot be predicted and are out-of-range) */
export const SUPPORTED_YEARS = Object.freeze({ from: 2020, to: 2027 });
/**
 * @internal The last year whose dates MOM has gazetted (equal to the end of the supported years; every year in
 * the table is confirmed)
 */
export const CONFIRMED_THROUGH = 2027;
/** @internal Year and month of the reflected update of collection 691 of data.gov.sg (publication of 2027) */
export const DATA_VERSION = "2026-07";

const NEW_YEAR = "New Year’s Day";
const CNY = "Chinese New Year";
const GOOD_FRIDAY = "Good Friday";
const LABOUR = "Labour Day";
const PUASA = "Hari Raya Puasa";
const VESAK = "Vesak Day";
const HAJI = "Hari Raya Haji";
const NATIONAL = "National Day";
const DEEPAVALI = "Deepavali";
const CHRISTMAS = "Christmas Day";
const POLLING = "Polling Day";

/** From name to key (Polling Day has none) */
const KEY_OF: Readonly<Record<string, KnownSgHolidayKey>> = {
  [NEW_YEAR]: "new-year",
  [CNY]: "chinese-new-year",
  [GOOD_FRIDAY]: "good-friday",
  [LABOUR]: "labour-day",
  [PUASA]: "hari-raya-puasa",
  [VESAK]: "vesak",
  [HAJI]: "hari-raya-haji",
  [NATIONAL]: "national-day",
  [DEEPAVALI]: "deepavali",
  [CHRISTMAS]: "christmas",
};

/**
 * Holidays that move by year (month-day and name). Fixed-date holidays (1/1, 5/1, 8/9, 12/25) are not in the
 * table and are added below
 */
const MOVABLE: Readonly<Record<number, readonly (readonly [string, string])[]>> = {
  2020: [
    ["01-25", CNY],
    ["01-26", CNY],
    ["04-10", GOOD_FRIDAY],
    ["05-07", VESAK],
    ["05-24", PUASA],
    ["07-31", HAJI],
    ["11-14", DEEPAVALI],
  ],
  2021: [
    ["02-12", CNY],
    ["02-13", CNY],
    ["04-02", GOOD_FRIDAY],
    ["05-13", PUASA],
    ["05-26", VESAK],
    ["07-20", HAJI],
    ["11-04", DEEPAVALI],
  ],
  // Hari Raya Puasa and Haji of 2022 were revised to 5/3 and 7/10 by MOM's press release of 2021-10-21
  // (data.gov.sg has the form before the revision)
  2022: [
    ["02-01", CNY],
    ["02-02", CNY],
    ["04-15", GOOD_FRIDAY],
    ["05-03", PUASA],
    ["05-15", VESAK],
    ["07-10", HAJI],
    ["10-24", DEEPAVALI],
  ],
  2023: [
    ["01-22", CNY],
    ["01-23", CNY],
    ["04-07", GOOD_FRIDAY],
    ["04-22", PUASA],
    ["06-02", VESAK],
    ["06-29", HAJI],
    ["11-12", DEEPAVALI],
  ],
  2024: [
    ["02-10", CNY],
    ["02-11", CNY],
    ["03-29", GOOD_FRIDAY],
    ["04-10", PUASA],
    ["05-22", VESAK],
    ["06-17", HAJI],
    ["10-31", DEEPAVALI],
  ],
  2025: [
    ["01-29", CNY],
    ["01-30", CNY],
    ["03-31", PUASA],
    ["04-18", GOOD_FRIDAY],
    ["05-12", VESAK],
    ["06-07", HAJI],
    ["10-20", DEEPAVALI],
  ],
  2026: [
    ["02-17", CNY],
    ["02-18", CNY],
    ["03-21", PUASA],
    ["04-03", GOOD_FRIDAY],
    ["05-27", HAJI],
    ["05-31", VESAK],
    ["11-08", DEEPAVALI],
  ],
  2027: [
    ["02-06", CNY],
    ["02-07", CNY],
    ["03-10", PUASA],
    ["03-26", GOOD_FRIDAY],
    ["05-17", HAJI],
    ["05-20", VESAK],
    ["10-28", DEEPAVALI],
  ],
};

/** Special holidays by gazette (polling days of general and presidential elections) */
const SPECIAL_DAYS: readonly (readonly [DateString, string])[] = [
  ["2020-07-10", POLLING],
  ["2023-09-01", POLLING],
  ["2025-05-03", POLLING],
];

const FIXED: readonly (readonly [number, number, string])[] = [
  [1, 1, NEW_YEAR],
  [5, 1, LABOUR],
  [8, 9, NATIONAL],
  [12, 25, CHRISTMAS],
];

interface Entry {
  readonly date: DateString;
  readonly name: string;
  readonly kind: KnownSgHolidayKind;
}

/**
 * Computes the Singapore public holidays of a year: fixed dates, the listed movable dates of that year, special days,
 * and for each holiday on a Sunday the next day that is not a holiday (kind "substitute").
 * @param year - Integer; a year present in the MOVABLE table.
 * @returns New frozen holidays sorted by date, all confirmed; `nameEn` equals `name`.
 * @throws RangeError `invalid-argument` when the year is not an integer; `out-of-range` for a year without data.
 * @internal
 */
export function computeSgHolidays(year: number): Holiday<SgHolidayKind>[] {
  // A year that is not an integer (the string "2026", ...) is a wrong argument, not out of range (see
  // KnownErrorCode)
  if (!Number.isInteger(year))
    throw rangeError(
      "invalid-argument",
      `Invalid year: ${describeValue(year)} (expected an integer)`,
    );
  const movable = MOVABLE[year];
  if (movable === undefined) {
    throw rangeError(
      "out-of-range",
      `Singapore public holidays are available for ${SUPPORTED_YEARS.from}-${SUPPORTED_YEARS.to}: ${year}`,
    );
  }
  const entries: Entry[] = [
    ...FIXED.map(([m, d, name]) => ({
      date: formatDate(year, m, d),
      name,
      kind: "regular" as const,
    })),
    ...movable.map(([md, name]) => ({
      date: `${year}-${md}` as DateString,
      name,
      kind: "regular" as const,
    })),
    ...SPECIAL_DAYS.filter(([date]) => date.startsWith(`${year}-`)).map(([date, name]) => ({
      date,
      name,
      kind: "special" as const,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
  // Holidays on a Sunday are substituted in date order (the substitute is the first following day that is not
  // itself a holiday)
  const taken = new Set<DateString>(entries.map((e) => e.date));
  const sundays = entries.filter((e) => weekdayOf(e.date) === 0);
  for (const e of sundays) {
    let day = addDays(e.date, 1);
    while (taken.has(day)) day = addDays(day, 1);
    entries.push({ date: day, name: e.name, kind: "substitute" });
    taken.add(day);
  }
  return entries
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) => {
      const key = KEY_OF[e.name];
      return Object.freeze({
        date: e.date,
        name: e.name,
        nameEn: e.name,
        kind: e.kind,
        confirmed: true,
        ...(key === undefined ? {} : { key }),
      });
    });
}
