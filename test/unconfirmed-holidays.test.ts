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
