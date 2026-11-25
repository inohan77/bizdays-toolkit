import "./strict-warnings.ts";
/**
 * The check of the checking scripts themselves (T3 of the test expansion plan; the tool-selftest job of CI; not
 * part of pnpm check).
 *
 * Makes a copy of the repository in a temporary directory and runs the checking scripts there. First they run
 * without a mistake and must pass (the control run, which shows that a failure does not come from the
 * environment; a SKIP line fails too); then one mistake at a time is injected, and the script must end with a
 * non-zero exit code and print the text that points at the injected mistake (part of the text the check prints
 * as the reason; a failure for another reason does not pass). Each mistake is undone after it is checked. When
 * an error occurs while copying or building, the table so far and the cleanup problems are printed before
 * ending with a failure.
 *
 * How the copy is made: `git worktree add --detach` creates a work tree of HEAD, and the changes being taken in
 * (modified, added and deleted files of git status) are copied. A work tree shares the git history and tags with
 * the original repository, so a check that reads the previous version's tag (check-size) works in the copy as
 * it is. node_modules is not copied but linked with a junction (Windows) or a symbolic link. dist is built in
 * the copy.
 * The place of the temporary directory can be given with the environment variable TOOL_SELFTEST_DIR (a short
 * path, to stay under the path length limit of Windows; os.tmpdir() by default). At the end (also after a
 * failure) the link is removed first, then the work tree and the directory. When the link cannot be removed
 * (other than ENOENT, not created yet), nothing is deleted, so that the target of the link survives; the place
 * is printed and the run fails. Finally it checks that node_modules of the repository still exists.
 *
 * Usage: node scripts/tool-selftest.ts
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

/** Rewrites a file of the copy (the original content is remembered for undoing) */
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
/** Replaces the first match only (edit fails when nothing matches) */
const replaceOnce = (from: string | RegExp, to: string) => (text: string) => text.replace(from, to);
/**
 * Turns the user-facing category headings of [Unreleased] and the current version (the next section) of the
 * CHANGELOG into headings that are not categories
 */
