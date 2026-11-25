/**
 * Looks up the record sections of a version (CHANGELOG.md and docs/development-log.md) by the version's name.
 * From 0.31.0, changes of the quality mechanisms that do not change the published files (the development
 * category) are written in docs/development-log.md (RELEASING.md, the categories).
 * Up to 0.29.x the development category is in each version of CHANGELOG.md, so both sections are joined (to
 * search for the notes on size limits, measured values and performance regressions)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The file of the development log (not part of the npm package) */
export const DEVELOPMENT_LOG = "docs/development-log.md";

function sectionsOf(path: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(path)) return map;
  const parts = readFileSync(path, "utf8").split(/^## \[([^\]]+)\][^\n]*$/m);
  for (let i = 1; i < parts.length; i += 2) map.set(parts[i]!, parts[i + 1] ?? "");
  return map;
}

/**
 * Version name (including "Unreleased") → the section of CHANGELOG.md joined with the section of
 * docs/development-log.md
 */
export function releaseSections(dir = "."): Map<string, string> {
  const changelog = sectionsOf(resolve(dir, "CHANGELOG.md"));
  const log = sectionsOf(resolve(dir, DEVELOPMENT_LOG));
  const out = new Map<string, string>();
  for (const [name, text] of changelog) out.set(name, `${text}\n${log.get(name) ?? ""}`);
  for (const [name, text] of log) if (!out.has(name)) out.set(name, text);
  return out;
}
