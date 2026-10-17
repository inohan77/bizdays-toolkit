/**
 * 内閣府「国民の祝日」CSV とライブラリの計算結果を、日付と名前で照合する。
 *
 *   pnpm verify:cao                  … 内閣府のサイトから取得して照合
 *   pnpm verify:cao --file <path>    … 手元の CSV（Shift_JIS）で照合
 *   pnpm verify:cao --write          … 照合に成功したらテスト用フィクスチャ（test/fixtures/cao-dates.txt）を更新
 *
 * 毎年 2 月の官報公表（翌年の春分・秋分の日）のあとに実行し、差分があれば
 * src/jp/rules.ts の CONFIRMED_THROUGH・DATA_VERSION を更新する。
 */

import "./strict-warnings.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { holidaysInYear, type JapaneseHoliday } from "../src/jp/index.ts";

const CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";
const FIXTURE = new URL("../test/fixtures/cao-dates.txt", import.meta.url);

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const file = fileIndex >= 0 ? args[fileIndex + 1] : undefined;
const write = args.includes("--write");

async function load(): Promise<Uint8Array> {
  if (file) return readFileSync(file);
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Failed to download ${CSV_URL}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

interface Row {
  readonly date: string;
  readonly name: string;
}

function parse(bytes: Uint8Array): Row[] {
  const text = new TextDecoder("shift_jis").decode(bytes);
  const rows: Row[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2}),(.*)$/.exec(line.trim());
    if (!m) continue;
    const date = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
    rows.push({ date, name: m[4]!.trim() });
  }
  if (rows.length === 0) throw new Error("No rows found in the CSV");
  return rows;
}

/** CSV の名前とライブラリの名前が同じものを指しているか */
function sameName(csvName: string, h: JapaneseHoliday): boolean {
  if (csvName.startsWith("休日")) {
    // 振替休日・国民の休日は「休日」、2019 年の特例は「休日（祝日扱い）」
    return h.kind === "substitute" || h.kind === "citizens" || h.kind === "special";
  }
  const base = csvName.replace(/[（(].*[）)]$/, "");
  return h.name === base || h.name.includes(base);
}

const rows = parse(await load());
const firstYear = Number(rows[0]!.date.slice(0, 4));
const lastYear = Number(rows.at(-1)!.date.slice(0, 4));
const expected = new Map(rows.map((r) => [r.date, r.name]));
const actual = new Map<string, JapaneseHoliday>();
for (let y = firstYear; y <= lastYear; y++)
  for (const h of holidaysInYear(y)) actual.set(h.date, h);

const problems: string[] = [];
for (const [date, name] of expected) {
  const h = actual.get(date);
  if (!h) problems.push(`missing  ${date} ${name}`);
  else if (!sameName(name, h)) problems.push(`name     ${date} CSV: ${name} / library: ${h.name}`);
}
for (const [date, h] of actual)
  if (!expected.has(date)) problems.push(`extra    ${date} ${h.name}`);

console.log(`CSV: ${rows.length} rows, ${firstYear}-${lastYear}`);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} difference(s) found`);
  process.exit(1);
}
console.log("OK: all dates and names match");

if (write) {
  const header = [
    `# 内閣府「国民の祝日」CSV（${CSV_URL}）に掲載の日付`,
    `# 範囲: ${firstYear}〜${lastYear} 年 / 取得: ${new Date().toISOString().slice(0, 10)} / 更新: pnpm verify:cao --write`,
  ];
  writeFileSync(FIXTURE, `${[...header, ...rows.map((r) => r.date)].join("\n")}\n`);
  console.log(`Updated ${fileURLToPath(FIXTURE)}`);
}
