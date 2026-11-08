import "./strict-warnings.ts";
/**
 * 検査のスクリプトそのものの検査（テスト拡充案の T3。CI の tool-selftest ジョブ。pnpm check には入れない）。
 *
 * リポジトリの写しを一時ディレクトリに作り、検査のスクリプトを写した先で動かす。まず誤りを入れずに動かして合格することを
 * 確かめ（対照の実行。失敗が環境によるものでないことを示す。SKIP の行が出ても失敗にする）、次に誤りを 1 つずつ入れて、終了コード 0 以外で終わり、
 * 入れた誤りを指す文（検査が誤りの理由として出す文の一部。別の理由の失敗では合格にしない）を出すことを確かめる。誤りは 1 つ確かめる
 * ごとに元に戻す。写し・ビルドの途中で例外が出ても、そこまでの表と後始末の問題を出してから失敗で終わる。
 *
 * 写し方: `git worktree add --detach` で HEAD の作業ツリーを作り、取り込み中の変更（git status の変更・追加・削除）を写す。
 * 作業ツリーなら、git の履歴とタグを元のリポジトリと共有するので、前の版のタグを読む検査（check-size）も写した先でそのまま動く。
 * node_modules は写さず、ジャンクション（Windows）・シンボリックリンクでつなぐ。dist は写した先でビルドする。
 * 一時ディレクトリの場所は環境変数 TOOL_SELFTEST_DIR で指定できる（Windows のパスの長さの上限に当たらないよう短いパスに。
 * 指定がなければ os.tmpdir()）。終わったら（失敗しても）リンクを先に外してから作業ツリーとディレクトリを消す。リンクを外せなければ
 * （まだ作っていない ENOENT のほかは）、リンクの先まで消えないよう何も消さずに残し、場所を出して失敗にする。最後に、リポジトリの
 * node_modules が残っていることを確かめる。
 *
 * 使い方: node scripts/tool-selftest.ts
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cell, copyEach, errorText } from "./tool-selftest-parts.ts";

const repo = resolve(".");
const parent = process.env["TOOL_SELFTEST_DIR"] || tmpdir();
mkdirSync(parent, { recursive: true });
const work = mkdtempSync(join(parent, "selftest-"));
const copy = join(work, "wt");
const base = join(work, "base");

interface Run {
  readonly status: number | null;
  readonly output: string;
}

const node = (args: readonly string[], cwd = copy): Run => {
  const r = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1 << 28,
    env: { ...process.env },
  });
  return { status: r.status, output: `${r.stdout}\n${r.stderr}` };
};

/** 写した先のファイルを書き換える（元に戻すために、元の中身を覚えておく） */
const saved = new Map<string, string>();
function edit(file: string, change: (text: string) => string): void {
  const path = join(copy, file);
  const text = readFileSync(path, "utf8");
  if (!saved.has(path)) saved.set(path, text);
  const next = change(text);
  if (next === text)
    throw new Error(`${file}: the injection did not change the file (the target text is missing)`);
  writeFileSync(path, next);
}
function restore(): void {
  for (const [path, text] of saved) writeFileSync(path, text);
  saved.clear();
}
/** 最初の一致だけを置き換える（一致しなければ edit が失敗にする） */
const replaceOnce = (from: string | RegExp, to: string) => (text: string) => text.replace(from, to);
/** CHANGELOG の [Unreleased] と今の版（その次の節）の利用者向けの区分の見出しを、区分でない見出しに変える */
const withoutUserFacingSections = (text: string): string => {
  const start = text.indexOf("## [Unreleased]");
  const end = text.indexOf("\n## [", text.indexOf("\n## [", start + 1) + 1);
  return (
    text.slice(0, start) +
    text
      .slice(start, end)
      .replace(/^### (Added|Changed|Fixed|Deprecated|Removed|Data)$/gm, "### Notes") +
    text.slice(end)
  );
};

interface Case {
  /** 検査のスクリプト */
  readonly tool: string;
  /** 入れる誤り */
  readonly name: string;
  readonly args: readonly string[];
  readonly inject: () => void;
  /** 失敗の出力に含まれるべき文（検査が実際に出す文の一部） */
  readonly expect: string;
}

/**
 * 誤りとして入れる文字列。このファイル自身も検査の対象（check-package・check-names は scripts/ も読む）なので、
 * 対照の実行で誤りとして見つからないよう、文字列をつないで作る
 */
const DECISIONS = ["decisions", "md"].join(".");
const MISSING_PATH = ["scripts", "no-such-file.ts"].join("/");
const OLD_KEY = ["closed", "Annual"].join("");
const OLD_SERIES = ["0", "29", "x"].join(".");
const OLD_SERIES_V = ["v0", "29", "X"].join(".");
const OLD_SERIES_MAJOR = ["1", "2", "x"].join(".");
/** 移行ガイドの検索の案内にある、振替の旧名の項目（旧名をそのまま書くと check-names が旧名の残りとして止める） */
const SEARCH_ORIGINAL = ["・`origin", "al:`"].join("");

const benchControl = () => {
  writeFileSync(join(work, "bench-base.json"), JSON.stringify({ isBusinessDay: 100 }));
  writeFileSync(join(work, "bench-head.json"), JSON.stringify({ isBusinessDay: 110 }));
};
const compareArgs = (script: string): string[] => [
  `scripts/${script}`,
  "--base",
  base,
  "--head",
  ".",
  "--base-label",
  "selftest",
];

/** 誤りを入れずに動かす検査（対照の実行）。どれも合格すること */
const TOOLS: Readonly<Record<string, readonly string[]>> = {
  "check-package": ["scripts/check-package.ts"],
  "check-size": ["scripts/check-size.ts"],
  "check-readme-examples": ["scripts/check-readme-examples.ts"],
  "check-names": ["scripts/check-names.ts"],
  "check-claims": ["scripts/check-claims.ts", "--base", base],
  "api-report": ["scripts/api-report.ts"],
  "bench-compare": [
    "scripts/bench-compare.ts",
    join(work, "bench-base.json"),
    join(work, "bench-head.json"),
    "--ratio",
    "2",
  ],
  "result-compare": [...compareArgs("result-compare.ts"), "--scale", "0.05"],
  "data-compare": compareArgs("data-compare.ts"),
};

const CASES: readonly Case[] = [
  {
    tool: "check-package",
    name: "決定の文書の目次と見出しの食い違い",
    args: TOOLS["check-package"]!,
    inject: () => edit("docs/decisions.md", replaceOnce(/^( {2}- 1 番: ).*$/m, "$1（壊した題名）")),
    expect: "the table of contents does not match the headings",
  },
  {
    tool: "check-package",
    name: "決定の文書の章の見出しの直後の、番号のない本文",
    args: TOOLS["check-package"]!,
    inject: () =>
      edit("docs/decisions.md", replaceOnce("\n## 診断\n\n", "\n## 診断\n\n- 番号のない箇条\n\n")),
    expect: "章「診断」の見出しの直後に番号のない本文がある",
  },
  {
    tool: "check-package",
    name: "src のローカル時刻の Date の API",
    args: TOOLS["check-package"]!,
    inject: () =>
      edit("src/core/date.ts", (t) => `${t}\nexport const tzLeak = new Date().getHours();\n`),
    expect: "src/core/date.ts: uses a local-time Date method",
  },
  {
    tool: "check-package",
    name: "src の timeZone を渡さない Intl.DateTimeFormat",
    args: TOOLS["check-package"]!,
    inject: () =>
      edit("src/core/input.ts", replaceOnce("      timeZone,\n", "      hour12: false,\n")),
    expect: "src/core/input.ts: uses Intl.DateTimeFormat without timeZone",
  },
  {
    tool: "check-package",
    name: "src の Date.parse（0.31.1 から、どこにも許さない）",
    args: TOOLS["check-package"]!,
    inject: () =>
      edit(
        "src/core/input.ts",
        (t) => `${t}\nexport const parseLeak = (s: string): number => Date.parse(s);\n`,
      ),
    expect: "src/core/input.ts: uses Date.parse 1 time(s)",
  },
  {
    tool: "check-package",
    name: "src の文字列を渡す new Date",
    args: TOOLS["check-package"]!,
    inject: () =>
      edit(
        "src/core/date.ts",
        (t) => `${t}\nexport const tzLeak2 = new Date("2026-01-01T00:00");\n`,
      ),
    expect: "src/core/date.ts: uses new Date(string)",
  },
  {
    tool: "check-package",
    name: "存在しない決定の番号",
    args: TOOLS["check-package"]!,
    inject: () => edit("RELEASING.md", (t) => `${t}\n（${DECISIONS} の 999 番）\n`),
    expect: "refers to decision 999, which docs/decisions.md does not have",
  },
  {
    tool: "check-package",
    name: "「番」の書き忘れ",
    args: TOOLS["check-package"]!,
    inject: () => edit("RELEASING.md", (t) => `${t}\n（${DECISIONS} の 36）\n`),
    expect: 'write the decision reference as "decisions.md の 36 番"',
  },
  {
    tool: "check-package",
    name: "存在しないファイルのパス",
    args: TOOLS["check-package"]!,
    inject: () => edit("RELEASING.md", (t) => `${t}\n（${MISSING_PATH} を参照）\n`),
    expect: `refers to ${MISSING_PATH}, which does not exist`,
  },
  {
    tool: "check-size",
    name: "開発の記録の測定値の不一致",
    args: TOOLS["check-size"]!,
    // 0.31.0 から、測定値は開発の記録（docs/development-log.md）に書く（scripts/release-sections.ts）
    inject: () =>
      edit(
        "docs/development-log.md",
        replaceOnce("\n## [Unreleased]\n", "\n## [Unreleased]\n\n- `./jp` のサイズ（測定 1）\n"),
      ),
    expect: "CHANGELOG states 測定 1 for ./jp",
  },
  {
    tool: "check-size",
    name: "上限を数値の決まりの外で上げた（残りが 1% 以上のエントリーを上げる）",
    args: TOOLS["check-size"]!,
    inject: () => edit("size-limits.json", replaceOnce(/(?<key>"\.\/uk"\s*:\s*)\d+/, "$<key>9999")),
    expect: "a limit may be raised only when the headroom under the previous limit is below 1%",
  },
  {
    tool: "check-size",
    name: "上限を上げたのに「サイズの上限」の記載がない",
    args: TOOLS["check-size"]!,
    // この版の CHANGELOG に「サイズの上限」の記載がすでにある（上限を正しく上げた版）ときも誤りになるよう、その記載も消す
    inject: () => {
      edit("size-limits.json", replaceOnce(/(?<key>"\.\/uk"\s*:\s*)\d+/, "$<key>9999"));
      // この版の節（[Unreleased] の次の、最初の版の見出しから次の見出しの前まで）。CHANGELOG と開発の記録の両方
      for (const file of ["CHANGELOG.md", "docs/development-log.md"]) {
        const text = readFileSync(join(copy, file), "utf8");
        const start = text.indexOf("\n## [", text.indexOf("\n## [") + 1);
        const end = text.indexOf("\n## [", start + 1);
        if (start >= 0 && text.slice(start, end).includes("サイズの上限"))
          edit(
            file,
            (t) =>
              t.slice(0, start) +
              t.slice(start, end).replaceAll("サイズの上限", "サイズ") +
              t.slice(end),
          );
      }
    },
    expect: 'has no entry mentioning "サイズの上限"',
  },
  {
    tool: "check-readme-examples",
    name: "例の結果の不一致",
    args: TOOLS["check-readme-examples"]!,
    inject: () =>
      edit(
        "README.md",
        replaceOnce(
          'calendar.addBusinessDays("2026-12-28", 1); // "2027-01-04"',
          'calendar.addBusinessDays("2026-12-28", 1); // "2027-01-05"',
        ),
      ),
    expect: 'expected "2027-01-05"',
  },
  {
    tool: "check-names",
    name: "0.30.0 の旧名の残り（C14）",
    args: TOOLS["check-names"]!,
    inject: () =>
      edit("docs/guide.md", (t) => t.replace("\n\n", `\n\nUse \`{ ${OLD_KEY}: [] }\` here.\n\n`)),
    expect: `旧名 ${OLD_KEY}: が残っている`,
  },
  {
    tool: "check-claims",
    name: "今の版より前のマイナー系列を指す語",
    args: TOOLS["check-claims"]!,
    inject: () => edit("SECURITY.md", (t) => `${t}\nSupported since ${OLD_SERIES}.\n`),
    expect: "refers to a minor series before",
  },
  {
    tool: "check-claims",
    name: "診断の対象外の旧名が移行ガイドの検索の案内にない",
    args: TOOLS["check-claims"]!,
    inject: () => edit("docs/migration.md", replaceOnce(SEARCH_ORIGINAL, "")),
    expect: 'the renamed key "original" is not diagnosed',
  },
  {
    tool: "check-claims",
    name: "前に v が付き、大文字の X で書いた前のマイナー系列",
    args: TOOLS["check-claims"]!,
    inject: () => edit("SECURITY.md", (t) => `${t}\nSupported since ${OLD_SERIES_V}.\n`),
    expect: `"${OLD_SERIES_V}" refers to a minor series before`,
  },
  {
    tool: "check-claims",
    name: "メジャーの違う前の系列（今の版を 1.3.0 にして 1.2.x を書く）",
    args: TOOLS["check-claims"]!,
    inject: () => {
      edit("package.json", replaceOnce(/"version": "[^"]+"/, '"version": "1.3.0"'));
      edit("SECURITY.md", (t) => `${t}\nSupported since ${OLD_SERIES_MAJOR}.\n`);
    },
    expect: `"${OLD_SERIES_MAJOR}" refers to a minor series before 1.3.0`,
  },
  {
    tool: "check-claims",
    name: "dist の .js が変わったのに CHANGELOG の今の版と [Unreleased] に利用者向けの区分がない",
    args: TOOLS["check-claims"]!,
    inject: () => {
      edit("dist/core/month.js", (t) => `${t}\n// injected\n`);
      edit("CHANGELOG.md", withoutUserFacingSections);
    },
    expect: "has a user-facing section",
  },
  {
    tool: "check-claims",
    name: "dist の .d.ts の型だけが変わったのに CHANGELOG の今の版と [Unreleased] に利用者向けの区分がない",
    args: TOOLS["check-claims"]!,
    inject: () => {
      edit(
        "dist/core/month.d.ts",
        replaceOnce("export type MonthString = string;", "export type MonthString = number;"),
      );
      edit("CHANGELOG.md", withoutUserFacingSections);
    },
    expect: "has a user-facing section",
  },
  {
    tool: "api-report",
    name: "公開 API と etc/api.md の不一致",
    args: TOOLS["api-report"]!,
    inject: () => edit("etc/api.md", replaceOnce(/readonly (\w+)/, "readonly $1Injected")),
    expect: "The public API differs from",
  },
  {
    tool: "bench-compare",
    name: "比率が上限を超えた計測",
    args: TOOLS["bench-compare"]!,
    inject: () =>
      writeFileSync(join(work, "bench-head.json"), JSON.stringify({ isBusinessDay: 300 })),
    expect: "3.00x ❌",
  },
  {
    tool: "result-compare",
    name: "許していない差分（ビルド済みの dist の判定の曜日を 1 日ずらす）",
    args: TOOLS["result-compare"]!,
    inject: () =>
      edit(
        "dist/core/schedule.js",
        replaceOnce(
          "const weekday = weekdayOf(date);",
          "const weekday = (weekdayOf(date) + 1) % 7;",
        ),
      ),
    expect: "**失敗**（意図した変更なら",
  },
  {
    tool: "data-compare",
    name: "許していない祝日のデータの差分（ビルド済みの dist の祝日の名前を 1 つ変える）",
    args: TOOLS["data-compare"]!,
    inject: () => edit("dist/jp/rules.js", replaceOnce('"元日"', '"元日（壊した名前）"')),
    expect: "「### Data」がない",
  },
];

const git = (args: readonly string[], cwd = repo): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" });
let failed = false;
const rows: string[] = [];
/** 写した取り込み中の変更（写すたびに足す。途中で例外が出ても、そこまでに写したものを表の後に出す） */
const copied: string[] = [];
/** 写しを始めたか（始めていなければ、写した変更の行を出さない） */
let copyStarted = false;
/** 後始末の問題（リンクを外せない・作業ツリーを外せない・リポジトリの node_modules が消えた） */
const cleanupProblems: string[] = [];
/** 作ったもの（後始末で外すもの） */
let worktreeAdded = false;
let linked = false;
try {
  // 1. 写しを作る（HEAD の作業ツリー + 取り込み中の変更）
  git(["worktree", "add", "--detach", "--quiet", copy, "HEAD"]);
  worktreeAdded = true;
  // -z で読む（日本語やスペースを含むパスが引用符付き・エスケープ付きで出ず、そのまま読める。項目は NUL で区切られる）
  const changed = git(["status", "--porcelain=v1", "-z", "-uall", "--no-renames"])
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3))
    .filter((file) => !file.startsWith("node_modules/") && !file.startsWith("dist/"));
  copyStarted = true;
  copyEach(
    changed,
    (file) => {
      const from = join(repo, file);
      const to = join(copy, file);
      if (existsSync(from)) {
        mkdirSync(dirname(to), { recursive: true });
        cpSync(from, to);
      } else rmSync(to, { force: true });
    },
    copied,
  );
  symlinkSync(join(repo, "node_modules"), join(copy, "node_modules"), "junction");
  linked = true;
  // 2. 写した先でビルドする（package.json の build と同じ）
  const tsc = join(copy, "node_modules/typescript/bin/tsc");
  for (const extra of [["--removeComments"], ["--emitDeclarationOnly"]]) {
    const r = node([tsc, "-p", "tsconfig.build.json", ...extra]);
    if (r.status !== 0) throw new Error(`build failed in the copy:\n${r.output.slice(-2000)}`);
  }
  // 比べる相手の版（result-compare・data-compare）は、誤りを入れる前の写しのビルド
  mkdirSync(base);
  cpSync(join(copy, "dist"), join(base, "dist"), { recursive: true });
  cpSync(join(copy, "package.json"), join(base, "package.json"));
  benchControl();

  // 3. 対照の実行（誤りを入れずに、すべて合格する）
  for (const [tool, args] of Object.entries(TOOLS)) {
    const started = Date.now();
    const r = node(args);
    // 対照は、どの検査も飛ばさずに合格することを確かめる（SKIP の行が出れば失敗）。2 つ目の形（skipped に括弧が続く行）は、
    // 今の 9 つの検査は出さないが、将来、対照にブラウザー・workerd の検査（飛ばした検査をこの形で出す）を加えたときのために見る
    const skipped = r.output.split("\n").filter((l) => /\bSKIP\b|skipped \(/.test(l));
    const ok = r.status === 0 && skipped.length === 0;
    if (!ok) failed = true;
    const why =
      r.status !== 0
        ? r.output.trim().split("\n").slice(-3).join(" / ").slice(0, 200)
        : `対照で飛ばした: ${skipped.join(" / ").slice(0, 200)}`;
    rows.push(
      `| ${cell(tool)} | （対照: 誤りなし） | ${r.status} | ${ok ? "合格" : `**失敗**: ${cell(why)}`} | ${Math.round((Date.now() - started) / 1000)}s |`,
    );
  }

  // 4. 誤りを 1 つずつ入れて、失敗することと、入れた誤りを指す文を確かめる
  for (const c of CASES) {
    const started = Date.now();
    let ok = false;
    let note = "";
    try {
      c.inject();
      const r = node(c.args);
      ok = r.status !== 0 && r.status !== null && r.output.includes(c.expect);
      note = ok
        ? `終了コード ${r.status}、「${c.expect}」を出した`
        : `**期待と違う**（終了コード ${r.status}、「${c.expect}」${r.output.includes(c.expect) ? "あり" : "なし"}）: ${r.output.trim().split("\n").slice(-3).join(" / ").slice(0, 200)}`;
    } catch (error) {
      note = `**注入できない**: ${errorText(error)}`;
    } finally {
      restore();
      benchControl();
    }
    if (!ok) failed = true;
    rows.push(
      `| ${cell(c.tool)} | ${cell(c.name)} | ${ok ? "≠ 0" : "—"} | ${cell(note)} | ${Math.round((Date.now() - started) / 1000)}s |`,
    );
  }
} catch (error) {
  // 写し・ビルドなどの途中の例外でも、そこまでの表と後始末の問題を出してから失敗で終わる
  failed = true;
  rows.push(
    `| （途中の例外） | — | — | **失敗**: ${cell(errorText(error).split("\n").slice(0, 3).join(" / ").slice(0, 300))} | — |`,
  );
} finally {
  // リンクを先に外す（ジャンクションの先の node_modules を消さないため）。外せなかったら（まだ作っていない ENOENT のほかは）、
  // 作業ツリーと一時ディレクトリを消さずに残し、場所を出して失敗にする（消すとリンクの先まで消えるおそれがある）
  if (linked) {
    try {
      unlinkSync(join(copy, "node_modules"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        cleanupProblems.push(
          `node_modules のリンクを外せない（作業ツリーと一時ディレクトリは消さずに残した。リンクを外してから手で消す）: ${join(copy, "node_modules")}: ${errorText(error)}`,
        );
    }
  }
  if (cleanupProblems.length === 0) {
    if (worktreeAdded) {
      try {
        git(["worktree", "remove", "--force", copy]);
      } catch (error) {
        cleanupProblems.push(`作業ツリーを外せない: ${copy}: ${errorText(error)}`);
      }
    }
    if (cleanupProblems.length === 0) {
      rmSync(work, { recursive: true, force: true });
      git(["worktree", "prune"]);
    }
  }
  // リポジトリの node_modules が残っている（リンクの先を消していない）
  if (!existsSync(join(repo, "node_modules/typescript/bin/tsc")))
    cleanupProblems.push(
      "リポジトリの node_modules/typescript/bin/tsc がない（リンクの先が消えた。pnpm install で戻す）",
    );
}

console.log("## 検査のスクリプトの検査\n");
console.log("| 検査 | 入れた誤り | 終了コード | 結果 | 時間 |\n| --- | --- | --- | --- | --- |");
console.log(rows.join("\n"));
if (copyStarted)
  console.log(
    `\n写した取り込み中の変更: ${copied.length} 件${copied.length > 0 ? `（${copied.join("、")}）` : ""}`,
  );
console.log(`\n一時ディレクトリ: ${existsSync(work) ? `**残っている**: ${work}` : "消えた"}`);
if (existsSync(work)) failed = true;
if (cleanupProblems.length > 0) {
  failed = true;
  console.log(`\n後始末の問題:\n\n- ${cleanupProblems.join("\n- ")}`);
}
console.log(
  failed
    ? "\n**失敗**"
    : "\n**合格**（対照はすべて合格し、入れた誤りはすべて失敗として見つかった）",
);
process.exitCode = failed ? 1 : 0;
