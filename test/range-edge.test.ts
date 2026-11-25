// The ends of the calendar range (years 1000-9999), circular values, arrays with holes and instants beyond the
// range of Date (the fixes of 0.31.6).
// Each is a check, per kind of input, of the promises that the diagnostics return no error for options that can
// be created and that errors have a code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, isBizdaysError, toDateString } from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { withSubstituteDays } from "../src/provider/index.ts";

const codeOf = (f: () => unknown): unknown => {
  try {
    f();
  } catch (error) {
    assert.ok(isBizdaysError(error), `code のない例外: ${String(error)}`);
    return error.code;
  }
  return undefined;
};

/** Per kind of rule, an effective period put at an end of the range on one side only */
const EDGE_RULES: readonly Record<string, unknown>[] = [
  { weekday: 1 },
  { weekday: 2, interval: 50, anchor: "2026-01-06" },
  { dayOfMonth: -1 },
  { weekday: 1, holidayOverlapPolicy: "after-holiday" },
  { dayOfMonth: 15, holidayOverlapPolicy: "after-holiday", skipWeekdays: [0, 6] },
  { holiday: true },
  { dayAfterHoliday: true },
  { dayBeforeHoliday: true, skipWeekdays: [0, 6] },
  { businessDayOfMonth: -1 },
  { businessDayOfWeek: 1, weekStart: 3 },
  { cycle: 400, anchor: "2026-01-01", positions: [1] },
];
const EDGE_PERIODS: readonly Record<string, unknown>[] = [
  {}, // no effective period (with a provider whose supported years are at an end, the scan window is there)
  { effectiveTo: "1000-01-10" },
  { effectiveTo: "1000-12-31" },
  { effectiveFrom: "9999-12-20" },
  { effectiveFrom: "9999-12-31" },
];
/** A provider whose supported years are at an end of the calendar range (January 1 is a holiday every year) */
const edgeProvider = (from: number, to: number) => ({
  id: `EDGE-${from}`,
  timeZone: "UTC",
  supportedYears: { from, to },
  dataVersion: "x",
  holidaysInYear: (y: number) => [
    { date: `${y}-01-01`, name: "a", nameEn: "a", kind: "regular", key: "a", confirmed: true },
  ],
});
/**
 * A provider whose supported years are not at an end of the range (2020-2030, January 1 a holiday every year).
 * It takes the same path as the Japanese provider (1955-2099) with a short scan of all supported days
 */
const middleProvider = {
  ...edgeProvider(2020, 2030),
  id: "MIDDLE",
};
const EDGE_BASES: readonly Record<string, unknown>[] = [
  {},
  { holidayProvider: middleProvider },
  { holidayProvider: middleProvider, outOfRangePolicy: "ignore" },
  { holidayProvider: edgeProvider(1000, 1002) },
  { holidayProvider: edgeProvider(9997, 9999) },
];
/** Whether a rule is an nth-business-day rule (in a schedule it needs a basis calendar) */
const isCounting = (rule: Record<string, unknown>): boolean =>
  "businessDayOfMonth" in rule || "businessDayOfWeek" in rule;

test("範囲の端: 有効期間が 1000 年・9999 年の端にある設定で、診断の error と作成の成否が一致する", () => {
  for (const rule of EDGE_RULES)
    for (const period of EDGE_PERIODS)
      for (const base of EDGE_BASES) {
        // With a provider whose supported years are at an end of the range the scan window itself is there, so
        // only rules without an effective period are examined. Other providers are examined with rules whose
        // effective period is at an end
        const edge = String(
          (base["holidayProvider"] as { id?: string } | undefined)?.id,
        ).startsWith("EDGE");
        if (edge !== (Object.keys(period).length === 0)) continue;
        const options = { ...base, closedRecurringRules: [{ ...rule, ...period }] };
        const created = codeOf(() => createCalendar(options as never)) === undefined;
        const errors = diagnoseCalendar(options).filter((d) => d.severity === "error");
        assert.equal(errors.length === 0, created, JSON.stringify([options, errors]));
        // An nth-business-day rule of a schedule counts on a calendar with the same provider (no rules)
        const basis = isCounting(rule) ? { calendar: createCalendar(base as never) } : {};
        const schedule = {
          ...base,
          weekdayValues: [1, 1, 1, 1, 1, 1, 1],
          recurringRules: [{ ...rule, ...period, ...basis, value: 2 }],
        };
        const scheduleCreated = codeOf(() => createSchedule(schedule as never)) === undefined;
        const scheduleErrors = diagnoseSchedule(schedule).filter((d) => d.severity === "error");
        assert.equal(
          scheduleErrors.length === 0,
          scheduleCreated,
          JSON.stringify([schedule, scheduleErrors]),
        );
      }
  for (const period of EDGE_PERIODS)
    assert.deepEqual(
      diagnoseCalendar({ closedAnnualDates: [{ date: "01-01", ...period }] }).filter(
        (d) => d.severity === "error",
      ),
      [],
    );
});

