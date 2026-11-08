// CI のジョブの時間を直近の main の実行と比べる部品（scripts/job-time-parts.ts）: 中央値、1.5 倍の注意、比べられないときの出力
import assert from "node:assert/strict";
import { test } from "node:test";
import { durationOf, judge, median } from "../../scripts/job-time-parts.ts";

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
