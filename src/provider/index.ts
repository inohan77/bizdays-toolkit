/**
 * 祝日の提供元（HolidayProvider）を実装する人向けの暦の計算（bizdays-toolkit/provider）。
 *
 * 多くの国・地域の祝日は「月の第 n 何曜日」（米国の連邦祝日など）と「復活祭からの日数」（ヨーロッパの多くの国）で
 * 書ける。この 2 種類の計算と、月の日数・うるう年の判定を、ライブラリ内部で使っている実装のまま公開する
 * （復活祭の計算は、同梱の提供元の公式データとの照合で確かめている）。ルートの addDays・weekdayOf と組み合わせて使う。
 * 週末に当たった祝日の振替（withSubstituteDays）は、振替のある同梱の提供元が使う計算と同じ定義で、同梱の提供元の
 * 照合済みの結果と一致することをテストで確かめている（同梱の提供元の実装そのものは置き換えていない）。
 * 同梱の提供元の実装とは別に、アプリの本体に不要なものが入らないようサブパスに分けている。
 *
 */

import {
  addDays,
  lengthOfMonth as daysInMonthOf,
  easterSunday as easterSundayOf,
  formatDate,
  isLeapYear as isLeapYearOf,
  isValidDate,
  nthWeekdayOfMonth as nthWeekdayOfMonthIn,
  parseDate,
  weekdayOf,
  type DateString,
  type Weekday,
} from "../core/date.ts";
import { renameKeys } from "../core/renamed.ts";
import { rangeError, typeError } from "../core/errors.ts";
import { HOLIDAY_KEY_PATTERN, type Holiday } from "../core/types.ts";

function checkYear(year: unknown): asserts year is number {
  if (!Number.isInteger(year) || (year as number) < 1000 || (year as number) > 9999) {
    throw rangeError(
      "invalid-argument",
      `year must be an integer from 1000 to 9999: ${String(year)}`,
    );
  }
}

function checkMonth(month: unknown): asserts month is number {
  if (!Number.isInteger(month) || (month as number) < 1 || (month as number) > 12) {
    throw rangeError("invalid-argument", `month must be an integer from 1 to 12: ${String(month)}`);
  }
}

/**
 * 復活祭の日曜日（グレゴリオ暦）。Good Friday は −2 日、Easter Monday は +1 日、Ascension は +39 日、
 * Whit Monday は +50 日、Corpus Christi は +60 日（ルートの addDays で求める）。
 * 年は 1000〜9999 の整数（それ以外は invalid-argument）。
 * @public
 */
export function easterSunday(year: number): DateString {
  checkYear(year);
  return easterSundayOf(year);
}

/**
 * その月の第 n 何曜日（n は 1〜5、-1 は最後。曜日は 0 = 日曜日〜6 = 土曜日）。
 * 例: 1 月の第 3 月曜日は nthWeekdayOfMonth(2026, 1, 1, 3)、5 月の最終月曜日は nthWeekdayOfMonth(2026, 5, 1, -1)。
 * その月に n 回目のその曜日がないとき（第 5 回目）は invalid-argument。
 * @public
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  n: number,
): DateString {
  checkYear(year);
  checkMonth(month);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw rangeError(
      "invalid-weekday",
      `weekday must be an integer from 0 (Sunday) to 6 (Saturday): ${String(weekday)}`,
    );
  }
  if (!Number.isInteger(n) || n === 0 || n < -1 || n > 5) {
    throw rangeError(
      "invalid-argument",
      `n must be an integer from 1 to 5, or -1 (last): ${String(n)}`,
    );
  }
  const days = daysInMonthOf(year, month);
  if (n === -1) {
    const last = formatDate(year, month, days);
    const offset = (weekdayOf(last) - weekday + 7) % 7;
    return formatDate(year, month, days - offset);
  }
  const first = ((weekday - weekdayOf(formatDate(year, month, 1)) + 7) % 7) + 1;
  if (first + (n - 1) * 7 > days) {
    throw rangeError(
      "invalid-argument",
      `${year}-${String(month).padStart(2, "0")} has no ${n}th weekday ${weekday}`,
    );
  }
  return nthWeekdayOfMonthIn(year, month, weekday, n);
}

/**
 * その月の日数（28〜31）。
 * @public
 */
export function lengthOfMonth(year: number, month: number): number {
  checkYear(year);
  checkMonth(month);
  return daysInMonthOf(year, month);
}

/**
 * うるう年か（グレゴリオ暦）。
 * @public
 */
export function isLeapYear(year: number): boolean {
  checkYear(year);
  return isLeapYearOf(year);
}

/**
 * 振替の向き。"next" はその日より後で最初の振替先、"previous" はその日より前で最初の振替先。
 * @public
 */
export type SubstituteDirection = "next" | "previous";

/**
 * withSubstituteDays の設定。
 * @public
 */
