/**
 * 規則の診断の性質のテスト。目録（test/support/catalog.ts）から作った設定で、「使われない・取り除いても結果が変わらない」と
 * 診断した規則を実際に取り除き、結果が変わらないことを確かめる（設定の作り方は test/support/sites.ts）。
 *
 * - shadowed・never-matches … 取り除いても、dayInfoOn の結果（理由・名前を含む）が変わらない
 * - redundant              … 出た項目（shadowed・never-matches を含む）をまとめて取り除いても、営業日かどうかが変わらない
 *   （逐次除去。docs/decisions.md の 31 番）
 *
 * 対応年の短い自作の提供元（2025〜2027 年）と提供元なしの設定はその全日を、日本の提供元と提供元なしの一部の設定は
 * 日本の提供元の対応年の全日（1955〜2099 年）を比べる。判定の条件は診断にそろえる（outOfRangePolicy: "ignore"。31 番）。
 * pnpm check は短い提供元・提供元なしの性質だけを抜き出しで動かし、第 n 営業日の規則のある設定と日本の全範囲は
 * DIAGNOSE_PROPERTY_FULL=1（CI の diagnose-consistency ジョブ）で動かす。
 *
 * 0.32.8 で足した 2 つの性質（範囲の外と長い日付、日本の提供元の "throw"）は、項目の主張そのものを、全日の判定で確かめる:
 * 出た項目（shadowed・never-matches・redundant と、「never used」と出た対応年の外の規則）をまとめて取り除いても、取り除く前に
 * 判定できた日の結果（値か例外の code）が変わらない（取り除く前から判定できない日は約束の外。31 番）、no-business-day が
 * 出た設定には営業日が 1 日もない、自分の設定を基準に数える規則の never-matches には当てはまる日が本当にない。
 * どちらも pnpm check は DIAGNOSE_WIDE.sampleEvery 件に 1 件の抜き出しで、全件は DIAGNOSE_PROPERTY_FULL=1。
 * 種を変えて試すには: PROPERTY_SEED=123 node --test test/diagnose-properties.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, type CalendarOptions } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { CALENDAR_REF, random, type Obj } from "./support/catalog.ts";
import { daysOf, linesOf, removeItem, shiftDays, weekdayOfDay } from "./support/compare.ts";
import { flagEnv, intEnv } from "./support/env.ts";
import { skipWhen } from "./support/skip.ts";
import {
  DIAGNOSE_PROPERTY,
  DIAGNOSE_WIDE,
  JP_FULL_RANGE,
  SHORT_RANGE,
  WIDE_RANGE,
  diagnoseOptions,
  diagnoseSourceOf,
  diagnoseThrowOptions,
  diagnoseWideOptions,
  fullRangeSourceOf,
  throwKindOf,
  withCountingRule,
} from "./support/sites.ts";

const SEED = intEnv("PROPERTY_SEED", DIAGNOSE_PROPERTY.seed);
// pnpm check は抜き出し（設定は毎回作り、確かめるのは run を sampleEvery で割った余りが 0 の試行だけ）。全件は DIAGNOSE_PROPERTY_FULL=1
const FULL = flagEnv("DIAGNOSE_PROPERTY_FULL");
const checked = (run: number): boolean => FULL || run % DIAGNOSE_PROPERTY.sampleEvery === 0;
/** 第 n 営業日の規則のある設定と日本の全範囲は、短い提供元の性質と同じ形で範囲・規則を変えたものなので、全件のときだけ動かす */
const SKIP = skipWhen("ci-full-only", !FULL);

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

