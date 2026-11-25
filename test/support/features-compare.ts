// How the inclusion of the generated range is compared, and reading and writing the record (used by
// test/tools/generator-features.test.ts and scripts/record-generator-features.ts; the comparison is in one place
// so that script and test cannot disagree).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The list of features per caller */
export type FeatureRecord = Record<string, readonly string[]>;

/**
 * Where the record is kept (one file per caller), and the baseline version it was taken from (it is not rebuilt
 * from the current version)
 */
export const RECORD_DIR = "test/fixtures/generator-features-0.30.3";
export const RECORD_REF = "v0.30.3";
/** The names of the callers */
export const SITES = ["properties", "diagnose-properties", "result-compare"] as const;

/**
 * Features dropped on purpose, with the reason (caller → feature → reason). The reason is a fact such as "the
 * shape is no longer in the public types".
 * Ask for a decision before listing one (the quality checks of RELEASING.md)
 */
export const DROPPED_FEATURES: Readonly<Record<string, Readonly<Record<string, string>>>> = {};

/** Reads the record (`root` is the repository directory) */
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

/** The features of the record that are neither among the current features nor in DROPPED_FEATURES (per caller) */
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

/** The entries of DROPPED_FEATURES whose feature is not in the record (stale exclusions) */
export function staleDropped(recorded: FeatureRecord): string[] {
  return Object.entries(DROPPED_FEATURES).flatMap(([site, map]) =>
    Object.keys(map)
      .filter((f) => !(recorded[site] ?? []).includes(f))
      .map((f) => `${site}: ${f}`),
  );
}
