// 失敗を注入した祝日の提供元で、判定・診断・合成の結果が文書（docs/guide.ja.md の「対応年の外」「未確定の祝日」「エラー」
// 「設定の診断」、docs/providers.ja.md の「提供元の約束と誤りの扱い」）のとおりになることを確かめる（テスト拡充案の T3）。
// 途中から例外を投げる提供元（同じ年に同じ結果を返す約束の外）は、ここでは確かめない（診断の catch 節の到達の検査で足す）。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
  type CalendarOptions,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import {
  DAY_BEFORE,
  DAY_IN_INJECTED_YEAR,
  HOLIDAY_AFTER,
  HOLIDAY_IN_INJECTED_YEAR,
  INJECTED_YEAR,
  invalidDataInYear,
  throwingInYear,
  unconfirmedInYear,
  type InvalidData,
} from "./support/faulty.ts";
import { random } from "./support/catalog.ts";
import { SHORT_PROVIDER } from "./support/provider.ts";
import { diagnoseOptions } from "./support/sites.ts";
import { flagEnv } from "./support/env.ts";

/** f が code の例外を投げる */
const throwsCode = (f: () => unknown, code: string, context: string): void => {
  assert.throws(
    f,
    (e: unknown) => isBizdaysError(e) && e.code === code,
    `${context}: ${code} を投げない`,
  );
};

const KINDS: readonly InvalidData[] = ["format", "duplicate", "type"];

for (const kind of KINDS) {
  test(`注入（不正なデータ: ${kind}）× 判定: 作成は通り、使った年の判定だけが invalid-provider-data になる`, () => {
    const provider = invalidDataInYear(INJECTED_YEAR, kind);
    // 作成時は使った年だけを調べる（設定の診断の表の invalid-provider-data）
    const calendar = createCalendar({ holidayProvider: provider, closedWeekdays: [0, 6] });
    assert.equal(calendar.isBusinessDay(DAY_BEFORE), true);
    throwsCode(
      () => calendar.isBusinessDay(DAY_IN_INJECTED_YEAR),
      "invalid-provider-data",
      "isBusinessDay",
    );
    throwsCode(
      () => calendar.dayInfoOn(HOLIDAY_IN_INJECTED_YEAR),
      "invalid-provider-data",
      "dayInfoOn",
    );
    // 探索が注入した年に入れば、その年を使う
    throwsCode(
      () => calendar.addBusinessDays("2025-12-30", 5),
      "invalid-provider-data",
      "addBusinessDays",
    );
  });

  test(`注入（不正なデータ: ${kind}）× 診断: 対応年のすべての年を調べて error の invalid-provider-data を返す`, () => {
    const provider = invalidDataInYear(INJECTED_YEAR, kind);
    for (const list of [
      diagnoseCalendar({
        holidayProvider: provider,
        closedRecurringRules: [{ dayAfterHoliday: true }],
      }),
      diagnoseSchedule({
        holidayProvider: provider,
        weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
        holidayPolicy: { value: "holiday" },
      }),
    ])
      assert.ok(
        list.some((d) => d.severity === "error" && d.code === "invalid-provider-data"),
        JSON.stringify(list),
      );
  });
}

test('注入（途中の年を未確定）× 判定: 既定では予測をそのまま使い、"throw" では未確定の祝日を引いた判定だけが unconfirmed-holiday', () => {
  const provider = unconfirmedInYear(INJECTED_YEAR);
  const accept = createCalendar({ holidayProvider: provider, closedWeekdays: [0, 6] });
  assert.equal(accept.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR), false);
  assert.equal(accept.dayInfoOn(HOLIDAY_IN_INJECTED_YEAR).reason, "holiday");

  const strict = createCalendar({
    holidayProvider: provider,
    closedWeekdays: [0, 6],
    unconfirmedHolidayPolicy: "throw",
  });
  throwsCode(
    () => strict.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR),
    "unconfirmed-holiday",
    "isBusinessDay",
  );
  // 探索が途中で通る日も「引いた判定」に入る
  throwsCode(
    () => strict.addBusinessDays("2026-05-01", 1),
    "unconfirmed-holiday",
    "addBusinessDays",
  );
  // 確定している年の祝日は投げない
  assert.equal(strict.isBusinessDay(HOLIDAY_AFTER), false);
  // 一覧は投げない（例外を受けたあとに影響する日を列挙する逃げ道）
  assert.ok(strict.holidaysInYear(INJECTED_YEAR).every((h) => h.confirmed === false));
  assert.ok(strict.holidaysBetween("2026-01-01", "2026-12-31").length > 0);
});

