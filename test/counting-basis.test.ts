// The texts of counting-basis of the diagnostics (the counting basis of nth business days leaves out recurring
// rules). The text differs for an opening and a closing weekly weekday rule, so both are checked (the branch
// weekly.value === true of src/core/diagnose.ts)
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseCalendar } from "../src/diagnose/index.ts";
import { JP_NARROW as jp } from "./support/provider.ts";

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

// 0.30.8: one item per used weekday rule whose effective period overlaps (other weekday rules do not affect the
// count).
// Pairs of two items whose effective periods do not overlap, and the counts, are checked in full by the oracle
// (test/diagnose-oracle.test.ts). What stays here are the forms the oracle does not try (outOfRangePolicy:
// "throw", sequences of three or more items)
const relatedOf = (options: Parameters<typeof diagnoseCalendar>[0]) =>
  countingBasis(options).map((d) => [d.path, d.relatedPath]);

test('counting-basis: 対応年の外で使われない曜日の規則では出さない（"ignore" では使われるので出す）', () => {
  const options = {
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ weekday: 3, effectiveTo: "2010-12-31" }, { businessDayOfMonth: 1 }],
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
  // The same rule written twice makes the later one shadowed and the earlier one not redundant (the sequential
  // removal removes shadowed rules first. decisions.md #31)
  assert.ok(!all.some((d) => d.code === "redundant" && d.path === "closedRecurringRules[1]"));
  assert.deepEqual(
    relatedOf({
      ...options,
      closedRecurringRules: [{ weekday: 3 }, { weekday: 3 }, { businessDayOfMonth: 1 }],
    }),
    [["closedRecurringRules[2]", "closedRecurringRules[0]"]],
  );
});
