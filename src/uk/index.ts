/**
 * 英国の bank holidays（England・Wales・Scotland・Northern Ireland）。
 *
 * 地域ごとに提供元が分かれている。GOV.UK では England と Wales が 1 つの区分（England and Wales）だが、
 * このライブラリでは別の提供元にしている（日付は現在同じ。将来分かれても利用者のコードを変えずに済むように）。
 *
 * @example
 * import { createCalendar } from "bizdays-toolkit";
 * import { scotland } from "bizdays-toolkit/uk";
 * const calendar = createCalendar({ holidays: scotland, closedWeekdays: [0, 6] });
 */

import type { Holiday, HolidayProvider } from "../core/types.ts";
import {
  CONFIRMED_THROUGH,
  DATA_VERSION,
  SUPPORTED_YEARS,
  computeUkHolidays,
  type UkDivision,
  type UkHolidayKind,
} from "./rules.ts";

export type { KnownUkHolidayKind, UkHolidayKind } from "./rules.ts";

/**
 * 英国の祝日。
 * @public
 */
export type UkHoliday = Holiday<UkHolidayKind>;

/** Wales の祝日のウェールズ語の名称（GOV.UK のウェールズ語版の表記） */
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

function withWelsh(list: readonly UkHoliday[]): UkHoliday[] {
  return list.map((h) => {
    const cy = WELSH_NAMES[h.name];
    return Object.freeze(cy === undefined ? h : { ...h, names: Object.freeze({ cy }) });
  });
}

function provider(
  id: string,
  division: UkDivision,
  transform?: (list: readonly UkHoliday[]) => UkHoliday[],
): HolidayProvider<UkHolidayKind> {
  const cache = new Map<number, readonly UkHoliday[]>();
  return Object.freeze({
    id,
    timeZone: "Europe/London",
    supportedYears: SUPPORTED_YEARS,
    dataVersion: DATA_VERSION,
    confirmedThrough: CONFIRMED_THROUGH,
    holidaysInYear(year: number): readonly UkHoliday[] {
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

/**
 * England の bank holidays の提供元（GOV.UK の England and Wales）。
 * @public
 */
export const england: HolidayProvider<UkHolidayKind> = provider("GB-ENG", "england-and-wales");

/**
 * Wales の bank holidays の提供元（GOV.UK の England and Wales）。名称にウェールズ語（names.cy）が付く。
 * @public
 */
export const wales: HolidayProvider<UkHolidayKind> = provider(
  "GB-WLS",
  "england-and-wales",
  withWelsh,
);

/**
 * Scotland の bank holidays の提供元。
 * @public
 */
export const scotland: HolidayProvider<UkHolidayKind> = provider("GB-SCT", "scotland");

/**
 * Northern Ireland の bank holidays の提供元。
 * @public
 */
export const northernIreland: HolidayProvider<UkHolidayKind> = provider(
  "GB-NIR",
  "northern-ireland",
);

/**
 * 反映済みの GOV.UK のデータの年月。
 * @public
 */
export const dataVersion: string = DATA_VERSION;
/**
 * GOV.UK が日付を公表している最後の年（それより後は規則による予測で confirmed: false）。
 * @public
 */
export const confirmedThrough: number = CONFIRMED_THROUGH;
