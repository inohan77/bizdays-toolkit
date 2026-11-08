// 公開している関数・メソッドに誤った値を 1 つずつ渡し、例外がこのライブラリの例外（code 付き）であることを確かめる。
// 例外のクラスは code で決まる（decisions.md の 3 番: invalid-input だけが TypeError）。出ることが分かっている code から見る
// robustness の検査と逆向きに、入力から見るので、code を持たない例外（素の TypeError など）を見つけられる。
// 対象は実行時に列挙して決める。関数・メソッドを足すと、正しい呼び出しの見本（SAMPLES）がないことで失敗する
import assert from "node:assert/strict";
import { test } from "node:test";
import * as root from "../src/index.ts";
import * as provider from "../src/provider/index.ts";
import * as diagnose from "../src/diagnose/index.ts";
import * as jpModule from "../src/jp/index.ts";
import { jp } from "../src/jp/index.ts";
import { england } from "../src/uk/index.ts";
import { sg } from "../src/sg/index.ts";
import { metropole } from "../src/fr/index.ts";

type Fn = (...args: unknown[]) => unknown;

/** 誤った値（種類ごとに 1 つ） */
const WRONG: readonly [string, () => unknown][] = [
  ["null", () => null],
  ["数", () => 0],
  ["文字列", () => "x"],
  ["空のオブジェクト", () => ({})],
  ["配列", () => []],
  ["関数", () => () => true],
  ["Symbol", () => Symbol("s")],
  ["BigInt", () => 1n],
  // メッセージの組み立てで JSON.stringify が投げる値（errors.ts の describeValue の catch を通す）
  ["JSON にできないオブジェクト", () => ({ n: 1n })],
];

const D = "2026-11-20";
const DT = "2026-11-20T10:00";
const calendar = root.createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
const schedule = root.createSchedule({
  holidayProvider: jp,
  weekdayValues: ["c", "o", "o", "o", "o", "o", "c"],
});
const fromSchedule = root.createCalendarFromSchedule(schedule, (v) => v === "o");
const combined = root.combineCalendars([calendar, fromSchedule], { open: "all" });

/** 正しい呼び出しの見本（省略可能な引数も、渡して確かめる位置まで書く） */
const SAMPLES: Readonly<Record<string, () => unknown[]>> = {
  // ルート
  addDays: () => [D, 1],
  diffDays: () => [D, "2026-11-30"],
  isValidDate: () => [D],
  weekdayOf: () => [D],
  monthOf: () => [D],
  // ルートの closingMonth・closingPeriod と、カレンダーのメソッドは引数の形が違う（見本の名前を分ける）
  closingMonth: () => [D, 20],
  closingPeriod: () => ["2026-11", 20],
  "calendar.closingMonth": () => [D, 20, { convention: "following" }],
  "calendar.closingPeriod": () => ["2026-11", 20, { convention: "following" }],
  isBizdaysError: () => [new Error()],
  toDateString: () => [DT, "Asia/Tokyo"],
  toDateTimeParts: () => [DT, "Asia/Tokyo"],
  toInstant: () => [D, "10:00", "Asia/Tokyo"],
  createCalendar: () => [{ holidayProvider: jp }],
  createSchedule: () => [{ weekdayValues: [1, 1, 1, 1, 1, 1, 1] }],
  combineCalendars: () => [[calendar, fromSchedule], { open: "all" }],
  createCalendarFromSchedule: () => [schedule, (v: unknown) => v === "o", {}],
  // bizdays-toolkit/provider
  daysInMonth: () => [2026, 2],
  lengthOfMonth: () => [2026, 2],
  isLeapYear: () => [2024],
  easterSunday: () => [2026],
  nthWeekdayOfMonth: () => [2026, 11, 1, 2],
  substituteDays: () => [
    [{ date: "2026-11-22", name: "x", nameEn: "x", kind: "public", confirmed: true }],
    { directions: { 0: "next" }, kind: "substitute" },
  ],
  withSubstituteDays: () => [
    [{ date: "2026-11-22", name: "x", nameEn: "x", kind: "public", confirmed: true }],
    { directions: { 0: "next" }, kind: "substitute" },
  ],
  // bizdays-toolkit/diagnose
  diagnoseCalendar: () => [{ holidayProvider: jp }, { asOf: D }],
  diagnoseSchedule: () => [{ weekdayValues: [1, 1, 1, 1, 1, 1, 1] }, { asOf: D }],
  migrateCalendarOptions: () => [{ holidayProvider: jp }],
  migrateScheduleOptions: () => [{ weekdayValues: [1, 1, 1, 1, 1, 1, 1] }],
  // bizdays-toolkit/jp
  getHoliday: () => [D],
  holidayOn: () => [D],
  holidaysBetween: () => [D, "2026-12-31"],
  holidaysInYear: () => [2026],
  isHoliday: () => [D],
  toJapanDate: () => [DT],
  toJapanDateTime: () => [DT],
  // カレンダー・スケジュールのメソッド
  dateOf: () => [DT],
  civilOf: () => [DT],
  instantOf: () => [D, "10:00"],
  today: () => [new Date()],
  dayInfoOn: () => [D],
  dayInfo: () => [D],
  daysBetween: () => [D, "2026-11-30"],
  isBusinessDay: () => [D],
  nextBusinessDay: () => [D],
  previousBusinessDay: () => [D],
  nextClosedDay: () => [D],
  previousClosedDay: () => [D],
  businessDayOnOrAfter: () => [DT, { cutoff: "14:00" }],
  businessDayOnOrBefore: () => [D],
  addBusinessDays: () => [D, 3],
  diffBusinessDays: () => [D, "2026-11-30"],
  businessDatesBetween: () => [D, "2026-11-30"],
  businessDaysBetween: () => [D, "2026-11-30"],
  listBusinessDays: () => [D, "2026-11-30"],
  adjust: () => [D, { convention: "following" }],
  nthBusinessDayOfMonth: () => ["2026-11", 3],
  firstBusinessDayOfMonth: () => ["2026-11"],
  lastBusinessDayOfMonth: () => ["2026-11"],
  dueDate: () => ["2026-11", { dayOfMonth: 25, convention: "following" }],
  valueOn: () => [D],
  valuesBetween: () => [D, "2026-11-30"],
  scheduleDayOn: () => [D],
};

