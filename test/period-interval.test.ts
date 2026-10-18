import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  createCalendar,
  createSchedule,
  isBizdaysError,
  type AnnualDate,
  type AnnualRange,
  type RecurringRule,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";

const closedOn = (rules: RecurringRule[], extra: Parameters<typeof createCalendar>[0] = {}) =>
  createCalendar({ holidays: jp, closedRecurring: rules, ...extra });

test("有効期間: 定休日の曜日の変更を 1 つのカレンダーで表し、過去の判定も変えない", () => {
  const shop = closedOn([
    { weekday: 1, name: "月曜定休", effectiveTo: "2027-03-31" },
    { weekday: 2, name: "火曜定休", effectiveFrom: "2027-04-01" },
  ]);
  assert.deepEqual(
    ["2027-03-29", "2027-03-30", "2027-04-05", "2027-04-06"].map((d) => shop.isBusinessDay(d)),
    [false, true, true, false],
    "3 月は月曜休み、4 月から火曜休み",
  );
  assert.deepEqual(shop.dayInfo("2027-04-06"), {
    date: "2027-04-06",
    weekday: 2,
    businessDay: false,
    reason: "closed-recurring",
    name: "火曜定休",
  });
  // 切り替え日をまたぐ計算も 1 つのカレンダーで正しい（3/31 水・4/1 木・4/2 金）
  assert.equal(shop.addBusinessDays("2027-03-30", 3), "2027-04-02");
  assert.equal(
    shop.businessDaysBetween("2027-03-29", "2027-04-12"),
    12,
    "14 日のうち月曜 1 日と火曜 1 日が休み",
  );
  // 期間の両端を含む
  assert.equal(shop.isBusinessDay("2027-03-29"), false, "2027-03-31 までの月曜");
  assert.equal(shop.isBusinessDay("2027-04-06"), false, "2027-04-01 からの火曜");
});

test("有効期間: 第 n 曜日・日の規則・月の絞り込みとも組み合わせられる", () => {
  const cal = closedOn([
    { weekday: 3, nth: 3, name: "棚卸し", effectiveTo: "2028-03-31" },
    { day: -1, months: [3, 9], name: "決算", effectiveFrom: "2027-01-01" },
  ]);
  assert.equal(cal.isBusinessDay("2028-03-15"), false, "2028 年 3 月の第 3 水曜");
  assert.equal(cal.isBusinessDay("2028-04-19"), true, "2028 年 4 月以降は棚卸しをしない");
  assert.equal(cal.isBusinessDay("2026-09-30"), true, "2027 年より前の決算日は営業");
  assert.equal(cal.isBusinessDay("2027-09-30"), false);
  assert.equal(cal.isBusinessDay("2027-10-29"), true, "月の絞り込みは有効");
});

test("有効期間: 毎年の月日（月日・期間）にも付けられる", () => {
  const closedAnnual: (AnnualDate | AnnualRange)[] = [
    { from: "08-13", to: "08-16", name: "お盆休み", effectiveTo: "2026-12-31" },
    { date: "11-03", name: "創業記念日", effectiveFrom: "2027-01-01" },
  ];
  const cal = createCalendar({ holidays: jp, holidayPolicy: "open", closedAnnual });
  assert.equal(cal.dayInfo("2026-08-14").reason, "closed-annual");
  assert.equal(cal.dayInfo("2027-08-13").reason, "regular", "2027 年からお盆休みをやめる");
  assert.equal(
    cal.dayInfo("2026-11-03").reason,
    "holiday",
    "祝日で営業（期間の外の毎年の規則は書かれていないのと同じ）",
  );
  assert.equal(cal.dayInfo("2027-11-03").reason, "closed-annual", "期間の中は祝日より優先");
  assert.equal(cal.dayInfo("2027-11-03").name, "創業記念日");
});

test("有効期間: 振替（after-holiday）は振替元の日で判定する", () => {
  // 毎月 1 日休業（祝日なら翌日）。2027-01-01（金・元日）の振替先は 01-02（土）
  const cal = closedOn([{ day: 1, onHolidayRule: "after-holiday", effectiveTo: "2027-01-01" }]);
  assert.deepEqual(
    cal.dayInfo("2027-01-02").shiftedFrom,
    "2027-01-01",
    "振替元が期間の中なら振替先が期間の外でも振り替える",
  );
  const ended = closedOn([{ day: 1, onHolidayRule: "after-holiday", effectiveTo: "2026-12-31" }]);
  assert.equal(ended.isBusinessDay("2027-01-02"), true, "振替元が期間の外なら振り替えない");
  assert.equal(ended.isBusinessDay("2026-12-01"), false);
});

