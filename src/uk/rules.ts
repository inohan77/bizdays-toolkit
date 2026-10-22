/**
 * 英国の bank holidays（GOV.UK の区分: England and Wales・Scotland・Northern Ireland）の計算。
 *
 * - 毎年の祝日: 1971 年の Banking and Financial Dealings Act の附則と、毎年の布告で定まる日を規則で計算する
 *   （England and Wales・Northern Ireland の Good Friday と Christmas Day は慣習法上の休日だが、GOV.UK の一覧と同じく含める）
 * - 振替: 土曜日・日曜日に当たる固定日の祝日は、その後で最も近い、祝日でない平日に振り替える（日付順に割り当てる）
 * - 臨時の祝日・移動: 布告ごとの日付をテーブルで持つ
 *
 * 対応年のすべての日付と名称が GOV.UK のデータと一致することを、テスト用フィクスチャ
 * （test/fixtures/govuk-bank-holidays.json）で検証している。CONFIRMED_THROUGH より後の年は、
 * 規則による予測（confirmed: false）。
 */

import {
  addDays,
  daysInMonth,
  easterSunday,
  formatDate,
  nthWeekdayOfMonth,
  weekdayOf,
  type DateString,
} from "../core/date.ts";
import { rangeError } from "../core/errors.ts";
import type { Holiday } from "../core/types.ts";

/**
 * 英国の祝日の種別（既知の値）。
 * @public
 */
export type KnownUkHolidayKind =
  /** 毎年の祝日（布告で日付が移動した年を含む） */
  | "regular"
  /** 土曜日・日曜日に当たった祝日の振替 */
  | "substitute"
  /** 布告による臨時の祝日（記念式典・国葬など） */
  | "special";

/**
 * 英国の祝日の種別。将来の版で値が増えることがあるので、分岐では「その他」も扱うこと。
 * すべての値を網羅したことを型で確かめたい場合は KnownUkHolidayKind を使う。
 * @public
 */
export type UkHolidayKind = KnownUkHolidayKind | (string & {});

/** @internal GOV.UK の区分 */
export type UkDivision = "england-and-wales" | "scotland" | "northern-ireland";

/** @internal 対応年 */
export const SUPPORTED_YEARS = Object.freeze({ from: 2012, to: 2099 });
/** @internal GOV.UK が日付を公表している最後の年 */
export const CONFIRMED_THROUGH = 2028;
/** @internal 反映済みの GOV.UK のデータの年月（2026 年の Scotland の World Cup bank holiday の追加） */
export const DATA_VERSION = "2026-02";

interface Entry {
  readonly date: DateString;
  readonly name: string;
  readonly kind: KnownUkHolidayKind;
}

/** 固定日の祝日（土曜日・日曜日なら振り替える） */
interface FixedDay {
  readonly month: number;
  readonly day: number;
  readonly name: string;
}

const NEW_YEAR = "New Year’s Day";
const SECOND_JANUARY = "2nd January";
const ST_PATRICK = "St Patrick’s Day";
const GOOD_FRIDAY = "Good Friday";
const EASTER_MONDAY = "Easter Monday";
const EARLY_MAY = "Early May bank holiday";
const SPRING = "Spring bank holiday";
const BOYNE = "Battle of the Boyne (Orangemen’s Day)";
const SUMMER = "Summer bank holiday";
const ST_ANDREW = "St Andrew’s Day";
const CHRISTMAS = "Christmas Day";
const BOXING = "Boxing Day";

const ALL: readonly UkDivision[] = ["england-and-wales", "scotland", "northern-ireland"];

/** 布告で毎年の祝日の日付を移した年（名称が変わる場合は name） */
const MOVED: readonly {
  readonly year: number;
  readonly from: string;
  readonly date: DateString;
  readonly name?: string;
}[] = [
  { year: 2012, from: SPRING, date: "2012-06-04" },
  { year: 2020, from: EARLY_MAY, date: "2020-05-08", name: "Early May bank holiday (VE day)" },
  { year: 2022, from: SPRING, date: "2022-06-02" },
];

/** 布告による臨時の祝日 */
const SPECIAL_DAYS: readonly {
  readonly date: DateString;
  readonly name: string;
  readonly divisions: readonly UkDivision[];
}[] = [
  { date: "2012-06-05", name: "Queen’s Diamond Jubilee", divisions: ALL },
  { date: "2022-06-03", name: "Platinum Jubilee bank holiday", divisions: ALL },
  {
    date: "2022-09-19",
    name: "Bank Holiday for the State Funeral of Queen Elizabeth II",
    divisions: ALL,
  },
  {
    date: "2023-05-08",
    name: "Bank holiday for the coronation of King Charles III",
    divisions: ALL,
  },
  { date: "2026-06-15", name: "World Cup bank holiday", divisions: ["scotland"] },
];

