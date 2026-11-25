/**
 * A schedule that returns a value per day (opening hours, booking slots and other things that vary by weekday,
 * holiday and specific date).
 * The priority that decides the value of a day: "Day-by-day values" in docs/guide.md and docs/decisions.md #11.
 * A business calendar (createCalendar) is built as such a schedule whose value is a boolean.
 */

import {
  lengthOfMonth,
  formatDate,
  fromDayNumber,
  isValidDate,
  parseDate,
  toDayNumber,
  type DateString,
  type Weekday,
} from "./date.ts";
import {
  checkUnknownKeys,
  describeValue,
  IssueCollector,
  rangeError,
  withoutUndefined,
  type KnownErrorCode,
} from "./errors.ts";
import { isOptionsObject } from "./options.ts";
import { checkNames } from "./names.ts";
import { RENAMED_VALUES, renameKeys, renameValue, writtenKey } from "./renamed.ts";
import {
  distinctTimeZones,
  instantToCivil,
  isDate,
  sameTimeZone,
  toCivil,
  toDateTimeParts,
  toInstant,
  validateTimeZone,
  type CivilDateTimeParts,
  type DateInput,
  type DateTimeInput,
} from "./input.ts";

export type { CivilDateTimeParts } from "./input.ts";
import { HOLIDAY_KEY_PATTERN, type Holiday, type HolidayProvider } from "./types.ts";
import type { Calendar } from "./calendar.ts";

// The last calendar date converted to or from a day number. One judgement asks for the day number and weekday
// of the same date many times, and a scan over consecutive days asks at once for the day number of the date it
// just built; this avoids parsing again (only the pair of date and day number is kept, never a judgement
// result. decisions.md #16. 0.32.7). It is rewritten only when a conversion succeeds, so an invalid date that
// throws leaves the valid old pair. It is not in date.ts because date.ts is also part of the small entry points
// of the country providers, whose size must not grow. It starts with a valid pair (with an empty string, that
// string would no longer throw as an invalid date)
let memoDate: DateString = "1970-01-01";
let memoDay = 0;

/**
 * Same as toDayNumber, with a one-entry cache of the last date converted in either direction.
 * @param date - "YYYY-MM-DD".
 * @returns Days since 1970-01-01.
 * @throws RangeError `invalid-date` for an invalid date (the cache is left unchanged).
 * @internal
 * @see decisions.md #16
 */
export function dayNumberOf(date: DateString): number {
  if (date !== memoDate) {
    memoDay = toDayNumber(date);
    memoDate = date;
  }
  return memoDay;
}

/**
 * Same as fromDayNumber; stores the pair in the cache of {@link dayNumberOf}.
 * @param dayNumber - Integer days since 1970-01-01.
 * @returns "YYYY-MM-DD".
 * @throws RangeError `out-of-range` outside the years 1000-9999.
 * @internal
 */
export function dateOfDayNumber(dayNumber: number): DateString {
  const date = fromDayNumber(dayNumber);
  memoDate = date;
  memoDay = Math.floor(dayNumber);
  return date;
}

/**
 * Day of the week (0 = Sunday) of a day number; valid for negative day numbers too.
 * @internal
 */
export const weekdayOfDayNumber = (dayNumber: number): Weekday =>
  ((((dayNumber + 4) % 7) + 7) % 7) as Weekday;
/**
 * Day of the week (0 = Sunday) of a date string.
 * @internal
 */
export const weekdayOfDate = (date: DateString): Weekday => weekdayOfDayNumber(dayNumberOf(date));

// ------------------------------------------------------------
// Public types
// ------------------------------------------------------------

/**
 * How the value of a holiday is decided (the holidayPolicy option of a schedule).
 * @public
 */
export type ScheduleHolidayPolicy<Value> =
  /** Holidays are not considered; the weekday's value is used */
  | "ignore"
  /** The value of the given weekday is used (e.g. holidays have Sunday's opening hours) */
  | { readonly sameAs: Weekday }
  /** The given value is used */
  | { readonly value: Value };

/**
 * The nth occurrence in a month (1-5). -1 is the last (the last such weekday of the month).
 * @public
 */
export type Nth = 1 | 2 | 3 | 4 | 5 | -1;

/**
 * Day of the month (1-31). -1 is the last day.
 * @public
 */
export type DayOfMonth =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | -1;

/**
 * The nth business day of a month (1-31; -1 is the last, -2 the one before, ... down to -31; 0 is not allowed).
 * @public
 */
export type BusinessDayOfMonth = number;

/**
 * The nth business day of a week (1-7; -1 is the last, -2 the one before, ... -7).
 * @public
 */
export type BusinessDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7 | -1 | -2 | -3 | -4 | -5 | -6 | -7;

/**
 * Month (1-12).
 * @public
 */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * What happens when a recurring rule falls on a holiday.
 * - "under-holiday": below the holiday; the holiday handling applies (default)
 * - "over-holiday": above the holiday; the rule applies even on a holiday
 * - "after-holiday": after the holiday; the rule does not apply on the holiday and moves to the first day on or
 *   after it that is not a holiday (which may be a Saturday)
 * @public
 */
export type HolidayOverlapPolicy = "under-holiday" | "over-holiday" | "after-holiday";

/**
 * Effective period of a rule (both ends included, "YYYY-MM-DD"). Outside it the rule is treated as not written.
 * @public
 */
export interface EffectivePeriod {
  /** Effective from this day (no start limit when omitted) */
  readonly effectiveFrom?: DateString;
  /** Effective through this day (no end limit when omitted) */
  readonly effectiveTo?: DateString;
}

/**
 * A recurring weekday. Without `nth` it is every week; with it, the nth occurrence in the month (e.g. the third
 * Wednesday). With `interval` and `anchor` it is the days on the weekday of `anchor`, every `interval` weeks
 * from `anchor` (e.g. every other Wednesday).
 * @public
 */
export interface WeekdayPattern {
  readonly weekday: Weekday;
  /**
   * The nth occurrence in the month (the nth such weekday of the month; days 1-7 are the first). An array gives
   * several. Cannot be combined with `interval`
   */
  readonly nth?: Nth | readonly Nth[];
  /** Cycle in weeks: an integer of 2 or more, given together with `anchor` (e.g. 2 for every other week) */
  readonly interval?: number;
  /**
   * Anchor date of the cycle "YYYY-MM-DD" (on the same weekday as `weekday`). The rule matches every `interval`
   * weeks before and after this day. Days before the anchor match too, so add effectiveFrom to start at the
   * anchor
   */
  readonly anchor?: DateString;
  /** Months in which the rule applies (all months when omitted) */
  readonly months?: readonly Month[];
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
}

/**
 * A recurring day of the month (e.g. the 20th, the last day). A day the month lacks (February 30, ...) does not
 * match.
 * @public
 */
