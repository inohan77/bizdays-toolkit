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
import { jp } from "../src/jp/index.ts";
import { sg } from "../src/sg/index.ts";
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

/** 設定の項目（配列の要素）を持つキー。完全性は、この要素を 1 つずつ取り除いて確かめる */
const ITEM_KEYS = [
  "closedDates",
  "openDates",
  "closedAnnualDates",
  "closedRecurringRules",
  "openRecurringRules",
] as const;
/** 元の設定（before）で判定できた日の結果が、after でも同じか（before で例外だった日は比べない。決定 31 番の約束の範囲） */
const sameOnJudgeable = (before: Map<string, string>, after: Map<string, string>): boolean =>
  [...before].every(([date, value]) => value.startsWith("E:") || after.get(date) === value);
/**
 * 完全性: 診断が取り除けると出した項目をまとめて取り除いた設定に、まだ取り除いても営業日かどうかが変わらない項目が残って
 * いないか（診断のオラクルの完全性と同じ定義。営業日かどうかだけを比べる。理由まで比べると、取り除けると数える項目が減り、
 * 見逃しを隠す）。残っていた項目を、理由の分かっているもの（known）と、そうでないもの（unknown）に分けて返す。
 *
 * known は 1 種類: 個別の日付（臨時営業日・臨時休業日）が当たる日のすべてを決めている、毎年の月日・繰り返しの規則。診断は、
 * 毎年の月日と繰り返しの規則を、個別の日付を除いた設定で判定する（decisions.md の 31 番）ので、個別の日付を除けば結果を
 * 変える規則は、取り除けるものとして出さない。ここでは「個別の日付を除いた設定では、取り除くと結果が変わる」で見分ける。
 * 第 n 営業日の規則がある設定では、診断は個別の日付を残して判定する（同じ 31 番）ので、この種類は起きない。その設定で
 * 残っていた項目は、すべて unknown にする（個別の日付と関係のない見逃しを、known に紛れ込ませない）
 */
