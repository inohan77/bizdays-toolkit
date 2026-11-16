import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  isBizdaysError,
  toDateString,
  toDateTimeParts,
  toInstant,
} from "../src/index.ts";
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

// タイムゾーンの書式の記憶（decisions.md の 16 番）。Intl.DateTimeFormat を、作った回数と渡した設定を数える関数に差し替えて
// 確かめる（内部の記憶を公開しない）。記憶はファイルの中で共有されるので、どの確かめも、前のテストが作った書式に左右されない形にする
function countFormatters<T>(run: () => T): { result: T; made: Intl.DateTimeFormatOptions[] } {
  const Original = Intl.DateTimeFormat;
  const made: Intl.DateTimeFormatOptions[] = [];
  const Counting = function (
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ): Intl.DateTimeFormat {
    made.push({ ...options });
    return new Original(locales, options);
  } as unknown as typeof Intl.DateTimeFormat;
  Object.defineProperty(Intl, "DateTimeFormat", {
    value: Counting,
    configurable: true,
    writable: true,
  });
  try {
    return { result: run(), made };
  } finally {
    Object.defineProperty(Intl, "DateTimeFormat", {
      value: Original,
      configurable: true,
      writable: true,
    });
  }
}

/** 綴りの ASCII の英字の大文字・小文字を、n のビットで決める（n ごとに違う綴り） */
function spelling(name: string, n: number): string {
  let bit = 0;
  return name.replace(/[A-Za-z]/g, (c) => ((n >> bit++) & 1 ? c.toUpperCase() : c.toLowerCase()));
}

