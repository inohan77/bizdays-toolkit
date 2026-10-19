import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";

type Hours = { readonly open: string; readonly close: string } | null;
const weekday: Hours = { open: "10:00", close: "18:00" };
const hours = createSchedule<Hours>({
  holidays: jp,
  weekly: [null, weekday, weekday, weekday, weekday, weekday, { open: "10:00", close: "17:00" }],
  holiday: { sameAs: 0 },
  annual: [
    { from: "12-31", to: "01-03", value: null, name: "年末年始" },
    { date: "01-04", value: { open: "11:00", close: "15:00" }, name: "仕事始め" },
  ],
  recurring: [
    {
      holiday: true,
      kinds: ["substitute"],
      value: { open: "10:00", close: "17:00" },
      name: "振替休日は営業",
    },
    { weekday: 3, nth: 3, value: null, name: "第 3 水曜休業" },
  ],
  dates: [{ date: "2026-10-20", value: null, name: "臨時休業" }],
});
const calendar = createCalendarFromSchedule(hours, (v) => v !== null);

test("スケジュールからのカレンダー: isOpen の結果で営業日が決まり、通常のカレンダーとして使える", () => {
  assert.deepEqual(
    [
      "2026-10-19",
      "2026-10-18",
      "2026-10-21",
      "2026-11-23",
      "2026-05-06",
      "2027-01-01",
      "2027-01-04",
    ].map((d) => calendar.isBusinessDay(d)),
    [true, false, false, false, true, false, true],
  );
  assert.equal(calendar.addBusinessDays("2026-12-29", 2), "2027-01-04", "年末年始をまたぐ");
  assert.equal(calendar.nextBusinessDay("2026-12-31"), "2027-01-04");
  assert.equal(calendar.businessDaysBetween("2026-12-28", "2027-01-11"), 9);
  assert.equal(calendar.adjust("2027-01-02", { convention: "following" }), "2027-01-04");
  assert.equal(calendar.lastBusinessDayOfMonth("2026-12"), "2026-12-30");
  assert.equal(calendar.dueDate("2027-01", { day: 1, convention: "following" }), "2027-01-04");
  // 祝日・タイムゾーン・outOfRange はスケジュールのもの
  assert.equal(calendar.timeZone, "Asia/Tokyo");
  assert.equal(calendar.outOfRange, "throw");
  assert.equal(calendar.providers[0], jp);
  assert.equal(calendar.isHoliday("2027-01-01"), true);
  assert.ok(Object.isFrozen(calendar));
});

test("スケジュールからのカレンダー: reason の対応（annual で営業になる日は open-annual）", () => {
  assert.deepEqual(calendar.dayInfo("2027-01-04"), {
    date: "2027-01-04",
    weekday: 1,
    businessDay: true,
    reason: "open-annual",
    name: "仕事始め",
    rulePath: "annual[1]",
  });
  assert.equal(calendar.dayInfo("2027-01-02").reason, "closed-annual");
  assert.equal(calendar.dayInfo("2026-10-20").reason, "closed-date");
  assert.equal(calendar.dayInfo("2026-10-20").rulePath, "dates[0]");
  assert.equal(
    calendar.dayInfo("2026-05-06").reason,
    "open-recurring",
    "振替休日は営業（祝日の規則）",
  );
  assert.equal(calendar.dayInfo("2026-05-06").holiday?.kind, "substitute");
  assert.equal(calendar.dayInfo("2026-10-21").reason, "closed-recurring");
  assert.equal(calendar.dayInfo("2026-11-23").reason, "holiday", "祝日の扱いで休業");
  assert.equal(calendar.dayInfo("2026-10-19").reason, "regular");
  assert.equal(calendar.dayInfo("2026-10-18").reason, "closed-weekday");
  assert.equal(
    calendar.dayInfo("2026-10-18").name,
    undefined,
    "曜日で決まった日には名前を付けない",
  );
  // 祝日の扱いで営業になる祝日も reason は "holiday"（createCalendar の holidayPolicy: "open" と同じ）
  const openOnHolidays = createCalendarFromSchedule(
    createSchedule<Hours>({
      holidays: jp,
      weekly: [null, weekday, weekday, weekday, weekday, weekday, weekday],
      holiday: { value: weekday },
    }),
    (v) => v !== null,
  );
  assert.equal(openOnHolidays.dayInfo("2026-11-23").reason, "holiday");
  assert.equal(openOnHolidays.dayInfo("2026-11-23").businessDay, true);
  // 祝日が曜日どおり（"weekday"）なら regular / closed-weekday
  const ignore = createCalendarFromSchedule(
    createSchedule<Hours>({
      holidays: jp,
      weekly: [null, weekday, weekday, weekday, weekday, weekday, weekday],
      holiday: "weekday",
    }),
    (v) => v !== null,
  );
  assert.equal(ignore.dayInfo("2026-11-23").reason, "regular");
  assert.equal(ignore.dayInfo("2026-11-23").holiday?.name, "勤労感謝の日");
});

