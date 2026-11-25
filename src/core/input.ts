/**
 * Converts a date-time input to a calendar date and time in a given time zone.
 *
 * Accepted inputs:
 * - "YYYY-MM-DD"                     ... a calendar date (no time)
 * - "YYYY-MM-DDTHH:mm[:ss[.sss]]"    ... a wall-clock date-time in the calendar's time zone
 * - "YYYY-MM-DDTHH:mm...Z" / "+09:00" ... an instant (with an offset), converted to a date in the time zone
 * - Date                             ... an instant
 * - Temporal.PlainDate / PlainDateTime / ZonedDateTime / Instant (duck typing; no dependency)
 */

import { formatDate, parseDate, type DateString } from "./date.ts";
import { describeValue, rangeError, typeError } from "./errors.ts";

/**
 * The minimal shape accepted as Temporal.PlainDate / PlainDateTime.
 * @namingSource temporal
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
 * The minimal shape accepted as Temporal.Instant / ZonedDateTime.
 * @namingSource temporal
 * @public
 */
export interface TemporalInstantLike {
  readonly epochMilliseconds: number;
}

/**
 * Inputs accepted as a date or date-time.
 * @public
 */
export type DateInput = string | Date | TemporalDateLike | TemporalInstantLike;

/**
 * The minimal shape accepted as Temporal.PlainDateTime (a TemporalDateLike with a time).
 * @namingSource temporal
 * @public
 */
export interface TemporalDateTimeLike extends TemporalDateLike {
  readonly hour: number;
  readonly minute: number;
}

/**
 * Inputs that always have a time (an instant, Temporal.PlainDateTime, a "YYYY-MM-DDTHH:mm..." string).
 * With these, the type of `time` of civilOf and toDateTimeParts is string.
 * @public
 */
export type DateTimeInput =
  | Date
  | TemporalInstantLike
  | TemporalDateTimeLike
  | `${number}-${number}-${number}T${string}`;

/**
 * Calendar date and time in a time zone. `Time` is the type of the time; it is string for inputs that always
 * have a time (DateTimeInput).
 * @public
 */
export interface CivilDateTimeParts<Time extends string | null = string | null> {
  /** Calendar date "YYYY-MM-DD" */
  readonly date: DateString;
  /** Time "HH:mm"; null for a date-only input */
  readonly time: Time;
}

/** @internal A calendar date and, when known, the minutes since midnight */
export interface CivilDateTime {
  readonly date: DateString;
  /** Minutes since midnight; null for a date-only input */
  readonly minutes: number | null;
}

// Date and time are separated by "T" (the type DateTimeInput has upper case only; at run time lower-case t and z
// are accepted too. decisions.md #6). A string separated by a space is invalid-time
const DATETIME_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/i;

const formatters = new Map<string, Intl.DateTimeFormat>();
// From a spelling to the name returned by the runtime's Intl (the key is the spelling with only ASCII capitals
// lowered; name-to-name entries are stored too, to recognise a name returned by Intl). To keep spellings from
// outside from growing it without limit, it is cleared at 1,000 entries (the real names, about 600 with aliases,
// hardly ever clear it; after clearing, the next lookup asks Intl again and the result is the same.
// decisions.md #16)
const zoneNames = new Map<string, string>();
// Names in offset form (the "+09:00" form returned by Intl). Read with the UTC formatter, without a formatter of
// their own (wallParts)
const OFFSET_ZONE_RE = /^([+-])(\d\d):(\d\d)$/;

/**
 * Cached Intl.DateTimeFormat (en-US, numeric year to minute, 24-hour) for a time zone.
 * @param timeZone - A zone name as returned by Intl (callers pass only names from {@link zoneNameOf}).
 * @returns The formatter; one is created per name and kept.
 * @internal
 */
