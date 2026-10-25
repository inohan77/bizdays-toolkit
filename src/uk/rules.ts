/**
 * 英国の bank holidays（GOV.UK の区分: England and Wales・Scotland・Northern Ireland）の計算。
 *
 * - 毎年の祝日: 1971 年の Banking and Financial Dealings Act の附則と、毎年の布告で定まる日を規則で計算する
 *   （England and Wales・Northern Ireland の Good Friday と Christmas Day は慣習法上の休日だが、GOV.UK の一覧と同じく含める）
 * - 振替: 土曜日・日曜日に当たる固定日の祝日は、その後で最も近い、祝日でない平日に振り替える（日付順に割り当てる）
 * - 臨時の祝日・移動: 布告ごとの日付をテーブルで持つ
 * - 識別子（key）: 毎年の祝日に GOV.UK の区分名から 1 つ（KnownUkHolidayKey）。振替日は元の祝日の key、臨時の祝日は持たない
 *
 * 2012 年以降は、すべての日付と名称が GOV.UK のデータと一致することをテスト用フィクスチャ
 * （test/fixtures/govuk-bank-holidays.json）で検証している。2000〜2011 年（GOV.UK のデータがない）は、当時の政府の公表一覧
 * （DTI・BERR・directgov・Scottish Executive/Government・nidirect の Web Archive）を正とし、The Gazette の布告で照合した
 * フィクスチャ（test/fixtures/uk-2000-2011-government-lists.json）で検証している。政府の一覧にあるが布告が見つからない日
 * （Scotland の 2010-01-04・2010-12-27・2011-01-04）は、一覧に従って祝日として返す（decisions.md の 49 番）。
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
 * @beta
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
  // 臨時の祝日の名称は布告にはなく（布告は日付だけを指定する）、政府の答弁の呼び方による。固有の呼び方が公式の文書にない日は
  // 中立の "Additional bank holiday" に、政府の答弁が述べた理由を括弧で添える（GOV.UK の 2020 年 "Early May bank holiday (VE day)" と同じ形。
  // docs/sources/uk-bank-holidays-1974-1999.md の名称の節）
  // 1977 年の Silver Jubilee: England・Wales・NI は 6 月 7 日を追加（Spring は 6 月 6 日に移動）。Scotland は 6 月 6 日だけを追加。
  // 名称は Hansard 1975-12-18 の公式プログラム "Tuesday 7th (Silver Jubilee Bank Holiday)" と 1977-01-19 "a special Silver Jubilee Bank Holiday"、
  // Scotland は 1976-06-28 "a Jubilee holiday in Scotland"
  { date: "1977-06-06", name: "Silver Jubilee bank holiday", divisions: SCOTLAND },
  { date: "1977-06-07", name: "Silver Jubilee bank holiday", divisions: NOT_SCOTLAND },
  // 名称は The London Gazette 48690（1981-07-27）の告示の見出し "ROYAL WEDDING BANK HOLIDAY" と Hansard 1981-07-30 の答弁 "the public holiday on 29 July for the Royal Wedding"
  { date: "1981-07-29", name: "Royal Wedding bank holiday", divisions: ALL },
  // 1995 年の VE Day 50 周年: England・Wales・NI は Early May を 5 月 8 日に移動、Scotland は 5 月 1 日（附則）に加えて 8 日を追加。
  // 政府は Scotland の分を "an additional day's bank holiday" とだけ呼び（Hansard 1993-12-16・1995-03-02）、固有の名称はない。
  // 括弧は Hansard 1993-12-16 の理由 "commemorating the 50th anniversary of the ending of the second world war" による
  {
    date: "1995-05-08",
    name: "Additional bank holiday (VE Day 50th anniversary)",
    divisions: SCOTLAND,
  },
  // 政府は "a one-off additional Bank Holiday throughout the United Kingdom on Friday, 31 December 1999" と呼び（Hansard 1998-06-03）、
  // 固有の名称はない。括弧は同じ答弁の "the year 2000 will be heralded by" と質問の "to mark the Millennium" による
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
  // 12 月 25 日が土曜日の年（1976・1982・1993・1999・2004）: 27 日は附則の「25・26 日が日曜日の年の 27 日」（Boxing Day の代わり）、
  // 28 日は Christmas Day の代わり。割り当ての文言があるのは 1982・1999 年の Scotland の布告（"in place of Saturday, 25th December"）、
  // 2004 年の政府の一覧、1976 年の Hansard 1976-07-27 だけで、1993 年と England・Wales・NI の 28 日（布告はどの日の代わりかを書かない）は
  // それに揃えた（docs/sources/uk-bank-holidays-1974-1999.md の付録 C）
  { divisions: ALL, date: "1976-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  { divisions: ALL, date: "1976-12-28", name: CHRISTMAS, kind: "substitute", key: "christmas" },
  // 1 月 1 日が土曜日の年の Scotland（1977・1983・1994・2000・2005）: 3 日は附則の「1 月 2 日が日曜日なら 3 日」、4 日は布告で New Year’s Day の代わり
  {
    divisions: SCOTLAND,
    date: "1977-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "1977-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  // 12 月 25 日が日曜日の年の Scotland（1977・1983・1988・1994・2005）: 26 日は附則の Christmas Day の振替、27 日は布告で追加された Boxing Day
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
  // 2000 年・2005 年の Scotland: 布告は 1 月 4 日を「1 月 1 日（土）の代わり」とし、1 月 3 日は附則の「1 月 2 日が日曜日なら 3 日」
  {
    divisions: SCOTLAND,
    date: "2000-01-03",
    name: SECOND_JANUARY,
    kind: "substitute",
    key: "2nd-january",
  },
  { divisions: SCOTLAND, date: "2000-01-04", name: NEW_YEAR, kind: "substitute", key: "new-year" },
  // 2004 年: 12 月 27 日は附則の「25・26 日が日曜日の年の 27 日」（Boxing Day の代わり）、28 日は布告で Christmas Day の代わり
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
  // 2005 年の Scotland: 12 月 26 日は附則の「Christmas Day が日曜日なら 26 日」、27 日は布告で追加された Boxing Day
  {
    divisions: SCOTLAND,
    date: "2005-12-26",
    name: CHRISTMAS,
    kind: "substitute",
    key: "christmas",
  },
  { divisions: SCOTLAND, date: "2005-12-27", name: BOXING, kind: "substitute", key: "boxing-day" },
  // 2011 年: 当時の政府の一覧（directgov・Scottish Government・nidirect）は 26 日を Christmas Day、27 日を Boxing Day の振替とした
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
