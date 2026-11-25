/**
 * Property tests of the rule diagnostics. With options built from the catalog (test/support/catalog.ts), the
 * rules diagnosed as "never used / removal changes no result" are really removed, and the results must not
 * change (how the options are built: test/support/sites.ts).
 *
 * - shadowed, never-matches ... removing one does not change the result of dayInfoOn (reason and name included)
 * - redundant               ... removing the reported items together (shadowed and never-matches included) does
 *   not change whether a day is a business day (sequential removal. docs/decisions.md #31)
 *
 * Every property compares all days of the diagnostic range (test/support/promise-days.ts decides the days and
 * the days outside the promise; they do not depend on the scan ranges of the diagnostics). The options use the
 * home-made provider with few supported years (2025-2027), no provider, or the Japanese provider. The options
 * use outOfRangePolicy: "ignore", so that every day of the diagnostic range can be judged and the diagnostics
 * examine all of it (with "throw" they examine the supported years only. decisions.md #31).
 * pnpm check runs only the properties of the short provider and of no provider, as a sample; options with an
 * nth-business-day rule and the whole range of Japan run with DIAGNOSE_PROPERTY_FULL=1 (the diagnose-consistency
 * job of CI).
 *
 * The two properties added in 0.32.8 (dates outside the range and long dates; "throw" with the Japanese
 * provider) check the claims of the items themselves with the judgement of all days: removing the reported items
 * together (shadowed, never-matches, redundant, and rules outside the supported years reported as "never used")
 * does not change the result (a value or an error code) of a day that could be judged before the removal (days
 * that could not be judged before are outside the promise. decisions.md #31); options with no-business-day have
 * no business day at all; never-matches of a rule counting on the own options really has no matching day.
 * For both, pnpm check runs a sample of 1 in DIAGNOSE_WIDE.sampleEvery; the full set runs with
 * DIAGNOSE_PROPERTY_FULL=1.
 * To try another seed: PROPERTY_SEED=123 node --test test/diagnose-properties.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, type CalendarOptions } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { CALENDAR_REF, random, type Obj } from "./support/catalog.ts";
import { daysOf, linesOf, removeItem, shiftDays, weekdayOfDay } from "./support/compare.ts";
import {
  compareRemoval,
  promiseDays,
  removablePaths,
  removePaths,
  resultsOf,
} from "./support/promise-days.ts";
import { flagEnv, intEnv } from "./support/env.ts";
import { skipWhen } from "./support/skip.ts";
import {
  DIAGNOSE_PROPERTY,
  DIAGNOSE_WIDE,
  diagnoseOptions,
  diagnoseSourceOf,
  diagnoseThrowOptions,
  diagnoseWideOptions,
  fullRangeSourceOf,
  throwKindOf,
  withCountingRule,
} from "./support/sites.ts";

const SEED = intEnv("PROPERTY_SEED", DIAGNOSE_PROPERTY.seed);
// pnpm check runs a sample (options are built every time; only trials whose run number divided by sampleEvery
// leaves 0 are checked). The full set runs with DIAGNOSE_PROPERTY_FULL=1
const FULL = flagEnv("DIAGNOSE_PROPERTY_FULL");
const checked = (run: number): boolean => FULL || run % DIAGNOSE_PROPERTY.sampleEvery === 0;
/**
 * Options with an nth-business-day rule and the whole range of Japan have the same form as the properties of
 * the short provider with other ranges and rules, so they run only in the full set
 */
const SKIP = skipWhen("ci-full-only", !FULL);

/** Turns the provider name ("jp") into the real provider */
const real = (options: Obj): Obj =>
  options["holidayProvider"] === "jp" ? { ...options, holidayProvider: jp } : options;
const describeOf = (seed: number, run: number, options: Obj): string =>
  `seed=${seed} run=${run} ${JSON.stringify({ ...options, holidayProvider: options["holidayProvider"] === undefined ? undefined : String((options["holidayProvider"] as { id?: string }).id ?? options["holidayProvider"]) })}`;

/** The days compared: all days of the diagnostic range (test/support/promise-days.ts) */
const DAYS = promiseDays();

/**
 * The results of all days of the diagnostic range (linesOf of test/support/compare.ts; with `full`, also reason,
 * name and the original day of a move)
 */
const snapshot = (options: Obj, full: boolean): string[] => {
  const lines = linesOf(createCalendar(options as CalendarOptions), DAYS, full);
  // Only options that do not throw in the range are tried. A day that throws would be "E:<code>" and equal
  // before and after the removal, so it fails here
  assert.ok(
    !lines.some((l) => l.startsWith("E:")),
    `投げた日がある: ${lines.find((l) => l.startsWith("E:"))}`,
  );
  return lines;
};

