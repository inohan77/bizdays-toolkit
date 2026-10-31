/**
 * 規則の診断の性質のテスト。種を固定した乱数で、規則が重なりやすい設定を作り、
 * 「使われない・取り除いても結果が変わらない」と診断した規則を実際に取り除いて、結果が変わらないことを確かめる。
 *
 * - shadowed・never-matches … 取り除いても、dayInfoOn の結果（理由・名前を含む）が変わらない
 * - redundant              … 取り除いても、営業日かどうかが変わらない
 *
 * 種を変えて試すには: PROPERTY_SEED=123 node --test test/diagnose-properties.test.ts
 */

/**
 * 規則の診断の性質のテスト。目録（test/support/catalog.ts）から作った設定で、「使われない・取り除いても結果が変わらない」と
 * 診断した規則を実際に取り除き、対応年の短い自作の提供元（2025〜2027 年）の全日で結果が変わらないことを確かめる。
 *
 * - shadowed・never-matches … 取り除いても、dayInfoOn の結果（理由・名前を含む）が変わらない
 * - redundant              … 取り除いても、営業日かどうかが変わらない
 *
 * 判定の条件は診断にそろえる（outOfRangePolicy: "ignore"）。種を変えて試すには: PROPERTY_SEED=123 node --test test/diagnose-properties.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, createCalendar, type CalendarOptions } from "../src/index.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";
import { picker, random, randomCalendarOptions } from "./support/catalog.ts";
import { SHORT_DAYS, SHORT_KEYS, SHORT_KINDS, SHORT_PROVIDER } from "./support/provider.ts";

const SEED = Number(process.env["PROPERTY_SEED"] ?? 20261016);
const RUNS = 30;

type Options = Record<string, unknown> & { [key: string]: unknown };

/** 目録から設定を作る（祝日ありなら対応年の短い提供元。判定の条件は診断にそろえる） */
function randomOptions(rand: () => number, withHolidays: boolean): Options {
  const options = randomCalendarOptions(picker(rand), {
    holidays: withHolidays,
    kinds: SHORT_KINDS,
    keys: SHORT_KEYS,
    year: 2026,
    newShapes: true,
  });
  return {
    ...(withHolidays ? { holidayProvider: SHORT_PROVIDER, timeZone: "UTC" } : {}),
    outOfRangePolicy: "ignore",
    closedDates: [],
    openDates: [],
    closedAnnualDates: [],
    openRecurringRules: [],
    closedRecurringRules: [],
    ...options,
  };
}

/** "closedRecurringRules[2]" の規則を取り除いた設定 */
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
  let withPeriod = 0;
  let withInterval = 0;
  for (let run = 0; run < RUNS; run++) {
    const options = randomOptions(rand, run % 3 === 0);
    const describe = () =>
      `seed=${SEED} run=${run} ${JSON.stringify({ ...options, holidayProvider: options["holidayProvider"] ? "XX" : undefined })}`;
    const list = diagnoseCalendar(options);
    assert.ok(
      list.every((d) => d.severity !== "error"),
      `作成できる設定のはず: ${describe()}`,
    );
    const original = createCalendar(options as CalendarOptions);
    // 対応年の全日を比べる（抜き出しでは、数え方がずれる月・週の日を見落とす）
    const dates = SHORT_DAYS;
    for (const d of list) {
      if (d.code !== "shadowed" && d.code !== "never-matches" && d.code !== "redundant") continue;
      // 設定の項目（配列の要素）だけを取り除いて確かめる（unconfirmedHolidayPolicy などの redundant は対象外）
      if (!/^\w+\[\d+\]$/.test(d.path)) continue;
      found[d.code] = (found[d.code] ?? 0) + 1;
      const target = JSON.stringify(
        (options[d.path.replace(/\[\d+\]$/, "")] as unknown[])[
          Number(/\[(\d+)\]/.exec(d.path)![1])
        ],
      );
      if (target.includes("effective")) withPeriod++;
      if (target.includes("interval")) withInterval++;
      const reduced = createCalendar(remove(options, d.path) as CalendarOptions);
      for (const date of dates) {
        if (d.code === "redundant") {
          assert.equal(
            reduced.isBusinessDay(date),
            original.isBusinessDay(date),
            `${d.code} ${d.path} ${date}: ${describe()}`,
          );
        } else {
          // 規則を取り除くと後の規則の位置（optionPath）はずれるので、位置を除いて比べる
          const { optionPath: _r, rulePath: _r2, ...reducedInfo } = reduced.dayInfoOn(date);
          const { optionPath: _o, rulePath: _o2, ...originalInfo } = original.dayInfoOn(date);
          assert.deepEqual(reducedInfo, originalInfo, `${d.code} ${d.path} ${date}: ${describe()}`);
        }
      }
    }
  }
  // 性質が空振りしていない（診断が実際に出ている）ことも確かめる（never-matches は少ないので単体テストで確かめる）
  assert.ok(found["shadowed"]! > 0 && found["redundant"]! > 0, JSON.stringify(found));
  // 周期のある規則の診断は少ない（種によっては 0 件）ので、単体テストで確かめる
  assert.ok(
    withPeriod > 0,
    `有効期間のある規則にも診断が出ている: ${withPeriod} (interval: ${withInterval})`,
  );
});

test("性質: 第 n 営業日の規則がある設定でも、取り除いても変わらないと診断した項目は、取り除いても結果が変わらない", () => {
  const rand = random(SEED + 2);
  let checkedItems = 0;
  for (let run = 0; run < RUNS; run++) {
    const options = randomOptions(rand, run % 2 === 0);
    // 第 n 営業日の規則（月・週）を必ず入れ、個別の日付か毎年の月日も必ず入れる（数え方が変わる組み合わせ）
    const counting = [
      { businessDayOfMonth: [1, 2, -1][Math.floor(rand() * 3)]! },
      { businessDayOfWeek: [1, -1][Math.floor(rand() * 2)]!, weekStart: Math.floor(rand() * 2) },
    ][Math.floor(rand() * 2)]!;
    const key = rand() < 0.5 ? "closedRecurringRules" : "openRecurringRules";
    options[key] = [...(options[key] as unknown[]), counting];
    // 個別の日付を、規則が当てはまりやすい月初・週の始まりの近くに 1 つ足す
    options["closedDates"] = [
      ...(options["closedDates"] as unknown[]),
      addDays("2026-01-01", 30 * Math.floor(rand() * 12) + Math.floor(rand() * 7)),
    ];
    const describe = () =>
      `seed=${SEED + 2} run=${run} ${JSON.stringify({ ...options, holidayProvider: options["holidayProvider"] ? "XX" : undefined })}`;
    const original = createCalendar(options as CalendarOptions);
    for (const d of diagnoseCalendar(options)) {
      if (d.code !== "redundant" || !/^\w+\[\d+\]$/.test(d.path)) continue;
      checkedItems++;
      const reduced = createCalendar(remove(options, d.path) as CalendarOptions);
      for (const date of SHORT_DAYS) {
        assert.equal(
          reduced.isBusinessDay(date),
          original.isBusinessDay(date),
          `${d.path} ${date}: ${describe()}`,
        );
      }
    }
  }
  // 性質が空振りしていない（redundant が実際に出ている）ことも確かめる
  assert.ok(checkedItems > 0, `checked: ${checkedItems}`);
});
