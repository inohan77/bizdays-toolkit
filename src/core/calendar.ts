/**
 * 祝日と、会社・店舗の休業日を組み合わせた営業日カレンダー。
 * 1 日の判定の優先順位は docs/guide.md の「Business-day calendars」と docs/decisions.md の 11 番。
 *
 * 内部では、営業日かどうか（真偽値）を返すスケジュール（createSchedule）として作っている。
 * 営業日の探索・調整・月の営業日などの機能は buildCalendar に切り出し、作成済みのカレンダーを
 * 合成する combineCalendars（両方が営業している日・どちらかが営業している日）でも同じ実装を使う。
 */

import {
  addDays,
  lengthOfMonth,
  formatDate,
  fromDayNumber,
  toDayNumber,
  type DateString,
  type Weekday,
} from "./date.ts";
import { checkUnknownKeys, IssueCollector, plainError, rangeError } from "./errors.ts";
import { renameKeys, writtenKey } from "./renamed.ts";
import { parseTimeOfDay, toCivil, type DateInput } from "./input.ts";
import {
  checkClosingDay,
  closingDayIn,
  closingMonth as calendarClosingMonth,
  dayOfMonth,
  formatMonth,
  isDayOfMonthValue,
  parseMonth,
  shiftMonth,
  type MonthString,
} from "./month.ts";
import {
  buildSchedule,
  compileAnnualRules,
  compileDateRules,
  compileHolidaySource,
  compileRecurringRules,
  createHolidayLookup,
  infoOfSchedule,
  isWeekday,
  mapDays,
  RECURRING_RULE_KEYS,
  jpUsage,
  type CompiledSchedule,
  type DayOfMonth,
  type EffectivePeriod,
  type KnownScheduleDayReason,
  type RecurringRule,
  type HolidayLookup,
  type HolidaySourceOptions,
  type Schedule,
  type ScheduleDayInfo,
} from "./schedule.ts";
import type { Holiday, HolidayProvider } from "./types.ts";

/**
 * 祝日の扱い。
 * @public
 */
export type HolidayPolicy = "closed" | "open" | "ignore";

/**
 * 毎年の月日 "MM-DD"（名前付き・有効期間付きも可）。
 * @public
 */
export type AnnualDate =
  | string
  | ({ readonly date: string; readonly name?: string } & EffectivePeriod);
/**
 * 毎年の月日の期間（from > to なら年をまたぐ。例: 12-31 〜 01-03）。
 * @public
 */
export interface AnnualRange extends EffectivePeriod {
  readonly from: string;
  readonly to: string;
  readonly name?: string;
}
/**
 * 個別の日付 "YYYY-MM-DD"（名前付きも可）。
 * @public
 */
export type SpecificDate = DateString | { readonly date: DateString; readonly name?: string };
/**
 * 個別の日付の期間（両端を含む）。
 * @public
 */
export interface DateRange {
  readonly from: DateString;
  readonly to: DateString;
  readonly name?: string;
}

/**
 * 営業日カレンダーの設定。
 * @public
 */
export interface CalendarOptions<Kind extends string = string> extends HolidaySourceOptions<Kind> {
  /** 定休日の曜日（0 = 日曜日） */
  readonly closedWeekdays?: readonly Weekday[];
  /** 毎年の休業日（有効期間 effectiveFrom・effectiveTo を付けられる） */
  readonly closedAnnualDates?: readonly (AnnualDate | AnnualRange)[];
  /** 臨時休業日 */
  readonly closedDates?: readonly (SpecificDate | DateRange)[];
  /** 臨時営業日（ほかのすべての規則より優先） */
  readonly openDates?: readonly (SpecificDate | DateRange)[];
  /**
   * 繰り返しの休業日（毎週・隔週などの周期・毎月の第 n 曜日・毎月の日）。
   * 祝日に当たったときの扱いは規則ごとに holidayOverlapPolicy で指定する（既定: "under-holiday"）。
   * 有効期間（effectiveFrom・effectiveTo）を付けると、期間の外では書かれていないのと同じに扱う
   */
  readonly closedRecurringRules?: readonly RecurringRule<Kind>[];
  /** 繰り返しの営業日。closedRecurringRules と同じ日に当たる場合はこちらが優先 */
  readonly openRecurringRules?: readonly RecurringRule<Kind>[];
  /** 祝日の扱い（既定: "closed"） */
  readonly holidayPolicy?: HolidayPolicy;
  /** 営業日を探すときに調べる最大日数（既定: 3660）。超えたら Error */
  readonly searchDayLimit?: number;
  /** @deprecated 0.30.0 で closedAnnualDates に改名した。1.0.0 で削除する */
  readonly closedAnnual?: readonly (AnnualDate | AnnualRange)[];
  /** @deprecated 0.30.0 で closedRecurringRules に改名した。1.0.0 で削除する */
  readonly closedRecurring?: readonly RecurringRule<Kind>[];
  /** @deprecated 0.30.0 で openRecurringRules に改名した。1.0.0 で削除する */
  readonly openRecurring?: readonly RecurringRule<Kind>[];
  /** @deprecated 0.30.0 で searchDayLimit に改名した。1.0.0 で削除する */
  readonly maxSearchDays?: number;
}

