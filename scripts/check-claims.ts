import "./strict-warnings.ts";
/**
 * Checks those claims of the prose that a machine can verify (T7 of the test expansion plan).
 *
 *   node scripts/check-claims.ts                 ... checks a and b (pnpm check)
 *   node scripts/check-claims.ts --decisions --since v<previous version>
 *                                                ... also prints the table of decision references of c and marks
 *                                                  the references on lines changed since the previous tag (a
 *                                                  person reads it before a release; the publication steps of
 *                                                  RELEASING.md)
 *   node scripts/check-claims.ts --base <dir>    ... also compares the published files of d with the package of
 *                                                  a published version (<dir>)
 *
 * a. Words for a range of versions: fails when a Markdown file of the repository that is not history (everything
 *    except those listed with a reason in HISTORY_TEXTS) or the source (src) has a word pointing at a series
 *    older than the current version ("0.29.x", "v0.29.x", "0.29.X", "0.29 series" and the Japanese form; after
 *    1.0.0 also "1.2.x")
 * b. The rename table and the migration guide: fails when an old name of src/core/renamed.ts in a place the
 *    diagnostics do not cover (combining, calendars made from schedules, due dates, substitution) is missing
 *    from the search-and-rewrite guidance of the migration guide (the omission of `name:` in 0.30.1)
 * c. Decision references (semi-automatic): tabulates the references to numbered decisions of decisions.md (also
 *    several numbers in one reference) next to the headings they point to. Scope and form equal the check that
 *    the references exist (check-package; scripts/decision-references.ts). For the CHANGELOG only the sections
 *    written with the current numbers. A number without a heading is shown as such in the table (not a
 *    failure). check-package verifies that references exist, so a person reads only the references added or
 *    changed in the version. With --since <tag>, the references on lines changed since that tag (git diff -U0,
 *    including uncommitted changes) and those in the CHANGELOG section of the current version are marked and
 *    listed in a second table
 * d. Changes of the published files: lists the .js and .d.ts of dist that differ from the published version
 *    (types are published and visible to users too) and fails when something changed but the CHANGELOG section
 *    of the current version or [Unreleased] has no user-facing category (Added, Changed, Fixed, Deprecated,
 *    Removed, Data, Security). .d.ts files are compared without comments (JSDoc) (a correction of a description
 *    alone does not fail; the build strips comments from .js)
 * e. Where the work and the promises for 1.0.0 are written: the maintainers' work only in the section of
 *    RELEASING.md on the work for 1.0.0, the promises to users only in the migration guide's section on the API
 *    to be removed in 1.0.0. Fails when one sentence has "1.0.0" together with a word for removing, deleting,
 *    dropping, replacing or invalid-option (ONE_ZERO_WORK for Japanese, ONE_ZERO_WORK_EN for English) and does
 *    not point to that section. The work side: RELEASING.md (outside that section), the comments of scripts,
 *    test and .github, and the comments of src that are not TSDoc. The promise side: the TSDoc of src without
 *    @deprecated (the @deprecated texts are compared with the migration guide's table by check-names)
 * f. The character for "edition": versions are called by one word (0.31.2). Fails when the character HAN is in a
 *    Markdown file of the repository or a file of src, scripts, test, .github or etc. Editions of publications
 *    and statutes are excepted (the data of docs/sources/ and test/fixtures/, language editions, statute
 *    editions with a year or date). This file itself is excepted because it writes the rule
 *
 * Outside a git work tree (git stops with "not a git repository": a folder that is only an unpacked ZIP), the
 * classification of Markdown files of a and the Markdown files of f are skipped with a SKIP line (the intended
 * skip no-git; a failure in CI). Any other git failure stops without skipping
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { skipWhen } from "../test/support/skip.ts";
import { RENAMED_KEYS, type RenamedPlace } from "../src/core/renamed.ts";
import { decisionCoverage } from "./decision-coverage.ts";
import {
  DECISION_REFERENCE,
  changelogSections,
  decisionNumbers,
  decisionReferenceFiles,
} from "./decision-references.ts";

const read = (path: string): string => readFileSync(path, "utf8");
const argValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`${name} needs a value`);
    process.exit(2);
  }
  return value;
};
/** Files under a directory (relative paths, / separated) */
function filesUnder(dir: string, ext: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, ext));
    else if (ext.test(name)) out.push(path.replaceAll("\\", "/"));
  }
  return out.sort();
}

