import type { DateString } from "./date.ts";

/** @internal Format of a holiday key (Holiday.key) */
export const HOLIDAY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * One holiday.
 * @public
 */
export interface Holiday<Kind extends string = string> {
  /** Calendar date "YYYY-MM-DD" */
  readonly date: DateString;
  /** Name in the local language */
  readonly name: string;
  /** Name in English */
  readonly nameEn: string;
  /**
   * Names in other languages (optional). Keys are BCP 47 language tags in canonical form (e.g. "zh-Hant", "ko").
   * Bundled providers add only names that have an official source. Names added by a user's provider are
   * validated, copied and frozen before being returned
   */
  readonly names?: Readonly<Record<string, string>>;
  /** Kind (defined per country; JpHolidayKind for Japan) */
  readonly kind: Kind;
  /**
   * Key of the holiday observed on the day (optional). Limited to /^[a-z0-9][a-z0-9-]*$/.
   * `name` copies the wording of the official data, whereas `key` is a stable identifier for pointing at a
   * holiday from a rule ({ holiday: true, keys: [...] }); the provider chooses it and keeps it across versions
   * (the same holiday keeps its key when its date moves or it is officially renamed).
   * A substitute day has the key of the original holiday. A day that carries no more than its kind (Japan's
   * citizens' holiday) and a one-off day (a special holiday) have none.
   * The same key can appear more than once in a year (a substitute day and its holiday; two substitute days)
   */
  readonly key?: string;
  /**
   * Whether the day is officially confirmed.
   * Example: Japan's equinox days are confirmed by the official gazette of the previous February, so later
   * years are false (predicted by calculation)
   */
  readonly confirmed: boolean;
}

/**
 * A holiday provider (the rules of a country or region).
 *
 * Implement this interface for other countries or regions and pass it to createCalendar / createSchedule.
 * The data returned by holidaysInYear is validated the first time each year is used; wrong data throws with
 * code: "invalid-provider-data". Returned holidays are copied into immutable objects that have only the
 * contract's properties (date, name, nameEn, names, kind, confirmed, key).
 * In a long run of holidays, an "after-holiday" rule whose original day is more than 31 days before the day it
 * would move to is not moved, and judging the day after the run throws with code: "holiday-run-too-long" (the
 * original day is searched for at most 31 days back; rules for the days before and after a holiday apply
 * whatever the length of the run; write a long closure with closedDates / closedAnnualDates. decisions.md #24).
 *
 * The version in which a property may be added follows the classification table of RELEASING.md. From 1.0.0,
 * a property added in a minor version must be optional (a required one would be a type error in users'
 * providers).
 * @public
 */
export interface HolidayProvider<Kind extends string = string> {
  /**
   * ISO 3166-1 alpha-2 (country) or ISO 3166-2 (region) code or, for a region without a code, an own code of
   * the same shape (upper case). Examples: "JP", "US-CA", "FR-AM"
   */
  readonly id: string;
  /** Time zone in which the holidays are judged (IANA name). Example: "Asia/Tokyo" */
  readonly timeZone: string;
  /** Supported years (both ends included) */
  readonly supportedYears: { readonly from: number; readonly to: number };
  /** Version of the reflected data (e.g. year and month of the reflected official gazette, "2026-02") */
  readonly dataVersion: string;
  /** Officially confirmed through this year (later years may contain confirmed: false) */
  readonly confirmedThrough?: number;
  /** Holidays of the year (at most one per date; any order) */
  holidaysInYear(year: number): readonly Holiday<Kind>[];
}
