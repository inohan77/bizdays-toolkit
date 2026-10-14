/**
 * 日ごとに値を返すスケジュール（営業時間・受付枠など、曜日・祝日・特定日で変わるもの）。
 *
 * 1 日の値は次の優先順位で決まる（上が優先）:
 *   1. dates   … 個別の日付・期間（配列で先に書いたものが優先）
 *   2. annual  … 毎年の月日・月日の期間（年をまたぐ期間も可。配列で先に書いたものが優先）
 *   3. 祝日     … holiday の規則（"weekday": 曜日どおり / { sameAs: 曜日 }: その曜日の値 / { value }: 指定の値）
 *   4. weekly  … 曜日ごとの値
 *
 * 営業日カレンダー（createCalendar）は、このスケジュールの真偽値版として作られている。
 */

import {
  isValidDate,
  parseDate,
  toDayNumber,
  weekdayOf,
  type DateString,
  type Weekday,
} from "./date.ts";
import { checkUnknownKeys, IssueCollector, rangeError, type KnownErrorCode } from "./errors.ts";
import {
  instantToCivil,
  toCivil,
  toDateTimeParts,
  validateTimeZone,
  type DateInput,
} from "./input.ts";
import type { Holiday, HolidayProvider } from "./types.ts";

// ------------------------------------------------------------
// 公開する型
// ------------------------------------------------------------

/**
 * 祝日の値の決め方。
 * @public
 */
export type HolidayRule<T> =
  /** 祝日を考えず、曜日の値を使う */
  | "weekday"
  /** 指定した曜日の値を使う（例: 祝日は日曜日の営業時間） */
  | { readonly sameAs: Weekday }
  /** 指定した値を使う */
  | { readonly value: T };

/**
 * 毎年の月日 "MM-DD" の値。
 * @public
 */
export interface AnnualValue<T> {
  readonly date: string;
  readonly value: T;
  readonly name?: string;
}

/**
 * 毎年の月日の期間の値（from > to なら年をまたぐ。例: 12-31 〜 01-03）。
 * @public
 */
export interface AnnualRangeValue<T> {
  readonly from: string;
  readonly to: string;
  readonly value: T;
  readonly name?: string;
}

/**
 * 個別の日付 "YYYY-MM-DD" の値。
 * @public
 */
export interface DateValue<T> {
  readonly date: DateString;
  readonly value: T;
  readonly name?: string;
}

/**
 * 個別の日付の期間（両端を含む）の値。
 * @public
 */
export interface DateRangeValue<T> {
  readonly from: DateString;
  readonly to: DateString;
  readonly value: T;
  readonly name?: string;
}

/**
 * 祝日の提供元とタイムゾーンの設定（スケジュールと営業日カレンダーで共通）。
 * @public
 */
export interface HolidaySourceOptions<Kind extends string = string> {
  /** 祝日の提供元（例: jp）。複数渡すと和集合になる */
  readonly holidays?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
  /**
   * 日時の入力（Date・オフセット付き文字列など）を暦日に変換するタイムゾーン。
   * 省略時は祝日の提供元のタイムゾーン、提供元もなければ "UTC"
   */
  readonly timeZone?: string;
  /** 祝日の提供元の対応年を外れた日付の扱い（既定: "throw"） */
  readonly outOfRange?: "throw" | "ignore";
}

/**
 * スケジュールの設定。
 * @public
 */
export interface ScheduleOptions<
  T,
  Kind extends string = string,
> extends HolidaySourceOptions<Kind> {
  /** 曜日ごとの値（[日, 月, 火, 水, 木, 金, 土]） */
  readonly weekly: readonly [T, T, T, T, T, T, T];
  /** 祝日の値の決め方（既定: "weekday"） */
  readonly holiday?: HolidayRule<T>;
  /** 毎年の月日の値 */
  readonly annual?: readonly (AnnualValue<T> | AnnualRangeValue<T>)[];
  /** 個別の日付の値 */
  readonly dates?: readonly (DateValue<T> | DateRangeValue<T>)[];
}

/**
 * 値を決めた規則（既知の値）。
 * @public
 */
export type KnownScheduleReason = "date" | "annual" | "holiday" | "weekday";

/**
 * 値を決めた規則。将来の版で値が増えることがあるので、分岐では「その他」も扱うこと。
 * すべての値を網羅したことを型で確かめたい場合は KnownScheduleReason を使う。
 * @public
 */
