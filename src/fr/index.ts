/**
 * Public holidays of France (jours fériés). Two providers: mainland (metropole) and Alsace-Moselle.
 *
 * The 11 days of article L3133-1 of the Labour Code (8 fixed dates and 3 days tied to Easter) are computed by
 * rule; Alsace-Moselle adds Vendredi saint and December 26 under local law. There is no substitution. All days
 * are verified against the JSON of "Jours fériés en France" (DINUM) on data.gouv.fr.
 *
 * @example
 * import { createCalendar } from "bizdays-toolkit";
 * import { metropole } from "bizdays-toolkit/fr";
 * const paris = createCalendar({ holidayProvider: metropole, closedWeekdays: [0, 6] });
 *
 * @example A company that works on Lundi de Pentecôte as its "day of solidarity" (still a holiday in law; written
 *   as an exception to the default handling)
 * createCalendar({ holidayProvider: metropole, closedWeekdays: [0, 6],
 *   openRecurringRules: [{ holiday: true, keys: ["pentecost-monday"], name: "Journée de solidarité" }] });
 */

import type { Holiday, HolidayProvider } from "../core/types.ts";
import { createFrProvider, type FrHolidayKind } from "./rules.ts";

export type { FrHolidayKind, KnownFrHolidayKey, KnownFrHolidayKind } from "./rules.ts";

/**
 * A holiday of France.
 * @public
 */
export type FrHoliday = Holiday<FrHolidayKind>;

/**
 * Provider of the holidays of mainland France (and the regions that follow the "Métropole" zone of
 * data.gouv.fr). The ID is FR and the time zone Europe/Paris.
 * The supported years are 2000-2099. Holidays are set by law without yearly announcements, so all are
 * confirmed: true (there is no confirmedThrough).
 * @public
 */
export const metropole: HolidayProvider<FrHolidayKind> = createFrProvider("FR", "metropole");

/**
 * Provider of the holidays of Alsace-Moselle (the departments Bas-Rhin, Haut-Rhin and Moselle; ISO 3166-2 has no
 * single code, so the ID in this library is FR-AM). Adds Vendredi saint (kind "regular", key "good-friday") and
 * December 26 ("saint-stephens") to the 11 days of the mainland.
 * @public
 */
export const alsaceMoselle: HolidayProvider<FrHolidayKind> = createFrProvider(
  "FR-AM",
  "alsace-moselle",
);
