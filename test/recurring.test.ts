import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCalendar,
  createSchedule,
  isBizdaysError,
  type RecurringRule,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { IssueCollector } from "../src/core/errors.ts";
import { compileCalendarOptions } from "../src/core/calendar.ts";

const closedOn = (rules: RecurringRule[], extra: Parameters<typeof createCalendar>[0] = {}) =>
  createCalendar({ holidays: jp, closedRecurring: rules, ...extra });

test("パターン: 毎週・第 n 曜日・最終・複数の nth", () => {
  const every = closedOn([{ weekday: 3 }]);
  assert.equal(every.isBusinessDay("2026-10-14"), false);
  assert.equal(every.isBusinessDay("2026-10-15"), true);

  const third = closedOn([{ weekday: 3, nth: 3 }]);
  assert.equal(third.isBusinessDay("2026-10-21"), false, "2026 年 10 月の第 3 水曜日");
  assert.equal(third.isBusinessDay("2026-10-14"), true);

  const last = closedOn([{ weekday: 5, nth: -1 }]);
  assert.equal(last.isBusinessDay("2026-10-30"), false, "10 月の最終金曜日");
  assert.equal(last.isBusinessDay("2026-10-23"), true);

  const fifth = closedOn([{ weekday: 4, nth: 5 }]);
  assert.equal(fifth.isBusinessDay("2026-10-29"), false, "10 月には第 5 木曜日がある");
  assert.deepEqual(
    fifth.listBusinessDays("2026-11-01", "2026-11-30").filter((d) => d.endsWith("26")),
    ["2026-11-26"],
    "11 月には第 5 木曜日がない（第 4 の 26 日は営業）",
  );

  const twoFour = closedOn([{ weekday: 6, nth: [2, 4] }]);
  assert.deepEqual(
    ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"].map((d) =>
      twoFour.isBusinessDay(d),
    ),
    [true, false, true, false, true],
  );
});

test("パターン: 毎月の日・末日・その月にない日・月の絞り込み", () => {
  const day20 = closedOn([{ day: 20 }]);
  assert.equal(day20.isBusinessDay("2026-10-20"), false);

  const lastDay = closedOn([{ day: -1 }]);
  assert.equal(lastDay.isBusinessDay("2027-02-28"), false);
  assert.equal(lastDay.isBusinessDay("2028-02-29"), false, "うるう年の 2 月の末日");
  assert.equal(lastDay.isBusinessDay("2028-02-28"), true);

  const day31 = closedOn([{ day: 31 }]);
  assert.equal(day31.isBusinessDay("2026-10-31"), false);
  assert.equal(
    day31.isBusinessDay("2026-09-30"),
    true,
    "31 日がない月は当てはまらない（末日に読み替えない）",
  );

  const months = closedOn([{ weekday: 6, nth: 2, months: [8, 12] }]);
  assert.equal(months.isBusinessDay("2026-08-08"), false);
  assert.equal(months.isBusinessDay("2026-12-12"), false);
  assert.equal(months.isBusinessDay("2026-09-12"), true, "9 月は絞り込みの対象外");
});

test("祝日の下（under-holiday・既定）は、祝日の扱いに従う", () => {
  const rule: RecurringRule = { weekday: 1, nth: 2, name: "第 2 月曜定休" }; // 2026-01-12 は成人の日
  assert.equal(
    closedOn([rule], { holidayPolicy: "open" }).isBusinessDay("2026-01-12"),
    true,
    "祝日は営業",
  );
  assert.equal(
    closedOn([rule], { holidayPolicy: "closed" }).dayInfo("2026-01-12").reason,
    "holiday",
  );
  const ignore = closedOn([rule], { holidayPolicy: "ignore" }).dayInfo("2026-01-12");
  assert.equal(ignore.businessDay, false, "祝日を判定に使わないなら、規則が当てはまる");
  assert.equal(ignore.reason, "closed-recurring");
  assert.equal(
    closedOn([rule], { holidayPolicy: "open" }).dayInfo("2026-02-09").reason,
    "closed-recurring",
  );
});