test('注入（途中の年を未確定）× 判定: "ignore" で祝日に依存しない設定は、判定・第 n 営業日の数え方・探索で投げず、dayInfoOn は投げる', () => {
  // 第 n 営業日の規則がある設定も入れる（数える基準の営業日も祝日に依存しない）
  for (const rules of [
    [],
    [{ businessDayOfMonth: 1 }],
    [{ businessDayOfWeek: -1, weekStart: 1 }],
  ]) {
    const options = {
      holidayProvider: unconfirmedInYear(INJECTED_YEAR),
      closedWeekdays: [0, 6],
      holidayPolicy: "ignore",
      closedRecurringRules: rules,
      unconfirmedHolidayPolicy: "throw",
    } as CalendarOptions;
    const strict = createCalendar(options);
    const plain = createCalendar({
      ...options,
      unconfirmedHolidayPolicy: "accept",
    } as CalendarOptions);
    const context = JSON.stringify(rules);
    // 結果は未確定の祝日を気にしない設定（accept）と同じで、投げない
    assert.equal(
      strict.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR),
      plain.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR),
      context,
    );
    assert.equal(
      strict.addBusinessDays("2026-05-01", 3),
      plain.addBusinessDays("2026-05-01", 3),
      context,
    );
    assert.equal(
      strict.nextBusinessDay("2026-05-02"),
      plain.nextBusinessDay("2026-05-02"),
      context,
    );
    assert.deepEqual(
      strict.businessDatesBetween("2026-05-01", "2026-05-31"),
      plain.businessDatesBetween("2026-05-01", "2026-05-31"),
      context,
    );
    // その日の情報は holiday を付けるので投げる
    throwsCode(
      () => strict.dayInfoOn(HOLIDAY_IN_INJECTED_YEAR),
      "unconfirmed-holiday",
      `dayInfoOn ${context}`,
    );
    throwsCode(
      () => strict.daysBetween("2026-05-01", "2026-05-31"),
      "unconfirmed-holiday",
      `daysBetween ${context}`,
    );
  }
  // スケジュールも同じ
  const schedule = createSchedule({
    holidayProvider: unconfirmedInYear(INJECTED_YEAR),
    weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
    holidayPolicy: "ignore",
    unconfirmedHolidayPolicy: "throw",
  });
  assert.equal(schedule.valueOn(HOLIDAY_IN_INJECTED_YEAR), "open");
  throwsCode(
    () => schedule.dayInfoOn(HOLIDAY_IN_INJECTED_YEAR),
    "unconfirmed-holiday",
    "schedule dayInfoOn",
  );
});

test('注入（途中の年を未確定）× 判定: "ignore" でも祝日の上で先に判定する規則（"over-holiday"）があれば、結果が祝日に依存するので投げる', () => {
  const strict = createCalendar({
    holidayProvider: unconfirmedInYear(INJECTED_YEAR),
    closedWeekdays: [0, 6],
    holidayPolicy: "ignore",
    closedRecurringRules: [{ weekday: 1, holidayOverlapPolicy: "over-holiday" }],
    openRecurringRules: [{ weekday: 1 }],
    unconfirmedHolidayPolicy: "throw",
  });
  // 2026-05-04 は月曜の祝日。祝日なら閉じる規則が先、祝日でなければ開く規則が先なので、祝日が結果を変える
  throwsCode(
    () => strict.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR),
    "unconfirmed-holiday",
    "over-holiday",
  );
});