test("有効期間: 期間の外では書かれていないのと同じで、優先順位に影響しない", () => {
  const cal = createCalendar({
    holidays: jp,
    closedWeekdays: [1],
    openRecurring: [{ weekday: 1, nth: 1, effectiveTo: "2026-12-31" }],
  });
  assert.equal(cal.isBusinessDay("2026-11-02"), true, "第 1 月曜は営業");
  assert.equal(cal.isBusinessDay("2027-01-04"), false, "期間の外では定休日のまま");
});

test("周期: 隔週水曜定休は「第 1・3 水曜」とは別物", () => {
  // 祝日（4/29）でも休業として数えられるよう "over-holiday" にする
  const biweekly = closedOn([
    {
      weekday: 3,
      interval: 2,
      anchor: "2026-01-07",
      name: "隔週水曜定休",
      onHolidayRule: "over-holiday",
    },
  ]);
  const closed = [];
  for (let d = "2026-01-01"; d <= "2026-05-31"; d = addDays(d, 1)) {
    if (biweekly.dayInfo(d).reason === "closed-recurring") closed.push(d);
  }
  assert.deepEqual(closed, [
    "2026-01-07",
    "2026-01-21",
    "2026-02-04",
    "2026-02-18",
    "2026-03-04",
    "2026-03-18",
    "2026-04-01",
    "2026-04-15",
    "2026-04-29",
    "2026-05-13",
    "2026-05-27",
  ]);
  assert.equal(biweekly.isBusinessDay("2025-12-24"), false, "起点より前の日にも当てはまる");
  assert.equal(biweekly.isBusinessDay("2026-05-20"), true, "第 3 水曜だが周期の上では営業");
  const firstThird = closedOn([{ weekday: 3, nth: [1, 3] }]);
  assert.equal(firstThird.isBusinessDay("2026-05-20"), false);
  assert.equal(firstThird.isBusinessDay("2026-05-13"), true);
});

test("周期: 起点から始めるには effectiveFrom を併せて指定する。months・onHolidayRule とも組み合わせられる", () => {
  const cal = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [
      {
        weekday: 1,
        interval: 2,
        anchor: "2026-11-02",
        effectiveFrom: "2026-11-02",
        onHolidayRule: "after-holiday",
        months: [11, 12, 1, 2],
      },
    ],
  });
  assert.equal(cal.isBusinessDay("2026-10-19"), true, "起点より前は営業（effectiveFrom）");
  assert.equal(cal.isBusinessDay("2026-11-02"), false);
  assert.equal(cal.isBusinessDay("2026-11-09"), true);
  assert.equal(cal.isBusinessDay("2026-11-16"), false);
  // 2026-11-23（月・勤労感謝の日）は起点から 3 週なので周期の上では当てはまらず、振替も起きない
  assert.equal(cal.isBusinessDay("2026-11-23"), true, "祝日は営業（holidayPolicy: open）");
  assert.equal(cal.dayInfo("2026-11-24").reason, "regular");
  assert.equal(cal.isBusinessDay("2026-11-30"), false);
  assert.equal(cal.isBusinessDay("2027-03-01"), true, "3 月は月の絞り込みの外");
  // 2027-01-11（月・成人の日）は起点から 10 週で当てはまる祝日。翌日 01-12 に振替
  assert.equal(cal.dayInfo("2027-01-12").shiftedFrom, "2027-01-11");
});

test("周期: スケジュールの値にも使える", () => {
  const hours = createSchedule({
    holidays: jp,
    weekly: ["closed", "9-18", "9-18", "9-18", "9-18", "9-18", "9-17"],
    recurring: [{ weekday: 5, interval: 2, anchor: "2026-01-09", value: "9-21", name: "延長営業" }],
    annual: [{ date: "12-31", value: "9-15", effectiveFrom: "2027-01-01" }],
  });
  assert.equal(hours.valueOn("2026-01-09"), "9-21");
  assert.equal(hours.valueOn("2026-01-16"), "9-18");
  assert.equal(hours.valueOn("2026-01-23"), "9-21");
  assert.equal(hours.valueOn("2026-12-31"), "9-18", "2027 年からの毎年の規則");
  assert.equal(hours.valueOn("2027-12-31"), "9-15");
});

