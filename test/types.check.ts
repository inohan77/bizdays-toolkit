/**
 * Type tests. Not run; checked by pnpm typecheck (tsc).
 *
 * They check that the types keep working well from a user's point of view (inference, completion, and what
 * should be a type error).
 * Lines that should be type errors have @ts-expect-error, so tsc fails when one stops being a type error.
 */

import {
  closingPeriod,
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
  monthOf,
  toDateTimeParts,
  toInstant,
  type BusinessDayConvention,
  type BusinessDayOfMonthPattern,
  type DateInput,
  type DayInfo,
  type ScheduleDayInfo,
  type Holiday,
  type HolidayProvider,
  type ScheduleHolidayPolicy,
  type DayReason,
  type ErrorCode,
  type KnownDayReason,
  type KnownScheduleDayReason,
  type ScheduleDayReason,
  type RecurringRule,
  type CyclePattern,
} from "../src/index.ts";
import {
  holidayOn,
  jp,
  toJapanDateTime,
  type JpHolidayKind,
  type KnownJpHolidayKey,
  type KnownJpHolidayKind,
} from "../src/jp/index.ts";
import { england, type KnownUkHolidayKey } from "../src/uk/index.ts";
import { sg, type KnownSgHolidayKey } from "../src/sg/index.ts";
import { withSubstituteDays } from "../src/provider/index.ts";
import {
  diagnoseCalendar,
  diagnoseSchedule,
  type DiagnosticCode,
  type KnownDiagnosticCode,
} from "../src/diagnose/index.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<T extends true>(): T | void {}

// --- The value type of a schedule is inferred from weekdayValues ---
const numbers = createSchedule({ weekdayValues: [1, 2, 3, 4, 5, 6, 7] });
expectType<Equal<ReturnType<typeof numbers.valueOn>, number>>();

type Hours = { open: string; close: string } | null;
const hours = createSchedule<Hours>({
  holidayProvider: jp,
  weekdayValues: [null, null, null, null, null, null, null],
});
expectType<Equal<ReturnType<typeof hours.valueOn>, Hours>>();

// --- The reason of a judgement is an open type: comparable with known values, and accepting future ones ---
const reason: DayReason = createCalendar().dayInfoOn("2026-01-01").reason;
if (reason === "closed-annual" || reason === "default") {
  // A comparison with a known value can be written as it is
}
const futureReason: DayReason = "closed-something-new";
const futureScheduleReason: ScheduleDayReason = "something-new";
void futureReason;
void futureScheduleReason;

// The closed type (Known...) does not accept future values. For users who want to check exhaustiveness
// @ts-expect-error -- KnownDayReason has no "closed-something-new"
const closedReason: KnownDayReason = "closed-something-new";
void closedReason;

function labelOf(r: KnownScheduleDayReason): string {
  switch (r) {
    case "date":
      return "個別の日付";
    case "annual":
      return "毎年の月日";
    case "recurring":
      return "繰り返しの規則";
    case "holiday":
      return "祝日";
    case "weekday":
      return "曜日";
    default: {
      const unreachable: never = r;
      return unreachable;
    }
  }
}
void labelOf;

// --- The kind of a holiday is an open type too ---
const kind: JpHolidayKind | undefined = holidayOn("2026-11-23")?.kind;
void kind;
const futureKind: JpHolidayKind = "observance";
void futureKind;
// @ts-expect-error -- KnownJpHolidayKind has no "observance"
const closedKind: KnownJpHolidayKind = "observance";
void closedKind;

// --- Error codes ---
try {
  createCalendar({ timeZone: "Asia/Nowhere" });
} catch (error) {
  if (isBizdaysError(error)) {
    const code: ErrorCode = error.code;
    if (code === "invalid-time-zone") {
      // A comparison with a known code can be written as it is
    }
  }
}

