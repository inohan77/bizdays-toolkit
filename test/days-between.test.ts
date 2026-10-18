import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, isBizdaysError } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";

test("スケジュールの daysBetween は、両端を含む期間の dayInfo を日付順に返す", () => {
  const schedule = createSchedule({
    holidays: jp,
    weekly: [0, 1, 1, 1, 1, 1, 0],
    holiday: { sameAs: 0 },
    dates: [{ date: "2026-11-05", value: 2, name: "特別営業" }],
  });
  const days = schedule.daysBetween("2026-11-02", "2026-11-05");
  assert.deepEqual(
    days.map((d) => d.date),
    ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"],
  );
  assert.deepEqual(
    days,
    days.map((d) => schedule.dayInfo(d.date)),
  );
  assert.equal(days[1]!.reason, "holiday");
  assert.equal(days[3]!.reason, "date");
  assert.ok(Object.isFrozen(days));
  assert.deepEqual(
    schedule.daysBetween("2026-11-02", "2026-11-02").map((d) => d.date),
    ["2026-11-02"],
  );
});

test("祝日の規則が weekday のとき、reason は weekday で、祝日は holiday で分かる", () => {
  const schedule = createSchedule({
    holidays: jp,
    weekly: [1, 1, 1, 1, 1, 1, 1],
    holiday: "weekday",
  });
  const day = schedule.dayInfo("2026-11-03");
  assert.equal(day.reason, "weekday");
  assert.equal(day.holiday?.name, "文化の日");
  const holidays = schedule.daysBetween("2026-11-01", "2026-11-30").filter((d) => d.holiday);
  assert.deepEqual(
    holidays.map((d) => d.date),
    ["2026-11-03", "2026-11-23"],
  );
});

test("営業日カレンダーの daysBetween は、両端を含む期間の dayInfo を返す", () => {
  const calendar = createCalendar({ holidays: jp, closedWeekdays: [0, 6] });
  const days = calendar.daysBetween("2026-11-20", "2026-11-24");
  assert.deepEqual(
    days.map((d) => [d.date, d.businessDay, d.reason]),
    [
      ["2026-11-20", true, "regular"],
      ["2026-11-21", false, "closed-weekday"],
      ["2026-11-22", false, "closed-weekday"],
      ["2026-11-23", false, "holiday"],
      ["2026-11-24", true, "regular"],
    ],
  );
  assert.deepEqual(
    days.filter((d) => d.businessDay).map((d) => d.date),
    calendar.listBusinessDays("2026-11-20", "2026-11-24"),
  );
});

test("daysBetween は from が to より後ならエラー（invalid-range）", () => {
  const calendar = createCalendar({});
  const schedule = createSchedule({ weekly: [0, 0, 0, 0, 0, 0, 0] });
  for (const fn of [
    () => calendar.daysBetween("2026-11-02", "2026-11-01"),
    () => schedule.daysBetween("2026-11-02", "2026-11-01"),
  ]) {
    assert.throws(fn, (e: unknown) => isBizdaysError(e) && e.code === "invalid-range");
  }
});

test("時刻を必ず持つ入力では civilOf の time が必ずある", () => {
  const calendar = createCalendar({ holidays: jp });
  assert.deepEqual(calendar.civilOf(new Date("2026-11-22T15:30:00Z")), {
    date: "2026-11-23",
    time: "00:30",
  });
  assert.equal(calendar.civilOf("2026-11-23T10:00").time, "10:00");
  assert.equal(
    calendar.civilOf({ year: 2026, month: 11, day: 23, hour: 9, minute: 5 }).time,
    "09:05",
  );
  assert.equal(calendar.civilOf("2026-11-23").time, null);
});