/**
 * 営業・休業を決めた規則（既知の値）。
 * @public
 */
export type KnownDayReason =
  | "open-date"
  | "closed-date"
  | "open-annual"
  | "closed-annual"
  | "open-recurring"
  | "closed-recurring"
  | "holiday"
  | "closed-weekday"
  /** どの設定にも当たらなかった営業日 */
  | "default"
  /** スケジュールから作ったカレンダーで、曜日の値で営業日になった日 */
  | "open-weekday";

/**
 * 営業・休業を決めた規則。将来の版で値が増えることがあるので、分岐では「その他」も扱うこと。
 * すべての値を網羅したことを型で確かめたい場合は KnownDayReason を使う。
 * @public
 */
export type DayReason = KnownDayReason | (string & {});

/**
 * 1 日分の判定結果。
 * @public
 */
export interface DayInfo<Kind extends string = string> {
  readonly date: DateString;
  readonly weekday: Weekday;
  /** 営業日か */
  readonly open: boolean;
  /** @deprecated 0.30.0 で open に改名した（同じ値）。1.0.0 で削除する */
  readonly businessDay: boolean;
  /** 判定を決めた規則 */
  readonly reason: DayReason;
  /** 判定を決めた規則の名前（休業日の名前・祝日名など） */
  readonly name?: string;
  /** その日が祝日なら祝日（holidayPolicy に関係なく付く） */
  readonly holiday?: Holiday<Kind>;
  /** 祝日から振り替えられた繰り返しの規則で決まった場合、振替の元の日付（holidayOverlapPolicy: "after-holiday"） */
  readonly shiftedFrom?: DateString;
  /**
   * 判定を決めた規則の設定の中の位置（規則の診断の path と同じ形。例: "closedRecurringRules[0]"）。
   * 個別の日付・毎年の休業日・繰り返しの規則（振替先を含む）で決まった日にだけ付き、祝日・定休日の曜日で決まった日には付かない
   */
  readonly optionPath?: string;
  /** @deprecated 0.30.0 で optionPath に改名した（同じ値）。1.0.0 で削除する */
  readonly rulePath?: string;
  /**
   * 合成したカレンダー（combineCalendars）で、判定を決めたカレンダーの番号（渡した配列の位置）。
   * reason・name・shiftedFrom・optionPath はそのカレンダーの結果。合成していないカレンダーでは付かない
   */
  readonly decidedBy?: number;
  /**
   * 合成したカレンダーで、判定を決めたカレンダーまでの番号の列（外側から順）。入れ子でない合成では長さ 1 で、
   * 先頭は decidedBy と同じ。合成したカレンダーをさらに合成したとき、optionPath がどのカレンダーの設定の位置かを
   * 結果だけから辿れる（例: [0, 1] は 0 番のカレンダーの中の 1 番）。合成していないカレンダーでは付かない
   */
  readonly decidedByPath?: readonly number[];
}

/**
 * カレンダーの合成のオプション。
 * @public
 */
export interface CombineCalendarsOptions {
  /**
   * 営業日とする条件。"all": すべてのカレンダーが営業日（例: 自社と銀行の両方が営業している日）/
   * "any": いずれかのカレンダーが営業日（例: 複数の店舗のどこかが開いている日）
   */
  readonly open: "all" | "any";
  /** 営業日を探すときに調べる最大日数（既定: 3660）。超えたら Error */
  readonly searchDayLimit?: number;
  /** @deprecated 0.30.0 で searchDayLimit に改名した。1.0.0 で削除する */
  readonly maxSearchDays?: number;
}

/**
 * 営業日を探すときのオプション。
 * @public
 */
export interface BusinessDayOnOrAfterOptions {
  /**
   * 締め時刻 "HH:mm"（カレンダーのタイムゾーン）。
   * 入力の時刻がこの時刻以降なら、その日は対象にしない。時刻を持たない入力（暦日の文字列・Temporal の PlainDate など）
   * と組み合わせると code: "invalid-argument" の Error（締め時刻が黙って無視されるのを防ぐため）
   */
  readonly cutoff?: string;
}

/**
 * 休業日に当たった日付の調整の方法（営業日の慣行）。
 * - "following": 翌営業日
 * - "preceding": 前営業日
 * - "modified-following": 翌営業日。ただし月が変わるなら前営業日
 * - "modified-preceding": 前営業日。ただし月が変わるなら翌営業日
 *
 * 月が変わるかは、調整する前の日付の月と比べる。
 * @namingSource isda
 * @public
 */
export type BusinessDayConvention =
  | "following"
  | "preceding"
  | "modified-following"
  | "modified-preceding";

/**
 * 日付の調整のオプション。
 * @public
 */
export interface AdjustOptions {
  /** 調整の方法 */
  readonly convention: BusinessDayConvention;
}

/**
 * 月の期日のオプション。
 * @public
 */