export interface DayOfMonthPattern {
  /** Day of the month (1-31; -1 is the last day). An array gives several */
  readonly dayOfMonth: DayOfMonth | readonly DayOfMonth[];
  /** Months in which the rule applies (all months when omitted) */
  readonly months?: readonly Month[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
}

/**
 * The nth business day of a month (e.g. the last business day, the 5th business day). n is 1-31; -1 is the last,
 * -2 the one before. An occurrence the month lacks does not match.
 *
 * The counting basis is the judgement of the calendar in which the rule is written "with every recurring rule
 * removed" (specific dates → annual month-days → holidays → closed weekdays): closed weekdays, holidays, year-end
 * closures (closedAnnualDates) and extra closed days are not counted. Recurring rules (including regular closed
 * days written as weekday rules in closedRecurringRules) are not part of the basis. nthBusinessDayOfMonth and
 * lastBusinessDayOfMonth return the actual business days after this rule is applied, so closing
 * { businessDayOfMonth: -1 } makes lastBusinessDayOfMonth the day before.
 * holidayOverlapPolicy accepts "under-holiday" (default) and "over-holiday"; "after-holiday" is invalid-option
 * (moving an nth business day has no meaning).
 * In a calendar with holidayPolicy: "open" holidays count as business days, so an nth business day can fall on a
 * holiday; by default the holiday stage decides that day first and this rule does not apply (the same priority
 * as weekday rules). Write "the first business day is closed even on a holiday" with "over-holiday".
 * With holidayPolicy: "closed" holidays are not business days of the basis, so "over-holiday" does not change
 * the result (the diagnostics report it as info).
 *
 * In a schedule (recurringRules of createSchedule) the schedule itself has no notion of open and closed, so the
 * created calendar used as the counting basis is given with `calendar` (required; its time zone must equal the
 * schedule's). In a calendar (closedRecurringRules, openRecurringRules) `calendar` cannot be given
 * (invalid-option; the basis follows from its own options).
 * @public
 */
export interface BusinessDayOfMonthPattern {
  /** The nth business day of the month (1-31; -1 is the last, -2 the one before, ... -31). An array gives several */
  readonly businessDayOfMonth: BusinessDayOfMonth | readonly BusinessDayOfMonth[];
  /** Months in which the rule applies (all months when omitted) */
  readonly months?: readonly Month[];
  /** Calendar used as the counting basis (required in a schedule; cannot be given in a calendar) */
  readonly calendar?: Calendar;
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly skipWeekdays?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  /** What happens on a holiday (default: "under-holiday"; "after-holiday" is not accepted) */
  readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
}

/**
 * The nth business day of a week (e.g. the last or the first business day of the week). A week is the 7 days
 * from the weekday `weekStart`; n is 1-7, -1 is the last, -2 the one before. An occurrence the week lacks does
 * not match. The counting basis, `calendar` and holidayOverlapPolicy are as for businessDayOfMonth (in a
 * calendar the judgement of its own options "with every recurring rule removed"; in a schedule the required
 * `calendar`).
 * The first day of the week differs by region and trade, so `weekStart` cannot be omitted. `months` filters by
 * the month of the matching day.
 * All 7 days of the week are counted, so a day whose week partly lies outside a holiday provider's supported
 * years is out-of-range with outOfRangePolicy: "throw".
 * @public
 */
export interface BusinessDayOfWeekPattern {
  readonly businessDayOfWeek: BusinessDayOfWeek | readonly BusinessDayOfWeek[];
  /** First weekday of the week (0 = Sunday ... 6 = Saturday) */
  readonly weekStart: Weekday;
  readonly months?: readonly Month[];
  readonly calendar?: Calendar;
  /** What happens on a holiday (default: "under-holiday"; "after-holiday" is not accepted) */
  readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly skipWeekdays?: never;
  readonly cycle?: never;
  readonly positions?: never;
}

/**
 * The day after a holiday (after a run of holidays, the day after the run; the day itself is not a holiday).
 * "Holiday" means the provider's holidays only.
 * `kinds` and `keys` filter by the kind and key of the holiday on the day before (with skipWeekdays, the nearest
 * holiday before the skipped days).
 * The matching day is not a holiday, so holidayOverlapPolicy cannot be given (invalid-option).
 * @public
 */
export interface DayAfterHolidayPattern<Kind extends string = string> {
  readonly dayAfterHoliday: true;
  /**
   * Weekdays on which the rule applies (the weekday of the day after; all when omitted; e.g. [1, 2, 3, 4, 5]
   * leaves out days after a holiday that fall on a weekend)
   */
  readonly weekdays?: readonly Weekday[];
  /** Months in which the rule applies (the month of the day after; all months when omitted) */
  readonly months?: readonly Month[];
  /** Kinds of the holiday on the day before (Holiday.kind; all when omitted) */
  readonly kinds?: readonly Kind[];
  /** Keys of the holiday on the day before (Holiday.key; all when omitted; a holiday without a key never matches) */
  readonly keys?: readonly string[];
  /**
   * Weekdays skipped in addition to holidays. The rule matches the day after a block of consecutive holidays
   * and these weekdays (with at least one holiday) (e.g. the next weekday after a Friday holiday is the Monday
   * with { dayAfterHoliday: true, skipWeekdays: [0, 6] }). Not all weekdays can be given
   */
  readonly skipWeekdays?: readonly Weekday[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  readonly holidayOverlapPolicy?: never;
}

/**
 * The day before a holiday (the next day is a holiday and the day itself is not; before a run of holidays, the
 * day before its first day). "Holiday" means the provider's holidays only.
 * The mirror image of the day after a holiday (dayAfterHoliday): for rules such as prices on the eve of a
 * holiday, longer opening hours or an earlier cutoff.
 * `kinds` and `keys` filter by the kind and key of the holiday on the next day (with skipWeekdays, the nearest
 * holiday after the skipped days) (e.g. the day before Chinese New Year is
 * { dayBeforeHoliday: true, keys: ["chinese-new-year"] }).
 * The matching day is not a holiday, so holidayOverlapPolicy cannot be given (invalid-option).
 * @public
 */
export interface DayBeforeHolidayPattern<Kind extends string = string> {
  readonly dayBeforeHoliday: true;
  /**
   * Weekdays on which the rule applies (the weekday of the day before; all when omitted; e.g. [1, 2, 3, 4, 5]
   * leaves out days before a holiday that fall on a weekend)
   */
  readonly weekdays?: readonly Weekday[];
  /** Months in which the rule applies (the month of the day before; all months when omitted) */
  readonly months?: readonly Month[];
  /** Kinds of the holiday on the next day (Holiday.kind; all when omitted) */
  readonly kinds?: readonly Kind[];
  /** Keys of the holiday on the next day (Holiday.key; all when omitted; a holiday without a key never matches) */
  readonly keys?: readonly string[];
  /**
   * Weekdays skipped in addition to holidays. The rule matches the day before a block of consecutive holidays
   * and these weekdays (with at least one holiday) (e.g. the last weekday before a Monday holiday is the Friday
   * with { dayBeforeHoliday: true, skipWeekdays: [0, 6] }). Not all weekdays can be given
   */
  readonly skipWeekdays?: readonly Weekday[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly holiday?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  readonly holidayOverlapPolicy?: never;
}

/**
 * A cycle in days (e.g. the days off of a 4-on-2-off rota, an inspection every 10 days): a cycle that does not
 * align with weeks or months, written as days from an anchor.
 * It repeats every `cycle` days with the anchor as day 1 and matches the days listed in `positions`
 * (e.g. the days off of a 4-on-2-off rota: { cycle: 6, anchor: "2026-01-05", positions: [5, 6] }). Days before
 * the anchor match too, so add effectiveFrom to start at the anchor. holidayOverlapPolicy accepts
 * "under-holiday" (default) and "over-holiday"; "after-holiday" is invalid-option (moving a day of the cycle
 * after a holiday has no meaning).
 * @public
 */
export interface CyclePattern {
  /** Cycle in days: an integer of 2 or more */
  readonly cycle: number;
  /** Anchor date of the cycle "YYYY-MM-DD" (day 1) */
  readonly anchor: DateString;
  /** Matching days (positions within the cycle: distinct integers from 1 to cycle; not all days can be given) */
  readonly positions: readonly number[];
  /** Months in which the rule applies (all months when omitted) */
  readonly months?: readonly Month[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly skipWeekdays?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  /** What happens on a holiday (default: "under-holiday"; "after-holiday" is not accepted) */
  readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
}

/**
 * A holiday (a day that is a holiday of the provider). `kinds` filters by kind and `keys` by individual holiday
 * (all holidays when omitted).
 * Judged at the "over the holiday" stage (before holidayPolicy), it writes exceptions to the default holiday
 * handling (e.g. "open on holidays from April 2027", "consultations on substitute holidays", "special opening
 * hours on holidays in May").
 * The matching day is a holiday, so holidayOverlapPolicy cannot be given (invalid-option).
 * @public
 */
export interface HolidayPattern<Kind extends string = string> {
  readonly holiday: true;
  /**
   * Kinds of holidays to match (Holiday.kind; all when omitted). Completion works with the provider's kind type
   * (the type is open, so other strings pass too)
   */
  readonly kinds?: readonly Kind[];
  /**
   * Keys of holidays to match (Holiday.key; all when omitted). ANDed with kinds, weekdays and months.
   * Points at individual holidays that cannot be written as a month-day or an nth weekday, such as the vernal
   * equinox, days tied to Easter and lunar-calendar holidays (e.g. "open on the equinox days" is
   * { holiday: true, keys: ["vernal-equinox", "autumnal-equinox"] }).
   * A substitute day has the key of the original holiday, so "Coming of Age Day and its substitute" can be
   * pointed at; add `kinds` for the day itself only.
   * A holiday without a key (citizens' holiday, special holiday) never matches
   */
  readonly keys?: readonly string[];
  /** Weekdays on which the rule applies (all when omitted; e.g. [6] for holidays on a Saturday only) */
  readonly weekdays?: readonly Weekday[];
  /** Months in which the rule applies (all months when omitted) */
  readonly months?: readonly Month[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly skipWeekdays?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  readonly holidayOverlapPolicy?: never;
}

/**
 * A recurring pattern. Weekday and day-of-month rules may have skipWeekdays only with "after-holiday".
 * @public
 */
export type RecurringPattern<Kind extends string = string> =
  | (WeekdayPattern &
      (
        | {
            /** On a holiday, move to the first day on or after it that is not a holiday */
            readonly holidayOverlapPolicy: "after-holiday";
            /**
             * Weekdays skipped in addition to holidays when looking for the day to move to (0 = Sunday ...
             * 6 = Saturday). When the original day is a holiday or one of these weekdays, the rule moves to the
             * first day on or after it that is neither (e.g. closed on Mondays, and on the next weekday, never a
             * Saturday, when Monday is a holiday:
             * { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [6] }). `weekday` itself cannot
             * be included
             */
            readonly skipWeekdays?: readonly Weekday[];
          }
        | {
            /** What happens on a holiday (default: "under-holiday") */
            readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
            readonly skipWeekdays?: never;
          }
      ))
  | (DayOfMonthPattern &
      (
        | {
            /** On a holiday, move to the first day on or after it that is not a holiday */
            readonly holidayOverlapPolicy: "after-holiday";
            /**
             * Weekdays skipped in addition to holidays when looking for the day to move to (0 = Sunday ...
             * 6 = Saturday). When the original day is a holiday or one of these weekdays, the rule moves to the
             * first day on or after it that is neither (e.g. "June 15 is Foundation Day; on a weekend or holiday,
             * the next business day" is
             * { dayOfMonth: 15, months: [6], holidayOverlapPolicy: "after-holiday", skipWeekdays: [0, 6] })
             */
            readonly skipWeekdays?: readonly Weekday[];
          }
        | {
            /** What happens on a holiday (default: "under-holiday") */
            readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
            readonly skipWeekdays?: never;
          }
      ))
  | BusinessDayOfMonthPattern
  | BusinessDayOfWeekPattern
  | DayAfterHolidayPattern<Kind>
  | DayBeforeHolidayPattern<Kind>
  | HolidayPattern<Kind>
  | CyclePattern;

/**
 * A recurring rule (closedRecurringRules / openRecurringRules of a business calendar).
 * An nth-business-day rule cannot have `calendar` (the counting basis is its own options).
 * @public
 */
export type RecurringRule<Kind extends string = string> = (
  | Exclude<RecurringPattern<Kind>, BusinessDayOfMonthPattern | BusinessDayOfWeekPattern>
  | ((BusinessDayOfMonthPattern | BusinessDayOfWeekPattern) & { readonly calendar?: never })
) &
  EffectivePeriod & {
    readonly name?: string;
    /** @deprecated Renamed to holidayOverlapPolicy in 0.30.0. Removed in 1.0.0 */
    readonly onHolidayRule?: HolidayOverlapPolicy;
  };

/**
 * A value for a recurring rule (recurringRules of a schedule). An nth-business-day rule requires `calendar`, the
 * calendar used as the counting basis.
 * @public
 */
export type ScheduleRecurringRule<Value, Kind extends string = string> = (
  | Exclude<RecurringPattern<Kind>, BusinessDayOfMonthPattern | BusinessDayOfWeekPattern>
  | ((BusinessDayOfMonthPattern | BusinessDayOfWeekPattern) & { readonly calendar: Calendar })
) &
  EffectivePeriod & {
    readonly name?: string;
    /** @deprecated Renamed to holidayOverlapPolicy in 0.30.0. Removed in 1.0.0 */
    readonly onHolidayRule?: HolidayOverlapPolicy;
    readonly value: Value;
  };

/**
 * A value for an annual month-day "MM-DD". The month-day is as in AnnualDate (one that exists in no year is
 * invalid-annual-date; "02-29" matches leap years only).
 * @public
 */
export interface ScheduleAnnualDate<Value> extends EffectivePeriod {
  readonly date: string;
  readonly value: Value;
  readonly name?: string;
}

/**
 * A value for a range of annual month-days (from > to crosses the year end, e.g. 12-31 to 01-03). The ends and
 * "02-29" are as in AnnualRange.
 * @public
 */
export interface ScheduleAnnualRange<Value> extends EffectivePeriod {
  readonly from: string;
  readonly to: string;
  readonly value: Value;
  readonly name?: string;
}

/**
 * A value for a specific date "YYYY-MM-DD".
 * @public
 */
export interface ScheduleSpecificDate<Value> {
  readonly date: DateString;
  readonly value: Value;
  readonly name?: string;
}

/**
 * A value for a range of specific dates (both ends included).
 * @public
 */
export interface ScheduleDateRange<Value> {
  readonly from: DateString;
  readonly to: DateString;
  readonly value: Value;
  readonly name?: string;
}

/**
 * Options for the holiday providers and the time zone (shared by schedules and business calendars).
 * To stop by type the mistake of passing a holiday provider, a created calendar or a schedule as the options
 * (createCalendar(jp), ...; a provider goes in holidayProvider), the property holidaysInYear, which all three
 * have, cannot be written.
 * @public
 */
export interface HolidaySourceOptions<Kind extends string = string> {
  /** Holiday providers (e.g. jp). Several form a union */
  readonly holidayProvider?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
  /** @deprecated Renamed to holidayProvider in 0.30.0. Removed in 1.0.0 */
  readonly holidays?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
  /** @deprecated Renamed to outOfRangePolicy in 0.30.0. Removed in 1.0.0 */
  readonly outOfRange?: "throw" | "ignore";
  /** @deprecated Renamed to unconfirmedHolidayPolicy in 0.30.0. Removed in 1.0.0 */
  readonly unconfirmedHolidays?: "accept" | "throw";
  /**
   * Time zone in which date-time inputs (Date, strings with an offset, ...) are converted to a calendar date.
   * When omitted, the time zone of the holiday provider, or "UTC" without a provider. When written, it takes
   * priority over the provider's time zone (a provider's holidays are looked up by calendar date, so changing
   * the conversion time zone does not change the holiday dates)
   */
  readonly timeZone?: string;
  /** What happens for a date outside the supported years of a holiday provider (default: "throw") */
  readonly outOfRangePolicy?: "throw" | "ignore";
  /**
   * What happens when a judgement touches an unconfirmed holiday (confirmed: false of the provider, such as the
   * predicted equinox days of Japan) (default: "accept").
   * With "throw", not only dayInfoOn and isBusinessDay but every day whose holiday is looked up - days evaluated
   * during a search, an adjustment or a due-date calculation, and the neighbouring days seen by day-after /
   * day-before rules - throws a RangeError with unconfirmed-holiday when it is an unconfirmed holiday.
   * holidaysInYear and holidaysBetween do not throw, so they can list the affected days.
   * It matters only for options whose judgement depends on holidays (conditions: "Unconfirmed holidays" in the
   * guide. decisions.md #17)
   */
  readonly unconfirmedHolidayPolicy?: "accept" | "throw";
  // Stops by type the mistake of passing a provider, a calendar or a schedule as it is (all three have
  // holidaysInYear; at run time it stays an unknown key. decisions.md #8)
  readonly holidaysInYear?: never;
}

/**
 * Options of a schedule.
 * @public
 */
export interface ScheduleOptions<
  Value,
  Kind extends string = string,
> extends HolidaySourceOptions<Kind> {
  /** Value per weekday ([Sun, Mon, Tue, Wed, Thu, Fri, Sat]) */
  readonly weekdayValues: readonly [Value, Value, Value, Value, Value, Value, Value];
  /**
   * How the value of a holiday is decided (default: "ignore"). When omitted, holidays do not affect the value
   * even with a holiday provider (a holiday gets its weekday's value). This differs from the default of a
   * business calendar (closed on holidays), so write it to give holidays another value
   */
  readonly holidayPolicy?: ScheduleHolidayPolicy<Value>;
  /** Values for recurring rules (the shapes of rules are in the table of "Recurring rules" in the guide) */
  readonly recurringRules?: readonly ScheduleRecurringRule<Value, Kind>[];
  /** Values for annual month-days */
  readonly annualDates?: readonly (ScheduleAnnualDate<Value> | ScheduleAnnualRange<Value>)[];
  /** @deprecated Renamed to holidayPolicy in 0.30.0 (the value "weekday" is "ignore"). Removed in 1.0.0 */
  readonly holiday?: ScheduleHolidayPolicy<Value> | "weekday";
  /** @deprecated Renamed to recurringRules in 0.30.0. Removed in 1.0.0 */
  readonly recurring?: readonly ScheduleRecurringRule<Value, Kind>[];
  /** @deprecated Renamed to annualDates in 0.30.0. Removed in 1.0.0 */
  readonly annual?: readonly (ScheduleAnnualDate<Value> | ScheduleAnnualRange<Value>)[];
  /** Values for specific dates */
  readonly dates?: readonly (ScheduleSpecificDate<Value> | ScheduleDateRange<Value>)[];
}

/**
 * The rule that decided the value (known values).
 * @public
 */
export type KnownScheduleDayReason = "date" | "annual" | "recurring" | "holiday" | "weekday";

/**
 * The rule that decided the value. Later versions may add values, so handle "anything else" when branching.
 * Use KnownScheduleDayReason to check by type that every value is handled.
 * @public
 */
export type ScheduleDayReason = KnownScheduleDayReason | (string & {});

/**
 * The value of one day and the rule that decided it.
 * @public
 */
export interface ScheduleDayInfo<Value, Kind extends string = string> {
  readonly date: DateString;
  readonly weekday: Weekday;
  readonly value: Value;
  /** The rule that decided the value */
  readonly reason: ScheduleDayReason;
  /** Name of the rule that decided the value (`name` of dates, annualDates, recurringRules; the holiday name) */
  readonly name?: string;
  /** The holiday, when the day is one (present whatever holidayPolicy is) */
  readonly holiday?: Holiday<Kind>;
  /**
   * When a rule moved from a holiday decided the value, the original date of the move
   * (holidayOverlapPolicy: "after-holiday")
   */
  readonly shiftedFrom?: DateString;
  /**
   * Position in the options of the rule that decided the value (the same form as `path` of the diagnostics,
   * e.g. "recurringRules[0]"). Present only on days decided by dates, annualDates or recurringRules (including
   * the day a rule moved to); absent on days decided by a holiday or a weekday.
   * Options written with the old key names also return the position under the new names
   */
  readonly optionPath?: string;
  /** @deprecated Renamed to optionPath in 0.30.0 (same value). Removed in 1.0.0 */
  readonly rulePath?: string;
}

/**
 * Looking up holidays (shared by schedules and business calendars).
 * @public
 */
export interface HolidayLookup<Kind extends string = string> {
  /**
   * Time zone in which date-time inputs are converted to a calendar date. It is the name returned by the
   * runtime's Intl, which can differ from the spelling in the options and between runtimes ("Asia/Kolkata" is
   * "Asia/Calcutta" in Node.js and "Asia/Kolkata" in Bun). Two zones are the same when this name is the same;
   * otherwise Temporal's comparison decides when the runtime has Temporal, and they are different when it does
   * not (different zones are a time-zone-conflict. decisions.md #18)
   */
  readonly timeZone: string;
  /** Holiday providers */
  readonly providers: readonly HolidayProvider<Kind>[];
  /**
   * What happens for a date outside the supported years of a holiday provider (the option's value; in a combined
   * calendar a summary of the member calendars: "throw" when any is "throw". decisions.md #17)
   */
  readonly outOfRangePolicy: "throw" | "ignore";
  /**
   * What happens when a judgement touches an unconfirmed holiday (the option's value; in a combined calendar a
   * summary of the member calendars: "throw" when any is "throw". decisions.md #17)
   */
  readonly unconfirmedHolidayPolicy: "accept" | "throw";
  /** @deprecated Renamed to outOfRangePolicy in 0.30.0 (same value). Removed in 1.0.0 */
  readonly outOfRange: "throw" | "ignore";
  /** @deprecated Renamed to unconfirmedHolidayPolicy in 0.30.0 (same value). Removed in 1.0.0 */
  readonly unconfirmedHolidays: "accept" | "throw";

  /**
   * Converts a date input to the calendar date in this object's time zone.
   * @param input - A date string, a date-time string, a Date, or a Temporal-like object.
   * @returns "YYYY-MM-DD".
   * @throws RangeError `invalid-date`, `invalid-time`, `out-of-range`; TypeError `invalid-input`.
   */
  dateOf(input: DateInput): DateString;
  /**
   * Converts a date input to the calendar date and time "HH:mm" in this object's time zone.
   * @param input - A date input.
   * @returns A frozen `{ date, time }`; `time` is null for a date-only input.
   * @throws As {@link HolidayLookup.dateOf}.
   */
  civilOf(input: DateTimeInput): CivilDateTimeParts<string>;
  civilOf(input: DateInput): CivilDateTimeParts;
  /**
   * The instant of a calendar date and a time of day in this object's time zone. Inverse of {@link
   * HolidayLookup.civilOf}; same rules as toInstant.
   * @param date - "YYYY-MM-DD".
   * @param time - "HH:mm" or "HH:mm:ss".
   * @returns A Date. A time skipped by a DST change maps later by the gap; a time that occurs twice maps to the
   *   earlier instant.
   * @throws RangeError `invalid-date`, `invalid-time`.
   */
  instantOf(date: DateString, time: string): Date;
  /**
   * Today's date in this object's time zone.
   * @param now - The current instant; default `new Date()`. Must be a Date.
   * @returns "YYYY-MM-DD".
   * @throws RangeError `invalid-argument` when `now` is not a Date; `invalid-time` for an invalid Date;
   *   `out-of-range` outside the years 1000-9999.
   */
  today(now?: Date): DateString;

