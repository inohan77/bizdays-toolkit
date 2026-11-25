// Unit tests of src/core/month.ts. One describe per function, named after the function; each test is one
// statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  checkClosingDay,
  closingDayIn,
  closingMonth,
  closingPeriod,
  dayOfMonth,
  formatMonth,
  isDayOfMonthValue,
  monthOf,
  parseMonth,
  readsAsDate,
  shiftMonth,
} from "../../../src/core/month.ts";

describe("parseMonth", () => {
  test("splits YYYY-MM into year and month", () => {
    assert.deepEqual(parseMonth("2026-11"), { year: 2026, month: 11 });
    assert.deepEqual(parseMonth("1000-01"), { year: 1000, month: 1 });
    assert.deepEqual(parseMonth("9999-12"), { year: 9999, month: 12 });
  });
  test("invalid-month for a year below 1000 and a month outside 01-12", () => {
    for (const value of ["0999-12", "2026-00", "2026-13"])
      assert.throws(() => parseMonth(value), { name: "RangeError", code: "invalid-month" }, value);
  });
  test("invalid-month for another form and for values that are not strings", () => {
    for (const value of [
      "2026-1",
      "2026/11",
      "202611",
      "2026-11-23",
      "",
      " 2026-11",
      202611,
      null,
      undefined,
      {},
      Symbol("x"),
    ])
      assert.throws(() => parseMonth(value), { code: "invalid-month" });
  });
});

describe("formatMonth", () => {
  test("builds YYYY-MM with zero padding", () => {
    assert.equal(formatMonth({ year: 2026, month: 1 }), "2026-01");
    assert.equal(formatMonth({ year: 1000, month: 12 }), "1000-12");
    assert.equal(formatMonth({ year: 9999, month: 12 }), "9999-12");
  });
  test("out-of-range when the year is outside 1000-9999", () => {
    assert.throws(() => formatMonth({ year: 999, month: 12 }), {
      name: "RangeError",
      code: "out-of-range",
    });
    assert.throws(() => formatMonth({ year: 10000, month: 1 }), { code: "out-of-range" });
  });
});

describe("shiftMonth", () => {
  test("the month offset months later, across years", () => {
    assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 0), { year: 2026, month: 11 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2026, month: 12 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 2), { year: 2027, month: 1 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, 24), { year: 2028, month: 1 });
  });
  test("earlier for a negative offset", () => {
    assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 3 }, -14), { year: 2025, month: 1 });
  });
  test("the year is not range-checked", () => {
    assert.deepEqual(shiftMonth({ year: 9999, month: 12 }, 1), { year: 10000, month: 1 });
    assert.deepEqual(shiftMonth({ year: 1000, month: 1 }, -1), { year: 999, month: 12 });
  });
});

describe("dayOfMonth", () => {
  test("the given day of the month", () => {
    assert.equal(dayOfMonth({ year: 2026, month: 11 }, 1), "2026-11-01");
    assert.equal(dayOfMonth({ year: 2026, month: 11 }, 30), "2026-11-30");
  });
  test("-1 and a day beyond the end of the month read as the last day", () => {
    assert.equal(dayOfMonth({ year: 2026, month: 11 }, -1), "2026-11-30");
    assert.equal(dayOfMonth({ year: 2026, month: 11 }, 31), "2026-11-30");
    assert.equal(dayOfMonth({ year: 2026, month: 2 }, 30), "2026-02-28");
    assert.equal(dayOfMonth({ year: 2024, month: 2 }, 31), "2024-02-29");
  });
  test("invalid-date for a day below 1 other than -1", () => {
    assert.throws(() => dayOfMonth({ year: 2026, month: 11 }, 0), {
      name: "RangeError",
      code: "invalid-date",
    });
    assert.throws(() => dayOfMonth({ year: 2026, month: 11 }, -2), { code: "invalid-date" });
  });
  test("out-of-range for a year outside 1000-9999", () => {
    assert.throws(() => dayOfMonth({ year: 999, month: 12 }, 1), { code: "out-of-range" });
    assert.throws(() => dayOfMonth({ year: 10000, month: 1 }, 1), { code: "out-of-range" });
  });
});

