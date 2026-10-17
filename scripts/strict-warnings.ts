/**
 * Node.js の警告（非推奨の API・実験的な機能など）を失敗として扱う（decisions.md の 24 番）。
 *
 * 自前のスクリプトは先頭でこのファイルを import し、テストは node --import でこのファイルを読み込む
 * （node --test が各テストファイルを動かす子プロセスにも引き継がれる）。
 * 警告が出たら、終了コードを 1 にする（process.exit(0) で終わるスクリプトでも 1 にする）。
 * 警告のイベントは非同期に届くため、同期的に process.exit するスクリプトでも見落とさないよう、
 * process.emitWarning の呼び出しそのものを記録する（Node.js 自身の警告もこの関数を通る）。
 * 公開物の互換性の確認（test/compat）は、利用者の環境で動くかを確かめるものなので対象にしない
 * （Node.js 22.12 では require() で ESM を読み込むと実験的な機能の警告が出るが、利用者にとって問題ではない）。
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