  /**
   * Whether a day is a holiday of the providers.
   * @param input - A date input.
   * @returns true for a holiday; always false without providers.
   * @throws As {@link HolidayLookup.holidayOn}.
   */
  isHoliday(input: DateInput): boolean;
  /**
   * The holiday on a day.
   * @param input - A date input.
   * @returns The holiday (of the first provider that has one on that day), or undefined.
   * @throws RangeError `out-of-range` when the year is outside a provider's supported years and outOfRangePolicy is
   *   "throw"; `unconfirmed-holiday` for an unconfirmed holiday with unconfirmedHolidayPolicy "throw";
   *   `invalid-provider-data` when a provider returns invalid data; the input errors of {@link HolidayLookup.dateOf}.
   */
  holidayOn(input: DateInput): Holiday<Kind> | undefined;
  /**
   * @deprecated Renamed to `holidayOn` in 0.30.0 (same behaviour). Removed in 1.0.0.
   */
  getHoliday(input: DateInput): Holiday<Kind> | undefined;
  /**
   * The holidays of a year.
   * @param year - Integer from 1000 to 9999.
   * @returns A frozen array sorted by date; on a date with several providers' holidays, the first provider's.
   *   Unconfirmed holidays are included and never throw here.
   * @throws RangeError `invalid-argument` when the year is not an integer; `out-of-range` outside 1000-9999, or
   *   outside a provider's supported years with outOfRangePolicy "throw"; `invalid-provider-data`.
   */
  holidaysInYear(year: number): readonly Holiday<Kind>[];
  /**
   * The holidays of a period.
   * @param from - First day.
   * @param to - Last day (inclusive).
   * @returns A frozen array sorted by date.
   * @throws RangeError `invalid-range` when `from` is after `to`; otherwise as {@link HolidayLookup.holidaysInYear}
   *   for every year of the period.
   */
  holidaysBetween(from: DateInput, to: DateInput): readonly Holiday<Kind>[];
}

/**
 * A schedule that returns a value per day.
 * @public
 */
export interface Schedule<Value, Kind extends string = string> extends HolidayLookup<Kind> {
  /**
   * The value of a day.
   * @param input - A date input.
   * @returns The value decided by, in order: specific dates, annual dates, "over-holiday" recurring rules on a
   *   holiday, the holiday policy, recurring rules, the weekday value.
   * @throws The input errors of {@link HolidayLookup.dateOf}; `out-of-range`, `holiday-run-too-long`,
   *   `invalid-provider-data` when the judgement throws; `unconfirmed-holiday` only when the result can depend on
   *   holidays.
   * @see decisions.md #11
   */
  valueOn(input: DateInput): Value;
  /**
   * The value of a day and the rule that decided it.
   * @param input - A date input.
   * @returns A frozen ScheduleDayInfo. `reason` names the deciding rule: with holidayPolicy "ignore" a holiday still
   *   reports "weekday"; whether the day is a holiday is told by `holiday`.
   * @throws As {@link Schedule.valueOn}; `unconfirmed-holiday` whenever the day's holiday is unconfirmed and the
   *   policy is "throw".
   */
  dayInfoOn(input: DateInput): ScheduleDayInfo<Value, Kind>;
  /**
   * @deprecated Renamed to `dayInfoOn` in 0.30.0 (same behaviour). Removed in 1.0.0.
   */
  dayInfo(input: DateInput): ScheduleDayInfo<Value, Kind>;
  /**
   * The value and deciding rule of every day of a period.
   * @param from - First day.
   * @param to - Last day (inclusive).
   * @returns A frozen array in date order.
   * @throws RangeError `invalid-range` when `from` is after `to`; the errors of {@link Schedule.dayInfoOn} for any
   *   day.
   */
  daysBetween(from: DateInput, to: DateInput): readonly ScheduleDayInfo<Value, Kind>[];
}

// ------------------------------------------------------------
// Input checks (problems are collected; creation throws the first error)
// ------------------------------------------------------------

const MONTH_DAY_RE = /^(\d{2})-(\d{2})$/;
const MAX_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Whether a value is a non-null object that is not an array.
 * @internal
 */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Whether a value is a month-day string "MM-DD" that exists in some year ("02-29" is valid).
 * @internal
 */
export function isValidMonthDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = MONTH_DAY_RE.exec(value);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= MAX_DAYS_IN_MONTH[month - 1]!;
}

/**
 * Whether a value is a weekday number: an integer 0-6.
 * @internal
 */
export const isWeekday = (value: unknown): value is Weekday =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;

/** @internal A specific-date rule (a period in day numbers) */
export interface DateRule<Value> {
  /** Position in the options (e.g. "closedDates[1]") */
  readonly path: string;
  readonly from: number;
  readonly to: number;
  readonly value: Value;
  readonly name: string | undefined;
}

/** @internal An effective period (day numbers; an omitted side is null) */
export interface CompiledPeriod {
  readonly effectiveFrom: number | null;
  readonly effectiveTo: number | null;
}

/** @internal An annual month-day rule */
export interface AnnualRule<Value> extends CompiledPeriod {
  /** Position in the options (e.g. "closedAnnualDates[0]") */
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly value: Value;
  readonly name: string | undefined;
}

/**
 * Whether day number `n` lies in the effective period (a null end is open).
 * @internal
 */
export const inPeriod = (rule: CompiledPeriod, n: number): boolean =>
  (rule.effectiveFrom === null || n >= rule.effectiveFrom) &&
  (rule.effectiveTo === null || n <= rule.effectiveTo);

/**
 * Validates `effectiveFrom` and `effectiveTo` of a rule entry.
 * @param c - Receives `invalid-date` (at `path.key`) or `invalid-range` (at `path`).
 * @param path - Position of the entry.
 * @param entry - The rule entry.
 * @returns The period as day numbers (null for an omitted end), or undefined when an error was recorded.
 * @internal
 */
export function checkPeriod(
  c: IssueCollector,
  path: string,
  entry: Record<string, unknown>,
): CompiledPeriod | undefined {
  let ok = true;
  const read = (key: "effectiveFrom" | "effectiveTo"): number | null => {
    const raw = entry[key];
    if (raw === undefined) return null;
    const n = checkDate(c, `${path}.${key}`, raw);
    if (n === undefined) ok = false;
    return n ?? null;
  };
  const effectiveFrom = read("effectiveFrom");
  const effectiveTo = read("effectiveTo");
  if (!ok) return undefined;
  if (effectiveFrom !== null && effectiveTo !== null && effectiveFrom > effectiveTo) {
    c.error(
      "invalid-range",
      path,
      `"effectiveFrom" must not be after "effectiveTo" (${String(entry["effectiveFrom"])} > ${String(entry["effectiveTo"])})`,
    );
    return undefined;
  }
  return { effectiveFrom, effectiveTo };
}

/**
 * Validates the optional `name` of an entry.
 * @returns The name, or undefined when omitted or invalid (`invalid-option` is recorded at `path.name`).
 * @internal
 */
export function checkName(c: IssueCollector, path: string, name: unknown): string | undefined {
  if (name === undefined) return undefined;
  if (typeof name !== "string") {
    c.error("invalid-option", `${path}.name`, "name must be a string");
    return undefined;
  }
  return name;
}

/**
 * Validates a date string.
 * @returns Its day number, or undefined after recording `invalid-date` at `path`.
 * @internal
 */
export function checkDate(c: IssueCollector, path: string, value: unknown): number | undefined {
  if (!isValidDate(value)) {
    c.error("invalid-date", path, `Invalid date ${describeValue(value)} (expected YYYY-MM-DD)`);
    return undefined;
  }
  return dayNumberOf(value);
}

/**
 * Validates a month-day string "MM-DD".
 * @returns The string, or undefined after recording `invalid-annual-date` at `path`.
 * @internal
 */
export function checkMonthDay(c: IssueCollector, path: string, value: unknown): string | undefined {
  if (!isValidMonthDay(value)) {
    c.error(
      "invalid-annual-date",
      path,
      `Invalid annual date ${describeValue(value)} (expected MM-DD)`,
    );
    return undefined;
  }
  return value;
}

/**
 * @internal Reads the value of a rule: returns it wrapped as { value }, or undefined when there is none (an
 * error). In a schedule undefined is a value too, so "none" is not expressed by comparing the value itself with
 * undefined
 */
export type RuleValueOf<Value> = (
  entry: Record<string, unknown>,
  path: string,
) => { readonly value: Value } | undefined;

/**
 * Validates and compiles specific dates.
 * @param c - Receives the problems.
 * @param path - Position of the array (e.g. "closedDates").
 * @param entries - undefined, or an array of "YYYY-MM-DD" (when `allowString`), `{ date }` or `{ from, to }`, each
 *   with optional `name`.
 * @param valueOf - Extracts the value of an entry; returns undefined after recording an error.
 * @param allowString - Whether a bare date string is accepted.
 * @param valueKey - Whether `value` is a known key of an entry.
 * @returns One rule per valid entry, in array order (invalid entries are skipped). Holes count as undefined entries.
 *   An entry with both `date` and `from`/`to`, or `from` after `to`, is an error.
 * @internal
 * @see decisions.md #6, #8
 */
export function compileDateRules<Value>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: RuleValueOf<Value>,
  allowString: boolean,
  /**
   * Whether `value` of an element is a known key (true for schedules; false for calendars, where writing it is
   * unknown-option in the diagnostics)
   */
  valueKey: boolean,
): DateRule<Value>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: DateRule<Value>[] = [];
  // A hole is validated as an undefined element (forEach skips holes. decisions.md #6)
  Array.from(entries as unknown[]).forEach((raw: unknown, i) => {
    const p = `${path}[${i}]`;
    const entry: unknown = allowString && typeof raw === "string" ? { date: raw } : raw;
    if (!isObject(entry)) {
      c.error(
        "invalid-option",
        p,
        allowString ? "must be a date string or an object" : "must be an object",
      );
      return;
    }
    const got = valueOf(entry, p);
    const name = checkName(c, p, entry["name"]);
    // An explicit undefined in the properties that tell the two shapes apart (date; from and to) equals omission.
    // An undefined in other properties equals omission when read, and stays for the unknown-key check
    const defined = withoutUndefined(entry, DATE_SHAPE_KEYS);
    // Writing both a single day (date) and a period (from, to) throws: either choice could misread the intent
    // (decisions.md #8)
    if ("date" in defined && ("from" in defined || "to" in defined)) {
      c.error("invalid-option", p, 'cannot have both "date" and "from"/"to"');
      return;
    }
    if ("date" in defined) {
      checkUnknownKeys(c, p, defined, ["date", "name", ...(valueKey ? ["value"] : [])]);
      const n = checkDate(c, `${p}.date`, entry["date"]);
      if (n !== undefined && got !== undefined)
        rules.push({ path: p, from: n, to: n, value: got.value, name });
      return;
    }
    if (!("from" in defined) || !("to" in defined)) {
      c.error("invalid-option", p, 'must have "date" or both "from" and "to"');
      return;
    }
    checkUnknownKeys(c, p, defined, ["from", "to", "name", ...(valueKey ? ["value"] : [])]);
    const from = checkDate(c, `${p}.from`, entry["from"]);
    const to = checkDate(c, `${p}.to`, entry["to"]);
    if (from === undefined || to === undefined) return;
    if (from > to) {
      c.error(
        "invalid-range",
        p,
        `"from" must not be after "to" (${String(entry["from"])} > ${String(entry["to"])})`,
      );
      return;
    }
    if (got !== undefined) rules.push({ path: p, from, to, value: got.value, name });
  });
  return rules;
}

/**
 * Validates and compiles annual dates.
 * @param c - Receives the problems.
 * @param path - Position of the array.
 * @param entries - undefined, or an array of "MM-DD" (when `allowString`), `{ date }` or `{ from, to }`, each with
 *   optional `name`, `effectiveFrom`, `effectiveTo`.
 * @param valueOf - Extracts the value of an entry.
 * @param allowString - Whether a bare string is accepted.
 * @param valueKey - Whether `value` is a known key.
 * @returns One rule per valid entry, in array order. `from` later than `to` is valid and wraps over the year end.
 * @internal
 */
export function compileAnnualRules<Value>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: RuleValueOf<Value>,
  allowString: boolean,
  /**
   * Whether `value` of an element is a known key (true for schedules; false for calendars, where writing it is
   * unknown-option in the diagnostics)
   */
  valueKey: boolean,
): AnnualRule<Value>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: AnnualRule<Value>[] = [];
  // A hole is validated as an undefined element (forEach skips holes. decisions.md #6)
  Array.from(entries as unknown[]).forEach((raw: unknown, i) => {
    const p = `${path}[${i}]`;
    const entry: unknown = allowString && typeof raw === "string" ? { date: raw } : raw;
    if (!isObject(entry)) {
      c.error(
        "invalid-option",
        p,
        allowString ? "must be an annual date string (MM-DD) or an object" : "must be an object",
      );
      return;
    }
    const got = valueOf(entry, p);
    const name = checkName(c, p, entry["name"]);
    const period = checkPeriod(c, p, entry);
    // An explicit undefined in the properties that tell the two shapes apart (date; from and to) equals omission.
    // An undefined in other properties equals omission when read, and stays for the unknown-key check
    const defined = withoutUndefined(entry, DATE_SHAPE_KEYS);
    // Writing both a single day (date) and a period (from, to) throws: either choice could misread the intent
    // (decisions.md #8)
    if ("date" in defined && ("from" in defined || "to" in defined)) {
      c.error("invalid-option", p, 'cannot have both "date" and "from"/"to"');
      return;
    }
    if ("date" in defined) {
      checkUnknownKeys(c, p, defined, [
        "date",
        "name",
        ...(valueKey ? ["value"] : []),
        ...PERIOD_KEYS,
      ]);
      const md = checkMonthDay(c, `${p}.date`, entry["date"]);
      if (md !== undefined && got !== undefined && period) {
        rules.push({ path: p, from: md, to: md, value: got.value, name, ...period });
      }
      return;
    }
    if (!("from" in defined) || !("to" in defined)) {
      c.error("invalid-option", p, 'must have "date" or both "from" and "to"');
      return;
    }
    checkUnknownKeys(c, p, defined, [
      "from",
      "to",
      "name",
      ...(valueKey ? ["value"] : []),
      ...PERIOD_KEYS,
    ]);
    const from = checkMonthDay(c, `${p}.from`, entry["from"]);
    const to = checkMonthDay(c, `${p}.to`, entry["to"]);
    if (from !== undefined && to !== undefined && got !== undefined && period) {
      rules.push({ path: p, from, to, value: got.value, name, ...period });
    }
  });
  return rules;
}

/** @internal A recurring rule (validated) */
export interface RecurringRuleCompiled<Value> extends CompiledPeriod {
  /** Position in the options (e.g. "closedRecurringRules[0]") */
  readonly path: string;
  /** The weekday for a weekday rule; null for a day rule */
  readonly weekday: Weekday | null;
  /** Set of nth occurrences (null means every week) */
  readonly nth: ReadonlySet<number> | null;
  /** Cycle in weeks; null for every-week, nth-occurrence and day rules */
  readonly interval: number | null;
  /** Anchor of the cycle (day number); null when interval and cycle are null */
  readonly anchor: number | null;
  /** Cycle in days; null unless a cycle rule */
  readonly cycle: number | null;
  /** Matching days within the cycle (1-based); null unless a cycle rule */
  readonly positions: ReadonlySet<number> | null;
  /** Set of days of the month (null for a weekday rule) */
  readonly days: ReadonlySet<number> | null;
  /** Set of nth business days (null unless an nth-business-day rule) */
  readonly businessDays: ReadonlySet<number> | null;
  /** First weekday of the week for an nth-business-day-of-week rule (null for month rules and other rules) */
  readonly weekStart: number | null;
  /**
   * Counting basis (from `calendar` of a schedule's nth-business-day rule; null means the judgement of the own
   * options "with recurring rules removed")
   */
  readonly basis: BasisOfMonth | null;
  /** The calendar behind `basis` (the diagnostics compare whether two bases are the same; null when basis is null) */
  readonly calendar: Calendar | null;
  /**
   * Weekdays skipped in addition to holidays by the "after-holiday" move and in the blocks of day-after /
   * day-before rules (null means none)
   */
  readonly skipWeekdays: ReadonlySet<number> | null;
  /** Whether this is a day-after-holiday rule */
  readonly dayAfterHoliday: boolean;
  /** Whether this is a day-before-holiday rule */
  readonly dayBeforeHoliday: boolean;
  /** Whether this is a holiday rule */
  readonly holiday: boolean;
  /** Kinds that filter a holiday, day-after or day-before rule (null means every holiday) */
  readonly kinds: ReadonlySet<string> | null;
  /**
   * Whether the old name "national" in kinds also matches holidays of kind "regular" returned by the Japanese
   * provider (docs/decisions.md #10)
   */
  readonly nationalOfJp: boolean;
  /** Keys that filter a holiday, day-after or day-before rule (null means every holiday) */
  readonly keys: ReadonlySet<string> | null;
  /** Weekdays that filter a holiday, day-after or day-before rule (null means every weekday) */
  readonly weekdays: ReadonlySet<number> | null;
  /** Set of months (null means every month) */
  readonly months: ReadonlySet<number> | null;
  readonly holidayOverlapPolicy: HolidayOverlapPolicy;
  readonly value: Value;
  readonly name: string | undefined;
}

const NTH_VALUES = [1, 2, 3, 4, 5, -1];
/**
 * Whether a value is a valid nth business day of a week: a non-zero integer from -7 to 7.
 * @internal
 */
export const isBusinessDayOfWeek = (v: unknown): boolean =>
  Number.isInteger(v) && v !== 0 && (v as number) >= -7 && (v as number) <= 7;
/**
 * Whether a value is a valid nth business day of a month: a non-zero integer from -31 to 31.
 * @internal
 */
export const isBusinessDayOfMonth = (v: unknown): boolean =>
  Number.isInteger(v) && v !== 0 && (v as number) >= -31 && (v as number) <= 31;

/**
 * @internal Counting basis: takes a year and a month and returns, in date order, the days (1-31) that are
 * business days of the basis in that month. Used to judge nth-business-day rules (businessDayOfMonth)
 */
export type BasisOfMonth = (year: number, month: number) => readonly number[];

/**
 * Builds a counting basis from a business-day predicate.
 * @param isOpen - Whether a date is a business day; may throw.
 * @returns (year, month) => the days of the month (1-31, ascending) for which `isOpen` is true, frozen. Results are
 *   cached per month (at most 240 months; the cache is then cleared). A month in which `isOpen` throws is not cached
 *   and throws again.
 * @internal
 */
export function basisFromPredicate(isOpen: (date: DateString) => boolean): BasisOfMonth {
  const cache = new Map<number, readonly number[]>();
  return (year, month) => {
    const key = year * 12 + month;
    let days = cache.get(key);
    if (days === undefined) {
      const list: number[] = [];
      const dim = lengthOfMonth(year, month);
      // d is a day that exists in the month, so the built string is not parsed again (0.32.7)
      for (let d = 1; d <= dim; d++) if (isOpen(formatDate(year, month, d, true))) list.push(d);
      days = Object.freeze(list);
      // At most 240 months (20 years) are kept. It covers the periods of ordinary use and bounds the memory of
      // the scans of the diagnostics (the diagnostic range, 1955-2099); the value was not chosen by measurement.
      // Beyond it everything is cleared (a scan goes in month order, so evicting only old months would hardly
      // be reused)
      if (cache.size >= 240) cache.clear();
      cache.set(key, days);
    }
    return days;
  };
}

/**
 * Whether a value looks like a calendar: an object with a function `isBusinessDay` and a string `timeZone`.
 * @internal
 */
export const isCalendarLike = (v: unknown): v is Calendar =>
  isObject(v) && typeof v["isBusinessDay"] === "function" && typeof v["timeZone"] === "string";
const ON_HOLIDAY_RULES: readonly HolidayOverlapPolicy[] = [
  "under-holiday",
  "over-holiday",
  "after-holiday",
];
/**
 * Whether a value is a valid day of the month: an integer 1-31, or -1.
 * @internal
 */
export const isDayOfMonth = (v: unknown): boolean =>
  v === -1 || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31);
/**
 * Whether a value is a month number: an integer 1-12.
 * @internal
 */
export const isMonth = (v: unknown): boolean =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;

/**
 * Validates a single value or a non-empty array of values and returns them as a set.
 * @param c - Receives the error.
 * @param path - Position.
 * @param raw - A value or an array.
 * @param valid - Element predicate.
 * @param expected - Description for the message.
 * @param elementCode - Code for an invalid element; an empty array is always `invalid-option`.
 * @returns The set, or undefined after recording an error.
 * @internal
 */
