/**
 * 公開するエントリーごとのサイズ（gzip）を測り、size-limits.json の上限と比べる（pnpm check から実行）。
 *
 * 各エントリーから読み込まれる dist のファイルを、import をたどって集め、連結して gzip で測る。
 * minify はしない（minify のための依存を足さないため）。README に書く minify 後のサイズは、公開前に別途測る。
 *
 * 上限を上げる（エントリーを足す）ときは、size-limits.json を手で直して、理由を CHANGELOG の
 * 「開発」に「サイズの上限」という言葉を含めて書くこと。前の版のタグの size-limits.json と比べて、
 * 上限が上がっているのに記載がなければ失敗する（checkLimitChanges）。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";

interface Pkg {
  version: string;
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

/** タグの時点の size-limits.json（git やタグがなければ undefined） */
function limitsAt(tag: string): Record<string, number> | undefined {
  try {
    const text = execFileSync("git", ["show", `${tag}:size-limits.json`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(text) as Record<string, number>;
  } catch {
    return undefined;
  }
}

/**
 * 前の版のタグと比べて上限が上がっていれば、CHANGELOG に理由の記載があるかを確かめる。
 *
 * 比べるタグ: 現在の版のタグがあれば（公開後）そのタグと比べ、[Unreleased] に記載を求める。
 * なければ（公開の準備中）、CHANGELOG で 1 つ前の版のうちタグがある最新のものと比べ、
 * [Unreleased] か現在の版の節に記載を求める。
 * タグを読めない環境（CI の checkout はタグを取得しない）では確認を飛ばす。手元の pnpm check で確かめる
 */
function checkLimitChanges(): boolean {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const sections = new Map<string, string>();
  const parts = changelog.split(/^## \[([^\]]+)\][^\n]*$/m);
  for (let i = 1; i < parts.length; i += 2) sections.set(parts[i]!, parts[i + 1] ?? "");
  const versions = [...sections.keys()].filter((v) => v !== "Unreleased");

  let base: string | undefined;
  let baseLimits: Record<string, number> | undefined;
  const searched = ["Unreleased"];
  baseLimits = limitsAt(`v${pkg.version}`);
  if (baseLimits) {
    base = `v${pkg.version}`;
  } else {
    searched.push(pkg.version);
    for (const v of versions.filter((v) => v !== pkg.version)) {
      baseLimits = limitsAt(`v${v}`);
      if (baseLimits) {
        base = `v${v}`;
        break;
      }
    }
  }
  if (!base || !baseLimits) {
    console.log(
      "SKIP limit changes: no release tag readable with git (checked locally before commit)",
    );
    return true;
  }
  const raised = Object.entries(limits).filter(([entry, limit]) => {
    const before = baseLimits[entry];
    return before === undefined || limit > before;
  });
  if (raised.length === 0) {
    console.log(`OK   limits are not raised since ${base}`);
    return true;
  }
  const detail = raised
    .map(([entry, limit]) => `${entry} ${baseLimits[entry] ?? "(new)"} -> ${limit}`)
    .join(", ");
  const noted = searched.some((name) => sections.get(name)?.includes("サイズの上限"));
  if (noted) {
    console.log(`OK   limits raised since ${base} (${detail}); reason is in CHANGELOG`);
    return true;
  }
  console.error(
    `Size limits raised since ${base} (${detail}), but CHANGELOG [${searched.join("] / [")}] ` +
      'has no entry mentioning "サイズの上限". Write the reason under 開発.',
  );
  return false;
}

let failed = !checkLimitChanges();
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
    `${ok ? "OK  " : "OVER"} ${subpath.padEnd(10)} gzip ${String(size).padStart(6)} bytes / limit ${limit} (${Math.round((size / limit) * 100)}%, ${files.length} files)`,
  );
}
process.exit(failed ? 1 : 0);
