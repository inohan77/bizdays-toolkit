// The diagnostics of options with unjudgeable months (months in which the basis calendar of an nth-business-day
// rule of a schedule throws).
// Checks that diagnostics not affected by unjudgeable months are reported and those that can be affected
// (never-matches, redundant) are not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createSchedule,
  type CalendarOptions,
  type HolidayProvider,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { DIAGNOSTIC_YEARS, dropUnsure, rulesScanWindow, unsureOf } from "../src/core/diagnose.ts";
import { InternalError, IssueCollector } from "../src/core/errors.ts";
import { toDayNumber } from "../src/core/date.ts";
import { compileScheduleOptions } from "../src/core/schedule.ts";
import { sg } from "../src/sg/index.ts";
import { jp } from "../src/jp/index.ts";

/** A calendar with Singapore's holidays (2020-2027) and closed weekends. It throws in months outside the supported years */
const basis = createCalendar({
  holidayProvider: sg,
  timeZone: "Asia/Singapore",
  closedWeekdays: [0, 6],
});
const base = {
  timeZone: "Asia/Singapore",
  weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
};
const brief = (options: object) =>
  diagnoseSchedule(options).map((d) => [d.severity, d.code, d.path]);
/** A rule of the basis calendar that evaluates months outside the supported years (no effective period) */
const everyMonth = { businessDayOfMonth: 1, calendar: basis, value: "b" };

test("判定できない月があっても、基準のカレンダーを持たない規則の never-matches は出す", () => {
  const never = { dayOfMonth: 31, months: [2], value: "x" };
  assert.deepEqual(brief({ ...base, recurringRules: [never] }), [
    ["warning", "never-matches", "recurringRules[0]"],
  ]);
  assert.deepEqual(brief({ ...base, recurringRules: [everyMonth, never] }), [
    ["warning", "never-matches", "recurringRules[1]"],
  ]);
  // Written with old key names too, the paths of the diagnostics between rules use the new names (only
  // deprecated-option uses the old names)
  assert.deepEqual(
    brief({ ...base, recurring: [everyMonth, { day: 31, months: [2], value: "x" }] }),
    [
      ["warning", "deprecated-option", "recurring"],
      ["warning", "deprecated-option", "recurring[1].day"],
      ["warning", "never-matches", "recurringRules[1]"],
    ],
  );
});

test("基準のカレンダーを持つ規則の never-matches・redundant は、有効期間に判定できない月があれば出さない", () => {
  // 2019 is outside the supported years. March has a first business day in reality, but the basis calendar
  // throws, so it cannot be judged
  const march2019 = {
    businessDayOfMonth: 1,
    months: [3],
    calendar: basis,
    value: "b",
    effectiveFrom: "2019-01-01",
    effectiveTo: "2019-12-31",
  };
  assert.deepEqual(brief({ ...base, recurringRules: [march2019] }), []);
  // A rule with the same value as the weekly values is redundant, but without an effective period it includes
  // unjudgeable months and is not reported
  const sameValue = { businessDayOfMonth: 1, calendar: basis, value: "a" };
  assert.deepEqual(brief({ ...base, recurringRules: [sameValue] }), []);
  // Reported when the whole effective period is inside the supported years
  assert.deepEqual(
    brief({
      ...base,
      recurringRules: [{ ...sameValue, effectiveFrom: "2021-01-01", effectiveTo: "2021-12-31" }],
    }),
    [["info", "redundant", "recurringRules[0]"]],
  );
});

test("週の第 n 営業日の規則は、投げた月の次の月も判定できない月にする（2020 年の最初の週は 2019 年 12 月にかかる）", () => {
  // The week of 2019-12-30 (Mon) to 2020-01-05 (Sun). The real third business day is 2020-01-02, but December
  // 2019 is outside the supported years and cannot be counted
  for (const n of [3, 4]) {
    assert.deepEqual(
      brief({
        ...base,
        recurringRules: [
          {
            businessDayOfWeek: n,
            weekStart: 1,
            calendar: basis,
            value: "b",
            effectiveFrom: "2020-01-01",
            effectiveTo: "2020-01-05",
          },
        ],
      }),
      [],
      `businessDayOfWeek: ${n}`,
    );
  }
});

test("週の第 n 営業日の規則は、投げた月の前の月も判定できない月にする（2027 年の最後の週は 2028 年 1 月にかかる）", () => {
  // The last business day of the week of 2027-12-29 (Wed) to 2028-01-04 (Tue) depends on the holidays of January
  // 2028 (Singapore's holidays of 2028 are not announced yet; without a holiday it is 2028-01-04). If January
  // 2028 cannot be counted it looks like 2027-12-31, and the rule without a basis (the second) that decides the
  // same day with the same value would wrongly be called redundant
  assert.deepEqual(
    brief({
      ...base,
      recurringRules: [
        {
          businessDayOfWeek: -1,
          weekStart: 3,
          calendar: basis,
          value: "b",
          effectiveFrom: "2027-12-27",
          effectiveTo: "2027-12-31",
        },
        {
          dayOfMonth: 31,
          months: [12],
          value: "b",
          effectiveFrom: "2027-12-01",
          effectiveTo: "2027-12-31",
        },
      ],
    }),
    [],
  );
});

