/**
 * 祝日と、会社・店舗の休業日を組み合わせた営業日カレンダー（createCalendar）と、
 * 曜日・祝日・特定日で変わる値（営業時間など）のスケジュール（createSchedule）。
 *
 * 国ごとの祝日はサブパスから読み込む（例: "bizdays-toolkit/jp"・"bizdays-toolkit/uk"）。
 *
 * 公開する API には TSDoc の @public（安定）または @beta（マイナー版で変わりうる）を付ける。
 * 公開する名前と型は etc/api.md に記録し、pnpm check で意図しない変化を検出する。
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
