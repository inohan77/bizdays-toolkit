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
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [
      {
        dayOfMonth: 15,
        months: [6],
        name: "創立記念日",
        holidayOverlapPolicy: "after-holiday",
        skipWeekdays: [0, 6],
      },
    ],
  });
  // June 15, 2030 is a Saturday → the 17th (Mon)
  assert.deepEqual(company.dayInfoOn("2030-06-17"), {
    date: "2030-06-17",
    weekday: 1,
    open: false,
    businessDay: false,
    reason: "closed-recurring",
    name: "創立記念日",
    shiftedFrom: "2030-06-15",
    optionPath: "closedRecurringRules[0]",
    rulePath: "closedRecurringRules[0]",
  });
  assert.equal(
    company.dayInfoOn("2030-06-15").reason,
    "closed-weekday",
    "本来の日には当てはめない",
  );
  assert.equal(company.dayInfoOn("2030-06-18").reason, "default");
  // In 2031 it is a Sunday → the 16th (Mon)
  assert.equal(company.dayInfoOn("2031-06-16").shiftedFrom, "2031-06-15");
  // On a weekday, the day itself (a Monday in 2026)
  assert.equal(company.dayInfoOn("2026-06-15").reason, "closed-recurring");
  assert.equal(company.dayInfoOn("2026-06-15").shiftedFrom, undefined);
  assert.equal(company.isBusinessDay("2026-06-16"), true);
  // With holidays and a weekend in a row, it goes to the first day that is neither a holiday nor a weekend (2025,
  // when May 3 is a Saturday: the 3rd to 6th are off → the 7th)
  const may = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [
      {
        dayOfMonth: 3,
        months: [5],
        name: "式典",
        holidayOverlapPolicy: "after-holiday",
        skipWeekdays: [0, 6],
      },
    ],
  });
  assert.equal(may.dayInfoOn("2025-05-07").shiftedFrom, "2025-05-03");
  assert.equal(may.dayInfoOn("2025-05-07").name, "式典");
});

test("skipWeekdays: 月曜定休で、月曜が祝日なら翌平日（土曜日には落とさない）", () => {
  const shop = createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [
      { weekday: 1, name: "定休日", holidayOverlapPolicy: "after-holiday", skipWeekdays: [6] },
    ],
  });
  // 2026-11-23 (Mon) is Labor Thanksgiving Day → the 24th (Tue)
  assert.equal(shop.dayInfoOn("2026-11-23").reason, "holiday");
  assert.deepEqual(shop.dayInfoOn("2026-11-24"), {
    date: "2026-11-24",
    weekday: 2,
    open: false,
    businessDay: false,
    reason: "closed-recurring",
    name: "定休日",
    shiftedFrom: "2026-11-23",
    optionPath: "closedRecurringRules[0]",
    rulePath: "closedRecurringRules[0]",
  });
  // No week has holidays from Monday to Friday (the option that prevents landing on a Saturday rarely matters),
  // so it is checked with an artificial provider
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
    holidayProvider: fiveDays,
    closedRecurringRules: [
      { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [6, 0] },
    ],
  });
  assert.equal(withSkip.isBusinessDay("2026-03-07"), true, "土曜日には落ちない");
  assert.equal(withSkip.isBusinessDay("2026-03-08"), true, "日曜日にも落ちない");
  // The next Monday (the 9th) is the regular closed day itself, so it is an ordinary match, not a move
  assert.equal(withSkip.dayInfoOn("2026-03-09").reason, "closed-recurring");
  assert.equal(withSkip.dayInfoOn("2026-03-09").shiftedFrom, undefined);
  const withoutSkip = createCalendar({
    holidayProvider: fiveDays,
    closedRecurringRules: [{ weekday: 1, holidayOverlapPolicy: "after-holiday" }],
  });
  assert.equal(
    withoutSkip.dayInfoOn("2026-03-07").shiftedFrom,
    "2026-03-02",
    "skipWeekdays がなければ従来どおり土曜日",
  );
  assert.equal(withoutSkip.isBusinessDay("2026-03-09"), false, "翌月曜日は定休日そのもの");
});

