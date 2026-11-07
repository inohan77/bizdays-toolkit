// 生成範囲の包含の比べ方と記録の読み書き（test/tools/generator-features.test.ts と scripts/record-generator-features.ts が使う。
// 比べ方を 1 か所にして、スクリプトとテストの結果がずれないようにする）。

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 呼び出し側ごとの特徴の一覧 */
export type FeatureRecord = Record<string, readonly string[]>;

/** 記録の置き場所（呼び出し側ごとに 1 ファイル）と、記録を取った基準の版（今の版から作り直さない） */
export const RECORD_DIR = "test/fixtures/generator-features-0.30.3";
export const RECORD_REF = "v0.30.3";
/** 呼び出し側の名前 */
export const SITES = ["properties", "diagnose-properties", "result-compare"] as const;

/**
 * 意図して落とした特徴と、その理由（呼び出し側 → 特徴 → 理由）。理由は「その形はもう公開の型にない」のような事実に限る。
 * 載せる前に判断を仰ぐ（RELEASING.md の「品質の確認」）
 */
export const DROPPED_FEATURES: Readonly<Record<string, Readonly<Record<string, string>>>> = {};

/** 記録を読む（root はリポジトリのディレクトリ） */
export function readRecord(root = "."): FeatureRecord {
  const out: FeatureRecord = {};
  for (const file of readdirSync(join(root, RECORD_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const body = JSON.parse(readFileSync(join(root, RECORD_DIR, file), "utf8")) as {
      ref: string;
      site: string;
      features: string[];
    };
    if (body.ref !== RECORD_REF)
      throw new Error(
        `${RECORD_DIR}/${file}: recorded from ${body.ref}, not from the baseline ${RECORD_REF}`,
      );
    out[body.site] = body.features;
  }
  return out;
}

/** 記録の特徴のうち、今の特徴にもなく、DROPPED_FEATURES にも載っていないもの（呼び出し側ごと） */
export function missingFeatures(
  recorded: FeatureRecord,
  current: FeatureRecord,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [site, list] of Object.entries(recorded)) {
    const now = new Set(current[site] ?? []);
    const dropped = DROPPED_FEATURES[site] ?? {};
    out[site] = list.filter((f) => !now.has(f) && !(f in dropped));
  }
  return out;
}

/** DROPPED_FEATURES の項目のうち、記録にない特徴（古い除外） */
export function staleDropped(recorded: FeatureRecord): string[] {
  return Object.entries(DROPPED_FEATURES).flatMap(([site, map]) =>
    Object.keys(map)
      .filter((f) => !(recorded[site] ?? []).includes(f))
      .map((f) => `${site}: ${f}`),
  );
}
