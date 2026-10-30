/**
 * 公開するエントリーごとのサイズ（gzip）を測り、size-limits.json の上限と比べる（pnpm check から実行）。
 *
 * 各エントリーから読み込まれる dist のファイルを、import をたどって集め、連結して gzip で測る。
 * minify はしない（minify のための依存を足さないため）。README に書く minify 後のサイズは、公開前に別途測る。
 *
 * 上限を上げる（エントリーを足す）ときは、size-limits.json を手で直して、理由を CHANGELOG の
 * 「開発」に「サイズの上限」という言葉を含めて書くこと。前の版のタグの size-limits.json と比べて、
 * 上限が上がっているのに記載がなければ失敗する（checkLimitChanges）。上限を変えた版では、CHANGELOG の測定値（測定 N）も
 * 1 つ以上照合できなければ失敗する（checkChangelogFigures。decisions.md の 50 番）。
 */

import "./strict-warnings.ts";
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

/** git を実行して出力を返す（git やタグがなければ undefined） */
function git(args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

/** タグの時点の size-limits.json（読めなければ undefined） */
function limitsAt(tag: string): Record<string, number> | undefined {
  const text = git(["show", `${tag}:size-limits.json`]);
  return text === undefined ? undefined : (JSON.parse(text) as Record<string, number>);
}

/** タグが HEAD を指しているか（リリースのワークフローでタグを付けたコミットを検査しているか） */
function tagIsHead(tag: string): boolean {
  const head = git(["rev-parse", "HEAD"])?.trim();
  const tagged = git(["rev-parse", `${tag}^{commit}`])?.trim();
  return head !== undefined && head === tagged;
}

/**
 * 前の版のタグと比べて上限が上がっていれば、CHANGELOG に理由の記載があるかを確かめる。
 *
 * 比べるタグと、記載を探す節:
 * - 現在の版のタグがあり、HEAD 以外を指す（公開後の開発中）: そのタグと比べ、[Unreleased] を探す
 * - それ以外（公開の準備中・リリースのワークフローでタグのコミットを検査中）: CHANGELOG で 1 つ前の版のうち
 *   タグがある最新のものと比べ、[Unreleased] と現在の版の節を探す
 *
 * タグを読めないときは、手元では確認を飛ばし、CI（環境変数 CI が設定されている）では失敗する。
 * CI のワークフローは履歴とタグを取得する（fetch-depth: 0）ので、読めないのは設定の誤り。
 * changed は、上限が上がったか、探した節に「サイズの上限」があるか（測定値の記載が必須の版か）
 */
function checkLimitChanges(): { ok: boolean; changed: boolean } {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const sections = new Map<string, string>();
  const parts = changelog.split(/^## \[([^\]]+)\][^\n]*$/m);
  for (let i = 1; i < parts.length; i += 2) sections.set(parts[i]!, parts[i + 1] ?? "");
  const versions = [...sections.keys()].filter((v) => v !== "Unreleased");

  let base: string | undefined;
  let baseLimits: Record<string, number> | undefined;
  const searched = ["Unreleased"];
  const currentTag = `v${pkg.version}`;
  const currentLimits = limitsAt(currentTag);
  if (currentLimits && !tagIsHead(currentTag)) {
    base = currentTag;
    baseLimits = currentLimits;
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
    if (process.env["CI"]) {
      console.error(
        "Cannot read release tags with git in CI; check out with fetch-depth: 0 to compare size limits",
      );
      return { ok: false, changed: false };
    }
    console.log("SKIP limit changes: no release tag readable with git (run git fetch --tags)");
    return { ok: true, changed: false };
  }
  const noted = searched.some((name) => sections.get(name)?.includes("サイズの上限"));
  const raised = Object.entries(limits).filter(([entry, limit]) => {
    const before = baseLimits[entry];
    return before === undefined || limit > before;
  });
  if (raised.length === 0) {
    console.log(`OK   limits are not raised since ${base}`);
    return { ok: true, changed: noted };
  }
  const detail = raised
    .map(([entry, limit]) => `${entry} ${baseLimits[entry] ?? "(new)"} -> ${limit}`)
    .join(", ");
  if (noted) {
    console.log(`OK   limits raised since ${base} (${detail}); reason is in CHANGELOG`);
    return { ok: true, changed: true };
  }
  console.error(
    `Size limits raised since ${base} (${detail}), but CHANGELOG [${searched.join("] / [")}] ` +
      'has no entry mentioning "サイズの上限". Write the reason under 開発.',
  );
  return { ok: false, changed: true };
}

/**
 * CHANGELOG の今の版（または [Unreleased]）の節に書いた測定値（「`<エントリー>` … 測定 N」。ルートは「ルート … 測定 N」）が、
 * 実際の測定と一致するかを確かめる。測り直し忘れを防ぐ（decisions.md の 50 番の納品の手順）。
 * required（上限を変えた版）なのに照合できた測定値が 1 つもなければ失敗する（書き方が変わって照合が黙って外れるのを防ぐ）
 */
function checkChangelogFigures(measured: ReadonlyMap<string, number>, required: boolean): boolean {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const parts = changelog.split(/^## \[([^\]]+)\][^\n]*$/m);
  const sections = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) sections.set(parts[i]!, parts[i + 1] ?? "");
  const text = `${sections.get("Unreleased") ?? ""}\n${sections.get(pkg.version) ?? ""}`;
  let ok = true;
  let compared = 0;
  for (const m of text.matchAll(/(?:`(\.\/[a-z]+|\.)`|ルート)[^\n（(]*?[（(]測定 ([\d,]+)/g)) {
    const entry = m[1] ?? ".";
    const stated = Number(m[2]!.replaceAll(",", ""));
    const actual = measured.get(entry);
    if (actual === undefined) continue;
    compared++;
    if (actual !== stated) {
      console.error(
        `CHANGELOG states 測定 ${m[2]} for ${entry}, but the measurement is ${actual}; re-measure after the last change`,
      );
      ok = false;
    }
  }
  if (compared === 0 && required) {
    console.error(
      'CHANGELOG has no figure written as "（測定 N）" for this version, though the size limits changed; ' +
        "write the measured sizes in that form under 開発",
    );
    return false;
  }
  console.log(`OK   CHANGELOG figures compared: ${compared}`);
  return ok;
}

const limitChanges = checkLimitChanges();
let failed = !limitChanges.ok;
const measured = new Map<string, number>();
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
  measured.set(subpath, size);
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
if (!checkChangelogFigures(measured, limitChanges.changed)) failed = true;
process.exit(failed ? 1 : 0);
