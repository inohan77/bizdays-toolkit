// Unit tests of src/jp/rules.ts and src/jp/index.ts. One describe per function, named after the function; each
// test is one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { weekdayOf } from "../../../src/core/date.ts";
import {
  getHoliday,
  holidayOn,
  holidaysBetween,
  holidaysInYear,
  isHoliday,
  jp,
  toJapanDate,
  toJapanDateTime,
} from "../../../src/jp/index.ts";
import {
  autumnalEquinoxDay,
  baseHolidays,
  computeJapaneseHolidays,
  sharedCalendar,
  vernalEquinoxDay,
} from "../../../src/jp/rules.ts";

/** "MM-DD name" of the base holidays of a year */
const base = (year: number): string[] =>
  baseHolidays(year).map((e) => `${e.date.slice(5)} ${e.name}`);
/** The entry of a date among the computed holidays of its year */
const on = (date: string) =>
  computeJapaneseHolidays(Number(date.slice(0, 4))).find((h) => h.date === date);

describe("vernalEquinoxDay", () => {
  test("the day of March of years announced in the official gazette", () => {
    assert.equal(vernalEquinoxDay(2023), 21);
    assert.equal(vernalEquinoxDay(2024), 20);
    assert.equal(vernalEquinoxDay(2026), 20);
    assert.equal(vernalEquinoxDay(2027), 21);
  });
  test("the formula up to 1979", () => {
    assert.equal(vernalEquinoxDay(1955), 21);
    assert.equal(vernalEquinoxDay(1960), 20);
    assert.equal(vernalEquinoxDay(1979), 21);
    assert.equal(vernalEquinoxDay(1980), 20);
  });
  test("19 to 21 for every supported year", () => {
    for (let y = 1955; y <= 2099; y++) {
      const day = vernalEquinoxDay(y);
      assert.ok(day >= 19 && day <= 21, `${y}: ${day}`);
    }
  });
});

describe("autumnalEquinoxDay", () => {
  test("the day of September of years announced in the official gazette", () => {
    assert.equal(autumnalEquinoxDay(2012), 22);
    assert.equal(autumnalEquinoxDay(2024), 22);
    assert.equal(autumnalEquinoxDay(2026), 23);
    assert.equal(autumnalEquinoxDay(2027), 23);
  });
  test("the formula up to 1979", () => {
    assert.equal(autumnalEquinoxDay(1955), 24);
    assert.equal(autumnalEquinoxDay(1979), 24);
    assert.equal(autumnalEquinoxDay(1980), 23);
  });
  test("22 to 24 for every supported year", () => {
    for (let y = 1955; y <= 2099; y++) {
      const day = autumnalEquinoxDay(y);
      assert.ok(day >= 22 && day <= 24, `${y}: ${day}`);
    }
  });
});

