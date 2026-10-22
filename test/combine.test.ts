import assert from "node:assert/strict";
import { test } from "node:test";
import { combineCalendars, createCalendar, isBizdaysError } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { england } from "../src/uk/index.ts";

const company = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedAnnual: [
    { from: "12-29", to: "01-03", name: "年末年始休業" },
    { from: "08-13", to: "08-15", name: "夏季休業" },
  ],
  openDates: ["2026-12-26"], // 土曜の臨時営業
});
const bank = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedAnnual: [{ from: "12-31", to: "01-03", name: "銀行休業日" }],
});

test("合成（all）: すべてが営業している日だけ営業日。結果は通常のカレンダーとして使える", () => {
  const remittance = combineCalendars([company, bank], { businessDay: "all" });
  assert.deepEqual(
    ["2026-12-25", "2026-12-26", "2026-12-28", "2026-12-29", "2026-12-30", "2027-01-04"].map((d) =>
      remittance.isBusinessDay(d),
    ),
    [true, false, true, false, false, true],
    "12-26 は自社の臨時営業だが銀行は休み。12-29〜30 は自社の年末年始休業",
  );
  assert.equal(remittance.addBusinessDays("2026-12-28", 2), "2027-01-05");
  assert.equal(remittance.businessDaysBetween("2026-12-25", "2027-01-06"), 4);
  assert.deepEqual(remittance.listBusinessDays("2026-12-25", "2027-01-06"), [
    "2026-12-25",
    "2026-12-28",
    "2027-01-04",
    "2027-01-05",
    "2027-01-06",
  ]);
  assert.equal(remittance.adjust("2027-01-02", { convention: "following" }), "2027-01-04");
  assert.equal(remittance.lastBusinessDayOfMonth("2026-12"), "2026-12-28");
  assert.equal(remittance.dueDate("2026-12", { day: -1, convention: "preceding" }), "2026-12-28");
  assert.equal(remittance.daysBetween("2026-12-28", "2026-12-29").length, 2);
});

test("合成: dayInfo は合成結果と同じ判定をした最初のカレンダーの結果と、その番号（decidedBy・decidedByPath）", () => {
  const all = combineCalendars([company, bank], { businessDay: "all" });
  assert.deepEqual(all.dayInfo("2026-12-29"), {
    date: "2026-12-29",
    weekday: 2,
    businessDay: false,
    reason: "closed-annual",
    name: "年末年始休業",
    rulePath: "closedAnnual[0]",
    decidedBy: 0,
    decidedByPath: [0],
  });
  assert.deepEqual(all.dayInfo("2026-12-26"), {
    date: "2026-12-26",
    weekday: 6,
    businessDay: false,
    reason: "closed-weekday",
    decidedBy: 1,
    decidedByPath: [1],
  });
  assert.equal(all.dayInfo("2027-01-04").decidedBy, 0, "すべて営業なら 0 番");
  assert.equal(all.dayInfo("2027-01-01").holiday?.name, "元日");
  assert.equal(all.dayInfo("2027-01-01").name, "年末年始休業");

  const any = combineCalendars([company, bank], { businessDay: "any" });
  assert.deepEqual(any.dayInfo("2026-12-29"), {
    date: "2026-12-29",
    weekday: 2,
    businessDay: true,
    reason: "regular",
    decidedBy: 1,
    decidedByPath: [1],
  });
  assert.equal(any.dayInfo("2026-12-26").decidedBy, 0, "自社の臨時営業で営業");
  assert.equal(any.dayInfo("2026-12-26").reason, "open-date");
  assert.equal(any.dayInfo("2027-01-02").decidedBy, 0, "すべて休みなら 0 番");
  // 合成していないカレンダーには decidedBy・decidedByPath が付かない
  assert.equal("decidedBy" in company.dayInfo("2026-12-29"), false);
  assert.equal("decidedByPath" in company.dayInfo("2026-12-29"), false);
  assert.ok(Object.isFrozen(all.dayInfo("2026-12-29").decidedByPath));
});

test("合成: 振替の情報（shiftedFrom）も決めたカレンダーから引き継ぐ", () => {
  const museum = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [{ weekday: 1, name: "月曜休館", onHolidayRule: "after-holiday" }],
  });
  const shop = createCalendar({ holidays: jp, closedWeekdays: [3] });
  const both = combineCalendars([museum, shop], { businessDay: "all" });
  assert.deepEqual(both.dayInfo("2026-10-13"), {
    date: "2026-10-13",
    weekday: 2,
    businessDay: false,
    reason: "closed-recurring",
    name: "月曜休館",
    shiftedFrom: "2026-10-12",
    rulePath: "closedRecurring[0]",
    decidedBy: 0,
    decidedByPath: [0],
  });
  assert.equal(
    both.dayInfo("2026-10-12").reason,
    "holiday",
    "美術館は祝日に開館だが店は休み。1 番の結果",
  );
  assert.equal(both.dayInfo("2026-10-12").decidedBy, 1);
});

