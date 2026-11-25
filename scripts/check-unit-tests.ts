import "./strict-warnings.ts";
/**
 * Checks that every function of src has a unit test.
 *
 * A function is a function declared at the top level of a module of src (a function declaration, or a const
 * initialized with an arrow function or a function expression) or a method or accessor of a class declared
 * there (named "<Class>.<member>"; the unit test file imports the class). It has a unit test when
 *   1. a file under test/unit has a top-level describe("<function name>", ...), and that file imports the
 *      function by that name from the function's module, and
 *   2. running the unit tests alone executes every executable line of the function. A line is executable when
 *      it holds a token of the function (comments do not count), and it is executed when every one of its
 *      tokens lies in a block that ran (the block coverage of V8, written by Node.js with NODE_V8_COVERAGE):
 *      a line with a branch that never ran (one side of ?:, the right side of && || ??, a statement after a
 *      condition) is not executed.
 *      The lcov report of --experimental-test-coverage is not used: it counts a line as executed when the
 *      block that never ran starts after the indentation of the line (seen with the statement of an if without
 *      braces on a line of its own), and merging the processes of several test files counts lines that no
 *      process executed.
 * Functions without a unit test must be listed in etc/unit-tests.json: under "pending" (to be written; the list
 * may only shrink) or under "exempt" with a reason (a fact: why the function cannot have a unit test of its
 * own). A line of a unit-tested function that no input can reach, or of which a part cannot be reached, is listed
 * under "unreachable" with its text and the reason. The check fails for
 *   - a function that has no unit test and is not listed,
 *   - a listed function that has a unit test, or that does not exist (the table must follow the code),
 *   - a function with a describe whose lines are not all executed by the unit tests (except the lines listed
 *     as unreachable), or an unreachable entry that is executed, has no reason or matches no line,
 *   - a top-level describe of test/unit that names no function imported from src.
 *
 *   node scripts/check-unit-tests.ts                  ... check
 *   node scripts/check-unit-tests.ts --write-pending  ... rewrite "pending" from the current state (to create the
 *                                                         table, or after removing functions; additions to it
 *                                                         must be approved like any change of a table)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import {
  executedOffsets,
  filesUnder,
  functionsOf,
  missedLinesOf,
  parse,
} from "./coverage-parts.ts";

const TABLE = "etc/unit-tests.json";
const UNIT_DIR = "test/unit";

/**
 * The functions a unit test file claims to test, and the describes that name none.
 * @param file - Path of a file under test/unit.
 * @returns `keys`: "<src file>#<name>" for every top-level describe("<name>") whose name the file imports from a
 *   module of src; `strays`: names of the other top-level describes.
 */
function describedIn(file: string): { keys: string[]; strays: string[] } {
  const sf = parse(file);
  const imported = new Map<string, string>();
  const names: string[] = [];
  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const from = statement.moduleSpecifier.text;
      const bindings = statement.importClause?.namedBindings;
      if (!from.startsWith(".") || !bindings || !ts.isNamedImports(bindings)) continue;
      const target = relative(".", resolve(dirname(file), from))
        .split("\\")
        .join("/");
      // The describe must use the function's own name, so an alias does not count
      for (const e of bindings.elements) if (!e.propertyName) imported.set(e.name.text, target);
    } else if (
      ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression) &&
      statement.expression.expression.text === "describe"
    ) {
      const first = statement.expression.arguments[0];
      if (first && ts.isStringLiteralLike(first)) names.push(first.text);
    }
  }
  const keys: string[] = [];
  const strays: string[] = [];
  for (const name of names) {
    // A method is found through the import of its class
    const target = imported.get(name.split(".")[0]!);
    if (target?.startsWith("src/")) keys.push(`${target}#${name}`);
    else strays.push(name);
  }
  return { keys, strays };
}

interface Table {
  /** Functions whose unit tests are still to be written: module → names */
  pending: Record<string, string[]>;
  /** Functions that cannot have a unit test of their own: "<file>#<name>" → reason (a fact) */
  exempt: Record<string, string>;
  /**
   * Lines of unit-tested functions that no input can reach: "<file>#<name>" → the lines, each with its source
   * text (trimmed; the line is found by its text, so that line numbers may move) and the reason (a fact)
   */
  unreachable: Record<string, { code: string; reason: string }[]>;
}

const functions = filesUnder("src", ".ts").flatMap(functionsOf);
const byKey = new Map(functions.map((f) => [f.key, f]));
const unitFiles = filesUnder(UNIT_DIR, ".test.ts");
const described = new Set<string>();
const problems: string[] = [];
for (const file of unitFiles) {
  const { keys, strays } = describedIn(file);
  for (const key of keys) {
    if (!byKey.has(key))
      problems.push(
        `${file}: describe("${key.split("#")[1]!}") names no function of ${key.split("#")[0]!}`,
      );
    else described.add(key);
  }
  for (const name of strays)
    problems.push(`${file}: describe("${name}") names no function imported from src`);
}