const failures: string[] = [];
/** Markdown for the Job Summary (with --decisions or --base) */
const report: string[] = [];
const version = (JSON.parse(read("package.json")) as { version: string }).version;
const [major, minor] = version.split(".").map(Number) as [number, number];

// ---------------------------------------------------------------------------
// a. Words for a range of versions
// ---------------------------------------------------------------------------

/**
 * The Markdown files of the repository searched for range-of-version words (documents that describe the
 * behaviour and rules of the current version). Everything under docs/sources/ is searched: the records of the
 * holiday sources are the grounds of the current version's data
 */
const CURRENT_MARKDOWN = [
  "README.md",
  "docs/README.ja.md",
  "docs/guide.md",
  "docs/guide.ja.md",
  "docs/providers.md",
  "docs/providers.ja.md",
  "SECURITY.md",
  "etc/naming.md",
];
const CURRENT_MARKDOWN_DIRS = ["docs/sources/"];
/**
 * The Markdown files of the repository that are not searched for range-of-version words, with the reason. A new
 * Markdown file goes either into the searched ones (above) or here with a reason; one in neither fails
 */
const HISTORY_TEXTS: Readonly<Record<string, string>> = {
  "CHANGELOG.md": "バージョンごとの変更の履歴",
  "docs/development-log.md": "バージョンごとの開発の記録（品質の仕組みの変更の履歴）",
  "docs/migration.md": "バージョンごとの移行の履歴（前のバージョンの書き方を示す）",
  "docs/decisions.md": "決定の経緯（どのバージョンで何を改めたかを書く）",
  "RELEASING.md": "バージョンの区分の説明で、前のバージョンの系列を例に書く",
  "etc/api.md": "公開 API の記録（scripts/api-report.ts が書く生成物で、文章ではない）",
};
/**
 * The Markdown files of the repository (tracked ones and untracked ones that are not ignored; new documents
 * being taken in count too)
 */
const markdown = ((): string[] | undefined => {
  try {
    return execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md"],
      // Make git's messages English (for the "not a git repository" test below)
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, LC_ALL: "C", LANGUAGE: "C" },
      },
    )
      .split("\0")
      .filter((f) => f !== "" && !f.startsWith("node_modules/"))
      .sort();
  } catch (error) {
    // Only outside a git work tree is it passed over (the intended skip no-git; skipWhen fails in CI). Without git, or
    // on any other failure, it stops
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    if (!stderr.includes("not a git repository")) throw error;
    console.log(`SKIP markdown files (classification, term check): ${skipWhen("no-git", true)}`);
    return undefined;
  }
})();
for (const file of [...CURRENT_MARKDOWN, ...Object.keys(HISTORY_TEXTS)])
  if (markdown !== undefined && !markdown.includes(file))
    failures.push(`${file}: listed in scripts/check-claims.ts, but not found`);
const isCurrent = (f: string): boolean =>
  CURRENT_MARKDOWN.includes(f) || CURRENT_MARKDOWN_DIRS.some((d) => f.startsWith(d));
for (const file of markdown ?? [])
  if (!isCurrent(file) && !(file in HISTORY_TEXTS))
    failures.push(
      `${file}: not classified for the version series check (add it to CURRENT_MARKDOWN, or to HISTORY_TEXTS with a reason, in scripts/check-claims.ts)`,
    );
/** The documents (not history) and the source searched for range-of-version words */
const CURRENT_TEXTS = [...(markdown ?? []).filter(isCurrent), ...filesUnder("src", /\.ts$/)];
/**
 * Words for a range of versions (`0.29.x`, `v0.29.x`, `0.29.X`, `0.29 series` and the Japanese form; after 1.0.0
 * also `1.2.x`). Only a series before the current "major.minor" fails. A form preceded by a letter, digit or
 * dot (`10.29.x`, ...) is excepted
 */
