/**
 * 日ごとに値を返すスケジュール（営業時間・受付枠など、曜日・祝日・特定日で変わるもの）。
 * 1 日の値を決める優先順位は docs/guide.md の「Day-by-day values」と docs/decisions.md の 12 番。
 * 営業日カレンダー（createCalendar）は、このスケジュールの真偽値版として作られている。
 */

import {
  addDays,
  lengthOfMonth,
  formatDate,
  fromDayNumber,
  isValidDate,
  parseDate,
  toDayNumber,
  weekdayOf,
  type DateString,
  type Weekday,
} from "./date.ts";
import { checkUnknownKeys, IssueCollector, rangeError, type KnownErrorCode } from "./errors.ts";
import { RENAMED_VALUES, renameKeys, renameValue, writtenKey } from "./renamed.ts";
import {
  instantToCivil,
  toCivil,
  toDateTimeParts,
  toInstant,
  validateTimeZone,
  type CivilDateTimeParts,
  type DateInput,
  type DateTimeInput,
} from "./input.ts";

export type { CivilDateTimeParts } from "./input.ts";
import { HOLIDAY_KEY_PATTERN, type Holiday, type HolidayProvider } from "./types.ts";
import type { Calendar } from "./calendar.ts";

// ------------------------------------------------------------
// 公開する型
// ------------------------------------------------------------

/**
 * 祝日の値の決め方（スケジュールの holidayPolicy の設定）。
 * @public
 */
export type ScheduleHolidayPolicy<Value> =
  /** 祝日を考えず、曜日の値を使う */
  | "ignore"
  /** 指定した曜日の値を使う（例: 祝日は日曜日の営業時間） */
  | { readonly sameAs: Weekday }
  /** 指定した値を使う */
  | { readonly value: Value };

/**
 * 月の第 n 回目（1〜5）。-1 は最終（その月の最後のその曜日）。
 * @public
 */
export type Nth = 1 | 2 | 3 | 4 | 5 | -1;

/**
 * 月の日（1〜31）。-1 は末日。
 * @public
 */
export type DayOfMonth =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | -1;

/**
 * 月の第 n 営業日（1〜31。-1 は最後、-2 はその前、… -31 まで。0 は不可）。
 * @public
 */
export type BusinessDayOfMonth = number;

/**
 * 週の第 n 営業日（1〜7、-1 は最後、-2 はその前 … -7）。
 * @public
 */
export type BusinessDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7 | -1 | -2 | -3 | -4 | -5 | -6 | -7;

/**
 * 月（1〜12）。
 * @public
 */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * 繰り返しの規則が祝日に当たったときの扱い。
 * - "under-holiday": 祝日の下。祝日の扱いに従う（既定）
 * - "over-holiday": 祝日の上。祝日でも当てはめる
 * - "after-holiday": 祝日の後。祝日には当てはめず、その日以降で最初の祝日でない日（土曜日のこともある）に振り替える
 * @public
 */
export type HolidayOverlapPolicy = "under-holiday" | "over-holiday" | "after-holiday";

/**
 * 規則の有効期間（両端を含む "YYYY-MM-DD"）。期間の外では、その規則は書かれていないのと同じに扱う。
 * @public
 */
export interface EffectivePeriod {
  /** この日から有効（省略時は期限なし） */
  readonly effectiveFrom?: DateString;
  /** この日まで有効（省略時は期限なし） */
  readonly effectiveTo?: DateString;
}

/**
 * 曜日の繰り返し。nth を省略すると毎週、指定すると月の第 n 回目（例: 第 3 水曜日）。
 * interval と anchor を指定すると、anchor と同じ曜日で、anchor から interval 週おきの日（例: 隔週水曜日）。
 * @public
 */
export interface WeekdayPattern {
  readonly weekday: Weekday;
  /** 月の第 n 回目（その月で n 回目のその曜日。1〜7 日が第 1）。配列で複数指定できる。interval とは併用できない */
  readonly nth?: Nth | readonly Nth[];
  /** 周期（週）。2 以上の整数。anchor と一緒に指定する（例: 2 で隔週） */
  readonly interval?: number;
  /**
   * 周期の起点の日付 "YYYY-MM-DD"（weekday と同じ曜日）。この日の前後に interval 週おきに当てはまる。
   * 起点より前の日にも当てはまるので、起点から始めるには effectiveFrom を併せて指定する
   */
  readonly anchor?: DateString;
  /** 当てはめる月（省略時はすべての月） */
  readonly months?: readonly Month[];
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
}

/**
 * 毎月の日の繰り返し（例: 毎月 20 日、毎月末日）。その月にない日（2 月 30 日など）は当てはまらない。
 * @public
 */
