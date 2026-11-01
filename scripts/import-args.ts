/**
 * 子プロセスの node に渡す --import の引数を作る。値はファイルの URL（file://）にする。Windows の絶対パス（C:\…）を
 * そのまま渡すと、Node.js は "c:" をスキームとして読んで ERR_UNSUPPORTED_ESM_URL_SCHEME で止まるため
 * （scripts/record-generator-features.ts が使い、test/import-args.test.ts が確かめる）
 */

import { pathToFileURL } from "node:url";

export function importArgs(paths: readonly string[]): string[] {
  return paths.flatMap((p) => ["--import", pathToFileURL(p).href]);
}
