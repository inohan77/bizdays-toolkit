// result-compare（scripts/result-compare.ts）が使う test/support/result-cases.ts の部品: 意図した差分を許す単位にする設定の特徴（traitsOfCase）と、
// スケジュールの基準のカレンダーの作り方（withCalendars・basisClosedWeekdays。前の版と今回の版を同じ作り方で比べるので、result-compare では
// 壊れても差分にならず、基準の定休日の特徴は生成範囲の記録（v0.30.3）にないので、生成範囲の検査でも見張れない。そのため、ここで直接確かめる）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, isBizdaysError } from "../src/index.ts";
import { sg } from "../src/sg/index.ts";
import { CALENDAR_REF } from "./support/catalog.ts";
import {
  basisClosedWeekdays,
  basisOutOfRangePolicy,
  fixedCases,
  generateCases,
  traitsOfCase,
  withCalendars,
  type Case,
} from "./support/result-cases.ts";

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

test("withCalendars: 基準のカレンダーは、スケジュールの outOfRangePolicy を受け継ぐ（新しい名前と旧名の両方）", () => {
  // 今の src を版の部品として渡す（result-compare は前の版と今回の版の dist を渡す）
  const lib = {
    createCalendar: (options: Record<string, unknown>) => createCalendar(options),
    providers: new Map<string, unknown>([["sg", sg]]),
  };
  /** 基準のカレンダーで、シンガポールの対応年（2020〜2027 年）の外の日を問う（投げたらエラーコード） */
  const outside = (c: Case, naming: "new" | "old"): string => {
    const key = naming === "old" ? "recurring" : "recurringRules";
    const options = naming === "old" ? { [key]: c.options["recurringRules"] } : c.options;
    const made = withCalendars(lib, c, naming, options);
    const basis = (made[key] as { calendar: { isBusinessDay(d: string): boolean } }[])[0]!.calendar;
    try {
      return String(basis.isBusinessDay("2018-03-01"));
    } catch (e) {
      if (!isBizdaysError(e)) throw e;
      return `error ${e.code}`;
    }
  };
  for (const naming of ["new", "old"] as const) {
    assert.equal(
      outside(schedule(["sg"], { outOfRangePolicy: "ignore" }), naming),
      "true",
      `${naming}: "ignore" の基準は対応年の外で投げない`,
    );
    assert.equal(
      outside(schedule(["sg"]), naming),
      "error out-of-range",
      `${naming}: outOfRangePolicy がなければ、基準は対応年の外で投げる`,
    );
  }
});

/** 基準のカレンダーの定休日を問う（今の src を版の部品として渡す） */
const basisOf = (c: Case, naming: "new" | "old"): { isBusinessDay(d: string): boolean } => {
  const lib = {
    createCalendar: (options: Record<string, unknown>) => createCalendar(options),
    providers: new Map<string, unknown>([["sg", sg]]),
  };
  const key = naming === "old" ? "recurring" : "recurringRules";
  const options = naming === "old" ? { [key]: c.options["recurringRules"] } : c.options;
  const made = withCalendars(lib, c, naming, options);
  return (made[key] as { calendar: { isBusinessDay(d: string): boolean } }[])[0]!.calendar;
};
/** basisClosedWeekdays が want を返す id の設定（見つからなければ undefined。選び方が壊れて、その形を返さなくなったとき） */
const caseWithBasis = (want: string): Case | undefined => {
  for (let i = 0; i < 200; i++) {
    const c = { ...schedule(["sg"]), id: `basis-${i}` };
    const w = basisClosedWeekdays(c);
    if ((w === undefined ? "none" : JSON.stringify(w)) === want) return c;
  }
  return undefined;
};

test("withCalendars: 基準のカレンダーは basisClosedWeekdays の定休日を持つ（新しい名前と旧名の両方）", () => {
  const weekend = caseWithBasis("[0,6]");
  const none = caseWithBasis("none");
  assert.ok(weekend !== undefined, "basisClosedWeekdays が土日を返す設定がない");
  assert.ok(none !== undefined, "basisClosedWeekdays が定休日を書かない設定がない");
  for (const naming of ["new", "old"] as const) {
    // 2026-01-03 は土曜（シンガポールの祝日ではない）
    assert.equal(
      basisOf(weekend, naming).isBusinessDay("2026-01-03"),
      false,
      `${naming}: 土日休みの基準で、土曜が営業日になった（定休日を渡していない）`,
    );
    assert.equal(
      basisOf(none, naming).isBusinessDay("2026-01-03"),
      true,
      `${naming}: 定休日を書かない基準で、土曜が営業日でない`,
    );
  }
});

test("basisClosedWeekdays: CI の種の基準を持つスケジュールで、書かない・土日・そのほかの部分集合がそれぞれ 1 件以上出る", () => {
  const withBasis = [...fixedCases(), ...generateCases(20261030, 1, true)].filter(
    (c) =>
      c.kind === "schedule" &&
      ((c.options["recurringRules"] ?? []) as Record<string, unknown>[]).some(
        (r) => r["calendar"] === CALENDAR_REF,
      ),
  );
  const shapes = new Map<string, number>();
  for (const c of withBasis) {
    const w = basisClosedWeekdays(c);
    const shape = w === undefined ? "none" : JSON.stringify(w) === "[0,6]" ? "weekend" : "other";
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  }
  assert.ok(withBasis.length > 0, "基準を持つスケジュールがない（空振り）");
  for (const shape of ["none", "weekend", "other"])
    assert.ok(
      (shapes.get(shape) ?? 0) > 0,
      `基準の定休日の形「${shape}」が 1 件も出ない: ${JSON.stringify([...shapes])}`,
    );
});