/**
 * 設定の項目（配列の要素）に出た shadowed・never-matches は 1 つずつ、それらと redundant はまとめて取り除き、
 * 期間の全日で結果を比べる
 */
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
  let full: string[] | undefined;
  const removable: string[] = [];
  for (const d of list) {
    // 設定の項目（配列の要素）だけを取り除いて確かめる（unconfirmedHolidayPolicy などの redundant は対象外）
    if (!/^\w+\[\d+\]$/.test(d.path)) continue;
    // まとめて取り除くときは、確かめる対象（codes）でなくても、使われない項目（shadowed・never-matches）も取り除く
    // （逐次除去は、それらを先に取り除いた設定で redundant を判定する。31 番）
    if (["shadowed", "never-matches", "redundant"].includes(d.code)) removable.push(d.path);
    if (!codes.includes(d.code)) continue;
    found[d.code] = (found[d.code] ?? 0) + 1;
    const target = JSON.stringify(
      (options[d.path.replace(/\[\d+\]$/, "")] as unknown[])[Number(/\[(\d+)\]/.exec(d.path)![1])],
    );
    if (target.includes("effective")) found["withPeriod"] = (found["withPeriod"] ?? 0) + 1;
    if (d.code === "redundant") continue;
    full ??= snapshot(options, range, true);
    assert.deepEqual(
      snapshot(removeItem(options, d.path), range, true),
      full,
      `${d.code} ${d.path}: ${describe()}`,
    );
  }
  if (!removable.some((path) => list.some((d) => d.path === path && d.code === "redundant")))
    return;
  // 後ろの項目から取り除く（前の項目の位置がずれないように）
  const reduced = [...new Set(removable)]
    .sort((a, b) => Number(/\[(\d+)\]/.exec(b)![1]) - Number(/\[(\d+)\]/.exec(a)![1]))
    .reduce((o, path) => removeItem(o, path), options);
  assert.deepEqual(
    snapshot(reduced, range, false),
    snapshot(options, range, false),
    `まとめて取り除く ${JSON.stringify(removable)}: ${describe()}`,
  );
}

test("性質: 使われない・取り除いても変わらないと診断した規則は、取り除いても結果が変わらない（短い提供元・提供元なしの全日）", () => {
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
});

