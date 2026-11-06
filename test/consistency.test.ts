// API どうしの整合（テスト拡充案の T5）。目録の生成器（test/support/catalog.ts）の設定で、同じことを別の API で問うたときの
// 答えが一致することを確かめる。設定は、カレンダー・スケジュール、対応年の短い自作の提供元（2025〜2027 年）・提供元なしを含む。
// pnpm check は決まった抜き出しだけ。全件は CONSISTENCY_API_FULL=1 で、CI の diagnose-consistency ジョブで動かす。
// 関係ごとに試した設定の数を出し、0 件なら失敗にする。
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
import { RENAMED_KEYS } from "../src/core/renamed.ts";
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
import { flagEnv } from "./support/env.ts";
import { skipWhen } from "./support/skip.ts";
import { jp } from "../src/jp/index.ts";
import { sg } from "../src/sg/index.ts";
import { daysOf } from "./support/compare.ts";
import { SHORT_PROVIDER } from "./support/provider.ts";
import { SHORT_RANGE } from "./support/sites.ts";

const FULL = flagEnv("CONSISTENCY_API_FULL");
/** 関係ごとの設定の数（抜き出し・全件） */
const RUNS = FULL
  ? { days: 120, search: 120, counting: 120, diagnose: 150, migrate: 80, basis: 40 }
  : { days: 12, search: 12, counting: 12, diagnose: 12, migrate: 6, basis: 5 };

/** 自作の提供元の対応年の全日（outOfRangePolicy: "ignore" で試す） */
const DAYS = daysOf(SHORT_RANGE.from, SHORT_RANGE.to);
/** 隣の年を引かない内側の範囲（既定の "throw" で試す。祝日の翌日・前日の規則が隣の年を見ない） */
const INNER = { from: "2025-02-01", to: "2027-11-30" } as const;
/** 試す 2 通り: 既定の "throw" は内側の範囲、"ignore" は対応年の全範囲 */
const VARIANTS = [
  { policy: undefined, range: INNER, days: daysOf(INNER.from, INNER.to), label: "throw・内側" },
  { policy: "ignore", range: SHORT_RANGE, days: DAYS, label: "ignore・全範囲" },
] as const;
/**
 * outOfRangePolicy を付ける。スケジュールの第 n 営業日の規則の基準のカレンダーも、同じ提供元・同じ outOfRangePolicy で作り直す
 * （基準のカレンダーが既定の "throw" のままだと、範囲の端の週・月の数え方で隣の年を引いて投げるため）
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

/** 自作の提供元の文脈（祝日に従属する形を作る）と、提供元なしの文脈 */
const SHORT_CTX: Context = CONTEXTS["diagnose-properties"];
const NONE_CTX: Context = withoutHolidays(SHORT_CTX);
const source = (withHolidays: boolean): Obj =>
  withHolidays ? { holidayProvider: SHORT_PROVIDER, timeZone: "UTC" } : {};

/** 目録のカレンダーの設定（3 件に 2 件は自作の提供元、残りは提供元なし） */
function calendarOptions(rand: () => number, run: number, ctx?: Context): Obj {
  const withHolidays = run % 3 !== 2;
  return {
    ...source(withHolidays),
    ...randomCalendarOptions(picker(rand), ctx ?? (withHolidays ? SHORT_CTX : NONE_CTX)),
  };
}

/** 目録のスケジュールの設定（数える基準のカレンダーの印は、同じ提供元の土日休みのカレンダーにする） */
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

/** 作成（設定の誤りで作成できなければ undefined。bizdays のエラーコードを持たない例外は投げ直す） */
function tryCreate<T>(make: () => T): T | undefined {
  try {
    return make();
  } catch (e) {
    if (!isBizdaysError(e)) throw e;
    return undefined;
  }
}

/** 営業日が見つからない設定の探索の失敗（関係の前提を満たさないので飛ばす）か */
const noBusinessDay = (e: unknown): boolean => isBizdaysError(e) && e.code === "no-business-day";

