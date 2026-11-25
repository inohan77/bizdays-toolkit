// Consistency between APIs (T5 of the test expansion plan). With the options of the catalog generator
// (test/support/catalog.ts), checks that asking the same thing through different APIs gives the same answer. The
// options include calendars and schedules, a home-made provider with few supported years (2025-2027) and no
// provider.
// pnpm check runs a fixed sample only. The full set runs with CONSISTENCY_API_FULL=1, in the diagnose-consistency
// job of CI.
// The number of options tried is printed per relation, and 0 fails.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
  type Calendar,
  type CalendarOptions,
  type ScheduleOptions,
} from "../src/index.ts";
import {
  diagnoseCalendar,
  diagnoseSchedule,
  migrateCalendarOptions,
  migrateScheduleOptions,
} from "../src/diagnose/index.ts";
import {
  CALENDAR_REF,
  CONTEXTS,
  isIntendedInvalid,
  picker,
  random,
  randomCalendarOptions,
  randomScheduleOptions,
  withoutHolidays,
  type Context,
  type Obj,
} from "./support/catalog.ts";
import { toOld } from "./support/old-names.ts";
import { flagEnv } from "./support/env.ts";
import { skipWhen } from "./support/skip.ts";
import { jp } from "../src/jp/index.ts";
import { sg } from "../src/sg/index.ts";
import { daysOf } from "./support/compare.ts";
import { SHORT_PROVIDER } from "./support/provider.ts";
import { SHORT_RANGE } from "./support/sites.ts";

const FULL = flagEnv("CONSISTENCY_API_FULL");
/** The number of options per relation (sample, full set) */
const RUNS = FULL
  ? { days: 120, search: 120, counting: 120, diagnose: 150, migrate: 80, basis: 40 }
  : { days: 12, search: 12, counting: 12, diagnose: 12, migrate: 6, basis: 5 };

/** All days of the supported years of the home-made provider (tried with outOfRangePolicy: "ignore") */
const DAYS = daysOf(SHORT_RANGE.from, SHORT_RANGE.to);
/**
 * The inner range that does not look into a neighbouring year (tried with the default "throw"; day-after and
 * day-before-holiday rules do not see a neighbouring year)
 */
const INNER = { from: "2025-02-01", to: "2027-11-30" } as const;
/** The two variants tried: the default "throw" on the inner range, "ignore" on the whole supported years */
const VARIANTS = [
  { policy: undefined, range: INNER, days: daysOf(INNER.from, INNER.to), label: "throw・内側" },
  { policy: "ignore", range: SHORT_RANGE, days: DAYS, label: "ignore・全範囲" },
] as const;
/**
 * Adds outOfRangePolicy. The basis calendar of an nth-business-day rule of a schedule is rebuilt too, with the
 * same providers and the same outOfRangePolicy (a basis calendar left at the default "throw" would look into a
 * neighbouring year when counting the edge weeks and months of the range, and throw)
 */
const withPolicy = (options: Obj, policy: string | undefined): Obj => {
  if (policy === undefined) return options;
  const out: Obj = { ...options, outOfRangePolicy: policy };
  if (Array.isArray(out["recurringRules"])) {
    const basis = createCalendar({
      ...(options["holidayProvider"] === undefined ? {} : source(true)),
      closedWeekdays: [0, 6],
      outOfRangePolicy: policy,
    } as CalendarOptions);
    out["recurringRules"] = (out["recurringRules"] as Obj[]).map((r) =>
      "calendar" in r ? { ...r, calendar: basis } : r,
    );
  }
  return out;
};

/** The context of the home-made provider (shapes that depend on holidays are made) and the context without a provider */
const SHORT_CTX: Context = CONTEXTS["diagnose-properties"];
const NONE_CTX: Context = withoutHolidays(SHORT_CTX);
const source = (withHolidays: boolean): Obj =>
  withHolidays ? { holidayProvider: SHORT_PROVIDER, timeZone: "UTC" } : {};

