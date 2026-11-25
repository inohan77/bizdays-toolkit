/**
 * Stops with exit code 2 on an unexpected error (uncaughtException, unhandledRejection). Importing it is enough.
 *
 * The exit codes of result-compare (scripts/result-compare.ts) are 0 = pass, 1 = a difference that is not
 * allowed or options that unintentionally failed to be created, 2 = wrong arguments, a loading error or an
 * unexpected error. The default 1 of Node.js cannot be told from "a difference that is not allowed", so it
 * becomes 2. The exit code then tells "the comparison did not finish" (a broken tool) from "a difference was
 * found" (wherever it runs - the result-compare job of CI, the manual wide comparison
 * .github/workflows/result-compare-wide.yml, or locally - the result is not misread).
 *
 * In an ES module every static import is evaluated before the body. Therefore this registration is the first
 * import of the script that loads it (so that an error thrown while evaluating another import is caught too).
 */
for (const event of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(event, (error: unknown) => {
    console.error(
      `stopped by an unexpected exception: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    process.exit(2);
  });
}
