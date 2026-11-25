import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  createCalendar,
  createSchedule,
  isBizdaysError,
  type CalendarOptions,
  type HolidayProvider,
  type RecurringRule,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { random } from "./support/catalog.ts";
import { holidayRun as runOf, holidaysOn } from "./support/provider.ts";

// Moves out of reach (decisions.md #24): when the day of an "after-holiday" rule cannot be moved to the day
// after a run of holidays longer than 31 days, the judgement throws holiday-run-too-long and the diagnostics
// return a warning with the same code at the rule's position

const CODE = "holiday-run-too-long";
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return isBizdaysError(e) ? e.code : `not a bizdays error: ${String(e)}`;
  }
};
const SUPPORTED = { from: 2020, to: 2030 };
const AFTER = { holidayOverlapPolicy: "after-holiday" } as const;
const options = (
  provider: HolidayProvider,
  rule: RecurringRule,
  more: CalendarOptions = {},
): CalendarOptions => ({
  holidayProvider: provider,
  holidayPolicy: "open",
  closedWeekdays: [],
  closedRecurringRules: [{ ...rule, ...AFTER } as RecurringRule],
  ...more,
});
const brief = (list: readonly { severity: string; code: string; path: string }[]) =>
  list.map((d) => [d.severity, d.code, d.path]);

/**
 * Naive definition: judges every day of the supported years one by one and returns the days that throw
 * holiday-run-too-long (only the judgement is used, not the diagnostics)
 */
function throwingDays(isBusinessDay: (date: string) => unknown, years = SUPPORTED): string[] {
  const days: string[] = [];
  for (let date = `${years.from}-01-01`; date <= `${years.to}-12-31`; date = addDays(date, 1)) {
    const code = codeOf(() => isBusinessDay(date));
    if (code === CODE) days.push(date);
    // An edge day of the supported years is out-of-range because its neighbour is outside them (the behaviour
    // as before. decisions.md #17)
    else if (code !== "out-of-range") assert.equal(code, undefined, date);
  }
  return days;
}

test("届かない振替: 31 日以内の連続は今までどおり振り替わり、31 日を超えても届く振替元があればその日から振り替わる", () => {
  // July 1-31 (31 days). August 1, the day after the run, is 31 days after July 1
  const within = options(runOf(31), { dayOfMonth: 1, months: [7] });
  assert.equal(createCalendar(within).dayInfoOn("2026-08-01").shiftedFrom, "2026-07-01");
  assert.deepEqual(diagnoseCalendar(within), []);
  // July 1 to August 9 (40 days). July 15 is 26 days before August 10, the day after the run, and within reach
  // (July 1 is not, but the nearer day is found first)
  const reachable = options(runOf(40), { dayOfMonth: [1, 15], months: [7] });
  assert.equal(createCalendar(reachable).dayInfoOn("2026-08-10").shiftedFrom, "2026-07-15");
  assert.deepEqual(diagnoseCalendar(reachable), []);
});

test("届かない振替: 届かない振替元があれば、明けた日の判定・その日を通る探索・その日を含む期間の計算が holiday-run-too-long", () => {
  // July 1 to August 9 (40 days). July 1 and 5 are more than 31 days before August 10, the day after the run
  const calendar = createCalendar(options(runOf(40), { dayOfMonth: [1, 5], months: [7] }));
  assert.throws(() => calendar.isBusinessDay("2026-08-10"), {
    name: "RangeError",
    code: CODE,
    message:
      /^closedRecurringRules\[0\]: the day 2026-07-05 cannot be moved to 2026-08-10: .*longer than 31 days/,
  });
  assert.equal(
    codeOf(() => calendar.dayInfoOn("2026-08-10")),
    CODE,
  );
  // Days inside the run and around it can be judged
  for (const date of ["2026-06-30", "2026-07-01", "2026-07-20", "2026-08-09", "2026-08-11"])
    assert.equal(calendar.isBusinessDay(date), true, date);
  // A search that passes the day after the run, and a calculation over a period containing it, stop too
  assert.equal(
    codeOf(() => calendar.addBusinessDays("2026-06-30", 45)),
    CODE,
  );
  assert.equal(
    codeOf(() => calendar.nextBusinessDay("2026-08-09")),
    CODE,
  );
  assert.equal(
    codeOf(() => calendar.diffBusinessDays("2026-01-01", "2026-12-31")),
    CODE,
  );
  assert.equal(
    codeOf(() => calendar.businessDatesBetween("2026-08-01", "2026-08-31")),
    CODE,
  );
  assert.equal(
    codeOf(() => calendar.nthBusinessDayOfMonth("2026-08", 20)),
    CODE,
  );
  // A period without that day can be counted
  assert.equal(calendar.diffBusinessDays("2026-08-11", "2026-08-31"), 20);
  assert.equal(calendar.businessDatesBetween("2026-07-01", "2026-08-09").length, 40);
});

