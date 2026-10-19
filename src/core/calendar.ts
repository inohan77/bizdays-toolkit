/**
 * 祝日と、会社・店舗の休業日を組み合わせた営業日カレンダー。
 *
 * 1 日の判定は次の優先順位で行う（上が優先）:
 *   1. openDates      … 臨時営業日（個別の日付・期間）
 *   2. closedDates    … 臨時休業日（個別の日付・期間）
 *   3. closedAnnual   … 毎年の休業日（月日・月日の期間。年をまたぐ期間も可）
 *   4. openRecurring・closedRecurring（onHolidayRule: "over-holiday"）… 祝日でも当てはめる繰り返しの規則
 *   5. 祝日            … holidayPolicy に従う（closed: 休業 / open: 営業 / ignore: 判定に使わない）
 *   6. openRecurring・closedRecurring（"under-holiday"・"after-holiday" の振替先）… 繰り返しの規則
 *   7. closedWeekdays … 定休日の曜日
 *   8. それ以外は営業日
 *
 * 繰り返しの規則は openRecurring が closedRecurring より優先。"after-holiday" の規則は、
 * 祝日には当てはめず、その日以降で最初の祝日でない日に当てはめる（振替）
 *
 * 内部では、営業日かどうか（真偽値）を返すスケジュール（createSchedule）として作っている。
 * 営業日の探索・調整・月の営業日などの機能は buildCalendar に切り出し、作成済みのカレンダーを
 * 合成する combineCalendars（両方が営業している日・どちらかが営業している日）でも同じ実装を使う。
 */

import {
  addDays,
  daysInMonth,
  formatDate,
  fromDayNumber,
  toDayNumber,
  type DateString,
  type Weekday,
} from "./date.ts";
import { checkUnknownKeys, IssueCollector, plainError, rangeError } from "./errors.ts";
import { parseTimeOfDay, toCivil, type DateInput } from "./input.ts";
import { dayOfMonth, isDayOfMonthValue, parseMonth, type MonthString } from "./month.ts";
import {
  buildSchedule,
  compileAnnualRules,
  compileDateRules,
  compileHolidaySource,
  compileRecurringRules,
  createHolidayLookup,
  isWeekday,
  mapDays,
  RECURRING_RULE_KEYS,
  type CompiledSchedule,
  type DayOfMonth,
  type EffectivePeriod,
  type KnownScheduleReason,
  type RecurringRule,
  type HolidayLookup,
  type HolidaySourceOptions,
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
  readonly closedAnnual?: readonly (AnnualDate | AnnualRange)[];
  /** 臨時休業日 */
  readonly closedDates?: readonly (SpecificDate | DateRange)[];
  /** 臨時営業日（ほかのすべての規則より優先） */
  readonly openDates?: readonly (SpecificDate | DateRange)[];
  /**
   * 繰り返しの休業日（毎週・隔週などの周期・毎月の第 n 曜日・毎月の日）。
   * 祝日に当たったときの扱いは規則ごとに onHolidayRule で指定する（既定: "under-holiday"）。
   * 有効期間（effectiveFrom・effectiveTo）を付けると、期間の外では書かれていないのと同じに扱う
   */
  readonly closedRecurring?: readonly RecurringRule[];
  /** 繰り返しの営業日。closedRecurring と同じ日に当たる場合はこちらが優先 */
  readonly openRecurring?: readonly RecurringRule[];
  /** 祝日の扱い（既定: "closed"） */
  readonly holidayPolicy?: HolidayPolicy;
  /** 営業日を探すときに調べる最大日数（既定: 3660）。超えたら Error */
  readonly maxSearchDays?: number;
}

/**
 * 営業・休業を決めた規則（既知の値）。
 * @public
 */