export interface DayOfMonthPattern {
  /** 月の日（1〜31、-1 は末日）。配列で複数指定できる */
  readonly dayOfMonth: DayOfMonth | readonly DayOfMonth[];
  /** 当てはめる月（省略時はすべての月） */
  readonly months?: readonly Month[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
}

/**
 * 月の第 n 営業日（例: 月末最終営業日、第 5 営業日）。n は 1〜31、-1 は最後、-2 はその前。その月にない回は当てはまらない。
 *
 * 数える基準はこの規則を書いたカレンダーの「繰り返しの規則をすべて除いた判定」（個別の日付 → 毎年の月日 → 祝日 → 定休日の曜日）で、
 * 定休日の曜日・祝日・年末年始休業（closedAnnualDates）・臨時休業日は数えに入らない。繰り返しの規則（定休日を closedRecurringRules の
 * 曜日の規則で書いたものを含む）は基準に入らない。nthBusinessDayOfMonth・lastBusinessDayOfMonth はこの規則を適用した後の
 * 実際の営業日を返すので、{ businessDayOfMonth: -1 } を休業にすると lastBusinessDayOfMonth はその前日になる。
 * holidayOverlapPolicy は "under-holiday"（既定）と "over-holiday" を受け、"after-holiday" は invalid-option（第 n 営業日をずらす意味がない）。
 * holidayPolicy: "open" のカレンダーでは祝日も営業日として数えるので第 n 営業日が祝日に当たることがあり、既定ではその日は
 * 祝日の段階が先に決めてこの規則は当てはまらない（曜日の規則と同じ優先順位）。「第 1 営業日は祝日でも休業」は "over-holiday" で書く。
 * holidayPolicy: "closed" では祝日が基準の営業日にならないので "over-holiday" は結果を変えない（診断が info で知らせる）。
 *
 * スケジュール（createSchedule の recurringRules）では、スケジュール自身に営業・休業の概念がないので、数える基準にする作成済みの
 * カレンダーを calendar で指定する（必須。タイムゾーンはスケジュールと同じであること）。カレンダー（closedRecurringRules・openRecurringRules）
 * では calendar は指定できない（invalid-option。基準は自分の設定で決まる）。
 * @public
 */
export interface BusinessDayOfMonthPattern {
  /** 月の第 n 営業日（1〜31、-1 は最後、-2 はその前、… -31 まで）。配列で複数指定できる */
  readonly businessDayOfMonth: BusinessDayOfMonth | readonly BusinessDayOfMonth[];
  /** 当てはめる月（省略時はすべての月） */
  readonly months?: readonly Month[];
  /** 営業日を数える基準のカレンダー（スケジュールでは必須。カレンダーでは指定できない） */
  readonly calendar?: Calendar;
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly skipWeekdays?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  /** 祝日に当たったときの扱い（既定: "under-holiday"。"after-holiday" は受けない） */
  readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
}

/**
 * 週の第 n 営業日（例: 週の最終営業日、週の最初の営業日）。週は weekStart の曜日から 7 日間で、n は 1〜7、-1 は最後、-2 はその前。
 * その週にない回は当てはまらない。数える基準・calendar・holidayOverlapPolicy の扱いは businessDayOfMonth と同じ
 * （カレンダーでは自分の設定の「繰り返しの規則をすべて除いた判定」、スケジュールでは必須の calendar で数える）。
 * 週の始まりは地域・業種で違うので、weekStart は省略できない。months は当てはまる日の月で絞る。
 * 週の 7 日をすべて数えるので、週の一部が祝日の提供元の対応年の外にかかる日は、outOfRangePolicy: "throw" では out-of-range になる。
 * @public
 */
export interface BusinessDayOfWeekPattern {
  readonly businessDayOfWeek: BusinessDayOfWeek | readonly BusinessDayOfWeek[];
  /** 週の始まりの曜日（0 = 日曜日〜6 = 土曜日） */
  readonly weekStart: Weekday;
  readonly months?: readonly Month[];
  readonly calendar?: Calendar;
  /** 祝日に当たったときの扱い（既定: "under-holiday"。"after-holiday" は受けない） */
  readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly skipWeekdays?: never;
  readonly cycle?: never;
  readonly positions?: never;
}

/**
 * 祝日の翌日（祝日が続く場合は連休が明けた日。その日自身は祝日でない）。「祝日」は提供元の祝日だけ。
 * kinds・keys で、前日の祝日（skipWeekdays があれば、飛ばした日の手前で最も近い祝日）の種別・識別子を絞れる。
 * 当てはまる日は祝日でないので、holidayOverlapPolicy は指定できない（指定すると invalid-option）。
 * @public
 */
export interface DayAfterHolidayPattern<Kind extends string = string> {
  readonly dayAfterHoliday: true;
  /** 当てはめる曜日（翌日の曜日。省略時はすべての曜日。例: [1, 2, 3, 4, 5] で土日に当たる翌日は除く） */
  readonly weekdays?: readonly Weekday[];
  /** 当てはめる月（翌日の月。省略時はすべての月） */
  readonly months?: readonly Month[];
  /** 前日の祝日の種別（Holiday.kind。省略時はすべて） */
  readonly kinds?: readonly Kind[];
  /** 前日の祝日の識別子（Holiday.key。省略時はすべて。key を持たない祝日には当てはまらない） */
  readonly keys?: readonly string[];
  /**
   * 祝日に加えて飛ばす曜日。祝日とこの曜日が続く塊（祝日を 1 日以上含む）が明けた日に当てはまる
   * （例: 金曜日の祝日の翌平日は { dayAfterHoliday: true, skipWeekdays: [0, 6] } で月曜日）。すべての曜日は指定できない
   */
  readonly skipWeekdays?: readonly Weekday[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  readonly holidayOverlapPolicy?: never;
}

/**
 * 祝前日（翌日が祝日で、その日自身は祝日でない日。連休なら連休の初日の前日）。「祝日」は提供元の祝日だけ。
 * 祝日の翌日（dayAfterHoliday）の鏡像で、祝前日料金・祝前日の営業時間の延長・締め時刻の繰り上げなどを規則として書く。
 * kinds・keys で、翌日の祝日（skipWeekdays があれば、飛ばした日の先で最も近い祝日）の種別・識別子を絞れる
 * （例: 旧正月の前日は { dayBeforeHoliday: true, keys: ["chinese-new-year"] }）。
 * 当てはまる日は祝日でないので、holidayOverlapPolicy は指定できない（指定すると invalid-option）。
 * @public
 */
export interface DayBeforeHolidayPattern<Kind extends string = string> {
  readonly dayBeforeHoliday: true;
  /** 当てはめる曜日（祝前日の曜日。省略時はすべての曜日。例: [1, 2, 3, 4, 5] で土日に当たる祝前日は除く） */
  readonly weekdays?: readonly Weekday[];
  /** 当てはめる月（祝前日の月。省略時はすべての月） */
  readonly months?: readonly Month[];
  /** 翌日の祝日の種別（Holiday.kind。省略時はすべて） */
  readonly kinds?: readonly Kind[];
  /** 翌日の祝日の識別子（Holiday.key。省略時はすべて。key を持たない祝日には当てはまらない） */
  readonly keys?: readonly string[];
  /**
   * 祝日に加えて飛ばす曜日。祝日とこの曜日が続く塊（祝日を 1 日以上含む）の前の日に当てはまる
   * （例: 月曜日の祝日の前の最終平日は { dayBeforeHoliday: true, skipWeekdays: [0, 6] } で金曜日）。すべての曜日は指定できない
   */
  readonly skipWeekdays?: readonly Weekday[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly holiday?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  readonly holidayOverlapPolicy?: never;
}

/**
 * 日単位の周期（例: 4 勤 2 休の交替制の休日、10 日に 1 度の定期点検）。週や月にそろわない周期を、起点からの日数で書く。
 * 起点（anchor）を 1 日目として cycle 日ごとに繰り返し、positions に書いた何日目かに当てはまる
 * （例: 4 勤 2 休の休日は { cycle: 6, anchor: "2026-01-05", positions: [5, 6] }）。起点より前の日にも当てはまるので、
 * 起点から始めるには effectiveFrom を併せて指定する。holidayOverlapPolicy は "under-holiday"（既定）と "over-holiday" を受け、
 * "after-holiday" は invalid-option（周期の日を祝日の後ろへずらす意味がない）。
 * @public
 */
export interface CyclePattern {
  /** 周期（日）。2 以上の整数 */
  readonly cycle: number;
  /** 周期の起点の日付 "YYYY-MM-DD"（1 日目） */
  readonly anchor: DateString;
  /** 当てはまる日（周期の中の何日目か。1〜cycle の重複のない整数の配列。すべての日は指定できない） */
  readonly positions: readonly number[];
  /** 当てはめる月（省略時はすべての月） */
  readonly months?: readonly Month[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly holiday?: never;
  readonly weekdays?: never;
  readonly kinds?: never;
  readonly keys?: never;
  readonly skipWeekdays?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  /** 祝日に当たったときの扱い（既定: "under-holiday"。"after-holiday" は受けない） */
  readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
}

/**
 * 祝日（提供元の祝日である日）。kinds で祝日の種別を、keys で個別の祝日を絞れる（省略時はすべての祝日）。
 * 「祝日の上」の段階（holidayPolicy より先）で判定し、祝日の既定の扱いの例外を書く
 * （例: 「2027 年 4 月から祝日も営業」「振替休日は診療」「5 月の祝日は特別営業時間」）。
 * 当てはまる日は祝日なので、holidayOverlapPolicy は指定できない（指定すると invalid-option）。
 * @public
 */
export interface HolidayPattern<Kind extends string = string> {
  readonly holiday: true;
  /** 当てはめる祝日の種別（Holiday.kind。省略時はすべて）。提供元の種別の型で補完が効く（型は開いているので他の文字列も通る） */
  readonly kinds?: readonly Kind[];
  /**
   * 当てはめる祝日の識別子（Holiday.key。省略時はすべて）。kinds・weekdays・months との AND。
   * 春分の日・復活祭に連動する日・太陰暦の祝日のように月日や第 n 曜日では書けない祝日を個別に指す
   * （例: 「春分の日・秋分の日は営業」は { holiday: true, keys: ["vernal-equinox", "autumnal-equinox"] }）。
   * 振替日は元の祝日の key を持つので「成人の日とその振替」を指せる。当日だけなら kinds を併せて指定する。
   * key を持たない祝日（国民の休日・臨時の祝日）には当てはまらない
   */
  readonly keys?: readonly string[];
  /** 当てはめる曜日（省略時はすべての曜日。例: [6] で土曜の祝日だけ） */
  readonly weekdays?: readonly Weekday[];
  /** 当てはめる月（省略時はすべての月） */
  readonly months?: readonly Month[];
  readonly weekday?: never;
  readonly nth?: never;
  readonly interval?: never;
  readonly anchor?: never;
  readonly dayOfMonth?: never;
  readonly businessDayOfMonth?: never;
  readonly calendar?: never;
  readonly dayAfterHoliday?: never;
  readonly dayBeforeHoliday?: never;
  readonly skipWeekdays?: never;
  readonly cycle?: never;
  readonly positions?: never;
  readonly businessDayOfWeek?: never;
  readonly weekStart?: never;
  readonly holidayOverlapPolicy?: never;
}

/**
 * 繰り返しのパターン。曜日・日の規則は、"after-holiday" のときだけ skipWeekdays を書ける。
 * @public
 */
export type RecurringPattern<Kind extends string = string> =
  | (WeekdayPattern &
      (
        | {
            /** 祝日に当たったら、その日以降で最初の祝日でない日に振り替える */
            readonly holidayOverlapPolicy: "after-holiday";
            /**
             * 振替先を探すときに、祝日に加えて飛ばす曜日（0 = 日曜日〜6 = 土曜日）。本来の日が祝日かこの曜日なら、その日以降で最初の、
             * 祝日でもこの曜日でもない日に振り替える（例: 月曜定休で、月曜が祝日なら翌平日（土曜日には落とさない）は
             * { weekday: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [6] }）。weekday 自身は含められない
             */
            readonly skipWeekdays?: readonly Weekday[];
          }
        | {
            /** 祝日に当たったときの扱い（既定: "under-holiday"） */
            readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
            readonly skipWeekdays?: never;
          }
      ))
  | (DayOfMonthPattern &
      (
        | {
            /** 祝日に当たったら、その日以降で最初の祝日でない日に振り替える */
            readonly holidayOverlapPolicy: "after-holiday";
            /**
             * 振替先を探すときに、祝日に加えて飛ばす曜日（0 = 日曜日〜6 = 土曜日）。本来の日が祝日かこの曜日なら、その日以降で最初の、
             * 祝日でもこの曜日でもない日に振り替える（例: 「6 月 15 日は創立記念日。土日祝なら翌営業日」は
             * { dayOfMonth: 15, months: [6], holidayOverlapPolicy: "after-holiday", skipWeekdays: [0, 6] }）
             */
            readonly skipWeekdays?: readonly Weekday[];
          }
        | {
            /** 祝日に当たったときの扱い（既定: "under-holiday"） */
            readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
            readonly skipWeekdays?: never;
          }
      ))
  | BusinessDayOfMonthPattern
  | BusinessDayOfWeekPattern
  | DayAfterHolidayPattern<Kind>
  | DayBeforeHolidayPattern<Kind>
  | HolidayPattern<Kind>
  | CyclePattern;

/**
 * 繰り返しの規則（営業日カレンダーの closedRecurringRules・openRecurringRules）。
 * 第 n 営業日の規則は calendar を指定できない（数える基準は自分の設定）。
 * @public
 */
export type RecurringRule<Kind extends string = string> = (
  | Exclude<RecurringPattern<Kind>, BusinessDayOfMonthPattern | BusinessDayOfWeekPattern>
  | ((BusinessDayOfMonthPattern | BusinessDayOfWeekPattern) & { readonly calendar?: never })
) &
  EffectivePeriod & {
    readonly name?: string;
    /** @deprecated 0.30.0 で holidayOverlapPolicy に改名した。1.0.0 で削除する */
    readonly onHolidayRule?: HolidayOverlapPolicy;
  };

/**
 * 繰り返しの規則の値（スケジュールの recurringRules）。第 n 営業日の規則は、数える基準のカレンダー calendar が必須。
 * @public
 */
export type ScheduleRecurringRule<Value, Kind extends string = string> = (
  | Exclude<RecurringPattern<Kind>, BusinessDayOfMonthPattern | BusinessDayOfWeekPattern>
  | ((BusinessDayOfMonthPattern | BusinessDayOfWeekPattern) & { readonly calendar: Calendar })
) &
  EffectivePeriod & {
    readonly name?: string;
    /** @deprecated 0.30.0 で holidayOverlapPolicy に改名した。1.0.0 で削除する */
    readonly onHolidayRule?: HolidayOverlapPolicy;
    readonly value: Value;
  };

/**
 * 毎年の月日 "MM-DD" の値。
 * @public
 */
export interface ScheduleAnnualDate<Value> extends EffectivePeriod {
  readonly date: string;
  readonly value: Value;
  readonly name?: string;
}

/**
 * 毎年の月日の期間の値（from > to なら年をまたぐ。例: 12-31 〜 01-03）。
 * @public
 */
export interface ScheduleAnnualRange<Value> extends EffectivePeriod {
  readonly from: string;
  readonly to: string;
  readonly value: Value;
  readonly name?: string;
}

/**
 * 個別の日付 "YYYY-MM-DD" の値。
 * @public
 */
export interface ScheduleSpecificDate<Value> {
  readonly date: DateString;
  readonly value: Value;
  readonly name?: string;
}

/**
 * 個別の日付の期間（両端を含む）の値。
 * @public
 */
export interface ScheduleDateRange<Value> {
  readonly from: DateString;
  readonly to: DateString;
  readonly value: Value;
  readonly name?: string;
}

/**
 * 祝日の提供元とタイムゾーンの設定（スケジュールと営業日カレンダーで共通）。
 * @public
 */
export interface HolidaySourceOptions<Kind extends string = string> {
  /** 祝日の提供元（例: jp）。複数渡すと和集合になる */
  readonly holidayProvider?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
  /** @deprecated 0.30.0 で holidayProvider に改名した。1.0.0 で削除する */
  readonly holidays?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
  /** @deprecated 0.30.0 で outOfRangePolicy に改名した。1.0.0 で削除する */
  readonly outOfRange?: "throw" | "ignore";
  /** @deprecated 0.30.0 で unconfirmedHolidayPolicy に改名した。1.0.0 で削除する */
  readonly unconfirmedHolidays?: "accept" | "throw";
  /**
   * 日時の入力（Date・オフセット付き文字列など）を暦日に変換するタイムゾーン。
   * 省略時は祝日の提供元のタイムゾーン、提供元もなければ "UTC"
   */
  readonly timeZone?: string;
  /** 祝日の提供元の対応年を外れた日付の扱い（既定: "throw"） */
  readonly outOfRangePolicy?: "throw" | "ignore";
  /**
   * 判定が未確定の祝日（提供元の confirmed: false。日本の春分の日・秋分の日の予測など）に触れたときの扱い（既定: "accept"）。
   * "throw" にすると、dayInfoOn・isBusinessDay に限らず、営業日の探索・調整・期日の計算の途中で評価した日や、祝日の翌日・祝前日の
   * 規則が見る隣の日を含め、祝日を引いた日が未確定の祝日なら unconfirmed-holiday の RangeError を投げる。
   * holidaysInYear・holidaysBetween は投げないので、影響する日の列挙に使える。
   * 判定に祝日を使う設定（holidayPolicy が "ignore" でない、または祝日に従属する規則がある）でだけ意味がある
   */
  readonly unconfirmedHolidayPolicy?: "accept" | "throw";
}

/**
 * スケジュールの設定。
 * @public
 */
export interface ScheduleOptions<
  Value,
  Kind extends string = string,
> extends HolidaySourceOptions<Kind> {
  /** 曜日ごとの値（[日, 月, 火, 水, 木, 金, 土]） */
  readonly weekdayValues: readonly [Value, Value, Value, Value, Value, Value, Value];
  /** 祝日の値の決め方（既定: "ignore"） */
  readonly holidayPolicy?: ScheduleHolidayPolicy<Value>;
  /** 繰り返しの規則（毎週・毎月の第 n 曜日・毎月の日）の値 */
  readonly recurringRules?: readonly ScheduleRecurringRule<Value, Kind>[];
  /** 毎年の月日の値 */
  readonly annualDates?: readonly (ScheduleAnnualDate<Value> | ScheduleAnnualRange<Value>)[];
  /** @deprecated 0.30.0 で holidayPolicy に改名した（値 "weekday" は "ignore"）。1.0.0 で削除する */
  readonly holiday?: ScheduleHolidayPolicy<Value> | "weekday";
  /** @deprecated 0.30.0 で recurringRules に改名した。1.0.0 で削除する */
  readonly recurring?: readonly ScheduleRecurringRule<Value, Kind>[];
  /** @deprecated 0.30.0 で annualDates に改名した。1.0.0 で削除する */
  readonly annual?: readonly (ScheduleAnnualDate<Value> | ScheduleAnnualRange<Value>)[];
  /** 個別の日付の値 */
  readonly dates?: readonly (ScheduleSpecificDate<Value> | ScheduleDateRange<Value>)[];
}

/**
 * 値を決めた規則（既知の値）。
 * @public
 */
export type KnownScheduleDayReason = "date" | "annual" | "recurring" | "holiday" | "weekday";

/**
 * 値を決めた規則。将来の版で値が増えることがあるので、分岐では「その他」も扱うこと。
 * すべての値を網羅したことを型で確かめたい場合は KnownScheduleDayReason を使う。
 * @public
 */
export type ScheduleDayReason = KnownScheduleDayReason | (string & {});

/**
 * 1 日分の値と、その値を決めた規則。
 * @public
 */
export interface ScheduleDayInfo<Value, Kind extends string = string> {
  readonly date: DateString;
  readonly weekday: Weekday;
  readonly value: Value;
  /** 値を決めた規則 */
  readonly reason: ScheduleDayReason;
  /** 値を決めた規則の名前（dates・annual・recurring の name、祝日なら祝日名） */
  readonly name?: string;
  /** その日が祝日なら祝日（holiday の規則に関係なく付く） */
  readonly holiday?: Holiday<Kind>;
  /** 祝日から振り替えられた規則で値が決まった場合、振替の元の日付（holidayOverlapPolicy: "after-holiday"） */
  readonly shiftedFrom?: DateString;
  /**
   * 値を決めた規則の設定の中の位置（規則の診断の path と同じ形。例: "recurringRules[0]"）。
   * dates・annualDates・recurringRules（振替先を含む）で決まった日にだけ付き、祝日・曜日で決まった日には付かない。
   * 旧名のキーで書いた設定でも、新しい名前の位置で返す
   */
  readonly optionPath?: string;
  /** @deprecated 0.30.0 で optionPath に改名した（同じ値）。1.0.0 で削除する */
  readonly rulePath?: string;
}

/**
 * 祝日を調べる機能（スケジュールと営業日カレンダーで共通）。
 * @public
 */
export interface HolidayLookup<Kind extends string = string> {
  /** 日時の入力を暦日に変換するタイムゾーン */
  readonly timeZone: string;
  /** 祝日の提供元 */
  readonly providers: readonly HolidayProvider<Kind>[];
  /** 祝日の提供元の対応年を外れた日付の扱い（設定の outOfRangePolicy） */
  readonly outOfRangePolicy: "throw" | "ignore";
  /** 未確定の祝日に触れたときの扱い（設定の unconfirmedHolidayPolicy） */
  readonly unconfirmedHolidayPolicy: "accept" | "throw";
  /** @deprecated 0.30.0 で outOfRangePolicy に改名した（同じ値）。1.0.0 で削除する */
  readonly outOfRange: "throw" | "ignore";
  /** @deprecated 0.30.0 で unconfirmedHolidayPolicy に改名した（同じ値）。1.0.0 で削除する */
  readonly unconfirmedHolidays: "accept" | "throw";