export function checkSet(
  c: IssueCollector,
  path: string,
  raw: unknown,
  valid: (v: unknown) => boolean,
  expected: string,
  /**
   * Code for a wrong element value (invalid-weekday for weekdays. decisions.md #8). An empty array stays
   * invalid-option
   */
  elementCode: KnownErrorCode = "invalid-option",
): Set<number> | undefined {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0 || !Array.from(list).every(valid)) {
    c.error(
      list.length === 0 ? "invalid-option" : elementCode,
      path,
      `must be ${expected}, or a non-empty array of them`,
    );
    return undefined;
  }
  return new Set(list as number[]);
}

/**
 * Which pattern keys an entry of recurring rules has.
 * @internal
 */
export interface RuleShape {
  readonly weekday: boolean;
  readonly day: boolean;
  readonly after: boolean;
  readonly before: boolean;
  readonly holiday: boolean;
  readonly businessMonth: boolean;
  readonly businessWeek: boolean;
  readonly cycle: boolean;
}

/**
 * Reads which pattern keys an entry has (presence only; values are not examined).
 * @internal
 */
export function ruleShapeOf(entry: Readonly<Record<string, unknown>>): RuleShape {
  return {
    weekday: "weekday" in entry,
    day: "dayOfMonth" in entry,
    after: "dayAfterHoliday" in entry,
    before: "dayBeforeHoliday" in entry,
    holiday: "holiday" in entry,
    businessMonth: "businessDayOfMonth" in entry,
    businessWeek: "businessDayOfWeek" in entry,
    cycle: "cycle" in entry,
  };
}

/**
 * Number of pattern keys of a shape (a valid rule has exactly one).
 * @internal
 */
export const patternCount = (s: RuleShape): number =>
  Number(s.weekday) +
  Number(s.day) +
  Number(s.businessMonth) +
  Number(s.businessWeek) +
  Number(s.after) +
  Number(s.before) +
  Number(s.holiday) +
  Number(s.cycle);

/**
 * The fields of a recurring rule while it is validated. `ok` becomes false when a check reports an error; the
 * checks continue, so that every problem of the entry is reported.
 * @internal
 */
export interface RuleDraft {
  ok: boolean;
  weekday: Weekday | null;
  nth: Set<number> | null;
  interval: number | null;
  anchor: number | null;
  cycle: number | null;
  positions: Set<number> | null;
  days: Set<number> | null;
  businessDays: Set<number> | null;
  weekStart: number | null;
  basis: BasisOfMonth | null;
  calendar: Calendar | null;
  skipWeekdays: Set<number> | null;
  kinds: Set<string> | null;
  keys: Set<string> | null;
  weekdays: Set<number> | null;
  months: Set<number> | null;
}

/**
 * A draft with every field null and `ok` true.
 * @internal
 */
export const emptyRuleDraft = (): RuleDraft => ({
  ok: true,
  weekday: null,
  nth: null,
  interval: null,
  anchor: null,
  cycle: null,
  positions: null,
  days: null,
  businessDays: null,
  weekStart: null,
  basis: null,
  calendar: null,
  skipWeekdays: null,
  kinds: null,
  keys: null,
  weekdays: null,
  months: null,
});

/**
 * Validates a weekday rule: `weekday` (0-6), optional `nth` (1-5 or -1, or an array), and `interval` with
 * `anchor` (given together; interval an integer ≥ 2, not with `nth`; anchor a date on the same weekday).
 * @param c - Receives the errors.
 * @param p - Position of the entry.
 * @param entry - The entry (without undefined values).
 * @param draft - Receives weekday, nth, interval and anchor; `ok` becomes false on an error.
 * @internal
 */
export function checkWeekdayRule(
  c: IssueCollector,
  p: string,
  entry: Readonly<Record<string, unknown>>,
  draft: RuleDraft,
): void {
  const hasInterval = "interval" in entry;
  const hasAnchor = "anchor" in entry;
  if (isWeekday(entry["weekday"])) draft.weekday = entry["weekday"];
  else {
    c.error(
      "invalid-weekday",
      `${p}.weekday`,
      "must be an integer from 0 (Sunday) to 6 (Saturday)",
    );
    draft.ok = false;
  }
  if (entry["nth"] !== undefined) {
    const set = checkSet(
      c,
      `${p}.nth`,
      entry["nth"],
      (v) => NTH_VALUES.includes(v as number),
      "1-5 or -1 (last)",
    );
    if (set) draft.nth = set;
    else draft.ok = false;
  }
  if (hasInterval !== hasAnchor) {
    c.error("invalid-option", p, '"interval" and "anchor" must be specified together');
    draft.ok = false;
  } else if (hasInterval) {
    if ("nth" in entry) {
      c.error("invalid-option", `${p}.interval`, '"interval" cannot be used with "nth"');
      draft.ok = false;
    }
    const i = entry["interval"];
    if (!Number.isInteger(i) || (i as number) < 2) {
      c.error("invalid-option", `${p}.interval`, "must be an integer of 2 or more (weeks)");
      draft.ok = false;
    } else draft.interval = i as number;
    const a = checkDate(c, `${p}.anchor`, entry["anchor"]);
    if (a === undefined) draft.ok = false;
    else if (
      draft.weekday !== null &&
      weekdayOfDate(entry["anchor"] as DateString) !== draft.weekday
    ) {
      c.error(
        "invalid-option",
        `${p}.anchor`,
        `must be on the same weekday as "weekday" (${String(entry["anchor"])} is weekday ${weekdayOfDate(entry["anchor"] as DateString)})`,
      );
      draft.ok = false;
    } else draft.anchor = a;
  }
}

/**
 * Validates a cycle rule: `cycle` (integer ≥ 2), `anchor` (required date), `positions` (non-empty, distinct
 * integers from 1 to cycle, not every day); holidayOverlapPolicy "after-holiday" is an error.
 * @param c - Receives the errors.
 * @param p - Position of the entry.
 * @param entry - The entry (without undefined values).
 * @param draft - Receives cycle, anchor and positions; `ok` becomes false on an error.
 * @internal
 */
export function checkCycleRule(
  c: IssueCollector,
  p: string,
  entry: Readonly<Record<string, unknown>>,
  draft: RuleDraft,
): void {
  const length = entry["cycle"];
  if (!Number.isInteger(length) || (length as number) < 2) {
    c.error("invalid-option", `${p}.cycle`, "must be an integer of 2 or more (days)");
    draft.ok = false;
  } else draft.cycle = length as number;
  if (!("anchor" in entry)) {
    c.error("invalid-option", p, '"anchor" is required with "cycle" (the first day of the cycle)');
    draft.ok = false;
  } else {
    const a = checkDate(c, `${p}.anchor`, entry["anchor"]);
    if (a === undefined) draft.ok = false;
    else draft.anchor = a;
  }
  const raw = entry["positions"];
  if (!Array.isArray(raw) || raw.length === 0) {
    c.error(
      "invalid-option",
      `${p}.positions`,
      "must be a non-empty array of days in the cycle (1 = the anchor day)",
    );
    draft.ok = false;
  } else if (draft.cycle !== null) {
    const n = draft.cycle;
    if (
      !Array.from(raw as unknown[]).every(
        (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= n,
      )
    ) {
      c.error("invalid-option", `${p}.positions`, `must be integers from 1 to ${n} (the cycle)`);
      draft.ok = false;
    } else if (new Set(raw).size !== raw.length) {
      c.error("invalid-option", `${p}.positions`, "must not contain the same day twice");
      draft.ok = false;
    } else if (raw.length === n) {
      c.error(
        "invalid-option",
        `${p}.positions`,
        "must not contain every day of the cycle (the rule would match every day)",
      );
      draft.ok = false;
    } else draft.positions = new Set(raw as number[]);
  }
  if (entry["holidayOverlapPolicy"] === "after-holiday") {
    c.error(
      "invalid-option",
      `${p}.holidayOverlapPolicy`,
      '"after-holiday" cannot be used with "cycle" (shifting a day of the cycle has no meaning; use "under-holiday" or "over-holiday")',
    );
    draft.ok = false;
  }
}

/**
 * Validates an nth-business-day rule: `businessDayOfMonth` (1-31 or -1 to -31) or `businessDayOfWeek` (1-7 or
 * -1 to -7) with the required `weekStart` (0-6); "after-holiday" is an error; `calendar` is an error in a
 * calendar and required (a calendar made by createCalendar) in a schedule.
 * @param c - Receives the errors.
 * @param p - Position of the entry.
 * @param entry - The entry (without undefined values).
 * @param draft - Receives businessDays, weekStart, calendar and basis; `ok` becomes false on an error.
 * @param week - true for `businessDayOfWeek`, false for `businessDayOfMonth`.
 * @param context - "calendar" or "schedule".
 * @internal
 * @see decisions.md #8
 */
export function checkBusinessDayRule(
  c: IssueCollector,
  p: string,
  entry: Readonly<Record<string, unknown>>,
  draft: RuleDraft,
  week: boolean,
  context: "calendar" | "schedule",
): void {
  const key = week ? "businessDayOfWeek" : "businessDayOfMonth";
  const set = week
    ? checkSet(
        c,
        `${p}.businessDayOfWeek`,
        entry["businessDayOfWeek"],
        isBusinessDayOfWeek,
        "1-7 or -1 (last business day) to -7",
      )
    : checkSet(
        c,
        `${p}.businessDayOfMonth`,
        entry["businessDayOfMonth"],
        isBusinessDayOfMonth,
        "1-31 or -1 (last business day) to -31",
      );
  if (set) draft.businessDays = set;
  else draft.ok = false;
  if (week) {
    if (isWeekday(entry["weekStart"])) draft.weekStart = entry["weekStart"];
    else if (!("weekStart" in entry)) {
      // A missing one is a wrong combination (invalid-option); a wrong written value is a wrong weekday
      // (invalid-weekday. decisions.md #8)
      c.error(
        "invalid-option",
        `${p}.weekStart`,
        'is required with "businessDayOfWeek": an integer from 0 (Sunday) to 6 (Saturday) (the first day of the week)',
      );
      draft.ok = false;
    } else {
      c.error(
        "invalid-weekday",
        `${p}.weekStart`,
        "must be an integer from 0 (Sunday) to 6 (Saturday) (the first day of the week)",
      );
      draft.ok = false;
    }
  }
  if (entry["holidayOverlapPolicy"] === "after-holiday") {
    c.error(
      "invalid-option",
      `${p}.holidayOverlapPolicy`,
      `"after-holiday" cannot be used with "${key}" (shifting the nth business day has no meaning; use "under-holiday" or "over-holiday")`,
    );
    draft.ok = false;
  }
  if (context === "calendar") {
    if ("calendar" in entry) {
      c.error(
        "invalid-option",
        `${p}.calendar`,
        '"calendar" cannot be used in a calendar (the counting basis is the calendar\'s own options without recurring rules)',
      );
      draft.ok = false;
    }
  } else if (!isCalendarLike(entry["calendar"])) {
    c.error(
      "invalid-option",
      `${p}.calendar`,
      "must be a calendar made with createCalendar (the basis for counting business days; required in a schedule)",
    );
    draft.ok = false;
  } else {
    const calendar = entry["calendar"];
    draft.calendar = calendar;
    draft.basis = basisFromPredicate((date) => calendar.isBusinessDay(date));
  }
}

/**
 * Validates a holiday-based rule (`holiday`, `dayAfterHoliday` or `dayBeforeHoliday`): the key must be true,
 * holidayOverlapPolicy cannot be written, and `kinds` is a non-empty array of non-empty strings.
 * @param c - Receives the errors.
 * @param p - Position of the entry.
 * @param entry - The entry (without undefined values).
 * @param draft - Receives kinds; `ok` becomes false on an error.
 * @param key - The pattern key of the entry.
 * @internal
 */
export function checkHolidayBasedRule(
  c: IssueCollector,
  p: string,
  entry: Readonly<Record<string, unknown>>,
  draft: RuleDraft,
  key: "dayAfterHoliday" | "dayBeforeHoliday" | "holiday",
): void {
  if (entry[key] !== true) {
    c.error("invalid-option", `${p}.${key}`, "must be true");
    draft.ok = false;
  }
  if ("holidayOverlapPolicy" in entry) {
    c.error(
      "invalid-option",
      `${p}.holidayOverlapPolicy`,
      key === "dayAfterHoliday"
        ? 'cannot be used with "dayAfterHoliday" (the day after a holiday is never a holiday)'
        : key === "dayBeforeHoliday"
          ? 'cannot be used with "dayBeforeHoliday" (the day before a holiday is never a holiday)'
          : 'cannot be used with "holiday" (the rule applies on holidays; it is judged before holidayPolicy)',
    );
    draft.ok = false;
  }
  if (entry["kinds"] !== undefined && !Array.isArray(entry["kinds"])) {
    c.error(
      "invalid-option",
      `${p}.kinds`,
      "must be a non-empty array of holiday kinds (Holiday.kind)",
    );
    draft.ok = false;
  } else if (entry["kinds"] !== undefined) {
    const set = checkSet(
      c,
      `${p}.kinds`,
      entry["kinds"],
      (v) => typeof v === "string" && v.length > 0,
      "a non-empty string (Holiday.kind)",
    );
    if (set) draft.kinds = set as unknown as Set<string>;
    else draft.ok = false;
  }
}

/**
 * Validates the pattern of an entry that has exactly one pattern key, by its shape: weekday, cycle, day of
 * month, nth business day or holiday-based. Without `weekday`, `nth` and `interval` are errors, and `anchor`
 * is an error unless the rule is a cycle.
 * @param c - Receives the errors.
 * @param p - Position of the entry.
 * @param entry - The entry (without undefined values).
 * @param shape - Result of {@link ruleShapeOf} with {@link patternCount} 1.
 * @param draft - Receives the pattern fields; `ok` becomes false on an error.
 * @param context - "calendar" or "schedule".
 * @internal
 */
export function checkRulePattern(
  c: IssueCollector,
  p: string,
  entry: Readonly<Record<string, unknown>>,
  shape: RuleShape,
  draft: RuleDraft,
  context: "calendar" | "schedule",
): void {
  if (shape.weekday) {
    checkWeekdayRule(c, p, entry, draft);
    return;
  }
  for (const key of ["nth", "interval"] as const) {
    if (key in entry) {
      c.error("invalid-option", `${p}.${key}`, `"${key}" can be used only with "weekday"`);
      draft.ok = false;
    }
  }
  if ("anchor" in entry && !shape.cycle) {
    c.error("invalid-option", `${p}.anchor`, '"anchor" can be used only with "weekday" or "cycle"');
    draft.ok = false;
  }
  if (shape.cycle) checkCycleRule(c, p, entry, draft);
  else if (shape.day) {
    const set = checkSet(
      c,
      `${p}.dayOfMonth`,
      entry["dayOfMonth"],
      isDayOfMonth,
      "1-31 or -1 (last day)",
    );
    if (set) draft.days = set;
    else draft.ok = false;
  } else if (shape.businessMonth || shape.businessWeek)
    checkBusinessDayRule(c, p, entry, draft, shape.businessWeek, context);
  else
    checkHolidayBasedRule(
      c,
      p,
      entry,
      draft,
      shape.after ? "dayAfterHoliday" : shape.before ? "dayBeforeHoliday" : "holiday",
    );
}

/**
 * Validates the keys that are allowed only with some patterns, and the filters: `calendar` (nth business day
 * only), `weekStart` (businessDayOfWeek only), `positions` (cycle only), `kinds`, `keys` and `weekdays`
 * (holiday-based rules only), and `months` (any rule; an array of 1-12).
 * @param c - Receives the errors.
 * @param p - Position of the entry.
 * @param entry - The entry (without undefined values).
 * @param shape - Result of {@link ruleShapeOf}.
 * @param draft - Receives keys, weekdays and months; `ok` becomes false on an error.
 * @internal
 */
export function checkRuleFilters(
  c: IssueCollector,
  p: string,
  entry: Readonly<Record<string, unknown>>,
  shape: RuleShape,
  draft: RuleDraft,
): void {
  const holidayBased = shape.holiday || shape.after || shape.before;
  if (!(shape.businessMonth || shape.businessWeek) && "calendar" in entry) {
    c.error(
      "invalid-option",
      `${p}.calendar`,
      '"calendar" can be used only with "businessDayOfMonth" or "businessDayOfWeek"',
    );
    draft.ok = false;
  }
  if (!shape.businessWeek && "weekStart" in entry) {
    c.error(
      "invalid-option",
      `${p}.weekStart`,
      '"weekStart" can be used only with "businessDayOfWeek"',
    );
    draft.ok = false;
  }
  if (!shape.cycle && "positions" in entry) {
    c.error("invalid-option", `${p}.positions`, '"positions" can be used only with "cycle"');
    draft.ok = false;
  }
  if (!holidayBased && "kinds" in entry) {
    c.error(
      "invalid-option",
      `${p}.kinds`,
      '"kinds" can be used only with "holiday", "dayAfterHoliday" or "dayBeforeHoliday"',
    );
    draft.ok = false;
  }
  if ("keys" in entry) {
    if (!holidayBased) {
      c.error(
        "invalid-option",
        `${p}.keys`,
        '"keys" can be used only with "holiday", "dayAfterHoliday" or "dayBeforeHoliday"',
      );
      draft.ok = false;
    } else if (!Array.isArray(entry["keys"])) {
      c.error(
        "invalid-option",
        `${p}.keys`,
        "must be a non-empty array of holiday keys (Holiday.key)",
      );
      draft.ok = false;
    } else {
      const set = checkSet(
        c,
        `${p}.keys`,
        entry["keys"],
        (v) => typeof v === "string" && HOLIDAY_KEY_PATTERN.test(v),
        "a holiday key (Holiday.key: lowercase letters, digits and hyphens)",
      );
      if (set) draft.keys = set as unknown as Set<string>;
      else draft.ok = false;
    }
  }
  if ("weekdays" in entry) {
    if (!holidayBased) {
      c.error(
        "invalid-option",
        `${p}.weekdays`,
        '"weekdays" can be used only with "holiday", "dayAfterHoliday" or "dayBeforeHoliday"',
      );
      draft.ok = false;
    } else if (!Array.isArray(entry["weekdays"])) {
      c.error(
        "invalid-option",
        `${p}.weekdays`,
        "must be a non-empty array of weekdays (0 = Sunday to 6 = Saturday)",
      );
      draft.ok = false;
    } else {
      const set = checkSet(
        c,
        `${p}.weekdays`,
        entry["weekdays"],
        isWeekday,
        "a weekday (0 = Sunday to 6 = Saturday)",
        "invalid-weekday",
      );
      if (set) draft.weekdays = set;
      else draft.ok = false;
    }
  }
  if (entry["months"] !== undefined) {
    if (!Array.isArray(entry["months"])) {
      c.error("invalid-option", `${p}.months`, "must be a non-empty array of months (1-12)");
      draft.ok = false;
    } else {
      const set = checkSet(c, `${p}.months`, entry["months"], isMonth, "a month (1-12)");
      if (set) draft.months = set;
      else draft.ok = false;
    }
  }
}

/**
 * Reads and validates holidayOverlapPolicy.
 * @param c - Receives the errors.
 * @param p - Position of the entry.
 * @param entry - The entry (without undefined values).
 * @param holidayRule - true for a `holiday` rule.
 * @param draft - `ok` becomes false when the value is not one of the three policies.
 * @returns The written value, or the default: "over-holiday" for a `holiday` rule (the matching day is a
 *   holiday, so it is judged at the "over the holiday" stage), otherwise "under-holiday".
 * @internal
 */
export function overlapPolicyOf(
  c: IssueCollector,
  p: string,
  entry: Readonly<Record<string, unknown>>,
  holidayRule: boolean,
  draft: RuleDraft,
): unknown {
  const onHoliday =
    entry["holidayOverlapPolicy"] === undefined
      ? holidayRule
        ? "over-holiday"
        : "under-holiday"
      : entry["holidayOverlapPolicy"];
  if (!ON_HOLIDAY_RULES.includes(onHoliday as HolidayOverlapPolicy)) {
    c.error(
      "invalid-option",
      `${p}.holidayOverlapPolicy`,
      `must be one of ${ON_HOLIDAY_RULES.map((v) => `"${v}"`).join(", ")}`,
    );
    draft.ok = false;
  }
  return onHoliday;
}

/**
 * Validates `skipWeekdays`: allowed with dayAfterHoliday, dayBeforeHoliday, or "after-holiday" on a weekday or
 * dayOfMonth rule; a non-empty array of weekdays, not all seven, not the rule's own weekday.
 * @param c - Receives the errors.
 * @param p - Position of the entry.
 * @param entry - The entry (without undefined values).
 * @param shape - Result of {@link ruleShapeOf}.
 * @param draft - Reads weekday; receives skipWeekdays; `ok` becomes false on an error.
 * @internal
 */
export function checkSkipWeekdays(
  c: IssueCollector,
  p: string,
  entry: Readonly<Record<string, unknown>>,
  shape: RuleShape,
  draft: RuleDraft,
): void {
  if (!("skipWeekdays" in entry)) return;
  const aroundHoliday = shape.after || shape.before;
  if (
    !aroundHoliday &&
    (entry["holidayOverlapPolicy"] !== "after-holiday" || !(shape.weekday || shape.day))
  ) {
    c.error(
      "invalid-option",
      `${p}.skipWeekdays`,
      '"skipWeekdays" can be used only with "dayAfterHoliday", "dayBeforeHoliday", or holidayOverlapPolicy: "after-holiday" on a "weekday" or "dayOfMonth" rule',
    );
    draft.ok = false;
  } else if (!Array.isArray(entry["skipWeekdays"])) {
    c.error(
      "invalid-option",
      `${p}.skipWeekdays`,
      "must be a non-empty array of weekdays (0 = Sunday to 6 = Saturday)",
    );
    draft.ok = false;
  } else {
    const set = checkSet(
      c,
      `${p}.skipWeekdays`,
      entry["skipWeekdays"],
      isWeekday,
      "a weekday (0 = Sunday to 6 = Saturday)",
      "invalid-weekday",
    );
    if (set === undefined) draft.ok = false;
    else if (set.size === 7) {
      c.error(
        "invalid-option",
        `${p}.skipWeekdays`,
        "cannot include every weekday (no day would be left)",
      );
      draft.ok = false;
    } else if (draft.weekday !== null && set.has(draft.weekday)) {
      c.error(
        "invalid-option",
        `${p}.skipWeekdays`,
        `cannot include the rule's own weekday ${draft.weekday} (the rule would be shifted every time)`,
      );
      draft.ok = false;
    } else draft.skipWeekdays = set;
  }
}

/**
 * Validates and compiles one entry of recurring rules. The checks run in a fixed order (the order of the
 * reported problems): renamed and unknown keys, kinds "national", value, name, exactly one pattern key (stops
 * there otherwise), the pattern, the filters, holidayOverlapPolicy, skipWeekdays, the effective period.
 * @param c - Receives the problems.
 * @param p - Position of the entry under its new name.
 * @param written - Position as the user wrote it (old key name).
 * @param rawEntry - The entry.
 * @param valueOf - Extracts the value of the entry.
 * @param keys - Known keys of an entry.
 * @param context - "calendar" or "schedule".
 * @param jp - How the Japanese provider is used.
 * @returns The frozen compiled rule, or undefined when the entry is not an object or a check of the pattern,
 *   filters, policy, skipWeekdays, period or value failed (a wrong `name` alone still returns the rule; the
 *   error is in the collector).
 * @internal
 * @see decisions.md #6, #8, #10
 */
export function compileRecurringRule<Value>(
  c: IssueCollector,
  p: string,
  written: string,
  rawEntry: unknown,
  valueOf: RuleValueOf<Value>,
  keys: readonly string[],
  context: "calendar" | "schedule",
  jp: JpUsage,
): RecurringRuleCompiled<Value> | undefined {
  if (!isObject(rawEntry)) {
    c.error("invalid-option", p, "must be an object");
    return undefined;
  }
  const renamedEntry = renameKeys(c, ["rule"], written, rawEntry);
  checkUnknownKeys(c, p, renamedEntry, keys);
  const entry = withoutUndefined(renamedEntry);
  const nationalOfJp =
    jp !== "none" && reportNational(c, `${written}.kinds`, entry["kinds"], jp === "mixed");
  const got = valueOf(entry, p);
  const name = checkName(c, p, entry["name"]);
  const shape = ruleShapeOf(entry);
  if (patternCount(shape) !== 1) {
    c.error(
      "invalid-option",
      p,
      'must have exactly one of "weekday", "dayOfMonth", "businessDayOfMonth", "businessDayOfWeek", "dayAfterHoliday", "dayBeforeHoliday", "holiday" or "cycle"',
    );
    return undefined;
  }
  const draft = emptyRuleDraft();
  checkRulePattern(c, p, entry, shape, draft, context);
  checkRuleFilters(c, p, entry, shape, draft);
  const onHoliday = overlapPolicyOf(c, p, entry, shape.holiday, draft);
  checkSkipWeekdays(c, p, entry, shape, draft);
  const period = checkPeriod(c, p, entry);
  if (!draft.ok || !period || got === undefined) return undefined;
  return Object.freeze({
    path: p,
    weekday: draft.weekday,
    nth: draft.nth,
    interval: draft.interval,
    anchor: draft.anchor,
    cycle: draft.cycle,
    positions: draft.positions,
    days: draft.days,
    businessDays: draft.businessDays,
    weekStart: draft.weekStart,
    basis: draft.basis,
    calendar: draft.calendar,
    skipWeekdays: draft.skipWeekdays,
    dayAfterHoliday: shape.after,
    dayBeforeHoliday: shape.before,
    holiday: shape.holiday,
    kinds: draft.kinds,
    nationalOfJp,
    keys: draft.keys,
    weekdays: draft.weekdays,
    months: draft.months,
    holidayOverlapPolicy: onHoliday as HolidayOverlapPolicy,
    value: got.value,
    name,
    ...period,
  });
}

/**
 * Validates and compiles recurring rules.
 * @param c - Receives the problems.
 * @param path - Position of the array under its new name.
 * @param entries - undefined or an array of rule objects.
 * @param valueOf - Extracts the value of an entry.
 * @param keys - Known keys of an entry.
 * @param context - "calendar" (a `calendar` basis is not allowed) or "schedule" (nth-business-day rules require
 *   `calendar`).
 * @param writtenPath - Position as the user wrote it (old key name), for deprecation warnings.
 * @param jp - How the Japanese provider is used; decides the handling of kinds "national".
 * @returns One compiled rule per valid entry ({@link compileRecurringRule}), in array order. An entry must have
 *   exactly one of weekday, dayOfMonth, businessDayOfMonth, businessDayOfWeek, dayAfterHoliday,
 *   dayBeforeHoliday, holiday or cycle; the other keys are accepted only with the shapes named in their error
 *   messages. holidayOverlapPolicy defaults to "under-holiday".
 * @internal
 * @see decisions.md #6, #8, #10
 */
export function compileRecurringRules<Value>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: RuleValueOf<Value>,
  keys: readonly string[],
  context: "calendar" | "schedule",
  writtenPath: string = path,
  jp: JpUsage = "none",
): RecurringRuleCompiled<Value>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: RecurringRuleCompiled<Value>[] = [];
  // A hole is validated as an undefined element (forEach skips holes. decisions.md #6)
  Array.from(entries as unknown[]).forEach((rawEntry: unknown, i) => {
    const rule = compileRecurringRule(
      c,
      `${path}[${i}]`,
      `${writtenPath}[${i}]`,
      rawEntry,
      valueOf,
      keys,
      context,
      jp,
    );
    if (rule) rules.push(rule);
  });
  return rules;
}

