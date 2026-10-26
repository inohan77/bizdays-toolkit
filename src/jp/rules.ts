/**
 * 日本の祝日（「国民の祝日に関する法律」と特例法）の計算。
 *
 * - 国民の祝日: 年ごとの規則で計算する（ハッピーマンデー・五輪特措法による移動を含む）
 * - 皇室行事による休日: 特例法ごとの日付をテーブルで持つ
 * - 振替休日: 1973-04-12 以降。2007 年からは「その日後で最も近い国民の祝日でない日」
 * - 国民の休日: 1985-12-27 以降。前日と翌日が国民の祝日である日
 * - 識別子（key）: 祝日法の各祝日に 1 つ（KnownJapaneseHolidayKey）。振替休日は元の祝日の key、国民の休日・特例の休日は持たない
 * - 春分・秋分の日: 天文計算による近似式。官報公表済みの年（CONFIRMED_THROUGH）までは確定値と一致することを
 *   内閣府の CSV で検証している。それより後の年は confirmed: false
 */

import {
  addDays,
  formatDate,
  nthWeekdayOfMonth,
  weekdayOf,
  type DateString,
} from "../core/date.ts";
import { rangeError } from "../core/errors.ts";
import type { Holiday } from "../core/types.ts";

/**
 * 日本の祝日・休日の種別（既知の値）。
 * @public
 */
export type KnownJapaneseHolidayKind =
  /** 国民の祝日 */
  | "national"
  /** 振替休日 */
  | "substitute"
  /** 国民の休日（祝日に挟まれた日） */
  | "citizens"
  /** 皇室行事などによる特例の休日 */
  | "special";

/**
 * 日本の祝日・休日の種別。将来の版で値が増えることがあるので、分岐では「その他」も扱うこと。
 * すべての値を網羅したことを型で確かめたい場合は KnownJapaneseHolidayKind を使う。
 * @public
 */
export type JapaneseHolidayKind = KnownJapaneseHolidayKind | (string & {});

/**
 * 日本の国民の祝日の識別子（Holiday.key。既知の値）。祝日法の各祝日に 1 つで、日付の移動や改名があっても同じ祝日なら同じ値
 * （天皇誕生日は 4/29・12/23・2/23 とも "emperors-birthday"、体育の日とスポーツの日は "sports"）。
 * 振替休日は元の祝日の key を持ち、国民の休日と特例の休日は key を持たない。
 * 規則の keys に書くときの補完に使う（型は開いているので他の文字列も通る）。
 * @public
 */
export type KnownJapaneseHolidayKey =
  | "new-year"
  | "coming-of-age"
  | "national-foundation"
  | "emperors-birthday"
  | "vernal-equinox"
  | "showa"
  | "constitution-memorial"
  | "greenery"
  | "childrens"
  | "marine"
  | "mountain"
  | "respect-for-the-aged"
  | "autumnal-equinox"
  | "sports"
  | "culture"
  | "labor-thanksgiving";

/** @internal 対応年 */
export const SUPPORTED_YEARS = Object.freeze({ from: 1955, to: 2099 });
/** @internal 春分・秋分の日が官報で確定している最後の年 */
export const CONFIRMED_THROUGH = 2027;
/** @internal 反映済みの官報の年月（2027 年の春分・秋分の日の公表） */
export const DATA_VERSION = "2026-02";

const SUBSTITUTE_START = "1973-04-12";
const SUBSTITUTE_2007 = "2007-01-01";
const CITIZENS_START = "1985-12-27";

interface Entry {
  readonly date: DateString;
  readonly name: string;
  readonly nameEn: string;
  readonly kind: KnownJapaneseHolidayKind;
  /** 春分・秋分の日、またはそれに由来する休日 */
  readonly equinox: boolean;
  /** 観測している祝日の識別子（振替休日は元の祝日のもの。国民の休日・特例の休日は持たない） */
  readonly key?: KnownJapaneseHolidayKey;
}

