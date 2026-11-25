import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  combineCalendars,
  createCalendar,
  isBizdaysError,
  type Calendar,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { sg } from "../src/sg/index.ts";
import { england } from "../src/uk/index.ts";

const company = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [
    { from: "12-29", to: "01-03", name: "年末年始休業" },
    { from: "08-13", to: "08-15", name: "夏季休業" },
  ],
  openDates: ["2026-12-26"], // an extra business day on a Saturday
});
const bank = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "銀行休業日" }],
});

test("合成（all）: すべてが営業している日だけ営業日。結果は通常のカレンダーとして使える", () => {
  const remittance = combineCalendars([company, bank], { open: "all" });
  assert.deepEqual(
    ["2026-12-25", "2026-12-26", "2026-12-28", "2026-12-29", "2026-12-30", "2027-01-04"].map((d) =>
      remittance.isBusinessDay(d),
    ),
    [true, false, true, false, false, true],
    "12-26 は自社の臨時営業だが銀行は休み。12-29〜30 は自社の年末年始休業",
  );
  assert.equal(remittance.addBusinessDays("2026-12-28", 2), "2027-01-05");
  assert.equal(remittance.diffBusinessDays("2026-12-25", "2027-01-06"), 4);
  assert.deepEqual(remittance.businessDatesBetween("2026-12-25", "2027-01-06"), [
    "2026-12-25",
    "2026-12-28",
    "2027-01-04",
    "2027-01-05",
    "2027-01-06",
  ]);
  assert.equal(remittance.adjust("2027-01-02", { convention: "following" }), "2027-01-04");
  assert.equal(remittance.lastBusinessDayOfMonth("2026-12"), "2026-12-28");
  assert.equal(
    remittance.dueDate("2026-12", { dayOfMonth: -1, convention: "preceding" }),
    "2026-12-28",
  );
  assert.equal(remittance.daysBetween("2026-12-28", "2026-12-29").length, 2);
});

test("合成: dayInfoOn は合成結果と同じ判定をした最初のカレンダーの結果と、その番号（decidedBy・decidedByPath）", () => {
  const all = combineCalendars([company, bank], { open: "all" });
  assert.deepEqual(all.dayInfoOn("2026-12-29"), {
    date: "2026-12-29",
    weekday: 2,
    open: false,
    businessDay: false,
    reason: "closed-annual",
    name: "年末年始休業",
    optionPath: "closedAnnualDates[0]",
    rulePath: "closedAnnualDates[0]",
    decidedBy: 0,
    decidedByPath: [0],
  });
  assert.deepEqual(all.dayInfoOn("2026-12-26"), {
    date: "2026-12-26",
    weekday: 6,
    open: false,
    businessDay: false,
    reason: "closed-weekday",
    decidedBy: 1,
    decidedByPath: [1],
  });
  assert.equal(all.dayInfoOn("2027-01-04").decidedBy, 0, "すべて営業なら 0 番");
  assert.equal(all.dayInfoOn("2027-01-01").holiday?.name, "元日");
  assert.equal(all.dayInfoOn("2027-01-01").name, "年末年始休業");

  const any = combineCalendars([company, bank], { open: "any" });
  assert.deepEqual(any.dayInfoOn("2026-12-29"), {
    date: "2026-12-29",
    weekday: 2,
    open: true,
    businessDay: true,
    reason: "default",
    decidedBy: 1,
    decidedByPath: [1],
  });
  assert.equal(any.dayInfoOn("2026-12-26").decidedBy, 0, "自社の臨時営業で営業");
  assert.equal(any.dayInfoOn("2026-12-26").reason, "open-date");
  assert.equal(any.dayInfoOn("2027-01-02").decidedBy, 0, "すべて休みなら 0 番");
  // A calendar that is not combined has no decidedBy / decidedByPath
  assert.equal("decidedBy" in company.dayInfoOn("2026-12-29"), false);
  assert.equal("decidedByPath" in company.dayInfoOn("2026-12-29"), false);
  assert.ok(Object.isFrozen(all.dayInfoOn("2026-12-29").decidedByPath));
});

