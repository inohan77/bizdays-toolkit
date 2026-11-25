/**
 * The forms of a reference to numbered decisions of decisions.md (the Japanese forms, with one number or several
 * numbers in a row, and the English form with # before each number) and the files searched for references.
 * (Examples with digits would themselves be counted as references, so none is written here.)
 * The check that the references exist (checkReferences of scripts/check-package.ts) and the table of references
 * (c of scripts/check-claims.ts) use the same definitions (so that the scope and form of the two do not diverge).
 */

import { readdirSync, statSync } from "node:fs";
import { releaseSections } from "./release-sections.ts";

/**
 * A decision reference. In the Japanese form the numbers may be separated by a middle dot, an ideographic comma
 * or a comma, each optionally followed by the counter word (decisionNumbers splits them); the ordinal form
 * (counter word plus ordinal suffix) is not counted.
 * In English comments the numbers are written with #, separated by commas, directly after the file name
 */
export const DECISION_REFERENCE =
  /decisions\.md`? (?:の )?((?:#?\d+ ?番?[・、,] ?)*#?\d+)(?: ?番(?!目)|(?<=#\d+))/g;

/** Splits the list of numbers of a reference into numbers */
export const decisionNumbers = (list: string): number[] =>
  list.split(/[・、,]/).map((x) => Number(x.replace(/[番#]/g, "").trim()));

/**
 * The files that describe the current version (source, tools, tests and workflows, which have comments, and the
 * documents that are not history). Their file-path references and decision references (current numbers) are
 * checked. decisions.md itself and the migration guide (history) are not included
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
      // Files that record history (the decisions document, the migration guide, the development log) correctly
      // contain names from before renames and removals, so they are left out
      .filter(
        (f) =>
          f.endsWith(".md") &&
          f !== "decisions.md" &&
          f !== "migration.md" &&
          f !== "development-log.md",
      )
      .map((f) => `docs/${f}`),
    ...readdirSync("docs/sources").map((f) => `docs/sources/${f}`),
  ];
}

/**
 * The files searched for decision references (current numbers): the files that describe the current version,
 * and the migration guide
 */
export const decisionReferenceFiles = (): string[] => [...currentFiles(), "docs/migration.md"];

/**
 * The version after which the decisions were renumbered. The CHANGELOG sections up to this version use the old
 * numbers (the correspondence table at the end of decisions.md)
 */
const RENUMBERED_AFTER = [0, 30, 2];

/** The version sections of the CHANGELOG, and whether a section's references use the old numbers */
export function changelogSections(): { version: string; text: string; oldNumbering: boolean }[] {
  const isOld = (version: string): boolean => {
    if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
    const v = version.split(".").map(Number);
    for (let i = 0; i < 3; i++)
      if (v[i] !== RENUMBERED_AFTER[i]) return v[i]! < RENUMBERED_AFTER[i]!;
    return true;
  };
  // From 0.31.0 the development log is docs/development-log.md. The sections of the same version are joined, so
  // that the number of references is the same before and after the move
  const sections = releaseSections();
  return [...sections].map(([version, text]) => ({
    version,
    text: `${version}]${text}`,
    oldNumbering: isOld(version),
  }));
}
