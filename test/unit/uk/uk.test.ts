// Unit tests of src/uk/rules.ts. One describe per function, named after the function; each test is one statement
// of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  computeUkHolidays,
  createUkProvider,
  isWeekend,
  lastMonday,
  withWelsh,
} from "../../../src/uk/rules.ts";

/** "MM-DD name [kind]" of a division's holidays of a year (the kind only when it is not regular) */
const list = (division: Parameters<typeof computeUkHolidays>[0], year: number): string[] =>
  computeUkHolidays(division, year).map(
    (h) => `${h.date.slice(5)} ${h.name}${h.kind === "regular" ? "" : ` [${h.kind}]`}`,
  );
const ENG = "england-and-wales";
const SCT = "scotland";
const NI = "northern-ireland";

describe("lastMonday", () => {
  test("the last Monday of the month", () => {
    assert.equal(lastMonday(2026, 5), "2026-05-25");
    assert.equal(lastMonday(2026, 8), "2026-08-31");
    assert.equal(lastMonday(2026, 11), "2026-11-30");
    assert.equal(lastMonday(2026, 2), "2026-02-23");
    assert.equal(lastMonday(2021, 5), "2021-05-31");
  });
});

describe("isWeekend", () => {
  test("true for a Saturday or a Sunday", () => {
    assert.equal(isWeekend("2026-11-21"), true);
    assert.equal(isWeekend("2026-11-22"), true);
  });
  test("false for the other days", () => {
    for (const date of ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"])
      assert.equal(isWeekend(date), false, date);
  });
});

describe("computeUkHolidays", () => {
  test("England and Wales: the list of GOV.UK for 2026", () => {
    assert.deepEqual(list(ENG, 2026), [
      "01-01 New Year’s Day",
      "04-03 Good Friday",
      "04-06 Easter Monday",
      "05-04 Early May bank holiday",
      "05-25 Spring bank holiday",
      "08-31 Summer bank holiday",
      "12-25 Christmas Day",
      "12-28 Boxing Day [substitute]",
    ]);
  });
  test("Scotland: 2nd January, no Easter Monday, the first Monday of August, St Andrew’s Day, and the special day of 2026", () => {
    assert.deepEqual(list(SCT, 2026), [
      "01-01 New Year’s Day",
      "01-02 2nd January",
      "04-03 Good Friday",
      "05-04 Early May bank holiday",
      "05-25 Spring bank holiday",
      "06-15 World Cup bank holiday [special]",
      "08-03 Summer bank holiday",
      "11-30 St Andrew’s Day",
      "12-25 Christmas Day",
      "12-28 Boxing Day [substitute]",
    ]);
  });
  test("Northern Ireland: St Patrick’s Day and the Battle of the Boyne, substituted when on a weekend", () => {
    assert.deepEqual(list(NI, 2026), [
      "01-01 New Year’s Day",
      "03-17 St Patrick’s Day",
      "04-03 Good Friday",
      "04-06 Easter Monday",
      "05-04 Early May bank holiday",
      "05-25 Spring bank holiday",
      "07-13 Battle of the Boyne (Orangemen’s Day) [substitute]",
      "08-31 Summer bank holiday",
      "12-25 Christmas Day",
      "12-28 Boxing Day [substitute]",
    ]);
  });
  test("each holiday is frozen, nameEn equals name, and regular and substitute days have a key", () => {
    const holidays = computeUkHolidays(SCT, 2026);
    assert.ok(holidays.every((h) => Object.isFrozen(h) && h.nameEn === h.name));
    assert.deepEqual(holidays[0], {
      date: "2026-01-01",
      name: "New Year’s Day",
      nameEn: "New Year’s Day",
      kind: "regular",
      confirmed: true,
      key: "new-year",
    });
    assert.deepEqual(
      holidays.filter((h) => !("key" in h)).map((h) => h.kind),
      ["special"],
    );
    assert.equal(holidays.find((h) => h.date === "2026-12-28")?.key, "boxing-day");
    assert.notEqual(computeUkHolidays(SCT, 2026), holidays);
  });
  test("a fixed day on a weekend is replaced by the next weekday that is not a holiday; the weekend day is not listed", () => {
    // 2027: December 25 is a Saturday and the 26th a Sunday
    assert.deepEqual(list(ENG, 2027).slice(-2), [
      "12-27 Christmas Day [substitute]",
      "12-28 Boxing Day [substitute]",
    ]);
    // 2033: January 1 is a Saturday; in Scotland the 2nd is a Sunday
    assert.deepEqual(list(ENG, 2033).slice(0, 1), ["01-03 New Year’s Day [substitute]"]);
    assert.deepEqual(list(SCT, 2033).slice(0, 2), [
      "01-03 New Year’s Day [substitute]",
      "01-04 2nd January [substitute]",
    ]);
    // 2030: November 30 is a Saturday
    assert.ok(list(SCT, 2030).includes("12-02 St Andrew’s Day [substitute]"));
    assert.equal(
      list(SCT, 2030).some((d) => d.startsWith("11-30")),
      false,
    );
    // 2029: March 17 is a Saturday
    assert.ok(list(NI, 2029).includes("03-19 St Patrick’s Day [substitute]"));
  });
  test("the first Monday of May: Scotland in every year, the other divisions from 1978", () => {
    const early = (division: typeof ENG | typeof SCT | typeof NI, year: number) =>
      list(division, year).filter((d) => d.includes("Early May"));
    assert.deepEqual(early(SCT, 1977), ["05-02 Early May bank holiday"]);
    assert.deepEqual(early(ENG, 1977), []);
    assert.deepEqual(early(NI, 1977), []);
    assert.deepEqual(early(ENG, 1978), ["05-01 Early May bank holiday"]);
  });
  test("the last Monday of May: the other divisions in every year, Scotland from 1978", () => {
    const spring = (division: typeof ENG | typeof SCT, year: number) =>
      list(division, year).filter((d) => d.includes("Spring bank holiday"));
    assert.deepEqual(spring(ENG, 1976), ["05-31 Spring bank holiday"]);
    assert.deepEqual(spring(SCT, 1977), []);
    assert.deepEqual(spring(SCT, 1978), ["05-29 Spring bank holiday"]);
  });
  test("St Andrew’s Day from 2007", () => {
    assert.equal(
      list(SCT, 2006).some((d) => d.includes("St Andrew")),
      false,
    );
    assert.ok(list(SCT, 2007).includes("11-30 St Andrew’s Day"));
    assert.equal(
      list(ENG, 2026).some((d) => d.includes("St Andrew")),
      false,
    );
  });
  test("days moved by proclamation, with a new name when it changes", () => {
    assert.ok(list(ENG, 1977).includes("06-06 Spring bank holiday"));
    assert.ok(list(ENG, 1995).includes("05-08 Early May bank holiday"));
    assert.ok(list(SCT, 1995).includes("05-01 Early May bank holiday"));
    assert.ok(list(SCT, 2002).includes("06-04 Spring bank holiday"));
    assert.ok(list(ENG, 2012).includes("06-04 Spring bank holiday"));
    assert.ok(list(NI, 2020).includes("05-08 Early May bank holiday (VE day)"));
    assert.equal(
      list(NI, 2020).some((d) => d.startsWith("05-04")),
      false,
    );
    assert.ok(list(ENG, 2022).includes("06-02 Spring bank holiday"));
    const moved = computeUkHolidays(ENG, 2020).find((h) => h.date === "2020-05-08")!;
    assert.deepEqual([moved.kind, moved.key], ["regular", "early-may"]);
  });
  test("special days of their divisions", () => {
    assert.ok(list(SCT, 1977).includes("06-06 Silver Jubilee bank holiday [special]"));
    assert.ok(list(ENG, 1977).includes("06-07 Silver Jubilee bank holiday [special]"));
    assert.equal(
      list(SCT, 1977).some((d) => d.startsWith("06-07")),
      false,
    );
    assert.ok(
      list(SCT, 1995).includes("05-08 Additional bank holiday (VE Day 50th anniversary) [special]"),
    );
    assert.ok(list(ENG, 1999).includes("12-31 Additional bank holiday (Millennium) [special]"));
    assert.ok(
      list(NI, 2022).includes(
        "09-19 Bank Holiday for the State Funeral of Queen Elizabeth II [special]",
      ),
    );
    assert.ok(
      list(ENG, 2023).includes(
        "05-08 Bank holiday for the coronation of King Charles III [special]",
      ),
    );
    assert.equal(
      list(ENG, 2026).some((d) => d.includes("World Cup")),
      false,
    );
  });
  test("substitutes whose assignment follows the lists of the time", () => {
    assert.deepEqual(list(ENG, 2004).slice(-2), [
      "12-27 Boxing Day [substitute]",
      "12-28 Christmas Day [substitute]",
    ]);
    assert.deepEqual(list(ENG, 2011).slice(-2), [
      "12-26 Christmas Day [substitute]",
      "12-27 Boxing Day [substitute]",
    ]);
    assert.deepEqual(list(SCT, 2005).slice(0, 2), [
      "01-03 2nd January [substitute]",
      "01-04 New Year’s Day [substitute]",
    ]);
    assert.deepEqual(list(SCT, 2023).slice(0, 2), [
      "01-02 New Year’s Day [substitute]",
      "01-03 2nd January [substitute]",
    ]);
    assert.deepEqual(list(SCT, 2017).slice(0, 2), [
      "01-02 2nd January",
      "01-03 New Year’s Day [substitute]",
    ]);
    assert.deepEqual(list(ENG, 2005).slice(0, 1), ["01-03 New Year’s Day [substitute]"]);
    const renamed = computeUkHolidays(SCT, 1977).find((h) => h.date === "1977-12-26")!;
    assert.deepEqual(
      [renamed.name, renamed.kind, renamed.key],
      ["Christmas Day", "substitute", "christmas"],
    );
  });
  test("confirmed is false for years after the confirmed year", () => {
    assert.ok(computeUkHolidays(ENG, 2028).every((h) => h.confirmed));
    assert.ok(computeUkHolidays(ENG, 2029).every((h) => !h.confirmed));
  });
  test("invalid-argument when the year is not an integer", () => {
    for (const year of ["2026", 2026.5, Number.NaN, null])
      assert.throws(() => computeUkHolidays(ENG, year as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("out-of-range outside the supported years", () => {
    assert.throws(() => computeUkHolidays(ENG, 1973), { name: "RangeError", code: "out-of-range" });
    assert.throws(() => computeUkHolidays(ENG, 2100), { code: "out-of-range" });
    assert.ok(computeUkHolidays(ENG, 1974).length > 0);
    assert.ok(computeUkHolidays(ENG, 2099).length > 0);
  });
});

describe("withWelsh", () => {
  test("adds the Welsh name to the holidays that have one, in a new array of frozen holidays", () => {
    const input = computeUkHolidays(ENG, 2026);
    const out = withWelsh(input);
    assert.notEqual(out, input);
    assert.deepEqual(out[0], { ...input[0], names: { cy: "Dydd Calan" } });
    assert.ok(out.every((h) => Object.isFrozen(h)));
    assert.ok(Object.isFrozen(out[0]!.names));
    assert.deepEqual(
      out.map((h) => h.names?.["cy"]),
      [
        "Dydd Calan",
        "Gwener y Groglith",
        "Llun y Pasg",
        "Gŵyl banc dechrau Mai",
        "Gŵyl banc y gwanwyn",
        "Gŵyl banc yr haf",
        "Dydd Nadolig",
        "Dydd San Steffan",
      ],
    );
    assert.equal("names" in input[0]!, false);
  });
  test("a holiday without a Welsh name is returned as it is", () => {
    const input = computeUkHolidays(ENG, 1999);
    const out = withWelsh(input);
    const i = input.findIndex((h) => h.name === "Additional bank holiday (Millennium)");
    assert.ok(i >= 0);
    assert.equal(out[i], input[i]);
    assert.equal("names" in out[i]!, false);
  });
});

describe("createUkProvider", () => {
  test("a frozen provider of the division in the time zone Europe/London", () => {
    const provider = createUkProvider("GB-X", SCT);
    assert.ok(Object.isFrozen(provider));
    assert.equal(provider.id, "GB-X");
    assert.equal(provider.timeZone, "Europe/London");
    assert.deepEqual(provider.supportedYears, { from: 1974, to: 2099 });
    assert.equal(provider.confirmedThrough, 2028);
    assert.equal(typeof provider.dataVersion, "string");
    assert.deepEqual(provider.holidaysInYear(2026), computeUkHolidays(SCT, 2026));
  });
  test("each year is computed once: the same frozen array on every call", () => {
    const provider = createUkProvider("GB-X", ENG);
    const first = provider.holidaysInYear(2026);
    assert.ok(Object.isFrozen(first));
    assert.equal(provider.holidaysInYear(2026), first);
    assert.notEqual(provider.holidaysInYear(2027), first);
  });
  test("transform is applied to each year's list before caching", () => {
    let calls = 0;
    const provider = createUkProvider("GB-X", ENG, (holidays) => {
      calls++;
      return holidays.slice(0, 1);
    });
    assert.equal(provider.holidaysInYear(2026).length, 1);
    assert.equal(provider.holidaysInYear(2026).length, 1);
    assert.equal(calls, 1);
  });
  test("the errors of the year", () => {
    const provider = createUkProvider("GB-X", ENG);
    assert.throws(() => provider.holidaysInYear("2026" as never), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.throws(() => provider.holidaysInYear(1973), { code: "out-of-range" });
  });
});