const SERIES = /(?<![\w.])v?(\d+)\.(\d+)(?:\.[xX](?!\w)|\s*系|\s+series\b)/g;
const before = (maj: number, min: number): boolean => maj < major || (maj === major && min < minor);
let seriesChecked = 0;
for (const file of CURRENT_TEXTS) {
  seriesChecked++;
  read(file)
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(SERIES)) {
        if (before(Number(m[1]), Number(m[2])))
          failures.push(
            `${file}:${i + 1}: "${m[0]}" refers to a minor series before ${version} (write the current behaviour, or move the history to CHANGELOG / docs/migration.md)`,
          );
      }
    });
}

// ---------------------------------------------------------------------------
// b. The rename table and the migration guide
// ---------------------------------------------------------------------------

/**
 * Places where the diagnostics (deprecated-option) report an old name. Old names of other places are listed in
 * the search guidance of the migration guide
 */
const DIAGNOSED: readonly RenamedPlace[] = ["source", "calendar", "schedule", "rule"];
const NOT_DIAGNOSED: readonly RenamedPlace[] = ["combine", "fromSchedule", "dueDate", "substitute"];
const migration = read("docs/migration.md");
const searchSentence =
  migration.split("\n").find((l) => l.includes("診断の対象外") && l.includes("検索して")) ?? "";
if (searchSentence === "")
  failures.push(
    'docs/migration.md: the sentence that asks to search for renamed keys ("診断の対象外 … 検索して") is missing',
  );
const searchNeeded = new Set<string>();
for (const r of RENAMED_KEYS) {
  if (DIAGNOSED.includes(r.place)) continue;
  if (!NOT_DIAGNOSED.includes(r.place)) {
    failures.push(
      `src/core/renamed.ts: the place "${r.place}" of "${r.from}" is neither diagnosed nor listed as not diagnosed (classify it in scripts/check-claims.ts)`,
    );
    continue;
  }
  searchNeeded.add(r.from);
}
for (const from of searchNeeded) {
  if (!new RegExp("`" + from + "[:`]").test(searchSentence))
    failures.push(
      `docs/migration.md: the renamed key "${from}" is not diagnosed, but the search guidance (the sentence with "診断の対象外") does not list it`,
    );
}

// ---------------------------------------------------------------------------
// c. Decision references (semi-automatic)
// ---------------------------------------------------------------------------

