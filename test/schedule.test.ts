import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, toDateTimeParts } from "../src/index.ts";
import { jp, toJapanDateTime } from "../src/jp/index.ts";

type Hours = { open: string; close: string } | null;
const weekday: Hours = { open: "10:00", close: "21:00" };
const sunday: Hours = { open: "10:00", close: "19:00" };

/** 店舗の営業時間の例: 火曜定休、祝日は日曜の営業時間、元日は休業、大晦日は短縮営業 */
const storeHours = createSchedule<Hours>({
  holidayProvider: jp,
  weekdayValues: [sunday, weekday, null, weekday, weekday, weekday, weekday],
  holidayPolicy: { sameAs: 0 },
  annualDates: [{ date: "01-01", value: null, name: "元日休業" }],
  dates: [{ date: "2026-12-31", value: { open: "10:00", close: "17:00" }, name: "大晦日" }],
});

test("曜日ごとの値", () => {
  assert.deepEqual(storeHours.valueOn("2026-10-14"), weekday); // 水曜
  assert.equal(storeHours.valueOn("2026-10-13"), null); // 火曜（定休）
  assert.deepEqual(storeHours.valueOn("2026-10-18"), sunday);
});

test("祝日は指定した曜日の値（sameAs）", () => {
  const day = storeHours.dayInfoOn("2026-11-03"); // 文化の日（火曜 = 定休日だが祝日は日曜の営業時間）
  assert.deepEqual(day.value, sunday);
  assert.equal(day.reason, "holiday");
  assert.equal(day.name, "文化の日");
  assert.equal(day.holiday?.kind, "regular");
});

test("優先順位: 個別の日付 > 毎年の月日 > 祝日 > 曜日", () => {
  const newYear = storeHours.dayInfoOn("2027-01-01"); // 元日（祝日）より毎年の月日が優先
  assert.equal(newYear.value, null);
  assert.equal(newYear.reason, "annual");
  assert.equal(newYear.name, "元日休業");
  assert.equal(newYear.holiday?.name, "元日", "祝日の情報は規則に関係なく付く");
  const eve = storeHours.dayInfoOn("2026-12-31");
  assert.deepEqual(eve.value, { open: "10:00", close: "17:00" });
  assert.equal(eve.reason, "date");
  const s = createSchedule<string>({
    weekdayValues: ["w", "w", "w", "w", "w", "w", "w"],
    annualDates: [{ date: "05-05", value: "annual" }],
    dates: [{ date: "2026-05-05", value: "date" }],
  });
  assert.equal(s.valueOn("2026-05-05"), "date");
  assert.equal(s.valueOn("2027-05-05"), "annual");
});

test("祝日の規則（weekday / sameAs / value）", () => {
  const make = (holiday: "ignore" | { sameAs: 0 } | { value: string }) =>
    createSchedule<string>({
      holidayProvider: jp,
      weekdayValues: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      holidayPolicy: holiday,
    });
  const culture = "2026-11-03"; // 火曜の祝日
  assert.equal(make("ignore").valueOn(culture), "tue");
  assert.equal(make("ignore").dayInfoOn(culture).reason, "weekday");
  assert.equal(make({ sameAs: 0 }).valueOn(culture), "sun");
  assert.equal(make({ value: "closed" }).valueOn(culture), "closed");
  assert.equal(
    createSchedule<string>({ weekdayValues: ["a", "b", "c", "d", "e", "f", "g"] }).valueOn(culture),
    "c",
  );
});

test("期間の指定と、先に書いた規則の優先", () => {
  const s = createSchedule<number>({
    weekdayValues: [0, 0, 0, 0, 0, 0, 0],
    annualDates: [
      { from: "12-29", to: "01-03", value: 1, name: "年末年始" },
      { date: "01-02", value: 2 },
    ],
    dates: [
      { date: "2026-12-30", value: 3 },
      { from: "2026-12-28", to: "2026-12-31", value: 4 },
    ],
  });
  assert.equal(s.valueOn("2026-12-28"), 4);
  assert.equal(s.valueOn("2026-12-30"), 3, "配列で先に書いた個別の日付が優先");
  assert.equal(s.valueOn("2027-01-02"), 1, "配列で先に書いた期間が優先");
  assert.equal(s.dayInfoOn("2027-01-03").name, "年末年始");
  assert.equal(s.valueOn("2027-01-04"), 0);
});

test("瞬間は祝日の提供元のタイムゾーンで暦日にする", () => {
  // UTC では 11/2、日本時間では 11/3（文化の日）
  assert.deepEqual(storeHours.valueOn(new Date("2026-11-02T15:30:00Z")), sunday);
});

test("不正な設定", () => {
  assert.throws(
    () => createSchedule<number>({ weekdayValues: [0, 0, 0] as unknown as [0, 0, 0, 0, 0, 0, 0] }),
    { code: "invalid-option" },
  );
  assert.throws(
    () =>
      createSchedule<number>({
        weekdayValues: [0, 0, 0, 0, 0, 0, 0],
        holidayPolicy: { sameAs: 7 as 0 },
      }),
    RangeError,
  );
  assert.throws(
    () =>
      createSchedule<number>({
        weekdayValues: [0, 0, 0, 0, 0, 0, 0],
        annualDates: [{ date: "13-01", value: 1 }],
      }),
    RangeError,
  );
  assert.throws(
    () =>
      createSchedule<number>({
        weekdayValues: [0, 0, 0, 0, 0, 0, 0],
        dates: [{ from: "2026-12-31", to: "2026-12-01", value: 1 }],
      }),
    RangeError,
  );
});