test("届かない振替: 連続が 367 日を超えて続き、振替元を確かめられないときも holiday-run-too-long（文は別）", () => {
  // 546 days from 2025-01-01 (until 2026-06-30). The rule of February 29 has no matching day in the 367 days
  // searched back
  const o = options(runOf(546, "2025-01-01"), { dayOfMonth: 29, months: [2] });
  assert.throws(() => createCalendar(o).isBusinessDay("2026-07-01"), {
    code: CODE,
    message:
      /^closedRecurringRules\[0\]: no day can be moved to 2026-07-01: .*longer than 367 days/,
  });
  assert.deepEqual(brief(diagnoseCalendar(o)), [["warning", CODE, "closedRecurringRules[0]"]]);
  // When the run ends within 367 days it can be checked (365 days from 2025-07-01; there is no matching day, so
  // nothing stops)
  const shorter = options(runOf(365, "2025-07-01"), { dayOfMonth: 29, months: [2] });
  assert.equal(createCalendar(shorter).isBusinessDay("2026-07-01"), true);
  assert.deepEqual(diagnoseCalendar(shorter), []);
});

test("届かない振替: 連続の中に規則の日がなければ止めず、毎週の曜日の規則・祝日の前後の規則は連続の長さによらない", () => {
  // The June rule has no matching day inside the run that starts in July
  const june = options(runOf(40), { dayOfMonth: 15, months: [6] });
  assert.deepEqual(
    throwingDays((d) => createCalendar(june).isBusinessDay(d)),
    [],
  );
  assert.deepEqual(diagnoseCalendar(june), []);
  // A weekly weekday rule finds its original day within 7 days (August 10 is a Monday; the rule itself matches)
  const weekly = options(runOf(40), { weekday: 2 });
  assert.equal(createCalendar(weekly).dayInfoOn("2026-08-10").shiftedFrom, "2026-08-04");
  assert.deepEqual(diagnoseCalendar(weekly), []);
  // Rules for the days before and after a holiday do not depend on the length of the run
  const after: CalendarOptions = {
    holidayProvider: runOf(40),
    holidayPolicy: "open",
    closedWeekdays: [],
    closedRecurringRules: [{ dayAfterHoliday: true }],
  };
  assert.equal(createCalendar(after).isBusinessDay("2026-08-10"), false);
  assert.deepEqual(diagnoseCalendar(after), []);
});

test("届かない振替: 診断は同じ code の warning を規則の位置に 1 件返し、error を返さず、ほかの診断も返す", () => {
  // Rule [0] is a move out of reach; rule [2] is covered by rule [1] (shadowed)
  const o: CalendarOptions = {
    holidayProvider: runOf(40),
    holidayPolicy: "open",
    closedWeekdays: [],
    closedRecurringRules: [
      { dayOfMonth: [1, 5], months: [7], ...AFTER },
      { weekday: 3 },
      { weekday: 3, nth: 2 },
    ],
  };
  const list = diagnoseCalendar(o);
  assert.deepEqual(brief(list), [
    ["warning", CODE, "closedRecurringRules[0]"],
    ["warning", "shadowed", "closedRecurringRules[2]"],
  ]);
  // The position is the rule and the related position is the provider (with one provider). The text has the
  // same content as the error
  assert.equal(list[0]!.relatedPath, "holidayProvider");
  assert.match(list[0]!.message, /^the day 2026-07-05 cannot be moved to 2026-08-10: /);
  // The options can be created (no error)
  createCalendar(o);
  // With two or more providers there is no related position
  const two = { ...o, holidayProvider: [runOf(40), runOf(1, "2026-01-01", "YY")] };
  const first = diagnoseCalendar(two)[0]!;
  assert.deepEqual(
    [first.code, first.path, "relatedPath" in first],
    [CODE, "closedRecurringRules[0]", false],
  );
});