/** Calendar options of the catalog (2 of 3 with the home-made provider, the rest without a provider) */
function calendarOptions(rand: () => number, run: number, ctx?: Context): Obj {
  const withHolidays = run % 3 !== 2;
  return {
    ...source(withHolidays),
    ...randomCalendarOptions(picker(rand), ctx ?? (withHolidays ? SHORT_CTX : NONE_CTX)),
  };
}

/**
 * Schedule options of the catalog (the mark of the basis calendar becomes a calendar with the same providers and
 * closed weekends)
 */
function scheduleOptions(rand: () => number, run: number, ctx?: Context): Obj {
  const withHolidays = run % 3 !== 2;
  const o: Obj = {
    ...source(withHolidays),
    ...randomScheduleOptions(picker(rand), ctx ?? (withHolidays ? SHORT_CTX : NONE_CTX)),
  };
  if (Array.isArray(o["recurringRules"]))
    o["recurringRules"] = (o["recurringRules"] as Obj[]).map((r) =>
      r["calendar"] === CALENDAR_REF
        ? { ...r, calendar: createCalendar({ ...source(withHolidays), closedWeekdays: [0, 6] }) }
        : r,
    );
  return o;
}

/**
 * Creation (undefined when the options are wrong and cannot be created; an error without a bizdays error code is
 * rethrown)
 */
function tryCreate<T>(make: () => T): T | undefined {
  try {
    return make();
  } catch (e) {
    if (!isBizdaysError(e)) throw e;
    return undefined;
  }
}

/**
 * Whether an error is the failed search of options without a business day (skipped: the premise of the relation
 * is not met)
 */
const noBusinessDay = (e: unknown): boolean => isBizdaysError(e) && e.code === "no-business-day";

/** The number of options tried (relation → count) */
const tried: Record<string, number> = {};
const count = (relation: string): void => {
  tried[relation] = (tried[relation] ?? 0) + 1;
};
/** Prints the line with the count and fails on 0 (`unit` is what was counted) */
const report = (relation: string, unit = "設定"): void => {
  console.log(
    `# ${relation}: 試した${unit} ${tried[relation] ?? 0} 件（${FULL ? "全件" : "抜き出し"}）`,
  );
  assert.ok((tried[relation] ?? 0) > 0, `${relation}: 試した${unit}が 0 件（空振り）`);
};

test("整合 1: isBusinessDay・dayInfoOn().open・daysBetween の各日が一致する（スケジュールは valueOn・dayInfoOn().value・daysBetween）", () => {
  const rand = random(20261105);
  for (let run = 0; run < RUNS.days; run++) {
    const options = calendarOptions(rand, run);
    const sOptions = scheduleOptions(rand, run);
    for (const v of VARIANTS) {
      const calendar = tryCreate(() =>
        createCalendar(withPolicy(options, v.policy) as CalendarOptions),
      );
      if (calendar) {
        count(`整合 1（カレンダー・${v.label}）`);
        const between = calendar.daysBetween(v.range.from, v.range.to);
        v.days.forEach((day, i) => {
          const open = calendar.isBusinessDay(day);
          assert.equal(
            calendar.dayInfoOn(day).open,
            open,
            `run=${run} ${v.label} ${day} dayInfoOn`,
          );
          assert.equal(between[i]!.open, open, `run=${run} ${v.label} ${day} daysBetween`);
        });
      }
      const schedule = tryCreate(() =>
        createSchedule(withPolicy(sOptions, v.policy) as unknown as ScheduleOptions<unknown>),
      );
      if (schedule) {
        count(`整合 1（スケジュール・${v.label}）`);
        const between = schedule.daysBetween(v.range.from, v.range.to);
        v.days.forEach((day, i) => {
          const value = schedule.valueOn(day);
          assert.deepEqual(
            schedule.dayInfoOn(day).value,
            value,
            `run=${run} ${v.label} ${day} dayInfoOn`,
          );
          assert.deepEqual(between[i]!.value, value, `run=${run} ${v.label} ${day} daysBetween`);
        });
      }
    }
  }
  for (const v of VARIANTS) {
    report(`整合 1（カレンダー・${v.label}）`);
    report(`整合 1（スケジュール・${v.label}）`);
  }
});

