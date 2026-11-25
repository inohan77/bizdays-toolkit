// The extraction of features (test/support/features.ts): the diagnostics' scan range (the base range of
// scanWindow of src/core/diagnose.ts)
import assert from "node:assert/strict";
import { test } from "node:test";
import { DIAGNOSTIC_YEARS } from "../../src/core/diagnose.ts";
import { diagnoseRangeOf } from "../support/features.ts";

/** The whole diagnostic range (the years are defined in one place, in src/core/diagnose.ts) */
const WHOLE = { from: `${DIAGNOSTIC_YEARS.from}-01-01`, to: `${DIAGNOSTIC_YEARS.to}-12-31` };

const provider = (from: number, to: number) => ({ id: "T", supportedYears: { from, to } });

test("diagnoseRangeOf: 提供元なしは 2001 年から 28 年、周期のある規則があれば最小公倍数（診断の範囲に収まらなければ、診断の範囲の全体）", () => {
  assert.deepEqual(diagnoseRangeOf({}), { from: "2001-01-01", to: "2028-12-31" });
  const withCycle = diagnoseRangeOf({
    closedRecurringRules: [{ weekday: 5, interval: 2, anchor: "2026-01-02" }],
  });
  assert.deepEqual(withCycle, { from: "2001-01-01", to: "2056-12-31" });
  assert.deepEqual(
    diagnoseRangeOf({
      closedRecurringRules: [{ cycle: 324, anchor: "2012-06-16", positions: [25] }],
    }),
    WHOLE,
  );
});

test("diagnoseRangeOf: 提供元の対応年のうち、診断の範囲に入る年。入る年がなければ undefined", () => {
  assert.deepEqual(diagnoseRangeOf({ holidayProvider: provider(1974, 2050) }), {
    from: "1974-01-01",
    to: "2050-12-31",
  });
  assert.deepEqual(diagnoseRangeOf({ holidayProvider: provider(1800, 2200) }), WHOLE);
  assert.deepEqual(diagnoseRangeOf({ holidayProvider: provider(2090, 2400) }), {
    from: "2090-01-01",
    to: WHOLE.to,
  });
  assert.equal(diagnoseRangeOf({ holidayProvider: provider(1500, 1800) }), undefined);
  assert.equal(diagnoseRangeOf({ holidayProvider: provider(2100, 2400) }), undefined);
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