/** 試した設定の数（関係 → 件数） */
const tried: Record<string, number> = {};
const count = (relation: string): void => {
  tried[relation] = (tried[relation] ?? 0) + 1;
};
/** 件数の行を出し、0 件なら失敗にする（unit は数えたもの） */
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
      // 次の営業日は、翌日からの営業日の一覧の最初の 1 つ。前の営業日は、前日以前の営業日（0.30.8 までは
      // test/properties.test.ts の性質「nextBusinessDay との間に営業日はなく…」が同じ恒等式を確かめていた）
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
      // 加算の結果は営業日で、逆向きの差は −n（0.30.8 までは test/properties.test.ts の性質「addBusinessDays の結果は
      // 営業日で、n 進めて −n 戻ると…」と test/naming.test.ts の T3 が同じ恒等式を確かめていた）
      assert.ok(calendar.isBusinessDay(end), `run=${run} ${end}`);
      assert.equal(calendar.diffBusinessDays(end, start), -n, `run=${run} ${end} -> ${start}`);
      // 営業日を起点にした 0 日の加算はその日（0.30.8 までは test/naming.test.ts の T3 が n = 0 を含めて確かめていた）
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
  // 営業日が n 日に満たない月がある設定（2025 年 2 月は営業日がない。目録の設定では起きないので固定で試す）
  const sparse: Obj = {
    closedWeekdays: [0, 1, 2, 3, 4, 5],
    closedDates: [{ from: "2025-02-01", to: "2025-02-28" }],
  };
  for (const n of [1, -1]) trials.push({ run: -1, base: sparse, n });
  let missing = 0;
  for (const { run, base, n } of trials) {
    // 祝日の上でも当てはめる（"over-holiday"）ので、規則が決めた日は第 n 営業日そのもの
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
        // その月に n 番目の営業日がない（営業日が少ない設定）
        if (!isBizdaysError(e) || e.code !== "no-business-day") throw e;
        missing++;
      }
      const marked: string[] = DAYS.filter(
        (d) => d.startsWith(month) && calendar.dayInfoOn(d).name === "counted",
      );
      // 個別の日付・毎年の月日は繰り返しの規則より先に決まるので、それで決まった日には規則が当てはまらない
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

/** 作成のエラーコード（成功なら undefined） */
function creationError(make: () => unknown): string | undefined {
  try {
    make();
    return undefined;
  } catch (e) {
    return isBizdaysError(e) ? e.code : `not a bizdays error: ${String(e)}`;
  }
}

