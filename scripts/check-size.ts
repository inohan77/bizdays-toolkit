/**
 * Measures the size (gzip) of each published entry and compares it with the limit in size-limits.json (run by
 * pnpm check).
 *
 * The dist files loaded from each entry are collected by following imports, concatenated and measured with
 * gzip. No minification (to avoid a dependency for it). The minified sizes in the README are measured separately
 * before publication.
 *
 * To raise a limit (or add an entry), edit size-limits.json by hand and write the reason in the development log
 * (docs/development-log.md; up to 0.29.x, the development part of the CHANGELOG) with the phrase that
 * checkLimitChanges searches for. When a limit is higher than in size-limits.json at the previous version's tag
 * and nothing is written, the check fails (checkLimitChanges). In a version that changes a limit, at least one
 * measured value in the CHANGELOG must also be matched (checkChangelogFigures; RELEASING.md, reasons for the
 * quality mechanisms, "write a rule in one place").
 * The new value follows a numeric rule (when the headroom falls below 1%: the measurement × 1.02 rounded up to
 * 100 bytes; raisedLimitFor).
 * In a version that raises a limit, the "measured for" version of the sizes in the README (English and
 * Japanese) must also be the current version (checkReadmeMeasured).
 */

import "./strict-warnings.ts";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";
import { skipWhen } from "../test/support/skip.ts";
import { releaseSections } from "./release-sections.ts";

