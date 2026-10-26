/**
 * README の minify + gzip のサイズを測る（手で実行する。pnpm check・CI には含めない。RELEASING.md の「README のサイズの値」）。
 *
 * ルートのすべてと、国の提供元（サブパスごとに、その提供元の export だけ）を読み込む入口を esbuild で
 * bundle・minify し、gzip（レベル 9）で測る。1 KB は 1,000 バイトで、小数第 1 位に丸めて README に書く。
 * esbuild はリポジトリの依存にしない（decisions.md の 10・27 番）。熟成ゲートを過ぎた版を一時的なディレクトリに入れ、
 * そのパッケージのディレクトリを --esbuild で渡す。先に pnpm build で dist を作っておくこと。
 *
 * 使い方: node scripts/measure-bundle.ts --esbuild <dir>/node_modules/esbuild
 */

import "./strict-warnings.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { loadBundledProviders } from "./bundled-providers.ts";

interface Esbuild {
  build(options: Record<string, unknown>): Promise<{ outputFiles: { contents: Uint8Array }[] }>;
}

const args = process.argv.slice(2);
const i = args.indexOf("--esbuild");
const esbuildDir = i >= 0 ? args[i + 1] : undefined;
if (esbuildDir === undefined) {
  console.error("usage: node scripts/measure-bundle.ts --esbuild <dir>/node_modules/esbuild");
  process.exit(2);
}
const esbuildPkg = JSON.parse(readFileSync(resolve(esbuildDir, "package.json"), "utf8")) as {
  version: string;
  main: string;
};
const esbuild = (await import(pathToFileURL(resolve(esbuildDir, esbuildPkg.main)).href)) as Esbuild;

const root = resolve(".");
const rootEntry = `export * from ${JSON.stringify(`${root}/dist/index.js`)};`;
const entries: [string, string][] = [["root", rootEntry]];
const groups = new Map<string, string[]>();
for (const e of await loadBundledProviders("."))
  groups.set(e.subpath, [...(groups.get(e.subpath) ?? []), e.exportName]);
for (const [subpath, names] of groups) {
  const file = `${root}/dist/${subpath.slice(2)}/index.js`;
  entries.push([
    subpath,
    `${rootEntry}\nexport { ${names.join(", ")} } from ${JSON.stringify(file)};`,
  ]);
}

const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
console.log(`bizdays-toolkit ${version} / esbuild ${esbuildPkg.version}`);
console.log("| 入口 | minify（バイト） | gzip（バイト） | README の値 |");
console.log("| --- | ---: | ---: | ---: |");
for (const [name, contents] of entries) {
  const result = await esbuild.build({
    stdin: { contents, resolveDir: root },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });
  const out = result.outputFiles[0]!.contents;
  const gz = gzipSync(out, { level: 9 }).length;
  console.log(`| ${name} | ${out.length} | ${gz} | ${(gz / 1000).toFixed(1)} KB |`);
}
