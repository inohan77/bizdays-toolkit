import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
  type RecurringRule,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";

const brief = (
  issues: readonly { severity: string; code: string; path: string; relatedPath?: string }[],
) => issues.map((d) => [d.severity, d.code, d.path, d.relatedPath ?? ""]);

test("第 n 営業日: 月末最終営業日・第 n 営業日を、定休日・祝日・毎年の休業日を除いて数える", () => {
  const branch = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedAnnualDates: [{ from: "12-31", to: "01-03" }],
    closedRecurringRules: [
      { businessDayOfMonth: -1, name: "月末最終営業日は来店予約を停止" },
      { businessDayOfMonth: [1, 5], months: [1, 4, 7, 10], name: "四半期初の第 1・第 5 営業日" },
    ],
  });
  // 10 月 31 日は土曜日なので 30 日が最終営業日
  assert.deepEqual(branch.dayInfoOn("2026-10-30"), {
    date: "2026-10-30",
    weekday: 5,
    open: false,
    businessDay: false,
    reason: "closed-recurring",
    name: "月末最終営業日は来店予約を停止",
    optionPath: "closedRecurringRules[0]",
    rulePath: "closedRecurringRules[0]",
  });
  assert.equal(branch.isBusinessDay("2026-10-29"), true);
  // 12 月 31 日から休業なので 30 日が最終営業日（毎年の休業日は数えに入らない）
  assert.equal(branch.dayInfoOn("2026-12-30").reason, "closed-recurring");
  assert.equal(branch.isBusinessDay("2026-12-29"), true);
  // 四半期初: 2027 年 1 月は 4 日が第 1 営業日（1〜3 日は休業）、8 日が第 5 営業日
  assert.equal(branch.dayInfoOn("2027-01-04").name, "四半期初の第 1・第 5 営業日");
  assert.equal(branch.dayInfoOn("2027-01-08").name, "四半期初の第 1・第 5 営業日");
  assert.equal(branch.isBusinessDay("2027-01-07"), true);
  assert.equal(branch.isBusinessDay("2026-02-02"), true, "months の外の第 1 営業日は営業");
  // 祝日は数えに入らない: 2026 年 5 月は 1 日（金）が第 1 営業日、7 日（木）が第 2 営業日（3〜6 日は祝日・振替）
  const may = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: 2 }],
  });
  assert.equal(may.isBusinessDay("2026-05-07"), false);
  assert.equal(may.isBusinessDay("2026-05-01"), true);
  // メソッドは規則を適用した後の実際の営業日を返す
  assert.equal(branch.lastBusinessDayOfMonth("2026-10"), "2026-10-29");
  assert.equal(branch.firstBusinessDayOfMonth("2027-01"), "2027-01-05");
  // -2 はその前、31 日ある月の末日が月曜日なら最終営業日は暦の末日
  const prev = createCalendar({
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: -2 }],
  });
  assert.equal(
    prev.isBusinessDay("2026-08-28"),
    false,
    "8 月 31 日（月）が最終、28 日（金）がその前",
  );
  assert.equal(prev.isBusinessDay("2026-08-31"), true);
});

