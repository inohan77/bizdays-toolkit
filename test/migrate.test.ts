// 保存済みの設定の書き換え migrateCalendarOptions・migrateScheduleOptions（0.30.0）
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext, runInThisContext } from "node:vm";
import { createCalendar, createSchedule } from "../src/index.ts";
import {
  diagnoseCalendar,
  migrateCalendarOptions,
  migrateScheduleOptions,
} from "../src/diagnose/index.ts";
import { jp } from "../src/jp/index.ts";

const stored = {
  holidays: jp,
  closedAnnual: [{ date: "12-31" }],
  closedRecurring: [
    { day: 25, onHolidayRule: "after-holiday" },
    { holiday: true, kinds: ["national"] },
  ],
  custom: { keep: true },
};

test("migrateCalendarOptions: 旧名のキーと値を書き換え、位置は元の設定の旧名で返す", () => {
  const { options, changes } = migrateCalendarOptions(stored);
  assert.deepEqual(changes, [
    { path: "holidays", from: "holidays", to: "holidayProvider" },
    { path: "closedAnnual", from: "closedAnnual", to: "closedAnnualDates" },
    { path: "closedRecurring", from: "closedRecurring", to: "closedRecurringRules" },
    { path: "closedRecurring[0].day", from: "day", to: "dayOfMonth" },
    { path: "closedRecurring[0].onHolidayRule", from: "onHolidayRule", to: "holidayOverlapPolicy" },
    { path: "closedRecurring[1].kinds[0]", from: "national", to: "regular" },
  ]);
  assert.equal((options as { holidayProvider?: unknown }).holidayProvider, jp, "提供元は同じ参照");
  assert.deepEqual(
    (options as Record<string, unknown>)["custom"],
    { keep: true },
    "知らないキーはそのまま",
  );
  assert.notEqual(
    (options as Record<string, unknown>)["custom"],
    stored.custom,
    "普通のオブジェクトは複製",
  );
  assert.ok(!Object.isFrozen(options));
  assert.deepEqual(
    diagnoseCalendar(options).filter((d) => d.code === "deprecated-option"),
    [],
  );
  // 書き換えた設定は、旧名の設定と同じ結果になる
  const before = createCalendar(stored as never);
  const after = createCalendar(options);
  assert.deepEqual(
    after.daysBetween("2026-01-01", "2026-12-31"),
    before.daysBetween("2026-01-01", "2026-12-31"),
  );
  // 何度当てても同じ（新しい名前だけの設定では changes が空）
  const again = migrateCalendarOptions(options);
  assert.deepEqual(again.changes, []);
  assert.deepEqual(again.options, options);
});

test("migrateCalendarOptions: 旧名と新しい名前の両方があるキーは書き換えず conflicting を返す", () => {
  const { options, changes } = migrateCalendarOptions({ closedAnnual: [], closedAnnualDates: [] });
  assert.deepEqual(changes, [
    { path: "closedAnnual", from: "closedAnnual", to: "closedAnnualDates", conflicting: true },
  ]);
  assert.deepEqual(Object.keys(options), ["closedAnnual", "closedAnnualDates"]);
  assert.throws(() => migrateCalendarOptions(null as never), /options must be a plain object/);
});

