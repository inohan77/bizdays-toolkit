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
        // 省略記法（{ skip }・{ todo }）は、何を入れたかが行から読めないので使わない。この grep は 1 行の中の省略記法だけを拾い、
        // 複数行に分けたオブジェクトの「skip,」だけの行は拾わない（拾うには TypeScript のコンパイラーの API で読む必要がある。0.30.7 で検討）
        if (!/^\s*(\/\/|\*)/.test(line) && /[{,]\s*(skip|todo)\s*[,}]/.test(line))
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
    assert.equal(
      todoFor("known-bug-combine-short-circuit"),
      INTENDED_SKIPS["known-bug-combine-short-circuit"]!.reason,
    );
    delete process.env["CI"];
    // 一覧にない理由は、CI でなくても、飛ばす条件がそろわなくても失敗（打ち間違いを早く見つける）
    assert.throws(() => skipWhen("no-such-reason", false), /にない理由: no-such-reason/);
    assert.throws(() => skipWhen("no-such-reason", true), /にない理由: no-such-reason/);
    assert.equal(skipWhen("no-release-tag", true), INTENDED_SKIPS["no-release-tag"]!.reason);
    assert.throws(() => todoFor("tz-run"), /既知の不具合（todo）の理由ではない/);
    // skip と todo の取り違え・一覧にない todo の理由も、CI でなくても、飛ばす条件がそろわなくても投げる
    assert.throws(
      () => skipWhen("known-bug-combine-short-circuit", false),
      /飛ばし（skip）の理由ではない/,
    );
    assert.throws(() => todoFor("no-such-reason"), /にない理由: no-such-reason/);
    // 環境変数 CI が "false" と空文字列のときは CI とみなさない（CI では飛ばさない理由も飛ばせる）
    for (const value of ["false", ""]) {
      process.env["CI"] = value;
      assert.equal(
        skipWhen("no-release-tag", true),
        INTENDED_SKIPS["no-release-tag"]!.reason,
        `CI=${JSON.stringify(value)}`,
      );
    }
    process.env["CI"] = "1";
    assert.throws(() => skipWhen("no-release-tag", true), /CI では飛ばさない理由/);
  } finally {
    if (saved === undefined) delete process.env["CI"];
    else process.env["CI"] = saved;
  }
});