/**
 * Removes the shadowed and never-matches items (array elements of the options) one by one, and those together
 * with the redundant ones, and compares the results of all days of the diagnostic range
 */
function checkRemovals(
  options: Obj,
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
    // Only items (array elements) of the options are removed and checked (redundant of unconfirmedHolidayPolicy
    // and the like is not covered)
    if (!/^\w+\[\d+\]$/.test(d.path)) continue;
    // When removing together, unused items (shadowed, never-matches) are removed even when they are not what is
    // checked (codes) (the sequential removal judges redundant on the options without them. decisions.md #31)
    if (["shadowed", "never-matches", "redundant"].includes(d.code)) removable.push(d.path);
    if (!codes.includes(d.code)) continue;
    found[d.code] = (found[d.code] ?? 0) + 1;
    const target = JSON.stringify(
      (options[d.path.replace(/\[\d+\]$/, "")] as unknown[])[Number(/\[(\d+)\]/.exec(d.path)![1])],
    );
    if (target.includes("effective")) found["withPeriod"] = (found["withPeriod"] ?? 0) + 1;
    if (d.code === "redundant") continue;
    full ??= snapshot(options, true);
    assert.deepEqual(
      snapshot(removeItem(options, d.path), true),
      full,
      `${d.code} ${d.path}: ${describe()}`,
    );
  }
  if (!removable.some((path) => list.some((d) => d.path === path && d.code === "redundant")))
    return;
  // Remove from the last item (so that the positions of earlier items do not shift)
  const reduced = [...new Set(removable)]
    .sort((a, b) => Number(/\[(\d+)\]/.exec(b)![1]) - Number(/\[(\d+)\]/.exec(a)![1]))
    .reduce((o, path) => removeItem(o, path), options);
  assert.deepEqual(
    snapshot(reduced, false),
    snapshot(options, false),
    `まとめて取り除く ${JSON.stringify(removable)}: ${describe()}`,
  );
}

test("性質: 使われない・取り除いても変わらないと診断した規則は、取り除いても結果が変わらない（短い提供元・提供元なし。診断の範囲の全日）", () => {
  const rand = random(SEED);
  const found: Record<string, number> = {};
  for (let run = 0; run < DIAGNOSE_PROPERTY.runs; run++) {
    const options = real(diagnoseOptions(rand, diagnoseSourceOf(run)));
    if (!checked(run)) continue;
    checkRemovals(options, () => describeOf(SEED, run, options), found);
  }
  // Also checks that the property is not an empty run (diagnostics really appear) (never-matches is rare and is
  // checked by unit tests)
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
      checkRemovals(options, () => describeOf(seed, run, options), found, ["redundant"]);
    }
    console.log(`# 確かめた診断: ${JSON.stringify(found)}`);
    assert.ok((found["redundant"] ?? 0) > 0, `checked: ${JSON.stringify(found)}`);
  },
);

test(
  "性質: 日本の提供元と提供元なしの設定でも、取り除いても診断の範囲の結果が変わらない",
  { skip: SKIP },
  () => {
    const seed = SEED + 3;
    const rand = random(seed);
    const found: Record<string, number> = {};
    for (let run = 0; run < DIAGNOSE_PROPERTY.fullRangeRuns; run++) {
      const options = real(diagnoseOptions(rand, fullRangeSourceOf(run)));
      if (!checked(run)) continue;
      checkRemovals(options, () => describeOf(seed, run, options), found);
    }
    console.log(`# 確かめた診断: ${JSON.stringify(found)}`);
    assert.ok(
      Object.keys(found).length > 0,
      `診断が 1 件も出ていない（空振り）: ${JSON.stringify(found)}`,
    );
  },
);

// ------------------------------------------------------------
// 0.32.8: the claims of the items checked with the judgement of all days (dates outside the range and long
// dates; "throw" with the Japanese provider)
// ------------------------------------------------------------

/** The sample of the properties of 0.32.8 (the full set runs with DIAGNOSE_PROPERTY_FULL=1) */
const checkedWide = (run: number): boolean => FULL || run % DIAGNOSE_WIDE.sampleEvery === 0;
const PROMISE_FROM = DAYS[0]!;
const PROMISE_TO = DAYS[DAYS.length - 1]!;
/**
 * The representative 28 years (2001-2028; decisions.md #31). Used only to count the hits of specific dates
 * outside them and covering them, not to decide the days compared
 */
const SCAN_FROM = "2001-01-01";
const SCAN_TO = "2028-12-31";

type Kind = "calendar" | "schedule";
/** The results of all days (the text of the value, or "E:<code>" on a day that throws; resultsOf) */
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
  return resultsOf(judge, days);
}
const diagnoseOf = (options: Obj, kind: Kind) =>
  kind === "calendar" ? diagnoseCalendar(options as never) : diagnoseSchedule(options as never);

