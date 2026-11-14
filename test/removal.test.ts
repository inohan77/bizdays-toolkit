import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  createCalendar,
  createSchedule,
  isBizdaysError,
  type Calendar,
  type CalendarOptions,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { random } from "./support/catalog.ts";
import { holidayRun, holidaysOn } from "./support/provider.ts";

// 診断が「取り除いても結果が変わらない・使われない」と出した項目（redundant・shadowed・never-matches）をまとめて取り除いても、
// 元の設定で判定できた日の結果が変わらないこと（decisions.md の 31 番）を、営業日カレンダーとスケジュールで確かめる。
// 届かない振替（24 番）のある設定を中心に作る: 0.32.0 は、明けた日を先に決めている項目を redundant と出し、取り除くと
// その日の判定が例外になった。診断のオラクル（test/diagnose-oracle.test.ts）は祝日の連続が短い提供元を使うので、ここで確かめる

const CODE = "holiday-run-too-long";
const AFTER = { holidayOverlapPolicy: "after-holiday" } as const;
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return isBizdaysError(e) ? e.code : `not a bizdays error: ${String(e)}`;
  }
};
const brief = (list: readonly { severity: string; code: string; path: string }[]) =>
  list.map((d) => [d.severity, d.code, d.path]);

/** 取り除いても結果が変わらない・使われない、と診断が知らせる code */
const REMOVABLE = new Set(["redundant", "shadowed", "never-matches"]);
type Options = Record<string, unknown>;
type Reported = { readonly severity: string; readonly code: string; readonly path: string };
/** 確かめる対象（営業日カレンダーかスケジュール）の、診断と 1 日の判定 */
interface Subject {
  readonly diagnose: (o: Options) => readonly Reported[];
  /** 設定から、1 日の結果を返す関数を作る */
  readonly judge: (o: Options) => (date: string) => unknown;
}
const CALENDAR: Subject = {
  diagnose: (o) => diagnoseCalendar(o as CalendarOptions),
  judge: (o) => {
    const calendar = createCalendar(o as CalendarOptions);
    return (date) => calendar.isBusinessDay(date);
  },
};
/** 作成済みのカレンダーそのものを、1 日の判定の対象にする（基準のカレンダーが投げる日を調べる） */
const CALENDAR_OBJECT = (calendar: Calendar): Subject => ({
  diagnose: () => [],
  judge: () => (date) => calendar.isBusinessDay(date),
});
const SCHEDULE: Subject = {
  diagnose: (o) => diagnoseSchedule(o as never),
  judge: (o) => {
    const schedule = createSchedule(o as never);
    return (date) => schedule.valueOn(date);
  },
};
/** 診断が取り除けると出した項目（設定の配列の要素）を、まとめて取り除いた設定 */
function withoutReported(o: Options, list: readonly Reported[]): Options {
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
/** 期間の全日の結果（例外は "E:" と code） */
function judgements(subject: Subject, o: Options, from: string, to: string): Map<string, string> {
  const judge = subject.judge(o);
  const out = new Map<string, string>();
  for (let date = from; date <= to; date = addDays(date, 1)) {
    try {
      out.set(date, JSON.stringify(judge(date)));
    } catch (e) {
      out.set(date, `E:${isBizdaysError(e) ? e.code : String(e)}`);
    }
  }
  return out;
}
/** 取り除いた後に、元の設定で判定できた日の結果が変わった日（「日付: 前 → 後」）。元の設定で例外だった日は比べない */
function changedAfterRemoval(
  subject: Subject,
  o: Options,
  from: string,
  to: string,
  before = judgements(subject, o, from, to),
): string[] {
  const after = judgements(subject, withoutReported(o, subject.diagnose(o)), from, to);
  const changed: string[] = [];
  for (const [date, value] of before)
    if (!value.startsWith("E:") && after.get(date) !== value)
      changed.push(`${date}: ${value} → ${after.get(date)}`);
  return changed;
}

test("取り除いて比べる（カレンダー）: 取り除くと明けた日の判定が例外になる項目を、redundant にしない（決まった設定）", () => {
  // 2026-07-01 から 40 日の祝日。7 月 1 日・5 日の規則は、明けた 8 月 10 日（月曜日）に届かない
  const lost = { dayOfMonth: [1, 5], months: [7], ...AFTER };
  const base = { holidayProvider: holidayRun(40), holidayPolicy: "open", closedWeekdays: [1] };
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
    assert.deepEqual(changedAfterRemoval(CALENDAR, o, "2026-06-01", "2026-09-30"), [], label);
  }
  // 臨時休業日を取り除くと例外になる設定の診断（0.32.0 は、この臨時休業日を redundant と出した）
  assert.deepEqual(brief(diagnoseCalendar({ ...base, ...deciding[0]![1] } as CalendarOptions)), []);
  // 対照: 届かない振替と関わらない日の臨時休業日（月曜定休の月曜日）は、今までどおり redundant
  const control = { ...base, closedDates: ["2026-08-17"], closedRecurringRules: [lost] };
  assert.deepEqual(brief(diagnoseCalendar(control as CalendarOptions)), [
    ["warning", CODE, "closedRecurringRules[0]"],
    ["info", "redundant", "closedDates[0]"],
  ]);
  assert.deepEqual(changedAfterRemoval(CALENDAR, control, "2026-06-01", "2026-09-30"), []);
});

