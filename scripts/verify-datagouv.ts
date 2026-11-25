import "./strict-warnings.ts";
/**
 * Verifies the library's results against the JSON of "Jours fériés en France" (DINUM) on data.gouv.fr, by date
 * and name (France).
 *
 *   pnpm verify:datagouv                   ... fetch the JSON of data.gouv.fr (the stable URL on etalab.github.io)
 *                                              and verify
 *   pnpm verify:datagouv --file <path>     ... verify with a local JSON (same shape as the fixture)
 *   pnpm verify:datagouv --write           ... on success, update the test fixture
 *   pnpm verify:datagouv --report <path>   ... write the result as Markdown (the watch workflow uses it as issue
 *                                              body)
 *   pnpm verify:datagouv --simulate        ... add one fictitious holiday to the fetched data and verify (cannot
 *                                              be combined with --write)
 *
 * Fetching: reads the JSON of each zone (metropole, alsace-moselle), { "YYYY-MM-DD": "name" } (no
 * authentication). The JSON is a window of 20 years back and 5 years ahead that moves by one year every January.
 *
 * Verified:
 * - the dates and names of the years in the JSON equal the results of the library's rules (in a year in which
 *   two holidays fall on the same day, one entry with the name of the holiday tied to Easter, as in the JSON)
 * - the fixture (test/fixtures/datagouv-jours-feries.json) equals the JSON (at the start of a year, when the
 *   window has moved, there is a difference; update with --write)
 *
 * Holidays of France are set by law without yearly announcements, so there is no "published years" section. A
 * change in the law (a new or abolished holiday) shows as a difference from the JSON.
 *
 * Exit code: 0 = equal, 1 = differences, 2 = failed fetch or parse (the watch is not working)
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
/**
 * Today's date (Japan time; the "fetched" date of reports and fixtures, on the same basis as the dates of issue
 * comments)
 */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

/** Tries up to 3 times, so that a temporary failure does not make the watch open an issue */
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

  // 1. Verification against the library's rules (only the years in the JSON)
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

  // 2. Verification against the fixture (at the start of a year, when the window has moved by one year, old
  // years disappear and new ones appear as differences)
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
