// 名前が約束する意味（etc/naming.md の N2）を性質のテストで確かめる。区間の扱い・符号・含むかどうかは型では分からないため。
// 対象は実行時に列挙して決めるので、名前の形に合うメソッド・関数を足せば自動で対象になる（削除予定の旧名は除く）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as root from "../src/index.ts";
import * as provider from "../src/provider/index.ts";
import { jp } from "../src/jp/index.ts";

const SEED = Number(process.env["PROPERTY_SEED"] ?? 20261101);
const RUNS = 150;

/** mulberry32: 種から決まる、再現可能な乱数 */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = random(SEED);
const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
const date = (): string => root.addDays("2024-01-01", int(0, 365 * 4));

/** 削除予定の表（docs/migration.md）にある、型の項目・メソッドの名前 */
const deprecated = new Set(
  [...readFileSync("docs/migration.md", "utf8").matchAll(/`[A-Za-z]+\.([A-Za-z]+)`/g)].map(
    (m) => m[1]!,
  ),
);

const calendar = root.createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-29", to: "01-03" }],
  closedRecurringRules: [{ businessDayOfWeek: -1, weekStart: 1 }, { dayOfMonth: 15 }],
});
type Method = (...args: unknown[]) => unknown;
const methods = Object.entries(calendar).filter(
  (e): e is [string, Method] => typeof e[1] === "function" && !deprecated.has(e[0]),
);
const named = (re: RegExp): [string, Method][] => methods.filter(([name]) => re.test(name));
const isOutOfOrder = (e: Error & { code?: string }) => e.code === "invalid-range";

test("T1 …Between(from, to): 両端を含む区間の中だけを返し、from > to は invalid-range", () => {
  const list = named(/Between$/);
  assert.deepEqual(list.map(([n]) => n).sort(), [
    "businessDatesBetween",
    "daysBetween",
    "holidaysBetween",
  ]);
  for (let run = 0; run < RUNS; run++) {
    const a = date();
    const b = root.addDays(a, int(1, 40));
    for (const [name, f] of list) {
      const dateOfItem = (x: unknown): string =>
        typeof x === "string" ? x : (x as { date: string }).date;
      const one = f(a, a) as unknown[];
      assert.ok(one.length <= 1, `${name}(${a}, ${a})`);
      if (one.length === 1) assert.equal(dateOfItem(one[0]), a, name);
      const items = (f(a, b) as unknown[]).map(dateOfItem);
      assert.ok(
        items.every((d) => d >= a && d <= b),
        `${name}(${a}, ${b})`,
      );
      assert.throws(() => f(b, a), isOutOfOrder, `${name}(${b}, ${a})`);
    }
  }
});

test("T2 diff…(from, to): f(a, a) = 0、f(a, b) = −f(b, a)、f(a, b) + f(b, c) = f(a, c)", () => {
  const list: [string, Method][] = [...named(/^diff/), ["diffDays", root.diffDays as Method]];
  assert.deepEqual(
    list.map(([n]) => n),
    ["diffBusinessDays", "diffDays"],
  );
  for (let run = 0; run < RUNS; run++) {
    const [a, b, c] = [date(), date(), date()];
    for (const [name, f] of list) {
      assert.equal(f(a, a), 0, name);
      assert.equal(f(a, b), -(f(b, a) as number), `${name} ${a} ${b}`);
      assert.equal((f(a, b) as number) + (f(b, c) as number), f(a, c), `${name} ${a} ${b} ${c}`);
    }
  }
});

test("T3 add… と diff… の対: diff(a, add(a, n)) = n", () => {
  for (let run = 0; run < RUNS; run++) {
    const n = int(-30, 30);
    const a = calendar.businessDayOnOrAfter(date());
    assert.equal(calendar.diffBusinessDays(a, calendar.addBusinessDays(a, n)), n, `${a} ${n}`);
    const d = date();
    assert.equal(root.diffDays(d, root.addDays(d, n)), n, `${d} ${n}`);
  }
});

test("T4 next…・previous… は引数より後・前、…OnOrAfter・…OnOrBefore は引数以後・以前", () => {
  const after = named(/^next|OnOrAfter$/);
  const before = named(/^previous|OnOrBefore$/);
  assert.deepEqual(after.map(([n]) => n).sort(), ["businessDayOnOrAfter", "nextBusinessDay"]);
  assert.deepEqual(before.map(([n]) => n).sort(), ["businessDayOnOrBefore", "previousBusinessDay"]);
  for (let run = 0; run < RUNS; run++) {
    const d = date();
    for (const [name, f] of after) {
      const r = f(d) as string;
      assert.ok(name.startsWith("next") ? r > d : r >= d, `${name}(${d}) = ${r}`);
    }
    for (const [name, f] of before) {
      const r = f(d) as string;
      assert.ok(name.startsWith("previous") ? r < d : r <= d, `${name}(${d}) = ${r}`);
    }
  }
});

test("T5 …On(d) は d の日のもの、is… は真偽値", () => {
  const on = named(/On$/);
  const is = named(/^is/);
  assert.deepEqual(on.map(([n]) => n).sort(), ["dayInfoOn", "holidayOn"]);
  const rootIs = Object.entries({ ...root, ...provider } as Record<string, unknown>).filter(
    (e) => typeof e[1] === "function" && /^is[A-Z]/.test(e[0]),
  );
  for (let run = 0; run < RUNS; run++) {
    const d = date();
    for (const [name, f] of on) {
      const r = f(d) as { date?: string } | undefined;
      if (r !== undefined) assert.equal(r.date, d, name);
    }
    for (const [name, f] of is) assert.equal(typeof f(d), "boolean", name);
  }
  assert.equal(typeof root.isValidDate("2026-02-30"), "boolean");
  assert.equal(typeof provider.isLeapYear(2028), "boolean");
  assert.ok(rootIs.length >= 3, rootIs.map(([n]) => n).join());
});
