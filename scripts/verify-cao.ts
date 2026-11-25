import "./strict-warnings.ts";
/**
 * Verifies the library's results against the Cabinet Office CSV of national holidays, by date and name (Japan).
 *
 *   pnpm verify:cao                  ... fetch from the Cabinet Office site and verify
 *   pnpm verify:cao --file <path>    ... verify with a local CSV (Shift_JIS)
 *   pnpm verify:cao --write          ... on success, update the test fixture (test/fixtures/cao-dates.txt)
 *   pnpm verify:cao --report <path>  ... write the result as Markdown (the watch workflow uses it as issue body)
 *   pnpm verify:cao --simulate       ... add one fictitious holiday row to the fetched CSV and verify (cannot be
 *                                        combined with --write)
 *
 * The daily watch (.github/workflows/data-watch.yml) runs it in the same start as the other countries'
 * verifications and opens an issue on a difference or a failed fetch.
 * "New years published" (the last year of the CSV is after CONFIRMED_THROUGH) triggers the yearly work of
 * RELEASING.md: update CONFIRMED_THROUGH and DATA_VERSION of src/jp/rules.ts.
 *
 * Verified:
 * - the date of every CSV row is a holiday of the library and the names mean the same (the CSV's generic
 *   "holiday" name stands for substitute holidays, citizens' holidays and special holidays)
 * - the library has no extra holiday missing in the CSV (only in the years of the CSV)
 * - the CSV has no year after CONFIRMED_THROUGH
 * - the dates of the fixture (test/fixtures/cao-dates.txt) equal the dates of the CSV
 *
 * Exit code: 0 = equal, 1 = differences, 2 = failed fetch or parse (the watch is not working)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { holidaysInYear, jp, type JpHoliday } from "../src/jp/index.ts";

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
/**
 * Today's date (Japan time; the "fetched" date of reports and fixtures, on the same basis as the dates of issue
 * comments)
 */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

/** Tries up to 3 times, so that a temporary failure does not make the watch open an issue */
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

/** Whether the name in the CSV and the name in the library mean the same */
function sameName(csvName: string, h: JpHoliday): boolean {
  if (csvName.startsWith("休日")) {
    // Substitute and citizens' holidays have the generic "holiday" name; the special days of 2019 have that name
    // with a note that they are treated as national holidays
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
  const actual = new Map<string, JpHoliday>();
  for (let y = firstYear; y <= lastYear; y++)
    for (const h of holidaysInYear(y)) actual.set(h.date, h);

  // 1. Verification against the library's calculation
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

  // 2. Published years (the equinox days of the next year are published around February every year)
  addSection(
    "New years published in the Cabinet Office CSV",
    lastYear > jp.confirmedThrough!
      ? [`${lastYear} (CONFIRMED_THROUGH is ${jp.confirmedThrough})`]
      : [],
  );

  // 3. Verification against the fixture
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