/**
 * @internal Returns the holiday on a day (used to judge holiday, day-after and day-before rules). What happens
 * outside the providers' supported years is decided by the caller (the judgement follows outOfRangePolicy and
 * passes a function that throws out-of-range for "throw". decisions.md #17)
 */
export type HolidayOf = (date: DateString) => Holiday<string> | undefined;

/** @internal Whether the holiday of the day (as returned by HolidayOf) comes from a provider whose ID is "JP" */
export type FromJp = (date: DateString) => boolean;

/**
 * Whether the shape of a recurring rule matches a date. The effective period is not considered.
 * @param rule - A compiled rule.
 * @param date - "YYYY-MM-DD".
 * @param holidayOf - Holiday lookup; without it, holiday-based rules never match.
 * @param basis - Counting basis used when the rule has none of its own; without either, nth-business-day rules never
 *   match.
 * @param fromJp - Whether the holiday on a date comes from the "JP" provider (for kinds "national").
 * @returns true when the date is in the rule's months and: the nth business day of its month or week (positive or
 *   negative index); a holiday, or the first non-holiday day after or before a run of holidays (and skipWeekdays),
 *   whose nearest holiday passes kinds and keys; a position of the day cycle; the weekday with its nth or interval;
 *   or the day of the month (-1 = last).
 * @throws What `holidayOf` or the basis throws; `out-of-range` when a neighbouring day is outside the years
 *   1000-9999.
 * @internal
 */
export function matchPattern(
  rule: RecurringRuleCompiled<unknown>,
  date: DateString,
  holidayOf?: HolidayOf,
  basis?: BasisOfMonth,
  fromJp?: FromJp,
): boolean {
  const { year, month, day } = parseDate(date);
  if (rule.months && !rule.months.has(month)) return false;
  if (rule.businessDays) {
    // nth business day: counted with the rule's own basis (`calendar` of a schedule) or the caller's basis (the
    // calendar's judgement "with recurring rules removed")
    const b = rule.basis ?? basis;
    if (b === undefined) return false;
    if (rule.weekStart !== null) {
      // nth business day of the week: counts the days that are business days of the basis in the 7 days from
      // the weekday weekStart (a week across two months looks at the basis of both months). Days are counted by
      // day number (a date string is built only to find the month of the basis. 0.32.7)
      const self = dayNumberOf(date);
      const start = self - ((weekdayOfDayNumber(self) - rule.weekStart + 7) % 7);
      const week: number[] = [];
      for (let n = start; n < start + 7; n++) {
        const at = parseDate(dateOfDayNumber(n));
        if (b(at.year, at.month).includes(at.day)) week.push(n);
      }
      const at = week.indexOf(self);
      if (at < 0) return false;
      return rule.businessDays.has(at + 1) || rule.businessDays.has(at - week.length);
    }
    const days = b(year, month);
    const index = days.indexOf(day);
    if (index < 0) return false;
    return rule.businessDays.has(index + 1) || rule.businessDays.has(index - days.length);
  }
  if (rule.holiday || rule.dayAfterHoliday || rule.dayBeforeHoliday) {
    if (holidayOf === undefined) return false;
    if (rule.weekdays && !rule.weekdays.has(weekdayOfDate(date))) return false;
    const selected = (h: Holiday<string>): boolean =>
      (rule.kinds === null ||
        rule.kinds.has(h.kind) ||
        (rule.nationalOfJp && h.kind === "regular" && fromJp?.(h.date) === true)) &&
      (rule.keys === null || (h.key !== undefined && rule.keys.has(h.key)));
    if (rule.holiday) {
      const h = holidayOf(date);
      return h !== undefined && selected(h);
    }
    // The day after a holiday has a holiday on the day before; the day before a holiday has one on the next day
    // (the day itself is not a holiday in either case). With skipWeekdays it is the day after / before a block
    // of consecutive holidays and those weekdays, and the filters apply to the nearest holiday in the block
    const skip = rule.skipWeekdays;
    if (holidayOf(date) !== undefined || skip?.has(weekdayOfDate(date))) return false;
    const step = rule.dayAfterHoliday ? -1 : 1;
    const self = dayNumberOf(date);
    for (let k = 1; k <= MAX_HOLIDAY_RUN; k++) {
      const h = holidayOf(dateOfDayNumber(self + step * k));
      if (h !== undefined) return selected(h);
      if (!skip?.has(weekdayOfDayNumber(self + step * k))) return false;
    }
    return false;
  }
  if (rule.cycle !== null) {
    const offset = (dayNumberOf(date) - rule.anchor!) % rule.cycle;
    return rule.positions!.has(((offset + rule.cycle) % rule.cycle) + 1);
  }
  const dim = lengthOfMonth(year, month);
  if (rule.weekday !== null) {
    if (weekdayOfDate(date) !== rule.weekday) return false;
    if (rule.interval !== null)
      return (dayNumberOf(date) - rule.anchor!) % (7 * rule.interval) === 0;
    if (rule.nth === null) return true;
    return rule.nth.has(Math.ceil(day / 7)) || (rule.nth.has(-1) && day + 7 > dim);
  }
  return rule.days!.has(day) || (rule.days!.has(-1) && day === dim);
}

/**
 * Whether a recurring rule matches a date: inside its effective period and {@link matchPattern}.
 * @internal
 */
export function matchRecurring(
  rule: RecurringRuleCompiled<unknown>,
  date: DateString,
  holidayOf: HolidayOf,
  basis?: BasisOfMonth,
  fromJp?: FromJp,
): boolean {
  return inPeriod(rule, dayNumberOf(date)) && matchPattern(rule, date, holidayOf, basis, fromJp);
}

/**
 * Builds the counting basis for nth-business-day rules that count the options' own business days: a day counts when
 * it is a business day (value true) with all recurring rules removed.
 * @param compiled - Compiled options.
 * @param lookup - Holiday lookup to share.
 * @returns The basis, or undefined when no rule needs it. Unreachable "after-holiday" shifts are ignored (there are
 *   no recurring rules).
 * @internal
 */
export function createBasis<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  lookup: HolidayLookupInternal<Kind>,
): BasisOfMonth | undefined {
  if (!compiled.recurring.some((r) => r.businessDays !== null && r.basis === null))
    return undefined;
  const resolve = createResolver({ ...compiled, recurring: [] }, lookup, ignoreLostShift);
  return basisFromPredicate((date) => resolve(date, false).day.value === true);
}

