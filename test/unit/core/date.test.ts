// Unit tests of src/core/date.ts. One describe per function, named after the function; each test is one statement
// of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addDays,
  diffDays,
  easterSunday,
  formatDate,
  fromDayNumber,
  isLeapYear,
  isValidDate,
  lengthOfMonth,
  nthWeekdayOfMonth,
  parseDate,
  toDayNumber,
  weekdayOf,
} from "../../../src/core/date.ts";

describe("parseDate", () => {
  test("splits YYYY-MM-DD into year, month and day", () => {
    assert.deepEqual(parseDate("2026-11-23"), { year: 2026, month: 11, day: 23 });
    assert.deepEqual(parseDate("1000-01-01"), { year: 1000, month: 1, day: 1 });
    assert.deepEqual(parseDate("9999-12-31"), { year: 9999, month: 12, day: 31 });
  });
  test("the result is frozen, and the same string returns the cached object", () => {
    const first = parseDate("2031-05-06");
    assert.ok(Object.isFrozen(first));
    assert.equal(parseDate("2031-05-06"), first);
  });
  test("invalid-date for a value that is not a string", () => {
    for (const value of [20261123, null, undefined, {}, Symbol("x"), new Date(0)])
      assert.throws(() => parseDate(value as never), { name: "RangeError", code: "invalid-date" });
  });
  test("invalid-date for another form", () => {
    for (const value of [
      "2026-1-5",
      "2026/01/05",
      "20260105",
      " 2026-01-05",
      "2026-01-05T00:00",
      "",
      "12026-01-05",
    ])
      assert.throws(() => parseDate(value), { code: "invalid-date" }, value);
  });
  test("invalid-date for a year below 1000", () => {
    assert.throws(() => parseDate("0999-12-31"), { code: "invalid-date" });
    assert.throws(() => parseDate("0000-01-01"), { code: "invalid-date" });
  });
  test("invalid-date for a day that does not exist", () => {
    for (const value of [
      "2026-00-10",
      "2026-13-01",
      "2026-01-00",
      "2026-01-32",
      "2026-04-31",
      "2026-02-29",
    ])
      assert.throws(() => parseDate(value), { code: "invalid-date" }, value);
    assert.deepEqual(parseDate("2024-02-29"), { year: 2024, month: 2, day: 29 });
  });
  test("a failed parse does not replace the cached value", () => {
    const first = parseDate("2031-07-08");
    assert.throws(() => parseDate("2031-07-99"), { code: "invalid-date" });
    assert.equal(parseDate("2031-07-08"), first);
  });
});

describe("isValidDate", () => {
  test("true for a date string of an existing day in the years 1000-9999", () => {
    assert.equal(isValidDate("2026-11-23"), true);
    assert.equal(isValidDate("1000-01-01"), true);
    assert.equal(isValidDate("9999-12-31"), true);
  });
  test("false for other strings and other values, without throwing", () => {
    for (const value of [
      "2026-02-30",
      "0999-01-01",
      "2026-1-1",
      "",
      20260101,
      null,
      undefined,
      {},
      Symbol("x"),
    ])
      assert.equal(isValidDate(value), false);
  });
});

describe("formatDate", () => {
  test("builds YYYY-MM-DD with zero padding", () => {
    assert.equal(formatDate(2026, 1, 5), "2026-01-05");
    assert.equal(formatDate(1000, 12, 31), "1000-12-31");
    assert.equal(formatDate(9999, 1, 1), "9999-01-01");
  });
  test("out-of-range when the year is not an integer from 1000 to 9999", () => {
    for (const year of [999, 10000, 2026.5, Number.NaN, Infinity, -2026])
      assert.throws(
        () => formatDate(year, 1, 1),
        { name: "RangeError", code: "out-of-range" },
        String(year),
      );
    assert.throws(() => formatDate(999, 1, 1, true), { code: "out-of-range" });
  });
  test("invalid-date when the day does not exist", () => {
    assert.throws(() => formatDate(2026, 2, 29), { code: "invalid-date" });
    assert.throws(() => formatDate(2026, 13, 1), { code: "invalid-date" });
    assert.throws(() => formatDate(2026, 1, 0), { code: "invalid-date" });
  });
  test("with exists: month and day are not validated, and the result is in the cache of parseDate", () => {
    assert.equal(formatDate(2026, 2, 30, true), "2026-02-30");
    assert.equal(formatDate(2033, 3, 4, true), "2033-03-04");
    assert.deepEqual(parseDate("2033-03-04"), { year: 2033, month: 3, day: 4 });
  });
});

