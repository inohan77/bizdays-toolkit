/**
 * 祝日の提供元（HolidayProvider）を実装する人向けの暦の計算（bizdays-toolkit/provider）。
 *
 * 多くの国・地域の祝日は「月の第 n 何曜日」（米国の連邦祝日など）と「復活祭からの日数」（ヨーロッパの多くの国）で
 * 書ける。この 2 種類の計算と、月の日数・うるう年の判定を、ライブラリ内部で使っている実装のまま公開する
 * （復活祭の計算は英国の祝日で GOV.UK のデータと照合済み）。ルートの addDays・weekdayOf と組み合わせて使う。
 * 同梱の提供元の実装とは別に、アプリの本体に不要なものが入らないようサブパスに分けている。
 *
 * 公開する関数は @beta（マイナー版で変わりうる）。使われ方が固まったら @public にする。
 */

import {
  daysInMonth as daysInMonthOf,
  easterSunday as easterSundayOf,
  formatDate,
  isLeapYear as isLeapYearOf,
  nthWeekdayOfMonth as nthWeekdayOfMonthIn,
  weekdayOf,
  type DateString,
  type Weekday,
} from "../core/date.ts";
import { rangeError } from "../core/errors.ts";

function checkYear(year: unknown): asserts year is number {
  if (!Number.isInteger(year) || (year as number) < 1000 || (year as number) > 9999) {
    throw rangeError(
      "invalid-argument",
      `year must be an integer from 1000 to 9999: ${String(year)}`,
    );
  }
}

function checkMonth(month: unknown): asserts month is number {
  if (!Number.isInteger(month) || (month as number) < 1 || (month as number) > 12) {
    throw rangeError("invalid-argument", `month must be an integer from 1 to 12: ${String(month)}`);
  }
}

/**
 * 復活祭の日曜日（グレゴリオ暦）。Good Friday は −2 日、Easter Monday は +1 日、Ascension は +39 日、
 * Whit Monday は +50 日、Corpus Christi は +60 日（ルートの addDays で求める）。
 * 年は 1000〜9999 の整数（それ以外は invalid-argument）。
 * @beta
 */
export function easterSunday(year: number): DateString {
  checkYear(year);
  return easterSundayOf(year);
}

/**
 * その月の第 n 何曜日（n は 1〜5、-1 は最後。曜日は 0 = 日曜日〜6 = 土曜日）。
 * 例: 1 月の第 3 月曜日は nthWeekdayOfMonth(2026, 1, 1, 3)、5 月の最終月曜日は nthWeekdayOfMonth(2026, 5, 1, -1)。
 * その月に n 回目のその曜日がないとき（第 5 回目）は invalid-argument。
 * @beta
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  n: number,
): DateString {
  checkYear(year);
  checkMonth(month);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw rangeError(
      "invalid-weekday",
      `weekday must be an integer from 0 (Sunday) to 6 (Saturday): ${String(weekday)}`,
    );
  }
  if (!Number.isInteger(n) || n === 0 || n < -1 || n > 5) {
    throw rangeError(
      "invalid-argument",
      `n must be an integer from 1 to 5, or -1 (last): ${String(n)}`,
    );
  }
  const days = daysInMonthOf(year, month);
  if (n === -1) {
    const last = formatDate(year, month, days);
    const offset = (weekdayOf(last) - weekday + 7) % 7;
    return formatDate(year, month, days - offset);
  }
  const first = ((weekday - weekdayOf(formatDate(year, month, 1)) + 7) % 7) + 1;
  if (first + (n - 1) * 7 > days) {
    throw rangeError(
      "invalid-argument",
      `${year}-${String(month).padStart(2, "0")} has no ${n}th weekday ${weekday}`,
    );
  }
  return nthWeekdayOfMonthIn(year, month, weekday, n);
}

/**
 * その月の日数（28〜31）。
 * @beta
 */
export function daysInMonth(year: number, month: number): number {
  checkYear(year);
  checkMonth(month);
  return daysInMonthOf(year, month);
}

/**
 * うるう年か（グレゴリオ暦）。
 * @beta
 */
export function isLeapYear(year: number): boolean {
  checkYear(year);
  return isLeapYearOf(year);
}