  /** 入力をタイムゾーンでの暦日に変換する */
  dateOf(input: DateInput): DateString;
  /** 入力をタイムゾーンでの暦日と時刻に変換する */
  civilOf(input: DateTimeInput): CivilDateTimeParts<string>;
  civilOf(input: DateInput): CivilDateTimeParts;
  /**
   * 暦日 "YYYY-MM-DD" と時刻（"HH:mm" または "HH:mm:ss"）から、タイムゾーンでのその瞬間を Date で返す（civilOf の逆向き）。
   * 夏時間で存在しない時刻は飛んだ分だけ後ろに、2 回ある時刻は先のほう（toInstant と同じ）
   */
  instantOf(date: DateString, time: string): Date;
  /** 今日の日付（タイムゾーン） */
  today(now?: Date): DateString;

  /** 祝日か */
  isHoliday(input: DateInput): boolean;
  /** 祝日なら祝日を返す */
  holidayOn(input: DateInput): Holiday<Kind> | undefined;
  /** @deprecated 0.30.0 で holidayOn に改名した。1.0.0 で削除する */
  getHoliday(input: DateInput): Holiday<Kind> | undefined;
  /** その年の祝日 */
  holidaysInYear(year: number): readonly Holiday<Kind>[];
  /** 期間内の祝日（両端を含む） */
  holidaysBetween(from: DateInput, to: DateInput): readonly Holiday<Kind>[];
}

/**
 * 日ごとに値を返すスケジュール。
 * @public
 */
export interface Schedule<Value, Kind extends string = string> extends HolidayLookup<Kind> {
  /** その日の値 */
  valueOn(input: DateInput): Value;
  /**
   * その日の値と、値を決めた規則（reason）。reason は値を決めた規則なので、holidayPolicy が "ignore"（曜日どおり）の
   * ときは、祝日でも "weekday" になる。祝日かどうかは holiday の有無で判定する
   */
  dayInfoOn(input: DateInput): ScheduleDayInfo<Value, Kind>;
  /** @deprecated 0.30.0 で dayInfoOn に改名した。1.0.0 で削除する */
  dayInfo(input: DateInput): ScheduleDayInfo<Value, Kind>;
  /** 期間内の日ごとの値と規則（両端を含む。from が to より後ならエラー） */
  daysBetween(from: DateInput, to: DateInput): readonly ScheduleDayInfo<Value, Kind>[];
}

// ------------------------------------------------------------
// 入力チェック（誤りを集める。作成時は最初の誤りを例外にする）
// ------------------------------------------------------------

const MONTH_DAY_RE = /^(\d{2})-(\d{2})$/;
const MAX_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** @internal "MM-DD" として正しいか（2 月 29 日は可） */
export function isValidMonthDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = MONTH_DAY_RE.exec(value);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= MAX_DAYS_IN_MONTH[month - 1]!;
}

/** @internal 曜日の番号として正しいか */
export const isWeekday = (value: unknown): value is Weekday =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;

/** @internal 個別の日付の規則（日数で表した期間） */
export interface DateRule<Value> {
  /** 設定の中の位置（例: "closedDates[1]"） */
  readonly path: string;
  readonly from: number;
  readonly to: number;
  readonly value: Value;
  readonly name: string | undefined;
}

/** @internal 有効期間（日数。省略した側は null） */
export interface CompiledPeriod {
  readonly effectiveFrom: number | null;
  readonly effectiveTo: number | null;
}

/** @internal 毎年の月日の規則 */
export interface AnnualRule<Value> extends CompiledPeriod {
  /** 設定の中の位置（例: "closedAnnualDates[0]"） */
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly value: Value;
  readonly name: string | undefined;
}

/** @internal 日数 n が有効期間の中か */
export const inPeriod = (rule: CompiledPeriod, n: number): boolean =>
  (rule.effectiveFrom === null || n >= rule.effectiveFrom) &&
  (rule.effectiveTo === null || n <= rule.effectiveTo);

/** 有効期間（effectiveFrom・effectiveTo）を検証して日数にする（誤りは c に記録して undefined） */
function checkPeriod(
  c: IssueCollector,
  path: string,
  entry: Record<string, unknown>,
): CompiledPeriod | undefined {
  let ok = true;
  const read = (key: "effectiveFrom" | "effectiveTo"): number | null => {
    const raw = entry[key];
    if (raw === undefined) return null;
    const n = checkDate(c, `${path}.${key}`, raw);
    if (n === undefined) ok = false;
    return n ?? null;
  };
  const effectiveFrom = read("effectiveFrom");
  const effectiveTo = read("effectiveTo");
  if (!ok) return undefined;
  if (effectiveFrom !== null && effectiveTo !== null && effectiveFrom > effectiveTo) {
    c.error(
      "invalid-range",
      path,
      `"effectiveFrom" must not be after "effectiveTo" (${String(entry["effectiveFrom"])} > ${String(entry["effectiveTo"])})`,
    );
    return undefined;
  }
  return { effectiveFrom, effectiveTo };
}

function checkName(c: IssueCollector, path: string, name: unknown): string | undefined {
  if (name === undefined) return undefined;
  if (typeof name !== "string") {
    c.error("invalid-option", `${path}.name`, "name must be a string");
    return undefined;
  }
  return name;
}

function checkDate(c: IssueCollector, path: string, value: unknown): number | undefined {
  if (!isValidDate(value)) {
    c.error("invalid-date", path, `Invalid date ${JSON.stringify(value)} (expected YYYY-MM-DD)`);
    return undefined;
  }
  return toDayNumber(value);
}

function checkMonthDay(c: IssueCollector, path: string, value: unknown): string | undefined {
  if (!isValidMonthDay(value)) {
    c.error(
      "invalid-annual-date",
      path,
      `Invalid annual date ${JSON.stringify(value)} (expected MM-DD)`,
    );
    return undefined;
  }
  return value;
}

/**
 * @internal 個別の日付の規則を検証して取り込む。
 * entry は "YYYY-MM-DD"・{ date }・{ from, to } のいずれか。値は valueOf で決める
 */
export function compileDateRules<Value>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: (entry: Record<string, unknown>, path: string) => Value | undefined,
  allowString: boolean,
): DateRule<Value>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: DateRule<Value>[] = [];
  entries.forEach((raw: unknown, i) => {
    const p = `${path}[${i}]`;
    const entry: unknown = allowString && typeof raw === "string" ? { date: raw } : raw;
    if (!isObject(entry)) {
      c.error(
        "invalid-option",
        p,
        allowString ? "must be a date string or an object" : "must be an object",
      );
      return;
    }
    const value = valueOf(entry, p);
    const name = checkName(c, p, entry["name"]);
    if ("date" in entry) {
      checkUnknownKeys(c, p, entry, ["date", "name", "value"]);
      const n = checkDate(c, `${p}.date`, entry["date"]);
      if (n !== undefined && value !== undefined)
        rules.push({ path: p, from: n, to: n, value, name });
      return;
    }
    if (!("from" in entry) || !("to" in entry)) {
      c.error("invalid-option", p, 'must have "date" or both "from" and "to"');
      return;
    }
    checkUnknownKeys(c, p, entry, ["from", "to", "name", "value"]);
    const from = checkDate(c, `${p}.from`, entry["from"]);
    const to = checkDate(c, `${p}.to`, entry["to"]);
    if (from === undefined || to === undefined) return;
    if (from > to) {
      c.error(
        "invalid-range",
        p,
        `"from" must not be after "to" (${String(entry["from"])} > ${String(entry["to"])})`,
      );
      return;
    }
    if (value !== undefined) rules.push({ path: p, from, to, value, name });
  });
  return rules;
}

/** @internal 毎年の月日の規則を検証して取り込む（entry は "MM-DD"・{ date }・{ from, to }） */
export function compileAnnualRules<Value>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: (entry: Record<string, unknown>, path: string) => Value | undefined,
  allowString: boolean,
): AnnualRule<Value>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: AnnualRule<Value>[] = [];
  entries.forEach((raw: unknown, i) => {
    const p = `${path}[${i}]`;
    const entry: unknown = allowString && typeof raw === "string" ? { date: raw } : raw;
    if (!isObject(entry)) {
      c.error(
        "invalid-option",
        p,
        allowString ? "must be an annual date string (MM-DD) or an object" : "must be an object",
      );
      return;
    }
    const value = valueOf(entry, p);
    const name = checkName(c, p, entry["name"]);
    const period = checkPeriod(c, p, entry);
    if ("date" in entry) {
      checkUnknownKeys(c, p, entry, ["date", "name", "value", ...PERIOD_KEYS]);
      const md = checkMonthDay(c, `${p}.date`, entry["date"]);
      if (md !== undefined && value !== undefined && period) {
        rules.push({ path: p, from: md, to: md, value, name, ...period });
      }
      return;
    }
    if (!("from" in entry) || !("to" in entry)) {
      c.error("invalid-option", p, 'must have "date" or both "from" and "to"');
      return;
    }
    checkUnknownKeys(c, p, entry, ["from", "to", "name", "value", ...PERIOD_KEYS]);
    const from = checkMonthDay(c, `${p}.from`, entry["from"]);
    const to = checkMonthDay(c, `${p}.to`, entry["to"]);
    if (from !== undefined && to !== undefined && value !== undefined && period) {
      rules.push({ path: p, from, to, value, name, ...period });
    }
  });
  return rules;
}

