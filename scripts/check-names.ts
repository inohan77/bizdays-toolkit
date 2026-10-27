import "./strict-warnings.ts";
/**
 * 公開する名前の規則の検査（etc/naming.md の N1〜N9。検査の項目 C1〜C12 は同じ文書にある）。
 *
 * ビルド済みの型定義（dist/*.d.ts）から、package.json の exports の各エントリーが公開する名前
 * （export・型の項目とメソッド・引数・型引数・文字列のリテラル型の値）を集め、etc/naming.md の
 * 用語集・外部の名前の出典と、docs/migration.md の「1.0.0 で削除する予定の API」の表で照合する。
 * 違反が 1 つでもあれば失敗する。名前を許す一覧はこのスクリプトに持たない。
 *
 *   node scripts/check-names.ts           … 照合する
 *   node scripts/check-names.ts --words   … 集めた語を名前とともに一覧にする（用語集を書くときの補助）
 */

import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

// ---------------------------------------------------------------------------
// 入力
// ---------------------------------------------------------------------------

interface Pkg {
  exports: Record<string, string | { types: string }>;
}
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Pkg;
const entries = Object.entries(pkg.exports)
  .filter((e): e is [string, { types: string }] => typeof e[1] !== "string")
  .map(([subpath, target]) => ({
    subpath,
    short: subpath === "." ? "" : subpath.slice(2),
    file: target.types,
  }));
for (const { file } of entries) {
  if (!existsSync(file)) {
    console.error(`${file} not found (run pnpm build first)`);
    process.exit(1);
  }
}

type Pos =
  | "名詞"
  | "動詞"
  | "形容詞"
  | "過去分詞"
  | "前置詞"
  | "接続詞"
  | "副詞"
  | "固有名詞"
  | "略号";
type NounKind = "可算" | "集合" | "不可算";
interface Word {
  readonly word: string;
  readonly pos: Pos;
  readonly noun?: NounKind;
  readonly plural?: string;
  readonly forms: readonly string[];
  /** 項目・引数の名前の最後の語に使ったときに許す型（C12）。undefined は制約なし、空は使わない */
  readonly itemTypes?: readonly string[];
  /** 型の名前の最後の語に使ったときの制約（C12） */
  readonly typeName?: string;
  /** この語を含む文字列の値を置ける型（名前の末尾。C12） */
  readonly valueOwners?: readonly string[];
}

const naming = readFileSync("etc/naming.md", "utf8");

/** 見出し（## …）の下にある最初の表を、行ごとのセルの配列で返す */
function tableUnder(text: string, heading: string): string[][] {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`heading "${heading}" not found`);
  const rest = text.slice(start + heading.length + 5);
  const end = rest.search(/\n## /);
  const body = end < 0 ? rest : rest.slice(0, end);
  const rows = body
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .map((l) =>
      l
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim()),
    );
  return rows.slice(2); // 見出しの行と区切りの行
}
const code = (cell: string): string[] => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

const POS: readonly Pos[] = [
  "名詞",
  "動詞",
  "形容詞",
  "過去分詞",
  "前置詞",
  "接続詞",
  "副詞",
  "固有名詞",
  "略号",
];
const glossary = new Map<string, Word>();
const formOf = new Map<string, Word>();
const glossaryErrors: string[] = [];
for (const [wordCell, formsCell, posCell, typeCell] of tableUnder(naming, "用語集")) {
  const word = code(wordCell ?? "")[0];
  if (word === undefined) continue;
  const m =
    /^(名詞|動詞|形容詞|過去分詞|前置詞|接続詞|副詞|固有名詞|略号)(?:（(可算|集合|不可算)）)?$/.exec(
      posCell ?? "",
    );
  if (!m || !POS.includes(m[1] as Pos)) {
    glossaryErrors.push(`etc/naming.md: 用語集の "${word}" の品詞 "${posCell}" が読めない`);
    continue;
  }
  const pos = m[1] as Pos;
  const forms = code(formsCell ?? "");
  const noun = pos === "名詞" ? ((m[2] as NounKind | undefined) ?? "可算") : undefined;
  const plural = noun === "可算" ? forms[0] : undefined;
  if (noun === "可算" && plural === undefined) {
    glossaryErrors.push(`etc/naming.md: 可算名詞 "${word}" に複数形がない`);
  }
  let itemTypes: string[] | undefined;
  let typeName: string | undefined;
  let valueOwners: string[] | undefined;
  for (const part of (typeCell ?? "").split(/。|；/)) {
    const t = part.trim();
    if (t.startsWith("項目:")) itemTypes = code(t);
    else if (t === "項目: 使わない" || t === "項目に使わない") itemTypes = [];
    if (t.startsWith("型の名前:")) typeName = t.slice("型の名前:".length).trim();
    if (t.startsWith("値:")) valueOwners = code(t);
  }
  if ((typeCell ?? "").includes("項目に使わない")) itemTypes = [];
  const entry: Word = {
    word,
    pos,
    ...(noun ? { noun } : {}),
    ...(plural ? { plural } : {}),
    forms,
    ...(itemTypes ? { itemTypes } : {}),
    ...(typeName ? { typeName } : {}),
    ...(valueOwners ? { valueOwners } : {}),
  };
  if (glossary.has(word)) glossaryErrors.push(`etc/naming.md: 用語集に "${word}" が 2 回ある`);
  glossary.set(word, entry);
  formOf.set(word, entry);
  for (const f of forms) formOf.set(f, entry);
}

