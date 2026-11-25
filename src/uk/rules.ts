/**
 * Calculation of UK bank holidays (divisions of GOV.UK: England and Wales, Scotland, Northern Ireland).
 *
 * - Annual holidays: the days set by the schedule to the Banking and Financial Dealings Act 1971 and by the
 *   yearly proclamations are computed by rule (Good Friday and Christmas Day in England and Wales and Northern
 *   Ireland are common-law holidays, but are included as in the GOV.UK list)
 * - Substitution: a fixed-date holiday on a Saturday or Sunday moves to the nearest following weekday that is
 *   not a holiday (assigned in date order)
 * - Special holidays and moves: the dates of each proclamation are kept in tables
 * - Keys: one per annual holiday, from the GOV.UK title (KnownUkHolidayKey). A substitute day has the key of
 *   its holiday; special holidays have none
 *
 * The authority per year (GOV.UK, the government lists of the time, proclamations) and the verification
 * fixtures: decisions.md #28.
 * Years after CONFIRMED_THROUGH are predicted by rule (confirmed: false).
 */

import {
  addDays,
  lengthOfMonth,
  easterSunday,
  formatDate,
  nthWeekdayOfMonth,
  weekdayOf,
  type DateString,
} from "../core/date.ts";
import { describeValue, rangeError } from "../core/errors.ts";
import type { Holiday, HolidayProvider } from "../core/types.ts";

/**
 * Kinds of UK holidays (known values).
 * @public
 */
export type KnownUkHolidayKind =
  /** Annual holiday (including years in which a proclamation moved its date) */
  | "regular"
  /** Substitute for a holiday on a Saturday or Sunday */
  | "substitute"
  /** Special holiday by proclamation (commemorations, state funerals, ...) */
  | "special";

/**
 * Kind of a UK holiday. Later versions may add values, so handle "anything else" when branching.
 * Use KnownUkHolidayKind to check by type that every value is handled.
 * @public
 */
export type UkHolidayKind = KnownUkHolidayKind | (string & {});

/**
 * Keys of the annual UK bank holidays (Holiday.key; known values). Taken from the GOV.UK titles; the same value
 * in years in which a proclamation moved the date.
 * A substitute day has the key of its holiday; special holidays have no key.
 * Used for completion when writing `keys` of a rule (the type is open, so other strings pass too).
 * @namingSource holiday-key
 * @public
 */
export type KnownUkHolidayKey =
  | "new-year"
  | "2nd-january"
  | "st-patricks"
  | "good-friday"
  | "easter-monday"
  | "early-may"
  | "spring"
  | "battle-of-the-boyne"
  | "summer"
  | "st-andrews"
  | "christmas"
  | "boxing-day";

/** @internal Division of GOV.UK */
export type UkDivision = "england-and-wales" | "scotland" | "northern-ireland";

/** @internal Supported years */
export const SUPPORTED_YEARS = Object.freeze({ from: 1974, to: 2099 });
/** @internal The last year for which GOV.UK publishes dates */
export const CONFIRMED_THROUGH = 2028;
/** @internal Year and month of the reflected GOV.UK data (Scotland's World Cup bank holiday of 2026 added) */
export const DATA_VERSION = "2026-02";

interface Entry {
  readonly date: DateString;
  readonly name: string;
  readonly kind: KnownUkHolidayKind;
  /** Key of the observed holiday (a substitute day has its holiday's; special holidays have none) */
  readonly key?: KnownUkHolidayKey;
}

/** A fixed-date holiday (substituted when on a Saturday or Sunday) */
interface FixedDay {
  readonly month: number;
  readonly day: number;
  readonly name: string;
  readonly key: KnownUkHolidayKey;
}

const NEW_YEAR = "New Year’s Day";
const SECOND_JANUARY = "2nd January";
const ST_PATRICK = "St Patrick’s Day";
const GOOD_FRIDAY = "Good Friday";
const EASTER_MONDAY = "Easter Monday";
const EARLY_MAY = "Early May bank holiday";
const SPRING = "Spring bank holiday";
const BOYNE = "Battle of the Boyne (Orangemen’s Day)";
const SUMMER = "Summer bank holiday";
const ST_ANDREW = "St Andrew’s Day";
const CHRISTMAS = "Christmas Day";
const BOXING = "Boxing Day";

const ALL: readonly UkDivision[] = ["england-and-wales", "scotland", "northern-ireland"];
const NOT_SCOTLAND: readonly UkDivision[] = ["england-and-wales", "northern-ireland"];
const SCOTLAND: readonly UkDivision[] = ["scotland"];