test("祝日の上（over-holiday）は、祝日でも当てはめる", () => {
  const cal = closedOn(
    [{ weekday: 1, nth: 2, name: "第 2 月曜定休", onHolidayRule: "over-holiday" }],
    {
      holidayPolicy: "open",
    },
  );
  const day = cal.dayInfo("2026-01-12");
  assert.equal(day.businessDay, false);
  assert.equal(day.reason, "closed-recurring");
  assert.equal(day.name, "第 2 月曜定休");
  assert.equal(day.holiday?.name, "成人の日", "祝日の情報は付く");
});

test("祝日の後（after-holiday）: 月曜休館・祝日の場合は翌平日", () => {
  const museum = closedOn([{ weekday: 1, name: "月曜休館", onHolidayRule: "after-holiday" }], {
    holidayPolicy: "open",
  });
  // 通常の月曜
  assert.deepEqual(
    { ...museum.dayInfo("2026-10-19"), holiday: undefined },
    {
      date: "2026-10-19",
      weekday: 1,
      businessDay: false,
      reason: "closed-recurring",
      name: "月曜休館",
      holiday: undefined,
      rulePath: "closedRecurring[0]",
    },
  );
  // スポーツの日（月）は開館し、翌日の火曜に休館
  assert.equal(museum.isBusinessDay("2026-10-12"), true);
  const tue = museum.dayInfo("2026-10-13");
  assert.equal(tue.businessDay, false);
  assert.equal(tue.reason, "closed-recurring");
  assert.equal(tue.shiftedFrom, "2026-10-12");
  // 敬老の日（月）→ 国民の休日（火）→ 秋分の日（水）が続くので、木曜に振替
  assert.deepEqual(
    ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"].map((d) =>
      museum.isBusinessDay(d),
    ),
    [true, true, true, false, true],
  );
  assert.equal(museum.dayInfo("2026-09-24").shiftedFrom, "2026-09-21");
  // GW: みどりの日（月）→ こどもの日（火）→ 振替休日（水）→ 木曜に振替
  assert.equal(museum.dayInfo("2026-05-07").shiftedFrom, "2026-05-04");
  // 祝日の扱いを「休業」にしても、振替は祝日の扱いに関係なく行う
  const closedHolidays = closedOn([{ weekday: 1, onHolidayRule: "after-holiday" }], {
    holidayPolicy: "closed",
  });
  assert.equal(closedHolidays.dayInfo("2026-10-12").reason, "holiday");
  assert.equal(closedHolidays.dayInfo("2026-10-13").shiftedFrom, "2026-10-12");
});

test("振替先の日に、より上位の規則があればそちらが優先", () => {
  const cal = closedOn(
    [{ weekday: 1, nth: 4, months: [11], name: "11 月第 4 月曜", onHolidayRule: "after-holiday" }],
    {
      holidayPolicy: "open",
      closedDates: [{ date: "2026-11-24", name: "臨時休業" }],
    },
  );
  const day = cal.dayInfo("2026-11-24"); // 勤労感謝の日（11/23 月）の振替先
  assert.equal(day.reason, "closed-date");
  assert.equal(day.name, "臨時休業");
  assert.equal(day.shiftedFrom, undefined);
  const open = closedOn([{ weekday: 1, nth: 4, months: [11], onHolidayRule: "after-holiday" }], {
    holidayPolicy: "open",
    openDates: ["2026-11-24"],
  });
  assert.equal(open.isBusinessDay("2026-11-24"), true, "臨時営業日が振替より優先");
});

test("openRecurring は closedRecurring・定休日の曜日より優先", () => {
  const cal = createCalendar({
    holidays: jp,
    closedWeekdays: [0],
    openRecurring: [{ weekday: 0, nth: 1, name: "第 1 日曜は営業" }],
    closedRecurring: [{ weekday: 0, nth: 1 }],
  });
  const first = cal.dayInfo("2026-10-04");
  assert.equal(first.businessDay, true);
  assert.equal(first.reason, "open-recurring");
  assert.equal(first.name, "第 1 日曜は営業");
  assert.equal(cal.dayInfo("2026-10-11").reason, "closed-weekday");
});

