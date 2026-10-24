/**
 * GOV.UK の bank holidays とライブラリの計算結果を、日付と名称で照合する（英国）。
 *
 *   pnpm verify:govuk                    … GOV.UK から取得して照合
 *   pnpm verify:govuk --file <path>      … 手元の JSON（https://www.gov.uk/bank-holidays.json と同じ形）で照合
 *   pnpm verify:govuk --write            … 照合に成功したらテスト用フィクスチャを更新
 *   pnpm verify:govuk --report <path>    … 結果を Markdown で書き出す（監視のワークフローが issue の本文に使う）
 *   pnpm verify:govuk --skip-welsh       … ウェールズ語の名称の照合を飛ばす（翻訳ファイルを取得しない）
 *   pnpm verify:govuk --simulate         … 取得したデータに架空の祝日を 1 件足して照合する（監視のワークフローの差分の経路を確かめる。--write とは併用できない）
 *
 * 照合すること:
 * - GOV.UK に載っている年の日付と名称が、ライブラリの計算結果と一致するか（England・Wales・Scotland・Northern Ireland）
 * - GOV.UK に CONFIRMED_THROUGH より後の年が載っていないか（載ったら src/uk/rules.ts の CONFIRMED_THROUGH を上げる）
 * - フィクスチャ（test/fixtures/govuk-bank-holidays.json）と GOV.UK の内容が同じか
 * - Wales の祝日のウェールズ語の名称が、GOV.UK のウェールズ語版の表記（alphagov/frontend の翻訳ファイル）と一致するか
 *
 * GOV.UK の JSON は古い年が消えていくので、フィクスチャの古い年は --write でも残す（GOV.UK に載っている年だけを置き換える）。
 *
 * 終了コード: 0 = 一致、1 = 差分あり、2 = 取得・解析の失敗（監視が機能していない）
 */

import "./strict-warnings.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Holiday } from "../src/core/types.ts";
import { england, northernIreland, scotland, wales } from "../src/uk/index.ts";

// 定数 confirmedThrough は 0.12.0 で非推奨（提供元の項目を使う。4 つの提供元で同じ値）
const confirmedThrough = england.confirmedThrough!;

const JSON_URL = "https://www.gov.uk/bank-holidays.json";
const LOCALE_URL = "https://raw.githubusercontent.com/alphagov/frontend/main/config/locales";
const FIXTURE = new URL("../test/fixtures/govuk-bank-holidays.json", import.meta.url);
const WELSH_FIXTURE = new URL("../test/fixtures/govuk-bank-holiday-names-cy.json", import.meta.url);

const DIVISIONS = ["england-and-wales", "scotland", "northern-ireland"] as const;
type Division = (typeof DIVISIONS)[number];

interface Event {
  readonly date: string;
  readonly title: string;
  readonly notes: string;
}
interface Fixture {
  source: string;
  years: Record<string, string>;
  divisions: Record<Division, Event[]>;
}
interface WelshFixture {
  source: string;
  names: Record<string, string>;
}

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = option("--file");
const report = option("--report");
const write = args.includes("--write");
const skipWelsh = args.includes("--skip-welsh");
const simulate = args.includes("--simulate");
if (simulate && write) throw new Error("--simulate cannot be combined with --write");
/** 今日の日付（日本時間。報告書・フィクスチャの「取得」の日付。issue のコメントの日付と同じ基準） */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