describe("baseHolidays", () => {
  test("the holidays of the holiday law of a recent year, sorted by date", () => {
    assert.deepEqual(base(2026), [
      "01-01 元日",
      "01-12 成人の日",
      "02-11 建国記念の日",
      "02-23 天皇誕生日",
      "03-20 春分の日",
      "04-29 昭和の日",
      "05-03 憲法記念日",
      "05-04 みどりの日",
      "05-05 こどもの日",
      "07-20 海の日",
      "08-11 山の日",
      "09-21 敬老の日",
      "09-23 秋分の日",
      "10-12 スポーツの日",
      "11-03 文化の日",
      "11-23 勤労感謝の日",
    ]);
  });
  test("the holidays of the first supported year", () => {
    assert.deepEqual(base(1955), [
      "01-01 元日",
      "01-15 成人の日",
      "03-21 春分の日",
      "04-29 天皇誕生日",
      "05-03 憲法記念日",
      "05-05 こどもの日",
      "09-24 秋分の日",
      "11-03 文化の日",
      "11-23 勤労感謝の日",
    ]);
  });
  test("each entry has a key, kind regular, and equinox only for the two equinox days", () => {
    const list = baseHolidays(2026);
    assert.ok(list.every((e) => e.kind === "regular" && typeof e.key === "string"));
    assert.deepEqual(
      list.filter((e) => e.equinox).map((e) => e.key),
      ["vernal-equinox", "autumnal-equinox"],
    );
    assert.equal(list[0]!.nameEn, "New Year's Day");
  });
  test("Coming of Age Day: January 15 up to 1999, the second Monday from 2000", () => {
    assert.ok(base(1999).includes("01-15 成人の日"));
    assert.ok(base(2000).includes("01-10 成人の日"));
  });
  test("National Foundation Day from 1967", () => {
    assert.equal(
      base(1966).some((d) => d.endsWith("建国記念の日")),
      false,
    );
    assert.ok(base(1967).includes("02-11 建国記念の日"));
  });
  test("The Emperor's Birthday: April 29 up to 1988, December 23 from 1989 to 2018, February 23 from 2020", () => {
    const birthday = (y: number) => base(y).filter((d) => d.endsWith("天皇誕生日"));
    assert.deepEqual(birthday(1988), ["04-29 天皇誕生日"]);
    assert.deepEqual(birthday(1989), ["12-23 天皇誕生日"]);
    assert.deepEqual(birthday(2018), ["12-23 天皇誕生日"]);
    assert.deepEqual(birthday(2019), []);
    assert.deepEqual(birthday(2020), ["02-23 天皇誕生日"]);
  });
  test("April 29: Greenery Day from 1989 to 2006, Showa Day from 2007 (Greenery Day moves to May 4)", () => {
    assert.ok(base(1989).includes("04-29 みどりの日"));
    assert.ok(base(2006).includes("04-29 みどりの日"));
    assert.equal(base(2006).includes("05-04 みどりの日"), false);
    assert.ok(base(2007).includes("04-29 昭和の日"));
    assert.ok(base(2007).includes("05-04 みどりの日"));
  });
  test("Marine Day: July 20 from 1996, the third Monday from 2003, moved in 2020 and 2021", () => {
    const marine = (y: number) => base(y).filter((d) => d.endsWith("海の日"));
    assert.deepEqual(marine(1995), []);
    assert.deepEqual(marine(1996), ["07-20 海の日"]);
    assert.deepEqual(marine(2002), ["07-20 海の日"]);
    assert.deepEqual(marine(2003), ["07-21 海の日"]);
    assert.deepEqual(marine(2020), ["07-23 海の日"]);
    assert.deepEqual(marine(2021), ["07-22 海の日"]);
    assert.deepEqual(marine(2022), ["07-18 海の日"]);
  });
  test("Mountain Day: August 11 from 2016, moved in 2020 and 2021", () => {
    const mountain = (y: number) => base(y).filter((d) => d.endsWith("山の日"));
    assert.deepEqual(mountain(2015), []);
    assert.deepEqual(mountain(2016), ["08-11 山の日"]);
    assert.deepEqual(mountain(2020), ["08-10 山の日"]);
    assert.deepEqual(mountain(2021), ["08-08 山の日"]);
  });
  test("Respect for the Aged Day: September 15 from 1966, the third Monday from 2003", () => {
    const aged = (y: number) => base(y).filter((d) => d.endsWith("敬老の日"));
    assert.deepEqual(aged(1965), []);
    assert.deepEqual(aged(1966), ["09-15 敬老の日"]);
    assert.deepEqual(aged(2002), ["09-15 敬老の日"]);
    assert.deepEqual(aged(2004), ["09-20 敬老の日"]);
  });
  test("Health and Sports Day: October 10 from 1966, the second Monday from 2000; Sports Day in July in 2020 and 2021, in October from 2022", () => {
    const sports = (y: number) => base(y).filter((d) => /体育の日|スポーツの日/.test(d));
    assert.deepEqual(sports(1965), []);
    assert.deepEqual(sports(1966), ["10-10 体育の日"]);
    assert.deepEqual(sports(1999), ["10-10 体育の日"]);
    assert.deepEqual(sports(2000), ["10-09 体育の日"]);
    assert.deepEqual(sports(2019), ["10-14 体育の日"]);
    assert.deepEqual(sports(2020), ["07-24 スポーツの日"]);
    assert.deepEqual(sports(2021), ["07-23 スポーツの日"]);
    assert.deepEqual(sports(2022), ["10-10 スポーツの日"]);
  });
  test("special holidays of their year: kind special, without a key", () => {
    const special = baseHolidays(2019).filter((e) => e.kind === "special");
    assert.deepEqual(
      special.map((e) => [e.date, e.name, e.key, e.equinox]),
      [
        ["2019-05-01", "天皇の即位の日", undefined, false],
        ["2019-10-22", "即位礼正殿の儀の行われる日", undefined, false],
      ],
    );
    for (const date of ["1959-04-10", "1989-02-24", "1990-11-12", "1993-06-09"])
      assert.ok(
        baseHolidays(Number(date.slice(0, 4))).some((e) => e.date === date && e.kind === "special"),
        date,
      );
    assert.equal(
      baseHolidays(2026).some((e) => e.kind === "special"),
      false,
    );
  });
});

