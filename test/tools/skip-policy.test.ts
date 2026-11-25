// The rule for skipping (test/support/skip.ts). Checks that skip and todo of tests and the SKIP lines of scripts
// go through the helper functions (grep; shorthand, destructuring and imports with the TypeScript compiler API)
// and that the helpers fail in CI for a reason missing in the list and for a reason that is not skipped in CI
// (T3 of the test expansion plan).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import {
  createSkipPolicy,
  INTENDED_SKIPS,
  POLICY_SAMPLE,
  skipWhen,
  todoFor,
} from "../support/skip.ts";

/**
 * Skips that do not go through the helper functions, with the reason (file → reason). test/compat runs as plain
 * JavaScript on Node.js 22.12 and cannot load the TypeScript helpers, so it writes the skip for a runtime
 * without Temporal directly
 */
const OUTSIDE: Readonly<Record<string, string>> = {
  "test/compat/esm.test.mjs":
    "Node.js 22.12 の素の JavaScript で動くので、TypeScript の補助の関数を読み込めない",
  "test/compat/runtime.mjs": "同上",
};

const filesIn = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir)
    .filter((f) => ext.test(f))
    .map((f) => join(dir, f).replaceAll("\\", "/"));

test("飛ばしの決まり: テストの skip・todo とスクリプトの SKIP の行は、補助の関数（skipWhen・todoFor）を通る", () => {
  const problems: string[] = [];
  // Tests and test tools (test/support, except skip.ts, which defines the list of skips)
  const testFiles = [
    ...filesIn("test", /\.test\.ts$/),
    // The tests of tests (pnpm test:tools) run in pnpm check too, so they are checked by the same rule
    ...filesIn("test/tools", /\.test\.ts$/),
    ...filesIn("test/support", /\.ts$/).filter((f) => !f.endsWith("/skip.ts")),
  ];
  for (const file of testFiles) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/\b(skip|todo)\s*:/.test(line) && !/skipWhen\(|todoFor\(|\bSKIP(_TZ)?\b/.test(line))
          problems.push(`${file}:${i + 1}: ${line.trim()}`);
        if (/\b(test|t|it|describe)\.(skip|todo)\(/.test(line))
          problems.push(`${file}:${i + 1}: ${line.trim()}`);
        // A constant that holds the reason of a skip (SKIP, SKIP_TZ) holds only the result of a helper function
        if (/\bconst SKIP(_TZ)?\s*=/.test(line) && !/skipWhen\(/.test(line))
          problems.push(`${file}:${i + 1}: ${line.trim()}`);
      });
  }
  // Shorthand, and ways of bringing in a value named skip or todo, are not used (the line does not show what was
  // put in, and a value that did not go through the helpers could be passed as a skip). They are read with the
  // TypeScript compiler API, to be found also when split across lines (nothing inside comments and strings).
  // Found: object shorthand ({ skip }), destructuring (const { skip } = ...; ({ todo }) => ...), import and
  // export (import { skip } from "node:test"; also the alias import { skip as s }), and declarations of
  // variables and parameters with those names (const skip = ...; (todo) => ...; passing a value as in
  // f(a, skip, b) is found through that declaration)
  const named = (n: ts.Node | undefined): string | undefined =>
    n !== undefined &&
    (ts.isIdentifier(n) || ts.isStringLiteral(n)) &&
    (n.text === "skip" || n.text === "todo")
      ? n.text
      : undefined;
  for (const file of testFiles) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const found = (node: ts.Node, kind: string, name: string): void => {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      problems.push(`${file}:${line + 1}: ${kind} "${name}"`);
    };
    const visit = (node: ts.Node): void => {
      let name: string | undefined;
      if (ts.isShorthandPropertyAssignment(node) && (name = named(node.name)))
        found(node, "shorthand", name);
      else if (
        ts.isBindingElement(node) &&
        ts.isObjectBindingPattern(node.parent) &&
        node.propertyName === undefined &&
        (name = named(node.name))
      )
        found(node, "destructuring", name);
      else if (
        (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) &&
        (name = named(node.propertyName ?? node.name))
      )
        found(node, ts.isImportSpecifier(node) ? "import" : "export", name);
      else if (
        (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
        (name = named(node.name))
      )
        found(node, ts.isParameter(node) ? "parameter" : "declaration", name);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const file of [...filesIn("scripts", /\.ts$/), ...filesIn("test/compat", /\.(mjs|cjs)$/)]) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/["'`]SKIP |skipped \(/.test(line) && !/skipWhen\(/.test(line) && !(file in OUTSIDE))
          problems.push(`${file}:${i + 1}: ${line.trim()}`);
      });
  }
  for (const file of Object.keys(OUTSIDE))
    if (!/skipped \(/.test(readFileSync(file, "utf8")))
      problems.push(`${file}: OUTSIDE に載っているが飛ばしがない（古い記載）`);
  assert.deepEqual(problems, [], "補助の関数を通さない飛ばし");
});

