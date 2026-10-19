// 利用者の立場で、公開する型定義（dist の .d.ts）を型チェックする（scripts/check-consumer-types.ts が
// moduleResolution を node16・nodenext・bundler に変えて tsc で確かめる。ライブラリの型定義の検査も有効にする）。
// 実行の前に pnpm build が必要
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  toDateTimeParts,
  type DateInput,
  type DayInfo,
  type HolidayProvider,
  type ScheduleDay,
} from "bizdays-toolkit";
import { diagnoseCalendar, type Diagnostic } from "bizdays-toolkit/diagnose";
import { jp, toJapanDateTime, type JapaneseHoliday } from "bizdays-toolkit/jp";
import { scotland, wales, type UkHoliday } from "bizdays-toolkit/uk";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<T extends true>(): T | void {}

const calendar = createCalendar({ holidays: [jp], closedWeekdays: [0, 6] });
const days: readonly DayInfo[] = calendar.daysBetween("2026-11-01", "2026-11-30");
const schedule = createSchedule({
  holidays: jp,
  weekly: [0, 1, 1, 1, 1, 1, 0],
  holiday: { sameAs: 0 },
});
const values: readonly ScheduleDay<number>[] = schedule.daysBetween("2026-11-01", "2026-11-30");
const combined = combineCalendars(
  [calendar, createCalendar({ holidays: jp, closedRecurring: [{ dayAfterHoliday: true }] })],
  { businessDay: "all" },
);
const decidedBy: number | undefined = combined.dayInfo("2026-11-24").decidedBy;
void decidedBy;
const rulePath: string | undefined = combined.dayInfo("2026-11-24").rulePath;
void rulePath;
createCalendar({ holidays: jp, openRecurring: [{ holiday: true, kinds: ["substitute"] }] });
const fromSchedule = createCalendarFromSchedule(schedule, (v) => v > 0);
const open: boolean = fromSchedule.isBusinessDay("2026-11-24");
void open;

const timed = toJapanDateTime(new Date());
expectType<Equal<typeof timed.time, string>>();
const untimed = toJapanDateTime("2026-11-23" as DateInput);
expectType<Equal<typeof untimed.time, string | null>>();
const calTimed = calendar.civilOf(new Date());
expectType<Equal<typeof calTimed.time, string>>();
const parts = toDateTimeParts({ epochMilliseconds: 0 }, "Europe/London");
expectType<Equal<typeof parts.time, string>>();

const providers: HolidayProvider[] = [jp, scotland, wales];
const holiday: JapaneseHoliday | UkHoliday | undefined = jp.holidaysInYear(2026)[0];
const issues: readonly Diagnostic[] = diagnoseCalendar({ holidays: jp });
// @ts-expect-error 存在しない設定の型は誤り
createCalendar({ closedWeekdays: ["sunday"] });

export { days, values, providers, holiday, issues };
