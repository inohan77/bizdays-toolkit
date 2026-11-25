// The Worker that checks dist in Cloudflare Workers (workerd) (started by scripts/test-workerd.ts). The checks
// themselves are in smoke.mjs
import * as root from "../../dist/index.js";
import * as diagnose from "../../dist/diagnose/index.js";
import * as jp from "../../dist/jp/index.js";
import * as provider from "../../dist/provider/index.js";
import * as sg from "../../dist/sg/index.js";
import * as fr from "../../dist/fr/index.js";
import * as uk from "../../dist/uk/index.js";
import { smoke } from "./smoke.mjs";

export default {
  fetch() {
    return Response.json(smoke({ root, jp, uk, sg, fr, diagnose, provider }));
  },
};
