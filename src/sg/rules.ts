/**
 * シンガポールの祝日（public holidays）の表と振替の規則。
 *
 * 旧正月・Hari Raya・Vesak Day・Deepavali は太陰暦・イスラム暦・ヒンドゥー暦で決まり、規則では計算できない。
 * 日本・英国と違い、年ごとに MOM（Ministry of Manpower）が官報で告示した日付を正として表で持つ。
 * 振替だけは Holidays Act（1998 年版）第 4 条の規則「日曜日に当たる祝日は、その翌日のうちそれ自体が祝日でない
 * 最初の日を祝日とする」で計算し、表には書かない。土曜日に当たる祝日は振替にならない（雇用主が休みか手当を与える）。
 *
 * 識別子（key）は 11 の祝日に 1 つずつ（KnownSgHolidayKey）。振替日は元の祝日の key、Polling Day は持たない。
 * 名称は MOM の報道発表の綴り（アポストロフィは ’）。data.gov.sg のコレクション 691（MOM）のデータで
 * 全日照合している（test/fixtures/datagovsg-public-holidays.json）。data.gov.sg の 2022 年分は MOM の改定後の告示と
 * 食い違う（scripts/verify-datagovsg.ts の KNOWN_DIFFERENCES）ため、告示を正としている。
 */

import { addDays, formatDate, weekdayOf, type DateString } from "../core/date.ts";
import { rangeError } from "../core/errors.ts";
import type { Holiday } from "../core/types.ts";

/**
 * シンガポールの祝日の種別（既知の値）。
 * @public
 */
export type KnownSgHolidayKind =
  /** 毎年の祝日（Holidays Act の別表と、年ごとに告示される日付） */
  | "regular"
  /** 日曜日に当たった祝日の振替（Holidays Act 第 4 条） */
  | "substitute"
  /** 告示による臨時の祝日（Polling Day など） */
  | "special";

/**
 * シンガポールの祝日の種別。将来の版で値が増えることがあるので、分岐では「その他」も扱うこと。
 * すべての値を網羅したことを型で確かめたい場合は KnownSgHolidayKind を使う。
 * @public
 */
export type SgHolidayKind = KnownSgHolidayKind | (string & {});

/**
 * シンガポールの毎年の祝日の識別子（Holiday.key。既知の値）。11 の祝日に 1 つずつ。
 * 振替日は元の祝日の key を持ち、臨時の祝日（Polling Day）は key を持たない。
 * 規則の keys に書くときの補完に使う（型は開いているので他の文字列も通る）。
 * @beta
 */
export type KnownSgHolidayKey =
  | "new-year"
  | "chinese-new-year"
  | "good-friday"
  | "labour-day"
  | "hari-raya-puasa"
  | "vesak"
  | "hari-raya-haji"
  | "national-day"
  | "deepavali"
  | "christmas";

/** @internal 対応年（表のある年。それより後は予測できないので out-of-range） */
export const SUPPORTED_YEARS = Object.freeze({ from: 2020, to: 2027 });
/** @internal MOM が日付を告示している最後の年（対応年の終わりと同じ。表の年はすべて確定） */
export const CONFIRMED_THROUGH = 2027;
/** @internal 反映済みの data.gov.sg のコレクション 691 の更新年月（2027 年分の公開） */
export const DATA_VERSION = "2026-07";

const NEW_YEAR = "New Year’s Day";
const CNY = "Chinese New Year";
const GOOD_FRIDAY = "Good Friday";
const LABOUR = "Labour Day";
const PUASA = "Hari Raya Puasa";
const VESAK = "Vesak Day";
const HAJI = "Hari Raya Haji";
const NATIONAL = "National Day";
const DEEPAVALI = "Deepavali";
const CHRISTMAS = "Christmas Day";
const POLLING = "Polling Day";

/** 名称から識別子へ（Polling Day は持たない） */
const KEY_OF: Readonly<Record<string, KnownSgHolidayKey>> = {
  [NEW_YEAR]: "new-year",
  [CNY]: "chinese-new-year",
  [GOOD_FRIDAY]: "good-friday",
  [LABOUR]: "labour-day",
  [PUASA]: "hari-raya-puasa",
  [VESAK]: "vesak",
  [HAJI]: "hari-raya-haji",
  [NATIONAL]: "national-day",
  [DEEPAVALI]: "deepavali",
  [CHRISTMAS]: "christmas",
};

