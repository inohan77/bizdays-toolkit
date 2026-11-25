import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { addDays, diffDays, isValidDate, weekdayOf } from "../src/index.ts";
// The nth weekday and the parsing are internal functions that are not published, so they are loaded directly
// from the module
import { fromDayNumber, nthWeekdayOfMonth, parseDate, toDayNumber } from "../src/core/date.ts";

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
  // With another string or a failed parse in between, the earlier result does not get mixed in
  assert.deepEqual(parseDate("2026-11-13"), { year: 2026, month: 11, day: 13 });
  assert.throws(() => parseDate("2026-02-30"), { code: "invalid-date" });
  assert.throws(() => parseDate("2026-02-30"), { code: "invalid-date" });
  assert.deepEqual(parseDate("2026-11-13"), { year: 2026, month: 11, day: 13 });
  assert.deepEqual(parseDate("2024-02-29"), leapDay);
  assert.deepEqual(parseDate("2000-01-01"), { year: 2000, month: 1, day: 1 });
  assert.deepEqual(parseDate("2024-02-29"), leapDay);
  // The returned object is the remembered one, so it cannot be changed
  assert.ok(Object.isFrozen(parseDate("2024-02-29")));
  assert.ok(Object.isFrozen(parseDate("2024-02-29")));
});

test("parseDate: プロセスで最初の呼び出しが文字列でない値でも invalid-date（覚える 1 件の初めの状態と一致しない）", () => {
  // It cannot be checked once another test of the same process has parsed first, so it is called first in a new
  // process
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

test("日数から作った暦日: 続けて解析すると、その日の年月日になる（解析し直さずに入れる記憶の値。月末・うるう日・年の端を含む）", () => {
  // Building a date from a day number does not parse the string again but puts the built year, month and day
  // into the memo of the last parse (decisions.md #16).
  // With a stale value there, parsing the same string next would give another day
  const days = [
    ...Array.from({ length: 800 }, (_, i) => toDayNumber("1999-12-01") + i),
    toDayNumber("1000-01-01"),
    toDayNumber("9999-12-31"),
    toDayNumber("2024-02-29"),
    toDayNumber("2100-02-28"),
  ];
  for (const n of days) {
    const date = fromDayNumber(n);
    const utc = new Date(n * 86_400_000);
    assert.deepEqual(
      parseDate(date),
      { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() },
      date,
    );
    assert.equal(toDayNumber(date), n, date);
    assert.ok(Object.isFrozen(parseDate(date)), date);
  }
  // Outside the range it is out-of-range before anything is built (the memo does not change; the last parsed
  // day still reads correctly)
  const last = fromDayNumber(toDayNumber("2026-11-18"));
  for (const n of [toDayNumber("1000-01-01") - 1, toDayNumber("9999-12-31") + 1, Number.NaN])
    assert.throws(
      () => fromDayNumber(n),
      (e: unknown) => e instanceof RangeError && (e as { code?: string }).code === "out-of-range",
    );
  assert.deepEqual(parseDate(last), { year: 2026, month: 11, day: 18 });
});