test('注入（途中の年を未確定）× 判定（スケジュールから作ったカレンダー）: "ignore" で結果が祝日に依存しなければ投げず、dayInfoOn は投げる', () => {
  const schedule = createSchedule({
    holidayProvider: unconfirmedInYear(INJECTED_YEAR),
    weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
    holidayPolicy: "ignore",
    recurringRules: [{ businessDayOfMonth: 1, value: "closed", calendar: plainCalendar() }],
    unconfirmedHolidayPolicy: "throw",
  });
  const calendar = createCalendarFromSchedule(schedule, (v) => v === "open");
  assert.equal(calendar.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR), true);
  assert.equal(calendar.addBusinessDays("2026-05-01", 1), "2026-05-04");
  throwsCode(
    () => calendar.dayInfoOn(HOLIDAY_IN_INJECTED_YEAR),
    "unconfirmed-holiday",
    "fromSchedule dayInfoOn",
  );
  // "ignore" でない設定は、営業日の判定でも投げる
  const strict = createCalendarFromSchedule(
    createSchedule({
      holidayProvider: unconfirmedInYear(INJECTED_YEAR),
      weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
      holidayPolicy: { value: "closed" },
      unconfirmedHolidayPolicy: "throw",
    }),
    (v) => v === "open",
  );
  throwsCode(
    () => strict.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR),
    "unconfirmed-holiday",
    "fromSchedule（closed）",
  );
});

test("注入（途中の年を未確定）× 判定（スケジュール）: unconfirmedHolidayPolicy はスケジュールにも効く", () => {
  const schedule = createSchedule({
    holidayProvider: unconfirmedInYear(INJECTED_YEAR),
    weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
    holidayPolicy: { value: "holiday" },
    unconfirmedHolidayPolicy: "throw",
  });
  throwsCode(() => schedule.valueOn(HOLIDAY_IN_INJECTED_YEAR), "unconfirmed-holiday", "valueOn");
  assert.equal(schedule.valueOn(HOLIDAY_AFTER), "holiday");
});

const strictCalendar = () =>
  createCalendar({
    holidayProvider: unconfirmedInYear(INJECTED_YEAR),
    closedWeekdays: [0, 6],
    unconfirmedHolidayPolicy: "throw",
  });
const plainCalendar = (holidayPolicy: "closed" | "open" = "closed") =>
  createCalendar({ holidayProvider: SHORT_PROVIDER, closedWeekdays: [0, 6], holidayPolicy });

test("注入（途中の年を未確定）× 合成: 投げるカレンダーが先なら、合成したカレンダーも投げる", () => {
  for (const open of ["all", "any"] as const) {
    const combined = combineCalendars([strictCalendar(), plainCalendar()], { open });
    throwsCode(
      () => combined.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR),
      "unconfirmed-holiday",
      `合成（${open}）`,
    );
    throwsCode(
      () => combined.dayInfoOn(HOLIDAY_IN_INJECTED_YEAR),
      "unconfirmed-holiday",
      `合成（${open}）dayInfoOn`,
    );
    assert.equal(combined.isBusinessDay(DAY_BEFORE), true);
  }
});

// 既知の不具合（0.31.0 で直す。docs/guide.ja.md の「未確定の祝日」）: 先のカレンダーで結果が決まると、後のカレンダーを判定しない
test(
  '注入（途中の年を未確定）× 合成: "all" で先のカレンダーが休業日でも、後のカレンダーが投げるなら投げる',
  { todo: "既知の不具合（0.31.0 で直す）: 先のカレンダーが休業日なら後のカレンダーを判定しない" },
  () => {
    const combined = combineCalendars([plainCalendar(), strictCalendar()], { open: "all" });
    throwsCode(
      () => combined.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR),
      "unconfirmed-holiday",
      "合成（all）",
    );
  },
);
test(
  '注入（途中の年を未確定）× 合成: "any" で先のカレンダーが営業日でも、後のカレンダーが投げるなら投げる',
  { todo: "既知の不具合（0.31.0 で直す）: 先のカレンダーが営業日なら後のカレンダーを判定しない" },
  () => {
    const combined = combineCalendars([plainCalendar("open"), strictCalendar()], { open: "any" });
    throwsCode(
      () => combined.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR),
      "unconfirmed-holiday",
      "合成（any）",
    );
  },
);