export function formatterFor(timeZone: string): Intl.DateTimeFormat {
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

/**
 * The time zone name the runtime's Intl returns for a spelling (canonical casing; aliases resolved where the runtime
 * does so).
 * @param timeZone - Any spelling.
 * @returns The Intl name. Results are cached by the spelling with ASCII letters lowercased; the cache is cleared when
 *   it reaches 1,000 entries.
 * @throws The RangeError of Intl for a spelling it does not accept.
 * @internal
 * @see decisions.md #16
 */
export function zoneNameOf(timeZone: string): string {
  // A name returned by Intl itself (a provider's name passed at every creation, a validated name passed when an
  // instant is converted to a date, ...) is returned without building a key (0.32.7; up to 0.32.6 only the
  // conversion of an instant to a date, wallParts, made this check)
  if (zoneNames.get(timeZone) === timeZone) return timeZone;
  // toLowerCase is not applied to the whole string, so that the Kelvin sign (U+212A) and the like do not become k
  const key = timeZone.replace(/[A-Z]+/g, (s) => s.toLowerCase());
  let name = zoneNames.get(key);
  if (name === undefined) {
    name = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
    if (zoneNames.size >= 1000) zoneNames.clear();
    zoneNames.set(key, name).set(name, name);
  }
  return name;
}

/**
 * Validates a time zone name and returns its normalized name.
 * @param timeZone - Expected: a non-empty string accepted by Intl (IANA name or offset form).
 * @returns The name the runtime's Intl returns.
 * @throws RangeError `invalid-time-zone` otherwise.
 * @internal
 */
export function validateTimeZone(timeZone: string): string {
  if (typeof timeZone !== "string" || timeZone === "") {
    throw rangeError("invalid-time-zone", `Invalid time zone: ${describeValue(timeZone)}`);
  }
  try {
    return zoneNameOf(timeZone);
  } catch {
    throw rangeError("invalid-time-zone", `Invalid time zone: ${describeValue(timeZone)}`);
  }
}

/**
 * Whether two normalized time zone names (results of {@link validateTimeZone}) denote the same time zone.
 * @param a - Normalized name.
 * @param b - Normalized name.
 * @returns true when the names are equal. Otherwise, with Temporal available, the result of Temporal's zone
 *   comparison (false if Temporal throws); without Temporal, false.
 * @internal
 * @see decisions.md #18
 */
export function sameTimeZone(a: string, b: string): boolean {
  if (a === b) return true;
  const T = (
    globalThis as {
      Temporal?: {
        Instant: {
          fromEpochMilliseconds(ms: number): {
            toZonedDateTimeISO(zone: string): { equals(other: unknown): boolean };
          };
        };
      };
    }
  ).Temporal;
  if (T === undefined) return false;
  try {
    const at = T.Instant.fromEpochMilliseconds(0);
    return at.toZonedDateTimeISO(a).equals(at.toZonedDateTimeISO(b)) === true;
  } catch {
    return false;
  }
}

/**
 * Removes time zones that are the same ({@link sameTimeZone}) as an earlier entry.
 * @param zones - Normalized names.
 * @returns A new array keeping the first name of each zone, in order.
 * @internal
 */
export function distinctTimeZones(zones: readonly string[]): string[] {
  const out: string[] = [];
  for (const z of zones) if (!out.some((o) => sameTimeZone(o, z))) out.push(z);
  return out;
}

/**
 * Wall-clock year, month, day, hour and minute of an instant in a time zone.
 * @param epochMilliseconds - The instant. Must not fall before year 1 (the year is read without an era).
 * @param timeZone - Any spelling Intl accepts; an offset-form zone is computed without creating a formatter.
 * @returns The parts as numbers.
 * @throws The RangeError of Intl for an unusable zone; RangeError `invalid-time-zone` when Intl returns no such part.
 * @internal
 */
export function wallParts(
  epochMilliseconds: number,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  // The offset form ("+09:00") is read by passing the instant plus the offset to the UTC formatter (no formatter
  // per offset; the offset is fixed, so the result is the same). A spelling that was not validated (when objects
  // shaped like calendars, not created by createCalendar, are combined) is also turned into the name returned by
  // Intl before reading (no formatter per spelling; the result, and the error Intl throws for an unusable
  // spelling, are the same)
  const zone = zoneNameOf(timeZone);
  const offset = OFFSET_ZONE_RE.exec(zone);
  const parts = formatterFor(offset ? "UTC" : zone).formatToParts(
    new Date(
      epochMilliseconds +
        (offset
          ? (offset[1] === "-" ? -60_000 : 60_000) * (Number(offset[2]) * 60 + Number(offset[3]))
          : 0),
    ),
  );
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw rangeError("invalid-time-zone", `Cannot resolve ${type} in ${timeZone}`);
    return Number(p.value);
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/**
 * Converts an instant to the calendar date and time of day in a time zone.
 * @param epochMilliseconds - The instant.
 * @param timeZone - A valid time zone.
 * @returns `{ date, minutes }` with minutes since midnight (seconds are dropped).
 * @throws RangeError `invalid-time` when not finite; `out-of-range` when the local date is outside the years
 *   1000-9999.
 * @internal
 * @see decisions.md #1
 */
export function instantToCivil(epochMilliseconds: number, timeZone: string): CivilDateTime {
  if (!Number.isFinite(epochMilliseconds)) throw rangeError("invalid-time", "Invalid instant");
  // Outside the range a Date can represent (±8.64e15 ms) the year cannot be read: stop before formatting
  if (Math.abs(epochMilliseconds) > 8.64e15) {
    throw rangeError("out-of-range", "Instant out of range (1000-9999)");
  }
  // Intl returns a year BC as a positive number without an era, so the range is checked with the UTC year before
  // formatting (decisions.md #1). An offset is less than a day: a UTC year before 999 is before 1000 in the time
  // zone too. Year 999 passes because it can be year 1000 in an eastern zone. The upper side likewise: a UTC year
  // after 10000 is after 9999 in the time zone too, and 10000 passes because it can be 9999 in a western zone
  // (an offset-form zone formats the instant plus the offset, so this stops first, before the sum can leave the
  // range of Date near its upper limit)
  const utcYear = new Date(epochMilliseconds).getUTCFullYear();
  if (utcYear < 999 || utcYear > 10000) {
    throw rangeError("out-of-range", "Instant out of range (1000-9999)");
  }
  const { year, month, day, hour, minute } = wallParts(epochMilliseconds, timeZone);
  return { date: formatDate(year, month, day), minutes: hour * 60 + minute };
}

/**
 * Validates an hour and a minute.
 * @param hour - Expected: integer 0-23.
 * @param minute - Expected: integer 0-59.
 * @returns Minutes since midnight.
 * @throws RangeError `invalid-time` otherwise.
 * @internal
 */
export function wallTime(hour: number, minute: number): number {
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    // Shown with two digits as written ("24:00", not "24:0"). A value that is not a number (a Temporal-shaped
    // minute, ...) is shown with describeValue (so that building the message does not fail for a value that
    // cannot become a string. decisions.md #3)
    const two = (v: unknown): string =>
      typeof v === "number" ? String(v).padStart(2, "0") : describeValue(v);
    throw rangeError("invalid-time", `Invalid time: ${two(hour)}:${two(minute)}`);
  }
  return hour * 60 + minute;
}

/**
 * Parses a date or date-time string.
 * @param value - "YYYY-MM-DD" (exactly 10 characters), or "YYYY-MM-DDTHH:mm[:ss[.fraction]]" with an optional offset
 *   ("Z", "+09:00", "+0900"); "T" and "Z" may be lower case.
 * @param timeZone - A valid time zone, used only for a string with an offset.
 * @returns A date without time: `minutes` null. A date-time without offset: that wall-clock date and time. With an
 *   offset: the instant converted to `timeZone`.
 * @throws RangeError `invalid-date` for a malformed or non-existent date; `invalid-time` for a malformed or
 *   out-of-range time or offset (including a space instead of "T"); `out-of-range` when an instant falls outside the
 *   years 1000-9999.
 * @internal
 * @see decisions.md #6
 */
export function parseString(value: string, timeZone: string): CivilDateTime {
  if (value.length === 10) {
    parseDate(value);
    return { date: value, minutes: null };
  }
  const m = DATETIME_RE.exec(value);
  if (!m) {
    throw rangeError(
      /^\d{4}-\d{2}-\d{2}[T ]/i.test(value) ? "invalid-time" : "invalid-date",
      `Invalid date/time string: ${describeValue(value)} (expected YYYY-MM-DD or ISO 8601 date-time)`,
    );
  }
  const date = m[1]!;
  const { year, month, day } = parseDate(date);
  const minutes = wallTime(Number(m[2]), Number(m[3]));
  if (m[4] !== undefined && Number(m[4]) > 59) {
    throw rangeError("invalid-time", `Invalid date/time string: ${describeValue(value)}`);
  }
  const offset = m[6];
  if (offset === undefined) return { date, minutes };
  // With an offset it is an instant. The instant is computed from the extracted values, not with Date.parse
  // (ECMAScript defines the reading only for upper-case T and Z and 3 fraction digits; lower case and 9 fraction
  // digits differ by runtime, and Firefox and Safari cannot read lower case).
  // The offset (0 for Z): hours up to 23 and minutes up to 59 (as Date.parse in earlier versions; otherwise
  // invalid-time)
  const [, hh = "0", mm = "0"] = /(\d\d):?(\d\d)$/.exec(offset) ?? [];
  if (+hh > 23 || +mm > 59)
    throw rangeError("invalid-time", `Invalid date/time string: ${describeValue(value)}`);
  const ms =
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      minutes,
      +(m[4] ?? 0),
      +(m[5] ?? "0").padEnd(3, "0").slice(0, 3),
    ) -
    (offset[0] === "-" ? -1 : 1) * (+hh * 60 + +mm) * 60_000;
  return instantToCivil(ms, timeZone);
}

