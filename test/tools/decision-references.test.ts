// 決定の番号の参照の形（scripts/decision-references.ts）: 並べた番号のそれぞれに「番」を付けた形も拾い、「番目」は拾わない
import assert from "node:assert/strict";
import { test } from "node:test";
import { DECISION_REFERENCE, decisionNumbers } from "../../scripts/decision-references.ts";

// 例文は "decisions" と ".md" をつないで作る（ソースに参照の形のまま書くと、このファイル自身が参照として数えられる）
const D = ["decisions", "md"].join(".");
const numbersIn = (text: string): number[][] =>
  [...text.matchAll(DECISION_REFERENCE)].map((m) => decisionNumbers(m[1]!));

test("決定の参照: 1 つの番号、「・」「、」で並べた番号、並べたそれぞれに「番」を付けた番号を拾う", () => {
  assert.deepEqual(numbersIn(`理由は ${D} の 3 番`), [[3]]);
  assert.deepEqual(numbersIn(`${D} の 25・32 番`), [[25, 32]]);
  assert.deepEqual(numbersIn(`${D} の 1、2 番`), [[1, 2]]);
  assert.deepEqual(numbersIn(`理由は ${D} の 25 番・32 番）`), [[25, 32]]);
  assert.deepEqual(numbersIn(`理由は ${D} の 7 番・10 番です`), [[7, 10]]);
  assert.deepEqual(numbersIn(`\`docs/${D}\` の 8 番`), [[8]]);
});

test("決定の参照: 「番目」は参照として拾わない", () => {
  assert.deepEqual(numbersIn(`${D} の 3 番目の箇条`), []);
});
