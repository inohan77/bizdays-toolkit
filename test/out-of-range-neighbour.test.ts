// Rules that look at a neighbouring day, and the ends of the supported years (0.30.0. docs/decisions.md #17)
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
  // A provider without holidays (supported from 2000). The day before 2000-01-01 is outside the supported years
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

test('週の第 n 営業日は、週が対応年の外にかかる日を outOfRangePolicy: "throw" で out-of-range にする（週の 7 日を数えるため）', () => {
  const make = (outOfRangePolicy: "throw" | "ignore") =>
    createCalendar({
      holidayProvider: sg,
      outOfRangePolicy,
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ businessDayOfWeek: 1, weekStart: 1 }],
    });
  const first = sg.supportedYears.from;
  // The last week of December of the last year (the week reaches into the next year) and the first week of the
  // first year (the week starts in the previous year)
  const lastWeek = [27, 28, 29, 30, 31].map((d) => `${last}-12-${d}`);
  for (const date of [...lastWeek, `${first}-01-02`]) {
    assert.throws(() => make("throw").dayInfoOn(date), isOutOfRange, date);
    assert.doesNotThrow(() => make("ignore").dayInfoOn(date), date);
  }
  assert.throws(() => make("throw").lastBusinessDayOfMonth(`${last}-12`), isOutOfRange);
  assert.equal(
    make("throw").dayInfoOn(`${last}-12-20`).reason,
    "closed-recurring",
    "週が対応年の中",
  );
});
