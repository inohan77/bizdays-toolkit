/**
 * 英国の bank holidays（GOV.UK の区分: England and Wales・Scotland・Northern Ireland）の計算。
 *
 * - 毎年の祝日: 1971 年の Banking and Financial Dealings Act の附則と、毎年の布告で定まる日を規則で計算する
 *   （England and Wales・Northern Ireland の Good Friday と Christmas Day は慣習法上の休日だが、GOV.UK の一覧と同じく含める）
 * - 振替: 土曜日・日曜日に当たる固定日の祝日は、その後で最も近い、祝日でない平日に振り替える（日付順に割り当てる）
 * - 臨時の祝日・移動: 布告ごとの日付をテーブルで持つ
 * - 識別子（key）: 毎年の祝日に GOV.UK の区分名から 1 つ（KnownUkHolidayKey）。振替日は元の祝日の key、臨時の祝日は持たない
 *
 * 年ごとの正（GOV.UK・当時の政府の一覧・布告）と検証のフィクスチャは decisions.md の 18・49 番。
 * CONFIRMED_THROUGH より後の年は、規則による予測（confirmed: false）。
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

/**
 * 英国の毎年の bank holiday の識別子（Holiday.key。既知の値）。GOV.UK の区分名から付け、布告で日付が移った年も同じ値。
 * 振替日は元の祝日の key を持ち、臨時の祝日（special）は key を持たない。
 * 規則の keys に書くときの補完に使う（型は開いているので他の文字列も通る）。
 * @public
 */
export type KnownUkHolidayKey =
  | "new-year"
  | "2nd-january"
  | "st-patricks"
  | "good-friday"
  | "easter-monday"
  | "early-may"
  | "spring"
  | "battle-of-the-boyne"
  | "summer"
  | "st-andrews"
  | "christmas"
  | "boxing-day";

/** @internal GOV.UK の区分 */
export type UkDivision = "england-and-wales" | "scotland" | "northern-ireland";

/** @internal 対応年 */
export const SUPPORTED_YEARS = Object.freeze({ from: 1974, to: 2099 });
/** @internal GOV.UK が日付を公表している最後の年 */
export const CONFIRMED_THROUGH = 2028;
/** @internal 反映済みの GOV.UK のデータの年月（2026 年の Scotland の World Cup bank holiday の追加） */
export const DATA_VERSION = "2026-02";

interface Entry {
  readonly date: DateString;
  readonly name: string;
  readonly kind: KnownUkHolidayKind;
  /** 観測している祝日の識別子（振替日は元の祝日のもの。臨時の祝日は持たない） */
  readonly key?: KnownUkHolidayKey;
}