test("合成: 振替の情報（shiftedFrom）も決めたカレンダーから引き継ぐ", () => {
  const museum = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedRecurringRules: [{ weekday: 1, name: "月曜休館", holidayOverlapPolicy: "after-holiday" }],
  });
  const shop = createCalendar({ holidayProvider: jp, closedWeekdays: [3] });
  const both = combineCalendars([museum, shop], { open: "all" });
  assert.deepEqual(both.dayInfoOn("2026-10-13"), {
    date: "2026-10-13",
    weekday: 2,
    open: false,
    businessDay: false,
    reason: "closed-recurring",
    name: "月曜休館",
    shiftedFrom: "2026-10-12",
    optionPath: "closedRecurringRules[0]",
    rulePath: "closedRecurringRules[0]",
    decidedBy: 0,
    decidedByPath: [0],
  });
  assert.equal(
    both.dayInfoOn("2026-10-12").reason,
    "holiday",
    "美術館は祝日に開館だが店は休み。1 番の結果",
  );
  assert.equal(both.dayInfoOn("2026-10-12").decidedBy, 1);
});

test("合成: 祝日の提供元は和集合、outOfRangePolicy はどれかが throw なら throw。合成の合成もできる", () => {
  const all = combineCalendars([company, bank], { open: "all" });
  assert.equal(all.providers.length, 1, "同じ提供元は 1 つ");
  assert.equal(all.timeZone, "Asia/Tokyo");
  assert.equal(all.outOfRangePolicy, "throw");
  assert.throws(
    () => all.isBusinessDay("2150-01-01"),
    (e: unknown) => isBizdaysError(e) && e.code === "out-of-range",
  );

  const a = createCalendar({ holidayProvider: jp, outOfRangePolicy: "ignore" });
  const b = createCalendar({
    holidayProvider: jp,
    outOfRangePolicy: "ignore",
    closedWeekdays: [0],
  });
  const ignore = combineCalendars([a, b], { open: "all" });
  assert.equal(ignore.outOfRangePolicy, "ignore");
  assert.equal(ignore.isBusinessDay("2150-01-01"), true);
  assert.equal(combineCalendars([a, bank], { open: "all" }).outOfRangePolicy, "throw");

  // A union with a user's provider (the same time zone)
  const custom = createCalendar({
    holidayProvider: {
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
  const union = combineCalendars([company, custom], { open: "all" });
  assert.equal(union.providers.length, 2);
  assert.equal(union.isHoliday("2026-10-01"), true);
  assert.equal(union.isHoliday("2026-11-23"), true);
  assert.equal(union.holidaysInYear(2026).length, jp.holidaysInYear(2026).length + 1);
  assert.equal(union.dayInfoOn("2026-10-01").holiday?.name, "創立記念日");

  const nested = combineCalendars(
    [all, createCalendar({ holidayProvider: jp, closedWeekdays: [3] })],
    {
      open: "all",
    },
  );
  assert.deepEqual(nested.dayInfoOn("2027-01-06"), {
    date: "2027-01-06",
    weekday: 3,
    open: false,
    businessDay: false,
    reason: "closed-weekday",
    decidedBy: 1,
    decidedByPath: [1],
  });
  assert.equal(
    nested.dayInfoOn("2026-12-29").decidedBy,
    0,
    "合成したカレンダー（0 番）の年末年始休業",
  );
  assert.equal(nested.dayInfoOn("2026-12-29").name, "年末年始休業");
  // In a nested combination decidedByPath gives the path to the inner calendar (optionPath is a position in the
  // options of calendar [0, 0])
  assert.deepEqual(nested.dayInfoOn("2026-12-29").decidedByPath, [0, 0]);
  assert.equal(nested.dayInfoOn("2026-12-29").optionPath, "closedAnnualDates[0]");
  assert.deepEqual(
    nested.dayInfoOn("2026-12-26").decidedByPath,
    [0, 1],
    "内側の 1 番（銀行）の定休日",
  );
  const deeper = combineCalendars(
    [createCalendar({ holidayProvider: jp, closedWeekdays: [1] }), nested],
    {
      open: "all",
    },
  );
  assert.deepEqual(deeper.dayInfoOn("2026-12-29").decidedByPath, [1, 0, 0], "3 段の入れ子");
  assert.equal(deeper.dayInfoOn("2026-12-29").decidedBy, 1);
});

test("合成: searchDayLimit と結果の凍結", () => {
  const never = combineCalendars(
    [
      createCalendar({ closedWeekdays: [0, 1, 2, 3] }),
      createCalendar({ closedWeekdays: [4, 5, 6] }),
    ],
    { open: "all", searchDayLimit: 10 },
  );
  assert.throws(
    () => never.nextBusinessDay("2026-10-19"),
    (e: unknown) => isBizdaysError(e) && e.code === "no-business-day" && /10 days/.test(e.message),
  );
  const all = combineCalendars([company, bank], { open: "all" });
  assert.ok(Object.isFrozen(all) && Object.isFrozen(all.dayInfoOn("2026-12-29")));
});

test("合成: 入力の誤り", () => {
  const cases: [() => unknown, string, RegExp][] = [
    [() => combineCalendars([company], { open: "all" }), "invalid-argument", /two or more/],
    [() => combineCalendars([] as never, { open: "all" }), "invalid-argument", /two or more/],
    [
      () => combineCalendars([company, company], { open: "all" }),
      "invalid-argument",
      /calendars\[1\] is the same calendar as calendars\[0\]/,
    ],
    [
      () => combineCalendars([company, {} as never], { open: "all" }),
      "invalid-argument",
      /calendars\[1\] is not a calendar/,
    ],
    [
      () =>
        combineCalendars([company, createCalendar({ holidayProvider: england })], { open: "all" }),
      "time-zone-conflict",
      /Asia\/Tokyo, Europe\/London/,
    ],
    [
      () => combineCalendars([company, bank], { businessDay: "both" } as never),
      "invalid-option",
      /open must be "all" or "any"/,
    ],
    [() => combineCalendars([company, bank], {} as never), "invalid-option", /open/],
    [
      () => combineCalendars([company, bank], { open: "all", searchDayLimit: 0 }),
      "invalid-option",
      /searchDayLimit/,
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

test("合成: 方針の違うカレンダーを合成しても、合成が投げるのは構成カレンダーのどれかが投げる日だけで、isBusinessDay と dayInfoOn・祝日のメソッドで例外の有無がそろう（decisions.md の 17 番）", () => {
  // Up to 0.31.2 a combination applied "throw if any is throw" to the union of the providers and threw on days
  // on which no member calendar throws
  const utc = { closedWeekdays: [0, 6] as const, timeZone: "UTC" };
  const jpThrow = createCalendar({
    ...utc,
    holidayProvider: jp,
    unconfirmedHolidayPolicy: "throw",
  });
  const englandAccept = createCalendar({ ...utc, holidayProvider: england });
  const sgIgnore = createCalendar({ ...utc, holidayProvider: sg, outOfRangePolicy: "ignore" });
  const jpDefault = createCalendar({ ...utc, holidayProvider: jp });
  const cases: [string, Calendar[]][] = [
    ["日本（未確定で throw）と英国（accept）", [jpThrow, englandAccept]],
    ["英国（accept）と日本（未確定で throw）", [englandAccept, jpThrow]],
    ["日本（対応年の外で throw）とシンガポール（ignore）", [jpDefault, sgIgnore]],
    ["シンガポール（ignore）と日本（未確定で throw）", [sgIgnore, jpThrow]],
  ];
  const throws = (f: () => unknown): string | undefined => {
    try {
      f();
      return undefined;
    } catch (e) {
      if (!isBizdaysError(e)) throw e;
      return e.code;
    }
  };
  const days: string[] = [];
  for (let d = "2024-01-01"; d <= "2036-12-31"; d = addDays(d, 5)) days.push(d);
  let combinedThrew = 0;
  for (const [name, calendars] of cases)
    for (const open of ["all", "any"] as const) {
      const c = combineCalendars(calendars, { open });
      const nested = combineCalendars([c, calendars[0]!], { open });
      for (const date of days) {
        const where = `${name}・${open}・${date}`;
        // When any member calendar throws, the combination throws with that code (the code of the first calendar)
        const expectInfo = calendars.map((k) => throws(() => k.dayInfoOn(date))).find((x) => x);
        assert.equal(
          throws(() => c.dayInfoOn(date)),
          expectInfo,
          `dayInfoOn ${where}`,
        );
        assert.equal(
          throws(() => c.isBusinessDay(date)),
          expectInfo,
          `isBusinessDay ${where}`,
        );
        assert.equal(
          throws(() => nested.dayInfoOn(date)),
          expectInfo,
          `入れ子の dayInfoOn ${where}`,
        );
        const expectHoliday = calendars.map((k) => throws(() => k.isHoliday(date))).find((x) => x);
        assert.equal(
          throws(() => c.isHoliday(date)),
          expectHoliday,
          `isHoliday ${where}`,
        );
        assert.equal(
          throws(() => c.holidayOn(date)),
          expectHoliday,
          `holidayOn ${where}`,
        );
        if (expectInfo !== undefined) combinedThrew++;
        if (expectInfo === undefined && expectHoliday === undefined) {
          // The holiday is the one of the first calendar that has a holiday
          const holiday = calendars.map((k) => k.holidayOn(date)).find((h) => h !== undefined);
          assert.deepEqual(c.dayInfoOn(date).holiday, holiday, `holiday ${where}`);
          assert.deepEqual(c.holidayOn(date), holiday, `holidayOn の値 ${where}`);
        }
      }
      for (let year = 2024; year <= 2036; year++) {
        const expected = calendars.map((k) => throws(() => k.holidaysInYear(year))).find((x) => x);
        assert.equal(
          throws(() => c.holidaysInYear(year)),
          expected,
          `holidaysInYear ${name}・${year}`,
        );
        if (expected !== undefined) continue;
        const byDate = new Map<string, unknown>();
        for (const k of calendars)
          for (const h of k.holidaysInYear(year)) if (!byDate.has(h.date)) byDate.set(h.date, h);
        assert.deepEqual(
          c.holidaysInYear(year),
          [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, h]) => h),
          `holidaysInYear の値 ${name}・${year}`,
        );
        assert.deepEqual(
          c.holidaysBetween(`${year}-01-01`, `${year}-12-31`),
          c.holidaysInYear(year),
          `holidaysBetween ${name}・${year}`,
        );
      }
    }
  // Days on which a member calendar throws are tried too (not an empty run)
  assert.ok(combinedThrew > 0, "構成カレンダーが投げる日がない");
});

test("合成は渡した配列を写す: 合成の後に配列を書き換えても（追加・並べ替え・空にする）、結果は変わらない（decisions.md の 4 番）", () => {
  const shop = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const sundays = createCalendar({
    timeZone: "Asia/Tokyo",
    closedWeekdays: [0],
    closedDates: ["2026-11-24"],
  });
  const never = createCalendar({ timeZone: "Asia/Tokyo", closedWeekdays: [0, 1, 2, 3, 4, 5, 6] });
  const days = ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"];
  for (const open of ["all", "any"] as const) {
    const list = [shop, sundays];
    const combined = combineCalendars(list, { open });
    const snapshot = () => ({
      open: days.map((d) => combined.isBusinessDay(d)),
      info: days.map((d) => {
        const r = combined.dayInfoOn(d);
        return [r.open, r.reason, r.decidedBy, r.holiday?.name];
      }),
      holidayOn: days.map((d) => combined.holidayOn(d)?.name),
      year: combined.holidaysInYear(2026).length,
      between: combined.holidaysBetween("2026-11-01", "2026-11-30").map((h) => h.date),
    });
    const before = snapshot();
    list.push(never);
    assert.deepEqual(snapshot(), before, `${open}: push`);
    list.reverse();
    assert.deepEqual(snapshot(), before, `${open}: reverse`);
    list.length = 0;
    assert.deepEqual(snapshot(), before, `${open}: length = 0`);
  }
});