test("月の第 n 営業日の規則は、投げた月の前後の月を判定できない月にしない（その月の基準だけで決まる）", () => {
  // December 2019 is an unjudgeable month, but January 2020 can be judged. There is no 25th business day
  assert.deepEqual(
    brief({
      ...base,
      recurringRules: [
        everyMonth,
        {
          businessDayOfMonth: 25,
          calendar: basis,
          value: "c",
          effectiveFrom: "2020-01-01",
          effectiveTo: "2020-01-31",
        },
      ],
    }),
    [["warning", "never-matches", "recurringRules[1]"]],
  );
});

test("unsureOf: 規則の位置は前方一致でも番号の途中で切らない（recurringRules[11] を recurringRules[1] と取り違えない）", () => {
  // Rule 1 has a basis calendar (no effective period), rule 11 has none. Looking up the diagnostic of rule 11
  // with rule 1 would wrongly drop it as affected by an unjudgeable month
  const rules: object[] = Array.from({ length: 12 }, (_, i) => ({ weekday: i % 7, value: "b" }));
  rules[1] = everyMonth;
  const compiled = compileScheduleOptions<unknown, string>(new IssueCollector(), {
    ...base,
    recurringRules: rules,
  })!;
  const c = new IssueCollector();
  c.warning("never-matches", "recurringRules[1]", "with a basis");
  c.warning("never-matches", "recurringRules[11]", "basis-less");
  c.info("redundant", "recurringRules[1].holidayOverlapPolicy", "with a basis");
  c.info("redundant", "recurringRules[11].holidayOverlapPolicy", "basis-less");
  // All days of December 2019 are unjudgeable days
  const december = Array.from({ length: 31 }, (_, i) =>
    toDayNumber(`2019-12-${String(i + 1).padStart(2, "0")}`),
  );
  const unknown = { days: new Set(december), months: new Set([2019 * 12 + 11]) };
  const unsure = unsureOf(compiled, unknown);
  const kept = c.issues.filter((d) => !unsure(d.code, d.path));
  // The watch (dropUnsure) throws as a defect when an unsure diagnostic is left
  assert.throws(() => dropUnsure(c, 0, unsure, new Set(), unknown), InternalError);
  c.issues.length = 0;
  c.issues.push(...kept);
  dropUnsure(c, 0, unsure, new Set(), unknown);
  assert.deepEqual(
    c.issues.map((d) => [d.code, d.path]),
    [
      ["never-matches", "recurringRules[11]"],
      ["redundant", "recurringRules[11].holidayOverlapPolicy"],
    ],
  );
});

test("unsureOf: 規則の中のオプションの位置は、path の先頭の規則で引く", () => {
  const compiled = compileScheduleOptions<unknown, string>(new IssueCollector(), {
    ...base,
    recurringRules: [everyMonth, { weekday: 1, value: "b" }],
  })!;
  const c = new IssueCollector();
  c.info("redundant", "recurringRules[1].holidayOverlapPolicy", "basis-less rule");
  c.info("redundant", "recurringRules[0].holidayOverlapPolicy", "rule with a basis");
  c.warning("never-matches", "recurringRules[0]", "rule with a basis");
  c.info("redundant", "recurringRules[1]", "basis-less rule, no period");
  c.info("redundant", "somewhere", "not a rule");
  c.warning("shadowed", "recurringRules[0]", "shape only");
  // All days of December 2019 are unjudgeable days
  const december = Array.from({ length: 31 }, (_, i) =>
    toDayNumber(`2019-12-${String(i + 1).padStart(2, "0")}`),
  );
  const unknown = { days: new Set(december), months: new Set([2019 * 12 + 11]) };
  const unsure = unsureOf(compiled, unknown);
  const kept = c.issues.filter((d) => !unsure(d.code, d.path));
  // The watch (dropUnsure) throws as a defect when an unsure diagnostic is left
  assert.throws(() => dropUnsure(c, 0, unsure, new Set(), unknown), InternalError);
  c.issues.length = 0;
  c.issues.push(...kept);
  dropUnsure(c, 0, unsure, new Set(), unknown);
  assert.deepEqual(
    c.issues.map((d) => [d.code, d.path, d.message]),
    [
      ["redundant", "recurringRules[1].holidayOverlapPolicy", "basis-less rule"],
      ["shadowed", "recurringRules[0]", "shape only"],
    ],
  );
});

// ------------------------------------------------------------
// The relation to the sequential removal (decisions.md #31): unsure rules are decided before the scan, not
// reported, and not removed by the sequential removal either
// ------------------------------------------------------------

