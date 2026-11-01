import "./strict-warnings.ts";
/**
 * src/core の catch 節が、テストで 1 回以上通ることを確かめる（テスト拡充案の T3。CI の catch-coverage ジョブ）。
 *
 * 1. Node.js の組み込みのカバレッジでテストを動かし、lcov を作る（--lcov <file> を渡せば、その lcov を使う）
 * 2. TypeScript のコンパイラーの API で src/core/*.ts の catch 節を見つけ、節の中の文の行が lcov で 1 回以上通ったかを見る
 * 3. 通らない catch 節は、理由付きの除外の一覧（EXCLUDED。「ファイル・関数・節の中の最初の文」で引く。行がずれても壊れない）に
 *    載せない限り失敗にする。除外の一覧にあるのに見つからない・通っている項目も、古い除外として失敗にする
 *
 * 4. 除外の一覧の名前（ファイル・関数・節の中の最初の文）が 2 つ以上の catch 節で重なれば失敗にする（片方だけを除外しようとして
 *    両方が外れるのを防ぐ）。catch 節の文が try と同じ行にあれば、lcov は行で数えるので到達を判定できず、失敗にする
 *
 * 全体のカバレッジの率は目標にしないので出さない。結果は標準出力（CI では Job Summary）に表で出す。
 * --lcov <file> は検査そのものを試すための引数で（作った lcov を渡して、テストを動かさずに判定だけを試す）、CI は使わない。
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

/** 通らなくてよい catch 節と、その理由（"ファイル|関数|節の中の最初の文" → 理由）。足すときは判断を仰ぐ */
export const EXCLUDED: Readonly<Record<string, string>> = {};

const root = resolve(".");
const args = process.argv.slice(2);
const lcovArg = args.indexOf("--lcov") >= 0 ? args[args.indexOf("--lcov") + 1] : undefined;

/** lcov の行ごとの通過回数（ファイルの相対パス → 行 → 回数） */
function readLcov(text: string): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  let current: Map<number, number> | undefined;
  for (const line of text.split("\n")) {
    if (line.startsWith("SF:")) {
      current = new Map();
      out.set(relative(root, line.slice(3).trim()).replaceAll("\\", "/"), current);
    } else if (line.startsWith("DA:") && current) {
      const [n, count] = line.slice(3).split(",");
      current.set(Number(n), Number(count));
    }
  }
  return out;
}

interface CatchClause {
  readonly file: string;
  readonly fn: string;
  readonly first: string;
  readonly line: number;
  /** 節の中の文の行（1 始まり） */
  readonly lines: readonly number[];
  /** catch 節の文が try の行（try の文・try の中の文）と同じ行にあるか（行で数える lcov では判定できない） */
  readonly sameLineAsTry: boolean;
}

/** 節を囲む関数の名前（関数の宣言・メソッド・変数に入れた関数。なければ "(top)"） */
function enclosingName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name)
      return n.name.getText();
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent))
      return n.parent.name.getText();
  }
  return "(top)";
}

function findCatches(): CatchClause[] {
  const out: CatchClause[] = [];
  const dir = join(root, "src/core");
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .sort()) {
    const path = join(dir, name);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isCatchClause(node)) {
        const lineOf = (pos: number) => source.getLineAndCharacterOfPosition(pos).line + 1;
        const statements = node.block.statements;
        const lines = statements.flatMap((s) => {
          const a = lineOf(s.getStart(source));
          const b = lineOf(s.getEnd());
          return Array.from({ length: b - a + 1 }, (_, i) => a + i);
        });
        const tryStatement = node.parent as ts.TryStatement;
        const tryLines = new Set<number>([
          lineOf(tryStatement.getStart(source)),
          ...tryStatement.tryBlock.statements.map((s) => lineOf(s.getEnd())),
          lineOf(tryStatement.tryBlock.getEnd()),
        ]);
        out.push({
          file: `src/core/${name}`,
          sameLineAsTry: lines.some((n) => tryLines.has(n)),
          fn: enclosingName(node),
          first: statements[0]
            ? statements[0].getText(source).replace(/\s+/g, " ").slice(0, 80)
            : "(empty)",
          line: lineOf(node.getStart(source)),
          lines,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

const work = mkdtempSync(join(tmpdir(), "catch-coverage-"));
try {
  let lcovText: string;
  if (lcovArg !== undefined) lcovText = readFileSync(lcovArg, "utf8");
  else {
    const lcovPath = join(work, "lcov.info");
    const tests = readdirSync(join(root, "test"))
      .filter((f) => f.endsWith(".test.ts"))
      .map((f) => `test/${f}`);
    const r = spawnSync(
      process.execPath,
      [
        "--experimental-test-coverage",
        "--test-reporter=lcov",
        `--test-reporter-destination=${lcovPath}`,
        "--test",
        ...tests,
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 },
    );
    if (r.status !== 0) {
      console.error(r.stdout.slice(-3000), r.stderr.slice(-3000));
      throw new Error(`the tests failed under coverage (exit ${r.status})`);
    }
    lcovText = readFileSync(lcovPath, "utf8");
  }
  const lcov = readLcov(lcovText);
  const catches = findCatches();
  if (catches.length === 0)
    throw new Error("no catch clause found in src/core (the parser is broken?)");
  const rows: string[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const keyCount = new Map<string, number>();
  for (const c of catches)
    keyCount.set(
      `${c.file}|${c.fn}|${c.first}`,
      (keyCount.get(`${c.file}|${c.fn}|${c.first}`) ?? 0) + 1,
    );
  for (const c of catches) {
    const key = `${c.file}|${c.fn}|${c.first}`;
    seen.add(key);
    if ((keyCount.get(key) ?? 0) > 1)
      problems.push(`名前が重なる（除外の一覧で見分けられない）: ${c.file}:${c.line} ${key}`);
    if (c.sameLineAsTry)
      problems.push(
        `1 行の catch 節は判定できない（文を try と別の行に書く）: ${c.file}:${c.line}`,
      );
    const hits = lcov.get(c.file);
    if (hits === undefined)
      problems.push(`${c.file}: not in the coverage (the file was not loaded by the tests)`);
    const reached = c.lines.some((n) => (hits?.get(n) ?? 0) > 0);
    const excluded = EXCLUDED[key];
    if (!reached && excluded === undefined)
      problems.push(`通らない: ${c.file}:${c.line} ${c.fn}() catch { ${c.first} }`);
    if (reached && excluded !== undefined)
      problems.push(`通るのに除外している（古い除外）: ${key}`);
    rows.push(
      `| ${c.file}:${c.line} | ${c.fn} | \`${c.first.replaceAll("|", "\\|")}\` | ${reached ? "通る" : `通らない（除外: ${excluded ?? "なし"}）`} |`,
    );
  }
  for (const key of Object.keys(EXCLUDED))
    if (!seen.has(key)) problems.push(`除外しているのに見つからない（古い除外）: ${key}`);
  console.log(`## src/core の catch 節の到達（${catches.length} か所）\n`);
  console.log("| 場所 | 関数 | 節の中の最初の文 | 結果 |\n| --- | --- | --- | --- |");
  console.log(rows.join("\n"));
  console.log(
    problems.length > 0 ? `\n**失敗**\n\n- ${problems.join("\n- ")}` : "\n**合格**（すべて通る）",
  );
  process.exitCode = problems.length > 0 ? 1 : 0;
} finally {
  rmSync(work, { recursive: true, force: true });
}
