/**
 * フランスの祝日（jours fériés。労働法典 L3133-1 の 11 日と、Alsace-Moselle の 2 日）の計算。
 *
 * - 固定日の祝日（1/1・5/1・5/8・7/14・8/15・11/1・11/11・12/25。Alsace-Moselle は 12/26 も）と、
 *   復活祭から決まる祝日（Lundi de Pâques = +1 日、Ascension = +39 日、Lundi de Pentecôte = +50 日。
 *   Alsace-Moselle は Vendredi saint = −2 日も）を規則で計算する。振替はない
 * - 2 つの祝日が同じ日に当たる年（復活祭が 3 月 23 日なら 5 月 1 日 = Ascension（2008 年）、3 月 30 日なら 5 月 8 日 = Ascension（2059 年））は、
 *   復活祭から決まる祝日の名称・識別子で 1 件にする
 *   （data.gouv.fr の JSON と同じ扱い。提供元は 1 日に 1 件を返す契約のため）
 * - 名称は data.gouv.fr の表記（フランス語）。nameEn はライブラリの英訳
 * - 識別子（key）は英語名から 1 つずつ（KnownFrHolidayKey）
 *
 * 対応年のうち data.gouv.fr が公開している範囲（過去 20 年・未来 5 年）のすべての日付と名称が一致することを、
 * テスト用フィクスチャ（test/fixtures/datagouv-jours-feries.json）で検証している。祝日は法令で定まり年ごとの告示はないので、
 * 対応年はすべて confirmed: true（法改正があれば労働法典の改正として反映する）。
 */

import { addDays, easterSunday, formatDate, type DateString } from "../core/date.ts";
import { rangeError } from "../core/errors.ts";
import type { Holiday } from "../core/types.ts";

/**
 * フランスの祝日の種別（既知の値）。
 * @public
 */
export type KnownFrHolidayKind =
  /** 労働法典・地方法で定まる祝日（振替・臨時の祝日はない） */
  "regular";

/**
 * フランスの祝日の種別。将来の版で値が増えることがあるので、分岐では「その他」も扱うこと。
 * すべての値を網羅したことを型で確かめたい場合は KnownFrHolidayKind を使う。
 * @public
 */
export type FrHolidayKind = KnownFrHolidayKind | (string & {});

/**
 * フランスの祝日の識別子（Holiday.key。既知の値）。英語名から 1 つずつ。
 * 規則の keys に書くときの補完に使う（型は開いているので他の文字列も通る）。
 * @namingSource holiday-key
 * @public
 */
export type KnownFrHolidayKey =
  | "new-year"
  | "easter-monday"
  | "labour-day"
  | "victory-in-europe"
  | "ascension"
  | "pentecost-monday"
  | "bastille"
  | "assumption"
  | "all-saints"
  | "armistice"
  | "christmas"
  | "good-friday"
  | "saint-stephens";

/** @internal 地域（data.gouv.fr のゾーン） */
export type FrZone = "metropole" | "alsace-moselle";

/** @internal 対応年 */
export const SUPPORTED_YEARS = Object.freeze({ from: 2000, to: 2099 });
/** @internal 反映済みの data.gouv.fr のデータの年月（2006〜2031 年の公開） */
export const DATA_VERSION = "2026-10";

interface Entry {
  readonly date: DateString;
  readonly name: string;
  readonly nameEn: string;
  readonly key: KnownFrHolidayKey;
}

/** 固定日の祝日 [月, 日, 名称, 英語名, 識別子] */
const FIXED: readonly (readonly [number, number, string, string, KnownFrHolidayKey])[] = [
  [1, 1, "1er janvier", "New Year’s Day", "new-year"],
  [5, 1, "1er mai", "Labour Day", "labour-day"],
  [5, 8, "8 mai", "Victory in Europe Day", "victory-in-europe"],
  [7, 14, "14 juillet", "Bastille Day", "bastille"],
  [8, 15, "Assomption", "Assumption", "assumption"],
  [11, 1, "Toussaint", "All Saints’ Day", "all-saints"],
  [11, 11, "11 novembre", "Armistice Day", "armistice"],
  [12, 25, "Jour de Noël", "Christmas Day", "christmas"],
];
const FIXED_ALSACE_MOSELLE: readonly (readonly [
  number,
  number,
  string,
  string,
  KnownFrHolidayKey,
])[] = [[12, 26, "2ème jour de Noël", "Saint Stephen’s Day", "saint-stephens"]];

/** 復活祭から決まる祝日 [日数差, 名称, 英語名, 識別子] */
const EASTER_BASED: readonly (readonly [number, string, string, KnownFrHolidayKey])[] = [
  [1, "Lundi de Pâques", "Easter Monday", "easter-monday"],
  [39, "Ascension", "Ascension Day", "ascension"],
  [50, "Lundi de Pentecôte", "Pentecost Monday", "pentecost-monday"],
];
const EASTER_BASED_ALSACE_MOSELLE: readonly (readonly [
  number,
  string,
  string,
  KnownFrHolidayKey,
])[] = [[-2, "Vendredi saint", "Good Friday", "good-friday"]];

/** @internal その年・地域の祝日（日付順） */
export function computeFrHolidays(zone: FrZone, year: number): Holiday<FrHolidayKind>[] {
  if (!Number.isInteger(year) || year < SUPPORTED_YEARS.from || year > SUPPORTED_YEARS.to) {
    throw rangeError(
      "out-of-range",
      `French public holidays are supported for ${SUPPORTED_YEARS.from}-${SUPPORTED_YEARS.to}; requested ${year}`,
    );
  }
  const alsaceMoselle = zone === "alsace-moselle";
  const byDate = new Map<DateString, Entry>();
  for (const [month, day, name, nameEn, key] of alsaceMoselle
    ? [...FIXED, ...FIXED_ALSACE_MOSELLE]
    : FIXED) {
    byDate.set(formatDate(year, month, day), {
      date: formatDate(year, month, day),
      name,
      nameEn,
      key,
    });
  }
  // 復活祭から決まる祝日が固定日と同じ日に当たる年は、復活祭の側で上書きする（data.gouv.fr の JSON と同じ）
  const easter = easterSunday(year);
  for (const [offset, name, nameEn, key] of alsaceMoselle
    ? [...EASTER_BASED_ALSACE_MOSELLE, ...EASTER_BASED]
    : EASTER_BASED) {
    const date = addDays(easter, offset);
    byDate.set(date, { date, name, nameEn, key });
  }
  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) =>
      Object.freeze({
        date: e.date,
        name: e.name,
        nameEn: e.nameEn,
        kind: "regular" as const,
        confirmed: true,
        key: e.key,
      }),
    );
}
