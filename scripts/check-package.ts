/**
 * ビルド後の公開パッケージを検査する（pnpm check から実行）。
 *
 * - 公開されるファイルが dist・README・CHANGELOG・LICENSE・package.json だけであること
 * - exports のすべてのエントリーが存在し、読み込めること
 * - ランタイムの依存（dependencies）がないこと
 * - CHANGELOG.md の版の節とリンク定義がそろっていること（checkChangelog）
 * - 英語と日本語のドキュメントの対（README・guide・providers）の構成がそろい、見出しへのリンクが実在すること（checkDocPair・checkDocAnchors）
 * - ライブラリのソース（src）が Node.js 固有の機能を使っていないこと（checkPortableSource。decisions.md の 26 番）
 * - ドキュメントの数値・一覧（対応年・タイムゾーン・confirmedThrough・key の表・コードの一覧・サイズを測った版）が
 *   dist とソースの型に一致し、英日の対で節ごとの数値がそろうこと（checkDocFacts・checkPairNumbers。decisions.md の 51 番）
 */

import "./strict-warnings.ts";
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type BundledEntry, loadBundledProviders } from "./bundled-providers.ts";

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

/**
 * 出典の記録（docs/sources/*.md）は、README.md と docs/README.ja.md の両方からリンクされていること。
 * 「出典の食い違いまで記録する」という README の説明の裏づけなので、記録を足したら README に足す（decisions.md の 49 番）
 */
function checkSourceRecordsLinked(): string[] {
  const problems: string[] = [];
  if (!existsSync("docs/sources")) return problems;
  const en = readFileSync("README.md", "utf8");
  const ja = readFileSync("docs/README.ja.md", "utf8");
  for (const name of readdirSync("docs/sources")
    .filter((f) => f.endsWith(".md"))
    .sort()) {
    if (!en.includes(`docs/sources/${name}`))
      problems.push(`README.md must link to docs/sources/${name}`);
    if (!ja.includes(`sources/${name}`))
      problems.push(`docs/README.ja.md must link to docs/sources/${name}`);
  }
  return problems;
}
errors.push(...checkSourceRecordsLinked());