describe("isLeapYear", () => {
  test("divisible by 4 and not by 100, or divisible by 400", () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(isLeapYear(2026), false);
    assert.equal(isLeapYear(1900), false);
    assert.equal(isLeapYear(2100), false);
    assert.equal(isLeapYear(2000), true);
    assert.equal(isLeapYear(2400), true);
  });
});

describe("lengthOfMonth", () => {
  test("the days of each month of a common year", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => lengthOfMonth(2026, m)),
      [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    );
  });
  test("February has 29 days in a leap year only", () => {
    assert.equal(lengthOfMonth(2024, 2), 29);
    assert.equal(lengthOfMonth(2000, 2), 29);
    assert.equal(lengthOfMonth(1900, 2), 28);
    assert.equal(lengthOfMonth(2100, 2), 28);
  });
  test("invalid-date when the month is not 1-12", () => {
    for (const month of [0, 13, -1, 1.5, Number.NaN])
      assert.throws(
        () => lengthOfMonth(2026, month),
        { name: "RangeError", code: "invalid-date" },
        String(month),
      );
  });
});

describe("toDayNumber", () => {
  test("days since 1970-01-01, negative before it", () => {
    assert.equal(toDayNumber("1970-01-01"), 0);
    assert.equal(toDayNumber("1970-01-02"), 1);
    assert.equal(toDayNumber("1969-12-31"), -1);
    assert.equal(toDayNumber("2000-03-01") - toDayNumber("2000-02-28"), 2);
    assert.equal(toDayNumber("2100-03-01") - toDayNumber("2100-02-28"), 1);
  });
  test("invalid-date for an invalid date string", () => {
    assert.throws(() => toDayNumber("2026-02-30"), { code: "invalid-date" });
    assert.throws(() => toDayNumber(0 as never), { code: "invalid-date" });
  });
});

describe("fromDayNumber", () => {
  test("the inverse of toDayNumber", () => {
    assert.equal(fromDayNumber(0), "1970-01-01");
    assert.equal(fromDayNumber(-1), "1969-12-31");
    for (const date of ["1000-01-01", "1899-12-31", "2024-02-29", "2026-11-23", "9999-12-31"])
      assert.equal(fromDayNumber(toDayNumber(date)), date);
  });
  test("out-of-range when the year is outside 1000-9999", () => {
    assert.throws(() => fromDayNumber(toDayNumber("1000-01-01") - 1), {
      name: "RangeError",
      code: "out-of-range",
    });
    assert.throws(() => fromDayNumber(toDayNumber("9999-12-31") + 1), { code: "out-of-range" });
  });
});