test("整合 2: 次の営業日・前の営業日は営業日で、その間の日はすべて営業日でない", () => {
  const rand = random(20261106);
  for (let run = 0; run < RUNS.search; run++) {
    const calendar = tryCreate(() => createCalendar(calendarOptions(rand, run) as CalendarOptions));
    if (!calendar) continue;
    const day = DAYS[Math.floor(rand() * (DAYS.length - 60)) + 30]!;
    try {
      const next = calendar.nextBusinessDay(day);
      const previous = calendar.previousBusinessDay(day);
      count("整合 2");
      assert.ok(
        calendar.isBusinessDay(next) && calendar.isBusinessDay(previous),
        `run=${run} ${day}`,
      );
      for (const d of calendar.daysBetween(day, next).slice(1, -1))
        assert.equal(d.open, false, `run=${run} ${day} → ${next}: ${d.date}`);
      for (const d of calendar.daysBetween(previous, day).slice(1, -1))
        assert.equal(d.open, false, `run=${run} ${previous} → ${day}: ${d.date}`);
      assert.ok(next > day && previous < day, `run=${run} ${day}: ${previous} ${next}`);
      // The next business day is the first of the list of business days from the next day on. The previous one
      // is a business day on or before the day before (up to 0.30.8 a property of test/properties.test.ts
      // checked the same identity, that there is no business day between a day and its nextBusinessDay)
      assert.deepEqual(
        calendar.businessDatesBetween(addDays(day, 1), next),
        [next],
        `run=${run} ${day} → ${next}`,
      );
      assert.equal(
        calendar.previousBusinessDay(next),
        calendar.businessDayOnOrBefore(addDays(next, -1)),
        `run=${run} ${next}`,
      );
    } catch (e) {
      if (!noBusinessDay(e)) throw e;
    }
  }
  report("整合 2");
});

test("整合 3: 起点が営業日なら、営業日の加算と差は互いに逆になる", () => {
  const rand = random(20261107);
  for (let run = 0; run < RUNS.search; run++) {
    const calendar: Calendar | undefined = tryCreate(() =>
      createCalendar(calendarOptions(rand, run) as CalendarOptions),
    );
    if (!calendar) continue;
    try {
      const start = calendar.businessDayOnOrAfter(DAYS[Math.floor(rand() * 400) + 30]!);
      const n = 1 + Math.floor(rand() * 20);
      const end = calendar.addBusinessDays(start, n);
      count("整合 3");
      assert.equal(calendar.diffBusinessDays(start, end), n, `run=${run} ${start} +${n} = ${end}`);
      assert.equal(calendar.addBusinessDays(end, -n), start, `run=${run} ${end} -${n}`);
      // The result of adding is a business day and the reverse difference is −n (up to 0.30.8 a property of
      // test/properties.test.ts and T3 of test/naming.test.ts checked the same identity). The property of
      // test/properties.test.ts about moving and counting business days with recurring rules stays, because it
      // checks the same formula with the generator of the Japanese provider and moving rules
      // (propertyMoveOptions), a combination the short provider's generator here lacks
      assert.ok(calendar.isBusinessDay(end), `run=${run} ${end}`);
      assert.equal(calendar.diffBusinessDays(end, start), -n, `run=${run} ${end} -> ${start}`);
      // Adding 0 days from a business day gives that day (up to 0.30.8, T3 of test/naming.test.ts checked it
      // including n = 0)
      assert.equal(calendar.addBusinessDays(start, 0), start, `run=${run} ${start} +0`);
    } catch (e) {
      if (!noBusinessDay(e)) throw e;
    }
  }
  report("整合 3");
});

