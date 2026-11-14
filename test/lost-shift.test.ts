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

// 届かない振替（decisions.md の 24 番）: "after-holiday" の規則の日が、31 日を超える祝日の連続が明けた日に振り替えられない
// とき、判定は holiday-run-too-long を投げ、診断は同じ code の warning を規則の位置に返す

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
/** start から days 日続く祝日を返す提供元（対応年は、指定しなければ 2020〜2030 年） */
const runOf = (
  days: number,
  start = "2026-07-01",
  id = "XX",
  supportedYears = SUPPORTED,
): HolidayProvider => {
  const all = Array.from({ length: days }, (_, i) => addDays(start, i));
  return {
    id,
    timeZone: "UTC",
    supportedYears,
    dataVersion: "test",
    holidaysInYear: (year) =>
      all
        .filter((date) => Number(date.slice(0, 4)) === year)
        .map((date) => ({
          date,
          name: "shutdown",
          nameEn: "shutdown",
          kind: "regular",
          confirmed: true,
        })),
  };
};
/** 指定した日を祝日として返す提供元 */
const holidaysOn = (dates: readonly string[], supportedYears = SUPPORTED): HolidayProvider => ({
  id: "XX",
  timeZone: "UTC",
  supportedYears,
  dataVersion: "test",
  holidaysInYear: (year) =>
    dates
      .filter((date) => Number(date.slice(0, 4)) === year)
      .map((date) => ({
        date,
        name: "shutdown",
        nameEn: "shutdown",
        kind: "regular",
        confirmed: true,
      })),
});
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

/** 素朴な定義: 対応年の全日を 1 日ずつ判定し、holiday-run-too-long を投げる日（判定の実装だけを使い、診断は使わない） */
function throwingDays(isBusinessDay: (date: string) => unknown, years = SUPPORTED): string[] {
  const days: string[] = [];
  for (let date = `${years.from}-01-01`; date <= `${years.to}-12-31`; date = addDays(date, 1)) {
    const code = codeOf(() => isBusinessDay(date));
    if (code === CODE) days.push(date);
    // 対応年の端の日は、隣の日が対応年の外なので out-of-range（前からの挙動。decisions.md の 17 番）
    else if (code !== "out-of-range") assert.equal(code, undefined, date);
  }
  return days;
}

test("届かない振替: 31 日以内の連続は今までどおり振り替わり、31 日を超えても届く振替元があればその日から振り替わる", () => {
  // 7 月 1 日〜31 日（31 日）。明けた 8 月 1 日は、7 月 1 日の 31 日後
  const within = options(runOf(31), { dayOfMonth: 1, months: [7] });
  assert.equal(createCalendar(within).dayInfoOn("2026-08-01").shiftedFrom, "2026-07-01");
  assert.deepEqual(diagnoseCalendar(within), []);
  // 7 月 1 日〜8 月 9 日（40 日）。7 月 15 日は、明けた 8 月 10 日の 26 日前で届く（7 月 1 日は届かないが、近い日が先に見つかる）
  const reachable = options(runOf(40), { dayOfMonth: [1, 15], months: [7] });
  assert.equal(createCalendar(reachable).dayInfoOn("2026-08-10").shiftedFrom, "2026-07-15");
  assert.deepEqual(diagnoseCalendar(reachable), []);
});

test("届かない振替: 届かない振替元があれば、明けた日の判定・その日を通る探索・その日を含む期間の計算が holiday-run-too-long", () => {
  // 7 月 1 日〜8 月 9 日（40 日）。7 月 1 日・5 日は、明けた 8 月 10 日の 31 日より前
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
  // 連続の中の日・前後の日は判定できる
  for (const date of ["2026-06-30", "2026-07-01", "2026-07-20", "2026-08-09", "2026-08-11"])
    assert.equal(calendar.isBusinessDay(date), true, date);
  // 明けた日を通る探索と、その日を含む期間の計算も止まる
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
  // その日を含まない期間は数えられる
  assert.equal(calendar.diffBusinessDays("2026-08-11", "2026-08-31"), 20);
  assert.equal(calendar.businessDatesBetween("2026-07-01", "2026-08-09").length, 40);
});