test("合成: 祝日の提供元は和集合、outOfRange はどれかが throw なら throw。合成の合成もできる", () => {
  const all = combineCalendars([company, bank], { businessDay: "all" });
  assert.equal(all.providers.length, 1, "同じ提供元は 1 つ");
  assert.equal(all.timeZone, "Asia/Tokyo");
  assert.equal(all.outOfRange, "throw");
  assert.throws(
    () => all.isBusinessDay("2150-01-01"),
    (e: unknown) => isBizdaysError(e) && e.code === "out-of-range",
  );

  const a = createCalendar({ holidays: jp, outOfRange: "ignore" });
  const b = createCalendar({ holidays: jp, outOfRange: "ignore", closedWeekdays: [0] });
  const ignore = combineCalendars([a, b], { businessDay: "all" });
  assert.equal(ignore.outOfRange, "ignore");
  assert.equal(ignore.isBusinessDay("2150-01-01"), true);
  assert.equal(combineCalendars([a, bank], { businessDay: "all" }).outOfRange, "throw");

  // 利用者の提供元（同じタイムゾーン）との和集合
  const custom = createCalendar({
    holidays: {
      id: "X",
      timeZone: "Asia/Tokyo",
      supportedYears: { from: 2026, to: 2027 },
      dataVersion: "1",
      holidaysInYear: (y) =>
        y === 2026
          ? [
              {
                date: "2026-10-01",
                name: "創立記念日",
                nameEn: "Founding Day",
                kind: "x",
                confirmed: true,
              },
            ]
          : [],
    },
  });
  const union = combineCalendars([company, custom], { businessDay: "all" });
  assert.equal(union.providers.length, 2);
  assert.equal(union.isHoliday("2026-10-01"), true);
  assert.equal(union.isHoliday("2026-11-23"), true);
  assert.equal(union.holidaysInYear(2026).length, jp.holidaysInYear(2026).length + 1);
  assert.equal(union.dayInfo("2026-10-01").holiday?.name, "創立記念日");

  const nested = combineCalendars([all, createCalendar({ holidays: jp, closedWeekdays: [3] })], {
    businessDay: "all",
  });
  assert.deepEqual(nested.dayInfo("2027-01-06"), {
    date: "2027-01-06",
    weekday: 3,
    businessDay: false,
    reason: "closed-weekday",
    decidedBy: 1,
    decidedByPath: [1],
  });
  assert.equal(
    nested.dayInfo("2026-12-29").decidedBy,
    0,
    "合成したカレンダー（0 番）の年末年始休業",
  );
  assert.equal(nested.dayInfo("2026-12-29").name, "年末年始休業");
  // 入れ子の合成では、内側のカレンダーまでの経路が decidedByPath で分かる（rulePath は [0, 0] 番の設定の位置）
  assert.deepEqual(nested.dayInfo("2026-12-29").decidedByPath, [0, 0]);
  assert.equal(nested.dayInfo("2026-12-29").rulePath, "closedAnnual[0]");
  assert.deepEqual(
    nested.dayInfo("2026-12-26").decidedByPath,
    [0, 1],
    "内側の 1 番（銀行）の定休日",
  );
  const deeper = combineCalendars([createCalendar({ holidays: jp, closedWeekdays: [1] }), nested], {
    businessDay: "all",
  });
  assert.deepEqual(deeper.dayInfo("2026-12-29").decidedByPath, [1, 0, 0], "3 段の入れ子");
  assert.equal(deeper.dayInfo("2026-12-29").decidedBy, 1);
});

test("合成: maxSearchDays と結果の凍結", () => {
  const never = combineCalendars(
    [
      createCalendar({ closedWeekdays: [0, 1, 2, 3] }),
      createCalendar({ closedWeekdays: [4, 5, 6] }),
    ],
    { businessDay: "all", maxSearchDays: 10 },
  );
  assert.throws(
    () => never.nextBusinessDay("2026-10-19"),
    (e: unknown) => isBizdaysError(e) && e.code === "no-business-day" && /10 days/.test(e.message),
  );
  const all = combineCalendars([company, bank], { businessDay: "all" });
  assert.ok(Object.isFrozen(all) && Object.isFrozen(all.dayInfo("2026-12-29")));
});

test("合成: 入力の誤り", () => {
  const cases: [() => unknown, string, RegExp][] = [
    [() => combineCalendars([company], { businessDay: "all" }), "invalid-argument", /two or more/],
    [
      () => combineCalendars([] as never, { businessDay: "all" }),
      "invalid-argument",
      /two or more/,
    ],
    [
      () => combineCalendars([company, company], { businessDay: "all" }),
      "invalid-argument",
      /calendars\[1\] is the same calendar as calendars\[0\]/,
    ],
    [
      () => combineCalendars([company, {} as never], { businessDay: "all" }),
      "invalid-argument",
      /calendars\[1\] is not a calendar/,
    ],
    [
      () =>
        combineCalendars([company, createCalendar({ holidays: england })], { businessDay: "all" }),
      "time-zone-conflict",
      /Asia\/Tokyo, Europe\/London/,
    ],
    [
      () => combineCalendars([company, bank], { businessDay: "both" } as never),
      "invalid-option",
      /businessDay must be "all" or "any"/,
    ],
    [() => combineCalendars([company, bank], {} as never), "invalid-option", /businessDay/],
    [
      () => combineCalendars([company, bank], { businessDay: "all", maxSearchDays: 0 }),
      "invalid-option",
      /maxSearchDays/,
    ],
  ];
  for (const [fn, code, message] of cases) {
    assert.throws(
      fn,
      (e: unknown) => isBizdaysError(e) && e.code === code && message.test(e.message),
      code,
    );
  }
});
