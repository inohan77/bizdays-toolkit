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

// --- スケジュールの値の型は、weekly から推論される ---
const numbers = createSchedule({ weekdayValues: [1, 2, 3, 4, 5, 6, 7] });
expectType<Equal<ReturnType<typeof numbers.valueOn>, number>>();

type Hours = { open: string; close: string } | null;
const hours = createSchedule<Hours>({
  holidayProvider: jp,
  weekdayValues: [null, null, null, null, null, null, null],
});
expectType<Equal<ReturnType<typeof hours.valueOn>, Hours>>();

// --- 判定の理由は開いた型: 既知の値と比べられ、将来の値も受け付ける ---
const reason: DayReason = createCalendar().dayInfoOn("2026-01-01").reason;
if (reason === "closed-annual" || reason === "default") {
  // 既知の値との比較はそのまま書ける
}
const futureReason: DayReason = "closed-something-new";
const futureScheduleReason: ScheduleDayReason = "something-new";
void futureReason;
void futureScheduleReason;

// 閉じた型（Known…）は将来の値を受け付けない。網羅を確かめたい利用者向け
// @ts-expect-error -- KnownDayReason に "closed-something-new" はない
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

// --- 祝日の種別も開いた型 ---
const kind: JpHolidayKind | undefined = holidayOn("2026-11-23")?.kind;
void kind;
const futureKind: JpHolidayKind = "observance";
void futureKind;
// @ts-expect-error -- KnownJpHolidayKind に "observance" はない
const closedKind: KnownJpHolidayKind = "observance";
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
createSchedule({ weekdayValues: [1, 2, 3] });
// @ts-expect-error -- sameAs は曜日（0〜6）
createSchedule({ weekdayValues: [1, 1, 1, 1, 1, 1, 1], holidayPolicy: { sameAs: 7 } });
// @ts-expect-error -- 設定のキーの打ち間違いは TypeScript では型エラーになる
createCalendar({ closedWeekday: [0] });
// @ts-expect-error -- holidayPolicy の値の誤り
createCalendar({ holidayPolicy: "skip" });
// @ts-expect-error -- 返す一覧は変更できない
createCalendar({ holidayProvider: jp }).holidaysInYear(2026).push(jp.holidaysInYear(2026)[0]!);

// --- 繰り返しの規則 ---
createCalendar({
  closedRecurringRules: [
    { weekday: 1 },
    { weekday: 3, nth: [2, 4], months: [8, 12], holidayOverlapPolicy: "after-holiday", name: "x" },
    { dayOfMonth: -1, holidayOverlapPolicy: "over-holiday" },
  ],
});
// @ts-expect-error -- weekday と day は同時に指定できない
createCalendar({ closedRecurringRules: [{ weekday: 1, dayOfMonth: 3 }] });
// @ts-expect-error -- nth は 1〜5 と -1
createCalendar({ closedRecurringRules: [{ weekday: 1, nth: 6 }] });
// @ts-expect-error -- nth は曜日の規則でだけ使える
createCalendar({ closedRecurringRules: [{ dayOfMonth: 3, nth: 1 }] });
// @ts-expect-error -- day は 1〜31 と -1
createCalendar({ closedRecurringRules: [{ dayOfMonth: 32 }] });
// @ts-expect-error -- months は 1〜12
createCalendar({ closedRecurringRules: [{ dayOfMonth: 1, months: [13] }] });
// @ts-expect-error -- holidayOverlapPolicy の値の誤り
createCalendar({ closedRecurringRules: [{ dayOfMonth: 1, holidayOverlapPolicy: "rule" }] });
// @ts-expect-error -- スケジュールの繰り返しの規則には value が必要
createSchedule({ weekdayValues: [1, 1, 1, 1, 1, 1, 1], recurringRules: [{ dayOfMonth: 1 }] });

// --- 有効期間・周期、祝日の翌日 ---
createCalendar({
  holidayProvider: jp,
  closedRecurringRules: [
    { weekday: 1, effectiveTo: "2027-03-31" },
    { weekday: 3, interval: 2, anchor: "2026-01-07", effectiveFrom: "2026-01-07" },
    { dayAfterHoliday: true, months: [5], name: "x" },
  ],
  closedAnnualDates: [{ from: "08-13", to: "08-16", effectiveTo: "2026-12-31" }, "12-31"],
});
// @ts-expect-error -- interval は曜日の規則でだけ使える
createCalendar({ closedRecurringRules: [{ dayOfMonth: 1, interval: 2, anchor: "2026-01-07" }] });
// @ts-expect-error -- dayAfterHoliday は true だけ
createCalendar({ closedRecurringRules: [{ dayAfterHoliday: false }] });
// @ts-expect-error -- dayAfterHoliday と weekday は同時に指定できない
createCalendar({ closedRecurringRules: [{ dayAfterHoliday: true, weekday: 1 }] });
// @ts-expect-error -- 個別の日付には有効期間を付けられない
createCalendar({ closedDates: [{ date: "2026-10-19", effectiveTo: "2026-12-31" }] });

