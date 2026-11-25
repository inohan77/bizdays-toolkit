import "./strict-warnings.ts";
/**
 * Type-checks the published type definitions from a user's point of view (run by pnpm check; RELEASING.md,
 * reasons for the quality mechanisms, "runtimes that are checked").
 *
 * Checks test/consumer/consumer.mts with tsc under moduleResolution node16, nodenext and bundler, and checks
 * that test/consumer/consumer-error.mts, which contains an intended type error, fails. Run after pnpm build.
 *
 * Arguments:
 *   --tsc <path>   The tsc to use (default: typescript/bin/tsc of the dev dependencies; the consumer-types job
 *                  of CI passes other versions)
 *   --label <text> Name added to the output (e.g. "TypeScript <version>")
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const tscArg = argValue("--tsc");
const tsc = tscArg ? resolve(tscArg) : createRequire(import.meta.url).resolve("typescript/bin/tsc");
const label = argValue("--label") ?? "";
const version = execFileSync(process.execPath, [tsc, "--version"], { encoding: "utf8" }).trim();
const major = Number(/(\d+)\./.exec(version)?.[1] ?? 0);
// --ignoreConfig (do not read tsconfig.json) exists from 6.0. Before that, naming a file is enough not to read it
const ignoreConfig = major >= 6 ? ["--ignoreConfig"] : [];

const emptyTypeRoots = mkdtempSync(join(tmpdir(), "bizdays-types-"));
const settings: [string, string][] = [
  ["node16", "node16"],
  ["nodenext", "nodenext"],
  ["bundler", "esnext"],
];

function run(
  file: string,
  moduleResolution: string,
  module: string,
): { ok: boolean; output: string } {
  const tscArgs = [
    ...ignoreConfig,
    // Do not read the repository's @types (node, ...): a user's type check does not need them, and they contain
    // types that old TypeScript versions cannot read
    "--typeRoots",
    emptyTypeRoots,
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "false",
    "--target",
    "es2022",
    "--lib",
    "es2022",
    "--module",
    module,
    "--moduleResolution",
    moduleResolution,
    file,
  ];
  try {
    const output = execFileSync(process.execPath, [tsc, ...tscArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output };
  } catch (e) {
    const out = e as { stdout?: string; stderr?: string };
    return { ok: false, output: `${out.stdout ?? ""}${out.stderr ?? ""}` };
  }
}

const failures: string[] = [];
for (const [moduleResolution, module] of settings) {
  const good = run("test/consumer/consumer.mts", moduleResolution, module);
  if (!good.ok) failures.push(`moduleResolution ${moduleResolution}:\n${good.output}`);
  // Check that the check works: an input with a type error fails and its output contains the error position
  const bad = run("test/consumer/consumer-error.mts", moduleResolution, module);
  if (bad.ok || !bad.output.includes("consumer-error.mts")) {
    failures.push(
      `moduleResolution ${moduleResolution}: the intentional type error in consumer-error.mts was not reported\n${bad.output}`,
    );
  }
}
rmSync(emptyTypeRoots, { recursive: true, force: true });
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `OK   consumer types (${label || version}): ${settings.map(([m]) => m).join(", ")} (and the intentional error is reported)`,
);
