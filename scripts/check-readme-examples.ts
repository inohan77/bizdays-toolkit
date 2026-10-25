import "./strict-warnings.ts";
/**
 * README とドキュメント（docs/guide.md・docs/providers.md。英語・日本語）のコード例を実行し、コメントに書いた結果と比べる（pnpm check から実行。decisions.md の 27・45 番）。
 *
 * - ts のコードブロックを 1 つずつ別のモジュールにして、ビルド済みの dist（パッケージ名での自己参照）で実行する
 * - 文の後のコメント（`expr; // "2026-11-02"` や、次の行から続く `// { ... }`）の先頭がリテラルなら、実際の値と比べる。
 *   `{…}` は何にでも一致し、`…` を含む文字列は、… 以外の部分を順に含めば一致とする。リテラルでないコメントは比べない
 * - `new Date()`（現在時刻）を使う式は、結果が実行時刻で変わるので比べない
 * - ブロックが import していない公開の名前（createCalendar など）は、各サブパスから補って import する。
 *   ほかのブロックで定義した値を使う断片のために、FIXTURES の定義を補う
 * - 相対パスの import（利用者のプロジェクトのファイル）を含むブロックは、実行できないので飛ばす
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** ほかのブロックで定義した値を使う断片のための定義（使っていて、ブロック内で定義していないときだけ補う） */
const FIXTURES: Record<string, string> = {
  Hours: "type Hours = { open: string; close: string } | null;",
  weekday: 'const weekday = { open: "10:00", close: "21:00" };',
  sunday: 'const sunday = { open: "10:00", close: "19:00" };',
  storeHours:
    "const storeHours = createSchedule<Hours>({ holidays: jp, weekly: [sunday, weekday, null, weekday, weekday, weekday, weekday], holiday: { sameAs: 0 } });",
};
const FIXTURE_ORDER = ["Hours", "weekday", "sunday", "storeHours"];

// 公開の名前と、どのサブパスから補うか（先に見つかったもの）
const exportsOf = new Map<string, string>();
for (const sub of SUBPATHS) {
  const mod = (await import(sub)) as Record<string, unknown>;
  for (const name of Object.keys(mod)) if (!exportsOf.has(name)) exportsOf.set(name, sub);
}

/** コメントの先頭のリテラルを取り出す（文字列・数値・真偽値・null・括弧の対応が取れたオブジェクトと配列） */
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

/** 行の // コメントを除く（文字列の中の // は除かない） */
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
/** 括弧の深さの増減（文字列の中は数えない） */
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
    // 字下げのない文だけを対象にする（複数行にまたがる文は、括弧の対応が取れて ; で終わる行までを 1 つの文とする）
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
      // 次の行から続くコメント（`// { ... }`）を集める
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
  // import を先頭に、補った定義をその後に、例の本体を最後に置く（定義より前に使うと初期化前の参照になるため）
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

const CHECKER = `
const ANY = Symbol("any");
function parse(text: string): unknown {
  const js = text.replaceAll("{…}", "__ANY__");
  return new Function("__ANY__", "return (" + js + ");")(ANY);
}
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
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
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

/** コード例を実行するファイル（README と docs のガイド。英語・日本語） */
const DOC_FILES = [
  "README.md",
  "docs/README.ja.md",
  "docs/guide.md",
  "docs/guide.ja.md",
  "docs/providers.md",
  "docs/providers.ja.md",
];

const dir = mkdtempSync(join(ROOT, ".readme-examples-"));
const failures: string[] = [];
let blocks = 0;
let compared = 0;
try {
  writeFileSync(join(dir, "__check.ts"), CHECKER);
  for (const file of DOC_FILES) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/^```ts\n([\s\S]*?)^```/gm)) {
      const startLine = text.slice(0, m.index).split("\n").length + 1;
      const prepared = prepare(m[1]!);
      if (!prepared) continue;
      blocks++;
      compared += prepared.checks.length;
      const path = join(dir, `example-${blocks}.ts`);
      writeFileSync(path, prepared.source);
      const result = spawnSync(
        process.execPath,
        ["--import", "./scripts/strict-warnings.ts", path],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            README_EXPECTED: JSON.stringify(prepared.checks.map((c) => c.expected)),
          },
        },
      );
      for (const line of (result.stdout ?? "").split("\n").filter(Boolean)) {
        try {
          const { index, actual } = JSON.parse(line) as { index: number; actual: unknown };
          const c = prepared.checks[index]!;
          failures.push(
            `${file}:${startLine + c.line - 1}: ${c.code}\n  expected ${c.expected}\n  actual   ${JSON.stringify(actual)}`,
          );
        } catch {
          // 例の出力（console.log など）は無視する
        }
      }
      if (result.status !== 0 && failures.length === 0) {
        failures.push(`${file}:${startLine}: the example failed to run\n${result.stderr}`);
      } else if (result.status !== 0 && !result.stdout) {
        failures.push(`${file}:${startLine}: the example failed to run\n${result.stderr}`);
      }
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`OK   README examples: ${blocks} blocks run, ${compared} results compared`);
