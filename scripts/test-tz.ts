/**
 * Runs the tests that pass instants and times with a different runtime time zone (the environment variable TZ)
 * (run by pnpm check).
 *
 * The library promises that results do not change whatever time zone the server runs in.
 * APIs that depend on the runtime's time zone are forbidden statically by scripts/check-package.ts
 * (checkPortableSource). Here one zone behind UTC and one ahead of it are tried, in which a dependency that
 * slipped through shows as a shifted date (UTC equals the default run; Asia/Tokyo is on the same side as Chatham
 * and is not tried. RELEASING.md, reasons for the quality mechanisms, "runtimes that are checked").
 *
 * Only the tests that go through the paths of src touching Date and Intl are run again (TZ_FILES): the day
 * number conversion of core/date.ts, the instant conversion of core/input.ts, and today. Tests that pass only
 * date strings take the same path in any zone. A test that writes instants or times (a file matching
 * INSTANT_PATTERN) must be in TZ_FILES or in TZ_EXCLUDED with a reason, or the script fails (no check silently
 * drops out. RELEASING.md, reasons for the quality mechanisms, "write a rule in one place")
 */

import "./strict-warnings.ts";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const ZONES = [
  "America/Los_Angeles", // daylight saving time; behind UTC
  "Pacific/Chatham", // UTC+12:45 (+13:45 in daylight saving time): an extreme case of a shifted date boundary
];

/** Marks of a test that writes instants or times (Date, Temporal, strings with a time, APIs taking an instant) */
const INSTANT_PATTERN =
  /new Date\(|Date\.UTC|Date\.now|toInstant|civilOf|instantOf|Temporal|T\d{2}:\d{2}|today\(/;

/**
 * The tests run again. date.test.ts does not match the marks but is included because it checks core/date.ts,
 * through which every day-number calculation goes
 */
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

/** Tests that match the marks but are not run again, with the reason */
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
  // The default reporter differs by Node.js version (TAP in 22, spec in 24), so TAP is fixed to be readable
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
