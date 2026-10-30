/**
 * 前の版との祝日データの差分（CI の data-compare ジョブ。decisions.md の 37 番）。
 *
 * 前の版と今回の dist の同梱の提供元を、対応年が重なるすべての年について 1 日ずつ比べる。
 * 前の版にない提供元と、前の版の対応年の外の年は比べない。
 * 失敗にする条件: key が変わった、差分があるのに CHANGELOG の今の版（または [Unreleased]）に「### Data」がない、
 * 前の版の提供元がなくなったか対応年が狭まった。
 *
 * 使い方: node scripts/data-compare.ts --base <dir> [--head .] [--base-label <label>] [--changelog CHANGELOG.md]
 *   --base は前の版を展開したパッケージのディレクトリ（npm pack した tgz の package/）。--head は今回の
 *   リポジトリ（pnpm build 済み）
 * 終了コード: 0 合格、1 失敗、2 使い方・読み込みの誤り。結果は Markdown で標準出力に書く。
 */

import "./strict-warnings.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type BundledHoliday,
  type BundledProvider,
  loadBundledProviders,
} from "./bundled-providers.ts";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const baseDir = argValue("--base");
if (baseDir === undefined) {
  console.error(
    "usage: node scripts/data-compare.ts --base <dir> [--head .] [--base-label <label>] [--changelog CHANGELOG.md]",
  );
  process.exit(2);
}
const headDir = argValue("--head") ?? ".";
const changelogPath = argValue("--changelog") ?? resolve(headDir, "CHANGELOG.md");
const headVersion = (
  JSON.parse(readFileSync(resolve(headDir, "package.json"), "utf8")) as { version: string }
).version;
const baseVersion = (
  JSON.parse(readFileSync(resolve(baseDir, "package.json"), "utf8")) as { version: string }
).version;
const baseLabel = argValue("--base-label") ?? baseVersion;