// --- What should be a type error ---
// @ts-expect-error -- weekdayValues needs 7 values
createSchedule({ weekdayValues: [1, 2, 3] });
// @ts-expect-error -- sameAs is a weekday (0-6)
createSchedule({ weekdayValues: [1, 1, 1, 1, 1, 1, 1], holidayPolicy: { sameAs: 7 } });
// @ts-expect-error -- a typo in an option key is a type error in TypeScript
createCalendar({ closedWeekday: [0] });
// @ts-expect-error -- wrong value of holidayPolicy
createCalendar({ holidayPolicy: "skip" });
// @ts-expect-error -- the returned list cannot be changed
createCalendar({ holidayProvider: jp }).holidaysInYear(2026).push(jp.holidaysInYear(2026)[0]!);

// --- Recurring rules ---
createCalendar({
  closedRecurringRules: [
    { weekday: 1 },
    { weekday: 3, nth: [2, 4], months: [8, 12], holidayOverlapPolicy: "after-holiday", name: "x" },
    { dayOfMonth: -1, holidayOverlapPolicy: "over-holiday" },
  ],
});
// @ts-expect-error -- weekday and dayOfMonth cannot be given together
createCalendar({ closedRecurringRules: [{ weekday: 1, dayOfMonth: 3 }] });
// @ts-expect-error -- nth is 1-5 or -1
createCalendar({ closedRecurringRules: [{ weekday: 1, nth: 6 }] });
// @ts-expect-error -- nth can be used only in a weekday rule
createCalendar({ closedRecurringRules: [{ dayOfMonth: 3, nth: 1 }] });
// @ts-expect-error -- dayOfMonth is 1-31 or -1
createCalendar({ closedRecurringRules: [{ dayOfMonth: 32 }] });
// @ts-expect-error -- months is 1-12
createCalendar({ closedRecurringRules: [{ dayOfMonth: 1, months: [13] }] });
// @ts-expect-error -- wrong value of holidayOverlapPolicy
createCalendar({ closedRecurringRules: [{ dayOfMonth: 1, holidayOverlapPolicy: "rule" }] });
// @ts-expect-error -- a recurring rule of a schedule needs value
createSchedule({ weekdayValues: [1, 1, 1, 1, 1, 1, 1], recurringRules: [{ dayOfMonth: 1 }] });

// --- Effective period, cycle, day after a holiday ---
createCalendar({
  holidayProvider: jp,
  closedRecurringRules: [
    { weekday: 1, effectiveTo: "2027-03-31" },
    { weekday: 3, interval: 2, anchor: "2026-01-07", effectiveFrom: "2026-01-07" },
    { dayAfterHoliday: true, months: [5], name: "x" },
  ],
  closedAnnualDates: [{ from: "08-13", to: "08-16", effectiveTo: "2026-12-31" }, "12-31"],
});
// @ts-expect-error -- interval can be used only in a weekday rule
createCalendar({ closedRecurringRules: [{ dayOfMonth: 1, interval: 2, anchor: "2026-01-07" }] });
// @ts-expect-error -- dayAfterHoliday is true only
createCalendar({ closedRecurringRules: [{ dayAfterHoliday: false }] });
// @ts-expect-error -- dayAfterHoliday and weekday cannot be given together
createCalendar({ closedRecurringRules: [{ dayAfterHoliday: true, weekday: 1 }] });
// @ts-expect-error -- a specific date cannot have an effective period
createCalendar({ closedDates: [{ date: "2026-10-19", effectiveTo: "2026-12-31" }] });

// --- Holiday rules, optionPath ---
createCalendar({
  holidayProvider: jp,
  openRecurringRules: [
    { holiday: true },
    { holiday: true, kinds: ["substitute", "citizens"], months: [5], effectiveFrom: "2027-04-01" },
  ],
});
// @ts-expect-error -- holiday is true only
createCalendar({ closedRecurringRules: [{ holiday: false }] });
// @ts-expect-error -- kinds can be used only in a holiday rule
createCalendar({ closedRecurringRules: [{ weekday: 1, kinds: ["regular"] }] });
// @ts-expect-error -- holiday and dayAfterHoliday cannot be given together
createCalendar({ closedRecurringRules: [{ holiday: true, dayAfterHoliday: true }] });

