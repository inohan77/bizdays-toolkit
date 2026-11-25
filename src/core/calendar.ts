/**
 * A business calendar that combines holidays with the closing days of a company or shop.
 * The priority within the judgement of one day: "Business-day calendars" in docs/guide.md and
 * docs/decisions.md #11.
 *
 * Internally it is a schedule (createSchedule) whose value is whether the day is a business day (a boolean).
 * Searching and adjusting business days, the business days of a month and the like live in buildCalendar, and
 * combineCalendars, which combines created calendars (days when all are open / when any is open), uses the same
 * implementation.
 */

import { addDays, lengthOfMonth, formatDate, type DateString, type Weekday } from "./date.ts";
import {
  checkUnknownKeys,
  internalError,
  IssueCollector,
  describeValue,
  rangeError,
  withoutUndefined,
  type KnownErrorCode,
} from "./errors.ts";
import { isOptionsObject } from "./options.ts";
import { renameKeys, writtenKey } from "./renamed.ts";
import {
  distinctTimeZones,
  parseTimeOfDaySeconds,
  toCivil,
  type CivilDateTime,
  type DateInput,
} from "./input.ts";
import {
  checkClosingDay,
  closingDayIn,
  closingMonth as calendarClosingMonth,
  dayOfMonth,
  formatMonth,
  isDayOfMonthValue,
  parseMonth,
  readsAsDate,
  shiftMonth,
  type MonthString,
} from "./month.ts";
import {
  buildSchedule,
  compileAnnualRules,
  compileDateRules,
  compileHolidaySource,
  compileRecurringRules,
  createHolidayLookup,
  infoOfSchedule,
  PARTS,
  partsHolder,
  partsOf,
  type PartsHolder,
  valuesOfSchedule,
  isWeekday,
  mapDays,
  RECURRING_RULE_KEYS,
  jpUsage,
  type CompiledSchedule,
  type DayOfMonth,
  type EffectivePeriod,
  type KnownScheduleDayReason,
  type RecurringRule,
  type HolidayLookup,
  type HolidaySourceOptions,
  type Schedule,
  type ScheduleDayInfo,
  dateOfDayNumber,
  dayNumberOf,
} from "./schedule.ts";
import type { Holiday, HolidayProvider } from "./types.ts";

/**
 * How holidays are treated.
 * @public
 */
export type HolidayPolicy = "closed" | "open" | "ignore";

/**
 * An annual month-day "MM-DD" (optionally with a name and an effective period). A month-day that exists in no
 * year ("11-31", ...) is invalid-annual-date. "02-29" matches leap years only (it is not read as February 28 or
 * March 1 in other years. decisions.md #12).
 * @public
 */
export type AnnualDate =
  | string
  | ({ readonly date: string; readonly name?: string } & EffectivePeriod);
/**
 * A range of annual month-days (from > to crosses the year end, e.g. 12-31 to 01-03). The ends are as in
 * AnnualDate. In a year that is not a leap year, an end of "02-29" is left out and only the days in between are
 * included (from: "02-20", to: "02-29" ends on February 28).
 * @public
 */
export interface AnnualRange extends EffectivePeriod {
  readonly from: string;
  readonly to: string;
  readonly name?: string;
}
/**
 * A specific date "YYYY-MM-DD" (optionally with a name).
 * @public
 */
export type SpecificDate = DateString | { readonly date: DateString; readonly name?: string };
/**
 * A range of specific dates (both ends included).
 * @public
 */
export interface DateRange {
  readonly from: DateString;
  readonly to: DateString;
  readonly name?: string;
}

/**
 * Options of a business calendar.
 * @public
 */
export interface CalendarOptions<Kind extends string = string> extends HolidaySourceOptions<Kind> {
  /** Regular closed weekdays (0 = Sunday) */
  readonly closedWeekdays?: readonly Weekday[];
  /** Days closed every year (an effective period, effectiveFrom / effectiveTo, can be added) */
  readonly closedAnnualDates?: readonly (AnnualDate | AnnualRange)[];
  /** Extra closed days */
  readonly closedDates?: readonly (SpecificDate | DateRange)[];
  /** Extra business days (take priority over every other rule) */
  readonly openDates?: readonly (SpecificDate | DateRange)[];
  /**
   * Recurring closed days. The shapes of rules are in the table of "Recurring rules" in the guide (weekday,
   * cycle, day of month, nth business day, holiday, day before / after a holiday, ...).
   * What happens on a holiday is set per rule with holidayOverlapPolicy (default: "under-holiday").
   * With an effective period (effectiveFrom / effectiveTo), the rule is treated as not written outside it
   */
  readonly closedRecurringRules?: readonly RecurringRule<Kind>[];
  /** Recurring business days. They take priority when they match the same day as closedRecurringRules */
  readonly openRecurringRules?: readonly RecurringRule<Kind>[];
  /** How holidays are treated (default: "closed") */
  readonly holidayPolicy?: HolidayPolicy;
  /**
   * Maximum number of days examined when searching for a business day or a closed day (default: 3660). Beyond
   * it, a search for a business day throws a RangeError with code: "no-business-day" and a search for a closed
   * day (nextClosedDay, previousClosedDay) one with code: "no-closed-day"
   */
  readonly searchDayLimit?: number;
  /** @deprecated Renamed to closedAnnualDates in 0.30.0. Removed in 1.0.0 */
  readonly closedAnnual?: readonly (AnnualDate | AnnualRange)[];
  /** @deprecated Renamed to closedRecurringRules in 0.30.0. Removed in 1.0.0 */
  readonly closedRecurring?: readonly RecurringRule<Kind>[];
  /** @deprecated Renamed to openRecurringRules in 0.30.0. Removed in 1.0.0 */
  readonly openRecurring?: readonly RecurringRule<Kind>[];
  /** @deprecated Renamed to searchDayLimit in 0.30.0. Removed in 1.0.0 */
  readonly maxSearchDays?: number;
}

/**
 * The rule that decided open or closed (known values).
 * @public
 */
export type KnownDayReason =
  | "open-date"
  | "closed-date"
  | "open-annual"
  | "closed-annual"
  | "open-recurring"
  | "closed-recurring"
  | "holiday"
  | "closed-weekday"
  /** A business day that matched no option */
  | "default"
  /** In a calendar made from a schedule, a day that is a business day by its weekday value */
  | "open-weekday";

/**
 * The rule that decided open or closed. Later versions may add values, so handle "anything else" when branching.
 * Use KnownDayReason to check by type that every value is handled.
 * @public
 */
export type DayReason = KnownDayReason | (string & {});

/**
 * The judgement of one day.
 * @public
 */
export interface DayInfo<Kind extends string = string> {
  readonly date: DateString;
  readonly weekday: Weekday;
  /** Whether the day is a business day */
  readonly open: boolean;
  /** @deprecated Renamed to open in 0.30.0 (same value). Removed in 1.0.0 */
  readonly businessDay: boolean;
  /** The rule that decided the judgement */
  readonly reason: DayReason;
  /** Name of the rule that decided the judgement (name of the closed day, holiday name, ...) */
  readonly name?: string;
  /** The holiday, when the day is one (present whatever holidayPolicy is) */
  readonly holiday?: Holiday<Kind>;
  /**
   * When a recurring rule moved from a holiday decided the day, the original date of the move
   * (holidayOverlapPolicy: "after-holiday")
   */
  readonly shiftedFrom?: DateString;
  /**
   * Position in the options of the rule that decided the judgement (the same form as `path` of the diagnostics,
   * e.g. "closedRecurringRules[0]"). Present only on days decided by a specific date, an annual closed day or a
   * recurring rule (including the day it moved to); absent on days decided by a holiday or a closed weekday
   */
  readonly optionPath?: string;
  /** @deprecated Renamed to optionPath in 0.30.0 (same value). Removed in 1.0.0 */
  readonly rulePath?: string;
  /**
   * In a combined calendar (combineCalendars), the number of the calendar that decided the judgement (its
   * position in the array passed). reason, name, shiftedFrom and optionPath are that calendar's result. Absent
   * in a calendar that is not combined
   */
  readonly decidedBy?: number;
  /**
   * In a combined calendar, the numbers leading to the calendar that decided the judgement (outermost first).
   * Length 1 for a combination that is not nested, and its first element equals decidedBy. When combined
   * calendars are combined again, it tells from the result alone which calendar's options optionPath points
   * into (e.g. [0, 1] is calendar 1 inside calendar 0). Absent in a calendar that is not combined
   */
  readonly decidedByPath?: readonly number[];
}

