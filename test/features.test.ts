// 特徴の取り出し（test/support/features.ts）の、診断の走査の範囲（src/core/diagnose.ts の scanWindow の基準の範囲）
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseRangeOf } from "./support/features.ts";

const provider = (from: number, to: number) => ({ id: "T", supportedYears: { from, to } });

test("diagnoseRangeOf: 提供元なしは 2001 年から 28 年、周期のある規則があれば最小公倍数（上限 200 年）", () => {
  assert.deepEqual(diagnoseRangeOf({}), { from: "2001-01-01", to: "2028-12-31" });
  const withCycle = diagnoseRangeOf({
    closedRecurringRules: [{ cycle: 5, anchor: "2026-01-01", positions: [1] }],
  });
  assert.equal(withCycle?.from, "2001-01-01");
  assert.ok(withCycle!.to > "2028-12-31");
});

test("diagnoseRangeOf: 提供元の対応年。200 年を超えれば 1900〜2099 年に絞り、重ならなければ先頭の 200 年", () => {
  assert.deepEqual(diagnoseRangeOf({ holidayProvider: provider(1955, 2099) }), {
    from: "1955-01-01",
    to: "2099-12-31",
  });
  assert.deepEqual(diagnoseRangeOf({ holidayProvider: provider(1800, 2200) }), {
    from: "1900-01-01",
    to: "2099-12-31",
  });
  assert.deepEqual(diagnoseRangeOf({ holidayProvider: provider(2100, 2400) }), {
    from: "2100-01-01",
    to: "2299-12-31",
  });
  assert.deepEqual(diagnoseRangeOf({ holidayProvider: provider(1500, 1800) }), {
    from: "1500-01-01",
    to: "1699-12-31",
  });
});

test("diagnoseRangeOf: 複数の提供元は、outOfRangePolicy が ignore なら和、ほかは共通部分", () => {
  const two = [provider(2000, 2050), provider(2020, 2099)];
  assert.deepEqual(diagnoseRangeOf({ holidayProvider: two }), {
    from: "2020-01-01",
    to: "2050-12-31",
  });
  assert.deepEqual(diagnoseRangeOf({ holidayProvider: two, outOfRangePolicy: "ignore" }), {
    from: "2000-01-01",
    to: "2099-12-31",
  });
});
