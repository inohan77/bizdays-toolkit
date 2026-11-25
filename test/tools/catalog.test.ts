// Checks that the catalog (test/support/catalog.ts) agrees with the public types (etc/api.md) and that the
// generator produces every key of the catalog per context of the callers and per rule shape (T2 of the test
// expansion plan). Adding a rule shape, an option key or a choice value without adding it to the catalog stops
// here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { RENAMED_KEYS } from "../../src/core/renamed.ts";
import {
  COMMON_RULE_KEYS,
  EXCLUDED_KEYS,
  POLICY_VALUES,
  SHAPES,
  picker,
  random,
  randomCalendarOptions,
  randomScheduleOptions,
  shapeKeysIn,
  shapeOf,
  shapesIn,
  isIntendedInvalid,
  type Obj,
} from "../support/catalog.ts";
import { featuresOf, normalizeOptions } from "../support/features.ts";
import { fixedCases, generateCases } from "../support/result-cases.ts";
import { CONTEXT_USES, siteTrials } from "../support/sites.ts";
import { SITES } from "../support/features-compare.ts";

const api = readFileSync("etc/api.md", "utf8");
/**
 * The old names of the rename (per place, so that `holiday` of a rule and the old name `holiday` of schedules
 * are not confused)
 */
const oldNames = (places: readonly string[]) =>
  new Set(RENAMED_KEYS.filter((r) => places.includes(r.place)).map((r) => r.from));

/** The definition of a type in etc/api.md (the ```ts block) */
function definition(name: string): string {
  const m = new RegExp(`^### ${name} \\(.*\\n\\n\`\`\`ts\\n([\\s\\S]*?)^\`\`\``, "m").exec(api);
  assert.ok(m, `etc/api.md に ${name} がない`);
  return m[1]!;
}
/** The keys of a type definition that are not never (old names of that place's rename left out) */
const keysOf = (name: string, places: readonly string[] = ["rule"]): string[] => {
  const old = oldNames(places);
  return [...definition(name).matchAll(/readonly (\w+)\??: ([^;]+);/g)]
    .filter((m) => m[2]!.trim() !== "never" && !old.has(m[1]!))
    .map((m) => m[1]!);
};
/** The values of a string union */
const literalsOf = (text: string): string[] => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// ------------------------------------------------------------
// The keys the callers really produce (per type)
// ------------------------------------------------------------

/** Collects, from the options of the three callers, the keys really produced per type ("Type" → set of keys) */
const produced = (() => {
  const out = new Map<string, Set<string>>();
  const add = (type: string, keys: Iterable<string>) => {
    const set = out.get(type) ?? new Set<string>();
    for (const k of keys) set.add(k);
    out.set(type, set);
  };
  for (const site of SITES)
    for (const t of siteTrials(site)) {
      const o = normalizeOptions(t.options, t.kind);
      add(t.kind === "calendar" ? "CalendarOptions" : "ScheduleOptions", Object.keys(o));
      add("HolidaySourceOptions", Object.keys(o));
      if (t.kind === "schedule" && isObj(o["holidayPolicy"]))
        add("ScheduleHolidayPolicy", Object.keys(o["holidayPolicy"]));
      const lists =
        t.kind === "calendar" ? ["closedRecurringRules", "openRecurringRules"] : ["recurringRules"];
      for (const k of lists)
        for (const r of Array.isArray(o[k]) ? (o[k] as unknown[]) : []) {
          if (!isObj(r)) continue;
          add(t.kind === "calendar" ? "RecurringRule" : "ScheduleRecurringRule", Object.keys(r));
          add("EffectivePeriod", Object.keys(r));
          const s = shapeOf(r);
          if (s) add(s.pattern, Object.keys(r));
        }
    }
  return out;
})();

/** The keys checked per type (the keys of the public type that have a meaning in that place) */
const TYPES: readonly [type: string, places: readonly string[]][] = [
  ["CalendarOptions", ["calendar", "source"]],
  ["HolidaySourceOptions", ["source"]],
  ["ScheduleOptions", ["schedule", "source"]],
  ["ScheduleHolidayPolicy", ["schedule"]],
  ["ScheduleRecurringRule", ["rule"]],
  ["EffectivePeriod", ["rule"]],
  ...SHAPES.map((s): [string, readonly string[]] => [s.pattern, ["rule"]]),
];

