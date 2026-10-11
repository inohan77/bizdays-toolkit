/**
 * 祝日と、会社・店舗の休業日を組み合わせた営業日カレンダー。
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
  type DateInput,
  type TemporalDateLike,
  type TemporalInstantLike,
} from "./core/input.ts";
export type { Holiday, HolidayProvider } from "./core/types.ts";