/**
 * Options for combining calendars.
 * @public
 */
export interface CombineCalendarsOptions {
  /**
   * The condition for a business day. "all": every calendar is open (e.g. days when both the company and the
   * bank are open) / "any": any calendar is open (e.g. days when one of several shops is open)
   */
  readonly open: "all" | "any";
  /**
   * Maximum number of days examined when searching for a business day or a closed day (default: 3660). Beyond
   * it, a search for a business day throws a RangeError with code: "no-business-day" and a search for a closed
   * day (nextClosedDay, previousClosedDay) one with code: "no-closed-day"
   */
  readonly searchDayLimit?: number;
  /** @deprecated Renamed to searchDayLimit in 0.30.0. Removed in 1.0.0 */
  readonly maxSearchDays?: number;
}

/**
 * Options for searching for a business day.
 * @public
 */
export interface BusinessDayOnOrAfterOptions {
  /**
   * Cutoff time "HH:mm" or "HH:mm:ss" (in the calendar's time zone).
   * The input's time has minute precision (seconds dropped) and the start of that minute is compared (with
   * "14:00:30", an input at 14:00 is before the cutoff and one at 14:01 is after).
   * When the input's time is at or after this time, that day is not a candidate. Combined with an input without
   * a time (a date string, Temporal's PlainDate, ...) it throws a RangeError with code: "invalid-argument" (so
   * that the cutoff is not silently ignored)
   */
  readonly cutoff?: string;
}

/**
 * How a date on a closed day is adjusted (business day conventions).
 * - "following": the next business day
 * - "preceding": the previous business day
 * - "modified-following": the next business day, but the previous one when the month would change
 * - "modified-preceding": the previous business day, but the next one when the month would change
 *
 * Whether the month changes is judged against the month of the date before adjustment.
 * @namingSource isda
 * @public
 */
export type BusinessDayConvention =
  | "following"
  | "preceding"
  | "modified-following"
  | "modified-preceding";

/**
 * Options for adjusting a date.
 * @public
 */
export interface AdjustOptions {
  /** How to adjust */
  readonly convention: BusinessDayConvention;
}

/**
 * Options for the due date of a month.
 * @public
 */
export interface DueDateOptions {
  /** Day of the due date (1-31; -1 is the last day). A day the month lacks (February 30, ...) is the last day */
  readonly dayOfMonth: DayOfMonth;
  /** How to adjust when the due date is a closed day */
  readonly convention: BusinessDayConvention;
}

/**
 * A business calendar.
 * @public
 */
export interface Calendar<Kind extends string = string> extends HolidayLookup<Kind> {
  /**
   * The judgement of one day.
   * @param input - A date input, converted to a calendar date in the calendar's time zone.
   * @returns A frozen DayInfo: whether the day is a business day, the rule that decided it, and the holiday on that
   *   day if any.
   * @throws RangeError for an invalid input, or `out-of-range`, `unconfirmed-holiday`, `holiday-run-too-long` when
   *   the judgement of that day throws.
   */
  dayInfoOn(input: DateInput): DayInfo<Kind>;
  /**
   * @deprecated Renamed to `dayInfoOn` in 0.30.0 (same behaviour). Removed in 1.0.0.
   */
  dayInfo(input: DateInput): DayInfo<Kind>;
  /**
   * The judgement of every day of a period.
   * @param from - First day.
   * @param to - Last day (inclusive).
   * @returns A frozen array of DayInfo in date order.
   * @throws RangeError `invalid-range` when `from` is after `to`; the errors of {@link Calendar.dayInfoOn} for any
   *   day of the period.
   */
  daysBetween(from: DateInput, to: DateInput): readonly DayInfo<Kind>[];
  /**
   * Whether a day is a business day.
   * @param input - A date input.
   * @returns true for a business day.
   * @throws As {@link Calendar.dayInfoOn}; with results that do not depend on holidays, an unconfirmed holiday does
   *   not throw.
   */
  isBusinessDay(input: DateInput): boolean;
  /**
   * The first business day after the input day (the input day itself is not considered).
   * @param input - A date input.
   * @returns "YYYY-MM-DD".
   * @throws RangeError `no-business-day` when none is found within searchDayLimit days; `out-of-range` when the
   *   search leaves the years 1000-9999; any error of judging a day on the way.
   */
  nextBusinessDay(input: DateInput): DateString;
  /**
   * The last business day before the input day (the input day itself is not considered).
   * @param input - A date input.
   * @returns "YYYY-MM-DD".
   * @throws As {@link Calendar.nextBusinessDay}.
   */
  previousBusinessDay(input: DateInput): DateString;
  /**
   * The first day after the input day that is not a business day.
   * @param input - A date input.
   * @returns "YYYY-MM-DD".
   * @throws RangeError `no-closed-day` when none is found within searchDayLimit days; otherwise as {@link
   *   Calendar.nextBusinessDay}.
   */
  nextClosedDay(input: DateInput): DateString;
  /**
   * The last day before the input day that is not a business day.
   * @param input - A date input.
   * @returns "YYYY-MM-DD".
   * @throws As {@link Calendar.nextClosedDay}.
   */
  previousClosedDay(input: DateInput): DateString;
  /**
   * The input day when it is a business day, otherwise the next business day.
   * @param input - A date input. With `cutoff`, it must have a time of day.
   * @param options - `cutoff`: when the input's time (to the minute) is at or after it, the search starts from the
   *   next day.
   * @returns "YYYY-MM-DD".
   * @throws RangeError `invalid-argument` for options that are not an object, or for `cutoff` with a date-only input;
   *   `invalid-time` for an invalid `cutoff`; otherwise as {@link Calendar.nextBusinessDay}.
   */
  businessDayOnOrAfter(input: DateInput, options?: BusinessDayOnOrAfterOptions): DateString;
  /**
   * The input day when it is a business day, otherwise the previous business day.
   * @param input - A date input.
   * @returns "YYYY-MM-DD".
   * @throws As {@link Calendar.nextBusinessDay}.
   */
  businessDayOnOrBefore(input: DateInput): DateString;
  /**
   * The day n business days after the input day (before it when n is negative). The input day itself is not counted.
   * @param input - A date input.
   * @param n - Integer. 0 gives the same result as {@link Calendar.businessDayOnOrAfter}.
   * @returns "YYYY-MM-DD".
   * @throws RangeError `invalid-argument` when n is not an integer; otherwise as {@link Calendar.nextBusinessDay}
   *   (the limit applies to each step).
   */
  addBusinessDays(input: DateInput, n: number): DateString;
  /**
   * The number of business days from `from` (inclusive) to `to` (exclusive).
   * @param from - A date input.
   * @param to - A date input.
   * @returns A non-negative count when `from` is not after `to`; otherwise the negated count of [to, from). Never -0.
   * @throws The errors of judging any day of the range.
   */
  diffBusinessDays(from: DateInput, to: DateInput): number;
  /**
   * The business days of a period.
   * @param from - First day.
   * @param to - Last day (inclusive).
   * @returns A frozen array of "YYYY-MM-DD" in date order.
   * @throws RangeError `invalid-range` when `from` is after `to`; the errors of judging any day of the period.
   */
  businessDatesBetween(from: DateInput, to: DateInput): readonly DateString[];
  /**
   * @deprecated Renamed to `diffBusinessDays` in 0.30.0 (same behaviour). Removed in 1.0.0.
   */
  businessDaysBetween(from: DateInput, to: DateInput): number;
  /**
   * @deprecated Renamed to `businessDatesBetween` in 0.30.0 (same behaviour). Removed in 1.0.0.
   */
  listBusinessDays(from: DateInput, to: DateInput): readonly DateString[];
  /**
   * The input day when it is a business day, otherwise the business day chosen by the convention.
   * @param input - A date input.
   * @param options - `convention`: "following" (next business day), "preceding" (previous), "modified-following"
   *   (next, but the previous one if the next is in another month), "modified-preceding" (the mirror). "Another
   *   month" is relative to the input day's month.
   * @returns "YYYY-MM-DD". For the modified conventions the month of the input day is searched first, in the
   *   convention's direction and then in the opposite direction; only when that month has no business day does the
   *   search cross the month in the convention's direction.
   * @throws RangeError `invalid-argument` for options that are not an object or an unknown convention;
   *   `no-business-day` when searchDayLimit days were examined without a business day (the opposite-direction search
   *   inside the month is not limited); `out-of-range`; any error of judging a day on the way.
   * @see decisions.md #17, #21
   */
  adjust(input: DateInput, options: AdjustOptions): DateString;
  /**
   * The n-th business day of a month.
   * @param month - "YYYY-MM".
   * @param n - Non-zero integer; negative counts from the end of the month (-1 is the last business day).
   * @returns "YYYY-MM-DD".
   * @throws RangeError `invalid-month`; `invalid-argument` when n is 0 or not an integer; `no-business-day` when the
   *   month has fewer business days; any error of judging a day of the month.
   */
  nthBusinessDayOfMonth(month: MonthString, n: number): DateString;
  /**
   * The first business day of a month: `nthBusinessDayOfMonth(month, 1)`.
   */
  firstBusinessDayOfMonth(month: MonthString): DateString;
  /**
   * The last business day of a month: `nthBusinessDayOfMonth(month, -1)`.
   */
  lastBusinessDayOfMonth(month: MonthString): DateString;
  /**
   * A due date: a day of a month, adjusted by a convention when it is not a business day.
   * @param month - "YYYY-MM".
   * @param options - `dayOfMonth` (1-31, or -1 for the last day; a day the month does not have reads as its last day,
   *   before the adjustment) and `convention`.
   * @returns "YYYY-MM-DD".
   * @throws RangeError `invalid-argument` for options that are not an object, an invalid `dayOfMonth` or convention;
   *   `invalid-month`; otherwise as {@link Calendar.adjust}.
   */
  dueDate(month: MonthString, options: DueDateOptions): DateString;
  /**
   * The month a day belongs to when months are cut at a closing day adjusted to a business day.
   * @param input - A date input.
   * @param closingDayOfMonth - 1-31, or -1 for the last day (a day the month does not have reads as its last day).
   * @param options - `convention` used to adjust each month's closing day.
   * @returns "YYYY-MM": the earliest month m whose adjusted closing day D(m) is on or after the day. A month with no
   *   business day between the previous closing day and its own has no period; its days belong to the next month.
   * @throws RangeError `invalid-argument` for an invalid closing day or options (checked in this order, before the
   *   input); otherwise as {@link Calendar.adjust}.
   * @see decisions.md #23
   */
  closingMonth(input: DateInput, closingDayOfMonth: number, options: AdjustOptions): MonthString;
  /**
   * The period (both ends inclusive) of a month cut at a closing day adjusted to a business day: from the day after
   * the previous month's adjusted closing day to the month's adjusted closing day.
   * @param input - "YYYY-MM", or a date input meaning the period that day belongs to. A string with three or more
   *   hyphen-separated parts, and any non-string, is read as a date.
   * @param closingDayOfMonth - 1-31, or -1 for the last day.
   * @param options - `convention` used to adjust each closing day.
   * @returns A frozen `{ from, to }` of date strings, without `name`.
   * @throws RangeError `no-business-day` when a month is given that has no period of its own; `invalid-argument`,
   *   `invalid-month`; otherwise as {@link Calendar.adjust}.
   */
  closingPeriod(
    input: DateInput | MonthString,
    closingDayOfMonth: number,
    options: AdjustOptions,
  ): { readonly from: DateString; readonly to: DateString };
}

