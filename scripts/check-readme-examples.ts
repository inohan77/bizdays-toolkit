import "./strict-warnings.ts";
/**
 * Runs the code examples of the README and the documents (docs/guide.md, docs/providers.md; English and
 * Japanese) and compares them with the results written in comments (run by pnpm check; RELEASING.md, reasons
 * for the quality mechanisms, "check documents against the implementation").
 *
 * - Each ts code block becomes its own module and runs against the built dist (self-reference by package name)
 * - When the comment after a statement (`expr; // "2026-11-02"`, or `// { ... }` continuing from the next line)
 *   starts with a literal, it is compared with the actual value. `{…}` matches anything, and a string with `…`
 *   matches when the parts other than … occur in order. A comment that is not a literal is not compared
 * - An expression using `new Date()` (the current time) is not compared: its result depends on the run time
 * - Public names a block does not import (createCalendar, ...) are imported from their subpaths.
 *   For fragments that use values defined in other blocks, the definitions of FIXTURES are supplied
 * - A block with a relative import (a file of the user's project) cannot run and is skipped
 * - The options an example passes to createCalendar / createSchedule are also diagnosed automatically
 *   (diagnoseCalendar, diagnoseSchedule). An error or warning fails. An example that shows a mistake names the
 *   allowed codes in a note on the last non-empty line before the code block:
 *   `<!-- example: allow-diagnostics <code>,<code> -->`
 * - An example that narrows diagnostics with filter or find fails (narrowing hides mistakes in the example's
 *   options). An example with a reason to narrow says so in a note on the last non-empty line before it:
 *   `<!-- example: allow-filtered-diagnostics -->`
 * - The migration guide (docs/migration.md) runs up to the section of the latest version (earlier sections are
 *   written with the old names, which stop working in 1.0.0)
 * - Examples run in parallel, as many as there are cores (up to 4). Results are read in example order, so the
 *   order of failures is the same as without parallelism
 */

import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(".");
const SUBPATHS = [
  "bizdays-toolkit",
  "bizdays-toolkit/jp",
  "bizdays-toolkit/uk",
  "bizdays-toolkit/sg",
  "bizdays-toolkit/fr",
  "bizdays-toolkit/diagnose",
  "bizdays-toolkit/provider",
];

/**
 * Definitions for fragments that use values defined in other blocks (supplied only when used and not defined in
 * the block)
 */
const FIXTURES: Record<string, string> = {
  Hours: "type Hours = { open: string; close: string } | null;",
  weekday: 'const weekday = { open: "10:00", close: "21:00" };',
  sunday: 'const sunday = { open: "10:00", close: "19:00" };',
  storeHours:
    "const storeHours = createSchedule<Hours>({ holidayProvider: jp, weekdayValues: [sunday, weekday, null, weekday, weekday, weekday, weekday], holidayPolicy: { sameAs: 0 } });",
};
const FIXTURE_ORDER = ["Hours", "weekday", "sunday", "storeHours"];

// Public names and the subpath each is supplied from (the first one found)
const exportsOf = new Map<string, string>();
for (const sub of SUBPATHS) {
  const mod = (await import(sub)) as Record<string, unknown>;
  for (const name of Object.keys(mod)) if (!exportsOf.has(name)) exportsOf.set(name, sub);
}

/**
 * Extracts the literal at the start of a comment (string, number, boolean, null, an object or array with
 * balanced brackets)
 */
function leadingLiteral(text: string): string | undefined {
  const t = text.trim();
  const simple = /^(true|false|null|-?\d+(?:\.\d+)?)(?![\w.])/.exec(t);
  if (simple) return simple[1];
  const open = t[0];
  if (open === '"' || open === "'") {
    for (let i = 1; i < t.length; i++) {
      if (t[i] === "\\") i++;
      else if (t[i] === open) return t.slice(0, i + 1);
    }
    return undefined;
  }
  if (open !== "{" && open !== "[") return undefined;
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return t.slice(0, i + 1);
    }
  }
  return undefined;
}

/** Removes the // comment of a line (not a // inside a string) */
function stripComment(line: string): string {
  let quote: string | undefined;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "/" && line[i + 1] === "/") return line.slice(0, i).trimEnd();
  }
  return line;
}
const commentOf = (line: string): string | undefined => {
  const code = stripComment(line);
  return code.length < line.length ? line.slice(line.indexOf("//", code.length) + 2) : undefined;
};
/** Change in bracket depth (not counted inside strings) */
function depthOf(code: string): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
  }
  return depth;
}

interface Check {
  line: number;
  code: string;
  expected: string;
}

