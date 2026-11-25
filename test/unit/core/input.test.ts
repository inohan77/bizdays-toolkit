// Unit tests of src/core/input.ts. One describe per function, named after the function; each test is one
// statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runInNewContext } from "node:vm";
import {
  civilToInstant,
  distinctTimeZones,
  formatterFor,
  instantToCivil,
  isDate,
  isDateLike,
  isInstantLike,
  parseString,
  parseTimeOfDaySeconds,
  sameTimeZone,
  toCivil,
  toDateString,
  toDateTimeParts,
  toInstant,
  validateTimeZone,
  wallParts,
  wallTime,
  zoneNameOf,
} from "../../../src/core/input.ts";

const TOKYO = "Asia/Tokyo";
const LONDON = "Europe/London";

/** Runs `fn` with globalThis.Temporal replaced (undefined: a runtime without Temporal) */
function withTemporal<T>(temporal: unknown, fn: () => T): T {
  const g = globalThis as { Temporal?: unknown };
  const had = "Temporal" in g;
  const saved = g.Temporal;
  g.Temporal = temporal;
  try {
    return fn();
  } finally {
    if (had) g.Temporal = saved;
    else delete g.Temporal;
  }
}
/** A stand-in for Temporal whose zone comparison is `equal` (called with the two zone names) */
const temporal = (equal: (a: string, b: string) => unknown) => ({
  Instant: {
    fromEpochMilliseconds: () => ({
      toZonedDateTimeISO: (zone: string) => ({
        zone,
        equals: (other: { zone: string }) => equal(zone, other.zone),
      }),
    }),
  },
});

describe("formatterFor", () => {
  test("a formatter of the zone that reads year to minute in 24-hour form", () => {
    const parts = formatterFor(TOKYO).formatToParts(new Date(Date.UTC(2026, 0, 5, 15, 7)));
    const get = (type: string): number => Number(parts.find((p) => p.type === type)!.value);
    assert.deepEqual(["year", "month", "day", "hour", "minute"].map(get), [2026, 1, 6, 0, 7]);
  });
  test("one formatter per name, kept", () => {
    assert.equal(formatterFor(LONDON), formatterFor(LONDON));
    assert.notEqual(formatterFor(LONDON), formatterFor(TOKYO));
  });
});

