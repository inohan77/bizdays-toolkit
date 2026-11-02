// 検査のスクリプトの検査（scripts/tool-selftest.ts）の部品: 表のセル、例外の文、途中で止まった写しの一覧
import assert from "node:assert/strict";
import { test } from "node:test";
import { cell, copyEach, errorText } from "../scripts/tool-selftest-parts.ts";

test("表のセルの | は \\| にし、改行は / にする", () => {
  assert.equal(cell("a | b"), "a \\| b");
  assert.equal(cell("x\ny\r\nz"), "x / y / z");
  assert.equal(cell("plain"), "plain");
});

test("例外の文は、Error ならその message、Error でない値なら String で作る", () => {
  assert.equal(errorText(new Error("boom")), "boom");
  assert.equal(errorText("text"), "text");
  assert.equal(errorText(42), "42");
  assert.equal(errorText(undefined), "undefined");
});

test("写しの途中で例外が出ても、そこまでに写したファイルは一覧に残る", () => {
  const copied: string[] = [];
  assert.throws(
    () =>
      copyEach(
        ["a.ts", "b.ts", "c.ts"],
        (file) => {
          if (file === "b.ts") throw new Error("copy failed");
        },
        copied,
      ),
    /copy failed/,
  );
  assert.deepEqual(copied, ["a.ts"]);
});