export type ScheduleReason = KnownScheduleReason | (string & {});

/**
 * 1 日分の値と、その値を決めた規則。
 * @public
 */
export interface ScheduleDay<T, Kind extends string = string> {
  readonly date: DateString;
  readonly weekday: Weekday;
  readonly value: T;
  /** 値を決めた規則 */
  readonly reason: ScheduleReason;
  /** 値を決めた規則の名前（dates・annual の name、祝日なら祝日名） */
  readonly name?: string;
  /** その日が祝日なら祝日（holiday の規則に関係なく付く） */
  readonly holiday?: Holiday<Kind>;
}

/**
 * 暦日と時刻（カレンダーのタイムゾーン）。
 * @public
 */
export interface CivilDateTimeParts {
  /** 暦日 "YYYY-MM-DD" */
  readonly date: DateString;
  /** 時刻 "HH:mm"。暦日だけの入力では null */
  readonly time: string | null;
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

  /** 入力をタイムゾーンでの暦日に変換する */
  dateOf(input: DateInput): DateString;
  /** 入力をタイムゾーンでの暦日と時刻に変換する */
  civilOf(input: DateInput): CivilDateTimeParts;
  /** 今日の日付（タイムゾーン） */
  today(now?: Date): DateString;

  /** 祝日か */
  isHoliday(input: DateInput): boolean;
  /** 祝日なら祝日を返す */
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
export interface Schedule<T, Kind extends string = string> extends HolidayLookup<Kind> {
  /** その日の値 */
  valueOn(input: DateInput): T;
  /** その日の値と、値を決めた規則 */
  dayInfo(input: DateInput): ScheduleDay<T, Kind>;
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
export interface DateRule<T> {
  readonly from: number;
  readonly to: number;
  readonly value: T;
  readonly name: string | undefined;
}

/** @internal 毎年の月日の規則 */
export interface AnnualRule<T> {
  readonly from: string;
  readonly to: string;
  readonly value: T;
  readonly name: string | undefined;
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
      "invalid-month-day",
      path,
      `Invalid month-day ${JSON.stringify(value)} (expected MM-DD)`,
    );
    return undefined;
  }
  return value;
}

/**
 * @internal 個別の日付の規則を検証して取り込む。
 * entry は "YYYY-MM-DD"・{ date }・{ from, to } のいずれか。値は valueOf で決める
 */
export function compileDateRules<T>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: (entry: Record<string, unknown>, path: string) => T | undefined,
  allowString: boolean,
): DateRule<T>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: DateRule<T>[] = [];
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
      if (n !== undefined && value !== undefined) rules.push({ from: n, to: n, value, name });
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
    if (value !== undefined) rules.push({ from, to, value, name });
  });
  return rules;
}

/** @internal 毎年の月日の規則を検証して取り込む（entry は "MM-DD"・{ date }・{ from, to }） */
export function compileAnnualRules<T>(
  c: IssueCollector,
  path: string,
  entries: unknown,
  valueOf: (entry: Record<string, unknown>, path: string) => T | undefined,
  allowString: boolean,
): AnnualRule<T>[] {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    c.error("invalid-option", path, "must be an array");
    return [];
  }
  const rules: AnnualRule<T>[] = [];
  entries.forEach((raw: unknown, i) => {
    const p = `${path}[${i}]`;
    const entry: unknown = allowString && typeof raw === "string" ? { date: raw } : raw;
    if (!isObject(entry)) {
      c.error(
        "invalid-option",
        p,
        allowString ? "must be a month-day string or an object" : "must be an object",
      );
      return;
    }
    const value = valueOf(entry, p);
    const name = checkName(c, p, entry["name"]);
    if ("date" in entry) {
      checkUnknownKeys(c, p, entry, ["date", "name", "value"]);
      const md = checkMonthDay(c, `${p}.date`, entry["date"]);
      if (md !== undefined && value !== undefined) rules.push({ from: md, to: md, value, name });
      return;
    }
    if (!("from" in entry) || !("to" in entry)) {
      c.error("invalid-option", p, 'must have "date" or both "from" and "to"');
      return;
    }
    checkUnknownKeys(c, p, entry, ["from", "to", "name", "value"]);
    const from = checkMonthDay(c, `${p}.from`, entry["from"]);
    const to = checkMonthDay(c, `${p}.to`, entry["to"]);
    if (from !== undefined && to !== undefined && value !== undefined) {
      rules.push({ from, to, value, name });
    }
  });
  return rules;
}