/**
 * 振替の日付は規則どおりで、どちらの祝日の振替かの割り当てだけが規則と異なる年。
 * 2023 年の Scotland（1 月 1 日が日曜日）は、GOV.UK では 1/2 が New Year’s Day の振替、1/3 が 2nd January の振替。
 * 同じ曜日の並びの 2012・2017 年は、附則どおり 1/2 が 2nd January、1/3 が New Year’s Day の振替
 */
const RENAMED: readonly {
  readonly division: UkDivision;
  readonly date: DateString;
  readonly name: string;
  readonly kind: KnownUkHolidayKind;
}[] = [
  { division: "scotland", date: "2023-01-02", name: NEW_YEAR, kind: "substitute" },
  { division: "scotland", date: "2023-01-03", name: SECOND_JANUARY, kind: "substitute" },
];

function lastMonday(year: number, month: number): DateString {
  const last = formatDate(year, month, daysInMonth(year, month));
  return addDays(last, -((weekdayOf(last) - 1 + 7) % 7));
}

function isWeekend(date: DateString): boolean {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
}

/** @internal その年・区分の祝日（日付順） */
export function computeUkHolidays(division: UkDivision, year: number): Holiday<UkHolidayKind>[] {
  if (!Number.isInteger(year) || year < SUPPORTED_YEARS.from || year > SUPPORTED_YEARS.to) {
    throw rangeError(
      "out-of-range",
      `UK bank holidays are supported for ${SUPPORTED_YEARS.from}-${SUPPORTED_YEARS.to}; requested ${year}`,
    );
  }
  const scotland = division === "scotland";
  const ni = division === "northern-ireland";

  const fixed: FixedDay[] = [{ month: 1, day: 1, name: NEW_YEAR }];
  if (scotland) fixed.push({ month: 1, day: 2, name: SECOND_JANUARY });
  if (ni) fixed.push({ month: 3, day: 17, name: ST_PATRICK });
  if (ni) fixed.push({ month: 7, day: 12, name: BOYNE });
  if (scotland) fixed.push({ month: 11, day: 30, name: ST_ANDREW });
  fixed.push({ month: 12, day: 25, name: CHRISTMAS }, { month: 12, day: 26, name: BOXING });

  const easter = easterSunday(year);
  const movable: Entry[] = [
    { date: addDays(easter, -2), name: GOOD_FRIDAY, kind: "regular" },
    { date: nthWeekdayOfMonth(year, 5, 1, 1), name: EARLY_MAY, kind: "regular" },
    { date: lastMonday(year, 5), name: SPRING, kind: "regular" },
    {
      date: scotland ? nthWeekdayOfMonth(year, 8, 1, 1) : lastMonday(year, 8),
      name: SUMMER,
      kind: "regular",
    },
  ];
  if (!scotland) movable.push({ date: addDays(easter, 1), name: EASTER_MONDAY, kind: "regular" });

  const entries: Entry[] = [];
  for (const e of movable) {
    const moved = MOVED.find((m) => m.year === year && m.from === e.name);
    entries.push(moved ? { date: moved.date, name: moved.name ?? e.name, kind: e.kind } : e);
  }
  for (const s of SPECIAL_DAYS) {
    if (s.date.startsWith(`${year}-`) && s.divisions.includes(division)) {
      entries.push({ date: s.date, name: s.name, kind: "special" });
    }
  }

  // 平日に当たる固定日の祝日を先に置き、土曜日・日曜日に当たるものを日付順に振り替える
  const taken = new Set<DateString>(entries.map((e) => e.date));
  const fixedDates = fixed.map((f) => ({ date: formatDate(year, f.month, f.day), name: f.name }));
  for (const f of fixedDates) {
    if (!isWeekend(f.date)) {
      entries.push({ date: f.date, name: f.name, kind: "regular" });
      taken.add(f.date);
    }
  }
  for (const f of fixedDates) {
    if (!isWeekend(f.date)) continue;
    let day = addDays(f.date, 1);
    while (isWeekend(day) || taken.has(day)) day = addDays(day, 1);
    entries.push({ date: day, name: f.name, kind: "substitute" });
    taken.add(day);
  }

  for (const r of RENAMED) {
    if (r.division !== division || !r.date.startsWith(`${year}-`)) continue;
    const i = entries.findIndex((e) => e.date === r.date);
    if (i >= 0) entries[i] = { date: r.date, name: r.name, kind: r.kind };
  }

  return entries
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) =>
      Object.freeze({
        date: e.date,
        name: e.name,
        nameEn: e.name,
        kind: e.kind,
        confirmed: year <= CONFIRMED_THROUGH,
      }),
    );
}
