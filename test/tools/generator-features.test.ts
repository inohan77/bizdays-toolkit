// The generated range must not shrink. Checks that the features of the options the three callers build now
// include, per caller, every feature of the options the callers of 0.30.3 really built
// (test/fixtures/generator-features-0.30.3/; made by scripts/record-generator-features.ts). The comparison is in
// one place, test/support/features-compare.ts, the same as --check of the script.
// The callers' options are built with the functions of test/support/sites.ts, with the same seeds and numbers of
// trials as the callers, and for all three callers even the order of the options equals the caller's (properties
// separates the random generator for options into sequences seeded by the property's name). That the real
// callers call those functions in the same context is checked by the generator-features job of CI (--worktree
// --check of the script).
// The number of features found is the same in test and script for properties (414) and diagnose-properties
// (425). For result-compare (487 in the test, 563 in the script; the difference of 76 examined in 0.30.5), the
// difference consists only of features of the dates asked about (scan[...]): only the script sees the dates the
// library asks of the basis calendar of an nth-business-day rule of a schedule (a calendar with only the
// providers, built by result-compare), which spread over the providers' supported years.
// This test only builds options, so those questions do not occur. The features of the options (other than scan)
// are the same in both.
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
