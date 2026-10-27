import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, isBizdaysError, toDateString } from "../src/index.ts";
import { isHoliday, jp, toJapanDate } from "../src/jp/index.ts";

test("瞬間は祝日の提供元のタイムゾーン（日本時間）で暦日にする", () => {
  // UTC では 11/22、日本時間では 11/23（勤労感謝の日）
  const instant = new Date("2026-11-22T15:30:00Z");
  assert.equal(toJapanDate(instant), "2026-11-23");
  assert.equal(isHoliday(instant), true);
  assert.equal(isHoliday("2026-11-22T15:30:00Z"), true);
  assert.equal(isHoliday("2026-11-23T00:30:00+09:00"), true);
  assert.equal(isHoliday("2026-11-23T00:30:00+0900"), true);
  assert.equal(isHoliday("2026-11-22T14:59:59Z"), false);
});

test("オフセットのない日時は、カレンダーのタイムゾーンの壁時計として扱う", () => {
  assert.equal(toJapanDate("2026-11-23T23:59"), "2026-11-23");
  const ny = createCalendar({ holidayProvider: jp, timeZone: "America/New_York" });
  assert.equal(ny.dateOf("2026-11-23T23:59"), "2026-11-23");
  assert.equal(ny.dateOf(new Date("2026-11-23T03:00:00Z")), "2026-11-22");
});

test("Temporal 互換のオブジェクト（依存なしのダックタイピング）", () => {
  assert.equal(toJapanDate({ year: 2026, month: 11, day: 23 }), "2026-11-23");
  assert.equal(toJapanDate({ year: 2026, month: 11, day: 23, hour: 10, minute: 0 }), "2026-11-23");
  assert.equal(
    toJapanDate({ epochMilliseconds: Date.parse("2026-11-22T15:30:00Z") }),
    "2026-11-23",
    "Instant / ZonedDateTime",
  );
  assert.throws(
    () => toJapanDate({ year: 2026, month: 11, day: 23, calendarId: "japanese" }),
    RangeError,
  );
});

test("toDateString は任意のタイムゾーンで暦日にする", () => {
  const instant = new Date("2026-01-01T00:30:00Z");
  assert.equal(toDateString(instant, "UTC"), "2026-01-01");
  assert.equal(toDateString(instant, "America/Los_Angeles"), "2025-12-31");
});

test("不正な入力", () => {
  assert.throws(() => toJapanDate("2026/11/23"), RangeError);
  assert.throws(() => toJapanDate("2026-11-23T25:00"), RangeError);
  assert.throws(() => toJapanDate(new Date(Number.NaN)), RangeError);
  assert.throws(() => toJapanDate(20261123 as unknown as string), TypeError);
  assert.throws(() => createCalendar({ timeZone: "Asia/Nowhere" }), RangeError);
});

test("日付と時刻の区切りは T だけ（空白で区切った文字列は invalid-time。型 DateTimeInput と同じ）", () => {
  assert.equal(toDateString("2026-11-23T10:00", "Asia/Tokyo"), "2026-11-23");
  assert.equal(
    toDateString("2026-11-23t10:00", "Asia/Tokyo"),
    "2026-11-23",
    "小文字の t は ISO 8601 で許される",
  );
  for (const value of ["2026-11-23 10:00", "2026-11-23 10:00:00Z", "2026-11-23 10:00+09:00"]) {
    assert.throws(
      () => toDateString(value, "Asia/Tokyo"),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-time",
      value,
    );
  }
});