test("第 n 営業日: 数える基準は繰り返しの規則を除いた判定（自分自身・ほかの繰り返しの規則・臨時休業日の扱い）", () => {
  // 定休日を closedRecurringRules の曜日の規則で書くと、その曜日も営業日として数える（限界。診断で知らせる）
  const byRule = createCalendar({
    closedRecurringRules: [
      { businessDayOfMonth: -1, name: "最終" },
      { weekday: 0 },
      { weekday: 6 },
    ],
  });
  assert.equal(byRule.dayInfoOn("2026-10-31").name, "最終", "土曜日の 31 日が基準の最終営業日");
  assert.equal(byRule.dayInfoOn("2026-10-31").reason, "closed-recurring");
  assert.equal(byRule.dayInfoOn("2026-10-30").reason, "default");
  // 臨時休業日（closedDates）は数えに入らない。個別の日付は規則より優先される
  const closed = createCalendar({
    closedWeekdays: [0, 6],
    closedDates: ["2026-10-30"],
    closedRecurringRules: [{ businessDayOfMonth: -1, name: "最終" }],
  });
  assert.equal(closed.dayInfoOn("2026-10-29").name, "最終");
  assert.equal(closed.dayInfoOn("2026-10-30").reason, "closed-date");
  // 臨時営業日（openDates）は数えに入る
  const open = createCalendar({
    closedWeekdays: [0, 6],
    openDates: ["2026-10-31"],
    closedRecurringRules: [{ businessDayOfMonth: -1, name: "最終" }],
  });
  assert.equal(open.dayInfoOn("2026-10-31").reason, "open-date", "個別の日付が優先");
  assert.equal(open.dayInfoOn("2026-10-30").reason, "default", "基準では 31 日が最終営業日");
  // holidayPolicy: "open" なら祝日も営業日として数える（第 n 営業日が祝日になりうる）
  // 祝日自身の扱いは祝日の段階（holidayPolicy）が決め、この規則は当てはまらない（例外は祝日の規則で書く）
  const openHolidays = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: [1, 2], name: "第 1・2 営業日" }],
  });
  assert.equal(
    openHolidays.dayInfoOn("2026-01-01").reason,
    "holiday",
    "元日が第 1 営業日だが祝日の扱いが優先",
  );
  assert.equal(openHolidays.isBusinessDay("2026-01-01"), true);
  assert.equal(openHolidays.dayInfoOn("2026-01-02").name, "第 1・2 営業日", "2 日が第 2 営業日");
  assert.equal(openHolidays.isBusinessDay("2026-01-05"), true, "5 日は第 3 営業日");
  // 「第 1 営業日は祝日でも休業」は "over-holiday" で書く（祝日の段階より先に判定する）
  const over = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedWeekdays: [0, 6],
    closedRecurringRules: [
      { businessDayOfMonth: 1, holidayOverlapPolicy: "over-holiday", name: "棚卸" },
    ],
  });
  assert.equal(over.dayInfoOn("2026-01-01").name, "棚卸");
  assert.equal(over.dayInfoOn("2026-01-01").holiday?.key, "new-year", "holiday は付く");
  assert.equal(over.dayInfoOn("2026-02-02").name, "棚卸", "祝日でない月も同じ");
  // holidayPolicy: "ignore" なら祝日は曜日どおりで、この規則も当てはまる
  const ignore = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "ignore",
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: 1, name: "第 1 営業日" }],
  });
  assert.equal(ignore.dayInfoOn("2026-01-01").name, "第 1 営業日");
  // 有効期間・配列の順番（先に書いた規則が優先）
  const ordered = createCalendar({
    closedWeekdays: [0, 6],
    openRecurringRules: [
      { businessDayOfMonth: -1, name: "最終は営業", effectiveFrom: "2027-01-01" },
    ],
    closedRecurringRules: [{ businessDayOfMonth: -1, name: "最終は休業" }],
  });
  assert.equal(ordered.dayInfoOn("2026-10-30").name, "最終は休業");
  assert.equal(ordered.dayInfoOn("2027-01-29").name, "最終は営業", "openRecurringRules が優先");
});