const offsetName = (minutes: number): string => {
  const a = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

const at = new Date("2026-03-31T15:30:00Z");

test("同じタイムゾーンの綴り 5,000 個（大文字・小文字の違い）で暦日にしても、Intl の書式は 2 個までしか作らない", () => {
  const name = "America/Argentina/Buenos_Aires"; // 英字 26 文字で、5,000 個の違う綴りを作れる
  const { result, made } = countFormatters(() => {
    const dates = new Set<string>();
    for (let n = 0; n < 5000; n++) dates.add(toDateString(at, spelling(name, n)));
    return dates;
  });
  assert.deepEqual([...result], ["2026-03-31"]);
  // 名前を引くための 1 個と、名前ごとの書式の 1 個（綴りごとに作ると 5,000 個）
  assert.ok(made.length <= 2, `made ${made.length} formatters`);
});

test("時差 100 通りで暦日にしても、年・月・日・時・分の書式は UTC の 1 個だけ（時差ごとに作らない）", () => {
  const { made } = countFormatters(() => {
    for (let m = 61; m <= 160; m++) toDateString(at, offsetName(m));
  });
  const wall = made.filter((o) => o.year !== undefined);
  assert.ok(wall.length <= 1, `made ${wall.length} formatters for wall time`);
  for (const o of wall) assert.equal(o.timeZone, "UTC");
});

test("綴りから名前への対応は 1,000 件で全消去する（外から来た綴りで際限なく増えない）", () => {
  const first = spelling("Europe/Paris", 0b1010_1010);
  toDateString("2026-01-01", first); // 覚える（暦日の文字列なので、名前を引くだけで書式は作らない）
  const again = countFormatters(() => toDateString("2026-01-01", first));
  assert.equal(again.made.length, 0, "覚えた綴りは、もう一度引かない");
  // 別の有効な綴りを 1,000 個（時差の形。ほかのテストで使わない負の時差）
  for (let m = 1; m <= 1000; m++) toDateString("2026-01-01", offsetName(-m));
  const afterClear = countFormatters(() => toDateString("2026-01-01", first));
  assert.equal(afterClear.made.length, 1, "消えた後は、もう一度引く");
});

test("綴りを変えても結果は同じ（大文字・小文字、別名、時差の 3 つの形）。ケルビン記号を含む綴りは invalid-time-zone", () => {
  const same = (spellings: string[]) => {
    const zones = new Set(spellings.map((z) => createCalendar({ timeZone: z }).timeZone));
    const dates = new Set(spellings.map((z) => toDateString(at, z)));
    return { zones: [...zones], dates: [...dates] };
  };
  assert.deepEqual(same(["Asia/Tokyo", "asia/tokyo", "ASIA/TOKYO", "aSiA/tOkYo"]), {
    zones: ["Asia/Tokyo"],
    dates: ["2026-04-01"],
  });
  assert.deepEqual(same(["+09:00", "+0900", "+09"]), { zones: ["+09:00"], dates: ["2026-04-01"] });
  assert.deepEqual(same(["-00:00", "+00:00", "+0000"]), {
    zones: ["+00:00"],
    dates: ["2026-03-31"],
  });
  // 別名は、実行環境によって返す名前が違うことがある（decisions.md の 18 番）ので、暦日だけを比べる
  assert.deepEqual(same(["Asia/Kolkata", "Asia/Calcutta", "asia/calcutta"]).dates, ["2026-03-31"]);
  // U+212A（ケルビン記号）は toLowerCase で "k" になるが、今も実行環境は拒む。正しい綴りを先に覚えた後でも拒む
  toDateString(at, "Asia/Kolkata");
  assert.throws(
    () => toDateString(at, "Asia/Kolkata"),
    (e: unknown) => e instanceof RangeError && isBizdaysError(e) && e.code === "invalid-time-zone",
  );
  assert.throws(
    () => createCalendar({ timeZone: "ASIA/KOLKATA" }),
    (e: unknown) => e instanceof RangeError && isBizdaysError(e) && e.code === "invalid-time-zone",
  );
});

// createCalendar で作っていない、カレンダーの形のオブジェクト（合成は timeZone を検証しない。decisions.md の 16 番）。
// 判定は写したカレンダーのもので、瞬間を暦日に直すのは合成の側（渡した timeZone をそのまま使う）
const calendarLike = (timeZone: string) => ({
  ...createCalendar({ closedWeekdays: [0, 6] }),
  timeZone,
});
const combinedOf = (timeZone: string) =>
  combineCalendars([calendarLike(timeZone), calendarLike(timeZone)], { open: "all" });

test("合成の経路でも書式が増えない（検証を通っていない綴りも、名前に直してから読む）", () => {
  const name = "America/Argentina/Buenos_Aires";
  const { made } = countFormatters(() => {
    for (let n = 0; n < 2000; n++) {
      const combined = combinedOf(spelling(name, n + 7000));
      combined.isBusinessDay(at);
      combined.today(at);
    }
  });
  assert.ok(made.length <= 2, `made ${made.length} formatters`);
  const offset = countFormatters(() => {
    const combined = combinedOf("+0900");
    combined.isBusinessDay(at);
    combined.today(at);
  });
  const wall = offset.made.filter((o) => o.year !== undefined);
  assert.ok(wall.length <= 1, `made ${wall.length} formatters for wall time`);
  for (const o of wall) assert.equal(o.timeZone, "UTC");
});

test("合成の経路の結果と例外は 0.32.2 と同じ（返す timeZone は書いた綴りのまま。使えない綴りは code のない RangeError）", () => {
  for (const [written, zone] of [
    ["asia/tokyo", "Asia/Tokyo"],
    ["+0900", "+09:00"],
    ["AMERICA/NEW_YORK", "America/New_York"],
  ] as const) {
    const combined = combinedOf(written);
    assert.equal(combined.timeZone, written);
    const real = createCalendar({ timeZone: zone });
    assert.equal(combined.today(at), real.today(at), written);
    assert.equal(combined.dateOf(at), real.dateOf(at), written);
  }
  // 使えない綴り: 合成は作れ、暦日の文字列の判定は通り、Date の判定は Intl の例外のまま（N4 で扱いを決めるまで、今の挙動を固定する）
  let intlMessage = "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: "Nowhere/X" });
  } catch (e) {
    intlMessage = (e as Error).message;
  }
  assert.notEqual(intlMessage, "");
  const broken = combinedOf("Nowhere/X");
  assert.equal(broken.isBusinessDay("2026-11-17"), true);
  assert.throws(
    () => broken.isBusinessDay(at),
    (e: unknown) =>
      e instanceof RangeError && !isBizdaysError(e) && (e as Error).message === intlMessage,
  );
  // 1000〜9999 年の外の瞬間は、タイムゾーンを読む前に out-of-range（下側は 0.32.2 から。上側は 0.32.3 から、上側の年の確認を
  // 整形の前に置いたので同じになった。0.32.2 では、UTC の年が 10000 より後の瞬間は Intl の例外だった）
  for (const ms of [8.64e15, -8.64e15, Date.UTC(10001, 0, 1)]) {
    assert.throws(
      () => broken.isBusinessDay(new Date(ms)),
      (e: unknown) => e instanceof RangeError && isBizdaysError(e) && e.code === "out-of-range",
      String(ms),
    );
  }
});

