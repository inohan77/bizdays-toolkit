// Type-checks the published type definitions (.d.ts of dist) from a user's point of view
// (scripts/check-consumer-types.ts checks with tsc under moduleResolution node16, nodenext and bundler; checking
// of the library's type definitions is turned on too).
// Needs pnpm build before running
import {
  closingPeriod,
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  toDateTimeParts,
  type DateInput,
  type DayInfo,
  type HolidayProvider,
  type ScheduleDayInfo,
} from "bizdays-toolkit";
import { diagnoseCalendar, type Diagnostic } from "bizdays-toolkit/diagnose";
import { easterSunday, nthWeekdayOfMonth, withSubstituteDays } from "bizdays-toolkit/provider";
import { jp, toJapanDateTime, type JpHoliday, type KnownJpHolidayKey } from "bizdays-toolkit/jp";
import { sg, type SgHoliday } from "bizdays-toolkit/sg";
import {
  alsaceMoselle,
  metropole,
  type FrHoliday,
  type KnownFrHolidayKey,
} from "bizdays-toolkit/fr";
import { scotland, wales, type UkHoliday } from "bizdays-toolkit/uk";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<T extends true>(): T | void {}

const calendar = createCalendar({ holidayProvider: [jp], closedWeekdays: [0, 6] });
const days: readonly DayInfo[] = calendar.daysBetween("2026-11-01", "2026-11-30");
const schedule = createSchedule({
  holidayProvider: jp,
  weekdayValues: [0, 1, 1, 1, 1, 1, 0],
  holidayPolicy: { sameAs: 0 },
});
const values: readonly ScheduleDayInfo<number>[] = schedule.daysBetween("2026-11-01", "2026-11-30");
const combined = combineCalendars(
  [
    calendar,
    createCalendar({ holidayProvider: jp, closedRecurringRules: [{ dayAfterHoliday: true }] }),
  ],
  { open: "all" },
);
const decidedBy: number | undefined = combined.dayInfoOn("2026-11-24").decidedBy;
void decidedBy;
const decidedByPath: readonly number[] | undefined = combined.dayInfoOn("2026-11-24").decidedByPath;
void decidedByPath;
createCalendar({
  holidayProvider: jp,
  closedRecurringRules: [{ dayBeforeHoliday: true, weekdays: [1, 2, 3, 4, 5], months: [5] }],
});
const sgHoliday: SgHoliday | undefined = sg.holidaysInYear(2026)[0];
void sgHoliday;
const strict = createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "throw" });
const mode: "accept" | "throw" = strict.unconfirmedHolidayPolicy;
void mode;
const expired: readonly Diagnostic[] = diagnoseCalendar(
  { holidayProvider: jp },
  { asOf: "2026-10-23" },
);
void expired;
const easter: string = easterSunday(2026);
const thanksgiving: string = nthWeekdayOfMonth(2026, 11, 4, 4);
void easter;
void thanksgiving;
const optionPath: string | undefined = combined.dayInfoOn("2026-11-24").optionPath;
void optionPath;
createCalendar({
  holidayProvider: jp,
  openRecurringRules: [{ holiday: true, kinds: ["substitute"] }],
});
const equinox: KnownJpHolidayKey = "vernal-equinox";
createCalendar({ holidayProvider: jp, openRecurringRules: [{ holiday: true, keys: [equinox] }] });
const key: string | undefined = jp.holidaysInYear(2026)[0]?.key;
void key;
const monthEnd = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedRecurringRules: [
    { businessDayOfMonth: -1 },
    { dayOfMonth: 15, months: [6], holidayOverlapPolicy: "after-holiday", skipWeekdays: [0, 6] },
  ],
});
createSchedule({
  holidayProvider: jp,
  weekdayValues: [0, 1, 1, 1, 1, 1, 0],
  recurringRules: [{ businessDayOfMonth: -1, calendar: monthEnd, value: 2 }],
});
const observed = withSubstituteDays(
  [
    {
      date: "2026-07-04",
      name: "Independence Day",
      nameEn: "Independence Day",
      kind: "federal",
      confirmed: true,
    },
  ],
  { directions: { 6: "previous", 0: "next" }, kind: "observed" },
);
void observed;
const fromSchedule = createCalendarFromSchedule(schedule, (v) => v > 0);
const open: boolean = fromSchedule.isBusinessDay("2026-11-24");
void open;
const period: { readonly from: string; readonly to: string } = closingPeriod("2026-11", 20);
createCalendar({
  holidayProvider: jp,
  openRecurringRules: [{ holiday: true, kinds: ["substitute"], weekdays: [6] }],
  closedRecurringRules: [{ dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] }],
});
const businessClosing: string = calendar.closingMonth("2026-09-19", 20, {
  convention: "preceding",
});
void businessClosing;
const instant: Date = calendar.instantOf(period.from, "09:00");
void instant;

const timed = toJapanDateTime(new Date());
expectType<Equal<typeof timed.time, string>>();
const untimed = toJapanDateTime("2026-11-23" as DateInput);
expectType<Equal<typeof untimed.time, string | null>>();
const calTimed = calendar.civilOf(new Date());
expectType<Equal<typeof calTimed.time, string>>();
const parts = toDateTimeParts({ epochMilliseconds: 0 }, "Europe/London");
expectType<Equal<typeof parts.time, string>>();

const providers: HolidayProvider[] = [jp, scotland, wales, metropole, alsaceMoselle];
const solidarity: KnownFrHolidayKey = "pentecost-monday";
createCalendar({
  holidayProvider: metropole,
  openRecurringRules: [{ holiday: true, keys: [solidarity] }],
});
const frHoliday: FrHoliday | undefined = metropole.holidaysInYear(2026)[0];
void frHoliday;
const holiday: JpHoliday | UkHoliday | undefined = jp.holidaysInYear(2026)[0];
const issues: readonly Diagnostic[] = diagnoseCalendar({ holidayProvider: jp });
// @ts-expect-error an option type that does not exist is wrong
createCalendar({ closedWeekdays: ["sunday"] });

export { days, values, providers, holiday, issues };

// Passing a holiday provider, a created calendar or a schedule as the options is a type error (from 0.32.0:
// holidaysInYear of the option types is ?: never, and all three have this property. If it were no type error,
// the @ts-expect-error below would be an unused-directive error)
const passedAsOptions = createCalendar({ holidayProvider: jp });
const scheduleAsOptions = createSchedule({ weekdayValues: [1, 1, 1, 1, 1, 1, 1] });
// @ts-expect-error a provider goes in holidayProvider
createCalendar(jp);
// @ts-expect-error a calendar is not options
createCalendar(passedAsOptions);
// @ts-expect-error a schedule is not options
createCalendar(scheduleAsOptions);
