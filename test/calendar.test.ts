import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCalendar,
  isBizdaysError,
  type Holiday,
  type HolidayProvider,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";

/** 出荷カレンダーの例: 日曜と年末年始は出荷しない、祝日は出荷する */
const shipping = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "年末年始" }],
  holidayPolicy: "ignore",
});

test("締め時刻（14 時）をはさむ最短の出荷日", () => {
  // 2026-10-10 は土曜日
  assert.equal(
    shipping.businessDayOnOrAfter("2026-10-10T13:59", { cutoff: "14:00" }),
    "2026-10-10",
  );
  assert.equal(
    shipping.businessDayOnOrAfter("2026-10-10T14:00", { cutoff: "14:00" }),
    "2026-10-12",
  );
  assert.equal(
    shipping.businessDayOnOrAfter("2026-12-30T15:00", { cutoff: "14:00" }),
    "2027-01-04",
  );
  // 瞬間（UTC）で渡しても日本時間で判定する: 2026-10-10 04:59Z = 13:59 JST
  assert.equal(
    shipping.businessDayOnOrAfter(new Date("2026-10-10T04:59:00Z"), { cutoff: "14:00" }),
    "2026-10-10",
  );

  // 時刻のない入力と cutoff の組み合わせは、締め時刻が黙って無視されるのを防ぐため invalid-argument
  assert.throws(
    () => shipping.businessDayOnOrAfter("2026-10-10", { cutoff: "14:00" }),
    (e: unknown) =>
      isBizdaysError(e) && e.code === "invalid-argument" && /cutoff requires/.test(e.message),
  );
  assert.equal(
    shipping.businessDayOnOrAfter("2026-10-10"),
    "2026-10-10",
    "cutoff がなければ暦日でよい",
  );
});

test("判定の理由と名前", () => {
  assert.deepEqual(
    { ...shipping.dayInfoOn("2027-01-01"), holiday: undefined },
    {
      date: "2027-01-01",
      weekday: 5,
      open: false,
      businessDay: false,
      reason: "closed-annual",
      name: "年末年始",
      holiday: undefined,
      optionPath: "closedAnnualDates[0]",
      rulePath: "closedAnnualDates[0]",
    },
  );
  const sportsDay = shipping.dayInfoOn("2026-10-12");
  assert.equal(sportsDay.open, true, "holidayPolicy: ignore なので祝日も営業");
  assert.equal(sportsDay.reason, "default");
  assert.equal(sportsDay.holiday?.name, "スポーツの日");
  assert.equal(shipping.dayInfoOn("2026-10-11").reason, "closed-weekday");
});

test("優先順位: 臨時営業日 > 臨時休業日 > 毎年の休業日 > 祝日 > 定休日", () => {
  const cal = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [1], // 月曜定休
    closedAnnualDates: ["08-13"],
    closedDates: [{ from: "2026-12-28", to: "2027-01-05", name: "冬季休業" }],
    openDates: [{ date: "2026-12-30", name: "大掃除" }, "2026-08-13"],
    holidayPolicy: "open",
  });
  assert.equal(cal.dayInfoOn("2026-12-30").reason, "open-date");
  assert.equal(cal.dayInfoOn("2026-12-30").name, "大掃除");
  assert.equal(cal.dayInfoOn("2026-12-29").reason, "closed-date");
  assert.equal(cal.isBusinessDay("2026-08-13"), true, "臨時営業日は毎年の休業日より優先");
  assert.equal(cal.isBusinessDay("2027-08-13"), false);
  // スポーツの日（月曜）: holidayPolicy: open は定休日より優先
  assert.equal(cal.dayInfoOn("2026-10-12").reason, "holiday");
  assert.equal(cal.isBusinessDay("2026-10-12"), true);
  assert.equal(cal.isBusinessDay("2026-10-19"), false);
});

test("祝日の扱い（closed / open / ignore）", () => {
  const monday = "2026-10-12"; // スポーツの日
  const make = (holidayPolicy: "closed" | "open" | "ignore") =>
    createCalendar({ holidayProvider: jp, closedWeekdays: [1], holidayPolicy });
  assert.equal(make("closed").isBusinessDay(monday), false);
  assert.equal(make("open").isBusinessDay(monday), true);
  assert.equal(make("ignore").isBusinessDay(monday), false, "ignore は曜日で判定");
  const weekdayHoliday = "2026-11-03"; // 文化の日（火曜）
  assert.equal(make("closed").isBusinessDay(weekdayHoliday), false);
  assert.equal(make("ignore").isBusinessDay(weekdayHoliday), true);
});

