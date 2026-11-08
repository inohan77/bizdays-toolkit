import "./strict-warnings.ts";
/**
 * 文章の主張のうち、機械で確かめられるものの検査（テスト拡充案の T7）。
 *
 *   node scripts/check-claims.ts                 … a・b を確かめる（pnpm check）
 *   node scripts/check-claims.ts --decisions --since v<前の版>
 *                                                … 加えて、c の決定の番号の参照の表を出し、前のタグから変わった行の参照に
 *                                                  印（★）を付ける（リリースの前に人が読む。RELEASING.md の公開の手順）
 *   node scripts/check-claims.ts --base <dir>    … 加えて、d の公開物の変化を、公開済みの版のパッケージ（<dir>）と比べる
 *
 * a. 版の範囲の語: リポジトリの Markdown のうち履歴でないもの（HISTORY_TEXTS に理由付きで挙げたもののほかすべて）とソース（src）に、
 *    今の版より前の系列を指す語（「0.29.x」「v0.29.x」「0.29.X」「0.29 系」「0.29 series」、1.0.0 の後は「1.2.x」なども）があれば
 *    失敗する
 * b. 改名の表と移行ガイドの対応: src/core/renamed.ts の旧名のうち、診断の対象外の場所（合成・スケジュールから作るカレンダー・
 *    期日・振替）の旧名が、移行ガイドの「検索して書き換えてください」の案内に載っていなければ失敗する（0.30.1 の name: の漏れ）
 * c. 決定の番号の参照（半自動）: 「decisions.md の N 番」（「M・N 番」のように並べた形も）を、参照先の見出しと並べた表にする。
 *    範囲と形は、文書の参照の実在の検査（check-package）と同じ（scripts/decision-references.ts）。CHANGELOG は今の番号の節だけ。
 *    見出しのない番号は表に「（見出しなし）」と出す（失敗にはしない）。参照の実在は check-package が確かめるので、人が読むのは
 *    その版で足した・変えた参照だけ。--since <タグ> で、そのタグから変わった行（git diff -U0。コミットしていない変更も含む）の
 *    参照と、CHANGELOG の今の版の節の参照に印を付け、別の表にも並べる
 * d. 公開物の変化: 公開済みの版と比べて変わった dist の .js と .d.ts（型も利用者に見える公開物）を一覧にし、変わったのに
 *    CHANGELOG の今の版か [Unreleased] に利用者向けの区分（Added・Changed・Fixed・Deprecated・Removed・Data）がなければ失敗する。.d.ts は
 *    コメント（JSDoc）を除いて比べる（説明の直しだけでは失敗にしない。.js はビルドでコメントを除いている）
 * e. 1.0.0 で行う作業と約束の置き場: 保守する人の作業は RELEASING.md の「1.0.0 で行う作業」、利用者への約束は移行ガイドの
 *    「1.0.0 で削除する予定の API」だけに書く。1 つの文（「。」で区切る）に「1.0.0」と、その後に外す・消す・削除・置き換え・
 *    invalid-option のどれか（または「外れたら（1.0.0）」の形）があり、その文が置き場を指していなければ失敗する。作業の側は
 *    RELEASING.md（その節を除く）と、scripts・test・.github のコメントと src の TSDoc でないコメント。約束の側は src の TSDoc
 *    のうち @deprecated の付いていないもの（@deprecated の文は check-names が移行ガイドの表と突き合わせる）
 *
 * git の作業ツリーの外（git が「not a git repository」で止まるとき。ZIP を展開しただけのフォルダー）では、a の Markdown の
 * 分類を飛ばして SKIP の行を出す（意図した飛ばし no-git。CI では失敗にする）。git のほかの失敗は飛ばさずに止まる
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { skipWhen } from "../test/support/skip.ts";
import { RENAMED_KEYS, type RenamedPlace } from "../src/core/renamed.ts";
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
/** ディレクトリの下のファイル（相対パス。/ 区切り） */
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
/** Job Summary に出す Markdown（--decisions・--base のとき） */
const report: string[] = [];
const version = (JSON.parse(read("package.json")) as { version: string }).version;
const [major, minor] = version.split(".").map(Number) as [number, number];

// ---------------------------------------------------------------------------
// a. 版の範囲の語
// ---------------------------------------------------------------------------

