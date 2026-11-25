import "./strict-warnings.ts";
/**
 * The table of lines the promise checks do not reach (G1 of the plan; RELEASING.md, "Checks that keep the promises
 * of the diagnostics"; the promise-coverage job of CI).
 *
 * Runs the checks of the promises of the diagnostics alone (test/diagnose-properties.test.ts with
 * DIAGNOSE_PROPERTY_FULL=1, and the full set of scripts/promise-inventory.ts) with the block coverage of V8, and
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
 *   node scripts/check-promise-coverage.ts --part <i>/<n> --keep <dir>
 *                                                          ... run only the runs of part i (COVERAGE_PARTS) and keep
 *                                                              their coverage files; the table is not checked
 * The promise checks are split into runs (COVERAGE_RUN_NAMES of scripts/promise-parts.ts: the property tests in two
 * runs, and one run per group of the promise inventory), each with a directory of coverage files of its own. Without
 * --part every run starts at the same time. CI runs the parts in jobs of their own (promise-coverage-part, a job
 * runs within 10 minutes) and checks the table against all their files in one job (promise-coverage, --reuse);
 * --reuse fails when the files of a run are missing.
 * Exit code: 0 = pass, 1 = a problem, 2 = wrong arguments.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  executedOffsetsTogether,
  functionsOf,
  missedLinesOf,
  offsetsIn,
  type CoverageRun,
} from "./coverage-parts.ts";
import {
  COVERAGE_PARTS,
  COVERAGE_RUN_NAMES,
  INVENTORY_GROUPS,
  LONGEST_PROPERTY,
  checkCoverageParts,
  checkCoverageTable,
  type CoverageBlock,
  type CoverageTable,
} from "./promise-parts.ts";

const TARGET = "src/core/diagnose.ts";
const TABLE = "etc/promise-coverage.json";

const args = process.argv.slice(2);
const usage = (message: string): never => {
  console.error(message);
  console.error(
    "usage: node scripts/check-promise-coverage.ts [--keep <dir> | --reuse <dir> | --part <i>/<n> --keep <dir>]",
  );
  process.exit(2);
};
const valueOf = (name: string): string | undefined => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1] ?? usage(`${name} needs a value`);
};
for (let i = 0; i < args.length; i += 2)
  if (!["--keep", "--reuse", "--part"].includes(args[i]!)) usage(`unknown argument ${args[i]!}`);
const keep = valueOf("--keep");
const reuse = valueOf("--reuse");
const partText = valueOf("--part");
if (keep !== undefined && reuse !== undefined) usage("--keep and --reuse cannot be used together");
if (partText !== undefined && keep === undefined)
  usage("--part needs --keep (the files are read later)");
const partMatch = partText === undefined ? null : /^(\d+)\/(\d+)$/.exec(partText);
if (
  partText !== undefined &&
  (partMatch === null ||
    Number(partMatch[2]) !== COVERAGE_PARTS.length ||
    Number(partMatch[1]) < 1 ||
    Number(partMatch[1]) > COVERAGE_PARTS.length)
)
  usage(
    `--part: invalid value ${partText} (1/${COVERAGE_PARTS.length} to ${COVERAGE_PARTS.length}/${COVERAGE_PARTS.length})`,
  );

const PROPERTIES = ["--import", "./scripts/strict-warnings.ts", "--test", "--test-reporter=tap"];
/**
 * Whether the TAP output of a test run has a passed test whose name starts with the longest property test (a
 * skipped test is also reported as ok, so a line marked # SKIP does not count)
 */
const ranLongest = (stdout: string): boolean =>
  stdout
    .split("\n")
    .some(
      (line) =>
        /^ok \d+ - /.test(line) &&
        !line.includes(" # SKIP") &&
        line.slice(line.indexOf(" - ") + 3).startsWith(LONGEST_PROPERTY),
    );