test("整合 5: 診断に error がないことと作成が成功することは同じで、作成のエラーコードは診断の error のコードにある", () => {
  // 入力の誤り（曜日に合わない起点・自分の曜日を含む飛ばす曜日・基準のカレンダーのない第 n 営業日の規則）を混ぜる文脈
  const invalid: Context = { ...SHORT_CTX, invalid: true };
  /** 診断の error と作成の結果を比べ、作成のエラーコードを返す */
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

  // 目録の設定（試行の半分は入力の誤りを混ぜる文脈で作る）
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

  // 目録が意図して入力の誤りにした規則を含む設定（上の試行とは別の種で作る。作成できない側を確かに試すため）。
  // 誤りの規則を含むまで作り直す（カレンダーの設定に誤りが入るのは 3% ほどなので、上限は 400 回）
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

/** 目録が意図して入力の誤りにした規則（test/support/catalog.ts の印）を含む設定か */
const hasIntendedInvalid = (options: Obj): boolean =>
  ["closedRecurringRules", "openRecurringRules", "recurringRules"].some(
    (k) => Array.isArray(options[k]) && (options[k] as unknown[]).some(isIntendedInvalid),
  );

/** 新しい名前の設定を、0.30.0 の改名の前の名前で書く（キーの改名と、スケジュールの holidayPolicy の値 "ignore" → "weekday"） */
function toOld(options: Obj, kind: "calendar" | "schedule"): Obj {
  const rename = (o: Obj, places: readonly string[]): Obj => {
    const out: Obj = {};
    for (const [k, v] of Object.entries(o)) {
      const r = RENAMED_KEYS.find((x) => places.includes(x.place) && x.to === k);
      out[r ? r.from : k] = v;
    }
    return out;
  };
  const out = rename(options, ["source", kind]);
  for (const key of ["closedRecurring", "openRecurring", "recurring"])
    if (Array.isArray(out[key])) out[key] = (out[key] as Obj[]).map((r) => rename(r, ["rule"]));
  if (kind === "schedule" && out["holiday"] === "ignore") out["holiday"] = "weekday";
  return out;
}

test("整合 6: 移行した設定の診断に deprecated-option が残らず、移行を 2 回かけても変わらず、移行の前後で結果が同じ", () => {
  const rand = random(20261110);
  for (let run = 0; run < RUNS.migrate; run++) {
    for (const kind of ["calendar", "schedule"] as const) {
      const base = kind === "calendar" ? calendarOptions(rand, run) : scheduleOptions(rand, run);
      for (const v of VARIANTS) {
        const options = withPolicy(base, v.policy);
        const old = toOld(options, kind);
        const migrate = (o: object) =>
          kind === "calendar" ? migrateCalendarOptions(o) : migrateScheduleOptions(o);
        const once = migrate(old);
        const twice = migrate(once.options);
        const context = `run=${run} ${kind} ${v.label}`;
        assert.deepEqual(twice.options, once.options, `${context}: 2 回目で変わった`);
        assert.deepEqual(twice.changes, [], `${context}: 2 回目に書き換えがある`);
        // 自作の提供元の種別は "regular"・"substitute" なので、和集合の "national" の例外は出ない
        const issues =
          kind === "calendar" ? diagnoseCalendar(once.options) : diagnoseSchedule(once.options);
        assert.deepEqual(
          issues.filter((d) => d.code === "deprecated-option").map((d) => d.path),
          [],
          `${context}: 移行した設定に deprecated-option が残る`,
        );
        const make = (o: object) =>
          tryCreate(() =>
            kind === "calendar"
              ? createCalendar(o as CalendarOptions)
              : createSchedule(o as unknown as ScheduleOptions<unknown>),
          );
        const before = make(old);
        const after = make(once.options);
        assert.equal(
          before === undefined,
          after === undefined,
          `${context}: 作成の成否が移行の前後で違う`,
        );
        if (!before || !after) continue;
        count(`整合 6（${kind === "calendar" ? "カレンダー" : "スケジュール"}・${v.label}）`);
        const values = (x: unknown) =>
          JSON.stringify(
            (x as { daysBetween(a: string, b: string): { open?: boolean; value?: unknown }[] })
              .daysBetween(v.range.from, v.range.to)
              .map((d) => (kind === "calendar" ? d.open : d.value)),
          );
        assert.equal(values(after), values(before), `${context}: 移行の前後で結果が違う`);
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
  // C の判定は、基準のカレンダーの対応年の外の月では、基準のカレンダーが投げるので投げる（ガイドの「対応年の外」）
  const c = createSchedule(cases[2]![1] as unknown as ScheduleOptions<unknown>);
  assert.throws(
    () => c.valueOn("2024-06-05"),
    (e: unknown) => isBizdaysError(e) && e.code === "out-of-range",
  );
});

/** 対応年・方針の違う基準のカレンダー（合成した基準の 3 通り・未確定の祝日で投げる基準・スケジュールから作った基準） */
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
  // 有効期間は、なし・基準が判定できる年から・基準の一部が投げる年（シンガポールの対応年の外）からの 3 通り
  // （0.30.6 で、日本 "throw" とシンガポール "ignore" を合成した基準で 2030 年から当てはまる規則に never-matches を出していた）
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

// 整合 10 は整合 8 と同じ基準で、取り除いて全日を比べるので重く、全件（CONSISTENCY_API_FULL=1。CI）のときだけ動かす。
// 整合 9（事例の再現）は 0.30.9 で整合 8 の有効期間の組に吸収した（番号は振り直さない）

test(
  "整合 10: 基準のカレンダーを持つスケジュールで、診断が never-matches・redundant と出した規則は、取り除いても判定できる日の結果が変わらない",
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
      // 当てはまらない規則（有効期間に 2 月がない 2 月の規則）と、週の決まりと同じ値の規則（日曜を休みにする）を混ぜて、
      // never-matches・redundant が必ず出るようにする
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
      // 関係 5: 診断に error がないことと作成が成功することは同じ
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
      for (const d of issues) {
        const m =
          d.code === "never-matches" || d.code === "redundant"
            ? /^recurringRules\[(\d+)\]$/.exec(d.path)
            : null;
        if (!m) continue;
        count(`整合 10（${d.code} と判定できる日）`);
        const reduced = createSchedule({
          ...options,
          recurringRules: rules.filter((_, i) => i !== Number(m[1])),
        } as unknown as ScheduleOptions<unknown>);
        for (const day of days) {
          const a = outcome(schedule, day);
          if (a === "unjudgeable") continue;
          assert.equal(outcome(reduced, day), a, `run=${run} ${d.path} ${day}`);
        }
      }
    }
    report("整合 10（基準のカレンダーを持つスケジュールの作成と診断）");
    report("整合 10（never-matches と判定できる日）", "診断の項目");
    report("整合 10（redundant と判定できる日）", "診断の項目");
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
