// 0.30.0 で改名した旧名（0.30.x の間だけ受け付ける）。1.0.0 では、旧名が invalid-option になることを確かめるテストに置き換える
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  type CalendarOptions,
  type ScheduleOptions,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { getHoliday, holidayOn, jp } from "../src/jp/index.ts";
import {
  daysInMonth,
  lengthOfMonth,
  substituteDays,
  withSubstituteDays,
} from "../src/provider/index.ts";

const FROM = "2026-01-01";
const TO = "2026-12-31";

// 旧名だけで書いた設定（型の上では旧名の一部を受けないので、実行時の入力として渡す）
const oldCalendar = {
  holidays: jp,
  outOfRange: "throw",
  unconfirmedHolidays: "accept",
  closedWeekdays: [0],
  closedAnnual: [{ date: "12-31" }],
  closedRecurring: [
    { day: 25, onHolidayRule: "after-holiday" },
    { holiday: true, kinds: ["national"] },
  ],
  openRecurring: [{ weekday: 6, nth: 1 }],
  maxSearchDays: 100,
} as unknown as CalendarOptions;

const newCalendar: CalendarOptions = {
  holidayProvider: jp,
  outOfRangePolicy: "throw",
  unconfirmedHolidayPolicy: "accept",
  closedWeekdays: [0],
  closedAnnualDates: [{ date: "12-31" }],
  closedRecurringRules: [
    { dayOfMonth: 25, holidayOverlapPolicy: "after-holiday" },
    { holiday: true, kinds: ["regular"] },
  ],
  openRecurringRules: [{ weekday: 6, nth: 1 }],
  searchDayLimit: 100,
};

test("旧名: 営業日カレンダーの設定のキーと値は、新しい名前と同じ結果になる（位置は新しい名前で返す）", () => {
  const before = createCalendar(oldCalendar);
  const after = createCalendar(newCalendar);
  assert.deepEqual(before.daysBetween(FROM, TO), after.daysBetween(FROM, TO));
  assert.equal(before.dayInfoOn("2026-12-31").optionPath, "closedAnnualDates[0]");
  assert.equal(before.outOfRangePolicy, "throw");
});

test('旧名: スケジュールの設定のキーと値（holiday: "weekday" は holidayPolicy: "ignore"）', () => {
  const values = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const before = createSchedule({
    holidays: jp,
    weekly: values,
    holiday: "weekday",
    annual: [{ date: "01-02", value: "closed" }],
    recurring: [{ day: -1, value: "short" }],
  } as unknown as ScheduleOptions<string>);
  const after = createSchedule<string>({
    holidayProvider: jp,
    weekdayValues: values,
    holidayPolicy: "ignore",
    annualDates: [{ date: "01-02", value: "closed" }],
    recurringRules: [{ dayOfMonth: -1, value: "short" }],
  });
  assert.deepEqual(before.daysBetween(FROM, TO), after.daysBetween(FROM, TO));
});

