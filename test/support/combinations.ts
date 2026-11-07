// 必ず作る組み合わせ（生成範囲の検査が守る個々の特徴とは別に、危険の分かっている特徴の組み合わせを、呼び出し側ごとに
// 1 回以上作ることを test/tools/generator-features.test.ts が確かめる）。過去の不具合と、オラクルが見つけた誤りの種類から選ぶ。

type Obj = Record<string, unknown>;

const RULE_LISTS = ["closedRecurringRules", "openRecurringRules", "recurringRules"];
const rules = (o: Obj): Obj[] =>
  RULE_LISTS.flatMap((k) => (Array.isArray(o[k]) ? (o[k] as Obj[]) : []));
const nonEmpty = (o: Obj, ...keys: string[]): boolean =>
  keys.some((k) => Array.isArray(o[k]) && (o[k] as unknown[]).length > 0);
const hasRule = (o: Obj, test: (r: Obj) => boolean): boolean => rules(o).some(test);
/** 個別の日付（カレンダーの閉じる・開く日付、スケジュールの日付） */
const specificDates = (o: Obj): boolean => nonEmpty(o, "closedDates", "openDates", "dates");

export interface Combination {
  readonly name: string;
  /** その組み合わせを必ず作る理由（過去の不具合・オラクルの誤りの種類） */
  readonly reason: string;
  matches(options: Obj): boolean;
}

export const COMBINATIONS: readonly Combination[] = [
  {
    name: "第 n 営業日（月）× 個別の日付",
    reason:
      "個別の日付を誤って redundant とした不具合（0.30.3 で直した。0.30.2 のオラクルの誤りの大半）",
    matches: (o) => hasRule(o, (r) => "businessDayOfMonth" in r) && specificDates(o),
  },
  {
    name: "第 n 営業日（月）× 毎年の月日",
    reason:
      "毎年の月日を誤って redundant とした不具合（0.30.3 で直した。0.30.2 のオラクルの誤りに含まれる）",
    matches: (o) =>
      hasRule(o, (r) => "businessDayOfMonth" in r) &&
      nonEmpty(o, "closedAnnualDates", "annualDates"),
  },
  {
    name: "第 n 営業日（週）× 個別の日付",
    reason:
      "週の第 n 営業日でも、数え方を変える個別の日付を redundant とした（0.30.2 のオラクルの誤り）",
    matches: (o) => hasRule(o, (r) => "businessDayOfWeek" in r) && specificDates(o),
  },
  {
    name: "祝日の規則 × 臨時営業日",
    reason: "祝日を開く・閉じる規則と、祝日に重なる臨時営業日（openDates）の優先順位",
    matches: (o) => hasRule(o, (r) => "holiday" in r) && nonEmpty(o, "openDates"),
  },
  {
    name: "祝日の翌日・前日 × skipWeekdays × 個別の日付",
    reason:
      "隣の日を見る規則の飛ばす曜日と、個別の日付で変わった営業日の組み合わせ（振替先の決め方）",
    matches: (o) =>
      hasRule(
        o,
        (r) =>
          ("dayAfterHoliday" in r || "dayBeforeHoliday" in r) && Array.isArray(r["skipWeekdays"]),
      ) && specificDates(o),
  },
  {
    name: "和集合の提供元 × kinds",
    reason:
      '和集合の提供元では種別の名前が提供元ごとに違う（日本の "regular" と旧名 "national" の扱い。0.30.0 の改名）',
    matches: (o) => {
      const p = o["holidayProvider"] ?? o["holidays"];
      return Array.isArray(p) && p.length >= 2 && hasRule(o, (r) => "kinds" in r);
    },
  },
];

/** 呼び出し側で作れない組み合わせと、その理由（事実に限る） */
export const NOT_APPLICABLE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  properties: {
    "和集合の提供元 × kinds": "properties の設定は日本の提供元だけで、和集合の提供元を作らない",
  },
  "diagnose-properties": {
    "和集合の提供元 × kinds":
      "diagnose-properties の設定は提供元が 1 つ（自作の提供元・日本）かなしで、和集合の提供元を作らない",
  },
};