/** @internal 繰り返しの規則（検証済み） */
export interface RecurringRuleCompiled<Value> extends CompiledPeriod {
  /** 設定の中の位置（例: "closedRecurringRules[0]"） */
  readonly path: string;
  /** 曜日の規則なら曜日、日の規則なら null */
  readonly weekday: Weekday | null;
  /** 第 n 回目の集合（null は毎週） */
  readonly nth: ReadonlySet<number> | null;
  /** 周期（週）。null は毎週・第 n 回目・日の規則 */
  readonly interval: number | null;
  /** 周期の起点（日数）。interval・cycle が null なら null */
  readonly anchor: number | null;
  /** 日単位の周期（日）。周期の規則以外では null */
  readonly cycle: number | null;
  /** 周期の中で当てはまる日（1 始まり）。周期の規則以外では null */
  readonly positions: ReadonlySet<number> | null;
  /** 日の集合（曜日の規則では null） */
  readonly days: ReadonlySet<number> | null;
  /** 第 n 営業日の集合（第 n 営業日の規則以外では null） */
  readonly businessDays: ReadonlySet<number> | null;
  /** 週の第 n 営業日の規則の週の始まりの曜日（月の第 n 営業日・ほかの規則では null） */
  readonly weekStart: number | null;
  /** 営業日を数える基準（スケジュールの第 n 営業日の規則の calendar から。null なら自分の設定の「繰り返しの規則を除いた判定」） */
  readonly basis: BasisOfMonth | null;
  /** basis の元のカレンダー（診断で同じ基準かを比べるため。basis が null なら null） */
  readonly calendar: Calendar | null;
  /** "after-holiday" の振替と、祝日の翌日・祝前日の塊で、祝日に加えて飛ばす曜日（null はなし） */
  readonly skipWeekdays: ReadonlySet<number> | null;
  /** 祝日の翌日の規則か */
  readonly dayAfterHoliday: boolean;
  /** 祝前日の規則か */
  readonly dayBeforeHoliday: boolean;
  /** 祝日の規則か */
  readonly holiday: boolean;
  /** 祝日・祝日の翌日・祝前日の規則で絞る種別（null はすべての祝日） */
  readonly kinds: ReadonlySet<string> | null;
  /** kinds の旧名 "national" を、日本の提供元が返した "regular" の祝日にも当てるか（docs/decisions.md の 54 番） */
  readonly nationalOfJp: boolean;
  /** 祝日・祝日の翌日・祝前日の規則で絞る識別子（null はすべての祝日） */
  readonly keys: ReadonlySet<string> | null;
  /** 祝日・祝日の翌日・祝前日の規則で絞る曜日（null はすべての曜日） */
  readonly weekdays: ReadonlySet<number> | null;
  /** 月の集合（null はすべての月） */
  readonly months: ReadonlySet<number> | null;
  readonly holidayOverlapPolicy: HolidayOverlapPolicy;
  readonly value: Value;
  readonly name: string | undefined;
}

const NTH_VALUES = [1, 2, 3, 4, 5, -1];
const isBusinessDayOfWeek = (v: unknown): boolean =>
  Number.isInteger(v) && v !== 0 && (v as number) >= -7 && (v as number) <= 7;
const isBusinessDayOfMonth = (v: unknown): boolean =>
  Number.isInteger(v) && v !== 0 && (v as number) >= -31 && (v as number) <= 31;

/**
 * @internal 営業日を数える基準。年と月を受け取り、その月の基準で営業日である日（1〜31）を日付順に返す。
 * 第 n 営業日の規則（businessDayOfMonth）の判定に使う
 */
export type BasisOfMonth = (year: number, month: number) => readonly number[];

/** @internal カレンダーの判定関数から、月ごとに結果をキャッシュする基準を作る */
export function basisFromPredicate(isOpen: (date: DateString) => boolean): BasisOfMonth {
  const cache = new Map<number, readonly number[]>();
  return (year, month) => {
    const key = year * 12 + month;
    let days = cache.get(key);
    if (days === undefined) {
      const list: number[] = [];
      const dim = lengthOfMonth(year, month);
      for (let d = 1; d <= dim; d++) if (isOpen(formatDate(year, month, d))) list.push(d);
      days = Object.freeze(list);
      if (cache.size >= 240) cache.clear();
      cache.set(key, days);
    }
    return days;
  };
}

/** 作成済みのカレンダーか（createCalendar の結果の形。isBusinessDay と timeZone を持つ） */
const isCalendarLike = (v: unknown): v is Calendar =>
  isObject(v) && typeof v["isBusinessDay"] === "function" && typeof v["timeZone"] === "string";
const ON_HOLIDAY_RULES: readonly HolidayOverlapPolicy[] = [
  "under-holiday",
  "over-holiday",
  "after-holiday",
];
const isDayOfMonth = (v: unknown): boolean =>
  v === -1 || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31);
const isMonth = (v: unknown): boolean =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;

/** 単独の値または空でない配列を検証し、集合にする（誤りは c に記録して undefined） */
function checkSet(
  c: IssueCollector,
  path: string,
  raw: unknown,
  valid: (v: unknown) => boolean,
  expected: string,
): Set<number> | undefined {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0 || !list.every(valid)) {
    c.error("invalid-option", path, `must be ${expected}, or a non-empty array of them`);
    return undefined;
  }
  return new Set(list as number[]);
}