// Kind of rule × length of the run × position of the rule day. The run starts on 2026-07-01 (a Wednesday)
const RULE_SHAPES: readonly (readonly [string, RecurringRule])[] = [
  ["月の日（1 日）", { dayOfMonth: 1, months: [7] }],
  ["月の日（5 日）", { dayOfMonth: 5, months: [7] }],
  ["月の日（15 日）", { dayOfMonth: 15, months: [7] }],
  ["第 1 水曜日", { weekday: 3, nth: 1, months: [7] }],
  ["第 2 金曜日", { weekday: 5, nth: 2, months: [7] }],
  ["6 週ごとの水曜日", { weekday: 3, interval: 6, anchor: "2026-07-01" }],
  [
    "月の日（1 日）・土日を飛ばす",
    { dayOfMonth: 1, months: [7], skipWeekdays: [0, 6] as const, ...AFTER },
  ],
  [
    "月の日（5 日）・土日を飛ばす",
    { dayOfMonth: 5, months: [7], skipWeekdays: [0, 6] as const, ...AFTER },
  ],
];
const RUN_LENGTHS = [30, 31, 32, 40] as const;

test("届かない振替: 判定がどこかの日で投げることと、診断がその規則に warning を出すことは同じ（規則の種類 × 連続の長さ）", () => {
  let lost = 0;
  let kept = 0;
  for (const [label, rule] of RULE_SHAPES) {
    for (const days of RUN_LENGTHS) {
      const o = options(runOf(days), rule);
      const calendar = createCalendar(o);
      const thrown = throwingDays((d) => calendar.isBusinessDay(d));
      const warned = diagnoseCalendar(o).filter((d) => d.code === CODE);
      const context = `${label} 連続 ${days} 日: 投げる日 ${JSON.stringify(thrown)}`;
      assert.equal(warned.length > 0, thrown.length > 0, context);
      assert.ok(
        warned.every((d) => d.severity === "warning" && d.path === "closedRecurringRules[0]"),
        context,
      );
      // At most one day throws, within 7 days after the run
      assert.ok(thrown.length <= 1, context);
      if (thrown.length > 0) lost++;
      else kept++;
    }
  }
  console.log(`# 届かない振替: ${lost + kept} 件（投げる ${lost}、投げない ${kept}）`);
  assert.ok(lost > 0 && kept > 0);
});

test("届かない振替: 飛ばす曜日のある規則は、祝日の連続が 31 日より短くても、前後の飛ばす曜日を足して届かなければ、判定も診断も知らせる", () => {
  // The judgement counts holidays and skipped weekdays (weekends) together. The weekday on which the run starts
  // (7 variants) and its length vary, to exercise a rule day on the weekend before the run and a weekend
  // following the run. The supported years are 2025-2027, to keep the naive scan short
  const years = { from: 2025, to: 2027 };
  let lost = 0;
  let kept = 0;
  let shortRun = 0;
  for (let offset = 0; offset < 7; offset++) {
    const start = addDays("2026-07-01", offset);
    const first = Number(start.slice(8));
    for (const days of [19, 20, 29, 30] as const) {
      // Rule days: the first day of the run and 2 days before it (a day before the run that may be a skipped
      // weekday)
      for (const dayOfMonth of [first, first - 2].filter((d) => d >= 1)) {
        const o = options(runOf(days, start, "XX", years), {
          dayOfMonth,
          months: [7],
          skipWeekdays: [0, 6],
          ...AFTER,
        } as RecurringRule);
        const calendar = createCalendar(o);
        const thrown = throwingDays((d) => calendar.isBusinessDay(d), years);
        const warned = diagnoseCalendar(o).filter((d) => d.code === CODE);
        const context = `${start} から ${days} 日・${dayOfMonth} 日の規則: 投げる日 ${JSON.stringify(thrown)}`;
        assert.equal(warned.length > 0, thrown.length > 0, context);
        if (thrown.length > 0) {
          lost++;
          if (days < 31) shortRun++;
        } else kept++;
      }
    }
  }
  console.log(
    `# 届かない振替（飛ばす曜日）: ${lost + kept} 件（投げる ${lost}、うち祝日が 31 日未満 ${shortRun}。投げない ${kept}）`,
  );
  assert.ok(shortRun > 0 && kept > 0);
});

