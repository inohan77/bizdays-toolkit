import "./strict-warnings.ts";
/**
 * 内閣府「国民の祝日」CSV とライブラリの計算結果を、日付と名前で照合する（日本）。
 *
 *   pnpm verify:cao                  … 内閣府のサイトから取得して照合
 *   pnpm verify:cao --file <path>    … 手元の CSV（Shift_JIS）で照合
 *   pnpm verify:cao --write          … 照合に成功したらテスト用フィクスチャ（test/fixtures/cao-dates.txt）を更新
 *   pnpm verify:cao --report <path>  … 結果を Markdown で書き出す（監視のワークフローが issue の本文に使う）
 *   pnpm verify:cao --simulate       … 取得した CSV に架空の祝日を 1 行足して照合する（--write とは併用できない）
 *
 * 毎日の監視（.github/workflows/data-watch.yml）がほかの国の照合と同じ起動で実行し、差分・取得の失敗なら issue を立てる。
 * 「New years published」（CSV の最終年が CONFIRMED_THROUGH より後）は、RELEASING.md の毎年の作業の引き金で、
 * src/jp/rules.ts の CONFIRMED_THROUGH・DATA_VERSION を更新する。
 *
 * 照合すること:
 * - CSV のすべての行の日付がライブラリの祝日にあり、名前が同じものを指しているか（「休日」は振替休日・国民の休日・特例の休日）
 * - ライブラリの祝日が CSV に余分にないか（CSV の範囲の年だけ）
 * - CSV に CONFIRMED_THROUGH より後の年が載っていないか
 * - フィクスチャ（test/fixtures/cao-dates.txt）の日付と CSV の日付が同じか
 *
 * 終了コード: 0 = 一致、1 = 差分あり、2 = 取得・解析の失敗（監視が機能していない）
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { holidaysInYear, jp, type JapaneseHoliday } from "../src/jp/index.ts";

const CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";
const FIXTURE = new URL("../test/fixtures/cao-dates.txt", import.meta.url);

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = option("--file");
const report = option("--report");
const write = args.includes("--write");
const simulate = args.includes("--simulate");
if (simulate && write) throw new Error("--simulate cannot be combined with --write");
/** 今日の日付（日本時間。報告書・フィクスチャの「取得」の日付。issue のコメントの日付と同じ基準） */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

/** 一時的な失敗で監視が issue を立てないよう、3 回まで試す */
async function fetchBytes(url: string): Promise<Uint8Array> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      last = new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    } catch (e) {
      last = e;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function load(): Promise<Uint8Array> {
  if (file) return readFileSync(file);
  return fetchBytes(CSV_URL);
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

const sections: { title: string; lines: string[] }[] = [];
const addSection = (title: string, lines: string[]): void => {
  if (lines.length > 0) sections.push({ title, lines });
};

async function main(): Promise<number> {
  let rows = parse(await load());
  if (simulate) {
    const last = rows.at(-1)!.date.slice(0, 4);
    rows = [...rows, { date: `${last}-10-01`, name: "架空の祝日（模擬）" }].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
  }
  const firstYear = Number(rows[0]!.date.slice(0, 4));
  const lastYear = Number(rows.at(-1)!.date.slice(0, 4));
  const expected = new Map(rows.map((r) => [r.date, r.name]));
  const actual = new Map<string, JapaneseHoliday>();
  for (let y = firstYear; y <= lastYear; y++)
    for (const h of holidaysInYear(y)) actual.set(h.date, h);

  // 1. ライブラリの計算との照合
  const mismatches: string[] = [];
  for (const [date, name] of expected) {
    const h = actual.get(date);
    if (!h) mismatches.push(`missing  ${date} ${name}`);
    else if (!sameName(name, h))
      mismatches.push(`name     ${date} CSV: ${name} / library: ${h.name}`);
  }
  for (const [date, h] of actual)
    if (!expected.has(date)) mismatches.push(`extra    ${date} ${h.name}`);
  addSection("Library does not match the Cabinet Office CSV", mismatches);

  // 2. 公表済みの年（翌年の春分・秋分の日は毎年 2 月ごろに公表される）
  addSection(
    "New years published in the Cabinet Office CSV",
    lastYear > jp.confirmedThrough!
      ? [`${lastYear} (CONFIRMED_THROUGH is ${jp.confirmedThrough})`]
      : [],
  );

  // 3. フィクスチャとの照合
  const fixtureDates = readFileSync(FIXTURE, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line));
  const fixtureDiffs: string[] = [];
  const csvDates = rows.map((r) => r.date);
  for (const d of csvDates) if (!fixtureDates.includes(d)) fixtureDiffs.push(`+ ${d}`);
  for (const d of fixtureDates) if (!csvDates.includes(d)) fixtureDiffs.push(`- ${d}`);
  addSection("Fixture differs from the Cabinet Office CSV (update with --write)", fixtureDiffs);

  console.log(`CSV: ${rows.length} rows, ${firstYear}-${lastYear}`);
  writeReport(sections.length === 0 ? "OK" : "DIFF");

  if (sections.length > 0) {
    for (const s of sections) console.error(`\n## ${s.title}\n${s.lines.join("\n")}`);
    if (write && mismatches.length === 0) {
      writeFixture(rows, firstYear, lastYear);
    } else if (write) {
      console.error("\nNot writing the fixture: the library does not match the CSV");
    }
    return 1;
  }
  console.log("OK: all dates and names match");
  if (write) writeFixture(rows, firstYear, lastYear);
  return 0;
}

function writeFixture(rows: Row[], firstYear: number, lastYear: number): void {
  const header = [
    `# 内閣府「国民の祝日」CSV（${CSV_URL}）に掲載の日付`,
    `# 範囲: ${firstYear}〜${lastYear} 年 / 取得: ${today} / 更新: pnpm verify:cao --write`,
  ];
  writeFileSync(FIXTURE, `${[...header, ...rows.map((r) => r.date)].join("\n")}\n`);
  console.log(`Updated ${fileURLToPath(FIXTURE)}`);
}

function writeReport(status: "OK" | "DIFF" | "ERROR", error?: string): void {
  if (!report) return;
  const lines = [
    `Result: **${status}** (checked ${today} with \`pnpm verify:cao${simulate ? " --simulate" : ""}\`)`,
    "",
  ];
  if (simulate) {
    lines.push(
      "This is a **simulation**: a fictitious holiday was added to the Cabinet Office CSV to test the watch workflow. Close this issue after checking it.",
      "",
    );
  }
  if (error)
    lines.push(
      "The check itself failed, so changes to the Cabinet Office CSV are not being detected.",
      "",
      "```",
      error,
      "```",
      "",
    );
  for (const s of sections) lines.push(`### ${s.title}`, "", "```", ...s.lines, "```", "");
  writeFileSync(report, `${lines.join("\n")}\n`);
}

let code: number;
try {
  code = await main();
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  writeReport("ERROR", message);
  code = 2;
}
process.exit(code);
