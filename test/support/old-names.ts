// The helper that writes new-name options with the names and values from before the rename of 0.30.0 (shared by
// transformation 1 of test/metamorphic.test.ts and consistency 6 of test/consistency.test.ts; up to 0.31.0 each
// file had its own, and the version of consistency 6 did not turn the old value of kinds back)
import { RENAMED_KEYS, RENAMED_VALUES, type RenamedPlace } from "../../src/core/renamed.ts";
import type { HolidayProvider } from "../../src/index.ts";
import type { Obj } from "./catalog.ts";

export const renamedTo = (places: readonly RenamedPlace[], from: string): string | undefined =>
  RENAMED_KEYS.find((r) => places.includes(r.place) && r.from === from)?.to;
export const renamedFrom = (places: readonly RenamedPlace[], to: string): string | undefined =>
  RENAMED_KEYS.find((r) => places.includes(r.place) && r.to === to)?.from;
/** The new value of a renamed value → its old value (looked up by place and key) */
export const oldValueOf = (place: RenamedPlace, key: string, to: unknown): string | undefined =>
  RENAMED_VALUES.find((r) => r.place === place && r.key === key && r.to === to)?.from;
export const RULE_LISTS = ["closedRecurringRules", "openRecurringRules", "recurringRules"];
export const OLD_RULE_LISTS = RULE_LISTS.map(
  (list) => renamedFrom(["calendar", "schedule"], list) ?? list,
);

/**
 * Whether every holiday provider has the ID "JP" (only in such options the old value "national" of kinds means
 * the same as "regular". docs/decisions.md #10)
 */
export function onlyJapan(options: Obj): boolean {
  const p = options["holidayProvider"];
  const list = (Array.isArray(p) ? p : p === undefined ? [] : [p]) as HolidayProvider<string>[];
  return list.length > 0 && list.every((x) => x.id === "JP");
}

/**
 * Writes new-name options with the names and values from before the rename of 0.30.0. Keys are looked up by
 * place in the table of old names (RENAMED_KEYS) and values are turned back with the table of renamed values
 * (RENAMED_VALUES): "ignore" → "weekday" of holidayPolicy of schedules, and "regular" → "national" in kinds of
 * the rules of options with only the Japanese provider. The number of values turned back is returned too
 */
export function toOld(
  options: Obj,
  kind: "calendar" | "schedule",
): { options: Obj; oldValues: number } {
  const out: Obj = {};
  let oldValues = 0;
  const japan = onlyJapan(options);
  for (const [k, v] of Object.entries(options)) {
    const value = RULE_LISTS.includes(k)
      ? (v as Obj[]).map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([rk, rv]) => {
              let old = rv;
              if (japan && rk === "kinds" && Array.isArray(rv)) {
                old = rv.map((x: unknown) => {
                  const o = oldValueOf("rule", "kinds", x);
                  if (o === undefined) return x;
                  oldValues++;
                  return o;
                });
              }
              return [renamedFrom(["rule"], rk) ?? rk, old];
            }),
          ),
        )
      : v;
    out[renamedFrom(["source", kind], k) ?? k] = value;
  }
  if (kind === "schedule") {
    const old = oldValueOf("schedule", "holidayPolicy", out["holiday"]);
    if (old !== undefined) {
      out["holiday"] = old;
      oldValues++;
    }
  }
  return { options: out, oldValues };
}
