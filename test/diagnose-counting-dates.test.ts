/**
 * 自分の設定を基準に数える第 n 営業日の規則と個別の日付のある設定の診断と、unconfirmedHolidayPolicy: "throw" の
 * redundant、counting-basis の条件（0.32.8 で直した誤り）。個別の日付は数え方を変える（臨時休業日が 1 日入ると、その月・週の
 * 第 n 営業日が後ろにずれる。decisions.md の 16 番）ので、診断は、走査の範囲（提供元なしでは 2001〜2028 年）を個別の日付を
 * 除いて調べ、加えて個別の日付の両端の月・週を、走査の範囲の外でも、日付を残して調べる（31 番）。
 * どのテストも、診断の項目と、項目が言うこと（取り除いても変わらない・変わる、営業日がある）を判定で確かめる
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, type CalendarOptions } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { england } from "../src/uk/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";

type Obj = Record<string, unknown>;

/** 診断の項目（重さ・code・path） */
const items = (list: readonly { severity: string; code: string; path: string }[]): string[] =>
  list.map((d) => `${d.severity} ${d.code} ${d.path}`.trim());
const diagnosed = (o: Obj): string[] => items(diagnoseCalendar(o as CalendarOptions));
/** 判定（例外はエラーコード） */
const at = (o: Obj, date: string): string => {
  try {
    return String(createCalendar(o as CalendarOptions).isBusinessDay(date));
  } catch (e) {
    return `throws ${(e as { code?: string }).code}`;
  }
};
/** 配列 key の i 番目を取り除いた設定 */
const drop = (o: Obj, key: string, i: number): Obj => ({
  ...o,
  [key]: (o[key] as unknown[]).filter((_, k) => k !== i),
});
const COUNT_ALL_BUT_FIRST = { businessDayOfMonth: Array.from({ length: 30 }, (_, i) => i + 2) };
const WEEK_RULES = [{ weekday: 6 }, { businessDayOfWeek: 6, weekStart: 1 }];

test("0.32.8 P7: 数える規則と臨時休業日のある設定に営業日があれば、no-business-day を出さない（日付のない設定・全曜日を閉じた設定には出す）", () => {
  // 1 日を閉じ、2〜31 番目の営業日を閉じる。2026-01-01 を臨時休業日にすると、1 月は 2 日が 1 番目の営業日になり、営業日のまま
  const options = { closedRecurringRules: [{ dayOfMonth: 1 }, COUNT_ALL_BUT_FIRST] };
  const withDate = { ...options, closedDates: ["2026-01-01"] };
  assert.equal(at(withDate, "2026-01-02"), "true");
  assert.deepEqual(diagnosed(withDate), []);
  // 臨時休業日のない同じ設定には、本当に営業日がない
  assert.deepEqual(diagnosed(options), ["warning no-business-day"]);
  // 全曜日を閉じた設定は、数える規則と臨時休業日があっても営業日がない（正しい項目を消さない）
  const allClosed = {
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    closedRecurringRules: [{ businessDayOfMonth: 1 }],
    closedDates: ["2029-03-05", { from: "2040-01-10", to: "2040-02-20" }],
  };
  assert.ok(diagnosed(allClosed).includes("warning no-business-day"), diagnosed(allClosed).join());
});

test("0.32.8 P7: 規則が残した月を個別の日付がすべて閉じる設定には、今までどおり no-business-day を出さない（出る設定を増やさない）", () => {
  // 規則は 2026 年 1 月の最終営業日のほかをすべて閉じ、その月は臨時休業日が閉じる。営業日はないが、0.32.7 も出していない
  // （個別の日付が営業日をすべて閉じる形は、0.33.0 で扱う）
  const all = Array.from({ length: 31 }, (_, i) => i + 1);
  const options = {
    closedWeekdays: [],
    closedRecurringRules: [
      { dayOfMonth: all, effectiveTo: "2025-12-31" },
      { dayOfMonth: all, effectiveFrom: "2026-02-01" },
      { businessDayOfMonth: -1 },
    ],
    closedDates: [{ from: "2026-01-01", to: "2026-01-31" }],
  };
  assert.deepEqual(diagnosed(options), ["info redundant closedRecurringRules[2]"]);
});

