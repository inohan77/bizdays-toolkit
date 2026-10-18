import "./strict-warnings.ts";
/**
 * 利用者の立場で、公開する型定義を型チェックする（pnpm check から実行。decisions.md の 29 番）。
 *
 * test/consumer/consumer.mts を、moduleResolution を node16・nodenext・bundler に変えて tsc で確かめる。
 * パッケージ名での自己参照で dist の .d.ts を読み、ライブラリの型定義の検査（skipLibCheck: false）も有効にする。
 * 型定義の import が .ts の拡張子で書かれているため、利用者の設定で読めることを確かめる意味がある。
 * pnpm build の後に実行する。
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const settings: [string, string][] = [
  ["node16", "node16"],
  ["nodenext", "nodenext"],
  ["bundler", "esnext"],
];
const failures: string[] = [];
for (const [moduleResolution, module] of settings) {
  try {
    execFileSync(
      process.execPath,
      [
        tsc,
        "--ignoreConfig",
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
        "test/consumer/consumer.mts",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const out = e as { stdout?: string; stderr?: string };
    failures.push(`moduleResolution ${moduleResolution}:\n${out.stdout ?? ""}${out.stderr ?? ""}`);
  }
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`OK   consumer types: ${settings.map(([m]) => m).join(", ")}`);
