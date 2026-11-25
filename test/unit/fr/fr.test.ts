// Unit tests of src/fr/rules.ts. One describe per function, named after the function; each test is one statement
// of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeFrHolidays, createFrProvider } from "../../../src/fr/rules.ts";

const list = (zone: Parameters<typeof computeFrHolidays>[0], year: number): string[] =>
  computeFrHolidays(zone, year).map((h) => `${h.date.slice(5)} ${h.name}`);

describe("computeFrHolidays", () => {
  test("mainland France: the fixed dates and the days counted from Easter, sorted by date", () => {
    assert.deepEqual(list("metropole", 2026), [
      "01-01 1er janvier",
      "04-06 Lundi de Pâques",
      "05-01 1er mai",
      "05-08 8 mai",
      "05-14 Ascension",
      "05-25 Lundi de Pentecôte",
      "07-14 14 juillet",
      "08-15 Assomption",
      "11-01 Toussaint",
      "11-11 11 novembre",
      "12-25 Jour de Noël",
    ]);
  });
  test("Alsace-Moselle adds Good Friday and December 26", () => {
    const mainland = list("metropole", 2026);
    const local = list("alsace-moselle", 2026);
    assert.deepEqual(
      local.filter((d) => !mainland.includes(d)),
      ["04-03 Vendredi saint", "12-26 2ème jour de Noël"],
    );
    assert.equal(local.length, mainland.length + 2);
  });
  test("every holiday is frozen, of kind regular, confirmed, and has an English name and a key", () => {
    const holidays = computeFrHolidays("alsace-moselle", 2026);
    assert.ok(holidays.every((h) => Object.isFrozen(h) && h.kind === "regular" && h.confirmed));
    assert.deepEqual(holidays[0], {
      date: "2026-01-01",
      name: "1er janvier",
      nameEn: "New Year’s Day",
      kind: "regular",
      confirmed: true,
      key: "new-year",
    });
    assert.deepEqual(
      holidays.map((h) => h.key),
      [
        "new-year",
        "good-friday",
        "easter-monday",
        "labour-day",
        "victory-in-europe",
        "ascension",
        "pentecost-monday",
        "bastille",
        "assumption",
        "all-saints",
        "armistice",
        "christmas",
        "saint-stephens",
      ],
    );
    assert.notEqual(computeFrHolidays("alsace-moselle", 2026), holidays);
  });
  test("one holiday per date: a day counted from Easter replaces the fixed holiday of the same date", () => {
    // 2008: Ascension falls on May 1
    const holidays = computeFrHolidays("metropole", 2008);
    assert.equal(holidays.length, 10);
    const may1 = holidays.filter((h) => h.date === "2008-05-01");
    assert.deepEqual(
      may1.map((h) => [h.name, h.key]),
      [["Ascension", "ascension"]],
    );
  });
  test("invalid-argument when the year is not an integer", () => {
    for (const year of ["2026", 2026.5, Number.NaN, null])
      assert.throws(() => computeFrHolidays("metropole", year as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("out-of-range outside the supported years", () => {
    assert.throws(() => computeFrHolidays("metropole", 1999), {
      name: "RangeError",
      code: "out-of-range",
    });
    assert.throws(() => computeFrHolidays("metropole", 2100), { code: "out-of-range" });
    assert.equal(computeFrHolidays("metropole", 2000).length, 11);
    assert.equal(computeFrHolidays("metropole", 2099).length, 11);
  });
});

describe("createFrProvider", () => {
  test("a frozen provider of the zone in the time zone Europe/Paris", () => {
    const provider = createFrProvider("FR-X", "alsace-moselle");
    assert.ok(Object.isFrozen(provider));
    assert.equal(provider.id, "FR-X");
    assert.equal(provider.timeZone, "Europe/Paris");
    assert.deepEqual(provider.supportedYears, { from: 2000, to: 2099 });
    assert.equal(typeof provider.dataVersion, "string");
    assert.equal("confirmedThrough" in provider, false);
    assert.deepEqual(provider.holidaysInYear(2026), computeFrHolidays("alsace-moselle", 2026));
  });
  test("each year is computed once: the same frozen array on every call", () => {
    const provider = createFrProvider("FR-X", "metropole");
    const first = provider.holidaysInYear(2026);
    assert.ok(Object.isFrozen(first));
    assert.equal(provider.holidaysInYear(2026), first);
    assert.notEqual(provider.holidaysInYear(2027), first);
  });
  test("the errors of the year", () => {
    const provider = createFrProvider("FR-X", "metropole");
    assert.throws(() => provider.holidaysInYear("2026" as never), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.throws(() => provider.holidaysInYear(1999), { code: "out-of-range" });
  });
});