test("0.32.8 P8: 走査の範囲の外の臨時営業日の月で決める数える規則に、never-matches を出さない（月の形・週の形）", () => {
  // 2050 年 1 月の土曜を臨時営業日にすると、その月だけ営業日が 26 日あり、規則が 2050-01-31 を閉じる
  const month = {
    closedWeekdays: [0, 6],
    openDates: ["2050-01-01", "2050-01-08", "2050-01-15", "2050-01-22", "2050-01-29"],
    closedRecurringRules: [{ businessDayOfMonth: 26 }],
  };
  assert.equal(
    `${at(month, "2050-01-31")} / ${at(drop(month, "closedRecurringRules", 0), "2050-01-31")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(month), []);
  // 同じ臨時営業日を走査の範囲の中（2026 年）に置いても同じ
  assert.deepEqual(
    diagnosed({
      ...month,
      openDates: ["2026-01-03", "2026-01-10", "2026-01-17", "2026-01-24", "2026-01-31"],
    }),
    [],
  );
  // 週の形: 定休日の日曜のうち 2045-03-05 を開くと、日曜始まりのその週だけ営業日が 6 日あり、規則が金曜（2045-03-10）を閉じる
  const week = {
    closedWeekdays: [0, 6],
    openDates: ["2045-03-05"],
    closedRecurringRules: [{ businessDayOfWeek: 6, weekStart: 0 }],
  };
  assert.equal(
    `${at(week, "2045-03-10")} / ${at(drop(week, "closedRecurringRules", 0), "2045-03-10")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(week), []);
});

test("0.32.8 P9: 走査の範囲の外（2029 年・2000 年以前）の臨時休業日の月・週で決める規則に、redundant を出さない（週の形・月の形）", () => {
  // 週の形: 臨時休業日のある週は 6 番目の営業日が日曜にずれ、その週の土曜を閉じているのは土曜の規則だけ
  for (const [date, saturday] of [
    ["2029-05-08", "2029-05-12"],
    ["1999-05-11", "1999-05-15"],
  ] as const) {
    const week = { closedWeekdays: [], closedRecurringRules: WEEK_RULES, closedDates: [date] };
    assert.equal(
      `${at(week, saturday)} / ${at(drop(week, "closedRecurringRules", 0), saturday)}`,
      "false / true",
      date,
    );
    assert.deepEqual(diagnosed(week), ["info counting-basis closedRecurringRules[1]"], date);
  }
  // 日付を走査の範囲の中（2028 年）に置いた設定と、日付のない設定は、今までどおり
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [],
      closedRecurringRules: WEEK_RULES,
      closedDates: ["2028-05-09"],
    }),
    ["info counting-basis closedRecurringRules[1]"],
  );
  assert.deepEqual(diagnosed({ closedWeekdays: [], closedRecurringRules: WEEK_RULES }), [
    "info counting-basis closedRecurringRules[1]",
    "info redundant closedRecurringRules[0]",
  ]);
  // 月の形: 2042-05-01 を閉じると、2 番目の営業日が 5 月 3 日にずれ、5 月 2 日を閉じているのは 2 日の規則だけ
  const month = {
    closedWeekdays: [],
    closedRecurringRules: [{ dayOfMonth: 2 }, { businessDayOfMonth: 2 }],
    closedDates: ["2042-05-01"],
  };
  assert.equal(
    `${at(month, "2042-05-02")} / ${at(drop(month, "closedRecurringRules", 0), "2042-05-02")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(month), []);
});

test("0.32.8 P9: 日付の期間の終わりの月（始まりと違う月）で決める規則に、redundant を出さない", () => {
  const options = {
    closedWeekdays: [],
    closedRecurringRules: [{ dayOfMonth: 2 }, { businessDayOfMonth: 2 }],
    closedDates: [{ from: "2042-03-10", to: "2042-05-01" }],
  };
  assert.equal(
    `${at(options, "2042-05-02")} / ${at(drop(options, "closedRecurringRules", 0), "2042-05-02")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(options), []);
});

