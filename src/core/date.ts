/**
 * 暦日（タイムゾーンを持たない日付）の計算。
 *
 * 日付は常に "YYYY-MM-DD" 文字列で扱い、内部では 1970-01-01 からの日数（day number）に
 * 変換して計算する。Date オブジェクトのローカル時刻は使わない。
 */

/** 暦日を表す "YYYY-MM-DD" 文字列 */
export type DateString = string;

/** 曜日（0 = 日曜日 … 6 = 土曜日。Date#getDay と同じ） */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** 年月日に分解する。形式または暦として不正なら RangeError */
export function parseDate(value: string): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(value);
  if (!m) {
    throw new RangeError(`Invalid date string: ${JSON.stringify(value)} (expected YYYY-MM-DD)`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Invalid date: ${value}`);
  }
  return { year, month, day };
}

/** "YYYY-MM-DD" として正しい暦日か */
export function isValidDate(value: unknown): value is DateString {
  if (typeof value !== "string") return false;
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

/** 年月日から "YYYY-MM-DD" を作る（範囲外なら RangeError） */
export function formatDate(year: number, month: number, day: number): DateString {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError(`Year out of range (1000-9999): ${year}`);
  }
  const s = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  parseDate(s);
  return s;
}

/** うるう年か */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** その月の日数 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const days = MONTH_DAYS[month - 1];
  if (days === undefined) throw new RangeError(`Invalid month: ${month}`);
  return days;
}

/** 1970-01-01 からの日数 */
export function toDayNumber(date: DateString): number {
  const { year, month, day } = parseDate(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/** 1970-01-01 からの日数を "YYYY-MM-DD" に戻す */
export function fromDayNumber(dayNumber: number): DateString {
  const d = new Date(dayNumber * MS_PER_DAY);
  return formatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** n 日後（負なら前）の日付 */
export function addDays(date: DateString, days: number): DateString {
  if (!Number.isInteger(days)) throw new RangeError(`days must be an integer: ${days}`);
  return fromDayNumber(toDayNumber(date) + days);
}

/** from から to までの日数（to が後なら正） */
export function diffDays(from: DateString, to: DateString): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** 曜日（0 = 日曜日） */
export function weekdayOf(date: DateString): Weekday {
  // 1970-01-01 は木曜日（4）
  return ((((toDayNumber(date) + 4) % 7) + 7) % 7) as Weekday;
}

/** その月の第 n 何曜日（n は 1 始まり） */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  n: number,
): DateString {
  const offset = (weekday - weekdayOf(formatDate(year, month, 1)) + 7) % 7;
  return formatDate(year, month, 1 + offset + (n - 1) * 7);
}