test("取り除いて比べる（カレンダー）: 乱数で作った設定でも、診断が出した項目をまとめて取り除いて、判定できた日の結果が変わらない（種は固定）", () => {
  const next = random(20261115);
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const years = { from: 2025, to: 2027 };
  let removed = 0;
  let withLost = 0;
  let decidedAtLanding = 0;
  for (let trial = 0; trial < 300; trial++) {
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
    const before = judgements(CALENDAR, o, from, to);
    assert.deepEqual(changedAfterRemoval(CALENDAR, o, from, to, before), [], context);
    if (list.some((d) => REMOVABLE.has(d.code))) removed++;
    if ([...before.values()].includes(`E:${CODE}`)) withLost++;
    // 元の設定では判定でき、個別の日付・毎年の月日を除くと届かない振替で例外になる設定（0.32.0 が見逃した形）
    const bare = judgements(
      CALENDAR,
      { ...o, closedDates: [], openDates: [], closedAnnualDates: [] },
      from,
      to,
    );
    if ([...bare].some(([date, v]) => v === `E:${CODE}` && !before.get(date)!.startsWith("E:")))
      decidedAtLanding++;
  }
  console.log(
    `# 取り除いて比べる（カレンダー）: 300 件（取り除ける項目が出た ${removed}、判定が投げる日がある ${withLost}、明けた日を個別の日付・毎年の月日が決めている ${decidedAtLanding}）`,
  );
  assert.ok(removed > 0 && withLost > 0 && decidedAtLanding > 0);
});

