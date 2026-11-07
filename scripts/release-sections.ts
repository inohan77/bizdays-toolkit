/**
 * 版ごとの記録の節（CHANGELOG.md と docs/development-log.md）を、版の名前で引く。
 * 0.31.0 から、公開物の変わらない品質の仕組みの変更（「開発」）は docs/development-log.md に書く（RELEASING.md の「区分」）。
 * 0.29.x 以前の「開発」は CHANGELOG.md の各版にあるので、両方の節をつなげて返す（サイズの上限・測定値・性能の退行の記載を探す）
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 開発の記録のファイル（npm の公開物に含めない） */
export const DEVELOPMENT_LOG = "docs/development-log.md";

function sectionsOf(path: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(path)) return map;
  const parts = readFileSync(path, "utf8").split(/^## \[([^\]]+)\][^\n]*$/m);
  for (let i = 1; i < parts.length; i += 2) map.set(parts[i]!, parts[i + 1] ?? "");
  return map;
}

/** 版の名前（"Unreleased" を含む）→ CHANGELOG.md の節と docs/development-log.md の節をつなげた本文 */
export function releaseSections(dir = "."): Map<string, string> {
  const changelog = sectionsOf(resolve(dir, "CHANGELOG.md"));
  const log = sectionsOf(resolve(dir, DEVELOPMENT_LOG));
  const out = new Map<string, string>();
  for (const [name, text] of changelog) out.set(name, `${text}\n${log.get(name) ?? ""}`);
  for (const [name, text] of log) if (!out.has(name)) out.set(name, text);
  return out;
}