test("届かない振替: 連続が 367 日を超えて続き、振替元を確かめられないときも holiday-run-too-long（文は別）", () => {
  // 2025-01-01 から 546 日（2026-06-30 まで）。2 月 29 日の規則は、さかのぼった 367 日の中に当たる日がない
  const o = options(runOf(546, "2025-01-01"), { dayOfMonth: 29, months: [2] });
  assert.throws(() => createCalendar(o).isBusinessDay("2026-07-01"), {
    code: CODE,
    message:
      /^closedRecurringRules\[0\]: no day can be moved to 2026-07-01: .*longer than 367 days/,
  });
  assert.deepEqual(brief(diagnoseCalendar(o)), [["warning", CODE, "closedRecurringRules[0]"]]);
  // 367 日より前に連続が終われば、確かめられる（2025-07-01 から 365 日。当たる日がないので止めない）
  const shorter = options(runOf(365, "2025-07-01"), { dayOfMonth: 29, months: [2] });
  assert.equal(createCalendar(shorter).isBusinessDay("2026-07-01"), true);
  assert.deepEqual(diagnoseCalendar(shorter), []);
});

test("届かない振替: 連続の中に規則の日がなければ止めず、毎週の曜日の規則・祝日の前後の規則は連続の長さによらない", () => {
  // 6 月の規則は、7 月からの連続の中に当たる日がない
  const june = options(runOf(40), { dayOfMonth: 15, months: [6] });
  assert.deepEqual(
    throwingDays((d) => createCalendar(june).isBusinessDay(d)),
    [],
  );
  assert.deepEqual(diagnoseCalendar(june), []);
  // 毎週の曜日の規則は 7 日以内に振替元が見つかる（8 月 10 日は月曜日。規則そのものが当たる）
  const weekly = options(runOf(40), { weekday: 2 });
  assert.equal(createCalendar(weekly).dayInfoOn("2026-08-10").shiftedFrom, "2026-08-04");
  assert.deepEqual(diagnoseCalendar(weekly), []);
  // 祝日の前後の規則は、連続の長さによらない
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
  // 規則 [0] は届かない振替、規則 [2] は規則 [1] に覆われる（shadowed）
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
  // 位置は規則、関係する位置は提供元（提供元が 1 つのとき）。文は例外と同じ内容
  assert.equal(list[0]!.relatedPath, "holidayProvider");
  assert.match(list[0]!.message, /^the day 2026-07-05 cannot be moved to 2026-08-10: /);
  // 設定は作成できる（error がない）
  createCalendar(o);
  // 提供元が 2 つ以上なら、関係する位置は付けない
  const two = { ...o, holidayProvider: [runOf(40), runOf(1, "2026-01-01", "YY")] };
  const first = diagnoseCalendar(two)[0]!;
  assert.deepEqual(
    [first.code, first.path, "relatedPath" in first],
    [CODE, "closedRecurringRules[0]", false],
  );
});

// 規則の種類 × 連続の長さ × 規則の日の位置。連続は 2026-07-01（水曜日）から
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
      // 投げるのは、連続が明けた日から 7 日以内の 1 日だけ
      assert.ok(thrown.length <= 1, context);
      if (thrown.length > 0) lost++;
      else kept++;
    }
  }
  console.log(`# 届かない振替: ${lost + kept} 件（投げる ${lost}、投げない ${kept}）`);
  assert.ok(lost > 0 && kept > 0);
});

