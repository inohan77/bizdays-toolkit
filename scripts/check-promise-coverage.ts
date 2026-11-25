import "./strict-warnings.ts";
/**
 * The table of lines the promise checks do not reach (G1 of the plan; RELEASING.md, "Checks that keep the promises
 * of the diagnostics"; the promise-coverage job of CI).
 *
 * Runs the checks of the promises of the diagnostics alone (test/diagnose-properties.test.ts with
 * DIAGNOSE_PROPERTY_FULL=1, and the full set of scripts/promise-inventory.ts; at the same time) with the block
 * coverage of V8, and
 * lists the lines of the functions of src/core/diagnose.ts that did not run (a line with a token that did not
 * run, also when only part of the line did not run; the same counting as scripts/check-unit-tests.ts, shared in
 * scripts/coverage-parts.ts). Consecutive such lines of one function form a block (lines without a token, such as
 * blank lines and comments, do not split a block).
 * Every block must be in etc/promise-coverage.json with the function, the text of its first line (trimmed), its
 * number of lines, the kind and the reason. The kinds are only "option-error" (a report of a mistake in the
 * options, which the promise does not cover) and "unreachable" (a branch no input reaches). A line that decides a
 * result of the diagnostics is not listed: the promise checks are extended until they reach it.
 * The check fails for a block not in the table, an entry that matches no block (the block ran or changed: the
 * table must follow the code), an entry without a reason or with another kind, and a failure of the promise checks
 * themselves.
 *
 *   node scripts/check-promise-coverage.ts                 ... run the promise checks and check the table
 *   node scripts/check-promise-coverage.ts --keep <dir>    ... also keep the coverage files in <dir>
 *   node scripts/check-promise-coverage.ts --reuse <dir>   ... check the table against coverage files kept before
 *                                                              (to try a change of the table quickly)
 * Exit code: 0 = pass, 1 = a problem, 2 = wrong arguments.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  executedOffsetsTogether,
  functionsOf,
  missedLinesOf,
  offsetsIn,
} from "./coverage-parts.ts";
import { checkCoverageTable, type CoverageBlock, type CoverageTable } from "./promise-parts.ts";

const TARGET = "src/core/diagnose.ts";
const TABLE = "etc/promise-coverage.json";

const args = process.argv.slice(2);
const usage = (message: string): never => {
  console.error(message);
  console.error("usage: node scripts/check-promise-coverage.ts [--keep <dir> | --reuse <dir>]");
  process.exit(2);
};
const valueOf = (name: string): string | undefined => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1] ?? usage(`${name} needs a value`);
};
for (let i = 0; i < args.length; i += 2)
  if (args[i] !== "--keep" && args[i] !== "--reuse") usage(`unknown argument ${args[i]!}`);
const keep = valueOf("--keep");
const reuse = valueOf("--reuse");
if (keep !== undefined && reuse !== undefined) usage("--keep and --reuse cannot be used together");

/**
 * The promise checks: the property tests of the diagnostics (full set) and the promise inventory (full set, in its
 * four shards). They run at the same time
 */
const RUNS = [
  {
    label: "test/diagnose-properties.test.ts (DIAGNOSE_PROPERTY_FULL=1)",
    args: [
      "--import",
      "./scripts/strict-warnings.ts",
      "--test",
      "test/diagnose-properties.test.ts",
    ],
    env: { DIAGNOSE_PROPERTY_FULL: "1" },
  },
  ...[1, 2, 3, 4].map((i) => ({
    label: `scripts/promise-inventory.ts --shard ${i}/4`,
    args: ["scripts/promise-inventory.ts", "--shard", `${i}/4`],
  })),
];

let executed: Map<string, Uint8Array>;
if (reuse !== undefined) {
  if (!existsSync(reuse)) usage(`--reuse: ${reuse} does not exist`);
  const dirs = readdirSync(reuse).map((d) => join(reuse, d));
  executed = offsetsIn(dirs);
  console.log(`read the coverage files kept in ${reuse} (${dirs.length} run(s))`);
} else {
  if (keep !== undefined) mkdirSync(keep, { recursive: true });
  let failed = false;
  executed = await executedOffsetsTogether(
    RUNS,
    (run, status, stdout, stderr) => {
      console.error(stdout.split("\n").slice(-40).join("\n"), stderr);
      console.error(`FAILED ${run.label} did not pass (exit code ${String(status)})`);
      failed = true;
    },
    keep,
  );
  if (failed) process.exit(1);
}

const ran = executed.get(TARGET);
if (ran === undefined) {
  console.error(`FAILED the promise checks did not load ${TARGET}`);
  process.exit(1);
}
const text = readFileSync(TARGET, "utf8");
const source = text.split("\n");
const blocks: CoverageBlock[] = [];
let executable = 0;
let missed = 0;
for (const fn of functionsOf(TARGET)) {
  executable += fn.tokens.size;
  const lines = missedLinesOf(fn, ran, text);
  missed += lines.size;
  // Lines of the function in order; a line with tokens that all ran ends a block, a line without a token does not
  const withTokens = [...fn.tokens.keys()].sort((a, b) => a - b);
  let current: number[] = [];
  const flush = (): void => {
    if (current.length === 0) return;
    blocks.push({
      function: fn.name,
      first: source[current[0]! - 1]!.trim(),
      lines: current.length,
      at: current[0]!,
      detail: current.map((n) => `${n}${lines.get(n)!}`).join(", "),
    });
    current = [];
  };
  for (const n of withTokens) {
    if (lines.has(n)) current.push(n);
    else flush();
  }
  flush();
}

const table = JSON.parse(readFileSync(TABLE, "utf8")) as CoverageTable;
const problems = checkCoverageTable(blocks, table);
console.log(
  `promise coverage of ${TARGET}: ${executable} executable lines in functions, ${missed} not run by the promise checks` +
    ` in ${blocks.length} block(s); ${TABLE} lists ${table.blocks.length}` +
    ` (option-error ${table.blocks.filter((b) => b.kind === "option-error").length},` +
    ` unreachable ${table.blocks.filter((b) => b.kind === "unreachable").length})`,
);
if (problems.length > 0) {
  for (const p of problems) console.error(`NG   ${p}`);
  console.error(`FAILED ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`OK   every line the promise checks do not reach is listed in ${TABLE} with a reason`);