/**
 * Builds the value extractor for entries that must have `value`. `value: undefined` is a value; a missing key records
 * `invalid-option`.
 * @internal
 * @see decisions.md #6
 */
export function requiredValue<Value>(c: IssueCollector): RuleValueOf<Value> {
  return (entry, path) => {
    if (!("value" in entry)) {
      c.error("invalid-option", path, 'must have "value"');
      return undefined;
    }
    return { value: entry["value"] as Value };
  };
}

/**
 * Validates the shape of a holiday provider.
 * @param c - Receives one `invalid-provider` error.
 * @param path - Position.
 * @param p - Any value.
 * @returns true when `p` has a non-empty string `id`, a valid `timeZone`, `supportedYears` `{ from, to }` of integers
 *   in 1000-9999 with from ≤ to, a string `dataVersion`, an optional integer `confirmedThrough` and a function
 *   `holidaysInYear`.
 * @internal
 */
export function validateProvider(
  c: IssueCollector,
  path: string,
  p: unknown,
): p is HolidayProvider {
  const bad = (message: string): false => {
    c.error("invalid-provider", path, message);
    return false;
  };
  if (!isObject(p)) return bad("must be a holiday provider object");
  if (typeof p["id"] !== "string" || p["id"] === "") return bad('"id" must be a non-empty string');
  if (typeof p["timeZone"] !== "string") return bad('"timeZone" must be a string');
  try {
    validateTimeZone(p["timeZone"]);
  } catch {
    return bad(`"timeZone" is not a valid IANA time zone: ${describeValue(p["timeZone"])}`);
  }
  const years = p["supportedYears"];
  if (
    !isObject(years) ||
    !Number.isInteger(years["from"]) ||
    !Number.isInteger(years["to"]) ||
    (years["from"] as number) < 1000 ||
    (years["to"] as number) > 9999 ||
    (years["from"] as number) > (years["to"] as number)
  ) {
    return bad(
      '"supportedYears" must be { from, to } with integer years in 1000-9999 and from <= to',
    );
  }
  if (typeof p["dataVersion"] !== "string") return bad('"dataVersion" must be a string');
  if (p["confirmedThrough"] !== undefined && !Number.isInteger(p["confirmedThrough"])) {
    return bad('"confirmedThrough" must be an integer year');
  }
  if (typeof p["holidaysInYear"] !== "function") return bad('"holidaysInYear" must be a function');
  return true;
}

/** @internal Validated options for the holiday providers and the time zone */
export interface HolidaySource<Kind extends string> {
  readonly providers: readonly HolidayProvider<Kind>[];
  /**
   * Per provider, the position written in the options (index in the holidayProvider array). The second and later
   * occurrences of the same provider are left out of `providers`, so the diagnostics need this to report the
   * written position (only when built from options; absent in a combined lookup)
   */
  readonly providerIndexes?: readonly number[];
  readonly timeZone: string;
  readonly outOfRangePolicy: "throw" | "ignore";
  readonly unconfirmedHolidayPolicy: "accept" | "throw";
}

/**
 * @internal How the Japanese holiday provider (ID "JP", wrapped ones included) is used (decides the handling of
 * the old name "national" in kinds). "mixed" means options that use it together with providers of other IDs
 */
export type JpUsage = "none" | "only" | "mixed";

/**
 * Records a `deprecated-option` warning for every "national" in `kinds` (renamed to "regular" for the Japanese
 * provider in 0.30.0). The value is not rewritten.
 * @param c - Receives the warnings.
 * @param path - Position of `kinds`.
 * @param kinds - The value as written.
 * @param mixed - true when other providers are used with the Japanese one (the warning is marked for a longer
 *   message).
 * @returns Whether "national" was found.
 * @internal
 * @see decisions.md #10
 */
export function reportNational(
  c: IssueCollector,
  path: string,
  kinds: unknown,
  mixed: boolean,
): boolean {
  if (!Array.isArray(kinds)) return false;
  const { from, to } = RENAMED_VALUES.find((r) => r.key === "kinds")!;
  let found = false;
  kinds.forEach((v, i) => {
    if (v !== from) return;
    found = true;
    c.issues.push({
      severity: "warning",
      code: "deprecated-option",
      path: `${path}[${i}]`,
      message: `"${from}" was renamed to "${to}" in 0.30.0`,
      ...(mixed ? { nationalInUnion: true } : {}),
    });
  });
  return found;
}

/**
 * How the provider with ID "JP" is used: "none", "only" (every provider is "JP") or "mixed".
 * @internal
 */
export function jpUsage(source: HolidaySource<string>): JpUsage {
  const jp = source.providers.filter((p) => p.id === "JP").length;
  return jp === 0 ? "none" : jp === source.providers.length ? "only" : "mixed";
}

/**
 * Validates the provider and time zone options.
 * @param c - Receives the problems.
 * @param options - Options with renamed keys already read and undefined properties removed.
 * @returns Providers (a provider object given twice is kept once; `providerIndexes` holds the positions as written),
 *   the time zone (the `timeZone` option; otherwise the providers' common zone, "UTC" without providers; providers in
 *   different zones are a `time-zone-conflict`), outOfRangePolicy (default "throw") and unconfirmedHolidayPolicy
 *   (default "accept"). Invalid values fall back to the defaults after recording an error.
 * @internal
 * @see decisions.md #6, #24
 */
export function compileHolidaySource<Kind extends string>(
  c: IssueCollector,
  options: Record<string, unknown>,
): HolidaySource<Kind> {
  const raw = options["holidayProvider"];
  const list: unknown[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const providers: HolidayProvider<Kind>[] = [];
  const providerIndexes: number[] = [];
  Array.from(list).forEach((p, i) => {
    const path = Array.isArray(raw) ? `holidayProvider[${i}]` : "holidayProvider";
    // The same provider object is counted once (decisions.md #24)
    if (validateProvider(c, path, p) && !providers.includes(p as HolidayProvider<Kind>)) {
      providers.push(p as HolidayProvider<Kind>);
      providerIndexes.push(i);
    }
  });

  let timeZone = "UTC";
  if (options["timeZone"] !== undefined) {
    try {
      timeZone = validateTimeZone(options["timeZone"] as string);
    } catch {
      c.error(
        "invalid-time-zone",
        "timeZone",
        `Invalid time zone: ${describeValue(options["timeZone"])}`,
      );
    }
  } else {
    const zones = distinctTimeZones(providers.map((p) => validateTimeZone(p.timeZone)));
    if (zones.length > 1) {
      c.error(
        "time-zone-conflict",
        "timeZone",
        `Holiday providers use different time zones (${zones.join(", ")}); specify timeZone`,
      );
    }
    timeZone = zones[0] ?? "UTC";
  }

  // null is a wrong value, not omission (decisions.md #6)
  const outOfRangePolicy =
    options["outOfRangePolicy"] === undefined ? "throw" : options["outOfRangePolicy"];
  if (outOfRangePolicy !== "throw" && outOfRangePolicy !== "ignore") {
    c.error("invalid-option", "outOfRangePolicy", 'must be "throw" or "ignore"');
  }
  const unconfirmed =
    options["unconfirmedHolidayPolicy"] === undefined
      ? "accept"
      : options["unconfirmedHolidayPolicy"];
  if (unconfirmed !== "accept" && unconfirmed !== "throw") {
    c.error("invalid-option", "unconfirmedHolidayPolicy", 'must be "accept" or "throw"');
  }
  return {
    providers: Object.freeze(providers),
    providerIndexes: Object.freeze(providerIndexes),
    timeZone,
    outOfRangePolicy: outOfRangePolicy === "ignore" ? "ignore" : "throw",
    unconfirmedHolidayPolicy: unconfirmed === "throw" ? "throw" : "accept",
  };
}

// ------------------------------------------------------------
// Looking up holidays
// ------------------------------------------------------------

/**
 * Creates the `invalid-provider-data` RangeError for a provider and a year.
 * @internal
 */
export function providerDataError(
  provider: HolidayProvider,
  year: number,
  message: string,
): RangeError {
  return rangeError(
    "invalid-provider-data" satisfies KnownErrorCode,
    `Holiday provider ${provider.id} returned invalid data for ${year}: ${message}`,
  );
}

/**
 * Calls a provider for a year and validates what it returns.
 * @param provider - The provider.
 * @param year - A supported year.
 * @returns New frozen Holiday objects with only the contract's properties (date, name, nameEn, kind, confirmed, and
 *   optional names, key).
 * @throws RangeError `invalid-provider-data` when the result is not an array, or an item is not an object, has a date
 *   outside the year, repeats a date, or has an invalid property.
 * @internal
 */
export function loadProviderYear<Kind extends string>(
  provider: HolidayProvider<Kind>,
  year: number,
): Holiday<Kind>[] {
  const list: unknown = provider.holidaysInYear(year);
  if (!Array.isArray(list))
    throw providerDataError(provider, year, "holidaysInYear must return an array");
  const seen = new Set<string>();
  // A hole in an array is checked as one entry too (map skips holes)
  return Array.from(list as unknown[], (h: unknown, i) => {
    if (!isObject(h)) throw providerDataError(provider, year, `item ${i} is not an object`);
    const { date, name, nameEn, kind, confirmed } = h;
    if (!isValidDate(date) || parseDate(date).year !== year) {
      throw providerDataError(
        provider,
        year,
        `item ${i} has an invalid date ${describeValue(date)}`,
      );
    }
    if (seen.has(date)) throw providerDataError(provider, year, `duplicate date ${date}`);
    seen.add(date);
    if (typeof name !== "string" || typeof nameEn !== "string" || typeof kind !== "string") {
      throw providerDataError(
        provider,
        year,
        `item ${i} (${date}) must have string name, nameEn and kind`,
      );
    }
    if (typeof confirmed !== "boolean") {
      throw providerDataError(provider, year, `item ${i} (${date}) must have boolean confirmed`);
    }
    const holiday: { -readonly [K in keyof Holiday<Kind>]: Holiday<Kind>[K] } = {
      date,
      name,
      nameEn,
      kind: kind as Kind,
      confirmed,
    };
    if (h["names"] !== undefined) {
      const problem = checkNames(h["names"]);
      if (problem) throw providerDataError(provider, year, `item ${i} (${date}) names: ${problem}`);
      holiday.names = Object.freeze(Object.fromEntries(Object.entries(h["names"] as object)));
    }
    if (h["key"] !== undefined) {
      if (typeof h["key"] !== "string" || !HOLIDAY_KEY_PATTERN.test(h["key"])) {
        throw providerDataError(
          provider,
          year,
          `item ${i} (${date}) key must match ${String(HOLIDAY_KEY_PATTERN)}: ${describeValue(h["key"])}`,
        );
      }
      holiday.key = h["key"];
    }
    return Object.freeze(holiday);
  });
}

/**
 * Loads the holidays of a year from every provider.
 * @param providers - Providers in the written order.
 * @param outOfRangePolicy - "throw" or "ignore".
 * @param year - The year.
 * @returns `map`: holidays by date (on a shared date the provider passed first wins); `jpDates`: the dates whose
 *   remaining holiday comes from a provider whose ID is "JP".
 * @throws RangeError `out-of-range` when the year is outside a provider's supported years and the policy is
 *   "throw" (with "ignore" that provider is skipped); `invalid-provider-data`.
 * @internal
 */
export function mergeProviderYear<Kind extends string>(
  providers: readonly HolidayProvider<Kind>[],
  outOfRangePolicy: "throw" | "ignore",
  year: number,
): { map: Map<DateString, Holiday<Kind>>; jpDates: Set<DateString> } {
  const map = new Map<DateString, Holiday<Kind>>();
  const jpDates = new Set<DateString>();
  for (const provider of providers) {
    const { from, to } = provider.supportedYears;
    if (year < from || year > to) {
      if (outOfRangePolicy === "ignore") continue;
      throw rangeError(
        "out-of-range",
        `Holidays for ${provider.id} are supported for ${from}-${to}; requested ${year}`,
      );
    }
    for (const h of loadProviderYear(provider, year)) {
      // When several providers have a holiday on the same day, the provider passed first takes priority
      if (map.has(h.date)) continue;
      map.set(h.date, h);
      if (provider.id === "JP") jpDates.add(h.date);
    }
  }
  return { map, jpDates };
}

/**
 * Creates the `unconfirmed-holiday` RangeError for an unconfirmed holiday used in a judgement. The message names
 * the provider whose prediction it is and, when the provider has one, its confirmedThrough (which tells the user
 * when to recalculate).
 * @internal
 */
export function unconfirmedHolidayError<Kind extends string>(
  providers: readonly HolidayProvider<Kind>[],
  h: Holiday<Kind>,
): RangeError {
  const date = h.date;
  const year = parseDate(date).year;
  const provider = providers.find(
    (p) =>
      year >= p.supportedYears.from &&
      year <= p.supportedYears.to &&
      loadProviderYear(p, year).some((x) => x.date === date && !x.confirmed),
  );
  const through =
    provider?.confirmedThrough === undefined
      ? ""
      : ` (${provider.id} is confirmed through ${provider.confirmedThrough})`;
  return rangeError(
    "unconfirmed-holiday",
    `${date} ${h.name} is not yet confirmed${through}; this evaluation looked up a predicted holiday`,
  );
}

/**
 * Creates the holiday lookup and time zone conversion shared by schedules and calendars.
 * @param source - Validated providers, time zone and policies.
 * @returns The HolidayLookup members, plus `holidayOfDate(date, allowUnconfirmed)` (the internal lookup by date
 *   string) and `fromJp(date)`. Provider data is loaded and validated once per year and cached.
 * @internal
 */
export function createHolidayLookup<Kind extends string>(
  source: HolidaySource<Kind>,
): HolidayLookup<Kind> & {
  /**
   * With allowUnconfirmed, an unconfirmed holiday does not throw even with unconfirmedHolidayPolicy: "throw" (a
   * judgement whose result does not depend on holidays)
   */
  holidayOfDate(date: DateString, allowUnconfirmed?: boolean): Holiday<Kind> | undefined;
  fromJp: FromJp;
} {
  const { providers, timeZone, outOfRangePolicy, unconfirmedHolidayPolicy } = source;
  const yearCache = new Map<number, Map<DateString, Holiday<Kind>>>();
  /**
   * Per year, the dates whose remaining holiday comes from a provider whose ID is "JP" (when several providers
   * have a holiday on the same day, the earlier provider's holiday remains)
   */
  const jpCache = new Map<number, Set<DateString>>();

  /**
   * Holidays of a year by date, loaded from every provider on first use. On a shared date the earlier provider wins.
   * @throws RangeError `out-of-range` when the year is outside a provider's supported years and outOfRangePolicy is
   *   "throw" (with "ignore" that provider is skipped); `invalid-provider-data`.
   */
  function holidayMap(year: number): Map<DateString, Holiday<Kind>> {
    let map = yearCache.get(year);
    if (!map) {
      const merged = mergeProviderYear(providers, outOfRangePolicy, year);
      map = merged.map;
      yearCache.set(year, map);
      jpCache.set(year, merged.jpDates);
    }
    return map;
  }

  /**
   * The holiday on a date string.
   * @param date - "YYYY-MM-DD".
   * @param allowUnconfirmed - true to return an unconfirmed holiday instead of throwing.
   * @returns The holiday or undefined; always undefined without providers.
   * @throws RangeError `unconfirmed-holiday` (policy "throw", unless allowed); the errors of {@link holidayMap}.
   */
  function holidayOfDate(date: DateString, allowUnconfirmed = false): Holiday<Kind> | undefined {
    if (providers.length === 0) return undefined;
    const h = holidayMap(parseDate(date).year).get(date);
    // Stop when the holiday used in the judgement is unconfirmed (holidaysInYear and holidaysBetween do not take
    // this path, so they do not throw)
    if (
      h !== undefined &&
      !allowUnconfirmed &&
      unconfirmedHolidayPolicy === "throw" &&
      !h.confirmed
    )
      throw unconfirmedHolidayError(providers, h);
    return h;
  }

  /**
   * Converts a date input to the calendar date in the lookup's time zone.
   */
  const dateOf = (input: DateInput): DateString => toCivil(input, timeZone).date;

  /**
   * Implements {@link HolidayLookup.holidaysInYear}.
   */
  function holidaysInYear(year: number): readonly Holiday<Kind>[] {
    if (!Number.isInteger(year))
      throw rangeError("invalid-argument", `Invalid year: ${describeValue(year)}`);
    // Whatever the providers and outOfRangePolicy, a year that does not exist as a calendar date is out-of-range
    // (decisions.md #1)
    if (year < 1000 || year > 9999)
      throw rangeError("out-of-range", `Year out of range (1000-9999): ${year}`);
    return Object.freeze(
      [...holidayMap(year).values()].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
      ),
    );
  }

  return {
    timeZone,
    providers,
    outOfRangePolicy,
    unconfirmedHolidayPolicy,
    outOfRange: outOfRangePolicy,
    unconfirmedHolidays: unconfirmedHolidayPolicy,
    holidayOfDate,
    fromJp: (date) => jpCache.get(parseDate(date).year)?.has(date) === true,
    dateOf,
    civilOf: ((input: DateInput) =>
      toDateTimeParts(input, timeZone)) as HolidayLookup<Kind>["civilOf"],
    instantOf: (date, time) => toInstant(date, time, timeZone),
    today: (now = new Date()) => {
      // A number (Date.now(), ...) or a string is not silently accepted. A Date from another realm is accepted
      // (isDate in input.ts)
      if (!isDate(now)) {
        throw rangeError("invalid-argument", `today expects a Date: ${describeValue(now)}`);
      }
      return instantToCivil(Date.prototype.getTime.call(now), timeZone).date;
    },
    isHoliday: (input) => holidayOfDate(dateOf(input)) !== undefined,
    holidayOn: (input) => holidayOfDate(dateOf(input)),
    getHoliday: (input) => holidayOfDate(dateOf(input)),
    holidaysInYear,
    holidaysBetween(from, to) {
      const a = dateOf(from);
      const b = dateOf(to);
      if (a > b) throw rangeError("invalid-range", `"from" must not be after "to" (${a} > ${b})`);
      const result: Holiday<Kind>[] = [];
      for (let y = parseDate(a).year; y <= parseDate(b).year; y++) {
        for (const h of holidaysInYear(y)) if (h.date >= a && h.date <= b) result.push(h);
      }
      return Object.freeze(result);
    },
  };
}