test("周期: 起点と同じ曜日で、起点との日数の差が 7 × interval の倍数の日だけ", () => {
  // 2026-11-02 を起点にした隔週月曜は 11-02・11-16・11-30。11-23 は当てはまらない
  const cal = closedOn([{ weekday: 1, interval: 2, anchor: "2026-11-02" }]);
  assert.deepEqual(
    ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"].map(
      (d) => cal.dayInfo(d).reason,
    ),
    ["closed-recurring", "regular", "closed-recurring", "holiday", "closed-recurring"],
  );
});

test("入力の誤り: 有効期間・周期", () => {
  const cases: [unknown, string, RegExp][] = [
    [
      { weekday: 3, interval: 2 },
      "invalid-option",
      /closedRecurring\[0\]: "interval" and "anchor"/,
    ],
    [{ weekday: 3, anchor: "2026-01-07" }, "invalid-option", /"interval" and "anchor"/],
    [
      { weekday: 3, interval: 1, anchor: "2026-01-07" },
      "invalid-option",
      /closedRecurring\[0\]\.interval: must be an integer of 2 or more/,
    ],
    [{ weekday: 3, interval: 2.5, anchor: "2026-01-07" }, "invalid-option", /\.interval/],
    [
      { weekday: 3, interval: 2, anchor: "2026-01-08" },
      "invalid-option",
      /closedRecurring\[0\]\.anchor: must be on the same weekday/,
    ],
    [
      { weekday: 3, interval: 2, anchor: "2026/01/07" },
      "invalid-date",
      /closedRecurring\[0\]\.anchor/,
    ],
    [
      { weekday: 3, nth: 1, interval: 2, anchor: "2026-01-07" },
      "invalid-option",
      /"interval" cannot be used with "nth"/,
    ],
    [
      { day: 1, interval: 2, anchor: "2026-01-07" },
      "invalid-option",
      /closedRecurring\[0\]\.interval: "interval" can be used only with "weekday"/,
    ],
    [{ day: 1, anchor: "2026-01-07" }, "invalid-option", /closedRecurring\[0\]\.anchor/],
    [
      { weekday: 1, effectiveFrom: "2027-4-1" },
      "invalid-date",
      /closedRecurring\[0\]\.effectiveFrom/,
    ],
    [{ weekday: 1, effectiveTo: 20270401 }, "invalid-date", /closedRecurring\[0\]\.effectiveTo/],
    [
      { weekday: 1, effectiveFrom: "2027-04-01", effectiveTo: "2027-03-31" },
      "invalid-range",
      /closedRecurring\[0\]: "effectiveFrom" must not be after "effectiveTo"/,
    ],
  ];
  for (const [entry, code, message] of cases) {
    assert.throws(
      () => createCalendar({ closedRecurring: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === code && message.test(e.message),
      JSON.stringify(entry),
    );
  }
  assert.throws(
    () =>
      createCalendar({
        closedAnnual: [{ date: "01-02", effectiveFrom: "2027-01-01", effectiveTo: "2026-12-31" }],
      }),
    (e: unknown) =>
      isBizdaysError(e) && e.code === "invalid-range" && /closedAnnual\[0\]/.test(e.message),
  );
  assert.throws(
    () =>
      createSchedule({
        weekly: [0, 0, 0, 0, 0, 0, 0],
        annual: [{ date: "01-02", value: 1, effectiveTo: "x" }],
      }),
    (e: unknown) =>
      isBizdaysError(e) && e.code === "invalid-date" && /annual\[0\]\.effectiveTo/.test(e.message),
  );
  // 個別の日付には有効期間を付けない（知らないキーとして無視される）
  const cal = createCalendar({
    closedDates: [{ date: "2026-10-19", effectiveTo: "2020-01-01" } as never],
  });
  assert.equal(cal.isBusinessDay("2026-10-19"), false);
});
