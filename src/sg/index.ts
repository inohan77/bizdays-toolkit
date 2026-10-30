/**
 * シンガポールの祝日（public holidays。MOM が年ごとに告示する日付を data.gov.sg のデータで全日照合）。
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
 * シンガポールの祝日。
 * @public
 */
export type SgHoliday = Holiday<SgHolidayKind>;

const cache = new Map<number, readonly SgHoliday[]>();

/**
 * シンガポールの祝日の提供元。対応年は MOM が告示した年（2020 年〜）だけで、それより後の年は予測せず out-of-range
 * （旧正月・Hari Raya・Vesak Day・Deepavali は規則で計算できないため）。日曜日に当たる祝日の振替（kind: "substitute"）は
 * Holidays Act の規則で計算する。
 * @public
 */
export const sg: HolidayProvider<SgHolidayKind> = Object.freeze({
  id: "SG",
  timeZone: "Asia/Singapore",
  supportedYears: SUPPORTED_YEARS,
  dataVersion: DATA_VERSION,
  confirmedThrough: CONFIRMED_THROUGH,
  holidaysInYear(year: number): readonly SgHoliday[] {
    let list = cache.get(year);
    if (!list) {
      list = Object.freeze(computeSgHolidays(year));
      cache.set(year, list);
    }
    return list;
  },
});
