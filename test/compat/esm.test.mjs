// Checks the published dist with ESM (import). The checks themselves are in smoke.mjs (shared with browsers and
// Cloudflare Workers).
// It loads by self-reference with the package name (`exports` of package.json), the same path as a user.
// Needs pnpm build before running (done by the compat job of CI and by pnpm check)
import { test } from "node:test";
import * as root from "bizdays-toolkit";
import * as diagnose from "bizdays-toolkit/diagnose";
import * as jp from "bizdays-toolkit/jp";
import * as provider from "bizdays-toolkit/provider";
import * as sg from "bizdays-toolkit/sg";
import * as fr from "bizdays-toolkit/fr";
import * as uk from "bizdays-toolkit/uk";
import { smoke } from "./smoke.mjs";

const { results, temporal, timeZones } = smoke({ root, jp, uk, sg, fr, diagnose, provider });
// Whether a real Temporal was used is always printed, never silently skipped
console.log(
  `Temporal: ${temporal === "native" ? "checked with the native Temporal" : "skipped (no Temporal in this runtime)"}`,
);

// The record of how time zone names are handled (its content does not decide pass or fail). Without a single
// line it fails instead of silently skipping
for (const line of timeZones) console.log(`TimeZone: ${line}`);
test("タイムゾーンの名前の扱いを記録した", () => {
  if (timeZones.length === 0) throw new Error("no time zone report");
});

for (const r of results) {
  test(r.name, () => {
    if (!r.ok) throw new Error(r.error);
  });
}
