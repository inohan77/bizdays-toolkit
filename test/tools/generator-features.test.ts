// 生成範囲を減らさない。3 つの呼び出し側が今作る設定の特徴が、0.30.3 の呼び出し側が実際に作った設定の特徴
// （test/fixtures/generator-features-0.30.3/。作り方は scripts/record-generator-features.ts）を、呼び出し側ごとに
// すべて含むことを確かめる。比べ方は test/support/features-compare.ts の 1 か所で、スクリプトの --check と同じ。
// 呼び出し側の設定は test/support/sites.ts の関数で、呼び出し側と同じ種と試行の数で作り、3 つの呼び出し側とも設定の並びまで
// 呼び出し側と同じ（properties は、設定を作る乱数を性質の名前から決まる種の列に分けている）。実際の呼び出し側が
// その関数を同じ文脈で呼んでいることは、CI の generator-features ジョブ（スクリプトの --worktree --check）で確かめる。
// 拾える特徴の数は、properties（414 件）と diagnose-properties（425 件）はテストとスクリプトで同じ。result-compare
// （テスト 487 件・スクリプト 563 件、0.30.5 で調べた差 76 件）は、
// 差がすべて問い合わせた日付の特徴（scan[…]）で、スクリプトだけが、スケジュールの第 n 営業日の規則の基準のカレンダー
// （result-compare が作る提供元だけのカレンダー）にライブラリが問い合わせた日付（提供元の対応年に広がる）を拾うため。
// 設定だけを作るこのテストには、その問い合わせが出ない。設定の特徴（scan 以外）は両方で同じ。
import assert from "node:assert/strict";
import { test } from "node:test";
import { jp } from "../../src/jp/index.ts";
import { COMBINATIONS, NOT_APPLICABLE } from "../support/combinations.ts";
import { featuresOf } from "../support/features.ts";
import {
  DROPPED_FEATURES,
  SITES,
  missingFeatures,
  readRecord,
  staleDropped,
  type FeatureRecord,
} from "../support/features-compare.ts";
import { JP_FULL_RANGE, siteTrials, trialScanFeatures } from "../support/sites.ts";

const recorded = readRecord();

test("記録は 3 つの呼び出し側のもので、どれも特徴がある", () => {
  assert.deepEqual(Object.keys(recorded).sort(), [...SITES].sort());
  for (const site of SITES) assert.ok((recorded[site]?.length ?? 0) > 0, `${site} の記録が空`);
});

for (const site of SITES)
  test(`生成範囲（${site}）: 0.30.3 の呼び出し側が作った特徴を、今の呼び出し側もすべて作る`, () => {
    const current = new Set<string>();
    for (const t of siteTrials(site)) {
      for (const f of featuresOf(t.options, t.kind)) current.add(f);
      for (const f of trialScanFeatures(t)) current.add(f);
    }
    const now: FeatureRecord = { [site]: [...current] };
    const missing = missingFeatures({ [site]: recorded[site]! }, now)[site]!;
    const dropped = Object.keys(DROPPED_FEATURES[site] ?? {}).length;
    console.log(
      `# ${site}: 記録 ${recorded[site]!.length} 件、今 ${current.size} 件、落ちた特徴 ${missing.length} 件、意図して落とした特徴 ${dropped} 件`,
    );
    assert.deepEqual(
      missing,
      [],
      `${site} が作らなくなった特徴（意図したものなら DROPPED_FEATURES に事実の理由を書く）`,
    );
  });

test("意図して落とした特徴（DROPPED_FEATURES）は、記録にある特徴だけ", () => {
  assert.deepEqual(staleDropped(recorded), []);
});

test("日本の提供元の全範囲を走査するテストの範囲は、日本の提供元の対応年と同じ", () => {
  assert.deepEqual(JP_FULL_RANGE, {
    from: `${jp.supportedYears.from}-01-01`,
    to: `${jp.supportedYears.to}-12-31`,
  });
});

for (const site of SITES)
  test(`必ず作る組み合わせ（${site}）: 一覧の組み合わせを、作れないと理由を書いたものを除いて 1 回以上作る`, () => {
    const trials = siteTrials(site);
    const skipped = NOT_APPLICABLE[site] ?? {};
    const problems: string[] = [];
    for (const c of COMBINATIONS) {
      const made = trials.filter((t) => c.matches(t.options)).length;
      if (c.name in skipped) {
        if (made > 0)
          problems.push(`${c.name} は作れないはず（${skipped[c.name]}）なのに ${made} 件作った`);
      } else if (made === 0) problems.push(`${c.name} の組み合わせを作らない（理由: ${c.reason}）`);
    }
    for (const name of Object.keys(skipped))
      if (!COMBINATIONS.some((c) => c.name === name))
        problems.push(`NOT_APPLICABLE の ${name} は一覧にない`);
    assert.deepEqual(problems, []);
  });
