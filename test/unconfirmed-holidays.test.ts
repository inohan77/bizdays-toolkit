import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { england } from "../src/uk/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";

// The equinox days of years after jp.confirmedThrough are predictions (confirmed: false)
const year = jp.confirmedThrough! + 1;
const equinox = jp.holidaysInYear(year).find((h) => !h.confirmed)!.date;
const throwsUnconfirmed = (fn: () => unknown, label?: string): void =>
  assert.throws(
    fn,
    (e: unknown) =>
      isBizdaysError(e) &&
      e.code === "unconfirmed-holiday" &&
      e.message.includes(equinox) &&
      e.message.includes(`confirmed through ${jp.confirmedThrough}`),
    label,
  );

test("unconfirmedHolidayPolicy: 既定は accept で、これまでどおり予測の祝日で判定する", () => {
  const calendar = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  assert.equal(calendar.unconfirmedHolidayPolicy, "accept");
  assert.equal(calendar.isBusinessDay(equinox), false);
  assert.equal(calendar.dayInfoOn(equinox).holiday?.confirmed, false);
});

test("unconfirmedHolidayPolicy: throw は、評価した日が未確定の祝日なら止める（探索・調整・期日・隣の日を見る規則を含む）", () => {
  const calendar = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    unconfirmedHolidayPolicy: "throw",
  });
  assert.equal(calendar.unconfirmedHolidayPolicy, "throw");
  // Confirmed years behave as before
  assert.equal(calendar.isBusinessDay(`${jp.confirmedThrough}-01-01`), false);
  throwsUnconfirmed(() => calendar.dayInfoOn(equinox), "dayInfoOn");
  throwsUnconfirmed(() => calendar.isBusinessDay(equinox), "isBusinessDay");
  throwsUnconfirmed(() => calendar.isHoliday(equinox), "isHoliday");
  throwsUnconfirmed(() => calendar.adjust(equinox, { convention: "following" }), "adjust");
  throwsUnconfirmed(
    () =>
      calendar.dueDate(equinox.slice(0, 7), {
        dayOfMonth: Number(equinox.slice(8)) as 20,
        convention: "following",
      }),
    "dueDate",
  );
  // A day a search passes on the way (it stops even when the resulting day is not unconfirmed)
  const dayBefore = new Date(`${equinox}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 3);
  throwsUnconfirmed(
    () => calendar.addBusinessDays(dayBefore.toISOString().slice(0, 10), 5),
    "addBusinessDays",
  );
  throwsUnconfirmed(
    () => calendar.diffBusinessDays(`${year}-01-01`, `${year}-12-31`),
    "diffBusinessDays",
  );
  // Day-before and day-after-holiday rules look up the holiday of the neighbouring day, so it stops even when
  // the day itself is not a holiday
  const eve = createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ dayBeforeHoliday: true }],
    unconfirmedHolidayPolicy: "throw",
  });
  const prev = new Date(`${equinox}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  throwsUnconfirmed(() => eve.isBusinessDay(prev.toISOString().slice(0, 10)), "dayBeforeHoliday");
});

test("unconfirmedHolidayPolicy: holidaysInYear・holidaysBetween は投げず、影響する日を列挙できる（逃げ道）", () => {
  const calendar = createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "throw" });
  const unconfirmed = calendar
    .holidaysBetween(`${year}-01-01`, `${year}-12-31`)
    .filter((h) => !h.confirmed);
  assert.deepEqual(
    unconfirmed.map((h) => h.date),
    jp
      .holidaysInYear(year)
      .filter((h) => !h.confirmed)
      .map((h) => h.date),
  );
  assert.equal(unconfirmed.length, 2, "春分の日・秋分の日");
  assert.ok(calendar.holidaysInYear(year).some((h) => !h.confirmed));
});

