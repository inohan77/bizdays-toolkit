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

test("オフセット付きの日時文字列の瞬間は、ECMAScript が定める形（大文字・3 桁の小数秒）では Date.parse と一致し、小文字・9 桁でも同じ瞬間", () => {
  // 0.31.1 から瞬間を取り出した値で計算する（Date.parse に任せない）。定められた形では、計算が Date.parse と同じことを確かめる
  let seed = 20261108;
  const rand = (n: number): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % n;
  };
  const two = (v: number): string => String(v).padStart(2, "0");
  for (let run = 0; run < 400; run++) {
    const date = `${1000 + rand(9000)}-${two(1 + rand(12))}-${two(1 + rand(28))}`;
    const time = `${two(rand(24))}:${two(rand(60))}:${two(rand(60))}.${String(rand(1000)).padStart(3, "0")}`;
    const offset = rand(5) === 0 ? "Z" : `${rand(2) ? "+" : "-"}${two(rand(24))}:${two(rand(60))}`;
    const upper = `${date}T${time}${offset}`;
    const ms = Date.parse(upper);
    let expected: string;
    try {
      expected = toDateString(new Date(ms), "UTC");
    } catch (e) {
      // 計算の結果が 1000〜9999 年の外（out-of-range）なら、文字列の入力も同じ例外
      assert.ok(isBizdaysError(e) && e.code === "out-of-range");
      assert.throws(() => toDateString(upper, "UTC"), { code: "out-of-range" });
      continue;
    }
    assert.equal(toDateString(upper, "UTC"), expected, upper);
    const lower = `${date}t${time}000000${offset.toLowerCase()}`;
    assert.equal(toDateString(lower, "UTC"), expected, lower);
  }
  // 時差の時・分の範囲（23:59 まで）。前のバージョンの Date.parse と同じく、外は invalid-time（メッセージも前のバージョンと同じ書き方。
  // 秒が 60 以上のときも同じ）
  assert.equal(toDateString("2026-11-23T10:00+23:59", "UTC"), "2026-11-22");
  for (const s of ["2026-11-23T10:00+24:00", "2026-11-23T10:00+23:60", "2026-11-23T10:00:60Z"])
    assert.throws(
      () => toDateString(s, "UTC"),
      { code: "invalid-time", message: `Invalid date/time string: ${JSON.stringify(s)}` },
      s,
    );
});