// --- The guard for unconfirmed holidays, asOf of the diagnostics ---
{
  const c = createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "throw" });
  expectType<Equal<typeof c.unconfirmedHolidayPolicy, "accept" | "throw">>();
  createSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0], unconfirmedHolidayPolicy: "accept" });
  // @ts-expect-error -- unconfirmedHolidayPolicy is "accept" or "throw"
  createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "ignore" });
  const list = diagnoseCalendar({ holidayProvider: jp }, { asOf: "2026-10-23" });
  const codes: readonly string[] = list.map((d) => d.code);
  void codes;
  diagnoseSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0] }, {});
  // @ts-expect-error -- asOf is a date string only
  diagnoseCalendar({}, { asOf: new Date() });
}

// --- Day before a holiday, decidedByPath ---
createCalendar({
  holidayProvider: jp,
  closedRecurringRules: [
    { dayBeforeHoliday: true },
    { dayBeforeHoliday: true, weekdays: [1, 2, 3, 4, 5], months: [5], effectiveFrom: "2027-01-01" },
  ],
});
// @ts-expect-error -- dayBeforeHoliday is true only
createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: false }] });
// @ts-expect-error -- dayBeforeHoliday and dayAfterHoliday cannot be given together
createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true, dayAfterHoliday: true }] });
// @ts-expect-error -- dayBeforeHoliday and weekday cannot be given together
createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true, weekday: 1 }] });
// A day-before-holiday rule can be filtered by kinds and keys of the holiday on the next day
createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true, kinds: ["regular"] }] });
{
  const c = combineCalendars([createCalendar({}), createCalendar({ closedWeekdays: [0] })], {
    open: "all",
  });
  const path: readonly number[] | undefined = c.dayInfoOn("2026-10-19").decidedByPath;
  void path;
}
{
  const c = createCalendar({ holidayProvider: jp });
  const optionPath: string | undefined = c.dayInfoOn("2026-10-19").optionPath;
  const s = createSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 1] });
  const rulePath2: string | undefined = s.dayInfoOn("2026-10-19").optionPath;
  void optionPath;
  void rulePath2;
}

// --- The weekdays filter, the type of kinds, closing days that consider business days ---
{
  const c = createCalendar({
    holidayProvider: jp,
    openRecurringRules: [
      { holiday: true, kinds: ["substitute", "citizens"], weekdays: [6], months: [5] },
      { dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] },
    ],
  });
  // Completion works for kinds with the provider's kinds (an open type, so other strings pass too)
  createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ holiday: true, kinds: ["anything"] }],
  });
  // @ts-expect-error -- weekdays can be used only in holiday and day-after-holiday rules
  createCalendar({ closedRecurringRules: [{ weekday: 1, weekdays: [1] }] });
  // @ts-expect-error -- the elements of weekdays are 0-6
  createCalendar({ closedRecurringRules: [{ holiday: true, weekdays: [7] }] });
  // A day-after-holiday rule can be filtered by kinds of the holiday on the day before
  createCalendar({ closedRecurringRules: [{ dayAfterHoliday: true, kinds: ["regular"] }] });
  // @ts-expect-error -- kinds can be used only in holiday, day-after-holiday and day-before-holiday rules
  createCalendar({ closedRecurringRules: [{ weekday: 1, kinds: ["regular"] }] });
  const month: string = c.closingMonth("2026-09-19", 20, { convention: "preceding" });
  const period: { readonly from: string; readonly to: string } = c.closingPeriod("2026-10", 20, {
    convention: "preceding",
  });
  void month;
  void period;
  // @ts-expect-error -- convention is required
  c.closingMonth("2026-09-19", 20);
  // @ts-expect-error -- convention is required
  c.closingPeriod("2026-10", 20, {});
  // Code that uses RecurringRule alone works as before without a type argument
  const rules: RecurringRule[] = [{ holiday: true, kinds: ["x"] }, { weekday: 1 }];
  createCalendar({ holidayProvider: jp, closedRecurringRules: rules });
}

