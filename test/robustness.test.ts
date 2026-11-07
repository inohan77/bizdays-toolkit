import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
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
import { migrateCalendarOptions } from "../src/diagnose/index.ts";
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
  "invalid-input": [() => isHoliday(20261123 as unknown as string)],
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