describe("computeJapaneseHolidays", () => {
  test("the base holidays with their properties, frozen and sorted by date", () => {
    const list = computeJapaneseHolidays(2026);
    assert.deepEqual(list[0], {
      date: "2026-01-01",
      name: "元日",
      nameEn: "New Year's Day",
      kind: "regular",
      confirmed: true,
      key: "new-year",
    });
    assert.ok(list.every((h) => Object.isFrozen(h)));
    assert.deepEqual(
      list.map((h) => h.date),
      list.map((h) => h.date).sort(),
    );
    assert.notEqual(computeJapaneseHolidays(2026), list);
  });
  test("a substitute holiday the day after a holiday on a Sunday, with the holiday's key", () => {
    // 2026-05-03 is a Sunday, and the 4th and 5th are holidays: the substitute is the 6th
    assert.deepEqual(on("2026-05-06"), {
      date: "2026-05-06",
      name: "振替休日",
      nameEn: "Substitute Holiday",
      kind: "substitute",
      confirmed: true,
      key: "constitution-memorial",
    });
    // 2024-02-11 is a Sunday
    assert.equal(on("2024-02-12")?.kind, "substitute");
    assert.equal(on("2024-02-12")?.key, "national-foundation");
  });
  test("substitute holidays start on April 12, 1973", () => {
    // 1973-02-11 and 1973-04-29 are Sundays
    assert.equal(on("1973-02-12"), undefined);
    assert.equal(on("1973-04-30")?.kind, "substitute");
    // 1967-01-15 is a Sunday
    assert.equal(on("1967-01-16"), undefined);
  });
  test("up to 2006 a Sunday holiday followed by a holiday has no substitute", () => {
    // 1992-05-03 is a Sunday: the 4th is the substitute
    assert.equal(on("1992-05-04")?.kind, "substitute");
    assert.equal(on("1992-05-06"), undefined);
    // 2008-05-04 is a Sunday (a holiday from 2007): moved past the 5th to the 6th
    assert.equal(on("2008-05-06")?.kind, "substitute");
    assert.equal(on("2008-05-06")?.key, "greenery");
  });
  test("a citizens' holiday on a day between two holidays, without a key", () => {
    assert.deepEqual(on("1988-05-04"), {
      date: "1988-05-04",
      name: "国民の休日",
      nameEn: "Citizens' Holiday",
      kind: "citizens",
      confirmed: true,
    });
    // 2015-09-21 (Respect for the Aged Day) and 2015-09-23 (Autumnal Equinox Day)
    assert.equal(on("2015-09-22")?.kind, "citizens");
    assert.equal(on("2026-09-22")?.kind, "citizens");
  });
  test("citizens' holidays start on December 27, 1985", () => {
    assert.equal(on("1985-05-04"), undefined);
    assert.equal(on("1987-05-04")?.kind, "substitute");
  });
  test("up to 2006 a Sunday or a substitute holiday is not a citizens' holiday", () => {
    // 1986-05-04 is a Sunday
    assert.equal(on("1986-05-04"), undefined);
    // 1998-05-03 is a Sunday: the 4th is its substitute, not a citizens' holiday
    assert.equal(on("1998-05-04")?.kind, "substitute");
  });
  test("special holidays count as holidays for substitute and citizens' holidays", () => {
    // 2019-04-29 (Showa Day), 2019-05-01 (special) and 2019-05-03: April 30 and May 2 are citizens' holidays
    assert.equal(on("2019-05-01")?.kind, "special");
    assert.equal("key" in on("2019-05-01")!, false);
    assert.equal(on("2019-04-30")?.kind, "citizens");
    assert.equal(on("2019-05-02")?.kind, "citizens");
  });
  test("confirmed is false only for equinox days of years after the confirmed year, and for days derived from them", () => {
    assert.ok(computeJapaneseHolidays(2027).every((h) => h.confirmed));
    const later = computeJapaneseHolidays(2028);
    assert.deepEqual(
      later.filter((h) => !h.confirmed).map((h) => h.key),
      ["vernal-equinox", "autumnal-equinox"],
    );
    // A year after the confirmed year whose vernal equinox day is a Sunday: its substitute is unconfirmed too
    let checked = 0;
    for (let y = 2028; y <= 2099; y++) {
      const list = computeJapaneseHolidays(y);
      const vernal = list.find((h) => h.key === "vernal-equinox" && h.kind === "regular")!;
      if (weekdayOf(vernal.date) !== 0) continue;
      const substitute = list.find((h) => h.key === "vernal-equinox" && h.kind === "substitute")!;
      assert.equal(substitute.confirmed, false, String(y));
      checked++;
    }
    assert.ok(checked > 0);
    // A citizens' holiday next to an unconfirmed equinox day (2032-09-21, between the 20th and the 22nd)
    const citizens = computeJapaneseHolidays(2032).find((h) => h.kind === "citizens");
    assert.equal(citizens?.date, "2032-09-21");
    assert.equal(citizens?.confirmed, false);
  });
  test("invalid-argument when the year is not an integer", () => {
    for (const year of ["2026", 2026.5, Number.NaN, null, undefined])
      assert.throws(() => computeJapaneseHolidays(year as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("out-of-range outside the supported years", () => {
    assert.throws(() => computeJapaneseHolidays(1954), {
      name: "RangeError",
      code: "out-of-range",
    });
    assert.throws(() => computeJapaneseHolidays(2100), { code: "out-of-range" });
    assert.equal(computeJapaneseHolidays(1955).length, 9);
    assert.ok(computeJapaneseHolidays(2099).length > 0);
  });
});

describe("sharedCalendar", () => {
  test("a calendar with the provider and default options; the same object on every call", () => {
    const calendar = sharedCalendar(jp);
    assert.equal(sharedCalendar(jp), calendar);
    assert.equal(calendar.isHoliday("2026-01-01"), true);
    // The defaults: holidays are closed, and no weekday is closed (2026-01-03 is a Saturday)
    assert.equal(calendar.isBusinessDay("2026-01-01"), false);
    assert.equal(calendar.isBusinessDay("2026-01-03"), true);
  });
  test("the provider is read on the first call only", () => {
    const other = { ...jp, id: "OTHER" };
    assert.equal(sharedCalendar(other), sharedCalendar(jp));
  });
});

describe("isHoliday", () => {
  test("true for a Japanese public holiday", () => {
    assert.equal(isHoliday("2026-01-01"), true);
    assert.equal(isHoliday("2026-05-06"), true);
    assert.equal(isHoliday("2026-01-02"), false);
  });
  test("an instant is read in Japan time", () => {
    assert.equal(isHoliday(new Date("2025-12-31T15:00:00Z")), true);
    assert.equal(isHoliday(new Date("2025-12-31T14:59:59Z")), false);
  });
  test("out-of-range outside the supported years, and the errors of the input", () => {
    assert.throws(() => isHoliday("1954-12-31"), { name: "RangeError", code: "out-of-range" });
    assert.throws(() => isHoliday("2100-01-01"), { code: "out-of-range" });
    assert.throws(() => isHoliday("2026-02-30"), { code: "invalid-date" });
    assert.throws(() => isHoliday(1 as never), { name: "TypeError", code: "invalid-input" });
  });
});

describe("holidayOn", () => {
  test("the holiday of the day, or undefined", () => {
    assert.equal(holidayOn("2026-01-01")?.name, "元日");
    assert.equal(holidayOn(new Date("2025-12-31T15:00:00Z"))?.key, "new-year");
    assert.equal(holidayOn("2026-01-02"), undefined);
  });
  test("the errors of isHoliday", () => {
    assert.throws(() => holidayOn("2100-01-01"), { name: "RangeError", code: "out-of-range" });
    assert.throws(() => holidayOn("2026-13-01"), { code: "invalid-date" });
  });
});

describe("holidaysInYear", () => {
  test("the holidays of the year, frozen and sorted by date", () => {
    const list = holidaysInYear(2026);
    assert.ok(Object.isFrozen(list));
    assert.equal(list[0]!.date, "2026-01-01");
    assert.equal(list.at(-1)!.date, "2026-11-23");
    assert.equal(list.length, 18);
  });
  test("invalid-argument when not an integer; out-of-range outside the supported years", () => {
    assert.throws(() => holidaysInYear("2026" as never), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.throws(() => holidaysInYear(1954), { code: "out-of-range" });
    assert.throws(() => holidaysInYear(2100), { code: "out-of-range" });
  });
});

describe("holidaysBetween", () => {
  test("the holidays of the period, both ends inclusive, frozen and sorted", () => {
    const list = holidaysBetween("2026-05-03", "2026-05-06");
    assert.deepEqual(
      list.map((h) => h.date),
      ["2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06"],
    );
    assert.ok(Object.isFrozen(list));
    assert.deepEqual(holidaysBetween("2026-05-07", "2026-05-08"), []);
    assert.deepEqual(
      holidaysBetween("2025-12-31", "2026-01-01").map((h) => h.date),
      ["2026-01-01"],
    );
  });
  test("invalid-range when from is after to", () => {
    assert.throws(() => holidaysBetween("2026-05-06", "2026-05-03"), {
      name: "RangeError",
      code: "invalid-range",
    });
  });
  test("out-of-range outside the supported years", () => {
    assert.throws(() => holidaysBetween("1954-12-01", "1955-01-31"), { code: "out-of-range" });
    assert.throws(() => holidaysBetween("2099-12-01", "2100-01-31"), { code: "out-of-range" });
  });
});

describe("toJapanDate", () => {
  test("the calendar date in Japan time", () => {
    assert.equal(toJapanDate(new Date("2025-12-31T15:00:00Z")), "2026-01-01");
    assert.equal(toJapanDate("2026-01-05T23:59"), "2026-01-05");
    assert.equal(toJapanDate("2026-01-05"), "2026-01-05");
  });
});

describe("toJapanDateTime", () => {
  test("the calendar date and the time HH:mm in Japan time, frozen", () => {
    const parts = toJapanDateTime(new Date("2025-12-31T15:07:00Z"));
    assert.deepEqual(parts, { date: "2026-01-01", time: "00:07" });
    assert.ok(Object.isFrozen(parts));
  });
  test("time is null for a date-only input", () => {
    assert.deepEqual(toJapanDateTime("2026-01-05"), { date: "2026-01-05", time: null });
  });
});

describe("getHoliday", () => {
  test("the same as holidayOn", () => {
    assert.equal(getHoliday("2026-01-01"), holidayOn("2026-01-01"));
    assert.equal(getHoliday("2026-01-02"), undefined);
    assert.throws(() => getHoliday("2100-01-01"), { name: "RangeError", code: "out-of-range" });
  });
});