export interface WithSubstituteDaysOptions<Kind extends string> {
  /**
   * 振り替える曜日と向き（0 = 日曜日〜6 = 土曜日）。書いた曜日に当たる祝日だけを振り替える。
   * 例: 日本・シンガポールは { 0: "next" }、英国は { 6: "next", 0: "next" }、米国の連邦祝日は { 6: "previous", 0: "next" }。
   * 振替先は、入力の祝日でも、それまでに決めた振替日でも、ここに書いた曜日でもない最初の日
   */
  readonly directions: Readonly<Partial<Record<Weekday, SubstituteDirection>>>;
  /** 振替日に付ける種別（Holiday.kind。例: "substitute"、"observed"） */
  readonly kind: Kind;
  /**
   * 振替日の名称。省略時は元の祝日の name・nameEn（と names）を引き継ぐ（GOV.UK・MOM の流儀）。
   * 変えるなら元の祝日を受け取って返す関数で（例: 日本の「振替休日」、米国の "(observed)"）
   */
  readonly renameSubstitute?: (holiday: Holiday<Kind>) => {
    readonly name: string;
    readonly nameEn: string;
  };
  /**
   * 元の祝日（振り替えた曜日に当たった日）を結果に残すか。"keep"（既定）は残す（日本・シンガポール）、
   * "drop" は振替日だけにする（GOV.UK の一覧は週末の日を載せない）
   */
  readonly originalPolicy?: "keep" | "drop";
  /** @deprecated 0.30.0 で renameSubstitute に改名した。1.0.0 で削除する */
  readonly name?: (holiday: Holiday<Kind>) => { readonly name: string; readonly nameEn: string };
  /** @deprecated 0.30.0 で originalPolicy に改名した。1.0.0 で削除する */
  readonly original?: "keep" | "drop";
}

function checkHolidays<Kind extends string>(holidays: unknown): readonly Holiday<Kind>[] {
  if (!Array.isArray(holidays)) {
    throw typeError("invalid-argument", "holidays must be an array of Holiday");
  }
  let year: number | undefined;
  const seen = new Set<string>();
  holidays.forEach((h: unknown, i) => {
    if (typeof h !== "object" || h === null) {
      throw typeError("invalid-argument", `holidays[${i}] is not an object`);
    }
    const { date, name, nameEn, kind, confirmed, key } = h as Record<string, unknown>;
    if (!isValidDate(date)) {
      throw rangeError(
        "invalid-date",
        `holidays[${i}] has an invalid date ${JSON.stringify(date)}`,
      );
    }
    const y = parseDate(date).year;
    if (year === undefined) year = y;
    else if (y !== year) {
      throw rangeError(
        "invalid-argument",
        `holidays must be in one year: ${holidays[0].date} and ${date}`,
      );
    }
    if (seen.has(date))
      throw rangeError("invalid-argument", `holidays has a duplicate date ${date}`);
    seen.add(date);
    if (typeof name !== "string" || typeof nameEn !== "string" || typeof kind !== "string") {
      throw typeError(
        "invalid-argument",
        `holidays[${i}] (${date}) must have string name, nameEn and kind`,
      );
    }
    if (typeof confirmed !== "boolean") {
      throw typeError("invalid-argument", `holidays[${i}] (${date}) must have boolean confirmed`);
    }
    if (key !== undefined && (typeof key !== "string" || !HOLIDAY_KEY_PATTERN.test(key))) {
      throw typeError(
        "invalid-argument",
        `holidays[${i}] (${date}) key must match ${String(HOLIDAY_KEY_PATTERN)}: ${JSON.stringify(key)}`,
      );
    }
  });
  return holidays as readonly Holiday<Kind>[];
}

interface CheckedOptions<Kind extends string> {
  readonly directions: Readonly<Partial<Record<Weekday, SubstituteDirection>>>;
  readonly kind: Kind;
  readonly renameSubstitute?: (holiday: Holiday<Kind>) => {
    readonly name: string;
    readonly nameEn: string;
  };
  readonly originalPolicy?: "keep" | "drop";
}

