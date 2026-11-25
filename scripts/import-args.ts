/**
 * Builds the --import arguments passed to a child node process. The value is a file URL (file://): given a
 * Windows absolute path (C:\...) as it is, Node.js reads "c:" as a scheme and stops with
 * ERR_UNSUPPORTED_ESM_URL_SCHEME (used by scripts/record-generator-features.ts and checked by
 * test/tools/import-args.test.ts)
 */

import { pathToFileURL } from "node:url";

export function importArgs(paths: readonly string[]): string[] {
  return paths.flatMap((p) => ["--import", pathToFileURL(p).href]);
}
