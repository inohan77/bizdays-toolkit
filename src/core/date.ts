/**
 * 暦日（タイムゾーンを持たない日付）の計算。
 *
 * 日付は常に "YYYY-MM-DD" 文字列で扱い、内部では 1970-01-01 からの日数（day number）に
 * 変換して計算する。Date オブジェクトのローカル時刻は使わない。
 */

import { rangeError } from "./errors.ts";

/**
 * 暦日を表す "YYYY-MM-DD" 文字列。
 * @public
 */
export type DateString = string;

/**
 * 曜日（0 = 日曜日 … 6 = 土曜日。Date#getDay と同じ）。
 * @public
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** 年月日に分解する。形式または暦として不正なら RangeError */
export function parseDate(value: string): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(value);
  if (!m) {
    throw rangeError(
      "invalid-date",
      `Invalid date string: ${JSON.stringify(value)} (expected YYYY-MM-DD)`,
    );
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw rangeError("invalid-date", `Invalid date: ${value}`);
  }
  return { year, month, day };
}

/**
 * "YYYY-MM-DD" として正しい暦日か。
 * @public
 */
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
    throw rangeError("out-of-range", `Year out of range (1000-9999): ${year}`);
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
  if (days === undefined) throw rangeError("invalid-date", `Invalid month: ${month}`);
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

/**
 * n 日後（負なら前）の日付。
 * @public
 */
export function addDays(date: DateString, days: number): DateString {
  if (!Number.isInteger(days)) {
    throw rangeError("invalid-argument", `days must be an integer: ${days}`);
  }
  return fromDayNumber(toDayNumber(date) + days);
}

/**
 * from から to までの日数（to が後なら正）。
 * @public
 */
export function diffDays(from: DateString, to: DateString): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * 曜日（0 = 日曜日）。
 * @public
 */
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

/**
 * 復活祭の日曜日（グレゴリオ暦。Anonymous Gregorian algorithm）。英国の祝日の計算に使い、提供元の実装者向けに
 * bizdays-toolkit/provider からも公開する（入力の検証はそちらで行う）
 */
export function easterSunday(year: number): DateString {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatDate(year, month, day);
}