/** 対象の関数・メソッド: [表示名, 見本の名前, 関数] */
function targets(): [string, string, Fn][] {
  const out: [string, string, Fn][] = [];
  const add = (owner: string, obj: object): void => {
    for (const [name, v] of Object.entries(obj)) {
      if (typeof v !== "function") continue;
      const method = owner !== "root" && (name === "closingMonth" || name === "closingPeriod");
      out.push([`${owner}.${name}`, method ? `calendar.${name}` : name, v as Fn]);
    }
  };
  add("root", root);
  add("provider", provider);
  add("diagnose", diagnose);
  add("jp", jpModule);
  for (const [owner, p] of Object.entries({ jp, england, sg, metropole })) add(owner, p);
  add("calendar", calendar);
  add("combined", combined);
  add("fromSchedule", fromSchedule);
  add("schedule", schedule);
  return out;
}

const describeError = (e: unknown): string =>
  e instanceof Error
    ? `${e.constructor.name}(${(e as { code?: string }).code ?? "code なし"}): ${e.message}`
    : String(e);

test("誤った引数: どの関数・メソッドも、このライブラリの例外（code 付き・クラスは code で決まる）だけを投げる", () => {
  const all = targets();
  const missing = [...new Set(all.map(([, name]) => name).filter((n) => !(n in SAMPLES)))];
  const problems: string[] = [];
  let calls = 0;
  for (const [label, name, f] of all) {
    const sample = SAMPLES[name];
    if (sample === undefined) continue;
    // 見本そのものは投げない（誤った値の位置以外の引数が正しいことの確かめ）
    try {
      f(...sample());
    } catch (e) {
      problems.push(`${label} の見本が投げた: ${describeError(e)}`);
      continue;
    }
    for (let i = 0; i < sample().length; i++) {
      for (const [kind, wrong] of WRONG) {
        const args = sample();
        args[i] = wrong();
        calls++;
        try {
          f(...args);
        } catch (e) {
          const ok =
            root.isBizdaysError(e) && e instanceof TypeError === (e.code === "invalid-input");
          if (!ok) problems.push(`${label} の引数 ${i + 1} に${kind}: ${describeError(e)}`);
        }
      }
    }
  }
  console.log(`対象 ${all.length} 個、呼び出し ${calls} 回`);
  assert.deepEqual(missing, [], "見本（SAMPLES）のない関数・メソッド");
  assert.deepEqual(problems, []);
});

