import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import {
  addDays,
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  toInstant,
  createSchedule,
  isBizdaysError,
  type Holiday,
  type HolidayProvider,
} from "../src/index.ts";
import { holidaysInYear, isHoliday, jp } from "../src/jp/index.ts";
import { withSubstituteDays } from "../src/provider/index.ts";
import {
  diagnoseCalendar,
  diagnoseSchedule,
  migrateCalendarOptions,
} from "../src/diagnose/index.ts";
import { IssueCollector } from "../src/core/errors.ts";
import { compileCalendarOptions } from "../src/core/calendar.ts";

/** 例外が code を持ち、表のクラス（classOf）のインスタンスであることを確かめる */
function throwsCode(
  fn: () => unknown,
  code: string,
  cls: ErrorConstructor = RangeError,
  label = code,
): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(isBizdaysError(error), `${label}: expected a bizdays error, got ${String(error)}`);
      assert.equal(error.code, code, label);
      assert.ok(
        error instanceof cls,
        `${label}: expected ${cls.name}, got ${error.constructor.name}`,
      );
      return true;
    },
    `${label}: no exception`,
  );
}

/**
 * code ごとの例外のクラスの表（docs/decisions.md の 3 番・src/core/errors.ts の冒頭）。invalid-input だけが TypeError で、
 * ほかのすべての code は RangeError。code ごとに、引数の型の誤りと値の誤りの両方の経路（あれば）で投げさせる
 */
const classOf = (code: string): ErrorConstructor =>
  code === "invalid-input" ? TypeError : RangeError;
const notAProvider = { id: "X" } as unknown as HolidayProvider;
const badDataProvider = {
  id: "BAD",
  timeZone: "Asia/Tokyo",
  dataVersion: "1",
  supportedYears: { from: 2026, to: 2026 },
  holidaysInYear: () => [{ date: "2026-13-01" } as unknown as Holiday],
} as HolidayProvider;
const TRIGGERS: Readonly<Record<string, readonly (() => unknown)[]>> = {
  "invalid-date": [
    () => addDays("2026-13-01", 1),
    () => isHoliday("2026/11/23"),
    () => toInstant(20261123 as unknown as string, "10:00", "UTC"),
  ],
  "invalid-month": [() => createCalendar().nthBusinessDayOfMonth("2026-13", 1)],
  "invalid-annual-date": [() => createCalendar({ closedAnnualDates: ["02-30"] })],
  "invalid-time": [
    () => isHoliday("2026-11-23T25:00"),
    () => createCalendar().businessDayOnOrAfter("2026-10-10T10:00", { cutoff: "25:00" }),
  ],
  "invalid-input": [
    () => isHoliday(20261123 as unknown as string),
    // ISO 以外の暦の Temporal の形（受け付けない種類の入力の、もう 1 つの経路）
    () => isHoliday({ year: 2026, month: 11, day: 23, calendarId: "japanese" } as never),
  ],
  "invalid-time-zone": [() => createCalendar({ timeZone: "Asia/Nowhere" })],
  "invalid-range": [
    () => createCalendar({ closedDates: [{ from: "2026-12-31", to: "2026-12-01" }] }),
  ],
  "invalid-weekday": [() => createCalendar({ closedWeekdays: [7 as 0] })],
  "invalid-argument": [
    () => addDays("2026-01-01", 1.5),
    () => withSubstituteDays("x" as never, { directions: {}, kind: "s" }),
    () => withSubstituteDays([], null as never),
    () => migrateCalendarOptions(null as never),
    () => createCalendarFromSchedule({} as never, () => true),
    () => createCalendar().businessDayOnOrAfter("2026-10-10", { cutoff: "10:00" }),
  ],
  "invalid-option": [() => createCalendar({ searchDayLimit: 0 })],
  "time-zone-conflict": [
    () =>
      combineCalendars(
        [createCalendar({ timeZone: "Asia/Tokyo" }), createCalendar({ timeZone: "UTC" })],
        { open: "all" },
      ),
  ],
  "out-of-range": [() => holidaysInYear(2100)],
  "unconfirmed-holiday": [
    () =>
      createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "throw" }).isBusinessDay(
        "2099-03-20",
      ),
  ],
  "invalid-provider": [() => createCalendar({ holidayProvider: notAProvider })],
  "invalid-provider-data": [
    () => createCalendar({ holidayProvider: badDataProvider }).isBusinessDay("2026-01-01"),
  ],
  "no-business-day": [
    () =>
      createCalendar({ closedWeekdays: [0, 1, 2, 3, 4, 5, 6], searchDayLimit: 10 }).nextBusinessDay(
        "2026-01-01",
      ),
  ],
  "no-closed-day": [() => createCalendar({ searchDayLimit: 10 }).nextClosedDay("2026-01-01")],
};

