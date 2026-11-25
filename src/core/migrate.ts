/**
 * Rewrites saved options to the names introduced in 0.30.0 (bizdays-toolkit/diagnose).
 * Uses only the rename table (renamed.ts) and does not validate (the diagnostics examine wrong options).
 */

import type { CalendarOptions } from "./calendar.ts";
import { rangeError } from "./errors.ts";
import { isOptionsObject } from "./options.ts";
import { RENAMED_KEYS, RENAMED_VALUES, type RenamedPlace } from "./renamed.ts";
import type { ScheduleOptions } from "./schedule.ts";

/**
 * One rewrite of the options. `path` is the position in the original options (with the old names); `from` and
 * `to` are the key name or value before and after. `conflicting` marks a key written under both the old and the
 * new name and left as it is (which one to use cannot be read).
 * @public
 */
export interface OptionChange {
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly conflicting?: boolean;
}

/**
 * Result of rewriting options. `options` is a new plain object and is not frozen (it is meant to be saved again).
 * @public
 */
export interface OptionsMigration<Options> {
  readonly options: Options;
  readonly changes: readonly OptionChange[];
}

/** Keys that are not copied (references to providers and calendars, schedule values) */
const SHARED_KEYS = new Set(["holidayProvider", "holidays", "calendar", "value"]);
/** Arrays whose elements are schedule values */
const VALUE_LISTS = new Set(["weekdayValues", "weekly"]);

/**
 * Deep copy of options for rewriting.
 * @param v - Any value.
 * @returns Arrays and options objects ({@link isOptionsObject}) are copied recursively; other values are returned as
 *   they are. The values of the keys holidayProvider, holidays, calendar and value are shared, not copied; for
 *   weekdayValues and weekly only the array is copied.
 * @internal
 */
export function clone(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clone);
  if (!isOptionsObject(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    // For per-weekday values only the array is copied; the values (schedule values) are the same objects
    out[k] = SHARED_KEYS.has(k)
      ? x
      : VALUE_LISTS.has(k) && Array.isArray(x)
        ? [...(x as unknown[])]
        : clone(x);
  }
  return out;
}

/**
 * Joins a path and a key with a dot (just the key when the path is empty).
 * @internal
 */
export const join = (path: string, key: string): string => (path ? `${path}.${key}` : key);

/**
 * Whether every holiday provider of the options has the ID "JP" (the only case in which kinds "national" is rewritten
 * to "regular").
 * @param options - Options object; reads holidayProvider, or the old key holidays when holidayProvider is undefined.
 * @returns true when there is at least one provider and each is an object with id "JP".
 * @internal
 * @see decisions.md #6, #10
 */
export function onlyJp(options: Record<string, unknown>): boolean {
  // As in creation, null is not omission and a hole in an array is read as an undefined element (decisions.md #6)
  const raw =
    options["holidayProvider"] === undefined ? options["holidays"] : options["holidayProvider"];
  const list: unknown[] = raw === undefined ? [] : Array.isArray(raw) ? Array.from(raw) : [raw];
  return (
    list.length > 0 &&
    list.every((p) => typeof p === "object" && p !== null && (p as { id?: unknown }).id === "JP")
  );
}

/**
 * Copy of one options object with the keys renamed in 0.30.0 replaced by the new names.
 * @param value - The object; not changed.
 * @param places - Rename tables that apply.
 * @param path - Position of the object (old names kept).
 * @param changes - Output: one entry per renamed key.
 * @returns A new object. When an old key and its new name both have a value other than undefined, both are kept and
 *   the change is marked `conflicting`. An undefined on one side is not a conflict: the side with a value is kept
 *   under the new name.
 * @internal
 * @see decisions.md #6
 */
export function renameObject(
  value: Record<string, unknown>,
  places: readonly RenamedPlace[],
  path: string,
  changes: OptionChange[],
): Record<string, unknown> {
  // An explicit undefined equals omission (decisions.md #6). As in the reading at creation (renameKeys), when
  // either the old or the new name is undefined there is no conflict and the one with a value stays under the
  // new name
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const r = RENAMED_KEYS.find((x) => places.includes(x.place) && x.from === key);
    if (r === undefined) {
      // An undefined new name whose old name is present is not written (whatever the key order, it must not
      // overwrite the value of the old name)
      const renamedFrom = RENAMED_KEYS.some(
        (x) => places.includes(x.place) && x.to === key && Object.hasOwn(value, x.from),
      );
      if (!(renamedFrom && v === undefined)) out[key] = v;
      continue;
    }
    const hasTo = Object.hasOwn(value, r.to);
    if (v !== undefined && hasTo && value[r.to] !== undefined) {
      changes.push(
        Object.freeze({ path: join(path, key), from: r.from, to: r.to, conflicting: true }),
      );
      out[key] = v;
      continue;
    }
    changes.push(Object.freeze({ path: join(path, key), from: r.from, to: r.to }));
    // When the old name is undefined and the new name has a value, only the old name is removed
    if (v !== undefined || !hasTo) out[r.to] = v;
  }
  return out;
}