export interface DueDateOptions {
  /** 期日の日（1〜31、-1 は末日）。その月にない日（2 月 30 日など）は末日に読み替える */
  readonly dayOfMonth: DayOfMonth;
  /** 期日が休業日のときの調整の方法 */
  readonly convention: BusinessDayConvention;
}

/**
 * 営業日カレンダー。
 * @public
 */
export interface Calendar<Kind extends string = string> extends HolidayLookup<Kind> {
  /** 1 日分の判定結果（営業日か・理由・祝日） */
  dayInfoOn(input: DateInput): DayInfo<Kind>;
  /** @deprecated 0.30.0 で dayInfoOn に改名した。1.0.0 で削除する */
  dayInfo(input: DateInput): DayInfo<Kind>;
  /** 期間内の日ごとの判定結果（両端を含む。from が to より後ならエラー） */
  daysBetween(from: DateInput, to: DateInput): readonly DayInfo<Kind>[];
  /** 営業日か */
  isBusinessDay(input: DateInput): boolean;
  /** 翌営業日（入力日の翌日以降） */
  nextBusinessDay(input: DateInput): DateString;
  /** 前営業日（入力日の前日以前） */
  previousBusinessDay(input: DateInput): DateString;
  /**
   * 入力日が営業日ならその日、そうでなければ翌営業日。cutoff で締め時刻を指定できる
   * （cutoff を指定するときの入力は、時刻を持つもの。時刻のない入力と組み合わせると invalid-argument）
   */
  businessDayOnOrAfter(input: DateInput, options?: BusinessDayOnOrAfterOptions): DateString;
  /** 入力日が営業日ならその日、そうでなければ前営業日 */
  businessDayOnOrBefore(input: DateInput): DateString;
  /**
   * n 営業日後（負なら前）。入力日自身は数えない。
   * n = 0 のときは businessDayOnOrAfter と同じ
   */
  addBusinessDays(input: DateInput, n: number): DateString;
  /** from 以上 to 未満の営業日の数（to が前なら負） */
  diffBusinessDays(from: DateInput, to: DateInput): number;
  /** 期間内の営業日（両端を含む） */
  businessDatesBetween(from: DateInput, to: DateInput): readonly DateString[];
  /** @deprecated 0.30.0 で diffBusinessDays に改名した。1.0.0 で削除する */
  businessDaysBetween(from: DateInput, to: DateInput): number;
  /** @deprecated 0.30.0 で businessDatesBetween に改名した。1.0.0 で削除する */
  listBusinessDays(from: DateInput, to: DateInput): readonly DateString[];
  /**
   * 営業日ならその日、休業日なら convention に従って調整した営業日。
   * 月が変わるか（modified-…）は、調整する前の日付の月と比べる
   */
  adjust(input: DateInput, options: AdjustOptions): DateString;
  /**
   * 月 "YYYY-MM" の第 n 営業日。n が負なら月末から数える（-1 は最終営業日）。
   * その月の営業日が足りなければ code: "no-business-day" の Error
   */
  nthBusinessDayOfMonth(month: MonthString, n: number): DateString;
  /** 月 "YYYY-MM" の最初の営業日（nthBusinessDayOfMonth(month, 1)） */
  firstBusinessDayOfMonth(month: MonthString): DateString;
  /** 月 "YYYY-MM" の最後の営業日（nthBusinessDayOfMonth(month, -1)） */
  lastBusinessDayOfMonth(month: MonthString): DateString;
  /**
   * 月 "YYYY-MM" の dayOfMonth 日を期日とし、休業日なら convention で調整した日。
   * その月にない日は末日に読み替えてから調整する（例: 2 月の 30 日払いは 2 月末日）
   */
  dueDate(month: MonthString, options: DueDateOptions): DateString;
  /**
   * 営業日を考慮した締め日で区切ったときに、日付が属する月。
   * 各月の締め日（締め日がその月にない場合は末日）を convention で営業日に調整した日を D(m) とし、
   * 日付が D(m) 以下となる最小の m を返す。前月の締め日から当月の締め日までに営業日がない月（長期休業）は
   * 固有の期間を持たず、その日は次の月に属する
   */
  closingMonth(input: DateInput, closingDayOfMonth: number, options: AdjustOptions): MonthString;
  /**
   * 営業日を考慮した締め日で区切ったときの、その月分の期間（両端を含む暦日。前月の調整後の締め日の翌日から
   * 当月の調整後の締め日まで）。暦日を渡すと、その日が属する期間（closingMonth で求めた月の期間）。
   * 月を渡して、その月に固有の期間がない（前月の締め日から当月の締め日までに営業日がない）ときは
   * code: "no-business-day" の Error。返す値は変更できず、name は付かない
   */
  closingPeriod(
    input: DateInput | MonthString,
    closingDayOfMonth: number,
    options: AdjustOptions,
  ): { readonly from: DateString; readonly to: DateString };
}

const CALENDAR_OPTION_KEYS = [
  "holidayProvider",
  "timeZone",
  "outOfRangePolicy",
  "unconfirmedHolidayPolicy",
  "closedWeekdays",
  "closedAnnualDates",
  "closedDates",
  "openDates",
  "closedRecurringRules",
  "openRecurringRules",
  "holidayPolicy",
  "searchDayLimit",
];