/** 皇室行事などによる特例の休日（それぞれの特例法による） */
const SPECIAL_DAYS: readonly Omit<Entry, "kind" | "equinox">[] = [
  {
    date: "1959-04-10",
    name: "皇太子明仁親王の結婚の儀",
    nameEn: "Wedding Ceremony of Crown Prince Akihito",
  },
  { date: "1989-02-24", name: "昭和天皇の大喪の礼", nameEn: "Funeral Ceremony of Emperor Showa" },
  { date: "1990-11-12", name: "即位礼正殿の儀", nameEn: "Enthronement Ceremony" },
  {
    date: "1993-06-09",
    name: "皇太子徳仁親王の結婚の儀",
    nameEn: "Wedding Ceremony of Crown Prince Naruhito",
  },
  { date: "2019-05-01", name: "天皇の即位の日", nameEn: "Enthronement Day" },
  { date: "2019-10-22", name: "即位礼正殿の儀の行われる日", nameEn: "Enthronement Ceremony Day" },
];

// 近似式の int() は 0 方向への切り捨て。1979 年以前は (year - 1983) / 4 が負になるため
// Math.floor ではなく Math.trunc を使う（floor だと 1 日ずれる年がある）

/** @internal 春分日（3 月の日） */
export function vernalEquinoxDay(year: number): number {
  if (year <= 1979) {
    return Math.floor(20.8357 + 0.242194 * (year - 1980) - Math.trunc((year - 1983) / 4));
  }
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** @internal 秋分日（9 月の日） */
export function autumnalEquinoxDay(year: number): number {
  if (year <= 1979) {
    return Math.floor(23.2588 + 0.242194 * (year - 1980) - Math.trunc((year - 1983) / 4));
  }
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** 国民の祝日と特例の休日（振替休日・国民の休日を除く） */
function baseHolidays(y: number): Entry[] {
  const list: Entry[] = [];
  const add = (
    date: DateString,
    name: string,
    nameEn: string,
    key: KnownJapaneseHolidayKey,
    equinox = false,
  ): void => {
    list.push({ date, name, nameEn, kind: "national", equinox, key });
  };
  const md = (month: number, day: number): DateString => formatDate(y, month, day);
  const monday = (month: number, n: number): DateString => nthWeekdayOfMonth(y, month, 1, n);

  add(md(1, 1), "元日", "New Year's Day", "new-year");
  add(y <= 1999 ? md(1, 15) : monday(1, 2), "成人の日", "Coming of Age Day", "coming-of-age");
  if (y >= 1967) add(md(2, 11), "建国記念の日", "National Foundation Day", "national-foundation");
  if (y >= 2020) add(md(2, 23), "天皇誕生日", "The Emperor's Birthday", "emperors-birthday");
  add(md(3, vernalEquinoxDay(y)), "春分の日", "Vernal Equinox Day", "vernal-equinox", true);
  if (y <= 1988) add(md(4, 29), "天皇誕生日", "The Emperor's Birthday", "emperors-birthday");
  else if (y <= 2006) add(md(4, 29), "みどりの日", "Greenery Day", "greenery");
  else add(md(4, 29), "昭和の日", "Showa Day", "showa");
  add(md(5, 3), "憲法記念日", "Constitution Memorial Day", "constitution-memorial");
  if (y >= 2007) add(md(5, 4), "みどりの日", "Greenery Day", "greenery");
  add(md(5, 5), "こどもの日", "Children's Day", "childrens");

  // 海の日（1996〜）。2020・2021 年は五輪特措法による移動
  if (y === 2020) add(md(7, 23), "海の日", "Marine Day", "marine");
  else if (y === 2021) add(md(7, 22), "海の日", "Marine Day", "marine");
  else if (y >= 2003) add(monday(7, 3), "海の日", "Marine Day", "marine");
  else if (y >= 1996) add(md(7, 20), "海の日", "Marine Day", "marine");

  // スポーツの日（2020〜）。2020・2021 年は五輪特措法による移動
  if (y === 2020) add(md(7, 24), "スポーツの日", "Sports Day", "sports");
  else if (y === 2021) add(md(7, 23), "スポーツの日", "Sports Day", "sports");

  // 山の日（2016〜）。2020・2021 年は五輪特措法による移動
  if (y === 2020) add(md(8, 10), "山の日", "Mountain Day", "mountain");
  else if (y === 2021) add(md(8, 8), "山の日", "Mountain Day", "mountain");
  else if (y >= 2016) add(md(8, 11), "山の日", "Mountain Day", "mountain");

  if (y >= 2003) add(monday(9, 3), "敬老の日", "Respect for the Aged Day", "respect-for-the-aged");
  else if (y >= 1966)
    add(md(9, 15), "敬老の日", "Respect for the Aged Day", "respect-for-the-aged");
  add(md(9, autumnalEquinoxDay(y)), "秋分の日", "Autumnal Equinox Day", "autumnal-equinox", true);

  if (y >= 2022) add(monday(10, 2), "スポーツの日", "Sports Day", "sports");
  else if (y >= 2000 && y <= 2019)
    add(monday(10, 2), "体育の日", "Health and Sports Day", "sports");
  else if (y >= 1966 && y <= 1999) add(md(10, 10), "体育の日", "Health and Sports Day", "sports");

  add(md(11, 3), "文化の日", "Culture Day", "culture");
  add(md(11, 23), "勤労感謝の日", "Labor Thanksgiving Day", "labor-thanksgiving");
  if (y >= 1989 && y <= 2018)
    add(md(12, 23), "天皇誕生日", "The Emperor's Birthday", "emperors-birthday");

  for (const s of SPECIAL_DAYS) {
    if (s.date.startsWith(`${y}-`)) list.push({ ...s, kind: "special", equinox: false });
  }
  return list.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** @internal その年の祝日・休日（日付順） */
export function computeJapaneseHolidays(year: number): Holiday<JapaneseHolidayKind>[] {
  if (!Number.isInteger(year) || year < SUPPORTED_YEARS.from || year > SUPPORTED_YEARS.to) {
    throw rangeError(
      "out-of-range",
      `Japanese holidays are supported for ${SUPPORTED_YEARS.from}-${SUPPORTED_YEARS.to}; requested ${year}`,
    );
  }
  const base = baseHolidays(year);
  const byDate = new Map<DateString, Entry>(base.map((e) => [e.date, e]));
  // 振替休日・国民の休日の判定に使う「国民の祝日」（特例の休日も祝日として扱われる）
  const isNational = (date: DateString): boolean => byDate.has(date);
  const extra: Entry[] = [];

  // 振替休日
  for (const h of base) {
    if (h.date < SUBSTITUTE_START || weekdayOf(h.date) !== 0) continue;
    let day = addDays(h.date, 1);
    if (h.date >= SUBSTITUTE_2007) {
      while (isNational(day)) day = addDays(day, 1);
    } else if (isNational(day)) {
      continue;
    }
    extra.push({
      date: day,
      name: "振替休日",
      nameEn: "Substitute Holiday",
      kind: "substitute",
      equinox: h.equinox,
      ...(h.key === undefined ? {} : { key: h.key }),
    });
  }

  // 国民の休日（前日と翌日が国民の祝日である日）
  for (const h of base) {
    const day = addDays(h.date, 1);
    const next = addDays(h.date, 2);
    if (day < CITIZENS_START || isNational(day) || !isNational(next)) continue;
    // 2006 年までは日曜日と振替休日を除く
    if (day < SUBSTITUTE_2007 && (weekdayOf(day) === 0 || extra.some((e) => e.date === day)))
      continue;
    if (extra.some((e) => e.date === day)) continue;
    const equinox = h.equinox || byDate.get(next)!.equinox;
    extra.push({
      date: day,
      name: "国民の休日",
      nameEn: "Citizens' Holiday",
      kind: "citizens",
      equinox,
    });
  }

  return [...base, ...extra]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) =>
      Object.freeze({
        date: e.date,
        name: e.name,
        nameEn: e.nameEn,
        kind: e.kind,
        confirmed: year <= CONFIRMED_THROUGH || !e.equinox,
        ...(e.key === undefined ? {} : { key: e.key }),
      }),
    );
}
