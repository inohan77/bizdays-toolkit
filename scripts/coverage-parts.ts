/**
 * The parts shared by the checks that read the block coverage of V8 (scripts/check-unit-tests.ts and
 * scripts/check-promise-coverage.ts): the top-level functions of a module of src and the lines of their tokens,
 * running processes with NODE_V8_COVERAGE, and reading which offsets ran.
 *
 * The lcov report of --experimental-test-coverage is not used: it counts a line as executed when the block that
 * never ran starts after the indentation of the line (seen with the statement of an if without braces on a line
 * of its own), and merging the processes of several test files counts lines that no process executed.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** A top-level function of a module of src */
export interface Fn {
  /** "<file>#<name>" (the file is relative to the repository, with "/") */
  readonly key: string;
  readonly file: string;
  readonly name: string;
  /** First and last line of the function (1-based; the comment before it is not included) */
  readonly from: number;
  readonly to: number;
  /** Per line of the function that holds a token, the offsets at which its tokens start and end */
  readonly tokens: ReadonlyMap<number, readonly (readonly [number, number])[]>;
}

/**
 * Lists the files under a directory, recursively.
 * @param dir - Directory, relative to the repository.
 * @param suffix - Only files ending with this are returned.
 * @returns Paths relative to the repository with "/", sorted.
 */
export function filesUnder(dir: string, suffix: string): string[] {
  const found: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(suffix)) found.push(path.split("\\").join("/"));
    }
  };
  walk(dir);
  return found.sort();
}

/**
 * Parses a TypeScript file.
 * @param file - Path relative to the repository.
 * @returns The source file with parent pointers.
 */
export const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

/**
 * The top-level functions of a module.
 * @param file - Path of a module of src.
 * @returns One entry per function declaration with a body and per const initialized with a function.
 */
export function functionsOf(file: string): Fn[] {
  const sf = parse(file);
  const line = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const found: Fn[] = [];
  const add = (name: string, node: ts.Node): void => {
    const tokens = new Map<number, [number, number][]>();
    const walk = (n: ts.Node): void => {
      // Documentation comments are nodes of the tree; they are not code
      if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return;
      const children = n.getChildren(sf);
      if (children.length > 0) {
        children.forEach(walk);
        return;
      }
      const at = n.getStart(sf);
      if (n.getEnd() === at) return;
      const on = line(at);
      const list = tokens.get(on);
      if (list) list.push([at, n.getEnd()]);
      else tokens.set(on, [[at, n.getEnd()]]);
    };
    walk(node);
    found.push({
      key: `${file}#${name}`,
      file,
      name,
      from: line(node.getStart(sf)),
      to: line(node.getEnd()),
      tokens,
    });
  };
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body)
      add(statement.name.text, statement);
    else if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations)
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        )
          add(d.name.text, d);
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      // Methods and accessors of a class are functions named "<Class>.<member>"
      for (const member of statement.members)
        if (
          (ts.isMethodDeclaration(member) || ts.isAccessor(member)) &&
          member.body &&
          ts.isIdentifier(member.name)
        )
          add(`${statement.name.text}.${member.name.text}`, member);
    }
  }
  return found;
}

/** A block of the coverage of V8: offsets in the source and how many times it ran */
export interface CoverageRange {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly count: number;
}

/** One process run under the coverage of V8 */
export interface CoverageRun {
  /** A name for messages (the test file or the script) */
  readonly label: string;
  /** The arguments of node */
  readonly args: readonly string[];
  /** Environment variables added to those of this process */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * The name of the directory of its coverage files under the root (by default its position in the list). Runs of
   * different processes (jobs of CI) that are read together need names of their own
   */
  readonly dir?: string;
  /**
   * A condition on the output besides the exit code (for example that a test run with a name pattern ran a test:
   * a pattern that matches nothing passes with no test)
   */
  readonly passes?: (stdout: string) => boolean;
}

/**
 * Runs processes with NODE_V8_COVERAGE, which makes Node.js write the block coverage of V8 (offsets and counts),
 * and returns which offsets of the modules of src were executed (offsetsIn).
 * @param runs - The processes, run one after another; each writes into a directory of its own under `root`.
 * @param onFailure - Called when a process ends with an exit code other than 0 or its output does not pass (it may
 *   end this process).
 * @param root - The directory for the coverage files (a new temporary directory by default).
 * @returns Per file of src, one byte per offset: 1 when executed.
 */