test("skipWeekdays: 有効期間は本来の日で判定し、スケジュールでも使える。配列の順番と祝日の扱いとの関係", () => {
  const company = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [
      {
        dayOfMonth: 15,
        months: [6],
        holidayOverlapPolicy: "after-holiday",
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
    holidayProvider: jp,
    weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
    recurringRules: [
      {
        dayOfMonth: 1,
        holidayOverlapPolicy: "after-holiday",
        skipWeekdays: [0, 6],
        value: "meeting",
        name: "毎月 1 日は全社会議（土日祝なら翌営業日）",
      },
    ],
  });
  assert.equal(hours.valueOn("2026-08-03"), "meeting", "8 月 1 日は土曜日 → 3 日（月）");
  assert.equal(hours.dayInfoOn("2026-08-03").shiftedFrom, "2026-08-01");
  assert.equal(hours.valueOn("2026-08-01"), "closed");
  assert.equal(hours.valueOn("2026-09-01"), "meeting", "火曜日なら当日");
  // When the day moved to coincides with another rule's day, the rule written first in the array decides
  const ordered = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    openRecurringRules: [{ weekday: 1, name: "月曜は営業" }],
    closedRecurringRules: [
      {
        dayOfMonth: 15,
        months: [6],
        holidayOverlapPolicy: "after-holiday",
        skipWeekdays: [0, 6],
        name: "創立",
      },
    ],
  });
  assert.equal(ordered.dayInfoOn("2030-06-17").name, "月曜は営業", "openRecurringRules が先");
});

test("skipWeekdays: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { weekday: 1, skipWeekdays: [6] },
      /closedRecurringRules\[0\]\.skipWeekdays: "skipWeekdays" can be used only with "dayAfterHoliday", "dayBeforeHoliday", or holidayOverlapPolicy: "after-holiday"/,
    ],
    [
      { weekday: 1, holidayOverlapPolicy: "under-holiday", skipWeekdays: [6] },
      /closedRecurringRules\[0\]\.skipWeekdays/,
    ],
    [
      { weekday: 1, holidayOverlapPolicy: "over-holiday", skipWeekdays: [6] },
      /closedRecurringRules\[0\]\.skipWeekdays/,
    ],
    [{ holiday: true, skipWeekdays: [6] }, /closedRecurringRules\[0\]\.skipWeekdays/],
    [{ businessDayOfMonth: 1, skipWeekdays: [6] }, /closedRecurringRules\[0\]\.skipWeekdays/],
    [
      { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [1] },
      /closedRecurringRules\[0\]\.skipWeekdays: cannot include the rule's own weekday 1/,
    ],
    [
      { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [] },
      /closedRecurringRules\[0\]\.skipWeekdays/,
    ],
    [
      { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: 6 },
      /closedRecurringRules\[0\]\.skipWeekdays: must be a non-empty array/,
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

test("skipWeekdays: 診断（飛ばす曜日が違えば覆わない）", () => {
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      closedRecurringRules: [
        { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [6] },
        { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [6, 0] },
        { weekday: 1, holidayOverlapPolicy: "after-holiday" },
        { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [6] },
      ],
    }),
    [
      ["warning", "shadowed", "closedRecurringRules[3]", "closedRecurringRules[0]"],
      ["info", "redundant", "closedRecurringRules[0]", "closedRecurringRules[2]"],
      ["info", "redundant", "closedRecurringRules[1]", "closedRecurringRules[2]"],
    ],
    "同じ skipWeekdays だけが shadowed。違う規則は redundant（取り除いても結果が変わらない）で見つかり、出た規則はまとめて取り除ける（[0]・[1] を取り除くと [2] が決める。31 番）",
  );
});
