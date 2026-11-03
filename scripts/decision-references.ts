/**
 * 決定の番号の参照（「decisions.md の N 番」と、番号を並べた「decisions.md の M・N 番」）の形と、参照を探すファイル。
 * （例文を数字で書くと、それ自身が参照として数えられるので、ここでは N・M で書く）
 * 文書の参照の実在の検査（scripts/check-package.ts の checkReferences）と、参照の表（scripts/check-claims.ts の c）が
 * 同じものを使う（2 つの検査の範囲と形がずれないように）。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";

/** 決定の番号の参照。番号は「・」「、」「,」で並べてよい（decisionNumbers で分ける）。「番目」は数えない */
export const DECISION_REFERENCE = /decisions\.md`? の ([\d・、, ]+?) ?番(?!目)/g;

/** 参照の番号の並び（"M・N"）を番号に分ける */
export const decisionNumbers = (list: string): number[] =>
  list.split(/[・、,]/).map((x) => Number(x.trim()));

/**
 * 今の版のことを書くファイル（コメントのあるソース・道具・テスト・ワークフローと、履歴でない文書）。ファイルのパスの参照と、
 * 決定の番号の参照（今の番号）を確かめる。decisions.md 自身と移行ガイド（履歴）は含まない
 */
export function currentFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = `${dir}/${name}`;
      if (name === "node_modules" || name === "dist") return [];
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  return [
    ...["scripts", "src", "test", ".github"]
      .flatMap(walk)
      .filter((f) => /\.(ts|mts|mjs|cjs|yml)$/.test(f)),
    "README.md",
    "RELEASING.md",
    "SECURITY.md",
    ...readdirSync("docs")
      .filter((f) => f.endsWith(".md") && f !== "decisions.md" && f !== "migration.md")
      .map((f) => `docs/${f}`),
    ...readdirSync("docs/sources").map((f) => `docs/sources/${f}`),
  ];
}

/** 決定の番号の参照（今の番号）を探すファイル: 今の版のことを書くファイルと、移行ガイド */
export const decisionReferenceFiles = (): string[] => [...currentFiles(), "docs/migration.md"];

/** 決定の番号を振り直した版。CHANGELOG のこの版までの節は、旧番号で書かれている（decisions.md の末尾の対応表） */
const RENUMBERED_AFTER = [0, 30, 2];

/** CHANGELOG の版の節と、その節の参照が旧番号か */
export function changelogSections(): { version: string; text: string; oldNumbering: boolean }[] {
  const isOld = (version: string): boolean => {
    if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
    const v = version.split(".").map(Number);
    for (let i = 0; i < 3; i++)
      if (v[i] !== RENUMBERED_AFTER[i]) return v[i]! < RENUMBERED_AFTER[i]!;
    return true;
  };
  return readFileSync("CHANGELOG.md", "utf8")
    .split(/^## \[/m)
    .slice(1)
    .map((text) => {
      const version = text.slice(0, text.indexOf("]"));
      return { version, text, oldNumbering: isOld(version) };
    });
}