test("スケジュール: 繰り返しの値、先に書いた規則の優先、振替", () => {
  type Hours = string | null;
  const s = createSchedule<Hours>({
    holidays: jp,
    weekly: ["10-19", "10-21", "10-21", "10-21", "10-21", "10-21", "10-21"],
    holiday: { sameAs: 0 },
    recurring: [
      { day: -1, value: "10-17", name: "月末は短縮" },
      { weekday: 1, value: null, name: "月曜休業", onHolidayRule: "after-holiday" },
      { weekday: 1, nth: 3, value: "never", name: "先の規則に隠れる" },
    ],
  });
  assert.equal(s.valueOn("2026-10-19"), null, "第 3 月曜は、先に書いた月曜休業が優先");
  assert.equal(s.dayInfo("2026-10-12").reason, "holiday", "祝日の月曜は日曜の営業時間");
  assert.equal(s.valueOn("2026-10-12"), "10-19");
  const shifted = s.dayInfo("2026-10-13");
  assert.equal(shifted.value, null);
  assert.equal(shifted.reason, "recurring");
  assert.equal(shifted.shiftedFrom, "2026-10-12");
  assert.equal(s.valueOn("2026-10-31"), "10-17");
});

test("対応年の始まりでも、振替元をさかのぼって例外にならない", () => {
  const cal = closedOn([{ weekday: 6, onHolidayRule: "after-holiday" }], { holidayPolicy: "open" });
  // 1955-01-01（土）は元日。その前日は祝日の対応年の外
  assert.equal(cal.isBusinessDay("1955-01-01"), true);
  assert.equal(cal.dayInfo("1955-01-02").shiftedFrom, "1955-01-01");
  assert.equal(cal.isBusinessDay("1955-01-08"), false);
});

test("入力の誤りは、コードと設定の中の位置で分かる", () => {
  const cases: [unknown, string, RegExp][] = [
    [
      { weekday: 1, day: 3 },
      "invalid-option",
      /closedRecurring\[0\]: must have exactly one of "weekday", "day", "dayAfterHoliday", "dayBeforeHoliday" or "holiday"/,
    ],
    [
      {},
      "invalid-option",
      /must have exactly one of "weekday", "day", "dayAfterHoliday", "dayBeforeHoliday" or "holiday"/,
    ],
    [{ weekday: 7 }, "invalid-weekday", /closedRecurring\[0\]\.weekday/],
    [{ weekday: 1, nth: 6 }, "invalid-option", /closedRecurring\[0\]\.nth/],
    [{ weekday: 1, nth: [] }, "invalid-option", /closedRecurring\[0\]\.nth/],
    [{ day: 0 }, "invalid-option", /closedRecurring\[0\]\.day/],
    [{ day: 3, nth: 1 }, "invalid-option", /closedRecurring\[0\]\.nth/],
    [{ day: 3, months: [13] }, "invalid-option", /closedRecurring\[0\]\.months/],
    [{ day: 3, months: 8 }, "invalid-option", /closedRecurring\[0\]\.months/],
    [{ day: 3, onHolidayRule: "rule" }, "invalid-option", /closedRecurring\[0\]\.onHolidayRule/],
  ];
  for (const [entry, code, message] of cases) {
    assert.throws(
      () => createCalendar({ closedRecurring: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === code && message.test(e.message),
      JSON.stringify(entry),
    );
  }
  assert.throws(
    () => createSchedule({ weekly: [0, 0, 0, 0, 0, 0, 0], recurring: [{ day: 1 } as never] }),
    /recurring\[0\]: must have "value"/,
  );
});

test("繰り返しの規則の知らないキーは警告として記録し、作った後の書き換えは効かない", () => {
  const c = new IssueCollector();
  compileCalendarOptions(c, { closedRecurring: [{ weekday: 1, onHoliday: "after-holiday" }] });
  assert.deepEqual(
    c.issues.map((i) => [i.severity, i.code, i.path]),
    [["warning", "unknown-option", "closedRecurring[0].onHoliday"]],
  );
  const nth: (1 | 2 | 3 | 4 | 5 | -1)[] = [1];
  const cal = closedOn([{ weekday: 3, nth }]);
  nth.push(3);
  assert.equal(cal.isBusinessDay("2026-10-21"), true, "あとから足した第 3 水曜日は効かない");
});