describe("isDayOfMonthValue", () => {
  test("true for an integer 1-31 and for -1", () => {
    for (const v of [1, 15, 31, -1]) assert.equal(isDayOfMonthValue(v), true, String(v));
  });
  test("false for everything else", () => {
    for (const v of [0, 32, -2, 1.5, Number.NaN, "1", null, undefined, true])
      assert.equal(isDayOfMonthValue(v), false, String(v));
  });
});

describe("monthOf", () => {
  test("the month of a date or of a month", () => {
    assert.equal(monthOf("2026-10-16"), "2026-10");
    assert.equal(monthOf("2026-10"), "2026-10");
  });
  test("offset months later, or earlier for a negative offset", () => {
    assert.equal(monthOf("2026-10-16", 1), "2026-11");
    assert.equal(monthOf("2026-12-31", 1), "2027-01");
    assert.equal(monthOf("2026-01", -1), "2025-12");
    assert.equal(monthOf("2026-10", 0), "2026-10");
  });
  test("invalid-argument when offset is not an integer", () => {
    for (const offset of [0.5, Number.NaN, Infinity, "1", null])
      assert.throws(() => monthOf("2026-10", offset as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("a string with three or more hyphen-separated parts is read as a date: invalid-date", () => {
    assert.throws(() => monthOf("2026-02-30"), { code: "invalid-date" });
    assert.throws(() => monthOf("2026-10-16-1"), { code: "invalid-date" });
  });
  test("other invalid inputs are invalid-month", () => {
    assert.throws(() => monthOf("2026-13"), { code: "invalid-month" });
    assert.throws(() => monthOf("202610"), { code: "invalid-month" });
    assert.throws(() => monthOf(202610 as never), { code: "invalid-month" });
  });
  test("out-of-range when the result is outside the years 1000-9999", () => {
    assert.throws(() => monthOf("9999-12", 1), { code: "out-of-range" });
    assert.throws(() => monthOf("1000-01-01", -1), { code: "out-of-range" });
  });
});

describe("closingMonth", () => {
  test("up to the closing day the month of the date; from the next day the following month", () => {
    assert.equal(closingMonth("2026-10-20", 20), "2026-10");
    assert.equal(closingMonth("2026-10-21", 20), "2026-11");
    assert.equal(closingMonth("2026-10-01", 20), "2026-10");
    assert.equal(closingMonth("2026-12-21", 20), "2027-01");
  });
  test("-1 closes on the last day: every day belongs to its own month", () => {
    assert.equal(closingMonth("2026-10-31", -1), "2026-10");
    assert.equal(closingMonth("2026-02-28", -1), "2026-02");
    assert.equal(closingMonth("2024-02-29", -1), "2024-02");
  });
  test("a closing day beyond the end of a month reads as its last day", () => {
    assert.equal(closingMonth("2026-02-28", 31), "2026-02");
    assert.equal(closingMonth("2026-04-30", 31), "2026-04");
    assert.equal(closingMonth("2026-02-28", 30), "2026-02");
  });
  test("invalid-argument for an invalid closing day", () => {
    for (const day of [0, 32, -2, 1.5, Number.NaN, "20"])
      assert.throws(() => closingMonth("2026-10-20", day as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("invalid-date for an invalid date", () => {
    assert.throws(() => closingMonth("2026-02-30", 20), { code: "invalid-date" });
    assert.throws(() => closingMonth("2026-10", 20), { code: "invalid-date" });
  });
  test("out-of-range when the result is outside the years 1000-9999", () => {
    assert.throws(() => closingMonth("9999-12-21", 20), { code: "out-of-range" });
    assert.equal(closingMonth("9999-12-20", 20), "9999-12");
  });
});

describe("checkClosingDay", () => {
  test("returns for an integer 1-31 and for -1", () => {
    for (const day of [1, 31, -1]) assert.equal(checkClosingDay(day), undefined);
  });
  test("invalid-argument otherwise", () => {
    for (const day of [0, 32, -2, 2.5, Number.NaN, "1", null, undefined])
      assert.throws(() => checkClosingDay(day as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
});

describe("closingDayIn", () => {
  test("the closing day itself when the month has it", () => {
    assert.equal(closingDayIn({ year: 2026, month: 11 }, 20), 20);
    assert.equal(closingDayIn({ year: 2026, month: 11 }, 30), 30);
    assert.equal(closingDayIn({ year: 2026, month: 2 }, 28), 28);
  });
  test("the last day of the month for -1 and for a day beyond its end", () => {
    assert.equal(closingDayIn({ year: 2026, month: 11 }, -1), 30);
    assert.equal(closingDayIn({ year: 2026, month: 11 }, 31), 30);
    assert.equal(closingDayIn({ year: 2026, month: 2 }, 29), 28);
    assert.equal(closingDayIn({ year: 2024, month: 2 }, 31), 29);
  });
});

describe("readsAsDate", () => {
  test("true for three or more hyphen-separated parts", () => {
    assert.equal(readsAsDate("2026-10-16"), true);
    assert.equal(readsAsDate("a-b-c-d"), true);
    assert.equal(readsAsDate("--"), true);
  });
  test("false for fewer parts", () => {
    assert.equal(readsAsDate("2026-10"), false);
    assert.equal(readsAsDate("202610"), false);
    assert.equal(readsAsDate(""), false);
  });
});

describe("closingPeriod", () => {
  test("from the day after the previous month's closing day to the month's closing day", () => {
    assert.deepEqual(closingPeriod("2026-11", 20), { from: "2026-10-21", to: "2026-11-20" });
    assert.deepEqual(closingPeriod("2026-01", 20), { from: "2025-12-21", to: "2026-01-20" });
  });
  test("-1: the whole calendar month", () => {
    assert.deepEqual(closingPeriod("2026-10", -1), { from: "2026-10-01", to: "2026-10-31" });
    assert.deepEqual(closingPeriod("2026-03", -1), { from: "2026-03-01", to: "2026-03-31" });
  });
  test("a closing day beyond the end of a month reads as that month's last day, on both ends", () => {
    assert.deepEqual(closingPeriod("2026-03", 31), { from: "2026-03-01", to: "2026-03-31" });
    assert.deepEqual(closingPeriod("2026-02", 30), { from: "2026-01-31", to: "2026-02-28" });
    assert.deepEqual(closingPeriod("2026-03", 30), { from: "2026-03-01", to: "2026-03-30" });
  });
  test("a date means the period that day belongs to", () => {
    assert.deepEqual(closingPeriod("2026-11-05", 20), { from: "2026-10-21", to: "2026-11-20" });
    assert.deepEqual(closingPeriod("2026-11-21", 20), { from: "2026-11-21", to: "2026-12-20" });
    assert.deepEqual(closingPeriod("2026-11-20", 20), { from: "2026-10-21", to: "2026-11-20" });
  });
  test("the result is frozen and is the inverse of closingMonth", () => {
    const period = closingPeriod("2026-11", 20);
    assert.ok(Object.isFrozen(period));
    assert.equal(closingMonth(period.from, 20), "2026-11");
    assert.equal(closingMonth(period.to, 20), "2026-11");
  });
  test("invalid-argument for an invalid closing day", () => {
    assert.throws(() => closingPeriod("2026-11", 0), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.throws(() => closingPeriod("2026-11", 32), { code: "invalid-argument" });
  });
  test("invalid-month for an invalid month and for a value that is not a string; invalid-date for an invalid date", () => {
    assert.throws(() => closingPeriod("2026-13", 20), { code: "invalid-month" });
    assert.throws(() => closingPeriod(202611 as never, 20), { code: "invalid-month" });
    assert.throws(() => closingPeriod("2026-02-30", 20), { code: "invalid-date" });
  });
  test("out-of-range when a date is outside the years 1000-9999", () => {
    assert.throws(() => closingPeriod("1000-01", 20), { code: "out-of-range" });
    assert.deepEqual(closingPeriod("9999-12", -1), { from: "9999-12-01", to: "9999-12-31" });
  });
});
