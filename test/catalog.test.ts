// 目録（test/support/catalog.ts）が公開の型（etc/api.md）と一致し、生成器が目録のすべての形とキーを作ることを確かめる
// （テスト拡充案の T2）。規則の形・設定のキー・選択肢の値を足して目録に足し忘れると、ここで止まる。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { RENAMED_KEYS } from "../src/core/renamed.ts";
import {
  COMMON_RULE_KEYS,
  EXCLUDED_KEYS,
  POLICY_VALUES,
  SHAPES,
  picker,
  random,
  randomCalendarOptions,
  randomScheduleOptions,
  shapesAndKeysIn,
  type Context,
} from "./support/catalog.ts";

const api = readFileSync("etc/api.md", "utf8");
/** 改名の旧名（置き場所ごと。規則の holiday と、スケジュールの旧名 holiday を取り違えないため） */
const oldNames = (places: readonly string[]) =>
  new Set(RENAMED_KEYS.filter((r) => places.includes(r.place)).map((r) => r.from));

/** etc/api.md の型の定義（```ts のブロック） */
function definition(name: string): string {
  const m = new RegExp(`^### ${name} \\(.*\\n\\n\`\`\`ts\\n([\\s\\S]*?)^\`\`\``, "m").exec(api);
  assert.ok(m, `etc/api.md に ${name} がない`);
  return m[1]!;
}
/** 型の定義の never でないキー（その置き場所の改名の旧名は除く） */
const keysOf = (name: string, places: readonly string[] = ["rule"]): string[] => {
  const old = oldNames(places);
  return [...definition(name).matchAll(/readonly (\w+)\??: ([^;]+);/g)]
    .filter((m) => m[2]!.trim() !== "never" && !old.has(m[1]!))
    .map((m) => m[1]!);
};
/** 文字列の合併の値 */
const literalsOf = (text: string): string[] => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

const covered = (key: string, allowed: readonly string[]) =>
  allowed.includes(key) || key in EXCLUDED_KEYS;

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
  // RecurringPattern の合併で形に足されるキー（after-holiday の組み合わせ）
  const added = keysOf("RecurringPattern");
  const common = [...keysOf("EffectivePeriod"), ...keysOf("RecurringRule")];
  for (const shape of SHAPES) {
    const keys = keysOf(shape.pattern);
    for (const key of [...keys, ...common])
      assert.ok(
        covered(key, [...shape.keys, ...COMMON_RULE_KEYS]),
        `${shape.pattern}.${key} を生成器が作らず、除外の理由もない`,
      );
    for (const key of shape.keys)
      assert.ok(
        keys.includes(key) || added.includes(key),
        `目録の ${shape.pattern} の ${key} は公開の型にない（古い目録）`,
      );
  }
});

test("目録: 設定のキーが、生成器が作るか、理由付きで除外されている", () => {
  const p = picker(random(1));
  const ctx: Context = {
    holidays: true,
    kinds: ["regular"],
    keys: [],
    year: 2026,
    newShapes: true,
  };
  const calendarKeys = new Set<string>();
  const scheduleKeys = new Set<string>();
  for (let i = 0; i < 400; i++) {
    for (const k of Object.keys(randomCalendarOptions(p, ctx))) calendarKeys.add(k);
    for (const k of Object.keys(randomScheduleOptions(p, ctx))) scheduleKeys.add(k);
  }
  for (const key of [
    ...keysOf("CalendarOptions", ["calendar", "source"]),
    ...keysOf("HolidaySourceOptions", ["source"]),
  ])
    assert.ok(
      covered(key, [...calendarKeys]),
      `CalendarOptions.${key} を生成器が作らず、除外の理由もない`,
    );
  for (const key of keysOf("ScheduleOptions", ["schedule", "source"]))
    assert.ok(
      covered(key, [...scheduleKeys]),
      `ScheduleOptions.${key} を生成器が作らず、除外の理由もない`,
    );
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

test("生成器の到達性: 決まった試行のうちに、目録のすべての形とキーを作る", () => {
  const p = picker(random(2));
  const ctx: Context = {
    holidays: true,
    kinds: ["regular", "substitute"],
    keys: ["a", "b"],
    year: 2026,
    newShapes: true,
  };
  const shapes = new Set<string>();
  const keys = new Set<string>();
  const policies = new Set<unknown>();
  for (let i = 0; i < 300; i++) {
    const o = randomCalendarOptions(p, ctx);
    const found = shapesAndKeysIn(o);
    for (const s of found.shapes) shapes.add(s);
    for (const k of found.keys) keys.add(k);
    policies.add(o["holidayPolicy"]);
    for (const list of [o["closedRecurringRules"], o["openRecurringRules"]])
      if (Array.isArray(list))
        for (const r of list)
          policies.add((r as { holidayOverlapPolicy?: string }).holidayOverlapPolicy);
  }
  for (const s of SHAPES) assert.ok(shapes.has(s.pattern), `生成器が ${s.pattern} を作らない`);
  for (const s of SHAPES)
    for (const k of [...s.keys, ...COMMON_RULE_KEYS])
      assert.ok(keys.has(k), `生成器が ${s.pattern} の ${k} を作らない`);
  for (const v of [...POLICY_VALUES["HolidayPolicy"]!, ...POLICY_VALUES["HolidayOverlapPolicy"]!])
    assert.ok(policies.has(v), `生成器が選択肢の値 ${v} を作らない`);
});

test("生成器は目録を使う（乱数のテストと result-compare が、別に生成器を持たない）", () => {
  for (const file of [
    "test/properties.test.ts",
    "test/diagnose-properties.test.ts",
    "scripts/result-compare.ts",
  ])
    assert.match(
      readFileSync(file, "utf8"),
      /support\/catalog\.ts/,
      `${file} が目録を使っていない`,
    );
});
