// The independence of the days the promise checks compare (G3 of the plan; RELEASING.md, "Checks that keep the
// promises of the diagnostics"): the promise tests decide the days they compare from the diagnostic range and the
// options only (test/support/promise-days.ts), never from the scan ranges of the diagnostics. Comparing only the
// days the diagnostics scan would miss, in the same way, what the diagnostics miss outside them.
// The promise tests and every module of test/ and scripts/ they import (followed through relative imports) may
// import from src/core/diagnose.ts only DIAGNOSTIC_YEARS. The oracle (test/diagnose-oracle.test.ts) compares on
// the range of the diagnostics for another purpose (the completeness of the items) and is not a promise test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";

/** The promise tests */
export const PROMISE_TESTS = [
  "test/diagnose-properties.test.ts",
  "scripts/promise-inventory.ts",
  "test/support/promise-days.ts",
] as const;
const DIAGNOSE = "src/core/diagnose.ts";
/** The only name the promise tests may import from src/core/diagnose.ts */
const ALLOWED = new Set(["DIAGNOSTIC_YEARS"]);

/**
 * The imports of one file that resolve to a file of the repository.
 * @param file - Path relative to the repository.
 * @returns Per import: the resolved file, the names imported (undefined for a namespace or default import, a
 *   re-export of everything or a dynamic import) and the line.
 */
function importsOf(file: string): { target: string; names: string[] | undefined; line: number }[] {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const out: { target: string; names: string[] | undefined; line: number }[] = [];
  const resolveFrom = (spec: string): string | undefined =>
    spec.startsWith(".")
      ? relative(".", resolve(dirname(file), spec))
          .split("\\")
          .join("/")
      : undefined;
  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const target = resolveFrom(node.moduleSpecifier.text);
      if (target !== undefined) {
        let names: string[] | undefined;
        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause;
          const bindings = clause?.namedBindings;
          if (clause && !clause.name && bindings && ts.isNamedImports(bindings))
            names = bindings.elements.map((e) => (e.propertyName ?? e.name).text);
          else if (!clause) names = [];
        } else if (node.exportClause && ts.isNamedExports(node.exportClause))
          names = node.exportClause.elements.map((e) => (e.propertyName ?? e.name).text);
        out.push({ target, names, line: lineOf(node) });
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const target = resolveFrom(node.arguments[0].text);
      if (target !== undefined) out.push({ target, names: undefined, line: lineOf(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * The problems of a set of files: imports from src/core/diagnose.ts other than DIAGNOSTIC_YEARS, in the files
 * and in the modules of test/ and scripts/ they import.
 * @param roots - The files to start from.
 * @returns The problems and the files read.
 */
export function independenceProblems(roots: readonly string[]): {
  problems: string[];
  files: string[];
} {
  const problems: string[] = [];
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const { target, names, line } of importsOf(file)) {
      if (target === DIAGNOSE) {
        if (names === undefined)
          problems.push(
            `${file}:${line}: imports ${DIAGNOSE} as a whole (only DIAGNOSTIC_YEARS is allowed)`,
          );
        else
          for (const n of names)
            if (!ALLOWED.has(n))
              problems.push(
                `${file}:${line}: imports ${n} from ${DIAGNOSE} (only DIAGNOSTIC_YEARS is allowed)`,
              );
      } else if (target.startsWith("test/") || target.startsWith("scripts/")) queue.push(target);
    }
  }
  return { problems, files: [...seen].sort() };
}

test("比べる日の独立: 約束のテストと、それが読み込む test・scripts のモジュールは、src/core/diagnose.ts から DIAGNOSTIC_YEARS のほかを読み込まない", () => {
  const { problems, files } = independenceProblems(PROMISE_TESTS);
  console.log(`# 読んだファイル: ${files.length}（${files.join("、")}）`);
  assert.ok(files.length >= PROMISE_TESTS.length);
  assert.deepEqual(problems, []);
});

test("比べる日の独立: 走査の範囲を読み込むと失敗する（検査そのものの確かめ）", () => {
  // This test of the scan ranges reads rulesScanWindow on purpose, so it stands in for a promise test that does
  const { problems } = independenceProblems(["test/diagnose-unjudgeable.test.ts"]);
  assert.ok(
    problems.some((p) => p.includes("imports rulesScanWindow from src/core/diagnose.ts")),
    problems.join("\n"),
  );
});
