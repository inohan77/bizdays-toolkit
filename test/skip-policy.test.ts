// 飛ばしの決まり（test/support/skip.ts）。テストの skip・todo とスクリプトの SKIP の行が補助の関数を通っていること（grep。省略記法・分割代入・import は TypeScript のコンパイラーの API）と、
// 補助の関数が CI で一覧にない理由・CI では飛ばさない理由を失敗にすることを確かめる（テスト拡充案の T3）。
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
} from "./support/skip.ts";

/**
 * 補助の関数を通さない飛ばしと、その理由（ファイル → 理由）。test/compat は Node.js 22.12 の素の JavaScript で動き、
 * TypeScript の補助の関数を読み込めないので、Temporal のない実行環境での飛ばしを直接書く
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
  // テストと、テストの道具（test/support。飛ばしの一覧を定める skip.ts は除く）
  const testFiles = [
    ...filesIn("test", /\.test\.ts$/),
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
        // 飛ばしの理由を入れる定数（SKIP・SKIP_TZ）は、補助の関数の結果だけを入れる
        if (/\bconst SKIP(_TZ)?\s*=/.test(line) && !/skipWhen\(/.test(line))
          problems.push(`${file}:${i + 1}: ${line.trim()}`);
      });
  }
  // 省略記法と、skip・todo という名前の値を持ち込む書き方は使わない（何を入れたかが行から読めず、補助の関数を通らない値を
  // 飛ばしに渡せるため）。行に分けて書いても拾うよう、TypeScript のコンパイラーの API で読む（コメント・文字列の中は拾わない）。
  // 拾う形: オブジェクトの省略記法（{ skip }）、分割代入（const { skip } = …・({ todo }) => …）、import・export
  // （import { skip } from "node:test"。別名の import { skip as s } も）、その名前の変数・引数の宣言（const skip = …・
  // (todo) => …。値を f(a, skip, b) のように渡す書き方は、その宣言で拾う）
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
    // 一覧にない理由は、CI でなくても、飛ばす条件がそろわなくても失敗（打ち間違いを早く見つける）
    assert.throws(() => sample.skipWhen("no-such-reason", false), /にない理由: no-such-reason/);
    assert.throws(() => sample.skipWhen("no-such-reason", true), /にない理由: no-such-reason/);
    assert.equal(
      sample.skipWhen("sample-local-only", true),
      POLICY_SAMPLE["sample-local-only"]!.reason,
    );
    assert.throws(() => sample.todoFor("sample-skip"), /既知の不具合（todo）の理由ではない/);
    // skip と todo の取り違え・一覧にない todo の理由も、CI でなくても、飛ばす条件がそろわなくても投げる
    assert.throws(() => sample.skipWhen("sample-known-bug", false), /飛ばし（skip）の理由ではない/);
    assert.throws(() => sample.todoFor("no-such-reason"), /にない理由: no-such-reason/);
    // 環境変数 CI が "false" と空文字列のときは CI とみなさない（CI では飛ばさない理由も飛ばせる）
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
    // 公開している skipWhen・todoFor は、意図した飛ばしの一覧（INTENDED_SKIPS）を引く
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