describe("zoneNameOf", () => {
  test("the name Intl returns, whatever the casing of the spelling", () => {
    assert.equal(zoneNameOf("Asia/Tokyo"), "Asia/Tokyo");
    assert.equal(zoneNameOf("ASIA/TOKYO"), "Asia/Tokyo");
    assert.equal(zoneNameOf("asia/tokyo"), "Asia/Tokyo");
    assert.equal(zoneNameOf("+09:00"), "+09:00");
  });
  test("a name Intl returned is returned as it is", () => {
    const name = zoneNameOf("europe/paris");
    assert.equal(zoneNameOf(name), name);
  });
  test("the RangeError of Intl for a spelling it does not accept", () => {
    assert.throws(() => zoneNameOf("Mars/Olympus"), RangeError);
    assert.throws(() => zoneNameOf("Asia/Tokyo "), RangeError);
  });
  test("the cache is cleared at 1,000 entries, and the results stay the same", () => {
    const offsets: string[] = [];
    for (let h = 0; h < 18; h++)
      for (let m = 0; m < 60; m++)
        offsets.push(`+${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    assert.ok(offsets.length > 1000);
    for (const offset of offsets) assert.equal(zoneNameOf(offset), offset);
    assert.equal(zoneNameOf("ASIA/TOKYO"), "Asia/Tokyo");
    assert.equal(zoneNameOf("+00:00"), "+00:00");
  });
});

describe("validateTimeZone", () => {
  test("the normalized name of a time zone Intl accepts", () => {
    assert.equal(validateTimeZone("asia/tokyo"), "Asia/Tokyo");
    assert.equal(validateTimeZone("UTC"), "UTC");
    assert.equal(validateTimeZone("+09:00"), "+09:00");
  });
  test("invalid-time-zone for an empty string and for values that are not strings", () => {
    for (const zone of ["", 9, null, undefined, {}, Symbol("x")])
      assert.throws(() => validateTimeZone(zone as never), {
        name: "RangeError",
        code: "invalid-time-zone",
      });
  });
  test("invalid-time-zone for a name Intl does not accept", () => {
    assert.throws(() => validateTimeZone("Mars/Olympus"), {
      name: "RangeError",
      code: "invalid-time-zone",
    });
    assert.throws(() => validateTimeZone("JST+9"), { code: "invalid-time-zone" });
  });
});

describe("sameTimeZone", () => {
  test("true for equal names, without asking Temporal", () => {
    const never = temporal(() => assert.fail("Temporal was asked"));
    assert.equal(
      withTemporal(never, () => sameTimeZone(TOKYO, TOKYO)),
      true,
    );
  });
  test("without Temporal: false for different names", () => {
    assert.equal(
      withTemporal(undefined, () => sameTimeZone("Asia/Calcutta", "Asia/Kolkata")),
      false,
    );
  });
  test("with Temporal: the result of its zone comparison", () => {
    const pairs: string[] = [];
    const same = temporal((a, b) => {
      pairs.push(`${a}=${b}`);
      return true;
    });
    assert.equal(
      withTemporal(same, () => sameTimeZone("Asia/Calcutta", "Asia/Kolkata")),
      true,
    );
    assert.deepEqual(pairs, ["Asia/Calcutta=Asia/Kolkata"]);
    assert.equal(
      withTemporal(
        temporal(() => false),
        () => sameTimeZone(TOKYO, LONDON),
      ),
      false,
    );
  });
  test("with Temporal: only the boolean true counts", () => {
    assert.equal(
      withTemporal(
        temporal(() => 1),
        () => sameTimeZone(TOKYO, LONDON),
      ),
      false,
    );
  });
  test("false when Temporal throws, also for a Temporal of another shape", () => {
    const throwing = temporal(() => {
      throw new RangeError("no");
    });
    assert.equal(
      withTemporal(throwing, () => sameTimeZone(TOKYO, LONDON)),
      false,
    );
    assert.equal(
      withTemporal({}, () => sameTimeZone(TOKYO, LONDON)),
      false,
    );
  });
});

describe("distinctTimeZones", () => {
  test("keeps the first name of each zone, in order, in a new array", () => {
    const zones = [TOKYO, "UTC", TOKYO, LONDON, "UTC"];
    const out = withTemporal(undefined, () => distinctTimeZones(zones));
    assert.deepEqual(out, [TOKYO, "UTC", LONDON]);
    assert.notEqual(out, zones);
    assert.deepEqual(distinctTimeZones([]), []);
  });
  test("names that Temporal calls the same zone are one zone", () => {
    const aliases = temporal((a, b) => a.endsWith("lcutta") && b.endsWith("olkata"));
    assert.deepEqual(
      withTemporal(aliases, () => distinctTimeZones(["Asia/Calcutta", "Asia/Kolkata", "UTC"])),
      ["Asia/Calcutta", "UTC"],
    );
  });
});

describe("wallParts", () => {
  test("the wall-clock parts of an instant in a named zone", () => {
    assert.deepEqual(wallParts(0, TOKYO), { year: 1970, month: 1, day: 1, hour: 9, minute: 0 });
    assert.deepEqual(wallParts(Date.UTC(2026, 6, 1, 23, 45), LONDON), {
      year: 2026,
      month: 7,
      day: 2,
      hour: 0,
      minute: 45,
    });
  });
  test("an offset-form zone, east and west", () => {
    assert.deepEqual(wallParts(0, "+09:00"), { year: 1970, month: 1, day: 1, hour: 9, minute: 0 });
    assert.deepEqual(wallParts(0, "-05:30"), {
      year: 1969,
      month: 12,
      day: 31,
      hour: 18,
      minute: 30,
    });
  });
  test("a spelling that was not normalized is read as its zone", () => {
    assert.deepEqual(wallParts(0, "asia/tokyo"), wallParts(0, TOKYO));
  });
  test("the RangeError of Intl for an unusable zone", () => {
    assert.throws(() => wallParts(0, "Mars/Olympus"), RangeError);
  });
  test("invalid-time-zone when Intl returns no such part", () => {
    const formatter = formatterFor("UTC");
    const original = formatter.formatToParts.bind(formatter);
    formatter.formatToParts = (date?: Date | number) =>
      original(date).filter((p) => p.type !== "hour");
    try {
      assert.throws(() => wallParts(0, "UTC"), { name: "RangeError", code: "invalid-time-zone" });
    } finally {
      delete (formatter as { formatToParts?: unknown }).formatToParts;
    }
    assert.deepEqual(wallParts(0, "UTC"), { year: 1970, month: 1, day: 1, hour: 0, minute: 0 });
  });
});

describe("instantToCivil", () => {
  test("the calendar date and the minutes since midnight in the zone; seconds are dropped", () => {
    assert.deepEqual(instantToCivil(Date.UTC(2026, 0, 1, 15, 0, 59, 999), TOKYO), {
      date: "2026-01-02",
      minutes: 0,
    });
    assert.deepEqual(instantToCivil(Date.UTC(2026, 0, 1, 14, 59), TOKYO), {
      date: "2026-01-01",
      minutes: 1439,
    });
  });
  test("invalid-time when not finite", () => {
    for (const ms of [Number.NaN, Infinity, -Infinity])
      assert.throws(() => instantToCivil(ms, "UTC"), { name: "RangeError", code: "invalid-time" });
  });
  test("out-of-range beyond what a Date can represent", () => {
    assert.throws(() => instantToCivil(8.64e15 + 1, "UTC"), {
      name: "RangeError",
      code: "out-of-range",
    });
    assert.throws(() => instantToCivil(-8.64e15 - 1, "UTC"), { code: "out-of-range" });
  });
  test("out-of-range when the local date is outside the years 1000-9999", () => {
    assert.throws(() => instantToCivil(Date.UTC(998, 5, 1), "UTC"), { code: "out-of-range" });
    assert.throws(() => instantToCivil(Date.UTC(10001, 0, 1), "UTC"), { code: "out-of-range" });
    assert.throws(() => instantToCivil(Date.UTC(999, 11, 31, 23, 59), "UTC"), {
      code: "out-of-range",
    });
    assert.throws(() => instantToCivil(Date.UTC(10000, 0, 1), "UTC"), { code: "out-of-range" });
  });
  test("the first and the last minute of the range, and a UTC year 999 or 10000 that is inside in the zone", () => {
    assert.deepEqual(instantToCivil(Date.UTC(1000, 0, 1), "UTC"), {
      date: "1000-01-01",
      minutes: 0,
    });
    assert.deepEqual(instantToCivil(Date.UTC(9999, 11, 31, 23, 59), "UTC"), {
      date: "9999-12-31",
      minutes: 1439,
    });
    assert.equal(instantToCivil(Date.UTC(999, 11, 31, 20), "+09:00").date, "1000-01-01");
    assert.equal(instantToCivil(Date.UTC(10000, 0, 1, 3), "-05:00").date, "9999-12-31");
  });
});

describe("wallTime", () => {
  test("minutes since midnight", () => {
    assert.equal(wallTime(0, 0), 0);
    assert.equal(wallTime(9, 30), 570);
    assert.equal(wallTime(23, 59), 1439);
  });
  test("invalid-time for an hour outside 0-23 or a minute outside 0-59, shown with two digits", () => {
    assert.throws(() => wallTime(24, 0), {
      name: "RangeError",
      code: "invalid-time",
      message: "Invalid time: 24:00",
    });
    assert.throws(() => wallTime(-1, 0), { code: "invalid-time" });
    assert.throws(() => wallTime(9, 60), { code: "invalid-time", message: "Invalid time: 09:60" });
    assert.throws(() => wallTime(9, -1), { code: "invalid-time" });
  });
  test("invalid-time for values that are not integers, without failing to build the message", () => {
    assert.throws(() => wallTime(9.5, 0), { code: "invalid-time" });
    assert.throws(() => wallTime(9, Number.NaN), { code: "invalid-time" });
    assert.throws(() => wallTime(null as never, 0), {
      code: "invalid-time",
      message: "Invalid time: null:00",
    });
    assert.throws(() => wallTime(9, Symbol("m") as never), {
      code: "invalid-time",
      message: "Invalid time: 09:Symbol(m)",
    });
  });
});

describe("parseString", () => {
  test("a date of exactly 10 characters: no time", () => {
    assert.deepEqual(parseString("2026-01-05", TOKYO), { date: "2026-01-05", minutes: null });
  });
  test("a date-time without offset: that wall-clock date and time, whatever the zone", () => {
    assert.deepEqual(parseString("2026-01-05T09:30", TOKYO), { date: "2026-01-05", minutes: 570 });
    assert.deepEqual(parseString("2026-01-05T09:30:59", LONDON), {
      date: "2026-01-05",
      minutes: 570,
    });
    assert.deepEqual(parseString("2026-01-05T23:59:59.123456789", "UTC"), {
      date: "2026-01-05",
      minutes: 1439,
    });
    assert.deepEqual(parseString("2026-01-05t00:00", "UTC"), { date: "2026-01-05", minutes: 0 });
  });
  test("with an offset: the instant converted to the zone", () => {
    assert.deepEqual(parseString("2026-01-05T00:30Z", TOKYO), { date: "2026-01-05", minutes: 570 });
    assert.deepEqual(parseString("2026-01-05t20:00z", TOKYO), { date: "2026-01-06", minutes: 300 });
    assert.deepEqual(parseString("2026-01-05T09:30+09:00", TOKYO), {
      date: "2026-01-05",
      minutes: 570,
    });
    assert.deepEqual(parseString("2026-01-05T09:30+0900", "UTC"), {
      date: "2026-01-05",
      minutes: 30,
    });
    assert.deepEqual(parseString("2026-01-05T09:30-05:00", "UTC"), {
      date: "2026-01-05",
      minutes: 870,
    });
    assert.deepEqual(parseString("2026-01-05T23:59:59.999Z", "UTC"), {
      date: "2026-01-05",
      minutes: 1439,
    });
  });
  test("invalid-date for a malformed or non-existent date", () => {
    for (const value of [
      "2026/01/05",
      "2026-02-30",
      "2026-1-5",
      "garbage",
      "",
      "2026-02-30T09:00",
      "20260105T0900",
    ])
      assert.throws(
        () => parseString(value, TOKYO),
        { name: "RangeError", code: "invalid-date" },
        value,
      );
  });
  test("invalid-time for a malformed or out-of-range time, including a space instead of T", () => {
    for (const value of [
      "2026-01-05 09:30",
      "2026-01-05T9:30",
      "2026-01-05T24:00",
      "2026-01-05T09:60",
      "2026-01-05T09:30:60",
      "2026-01-05T09:30:00.",
      "2026-01-05T",
    ])
      assert.throws(
        () => parseString(value, TOKYO),
        { name: "RangeError", code: "invalid-time" },
        value,
      );
  });
  test("invalid-time for a malformed or out-of-range offset", () => {
    for (const value of [
      "2026-01-05T09:30+24:00",
      "2026-01-05T09:30+09:60",
      "2026-01-05T09:30+9",
      "2026-01-05T09:30 Z",
    ])
      assert.throws(() => parseString(value, TOKYO), { code: "invalid-time" }, value);
    assert.deepEqual(parseString("2026-01-05T09:30+23:59", "UTC"), {
      date: "2026-01-04",
      minutes: 571,
    });
  });
  test("out-of-range when an instant falls outside the years 1000-9999", () => {
    assert.throws(() => parseString("1000-01-01T00:00+01:00", "UTC"), { code: "out-of-range" });
    assert.throws(() => parseString("9999-12-31T23:59-01:00", "UTC"), { code: "out-of-range" });
  });
});

describe("isInstantLike", () => {
  test("true for an object with a numeric epochMilliseconds", () => {
    assert.equal(isInstantLike({ epochMilliseconds: 0 }), true);
    assert.equal(isInstantLike({ epochMilliseconds: Number.NaN }), true);
  });
  test("false otherwise", () => {
    assert.equal(isInstantLike({}), false);
    assert.equal(isInstantLike({ epochMilliseconds: "0" }), false);
    assert.equal(isInstantLike({ epochMilliseconds: 0n }), false);
  });
});

describe("isDateLike", () => {
  test("true for an object with numeric year, month and day", () => {
    assert.equal(isDateLike({ year: 2026, month: 1, day: 5 }), true);
  });
  test("false when one of them is missing or not a number", () => {
    assert.equal(isDateLike({ year: 2026, month: 1 }), false);
    assert.equal(isDateLike({ year: "2026", month: 1, day: 5 }), false);
    assert.equal(isDateLike({ year: 2026, month: null, day: 5 }), false);
    assert.equal(isDateLike({}), false);
  });
});

describe("isDate", () => {
  test("true for a Date, also an invalid one and one of another realm", () => {
    assert.equal(isDate(new Date(0)), true);
    assert.equal(isDate(new Date(Number.NaN)), true);
    const foreign: unknown = runInNewContext("new Date(0)");
    assert.equal(foreign instanceof Date, false);
    assert.equal(isDate(foreign), true);
  });
  test("false for other values", () => {
    for (const value of [0, "2026-01-05", null, undefined, {}, { getTime: () => 0 }])
      assert.equal(isDate(value), false);
  });
});

describe("toCivil", () => {
  test("a string is parsed as by parseString", () => {
    assert.deepEqual(toCivil("2026-01-05", TOKYO), { date: "2026-01-05", minutes: null });
    assert.deepEqual(toCivil("2026-01-05T00:30Z", TOKYO), { date: "2026-01-05", minutes: 570 });
  });
  test("a Date is an instant, also one of another realm", () => {
    assert.deepEqual(toCivil(new Date(Date.UTC(2026, 0, 5, 0, 30)), TOKYO), {
      date: "2026-01-05",
      minutes: 570,
    });
    const foreign = runInNewContext("new Date(Date.UTC(2026, 0, 5, 0, 30))") as Date;
    assert.deepEqual(toCivil(foreign, TOKYO), { date: "2026-01-05", minutes: 570 });
    assert.throws(() => toCivil(new Date(Number.NaN), TOKYO), { code: "invalid-time" });
  });
  test("an object with epochMilliseconds is an instant, checked before the date shape", () => {
    assert.deepEqual(toCivil({ epochMilliseconds: Date.UTC(2026, 0, 5, 0, 30) }, TOKYO), {
      date: "2026-01-05",
      minutes: 570,
    });
    const both = { epochMilliseconds: 0, year: 2026, month: 1, day: 5 };
    assert.deepEqual(toCivil(both, "UTC"), { date: "1970-01-01", minutes: 0 });
  });
  test("an object with year, month and day is a date; with hour, a date-time (minute defaults to 0)", () => {
    assert.deepEqual(toCivil({ year: 2026, month: 1, day: 5 }, TOKYO), {
      date: "2026-01-05",
      minutes: null,
    });
    assert.deepEqual(toCivil({ year: 2026, month: 1, day: 5, hour: 9, minute: 30 }, TOKYO), {
      date: "2026-01-05",
      minutes: 570,
    });
    assert.deepEqual(toCivil({ year: 2026, month: 1, day: 5, hour: 9 }, TOKYO), {
      date: "2026-01-05",
      minutes: 540,
    });
    assert.deepEqual(toCivil({ year: 2026, month: 1, day: 5, calendarId: "iso8601" }, TOKYO), {
      date: "2026-01-05",
      minutes: null,
    });
  });
  test("a date-like object with a minute but no hour is a date", () => {
    assert.deepEqual(toCivil({ year: 2026, month: 1, day: 5, minute: 30 }, TOKYO), {
      date: "2026-01-05",
      minutes: null,
    });
  });
  test("TypeError invalid-input for a calendarId other than iso8601", () => {
    assert.throws(() => toCivil({ year: 2026, month: 1, day: 5, calendarId: "japanese" }, TOKYO), {
      name: "TypeError",
      code: "invalid-input",
    });
  });
  test("invalid-date for a year outside 1000-9999 or a day that does not exist in a date-like object", () => {
    for (const year of [999, 10000, 2026.5])
      assert.throws(() => toCivil({ year, month: 1, day: 5 }, TOKYO), {
        name: "RangeError",
        code: "invalid-date",
      });
    assert.throws(() => toCivil({ year: 2026, month: 2, day: 30 }, TOKYO), {
      code: "invalid-date",
    });
  });
  test("invalid-time for an hour or a minute that is not a valid number, including null", () => {
    assert.throws(() => toCivil({ year: 2026, month: 1, day: 5, hour: 24 }, TOKYO), {
      code: "invalid-time",
    });
    assert.throws(() => toCivil({ year: 2026, month: 1, day: 5, hour: null } as never, TOKYO), {
      code: "invalid-time",
    });
    assert.throws(
      () => toCivil({ year: 2026, month: 1, day: 5, hour: 9, minute: null } as never, TOKYO),
      {
        code: "invalid-time",
      },
    );
  });
  test("TypeError invalid-input for any other value", () => {
    for (const input of [
      20260105,
      null,
      undefined,
      true,
      {},
      [],
      { year: 2026 },
      () => 0,
      Symbol("x"),
    ])
      assert.throws(() => toCivil(input as never, TOKYO), {
        name: "TypeError",
        code: "invalid-input",
      });
  });
});

describe("toDateString", () => {
  test("the calendar date in the time zone", () => {
    assert.equal(toDateString("2026-01-05", TOKYO), "2026-01-05");
    assert.equal(toDateString(new Date(Date.UTC(2026, 0, 5, 15)), TOKYO), "2026-01-06");
    assert.equal(toDateString("2026-01-05T15:00Z", "asia/tokyo"), "2026-01-06");
    assert.equal(toDateString({ year: 2026, month: 1, day: 5 }, TOKYO), "2026-01-05");
  });
  test("invalid-time-zone, checked before the input", () => {
    assert.throws(() => toDateString("not a date", "Mars/Olympus"), {
      name: "RangeError",
      code: "invalid-time-zone",
    });
  });
  test("the errors of the input", () => {
    assert.throws(() => toDateString("2026-02-30", TOKYO), { code: "invalid-date" });
    assert.throws(() => toDateString("2026-01-05T25:00", TOKYO), { code: "invalid-time" });
    assert.throws(() => toDateString(new Date(8.64e15), TOKYO), { code: "out-of-range" });
    assert.throws(() => toDateString(1 as never, TOKYO), {
      name: "TypeError",
      code: "invalid-input",
    });
  });
});

describe("toDateTimeParts", () => {
  test("the calendar date and the time HH:mm in the time zone, frozen", () => {
    const parts = toDateTimeParts(new Date(Date.UTC(2026, 0, 5, 0, 5)), TOKYO);
    assert.deepEqual(parts, { date: "2026-01-05", time: "09:05" });
    assert.ok(Object.isFrozen(parts));
    assert.deepEqual(toDateTimeParts("2026-01-05T23:59:59", TOKYO), {
      date: "2026-01-05",
      time: "23:59",
    });
    assert.deepEqual(toDateTimeParts("2026-01-05T00:00", TOKYO), {
      date: "2026-01-05",
      time: "00:00",
    });
  });
  test("time is null for a date-only input", () => {
    assert.deepEqual(toDateTimeParts("2026-01-05", TOKYO), { date: "2026-01-05", time: null });
    assert.deepEqual(toDateTimeParts({ year: 2026, month: 1, day: 5 }, TOKYO), {
      date: "2026-01-05",
      time: null,
    });
  });
  test("invalid-time-zone, and the errors of the input", () => {
    assert.throws(() => toDateTimeParts("2026-01-05", ""), {
      name: "RangeError",
      code: "invalid-time-zone",
    });
    assert.throws(() => toDateTimeParts("2026-13-01", TOKYO), { code: "invalid-date" });
    assert.throws(() => toDateTimeParts("2026-01-05T09:99", TOKYO), { code: "invalid-time" });
    assert.throws(() => toDateTimeParts({} as never, TOKYO), {
      name: "TypeError",
      code: "invalid-input",
    });
  });
});

describe("civilToInstant", () => {
  test("the instant of a date and time of day in the zone", () => {
    assert.equal(civilToInstant("2026-01-05", 540, TOKYO), Date.UTC(2026, 0, 5, 0, 0));
    assert.equal(civilToInstant("2026-01-05", 0, "UTC"), Date.UTC(2026, 0, 5));
    assert.equal(civilToInstant("2026-07-01", 1439, LONDON), Date.UTC(2026, 6, 1, 22, 59));
    assert.equal(civilToInstant("2026-01-05", 570, "-05:30"), Date.UTC(2026, 0, 5, 15, 0));
  });
  test("a time skipped by a DST change is read with the offset before the change", () => {
    // UK: 2026-03-29 01:00 GMT becomes 02:00 BST, so 01:30 does not exist
    assert.equal(civilToInstant("2026-03-29", 90, LONDON), Date.UTC(2026, 2, 29, 1, 30));
    assert.deepEqual(instantToCivil(Date.UTC(2026, 2, 29, 1, 30), LONDON), {
      date: "2026-03-29",
      minutes: 150,
    });
  });
  test("a time that occurs twice gives the earlier instant", () => {
    // UK: 2026-10-25 02:00 BST becomes 01:00 GMT, so 01:30 occurs twice
    assert.equal(civilToInstant("2026-10-25", 90, LONDON), Date.UTC(2026, 9, 25, 0, 30));
  });
  test("the days around a DST change, outside the gap and the overlap", () => {
    assert.equal(civilToInstant("2026-03-29", 59, LONDON), Date.UTC(2026, 2, 29, 0, 59));
    assert.equal(civilToInstant("2026-03-29", 120, LONDON), Date.UTC(2026, 2, 29, 1, 0));
    assert.equal(civilToInstant("2026-10-25", 120, LONDON), Date.UTC(2026, 9, 25, 2, 0));
    assert.equal(civilToInstant("2026-10-25", 59, LONDON), Date.UTC(2026, 9, 24, 23, 59));
  });
});

describe("parseTimeOfDaySeconds", () => {
  test("seconds since midnight for HH:mm and HH:mm:ss", () => {
    assert.equal(parseTimeOfDaySeconds("00:00"), 0);
    assert.equal(parseTimeOfDaySeconds("09:30"), 34200);
    assert.equal(parseTimeOfDaySeconds("09:30:15"), 34215);
    assert.equal(parseTimeOfDaySeconds("23:59:59"), 86399);
  });
  test("invalid-time for another form, an out-of-range part, and values that are not strings", () => {
    for (const value of [
      "9:30",
      "09:30:5",
      "24:00",
      "09:60",
      "09:30:60",
      "09:30:00.5",
      "0930",
      "",
      930,
      null,
      undefined,
    ])
      assert.throws(() => parseTimeOfDaySeconds(value), {
        name: "RangeError",
        code: "invalid-time",
      });
  });
});

describe("toInstant", () => {
  test("the instant of a date and a time of day in the time zone, as a Date", () => {
    const instant = toInstant("2026-01-05", "09:00:30", TOKYO);
    assert.ok(instant instanceof Date);
    assert.equal(instant.getTime(), Date.UTC(2026, 0, 5, 0, 0, 30));
    assert.equal(toInstant("2026-01-05", "09:00", "asia/tokyo").getTime(), Date.UTC(2026, 0, 5));
  });
  test("the inverse of toDateTimeParts", () => {
    const instant = toInstant("2026-07-01", "12:34", LONDON);
    assert.deepEqual(toDateTimeParts(instant, LONDON), { date: "2026-07-01", time: "12:34" });
  });
  test("a skipped time maps later by the gap; a time that occurs twice maps to the earlier instant", () => {
    assert.equal(toInstant("2026-03-29", "01:30", LONDON).getTime(), Date.UTC(2026, 2, 29, 1, 30));
    assert.deepEqual(toDateTimeParts(toInstant("2026-03-29", "01:30", LONDON), LONDON), {
      date: "2026-03-29",
      time: "02:30",
    });
    assert.equal(
      toInstant("2026-10-25", "01:30:10", LONDON).getTime(),
      Date.UTC(2026, 9, 25, 0, 30, 10),
    );
  });
  test("invalid-time-zone, invalid-date and invalid-time", () => {
    assert.throws(() => toInstant("2026-01-05", "09:00", "Mars/Olympus"), {
      name: "RangeError",
      code: "invalid-time-zone",
    });
    assert.throws(() => toInstant("2026-02-30", "09:00", TOKYO), { code: "invalid-date" });
    assert.throws(() => toInstant(new Date(0) as never, "09:00", TOKYO), { code: "invalid-date" });
    assert.throws(() => toInstant("2026-01-05", "9:00", TOKYO), { code: "invalid-time" });
    assert.throws(() => toInstant("2026-01-05", "24:00", TOKYO), { code: "invalid-time" });
  });
});