/**
 * Whether an object has a numeric `epochMilliseconds` (Temporal.Instant or ZonedDateTime shape).
 * @internal
 */
export function isInstantLike(value: object): value is TemporalInstantLike {
  return typeof (value as { epochMilliseconds?: unknown }).epochMilliseconds === "number";
}

/**
 * Whether an object has numeric `year`, `month` and `day` (Temporal.PlainDate or PlainDateTime shape).
 * @internal
 */
export function isDateLike(value: object): value is TemporalDateLike {
  const v = value as Partial<Record<"year" | "month" | "day", unknown>>;
  return typeof v.year === "number" && typeof v.month === "number" && typeof v.day === "number";
}

/**
 * Whether a value is a Date, including one created in another realm (checked by its Object.prototype.toString tag,
 * not instanceof).
 */
export function isDate(value: unknown): value is Date {
  return Object.prototype.toString.call(value) === "[object Date]";
}

/**
 * Converts any accepted date input to a calendar date and, when the input has one, a time of day in a time zone.
 * @param input - A string ({@link parseString}), a Date, an object with `epochMilliseconds`, or an object with
 *   `year`, `month`, `day` and optionally `hour`, `minute`. Checked in this order.
 * @param timeZone - A valid time zone.
 * @returns `{ date, minutes }`; `minutes` is null for a date-only input (a date-like object without `hour`, even if
 *   it has `minute`).
 * @throws TypeError `invalid-input` for any other value or a `calendarId` other than "iso8601"; RangeError
 *   `invalid-date` (including a year outside 1000-9999 in a date-like object), `invalid-time` or `out-of-range` as
 *   for the input kind.
 * @internal
 * @see decisions.md #1, #3, #6
 */