/** Years in which a proclamation moved the date of an annual holiday (`name` when the name changes) */
const MOVED: readonly {
  readonly year: number;
  readonly from: string;
  readonly date: DateString;
  readonly name?: string;
  readonly divisions: readonly UkDivision[];
}[] = [
  // 1977: for the Silver Jubilee, Spring in England, Wales and NI moved to June 6 ("in its stead"). Scotland had
  // no Spring holiday yet
  { year: 1977, from: SPRING, date: "1977-06-06", divisions: NOT_SCOTLAND },
  // 1995: for the 50th anniversary of VE Day, Early May in England, Wales and NI moved to May 8 (May 1 was not
  // proclaimed). Scotland's first Monday in May is in the schedule
  { year: 1995, from: EARLY_MAY, date: "1995-05-08", divisions: NOT_SCOTLAND },
  { year: 2002, from: SPRING, date: "2002-06-04", divisions: ALL },
  { year: 2012, from: SPRING, date: "2012-06-04", divisions: ALL },
  {
    year: 2020,
    from: EARLY_MAY,
    date: "2020-05-08",
    name: "Early May bank holiday (VE day)",
    divisions: ALL,
  },
  { year: 2022, from: SPRING, date: "2022-06-02", divisions: ALL },
];

/** Special holidays by proclamation */
const SPECIAL_DAYS: readonly {
  readonly date: DateString;
  readonly name: string;
  readonly divisions: readonly UkDivision[];
}[] = [
  // Grounds for the names, and the rule of adding the reason in parentheses to days without a name of their own:
  // docs/sources/uk-bank-holidays-1974-1999.md section 5.
  // 1977 Silver Jubilee: England, Wales and NI added 6/7 (Spring moved to 6/6); Scotland only 6/6
  { date: "1977-06-06", name: "Silver Jubilee bank holiday", divisions: SCOTLAND },
  { date: "1977-06-07", name: "Silver Jubilee bank holiday", divisions: NOT_SCOTLAND },
  { date: "1981-07-29", name: "Royal Wedding bank holiday", divisions: ALL },
  // 1995: England, Wales and NI moved Early May to 5/8; Scotland added 5/8 to the 5/1 of the schedule
  {
    date: "1995-05-08",
    name: "Additional bank holiday (VE Day 50th anniversary)",
    divisions: SCOTLAND,
  },
  { date: "1999-12-31", name: "Additional bank holiday (Millennium)", divisions: ALL },
  { date: "2002-06-03", name: "Golden Jubilee bank holiday", divisions: ALL },
  { date: "2011-04-29", name: "Royal Wedding bank holiday", divisions: ALL },
  { date: "2012-06-05", name: "Queen’s Diamond Jubilee", divisions: ALL },
  { date: "2022-06-03", name: "Platinum Jubilee bank holiday", divisions: ALL },
  {
    date: "2022-09-19",
    name: "Bank Holiday for the State Funeral of Queen Elizabeth II",
    divisions: ALL,
  },
  {
    date: "2023-05-08",
    name: "Bank holiday for the coronation of King Charles III",
    divisions: ALL,
  },
  { date: "2026-06-15", name: "World Cup bank holiday", divisions: ["scotland"] },
];

/**
 * Years in which the substitute dates follow the rule and only the assignment (which holiday each substitutes)
 * differs. In Scotland in 2023 (January 1 on a Sunday), GOV.UK has 1/2 as the substitute for New Year’s Day and
 * 1/3 for 2nd January. In 2012 and 2017, with the same weekdays, 1/2 is 2nd January as in the schedule and 1/3
 * the substitute for New Year’s Day
 */
