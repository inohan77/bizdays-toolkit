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

test("weekdays: 祝日の翌日休館（土日に当たる場合は開館）", () => {
  const museum = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [
      { weekday: 1, name: "月曜休館", onHolidayRule: "after-holiday" },
      { dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5], name: "祝日の翌日休館（土日は開館）" },
    ],
  });
  // 2026-02-11（水・建国記念の日）の翌日（木）は休館
  assert.equal(museum.dayInfo("2026-02-12").name, "祝日の翌日休館（土日は開館）");
  // 2026-11-03（火・文化の日）の翌日（水）は休館
  assert.equal(museum.isBusinessDay("2026-11-04"), false);
  // 2026-05-06（水・振替休日）の翌日（木）は休館
  assert.equal(museum.isBusinessDay("2026-05-07"), false);
  // 2027-01-01（金・元日）の翌日は土曜なので開館
  assert.equal(museum.isBusinessDay("2027-01-02"), true, "元日（金）の翌日の土曜は開館");
  assert.equal(museum.dayInfo("2027-01-02").reason, "regular");
  // weekdays なしなら土曜も休館
  const strict = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [{ dayAfterHoliday: true }],
  });
  assert.equal(strict.isBusinessDay("2027-01-02"), false);
});

test("weekdays: 祝日は休診、ただし土曜の祝日は午前のみ診療", () => {
  type Hours = "full" | "morning" | null;
  const clinic = createSchedule<Hours>({
    holidays: jp,
    weekly: [null, "full", "full", "full", null, "full", "morning"],
    holiday: { value: null },
    recurring: [{ holiday: true, weekdays: [6], value: "morning", name: "土曜の祝日は午前診療" }],
  });
  // 祝日でない土曜は午前診療（曜日の値）
  assert.equal(clinic.valueOn("2026-05-02"), "morning");
  // 土曜の祝日（2028-04-29 昭和の日）は祝日の規則で午前診療
  assert.equal(clinic.dayInfo("2028-04-29").holiday?.name, "昭和の日");
  assert.equal(clinic.valueOn("2028-04-29"), "morning");
  assert.equal(clinic.dayInfo("2028-04-29").rulePath, "recurring[0]");
  // 平日の祝日は休診
  assert.equal(clinic.valueOn("2026-11-23"), null);
  // 祝日の規則は曜日の規則（weekly）の値と区別できる: 土曜の祝日でも reason は recurring
  assert.equal(clinic.dayInfo("2028-04-29").reason, "recurring");
  assert.equal(clinic.dayInfo("2026-05-02").reason, "weekday");
});

test("weekdays: kinds・months・有効期間と組み合わせる", () => {
  const cal = createCalendar({
    holidays: jp,
    openRecurring: [
      {
        holiday: true,
        kinds: ["national"],
        weekdays: [1, 2, 3, 4, 5],
        months: [5],
        effectiveFrom: "2027-01-01",
      },
    ],
  });
  assert.equal(cal.isBusinessDay("2027-05-03"), true, "月曜の国民の祝日（5 月）");
  assert.equal(cal.isBusinessDay("2027-05-04"), true);
  assert.equal(cal.isBusinessDay("2027-05-05"), true);
  assert.equal(cal.isBusinessDay("2026-05-04"), false, "期間の前");
  assert.equal(cal.isBusinessDay("2027-11-23"), false, "5 月以外");
  assert.equal(cal.isBusinessDay("2028-05-03"), true, "2028 年の憲法記念日は水曜");
});

test("weekdays: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { weekday: 1, weekdays: [1] },
      /closedRecurring\[0\]\.weekdays: "weekdays" can be used only with "holiday", "dayAfterHoliday" or "dayBeforeHoliday"/,
    ],
    [{ day: 1, weekdays: [1] }, /\.weekdays/],
    [{ holiday: true, weekdays: [] }, /closedRecurring\[0\]\.weekdays/],
    [{ holiday: true, weekdays: [7] }, /closedRecurring\[0\]\.weekdays/],
    [{ holiday: true, weekdays: 6 }, /closedRecurring\[0\]\.weekdays: must be a non-empty array/],
    [{ dayAfterHoliday: true, weekdays: ["mon"] }, /closedRecurring\[0\]\.weekdays/],
  ];
  for (const [entry, message] of cases) {
    assert.throws(
      () => createCalendar({ holidays: jp, closedRecurring: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-option" && message.test(e.message),
      JSON.stringify(entry),
    );
  }
});

test("weekdays: 診断（never-matches・shadowed）", () => {
  assert.deepEqual(
    brief({
      holidays: jp,
      holidayPolicy: "open",
      closedRecurring: [
        { holiday: true, kinds: ["substitute"], weekdays: [0, 6] },
        { dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] },
        { dayAfterHoliday: true, weekdays: [2, 3] },
        { dayAfterHoliday: true, weekdays: [6, 1] },
      ],
    }),
    [
      ["warning", "never-matches", "closedRecurring[0]", ""],
      ["warning", "shadowed", "closedRecurring[2]", "closedRecurring[1]"],
    ],
    "振替休日は土日に来ない。曜日の包含で覆われる。土曜を含む規則は覆われない",
  );
});
