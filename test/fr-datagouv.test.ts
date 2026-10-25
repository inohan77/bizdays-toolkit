import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { alsaceMoselle, metropole } from "../src/fr/index.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/datagouv-jours-feries.json", import.meta.url), "utf8"),
) as { zones: Record<string, Record<string, string>> };

for (const [zone, provider] of [
  ["metropole", metropole],
  ["alsace-moselle", alsaceMoselle],
] as const) {
  test(`フランス（${zone}）: data.gouv.fr のすべての日付と名称に一致する（公開されている全年）`, () => {
    const data = fixture.zones[zone]!;
    const years = [...new Set(Object.keys(data).map((d) => Number(d.slice(0, 4))))].sort();
    assert.ok(years.length >= 20, "過去 20 年・未来 5 年の窓");
    for (const year of years) {
      const expected = Object.entries(data)
        .filter(([d]) => d.startsWith(`${year}-`))
        .map(([d, n]) => `${d} ${n}`);
      const actual = provider.holidaysInYear(year).map((h) => `${h.date} ${h.name}`);
      assert.deepEqual(actual, expected, `${zone} ${year}`);
    }
  });
}