function prepare(block: string): { source: string; checks: Check[] } | undefined {
  if (/^import .* from "\.{1,2}\//m.test(block)) return undefined;
  const lines = block.split("\n");
  const checks: Check[] = [];
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Only statements without indentation (a statement over several lines is one statement up to the line where
    // the brackets balance and it ends with ;)
    if (
      line === "" ||
      /^\s/.test(line) ||
      line.startsWith("//") ||
      line.startsWith("}") ||
      /^(import|export|return|throw|type|interface|if|for|while|try)\b/.test(line)
    ) {
      out.push(line);
      continue;
    }
    let j = i;
    let depth = depthOf(stripComment(line));
    while (!(depth === 0 && /;\s*$/.test(stripComment(lines[j]!))) && j + 1 < lines.length) {
      j++;
      depth += depthOf(stripComment(lines[j]!));
    }
    const statement = lines.slice(i, j + 1);
    const last = statement.at(-1)!;
    let comment = commentOf(last);
    if (comment === undefined) {
      // Collect the comment continuing from the next line (`// { ... }`)
      const following: string[] = [];
      for (let k = j + 1; k < lines.length && lines[k]!.startsWith("// "); k++) {
        following.push(lines[k]!.replace(/^\/\/\s?/, ""));
      }
      if (following.length > 0 && /^[{["\d]|^(true|false|null)\b/.test(following[0]!.trim())) {
        comment = following.join(" ");
      }
    }
    const code = [...statement.slice(0, -1), stripComment(last)].join("\n").replace(/;\s*$/, "");
    const declaration = /^(?:const|let)\s+(\w+)\s*=\s*([\s\S]+)$/.exec(code);
    const expected = comment === undefined ? undefined : leadingLiteral(comment);
    if (
      expected !== undefined &&
      !/new Date\(\)/.test(code) &&
      !/^(?:const|let)\s+[{[]/.test(code)
    ) {
      const index = checks.length;
      checks.push({ line: j + 1, code: (declaration?.[2] ?? code).trim(), expected });
      if (declaration) out.push(...statement, `__check(${index}, ${declaration[1]});`);
      else out.push(`__check(${index}, ${code});`);
    } else {
      out.push(...statement);
    }
    i = j;
  }
  const body = out.join("\n");
  const imported = new Set(
    [...block.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}/gm)].flatMap((m) =>
      m[1]!.split(",").map((s) =>
        s
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .pop()!,
      ),
    ),
  );
  const declared = (name: string): boolean =>
    new RegExp(`\\b(?:const|let|type|function|interface)\\s+${name}\\b`).test(block) ||
    imported.has(name);
  const used = (name: string): boolean => new RegExp(`\\b${name}\\b`).test(body);

  const fixtures: string[] = [];
  const needed = new Set<string>();
  for (const name of FIXTURE_ORDER) if (used(name) && !declared(name)) needed.add(name);
  if (needed.has("storeHours"))
    ["Hours", "weekday", "sunday"].forEach((n) => !declared(n) && needed.add(n));
  for (const name of FIXTURE_ORDER) if (needed.has(name)) fixtures.push(FIXTURES[name]!);

  const extra = new Map<string, string[]>();
  const fixtureText = fixtures.join("\n");
  for (const [name, sub] of exportsOf) {
    if ((used(name) || new RegExp(`\\b${name}\\b`).test(fixtureText)) && !declared(name)) {
      extra.set(sub, [...(extra.get(sub) ?? []), name]);
    }
  }
  const head = [...extra].map(([sub, names]) => `import { ${names.join(", ")} } from "${sub}";`);
  // Imports first, supplied definitions next, the example's body last (a use before the definition would be a
  // reference before initialization)
  const bodyLines = body.split("\n");
  const importLines = bodyLines.filter((l) => /^import\s/.test(l));
  const rest = bodyLines.filter((l) => !/^import\s/.test(l));
  return {
    source: [
      ...head,
      'import { __check } from "./__check.ts";',
      ...importLines,
      fixtureText,
      ...rest,
    ].join("\n"),
    checks,
  };
}

/**
 * Whether the diagnostics are narrowed with filter or find (directly after the call, or on a variable holding
 * the result)
 */
function filtersDiagnostics(block: string): boolean {
  const narrow = String.raw`\s*\.\s*(?:filter|find|findLast)\s*\(`;
  if (new RegExp(String.raw`diagnose(?:Calendar|Schedule)\s*\([^;]*?\)` + narrow).test(block))
    return true;
  for (const m of block.matchAll(
    /\b(?:const|let)\s+(\w+)\s*=\s*diagnose(?:Calendar|Schedule)\s*\(/g,
  )) {
    if (new RegExp(String.raw`\b${m[1]}` + narrow).test(block)) return true;
  }
  return false;
}

/**
 * The module that wraps createCalendar / createSchedule of an example. It diagnoses the options and prints each
 * error or warning that is not allowed on one line (the example's import from the package root is redirected to
 * this module)
 */
const WRAPPER = `
import * as lib from "bizdays-toolkit";
import { diagnoseCalendar, diagnoseSchedule } from "bizdays-toolkit/diagnose";
export * from "bizdays-toolkit";
const allowed: string[] = JSON.parse(process.env.README_ALLOWED_DIAGNOSTICS ?? "[]");
function audit(name: string, issues: readonly { severity: string; code: string; path: string; message: string }[]): void {
  for (const d of issues) {
    if ((d.severity === "error" || d.severity === "warning") && !allowed.includes(d.code)) {
      console.log(JSON.stringify({ diagnostic: name + ": " + d.severity + " " + d.code + " at " + JSON.stringify(d.path) + ": " + d.message }));
      process.exitCode = 1;
    }
  }
}
// The same options (apart from name and nameEn) are diagnosed once. The English and Japanese examples write the
// same options except for names, so the second time the result is copied (a typo in the Japanese version only
// has different options and is diagnosed; T-3 of the proposal bizdays-toolkit-0.31.8-proposal).
// Options with a value the key cannot tell apart are not copied: functions other than the bundled providers
// (the same body can close over different values) and calendars. An explicit undefined goes into the key as a
// value different from not writing it (decisions.md #6)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jp } from "bizdays-toolkit/jp";
import { england, northernIreland, scotland, wales } from "bizdays-toolkit/uk";
import { alsaceMoselle, metropole } from "bizdays-toolkit/fr";
import { sg } from "bizdays-toolkit/sg";
const BUNDLED = new Map<unknown, string>(
  [jp, england, wales, scotland, northernIreland, metropole, alsaceMoselle, sg].map((p) => [p, p.id]),
);
function cacheKey(kind: string, options: unknown): string | undefined {
  let safe = true;
  const text = JSON.stringify(options, (key, value: unknown) => {
    if (key === "name" || key === "nameEn") return undefined;
    if (value === undefined) return "\\u0000undefined";
    const bundled = BUNDLED.get(value);
    if (bundled !== undefined) return "\\u0000provider:" + bundled;
    if (typeof value === "function") safe = false;
    if (typeof value === "object" && value !== null && typeof (value as { isBusinessDay?: unknown }).isBusinessDay === "function") safe = false;
    return value;
  });
  return safe && text !== undefined ? createHash("sha256").update(kind + text).digest("hex") : undefined;
}
function diagnoseOnce<T>(kind: string, options: unknown, run: () => T): T {
  const dir = process.env.README_DIAGNOSE_CACHE;
  const key = dir ? cacheKey(kind, options) : undefined;
  const file = key ? join(dir!, key + ".json") : undefined;
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  const result = run();
  // Examples run in parallel, so the file is written under another name and then renamed, so that no other
  // example reads a half-written file
  if (file) {
    writeFileSync(file + "." + process.pid, JSON.stringify(result));
    renameSync(file + "." + process.pid, file);
  }
  return result;
}
export function createCalendar(...args: unknown[]): unknown {
  console.log(JSON.stringify({ audited: "createCalendar" }));
  audit("createCalendar", diagnoseOnce("calendar", args[0], () => diagnoseCalendar((args[0] ?? {}) as never)));
  return (lib.createCalendar as (...a: unknown[]) => unknown)(...args);
}
export function createSchedule(...args: unknown[]): unknown {
  console.log(JSON.stringify({ audited: "createSchedule" }));
  audit("createSchedule", diagnoseOnce("schedule", args[0], () => diagnoseSchedule(args[0] as never)));
  return (lib.createSchedule as (...a: unknown[]) => unknown)(...args);
}
`;

/**
 * Loading from the package root (`from "bizdays-toolkit"`, `from 'bizdays-toolkit'`, `import "bizdays-toolkit"`,
 * dynamic `import("bizdays-toolkit")`, `require("bizdays-toolkit")`, with quotes or template literals; subpaths
 * are not included)
 */
const ROOT_IMPORT =
  /\b(?:from|import)\s*["']bizdays-toolkit["']|\b(?:import|require)\s*\(\s*["'`]bizdays-toolkit["'`]\s*\)/;

/** The note on the last non-empty line before a code block (`<!-- example: <name> <args> -->`) */
function noteOf(text: string, index: number): Map<string, string> {
  const before = text.slice(0, index).trimEnd().split("\n").at(-1) ?? "";
  const notes = new Map<string, string>();
  for (const m of before.matchAll(/<!--\s*example:\s*([\w-]+)\s*([^>]*?)\s*-->/g))
    notes.set(m[1]!, m[2]!);
  return notes;
}

const CHECKER = `
const ANY = Symbol("any");
function parse(text: string): unknown {
  const js = text.replaceAll("{…}", "__ANY__");
  return new Function("__ANY__", "return (" + js + ");")(ANY);
}
// Old-name properties returned only by versions before 1.0.0 (the result-type properties in the table of the API
// to be removed in docs/migration.md). The examples write only the new names, so these are not compared
// (RELEASING.md, work for 1.0.0, deletes this)
const DEPRECATED_RESULT_KEYS: string[] = JSON.parse(process.env.README_DEPRECATED_KEYS ?? "[]");
function match(actual: unknown, expected: unknown): boolean {
  if (expected === ANY) return true;
  if (typeof expected === "string" && expected.includes("…") && typeof actual === "string") {
    let at = 0;
    for (const part of expected.split("…")) {
      const found = actual.indexOf(part, at);
      if (found < 0) return false;
      at = found + part.length;
    }
    return true;
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => match(actual[i], e));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    const keys = new Set([
      ...Object.keys(expected),
      ...Object.keys(actual).filter((k) => k in expected || !DEPRECATED_RESULT_KEYS.includes(k)),
    ]);
    return [...keys].every((k) => match((actual as any)[k], (expected as any)[k]));
  }
  return Object.is(actual, expected);
}
const expectations: string[] = JSON.parse(process.env.README_EXPECTED ?? "[]");
export function __check(index: number, actual: unknown): void {
  if (!match(actual, parse(expectations[index]!))) {
    console.log(JSON.stringify({ index, actual }));
    process.exitCode = 1;
  }
}
`;

/**
 * The files whose code examples run (README and the guides in docs, English and Japanese; the migration guide up
 * to the section of the latest version)
 */
const DOC_FILES = [
  "README.md",
  "docs/README.ja.md",
  "docs/guide.md",
  "docs/guide.ja.md",
  "docs/providers.md",
  "docs/providers.ja.md",
  "docs/migration.md",
];

/** The part of the text that runs (for the migration guide, up to before the second version heading "## 0.x.y") */
function runnablePart(file: string, text: string): string {
  if (file !== "docs/migration.md") return text;
  const versions = [...text.matchAll(/^## \d+\.\d+\.\d+\s*$/gm)];
  return versions.length < 2 ? text : text.slice(0, versions[1]!.index);
}

// The names of the result-type properties in the table of the API to be removed (docs/migration.md) (e.g.
// businessDay of `DayInfo.businessDay`)
const RESULT_TYPES = ["DayInfo", "ScheduleDayInfo", "HolidayLookup", "Calendar", "Schedule"];
const deprecatedResultKeys = [
  ...readFileSync("docs/migration.md", "utf8").matchAll(/`([A-Za-z]+)\.([A-Za-z]+)`/g),
]
  .filter((m) => RESULT_TYPES.includes(m[1]!))
  .map((m) => m[2]!);

const dir = mkdtempSync(join(ROOT, ".readme-examples-"));
const failures: string[] = [];
/**
 * Where diagnostics results are copied (saves the second diagnosis of the same options; diagnoseOnce of the
 * wrapping module)
 */
const cacheDir = join(dir, "diagnose-cache");
let blocks = 0;
/** The examples to run (collected in the preparation stage, run in parallel later) */
const jobs: {
  file: string;
  startLine: number;
  checks: Check[];
  path: string;
  env: NodeJS.ProcessEnv;
  /** Failures of the preparation stage collected before this example */
  earlier: string[];
}[] = [];
let compared = 0;
/**
 * Number of options the wrapping module diagnosed (per function). It is 0 when the redirection fails, so 0 is a
 * failure
 */
const audited: Record<string, number> = { createCalendar: 0, createSchedule: 0 };
try {
  writeFileSync(join(dir, "__check.ts"), CHECKER);
  writeFileSync(join(dir, "__wrap.ts"), WRAPPER);
  mkdirSync(cacheDir);
  for (const file of DOC_FILES) {
    const text = runnablePart(file, readFileSync(file, "utf8"));
    for (const m of text.matchAll(/^```ts\n([\s\S]*?)^```/gm)) {
      const startLine = text.slice(0, m.index).split("\n").length + 1;
      const notes = noteOf(text, m.index);
      if (filtersDiagnostics(m[1]!) && !notes.has("allow-filtered-diagnostics")) {
        failures.push(
          `${file}:${startLine}: the example narrows the diagnostics with filter/find (show them all, or add <!-- example: allow-filtered-diagnostics -->)`,
        );
      }
      const prepared = prepare(m[1]!);
      if (!prepared) continue;
      blocks++;
      compared += prepared.checks.length;
      const path = join(dir, `example-${blocks}.ts`);
      // The import from the package root is redirected to the module that diagnoses the options created. The
      // redirection is an exact match of `from "bizdays-toolkit";`, so another spelling (single quotes, no
      // semicolon, a bare import statement, a dynamic import, require) would pass without being diagnosed. An
      // example in which one remains fails
      const redirected = prepared.source.replaceAll(
        'from "bizdays-toolkit";',
        'from "./__wrap.ts";',
      );
      if (ROOT_IMPORT.test(redirected)) {
        failures.push(
          `${file}:${startLine}: the example imports "bizdays-toolkit" in a form the checker does not redirect (write it as \`from "bizdays-toolkit";\`)`,
        );
        continue;
      }
      writeFileSync(path, redirected);
      jobs.push({
        file,
        startLine,
        checks: prepared.checks,
        path,
        env: {
          ...process.env,
          README_EXPECTED: JSON.stringify(prepared.checks.map((c) => c.expected)),
          README_DEPRECATED_KEYS: JSON.stringify(deprecatedResultKeys),
          README_DIAGNOSE_CACHE: cacheDir,
          README_ALLOWED_DIAGNOSTICS: JSON.stringify(
            (notes.get("allow-diagnostics") ?? "").split(",").filter(Boolean),
          ),
        },
        // Failures of the preparation stage collected so far go before this example's result (the order of
        // failures equals the one without parallelism)
        earlier: failures.splice(0),
      });
    }
  }
  // The examples run in parallel and the results are read in example order (the order of failures equals the
  // one without parallelism)
  const results: { status: number | null; stdout: string; stderr: string }[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const i = next++;
      const job = jobs[i]!;
      results[i] = await new Promise((done) => {
        const child = spawn(
          process.execPath,
          ["--import", "./scripts/strict-warnings.ts", job.path],
          {
            env: job.env,
          },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8").on("data", (s: string) => (stdout += s));
        child.stderr.setEncoding("utf8").on("data", (s: string) => (stderr += s));
        // A failure to start is that example's failure (as with spawnSync; even if close follows, only the first
        // result counts)
        child.on("error", (e) => done({ status: null, stdout, stderr: String(e) }));
        child.on("close", (status) => done({ status, stdout, stderr }));
      });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, availableParallelism(), jobs.length) }, worker),
  );
  /** The failures in an example's result (reads one JSON per line of the example's output) */
  const failuresOf = (job: (typeof jobs)[number], result: (typeof results)[number]): string[] => {
    const { file, startLine, checks } = job;
    const found: string[] = [];
    for (const line of result.stdout.split("\n").filter(Boolean)) {
      try {
        const parsed = JSON.parse(line) as {
          index: number;
          actual: unknown;
          diagnostic?: string;
          audited?: string;
        };
        if (typeof parsed.audited === "string") {
          audited[parsed.audited] = (audited[parsed.audited] ?? 0) + 1;
          continue;
        }
        if (typeof parsed.diagnostic === "string") {
          found.push(`${file}:${startLine}: ${parsed.diagnostic}`);
          continue;
        }
        const { index, actual } = parsed;
        const c = checks[index]!;
        found.push(
          `${file}:${startLine + c.line - 1}: ${c.code}\n  expected ${c.expected}\n  actual   ${JSON.stringify(actual)}`,
        );
      } catch {
        // The example's own output (console.log, ...) is ignored
      }
    }
    if (result.status !== 0 && (found.length === 0 || !result.stdout)) {
      found.push(`${file}:${startLine}: the example failed to run\n${result.stderr}`);
    }
    return found;
  };
  // Failures of the preparation stage collected after the last example go last
  const later = failures.splice(0);
  jobs.forEach((job, i) => failures.push(...job.earlier, ...failuresOf(job, results[i]!)));
  failures.push(...later);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const diagnosedTotal = audited["createCalendar"]! + audited["createSchedule"]!;
if (diagnosedTotal === 0) {
  failures.push(
    'no options were diagnosed (the imports of "bizdays-toolkit" in the examples were not redirected to the wrapper)',
  );
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`OK   README examples: ${blocks} blocks run, ${compared} results compared`);
console.log(
  `OK   README options diagnosed: ${diagnosedTotal} (createCalendar ${audited["createCalendar"]}, createSchedule ${audited["createSchedule"]})`,
);