/** テスト用フィクスチャの record（出典の記録の節へのパス#アンカー）が実在すること */
function checkFixtureRecords(): string[] {
  const problems: string[] = [];
  for (const file of readdirSync("test/fixtures").filter((f) => f.endsWith(".json"))) {
    const text = readFileSync(`test/fixtures/${file}`, "utf8");
    for (const m of text.matchAll(/"record": "(docs\/sources\/[^"#]+)#([^"]+)"/g)) {
      const [, path, anchor] = m;
      if (!existsSync(path!)) {
        problems.push(`test/fixtures/${file}: record ${path} not found`);
        continue;
      }
      const headings = new Set(
        [...readFileSync(path!, "utf8").matchAll(/^#{1,6} (.+)$/gm)].map((h) => anchorOf(h[1]!)),
      );
      if (!headings.has(anchor!))
        problems.push(`test/fixtures/${file}: record ${path}#${anchor} has no such heading`);
    }
  }
  return problems;
}
errors.push(...checkFixtureRecords());

// ---------------------------------------------------------------------------------------------
// ドキュメントの数値・一覧を、ビルド済みの dist とソースの型と照合する（decisions.md の 51 番）。
// コード例の実行（27 番）は結果のコメントだけを、英日の対の検査（22・45 番）は構成だけを比べるので、
// 文章の中の数値は、英日が同じ誤りを含めば通っていた（0.21.0 でガイドのフランスの対応年が英日とも 1974 になった）。
// ---------------------------------------------------------------------------------------------

/** 国のサブパスごとの国名（英語・日本語）。文の中の「for Japan」「日本は」から提供元を決めるのに使う。国を足したらここに足す */
const COUNTRY_NAMES: Readonly<Record<string, { en: readonly string[]; ja: string }>> = {
  "./jp": { en: ["Japan", "Japanese"], ja: "日本" },
  "./uk": { en: ["the UK", "UK"], ja: "英国" },
  "./fr": { en: ["France", "French"], ja: "フランス" },
  "./sg": { en: ["Singapore"], ja: "シンガポール" },
};

interface SubpathFacts {
  readonly from: number;
  readonly to: number;
  readonly timeZones: ReadonlySet<string>;
  readonly confirmedThrough: ReadonlySet<number | undefined>;
  readonly exportNames: readonly string[];
  readonly keys: ReadonlySet<string>;
}

async function subpathFacts(): Promise<Map<string, SubpathFacts>> {
  const map = new Map<string, SubpathFacts>();
  const groups = new Map<string, BundledEntry[]>();
  for (const e of await loadBundledProviders("."))
    groups.set(e.subpath, [...(groups.get(e.subpath) ?? []), e]);
  for (const [subpath, entries] of groups) {
    const keys = new Set<string>();
    for (const { provider } of entries) {
      for (let y = provider.supportedYears.from; y <= provider.supportedYears.to; y++) {
        for (const h of provider.holidaysInYear(y)) if (h.key !== undefined) keys.add(h.key);
      }
    }
    const years = new Set(
      entries.map((e) => `${e.provider.supportedYears.from}-${e.provider.supportedYears.to}`),
    );
    if (years.size !== 1)
      errors.push(`${subpath}: providers have different supportedYears (${[...years].join(", ")})`);
    map.set(subpath, {
      from: entries[0]!.provider.supportedYears.from,
      to: entries[0]!.provider.supportedYears.to,
      timeZones: new Set(entries.map((e) => e.provider.timeZone)),
      confirmedThrough: new Set(entries.map((e) => e.provider.confirmedThrough)),
      exportNames: entries.map((e) => e.exportName),
      keys,
    });
  }
  return map;
}

/** 見出し（# 〜 ###）で区切った節。その節のコード例が import する国のサブパスが 1 つなら、その国の節とみなす */
function sectionsOf(
  text: string,
): { heading: string; body: string; subpath: string | undefined }[] {
  const parts = text.split(/^(#{1,3} .*)$/m);
  const out: { heading: string; body: string; subpath: string | undefined }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i] ?? "";
    const imported = new Set(
      [...body.matchAll(/from "bizdays-toolkit\/([a-z]+)"/g)].map((m) => `./${m[1]!}`),
    );
    const countries = [...imported].filter((sp) => sp in COUNTRY_NAMES);
    out.push({
      heading: i === 0 ? "" : (parts[i - 1] ?? ""),
      body,
      subpath: countries.length === 1 ? countries[0] : undefined,
    });
  }
  return out;
}

/** ソースの型 `export type <name> = | "a" | "b" …;` の文字列リテラルを集める（別の型を含む場合はその値を含めない） */
function literalsOf(file: string, typeName: string): string[] {
  const text = readFileSync(file, "utf8");
  const m = new RegExp(`export type ${typeName} =([\\s\\S]*?);`).exec(text);
  if (!m) {
    errors.push(`${file}: type ${typeName} not found`);
    return [];
  }
  return [...m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/"([a-z-]+)"/g)].map((x) => x[1]!);
}

async function checkDocFacts(): Promise<string[]> {
  const problems: string[] = [];
  const facts = await subpathFacts();
  const range = (f: SubpathFacts): string => `${f.from}–${f.to}`;
  for (const subpath of facts.keys()) {
    if (!(subpath in COUNTRY_NAMES))
      problems.push(`scripts/check-package.ts: add ${subpath} to COUNTRY_NAMES`);
  }
  const subpathOfName = (name: string): string | undefined =>
    Object.entries(COUNTRY_NAMES).find(([, n]) => n.en.includes(name) || n.ja === name)?.[0];
  const checkRange = (
    file: string,
    subpath: string | undefined,
    from: string,
    to: string,
    where: string,
  ): void => {
    const f = subpath === undefined ? undefined : facts.get(subpath);
    if (!f) return;
    if (Number(from) !== f.from || Number(to) !== f.to) {
      problems.push(`${file}: ${where} says ${from}–${to}, but ${subpath} supports ${range(f)}`);
    }
  };

  // README の提供元の表: サブパスの行の対応年とタイムゾーン
  for (const file of ["README.md", "docs/README.ja.md"]) {
    const rows = new Set<string>();
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const sp = /^\|.*`bizdays-toolkit\/([a-z]+)`/.exec(line)?.[1];
      if (sp === undefined || !line.startsWith("|")) continue;
      const subpath = `./${sp}`;
      const f = facts.get(subpath);
      if (!f) continue;
      rows.add(subpath);
      const cells = line.split("|").map((c) => c.trim());
      const yearsCell = cells.find((c) => /^\d{4}[–〜]\d{4}$/.test(c));
      if (yearsCell === undefined)
        problems.push(`${file}: the provider table row for ${subpath} has no supported years`);
      else {
        const [from, to] = yearsCell.split(/[–〜]/);
        checkRange(file, subpath, from!, to!, `the provider table (${subpath})`);
      }
      const zone = /`([A-Z][A-Za-z_]+\/[A-Za-z_]+)`/.exec(line)?.[1];
      if (zone !== undefined && !f.timeZones.has(zone)) {
        problems.push(
          `${file}: the provider table says ${zone} for ${subpath}, but it is ${[...f.timeZones].join(", ")}`,
        );
      }
    }
    for (const subpath of facts.keys()) {
      if (!rows.has(subpath))
        problems.push(`${file}: the provider table has no row for ${subpath}`);
    }
  }

  // ガイド: 国の節の対応年・confirmedThrough、国名を伴う対応年（「Outside the supported years」など）
  for (const [file, lang] of [
    ["docs/guide.md", "en"],
    ["docs/guide.ja.md", "ja"],
  ] as const) {
    const text = readFileSync(file, "utf8");
    const supportedPattern =
      lang === "en"
        ? /Supported years are (?:[^.(\n]*\(currently )?(\d{4})–(\d{4})/g
        : /対応年は(?:[^。（\n]*（現在は)? ?(\d{4})〜(\d{4}) 年/g;
    const seenSections = new Set<string>();
    for (const sec of sectionsOf(text)) {
      if (sec.subpath === undefined) continue;
      const f = facts.get(sec.subpath)!;
      for (const m of sec.body.matchAll(supportedPattern)) {
        seenSections.add(sec.subpath);
        checkRange(file, sec.subpath, m[1]!, m[2]!, `"${sec.heading.replace(/^#+ /, "")}"`);
      }
      for (const m of sec.body.matchAll(/`confirmedThrough`[^.。\n]{0,25}?(\d{4})/g)) {
        if (!f.confirmedThrough.has(Number(m[1]))) {
          problems.push(
            `${file}: "${sec.heading.replace(/^#+ /, "")}" says confirmedThrough ${m[1]}, but it is ${[...f.confirmedThrough].join(", ")}`,
          );
        }
      }
    }
    // 国の節の対応年の文は、日本以外の国について必須（日本は README の表と「対応年の外」の節で示す）
    for (const subpath of facts.keys()) {
      if (subpath !== "./jp" && !seenSections.has(subpath)) {
        problems.push(
          `${file}: no "${lang === "en" ? "Supported years are" : "対応年は"} …" sentence in the section for ${subpath}`,
        );
      }
    }
    const en = (names: readonly string[]): string =>
      names.map((n) => n.replace(" ", "\\s")).join("|");
    const named =
      lang === "en"
        ? [
            new RegExp(
              `(\\d{4})–(\\d{4}) for (${Object.values(COUNTRY_NAMES)
                .flatMap((n) => n.en.map((x) => en([x])))
                .join("|")})\\b`,
              "g",
            ),
            new RegExp(
              `\\b(${Object.values(COUNTRY_NAMES)
                .flatMap((n) => n.en.map((x) => en([x])))
                .join("|")}) holidays \\((\\d{4})–(\\d{4})\\)`,
              "g",
            ),
          ]
        : [
            new RegExp(
              `(${Object.values(COUNTRY_NAMES)
                .map((n) => n.ja)
                .join("|")})は (\\d{4})〜(\\d{4}) 年`,
              "g",
            ),
            new RegExp(
              `(${Object.values(COUNTRY_NAMES)
                .map((n) => n.ja)
                .join("|")})の祝日の対応年（(\\d{4})〜(\\d{4}) 年）`,
              "g",
            ),
          ];
    const mentioned = new Set<string>();
    named.forEach((pattern, i) => {
      for (const m of text.matchAll(pattern)) {
        const [name, from, to] =
          lang === "en" && i === 0 ? [m[3]!, m[1]!, m[2]!] : [m[1]!, m[2]!, m[3]!];
        const subpath = subpathOfName(name.replace(/\s+/g, " "));
        if (subpath !== undefined) mentioned.add(subpath);
        checkRange(file, subpath, from, to, `"${m[0]}"`);
      }
    });
    // 「対応年の外」の節の括弧書きは、すべての国を挙げる
    for (const subpath of facts.keys()) {
      if (!mentioned.has(subpath))
        problems.push(
          `${file}: the supported years of ${subpath} are not listed with the country name ("Outside the supported years")`,
        );
    }

    // 祝日の識別子の表: 行の key の集合が、そのサブパスの提供元が返す key の集合と一致すること
    const keyRows = new Set<string>();
    for (const line of text.split("\n")) {
      if (!line.startsWith("| `")) continue;
      const cells = line.split("|").slice(1, -1);
      const first = /`([A-Za-z]+)`/.exec(cells[0] ?? "")?.[1];
      const tokens = [
        ...cells
          .slice(1)
          .join("|")
          .matchAll(/`([a-z0-9][a-z0-9-]*)`/g),
      ].map((m) => m[1]!);
      if (first === undefined || tokens.length < 5) continue;
      const subpath = [...facts].find(([, f]) => f.exportNames.includes(first))?.[0];
      if (subpath === undefined) continue;
      keyRows.add(subpath);
      const listed = new Set(tokens);
      const actual = facts.get(subpath)!.keys;
      const missing = [...actual].filter((k) => !listed.has(k));
      const extra = [...listed].filter((k) => !actual.has(k));
      if (missing.length > 0 || extra.length > 0) {
        problems.push(
          `${file}: the key table row for ${subpath} differs (missing: ${missing.join(", ") || "-"}; not returned: ${extra.join(", ") || "-"})`,
        );
      }
    }
    for (const subpath of facts.keys()) {
      if (!keyRows.has(subpath)) problems.push(`${file}: the key table has no row for ${subpath}`);
    }

    // エラーコードの一覧と診断の表: 型（KnownErrorCode・KnownDiagnosticCode）の値をすべて挙げること
    const errorCodes = literalsOf("src/core/errors.ts", "KnownErrorCode");
    const diagnosticOnly = literalsOf("src/core/diagnose.ts", "KnownDiagnosticCode").filter(
      (c) => !errorCodes.includes(c),
    );
    const listLine = text
      .split("\n")
      .find(
        (l) => !l.startsWith("|") && errorCodes.filter((c) => l.includes(`\`${c}\``)).length >= 5,
      );
    if (listLine === undefined) problems.push(`${file}: the list of error codes not found`);
    else {
      const missing = errorCodes.filter((c) => !listLine.includes(`\`${c}\``));
      if (missing.length > 0)
        problems.push(`${file}: the list of error codes lacks ${missing.join(", ")}`);
    }
    const tableCodes = new Set(
      text
        .split("\n")
        .filter((l) => /^\| `(error|warning|info)` /.test(l))
        .flatMap((l) => [...(l.split("|")[2] ?? "").matchAll(/`([a-z-]+)`/g)].map((m) => m[1]!)),
    );
    const missingDiag = diagnosticOnly.filter((c) => !tableCodes.has(c));
    if (missingDiag.length > 0)
      problems.push(`${file}: the diagnostics table lacks ${missingDiag.join(", ")}`);
  }

  // README のサイズの値: 測定した版が今のマイナー系列であること（RELEASING.md の「マイナー版を出すときに測り直す」）
  const minor = pkg.version.split(".").slice(0, 2).join(".");
  for (const [file, pattern] of [
    ["README.md", /measured for (\d+\.\d+)\.\d+/],
    ["docs/README.ja.md", /(\d+\.\d+)\.\d+ で測定/],
  ] as const) {
    const measured = pattern.exec(readFileSync(file, "utf8"))?.[1];
    if (measured === undefined)
      problems.push(`${file}: the version the sizes were measured for is not stated`);
    else if (measured !== minor) {
      problems.push(
        `${file}: the sizes were measured for ${measured}.x, but the package is ${pkg.version}; re-measure (RELEASING.md)`,
      );
    }
  }
  return problems;
}

/**
 * 英日の対の文書で、節ごと（見出しで区切る）の数値の集合が一致すること。年・版・サイズのような数値（32 以上の整数、
 * 小数点を含む数）だけを比べる（月日の数字は英語では月名になるので比べない）。コードブロックとリンクの URL は除き、
 * インラインのコードは含める。片方だけ直した数値を見つける（両方が同じ誤りなら checkDocFacts の側で見つける）
 */
function checkPairNumbers(enPath: string, jaPath: string): string[] {
  const numbersBySection = (path: string): string[][] => {
    const text = readFileSync(path, "utf8")
      .replace(/^```[\s\S]*?^```/gm, "")
      .replace(/\]\([^)]*\)|<https?:\/\/[^>]*>|https?:\/\/\S+/g, "");
    return text.split(/^#{1,6} .*$/m).map((part) =>
      [...part.matchAll(/(?<![\w.\-/])\d[\d,.]*\d|(?<![\w.\-/])\d(?![\w])/g)]
        .map((m) => m[0].replaceAll(",", "").replace(/\.$/, ""))
        .filter((n) => n.includes(".") || Number(n) >= 32)
        .sort(),
    );
  };
  const a = numbersBySection(enPath);
  const b = numbersBySection(jaPath);
  const problems: string[] = [];
  a.forEach((nums, i) => {
    const other = b[i] ?? [];
    const onlyEn = nums.filter((n) => !other.includes(n));
    const onlyJa = other.filter((n) => !nums.includes(n));
    if (onlyEn.length > 0 || onlyJa.length > 0) {
      problems.push(
        `numbers differ in section ${i} of ${enPath} / ${jaPath}: only in English ${onlyEn.join(", ") || "-"}, only in Japanese ${onlyJa.join(", ") || "-"}`,
      );
    }
  });
  return problems;
}

errors.push(...(await checkDocFacts()));
for (const [en, ja] of DOC_PAIRS)
  if (existsSync(en) && existsSync(ja)) errors.push(...checkPairNumbers(en, ja));

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