// --- Closing periods, conversion to an instant ---
{
  const period: { readonly from: string; readonly to: string } = closingPeriod("2026-11", 20);
  createCalendar({ closedDates: [period, closingPeriod("2026-11-05", -1)] });
  const instant: Date = toInstant("2026-11-23", "10:00", "Asia/Tokyo");
  const c = createCalendar({ holidayProvider: jp });
  const instant2: Date = c.instantOf("2026-11-23", "10:00:30");
  void instant;
  void instant2;
  // @ts-expect-error -- instantOf accepts a date string only (a Date cannot be passed)
  c.instantOf(new Date(), "10:00");
  // @ts-expect-error -- closingDay is a number
  closingPeriod("2026-11", "20");
}

// --- A calendar from a schedule ---
{
  const hours = createSchedule<{ open: string } | null>({
    weekdayValues: [null, { open: "9" }, null, null, null, null, null],
  });
  const c = createCalendarFromSchedule(hours, (v) => v !== null);
  expectType<Equal<typeof c, ReturnType<typeof createCalendar<string>>>>();
  createCalendarFromSchedule(hours, (v) => v !== null, { searchDayLimit: 10 });
  // @ts-expect-error -- isOpen receives the value only (no date is passed)
  createCalendarFromSchedule(hours, (v, date: string) => v !== null && date > "");
  // @ts-expect-error -- the value type does not match
  createCalendarFromSchedule(hours, (v: number) => v > 0);
  // @ts-expect-error -- a calendar cannot be passed
  createCalendarFromSchedule(c, () => true);
  const reason: "open-annual" | "closed-annual" | string = c.dayInfoOn("2026-10-20").reason;
  void reason;
}

// --- Combining calendars ---
{
  const a = createCalendar({ holidayProvider: jp });
  const b = createCalendar({ holidayProvider: jp, closedWeekdays: [0] });
  const combined = combineCalendars([a, b], { open: "all" });
  expectType<Equal<typeof combined, ReturnType<typeof createCalendar<JpHolidayKind>>>>();
  const decidedBy: number | undefined = combined.dayInfoOn("2026-10-19").decidedBy;
  void decidedBy;
  // @ts-expect-error -- businessDay is "all" or "any"
  combineCalendars([a, b], { businessDay: "both" });
  // @ts-expect-error -- businessDay is required
  combineCalendars([a, b], {});
}

// The original date of a move is an optional string
const shifted: string | undefined = createCalendar().dayInfoOn("2026-10-13").shiftedFrom;
void shifted;

// The type for how a holiday's value is decided, ScheduleHolidayPolicy
const sundayHours: ScheduleHolidayPolicy<number> = { sameAs: 0 };
createSchedule({ weekdayValues: [1, 2, 3, 4, 5, 6, 7], holiday: sundayHours });

// --- Diagnostics of rules ---
const diagnostics = diagnoseCalendar({ holidayProvider: jp, closedWeekdays: [0] });
// A mistyped key can be passed without a type error (so that the diagnostics find it)
diagnoseCalendar({ closeWeekdays: [0] });
diagnoseSchedule({
  weekdayValues: [1, 1, 1, 1, 1, 1, 1],
  recurringRules: [{ dayOfMonth: 1, value: 0 }],
});
for (const d of diagnostics) {
  // The severity is a closed type (exhaustive)
  expectType<Equal<typeof d.severity, "error" | "warning" | "info">>();
  // code is an open type
  expectType<Equal<typeof d.code, DiagnosticCode>>();
  const known: KnownDiagnosticCode = "shadowed";
  const code: DiagnosticCode = "some-future-code";
  void known;
  void code;
  const related: string | undefined = d.relatedPath;
  void related;
}
// @ts-expect-error -- the diagnostics result cannot be changed
diagnostics.push(diagnostics[0]!);

