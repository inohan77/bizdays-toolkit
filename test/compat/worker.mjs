// Cloudflare Workers（workerd）で dist を確かめる Worker（scripts/test-workerd.ts が起動する）。確認の中身は smoke.mjs
import * as root from "../../dist/index.js";
import * as diagnose from "../../dist/diagnose/index.js";
import * as jp from "../../dist/jp/index.js";
import * as uk from "../../dist/uk/index.js";
import { smoke } from "./smoke.mjs";

export default {
  fetch() {
    return Response.json(smoke({ root, jp, uk, diagnose }));
  },
};