test("例外のクラスは code ごとの表のとおり（invalid-input だけが TypeError、ほかは RangeError）で、すべての code を確かめる", () => {
  // 確かめる code は、src/core/errors.ts の KnownErrorCode のすべて（表に漏れがあれば失敗）
  const source = readFileSync(new URL("../src/core/errors.ts", import.meta.url), "utf8");
  const union = /export type KnownErrorCode =([\s\S]*?);/.exec(source)![1]!;
  const codes = [...union.matchAll(/\| "([a-z-]+)"/g)].map((m) => m[1]!);
  assert.deepEqual(Object.keys(TRIGGERS).sort(), [...codes].sort(), "表の code と KnownErrorCode");
  for (const [code, triggers] of Object.entries(TRIGGERS))
    triggers.forEach((fn, i) => throwsCode(fn, code, classOf(code), `${code} の ${i} 番目`));
});

test("例外のクラスの静的な検査: src で typeError に渡す code は invalid-input だけで、rangeError と設定の誤りの記録（.error）に invalid-input を渡さない（decisions.md の 3 番。上の表は経路を人が挙げるので、取りこぼしても止まるように）", () => {
  const dir = new URL("../src/", import.meta.url);
  const files = (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.replaceAll("\\", "/"));
  const found: Record<string, Set<string>> = {
    typeError: new Set(),
    rangeError: new Set(),
    error: new Set(),
  };
  const notLiteral: string[] = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, dir), "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee)
            ? callee.name.text
            : "";
        if (name === "typeError" || name === "rangeError" || name === "error") {
          const first = node.arguments[0]!;
          const where = `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
          if (ts.isStringLiteral(first)) found[name]!.add(first.text);
          // 文字列でない code は、typeError では許さない（rangeError は記録した誤りを投げ直す経路で使う）
          else if (name === "typeError") notLiteral.push(where);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual([...found["typeError"]!], ["invalid-input"], "typeError の code");
  assert.ok(!found["rangeError"]!.has("invalid-input"), "rangeError に invalid-input");
  assert.ok(!found["error"]!.has("invalid-input"), "設定の誤りの記録に invalid-input");
  assert.deepEqual(notLiteral, [], "typeError に文字列でない code");
  assert.ok(found["rangeError"]!.size > 10, "rangeError の呼び出しを見つけられていない");
});

test("曜日の番号の誤り: 曜日を受けるすべての項目で、要素の値の誤りは invalid-weekday（作成も診断も。decisions.md の 8 番）。空の配列・書き忘れは invalid-option", () => {
  // 各項目の値の誤りが報告される設定の中の位置（ガイドの「メッセージに設定の中の位置が入る」）
  const paths: Record<string, string> = {
    closedWeekdays: "closedWeekdays[0]",
    weekday: "closedRecurringRules[0].weekday",
    weekStart: "closedRecurringRules[0].weekStart",
    weekdays: "closedRecurringRules[0].weekdays",
    skipWeekdays: "closedRecurringRules[0].skipWeekdays",
    sameAs: "holidayPolicy.sameAs",
  };
  // 曜日を受ける項目と、その項目に誤った値 v を書いた設定（ほかの項目は正しい）
  const places: Record<
    string,
    (v: unknown) => [kind: "calendar" | "schedule", options: Record<string, unknown>]
  > = {
    closedWeekdays: (v) => ["calendar", { closedWeekdays: [v] }],
    weekday: (v) => ["calendar", { closedRecurringRules: [{ weekday: v }] }],
    weekStart: (v) => [
      "calendar",
      { closedRecurringRules: [{ businessDayOfWeek: 1, weekStart: v }] },
    ],
    weekdays: (v) => [
      "calendar",
      { holidayProvider: jp, closedRecurringRules: [{ holiday: true, weekdays: [v] }] },
    ],
    skipWeekdays: (v) => [
      "calendar",
      { holidayProvider: jp, closedRecurringRules: [{ dayAfterHoliday: true, skipWeekdays: [v] }] },
    ],
    sameAs: (v) => [
      "schedule",
      { weekdayValues: [1, 1, 1, 1, 1, 1, 1], holidayProvider: jp, holidayPolicy: { sameAs: v } },
    ],
  };
  // 表とソースの突き合わせ: isWeekday で曜日を確かめる箇所が読む項目が、表の項目とそろっていること
  const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
  const sites = [read("../src/core/calendar.ts"), read("../src/core/schedule.ts")].flatMap(
    (text) => {
      const lines = text.split("\n");
      return lines.flatMap((line, i) => {
        const near = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
        // 呼び出し（isWeekday(…)）と、checkSet に渡す引数（isWeekday,）。import の行と定義は除く
        const call = /\bisWeekday\(/.test(line) && !/export const isWeekday/.test(line);
        const passed = line.trim() === "isWeekday," && /checkSet\(/.test(near);
        if (!call && !passed) return [];
        const hit = Object.keys(places).filter((k) => new RegExp(`\\b${k}\\b`).test(near));
        return [hit.length === 1 ? hit[0]! : `?${i + 1}: ${line.trim()}`];
      });
    },
  );
  assert.deepEqual(
    [...new Set(sites)].sort(),
    Object.keys(places).sort(),
    "isWeekday の箇所と表の項目",
  );
  const create = (kind: "calendar" | "schedule", o: Record<string, unknown>): void =>
    void (kind === "calendar" ? createCalendar(o as never) : createSchedule(o as never));
  const diagnose = (kind: "calendar" | "schedule", o: Record<string, unknown>) =>
    kind === "calendar" ? diagnoseCalendar(o as never) : diagnoseSchedule(o as never);
  for (const [place, build] of Object.entries(places)) {
    for (const v of [7, -1, 1.5, "1"]) {
      const [kind, options] = build(v);
      const label = `${place}: ${JSON.stringify(v)}`;
      assert.throws(
        () => create(kind, options),
        (e: unknown) =>
          e instanceof RangeError &&
          isBizdaysError(e) &&
          e.code === "invalid-weekday" &&
          e.message.startsWith(`${paths[place]}: `),
        label,
      );
      assert.deepEqual(
        diagnose(kind, options)
          .filter((d) => d.severity === "error")
          .map((d) => `${d.code} ${d.path}`),
        [`invalid-weekday ${paths[place]}`],
        label,
      );
    }
  }
  // 値の種類の誤りでないもの（空の配列・必須の項目の書き忘れ）は invalid-option のまま
  for (const options of [
    { holidayProvider: jp, closedRecurringRules: [{ holiday: true, weekdays: [] }] },
    { holidayProvider: jp, closedRecurringRules: [{ dayAfterHoliday: true, skipWeekdays: [] }] },
    { closedRecurringRules: [{ businessDayOfWeek: 1 }] },
  ])
    assert.throws(
      () => createCalendar(options as never),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-option",
      JSON.stringify(options),
    );
});

test("設定の誤りのメッセージには、設定の中の位置が入る", () => {
  assert.throws(
    () => createCalendar({ closedDates: ["2026-12-01", "2026-12-32"] }),
    /closedDates\[1\]\.date/,
  );
  assert.throws(
    () =>
      createSchedule({
        weekdayValues: [0, 0, 0, 0, 0, 0, 0],
        dates: [{ date: "2026-01-01" } as never],
      }),
    /dates\[0\]: must have "value"/,
  );
});

test("isBizdaysError はほかの例外を区別する", () => {
  assert.equal(isBizdaysError(new RangeError("x")), false);
  assert.equal(isBizdaysError(Object.assign(new Error("x"), { code: "invalid-date" })), false);
  assert.equal(isBizdaysError("invalid-date"), false);
});

test("作ったあとに元の設定を書き換えても、結果は変わらない", () => {
  const weekly: [number, number, number, number, number, number, number] = [0, 1, 1, 1, 1, 1, 0];
  const closedDates = ["2026-10-14"];
  const holiday = { sameAs: 0 as const };
  const schedule = createSchedule({
    weekdayValues: weekly,
    holidayPolicy: holiday,
    holidayProvider: jp,
  });
  const calendar = createCalendar({ closedDates });

  weekly[3] = 99;
  closedDates.push("2026-10-15");
  (holiday as { sameAs: number }).sameAs = 3;

  assert.equal(schedule.valueOn("2026-10-14"), 1, "水曜の値は作った時点の 1 のまま");
  assert.equal(schedule.valueOn("2026-11-03"), 0, "祝日は作った時点の sameAs: 0（日曜）のまま");
  assert.equal(calendar.isBusinessDay("2026-10-15"), true, "あとから足した臨時休業日は効かない");
  assert.equal(calendar.isBusinessDay("2026-10-14"), false);
});

test("別の実行環境（vm）で作られた Date も受け付ける", () => {
  const foreign = runInNewContext('new Date("2026-11-22T15:30:00Z")') as Date;
  assert.equal(foreign instanceof Date, false, "前提: instanceof では判定できない");
  assert.equal(isHoliday(foreign), true);
});

test("設定の知らないキーは、作成時は無視し、内部では警告として記録する", () => {
  const calendar = createCalendar({ closedWeekday: [0] } as never);
  assert.equal(
    calendar.isBusinessDay("2026-10-11"),
    true,
    "打ち間違いのキーは効かない（無視される）",
  );
  const c = new IssueCollector();
  compileCalendarOptions(c, {
    closedWeekday: [0],
    closedDates: [{ date: "2026-01-01", nmae: "x" }],
  });
  assert.deepEqual(
    c.issues.map((i) => [i.severity, i.code, i.path]),
    [
      ["warning", "unknown-option", "closedWeekday"],
      ["warning", "unknown-option", "closedDates[0].nmae"],
    ],
  );
});

function provider(
  holidays: (year: number) => unknown,
  overrides: Partial<HolidayProvider> = {},
): HolidayProvider {
  return {
    id: "XX",
    timeZone: "UTC",
    supportedYears: { from: 2000, to: 2100 },
    dataVersion: "test",
    holidaysInYear: holidays as (year: number) => readonly Holiday[],
    ...overrides,
  };
}

const ok = (date: string) => ({ date, name: "n", nameEn: "n", kind: "public", confirmed: true });

test("祝日の提供元の形式を、作る時点で検証する", () => {
  throwsCode(
    () => createCalendar({ holidayProvider: provider(() => [], { id: "" }) }),
    "invalid-provider",
  );
  throwsCode(
    () =>
      createCalendar({
        holidayProvider: provider(() => [], { supportedYears: { from: 2100, to: 2000 } }),
      }),
    "invalid-provider",
  );
  throwsCode(
    () => createCalendar({ holidayProvider: provider(() => [], { timeZone: "Nowhere/City" }) }),
    "invalid-provider",
  );
  throwsCode(
    () => createCalendar({ holidayProvider: [jp, provider(() => [])] }),
    "time-zone-conflict",
  );
});

test("祝日の提供元が返したデータを、年ごとに初めて使うときに検証する", () => {
  const cases: [string, (year: number) => unknown][] = [
    ["配列でない", () => ({})],
    ["日付の形式の誤り", () => [{ ...ok("2026-1-1") }]],
    ["別の年の日付", () => [ok("2025-12-31")]],
    ["同じ日付が 2 件", () => [ok("2026-05-01"), ok("2026-05-01")]],
    ["confirmed がない", () => [{ date: "2026-05-01", name: "n", nameEn: "n", kind: "public" }]],
  ];
  for (const [label, fn] of cases) {
    const calendar = createCalendar({ holidayProvider: provider(fn) });
    assert.throws(
      () => calendar.isHoliday("2026-05-01"),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-provider-data",
      label,
    );
  }
});

test("提供元が返した祝日は、契約の項目だけを持つ変更できないオブジェクトになる", () => {
  const calendar = createCalendar({
    holidayProvider: provider(() => [{ ...ok("2026-05-01"), extra: 1 }]),
  });
  const h = calendar.holidayOn("2026-05-01");
  assert.deepEqual(h, ok("2026-05-01"));
  assert.ok(Object.isFrozen(h));
  // 順序の乱れた提供元でも、一覧は日付順になる
  const unordered = createCalendar({
    holidayProvider: provider(() => [ok("2026-12-01"), ok("2026-01-01")]),
  });
  assert.deepEqual(
    unordered.holidaysInYear(2026).map((x) => x.date),
    ["2026-01-01", "2026-12-01"],
  );
});

test("日本の祝日も、提供元の検証を通る", () => {
  for (let y = jp.supportedYears.from; y <= jp.supportedYears.to; y++) holidaysInYear(y);
});