/**
 * The promise checks: the property tests of the diagnostics (full set; the longest test, and the others) and the
 * promise inventory (full set; one run per group). The name pattern of node:test passes also when it matches no
 * test, so the run of the longest test must show it, and the other run must show another test and not it
 */
const RUNS: readonly CoverageRun[] = [
  {
    label: `test/diagnose-properties.test.ts (DIAGNOSE_PROPERTY_FULL=1): the test "${LONGEST_PROPERTY}…"`,
    dir: "properties-longest",
    args: [
      ...PROPERTIES,
      `--test-name-pattern=^${LONGEST_PROPERTY}`,
      "test/diagnose-properties.test.ts",
    ],
    env: { DIAGNOSE_PROPERTY_FULL: "1" },
    passes: ranLongest,
  },
  {
    label: "test/diagnose-properties.test.ts (DIAGNOSE_PROPERTY_FULL=1): the other tests",
    dir: "properties-others",
    args: [
      ...PROPERTIES,
      `--test-skip-pattern=^${LONGEST_PROPERTY}`,
      "test/diagnose-properties.test.ts",
    ],
    env: { DIAGNOSE_PROPERTY_FULL: "1" },
    passes: (stdout) => !ranLongest(stdout) && /^ok \d+ - 性質(?!.*# SKIP)/m.test(stdout),
  },
  ...INVENTORY_GROUPS.map((g) => ({
    label: `scripts/promise-inventory.ts --group ${g.name}`,
    dir: `inventory-${g.name}`,
    args: ["scripts/promise-inventory.ts", "--group", g.name],
  })),
];
{
  const problems = checkCoverageParts(
    COVERAGE_PARTS,
    RUNS.map((r) => r.dir!),
  );
  if (RUNS.map((r) => r.dir).join() !== COVERAGE_RUN_NAMES.join())
    problems.push("the runs differ from COVERAGE_RUN_NAMES of scripts/promise-parts.ts");
  if (problems.length > 0) {
    for (const p of problems) console.error(`NG   ${p}`);
    console.error(
      "FAILED the parts of the coverage runs (COVERAGE_PARTS of scripts/promise-parts.ts)",
    );
    process.exit(1);
  }
}

let executed: Map<string, Uint8Array>;
if (reuse !== undefined) {
  if (!existsSync(reuse)) usage(`--reuse: ${reuse} does not exist`);
  // Every run must have left its files (a part of CI that did not run would otherwise pass unnoticed)
  const missing = COVERAGE_RUN_NAMES.filter(
    (name) =>
      !existsSync(join(reuse, name)) ||
      !readdirSync(join(reuse, name)).some((f) => f.endsWith(".json")),
  );
  if (missing.length > 0) {
    console.error(`FAILED no coverage files of ${missing.join(", ")} in ${reuse}`);
    process.exit(1);
  }
  const dirs = COVERAGE_RUN_NAMES.map((name) => join(reuse, name));
  executed = offsetsIn(dirs);
  console.log(`read the coverage files kept in ${reuse} (${dirs.length} run(s))`);
} else {
  if (keep !== undefined) mkdirSync(keep, { recursive: true });
  const part = partMatch === null ? undefined : COVERAGE_PARTS[Number(partMatch[1]) - 1]!;
  const runs = part === undefined ? RUNS : RUNS.filter((r) => part.includes(r.dir!));
  let failed = false;
  executed = await executedOffsetsTogether(
    runs,
    (run, status, stdout, stderr) => {
      console.error(stdout.split("\n").slice(-40).join("\n"), stderr);
      console.error(
        status === 0
          ? `FAILED ${run.label} did not run the tests it must run (exit code 0)`
          : `FAILED ${run.label} did not pass (exit code ${String(status)})`,
      );
      failed = true;
    },
    keep,
  );
  if (failed) process.exit(1);
  if (part !== undefined) {
    console.log(
      `OK   part ${partText!}: kept the coverage files of ${part.join(", ")} in ${keep!}`,
    );
    process.exit(0);
  }
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
