import "./strict-warnings.ts";
/**
 * data.gouv.fr の「Jours fériés en France」（DINUM）の JSON とライブラリの計算結果を、日付と名称で照合する（フランス）。
 *
 *   pnpm verify:datagouv                   … data.gouv.fr の JSON（etalab.github.io の安定した URL）から取得して照合
 *   pnpm verify:datagouv --file <path>     … 手元の JSON（フィクスチャと同じ形）で照合
 *   pnpm verify:datagouv --write           … 照合に成功したらテスト用フィクスチャを更新
 *   pnpm verify:datagouv --report <path>   … 結果を Markdown で書き出す（監視のワークフローが issue の本文に使う）
 *   pnpm verify:datagouv --simulate        … 取得したデータに架空の祝日を 1 件足して照合する（--write とは併用できない）
 *
 * 取得のしかた: ゾーン（metropole・alsace-moselle）ごとの JSON（{ "YYYY-MM-DD": "名称" }）を読む（認証なし）。
 * JSON は過去 20 年・未来 5 年の窓で、毎年 1 月に 1 年ずつ動く。
 *
 * 照合すること:
 * - JSON に載っている年の日付と名称が、ライブラリの規則から出る結果と一致するか（2 つの祝日が同じ日に当たる年は、JSON と同じく
 *   復活祭から決まる祝日の名称で 1 件）
 * - フィクスチャ（test/fixtures/datagouv-jours-feries.json）と JSON の内容が同じか（窓が動いた年の初めは差分になるので --write で更新する）
 *
 * フランスの祝日は法令で定まり年ごとの告示はないので、「公表済みの年」の節はない。法改正（祝日の新設・廃止）は JSON の差分として現れる。
 *
 * 終了コード: 0 = 一致、1 = 差分あり、2 = 取得・解析の失敗（監視が機能していない）
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { alsaceMoselle, metropole } from "../src/fr/index.ts";
import type { HolidayProvider } from "../src/index.ts";

const JSON_URL = "https://etalab.github.io/jours-feries-france-data/json/";
const FIXTURE = new URL("../test/fixtures/datagouv-jours-feries.json", import.meta.url);
const ZONES: readonly { readonly zone: string; readonly provider: HolidayProvider }[] = [
  { zone: "metropole", provider: metropole },
  { zone: "alsace-moselle", provider: alsaceMoselle },
];

type Zone = Record<string, string>;
interface Fixture {
  source: string;
  license: string;
  retrieved: string;
  zones: Record<string, Zone>;
}

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
async function fetchJson(url: string): Promise<unknown> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return await res.json();
      last = new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    } catch (e) {
      last = e;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

function parseZone(data: unknown, zone: string): Zone {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`Zone ${zone}: the JSON is not an object of { date: name }`);
  }
  const result: Zone = {};
  for (const [date, name] of Object.entries(data as Record<string, unknown>).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof name !== "string" || name === "") {
      throw new Error(`Zone ${zone}: invalid entry ${JSON.stringify([date, name])}`);
    }
    result[date] = name;
  }
  if (Object.keys(result).length === 0) throw new Error(`Zone ${zone}: no holidays in the JSON`);
  return result;
}

const sections: { title: string; lines: string[] }[] = [];
const addSection = (title: string, lines: string[]): void => {
  if (lines.length > 0) sections.push({ title, lines });
};

async function main(): Promise<number> {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
  const remote: Record<string, Zone> = {};
  if (file) {
    for (const { zone } of ZONES)
      remote[zone] = (JSON.parse(readFileSync(file, "utf8")) as Fixture).zones[zone]!;
  } else {
    for (const { zone } of ZONES)
      remote[zone] = parseZone(await fetchJson(`${JSON_URL}${zone}.json`), zone);
  }
  if (simulate) {
    for (const { zone } of ZONES) {
      const last = Object.keys(remote[zone]!).sort().at(-1)!.slice(0, 4);
      remote[zone] = Object.fromEntries(
        Object.entries({ ...remote[zone], [`${last}-10-01`]: "Jour férié simulé" }).sort(),
      );
    }
  }

  // 1. ライブラリの規則との照合（JSON に載っている年だけ）
  const mismatches: string[] = [];
  const summary: string[] = [];
  for (const { zone, provider } of ZONES) {
    const data = remote[zone]!;
    const years = [...new Set(Object.keys(data).map((d) => Number(d.slice(0, 4))))].sort();
    summary.push(`${zone} ${years[0]}-${years.at(-1)} (${Object.keys(data).length})`);
    for (const year of years) {
      const expected = Object.entries(data)
        .filter(([d]) => d.startsWith(`${year}-`))
        .map(([d, n]) => `${d} ${n}`);
      let actual: string[];
      try {
        actual = provider.holidaysInYear(year).map((h) => `${h.date} ${h.name}`);
      } catch (e) {
        mismatches.push(`${zone} ${year}: ${(e as Error).message}`);
        continue;
      }
      for (const x of expected) if (!actual.includes(x)) mismatches.push(`${zone} missing ${x}`);
      for (const x of actual) if (!expected.includes(x)) mismatches.push(`${zone} extra   ${x}`);
    }
  }
  addSection("Library does not match data.gouv.fr", mismatches);

  // 2. フィクスチャとの照合（窓が 1 年動いた年の初めは、古い年が消え新しい年が増える差分になる）
  const fixtureDiffs: string[] = [];
  for (const { zone } of ZONES) {
    const inFixture = fixture.zones[zone] ?? {};
    const inRemote = remote[zone]!;
    for (const [d, n] of Object.entries(inRemote))
      if (inFixture[d] !== n) fixtureDiffs.push(`${zone} + ${d} ${n}`);
    for (const [d, n] of Object.entries(inFixture))
      if (inRemote[d] !== n) fixtureDiffs.push(`${zone} - ${d} ${n}`);
  }
  addSection("Fixture differs from data.gouv.fr (update with --write)", fixtureDiffs);

  console.log(`data.gouv.fr: ${summary.join(", ")}`);
  writeReport(sections.length === 0 ? "OK" : "DIFF");

  if (sections.length > 0) {
    for (const s of sections) console.error(`\n## ${s.title}\n${s.lines.join("\n")}`);
    if (write && mismatches.length === 0) {
      fixture.zones = remote;
      fixture.retrieved = today;
      writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
      console.error(`\nUpdated ${fileURLToPath(FIXTURE)}`);
    } else if (write) {
      console.error("\nNot writing the fixture: the library does not match data.gouv.fr");
    }
    return 1;
  }
  console.log("OK: all dates and names match");
  return 0;
}

function writeReport(status: "OK" | "DIFF" | "ERROR", error?: string): void {
  if (!report) return;
  const lines = [
    `Result: **${status}** (checked ${today} with \`pnpm verify:datagouv${simulate ? " --simulate" : ""}\`)`,
    "",
  ];
  if (simulate) {
    lines.push(
      "This is a **simulation**: a fictitious holiday was added to the data.gouv.fr data to test the watch workflow. Close this issue after checking it.",
      "",
    );
  }
  if (error)
    lines.push(
      "The check itself failed, so data.gouv.fr changes are not being detected.",
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
