/**
 * 型のテスト。実行はせず、pnpm typecheck（tsc）で確かめる。
 *
 * 利用者から見た型の使い心地（推論・補完・型エラーになるべき書き方）が保たれているかを見る。
 * 型エラーになるべき行には @ts-expect-error を付けており、型エラーにならなくなると tsc が失敗する。
 */

import {
  createCalendar,
  createSchedule,
  isBizdaysError,
  monthOf,
  toDateTimeParts,
  type BusinessDayConvention,
  type DateInput,
  type DayInfo,
  type ScheduleDay,
  type HolidayProvider,
  type HolidayValueRule,
  type DayReason,
  type ErrorCode,
  type KnownDayReason,
  type KnownScheduleReason,
  type ScheduleReason,
} from "../src/index.ts";
import {
  getHoliday,
  jp,
  toJapanDateTime,
  type JapaneseHolidayKind,
  type KnownJapaneseHolidayKind,
} from "../src/jp/index.ts";
import {
  diagnoseCalendar,
  diagnoseSchedule,
  type DiagnosticCode,
  type KnownDiagnosticCode,
} from "../src/diagnose/index.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<T extends true>(): T | void {}

// --- スケジュールの値の型は、weekly から推論される ---
const numbers = createSchedule({ weekly: [1, 2, 3, 4, 5, 6, 7] });
expectType<Equal<ReturnType<typeof numbers.valueOn>, number>>();

type Hours = { open: string; close: string } | null;
const hours = createSchedule<Hours>({
  holidays: jp,
  weekly: [null, null, null, null, null, null, null],
});
expectType<Equal<ReturnType<typeof hours.valueOn>, Hours>>();

// --- 判定の理由は開いた型: 既知の値と比べられ、将来の値も受け付ける ---
const reason: DayReason = createCalendar().dayInfo("2026-01-01").reason;
if (reason === "closed-annual" || reason === "regular") {
  // 既知の値との比較はそのまま書ける
}
const futureReason: DayReason = "closed-something-new";
const futureScheduleReason: ScheduleReason = "something-new";
void futureReason;
void futureScheduleReason;

// 閉じた型（Known…）は将来の値を受け付けない。網羅を確かめたい利用者向け
// @ts-expect-error -- KnownDayReason に "closed-something-new" はない
const closedReason: KnownDayReason = "closed-something-new";
void closedReason;

