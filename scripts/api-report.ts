/**
 * Snapshot of the public API (run by pnpm check).
 *
 * From the built type definitions (dist/*.d.ts), lists the names and type declarations published by each entry
 * of `exports` in package.json and compares the list with etc/api.md. Fails on any difference.
 *
 *   node scripts/api-report.ts            ... compare (pnpm check)
 *   node scripts/api-report.ts --update   ... rewrite etc/api.md (pnpm api:update)
 *
 * Also checks that everything published has the TSDoc tag @public or @beta.
 * For an intended API change, update with --update and commit. In review, check the difference against the
 * compatibility promise of RELEASING.md (only additions to inputs and to output enumerations).
 */

import "./strict-warnings.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const OUTPUT = "etc/api.md";
const update = process.argv.includes("--update");

interface Pkg {
  name: string;
  exports: Record<string, string | { types: string }>;
}
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Pkg;

const entries = Object.entries(pkg.exports)
  .filter((e): e is [string, { types: string }] => typeof e[1] !== "string")
  .map(([subpath, target]) => ({ subpath, file: target.types }));

for (const { file } of entries) {
  if (!existsSync(file)) {
    console.error(`${file} not found (run pnpm build first)`);
    process.exit(1);
  }
}

const program = ts.createProgram(
  entries.map((e) => e.file),
  { strict: true, noEmit: true, skipLibCheck: true, types: [] },
);
const checker = program.getTypeChecker();
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

/** Reads @public / @beta of a declaration */
function releaseTag(node: ts.Node): string | undefined {
  const target = ts.isVariableDeclaration(node) ? node.parent.parent : node;
  for (const tag of ts.getJSDocTags(target)) {
    const name = tag.tagName.text;
    if (name === "public" || name === "beta") return name;
  }
  return undefined;
}

/**
 * Whether a declaration has @deprecated (the record of a deprecation; removal comes at least one minor version
 * later. RELEASING.md)
 */
function isDeprecated(node: ts.Node): boolean {
  const target = ts.isVariableDeclaration(node) ? node.parent.parent : node;
  return ts.getJSDocTags(target).some((tag) => tag.tagName.text === "deprecated");
}

/** Prints a declaration as a type-definition statement without comments */
function printDeclaration(node: ts.Node): string {
  const target = ts.isVariableDeclaration(node) ? node.parent.parent : node;
  return printer.printNode(ts.EmitHint.Unspecified, target, target.getSourceFile()).trim();
}

const errors: string[] = [];
const lines: string[] = [
  `# ${pkg.name} API report`,
  "",
  "<!-- 自動生成のファイル。直接編集せず、pnpm api:update で更新する。 -->",
  "<!-- 差分は、RELEASING.md の「互換性の約束」に沿った変更かをレビューで確かめる。 -->",
];

for (const { subpath, file } of entries) {
  const source = program.getSourceFile(file);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) {
    errors.push(`${subpath}: cannot read ${file}`);
    continue;
  }
  const specifier = subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`;
  lines.push("", `## ${specifier}`);
  const exported = checker
    .getExportsOfModule(moduleSymbol)
    .sort((a, b) => a.getName().localeCompare(b.getName()));
  for (const symbol of exported) {
    const resolved =
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const declarations = resolved.getDeclarations() ?? [];
    if (declarations.length === 0) {
      errors.push(`${specifier}: ${symbol.getName()} has no declaration`);
      continue;
    }
    const tags = new Set(declarations.map(releaseTag));
    const tag = tags.has("beta") ? "beta" : tags.has("public") ? "public" : undefined;
    if (!tag) errors.push(`${specifier}: ${symbol.getName()} has no @public or @beta tag`);
    const deprecated = declarations.some(isDeprecated) ? ", @deprecated" : "";
    lines.push("", `### ${symbol.getName()} (@${tag ?? "untagged"}${deprecated})`, "", "```ts");
    for (const d of declarations) lines.push(printDeclaration(d));
    lines.push("```");
  }
}
const report = `${lines.join("\n")}\n`;

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

if (update) {
  mkdirSync("etc", { recursive: true });
  writeFileSync(OUTPUT, report);
  console.log(`Updated ${OUTPUT}`);
  process.exit(0);
}

const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n") : "";
if (current !== report) {
  const before = new Set(current.split("\n"));
  const after = new Set(report.split("\n"));
  const removed = [...before].filter((l) => !after.has(l) && l.trim() !== "");
  const added = [...after].filter((l) => !before.has(l) && l.trim() !== "");
  console.error(`The public API differs from ${OUTPUT}.`);
  for (const l of removed.slice(0, 30)) console.error(`- ${l}`);
  for (const l of added.slice(0, 30)) console.error(`+ ${l}`);
  console.error("If the change is intended, run: pnpm api:update");
  process.exit(1);
}
console.log(`OK: public API matches ${OUTPUT}`);
