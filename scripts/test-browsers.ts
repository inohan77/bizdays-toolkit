import "./strict-warnings.ts";
/**
 * 公開する dist をブラウザーで確かめる（CI の browsers・safari ジョブから実行。decisions.md の 35 番）。
 *
 *   node scripts/test-browsers.ts <chrome|firefox|edge|safari> <ドライバーのパス>
 *
 * pnpm build の後に実行する。Node.js の標準機能だけで小さな Web サーバーを立てて dist と test/compat を配り、
 * ランナーに入っているドライバー（chromedriver・geckodriver・msedgedriver・safaridriver）を WebDriver（HTTP）で操作して、
 * ページの中で ES モジュールとして読み込んだ smoke.mjs の結果を受け取る。npm の依存は使わない。
 *
 * ブラウザーの側が一時的に止まることがある（ランナー上の Edge がページの読み込みで応答しなくなった例がある）ため、
 * 時間制限を短くし、結果を受け取る前の段階（ドライバーの起動・セッションの作成・ページの読み込み・結果の待ち）で
 * 止まったときだけ、ドライバーを起動し直して 1 回だけやり直す。確認の結果が FAIL のときはやり直さない
 * （本物の失敗を隠さないため）。やり直したときは、その理由をログに出す。
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, normalize, resolve } from "node:path";

const [browser, driver] = process.argv.slice(2);
const capabilities: Record<string, Record<string, unknown>> = {
  chrome: {
    browserName: "chrome",
    "goog:chromeOptions": { args: ["--headless=new", "--no-sandbox"] },
  },
  firefox: { browserName: "firefox", "moz:firefoxOptions": { args: ["-headless"] } },
  edge: {
    browserName: "MicrosoftEdge",
    // CI のランナーで、Edge のページの読み込みが止まる（レンダラーが応答しない）ことが続いたため、
    // 共有メモリ（/dev/shm）の代わりに一時ファイルを使い、GPU の処理を止める（decisions.md の 35 番）
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
  // モジュールの読み込みに失敗した場合も、結果として返す
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

// dist と test/compat だけを配る（それ以外のパスは 404）
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

/** 結果を受け取る前の段階での失敗（やり直しの対象） */
class TransientError extends Error {}

interface Outcome {
  results: { name: string; ok: boolean; error?: string }[];
  temporal: string;
}

/** ページの読み込み・スクリプトの実行の時間制限（WebDriver の timeouts）と、各 HTTP 呼び出しの時間制限 */
const PAGE_LOAD_MS = 30_000;
const REQUEST_MS = 60_000;

async function runOnce(): Promise<Outcome> {
  const driverPort = 4444 + Math.floor(Math.random() * 1000);
  // chromedriver・msedgedriver は --port=N、geckodriver・safaridriver は --port N
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
          // ドライバーの起動待ち
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
    `Temporal: ${outcome.temporal === "native" ? "checked with the native Temporal" : "skipped (no Temporal in this browser)"}`,
  );
  code = outcome.results.length > 0 && outcome.results.every((r) => r.ok) ? 0 : 1;
} finally {
  server.close();
}
process.exitCode = code;
