// Unit tests of src/provider/checks.ts and src/provider/index.ts. One describe per function, named after the
// function; each test is one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  checkHolidays,
  checkMonth,
  checkOptions,
  checkYear,
} from "../../../src/provider/checks.ts";
import {
  easterSunday,
  isLeapYear,
  lengthOfMonth,
  nthWeekdayOfMonth,
  withSubstituteDays,
} from "../../../src/provider/index.ts";

const invalidArgument = { name: "RangeError", code: "invalid-argument" };
/** A holiday with the required properties */
const holiday = (date: string, more: Record<string, unknown> = {}) => ({
  date,
  name: `N ${date}`,
  nameEn: `E ${date}`,
  kind: "regular",
  confirmed: true,
  ...more,
});

describe("checkYear", () => {
  test("returns for an integer from 1000 to 9999", () => {
    for (const year of [1000, 2026, 9999]) assert.equal(checkYear(year), undefined);
  });
  test("invalid-argument otherwise", () => {
    for (const year of [999, 10000, 2026.5, Number.NaN, "2026", null, undefined])
      assert.throws(() => checkYear(year), invalidArgument);
  });
});

describe("checkMonth", () => {
  test("returns for an integer from 1 to 12", () => {
    for (const month of [1, 6, 12]) assert.equal(checkMonth(month), undefined);
  });
  test("invalid-argument otherwise", () => {
    for (const month of [0, 13, 1.5, Number.NaN, "1", null, undefined])
      assert.throws(() => checkMonth(month), invalidArgument);
  });
});

describe("checkHolidays", () => {
  test("returns the same array for valid holidays of one year", () => {
    const list = [
      holiday("2026-01-01", { key: "new-year", names: { ja: "元日" } }),
      holiday("2026-12-25"),
    ];
    assert.equal(checkHolidays(list), list);
    const empty: unknown[] = [];
    assert.equal(checkHolidays(empty), empty);
  });
  test("invalid-argument when it is not an array", () => {
    for (const value of [null, undefined, {}, "x", new Set()])
      assert.throws(() => checkHolidays(value), invalidArgument);
  });
  test("invalid-argument when an item is not an object, including a hole", () => {
    assert.throws(() => checkHolidays([holiday("2026-01-01"), null]), invalidArgument);
    assert.throws(() => checkHolidays(["2026-01-01"]), invalidArgument);
    // eslint-disable-next-line no-sparse-arrays
    assert.throws(() => checkHolidays([holiday("2026-01-01"), , holiday("2026-01-02")]), {
      ...invalidArgument,
      message: "holidays[1] is not an object",
    });
  });
  test("invalid-date for an invalid date", () => {
    for (const date of ["2026-02-30", "2026/01/01", 20260101, undefined])
      assert.throws(() => checkHolidays([holiday(date as never)]), {
        name: "RangeError",
        code: "invalid-date",
      });
  });
  test("invalid-argument when the items span several years", () => {
    assert.throws(
      () => checkHolidays([holiday("2026-12-31"), holiday("2027-01-01")]),
      invalidArgument,
    );
  });
  test("invalid-argument when a date repeats", () => {
    assert.throws(
      () => checkHolidays([holiday("2026-01-01"), holiday("2026-01-01")]),
      invalidArgument,
    );
  });
  test("invalid-argument when name, nameEn or kind is not a string", () => {
    for (const more of [{ name: 1 }, { nameEn: undefined }, { kind: null }])
      assert.throws(() => checkHolidays([holiday("2026-01-01", more)]), invalidArgument);
  });
  test("invalid-argument when confirmed is not a boolean", () => {
    for (const confirmed of [undefined, "true", 1, null])
      assert.throws(() => checkHolidays([holiday("2026-01-01", { confirmed })]), invalidArgument);
  });
  test("invalid-argument when key is given and is not a valid key", () => {
    for (const key of ["", "New Year", 1, null])
      assert.throws(() => checkHolidays([holiday("2026-01-01", { key })]), invalidArgument);
  });
  test("invalid-argument when names is given and is invalid", () => {
    for (const names of [null, [], { JA: "x" }, { ja: "" }])
      assert.throws(() => checkHolidays([holiday("2026-01-01", { names })]), invalidArgument);
  });
});

