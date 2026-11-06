/**
 * 規則の診断の性質のテスト。目録（test/support/catalog.ts）から作った設定で、「使われない・取り除いても結果が変わらない」と
 * 診断した規則を実際に取り除き、結果が変わらないことを確かめる（設定の作り方は test/support/sites.ts）。
 *
 * - shadowed・never-matches … 取り除いても、dayInfoOn の結果（理由・名前を含む）が変わらない
 * - redundant              … 取り除いても、営業日かどうかが変わらない
 *
 * 対応年の短い自作の提供元（2025〜2027 年）と提供元なしの設定はその全日を、日本の提供元と提供元なしの一部の設定は
 * 日本の提供元の対応年の全日（1955〜2099 年）を比べる。判定の条件は診断にそろえる（outOfRangePolicy: "ignore"。31 番）。
 * 種を変えて試すには: PROPERTY_SEED=123 node --test test/diagnose-properties.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, type CalendarOptions } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";
import { random, type Obj } from "./support/catalog.ts";
import { daysOf, linesOf, removeItem } from "./support/compare.ts";
import { flagEnv, intEnv } from "./support/env.ts";
import {
  DIAGNOSE_PROPERTY,
  JP_FULL_RANGE,
  SHORT_RANGE,
  diagnoseOptions,
  diagnoseSourceOf,
  fullRangeSourceOf,
  withCountingRule,
} from "./support/sites.ts";
import { skipWhen } from "./support/skip.ts";

const SEED = intEnv("PROPERTY_SEED", DIAGNOSE_PROPERTY.seed);
/** 診断は暦日だけで決まるので、タイムゾーンを変えた実行（scripts/test-tz.ts）では 3 つとも飛ばす（オラクル・整合・変形と同じ） */
const SKIP_TZ = skipWhen("tz-run", flagEnv("BIZDAYS_TZ_RUN"));
// pnpm check は抜き出し（設定は毎回作り、確かめるのは run を sampleEvery で割った余りが 0 の試行だけ）。全件は DIAGNOSE_PROPERTY_FULL=1
const FULL = flagEnv("DIAGNOSE_PROPERTY_FULL");
const checked = (run: number): boolean => FULL || run % DIAGNOSE_PROPERTY.sampleEvery === 0;

/** 提供元の名前（"jp"）を本物にする */
const real = (options: Obj): Obj =>
  options["holidayProvider"] === "jp" ? { ...options, holidayProvider: jp } : options;
const describeOf = (seed: number, run: number, options: Obj): string =>
  `seed=${seed} run=${run} ${JSON.stringify({ ...options, holidayProvider: options["holidayProvider"] === undefined ? undefined : String((options["holidayProvider"] as { id?: string }).id ?? options["holidayProvider"]) })}`;

/** 期間の全日の結果（test/support/compare.ts の linesOf。full なら理由・名前・振替元まで） */
const snapshot = (options: Obj, range: { from: string; to: string }, full: boolean): string[] => {
  const lines = linesOf(
    createCalendar(options as CalendarOptions),
    daysOf(range.from, range.to),
    full,
  );
  // この範囲では投げない設定だけを試す。投げた日は "E:<code>" になり、取り除く前後で一致してしまうので、ここで失敗にする
  assert.ok(
    !lines.some((l) => l.startsWith("E:")),
    `投げた日がある: ${lines.find((l) => l.startsWith("E:"))}`,
  );
  return lines;
};

