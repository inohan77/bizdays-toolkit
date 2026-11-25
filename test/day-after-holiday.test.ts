import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCalendar,
  createSchedule,
  isBizdaysError,
  type RecurringRule,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";

const brief = (options: object) =>
  diagnoseCalendar(options).map((d) => [d.severity, d.code, d.path, d.relatedPath ?? ""]);

test("祝日の翌日: 連休が明けた日だけに当てはまり、その日自身が祝日なら当てはまらない", () => {
  const library = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedRecurringRules: [{ dayAfterHoliday: true, name: "祝日の翌日休館" }],
  });
  // 2026-05-03 to 05-06 are holidays (Constitution Memorial Day, Greenery Day, Children's Day, a substitute)
  assert.deepEqual(
    ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"].map(
      (d) => library.dayInfoOn(d).reason,
    ),
    ["holiday", "holiday", "holiday", "closed-recurring", "default"],
  );
  assert.deepEqual(library.dayInfoOn("2026-05-07"), {
    date: "2026-05-07",
    weekday: 4,
    open: false,
    businessDay: false,
    reason: "closed-recurring",
    name: "祝日の翌日休館",
    optionPath: "closedRecurringRules[0]",
    rulePath: "closedRecurringRules[0]",
  });
  // The day after 2026-02-11 (Wed, National Foundation Day)
  assert.equal(library.isBusinessDay("2026-02-12"), false);
  assert.equal(library.isBusinessDay("2026-02-13"), true);
  // The day after New Year's Day (12-31 is not a holiday)
  assert.equal(library.isBusinessDay("2027-01-02"), false);
  assert.equal(library.isBusinessDay("2026-12-31"), true);
});

test("祝日の翌日: 配列の順番・holidayPolicy・months・有効期間と組み合わせる", () => {
  const rules: RecurringRule[] = [
    { weekday: 1, name: "月曜休館", holidayOverlapPolicy: "after-holiday" },
    { dayAfterHoliday: true, name: "祝日の翌日休館" },
  ];
  const library = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedRecurringRules: rules,
  });
  // The day after 2026-11-23 (Mon, Labor Thanksgiving Day) is both where the Monday rule moves to and the day
  // after a holiday. The rule written first decides
  assert.deepEqual(library.dayInfoOn("2026-11-24"), {
    date: "2026-11-24",
    weekday: 2,
    open: false,
    businessDay: false,
    reason: "closed-recurring",
    name: "月曜休館",
    shiftedFrom: "2026-11-23",
    optionPath: "closedRecurringRules[0]",
    rulePath: "closedRecurringRules[0]",
  });
  const reversed = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedRecurringRules: [...rules].reverse(),
  });
  assert.equal(reversed.dayInfoOn("2026-11-24").name, "祝日の翌日休館");
  assert.equal(reversed.dayInfoOn("2026-11-24").shiftedFrom, undefined);

  // Also when holidays are closed (default), the day-after rule is judged with the provider's holidays
  const closed = createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ dayAfterHoliday: true }],
  });
  assert.equal(closed.dayInfoOn("2026-02-11").reason, "holiday");
  assert.equal(closed.dayInfoOn("2026-02-12").reason, "closed-recurring");

  const may = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedRecurringRules: [{ dayAfterHoliday: true, months: [5], effectiveTo: "2026-12-31" }],
  });
  assert.equal(may.isBusinessDay("2026-05-07"), false);
  assert.equal(may.isBusinessDay("2026-02-12"), true, "5 月以外");
  assert.equal(may.isBusinessDay("2027-05-06"), true, "有効期間の外");
});

test("祝日の翌日: スケジュールの値、対応年の始まり、提供元なし", () => {
  const hours = createSchedule({
    holidayProvider: jp,
    weekdayValues: ["10-17", "10-19", "10-19", "10-19", "10-19", "10-19", "10-17"],
    holidayPolicy: { sameAs: 0 },
    recurringRules: [{ dayAfterHoliday: true, value: "12-17", name: "連休明けは短縮" }],
  });
  assert.equal(hours.valueOn("2026-05-06"), "10-17");
  assert.equal(hours.dayInfoOn("2026-05-07").value, "12-17");
  assert.equal(hours.dayInfoOn("2026-05-07").reason, "recurring");
  // The day before the start of the supported years (1955-01-01) is outside them, but it does not throw and
  // counts as not a holiday
  const edge = createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ dayAfterHoliday: true }],
  });
  assert.equal(edge.isBusinessDay("1955-01-01"), false, "元日は祝日");
  assert.equal(edge.isBusinessDay("1955-01-02"), false, "元日の翌日");
  // Without a provider no day matches
  const none = createCalendar({ closedRecurringRules: [{ dayAfterHoliday: true }] });
  assert.equal(none.isBusinessDay("2027-01-02"), true);
});

test("祝日の翌日: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { dayAfterHoliday: true, holidayOverlapPolicy: "over-holiday" },
      /closedRecurringRules\[0\]\.holidayOverlapPolicy: cannot be used with "dayAfterHoliday"/,
    ],
    [{ dayAfterHoliday: false }, /closedRecurringRules\[0\]\.dayAfterHoliday: must be true/],
    [{ dayAfterHoliday: true, weekday: 1 }, /must have exactly one of/],
    [{ dayAfterHoliday: true, dayOfMonth: 1 }, /must have exactly one of/],
    [{ dayAfterHoliday: true, nth: 1 }, /closedRecurringRules\[0\]\.nth/],
    [
      { dayAfterHoliday: true, interval: 2, anchor: "2026-01-07" },
      /closedRecurringRules\[0\]\.interval/,
    ],
  ];
  for (const [entry, message] of cases) {
    assert.throws(
      () => createCalendar({ holidayProvider: jp, closedRecurringRules: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-option" && message.test(e.message),
      JSON.stringify(entry),
    );
  }
});

test("祝日の翌日: 診断（never-matches・shadowed・redundant）", () => {
  assert.deepEqual(brief({ closedRecurringRules: [{ dayAfterHoliday: true }] }), [
    ["warning", "never-matches", "closedRecurringRules[0]", ""],
  ]);
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      closedRecurringRules: [
        { dayAfterHoliday: true },
        { dayAfterHoliday: true, months: [5] },
        {
          dayAfterHoliday: true,
          months: [6],
          effectiveFrom: "2027-01-01",
          effectiveTo: "2027-12-31",
        },
      ],
    }),
    [
      ["warning", "shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"],
      ["warning", "never-matches", "closedRecurringRules[2]", ""],
    ],
    "月の絞り込みで覆われる。2027 年 6 月に祝日の翌日はない",
  );
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      closedRecurringRules: [{ dayAfterHoliday: true, months: [5] }, { dayAfterHoliday: true }],
    }),
    [["info", "redundant", "closedRecurringRules[0]", "closedRecurringRules[1]"]],
    "後の規則のほうが広いので、先の規則は覆われないが取り除いても変わらない",
  );
  // Not compared with weekday rules for shadowed (it changes by year with the holidays), but redundant when
  // removing it changes nothing
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
      closedRecurringRules: [{ dayAfterHoliday: true }],
    }).filter((d) => d[1] !== "no-business-day"),
    [["info", "redundant", "closedRecurringRules[0]", ""]],
  );
});