/**
 * A provider whose only unconfirmed holiday is June 15, 2026 (a basis calendar with unconfirmedHolidayPolicy:
 * "throw" throws in June only)
 */
const oneUnconfirmed: HolidayProvider = {
  id: "ONE-UNCONFIRMED",
  timeZone: "UTC",
  dataVersion: "1",
  supportedYears: { from: 2025, to: 2027 },
  holidaysInYear: (year) =>
    year === 2026
      ? [{ date: "2026-06-15", name: "X", nameEn: "X", kind: "regular", confirmed: false }]
      : [],
};
const juneThrows = createCalendar({
  holidayProvider: oneUnconfirmed,
  closedWeekdays: [0, 6],
  unconfirmedHolidayPolicy: "throw",
});
const sequential = (list: readonly object[]) => ({
  holidayProvider: oneUnconfirmed,
  outOfRangePolicy: "ignore" as const,
  weekdayValues: ["c", "o", "o", "o", "o", "o", "c"] as const,
  recurringRules: list as never,
});
/**
 * A rule whose basis calendar throws in June 2026 only, X (no period; overlaps June), Y (from 2027; does not
 * overlap June)
 */
const SEQUENTIAL_RULES: readonly object[] = [
  { businessDayOfMonth: 1, value: "first", calendar: juneThrows },
  { weekday: 2, value: "o" },
  { weekday: 2, nth: 1, value: "o", effectiveFrom: "2027-01-01" },
];

test("判定できない月と逐次除去: 有効期間がその月に重なる規則（X）は redundant を出さず、取り除かない。X を外した設定で判定した診断も出ない", () => {
  const list = diagnoseSchedule(sequential(SEQUENTIAL_RULES));
  // X (recurringRules[1]) has the same value as the weekday's, so it would be redundant without an unsure month.
  // It is an unsure rule and is not reported.
  // Y (recurringRules[2]) is covered by X (this follows from the shapes and does not depend on unsure months),
  // so only shadowed is reported
  assert.deepEqual(
    list.map((d) => [d.code, d.path]),
    [["shadowed", "recurringRules[2]"]],
  );
});

test("判定できない月と逐次除去: 分からない月の集合は規則の並びに左右されない（並べ替えても、分からない規則への診断が出ない）", () => {
  const reversed = [...SEQUENTIAL_RULES].reverse();
  const list = diagnoseSchedule(sequential(reversed));
  assert.deepEqual(
    list.filter((d) => d.code === "never-matches" || d.code === "redundant").map((d) => d.path),
    [],
  );
});

test("判定できない月と逐次除去: 出た規則をまとめて取り除いても、判定できる日の結果が変わらない", () => {
  const list = diagnoseSchedule(sequential(SEQUENTIAL_RULES));
  const removable = new Set(
    list
      .filter((d) => ["shadowed", "never-matches", "redundant"].includes(d.code))
      .map((d) => Number(/\[(\d+)\]$/.exec(d.path)![1])),
  );
  const before = createSchedule(sequential(SEQUENTIAL_RULES));
  const after = createSchedule(sequential(SEQUENTIAL_RULES.filter((_, i) => !removable.has(i))));
  let compared = 0;
  const days: string[] = [];
  for (let d = Date.UTC(2025, 0, 1); d <= Date.UTC(2027, 11, 31); d += 86_400_000)
    days.push(new Date(d).toISOString().slice(0, 10));
  for (const date of days) {
    let value: unknown;
    try {
      value = before.valueOn(date);
    } catch {
      continue;
    }
    assert.deepEqual(after.valueOn(date), value, date);
    compared++;
  }
  assert.ok(compared > 300, `比べた日が少ない: ${compared}`);
});

// ------------------------------------------------------------
// Fixed options for results equal to 0.31.0-A (the basis is a calendar with Japan's holidays and closed
// weekends; the window is 1955-2099)
// ------------------------------------------------------------