function labelOf(r: KnownScheduleReason): string {
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

// --- 祝日の種別も開いた型 ---
const kind: JapaneseHolidayKind | undefined = getHoliday("2026-11-23")?.kind;
void kind;
const futureKind: JapaneseHolidayKind = "observance";
void futureKind;
// @ts-expect-error -- KnownJapaneseHolidayKind に "observance" はない
const closedKind: KnownJapaneseHolidayKind = "observance";
void closedKind;

// --- エラーコード ---
try {
  createCalendar({ timeZone: "Asia/Nowhere" });
} catch (error) {
  if (isBizdaysError(error)) {
    const code: ErrorCode = error.code;
    if (code === "invalid-time-zone") {
      // 既知のコードとの比較はそのまま書ける
    }
  }
}

// --- 型エラーになるべき書き方 ---
// @ts-expect-error -- weekly は 7 つの値が必要
createSchedule({ weekly: [1, 2, 3] });
// @ts-expect-error -- sameAs は曜日（0〜6）
createSchedule({ weekly: [1, 1, 1, 1, 1, 1, 1], holiday: { sameAs: 7 } });
// @ts-expect-error -- 設定のキーの打ち間違いは TypeScript では型エラーになる
createCalendar({ closedWeekday: [0] });
// @ts-expect-error -- holidayPolicy の値の誤り
createCalendar({ holidayPolicy: "skip" });
// @ts-expect-error -- 返す一覧は変更できない
createCalendar({ holidays: jp }).holidaysInYear(2026).push(jp.holidaysInYear(2026)[0]!);

// --- 繰り返しの規則（0.4.0） ---
createCalendar({
  closedRecurring: [
    { weekday: 1 },
    { weekday: 3, nth: [2, 4], months: [8, 12], onHolidayRule: "after-holiday", name: "x" },
    { day: -1, onHolidayRule: "over-holiday" },
  ],
});
// @ts-expect-error -- weekday と day は同時に指定できない
createCalendar({ closedRecurring: [{ weekday: 1, day: 3 }] });
// @ts-expect-error -- nth は 1〜5 と -1
createCalendar({ closedRecurring: [{ weekday: 1, nth: 6 }] });
// @ts-expect-error -- nth は曜日の規則でだけ使える
createCalendar({ closedRecurring: [{ day: 3, nth: 1 }] });
// @ts-expect-error -- day は 1〜31 と -1
createCalendar({ closedRecurring: [{ day: 32 }] });
// @ts-expect-error -- months は 1〜12
createCalendar({ closedRecurring: [{ day: 1, months: [13] }] });
// @ts-expect-error -- onHolidayRule の値の誤り
createCalendar({ closedRecurring: [{ day: 1, onHolidayRule: "rule" }] });
// @ts-expect-error -- スケジュールの繰り返しの規則には value が必要
createSchedule({ weekly: [1, 1, 1, 1, 1, 1, 1], recurring: [{ day: 1 }] });

// 振替の元の日付は省略可能な文字列
const shifted: string | undefined = createCalendar().dayInfo("2026-10-13").shiftedFrom;
void shifted;

// 祝日の値の決め方の型（0.4.0 で HolidayValueRule に改名。旧名 HolidayRule は 0.5.0 で削除）
const sundayHours: HolidayValueRule<number> = { sameAs: 0 };
createSchedule({ weekly: [1, 2, 3, 4, 5, 6, 7], holiday: sundayHours });

// --- 規則の診断（0.5.0） ---
const diagnostics = diagnoseCalendar({ holidays: jp, closedWeekdays: [0] });
// 打ち間違いのキーも型エラーにならずに渡せる（診断で見つけるため）
diagnoseCalendar({ closeWeekdays: [0] });
diagnoseSchedule({ weekly: [1, 1, 1, 1, 1, 1, 1], recurring: [{ day: 1, value: 0 }] });
for (const d of diagnostics) {
  // 重さは閉じた型（網羅できる）
  expectType<Equal<typeof d.severity, "error" | "warning" | "info">>();
  // code は開いた型
  expectType<Equal<typeof d.code, DiagnosticCode>>();
  const known: KnownDiagnosticCode = "shadowed";
  const code: DiagnosticCode = "some-future-code";
  void known;
  void code;
  const related: string | undefined = d.relatedPath;
  void related;
}
// @ts-expect-error -- 診断の結果は変更できない
diagnostics.push(diagnostics[0]!);

// --- 月の計算と日付の調整（0.6.0） ---
const office = createCalendar({ holidays: jp, closedWeekdays: [0, 6] });
const adjusted: string = office.adjust("2026-10-31", { convention: "modified-following" });
void adjusted;
office.dueDate(monthOf("2026-10-16", 1), { day: -1, convention: "preceding" });
// @ts-expect-error -- convention は必須（既定値を持たない）
office.adjust("2026-10-31", {});
// @ts-expect-error -- "nearest" は採用していない
office.adjust("2026-10-31", { convention: "nearest" });
// @ts-expect-error -- 期日の日は 1〜31 と -1
office.dueDate("2026-10", { day: 0, convention: "following" });
const convention: BusinessDayConvention = "preceding";
void convention;

// --- 祝日のほかの言語の名称（0.7.0） ---
const holidayNames: Readonly<Record<string, string>> | undefined = createCalendar({
  holidays: jp,
}).getHoliday("2026-11-23")?.names;
void holidayNames;
// 提供元は names を省略できる（既存の提供元はそのまま型が通る）
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
// 時刻を必ず持つ入力では time が string になる（toDateTimeParts・toJapanDateTime・civilOf）
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
  const sched = createSchedule({ weekly: [0, 1, 1, 1, 1, 1, 0] });
  expectType<Equal<ReturnType<typeof sched.daysBetween>, readonly ScheduleDay<number>[]>>();
}