test("飛ばしの決まり: CI では、一覧にない理由と CI では飛ばさない理由を失敗にし、一覧の理由は通す", () => {
  const saved = process.env["CI"];
  try {
    const sample = createSkipPolicy(POLICY_SAMPLE);
    process.env["CI"] = "true";
    assert.throws(
      () => sample.skipWhen("no-such-reason", true),
      /一覧（test\/support\/skip\.ts）にない理由: no-such-reason/,
    );
    assert.throws(() => sample.todoFor("no-such-reason"), /にない理由/);
    assert.throws(() => sample.skipWhen("sample-local-only", true), /CI では飛ばさない理由/);
    assert.throws(() => sample.skipWhen("sample-known-bug", true), /飛ばし（skip）の理由ではない/);
    assert.equal(sample.skipWhen("sample-skip", true), POLICY_SAMPLE["sample-skip"]!.reason);
    assert.equal(sample.todoFor("sample-known-bug"), POLICY_SAMPLE["sample-known-bug"]!.reason);
    delete process.env["CI"];
    // A reason missing in the list fails outside CI too, and before the condition for skipping is met (to find a
    // typo early)
    assert.throws(() => sample.skipWhen("no-such-reason", false), /にない理由: no-such-reason/);
    assert.throws(() => sample.skipWhen("no-such-reason", true), /にない理由: no-such-reason/);
    assert.equal(
      sample.skipWhen("sample-local-only", true),
      POLICY_SAMPLE["sample-local-only"]!.reason,
    );
    assert.throws(() => sample.todoFor("sample-skip"), /既知の不具合（todo）の理由ではない/);
    // A mix-up of skip and todo, and a todo reason missing in the list, throw outside CI too, and before the
    // condition for skipping is met
    assert.throws(() => sample.skipWhen("sample-known-bug", false), /飛ばし（skip）の理由ではない/);
    assert.throws(() => sample.todoFor("no-such-reason"), /にない理由: no-such-reason/);
    // With the environment variable CI being "false" or the empty string it is not CI (a reason that is not
    // skipped in CI can be skipped)
    for (const value of ["false", ""]) {
      process.env["CI"] = value;
      assert.equal(
        sample.skipWhen("sample-local-only", true),
        POLICY_SAMPLE["sample-local-only"]!.reason,
        `CI=${JSON.stringify(value)}`,
      );
    }
    process.env["CI"] = "1";
    assert.throws(() => sample.skipWhen("sample-local-only", true), /CI では飛ばさない理由/);
    // The published skipWhen and todoFor look up the list of intended skips (INTENDED_SKIPS)
    delete process.env["CI"];
    assert.equal(skipWhen("ci-full-only", true), INTENDED_SKIPS["ci-full-only"]!.reason);
    assert.equal(skipWhen("no-release-tag", true), INTENDED_SKIPS["no-release-tag"]!.reason);
    assert.throws(() => todoFor("ci-full-only"), /既知の不具合（todo）の理由ではない/);
    assert.throws(() => skipWhen("sample-skip", false), /にない理由: sample-skip/);
  } finally {
    if (saved === undefined) delete process.env["CI"];
    else process.env["CI"] = saved;
  }
});