interface CompiledCalendar<Kind extends string> {
  readonly schedule: CompiledSchedule<boolean, Kind>;
  readonly searchDayLimit: number;
}

/** @internal 営業日カレンダーの設定を検証して取り込む（誤りは c に集める） */
export function compileCalendarOptions<Kind extends string>(
  c: IssueCollector,
  options: unknown,
): CompiledCalendar<Kind> | undefined {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    c.error("invalid-option", "", "options must be an object");
    return undefined;
  }
  const written = options as Record<string, unknown>;
  const places = ["source", "calendar"] as const;
  const o = renameKeys(c, places, "", written);
  checkUnknownKeys(c, "", o, CALENDAR_OPTION_KEYS);
  const source = compileHolidaySource<Kind>(c, o);

  const closedWeekdays = new Set<number>();
  const rawWeekdays = o["closedWeekdays"];
  if (rawWeekdays !== undefined) {
    if (!Array.isArray(rawWeekdays)) {
      c.error("invalid-option", "closedWeekdays", "must be an array");
    } else {
      rawWeekdays.forEach((w: unknown, i) => {
        if (isWeekday(w)) closedWeekdays.add(w);
        else
          c.error(
            "invalid-weekday",
            `closedWeekdays[${i}]`,
            "must be an integer from 0 (Sunday) to 6 (Saturday)",
          );
      });
    }
  }

  const holidayPolicy = o["holidayPolicy"] ?? "closed";
  if (holidayPolicy !== "closed" && holidayPolicy !== "open" && holidayPolicy !== "ignore") {
    c.error("invalid-option", "holidayPolicy", 'must be "closed", "open" or "ignore"');
  }
  const searchDayLimit = o["searchDayLimit"] ?? 3660;
  if (!Number.isInteger(searchDayLimit) || (searchDayLimit as number) < 1) {
    c.error("invalid-option", "searchDayLimit", "must be a positive integer");
  }

  const annual = compileAnnualRules<boolean>(
    c,
    "closedAnnualDates",
    o["closedAnnualDates"],
    () => false,
    true,
  );
  const open = compileDateRules<boolean>(c, "openDates", o["openDates"], () => true, true);
  const closed = compileDateRules<boolean>(c, "closedDates", o["closedDates"], () => false, true);
  const openRecurringRules = compileRecurringRules<boolean>(
    c,
    "openRecurringRules",
    o["openRecurringRules"],
    () => true,
    RECURRING_RULE_KEYS,
    "calendar",
    writtenKey(places, written, "openRecurringRules"),
    jpUsage(source),
  );
  const closedRecurringRules = compileRecurringRules<boolean>(
    c,
    "closedRecurringRules",
    o["closedRecurringRules"],
    () => false,
    RECURRING_RULE_KEYS,
    "calendar",
    writtenKey(places, written, "closedRecurringRules"),
    jpUsage(source),
  );

  return {
    schedule: {
      source,
      weekly: Object.freeze([0, 1, 2, 3, 4, 5, 6].map((w) => !closedWeekdays.has(w))),
      holiday: holidayPolicy === "ignore" ? "ignore" : { value: holidayPolicy === "open" },
      annual,
      // 臨時営業日を先に並べて、臨時休業日より優先する
      dates: [...open, ...closed],
      // 繰り返しの営業日を先に並べて、繰り返しの休業日より優先する
      recurring: [...openRecurringRules, ...closedRecurringRules],
    },
    searchDayLimit: Number.isInteger(searchDayLimit) ? (searchDayLimit as number) : 3660,
  };
}

/**
 * 祝日と休業日の規則から営業日カレンダーを作る。
 *
 * 設定は作る時点で取り込まれるので、あとから元の配列を書き換えても結果は変わらない。
 * 設定の誤りは code 付きの RangeError になる。
 * @public
 */
export function createCalendar<Kind extends string = string>(
  options: CalendarOptions<Kind> = {},
): Calendar<Kind> {
  const c = new IssueCollector();
  const compiled = compileCalendarOptions<Kind>(c, options);
  c.throwFirstError();
  const { searchDayLimit } = compiled!;
  const schedule = buildSchedule(compiled!.schedule);

  const info = (date: DateString): DayInfo<Kind> => {
    const day = schedule.dayInfoOn(date);
    return dayInfoFromScheduleDay(day, day.value, false);
  };

  return buildCalendar(schedule, (date) => schedule.valueOn(date), info, searchDayLimit);
}

/**
 * @internal スケジュールの 1 日分の結果（値は営業日か）を、営業日カレンダーの結果に変換する。
 * reason はスケジュールの reason と営業・休業の組み合わせで決まる。createCalendar の closedAnnualDates は休業だけなので
 * "open-annual" にはならないが、createCalendarFromSchedule では annual の値で営業になる日がある
 */
