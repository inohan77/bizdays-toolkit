import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { HolidayProvider } from "../src/index.ts";
import { england, northernIreland, scotland, wales, type UkHolidayKind } from "../src/uk/index.ts";

// 提供元の項目を使う（英国の提供元はどれも同じ値。モジュールの定数 confirmedThrough は非推奨）
const confirmedThrough = england.confirmedThrough!;

interface Event {
  readonly date: string;
  readonly title: string;
  readonly notes: string;
}

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/govuk-bank-holidays.json", import.meta.url), "utf8"),
) as { years: Record<string, string>; divisions: Record<string, Event[]> };
const welsh = JSON.parse(
  readFileSync(new URL("./fixtures/govuk-bank-holiday-names-cy.json", import.meta.url), "utf8"),
) as { names: Record<string, string> };

const years = Object.keys(fixture.years).map(Number);
const firstYear = Math.min(...years);
const lastYear = Math.max(...years);

const cases: [string, HolidayProvider<UkHolidayKind>, string][] = [
  ["England", england, "england-and-wales"],
  ["Wales", wales, "england-and-wales"],
  ["Scotland", scotland, "scotland"],
  ["Northern Ireland", northernIreland, "northern-ireland"],
];

/**
 * GOV.UK が「Substitute day」としているが、このライブラリでは振替ではなく移動（regular）とする日。
 * 2012 年の Spring bank holiday は布告で 6 月 4 日に移された（同じ年の Northern Ireland には注記がない）
 */
const MOVED_NOT_SUBSTITUTE = new Set(["england-and-wales 2012-06-04", "scotland 2012-06-04"]);

for (const [label, provider, division] of cases) {
  const events = fixture.divisions[division]!;

  test(`${label}: GOV.UK のすべての日付と名称に一致する（2012 年〜フィクスチャの最終年）`, () => {
    assert.equal(firstYear, 2012);
    const actual: string[] = [];
    for (let y = firstYear; y <= lastYear; y++) {
      actual.push(...provider.holidaysInYear(y).map((h) => `${h.date} ${h.name}`));
    }
    assert.deepEqual(
      actual,
      events.map((e) => `${e.date} ${e.title}`),
    );
  });

  test(`${label}: GOV.UK の振替の注記と種別が一致する`, () => {
    for (const e of events) {
      const h = provider.holidaysInYear(Number(e.date.slice(0, 4))).find((x) => x.date === e.date)!;
      const substitute =
        e.notes === "Substitute day" && !MOVED_NOT_SUBSTITUTE.has(`${division} ${e.date}`);
      assert.equal(h.kind === "substitute", substitute, e.date);
      if (e.notes === "Extra bank holiday") assert.equal(h.kind, "special", e.date);
    }
  });
}

test("フィクスチャの最終年までは confirmed: true、それより後は false", () => {
  assert.ok(confirmedThrough <= lastYear, "confirmedThrough がフィクスチャの範囲を超えている");
  for (const [, provider] of cases) {
    for (let y = firstYear; y <= confirmedThrough; y++) {
      for (const h of provider.holidaysInYear(y)) assert.equal(h.confirmed, true, h.date);
    }
    for (const h of provider.holidaysInYear(confirmedThrough + 1)) assert.equal(h.confirmed, false);
  }
});

test("Wales の祝日には GOV.UK のウェールズ語版の名称が付き、ほかの地域には付かない", () => {
  for (let y = firstYear; y <= lastYear; y++) {
    for (const h of wales.holidaysInYear(y)) {
      assert.deepEqual(h.names, { cy: welsh.names[h.name] }, `${h.date} ${h.name}`);
    }
    for (const provider of [england, scotland, northernIreland]) {
      for (const h of provider.holidaysInYear(y)) assert.equal(h.names, undefined);
    }
  }
});