test(
  "性質: 第 n 営業日の規則がある設定でも、取り除いても変わらないと診断した項目は、取り除いても結果が変わらない",
  { skip: SKIP },
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
  { skip: SKIP },
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

// ------------------------------------------------------------
// 0.32.8: 項目の主張を全日の判定で確かめる（範囲の外と長い日付、日本の提供元の "throw"）
// ------------------------------------------------------------

/** 0.32.8 の性質の抜き出し（全件は DIAGNOSE_PROPERTY_FULL=1） */
const checkedWide = (run: number): boolean => FULL || run % DIAGNOSE_WIDE.sampleEvery === 0;
const WIDE_DAYS = daysOf(WIDE_RANGE.from, WIDE_RANGE.to);
const JP_DAYS = daysOf(JP_FULL_RANGE.from, JP_FULL_RANGE.to);
/** 走査の範囲（提供元なし・"ignore" の提供元。decisions.md の 31 番）の両端 */
const SCAN_FROM = "2001-01-01";
const SCAN_TO = "2028-12-31";

type Kind = "calendar" | "schedule";
/** 全日の結果（値の JSON か、投げた日は "E:<code>"） */
function valuesOf(options: Obj, kind: Kind, days: readonly string[]): string[] {
  const judge =
    kind === "calendar"
      ? (
          (c) => (d: string) =>
            c.isBusinessDay(d)
        )(createCalendar(options as CalendarOptions))
      : (
          (s) => (d: string) =>
            s.valueOn(d)
        )(createSchedule(options as never));
  return days.map((d) => {
    try {
      return JSON.stringify(judge(d));
    } catch (error) {
      return `E:${String((error as { code?: unknown } | null)?.code)}`;
    }
  });
}
const diagnoseOf = (options: Obj, kind: Kind) =>
  kind === "calendar" ? diagnoseCalendar(options as never) : diagnoseSchedule(options as never);

/** 取り除ける、と診断が言う項目（規則・日付そのものの path。規則の中のオプションの項目は含めない） */
const removablePaths = (
  list: readonly { code: string; path: string; message: string }[],
): string[] => [
  ...new Set(
    list
      .filter(
        (d) =>
          /^\w+\[\d+\]$/.test(d.path) &&
          (["shadowed", "never-matches", "redundant"].includes(d.code) ||
            (d.code === "out-of-range" && d.message.includes("so this rule is never used"))),
      )
      .map((d) => d.path),
  ),
];
/** 後ろの項目から取り除く（前の項目の位置がずれないように） */
const removeAll = (options: Obj, paths: readonly string[]): Obj =>
  [...paths]
    .sort((a, b) => Number(/\[(\d+)\]/.exec(b)![1]) - Number(/\[(\d+)\]/.exec(a)![1]))
    .reduce((o, path) => removeItem(o, path), options);

const OWN_COUNTING_KEYS = ["closedRecurringRules", "openRecurringRules"] as const;
const isCountingRule = (r: Obj): boolean => "businessDayOfMonth" in r || "businessDayOfWeek" in r;
/** 自分の設定を基準に数える規則を除いた設定 */
const withoutCounting = (options: Obj): Obj => {
  const out: Obj = { ...options };
  for (const k of OWN_COUNTING_KEYS)
    if (Array.isArray(options[k])) out[k] = (options[k] as Obj[]).filter((r) => !isCountingRule(r));
  return out;
};
/** 個別の日付の始まりと終わり */
const dateEnds = (options: Obj): { from: string; to: string }[] =>
  ["closedDates", "openDates"].flatMap((k) =>
    ((options[k] as unknown[] | undefined) ?? []).map((d) =>
      typeof d === "string"
        ? { from: d, to: d }
        : {
            from: String((d as Obj)["from"] ?? (d as Obj)["date"]),
            to: String((d as Obj)["to"] ?? (d as Obj)["date"]),
          },
    ),
  );
const shiftDay = shiftDays;
/** 日を含む月と、その前後 6 日（診断と同じ定義を、日付の文字列で求め直したもの） */
const edgeUnit = (d: string): string[] => {
  const first = `${d.slice(0, 8)}01`;
  const next = shiftDay(`${d.slice(0, 8)}28`, 4).slice(0, 8) + "01";
  return daysOf(shiftDay(first, -6), shiftDay(next, 5));
};

/**
 * 自分の設定を基準に数える規則が、days の中で当てはまる日（最初の 1 日。なければ undefined）。数える基準は、繰り返しの規則を
 * すべて除いた判定（decisions.md の 16 番。定休日・祝日・個別の日付・毎年の月日は入る）で、診断の実装を使わずに数える
 */
function countingMatch(options: Obj, rule: Obj, days: readonly string[]): string | undefined {
  const basis = createCalendar({
    ...options,
    closedRecurringRules: [],
    openRecurringRules: [],
  } as CalendarOptions);
  const isOpen = (d: string): boolean => {
    try {
      return basis.isBusinessDay(d);
    } catch {
      return false;
    }
  };
  const positions = new Set<number>(
    ([] as number[]).concat(
      (rule["businessDayOfMonth"] ?? rule["businessDayOfWeek"]) as number | number[],
    ),
  );
  const months = rule["months"] as number[] | undefined;
  const from = (rule["effectiveFrom"] as string | undefined) ?? "0000-01-01";
  const to = (rule["effectiveTo"] as string | undefined) ?? "9999-12-31";
  const weekStart = rule["weekStart"] as number | undefined;
  // 単位（月か、weekStart から 7 日の週）ごとに、基準の営業日を並べて位置を見る
  const unitKey = (d: string): string => {
    if (weekStart === undefined) return d.slice(0, 7);
    const back = (weekdayOfDay(d) - weekStart + 7) % 7;
    return shiftDay(d, -back);
  };
  const unitDays = (key: string): string[] =>
    weekStart === undefined
      ? daysOf(`${key}-01`, shiftDay(shiftDay(`${key}-28`, 4).slice(0, 8) + "01", -1))
      : daysOf(key, shiftDay(key, 6));
  const done = new Set<string>();
  for (const d of days) {
    const key = unitKey(d);
    if (done.has(key)) continue;
    done.add(key);
    const open = unitDays(key).filter((x) => isOpen(x));
    for (const [i, x] of open.entries()) {
      if (x < days[0]! || x > days[days.length - 1]! || x < from || x > to) continue;
      if (months !== undefined && !months.includes(Number(x.slice(5, 7)))) continue;
      if (positions.has(i + 1) || positions.has(i - open.length)) return x;
    }
  }
  return undefined;
}

/**
 * 出た項目をまとめて取り除き、全日の結果を比べる。取り除く前に判定できた日は、取り除いた後も同じ結果（値か例外の code）
 * であること。no-business-day が出たら営業日がないこと。数える規則の never-matches には当てはまる日がないこと
 */
function checkClaims(
  options: Obj,
  kind: Kind,
  days: readonly string[],
  describe: () => string,
  found: Record<string, number>,
): { list: ReturnType<typeof diagnoseOf>; before: string[] } {
  const bump = (key: string): void => {
    found[key] = (found[key] ?? 0) + 1;
  };
  const list = diagnoseOf(options, kind);
  assert.ok(
    list.every((d) => d.severity !== "error"),
    `作成できる設定のはず: ${describe()}`,
  );
  bump("設定");
  const before = valuesOf(options, kind, days);
  if (list.some((d) => d.code === "no-business-day")) {
    bump("no-business-day");
    const i = before.indexOf("true");
    assert.ok(i < 0, `no-business-day なのに ${days[i]} が営業日: ${describe()}`);
  }
  const paths = removablePaths(list);
  if (paths.length > 0) {
    bump("取り除いて比べた設定");
    found["取り除いた項目"] = (found["取り除いた項目"] ?? 0) + paths.length;
    if (list.some((d) => d.code === "out-of-range" && paths.includes(d.path)))
      bump("「never used」と出た対応年の外の規則を取り除いた設定");
    const after = valuesOf(removeAll(options, paths), kind, days);
    let outside = false;
    before.forEach((v, i) => {
      if (v.startsWith("E:")) {
        if (after[i] !== v) outside = true;
        return;
      }
      assert.equal(
        after[i],
        v,
        `まとめて取り除く ${JSON.stringify(paths)} と ${days[i]} が変わる: ${describe()}`,
      );
    });
    if (outside) bump("約束の外（取り除く前から判定できない日が、取り除いた後に判定できる）");
  }
  if (kind === "calendar")
    for (const d of list) {
      if (d.code !== "never-matches" || !/^(closed|open)RecurringRules\[\d+\]$/.test(d.path))
        continue;
      const rule = (options[d.path.replace(/\[\d+\]$/, "")] as Obj[])[
        Number(/\[(\d+)\]/.exec(d.path)![1])
      ]!;
      if (!isCountingRule(rule)) continue;
      bump("数える規則の never-matches");
      const day = countingMatch(options, rule, days);
      assert.equal(day, undefined, `never-matches ${d.path} が ${day} に当てはまる: ${describe()}`);
    }
  return { list, before };
}

test("性質（0.32.8）: 数える規則と、走査の範囲の外・範囲を覆う個別の日付のある設定で、出た項目をまとめて取り除いても 1901〜2099 年の結果が変わらない", () => {
  const seed = DIAGNOSE_WIDE.seed;
  const rand = random(seed);
  const found: Record<string, number> = {};
  for (let run = 0; run < DIAGNOSE_WIDE.runs; run++) {
    const options = diagnoseWideOptions(rand, run % 2 === 0 ? "short" : "none");
    if (!checkedWide(run)) continue;
    const describe = (): string => describeOf(seed, run, options);
    const { before } = checkClaims(options, "calendar", WIDE_DAYS, describe, found);
    // 当たった数: 走査の範囲の外の個別の日付の両端の月・週で、数える規則が結果を決めている設定
    const outside = [
      ...new Set(
        dateEnds(options)
          .flatMap(({ from, to }) => [from, to])
          .filter((d) => d < SCAN_FROM || d > SCAN_TO)
          .flatMap(edgeUnit),
      ),
    ]
      .filter((d) => d >= WIDE_RANGE.from && d <= WIDE_RANGE.to)
      .sort();
    if (outside.length > 0) {
      const a = valuesOf(options, "calendar", outside);
      const b = valuesOf(withoutCounting(options), "calendar", outside);
      if (a.some((v, i) => !v.startsWith("E:") && v !== b[i]))
        found["範囲の外の日付の月・週で、数える規則が結果を決める設定"] =
          (found["範囲の外の日付の月・週で、数える規則が結果を決める設定"] ?? 0) + 1;
    }
    // 当たった数: 走査の範囲を覆う個別の日付があり、日付の外の年で、繰り返しの規則が結果を決めている設定
    const cover = dateEnds(options).find(({ from, to }) => from <= SCAN_FROM && to >= SCAN_TO);
    if (cover) {
      const bare = valuesOf(
        { ...options, closedRecurringRules: [], openRecurringRules: [] },
        "calendar",
        WIDE_DAYS,
      );
      if (
        WIDE_DAYS.some(
          (d, i) =>
            (d < cover.from || d > cover.to) &&
            !before[i]!.startsWith("E:") &&
            before[i] !== bare[i],
        )
      )
        found["範囲を覆う日付の外の年で、繰り返しの規則が結果を決める設定"] =
          (found["範囲を覆う日付の外の年で、繰り返しの規則が結果を決める設定"] ?? 0) + 1;
    }
  }
  console.log(`# 範囲の外と長い日付: ${JSON.stringify(found)}`);
  // 当たった数は、どれも 0 件なら失敗（抜き出しでは、取り除いて比べた設定だけ。少ない形は全件でだけ現れる）
  for (const key of [
    "取り除いて比べた設定",
    ...(FULL
      ? [
          "no-business-day",
          "数える規則の never-matches",
          "範囲の外の日付の月・週で、数える規則が結果を決める設定",
          "範囲を覆う日付の外の年で、繰り返しの規則が結果を決める設定",
        ]
      : []),
  ])
    assert.ok((found[key] ?? 0) > 0, `${key} が 0 件: ${JSON.stringify(found)}`);
});

test('性質（0.32.8）: 日本の提供元の outOfRangePolicy: "throw" と unconfirmedHolidayPolicy: "throw" の設定で、出た項目をまとめて取り除いても、判定できた日の結果が変わらない（カレンダー・スケジュール）', () => {
  const seed = DIAGNOSE_WIDE.seed + 1;
  const rand = random(seed);
  const found: Record<string, number> = {};
  const weekends = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  for (let run = 0; run < DIAGNOSE_WIDE.throwRuns; run++) {
    const made = diagnoseThrowOptions(rand, run);
    if (!checkedWide(run)) continue;
    const { kind, schedule } = throwKindOf(run);
    const k: Kind = schedule ? "schedule" : "calendar";
    const options = real(
      schedule
        ? {
            ...made,
            recurringRules: ((made["recurringRules"] as Obj[] | undefined) ?? []).map((r) =>
              r["calendar"] === CALENDAR_REF ? { ...r, calendar: weekends } : r,
            ),
          }
        : made,
    );
    const describe = (): string => `${k} ${describeOf(seed, run, options)}`;
    const { list, before } = checkClaims(options, k, JP_DAYS, describe, found);
    if (kind !== "unconfirmed") continue;
    // 当たった数: "accept" なら redundant と出る規則で、取り除くと未確定の祝日で例外になる日ができるもの（"throw" では出ない）
    const reported = new Set(list.filter((d) => d.code === "redundant").map((d) => d.path));
    const accepted = diagnoseOf({ ...options, unconfirmedHolidayPolicy: "accept" }, k).filter(
      (d) => d.code === "redundant" && /^\w+\[\d+\]$/.test(d.path) && !reported.has(d.path),
    );
    for (const d of accepted) {
      const after = valuesOf(removeItem(options, d.path), k, JP_DAYS);
      if (before.some((v, i) => !v.startsWith("E:") && after[i] === "E:unconfirmed-holiday")) {
        const key = `取り除くと未確定の祝日で例外になる規則を出さなかった設定（${k}）`;
        found[key] = (found[key] ?? 0) + 1;
        break;
      }
    }
  }
  console.log(`# 日本の提供元の throw: ${JSON.stringify(found)}`);
  // 当たった数は、どれも 0 件なら失敗（抜き出しでは、取り除いて比べた設定だけ。少ない形は全件でだけ現れる）
  for (const key of [
    "取り除いて比べた設定",
    ...(FULL
      ? [
          "「never used」と出た対応年の外の規則を取り除いた設定",
          "約束の外（取り除く前から判定できない日が、取り除いた後に判定できる）",
          "取り除くと未確定の祝日で例外になる規則を出さなかった設定（calendar）",
          "取り除くと未確定の祝日で例外になる規則を出さなかった設定（schedule）",
        ]
      : []),
  ])
    assert.ok((found[key] ?? 0) > 0, `${key} が 0 件: ${JSON.stringify(found)}`);
});
