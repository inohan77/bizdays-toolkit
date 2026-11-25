import "./strict-warnings.ts";
/**
 * Checks the versions of the development tools (Node.js, npm, pnpm) (run first by pnpm check; RELEASING.md,
 * reasons for the quality mechanisms, "runtimes that are checked").
 *
 * - The workflows agree on the Node.js version of each release line (the matrix of `check` in ci.yml is the
 *   reference)
 * - The matrix of `compat` in ci.yml contains the lower bound of `engines` (package.json)
 * - The running Node.js, npm and pnpm equal the pinned versions of CI (the matrix of `check` and
 *   setup-toolchain). An error in CI, only a notice locally (the local tools are sometimes changed first, e.g.
 *   because of the maturity gate; work does not stop until RELEASING.md's development-environment versions
 *   catch up)
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const read = (path: string): string => readFileSync(path, "utf8");
const ci = read(".github/workflows/ci.yml");
const others: [string, string][] = [
  [".github/workflows/release.yml", read(".github/workflows/release.yml")],
  [".github/workflows/data-watch.yml", read(".github/workflows/data-watch.yml")],
  [".github/workflows/result-compare-wide.yml", read(".github/workflows/result-compare-wide.yml")],
];
const action = read(".github/actions/setup-toolchain/action.yml");
const pkg = JSON.parse(read("package.json")) as { engines: { node: string } };

const errors: string[] = [];
const notices: string[] = [];
const inCi = process.env["CI"] === "true";

/** Cuts out the body of each job of a workflow (headings indented by two spaces) */
function jobs(text: string): Map<string, string> {
  const body = text.slice(text.indexOf("\njobs:\n"));
  const map = new Map<string, string>();
  const parts = body.split(/\n(?= {2}[\w-]+:\s*$)/m);
  for (const part of parts) {
    const name = /^ {2}([\w-]+):/.exec(part)?.[1];
    if (name) map.set(name, part);
  }
  return map;
}
const matrixOf = (job: string | undefined): string[] =>
  [...(/node: \[([^\]]*)\]/.exec(job ?? "")?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
const literals = (text: string): string[] =>
  [...text.matchAll(/node-version: "([^"]+)"/g)].map((m) => m[1]!);
const major = (version: string): string => version.replace(/^v/, "").split(".")[0]!;

const ciJobs = jobs(ci);
const checkNodes = matrixOf(ciJobs.get("check"));
const compatNodes = matrixOf(ciJobs.get("compat"));
if (checkNodes.length === 0) errors.push("ci.yml: the check job has no node matrix");

// 1. Node.js versions across the workflows
const places: [string, string][] = [
  // Versions pinned by the jobs of ci.yml other than check (the build of compat, browsers, safari, workerd, ...)
  ...[...ciJobs]
    .filter(([name]) => name !== "check")
    .flatMap(([name, text]) =>
      literals(text).map((v): [string, string] => [`ci.yml (${name})`, v]),
    ),
  ...others.flatMap(([path, text]) => literals(text).map((v): [string, string] => [path, v])),
];
for (const [where, version] of places) {
  const pinned = checkNodes.find((v) => major(v) === major(version));
  if (pinned === undefined) {
    errors.push(
      `${where}: Node.js ${version} has no matching series in the check matrix (${checkNodes.join(", ")})`,
    );
  } else if (pinned !== version) {
    errors.push(`${where}: Node.js ${version} differs from the check matrix (${pinned})`);
  }
}

// 2. The lower bound of engines is checked by compat
const floor = /^>=\s*(\d+)\.(\d+)(?:\.(\d+))?$/.exec(pkg.engines.node);
if (!floor) {
  errors.push(`package.json: unexpected engines.node ${pkg.engines.node}`);
} else {
  const version = `${floor[1]}.${floor[2]}.${floor[3] ?? "0"}`;
  if (!compatNodes.includes(version)) {
    errors.push(`ci.yml: the compat matrix must include the engines floor ${version}`);
  }
}

// 3. The running versions and the pinned versions
const npmPin = /NPM_VERSION: "([^"]+)"/.exec(action)?.[1];
const pnpmPin = /PNPM_VERSION: "([^"]+)"/.exec(action)?.[1];
const local: string[] = [];
const nodeVersion = process.version.slice(1);
if (!checkNodes.includes(nodeVersion)) {
  local.push(`Node.js ${nodeVersion} is not in the CI check matrix (${checkNodes.join(", ")})`);
}
const npmVersion = execSync("npm -v", { encoding: "utf8" }).trim();
if (npmVersion !== npmPin) local.push(`npm ${npmVersion} differs from the CI pin (${npmPin})`);
const pnpmVersion = /\bpnpm\/(\S+)/.exec(process.env["npm_config_user_agent"] ?? "")?.[1];
if (pnpmVersion === undefined) {
  notices.push("pnpm version not checked (run through pnpm check to check it)");
} else if (pnpmVersion !== pnpmPin) {
  local.push(`pnpm ${pnpmVersion} differs from the CI pin (${pnpmPin})`);
}
if (inCi) errors.push(...local);
else
  notices.push(
    ...local.map((l) => `${l}; align the local toolchain or update the CI pins (RELEASING.md)`),
  );

for (const n of notices) console.log(`NOTICE ${n}`);
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `OK   toolchain: Node.js ${checkNodes.join(", ")} / npm ${npmPin} / pnpm ${pnpmPin}` +
    (compatNodes.length > 0 ? ` (compat: ${compatNodes.join(", ")})` : ""),
);
