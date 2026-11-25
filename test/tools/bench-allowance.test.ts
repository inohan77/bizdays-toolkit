import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLOWANCE_PREFIX, allowedRatio } from "../../scripts/bench-allowance.ts";

// The allowance line for a performance regression (scripts/bench-allowance.ts). The passing side cannot be
// checked by tool-selftest (which sees that an injected mistake fails), so how the line is read is checked here

const NAME = "createCalendar（店舗の設定）";

test("性能の退行の許可: 計測の名前と倍率を書いた行だけが許可になる", () => {
  const section = [
    "- ほかの項目",
    `${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる（作成時の検証を足したため）`,
  ].join("\n");
  assert.equal(allowedRatio([section], NAME), 2.5);
  // An integer ratio, and a line in the second section
  assert.equal(
    allowedRatio(["", `${ALLOWANCE_PREFIX}${NAME} は 3x まで受け入れる（理由）`], NAME),
    3,
  );
  // An allowance for another measurement is no allowance for this one (even when part of the name is the same)
  assert.equal(allowedRatio([section], "createCalendar"), undefined);
  assert.equal(allowedRatio([section], "isBusinessDay（店舗・1 日）"), undefined);
});

test("性能の退行の許可: 言葉があるだけの行・形の違う行は許可にならない", () => {
  for (const line of [
    // The form written in 0.31.9 (a line about a speed-up, which also contained the measurement name)
    `- 性能の退行: 0.31.8 と比べて速くなった（\`${NAME}\` だけは 1.11〜1.14 倍）`,
    // No ratio, or not a number
    `${ALLOWANCE_PREFIX}${NAME} は受け入れる（理由）`,
    `${ALLOWANCE_PREFIX}${NAME} は 約 2x まで受け入れる（理由）`,
    `${ALLOWANCE_PREFIX}${NAME} は 2.5 倍まで受け入れる（理由）`,
    // No reason, or empty parentheses
    `${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる`,
    `${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる（）`,
    // Not at the start of the line
    `  ${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる（理由）`,
    `（${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる（理由））`,
    // Another word follows the name
    `${ALLOWANCE_PREFIX}${NAME}ほか は 2.5x まで受け入れる（理由）`,
  ])
    assert.equal(allowedRatio([line], NAME), undefined, line);
  assert.equal(allowedRatio([], NAME), undefined);
});
