// 公開している関数・メソッドに誤った値を 1 つずつ渡し、例外がこのライブラリの例外（code 付き）であることを確かめる。
// 例外のクラスは code で決まる（decisions.md の 3 番: invalid-input だけが TypeError）。出ることが分かっている code から見る
// robustness の検査と逆向きに、入力から見るので、code を持たない例外（素の TypeError など）を見つけられる。
// 対象は実行時に列挙して決める。関数・メソッドを足すと、正しい呼び出しの見本（SAMPLES）がないことで失敗する
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
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

const isOptionsLike = (v: unknown): boolean =>
  Object.prototype.toString.call(v) === "[object Object]";
const isCalendarOrSchedule = (v: unknown): boolean =>
  typeof v === "object" && v !== null && ("dayInfoOn" in v || "valueOn" in v);

test("誤った引数: オブジェクトでないオプションを黙って通さず、設定は invalid-option、ほかは invalid-argument（decisions.md の 8 番）", () => {
  // 位置と code は関数名の一覧で決めず、見本から決める（関数を足しても規則がそのまま当たる）。
  // 見本の引数のうち普通のオブジェクト（カレンダー・スケジュールを除く）をオプションの位置とみなし、
  // - 見本の戻り値が営業日カレンダーかスケジュールなら作る関数: その位置は設定で、invalid-option を投げる
  // - bizdays-toolkit/diagnose の、配列（診断）を返す関数: 第 1 引数は診断する設定で、invalid-option を error の結果で返す
  // - それ以外（メソッドのオプション、移行の関数、診断のオプションなど）: invalid-argument を投げる
  const wrongs: [string, () => unknown][] = [
    // 普通のオブジェクト（空のオブジェクトなど）はオプションとして受ける
    ...WRONG.filter(([, wrong]) => !isOptionsLike(wrong())),
    ["NaN", () => NaN],
    // 普通のオブジェクトでないオブジェクト（decisions.md の 8 番。オブジェクトでないものとして扱う）
    ["Date", () => new Date()],
    ["Map", () => new Map()],
    ["包んだ文字列", () => new String("x")],
  ];
  const diagnoseFns = new Set<unknown>(Object.values(diagnose));
  const counts: Record<string, number> = { 設定: 0, 診断する設定: 0, 引数: 0 };
  for (const [label, name, f] of targets()) {
    const sample = SAMPLES[name];
    if (sample === undefined) continue; // 見本のない関数は、最初のテストが失敗にする
    const ret = f(...sample());
    const creates = isCalendarOrSchedule(ret);
    sample().forEach((arg, at) => {
      if (!isOptionsLike(arg) || isCalendarOrSchedule(arg)) return;
      const kind = creates
        ? "設定"
        : diagnoseFns.has(f) && Array.isArray(ret) && at === 0
          ? "診断する設定"
          : "引数";
      // 見本の項目をそのまま持たせた、普通のオブジェクトでないもの（項目を読むだけの検証では通ってしまう形）
      const shaped: [string, () => unknown][] = [
        ["項目を持つ配列", () => Object.assign([], arg)],
        ["項目を持つ関数", () => Object.assign(() => {}, arg)],
        ["項目を持つ Date", () => Object.assign(new Date(), arg)],
        ["項目を持つ Map", () => Object.assign(new Map(), arg)],
      ];
      for (const [wrongLabel, wrong] of [...wrongs, ...shaped]) {
        const args = sample();
        args[at] = wrong();
        const where = `${label} の引数 ${at + 1} に${wrongLabel}（${kind}）`;
        counts[kind]!++;
        if (kind === "診断する設定") {
          const result = f(...args) as { code: string; severity: string }[];
          assert.ok(
            result.some((d) => d.code === "invalid-option" && d.severity === "error"),
            `${where}: ${JSON.stringify(result.map((d) => d.code))}`,
          );
          continue;
        }
        const code = kind === "設定" ? "invalid-option" : "invalid-argument";
        assert.throws(
          () => f(...args),
          (e: unknown) => root.isBizdaysError(e) && e.code === code,
          `${where}: ${code} を期待`,
        );
      }
    });
  }
  console.log(`確かめた呼び出し: ${JSON.stringify(counts)}`);
  for (const [kind, n] of Object.entries(counts)) assert.ok(n > 0, `${kind}の呼び出しが 0 回`);
});

test("正しい引数: 設定・オプションは、プロトタイプのないもの・クラスで作ったもの・別の実行環境のものも普通のオブジェクトとして受ける（decisions.md の 8 番）", () => {
  const forms: [string, (o: Record<string, unknown>) => object][] = [
    ["プロトタイプのない", (o) => Object.assign(Object.create(null) as object, o)],
    ["クラスで作った", (o) => Object.assign(new (class Options {})(), o)],
    ["別の実行環境の", (o) => Object.assign(runInNewContext("({})") as object, o)],
  ];
  let checked = 0;
  for (const [label, name, f] of targets()) {
    const sample = SAMPLES[name];
    if (sample === undefined) continue;
    sample().forEach((arg, at) => {
      if (!isOptionsLike(arg) || isCalendarOrSchedule(arg)) return;
      for (const [form, make] of forms) {
        const args = sample();
        args[at] = make(arg as Record<string, unknown>);
        checked++;
        assert.doesNotThrow(() => f(...args), `${label} の引数 ${at + 1} に${form}オブジェクト`);
      }
    });
  }
  assert.ok(checked > 0);
});