if (process.argv.includes("--decisions")) {
  const since = argValue("--since");
  const headings = new Map<number, string>();
  for (const m of read("docs/decisions.md").matchAll(/^### (\d+)\. (.+)$/gm))
    headings.set(Number(m[1]), m[2]!.trim());
  /**
   * Lines changed since the tag of --since (file → set of current line numbers; null, meaning every line, for a
   * file missing at the tag). Compared with the work tree (uncommitted changes being taken in count too)
   */
  const changedLines = (file: string): Set<number> | null => {
    const inTag =
      execFileSync("git", ["ls-tree", "--name-only", since!, "--", file], {
        encoding: "utf8",
      }).trim() !== "";
    if (!inTag) return null;
    const lines = new Set<number>();
    const diff = execFileSync("git", ["diff", "-U0", since!, "--", file], { encoding: "utf8" });
    for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      for (let k = 0; k < count; k++) lines.add(start + k);
    }
    return lines;
  };
  type Ref = { where: string; changed: boolean };
  const refs = new Map<number, Ref[]>();
  const add = (list: string, where: string, changed: boolean): void => {
    for (const n of decisionNumbers(list))
      refs.set(n, [...(refs.get(n) ?? []), { where, changed }]);
  };
  // Scope and form equal the check that the references exist (checkReferences of check-package;
  // scripts/decision-references.ts)
  for (const file of decisionReferenceFiles()) {
    const changed = since === undefined ? undefined : changedLines(file);
    read(file)
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(DECISION_REFERENCE))
          add(m[1]!, `${file}:${i + 1}`, changed === null || (changed?.has(i + 1) ?? false));
      });
  }
  // For the CHANGELOG only the sections written with the current numbers go into the table (sections from before
  // the renumbering have old numbers that cannot be matched with the current headings).
  // With --since, the references in the section of the current version (and [Unreleased]) are marked
  let oldReferences = 0;
  for (const { version: v, text, oldNumbering } of changelogSections())
    for (const m of text.matchAll(DECISION_REFERENCE)) {
      if (oldNumbering) oldReferences += decisionNumbers(m[1]!).length;
      else
        add(
          m[1]!,
          `CHANGELOG.md [${v}]`,
          since !== undefined && (v === version || v === "Unreleased"),
        );
    }
  const rows = [...refs].sort(([a], [b]) => a - b);
  const total = rows.reduce((sum, [, list]) => sum + list.length, 0);
  const heading = (n: number): string =>
    (headings.get(n) ?? "（見出しなし）").replaceAll("|", "\\|");
  report.push("## 決定の番号の参照（docs/decisions.md）", "");
  report.push(
    `参照 ${total} か所・番号 ${rows.length} 個（CHANGELOG の旧番号の節の参照 ${oldReferences} か所は、表に入れない）`,
    "",
  );
  if (since !== undefined) {
    // A person reads the references added or changed since the previous tag (check-package verified that they
    // exist)
    const marked = rows.flatMap(([n, list]) =>
      list.filter((r) => r.changed).map((r) => ({ n, where: r.where })),
    );
    report.push(
      `${since} から変わった行の参照（★）: ${marked.length} か所。参照先の見出しと照らして、主張が合っているかを人が確かめる`,
      "",
    );
    report.push("| 番号 | 見出し | 参照元 |");
    report.push("| ---- | ------ | ------ |");
    for (const { n, where } of marked) report.push(`| ${n} | ${heading(n)} | ${where} |`);
    report.push("");
  }
  report.push("| 番号 | 見出し | 参照の数 | 参照元 |");
  report.push("| ---- | ------ | -------- | ------ |");
  for (const [n, list] of rows)
    report.push(
      `| ${n} | ${heading(n)} | ${list.length} | ${list.map((r) => (r.changed ? `★${r.where}` : r.where)).join("<br>")} |`,
    );
  report.push("");
}

// ---------------------------------------------------------------------------
// e. Where the work and the promises for 1.0.0 are written
// ---------------------------------------------------------------------------

const WORK_SECTION = "1.0.0 で行う作業";
const PROMISE_SECTION = "1.0.0 で削除する予定の API";
/**
 * A sentence in which 1.0.0 is followed by a Japanese word for removing, deleting or replacing, or by
 * invalid-option (or the Japanese form "once it is dropped (1.0.0)")
 */
const ONE_ZERO_WORK =
  /1\.0\.0.*?(?:外[さしすせれ]|消[さしすせえ]|削除|置き換え|invalid-option)|外れたら（1\.0\.0）/s;
/**
 * The same in English comments: a sentence with 1.0.0 and remove / delete / drop / replace (in either order), or
 * invalid-option after 1.0.0
 */
const ONE_ZERO_WORK_EN =
  /\b(?:remov|delet|drop|replac)\w*\b.*?1\.0\.0|1\.0\.0.*?(?:\b(?:remov|delet|drop|replac)\w*|invalid-option)/is;
