/**
 * CI の全件のジョブの時間を、同じジョブの直近 3 回の main の成功した実行と比べる部品（scripts/job-time.ts）。
 * スクリプトは GitHub の API を呼ぶので pnpm check で動かさず、比べ方と出す文をここに切り出して
 * test/tools/job-time-parts.test.ts が確かめる。決まりは RELEASING.md の「品質の仕組みを足すとき」の 6。
 */

/** 注意を出す倍率（直近の中央値の何倍を超えたら知らせるか） */
export const NOTICE_RATIO = 1.5;
/** 比べる直近の実行の数 */
export const RECENT_RUNS = 3;

/** GitHub の API のジョブ（使う項目だけ） */
export interface JobRecord {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly runner_name: string | null;
}

/** 終わったジョブの時間（秒）。開始か終了の時刻がなければ undefined */
export function durationOf(job: JobRecord): number | undefined {
  if (job.started_at === null || job.completed_at === null) return undefined;
  const ms = Date.parse(job.completed_at) - Date.parse(job.started_at);
  return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : undefined;
}

/** 中央値（空の配列は undefined） */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const seconds = (s: number): string => `${Math.round(s)} 秒`;

/**
 * 今のジョブの時間と、直近の実行の同じジョブの時間（新しい順）から、Job Summary に出す行を作る。
 * 比べる値が RECENT_RUNS に満たなければ、比べられなかったことを出す（黙って何も出さない形にしない）
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

/** GitHub の API の一時的な失敗（5xx・通信の失敗）のときに、再試行の前に待つ時間（ミリ秒） */
export const RETRY_WAIT_MS = 10_000;

/**
 * 1 回の取得の結果。HTTP の状態と、成功したときの本文（JSON）。通信の失敗（応答がない）は status 0 と、その理由の error
 */
export interface FetchResult {
  readonly status: number;
  readonly body?: unknown;
  readonly error?: string;
}

/**
 * 取得を行い、一時的な失敗（5xx か、通信の失敗の status 0）なら RETRY_WAIT_MS 待って 1 回だけ再試行する。
 * 2 回目も失敗するか、4xx（429 を含む。待っても直らない）なら例外にする（呼び出し側が「比べられなかった」の行にする）。
 * fetchOnce が投げた例外（設定の誤り、本文が JSON でないなど）は、一時的な失敗ではないので再試行せずにそのまま投げる。
 * 取得と待ちは引数で受ける（test/tools/job-time-parts.test.ts が実際の通信なしで確かめる）
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

/** 取得に失敗したときの行（失敗にはしない。比べられなかったことを出す） */
export function failedLines(reason: string): string[] {
  return ["### ジョブの時間", "", `比べられなかった: ${reason}`, ""];
}
