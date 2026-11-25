import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createCalendar } from "../src/index.ts";
import { england, northernIreland, scotland, wales } from "../src/uk/index.ts";

interface Entry {
  readonly date: string;
  readonly title: string;
}
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/uk-2000-2011-government-lists.json", import.meta.url), "utf8"),
) as {
  years: Record<string, Record<string, Entry[] | Record<string, string>>>;
  knownDifferences: { division: string; date: string; listedAs: string }[];
};

/**
 * Brings the wording of the government lists (which varies between DTI, BERR, directgov, the Scottish
 * Executive/Government and nidirect) to the library's names.
 * Notes in parentheses ("(or in lieu of 1 Jan)", "(substitute day)") and case are ignored
 */
const ALIASES: Readonly<Record<string, string>> = {
  "new years day": "new year's day",
  "new year": "2nd january", // DTI 2000: "New Year (or in lieu of 2 Jan)"
  "substitute bank holiday in lieu of 26th": "boxing day", // DTI 2004
  "substitute bank holiday in lieu of 25th": "christmas day", // DTI 2004
  "golden jubilee holiday": "golden jubilee bank holiday", // Scottish Executive 2002
  "royal wedding": "royal wedding bank holiday", // directgov, nidirect 2011
};
const normalize = (title: string): string => {
  const base = title
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim();
  return ALIASES[base] ?? base;
};
/**
 * Days with the same date whose name differs from the government list (recorded with the source. dates are
 * authoritative, names follow the library's conventions)
 */
const NAME_DIFFERENCES: readonly {
  division: string;
  date: string;
  listed: string;
  library: string;
}[] = [
  {
    division: "scotland",
    date: "2002-06-04",
    listed: "Golden Jubilee Holiday (in place of 27 May 2002)",
    library: "Spring bank holiday", // Spring moved from May 27 to June 4 (Spring Bank Holiday in the lists of England, Wales, NI)
  },
];

const providers = [
  ["england-and-wales", england],
  ["england-and-wales", wales],
  ["scotland", scotland],
  ["northern-ireland", northernIreland],
] as const;

test("英国 2000〜2011 年: 当時の政府の公表一覧のすべての日付と名称に一致する（名称の既知の違いを除く）", () => {
  for (const [year, data] of Object.entries(fixture.years)) {
    for (const [division, provider] of providers) {
      const expected = (data[division] as Entry[]).map((e) => {
        const diff = NAME_DIFFERENCES.find((d) => d.division === division && d.date === e.date);
        return `${e.date} ${normalize(diff ? diff.library : e.title)}`;
      });
      const actual = provider
        .holidaysInYear(Number(year))
        .map((h) => `${h.date} ${normalize(h.name)}`);
      assert.deepEqual(actual, expected, `${provider.id} ${year}`);
      for (const h of provider.holidaysInYear(Number(year))) assert.equal(h.confirmed, true);
    }
  }
});

test("英国 2000〜2011 年: 布告のない 3 日（Scotland 2010-01-04・2010-12-27・2011-01-04）は、政府の一覧に従って祝日として返す", () => {
  assert.deepEqual(
    fixture.knownDifferences.map((d) => `${d.division} ${d.date}`),
    ["scotland 2010-01-04", "scotland 2011-01-04", "scotland 2010-12-27"],
  );
  const edinburgh = createCalendar({ holidayProvider: scotland, closedWeekdays: [0, 6] });
  for (const d of fixture.knownDifferences) {
    const holiday = scotland
      .holidaysInYear(Number(d.date.slice(0, 4)))
      .find((h) => h.date === d.date);
    assert.ok(holiday, d.date);
    assert.equal(holiday.kind, "substitute", d.date);
    assert.equal(edinburgh.isBusinessDay(d.date), false, d.date);
  }
  // 2000 and 2005, with the same weekdays, had proclamations: January 4 is the substitute for New Year’s Day
  // (January 3 is 2nd January by the schedule)
  for (const year of [2000, 2005]) {
    const jan = scotland.holidaysInYear(year).filter((h) => h.date.startsWith(`${year}-01`));
    assert.deepEqual(
      jan.map((h) => [h.date, h.name, h.kind, h.key]),
      [
        [`${year}-01-03`, "2nd January", "substitute", "2nd-january"],
        [`${year}-01-04`, "New Year’s Day", "substitute", "new-year"],
      ],
      String(year),
    );
  }
  // 2011 is the reverse (January 3 New Year’s Day, the 4th 2nd January, as in the list of the time)
  assert.deepEqual(
    scotland
      .holidaysInYear(2011)
      .slice(0, 2)
      .map((h) => [h.date, h.name]),
    [
      ["2011-01-03", "New Year’s Day"],
      ["2011-01-04", "2nd January"],
    ],
  );
});

test("英国 2000〜2011 年: 規則の境界（St Andrew's Day は 2007 年から、臨時の祝日と移動、振替の割り当て）", () => {
  assert.equal(
    scotland.holidaysInYear(2006).some((h) => h.key === "st-andrews"),
    false,
  );
  assert.equal(
    scotland.holidaysInYear(2007).find((h) => h.key === "st-andrews")?.date,
    "2007-11-30",
  );
  assert.equal(
    scotland.holidaysInYear(2008).find((h) => h.key === "st-andrews")?.date,
    "2008-12-01",
  );
  // Golden Jubilee of 2002: June 3 is the special day, and Spring moves from May 27 to June 4
  for (const p of [england, scotland, northernIreland]) {
    const june = p
      .holidaysInYear(2002)
      .filter((h) => h.date.startsWith("2002-06") || h.date === "2002-05-27");
    assert.deepEqual(
      june.map((h) => [h.date, h.kind, h.key ?? "-"]),
      [
        ["2002-06-03", "special", "-"],
        ["2002-06-04", "regular", "spring"],
      ],
      p.id,
    );
    assert.equal(p.holidaysInYear(2011).find((h) => h.date === "2011-04-29")?.kind, "special");
  }
  // December 2004 (the 25th a Saturday, the 26th a Sunday): the 27th is Boxing Day and the 28th the substitute
  // for Christmas Day (the list and proclamation of the time)
  assert.deepEqual(
    england
      .holidaysInYear(2004)
      .slice(-2)
      .map((h) => [h.date, h.key]),
    [
      ["2004-12-27", "boxing-day"],
      ["2004-12-28", "christmas"],
    ],
  );
  // 2021 (the same weekdays) follows the assignment of GOV.UK: the 27th Christmas Day, the 28th Boxing Day
  assert.deepEqual(
    england
      .holidaysInYear(2021)
      .slice(-2)
      .map((h) => [h.date, h.key]),
    [
      ["2021-12-27", "christmas"],
      ["2021-12-28", "boxing-day"],
    ],
  );
  // The substitutes of July 12 and March 17 in Northern Ireland follow the Orders of the Secretary of State
  const ni = (date: string) =>
    northernIreland.holidaysInYear(Number(date.slice(0, 4))).find((h) => h.date === date);
  assert.equal(ni("2003-07-14")?.key, "battle-of-the-boyne");
  assert.equal(ni("2009-07-13")?.key, "battle-of-the-boyne");
  assert.equal(ni("2001-03-19")?.key, "st-patricks");
  assert.equal(ni("2002-03-18")?.key, "st-patricks");
});