/** How an English comment names the two sections (compared without case) */
const WORK_SECTION_EN = "work for 1.0.0";
const PROMISE_SECTION_EN = "api to be removed in 1.0.0";
/** Returns the bodies of the comments (without the leading marks), joining consecutive lines */
function commentsOf(file: string): { text: string; line: number; doc: boolean }[] {
  const source = read(file);
  const lineOf = (pos: number): number => source.slice(0, pos).split("\n").length;
  if (file.endsWith(".yml") || file.endsWith(".yaml")) {
    const out: { text: string; line: number; doc: boolean }[] = [];
    source.split("\n").forEach((l, i) => {
      const m = /(?:^|\s)#\s?(.*)$/.exec(l);
      if (m === null) return;
      const last = out.at(-1);
      if (last !== undefined && last.line + last.text.split("\n").length === i + 1)
        last.text += `\n${m[1]!}`;
      else out.push({ text: m[1]!, line: i + 1, doc: false });
    });
    return out;
  }
  // Comment positions are collected from the tokens of the syntax tree (including punctuation). (Reading tokens
  // alone misreads what follows a regular-expression literal. A comment before the "|" of a type is attached to
  // no node, so punctuation tokens are examined too)
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const ranges = new Map<number, ts.CommentRange>();
  const collect = (node: ts.Node): void => {
    for (const r of [
      ...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(source, node.end) ?? []),
    ])
      ranges.set(r.pos, r);
    for (const child of node.getChildren(sf)) collect(child);
  };
  collect(sf);
  for (const r of ts.getLeadingCommentRanges(source, sf.endOfFileToken.pos) ?? [])
    ranges.set(r.pos, r);
  const out: { text: string; line: number; doc: boolean; end: number }[] = [];
  for (const r of [...ranges.values()].sort((x, y) => x.pos - y.pos)) {
    const raw = source.slice(r.pos, r.end);
    const line = lineOf(r.pos);
    if (r.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      const text = raw.slice(2).trim();
      const last = out.at(-1);
      if (last !== undefined && !last.doc && last.end === line - 1) {
        last.text += `\n${text}`;
        last.end = line;
      } else out.push({ text, line, doc: false, end: line });
    } else {
      const text = raw
        .replace(/^\/\*\*?|\*\/$/g, "")
        .split("\n")
        .map((l) => l.replace(/^\s*\* ?/, ""))
        .join("\n");
      out.push({ text, line, doc: raw.startsWith("/**"), end: lineOf(r.end) });
    }
  }
  return out;
}
/** Japanese text (a sentence is read by the Japanese rule when it has any, otherwise by the English rule) */
const JAPANESE = /[\u3040-\u30ff\u4e00-\u9fff]/;
/** Per sentence, the descriptions of work for 1.0.0 that do not point to their section */
const strayOneZero = (text: string, place: string, lines = false): string[] => [
  ...(lines ? text : text.replaceAll("\n", ""))
    .split(lines ? /。|\n/ : "。")
    .filter(
      (s) =>
        (lines || JAPANESE.test(s)) &&
        ONE_ZERO_WORK.test(s) &&
        !s.includes(place) &&
        !s.includes(PROMISE_SECTION),
    ),
  // English comments: sentences end with ". " or "; " (lines are joined with a space). The section is named by
  // its English alias
  ...(lines ? [] : text.replace(/\n\s*/g, " ").split(/(?<=[.;])\s+/)).filter((s) => {
    const lower = s.toLowerCase();
    return (
      !JAPANESE.test(s) &&
      ONE_ZERO_WORK_EN.test(s) &&
      !lower.includes(place === WORK_SECTION ? WORK_SECTION_EN : PROMISE_SECTION_EN) &&
      !lower.includes(PROMISE_SECTION_EN)
    );
  }),
];
let oneZeroChecked = 0;
{
  const releasing = read("RELEASING.md");
  const start = releasing.indexOf(`### ${WORK_SECTION}\n`);
  if (start < 0) failures.push(`RELEASING.md: the section "${WORK_SECTION}" is missing`);
  const end = start < 0 ? -1 : releasing.indexOf("\n#", start + 1);
  const outside =
    start < 0 ? releasing : releasing.slice(0, start) + (end < 0 ? "" : releasing.slice(end));
  oneZeroChecked++;
  for (const s of strayOneZero(outside, WORK_SECTION, true))
    failures.push(
      `RELEASING.md: work for 1.0.0 outside the section "${WORK_SECTION}" (move it there): ${s.trim().slice(0, 80)}`,
    );
  const workFiles = [
    ...filesUnder("scripts", /\.(?:ts|mjs)$/),
    ...filesUnder("test", /\.(?:ts|mjs)$/),
    ...filesUnder(".github", /\.ya?ml$/),
  ];
  // The description of this check itself (the comments of this file) writes the rule and is not work: excepted
  for (const file of [...workFiles, ...filesUnder("src", /\.ts$/)].filter(
    (f) => f !== "scripts/check-claims.ts",
  )) {
    oneZeroChecked++;
    for (const c of commentsOf(file)) {
      if (file.startsWith("src/") && c.doc) {
        // The promise side: a TSDoc without @deprecated points to the section of the migration guide
        if (c.text.includes("@deprecated")) continue;
        for (const s of strayOneZero(c.text, PROMISE_SECTION))
          failures.push(
            `${file}:${c.line}: a TSDoc about 1.0.0 that does not point to the migration guide's "${PROMISE_SECTION}": ${s.trim().slice(0, 80)}`,
          );
        continue;
      }
      for (const s of strayOneZero(c.text, WORK_SECTION))
        failures.push(
          `${file}:${c.line}: work for 1.0.0 that does not point to RELEASING.md "${WORK_SECTION}": ${s.trim().slice(0, 80)}`,
        );
    }
  }
}

