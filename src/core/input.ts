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
 * これを渡すと、civilOf・toDateTimeParts の time の型が string になる。
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

// 日付と時刻の区切りは "T" だけ（型 DateTimeInput と同じ）。空白で区切った文字列は invalid-time
const DATETIME_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/i;

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

/**
 * @internal 暦日と時刻（0 時からの経過分）から、タイムゾーンでの瞬間（エポックミリ秒）を求める。
 * 夏時間の扱いは Temporal の disambiguation: "compatible" と同じ。存在しない時刻（飛び）は切り替え前のオフセットで解釈して
 * 飛んだ分だけ後ろの瞬間に、2 回ある時刻（重複）は先のほう（切り替え前のオフセット）にする。
 * Intl 以外に依存しないよう、前後 1 日のオフセットを候補にして、暦日に戻して一致するものを選ぶ
 */
export function civilToInstant(date: DateString, minutes: number, timeZone: string): number {
  const { year, month, day } = parseDate(date);
  const wall = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  const offsetAt = (ms: number): number => {
    const civil = instantToCivil(ms, timeZone);
    const c = parseDate(civil.date);
    const m = civil.minutes ?? 0; // 瞬間からの変換では時刻が必ずある
    return Date.UTC(c.year, c.month - 1, c.day, Math.floor(m / 60), m % 60) - ms;
  };
  const before = offsetAt(wall - 86_400_000);
  const after = offsetAt(wall + 86_400_000);
  const valid = (ms: number): boolean => {
    const civil = instantToCivil(ms, timeZone);
    return civil.date === date && civil.minutes === minutes;
  };
  const candidates = before === after ? [wall - before] : [wall - before, wall - after];
  const found = candidates.filter(valid);
  // 重複なら先のほう（小さいミリ秒）、飛びなら切り替え前のオフセット（before）で解釈した瞬間
  return found.length > 0 ? Math.min(...found) : wall - before;
}

/** @internal "HH:mm" または "HH:mm:ss" を 0 時からの経過秒に変換する（00:00:00〜23:59:59） */
export function parseTimeOfDaySeconds(value: unknown): number {
  const m = typeof value === "string" ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value) : null;
  const seconds = m ? Number(m[3] ?? "0") : NaN;
  if (!m || seconds > 59) {
    throw rangeError(
      "invalid-time",
      `Invalid time of day: ${JSON.stringify(value)} (expected HH:mm or HH:mm:ss)`,
    );
  }
  return wallTime(Number(m[1]), Number(m[2])) * 60 + seconds;
}

/**
 * 暦日と時刻（"HH:mm" または "HH:mm:ss"）から、タイムゾーンでのその瞬間を Date で返す（civilOf・toDateTimeParts の逆向き）。
 * 夏時間の切り替えで存在しない時刻は、飛んだ分だけ後ろの瞬間（英国の 3 月の 01:30 は 02:30 BST）、2 回ある時刻は先のほう
 * （Temporal の disambiguation: "compatible" と同じ）。
 * @public
 */
export function toInstant(date: DateString, time: string, timeZone: string): Date {
  const zone = validateTimeZone(timeZone);
  if (typeof date !== "string") throw typeError("invalid-date", `Invalid date: ${String(date)}`);
  parseDate(date);
  const seconds = parseTimeOfDaySeconds(time);
  const ms = civilToInstant(date, Math.floor(seconds / 60), zone) + (seconds % 60) * 1000;
  return new Date(ms);
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
