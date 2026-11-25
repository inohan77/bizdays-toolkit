/**
 * A business calendar that combines holidays with the closing days of a company or shop (createCalendar), and a
 * schedule of values that vary by weekday, holiday and specific date, such as opening hours (createSchedule).
 *
 * Holidays of each country are loaded from subpaths (e.g. "bizdays-toolkit/jp", "bizdays-toolkit/uk").
 *
 * The public API is marked with TSDoc @public (stable) or @beta (may change in a minor version).
 * Public names and types are recorded in etc/api.md, and pnpm check detects unintended changes.
 */

export {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  type AdjustOptions,
  type AnnualDate,
  type AnnualRange,
  type BusinessDayConvention,
  type BusinessDayOnOrAfterOptions,
  type BusinessDayOptions,
  type Calendar,
  type CalendarOptions,
  type CalendarFromScheduleOptions,
  type CombineCalendarsOptions,
  type CombineOptions,
  type DateRange,
  type DayInfo,
  type DayReason,
  type DueDateOptions,
  type HolidayPolicy,
  type KnownDayReason,
  type SpecificDate,
} from "./core/calendar.ts";
export {
  createSchedule,
  type ScheduleAnnualRange,
  type ScheduleAnnualDate,
  type AnnualRangeValue,
  type AnnualValue,
  type DateRangeValue,
  type DateValue,
  type HolidayValueRule,
  type KnownScheduleReason,
  type OnHolidayRule,
  type RecurringValue,
  type ScheduleDay,
  type ScheduleReason,
  type BusinessDayOfMonth,
  type BusinessDayOfMonthPattern,
  type BusinessDayOfWeek,
  type BusinessDayOfWeekPattern,
  type CivilDateTimeParts,
  type CyclePattern,
  type ScheduleDateRange,
  type ScheduleSpecificDate,
  type DayAfterHolidayPattern,
  type DayBeforeHolidayPattern,
  type DayOfMonth,
  type DayOfMonthPattern,
  type EffectivePeriod,
  type HolidayLookup,
  type HolidayPattern,
  type HolidaySourceOptions,
  type ScheduleHolidayPolicy,
  type KnownScheduleDayReason,
  type Month,
  type Nth,
  type HolidayOverlapPolicy,
  type RecurringPattern,
  type RecurringRule,
  type ScheduleRecurringRule,
  type Schedule,
  type ScheduleDayInfo,
  type ScheduleOptions,
  type ScheduleDayReason,
  type WeekdayPattern,
} from "./core/schedule.ts";
export {
  addDays,
  diffDays,
  isValidDate,
  weekdayOf,
  type DateString,
  type Weekday,
} from "./core/date.ts";
export { closingMonth, closingPeriod, monthOf, type MonthString } from "./core/month.ts";
export { isBizdaysError, type ErrorCode, type KnownErrorCode } from "./core/errors.ts";
export {
  toDateString,
  toDateTimeParts,
  toInstant,
  type DateInput,
  type DateTimeInput,
  type TemporalDateLike,
  type TemporalDateTimeLike,
  type TemporalInstantLike,
} from "./core/input.ts";
export type { Holiday, HolidayProvider } from "./core/types.ts";
