// Combinations that must be produced (apart from the individual features protected by the check of the generated
// range, test/tools/generator-features.test.ts checks that each caller produces combinations of features with
// known risks at least once). Chosen from past defects and the kinds of mistakes the oracle found.

type Obj = Record<string, unknown>;

const RULE_LISTS = ["closedRecurringRules", "openRecurringRules", "recurringRules"];
const rules = (o: Obj): Obj[] =>
  RULE_LISTS.flatMap((k) => (Array.isArray(o[k]) ? (o[k] as Obj[]) : []));
const nonEmpty = (o: Obj, ...keys: string[]): boolean =>
  keys.some((k) => Array.isArray(o[k]) && (o[k] as unknown[]).length > 0);
const hasRule = (o: Obj, test: (r: Obj) => boolean): boolean => rules(o).some(test);
/** Specific dates (closing and opening dates of calendars, dates of schedules) */
const specificDates = (o: Obj): boolean => nonEmpty(o, "closedDates", "openDates", "dates");
/**
 * An nth-business-day rule counting on the own options (a rule of a calendar; rules of schedules count on
 * `calendar`)
 */
const ownCounting = (o: Obj): boolean =>
  ["closedRecurringRules", "openRecurringRules"].some(
    (k) =>
      Array.isArray(o[k]) &&
      (o[k] as Obj[]).some((r) => "businessDayOfMonth" in r || "businessDayOfWeek" in r),
  );
/** The starts and ends of the specific dates of a calendar */
const calendarDateEnds = (o: Obj): { from: string; to: string }[] =>
  ["closedDates", "openDates"].flatMap((k) =>
    Array.isArray(o[k])
      ? (o[k] as unknown[]).map((d) =>
          typeof d === "string"
            ? { from: d, to: d }
            : {
                from: String((d as Obj)["from"] ?? (d as Obj)["date"]),
                to: String((d as Obj)["to"] ?? (d as Obj)["date"]),
              },
        )
      : [],
  );
/**
 * The scan range in which the diagnostics examine rules against each other (no provider, or an "ignore"
 * provider. decisions.md #31)
 */
const SCAN = { from: "2001-01-01", to: "2028-12-31" } as const;

export interface Combination {
  readonly name: string;
  /** Why the combination must be produced (a past defect, a kind of mistake found by the oracle) */
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
    name: "自分の設定を基準に数える第 n 営業日 × 走査の範囲の外の個別の日付",
    reason:
      "走査の範囲（2001〜2028 年）の外の個別の日付の月・週で決める規則を、誤って never-matches・redundant とした不具合（0.32.8 で直した P8・P9）",
    matches: (o) =>
      ownCounting(o) &&
      calendarDateEnds(o).some(({ from, to }) => from < SCAN.from || to > SCAN.to),
  },
  {
    name: "自分の設定を基準に数える第 n 営業日 × 走査の範囲を覆う個別の日付",
    reason:
      "走査の範囲を覆う長い個別の日付の外の年で決める規則を、誤って使われない（never-matches・redundant）とした不具合（0.32.8 で直した P11）",
    matches: (o) =>
      ownCounting(o) &&
      calendarDateEnds(o).some(({ from, to }) => from <= SCAN.from && to >= SCAN.to),
  },
  {
    name: 'unconfirmedHolidayPolicy: "throw" × 振替（"after-holiday"）の規則',
    reason:
      "取り除くと残りの規則が未確定の祝日を引いて例外になる規則を、誤って redundant とした不具合（0.32.8 で直した P10）",
    matches: (o) =>
      o["unconfirmedHolidayPolicy"] === "throw" &&
      hasRule(o, (r) => r["holidayOverlapPolicy"] === "after-holiday"),
  },
  {
    name: "自分の設定を基準に数える第 n 営業日 × 定休日の扱いを変えない毎週の曜日の規則",
    reason:
      "定休日と同じ扱いの曜日の規則を理由に、誤って counting-basis を出した不具合（0.32.8 で直した K6）",
    matches: (o) => {
      const closed = Array.isArray(o["closedWeekdays"])
        ? (o["closedWeekdays"] as number[])
        : [0, 6];
      return (
        ownCounting(o) &&
        ["closedRecurringRules", "openRecurringRules"].some(
          (k) =>
            Array.isArray(o[k]) &&
            (o[k] as Obj[]).some(
              (r) =>
                "weekday" in r &&
                !("nth" in r) &&
                !("interval" in r) &&
                !("months" in r) &&
                closed.includes(r["weekday"] as number) === (k === "closedRecurringRules"),
            ),
        )
      );
    },
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

/** Combinations a caller cannot produce, with the reason (facts only) */
export const NOT_APPLICABLE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  properties: {
    "和集合の提供元 × kinds": "properties の設定は日本の提供元だけで、和集合の提供元を作らない",
    "自分の設定を基準に数える第 n 営業日 × 走査の範囲を覆う個別の日付":
      "properties の個別の日付は 11 日までの期間で、走査の範囲（28 年）を覆わない",
    'unconfirmedHolidayPolicy: "throw" × 振替（"after-holiday"）の規則':
      "properties の設定は unconfirmedHolidayPolicy を書かない",
  },
  "diagnose-properties": {
    "和集合の提供元 × kinds":
      "diagnose-properties の設定は提供元が 1 つ（自作の提供元・日本）かなしで、和集合の提供元を作らない",
  },
};