/**
 * Replaces the values renamed in 0.30.0.
 * @param value - A string, an array, or anything else.
 * @param place - Rename table.
 * @param key - New name of the key.
 * @param path - Position of the value.
 * @param changes - Output: one entry per replaced value.
 * @returns The new name for a renamed string; a new array with each element replaced; any other value unchanged.
 * @internal
 */
export function renameValues(
  value: unknown,
  place: RenamedPlace,
  key: string,
  path: string,
  changes: OptionChange[],
): unknown {
  const rules = RENAMED_VALUES.filter((r) => r.place === place && r.key === key);
  const one = (v: unknown, at: string): unknown => {
    const r = rules.find((x) => x.from === v);
    if (!r) return v;
    changes.push(Object.freeze({ path: at, from: r.from, to: r.to }));
    return r.to;
  };
  return Array.isArray(value) ? value.map((v, i) => one(v, `${path}[${i}]`)) : one(value, path);
}

/**
 * Shared implementation of the migrate functions.
 * @param input - Stored options.
 * @param places - Rename tables for the top level.
 * @param ruleLists - New names of the keys that hold rule arrays.
 * @param policyValueKey - New name of the top-level key whose value is renamed, or null.
 * @returns A frozen `{ options, changes }`; `options` is a new unfrozen object, `changes` is frozen. Paths in
 *   `changes` use the names as written.
 * @throws RangeError `invalid-argument` when `input` is not an options object.
 * @internal
 */
export function migrate<Options>(
  input: unknown,
  places: readonly RenamedPlace[],
  ruleLists: readonly string[],
  policyValueKey: string | null,
): OptionsMigration<Options> {
  if (!isOptionsObject(input))
    throw rangeError("invalid-argument", "options must be a plain object");
  const changes: OptionChange[] = [];
  const copied = clone(input) as Record<string, unknown>;
  const jp = onlyJp(copied);
  // Positions are built with the keys before rewriting, to keep the positions of the old names
  const written = new Map<string, string>();
  for (const key of Object.keys(copied)) {
    const r = RENAMED_KEYS.find((x) => places.includes(x.place) && x.from === key);
    written.set(r && !Object.hasOwn(copied, r.to) ? r.to : key, key);
  }
  const out = renameObject(copied, places, "", changes);
  for (const list of ruleLists) {
    const rules = out[list];
    if (!Array.isArray(rules)) continue;
    const at = written.get(list) ?? list;
    out[list] = rules.map((rule: unknown, i) => {
      if (!isOptionsObject(rule)) return rule;
      const renamed = renameObject(rule, ["rule"], `${at}[${i}]`, changes);
      if (jp && renamed["kinds"] !== undefined)
        renamed["kinds"] = renameValues(
          renamed["kinds"],
          "rule",
          "kinds",
          `${at}[${i}].kinds`,
          changes,
        );
      return renamed;
    });
  }
  if (policyValueKey !== null && out[policyValueKey] !== undefined) {
    out[policyValueKey] = renameValues(
      out[policyValueKey],
      "schedule",
      policyValueKey,
      written.get(policyValueKey) ?? policyValueKey,
      changes,
    );
  }
  return Object.freeze({ options: out as Options, changes: Object.freeze(changes) });
}

/**
 * Rewrites the names renamed in 0.30.0 (keys and values) in stored business-calendar options.
 * @param options - Stored options. The contents are not validated (use diagnoseCalendar); unknown keys are copied as
 *   they are.
 * @returns `{ options, changes }`: new options and the list of changes (empty when only new names are used; applying
 *   it again gives the same result).
 * @throws RangeError `invalid-argument` when `options` is not a plain object. Nothing else throws.
 * @public
 */
export function migrateCalendarOptions(options: object): OptionsMigration<CalendarOptions> {
  return migrate(
    options,
    ["source", "calendar"],
    ["closedRecurringRules", "openRecurringRules"],
    null,
  );
}

/**
 * Rewrites the names renamed in 0.30.0 (keys and values) in stored schedule options. Same behaviour as {@link
 * migrateCalendarOptions}.
 * @param options - Stored options.
 * @returns `{ options, changes }`.
 * @throws RangeError `invalid-argument` when `options` is not a plain object.
 * @public
 */
export function migrateScheduleOptions<Value>(
  options: object,
): OptionsMigration<ScheduleOptions<Value>> {
  return migrate(options, ["source", "schedule"], ["recurringRules"], "holidayPolicy");
}