/** 設定の項目（配列の要素）に出た shadowed・never-matches・redundant を取り除き、期間の全日で結果を比べる */
function checkRemovals(
  options: Obj,
  range: { from: string; to: string },
  describe: () => string,
  found: Record<string, number>,
  codes: readonly string[] = ["shadowed", "never-matches", "redundant"],
): void {
  const list = diagnoseCalendar(options);
  assert.ok(
    list.every((d) => d.severity !== "error"),
    `作成できる設定のはず: ${describe()}`,
  );
  let open: string[] | undefined;
  let full: string[] | undefined;
  for (const d of list) {
    if (!codes.includes(d.code)) continue;
    // 設定の項目（配列の要素）だけを取り除いて確かめる（unconfirmedHolidayPolicy などの redundant は対象外）
    if (!/^\w+\[\d+\]$/.test(d.path)) continue;
    found[d.code] = (found[d.code] ?? 0) + 1;
    const target = JSON.stringify(
      (options[d.path.replace(/\[\d+\]$/, "")] as unknown[])[Number(/\[(\d+)\]/.exec(d.path)![1])],
    );
    if (target.includes("effective")) found["withPeriod"] = (found["withPeriod"] ?? 0) + 1;
    const reduced = removeItem(options, d.path);
    if (d.code === "redundant") {
      open ??= snapshot(options, range, false);
      assert.deepEqual(snapshot(reduced, range, false), open, `${d.code} ${d.path}: ${describe()}`);
    } else {
      full ??= snapshot(options, range, true);
      assert.deepEqual(snapshot(reduced, range, true), full, `${d.code} ${d.path}: ${describe()}`);
    }
  }
}

test(
  "性質: 使われない・取り除いても変わらないと診断した規則は、取り除いても結果が変わらない（短い提供元・提供元なしの全日）",
  { skip: SKIP_TZ },
  () => {
    const rand = random(SEED);
    const found: Record<string, number> = {};
    for (let run = 0; run < DIAGNOSE_PROPERTY.runs; run++) {
      const options = real(diagnoseOptions(rand, diagnoseSourceOf(run)));
      if (!checked(run)) continue;
      checkRemovals(options, SHORT_RANGE, () => describeOf(SEED, run, options), found);
    }
    // 性質が空振りしていない（診断が実際に出ている）ことも確かめる（never-matches は少ないので単体テストで確かめる）
    console.log(`# 確かめた診断: ${JSON.stringify(found)}`);
    assert.ok((found["shadowed"] ?? 0) > 0 && (found["redundant"] ?? 0) > 0, JSON.stringify(found));
    assert.ok(
      (found["withPeriod"] ?? 0) > 0,
      `有効期間のある規則にも診断が出ている: ${JSON.stringify(found)}`,
    );
  },
);

test(
  "性質: 第 n 営業日の規則がある設定でも、取り除いても変わらないと診断した項目は、取り除いても結果が変わらない",
  { skip: SKIP_TZ },
  () => {
    const seed = SEED + 2;
    const rand = random(seed);
    const found: Record<string, number> = {};
    for (let run = 0; run < DIAGNOSE_PROPERTY.countingRuns; run++) {
      const options = withCountingRule(
        rand,
        real(diagnoseOptions(rand, run % 2 === 0 ? "short" : "none")),
      );
      if (!checked(run)) continue;
      checkRemovals(options, SHORT_RANGE, () => describeOf(seed, run, options), found, [
        "redundant",
      ]);
    }
    console.log(`# 確かめた診断: ${JSON.stringify(found)}`);
    assert.ok((found["redundant"] ?? 0) > 0, `checked: ${JSON.stringify(found)}`);
  },
);

test(
  "性質: 日本の提供元の全範囲（1955〜2099 年）と、同じ範囲の提供元なしの設定でも、取り除いても結果が変わらない",
  { skip: SKIP_TZ },
  () => {
    const seed = SEED + 3;
    const rand = random(seed);
    const found: Record<string, number> = {};
    for (let run = 0; run < DIAGNOSE_PROPERTY.fullRangeRuns; run++) {
      const options = real(diagnoseOptions(rand, fullRangeSourceOf(run)));
      if (!checked(run)) continue;
      checkRemovals(options, JP_FULL_RANGE, () => describeOf(seed, run, options), found);
    }
    console.log(`# 確かめた診断: ${JSON.stringify(found)}`);
    assert.ok(
      Object.keys(found).length > 0,
      `診断が 1 件も出ていない（空振り）: ${JSON.stringify(found)}`,
    );
  },
);