function checkOptions<Kind extends string>(options: unknown): CheckedOptions<Kind> {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw typeError("invalid-argument", "options must be an object");
  }
  const o = renameKeys("throw", ["substitute"], "options", options as Record<string, unknown>);
  const { directions: rules, kind, renameSubstitute: name, originalPolicy: original } = o;
  if (typeof rules !== "object" || rules === null) {
    throw typeError(
      "invalid-argument",
      'options.directions must be an object of { [weekday]: "next" | "previous" }',
    );
  }
  for (const [weekday, direction] of Object.entries(rules)) {
    if (!/^[0-6]$/.test(weekday)) {
      throw rangeError(
        "invalid-weekday",
        `options.directions has a weekday that is not 0 (Sunday) to 6 (Saturday): ${JSON.stringify(weekday)}`,
      );
    }
    if (direction !== "next" && direction !== "previous") {
      throw rangeError(
        "invalid-argument",
        `options.directions[${weekday}] must be "next" or "previous": ${JSON.stringify(direction)}`,
      );
    }
  }
  if (typeof kind !== "string" || kind === "") {
    throw typeError("invalid-argument", "options.kind must be a non-empty string (Holiday.kind)");
  }
  if (name !== undefined && typeof name !== "function") {
    throw typeError(
      "invalid-argument",
      "options.renameSubstitute must be a function (holiday) => { name, nameEn }",
    );
  }
  if (original !== undefined && original !== "keep" && original !== "drop") {
    throw rangeError("invalid-argument", 'options.originalPolicy must be "keep" or "drop"');
  }
  return o as unknown as CheckedOptions<Kind>;
}

/**
 * 週末などに当たった祝日の振替日を計算し、入力の祝日に振替日を足して日付順に返す（提供元を実装するための道具）。
 *
 * 定義（英国の附則・シンガポールの Holidays Act・日本の祝日法と同じ）: 入力を日付順に走査し、directions の曜日に当たる祝日ごとに、
 * 指定の向きで「入力の祝日でも、それまでに決めた振替日でも、directions の曜日でもない最初の日」を振替日にする。祝日が続く
 * 週末（Christmas Day が土曜日、Boxing Day が日曜日）は順に先へ送られる。振替日自身は別の祝日の振替の対象にならない。
 * 振替日は元の祝日の key・names・confirmed を引き継ぎ、kind は options.kind、名称は省略時は元の祝日のもの。
 *
 * 入力は同じ年の祝日で、日付が有効・重複がないこと（誤りは invalid-argument・invalid-date・invalid-weekday の例外）。
 * 振替日は年をまたぐことがある（12 月 31 日が祝日の国で日曜日なら翌年の 1 月 1 日）。提供元の holidaysInYear は
 * その年の日付だけを返す契約なので、そうなる国では翌年の分として扱うこと。
 * 国民の休日（2 つの祝日に挟まれた日）のような国に固有の規則は含まない。
 *
 * @example 米国の連邦祝日（土曜日は前の金曜日、日曜日は次の月曜日）
 * withSubstituteDays(federal, { directions: { 6: "previous", 0: "next" }, kind: "observed",
 *   renameSubstitute: (h) => ({ name: `${h.name} (observed)`, nameEn: `${h.nameEn} (observed)` }) });
 * @example 日本の振替休日（日曜日の祝日を、その日の後で最も近い祝日でない日へ）
 * withSubstituteDays(holidays, { directions: { 0: "next" }, kind: "substitute",
 *   renameSubstitute: () => ({ name: "振替休日", nameEn: "Substitute Holiday" }) });
 * @public
 */
export function withSubstituteDays<Kind extends string>(
  holidays: readonly Holiday<Kind>[],
  options: WithSubstituteDaysOptions<Kind>,
): Holiday<Kind>[] {
  const input = checkHolidays<Kind>(holidays);
  const {
    directions: rules,
    kind,
    renameSubstitute: name,
    originalPolicy: original,
  } = checkOptions<Kind>(options);
  const sorted = [...input].sort((a, b) => (a.date < b.date ? -1 : 1));
  const taken = new Set<DateString>(sorted.map((h) => h.date));
  const result: Holiday<Kind>[] = sorted.filter(
    (h) => original !== "drop" || rules[weekdayOf(h.date)] === undefined,
  );
  for (const h of sorted) {
    const direction = rules[weekdayOf(h.date)];
    if (direction === undefined) continue;
    const step = direction === "next" ? 1 : -1;
    let day = addDays(h.date, step);
    while (taken.has(day) || rules[weekdayOf(day)] !== undefined) day = addDays(day, step);
    taken.add(day);
    const named = name === undefined ? { name: h.name, nameEn: h.nameEn } : name(h);
    result.push(
      Object.freeze({
        date: day,
        name: named.name,
        nameEn: named.nameEn,
        ...(h.names === undefined ? {} : { names: h.names }),
        kind,
        confirmed: h.confirmed,
        ...(h.key === undefined ? {} : { key: h.key }),
      }),
    );
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * @deprecated 0.30.0 で withSubstituteDays に改名した。1.0.0 で削除する
 * @public
 */
export const substituteDays: typeof withSubstituteDays = withSubstituteDays;

/**
 * @deprecated 0.30.0 で lengthOfMonth に改名した。1.0.0 で削除する
 * @public
 */
export const daysInMonth: typeof lengthOfMonth = lengthOfMonth;

/**
 * @deprecated 0.30.0 で WithSubstituteDaysOptions に改名した。1.0.0 で削除する
 * @public
 */
export type SubstituteDaysOptions<Kind extends string> = WithSubstituteDaysOptions<Kind>;
