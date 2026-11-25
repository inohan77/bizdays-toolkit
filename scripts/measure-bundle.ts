/**
 * Measures the minified + gzip sizes for the README (run by hand; RELEASING.md, the section on the sizes in the
 * README).
 *
 * Entries that load everything of the root, and each country provider (per subpath, only that provider's
 * exports), are bundled and minified with esbuild and measured with gzip (level 9). 1 KB is 1,000 bytes. Build
 * dist with pnpm build first.
 *
 * Usage: node scripts/measure-bundle.ts --esbuild <dir>/node_modules/esbuild
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