/** @internal Keys of the options of a business calendar */
export const CALENDAR_OPTION_KEYS = [
  "holidayProvider",
  "timeZone",
  "outOfRangePolicy",
  "unconfirmedHolidayPolicy",
  "closedWeekdays",
  "closedAnnualDates",
  "closedDates",
  "openDates",
  "closedRecurringRules",
  "openRecurringRules",
  "holidayPolicy",
  "searchDayLimit",
];

interface CompiledCalendar<Kind extends string> {
  readonly schedule: CompiledSchedule<boolean, Kind>;
  readonly searchDayLimit: number;
}

/**
 * Validates business-calendar options and compiles them into schedule form (values are true for open, false for
 * closed).
 * @param c - Receives every problem found: errors, `unknown-option` and `deprecated-option` warnings.
 * @param options - The options as given; any value.
 * @returns The compiled schedule and searchDayLimit (3660 when omitted or invalid); undefined when `options` is not
 *   an options object. A result is returned even when errors were recorded; callers must check `c`.
 * @remarks Order of rules in the result: open dates before closed dates, open recurring rules before closed recurring
 *   rules.
 * @internal
 * @see decisions.md #6
 */
export function compileCalendarOptions<Kind extends string>(
  c: IssueCollector,
  options: unknown,
): CompiledCalendar<Kind> | undefined {
  if (!isOptionsObject(options)) {
    c.error("invalid-option", "", "options must be an object");
    return undefined;
  }
  const written = options;
  const places = ["source", "calendar"] as const;
  const renamed = renameKeys(c, places, "", written);
  checkUnknownKeys(c, "", renamed, CALENDAR_OPTION_KEYS);
  const o = withoutUndefined(renamed);
  const source = compileHolidaySource<Kind>(c, o);

  const closedWeekdays = new Set<number>();
  const rawWeekdays = o["closedWeekdays"];
  if (rawWeekdays !== undefined) {
    if (!Array.isArray(rawWeekdays)) {
      c.error("invalid-option", "closedWeekdays", "must be an array");
    } else {
      Array.from(rawWeekdays as unknown[]).forEach((w: unknown, i) => {
        if (isWeekday(w)) closedWeekdays.add(w);
        else
          c.error(
            "invalid-weekday",
            `closedWeekdays[${i}]`,
            "must be an integer from 0 (Sunday) to 6 (Saturday)",
          );
      });
    }
  }

  // null is a wrong value, not omission (decisions.md #6). Only undefined is treated as omission
  const holidayPolicy = o["holidayPolicy"] === undefined ? "closed" : o["holidayPolicy"];
  if (holidayPolicy !== "closed" && holidayPolicy !== "open" && holidayPolicy !== "ignore") {
    c.error("invalid-option", "holidayPolicy", 'must be "closed", "open" or "ignore"');
  }
  const searchDayLimit = o["searchDayLimit"] === undefined ? 3660 : o["searchDayLimit"];
  if (!Number.isInteger(searchDayLimit) || (searchDayLimit as number) < 1) {
    c.error("invalid-option", "searchDayLimit", "must be a positive integer");
  }

  const OPEN = { value: true } as const;
  const CLOSED = { value: false } as const;
  const annual = compileAnnualRules<boolean>(
    c,
    "closedAnnualDates",
    o["closedAnnualDates"],
    () => CLOSED,
    true,
    false,
  );
  const open = compileDateRules<boolean>(c, "openDates", o["openDates"], () => OPEN, true, false);
  const closed = compileDateRules<boolean>(
    c,
    "closedDates",
    o["closedDates"],
    () => CLOSED,
    true,
    false,
  );
  const openRecurringRules = compileRecurringRules<boolean>(
    c,
    "openRecurringRules",
    o["openRecurringRules"],
    () => OPEN,
    RECURRING_RULE_KEYS,
    "calendar",
    writtenKey(places, written, "openRecurringRules"),
    jpUsage(source),
  );
  const closedRecurringRules = compileRecurringRules<boolean>(
    c,
    "closedRecurringRules",
    o["closedRecurringRules"],
    () => CLOSED,
    RECURRING_RULE_KEYS,
    "calendar",
    writtenKey(places, written, "closedRecurringRules"),
    jpUsage(source),
  );

  return {
    schedule: {
      source,
      weekly: Object.freeze([0, 1, 2, 3, 4, 5, 6].map((w) => !closedWeekdays.has(w))),
      holiday: holidayPolicy === "ignore" ? "ignore" : { value: holidayPolicy === "open" },
      annual,
      // Extra business days come first, so they take priority over extra closed days
      dates: [...open, ...closed],
      // Recurring business days come first, so they take priority over recurring closed days
      recurring: [...openRecurringRules, ...closedRecurringRules],
    },
    searchDayLimit: Number.isInteger(searchDayLimit) ? (searchDayLimit as number) : 3660,
  };
}

