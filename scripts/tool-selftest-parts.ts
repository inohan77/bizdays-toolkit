/**
 * Parts of the check of the checking scripts (scripts/tool-selftest.ts). The script is not run by pnpm check, so
 * the table and the error handling are here and checked by test/tools/tool-selftest-parts.test.ts.
 */

/** A string for a Markdown table cell (| becomes \|, a line break becomes /, so that the columns do not shift) */
export function cell(text: string): string {
  return text.replaceAll("|", "\\|").replace(/\r?\n/g, " / ");
}

/** The text of an error (a thrown value that is not an Error becomes text with String) */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Copies files one by one and adds each to `copied`. When an error occurs on the way, the files copied so far
 * stay in `copied` (the error is rethrown; the caller prints the list of copied files and then fails)
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
