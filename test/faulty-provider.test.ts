// 失敗を注入した祝日の提供元で、判定・診断・合成の結果が文書（docs/guide.ja.md の「対応年の外」「未確定の祝日」「エラー」
// 「設定の診断」、docs/providers.ja.md の「提供元の約束と誤りの扱い」）のとおりになることを確かめる（テスト拡充案の T3）。
// 途中から例外を投げる提供元（同じ年に同じ結果を返す約束の外）は、ここでは確かめない（診断の catch 節に届くことは test/catch-paths.test.ts が確かめる）。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
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
import { SHORT_DAYS, SHORT_PROVIDER } from "./support/provider.ts";
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

const strictCalendar = () =>
  createCalendar({
    holidayProvider: unconfirmedInYear(INJECTED_YEAR),
    closedWeekdays: [0, 6],
    unconfirmedHolidayPolicy: "throw",
  });

const plainCalendar = (holidayPolicy: "closed" | "open" = "closed") =>
  createCalendar({ holidayProvider: SHORT_PROVIDER, closedWeekdays: [0, 6], holidayPolicy });

/** 提供元が投げた例外をそのまま投げる（code を持たない注入の例外） */
const isInjected = (e: unknown): boolean =>
  e instanceof RangeError &&
  e.message === `injected failure for ${INJECTED_YEAR}` &&
  (e as { code?: unknown }).code === undefined;

// 確かめる約束ごとに 1 つの test にまとめ、注入の種類（不正なデータ 3 種・途中の年を未確定・特定の年で例外を投げる）は中で回す。
// 失敗した組み合わせは「注入: 確かめること: メッセージ」で集め、まとめて報告する（1 つ目で止めない）

