/**
 * ビルド後の公開パッケージを検査する（pnpm check から実行）。
 *
 * - 公開されるファイルが dist・README・CHANGELOG・LICENSE・package.json だけであること
 * - exports のすべてのエントリーが存在し、読み込めること
 * - ランタイムの依存（dependencies）がないこと
 * - CHANGELOG.md の版の節とリンク定義がそろっていること（checkChangelog）
 * - 英語と日本語のドキュメントの対（README・guide・providers）の構成がそろい、見出しへのリンクが実在すること（checkDocPair・checkDocAnchors）
 * - ライブラリのソース（src）が Node.js 固有の機能を使っていないこと（checkPortableSource。decisions.md の 26 番）
 */

import "./strict-warnings.ts";
import { execFileSync, execSync } from "node:child_process";
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

/**
 * 英語と日本語のドキュメントの対（README.md と docs/README.ja.md、docs/guide.md と docs/guide.ja.md、
 * docs/providers.md と docs/providers.ja.md）の構成を比べる（decisions.md の 22・45 番）。
 * 日本語版をルートに置かないのは、npm がルートの README* を files の指定にかかわらず必ず含めるため。
 *
 * - 見出しの数が段ごとに一致し、コードブロックの数が一致すること（節や例の足し忘れを見つける。文章の中身は比べない）
 * - 互いへの切り替えのリンクがあること。README.md からのリンクは、npm のページからも辿れるよう GitHub の絶対 URL
 * - docs のファイルへのリンクの見出しのアンカー（#…）が、そのファイルの見出しに実在すること
 */
const DOC_PAIRS: readonly (readonly [string, string])[] = [
  ["README.md", "docs/README.ja.md"],
  ["docs/guide.md", "docs/guide.ja.md"],
  ["docs/providers.md", "docs/providers.ja.md"],
];

/** GitHub が見出しに付けるアンカー（英数字・空白・ハイフン以外を除き、小文字にして空白をハイフンに） */
const anchorOf = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

