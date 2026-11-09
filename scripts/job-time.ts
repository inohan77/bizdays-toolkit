/**
 * CI の全件のジョブの最後の段で、そのジョブの時間を、同じジョブ（分けたジョブは同じ分）の直近 3 回の main の
 * 成功した実行の中央値と比べ、Job Summary に書く。1.5 倍を超えたら注意を出す（失敗にはしない）。比べる値が
 * 取れないときは、比べられなかったことを出す（RELEASING.md の「品質の仕組みを足すとき」の 6）。
 *
 * 今のジョブは、今の実行（試行）のジョブのうち、ランナーの名前（RUNNER_NAME）が同じで動いているものとする。
 * GitHub の API の一時的な失敗（5xx・通信の失敗）は、10 秒待って 1 回だけ再試行する（待ちはこのジョブの時間に含まれる）。終了コードはいつも 0（API の失敗でジョブを落とさない）。ジョブの権限に actions: read が要る。
 *
 * 使い方（CI だけ）: node scripts/job-time.ts
 *   環境変数: GITHUB_TOKEN、GITHUB_REPOSITORY、GITHUB_RUN_ID、GITHUB_RUN_ATTEMPT、RUNNER_NAME、GITHUB_STEP_SUMMARY
 *   （GITHUB_API_URL があればそれを使う）
 */

import "./strict-warnings.ts";
import { appendFileSync } from "node:fs";
import { errorText } from "./tool-selftest-parts.ts";
import {
  RECENT_RUNS,
  durationOf,
  failedLines,
  getWithRetry,
  judge,
  type JobRecord,
} from "./job-time-parts.ts";

const env = (name: string): string => {
  const v = process.env[name];
  if (v === undefined || v === "") throw new Error(`${name} is not set`);
  return v;
};

/** GitHub の API の GET。一時的な失敗（5xx・通信の失敗）なら 1 回だけ待って再試行する（getWithRetry） */
async function getJson(path: string): Promise<unknown> {
  const api = process.env["GITHUB_API_URL"] ?? "https://api.github.com";
  // 設定の誤り（GITHUB_TOKEN がない）は、再試行の外で投げる
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  return getWithRetry(
    path,
    async () => {
      let response: Response;
      try {
        response = await fetch(`${api}${path}`, { headers });
      } catch (error) {
        // 通信の失敗（応答がない）だけを、一時的な失敗として返す
        return { status: 0, error: errorText(error) };
      }
      if (response.ok) return { status: response.status, body: await response.json() };
      // 失敗の応答の本文は読まずに閉じる（接続を残さない）
      await response.body?.cancel();
      return { status: response.status };
    },
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  );
}

const jobsOf = async (path: string): Promise<JobRecord[]> =>
  ((await getJson(`${path}?per_page=100`)) as { jobs: JobRecord[] }).jobs;

async function main(): Promise<string[]> {
  const repo = env("GITHUB_REPOSITORY");
  const runId = env("GITHUB_RUN_ID");
  const runner = env("RUNNER_NAME");
  const now = Date.now();
  const current = (
    await jobsOf(`/repos/${repo}/actions/runs/${runId}/attempts/${env("GITHUB_RUN_ATTEMPT")}/jobs`)
  ).find((j) => j.runner_name === runner && j.status === "in_progress");
  if (current === undefined || current.started_at === null)
    return failedLines(`今のジョブ（ランナー ${runner}）が見つからない`);
  const elapsed = (now - Date.parse(current.started_at)) / 1000;
  const runs = (
    (await getJson(
      `/repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=10`,
    )) as { workflow_runs: { id: number }[] }
  ).workflow_runs.filter((r) => String(r.id) !== runId);
  const recent: number[] = [];
  for (const run of runs) {
    if (recent.length >= RECENT_RUNS) break;
    const job = (await jobsOf(`/repos/${repo}/actions/runs/${run.id}/jobs`)).find(
      (j) => j.name === current.name && j.conclusion === "success",
    );
    const seconds = job === undefined ? undefined : durationOf(job);
    if (seconds !== undefined) recent.push(seconds);
  }
  return judge(current.name, elapsed, recent).lines;
}

let lines: string[];
try {
  lines = await main();
} catch (error) {
  lines = failedLines(`取得に失敗した（${errorText(error)}）`);
}
console.log(lines.join("\n"));
const summary = process.env["GITHUB_STEP_SUMMARY"];
if (summary !== undefined && summary !== "") appendFileSync(summary, `${lines.join("\n")}\n`);
