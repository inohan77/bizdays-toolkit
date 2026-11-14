/**
 * 性能の比較（CI の bench ジョブ）。公開済みの前のバージョンと今回の dist を、同じ機械で scripts/bench.ts にかけた
 * 結果（JSON）を比べ、比率を表にする。
 *
 * ランナーの性能は実行ごとに数十%ぶれるので、絶対値では判定しない。同じ実行の中で測った 2 つの結果の
 * 比率だけを見て、どれかの計測が前のバージョンの RATIO 倍より遅くなったら失敗にする（アルゴリズムの悪化だけを捉える）。
 * 絶対値は記録として表に残す（GitHub の Job Summary に書くには、出力を $GITHUB_STEP_SUMMARY に渡す）。
 *
 * 正しさのために遅くなることを受け入れるバージョンは、開発の記録（docs/development-log.md。CHANGELOG.md の同じ節も読む）の今のバージョン（または [Unreleased]）に、
 * 上限を超える計測ごとに、許可の行「- 性能の退行: <計測の名前> は <数>x まで受け入れる（<理由>）」を書く（scripts/bench-allowance.ts）。
 * 上限を超えた計測のすべてに許可の行があり、測った比率が書いた倍率以下なら、表に記録して合格にする（RELEASING.md の
 * 「品質の仕組みの理由」の「前のバージョンと比べる」）。「性能の退行」という言葉があるだけでは、許可にならない。
 *
 * 使い方: node scripts/bench-compare.ts <base.json> <head.json> [--ratio 2] [--base-label <label>] [--head-label <label>]
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
// 数でない値は比べる条件がすべて偽になり、黙って合格するので使い方の誤りにする
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
/** 上限を超えた計測（名前と比率） */
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
/** 今のバージョンと [Unreleased] の記録の節（docs/development-log.md と CHANGELOG.md。scripts/release-sections.ts） */
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