function dayInfoFromScheduleDay<Kind extends string>(
  day: ScheduleDayInfo<boolean, Kind>,
  open: boolean,
  fromSchedule: boolean,
): DayInfo<Kind> {
  let reason: KnownDayReason;
  // 内部では閉じた型（KnownScheduleDayReason）で分岐し、値が増えたときの対応漏れを型で検出する
  const known = day.reason as KnownScheduleDayReason;
  switch (known) {
    case "date":
      reason = open ? "open-date" : "closed-date";
      break;
    case "annual":
      reason = open ? "open-annual" : "closed-annual";
      break;
    case "recurring":
      reason = open ? "open-recurring" : "closed-recurring";
      break;
    case "holiday":
      reason = "holiday";
      break;
    case "weekday":
      reason = open ? (fromSchedule ? "open-weekday" : "default") : "closed-weekday";
      break;
    default: {
      const unreachable: never = known;
      throw plainError("invalid-option", `Unexpected schedule reason: ${String(unreachable)}`);
    }
  }
  const result: { -readonly [K in keyof DayInfo<Kind>]: DayInfo<Kind>[K] } = {
    date: day.date,
    weekday: day.weekday,
    open,
    businessDay: open,
    reason,
  };
  // 曜日で決まった日には名前を付けない（祝日名は holiday で分かる）
  if (day.name !== undefined && day.reason !== "weekday") result.name = day.name;
  if (day.holiday !== undefined) result.holiday = day.holiday;
  if (day.shiftedFrom !== undefined) result.shiftedFrom = day.shiftedFrom;
  if (day.optionPath !== undefined) result.optionPath = result.rulePath = day.optionPath;
  return Object.freeze(result);
}

/**
 * @internal 祝日を調べる機能と 1 日分の判定から、営業日カレンダーの機能（探索・調整・月の営業日・期日）を組み立てる。
 * createCalendar・combineCalendars・createCalendarFromSchedule で共用する
 */
