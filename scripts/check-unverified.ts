import "./strict-warnings.ts";
/**
 * The table of what is not verified (G5 of the plan; RELEASING.md, "Checks that keep the promises of the
 * diagnostics"). What was found not verified is kept in etc/unverified.json, not in a plan outside the
 * repository: a row in the state "open" makes the check before a release (the release steps) fail.
 *
 *   node scripts/check-unverified.ts               ... the check before a release (fails for an "open" row)
 *   node scripts/check-unverified.ts --allow-open  ... the form of the table only (pnpm check)
 * Exit code: 0 = pass, 1 = a problem, 2 = wrong arguments.
 */

import { existsSync, readFileSync } from "node:fs";
import { checkUnverified, type UnverifiedRow } from "./promise-parts.ts";

const TABLE = "etc/unverified.json";
const args = process.argv.slice(2);
if (args.some((a) => a !== "--allow-open")) {
  console.error("usage: node scripts/check-unverified.ts [--allow-open]");
  process.exit(2);
}
const allowOpen = args.includes("--allow-open");
const rows = (JSON.parse(readFileSync(TABLE, "utf8")) as { rows: UnverifiedRow[] }).rows;
const problems = checkUnverified(rows, (f) => existsSync(f), allowOpen);
const count = (state: string): number => rows.filter((r) => r.state === state).length;
console.log(
  `${TABLE}: ${rows.length} row(s) (open ${count("open")}, verified ${count("verified")}, no-options ${count("no-options")}, documented ${count("documented")})`,
);
if (problems.length > 0) {
  for (const p of problems) console.error(`NG   ${p}`);
  process.exit(1);
}
console.log(allowOpen ? `OK   ${TABLE}: the form of every row` : `OK   ${TABLE}: no row is open`);
