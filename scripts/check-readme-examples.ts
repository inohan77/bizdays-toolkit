import "./strict-warnings.ts";
/**
 * README とドキュメント（docs/guide.md・docs/providers.md。英語・日本語）のコード例を実行し、コメントに書いた結果と比べる（pnpm check から実行。RELEASING.md の「品質の仕組みの理由」の「文書を実装と照合する」）。
 *
 * - ts のコードブロックを 1 つずつ別のモジュールにして、ビルド済みの dist（パッケージ名での自己参照）で実行する
 * - 文の後のコメント（`expr; // "2026-11-02"` や、次の行から続く `// { ... }`）の先頭がリテラルなら、実際の値と比べる。
 *   `{…}` は何にでも一致し、`…` を含む文字列は、… 以外の部分を順に含めば一致とする。リテラルでないコメントは比べない
 * - `new Date()`（現在時刻）を使う式は、結果が実行時刻で変わるので比べない
 * - ブロックが import していない公開の名前（createCalendar など）は、各サブパスから補って import する。
 *   ほかのブロックで定義した値を使う断片のために、FIXTURES の定義を補う
 * - 相対パスの import（利用者のプロジェクトのファイル）を含むブロックは、実行できないので飛ばす
 * - 例で createCalendar・createSchedule に渡した設定は、自動で診断（diagnoseCalendar・diagnoseSchedule）にもかける。
 *   error か warning があれば失敗にする。誤りを見せる例は、コードブロックの直前の空でない行の注記
 *   `<!-- example: allow-diagnostics <code>,<code> -->` で許すコードを明示する
 * - 診断の結果を filter・find で絞った例は失敗にする（絞ると、例の設定の誤りが隠れる）。絞る理由のある例は、直前の空でない行の注記
 *   `<!-- example: allow-filtered-diagnostics -->` で明示する
 * - 移行ガイド（docs/migration.md）は、最新のバージョンの節までを実行する（それより前の節は旧名で書かれていて、1.0.0 で動かなくなる）
 */

import { spawnSync } from "node:child_process";
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

/** ほかのブロックで定義した値を使う断片のための定義（使っていて、ブロック内で定義していないときだけ補う） */
const FIXTURES: Record<string, string> = {
  Hours: "type Hours = { open: string; close: string } | null;",
  weekday: 'const weekday = { open: "10:00", close: "21:00" };',
  sunday: 'const sunday = { open: "10:00", close: "19:00" };',
  storeHours:
    "const storeHours = createSchedule<Hours>({ holidayProvider: jp, weekdayValues: [sunday, weekday, null, weekday, weekday, weekday, weekday], holidayPolicy: { sameAs: 0 } });",
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

/** 診断の結果を filter・find で絞っているか（呼び出しに続けて絞る形と、結果を入れた変数を絞る形） */
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
 * 例の createCalendar・createSchedule を包むモジュール。設定を診断にかけ、許していない error・warning を 1 行ずつ出す
 * （例の import を、パッケージのルートからこのモジュールに付け替える）
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
// 同じ設定（name・nameEn を除く）の診断は 1 回だけ行う。英語版と日本語版の例は、名前のほかは同じ設定を書くので、
// 2 回目は結果を写す（日本語版だけの書き間違いは設定が違うので、診断にかかる。提案書 bizdays-toolkit-0.31.8-proposal の T-3）。
// 鍵で区別できない値を含む設定は写さない: 同梱の提供元のほかの関数（中身が同じでも、閉じ込めた値が違いうる）と、
// カレンダー。明示的な undefined は、書かないこととは別の値として鍵に入れる（decisions.md の 6 番）
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  if (file) writeFileSync(file, JSON.stringify(result));
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
 * パッケージのルートからの読み込み（`from "bizdays-toolkit"`・`from 'bizdays-toolkit'`・`import "bizdays-toolkit"`・
 * 動的な `import("bizdays-toolkit")`・`require("bizdays-toolkit")`（引用符とテンプレートリテラル）。サブパスは含まない）
 */
const ROOT_IMPORT =
  /\b(?:from|import)\s*["']bizdays-toolkit["']|\b(?:import|require)\s*\(\s*["'`]bizdays-toolkit["'`]\s*\)/;

