/**
 * Runs the tests and checks of the work tree against the built files of another version: with this file loaded,
 * every import of an entry module of src (src/index.ts and src/<name>/index.ts, the public API) is resolved to
 * the same entry of dist of the package in OLD_PACKAGE. Internal modules of src stay those of the work tree.
 *
 * Usage (the package is an unpacked published package, or a built work tree of another version):
 *   OLD_PACKAGE=<dir> node --import ./scripts/old-build.ts --test "test/*.test.ts"
 *   OLD_PACKAGE=<dir> node --import ./scripts/old-build.ts scripts/promise-inventory.ts
 *
 * What it is for: before writing what earlier versions did (CHANGELOG, docs/decisions.md), the checks added for
 * a fix are run against the published versions, and the sentence is written from what failed (the quality
 * checks of RELEASING.md, "When adding a quality check", 1).
 * Limits: a test that passes an object made by the old build to an internal function of the work tree compares
 * two versions of the internals and may fail for that reason alone (read the failure before counting it).
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const old = process.env["OLD_PACKAGE"];
if (old === undefined || !existsSync(join(old, "dist", "index.js"))) {
  console.error("OLD_PACKAGE must name a directory that holds dist/index.js");
  process.exit(2);
}
// Compared with path.relative: on Windows it ignores the case of the drive letter, which may differ between
// process.cwd() and fileURLToPath (startsWith would then send every import to the src of the work tree)
const srcRoot = join(process.cwd(), "src");
const ENTRY = /^(?:[a-z]+[/\\])?index\.ts$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (!resolved.url.startsWith("file:")) return resolved;
    const path = fileURLToPath(resolved.url);
    const rel = relative(srcRoot, path);
    if (rel.startsWith("..") || isAbsolute(rel) || !ENTRY.test(rel)) return resolved;
    const target = join(old, "dist", rel.replace(/\.ts$/, ".js"));
    if (!existsSync(target)) throw new Error(`not in the old package: ${target}`);
    return { ...resolved, url: pathToFileURL(target).href };
  },
});