export function executedOffsets(
  runs: readonly CoverageRun[],
  onFailure: (run: CoverageRun, status: number | null, stdout: string, stderr: string) => void,
  root: string = mkdtempSync(join(tmpdir(), "unit-coverage-")),
): Map<string, Uint8Array> {
  const dirs = runs.map((run, i) => {
    const dir = join(root, run.dir ?? String(i));
    const r = spawnSync(process.execPath, [...run.args], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
      env: { ...process.env, ...run.env, NODE_V8_COVERAGE: dir },
    });
    if (r.status !== 0 || run.passes?.(r.stdout) === false)
      onFailure(run, r.status, r.stdout, r.stderr);
    return dir;
  });
  return offsetsIn(dirs);
}

/**
 * The same as executedOffsets, with the processes run at the same time (for long runs such as the promise checks).
 * @param runs - The processes; each writes into a directory of its own under `root`.
 * @param onFailure - Called when a process ends with an exit code other than 0 or its output does not pass.
 * @param root - The directory for the coverage files (a new temporary directory by default).
 * @returns Per file of src, one byte per offset: 1 when executed.
 */
export async function executedOffsetsTogether(
  runs: readonly CoverageRun[],
  onFailure: (run: CoverageRun, status: number | null, stdout: string, stderr: string) => void,
  root: string = mkdtempSync(join(tmpdir(), "unit-coverage-")),
): Promise<Map<string, Uint8Array>> {
  const dirs = await Promise.all(
    runs.map(
      (run, i) =>
        new Promise<string>((done, fail) => {
          const dir = join(root, run.dir ?? String(i));
          const child = spawn(process.execPath, [...run.args], {
            env: { ...process.env, ...run.env, NODE_V8_COVERAGE: dir },
          });
          let stdout = "";
          let stderr = "";
          child.stdout.setEncoding("utf8").on("data", (t: string) => (stdout += t));
          child.stderr.setEncoding("utf8").on("data", (t: string) => (stderr += t));
          child.on("error", fail);
          child.on("close", (status) => {
            if (status !== 0 || run.passes?.(stdout) === false)
              onFailure(run, status, stdout, stderr);
            done(dir);
          });
        }),
    ),
  );
  return offsetsIn(dirs);
}

/**
 * Reads the coverage files of V8 written with NODE_V8_COVERAGE.
 *
 * In one process (one file) the innermost block that contains an offset decides whether the offset ran; an
 * offset is executed when it ran in at least one process. Node.js removes the type annotations of a .ts file by
 * replacing them with spaces, so the offsets are those of the file.
 * @param dirs - Directories of coverage files (a missing directory counts as empty).
 * @returns Per file of src (relative, with "/"), one byte per offset: 1 when executed. A file no process loaded
 *   is absent.
 */
export function offsetsIn(dirs: readonly string[]): Map<string, Uint8Array> {
  const executed = new Map<string, Uint8Array>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const report = JSON.parse(readFileSync(join(dir, name), "utf8")) as {
        result: { url: string; functions: { ranges: CoverageRange[] }[] }[];
      };
      for (const script of report.result) {
        if (!script.url.startsWith("file:")) continue;
        const file = relative(".", fileURLToPath(script.url)).split("\\").join("/");
        if (!file.startsWith("src/")) continue;
        let all = executed.get(file);
        if (!all) executed.set(file, (all = new Uint8Array(readFileSync(file, "utf8").length)));
        // Outer blocks first, so that the innermost block that contains an offset is written last
        const ranges = script.functions
          .flatMap((f) => f.ranges)
          .sort((x, y) => x.startOffset - y.startOffset || y.endOffset - x.endOffset);
        const here = new Uint8Array(all.length);
        for (const r of ranges) here.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset);
        for (let k = 0; k < all.length; k++) if (here[k] === 1) all[k] = 1;
      }
    }
  }
  return executed;
}

/**
 * The lines of a function that were not executed: a line holding a token that never ran.
 * @param fn - The function.
 * @param ran - The executed offsets of its file (offsetsIn).
 * @param text - The text of its file.
 * @returns Line number → "" when no token of the line ran, or " (only in part; not executed: …)" with the tokens
 *   that did not run.
 */
export function missedLinesOf(fn: Fn, ran: Uint8Array, text: string): Map<number, string> {
  const missedLines = new Map<number, string>();
  for (const [n, tokens] of fn.tokens) {
    const missed = tokens.filter(([at]) => ran[at] !== 1);
    if (missed.length > 0)
      missedLines.set(
        n,
        missed.length === tokens.length
          ? ""
          : ` (only in part; not executed: ${missed.map(([at, end]) => text.slice(at, end)).join(" ")})`,
      );
  }
  return missedLines;
}
