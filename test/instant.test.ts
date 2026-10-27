import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  createCalendar,
  createSchedule,
  isBizdaysError,
  toDateTimeParts,
  toInstant,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { england } from "../src/uk/index.ts";

test("toInstant: 暦日と時刻からタイムゾーンでの瞬間（Date）。civilOf・toDateTimeParts の逆向き", () => {
  assert.equal(
    toInstant("2026-11-23", "10:00", "Asia/Tokyo").toISOString(),
    "2026-11-23T01:00:00.000Z",
  );
  assert.equal(
    toInstant("2026-11-23", "10:00:30", "Asia/Tokyo").toISOString(),
    "2026-11-23T01:00:30.000Z",
  );
  assert.equal(toInstant("2026-11-23", "00:00", "UTC").toISOString(), "2026-11-23T00:00:00.000Z");
  assert.equal(
    toInstant("2026-11-22", "23:59:59", "America/Los_Angeles").toISOString(),
    "2026-11-23T07:59:59.000Z",
  );
  assert.deepEqual(toDateTimeParts(toInstant("2026-11-23", "10:00", "Asia/Tokyo"), "Asia/Tokyo"), {
    date: "2026-11-23",
    time: "10:00",
  });
  assert.ok(toInstant("2026-11-23", "10:00", "Asia/Tokyo") instanceof Date);
});

test("toInstant: 夏時間の飛びは後ろへ、重複は先のほう（Temporal の compatible と同じ）", () => {
  // 英国: 2026-03-29 01:00 GMT → 02:00 BST（01:00〜01:59 は存在しない）
  assert.equal(
    toInstant("2026-03-29", "01:30", "Europe/London").toISOString(),
    "2026-03-29T01:30:00.000Z",
    "01:30 は 02:30 BST",
  );
  assert.equal(
    toInstant("2026-03-29", "00:59", "Europe/London").toISOString(),
    "2026-03-29T00:59:00.000Z",
  );
  assert.equal(
    toInstant("2026-03-29", "02:00", "Europe/London").toISOString(),
    "2026-03-29T01:00:00.000Z",
  );
  // 英国: 2026-10-25 02:00 BST → 01:00 GMT（01:00〜01:59 が 2 回ある）
  assert.equal(
    toInstant("2026-10-25", "01:30", "Europe/London").toISOString(),
    "2026-10-25T00:30:00.000Z",
    "先のほう（BST）",
  );
  assert.equal(
    toInstant("2026-10-25", "00:59", "Europe/London").toISOString(),
    "2026-10-24T23:59:00.000Z",
  );
  assert.equal(
    toInstant("2026-10-25", "02:00", "Europe/London").toISOString(),
    "2026-10-25T02:00:00.000Z",
  );
  // オフセットの差が 30 分のゾーン（ロード・ハウ島: +10:30 ↔ +11:00）
  assert.equal(
    toInstant("2026-10-04", "02:15", "Australia/Lord_Howe").toISOString(),
    "2026-10-03T15:45:00.000Z",
    "02:00〜02:29 は存在しない。30 分後ろの 02:45（+11:00）",
  );
  assert.equal(
    toInstant("2026-04-05", "01:45", "Australia/Lord_Howe").toISOString(),
    "2026-04-04T14:45:00.000Z",
    "2 回ある。先のほう（+11:00）",
  );
  // 南半球（ニュージーランド: 9 月に +12 → +13、4 月に戻る）
  assert.equal(
    toInstant("2026-09-27", "02:30", "Pacific/Auckland").toISOString(),
    "2026-09-26T14:30:00.000Z",
    "存在しない時刻。03:30 NZDT",
  );
  assert.equal(
    toInstant("2026-04-05", "02:30", "Pacific/Auckland").toISOString(),
    "2026-04-04T13:30:00.000Z",
    "先のほう（NZDT）",
  );
});

test("toInstant: 夏時間のないゾーンと存在する時刻では、暦日と時刻に戻すと同じになる", () => {
  const zones = [
    "Asia/Tokyo",
    "Europe/London",
    "Australia/Lord_Howe",
    "Pacific/Auckland",
    "America/New_York",
    "UTC",
  ];
  let seed = 20261020;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 300; i++) {
    const date = addDays("2024-01-01", Math.floor(rand() * 1096));
    const minutes = Math.floor(rand() * 1440);
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    for (const zone of zones) {
      const instant = toInstant(date, time, zone);
      const back = toDateTimeParts(instant, zone);
      if (back.date === date && back.time === time) continue;
      // 存在しない時刻（飛び）だけが一致しない。そのときは、時刻が飛んだ分だけ後ろにずれている
      const wall = Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8, 10)),
        Math.floor(minutes / 60),
        minutes % 60,
      );
      const backWall = Date.UTC(
        Number(back.date.slice(0, 4)),
        Number(back.date.slice(5, 7)) - 1,
        Number(back.date.slice(8, 10)),
        Number(back.time!.slice(0, 2)),
        Number(back.time!.slice(3, 5)),
      );
      const shift = (backWall - wall) / 60000;
      assert.ok(
        shift > 0 && shift <= 120,
        `${zone} ${date} ${time} → ${back.date} ${back.time}（${shift} 分）`,
      );
    }
  }
});

test("toInstant・instantOf: 入力の誤り", () => {
  for (const [date, time, zone, code] of [
    ["2026-02-30", "10:00", "Asia/Tokyo", "invalid-date"],
    ["2026/11/23", "10:00", "Asia/Tokyo", "invalid-date"],
    ["2026-11-23T10:00", "10:00", "Asia/Tokyo", "invalid-date"],
    ["2026-11-23", "24:00", "Asia/Tokyo", "invalid-time"],
    ["2026-11-23", "23:60", "Asia/Tokyo", "invalid-time"],
    ["2026-11-23", "10:00:60", "Asia/Tokyo", "invalid-time"],
    ["2026-11-23", "10", "Asia/Tokyo", "invalid-time"],
    ["2026-11-23", "10:00", "Mars/Olympus", "invalid-time-zone"],
  ] as const) {
    assert.throws(
      () => toInstant(date, time, zone),
      (e: unknown) => isBizdaysError(e) && e.code === code,
      `${date} ${time} ${zone}`,
    );
  }
  // 暦日の文字列以外（Date・日時の文字列）は受け付けない
  assert.throws(
    () => toInstant(new Date() as never, "10:00", "Asia/Tokyo"),
    (e: unknown) => isBizdaysError(e) && e.code === "invalid-date",
  );
});

test("instantOf: カレンダー・スケジュールのタイムゾーンで。合成・スケジュールからのカレンダーにも付く", () => {
  const uk = createCalendar({ holidayProvider: england });
  assert.equal(uk.instantOf("2026-03-29", "01:30").toISOString(), "2026-03-29T01:30:00.000Z");
  assert.deepEqual(uk.civilOf(uk.instantOf("2026-06-01", "09:00")), {
    date: "2026-06-01",
    time: "09:00",
  });
  const store = createSchedule({
    holidayProvider: jp,
    weekdayValues: [null, "09:00", "09:00", "09:00", "09:00", "09:00", null],
  });
  // 次に開く瞬間
  const next = store.instantOf(addDays("2026-11-21", 2), store.valueOn("2026-11-24")!);
  assert.equal(next.toISOString(), "2026-11-23T00:00:00.000Z");
  const utc = createCalendar({ timeZone: "UTC" });
  assert.equal(utc.instantOf("2026-11-23", "10:00").toISOString(), "2026-11-23T10:00:00.000Z");
});