test("移行: 旧名と新しい名前のどちらかが明示的な undefined なら衝突にせず、値のあるほうを新しい名前で残す（キーの順番によらない）。changes の要素も凍結する（decisions.md の 4 番・6 番）", () => {
  const show = (v: unknown): string =>
    JSON.stringify(v, (_k, x: unknown) => (x === undefined ? "<undefined>" : x));
  const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    [
      "旧名に値・後ろに新しい名前の undefined",
      { closedAnnual: ["12-31"], closedAnnualDates: undefined },
      { closedAnnualDates: ["12-31"] },
    ],
    [
      "新しい名前の undefined・後ろに旧名に値",
      { closedAnnualDates: undefined, closedAnnual: ["12-31"] },
      { closedAnnualDates: ["12-31"] },
    ],
    [
      "旧名の undefined・後ろに新しい名前に値",
      { closedAnnual: undefined, closedAnnualDates: ["12-31"] },
      { closedAnnualDates: ["12-31"] },
    ],
    [
      "新しい名前に値・後ろに旧名の undefined",
      { closedAnnualDates: ["12-31"], closedAnnual: undefined },
      { closedAnnualDates: ["12-31"] },
    ],
  ];
  for (const [label, options, expected] of cases) {
    const { options: out, changes } = migrateCalendarOptions(options as never);
    assert.equal(show(out), show(expected), label);
    assert.deepEqual(
      changes.map((c) => ({ ...c })),
      [{ path: "closedAnnual", from: "closedAnnual", to: "closedAnnualDates" }],
      label,
    );
    // 作成と同じ読み方: 書き換えた設定の結果は元の設定と同じで、旧名の診断も残らない
    assert.equal(
      createCalendar(out).isBusinessDay("2026-12-31"),
      createCalendar(options as never).isBusinessDay("2026-12-31"),
      label,
    );
    assert.deepEqual(
      diagnoseCalendar(out).map((d) => d.code),
      [],
      label,
    );
  }
  // 両方に値があれば、今までどおり衝突（書き換えない）
  const conflict = migrateCalendarOptions({
    closedAnnual: ["12-31"],
    closedAnnualDates: ["12-30"],
  } as never);
  assert.deepEqual(
    conflict.changes.map((c) => ({ ...c })),
    [{ path: "closedAnnual", from: "closedAnnual", to: "closedAnnualDates", conflicting: true }],
  );
  assert.deepEqual(Object.keys(conflict.options), ["closedAnnual", "closedAnnualDates"]);
  // changes の配列と要素は凍結する（options は保存し直すためのもので凍結しない）
  for (const result of [
    migrateCalendarOptions({ closedAnnual: [], maxSearchDays: 10 } as never),
    migrateScheduleOptions({ weekdayValues: [1, 1, 1, 1, 1, 1, 1], holiday: "weekday" } as never),
  ]) {
    assert.ok(result.changes.length > 0);
    assert.ok(Object.isFrozen(result.changes));
    for (const change of result.changes) assert.ok(Object.isFrozen(change), change.path);
  }
});

test('migrateScheduleOptions: holiday の "weekday" は holidayPolicy の "ignore"、値は同じ参照', () => {
  const value = { open: "10:00" };
  const { options, changes } = migrateScheduleOptions<unknown>({
    weekly: [value, value, value, value, value, value, value],
    holiday: "weekday",
    recurring: [{ day: -1, value }],
  });
  assert.deepEqual(changes, [
    { path: "weekly", from: "weekly", to: "weekdayValues" },
    { path: "holiday", from: "holiday", to: "holidayPolicy" },
    { path: "recurring", from: "recurring", to: "recurringRules" },
    { path: "recurring[0].day", from: "day", to: "dayOfMonth" },
    { path: "holiday", from: "weekday", to: "ignore" },
  ]);
  assert.equal(options.recurringRules![0]!.value, value, "スケジュールの値は複製しない");
  assert.equal(options.weekdayValues[0], value, "曜日ごとの値も複製しない");
  assert.equal(createSchedule(options).valueOn("2026-10-31"), value);
});

test("移行: 別の実行環境で作った設定も、入れ子の規則まで同じ実行環境の設定と同じに書き換え、入力の規則を共有しない（decisions.md の 8 番）", () => {
  // [名前, 関数, 設定の式, 書き換えた後の規則の一覧のキー, 旧名の規則の一覧のキー]
  const cases: [
    string,
    (o: object) => { options: object; changes: unknown },
    string,
    string,
    string,
  ][] = [
    [
      "migrateCalendarOptions",
      migrateCalendarOptions,
      "({ closedRecurring: [{ day: 1 }, { weekday: 1, nth: 2 }], maxSearchDays: 100 })",
      "closedRecurringRules",
      "closedRecurring",
    ],
    [
      "migrateScheduleOptions",
      migrateScheduleOptions,
      '({ weekly: ["c", "o", "o", "o", "o", "o", "c"], holiday: "weekday", recurring: [{ day: -1, value: { open: "10:00" } }] })',
      "recurringRules",
      "recurring",
    ],
  ];
  for (const [name, migrate, source, to, from] of cases) {
    // 同じ式を、この実行環境と別の実行環境で評価する
    const local = runInThisContext(source) as Record<string, unknown>;
    const foreign = runInNewContext(source) as Record<string, unknown>;
    const a = migrate(local);
    const b = migrate(foreign);
    assert.equal(JSON.stringify(b.options), JSON.stringify(a.options), name);
    assert.deepEqual(b.changes, a.changes, name);
    const before = (foreign[from] as Record<string, unknown>[])[0]!;
    const after = (b.options as Record<string, Record<string, unknown>[]>)[to]![0]!;
    assert.notEqual(after, before, `${name}: 規則は複製する`);
    if ("value" in before)
      assert.equal(after["value"], before["value"], `${name}: スケジュールの値は複製しない`);
  }
});