test("整合 4: businessDayOfMonth の規則が決めた日は、基準のカレンダー（繰り返しの規則を除いた設定）の第 n 営業日", () => {
  const rand = random(20261108);
  const trials: { run: number; base: Obj; n: number }[] = [];
  for (let run = 0; run < RUNS.counting; run++) {
    const base = calendarOptions(rand, run);
    delete base["closedRecurringRules"];
    delete base["openRecurringRules"];
    trials.push({ run, base, n: [1, 2, 3, -1, -2][Math.floor(rand() * 5)]! });
  }
  // Options with a month that has fewer than n business days (February 2025 has none; the catalog options never
  // do this, so it is tried with fixed options)
  const sparse: Obj = {
    closedWeekdays: [0, 1, 2, 3, 4, 5],
    closedDates: [{ from: "2025-02-01", to: "2025-02-28" }],
  };
  for (const n of [1, -1]) trials.push({ run: -1, base: sparse, n });
  let missing = 0;
  for (const { run, base, n } of trials) {
    // Applied on a holiday too ("over-holiday"), so the day the rule decides is the nth business day itself
    const rule = { businessDayOfMonth: n, name: "counted", holidayOverlapPolicy: "over-holiday" };
    const calendar = tryCreate(() =>
      createCalendar({ ...base, closedRecurringRules: [rule] } as CalendarOptions),
    );
    const basis = tryCreate(() => createCalendar(base as CalendarOptions));
    if (!calendar || !basis) continue;
    count("整合 4");
    for (let m = 0; m < 36; m++) {
      const month = `${2025 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
      let expected: string | undefined;
      try {
        expected = basis.nthBusinessDayOfMonth(month as `${number}-${number}`, n);
      } catch (e) {
        // The month has no nth business day (options with few business days)
        if (!isBizdaysError(e) || e.code !== "no-business-day") throw e;
        missing++;
      }
      const marked: string[] = DAYS.filter(
        (d) => d.startsWith(month) && calendar.dayInfoOn(d).name === "counted",
      );
      // Specific dates and annual dates decide before recurring rules, so the rule does not match a day they
      // decide
      const byDate = (d: string): boolean =>
        ["open-date", "closed-date", "open-annual", "closed-annual"].includes(
          calendar.dayInfoOn(d).reason,
        );
      assert.deepEqual(
        marked,
        expected === undefined || byDate(expected) ? [] : [expected],
        `run=${run} n=${n} ${month} ${JSON.stringify(base, (k, v) => (k === "holidayProvider" ? "XX" : v))}`,
      );
    }
  }
  report("整合 4");
  assert.ok(missing > 0, "整合 4: n 番目の営業日がない月を 1 度も試していない");
});

/** The error code of creation (undefined on success) */
function creationError(make: () => unknown): string | undefined {
  try {
    make();
    return undefined;
  } catch (e) {
    return isBizdaysError(e) ? e.code : `not a bizdays error: ${String(e)}`;
  }
}

test("整合 5: 診断に error がないことと作成が成功することは同じで、作成のエラーコードは診断の error のコードにある", () => {
  // A context that mixes in wrong inputs (an anchor on another weekday, skipped weekdays including the rule's
  // own, an nth-business-day rule without a basis calendar)
  const invalid: Context = { ...SHORT_CTX, invalid: true };
  /** Compares the errors of the diagnostics with the result of creation and returns the error code of creation */
  const check = (
    kind: "calendar" | "schedule",
    options: Obj,
    label: string,
  ): string | undefined => {
    const issues = kind === "calendar" ? diagnoseCalendar(options) : diagnoseSchedule(options);
    const errors = issues.filter((d) => d.severity === "error").map((d) => d.code);
    const code = creationError(() =>
      kind === "calendar"
        ? createCalendar(options as CalendarOptions)
        : createSchedule(options as unknown as ScheduleOptions<unknown>),
    );
    const context = `${label} ${kind} 診断の error: ${JSON.stringify(errors)} 作成: ${code ?? "成功"}`;
    assert.equal(errors.length === 0, code === undefined, context);
    if (code !== undefined) assert.ok(errors.includes(code), context);
    return code;
  };

  // Options of the catalog (half of the trials in the context that mixes in wrong inputs)
  const rand = random(20261109);
  for (let run = 0; run < RUNS.diagnose; run++) {
    for (const kind of ["calendar", "schedule"] as const) {
      const ctx = run % 2 === 0 ? invalid : undefined;
      const options =
        kind === "calendar" ? calendarOptions(rand, run, ctx) : scheduleOptions(rand, run, ctx);
      const code = check(kind, options, `run=${run}`);
      count(`整合 5（${code === undefined ? "作成できた" : "作成できない"}）`);
    }
  }

  // Options with a rule the catalog made wrong on purpose (built with another seed than the trials above, to
  // make sure the side that cannot be created is tried).
  // Rebuilt until they contain a wrong rule (a wrong rule gets into calendar options about 3% of the time, so
  // the limit is 400 tries)
  const randInvalid = random(20261114);
  let missed = 0;
  for (let run = 0; run < RUNS.diagnose; run++) {
    for (const kind of ["calendar", "schedule"] as const) {
      const make = (): Obj =>
        kind === "calendar"
          ? calendarOptions(randInvalid, run, invalid)
          : scheduleOptions(randInvalid, run, invalid);
      let options = make();
      for (let i = 0; i < 400 && !hasIntendedInvalid(options); i++) options = make();
      if (!hasIntendedInvalid(options)) {
        missed++;
        continue;
      }
      const code = check(kind, options, `intended run=${run}`);
      count("整合 5（意図した入力の誤り）");
      assert.notEqual(
        code,
        undefined,
        `intended run=${run} ${kind}: 意図した入力の誤りなのに作成できた`,
      );
    }
  }
  report("整合 5（作成できた）");
  report("整合 5（作成できない）");
  report("整合 5（意図した入力の誤り）");
  assert.equal(missed, 0, "意図した入力の誤りの規則を含む設定を作れなかった試行がある");
});

/** Whether the options contain a rule the catalog made wrong on purpose (the mark of test/support/catalog.ts) */
const hasIntendedInvalid = (options: Obj): boolean =>
  ["closedRecurringRules", "openRecurringRules", "recurringRules"].some(
    (k) => Array.isArray(options[k]) && (options[k] as unknown[]).some(isIntendedInvalid),
  );

test("整合 6: 旧名で書いた設定を移行すると元の新しい名前の設定に戻り、移行を 2 回かけても変わらない", () => {
  // When the migrated options equal the original ones, "the migrated options have no deprecated-option left"
  // (options written with new names only) and "the results are the same before and after migration" (old-name
  // and new-name options give the same results) reduce to the relation checked by transformation 1 of
  // metamorphic.
  // Equality is stronger than comparing results (it finds a migration that produces options written another
  // way even when the results are the same). The results and diagnostics of old-name options are checked by
  // transformation 1 for the same rule shapes of the catalog (with a generator that includes the Japanese
  // provider). The rewrite to old names uses the same helper as transformation 1 (test/support/old-names.ts)
  const rand = random(20261110);
  for (let run = 0; run < RUNS.migrate; run++) {
    for (const kind of ["calendar", "schedule"] as const) {
      const base = kind === "calendar" ? calendarOptions(rand, run) : scheduleOptions(rand, run);
      for (const v of VARIANTS) {
        const options = withPolicy(base, v.policy);
        const old = toOld(options, kind).options;
        const migrate = (o: object) =>
          kind === "calendar" ? migrateCalendarOptions(o) : migrateScheduleOptions(o);
        const once = migrate(old);
        const twice = migrate(once.options);
        const context = `run=${run} ${kind} ${v.label}`;
        assert.deepEqual(
          once.options,
          options,
          `${context}: 移行が旧名への書き換えの逆になっていない`,
        );
        assert.deepEqual(twice.options, once.options, `${context}: 2 回目で変わった`);
        assert.deepEqual(twice.changes, [], `${context}: 2 回目に書き換えがある`);
        count(`整合 6（${kind === "calendar" ? "カレンダー" : "スケジュール"}・${v.label}）`);
      }
    }
  }
  for (const v of VARIANTS) {
    report(`整合 6（カレンダー・${v.label}）`);
    report(`整合 6（スケジュール・${v.label}）`);
  }
});

test("整合 7: スケジュールの第 n 営業日の規則の基準のカレンダーの対応年が、診断の走査の範囲より狭くても、診断は誤った error を出さない", () => {
  const weekdayValues = ["closed", "open", "open", "open", "open", "open", "closed"];
  const short = { holidayProvider: SHORT_PROVIDER, timeZone: "UTC" };
  const rule = (calendar: Calendar) => [{ businessDayOfMonth: 3, value: "x", calendar }];
  const cases: readonly [string, Obj][] = [
    [
      "A: 自作の提供元のスケジュール + 自作の提供元の基準のカレンダー",
      { ...short, weekdayValues, recurringRules: rule(createCalendar(short)) },
    ],
    [
      "B: 自作の提供元のスケジュール + 提供元なしの基準のカレンダー",
      { ...short, weekdayValues, recurringRules: rule(createCalendar({})) },
    ],
    [
      "C: 提供元なしのスケジュール + 自作の提供元の基準のカレンダー",
      { weekdayValues, recurringRules: rule(createCalendar(short)) },
    ],
    [
      "D: 日本のスケジュール + 日本の基準のカレンダー",
      {
        holidayProvider: jp,
        weekdayValues,
        recurringRules: rule(createCalendar({ holidayProvider: jp })),
      },
    ],
    [
      'E: A の基準のカレンダーを outOfRangePolicy: "ignore" にしたもの',
      {
        ...short,
        weekdayValues,
        recurringRules: rule(createCalendar({ ...short, outOfRangePolicy: "ignore" })),
      },
    ],
  ];
  for (const [name, options] of cases) {
    assert.deepEqual(
      diagnoseSchedule(options).filter((d) => d.severity === "error"),
      [],
      `${name}: 診断の error`,
    );
    const schedule = createSchedule(options as unknown as ScheduleOptions<unknown>);
    assert.equal(schedule.daysBetween(SHORT_RANGE.from, SHORT_RANGE.to).length, DAYS.length, name);
  }
  // The judgement of C throws in a month outside the supported years of the basis calendar, because the basis
  // calendar throws (the guide's section on the outside of the supported years)
  const c = createSchedule(cases[2]![1] as unknown as ScheduleOptions<unknown>);
  assert.throws(
    () => c.valueOn("2024-06-05"),
    (e: unknown) => isBizdaysError(e) && e.code === "out-of-range",
  );
});

/**
 * Basis calendars with other supported years and policies (three combined bases, a basis that throws for
 * unconfirmed holidays, a basis made from a schedule)
 */
function specialBases(): readonly [string, Calendar][] {
  const tz = { timeZone: "Asia/Tokyo" };
  const jpOf = (o: Obj = {}) =>
    createCalendar({ holidayProvider: jp, ...tz, ...o } as CalendarOptions);
  const sgOf = (o: Obj = {}) =>
    createCalendar({ holidayProvider: sg, ...tz, ...o } as CalendarOptions);
  const fromSchedule = createCalendarFromSchedule(
    createSchedule({
      holidayProvider: jp,
      ...tz,
      weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
      holidayPolicy: { value: "closed" },
    }),
    (v) => v === "open",
  );
  return [
    [
      '合成（日本 "throw"・シンガポール "ignore"）',
      combineCalendars([jpOf(), sgOf({ outOfRangePolicy: "ignore" })], { open: "all" }),
    ],
    [
      '合成（日本 "throw"・シンガポール "throw"）',
      combineCalendars([jpOf(), sgOf()], { open: "all" }),
    ],
    [
      '合成（日本 "ignore"・シンガポール "ignore"）',
      combineCalendars(
        [jpOf({ outOfRangePolicy: "ignore" }), sgOf({ outOfRangePolicy: "ignore" })],
        { open: "any" },
      ),
    ],
    ['日本（unconfirmedHolidayPolicy: "throw"）', jpOf({ unconfirmedHolidayPolicy: "throw" })],
    ["スケジュールから作ったカレンダー（日本）", fromSchedule],
  ];
}

const WEEKDAY_VALUES = ["closed", "open", "open", "open", "open", "open", "closed"];

test("整合 8: 基準のカレンダーが投げる月がある設定（合成した基準・未確定の祝日で投げる基準・スケジュールから作った基準）でも、診断は何も出さない（誤った error・never-matches を含む）", () => {
  // The effective period has three variants: none, from a year the basis can judge, and from a year in which
  // part of the basis throws (outside Singapore's supported years)
  // (0.30.6 reported never-matches for a rule matching from 2030 with a basis combining Japan "throw" and
  // Singapore "ignore")
  for (const [name, calendar] of specialBases())
    for (const effectiveFrom of [undefined, "2026-01-01", "2030-01-01"]) {
      const options = {
        holidayProvider: jp,
        timeZone: "Asia/Tokyo",
        weekdayValues: WEEKDAY_VALUES,
        recurringRules: [{ businessDayOfMonth: 1, value: "x", calendar, effectiveFrom }],
      };
      const label = `${name}・effectiveFrom ${effectiveFrom ?? "なし"}`;
      count("整合 8（基準のカレンダーが投げる月がある設定）");
      assert.deepEqual(
        diagnoseSchedule(options).map((d) => [d.severity, d.code, d.path]),
        [],
        `${label}: 診断`,
      );
      const schedule = createSchedule(options as unknown as ScheduleOptions<unknown>);
      assert.equal(schedule.daysBetween("2025-01-01", "2025-12-31").length, 365, label);
    }
  report("整合 8（基準のカレンダーが投げる月がある設定）");
});

// Consistency 10 uses the same bases as consistency 8, removes and compares all days, and is heavy, so it runs
// only in the full set (CONSISTENCY_API_FULL=1; CI).
// Consistency 9 (the reproduction of a case) was absorbed in 0.30.9 into the effective-period variants of
// consistency 8 (the numbers are not reassigned)

test(
  "整合 10: 基準のカレンダーを持つスケジュールで、診断が never-matches と出した規則は 1 つずつ、出た規則（redundant・shadowed を含む）はまとめて取り除いても、判定できる日の結果が変わらない",
  { skip: skipWhen("ci-full-only", !FULL) },
  () => {
    const rand = random(20261111);
    const days = daysOf("2018-01-01", "2032-12-31");
    const outcome = (schedule: { valueOn(d: string): unknown }, day: string): string => {
      try {
        return JSON.stringify(schedule.valueOn(day));
      } catch (e) {
        return isBizdaysError(e) && ["out-of-range", "unconfirmed-holiday"].includes(e.code)
          ? "unjudgeable"
          : `throw ${String(e)}`;
      }
    };
    const bases = specialBases();
    for (let run = 0; run < RUNS.basis; run++) {
      const [, calendar] = bases[run % bases.length]!;
      const generated = randomScheduleOptions(picker(rand), SHORT_CTX);
      // A rule that never matches (a February rule whose effective period has no February) and a rule with the
      // same value as the weekly values (closing Sundays) are mixed in, so that never-matches and redundant
      // always appear
      const rules = [
        ...((generated["recurringRules"] as Obj[] | undefined) ?? []).map((r) =>
          "calendar" in r ? { ...r, calendar } : r,
        ),
        {
          businessDayOfMonth: 1,
          months: [2],
          value: "y",
          calendar,
          effectiveFrom: "2026-03-01",
          effectiveTo: "2026-12-31",
        },
        { weekday: 0, value: "closed" },
      ];
      const options: Obj = {
        ...generated,
        holidayProvider: jp,
        timeZone: "Asia/Tokyo",
        recurringRules: rules,
      };
      const issues = diagnoseSchedule(options);
      // Relation 5: no error in the diagnostics is the same as successful creation
      const errors = issues.filter((d) => d.severity === "error").map((d) => d.code);
      const code = creationError(() =>
        createSchedule(options as unknown as ScheduleOptions<unknown>),
      );
      count("整合 10（基準のカレンダーを持つスケジュールの作成と診断）");
      assert.equal(
        errors.length === 0,
        code === undefined,
        `run=${run} 診断の error: ${JSON.stringify(errors)} 作成: ${code ?? "成功"}`,
      );
      if (code !== undefined) continue;
      const schedule = createSchedule(options as unknown as ScheduleOptions<unknown>);
      const sameOnJudgeableDays = (removed: ReadonlySet<number>, label: string): void => {
        const reduced = createSchedule({
          ...options,
          recurringRules: rules.filter((_, i) => !removed.has(i)),
        } as unknown as ScheduleOptions<unknown>);
        for (const day of days) {
          const a = outcome(schedule, day);
          if (a === "unjudgeable") continue;
          assert.equal(outcome(reduced, day), a, `run=${run} ${label} ${day}`);
        }
      };
      const removable = new Set<number>();
      for (const d of issues) {
        const m = ["never-matches", "redundant", "shadowed"].includes(d.code)
          ? /^recurringRules\[(\d+)\]$/.exec(d.path)
          : null;
        if (!m) continue;
        removable.add(Number(m[1]));
        if (d.code === "shadowed") continue;
        count(`整合 10（${d.code} と判定できる日）`);
        // never-matches does not change anything when removed alone (it never matches). For redundant only the
        // removal together is promised (sequential removal. decisions.md #31), which is checked below
        if (d.code === "never-matches") sameOnJudgeableDays(new Set([Number(m[1])]), d.path);
      }
      // Removing the reported rules together does not change the result of a day that can be judged (sequential
      // removal; rules touching an unjudgeable month are not reported)
      if (removable.size > 0) {
        count("整合 10（まとめて取り除く）");
        sameOnJudgeableDays(removable, `まとめて ${JSON.stringify([...removable])}`);
      }
    }
    report("整合 10（基準のカレンダーを持つスケジュールの作成と診断）");
    report("整合 10（never-matches と判定できる日）", "診断の項目");
    report("整合 10（redundant と判定できる日）", "診断の項目");
    report("整合 10（まとめて取り除く）");
  },
);

test("整合 11: 日本の提供元のスケジュールで、週の第 n 営業日の規則とその写しには shadowed が出る（範囲の端の判定できない月があっても、規則の形で決まる shadowed は出す）", () => {
  const tz = { timeZone: "Asia/Tokyo" };
  const calendar = createCalendar({ holidayProvider: jp, ...tz });
  const rule = {
    businessDayOfWeek: [3],
    weekStart: 0,
    months: [5, 10, 1, 3, 6],
    value: "closed",
    calendar,
  };
  const issues = diagnoseSchedule({
    holidayProvider: jp,
    ...tz,
    weekdayValues: WEEKDAY_VALUES,
    recurringRules: [rule, { businessDayOfMonth: 2, value: "A", calendar }, { ...rule }],
  });
  assert.ok(
    issues.some(
      (d) =>
        d.code === "shadowed" &&
        d.path === "recurringRules[2]" &&
        d.relatedPath === "recurringRules[0]",
    ),
    JSON.stringify(issues.map((d) => [d.code, d.path, d.relatedPath])),
  );
});
