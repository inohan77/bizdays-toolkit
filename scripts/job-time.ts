/**
 * In the last step of a full-test job of CI, compares the job's time with the median of the last 3 successful
 * runs of the same job on main (for a split job, the same part) and writes it to the Job Summary. Above 1.5
 * times it prints a notice (not a failure). When the values to compare cannot be obtained, it says that no
 * comparison was possible (item 6 of the section of RELEASING.md on adding a quality mechanism).
 *
 * The current job is the running job of the current run (attempt) whose runner name (RUNNER_NAME) is the same.
 * A temporary failure of the GitHub API (5xx, network failure) is retried once after 10 seconds (the wait is
 * part of this job's time). The exit code is always 0 (an API failure does not fail the job). The job needs the
 * permission actions: read.
 *
 * Usage (CI only): node scripts/job-time.ts
 *   Environment: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, RUNNER_NAME,
 *   GITHUB_STEP_SUMMARY (GITHUB_API_URL is used when set)
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

/** GET of the GitHub API. A temporary failure (5xx, network failure) is retried once after a wait (getWithRetry) */
async function getJson(path: string): Promise<unknown> {
  const api = process.env["GITHUB_API_URL"] ?? "https://api.github.com";
  // A configuration mistake (no GITHUB_TOKEN) is thrown outside the retry
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
        // Only a network failure (no response) is returned as a temporary failure
        return { status: 0, error: errorText(error) };
      }
      if (response.ok) return { status: response.status, body: await response.json() };
      // The body of a failed response is closed without reading (no connection left open)
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