// ---------------------------------------------------------------------------
// f. The character for "edition"
// ---------------------------------------------------------------------------

/** The character for "edition" (not used for software versions) */
const HAN = /\u7248/g;
/** Excepted forms: language editions, statute editions with a year or date */
const HAN_ALLOWED = /(?:日本|英|ウェールズ)語\u7248|\d{4} 年\u7248|\d{4}-\d{2}-\d{2} \u7248/g;
let hanChecked = 0;
{
  const texts = [
    ...(markdown ?? []).filter((f) => !f.startsWith("docs/sources/")),
    ...["src", "scripts", "test", ".github", "etc"].flatMap((dir) =>
      filesUnder(dir, /\.(?:ts|mjs|cjs|ya?ml|json|md)$/),
    ),
  ].filter(
    (f, i, all) =>
      all.indexOf(f) === i && !f.startsWith("test/fixtures/") && f !== "scripts/check-claims.ts",
  );
  for (const file of texts) {
    hanChecked++;
    read(file)
      .split("\n")
      .forEach((line, i) => {
        const rest = line.replace(HAN_ALLOWED, "");
        if (HAN.test(rest))
          failures.push(
            `${file}:${i + 1}: uses "\u7248"; write "バージョン" (0.31.2. Only editions of publications and laws keep it)`,
          );
        HAN.lastIndex = 0;
      });
  }
}

// ---------------------------------------------------------------------------
// d. Changes of the published files
// ---------------------------------------------------------------------------

/**
 * The user-facing categories of the CHANGELOG. One of them in the section of the current version or
 * [Unreleased] is enough (as "### Data" for data-compare).
 * "Migration" accompanies a category of change (Changed, Removed, ...) and does not say by itself what changed.
 * The development category is for changes invisible to users (tests, tools, how documents are kept) and known
 * issues are not a change of the published files, so none of these count
 */
