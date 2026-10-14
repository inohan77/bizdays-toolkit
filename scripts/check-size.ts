/**
 * 公開するエントリーごとのサイズ（gzip）を測り、size-limits.json の上限と比べる（pnpm check から実行）。
 *
 * 各エントリーから読み込まれる dist のファイルを、import をたどって集め、連結して gzip で測る。
 * minify はしない（minify のための依存を足さないため）。README に書く minify 後のサイズは、公開前に別途測る。
 *
 * 上限を上げるときは、size-limits.json を手で直して、理由をコミットメッセージに書くこと。
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";

interface Pkg {
  exports: Record<string, string | { default: string }>;
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Pkg;
const limits = JSON.parse(readFileSync("size-limits.json", "utf8")) as Record<string, number>;

/** エントリーから import・export ... from でたどれる dist の .js をすべて集める */
function moduleGraph(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    const path = normalize(file);
    if (seen.has(path)) return;
    seen.add(path);
    const source = readFileSync(path, "utf8");
    for (const m of source.matchAll(/(?:import|export)\s[^;]*?from\s*["'](\.[^"']+)["']/g)) {
      visit(join(dirname(path), m[1]!));
    }
  };
  visit(entry);
  return [...seen].sort();
}

let failed = false;
for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (typeof target === "string") continue;
  const limit = limits[subpath];
  if (!existsSync(target.default)) {
    console.error(`${subpath}: ${target.default} not found (run pnpm build first)`);
    failed = true;
    continue;
  }
  const files = moduleGraph(target.default);
  const size = gzipSync(Buffer.concat(files.map((f) => readFileSync(f))), { level: 9 }).length;
  if (limit === undefined) {
    console.error(`${subpath}: no limit in size-limits.json (gzip ${size} bytes)`);
    failed = true;
    continue;
  }
  const ok = size <= limit;
  if (!ok) failed = true;
  console.log(
    `${ok ? "OK  " : "OVER"} ${subpath.padEnd(6)} gzip ${String(size).padStart(6)} bytes / limit ${limit} (${Math.round((size / limit) * 100)}%, ${files.length} files)`,
  );
}
process.exit(failed ? 1 : 0);
