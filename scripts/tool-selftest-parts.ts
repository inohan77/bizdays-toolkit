/**
 * 検査のスクリプトの検査（scripts/tool-selftest.ts）の部品。スクリプトは pnpm check で動かさないので、表と例外の扱いを
 * ここに切り出し、test/tools/tool-selftest-parts.test.ts が確かめる。
 */

/** Markdown の表のセルに入れる文字列（| は \| にし、改行は / にする。表の列がずれないため） */
export function cell(text: string): string {
  return text.replaceAll("|", "\\|").replace(/\r?\n/g, " / ");
}

/** 例外の文（Error でない値が投げられても、String で文にする） */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * ファイルを 1 つずつ写し、写すたびに copied に足す。途中で例外が出ても、そこまでに写したファイルは copied に残る
 * （例外はそのまま投げる。呼び出し側が、写したファイルの一覧を出してから失敗にする）
 */
export function copyEach(
  files: readonly string[],
  copyOne: (file: string) => void,
  copied: string[],
): void {
  for (const file of files) {
    copyOne(file);
    copied.push(file);
  }
}
