/**
 * 0.30.0 で改名した設定のキーと値の表（docs/decisions.md の 10 番、docs/migration.md の 0.30.0）。
 * 検証の入口での読み替え・診断の deprecated-option・migrate… 関数が、この表だけを使う。
 */

import { rangeError, type IssueCollector } from "./errors.ts";

/** @internal 改名したキーがある設定の場所 */
export type RenamedPlace =
  | "source"
  | "calendar"
  | "schedule"
  | "rule"
  | "combine"
  | "fromSchedule"
  | "dueDate"
  | "substitute";

/** @internal 改名したキー */
export interface RenamedKey {
  readonly place: RenamedPlace;
  readonly from: string;
  readonly to: string;
}

/** @internal 改名したキーの表（0.30.0） */
export const RENAMED_KEYS: readonly RenamedKey[] = [
  { place: "source", from: "holidays", to: "holidayProvider" },
  { place: "source", from: "outOfRange", to: "outOfRangePolicy" },
  { place: "source", from: "unconfirmedHolidays", to: "unconfirmedHolidayPolicy" },
  { place: "calendar", from: "closedAnnual", to: "closedAnnualDates" },
  { place: "calendar", from: "closedRecurring", to: "closedRecurringRules" },
  { place: "calendar", from: "openRecurring", to: "openRecurringRules" },
  { place: "calendar", from: "maxSearchDays", to: "searchDayLimit" },
  { place: "schedule", from: "weekly", to: "weekdayValues" },
  { place: "schedule", from: "holiday", to: "holidayPolicy" },
  { place: "schedule", from: "annual", to: "annualDates" },
  { place: "schedule", from: "recurring", to: "recurringRules" },
  { place: "rule", from: "day", to: "dayOfMonth" },
  { place: "rule", from: "onHolidayRule", to: "holidayOverlapPolicy" },
  { place: "combine", from: "businessDay", to: "open" },
  { place: "combine", from: "maxSearchDays", to: "searchDayLimit" },
  { place: "fromSchedule", from: "maxSearchDays", to: "searchDayLimit" },
  { place: "dueDate", from: "day", to: "dayOfMonth" },
  { place: "substitute", from: "rules", to: "directions" },
  { place: "substitute", from: "name", to: "renameSubstitute" },
  { place: "substitute", from: "original", to: "originalPolicy" },
];

/** @internal 改名した値 */
export interface RenamedValue {
  readonly place: RenamedPlace;
  /** 新しいキーの名前 */
  readonly key: string;
  readonly from: string;
  readonly to: string;
}

/**
 * @internal 改名した値の表（0.30.0）。kinds の "national" は、ID が "JP" の祝日の提供元を使う設定でだけ扱いを変える。
 * 作成と診断は値を読み替えずに知らせ（schedule.ts の reportNational）、migrate… は日本の提供元だけの設定で書き換える（docs/decisions.md の 10 番）
 */
export const RENAMED_VALUES: readonly RenamedValue[] = [
  { place: "schedule", key: "holidayPolicy", from: "weekday", to: "ignore" },
  { place: "rule", key: "kinds", from: "national", to: "regular" },
];

/** @internal 改名を見つけたときの扱い（作成・診断は記録して読み替える。合成などの記録先がない設定は読み替えるだけ） */
export type RenameReport = IssueCollector | "throw";

const VERSION = "0.30.0";
const join = (path: string, key: string): string => (path ? `${path}.${key}` : key);

function conflict(report: RenameReport, path: string, from: string, to: string): void {
  const message = `use only ${JSON.stringify(to)} (${JSON.stringify(from)} was renamed in ${VERSION})`;
  if (report === "throw") throw rangeError("invalid-option", `${path}: ${message}`);
  report.error("invalid-option", path, message);
}

/**
 * @internal 設定のオブジェクト 1 つの旧名のキーを新しい名前に読み替えた複製を返す（利用者のオブジェクトは変えない）。
 * writtenPath は利用者が書いた位置（旧名を含む）で、deprecated-option と invalid-option の位置に使う。
 * 旧名と新しい名前の両方があれば invalid-option（どちらを使うか読み取れないため）
 */
export function renameKeys(
  report: RenameReport,
  places: readonly RenamedPlace[],
  writtenPath: string,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...value };
  for (const r of RENAMED_KEYS) {
    if (!places.includes(r.place) || !Object.hasOwn(value, r.from)) continue;
    const at = join(writtenPath, r.from);
    if (Object.hasOwn(value, r.to)) {
      conflict(report, at, r.from, r.to);
      delete out[r.from];
      continue;
    }
    out[r.to] = value[r.from];
    delete out[r.from];
    if (report !== "throw")
      report.warning(
        "deprecated-option",
        at,
        `${JSON.stringify(r.from)} was renamed to ${JSON.stringify(r.to)} in ${VERSION}`,
      );
  }
  return out;
}

/** @internal 読み替えたオブジェクトのキーについて、利用者が書いた名前（旧名ならその名前） */
export function writtenKey(
  places: readonly RenamedPlace[],
  value: Record<string, unknown>,
  key: string,
): string {
  const r = RENAMED_KEYS.find(
    (x) => places.includes(x.place) && x.to === key && Object.hasOwn(value, x.from),
  );
  return r ? r.from : key;
}

/**
 * @internal 改名した値を読み替える（読み替えたら deprecated-option を記録する）。
 * 文字列ならその値、配列なら要素ごとに読み替えた複製を返す
 */
export function renameValue(
  report: RenameReport,
  place: RenamedPlace,
  key: string,
  writtenPath: string,
  value: unknown,
): unknown {
  const rules = RENAMED_VALUES.filter((r) => r.place === place && r.key === key);
  if (rules.length === 0) return value;
  const one = (v: unknown, at: string): unknown => {
    const r = rules.find((x) => x.from === v);
    if (!r) return v;
    if (report !== "throw")
      report.warning(
        "deprecated-option",
        at,
        `${JSON.stringify(r.from)} was renamed to ${JSON.stringify(r.to)} in ${VERSION}`,
      );
    return r.to;
  };
  if (Array.isArray(value)) return value.map((v, i) => one(v, `${writtenPath}[${i}]`));
  return one(value, writtenPath);
}