test("unconfirmedHolidayPolicy: スケジュール、スケジュールからのカレンダー、合成に引き継がれる", () => {
  const schedule = createSchedule({
    holidayProvider: jp,
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    holidayPolicy: { sameAs: 0 },
    unconfirmedHolidayPolicy: "throw",
  });
  assert.equal(schedule.unconfirmedHolidayPolicy, "throw");
  throwsUnconfirmed(() => schedule.valueOn(equinox), "valueOn");
  const fromSchedule = createCalendarFromSchedule(schedule, (v) => v === 1);
  assert.equal(fromSchedule.unconfirmedHolidayPolicy, "throw");
  throwsUnconfirmed(() => fromSchedule.isBusinessDay(equinox), "fromSchedule");
  const accept = createCalendar({ holidayProvider: jp, closedWeekdays: [3] });
  const strict = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    unconfirmedHolidayPolicy: "throw",
  });
  const combined = combineCalendars([accept, strict], { open: "all" });
  assert.equal(combined.unconfirmedHolidayPolicy, "throw", "どれかが throw なら throw");
  throwsUnconfirmed(() => combined.dayInfoOn(equinox), "combined");
  assert.equal(
    combineCalendars([accept, createCalendar({ holidayProvider: jp })], { open: "all" })
      .unconfirmedHolidayPolicy,
    "accept",
  );
});

test("unconfirmedHolidayPolicy: 設定の値の誤りと、判定に祝日を使わない設定の redundant", () => {
  assert.throws(
    () => createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "maybe" as never }),
    (e: unknown) =>
      isBizdaysError(e) &&
      e.code === "invalid-option" &&
      /unconfirmedHolidayPolicy/.test(e.message),
  );
  const brief = (list: readonly { severity: string; code: string; path: string }[]) =>
    list.map((d) => [d.severity, d.code, d.path]);
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidayProvider: jp,
        holidayPolicy: "ignore",
        unconfirmedHolidayPolicy: "throw",
      }),
    ),
    [["info", "redundant", "unconfirmedHolidayPolicy"]],
    "holidayPolicy: ignore で祝日の規則がない",
  );
  assert.deepEqual(
    brief(diagnoseCalendar({ unconfirmedHolidayPolicy: "throw" })),
    [["info", "redundant", "unconfirmedHolidayPolicy"]],
    "提供元がない",
  );
  assert.deepEqual(
    brief(
      diagnoseSchedule({
        holidayProvider: jp,
        weekdayValues: [0, 1, 1, 1, 1, 1, 0],
        unconfirmedHolidayPolicy: "throw",
      }),
    ),
    [["info", "redundant", "unconfirmedHolidayPolicy"]],
    "holiday: weekday で祝日の規則がない",
  );
  for (const options of [
    { holidayProvider: jp, unconfirmedHolidayPolicy: "throw" },
    {
      holidayProvider: jp,
      holidayPolicy: "ignore",
      unconfirmedHolidayPolicy: "throw",
      closedRecurringRules: [{ weekday: 1, holidayOverlapPolicy: "after-holiday" }],
    },
    {
      holidayProvider: jp,
      holidayPolicy: "ignore",
      unconfirmedHolidayPolicy: "throw",
      closedRecurringRules: [{ dayBeforeHoliday: true }],
    },
    { holidayProvider: jp, holidayPolicy: "ignore", unconfirmedHolidayPolicy: "accept" },
  ] as const) {
    assert.deepEqual(brief(diagnoseCalendar(options)), [], JSON.stringify(options));
  }
  // The diagnostics do not throw with "throw" either and evaluate the rules of years with unconfirmed holidays too
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidayProvider: jp,
        unconfirmedHolidayPolicy: "throw",
        openRecurringRules: [{ holiday: true, months: [3], effectiveFrom: `${year}-01-01` }],
      }),
    ),
    [],
  );
});