test("civilOf: カレンダーのタイムゾーンでの暦日と時刻", () => {
  const instant = new Date("2026-10-14T07:30:00Z");
  assert.deepEqual(storeHours.civilOf(instant), { date: "2026-10-14", time: "16:30" });
  assert.deepEqual(storeHours.civilOf("2026-10-14"), { date: "2026-10-14", time: null });
  assert.deepEqual(storeHours.civilOf("2026-10-14T09:05"), { date: "2026-10-14", time: "09:05" });
  // 日付をまたぐ瞬間
  assert.deepEqual(storeHours.civilOf("2026-10-14T15:30:00Z"), {
    date: "2026-10-15",
    time: "00:30",
  });
  const office = createCalendar({ holidayProvider: jp });
  assert.deepEqual(office.civilOf(instant), { date: "2026-10-14", time: "16:30" });
  assert.deepEqual(toJapanDateTime(instant), { date: "2026-10-14", time: "16:30" });
  assert.deepEqual(toDateTimeParts(instant, "America/New_York"), {
    date: "2026-10-14",
    time: "03:30",
  });
});

test("「今、営業時間内か」はアプリ側で 1 行で書ける", () => {
  const isOpenAt = (at: Date): boolean => {
    const { date, time } = storeHours.civilOf(at);
    const hours = storeHours.valueOn(date);
    return hours !== null && time !== null && hours.open <= time && time < hours.close;
  };
  assert.equal(isOpenAt(new Date("2026-10-14T00:59:00Z")), false); // 9:59 JST
  assert.equal(isOpenAt(new Date("2026-10-14T01:00:00Z")), true); // 10:00 JST
  assert.equal(isOpenAt(new Date("2026-10-14T11:59:00Z")), true); // 20:59 JST
  assert.equal(isOpenAt(new Date("2026-10-14T12:00:00Z")), false); // 21:00 JST
  assert.equal(isOpenAt(new Date("2026-10-13T03:00:00Z")), false); // 火曜（定休）
});

test("返す値は変更できない", () => {
  assert.ok(Object.isFrozen(storeHours));
  assert.ok(Object.isFrozen(storeHours.dayInfoOn("2026-10-14")));
  assert.ok(Object.isFrozen(storeHours.civilOf("2026-10-14")));
});

test("value: undefined は値: 曜日・祝日・個別の日付・毎年の月日・繰り返しの規則のどれでも undefined を返し、value のキーがない規則は invalid-option（decisions.md の 6 番）", () => {
  const schedule = createSchedule({
    weekdayValues: ["w", "w", "w", "w", "w", "w", undefined],
    holidayProvider: jp,
    holidayPolicy: { value: undefined },
    dates: [{ date: "2026-10-01", value: undefined, name: "D" }],
    annualDates: [{ date: "10-02", value: undefined, name: "A" }],
    recurringRules: [{ dayOfMonth: 5, value: undefined, name: "R" }],
  });
  const cases: [string, string, string | undefined][] = [
    ["2026-10-01", "date", "dates[0]"],
    ["2026-10-02", "annual", "annualDates[0]"],
    ["2026-10-05", "recurring", "recurringRules[0]"],
    ["2026-10-12", "holiday", undefined], // スポーツの日（月曜日）
    ["2026-10-03", "weekday", undefined], // 土曜日
  ];
  for (const [date, reason, optionPath] of cases) {
    const info = schedule.dayInfoOn(date);
    assert.ok("value" in info, date);
    assert.equal(info.value, undefined, date);
    assert.equal(info.reason, reason, date);
    assert.equal(info.optionPath, optionPath, date);
  }
  assert.equal(schedule.valueOn("2026-10-06"), "w");
  // value のキーがない規則は、今までどおり invalid-option（明示的な undefined と区別する）
  const without: [string, unknown][] = [
    ["dates", [{ date: "2026-10-01" }]],
    ["annualDates", [{ date: "10-02" }]],
    ["recurringRules", [{ dayOfMonth: 5 }]],
  ];
  for (const [key, list] of without) {
    assert.throws(
      () => createSchedule({ weekdayValues: [1, 1, 1, 1, 1, 1, 1], [key]: list } as never),
      (e: unknown) =>
        e instanceof RangeError &&
        (e as { code?: unknown }).code === "invalid-option" &&
        e.message.startsWith(`${key}[0]`),
      key,
    );
  }
});

test("holidayPolicy の sameAs と value を両方書いた設定は invalid-option（どちらを採っても意図を読み違えうる。decisions.md の 8 番）。明示的な undefined の sameAs は省略と同じで、value は undefined も値", () => {
  const base = { weekdayValues: [1, 2, 3, 4, 5, 6, 7], holidayProvider: jp };
  const make = (holidayPolicy: unknown) => createSchedule({ ...base, holidayPolicy } as never);
  const code = (holidayPolicy: unknown): unknown => {
    try {
      make(holidayPolicy);
      return "ok";
    } catch (e) {
      return (e as { code?: unknown }).code;
    }
  };
  // 2026-11-23（勤労感謝の日、月曜日）
  assert.equal(code({ sameAs: 0, value: 99 }), "invalid-option");
  assert.equal(code({ sameAs: 0, value: undefined }), "invalid-option");
  assert.equal(make({ sameAs: undefined, value: 9 }).valueOn("2026-11-23"), 9);
  assert.equal(make({ value: undefined }).valueOn("2026-11-23"), undefined);
  assert.equal(make({ sameAs: 0 }).valueOn("2026-11-23"), 1);
  assert.equal(code({ sameAs: undefined }), "invalid-option"); // {} と同じ
  assert.equal(code({ sameAs: 7 }), "invalid-weekday");
});