interface Case {
  readonly injection: string;
  readonly check: string;
  readonly run: () => void;
}
/** すべての組み合わせを動かし、失敗を集める（試した組み合わせが 0 件なら失敗。空振りしない） */
function runCases(cases: readonly Case[]): void {
  assert.ok(cases.length > 0, "試した組み合わせが 0 件");
  const failures: string[] = [];
  for (const c of cases) {
    try {
      c.run();
    } catch (error) {
      failures.push(
        `${c.injection}: ${c.check}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  assert.deepEqual(failures, []);
}

/** 注入した提供元（種類の名前 → 提供元） */
const INJECTIONS: readonly (readonly [string, NonNullable<CalendarOptions["holidayProvider"]>])[] =
  [
    ...KINDS.map(
      (kind) => [`不正なデータ: ${kind}`, invalidDataInYear(INJECTED_YEAR, kind)] as const,
    ),
    ["途中の年を未確定", unconfirmedInYear(INJECTED_YEAR)],
    ["特定の年で例外を投げる", throwingInYear(INJECTED_YEAR)],
  ];

test("約束: 作成は通る（どの注入でも、営業日カレンダー・スケジュール・スケジュールから作るカレンダー・合成の作成は、使う年を判定するまで投げない）", () => {
  runCases(
    INJECTIONS.map(([injection, provider]) => ({
      injection,
      check: "作成",
      run: () => {
        const calendar = createCalendar({ holidayProvider: provider, closedWeekdays: [0, 6] });
        const schedule = createSchedule({
          holidayProvider: provider,
          weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
          holidayPolicy: { value: "closed" },
        });
        createCalendarFromSchedule(schedule, (v) => v === "open");
        combineCalendars([calendar, createCalendar({ closedWeekdays: [0, 6] })], { open: "all" });
      },
    })),
  );
});

test("約束: 使った年だけ投げる（判定は、注入した年を使う判定だけが投げ、ほかの年は投げない）", () => {
  runCases([
    ...KINDS.map((kind) => ({
      injection: `不正なデータ: ${kind}`,
      check: `判定: 作成は通り、使った年の判定だけが invalid-provider-data になる`,
      run: () => {
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
      },
    })),
    {
      injection: "途中の年を未確定",
      check:
        '判定: 既定では予測をそのまま使い、"throw" では未確定の祝日を引いた判定だけが unconfirmed-holiday',
      run: () => {
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
      },
    },
    {
      injection: "途中の年を未確定",
      check:
        '判定: "ignore" で祝日に依存しない設定は、判定・第 n 営業日の数え方・探索で投げず、dayInfoOn は投げる',
      run: () => {
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
      },
    },
    {
      injection: "途中の年を未確定",
      check:
        '判定: "ignore" でも祝日の上で先に判定する規則（"over-holiday"）があれば、結果が祝日に依存するので投げる',
      run: () => {
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
      },
    },
    {
      injection: "途中の年を未確定",
      check:
        '判定（スケジュールから作ったカレンダー）: "ignore" で結果が祝日に依存しなければ投げず、dayInfoOn は投げる',
      run: () => {
        const schedule = createSchedule({
          holidayProvider: unconfirmedInYear(INJECTED_YEAR),
          weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
          holidayPolicy: "ignore",
          // スケジュールの第 n 営業日の規則は、数える基準のカレンダー（calendar）が必須（スケジュールの値は営業日・休業日では
          // ないので、既定の基準を作れない。calendar がなければ invalid-option）。既定の基準（createBasis）を通るのはカレンダーの
          // 規則だけで、それは "ignore" のカレンダーのテスト（第 n 営業日の規則を含む）が確かめる
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
        throwsCode(
          () => calendar.daysBetween("2026-05-01", "2026-05-31"),
          "unconfirmed-holiday",
          "fromSchedule daysBetween",
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
      },
    },
    {
      injection: "途中の年を未確定",
      check: "判定（スケジュール）: unconfirmedHolidayPolicy はスケジュールにも効く",
      run: () => {
        const schedule = createSchedule({
          holidayProvider: unconfirmedInYear(INJECTED_YEAR),
          weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
          holidayPolicy: { value: "holiday" },
          unconfirmedHolidayPolicy: "throw",
        });
        throwsCode(
          () => schedule.valueOn(HOLIDAY_IN_INJECTED_YEAR),
          "unconfirmed-holiday",
          "valueOn",
        );
        assert.equal(schedule.valueOn(HOLIDAY_AFTER), "holiday");
      },
    },
    {
      injection: "特定の年で例外を投げる",
      check: "判定・合成: その年を使う判定は、提供元の例外を包まずにそのまま投げる",
      run: () => {
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
              combineCalendars([calendar, plainCalendar()], { open }).isBusinessDay(
                DAY_IN_INJECTED_YEAR,
              ),
            isInjected,
          );
      },
    },
  ]);
});

test("約束: 診断は全年を調べる（診断は例外を投げず、提供元の誤りを error で返し、未確定の祝日はそのまま使う）", () => {
  runCases([
    ...KINDS.map((kind) => ({
      injection: `不正なデータ: ${kind}`,
      check: `診断: 対応年のすべての年を調べて error の invalid-provider-data を返す`,
      run: () => {
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
      },
    })),
    {
      injection: "途中の年を未確定",
      check: '診断: 未確定の祝日はそのまま使って調べ、"throw" でも報告しない',
      run: () => {
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
      },
    },
    {
      injection: "特定の年で例外を投げる",
      check:
        "診断: どの設定でも error の invalid-provider-data を返し、例外を祝日なしとして受け止めたまま error のない結果を返さない",
      run: () => {
        // 例外を投げる年（対応年の最初・途中・最後）と、目録の設定（診断の性質のテストと同じ作り方）の組み合わせ
        let checked = 0;
        for (const year of [2025, 2026, 2027]) {
          const rand = random(20261103 + year);
          for (let run = 0; run < 40; run++) {
            const options = {
              ...diagnoseOptions(rand, "short"),
              holidayProvider: throwingInYear(year),
            };
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
      },
    },
  ]);
});

test("約束: 合成は投げる側に従う（合成したカレンダーは、どれかのカレンダーが投げる日に投げる）", () => {
  runCases([
    {
      injection: "途中の年を未確定",
      check: "合成: 投げるカレンダーが先でも後でも、合成したカレンダーも投げる",
      run: () => {
        // 後に置いた場合は、先のカレンダーで結果が決まる日（"all" で休業・"any" で営業）を選ぶ。0.30.8 までは後のカレンダーを判定しなかった
        for (const [open, other] of [
          ["all", () => plainCalendar("closed")],
          ["any", () => plainCalendar("open")],
        ] as const) {
          for (const order of ["strict-first", "strict-last"] as const) {
            const calendars =
              order === "strict-first" ? [strictCalendar(), other()] : [other(), strictCalendar()];
            const combined = combineCalendars(calendars, { open });
            const label = `合成（${open}・${order}）`;
            throwsCode(
              () => combined.isBusinessDay(HOLIDAY_IN_INJECTED_YEAR),
              "unconfirmed-holiday",
              label,
            );
            throwsCode(
              () => combined.dayInfoOn(HOLIDAY_IN_INJECTED_YEAR),
              "unconfirmed-holiday",
              `${label} dayInfoOn`,
            );
            // 探索も、途中で通る日にすべてのカレンダーを判定する（前日から戻ると最初に通るのが予測の祝日）
            throwsCode(
              () => combined.previousBusinessDay(addDays(HOLIDAY_IN_INJECTED_YEAR, 1)),
              "unconfirmed-holiday",
              `${label} previousBusinessDay`,
            );
            assert.equal(combined.isBusinessDay(DAY_BEFORE), true, label);
          }
        }
      },
    },
    ...KINDS.map((kind) => ({
      injection: `不正なデータ: ${kind}`,
      check: `合成: 投げるカレンダーが先なら、合成したカレンダーも invalid-provider-data を投げる`,
      run: () => {
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
      },
    })),
  ]);
});

/** 診断と判定の一致のテストの設定の数（診断が時間を食うので pnpm check では 12 件。全件の 150 件は CONSISTENCY_FULL=1 で、CI の diagnose-consistency ジョブ） */
const CONSISTENCY_RUNS = flagEnv("CONSISTENCY_FULL") ? 150 : 12;

test('診断と判定の一致（オラクル）: 診断が unconfirmedHolidayPolicy を redundant と出した設定は、"throw" を "accept" に変えても全日の判定（例外の有無を含む）が変わらない', () => {
  // 目録の設定（祝日に従属する形のない文脈）を、祝日の扱い "ignore" と未確定の年を含む提供元で作る。"over-holiday"・
  // "after-holiday" の規則の有無で、redundant と出る設定と出ない設定の両方ができる
  const rand = random(20261104);
  const days = SHORT_DAYS;
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
});
