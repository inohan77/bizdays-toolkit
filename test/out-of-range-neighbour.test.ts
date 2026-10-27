// 隣の日を見る規則と対応年の端（0.30.0。docs/decisions.md の 54 番の D2）
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule } from "../src/index.ts";
import { diagnoseSchedule } from "../src/diagnose/index.ts";
import { sg } from "../src/sg/index.ts";

const isOutOfRange = (e: Error & { code?: string }) => e.code === "out-of-range";
const last = sg.supportedYears.to;

test('outOfRangePolicy: "throw" なら、隣の日が対応年の外の祝前日・祝日の翌日・振替は out-of-range', () => {
  const values = ["9-18", "9-18", "9-18", "9-18", "9-18", "9-18", "9-18"] as const;
  const make = (outOfRangePolicy: "throw" | "ignore") =>
    createSchedule<string>({
      holidayProvider: sg,
      outOfRangePolicy,
      weekdayValues: values,
      recurringRules: [{ dayBeforeHoliday: true, keys: ["new-year"], value: "9-13" }],
    });
  assert.equal(make("throw").valueOn(`${last - 1}-12-31`), "9-13", "翌年の元日が対応年の中");
  assert.throws(() => make("throw").valueOn(`${last}-12-31`), isOutOfRange);
  assert.equal(make("ignore").valueOn(`${last}-12-31`), "9-18", "ignore では外は祝日なし");
  // 祝日のない提供元（対応年は 2000 年から）。2000-01-01 の前日は対応年の外
  const empty = {
    id: "XX",
    timeZone: "UTC",
    supportedYears: { from: 2000, to: 2100 },
    dataVersion: "test",
    holidaysInYear: () => [],
  };
  const afterHoliday = createCalendar({
    holidayProvider: empty,
    closedRecurringRules: [{ dayAfterHoliday: true }],
  });
  assert.throws(() => afterHoliday.isBusinessDay("2000-01-01"), isOutOfRange);
  assert.equal(afterHoliday.isBusinessDay("2000-01-02"), true);
  const shifted = createCalendar({
    holidayProvider: empty,
    closedRecurringRules: [{ weekday: 1, holidayOverlapPolicy: "after-holiday" }],
  });
  assert.throws(() => shifted.isBusinessDay("2000-01-01"), isOutOfRange);
});

test("診断は対応年の外を祝日なしとして扱い、走査の端で out-of-range にしない", () => {
  const list = diagnoseSchedule({
    holidayProvider: sg,
    weekdayValues: [1, 1, 1, 1, 1, 1, 1],
    recurringRules: [{ dayBeforeHoliday: true, value: 0 }],
  });
  assert.deepEqual(
    list.filter((d) => d.code === "out-of-range"),
    [],
  );
});