/** @internal 繰り返しの規則を検証して取り込む */
export function compileRecurringRules<Value>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: (entry: Record<string, unknown>, path: string) => Value | undefined,
  keys: readonly string[],
  context: "calendar" | "schedule",
  writtenPath: string = path,
  jp: JpUsage = "none",
): RecurringRuleCompiled<Value>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: RecurringRuleCompiled<Value>[] = [];
  entries.forEach((rawEntry: unknown, i) => {
    const p = `${path}[${i}]`;
    if (!isObject(rawEntry)) {
      c.error("invalid-option", p, "must be an object");
      return;
    }
    const written = `${writtenPath}[${i}]`;
    const entry = renameKeys(c, ["rule"], written, rawEntry);
    const nationalOfJp =
      jp !== "none" && reportNational(c, `${written}.kinds`, entry["kinds"], jp === "mixed");
    checkUnknownKeys(c, p, entry, keys);
    const value = valueOf(entry, p);
    const name = checkName(c, p, entry["name"]);
    const hasWeekday = "weekday" in entry;
    const hasDay = "dayOfMonth" in entry;
    const hasAfter = "dayAfterHoliday" in entry;
    const hasBefore = "dayBeforeHoliday" in entry;
    const hasHoliday = "holiday" in entry;
    const hasBusinessMonth = "businessDayOfMonth" in entry;
    const hasBusinessWeek = "businessDayOfWeek" in entry;
    const hasBusinessDay = hasBusinessMonth || hasBusinessWeek;
    const hasCycle = "cycle" in entry;
    const holidayBased = hasHoliday || hasAfter || hasBefore;
    if (
      Number(hasWeekday) +
        Number(hasDay) +
        Number(hasBusinessMonth) +
        Number(hasBusinessWeek) +
        Number(hasAfter) +
        Number(hasBefore) +
        Number(hasHoliday) +
        Number(hasCycle) !==
      1
    ) {
      c.error(
        "invalid-option",
        p,
        'must have exactly one of "weekday", "dayOfMonth", "businessDayOfMonth", "businessDayOfWeek", "dayAfterHoliday", "dayBeforeHoliday", "holiday" or "cycle"',
      );
      return;
    }
    let kinds: Set<string> | null = null;
    let ok = true;
    let weekday: Weekday | null = null;
    let nth: Set<number> | null = null;
    let days: Set<number> | null = null;
    let businessDays: Set<number> | null = null;
    let weekStart: number | null = null;
    let basis: BasisOfMonth | null = null;
    let basisCalendar: Calendar | null = null;
    let interval: number | null = null;
    let anchor: number | null = null;
    let cycle: number | null = null;
    let positions: Set<number> | null = null;
    const hasInterval = "interval" in entry;
    const hasAnchor = "anchor" in entry;
    if (hasWeekday) {
      if (isWeekday(entry["weekday"])) weekday = entry["weekday"];
      else {
        c.error(
          "invalid-weekday",
          `${p}.weekday`,
          "must be an integer from 0 (Sunday) to 6 (Saturday)",
        );
        ok = false;
      }
      if (entry["nth"] !== undefined) {
        const set = checkSet(
          c,
          `${p}.nth`,
          entry["nth"],
          (v) => NTH_VALUES.includes(v as number),
          "1-5 or -1 (last)",
        );
        if (set) nth = set;
        else ok = false;
      }
      if (hasInterval !== hasAnchor) {
        c.error("invalid-option", p, '"interval" and "anchor" must be specified together');
        ok = false;
      } else if (hasInterval) {
        if ("nth" in entry) {
          c.error("invalid-option", `${p}.interval`, '"interval" cannot be used with "nth"');
          ok = false;
        }
        const i = entry["interval"];
        if (!Number.isInteger(i) || (i as number) < 2) {
          c.error("invalid-option", `${p}.interval`, "must be an integer of 2 or more (weeks)");
          ok = false;
        } else interval = i as number;
        const a = checkDate(c, `${p}.anchor`, entry["anchor"]);
        if (a === undefined) ok = false;
        else if (weekday !== null && weekdayOf(entry["anchor"] as DateString) !== weekday) {
          c.error(
            "invalid-option",
            `${p}.anchor`,
            `must be on the same weekday as "weekday" (${String(entry["anchor"])} is weekday ${weekdayOf(entry["anchor"] as DateString)})`,
          );
          ok = false;
        } else anchor = a;
      }
    } else {
      for (const key of ["nth", "interval"] as const) {
        if (key in entry) {
          c.error("invalid-option", `${p}.${key}`, `"${key}" can be used only with "weekday"`);
          ok = false;
        }
      }
      if (hasAnchor && !hasCycle) {
        c.error(
          "invalid-option",
          `${p}.anchor`,
          '"anchor" can be used only with "weekday" or "cycle"',
        );
        ok = false;
      }
      if (hasCycle) {
        const length = entry["cycle"];
        if (!Number.isInteger(length) || (length as number) < 2) {
          c.error("invalid-option", `${p}.cycle`, "must be an integer of 2 or more (days)");
          ok = false;
        } else cycle = length as number;
        if (!hasAnchor) {
          c.error(
            "invalid-option",
            p,
            '"anchor" is required with "cycle" (the first day of the cycle)',
          );
          ok = false;
        } else {
          const a = checkDate(c, `${p}.anchor`, entry["anchor"]);
          if (a === undefined) ok = false;
          else anchor = a;
        }
        const raw = entry["positions"];
        if (!Array.isArray(raw) || raw.length === 0) {
          c.error(
            "invalid-option",
            `${p}.positions`,
            "must be a non-empty array of days in the cycle (1 = the anchor day)",
          );
          ok = false;
        } else if (cycle !== null) {
          const n = cycle;
          if (!raw.every((v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= n)) {
            c.error(
              "invalid-option",
              `${p}.positions`,
              `must be integers from 1 to ${n} (the cycle)`,
            );
            ok = false;
          } else if (new Set(raw).size !== raw.length) {
            c.error("invalid-option", `${p}.positions`, "must not contain the same day twice");
            ok = false;
          } else if (raw.length === n) {
            c.error(
              "invalid-option",
              `${p}.positions`,
              "must not contain every day of the cycle (the rule would match every day)",
            );
            ok = false;
          } else positions = new Set(raw as number[]);
        }
        if (entry["holidayOverlapPolicy"] === "after-holiday") {
          c.error(
            "invalid-option",
            `${p}.holidayOverlapPolicy`,
            '"after-holiday" cannot be used with "cycle" (shifting a day of the cycle has no meaning; use "under-holiday" or "over-holiday")',
          );
          ok = false;
        }
      } else if (hasDay) {
        const set = checkSet(
          c,
          `${p}.dayOfMonth`,
          entry["dayOfMonth"],
          isDayOfMonth,
          "1-31 or -1 (last day)",
        );
        if (set) days = set;
        else ok = false;
      } else if (hasBusinessDay) {
        const key = hasBusinessMonth ? "businessDayOfMonth" : "businessDayOfWeek";
        const set = hasBusinessMonth
          ? checkSet(
              c,
              `${p}.businessDayOfMonth`,
              entry["businessDayOfMonth"],
              isBusinessDayOfMonth,
              "1-31 or -1 (last business day) to -31",
            )
          : checkSet(
              c,
              `${p}.businessDayOfWeek`,
              entry["businessDayOfWeek"],
              isBusinessDayOfWeek,
              "1-7 or -1 (last business day) to -7",
            );
        if (set) businessDays = set;
        else ok = false;
        if (hasBusinessWeek) {
          if (isWeekday(entry["weekStart"])) weekStart = entry["weekStart"];
          else {
            c.error(
              "invalid-option",
              `${p}.weekStart`,
              'is required with "businessDayOfWeek": an integer from 0 (Sunday) to 6 (Saturday) (the first day of the week)',
            );
            ok = false;
          }
        }
        if (entry["holidayOverlapPolicy"] === "after-holiday") {
          c.error(
            "invalid-option",
            `${p}.holidayOverlapPolicy`,
            `"after-holiday" cannot be used with "${key}" (shifting the nth business day has no meaning; use "under-holiday" or "over-holiday")`,
          );
          ok = false;
        }
        if (context === "calendar") {
          if ("calendar" in entry) {
            c.error(
              "invalid-option",
              `${p}.calendar`,
              '"calendar" cannot be used in a calendar (the counting basis is the calendar\'s own options without recurring rules)',
            );
            ok = false;
          }
        } else if (!isCalendarLike(entry["calendar"])) {
          c.error(
            "invalid-option",
            `${p}.calendar`,
            "must be a calendar made with createCalendar (the basis for counting business days; required in a schedule)",
          );
          ok = false;
        } else {
          const calendar = entry["calendar"];
          basisCalendar = calendar;
          basis = basisFromPredicate((date) => calendar.isBusinessDay(date));
        }
      } else {
        const key = hasAfter ? "dayAfterHoliday" : hasBefore ? "dayBeforeHoliday" : "holiday";
        if (entry[key] !== true) {
          c.error("invalid-option", `${p}.${key}`, "must be true");
          ok = false;
        }
        if ("holidayOverlapPolicy" in entry) {
          c.error(
            "invalid-option",
            `${p}.holidayOverlapPolicy`,
            hasAfter
              ? 'cannot be used with "dayAfterHoliday" (the day after a holiday is never a holiday)'
              : hasBefore
                ? 'cannot be used with "dayBeforeHoliday" (the day before a holiday is never a holiday)'
                : 'cannot be used with "holiday" (the rule applies on holidays; it is judged before holidayPolicy)',
          );
          ok = false;
        }
        if (entry["kinds"] !== undefined && !Array.isArray(entry["kinds"])) {
          c.error(
            "invalid-option",
            `${p}.kinds`,
            "must be a non-empty array of holiday kinds (Holiday.kind)",
          );
          ok = false;
        } else if (entry["kinds"] !== undefined) {
          const set = checkSet(
            c,
            `${p}.kinds`,
            entry["kinds"],
            (v) => typeof v === "string" && v.length > 0,
            "a non-empty string (Holiday.kind)",
          );
          if (set) kinds = set as unknown as Set<string>;
          else ok = false;
        }
      }
    }
    if (!hasBusinessDay && "calendar" in entry) {
      c.error(
        "invalid-option",
        `${p}.calendar`,
        '"calendar" can be used only with "businessDayOfMonth" or "businessDayOfWeek"',
      );
      ok = false;
    }
    if (!hasBusinessWeek && "weekStart" in entry) {
      c.error(
        "invalid-option",
        `${p}.weekStart`,
        '"weekStart" can be used only with "businessDayOfWeek"',
      );
      ok = false;
    }
    if (!hasCycle && "positions" in entry) {
      c.error("invalid-option", `${p}.positions`, '"positions" can be used only with "cycle"');
      ok = false;
    }
    if (!holidayBased && "kinds" in entry) {
      c.error(
        "invalid-option",
        `${p}.kinds`,
        '"kinds" can be used only with "holiday", "dayAfterHoliday" or "dayBeforeHoliday"',
      );
      ok = false;
    }
    let holidayKeys: Set<string> | null = null;
    if ("keys" in entry) {
      if (!holidayBased) {
        c.error(
          "invalid-option",
          `${p}.keys`,
          '"keys" can be used only with "holiday", "dayAfterHoliday" or "dayBeforeHoliday"',
        );
        ok = false;
      } else if (!Array.isArray(entry["keys"])) {
        c.error(
          "invalid-option",
          `${p}.keys`,
          "must be a non-empty array of holiday keys (Holiday.key)",
        );
        ok = false;
      } else {
        const set = checkSet(
          c,
          `${p}.keys`,
          entry["keys"],
          (v) => typeof v === "string" && HOLIDAY_KEY_PATTERN.test(v),
          "a holiday key (Holiday.key: lowercase letters, digits and hyphens)",
        );
        if (set) holidayKeys = set as unknown as Set<string>;
        else ok = false;
      }
    }
    let weekdays: Set<number> | null = null;
    if ("weekdays" in entry) {
      if (!holidayBased) {
        c.error(
          "invalid-option",
          `${p}.weekdays`,
          '"weekdays" can be used only with "holiday", "dayAfterHoliday" or "dayBeforeHoliday"',
        );
        ok = false;
      } else if (!Array.isArray(entry["weekdays"])) {
        c.error(
          "invalid-option",
          `${p}.weekdays`,
          "must be a non-empty array of weekdays (0 = Sunday to 6 = Saturday)",
        );
        ok = false;
      } else {
        const set = checkSet(
          c,
          `${p}.weekdays`,
          entry["weekdays"],
          isWeekday,
          "a weekday (0 = Sunday to 6 = Saturday)",
        );
        if (set) weekdays = set;
        else ok = false;
      }
    }
    let months: Set<number> | null = null;
    if (entry["months"] !== undefined) {
      if (!Array.isArray(entry["months"])) {
        c.error("invalid-option", `${p}.months`, "must be a non-empty array of months (1-12)");
        ok = false;
      } else {
        const set = checkSet(c, `${p}.months`, entry["months"], isMonth, "a month (1-12)");
        if (set) months = set;
        else ok = false;
      }
    }
    // 祝日の規則は「祝日の上」の段階で判定する（当てはまる日は祝日なので、祝日の下・振替は意味を持たない）
    const onHoliday =
      entry["holidayOverlapPolicy"] ?? (hasHoliday ? "over-holiday" : "under-holiday");
    if (!ON_HOLIDAY_RULES.includes(onHoliday as HolidayOverlapPolicy)) {
      c.error(
        "invalid-option",
        `${p}.holidayOverlapPolicy`,
        `must be one of ${ON_HOLIDAY_RULES.map((v) => `"${v}"`).join(", ")}`,
      );
      ok = false;
    }
    let skipWeekdays: Set<number> | null = null;
    if ("skipWeekdays" in entry) {
      const aroundHoliday = hasAfter || hasBefore;
      if (
        !aroundHoliday &&
        (entry["holidayOverlapPolicy"] !== "after-holiday" || !(hasWeekday || hasDay))
      ) {
        c.error(
          "invalid-option",
          `${p}.skipWeekdays`,
          '"skipWeekdays" can be used only with "dayAfterHoliday", "dayBeforeHoliday", or holidayOverlapPolicy: "after-holiday" on a "weekday" or "dayOfMonth" rule',
        );
        ok = false;
      } else if (!Array.isArray(entry["skipWeekdays"])) {
        c.error(
          "invalid-option",
          `${p}.skipWeekdays`,
          "must be a non-empty array of weekdays (0 = Sunday to 6 = Saturday)",
        );
        ok = false;
      } else {
        const set = checkSet(
          c,
          `${p}.skipWeekdays`,
          entry["skipWeekdays"],
          isWeekday,
          "a weekday (0 = Sunday to 6 = Saturday)",
        );
        if (set === undefined) ok = false;
        else if (set.size === 7) {
          c.error(
            "invalid-option",
            `${p}.skipWeekdays`,
            "cannot include every weekday (no day would be left)",
          );
          ok = false;
        } else if (weekday !== null && set.has(weekday)) {
          c.error(
            "invalid-option",
            `${p}.skipWeekdays`,
            `cannot include the rule's own weekday ${weekday} (the rule would be shifted every time)`,
          );
          ok = false;
        } else skipWeekdays = set;
      }
    }
    const period = checkPeriod(c, p, entry);
    if (ok && period && value !== undefined) {
      rules.push(
        Object.freeze({
          path: p,
          weekday,
          nth,
          interval,
          anchor,
          cycle,
          positions,
          days,
          businessDays,
          weekStart,
          basis,
          calendar: basisCalendar,
          skipWeekdays,
          dayAfterHoliday: hasAfter,
          dayBeforeHoliday: hasBefore,
          holiday: hasHoliday,
          kinds,
          nationalOfJp,
          keys: holidayKeys,
          weekdays,
          months,
          holidayOverlapPolicy: onHoliday as HolidayOverlapPolicy,
          value,
          name,
          ...period,
        }),
      );
    }
  });
  return rules;
}

/** @internal その日の祝日を返す関数（祝日・祝日の翌日・祝前日の規則の判定に使う。提供元の対応年の外は祝日でないとみなすこと） */
export type HolidayOf = (date: DateString) => Holiday<string> | undefined;

/** @internal その日の祝日（HolidayOf が返したもの）が、ID が "JP" の提供元のものか */
export type FromJp = (date: DateString) => boolean;

/**
 * @internal 繰り返しの規則の形（曜日・第 n 回目・周期・日・第 n 営業日・祝日・祝日の翌日・祝前日・月）がその日に当てはまるか。
 * 有効期間は考えない（規則の診断で、形どうしの包含を調べるために分けている）。
 * 祝日に従属する規則は holidayOf で判定し、holidayOf を渡さなければ当てはまらない。
 * 第 n 営業日の規則は、規則自身の基準（スケジュールの calendar）か basis で数え、どちらもなければ当てはまらない
 */
