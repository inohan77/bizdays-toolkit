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
  type BusinessDayOptions,
  type Calendar,
  type CalendarOptions,
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
  type AnnualRangeValue,
  type AnnualValue,
  type CivilDateTimeParts,
  type DateRangeValue,
  type DateValue,
  type DayAfterHolidayPattern,
  type DayOfMonth,
  type DayOfMonthPattern,
  type EffectivePeriod,
  type HolidayLookup,
  type HolidayPattern,
  type HolidaySourceOptions,
  type HolidayValueRule,
  type KnownScheduleReason,
  type Month,
  type Nth,
  type OnHolidayRule,
  type RecurringPattern,
  type RecurringRule,
  type RecurringValue,
  type Schedule,
  type ScheduleDay,
  type ScheduleOptions,
  type ScheduleReason,
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
export { closingMonth, monthOf, type MonthString } from "./core/month.ts";
export { isBizdaysError, type ErrorCode, type KnownErrorCode } from "./core/errors.ts";
export {
  toDateString,
  toDateTimeParts,
  type DateInput,
  type DateTimeInput,
  type TemporalDateLike,
  type TemporalDateTimeLike,
  type TemporalInstantLike,
} from "./core/input.ts";
export type { Holiday, HolidayProvider } from "./core/types.ts";
