// 保存済みの設定の書き換え migrateCalendarOptions・migrateScheduleOptions（0.30.0）
import assert from "node:assert/strict";
import { test } from "node:test";
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
