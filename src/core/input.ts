/**
 * 日時入力を「指定タイムゾーンでの暦日＋時刻」に変換する。
 *
 * 受け付ける入力:
 * - "YYYY-MM-DD"                     … 暦日（時刻なし）
 * - "YYYY-MM-DDTHH:mm[:ss[.sss]]"    … カレンダーのタイムゾーンでの壁時計の日時
 * - "YYYY-MM-DDTHH:mm…Z" / "+09:00"   … 瞬間（オフセット付き）。タイムゾーンで暦日に変換する
 * - Date                             … 瞬間
 * - Temporal.PlainDate / PlainDateTime / ZonedDateTime / Instant（ダックタイピング。依存は持たない）
 */

import { formatDate, parseDate, type DateString } from "./date.ts";
import { rangeError, typeError } from "./errors.ts";

/**
 * Temporal.PlainDate / PlainDateTime として受け付ける最小限の形。
 * @public
 */
export interface TemporalDateLike {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly calendarId?: string;
}

/**
 * Temporal.Instant / ZonedDateTime として受け付ける最小限の形。
 * @public
 */
export interface TemporalInstantLike {
  readonly epochMilliseconds: number;
}

/**
 * 日付・日時として受け付ける入力。
 * @public
 */
export type DateInput = string | Date | TemporalDateLike | TemporalInstantLike;

/**
 * Temporal.PlainDateTime として受け付ける最小限の形（時刻を持つ TemporalDateLike）。
 * @public
 */
export interface TemporalDateTimeLike extends TemporalDateLike {
  readonly hour: number;
  readonly minute: number;
}

/**
 * 時刻を必ず持つ入力（瞬間、Temporal.PlainDateTime、"YYYY-MM-DDTHH:mm…" の文字列）。
 * これを渡すと、civilOf・toDateTimeParts・toJapanDateTime の time の型が string になる。
 * @public
 */
export type DateTimeInput =
  | Date
  | TemporalInstantLike
  | TemporalDateTimeLike
  | `${number}-${number}-${number}T${string}`;

/**
 * タイムゾーンでの暦日と時刻。Time は時刻の型で、時刻を必ず持つ入力（DateTimeInput）では string になる。
 * @public
 */
export interface CivilDateTimeParts<Time extends string | null = string | null> {
  /** 暦日 "YYYY-MM-DD" */
  readonly date: DateString;
  /** 時刻 "HH:mm"。暦日だけの入力では null */
  readonly time: Time;
}

/** @internal 暦日と、分かる場合は 0 時からの経過分 */
export interface CivilDateTime {
  readonly date: DateString;
  /** 0 時からの経過分。暦日だけの入力では null */
  readonly minutes: number | null;
}

const DATETIME_RE =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/i;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** @internal IANA タイムゾーン名として使えるか確かめ、正規化した名前を返す（不正なら RangeError） */
export function validateTimeZone(timeZone: string): string {
  if (typeof timeZone !== "string" || timeZone === "") {
    throw rangeError("invalid-time-zone", `Invalid time zone: ${JSON.stringify(timeZone)}`);
  }
  try {
    return formatterFor(timeZone).resolvedOptions().timeZone;
  } catch {
    throw rangeError("invalid-time-zone", `Invalid time zone: ${JSON.stringify(timeZone)}`);
  }
}

/** @internal 瞬間（エポックミリ秒）を、タイムゾーンでの暦日と時刻に変換する */
export function instantToCivil(epochMilliseconds: number, timeZone: string): CivilDateTime {
  if (!Number.isFinite(epochMilliseconds)) throw rangeError("invalid-time", "Invalid instant");
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMilliseconds));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw rangeError("invalid-time-zone", `Cannot resolve ${type} in ${timeZone}`);
    return Number(p.value);
  };
  return {
    date: formatDate(get("year"), get("month"), get("day")),
    minutes: get("hour") * 60 + get("minute"),
  };
}

function wallTime(hour: number, minute: number): number {
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    throw rangeError("invalid-time", `Invalid time: ${hour}:${minute}`);
  }
  return hour * 60 + minute;
}