describe("checkOptions", () => {
  test("returns the options with directions reduced to the weekdays that have a direction", () => {
    const rename = () => ({ name: "n", nameEn: "e" });
    const checked = checkOptions({
      directions: { 0: "next", 6: "previous", 3: undefined },
      kind: "substitute",
      renameSubstitute: rename,
      originalPolicy: "drop",
    });
    assert.deepEqual(checked, {
      directions: { 0: "next", 6: "previous" },
      kind: "substitute",
      renameSubstitute: rename,
      originalPolicy: "drop",
    });
    assert.deepEqual(Object.keys(checked.directions), ["0", "6"]);
  });
  test("the keys renamed in 0.30.0 are read", () => {
    const rename = () => ({ name: "n", nameEn: "e" });
    assert.deepEqual(
      checkOptions({ rules: { 0: "next" }, kind: "k", name: rename, original: "keep" }),
      {
        directions: { 0: "next" },
        kind: "k",
        renameSubstitute: rename,
        originalPolicy: "keep",
      },
    );
  });
  test("invalid-option when an old key and its new name are both given", () => {
    assert.throws(
      () => checkOptions({ rules: { 0: "next" }, directions: { 0: "next" }, kind: "k" }),
      {
        name: "RangeError",
        code: "invalid-option",
      },
    );
  });
  test("invalid-argument when options is not a plain object", () => {
    for (const options of [null, undefined, [], "x", new Map()])
      assert.throws(() => checkOptions(options), invalidArgument);
  });
  test("invalid-argument when directions is not a plain object", () => {
    for (const directions of [undefined, null, [], new Map(), "next"])
      assert.throws(() => checkOptions({ directions, kind: "k" }), invalidArgument);
  });
  test("invalid-weekday for a key that is not 0-6", () => {
    for (const key of ["7", "-1", "sunday", "00", "1.5"])
      assert.throws(() => checkOptions({ directions: { [key]: "next" }, kind: "k" }), {
        name: "RangeError",
        code: "invalid-weekday",
      });
  });
  test("invalid-argument when a direction is not next or previous", () => {
    for (const direction of ["after", null, true, 1])
      assert.throws(
        () => checkOptions({ directions: { 0: direction }, kind: "k" }),
        invalidArgument,
      );
  });
  test("invalid-argument when all seven weekdays have a direction; six are accepted", () => {
    const six = { 0: "next", 1: "next", 2: "next", 3: "next", 4: "next", 5: "next" };
    assert.deepEqual(
      Object.keys(checkOptions({ directions: six, kind: "k" }).directions).length,
      6,
    );
    assert.throws(
      () => checkOptions({ directions: { ...six, 6: "next" }, kind: "k" }),
      invalidArgument,
    );
    assert.equal(
      Object.keys(checkOptions({ directions: { ...six, 6: undefined }, kind: "k" }).directions)
        .length,
      6,
    );
  });
  test("invalid-argument when kind is not a non-empty string", () => {
    for (const kind of ["", undefined, null, 1])
      assert.throws(() => checkOptions({ directions: {}, kind }), invalidArgument);
  });
  test("invalid-argument when renameSubstitute is given and is not a function", () => {
    for (const renameSubstitute of ["x", {}, null])
      assert.throws(
        () => checkOptions({ directions: {}, kind: "k", renameSubstitute }),
        invalidArgument,
      );
  });
  test("invalid-argument when originalPolicy is given and is not keep or drop", () => {
    for (const originalPolicy of ["remove", true, null])
      assert.throws(
        () => checkOptions({ directions: {}, kind: "k", originalPolicy }),
        invalidArgument,
      );
  });
});

describe("easterSunday", () => {
  test("Easter Sunday of the year", () => {
    assert.equal(easterSunday(2026), "2026-04-05");
    assert.equal(easterSunday(2038), "2038-04-25");
    assert.equal(easterSunday(1000), "1000-03-30");
  });
  test("invalid-argument for a year that is not an integer from 1000 to 9999", () => {
    for (const year of [999, 10000, 2026.5, "2026"])
      assert.throws(() => easterSunday(year as never), invalidArgument);
  });
});

