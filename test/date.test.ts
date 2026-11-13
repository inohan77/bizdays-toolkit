import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { addDays, diffDays, isValidDate, weekdayOf } from "../src/index.ts";
// 第 n 曜日と解析は公開しない内部の関数なので、モジュールから直接読み込んで確かめる
import { nthWeekdayOfMonth, parseDate } from "../src/core/date.ts";

test("日付の加減算と差", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(diffDays("2026-01-01", "2027-01-01"), 365);
  assert.equal(diffDays("2027-01-01", "2026-01-01"), -365);
});

test("曜日と第 n 曜日", () => {
  assert.equal(weekdayOf("2026-10-11"), 0);
  assert.equal(weekdayOf("1970-01-01"), 4);
  assert.equal(weekdayOf("1955-01-01"), 6);
  assert.equal(nthWeekdayOfMonth(2026, 1, 1, 2), "2026-01-12");
});

test("不正な日付", () => {
  assert.equal(isValidDate("2026-02-29"), false);
  assert.equal(isValidDate("2024-02-29"), true);
  assert.equal(isValidDate("2026-1-1"), false);
  assert.equal(isValidDate(20260101), false);
  assert.throws(() => addDays("2026-13-01", 1), RangeError);
  assert.throws(() => addDays("2026-01-01", 1.5), RangeError);
});

test("parseDate: 直前の 1 件を覚えても、結果は文字列だけで決まる", () => {
  const leapDay = { year: 2024, month: 2, day: 29 };
  assert.deepEqual(parseDate("2024-02-29"), leapDay);
  assert.deepEqual(parseDate("2024-02-29"), leapDay);
  // 別の文字列・失敗した解析をはさんでも、前の結果が混ざらない
  assert.deepEqual(parseDate("2026-11-13"), { year: 2026, month: 11, day: 13 });
  assert.throws(() => parseDate("2026-02-30"), { code: "invalid-date" });
  assert.throws(() => parseDate("2026-02-30"), { code: "invalid-date" });
  assert.deepEqual(parseDate("2026-11-13"), { year: 2026, month: 11, day: 13 });
  assert.deepEqual(parseDate("2024-02-29"), leapDay);
  assert.deepEqual(parseDate("2000-01-01"), { year: 2000, month: 1, day: 1 });
  assert.deepEqual(parseDate("2024-02-29"), leapDay);
  // 返すオブジェクトは覚えたものと同じなので、書き換えられない
  assert.ok(Object.isFrozen(parseDate("2024-02-29")));
  assert.ok(Object.isFrozen(parseDate("2024-02-29")));
});

test("parseDate: プロセスで最初の呼び出しが文字列でない値でも invalid-date（覚える 1 件の初めの状態と一致しない）", () => {
  // 同じプロセスのほかのテストが先に解析すると確かめられないので、新しいプロセスで最初に呼ぶ
  const script = [
    `import { addDays, isBizdaysError } from ${JSON.stringify(new URL("../src/index.ts", import.meta.url).href)};`,
    "for (const value of [undefined, null, 20000101]) {",
    "  try {",
    "    addDays(value, 1);",
    '    console.log("no error");',
    "  } catch (e) {",
    "    console.log(isBizdaysError(e) ? e.code : String(e));",
    "  }",
    "}",
  ].join("\n");
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
  });
  assert.deepEqual(out.trim().split(/\r?\n/), ["invalid-date", "invalid-date", "invalid-date"]);
});