test("取り除いて比べる（スケジュール）: 取り除くと明けた日の値が例外になる項目を、redundant にしない（決まった設定）", () => {
  // 2026-07-01 から 40 日の祝日。7 月 1 日・5 日の規則は、明けた 8 月 10 日に届かない。値は、どの曜日も "w"
  const lost = { dayOfMonth: [1, 5], months: [7], value: "x", ...AFTER };
  const base = {
    holidayProvider: holidayRun(40),
    weekdayValues: ["w", "w", "w", "w", "w", "w", "w"],
  };
  // 明けた日を先に決めている項目（曜日の値と同じ値なので、届かない振替がなければ取り除ける）
  const deciding: readonly (readonly [string, Options])[] = [
    ["個別の日付", { dates: [{ date: "2026-08-10", value: "w" }], recurringRules: [lost] }],
    ["毎年の月日", { annualDates: [{ date: "08-10", value: "w" }], recurringRules: [lost] }],
    ["先に書いた毎週の規則", { recurringRules: [{ weekday: 1, value: "w" }, lost] }],
  ];
  for (const [label, extra] of deciding) {
    const o = { ...base, ...extra };
    assert.equal(
      codeOf(() => createSchedule(o as never).valueOn("2026-08-10")),
      undefined,
      label,
    );
    assert.deepEqual(changedAfterRemoval(SCHEDULE, o, "2026-06-01", "2026-09-30"), [], label);
    assert.deepEqual(
      diagnoseSchedule(o as never).filter((d) => d.severity === "error"),
      [],
      label,
    );
  }
  // 対照: 届かない振替と関わらない日の個別の日付は、今までどおり redundant
  const control = {
    ...base,
    dates: [{ date: "2026-08-17", value: "w" }],
    recurringRules: [lost],
  };
  assert.deepEqual(brief(diagnoseSchedule(control as never)), [
    ["warning", CODE, "recurringRules[0]"],
    ["info", "redundant", "dates[0]"],
  ]);
  assert.deepEqual(changedAfterRemoval(SCHEDULE, control, "2026-06-01", "2026-09-30"), []);
});