const OWN_COUNTING_KEYS = ["closedRecurringRules", "openRecurringRules"] as const;
const isCountingRule = (r: Obj): boolean => "businessDayOfMonth" in r || "businessDayOfWeek" in r;
/** The options without the rules counting on the own options */
const withoutCounting = (options: Obj): Obj => {
  const out: Obj = { ...options };
  for (const k of OWN_COUNTING_KEYS)
    if (Array.isArray(options[k])) out[k] = (options[k] as Obj[]).filter((r) => !isCountingRule(r));
  return out;
};
/** The starts and ends of the specific dates */
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
/** The month containing a day, and the 6 days before and after it (the diagnostics' definition, recomputed with date strings) */
const edgeUnit = (d: string): string[] => {
  const first = `${d.slice(0, 8)}01`;
  const next = shiftDay(`${d.slice(0, 8)}28`, 4).slice(0, 8) + "01";
  return daysOf(shiftDay(first, -6), shiftDay(next, 5));
};

/**
 * The day in `days` on which a rule counting on the own options matches (the first one; undefined when none).
 * The counting basis is the judgement without any recurring rule (decisions.md #16; closed weekdays, holidays,
 * specific dates and annual dates are in), counted without the diagnostics' implementation
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
  // Per unit (a month, or the week of 7 days from weekStart) the business days of the basis are listed and the
  // position is looked up
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
 * Removes the reported items together and compares the results of all days. A day that could be judged before
 * the removal has the same result (a value or an error code) afterwards. With no-business-day there is no
 * business day. never-matches of a counting rule has no matching day
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
    const after = valuesOf(removePaths(options, paths), kind, days);
    const diff = compareRemoval(before, after);
    const first = [...diff.changed, ...diff.throws].sort((a, b) => a - b)[0];
    assert.equal(
      first,
      undefined,
      `まとめて取り除く ${JSON.stringify(paths)} と ${first === undefined ? "" : days[first]} が ${first === undefined ? "" : `${before[first]} → ${after[first]}`}: ${describe()}`,
    );
    if (diff.outside > 0)
      bump("約束の外（取り除く前から判定できない日が、取り除いた後に判定できる）");
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

test("性質（0.32.8）: 数える規則と、代表の 28 年間の外・それを覆う個別の日付のある設定で、出た項目をまとめて取り除いても診断の範囲の結果が変わらない", () => {
  const seed = DIAGNOSE_WIDE.seed;
  const rand = random(seed);
  const found: Record<string, number> = {};
  for (let run = 0; run < DIAGNOSE_WIDE.runs; run++) {
    const options = diagnoseWideOptions(rand, run % 2 === 0 ? "short" : "none");
    if (!checkedWide(run)) continue;
    const describe = (): string => describeOf(seed, run, options);
    const { before } = checkClaims(options, "calendar", DAYS, describe, found);
    // Hits: options in which a counting rule decides a result in the months and weeks at both ends of a specific
    // date outside the scan range
    const outside = [
      ...new Set(
        dateEnds(options)
          .flatMap(({ from, to }) => [from, to])
          .filter((d) => d < SCAN_FROM || d > SCAN_TO)
          .flatMap(edgeUnit),
      ),
    ]
      .filter((d) => d >= PROMISE_FROM && d <= PROMISE_TO)
      .sort();
    if (outside.length > 0) {
      const a = valuesOf(options, "calendar", outside);
      const b = valuesOf(withoutCounting(options), "calendar", outside);
      if (a.some((v, i) => !v.startsWith("E:") && v !== b[i]))
        found["範囲の外の日付の月・週で、数える規則が結果を決める設定"] =
          (found["範囲の外の日付の月・週で、数える規則が結果を決める設定"] ?? 0) + 1;
    }
    // Hits: options with a specific date covering the scan range in which a recurring rule decides a result in
    // the years outside the date
    const cover = dateEnds(options).find(({ from, to }) => from <= SCAN_FROM && to >= SCAN_TO);
    if (cover) {
      const bare = valuesOf(
        { ...options, closedRecurringRules: [], openRecurringRules: [] },
        "calendar",
        DAYS,
      );
      if (
        DAYS.some(
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
  // 0 hits of any kind fail (in a sample, only the options removed and compared count; rare forms appear only
  // in the full set)
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
    const { list, before } = checkClaims(options, k, DAYS, describe, found);
    if (kind !== "unconfirmed") continue;
    // Hits: rules reported as redundant with "accept" whose removal makes a day throw for an unconfirmed holiday
    // (not reported with "throw")
    const reported = new Set(list.filter((d) => d.code === "redundant").map((d) => d.path));
    const accepted = diagnoseOf({ ...options, unconfirmedHolidayPolicy: "accept" }, k).filter(
      (d) => d.code === "redundant" && /^\w+\[\d+\]$/.test(d.path) && !reported.has(d.path),
    );
    for (const d of accepted) {
      const after = valuesOf(removeItem(options, d.path), k, DAYS);
      if (before.some((v, i) => !v.startsWith("E:") && after[i] === "E:unconfirmed-holiday")) {
        const key = `取り除くと未確定の祝日で例外になる規則を出さなかった設定（${k}）`;
        found[key] = (found[key] ?? 0) + 1;
        break;
      }
    }
  }
  console.log(`# 日本の提供元の throw: ${JSON.stringify(found)}`);
  // 0 hits of any kind fail (in a sample, only the options removed and compared count; rare forms appear only
  // in the full set)
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

test("性質（0.32.9）: 呼ぶたびに答えや投げ方を変えるカレンダーの形のオブジェクトを基準にしても、診断は例外を投げず、error を出さない", () => {
  const week = ["a", "b", "c", "d", "e", "f", "g"];
  const shapes = (calendar: object): Obj[][] => [
    [{ businessDayOfMonth: 1, calendar, value: "y" }],
    [{ businessDayOfWeek: 1, weekStart: 1, calendar, value: "y" }],
    [
      {
        businessDayOfMonth: -1,
        calendar,
        value: "y",
        months: [2, 7],
        effectiveFrom: "2020-03-10",
        effectiveTo: "2031-05-20",
      },
      { weekday: 1, value: "b" },
    ],
    [
      { businessDayOfWeek: 2, weekStart: 0, calendar, value: "y", months: [1, 12] },
      { businessDayOfMonth: 1, calendar, value: "a" },
    ],
  ];
  // What the object throws: the three codes of a judgement, and something that is not an error of this library
  const thrown = ["out-of-range", "unconfirmed-holiday", "holiday-run-too-long", undefined];
  // The number of calls after which the object changes. How often the diagnostics call a basis differs between
  // versions, so the limits are spread from the first call to more calls than one diagnosis makes (up to 0.32.8,
  // 18 of the 720 combinations threw an internal error, all of them with the limit 10000)
  const limits = [
    0, 1, 7, 31, 100, 365, 1000, 5000, 10000, 20000, 40000, 53000, 80000, 150000, 400000,
  ];
  const modes = ["after", "every-third", "flip"];
  let checkedRuns = 0;
  /** The pairs of two conditions that were checked (the sample must hold every pair) */
  const pairs = new Set<string>();
  for (let shape = 0; shape < 4; shape++)
    for (const [li, limit] of limits.entries())
      for (const [ci, code] of thrown.entries())
        for (const [mi, mode] of modes.entries()) {
          // pnpm check runs 1 combination in 6, chosen so that every pair of two conditions occurs
          if (!FULL && (shape + li + ci + 2 * mi) % 6 !== 0) continue;
          for (const pair of [
            `s${shape} l${li}`,
            `s${shape} c${ci}`,
            `s${shape} m${mi}`,
            `l${li} c${ci}`,
            `l${li} m${mi}`,
            `c${ci} m${mi}`,
          ])
            pairs.add(pair);
          let calls = 0;
          // After `limit` calls the object starts to throw (always, every third call, or in runs of 512 calls);
          // in the mode "flip" its answers alternate as well
          const unstable = {
            timeZone: "UTC",
            isBusinessDay: (): boolean => {
              calls++;
              const fails =
                calls > limit &&
                (mode === "after" ||
                  (mode === "every-third" ? calls % 3 === 0 : (calls >> 9) % 2 === 1));
              if (fails)
                throw code === undefined
                  ? new TypeError("changed")
                  : Object.assign(new RangeError("changed"), { code });
              return mode === "flip" ? calls % 2 === 0 : true;
            },
          };
          const options = {
            weekdayValues: week,
            recurringRules: shapes(unstable)[shape],
            dates:
              shape === 2
                ? [
                    { from: "1990-01-10", to: "1990-03-05", value: "a" },
                    { date: "2040-06-15", value: "q" },
                  ]
                : undefined,
          };
          const label = `shape ${shape}, limit ${limit}, ${String(code)}, ${mode}`;
          let found: readonly { severity: string }[] = [];
          assert.doesNotThrow(() => {
            found = diagnoseSchedule(options as never);
          }, label);
          assert.deepEqual(
            found.filter((d) => d.severity === "error"),
            [],
            label,
          );
          checkedRuns++;
        }
  console.log(`# 呼ぶたびに変わる基準: 確かめた組み合わせ ${checkedRuns}`);
  assert.equal(checkedRuns, FULL ? 720 : 120);
  // 4 × 15 + 4 × 4 + 4 × 3 + 15 × 4 + 15 × 3 + 4 × 3 pairs
  assert.equal(pairs.size, 205);
});
