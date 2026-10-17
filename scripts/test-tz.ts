/**
 * 実行環境のタイムゾーン（環境変数 TZ）を変えて、テストをすべて実行する（pnpm check から実行）。
 *
 * このライブラリは「サーバーがどのタイムゾーンで動いていても結果が変わらない」ことを約束している。
 * 実行環境のタイムゾーンに依存する処理（Date#getHours など）が紛れ込むと、どれかの TZ で失敗する。
 */

import "./strict-warnings.ts";
import { spawnSync } from "node:child_process";

const ZONES = [
  "UTC",
  "Asia/Tokyo",
  "America/Los_Angeles", // 夏時間あり・UTC より遅い
  "Pacific/Chatham", // UTC+12:45（夏時間で +13:45）。日付の境目がずれる端の例
];

let failed = 0;
for (const tz of ZONES) {
  // 結果の表示形式は Node.js の版で既定が違う（22 は TAP、24 は spec）ため、読み取れるよう TAP に固定する
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/strict-warnings.ts",
      "--test",
      "--test-reporter=tap",
      "test/**/*.test.ts",
    ],
    {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    },
  );
  const summary = /# pass (\d+)[\s\S]*?# fail (\d+)/.exec(result.stdout ?? "");
  const ok = result.status === 0;
  console.log(
    `${ok ? "OK  " : "FAIL"} TZ=${tz.padEnd(20)} ${summary ? `pass ${summary[1]} / fail ${summary[2]}` : ""}`,
  );
  if (!ok) {
    failed++;
    console.error(
      result.stdout
        ?.split("\n")
        .filter((l) => /not ok|Error|expected|actual/.test(l))
        .join("\n"),
    );
  }
}
process.exit(failed > 0 ? 1 : 0);