/**
 * Creates a business calendar from holidays and closing rules.
 * @param options - Calendar options; default `{}` (weekends are not closed unless `closedWeekdays` says so). The
 *   options are copied at creation: changing the arrays afterwards changes nothing.
 * @returns A frozen Calendar.
 * @throws RangeError with the code of the first invalid option (`invalid-option`, `invalid-date`, ...), its message
 *   prefixed by the option's path.
 * @public
 */
export function createCalendar<Kind extends string = string>(
  options: CalendarOptions<Kind> = {},
): Calendar<Kind> {
  const c = new IssueCollector();
  const compiled = compileCalendarOptions<Kind>(c, options);
  c.throwFirstError();
  const { searchDayLimit } = compiled!;
  const schedule = buildSchedule(compiled!.schedule);

  const info = (date: DateString): DayInfo<Kind> => {
    const day = schedule.dayInfoOn(date);
    return dayInfoFromScheduleDay(day, day.value, false);
  };

  return buildCalendar(schedule, (date) => schedule.valueOn(date), info, searchDayLimit);
}

/**
 * Converts the schedule's result for one day into a calendar DayInfo.
 * @param day - The schedule's day info.
 * @param open - Whether the day is a business day.
 * @param fromSchedule - true for a calendar created from a schedule.
 * @returns A frozen DayInfo. `reason` combines the schedule reason with `open`: date → open-date/closed-date, annual
 *   → open-annual/closed-annual, recurring → open-recurring/closed-recurring, holiday → holiday, weekday →
 *   closed-weekday, or when open "open-weekday" (fromSchedule) or "default". `name` is omitted for a weekday reason.
 *   `businessDay` and `rulePath` mirror `open` and `optionPath`.
 * @throws InternalError for an unknown schedule reason.
 * @internal
 */
export function dayInfoFromScheduleDay<Kind extends string>(
  day: ScheduleDayInfo<boolean, Kind>,
  open: boolean,
  fromSchedule: boolean,
): DayInfo<Kind> {
  let reason: KnownDayReason;
  // Internally the branch uses the closed type (KnownScheduleDayReason), so the types detect an unhandled new value
  const known = day.reason as KnownScheduleDayReason;
  switch (known) {
    case "date":
      reason = open ? "open-date" : "closed-date";
      break;
    case "annual":
      reason = open ? "open-annual" : "closed-annual";
      break;
    case "recurring":
      reason = open ? "open-recurring" : "closed-recurring";
      break;
    case "holiday":
      reason = "holiday";
      break;
    case "weekday":
      reason = open ? (fromSchedule ? "open-weekday" : "default") : "closed-weekday";
      break;
    default: {
      const unreachable: never = known;
      throw internalError(`unexpected schedule reason: ${String(unreachable)}`);
    }
  }
  const result: { -readonly [K in keyof DayInfo<Kind>]: DayInfo<Kind>[K] } = {
    date: day.date,
    weekday: day.weekday,
    open,
    businessDay: open,
    reason,
  };
  // A day decided by its weekday gets no name (the holiday name is in `holiday`)
  if (day.name !== undefined && day.reason !== "weekday") result.name = day.name;
  if (day.holiday !== undefined) result.holiday = day.holiday;
  if (day.shiftedFrom !== undefined) result.shiftedFrom = day.shiftedFrom;
  if (day.optionPath !== undefined) result.optionPath = result.rulePath = day.optionPath;
  return Object.freeze(result);
}

/**
 * The per-day judgement and the search limit that the calendar calculations work on.
 * @internal
 */
export interface CalendarCore {
  /** Whether a date is a business day; may throw. */
  readonly isOpen: (date: DateString) => boolean;
  /** Positive integer: the number of days a search examines. */
  readonly searchDayLimit: number;
}

/**
 * The adjustment conventions.
 * @internal
 */
export const CONVENTIONS: readonly BusinessDayConvention[] = [
  "following",
  "preceding",
  "modified-following",
  "modified-preceding",
];

/**
 * Creates the `no-business-day` RangeError for a search that started at `start`.
 * @internal
 */
export function noBusinessDay(core: CalendarCore, start: DateString): RangeError {
  return rangeError(
    "no-business-day",
    `No business day found within ${core.searchDayLimit} days from ${start}`,
  );
}

/**
 * Finds the first day, starting at `start` itself and moving by `step`, whose business-day status equals `open`.
 * @param core - Judgement and limit.
 * @param start - First day examined.
 * @param step - 1 forward, -1 backward.
 * @param open - true to find a business day, false a closed day.
 * @returns The date.
 * @throws RangeError `no-business-day` / `no-closed-day` after searchDayLimit days were examined; `out-of-range`
 *   when the search leaves the years 1000-9999; any error of `isOpen`.
 * @internal
 */
export function searchDay(
  core: CalendarCore,
  start: DateString,
  step: 1 | -1,
  open = true,
): DateString {
  const { isOpen, searchDayLimit } = core;
  let n = dayNumberOf(start);
  for (let i = 0; i < searchDayLimit; i++, n += step) {
    const date = dateOfDayNumber(n);
    if (isOpen(date) === open) return date;
  }
  throw open
    ? noBusinessDay(core, start)
    : rangeError(
        "no-closed-day",
        `No closed day found within ${searchDayLimit} days from ${start}`,
      );
}

/**
 * Number of business days among the day numbers from `from` (inclusive) to `toExclusive`.
 * @internal
 */
export function countOpen(core: CalendarCore, from: number, toExclusive: number): number {
  const { isOpen } = core;
  let count = 0;
  for (let n = from; n < toExclusive; n++) if (isOpen(dateOfDayNumber(n))) count++;
  return count;
}

/**
 * Finds the first business day from `start` moving by `step`, without leaving the month of `start` (days outside
 * the month are never evaluated).
 * @param core - Judgement and limit.
 * @param start - First day examined.
 * @param step - 1 or -1.
 * @param limited - true to throw after searchDayLimit days were examined.
 * @returns The date, or undefined when the end of the month is reached.
 * @throws RangeError `no-business-day` (only with `limited`); any error of `isOpen`.
 * @internal
 */