const sources = new Set(
  tableUnder(naming, "外部の名前の出典")
    .map((r) => code(r[0] ?? "")[0])
    .filter((s): s is string => s !== undefined),
);

const migration = readFileSync("docs/migration.md", "utf8");
const scheduledRemovals = new Set(
  tableUnder(migration, "1.0.0 で削除する予定の API").flatMap((r) =>
    code(r[0] ?? "").filter((n) => /^[A-Za-z]\w*(?:\.[A-Za-z]\w*)*$/.test(n)),
  ),
);

// ---------------------------------------------------------------------------
// 名前を集める
// ---------------------------------------------------------------------------

const program = ts.createProgram(
  entries.map((e) => e.file),
  { strict: true, noEmit: true, skipLibCheck: true, types: [] },
);
const checker = program.getTypeChecker();

type Kind =
  | "function"
  | "type"
  | "const"
  | "property"
  | "method"
  | "parameter"
  | "type-parameter"
  | "value";
interface Name {
  readonly kind: Kind;
  readonly name: string;
  readonly where: string;
  readonly node: ts.Node;
}
const names: Name[] = [];
const seenNodes = new Set<ts.Node>();
const deprecatedSeen = new Set<string>();

/** 宣言（または VariableStatement）に付いた TSDoc のタグ */
function tagsOf(node: ts.Node): readonly ts.JSDocTag[] {
  const target = ts.isVariableDeclaration(node) ? node.parent.parent : node;
  return ts.getJSDocTags(target);
}
const hasTag = (node: ts.Node, tag: string): boolean =>
  tagsOf(node).some((t) => t.tagName.text === tag);
function namingSourceOf(node: ts.Node): string | undefined {
  const t = tagsOf(node).find((x) => x.tagName.text === "namingSource");
  if (!t) return undefined;
  return (typeof t.comment === "string" ? t.comment : "").trim();
}

const violations: string[] = [];
const report = (rule: string, where: string, reason: string): void => {
  violations.push(`${rule.padEnd(7)} ${where}  ${reason}`);
};

/** 型の宣言の名前。外部の名前の型（@namingSource）は項目と値を見ない（C9） */
const externalTypes = new Set<string>();

interface Decl {
  readonly name: string;
  readonly subpath: string;
  readonly node: ts.Node;
}
const exportedTypes = new Map<string, Decl>();
const exportedFunctions: Decl[] = [];
const exportedConsts: Decl[] = [];

function collectInside(node: ts.Node, owner: string, external: boolean): void {
  if (seenNodes.has(node)) return;
  seenNodes.add(node);
  if ((ts.isPropertySignature(node) || ts.isMethodSignature(node)) && ts.isIdentifier(node.name)) {
    // 削除予定の項目・メソッドは、型の名前と組にした修飾名で照合する（C10）
    const qualified = `${owner}.${node.name.text}`;
    const deprecated = ts.getJSDocTags(node).some((t) => t.tagName.text === "deprecated");
    if (scheduledRemovals.has(qualified)) {
      deprecatedSeen.add(qualified);
      if (!deprecated) report("C10", qualified, "削除予定の表にあるが @deprecated でない");
      return; // 削除予定の名前と、その中の名前は C1〜C8・C11・C12 で見ない
    }
    if (deprecated) report("C10", qualified, "@deprecated だが削除予定の表にない");
  }
  if (!external) {
    if (
      (ts.isPropertySignature(node) || ts.isMethodSignature(node)) &&
      ts.isIdentifier(node.name)
    ) {
      names.push({
        kind: ts.isMethodSignature(node) ? "method" : "property",
        name: node.name.text,
        where: `${owner}.${node.name.text}`,
        node,
      });
    }
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
      names.push({
        kind: "value",
        name: node.literal.text,
        where: `${owner} "${node.literal.text}"`,
        node,
      });
    }
  }
  if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
    names.push({
      kind: "parameter",
      name: node.name.text,
      where: `${owner}(${node.name.text})`,
      node,
    });
  }
  if (ts.isTypeParameterDeclaration(node)) {
    names.push({
      kind: "type-parameter",
      name: node.name.text,
      where: `${owner}<${node.name.text}>`,
      node,
    });
  }
  const childOwner =
    (ts.isPropertySignature(node) || ts.isMethodSignature(node)) && ts.isIdentifier(node.name)
      ? `${owner}.${node.name.text}`
      : owner;
  ts.forEachChild(node, (c) => collectInside(c, childOwner, external));
}