test("時差の形のタイムゾーンの暦日と時刻（日付の変わり目、負の時差、30 分・45 分、1000 年と 9999 年の端、Date の上限・下限）", () => {
  const parts = (iso: string, zone: string) => {
    const p = toDateTimeParts(new Date(iso), zone);
    return `${p.date} ${p.time}`;
  };
  // 日付の変わり目の前後
  assert.equal(parts("2026-03-31T14:59:00Z", "+09:00"), "2026-03-31 23:59");
  assert.equal(parts("2026-03-31T15:00:00Z", "+09:00"), "2026-04-01 00:00");
  assert.equal(parts("2026-04-01T04:59:00Z", "-05:00"), "2026-03-31 23:59");
  assert.equal(parts("2026-04-01T05:00:00Z", "-05:00"), "2026-04-01 00:00");
  assert.equal(parts("2026-04-01T00:00:00Z", "+00:00"), "2026-04-01 00:00");
  assert.equal(parts("2026-03-31T23:59:00Z", "+00:00"), "2026-03-31 23:59");
  // 30 分・45 分の時差
  assert.equal(parts("2026-03-31T18:29:00Z", "+05:30"), "2026-03-31 23:59");
  assert.equal(parts("2026-03-31T18:30:00Z", "+05:30"), "2026-04-01 00:00");
  assert.equal(parts("2026-03-31T18:15:00Z", "+05:45"), "2026-04-01 00:00");
  assert.equal(parts("2026-04-01T09:30:00Z", "-09:30"), "2026-04-01 00:00");
  assert.equal(parts("2026-04-01T09:29:00Z", "-09:30"), "2026-03-31 23:59");
  // 名前のゾーン（別の経路で整形する）と、時差の形が同じ結果になる（その年に時差の変わらないゾーン）
  const sample = [0, 1, 59, 60, 3_599_000, 43_200_000, 86_399_000].map(
    (d) => Date.UTC(2026, 5, 30) + d,
  );
  for (const [named, offset] of [
    ["Etc/GMT-14", "+14:00"],
    ["Etc/GMT-9", "+09:00"],
    ["Etc/GMT+12", "-12:00"],
    ["Asia/Kolkata", "+05:30"],
    ["Asia/Kathmandu", "+05:45"],
    ["Pacific/Marquesas", "-09:30"],
  ] as const) {
    for (const ms of sample) {
      assert.deepEqual(
        toDateTimeParts(new Date(ms), offset),
        toDateTimeParts(new Date(ms), named),
        `${offset} ${ms}`,
      );
    }
  }
  // 1000 年と 9999 年の端（範囲の外になる側も）
  const outOfRange = (e: unknown) =>
    e instanceof RangeError && isBizdaysError(e) && e.code === "out-of-range";
  assert.equal(parts("9999-12-31T09:59:00Z", "+14:00"), "9999-12-31 23:59");
  assert.throws(() => parts("9999-12-31T10:00:00Z", "+14:00"), outOfRange);
  assert.equal(parts("1000-01-01T12:00:00Z", "-12:00"), "1000-01-01 00:00");
  assert.throws(() => parts("1000-01-01T11:59:00Z", "-12:00"), outOfRange);
  const lastOf999 = new Date(Date.UTC(2000, 11, 31, 15));
  lastOf999.setUTCFullYear(999);
  assert.equal(toDateString(lastOf999, "+09:00"), "1000-01-01");
  assert.throws(() => toDateString(lastOf999, "+08:59"), outOfRange);
  const firstOf10000 = new Date(Date.UTC(2000, 0, 1, 11));
  firstOf10000.setUTCFullYear(10000);
  assert.equal(toDateString(firstOf10000, "-12:00"), "9999-12-31");
  assert.throws(() => toDateString(firstOf10000, "-10:59"), outOfRange);
  // Date の上限・下限（±8.64e15 ミリ秒）と、その内側 15 時間までの瞬間は、どのゾーンでも out-of-range（code のない例外にしない）
  const zones = [
    "+14:00",
    "+09:00",
    "-12:00",
    "UTC",
    "Asia/Tokyo",
    "Pacific/Kiritimati",
    "Etc/GMT+12",
  ];
  for (const edge of [8.64e15, -8.64e15]) {
    for (let h = 0; h <= 15; h++) {
      const ms = edge - Math.sign(edge) * h * 3_600_000;
      for (const zone of zones) {
        assert.throws(() => toDateTimeParts(new Date(ms), zone), outOfRange, `${zone} ${ms}`);
        assert.throws(
          () => createCalendar({ timeZone: zone }).isBusinessDay(new Date(ms)),
          outOfRange,
          `${zone} ${ms}`,
        );
      }
    }
  }
});