test("誤った引数: オブジェクトでないオプションを、オプションなしとして黙って通さない", () => {
  // [見本の名前, オプションの位置, 期待する code（undefined なら code を問わない）]
  const places: [string, number, string | undefined][] = [
    ["businessDayOnOrAfter", 1, "invalid-argument"],
    ["createCalendarFromSchedule", 2, "invalid-argument"],
    // 必須の項目（open・dayOfMonth）がないことで投げる
    ["combineCalendars", 1, undefined],
    ["dueDate", 1, undefined],
  ];
  const wrongs: [string, () => unknown][] = [
    // 普通のオブジェクト（空のオブジェクトなど）はオプションとして受ける
    ...WRONG.filter(([, wrong]) => Object.prototype.toString.call(wrong()) !== "[object Object]"),
    ["NaN", () => NaN],
    ["Date", () => new Date()],
  ];
  const all = targets();
  let checked = 0;
  for (const [name, at, code] of places) {
    const list = all.filter(([, n]) => n === name);
    assert.ok(list.length > 0, name);
    for (const [label, , f] of list) {
      for (const [kind, wrong] of wrongs) {
        const args = SAMPLES[name]!();
        args[at] = wrong();
        checked++;
        assert.throws(
          () => f(...args),
          (e: unknown) => root.isBizdaysError(e) && (code === undefined || e.code === code),
          `${label} の引数 ${at + 1} に${kind}`,
        );
      }
    }
  }
  console.log(`確かめた呼び出し ${checked} 回`);
});

test("誤った引数: today は Date だけを受ける（Date.now() の数を渡す誤りを黙って通さない）", () => {
  const all = targets().filter(([, n]) => n === "today");
  assert.deepEqual(
    all.map(([label]) => label),
    ["calendar.today", "combined.today", "fromSchedule.today", "schedule.today"],
  );
  for (const [label, , f] of all) {
    assert.equal(f(new Date("2026-11-20T00:00:00Z")), "2026-11-20", label);
    for (const wrong of [null, Date.now(), "2026-11-20", { epochMilliseconds: 0 }]) {
      assert.throws(
        () => f(wrong),
        (e: unknown) => root.isBizdaysError(e) && e.code === "invalid-argument",
        `${label}(${String(wrong)})`,
      );
    }
  }
});

test("誤った引数: メッセージの値の表し方（数はそのまま、文字列は引用符付き。NaN を JSON の null と書かない）", () => {
  const messageOf = (f: () => unknown): string => {
    try {
      f();
    } catch (e) {
      assert.ok(root.isBizdaysError(e));
      return e.message;
    }
    throw new Error("投げなかった");
  };
  assert.match(
    messageOf(() => calendar.addBusinessDays(D, NaN)),
    /: NaN$/,
  );
  assert.match(
    messageOf(() => root.addDays(D, Infinity)),
    /: Infinity$/,
  );
  assert.match(
    messageOf(() => calendar.holidaysInYear(NaN)),
    /: NaN$/,
  );
  assert.match(
    messageOf(() => root.addDays("2026-02-30", 1)),
    /: "2026-02-30"$/,
  );
  assert.match(
    messageOf(() => root.addDays(D, Symbol("s") as never)),
    /: Symbol\(s\)$/,
  );
  assert.match(
    messageOf(() => root.addDays(D, 1n as never)),
    /: 1n$/,
  );
  // オブジェクトでないオプション（Date・Map を含む）は、そのことをメッセージで伝える（code は前からのまま）
  // Date・Map は種類で表す（JSON の形だと Date が文字列に、Map が {} に見える）
  assert.match(
    messageOf(() => calendar.dueDate("2026-11", new Date(0) as never)),
    /: \[object Date\]$/,
  );
  assert.match(
    messageOf(() => calendar.dueDate("2026-11", new Map() as never)),
    /: \[object Map\]$/,
  );
  for (const wrong of [null, new Date(), new Map()]) {
    assert.match(
      messageOf(() => calendar.dueDate("2026-11", wrong as never)),
      /dueDate options must be an object: /,
    );
    assert.match(
      messageOf(() => root.combineCalendars([calendar, fromSchedule], wrong as never)),
      /combineCalendars options must be an object: /,
    );
  }
});