const RENAMED: readonly {
  readonly divisions: readonly UkDivision[];
  readonly date: DateString;
  readonly name: string;
  readonly kind: KnownUkHolidayKind;
  readonly key: KnownUkHolidayKey;
}[] = [
  // Assignment of the names of substitute days, following the lists, proclamations and Hansard wording of the
  // time (grounds: docs/sources/uk-bank-holidays-1974-1999.md appendix C,
  // docs/sources/uk-bank-holidays-2000-2011.md). Years with 12/25 on a Saturday: the 27th is Boxing Day and the
  // 28th is in lieu of Christmas Day
  { divisions: ALL, date: "1976-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1976-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  // Scotland in years with 1/1 on a Saturday: the 3rd is 2nd January (schedule), the 4th in lieu of New Year’s Day
  {
    divisions: SCOTLAND,
    date: "1977-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "1977-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  // Scotland in years with 12/25 on a Sunday: the 26th is Christmas Day (schedule), the 27th Boxing Day
  // (proclamation)
  {
    divisions: SCOTLAND,
    date: "1977-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "1977-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1982-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1982-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  {
    divisions: SCOTLAND,
    date: "1983-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "1983-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  {
    divisions: SCOTLAND,
    date: "1983-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "1983-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  {
    divisions: SCOTLAND,
    date: "1988-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "1988-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1993-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1993-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  {
    divisions: SCOTLAND,
    date: "1994-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "1994-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  {
    divisions: SCOTLAND,
    date: "1994-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "1994-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1999-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1999-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  {
    divisions: SCOTLAND,
    date: "2000-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "2000-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  { divisions: ALL, date: "2004-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "2004-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  {
    divisions: SCOTLAND,
    date: "2005-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "2005-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  {
    divisions: SCOTLAND,
    date: "2005-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "2005-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  // 2011: the government list of the time had the 26th as the substitute for Christmas Day and the 27th for
  // Boxing Day
  { divisions: ALL, date: "2011-12-26", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  { divisions: ALL, date: "2011-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  // Scotland in 2023: follows the assignment of GOV.UK (1/2 New Year’s Day, 1/3 2nd January)
  { divisions: SCOTLAND, date: "2023-01-02", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  {
    divisions: SCOTLAND,
    date: "2023-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
];

/**
 * The last Monday of a month.
 * @param year - Year.
 * @param month - 1-12.
 * @returns "YYYY-MM-DD".
 * @internal
 */
export function lastMonday(year: number, month: number): DateString {
  const last = formatDate(year, month, lengthOfMonth(year, month));
  return addDays(last, -((weekdayOf(last) - 1 + 7) % 7));
}

/**
 * Whether a date is a Saturday or a Sunday.
 * @internal
 */
export function isWeekend(date: DateString): boolean {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
}

/**
 * Computes the UK bank holidays of a year for a division: fixed and movable days of the division, days moved or
 * renamed in particular years, special days, and for a fixed day on a weekend the next weekday that is not already a
 * holiday (kind "substitute"; the weekend day itself is not listed).
 * @param division - "england-and-wales", "scotland" or "northern-ireland".
 * @param year - Integer within SUPPORTED_YEARS.
 * @returns New frozen holidays sorted by date; `nameEn` equals `name`; `confirmed` is false for years after
 *   CONFIRMED_THROUGH.
 * @throws RangeError `invalid-argument` when the year is not an integer; `out-of-range` outside the supported years.
 * @internal
 */
export function computeUkHolidays(division: UkDivision, year: number): Holiday<UkHolidayKind>[] {
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
      `UK bank holidays are supported for ${SUPPORTED_YEARS.from}-${SUPPORTED_YEARS.to}; requested ${year}`,
    );
  }
  const scotland = division === "scotland";
  const ni = division === "northern-ireland";

  const fixed: FixedDay[] = [{ month: 1, day: 1, name: NEW_YEAR, key: "new-year" }];
  if (scotland) fixed.push({ month: 1, day: 2, name: SECOND_JANUARY, key: "2nd-january" });
  if (ni) fixed.push({ month: 3, day: 17, name: ST_PATRICK, key: "st-patricks" });
  if (ni) fixed.push({ month: 7, day: 12, name: BOYNE, key: "battle-of-the-boyne" });
  // St Andrew's Day was added by the St Andrew's Day Bank Holiday (Scotland) Act 2007 (from 2007)
  if (scotland && year >= 2007)
    fixed.push({ month: 11, day: 30, name: ST_ANDREW, key: "st-andrews" });
  fixed.push(
    { month: 12, day: 25, name: CHRISTMAS, key: "christmas" },
    { month: 12, day: 26, name: BOXING, key: "boxing-day" },
  );

  const easter = easterSunday(year);
  const movable: Entry[] = [
    { date: addDays(easter, -2), name: GOOD_FRIDAY, kind: "regular", key: "good-friday" },
    {
      date: scotland ? nthWeekdayOfMonth(year, 8, 1, 1) : lastMonday(year, 8),
      name: SUMMER,
      kind: "regular",
      key: "summer",
    },
  ];
  if (!scotland) {
    movable.push({
      date: addDays(easter, 1),
      name: EASTER_MONDAY,
      kind: "regular",
      key: "easter-monday",
    });
  }
  // First Monday in May: in the schedule for Scotland; proclaimed every year from 1978 for England, Wales and NI
  // (Early May bank holiday)
  if (scotland || year >= 1978) {
    movable.push({
      date: nthWeekdayOfMonth(year, 5, 1, 1),
      name: EARLY_MAY,
      kind: "regular",
      key: "early-may",
    });
  }
  // Last Monday in May: in the schedule for England, Wales and NI; proclaimed every year from 1978 for Scotland
  if (!scotland || year >= 1978) {
    movable.push({ date: lastMonday(year, 5), name: SPRING, kind: "regular", key: "spring" });
  }

  const entries: Entry[] = [];
  for (const e of movable) {
    const moved = MOVED.find(
      (m) => m.year === year && m.from === e.name && m.divisions.includes(division),
    );
    entries.push(moved ? { ...e, date: moved.date, name: moved.name ?? e.name } : e);
  }
  for (const s of SPECIAL_DAYS) {
    if (s.date.startsWith(`${year}-`) && s.divisions.includes(division)) {
      entries.push({ date: s.date, name: s.name, kind: "special" });
    }
  }

  // Fixed-date holidays on weekdays are placed first; those on a Saturday or Sunday are substituted in date order
  const taken = new Set<DateString>(entries.map((e) => e.date));
  const fixedDates = fixed.map((f) => ({
    date: formatDate(year, f.month, f.day),
    name: f.name,
    key: f.key,
  }));
  for (const f of fixedDates) {
    if (!isWeekend(f.date)) {
      entries.push({ date: f.date, name: f.name, kind: "regular", key: f.key });
      taken.add(f.date);
    }
  }
  for (const f of fixedDates) {
    if (!isWeekend(f.date)) continue;
    let day = addDays(f.date, 1);
    while (isWeekend(day) || taken.has(day)) day = addDays(day, 1);
    entries.push({ date: day, name: f.name, kind: "substitute", key: f.key });
    taken.add(day);
  }

  for (const r of RENAMED) {
    if (!r.divisions.includes(division) || !r.date.startsWith(`${year}-`)) continue;
    const i = entries.findIndex((e) => e.date === r.date);
    if (i >= 0) entries[i] = { date: r.date, name: r.name, kind: r.kind, key: r.key };
  }

  return entries
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) =>
      Object.freeze({
        date: e.date,
        name: e.name,
        nameEn: e.name,
        kind: e.kind,
        confirmed: year <= CONFIRMED_THROUGH,
        ...(e.key === undefined ? {} : { key: e.key }),
      }),
    );
}

/** Welsh names of the holidays of Wales (as written in the Welsh version of GOV.UK) */
const WELSH_NAMES: Readonly<Record<string, string>> = {
  "New Year’s Day": "Dydd Calan",
  "Good Friday": "Gwener y Groglith",
  "Easter Monday": "Llun y Pasg",
  "Early May bank holiday": "Gŵyl banc dechrau Mai",
  "Early May bank holiday (VE day)": "Gŵyl banc dechrau Mai (diwrnod VE)",
  "Spring bank holiday": "Gŵyl banc y gwanwyn",
  "Summer bank holiday": "Gŵyl banc yr haf",
  "Christmas Day": "Dydd Nadolig",
  "Boxing Day": "Dydd San Steffan",
  "Queen’s Diamond Jubilee": "Jiwbilî Ddiemwnt y Frenhines",
  "Platinum Jubilee bank holiday": "Gŵyl banc Jiwbilî Blatinwm",
  "Bank Holiday for the State Funeral of Queen Elizabeth II":
    "Gŵyl y Banc ar gyfer Angladd Gwladol y Frenhines Elizabeth II",
  "Bank holiday for the coronation of King Charles III":
    "Gŵyl y banc ar gyfer coroni Brenin Siarl III",
};

/**
 * Adds the Welsh name (`names.cy`) to the holidays that have one.
 * @param list - Holidays.
 * @returns A new array; holidays without a Welsh name are returned as they are.
 * @internal
 */
export function withWelsh(list: readonly Holiday<UkHolidayKind>[]): Holiday<UkHolidayKind>[] {
  return list.map((h) => {
    const cy = WELSH_NAMES[h.name];
    return Object.freeze(cy === undefined ? h : { ...h, names: Object.freeze({ cy }) });
  });
}

/**
 * Creates a UK provider for a division.
 * @param id - Provider ID.
 * @param division - "england-and-wales", "scotland" or "northern-ireland".
 * @param transform - Applied to each year's list before caching.
 * @returns A frozen HolidayProvider (time zone Europe/London) that caches each year.
 * @internal
 */
export function createUkProvider(
  id: string,
  division: UkDivision,
  transform?: (list: readonly Holiday<UkHolidayKind>[]) => Holiday<UkHolidayKind>[],
): HolidayProvider<UkHolidayKind> {
  const cache = new Map<number, readonly Holiday<UkHolidayKind>[]>();
  return Object.freeze({
    id,
    timeZone: "Europe/London",
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
    holidaysInYear(year: number): readonly Holiday<UkHolidayKind>[] {
      let list = cache.get(year);
      if (!list) {
        const computed = computeUkHolidays(division, year);
        list = Object.freeze(transform ? transform(computed) : computed);
        cache.set(year, list);
      }
      return list;
    },
  });
}