export type KnownDayReason =
  | "open-date"
  | "closed-date"
  | "closed-annual"
  | "open-recurring"
  | "closed-recurring"
  | "holiday"
  | "closed-weekday"
  | "regular";

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
  readonly businessDay: boolean;
  /** 判定を決めた規則 */
  readonly reason: DayReason;
  /** 判定を決めた規則の名前（休業日の名前・祝日名など） */
  readonly name?: string;
  /** その日が祝日なら祝日（holidayPolicy に関係なく付く） */
  readonly holiday?: Holiday<Kind>;
  /** 祝日から振り替えられた繰り返しの規則で決まった場合、振替の元の日付（onHolidayRule: "after-holiday"） */
  readonly shiftedFrom?: DateString;
  /**
   * 判定を決めた規則の設定の中の位置（規則の診断の path と同じ形。例: "closedRecurring[0]"）。
   * 個別の日付・毎年の休業日・繰り返しの規則（振替先を含む）で決まった日にだけ付き、祝日・定休日の曜日で決まった日には付かない
   */
  readonly rulePath?: string;
  /**
   * 合成したカレンダー（combineCalendars）で、判定を決めたカレンダーの番号（渡した配列の位置）。
   * reason・name・shiftedFrom・rulePath はそのカレンダーの結果。合成していないカレンダーでは付かない
   */
  readonly decidedBy?: number;
}

/**
 * カレンダーの合成のオプション。
 * @public
 */
export interface CombineOptions {
  /**
   * 営業日とする条件。"all": すべてのカレンダーが営業日（例: 自社と銀行の両方が営業している日）/
   * "any": いずれかのカレンダーが営業日（例: 複数の店舗のどこかが開いている日）
   */
  readonly businessDay: "all" | "any";
  /** 営業日を探すときに調べる最大日数（既定: 3660）。超えたら Error */
  readonly maxSearchDays?: number;
}

/**
 * 営業日を探すときのオプション。
 * @public
 */
export interface BusinessDayOptions {
  /**
   * 締め時刻 "HH:mm"（カレンダーのタイムゾーン）。
   * 入力の時刻がこの時刻以降なら、その日は対象にしない。暦日だけの入力は 0 時として扱う
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
  readonly day: DayOfMonth;
  /** 期日が休業日のときの調整の方法 */
  readonly convention: BusinessDayConvention;
}

/**
 * 営業日カレンダー。
 * @public
 */
export interface Calendar<Kind extends string = string> extends HolidayLookup<Kind> {
  /** 1 日分の判定結果（営業日か・理由・祝日） */
  dayInfo(input: DateInput): DayInfo<Kind>;
  /** 期間内の日ごとの判定結果（両端を含む。from が to より後ならエラー） */
  daysBetween(from: DateInput, to: DateInput): readonly DayInfo<Kind>[];
  /** 営業日か */
  isBusinessDay(input: DateInput): boolean;
  /** 翌営業日（入力日の翌日以降） */
  nextBusinessDay(input: DateInput): DateString;
  /** 前営業日（入力日の前日以前） */
  previousBusinessDay(input: DateInput): DateString;
  /** 入力日が営業日ならその日、そうでなければ翌営業日。cutoff で締め時刻を指定できる */
  businessDayOnOrAfter(input: DateInput, options?: BusinessDayOptions): DateString;
  /** 入力日が営業日ならその日、そうでなければ前営業日 */
  businessDayOnOrBefore(input: DateInput): DateString;
  /**
   * n 営業日後（負なら前）。入力日自身は数えない。
   * n = 0 のときは businessDayOnOrAfter と同じ
   */
  addBusinessDays(input: DateInput, n: number): DateString;
  /** from 以上 to 未満の営業日の数（to が前なら負） */
  businessDaysBetween(from: DateInput, to: DateInput): number;
  /** 期間内の営業日（両端を含む） */
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
   * 月 "YYYY-MM" の day 日を期日とし、休業日なら convention で調整した日。
   * その月にない日は末日に読み替えてから調整する（例: 2 月の 30 日払いは 2 月末日）
   */
  dueDate(month: MonthString, options: DueDateOptions): DateString;
}

const CALENDAR_OPTION_KEYS = [
  "holidays",
  "timeZone",
  "outOfRange",
  "closedWeekdays",
  "closedAnnual",
  "closedDates",
  "openDates",
  "closedRecurring",
  "openRecurring",
  "holidayPolicy",
  "maxSearchDays",
];

interface CompiledCalendar<Kind extends string> {
  readonly schedule: CompiledSchedule<boolean, Kind>;
  readonly maxSearchDays: number;
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
  const o = options as Record<string, unknown>;
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
  const maxSearchDays = o["maxSearchDays"] ?? 3660;
  if (!Number.isInteger(maxSearchDays) || (maxSearchDays as number) < 1) {
    c.error("invalid-option", "maxSearchDays", "must be a positive integer");
  }