const USER_FACING = ["Added", "Changed", "Fixed", "Deprecated", "Removed", "Data", "Security"];
const baseDir = argValue("--base");
/** The content compared (.d.ts printed again without comments) */
function published(path: string): string {
  const text = read(path);
  if (!path.endsWith(".d.ts")) return text;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false);
  return ts.createPrinter({ removeComments: true }).printFile(source);
}
if (baseDir !== undefined) {
  const PUBLISHED = /\.(js|d\.ts)$/;
  const headFiles = filesUnder("dist", PUBLISHED).map((f) =>
    relative("dist", f).replaceAll("\\", "/"),
  );
  const baseDist = join(baseDir, "dist");
  if (!existsSync(baseDist)) {
    console.error(`${baseDist} not found (pass the extracted package of the published version)`);
    process.exit(2);
  }
  if (headFiles.length === 0) {
    console.error("dist/*.js not found (run pnpm build first)");
    process.exit(2);
  }
  const baseFiles = filesUnder(baseDist, PUBLISHED).map((f) =>
    relative(baseDist, f).replaceAll("\\", "/"),
  );
  const baseVersion = (JSON.parse(read(join(baseDir, "package.json"))) as { version: string })
    .version;
  const changed: string[] = [];
  /**
   * The text of the type descriptions (TSDoc of .d.ts) is a promise to users and part of the published files
   * (terms of RELEASING.md). A changed comment text counts even when the content is the same. Compared with all
   * whitespace and line breaks removed (re-wrapping without changing the text does not count)
   */
  const commentTexts = (path: string): string =>
    JSON.stringify(commentsOf(path).map((c) => c.text.replace(/\s+/g, "")));
  for (const f of new Set([...headFiles, ...baseFiles])) {
    const inHead = headFiles.includes(f);
    const inBase = baseFiles.includes(f);
    if (inHead && !inBase) changed.push(`added   dist/${f}`);
    else if (!inHead && inBase) changed.push(`removed dist/${f}`);
    else if (published(join("dist", f)) !== published(join(baseDist, f)))
      changed.push(`changed dist/${f}`);
    else if (
      f.endsWith(".d.ts") &&
      commentTexts(join("dist", f)) !== commentTexts(join(baseDist, f))
    )
      changed.push(`docs    dist/${f}`);
  }
  changed.sort((a, b) => a.slice(8).localeCompare(b.slice(8)));
  const changelog = read("CHANGELOG.md");
  /** A section of the CHANGELOG (up to the next "## [") */
  const sectionOf = (name: string): string => {
    const start = changelog.indexOf(`## [${name}]`);
    if (start < 0) return "";
    const next = changelog.indexOf("\n## [", start + 1);
    return changelog.slice(start, next < 0 ? undefined : next);
  };
  const userFacing = [
    ...new Set(
      // When the current version is published (the same version as the one compared), its section records the
      // earlier publication, so only [Unreleased] is examined
      (baseVersion === version
        ? [sectionOf("Unreleased")]
        : [sectionOf("Unreleased"), sectionOf(version)]
      )
        .flatMap((section) => [...section.matchAll(/^### (.+)$/gm)].map((m) => m[1]!.trim()))
        .filter((s) => USER_FACING.includes(s)),
    ),
  ];
  const jsCount = headFiles.filter((f) => f.endsWith(".js")).length;
  const dtsCount = headFiles.length - jsCount;
  report.push(`## 公開物の変化（${baseVersion} → ${version} の dist の .js・.d.ts）`, "");
  report.push(
    `${changed.length === 0 ? "変わったファイルはない" : `変わったファイル: ${changed.length} 件`}（比べたファイル: .js ${jsCount} 件・.d.ts ${dtsCount} 件。.d.ts は宣言をコメントを除いて比べ、宣言が同じでも型の説明の文が変われば docs として数える）`,
    "",
  );
  if (changed.length > 0) report.push("```text", ...changed, "```", "");
  report.push(
    `CHANGELOG の ${baseVersion === version ? "[Unreleased]" : `[Unreleased]・[${version}]`} の節の利用者向けの区分: ${userFacing.length > 0 ? userFacing.join("・") : "なし"}`,
    "",
  );
  if (changed.length > 0 && userFacing.length === 0)
    failures.push(
      `CHANGELOG.md: dist files changed from ${baseVersion}, but ${baseVersion === version ? "[Unreleased] has no user-facing section" : `neither [Unreleased] nor the ${version} section has a user-facing section`} (${USER_FACING.join(", ")})`,
    );
}

// ---------------------------------------------------------------------------
// g. The decisions document decides the published option keys and names (scripts/decision-coverage.ts)
// ---------------------------------------------------------------------------
const coverage = decisionCoverage({
  api: read("etc/api.md"),
  errorsSource: read("src/core/errors.ts"),
  decisions: read("docs/decisions.md"),
  optionDecisions: JSON.parse(read("etc/option-decisions.json")) as Record<string, unknown>,
  undocumented: JSON.parse(read("etc/undocumented-names.json")) as Record<string, unknown>,
});
failures.push(...coverage.failures);

if (report.length > 0) console.log(report.join("\n"));
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `OK   claims: no earlier minor series in ${seriesChecked} files; ${searchNeeded.size} renamed keys outside the diagnostics are in the migration guide's search guidance; work for 1.0.0 points to its section in ${oneZeroChecked} files; no \u7248 in ${hanChecked} files`,
);
console.log(
  `OK   decisions: ${coverage.optionKeys} option keys point to a decision that mentions them; ${coverage.names} public names are mentioned (${coverage.mentioned}) or listed with a reason (${coverage.names - coverage.mentioned})`,
);
