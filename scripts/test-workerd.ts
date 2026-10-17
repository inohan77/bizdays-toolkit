import "./strict-warnings.ts";
/**
 * 公開する dist を Cloudflare Workers の実行環境（workerd）で確かめる（CI の workerd ジョブから実行。decisions.md の 26 番）。
 *
 *   node scripts/test-workerd.ts <workerd のパス>
 *
 * pnpm build の後に実行する。dist と test/compat の Worker をモジュールとして並べた設定をリポジトリ内の一時ディレクトリに書き
 * （workerd の設定は、埋め込むファイルを設定ファイルからの相対パスで指定する必要がある）、
 * workerd を起動して、Worker が返す smoke.mjs の結果を HTTP で受け取る。
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const workerd = process.argv[2];
if (!workerd) throw new Error("usage: node scripts/test-workerd.ts <path to workerd>");

const root = resolve(".");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const modules = [
  "test/compat/worker.mjs",
  "test/compat/smoke.mjs",
  ...walk(join(root, "dist"))
    .filter((p) => p.endsWith(".js"))
    .map((p) => relative(root, p).replaceAll("\\", "/"))
    .sort(),
];

const port = 8787 + Math.floor(Math.random() * 1000);
const dir = mkdtempSync(join(root, ".workerd-"));
const config = join(dir, "config.capnp");
writeFileSync(
  config,
  `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [(name = "main", worker = .worker)],
  sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")],
);
const worker :Workerd.Worker = (
  modules = [
${modules.map((m) => `    (name = "${m}", esModule = embed "${relative(dir, join(root, m)).replaceAll("\\", "/")}"),`).join("\n")}
  ],
  compatibilityDate = "2026-10-01",
);
`,
);

const child = spawn(workerd, ["serve", config, "--verbose"], {
  stdio: ["ignore", "inherit", "inherit"],
});
let exited = false;
child.on("exit", () => {
  exited = true;
});
let code = 1;
try {
  let body: string | undefined;
  for (let i = 0; i < 50 && body === undefined && !exited; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("HTTP ")) throw e;
    }
  }
  if (body === undefined)
    throw new Error(exited ? "workerd exited before responding" : "workerd did not respond");
  const { results, temporal } = JSON.parse(body) as {
    results: { name: string; ok: boolean; error?: string }[];
    temporal: string;
  };
  for (const r of results)
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.error ? `: ${r.error}` : ""}`);
  console.log(
    `Temporal: ${temporal === "native" ? "checked with the native Temporal" : "skipped (no Temporal in this runtime)"}`,
  );
  code = results.every((r) => r.ok) && results.length > 0 ? 0 : 1;
} finally {
  child.kill();
  rmSync(dir, { recursive: true, force: true });
}
process.exitCode = code;
