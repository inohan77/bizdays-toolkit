/**
 * 性能の計測（pnpm bench）。依存は使わず、Node.js の標準機能だけで測る。
 *
 * 結果は実行する機械の性能で変わるので、pnpm check には含めない。
 * 内部の処理を変えるときに、変更の前と後を同じ機械で測って比べるために使う。
 * 既定ではソースを直接読み込んで測る（Node.js が型を取り除いて実行するので、処理は dist と同じ）。
 *
 * 引数:
 *   --package <dir>  そのディレクトリのパッケージ（<dir>/dist/index.js と <dir>/dist/jp/index.js）を測る。
 *                    CI で公開済みの前の版と今回の dist を同じ機械で比べるために使う（scripts/bench-compare.ts）
 *   --json <file>    結果（計測名と 1 回あたりのミリ秒）を JSON で書き出す
 */

import "./strict-warnings.ts";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RENAMED_KEYS } from "../src/core/renamed.ts";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const packageDir = argValue("--package");
const jsonFile = argValue("--json");

type Root = typeof import("../src/index.ts");
type Jp = typeof import("../src/jp/index.ts");
const root: Root = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/index.js")).href)
  : await import("../src/index.ts");
const jpModule: Jp = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/jp/index.js")).href)
  : await import("../src/jp/index.ts");
const { jp } = jpModule;

// 前の版の dist が 0.30.0 より前（新しい名前を知らない）なら、設定の新しい名前を旧名に戻して渡す。
// CI の bench は同じ場面を前の版と比べるため（新しい名前のままだと、前の版は知らないキーとして黙って無視する）
const legacy =
  typeof (root.createCalendar({}) as { diffBusinessDays?: unknown }).diffBusinessDays !==
  "function";
const RULE_LISTS = ["closedRecurringRules", "openRecurringRules", "recurringRules"];
function toLegacy(
  value: Record<string, unknown>,
  places: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const renamed = RENAMED_KEYS.find((r) => places.includes(r.place) && r.to === key);
    out[renamed ? renamed.from : key] = RULE_LISTS.includes(key)
      ? (v as Record<string, unknown>[]).map((rule) => toLegacy(rule, ["rule"]))
      : v;
  }
  return out;
}
const createCalendar: Root["createCalendar"] = (options) =>
  root.createCalendar(
    (legacy ? toLegacy(options as never, ["source", "calendar"]) : options) as never,
  );
const createSchedule: Root["createSchedule"] = (options) =>
  root.createSchedule(
    (legacy ? toLegacy(options as never, ["source", "schedule"]) : options) as never,
  );
const diff = (calendar: ReturnType<Root["createCalendar"]>, from: string, to: string): number =>
  legacy ? calendar.businessDaysBetween(from, to) : calendar.diffBusinessDays(from, to);

interface Case {
  readonly name: string;
  readonly run: () => unknown;
}

function addDaysSimple(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 典型的な店舗の設定（日曜定休・祝日休業・年末年始）
const store = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "年末年始" }],
});

// 個別の日付の規則が多い設定（臨時休業日 500 件）
const manyDates = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedDates: Array.from({ length: 500 }, (_, i) => addDaysSimple("2020-01-01", i * 7 + 3)),
});

// 繰り返しの規則と振替を使う設定（博物館: 月曜休館・祝日の場合は次の祝日でない日、第 3 水曜休館、月末棚卸）
const museum = createCalendar({
  holidayProvider: jp,
  holidayPolicy: "open",
  closedRecurringRules: [
    { weekday: 1, holidayOverlapPolicy: "after-holiday" },
    { weekday: 3, nth: 3 },
    { dayOfMonth: -1, holidayOverlapPolicy: "over-holiday" },
  ],
});

const hours = createSchedule({
  holidayProvider: jp,
  weekdayValues: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
  holidayPolicy: { sameAs: 0 },
  annualDates: [{ date: "01-01", value: "closed" }],
});

const cases: Case[] = [
  { name: "isBusinessDay（店舗・1 日）", run: () => store.isBusinessDay("2026-11-23") },
  {
    name: "addBusinessDays（店舗・250 営業日）",
    run: () => store.addBusinessDays("2026-01-05", 250),
  },
  {
    name: "diffBusinessDays（店舗・10 年）",
    run: () => diff(store, "2020-01-01", "2030-01-01"),
  },
  {
    name: "diffBusinessDays（臨時休業日 500 件・1 年）",
    run: () => diff(manyDates, "2026-01-01", "2027-01-01"),
  },
  {
    name: "diffBusinessDays（繰り返し・振替・1 年）",
    run: () => diff(museum, "2026-01-01", "2027-01-01"),
  },
  { name: "valueOn（スケジュール・1 日）", run: () => hours.valueOn("2026-11-03") },
  {
    name: "createCalendar（店舗の設定）",
    run: () => createCalendar({ holidayProvider: jp, closedWeekdays: [0] }),
  },
];

/** 1 回あたりの時間を、合計がおよそ 300 ミリ秒になる回数で測る（最初に温める） */
function measure(run: () => unknown): { perOp: number; ops: number } {
  for (let i = 0; i < 50; i++) run();
  let ops = 1;
  for (;;) {
    const start = performance.now();
    for (let i = 0; i < ops; i++) run();
    const elapsed = performance.now() - start;
    if (elapsed > 300 || ops > 1e7) return { perOp: elapsed / ops, ops };
    ops *= 4;
  }
}

const format = (ms: number): string =>
  ms >= 1
    ? `${ms.toFixed(2)} ms`
    : ms >= 0.001
      ? `${(ms * 1000).toFixed(2)} µs`
      : `${(ms * 1e6).toFixed(0)} ns`;

console.log(`node ${process.version}${packageDir ? ` (${packageDir})` : ""}`);
const results: Record<string, number> = {};
for (const c of cases) {
  const { perOp, ops } = measure(c.run);
  results[c.name] = perOp;
  console.log(`${c.name.padEnd(44)} ${format(perOp).padStart(12)} / 回  (${ops} 回)`);
}
if (jsonFile) writeFileSync(jsonFile, `${JSON.stringify(results, null, 2)}\n`);
