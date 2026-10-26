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

test("skipWeekdays: 創立記念日（6 月 15 日。土日祝なら翌営業日）を規則で書ける", () => {
  const company = createCalendar({
    holidays: jp,
    closedWeekdays: [0, 6],
    closedRecurring: [
      {
        day: 15,
        months: [6],
        name: "創立記念日",
        onHolidayRule: "after-holiday",
        skipWeekdays: [0, 6],
      },
    ],
  });
  // 2030 年 6 月 15 日は土曜日 → 17 日（月）
  assert.deepEqual(company.dayInfo("2030-06-17"), {
    date: "2030-06-17",
    weekday: 1,
    businessDay: false,
    reason: "closed-recurring",
    name: "創立記念日",
    shiftedFrom: "2030-06-15",
    rulePath: "closedRecurring[0]",
  });
  assert.equal(company.dayInfo("2030-06-15").reason, "closed-weekday", "本来の日には当てはめない");
  assert.equal(company.dayInfo("2030-06-18").reason, "regular");
  // 2031 年は日曜日 → 16 日（月）
  assert.equal(company.dayInfo("2031-06-16").shiftedFrom, "2031-06-15");
  // 平日なら当日（2026 年は月曜日）
  assert.equal(company.dayInfo("2026-06-15").reason, "closed-recurring");
  assert.equal(company.dayInfo("2026-06-15").shiftedFrom, undefined);
  assert.equal(company.isBusinessDay("2026-06-16"), true);
  // 祝日と週末が続いても、最初の「祝日でも土日でもない日」へ（5 月 3 日が土曜日の 2025 年: 3・4・5・6 日が休み → 7 日）
  const may = createCalendar({
    holidays: jp,
    closedWeekdays: [0, 6],
    closedRecurring: [
      { day: 3, months: [5], name: "式典", onHolidayRule: "after-holiday", skipWeekdays: [0, 6] },
    ],
  });
  assert.equal(may.dayInfo("2025-05-07").shiftedFrom, "2025-05-03");
  assert.equal(may.dayInfo("2025-05-07").name, "式典");
});

test("skipWeekdays: 月曜定休で、月曜が祝日なら翌平日（土曜日には落とさない）", () => {
  const shop = createCalendar({
    holidays: jp,
    closedRecurring: [
      { weekday: 1, name: "定休日", onHolidayRule: "after-holiday", skipWeekdays: [6] },
    ],
  });
  // 2026-11-23（月）は勤労感謝の日 → 24 日（火）
  assert.equal(shop.dayInfo("2026-11-23").reason, "holiday");
  assert.deepEqual(shop.dayInfo("2026-11-24"), {
    date: "2026-11-24",
    weekday: 2,
    businessDay: false,
    reason: "closed-recurring",
    name: "定休日",
    shiftedFrom: "2026-11-23",
    rulePath: "closedRecurring[0]",
  });
  // 月曜から金曜まで祝日が続く週はない（土曜日に落ちるのを防ぐ設定が効くのは稀）ので、人工の提供元で確かめる
  const fiveDays = {
    id: "XX",
    timeZone: "Asia/Tokyo",
    supportedYears: { from: 2026, to: 2026 },
    dataVersion: "test",
    holidaysInYear: () =>
      ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"].map((date) => ({
        date,
        name: "祭",
        nameEn: "Festival",
        kind: "x",
        confirmed: true,
      })),
  };
  const withSkip = createCalendar({
    holidays: fiveDays,
    closedRecurring: [{ weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: [6, 0] }],
  });
  assert.equal(withSkip.isBusinessDay("2026-03-07"), true, "土曜日には落ちない");
  assert.equal(withSkip.isBusinessDay("2026-03-08"), true, "日曜日にも落ちない");
  // 翌月曜日（9 日）は定休日そのものに当たるので、振替としてではなく通常の当てはまりになる
  assert.equal(withSkip.dayInfo("2026-03-09").reason, "closed-recurring");
  assert.equal(withSkip.dayInfo("2026-03-09").shiftedFrom, undefined);
  const withoutSkip = createCalendar({
    holidays: fiveDays,
    closedRecurring: [{ weekday: 1, onHolidayRule: "after-holiday" }],
  });
  assert.equal(
    withoutSkip.dayInfo("2026-03-07").shiftedFrom,
    "2026-03-02",
    "skipWeekdays がなければ従来どおり土曜日",
  );
  assert.equal(withoutSkip.isBusinessDay("2026-03-09"), false, "翌月曜日は定休日そのもの");
});

