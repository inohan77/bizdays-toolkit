/**
 * 性能の計測（pnpm bench）。依存は使わず、Node.js の標準機能だけで測る。
 *
 * 結果は実行する機械の性能で変わるので、pnpm check には含めない。
 * 内部の処理を変えるときに、変更の前と後を同じ機械で測って比べるために使う。
 * ソースを直接読み込んで測る（Node.js が型を取り除いて実行するので、処理は dist と同じ）。
 */

import "./strict-warnings.ts";
import { performance } from "node:perf_hooks";
import { createCalendar, createSchedule } from "../src/index.ts";
import { jp } from "../src/jp/index.ts";

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
  holidays: jp,
  closedWeekdays: [0],
  closedAnnual: [{ from: "12-31", to: "01-03", name: "年末年始" }],
});

// 個別の日付の規則が多い設定（臨時休業日 500 件）
const manyDates = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedDates: Array.from({ length: 500 }, (_, i) => addDaysSimple("2020-01-01", i * 7 + 3)),
});

// 繰り返しの規則と振替を使う設定（博物館: 月曜休館・祝日の場合は翌平日、第 3 水曜休館、月末棚卸）
const museum = createCalendar({
  holidays: jp,
  holidayPolicy: "open",
  closedRecurring: [
    { weekday: 1, onHolidayRule: "after-holiday" },
    { weekday: 3, nth: 3 },
    { day: -1, onHolidayRule: "over-holiday" },
  ],
});

const hours = createSchedule({
  holidays: jp,
  weekly: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
  holiday: { sameAs: 0 },
  annual: [{ date: "01-01", value: "closed" }],
});

const cases: Case[] = [
  { name: "isBusinessDay（店舗・1 日）", run: () => store.isBusinessDay("2026-11-23") },
  {
    name: "addBusinessDays（店舗・250 営業日）",
    run: () => store.addBusinessDays("2026-01-05", 250),
  },
  {
    name: "businessDaysBetween（店舗・10 年）",
    run: () => store.businessDaysBetween("2020-01-01", "2030-01-01"),
  },
  {
    name: "businessDaysBetween（臨時休業日 500 件・1 年）",
    run: () => manyDates.businessDaysBetween("2026-01-01", "2027-01-01"),
  },
  {
    name: "businessDaysBetween（繰り返し・振替・1 年）",
    run: () => museum.businessDaysBetween("2026-01-01", "2027-01-01"),
  },
  { name: "valueOn（スケジュール・1 日）", run: () => hours.valueOn("2026-11-03") },
  {
    name: "createCalendar（店舗の設定）",
    run: () => createCalendar({ holidays: jp, closedWeekdays: [0] }),
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

console.log(`node ${process.version}`);
for (const c of cases) {
  const { perOp, ops } = measure(c.run);
  console.log(`${c.name.padEnd(44)} ${format(perOp).padStart(12)} / 回  (${ops} 回)`);
}