test("0.32.8 P9: 日付の月をまたぐ端の週（翌月の初めの日）で決める規則に、redundant を出さない", () => {
  // 2029-04-30（月）を閉じると、その週（5 月 5 日の土曜まで）の 6 番目の営業日が日曜にずれる
  const options = {
    closedWeekdays: [],
    closedRecurringRules: WEEK_RULES,
    closedDates: ["2029-04-30"],
  };
  assert.equal(
    `${at(options, "2029-05-05")} / ${at(drop(options, "closedRecurringRules", 0), "2029-05-05")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(options), ["info counting-basis closedRecurringRules[1]"]);
});

test("0.32.8 P9: 200 年を超える日付と並べても、走査の範囲の外の日付の週で決める規則に redundant を出さない", () => {
  const options = {
    closedWeekdays: [],
    closedRecurringRules: WEEK_RULES,
    closedDates: ["2029-05-08", { from: "2300-01-01", to: "2600-01-01" }],
  };
  assert.equal(
    `${at(options, "2029-05-12")} / ${at(drop(options, "closedRecurringRules", 0), "2029-05-12")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(options), ["info counting-basis closedRecurringRules[1]"]);
});

test("0.32.8 P11: 走査の範囲を覆う長い臨時休業日の外の年で決める規則を、使われないと出さない（数える規則のない設定と同じ）", () => {
  // 2000〜2030 年を閉じた設定。1999 年以前と 2031 年以降は、規則が判定を決めている
  const options = {
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: -1 }],
    closedDates: [{ from: "2000-01-01", to: "2030-12-31" }],
  };
  assert.equal(
    `${at(options, "1999-06-01")} / ${at(drop(options, "closedRecurringRules", 0), "1999-06-01")}`,
    "false / true",
  );
  assert.equal(
    `${at(options, "2031-06-30")} / ${at(drop(options, "closedRecurringRules", 1), "2031-06-30")}`,
    "false / true",
  );
  assert.deepEqual(diagnosed(options), []);
  // 数える規則のない同じ設定も、何も出ない
  assert.deepEqual(diagnosed({ ...options, closedRecurringRules: [{ dayOfMonth: 1 }] }), []);
});

test("0.32.8 P11: 開業の前（1000-01-01 から）・9999 年までの長い臨時休業日でも、日付の外の年で決める規則を使われないと出さない", () => {
  const rules = {
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: -1 }],
  };
  for (const [range, day] of [
    [{ from: "1000-01-01", to: "2029-03-31" }, "2029-05-01"],
    [{ from: "2000-01-01", to: "9999-12-31" }, "1999-06-01"],
  ] as const) {
    const options = { ...rules, closedDates: [range] };
    assert.equal(
      `${at(options, day)} / ${at(drop(options, "closedRecurringRules", 0), day)}`,
      "false / true",
      JSON.stringify(range),
    );
    assert.deepEqual(diagnosed(options), [], JSON.stringify(range));
  }
});

test("0.32.8 P11: 長い臨時営業日の内側の月でだけ当てはまる数える規則は、never-matches ではなく redundant（使われない）", () => {
  // 全曜日を閉じ、2026-09-10 から 2276-06-15 までを臨時営業日にする。22 番目の営業日は、臨時営業日の内側の月にだけあり、
  // その日は臨時営業日が決めるので、規則は当てはまる日があるが使われない
  const options = {
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    openDates: [{ from: "2026-09-10", to: "2276-06-15" }],
    closedRecurringRules: [{ dayOfMonth: 2 }, { businessDayOfMonth: 22 }],
  };
  assert.deepEqual(diagnosed(options), [
    "info redundant closedRecurringRules[0]",
    "info redundant closedRecurringRules[1]",
  ]);
  const found = diagnoseCalendar(options as CalendarOptions).find(
    (d) => d.path === "closedRecurringRules[1]",
  );
  assert.match(found!.message, /never used: other rules decide every day it matches/);
});

