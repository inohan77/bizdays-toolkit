/**
 * 実行環境のタイムゾーン（環境変数 TZ）を変えて、瞬間・時刻を渡すテストを実行する（pnpm check から実行）。
 *
 * このライブラリは「サーバーがどのタイムゾーンで動いていても結果が変わらない」ことを約束している。
 * 実行環境のタイムゾーンに依存する API は scripts/check-package.ts（checkPortableSource）が静的に禁止する。
 * ここでは、禁止の網から漏れた依存が日付のずれとして現れる、UTC より遅いゾーンと進んだゾーンを 1 つずつ試す
 * （UTC は既定の実行と同じ。Asia/Tokyo は Chatham と同じ進んだ側なので試さない。RELEASING.md の「品質の仕組みの理由」の「確かめる実行環境」）。
 *
 * 再実行するのは、src の Date・Intl に触れる経路（core/date.ts の日数の変換・core/input.ts の瞬間の変換・today）を
 * 通るテストだけ（TZ_FILES）。暦日の文字列だけを渡すテストは、ゾーンを変えても同じ経路を通る。瞬間・時刻を書いたテスト
 * （INSTANT_PATTERN に当たるファイル）は TZ_FILES か、理由を書いた TZ_EXCLUDED のどちらかに載っていなければ失敗にする
 * （黙って外れる検査を作らない。RELEASING.md の「品質の仕組みの理由」の「規則を 1 か所に書く」）
 */

import "./strict-warnings.ts";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const ZONES = [
  "America/Los_Angeles", // 夏時間あり・UTC より遅い
  "Pacific/Chatham", // UTC+12:45（夏時間で +13:45）。日付の境目がずれる端の例
];

/** 瞬間・時刻を書いたテストの印（Date・Temporal・時刻付きの文字列・瞬間を受ける API） */
const INSTANT_PATTERN =
  /new Date\(|Date\.UTC|Date\.now|toInstant|civilOf|instantOf|Temporal|T\d{2}:\d{2}|today\(/;

/** 再実行するテスト。date.test.ts は印に当たらないが、すべての日数の計算が通る core/date.ts を確かめるので入れる */
export const TZ_FILES: readonly string[] = [
  "test/argument-errors.test.ts",
  "test/calendar-closing.test.ts",
  "test/calendar.test.ts",
  "test/date.test.ts",
  "test/day-before-holiday.test.ts",
  "test/days-between.test.ts",
  "test/fr-rules.test.ts",
  "test/input.test.ts",
  "test/instant.test.ts",
  "test/month.test.ts",
  "test/robustness.test.ts",
  "test/schedule.test.ts",
  "test/sg-rules.test.ts",
  "test/uk-rules.test.ts",
];

/** 印に当たるが再実行しないテストと、その理由 */
export const TZ_EXCLUDED: Readonly<Record<string, string>> = {
  "test/time-zone-identity.test.ts":
    "Temporal は、タイムゾーンの名前の比較を差し替えるための代わりの実装を書くだけで、瞬間を暦日に変換しない（結果は TZ に依存しない）",
  "test/unconfirmed-holidays.test.ts":
    "テストの側で Date から暦日の文字列を作るだけで、ライブラリには暦日を渡す",
  "test/null-and-holes.test.ts":
    "Temporal の形の時刻は、分の値の誤りの code を確かめるだけで、暦日・瞬間の変換の結果を見ない",
  "test/diagnose.test.ts": "new Date(0) はスケジュールの値として渡すだけ（日付の入力ではない）",
  "test/diagnose-unjudgeable.test.ts":
    "テストの側で UTC の日数から暦日を作るだけで、ライブラリには暦日を渡す",
  "test/diagnose-oracle.test.ts":
    "テストの側で UTC の日数から日付を作るだけで、ライブラリには暦日を渡す",
  "test/sg-datagovsg.test.ts": "テストの側で UTC の曜日を求めるだけで、ライブラリには暦日を渡す",
  "test/diagnose-as-of.test.ts":
    "Date と日時の文字列は、asOf の形の誤り（invalid-date）として渡すだけで、瞬間の変換を通らない",
};

const problems: string[] = [];
const testFiles = readdirSync("test")
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => `test/${f}`);
for (const file of testFiles) {
  const hit = INSTANT_PATTERN.test(readFileSync(file, "utf8"));
  if (hit && !TZ_FILES.includes(file) && !(file in TZ_EXCLUDED))
    problems.push(`${file}: 瞬間・時刻を書いているが TZ_FILES にも TZ_EXCLUDED にもない`);
  if (!hit && file in TZ_EXCLUDED)
    problems.push(`${file}: TZ_EXCLUDED にあるが印に当たらない（古い記載）`);
}
for (const file of [...TZ_FILES, ...Object.keys(TZ_EXCLUDED)])
  if (!existsSync(file)) problems.push(`${file}: ない`);
if (problems.length > 0) {
  console.error(`FAIL tz の再実行の一覧（scripts/test-tz.ts）:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

let failed = 0;
for (const tz of ZONES) {
  // 結果の表示形式は Node.js のバージョンで既定が違う（22 は TAP、24 は spec）ため、読み取れるよう TAP に固定する
  const result = spawnSync(
    process.execPath,
    ["--import", "./scripts/strict-warnings.ts", "--test", "--test-reporter=tap", ...TZ_FILES],
    { env: { ...process.env, TZ: tz }, encoding: "utf8" },
  );
  const summary = /# pass (\d+)[\s\S]*?# fail (\d+)/.exec(result.stdout ?? "");
  const ok = result.status === 0;
  console.log(
    `${ok ? "OK  " : "FAIL"} TZ=${tz.padEnd(20)} ${summary ? `pass ${summary[1]} / fail ${summary[2]}` : ""}（${TZ_FILES.length} ファイル）`,
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