test("判定できない月の範囲: 月の規則は窓の外の月に左右されず、週の規則は窓の両端で隣の月に巻き込まれる（0.31.0-A と同じ）", () => {
  const jpBasis = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const flat = createCalendar({ timeZone: "Asia/Tokyo", closedWeekdays: [0, 6] });
  const run = (recurringRules: object[]) =>
    diagnoseSchedule({
      holidayProvider: jp,
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      recurringRules: recurringRules as never,
    }).map((d) => [d.code, d.path, d.relatedPath ?? null]);
  const day25 = { businessDayOfMonth: 25, calendar: jpBasis, value: "x" };
  const week = { businessDayOfWeek: 1, weekStart: 1, calendar: jpBasis, value: "a" };
  const cases: [string, object[], unknown[]][] = [
    [
      "月の規則 2 つ",
      [
        { businessDayOfMonth: 1, months: [1], calendar: jpBasis, value: "x" },
        { businessDayOfMonth: 1, calendar: jpBasis, value: "x" },
      ],
      [["redundant", "recurringRules[0]", "recurringRules[1]"]],
    ],
    // Narrowing the effective period only makes the intersection with the unjudgeable days smaller
    // (decisions.md #31), so when never-matches appears without an effective period it always appears in the
    // narrowed forms. The 3 examples with a narrowed effective period (from 1955-02, until 2099-11, both) were
    // removed in 0.31.1
    ["第 25 営業日", [day25], [["never-matches", "recurringRules[0]", null]]],
    // For a week rule the first week of the window (January 1955) looks at the basis of December 1954, so the
    // rule is caught at both ends of the window (on the safe side. The limits of decisions.md #31)
    ["週の規則（有効期間なし）", [week], []],
    [
      "週の規則（1956〜2098 年）",
      [{ ...week, effectiveFrom: "1956-01-01", effectiveTo: "2098-12-31" }],
      [["redundant", "recurringRules[0]", null]],
    ],
    // Being caught comes from "the basis throws", not from "the end of the window" (with a basis that does not
    // throw it is reported even without an effective period)
    [
      "週の規則（投げない基準）",
      [{ ...week, calendar: flat }],
      [["redundant", "recurringRules[0]", null]],
    ],
  ];
  for (const [label, rules, expected] of cases) assert.deepEqual(run(rules), expected, label);
});

test("判定できない月の範囲: 基準を求める月は、規則が基準を評価する月（months）に絞る。絞った外の月で基準が投げても数えない", () => {
  // The Japanese basis that throws for unconfirmed holidays throws in the months of the equinox days (March,
  // September) from 2028. A February-only rule does not evaluate the basis of March or September, so there is
  // no unjudgeable month (as in 0.31.0-A; a simplified form of the options of consistency 10)
  const strict = createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "throw" });
  const run = (first: object) =>
    diagnoseSchedule({
      holidayProvider: jp,
      weekdayValues: ["closed", "a", "a", "a", "a", "a", "a"],
      recurringRules: [first, { weekday: 0, value: "closed" }] as never,
    }).map((d) => [d.code, d.path]);
  assert.deepEqual(run({ businessDayOfMonth: 1, months: [2], calendar: strict, value: "y" }), [
    ["redundant", "recurringRules[1]"],
  ]);
  // A rule without a month filter evaluates the basis of March and September, so there are unjudgeable months
  // and neither rule is reported
  assert.deepEqual(run({ businessDayOfMonth: 1, calendar: strict, value: "y" }), []);
});

test("判定できない月の範囲: 窓の月は有効期間で絞る（1970 年からの基準を 1975 年から使う月の規則は、1955〜1969 年の月を数えない）", () => {
  // A basis with supported years 1970-2099 (Japan's holidays). The schedule's window is Japan's supported years
  // (1955-2099). When the month rule starts in 1975, the months in which the basis can be evaluated are from
  // 1975 and in the representative 28 years, none of which throws, so there is no unjudgeable month and
  // redundant of the annual date is reported
  const from1970: HolidayProvider = {
    ...jp,
    id: "JP-1970",
    supportedYears: { from: 1970, to: 2099 },
  };
  const basis1970 = createCalendar({ holidayProvider: from1970, closedWeekdays: [0, 6] });
  const run = (rule: object) =>
    diagnoseSchedule({
      holidayProvider: jp,
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      annualDates: [{ date: "05-05", value: "a" }],
      recurringRules: [rule] as never,
    })
      .filter((d) => d.code === "redundant" || d.code === "never-matches")
      .map((d) => [d.code, d.path]);
  const rule = { businessDayOfMonth: 1, calendar: basis1970, value: "x" };
  assert.deepEqual(run({ ...rule, effectiveFrom: "1975-01-01" }), [
    ["redundant", "annualDates[0]"],
  ]);
  // Without an effective period the basis can be evaluated in months of 1955-1969 (it throws outside the
  // supported years), so there are unjudgeable months and nothing is reported
  assert.deepEqual(run(rule), []);
});