test("目録: 繰り返しの規則の形が、公開の型（RecurringPattern の合併）とそろっている", () => {
  const union = [...definition("RecurringPattern").matchAll(/\b(\w+Pattern)\b/g)]
    .map((m) => m[1]!)
    .filter((name) => name !== "RecurringPattern");
  assert.deepEqual(
    [...new Set(union)].sort(),
    SHAPES.map((s) => s.pattern).sort(),
    "RecurringPattern の形と目録の形が違う（新しい形を足したら test/support/catalog.ts の SHAPES にも足す）",
  );
});

test("目録: 規則の形ごとのキーが、公開の型のキーとそろっている", () => {
  // The keys the union RecurringPattern adds to a shape (the combination with after-holiday)
  const added = keysOf("RecurringPattern");
  for (const shape of SHAPES) {
    const keys = keysOf(shape.pattern);
    for (const key of [...shape.keys, ...(shape.scheduleKeys ?? [])])
      assert.ok(
        keys.includes(key) || added.includes(key),
        `目録の ${shape.pattern} の ${key} は公開の型にない（古い目録）`,
      );
  }
});

test("目録: 公開の型のキーを、呼び出し側が作るか、「型.キー」で理由付きで除外している", () => {
  const missing: string[] = [];
  for (const [type, places] of TYPES) {
    const made = produced.get(type) ?? new Set<string>();
    for (const key of keysOf(type, places))
      if (!made.has(key) && !(`${type}.${key}` in EXCLUDED_KEYS)) missing.push(`${type}.${key}`);
  }
  assert.deepEqual(missing, [], "呼び出し側が作らず、除外の理由もないキー");
});

test("目録: 除外した「型.キー」は公開の型に実在し、呼び出し側は実際には作らない（除外の理由と食い違わない）", () => {
  const problems: string[] = [];
  for (const entry of Object.keys(EXCLUDED_KEYS)) {
    const [type, key] = entry.split(".") as [string, string];
    const m = new RegExp(`^### ${type} \\(`, "m").exec(api);
    if (!m || !keysOf(type, ["calendar", "schedule", "source", "rule"]).includes(key))
      problems.push(`${entry}: etc/api.md の ${type} にこのキーがない（古い除外）`);
    else if (produced.get(type)?.has(key))
      problems.push(
        `${entry}: 呼び出し側が作っている（除外の理由「${EXCLUDED_KEYS[entry]}」と食い違う）`,
      );
  }
  assert.deepEqual(problems, [], "除外の一覧の食い違い");
});

test("目録: 選択肢の値が、公開の型の文字列の合併とそろっている", () => {
  assert.deepEqual(literalsOf(definition("HolidayPolicy")), POLICY_VALUES["HolidayPolicy"]);
  assert.deepEqual(
    literalsOf(definition("HolidayOverlapPolicy")),
    POLICY_VALUES["HolidayOverlapPolicy"],
  );
  const source = definition("HolidaySourceOptions");
  for (const key of ["outOfRangePolicy", "unconfirmedHolidayPolicy"]) {
    const m = new RegExp(`readonly ${key}\\?: ([^;]+);`).exec(source);
    assert.ok(m, `HolidaySourceOptions.${key} がない`);
    assert.deepEqual(literalsOf(m[1]!), POLICY_VALUES[key]);
  }
});

// ------------------------------------------------------------
// Reachability of the generator (per context of the callers and per rule shape)
// ------------------------------------------------------------

/** The shapes a context does not make, with the reason */
function excludedShapes(ctx: (typeof CONTEXT_USES)[number]["ctx"]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of SHAPES) {
    if (s.holiday && !ctx.holidays)
      out.set(s.pattern, "提供元のない設定では作らない（祝日に従属する形は提供元が要る）");
    else if (s.sinceRename && !ctx.newShapes)
      out.set(
        s.pattern,
        "改名の前のバージョン（0.22.2）にない形なので、そのバージョンと比べる設定では作らない",
      );
  }
  return out;
}