/** コードブロックの直前の空でない行の注記（`<!-- example: <name> <args> -->`） */
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
// 1.0.0 より前のバージョンでだけ返す旧名の項目（docs/migration.md の削除予定の表にある、結果の型の項目）。文書の例は新しい名前だけを書くので、比べない（RELEASING.md の「1.0.0 で行う作業」で消す）
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

/** コード例を実行するファイル（README と docs のガイド。英語・日本語。移行ガイドは最新のバージョンの節まで） */
const DOC_FILES = [
  "README.md",
  "docs/README.ja.md",
  "docs/guide.md",
  "docs/guide.ja.md",
  "docs/providers.md",
  "docs/providers.ja.md",
  "docs/migration.md",
];

/** 実行する範囲の文章（移行ガイドは、2 つ目のバージョンの見出し「## 0.x.y」より前まで） */
function runnablePart(file: string, text: string): string {
  if (file !== "docs/migration.md") return text;
  const versions = [...text.matchAll(/^## \d+\.\d+\.\d+\s*$/gm)];
  return versions.length < 2 ? text : text.slice(0, versions[1]!.index);
}

// 削除予定の表（docs/migration.md）の、結果の型の項目の名前（例: `DayInfo.businessDay` の businessDay）
const RESULT_TYPES = ["DayInfo", "ScheduleDayInfo", "HolidayLookup", "Calendar", "Schedule"];
const deprecatedResultKeys = [
  ...readFileSync("docs/migration.md", "utf8").matchAll(/`([A-Za-z]+)\.([A-Za-z]+)`/g),
]
  .filter((m) => RESULT_TYPES.includes(m[1]!))
  .map((m) => m[2]!);

const dir = mkdtempSync(join(ROOT, ".readme-examples-"));
const failures: string[] = [];
/** 診断の結果を写す場所（同じ設定の 2 回目の診断を省く。包むモジュールの diagnoseOnce） */
const cacheDir = join(dir, "diagnose-cache");
let blocks = 0;
let compared = 0;
/** 包むモジュールが診断にかけた設定の数（関数ごと）。付け替えが外れると 0 件になるので、0 件なら失敗にする */
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
      // パッケージのルートの import を、作成した設定を診断にかけるモジュールに付け替える。付け替えは
      // `from "bizdays-toolkit";` の完全一致なので、ほかの書き方（単引用符・セミコロンなし・import 文だけ・動的な import・
      // require）が残れば、診断にかけずに通ってしまう。残っていたらその例を失敗にする
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
      const result = spawnSync(
        process.execPath,
        ["--import", "./scripts/strict-warnings.ts", path],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            README_EXPECTED: JSON.stringify(prepared.checks.map((c) => c.expected)),
            README_DEPRECATED_KEYS: JSON.stringify(deprecatedResultKeys),
            README_DIAGNOSE_CACHE: cacheDir,
            README_ALLOWED_DIAGNOSTICS: JSON.stringify(
              (notes.get("allow-diagnostics") ?? "").split(",").filter(Boolean),
            ),
          },
        },
      );
      const before = failures.length;
      for (const line of (result.stdout ?? "").split("\n").filter(Boolean)) {
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
            failures.push(`${file}:${startLine}: ${parsed.diagnostic}`);
            continue;
          }
          const { index, actual } = parsed;
          const c = prepared.checks[index]!;
          failures.push(
            `${file}:${startLine + c.line - 1}: ${c.code}\n  expected ${c.expected}\n  actual   ${JSON.stringify(actual)}`,
          );
        } catch {
          // 例の出力（console.log など）は無視する
        }
      }
      if (result.status !== 0 && failures.length === before) {
        failures.push(`${file}:${startLine}: the example failed to run\n${result.stderr}`);
      } else if (result.status !== 0 && !result.stdout) {
        failures.push(`${file}:${startLine}: the example failed to run\n${result.stderr}`);
      }
    }
  }
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