// --- 祝日の規則・optionPath ---
createCalendar({
  holidayProvider: jp,
  openRecurringRules: [
    { holiday: true },
    { holiday: true, kinds: ["substitute", "citizens"], months: [5], effectiveFrom: "2027-04-01" },
  ],
});
// @ts-expect-error -- holiday は true だけ
createCalendar({ closedRecurringRules: [{ holiday: false }] });
// @ts-expect-error -- kinds は holiday の規則でだけ使える
createCalendar({ closedRecurringRules: [{ weekday: 1, kinds: ["regular"] }] });
// @ts-expect-error -- holiday と dayAfterHoliday は同時に指定できない
createCalendar({ closedRecurringRules: [{ holiday: true, dayAfterHoliday: true }] });

// --- 未確定の祝日のガード・診断の asOf ---
{
  const c = createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "throw" });
  expectType<Equal<typeof c.unconfirmedHolidayPolicy, "accept" | "throw">>();
  createSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0], unconfirmedHolidayPolicy: "accept" });
  // @ts-expect-error -- unconfirmedHolidayPolicy は "accept" か "throw"
  createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "ignore" });
  const list = diagnoseCalendar({ holidayProvider: jp }, { asOf: "2026-10-23" });
  const codes: readonly string[] = list.map((d) => d.code);
  void codes;
  diagnoseSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0] }, {});
  // @ts-expect-error -- asOf は暦日の文字列だけ
  diagnoseCalendar({}, { asOf: new Date() });
}

// --- 祝前日・decidedByPath ---
createCalendar({
  holidayProvider: jp,
  closedRecurringRules: [
    { dayBeforeHoliday: true },
    { dayBeforeHoliday: true, weekdays: [1, 2, 3, 4, 5], months: [5], effectiveFrom: "2027-01-01" },
  ],
});
// @ts-expect-error -- dayBeforeHoliday は true だけ
createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: false }] });
// @ts-expect-error -- dayBeforeHoliday と dayAfterHoliday は同時に指定できない
createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true, dayAfterHoliday: true }] });
// @ts-expect-error -- dayBeforeHoliday と weekday は同時に指定できない
createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true, weekday: 1 }] });
// 祝前日の規則は、翌日の祝日の kinds・keys で絞れる
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

// --- weekdays の絞り込み・kinds の型・営業日を考慮した締め日 ---
{
  const c = createCalendar({
    holidayProvider: jp,
    openRecurringRules: [
      { holiday: true, kinds: ["substitute", "citizens"], weekdays: [6], months: [5] },
      { dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] },
    ],
  });
  // kinds は提供元の種別で補完が効く（開いた型なので、他の文字列も通る）
  createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ holiday: true, kinds: ["anything"] }],
  });
  // @ts-expect-error -- weekdays は祝日・祝日の翌日の規則でだけ使える
  createCalendar({ closedRecurringRules: [{ weekday: 1, weekdays: [1] }] });
  // @ts-expect-error -- weekdays の要素は 0〜6
  createCalendar({ closedRecurringRules: [{ holiday: true, weekdays: [7] }] });
  // 祝日の翌日の規則は、前日の祝日の kinds で絞れる
  createCalendar({ closedRecurringRules: [{ dayAfterHoliday: true, kinds: ["regular"] }] });
  // @ts-expect-error -- kinds は祝日・祝日の翌日・祝前日の規則でだけ使える
  createCalendar({ closedRecurringRules: [{ weekday: 1, kinds: ["regular"] }] });
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
  createCalendar({ holidayProvider: jp, closedRecurringRules: rules });
}

// --- 締め期間・瞬間への変換 ---
{
  const period: { readonly from: string; readonly to: string } = closingPeriod("2026-11", 20);
  createCalendar({ closedDates: [period, closingPeriod("2026-11-05", -1)] });
  const instant: Date = toInstant("2026-11-23", "10:00", "Asia/Tokyo");
  const c = createCalendar({ holidayProvider: jp });
  const instant2: Date = c.instantOf("2026-11-23", "10:00:30");
  void instant;
  void instant2;
  // @ts-expect-error -- instantOf は暦日の文字列だけを受け付ける（Date は渡せない）
  c.instantOf(new Date(), "10:00");
  // @ts-expect-error -- closingDay は数値
  closingPeriod("2026-11", "20");
}