export function matchPattern(
  rule: RecurringRuleCompiled<unknown>,
  date: DateString,
  holidayOf?: HolidayOf,
  basis?: BasisOfMonth,
  fromJp?: FromJp,
): boolean {
  const { year, month, day } = parseDate(date);
  if (rule.months && !rule.months.has(month)) return false;
  if (rule.businessDays) {
    // 第 n 営業日: 規則自身の基準（スケジュールの calendar）か、呼び出し側の基準（カレンダーの「繰り返しの規則を除いた判定」）で数える
    const b = rule.basis ?? basis;
    if (b === undefined) return false;
    if (rule.weekStart !== null) {
      // 週の第 n 営業日: weekStart の曜日から 7 日間の、基準で営業日である日を数える（月をまたぐ週は両方の月の基準を見る）
      const start = addDays(date, -((weekdayOf(date) - rule.weekStart + 7) % 7));
      const week: DateString[] = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        const at = parseDate(d);
        if (b(at.year, at.month).includes(at.day)) week.push(d);
      }
      const at = week.indexOf(date);
      if (at < 0) return false;
      return rule.businessDays.has(at + 1) || rule.businessDays.has(at - week.length);
    }
    const days = b(year, month);
    const index = days.indexOf(day);
    if (index < 0) return false;
    return rule.businessDays.has(index + 1) || rule.businessDays.has(index - days.length);
  }
  if (rule.holiday || rule.dayAfterHoliday || rule.dayBeforeHoliday) {
    if (holidayOf === undefined) return false;
    if (rule.weekdays && !rule.weekdays.has(weekdayOf(date))) return false;
    const selected = (h: Holiday<string>): boolean =>
      (rule.kinds === null ||
        rule.kinds.has(h.kind) ||
        (rule.nationalOfJp && h.kind === "regular" && fromJp?.(h.date) === true)) &&
      (rule.keys === null || (h.key !== undefined && rule.keys.has(h.key)));
    if (rule.holiday) {
      const h = holidayOf(date);
      return h !== undefined && selected(h);
    }
    // 祝日の翌日は前日が祝日、祝前日は翌日が祝日（どちらもその日自身は祝日でない）。
    // skipWeekdays があれば、祝日とその曜日が続く塊の前後の日で、絞り込みは塊の中で最も近い祝日に当てる
    const skip = rule.skipWeekdays;
    if (holidayOf(date) !== undefined || skip?.has(weekdayOf(date))) return false;
    const step = rule.dayAfterHoliday ? -1 : 1;
    for (let k = 1; k <= MAX_HOLIDAY_RUN; k++) {
      const next = addDays(date, step * k);
      const h = holidayOf(next);
      if (h !== undefined) return selected(h);
      if (!skip?.has(weekdayOf(next))) return false;
    }
    return false;
  }
  if (rule.cycle !== null) {
    const offset = (toDayNumber(date) - rule.anchor!) % rule.cycle;
    return rule.positions!.has(((offset + rule.cycle) % rule.cycle) + 1);
  }
  const dim = lengthOfMonth(year, month);
  if (rule.weekday !== null) {
    if (weekdayOf(date) !== rule.weekday) return false;
    if (rule.interval !== null)
      return (toDayNumber(date) - rule.anchor!) % (7 * rule.interval) === 0;
    if (rule.nth === null) return true;
    return rule.nth.has(Math.ceil(day / 7)) || (rule.nth.has(-1) && day + 7 > dim);
  }
  return rule.days!.has(day) || (rule.days!.has(-1) && day === dim);
}

/** @internal 繰り返しの規則がその日に当てはまるか（有効期間を含む） */
export function matchRecurring(
  rule: RecurringRuleCompiled<unknown>,
  date: DateString,
  holidayOf: HolidayOf,
  basis?: BasisOfMonth,
  fromJp?: FromJp,
): boolean {
  return inPeriod(rule, toDayNumber(date)) && matchPattern(rule, date, holidayOf, basis, fromJp);
}

/**
 * @internal 第 n 営業日の規則が自分の設定を基準にする場合の基準を作る（繰り返しの規則をすべて除いた判定で営業日か）。
 * 基準が要らない設定（第 n 営業日の規則がない、またはすべて calendar を持つ）では undefined
 */
export function createBasis<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  lookup: HolidayLookupInternal<Kind>,
): BasisOfMonth | undefined {
  if (!compiled.recurring.some((r) => r.businessDays !== null && r.basis === null))
    return undefined;
  const resolve = createResolver({ ...compiled, recurring: [] }, lookup);
  return basisFromPredicate((date) => resolve(date).day.value === true);
}

/** 規則の value を取り出す（value が必須の規則用） */
function requiredValue<Value>(c: IssueCollector) {
  return (entry: Record<string, unknown>, path: string): Value | undefined => {
    if (!("value" in entry)) {
      c.error("invalid-option", path, 'must have "value"');
      return undefined;
    }
    return entry["value"] as Value;
  };
}

function validateProvider(c: IssueCollector, path: string, p: unknown): p is HolidayProvider {
  const bad = (message: string): false => {
    c.error("invalid-provider", path, message);
    return false;
  };
  if (!isObject(p)) return bad("must be a holiday provider object");
  if (typeof p["id"] !== "string" || p["id"] === "") return bad('"id" must be a non-empty string');
  if (typeof p["timeZone"] !== "string") return bad('"timeZone" must be a string');
  try {
    validateTimeZone(p["timeZone"]);
  } catch {
    return bad(`"timeZone" is not a valid IANA time zone: ${JSON.stringify(p["timeZone"])}`);
  }
  const years = p["supportedYears"];
  if (
    !isObject(years) ||
    !Number.isInteger(years["from"]) ||
    !Number.isInteger(years["to"]) ||
    (years["from"] as number) < 1000 ||
    (years["to"] as number) > 9999 ||
    (years["from"] as number) > (years["to"] as number)
  ) {
    return bad(
      '"supportedYears" must be { from, to } with integer years in 1000-9999 and from <= to',
    );
  }
  if (typeof p["dataVersion"] !== "string") return bad('"dataVersion" must be a string');
  if (p["confirmedThrough"] !== undefined && !Number.isInteger(p["confirmedThrough"])) {
    return bad('"confirmedThrough" must be an integer year');
  }
  if (typeof p["holidaysInYear"] !== "function") return bad('"holidaysInYear" must be a function');
  return true;
}

/** @internal 祝日の提供元とタイムゾーンの設定を検証した結果 */
export interface HolidaySource<Kind extends string> {
  readonly providers: readonly HolidayProvider<Kind>[];
  readonly timeZone: string;
  readonly outOfRangePolicy: "throw" | "ignore";
  readonly unconfirmedHolidayPolicy: "accept" | "throw";
}

/**
 * @internal 日本の祝日の提供元（ID が "JP"。包んだものを含む）の使い方（kinds の旧名 "national" の扱いを決めるため）。
 * "mixed" はほかの ID の提供元と合わせて使う設定
 */
export type JpUsage = "none" | "only" | "mixed";

/**
 * kinds の "national"（0.30.0 で日本の提供元の種別は "regular" に改名）を見つけたら deprecated-option を記録し、
 * 見つけたかを返す。値は読み替えず、判定で日本の提供元が返した "regular" の祝日にも当てる（docs/decisions.md の 54 番）。
 * mixed（ほかの提供元と合わせた設定）では印を付け、当てている祝日と 1.0.0 での扱いは診断で添える
 * （作成時は警告を使わないので、長い文をルートに持たない）
 */
function reportNational(c: IssueCollector, path: string, kinds: unknown, mixed: boolean): boolean {
  if (!Array.isArray(kinds)) return false;
  const { from, to } = RENAMED_VALUES.find((r) => r.key === "kinds")!;
  let found = false;
  kinds.forEach((v, i) => {
    if (v !== from) return;
    found = true;
    c.issues.push({
      severity: "warning",
      code: "deprecated-option",
      path: `${path}[${i}]`,
      message: `"${from}" was renamed to "${to}" in 0.30.0`,
      ...(mixed ? { nationalInUnion: true } : {}),
    });
  });
  return found;
}

/** @internal 設定の祝日の提供元の、日本の提供元の使い方 */
export function jpUsage(source: HolidaySource<string>): JpUsage {
  const jp = source.providers.filter((p) => p.id === "JP").length;
  return jp === 0 ? "none" : jp === source.providers.length ? "only" : "mixed";
}

