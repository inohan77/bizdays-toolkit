/**
 * 型のテスト。実行はせず、pnpm typecheck（tsc）で確かめる。
 *
 * 利用者から見た型の使い心地（推論・補完・型エラーになるべき書き方）が保たれているかを見る。
 * 型エラーになるべき行には @ts-expect-error を付けており、型エラーにならなくなると tsc が失敗する。
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
  type DateInput,
  type DayInfo,
  type ScheduleDay,
  type Holiday,
  type HolidayProvider,
  type HolidayValueRule,
  type DayReason,
  type ErrorCode,
  type KnownDayReason,
  type KnownScheduleReason,
  type ScheduleReason,
  type RecurringRule,
} from "../src/index.ts";
import {
  getHoliday,
  jp,
  toJapanDateTime,
  type JapaneseHolidayKind,
  type KnownJapaneseHolidayKey,
  type KnownJapaneseHolidayKind,
} from "../src/jp/index.ts";
import { england, type KnownUkHolidayKey } from "../src/uk/index.ts";
import { sg, type KnownSgHolidayKey } from "../src/sg/index.ts";
import { substituteDays } from "../src/provider/index.ts";
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

// --- 有効期間・周期（0.10.0）、祝日の翌日（0.11.0） ---
createCalendar({
  holidays: jp,
  closedRecurring: [
    { weekday: 1, effectiveTo: "2027-03-31" },
    { weekday: 3, interval: 2, anchor: "2026-01-07", effectiveFrom: "2026-01-07" },
    { dayAfterHoliday: true, months: [5], name: "x" },
  ],
  closedAnnual: [{ from: "08-13", to: "08-16", effectiveTo: "2026-12-31" }, "12-31"],
});
// @ts-expect-error -- interval は曜日の規則でだけ使える
createCalendar({ closedRecurring: [{ day: 1, interval: 2, anchor: "2026-01-07" }] });
// @ts-expect-error -- dayAfterHoliday は true だけ
createCalendar({ closedRecurring: [{ dayAfterHoliday: false }] });
// @ts-expect-error -- dayAfterHoliday と weekday は同時に指定できない
createCalendar({ closedRecurring: [{ dayAfterHoliday: true, weekday: 1 }] });
// @ts-expect-error -- 個別の日付には有効期間を付けられない
createCalendar({ closedDates: [{ date: "2026-10-19", effectiveTo: "2026-12-31" }] });

// --- 祝日の規則（0.12.0）・rulePath ---
createCalendar({
  holidays: jp,
  openRecurring: [
    { holiday: true },
    { holiday: true, kinds: ["substitute", "citizens"], months: [5], effectiveFrom: "2027-04-01" },
  ],
});
// @ts-expect-error -- holiday は true だけ
createCalendar({ closedRecurring: [{ holiday: false }] });
// @ts-expect-error -- kinds は holiday の規則でだけ使える
createCalendar({ closedRecurring: [{ weekday: 1, kinds: ["national"] }] });
// @ts-expect-error -- holiday と dayAfterHoliday は同時に指定できない
createCalendar({ closedRecurring: [{ holiday: true, dayAfterHoliday: true }] });

// --- 未確定の祝日のガード・診断の asOf（0.17.0） ---
{
  const c = createCalendar({ holidays: jp, unconfirmedHolidays: "throw" });
  expectType<Equal<typeof c.unconfirmedHolidays, "accept" | "throw">>();
  createSchedule({ weekly: [0, 1, 1, 1, 1, 1, 0], unconfirmedHolidays: "accept" });
  // @ts-expect-error -- unconfirmedHolidays は "accept" か "throw"
  createCalendar({ holidays: jp, unconfirmedHolidays: "ignore" });
  const list = diagnoseCalendar({ holidays: jp }, { asOf: "2026-10-23" });
  const codes: readonly string[] = list.map((d) => d.code);
  void codes;
  diagnoseSchedule({ weekly: [0, 1, 1, 1, 1, 1, 0] }, {});
  // @ts-expect-error -- asOf は暦日の文字列だけ
  diagnoseCalendar({}, { asOf: new Date() });
}

// --- 祝前日（0.16.0）・decidedByPath ---
createCalendar({
  holidays: jp,
  closedRecurring: [
    { dayBeforeHoliday: true },
    { dayBeforeHoliday: true, weekdays: [1, 2, 3, 4, 5], months: [5], effectiveFrom: "2027-01-01" },
  ],
});
// @ts-expect-error -- dayBeforeHoliday は true だけ
createCalendar({ closedRecurring: [{ dayBeforeHoliday: false }] });
// @ts-expect-error -- dayBeforeHoliday と dayAfterHoliday は同時に指定できない
createCalendar({ closedRecurring: [{ dayBeforeHoliday: true, dayAfterHoliday: true }] });
// @ts-expect-error -- dayBeforeHoliday と weekday は同時に指定できない
createCalendar({ closedRecurring: [{ dayBeforeHoliday: true, weekday: 1 }] });
// @ts-expect-error -- kinds は祝日の規則でだけ使える
createCalendar({ closedRecurring: [{ dayBeforeHoliday: true, kinds: ["national"] }] });
{
  const c = combineCalendars([createCalendar({}), createCalendar({ closedWeekdays: [0] })], {
    businessDay: "all",
  });
  const path: readonly number[] | undefined = c.dayInfo("2026-10-19").decidedByPath;
  void path;
}
{
  const c = createCalendar({ holidays: jp });
  const rulePath: string | undefined = c.dayInfo("2026-10-19").rulePath;
  const s = createSchedule({ weekly: [0, 1, 1, 1, 1, 1, 1] });
  const rulePath2: string | undefined = s.dayInfo("2026-10-19").rulePath;
  void rulePath;
  void rulePath2;
}

// --- weekdays の絞り込み・kinds の型・営業日を考慮した締め日（0.15.0） ---
{
  const c = createCalendar({
    holidays: jp,
    openRecurring: [
      { holiday: true, kinds: ["substitute", "citizens"], weekdays: [6], months: [5] },
      { dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] },
    ],
  });
  // kinds は提供元の種別で補完が効く（開いた型なので、他の文字列も通る）
  createCalendar({ holidays: jp, openRecurring: [{ holiday: true, kinds: ["anything"] }] });
  // @ts-expect-error -- weekdays は祝日・祝日の翌日の規則でだけ使える
  createCalendar({ closedRecurring: [{ weekday: 1, weekdays: [1] }] });
  // @ts-expect-error -- weekdays の要素は 0〜6
  createCalendar({ closedRecurring: [{ holiday: true, weekdays: [7] }] });
  // @ts-expect-error -- kinds は祝日の規則でだけ使える
  createCalendar({ closedRecurring: [{ dayAfterHoliday: true, kinds: ["national"] }] });
  const month: string = c.closingMonth("2026-09-19", 20, { convention: "preceding" });
  const period: { readonly from: string; readonly to: string } = c.closingPeriod("2026-10", 20, {
    convention: "preceding",
  });
  void month;
  void period;
  // @ts-expect-error -- convention は必須
  c.closingMonth("2026-09-19", 20);
  // @ts-expect-error -- convention は必須
  c.closingPeriod("2026-10", 20, {});
  // RecurringRule を単独で使うコードは、型引数なしで今までどおり
  const rules: RecurringRule[] = [{ holiday: true, kinds: ["x"] }, { weekday: 1 }];
  createCalendar({ holidays: jp, closedRecurring: rules });
}

// --- 締め期間・瞬間への変換（0.14.0） ---
{
  const period: { readonly from: string; readonly to: string } = closingPeriod("2026-11", 20);
  createCalendar({ closedDates: [period, closingPeriod("2026-11-05", -1)] });
  const instant: Date = toInstant("2026-11-23", "10:00", "Asia/Tokyo");
  const c = createCalendar({ holidays: jp });
  const instant2: Date = c.instantOf("2026-11-23", "10:00:30");
  void instant;
  void instant2;
  // @ts-expect-error -- instantOf は暦日の文字列だけを受け付ける（Date は渡せない）
  c.instantOf(new Date(), "10:00");
  // @ts-expect-error -- closingDay は数値
  closingPeriod("2026-11", "20");
}

// --- スケジュールからのカレンダー（0.13.0） ---
{
  const hours = createSchedule<{ open: string } | null>({
    weekly: [null, { open: "9" }, null, null, null, null, null],
  });
  const c = createCalendarFromSchedule(hours, (v) => v !== null);
  expectType<Equal<typeof c, ReturnType<typeof createCalendar<string>>>>();
  createCalendarFromSchedule(hours, (v) => v !== null, { maxSearchDays: 10 });
  // @ts-expect-error -- isOpen は値だけを受け取る（日付は渡されない）
  createCalendarFromSchedule(hours, (v, date: string) => v !== null && date > "");
  // @ts-expect-error -- 値の型が合わない
  createCalendarFromSchedule(hours, (v: number) => v > 0);
  // @ts-expect-error -- カレンダーは渡せない
  createCalendarFromSchedule(c, () => true);
  const reason: "open-annual" | "closed-annual" | string = c.dayInfo("2026-10-20").reason;
  void reason;
}

// --- カレンダーの合成（0.11.0） ---
{
  const a = createCalendar({ holidays: jp });
  const b = createCalendar({ holidays: jp, closedWeekdays: [0] });
  const combined = combineCalendars([a, b], { businessDay: "all" });
  expectType<Equal<typeof combined, ReturnType<typeof createCalendar<JapaneseHolidayKind>>>>();
  const decidedBy: number | undefined = combined.dayInfo("2026-10-19").decidedBy;
  void decidedBy;
  // @ts-expect-error -- businessDay は "all" か "any"
  combineCalendars([a, b], { businessDay: "both" });
  // @ts-expect-error -- businessDay は必須
  combineCalendars([a, b], {});
}

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
// 時刻を必ず持つ入力では time が string になる（toDateTimeParts・civilOf・非推奨の toJapanDateTime も削除までは確かめる）
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

// ------------------------------------------------------------
// 祝日の識別子 key と絞り込み keys（0.18.0）
// ------------------------------------------------------------
{
  const h = jp.holidaysInYear(2026)[0];
  expectType<Equal<NonNullable<typeof h>["key"], string | undefined>>();
  const jpKey: KnownJapaneseHolidayKey = "vernal-equinox";
  const ukKey: KnownUkHolidayKey = "good-friday";
  const sgKey: KnownSgHolidayKey = "hari-raya-puasa";
  createCalendar({
    holidays: jp,
    openRecurring: [{ holiday: true, keys: [jpKey, "autumnal-equinox"], kinds: ["national"] }],
  });
  createCalendar({ holidays: england, closedRecurring: [{ holiday: true, keys: [ukKey] }] });
  createSchedule({
    holidays: sg,
    weekly: [0, 1, 1, 1, 1, 1, 0],
    recurring: [{ holiday: true, keys: [sgKey], value: 2 }],
  });
  // keys は string の配列（Kind のような型引数は増やさない）
  createCalendar({ holidays: jp, openRecurring: [{ holiday: true, keys: ["anything"] }] });
  // @ts-expect-error -- keys は祝日の規則でだけ使える
  createCalendar({ closedRecurring: [{ weekday: 1, keys: ["sports"] }] });
  // @ts-expect-error -- keys は祝日の規則でだけ使える
  createCalendar({ closedRecurring: [{ dayAfterHoliday: true, keys: ["sports"] }] });
  // @ts-expect-error -- 既知の値の型なので、知らない文字列は誤り
  const badKey: KnownJapaneseHolidayKey = "golden-week";
  void badKey;
  const substituted: Holiday<"regular" | "substitute">[] = substituteDays(
    [{ date: "2026-01-01", name: "X", nameEn: "X", kind: "regular", confirmed: true }],
    { rules: { 0: "next" }, kind: "substitute", original: "drop" },
  );
  void substituted;
  // @ts-expect-error -- 向きは "next" か "previous"
  substituteDays([], { rules: { 0: "nearest" }, kind: "substitute" });
}