/** 規則の value を取り出す（value が必須の規則用） */
function requiredValue<T>(c: IssueCollector) {
  return (entry: Record<string, unknown>, path: string): T | undefined => {
    if (!("value" in entry)) {
      c.error("invalid-option", path, 'must have "value"');
      return undefined;
    }
    return entry["value"] as T;
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
  readonly outOfRange: "throw" | "ignore";
}

/** @internal 祝日の提供元とタイムゾーンの設定を検証する */
export function compileHolidaySource<Kind extends string>(
  c: IssueCollector,
  options: Record<string, unknown>,
): HolidaySource<Kind> {
  const raw = options["holidays"];
  const list: unknown[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const providers: HolidayProvider<Kind>[] = [];
  list.forEach((p, i) => {
    const path = Array.isArray(raw) ? `holidays[${i}]` : "holidays";
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

  const outOfRange = options["outOfRange"] ?? "throw";
  if (outOfRange !== "throw" && outOfRange !== "ignore") {
    c.error("invalid-option", "outOfRange", 'must be "throw" or "ignore"');
  }
  return {
    providers: Object.freeze(providers),
    timeZone,
    outOfRange: outOfRange === "ignore" ? "ignore" : "throw",
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
    return Object.freeze({ date, name, nameEn, kind: kind as Kind, confirmed });
  });
}

/** @internal 祝日を調べる機能を作る（設定は検証済みであること） */
export function createHolidayLookup<Kind extends string>(
  source: HolidaySource<Kind>,
): HolidayLookup<Kind> & { holidayOn(date: DateString): Holiday<Kind> | undefined } {
  const { providers, timeZone, outOfRange } = source;
  const yearCache = new Map<number, Map<DateString, Holiday<Kind>>>();

  function holidayMap(year: number): Map<DateString, Holiday<Kind>> {
    let map = yearCache.get(year);
    if (!map) {
      map = new Map();
      for (const provider of providers) {
        const { from, to } = provider.supportedYears;
        if (year < from || year > to) {
          if (outOfRange === "ignore") continue;
          throw rangeError(
            "out-of-range",
            `Holidays for ${provider.id} are supported for ${from}-${to}; requested ${year}`,
          );
        }
        for (const h of loadProviderYear(provider, year)) {
          // 同じ日に複数の提供元の祝日がある場合は、先に渡した提供元を優先する
          if (!map.has(h.date)) map.set(h.date, h);
        }
      }
      yearCache.set(year, map);
    }
    return map;
  }

  function holidayOn(date: DateString): Holiday<Kind> | undefined {
    if (providers.length === 0) return undefined;
    return holidayMap(parseDate(date).year).get(date);
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
    holidayOn,
    dateOf,
    civilOf: (input) => toDateTimeParts(input, timeZone),
    today: (now = new Date()) => instantToCivil(now.getTime(), timeZone).date,
    isHoliday: (input) => holidayOn(dateOf(input)) !== undefined,
    getHoliday: (input) => holidayOn(dateOf(input)),
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
export interface CompiledSchedule<T, Kind extends string> {
  readonly source: HolidaySource<Kind>;
  readonly weekly: readonly T[];
  readonly holiday: HolidayRule<T>;
  readonly annual: readonly AnnualRule<T>[];
  readonly dates: readonly DateRule<T>[];
}

const SCHEDULE_OPTION_KEYS = [
  "holidays",
  "timeZone",
  "outOfRange",
  "weekly",
  "holiday",
  "annual",
  "dates",
];

/** @internal スケジュールの設定を検証して取り込む（誤りは c に集める） */
export function compileScheduleOptions<T, Kind extends string>(
  c: IssueCollector,
  options: unknown,
): CompiledSchedule<T, Kind> | undefined {
  if (!isObject(options)) {
    c.error("invalid-option", "", "options must be an object");
    return undefined;
  }
  checkUnknownKeys(c, "", options, SCHEDULE_OPTION_KEYS);
  const source = compileHolidaySource<Kind>(c, options);

  const weeklyRaw = options["weekly"];
  let weekly: readonly T[] = [];
  if (!Array.isArray(weeklyRaw) || weeklyRaw.length !== 7) {
    c.error("invalid-option", "weekly", "must have 7 values ([Sunday, Monday, ..., Saturday])");
  } else {
    weekly = Object.freeze([...(weeklyRaw as T[])]);
  }

  let holiday: HolidayRule<T> = "weekday";
  const holidayRaw = options["holiday"];
  if (holidayRaw === undefined || holidayRaw === "weekday") {
    holiday = "weekday";
  } else if (isObject(holidayRaw) && "sameAs" in holidayRaw) {
    if (isWeekday(holidayRaw["sameAs"])) holiday = Object.freeze({ sameAs: holidayRaw["sameAs"] });
    else
      c.error(
        "invalid-weekday",
        "holiday.sameAs",
        "must be an integer from 0 (Sunday) to 6 (Saturday)",
      );
  } else if (isObject(holidayRaw) && "value" in holidayRaw) {
    holiday = Object.freeze({ value: holidayRaw["value"] as T });
  } else {
    c.error("invalid-option", "holiday", 'must be "weekday", { sameAs: weekday } or { value }');
  }

  const annual = compileAnnualRules<T>(c, "annual", options["annual"], requiredValue<T>(c), false);
  const dates = compileDateRules<T>(c, "dates", options["dates"], requiredValue<T>(c), false);
  return { source, weekly, holiday, annual, dates };
}

function matchAnnual(rule: AnnualRule<unknown>, monthDay: string): boolean {
  return rule.from <= rule.to
    ? monthDay >= rule.from && monthDay <= rule.to
    : monthDay >= rule.from || monthDay <= rule.to;
}

/** @internal 検証済みの規則からスケジュールを作る */
export function buildSchedule<T, Kind extends string>(
  compiled: CompiledSchedule<T, Kind>,
): Schedule<T, Kind> {
  const { weekly, holiday: holidayRule, annual, dates } = compiled;
  const lookup = createHolidayLookup(compiled.source);

  function info(date: DateString): ScheduleDay<T, Kind> {
    const dayNumber = toDayNumber(date);
    const weekday = weekdayOf(date);
    const holiday = lookup.holidayOn(date);
    const make = (
      value: T,
      reason: KnownScheduleReason,
      name: string | undefined,
    ): ScheduleDay<T, Kind> => {
      const result: { -readonly [K in keyof ScheduleDay<T, Kind>]: ScheduleDay<T, Kind>[K] } = {
        date,
        weekday,
        value,
        reason,
      };
      if (name !== undefined) result.name = name;
      if (holiday !== undefined) result.holiday = holiday;
      return Object.freeze(result);
    };

    const byDate = dates.find((r) => dayNumber >= r.from && dayNumber <= r.to);
    if (byDate) return make(byDate.value, "date", byDate.name);
    const monthDay = date.slice(5);
    const byAnnual = annual.find((r) => matchAnnual(r, monthDay));
    if (byAnnual) return make(byAnnual.value, "annual", byAnnual.name);
    if (holiday && holidayRule !== "weekday") {
      const value = "sameAs" in holidayRule ? weekly[holidayRule.sameAs] : holidayRule.value;
      return make(value as T, "holiday", holiday.name);
    }
    return make(weekly[weekday] as T, "weekday", undefined);
  }

  const schedule: Schedule<T, Kind> = {
    timeZone: lookup.timeZone,
    providers: lookup.providers,
    dateOf: lookup.dateOf,
    civilOf: lookup.civilOf,
    today: lookup.today,
    isHoliday: lookup.isHoliday,
    getHoliday: lookup.getHoliday,
    holidaysInYear: lookup.holidaysInYear,
    holidaysBetween: lookup.holidaysBetween,
    valueOn: (input) => info(lookup.dateOf(input)).value,
    dayInfo: (input) => info(lookup.dateOf(input)),
  };
  return Object.freeze(schedule);
}

/**
 * 曜日・祝日・特定日の規則から、日ごとに値を返すスケジュールを作る。
 *
 * 設定は作る時点で複製されるので、あとから元の配列やオブジェクトを書き換えても結果は変わらない
 * （値 T そのものは複製しない）。設定の誤りは code 付きの RangeError になる。
 * @public
 */
export function createSchedule<T, Kind extends string = string>(
  options: ScheduleOptions<T, Kind>,
): Schedule<T, Kind> {
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<T, Kind>(c, options);
  c.throwFirstError();
  return buildSchedule(compiled!);
}
