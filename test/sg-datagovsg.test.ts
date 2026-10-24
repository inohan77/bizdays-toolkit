import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sg } from "../src/sg/index.ts";

interface Record_ {
  readonly date: string;
  readonly day: string;
  readonly holiday: string;
}
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/datagovsg-public-holidays.json", import.meta.url), "utf8"),
) as {
  years: Record<string, Record_[]>;
  knownDifferences: {
    libraryOnly: { date: string; holiday: string }[];
    dataOnly: { date: string; holiday: string }[];
  };
};
const normalize = (name: string): string => name.replace(/'/g, "’");
const label = (r: { date: string; holiday: string }): string => `${r.date} ${normalize(r.holiday)}`;
const years = Object.keys(fixture.years).map(Number).sort();

test("シンガポール: data.gov.sg（MOM）のすべての日付と名称に一致する（既知の差分を除く）", () => {
  assert.equal(Math.min(...years), sg.supportedYears.from);
  assert.equal(Math.max(...years), sg.supportedYears.to);
  const libraryOnly = fixture.knownDifferences.libraryOnly.map(label);
  const dataOnly = fixture.knownDifferences.dataOnly.map(label);
  for (const year of years) {
    const expected = fixture.years[String(year)]!.map(label).filter((x) => !dataOnly.includes(x));
    const actual = sg
      .holidaysInYear(year)
      .map((h) => `${h.date} ${h.name}${h.kind === "substitute" ? " (Observed)" : ""}`)
      .filter((x) => !libraryOnly.includes(x));
    assert.deepEqual(actual, expected, String(year));
  }
});

test("シンガポール: 既知の差分は 2022 年の 6 件だけで、ライブラリは MOM の改定後の告示に従う", () => {
  const { libraryOnly, dataOnly } = fixture.knownDifferences;
  assert.ok([...libraryOnly, ...dataOnly].every((d) => d.date.startsWith("2022-")));
  assert.equal(libraryOnly.length + dataOnly.length, 6);
  const list = sg.holidaysInYear(2022).map((h) => [h.date, h.name, h.kind]);
  assert.deepEqual(
    list.filter(([d]) => d! >= "2022-05-01" && d! <= "2022-07-11"),
    [
      ["2022-05-01", "Labour Day", "regular"],
      ["2022-05-02", "Labour Day", "substitute"],
      ["2022-05-03", "Hari Raya Puasa", "regular"],
      ["2022-05-15", "Vesak Day", "regular"],
      ["2022-05-16", "Vesak Day", "substitute"],
      ["2022-07-10", "Hari Raya Haji", "regular"],
      ["2022-07-11", "Hari Raya Haji", "substitute"],
    ],
  );
});

test("シンガポール: data.gov.sg の曜日の列と (Observed) の付き方が、ライブラリの曜日と種別に一致する", () => {
  const dataOnly = fixture.knownDifferences.dataOnly.map(label);
  for (const year of years) {
    for (const r of fixture.years[String(year)]!) {
      if (dataOnly.includes(label(r))) continue;
      const h = sg.holidaysInYear(year).find((x) => x.date === r.date)!;
      assert.ok(h, r.date);
      assert.equal(h.kind === "substitute", r.holiday.endsWith("(Observed)"), r.date);
      assert.equal(
        ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
          new Date(`${r.date}T00:00:00Z`).getUTCDay()
        ],
        r.day,
        r.date,
      );
    }
  }
});