describe("nthWeekdayOfMonth", () => {
  test("the n-th given weekday of the month", () => {
    assert.equal(nthWeekdayOfMonth(2026, 1, 1, 3), "2026-01-19");
    assert.equal(nthWeekdayOfMonth(2026, 11, 0, 1), "2026-11-01");
    assert.equal(nthWeekdayOfMonth(2026, 11, 1, 5), "2026-11-30");
  });
  test("-1 is the last one", () => {
    assert.equal(nthWeekdayOfMonth(2026, 5, 1, -1), "2026-05-25");
    assert.equal(nthWeekdayOfMonth(2026, 11, 1, -1), "2026-11-30");
    assert.equal(nthWeekdayOfMonth(2026, 2, 6, -1), "2026-02-28");
    assert.equal(nthWeekdayOfMonth(2026, 2, 0, -1), "2026-02-22");
  });
  test("invalid-argument for an invalid year, month or n", () => {
    assert.throws(() => nthWeekdayOfMonth(999, 1, 1, 1), invalidArgument);
    assert.throws(() => nthWeekdayOfMonth(2026, 13, 1, 1), invalidArgument);
    for (const n of [0, 6, -2, 1.5, Number.NaN])
      assert.throws(() => nthWeekdayOfMonth(2026, 1, 1, n), invalidArgument);
  });
  test("invalid-argument when the month has no fifth such weekday", () => {
    assert.throws(() => nthWeekdayOfMonth(2026, 11, 2, 5), invalidArgument);
    assert.throws(() => nthWeekdayOfMonth(2026, 2, 0, 5), invalidArgument);
  });
  test("invalid-weekday for an invalid weekday", () => {
    for (const weekday of [7, -1, 1.5, "1"])
      assert.throws(() => nthWeekdayOfMonth(2026, 1, weekday as never, 1), {
        name: "RangeError",
        code: "invalid-weekday",
      });
  });
});

describe("lengthOfMonth", () => {
  test("the number of days of the month", () => {
    assert.equal(lengthOfMonth(2026, 2), 28);
    assert.equal(lengthOfMonth(2024, 2), 29);
    assert.equal(lengthOfMonth(2026, 4), 30);
    assert.equal(lengthOfMonth(2026, 12), 31);
  });
  test("invalid-argument for an invalid year or month", () => {
    assert.throws(() => lengthOfMonth(999, 1), invalidArgument);
    assert.throws(() => lengthOfMonth(2026, 0), invalidArgument);
    assert.throws(() => lengthOfMonth(2026, 13), invalidArgument);
  });
});

describe("isLeapYear", () => {
  test("true for a leap year of the Gregorian calendar", () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(isLeapYear(2000), true);
    assert.equal(isLeapYear(2026), false);
    assert.equal(isLeapYear(2100), false);
  });
  test("invalid-argument for an invalid year", () => {
    for (const year of [999, 10000, 2024.5, "2024"])
      assert.throws(() => isLeapYear(year as never), invalidArgument);
  });
});

