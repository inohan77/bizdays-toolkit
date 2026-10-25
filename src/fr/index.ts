/**
 * フランスの祝日（jours fériés）。本土（metropole）と Alsace-Moselle の 2 つの提供元。
 *
 * 労働法典 L3133-1 が定める 11 日（固定日 8 日と復活祭から決まる 3 日）を規則で計算し、Alsace-Moselle には地方法の
 * Vendredi saint と 12 月 26 日が加わる。振替はない。data.gouv.fr の「Jours fériés en France」（DINUM）の JSON と全日照合している。
 *
 * @example
 * import { createCalendar } from "bizdays-toolkit";
 * import { metropole } from "bizdays-toolkit/fr";
 * const paris = createCalendar({ holidays: metropole, closedWeekdays: [0, 6] });
 *
 * @example Lundi de Pentecôte を「連帯の日」として出勤日にする企業（法律上は祝日のまま。既定の扱いの例外として書く）
 * createCalendar({ holidays: metropole, closedWeekdays: [0, 6],
 *   openRecurring: [{ holiday: true, keys: ["pentecost-monday"], name: "Journée de solidarité" }] });
 */

import type { Holiday, HolidayProvider } from "../core/types.ts";
import {
  DATA_VERSION,
  SUPPORTED_YEARS,
  computeFrHolidays,
  type FrHolidayKind,
  type FrZone,
} from "./rules.ts";

export type { FrHolidayKind, KnownFrHolidayKey, KnownFrHolidayKind } from "./rules.ts";

/**
 * フランスの祝日。
 * @public
 */
export type FrHoliday = Holiday<FrHolidayKind>;

function provider(id: string, zone: FrZone): HolidayProvider<FrHolidayKind> {
  const cache = new Map<number, readonly FrHoliday[]>();
  return Object.freeze({
    id,
    timeZone: "Europe/Paris",
    supportedYears: SUPPORTED_YEARS,
    dataVersion: DATA_VERSION,
    holidaysInYear(year: number): readonly FrHoliday[] {
      let list = cache.get(year);
      if (!list) {
        list = Object.freeze(computeFrHolidays(zone, year));
        cache.set(year, list);
      }
      return list;
    },
  });
}

/**
 * フランス本土（および data.gouv.fr の「Métropole」ゾーンに従う地域）の祝日の提供元。ID は FR、タイムゾーンは Europe/Paris。
 * 対応年は 2000〜2099 年で、祝日は法令で定まり年ごとの告示はないので、すべて confirmed: true（confirmedThrough は持たない）。
 * @public
 */
export const metropole: HolidayProvider<FrHolidayKind> = provider("FR", "metropole");

/**
 * Alsace-Moselle（Bas-Rhin・Haut-Rhin・Moselle の 3 県。ISO 3166-2 に 1 つのコードがないので、このライブラリの ID は FR-AM）の
 * 祝日の提供元。本土の 11 日に Vendredi saint（kind "regular"、key "good-friday"）と 12 月 26 日（"saint-stephens"）が加わる。
 * @public
 */
export const alsaceMoselle: HolidayProvider<FrHolidayKind> = provider("FR-AM", "alsace-moselle");