test("modified の調整は当月の中を先に探し、結果に関係しない月の外の日を評価しない（月がすべて休業日のときだけ月をまたぐ。decisions.md の 17 番・21 番）", () => {
  const code = (c: string) => (e: unknown) => isBizdaysError(e) && e.code === c;
  // New Year's Day 2029 of the UK is a prediction. The next business day after 2028-12-30 (Sat) is in January,
  // so the answer is the previous business day, December 29
  const englandStrict = createCalendar({
    holidayProvider: england,
    closedWeekdays: [0, 6],
    unconfirmedHolidayPolicy: "throw",
  });
  assert.equal(
    englandStrict.adjust("2028-12-30", { convention: "modified-following" }),
    "2028-12-29",
  );
  // The last month of Japan's supported years. The next month (in 2100) is outside them
  const jpYearEnd = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedAnnualDates: [{ from: "12-29", to: "01-03" }],
  });
  assert.equal(jpYearEnd.adjust("2099-12-31", { convention: "modified-following" }), "2099-12-28");
  assert.equal(
    jpYearEnd.dueDate("2099-12", { dayOfMonth: -1, convention: "modified-following" }),
    "2099-12-28",
  );
  // modified-preceding in the first month of the supported years (the month before is in 1954, outside them)
  assert.equal(jpYearEnd.adjust("1955-01-02", { convention: "modified-preceding" }), "1955-01-04");
  // The search limit counts within the month too. Reaching the limit before leaving the month is
  // no-business-day as before
  const limited = createCalendar({
    closedWeekdays: [0, 6],
    searchDayLimit: 10,
    closedDates: [{ from: "2026-11-01", to: "2026-11-30" }],
  });
  assert.equal(limited.adjust("2026-10-31", { convention: "modified-following" }), "2026-10-30");
  assert.throws(
    () =>
      createCalendar({
        closedDates: [{ from: "2026-10-05", to: "2026-10-30" }],
        searchDayLimit: 3,
      }).adjust("2026-10-05", { convention: "modified-following" }),
    code("no-business-day"),
  );
  // When the whole month is closed, the search crosses the month in the original direction (decisions.md #21)
  const closedMonth = createCalendar({ closedDates: [{ from: "2026-11-01", to: "2026-11-30" }] });
  assert.equal(
    closedMonth.adjust("2026-11-15", { convention: "modified-following" }),
    "2026-12-01",
  );
  assert.equal(
    closedMonth.adjust("2026-11-15", { convention: "modified-preceding" }),
    "2026-10-31",
  );
  // following and preceding cross the month as before, even when the month has a business day
  assert.equal(englandStrict.adjust("2028-12-30", { convention: "preceding" }), "2028-12-29");
  assert.equal(closedMonth.adjust("2026-11-15", { convention: "following" }), "2026-12-01");
  assert.equal(closedMonth.adjust("2026-11-15", { convention: "preceding" }), "2026-10-31");
  // following searches across the month, so it is no-business-day at the search limit as before
  // (modified-following returns 10-30 above)
  assert.throws(
    () => limited.adjust("2026-10-31", { convention: "following" }),
    code("no-business-day"),
  );
});

test("同じ提供元のオブジェクトは 1 回だけ数え、診断は書いた位置で報告する（decisions.md の 24 番）", () => {
  assert.equal(createCalendar({ holidayProvider: [jp, jp] }).providers.length, 1);
  assert.deepEqual(
    createCalendar({ holidayProvider: [jp, england, jp], timeZone: "Asia/Tokyo" }).providers,
    [jp, england],
  );
  const bad = {
    id: "BAD",
    timeZone: "Asia/Tokyo",
    supportedYears: { from: 2025, to: 2026 },
    dataVersion: "1",
    // Wrong data that returns a date of another year
    holidaysInYear: (year: number) => [
      { date: `${year + 1}-01-01`, name: "x", nameEn: "x", kind: "regular", confirmed: true },
    ],
  };
  const where = (holidayProvider: unknown) =>
    diagnoseCalendar({ holidayProvider } as never)
      .filter((d) => d.code === "invalid-provider-data")
      .map((d) => d.path);
  assert.deepEqual(where([bad, bad]), ["holidayProvider"]);
  assert.deepEqual(where([jp, jp, bad]), ["holidayProvider[2]"]);
  assert.deepEqual(where([jp, bad]), ["holidayProvider[1]"]);
});
