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

test("祝前日: 翌日が祝日でその日自身は祝日でない日だけに当てはまる（連休の初日の前日）", () => {
  const eve = createSchedule<string>({
    holidays: jp,
    weekly: ["normal", "normal", "normal", "normal", "normal", "normal", "normal"],
    holiday: { value: "holiday" },
    recurring: [{ dayBeforeHoliday: true, value: "eve", name: "祝前日料金" }],
  });
  // 2026-04-29（昭和の日）、05-03〜05-06（憲法記念日・みどりの日・こどもの日・振替休日）
  assert.deepEqual(
    ["2026-04-28", "2026-04-29", "2026-04-30", "2026-05-01", "2026-05-02", "2026-05-03"].map((d) =>
      eve.valueOn(d),
    ),
    ["eve", "holiday", "normal", "normal", "eve", "holiday"],
    "連休の中の日（05-04・05-05）は祝日なので当てはまらず、連休の前日は 05-02 だけ",
  );
  assert.deepEqual(eve.dayInfo("2026-05-02"), {
    date: "2026-05-02",
    weekday: 6,
    value: "eve",
    reason: "recurring",
    name: "祝前日料金",
    rulePath: "recurring[0]",
  });
  // 元日の前日（12-31 は祝日でない）
  assert.equal(eve.valueOn("2026-12-31"), "eve");
  // 祝日の翌日と祝前日は対になる（2026-05-07 は祝日の翌日で、祝前日ではない）
  const both = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [
      { dayBeforeHoliday: true, name: "祝前日" },
      { dayAfterHoliday: true, name: "祝日の翌日" },
    ],
  });
  assert.equal(both.dayInfo("2026-05-02").name, "祝前日");
  assert.equal(both.dayInfo("2026-05-07").name, "祝日の翌日");
  assert.equal(both.isBusinessDay("2026-05-08"), true);
});

test("祝前日: 曜日・月の絞り込み、有効期間、配列の順番", () => {
  // 「祝前日は深夜まで営業（土日に当たる祝前日は通常どおり）」
  const weekdaysOnly = createSchedule<string>({
    holidays: jp,
    weekly: ["-20", "-20", "-20", "-20", "-20", "-20", "-20"],
    recurring: [{ dayBeforeHoliday: true, weekdays: [1, 2, 3, 4, 5], value: "-26" }],
  });
  assert.equal(weekdaysOnly.valueOn("2026-11-02"), "-26", "11-03（文化の日）の前日の月曜");
  assert.equal(
    weekdaysOnly.valueOn("2026-11-22"),
    "-20",
    "11-23（勤労感謝の日）の前日の日曜は除く",
  );
  const may = createCalendar({
    holidays: jp,
    closedRecurring: [{ dayBeforeHoliday: true, months: [5], effectiveTo: "2026-12-31" }],
  });
  assert.equal(may.isBusinessDay("2026-05-02"), false);
  assert.equal(may.isBusinessDay("2026-04-28"), true, "5 月以外");
  assert.equal(may.isBusinessDay("2027-05-02"), true, "有効期間の外");
  // 祝日と祝日の間が 1 日の年は、その日が祝日の翌日でも祝前日でもある。先に書いた規則が決める
  // 2027-09-20（月・敬老の日）と 2027-09-23（木・秋分の日）: 09-21 は翌日だけ、09-22 は祝前日だけ
  const rules: RecurringRule[] = [
    { dayAfterHoliday: true, name: "翌日" },
    { dayBeforeHoliday: true, name: "前日" },
  ];
  const sep = createCalendar({ holidays: jp, holidayPolicy: "open", closedRecurring: rules });
  assert.equal(sep.dayInfo("2027-09-21").name, "翌日");
  assert.equal(sep.dayInfo("2027-09-22").name, "前日");
  // 2026-09-21（敬老の日）・09-22（国民の休日）・09-23（秋分の日）は連休で、09-20（日）が祝前日
  assert.equal(sep.dayInfo("2026-09-20").name, "前日");
  assert.equal(sep.dayInfo("2026-09-22").reason, "holiday", "連休の中の日は祝日");
});