test("判定できない日（日の単位）: 1970-01-05 始まりの週の規則は、週が 1969 年 12 月にまたがないので分かる（redundant が出る）", () => {
  // A basis with supported years 1970-2099. By month (0.31.0-B) the rule was unsure because the basis throws in
  // the month before the week rule (December 1969). By day, the first week of the effective period (1970-01-05
  // to 01-11) lies within January 1970, so there is no unjudgeable day
  const from1970: HolidayProvider = {
    ...jp,
    id: "JP-1970",
    supportedYears: { from: 1970, to: 2099 },
  };
  const basis1970 = createCalendar({ holidayProvider: from1970, closedWeekdays: [0, 6] });
  const run = (rule: object) =>
    diagnoseSchedule({
      holidayProvider: jp,
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      recurringRules: [rule] as never,
    })
      .filter((d) => d.code === "redundant" || d.code === "never-matches")
      .map((d) => [d.code, d.path]);
  // The end is 2099-12-27 (a Sunday) too, so that the last week of the window (2099-12-28 to 2100-01-03) does
  // not reach into 2100
  const week = {
    businessDayOfWeek: 1,
    weekStart: 1,
    calendar: basis1970,
    value: "a",
    effectiveTo: "2099-12-27",
  };
  assert.deepEqual(run({ ...week, effectiveFrom: "1970-01-05" }), [
    ["redundant", "recurringRules[0]"],
  ]);
  // Starting on 1970-01-01, the first week (1969-12-29 to 1970-01-04) reaches into December 1969, where the
  // basis throws, so nothing is reported
  assert.deepEqual(run({ ...week, effectiveFrom: "1970-01-01" }), []);
  // Extending the end to the end of the window makes the last week reach into January 2100, where the basis
  // throws, so nothing is reported
  assert.deepEqual(run({ ...week, effectiveFrom: "1970-01-05", effectiveTo: "2099-12-31" }), []);
});

test("基準のカレンダーの中が分からない（作成関数で作っていない）とき・中の周期が診断の範囲より長いときは、診断の範囲の全部の日を調べる。どの基準でも、同じ項目が出る", () => {
  const open = { timeZone: "UTC", closedWeekdays: [] } as CalendarOptions;
  const periodic = createCalendar({
    ...open,
    closedAnnualDates: [{ from: "01-01", to: "01-03", effectiveTo: "2030-12-31" }],
  } as CalendarOptions);
  const bases: [string, object, boolean][] = [
    ["中に有効期間", periodic, false],
    ["合成", combineCalendars([periodic, createCalendar(open)], { open: "all" }), false],
    [
      "6 週ごと（周期 56 年。2100 年をまたがない）",
      createCalendar({
        ...open,
        closedRecurringRules: [{ weekday: 5, interval: 6, anchor: "2026-09-18" }],
      } as CalendarOptions),
      false,
    ],
    ["作成関数で作っていない", { ...periodic }, true],
    [
      "個別の日付が遠く離れて 12 個（どれも診断の範囲の外）",
      createCalendar({
        ...open,
        closedDates: [1100, 1250, 1400, 1550, 1700, 1850, 2300, 2450, 2600, 2750, 2900, 3050].map(
          (y) => `${y}-01-02`,
        ),
      } as CalendarOptions),
      false,
    ],
    [
      "cycle 126 日（周期 168 年。診断の範囲より長い）",
      createCalendar({
        ...open,
        closedRecurringRules: [{ cycle: 126, anchor: "2024-06-14", positions: [63] }],
      } as CalendarOptions),
      true,
    ],
    [
      "cycle 324 日（周期が診断の範囲より長い）",
      createCalendar({
        ...open,
        closedRecurringRules: [{ cycle: 324, anchor: "2012-06-16", positions: [25] }],
      } as CalendarOptions),
      true,
    ],
  ];
  const allDays =
    (Date.UTC(DIAGNOSTIC_YEARS.to + 1, 0, 1) - Date.UTC(DIAGNOSTIC_YEARS.from, 0, 1)) / 86_400_000;
  for (const [name, basis, whole] of bases) {
    const options = {
      timeZone: "UTC",
      weekdayValues: [1, 1, 1, 1, 1, 1, 1],
      dates: [{ date: "2026-05-05", value: 1 }],
      recurringRules: [
        { businessDayOfMonth: 1, months: [1], calendar: basis, value: 0 },
        { weekday: 3, value: 2 },
        { weekday: 3, nth: [1], value: 2 },
        { dayOfMonth: 31, months: [2], value: 3 },
        { weekday: 2, value: 1 },
      ],
    };
    const compiled = compileScheduleOptions<unknown, string>(new IssueCollector(), options)!;
    const scanned = rulesScanWindow(compiled)!.ranges.reduce((n, r) => n + r.to - r.from + 1, 0);
    assert.equal(scanned === allDays, whole, `${name}: ${scanned} / ${allDays}`);
    assert.deepEqual(
      brief(options),
      [
        ["warning", "shadowed", "recurringRules[2]"],
        ["warning", "never-matches", "recurringRules[3]"],
        ["info", "redundant", "dates[0]"],
        ["info", "redundant", "recurringRules[4]"],
      ],
      name,
    );
  }
});