if (process.argv.includes("--write-pending")) {
  const old = JSON.parse(readFileSync(TABLE, "utf8")) as Table;
  const pending: Record<string, string[]> = {};
  for (const f of functions) {
    if (described.has(f.key) || f.key in old.exempt) continue;
    (pending[f.file] ??= []).push(f.name);
  }
  writeFileSync(
    TABLE,
    JSON.stringify({ pending, exempt: old.exempt, unreachable: old.unreachable }, null, 2) + "\n",
  );
  console.log(`wrote ${TABLE}: ${Object.values(pending).flat().length} pending`);
  process.exit(0);
}

const table = JSON.parse(readFileSync(TABLE, "utf8")) as Table;
const pending = new Set(
  Object.entries(table.pending).flatMap(([file, names]) => names.map((n) => `${file}#${n}`)),
);
const exempt = new Set(Object.keys(table.exempt));
for (const key of [...pending, ...exempt]) {
  if (!byKey.has(key)) problems.push(`${TABLE}: ${key} is listed but does not exist`);
  else if (described.has(key))
    problems.push(`${TABLE}: ${key} is listed but has a unit test (remove the entry)`);
}
for (const key of pending)
  if (exempt.has(key)) problems.push(`${TABLE}: ${key} is both pending and exempt`);
for (const [key, reason] of Object.entries(table.exempt))
  if (reason.trim() === "") problems.push(`${TABLE}: ${key} is exempt without a reason`);
for (const f of functions)
  if (!described.has(f.key) && !pending.has(f.key) && !exempt.has(f.key))
    problems.push(`${f.file}:${f.from} ${f.name} has no unit test and is not listed in ${TABLE}`);

// Every executable line of a function with a unit test must be executed by the unit tests alone
// Each test file runs in a process of its own (scripts/coverage-parts.ts)
const executed =
  unitFiles.length > 0
    ? executedOffsets(
        unitFiles.map((testFile) => ({
          label: testFile,
          args: ["--import", "./scripts/strict-warnings.ts", "--test", testFile],
        })),
        (run, status, stdout, stderr) => {
          console.error(stdout, stderr);
          console.error(
            `FAILED the unit tests of ${run.label} did not pass (exit code ${String(status)})`,
          );
          process.exit(1);
        },
      )
    : new Map<string, Uint8Array>();
let checkedLines = 0;
for (const key of [...described].sort()) {
  const f = byKey.get(key)!;
  const ran = executed.get(f.file);
  checkedLines += f.tokens.size;
  if (ran === undefined) {
    problems.push(`${f.file}: the unit tests did not load the module of ${f.name}`);
    continue;
  }
  const text = readFileSync(f.file, "utf8");
  const source = text.split("\n");
  /** Lines with a token that never ran → the text of those tokens */
  const missedLines = missedLinesOf(f, ran, text);
  // One entry stands for one line: two lines with the same text need two entries
  const allowed = table.unreachable[key] ?? [];
  const used = new Set<number>();
  const gaps = [...missedLines.keys()]
    .sort((a, b) => a - b)
    .filter((n) => {
      const at = allowed.findIndex((a, i) => !used.has(i) && a.code === source[n - 1]!.trim());
      if (at >= 0) used.add(at);
      return at < 0;
    });
  if (gaps.length > 0)
    problems.push(
      `${f.file} ${f.name}: lines not executed by the unit tests: ` +
        gaps.map((n) => `${n}${missedLines.get(n)!}`).join(", "),
    );
  allowed.forEach((entry, i) => {
    if (entry.reason.trim() === "")
      problems.push(`${TABLE}: unreachable line of ${key} without a reason`);
    if (!used.has(i))
      problems.push(
        `${TABLE}: unreachable line of ${key} is executed or does not exist: ${entry.code}`,
      );
  });
}
for (const key of Object.keys(table.unreachable))
  if (!described.has(key))
    problems.push(`${TABLE}: unreachable lines listed for ${key}, which has no unit test`);

console.log(
  `functions ${functions.length}: unit-tested ${described.size}, pending ${pending.size}, exempt ${exempt.size}` +
    `, unreachable lines ${Object.values(table.unreachable).flat().length}` +
    ` (unit test files ${unitFiles.length}, executable lines of tested functions ${checkedLines})`,
);
if (problems.length > 0) {
  for (const p of problems) console.error(`NG   ${p}`);
  console.error(`FAILED ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(
  "OK   every function has a unit test or is listed, and the unit tests execute every line they claim",
);
