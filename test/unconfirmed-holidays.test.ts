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

test("unconfirmedHolidays: 既定は accept で、これまでどおり予測の祝日で判定する", () => {
  const calendar = createCalendar({ holidays: jp, closedWeekdays: [0, 6] });
  assert.equal(calendar.unconfirmedHolidays, "accept");
  assert.equal(calendar.isBusinessDay(equinox), false);
  assert.equal(calendar.dayInfo(equinox).holiday?.confirmed, false);
});

test("unconfirmedHolidays: throw は、評価した日が未確定の祝日なら止める（探索・調整・期日・隣の日を見る規則を含む）", () => {
  const calendar = createCalendar({
    holidays: jp,
    closedWeekdays: [0, 6],
    unconfirmedHolidays: "throw",
  });
  assert.equal(calendar.unconfirmedHolidays, "throw");
  // 確定している年はこれまでどおり
  assert.equal(calendar.isBusinessDay(`${jp.confirmedThrough}-01-01`), false);
  throwsUnconfirmed(() => calendar.dayInfo(equinox), "dayInfo");
  throwsUnconfirmed(() => calendar.isBusinessDay(equinox), "isBusinessDay");
  throwsUnconfirmed(() => calendar.isHoliday(equinox), "isHoliday");
  throwsUnconfirmed(() => calendar.adjust(equinox, { convention: "following" }), "adjust");
  throwsUnconfirmed(
    () =>
      calendar.dueDate(equinox.slice(0, 7), {
        day: Number(equinox.slice(8)) as 20,
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
    () => calendar.businessDaysBetween(`${year}-01-01`, `${year}-12-31`),
    "businessDaysBetween",
  );
  // 祝前日・祝日の翌日の規則は隣の日の祝日を引くので、その日自身が祝日でなくても止まる
  const eve = createCalendar({
    holidays: jp,
    closedRecurring: [{ dayBeforeHoliday: true }],
    unconfirmedHolidays: "throw",
  });
  const prev = new Date(`${equinox}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  throwsUnconfirmed(() => eve.isBusinessDay(prev.toISOString().slice(0, 10)), "dayBeforeHoliday");
});

test("unconfirmedHolidays: holidaysInYear・holidaysBetween は投げず、影響する日を列挙できる（逃げ道）", () => {
  const calendar = createCalendar({ holidays: jp, unconfirmedHolidays: "throw" });
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

test("unconfirmedHolidays: スケジュール、スケジュールからのカレンダー、合成に引き継がれる", () => {
  const schedule = createSchedule({
    holidays: jp,
    weekly: [0, 1, 1, 1, 1, 1, 0],
    holiday: { sameAs: 0 },
    unconfirmedHolidays: "throw",
  });
  assert.equal(schedule.unconfirmedHolidays, "throw");
  throwsUnconfirmed(() => schedule.valueOn(equinox), "valueOn");
  const fromSchedule = createCalendarFromSchedule(schedule, (v) => v === 1);
  assert.equal(fromSchedule.unconfirmedHolidays, "throw");
  throwsUnconfirmed(() => fromSchedule.isBusinessDay(equinox), "fromSchedule");
  const accept = createCalendar({ holidays: jp, closedWeekdays: [3] });
  const strict = createCalendar({
    holidays: jp,
    closedWeekdays: [0, 6],
    unconfirmedHolidays: "throw",
  });
  const combined = combineCalendars([accept, strict], { businessDay: "all" });
  assert.equal(combined.unconfirmedHolidays, "throw", "どれかが throw なら throw");
  throwsUnconfirmed(() => combined.dayInfo(equinox), "combined");
  assert.equal(
    combineCalendars([accept, createCalendar({ holidays: jp })], { businessDay: "all" })
      .unconfirmedHolidays,
    "accept",
  );
});

test("unconfirmedHolidays: 設定の値の誤りと、判定に祝日を使わない設定の redundant", () => {
  assert.throws(
    () => createCalendar({ holidays: jp, unconfirmedHolidays: "maybe" as never }),
    (e: unknown) =>
      isBizdaysError(e) && e.code === "invalid-option" && /unconfirmedHolidays/.test(e.message),
  );
  const brief = (list: readonly { severity: string; code: string; path: string }[]) =>
    list.map((d) => [d.severity, d.code, d.path]);
  assert.deepEqual(
    brief(
      diagnoseCalendar({ holidays: jp, holidayPolicy: "ignore", unconfirmedHolidays: "throw" }),
    ),
    [["info", "redundant", "unconfirmedHolidays"]],
    "holidayPolicy: ignore で祝日の規則がない",
  );
  assert.deepEqual(
    brief(diagnoseCalendar({ unconfirmedHolidays: "throw" })),
    [["info", "redundant", "unconfirmedHolidays"]],
    "提供元がない",
  );
  assert.deepEqual(
    brief(
      diagnoseSchedule({
        holidays: jp,
        weekly: [0, 1, 1, 1, 1, 1, 0],
        unconfirmedHolidays: "throw",
      }),
    ),
    [["info", "redundant", "unconfirmedHolidays"]],
    "holiday: weekday で祝日の規則がない",
  );
  for (const options of [
    { holidays: jp, unconfirmedHolidays: "throw" },
    {
      holidays: jp,
      holidayPolicy: "ignore",
      unconfirmedHolidays: "throw",
      closedRecurring: [{ weekday: 1, onHolidayRule: "after-holiday" }],
    },
    {
      holidays: jp,
      holidayPolicy: "ignore",
      unconfirmedHolidays: "throw",
      closedRecurring: [{ dayBeforeHoliday: true }],
    },
    { holidays: jp, holidayPolicy: "ignore", unconfirmedHolidays: "accept" },
  ] as const) {
    assert.deepEqual(brief(diagnoseCalendar(options)), [], JSON.stringify(options));
  }
  // 診断は "throw" でも例外を投げず、未確定の祝日を含む年の規則も評価する
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidays: jp,
        unconfirmedHolidays: "throw",
        openRecurring: [{ holiday: true, months: [3], effectiveFrom: `${year}-01-01` }],
      }),
    ),
    [],
  );
});