export function searchInMonth(
  core: CalendarCore,
  start: DateString,
  step: 1 | -1,
  limited: boolean,
): DateString | undefined {
  const { isOpen, searchDayLimit } = core;
  const { year, month } = parseMonth(start.slice(0, 7));
  const first = dayNumberOf(formatDate(year, month, 1));
  const last = first + lengthOfMonth(year, month) - 1;
  let n = dayNumberOf(start);
  for (let i = 0; n >= first && n <= last; i++, n += step) {
    if (limited && i >= searchDayLimit) throw noBusinessDay(core, start);
    const date = dateOfDayNumber(n);
    if (isOpen(date)) return date;
  }
  return undefined;
}

/**
 * Implements {@link Calendar.adjust} for a date string.
 * @param core - Judgement and limit.
 * @param date - "YYYY-MM-DD".
 * @param options - Must have a valid `convention`.
 * @returns `date` when it is a business day; otherwise per convention. Modified conventions: search within the
 *   month in the convention's direction (limited by searchDayLimit), then within the month in the opposite
 *   direction (not limited), then across the month in the convention's direction.
 * @throws RangeError `invalid-argument` for a missing or unknown convention; the errors of {@link searchDay}.
 * @internal
 * @see decisions.md #17, #21
 */
export function adjustDate(
  core: CalendarCore,
  date: DateString,
  options: AdjustOptions | undefined,
): DateString {
  const convention = (options as { convention?: unknown } | undefined)?.convention;
  if (!CONVENTIONS.includes(convention as BusinessDayConvention)) {
    throw rangeError(
      "invalid-argument",
      `convention must be one of ${CONVENTIONS.map((v) => `"${v}"`).join(", ")}`,
    );
  }
  if (core.isOpen(date)) return date;
  switch (convention as BusinessDayConvention) {
    case "following":
      return searchDay(core, date, 1);
    case "preceding":
      return searchDay(core, date, -1);
    // The month itself is searched first, and the search crosses into another month in the original direction
    // only when the month has no business day at all (days outside the month that do not matter are not
    // evaluated; throwing on evaluated days: decisions.md #17; crossing months: decisions.md #21)
    case "modified-following":
      return (
        searchInMonth(core, date, 1, true) ??
        searchInMonth(core, date, -1, false) ??
        searchDay(core, date, 1)
      );
    case "modified-preceding":
      return (
        searchInMonth(core, date, -1, true) ??
        searchInMonth(core, date, 1, false) ??
        searchDay(core, date, -1)
      );
    default:
      throw rangeError("invalid-argument", `Unknown convention: ${String(convention)}`);
  }
}

/**
 * The closing day of a month, adjusted to a business day: D(m).
 * @param core - Judgement and limit.
 * @param month - Year and month.
 * @param closingDayOfMonth - A valid closing day.
 * @param options - Adjustment convention.
 * @returns "YYYY-MM-DD".
 * @internal
 * @see decisions.md #23
 */
export function closingDate(
  core: CalendarCore,
  month: { year: number; month: number },
  closingDayOfMonth: number,
  options: AdjustOptions,
): DateString {
  return adjustDate(core, dayOfMonth(month, closingDayIn(month, closingDayOfMonth)), options);
}

/**
 * The earliest month m with `date` ≤ D(m) ({@link closingDate}). D is non-decreasing in m, so the search walks from
 * the plain calendar closing month backward, then forward.
 * @param core - Judgement and limit.
 * @param date - "YYYY-MM-DD".
 * @param closingDayOfMonth - Validated here.
 * @param options - Adjustment convention.
 * @returns Year and month.
 * @throws RangeError `invalid-argument` for an invalid closing day; the errors of {@link adjustDate}.
 * @internal
 */
export function closingMonthOf(
  core: CalendarCore,
  date: DateString,
  closingDayOfMonth: number,
  options: AdjustOptions,
): { year: number; month: number } {
  checkClosingDay(closingDayOfMonth);
  let month = parseMonth(calendarClosingMonth(date, closingDayOfMonth));
  // D increases with the month (never decreases), so starting from the closing month of the calendar date the
  // search goes forward (with "following", the previous month's closing date moved past a long closure into
  // this month or later) and backward (with "preceding", this month's closing date moved before `date`)
  while (date <= closingDate(core, shiftMonth(month, -1), closingDayOfMonth, options)) {
    month = shiftMonth(month, -1);
  }
  while (date > closingDate(core, month, closingDayOfMonth, options)) month = shiftMonth(month, 1);
  return month;
}

/**
 * The closing period of a closing month: from the day after D(m - 1) through D(m).
 * @param core - Judgement and limit.
 * @param month - The closing month.
 * @param closingDayOfMonth - A valid closing day.
 * @param options - Adjustment convention.
 * @returns A frozen `{ from, to }`.
 * @throws RangeError `no-business-day` when the month has no days of its own (from > to).
 * @internal
 */
export function closingPeriodOfMonth(
  core: CalendarCore,
  month: { year: number; month: number },
  closingDayOfMonth: number,
  options: AdjustOptions,
): { readonly from: DateString; readonly to: DateString } {
  const to = closingDate(core, month, closingDayOfMonth, options);
  const from = addDays(closingDate(core, shiftMonth(month, -1), closingDayOfMonth, options), 1);
  if (from > to) {
    throw rangeError(
      "no-business-day",
      `${formatMonth(month)} has no closing period of its own: there is no business day between the previous closing day and ${to} (its days belong to the next month)`,
    );
  }
  return Object.freeze({ from, to });
}

/**
 * The business days of a month, in date order.
 * @param core - Judgement.
 * @param month - "YYYY-MM".
 * @returns A new array of date strings.
 * @throws RangeError `invalid-month`; any error of `isOpen`.
 * @internal
 */
export function businessDaysOfMonth(core: CalendarCore, month: MonthString): DateString[] {
  const { isOpen } = core;
  const { year, month: m } = parseMonth(month);
  const result: DateString[] = [];
  for (let d = 1; d <= lengthOfMonth(year, m); d++) {
    const date = formatDate(year, m, d);
    if (isOpen(date)) result.push(date);
  }
  return result;
}

/**
 * Implements {@link Calendar.nthBusinessDayOfMonth}.
 * @param core - Judgement.
 * @param month - "YYYY-MM".
 * @param n - Non-zero integer; negative counts from the end.
 * @returns The date.
 * @throws RangeError `invalid-argument`, `invalid-month`, `no-business-day`.
 * @internal
 */
export function nthOfMonth(core: CalendarCore, month: MonthString, n: number): DateString {
  if (!Number.isInteger(n) || n === 0) {
    throw rangeError("invalid-argument", `n must be a non-zero integer: ${describeValue(n)}`);
  }
  const days = businessDaysOfMonth(core, month);
  const found = n > 0 ? days[n - 1] : days[days.length + n];
  if (found === undefined) {
    throw rangeError(
      "no-business-day",
      `${month} has ${days.length} business day(s); requested ${n > 0 ? "" : "last "}#${Math.abs(n)}`,
    );
  }
  return found;
}

/**
 * The first day a search for {@link Calendar.businessDayOnOrAfter} examines.
 * @param civil - The input as a calendar date and minutes since midnight (null for a date-only input).
 * @param cutoff - The `cutoff` option, or undefined.
 * @returns The input's date, or the next day when the input's time (start of its minute) is at or after the
 *   cutoff.
 * @throws RangeError `invalid-time` for a wrong cutoff; `invalid-argument` for a cutoff with a date-only input.
 * @internal
 */
export function startAfterCutoff(civil: CivilDateTime, cutoff: unknown): DateString {
  if (cutoff === undefined) return civil.date;
  const seconds = parseTimeOfDaySeconds(cutoff);
  if (civil.minutes === null) {
    throw rangeError(
      "invalid-argument",
      "cutoff requires an input with a time of day (a Date, a date-time string or a Temporal value with a time); a date-only input would silently ignore the cutoff",
    );
  }
  // The input's time has minute precision, so the start of the input's minute (second 0) is compared. When
  // the cutoff's seconds are not 0, an input in the same minute is before the cutoff
  return civil.minutes * 60 >= seconds ? addDays(civil.date, 1) : civil.date;
}

