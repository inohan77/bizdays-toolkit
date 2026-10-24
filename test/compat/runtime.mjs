// 公開する dist を、Node.js 以外の JavaScript の実行環境（Bun・Deno）で確かめる実行ファイル（CI の bun・deno ジョブから実行。
// decisions.md の 26 番）。確認の中身は smoke.mjs（Node.js・ブラウザー・Cloudflare Workers と共通）。
// どの環境でも動くよう、標準の JavaScript だけで書く（node: のモジュールは使わない）。
// 実行の前に pnpm build が必要
//   bun run test/compat/runtime.mjs
//   deno run --unstable-temporal test/compat/runtime.mjs
import * as root from "../../dist/index.js";
import * as diagnose from "../../dist/diagnose/index.js";
import * as jp from "../../dist/jp/index.js";
import * as provider from "../../dist/provider/index.js";
import * as sg from "../../dist/sg/index.js";
import * as uk from "../../dist/uk/index.js";
import { smoke } from "./smoke.mjs";

const { results, temporal } = smoke({ root, jp, uk, sg, diagnose, provider });
for (const r of results)
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.error ? `: ${r.error}` : ""}`);
// 本物の Temporal で確かめたかどうかを、黙って飛ばさずに必ず表示する
console.log(
  `Temporal: ${temporal === "native" ? "checked with the native Temporal" : "skipped (no Temporal in this runtime)"}`,
);
const code = results.length > 0 && results.every((r) => r.ok) ? 0 : 1;
if (globalThis.Deno !== undefined) globalThis.Deno.exit(code);
else globalThis.process.exit(code);
