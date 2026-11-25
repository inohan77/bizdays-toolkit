import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { addDays, weekdayOf, type DateString } from "../src/index.ts";
import { easterSunday, nthWeekdayOfMonth } from "../src/provider/index.ts";
import { england, northernIreland, scotland, wales } from "../src/uk/index.ts";

interface Proclaimed {
  readonly date: string;
  readonly mode: string;
  readonly source: string;
}
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/uk-1974-1999-proclamations.json", import.meta.url), "utf8"),
) as {
  unverified: { division: string; date: string; holiday: string }[];
  unproclaimed: unknown[];
  years: Record<string, Record<string, Proclaimed[]>>;
};

const fmt = (y: number, m: number, d: number): DateString =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` as DateString;
const isWeekend = (d: DateString): boolean => weekdayOf(d) === 0 || weekdayOf(d) === 6;

/**
 * Schedule 1 of the 1971 Act (as of 1991-02-01; the government answer of 1976-12-08 lists the same content) and
 * the common-law holidays, written apart from the library.
 * Days that fall on a weekend are not listed (as in the GOV.UK list).
 */
function scheduleDays(year: number, division: string): Set<string> {
  const easter = easterSunday(year);
  const days: DateString[] = [addDays(easter, -2) as DateString];
  const sunday = (d: DateString): boolean => weekdayOf(d) === 0;
  if (division === "scotland") {
    const jan1 = fmt(year, 1, 1);
    const jan2 = fmt(year, 1, 2);
    days.push(sunday(jan1) ? fmt(year, 1, 3) : jan1, sunday(jan2) ? fmt(year, 1, 3) : jan2);
    days.push(
      nthWeekdayOfMonth(year, 5, 1, 1) as DateString,
      nthWeekdayOfMonth(year, 8, 1, 1) as DateString,
    );
    const dec25 = fmt(year, 12, 25);
    days.push(sunday(dec25) ? fmt(year, 12, 26) : dec25);
  } else {
    days.push(addDays(easter, 1) as DateString);
    days.push(
      nthWeekdayOfMonth(year, 5, 1, -1) as DateString,
      nthWeekdayOfMonth(year, 8, 1, -1) as DateString,
    );
    days.push(fmt(year, 12, 25)); // a common-law holiday
    const dec26 = fmt(year, 12, 26);
    if (!sunday(dec26)) days.push(dec26);
    if (sunday(fmt(year, 12, 25)) || sunday(dec26)) days.push(fmt(year, 12, 27));
    if (division === "northern-ireland") {
      const mar17 = fmt(year, 3, 17);
      days.push(sunday(mar17) ? fmt(year, 3, 18) : mar17);
    }
  }
  return new Set(days.filter((d) => !isWeekend(d)));
}

const providers = [
  ["england-and-wales", england],
  ["england-and-wales", wales],
  ["scotland", scotland],
  ["northern-ireland", northernIreland],
] as const;

test("英国 1974〜1999 年: すべての祝日が、Schedule 1 の日か、The Gazette の布告・Order で指定された日か、unverified に記録した日のどれかである", () => {
  for (let year = 1974; year <= 1999; year++) {
    const data = fixture.years[String(year)] ?? {};
    for (const [division, provider] of providers) {
      const expected = scheduleDays(year, division);
      for (const p of data[division] ?? []) {
        expected.add(p.date);
        const m = /^in-place-of (\d{4}-\d{2}-\d{2})$/.exec(p.mode);
        if (m) expected.delete(m[1]!);
      }
      for (const u of fixture.unverified)
        if (u.division === division && u.date.startsWith(`${year}-`)) expected.add(u.date);
      // Moves: Spring of 1977 in England, Wales and NI (May 30 → June 6), Early May of 1995 (May 1 → May 8)
      if (division !== "scotland" && year === 1977) expected.delete("1977-05-30");
      if (division !== "scotland" && year === 1995) expected.delete("1995-05-01");
      const actual = provider.holidaysInYear(year).map((h) => h.date);
      assert.deepEqual(actual, [...expected].sort(), `${provider.id} ${year}`);
      assert.equal(new Set(actual).size, actual.length);
      for (const h of provider.holidaysInYear(year)) assert.equal(h.confirmed, true);
    }
  }
  assert.deepEqual(fixture.unproclaimed, [], "Scotland の土曜日の祝日で指定が見つからない年はない");
});

test("英国 1974〜1999 年: 毎年布告される日の始まり（Early May は 1978 年、Scotland の Spring は 1978 年、New Year’s Day は 1974 年）と臨時の祝日", () => {
  assert.equal(
    england.holidaysInYear(1977).some((h) => h.key === "early-may"),
    false,
  );
  assert.equal(england.holidaysInYear(1978).find((h) => h.key === "early-may")?.date, "1978-05-01");
  assert.equal(
    scotland.holidaysInYear(1977).some((h) => h.key === "spring"),
    false,
  );
  assert.equal(scotland.holidaysInYear(1978).find((h) => h.key === "spring")?.date, "1978-05-29");
  assert.equal(
    scotland.holidaysInYear(1977).find((h) => h.key === "early-may")?.date,
    "1977-05-02",
    "Scotland の 5 月第 1 月曜は附則",
  );
  assert.equal(england.holidaysInYear(1974).find((h) => h.key === "new-year")?.date, "1974-01-01");
  // Silver Jubilee of 1977: England, Wales and NI moved Spring to June 6 and added the 7th; Scotland only the 6th
  assert.deepEqual(
    england
      .holidaysInYear(1977)
      .filter((h) => h.date.startsWith("1977-06"))
      .map((h) => [h.date, h.kind, h.key ?? "-"]),
    [
      ["1977-06-06", "regular", "spring"],
      ["1977-06-07", "special", "-"],
    ],
  );
  assert.deepEqual(
    scotland
      .holidaysInYear(1977)
      .filter((h) => h.date.startsWith("1977-06"))
      .map((h) => [h.date, h.kind]),
    [["1977-06-06", "special"]],
  );
  // The Royal Wedding of 1981 and the millennium of 1999 are in every region
  for (const p of [england, scotland, northernIreland]) {
    assert.equal(
      p.holidaysInYear(1981).find((h) => h.date === "1981-07-29")?.kind,
      "special",
      p.id,
    );
    assert.equal(
      p.holidaysInYear(1999).find((h) => h.date === "1999-12-31")?.name,
      "Additional bank holiday (Millennium)",
      p.id,
    );
  }
  // 50th anniversary of VE Day in 1995: Early May is May 8 in England, Wales and NI; Scotland has May 1
  // (schedule) plus the 8th
  assert.deepEqual(
    england
      .holidaysInYear(1995)
      .filter((h) => h.date.startsWith("1995-05"))
      .map((h) => [h.date, h.key ?? h.name]),
    [
      ["1995-05-08", "early-may"],
      ["1995-05-29", "spring"],
    ],
  );
  assert.deepEqual(
    scotland
      .holidaysInYear(1995)
      .filter((h) => h.date.startsWith("1995-05"))
      .map((h) => [h.date, h.key ?? h.name]),
    [
      ["1995-05-01", "early-may"],
      ["1995-05-08", "Additional bank holiday (VE Day 50th anniversary)"],
      ["1995-05-29", "spring"],
    ],
  );
});

test("英国 1974〜1999 年: 振替日の割り当て（布告と Hansard の文言どおり）", () => {
  const on = (p: typeof england, date: string) =>
    p.holidaysInYear(Number(date.slice(0, 4))).find((h) => h.date === date);
  // Years with December 25 on a Saturday: the 27th is Boxing Day and the 28th is in lieu of Christmas Day
  for (const year of [1976, 1982, 1993, 1999]) {
    for (const p of [england, scotland, northernIreland]) {
      assert.equal(on(p, `${year}-12-27`)?.key, "boxing-day", `${p.id} ${year}`);
      assert.equal(on(p, `${year}-12-28`)?.key, "christmas", `${p.id} ${year}`);
    }
  }
  // Scotland in years with January 1 on a Saturday: the 3rd is 2nd January (schedule), the 4th in lieu of New
  // Year’s Day
  for (const year of [1977, 1983, 1994]) {
    assert.equal(on(scotland, `${year}-01-03`)?.key, "2nd-january", String(year));
    assert.equal(on(scotland, `${year}-01-04`)?.key, "new-year", String(year));
  }
  // Scotland in years with January 2 on a Saturday: the 4th is in lieu of 2nd January
  for (const year of [1982, 1988, 1993, 1999]) {
    assert.equal(on(scotland, `${year}-01-04`)?.key, "2nd-january", String(year));
    assert.equal(on(scotland, `${year}-01-04`)?.kind, "substitute", String(year));
  }
  // Scotland in years with December 25 on a Sunday: the 26th is Christmas Day (schedule), the 27th Boxing Day
  // (proclamation)
  for (const year of [1977, 1983, 1988, 1994]) {
    assert.equal(on(scotland, `${year}-12-26`)?.key, "christmas", String(year));
    assert.equal(on(scotland, `${year}-12-27`)?.key, "boxing-day", String(year));
    assert.equal(on(england, `${year}-12-26`)?.key, "boxing-day", String(year));
    assert.equal(on(england, `${year}-12-27`)?.key, "christmas", String(year));
  }
  // Years with December 26 on a Saturday: the 28th is in lieu of Boxing Day
  for (const year of [1981, 1987, 1992, 1998]) {
    for (const p of [england, scotland, northernIreland])
      assert.equal(on(p, `${year}-12-28`)?.key, "boxing-day", `${p.id} ${year}`);
  }
  // Substitutes as in the Orders of NI
  assert.equal(on(northernIreland, "1979-03-19")?.key, "st-patricks");
  assert.equal(on(northernIreland, "1984-03-19")?.key, "st-patricks");
  assert.equal(on(northernIreland, "1980-07-14")?.key, "battle-of-the-boyne");
  assert.equal(on(northernIreland, "1981-07-13")?.key, "battle-of-the-boyne");
});