test("届かない振替: 年をまたぐ連続でも、判定と診断が一致する", () => {
  // 42 days from 2026-12-10 (until 2027-01-20). December 12 is 40 days before January 21, the day after the run
  const o = options(runOf(42, "2026-12-10"), { dayOfMonth: 12, months: [12] });
  assert.deepEqual(
    throwingDays((d) => createCalendar(o).isBusinessDay(d)),
    ["2027-01-21"],
  );
  assert.deepEqual(brief(diagnoseCalendar(o)), [["warning", CODE, "closedRecurringRules[0]"]]);
});

test("届かない振替: 明けた日を個別の日付・先の規則が決めていれば、判定も診断も何も出さない", () => {
  const rule: RecurringRule = { dayOfMonth: [1, 5], months: [7] };
  // A specific date (an extra business day) decides the day after the run
  const byDate = options(runOf(40), rule, { openDates: ["2026-08-10"] });
  assert.deepEqual(
    throwingDays((d) => createCalendar(byDate).isBusinessDay(d)),
    [],
  );
  assert.deepEqual(
    diagnoseCalendar(byDate).filter((d) => d.code === CODE),
    [],
  );
  // A rule written earlier (every Monday) decides the day after the run (a Monday)
  const byRule: CalendarOptions = {
    holidayProvider: runOf(40),
    holidayPolicy: "open",
    closedWeekdays: [],
    closedRecurringRules: [{ weekday: 1 }, { ...rule, ...AFTER }],
  };
  assert.deepEqual(
    throwingDays((d) => createCalendar(byRule).isBusinessDay(d)),
    [],
  );
  assert.deepEqual(
    diagnoseCalendar(byRule).filter((d) => d.code === CODE),
    [],
  );
});

test("届かない振替: スケジュールでも、判定は holiday-run-too-long で、診断は warning", () => {
  const o = {
    holidayProvider: runOf(40),
    holidayPolicy: "ignore" as const,
    weekdayValues: [1, 1, 1, 1, 1, 1, 1] as const,
    recurringRules: [{ dayOfMonth: [1, 5] as const, months: [7] as const, value: 2, ...AFTER }],
  };
  const schedule = createSchedule(o);
  assert.deepEqual(
    throwingDays((d) => schedule.valueOn(d)),
    ["2026-08-10"],
  );
  assert.deepEqual(brief(diagnoseSchedule(o)), [["warning", CODE, "recurringRules[0]"]]);
  // A schedule whose basis calendar throws for a move out of reach: the diagnostics return no error (treated as
  // an unjudgeable month)
  const basis = createCalendar(options(runOf(40), { dayOfMonth: [1, 5], months: [7] }));
  assert.equal(
    codeOf(() => basis.isBusinessDay("2026-08-10")),
    CODE,
  );
  const counting = {
    timeZone: "UTC",
    weekdayValues: [1, 1, 1, 1, 1, 1, 1] as const,
    recurringRules: [{ businessDayOfMonth: 1 as const, calendar: basis, value: 2 }],
  };
  assert.deepEqual(
    diagnoseSchedule(counting).filter((d) => d.severity === "error"),
    [],
  );
  assert.equal(
    codeOf(() => createSchedule(counting).valueOn("2026-08-03")),
    CODE,
  );
  assert.equal(createSchedule(counting).valueOn("2026-07-01"), 2);
  // A rule that matches only in the month in which the basis calendar throws is not never-matches (an
  // unjudgeable month; unless a month that threw is treated as a month that cannot be counted, it would wrongly
  // seem to have no matching day)
  const onlyAugust = {
    ...counting,
    recurringRules: [
      {
        businessDayOfMonth: 1 as const,
        calendar: basis,
        value: 2,
        months: [8] as const,
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
      },
    ],
  };
  assert.deepEqual(diagnoseSchedule(onlyAugust), []);
});

