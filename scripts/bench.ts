/**
 * 性能の計測（pnpm bench）。依存は使わず、Node.js の標準機能だけで測る。
 *
 * 結果は実行する機械の性能で変わるので、pnpm check には含めない。
 * 内部の処理を変えるときに、変更の前と後を同じ機械で測って比べるために使う。
 * 既定ではソースを直接読み込んで測る（Node.js が型を取り除いて実行するので、処理は dist と同じ）。
 *
 * 引数:
 *   --package <dir>  そのディレクトリのパッケージ（<dir>/dist/index.js と <dir>/dist/jp/index.js）を測る。
 *                    CI で公開済みの前のバージョンと今回の dist を同じ機械で比べるために使う（scripts/bench-compare.ts）
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
type Diagnose = typeof import("../src/diagnose/index.ts");
type Sg = typeof import("../src/sg/index.ts");
const root: Root = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/index.js")).href)
  : await import("../src/index.ts");
const jpModule: Jp = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/jp/index.js")).href)
  : await import("../src/jp/index.ts");
const { jp } = jpModule;
const diagnoseModule: Diagnose = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/diagnose/index.js")).href)
  : await import("../src/diagnose/index.ts");
const { sg }: Sg = packageDir
  ? await import(pathToFileURL(resolve(packageDir, "dist/sg/index.js")).href)
  : await import("../src/sg/index.ts");

// 前のバージョンの dist が 0.30.0 より前（新しい名前を知らない）なら、設定の新しい名前を旧名に戻して渡す。
// CI の bench は同じ場面を前のバージョンと比べるため（新しい名前のままだと、前のバージョンは知らないキーとして黙って無視する）
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
// 臨時休業日 500 件は、種を固定した乱数の順に並べ替えて渡す（始まりの順に書いた日付では、判定のための並べ替えの手間が
// ほとんどかからず、その退行を拾えない。0.32.7）
const closed500 = Array.from({ length: 500 }, (_, i) => addDaysSimple("2020-01-01", i * 7 + 3));
for (let i = closed500.length - 1, seed = 7; i > 0; i--) {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  const j = seed % (i + 1);
  [closed500[i], closed500[j]] = [closed500[j]!, closed500[i]!];
}
const manyDatesOptions = {
  holidayProvider: jp,
  closedWeekdays: [0, 6] as const,
  closedDates: closed500,
};
const manyDates = createCalendar(manyDatesOptions);
// 同じ 500 件を始まりの順に書いた設定と、判定する 20 日（2020〜2023 年に散らす）。始まりの順に書いた日付は、最初の判定でそれを
// 確かめて並べずに引くので、その確かめが外れる退行を拾う（0.32.7）。20 回は、確かめを外した形との差がいちばん大きく出た回数
const sortedDatesOptions = { ...manyDatesOptions, closedDates: [...closed500].sort() };
const probe20 = Array.from({ length: 20 }, (_, i) => addDaysSimple("2020-01-02", i * 59));

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

// 第 n 営業日の規則の基準が、対応年の短い提供元（シンガポール。"throw"）を持つカレンダーのスケジュール。診断の走査が
// 基準の対応年の外にかかり、基準が投げる月を診断が何度も評価する経路（0.32.7 で、投げた月を覚えるようにした）の退行を拾う
const sgBasis = createCalendar({ holidayProvider: sg, closedWeekdays: [0, 6] });

// 10 年分の暦日を、種を固定した乱数の順に並べたもの。1 日だけの判定の計測は同じ日を繰り返すので、直前の 1 組を覚える
// 変換（0.32.7）が毎回当たり、実際の使い方より速く出る。毎回違う日で呼ぶ計測で、その当たり外れに関わる退行を拾う
const shuffledDays = Array.from({ length: 3653 }, (_, i) => addDaysSimple("2020-01-01", i));
for (let i = shuffledDays.length - 1, seed = 1; i > 0; i--) {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  const j = seed % (i + 1);
  [shuffledDays[i], shuffledDays[j]] = [shuffledDays[j]!, shuffledDays[i]!];
}
let nextDay = 0;
const anotherDay = (): string => shuffledDays[nextDay++ % shuffledDays.length]!;

const cases: Case[] = [
  { name: "isBusinessDay（店舗・1 日）", run: () => store.isBusinessDay("2026-11-23") },
  { name: "isBusinessDay（店舗・毎回違う日）", run: () => store.isBusinessDay(anotherDay()) },
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
  { name: "valueOn（スケジュール・毎回違う日）", run: () => hours.valueOn(anotherDay()) },
  {
    name: "createCalendar（店舗の設定）",
    run: () => createCalendar({ holidayProvider: jp, closedWeekdays: [0] }),
  },
  {
    // 個別の日付を始まりの順に並べるのは、順に調べた回数が日付の数の対数の 2 倍を超えてから（0.32.7）。作って 1 回だけ判定する
    // 使い方で、並べる手間がかかる退行を拾う
    name: "createCalendar と 1 回の判定（臨時休業日 500 件）",
    run: () => createCalendar(manyDatesOptions).isBusinessDay("2026-11-24"),
  },
  {
    // 始まりの順に書いた個別の日付を、最初の判定で確かめて並べずに引く経路（0.32.7）。CI の bench-compare が失敗にするのは 2 倍
    // からで、この確かめが外れたときの遅れ（1 割ほど）は Job Summary の表で見る
    name: "createCalendar と 20 回の判定（臨時休業日 500 件・始まりの順）",
    run: () => {
      const calendar = createCalendar(sortedDatesOptions);
      let open = 0;
      for (const date of probe20) if (calendar.isBusinessDay(date)) open++;
      return open;
    },
  },
  {
    // 診断の走査（1 日ごとの日付の変換）と、規則どうしの比較（代表の 28 年間の当てはまり）の退行を拾う。提供元のない設定で、
    // 1 回を 20 ミリ秒ほどに収める（温める 50 回と測る回を合わせて 1〜3 秒ほどで、CI の bench の時間を大きく延ばさない）
    name: "diagnoseCalendar（提供元なし・規則 2 つ）",
    run: () =>
      diagnoseModule.diagnoseCalendar(
        (legacy ? toLegacy : (o: Record<string, unknown>) => o)(
          {
            closedWeekdays: [0, 6],
            closedRecurringRules: [
              { weekday: 3, nth: [2] },
              { weekday: 5, nth: [4] },
            ],
          },
          ["source", "calendar"],
        ) as never,
      ),
  },
  {
    // 0.32.6 で 1 回が 100 ミリ秒ほど、0.32.7 で 20 ミリ秒ほど（実装者の機械）。温める 50 回を合わせても数秒に収まる
    name: "diagnoseSchedule（基準: シンガポールの提供元）",
    run: () =>
      diagnoseModule.diagnoseSchedule(
        (legacy ? toLegacy : (o: Record<string, unknown>) => o)(
          {
            timeZone: sgBasis.timeZone,
            weekdayValues: [0, 1, 1, 1, 1, 1, 0],
            recurringRules: [{ businessDayOfMonth: 1, calendar: sgBasis, value: 2 }],
          },
          ["source", "schedule"],
        ) as never,
      ),
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
