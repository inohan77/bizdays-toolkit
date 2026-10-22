import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, isBizdaysError } from "../src/index.ts";
import { easterSunday } from "../src/core/date.ts";
import { england, northernIreland, scotland, wales } from "../src/uk/index.ts";

test("復活祭の日曜日", () => {
  assert.equal(easterSunday(2024), "2024-03-31");
  assert.equal(easterSunday(2025), "2025-04-20");
  assert.equal(easterSunday(2038), "2038-04-25"); // 最も遅い日
  assert.equal(easterSunday(2285), "2285-03-22"); // 最も早い日
});

test("提供元の ID・タイムゾーン・対応年", () => {
  assert.deepEqual(
    [england, wales, scotland, northernIreland].map((p) => p.id),
    ["GB-ENG", "GB-WLS", "GB-SCT", "GB-NIR"],
  );
  for (const p of [england, wales, scotland, northernIreland]) {
    assert.equal(p.timeZone, "Europe/London");
    assert.deepEqual(p.supportedYears, { from: 2012, to: 2099 });
  }
});

test("対応年の外は out-of-range", () => {
  const calendar = createCalendar({ holidays: scotland });
  assert.throws(
    () => calendar.isHoliday("2011-12-26"),
    (e: unknown) => isBizdaysError(e) && e.code === "out-of-range",
  );
  assert.throws(() => calendar.isHoliday("2100-01-01"));
});

test("地域ごとの祝日（予測の年）", () => {
  // 2030 年: 1 月 1 日が火曜日、3 月 17 日が日曜日、7 月 12 日が金曜日、11 月 30 日が土曜日
  const names = (list: readonly { date: string; name: string; kind: string }[]): string[] =>
    list.map((h) => `${h.date} ${h.kind} ${h.name}`);
  assert.deepEqual(names(scotland.holidaysInYear(2030)), [
    "2030-01-01 regular New Year’s Day",
    "2030-01-02 regular 2nd January",
    "2030-04-19 regular Good Friday",
    "2030-05-06 regular Early May bank holiday",
    "2030-05-27 regular Spring bank holiday",
    "2030-08-05 regular Summer bank holiday",
    "2030-12-02 substitute St Andrew’s Day",
    "2030-12-25 regular Christmas Day",
    "2030-12-26 regular Boxing Day",
  ]);
  assert.deepEqual(names(northernIreland.holidaysInYear(2030)), [
    "2030-01-01 regular New Year’s Day",
    "2030-03-18 substitute St Patrick’s Day",
    "2030-04-19 regular Good Friday",
    "2030-04-22 regular Easter Monday",
    "2030-05-06 regular Early May bank holiday",
    "2030-05-27 regular Spring bank holiday",
    "2030-07-12 regular Battle of the Boyne (Orangemen’s Day)",
    "2030-08-26 regular Summer bank holiday",
    "2030-12-25 regular Christmas Day",
    "2030-12-26 regular Boxing Day",
  ]);
});

test("振替は日付順に、祝日でない平日へ割り当てる", () => {
  const sub = (p: typeof england, year: number) =>
    p
      .holidaysInYear(year)
      .filter((h) => h.kind === "substitute")
      .map((h) => `${h.date} ${h.name}`);
  // 2033 年: クリスマスが日曜日 → Boxing Day（月）はそのまま、クリスマスの振替は火曜日
  assert.deepEqual(sub(england, 2033), [
    "2033-01-03 New Year’s Day", // 1 月 1 日が土曜日
    "2033-12-27 Christmas Day",
  ]);
  // 2032 年: クリスマスが土曜日 → 27 日（月）・28 日（火）
  assert.deepEqual(sub(england, 2032), ["2032-12-27 Christmas Day", "2032-12-28 Boxing Day"]);
  // 2033 年の Scotland: 1 月 1 日が土曜日 → 3 日（月）・4 日（火）
  assert.deepEqual(sub(scotland, 2033).slice(0, 2), [
    "2033-01-03 New Year’s Day",
    "2033-01-04 2nd January",
  ]);
});

test("England と Wales は同じ日付で、Wales だけウェールズ語の名称を持つ", () => {
  const e = england.holidaysInYear(2026);
  const w = wales.holidaysInYear(2026);
  assert.deepEqual(
    w.map((h) => h.date),
    e.map((h) => h.date),
  );
  assert.equal(w[0]!.names?.["cy"], "Dydd Calan");
});

test("複数の地域を和集合で使える（タイムゾーンが同じなので指定は不要）", () => {
  const calendar = createCalendar({ holidays: [england, scotland] });
  assert.equal(calendar.isHoliday("2026-01-02"), true); // Scotland の 2nd January
  assert.equal(calendar.isHoliday("2026-04-06"), true); // England の Easter Monday
  assert.equal(calendar.isHoliday("2026-06-15"), true); // Scotland の World Cup bank holiday
  assert.equal(createCalendar({ holidays: england }).isHoliday("2026-06-15"), false);
});

test("Date は英国時間で暦日に変換する（BST の深夜）", () => {
  const calendar = createCalendar({ holidays: england });
  // 2026-08-30T23:30Z は英国時間（BST, UTC+1）で 8 月 31 日 0:30（Summer bank holiday）
  assert.equal(calendar.isHoliday(new Date("2026-08-30T23:30:00Z")), true);
});
