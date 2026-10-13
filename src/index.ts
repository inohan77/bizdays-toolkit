/**
 * 祝日と、会社・店舗の休業日を組み合わせた営業日カレンダー（createCalendar）と、
 * 曜日・祝日・特定日で変わる値（営業時間など）のスケジュール（createSchedule）。
 *
 * 国ごとの祝日はサブパスから読み込む（例: "bizdays-toolkit/jp"）。
 */

export {
  createCalendar,
  type AnnualDate,
  type AnnualRange,
  type BusinessDayOptions,
  type Calendar,
  type CalendarOptions,
  type DateRange,
  type DayInfo,
  type DayReason,
  type HolidayPolicy,
  type SpecificDate,
} from "./core/calendar.ts";
export {
  createSchedule,
  type AnnualRangeValue,
  type AnnualValue,
  type CivilDateTimeParts,
  type DateRangeValue,
  type DateValue,
  type HolidayLookup,
  type HolidayRule,
  type HolidaySourceOptions,
  type Schedule,
  type ScheduleDay,
  type ScheduleOptions,
  type ScheduleReason,
} from "./core/schedule.ts";
export {
  addDays,
  diffDays,
  isValidDate,
  nthWeekdayOfMonth,
  weekdayOf,
  type DateString,
  type Weekday,
} from "./core/date.ts";
export {
  toDateString,
  toDateTimeParts,
  type DateInput,
  type TemporalDateLike,
  type TemporalInstantLike,
} from "./core/input.ts";
export type { Holiday, HolidayProvider } from "./core/types.ts";