const TRIALS = 400;
for (const use of CONTEXT_USES)
  for (const kind of use.kinds) {
    const excluded = excludedShapes(use.ctx);
    const note = excluded.size > 0 ? `。作らない形: ${[...excluded.keys()].join("・")}` : "";
    test(`生成器の到達性（${use.name}・${kind === "calendar" ? "カレンダー" : "スケジュール"}）: 形ごとに、その形のキーと共通のキーをすべて作る${note}`, () => {
      const p = picker(random(2));
      const byShape = new Map<string, Set<string>>();
      const policies = new Set<unknown>();
      for (let i = 0; i < TRIALS; i++) {
        const o =
          kind === "calendar"
            ? randomCalendarOptions(p, use.ctx)
            : randomScheduleOptions(p, use.ctx);
        if (kind === "calendar") policies.add(o["holidayPolicy"]);
        for (const [pattern, keys] of shapeKeysIn(o)) {
          const set = byShape.get(pattern) ?? new Set<string>();
          for (const k of keys) set.add(k);
          byShape.set(pattern, set);
        }
        for (const k of ["closedRecurringRules", "openRecurringRules", "recurringRules"])
          for (const r of Array.isArray(o[k]) ? (o[k] as Obj[]) : [])
            policies.add(r["holidayOverlapPolicy"]);
      }
      // The shapes made and not made agree with the context's arrangement (shapesIn)
      assert.deepEqual(
        SHAPES.filter((s) => !excluded.has(s.pattern)).map((s) => s.pattern),
        shapesIn(use.ctx).map((s) => s.pattern),
      );
      const problems: string[] = [];
      for (const s of shapesIn(use.ctx)) {
        const made = byShape.get(s.pattern);
        if (!made) {
          problems.push(`${s.pattern} を作らない`);
          continue;
        }
        const required = [
          ...s.keys,
          ...COMMON_RULE_KEYS,
          ...(kind === "schedule" ? ["value", ...(s.scheduleKeys ?? [])] : []),
        ];
        for (const k of required)
          if (!made.has(k)) problems.push(`${s.pattern} の ${k} を作らない`);
      }
      for (const s of SHAPES)
        if (excluded.has(s.pattern) && byShape.has(s.pattern))
          problems.push(`${s.pattern} は作らないはず（${excluded.get(s.pattern)}）`);
      const values = [
        ...(kind === "calendar" ? POLICY_VALUES["HolidayPolicy"]! : []),
        ...POLICY_VALUES["HolidayOverlapPolicy"]!,
      ];
      for (const v of values) if (!policies.has(v)) problems.push(`選択肢の値 ${v} を作らない`);
      assert.deepEqual(problems, [], `${use.name}（${use.site}）`);
    });
  }

test("意図した入力の誤りの印（result-compare が作成の失敗を分ける印）は、誤りの形の規則とそろう", () => {
  // The mark is on the rule object, so it disappears when a copied rule is not marked again. Compared with the
  // forms of mistakes (invalid= of test/support/features.ts)
  const problems: string[] = [];
  let marked = 0;
  for (const newShapes of [true, false])
    for (const c of [...fixedCases(), ...generateCases(20261030, 1, newShapes)])
      for (const one of c.partner ? [c, c.partner] : [c]) {
        const hasMark = ["closedRecurringRules", "openRecurringRules", "recurringRules"].some(
          (k) =>
            Array.isArray(one.options[k]) && (one.options[k] as unknown[]).some(isIntendedInvalid),
        );
        const invalid = [...featuresOf(one.options, one.kind)].some((f) =>
          f.startsWith("invalid="),
        );
        if (hasMark) marked++;
        if (hasMark !== invalid)
          problems.push(
            `${one.id}（${newShapes ? "new" : "0.22.2"}）: 印 ${hasMark}・誤りの形 ${invalid}`,
          );
      }
  assert.deepEqual(problems, []);
  assert.ok(marked > 0, "印のある設定が 1 件もない（空振り）");
});