test("年をまたぐ毎年の休業日とうるう日", () => {
  const cal = createCalendar({ closedAnnualDates: [{ from: "12-29", to: "01-03" }, "02-29"] });
  assert.equal(cal.isBusinessDay("2026-12-29"), false);
  assert.equal(cal.isBusinessDay("2027-01-03"), false);
  assert.equal(cal.isBusinessDay("2027-01-04"), true);
  assert.equal(cal.isBusinessDay("2028-02-29"), false);
  assert.throws(() => createCalendar({ closedAnnualDates: ["02-30"] }), RangeError);
});

test("営業日の移動と数え上げ（土日祝休み）", () => {
  const office = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  assert.equal(office.nextBusinessDay("2026-09-18"), "2026-09-24", "シルバーウィーク");
  assert.equal(office.previousBusinessDay("2026-09-24"), "2026-09-18");
  assert.equal(office.addBusinessDays("2026-09-18", 1), "2026-09-24");
  assert.equal(office.addBusinessDays("2026-09-24", -1), "2026-09-18");
  assert.equal(office.addBusinessDays("2026-09-19", 0), "2026-09-24", "0 は当日以降の最初の営業日");
  assert.equal(office.businessDayOnOrBefore("2026-09-23"), "2026-09-18");
  assert.equal(office.diffBusinessDays("2026-09-01", "2026-10-01"), 19);
  assert.equal(office.diffBusinessDays("2026-10-01", "2026-09-01"), -19);
  assert.equal(
    office.businessDatesBetween("2026-09-18", "2026-09-25").join(),
    "2026-09-18,2026-09-24,2026-09-25",
  );
  // addBusinessDays と diffBusinessDays の対応（起点が営業日のとき）
  for (const n of [1, 5, 20, 60]) {
    const to = office.addBusinessDays("2026-09-01", n);
    assert.equal(office.diffBusinessDays("2026-09-01", to), n);
  }
  assert.throws(() => office.addBusinessDays("2026-09-01", 1.5), RangeError);
});

test("営業日が見つからない設定は Error で止まる", () => {
  const never = createCalendar({ closedWeekdays: [0, 1, 2, 3, 4, 5, 6], searchDayLimit: 30 });
  assert.throws(() => never.nextBusinessDay("2026-01-01"), /No business day found within 30 days/);
});

test("祝日の提供元の対応年の外", () => {
  const strict = createCalendar({ holidayProvider: jp });
  assert.throws(() => strict.isBusinessDay("2100-01-04"), /supported for 1955-2099/);
  const lenient = createCalendar({ holidayProvider: jp, outOfRangePolicy: "ignore" });
  assert.equal(lenient.isHoliday("2100-01-01"), false);
});

test("祝日の提供元がないカレンダーは UTC", () => {
  const cal = createCalendar({ closedWeekdays: [0, 6] });
  assert.equal(cal.timeZone, "UTC");
  assert.equal(cal.isHoliday("2026-11-23"), false);
  assert.equal(cal.today(new Date("2026-10-11T23:30:00Z")), "2026-10-11");
});

/** 他の国・地域の祝日はインターフェースを実装して渡せる */
const example: HolidayProvider<"public"> = {
  id: "XX",
  timeZone: "Europe/London",
  supportedYears: { from: 2000, to: 2100 },
  dataVersion: "test",
  holidaysInYear(year: number): readonly Holiday<"public">[] {
    return [
      {
        date: `${year}-12-25`,
        name: "Example Day",
        nameEn: "Example Day",
        kind: "public",
        confirmed: true,
      },
    ];
  },
};

test("独自の祝日の提供元と、複数の提供元の和集合", () => {
  const cal = createCalendar({ holidayProvider: example });
  assert.equal(cal.timeZone, "Europe/London");
  assert.equal(cal.holidayOn("2026-12-25")?.name, "Example Day");
  assert.throws(
    () => createCalendar<string>({ holidayProvider: [jp, example] }),
    /different time zones/,
  );
  const both = createCalendar<string>({ holidayProvider: [jp, example], timeZone: "Asia/Tokyo" });
  assert.equal(both.isHoliday("2026-12-25"), true);
  assert.equal(both.isHoliday("2026-11-23"), true);
  assert.equal(both.holidaysBetween("2026-11-01", "2026-12-31").length, 3);
});

test("期間の指定が逆なら RangeError", () => {
  assert.throws(() => shipping.holidaysBetween("2026-12-31", "2026-01-01"), RangeError);
  assert.throws(() => shipping.businessDatesBetween("2026-12-31", "2026-01-01"), RangeError);
  assert.throws(
    () => createCalendar({ closedDates: [{ from: "2026-12-31", to: "2026-12-01" }] }),
    RangeError,
  );
});
