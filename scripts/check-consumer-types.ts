import "./strict-warnings.ts";
/**
 * 利用者の立場で、公開する型定義を型チェックする（pnpm check から実行。decisions.md の 35 番）。
 *
 * test/consumer/consumer.mts を、moduleResolution を node16・nodenext・bundler に変えて tsc で確かめ、
 * わざと型エラーを含む test/consumer/consumer-error.mts が失敗することも確かめる。pnpm build の後に実行する。
 *
 * 引数:
 *   --tsc <path>   使う tsc（既定は開発用の依存の typescript/bin/tsc。CI の consumer-types ジョブは別の版を渡す）
 *   --label <text> 結果の表示に添える名前（例: "TypeScript <版>"）
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const tscArg = argValue("--tsc");
const tsc = tscArg ? resolve(tscArg) : createRequire(import.meta.url).resolve("typescript/bin/tsc");
const label = argValue("--label") ?? "";
const version = execFileSync(process.execPath, [tsc, "--version"], { encoding: "utf8" }).trim();
const major = Number(/(\d+)\./.exec(version)?.[1] ?? 0);
// --ignoreConfig（tsconfig.json を読まない）は 6.0 からのオプション。それより前はファイルを指定すれば読まない
const ignoreConfig = major >= 6 ? ["--ignoreConfig"] : [];

const emptyTypeRoots = mkdtempSync(join(tmpdir(), "bizdays-types-"));
const settings: [string, string][] = [
  ["node16", "node16"],
  ["nodenext", "nodenext"],
  ["bundler", "esnext"],
];

function run(
  file: string,
  moduleResolution: string,
  module: string,
): { ok: boolean; output: string } {
  const tscArgs = [
    ...ignoreConfig,
    // リポジトリの @types（node など）を読まない。利用者の型チェックに要らず、古い TypeScript では読めない型を含むため
    "--typeRoots",
    emptyTypeRoots,
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "false",
    "--target",
    "es2022",
    "--lib",
    "es2022",
    "--module",
    module,
    "--moduleResolution",
    moduleResolution,
    file,
  ];
  try {
    const output = execFileSync(process.execPath, [tsc, ...tscArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output };
  } catch (e) {
    const out = e as { stdout?: string; stderr?: string };
    return { ok: false, output: `${out.stdout ?? ""}${out.stderr ?? ""}` };
  }
}

const failures: string[] = [];
for (const [moduleResolution, module] of settings) {
  const good = run("test/consumer/consumer.mts", moduleResolution, module);
  if (!good.ok) failures.push(`moduleResolution ${moduleResolution}:\n${good.output}`);
  // 検査が機能していることの確認: 型エラーを含む入力は失敗し、その出力にエラーの位置が含まれる
  const bad = run("test/consumer/consumer-error.mts", moduleResolution, module);
  if (bad.ok || !bad.output.includes("consumer-error.mts")) {
    failures.push(
      `moduleResolution ${moduleResolution}: the intentional type error in consumer-error.mts was not reported\n${bad.output}`,
    );
  }
}
rmSync(emptyTypeRoots, { recursive: true, force: true });
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `OK   consumer types (${label || version}): ${settings.map(([m]) => m).join(", ")} (and the intentional error is reported)`,
);