/** 固定日の祝日（土曜日・日曜日なら振り替える） */
interface FixedDay {
  readonly month: number;
  readonly day: number;
  readonly name: string;
  readonly key: KnownUkHolidayKey;
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
const NOT_SCOTLAND: readonly UkDivision[] = ["england-and-wales", "northern-ireland"];
const SCOTLAND: readonly UkDivision[] = ["scotland"];

/** 布告で毎年の祝日の日付を移した年（名称が変わる場合は name） */
const MOVED: readonly {
  readonly year: number;
  readonly from: string;
  readonly date: DateString;
  readonly name?: string;
  readonly divisions: readonly UkDivision[];
}[] = [
  // 1977 年: Silver Jubilee で England・Wales・NI の Spring を 6 月 6 日に（"in its stead"）。Scotland に Spring はまだない
  { year: 1977, from: SPRING, date: "1977-06-06", divisions: NOT_SCOTLAND },
  // 1995 年: VE Day 50 周年で England・Wales・NI の Early May を 5 月 8 日に（5 月 1 日は布告されなかった）。Scotland の 5 月第 1 月曜は附則
  { year: 1995, from: EARLY_MAY, date: "1995-05-08", divisions: NOT_SCOTLAND },
  { year: 2002, from: SPRING, date: "2002-06-04", divisions: ALL },
  { year: 2012, from: SPRING, date: "2012-06-04", divisions: ALL },
  {
    year: 2020,
    from: EARLY_MAY,
    date: "2020-05-08",
    name: "Early May bank holiday (VE day)",
    divisions: ALL,
  },
  { year: 2022, from: SPRING, date: "2022-06-02", divisions: ALL },
];

/** 布告による臨時の祝日 */
const SPECIAL_DAYS: readonly {
  readonly date: DateString;
  readonly name: string;
  readonly divisions: readonly UkDivision[];
}[] = [
  // 名称の根拠と、固有の名称のない日に理由を括弧で添える規則: docs/sources/uk-bank-holidays-1974-1999.md 第 5 節
  // 1977 年 Silver Jubilee: England・Wales・NI は 6/7 を追加（Spring は 6/6 に移動）、Scotland は 6/6 だけ
  { date: "1977-06-06", name: "Silver Jubilee bank holiday", divisions: SCOTLAND },
  { date: "1977-06-07", name: "Silver Jubilee bank holiday", divisions: NOT_SCOTLAND },
  { date: "1981-07-29", name: "Royal Wedding bank holiday", divisions: ALL },
  // 1995 年: England・Wales・NI は Early May を 5/8 に移動、Scotland は附則の 5/1 に加えて 5/8 を追加
  {
    date: "1995-05-08",
    name: "Additional bank holiday (VE Day 50th anniversary)",
    divisions: SCOTLAND,
  },
  { date: "1999-12-31", name: "Additional bank holiday (Millennium)", divisions: ALL },
  { date: "2002-06-03", name: "Golden Jubilee bank holiday", divisions: ALL },
  { date: "2011-04-29", name: "Royal Wedding bank holiday", divisions: ALL },
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
  readonly divisions: readonly UkDivision[];
  readonly date: DateString;
  readonly name: string;
  readonly kind: KnownUkHolidayKind;
  readonly key: KnownUkHolidayKey;
}[] = [
  // 振替日の名称の割り当て。当時の一覧・布告・Hansard の文言に揃える（根拠: docs/sources/uk-bank-holidays-1974-1999.md 付録 C、
  // docs/sources/uk-bank-holidays-2000-2011.md）。12/25 が土曜日の年: 27 日が Boxing Day、28 日が Christmas Day の代わり
  { divisions: ALL, date: "1976-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1976-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  // 1/1 が土曜日の年の Scotland: 3 日が 2nd January（附則）、4 日が New Year’s Day の代わり
  {
    divisions: SCOTLAND,
    date: "1977-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "1977-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  // 12/25 が日曜日の年の Scotland: 26 日が Christmas Day（附則）、27 日が Boxing Day（布告）
  {
    divisions: SCOTLAND,
    date: "1977-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "1977-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1982-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1982-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  {
    divisions: SCOTLAND,
    date: "1983-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "1983-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  {
    divisions: SCOTLAND,
    date: "1983-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "1983-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  {
    divisions: SCOTLAND,
    date: "1988-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "1988-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1993-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1993-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  {
    divisions: SCOTLAND,
    date: "1994-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "1994-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  {
    divisions: SCOTLAND,
    date: "1994-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "1994-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1999-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1999-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  {
    divisions: SCOTLAND,
    date: "2000-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "2000-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  { divisions: ALL, date: "2004-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "2004-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  {
    divisions: SCOTLAND,
    date: "2005-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "2005-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  {
    divisions: SCOTLAND,
    date: "2005-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "2005-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  // 2011 年: 当時の政府の一覧は 26 日を Christmas Day、27 日を Boxing Day の振替とした
  { divisions: ALL, date: "2011-12-26", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  { divisions: ALL, date: "2011-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  // 2023 年の Scotland: GOV.UK の割り当て（1/2 が New Year’s Day、1/3 が 2nd January）に合わせる
  { divisions: SCOTLAND, date: "2023-01-02", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  {
    divisions: SCOTLAND,
    date: "2023-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
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

  const fixed: FixedDay[] = [{ month: 1, day: 1, name: NEW_YEAR, key: "new-year" }];
  if (scotland) fixed.push({ month: 1, day: 2, name: SECOND_JANUARY, key: "2nd-january" });
  if (ni) fixed.push({ month: 3, day: 17, name: ST_PATRICK, key: "st-patricks" });
  if (ni) fixed.push({ month: 7, day: 12, name: BOYNE, key: "battle-of-the-boyne" });
  // St Andrew's Day は St Andrew's Day Bank Holiday (Scotland) Act 2007 で加わった（2007 年から）
  if (scotland && year >= 2007)
    fixed.push({ month: 11, day: 30, name: ST_ANDREW, key: "st-andrews" });
  fixed.push(
    { month: 12, day: 25, name: CHRISTMAS, key: "christmas" },
    { month: 12, day: 26, name: BOXING, key: "boxing-day" },
  );

  const easter = easterSunday(year);
  const movable: Entry[] = [
    { date: addDays(easter, -2), name: GOOD_FRIDAY, kind: "regular", key: "good-friday" },
    {
      date: scotland ? nthWeekdayOfMonth(year, 8, 1, 1) : lastMonday(year, 8),
      name: SUMMER,
      kind: "regular",
      key: "summer",
    },
  ];
  if (!scotland) {
    movable.push({
      date: addDays(easter, 1),
      name: EASTER_MONDAY,
      kind: "regular",
      key: "easter-monday",
    });
  }
  // 5 月の第 1 月曜日: Scotland は附則、England・Wales・NI は 1978 年から毎年布告される（Early May bank holiday）
  if (scotland || year >= 1978) {
    movable.push({
      date: nthWeekdayOfMonth(year, 5, 1, 1),
      name: EARLY_MAY,
      kind: "regular",
      key: "early-may",
    });
  }
  // 5 月の最終月曜日: England・Wales・NI は附則、Scotland は 1978 年から毎年布告される
  if (!scotland || year >= 1978) {
    movable.push({ date: lastMonday(year, 5), name: SPRING, kind: "regular", key: "spring" });
  }

  const entries: Entry[] = [];
  for (const e of movable) {
    const moved = MOVED.find(
      (m) => m.year === year && m.from === e.name && m.divisions.includes(division),
    );
    entries.push(moved ? { ...e, date: moved.date, name: moved.name ?? e.name } : e);
  }
  for (const s of SPECIAL_DAYS) {
    if (s.date.startsWith(`${year}-`) && s.divisions.includes(division)) {
      entries.push({ date: s.date, name: s.name, kind: "special" });
    }
  }

  // 平日に当たる固定日の祝日を先に置き、土曜日・日曜日に当たるものを日付順に振り替える
  const taken = new Set<DateString>(entries.map((e) => e.date));
  const fixedDates = fixed.map((f) => ({
    date: formatDate(year, f.month, f.day),
    name: f.name,
    key: f.key,
  }));
  for (const f of fixedDates) {
    if (!isWeekend(f.date)) {
      entries.push({ date: f.date, name: f.name, kind: "regular", key: f.key });
      taken.add(f.date);
    }
  }
  for (const f of fixedDates) {
    if (!isWeekend(f.date)) continue;
    let day = addDays(f.date, 1);
    while (isWeekend(day) || taken.has(day)) day = addDays(day, 1);
    entries.push({ date: day, name: f.name, kind: "substitute", key: f.key });
    taken.add(day);
  }

  for (const r of RENAMED) {
    if (!r.divisions.includes(division) || !r.date.startsWith(`${year}-`)) continue;
    const i = entries.findIndex((e) => e.date === r.date);
    if (i >= 0) entries[i] = { date: r.date, name: r.name, kind: r.kind, key: r.key };
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
        ...(e.key === undefined ? {} : { key: e.key }),
      }),
    );
}
