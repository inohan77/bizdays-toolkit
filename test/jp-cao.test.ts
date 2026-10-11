import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { confirmedThrough, holidaysInYear } from "../src/jp/index.ts";

const fixture = readFileSync(new URL("./fixtures/cao-dates.txt", import.meta.url), "utf8")
  .split(/\r?\n/)
  .filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line));
const firstYear = Number(fixture[0]!.slice(0, 4));
const lastYear = Number(fixture.at(-1)!.slice(0, 4));

test("内閣府 CSV のすべての日付と一致する（1955 年〜CSV の最終年）", () => {
  const actual: string[] = [];
  for (let y = firstYear; y <= lastYear; y++) actual.push(...holidaysInYear(y).map((h) => h.date));
  assert.equal(firstYear, 1955);
  assert.deepEqual(actual, fixture);
});

test("CSV の最終年までは confirmed: true", () => {
  assert.ok(confirmedThrough <= lastYear, "confirmedThrough が CSV の範囲を超えている");
  for (let y = firstYear; y <= confirmedThrough; y++) {
    for (const h of holidaysInYear(y)) assert.equal(h.confirmed, true, h.date);
  }
});