function buildCalendar<Kind extends string>(
  lookup: HolidayLookup<Kind>,
  isOpen: (date: DateString) => boolean,
  info: (date: DateString) => DayInfo<Kind>,
  searchDayLimit: number,
): Calendar<Kind> {
  const dateOf = lookup.dateOf;

  function search(start: DateString, step: 1 | -1): DateString {
    let n = toDayNumber(start);
    for (let i = 0; i < searchDayLimit; i++, n += step) {
      const date = fromDayNumber(n);
      if (isOpen(date)) return date;
    }
    throw plainError(
      "no-business-day",
      `No business day found within ${searchDayLimit} days from ${start}`,
    );
  }

  function countOpen(from: number, toExclusive: number): number {
    let count = 0;
    for (let n = from; n < toExclusive; n++) if (isOpen(fromDayNumber(n))) count++;
    return count;
  }

  const CONVENTIONS: readonly BusinessDayConvention[] = [
    "following",
    "preceding",
    "modified-following",
    "modified-preceding",
  ];
  /** 月 m の、営業日に調整した締め日 D(m)（decisions.md の 23 番） */
  function closingDate(
    month: { year: number; month: number },
    closingDayOfMonth: number,
    options: AdjustOptions,
  ): DateString {
    return adjustDate(dayOfMonth(month, closingDayIn(month, closingDayOfMonth)), options);
  }
  /** 営業日を考慮した締め日で日付が属する月（date ≤ D(m) となる最小の m）。暦日の締めの月の前月から順に調べる */
  function closingMonthOf(
    date: DateString,
    closingDayOfMonth: number,
    options: AdjustOptions,
  ): { year: number; month: number } {
    checkClosingDay(closingDayOfMonth);
    let month = parseMonth(calendarClosingMonth(date, closingDayOfMonth));
    // D は月とともに単調に増える（減らない）ので、暦日の締めの月から、後ろへ（following で前月の締め日が
    // 長期休業を越えて当月以降に来た場合）、前へ（preceding で当月の締め日が date より前に来た場合）順に探す
    while (date <= closingDate(shiftMonth(month, -1), closingDayOfMonth, options)) {
      month = shiftMonth(month, -1);
    }
    while (date > closingDate(month, closingDayOfMonth, options)) month = shiftMonth(month, 1);
    return month;
  }
  function adjustDate(date: DateString, options: AdjustOptions | undefined): DateString {
    const convention = (options as { convention?: unknown } | undefined)?.convention;
    if (!CONVENTIONS.includes(convention as BusinessDayConvention)) {
      throw rangeError(
        "invalid-argument",
        `convention must be one of ${CONVENTIONS.map((v) => `"${v}"`).join(", ")}`,
      );
    }
    if (isOpen(date)) return date;
    const month = date.slice(0, 7);
    switch (convention as BusinessDayConvention) {
      case "following":
        return search(date, 1);
      case "preceding":
        return search(date, -1);
      case "modified-following": {
        const next = search(date, 1);
        if (next.startsWith(month)) return next;
        // 同じ月に前営業日がなければ、月が変わっても翌営業日にする
        const previous = searchWithin(date, -1, month);
        return previous ?? next;
      }
      case "modified-preceding": {
        const previous = search(date, -1);
        if (previous.startsWith(month)) return previous;
        const next = searchWithin(date, 1, month);
        return next ?? previous;
      }
      default:
        throw rangeError("invalid-argument", `Unknown convention: ${String(convention)}`);
    }
  }

  /** 同じ月の中だけで営業日を探す（なければ undefined） */
  function searchWithin(start: DateString, step: 1 | -1, month: string): DateString | undefined {
    for (let date = start; date.startsWith(month); date = addDays(date, step)) {
      if (isOpen(date)) return date;
    }
    return undefined;
  }

  /** 月の営業日（月初から順） */
  function businessDaysOfMonth(month: MonthString): DateString[] {
    const { year, month: m } = parseMonth(month);
    const result: DateString[] = [];
    for (let d = 1; d <= lengthOfMonth(year, m); d++) {
      const date = formatDate(year, m, d);
      if (isOpen(date)) result.push(date);
    }
    return result;
  }

  function nthOfMonth(month: MonthString, n: number): DateString {
    if (!Number.isInteger(n) || n === 0) {
      throw rangeError("invalid-argument", `n must be a non-zero integer: ${n}`);
    }
    const days = businessDaysOfMonth(month);
    const found = n > 0 ? days[n - 1] : days[days.length + n];
    if (found === undefined) {
      throw plainError(
        "no-business-day",
        `${month} has ${days.length} business day(s); requested ${n > 0 ? "" : "last "}#${Math.abs(n)}`,
      );
    }
    return found;
  }

  const calendar: Calendar<Kind> = {
    timeZone: lookup.timeZone,
    providers: lookup.providers,
    outOfRangePolicy: lookup.outOfRangePolicy,
    unconfirmedHolidayPolicy: lookup.unconfirmedHolidayPolicy,
    outOfRange: lookup.outOfRangePolicy,
    unconfirmedHolidays: lookup.unconfirmedHolidayPolicy,
    dateOf,
    civilOf: lookup.civilOf,
    instantOf: lookup.instantOf,
    today: lookup.today,
    isHoliday: lookup.isHoliday,
    holidayOn: lookup.holidayOn,
    getHoliday: lookup.holidayOn,
    holidaysInYear: lookup.holidaysInYear,
    holidaysBetween: lookup.holidaysBetween,

    dayInfoOn: (input) => info(dateOf(input)),
    dayInfo: (input) => info(dateOf(input)),
    daysBetween: (from, to) => mapDays(dateOf(from), dateOf(to), info),
    isBusinessDay: (input) => isOpen(dateOf(input)),
    nextBusinessDay: (input) => search(addDays(dateOf(input), 1), 1),
    previousBusinessDay: (input) => search(addDays(dateOf(input), -1), -1),
    businessDayOnOrAfter(input, opts = {}) {
      const civil = toCivil(input, lookup.timeZone);
      let start = civil.date;
      if (opts.cutoff !== undefined) {
        const cutoff = parseTimeOfDay(opts.cutoff);
        if (civil.minutes === null) {
          throw rangeError(
            "invalid-argument",
            "cutoff requires an input with a time of day (a Date, a date-time string or a Temporal value with a time); a date-only input would silently ignore the cutoff",
          );
        }
        if (civil.minutes >= cutoff) start = addDays(start, 1);
      }
      return search(start, 1);
    },
    businessDayOnOrBefore: (input) => search(dateOf(input), -1),
    addBusinessDays(input, n) {
      if (!Number.isInteger(n)) throw rangeError("invalid-argument", `n must be an integer: ${n}`);
      let date = dateOf(input);
      if (n === 0) return search(date, 1);
      const step = n > 0 ? 1 : -1;
      for (let remaining = Math.abs(n); remaining > 0; remaining--) {
        date = search(addDays(date, step), step);
      }
      return date;
    },
    diffBusinessDays(from, to) {
      const a = toDayNumber(dateOf(from));
      const b = toDayNumber(dateOf(to));
      return a <= b ? countOpen(a, b) : -countOpen(b, a);
    },
    businessDatesBetween(from, to) {
      const a = dateOf(from);
      const b = dateOf(to);
      if (a > b) throw rangeError("invalid-range", `"from" must not be after "to" (${a} > ${b})`);
      const result: DateString[] = [];
      for (let n = toDayNumber(a); n <= toDayNumber(b); n++) {
        const date = fromDayNumber(n);
        if (isOpen(date)) result.push(date);
      }
      return Object.freeze(result);
    },
    adjust: (input, options) => adjustDate(dateOf(input), options),
    nthBusinessDayOfMonth: nthOfMonth,
    firstBusinessDayOfMonth: (month) => nthOfMonth(month, 1),
    lastBusinessDayOfMonth: (month) => nthOfMonth(month, -1),
    closingMonth: (input, closingDayOfMonth, options) =>
      formatMonth(closingMonthOf(dateOf(input), closingDayOfMonth, options)),
    closingPeriod(input, closingDayOfMonth, options) {
      checkClosingDay(closingDayOfMonth);
      // "YYYY-MM" だけを月として扱い、それ以外（暦日・日時の文字列・Date・Temporal の値）は dateOf で暦日にする
      const isMonth = typeof input === "string" && /^\d{4}-\d{2}$/.test(input);
      const month = isMonth
        ? parseMonth(input)
        : closingMonthOf(dateOf(input), closingDayOfMonth, options);
      const to = closingDate(month, closingDayOfMonth, options);
      const from = addDays(closingDate(shiftMonth(month, -1), closingDayOfMonth, options), 1);
      if (from > to) {
        throw rangeError(
          "no-business-day",
          `${formatMonth(month)} has no closing period of its own: there is no business day between the previous closing day and ${to} (its days belong to the next month)`,
        );
      }
      return Object.freeze({ from, to });
    },
    dueDate(month, options) {
      const o = isPlainObject(options) ? renameKeys("throw", ["dueDate"], "", options) : undefined;
      const day = o?.["dayOfMonth"];
      if (!isDayOfMonthValue(day)) {
        throw rangeError(
          "invalid-argument",
          `dayOfMonth must be an integer from 1 to 31, or -1 (last day): ${String(day)}`,
        );
      }
      return adjustDate(dayOfMonth(parseMonth(month), day), o as unknown as AdjustOptions);
    },
    businessDaysBetween: (from, to) => calendar.diffBusinessDays(from, to),
    listBusinessDays: (from, to) => calendar.businessDatesBetween(from, to),
  };
  return Object.freeze(calendar);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isCalendarLike = (v: unknown): v is Calendar =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Calendar).dayInfoOn === "function" &&
  typeof (v as Calendar).isBusinessDay === "function" &&
  typeof (v as Calendar).timeZone === "string" &&
  Array.isArray((v as Calendar).providers);