test("誤った引数: 数を受ける引数に数の文字列を渡すと、メッセージでは引用符付きで表す（数に見せない）", () => {
  // 位置は見本から決める: 見本の引数のうち数の位置に、同じ数の文字列を渡す
  let checked = 0;
  for (const [label, name, f] of targets()) {
    const sample = SAMPLES[name];
    if (sample === undefined) continue;
    sample().forEach((arg, at) => {
      if (typeof arg !== "number") return;
      const args = sample();
      args[at] = String(arg);
      let message: string | undefined;
      try {
        f(...args);
      } catch (e) {
        if (!root.isBizdaysError(e)) throw e;
        message = e.message;
      }
      if (message === undefined) return; // 数の文字列を受ける引数（日数の文字列は受けないが、年月の文字列などは受ける）
      checked++;
      assert.ok(
        message.includes(JSON.stringify(String(arg))),
        `${label} の引数 ${at + 1}: ${message}`,
      );
    });
  }
  assert.ok(checked > 0);
  // 入れ子の数（dueDate の dayOfMonth）と、暦日の文字列でない値（toInstant の date）
  assert.throws(
    () => calendar.dueDate("2026-11", { dayOfMonth: "23" as never, convention: "following" }),
    /: "23"$/,
  );
  assert.throws(
    () => root.toInstant(["2026-11-23"] as never, "10:00", "UTC"),
    /: \["2026-11-23"\]$/,
  );
});

test("誤った引数: holidaysInYear の整数でない年は、どの経路でも invalid-argument（範囲の外の整数は out-of-range）", () => {
  // 提供元のオブジェクト・bizdays-toolkit/jp の関数・カレンダーとスケジュールのメソッドのすべて（KnownErrorCode の説明）
  const all = targets().filter(([, n]) => n === "holidaysInYear");
  assert.ok(all.length >= 9, all.map(([label]) => label).join(", "));
  for (const [label, , f] of all) {
    for (const year of ["2026", 2026.5, NaN, Infinity, null]) {
      assert.throws(
        () => f(year),
        (e: unknown) => root.isBizdaysError(e) && e.code === "invalid-argument",
        `${label}(${typeof year === "string" ? JSON.stringify(year) : String(year)})`,
      );
    }
    for (const year of [999, 10000]) {
      assert.throws(
        () => f(year),
        (e: unknown) => root.isBizdaysError(e) && e.code === "out-of-range",
        `${label}(${year})`,
      );
    }
  }
});

test('holidaysInYear の 1000〜9999 の外の整数の年は、提供元のないカレンダー・スケジュール、"ignore" のカレンダー、それらの合成でも out-of-range（空の一覧にしない。decisions.md の 1 番）', () => {
  const none = root.createCalendar({ closedWeekdays: [0, 6], timeZone: "Asia/Tokyo" });
  const ignore = root.createCalendar({ holidayProvider: jp, outOfRangePolicy: "ignore" });
  const schedule = root.createSchedule({ weekdayValues: [1, 1, 1, 1, 1, 1, 1] });
  const ignoreSchedule = root.createSchedule({
    weekdayValues: [1, 1, 1, 1, 1, 1, 1],
    holidayProvider: jp,
    outOfRangePolicy: "ignore",
  });
  const fromSchedule = root.createCalendarFromSchedule(schedule, (v) => v === 1);
  const combined = root.combineCalendars([none, ignore], { open: "all" });
  const paths: [string, (year: number) => unknown][] = [
    ["提供元のないカレンダー", (y) => none.holidaysInYear(y)],
    ['"ignore" のカレンダー', (y) => ignore.holidaysInYear(y)],
    ["提供元のないスケジュール", (y) => schedule.holidaysInYear(y)],
    ['"ignore" のスケジュール', (y) => ignoreSchedule.holidaysInYear(y)],
    ["スケジュールから作ったカレンダー", (y) => fromSchedule.holidaysInYear(y)],
    ["合成したカレンダー", (y) => combined.holidaysInYear(y)],
  ];
  for (const [label, f] of paths) {
    for (const year of [-1, 0, 999, 10000, 20026, 99999]) {
      assert.throws(
        () => f(year),
        (e: unknown) => root.isBizdaysError(e) && e.code === "out-of-range",
        `${label}(${year})`,
      );
    }
    // 範囲の中の年は今までどおり（提供元のない経路は空、"ignore" は対応年の外を祝日なし）
    assert.deepEqual(f(1000), [], `${label}(1000)`);
    assert.deepEqual(f(9999), [], `${label}(9999)`);
  }
  assert.equal(ignore.holidaysInYear(2026).length, jp.holidaysInYear(2026).length);
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