function checkDocPair(enPath: string, jaPath: string): string[] {
  const problems: string[] = [];
  const en = readFileSync(enPath, "utf8");
  const ja = readFileSync(jaPath, "utf8");
  const base = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
  const shape = (text: string) => {
    const withoutCode = text.replace(/^```[\s\S]*?^```/gm, "");
    const levels = [1, 2, 3, 4, 5, 6].map(
      (n) => [...withoutCode.matchAll(new RegExp(`^#{${n}} `, "gm"))].length,
    );
    const fences = [...text.matchAll(/^```/gm)].length;
    return { levels, blocks: fences / 2, oddFences: fences % 2 !== 0 };
  };
  const a = shape(en);
  const b = shape(ja);
  for (const [name, s] of [
    [enPath, a],
    [jaPath, b],
  ] as const) {
    if (s.oddFences) problems.push(`${name}: unbalanced code fences`);
  }
  a.levels.forEach((count, i) => {
    if (count !== b.levels[i]) {
      problems.push(
        `headings differ at level ${i + 1}: ${enPath} ${count}, ${jaPath} ${b.levels[i]}`,
      );
    }
  });
  if (a.blocks !== b.blocks) {
    problems.push(`code blocks differ: ${enPath} ${a.blocks}, ${jaPath} ${b.blocks}`);
  }
  const jaName = jaPath.replace(/^docs\//, "");
  const enName = enPath.replace(/^docs\//, "");
  if (enPath === "README.md") {
    if (!en.includes(`${base}/blob/main/${jaPath}`)) {
      problems.push(`${enPath} must link to ${base}/blob/main/${jaPath}`);
    }
    if (!ja.includes("](../README.md)") && !ja.includes('href="../README.md"')) {
      problems.push(`${jaPath} must link to ../README.md`);
    }
  } else {
    if (!en.includes(`./${jaName}`)) problems.push(`${enPath} must link to ./${jaName}`);
    if (!ja.includes(`./${enName}`)) problems.push(`${jaPath} must link to ./${enName}`);
  }
  return problems;
}

/** ドキュメントの中の docs/*.md へのリンクのアンカーが、そのファイルの見出しに実在するか */
function checkDocAnchors(): string[] {
  const problems: string[] = [];
  const headings = new Map<string, Set<string>>();
  const docFiles = DOC_PAIRS.flat();
  for (const file of docFiles) {
    const text = readFileSync(file, "utf8").replace(/^```[\s\S]*?^```/gm, "");
    headings.set(file, new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map((m) => anchorOf(m[1]!))));
  }
  for (const file of docFiles) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\]\(([^)\s]+?)#([^)\s]+)\)/g)) {
      const target = m[1]!;
      const name = target.replace(/^.*\/docs\//, "docs/").replace(/^\.\//, "docs/");
      const set =
        headings.get(name) ??
        (target.endsWith("README.md") ? headings.get("README.md") : undefined);
      if (!set) continue; // このリポジトリのドキュメント以外へのリンク
      const anchor = decodeURIComponent(m[2]!);
      if (!set.has(anchor)) problems.push(`${file}: link to ${target}#${m[2]} has no such heading`);
    }
  }
  return problems;
}

/**
 * ライブラリのソースが Node.js 固有の機能（node: のモジュール・require・process・Buffer・__dirname など）を使っていないことを確かめる。
 * ブラウザーや Cloudflare Workers でも動くことの前提で、実際の動作は CI の browsers・safari・workerd ジョブで確かめる
 */
function checkPortableSource(dir: string): string[] {
  const problems: string[] = [];
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((name) => {
      const path = join(d, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const forbidden: [RegExp, string][] = [
    [/from\s+["']node:/, "a node: module"],
    [/\brequire\s*\(/, "require()"],
    [/\bprocess\s*\./, "process"],
    [/\bBuffer\b/, "Buffer"],
    [/\b__(dirname|filename)\b/, "__dirname / __filename"],
    [/\bglobal\s*\./, "global (use globalThis)"],
  ];
  for (const file of walk(dir).filter((f) => f.endsWith(".ts"))) {
    // コメントの中の言及は数えない
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const [pattern, label] of forbidden) {
      if (pattern.test(code)) problems.push(`${file.replaceAll("\\", "/")}: uses ${label}`);
    }
  }
  return problems;
}
errors.push(...checkPortableSource("src"));

if (existsSync("README.ja.md"))
  errors.push("README.ja.md must not be at the root (npm always publishes root README* files)");
for (const [en, ja] of DOC_PAIRS) {
  if (!existsSync(en) || !existsSync(ja)) errors.push(`${en} or ${ja} not found`);
  else errors.push(...checkDocPair(en, ja));
}
errors.push(...checkDocAnchors());

// 公開されるファイルは、npm が実際に詰めるもの（npm pack --dry-run）で確かめる。
// files の指定から推定すると、npm が指定にかかわらず含めるファイル（ルートの README* など）を見落とすため
for (const entry of pkg.files) {
  if (!existsSync(entry)) errors.push(`"files" entry not found: ${entry}`);
}
// Windows の npm は npm.cmd で、シェルなしでは起動できない（Node.js が .cmd の直接の実行を拒む）。
// シェルに引数の配列を渡すと DEP0190 の警告が出るため、Windows では固定のコマンド文字列で実行する
const npmPack = ["pack", "--dry-run", "--json", "--ignore-scripts"];
const packed = JSON.parse(
  process.platform === "win32"
    ? execSync(`npm ${npmPack.join(" ")}`, { encoding: "utf8" })
    : execFileSync("npm", npmPack, { encoding: "utf8" }),
) as unknown;
// npm 10 は配列、npm 12 はパッケージ名をキーにしたオブジェクトで返す（どちらも読む）
const packEntry = (
  Array.isArray(packed) ? packed[0] : Object.values(packed as Record<string, unknown>)[0]
) as { files?: { path: string }[] } | undefined;
if (!Array.isArray(packEntry?.files)) {
  throw new Error(
    `Unexpected output of npm pack --dry-run --json: ${JSON.stringify(packed).slice(0, 200)}`,
  );
}
const files = packEntry.files.map((f) => f.path.replaceAll("\\", "/")).sort();
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