test("届かない振替: 届かない振替のある設定の診断は、規則どうしを調べる走査の例外を error（invalid-provider-data）にしない", () => {
  // A rule with a move out of reach is mixed into options that go through the scans of shadowed, redundant,
  // counting-basis and nth-business-day rules
  const o: CalendarOptions = {
    holidayProvider: runOf(40),
    holidayPolicy: "closed",
    closedWeekdays: [0, 6],
    closedAnnualDates: ["01-01", "01-01"],
    closedDates: ["2026-08-11"],
    closedRecurringRules: [
      { dayOfMonth: [1, 5], months: [7], ...AFTER },
      { weekday: 3 },
      { weekday: 3, nth: 2 },
      { weekday: 6 },
      { businessDayOfMonth: 1 },
      { dayOfMonth: 20, ...AFTER },
    ],
  };
  const list = diagnoseCalendar(o);
  const codes = list.map((d) => d.code);
  assert.equal(codes.includes("invalid-provider-data"), false, JSON.stringify(brief(list)));
  assert.deepEqual(
    list.filter((d) => d.severity === "error"),
    [],
  );
  assert.ok(
    codes.includes(CODE) && codes.includes("shadowed") && codes.includes("redundant"),
    JSON.stringify(brief(list)),
  );
  // The scan that finds whether there is any business day judges every day, so it always passes the day after
  // the run. It handles the error of the move out of reach and does not count that day as a business day
  // (otherwise the results of the diagnostics between rules would be discarded and become an
  // invalid-provider-data error)
  const allClosed: CalendarOptions = {
    holidayProvider: runOf(40),
    holidayPolicy: "closed",
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    closedRecurringRules: [{ dayOfMonth: [1, 5], months: [7], ...AFTER }],
  };
  assert.deepEqual(brief(diagnoseCalendar(allClosed)), [
    ["warning", CODE, "closedRecurringRules[0]"],
    ["warning", "no-business-day", ""],
    ["info", "redundant", "closedRecurringRules[0]"],
  ]);
});

test("届かない振替: 祝日の塊の間に、飛ばす曜日でない日があれば、そこが明けた日になる（塊の途中でも、判定も診断も知らせる）", () => {
  // 35 days from 2026-03-03 (until April 6), a gap of 3 days, then 20 days from April 10. For a rule skipping
  // Wednesday to Friday, April 7 (a Tuesday) is the day after the run and March 4 is 34 days before. Of the 3
  // days of the gap the 8th and 9th are skipped weekdays, so holidays and skipped weekdays last until April 29
  const dates = [
    ...Array.from({ length: 35 }, (_, i) => addDays("2026-03-03", i)),
    ...Array.from({ length: 20 }, (_, i) => addDays("2026-04-10", i)),
  ];
  const o = options(holidaysOn(dates), {
    dayOfMonth: 4,
    months: [3],
    skipWeekdays: [3, 4, 5],
    ...AFTER,
  } as RecurringRule);
  assert.deepEqual(
    throwingDays((d) => createCalendar(o).isBusinessDay(d)),
    ["2026-04-07"],
  );
  assert.deepEqual(brief(diagnoseCalendar(o)), [["warning", CODE, "closedRecurringRules[0]"]]);
});

