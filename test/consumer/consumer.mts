// 利用者の立場で、公開する型定義（dist の .d.ts）を型チェックする（scripts/check-consumer-types.ts が
// moduleResolution を node16・nodenext・bundler に変えて tsc で確かめる。ライブラリの型定義の検査も有効にする）。
// 実行の前に pnpm build が必要
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
// @ts-expect-error 存在しない設定の型は誤り
createCalendar({ closedWeekdays: ["sunday"] });

export { days, values, providers, holiday, issues };
