// The executable that checks the published dist in JavaScript runtimes other than Node.js (Bun, Deno) (run by
// the bun and deno jobs of CI; RELEASING.md, reasons for the quality mechanisms, "runtimes that are checked").
// The checks themselves are in smoke.mjs (shared with Node.js, browsers and Cloudflare Workers).
// Written in standard JavaScript only, to run anywhere (no node: modules).
// Needs pnpm build before running
//   bun run test/compat/runtime.mjs --require-temporal
//   deno run test/compat/runtime.mjs --require-temporal
// --require-temporal: fails without a real Temporal (so that, in a runtime that should have Temporal, the checks
// using it are not silently skipped)
import * as root from "../../dist/index.js";
import * as diagnose from "../../dist/diagnose/index.js";
import * as jp from "../../dist/jp/index.js";
import * as provider from "../../dist/provider/index.js";
import * as sg from "../../dist/sg/index.js";
import * as fr from "../../dist/fr/index.js";
import * as uk from "../../dist/uk/index.js";
import { smoke } from "./smoke.mjs";

const { results, temporal, timeZones } = smoke({ root, jp, uk, sg, fr, diagnose, provider });
for (const r of results)
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.error ? `: ${r.error}` : ""}`);
// Whether a real Temporal was used is always printed, never silently skipped
console.log(
  `Temporal: ${temporal === "native" ? "checked with the native Temporal" : "skipped (no Temporal in this runtime)"}`,
);
const args =
  globalThis.Deno !== undefined ? globalThis.Deno.args : globalThis.process.argv.slice(2);
const unknownArgs = args.filter((a) => a !== "--require-temporal");
// An unknown argument fails instead of being silently ignored (a misspelt argument would skip Temporal while it
// was meant to be required)
if (unknownArgs.length > 0) console.log(`FAIL unknown argument: ${unknownArgs.join(" ")}`);
const temporalMissing = args.includes("--require-temporal") && temporal !== "native";
if (temporalMissing) console.log("FAIL Temporal is required in this runtime but is absent");
// The record of how time zone names are handled (its content does not decide pass or fail). Without a single
// line it fails instead of silently skipping
for (const line of timeZones) console.log(`TimeZone: ${line}`);
if (timeZones.length === 0) console.log("FAIL no time zone report");
const code =
  results.length > 0 &&
  timeZones.length > 0 &&
  results.every((r) => r.ok) &&
  unknownArgs.length === 0 &&
  !temporalMissing
    ? 0
    : 1;
if (globalThis.Deno !== undefined) globalThis.Deno.exit(code);
else globalThis.process.exit(code);
