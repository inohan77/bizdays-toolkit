// 生成範囲を減らさない。3 つの呼び出し側が今作る設定の特徴が、v0.30.3 の呼び出し側が実際に作った設定の特徴
// （test/fixtures/generator-features-0.30.3/。作り方は scripts/record-generator-features.ts）を、呼び出し側ごとに
// すべて含むことを確かめる。比べ方は test/support/features-compare.ts の 1 か所で、スクリプトの --check と同じ。
// 呼び出し側の設定は test/support/sites.ts の関数で、呼び出し側と同じ種と試行の数で作る。diagnose-properties と
// result-compare は乱数の並びまで呼び出し側と同じだが、properties は近似（性質の中で日付なども同じ乱数から引くので、
// 並びが呼び出し側とずれる）。実際の呼び出し側の包含は、CI の generator-features ジョブ（スクリプトの --check）で確かめる。
import assert from "node:assert/strict";
import { test } from "node:test";
import { jp } from "../src/jp/index.ts";
import { featuresOf } from "./support/features.ts";
import {
  DROPPED_FEATURES,
  SITES,
  missingFeatures,
  readRecord,
  staleDropped,
  type FeatureRecord,
} from "./support/features-compare.ts";
import { JP_FULL_RANGE, siteTrials, trialScanFeatures } from "./support/sites.ts";

const recorded = readRecord();

test("記録は 3 つの呼び出し側のもので、どれも特徴がある", () => {
  assert.deepEqual(Object.keys(recorded).sort(), [...SITES].sort());
  for (const site of SITES) assert.ok((recorded[site]?.length ?? 0) > 0, `${site} の記録が空`);
});

for (const site of SITES)
  test(`生成範囲（${site}）: v0.30.3 の呼び出し側が作った特徴を、今の呼び出し側もすべて作る`, () => {
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