test("届かない振替: 飛ばす曜日のある規則は、祝日の連続が 31 日より短くても、前後の飛ばす曜日を足して届かなければ、判定も診断も知らせる", () => {
  // 判定は、祝日と飛ばす曜日（土日）を合わせて数える。連続の始まる曜日（7 通り）と長さを変えて、連続の前の土日に規則の日が
  // ある場合・連続の後ろに土日が続く場合を通す。素朴な定義の走査を短くするため、対応年は 2025〜2027 年
  const years = { from: 2025, to: 2027 };
  let lost = 0;
  let kept = 0;
  let shortRun = 0;
  for (let offset = 0; offset < 7; offset++) {
    const start = addDays("2026-07-01", offset);
    const first = Number(start.slice(8));
    for (const days of [19, 20, 29, 30] as const) {
      // 規則の日: 連続の最初の日と、その 2 日前（連続の前の、飛ばす曜日かもしれない日）
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
  // 2026-12-10 から 42 日（2027-01-20 まで）。12 月 12 日は、明けた 1 月 21 日の 40 日前
  const o = options(runOf(42, "2026-12-10"), { dayOfMonth: 12, months: [12] });
  assert.deepEqual(
    throwingDays((d) => createCalendar(o).isBusinessDay(d)),
    ["2027-01-21"],
  );
  assert.deepEqual(brief(diagnoseCalendar(o)), [["warning", CODE, "closedRecurringRules[0]"]]);
});

test("届かない振替: 明けた日を個別の日付・先の規則が決めていれば、判定も診断も何も出さない", () => {
  const rule: RecurringRule = { dayOfMonth: [1, 5], months: [7] };
  // 個別の日付（臨時営業日）が明けた日を決める
  const byDate = options(runOf(40), rule, { openDates: ["2026-08-10"] });
  assert.deepEqual(
    throwingDays((d) => createCalendar(byDate).isBusinessDay(d)),
    [],
  );
  assert.deepEqual(
    diagnoseCalendar(byDate).filter((d) => d.code === CODE),
    [],
  );
  // 先に書いた規則（毎週の月曜日）が明けた日（月曜日）を決める
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
  // 基準のカレンダーが届かない振替で投げるスケジュール: 診断は error を返さない（判定できない月として扱う）
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
  // 基準のカレンダーが投げる月だけに当たる規則を、never-matches にしない（判定できない月。投げた月を数えられない月として
  // 扱わないと、当たる日がないと誤る）
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
  // shadowed・redundant・counting-basis・第 n 営業日の規則の走査を通る設定に、届かない振替の規則を混ぜる
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
  // 営業日が 1 日もないかを調べる走査は、全日を判定するので、明けた日を必ず通る。届かない振替の例外を受けて、その日を営業日に
  // 数えない（受けないと、規則どうしの診断の結果が捨てられ、error の invalid-provider-data になる）
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
  // 2026-03-03 から 35 日（4 月 6 日まで）、3 日空けて、4 月 10 日から 20 日。水・木・金を飛ばす規則では、4 月 7 日（火曜日）が
  // 明けた日で、3 月 4 日は 34 日前。空いた 3 日のうち 8 日・9 日は飛ばす曜日なので、祝日と飛ばす曜日は 4 月 29 日まで続く
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
  // 決まった形を並べるテストが通らない並び（塊の数・長さ・間隔、飛ばす曜日の組、規則の形と順番）を、乱数で作る
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
    // 祝日の塊を 1〜3 つ。長さは 1〜40 日（6 割は 25 日以上）、間隔は 1〜8 日
    const dates: string[] = [];
    const blocks = int(1, 3);
    const first = addDays("2026-03-01", int(0, 20));
    let day = first;
    for (let b = 0; b < blocks; b++) {
      const length = next() < 0.6 ? int(25, 40) : int(1, 24);
      for (let i = 0; i < length; i++) dates.push(addDays(day, i));
      day = addDays(day, length + int(1, 8));
    }
    // 飛ばす曜日は 0〜3 つ
    const candidates = [0, 1, 2, 3, 4, 5, 6].filter(() => next() < 0.25).slice(0, 3);
    const shape: Record<string, unknown> =
      next() < 0.7
        ? // 月の日は、最初の塊の始まりの近く（3 日前から 6 日後まで）
          {
            dayOfMonth: Number(addDays(first, int(-3, 6)).slice(8)),
            // 半分は 1 つの月だけ（翌月の同じ日が塊の中にあると、近いほうから振り替わって届く）
            months: next() < 0.5 ? [Number(first.slice(5, 7))] : [2, 3, 4],
          }
        : { weekday: int(0, 6), nth: int(1, 4), months: [3, 4] };
    // 曜日の規則は、その曜日を飛ばす曜日に書けない（設定の誤り）
    const skipped = candidates.filter((w) => w !== shape["weekday"]);
    const shifting = {
      ...shape,
      ...(skipped.length > 0 ? { skipWeekdays: skipped } : {}),
      ...AFTER,
    };
    // 半分は、毎週の曜日の規則を前か後ろに足す（先の規則が明けた日を決めると、届かない振替は起きない）
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
    // 判定が投げる規則には warning が出て、warning が出るのは、判定がどこかの日で投げる設定だけ
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
  // 9999-12-30 が祝日。翌日（9999-12-31）を評価すると、祝前日の規則が範囲の外の日（10000-01-01）を見て例外になる
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

// ------------------------------------------------------------
// 診断が出した項目を取り除いても、判定できる日の結果が変わらない（届かない振替のある設定でも。decisions.md の 31 番）
// ------------------------------------------------------------

/** 取り除いても結果が変わらない・使われない、と診断が知らせる code */
const REMOVABLE = new Set(["redundant", "shadowed", "never-matches"]);
type Options = Record<string, unknown>;
/** 診断が取り除けると出した項目（設定の配列の要素）を、まとめて取り除いた設定 */
function withoutReported(o: Options, list: readonly { code: string; path: string }[]): Options {
  const drop = new Map<string, Set<number>>();
  for (const d of list) {
    const m = /^(\w+)\[(\d+)\]$/.exec(d.path);
    if (!REMOVABLE.has(d.code) || !m) continue;
    const set = drop.get(m[1]!) ?? new Set<number>();
    set.add(Number(m[2]));
    drop.set(m[1]!, set);
  }
  const out: Options = { ...o };
  for (const [key, indexes] of drop)
    out[key] = (o[key] as readonly unknown[]).filter((_, i) => !indexes.has(i));
  return out;
}
/** 期間の全日の判定（例外は "E:" と code） */
function judgements(o: Options, from: string, to: string): Map<string, string> {
  const calendar = createCalendar(o as CalendarOptions);
  const out = new Map<string, string>();
  for (let date = from; date <= to; date = addDays(date, 1)) {
    try {
      out.set(date, String(calendar.isBusinessDay(date)));
    } catch (e) {
      out.set(date, `E:${isBizdaysError(e) ? e.code : String(e)}`);
    }
  }
  return out;
}
/** 取り除いた後に、元の設定で判定できた日の結果が変わった日（「日付: 前 → 後」）。元の設定で例外だった日は比べない */
function changedAfterRemoval(
  o: Options,
  from: string,
  to: string,
  before = judgements(o, from, to),
): string[] {
  const after = judgements(withoutReported(o, diagnoseCalendar(o as CalendarOptions)), from, to);
  const changed: string[] = [];
  for (const [date, value] of before)
    if (!value.startsWith("E:") && after.get(date) !== value)
      changed.push(`${date}: ${value} → ${after.get(date)}`);
  return changed;
}

test("届かない振替: 取り除くと明けた日の判定が例外になる項目を、redundant にしない（決まった設定）", () => {
  // 2026-07-01 から 40 日の祝日。7 月 1 日・5 日の規則は、明けた 8 月 10 日（月曜日）に届かない
  const lost = { dayOfMonth: [1, 5], months: [7], ...AFTER };
  const base = { holidayProvider: runOf(40), holidayPolicy: "open", closedWeekdays: [1] };
  // 明けた日を先に決めている項目（取り除くと、届かない振替の段まで進んで例外になる）
  const deciding: readonly (readonly [string, Options])[] = [
    ["臨時休業日", { closedDates: ["2026-08-10"], closedRecurringRules: [lost] }],
    ["臨時営業日", { openDates: ["2026-08-10"], closedRecurringRules: [lost] }],
    ["毎年の休業日", { closedAnnualDates: ["08-10"], closedRecurringRules: [lost] }],
    ["先に書いた毎週の規則", { closedRecurringRules: [{ weekday: 1 }, lost] }],
  ];
  for (const [label, extra] of deciding) {
    const o = { ...base, ...extra };
    // 元の設定は、明けた日を判定できる
    assert.equal(
      codeOf(() => createCalendar(o as CalendarOptions).isBusinessDay("2026-08-10")),
      undefined,
      label,
    );
    assert.deepEqual(changedAfterRemoval(o, "2026-06-01", "2026-09-30"), [], label);
  }
  // 臨時休業日を取り除くと例外になる設定の診断（0.32.0 は、この臨時休業日を redundant と出した）
  assert.deepEqual(brief(diagnoseCalendar({ ...base, ...deciding[0]![1] } as CalendarOptions)), []);
  // 対照: 届かない振替と関わらない日の臨時休業日（月曜定休の月曜日）は、今までどおり redundant
  const control = { ...base, closedDates: ["2026-08-17"], closedRecurringRules: [lost] };
  assert.deepEqual(brief(diagnoseCalendar(control as CalendarOptions)), [
    ["warning", CODE, "closedRecurringRules[0]"],
    ["info", "redundant", "closedDates[0]"],
  ]);
  assert.deepEqual(changedAfterRemoval(control, "2026-06-01", "2026-09-30"), []);
});

test("届かない振替: 乱数で作った設定でも、診断が出した項目をまとめて取り除いて、判定できた日の結果が変わらない（種は固定）", () => {
  const next = random(20261115);
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const years = { from: 2025, to: 2027 };
  let removed = 0;
  let withLost = 0;
  let decidedAtLanding = 0;
  for (let trial = 0; trial < 120; trial++) {
    // 祝日の塊を 1〜2 つ（最初の塊は 32〜40 日）。規則の日は最初の塊の始まりの近くで、届かない振替が起きやすい形にする
    const first = addDays("2026-03-01", int(0, 14));
    const dates: string[] = [];
    let day = first;
    for (let b = 0, blocks = int(1, 2); b < blocks; b++) {
      const length = b === 0 ? int(32, 40) : int(1, 20);
      for (let i = 0; i < length; i++) dates.push(addDays(day, i));
      day = addDays(day, length + int(1, 8));
    }
    const end = dates[dates.length - 1]!;
    // 連続が明けた日の近く（1〜8 日後）の日。個別の日付・毎年の月日は、この日を決める項目として足す
    const near = (): string => addDays(end, int(1, 8));
    const candidates = [0, 1, 2, 3, 4, 5, 6].filter(() => next() < 0.2).slice(0, 2);
    const lost = {
      dayOfMonth: Number(addDays(first, int(0, 4)).slice(8)),
      months: [Number(first.slice(5, 7))],
      ...(candidates.length > 0 ? { skipWeekdays: candidates } : {}),
      ...AFTER,
    };
    const weekly = { weekday: int(0, 6) };
    const o: Options = {
      holidayProvider: holidaysOn(dates, years),
      holidayPolicy: next() < 0.5 ? "open" : "closed",
      closedWeekdays: [0, 1, 2, 3, 4, 5, 6].filter(() => next() < 0.25),
      closedRecurringRules: [
        ...(next() < 0.5 ? [lost] : next() < 0.5 ? [weekly, lost] : [lost, weekly]),
        // 4 割は、第 n 営業日の規則を足す（どの規則がその日を決めたかを調べる走査が、明けた日の月の全日を判定する。
        // この走査が届かない振替を受けないと、診断が error を返す）
        ...(next() < 0.4 ? [{ businessDayOfMonth: [1, 2, -1][int(0, 2)]! }] : []),
      ],
      ...(next() < 0.5 ? { closedDates: [near(), ...(next() < 0.3 ? [near()] : [])] } : {}),
      ...(next() < 0.3 ? { openDates: [near()] } : {}),
      ...(next() < 0.3 ? { closedAnnualDates: [near().slice(5)] } : {}),
    };
    // 同じ日を臨時営業日と臨時休業日の両方に書いた設定も、そのまま通す（先の臨時営業日が決める）
    const list = diagnoseCalendar(o as CalendarOptions);
    const context = `試行 ${trial}: ${JSON.stringify({ ...o, holidayProvider: [dates[0], dates.length] })}`;
    assert.deepEqual(
      list.filter((d) => d.severity === "error"),
      [],
      context,
    );
    // 規則の日は 3 月、祝日は遅くても 6 月上旬までなので、2 月から 6 月を比べる
    const [from, to] = ["2026-02-15", "2026-06-30"];
    const before = judgements(o, from, to);
    assert.deepEqual(changedAfterRemoval(o, from, to, before), [], context);
    if (list.some((d) => REMOVABLE.has(d.code))) removed++;
    if ([...before.values()].includes(`E:${CODE}`)) withLost++;
    // 元の設定では判定でき、個別の日付・毎年の月日を除くと届かない振替で例外になる設定（0.32.0 が見逃した形）
    const bare = judgements(
      { ...o, closedDates: [], openDates: [], closedAnnualDates: [] },
      from,
      to,
    );
    if ([...bare].some(([date, v]) => v === `E:${CODE}` && !before.get(date)!.startsWith("E:")))
      decidedAtLanding++;
  }
  console.log(
    `# 届かない振替（取り除いて比べる）: 120 件（取り除ける項目が出た ${removed}、判定が投げる日がある ${withLost}、明けた日を個別の日付・毎年の月日が決めている ${decidedAtLanding}）`,
  );
  assert.ok(removed > 0 && withLost > 0 && decidedAtLanding > 0);
});