// ------------------------------------------------------------
// Building a schedule
// ------------------------------------------------------------

/** @internal Validated rules of a schedule */
export interface CompiledSchedule<Value, Kind extends string> {
  readonly source: HolidaySource<Kind>;
  readonly weekly: readonly Value[];
  readonly holiday: ScheduleHolidayPolicy<Value>;
  readonly annual: readonly AnnualRule<Value>[];
  readonly dates: readonly DateRule<Value>[];
  readonly recurring: readonly RecurringRuleCompiled<Value>[];
}

/** @internal Keys of the options of a schedule */
export const SCHEDULE_OPTION_KEYS = [
  "holidayProvider",
  "timeZone",
  "outOfRangePolicy",
  "unconfirmedHolidayPolicy",
  "weekdayValues",
  "holidayPolicy",
  "annualDates",
  "dates",
  "recurringRules",
];
/** Properties that tell apart the two shapes of specific dates and annual month-days ({ date } and { from, to }) */
const DATE_SHAPE_KEYS = ["date", "from", "to"];

/** @internal Keys of an effective period */
export const PERIOD_KEYS = ["effectiveFrom", "effectiveTo"];
/** @internal Keys of a recurring rule */
export const RECURRING_RULE_KEYS = [
  "weekday",
  "nth",
  "interval",
  "anchor",
  "dayOfMonth",
  "dayAfterHoliday",
  "dayBeforeHoliday",
  "holiday",
  "kinds",
  "keys",
  "weekdays",
  "months",
  "businessDayOfMonth",
  "businessDayOfWeek",
  "weekStart",
  "calendar",
  "skipWeekdays",
  "cycle",
  "positions",
  "name",
  "holidayOverlapPolicy",
  ...PERIOD_KEYS,
];

/**
 * Validates schedule options and compiles them.
 * @param c - Receives every problem found.
 * @param options - The options as given; any value.
 * @returns The compiled schedule; undefined when `options` is not an options object. A result is returned even when
 *   errors were recorded. `weekdayValues` must have 7 entries; holidayPolicy defaults to "ignore"; the `calendar` of
 *   an nth-business-day rule must have the schedule's time zone (`time-zone-conflict`).
 * @internal
 * @see decisions.md #6, #8
 */
export function compileScheduleOptions<Value, Kind extends string>(
  c: IssueCollector,
  options: unknown,
): CompiledSchedule<Value, Kind> | undefined {
  if (!isOptionsObject(options)) {
    c.error("invalid-option", "", "options must be an object");
    return undefined;
  }
  const written = options;
  const renamed = renameKeys(c, ["source", "schedule"], "", written);
  checkUnknownKeys(c, "", renamed, SCHEDULE_OPTION_KEYS);
  const o = withoutUndefined(renamed);
  const source = compileHolidaySource<Kind>(c, o);

  const weeklyRaw = o["weekdayValues"];
  let weekly: readonly Value[] = [];
  if (!Array.isArray(weeklyRaw) || weeklyRaw.length !== 7) {
    c.error(
      "invalid-option",
      "weekdayValues",
      "must have 7 values ([Sunday, Monday, ..., Saturday])",
    );
  } else {
    weekly = Object.freeze([...(weeklyRaw as Value[])]);
  }

  let holiday: ScheduleHolidayPolicy<Value> = "ignore";
  const holidayRaw = renameValue(
    c,
    "schedule",
    "holidayPolicy",
    writtenKey(["source", "schedule"], written, "holidayPolicy"),
    o["holidayPolicy"],
  );
  // An unknown key inside the object (a typo of sameAs, ...) is reported by the diagnostics like other options
  // (decisions.md #8)
  if (isObject(holidayRaw)) checkUnknownKeys(c, "holidayPolicy", holidayRaw, ["sameAs", "value"]);
  // An explicit undefined for sameAs equals omission (decisions.md #6). For `value`, undefined is a value too,
  // so the presence of the key is examined
  const hasSameAs = isObject(holidayRaw) && holidayRaw["sameAs"] !== undefined;
  const hasValue = isObject(holidayRaw) && "value" in holidayRaw;
  if (holidayRaw === undefined || holidayRaw === "ignore") {
    holiday = "ignore";
  } else if (hasSameAs && hasValue) {
    // Options with both throw: either choice could misread the intent (decisions.md #8)
    c.error("invalid-option", "holidayPolicy", 'cannot have both "sameAs" and "value"');
  } else if (hasSameAs) {
    const sameAs = (holidayRaw as Record<string, unknown>)["sameAs"];
    if (isWeekday(sameAs)) holiday = Object.freeze({ sameAs });
    else
      c.error(
        "invalid-weekday",
        "holidayPolicy.sameAs",
        "must be an integer from 0 (Sunday) to 6 (Saturday)",
      );
  } else if (hasValue) {
    holiday = Object.freeze({ value: (holidayRaw as Record<string, unknown>)["value"] as Value });
  } else {
    c.error(
      "invalid-option",
      "holidayPolicy",
      'must be "ignore", { sameAs: weekday } or { value }',
    );
  }

  const annual = compileAnnualRules<Value>(
    c,
    "annualDates",
    o["annualDates"],
    requiredValue<Value>(c),
    false,
    true,
  );
  const dates = compileDateRules<Value>(
    c,
    "dates",
    o["dates"],
    requiredValue<Value>(c),
    false,
    true,
  );
  const recurring = compileRecurringRules<Value>(
    c,
    "recurringRules",
    o["recurringRules"],
    requiredValue<Value>(c),
    [...RECURRING_RULE_KEYS, "value"],
    "schedule",
    writtenKey(["source", "schedule"], written, "recurringRules"),
    jpUsage(source),
  );
  // The basis calendar of an nth-business-day rule must have the schedule's time zone (for the same reason as
  // combining: the calendar date of an instant would differ). Options whose time zone could not be decided (a
  // wrong timeZone, conflicting providers) are not compared (a conflict with a provisional value is not reported)
  const zoneKnown = !c.issues.some((i) => i.severity === "error" && i.path === "timeZone");
  for (const rule of recurring) {
    if (rule.businessDays === null || !zoneKnown) continue;
    const entry = (o["recurringRules"] as Record<string, unknown>[])[
      Number(/\[(\d+)\]$/.exec(rule.path)![1])
    ]!;
    const tz = (entry["calendar"] as Calendar).timeZone;
    if (!sameTimeZone(tz, source.timeZone)) {
      c.error(
        "time-zone-conflict",
        `${rule.path}.calendar`,
        `the calendar's time zone ${tz} differs from the schedule's ${source.timeZone}`,
      );
    }
  }
  return { source, weekly, holiday, annual, dates, recurring };
}

/**
 * @internal Limit of the days searched back for the original day of a move and of the days examined in the
 * blocks of day-after / day-before rules (the length of a run of holidays and skipped weekdays; even Japan's
 * long holiday of 2019 was 10 days). The `expired` diagnostic also uses it as the farthest day a move of an
 * "after-holiday" rule can reach
 */
export const MAX_HOLIDAY_RUN = 31;
/**
 * Limit of the days searched back to detect an original day that was out of reach (a year and a day; a longer
 * run is treated as one that cannot be checked)
 */
const MAX_HOLIDAY_RUN_SCAN = 367;
const MIN_DAY_NUMBER = toDayNumber("1000-01-01");

/**
 * @internal What to do when the day of an "after-holiday" rule cannot be moved to `date`, the day after a run of
 * holidays (decisions.md #24). `origin` is the original day that was out of reach; undefined when the run lasted
 * more than MAX_HOLIDAY_RUN_SCAN days and the original day could not be checked. When the handler returns, the
 * judgement continues as "not moved"
 */
export type LostShiftHandler<Value> = (
  rule: RecurringRuleCompiled<Value>,
  date: DateString,
  origin: DateString | undefined,
) => void;

/**
 * Message for an "after-holiday" day that cannot be moved to `date`.
 * @param date - The first day after the run of holidays.
 * @param origin - The day that could not be moved, or undefined when the run is longer than 367 days and the day
 *   cannot be determined.
 * @internal
 */
export const lostShiftMessage = (date: DateString, origin: DateString | undefined): string =>
  (origin === undefined
    ? `no day can be moved to ${date}: the run of holidays before it is longer than ${MAX_HOLIDAY_RUN_SCAN} days, so the day to move cannot be determined`
    : `the day ${origin} cannot be moved to ${date}: the run of holidays between them is longer than ${MAX_HOLIDAY_RUN} days`) +
  " (write a long closure with closedDates or closedAnnualDates, not as holidays)";

/**
 * Lost-shift handler of normal judgements: throws RangeError `holiday-run-too-long`.
 * @internal
 */
export const throwLostShift: LostShiftHandler<unknown> = (rule, date, origin) => {
  throw rangeError("holiday-run-too-long", `${rule.path}: ${lostShiftMessage(date, origin)}`);
};

/**
 * Lost-shift handler that does nothing (the judgement continues as "not shifted").
 * @internal
 * @see decisions.md #17
 */
export const ignoreLostShift: LostShiftHandler<unknown> = () => {};

/**
 * Whether the shape of an annual rule matches a month-day "MM-DD" (a range with `from` after `to` wraps over the year
 * end). The effective period is not considered.
 * @internal
 */
export function matchMonthDay(rule: AnnualRule<unknown>, monthDay: string): boolean {
  return rule.from <= rule.to
    ? monthDay >= rule.from && monthDay <= rule.to
    : monthDay >= rule.from || monthDay <= rule.to;
}

/**
 * Whether an annual rule matches a date: inside its effective period and {@link matchMonthDay}.
 * @internal
 */
export function matchAnnual(rule: AnnualRule<unknown>, date: DateString): boolean {
  return inPeriod(rule, dayNumberOf(date)) && matchMonthDay(rule, date.slice(5));
}

/** @internal The rule that decided the value (null when a holiday or a weekday decided it) */
export type DecidingRule<Value> =
  | DateRule<Value>
  | AnnualRule<Value>
  | RecurringRuleCompiled<Value>;

/** @internal The result of one day and the rule that decided the value */
export interface Resolution<Value, Kind extends string> {
  readonly day: ScheduleDayInfo<Value, Kind>;
  readonly rule: DecidingRule<Value> | null;
}

type HolidayLookupInternal<Kind extends string> = ReturnType<typeof createHolidayLookup<Kind>>;

/**
 * Whether a rule is holiday-based: `holiday`, `dayAfterHoliday` or `dayBeforeHoliday`.
 * @internal
 */
export const isHolidayBasedRule = (rule: {
  readonly holiday?: boolean;
  readonly dayAfterHoliday?: boolean;
  readonly dayBeforeHoliday?: boolean;
}): boolean =>
  rule.holiday === true || rule.dayAfterHoliday === true || rule.dayBeforeHoliday === true;

/**
 * Whether the results cannot depend on holidays: the holiday policy is "ignore" and no recurring rule is
 * holiday-based, "after-holiday" or "over-holiday".
 * @param compiled - `holiday` and `recurring` of compiled options.
 * @returns true in that case: holiday and non-holiday days are then judged alike.
 * @remarks Used by the judgement (an unconfirmed holiday then does not throw for value-only results) and by the
 *   diagnostics.
 * @internal
 */
export function resultIgnoresHolidays(compiled: {
  readonly holiday: unknown;
  readonly recurring: readonly {
    readonly holiday?: boolean;
    readonly dayAfterHoliday?: boolean;
    readonly dayBeforeHoliday?: boolean;
    readonly holidayOverlapPolicy?: string;
  }[];
}): boolean {
  return (
    compiled.holiday === "ignore" &&
    !compiled.recurring.some(
      (r) =>
        isHolidayBasedRule(r) ||
        r.holidayOverlapPolicy === "after-holiday" ||
        r.holidayOverlapPolicy === "over-holiday",
    )
  );
}

/**
 * Builds the lookup of the specific date that covers a day.
 * @param dates - Specific-date rules in the written order.
 * @returns (day number) => the first rule in the written order whose period contains the day, or undefined.
 *   When no two dates overlap, the lookup is a binary search over the dates sorted by start (same result): at
 *   once when they are written in order, otherwise after enough sequential lookups to pay for the sort.
 * @internal
 * @see decisions.md #16
 */
export function createDateRuleFinder<Value>(
  dates: readonly DateRule<Value>[],
): (n: number) => DateRule<Value> | undefined {
  // When no two specific dates overlap, they are sorted by start and looked up by binary search (not every date
  // is examined every day; without overlap only one date contains a day, so the priority of the written order
  // does not matter. With overlap they are examined in the written order. decisions.md #16. 0.32.7)
  let sorted: readonly DateRule<Value>[] | null | undefined;
  let lookups = 0;
  return (n) => {
    if (sorted === undefined) {
      const count = dates.length;
      if (lookups++ === 0) {
        // The first judgement checks whether they are written in order of start with no two overlapping; if so
        // they are searched as they are (no copy, no sort). The check costs about one sequential lookup
        let ordered = 1;
        while (ordered < count && dates[ordered]!.from > dates[ordered - 1]!.to) ordered++;
        if (ordered >= count) sorted = dates;
      } else if (lookups > 2 * Math.log2(count + 1)) {
        // Sorting happens only after the number of sequential lookups exceeds twice the base-2 logarithm of
        // (number of dates + 1). Measured, sorting costs about that many sequential lookups, so it happens when
        // the cost of sequential lookups has caught up with it (a use that creates and judges a few times never
        // sorts, and the cost of sorting does not grow against the number of judgements; there is no threshold
        // on the number of dates).
        // The start day and the index become one number ((start day − day number of 1000-01-01) × number of
        // dates + index), sorted as an array of numbers (sorting with a comparison function is costly when the
        // written order is scattered). Start days are on or after 1000-01-01, so the numbers are non-negative
        // integers below 2^53 for up to 2.7 billion dates, and the remainder gives the index back correctly.
        // Dates with the same start day sort by index (they overlap, so the sorted result is not used). Each
        // date taken out is checked to start after the end of the one before; when the check fails the dates are
        // examined in the written order. A sequence that passes contains no date twice (each start is after the
        // previous date), so it is all dates in a non-overlapping order, and a wrong sort (a rounded number)
        // would not change a result (only slow it down)
        const keys = new Float64Array(count);
        for (let i = 0; i < count; i++) keys[i] = (dates[i]!.from - MIN_DAY_NUMBER) * count + i;
        keys.sort();
        const s: DateRule<Value>[] = [];
        for (let i = 0; i < count; i++) {
          const r = dates[keys[i]! % count]!;
          if (i > 0 && r.from <= s[i - 1]!.to) break;
          s.push(r);
        }
        sorted = s.length === count ? s : null;
      }
    }
    if (!sorted) return dates.find((r) => n >= r.from && n <= r.to);
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]!.from <= n) lo = mid + 1;
      else hi = mid;
    }
    // An index out of range (-1) is not read (reading outside the array switches V8 to a slow path)
    const r = lo > 0 ? sorted[lo - 1]! : undefined;
    return r !== undefined && n <= r.to ? r : undefined;
  };
}

/**
 * The day an "after-holiday" rule was moved from, when `date` (not a holiday) is the first day after a run of
 * holidays and skipWeekdays.
 * @param rule - An "after-holiday" rule.
 * @param date - The day being judged.
 * @param holidayOf - The holiday on a day; a neighbouring day throws like the lookup (out-of-range with "throw").
 * @param fromJp - Whether the holiday of a day comes from a provider whose ID is "JP".
 * @param onLostShift - Called when the original day is out of reach.
 * @returns The original date when the rule matches a day of the run within MAX_HOLIDAY_RUN (31) days before
 *   `date`; otherwise undefined. When the run is longer, `onLostShift` is called if a matching day lies further
 *   back (or cannot be determined within 367 days).
 * @internal
 * @see decisions.md #24
 */
