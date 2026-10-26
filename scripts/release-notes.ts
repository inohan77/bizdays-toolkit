/**
 * CHANGELOG.md から指定した版の節を取り出して標準出力に書く（GitHub Release の本文に使う）。
 *
 *   node scripts/release-notes.ts <version>
 */

import "./strict-warnings.ts";
import { readFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("usage: node scripts/release-notes.ts <version>");
  process.exit(2);
}

const text = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const m = new RegExp(
  `^## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`,
  "m",
).exec(text);
if (!m) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
process.stdout.write(`${m[1]!.trim()}\n`);