describe("withSubstituteDays", () => {
  const dates = (list: readonly { date: string; kind: string }[]) =>
    list.map((h) => `${h.date} ${h.kind}`);
  test("a holiday on a listed weekday gets a substitute on the first day in the direction", () => {
    // 2026-05-03 is a Sunday, 2026-07-04 a Saturday
    const out = withSubstituteDays([holiday("2026-07-04"), holiday("2026-05-03")], {
      directions: { 0: "next", 6: "previous" },
      kind: "observed",
    });
    assert.deepEqual(dates(out), [
      "2026-05-03 regular",
      "2026-05-04 observed",
      "2026-07-03 observed",
      "2026-07-04 regular",
    ]);
  });
  test("holidays on other weekdays get none", () => {
    const out = withSubstituteDays([holiday("2026-05-04")], {
      directions: { 0: "next" },
      kind: "s",
    });
    assert.deepEqual(dates(out), ["2026-05-04 regular"]);
  });
  test("the substitute skips input holidays, earlier substitutes and listed weekdays", () => {
    // 2026-05-03 (Sun), 04 (Mon) and 05 (Tue) are holidays: the substitute of the 3rd is the 6th
    const out = withSubstituteDays(
      [holiday("2026-05-03"), holiday("2026-05-04"), holiday("2026-05-05")],
      {
        directions: { 0: "next" },
        kind: "s",
      },
    );
    assert.deepEqual(
      dates(out).filter((d) => d.endsWith(" s")),
      ["2026-05-06 s"],
    );
    // 2026-12-26 (Sat) and 27 (Sun): the substitutes are the 28th and the 29th (the UK)
    const uk = withSubstituteDays([holiday("2026-12-26"), holiday("2026-12-27")], {
      directions: { 6: "next", 0: "next" },
      kind: "s",
    });
    assert.deepEqual(
      dates(uk).filter((d) => d.endsWith(" s")),
      ["2026-12-28 s", "2026-12-29 s"],
    );
  });
  test("a substitute inherits key, names and confirmed; its kind is options.kind and its name the holiday's", () => {
    const original = holiday("2026-05-03", { key: "k", names: { ja: "名" }, confirmed: false });
    const out = withSubstituteDays([original], { directions: { 0: "next" }, kind: "s" });
    assert.deepEqual(out[1], {
      date: "2026-05-04",
      name: original.name,
      nameEn: original.nameEn,
      names: { ja: "名" },
      kind: "s",
      confirmed: false,
      key: "k",
    });
  });
  test("renameSubstitute gives the name of the substitute; names are still inherited", () => {
    const original = holiday("2026-05-03", { names: { ja: "名" } });
    const seen: unknown[] = [];
    const out = withSubstituteDays([original], {
      directions: { 0: "next" },
      kind: "s",
      renameSubstitute: (h) => {
        seen.push(h);
        return { name: "振替休日", nameEn: "Substitute Holiday" };
      },
    });
    assert.equal(out[1]!.name, "振替休日");
    assert.equal(out[1]!.nameEn, "Substitute Holiday");
    assert.deepEqual(out[1]!.names, { ja: "名" });
    assert.deepEqual(seen, [original]);
  });
  test("originalPolicy drop returns only the substitute of a moved holiday", () => {
    const out = withSubstituteDays([holiday("2026-05-03"), holiday("2026-05-05")], {
      directions: { 0: "next" },
      kind: "s",
      originalPolicy: "drop",
    });
    assert.deepEqual(dates(out), ["2026-05-04 s", "2026-05-05 regular"]);
    const kept = withSubstituteDays([holiday("2026-05-03")], {
      directions: { 0: "next" },
      kind: "s",
      originalPolicy: "keep",
    });
    assert.deepEqual(dates(kept), ["2026-05-03 regular", "2026-05-04 s"]);
  });
  test("the result is a frozen array of frozen copies with only the contract's properties, sorted by date", () => {
    const names = { ja: "名" };
    const input = [holiday("2026-12-25"), holiday("2026-01-01", { names, extra: 1 })];
    const out = withSubstituteDays(input, { directions: {}, kind: "s" });
    assert.ok(Object.isFrozen(out));
    assert.ok(out.every((h) => Object.isFrozen(h)));
    assert.deepEqual(dates(out), ["2026-01-01 regular", "2026-12-25 regular"]);
    assert.notEqual(out[0], input[1]);
    assert.equal("extra" in out[0]!, false);
    assert.notEqual(out[0]!.names, names);
    assert.ok(Object.isFrozen(out[0]!.names));
    assert.equal("names" in out[1]!, false);
    assert.equal("key" in out[1]!, false);
    assert.equal(Object.isFrozen(input), false);
  });
  test("a substitute can fall in the adjacent year", () => {
    // 2028-12-31 is a Sunday; 2022-01-01 is a Saturday
    const next = withSubstituteDays([holiday("2028-12-31")], {
      directions: { 0: "next" },
      kind: "s",
    });
    assert.deepEqual(dates(next), ["2028-12-31 regular", "2029-01-01 s"]);
    const previous = withSubstituteDays([holiday("2022-01-01")], {
      directions: { 6: "previous" },
      kind: "s",
    });
    assert.deepEqual(dates(previous), ["2021-12-31 s", "2022-01-01 regular"]);
  });
  test("the errors of invalid holidays and options", () => {
    assert.throws(
      () => withSubstituteDays("x" as never, { directions: {}, kind: "s" }),
      invalidArgument,
    );
    assert.throws(
      () => withSubstituteDays([holiday("2026-02-30")], { directions: {}, kind: "s" }),
      {
        code: "invalid-date",
      },
    );
    assert.throws(() => withSubstituteDays([], { directions: { 7: "next" } as never, kind: "s" }), {
      code: "invalid-weekday",
    });
    assert.throws(() => withSubstituteDays([], { directions: {}, kind: "" }), invalidArgument);
  });
  test("invalid-argument for an invalid result of renameSubstitute", () => {
    for (const result of [null, undefined, "name", { name: "n" }, { name: 1, nameEn: "e" }])
      assert.throws(
        () =>
          withSubstituteDays([holiday("2026-05-03")], {
            directions: { 0: "next" },
            kind: "s",
            renameSubstitute: () => result as never,
          }),
        invalidArgument,
      );
  });
  test("out-of-range when a substitute falls outside the years 1000-9999", () => {
    // 9999-12-31 is a Friday
    assert.throws(
      () => withSubstituteDays([holiday("9999-12-31")], { directions: { 5: "next" }, kind: "s" }),
      { name: "RangeError", code: "out-of-range" },
    );
  });
});
