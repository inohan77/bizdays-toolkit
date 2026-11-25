// Paths that reach the catch clauses of the diagnostics (T3 of the test expansion plan;
// scripts/check-catch-coverage.ts checks that the catch clauses of src/core are taken by the tests).
// A provider that starts throwing part-way (throwingAfter of test/support/faulty.ts) is outside the provider
// contract (the same result for the same year), so the content of the diagnostics is undefined (the section of
// docs/providers.ja.md on the provider contract and the handling of mistakes). Here it is only checked that the
// diagnostics return a list without throwing and report an error thrown during the diagnostics between rules as
// an error.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { throwingAfter } from "./support/faulty.ts";

/**
 * Options with rules that depend on holidays, nth-business-day rules, moves, specific dates and rules compared by
 * removal (candidates for redundant)
 */
const CONFIGS: readonly Record<string, unknown>[] = [
  { closedRecurringRules: [{ holiday: true, months: [5] }, { holiday: true }] },
  { closedRecurringRules: [{ dayAfterHoliday: true }, { dayAfterHoliday: true, months: [1] }] },
  {
    closedRecurringRules: [{ businessDayOfMonth: 1 }, { weekday: 3 }],
    closedDates: ["2026-02-02"],
  },
  {
    closedRecurringRules: [
      { weekday: 1, holidayOverlapPolicy: "after-holiday" },
      { weekday: 1, months: [2] },
    ],
  },
  {
    holidayPolicy: "open",
    closedRecurringRules: [
      { dayOfMonth: 5 },
      { dayOfMonth: 5, months: [3] },
      { holiday: true, kinds: ["regular"] },
    ],
    openDates: ["2026-05-04"],
  },
  {
    closedRecurringRules: [
      { dayBeforeHoliday: true, skipWeekdays: [0, 6] },
      { cycle: 3, anchor: "2026-01-01", positions: [1] },
    ],
    closedDates: ["2026-05-01"],
  },
];

test("診断の catch 節: 途中から例外を投げる提供元でも、診断は例外を投げずに一覧を返す", () => {
  let reported = 0;
  // The combinations that reach them (the number of calls after which it throws, the year in which it throws).
  // Throwing in every year reaches the catch clauses of the judgement of holiday rules and of the whole of the
  // diagnostics between rules; throwing in 2026 only reaches the catch clause for the value of each day (checked
  // with scripts/check-catch-coverage.ts)
  for (const [calls, year] of [
    [1, undefined],
    [2, undefined],
    [1, 2026],
  ] as const)
    for (const options of CONFIGS) {
      const provider = throwingAfter(calls, year === undefined ? {} : { year });
      const list = diagnoseCalendar({ holidayProvider: provider, ...options });
      assert.ok(Array.isArray(list));
      if (list.some((d) => d.severity === "error" && d.path === "holidayProvider")) reported++;
      const schedule = diagnoseSchedule({
        holidayProvider: throwingAfter(calls, year === undefined ? {} : { year }),
        weekdayValues: ["c", "o", "o", "o", "o", "o", "c"],
        holidayPolicy: { value: "h" },
        recurringRules: ((options["closedRecurringRules"] as Record<string, unknown>[]) ?? []).map(
          (r) => ({
            ...r,
            value: "x",
          }),
        ),
      });
      assert.ok(Array.isArray(schedule));
    }
  // An error thrown during the diagnostics between rules has a path that discards the intermediate results and
  // reports it as an error
  assert.ok(
    reported > 0,
    "規則どうしの診断の途中の例外を error として報告した設定がない（空振り）",
  );
});

test("診断の catch 節: 途中から投げた例外の code が out-of-range なら、out-of-range として報告する", () => {
  const list = diagnoseCalendar({
    holidayProvider: throwingAfter(1, { code: "out-of-range" }),
    closedRecurringRules: [{ holiday: true }],
  });
  assert.ok(
    list.some(
      (d) => d.severity === "error" && d.code === "out-of-range" && d.path === "holidayProvider",
    ),
    JSON.stringify(list),
  );
});