test('注入（途中の年を未確定）× 診断: 未確定の祝日はそのまま使って調べ、"throw" でも報告しない', () => {
  for (const list of [
    diagnoseCalendar({
      holidayProvider: unconfirmedInYear(INJECTED_YEAR),
      unconfirmedHolidayPolicy: "throw",
      closedRecurringRules: [{ dayAfterHoliday: true }],
    }),
    diagnoseSchedule({
      holidayProvider: unconfirmedInYear(INJECTED_YEAR),
      weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
      holidayPolicy: { value: "holiday" },
      unconfirmedHolidayPolicy: "throw",
    }),
  ]) {
    assert.ok(!list.some((d) => d.severity === "error"), JSON.stringify(list));
    assert.ok(!list.some((d) => d.code === "unconfirmed-holiday"), JSON.stringify(list));
  }
});

for (const kind of KINDS)
  test(`注入（不正なデータ: ${kind}）× 合成: 投げるカレンダーが先なら、合成したカレンダーも invalid-provider-data を投げる`, () => {
    const bad = createCalendar({
      holidayProvider: invalidDataInYear(INJECTED_YEAR, kind),
      closedWeekdays: [0, 6],
    });
    for (const open of ["all", "any"] as const) {
      const combined = combineCalendars([bad, plainCalendar()], { open });
      throwsCode(
        () => combined.isBusinessDay(DAY_IN_INJECTED_YEAR),
        "invalid-provider-data",
        `合成（${open}）`,
      );
      assert.equal(combined.isBusinessDay(DAY_BEFORE), true);
    }
  });

/** 提供元が投げた例外をそのまま投げる（code を持たない注入の例外） */
const isInjected = (e: unknown): boolean =>
  e instanceof RangeError &&
  e.message === `injected failure for ${INJECTED_YEAR}` &&
  (e as { code?: unknown }).code === undefined;

test("注入（特定の年で例外を投げる）× 判定・合成: その年を使う判定は、提供元の例外を包まずにそのまま投げる", () => {
  const calendar = createCalendar({
    holidayProvider: throwingInYear(INJECTED_YEAR),
    closedWeekdays: [0, 6],
  });
  assert.equal(calendar.isBusinessDay(DAY_BEFORE), true);
  assert.throws(() => calendar.isBusinessDay(DAY_IN_INJECTED_YEAR), isInjected);
  assert.throws(() => calendar.addBusinessDays("2025-12-30", 5), isInjected);
  for (const open of ["all", "any"] as const)
    assert.throws(
      () =>
        combineCalendars([calendar, plainCalendar()], { open }).isBusinessDay(DAY_IN_INJECTED_YEAR),
      isInjected,
    );
});

test("注入（特定の年で例外を投げる）× 診断: どの設定でも error の invalid-provider-data を返し、例外を祝日なしとして受け止めたまま error のない結果を返さない", () => {
  // 例外を投げる年（対応年の最初・途中・最後）と、目録の設定（診断の性質のテストと同じ作り方）の組み合わせ
  let checked = 0;
  for (const year of [2025, 2026, 2027]) {
    const rand = random(20261103 + year);
    for (let run = 0; run < 40; run++) {
      const options = { ...diagnoseOptions(rand, "short"), holidayProvider: throwingInYear(year) };
      const list = diagnoseCalendar(options);
      assert.ok(
        list.some(
          (d) =>
            d.severity === "error" &&
            d.code === "invalid-provider-data" &&
            d.message.includes("injected failure"),
        ),
        `year=${year} run=${run}: ${JSON.stringify(list.map((d) => [d.severity, d.code]))}`,
      );
      checked++;
    }
  }
  assert.equal(checked, 120);
});

