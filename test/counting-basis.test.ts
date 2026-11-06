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

// 0.30.8: 有効期間が重なり、使われている曜日の規則ごとに 1 件（それ以外の曜日の規則は数え方に影響しない）。
// 有効期間が重ならない 2 項目の組と件数はオラクル（test/diagnose-oracle.test.ts）が全件で確かめる。ここに残すのは、
// オラクルが試さない形（outOfRangePolicy: "throw"、3 項目以上の並び）だけ
const relatedOf = (options: Parameters<typeof diagnoseCalendar>[0]) =>
  countingBasis(options).map((d) => [d.path, d.relatedPath]);

test('counting-basis: 対応年の外で使われない曜日の規則では出さない（"ignore" では使われるので出す）', () => {
  const options = {
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ weekday: 3, effectiveTo: "1950-12-31" }, { businessDayOfMonth: 1 }],
  } as const;
  assert.deepEqual(relatedOf(options), []);
  assert.deepEqual(
    diagnoseCalendar(options).map((d) => [d.code, d.path]),
    [["out-of-range", "closedRecurringRules[0]"]],
  );
  assert.deepEqual(relatedOf({ ...options, outOfRangePolicy: "ignore" }), [
    ["closedRecurringRules[1]", "closedRecurringRules[0]"],
  ]);
});

test("counting-basis: 曜日の規則が 2 つなら 2 件出す", () => {
  assert.deepEqual(
    relatedOf({
      holidayProvider: jp,
      closedWeekdays: [0],
      closedRecurringRules: [{ weekday: 3 }, { weekday: 6 }, { businessDayOfMonth: 1 }],
    }),
    [
      ["closedRecurringRules[2]", "closedRecurringRules[0]"],
      ["closedRecurringRules[2]", "closedRecurringRules[1]"],
    ],
  );
});

test("counting-basis: 開く規則と閉じる規則に 1 つずつなら 2 件出す", () => {
  assert.deepEqual(
    relatedOf({
      holidayProvider: jp,
      closedWeekdays: [0, 6],
      openRecurringRules: [{ weekday: 6 }],
      closedRecurringRules: [{ weekday: 3 }, { businessDayOfMonth: 1 }],
    }),
    [
      ["closedRecurringRules[1]", "openRecurringRules[0]"],
      ["closedRecurringRules[1]", "closedRecurringRules[0]"],
    ],
  );
});

test("counting-basis: 第 n 営業日の規則より後ろの曜日の規則が shadowed でも、使われている規則だけを数える（並び順で変わらない）", () => {
  const options = {
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: 1 }, { weekday: 3 }, { weekday: 3 }],
  } as const;
  assert.deepEqual(relatedOf(options), [["closedRecurringRules[0]", "closedRecurringRules[1]"]]);
  const all = diagnoseCalendar(options);
  assert.ok(
    all.some(
      (d) =>
        d.code === "shadowed" &&
        d.path === "closedRecurringRules[2]" &&
        d.relatedPath === "closedRecurringRules[1]",
    ),
  );
  assert.ok(all.some((d) => d.code === "redundant" && d.path === "closedRecurringRules[1]"));
  assert.deepEqual(
    relatedOf({
      ...options,
      closedRecurringRules: [{ weekday: 3 }, { weekday: 3 }, { businessDayOfMonth: 1 }],
    }),
    [["closedRecurringRules[2]", "closedRecurringRules[0]"]],
  );
});