/**
 * Implements {@link Calendar.addBusinessDays} for a date string.
 * @param core - Judgement and limit.
 * @param start - "YYYY-MM-DD".
 * @param n - Integer (the caller validates it); 0 returns the first business day on or after `start`.
 * @returns The date |n| business days after (n > 0) or before (n < 0) `start`.
 * @throws The errors of {@link searchDay}.
 * @internal
 */
export function addBusinessDaysTo(core: CalendarCore, start: DateString, n: number): DateString {
  let date = start;
  if (n === 0) return searchDay(core, date, 1);
  const step = n > 0 ? 1 : -1;
  for (let remaining = Math.abs(n); remaining > 0; remaining--) {
    date = searchDay(core, addDays(date, step), step);
  }
  return date;
}

/**
 * The business days from `a` through `b` (both ends inclusive), in date order.
 * @returns A frozen array of date strings.
 * @throws RangeError `invalid-range` when `a` is after `b`; any error of `isOpen`.
 * @internal
 */
export function businessDatesIn(
  core: CalendarCore,
  a: DateString,
  b: DateString,
): readonly DateString[] {
  const { isOpen } = core;
  if (a > b) throw rangeError("invalid-range", `"from" must not be after "to" (${a} > ${b})`);
  const result: DateString[] = [];
  for (let n = dayNumberOf(a); n <= dayNumberOf(b); n++) {
    const date = dateOfDayNumber(n);
    if (isOpen(date)) result.push(date);
  }
  return Object.freeze(result);
}

/**
 * Implements {@link Calendar.dueDate}.
 * @param core - Judgement and limit.
 * @param month - "YYYY-MM".
 * @param options - The options argument as given (old key names are read as the new ones).
 * @returns The day `dayOfMonth` of the month (the last day when the month lacks it), adjusted by `convention`.
 * @throws RangeError `invalid-argument` for options that are not an object, a wrong `dayOfMonth` or a wrong
 *   `convention`; `invalid-option` when `dayOfMonth` is given under both its old and its new name; `invalid-month`;
 *   the errors of {@link adjustDate}.
 * @internal
 */
export function dueDateOf(core: CalendarCore, month: MonthString, options: unknown): DateString {
  const o = optionsObject(
    options,
    "dueDate options",
    (v) => renameKeys("throw", ["dueDate"], "", v),
    true,
  );
  const day = o["dayOfMonth"];
  if (!isDayOfMonthValue(day)) {
    throw rangeError(
      "invalid-argument",
      `dayOfMonth must be an integer from 1 to 31, or -1 (last day): ${describeValue(day)}`,
    );
  }
  return adjustDate(core, dayOfMonth(parseMonth(month), day), o as unknown as AdjustOptions);
}

/**
 * Builds the Calendar methods (search, adjustment, month and closing functions) on top of a holiday lookup and a
 * per-day judgement. Shared by createCalendar, combineCalendars and createCalendarFromSchedule.
 * @param lookup - Holiday lookup and time zone conversion; its members are exposed unchanged.
 * @param isOpen - Whether a date is a business day; may throw.
 * @param info - DayInfo of a date.
 * @param searchDayLimit - Positive integer: the number of days a search examines.
 * @returns A frozen Calendar that carries the contents (`PARTS`) of `lookup` for the diagnostics.
 * @internal
 */
export function buildCalendar<Kind extends string>(
  lookup: HolidayLookup<Kind>,
  isOpen: (date: DateString) => boolean,
  info: (date: DateString) => DayInfo<Kind>,
  searchDayLimit: number,
): Calendar<Kind> {
  const dateOf = lookup.dateOf;
  const core: CalendarCore = { isOpen, searchDayLimit };

  // The parts are inherited from the origin (a schedule, a combined lookup). Without parts in the origin the
  // holder is empty (the diagnostics treat the content as unknown)
  const parts = partsHolder(partsOf(lookup));
  const calendar: Calendar<Kind> & { readonly [PARTS]: PartsHolder } = {
    [PARTS]: parts,
    timeZone: lookup.timeZone,
    providers: lookup.providers,
    outOfRangePolicy: lookup.outOfRangePolicy,
    unconfirmedHolidayPolicy: lookup.unconfirmedHolidayPolicy,
    outOfRange: lookup.outOfRangePolicy,
    unconfirmedHolidays: lookup.unconfirmedHolidayPolicy,
    dateOf,
    civilOf: lookup.civilOf,
    instantOf: lookup.instantOf,
    today: lookup.today,
    isHoliday: lookup.isHoliday,
    holidayOn: lookup.holidayOn,
    getHoliday: lookup.holidayOn,
    holidaysInYear: lookup.holidaysInYear,
    holidaysBetween: lookup.holidaysBetween,

    dayInfoOn: (input) => info(dateOf(input)),
    dayInfo: (input) => info(dateOf(input)),
    daysBetween: (from, to) => mapDays(dateOf(from), dateOf(to), info),
    isBusinessDay: (input) => isOpen(dateOf(input)),
    nextBusinessDay: (input) => searchDay(core, addDays(dateOf(input), 1), 1),
    previousBusinessDay: (input) => searchDay(core, addDays(dateOf(input), -1), -1),
    nextClosedDay: (input) => searchDay(core, addDays(dateOf(input), 1), 1, false),
    previousClosedDay: (input) => searchDay(core, addDays(dateOf(input), -1), -1, false),
    businessDayOnOrAfter(input, options) {
      const opts = optionsObject(options, "businessDayOnOrAfter options");
      return searchDay(core, startAfterCutoff(toCivil(input, lookup.timeZone), opts["cutoff"]), 1);
    },
    businessDayOnOrBefore: (input) => searchDay(core, dateOf(input), -1),
    addBusinessDays(input, n) {
      if (!Number.isInteger(n))
        throw rangeError("invalid-argument", `n must be an integer: ${describeValue(n)}`);
      return addBusinessDaysTo(core, dateOf(input), n);
    },
    diffBusinessDays(from, to) {
      const a = dayNumberOf(dateOf(from));
      const b = dayNumberOf(dateOf(to));
      // Do not return -0 for a reversed range without business days (Intl.NumberFormat and others show "-0")
      return a <= b ? countOpen(core, a, b) : 0 - countOpen(core, b, a);
    },
    businessDatesBetween: (from, to) => businessDatesIn(core, dateOf(from), dateOf(to)),
    adjust: (input, options) =>
      adjustDate(core, dateOf(input), adjustOptions(options, "adjust options")),
    nthBusinessDayOfMonth: (month, n) => nthOfMonth(core, month, n),
    firstBusinessDayOfMonth: (month) => nthOfMonth(core, month, 1),
    lastBusinessDayOfMonth: (month) => nthOfMonth(core, month, -1),
    // The closing-day methods check the closing day, then the options, then the input (so that both methods give
    // the same code when two of them are wrong)
    closingMonth(input, closingDayOfMonth, rawOptions) {
      checkClosingDay(closingDayOfMonth);
      const options = adjustOptions(rawOptions, "closingMonth options");
      return formatMonth(closingMonthOf(core, dateOf(input), closingDayOfMonth, options));
    },
    closingPeriod(input, closingDayOfMonth, rawOptions) {
      checkClosingDay(closingDayOfMonth);
      const options = adjustOptions(rawOptions, "closingPeriod options");
      // Read like the root closingPeriod (a string with three or more hyphen-separated parts, and a value that
      // is not a string, are a calendar date; any other string is a month). A date becomes a calendar date with
      // dateOf
      const month =
        typeof input !== "string" || readsAsDate(input)
          ? closingMonthOf(core, dateOf(input), closingDayOfMonth, options)
          : parseMonth(input as string);
      return closingPeriodOfMonth(core, month, closingDayOfMonth, options);
    },
    dueDate: (month, options) => dueDateOf(core, month, options),
    businessDaysBetween: (from, to) => calendar.diffBusinessDays(from, to),
    listBusinessDays: (from, to) => calendar.businessDatesBetween(from, to),
  };
  parts.owner = calendar;
  Object.freeze(parts);
  return Object.freeze(calendar);
}