// --- Month calculations and adjusting dates ---
const office = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
const adjusted: string = office.adjust("2026-10-31", { convention: "modified-following" });
void adjusted;
office.dueDate(monthOf("2026-10-16", 1), { dayOfMonth: -1, convention: "preceding" });
// @ts-expect-error -- convention is required (it has no default)
office.adjust("2026-10-31", {});
// @ts-expect-error -- "nearest" is not adopted
office.adjust("2026-10-31", { convention: "nearest" });
// @ts-expect-error -- the day of a due date is 1-31 or -1
office.dueDate("2026-10", { dayOfMonth: 0, convention: "following" });
const convention: BusinessDayConvention = "preceding";
void convention;

// --- Names of holidays in other languages ---
const holidayNames: Readonly<Record<string, string>> | undefined = createCalendar({
  holidayProvider: jp,
}).holidayOn("2026-11-23")?.names;
void holidayNames;
// A provider may omit names (existing providers keep type-checking as they are)
const withoutNames: HolidayProvider = {
  id: "XX",
  timeZone: "UTC",
  supportedYears: { from: 2000, to: 2100 },
  dataVersion: "1",
  holidaysInYear: (year) => [
    { date: `${year}-12-25`, name: "n", nameEn: "n", kind: "k", confirmed: true },
  ],
};
void withoutNames;

// ------------------------------------------------------------
// With an input that always has a time, `time` is string (toDateTimeParts, civilOf, and the deprecated
// toJapanDateTime as long as it exists)
// ------------------------------------------------------------
{
  const instant = { epochMilliseconds: 0 };
  const plainDateTime = { year: 2026, month: 11, day: 23, hour: 10, minute: 0 };
  const plainDate = { year: 2026, month: 11, day: 23 };
  const timedParts = toDateTimeParts(new Date(), "Asia/Tokyo");
  expectType<Equal<typeof timedParts.time, string>>();
  const jstFromDate = toJapanDateTime(new Date());
  expectType<Equal<(typeof jstFromDate)["time"], string>>();
  const jstFromInstant = toJapanDateTime(instant);
  expectType<Equal<(typeof jstFromInstant)["time"], string>>();
  const jstFromPlainDateTime = toJapanDateTime(plainDateTime);
  expectType<Equal<(typeof jstFromPlainDateTime)["time"], string>>();
  const jstFromString = toJapanDateTime("2026-11-23T10:00");
  expectType<Equal<(typeof jstFromString)["time"], string>>();
  const jstFromDateString = toJapanDateTime("2026-11-23");
  expectType<Equal<(typeof jstFromDateString)["time"], string | null>>();
  const jstFromPlainDate = toJapanDateTime(plainDate);
  expectType<Equal<(typeof jstFromPlainDate)["time"], string | null>>();
  const cal = createCalendar({});
  const calTimed = cal.civilOf(new Date());
  expectType<Equal<(typeof calTimed)["time"], string>>();
  const anyInput: DateInput = "2026-11-23";
  expectType<Equal<(typeof calAny)["time"], string | null>>();
  const calAny = cal.civilOf(anyInput);
  expectType<Equal<ReturnType<typeof cal.daysBetween>, readonly DayInfo[]>>();
  const sched = createSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0] });
  expectType<Equal<ReturnType<typeof sched.daysBetween>, readonly ScheduleDayInfo<number>[]>>();
}