/** 年ごとに動く祝日（月日と名前）。固定日の祝日（1/1・5/1・8/9・12/25）は表に書かず、下で足す */
const MOVABLE: Readonly<Record<number, readonly (readonly [string, string])[]>> = {
  2020: [
    ["01-25", CNY],
    ["01-26", CNY],
    ["04-10", GOOD_FRIDAY],
    ["05-07", VESAK],
    ["05-24", PUASA],
    ["07-31", HAJI],
    ["11-14", DEEPAVALI],
  ],
  2021: [
    ["02-12", CNY],
    ["02-13", CNY],
    ["04-02", GOOD_FRIDAY],
    ["05-13", PUASA],
    ["05-26", VESAK],
    ["07-20", HAJI],
    ["11-04", DEEPAVALI],
  ],
  // 2022 年の Hari Raya Puasa・Haji は 2021-10-21 の MOM の報道発表で 5/3・7/10 に改定された（data.gov.sg は改定前の形）
  2022: [
    ["02-01", CNY],
    ["02-02", CNY],
    ["04-15", GOOD_FRIDAY],
    ["05-03", PUASA],
    ["05-15", VESAK],
    ["07-10", HAJI],
    ["10-24", DEEPAVALI],
  ],
  2023: [
    ["01-22", CNY],
    ["01-23", CNY],
    ["04-07", GOOD_FRIDAY],
    ["04-22", PUASA],
    ["06-02", VESAK],
    ["06-29", HAJI],
    ["11-12", DEEPAVALI],
  ],
  2024: [
    ["02-10", CNY],
    ["02-11", CNY],
    ["03-29", GOOD_FRIDAY],
    ["04-10", PUASA],
    ["05-22", VESAK],
    ["06-17", HAJI],
    ["10-31", DEEPAVALI],
  ],
  2025: [
    ["01-29", CNY],
    ["01-30", CNY],
    ["03-31", PUASA],
    ["04-18", GOOD_FRIDAY],
    ["05-12", VESAK],
    ["06-07", HAJI],
    ["10-20", DEEPAVALI],
  ],
  2026: [
    ["02-17", CNY],
    ["02-18", CNY],
    ["03-21", PUASA],
    ["04-03", GOOD_FRIDAY],
    ["05-27", HAJI],
    ["05-31", VESAK],
    ["11-08", DEEPAVALI],
  ],
  2027: [
    ["02-06", CNY],
    ["02-07", CNY],
    ["03-10", PUASA],
    ["03-26", GOOD_FRIDAY],
    ["05-17", HAJI],
    ["05-20", VESAK],
    ["10-28", DEEPAVALI],
  ],
};

/** 告示による臨時の祝日（総選挙・大統領選挙の投票日） */
const SPECIAL_DAYS: readonly (readonly [DateString, string])[] = [
  ["2020-07-10", POLLING],
  ["2023-09-01", POLLING],
  ["2025-05-03", POLLING],
];

const FIXED: readonly (readonly [number, number, string])[] = [
  [1, 1, NEW_YEAR],
  [5, 1, LABOUR],
  [8, 9, NATIONAL],
  [12, 25, CHRISTMAS],
];

interface Entry {
  readonly date: DateString;
  readonly name: string;
  readonly kind: KnownSgHolidayKind;
}

/** @internal その年の祝日（表と振替の規則から。日付順） */
export function computeSgHolidays(year: number): Holiday<SgHolidayKind>[] {
  const movable = MOVABLE[year];
  if (movable === undefined) {
    throw rangeError(
      "out-of-range",
      `Singapore public holidays are available for ${SUPPORTED_YEARS.from}-${SUPPORTED_YEARS.to}: ${year}`,
    );
  }
  const entries: Entry[] = [
    ...FIXED.map(([m, d, name]) => ({
      date: formatDate(year, m, d),
      name,
      kind: "regular" as const,
    })),
    ...movable.map(([md, name]) => ({
      date: `${year}-${md}` as DateString,
      name,
      kind: "regular" as const,
    })),
    ...SPECIAL_DAYS.filter(([date]) => date.startsWith(`${year}-`)).map(([date, name]) => ({
      date,
      name,
      kind: "special" as const,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
  // 日曜日に当たる祝日を日付順に振り替える（振替先は、それ自体が祝日でない翌日以降の最初の日）
  const taken = new Set<DateString>(entries.map((e) => e.date));
  const sundays = entries.filter((e) => weekdayOf(e.date) === 0);
  for (const e of sundays) {
    let day = addDays(e.date, 1);
    while (taken.has(day)) day = addDays(day, 1);
    entries.push({ date: day, name: e.name, kind: "substitute" });
    taken.add(day);
  }
  return entries
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) => {
      const key = KEY_OF[e.name];
      return Object.freeze({
        date: e.date,
        name: e.name,
        nameEn: e.name,
        kind: e.kind,
        confirmed: true,
        ...(key === undefined ? {} : { key }),
      });
    });
}
