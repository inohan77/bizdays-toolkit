import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, isBizdaysError } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";

const brief = (list: readonly { severity: string; code: string; path: string }[]) =>
  list.map((d) => [d.severity, d.code, d.path]);

const options = {
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedRecurringRules: [
    { weekday: 1, name: "月曜定休", effectiveTo: "2027-03-31" },
    { weekday: 2, name: "火曜定休", effectiveFrom: "2027-04-01" },
  ],
  closedAnnualDates: [
    { from: "08-13", to: "08-16", effectiveTo: "2026-12-31" },
    { from: "12-29", to: "01-03" },
  ],
  closedDates: [
    "2025-11-28",
    { from: "2026-07-13", to: "2026-07-16", name: "臨時休業" },
    "2028-11-27",
  ],
  openDates: ["2026-07-15"],
};

test("asOf: 基準日より前に終わった規則・日付が info の expired になる。省略時の結果は変わらない", () => {
  assert.deepEqual(brief(diagnoseCalendar(options)), [], "asOf なし");
  assert.deepEqual(brief(diagnoseCalendar(options, {})), [], "空のオプション");
  // 順番は判定の優先順位（openDates → closedDates → closedAnnualDates → closedRecurringRules）
  assert.deepEqual(brief(diagnoseCalendar(options, { asOf: "2027-10-23" })), [
    ["info", "expired", "openDates[0]"],
    ["info", "expired", "closedDates[0]"],
    ["info", "expired", "closedDates[1]"],
    ["info", "expired", "closedAnnualDates[0]"],
    ["info", "expired", "closedRecurringRules[0]"],
  ]);
  // 終わりの日が基準日と同じなら expired ではない（その日まで有効）
  assert.deepEqual(brief(diagnoseCalendar(options, { asOf: "2026-12-31" })), [
    ["info", "expired", "openDates[0]"],
    ["info", "expired", "closedDates[0]"],
    ["info", "expired", "closedDates[1]"],
  ]);
  const d = diagnoseCalendar(options, { asOf: "2027-10-23" }).find(
    (x) => x.path === "closedRecurringRules[0]",
  )!;
  assert.match(d.message, /2027-03-31/);
  assert.match(d.message, /2027-10-23/);
});

test("asOf: スケジュールでも同じ。redundant などとは独立に返す", () => {
  const schedule = {
    holidayProvider: jp,
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    dates: [{ date: "2026-01-02", value: 0 }],
    annualDates: [{ from: "08-13", to: "08-16", value: 0, effectiveTo: "2026-12-31" }],
    recurringRules: [{ weekday: 1, value: 2, effectiveTo: "2026-06-30" }],
  };
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2027-01-01" })), [
    ["info", "expired", "dates[0]"],
    ["info", "expired", "annualDates[0]"],
    ["info", "expired", "recurringRules[0]"],
  ]);
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2026-01-01" })), []);
});

test("asOf: 対応年の外の基準日でも例外にならず（祝日を引かない）、知らないキーは無視、誤りは例外", () => {
  assert.deepEqual(
    brief(
      diagnoseCalendar(
        { holidayProvider: jp, closedDates: ["2026-01-02"] },
        { asOf: "2200-01-01" },
      ),
    ),
    [["info", "expired", "closedDates[0]"]],
  );
  assert.deepEqual(
    brief(diagnoseCalendar({}, { asOf: "2026-10-23", future: true } as object)),
    [],
    "知らないキーは無視",
  );
  const cases: [unknown, string][] = [
    ["2026-10-23", "invalid-argument"],
    [null, "invalid-argument"],
    [[1], "invalid-argument"],
    [{ asOf: 20261023 }, "invalid-date"],
    [{ asOf: "2026-13-01" }, "invalid-date"],
    [{ asOf: new Date() }, "invalid-date"],
    [{ asOf: "2026-10-23T10:00" }, "invalid-date"],
  ];
  for (const [arg, code] of cases) {
    assert.throws(
      () => diagnoseCalendar({}, arg as never),
      (e: unknown) => isBizdaysError(e) && e.code === code,
      JSON.stringify(arg),
    );
  }
  // 設定の側の誤りは例外ではなく診断結果（扱いが分かれる）
  assert.equal(diagnoseCalendar("not an object" as never)[0]?.code, "invalid-option");
});

test('asOf: "after-holiday" の規則は、振替先が終わりの日の後に残るので、終わりから 31 日を過ぎるまで expired にしない', () => {
  // 7 月 20 日（海の日）で終わる月曜定休は、21 日に振り替わる（有効期間は振替元の日で判定する。13 番）
  const shifted = {
    holidayProvider: jp,
    closedRecurringRules: [
      {
        weekday: 1 as const,
        holidayOverlapPolicy: "after-holiday" as const,
        effectiveTo: "2026-07-20",
        name: "Mon",
      },
    ],
  };
  const info = createCalendar(shifted).dayInfoOn("2026-07-21");
  assert.equal(info.open, false);
  assert.equal(info.shiftedFrom, "2026-07-20");
  for (const asOf of ["2026-07-21", "2026-08-20"])
    assert.deepEqual(brief(diagnoseCalendar(shifted, { asOf })), [], asOf);
  // 31 日後（振替が届きうる最も遠い日）を過ぎれば expired。メッセージの終わりの日は effectiveTo のまま
  const d = diagnoseCalendar(shifted, { asOf: "2026-08-21" });
  assert.deepEqual(brief(d), [["info", "expired", "closedRecurringRules[0]"]]);
  assert.match(d[0]!.message, /ended on 2026-07-20/);
  // 振替のない規則は、今までどおり終わりの日の翌日から expired
  const plain = {
    ...shifted,
    closedRecurringRules: [{ weekday: 1 as const, effectiveTo: "2026-07-20", name: "Mon" }],
  };
  assert.deepEqual(brief(diagnoseCalendar(plain, { asOf: "2026-07-21" })), [
    ["info", "expired", "closedRecurringRules[0]"],
  ]);
  // スケジュールの規則も同じ
  const schedule = {
    holidayProvider: jp,
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    recurringRules: [
      {
        weekday: 1 as const,
        holidayOverlapPolicy: "after-holiday" as const,
        effectiveTo: "2026-07-20",
        value: 0,
      },
    ],
  };
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2026-07-21" })), []);
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2026-08-21" })), [
    ["info", "expired", "recurringRules[0]"],
  ]);
});

test("asOf: 終わりのない設定には、どの基準日でも expired を出さない", () => {
  // オラクルの expired のテストは、終わりが基準日より前の項目を含まない設定の診断を省くので、ここで確かめる
  const endless = {
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [
      { weekday: 1 as const, holidayOverlapPolicy: "after-holiday" as const },
      { dayOfMonth: 15, effectiveFrom: "2026-01-01" },
    ],
    closedAnnualDates: ["12-31", { from: "08-13", to: "08-16" }],
  };
  for (const asOf of ["1955-01-01", "2026-07-21", "2099-12-31", "2200-01-01"])
    assert.deepEqual(
      brief(diagnoseCalendar(endless, { asOf })).filter(([, code]) => code === "expired"),
      [],
      asOf,
    );
});
