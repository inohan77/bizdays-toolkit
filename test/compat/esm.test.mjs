// 公開する dist を、ESM（import）で確かめる。確認の中身は smoke.mjs（ブラウザー・Cloudflare Workers と共通）。
// パッケージ名での自己参照（package.json の exports）で読み込むので、利用者と同じ経路で確かめられる。
// 実行の前に pnpm build が必要（CI の compat ジョブと pnpm check が行う）
import { test } from "node:test";
import * as root from "bizdays-toolkit";
import * as diagnose from "bizdays-toolkit/diagnose";
import * as jp from "bizdays-toolkit/jp";
import * as uk from "bizdays-toolkit/uk";
import { smoke } from "./smoke.mjs";

const { results, temporal } = smoke({ root, jp, uk, diagnose });
// 本物の Temporal で確かめたかどうかを、黙って飛ばさずに必ず表示する
console.log(
  `Temporal: ${temporal === "native" ? "checked with the native Temporal" : "skipped (no Temporal in this runtime)"}`,
);

for (const r of results) {
  test(r.name, () => {
    if (!r.ok) throw new Error(r.error);
  });
}