test("旧名: 診断は deprecated-option で旧名の位置（利用者が書いた位置）と新しい名前を返す", () => {
  const list = diagnoseCalendar(oldCalendar).filter((d) => d.code === "deprecated-option");
  assert.ok(list.every((d) => d.severity === "warning"));
  assert.deepEqual(
    list.map((d) => d.path).filter((path) => !/[.[]/.test(path)),
    [
      "holidays",
      "outOfRange",
      "unconfirmedHolidays",
      "closedAnnual",
      "closedRecurring",
      "openRecurring",
      "maxSearchDays",
    ],
    "設定の直下",
  );
  const all = diagnoseCalendar(oldCalendar).map((d) => d.path);
  for (const path of [
    "closedRecurring[0].day",
    "closedRecurring[0].onHolidayRule",
    "closedRecurring[1].kinds[0]",
  ]) {
    assert.ok(all.includes(path), path);
  }
  assert.match(
    diagnoseCalendar(oldCalendar).find((d) => d.path === "closedRecurring[0].day")!.message,
    /"day" was renamed to "dayOfMonth" in 0\.30\.0/,
  );
  const schedule = diagnoseSchedule({
    weekly: [1, 1, 1, 1, 1, 1, 1],
    holiday: "weekday",
  } as unknown as ScheduleOptions<number>).map((d) => [d.code, d.path]);
  assert.deepEqual(schedule, [
    ["deprecated-option", "weekly"],
    ["deprecated-option", "holiday"],
    ["deprecated-option", "holiday"],
  ]);
});

test('旧名: kinds の "national" は、日本の祝日の提供元を使う設定でだけ読み替える', () => {
  const other = { ...jp, id: "XX" };
  const list = diagnoseCalendar({
    holidayProvider: other,
    closedRecurringRules: [{ holiday: true, kinds: ["national"] }],
  }).map((d) => d.code);
  assert.ok(!list.includes("deprecated-option"));
});

test("旧名と新しい名前の両方を書くと invalid-option（位置は旧名）", () => {
  assert.throws(
    () => createCalendar({ ...newCalendar, closedAnnual: [] } as unknown as CalendarOptions),
    (e: Error & { code?: string }) =>
      e.code === "invalid-option" &&
      e.message.startsWith(
        'closedAnnual: use only "closedAnnualDates" ("closedAnnual" was renamed in 0.30.0)',
      ),
  );
  assert.throws(
    () =>
      createCalendar({
        closedRecurringRules: [{ dayOfMonth: 1, day: 1 }],
      } as unknown as CalendarOptions),
    /closedRecurringRules\[0\]\.day: use only "dayOfMonth"/,
  );
  assert.throws(
    () =>
      combineCalendars([createCalendar({}), createCalendar({})], {
        open: "all",
        businessDay: "all",
      } as never),
    /businessDay: use only "open"/,
  );
});

test("旧名: メソッド・返す項目・関数は新しい名前と同じ結果を返す", () => {
  const calendar = createCalendar(newCalendar);
  assert.deepEqual(calendar.dayInfo("2026-05-25"), calendar.dayInfoOn("2026-05-25"));
  assert.equal(
    calendar.businessDaysBetween("2026-05-01", "2026-06-01"),
    calendar.diffBusinessDays("2026-05-01", "2026-06-01"),
  );
  assert.deepEqual(
    calendar.listBusinessDays("2026-05-01", "2026-05-10"),
    calendar.businessDatesBetween("2026-05-01", "2026-05-10"),
  );
  assert.deepEqual(calendar.getHoliday("2026-05-05"), calendar.holidayOn("2026-05-05"));
  assert.equal(calendar.outOfRange, calendar.outOfRangePolicy);
  assert.equal(calendar.unconfirmedHolidays, calendar.unconfirmedHolidayPolicy);
  const day = calendar.dayInfoOn("2026-12-31");
  assert.equal(day.businessDay, day.open);
  assert.equal(day.rulePath, day.optionPath);
  assert.deepEqual(getHoliday("2026-05-05"), holidayOn("2026-05-05"));
  assert.equal(daysInMonth, lengthOfMonth);
  assert.equal(substituteDays, withSubstituteDays);
});

test("旧名: 合成・スケジュールからのカレンダー・期日・振替の設定", () => {
  const a = createCalendar({ closedWeekdays: [0] });
  const b = createCalendar({ closedWeekdays: [6] });
  const before = combineCalendars([a, b], { businessDay: "all", maxSearchDays: 30 } as never);
  const after = combineCalendars([a, b], { open: "all", searchDayLimit: 30 });
  assert.deepEqual(before.daysBetween(FROM, "2026-02-28"), after.daysBetween(FROM, "2026-02-28"));
  assert.equal(
    a.dueDate("2026-05", { day: 31, convention: "preceding" } as never),
    a.dueDate("2026-05", { dayOfMonth: 31, convention: "preceding" }),
  );
  const schedule = createSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0] });
  assert.equal(
    createCalendarFromSchedule(schedule, (v) => v === 1, { maxSearchDays: 7 }).nextBusinessDay(
      "2026-05-01",
    ),
    createCalendarFromSchedule(schedule, (v) => v === 1, { searchDayLimit: 7 }).nextBusinessDay(
      "2026-05-01",
    ),
  );
  const holidays = [
    { date: "2026-01-04", name: "X", nameEn: "X", kind: "regular", confirmed: true },
  ] as const;
  const rename = () => ({ name: "振替", nameEn: "Substitute" });
  assert.deepEqual(
    withSubstituteDays([...holidays], {
      rules: { 0: "next" },
      kind: "substitute",
      name: rename,
      original: "drop",
    } as never),
    withSubstituteDays([...holidays], {
      directions: { 0: "next" },
      kind: "substitute",
      renameSubstitute: rename,
      originalPolicy: "drop",
    }),
  );
});
