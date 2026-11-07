// 子プロセスの --import の値がファイルの URL になること（CI は Linux なので、Windows の絶対パスで止まる退行をここで捕まえる）
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { importArgs } from "../../scripts/import-args.ts";

test("子プロセスの --import の値は file:// で始まる（Windows の絶対パスをそのまま渡さない）", () => {
  const args = importArgs([
    join(process.cwd(), "scripts", "strict-warnings.ts"),
    join("work", "register.mjs"),
  ]);
  assert.equal(args.length, 4);
  for (let i = 0; i < args.length; i += 2) {
    assert.equal(args[i], "--import");
    assert.match(args[i + 1]!, /^file:\/\//, `--import の値が URL でない: ${args[i + 1]}`);
  }
});