interface Pkg {
  version: string;
  exports: Record<string, string | { default: string }>;
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Pkg;
const limits = JSON.parse(readFileSync("size-limits.json", "utf8")) as Record<string, number>;

/** Collects every .js of dist reachable from an entry through import and export ... from */
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

/** Runs git and returns its output (undefined without git or without the tag) */
function git(args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

/** size-limits.json at a tag (undefined when it cannot be read) */
function limitsAt(tag: string): Record<string, number> | undefined {
  const text = git(["show", `${tag}:size-limits.json`]);
  return text === undefined ? undefined : (JSON.parse(text) as Record<string, number>);
}

/** Whether a tag points at HEAD (the release workflow is checking the tagged commit) */
function tagIsHead(tag: string): boolean {
  const head = git(["rev-parse", "HEAD"])?.trim();
  const tagged = git(["rev-parse", `${tag}^{commit}`])?.trim();
  return head !== undefined && head === tagged;
}

/**
 * The numeric rule for raising a limit (the size-limit row of the quality table of RELEASING.md): when the
 * headroom falls below 1% of the limit (measurement > limit × 0.99), the limit becomes "the measurement × 1.02
 * rounded up to 100 bytes". Only entries whose headroom is below 1% under the previous version's limit may be
 * raised, and exactly to this value (a larger margin would hide the next unintended growth)
 */
const HEADROOM = 0.01;
const RAISE = 1.02;
const raisedLimitFor = (size: number): number => Math.ceil((size * RAISE) / 100) * 100;
/** The limits at the previous version's tag (undefined when they cannot be read) */
let baseLimitsForRule: Record<string, number> | undefined;

/**
 * A version that raises a limit re-measures the sizes in the README (English and Japanese) (RELEASING.md, the
 * section on the sizes in the README).
 * Whether they were measured is told by the "measured for" version written in the README, which must equal the
 * current version (`version` of package.json).
 * Only this check, which compares with the tag, knows that a limit was raised, so it stops here (check-package
 * looks at the minor series only)
 */
function checkReadmeMeasured(base: string): boolean {
  let ok = true;
  for (const [file, pattern] of [
    ["README.md", /measured for (\d+\.\d+\.\d+)/],
    ["docs/README.ja.md", /(\d+\.\d+\.\d+) で測定/],
  ] as const) {
    const measured = pattern.exec(readFileSync(file, "utf8"))?.[1];
    if (measured !== pkg.version) {
      console.error(
        `Size limits raised since ${base}, but ${file} states sizes measured for ${measured ?? "(not stated)"}, ` +
          `not ${pkg.version}; re-measure with scripts/measure-bundle.ts (RELEASING.md "README のサイズの値")`,
      );
      ok = false;
    }
  }
  return ok;
}

/**
 * When a limit is higher than at the previous version's tag, checks that the CHANGELOG states the reason.
 *
 * The tag compared and the sections searched:
 * - the current version's tag exists and points elsewhere than HEAD (development after publication): compare
 *   with that tag and search [Unreleased]
 * - otherwise (preparing a publication, or the release workflow checking the tagged commit): compare with the
 *   latest earlier version in the CHANGELOG that has a tag, and search [Unreleased] and the current version's
 *   section
 *
 * When tags cannot be read, the check is skipped locally and fails in CI (the environment variable CI is set).
 * The CI workflows fetch history and tags (fetch-depth: 0), so not being able to read them is a configuration
 * error.
 * `changed` tells whether a limit was raised or the searched sections contain the size-limit phrase (i.e.
 * whether the version must state measured values)
 */
function checkLimitChanges(): { ok: boolean; changed: boolean } {
  // The list of versions and the sections come from both CHANGELOG.md and docs/development-log.md
  // (scripts/release-sections.ts)
  const sections = releaseSections();
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
    // An intended skip (no-release-tag of test/support/skip.ts; in CI it fails above)
    console.log(`SKIP limit changes: ${skipWhen("no-release-tag", true)}`);
    return { ok: true, changed: false };
  }
  baseLimitsForRule = baseLimits;
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
  const readmeOk = checkReadmeMeasured(base);
  if (noted) {
    if (readmeOk)
      console.log(`OK   limits raised since ${base} (${detail}); reason is in CHANGELOG`);
    return { ok: readmeOk, changed: true };
  }
  console.error(
    `Size limits raised since ${base} (${detail}), but CHANGELOG [${searched.join("] / [")}] ` +
      'has no entry mentioning "サイズの上限". Write the reason in docs/development-log.md.',
  );
  return { ok: false, changed: true };
}

/**
 * Checks that the measured values written in the CHANGELOG section of the current version (or [Unreleased])
 * (an entry name followed by its measured value; see the regular expression below) equal the actual
 * measurements. Prevents forgetting to re-measure (RELEASING.md, reasons for the quality mechanisms, "write a
 * rule in one place", the delivery steps).
 * When `required` (a version that changes a limit) and no measured value could be matched, the check fails (so
 * that a changed wording does not silently drop the comparison)
 */
function checkChangelogFigures(measured: ReadonlyMap<string, number>, required: boolean): boolean {
  const sections = releaseSections();
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
  // The numeric rule. An entry raised since the previous version must have had less than 1% headroom under the
  // previous limit and be raised exactly to the rule's value. An entry that was not raised must have 1% headroom
  // or more (below 1%, the check asks to raise it to the rule's value)
  const before = baseLimitsForRule?.[subpath];
  const rule = raisedLimitFor(size);
  if (before !== undefined && limit > before) {
    if (size <= before * (1 - HEADROOM)) {
      // An entry with no reason to be raised. The rule's value can be lower than the previous limit, so it is
      // not shown
      console.error(
        `${subpath}: the limit was raised ${before} -> ${limit}, but a limit may be raised only when the headroom under the previous limit is below 1% (gzip ${size} / previous limit ${before}); keep it at ${before}`,
      );
      failed = true;
    } else if (limit !== rule) {
      console.error(
        `${subpath}: the limit was raised ${before} -> ${limit}; raise it to exactly ${rule} (gzip ${size} × 1.02, rounded up to 100 bytes)`,
      );
      failed = true;
    }
  } else if (size > limit * (1 - HEADROOM)) {
    console.error(
      `${subpath}: the headroom is below 1% (gzip ${size} / limit ${limit}); raise the limit to ${rule} (gzip × 1.02, rounded up to 100 bytes) and write the reason in docs/development-log.md`,
    );
    failed = true;
  }
  console.log(
    `${ok ? "OK  " : "OVER"} ${subpath.padEnd(10)} gzip ${String(size).padStart(6)} bytes / limit ${limit} (${Math.round((size / limit) * 100)}%, ${files.length} files)`,
  );
}
if (!checkChangelogFigures(measured, limitChanges.changed)) failed = true;
process.exit(failed ? 1 : 0);