test("暦日の範囲の端（1000 年・9999 年）の個別の日付は、診断の範囲に日がないので調べず、out-of-range を出す（例外を投げない）", () => {
  // When the basis calendar has an nth-business-day-of-week rule, the basis throws in the edge weeks of the
  // calendar range (January 1000, December 9999). Up to 0.32.8 a specific date there was judged over its period
  // and the diagnostics threw an InternalError. A date without a day in the diagnostic range is not examined
  const weekBasis = createCalendar({
    closedRecurringRules: [{ businessDayOfWeek: -1, weekStart: 0 }],
  });
  const options = (date: string) => ({
    weekdayValues: ["c", "A", "A", "A", "A", "A", "c"] as const,
    recurringRules: [{ businessDayOfMonth: 3, value: "B", calendar: weekBasis }],
    // Each is a Monday with the same value as the weekday's (in a month that can be judged, removing it would
    // change no result)
    dates: [{ date, value: "A" }],
  });
  const codes = (date: string): string[] =>
    diagnoseSchedule(options(date)).map((d) => `${d.code} ${d.path}`);
  assert.deepEqual(codes("2030-05-06"), ["redundant dates[0]"]);
  assert.deepEqual(codes("9999-12-13"), ["out-of-range dates[0]"]);
  assert.deepEqual(codes("1000-01-06"), ["out-of-range dates[0]"]);
  // The same for a date whose period touches the edge month
  assert.deepEqual(
    diagnoseSchedule({
      ...options("2030-05-06"),
      dates: [{ from: "9999-11-29", to: "9999-12-13", value: "A" }],
    }).map((d) => `${d.code} ${d.path}`),
    ["out-of-range dates[0]"],
  );
});

test("基準のカレンダーの提供元の対応年が診断の範囲より広くても、診断の範囲の中の祝日は全部調べる（範囲の外の祝日は調べない）", () => {
  // The provider has holidays on the first weekday of June of the given years only, so the two rules below
  // differ only there (up to 0.32.8, holidays were examined in 1900-2099 only for a provider of 200 years or
  // more, and the provider of a basis calendar was not considered at all)
  const firstWeekdayOfJune = (year: number): string => {
    for (let d = 1; ; d++) {
      const date = `${year}-06-0${d}`;
      if (new Date(`${date}T00:00:00Z`).getUTCDay() % 6 !== 0) return date;
    }
  };
  const wide = (holidaysFrom: number, holidaysTo: number): HolidayProvider => ({
    id: "W",
    timeZone: "UTC",
    supportedYears: { from: 1800, to: 2400 },
    dataVersion: "1",
    holidaysInYear: (year) =>
      year >= holidaysFrom && year <= holidaysTo
        ? [
            {
              date: firstWeekdayOfJune(year),
              name: "H",
              nameEn: "H",
              kind: "regular",
              confirmed: true,
            },
          ]
        : [],
  });
  const plain = createCalendar({ closedWeekdays: [0, 6] });
  const options = (basis: ReturnType<typeof createCalendar>) => ({
    weekdayValues: ["c", "A", "A", "A", "A", "A", "c"] as const,
    recurringRules: [
      { businessDayOfMonth: 1, months: [6 as const], calendar: plain, value: "B" },
      { businessDayOfMonth: 1, months: [6 as const], calendar: basis, value: "B" },
    ],
  });
  const codes = (basis: ReturnType<typeof createCalendar>): string[] =>
    diagnoseSchedule(options(basis)).map((d) => `${d.code} ${d.path}`);
  /** Whether removing recurringRules[0] changes the value of the first weekday of June of `year` */
  const changes = (basis: ReturnType<typeof createCalendar>, year: number): boolean => {
    const day = firstWeekdayOfJune(year);
    const without = { ...options(basis), recurringRules: options(basis).recurringRules.slice(1) };
    return createSchedule(options(basis)).valueOn(day) !== createSchedule(without).valueOn(day);
  };
  for (const outOfRangePolicy of ["ignore", "throw"] as const) {
    // Holidays in years of the diagnostic range that are outside the representative 28 years (2001-2028): the
    // removal changes June 1965, so nothing is reported
    const inside = createCalendar({
      closedWeekdays: [0, 6],
      holidayProvider: wide(1960, 1970),
      outOfRangePolicy,
    });
    assert.deepEqual(codes(inside), [], outOfRangePolicy);
    assert.equal(changes(inside, 1965), true, outOfRangePolicy);
    // Holidays outside the diagnostic range only: within the range the two rules are the same, so the first is
    // reported. The statement is about the diagnostic range: the removal changes no day of it (and does change
    // June 2300, which is not examined)
    const outside = createCalendar({
      closedWeekdays: [0, 6],
      holidayProvider: wide(2200, 2320),
      outOfRangePolicy,
    });
    assert.deepEqual(codes(outside), ["redundant recurringRules[0]"], outOfRangePolicy);
    for (let year = DIAGNOSTIC_YEARS.from; year <= DIAGNOSTIC_YEARS.to; year++)
      assert.equal(changes(outside, year), false, `${outOfRangePolicy} ${year}`);
    assert.equal(changes(outside, 2300), true, outOfRangePolicy);
    assert.match(
      diagnoseSchedule(options(outside))[0]!.message,
      new RegExp(`checked ${DIAGNOSTIC_YEARS.from}-${DIAGNOSTIC_YEARS.to}\\)`),
    );
  }
  // A basis whose result does not depend on holidays
  const ignoring = createCalendar({
    closedWeekdays: [0, 6],
    holidayProvider: wide(1960, 1970),
    holidayPolicy: "ignore",
    outOfRangePolicy: "ignore",
  });
  assert.deepEqual(codes(ignoring), ["redundant recurringRules[0]"]);
});

