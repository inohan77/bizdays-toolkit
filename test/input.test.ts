import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, isBizdaysError, toDateString, toInstant } from "../src/index.ts";
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
  // 受け付けない種類の入力（ISO 以外の暦）は、ほかの invalid-input と同じ TypeError（decisions.md の 3 番）
  assert.throws(
    () => toJapanDate({ year: 2026, month: 11, day: 23, calendarId: "japanese" }),
    (e: unknown) => e instanceof TypeError && isBizdaysError(e) && e.code === "invalid-input",
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

test("Temporal の形の年月日の年の誤りは、文字列の暦日と同じ invalid-date。瞬間の変換が年の範囲を出たときだけ out-of-range（decisions.md の 1 番）", () => {
  const code = (c: string) => (e: unknown) => isBizdaysError(e) && e.code === c;
  for (const year of [2026.5, Number.NaN, 999, 10000])
    assert.throws(
      () => toDateString({ year, month: 1, day: 1 }, "UTC"),
      code("invalid-date"),
      String(year),
    );
  assert.throws(() => toDateString("0999-01-01", "UTC"), code("invalid-date"));
  assert.throws(() => toDateString({ year: 2026, month: 13, day: 1 }, "UTC"), code("invalid-date"));
  assert.throws(() => toDateString(new Date(Date.UTC(10000, 0, 1)), "UTC"), code("out-of-range"));
});

test("紀元前の瞬間は、年の数が 1000〜9999 に見えても out-of-range（西暦の日付にしない。decisions.md の 1 番）", () => {
  const outOfRange = (e: unknown) => isBizdaysError(e) && e.code === "out-of-range";
  for (const year of [-1500, -999, -8998]) {
    // 紀元前 1501 年・1000 年・8999 年の 1 月 15 日（Intl は紀元を付けずに 1501・1000・8999 と表す）
    const d = new Date(0);
    d.setUTCFullYear(year, 0, 15);
    const ms = d.getTime();
    assert.throws(() => toDateString(d, "UTC"), outOfRange, `toDateString ${year}`);
    assert.throws(
      () => toDateString({ epochMilliseconds: ms }, "Asia/Tokyo"),
      outOfRange,
      `Instant ${year}`,
    );
    assert.throws(() => createCalendar().today(d), outOfRange, `today ${year}`);
    assert.throws(
      () => createCalendar({ holidayProvider: jp, outOfRangePolicy: "ignore" }).dateOf(d),
      outOfRange,
      `dateOf ${year}`,
    );
  }
  // 境界: UTC の 999 年の末は、東のゾーンで 1000 年 1 月 1 日になる（通す）。9999 年の末の瞬間も変換できる
  const lastOf999 = new Date(Date.UTC(2000, 11, 31, 15));
  lastOf999.setUTCFullYear(999);
  assert.equal(toDateString(lastOf999, "Asia/Tokyo"), "1000-01-01");
  assert.throws(() => toDateString(lastOf999, "UTC"), outOfRange);
  const lastOf9999 = new Date(Date.UTC(9999, 11, 31, 23, 59));
  assert.equal(toDateString(lastOf9999, "UTC"), "9999-12-31");
  assert.throws(() => toDateString(lastOf9999, "Asia/Tokyo"), outOfRange); // 東のゾーンでは 10000 年
});

test("toInstant・instantOf は 1000-01-01 と 9999-12-31 も瞬間にする（時差を求める前後 1 日が範囲の外に出ても投げない。decisions.md の 1 番）", () => {
  const iso = (date: string, time: string, zone: string) =>
    toInstant(date, time, zone).toISOString();
  assert.equal(iso("1000-01-01", "10:00", "UTC"), "1000-01-01T10:00:00.000Z");
  assert.equal(iso("9999-12-31", "10:00", "Asia/Tokyo"), "9999-12-31T01:00:00.000Z");
  assert.equal(iso("9999-12-31", "23:59", "UTC"), "9999-12-31T23:59:00.000Z");
  // 1 日後が 10000 年に入るゾーンでは、9999-12-30 も前後 1 日の時差を求める
  assert.equal(iso("9999-12-30", "23:00", "Pacific/Kiritimati"), "9999-12-30T09:00:00.000Z");
  // 1000-01-01 と 1000-01-02 の同じ時刻は、ちょうど 1 日違う（東京の 1888 年より前は地方平均時。分の精度で 00:42）
  for (const zone of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
    const a = toInstant("1000-01-01", "00:00", zone).getTime();
    const b = toInstant("1000-01-02", "00:00", zone).getTime();
    assert.equal(b - a, 86_400_000, zone);
  }
  assert.equal(iso("1000-01-01", "00:00", "Asia/Tokyo"), "0999-12-31T14:42:00.000Z");
  const tokyo = createCalendar({ holidayProvider: jp, outOfRangePolicy: "ignore" });
  assert.equal(tokyo.instantOf("9999-12-31", "08:59").toISOString(), "9999-12-30T23:59:00.000Z");
  assert.equal(tokyo.instantOf("1000-01-01", "10:00").toISOString(), "1000-01-01T00:42:00.000Z");
});