// --- スケジュールからのカレンダー ---
{
  const hours = createSchedule<{ open: string } | null>({
    weekdayValues: [null, { open: "9" }, null, null, null, null, null],
  });
  const c = createCalendarFromSchedule(hours, (v) => v !== null);
  expectType<Equal<typeof c, ReturnType<typeof createCalendar<string>>>>();
  createCalendarFromSchedule(hours, (v) => v !== null, { searchDayLimit: 10 });
  // @ts-expect-error -- isOpen は値だけを受け取る（日付は渡されない）
  createCalendarFromSchedule(hours, (v, date: string) => v !== null && date > "");
  // @ts-expect-error -- 値の型が合わない
  createCalendarFromSchedule(hours, (v: number) => v > 0);
  // @ts-expect-error -- カレンダーは渡せない
  createCalendarFromSchedule(c, () => true);
  const reason: "open-annual" | "closed-annual" | string = c.dayInfoOn("2026-10-20").reason;
  void reason;
}

// --- カレンダーの合成 ---
{
  const a = createCalendar({ holidayProvider: jp });
  const b = createCalendar({ holidayProvider: jp, closedWeekdays: [0] });
  const combined = combineCalendars([a, b], { open: "all" });
  expectType<Equal<typeof combined, ReturnType<typeof createCalendar<JpHolidayKind>>>>();
  const decidedBy: number | undefined = combined.dayInfoOn("2026-10-19").decidedBy;
  void decidedBy;
  // @ts-expect-error -- businessDay は "all" か "any"
  combineCalendars([a, b], { businessDay: "both" });
  // @ts-expect-error -- businessDay は必須
  combineCalendars([a, b], {});
}

// 振替の元の日付は省略可能な文字列
const shifted: string | undefined = createCalendar().dayInfoOn("2026-10-13").shiftedFrom;
void shifted;

// 祝日の値の決め方の型 ScheduleHolidayPolicy
const sundayHours: ScheduleHolidayPolicy<number> = { sameAs: 0 };
createSchedule({ weekdayValues: [1, 2, 3, 4, 5, 6, 7], holiday: sundayHours });

// --- 規則の診断 ---
const diagnostics = diagnoseCalendar({ holidayProvider: jp, closedWeekdays: [0] });
// 打ち間違いのキーも型エラーにならずに渡せる（診断で見つけるため）
diagnoseCalendar({ closeWeekdays: [0] });
diagnoseSchedule({
  weekdayValues: [1, 1, 1, 1, 1, 1, 1],
  recurringRules: [{ dayOfMonth: 1, value: 0 }],
});
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

// --- 月の計算と日付の調整 ---
const office = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
const adjusted: string = office.adjust("2026-10-31", { convention: "modified-following" });
void adjusted;
office.dueDate(monthOf("2026-10-16", 1), { dayOfMonth: -1, convention: "preceding" });
// @ts-expect-error -- convention は必須（既定値を持たない）
office.adjust("2026-10-31", {});
// @ts-expect-error -- "nearest" は採用していない
office.adjust("2026-10-31", { convention: "nearest" });
// @ts-expect-error -- 期日の日は 1〜31 と -1
office.dueDate("2026-10", { dayOfMonth: 0, convention: "following" });
const convention: BusinessDayConvention = "preceding";
void convention;

// --- 祝日のほかの言語の名称 ---
const holidayNames: Readonly<Record<string, string>> | undefined = createCalendar({
  holidayProvider: jp,
}).holidayOn("2026-11-23")?.names;
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
  const sched = createSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0] });
  expectType<Equal<ReturnType<typeof sched.daysBetween>, readonly ScheduleDayInfo<number>[]>>();
}

// ------------------------------------------------------------
// 祝日の識別子 key と絞り込み keys
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
  // keys は string の配列（Kind のような型引数は増やさない）
  createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ holiday: true, keys: ["anything"] }],
  });
  // @ts-expect-error -- keys は祝日の規則でだけ使える
  createCalendar({ closedRecurringRules: [{ weekday: 1, keys: ["sports"] }] });
  // 祝日の翌日・祝前日の規則も keys で絞れる
  createCalendar({ closedRecurringRules: [{ dayAfterHoliday: true, keys: ["sports"] }] });
  createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true, keys: ["sports"] }] });
  // @ts-expect-error -- 既知の値の型なので、知らない文字列は誤り
  const badKey: KnownJpHolidayKey = "golden-week";
  void badKey;
  const substituted: Holiday<"regular" | "substitute">[] = withSubstituteDays(
    [{ date: "2026-01-01", name: "X", nameEn: "X", kind: "regular", confirmed: true }],
    { directions: { 0: "next" }, kind: "substitute", originalPolicy: "drop" },
  );
  void substituted;
  // @ts-expect-error -- 向きは "next" か "previous"
  withSubstituteDays([], { directions: { 0: "nearest" }, kind: "substitute" });
}

