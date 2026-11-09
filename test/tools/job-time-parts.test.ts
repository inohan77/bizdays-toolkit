// CI のジョブの時間を直近の main の実行と比べる部品（scripts/job-time-parts.ts）: 中央値、1.5 倍の注意、比べられないときの出力
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RETRY_WAIT_MS,
  durationOf,
  getWithRetry,
  judge,
  median,
} from "../../scripts/job-time-parts.ts";

const job = (started: string | null, completed: string | null) => ({
  name: "oracle (0/4)",
  status: "completed",
  conclusion: "success",
  started_at: started,
  completed_at: completed,
  runner_name: "r",
});

test("ジョブの時間: 終わったジョブの秒数。時刻がなければ undefined", () => {
  assert.equal(durationOf(job("2026-11-08T10:00:00Z", "2026-11-08T10:03:30Z")), 210);
  assert.equal(durationOf(job(null, "2026-11-08T10:03:30Z")), undefined);
  assert.equal(durationOf(job("2026-11-08T10:00:00Z", null)), undefined);
});

test("ジョブの時間: 中央値（奇数・偶数・空）", () => {
  assert.equal(median([300, 100, 200]), 200);
  assert.equal(median([100, 200, 300, 400]), 250);
  assert.equal(median([]), undefined);
});

test("ジョブの時間: 直近 3 回の中央値の 1.5 倍を超えたら注意を出し、以内なら出さない", () => {
  const over = judge("oracle (0/4)", 301, [200, 100, 300]);
  assert.equal(over.notice, true);
  assert.ok(over.lines.some((l) => l.startsWith("**注意**")));
  const within = judge("oracle (0/4)", 300, [200, 100, 300]);
  assert.equal(within.notice, false);
  assert.ok(within.lines.some((l) => l.includes("中央値 200 秒、1.50 倍")));
  // 4 回目以降の値は使わない
  assert.equal(judge("x", 301, [200, 200, 200, 10]).notice, true);
});

test("ジョブの時間: 比べる値が 3 回に満たなければ、比べられなかったことを出す（注意は出さない）", () => {
  const r = judge("oracle (0/4)", 999, [100, 100]);
  assert.equal(r.notice, false);
  assert.ok(r.lines.some((l) => l.startsWith("比べられなかった: ") && l.includes("2 回しかない")));
});

test("ジョブの時間: GitHub の API の 5xx と通信の失敗は待って 1 回だけ再試行し、2 回目の結果を使う。4xx（429 を含む）は再試行しない", async () => {
  // 状態の代わりに "network" を渡すと、その回の取得は通信の失敗（status 0）、"throw" なら取得が例外を投げる
  const run = async (statuses: (number | "network" | "throw")[]) => {
    const calls: number[] = [];
    const waits: number[] = [];
    let i = 0;
    const result = await getWithRetry(
      "/x",
      async () => {
        const status = statuses[i++]!;
        calls.push(typeof status === "number" ? status : status === "network" ? 0 : -1);
        if (status === "throw") throw new Error("GITHUB_TOKEN is not set");
        if (status === "network") return { status: 0, error: "fetch failed" };
        return status === 200 ? { status, body: { ok: true } } : { status };
      },
      async (ms) => {
        waits.push(ms);
      },
    ).then(
      (body) => ({ body }),
      (e: unknown) => ({ error: (e as Error).message }),
    );
    return { result, calls, waits };
  };
  // 成功は 1 回で、待たない
  assert.deepEqual(await run([200]), { result: { body: { ok: true } }, calls: [200], waits: [] });
  // 5xx の後に成功すれば、その本文を返す（待つのは 1 回）
  assert.deepEqual(await run([502, 200]), {
    result: { body: { ok: true } },
    calls: [502, 200],
    waits: [RETRY_WAIT_MS],
  });
  // 2 回とも 5xx なら、2 回目の状態で失敗する（3 回目はない）
  assert.deepEqual(await run([502, 503, 200]), {
    result: { error: "GET /x: HTTP 503" },
    calls: [502, 503],
    waits: [RETRY_WAIT_MS],
  });
  // 4xx は再試行しない（429 も、10 秒待っても直らないので同じ）
  assert.deepEqual(await run([404, 200]), {
    result: { error: "GET /x: HTTP 404" },
    calls: [404],
    waits: [],
  });
  assert.deepEqual(await run([429, 200]), {
    result: { error: "GET /x: HTTP 429" },
    calls: [429],
    waits: [],
  });
  // 通信の失敗の後に成功すれば、その本文を返す
  assert.deepEqual(await run(["network", 200]), {
    result: { body: { ok: true } },
    calls: [0, 200],
    waits: [RETRY_WAIT_MS],
  });
  // 2 回とも通信の失敗なら、2 回目の理由で失敗する
  assert.deepEqual(await run(["network", "network"]), {
    result: { error: "GET /x: fetch failed" },
    calls: [0, 0],
    waits: [RETRY_WAIT_MS],
  });
  // 取得が投げた例外（設定の誤りなど）は、一時的な失敗ではないので再試行しない
  assert.deepEqual(await run(["throw", 200]), {
    result: { error: "GITHUB_TOKEN is not set" },
    calls: [-1],
    waits: [],
  });
});
