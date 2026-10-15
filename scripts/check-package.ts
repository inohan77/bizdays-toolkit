/**
 * ビルド後の公開パッケージを検査する（pnpm check から実行）。
 *
 * - 公開されるファイルが dist・README・CHANGELOG・LICENSE・package.json だけであること
 * - exports のすべてのエントリーが存在し、読み込めること
 * - ランタイムの依存（dependencies）がないこと
 * - CHANGELOG.md の版の節とリンク定義がそろっていること（checkChangelog）
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface Pkg {
  name: string;
  version: string;
  repository: { url: string };
  files: string[];
  dependencies?: Record<string, string>;
  exports: Record<string, string | { types: string; default: string }>;
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Pkg;
const errors: string[] = [];

/** "1.2.3" を比べる（a が新しければ正）。プレリリースの "-rc.1" などは数えない */
function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).slice(0, 3).map(Number);
  const pb = b.split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
}

/** "YYYY-MM-DD" が実在する日付か（2026-02-30 などを除く） */
function isCalendarDate(date: string): boolean {
  const time = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === date;
}

/**
 * CHANGELOG.md の版の節とリンク定義を確かめる。
 *
 * - 先頭が [Unreleased] の節で、その次の節が package.json の版であること
 * - 版の節が新しい順に並び、日付が "YYYY-MM-DD" で新しい順（同じ日は可）であること。
 *   日付が決まっていない現在の版だけは "YYYY-MM-DD" のままでもよい（タグの前に当日の日付にする。
 *   リリースのワークフローが日付の範囲を確かめ、YYYY-MM-DD のままなら止まる）
 * - リンク定義が節とちょうど対応すること（[Unreleased] は最新の版から HEAD、各版は 1 つ前の版との比較、
 *   最初の版はタグのページ）。足りない・余分・URL の誤りをすべて報告する
 */
function checkChangelog(text: string): string[] {
  const problems: string[] = [];
  const base = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
  const headings = [...text.matchAll(/^## \[([^\]]+)\](.*)$/gm)].map((m) => ({
    name: m[1]!,
    rest: m[2]!,
  }));
  if (headings[0]?.name !== "Unreleased") {
    problems.push('CHANGELOG.md must start with a "## [Unreleased]" section');
  }
  const versions = headings.filter((h) => h.name !== "Unreleased");
  if (versions[0]?.name !== pkg.version) {
    problems.push(
      `CHANGELOG.md: the latest section is ${versions[0]?.name ?? "missing"}; expected ${pkg.version} (package.json)`,
    );
  }
  let previousDate: string | undefined;
  versions.forEach(({ name, rest }, i) => {
    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(name)) {
      problems.push(`CHANGELOG.md: invalid version in heading "## [${name}]"`);
      return;
    }
    const older = versions[i + 1];
    if (older && compareVersions(name, older.name) <= 0) {
      problems.push(`CHANGELOG.md: ${name} must be newer than the next section ${older.name}`);
    }
    const date = / - (\d{4}-\d{2}-\d{2}|YYYY-MM-DD)$/.exec(rest)?.[1];
    if (date === undefined) {
      problems.push(`CHANGELOG.md: heading of ${name} must end with " - YYYY-MM-DD"`);
    } else if (date === "YYYY-MM-DD") {
      if (i !== 0) problems.push(`CHANGELOG.md: the date of ${name} is not filled in`);
    } else if (!isCalendarDate(date)) {
      problems.push(`CHANGELOG.md: invalid date ${date} for ${name}`);
    } else {
      if (previousDate !== undefined && date > previousDate) {
        problems.push(
          `CHANGELOG.md: the date of ${name} (${date}) is after a newer version (${previousDate})`,
        );
      }
      previousDate = date;
    }
  });

  const expected = new Map<string, string>();
  if (versions.length > 0) {
    expected.set("Unreleased", `${base}/compare/v${versions[0]!.name}...HEAD`);
  }
  versions.forEach(({ name }, i) => {
    const older = versions[i + 1];
    expected.set(
      name,
      older ? `${base}/compare/v${older.name}...v${name}` : `${base}/releases/tag/v${name}`,
    );
  });
  const actual = new Map<string, string>();
  for (const m of text.matchAll(/^\[([^\]]+)\]:\s*(\S+)\s*$/gm)) {
    if (actual.has(m[1]!)) problems.push(`CHANGELOG.md: duplicate link reference [${m[1]}]`);
    actual.set(m[1]!, m[2]!);
  }
  for (const [name, url] of expected) {
    const found = actual.get(name);
    if (found === undefined)
      problems.push(`CHANGELOG.md: missing link reference [${name}]: ${url}`);
    else if (found !== url)
      problems.push(`CHANGELOG.md: [${name}] links to ${found}; expected ${url}`);
  }
  for (const name of actual.keys()) {
    if (!expected.has(name)) problems.push(`CHANGELOG.md: link reference [${name}] has no section`);
  }
  return problems;
}

errors.push(...checkChangelog(readFileSync("CHANGELOG.md", "utf8")));

if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
  errors.push(`dependencies must be empty: ${Object.keys(pkg.dependencies).join(", ")}`);
}

// 公開されるファイルを package.json の files から数える（npm を起動しないので OS に依存しない）。
// npm が実際に含めるファイルは、CI のログ（npm pack --dry-run）でも確認できる
function walk(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => walk(join(path, name)));
}
const published = new Set<string>(["package.json"]);
for (const entry of pkg.files) {
  if (!existsSync(entry)) {
    errors.push(`"files" entry not found: ${entry}`);
    continue;
  }
  for (const file of walk(entry)) published.add(file.replaceAll("\\", "/"));
}
const files = [...published].sort();
const allowed = /^(dist\/.+\.(js|d\.ts)|README\.md|CHANGELOG\.md|LICENSE|package\.json)$/;
for (const f of files) if (!allowed.test(f)) errors.push(`unexpected file in package: ${f}`);

for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (typeof target === "string") continue;
  for (const file of [target.types, target.default]) {
    if (!existsSync(file)) errors.push(`${subpath}: missing ${file}`);
  }
  if (existsSync(target.default)) {
    const mod = (await import(pathToFileURL(target.default).href)) as Record<string, unknown>;
    if (Object.keys(mod).length === 0) errors.push(`${subpath}: no exports`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK: ${pkg.name}@${pkg.version} (${files.length} files)`);
console.log(files.map((f) => `  ${f}`).join("\n"));
