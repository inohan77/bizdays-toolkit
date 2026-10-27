// 週の第 n 営業日の規則 { businessDayOfWeek, weekStart }（0.30.0）
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, type CalendarOptions } from "../src/index.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";
import { jp } from "../src/jp/index.ts";

const warehouse = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-29", to: "01-03", name: "年末年始" }],
  closedRecurringRules: [{ businessDayOfWeek: -1, weekStart: 1, name: "週次棚卸しで出荷停止" }],
});

test("週の第 n 営業日: 週の最終営業日を、祝日・毎年の休業日を除いて数える", () => {
  assert.equal(warehouse.isBusinessDay("2026-10-30"), false, "金曜日が週の最終営業日");
  assert.equal(warehouse.isBusinessDay("2026-10-29"), true);
  assert.equal(warehouse.isBusinessDay("2026-03-19"), false, "3 月 20 日（金）が春分の日");
  assert.equal(warehouse.isBusinessDay("2026-12-28"), false, "29 日から年末年始");
  const day = warehouse.dayInfoOn("2026-10-30");
  assert.equal(day.reason, "closed-recurring");
  assert.equal(day.optionPath, "closedRecurringRules[0]");
});

test("週の第 n 営業日: weekStart で週の区切りが変わり、月をまたぐ週も数える", () => {
  const first = (weekStart: 0 | 1) =>
    createCalendar({
      holidayProvider: jp,
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ businessDayOfWeek: 1, weekStart }],
    });
  // 2026-09-28（月）〜10-04（日）の週。月曜始まりなら 9 月 28 日が週の最初の営業日
  assert.equal(first(1).isBusinessDay("2026-09-28"), false);
  assert.equal(first(1).isBusinessDay("2026-10-01"), true);
  // 2026-11-23（月）は勤労感謝の日なので、月曜始まりの週の最初の営業日は 24 日（火）
  assert.equal(first(1).isBusinessDay("2026-11-24"), false);
  assert.equal(first(0).isBusinessDay("2026-11-24"), false, "日曜始まりでも 24 日");
});

test("週の第 n 営業日: スケジュールでは calendar で数える基準を指定する", () => {
  const hours = createSchedule<string | null>({
    holidayProvider: jp,
    weekdayValues: [null, "10-19", "10-19", "10-19", "10-19", "10-19", null],
    recurringRules: [
      {
        businessDayOfWeek: 1,
        weekStart: 1,
        calendar: warehouse,
        value: "11-19",
        name: "週初は朝礼",
      },
    ],
  });
  assert.equal(hours.valueOn("2026-11-24"), "11-19", "23 日（月）が勤労感謝の日");
  assert.equal(hours.valueOn("2026-11-30"), "11-19");
  assert.equal(hours.valueOn("2026-11-25"), "10-19");
});

test("週の第 n 営業日: 診断（その週にない回は never-matches）と入力の誤り", () => {
  const list = diagnoseCalendar({
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfWeek: 6, weekStart: 1 }],
  });
  assert.deepEqual(
    list.map((d) => [d.code, d.path]),
    [["never-matches", "closedRecurringRules[0]"]],
  );
  assert.match(list[0]!.message, /no week has that many business days/);
  const cases: [unknown, RegExp][] = [
    [{ businessDayOfWeek: 1 }, /closedRecurringRules\[0\]\.weekStart: is required/],
    [
      { businessDayOfWeek: 8, weekStart: 1 },
      /closedRecurringRules\[0\]\.businessDayOfWeek: must be 1-7/,
    ],
    [
      { businessDayOfWeek: 0, weekStart: 1 },
      /closedRecurringRules\[0\]\.businessDayOfWeek: must be 1-7/,
    ],
    [
      { businessDayOfWeek: 1, weekStart: 1, holidayOverlapPolicy: "after-holiday" },
      /"after-holiday" cannot be used with "businessDayOfWeek"/,
    ],
    [{ weekday: 1, weekStart: 1 }, /"weekStart" can be used only with "businessDayOfWeek"/],
    [
      { businessDayOfWeek: 1, weekStart: 1, calendar: warehouse },
      /closedRecurringRules\[0\]\.calendar: "calendar" cannot be used in a calendar/,
    ],
  ];
  for (const [rule, message] of cases) {
    assert.throws(
      () => createCalendar({ closedRecurringRules: [rule] } as CalendarOptions),
      (e: Error & { code?: string }) => e.code === "invalid-option" && message.test(e.message),
      JSON.stringify(rule),
    );
  }
});