describe("addDays", () => {
  test("the date n days later, or earlier for a negative n", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(addDays("2024-02-28", 1), "2024-02-29");
    assert.equal(addDays("2026-11-23", 0), "2026-11-23");
    assert.equal(addDays("2026-01-01", 365), "2027-01-01");
  });
  test("invalid-argument when n is not an integer", () => {
    for (const n of [1.5, Number.NaN, Infinity, "1", null, undefined])
      assert.throws(() => addDays("2026-01-01", n as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("invalid-date for an invalid date", () => {
    assert.throws(() => addDays("2026-02-30", 1), { code: "invalid-date" });
  });
  test("out-of-range when the result is outside the years 1000-9999", () => {
    assert.throws(() => addDays("9999-12-31", 1), { code: "out-of-range" });
    assert.throws(() => addDays("1000-01-01", -1), { code: "out-of-range" });
  });
});

describe("diffDays", () => {
  test("to minus from in days: positive when to is later", () => {
    assert.equal(diffDays("2026-01-01", "2026-01-31"), 30);
    assert.equal(diffDays("2026-01-31", "2026-01-01"), -30);
    assert.equal(diffDays("2026-01-01", "2026-01-01"), 0);
    assert.equal(diffDays("2024-01-01", "2025-01-01"), 366);
  });
  test("invalid-date for an invalid date on either side", () => {
    assert.throws(() => diffDays("2026-02-30", "2026-03-01"), { code: "invalid-date" });
    assert.throws(() => diffDays("2026-03-01", "2026-02-30"), { code: "invalid-date" });
  });
});

describe("weekdayOf", () => {
  test("0 for Sunday to 6 for Saturday", () => {
    assert.equal(weekdayOf("1970-01-01"), 4);
    assert.deepEqual(
      [
        "2026-11-22",
        "2026-11-23",
        "2026-11-24",
        "2026-11-25",
        "2026-11-26",
        "2026-11-27",
        "2026-11-28",
      ].map(weekdayOf),
      [0, 1, 2, 3, 4, 5, 6],
    );
  });
  test("before 1970 too (negative day numbers)", () => {
    assert.equal(weekdayOf("1969-12-31"), 3);
    assert.equal(weekdayOf("1000-01-01"), 3);
    assert.equal(weekdayOf("1955-01-01"), 6);
  });
  test("invalid-date for an invalid date", () => {
    assert.throws(() => weekdayOf("2026-13-01"), { code: "invalid-date" });
  });
});

describe("nthWeekdayOfMonth", () => {
  test("the n-th given weekday of the month", () => {
    assert.equal(nthWeekdayOfMonth(2026, 1, 1, 2), "2026-01-12");
    assert.equal(nthWeekdayOfMonth(2026, 11, 0, 1), "2026-11-01");
    assert.equal(nthWeekdayOfMonth(2026, 11, 6, 1), "2026-11-07");
    assert.equal(nthWeekdayOfMonth(2026, 11, 1, 5), "2026-11-30");
  });
  test("invalid-date when the month has no n-th such weekday", () => {
    assert.throws(() => nthWeekdayOfMonth(2026, 11, 2, 5), {
      name: "RangeError",
      code: "invalid-date",
    });
    assert.throws(() => nthWeekdayOfMonth(2026, 2, 0, 5), { code: "invalid-date" });
  });
  test("out-of-range for a year outside 1000-9999", () => {
    assert.throws(() => nthWeekdayOfMonth(999, 1, 1, 1), { code: "out-of-range" });
    assert.throws(() => nthWeekdayOfMonth(10000, 1, 1, 1), { code: "out-of-range" });
  });
});

describe("easterSunday", () => {
  test("Easter Sunday of known years, including the earliest and the latest date", () => {
    assert.equal(easterSunday(2024), "2024-03-31");
    assert.equal(easterSunday(2025), "2025-04-20");
    assert.equal(easterSunday(2026), "2026-04-05");
    assert.equal(easterSunday(2038), "2038-04-25");
    assert.equal(easterSunday(2285), "2285-03-22");
    assert.equal(easterSunday(1961), "1961-04-02");
  });
  test("always a Sunday between March 22 and April 25", () => {
    for (let year = 1583; year <= 2500; year++) {
      const date = easterSunday(year);
      assert.equal(weekdayOf(date), 0, date);
      assert.ok(date.slice(5) >= "03-22" && date.slice(5) <= "04-25", date);
    }
  });
  test("out-of-range for a year outside 1000-9999", () => {
    assert.throws(() => easterSunday(999), { name: "RangeError", code: "out-of-range" });
    assert.throws(() => easterSunday(10000), { code: "out-of-range" });
  });
});
