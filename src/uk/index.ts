/**
 * UK bank holidays (England, Wales, Scotland, Northern Ireland).
 *
 * There is one provider per region. GOV.UK has England and Wales as one division (England and Wales), but this
 * library has separate providers (the dates are currently the same; users' code need not change if they ever
 * diverge).
 *
 * @example
 * import { createCalendar } from "bizdays-toolkit";
 * import { scotland } from "bizdays-toolkit/uk";
 * const calendar = createCalendar({ holidayProvider: scotland, closedWeekdays: [0, 6] });
 */

import type { Holiday, HolidayProvider } from "../core/types.ts";
import {
  CONFIRMED_THROUGH,
  DATA_VERSION,
  createUkProvider,
  withWelsh,
  type UkHolidayKind,
} from "./rules.ts";

export type { KnownUkHolidayKey, KnownUkHolidayKind, UkHolidayKind } from "./rules.ts";

/**
 * A UK holiday.
 * @public
 */
export type UkHoliday = Holiday<UkHolidayKind>;

/**
 * Provider of the bank holidays of England (England and Wales of GOV.UK).
 * @public
 */
export const england: HolidayProvider<UkHolidayKind> = createUkProvider(
  "GB-ENG",
  "england-and-wales",
);

/**
 * Provider of the bank holidays of Wales (England and Wales of GOV.UK). Holidays that have a name in the Welsh
 * version of GOV.UK get the Welsh name (names.cy); special holidays without an official name do not.
 * @public
 */
export const wales: HolidayProvider<UkHolidayKind> = createUkProvider(
  "GB-WLS",
  "england-and-wales",
  withWelsh,
);

/**
 * Provider of the bank holidays of Scotland.
 * @public
 */
export const scotland: HolidayProvider<UkHolidayKind> = createUkProvider("GB-SCT", "scotland");

/**
 * Provider of the bank holidays of Northern Ireland.
 * @public
 */
export const northernIreland: HolidayProvider<UkHolidayKind> = createUkProvider(
  "GB-NIR",
  "northern-ireland",
);

/**
 * Year and month of the reflected GOV.UK data.
 * @deprecated Deprecated in 0.12.0. Use the provider's property (england.dataVersion, ...; the same value for
 *   the four providers; docs/migration.md). Removed in 1.0.0
 * @public
 */
export const dataVersion: string = DATA_VERSION;
/**
 * The last year for which GOV.UK publishes dates (later years are predicted by rule, confirmed: false).
 * @deprecated Deprecated in 0.12.0. Use the provider's property (england.confirmedThrough, ...; the same value
 *   for the four providers; docs/migration.md). Removed in 1.0.0
 * @public
 */
export const confirmedThrough: number = CONFIRMED_THROUGH;
