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
  type DayReason,
  type ErrorCode,
  type KnownDayReason,
  type KnownScheduleReason,
  type ScheduleReason,
} from "../src/index.ts";
import {
  getHoliday,
  jp,
  type JapaneseHolidayKind,
  type KnownJapaneseHolidayKind,
} from "../src/jp/index.ts";

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
const futureReason: DayReason = "closed-monthly";
const futureScheduleReason: ScheduleReason = "monthly";
void futureReason;
void futureScheduleReason;

// 閉じた型（Known…）は将来の値を受け付けない。網羅を確かめたい利用者向け
// @ts-expect-error -- KnownDayReason に "closed-monthly" はない
const closedReason: KnownDayReason = "closed-monthly";
void closedReason;

function labelOf(r: KnownScheduleReason): string {
  switch (r) {
    case "date":
      return "個別の日付";
    case "annual":
      return "毎年の月日";
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