export function shiftedOriginOf<Value, Kind extends string>(
  rule: RecurringRuleCompiled<Value>,
  date: DateString,
  holidayOf: (date: DateString) => Holiday<Kind> | undefined,
  fromJp: FromJp,
  onLostShift: LostShiftHandler<Value>,
): DateString | undefined {
  // Days are walked back by day number (a date string is built once per day. 0.32.7)
  const self = dayNumberOf(date);
  for (let k = 1; k <= MAX_HOLIDAY_RUN; k++) {
    const prev = dateOfDayNumber(self - k);
    // Skipped days are holidays and the weekdays of skipWeekdays. Reaching any other day means there is no
    // original day
    if (holidayOf(prev) === undefined && !rule.skipWeekdays?.has(weekdayOfDayNumber(self - k)))
      return undefined;
    if (matchRecurring(rule, prev, holidayOf, undefined, fromJp)) return prev;
  }
  // Holidays (and skipped weekdays) lasted up to the limit. The move is out of reach, but so that it is not
  // silently lost the search goes back to the start of the run, for detection only, and reports when an
  // original day out of reach really exists (decisions.md #24). It stops at the end of the calendar range
  const first = self - MAX_HOLIDAY_RUN_SCAN;
  for (let n = self - MAX_HOLIDAY_RUN - 1; n >= MIN_DAY_NUMBER; n--) {
    // If the run has not ended by here, it cannot be confirmed that nothing was lost
    if (n < first) {
      onLostShift(rule, date, undefined);
      return undefined;
    }
    const prev = dateOfDayNumber(n);
    if (holidayOf(prev) === undefined && !rule.skipWeekdays?.has(weekdayOfDayNumber(n)))
      return undefined;
    if (matchRecurring(rule, prev, holidayOf, undefined, fromJp)) {
      onLostShift(rule, date, prev);
      return undefined;
    }
  }
  return undefined;
}

/**
 * Builds the judgement of one day from compiled options.
 * @param compiled - Compiled options.
 * @param lookup - Holiday lookup (shared between resolvers by the diagnostics).
 * @param onLostShift - Called when an "after-holiday" day cannot be moved; throwing aborts the judgement.
 * @returns resolve(date, withHoliday = true) => `{ day, rule }`: the frozen day info and the deciding rule (null for
 *   holiday and weekday reasons). Order: 1 specific dates (array order), 2 annual dates, 3 on a holiday
 *   "over-holiday" rules, 4 the holiday policy unless "ignore", then "under-holiday" rules, 5 on other days recurring
 *   rules in array order including days shifted by "after-holiday", 6 the weekday value. With `withHoliday` false and
 *   results that do not depend on holidays, an unconfirmed holiday does not throw.
 * @throws What the lookup throws (`out-of-range`, `unconfirmed-holiday`, `invalid-provider-data`), also for
 *   neighbouring days the rules look at; `out-of-range` when such a day is outside the years 1000-9999; what
 *   `onLostShift` throws.
 * @internal
 * @see decisions.md #11, #16, #17, #24
 */
export function createResolver<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  lookup: HolidayLookupInternal<Kind>,
  /**
   * What to do with a move out of reach. Cannot be omitted (if the scans of the diagnostics kept the throwing
   * handler, they would report a provider error)
   */
  onLostShift: LostShiftHandler<Value>,
): (date: DateString, withHoliday?: boolean) => Resolution<Value, Kind> {
  const { weekly, holiday: holidayRule, annual, dates, recurring } = compiled;
  const hasShift = recurring.some((r) => r.holidayOverlapPolicy === "after-holiday");
  const dateRuleOf = createDateRuleFinder(dates);
  /**
   * For options whose result does not depend on holidays, a judgement for the value only (business day or not,
   * counting nth business days, searches) does not throw for an unconfirmed holiday even with
   * unconfirmedHolidayPolicy: "throw" (holidays and other days are judged the same, so the result is not
   * affected; outside the supported years and wrong provider data throw as before). The information of a day,
   * such as dayInfoOn, carries `holiday` and therefore throws
   */
  const holidayUnused = resultIgnoresHolidays(compiled);
  const basis = createBasis(compiled, lookup);

  /**
   * The holiday on a neighbouring day a rule looks at; throws like the lookup (out-of-range with "throw").
   */
  const holidayOfNeighbour = (date: DateString): Holiday<Kind> | undefined =>
    lookup.holidayOfDate(date);

  return function resolve(date: DateString, withHoliday = true): Resolution<Value, Kind> {
    const dayNumber = dayNumberOf(date);
    const weekday = weekdayOfDate(date);
    const holiday = lookup.holidayOfDate(date, holidayUnused && !withHoliday);
    const make = (
      value: Value,
      reason: KnownScheduleDayReason,
      rule: DecidingRule<Value> | null,
      name: string | undefined,
      shiftedFrom?: DateString,
    ): Resolution<Value, Kind> => {
      const result: {
        -readonly [K in keyof ScheduleDayInfo<Value, Kind>]: ScheduleDayInfo<Value, Kind>[K];
      } = {
        date,
        weekday,
        value,
        reason,
      };
      if (name !== undefined) result.name = name;
      if (holiday !== undefined) result.holiday = holiday;
      if (shiftedFrom !== undefined) result.shiftedFrom = shiftedFrom;
      if (rule !== null) result.optionPath = result.rulePath = rule.path;
      return { day: Object.freeze(result), rule };
    };

    // 1. Specific dates  2. Annual month-days
    const byDate = dateRuleOf(dayNumber);
    if (byDate) return make(byDate.value, "date", byDate, byDate.name);
    const byAnnual = annual.find((r) => matchAnnual(r, date));
    if (byAnnual) return make(byAnnual.value, "annual", byAnnual, byAnnual.name);

    if (holiday) {
      // 3. Over the holiday ("over-holiday"; holiday rules { holiday: true } are here too)
      const over = recurring.find(
        (r) =>
          r.holidayOverlapPolicy === "over-holiday" &&
          matchRecurring(r, date, holidayOfNeighbour, basis, lookup.fromJp),
      );
      if (over) return make(over.value, "recurring", over, over.name);
      // 4. Holiday
      if (holidayRule !== "ignore") {
        const value = "sameAs" in holidayRule ? weekly[holidayRule.sameAs] : holidayRule.value;
        return make(value as Value, "holiday", null, holiday.name);
      }
      // When holidays follow the weekday, rules under the holiday ("under-holiday") apply as well.
      // "after-holiday" rules do not apply on a holiday (they move)
      const under = recurring.find(
        (r) =>
          r.holidayOverlapPolicy === "under-holiday" &&
          matchRecurring(r, date, holidayOfNeighbour, basis, lookup.fromJp),
      );
      if (under) return make(under.value, "recurring", under, under.name);
      return make(weekly[weekday] as Value, "weekday", null, undefined);
    }

    // 5. Recurring rules (on days that are not holidays; the one written first in the array wins). The day a
    // rule moved to is judged at the same stage
    for (const rule of recurring) {
      // Not applied on a weekday of skipWeekdays (moved, as on a holiday)
      if (rule.skipWeekdays?.has(weekday)) continue;
      if (matchRecurring(rule, date, holidayOfNeighbour, basis, lookup.fromJp))
        return make(rule.value, "recurring", rule, rule.name);
      if (hasShift && rule.holidayOverlapPolicy === "after-holiday") {
        const origin = shiftedOriginOf(rule, date, holidayOfNeighbour, lookup.fromJp, onLostShift);
        if (origin !== undefined) return make(rule.value, "recurring", rule, rule.name, origin);
      }
    }
    // 6. Weekday
    return make(weekly[weekday] as Value, "weekday", null, undefined);
  };
}

/**
 * Calls `fn` for every day of a period (both ends inclusive).
 * @param from - "YYYY-MM-DD".
 * @param to - "YYYY-MM-DD".
 * @param fn - Receives each date string.
 * @returns A frozen array of the results in date order.
 * @throws RangeError `invalid-range` when `from` is after `to`; what `fn` throws.
 * @internal
 */
export function mapDays<R>(
  from: DateString,
  to: DateString,
  fn: (date: DateString) => R,
): readonly R[] {
  if (from > to) {
    throw rangeError("invalid-range", `"from" must not be after "to" (${from} > ${to})`);
  }
  const result: R[] = [];
  for (let n = dayNumberOf(from); n <= dayNumberOf(to); n++) result.push(fn(dateOfDayNumber(n)));
  return Object.freeze(result);
}

/**
 * @internal The internal judgement of a schedule (takes a date string directly). createCalendarFromSchedule
 * uses it to get the result of one day without going through the public methods (which parse the input).
 * Registered per schedule at creation
 */
const INTERNAL_INFO = Symbol("bizdays-toolkit.scheduleInfo");

/**
 * @internal The Symbol property that holds the parts of a schedule or calendar made by a creating function (the
 * compiled rules, or the array of member calendars of a combination). The diagnostics use it to find the
 * boundaries, holiday years and cycle inside the basis calendar of an nth-business-day rule.
 * How it is read: decisions.md #31; why it is in the object literal: decisions.md #4. Being a Symbol property it
 * does not appear in `Object.keys`, `for...in` or JSON (it is enumerable, though). An object copied with spread
 * gets the holder too, but the holder's owner differs from the copy, so the parts are not read (partsOf)
 */
export const PARTS = Symbol("bizdays-toolkit.parts");

/** @internal Holder of the parts. `owner` is the object given the holder (set during creation, before freezing) */
export interface PartsHolder {
  owner: object | undefined;
  readonly value: CompiledSchedule<unknown, string> | readonly object[] | undefined;
}

/**
 * Creates the holder of an object's contents (compiled rules, or the parts of a combination); the owner is set
 * afterwards.
 * @internal
 */
export const partsHolder = (value: PartsHolder["value"]): PartsHolder => ({
  owner: undefined,
  value,
});

/**
 * The contents of an object created by this library.
 * @param object - A schedule or calendar.
 * @returns Its compiled rules or its array of parts; undefined when it has no holder or the holder belongs to another
 *   object (e.g. a spread copy).
 * @internal
 * @see decisions.md #4, #31
 */
export function partsOf(object: object): PartsHolder["value"] {
  const holder = (object as { readonly [PARTS]?: PartsHolder })[PARTS];
  return holder?.owner === object ? holder.value : undefined;
}

/**
 * The weekday values and holiday value of a schedule (createCalendarFromSchedule uses them to check the return
 * values of isOpen at creation)
 */
const INTERNAL_VALUES = Symbol("bizdays-toolkit.scheduleValues");

/**
 * The weekday values (7) of a schedule and, with holidayPolicy `{ value }`, the holiday value. Empty for an object
 * not created by createSchedule.
 * @internal
 */
export function valuesOfSchedule<Value>(schedule: Schedule<Value, string>): readonly Value[] {
  return (schedule as { [INTERNAL_VALUES]?: readonly Value[] })[INTERNAL_VALUES] ?? [];
}

/**
 * The internal per-date judgement of a schedule (takes a date string).
 * @returns The function, or undefined for an object not created by createSchedule.
 * @internal
 */
export function infoOfSchedule<Value, Kind extends string>(
  schedule: Schedule<Value, Kind>,
): ((date: DateString) => ScheduleDayInfo<Value, Kind>) | undefined {
  return (schedule as { [INTERNAL_INFO]?: (date: DateString) => ScheduleDayInfo<Value, Kind> })[
    INTERNAL_INFO
  ];
}

/**
 * Builds a frozen Schedule from compiled options without errors.
 * @param compiled - Compiled options.
 * @returns The schedule, carrying its contents for the diagnostics.
 * @internal
 */
export function buildSchedule<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
): Schedule<Value, Kind> {
  const lookup = createHolidayLookup(compiled.source);
  const resolve = createResolver(compiled, lookup, throwLostShift);
  const info = (date: DateString): ScheduleDayInfo<Value, Kind> => resolve(date).day;

  const values = Object.freeze(
    typeof compiled.holiday === "object" && "value" in compiled.holiday
      ? [...compiled.weekly, compiled.holiday.value]
      : [...compiled.weekly],
  );
  const parts = partsHolder(compiled);
  const schedule: Schedule<Value, Kind> & {
    readonly [INTERNAL_INFO]: typeof info;
    readonly [INTERNAL_VALUES]: readonly Value[];
    readonly [PARTS]: PartsHolder;
  } = {
    // The internal judgement (used by createCalendarFromSchedule). Being a Symbol property it does not appear in
    // `Object.keys`, `for...in` or JSON. It is in the object literal because adding it later with defineProperty
    // or a WeakMap slows creation down (decisions.md #4)
    [INTERNAL_INFO]: info,
    [INTERNAL_VALUES]: values,
    [PARTS]: parts,
    timeZone: lookup.timeZone,
    providers: lookup.providers,
    outOfRangePolicy: lookup.outOfRangePolicy,
    unconfirmedHolidayPolicy: lookup.unconfirmedHolidayPolicy,
    outOfRange: lookup.outOfRangePolicy,
    unconfirmedHolidays: lookup.unconfirmedHolidayPolicy,
    dateOf: lookup.dateOf,
    civilOf: lookup.civilOf,
    instantOf: lookup.instantOf,
    today: lookup.today,
    isHoliday: lookup.isHoliday,
    holidayOn: lookup.holidayOn,
    getHoliday: lookup.holidayOn,
    holidaysInYear: lookup.holidaysInYear,
    holidaysBetween: lookup.holidaysBetween,
    // A judgement for the value only does not throw for an unconfirmed holiday when the result does not depend
    // on holidays (holidays are still looked up, so outside the supported years it throws as before.
    // createResolver)
    valueOn: (input) => resolve(lookup.dateOf(input), false).day.value,
    dayInfoOn: (input) => info(lookup.dateOf(input)),
    dayInfo: (input) => info(lookup.dateOf(input)),
    daysBetween: (from, to) => mapDays(lookup.dateOf(from), lookup.dateOf(to), info),
  };
  parts.owner = schedule;
  Object.freeze(parts);
  return Object.freeze(schedule);
}

/**
 * Creates a schedule that returns a value per day from weekday values, the holiday policy, annual dates, specific
 * dates and recurring rules.
 * @param options - Schedule options. They are copied at creation (the values themselves are not copied): changing the
 *   arrays or objects afterwards changes nothing.
 * @returns A frozen Schedule.
 * @throws RangeError with the code of the first invalid option (`invalid-option`, `invalid-date`, ...), its message
 *   prefixed by the option's path.
 * @public
 */
export function createSchedule<Value, Kind extends string = string>(
  options: ScheduleOptions<Value, Kind>,
): Schedule<Value, Kind> {
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<Value, Kind>(c, options);
  c.throwFirstError();
  return buildSchedule(compiled!);
}

/**
 * @deprecated Renamed to ScheduleHolidayPolicy in 0.30.0. Removed in 1.0.0
 * @public
 */
export type HolidayValueRule<Value> = ScheduleHolidayPolicy<Value> | "weekday";

/**
 * @deprecated Renamed to HolidayOverlapPolicy in 0.30.0. Removed in 1.0.0
 * @public
 */
export type OnHolidayRule = HolidayOverlapPolicy;

/**
 * @deprecated Renamed to ScheduleRecurringRule in 0.30.0. Removed in 1.0.0
 * @public
 */
export type RecurringValue<Value, Kind extends string = string> = ScheduleRecurringRule<
  Value,
  Kind
>;

/**
 * @deprecated Renamed to ScheduleAnnualDate in 0.30.0. Removed in 1.0.0
 * @public
 */
export type AnnualValue<Value> = ScheduleAnnualDate<Value>;

/**
 * @deprecated Renamed to ScheduleAnnualRange in 0.30.0. Removed in 1.0.0
 * @public
 */
export type AnnualRangeValue<Value> = ScheduleAnnualRange<Value>;

/**
 * @deprecated Renamed to ScheduleSpecificDate in 0.30.0. Removed in 1.0.0
 * @public
 */
export type DateValue<Value> = ScheduleSpecificDate<Value>;

/**
 * @deprecated Renamed to ScheduleDateRange in 0.30.0. Removed in 1.0.0
 * @public
 */
export type DateRangeValue<Value> = ScheduleDateRange<Value>;

/**
 * @deprecated Renamed to ScheduleDayInfo in 0.30.0. Removed in 1.0.0
 * @public
 */
export type ScheduleDay<Value, Kind extends string = string> = ScheduleDayInfo<Value, Kind>;

/**
 * @deprecated Renamed to ScheduleDayReason in 0.30.0. Removed in 1.0.0
 * @public
 */
export type ScheduleReason = ScheduleDayReason;

/**
 * @deprecated Renamed to KnownScheduleDayReason in 0.30.0. Removed in 1.0.0
 * @public
 */
export type KnownScheduleReason = KnownScheduleDayReason;
