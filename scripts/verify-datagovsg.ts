import "./strict-warnings.ts";
/**
 * Verifies the library's table against the Singapore Public Holidays (MOM) of data.gov.sg, by date and name
 * (Singapore).
 *
 *   pnpm verify:datagovsg                    ... fetch from data.gov.sg and verify
 *   pnpm verify:datagovsg --file <path>      ... verify with a local JSON (same shape as the fixture)
 *   pnpm verify:datagovsg --write            ... on success, update the test fixture
 *   pnpm verify:datagovsg --report <path>    ... write the result as Markdown (the watch workflow uses it as
 *                                                issue body)
 *   pnpm verify:datagovsg --simulate         ... add one fictitious holiday to the fetched data and verify
 *                                                (cannot be combined with --write)
 *
 * Fetching: gets the IDs of the yearly datasets from the metadata of collection 691 and reads datastore_search
 * of each dataset (no authentication). A dataset spanning several years (consolidated) is split by year and also
 * checked to equal the yearly datasets.
 *
 * Verified:
 * - the dates and names of the years on data.gov.sg equal the results of the library's table and substitution
 *   rule. "(Observed)" of data.gov.sg is read as kind "substitute". Only the known differences are allowed
 *   (knownDifferences of the fixture: the 2022 data, which differs from MOM's revised gazette)
 * - data.gov.sg has no year after CONFIRMED_THROUGH (when it does, add the table to src/sg/rules.ts and raise
 *   SUPPORTED_YEARS and CONFIRMED_THROUGH)
 * - the fixture (test/fixtures/datagovsg-public-holidays.json) equals data.gov.sg
 *
 * Exit code: 0 = equal, 1 = differences, 2 = failed fetch or parse (the watch is not working)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sg } from "../src/sg/index.ts";

const COLLECTION_URL = "https://api-production.data.gov.sg/v2/public/api/collections/691/metadata";
const DATASET_URL = "https://data.gov.sg/api/action/datastore_search?resource_id=";
const FIXTURE = new URL("../test/fixtures/datagovsg-public-holidays.json", import.meta.url);

interface Record_ {
  readonly date: string;
  readonly day: string;
  readonly holiday: string;
}
interface Fixture {
  source: string;
  collection: string;
  retrieved: string;
  years: Record<string, Record_[]>;
  knownDifferences: {
    note: string;
    source: string;
    libraryOnly: { date: string; holiday: string }[];
    dataOnly: { date: string; holiday: string }[];
  };
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

const byDate = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
/**
 * Compares with the variants of the apostrophe (' and ’; data.gov.sg differs by year) aligned to the spelling of
 * MOM's press releases (’). The fixture stores the names as received
 */
const normalizeName = (name: string): string => name.replace(/'/g, "’").trim();

function parseRecords(data: unknown, id: string): Record_[] {
  const result = (data as { success?: unknown; result?: { records?: unknown; total?: unknown } })
    .result;
  if (!Array.isArray(result?.records)) throw new Error(`No records in dataset ${id}`);
  if (typeof result.total === "number" && result.total > result.records.length) {
    throw new Error(
      `Dataset ${id} has ${result.total} records but only ${result.records.length} were returned`,
    );
  }
  return result.records.map((r: { date?: unknown; day?: unknown; holiday?: unknown }) => {
    if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      throw new Error(`Invalid date in dataset ${id}: ${JSON.stringify(r)}`);
    }
    if (typeof r.holiday !== "string" || typeof r.day !== "string") {
      throw new Error(`Invalid record in dataset ${id}: ${JSON.stringify(r)}`);
    }
    return { date: r.date, day: r.day, holiday: r.holiday };
  });
}

/**
 * Collects the yearly lists from data.gov.sg. The yearly datasets and the datasets spanning several years
 * (consolidated) are returned separately
 */
async function fetchRemote(): Promise<{
  years: Record<string, Record_[]>;
  consolidated: Record<string, Record_[]>;
}> {
  const meta = (await fetchJson(COLLECTION_URL)) as {
    data?: { collectionMetadata?: { childDatasets?: unknown } };
  };
  const ids = meta.data?.collectionMetadata?.childDatasets;
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("No datasets in collection 691");
  const years: Record<string, Record_[]> = {};
  const consolidated: Record<string, Record_[]> = {};
  for (const id of ids as string[]) {
    const records = parseRecords(await fetchJson(`${DATASET_URL}${id}&limit=1000`), id);
    const yearsIn = [...new Set(records.map((r) => r.date.slice(0, 4)))];
    const target = yearsIn.length > 1 ? consolidated : years;
    for (const y of yearsIn) {
      if (target[y] !== undefined)
        throw new Error(`Year ${y} appears in two datasets of the same kind`);
      target[y] = records.filter((r) => r.date.startsWith(`${y}-`)).sort(byDate);
    }
  }
  return { years, consolidated };
}

/** Brings the library's results into the form of data.gov.sg (a substitute is "(Observed)") */
const libraryLabels = (year: number): string[] =>
  sg
    .holidaysInYear(year)
    .map((h) => `${h.date} ${h.name}${h.kind === "substitute" ? " (Observed)" : ""}`);

const sections: { title: string; lines: string[] }[] = [];
const addSection = (title: string, lines: string[]): void => {
  if (lines.length > 0) sections.push({ title, lines });
};

