import "./strict-warnings.ts";
/**
 * Checks the published dist in browsers (run by the browsers and safari jobs of CI; RELEASING.md, reasons for
 * the quality mechanisms, "runtimes that are checked").
 *
 *   node scripts/test-browsers.ts <chrome|firefox|edge|safari> <path of the driver>
 *
 * Run after pnpm build. A small web server built with the standard features of Node.js serves dist and
 * test/compat; the driver installed on the runner (chromedriver, geckodriver, msedgedriver, safaridriver) is
 * operated over WebDriver (HTTP), and the result of smoke.mjs, loaded in the page as an ES module, is received.
 * No npm dependency is used.
 *
 * The browser side sometimes stalls (Edge on a runner stopped responding while loading the page), so the time
 * limits are short, and only when a stage before the result is received stalls (starting the driver, creating
 * the session, loading the page, waiting for the result) the driver is restarted and the run is retried once.
 * A result of FAIL is not retried (a real failure must not be hidden). A retry logs its reason.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, normalize, resolve } from "node:path";
import { skipWhen } from "../test/support/skip.ts";

const [browser, driver] = process.argv.slice(2);
const capabilities: Record<string, Record<string, unknown>> = {
  chrome: {
    browserName: "chrome",
    "goog:chromeOptions": { args: ["--headless=new", "--no-sandbox"] },
  },
  firefox: { browserName: "firefox", "moz:firefoxOptions": { args: ["-headless"] } },
  edge: {
    browserName: "MicrosoftEdge",
    // Page loads of Edge kept stalling on CI runners (the renderer not responding), so temporary files are used
    // instead of shared memory (/dev/shm) and GPU processing is turned off (the two well-known causes of an
    // unresponsive renderer in CI containers; whether it helped shows in the presence of RETRY in the log)
    "ms:edgeOptions": {
      args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  },
  safari: { browserName: "safari" },
};
if (!browser || !driver || !(browser in capabilities)) {
  throw new Error(
    "usage: node scripts/test-browsers.ts <chrome|firefox|edge|safari> <driver path>",
  );
}

const root = resolve(".");
const page = `<!doctype html>
<meta charset="utf-8">
<title>bizdays-toolkit compat</title>
<script>
  // A failure to load the module is returned as a result too
  window.__fail = (message) => {
    window.__results = { results: [{ name: "load", ok: false, error: String(message) }], temporal: "absent" };
  };
  window.addEventListener("error", (e) => window.__fail(e.message));
</script>
<script type="module" onerror="window.__fail('failed to load the module script')">
  import * as root from "/dist/index.js";
  import * as diagnose from "/dist/diagnose/index.js";
  import * as jp from "/dist/jp/index.js";
  import * as provider from "/dist/provider/index.js";
  import * as sg from "/dist/sg/index.js";
  import * as fr from "/dist/fr/index.js";
  import * as uk from "/dist/uk/index.js";
  import { smoke } from "/test/compat/smoke.mjs";
  window.__results = smoke({ root, jp, uk, sg, fr, diagnose, provider });
</script>
`;

// Only dist and test/compat are served (any other path is 404)
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  if (path === "/compat.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
    return;
  }
  const file = normalize(join(root, path));
  const allowed = [join(root, "dist") + "/", join(root, "test", "compat") + "/"].some((d) =>
    file.startsWith(normalize(d)),
  );
  if (!allowed || !/\.(m?js)$/.test(file)) {
    res.writeHead(404).end();
    return;
  }
  try {
    res
      .writeHead(200, { "content-type": "text/javascript; charset=utf-8" })
      .end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const address = server.address();
const sitePort = typeof address === "object" && address ? address.port : 0;

/** A failure at a stage before the result is received (retried) */
class TransientError extends Error {}

interface Outcome {
  results: { name: string; ok: boolean; error?: string }[];
  temporal: string;
  timeZones?: string[];
}

/** Time limits for loading the page and running the script (WebDriver timeouts), and for each HTTP call */
const PAGE_LOAD_MS = 30_000;
const REQUEST_MS = 60_000;

async function runOnce(): Promise<Outcome> {
  const driverPort = 4444 + Math.floor(Math.random() * 1000);
  // chromedriver and msedgedriver take --port=N; geckodriver and safaridriver take --port N
  const args =
    browser === "firefox" || browser === "safari"
      ? ["--port", String(driverPort)]
      : [`--port=${driverPort}`];
  const child = spawn(driver!, args, { stdio: ["ignore", "ignore", "inherit"] });
  const base = `http://127.0.0.1:${driverPort}`;

  async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_MS),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = (await res.json()) as { value: T };
    if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json.value)}`);
    return json.value;
  }

  let session: string | undefined;
  try {
    let outcome: Outcome | null = null;
    try {
      for (let i = 0; ; i++) {
        try {
          if ((await call<{ ready?: boolean }>("GET", "/status")).ready !== false) break;
        } catch {
          // waiting for the driver to start
        }
        if (i > 50) throw new Error("the driver did not start");
        await new Promise((r) => setTimeout(r, 200));
      }
      const created = await call<{
        sessionId: string;
        capabilities?: { browserVersion?: string };
      }>("POST", "/session", {
        capabilities: {
          alwaysMatch: {
            ...capabilities[browser!],
            timeouts: { pageLoad: PAGE_LOAD_MS, script: PAGE_LOAD_MS },
          },
        },
      });
      session = created.sessionId;
      console.log(`${browser} ${created.capabilities?.browserVersion ?? "(unknown version)"}`);
      await call("POST", `/session/${session}/url`, {
        url: `http://127.0.0.1:${sitePort}/compat.html`,
      });
      for (let i = 0; i < 100 && outcome === null; i++) {
        outcome = await call<Outcome | null>("POST", `/session/${session}/execute/sync`, {
          script: "return window.__results ?? null;",
          args: [],
        });
        if (outcome === null) await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      throw new TransientError(e instanceof Error ? e.message : String(e));
    }
    if (outcome === null) throw new TransientError("no result from the page");
    return outcome;
  } finally {
    if (session) {
      await call("DELETE", `/session/${session}`).catch(() => undefined);
    }
    child.kill();
  }
}

let code = 1;
try {
  let outcome: Outcome;
  try {
    outcome = await runOnce();
  } catch (e) {
    if (!(e instanceof TransientError)) throw e;
    console.log(`RETRY ${browser}: ${e.message}`);
    outcome = await runOnce();
  }
  for (const r of outcome.results) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.error ? `: ${r.error}` : ""}`);
  }
  console.log(
    `Temporal: ${outcome.temporal === "native" ? "checked with the native Temporal" : `skipped (${skipWhen("temporal-unavailable-browser", true)})`}`,
  );
  // The record of how time zone names are handled (its content does not decide pass or fail). Without a single
  // line it fails instead of silently skipping (when the page failed to load, the result has no timeZones)
  const timeZones = outcome.timeZones ?? [];
  for (const line of timeZones) console.log(`TimeZone: ${line}`);
  if (timeZones.length === 0) console.log("FAIL no time zone report");
  code =
    outcome.results.length > 0 && timeZones.length > 0 && outcome.results.every((r) => r.ok)
      ? 0
      : 1;
} finally {
  server.close();
}
process.exitCode = code;