for (const entry of entries) {
  const sf = program.getSourceFile(entry.file)!;
  const moduleSymbol = checker.getSymbolAtLocation(sf)!;
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    let symbol = exported;
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declarations = symbol.declarations ?? [];
    const first = declarations[0];
    if (!first) continue;
    const name = exported.name;
    const deprecated = declarations.some((d) => hasTag(d, "deprecated"));
    if (scheduledRemovals.has(name)) {
      deprecatedSeen.add(name);
      if (!deprecated)
        report("C10", `${name} (${entry.subpath})`, "削除予定の表にあるが @deprecated でない");
      continue; // 削除予定の名前は C1〜C8 で見ない
    }
    if (deprecated)
      report("C10", `${name} (${entry.subpath})`, "@deprecated だが削除予定の表にない");
    const key = `${name}@${first.getSourceFile().fileName}:${first.pos}`;
    if (seenNodes.has(first)) continue; // 同じ宣言を別のエントリーから再 export している
    const decl: Decl = { name, subpath: entry.subpath, node: first };
    void key;
    if (ts.isFunctionDeclaration(first)) {
      exportedFunctions.push(decl);
      names.push({ kind: "function", name, where: `${name} (${entry.subpath})`, node: first });
    } else if (ts.isVariableDeclaration(first)) {
      exportedConsts.push(decl);
      names.push({ kind: "const", name, where: `${name} (${entry.subpath})`, node: first });
    } else {
      exportedTypes.set(name, decl);
      names.push({ kind: "type", name, where: `${name} (${entry.subpath})`, node: first });
    }
    const source = declarations.map(namingSourceOf).find((s) => s !== undefined);
    if (source !== undefined) {
      if (!sources.has(source)) report("N8/C9", name, `@namingSource "${source}" が出典の表にない`);
      externalTypes.add(name);
    }
    for (const d of declarations) {
      seenNodes.delete(d);
      // 関数の宣言は本体の型（引数・戻り値）も同じ規則で集める
      collectInside(d, name, source !== undefined);
      seenNodes.add(d);
    }
  }
}
for (const name of scheduledRemovals) {
  if (!deprecatedSeen.has(name))
    report("C10", name, "削除予定の表にあるが、公開する名前の中に見つからない");
}

// ---------------------------------------------------------------------------
// 語に分ける
// ---------------------------------------------------------------------------

/** camelCase・PascalCase・ケバブケースを語に分ける（連続する大文字は 1 語） */
function splitWords(name: string): string[] {
  return name
    .split("-")
    .flatMap((part) =>
      part
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(" "),
    )
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0);
}

/** 用語集の語句（空白を含む行）。長いものから照合する */
const phrases = [...formOf.keys()]
  .filter((k) => k.includes(" "))
  .map((k) => k.split(" "))
  .sort((a, b) => b.length - a.length);

/** 名前を、用語集の語句を 1 つにまとめた語の列にする（語句は長い順に先に照合する） */
function split(name: string): string[] {
  const words = splitWords(name);
  const out: string[] = [];
  for (let i = 0; i < words.length;) {
    const hit = phrases.find((ph) => ph.every((w, k) => words[i + k] === w));
    if (hit) {
      out.push(hit.join(" "));
      i += hit.length;
    } else {
      out.push(words[i]!);
      i += 1;
    }
  }
  return out;
}
const lookup = (w: string): Word | undefined => formOf.get(w);
const isPluralForm = (w: string): boolean => {
  const e = lookup(w);
  return e?.plural === w;
};

