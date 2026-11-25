/**
 * Table of the option keys and values renamed in 0.30.0 (docs/decisions.md #10, 0.30.0 in docs/migration.md).
 * The reading at the entry of validation, the deprecated-option diagnostic and the migrate... functions use
 * only this table.
 */

import { rangeError, type IssueCollector } from "./errors.ts";

/** @internal Places in the options that have renamed keys */
export type RenamedPlace =
  | "source"
  | "calendar"
  | "schedule"
  | "rule"
  | "combine"
  | "fromSchedule"
  | "dueDate"
  | "substitute";

/** @internal A renamed key */
export interface RenamedKey {
  readonly place: RenamedPlace;
  readonly from: string;
  readonly to: string;
}

/** @internal Table of renamed keys (0.30.0) */
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

/** @internal A renamed value */
export interface RenamedValue {
  readonly place: RenamedPlace;
  /** Name of the new key */
  readonly key: string;
  readonly from: string;
  readonly to: string;
}

/**
 * @internal Table of renamed values (0.30.0). "national" in kinds is treated differently only in options that
 * use a holiday provider whose ID is "JP". Creation and the diagnostics report it without reading it as the new
 * value (reportNational in schedule.ts); migrate... rewrites it in options with only the Japanese provider
 * (docs/decisions.md #10)
 */
export const RENAMED_VALUES: readonly RenamedValue[] = [
  { place: "schedule", key: "holidayPolicy", from: "weekday", to: "ignore" },
  { place: "rule", key: "kinds", from: "national", to: "regular" },
];

/**
 * @internal What to do when a rename is found (creation and the diagnostics record it and read the new name;
 * options with nowhere to record, such as combined ones, are only read as the new name)
 */
export type RenameReport = IssueCollector | "throw";

const VERSION = "0.30.0";
/**
 * Joins a path and a key with a dot (just the key when the path is empty).
 * @internal
 */
export const join = (path: string, key: string): string => (path ? `${path}.${key}` : key);

/**
 * Reports that an old key and its new name are both written.
 * @param report - A collector (records an `invalid-option` error at `path`) or "throw" (throws it as a RangeError).
 * @param path - Position of the old key.
 * @param from - Old key.
 * @param to - New key.
 * @internal
 */
export function conflict(report: RenameReport, path: string, from: string, to: string): void {
  const message = `use only ${JSON.stringify(to)} (${JSON.stringify(from)} was renamed in ${VERSION})`;
  if (report === "throw") throw rangeError("invalid-option", `${path}: ${message}`);
  report.error("invalid-option", path, message);
}

/**
 * Reads the keys renamed in 0.30.0: returns a copy of one options object with old keys replaced by the new names.
 * @param report - A collector, which receives a `deprecated-option` warning per old key, or "throw" to record
 *   nothing.
 * @param places - Which rename tables apply to this object.
 * @param writtenPath - Position of the object as the user wrote it; used for the warnings and errors.
 * @param value - The object; not changed.
 * @returns A new object. An old key whose value is undefined is dropped. When an old key and its new name both have a
 *   value other than undefined, that is an `invalid-option` (recorded, or thrown with "throw") and the old key is
 *   dropped.
 * @internal
 * @see decisions.md #6, #10
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
    // An explicit undefined equals omission (decisions.md #6). No conflict when either one is undefined
    const old = value[r.from];
    if (old !== undefined && value[r.to] !== undefined) {
      conflict(report, at, r.from, r.to);
      delete out[r.from];
      continue;
    }
    if (old !== undefined) out[r.to] = old;
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

/**
 * The key name the user wrote for a key of a renamed object.
 * @param places - Rename tables that apply.
 * @param value - The object as written by the user.
 * @param key - A new key name.
 * @returns The old name when the user wrote the old name with a value other than undefined; otherwise `key`.
 * @internal
 */
export function writtenKey(
  places: readonly RenamedPlace[],
  value: Record<string, unknown>,
  key: string,
): string {
  const r = RENAMED_KEYS.find(
    (x) => places.includes(x.place) && x.to === key && value[x.from] !== undefined,
  );
  return r ? r.from : key;
}

/**
 * Reads the values renamed in 0.30.0.
 * @param report - A collector, which receives a `deprecated-option` warning per replaced value, or "throw" to record
 *   nothing.
 * @param place - Rename table of the object.
 * @param key - New name of the key holding the value.
 * @param writtenPath - Position of the value as written.
 * @param value - A string, an array, or anything else.
 * @returns The new name for a renamed string; a new array with each element replaced for an array; any other value
 *   unchanged. Unchanged when no rename applies to `place` and `key`.
 * @internal
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