/**
 * 作成済みの営業日カレンダーを合成する。"all" はすべてのカレンダーが営業している日、"any" はいずれかが
 * 営業している日を営業日とする。返すのは通常の営業日カレンダーで、営業日の加減算・調整・期日などが合成結果で動く。
 *
 * - dayInfoOn の reason・name・shiftedFrom・optionPath は、合成結果と同じ判定をした最初のカレンダーの結果で、
 *   その番号を decidedBy で返す。入れ子の合成では、内側の番号まで含めた列を decidedByPath で返す。
 *   holiday・isHoliday などは、すべてのカレンダーの祝日の提供元の和集合で判定する
 * - タイムゾーンはすべてのカレンダーで同じでなければならない（time-zone-conflict）。
 *   2 つ未満、同じカレンダーを 2 回渡した場合は invalid-argument
 * - 合成したカレンダーをさらに合成することもできる。規則の診断（diagnoseCalendar）の対象にはならないので、
 *   元のカレンダーの設定をそれぞれ診断する
 * @public
 */
export function combineCalendars<Kind extends string = string>(
  calendars: readonly Calendar<Kind>[],
  options: CombineCalendarsOptions,
): Calendar<Kind> {
  if (!Array.isArray(calendars) || calendars.length < 2) {
    throw rangeError("invalid-argument", "calendars must be an array of two or more calendars");
  }
  calendars.forEach((c, i) => {
    if (!isCalendarLike(c))
      throw rangeError("invalid-argument", `calendars[${i}] is not a calendar`);
    if (calendars.indexOf(c) !== i) {
      throw rangeError(
        "invalid-argument",
        `calendars[${i}] is the same calendar as calendars[${calendars.indexOf(c)}]`,
      );
    }
  });
  const o: Record<string, unknown> = isPlainObject(options)
    ? renameKeys("throw", ["combine"], "", options)
    : {};
  const mode = o["open"];
  if (mode !== "all" && mode !== "any") {
    throw rangeError("invalid-option", 'open must be "all" or "any"');
  }
  const searchDayLimit = (o["searchDayLimit"] ?? 3660) as number;
  if (!Number.isInteger(searchDayLimit) || searchDayLimit < 1) {
    throw rangeError("invalid-option", "searchDayLimit must be a positive integer");
  }
  const zones = [...new Set(calendars.map((c) => c.timeZone))];
  if (zones.length > 1) {
    throw rangeError(
      "time-zone-conflict",
      `Calendars use different time zones (${zones.join(", ")}); combine calendars with the same time zone`,
    );
  }
  const providers: HolidayProvider<Kind>[] = [];
  for (const c of calendars)
    for (const p of c.providers) if (!providers.includes(p)) providers.push(p);
  const lookup = createHolidayLookup<Kind>({
    providers: Object.freeze(providers),
    timeZone: zones[0]!,
    outOfRangePolicy: calendars.every((c) => c.outOfRangePolicy === "ignore") ? "ignore" : "throw",
    // 未確定の祝日も同じ考え方: どれかが "throw" なら、そのカレンダーの判定が例外になるので合成の holiday も "throw"
    unconfirmedHolidayPolicy: calendars.some((c) => c.unconfirmedHolidayPolicy === "throw")
      ? "throw"
      : "accept",
  });

  const isOpen = (date: DateString): boolean =>
    mode === "all"
      ? calendars.every((c) => c.isBusinessDay(date))
      : calendars.some((c) => c.isBusinessDay(date));

  function info(date: DateString): DayInfo<Kind> {
    const results = calendars.map((c) => c.dayInfoOn(date));
    const open = mode === "all" ? results.every((r) => r.open) : results.some((r) => r.open);
    // 合成結果と同じ判定をした最初のカレンダー（"all" で休業なら最初に休みのもの、営業ならすべて営業なので 0 番）
    const decidedBy = results.findIndex((r) => r.open === open);
    const base = results[decidedBy]!;
    const result: { -readonly [K in keyof DayInfo<Kind>]: DayInfo<Kind>[K] } = {
      date,
      weekday: base.weekday,
      open,
      businessDay: open,
      reason: base.reason,
    };
    if (base.name !== undefined) result.name = base.name;
    const holiday = lookup.holidayOfDate(date);
    if (holiday !== undefined) result.holiday = holiday;
    if (base.shiftedFrom !== undefined) result.shiftedFrom = base.shiftedFrom;
    if (base.optionPath !== undefined) result.optionPath = result.rulePath = base.optionPath;
    result.decidedBy = decidedBy;
    // 内側が合成したカレンダーなら、その経路の前に自分の番号を付ける（入れ子でなければ長さ 1）
    result.decidedByPath = Object.freeze([decidedBy, ...(base.decidedByPath ?? [])]);
    return Object.freeze(result);
  }

  return buildCalendar(lookup, isOpen, info, searchDayLimit);
}

