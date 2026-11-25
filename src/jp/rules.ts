/**
 * Calculation of the holidays of Japan (the Act on National Holidays and the special acts).
 *
 * - National holidays: computed from per-year rules (including Happy Monday and the moves under the Olympic
 *   special measures act)
 * - Holidays for imperial events: the dates of each special act are kept in a table
 * - Substitute holidays: from 1973-04-12. From 2007, "the nearest day after it that is not a national holiday"
 * - Citizens' holidays: from 1985-12-27. A day whose previous and next days are national holidays
 * - Keys: one per holiday of the act (KnownJpHolidayKey). A substitute holiday has the key of its holiday;
 *   citizens' holidays and special holidays have none
 * - Equinox days: an approximation of the astronomical calculation. Up to the year published in the official
 *   gazette (CONFIRMED_THROUGH) it is verified against the Cabinet Office CSV to equal the confirmed dates.
 *   Later years are confirmed: false
 */

import {
  addDays,
  formatDate,
  nthWeekdayOfMonth,
  weekdayOf,
  type DateString,
} from "../core/date.ts";
import { createCalendar, type Calendar } from "../core/calendar.ts";
import { describeValue, rangeError } from "../core/errors.ts";
import type { Holiday, HolidayProvider } from "../core/types.ts";

/**
 * Kinds of holidays of Japan (known values).
 * @public
 */
export type KnownJpHolidayKind =
  /** National holiday */
  | "regular"
  /** Substitute holiday */
  | "substitute"
  /** Citizens' holiday (a day between two holidays) */
  | "citizens"
  /** Special holiday for an imperial event or the like */
  | "special";

/**
 * Kind of a holiday of Japan. Later versions may add values, so handle "anything else" when branching.
 * Use KnownJpHolidayKind to check by type that every value is handled.
 * @public
 */
export type JpHolidayKind = KnownJpHolidayKind | (string & {});

/**
 * Keys of the national holidays of Japan (Holiday.key; known values). One per holiday of the act; the same
 * holiday keeps its value when its date moves or it is renamed (the Emperor's Birthday is "emperors-birthday"
 * on 4/29, 12/23 and 2/23; Health and Sports Day and Sports Day are "sports").
 * A substitute holiday has the key of its holiday; citizens' holidays and special holidays have no key.
 * Used for completion when writing `keys` of a rule (the type is open, so other strings pass too).
 * @namingSource holiday-key
 * @public
 */
export type KnownJpHolidayKey =
  | "new-year"
  | "coming-of-age"
  | "national-foundation"
  | "emperors-birthday"
  | "vernal-equinox"
  | "showa"
  | "constitution-memorial"
  | "greenery"
  | "childrens"
  | "marine"
  | "mountain"
  | "respect-for-the-aged"
  | "autumnal-equinox"
  | "sports"
  | "culture"
  | "labor-thanksgiving";

/** @internal Supported years */
export const SUPPORTED_YEARS = Object.freeze({ from: 1955, to: 2099 });
/** @internal The last year whose equinox days are confirmed by the official gazette */
export const CONFIRMED_THROUGH = 2027;
/** @internal Year and month of the reflected official gazette (publication of the equinox days of 2027) */
export const DATA_VERSION = "2026-02";

const SUBSTITUTE_START = "1973-04-12";
const SUBSTITUTE_2007 = "2007-01-01";
const CITIZENS_START = "1985-12-27";

interface Entry {
  readonly date: DateString;
  readonly name: string;
  readonly nameEn: string;
  readonly kind: KnownJpHolidayKind;
  /** An equinox day, or a holiday derived from one */
  readonly equinox: boolean;
  /** Key of the observed holiday (a substitute has its holiday's; citizens' and special holidays have none) */
  readonly key?: KnownJpHolidayKey;
}

/** Special holidays for imperial events and the like (each under its special act) */
const SPECIAL_DAYS: readonly Omit<Entry, "kind" | "equinox">[] = [
  {
    date: "1959-04-10",
    name: "皇太子明仁親王の結婚の儀",
    nameEn: "Wedding Ceremony of Crown Prince Akihito",
  },
  { date: "1989-02-24", name: "昭和天皇の大喪の礼", nameEn: "Funeral Ceremony of Emperor Showa" },
  { date: "1990-11-12", name: "即位礼正殿の儀", nameEn: "Enthronement Ceremony" },
  {
    date: "1993-06-09",
    name: "皇太子徳仁親王の結婚の儀",
    nameEn: "Wedding Ceremony of Crown Prince Naruhito",
  },
  { date: "2019-05-01", name: "天皇の即位の日", nameEn: "Enthronement Day" },
  { date: "2019-10-22", name: "即位礼正殿の儀の行われる日", nameEn: "Enthronement Ceremony Day" },
];