export function toCivil(input: DateInput, timeZone: string): CivilDateTime {
  if (typeof input === "string") return parseString(input, timeZone);
  if (isDate(input)) return instantToCivil(Date.prototype.getTime.call(input), timeZone);
  if (typeof input === "object" && input !== null) {
    if (isInstantLike(input)) return instantToCivil(input.epochMilliseconds, timeZone);
    if (isDateLike(input)) {
      if (input.calendarId !== undefined && input.calendarId !== "iso8601") {
        // invalid-input is a TypeError as on the other paths (decisions.md #3)
        throw typeError(
          "invalid-input",
          `Unsupported calendar: ${describeValue(input.calendarId)} (only iso8601)`,
        );
      }
      // A wrong year that was passed is invalid-date, as for a date string (not the out-of-range of a
      // calculation that left the range. decisions.md #1)
      if (!Number.isInteger(input.year) || input.year < 1000 || input.year > 9999) {
        throw rangeError(
          "invalid-date",
          `Invalid date: year must be an integer from 1000 to 9999: ${describeValue(input.year)}`,
        );
      }
      const date = formatDate(input.year, input.month, input.day);
      // A shape with an hour has a time. An hour that is null, a string, ... is invalid-time like the minute
      // (null is a wrong value, not omission. decisions.md #6). A shape with a minute but no hour is read as a
      // calendar date (the type allows it; a real PlainDate has neither)
      if (input.hour !== undefined) {
        return {
          date,
          minutes: wallTime(input.hour, input.minute === undefined ? 0 : input.minute),
        };
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
 * Converts a date input to the calendar date "YYYY-MM-DD" in a time zone.
 * @param input - A date string, a date-time string, a Date, or a Temporal-like object.
 * @param timeZone - IANA time zone name.
 * @returns "YYYY-MM-DD".
 * @throws RangeError `invalid-time-zone`, `invalid-date`, `invalid-time`, `out-of-range`; TypeError `invalid-input`.
 * @public
 */
export function toDateString(input: DateInput, timeZone: string): DateString {
  return toCivil(input, validateTimeZone(timeZone)).date;
}

/**
 * Converts a date input to the calendar date and time "HH:mm" in a time zone.
 * @param input - A date string, a date-time string, a Date, or a Temporal-like object.
 * @param timeZone - IANA time zone name.
 * @returns A frozen `{ date, time }`; `time` is null for a date-only input (typed as string for a DateTimeInput).
 * @throws RangeError `invalid-time-zone`, `invalid-date`, `invalid-time`, `out-of-range`; TypeError `invalid-input`.
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
 * The instant (epoch milliseconds) of a calendar date and time of day in a time zone.
 * @param date - "YYYY-MM-DD".
 * @param minutes - Minutes since midnight, 0-1439.
 * @param timeZone - A valid time zone.
 * @returns The instant. A time skipped by a DST change is read with the offset before the change (so it lands later
 *   by the gap); a time that occurs twice gives the earlier instant (Temporal's "compatible"). Offsets are handled to
 *   the minute.
 * @internal
 */
export function civilToInstant(date: DateString, minutes: number, timeZone: string): number {
  const { year, month, day } = parseDate(date);
  const wall = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  // One day before or after does not go back to BC (not before the end of year 999), so the year of wallParts
  // can be used as it is
  const offsetAt = (ms: number): number => {
    const w = wallParts(ms, timeZone);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - ms;
  };
  const before = offsetAt(wall - 86_400_000);
  const after = offsetAt(wall + 86_400_000);
  const valid = (ms: number): boolean => {
    const civil = instantToCivil(ms, timeZone);
    return civil.date === date && civil.minutes === minutes;
  };
  const candidates = before === after ? [wall - before] : [wall - before, wall - after];
  const found = candidates.filter(valid);
  // In an overlap the earlier instant (smaller milliseconds); in a gap the instant read with the offset before
  // the transition (before)
  return found.length > 0 ? Math.min(...found) : wall - before;
}

/**
 * Parses a time of day.
 * @param value - Expected: "HH:mm" or "HH:mm:ss", 00:00:00 to 23:59:59.
 * @returns Seconds since midnight.
 * @throws RangeError `invalid-time` otherwise, including non-strings.
 * @internal
 */
export function parseTimeOfDaySeconds(value: unknown): number {
  const m = typeof value === "string" ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value) : null;
  const seconds = m ? Number(m[3] ?? "0") : NaN;
  if (!m || seconds > 59) {
    throw rangeError(
      "invalid-time",
      `Invalid time of day: ${describeValue(value)} (expected HH:mm or HH:mm:ss)`,
    );
  }
  return wallTime(Number(m[1]), Number(m[2])) * 60 + seconds;
}

/**
 * The instant of a calendar date and a time of day in a time zone, as a Date. Inverse of civilOf / toDateTimeParts.
 * @param date - "YYYY-MM-DD".
 * @param time - "HH:mm" or "HH:mm:ss".
 * @param timeZone - IANA time zone name.
 * @returns A Date. A time skipped by a DST change maps to the instant later by the gap (01:30 in March in the UK is
 *   02:30 BST); a time that occurs twice maps to the earlier instant (Temporal's "compatible"). Offsets are handled
 *   to the minute: where the offset is not a whole number of minutes the result can be off by up to 59 seconds.
 * @throws RangeError `invalid-time-zone`, `invalid-date`, `invalid-time`.
 * @public
 */
export function toInstant(date: DateString, time: string, timeZone: string): Date {
  const zone = validateTimeZone(timeZone);
  if (typeof date !== "string")
    throw rangeError("invalid-date", `Invalid date: ${describeValue(date)}`);
  parseDate(date);
  const seconds = parseTimeOfDaySeconds(time);
  const ms = civilToInstant(date, Math.floor(seconds / 60), zone) + (seconds % 60) * 1000;
  return new Date(ms);
}
