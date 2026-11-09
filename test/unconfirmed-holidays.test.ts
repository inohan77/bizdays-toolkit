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

// jp.confirmedThrough より後の年の春分の日・秋分の日は予測（confirmed: false）
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
  // 確定している年はこれまでどおり
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
  // 探索が途中で通る日（結果の日が未確定でなくても止まる）
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
  // 祝前日・祝日の翌日の規則は隣の日の祝日を引くので、その日自身が祝日でなくても止まる
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
  // 診断は "throw" でも例外を投げず、未確定の祝日を含む年の規則も評価する
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
  // 英国の 2029 年の元日は予測。2028-12-30（土）の翌営業日は 1 月なので、答えは前営業日の 12 月 29 日
  const englandStrict = createCalendar({
    holidayProvider: england,
    closedWeekdays: [0, 6],
    unconfirmedHolidayPolicy: "throw",
  });
  assert.equal(
    englandStrict.adjust("2028-12-30", { convention: "modified-following" }),
    "2028-12-29",
  );
  // 日本の対応年の最後の月。翌月（2100 年）は対応年の外
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
  // 対応年の最初の月の modified-preceding（前月は 1954 年で対応年の外）
  assert.equal(jpYearEnd.adjust("1955-01-02", { convention: "modified-preceding" }), "1955-01-04");
  // 探索の上限は当月の中でも数える。月の外へ出る前に上限に達したら、前と同じ no-business-day
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
  // 月がすべて休業日なら、元の向きに月をまたぐ（21 番）
  const closedMonth = createCalendar({ closedDates: [{ from: "2026-11-01", to: "2026-11-30" }] });
  assert.equal(
    closedMonth.adjust("2026-11-15", { convention: "modified-following" }),
    "2026-12-01",
  );
  assert.equal(
    closedMonth.adjust("2026-11-15", { convention: "modified-preceding" }),
    "2026-10-31",
  );
  // following・preceding は前と同じく、当月に営業日があっても月をまたぐ
  assert.equal(englandStrict.adjust("2028-12-30", { convention: "preceding" }), "2028-12-29");
  assert.equal(closedMonth.adjust("2026-11-15", { convention: "following" }), "2026-12-01");
  assert.equal(closedMonth.adjust("2026-11-15", { convention: "preceding" }), "2026-10-31");
  // following は月をまたいで探すので、前と同じく探索の上限で no-business-day（modified-following は上で 10-30 を返す）
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
    // 別の年の日付を返す誤ったデータ
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
