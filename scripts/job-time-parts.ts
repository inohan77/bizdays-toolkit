/**
 * Parts for comparing the time of the full-test jobs of CI with the last 3 successful runs of the same job on
 * main (scripts/job-time.ts). The script calls the GitHub API and is not run by pnpm check, so the comparison
 * and the printed lines are here and checked by test/tools/job-time-parts.test.ts. The rule is item 6 of the
 * section of RELEASING.md on adding a quality mechanism.
 */

/** The ratio for a notice (how many times the recent median must be exceeded) */
export const NOTICE_RATIO = 1.5;
/** The number of recent runs compared */
export const RECENT_RUNS = 3;

/** A job of the GitHub API (only the properties used) */
export interface JobRecord {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly runner_name: string | null;
}

/** The time of a finished job in seconds; undefined without a start or end time */
export function durationOf(job: JobRecord): number | undefined {
  if (job.started_at === null || job.completed_at === null) return undefined;
  const ms = Date.parse(job.completed_at) - Date.parse(job.started_at);
  return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : undefined;
}

/** The median (undefined for an empty array) */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const seconds = (s: number): string => `${Math.round(s)} 秒`;

/**
 * Builds the lines for the Job Summary from the time of the current job and the times of the same job in recent
 * runs (newest first). With fewer values than RECENT_RUNS, it says that no comparison was possible (never
 * silently nothing)
 */
export function judge(
  name: string,
  current: number,
  recent: readonly number[],
): { lines: string[]; notice: boolean } {
  const used = recent.slice(0, RECENT_RUNS);
  const head = `### ジョブの時間: ${name}`;
  if (used.length < RECENT_RUNS)
    return {
      lines: [
        head,
        "",
        `比べられなかった: 直近の main の成功した実行の同じジョブが ${used.length} 回しかない（${RECENT_RUNS} 回で比べる）。今回 ${seconds(current)}`,
        "",
      ],
      notice: false,
    };
  const mid = median(used)!;
  const ratio = current / mid;
  const notice = ratio > NOTICE_RATIO;
  return {
    lines: [
      head,
      "",
      `今回 ${seconds(current)}、直近 ${RECENT_RUNS} 回（${used.map(seconds).join("・")}）の中央値 ${seconds(mid)}、${ratio.toFixed(2)} 倍`,
      "",
      notice
        ? `**注意**: 中央値の ${NOTICE_RATIO} 倍を超えた。このジョブ（分けたジョブはこの分）だけを、手元で前のバージョンと交互に 3 回ずつ測って原因を確かめる（RELEASING.md の「品質の仕組みを足すとき」の 6）`
        : `中央値の ${NOTICE_RATIO} 倍以内`,
      "",
    ],
    notice,
  };
}

/** The wait before a retry after a temporary failure of the GitHub API (5xx, network failure), in milliseconds */
export const RETRY_WAIT_MS = 10_000;

/**
 * The result of one fetch: the HTTP status and, on success, the body (JSON). A network failure (no response) is
 * status 0 with the reason in `error`
 */
export interface FetchResult {
  readonly status: number;
  readonly body?: unknown;
  readonly error?: string;
}

/**
 * Fetches and, on a temporary failure (5xx, or status 0 for a network failure), waits RETRY_WAIT_MS and retries
 * once. A second failure, or a 4xx (including 429, which waiting does not fix), throws (the caller turns it into
 * the "could not compare" lines). An error thrown by fetchOnce (a configuration mistake, a body that is not
 * JSON, ...) is not a temporary failure and is rethrown without a retry.
 * The fetch and the wait are parameters (test/tools/job-time-parts.test.ts checks without real network access)
 */
export async function getWithRetry(
  label: string,
  fetchOnce: () => Promise<FetchResult>,
  wait: (ms: number) => Promise<void>,
): Promise<unknown> {
  const transient = (r: FetchResult): boolean =>
    r.status === 0 || (r.status >= 500 && r.status <= 599);
  let result = await fetchOnce();
  if (transient(result)) {
    await wait(RETRY_WAIT_MS);
    result = await fetchOnce();
  }
  if (result.status === 0) throw new Error(`GET ${label}: ${result.error ?? "network error"}`);
  if (result.status < 200 || result.status > 299) {
    throw new Error(`GET ${label}: HTTP ${result.status}`);
  }
  return result.body;
}

/** The lines for a failed fetch (not a failure; says that no comparison was possible) */
export function failedLines(reason: string): string[] {
  return ["### ジョブの時間", "", `比べられなかった: ${reason}`, ""];
}
