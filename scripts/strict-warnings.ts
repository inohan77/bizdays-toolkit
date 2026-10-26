/**
 * Node.js の警告を失敗として扱う（decisions.md の 24 番）。
 *
 * 自前のスクリプトは先頭でこのファイルを import し、テストは node --import で読み込む（--import は node --test が
 * 各テストファイルを動かす子プロセスにも引き継がれる）。
 * 警告が出たら終了コードを 1 にする。警告のイベントは非同期に届くので、process.emitWarning の呼び出しを記録する。
 */

const warnings: string[] = [];

const emitWarning = process.emitWarning.bind(process) as (...args: unknown[]) => void;
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const message = typeof warning === "string" ? warning : `${warning.name}: ${warning.message}`;
  const type =
    typeof rest[0] === "string" ? rest[0] : (rest[0] as { type?: string } | undefined)?.type;
  warnings.push(type ? `${type}: ${message}` : message);
  emitWarning(warning, ...rest);
}) as typeof process.emitWarning;

process.on("exit", (code) => {
  if (warnings.length === 0) return;
  for (const w of warnings) console.error(`Node.js warning treated as an error: ${w}`);
  if (code === 0) process.exitCode = 1;
});