// ------------------------------------------------------------
// 第 n 営業日の規則 businessDayOfMonth と、振替で飛ばす曜日 skipWeekdays
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

// 規則の形ごとに受ける holidayOverlapPolicy・skipWeekdays・calendar（0.30.0。docs/decisions.md の 33・54 番）
{
  const branch = createCalendar({ holidayProvider: jp });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- 祝日の翌日の規則は holidayOverlapPolicy を受けない
      { dayAfterHoliday: true, holidayOverlapPolicy: "over-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- 祝前日の規則は holidayOverlapPolicy を受けない
      { dayBeforeHoliday: true, holidayOverlapPolicy: "under-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- 祝日の規則は holidayOverlapPolicy を受けない
      { holiday: true, holidayOverlapPolicy: "over-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- 周期の規則は "after-holiday" を受けない
      { cycle: 6, anchor: "2026-01-05", positions: [5], holidayOverlapPolicy: "after-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- 第 n 営業日の規則は "after-holiday" を受けない
      { businessDayOfMonth: 1, holidayOverlapPolicy: "after-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- 週の第 n 営業日の規則も "after-holiday" を受けない
      { businessDayOfWeek: 1, weekStart: 1, holidayOverlapPolicy: "after-holiday" },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- skipWeekdays は "after-holiday" のときだけ
      { weekday: 1, skipWeekdays: [6] },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- skipWeekdays は "over-holiday" では受けない
      { dayOfMonth: 1, holidayOverlapPolicy: "over-holiday", skipWeekdays: [6] },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- カレンダーの第 n 営業日の規則は calendar を受けない
      { businessDayOfMonth: 1, calendar: branch },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- 週の第 n 営業日の規則は weekStart が必須
      { businessDayOfWeek: -1 },
    ],
  });
  createCalendar({
    closedRecurringRules: [
      // @ts-expect-error -- 週の第 n 営業日は 1〜7 と -1〜-7
      { businessDayOfWeek: 8, weekStart: 1 },
    ],
  });
  createSchedule({
    weekdayValues: [0, 0, 0, 0, 0, 0, 0],
    recurringRules: [
      // @ts-expect-error -- スケジュールの第 n 営業日の規則は calendar が必須
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
  // @ts-expect-error -- skipWeekdays は曜日・日の規則でだけ使える
  createCalendar({ closedRecurringRules: [{ holiday: true, skipWeekdays: [6] }] });
  // @ts-expect-error -- 曜日の規則と第 n 営業日の規則は同時に書けない
  createCalendar({ closedRecurringRules: [{ weekday: 1, businessDayOfMonth: 1 }] });
}

// 日単位の周期の規則 cycle・anchor・positions と、祝日の翌日・祝前日の skipWeekdays
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
  // @ts-expect-error -- cycle には anchor と positions が要る
  createCalendar({ closedRecurringRules: [{ cycle: 6, positions: [5, 6] }] });
  createCalendar({
    // @ts-expect-error -- cycle と weekday は同時に指定できない
    closedRecurringRules: [{ cycle: 6, anchor: "2026-01-05", positions: [5], weekday: 1 }],
  });
  // @ts-expect-error -- positions は cycle の規則でだけ使える
  createCalendar({ closedRecurringRules: [{ dayOfMonth: 1, positions: [1] }] });
  createCalendar({
    // @ts-expect-error -- cycle の規則は weekdays で絞らない
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
  // @ts-expect-error -- skipWeekdays の要素は 0〜6
  createCalendar({ closedRecurringRules: [{ dayBeforeHoliday: true, skipWeekdays: [7] }] });
  // @ts-expect-error -- skipWeekdays は祝日の規則には付かない
  createCalendar({ closedRecurringRules: [{ holiday: true, skipWeekdays: [0] }] });
  const pattern: CyclePattern = { cycle: 4, anchor: "2026-01-01", positions: [4] };
  createSchedule({
    weekdayValues: [0, 1, 1, 1, 1, 1, 0],
    recurringRules: [{ ...pattern, value: 2 }],
  });
}
