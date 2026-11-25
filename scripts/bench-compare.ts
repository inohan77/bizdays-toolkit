/**
 * Performance comparison (the bench job of CI). Compares the results (JSON) of scripts/bench.ts for the
 * previous published version and for this dist, measured on the same machine, and prints the ratios as a table.
 *
 * Runner performance varies by tens of percent between runs, so absolute values are not judged. Only the ratio
 * of two results measured in the same run is examined, and the job fails when a measurement is more than RATIO
 * times slower than the previous version (to catch only algorithmic degradation).
 * Absolute values stay in the table as a record (pass the output to $GITHUB_STEP_SUMMARY for the Job Summary).
 *
 * A version that accepts being slower for correctness writes, in the development log (docs/development-log.md;
 * the same section of CHANGELOG.md is read too) of the current version (or [Unreleased]), one allowance line per
 * measurement over the limit (the format is in scripts/bench-allowance.ts).
 * When every measurement over the limit has an allowance line and the measured ratio is at most the written
 * one, the result is recorded in the table and passes (RELEASING.md, reasons for the quality mechanisms,
 * "compare with the previous version"). The mere words of the prefix are not an allowance.
 *
 * Usage: node scripts/bench-compare.ts <base.json> <head.json> [--ratio 2] [--base-label <label>]
 *        [--head-label <label>]
 */

import "./strict-warnings.ts";
import { ALLOWANCE_PREFIX, allowedRatio } from "./bench-allowance.ts";
import { releaseSections } from "./release-sections.ts";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const argValue = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : fallback;
};
const files = args.filter(
  (a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")),
);
if (files.length !== 2) {
  console.error("usage: node scripts/bench-compare.ts <base.json> <head.json> [--ratio 2]");
  process.exit(2);
}
const ratioText = argValue("--ratio", "2");
const ratioLimit = Number(ratioText);
// A value that is not a number makes every comparison false and passes silently, so it is a usage error
if (ratioText.trim() === "" || !Number.isFinite(ratioLimit) || ratioLimit <= 1) {
  console.error(`--ratio: invalid value ${JSON.stringify(ratioText)} (a number greater than 1)`);
  process.exit(2);
}
const baseLabel = argValue("--base-label", "base");
const headLabel = argValue("--head-label", "head");
const base = JSON.parse(readFileSync(files[0]!, "utf8")) as Record<string, number>;
const head = JSON.parse(readFileSync(files[1]!, "utf8")) as Record<string, number>;

const format = (ms: number): string =>
  ms >= 1
    ? `${ms.toFixed(2)} ms`
    : ms >= 0.001
      ? `${(ms * 1000).toFixed(2)} µs`
      : `${(ms * 1e6).toFixed(0)} ns`;

const lines = [`| 計測 | ${baseLabel} | ${headLabel} | 比率 |`, "| --- | ---: | ---: | ---: |"];
let worst = 0;
/** Measurements over the limit (name and ratio) */
const exceeded: { name: string; ratio: number }[] = [];
for (const name of Object.keys(head)) {
  const b = base[name];
  const h = head[name]!;
  if (b === undefined) {
    lines.push(`| ${name} | （なし） | ${format(h)} | （新しい計測） |`);
    continue;
  }
  const ratio = h / b;
  worst = Math.max(worst, ratio);
  const mark = ratio > ratioLimit ? " ❌" : "";
  if (ratio > ratioLimit) exceeded.push({ name, ratio });
  lines.push(`| ${name} | ${format(b)} | ${format(h)} | ${ratio.toFixed(2)}x${mark} |`);
}
lines.push(
  "",
  `最も遅くなった計測の比率: ${worst.toFixed(2)}x（上限 ${ratioLimit}x。ランナーの性能のぶれは比率には現れにくい）`,
);
console.log(lines.join("\n"));
/**
 * The log sections of the current version and of [Unreleased] (docs/development-log.md and CHANGELOG.md;
 * scripts/release-sections.ts)
 */
function noteSections(): string[] {
  let version: string;
  try {
    version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
  } catch {
    return [];
  }
  const sections = releaseSections();
  return ["Unreleased", version].flatMap((name) => sections.get(name) ?? []);
}
if (exceeded.length > 0) {
  const sections = noteSections();
  const refused: string[] = [];
  for (const { name, ratio } of exceeded) {
    const allowed = allowedRatio(sections, name);
    if (allowed !== undefined && ratio <= allowed)
      console.log(
        `\n上限 ${ratioLimit}x を超えたが、開発の記録の許可の行で受け入れる: ${name} ${ratio.toFixed(2)}x（許可 ${allowed}x まで）`,
      );
    else
      refused.push(
        allowed === undefined
          ? `${name} ${ratio.toFixed(2)}x (no allowance line)`
          : `${name} ${ratio.toFixed(2)}x (allowed up to ${allowed}x)`,
      );
  }
  if (refused.length > 0) {
    console.error(
      `::error::some measurements are more than ${ratioLimit}x slower than ${baseLabel}: ${refused.join("; ")}. To accept one, write a line "${ALLOWANCE_PREFIX}<name> は <ratio>x まで受け入れる（<reason>）" in the current version of docs/development-log.md (the words alone are not an allowance)`,
    );
    process.exit(1);
  }
}
