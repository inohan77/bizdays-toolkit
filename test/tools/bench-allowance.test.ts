import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLOWANCE_PREFIX, allowedRatio } from "../../scripts/bench-allowance.ts";

// 性能の退行の許可の行（scripts/bench-allowance.ts）。合格になる側は tool-selftest で確かめられない（入れた誤りが失敗することを見る
// 仕組みのため）ので、行の読み方をここで確かめる

const NAME = "createCalendar（店舗の設定）";

test("性能の退行の許可: 計測の名前と倍率を書いた行だけが許可になる", () => {
  const section = [
    "- ほかの項目",
    `${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる（作成時の検証を足したため）`,
  ].join("\n");
  assert.equal(allowedRatio([section], NAME), 2.5);
  // 整数の倍率、2 つ目の節にある行
  assert.equal(
    allowedRatio(["", `${ALLOWANCE_PREFIX}${NAME} は 3x まで受け入れる（理由）`], NAME),
    3,
  );
  // 別の計測の許可は、その計測の許可にならない（名前の一部が同じでも）
  assert.equal(allowedRatio([section], "createCalendar"), undefined);
  assert.equal(allowedRatio([section], "isBusinessDay（店舗・1 日）"), undefined);
});

test("性能の退行の許可: 言葉があるだけの行・形の違う行は許可にならない", () => {
  for (const line of [
    // 0.31.9 で書いた形（速くなったことを書いた行。計測の名前も入っていた）
    `- 性能の退行: 0.31.8 と比べて速くなった（\`${NAME}\` だけは 1.11〜1.14 倍）`,
    // 倍率がない・数でない
    `${ALLOWANCE_PREFIX}${NAME} は受け入れる（理由）`,
    `${ALLOWANCE_PREFIX}${NAME} は 約 2x まで受け入れる（理由）`,
    `${ALLOWANCE_PREFIX}${NAME} は 2.5 倍まで受け入れる（理由）`,
    // 理由がない・括弧の中が空
    `${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる`,
    `${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる（）`,
    // 行の頭にない
    `  ${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる（理由）`,
    `（${ALLOWANCE_PREFIX}${NAME} は 2.5x まで受け入れる（理由））`,
    // 名前の後ろに別の語が続く
    `${ALLOWANCE_PREFIX}${NAME}ほか は 2.5x まで受け入れる（理由）`,
  ])
    assert.equal(allowedRatio([line], NAME), undefined, line);
  assert.equal(allowedRatio([], NAME), undefined);
});