/**
 * Reads an options argument of a method or function.
 * @param options - The argument as given.
 * @param what - Name used in the error message.
 * @param rename - Applied to the object before use (renamed keys); default identity.
 * @param required - true when the argument cannot be omitted.
 * @param code - Error code; default `invalid-argument` (creation functions pass `invalid-option`).
 * @returns `{}` for undefined when not required; otherwise a copy of the object without properties that are
 *   undefined.
 * @throws RangeError with `code` when the value is not an options object (null, numbers, arrays, Date, ...), or
 *   undefined when required.
 * @internal
 * @see decisions.md #6, #8
 */
export function optionsObject(
  options: unknown,
  what: string,
  rename: (v: Record<string, unknown>) => Record<string, unknown> = (v) => v,
  /**
   * Options that cannot be omitted (dueDate, combineCalendars, adjust, closingMonth, closingPeriod): undefined is
   * also reported as not being an object
   */
  required = false,
  code: KnownErrorCode = "invalid-argument",
): Record<string, unknown> {
  if (options === undefined && !required) return {};
  if (!isOptionsObject(options)) {
    throw rangeError(code, `${what} must be an object: ${describeValue(options)}`);
  }
  return withoutUndefined(rename(options));
}

/**
 * Reads the required options object of adjust, closingMonth and closingPeriod.
 * @throws RangeError `invalid-argument` when it is not an options object.
 * @internal
 */
export const adjustOptions = (options: unknown, what: string): AdjustOptions =>
  optionsObject(options, what, undefined, true) as unknown as AdjustOptions;

/**
 * Whether a value has the shape of a calendar: an object with functions `dayInfoOn` and `isBusinessDay`, a string
 * `timeZone` and an array `providers`. Objects not created by this library pass too.
 * @internal
 */
export const isCalendarLike = (v: unknown): v is Calendar =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Calendar).dayInfoOn === "function" &&
  typeof (v as Calendar).isBusinessDay === "function" &&
  typeof (v as Calendar).timeZone === "string" &&
  Array.isArray((v as Calendar).providers);

/**
 * Validates the arguments of {@link combineCalendars}.
 * @param calendars - The argument as given.
 * @param options - The argument as given (old key names are read as the new ones).
 * @returns `list`: a frozen copy of the calendars; `mode`; `searchDayLimit` (default 3660); `zone`: the common
 *   time zone.
 * @throws RangeError `invalid-argument` (not an array of two or more distinct calendars), `invalid-option`
 *   (options that are not an object, or with a wrong `open` or `searchDayLimit`), `time-zone-conflict`.
 * @internal
 * @see decisions.md #4, #6
 */
export function checkCombineArguments<Kind extends string>(
  calendars: readonly Calendar<Kind>[],
  options: CombineCalendarsOptions,
): {
  list: readonly Calendar<Kind>[];
  mode: "all" | "any";
  searchDayLimit: number;
  zone: string;
} {
  if (!Array.isArray(calendars) || calendars.length < 2) {
    throw rangeError("invalid-argument", "calendars must be an array of two or more calendars");
  }
  // The array passed is copied and frozen, and only the copy is used from here on (changing the array after
  // creation does not change the combination. decisions.md #4). A hole is validated as an undefined element
  // (forEach skips holes. decisions.md #6)
  const list = Object.freeze(Array.from(calendars));
  list.forEach((c, i) => {
    if (!isCalendarLike(c))
      throw rangeError("invalid-argument", `calendars[${i}] is not a calendar`);
    if (list.indexOf(c) !== i) {
      throw rangeError(
        "invalid-argument",
        `calendars[${i}] is the same calendar as calendars[${list.indexOf(c)}]`,
      );
    }
  });
  const o = optionsObject(
    options,
    "combineCalendars options",
    (v) => renameKeys("throw", ["combine"], "", v),
    true,
    "invalid-option",
  );
  const mode = o["open"];
  if (mode !== "all" && mode !== "any") {
    throw rangeError("invalid-option", 'open must be "all" or "any"');
  }
  const searchDayLimit = (o["searchDayLimit"] === undefined ? 3660 : o["searchDayLimit"]) as number;
  if (!Number.isInteger(searchDayLimit) || searchDayLimit < 1) {
    throw rangeError("invalid-option", "searchDayLimit must be a positive integer");
  }
  const zones = distinctTimeZones(list.map((c) => c.timeZone));
  if (zones.length > 1) {
    throw rangeError(
      "time-zone-conflict",
      `Calendars use different time zones (${zones.join(", ")}); combine calendars with the same time zone`,
    );
  }
  return { list, mode, searchDayLimit, zone: zones[0]! };
}

/**
 * Merges holiday lists: per date the holiday of the earliest list wins.
 * @returns A frozen array sorted by date.
 * @internal
 */