/** CHANGELOG の [Unreleased] と今の版の節に「### Data」があるか */
function changelogHasData(): { has: boolean; sections: string } {
  const text = readFileSync(changelogPath, "utf8");
  const parts = text.split(/^## \[([^\]]+)\][^\n]*$/m);
  const sections = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) sections.set(parts[i]!, parts[i + 1] ?? "");
  const body = `${sections.get("Unreleased") ?? ""}\n${sections.get(headVersion) ?? ""}`;
  return { has: /^### Data\s*$/m.test(body), sections: `[Unreleased]・[${headVersion}]` };
}

/** 比べる項目を 1 つの値にそろえる（names はキーの順に依らない形にする） */
function fields(h: BundledHoliday): Record<string, string> {
  const names =
    h.names === undefined
      ? "-"
      : JSON.stringify(
          Object.fromEntries(Object.entries(h.names).sort(([a], [b]) => a.localeCompare(b))),
        );
  return {
    name: h.name,
    nameEn: h.nameEn,
    kind: h.kind,
    key: h.key ?? "-",
    confirmed: String(h.confirmed),
    names,
  };
}

const describe = (h: BundledHoliday): string =>
  `${h.name} (${h.kind}${h.key === undefined ? "" : `, ${h.key}`}${h.confirmed ? "" : ", unconfirmed"})`;

interface ProviderResult {
  readonly id: string;
  readonly years: string;
  readonly skipped: string;
  readonly diffs: string[];
  readonly keyChanges: string[];
}

function compareProvider(base: BundledProvider, head: BundledProvider): ProviderResult {
  const from = Math.max(base.supportedYears.from, head.supportedYears.from);
  const to = Math.min(base.supportedYears.to, head.supportedYears.to);
  const diffs: string[] = [];
  const keyChanges: string[] = [];
  for (let year = from; year <= to; year++) {
    const b = new Map(base.holidaysInYear(year).map((h) => [h.date, h]));
    const h = new Map(head.holidaysInYear(year).map((x) => [x.date, x]));
    const dates = [...new Set([...b.keys(), ...h.keys()])].sort();
    for (const date of dates) {
      const before = b.get(date);
      const after = h.get(date);
      if (before === undefined && after !== undefined) {
        diffs.push(`${head.id} ${date}: 追加 ${describe(after)}`);
      } else if (before !== undefined && after === undefined) {
        diffs.push(`${head.id} ${date}: 削除 ${describe(before)}`);
      } else if (before !== undefined && after !== undefined) {
        const fb = fields(before);
        const fa = fields(after);
        const changed = Object.keys(fb).filter((k) => fb[k] !== fa[k]);
        for (const k of changed) diffs.push(`${head.id} ${date}: ${k} ${fb[k]} → ${fa[k]}`);
        if (before.key !== undefined && after.key !== before.key) {
          keyChanges.push(`${head.id} ${date}: key ${before.key} → ${after.key ?? "(なし)"}`);
        }
      }
    }
  }
  const skippedRanges: string[] = [];
  if (head.supportedYears.from < from)
    skippedRanges.push(`${head.supportedYears.from}〜${from - 1}`);
  if (head.supportedYears.to > to) skippedRanges.push(`${to + 1}〜${head.supportedYears.to}`);
  return {
    id: head.id,
    years: from <= to ? `${from}〜${to}` : "なし",
    skipped: skippedRanges.length > 0 ? `${skippedRanges.join("・")}（前の版の対応年の外）` : "",
    diffs,
    keyChanges,
  };
}

let base;
let head;
try {
  base = await loadBundledProviders(baseDir);
  head = await loadBundledProviders(headDir);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const baseById = new Map(base.map((e) => [e.provider.id, e.provider]));
const headIds = new Set(head.map((e) => e.provider.id));
const failures: string[] = [];
const results: ProviderResult[] = [];
const newProviders: string[] = [];

for (const { provider } of head) {
  const before = baseById.get(provider.id);
  if (before === undefined) {
    newProviders.push(provider.id);
    continue;
  }
  if (
    provider.supportedYears.from > before.supportedYears.from ||
    provider.supportedYears.to < before.supportedYears.to
  ) {
    failures.push(
      `${provider.id}: 対応年が狭まった（${before.supportedYears.from}〜${before.supportedYears.to} → ${provider.supportedYears.from}〜${provider.supportedYears.to}）`,
    );
  }
  results.push(compareProvider(before, provider));
}
for (const id of baseById.keys()) {
  if (!headIds.has(id)) failures.push(`${id}: 前の版にある提供元がない`);
}

const allDiffs = results.flatMap((r) => r.diffs);
const allKeyChanges = results.flatMap((r) => r.keyChanges);
if (allKeyChanges.length > 0) {
  failures.push(
    `key が変わった（${allKeyChanges.length} 件）。key は版をまたいで変えない（decisions.md の 25 番）`,
  );
}
const changelog = changelogHasData();
if (allDiffs.length > 0 && !changelog.has) {
  failures.push(
    `祝日データに差分が ${allDiffs.length} 件あるが、CHANGELOG の ${changelog.sections} に「### Data」がない（意図した反映なら Data に書く）`,
  );
}

const out: string[] = [];
out.push(`## 祝日データの差分（${baseLabel} → ${headVersion}）`, "");
out.push("| 提供元 | 比べた年 | 差分 | 比べなかった年 |", "| --- | --- | ---: | --- |");
for (const r of results) out.push(`| ${r.id} | ${r.years} | ${r.diffs.length} | ${r.skipped} |`);
for (const id of newProviders) out.push(`| ${id} | なし | 0 | 前の版にない提供元 |`);
out.push("");
const LIMIT = 200;
if (allDiffs.length > 0) {
  out.push(
    `差分（${allDiffs.length} 件${allDiffs.length > LIMIT ? `。先頭の ${LIMIT} 件` : ""}）:`,
    "",
  );
  out.push("```text", ...allDiffs.slice(0, LIMIT), "```", "");
}
if (allKeyChanges.length > 0) out.push("key の変化:", "", "```text", ...allKeyChanges, "```", "");
if (failures.length > 0) {
  out.push("**失敗**", "", ...failures.map((f) => `- ${f}`));
} else if (allDiffs.length > 0) {
  out.push(`**合格**（差分は CHANGELOG の ${changelog.sections} の Data に記載がある）`);
} else {
  out.push("**合格**（差分なし）");
}
console.log(out.join("\n"));
process.exit(failures.length > 0 ? 1 : 0);