// ------------------------------------------------------------
// The holiday key `key` and the filter `keys`
// ------------------------------------------------------------
{
  const h = jp.holidaysInYear(2026)[0];
  expectType<Equal<NonNullable<typeof h>["key"], string | undefined>>();
  const jpKey: KnownJpHolidayKey = "vernal-equinox";
  const ukKey: KnownUkHolidayKey = "good-friday";
  const sgKey: KnownSgHolidayKey = "hari-raya-puasa";
  createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ holiday: true, keys: [jpKey, "autumnal-equinox"], kinds: ["regular"] }],
  });
  createCalendar({
    holidayProvider: england,
    closedRecurringRules: [{ holiday: true, keys: [ukKey] }],
  });
  createSchedule({
    holidayProvider: sg,
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    recurringRules: [{ holiday: true, keys: [sgKey], value: 2 }],
  });
  // keys is an array of string (no further type parameter like Kind)
  createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ holiday: true, keys: ["anything"] }],
  });
  // @ts-expect-error -- keys can be used only in a holiday rule
  createCalendar({ closedRecurringRules: [{ weekday: 1, keys: ["sports"] }] });
  // Day-after-holiday and day-before-holiday rules can be filtered by keys too
  createCalendar({ closedRecurringRules: [{ dayAfterHoliday: true, keys: ["sports"] }] });
  createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true, keys: ["sports"] }] });
  // @ts-expect-error -- a type of known values, so an unknown string is wrong
  const badKey: KnownJpHolidayKey = "golden-week";
  void badKey;
  const substituted: readonly Holiday<"regular" | "substitute">[] = withSubstituteDays(
    [{ date: "2026-01-01", name: "X", nameEn: "X", kind: "regular", confirmed: true }],
    { directions: { 0: "next" }, kind: "substitute", originalPolicy: "drop" },
  );
  void substituted;
  // The returned array is a frozen readonly array and cannot be assigned to a mutable array type (decisions.md #4)
  // @ts-expect-error -- a readonly array cannot be assigned to a mutable array type
  const mutable: Holiday<"regular" | "substitute">[] = substituted;
  void mutable;
  // @ts-expect-error -- the direction is "next" or "previous"
  withSubstituteDays([], { directions: { 0: "nearest" }, kind: "substitute" });
}

// ------------------------------------------------------------
// The nth-business-day rule businessDayOfMonth, and skipWeekdays, the weekdays skipped by a move
// ------------------------------------------------------------
{
  const branch = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [
      { businessDayOfMonth: -1, name: "最終営業日" },
      { businessDayOfMonth: [1, 5], months: [1, 4, 7, 10] },
      { dayOfMonth: 15, months: [6], holidayOverlapPolicy: "after-holiday", skipWeekdays: [0, 6] },
      { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [6] },
    ],
  });
  createSchedule({
    holidayProvider: jp,
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    recurringRules: [{ businessDayOfMonth: -1, calendar: branch, value: 2 }],
  });
  const pattern: BusinessDayOfMonthPattern = { businessDayOfMonth: -2 };
  void pattern;
  createCalendar({
    closedRecurringRules: [{ businessDayOfMonth: -1, holidayOverlapPolicy: "over-holiday" }],
  });
}

