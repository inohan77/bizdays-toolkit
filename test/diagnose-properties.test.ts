/**
 * 規則の診断の性質のテスト。種を固定した乱数で、規則が重なりやすい設定を作り、
 * 「使われない・取り除いても結果が変わらない」と診断した規則を実際に取り除いて、結果が変わらないことを確かめる。
 *
 * - shadowed・never-matches … 取り除いても、dayInfo の結果（理由・名前を含む）が変わらない
 * - redundant              … 取り除いても、営業日かどうかが変わらない
 *
 * 種を変えて試すには: PROPERTY_SEED=123 node --test test/diagnose-properties.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, createCalendar, type CalendarOptions } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";

const SEED = Number(process.env["PROPERTY_SEED"] ?? 20261016);
const RUNS = 30;
const SAMPLES = 400;

/** mulberry32: 種から決まる、再現可能な乱数 */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Options = Record<string, unknown> & { [key: string]: unknown };

/** 規則が重なりやすいよう、値の候補を絞って設定を作る */
function randomOptions(rand: () => number, withHolidays: boolean): Options {
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)]!;
  const date = () => addDays("2026-01-01", int(0, 120));
  const rule = () => {
    const base =
      rand() < 0.6
        ? {
            weekday: pick([1, 3, 6]),
            ...(rand() < 0.6 ? { nth: pick([1, 2, -1, [4, 5], [1, 3]]) } : {}),
          }
        : { day: pick([1, 7, 30, 31, -1, [1, 2, 3, 4, 5, 6, 7], [30, 31]]) };
    return {
      ...base,
      ...(rand() < 0.3 ? { months: pick([[2], [1, 2], [2, 4, 6, 9, 11]]) } : {}),
      onHolidayRule: pick(["under-holiday", "over-holiday", "after-holiday"]),
    };
  };
  const annual = () =>
    rand() < 0.5
      ? pick(["01-01", "02-29", "12-31", "05-05"])
      : pick([
          { from: "12-29", to: "01-03" },
          { from: "12-30", to: "01-02" },
          { from: "05-01", to: "05-06" },
        ]);
  const dates = () => {
    if (rand() < 0.5) return date();
    const from = date();
    return { from, to: addDays(from, int(0, 20)) };
  };
  const list = <T>(make: () => T, max: number) => Array.from({ length: int(0, max) }, make);
  return {
    ...(withHolidays ? { holidays: jp } : {}),
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6].filter(() => rand() < 0.25),
    holidayPolicy: pick(["closed", "open", "ignore"]),
    openDates: list(dates, 2),
    closedDates: list(dates, 3),
    closedAnnual: list(annual, 3),
    openRecurring: list(rule, 2),
    closedRecurring: list(rule, 4),
  };
}

/** "closedRecurring[2]" の規則を取り除いた設定 */
function remove(options: Options, path: string): Options {
  const m = /^(\w+)\[(\d+)\]$/.exec(path);
  assert.ok(m, `unexpected path ${path}`);
  const key = m[1]!;
  const index = Number(m[2]);
  return { ...options, [key]: (options[key] as unknown[]).filter((_, i) => i !== index) };
}

test("性質: 使われない・取り除いても変わらないと診断した規則は、取り除いても結果が変わらない", () => {
  const rand = random(SEED);
  const found: Record<string, number> = { shadowed: 0, "never-matches": 0, redundant: 0 };
  for (let run = 0; run < RUNS; run++) {
    const options = randomOptions(rand, run % 3 === 0);
    const describe = () =>
      `seed=${SEED} run=${run} ${JSON.stringify({ ...options, holidays: options["holidays"] ? "jp" : undefined })}`;
    const list = diagnoseCalendar(options);
    assert.ok(
      list.every((d) => d.severity !== "error"),
      `作成できる設定のはず: ${describe()}`,
    );
    const original = createCalendar(options as CalendarOptions);
    const dates = Array.from({ length: SAMPLES }, (_, i) =>
      // 規則の日付の周辺と、28 年の周期をまたぐ年を混ぜる
      i % 2 === 0
        ? addDays("2025-12-01", Math.floor(rand() * 200))
        : addDays("1960-01-01", Math.floor(rand() * 365 * 130)),
    );
    for (const d of list) {
      if (d.code !== "shadowed" && d.code !== "never-matches" && d.code !== "redundant") continue;
      found[d.code] = (found[d.code] ?? 0) + 1;
      const reduced = createCalendar(remove(options, d.path) as CalendarOptions);
      for (const date of dates) {
        if (d.code === "redundant") {
          assert.equal(
            reduced.isBusinessDay(date),
            original.isBusinessDay(date),
            `${d.code} ${d.path} ${date}: ${describe()}`,
          );
        } else {
          assert.deepEqual(
            reduced.dayInfo(date),
            original.dayInfo(date),
            `${d.code} ${d.path} ${date}: ${describe()}`,
          );
        }
      }
    }
  }
  // 性質が空振りしていない（診断が実際に出ている）ことも確かめる（never-matches は少ないので単体テストで確かめる）
  assert.ok(found["shadowed"]! > 0 && found["redundant"]! > 0, JSON.stringify(found));
});