test("スケジュールからのカレンダー: isOpen は値だけを受け取る。合成にも渡せる", () => {
  const received: unknown[] = [];
  const probe = createCalendarFromSchedule(hours, (...args) => {
    received.push(args);
    return args[0] !== null;
  });
  probe.isBusinessDay("2026-10-19");
  assert.deepEqual(received, [[weekday]], "引数は値 1 つだけ");
  // 営業時間が 17:00 までの日だけを営業日とみなす、のような値の条件も書ける
  const until18 = createCalendarFromSchedule(hours, (v) => v !== null && v.close === "18:00");
  assert.equal(until18.isBusinessDay("2026-10-17"), false, "土曜は 17:00 まで");
  assert.equal(until18.isBusinessDay("2026-10-19"), true);
  const combined = combineCalendars(
    [calendar, createCalendar({ holidays: jp, closedWeekdays: [3] })],
    {
      businessDay: "all",
    },
  );
  assert.deepEqual(combined.dayInfo("2027-01-04"), {
    date: "2027-01-04",
    weekday: 1,
    businessDay: true,
    reason: "open-annual",
    name: "仕事始め",
    rulePath: "annual[1]",
    decidedBy: 0,
  });
  assert.equal(combined.dayInfo("2026-10-14").decidedBy, 1);
});

test("スケジュールからのカレンダー: 入力の誤り・maxSearchDays", () => {
  const cases: [() => unknown, string, RegExp][] = [
    [
      () => createCalendarFromSchedule({} as never, () => true),
      "invalid-argument",
      /schedule must be a schedule created by createSchedule/,
    ],
    [
      () => createCalendarFromSchedule(calendar as never, () => true),
      "invalid-argument",
      /schedule must be/,
    ],
    [
      () => createCalendarFromSchedule(hours, "open" as never),
      "invalid-argument",
      /isOpen must be a function/,
    ],
    [
      () => createCalendarFromSchedule(hours, () => true, { maxSearchDays: 0 }),
      "invalid-option",
      /maxSearchDays/,
    ],
  ];
  for (const [fn, code, message] of cases) {
    assert.throws(
      fn,
      (e: unknown) => isBizdaysError(e) && e.code === code && message.test(e.message),
      code,
    );
  }
  const never = createCalendarFromSchedule(hours, () => false, { maxSearchDays: 10 });
  assert.throws(
    () => never.nextBusinessDay("2026-10-19"),
    (e: unknown) => isBizdaysError(e) && e.code === "no-business-day" && /10 days/.test(e.message),
  );
  // isOpen の戻り値は true かどうかで判定する（truthy ではない）
  const strict = createCalendarFromSchedule(
    hours,
    (v) => (v === null ? 0 : 1) as unknown as boolean,
  );
  assert.equal(strict.isBusinessDay("2026-10-19"), false);
});
