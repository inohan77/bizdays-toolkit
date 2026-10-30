/**
 * 保存済みの設定を、0.30.0 で改名した新しい名前に書き換える（bizdays-toolkit/diagnose）。
 * 改名の表（renamed.ts）だけを使い、検証はしない（設定の中身の誤りは診断で調べる）。
 */

import type { CalendarOptions } from "./calendar.ts";
import { typeError } from "./errors.ts";
import { RENAMED_KEYS, RENAMED_VALUES, type RenamedPlace } from "./renamed.ts";
import type { ScheduleOptions } from "./schedule.ts";

/**
 * 設定の書き換えの 1 件。path は元の設定の中の位置（旧名のまま）、from・to は書き換える前と後のキーの名前か値。
 * conflicting は、旧名と新しい名前の両方が書かれていて書き換えなかったキー（どちらを使うか読み取れないため）。
 * @public
 */
export interface OptionChange {
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly conflicting?: boolean;
}

/**
 * 設定の書き換えの結果。options は新しい普通のオブジェクトで、凍結しない（保存し直すため）。
 * @public
 */
export interface OptionsMigration<Options> {
  readonly options: Options;
  readonly changes: readonly OptionChange[];
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** 複製しないキー（提供元・カレンダーの参照、スケジュールの値） */
const SHARED_KEYS = new Set(["holidayProvider", "holidays", "calendar", "value"]);
/** 要素がスケジュールの値の配列 */
const VALUE_LISTS = new Set(["weekdayValues", "weekly"]);

function clone(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clone);
  if (!isPlain(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    // 曜日ごとの値は配列だけを複製し、値（スケジュールの値）は同じものを入れる
    out[k] = SHARED_KEYS.has(k)
      ? x
      : VALUE_LISTS.has(k) && Array.isArray(x)
        ? [...(x as unknown[])]
        : clone(x);
  }
  return out;
}

const join = (path: string, key: string): string => (path ? `${path}.${key}` : key);

/**
 * kinds の "national" を書き換えるか。祝日の提供元がすべて ID "JP" のときだけ書き換える。
 * ほかの提供元と合わせて使う設定では、新しい名前の "regular" がほかの提供元の祝日にも当たるので書き換えない（docs/decisions.md の 55 番）
 */
function onlyJp(options: Record<string, unknown>): boolean {
  const raw = options["holidayProvider"] ?? options["holidays"];
  const list: unknown[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return (
    list.length > 0 &&
    list.every((p) => typeof p === "object" && p !== null && (p as { id?: unknown }).id === "JP")
  );
}

function renameObject(
  value: Record<string, unknown>,
  places: readonly RenamedPlace[],
  path: string,
  changes: OptionChange[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const r = RENAMED_KEYS.find((x) => places.includes(x.place) && x.from === key);
    if (r === undefined) {
      out[key] = v;
      continue;
    }
    if (Object.hasOwn(value, r.to)) {
      changes.push({ path: join(path, key), from: r.from, to: r.to, conflicting: true });
      out[key] = v;
      continue;
    }
    changes.push({ path: join(path, key), from: r.from, to: r.to });
    out[r.to] = v;
  }
  return out;
}

function renameValues(
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
    changes.push({ path: at, from: r.from, to: r.to });
    return r.to;
  };
  return Array.isArray(value) ? value.map((v, i) => one(v, `${path}[${i}]`)) : one(value, path);
}

function migrate<Options>(
  input: unknown,
  places: readonly RenamedPlace[],
  ruleLists: readonly string[],
  policyValueKey: string | null,
): OptionsMigration<Options> {
  if (!isPlain(input)) throw typeError("invalid-argument", "options must be a plain object");
  const changes: OptionChange[] = [];
  const copied = clone(input) as Record<string, unknown>;
  const jp = onlyJp(copied);
  // 旧名の位置を保つため、書き換える前のキーで位置を作る
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
      if (!isPlain(rule)) return rule;
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
 * 保存済みの営業日カレンダーの設定の旧名（0.30.0 で改名したキーと値）を、新しい名前に書き換える。
 * 例外を投げるのは options が普通のオブジェクトでないときだけで、設定の中身は検証しない（diagnoseCalendar で調べる）。
 * 新しい名前だけの設定に当てると changes は空で、何度当てても同じ結果になる。知らないキーはそのまま写す。
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
 * 保存済みのスケジュールの設定の旧名（0.30.0 で改名したキーと値）を、新しい名前に書き換える（migrateCalendarOptions と同じ扱い）。
 * @public
 */
export function migrateScheduleOptions<Value>(
  options: object,
): OptionsMigration<ScheduleOptions<Value>> {
  return migrate(options, ["source", "schedule"], ["recurringRules"], "holidayPolicy");
}
