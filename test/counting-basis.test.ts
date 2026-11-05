// 診断の counting-basis の文（第 n 営業日の数える基準は繰り返しの規則を除く）。毎週の曜日の規則が開く規則か
// 閉じる規則かで文を分けているので、両側の文を確かめる（src/core/diagnose.ts の weekly.value === true の分岐）
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseCalendar } from "../src/diagnose/index.ts";
import { jp } from "../src/jp/index.ts";

const countingBasis = (options: Parameters<typeof diagnoseCalendar>[0]) =>
  diagnoseCalendar(options).filter((d) => d.code === "counting-basis");

test("counting-basis: 毎週の曜日を開く規則なら、その曜日は数えないと知らせる", () => {
  const list = countingBasis({
    closedWeekdays: [0, 6],
    openRecurringRules: [{ weekday: 6 }],
    closedRecurringRules: [{ businessDayOfMonth: 1 }],
  });
  assert.equal(list.length, 1);
  assert.equal(list[0]!.path, "closedRecurringRules[0]");
  assert.equal(
    list[0]!.message,
    "The business days are counted without recurring rules, so the days opened by the weekday rule openRecurringRules[0] are not counted",
  );
});

test("counting-basis: 毎週の曜日を閉じる規則なら、数を減らさないので closedWeekdays に書くよう知らせる", () => {
  const list = countingBasis({
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ weekday: 3 }, { businessDayOfMonth: 1 }],
  });
  assert.equal(list.length, 1);
  assert.equal(list[0]!.path, "closedRecurringRules[1]");
  assert.equal(
    list[0]!.message,
    "The business days are counted without recurring rules, so the weekday rule closedRecurringRules[0] does not reduce the count; " +
      "write regular closed weekdays as closedWeekdays if they should not be counted",
  );
});

test("counting-basis: 週の第 n 営業日の規則（businessDayOfWeek）でも、毎週の曜日の規則があれば知らせる", () => {
  const list = countingBasis({
    holidayProvider: jp,
    closedRecurringRules: [{ businessDayOfWeek: -1, weekStart: 1 }, { weekday: 0 }],
  });
  assert.equal(list.length, 1);
  assert.equal(list[0]!.path, "closedRecurringRules[0]");
  assert.equal(list[0]!.relatedPath, "closedRecurringRules[1]");
});