function leftRemovable(
  o: Options,
  from: string,
  to: string,
): { known: string[]; unknown: string[] } {
  const rest = withoutReported(o, CALENDAR.diagnose(o));
  const restOpen = judgements(CALENDAR, rest, from, to);
  const withoutDates = (x: Options): Options => ({ ...x, closedDates: [], openDates: [] });
  const countsBusinessDays = [...ITEM_KEYS].some((key) =>
    ((rest[key] as readonly Options[] | undefined) ?? []).some(
      (item) =>
        typeof item === "object" && ("businessDayOfMonth" in item || "businessDayOfWeek" in item),
    ),
  );
  const known: string[] = [];
  const unknown: string[] = [];
  for (const key of ITEM_KEYS) {
    const list = (rest[key] as readonly unknown[] | undefined) ?? [];
    for (let i = 0; i < list.length; i++) {
      const smaller = { ...rest, [key]: list.filter((_, k) => k !== i) };
      if (!sameOnJudgeable(restOpen, judgements(CALENDAR, smaller, from, to))) continue;
      const hiddenByDates =
        !countsBusinessDays &&
        key !== "closedDates" &&
        key !== "openDates" &&
        !sameOnJudgeable(
          judgements(CALENDAR, withoutDates(rest), from, to),
          judgements(CALENDAR, withoutDates(smaller), from, to),
        );
      (hiddenByDates ? known : unknown).push(`${key}[${i}] ${JSON.stringify(list[i])}`);
    }
  }
  return { known, unknown };
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

test("取り除いて比べる（カレンダー）: 長く続く祝日のある決まった設定で、診断の出力・正しさ・完全性を確かめる", () => {
  // 2026-07-01 から 40 日の祝日。7 月 1 日・5 日の "after-holiday" の規則は、明けた 8 月 10 日（月曜日）に届かない。定休日は月曜日
  const lost = { dayOfMonth: [1, 5], months: [7], ...AFTER };
  const in2026 = { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" };
  const base = (days = 40): Options => ({
    holidayProvider: holidayRun(days),
    holidayPolicy: "open",
    closedWeekdays: [1],
  });
  const WARNING = ["warning", CODE, "closedRecurringRules[0]"];
  /** 設定・期待の診断・取り除けるのに診断が出さない既知の項目の数（leftRemovable の known） */
  const cases: readonly (readonly [string, Options, readonly (readonly string[])[], number])[] = [
    // 0.32.1 で残した向き: 当たる日がすべて長い連続の中にある規則は redundant に出て、取り除くと 8 月 10 日の判定が例外から
    // 値に変わる（従っても壊れない。decisions.md の 31 番）。この向きを直したら、この期待を変える
    [
      "届かない規則だけ（有効期間は 2026 年だけ）",
      { ...base(), closedRecurringRules: [{ ...lost, ...in2026 }] },
      [WARNING, ["info", "redundant", "closedRecurringRules[0]"]],
      0,
    ],
    // 上の対照: 有効期間がなければ、ほかの年の 7 月 1 日・5 日を休業日にするので、取り除けない
    ["届かない規則だけ（有効期間なし）", { ...base(), closedRecurringRules: [lost] }, [WARNING], 0],
    // 明けた日を別の項目が先に決めている（判定は例外にならないので、warning も出ない）。0.32.0 は、この項目を redundant と出した
    [
      "届かない規則 + 明けた日の臨時休業日",
      { ...base(), closedDates: ["2026-08-10"], closedRecurringRules: [lost] },
      [],
      0,
    ],
    [
      "届かない規則 + 明けた日の臨時営業日",
      { ...base(), openDates: ["2026-08-10"], closedRecurringRules: [lost] },
      [],
      0,
    ],
    [
      "届かない規則 + 明けた日に当たる毎年の休業日",
      { ...base(), closedAnnualDates: ["08-10"], closedRecurringRules: [lost] },
      [],
      0,
    ],
    [
      "先に書いた毎週の月曜の規則 + 届かない規則",
      { ...base(), closedRecurringRules: [{ weekday: 1 }, lost] },
      [],
      0,
    ],
    [
      "届かない規則 + 第 n 営業日の規則",
      { ...base(), closedRecurringRules: [lost, { businessDayOfMonth: 1 }] },
      [WARNING],
      0,
    ],
    [
      "届く振替だけ（31 日の連続）",
      { ...base(31), closedRecurringRules: [{ dayOfMonth: 1, months: [7], ...AFTER }] },
      [],
      0,
    ],
    [
      "土日を飛ばす届かない規則（7 月 6 日から 30 日の連続、7 月 4 日の規則）",
      {
        holidayProvider: holidayRun(30, "2026-07-06"),
        holidayPolicy: "open",
        closedWeekdays: [],
        closedRecurringRules: [{ dayOfMonth: 4, months: [7], skipWeekdays: [0, 6], ...AFTER }],
      },
      [WARNING],
      0,
    ],
    // 既知の項目（長い連続とは関係しない）: 当たる日のすべてを臨時営業日が開けている規則。取り除いても結果は変わらないが、
    // 診断は規則を個別の日付を除いて判定するので、何も出さない（leftRemovable の known）
    [
      "2026 年 4 月 23 日だけを閉じる規則 + その日の臨時営業日（提供元なし）",
      {
        closedRecurringRules: [{ dayOfMonth: 23, months: [4], ...in2026 }],
        openDates: ["2026-04-23"],
      },
      [],
      1,
    ],
  ];
  for (const [label, o, expected, known] of cases) {
    assert.deepEqual(brief(CALENDAR.diagnose(o)), expected, label);
    // 提供元の対応年の全日（有効期間のない規則は、ほかの年の同じ日にも当たる）
    const [from, to] = ["2020-01-01", "2030-12-31"];
    assert.deepEqual(changedAfterRemoval(CALENDAR, o, from, to), [], label);
    const left = leftRemovable(o, from, to);
    assert.deepEqual(left.unknown, [], `取り除けるのに、診断が何も言わない項目がある: ${label}`);
    assert.equal(left.known.length, known, `${label}: ${JSON.stringify(left.known)}`);
  }
});

test("取り除いて比べる（カレンダー）: 対応年の端の日で、取り除くと判定が out-of-range になる項目を、redundant にしない", () => {
  // 対応年は 2025〜2027 年。規則が見る隣の日・振替元が対応年の外に出ると、判定は out-of-range になる（decisions.md の 17 番）。
  // 先の項目がその日を決めていれば、ならない。0.32.1 までの診断は、対応年の外を祝日なしとして評価していたので、先の項目を
  // redundant と出し、取り除くと端の日の判定が例外になった
  const years = { from: 2025, to: 2027 };
  const provider = holidaysOn(["2025-05-05", "2026-05-05", "2027-05-05"], years);
  const [from, to] = ["2025-01-01", "2027-12-31"];
  const afterHoliday = { dayOfMonth: 8, months: [3], ...AFTER };
  const unreported: readonly (readonly [string, Options, string])[] = [
    // 2025-01-01 は水曜日。後ろの "after-holiday" の規則は、振替元を探して前日（対応年の外）を見る
    [
      "最初の日・先に書いた毎週の規則",
      {
        holidayProvider: provider,
        closedWeekdays: [3],
        closedRecurringRules: [{ weekday: 3 }, afterHoliday],
      },
      "2025-01-01",
    ],
    [
      "最初の日・臨時休業日",
      {
        holidayProvider: provider,
        closedWeekdays: [3],
        closedDates: ["2025-01-01"],
        closedRecurringRules: [afterHoliday],
      },
      "2025-01-01",
    ],
    // 2027-12-31 は金曜日。祝前日の規則は、翌日（対応年の外）を見る
    [
      "最後の日・祝前日の規則",
      {
        holidayProvider: provider,
        closedWeekdays: [5],
        closedRecurringRules: [{ weekday: 5 }, { dayBeforeHoliday: true }],
      },
      "2027-12-31",
    ],
    // 週の第 n 営業日の規則は、週が対応年の外にはみ出す端の週で、対応年の外の日を数える
    [
      "最初の日・週の第 n 営業日の規則",
      {
        holidayProvider: provider,
        closedWeekdays: [3],
        closedRecurringRules: [{ weekday: 3 }, { businessDayOfWeek: 1, weekStart: 1 }],
      },
      "2025-01-01",
    ],
  ];
  for (const [label, o, day] of unreported) {
    // 元の設定は、端の日を判定できる
    assert.equal(
      codeOf(() => createCalendar(o as CalendarOptions).isBusinessDay(day)),
      undefined,
      label,
    );
    assert.deepEqual(
      CALENDAR.diagnose(o).filter((d) => REMOVABLE.has(d.code)),
      [],
      label,
    );
    assert.deepEqual(changedAfterRemoval(CALENDAR, o, from, to), [], label);
  }
  // 対照: 対応年の外を祝日なしとして扱う設定では、取り除いても例外にならないので、今までどおり redundant
  const ignoring = { ...unreported[0]![1], outOfRangePolicy: "ignore" };
  assert.deepEqual(brief(CALENDAR.diagnose(ignoring)), [
    ["info", "redundant", "closedRecurringRules[0]"],
  ]);
  assert.deepEqual(changedAfterRemoval(CALENDAR, ignoring, from, to), []);
});

test("取り除いて比べる（カレンダー）: 対応年の最初の日から祝日が続いても、作成できる設定の診断は error を返さない", () => {
  // 届かない振替の検出は、明けた日から 367 日までさかのぼる。祝日が対応年の最初の日から続くと、連続の先頭を越えて対応年の外を
  // 見るので、明けた日の判定は out-of-range になる（366 日まで）。367 日以上続くと、さかのぼりの上限に先に達して
  // holiday-run-too-long になる。どちらも設定は作成できるので、診断は error を返さない（decisions.md の 17 番）
  const years = { from: 2025, to: 2027 };
  // 連続の中の 12 月 20 日には当たらないように、有効期間を 2026 年 6 月からにする
  const rule = { dayOfMonth: 20, months: [12], effectiveFrom: "2026-06-01", ...AFTER };
  for (const [days, code, expected] of [
    [46, "out-of-range", []],
    [366, "out-of-range", []],
    [367, CODE, [["warning", CODE, "closedRecurringRules[0]"]]],
    [400, CODE, [["warning", CODE, "closedRecurringRules[0]"]]],
  ] as const) {
    const o: Options = {
      holidayProvider: holidayRun(days, "2025-01-01", "XX", years),
      holidayPolicy: "open",
      closedWeekdays: [],
      closedRecurringRules: [rule],
    };
    const landing = addDays("2025-01-01", days);
    assert.equal(
      codeOf(() => createCalendar(o as CalendarOptions).isBusinessDay(landing)),
      code,
      `${days} 日`,
    );
    assert.deepEqual(brief(CALENDAR.diagnose(o)), expected, `${days} 日`);
  }
});

test("取り除いて比べる（カレンダー）: 同梱の提供元でも、対応年の端の日に当たる項目は redundant に出ない", () => {
  // 日本（1955〜2099 年）: 1955-01-02 は日曜日。月曜の "after-holiday" の規則は、前日の元日（祝日）からさらに前（対応年の外）を
  // 見る。毎週の日曜の規則（定休日と重複）がこの日を決めているので、取り除くと out-of-range になる。ほかの日では取り除けるが、
  // 1 日でも判定が変わるので、redundant に出さない
  const monday = { weekday: 1, ...AFTER };
  const sunday: Options = {
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ weekday: 0 }, monday],
  };
  assert.deepEqual(brief(CALENDAR.diagnose(sunday)), []);
  assert.equal(createCalendar(sunday as CalendarOptions).isBusinessDay("1955-01-02"), false);
  assert.equal(
    codeOf(() =>
      createCalendar({
        ...sunday,
        closedRecurringRules: [monday],
      } as CalendarOptions).isBusinessDay("1955-01-02"),
    ),
    "out-of-range",
  );
  // 対照: 土曜の規則は、端の日に当たらないので、今までどおり redundant
  assert.deepEqual(
    brief(CALENDAR.diagnose({ ...sunday, closedRecurringRules: [{ weekday: 6 }, monday] })),
    [["info", "redundant", "closedRecurringRules[0]"]],
  );
  // シンガポール（2020〜2027 年）: 2027-12-31 は金曜日。祝前日の規則は、翌日（対応年の外）を見る
  const friday: Options = {
    holidayProvider: sg,
    closedWeekdays: [5],
    closedRecurringRules: [{ weekday: 5 }, { dayBeforeHoliday: true }],
  };
  assert.deepEqual(brief(CALENDAR.diagnose(friday)), []);
  assert.equal(
    codeOf(() =>
      createCalendar({
        ...friday,
        closedRecurringRules: [{ dayBeforeHoliday: true }],
      } as CalendarOptions).isBusinessDay("2027-12-31"),
    ),
    "out-of-range",
  );
});