/** @internal 祝日の提供元とタイムゾーンの設定を検証する */
export function compileHolidaySource<Kind extends string>(
  c: IssueCollector,
  options: Record<string, unknown>,
): HolidaySource<Kind> {
  const raw = options["holidayProvider"];
  const list: unknown[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const providers: HolidayProvider<Kind>[] = [];
  list.forEach((p, i) => {
    const path = Array.isArray(raw) ? `holidayProvider[${i}]` : "holidayProvider";
    if (validateProvider(c, path, p)) providers.push(p as HolidayProvider<Kind>);
  });

  let timeZone = "UTC";
  if (options["timeZone"] !== undefined) {
    try {
      timeZone = validateTimeZone(options["timeZone"] as string);
    } catch {
      c.error(
        "invalid-time-zone",
        "timeZone",
        `Invalid time zone: ${JSON.stringify(options["timeZone"])}`,
      );
    }
  } else {
    const zones = [...new Set(providers.map((p) => validateTimeZone(p.timeZone)))];
    if (zones.length > 1) {
      c.error(
        "time-zone-conflict",
        "timeZone",
        `Holiday providers use different time zones (${zones.join(", ")}); specify timeZone`,
      );
    }
    timeZone = zones[0] ?? "UTC";
  }

  const outOfRangePolicy = options["outOfRangePolicy"] ?? "throw";
  if (outOfRangePolicy !== "throw" && outOfRangePolicy !== "ignore") {
    c.error("invalid-option", "outOfRangePolicy", 'must be "throw" or "ignore"');
  }
  const unconfirmed = options["unconfirmedHolidayPolicy"] ?? "accept";
  if (unconfirmed !== "accept" && unconfirmed !== "throw") {
    c.error("invalid-option", "unconfirmedHolidayPolicy", 'must be "accept" or "throw"');
  }
  return {
    providers: Object.freeze(providers),
    timeZone,
    outOfRangePolicy: outOfRangePolicy === "ignore" ? "ignore" : "throw",
    unconfirmedHolidayPolicy: unconfirmed === "throw" ? "throw" : "accept",
  };
}

// ------------------------------------------------------------
// 祝日を調べる機能
// ------------------------------------------------------------

function providerDataError(provider: HolidayProvider, year: number, message: string): RangeError {
  return rangeError(
    "invalid-provider-data" satisfies KnownErrorCode,
    `Holiday provider ${provider.id} returned invalid data for ${year}: ${message}`,
  );
}

/** 提供元が返したデータを検証し、契約の項目だけを持つ変更できないオブジェクトにする */
function loadProviderYear<Kind extends string>(
  provider: HolidayProvider<Kind>,
  year: number,
): Holiday<Kind>[] {
  const list: unknown = provider.holidaysInYear(year);
  if (!Array.isArray(list))
    throw providerDataError(provider, year, "holidaysInYear must return an array");
  const seen = new Set<string>();
  return list.map((h: unknown, i) => {
    if (!isObject(h)) throw providerDataError(provider, year, `item ${i} is not an object`);
    const { date, name, nameEn, kind, confirmed } = h;
    if (!isValidDate(date) || parseDate(date).year !== year) {
      throw providerDataError(
        provider,
        year,
        `item ${i} has an invalid date ${JSON.stringify(date)}`,
      );
    }
    if (seen.has(date)) throw providerDataError(provider, year, `duplicate date ${date}`);
    seen.add(date);
    if (typeof name !== "string" || typeof nameEn !== "string" || typeof kind !== "string") {
      throw providerDataError(
        provider,
        year,
        `item ${i} (${date}) must have string name, nameEn and kind`,
      );
    }
    if (typeof confirmed !== "boolean") {
      throw providerDataError(provider, year, `item ${i} (${date}) must have boolean confirmed`);
    }
    const holiday: { -readonly [K in keyof Holiday<Kind>]: Holiday<Kind>[K] } = {
      date,
      name,
      nameEn,
      kind: kind as Kind,
      confirmed,
    };
    if (h["names"] !== undefined) {
      const problem = checkNames(h["names"]);
      if (problem) throw providerDataError(provider, year, `item ${i} (${date}) names: ${problem}`);
      holiday.names = Object.freeze(Object.fromEntries(Object.entries(h["names"] as object)));
    }
    if (h["key"] !== undefined) {
      if (typeof h["key"] !== "string" || !HOLIDAY_KEY_PATTERN.test(h["key"])) {
        throw providerDataError(
          provider,
          year,
          `item ${i} (${date}) key must match ${String(HOLIDAY_KEY_PATTERN)}: ${JSON.stringify(h["key"])}`,
        );
      }
      holiday.key = h["key"];
    }
    return Object.freeze(holiday);
  });
}

/** 祝日のほかの言語の名称を検証する（誤りがあれば理由を返す） */
function checkNames(names: unknown): string | undefined {
  // 普通のオブジェクト（別の実行環境で作られたものも可）。継承した項目を持つものは受け付けない
  const proto: unknown = isObject(names) ? Object.getPrototypeOf(names) : undefined;
  if (!isObject(names) || (proto !== null && Object.getPrototypeOf(proto) !== null)) {
    return "must be a plain object of { [language tag]: name }";
  }
  for (const [tag, value] of Object.entries(names)) {
    let canonical: string | undefined;
    try {
      canonical = Intl.getCanonicalLocales(tag)[0];
    } catch {
      return `${JSON.stringify(tag)} is not a BCP 47 language tag`;
    }
    if (canonical !== tag) {
      return `${JSON.stringify(tag)} must be written in canonical form ${JSON.stringify(canonical)}`;
    }
    if (typeof value !== "string" || value === "") {
      return `${JSON.stringify(tag)} must be a non-empty string`;
    }
  }
  return undefined;
}

/** @internal 祝日を調べる機能を作る（設定は検証済みであること） */
export function createHolidayLookup<Kind extends string>(
  source: HolidaySource<Kind>,
): HolidayLookup<Kind> & {
  holidayOfDate(date: DateString): Holiday<Kind> | undefined;
  fromJp: FromJp;
} {
  const { providers, timeZone, outOfRangePolicy, unconfirmedHolidayPolicy } = source;
  const yearCache = new Map<number, Map<DateString, Holiday<Kind>>>();
  /** 年ごとの、ID が "JP" の提供元の祝日が残った日付（同じ日に複数の提供元の祝日があれば先の提供元のもの） */
  const jpCache = new Map<number, Set<DateString>>();

  function holidayMap(year: number): Map<DateString, Holiday<Kind>> {
    let map = yearCache.get(year);
    if (!map) {
      map = new Map();
      const jpDates = new Set<DateString>();
      for (const provider of providers) {
        const { from, to } = provider.supportedYears;
        if (year < from || year > to) {
          if (outOfRangePolicy === "ignore") continue;
          throw rangeError(
            "out-of-range",
            `Holidays for ${provider.id} are supported for ${from}-${to}; requested ${year}`,
          );
        }
        for (const h of loadProviderYear(provider, year)) {
          // 同じ日に複数の提供元の祝日がある場合は、先に渡した提供元を優先する
          if (map.has(h.date)) continue;
          map.set(h.date, h);
          if (provider.id === "JP") jpDates.add(h.date);
        }
      }
      yearCache.set(year, map);
      jpCache.set(year, jpDates);
    }
    return map;
  }

  function holidayOfDate(date: DateString): Holiday<Kind> | undefined {
    if (providers.length === 0) return undefined;
    const h = holidayMap(parseDate(date).year).get(date);
    // 判定に使う祝日が未確定なら止める（holidaysInYear・holidaysBetween はこの経路を通らないので投げない）
    if (h !== undefined && unconfirmedHolidayPolicy === "throw" && !h.confirmed) {
      // どの提供元の予測かを添える（提供元の confirmedThrough は、利用者が再計算の時期を知る手がかり）
      const year = parseDate(date).year;
      const provider = providers.find(
        (p) =>
          year >= p.supportedYears.from &&
          year <= p.supportedYears.to &&
          loadProviderYear(p, year).some((x) => x.date === date && !x.confirmed),
      );
      const through =
        provider?.confirmedThrough === undefined
          ? ""
          : ` (${provider.id} is confirmed through ${provider.confirmedThrough})`;
      throw rangeError(
        "unconfirmed-holiday",
        `${date} ${h.name} is not yet confirmed${through}; the result would depend on a predicted holiday`,
      );
    }
    return h;
  }

  const dateOf = (input: DateInput): DateString => toCivil(input, timeZone).date;

  function holidaysInYear(year: number): readonly Holiday<Kind>[] {
    if (!Number.isInteger(year)) throw rangeError("invalid-argument", `Invalid year: ${year}`);
    return Object.freeze(
      [...holidayMap(year).values()].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
      ),
    );
  }

  return {
    timeZone,
    providers,
    outOfRangePolicy,
    unconfirmedHolidayPolicy,
    outOfRange: outOfRangePolicy,
    unconfirmedHolidays: unconfirmedHolidayPolicy,
    holidayOfDate,
    fromJp: (date) => jpCache.get(parseDate(date).year)?.has(date) === true,
    dateOf,
    civilOf: ((input: DateInput) =>
      toDateTimeParts(input, timeZone)) as HolidayLookup<Kind>["civilOf"],
    instantOf: (date, time) => toInstant(date, time, timeZone),
    today: (now = new Date()) => instantToCivil(now.getTime(), timeZone).date,
    isHoliday: (input) => holidayOfDate(dateOf(input)) !== undefined,
    holidayOn: (input) => holidayOfDate(dateOf(input)),
    getHoliday: (input) => holidayOfDate(dateOf(input)),
    holidaysInYear,
    holidaysBetween(from, to) {
      const a = dateOf(from);
      const b = dateOf(to);
      if (a > b) throw rangeError("invalid-range", `"from" must not be after "to" (${a} > ${b})`);
      const result: Holiday<Kind>[] = [];
      for (let y = parseDate(a).year; y <= parseDate(b).year; y++) {
        for (const h of holidaysInYear(y)) if (h.date >= a && h.date <= b) result.push(h);
      }
      return Object.freeze(result);
    },
  };
}

// ------------------------------------------------------------
// スケジュールの組み立て
// ------------------------------------------------------------

/** @internal 検証済みのスケジュールの規則 */
export interface CompiledSchedule<Value, Kind extends string> {
  readonly source: HolidaySource<Kind>;
  readonly weekly: readonly Value[];
  readonly holiday: ScheduleHolidayPolicy<Value>;
  readonly annual: readonly AnnualRule<Value>[];
  readonly dates: readonly DateRule<Value>[];
  readonly recurring: readonly RecurringRuleCompiled<Value>[];
}

const SCHEDULE_OPTION_KEYS = [
  "holidayProvider",
  "timeZone",
  "outOfRangePolicy",
  "unconfirmedHolidayPolicy",
  "weekdayValues",
  "holidayPolicy",
  "annualDates",
  "dates",
  "recurringRules",
];
/** @internal 繰り返しの規則の項目 */
/** @internal 有効期間の項目 */
export const PERIOD_KEYS = ["effectiveFrom", "effectiveTo"];
export const RECURRING_RULE_KEYS = [
  "weekday",
  "nth",
  "interval",
  "anchor",
  "dayOfMonth",
  "dayAfterHoliday",
  "dayBeforeHoliday",
  "holiday",
  "kinds",
  "keys",
  "weekdays",
  "months",
  "businessDayOfMonth",
  "businessDayOfWeek",
  "weekStart",
  "calendar",
  "skipWeekdays",
  "cycle",
  "positions",
  "name",
  "holidayOverlapPolicy",
  ...PERIOD_KEYS,
];

/** @internal スケジュールの設定を検証して取り込む（誤りは c に集める） */
export function compileScheduleOptions<Value, Kind extends string>(
  c: IssueCollector,
  options: unknown,
): CompiledSchedule<Value, Kind> | undefined {
  if (!isObject(options)) {
    c.error("invalid-option", "", "options must be an object");
    return undefined;
  }
  const written = options;
  const o = renameKeys(c, ["source", "schedule"], "", written);
  checkUnknownKeys(c, "", o, SCHEDULE_OPTION_KEYS);
  const source = compileHolidaySource<Kind>(c, o);

  const weeklyRaw = o["weekdayValues"];
  let weekly: readonly Value[] = [];
  if (!Array.isArray(weeklyRaw) || weeklyRaw.length !== 7) {
    c.error(
      "invalid-option",
      "weekdayValues",
      "must have 7 values ([Sunday, Monday, ..., Saturday])",
    );
  } else {
    weekly = Object.freeze([...(weeklyRaw as Value[])]);
  }

  let holiday: ScheduleHolidayPolicy<Value> = "ignore";
  const holidayRaw = renameValue(
    c,
    "schedule",
    "holidayPolicy",
    writtenKey(["source", "schedule"], written, "holidayPolicy"),
    o["holidayPolicy"],
  );
  if (holidayRaw === undefined || holidayRaw === "ignore") {
    holiday = "ignore";
  } else if (isObject(holidayRaw) && "sameAs" in holidayRaw) {
    if (isWeekday(holidayRaw["sameAs"])) holiday = Object.freeze({ sameAs: holidayRaw["sameAs"] });
    else
      c.error(
        "invalid-weekday",
        "holidayPolicy.sameAs",
        "must be an integer from 0 (Sunday) to 6 (Saturday)",
      );
  } else if (isObject(holidayRaw) && "value" in holidayRaw) {
    holiday = Object.freeze({ value: holidayRaw["value"] as Value });
  } else {
    c.error(
      "invalid-option",
      "holidayPolicy",
      'must be "ignore", { sameAs: weekday } or { value }',
    );
  }

  const annual = compileAnnualRules<Value>(
    c,
    "annualDates",
    o["annualDates"],
    requiredValue<Value>(c),
    false,
  );
  const dates = compileDateRules<Value>(c, "dates", o["dates"], requiredValue<Value>(c), false);
  const recurring = compileRecurringRules<Value>(
    c,
    "recurringRules",
    o["recurringRules"],
    requiredValue<Value>(c),
    [...RECURRING_RULE_KEYS, "value"],
    "schedule",
    writtenKey(["source", "schedule"], written, "recurringRules"),
    jpUsage(source),
  );
  // 第 n 営業日の規則の基準のカレンダーは、スケジュールと同じタイムゾーンであること（合成と同じ理由。瞬間の暦日が食い違うため）
  for (const rule of recurring) {
    if (rule.businessDays === null) continue;
    const entry = (o["recurringRules"] as Record<string, unknown>[])[
      Number(/\[(\d+)\]$/.exec(rule.path)![1])
    ]!;
    const tz = (entry["calendar"] as Calendar).timeZone;
    if (tz !== source.timeZone) {
      c.error(
        "time-zone-conflict",
        `${rule.path}.calendar`,
        `the calendar's time zone ${tz} differs from the schedule's ${source.timeZone}`,
      );
    }
  }
  return { source, weekly, holiday, annual, dates, recurring };
}

/** 振替元をさかのぼる日数と、祝日の翌日・祝前日の塊を調べる日数の上限（祝日と飛ばす曜日が続く日数。2019 年の大型連休でも 10 日） */
const MAX_HOLIDAY_RUN = 31;

/** @internal 毎年の月日の規則の形がその月日 "MM-DD" に当てはまるか（有効期間は考えない） */
export function matchMonthDay(rule: AnnualRule<unknown>, monthDay: string): boolean {
  return rule.from <= rule.to
    ? monthDay >= rule.from && monthDay <= rule.to
    : monthDay >= rule.from || monthDay <= rule.to;
}

/** @internal 毎年の月日の規則がその日に当てはまるか（有効期間を含む） */
export function matchAnnual(rule: AnnualRule<unknown>, date: DateString): boolean {
  return inPeriod(rule, toDayNumber(date)) && matchMonthDay(rule, date.slice(5));
}