/** 一時的な失敗で監視が issue を立てないよう、3 回まで試す */
async function fetchText(url: string): Promise<string> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return await res.text();
      last = new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    } catch (e) {
      last = e;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** GOV.UK の JSON を区分ごとの日付順の一覧にする（照合に使わない項目は捨てる） */
function parseGovuk(text: string): Record<Division, Event[]> {
  const data = JSON.parse(text) as Record<string, { events?: unknown }>;
  const out = {} as Record<Division, Event[]>;
  for (const division of DIVISIONS) {
    const events = data[division]?.events;
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error(`No events for ${division} in the GOV.UK data`);
    }
    out[division] = events
      .map((e: { date?: unknown; title?: unknown; notes?: unknown }) => {
        if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
          throw new Error(`Invalid date in ${division}: ${JSON.stringify(e)}`);
        }
        if (typeof e.title !== "string") throw new Error(`Invalid title: ${JSON.stringify(e)}`);
        return { date: e.date, title: e.title, notes: typeof e.notes === "string" ? e.notes : "" };
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return out;
}

/** 翻訳ファイル（YAML）の bank_holidays の節を読む（キー: 値 の 1 行ずつの形だけを扱う） */
function parseLocale(text: string): Map<string, string> {
  const map = new Map<string, string>();
  let section: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const head = /^ {2}([\w-]+):\s*$/.exec(line);
    if (head) {
      section = head[1];
      continue;
    }
    const entry = /^ {4}([\w-]+): (.+)$/.exec(line);
    if (entry && section === "bank_holidays") {
      map.set(entry[1]!, entry[2]!.trim().replace(/^(['"])(.*)\1$/, "$2"));
    }
  }
  if (map.size === 0) throw new Error("No bank_holidays entries found in the locale file");
  return map;
}

const yearOf = (date: string): number => Number(date.slice(0, 4));
const label = (e: { date: string; title?: string; name?: string }): string =>
  `${e.date} ${e.title ?? e.name}`;

const sections: { title: string; lines: string[] }[] = [];
const addSection = (title: string, lines: string[]): void => {
  if (lines.length > 0) sections.push({ title, lines });
};

async function main(): Promise<number> {
  const remote = parseGovuk(file ? readFileSync(file, "utf8") : await fetchText(JSON_URL));
  if (simulate) {
    // 最後の年の 10 月 1 日に、Scotland だけの架空の祝日を足す（ライブラリ・フィクスチャの両方と食い違う）
    const last = remote.scotland.at(-1)!.date.slice(0, 4);
    remote.scotland.push({ date: `${last}-10-01`, title: "Simulated bank holiday", notes: "" });
    remote.scotland.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  const remoteYears = [
    ...new Set(DIVISIONS.flatMap((d) => remote[d].map((e) => yearOf(e.date)))),
  ].sort();
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
  const welshFixture = JSON.parse(readFileSync(WELSH_FIXTURE, "utf8")) as WelshFixture;

  // 1. ライブラリの計算結果との照合
  const providers: [string, Division, (year: number) => readonly Holiday[]][] = [
    ["England", "england-and-wales", (y) => england.holidaysInYear(y)],
    ["Wales", "england-and-wales", (y) => wales.holidaysInYear(y)],
    ["Scotland", "scotland", (y) => scotland.holidaysInYear(y)],
    ["Northern Ireland", "northern-ireland", (y) => northernIreland.holidaysInYear(y)],
  ];
  const mismatches: string[] = [];
  for (const [name, division, holidaysInYear] of providers) {
    for (const year of remoteYears) {
      const expected = remote[division].filter((e) => yearOf(e.date) === year).map(label);
      let actual: string[];
      try {
        actual = holidaysInYear(year).map(label);
      } catch (e) {
        mismatches.push(`${name} ${year}: ${(e as Error).message}`);
        continue;
      }
      for (const x of expected) if (!actual.includes(x)) mismatches.push(`${name} missing ${x}`);
      for (const x of actual) if (!expected.includes(x)) mismatches.push(`${name} extra   ${x}`);
    }
  }
  addSection("Library does not match GOV.UK", mismatches);

  // 2. 公表済みの年
  const newYears = remoteYears.filter((y) => y > confirmedThrough);
  addSection(
    "New years published by GOV.UK",
    newYears.map((y) => `${y} (CONFIRMED_THROUGH is ${confirmedThrough})`),
  );

  // 3. フィクスチャとの照合
  const fixtureDiffs: string[] = [];
  for (const division of DIVISIONS) {
    const inFixture = fixture.divisions[division]
      .filter((e) => remoteYears.includes(yearOf(e.date)))
      .map((e) => JSON.stringify(e));
    const inRemote = remote[division].map((e) => JSON.stringify(e));
    for (const x of inRemote) if (!inFixture.includes(x)) fixtureDiffs.push(`${division} + ${x}`);
    for (const x of inFixture) if (!inRemote.includes(x)) fixtureDiffs.push(`${division} - ${x}`);
  }
  addSection("Fixture differs from GOV.UK (update with --write)", fixtureDiffs);

  // 4. ウェールズ語の名称
  const welshDiffs: string[] = [];
  let welshNames: Record<string, string> | undefined;
  if (!skipWelsh) {
    const en = parseLocale(await fetchText(`${LOCALE_URL}/en.yml`));
    const cy = parseLocale(await fetchText(`${LOCALE_URL}/cy.yml`));
    const keyOf = new Map([...en].map(([k, v]) => [v, k]));
    const titles = [...new Set(fixture.divisions["england-and-wales"].map((e) => e.title))];
    for (const e of remote["england-and-wales"])
      if (!titles.includes(e.title)) titles.push(e.title);
    welshNames = {};
    for (const title of titles.sort()) {
      const key = keyOf.get(title);
      const welsh = key === undefined ? undefined : cy.get(key);
      if (welsh === undefined) {
        welshDiffs.push(`no Welsh name for "${title}" in the locale files`);
        continue;
      }
      welshNames[title] = welsh;
      if (welshFixture.names[title] !== welsh) {
        welshDiffs.push(`fixture "${title}": ${welshFixture.names[title]} -> ${welsh}`);
      }
    }
    for (const year of remoteYears) {
      for (const h of wales.holidaysInYear(year)) {
        const welsh = welshNames[h.name];
        if (welsh !== undefined && h.names?.["cy"] !== welsh) {
          welshDiffs.push(`library ${h.date} ${h.name}: ${h.names?.["cy"]} -> ${welsh}`);
        }
      }
    }
  }
  addSection("Welsh names differ", welshDiffs);

  console.log(
    `GOV.UK: ${remoteYears[0]}-${remoteYears.at(-1)}, ` +
      DIVISIONS.map((d) => `${d} ${remote[d].length}`).join(", "),
  );
  if (report) writeReport(sections.length === 0 ? "OK" : "DIFF");

  if (sections.length > 0) {
    for (const s of sections) console.error(`\n## ${s.title}\n${s.lines.join("\n")}`);
    if (write && mismatches.length === 0 && welshDiffs.every((d) => d.startsWith("fixture"))) {
      writeFixtures(fixture, remote, remoteYears, welshNames);
    } else if (write) {
      console.error("\nNot writing the fixtures: the library does not match GOV.UK");
    }
    return 1;
  }
  console.log("OK: all dates and names match");
  return 0;
}

function writeFixtures(
  fixture: Fixture,
  remote: Record<Division, Event[]>,
  remoteYears: readonly number[],
  welshNames: Record<string, string> | undefined,
): void {
  // 内容が変わった年（新しく載った年を含む）だけ、出典を書き換える（変わっていない年の差分を出さないため）
  const yearKey = (events: readonly Event[], year: number): string =>
    JSON.stringify(events.filter((e) => yearOf(e.date) === year));
  const changedYears = remoteYears.filter((year) =>
    DIVISIONS.some((d) => yearKey(fixture.divisions[d], year) !== yearKey(remote[d], year)),
  );
  for (const division of DIVISIONS) {
    fixture.divisions[division] = [
      ...fixture.divisions[division].filter((e) => !remoteYears.includes(yearOf(e.date))),
      ...remote[division],
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  const source = file ? `local file (${today})` : `www.gov.uk (${today})`;
  for (const year of changedYears) fixture.years[String(year)] = source;
  fixture.years = Object.fromEntries(
    Object.entries(fixture.years).sort(([a], [b]) => Number(a) - Number(b)),
  );
  writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Updated ${fileURLToPath(FIXTURE)}`);
  const welshFixture = JSON.parse(readFileSync(WELSH_FIXTURE, "utf8")) as WelshFixture;
  const sorted = (names: Record<string, string>): string =>
    JSON.stringify(Object.entries(names).sort(([a], [b]) => (a < b ? -1 : 1)));
  if (welshNames && sorted(welshNames) !== sorted(welshFixture.names)) {
    const welsh: WelshFixture = {
      source: `${LOCALE_URL}/cy.yml (${today})`,
      names: Object.fromEntries(Object.entries(welshNames).sort(([a], [b]) => (a < b ? -1 : 1))),
    };
    writeFileSync(WELSH_FIXTURE, `${JSON.stringify(welsh, null, 2)}\n`);
    console.log(`Updated ${fileURLToPath(WELSH_FIXTURE)}`);
  }
}

function writeReport(status: "OK" | "DIFF" | "ERROR", error?: string): void {
  if (!report) return;
  const lines = [
    `Result: **${status}** (checked ${today} with \`pnpm verify:govuk${simulate ? " --simulate" : ""}\`)`,
    "",
  ];
  if (simulate) {
    lines.push(
      "This is a **simulation**: a fictitious holiday was added to the GOV.UK data to test the watch workflow. Close this issue after checking it.",
      "",
    );
  }
  if (error)
    lines.push(
      "The check itself failed, so GOV.UK changes are not being detected.",
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