test("取り除いて比べる（カレンダー）: 乱数で作った設定でも、診断が出した項目をまとめて取り除いて、判定できた日の結果が変わらない（種は固定）", () => {
  const next = random(20261115);
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const years = { from: 2025, to: 2027 };
  let removed = 0;
  let withLost = 0;
  let decidedAtLanding = 0;
  let hiddenByDates = 0;
  let edgeDecided = 0;
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
      // 3 割は、有効期間を連続のある年だけにする（当たる日がその年だけになり、個別の日付に隠れる形が起きる）
      ...(next() < 0.3 ? { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" } : {}),
      ...(candidates.length > 0 ? { skipWeekdays: candidates } : {}),
      ...AFTER,
    };
    const weekly = { weekday: int(0, 6) };
    // 2 割は、2026 年の 9 月の 1 日だけを閉じる規則を足し、その半分は、同じ日を臨時営業日で開ける（当たる日のすべてを
    // 個別の日付が決めている規則。診断は、規則を個別の日付を除いて判定するので、取り除けるものとして出さない）
    const oneDay = next() < 0.2 ? `2026-09-${int(10, 20)}` : undefined;
    const oneDayRule =
      oneDay === undefined
        ? []
        : [
            {
              dayOfMonth: Number(oneDay.slice(8)),
              months: [9],
              effectiveFrom: "2026-01-01",
              effectiveTo: "2026-12-31",
            },
          ];
    const opened = oneDay !== undefined && next() < 0.5 ? [oneDay] : [];
    // 3 割は、対応年の端の日（最初の 3 日と最後の 3 日のどれか）に臨時営業日を置き、その半分は祝前日の規則を足す。端の日の
    // 判定は、規則が対応年の外の隣の日・振替元を見ると out-of-range になり、臨時営業日が先に決めていれば、ならない
    const edgeDates = next() < 0.3 ? [`2025-01-0${int(1, 3)}`, `2027-12-${int(29, 31)}`] : [];
    const beforeHoliday = edgeDates.length > 0 && next() < 0.5 ? [{ dayBeforeHoliday: true }] : [];
    const o: Options = {
      holidayProvider: holidaysOn(dates, years),
      holidayPolicy: next() < 0.5 ? "open" : "closed",
      closedWeekdays: [0, 1, 2, 3, 4, 5, 6].filter(() => next() < 0.25),
      closedRecurringRules: [
        ...(next() < 0.5 ? [lost] : next() < 0.5 ? [weekly, lost] : [lost, weekly]),
        ...oneDayRule,
        // 4 割は、第 n 営業日の規則を足す（どの規則がその日を決めたかを調べる走査が、明けた日の月の全日を判定する。
        // この走査が届かない振替を受けないと、診断が error を返す）
        ...(next() < 0.4 ? [{ businessDayOfMonth: [1, 2, -1][int(0, 2)]! }] : []),
        ...beforeHoliday,
      ],
      ...(next() < 0.5 ? { closedDates: [near(), ...(next() < 0.3 ? [near()] : [])] } : {}),
      ...(next() < 0.3 || opened.length > 0 || edgeDates.length > 0
        ? { openDates: [...(next() < 0.3 ? [near()] : []), ...opened, ...edgeDates] }
        : {}),
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
    // 対応年の全日を比べる（毎年の月日・有効期間のない規則は、ほかの年にも当たる。9 月の 1 日だけの規則も含める。診断が
    // 規則どうしを調べる期間も、この提供元では対応年）
    const [from, to] = [`${years.from}-01-01`, `${years.to}-12-31`];
    const before = judgements(CALENDAR, o, from, to);
    assert.deepEqual(changedAfterRemoval(CALENDAR, o, from, to, before), [], context);
    const left = leftRemovable(o, from, to);
    assert.deepEqual(left.unknown, [], `取り除けるのに、診断が何も言わない項目がある。${context}`);
    if (left.known.length > 0) hiddenByDates++;
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
    // 元の設定では判定でき、個別の日付を除くと out-of-range になる日がある設定（対応年の端。0.32.1 が見逃した形）
    if (
      [...bare].some(([date, v]) => v === "E:out-of-range" && !before.get(date)!.startsWith("E:"))
    )
      edgeDecided++;
  }
  console.log(
    `# 取り除いて比べる（カレンダー）: 300 件（取り除ける項目が出た ${removed}、判定が投げる日がある ${withLost}、明けた日を個別の日付・毎年の月日が決めている ${decidedAtLanding}、個別の日付に隠れて診断が出さない規則がある ${hiddenByDates}、対応年の端の日を個別の日付が決めている ${edgeDecided}）`,
  );
  assert.ok(
    removed > 0 && withLost > 0 && decidedAtLanding > 0 && hiddenByDates > 0 && edgeDecided > 0,
  );
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
    /** 元の設定は値を返し、個別の日付を除くと out-of-range の例外になる、対応年の端の日がある（0.32.1 が見逃した形） */
    edgeDecided: 0,
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
    // 3 割は、対応年の端の日（最初の 3 日と最後の 3 日のどれか）に個別の日付を置く（値が曜日の値と同じなら、取り除ける
    // ように見える。後ろの "after-holiday" の規則が対応年の外の前日を見ると、端の日の値は out-of-range になる）
    const edgeDates = next() < 0.3 ? [`2025-01-0${int(1, 3)}`, `2027-12-${int(29, 31)}`] : [];
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
      ...(withDates || edgeDates.length > 0
        ? {
            dates: [
              ...(withDates ? [{ date: near(), value: pick() }] : []),
              ...edgeDates.map((date) => ({ date, value: pick() })),
            ],
          }
        : {}),
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
    // 対応年の全日を比べる（毎年の月日は、ほかの年にも当たる）
    const [from, to] = [`${years.from}-01-01`, `${years.to}-12-31`];
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
    if (
      [...bare].some(([date, v]) => v === "E:out-of-range" && !before.get(date)!.startsWith("E:"))
    )
      seen.edgeDecided++;
  }
  console.log(
    `# 取り除いて比べる（スケジュール）: ${TRIALS} 件（取り除ける項目が出た ${seen.removed}、値が例外になる日がある ${seen.withLost}、第 n 営業日の規則の基準: 届かない振替なし ${seen.nthWithPlainBasis}・実際に例外を投げる ${seen.nthWithThrowingBasis}・別の提供元 ${seen.nthWithOtherBasis}、明けた日を個別の日付・毎年の月日が決めている ${seen.decidedAtLanding}、対応年の端の日を個別の日付が決めている ${seen.edgeDecided}）`,
  );
  for (const [name, count] of Object.entries(seen)) assert.ok(count > 0, `${name} が 0 件`);
});
