import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, diffDays, isValidDate, weekdayOf } from "../src/index.ts";
// 第 n 曜日は公開しない内部の関数なので、モジュールから直接読み込んで確かめる
import { nthWeekdayOfMonth } from "../src/core/date.ts";

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
