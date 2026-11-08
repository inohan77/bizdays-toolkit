// 新しい名前の設定を、0.30.0 の改名の前の名前と値で書く補助（test/metamorphic.test.ts の変形 1 と、test/consistency.test.ts の
// 整合 6 で共通。0.31.0 までは 2 つのファイルに別々にあり、整合 6 の版は kinds の旧い値を戻していなかった）
import { RENAMED_KEYS, RENAMED_VALUES, type RenamedPlace } from "../../src/core/renamed.ts";
import type { HolidayProvider } from "../../src/index.ts";
import type { Obj } from "./catalog.ts";

export const renamedTo = (places: readonly RenamedPlace[], from: string): string | undefined =>
  RENAMED_KEYS.find((r) => places.includes(r.place) && r.from === from)?.to;
export const renamedFrom = (places: readonly RenamedPlace[], to: string): string | undefined =>
  RENAMED_KEYS.find((r) => places.includes(r.place) && r.to === to)?.from;
/** 改名した値の新しい値 → 旧い値（場所とキーで引く） */
export const oldValueOf = (place: RenamedPlace, key: string, to: unknown): string | undefined =>
  RENAMED_VALUES.find((r) => r.place === place && r.key === key && r.to === to)?.from;
export const RULE_LISTS = ["closedRecurringRules", "openRecurringRules", "recurringRules"];
export const OLD_RULE_LISTS = RULE_LISTS.map(
  (list) => renamedFrom(["calendar", "schedule"], list) ?? list,
);

/** 祝日の提供元がすべて ID "JP" か（kinds の旧い値 "national" は、この設定でだけ "regular" と同じ意味になる。docs/decisions.md の 10 番） */
export function onlyJapan(options: Obj): boolean {
  const p = options["holidayProvider"];
  const list = (Array.isArray(p) ? p : p === undefined ? [] : [p]) as HolidayProvider<string>[];
  return list.length > 0 && list.every((x) => x.id === "JP");
}

/**
 * 新しい名前の設定を、0.30.0 の改名の前の名前と値で書く。キーは旧名の表（RENAMED_KEYS）の場所で引き、値は改名した値の表
 * （RENAMED_VALUES）で戻す: スケジュールの holidayPolicy の "ignore" → "weekday" と、日本の提供元だけの設定の規則の
 * kinds の "regular" → "national"。旧い値に戻した数も返す
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