test("診断の範囲（DIAGNOSTIC_YEARS）: 28 年の繰り返しが成り立つ年だけを含み、代表の 28 年間（2001〜2028 年）を含み、文書の定義と一致する", () => {
  const { from, to } = DIAGNOSTIC_YEARS;
  // A year divisible by 100 but not by 400 breaks the 28-year repetition of the weekdays (the scan relies on it)
  for (let y = from; y <= to; y++) assert.ok(y % 100 !== 0 || y % 400 === 0, String(y));
  assert.ok(from <= 2001 && to >= 2028);
  // The documents define the range in one place each, with these years (changing the constant without the
  // documents, or the reverse, fails here). Other places refer to it by name
  const definitions: [string, RegExp][] = [
    ["docs/guide.md", /\*\*diagnostic range\*\*[^\n]*?(\d{4})[–-](\d{4})/],
    ["docs/guide.ja.md", /\*\*診断の範囲\*\*[^\n]*?(\d{4})\s*[〜–-]\s*(\d{4})/],
    ["docs/decisions.md", /\*\*診断の範囲\*\*[^\n]*?(\d{4})\s*[〜–-]\s*(\d{4})/],
  ];
  for (const [file, pattern] of definitions) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const found = [...text.matchAll(new RegExp(pattern, "g"))];
    assert.equal(found.length, 1, `${file}: the definition must be written exactly once`);
    assert.deepEqual([Number(found[0]![1]), Number(found[0]![2])], [from, to], file);
  }
});

test("提供元のデータの検査（invalid-provider-data）は、対応年のうち診断の範囲に入る年だけを調べる", () => {
  /** A provider of 1800-2400 whose data is wrong (a date of another year) in `bad` only */
  const provider = (bad: number): HolidayProvider => ({
    id: "W",
    timeZone: "UTC",
    supportedYears: { from: 1800, to: 2400 },
    dataVersion: "1",
    holidaysInYear: (year) => [
      {
        date: `${year === bad ? year + 1 : year}-01-01`,
        name: "N",
        nameEn: "N",
        kind: "regular",
        confirmed: true,
      },
    ],
  });
  const codes = (bad: number): string[] =>
    diagnoseCalendar({ holidayProvider: provider(bad) }).map((d) => d.code);
  // The first and the last year of the diagnostic range are examined; the years next to them are not (the
  // judgement of a day of such a year still throws invalid-provider-data)
  assert.deepEqual(codes(DIAGNOSTIC_YEARS.from), ["invalid-provider-data"]);
  assert.deepEqual(codes(DIAGNOSTIC_YEARS.to), ["invalid-provider-data"]);
  assert.deepEqual(codes(DIAGNOSTIC_YEARS.from - 1), []);
  assert.deepEqual(codes(DIAGNOSTIC_YEARS.to + 1), []);
  assert.throws(
    () =>
      createCalendar({ holidayProvider: provider(DIAGNOSTIC_YEARS.to + 1) }).isBusinessDay(
        `${DIAGNOSTIC_YEARS.to + 1}-06-01`,
      ),
    { code: "invalid-provider-data" },
  );
});

test("基準に渡したカレンダーの形のオブジェクトが例外を投げる月は、例外の種類によらず判定できない月として扱い、error を出さない（0.32.8 までは holidayProvider の invalid-provider-data を出した）", () => {
  const holidays: HolidayProvider<string> = {
    id: "H",
    timeZone: "UTC",
    supportedYears: { from: 2000, to: 2030 },
    dataVersion: "1",
    holidaysInYear: (year) => [
      { date: `${year}-05-05`, name: "N", nameEn: "N", kind: "regular", confirmed: true },
    ],
  };
  const week = ["a", "b", "c", "d", "e", "f", "g"];
  const afterHoliday = {
    weekday: 1,
    value: "x",
    holidayOverlapPolicy: "after-holiday",
    skipWeekdays: [0],
  };
  for (const thrown of [new TypeError("boom"), new RangeError("boom"), "text", null]) {
    const broken = {
      timeZone: "UTC",
      isBusinessDay: (): boolean => {
        throw thrown;
      },
    };
    const options = {
      holidayProvider: holidays,
      weekdayValues: week,
      recurringRules: [afterHoliday, { businessDayOfMonth: 1, calendar: broken, value: "y" }],
    };
    // The schedule can be created; a judgement throws what the object throws
    createSchedule(options as never);
    // Every month of the rule is unjudgeable: nothing is claimed about it (no never-matches, no redundant), and
    // no error is reported for the options
    assert.deepEqual(brief(options), []);
    // Without the lost-shift check (no provider) the result is the same
    assert.deepEqual(
      brief({ weekdayValues: week, recurringRules: [options.recurringRules[1]] }),
      [],
    );
  }
  // A basis that throws in some months only: the rule is not reported, a rule without a basis still is
  const partly = {
    timeZone: "UTC",
    isBusinessDay: (date: string): boolean => {
      if (date.startsWith("2026-11")) throw new TypeError("boom");
      return true;
    },
  };
  assert.deepEqual(
    brief({
      weekdayValues: week,
      recurringRules: [
        { businessDayOfMonth: 31, calendar: partly, value: "y", months: [2] },
        { dayOfMonth: 31, months: [2], value: "z" },
      ],
    }),
    [
      ["warning", "never-matches", "recurringRules[0]"],
      ["warning", "never-matches", "recurringRules[1]"],
    ],
  );
  assert.deepEqual(
    brief({
      weekdayValues: week,
      recurringRules: [
        { businessDayOfMonth: 31, calendar: partly, value: "y", months: [11] },
        { dayOfMonth: 31, months: [2], value: "z" },
      ],
    }),
    [["warning", "never-matches", "recurringRules[1]"]],
  );
});