test("skipWeekdays: 有効期間は本来の日で判定し、スケジュールでも使える。配列の順番と祝日の扱いとの関係", () => {
  const company = createCalendar({
    holidays: jp,
    closedWeekdays: [0, 6],
    closedRecurring: [
      {
        day: 15,
        months: [6],
        onHolidayRule: "after-holiday",
        skipWeekdays: [0, 6],
        effectiveFrom: "2030-06-16",
        name: "新",
      },
    ],
  });
  assert.equal(
    company.isBusinessDay("2030-06-17"),
    true,
    "本来の日（15 日）が有効期間の前なので振り替えない",
  );
  const hours = createSchedule<string>({
    holidays: jp,
    weekly: ["closed", "open", "open", "open", "open", "open", "closed"],
    recurring: [
      {
        day: 1,
        onHolidayRule: "after-holiday",
        skipWeekdays: [0, 6],
        value: "meeting",
        name: "毎月 1 日は全社会議（土日祝なら翌営業日）",
      },
    ],
  });
  assert.equal(hours.valueOn("2026-08-03"), "meeting", "8 月 1 日は土曜日 → 3 日（月）");
  assert.equal(hours.dayInfo("2026-08-03").shiftedFrom, "2026-08-01");
  assert.equal(hours.valueOn("2026-08-01"), "closed");
  assert.equal(hours.valueOn("2026-09-01"), "meeting", "火曜日なら当日");
  // 振替先が別の規則の日と重なれば、配列で先に書いた規則が決める
  const ordered = createCalendar({
    holidays: jp,
    closedWeekdays: [0, 6],
    openRecurring: [{ weekday: 1, name: "月曜は営業" }],
    closedRecurring: [
      { day: 15, months: [6], onHolidayRule: "after-holiday", skipWeekdays: [0, 6], name: "創立" },
    ],
  });
  assert.equal(ordered.dayInfo("2030-06-17").name, "月曜は営業", "openRecurring が先");
});

test("skipWeekdays: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { weekday: 1, skipWeekdays: [6] },
      /closedRecurring\[0\]\.skipWeekdays: "skipWeekdays" can be used only with "dayAfterHoliday", "dayBeforeHoliday", or onHolidayRule: "after-holiday"/,
    ],
    [
      { weekday: 1, onHolidayRule: "under-holiday", skipWeekdays: [6] },
      /closedRecurring\[0\]\.skipWeekdays/,
    ],
    [
      { weekday: 1, onHolidayRule: "over-holiday", skipWeekdays: [6] },
      /closedRecurring\[0\]\.skipWeekdays/,
    ],
    [{ holiday: true, skipWeekdays: [6] }, /closedRecurring\[0\]\.skipWeekdays/],
    [{ businessDayOfMonth: 1, skipWeekdays: [6] }, /closedRecurring\[0\]\.skipWeekdays/],
    [{ dayAfterHoliday: true, skipWeekdays: [7] }, /closedRecurring\[0\]\.skipWeekdays/],
    [
      { weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: [1] },
      /closedRecurring\[0\]\.skipWeekdays: cannot include the rule's own weekday 1/,
    ],
    [
      { weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: [] },
      /closedRecurring\[0\]\.skipWeekdays/,
    ],
    [
      { weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: 6 },
      /closedRecurring\[0\]\.skipWeekdays: must be a non-empty array/,
    ],
    [
      { weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: [7] },
      /closedRecurring\[0\]\.skipWeekdays/,
    ],
  ];
  for (const [entry, message] of cases) {
    assert.throws(
      () => createCalendar({ holidays: jp, closedRecurring: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-option" && message.test(e.message),
      JSON.stringify(entry),
    );
  }
});

test("skipWeekdays: 診断（飛ばす曜日が違えば覆わない）", () => {
  assert.deepEqual(
    brief({
      holidays: jp,
      closedRecurring: [
        { weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: [6] },
        { weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: [6, 0] },
        { weekday: 1, onHolidayRule: "after-holiday" },
        { weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: [6] },
      ],
    }),
    [
      ["warning", "shadowed", "closedRecurring[3]", "closedRecurring[0]"],
      ["info", "redundant", "closedRecurring[0]", ""],
      ["info", "redundant", "closedRecurring[1]", ""],
      ["info", "redundant", "closedRecurring[2]", ""],
    ],
    "同じ skipWeekdays だけが shadowed。違う規則は redundant（取り除いても結果が変わらない）で見つかる",
  );
});
