/**
 * Treats warnings of Node.js as failures (RELEASING.md, reasons for the quality mechanisms, "runtimes that are
 * checked").
 *
 * The repository's scripts import this file first, and tests load it with node --import (--import is inherited
 * by the child processes in which node --test runs each test file).
 * A warning sets the exit code to 1. Warning events arrive asynchronously, so calls of process.emitWarning are
 * recorded.
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
