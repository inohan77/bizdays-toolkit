/**
 * 月（"YYYY-MM"）の計算。締め日の月（closingMonth）や、n か月後の月（monthOf）。
 *
 * 営業日を考えない暦の計算なので、カレンダーなしで使える。営業日を考えた月の計算
 * （月の第 n 営業日・期日）は営業日カレンダーのメソッドにある。
 */

import { addDays, daysInMonth, formatDate, parseDate, type DateString } from "./date.ts";
import { rangeError } from "./errors.ts";

/**
 * 月を表す "YYYY-MM" 文字列。
 * @public
 */
export type MonthString = string;

const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** @internal 年と月 */
export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** @internal "YYYY-MM" を年と月に分解する（誤りは code: "invalid-month"） */
export function parseMonth(value: unknown): YearMonth {
  const m = typeof value === "string" ? MONTH_RE.exec(value) : null;
  const year = Number(m?.[1]);
  const month = Number(m?.[2]);
  if (!m || year < 1000 || month < 1 || month > 12) {
    throw rangeError("invalid-month", `Invalid month: ${JSON.stringify(value)} (expected YYYY-MM)`);
  }
  return { year, month };
}

/** @internal 年と月を "YYYY-MM" にする（年が 1000〜9999 の外なら code: "out-of-range"） */
export function formatMonth({ year, month }: YearMonth): MonthString {
  if (year < 1000 || year > 9999) {
    throw rangeError("out-of-range", `Year out of range (1000-9999): ${year}`);
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** @internal n か月後（負なら前）の年と月 */
export function shiftMonth({ year, month }: YearMonth, offset: number): YearMonth {
  const index = year * 12 + (month - 1) + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** @internal その月の d 日（その月にない日・-1 は末日に読み替える） */
export function dayOfMonth({ year, month }: YearMonth, day: number): DateString {
  const last = daysInMonth(year, month);
  return formatDate(year, month, day === -1 || day > last ? last : day);
}

/** @internal 月の日（1〜31、-1 は末日）として正しいか */
export const isDayOfMonthValue = (v: unknown): v is number =>
  v === -1 || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31);

/**
 * 日付または月の、offset か月後（負なら前）の月 "YYYY-MM"。
 *
 * @example
 * monthOf("2026-10-16"); // "2026-10"
 * monthOf("2026-10-16", 1); // "2026-11"
 * monthOf("2026-01", -1); // "2025-12"
 * @public
 */
export function monthOf(input: DateString | MonthString, offset = 0): MonthString {
  if (!Number.isInteger(offset)) {
    throw rangeError("invalid-argument", `offset must be an integer: ${offset}`);
  }
  const base: YearMonth =
    typeof input === "string" && input.split("-").length === 3
      ? parseDate(input)
      : parseMonth(input);
  return formatMonth(shiftMonth(base, offset));
}

/**
 * 締め日で区切ったときに、日付が属する月 "YYYY-MM"。
 *
 * 締め日の翌日から次の締め日までを、次の締め日の月とする（例: 20 日締めなら 10 月 21 日〜11 月 20 日が 11 月分）。
 * closingDay が -1 またはその月の日数以上なら、締め日はその月の末日（例: 31 日締めの 2 月は 28 日か 29 日締め）。
 *
 * @example
 * closingMonth("2026-10-20", 20); // "2026-10"
 * closingMonth("2026-10-21", 20); // "2026-11"
 * closingMonth("2026-10-31", -1); // "2026-10"（末日締め）
 * @public
 */
export function closingMonth(date: DateString, closingDay: number): MonthString {
  checkClosingDay(closingDay);
  const { year, month, day } = parseDate(date);
  return formatMonth(
    shiftMonth({ year, month }, day <= closingDayIn({ year, month }, closingDay) ? 0 : 1),
  );
}

/** @internal 締め日の検証（closingMonth・closingPeriod・営業日カレンダーの締め日で共用） */
export function checkClosingDay(closingDay: number): void {
  if (!isDayOfMonthValue(closingDay)) {
    throw rangeError(
      "invalid-argument",
      `closingDay must be an integer from 1 to 31, or -1 (last day): ${closingDay}`,
    );
  }
}

/** @internal その月の締め日（日）。-1 またはその月の日数以上なら末日（decisions.md の 16 番の読み替えはここだけで行う） */
export function closingDayIn({ year, month }: YearMonth, closingDay: number): number {
  const last = daysInMonth(year, month);
  return closingDay === -1 || closingDay > last ? last : closingDay;
}

/**
 * 締め日で区切ったときの、その月分の期間（両端を含む暦日）。closingMonth の逆算。
 *
 * 前月の締め日の翌日から、その月の締め日まで。月の代わりに暦日を渡すと、その日が属する期間（closingMonth で求めた月の期間）。
 * 返す値は変更できず、name は付かない（DateRange の形なので、そのまま closedDates などに渡せる）。
 *
 * @example
 * closingPeriod("2026-11", 20); // { from: "2026-10-21", to: "2026-11-20" }
 * closingPeriod("2026-10", -1); // { from: "2026-10-01", to: "2026-10-31" }（末日締め）
 * closingPeriod("2026-03", 31); // { from: "2026-03-01", to: "2026-03-31" }（2 月の 31 日締めは 2 月末日）
 * closingPeriod("2026-11-05", 20); // { from: "2026-10-21", to: "2026-11-20" }（この日が属する期間）
 * @public
 */
export function closingPeriod(
  input: DateString | MonthString,
  closingDay: number,
): { readonly from: DateString; readonly to: DateString } {
  checkClosingDay(closingDay);
  const month =
    typeof input === "string" && input.split("-").length === 3
      ? parseMonth(closingMonth(input, closingDay))
      : parseMonth(input);
  const previous = shiftMonth(month, -1);
  const to = dayOfMonth(month, closingDayIn(month, closingDay));
  const from = addDays(dayOfMonth(previous, closingDayIn(previous, closingDay)), 1);
  return Object.freeze({ from, to });
}