if (process.argv.includes("--words")) {
  const byWord = new Map<string, Set<string>>();
  for (const n of names)
    for (const w of split(n.name)) (byWord.get(w) ?? byWord.set(w, new Set()).get(w)!).add(n.name);
  for (const [w, ns] of [...byWord].sort())
    console.log(`${lookup(w) ? " " : "?"} ${w.padEnd(14)} ${[...ns].slice(0, 8).join(" ")}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 型の形
// ---------------------------------------------------------------------------

function strip(node: ts.TypeNode): ts.TypeNode {
  let n = node;
  for (;;) {
    if (ts.isParenthesizedTypeNode(n)) n = n.type;
    else if (ts.isTypeOperatorNode(n) && n.operator === ts.SyntaxKind.ReadonlyKeyword) n = n.type;
    else return n;
  }
}
const refName = (n: ts.TypeReferenceNode): string =>
  ts.isIdentifier(n.typeName) ? n.typeName.text : n.typeName.right.text;
function members(node: ts.TypeNode): ts.TypeNode[] {
  const n = strip(node);
  return ts.isUnionTypeNode(n) ? n.types.flatMap(members) : [n];
}
function isCollection(node: ts.TypeNode): boolean {
  const n = strip(node);
  if (ts.isArrayTypeNode(n) || ts.isTupleTypeNode(n)) return true;
  if (ts.isTypeReferenceNode(n)) {
    const r = refName(n);
    if (r === "ReadonlyArray" || r === "Array" || r === "Record") return true;
    if ((r === "Readonly" || r === "Partial") && n.typeArguments?.[0])
      return isCollection(n.typeArguments[0]);
  }
  if (ts.isTypeLiteralNode(n)) {
    const keys = n.members
      .map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : ""))
      .sort();
    return keys.join(",") === "from,to"; // 範囲 { from, to }
  }
  return false;
}
type Shape = "collection" | "one-or-many" | "single";
function shapeOf(node: ts.TypeNode): Shape {
  const ms = members(node).filter((m) => m.kind !== ts.SyntaxKind.UndefinedKeyword);
  const c = ms.filter(isCollection).length;
  if (c === 0) return "single";
  return c === ms.length ? "collection" : "one-or-many";
}
/** 型の主な名前（配列は要素、型引数は除く）。C12 で使う */
function baseNames(node: ts.TypeNode): string[] {
  const n = strip(node);
  if (ts.isUnionTypeNode(n)) return n.types.flatMap(baseNames);
  if (ts.isArrayTypeNode(n)) return baseNames(n.elementType);
  if (ts.isTupleTypeNode(n))
    return [
      ...new Set(n.elements.flatMap((e) => baseNames(ts.isNamedTupleMember(e) ? e.type : e))),
    ];
  if (ts.isTypeReferenceNode(n)) {
    const r = refName(n);
    if (
      (r === "ReadonlyArray" || r === "Array" || r === "Readonly" || r === "Partial") &&
      n.typeArguments?.[0]
    )
      return baseNames(n.typeArguments[0]);
    return [r];
  }
  if (ts.isLiteralTypeNode(n)) {
    if (n.literal.kind === ts.SyntaxKind.TrueKeyword) return ["true"];
    if (n.literal.kind === ts.SyntaxKind.FalseKeyword) return ["false"];
    if (ts.isStringLiteral(n.literal)) return ["文字列のリテラル"];
    return ["数のリテラル"];
  }
  if (ts.isTypeLiteralNode(n)) return ["オブジェクト"];
  if (ts.isFunctionTypeNode(n)) return ["関数"];
  if (n.kind === ts.SyntaxKind.UndefinedKeyword) return [];
  return [n.getText()];
}
const isNever = (node: ts.TypeNode | undefined): boolean =>
  node !== undefined && strip(node).kind === ts.SyntaxKind.NeverKeyword;
const isBooleanType = (node: ts.TypeNode): boolean =>
  members(node).some((m) => m.kind === ts.SyntaxKind.BooleanKeyword);
function hasStringLiteral(node: ts.TypeNode): boolean {
  const type = checker.getTypeFromTypeNode(node);
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((t) => (t.flags & ts.TypeFlags.StringLiteral) !== 0);
}
const isFunctionType = (node: ts.TypeNode): boolean =>
  members(node).some((m) => ts.isFunctionTypeNode(m));

// ---------------------------------------------------------------------------
// C1: すべての語が用語集にある
// ---------------------------------------------------------------------------

const usedWords = new Set<string>();
for (const n of names) {
  for (const w of split(n.name)) {
    const e = lookup(w);
    if (e) usedWords.add(e.word);
    else report("N1/C1", n.where, `語 "${w}" が用語集にない`);
  }
}

// C2: 用語集のすべての語が使われている
for (const word of glossary.keys()) {
  if (!usedWords.has(word)) report("N1/C2", word, "用語集の語がどの名前でも使われていない");
}

// ---------------------------------------------------------------------------
// 項目と引数（C4〜C7・C12）
// ---------------------------------------------------------------------------

function itemType(n: Name): ts.TypeNode | undefined {
  const node = n.node;
  if (ts.isPropertySignature(node) || ts.isParameter(node)) return node.type;
  return undefined;
}

for (const n of names) {
  if (n.kind !== "property" && n.kind !== "parameter") continue;
  const type = itemType(n);
  if (!type || isNever(type)) continue; // 形を分けるための ?: never は項目ではない
  const words = split(n.name);
  const last = words[words.length - 1]!;
  const lastWord = lookup(last);
  const firstWord = lookup(words[0]!);
  const optional =
    (ts.isPropertySignature(n.node) || ts.isParameter(n.node)) &&
    n.node.questionToken !== undefined;

  // C4（N3）: 型が boolean の項目の最後の語は形容詞か過去分詞
  if (n.kind === "property" && isBooleanType(type) && lastWord) {
    if (lastWord.pos !== "形容詞" && lastWord.pos !== "過去分詞")
      report("N3/C4", n.where, `型が boolean なのに最後の語 "${last}" が${lastWord.pos}`);
  }

  // C5（N4）: 型の形と最後の語の単数・複数
  if (lastWord) {
    const shape = shapeOf(type);
    const plural = isPluralForm(last);
    const collective = lastWord.noun === "集合";
    const nounish = lastWord.pos === "名詞";
    if (shape === "collection" && !(nounish && (plural || collective)))
      report(
        "N4/C5",
        n.where,
        `集まりを持つのに、最後の語 "${last}" が複数形の名詞でも集合名詞でもない`,
      );
    if (shape === "one-or-many" && plural)
      report("N4/C5", n.where, `1 つか配列を受けるのに、最後の語 "${last}" が複数形`);
    if (shape === "single" && plural)
      report("N4/C5", n.where, `1 つの値なのに、最後の語 "${last}" が複数形`);
  }

  // C6（N5）: 省略可能で文字列のリテラル型を含む項目は Policy で終わり、Policy で終わる項目はその型
  if (n.kind === "property") {
    const literal = hasStringLiteral(type);
    if (optional && literal && last !== "policy")
      report("N5/C6", n.where, "省略可能な選択肢の項目なのに Policy で終わらない");
    if (last === "policy" && !literal)
      report("N5/C6", n.where, "Policy で終わるのに、型が文字列のリテラル型を含まない");
  }

  // C7（N6）: 関数を受ける項目の最初の語は動詞
  if (isFunctionType(type) && firstWord && firstWord.pos !== "動詞")
    report("N6/C7", n.where, `関数を受けるのに、最初の語 "${words[0]}" が${firstWord.pos}`);

  // C12（N1）: 最後の語に許す型
  if (lastWord?.itemTypes) {
    const allowed = lastWord.itemTypes;
    const actual = baseNames(type);
    const bad = actual.filter((t) => !allowed.includes(t));
    if (allowed.length === 0)
      report("N1/C12", n.where, `"${last}" は項目・引数の名前の最後に使わない語`);
    else if (bad.length > 0)
      report(
        "N1/C12",
        n.where,
        `最後の語 "${last}" の項目の型は ${allowed.join("・")} だけ（実際: ${actual.join("・")}）`,
      );
  }
}

// C12（N1）: 型の名前の最後の語の制約
for (const [name, decl] of exportedTypes) {
  const words = split(name);
  const last = lookup(words[words.length - 1]!);
  if (!last?.typeName) continue;
  if (last.typeName === "使わない")
    report("N1/C12", name, `"${last.word}" は型の名前の最後に使わない語`);
  else {
    const required = code(last.typeName);
    const text = decl.node.getText();
    if (!required.some((r) => new RegExp(`\\b${r}\\b`).test(text)))
      report("N1/C12", name, `"${last.word}" で終わる型は ${required.join("・")} を含む型だけ`);
  }
}

// C12（N1）: 値を置ける型
for (const n of names) {
  if (n.kind !== "value") continue;
  const owner = n.where.split(/[ .]/)[0]!;
  for (const w of split(n.name)) {
    const owners = lookup(w)?.valueOwners;
    if (owners && !owners.some((o) => owner.endsWith(o)))
      report(
        "N1/C12",
        n.where,
        `語 "${w}" を含む値は ${owners.map((o) => `…${o}`).join("・")} の型にだけ置く`,
      );
  }
}

// C6（N5）の続き: 設定の値を写して返す項目と、同じ名前の Policy の項目どうし
/** 型が含む文字列のリテラルの値（型の別名をたどる。オブジェクトの選択肢は含めない） */
function literalText(node: ts.TypeNode): string {
  const type = checker.getTypeFromTypeNode(node);
  const parts = type.isUnion() ? type.types : [type];
  return parts
    .filter((t): t is ts.StringLiteralType => (t.flags & ts.TypeFlags.StringLiteral) !== 0)
    .map((t) => t.value)
    .sort()
    .join("|");
}
const properties = names.filter(
  (n): n is Name & { node: ts.PropertySignature } =>
    n.kind === "property" && ts.isPropertySignature(n.node) && n.node.type !== undefined,
);
const optionChoices = new Set(
  properties
    .filter((p) => p.node.questionToken && p.where.split(".")[0]!.endsWith("Options"))
    .map((p) => literalText(p.node.type!))
    .filter((t) => t !== ""),
);
for (const p of properties) {
  const t = literalText(p.node.type!);
  const last = split(p.name).at(-1);
  const isOption = p.node.questionToken !== undefined && p.where.split(".")[0]!.endsWith("Options");
  if (t !== "" && !isOption && optionChoices.has(t) && last !== "policy")
    report(
      "N5/C6",
      p.where,
      "設定の項目と同じ選択肢を持つ（設定の値を写す）のに Policy で終わらない",
    );
}
const policyByName = new Map<string, { where: string; values: Set<string> }[]>();
for (const p of properties) {
  if (split(p.name).at(-1) !== "policy") continue;
  const values = new Set(
    literalText(p.node.type!)
      .split("|")
      .filter((v) => v !== ""),
  );
  if (values.size === 0) continue;
  (policyByName.get(p.name) ?? policyByName.set(p.name, []).get(p.name)!).push({
    where: p.where,
    values,
  });
}
for (const [name, list] of policyByName) {
  // 項目の名前を PascalCase にした型（holidayOverlapPolicy なら HolidayOverlapPolicy）があれば、その型の値の部分集合であること
  // （規則の形ごとに選択肢を絞った項目も同じ扱いの選択）。型がなければ、どれか 2 つの一方が他方を含むこと
  const typeDecl = exportedTypes.get(name.charAt(0).toUpperCase() + name.slice(1));
  if (typeDecl && ts.isTypeAliasDeclaration(typeDecl.node)) {
    const allowed = new Set(
      literalText(typeDecl.node.type)
        .split("|")
        .filter((v) => v !== ""),
    );
    for (const item of list) {
      const extra = [...item.values].filter((v) => !allowed.has(v));
      if (extra.length > 0)
        report(
          "N5/C6",
          item.where,
          `選択肢 ${extra.join("・")} が型 ${typeDecl.name} の値（${[...allowed].join("・")}）にない`,
        );
    }
    continue;
  }
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const aInB = [...a.values].every((v) => b.values.has(v));
      const bInA = [...b.values].every((v) => a.values.has(v));
      if (!aInB && !bInA)
        report(
          "N5/C6",
          `${a.where} と ${b.where}`,
          `同じ名前の Policy の選択肢がどちらも他方を含まない（${[...a.values].join("・")} と ${[...b.values].join("・")}）`,
        );
    }
}

// ---------------------------------------------------------------------------
// C3（N2）: 関数・メソッドの名前の形
// ---------------------------------------------------------------------------

const ACTION_VERBS = new Set(["create", "combine", "diagnose", "migrate", "adjust"]);
const DATE_PARAMS = new Set(["DateInput", "DateString", "DateTimeInput"]);
const DATE_FORMS = new Set(["DateString", "MonthString", "Weekday", "CivilDateTimeParts", "Date"]);

interface Sig {
  readonly where: string;
  readonly name: string;
  readonly params: readonly ts.ParameterDeclaration[];
  readonly ret: ts.TypeNode | undefined;
}
const sigs: Sig[] = [];
for (const f of exportedFunctions) {
  const symbol = checker.getSymbolAtLocation((f.node as ts.FunctionDeclaration).name!)!;
  for (const d of symbol.declarations ?? []) {
    if (ts.isFunctionDeclaration(d))
      sigs.push({
        where: `${f.name} (${f.subpath})`,
        name: f.name,
        params: d.parameters,
        ret: d.type,
      });
  }
}
for (const n of names) {
  if (n.kind === "method" && ts.isMethodSignature(n.node))
    sigs.push({ where: n.where, name: n.name, params: n.node.parameters, ret: n.node.type });
}

const retIs = (s: Sig, test: (n: ts.TypeNode) => boolean): boolean =>
  s.ret !== undefined &&
  members(s.ret)
    .filter((m) => m.kind !== ts.SyntaxKind.UndefinedKeyword)
    .every(test);
const retArray = (s: Sig): boolean =>
  s.ret !== undefined && shapeOf(s.ret) === "collection" && !ts.isTypeLiteralNode(strip(s.ret));
const retNumber = (s: Sig): boolean => retIs(s, (n) => n.kind === ts.SyntaxKind.NumberKeyword);
const retBoolean = (s: Sig): boolean =>
  s.ret !== undefined &&
  (ts.isTypePredicateNode(s.ret) || retIs(s, (n) => n.kind === ts.SyntaxKind.BooleanKeyword));
const retName = (s: Sig): string[] => (s.ret ? baseNames(s.ret) : []);
const retDateString = (s: Sig): boolean =>
  retName(s).length === 1 && retName(s)[0] === "DateString";
const paramNames = (s: Sig): string[] =>
  s.params.map((p) => (ts.isIdentifier(p.name) ? p.name.text : ""));
const required = (s: Sig): ts.ParameterDeclaration[] =>
  s.params.filter((p) => !p.questionToken && !p.initializer);
const isDateParam = (p: ts.ParameterDeclaration | undefined): boolean =>
  p?.type !== undefined && baseNames(p.type).some((t) => DATE_PARAMS.has(t));

for (const s of sigs) {
  const w = split(s.name);
  const first = w[0]!;
  const last = w[w.length - 1]!;
  const firstWord = lookup(first);
  const ps = paramNames(s);
  const bad = (reason: string): void => report("N2/C3", s.where, reason);
  const endsWith = (...tail: string[]): boolean =>
    tail.every((t, i) => w[w.length - tail.length + i] === t);

  const isIs = first === "is";
  const isTo = first === "to" && w.length > 1;
  const isOf = last === "of";
  const isAdd = first === "add";
  const isDiff = first === "diff";
  const isNextPrev =
    first === "next" ||
    first === "previous" ||
    endsWith("on", "or", "after") ||
    endsWith("on", "or", "before");
  const isBetween = last === "between";
  const isOn = last === "on" && !isNextPrev;
  const isInYear = endsWith("in", "year");
  const isLength = first === "length";
  const isPosition =
    (first === "nth" || first === "first" || first === "last") && endsWith("of", "month");
  const isWith = first === "with";
  const isAction = ACTION_VERBS.has(first);
  const patterned =
    isIs ||
    isTo ||
    isOf ||
    isAdd ||
    isDiff ||
    isNextPrev ||
    isBetween ||
    isOn ||
    isInYear ||
    isLength ||
    isPosition ||
    isWith ||
    isAction;

  // 形ごとの約束
  if (isIs && !retBoolean(s)) bad("is… なのに真偽値を返さない");
  if (isTo && ps[ps.length - 1] !== "timeZone") bad("to… なのに最後の引数が timeZone でない");
  if (isOf && ps.includes("timeZone")) bad("…Of なのにタイムゾーンを引数に取る");
  if (isAdd && !retDateString(s)) bad("add… なのに日付を返さない");
  if (isDiff && !(retNumber(s) && ps[0] === "from" && ps[1] === "to"))
    bad("diff… なのに (from, to) で数を返さない");
  if (isNextPrev && !retDateString(s))
    bad("next…・previous…・…OnOrAfter・…OnOrBefore なのに日付を返さない");
  if (isBetween && !(ps[0] === "from" && ps[1] === "to" && retArray(s)))
    bad("…Between なのに (from, to) で一覧を返さない");
  if (isOn && !(isDateParam(s.params[0]) && !retArray(s)))
    bad("…On なのに日付を受けて 1 つのものを返さない");
  if (isInYear && !retArray(s)) bad("…InYear なのに一覧を返さない");
  if (isLength && !retNumber(s)) bad("length… なのに数を返さない");
  if (isPosition && !retDateString(s)) bad("nth…・first…・last…OfMonth なのに日付を返さない");
  if (isWith) {
    const p0 = s.params[0]?.type;
    if (
      !(
        p0 &&
        retArray(s) &&
        shapeOf(p0) === "collection" &&
        baseNames(p0).join() === retName(s).join()
      )
    )
      bad("with… なのに第 1 引数と同じ要素の一覧を返さない");
  }
  if (!patterned && firstWord && (firstWord.pos === "動詞" || firstWord.pos === "前置詞"))
    bad(
      `"${first}" で始まるが、N2 の形（create・combine・diagnose・migrate・adjust・add・diff・is・to・with）でない`,
    );
  if (!patterned && firstWord) {
    // 単数の名詞: 主要部（最初の前置詞の前の最後の語、なければ最後の語）が単数の名詞
    const prep = w.findIndex((x) => lookup(x)?.pos === "前置詞");
    const head = prep > 0 ? w[prep - 1]! : last;
    const hw = lookup(head);
    if (hw && ((hw.pos !== "名詞" && hw.pos !== "固有名詞") || isPluralForm(head)))
      bad(`N2 のどの形にも当たらず、主要部 "${head}" が単数の名詞でない`);
  }

  // 逆向きの約束（戻り値・引数の形から名前の形が決まる）
  if (retBoolean(s) && !isIs) bad("真偽値を返すのに is… でない");
  if (retNumber(s) && !isDiff && !isLength) bad("数を返すのに diff…・length… でない");
  if (retArray(s) && !(isBetween || isInYear || isWith || isAction))
    bad("一覧を返すのに …Between・…InYear・with… でも動作の動詞でもない");
  const req = required(s);
  if (
    req.length === 1 &&
    isDateParam(req[0]) &&
    !(isIs || isTo || isNextPrev || isAdd || isAction) &&
    !retArray(s)
  ) {
    const form = retName(s).length > 0 && retName(s).every((t) => DATE_FORMS.has(t));
    if (form && !isOf) bad("日付 1 つを受けて日付の別の表し方を返すのに …Of でない");
    if (!form && !isOn) bad("日付 1 つを受けてその日のものを返すのに …On でない");
  }
  const p0 = s.params[0]?.type;
  if (
    p0 &&
    retArray(s) &&
    shapeOf(p0) === "collection" &&
    baseNames(p0).join() === retName(s).join() &&
    !isWith
  )
    bad("第 1 引数と同じ要素の一覧を返すのに with… でない");
}

// ---------------------------------------------------------------------------
// C8（N7）: 国の型の頭・提供元の定数・設定の型
// ---------------------------------------------------------------------------

const pascal = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
for (const entry of entries) {
  if (!/^[a-z]{2}$/.test(entry.short)) continue; // 国・地域のサブパス（2 文字の略号）
  const prefix = pascal(entry.short);
  for (const [name, decl] of exportedTypes) {
    if (decl.subpath !== entry.subpath) continue;
    const bare = name.startsWith("Known") ? name.slice("Known".length) : name;
    if (!bare.startsWith(prefix))
      report("N7/C8", `${name} (${entry.subpath})`, `国ごとの型は ${prefix} で始める`);
  }
  const providers = exportedConsts.filter(
    (c) =>
      c.subpath === entry.subpath &&
      /HolidayProvider/.test(checker.typeToString(checker.getTypeAtLocation(c.node))),
  );
  if (providers.length === 1 && providers[0]!.name !== entry.short)
    report(
      "N7/C8",
      `${providers[0]!.name} (${entry.subpath})`,
      `提供元が 1 つのサブパスの定数はサブパスの名前 ${entry.short}`,
    );
}

const optionsTypes = [...exportedTypes.keys()].filter((n) => n.endsWith("Options"));
for (const name of optionsTypes) {
  const users = sigs.filter((s) =>
    s.params.some((p) => p.type && baseNames(p.type).includes(name)),
  );
  if (users.length > 0) {
    const expected = new Set<string>();
    for (const u of users) expected.add(`${pascal(u.name.replace(/^create(?=[A-Z])/, ""))}Options`);
    const verbs = new Set(users.map((u) => split(u.name)[0]!));
    if (users.length > 1 && verbs.size === 1) expected.add(`${pascal([...verbs][0]!)}Options`);
    if (!expected.has(name))
      report(
        "N7/C8",
        name,
        `受ける関数（${users.map((u) => u.name).join("・")}）から決まる名前は ${[...expected].join("・")}`,
      );
  } else {
    const extended = [...exportedTypes.values()].some(
      (d) =>
        ts.isInterfaceDeclaration(d.node) &&
        (d.node.heritageClauses ?? []).some((h) =>
          h.types.some((t) => t.expression.getText() === name),
        ),
    );
    if (!extended) report("N7/C8", name, "どの関数も受けず、どの設定の型も継承していない");
  }
}
for (const s of sigs) {
  for (const p of s.params) {
    if (p.type && ts.isTypeLiteralNode(strip(p.type)) && ts.isIdentifier(p.name))
      report("N7/C8", `${s.where}(${p.name.text})`, "設定の引数の型に名前がない");
  }
}

// ---------------------------------------------------------------------------
// C11（N9）: スケジュール版の型
// ---------------------------------------------------------------------------

function reachable(roots: readonly string[]): Set<string> {
  const out = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (out.has(name)) continue;
    const decl = exportedTypes.get(name);
    if (!decl) continue;
    out.add(name);
    const visit = (node: ts.Node): void => {
      if (ts.isTypeReferenceNode(node)) queue.push(refName(node));
      if (ts.isExpressionWithTypeArguments(node)) queue.push(node.expression.getText());
      ts.forEachChild(node, visit);
    };
    visit(decl.node);
  }
  return out;
}
const scheduleSide = reachable(["Schedule", "ScheduleOptions"]);
const calendarSide = reachable(["Calendar", "CalendarOptions"]);
for (const name of scheduleSide) {
  if (calendarSide.has(name) || name === "Schedule" || name === "ScheduleOptions") continue;
  const bare = name.startsWith("Known") ? name.slice("Known".length) : name;
  if (!bare.startsWith("Schedule"))
    report("N9/C11", name, "スケジュールだけが使う型なのに Schedule で始まらない");
}
for (const name of exportedTypes.keys()) {
  const bare = name.startsWith("Known") ? name.slice("Known".length) : name;
  if (!bare.startsWith("Schedule") || bare === "Schedule" || bare === "ScheduleOptions") continue;
  const counterpart = bare.slice("Schedule".length);
  if (!exportedTypes.has(counterpart))
    report("N9/C11", name, `Schedule を除いた ${counterpart} という型（カレンダー版）がない`);
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

for (const e of glossaryErrors) console.error(e);
for (const v of violations) console.log(v);
const count = (k: Kind): number => names.filter((n) => n.kind === k).length;
console.log(
  `checked ${names.length} names (functions ${count("function")}, types ${count("type")}, constants ${count("const")}, ` +
    `properties ${count("property")}, methods ${count("method")}, parameters ${count("parameter")}, ` +
    `type parameters ${count("type-parameter")}, values ${count("value")}); glossary ${glossary.size} words; ` +
    `${violations.length} violation(s)`,
);
if (violations.length > 0 || glossaryErrors.length > 0) process.exit(1);