/**
 * リポジトリの Markdown のうち、版の範囲の語を探すもの（今の版の挙動・決まりを書く文書）。docs/sources/ の下は、祝日の
 * 出典の記録（今の版のデータの根拠）なので、まとめて探す
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
 * リポジトリの Markdown のうち、版の範囲の語を探さないものと理由。新しい Markdown を足したら、探すもの（上）か、ここかに
 * 理由とともに分ける。どちらにも分けていなければ失敗にする
 */
const HISTORY_TEXTS: Readonly<Record<string, string>> = {
  "CHANGELOG.md": "版ごとの変更の履歴",
  "docs/development-log.md": "版ごとの開発の記録（品質の仕組みの変更の履歴）",
  "docs/migration.md": "版ごとの移行の履歴（前の版の書き方を示す）",
  "docs/decisions.md": "決定の経緯（どの版で何を改めたかを書く）",
  "RELEASING.md": "版の区分の説明で、前の版の系列を例に書く",
  "etc/api.md": "公開 API の記録（scripts/api-report.ts が書く生成物で、文章ではない）",
};
/** リポジトリの Markdown（追跡しているものと、無視していない未追跡のもの。取り込み中の新しい文書も数える） */
const markdown = ((): string[] | undefined => {
  try {
    return execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md"],
      // git のメッセージを英語にそろえる（下の「not a git repository」の判定のため）
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
    // git の作業ツリーの外だけを飛ばす（意図した飛ばし no-git。CI では skipWhen が失敗にする）。git がない・ほかの失敗は止まる
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    if (!stderr.includes("not a git repository")) throw error;
    console.log(`SKIP markdown classification: ${skipWhen("no-git", true)}`);
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
/** 版の範囲の語を探す文書（履歴でないもの）とソース */
const CURRENT_TEXTS = [...(markdown ?? []).filter(isCurrent), ...filesUnder("src", /\.ts$/)];
/**
 * 版の範囲の語（`0.29.x`・`v0.29.x`・`0.29.X`・`0.29 系`・`0.29 series`、1.0.0 の後は `1.2.x` なども）。今の版の
 * 「メジャー.マイナー」より前の系列だけを失敗にする。前に英数字・点があるもの（`10.29.x` など）は除く
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
// b. 改名の表と移行ガイドの対応
// ---------------------------------------------------------------------------

/** 診断（deprecated-option）が旧名を知らせる場所。ほかの場所の旧名は、移行ガイドの検索の案内に載せる */
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
// c. 決定の番号の参照（半自動）
// ---------------------------------------------------------------------------

if (process.argv.includes("--decisions")) {
  const since = argValue("--since");
  const headings = new Map<number, string>();
  for (const m of read("docs/decisions.md").matchAll(/^### (\d+)\. (.+)$/gm))
    headings.set(Number(m[1]), m[2]!.trim());
  /**
   * --since のタグから変わった行（ファイル → 今の行番号の集合。タグにないファイルは、すべての行が変わったとみなす null）。
   * 作業ツリーと比べる（取り込み中のコミットしていない変更も数える）
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
  // 範囲と形は、文書の参照の実在の検査（check-package の checkReferences）と同じ（scripts/decision-references.ts）
  for (const file of decisionReferenceFiles()) {
    const changed = since === undefined ? undefined : changedLines(file);
    read(file)
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(DECISION_REFERENCE))
          add(m[1]!, `${file}:${i + 1}`, changed === null || (changed?.has(i + 1) ?? false));
      });
  }
  // CHANGELOG は、今の番号で書いた節だけを表に入れる（番号を振り直す前の節は旧番号で、今の見出しと照らせないため）。
  // --since では、今の版の節（と [Unreleased]）の参照に印を付ける
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
    // 人が読むのは、前のタグから足した・変えた参照（実在は check-package が確かめている）
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
// e. 1.0.0 で行う作業と約束の置き場
// ---------------------------------------------------------------------------

const WORK_SECTION = "1.0.0 で行う作業";
const PROMISE_SECTION = "1.0.0 で削除する予定の API";
/** 1.0.0 の後に、外す・消す・削除・置き換え・invalid-option が続く文（または「外れたら（1.0.0）」の形） */
const ONE_ZERO_WORK =
  /1\.0\.0.*?(?:外[さしすせれ]|消[さしすせえ]|削除|置き換え|invalid-option)|外れたら（1\.0\.0）/s;
/** コメントの本文（行頭の記号を除いたもの）を、続いている行どうしまとめて返す */
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
  // コメントの位置は構文木の字句（記号を含む）から集める（字句だけで読むと、正規表現のリテラルの後を読み違える。
  // 型の「|」の前のコメントは、どのノードの前にも付かないので、記号の字句まで見る）
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
/** 文ごとに、置き場を指していない 1.0.0 の作業の記述を返す */
const strayOneZero = (text: string, place: string, lines = false): string[] =>
  (lines ? text : text.replaceAll("\n", ""))
    .split(lines ? /。|\n/ : "。")
    .filter((s) => ONE_ZERO_WORK.test(s) && !s.includes(place) && !s.includes(PROMISE_SECTION));
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
  // この検査自身の説明（このファイルのコメント）は規則を書いたもので、作業ではないので除く
  for (const file of [...workFiles, ...filesUnder("src", /\.ts$/)].filter(
    (f) => f !== "scripts/check-claims.ts",
  )) {
    oneZeroChecked++;
    for (const c of commentsOf(file)) {
      if (file.startsWith("src/") && c.doc) {
        // 約束の側: @deprecated の付いていない TSDoc は、移行ガイドの節を指す
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
// d. 公開物の変化
// ---------------------------------------------------------------------------

/**
 * CHANGELOG の利用者向けの区分。今の版の節か [Unreleased] に、どれか 1 つがあればよい（data-compare の「### Data」と同じ扱い）。
 * 「Migration」（0.30.x 以前の「移行」）は変更の区分（Changed・Removed など）に添えて書くもので、それだけでは何が変わったかを言わない。「開発」は利用者に
 * 見えない変更（テスト・道具・文書の運用）、「既知の不具合」は公開物の変化ではないので、どれも数えない
 */
const USER_FACING = ["Added", "Changed", "Fixed", "Deprecated", "Removed", "Data"];
const baseDir = argValue("--base");
/** 比べる中身（.d.ts はコメントを除いて印刷し直したもの） */
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
  for (const f of new Set([...headFiles, ...baseFiles])) {
    const inHead = headFiles.includes(f);
    const inBase = baseFiles.includes(f);
    if (inHead && !inBase) changed.push(`added   dist/${f}`);
    else if (!inHead && inBase) changed.push(`removed dist/${f}`);
    else if (published(join("dist", f)) !== published(join(baseDist, f)))
      changed.push(`changed dist/${f}`);
  }
  changed.sort((a, b) => a.slice(8).localeCompare(b.slice(8)));
  const changelog = read("CHANGELOG.md");
  /** CHANGELOG の節（次の「## [」の前まで） */
  const sectionOf = (name: string): string => {
    const start = changelog.indexOf(`## [${name}]`);
    if (start < 0) return "";
    const next = changelog.indexOf("\n## [", start + 1);
    return changelog.slice(start, next < 0 ? undefined : next);
  };
  const userFacing = [
    ...new Set(
      [sectionOf("Unreleased"), sectionOf(version)]
        .flatMap((section) => [...section.matchAll(/^### (.+)$/gm)].map((m) => m[1]!.trim()))
        .filter((s) => USER_FACING.includes(s)),
    ),
  ];
  const jsCount = headFiles.filter((f) => f.endsWith(".js")).length;
  const dtsCount = headFiles.length - jsCount;
  report.push(`## 公開物の変化（${baseVersion} → ${version} の dist の .js・.d.ts）`, "");
  report.push(
    `${changed.length === 0 ? "変わったファイルはない" : `変わったファイル: ${changed.length} 件`}（比べたファイル: .js ${jsCount} 件・.d.ts ${dtsCount} 件。.d.ts はコメントを除いて比べる）`,
    "",
  );
  if (changed.length > 0) report.push("```text", ...changed, "```", "");
  report.push(
    `CHANGELOG の [Unreleased]・[${version}] の節の利用者向けの区分: ${userFacing.length > 0 ? userFacing.join("・") : "なし"}`,
    "",
  );
  if (changed.length > 0 && userFacing.length === 0)
    failures.push(
      `CHANGELOG.md: dist files changed from ${baseVersion}, but neither [Unreleased] nor the ${version} section has a user-facing section (${USER_FACING.join(", ")})`,
    );
}

if (report.length > 0) console.log(report.join("\n"));
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `OK   claims: no earlier minor series in ${seriesChecked} files; ${searchNeeded.size} renamed keys outside the diagnostics are in the migration guide's search guidance; work for 1.0.0 points to its section in ${oneZeroChecked} files`,
);