// int() of the approximation truncates toward zero. Up to 1979, (year - 1983) / 4 is negative, so Math.trunc is
// used instead of Math.floor (floor is a day off in some years)

/**
 * Day of March of the vernal equinox in Japan, by the standard approximation formula.
 * @param year - Year (the formula is used for the supported years).
 * @returns The day of the month (19-21 for the supported years).
 * @internal
 */
export function vernalEquinoxDay(year: number): number {
  if (year <= 1979) {
    return Math.floor(20.8357 + 0.242194 * (year - 1980) - Math.trunc((year - 1983) / 4));
  }
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * Day of September of the autumnal equinox in Japan, by the standard approximation formula.
 * @param year - Year.
 * @returns The day of the month (22-24 for the supported years).
 * @internal
 */
export function autumnalEquinoxDay(year: number): number {
  if (year <= 1979) {
    return Math.floor(23.2588 + 0.242194 * (year - 1980) - Math.trunc((year - 1983) / 4));
  }
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * The holidays of a year defined by the holiday law and by special acts, before substitute and citizens' holidays.
 * @param y - A supported year.
 * @returns Entries sorted by date, each with name, key, kind ("regular" or "special") and whether the date comes from
 *   the equinox formula.
 * @internal
 */
export function baseHolidays(y: number): Entry[] {
  const list: Entry[] = [];
  const add = (
    date: DateString,
    name: string,
    nameEn: string,
    key: KnownJpHolidayKey,
    equinox = false,
  ): void => {
    list.push({ date, name, nameEn, kind: "regular", equinox, key });
  };
  const md = (month: number, day: number): DateString => formatDate(y, month, day);
  const monday = (month: number, n: number): DateString => nthWeekdayOfMonth(y, month, 1, n);

  add(md(1, 1), "元日", "New Year's Day", "new-year");
  add(y <= 1999 ? md(1, 15) : monday(1, 2), "成人の日", "Coming of Age Day", "coming-of-age");
  if (y >= 1967) add(md(2, 11), "建国記念の日", "National Foundation Day", "national-foundation");
  if (y >= 2020) add(md(2, 23), "天皇誕生日", "The Emperor's Birthday", "emperors-birthday");
  add(md(3, vernalEquinoxDay(y)), "春分の日", "Vernal Equinox Day", "vernal-equinox", true);
  if (y <= 1988) add(md(4, 29), "天皇誕生日", "The Emperor's Birthday", "emperors-birthday");
  else if (y <= 2006) add(md(4, 29), "みどりの日", "Greenery Day", "greenery");
  else add(md(4, 29), "昭和の日", "Showa Day", "showa");
  add(md(5, 3), "憲法記念日", "Constitution Memorial Day", "constitution-memorial");
  if (y >= 2007) add(md(5, 4), "みどりの日", "Greenery Day", "greenery");
  add(md(5, 5), "こどもの日", "Children's Day", "childrens");

  // Marine Day (1996-). Moved in 2020 and 2021 under the Olympic special measures act
  if (y === 2020) add(md(7, 23), "海の日", "Marine Day", "marine");
  else if (y === 2021) add(md(7, 22), "海の日", "Marine Day", "marine");
  else if (y >= 2003) add(monday(7, 3), "海の日", "Marine Day", "marine");
  else if (y >= 1996) add(md(7, 20), "海の日", "Marine Day", "marine");

  // Sports Day (2020-). Moved in 2020 and 2021 under the Olympic special measures act
  if (y === 2020) add(md(7, 24), "スポーツの日", "Sports Day", "sports");
  else if (y === 2021) add(md(7, 23), "スポーツの日", "Sports Day", "sports");

  // Mountain Day (2016-). Moved in 2020 and 2021 under the Olympic special measures act
  if (y === 2020) add(md(8, 10), "山の日", "Mountain Day", "mountain");
  else if (y === 2021) add(md(8, 8), "山の日", "Mountain Day", "mountain");
  else if (y >= 2016) add(md(8, 11), "山の日", "Mountain Day", "mountain");

  if (y >= 2003) add(monday(9, 3), "敬老の日", "Respect for the Aged Day", "respect-for-the-aged");
  else if (y >= 1966)
    add(md(9, 15), "敬老の日", "Respect for the Aged Day", "respect-for-the-aged");
  add(md(9, autumnalEquinoxDay(y)), "秋分の日", "Autumnal Equinox Day", "autumnal-equinox", true);

  if (y >= 2022) add(monday(10, 2), "スポーツの日", "Sports Day", "sports");
  else if (y >= 2000 && y <= 2019)
    add(monday(10, 2), "体育の日", "Health and Sports Day", "sports");
  else if (y >= 1966 && y <= 1999) add(md(10, 10), "体育の日", "Health and Sports Day", "sports");

  add(md(11, 3), "文化の日", "Culture Day", "culture");
  add(md(11, 23), "勤労感謝の日", "Labor Thanksgiving Day", "labor-thanksgiving");
  if (y >= 1989 && y <= 2018)
    add(md(12, 23), "天皇誕生日", "The Emperor's Birthday", "emperors-birthday");

  for (const s of SPECIAL_DAYS) {
    if (s.date.startsWith(`${y}-`)) list.push({ ...s, kind: "special", equinox: false });
  }
  return list.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Computes the Japanese public holidays of a year: the base holidays, substitute holidays (a holiday on a Sunday;
 * from April 12, 1973; since 2007 moved past consecutive holidays) and citizens' holidays (a day between two
 * holidays; from December 27, 1985).
 * @param year - Integer within SUPPORTED_YEARS.
 * @returns New frozen holidays sorted by date. `confirmed` is false only for equinox-based days (and days derived
 *   from them) in years after CONFIRMED_THROUGH.
 * @throws RangeError `invalid-argument` when the year is not an integer; `out-of-range` outside the supported years.
 * @internal
 */
export function computeJapaneseHolidays(year: number): Holiday<JpHolidayKind>[] {
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
      `Japanese holidays are supported for ${SUPPORTED_YEARS.from}-${SUPPORTED_YEARS.to}; requested ${year}`,
    );
  }
  const base = baseHolidays(year);
  const byDate = new Map<DateString, Entry>(base.map((e) => [e.date, e]));
  // The "national holidays" used to decide substitute and citizens' holidays (special holidays count as holidays)
  const isNational = (date: DateString): boolean => byDate.has(date);
  const extra: Entry[] = [];

  // Substitute holidays
  for (const h of base) {
    if (h.date < SUBSTITUTE_START || weekdayOf(h.date) !== 0) continue;
    let day = addDays(h.date, 1);
    if (h.date >= SUBSTITUTE_2007) {
      while (isNational(day)) day = addDays(day, 1);
    } else if (isNational(day)) {
      continue;
    }
    extra.push({
      date: day,
      name: "振替休日",
      nameEn: "Substitute Holiday",
      kind: "substitute",
      equinox: h.equinox,
      ...(h.key === undefined ? {} : { key: h.key }),
    });
  }

  // Citizens' holidays (a day whose previous and next days are national holidays)
  for (const h of base) {
    const day = addDays(h.date, 1);
    const next = addDays(h.date, 2);
    if (day < CITIZENS_START || isNational(day) || !isNational(next)) continue;
    // Up to 2006, Sundays and substitute holidays are excluded
    if (day < SUBSTITUTE_2007 && (weekdayOf(day) === 0 || extra.some((e) => e.date === day)))
      continue;
    if (extra.some((e) => e.date === day)) continue;
    const equinox = h.equinox || byDate.get(next)!.equinox;
    extra.push({
      date: day,
      name: "国民の休日",
      nameEn: "Citizens' Holiday",
      kind: "citizens",
      equinox,
    });
  }

  return [...base, ...extra]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) =>
      Object.freeze({
        date: e.date,
        name: e.name,
        nameEn: e.nameEn,
        kind: e.kind,
        confirmed: year <= CONFIRMED_THROUGH || !e.equinox,
        ...(e.key === undefined ? {} : { key: e.key }),
      }),
    );
}

let defaultCalendar: Calendar<JpHolidayKind> | undefined;
/**
 * The shared calendar of the Japanese entry (src/jp/index.ts), created on first use and reused afterwards.
 * @param provider - The Japanese provider; read on the first call only.
 * @returns A calendar with `provider` and default options; the same object on every call.
 * @internal
 */
export const sharedCalendar = (provider: HolidayProvider<JpHolidayKind>): Calendar<JpHolidayKind> =>
  (defaultCalendar ??= createCalendar({ holidayProvider: provider }));
