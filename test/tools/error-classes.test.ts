// 例外のクラスの静的な検査（src を TypeScript のコンパイラーの API で読む。ライブラリの実行結果を見ないので、test/ から
// test/tools/ に移した。test:tz の再実行の対象から外すため。提案書 bizdays-toolkit-0.31.8-proposal の T-2）
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

test("例外のクラスの静的な検査: src で typeError に渡す code は invalid-input だけで、rangeError と設定の誤りの記録（.error）に invalid-input を渡さない（decisions.md の 3 番。test/robustness.test.ts の表は経路を人が挙げるので、取りこぼしても止まるように）", () => {
  const dir = new URL("../../src/", import.meta.url);
  const files = (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.replaceAll("\\", "/"));
  const found: Record<string, Set<string>> = {
    typeError: new Set(),
    rangeError: new Set(),
    error: new Set(),
  };
  const notLiteral: string[] = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, dir), "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee)
            ? callee.name.text
            : "";
        if (name === "typeError" || name === "rangeError" || name === "error") {
          const first = node.arguments[0]!;
          const where = `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
          if (ts.isStringLiteral(first)) found[name]!.add(first.text);
          // 文字列でない code は、typeError では許さない（rangeError は記録した誤りを投げ直す経路で使う）
          else if (name === "typeError") notLiteral.push(where);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual([...found["typeError"]!], ["invalid-input"], "typeError の code");
  assert.ok(!found["rangeError"]!.has("invalid-input"), "rangeError に invalid-input");
  assert.ok(!found["error"]!.has("invalid-input"), "設定の誤りの記録に invalid-input");
  assert.deepEqual(notLiteral, [], "typeError に文字列でない code");
  assert.ok(found["rangeError"]!.size > 10, "rangeError の呼び出しを見つけられていない");
});