test("第 n 営業日: スケジュールでは基準のカレンダーを calendar で指定する", () => {
  const branch = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const hours = createSchedule<string>({
    holidayProvider: jp,
    weekdayValues: ["closed", "full", "full", "full", "full", "full", "half"],
    recurringRules: [
      {
        businessDayOfMonth: -1,
        calendar: branch,
        value: "short",
        name: "月末最終営業日は締め作業で短縮",
      },
    ],
  });
  assert.deepEqual(hours.dayInfoOn("2026-10-30"), {
    date: "2026-10-30",
    weekday: 5,
    value: "short",
    reason: "recurring",
    name: "月末最終営業日は締め作業で短縮",
    optionPath: "recurringRules[0]",
    rulePath: "recurringRules[0]",
  });
  assert.equal(hours.valueOn("2026-10-29"), "full");
  // 基準はカレンダーの実際の営業日（カレンダーの規則を適用した後）
  const withRule = createCalendar({
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ businessDayOfMonth: -1 }],
  });
  const s2 = createSchedule<number>({
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    recurringRules: [{ businessDayOfMonth: -1, calendar: withRule, value: 9 }],
  });
  assert.equal(s2.valueOn("2026-10-29"), 9, "カレンダーでは 30 日が休業なので 29 日が最終営業日");
  assert.equal(s2.valueOn("2026-10-30"), 1);
  // スケジュールから作ったカレンダーの基準に、別のカレンダーを参照できる（循環しない）
  const fromSchedule = createCalendarFromSchedule(hours, (v) => v !== "closed");
  assert.equal(fromSchedule.isBusinessDay("2026-10-30"), true);
  assert.equal(fromSchedule.dayInfoOn("2026-10-30").name, "月末最終営業日は締め作業で短縮");
  // 合成にも使える
  const combined = combineCalendars(
    [
      createCalendar({
        holidayProvider: jp,
        closedWeekdays: [0, 6],
        closedRecurringRules: [{ businessDayOfMonth: -1 }],
      }),
      branch,
    ],
    { open: "all" },
  );
  assert.equal(combined.isBusinessDay("2026-10-30"), false);
  assert.equal(combined.dayInfoOn("2026-10-30").decidedBy, 0);
});

