// result-compare（scripts/result-compare.ts）が意図した差分を許す単位にする、設定の特徴（test/support/result-cases.ts の traitsOfCase）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALENDAR_REF } from "./support/catalog.ts";
import { basisOutOfRangePolicy, traitsOfCase, type Case } from "./support/result-cases.ts";

const schedule = (providers: Case["providers"], extra: object = {}): Case => ({
  id: "t",
  kind: "schedule",
  providers,
  options: {
    weekdayValues: ["closed", "A", "A", "A", "A", "A", "closed"],
    recurringRules: [{ businessDayOfMonth: 1, calendar: CALENDAR_REF, value: "B" }],
    ...extra,
  },
  from: "2026-01-01",
  to: "2026-12-31",
});
const NARROW = "schedule-counting-basis-narrower-than-scan";

test("schedule-counting-basis-narrower-than-scan: 対応年が走査の範囲を覆わない基準のカレンダーが投げる設定にだけ付く", () => {
  assert.ok(traitsOfCase(schedule(["sg"])).includes(NARROW));
  assert.ok(traitsOfCase(schedule(["sg"], { outOfRangePolicy: "throw" })).includes(NARROW));
  // 基準のカレンダーはスケジュールの outOfRangePolicy を受け継ぐ。"ignore" の基準は投げないので付けない
  assert.equal(basisOutOfRangePolicy(schedule(["sg"], { outOfRangePolicy: "ignore" })), "ignore");
  assert.ok(!traitsOfCase(schedule(["sg"], { outOfRangePolicy: "ignore" })).includes(NARROW));
  // 対応年が走査の範囲を覆う提供元・基準のカレンダーのない設定には付けない
  assert.ok(!traitsOfCase(schedule(["jp"])).includes(NARROW));
  assert.ok(
    !traitsOfCase({ ...schedule(["sg"]), options: { weekdayValues: [] } }).includes(NARROW),
  );
});