  const annual = compileAnnualRules<boolean>(
    c,
    "closedAnnual",
    o["closedAnnual"],
    () => false,
    true,
  );
  const open = compileDateRules<boolean>(c, "openDates", o["openDates"], () => true, true);
  const closed = compileDateRules<boolean>(c, "closedDates", o["closedDates"], () => false, true);
  const openRecurring = compileRecurringRules<boolean>(
    c,
    "openRecurring",
    o["openRecurring"],
    () => true,
    RECURRING_RULE_KEYS,
  );
  const closedRecurring = compileRecurringRules<boolean>(
    c,
    "closedRecurring",
    o["closedRecurring"],
    () => false,
    RECURRING_RULE_KEYS,
  );

  return {
    schedule: {
      source,
      weekly: Object.freeze([0, 1, 2, 3, 4, 5, 6].map((w) => !closedWeekdays.has(w))),
      holiday: holidayPolicy === "ignore" ? "weekday" : { value: holidayPolicy === "open" },
      annual,
      // 臨時営業日を先に並べて、臨時休業日より優先する
      dates: [...open, ...closed],
      // 繰り返しの営業日を先に並べて、繰り返しの休業日より優先する
      recurring: [...openRecurring, ...closedRecurring],
    },
    maxSearchDays: Number.isInteger(maxSearchDays) ? (maxSearchDays as number) : 3660,
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
  const { maxSearchDays } = compiled!;
  const schedule = buildSchedule(compiled!.schedule);

  function info(date: DateString): DayInfo<Kind> {
    const day = schedule.dayInfo(date);
    let reason: KnownDayReason;
    // 内部では閉じた型（KnownScheduleReason）で分岐し、値が増えたときの対応漏れを型で検出する
    const known = day.reason as KnownScheduleReason;
    switch (known) {
      case "date":
        reason = day.value ? "open-date" : "closed-date";
        break;
      case "annual":
        reason = "closed-annual";
        break;
      case "recurring":
        reason = day.value ? "open-recurring" : "closed-recurring";
        break;
      case "holiday":
        reason = "holiday";
        break;
      case "weekday":
        reason = day.value ? "regular" : "closed-weekday";
        break;
      default: {
        const unreachable: never = known;
        throw plainError("invalid-option", `Unexpected schedule reason: ${String(unreachable)}`);
      }
    }
    const result: { -readonly [K in keyof DayInfo<Kind>]: DayInfo<Kind>[K] } = {
      date: day.date,
      weekday: day.weekday,
      businessDay: day.value,
      reason,
    };
    // 曜日で決まった日には名前を付けない（祝日名は holiday で分かる）
    if (day.name !== undefined && day.reason !== "weekday") result.name = day.name;
    if (day.holiday !== undefined) result.holiday = day.holiday;
    if (day.shiftedFrom !== undefined) result.shiftedFrom = day.shiftedFrom;
    if (day.rulePath !== undefined) result.rulePath = day.rulePath;
    return Object.freeze(result);
  }

  return buildCalendar(schedule, (date) => schedule.valueOn(date), info, maxSearchDays);
}

/**
 * @internal 祝日を調べる機能と 1 日分の判定から、営業日カレンダーの機能（探索・調整・月の営業日・期日）を組み立てる。
 * createCalendar と combineCalendars で共用する
 */
function buildCalendar<Kind extends string>(
  lookup: HolidayLookup<Kind>,
  isOpen: (date: DateString) => boolean,
  info: (date: DateString) => DayInfo<Kind>,
  maxSearchDays: number,
): Calendar<Kind> {
  const dateOf = lookup.dateOf;

  function search(start: DateString, step: 1 | -1): DateString {
    let n = toDayNumber(start);
    for (let i = 0; i < maxSearchDays; i++, n += step) {
      const date = fromDayNumber(n);
      if (isOpen(date)) return date;
    }
    throw plainError(
      "no-business-day",
      `No business day found within ${maxSearchDays} days from ${start}`,
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
    for (let d = 1; d <= daysInMonth(year, m); d++) {
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
    outOfRange: lookup.outOfRange,
    dateOf,
    civilOf: lookup.civilOf,
    today: lookup.today,
    isHoliday: lookup.isHoliday,
    getHoliday: lookup.getHoliday,
    holidaysInYear: lookup.holidaysInYear,
    holidaysBetween: lookup.holidaysBetween,

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
        if (civil.minutes !== null && civil.minutes >= cutoff) start = addDays(start, 1);
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
    businessDaysBetween(from, to) {
      const a = toDayNumber(dateOf(from));
      const b = toDayNumber(dateOf(to));
      return a <= b ? countOpen(a, b) : -countOpen(b, a);
    },
    listBusinessDays(from, to) {
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
    dueDate(month, options) {
      const day = (options as { day?: unknown } | undefined)?.day;
      if (!isDayOfMonthValue(day)) {
        throw rangeError(
          "invalid-argument",
          `day must be an integer from 1 to 31, or -1 (last day): ${String(day)}`,
        );
      }
      return adjustDate(dayOfMonth(parseMonth(month), day), options);
    },
  };
  return Object.freeze(calendar);
}

const isCalendarLike = (v: unknown): v is Calendar =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Calendar).dayInfo === "function" &&
  typeof (v as Calendar).isBusinessDay === "function" &&
  typeof (v as Calendar).timeZone === "string" &&
  Array.isArray((v as Calendar).providers);

/**
 * 作成済みの営業日カレンダーを合成する。"all" はすべてのカレンダーが営業している日、"any" はいずれかが
 * 営業している日を営業日とする。返すのは通常の営業日カレンダーで、営業日の加減算・調整・期日などが合成結果で動く。
 *
 * - dayInfo の reason・name・shiftedFrom・rulePath は、合成結果と同じ判定をした最初のカレンダーの結果で、
 *   その番号を decidedBy で返す。holiday・isHoliday などは、すべてのカレンダーの祝日の提供元の和集合で判定する
 * - タイムゾーンはすべてのカレンダーで同じでなければならない（time-zone-conflict）。
 *   2 つ未満、同じカレンダーを 2 回渡した場合は invalid-argument
 * - 合成したカレンダーをさらに合成することもできる。規則の診断（diagnoseCalendar）の対象にはならないので、
 *   元のカレンダーの設定をそれぞれ診断する
 * @public
 */
export function combineCalendars<Kind extends string = string>(
  calendars: readonly Calendar<Kind>[],
  options: CombineOptions,
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
  const mode = (options as { businessDay?: unknown } | undefined)?.businessDay;
  if (mode !== "all" && mode !== "any") {
    throw rangeError("invalid-option", 'businessDay must be "all" or "any"');
  }
  const maxSearchDays = options.maxSearchDays ?? 3660;
  if (!Number.isInteger(maxSearchDays) || maxSearchDays < 1) {
    throw rangeError("invalid-option", "maxSearchDays must be a positive integer");
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
    outOfRange: calendars.every((c) => c.outOfRange === "ignore") ? "ignore" : "throw",
  });

  const isOpen = (date: DateString): boolean =>
    mode === "all"
      ? calendars.every((c) => c.isBusinessDay(date))
      : calendars.some((c) => c.isBusinessDay(date));

  function info(date: DateString): DayInfo<Kind> {
    const results = calendars.map((c) => c.dayInfo(date));
    const open =
      mode === "all" ? results.every((r) => r.businessDay) : results.some((r) => r.businessDay);
    // 合成結果と同じ判定をした最初のカレンダー（"all" で休業なら最初に休みのもの、営業ならすべて営業なので 0 番）
    const decidedBy = results.findIndex((r) => r.businessDay === open);
    const base = results[decidedBy]!;
    const result: { -readonly [K in keyof DayInfo<Kind>]: DayInfo<Kind>[K] } = {
      date,
      weekday: base.weekday,
      businessDay: open,
      reason: base.reason,
    };
    if (base.name !== undefined) result.name = base.name;
    const holiday = lookup.holidayOn(date);
    if (holiday !== undefined) result.holiday = holiday;
    if (base.shiftedFrom !== undefined) result.shiftedFrom = base.shiftedFrom;
    if (base.rulePath !== undefined) result.rulePath = base.rulePath;
    result.decidedBy = decidedBy;
    return Object.freeze(result);
  }

  return buildCalendar(lookup, isOpen, info, maxSearchDays);
}