test("呼ぶたびに答えや投げ方を変えるカレンダーの形のオブジェクトを基準にしても、診断は例外を投げない（1 回の診断の中で、月ごとの最初の結果を使う）", () => {
  const week = ["a", "b", "c", "d", "e", "f", "g"];
  const shapes = (calendar: object): object[][] => [
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
  ];
  let runs = 0;
  for (let shape = 0; shape < 3; shape++)
    for (const limit of [0, 31, 1000, 20000, 53000, 150000])
      for (const mode of ["after", "every-third", "flip"]) {
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
            if (fails) throw Object.assign(new RangeError("changed"), { code: "out-of-range" });
            return mode === "flip" ? calls % 2 === 0 : true;
          },
        };
        const found = diagnoseSchedule({
          weekdayValues: week,
          recurringRules: shapes(unstable)[shape],
          dates: [{ from: "1990-01-10", to: "1990-03-05", value: "a" }],
        } as never);
        assert.deepEqual(
          found.filter((d) => d.severity === "error"),
          [],
        );
        runs++;
      }
  assert.equal(runs, 54);
});

test("第 n 営業日の規則の基準のカレンダーの提供元の対応年の外に個別の日付があっても、診断は例外を投げず、error を出さない（0.32.6〜0.32.8 は、この 72 通りのうち 32 通りで InternalError を投げた）", () => {
  const provider = (from: number, to: number): HolidayProvider => ({
    id: `C${from}`,
    timeZone: "UTC",
    supportedYears: { from, to },
    dataVersion: "1",
    holidaysInYear: (year) => [
      { date: `${year}-01-01`, name: "N", nameEn: "N", kind: "regular", confirmed: true },
    ],
  });
  const rules = [{ businessDayOfMonth: 1 }, { businessDayOfWeek: 1, weekStart: 0 }];
  // The supported years of the provider of the basis (it throws outside them)
  const basisYears: [number, number][] = [
    [2000, 2100],
    [2020, 2027],
  ];
  // The schedule itself: no provider, a provider with "ignore", a provider with "throw"
  const own = [
    {},
    { holidayProvider: provider(1955, 2099), outOfRangePolicy: "ignore", timeZone: "UTC" },
    { holidayProvider: provider(1800, 2400), timeZone: "UTC" },
  ];
  // Specific dates inside and outside the supported years of the basis, the diagnostic range and the supported
  // years of the schedule, and near both ends of the calendar dates
  const dates = [
    "2300-06-10",
    "2101-03-05",
    "2095-03-05",
    "1959-06-01",
    "1000-04-23",
    "2050-06-10",
  ];
  let runs = 0;
  for (const rule of rules)
    for (const years of basisYears)
      for (const options of own)
        for (const date of dates) {
          const basis = createCalendar({
            closedWeekdays: [0, 6],
            timeZone: "UTC",
            holidayProvider: provider(...years),
          });
          const label = `${JSON.stringify(rule)} basis ${years.join("-")} ${JSON.stringify(Object.keys(options))} ${date}`;
          let found: readonly { severity: string }[] = [];
          assert.doesNotThrow(() => {
            found = diagnoseSchedule({
              weekdayValues: ["closed", "A", "B", "closed", "closed", "A", "closed"],
              recurringRules: [{ ...rule, calendar: basis, value: "A" }],
              dates: [{ from: date, to: date, value: "X" }],
              ...options,
            } as never);
          }, label);
          assert.deepEqual(
            found.filter((d) => d.severity === "error"),
            [],
            label,
          );
          runs++;
        }
  assert.equal(runs, 72);
});
