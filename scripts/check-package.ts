/**
 * ビルド後の公開パッケージを検査する（pnpm check から実行）。
 *
 * - 公開されるファイルが dist・README・CHANGELOG・LICENSE・package.json だけであること
 * - exports のすべてのエントリーが存在し、読み込めること
 * - ランタイムの依存（dependencies）がないこと
 * - CHANGELOG.md に現在の版の節があること
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface Pkg {
  name: string;
  version: string;
  files: string[];
  dependencies?: Record<string, string>;
  exports: Record<string, string | { types: string; default: string }>;
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Pkg;
const errors: string[] = [];

const changelog = readFileSync("CHANGELOG.md", "utf8");
if (!changelog.includes(`## [${pkg.version}]`)) {
  errors.push(`CHANGELOG.md has no section for ${pkg.version}`);
}

if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
  errors.push(`dependencies must be empty: ${Object.keys(pkg.dependencies).join(", ")}`);
}

// 公開されるファイルを package.json の files から数える（npm を起動しないので OS に依存しない）。
// npm が実際に含めるファイルは、CI のログ（npm pack --dry-run）でも確認できる
function walk(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => walk(join(path, name)));
}
const published = new Set<string>(["package.json"]);
for (const entry of pkg.files) {
  if (!existsSync(entry)) {
    errors.push(`"files" entry not found: ${entry}`);
    continue;
  }
  for (const file of walk(entry)) published.add(file.replaceAll("\\", "/"));
}
const files = [...published].sort();
const allowed = /^(dist\/.+\.(js|d\.ts)|README\.md|CHANGELOG\.md|LICENSE|package\.json)$/;
for (const f of files) if (!allowed.test(f)) errors.push(`unexpected file in package: ${f}`);

for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (typeof target === "string") continue;
  for (const file of [target.types, target.default]) {
    if (!existsSync(file)) errors.push(`${subpath}: missing ${file}`);
  }
  if (existsSync(target.default)) {
    const mod = (await import(pathToFileURL(target.default).href)) as Record<string, unknown>;
    if (Object.keys(mod).length === 0) errors.push(`${subpath}: no exports`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK: ${pkg.name}@${pkg.version} (${files.length} files)`);
console.log(files.map((f) => `  ${f}`).join("\n"));