function parseString(value: string, timeZone: string): CivilDateTime {
  if (value.length === 10) {
    parseDate(value);
    return { date: value, minutes: null };
  }
  const m = DATETIME_RE.exec(value);
  if (!m) {
    throw rangeError(
      /^\d{4}-\d{2}-\d{2}[T ]/i.test(value) ? "invalid-time" : "invalid-date",
      `Invalid date/time string: ${JSON.stringify(value)} (expected YYYY-MM-DD or ISO 8601 date-time)`,
    );
  }
  const date = m[1]!;
  parseDate(date);
  const minutes = wallTime(Number(m[2]), Number(m[3]));
  if (m[4] !== undefined && Number(m[4]) > 59) {
    throw rangeError("invalid-time", `Invalid time: ${value}`);
  }
  const offset = m[5];
  if (offset === undefined) return { date, minutes };
  // オフセット付きは瞬間として扱う
  const normalized = value.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) {
    throw rangeError("invalid-time", `Invalid date/time string: ${JSON.stringify(value)}`);
  }
  return instantToCivil(ms, timeZone);
}

function isInstantLike(value: object): value is TemporalInstantLike {
  return typeof (value as { epochMilliseconds?: unknown }).epochMilliseconds === "number";
}

function isDateLike(value: object): value is TemporalDateLike {
  const v = value as Partial<Record<"year" | "month" | "day", unknown>>;
  return typeof v.year === "number" && typeof v.month === "number" && typeof v.day === "number";
}

/**
 * Date か（iframe や vm など、別の実行環境で作られた Date も含む）。
 * instanceof は実行環境ごとに Date が別物になるため使わない
 */
function isDate(value: unknown): value is Date {
  return Object.prototype.toString.call(value) === "[object Date]";
}

/** @internal 入力をタイムゾーンでの暦日と時刻に変換する */
export function toCivil(input: DateInput, timeZone: string): CivilDateTime {
  if (typeof input === "string") return parseString(input, timeZone);
  if (isDate(input)) return instantToCivil(Date.prototype.getTime.call(input), timeZone);
  if (typeof input === "object" && input !== null) {
    if (isInstantLike(input)) return instantToCivil(input.epochMilliseconds, timeZone);
    if (isDateLike(input)) {
      if (input.calendarId !== undefined && input.calendarId !== "iso8601") {
        throw rangeError(
          "invalid-input",
          `Unsupported calendar: ${input.calendarId} (only iso8601)`,
        );
      }
      const date = formatDate(input.year, input.month, input.day);
      if (typeof input.hour === "number") {
        return { date, minutes: wallTime(input.hour, input.minute ?? 0) };
      }
      return { date, minutes: null };
    }
  }
  throw typeError(
    "invalid-input",
    "Unsupported date input: expected a YYYY-MM-DD string, an ISO 8601 date-time string, a Date, or a Temporal object",
  );
}

/**
 * 入力を、タイムゾーンでの暦日 "YYYY-MM-DD" に変換する。
 * @public
 */
export function toDateString(input: DateInput, timeZone: string): DateString {
  return toCivil(input, validateTimeZone(timeZone)).date;
}

/**
 * 入力を、タイムゾーンでの暦日と時刻（"HH:mm"。暦日だけの入力では null）に変換する。
 * 時刻を必ず持つ入力（DateTimeInput）では、time の型が string になる。
 * @public
 */
export function toDateTimeParts(input: DateTimeInput, timeZone: string): CivilDateTimeParts<string>;
/** @public */
export function toDateTimeParts(input: DateInput, timeZone: string): CivilDateTimeParts;
export function toDateTimeParts(input: DateInput, timeZone: string): CivilDateTimeParts {
  const civil = toCivil(input, validateTimeZone(timeZone));
  const time =
    civil.minutes === null
      ? null
      : `${String(Math.floor(civil.minutes / 60)).padStart(2, "0")}:${String(civil.minutes % 60).padStart(2, "0")}`;
  return Object.freeze({ date: civil.date, time });
}

/** @internal "HH:mm" を 0 時からの経過分に変換する（00:00〜23:59） */
export function parseTimeOfDay(value: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) {
    throw rangeError(
      "invalid-time",
      `Invalid time of day: ${JSON.stringify(value)} (expected HH:mm)`,
    );
  }
  return wallTime(Number(m[1]), Number(m[2]));
}