/**
 * スケジュールから作る営業日カレンダーのオプション。
 * @public
 */
export interface CalendarFromScheduleOptions {
  /** 営業日を探すときに調べる最大日数（既定: 3660）。超えたら Error */
  readonly searchDayLimit?: number;
  /** @deprecated 0.30.0 で searchDayLimit に改名した。1.0.0 で削除する */
  readonly maxSearchDays?: number;
}

/**
 * スケジュール（createSchedule）から営業日カレンダーを作る。isOpen が true を返す値の日を営業日とする。
 * 営業時間表のような日ごとの値が設定の正本で、営業日の計算（加減算・調整・期日など）も同じ設定から行いたいときに使う
 * （営業日カレンダーを別に書いて同期を取る必要がなくなる）。
 *
 * - isOpen は値だけで決まる純粋な関数であること（日付・時刻・外部の状態を見ない）。営業日の探索は isOpen を繰り返し呼ぶので、
 *   結果が変わる関数を渡すと探索の結果が呼ぶたびに変わる。日付で変えたい条件は、スケジュールの規則（dates・recurringRules）に書く
 * - dayInfoOn の reason は、スケジュールの reason と営業・休業の組み合わせ（date → "open-date"/"closed-date"、annual → "open-annual"/
 *   "closed-annual"、recurring → "open-recurring"/"closed-recurring"、holiday → "holiday"、weekday → "open-weekday"/"closed-weekday"）。
 *   name・holiday・shiftedFrom・optionPath はスケジュールの結果をそのまま引き継ぐ
 * - 祝日の判定（holiday・isHoliday など）・タイムゾーン・outOfRangePolicy はスケジュールのもの。規則の診断（diagnoseSchedule）は
 *   スケジュールの設定に対して行う
 * @public
 */
export function createCalendarFromSchedule<Value, Kind extends string = string>(
  schedule: Schedule<Value, Kind>,
  isOpen: (value: Value) => boolean,
  options?: CalendarFromScheduleOptions,
): Calendar<Kind> {
  const info = infoOfSchedule(schedule);
  if (info === undefined) {
    throw rangeError("invalid-argument", "schedule must be a schedule created by createSchedule");
  }
  if (typeof isOpen !== "function") {
    throw rangeError("invalid-argument", "isOpen must be a function (value) => boolean");
  }
  const o: Record<string, unknown> = isPlainObject(options)
    ? renameKeys("throw", ["fromSchedule"], "", options)
    : {};
  const searchDayLimit = (o["searchDayLimit"] ?? 3660) as number;
  if (!Number.isInteger(searchDayLimit) || searchDayLimit < 1) {
    throw rangeError("invalid-option", "searchDayLimit must be a positive integer");
  }
  const open = (date: DateString): boolean => isOpen(info(date).value) === true;
  return buildCalendar(
    schedule,
    open,
    (date) => {
      const day = info(date);
      // 変換は value を読まない（営業・休業は open で渡す）ので、boolean の値として扱ってよい
      return dayInfoFromScheduleDay(
        day as ScheduleDayInfo<unknown, Kind> as ScheduleDayInfo<boolean, Kind>,
        isOpen(day.value) === true,
        true,
      );
    },
    searchDayLimit,
  );
}

/**
 * @deprecated 0.30.0 で CombineCalendarsOptions に改名した。1.0.0 で削除する
 * @public
 */
export type CombineOptions = CombineCalendarsOptions;

/**
 * @deprecated 0.30.0 で BusinessDayOnOrAfterOptions に改名した。1.0.0 で削除する
 * @public
 */
export type BusinessDayOptions = BusinessDayOnOrAfterOptions;