const withoutUserFacingSections = (text: string): string => {
  const start = text.indexOf("## [Unreleased]");
  const end = text.indexOf("\n## [", text.indexOf("\n## [", start + 1) + 1);
  return (
    text.slice(0, start) +
    text
      .slice(start, end)
      .replace(/^### (Added|Changed|Fixed|Deprecated|Removed|Data|Security)$/gm, "### Notes") +
    text.slice(end)
  );
};

interface Case {
  /** The checking script */
  readonly tool: string;
  /** The mistake injected */
  readonly name: string;
  readonly args: readonly string[];
  readonly inject: () => void;
  /** The text the failure output must contain (part of the text the check really prints) */
  readonly expect: string;
}

/**
 * Strings injected as mistakes. This file itself is examined (check-package and check-names read scripts/ too),
 * so the strings are built by joining parts, so that the control run does not find them as mistakes
 */
const DECISIONS = ["decisions", "md"].join(".");
const MISSING_PATH = ["scripts", "no-such-file.ts"].join("/");
const OLD_KEY = ["closed", "Annual"].join("");
const OLD_SERIES = ["0", "29", "x"].join(".");
const OLD_SERIES_V = ["v0", "29", "X"].join(".");
const OLD_SERIES_MAJOR = ["1", "2", "x"].join(".");
/**
 * The old-name property of substitution in the search guidance of the migration guide (written as it is,
 * check-names would stop it as an old name left behind)
 */
const SEARCH_ORIGINAL = ["・`origin", "al:`"].join("");

const benchControl = () => {
  writeFileSync(join(work, "bench-base.json"), JSON.stringify({ isBusinessDay: 100 }));
  writeFileSync(join(work, "bench-head.json"), JSON.stringify({ isBusinessDay: 110 }));
};
/** Injects a measurement whose ratio exceeds the limit (3x) and adds one line to [Unreleased] of the development log */
const benchExceededWith = (line: string) => () => {
  writeFileSync(join(work, "bench-head.json"), JSON.stringify({ isBusinessDay: 300 }));
  edit("docs/development-log.md", replaceOnce("## [Unreleased]\n", `## [Unreleased]\n\n${line}\n`));
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

/** The checks run without a mistake (the control run). All must pass */
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
  "check-unit-tests": ["scripts/check-unit-tests.ts"],
  "promise-dimensions": ["scripts/promise-inventory.ts", "--dimensions"],
  "check-unverified": ["scripts/check-unverified.ts"],
};

/** The first line of a function of src that has a unit test, and its unit test file (targets of injections) */
const UNIT_TESTED_HEAD = "export function editDistance(a: string, b: string): number {\n";
const UNIT_TEST_FILE = "test/unit/core/diagnose-compare.test.ts";
/** Rewrites the table of the unit tests */
const editUnitTable = (change: (table: Record<string, Record<string, unknown>>) => void): void =>
  edit("etc/unit-tests.json", (t) => {
    const table = JSON.parse(t) as Record<string, Record<string, unknown>>;
    change(table);
    return JSON.stringify(table, null, 2);
  });

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
    // From 0.31.0 the measured values are written in the development log (docs/development-log.md;
    // scripts/release-sections.ts)
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
    // The note on the size limit is removed too, so that this is a mistake even when the CHANGELOG of this
    // version already has one (a version that raised a limit correctly)
    inject: () => {
      edit("size-limits.json", replaceOnce(/(?<key>"\.\/uk"\s*:\s*)\d+/, "$<key>9999"));
      // The section of this version (from the first version heading after [Unreleased] to before the next
      // heading), in both the CHANGELOG and the development log
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
    tool: "check-size",
    name: "上限を上げたのに README のサイズの値を測り直していない",
    args: TOOLS["check-size"]!,
    // Sets the "measured for" version of the README to the previous version (the form of 0.31.5 and
    // 0.32.5-0.32.7, which raised a limit without re-measuring)
    inject: () => {
      edit("size-limits.json", replaceOnce(/(?<key>"\.\/uk"\s*:\s*)\d+/, "$<key>9999"));
      edit("README.md", replaceOnce(/measured for \d+\.\d+\.\d+/, "measured for 0.1.0"));
    },
    expect: "README.md states sizes measured for 0.1.0",
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
    name: "今のバージョンより前のマイナー系列を指す語",
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
    name: "メジャーの違う前の系列（今のバージョンを 1.3.0 にして 1.2.x を書く）",
    args: TOOLS["check-claims"]!,
    inject: () => {
      edit("package.json", replaceOnce(/"version": "[^"]+"/, '"version": "1.3.0"'));
      edit("SECURITY.md", (t) => `${t}\nSupported since ${OLD_SERIES_MAJOR}.\n`);
    },
    expect: `"${OLD_SERIES_MAJOR}" refers to a minor series before 1.3.0`,
  },
  {
    tool: "check-claims",
    name: "dist の .js が変わったのに CHANGELOG の今のバージョンと [Unreleased] に利用者向けの区分がない",
    args: TOOLS["check-claims"]!,
    inject: () => {
      edit("dist/core/month.js", (t) => `${t}\n// injected\n`);
      edit("CHANGELOG.md", withoutUserFacingSections);
    },
    expect: "has no user-facing section",
  },
  {
    tool: "check-claims",
    name: "dist の .d.ts の型だけが変わったのに CHANGELOG の今のバージョンと [Unreleased] に利用者向けの区分がない",
    args: TOOLS["check-claims"]!,
    inject: () => {
      edit(
        "dist/core/month.d.ts",
        replaceOnce("export type MonthString = string;", "export type MonthString = number;"),
      );
      edit("CHANGELOG.md", withoutUserFacingSections);
    },
    expect: "has no user-facing section",
  },
  {
    tool: "check-claims",
    name: "バージョンを上げたのに、dist の .js が変わり、CHANGELOG の今のバージョンと [Unreleased] に利用者向けの区分がない（リリースの時の形）",
    args: TOOLS["check-claims"]!,
    inject: () => {
      // The version compared stays the one the copy was made from, so the section of the current version goes
      // through the counting side too
      edit("package.json", replaceOnce(/"version": "[^"]+"/, '"version": "99.0.0"'));
      edit("dist/core/month.js", (t) => `${t}\n// injected\n`);
      edit("CHANGELOG.md", withoutUserFacingSections);
    },
    expect: "neither [Unreleased] nor the 99.0.0 section has a user-facing section",
  },
  {
    tool: "check-claims",
    name: "dist の .d.ts の型の説明だけが変わったのに CHANGELOG の今のバージョンと [Unreleased] に利用者向けの区分がない",
    args: TOOLS["check-claims"]!,
    inject: () => {
      edit(
        "dist/core/month.d.ts",
        replaceOnce(
          "export type MonthString = string;",
          "/** injected description */\nexport type MonthString = string;",
        ),
      );
      edit("CHANGELOG.md", withoutUserFacingSections);
    },
    expect: "has no user-facing section",
  },
  {
    tool: "check-claims",
    name: "RELEASING.md の「1.0.0 で行う作業」を指さない、1.0.0 の作業のコメント",
    args: TOOLS["check-claims"]!,
    inject: () =>
      edit("scripts/check-size.ts", (t) => `${t}\n// injected: この検査は 1.0.0 で外す\n`),
    expect: "work for 1.0.0 that does not point to RELEASING.md",
  },
  {
    tool: "check-claims",
    name: "RELEASING.md の「1.0.0 で行う作業」を指さない、1.0.0 の作業のコメント（英語）",
    args: TOOLS["check-claims"]!,
    inject: () =>
      edit("scripts/check-size.ts", (t) => `${t}\n// injected: this check is removed in 1.0.0.\n`),
    expect: "work for 1.0.0 that does not point to RELEASING.md",
  },
  {
    tool: "check-claims",
    name: "文書の「バージョン」を旧い用語で書いた",
    args: TOOLS["check-claims"]!,
    inject: () => edit("docs/migration.md", (t) => `${t}\n前の\u7248から移る手順\n`),
    expect: 'write "バージョン"',
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
    tool: "bench-compare",
    name: "上限を超えた計測があり、開発の記録に「性能の退行」の言葉だけがある（許可の行の形でない）",
    args: TOOLS["bench-compare"]!,
    inject: benchExceededWith(
      "- 性能の退行: 前のバージョンと比べて速くなった（`isBusinessDay` は 0.25 倍）",
    ),
    expect: "isBusinessDay 3.00x (no allowance line)",
  },
  {
    tool: "bench-compare",
    name: "上限を超えた計測の比率が、許可の行の倍率を超える",
    args: TOOLS["bench-compare"]!,
    inject: benchExceededWith("- 性能の退行: isBusinessDay は 2.5x まで受け入れる（自己検査）"),
    expect: "isBusinessDay 3.00x (allowed up to 2.5x)",
  },
  {
    tool: "bench-compare",
    name: "上限を超えた計測と、許可の行の計測の名前が違う",
    args: TOOLS["bench-compare"]!,
    inject: benchExceededWith("- 性能の退行: valueOn は 5x まで受け入れる（自己検査）"),
    expect: "isBusinessDay 3.00x (no allowance line)",
  },
  {
    tool: "result-compare",
    name: "許していない差分（ビルド済みの dist の判定の曜日を 1 日ずらす）",
    args: TOOLS["result-compare"]!,
    inject: () =>
      edit(
        "dist/core/schedule.js",
        // The line of the weekday of the judgement (from 0.32.7, weekdayOfDate, which goes through the day-number
        // memo)
        replaceOnce(
          "const weekday = weekdayOfDate(date);",
          "const weekday = (weekdayOfDate(date) + 1) % 7;",
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
  {
    tool: "check-claims",
    name: "設定の項目が、決定の番号の一覧にない",
    args: TOOLS["check-claims"]!,
    inject: () =>
      edit("etc/option-decisions.json", (t) =>
        t.replace('  "CalendarOptions.closedDates": 11,\n', ""),
      ),
    expect: "CalendarOptions.closedDates is not listed",
  },
  {
    tool: "check-claims",
    name: "設定の項目の指す決定に、項目の名前がない",
    args: TOOLS["check-claims"]!,
    inject: () =>
      edit("etc/option-decisions.json", (t) =>
        t.replace('"CalendarOptions.closedDates": 11,', '"CalendarOptions.closedDates": 21,'),
      ),
    expect: "CalendarOptions.closedDates points to decision 21, but that decision does not mention",
  },
  {
    tool: "check-claims",
    name: "決定の番号の一覧に、公開の型にない項目がある",
    args: TOOLS["check-claims"]!,
    inject: () =>
      edit("etc/option-decisions.json", (t) =>
        t.replace("{\n", '{\n  "CalendarOptions.noSuchOption": 11,\n'),
      ),
    expect: "CalendarOptions.noSuchOption is listed, but it is not an option",
  },
  {
    tool: "check-claims",
    name: "公開の名前が、決定の文書にも理由を書かない一覧にもない",
    args: TOOLS["check-claims"]!,
    inject: () =>
      edit("etc/undocumented-names.json", (t) => t.replace(/  "isLeapYear": "[^"]*",\n/, "")),
    expect: "isLeapYear is public but no decision mentions it",
  },
  {
    tool: "check-claims",
    name: "理由を書かない一覧に、決定の文書に現れる名前がある",
    args: TOOLS["check-claims"]!,
    inject: () =>
      edit("etc/undocumented-names.json", (t) =>
        t.replace("{\n", '{\n  "addBusinessDays": "x",\n'),
      ),
    expect: "addBusinessDays is listed, but a decision mentions it now",
  },
  {
    tool: "check-unit-tests",
    name: "単体テストのない関数を足した（表にもない）",
    args: TOOLS["check-unit-tests"]!,
    inject: () =>
      edit(
        "src/core/diagnose.ts",
        (t) => `${t}\nexport function injected(a: number): number {\n  return a + 1;\n}\n`,
      ),
    expect: "injected has no unit test and is not listed",
  },
  {
    tool: "check-unit-tests",
    name: "describe の名前が関数の名前と違う",
    args: TOOLS["check-unit-tests"]!,
    inject: () =>
      edit(UNIT_TEST_FILE, replaceOnce('describe("editDistance"', 'describe("editDistanceX"')),
    expect: 'describe("editDistanceX") names no function imported from src',
  },
  {
    tool: "check-unit-tests",
    name: "条件の後ろの文が実行されない（中かっこのない if の次の行）",
    args: TOOLS["check-unit-tests"]!,
    inject: () =>
      edit(
        "src/core/diagnose.ts",
        replaceOnce(
          UNIT_TESTED_HEAD,
          `${UNIT_TESTED_HEAD}  if (a === "never-given")\n    return -1;\n`,
        ),
      ),
    expect: "editDistance: lines not executed by the unit tests",
  },
  {
    tool: "check-unit-tests",
    name: "行の一部（?? の右）が実行されない",
    args: TOOLS["check-unit-tests"]!,
    inject: () =>
      edit(
        "src/core/diagnose.ts",
        replaceOnce(UNIT_TESTED_HEAD, `${UNIT_TESTED_HEAD}  void (a ?? "never-given");\n`),
      ),
    expect: "only in part; not executed: ??",
  },
  {
    tool: "check-unit-tests",
    name: "届かない行の表に、実行される行がある",
    args: TOOLS["check-unit-tests"]!,
    inject: () =>
      editUnitTable((table) => {
        table["unreachable"]!["src/core/diagnose.ts#editDistance"] = [
          { code: "return d[a.length]![b.length]!;", reason: "injected" },
        ];
      }),
    expect: "is executed or does not exist: return d[a.length]![b.length]!;",
  },
  {
    tool: "check-unit-tests",
    name: "単体テストのある関数が「これから書く」の表に残っている",
    args: TOOLS["check-unit-tests"]!,
    inject: () =>
      editUnitTable((table) => {
        table["pending"]!["src/core/diagnose.ts"] = ["editDistance"];
      }),
    expect: "editDistance is listed but has a unit test",
  },
  {
    tool: "check-unit-tests",
    name: "単体テストが失敗する",
    args: TOOLS["check-unit-tests"]!,
    inject: () =>
      edit(
        UNIT_TEST_FILE,
        replaceOnce(
          'assert.equal(editDistance("", ""), 0);',
          'assert.equal(editDistance("", ""), 1);',
        ),
      ),
    expect: "did not pass",
  },
  {
    tool: "promise-dimensions",
    name: "棚卸しの生成器から、対応年が診断の範囲の外の提供元を外した",
    args: TOOLS["promise-dimensions"]!,
    inject: () =>
      edit(
        "scripts/promise-inventory.ts",
        replaceOnce(
          '  ["custom 2200-2300", () => custom("O", 2200, 2300), { from: 2200, to: 2300 }],\n',
          "",
        ),
      ),
    expect: "no options were made for the cell: calendar | outside",
  },
  {
    tool: "promise-dimensions",
    name: "次元の表で外した組を、生成器が作っている",
    args: TOOLS["promise-dimensions"]!,
    inject: () =>
      edit(
        "etc/promise-dimensions.json",
        replaceOnce(
          '"excluded": {}',
          '"excluded": { "calendar | none | - | counting rule | inside": "injected" }',
        ),
      ),
    expect: "excluded cell was made",
  },
  {
    tool: "check-unverified",
    name: "確かめていないことの表に、状態が open の行がある",
    args: TOOLS["check-unverified"]!,
    inject: () =>
      edit("etc/unverified.json", replaceOnce('"state": "verified"', '"state": "open"')),
    expect: "U1: OPEN",
  },
];

const git = (args: readonly string[], cwd = repo): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" });
let failed = false;
const rows: string[] = [];
/**
 * The copied changes being taken in (added as each is copied; when an error occurs on the way, those copied so
 * far are printed after the table)
 */
const copied: string[] = [];
/** Whether copying started (if not, the line of copied changes is not printed) */
let copyStarted = false;
/**
 * Cleanup problems (the link cannot be removed, the work tree cannot be removed, node_modules of the repository
 * disappeared)
 */
const cleanupProblems: string[] = [];
/** What was created (removed by the cleanup) */
let worktreeAdded = false;
let linked = false;
try {
  // 1. Make the copy (a work tree of HEAD plus the changes being taken in)
  git(["worktree", "add", "--detach", "--quiet", copy, "HEAD"]);
  worktreeAdded = true;
  // Read with -z (paths with Japanese characters or spaces come unquoted and unescaped; entries are separated
  // by NUL)
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
  // 2. Build in the copy (as `build` of package.json)
  const tsc = join(copy, "node_modules/typescript/bin/tsc");
  for (const extra of [["--removeComments"], ["--emitDeclarationOnly"]]) {
    const r = node([tsc, "-p", "tsconfig.build.json", ...extra]);
    if (r.status !== 0) throw new Error(`build failed in the copy:\n${r.output.slice(-2000)}`);
  }
  // The version compared with (result-compare, data-compare) is the build of the copy before any mistake
  mkdirSync(base);
  cpSync(join(copy, "dist"), join(base, "dist"), { recursive: true });
  cpSync(join(copy, "package.json"), join(base, "package.json"));
  benchControl();

  // 3. The control run (everything passes without a mistake)
  for (const [tool, args] of Object.entries(TOOLS)) {
    const started = Date.now();
    const r = node(args);
    // The control run checks that every check passes without skipping (a SKIP line fails). The second form (a
    // line with "skipped" followed by a parenthesis) is not printed by the current checks; it is examined
    // for the day the browser and workerd checks, which print skipped checks in this form, join the control run
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

  // 4. Inject one mistake at a time and check the failure and the text pointing at the mistake
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
  // Also after an error while copying, building or the like, the table so far and the cleanup problems are
  // printed before ending with a failure
  failed = true;
  rows.push(
    `| （途中の例外） | — | — | **失敗**: ${cell(errorText(error).split("\n").slice(0, 3).join(" / ").slice(0, 300))} | — |`,
  );
} finally {
  // The link is removed first (so that node_modules behind the junction is not deleted). When it cannot be
  // removed (other than ENOENT, not created yet), the work tree and the temporary directory are left, the place
  // is printed and the run fails (deleting could delete the target of the link)
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
  // node_modules of the repository still exists (the target of the link was not deleted)
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
