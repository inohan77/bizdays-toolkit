// 飛ばしの決まり（test/support/skip.ts）。テストの skip・todo とスクリプトの SKIP の行が補助の関数を通っていること（grep）と、
// 補助の関数が CI で一覧にない理由・CI では飛ばさない理由を失敗にすることを確かめる（テスト拡充案の T3）。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { INTENDED_SKIPS, skipWhen, todoFor } from "./support/skip.ts";

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
  for (const file of filesIn("test", /\.test\.ts$/)) {
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
    process.env["CI"] = "true";
    assert.throws(
      () => skipWhen("no-such-reason", true),
      /一覧（test\/support\/skip\.ts）にない理由: no-such-reason/,
    );
    assert.throws(() => todoFor("no-such-reason"), /にない理由/);
    assert.throws(() => skipWhen("no-release-tag", true), /CI では飛ばさない理由/);
    assert.throws(
      () => skipWhen("known-bug-combine-short-circuit", true),
      /飛ばし（skip）の理由ではない/,
    );
    assert.equal(skipWhen("tz-run", true), INTENDED_SKIPS["tz-run"]!.reason);
    assert.equal(skipWhen("no-such-reason", false), false);
    assert.equal(
      todoFor("known-bug-combine-short-circuit"),
      INTENDED_SKIPS["known-bug-combine-short-circuit"]!.reason,
    );
    delete process.env["CI"];
    // 手元では、一覧にない理由も飛ばす（理由にその旨を出す）。一覧の誤用（skip と todo の取り違え）は手元でも失敗
    assert.match(String(skipWhen("no-such-reason", true)), /一覧にない理由: no-such-reason/);
    assert.equal(skipWhen("no-release-tag", true), INTENDED_SKIPS["no-release-tag"]!.reason);
    assert.throws(() => todoFor("tz-run"), /既知の不具合（todo）の理由ではない/);
  } finally {
    if (saved === undefined) delete process.env["CI"];
    else process.env["CI"] = saved;
  }
});