export function mergeHolidayLists<Kind extends string>(
  lists: readonly (readonly Holiday<Kind>[])[],
): readonly Holiday<Kind>[] {
  const byDate = new Map<string, Holiday<Kind>>();
  for (const holidays of lists)
    for (const h of holidays) if (!byDate.has(h.date)) byDate.set(h.date, h);
  return Object.freeze(
    [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  );
}

/**
 * Combined business-day status: with "all" every result must be true, with "any" at least one.
 * @internal
 */
export const combinedOpen = (results: readonly boolean[], mode: "all" | "any"): boolean =>
  mode === "all" ? results.every(Boolean) : results.some(Boolean);

/**
 * Combined DayInfo of a date from the results of the member calendars.
 * @param date - The date.
 * @param results - DayInfo of each member calendar, in the written order.
 * @param mode - "all" or "any".
 * @returns A frozen DayInfo. reason, name, shiftedFrom and optionPath come from the first calendar whose
 *   judgement equals the combined one (`decidedBy`; `decidedByPath` prepends it to that calendar's own path);
 *   `holiday` is the first holiday among the results.
 * @internal
 */
export function combinedDayInfo<Kind extends string>(
  date: DateString,
  results: readonly DayInfo<Kind>[],
  mode: "all" | "any",
): DayInfo<Kind> {
  const open = mode === "all" ? results.every((r) => r.open) : results.some((r) => r.open);
  // The first calendar with the same judgement as the combined result (with "all": the first closed one when
  // closed; when open all are open, so number 0)
  const decidedBy = results.findIndex((r) => r.open === open);
  const decided = results[decidedBy]!;
  const result: { -readonly [K in keyof DayInfo<Kind>]: DayInfo<Kind>[K] } = {
    date,
    weekday: decided.weekday,
    open,
    businessDay: open,
    reason: decided.reason,
  };
  if (decided.name !== undefined) result.name = decided.name;
  // The holiday is the first one in the results of the member calendars (not looked up again; a day on which a
  // member calendar throws has already thrown above)
  const holiday = results.find((r) => r.holiday !== undefined)?.holiday;
  if (holiday !== undefined) result.holiday = holiday;
  if (decided.shiftedFrom !== undefined) result.shiftedFrom = decided.shiftedFrom;
  if (decided.optionPath !== undefined) result.optionPath = result.rulePath = decided.optionPath;
  result.decidedBy = decidedBy;
  // When the inner calendar is a combined one, its own number goes before that path (length 1 when not nested)
  result.decidedByPath = Object.freeze([decidedBy, ...(decided.decidedByPath ?? [])]);
  return Object.freeze(result);
}

/**
 * Combines existing business calendars into one.
 * @param calendars - Two or more distinct calendars with the same time zone. The array is copied.
 * @param options - `open`: "all" (a day is a business day when every calendar is open) or "any" (when at least one
 *   is); `searchDayLimit` (default 3660).
 * @returns A frozen Calendar. Every calendar is judged for every day, so a day throws when any calendar throws.
 *   `dayInfoOn` reports `reason`, `name`, `shiftedFrom` and `optionPath` of the first calendar whose result equals
 *   the combined result, its index as `decidedBy`, and the chain of indexes through nested combinations as
 *   `decidedByPath`. Holidays are taken per date from the first calendar that has one. A combined calendar can be
 *   combined again; it cannot be diagnosed (diagnose the options of its parts).
 * @throws RangeError `invalid-argument` when `calendars` is not an array of two or more calendars or contains the
 *   same calendar twice; `invalid-option` for invalid options; `time-zone-conflict` when the time zones differ.
 * @public
 * @see decisions.md #4, #6, #17
 */
export function combineCalendars<Kind extends string = string>(
  calendars: readonly Calendar<Kind>[],
  options: CombineCalendarsOptions,
): Calendar<Kind> {
  const { list, mode, searchDayLimit, zone } = checkCombineArguments(calendars, options);
  const providers: HolidayProvider<Kind>[] = [];
  for (const c of list) for (const p of c.providers) if (!providers.includes(p)) providers.push(p);
  // The combined lookup is used only for time-zone conversion and for the provider and policy values (a summary:
  // "throw" when any is "throw"). Holidays are not looked up from the union but taken from the results of the
  // member calendars (applying one policy to the union would apply a calendar's policy to providers that belong
  // only to another calendar and throw on a day on which no member calendar throws. decisions.md #17)
  const base = createHolidayLookup<Kind>({
    providers: Object.freeze(providers),
    timeZone: zone,
    outOfRangePolicy: list.every((c) => c.outOfRangePolicy === "ignore") ? "ignore" : "throw",
    unconfirmedHolidayPolicy: list.some((c) => c.unconfirmedHolidayPolicy === "throw")
      ? "throw"
      : "accept",
  });
  /**
   * The holiday on a day: every calendar is asked, the first holiday found is returned.
   */
  const holidayOn = (input: DateInput): Holiday<Kind> | undefined =>
    list.map((c) => c.holidayOn(input)).find((h) => h !== undefined);
  // The combined lookup holds the array of member calendars as its parts (buildCalendar passes them on to the
  // combined calendar)
  const parts = partsHolder(list);
  const lookup: HolidayLookup<Kind> & { readonly [PARTS]: PartsHolder } = {
    ...base,
    [PARTS]: parts,
    isHoliday: (input) => holidayOn(input) !== undefined,
    holidayOn,
    getHoliday: holidayOn,
    holidaysInYear: (year) => mergeHolidayLists(list.map((c) => c.holidaysInYear(year))),
    holidaysBetween: (from, to) => mergeHolidayLists(list.map((c) => c.holidaysBetween(from, to))),
  };

  const isOpen = (date: DateString): boolean =>
    combinedOpen(
      list.map((c) => c.isBusinessDay(date)),
      mode,
    );
  const info = (date: DateString): DayInfo<Kind> =>
    combinedDayInfo(
      date,
      list.map((c) => c.dayInfoOn(date)),
      mode,
    );

  parts.owner = lookup;
  Object.freeze(parts);
  return buildCalendar(lookup, isOpen, info, searchDayLimit);
}

/**
 * Options for a business calendar made from a schedule.
 * @public
 */
export interface CalendarFromScheduleOptions {
  /**
   * Maximum number of days examined when searching for a business day or a closed day (default: 3660). Beyond
   * it, a search for a business day throws a RangeError with code: "no-business-day" and a search for a closed
   * day (nextClosedDay, previousClosedDay) one with code: "no-closed-day"
   */
  readonly searchDayLimit?: number;
  /** @deprecated Renamed to searchDayLimit in 0.30.0. Removed in 1.0.0 */
  readonly maxSearchDays?: number;
}

/**
 * Creates a business calendar from a schedule: a day is a business day when `isOpen` returns true for its value.
 * @param schedule - A schedule created by createSchedule.
 * @param isOpen - Must return a boolean and depend only on the value (it is called repeatedly by searches). Checked
 *   at creation with the weekday values and the holiday value, and again at every judgement.
 * @param options - `searchDayLimit` (default 3660).
 * @returns A frozen Calendar. `reason` is the schedule reason combined with open/closed (weekday →
 *   "open-weekday"/"closed-weekday"); `name`, `holiday`, `shiftedFrom` and `optionPath` are the schedule's. Holidays,
 *   time zone and policies are the schedule's.
 * @throws RangeError `invalid-argument` when `schedule` is not a schedule, `isOpen` is not a function or returns a
 *   non-boolean; `invalid-option` for invalid options.
 * @public
 * @see decisions.md #8
 */
export function createCalendarFromSchedule<Value, Kind extends string = string>(
  schedule: Schedule<Value, Kind>,
  isOpen: (value: Value) => boolean,
  options?: CalendarFromScheduleOptions,
): Calendar<Kind> {
  // null, numbers and the like stop before the internal mark is read (reading it would fail with a TypeError)
  const info =
    typeof schedule === "object" && schedule !== null ? infoOfSchedule(schedule) : undefined;
  if (info === undefined) {
    throw rangeError("invalid-argument", "schedule must be a schedule created by createSchedule");
  }
  if (typeof isOpen !== "function") {
    throw rangeError("invalid-argument", "isOpen must be a function (value) => boolean");
  }
  // Options that are not an object are invalid-option (not silently ignored. decisions.md #8)
  const o = optionsObject(
    options,
    "createCalendarFromSchedule options",
    (v) => renameKeys("throw", ["fromSchedule"], "", v),
    false,
    "invalid-option",
  );
  const searchDayLimit = (o["searchDayLimit"] === undefined ? 3660 : o["searchDayLimit"]) as number;
  if (!Number.isInteger(searchDayLimit) || searchDayLimit < 1) {
    throw rangeError("invalid-option", "searchDayLimit must be a positive integer");
  }
  /**
   * Calls `isOpen` and checks the result.
   * @throws RangeError `invalid-argument` when it is not a boolean.
   */
  const judge = (value: Value): boolean => {
    const result: unknown = isOpen(value);
    if (typeof result !== "boolean") {
      throw rangeError(
        "invalid-argument",
        `isOpen must return a boolean, but returned ${typeof result} for a value of the schedule`,
      );
    }
    return result;
  };
  for (const value of valuesOfSchedule(schedule)) judge(value);
  // A judgement for the value only (options whose result does not depend on holidays do not throw for an
  // unconfirmed holiday; holidays are still looked up, so a year outside the supported years throws as before)
  const open = (date: DateString): boolean => judge(schedule.valueOn(date));
  return buildCalendar(
    schedule,
    open,
    (date) => {
      const day = info(date);
      // The conversion does not read `value` (open or closed is passed as `open`), so it may be treated as boolean
      return dayInfoFromScheduleDay(
        day as ScheduleDayInfo<unknown, Kind> as ScheduleDayInfo<boolean, Kind>,
        judge(day.value),
        true,
      );
    },
    searchDayLimit,
  );
}

/**
 * @deprecated Renamed to CombineCalendarsOptions in 0.30.0. Removed in 1.0.0
 * @public
 */
export type CombineOptions = CombineCalendarsOptions;

/**
 * @deprecated Renamed to BusinessDayOnOrAfterOptions in 0.30.0. Removed in 1.0.0
 * @public
 */
export type BusinessDayOptions = BusinessDayOnOrAfterOptions;