async function main(): Promise<number> {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
  let remoteYears: Record<string, Record_[]>;
  let consolidated: Record<string, Record_[]> | undefined;
  if (file) {
    remoteYears = (JSON.parse(readFileSync(file, "utf8")) as Fixture).years;
  } else {
    ({ years: remoteYears, consolidated } = await fetchRemote());
  }
  if (simulate) {
    const last = Object.keys(remoteYears).sort().at(-1)!;
    remoteYears[last] = [
      ...remoteYears[last]!,
      { date: `${last}-10-01`, day: "Simulated", holiday: "Simulated public holiday" },
    ].sort(byDate);
  }
  const yearList = Object.keys(remoteYears).map(Number).sort();
  const known = fixture.knownDifferences;
  const knownLibraryOnly = known.libraryOnly.map((d) => `${d.date} ${d.holiday}`);
  const knownDataOnly = known.dataOnly.map((d) => `${d.date} ${d.holiday}`);

  // 1. Verification against the library's table and substitution rule (only the known differences are allowed)
  const mismatches: string[] = [];
  for (const year of yearList) {
    const expected = remoteYears[String(year)]!.map((r) => `${r.date} ${normalizeName(r.holiday)}`);
    let actual: string[];
    try {
      actual = libraryLabels(year);
    } catch (e) {
      mismatches.push(`${year}: ${(e as Error).message}`);
      continue;
    }
    for (const x of expected)
      if (!actual.includes(x) && !knownDataOnly.includes(x)) mismatches.push(`missing ${x}`);
    for (const x of actual)
      if (!expected.includes(x) && !knownLibraryOnly.includes(x)) mismatches.push(`extra   ${x}`);
  }
  // A known difference that disappeared (data.gov.sg was corrected) is reported too (reduce knownDifferences)
  for (const x of knownDataOnly) {
    const year = Number(x.slice(0, 4));
    if (
      yearList.includes(year) &&
      !remoteYears[String(year)]!.some((r) => `${r.date} ${r.holiday}` === x)
    )
      mismatches.push(`known difference no longer present in data.gov.sg: ${x}`);
  }
  for (const x of knownLibraryOnly) {
    const year = Number(x.slice(0, 4));
    if (
      yearList.includes(year) &&
      remoteYears[String(year)]!.some((r) => `${r.date} ${r.holiday}` === x)
    )
      mismatches.push(`known difference no longer present in data.gov.sg: ${x}`);
  }
  addSection("Library does not match data.gov.sg (beyond the known differences)", mismatches);

  // 2. Published years
  const newYears = yearList.filter((y) => y > sg.confirmedThrough!);
  addSection(
    "New years published on data.gov.sg",
    newYears.map((y) => `${y} (CONFIRMED_THROUGH is ${sg.confirmedThrough})`),
  );

  // 3. The datasets spanning several years (consolidated) equal the yearly datasets
  const consolidatedDiffs: string[] = [];
  if (consolidated) {
    for (const y of Object.keys(consolidated).sort()) {
      const a = JSON.stringify(consolidated[y]);
      const b = JSON.stringify(remoteYears[y] ?? []);
      if (a !== b)
        consolidatedDiffs.push(
          `${y}: the consolidated dataset differs from the dataset for the year`,
        );
    }
  }
  addSection("Consolidated dataset differs from the yearly datasets", consolidatedDiffs);

  // 4. Verification against the fixture
  const fixtureDiffs: string[] = [];
  for (const y of yearList.map(String)) {
    const inFixture = (fixture.years[y] ?? []).map((r) => JSON.stringify(r));
    const inRemote = remoteYears[y]!.map((r) => JSON.stringify(r));
    for (const x of inRemote) if (!inFixture.includes(x)) fixtureDiffs.push(`${y} + ${x}`);
    for (const x of inFixture) if (!inRemote.includes(x)) fixtureDiffs.push(`${y} - ${x}`);
  }
  addSection("Fixture differs from data.gov.sg (update with --write)", fixtureDiffs);

  console.log(
    `data.gov.sg: ${yearList[0]}-${yearList.at(-1)}, ${yearList.map((y) => `${y} ${remoteYears[String(y)]!.length}`).join(", ")}`,
  );
  writeReport(sections.length === 0 ? "OK" : "DIFF");

  if (sections.length > 0) {
    for (const s of sections) console.error(`\n## ${s.title}\n${s.lines.join("\n")}`);
    if (write && mismatches.length === 0 && consolidatedDiffs.length === 0) {
      for (const y of yearList.map(String)) fixture.years[y] = remoteYears[y]!;
      fixture.retrieved = today;
      writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
      console.error(`\nUpdated ${fileURLToPath(FIXTURE)}`);
    } else if (write) {
      console.error("\nNot writing the fixture: the library does not match data.gov.sg");
    }
    return 1;
  }
  console.log("OK: all dates and names match (with the known differences of 2022)");
  return 0;
}

function writeReport(status: "OK" | "DIFF" | "ERROR", error?: string): void {
  if (!report) return;
  const lines = [
    `Result: **${status}** (checked ${today} with \`pnpm verify:datagovsg${simulate ? " --simulate" : ""}\`)`,
    "",
  ];
  if (simulate) {
    lines.push(
      "This is a **simulation**: a fictitious holiday was added to the data.gov.sg data to test the watch workflow. Close this issue after checking it.",
      "",
    );
  }
  if (error)
    lines.push(
      "The check itself failed, so data.gov.sg changes are not being detected.",
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