test("届かない振替: 乱数で作った祝日の並びと規則でも、判定が投げる規則に、診断は warning を出す（種は固定）", () => {
  // Sequences that the tests with fixed forms do not exercise (number, length and distance of blocks, sets of
  // skipped weekdays, shapes and order of rules) are made with random numbers
  const next = random(20261114);
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const years = { from: 2025, to: 2027 };
  const pathOf = (date: string, isBusinessDay: (date: string) => unknown): string | undefined => {
    try {
      isBusinessDay(date);
      return undefined;
    } catch (e) {
      assert.ok(isBizdaysError(e) && e.code === CODE, `${date}: ${String(e)}`);
      return (e as Error).message.slice(0, (e as Error).message.indexOf(":"));
    }
  };
  let lost = 0;
  let kept = 0;
  let lostInBlocks = 0;
  for (let trial = 0; trial < 200; trial++) {
    // 1-3 blocks of holidays. Length 1-40 days (60% are 25 days or more), distance 1-8 days
    const dates: string[] = [];
    const blocks = int(1, 3);
    const first = addDays("2026-03-01", int(0, 20));
    let day = first;
    for (let b = 0; b < blocks; b++) {
      const length = next() < 0.6 ? int(25, 40) : int(1, 24);
      for (let i = 0; i < length; i++) dates.push(addDays(day, i));
      day = addDays(day, length + int(1, 8));
    }
    // 0-3 skipped weekdays
    const candidates = [0, 1, 2, 3, 4, 5, 6].filter(() => next() < 0.25).slice(0, 3);
    const shape: Record<string, unknown> =
      next() < 0.7
        ? // The day of the month is near the start of the first block (from 3 days before to 6 days after)
          {
            dayOfMonth: Number(addDays(first, int(-3, 6)).slice(8)),
            // Half use one month only (when the same day of the next month is inside the block, the nearer one
            // moves and is within reach)
            months: next() < 0.5 ? [Number(first.slice(5, 7))] : [2, 3, 4],
          }
        : { weekday: int(0, 6), nth: int(1, 4), months: [3, 4] };
    // A weekday rule cannot have its own weekday among the skipped weekdays (wrong options)
    const skipped = candidates.filter((w) => w !== shape["weekday"]);
    const shifting = {
      ...shape,
      ...(skipped.length > 0 ? { skipWeekdays: skipped } : {}),
      ...AFTER,
    };
    // Half add a weekly weekday rule before or after (when an earlier rule decides the day after the run, no
    // move out of reach occurs)
    const weekly = { weekday: int(0, 6) };
    const rules =
      next() < 0.5 ? [shifting] : next() < 0.5 ? [weekly, shifting] : [shifting, weekly];
    const o = {
      holidayProvider: holidaysOn(dates, years),
      holidayPolicy: "open",
      closedWeekdays: [],
      closedRecurringRules: rules,
    } as CalendarOptions;
    const calendar = createCalendar(o);
    const thrown = new Set<string>();
    for (let date = "2026-02-01"; date <= "2026-08-31"; date = addDays(date, 1)) {
      const path = pathOf(date, (d) => calendar.isBusinessDay(d));
      if (path !== undefined) thrown.add(path);
    }
    const list = diagnoseCalendar(o);
    const warned = new Set(list.filter((d) => d.code === CODE).map((d) => d.path));
    const context = `試行 ${trial}: ${JSON.stringify({ dates: [dates[0], dates.length, blocks], rules })}`;
    assert.deepEqual(
      list.filter((d) => d.severity === "error"),
      [],
      context,
    );
    // A rule for which the judgement throws gets a warning, and a warning appears only for options whose
    // judgement throws on some day
    for (const path of thrown) assert.ok(warned.has(path), `${context} 投げる ${path}`);
    assert.equal(warned.size > 0, thrown.size > 0, context);
    if (thrown.size > 0) {
      lost++;
      if (blocks > 1) lostInBlocks++;
    } else kept++;
  }
  console.log(
    `# 届かない振替（乱数）: ${lost + kept} 件（投げる ${lost}、うち塊が 2 つ以上 ${lostInBlocks}。投げない ${kept}）`,
  );
  assert.ok(lost >= 5 && lostInBlocks > 0 && kept > 0);
});

test("届かない振替: 暦日の範囲の端（9999-12-31）の祝日の後の日でも、診断は例外にならない", () => {
  // 9999-12-30 is a holiday. Evaluating the next day (9999-12-31), the day-before-holiday rule looks at a day
  // outside the range (10000-01-01) and throws
  const o: CalendarOptions = {
    holidayProvider: holidaysOn(["9999-12-30"], { from: 9998, to: 9999 }),
    holidayPolicy: "open",
    closedWeekdays: [],
    closedRecurringRules: [
      { dayOfMonth: 1, skipWeekdays: [0, 6] as const, ...AFTER },
      { dayBeforeHoliday: true },
    ],
  };
  assert.deepEqual(
    diagnoseCalendar(o).filter((d) => d.severity === "error"),
    [],
  );
});
