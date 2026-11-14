// 公開する dist を、Node.js 以外の JavaScript の実行環境（Bun・Deno）で確かめる実行ファイル（CI の bun・deno ジョブから実行。
// RELEASING.md の「品質の仕組みの理由」の「確かめる実行環境」）。確認の中身は smoke.mjs（Node.js・ブラウザー・Cloudflare Workers と共通）。
// どの環境でも動くよう、標準の JavaScript だけで書く（node: のモジュールは使わない）。
// 実行の前に pnpm build が必要
//   bun run test/compat/runtime.mjs --require-temporal
//   deno run test/compat/runtime.mjs --require-temporal
// --require-temporal: 本物の Temporal がなければ失敗にする（Temporal があるはずの実行環境で、Temporal を使う確認が黙って飛ぶのを防ぐ）
import * as root from "../../dist/index.js";
import * as diagnose from "../../dist/diagnose/index.js";
import * as jp from "../../dist/jp/index.js";
import * as provider from "../../dist/provider/index.js";
import * as sg from "../../dist/sg/index.js";
import * as fr from "../../dist/fr/index.js";
import * as uk from "../../dist/uk/index.js";
import { smoke } from "./smoke.mjs";

const { results, temporal, timeZones } = smoke({ root, jp, uk, sg, fr, diagnose, provider });
for (const r of results)
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.error ? `: ${r.error}` : ""}`);
// 本物の Temporal で確かめたかどうかを、黙って飛ばさずに必ず表示する
console.log(
  `Temporal: ${temporal === "native" ? "checked with the native Temporal" : "skipped (no Temporal in this runtime)"}`,
);
const args =
  globalThis.Deno !== undefined ? globalThis.Deno.args : globalThis.process.argv.slice(2);
const unknownArgs = args.filter((a) => a !== "--require-temporal");
// 知らない引数は、黙って無視せずに失敗にする（引数の綴りを誤ると、Temporal を必須にしたつもりで飛ばしてしまう）
if (unknownArgs.length > 0) console.log(`FAIL unknown argument: ${unknownArgs.join(" ")}`);
const temporalMissing = args.includes("--require-temporal") && temporal !== "native";
if (temporalMissing) console.log("FAIL Temporal is required in this runtime but is absent");
// タイムゾーンの名前の扱いの記録（中身は合否にしない）。1 行も出なければ、黙って飛ばさずに失敗にする
for (const line of timeZones) console.log(`TimeZone: ${line}`);
if (timeZones.length === 0) console.log("FAIL no time zone report");
const code =
  results.length > 0 &&
  timeZones.length > 0 &&
  results.every((r) => r.ok) &&
  unknownArgs.length === 0 &&
  !temporalMissing
    ? 0
    : 1;
if (globalThis.Deno !== undefined) globalThis.Deno.exit(code);
else globalThis.process.exit(code);