// holidayOverlapPolicy, skipWeekdays and calendar as accepted per rule shape (0.30.0. docs/decisions.md #6)
{
  const branch = createCalendar({ holidayProvider: jp });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- a day-after-holiday rule does not accept holidayOverlapPolicy
      { dayAfterHoliday: true, holidayOverlapPolicy: "over-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- a day-before-holiday rule does not accept holidayOverlapPolicy
      { dayBeforeHoliday: true, holidayOverlapPolicy: "under-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- a holiday rule does not accept holidayOverlapPolicy
      { holiday: true, holidayOverlapPolicy: "over-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- a cycle rule does not accept "after-holiday"
      { cycle: 6, anchor: "2026-01-05", positions: [5], holidayOverlapPolicy: "after-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- an nth-business-day rule does not accept "after-holiday"
      { businessDayOfMonth: 1, holidayOverlapPolicy: "after-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- an nth-business-day-of-week rule does not accept "after-holiday" either
      { businessDayOfWeek: 1, weekStart: 1, holidayOverlapPolicy: "after-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- skipWeekdays only with "after-holiday"
      { weekday: 1, skipWeekdays: [6] },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- skipWeekdays is not accepted with "over-holiday"
      { dayOfMonth: 1, holidayOverlapPolicy: "over-holiday", skipWeekdays: [6] },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- an nth-business-day rule of a calendar does not accept calendar
      { businessDayOfMonth: 1, calendar: branch },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- an nth-business-day-of-week rule requires weekStart
      { businessDayOfWeek: -1 },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- the nth business day of a week is 1-7 or -1 to -7
      { businessDayOfWeek: 8, weekStart: 1 },
    ],
  });
  createSchedule({
    weekdayValues: [0, 0, 0, 0, 0, 0, 0],
    recurringRules: [
      // @ts-expect-error -- an nth-business-day rule of a schedule requires calendar
      { businessDayOfMonth: 1, value: 1 },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      {
        businessDayOfWeek: [-1, 1],
        weekStart: 1,
        months: [3],
        holidayOverlapPolicy: "over-holiday",
      },
    ],
  });
  createSchedule({
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    recurringRules: [{ businessDayOfWeek: 1, weekStart: 0, calendar: branch, value: 2 }],
  });
  // @ts-expect-error -- skipWeekdays can be used only in weekday and day-of-month rules
  createCalendar({ closedRecurringRules: [{ holiday: true, skipWeekdays: [6] }] });
  // @ts-expect-error -- a weekday rule and an nth-business-day rule cannot be written together
  createCalendar({ closedRecurringRules: [{ weekday: 1, businessDayOfMonth: 1 }] });
}

// The day-cycle rule cycle / anchor / positions, and skipWeekdays of day-after and day-before-holiday rules
{
  createCalendar({
    holidayProvider: jp,
    holidayPolicy: "ignore",
    closedRecurringRules: [
      { cycle: 6, anchor: "2026-01-05", positions: [5, 6], name: "班 A の休日" },
    ],
  });
  createCalendar({
    openRecurringRules: [
      {
        cycle: 10,
        anchor: "2026-01-01",
        positions: [1],
        months: [4, 5],
        holidayOverlapPolicy: "over-holiday",
      },
    ],
  });
  // @ts-expect-error -- cycle needs anchor and positions
  createCalendar({ closedRecurringRules: [{ cycle: 6, positions: [5, 6] }] });
  createCalendar({
    // @ts-expect-error -- cycle and weekday cannot be given together
    closedRecurringRules: [{ cycle: 6, anchor: "2026-01-05", positions: [5], weekday: 1 }],
  });
  // @ts-expect-error -- positions can be used only in a cycle rule
  createCalendar({ closedRecurringRules: [{ dayOfMonth: 1, positions: [1] }] });
  createCalendar({
    // @ts-expect-error -- a cycle rule is not filtered by weekdays
    closedRecurringRules: [{ cycle: 6, anchor: "2026-01-05", positions: [5], weekdays: [1] }],
  });
  createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ dayBeforeHoliday: true, skipWeekdays: [0, 6] }],
  });
  createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ dayAfterHoliday: true, skipWeekdays: [0, 6], keys: ["sports"] }],
  });
  // @ts-expect-error -- the elements of skipWeekdays are 0-6
  createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true, skipWeekdays: [7] }] });
  // @ts-expect-error -- a holiday rule has no skipWeekdays
  createCalendar({ closedRecurringRules: [{ holiday: true, skipWeekdays: [0] }] });
  const pattern: CyclePattern = { cycle: 4, anchor: "2026-01-01", positions: [4] };
  createSchedule({
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    recurringRules: [{ ...pattern, value: 2 }],
  });
}