test("取り除いて比べる（スケジュール）: 乱数で作った設定でも、診断が出した項目をまとめて取り除いて、値を返した日の結果が変わらない（種は固定）", () => {
  const next = random(20261116);
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = (): string => ["a", "b", "c"][int(0, 2)]!;
  const years = { from: 2025, to: 2027 };
  // 通したい並びが、実際に起きた数（そう作った設定の数ではない。0 件なら失敗にする）
  const seen = {
    /** 診断が、取り除ける項目を出した */
    removed: 0,
    /** 値が届かない振替の例外になる日がある */
    withLost: 0,
    /** 第 n 営業日の規則があり、基準のカレンダー（届かない振替なし）がどの日も判定できる */
    nthWithPlainBasis: 0,
    /** 第 n 営業日の規則があり、基準のカレンダーが、比べる期間の中で届かない振替の例外を投げる */
    nthWithThrowingBasis: 0,
    /** 第 n 営業日の規則があり、基準のカレンダーが別の提供元を持つ */
    nthWithOtherBasis: 0,
    /** 元の設定は値を返し、個別の日付・毎年の月日を除くと届かない振替の例外になる日がある（0.32.0 が見逃した形） */
    decidedAtLanding: 0,
  };
  const TRIALS = 240;
  for (let trial = 0; trial < TRIALS; trial++) {
    // 祝日の塊を 1〜2 つ（最初の塊は 32〜40 日）。規則の日は最初の塊の始まりの近く
    const first = addDays("2026-03-01", int(0, 14));
    const dates: string[] = [];
    let day = first;
    for (let b = 0, blocks = int(1, 2); b < blocks; b++) {
      const length = b === 0 ? int(32, 40) : int(1, 20);
      for (let i = 0; i < length; i++) dates.push(addDays(day, i));
      day = addDays(day, length + int(1, 8));
    }
    const end = dates[dates.length - 1]!;
    const near = (): string => addDays(end, int(1, 8));
    const provider = holidaysOn(dates, years);
    const candidates = [0, 1, 2, 3, 4, 5, 6].filter(() => next() < 0.2).slice(0, 2);
    const lostDay = Number(addDays(first, int(0, 4)).slice(8));
    const lostMonths = [Number(first.slice(5, 7))];
    const lost = {
      dayOfMonth: lostDay,
      months: lostMonths,
      value: pick(),
      ...(candidates.length > 0 ? { skipWeekdays: candidates } : {}),
      ...AFTER,
    };
    const weekly = { weekday: int(0, 6), value: pick() };
    // 第 n 営業日の規則の基準のカレンダー（スケジュールでは必須）: 届かない振替のないもの・明けた日の判定が例外になるもの・
    // 別の提供元のもの
    const basisKind = int(0, 2);
    const basis: Calendar =
      basisKind === 0
        ? createCalendar({ closedWeekdays: [0, 6] })
        : basisKind === 1
          ? createCalendar({
              holidayProvider: provider,
              holidayPolicy: "open",
              closedWeekdays: [],
              closedRecurringRules: [{ dayOfMonth: lostDay, months: lostMonths, ...AFTER }],
            } as CalendarOptions)
          : createCalendar({
              holidayProvider: holidayRun(3, "2026-05-01", "YY", years),
              closedWeekdays: [0],
            });
    const nth =
      next() < 0.6
        ? [{ businessDayOfMonth: [1, 2, -1][int(0, 2)]!, calendar: basis, value: pick() }]
        : [];
    const policy = int(0, 3);
    const withDates = next() < 0.5;
    const withAnnual = next() < 0.3;
    const o: Options = {
      holidayProvider: provider,
      weekdayValues: Array.from({ length: 7 }, pick),
      ...(policy === 1
        ? { holidayPolicy: "ignore" }
        : policy === 2
          ? { holidayPolicy: { value: "h" } }
          : policy === 3
            ? { holidayPolicy: { sameAs: int(0, 6) } }
            : {}),
      recurringRules: [
        ...(next() < 0.5 ? [lost] : next() < 0.5 ? [weekly, lost] : [lost, weekly]),
        ...nth,
      ],
      ...(withDates ? { dates: [{ date: near(), value: pick() }] } : {}),
      ...(withAnnual ? { annualDates: [{ date: near().slice(5), value: pick() }] } : {}),
    };
    const describe = {
      ...o,
      holidayProvider: [dates[0], dates.length],
      recurringRules: (o["recurringRules"] as Options[]).map((r) =>
        "calendar" in r ? { ...r, calendar: `basis ${basisKind}` } : r,
      ),
    };
    const context = `試行 ${trial}: ${JSON.stringify(describe)}`;
    const list = SCHEDULE.diagnose(o);
    assert.deepEqual(
      list.filter((d) => d.severity === "error"),
      [],
      context,
    );
    const [from, to] = ["2026-02-15", "2026-06-30"];
    const before = judgements(SCHEDULE, o, from, to);
    assert.deepEqual(changedAfterRemoval(SCHEDULE, o, from, to, before), [], context);
    if (list.some((d) => REMOVABLE.has(d.code))) seen.removed++;
    if ([...before.values()].includes(`E:${CODE}`)) seen.withLost++;
    if (nth.length > 0) {
      // 基準のカレンダーが、比べる期間の中で実際に投げるか（明けた日が例外になるように作っても、規則の日が届けば投げない）
      const basisThrows = [...judgements(CALENDAR_OBJECT(basis), {}, from, to).values()].includes(
        `E:${CODE}`,
      );
      if (basisKind === 0) seen.nthWithPlainBasis++;
      else if (basisKind === 2) seen.nthWithOtherBasis++;
      else if (basisThrows) seen.nthWithThrowingBasis++;
    }
    const bare = judgements(SCHEDULE, { ...o, dates: [], annualDates: [] }, from, to);
    if ([...bare].some(([date, v]) => v === `E:${CODE}` && !before.get(date)!.startsWith("E:")))
      seen.decidedAtLanding++;
  }
  console.log(
    `# 取り除いて比べる（スケジュール）: ${TRIALS} 件（取り除ける項目が出た ${seen.removed}、値が例外になる日がある ${seen.withLost}、第 n 営業日の規則の基準: 届かない振替なし ${seen.nthWithPlainBasis}・実際に例外を投げる ${seen.nthWithThrowingBasis}・別の提供元 ${seen.nthWithOtherBasis}、明けた日を個別の日付・毎年の月日が決めている ${seen.decidedAtLanding}）`,
  );
  for (const [name, count] of Object.entries(seen)) assert.ok(count > 0, `${name} が 0 件`);
});
