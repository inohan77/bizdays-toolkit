// Unit tests of src/sg/rules.ts. One describe per function, named after the function; each test is one statement
// of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeSgHolidays } from "../../../src/sg/rules.ts";

const list = (year: number): string[] =>
  computeSgHolidays(year).map(
    (h) => `${h.date.slice(5)} ${h.name}${h.kind === "regular" ? "" : ` [${h.kind}]`}`,
  );

describe("computeSgHolidays", () => {
  test("the fixed dates and the listed movable dates of the year, sorted by date", () => {
    assert.deepEqual(list(2027), [
      "01-01 New Year’s Day",
      "02-06 Chinese New Year",
      "02-07 Chinese New Year",
      "02-08 Chinese New Year [substitute]",
      "03-10 Hari Raya Puasa",
      "03-26 Good Friday",
      "05-01 Labour Day",
      "05-17 Hari Raya Haji",
      "05-20 Vesak Day",
      "08-09 National Day",
      "10-28 Deepavali",
      "12-25 Christmas Day",
    ]);
  });
  test("a holiday on a Sunday gets a substitute on the next day that is not a holiday; a Saturday gets none", () => {
    // 2020: January 26, May 24 and August 9 are Sundays; January 25 is a Saturday
    assert.deepEqual(list(2020), [
      "01-01 New Year’s Day",
      "01-25 Chinese New Year",
      "01-26 Chinese New Year",
      "01-27 Chinese New Year [substitute]",
      "04-10 Good Friday",
      "05-01 Labour Day",
      "05-07 Vesak Day",
      "05-24 Hari Raya Puasa",
      "05-25 Hari Raya Puasa [substitute]",
      "07-10 Polling Day [special]",
      "07-31 Hari Raya Haji",
      "08-09 National Day",
      "08-10 National Day [substitute]",
      "11-14 Deepavali",
      "12-25 Christmas Day",
    ]);
  });
  test("special days of their year only", () => {
    assert.ok(list(2023).includes("09-01 Polling Day [special]"));
    assert.ok(list(2025).includes("05-03 Polling Day [special]"));
    assert.equal(
      list(2027).some((d) => d.includes("Polling Day")),
      false,
    );
  });
  test("every holiday is frozen and confirmed; nameEn equals name; a substitute has its holiday's key", () => {
    const holidays = computeSgHolidays(2020);
    assert.ok(holidays.every((h) => Object.isFrozen(h) && h.confirmed && h.nameEn === h.name));
    const day = holidays.find((h) => h.date === "2020-08-09")!;
    const substitute = holidays.find((h) => h.date === "2020-08-10")!;
    assert.equal(typeof day.key, "string");
    assert.equal(substitute.key, day.key);
    assert.deepEqual(Object.keys(day), ["date", "name", "nameEn", "kind", "confirmed", "key"]);
    assert.notEqual(computeSgHolidays(2020), holidays);
  });
  test("invalid-argument when the year is not an integer", () => {
    for (const year of ["2026", 2026.5, Number.NaN, null])
      assert.throws(() => computeSgHolidays(year as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("out-of-range for a year without data", () => {
    assert.throws(() => computeSgHolidays(2019), { name: "RangeError", code: "out-of-range" });
    assert.throws(() => computeSgHolidays(2028), { code: "out-of-range" });
    for (let year = 2020; year <= 2027; year++)
      assert.ok(computeSgHolidays(year).length >= 11, String(year));
  });
});