test('0.32.8 P10: unconfirmedHolidayPolicy: "throw" で、取り除くと未確定の祝日で例外になる日ができる規則を redundant にしない（日本・英国。"accept" では出る）', () => {
  for (const [provider, day] of [
    [jp, "2028-09-23"],
    [england, "2029-03-31"],
  ] as const) {
    const options = {
      holidayProvider: provider,
      unconfirmedHolidayPolicy: "throw",
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ weekday: 6 }, { weekday: 1, holidayOverlapPolicy: "after-holiday" }],
    };
    assert.equal(
      `${at(options, day)} / ${at(drop(options, "closedRecurringRules", 0), day)}`,
      "false / throws unconfirmed-holiday",
      provider.id,
    );
    assert.deepEqual(diagnosed(options), [], provider.id);
    assert.deepEqual(
      diagnosed({ ...options, unconfirmedHolidayPolicy: "accept" }),
      ["info redundant closedRecurringRules[0]"],
      provider.id,
    );
  }
  // 取り除いても例外にならない規則（英国の提供元の、日曜を閉じる規則）は、"throw" でも今までどおり出る
  assert.deepEqual(
    diagnosed({
      holidayProvider: england,
      unconfirmedHolidayPolicy: "throw",
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ weekday: 0 }, { weekday: 1, holidayOverlapPolicy: "after-holiday" }],
    }),
    ["info redundant closedRecurringRules[0]"],
  );
});

test('0.32.8 P10: スケジュールでも、unconfirmedHolidayPolicy: "throw" で取り除くと例外になる日ができる規則を redundant にしない', () => {
  const options = {
    holidayProvider: jp,
    unconfirmedHolidayPolicy: "throw",
    weekdayValues: [null, "a", "a", "a", "a", "a", null],
    recurringRules: [
      { weekday: 6, value: null },
      { weekday: 1, holidayOverlapPolicy: "after-holiday", value: "b" },
    ],
  } as const;
  const valueAt = (o: Obj): string => {
    try {
      return JSON.stringify(createSchedule(o as never).valueOn("2028-09-23"));
    } catch (e) {
      return `throws ${(e as { code?: string }).code}`;
    }
  };
  assert.equal(
    `${valueAt(options)} / ${valueAt(drop(options, "recurringRules", 0))}`,
    "null / throws unconfirmed-holiday",
  );
  assert.deepEqual(items(diagnoseSchedule(options)), []);
  assert.deepEqual(items(diagnoseSchedule({ ...options, unconfirmedHolidayPolicy: "accept" })), [
    "info redundant recurringRules[0]",
  ]);
});

test("0.32.8 K6: 定休日の扱いを変えない毎週の曜日の規則に counting-basis を出さない（変える規則には出す）", () => {
  // 月曜が定休日なら、月曜を閉じる規則は数え方に関わらない（規則は redundant）
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [1],
      closedRecurringRules: [{ weekday: 1 }, { businessDayOfMonth: 3 }],
    }),
    ["info redundant closedRecurringRules[0]"],
  );
  // 月曜が定休日でなければ、月曜を開く規則は数え方に関わらない
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [0],
      openRecurringRules: [{ weekday: 1 }],
      closedRecurringRules: [{ businessDayOfMonth: 3 }],
    }),
    [],
  );
  // 定休日でない曜日を閉じる規則、定休日を開く規則は、数え方に関わるので出す
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [0],
      closedRecurringRules: [{ weekday: 1 }, { businessDayOfMonth: 3 }],
    }),
    ["info counting-basis closedRecurringRules[1]"],
  );
  assert.deepEqual(
    diagnosed({
      closedWeekdays: [0],
      openRecurringRules: [{ weekday: 0 }],
      closedRecurringRules: [{ businessDayOfMonth: 3 }],
    }),
    ["info counting-basis closedRecurringRules[0]"],
  );
});