test("祝前日: 締め時刻の繰り上げ、対応年の終わり、提供元なし", () => {
  // 「祝前日は当日出荷の受付を 12:00 まで」: 締め時刻をスケジュールの値にして cutoff に渡す
  const shipping = createCalendar({ holidays: jp, closedWeekdays: [0, 6] });
  const cutoffs = createSchedule<string>({
    holidays: jp,
    weekly: ["14:00", "14:00", "14:00", "14:00", "14:00", "14:00", "14:00"],
    recurring: [{ dayBeforeHoliday: true, value: "12:00" }],
  });
  const at = (iso: string) => {
    const { date } = shipping.civilOf(iso);
    return shipping.businessDayOnOrAfter(iso, { cutoff: cutoffs.valueOn(date) });
  };
  assert.equal(at("2026-11-02T11:30"), "2026-11-02", "祝前日の 12:00 前は当日");
  assert.equal(at("2026-11-02T13:00"), "2026-11-04", "祝前日の 12:00 後は翌営業日（11-03 は祝日）");
  assert.equal(at("2026-11-04T13:00"), "2026-11-04", "通常の日は 14:00 まで当日");
  // 対応年の終わりの翌日は対応年の外だが、例外にならず祝日でないとみなす
  const edge = createCalendar({ holidays: jp, closedRecurring: [{ dayBeforeHoliday: true }] });
  assert.equal(edge.isBusinessDay(`${jp.supportedYears.to}-12-31`), true);
  assert.equal(edge.isBusinessDay(`${jp.supportedYears.to - 1}-12-31`), false, "元日の前日");
  // 提供元がなければ、1 日も当てはまらない
  const none = createCalendar({ closedRecurring: [{ dayBeforeHoliday: true }] });
  assert.equal(none.isBusinessDay("2026-12-31"), true);
});

test("祝前日: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { dayBeforeHoliday: true, onHolidayRule: "over-holiday" },
      /closedRecurring\[0\]\.onHolidayRule: cannot be used with "dayBeforeHoliday"/,
    ],
    [{ dayBeforeHoliday: false }, /closedRecurring\[0\]\.dayBeforeHoliday: must be true/],
    [{ dayBeforeHoliday: true, weekday: 1 }, /must have exactly one of/],
    [{ dayBeforeHoliday: true, day: 1 }, /must have exactly one of/],
    [{ dayBeforeHoliday: true, dayAfterHoliday: true }, /must have exactly one of/],
    [{ dayBeforeHoliday: true, holiday: true }, /must have exactly one of/],
    [{ dayBeforeHoliday: true, nth: 1 }, /closedRecurring\[0\]\.nth/],
    [{ dayBeforeHoliday: true, kinds: "national" }, /closedRecurring\[0\]\.kinds/],
    [{ dayBeforeHoliday: true, keys: ["Bad Key"] }, /closedRecurring\[0\]\.keys/],
    [
      { dayBeforeHoliday: true, skipWeekdays: [0, 1, 2, 3, 4, 5, 6] },
      /closedRecurring\[0\]\.skipWeekdays: cannot include every weekday/,
    ],
    [{ dayBeforeHoliday: true, weekdays: [7] }, /closedRecurring\[0\]\.weekdays/],
    [
      { dayBeforeHoliday: true, interval: 2, anchor: "2026-01-07" },
      /closedRecurring\[0\]\.interval/,
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

test("祝前日: 診断（never-matches・shadowed・redundant）。祝日の翌日とは同じ形として比べない", () => {
  assert.deepEqual(brief({ closedRecurring: [{ dayBeforeHoliday: true }] }), [
    ["warning", "never-matches", "closedRecurring[0]", ""],
  ]);
  assert.deepEqual(
    brief({
      holidays: jp,
      closedRecurring: [
        { dayBeforeHoliday: true },
        { dayBeforeHoliday: true, months: [5], weekdays: [6] },
        {
          dayBeforeHoliday: true,
          months: [6],
          effectiveFrom: "2027-01-01",
          effectiveTo: "2027-12-31",
        },
      ],
    }),
    [
      ["warning", "shadowed", "closedRecurring[1]", "closedRecurring[0]"],
      ["warning", "never-matches", "closedRecurring[2]", ""],
    ],
    "曜日・月の絞り込みで覆われる。2027 年 6 月に祝前日はない",
  );
  assert.deepEqual(
    brief({
      holidays: jp,
      closedRecurring: [{ dayBeforeHoliday: true }, { dayAfterHoliday: true }],
    }),
    [],
    "祝前日と祝日の翌日は別の形で、互いに覆わない",
  );
  assert.deepEqual(
    brief({
      holidays: jp,
      closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
      closedRecurring: [{ dayBeforeHoliday: true }],
    }).filter((d) => d[1] !== "no-business-day"),
    [["info", "redundant", "closedRecurring[0]", ""]],
  );
});
