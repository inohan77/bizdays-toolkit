/**
 * Public holidays of Singapore (the dates gazetted by MOM per year, all verified against the data.gov.sg data).
 *
 * @example
 * import { createCalendar } from "bizdays-toolkit";
 * import { sg } from "bizdays-toolkit/sg";
 * const calendar = createCalendar({ holidayProvider: sg, closedWeekdays: [0, 6] });
 */

import type { Holiday, HolidayProvider } from "../core/types.ts";
import {
  CONFIRMED_THROUGH,
  DATA_VERSION,
  SUPPORTED_YEARS,
  computeSgHolidays,
  type SgHolidayKind,
} from "./rules.ts";

export type { KnownSgHolidayKey, KnownSgHolidayKind, SgHolidayKind } from "./rules.ts";

/**
 * A holiday of Singapore.
 * @public
 */
export type SgHoliday = Holiday<SgHolidayKind>;

const cache = new Map<number, readonly SgHoliday[]>();

/**
 * The holiday provider of Singapore. The supported years are only those gazetted by MOM (from 2020); later years
 * are not predicted and are out-of-range (Chinese New Year, Hari Raya, Vesak Day and Deepavali cannot be
 * computed by rule). Substitutes for holidays on a Sunday (kind: "substitute") are computed by the rule of the
 * Holidays Act.
 * @public
 */
export const sg: HolidayProvider<SgHolidayKind> = Object.freeze({
  id: "SG",
  timeZone: "Asia/Singapore",
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
  holidaysInYear(year: number): readonly SgHoliday[] {
    let list = cache.get(year);
    if (!list) {
      list = Object.freeze(computeSgHolidays(year));
      cache.set(year, list);
    }
    return list;
  },
});
