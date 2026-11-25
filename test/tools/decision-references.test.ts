// The forms of a decision reference (scripts/decision-references.ts): the form with the counter word after each
// listed number is found, and the ordinal form is not
import assert from "node:assert/strict";
import { test } from "node:test";
import { DECISION_REFERENCE, decisionNumbers } from "../../scripts/decision-references.ts";

// The examples are built by joining "decisions" and ".md" (written as a reference in the source, this file
// itself would be counted as referring)
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

test("決定の参照: 英語のコメントの形（番号に # を付けて並べる）を拾い、# のない数字は拾わない", () => {
  assert.deepEqual(numbersIn(`@see ${D} #17`), [[17]]);
  assert.deepEqual(numbersIn(`@see ${D} #16, #17, #31`), [[16, 17, 31]]);
  assert.deepEqual(numbersIn(`(\`docs/${D}\` #8)`), [[8]]);
  assert.deepEqual(numbersIn(`see ${D} 17`), []);
  assert.deepEqual(numbersIn(`${D} #172.`), [[172]]);
});