/** @internal 値を決めた規則（祝日・曜日で決まった場合は null） */
export type DecidingRule<Value> =
  | DateRule<Value>
  | AnnualRule<Value>
  | RecurringRuleCompiled<Value>;

/** @internal 1 日分の結果と、値を決めた規則 */
export interface Resolution<Value, Kind extends string> {
  readonly day: ScheduleDayInfo<Value, Kind>;
  readonly rule: DecidingRule<Value> | null;
}

type HolidayLookupInternal<Kind extends string> = ReturnType<typeof createHolidayLookup<Kind>>;

/**
 * @internal 検証済みの規則から、1 日分の値と値を決めた規則を返す関数を作る。
 * 規則の診断では、規則を取り除いた版と結果を比べるために、祝日を調べる機能（lookup）を共有して作る
 */
export function createResolver<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
  lookup: HolidayLookupInternal<Kind>,
): (date: DateString) => Resolution<Value, Kind> {
  const { weekly, holiday: holidayRule, annual, dates, recurring } = compiled;
  const hasShift = recurring.some((r) => r.holidayOverlapPolicy === "after-holiday");
  const basis = createBasis(compiled, lookup);

  /**
   * 振替・祝日の前後の規則が見る隣の日の祝日。outOfRangePolicy: "throw" なら、隣の日が提供元の対応年の外でも
   * out-of-range を投げる（結果が分からない年に依存するため。"ignore" なら外は祝日なし）。docs/decisions.md の 54 番（D2）
   */
  const holidayOfNeighbour = (date: DateString): Holiday<Kind> | undefined =>
    lookup.holidayOfDate(date);
  const isHolidayOfNeighbour = (date: DateString): boolean =>
    holidayOfNeighbour(date) !== undefined;

  /**
   * "after-holiday" の規則が、date（祝日でない日）に振り替えられてきたか。
   * date の前日からさかのぼって祝日が続く間に、規則に当たる日があれば、その日付を返す
   */
  function shiftedOrigin(
    rule: RecurringRuleCompiled<Value>,
    date: DateString,
  ): DateString | undefined {
    for (let k = 1; k <= MAX_HOLIDAY_RUN; k++) {
      const prev = addDays(date, -k);
      // 飛ばす日は祝日と、skipWeekdays の曜日。それ以外の日に達したら、振替元はない
      if (!isHolidayOfNeighbour(prev) && !rule.skipWeekdays?.has(weekdayOf(prev))) return undefined;
      if (matchRecurring(rule, prev, holidayOfNeighbour, undefined, lookup.fromJp)) return prev;
    }
    return undefined;
  }

  return function resolve(date: DateString): Resolution<Value, Kind> {
    const dayNumber = toDayNumber(date);
    const weekday = weekdayOf(date);
    const holiday = lookup.holidayOfDate(date);
    const make = (
      value: Value,
      reason: KnownScheduleDayReason,
      rule: DecidingRule<Value> | null,
      name: string | undefined,
      shiftedFrom?: DateString,
    ): Resolution<Value, Kind> => {
      const result: {
        -readonly [K in keyof ScheduleDayInfo<Value, Kind>]: ScheduleDayInfo<Value, Kind>[K];
      } = {
        date,
        weekday,
        value,
        reason,
      };
      if (name !== undefined) result.name = name;
      if (holiday !== undefined) result.holiday = holiday;
      if (shiftedFrom !== undefined) result.shiftedFrom = shiftedFrom;
      if (rule !== null) result.optionPath = result.rulePath = rule.path;
      return { day: Object.freeze(result), rule };
    };

    // 1. 個別の日付  2. 毎年の月日
    const byDate = dates.find((r) => dayNumber >= r.from && dayNumber <= r.to);
    if (byDate) return make(byDate.value, "date", byDate, byDate.name);
    const byAnnual = annual.find((r) => matchAnnual(r, date));
    if (byAnnual) return make(byAnnual.value, "annual", byAnnual, byAnnual.name);

    if (holiday) {
      // 3. 祝日の上（"over-holiday"。祝日の規則 { holiday: true } もここ）
      const over = recurring.find(
        (r) =>
          r.holidayOverlapPolicy === "over-holiday" &&
          matchRecurring(r, date, holidayOfNeighbour, basis, lookup.fromJp),
      );
      if (over) return make(over.value, "recurring", over, over.name);
      // 4. 祝日
      if (holidayRule !== "ignore") {
        const value = "sameAs" in holidayRule ? weekly[holidayRule.sameAs] : holidayRule.value;
        return make(value as Value, "holiday", null, holiday.name);
      }
      // 祝日の扱いが「曜日どおり」なら、祝日の下（"under-holiday"）の規則も当てはまる。
      // "after-holiday" の規則は祝日には当てはめない（振り替える）
      const under = recurring.find(
        (r) =>
          r.holidayOverlapPolicy === "under-holiday" &&
          matchRecurring(r, date, holidayOfNeighbour, basis, lookup.fromJp),
      );
      if (under) return make(under.value, "recurring", under, under.name);
      return make(weekly[weekday] as Value, "weekday", null, undefined);
    }

    // 5. 繰り返しの規則（祝日でない日。配列で先に書いたものが優先）。振替先も同じ段階で判定する
    for (const rule of recurring) {
      // skipWeekdays の曜日には当てはめない（祝日と同じく振り替える）
      if (rule.skipWeekdays?.has(weekday)) continue;
      if (matchRecurring(rule, date, holidayOfNeighbour, basis, lookup.fromJp))
        return make(rule.value, "recurring", rule, rule.name);
      if (hasShift && rule.holidayOverlapPolicy === "after-holiday") {
        const origin = shiftedOrigin(rule, date);
        if (origin !== undefined) return make(rule.value, "recurring", rule, rule.name, origin);
      }
    }
    // 6. 曜日
    return make(weekly[weekday] as Value, "weekday", null, undefined);
  };
}

/** @internal 期間（両端を含む）の日ごとに fn を呼んだ結果。from が to より後ならエラー */
export function mapDays<R>(
  from: DateString,
  to: DateString,
  fn: (date: DateString) => R,
): readonly R[] {
  if (from > to) {
    throw rangeError("invalid-range", `"from" must not be after "to" (${from} > ${to})`);
  }
  const result: R[] = [];
  for (let n = toDayNumber(from); n <= toDayNumber(to); n++) result.push(fn(fromDayNumber(n)));
  return Object.freeze(result);
}

/**
 * @internal スケジュールの内部の判定（暦日の文字列を直接受け取る）。createCalendarFromSchedule が、公開メソッド
 * （入力の解析を通る）を経由せずに 1 日分の結果を得るために使う。スケジュールごとに作成時に登録する
 */
const INTERNAL_INFO = Symbol("bizdays-toolkit.scheduleInfo");

/** @internal スケジュールの内部の判定を取り出す（createSchedule が作ったものでなければ undefined） */
export function infoOfSchedule<Value, Kind extends string>(
  schedule: Schedule<Value, Kind>,
): ((date: DateString) => ScheduleDayInfo<Value, Kind>) | undefined {
  return (schedule as { [INTERNAL_INFO]?: (date: DateString) => ScheduleDayInfo<Value, Kind> })[
    INTERNAL_INFO
  ];
}

/** @internal 検証済みの規則からスケジュールを作る */
export function buildSchedule<Value, Kind extends string>(
  compiled: CompiledSchedule<Value, Kind>,
): Schedule<Value, Kind> {
  const lookup = createHolidayLookup(compiled.source);
  const resolve = createResolver(compiled, lookup);
  const info = (date: DateString): ScheduleDayInfo<Value, Kind> => resolve(date).day;

  const schedule: Schedule<Value, Kind> & { readonly [INTERNAL_INFO]: typeof info } = {
    // 内部の判定（createCalendarFromSchedule が使う）。Symbol の項目なので列挙されず、JSON にも出ない。
    // オブジェクトリテラルに含めるのは、あとから defineProperty や WeakMap で付けると作成が数 µs 遅くなるため
    [INTERNAL_INFO]: info,
    timeZone: lookup.timeZone,
    providers: lookup.providers,
    outOfRangePolicy: lookup.outOfRangePolicy,
    unconfirmedHolidayPolicy: lookup.unconfirmedHolidayPolicy,
    outOfRange: lookup.outOfRangePolicy,
    unconfirmedHolidays: lookup.unconfirmedHolidayPolicy,
    dateOf: lookup.dateOf,
    civilOf: lookup.civilOf,
    instantOf: lookup.instantOf,
    today: lookup.today,
    isHoliday: lookup.isHoliday,
    holidayOn: lookup.holidayOn,
    getHoliday: lookup.holidayOn,
    holidaysInYear: lookup.holidaysInYear,
    holidaysBetween: lookup.holidaysBetween,
    valueOn: (input) => info(lookup.dateOf(input)).value,
    dayInfoOn: (input) => info(lookup.dateOf(input)),
    dayInfo: (input) => info(lookup.dateOf(input)),
    daysBetween: (from, to) => mapDays(lookup.dateOf(from), lookup.dateOf(to), info),
  };
  return Object.freeze(schedule);
}

/**
 * 曜日・祝日・特定日の規則から、日ごとに値を返すスケジュールを作る。
 *
 * 設定は作る時点で複製されるので、あとから元の配列やオブジェクトを書き換えても結果は変わらない
 * （値 Value そのものは複製しない）。設定の誤りは code 付きの RangeError になる。
 * @public
 */
export function createSchedule<Value, Kind extends string = string>(
  options: ScheduleOptions<Value, Kind>,
): Schedule<Value, Kind> {
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<Value, Kind>(c, options);
  c.throwFirstError();
  return buildSchedule(compiled!);
}

/**
 * @deprecated 0.30.0 で ScheduleHolidayPolicy に改名した。1.0.0 で削除する
 * @public
 */
export type HolidayValueRule<Value> = ScheduleHolidayPolicy<Value> | "weekday";

/**
 * @deprecated 0.30.0 で HolidayOverlapPolicy に改名した。1.0.0 で削除する
 * @public
 */
export type OnHolidayRule = HolidayOverlapPolicy;

/**
 * @deprecated 0.30.0 で ScheduleRecurringRule に改名した。1.0.0 で削除する
 * @public
 */
export type RecurringValue<Value, Kind extends string = string> = ScheduleRecurringRule<
  Value,
  Kind
>;

/**
 * @deprecated 0.30.0 で ScheduleAnnualDate に改名した。1.0.0 で削除する
 * @public
 */
export type AnnualValue<Value> = ScheduleAnnualDate<Value>;

/**
 * @deprecated 0.30.0 で ScheduleAnnualRange に改名した。1.0.0 で削除する
 * @public
 */
export type AnnualRangeValue<Value> = ScheduleAnnualRange<Value>;

/**
 * @deprecated 0.30.0 で ScheduleSpecificDate に改名した。1.0.0 で削除する
 * @public
 */
export type DateValue<Value> = ScheduleSpecificDate<Value>;

/**
 * @deprecated 0.30.0 で ScheduleDateRange に改名した。1.0.0 で削除する
 * @public
 */
export type DateRangeValue<Value> = ScheduleDateRange<Value>;

/**
 * @deprecated 0.30.0 で ScheduleDayInfo に改名した。1.0.0 で削除する
 * @public
 */
export type ScheduleDay<Value, Kind extends string = string> = ScheduleDayInfo<Value, Kind>;

/**
 * @deprecated 0.30.0 で ScheduleDayReason に改名した。1.0.0 で削除する
 * @public
 */
export type ScheduleReason = ScheduleDayReason;

/**
 * @deprecated 0.30.0 で KnownScheduleDayReason に改名した。1.0.0 で削除する
 * @public
 */
export type KnownScheduleReason = KnownScheduleDayReason;
