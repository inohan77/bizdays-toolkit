/**
 * 性能の比較（CI の bench ジョブ）。公開済みの前の版と今回の dist を、同じ機械で scripts/bench.ts にかけた
 * 結果（JSON）を比べ、比率を表にする。
 *
 * ランナーの性能は実行ごとに数十%ぶれるので、絶対値では判定しない。同じ実行の中で測った 2 つの結果の
 * 比率だけを見て、どれかの計測が前の版の RATIO 倍より遅くなったら失敗にする（アルゴリズムの悪化だけを捉える）。
 * 絶対値は記録として表に残す（GitHub の Job Summary に書くには、出力を $GITHUB_STEP_SUMMARY に渡す）。
 *
 * 正しさのために遅くなることを受け入れる版は、CHANGELOG の今の版（または [Unreleased]）の「### 開発」に「性能の退行」という
 * 言葉を含めて理由を書く。そのときは上限を超えても表に記録して合格にする（decisions.md の 37 番。サイズの上限と同じ形）。
 *
 * 使い方: node scripts/bench-compare.ts <base.json> <head.json> [--ratio 2] [--base-label <label>] [--head-label <label>]
 */

import "./strict-warnings.ts";
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
const ratioLimit = Number(argValue("--ratio", "2"));
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
let failed = false;
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
  if (ratio > ratioLimit) failed = true;
  lines.push(`| ${name} | ${format(b)} | ${format(h)} | ${ratio.toFixed(2)}x${mark} |`);
}
lines.push(
  "",
  `最も遅くなった計測の比率: ${worst.toFixed(2)}x（上限 ${ratioLimit}x。ランナーの性能のぶれは比率には現れにくい）`,
);
console.log(lines.join("\n"));
/** CHANGELOG の今の版（または [Unreleased]）の「### 開発」に「性能の退行」の記載があるか */
function performanceNoted(): boolean {
  let changelog: string;
  let version: string;
  try {
    changelog = readFileSync("CHANGELOG.md", "utf8");
    version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
  } catch {
    return false;
  }
  const sections = changelog.split(/^## \[/m).slice(1);
  return sections
    .filter((sec) => sec.startsWith("Unreleased]") || sec.startsWith(`${version}]`))
    .some((sec) => {
      const dev = /^### 開発\n([\s\S]*?)(?=^### |(?![\s\S]))/m.exec(sec);
      return dev !== null && dev[1]!.includes("性能の退行");
    });
}
if (failed) {
  if (performanceNoted()) {
    console.log(
      `\n上限 ${ratioLimit}x を超えた計測があるが、CHANGELOG の「開発」に「性能の退行」の記載があるので合格にする`,
    );
  } else {
    console.error(
      `::error::some measurements are more than ${ratioLimit}x slower than ${baseLabel} (write the reason with the words 性能の退行 under 開発 in CHANGELOG to accept it)`,
    );
    process.exit(1);
  }
}