test("範囲の端の判定: 規則の種類ごとに、1000 年・9999 年の端の日の判定・探索は、範囲の中の日を返すか out-of-range を投げる（ほかの code・code のない例外・範囲の外の日付を返さない。decisions.md の 1 番）", () => {
  const days = [
    ...["01", "02", "03", "04", "05", "06", "07"].map((d) => `1000-01-${d}`),
    ...["25", "26", "27", "28", "29", "30", "31"].map((d) => `9999-12-${d}`),
  ];
  const allowed = new Set(["out-of-range", "no-business-day", "no-closed-day"]);
  const outcome = (f: () => unknown): string => {
    let value: unknown;
    try {
      value = f();
    } catch (error) {
      assert.ok(isBizdaysError(error), `code のない例外: ${String(error)}`);
      assert.ok(allowed.has(error.code), `${error.code}: ${error.message}`);
      return error.code;
    }
    // A string shaped like a date must be a calendar date within the range (strings such as reasons do not start
    // with a digit)
    if (typeof value === "string" && /^[+-]?\d/.test(value))
      assert.match(value, /^[1-9]\d{3}-\d{2}-\d{2}$/, `範囲の外の日付: ${value}`);
    return "value";
  };
  const wide = edgeProvider(1000, 9999);
  for (const rule of EDGE_RULES)
    for (const base of [{}, { holidayProvider: wide }]) {
      const calendar = createCalendar({ ...base, closedRecurringRules: [rule] } as never);
      const basis = isCounting(rule) ? { calendar: createCalendar(base as never) } : {};
      const schedule = createSchedule({
        ...base,
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        recurringRules: [{ ...rule, ...basis, value: 2 }],
      } as never);
      for (const day of days) {
        const label = `${JSON.stringify(rule)} ${JSON.stringify(Object.keys(base))} ${day}`;
        for (const f of [
          () => calendar.isBusinessDay(day),
          () => calendar.dayInfoOn(day).reason,
          () => calendar.nextBusinessDay(day),
          () => calendar.previousBusinessDay(day),
          () => calendar.addBusinessDays(day, 1),
          () => calendar.addBusinessDays(day, -1),
          () => schedule.valueOn(day),
          () => schedule.dayInfoOn(day).reason,
        ])
          outcome(f);
        // The only error of a judgement is out-of-range when it looks at a day outside the range (the judgement
        // of that day needs a day that does not exist as a calendar date)
        assert.ok(
          ["value", "out-of-range"].includes(outcome(() => calendar.isBusinessDay(day))),
          label,
        );
      }
    }
});

test("値の比較: 循環する値は形が同じなら同じ、違えば違う。深すぎる入れ子は同じとみなさない", () => {
  const cyclic = (open: string): Record<string, unknown> => {
    const value: Record<string, unknown> = { open };
    value["self"] = value;
    return value;
  };
  const diagnose = (weekday: unknown, rule: unknown) =>
    diagnoseSchedule({
      weekdayValues: [weekday, weekday, weekday, weekday, weekday, weekday, weekday],
      recurringRules: [{ weekday: 1, value: rule }],
    }).map((d) => d.code);
  assert.deepEqual(diagnose(cyclic("10:00"), cyclic("10:00")), ["redundant"]);
  assert.deepEqual(diagnose(cyclic("10:00"), cyclic("11:00")), []);
  const deep = (): unknown => {
    let value: unknown = 1;
    for (let i = 0; i < 20000; i++) value = { value };
    return value;
  };
  assert.deepEqual(diagnose(deep(), deep()), []);
  createSchedule({ weekdayValues: Array.from({ length: 7 }, () => cyclic("10:00")) } as never);
});

test("穴のある配列: 提供元の返すデータは invalid-provider-data、withSubstituteDays は invalid-argument", () => {
  const holes = (year: number): unknown[] => {
    const list: unknown[] = [];
    list[2] = { date: `${year}-01-01`, name: "a", nameEn: "a", kind: "k", confirmed: true };
    return list;
  };
  const provider = {
    id: "XX",
    timeZone: "UTC",
    supportedYears: { from: 2020, to: 2030 },
    dataVersion: "x",
    holidaysInYear: holes,
  };
  const calendar = createCalendar({ holidayProvider: provider as never });
  assert.equal(
    codeOf(() => calendar.isHoliday("2026-01-01")),
    "invalid-provider-data",
  );
  assert.equal(
    codeOf(() => calendar.holidaysInYear(2026)),
    "invalid-provider-data",
  );
  assert.deepEqual(
    diagnoseCalendar({ holidayProvider: provider }).map((d) => d.code),
    ["invalid-provider-data"],
  );
  assert.equal(
    codeOf(() =>
      withSubstituteDays(holes(2026) as never, { directions: { 6: "next" }, kind: "s" }),
    ),
    "invalid-argument",
  );
});

test("瞬間: Date の範囲を超える epochMilliseconds は out-of-range、文字列でない calendarId は invalid-input", () => {
  for (const ms of [1e20, -1e20, 8.64e15 + 1, 8.64e15, -8.64e15, Number.MAX_VALUE])
    assert.equal(
      codeOf(() => toDateString({ epochMilliseconds: ms }, "UTC")),
      "out-of-range",
      String(ms),
    );
  for (const calendarId of [Symbol("x"), 1, {}, "japanese"])
    assert.equal(
      codeOf(() => toDateString({ year: 2026, month: 1, day: 1, calendarId } as never, "UTC")),
      "invalid-input",
    );
});