test("第 n 営業日: 入力の誤り", () => {
  const branch = createCalendar({ holidayProvider: jp });
  const cases: [unknown, string, RegExp][] = [
    [
      { businessDayOfMonth: 0 },
      "invalid-option",
      /closedRecurringRules\[0\]\.businessDayOfMonth: must be 1-31/,
    ],
    [{ businessDayOfMonth: 32 }, "invalid-option", /closedRecurringRules\[0\]\.businessDayOfMonth/],
    [{ businessDayOfMonth: [] }, "invalid-option", /closedRecurringRules\[0\]\.businessDayOfMonth/],
    [
      { businessDayOfMonth: "last" },
      "invalid-option",
      /closedRecurringRules\[0\]\.businessDayOfMonth/,
    ],
    [
      { businessDayOfMonth: -1, holidayOverlapPolicy: "after-holiday" },
      "invalid-option",
      /closedRecurringRules\[0\]\.holidayOverlapPolicy: "after-holiday" cannot be used with "businessDayOfMonth"/,
    ],
    [
      { businessDayOfMonth: -1, holidayOverlapPolicy: "nearest" },
      "invalid-option",
      /closedRecurringRules\[0\]\.holidayOverlapPolicy/,
    ],
    [
      { businessDayOfMonth: -1, calendar: branch },
      "invalid-option",
      /closedRecurringRules\[0\]\.calendar: "calendar" cannot be used in a calendar/,
    ],
    [
      { weekday: 1, calendar: branch },
      "invalid-option",
      /closedRecurringRules\[0\]\.calendar: "calendar" can be used only with "businessDayOfMonth"/,
    ],
    [{ businessDayOfMonth: -1, dayOfMonth: 1 }, "invalid-option", /must have exactly one of/],
    [{ businessDayOfMonth: -1, nth: 1 }, "invalid-option", /closedRecurringRules\[0\]\.nth/],
    [
      { businessDayOfMonth: -1, weekdays: [1] },
      "invalid-option",
      /closedRecurringRules\[0\]\.weekdays/,
    ],
    [
      { businessDayOfMonth: -1, skipWeekdays: [6] },
      "invalid-option",
      /closedRecurringRules\[0\]\.skipWeekdays/,
    ],
  ];
  for (const [entry, code, message] of cases) {
    assert.throws(
      () => createCalendar({ holidayProvider: jp, closedRecurringRules: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === code && message.test(e.message),
      JSON.stringify(entry),
    );
  }
  // スケジュール: calendar は必須で、作成済みのカレンダーであること、タイムゾーンが同じであること
  assert.throws(
    () =>
      createSchedule({
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        recurringRules: [{ businessDayOfMonth: 1, value: 2 } as never],
      }),
    (e: unknown) =>
      isBizdaysError(e) &&
      e.code === "invalid-option" &&
      /recurringRules\[0\]\.calendar: must be a calendar/.test(e.message),
  );
  assert.throws(
    () =>
      createSchedule({
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        recurringRules: [
          { businessDayOfMonth: 1, calendar: { isBusinessDay: 1 }, value: 2 } as never,
        ],
      }),
    (e: unknown) => isBizdaysError(e) && e.code === "invalid-option",
  );
  assert.throws(
    () =>
      createSchedule({
        timeZone: "UTC",
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        recurringRules: [{ businessDayOfMonth: 1, calendar: branch, value: 2 }],
      }),
    (e: unknown) =>
      isBizdaysError(e) &&
      e.code === "time-zone-conflict" &&
      /recurringRules\[0\]\.calendar/.test(e.message),
  );
  // 診断でも同じ誤りが error で返る
  assert.deepEqual(
    brief(diagnoseCalendar({ closedRecurringRules: [{ businessDayOfMonth: 0 }] })).map((x) =>
      x.slice(0, 3),
    ),
    [["error", "invalid-option", "closedRecurringRules[0].businessDayOfMonth"]],
  );
});

test("第 n 営業日: 診断（never-matches・counting-basis・shadowed・redundant）", () => {
  // 23 営業日ある月は存在しない（土日休みでは最大 23 日）
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidayProvider: jp,
        closedWeekdays: [0, 6],
        closedRecurringRules: [{ businessDayOfMonth: 24 }],
      }),
    ),
    [["warning", "never-matches", "closedRecurringRules[0]", ""]],
  );
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [0, 6],
        closedRecurringRules: [{ businessDayOfMonth: 23 }],
      }),
    ),
    [],
    "提供元がなくても判定する（2026 年 12 月は 23 営業日）",
  );
  // 定休日を曜日の規則で書いた設定は counting-basis（info）
  assert.deepEqual(
    brief(diagnoseCalendar({ closedRecurringRules: [{ weekday: 0 }, { businessDayOfMonth: -1 }] })),
    [["info", "counting-basis", "closedRecurringRules[1]", "closedRecurringRules[0]"]],
  );
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [0],
        closedRecurringRules: [{ weekday: 3, nth: 3 }, { businessDayOfMonth: -1 }],
      }),
    ),
    [],
    "第 n 曜日の規則は定休日ではないので知らせない",
  );
  // holidayPolicy: "closed" では "over-holiday" は結果を変えない（info）
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidayProvider: jp,
        closedRecurringRules: [{ businessDayOfMonth: 1, holidayOverlapPolicy: "over-holiday" }],
      }),
    ),
    [["info", "redundant", "closedRecurringRules[0].holidayOverlapPolicy", ""]],
  );
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidayProvider: jp,
        holidayPolicy: "open",
        closedRecurringRules: [{ businessDayOfMonth: 1, holidayOverlapPolicy: "over-holiday" }],
      }),
    ),
    [],
  );
  // 同じ形の規則どうしの shadowed（n・months の包含）
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [0, 6],
        closedRecurringRules: [
          { businessDayOfMonth: [-1, -2] },
          { businessDayOfMonth: -1, months: [3] },
          { businessDayOfMonth: 1 },
        ],
      }),
    ),
    [["warning", "shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"]],
  );
  // 種類をまたぐ重なりは redundant（最終営業日が常に末日になる設定はない）
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [0, 6],
        closedRecurringRules: [{ dayOfMonth: -1 }, { businessDayOfMonth: -1, months: [2] }],
      }),
    ),
    [],
  );
  // スケジュール: 基準のカレンダーが違えば覆わない
  const a = createCalendar({ closedWeekdays: [0, 6] });
  const b = createCalendar({ closedWeekdays: [0] });
  assert.deepEqual(
    brief(
      diagnoseSchedule({
        weekdayValues: [0, 1, 1, 1, 1, 1, 0],
        recurringRules: [
          { businessDayOfMonth: -1, calendar: a, value: 2 },
          { businessDayOfMonth: -1, calendar: b, value: 3 },
          { businessDayOfMonth: -1, calendar: a, value: 4 },
        ],
      }),
    ),
    [["warning", "shadowed", "recurringRules[2]", "recurringRules[0]"]],
  );
});