/** 診断と判定の一致のテストの設定の数（診断が時間を食うので pnpm check では少なくする） */
const CONSISTENCY_RUNS = 12;

test(
  '診断と判定の一致（オラクル）: 診断が unconfirmedHolidayPolicy を redundant と出した設定は、"throw" を "accept" に変えても全日の判定（例外の有無を含む）が変わらない',
  { skip: flagEnv("BIZDAYS_TZ_RUN") && "暦日だけで決まるので、TZ を変えた実行では飛ばす" },
  () => {
    // 目録の設定（祝日に従属する形のない文脈）を、祝日の扱い "ignore" と未確定の年を含む提供元で作る。"over-holiday"・
    // "after-holiday" の規則の有無で、redundant と出る設定と出ない設定の両方ができる
    const rand = random(20261104);
    const days: string[] = [];
    for (let t = Date.UTC(2025, 0, 1); t <= Date.UTC(2027, 11, 31); t += 86_400_000)
      days.push(new Date(t).toISOString().slice(0, 10));
    const outcome = (calendar: ReturnType<typeof createCalendar>, day: string): string => {
      try {
        return String(calendar.isBusinessDay(day));
      } catch (e) {
        return `throw:${isBizdaysError(e) ? e.code : String(e)}`;
      }
    };
    /** 群ごとの件数: 診断の結果（redundant と出たか）・作成に失敗したか・全日を比べたか・違いのあった設定 */
    const groups = {
      redundant: { configs: 0, failed: 0, compared: 0, differed: 0 },
      other: { configs: 0, failed: 0, compared: 0, differed: 0 },
    };
    for (let run = 0; run < CONSISTENCY_RUNS; run++) {
      const options = {
        ...diagnoseOptions(rand, "none"),
        holidayProvider: unconfirmedInYear(INJECTED_YEAR),
        holidayPolicy: "ignore",
        unconfirmedHolidayPolicy: "throw",
      } as CalendarOptions;
      const flagged = diagnoseCalendar(options).some(
        (d) => d.code === "redundant" && d.path === "unconfirmedHolidayPolicy",
      );
      const group = flagged ? groups.redundant : groups.other;
      group.configs++;
      let strict: ReturnType<typeof createCalendar>;
      let plain: ReturnType<typeof createCalendar>;
      try {
        strict = createCalendar(options);
        plain = createCalendar({
          ...options,
          unconfirmedHolidayPolicy: "accept",
        } as CalendarOptions);
      } catch {
        group.failed++;
        continue;
      }
      group.compared++;
      const context = `run=${run} ${JSON.stringify({ ...options, holidayProvider: "UNCONFIRMED-2026" })}`;
      if (days.some((day) => outcome(strict, day) !== outcome(plain, day))) group.differed++;
      // redundant と出た設定は、どの日も同じ（出なかった設定は、違ってよいので数えるだけ）
      if (flagged)
        for (const day of days)
          assert.equal(outcome(strict, day), outcome(plain, day), `${context} ${day}`);
    }
    const line = (g: (typeof groups)["redundant"]) =>
      `${g.configs} 件（全日を比べた ${g.compared} 件・作成に失敗した ${g.failed} 件・違いのあった ${g.differed} 件）`;
    console.log(
      `# redundant と出た設定 ${line(groups.redundant)}、出なかった設定 ${line(groups.other)}`,
    );
    // どちらの群も、全日を比べた設定が 1 件以上ある（空振りしていない）
    assert.ok(
      groups.redundant.compared > 0 && groups.other.compared > 0,
      `比べた設定が足りない（空振り）: ${JSON.stringify(groups)}`,
    );
  },
);
