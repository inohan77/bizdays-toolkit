// The parts of test/support/result-cases.ts used by result-compare (scripts/result-compare.ts): the features of
// options that are the unit for allowing intended differences (traitsOfCase), and how the basis calendar of a
// schedule is built (withCalendars, basisClosedWeekdays). The previous and the current version are compared
// built the same way, so a break would be no difference in result-compare; and the features of the basis's
// closed weekdays are not in the record of the generated range (0.30.3), so that check cannot watch them either.
// Therefore they are checked here directly.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, isBizdaysError } from "../../src/index.ts";
import { sg } from "../../src/sg/index.ts";
import { CALENDAR_REF } from "../support/catalog.ts";
import {
  basisClosedWeekdays,
  basisOutOfRangePolicy,
  fixedCases,
  generateCases,
  traitsOfCase,
  withCalendars,
  type Case,
} from "../support/result-cases.ts";

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
  // The basis calendar inherits the schedule's outOfRangePolicy. An "ignore" basis does not throw, so the trait
  // is not assigned
  assert.equal(basisOutOfRangePolicy(schedule(["sg"], { outOfRangePolicy: "ignore" })), "ignore");
  assert.ok(!traitsOfCase(schedule(["sg"], { outOfRangePolicy: "ignore" })).includes(NARROW));
  // Not assigned to a provider whose supported years cover the scan range, or to options without a basis calendar
  assert.ok(!traitsOfCase(schedule(["jp"])).includes(NARROW));
  assert.ok(
    !traitsOfCase({ ...schedule(["sg"]), options: { weekdayValues: [] } }).includes(NARROW),
  );
});

test("withCalendars: 基準のカレンダーは、スケジュールの outOfRangePolicy を受け継ぐ（新しい名前と旧名の両方）", () => {
  // The current src is passed as the parts of a version (result-compare passes the dist of the previous and of
  // the current version)
  const lib = {
    createCalendar: (options: Record<string, unknown>) => createCalendar(options),
    providers: new Map<string, unknown>([["sg", sg]]),
  };
  /** Asks the basis calendar about a day outside Singapore's supported years (2020-2027) (the error code when it throws) */
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

/** Asks about the closed weekdays of the basis calendar (the current src is passed as the parts of a version) */
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
/**
 * The options with an id for which basisClosedWeekdays returns `want` (undefined when none is found: the choice
 * broke and no longer returns that form)
 */
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
    // 2026-01-03 is a Saturday (not a holiday in Singapore)
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

test("0.32.8 の特徴: 数える規則と長い・範囲の外の日付、unconfirmed の throw、定休日と同じ扱いの曜日の規則にだけ付く", () => {
  const calendar = (options: Record<string, unknown>): Case => ({
    id: "t",
    kind: "calendar",
    providers: [],
    options,
    from: "2026-01-01",
    to: "2026-12-31",
  });
  const counting = { closedRecurringRules: [{ businessDayOfMonth: 1 }] };
  const LONG = "counting-rules-with-long-or-outside-dates";
  // Dates touching an edge month of the scan range (2001-2028) or outside it, and dates longer than 28 days
  for (const d of [
    "2029-01-05",
    "2000-12-31",
    "2001-01-31",
    "2028-12-01",
    { from: "2026-01-01", to: "2026-01-29" },
  ])
    assert.ok(
      traitsOfCase(calendar({ ...counting, closedDates: [d] })).includes(LONG),
      JSON.stringify(d),
    );
  // Not assigned to short dates inside the range, options without a counting rule, or schedules
  for (const d of ["2001-02-01", "2028-11-30", { from: "2026-01-01", to: "2026-01-28" }])
    assert.ok(
      !traitsOfCase(calendar({ ...counting, openDates: [d] })).includes(LONG),
      JSON.stringify(d),
    );
  assert.ok(!traitsOfCase(calendar({ closedDates: ["2029-01-05"] })).includes(LONG));
  assert.ok(
    !traitsOfCase({
      ...schedule([]),
      options: { ...schedule([]).options, dates: [{ date: "2029-01-05", value: "X" }] },
    }).includes(LONG),
  );
  // Only unconfirmedHolidayPolicy: "throw"
  assert.ok(
    traitsOfCase(schedule(["jp"], { unconfirmedHolidayPolicy: "throw" })).includes(
      "unconfirmed-holidays-throw",
    ),
  );
  assert.ok(
    !traitsOfCase(schedule(["jp"], { unconfirmedHolidayPolicy: "accept" })).includes(
      "unconfirmed-holidays-throw",
    ),
  );
  // Only a weekly weekday rule that treats the weekday like the closed weekdays (omitted: weekends)
  const K6 = "counting-rule-with-weekly-rule-as-closed-weekdays";
  assert.ok(
    traitsOfCase(
      calendar({ closedRecurringRules: [{ weekday: 6 }, { businessDayOfMonth: 1 }] }),
    ).includes(K6),
  );
  assert.ok(
    traitsOfCase(
      calendar({ closedWeekdays: [0], openRecurringRules: [{ weekday: 1 }], ...counting }),
    ).includes(K6),
  );
  assert.ok(
    !traitsOfCase(
      calendar({
        closedWeekdays: [0],
        closedRecurringRules: [{ weekday: 1 }, { businessDayOfMonth: 1 }],
      }),
    ).includes(K6),
  );
  assert.ok(
    !traitsOfCase(
      calendar({ closedWeekdays: [0], openRecurringRules: [{ weekday: 0 }], ...counting }),
    ).includes(K6),
  );
  assert.ok(
    !traitsOfCase(
      calendar({ closedRecurringRules: [{ weekday: 6, nth: 1 }, { businessDayOfMonth: 1 }] }),
    ).includes(K6),
  );
  // Of the fixed options, the forms of 0.32.8 have their respective traits
  const fixed = new Map(fixedCases().map((c) => [c.id, traitsOfCase(c)]));
  assert.ok(
    fixed.get("fixed-counting-closed-date-business-day")!.includes("counting-rules-with-dates"),
  );
  for (const id of [
    "fixed-counting-open-dates-2050",
    "fixed-counting-week-closed-date-2029",
    "fixed-counting-month-closed-date-2042",
    "fixed-counting-long-closed-date",
  ])
    assert.ok(fixed.get(id)!.includes(LONG), id);
  for (const id of [
    "fixed-unconfirmed-throw-after-holiday",
    "fixed-unconfirmed-throw-after-holiday-schedule",
  ])
    assert.ok(fixed.get(id)!.includes("unconfirmed-holidays-throw"), id);
  assert.ok(fixed.get("fixed-counting-basis-weekday-as-closed-weekday")!.includes(K6));
});
