import "./strict-warnings.ts";
/**
 * Checks that every catch clause of src/core is taken at least once by the tests (T3 of the test expansion
 * plan; the catch-coverage job of CI).
 *
 * 1. Runs the tests with the built-in coverage of Node.js and produces an lcov (with --lcov <file>, that lcov
 *    is used)
 * 2. Finds the catch clauses of src/core/*.ts with the TypeScript compiler API and checks in the lcov whether
 *    the lines of the statements in each clause were executed at least once
 * 3. A catch clause that is not taken fails unless it is in the list of exclusions with a reason (EXCLUDED,
 *    keyed by "file, function, first statement of the clause", which survives shifted lines). An exclusion that
 *    is not found, or whose clause is taken, also fails as a stale exclusion
 *
 * 4. Fails when a key of the exclusion list (file, function, first statement) matches two or more catch clauses
 *    (so that excluding one does not drop both). When a statement of a catch clause is on the same line as the
 *    try, lcov counts by line and cannot tell whether it was reached, so that fails too
 *
 * The overall coverage rate is not a goal and is not printed. The result is a table on standard output (the Job
 * Summary in CI).
 * --lcov <file> is for testing the check itself (pass a made-up lcov to test the judgement without running the
 * tests); CI does not use it.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

/**
 * Catch clauses that need not be taken, with the reason ("file|function|first statement of the clause" →
 * reason). Ask for a decision before adding one
 */
export const EXCLUDED: Readonly<Record<string, string>> = {};

const root = resolve(".");
const args = process.argv.slice(2);
const lcovArg = args.indexOf("--lcov") >= 0 ? args[args.indexOf("--lcov") + 1] : undefined;

/** Execution counts per line of an lcov (relative file path → line → count) */
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
  /** Lines of the statements in the clause (1-based) */
  readonly lines: readonly number[];
  /**
   * Whether a statement of the catch clause is on a line of the try (the try statement or a statement inside
   * it); lcov, which counts by line, cannot judge this
   */
  readonly sameLineAsTry: boolean;
}

/** Name of the function around a clause (declaration, method, function in a variable; "(top)" when none) */
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
