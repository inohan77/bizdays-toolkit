import assert from "node:assert/strict";
import { test } from "node:test";
import { isBizdaysError } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";

const brief = (list: readonly { severity: string; code: string; path: string }[]) =>
  list.map((d) => [d.severity, d.code, d.path]);

const options = {
  holidays: jp,
  closedWeekdays: [0, 6],
  closedRecurring: [
    { weekday: 1, name: "月曜定休", effectiveTo: "2027-03-31" },
    { weekday: 2, name: "火曜定休", effectiveFrom: "2027-04-01" },
  ],
  closedAnnual: [
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
  // 順番は判定の優先順位（openDates → closedDates → closedAnnual → closedRecurring）
  assert.deepEqual(brief(diagnoseCalendar(options, { asOf: "2027-10-23" })), [
    ["info", "expired", "openDates[0]"],
    ["info", "expired", "closedDates[0]"],
    ["info", "expired", "closedDates[1]"],
    ["info", "expired", "closedAnnual[0]"],
    ["info", "expired", "closedRecurring[0]"],
  ]);
  // 終わりの日が基準日と同じなら expired ではない（その日まで有効）
  assert.deepEqual(brief(diagnoseCalendar(options, { asOf: "2026-12-31" })), [
    ["info", "expired", "openDates[0]"],
    ["info", "expired", "closedDates[0]"],
    ["info", "expired", "closedDates[1]"],
  ]);
  const d = diagnoseCalendar(options, { asOf: "2027-10-23" }).find(
    (x) => x.path === "closedRecurring[0]",
  )!;
  assert.match(d.message, /2027-03-31/);
  assert.match(d.message, /2027-10-23/);
});

test("asOf: スケジュールでも同じ。redundant などとは独立に返す", () => {
  const schedule = {
    holidays: jp,
    weekly: [0, 1, 1, 1, 1, 1, 0],
    dates: [{ date: "2026-01-02", value: 0 }],
    annual: [{ from: "08-13", to: "08-16", value: 0, effectiveTo: "2026-12-31" }],
    recurring: [{ weekday: 1, value: 2, effectiveTo: "2026-06-30" }],
  };
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2027-01-01" })), [
    ["info", "expired", "dates[0]"],
    ["info", "expired", "annual[0]"],
    ["info", "expired", "recurring[0]"],
  ]);
  assert.deepEqual(brief(diagnoseSchedule(schedule, { asOf: "2026-01-01" })), []);
});

test("asOf: 対応年の外の基準日でも例外にならず（祝日を引かない）、知らないキーは無視、誤りは例外", () => {
  assert.deepEqual(
    brief(diagnoseCalendar({ holidays: jp, closedDates: ["2026-01-02"] }, { asOf: "2200-01-01" })),
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
