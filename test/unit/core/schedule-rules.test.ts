// Unit tests of the functions of src/core/schedule.ts that validate one recurring rule. One describe per
// function, named after the function; each test is one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCalendar } from "../../../src/core/calendar.ts";
import { toDayNumber } from "../../../src/core/date.ts";
import { IssueCollector } from "../../../src/core/errors.ts";
import {
  basisFromPredicate,
  checkBusinessDayRule,
  checkCycleRule,
  checkHolidayBasedRule,
  checkRuleFilters,
  checkRulePattern,
  checkSet,
  checkSkipWeekdays,
  checkWeekdayRule,
  compileRecurringRule,
  emptyRuleDraft,
  isBusinessDayOfMonth,
  isBusinessDayOfWeek,
  isCalendarLike,
  isDayOfMonth,
  isMonth,
  overlapPolicyOf,
  patternCount,
  RECURRING_RULE_KEYS,
  ruleShapeOf,
  type RuleDraft,
} from "../../../src/core/schedule.ts";

const day = toDayNumber;
const issues = (c: IssueCollector): string[] => c.issues.map((i) => `${i.code} ${i.path}`);
/** Runs a check on a fresh draft and returns the draft and the recorded problems */
function run(check: (c: IssueCollector, draft: RuleDraft) => void, start: Partial<RuleDraft> = {}) {
  const c = new IssueCollector();
  const draft = { ...emptyRuleDraft(), ...start };
  check(c, draft);
  return { draft, issues: issues(c) };
}
const calendar = createCalendar({ closedWeekdays: [0, 6] });

describe("isBusinessDayOfWeek", () => {
  test("true for a non-zero integer from -7 to 7", () => {
    for (const v of [1, 7, -1, -7]) assert.equal(isBusinessDayOfWeek(v), true, String(v));
  });
  test("false otherwise", () => {
    for (const v of [0, 8, -8, 1.5, "1", null, undefined])
      assert.equal(isBusinessDayOfWeek(v), false, String(v));
  });
});

describe("isBusinessDayOfMonth", () => {
  test("true for a non-zero integer from -31 to 31", () => {
    for (const v of [1, 31, -1, -31]) assert.equal(isBusinessDayOfMonth(v), true, String(v));
  });
  test("false otherwise", () => {
    for (const v of [0, 32, -32, 1.5, "1", null, undefined])
      assert.equal(isBusinessDayOfMonth(v), false, String(v));
  });
});

describe("basisFromPredicate", () => {
  test("the days of the month for which the predicate is true, ascending and frozen", () => {
    const basis = basisFromPredicate((date) => Number(date.slice(8)) % 10 === 0);
    assert.deepEqual(basis(2026, 11), [10, 20, 30]);
    assert.deepEqual(basis(2026, 2), [10, 20]);
    assert.ok(Object.isFrozen(basis(2026, 11)));
  });
  test("every day of the month is asked once, and the result is cached per month", () => {
    const seen: string[] = [];
    const basis = basisFromPredicate((date) => {
      seen.push(date);
      return true;
    });
    const first = basis(2024, 2);
    assert.equal(first.length, 29);
    assert.equal(seen.length, 29);
    assert.deepEqual([seen[0], seen.at(-1)], ["2024-02-01", "2024-02-29"]);
    assert.equal(basis(2024, 2), first);
    assert.equal(seen.length, 29);
  });
  test("at most 240 months are kept: the cache is then cleared", () => {
    let calls = 0;
    const basis = basisFromPredicate(() => {
      calls++;
      return true;
    });
    for (let i = 0; i < 240; i++) basis(2000 + Math.floor(i / 12), (i % 12) + 1);
    const before = calls;
    basis(2000, 1);
    assert.equal(calls, before);
    basis(2020, 1);
    basis(2000, 1);
    assert.equal(calls, before + 31 + 31);
  });
  test("a month in which the predicate throws is not cached and throws again", () => {
    let calls = 0;
    const basis = basisFromPredicate((date) => {
      calls++;
      if (date === "2026-11-15") throw new RangeError("boom");
      return true;
    });
    assert.throws(() => basis(2026, 11), { message: "boom" });
    assert.throws(() => basis(2026, 11), { message: "boom" });
    assert.equal(calls, 30);
  });
});

describe("isCalendarLike", () => {
  test("true for an object with a function isBusinessDay and a string timeZone", () => {
    assert.equal(isCalendarLike(calendar), true);
    assert.equal(isCalendarLike({ isBusinessDay: () => true, timeZone: "UTC" }), true);
  });
  test("false otherwise", () => {
    for (const v of [
      null,
      undefined,
      "x",
      [],
      {},
      { isBusinessDay: true, timeZone: "UTC" },
      { isBusinessDay: () => true },
    ])
      assert.equal(isCalendarLike(v), false);
  });
});

describe("isDayOfMonth", () => {
  test("true for an integer 1-31 and for -1", () => {
    for (const v of [1, 31, -1]) assert.equal(isDayOfMonth(v), true, String(v));
  });
  test("false otherwise", () => {
    for (const v of [0, 32, -2, 1.5, "1", null]) assert.equal(isDayOfMonth(v), false, String(v));
  });
});

describe("isMonth", () => {
  test("true for an integer 1-12", () => {
    for (const v of [1, 12]) assert.equal(isMonth(v), true, String(v));
  });
  test("false otherwise", () => {
    for (const v of [0, 13, 1.5, "1", null]) assert.equal(isMonth(v), false, String(v));
  });
});

describe("checkSet", () => {
  const set = (raw: unknown, code?: "invalid-weekday") => {
    const c = new IssueCollector();
    const out = checkSet(
      c,
      "p",
      raw,
      (v) => Number.isInteger(v) && (v as number) > 0,
      "a positive integer",
      code,
    );
    return { out: out && [...out], issues: issues(c) };
  };
  test("a single value or an array of values as a set", () => {
    assert.deepEqual(set(3), { out: [3], issues: [] });
    assert.deepEqual(set([1, 2, 2]), { out: [1, 2], issues: [] });
  });
  test("undefined and invalid-option for an empty array, whatever the element code", () => {
    assert.deepEqual(set([]), { out: undefined, issues: ["invalid-option p"] });
    assert.deepEqual(set([], "invalid-weekday"), { out: undefined, issues: ["invalid-option p"] });
  });
  test("undefined and the element code for an invalid element; a hole counts as an element", () => {
    assert.deepEqual(set(0), { out: undefined, issues: ["invalid-option p"] });
    assert.deepEqual(set([1, -1], "invalid-weekday"), {
      out: undefined,
      issues: ["invalid-weekday p"],
    });
    // eslint-disable-next-line no-sparse-arrays
    assert.deepEqual(set([1, , 2]), { out: undefined, issues: ["invalid-option p"] });
  });
});

describe("ruleShapeOf", () => {
  test("which pattern keys are present, whatever their values", () => {
    const none = {
      weekday: false,
      day: false,
      after: false,
      before: false,
      holiday: false,
      businessMonth: false,
      businessWeek: false,
      cycle: false,
    };
    assert.deepEqual(ruleShapeOf({}), none);
    assert.deepEqual(ruleShapeOf({ weekday: "x" }), { ...none, weekday: true });
    assert.deepEqual(ruleShapeOf({ dayOfMonth: 1 }), { ...none, day: true });
    assert.deepEqual(ruleShapeOf({ dayAfterHoliday: false }), { ...none, after: true });
    assert.deepEqual(ruleShapeOf({ dayBeforeHoliday: true }), { ...none, before: true });
    assert.deepEqual(ruleShapeOf({ holiday: true }), { ...none, holiday: true });
    assert.deepEqual(ruleShapeOf({ businessDayOfMonth: 1 }), { ...none, businessMonth: true });
    assert.deepEqual(ruleShapeOf({ businessDayOfWeek: 1 }), { ...none, businessWeek: true });
    assert.deepEqual(ruleShapeOf({ cycle: 3 }), { ...none, cycle: true });
    assert.deepEqual(ruleShapeOf({ weekday: 1, cycle: 3, months: [1] }), {
      ...none,
      weekday: true,
      cycle: true,
    });
  });
});

describe("patternCount", () => {
  test("the number of pattern keys", () => {
    assert.equal(patternCount(ruleShapeOf({})), 0);
    assert.equal(patternCount(ruleShapeOf({ weekday: 1, months: [1] })), 1);
    assert.equal(
      patternCount(
        ruleShapeOf({
          weekday: 1,
          dayOfMonth: 1,
          businessDayOfMonth: 1,
          businessDayOfWeek: 1,
          dayAfterHoliday: true,
          dayBeforeHoliday: true,
          holiday: true,
          cycle: 2,
        }),
      ),
      8,
    );
  });
});

describe("emptyRuleDraft", () => {
  test("ok is true and every other field null; each call returns a new object", () => {
    const draft = emptyRuleDraft();
    const { ok, ...fields } = draft;
    assert.equal(ok, true);
    assert.equal(Object.keys(fields).length, 16);
    assert.ok(Object.values(fields).every((v) => v === null));
    assert.notEqual(emptyRuleDraft(), draft);
  });
});

describe("checkWeekdayRule", () => {
  const check = (entry: Record<string, unknown>) =>
    run((c, d) => checkWeekdayRule(c, "r", entry, d));
  test("weekday alone", () => {
    const { draft, issues: found } = check({ weekday: 3 });
    assert.deepEqual(found, []);
    assert.deepEqual(
      [draft.ok, draft.weekday, draft.nth, draft.interval, draft.anchor],
      [true, 3, null, null, null],
    );
  });
  test("invalid-weekday for a weekday that is not 0-6", () => {
    for (const weekday of [7, -1, "3", 1.5]) {
      const { draft, issues: found } = check({ weekday });
      assert.deepEqual(found, ["invalid-weekday r.weekday"]);
      assert.equal(draft.ok, false);
    }
  });
  test("nth: 1-5 or -1, single or an array", () => {
    assert.deepEqual([...check({ weekday: 3, nth: 2 }).draft.nth!], [2]);
    assert.deepEqual([...check({ weekday: 3, nth: [1, 5, -1] }).draft.nth!], [1, 5, -1]);
    for (const nth of [0, 6, -2, [], [1, 6]]) {
      const { draft, issues: found } = check({ weekday: 3, nth });
      assert.deepEqual(found, ["invalid-option r.nth"]);
      assert.equal(draft.ok, false);
    }
  });
  test("interval with an anchor on the same weekday", () => {
    // 2026-11-25 is a Wednesday
    const { draft, issues: found } = check({ weekday: 3, interval: 2, anchor: "2026-11-25" });
    assert.deepEqual(found, []);
    assert.deepEqual([draft.ok, draft.interval, draft.anchor], [true, 2, day("2026-11-25")]);
  });
  test("interval and anchor must be given together", () => {
    assert.deepEqual(check({ weekday: 3, interval: 2 }).issues, ["invalid-option r"]);
    assert.deepEqual(check({ weekday: 3, anchor: "2026-11-25" }).issues, ["invalid-option r"]);
    assert.equal(check({ weekday: 3, interval: 2 }).draft.ok, false);
  });
  test("interval cannot be used with nth", () => {
    const { draft, issues: found } = check({
      weekday: 3,
      nth: 1,
      interval: 2,
      anchor: "2026-11-25",
    });
    assert.deepEqual(found, ["invalid-option r.interval"]);
    assert.equal(draft.ok, false);
  });
  test("interval must be an integer of 2 or more", () => {
    for (const interval of [1, 0, 2.5, "2"]) {
      const { draft, issues: found } = check({ weekday: 3, interval, anchor: "2026-11-25" });
      assert.deepEqual(found, ["invalid-option r.interval"]);
      assert.equal(draft.ok, false);
    }
  });
  test("anchor must be a valid date on the same weekday", () => {
    assert.deepEqual(check({ weekday: 3, interval: 2, anchor: "2026-02-30" }).issues, [
      "invalid-date r.anchor",
    ]);
    const other = check({ weekday: 3, interval: 2, anchor: "2026-11-26" });
    assert.deepEqual(other.issues, ["invalid-option r.anchor"]);
    assert.deepEqual([other.draft.ok, other.draft.anchor], [false, null]);
    // With an invalid weekday the anchor's weekday is not compared
    assert.deepEqual(check({ weekday: 9, interval: 2, anchor: "2026-11-26" }).issues, [
      "invalid-weekday r.weekday",
    ]);
  });
});

describe("checkCycleRule", () => {
  const check = (entry: Record<string, unknown>) => run((c, d) => checkCycleRule(c, "r", entry, d));
  test("cycle, anchor and positions", () => {
    const { draft, issues: found } = check({ cycle: 4, anchor: "2026-11-23", positions: [1, 3] });
    assert.deepEqual(found, []);
    assert.deepEqual(
      [draft.ok, draft.cycle, draft.anchor, [...draft.positions!]],
      [true, 4, day("2026-11-23"), [1, 3]],
    );
  });
  test("cycle must be an integer of 2 or more", () => {
    for (const cycle of [1, 0, 2.5, "4"]) {
      const { draft, issues: found } = check({ cycle, anchor: "2026-11-23", positions: [1] });
      assert.deepEqual(found, ["invalid-option r.cycle"]);
      assert.equal(draft.ok, false);
    }
  });
  test("anchor is required and must be a valid date", () => {
    assert.deepEqual(check({ cycle: 4, positions: [1] }).issues, ["invalid-option r"]);
    assert.deepEqual(check({ cycle: 4, anchor: "2026-02-30", positions: [1] }).issues, [
      "invalid-date r.anchor",
    ]);
    assert.equal(check({ cycle: 4, positions: [1] }).draft.ok, false);
  });
  test("positions must be a non-empty array", () => {
    for (const positions of [undefined, 1, [], "1"])
      assert.deepEqual(check({ cycle: 4, anchor: "2026-11-23", positions }).issues, [
        "invalid-option r.positions",
      ]);
  });
  test("positions must be integers from 1 to the cycle, distinct, and not every day of the cycle", () => {
    for (const positions of [[0], [5], [1.5], [1, "2"], [1, 1], [1, 2, 3, 4]]) {
      const { draft, issues: found } = check({ cycle: 4, anchor: "2026-11-23", positions });
      assert.deepEqual(found, ["invalid-option r.positions"], JSON.stringify(positions));
      assert.equal(draft.ok, false);
    }
    assert.deepEqual(check({ cycle: 4, anchor: "2026-11-23", positions: [1, 2, 4] }).issues, []);
  });
  test("with an invalid cycle the positions are not checked against it", () => {
    assert.deepEqual(check({ cycle: 1, anchor: "2026-11-23", positions: [99] }).issues, [
      "invalid-option r.cycle",
    ]);
  });
  test("after-holiday is an error", () => {
    const { draft, issues: found } = check({
      cycle: 4,
      anchor: "2026-11-23",
      positions: [1],
      holidayOverlapPolicy: "after-holiday",
    });
    assert.deepEqual(found, ["invalid-option r.holidayOverlapPolicy"]);
    assert.equal(draft.ok, false);
    assert.deepEqual(
      check({
        cycle: 4,
        anchor: "2026-11-23",
        positions: [1],
        holidayOverlapPolicy: "over-holiday",
      }).issues,
      [],
    );
  });
});

describe("checkBusinessDayRule", () => {
  const check = (
    entry: Record<string, unknown>,
    week: boolean,
    context: "calendar" | "schedule" = "calendar",
  ) => run((c, d) => checkBusinessDayRule(c, "r", entry, d, week, context));
  test("businessDayOfMonth: 1-31 or -1 to -31, single or an array", () => {
    assert.deepEqual([...check({ businessDayOfMonth: -1 }, false).draft.businessDays!], [-1]);
    assert.deepEqual(
      [...check({ businessDayOfMonth: [1, 31, -31] }, false).draft.businessDays!],
      [1, 31, -31],
    );
    for (const businessDayOfMonth of [0, 32, -32, [], [1, 0]]) {
      const { draft, issues: found } = check({ businessDayOfMonth }, false);
      assert.deepEqual(found, ["invalid-option r.businessDayOfMonth"]);
      assert.equal(draft.ok, false);
    }
  });
  test("businessDayOfWeek: 1-7 or -1 to -7, with the required weekStart", () => {
    const { draft, issues: found } = check({ businessDayOfWeek: [1, -7], weekStart: 1 }, true);
    assert.deepEqual(found, []);
    assert.deepEqual([[...draft.businessDays!], draft.weekStart, draft.ok], [[1, -7], 1, true]);
    assert.deepEqual(check({ businessDayOfWeek: 8, weekStart: 1 }, true).issues, [
      "invalid-option r.businessDayOfWeek",
    ]);
    assert.deepEqual(check({ businessDayOfWeek: 0, weekStart: 1 }, true).issues, [
      "invalid-option r.businessDayOfWeek",
    ]);
  });
  test("weekStart: invalid-option when missing, invalid-weekday when it is not 0-6", () => {
    const missing = check({ businessDayOfWeek: 1 }, true);
    assert.deepEqual(missing.issues, ["invalid-option r.weekStart"]);
    assert.equal(missing.draft.ok, false);
    for (const weekStart of [7, -1, "1", null]) {
      const wrong = check({ businessDayOfWeek: 1, weekStart }, true);
      assert.deepEqual(wrong.issues, ["invalid-weekday r.weekStart"]);
      assert.equal(wrong.draft.ok, false);
    }
    assert.equal(check({ businessDayOfMonth: 1 }, false).draft.weekStart, null);
  });
  test("after-holiday is an error", () => {
    assert.deepEqual(
      check({ businessDayOfMonth: 1, holidayOverlapPolicy: "after-holiday" }, false).issues,
      ["invalid-option r.holidayOverlapPolicy"],
    );
    assert.deepEqual(
      check({ businessDayOfWeek: 1, weekStart: 1, holidayOverlapPolicy: "after-holiday" }, true)
        .issues,
      ["invalid-option r.holidayOverlapPolicy"],
    );
    assert.deepEqual(
      check({ businessDayOfMonth: 1, holidayOverlapPolicy: "over-holiday" }, false).issues,
      [],
    );
  });
  test("in a calendar: calendar is an error, and the basis stays null", () => {
    const with_ = check({ businessDayOfMonth: 1, calendar }, false, "calendar");
    assert.deepEqual(with_.issues, ["invalid-option r.calendar"]);
    assert.equal(with_.draft.ok, false);
    const without = check({ businessDayOfMonth: 1 }, false, "calendar");
    assert.deepEqual(
      [without.draft.ok, without.draft.basis, without.draft.calendar],
      [true, null, null],
    );
  });
  test("in a schedule: calendar is required and gives the counting basis", () => {
    for (const value of [undefined, null, {}, "calendar"]) {
      const wrong = check({ businessDayOfMonth: 1, calendar: value }, false, "schedule");
      assert.deepEqual(wrong.issues, ["invalid-option r.calendar"]);
      assert.equal(wrong.draft.ok, false);
    }
    const { draft, issues: found } = check({ businessDayOfMonth: 1, calendar }, false, "schedule");
    assert.deepEqual(found, []);
    assert.equal(draft.calendar, calendar);
    // November 2026: the 1st is a Sunday
    assert.deepEqual(draft.basis!(2026, 11).slice(0, 6), [2, 3, 4, 5, 6, 9]);
  });
});

describe("checkHolidayBasedRule", () => {
  const check = (
    entry: Record<string, unknown>,
    key: "dayAfterHoliday" | "dayBeforeHoliday" | "holiday" = "holiday",
  ) => run((c, d) => checkHolidayBasedRule(c, "r", entry, d, key));
  test("the key must be true", () => {
    assert.deepEqual(check({ holiday: true }), { draft: emptyRuleDraft(), issues: [] });
    for (const key of ["dayAfterHoliday", "dayBeforeHoliday", "holiday"] as const)
      for (const value of [false, 1, "true", null]) {
        const { draft, issues: found } = check({ [key]: value }, key);
        assert.deepEqual(found, [`invalid-option r.${key}`]);
        assert.equal(draft.ok, false);
      }
  });
  test("holidayOverlapPolicy cannot be written, with any of the three keys", () => {
    for (const key of ["dayAfterHoliday", "dayBeforeHoliday", "holiday"] as const) {
      const { draft, issues: found } = check(
        { [key]: true, holidayOverlapPolicy: "over-holiday" },
        key,
      );
      assert.deepEqual(found, ["invalid-option r.holidayOverlapPolicy"]);
      assert.equal(draft.ok, false);
    }
  });
  test("kinds: a non-empty array of non-empty strings", () => {
    assert.deepEqual(
      [...check({ holiday: true, kinds: ["regular", "substitute"] }).draft.kinds!],
      ["regular", "substitute"],
    );
    for (const kinds of ["regular", [], [""], ["regular", 1], null]) {
      const { draft, issues: found } = check({ holiday: true, kinds });
      assert.deepEqual(found, ["invalid-option r.kinds"], JSON.stringify(kinds));
      assert.equal(draft.ok, false);
    }
  });
});

describe("checkRulePattern", () => {
  const check = (entry: Record<string, unknown>, context: "calendar" | "schedule" = "calendar") =>
    run((c, d) => checkRulePattern(c, "r", entry, ruleShapeOf(entry), d, context));
  test("a weekday rule is validated as one, with nth, interval and anchor", () => {
    const { draft, issues: found } = check({ weekday: 3, nth: [1] });
    assert.deepEqual(found, []);
    assert.deepEqual([draft.weekday, [...draft.nth!]], [3, [1]]);
    assert.deepEqual(check({ weekday: 9 }).issues, ["invalid-weekday r.weekday"]);
  });
  test("a day-of-month rule: 1-31 or -1, single or an array", () => {
    assert.deepEqual([...check({ dayOfMonth: [20, -1] }).draft.days!], [20, -1]);
    for (const dayOfMonth of [0, 32, [], [1, 40]]) {
      const { draft, issues: found } = check({ dayOfMonth });
      assert.deepEqual(found, ["invalid-option r.dayOfMonth"]);
      assert.equal(draft.ok, false);
    }
  });
  test("a cycle rule, an nth-business-day rule and a holiday-based rule are validated by their checks", () => {
    assert.equal(check({ cycle: 4, anchor: "2026-11-23", positions: [1] }).draft.cycle, 4);
    assert.deepEqual([...check({ businessDayOfMonth: 2 }).draft.businessDays!], [2]);
    assert.equal(check({ businessDayOfWeek: 1, weekStart: 1 }).draft.weekStart, 1);
    assert.deepEqual(check({ businessDayOfMonth: 2 }, "schedule").issues, [
      "invalid-option r.calendar",
    ]);
    assert.deepEqual(check({ dayAfterHoliday: 1 }).issues, ["invalid-option r.dayAfterHoliday"]);
    assert.deepEqual(check({ dayBeforeHoliday: 1 }).issues, ["invalid-option r.dayBeforeHoliday"]);
    assert.deepEqual(check({ holiday: 1 }).issues, ["invalid-option r.holiday"]);
  });
  test("without weekday, nth and interval are errors", () => {
    const { draft, issues: found } = check({ dayOfMonth: 1, nth: 1, interval: 2 });
    assert.deepEqual(found, ["invalid-option r.nth", "invalid-option r.interval"]);
    assert.equal(draft.ok, false);
  });
  test("anchor is an error unless the rule is a weekday or a cycle rule", () => {
    assert.deepEqual(check({ dayOfMonth: 1, anchor: "2026-11-23" }).issues, [
      "invalid-option r.anchor",
    ]);
    assert.deepEqual(check({ holiday: true, anchor: "2026-11-23" }).issues, [
      "invalid-option r.anchor",
    ]);
    assert.deepEqual(check({ cycle: 4, anchor: "2026-11-23", positions: [1] }).issues, []);
  });
});

describe("checkRuleFilters", () => {
  const check = (entry: Record<string, unknown>) =>
    run((c, d) => checkRuleFilters(c, "r", entry, ruleShapeOf(entry), d));
  test("calendar only with an nth-business-day rule", () => {
    assert.deepEqual(check({ weekday: 1, calendar }).issues, ["invalid-option r.calendar"]);
    assert.deepEqual(check({ businessDayOfMonth: 1, calendar }).issues, []);
    assert.deepEqual(check({ businessDayOfWeek: 1, calendar }).issues, []);
  });
  test("weekStart only with businessDayOfWeek", () => {
    assert.deepEqual(check({ businessDayOfMonth: 1, weekStart: 1 }).issues, [
      "invalid-option r.weekStart",
    ]);
    assert.deepEqual(check({ businessDayOfWeek: 1, weekStart: 1 }).issues, []);
  });
  test("positions only with cycle", () => {
    assert.deepEqual(check({ weekday: 1, positions: [1] }).issues, ["invalid-option r.positions"]);
    assert.deepEqual(check({ cycle: 3, positions: [1] }).issues, []);
  });
  test("kinds, keys and weekdays only with a holiday-based rule", () => {
    const wrong = check({ weekday: 1, kinds: ["regular"], keys: ["new-year"], weekdays: [1] });
    assert.deepEqual(wrong.issues, [
      "invalid-option r.kinds",
      "invalid-option r.keys",
      "invalid-option r.weekdays",
    ]);
    assert.equal(wrong.draft.ok, false);
    for (const key of ["holiday", "dayAfterHoliday", "dayBeforeHoliday"])
      assert.deepEqual(
        check({ [key]: true, kinds: ["regular"], keys: ["new-year"], weekdays: [1] }).issues,
        [],
      );
  });
  test("keys: a non-empty array of holiday keys", () => {
    assert.deepEqual(
      [...check({ holiday: true, keys: ["new-year", "a1"] }).draft.keys!],
      ["new-year", "a1"],
    );
    for (const keys of ["new-year", [], ["New Year"], [1], [""]]) {
      const { draft, issues: found } = check({ holiday: true, keys });
      assert.deepEqual(found, ["invalid-option r.keys"], JSON.stringify(keys));
      assert.equal(draft.ok, false);
    }
  });
  test("weekdays: a non-empty array of weekdays; a wrong element is invalid-weekday", () => {
    assert.deepEqual([...check({ holiday: true, weekdays: [0, 6] }).draft.weekdays!], [0, 6]);
    assert.deepEqual(check({ holiday: true, weekdays: 1 }).issues, ["invalid-option r.weekdays"]);
    assert.deepEqual(check({ holiday: true, weekdays: [] }).issues, ["invalid-option r.weekdays"]);
    const wrong = check({ holiday: true, weekdays: [7] });
    assert.deepEqual(wrong.issues, ["invalid-weekday r.weekdays"]);
    assert.equal(wrong.draft.ok, false);
  });
  test("months with any rule: a non-empty array of 1-12", () => {
    assert.deepEqual([...check({ weekday: 1, months: [1, 12] }).draft.months!], [1, 12]);
    assert.deepEqual([...check({ holiday: true, months: [6] }).draft.months!], [6]);
    for (const months of [1, [], [0], [13], [1.5]]) {
      const { draft, issues: found } = check({ weekday: 1, months });
      assert.deepEqual(found, ["invalid-option r.months"], JSON.stringify(months));
      assert.equal(draft.ok, false);
    }
  });
  test("an entry without filters records nothing", () => {
    assert.deepEqual(check({ weekday: 1 }), { draft: emptyRuleDraft(), issues: [] });
  });
});

describe("overlapPolicyOf", () => {
  const policy = (entry: Record<string, unknown>, holidayRule = false) => {
    const c = new IssueCollector();
    const draft = emptyRuleDraft();
    return {
      value: overlapPolicyOf(c, "r", entry, holidayRule, draft),
      ok: draft.ok,
      issues: issues(c),
    };
  };
  test("the written value when it is one of the three policies", () => {
    for (const value of ["under-holiday", "over-holiday", "after-holiday"])
      assert.deepEqual(policy({ holidayOverlapPolicy: value }), { value, ok: true, issues: [] });
  });
  test("the default: under-holiday, or over-holiday for a holiday rule", () => {
    assert.deepEqual(policy({}), { value: "under-holiday", ok: true, issues: [] });
    assert.deepEqual(policy({}, true), { value: "over-holiday", ok: true, issues: [] });
  });
  test("invalid-option for any other value, which is returned as written", () => {
    for (const value of ["skip", null, true])
      assert.deepEqual(policy({ holidayOverlapPolicy: value }), {
        value,
        ok: false,
        issues: ["invalid-option r.holidayOverlapPolicy"],
      });
  });
});

describe("checkSkipWeekdays", () => {
  const check = (entry: Record<string, unknown>, start: Partial<RuleDraft> = {}) =>
    run((c, d) => checkSkipWeekdays(c, "r", entry, ruleShapeOf(entry), d), start);
  test("nothing without skipWeekdays", () => {
    assert.deepEqual(check({ weekday: 1 }), { draft: emptyRuleDraft(), issues: [] });
  });
  test("allowed with dayAfterHoliday and dayBeforeHoliday", () => {
    assert.deepEqual(
      [...check({ dayAfterHoliday: true, skipWeekdays: [0, 6] }).draft.skipWeekdays!],
      [0, 6],
    );
    assert.deepEqual(
      [...check({ dayBeforeHoliday: true, skipWeekdays: [0] }).draft.skipWeekdays!],
      [0],
    );
  });
  test("allowed with after-holiday on a weekday or dayOfMonth rule", () => {
    assert.deepEqual(
      check(
        { weekday: 3, holidayOverlapPolicy: "after-holiday", skipWeekdays: [0] },
        { weekday: 3 },
      ).issues,
      [],
    );
    assert.deepEqual(
      check({ dayOfMonth: 20, holidayOverlapPolicy: "after-holiday", skipWeekdays: [0] }).issues,
      [],
    );
  });
  test("an error with any other rule or policy", () => {
    for (const entry of [
      { weekday: 3, skipWeekdays: [0] },
      { weekday: 3, holidayOverlapPolicy: "over-holiday", skipWeekdays: [0] },
      { holiday: true, skipWeekdays: [0] },
      { cycle: 3, holidayOverlapPolicy: "after-holiday", skipWeekdays: [0] },
      { businessDayOfMonth: 1, holidayOverlapPolicy: "after-holiday", skipWeekdays: [0] },
    ]) {
      const { draft, issues: found } = check(entry);
      assert.deepEqual(found, ["invalid-option r.skipWeekdays"], JSON.stringify(entry));
      assert.equal(draft.ok, false);
    }
  });
  test("a non-empty array of weekdays; a wrong element is invalid-weekday", () => {
    assert.deepEqual(check({ dayAfterHoliday: true, skipWeekdays: 0 }).issues, [
      "invalid-option r.skipWeekdays",
    ]);
    assert.deepEqual(check({ dayAfterHoliday: true, skipWeekdays: [] }).issues, [
      "invalid-option r.skipWeekdays",
    ]);
    const wrong = check({ dayAfterHoliday: true, skipWeekdays: [7] });
    assert.deepEqual(wrong.issues, ["invalid-weekday r.skipWeekdays"]);
    assert.equal(wrong.draft.ok, false);
  });
  test("not all seven weekdays", () => {
    const all = check({ dayAfterHoliday: true, skipWeekdays: [0, 1, 2, 3, 4, 5, 6] });
    assert.deepEqual(all.issues, ["invalid-option r.skipWeekdays"]);
    assert.equal(all.draft.ok, false);
    assert.deepEqual(check({ dayAfterHoliday: true, skipWeekdays: [0, 1, 2, 3, 4, 5] }).issues, []);
  });
  test("not the rule's own weekday", () => {
    const own = check(
      { weekday: 3, holidayOverlapPolicy: "after-holiday", skipWeekdays: [3, 6] },
      { weekday: 3 },
    );
    assert.deepEqual(own.issues, ["invalid-option r.skipWeekdays"]);
    assert.equal(own.draft.ok, false);
  });
});

describe("compileRecurringRule", () => {
  const closed = () => ({ value: false });
  const compile = (
    entry: unknown,
    context: "calendar" | "schedule" = "calendar",
    written = "rules[0]",
  ) => {
    const c = new IssueCollector();
    const rule = compileRecurringRule(
      c,
      "rules[0]",
      written,
      entry,
      closed,
      RECURRING_RULE_KEYS,
      context,
      "none",
    );
    return { rule, issues: c.issues.map((i) => `${i.severity} ${i.code} ${i.path}`) };
  };
  test("a frozen compiled rule with every field", () => {
    const { rule, issues: found } = compile({
      weekday: 3,
      nth: [1, 3],
      months: [1, 2],
      name: "Regular",
      effectiveFrom: "2026-01-01",
    });
    assert.deepEqual(found, []);
    assert.ok(Object.isFrozen(rule));
    assert.deepEqual(rule, {
      path: "rules[0]",
      weekday: 3,
      nth: new Set([1, 3]),
      interval: null,
      anchor: null,
      cycle: null,
      positions: null,
      days: null,
      businessDays: null,
      weekStart: null,
      basis: null,
      calendar: null,
      skipWeekdays: null,
      dayAfterHoliday: false,
      dayBeforeHoliday: false,
      holiday: false,
      kinds: null,
      nationalOfJp: false,
      keys: null,
      weekdays: null,
      months: new Set([1, 2]),
      holidayOverlapPolicy: "under-holiday",
      value: false,
      name: "Regular",
      effectiveFrom: day("2026-01-01"),
      effectiveTo: null,
    });
  });
  test("the flags of the holiday-based rules, and the default policy of a holiday rule", () => {
    assert.deepEqual(
      [
        compile({ holiday: true }).rule!,
        compile({ dayAfterHoliday: true }).rule!,
        compile({ dayBeforeHoliday: true }).rule!,
      ].map((r) => [r.holiday, r.dayAfterHoliday, r.dayBeforeHoliday, r.holidayOverlapPolicy]),
      [
        [true, false, false, "over-holiday"],
        [false, true, false, "under-holiday"],
        [false, false, true, "under-holiday"],
      ],
    );
  });
  test("undefined and invalid-option when the entry is not an object", () => {
    for (const entry of [null, undefined, "weekday", 3, []])
      assert.deepEqual(compile(entry), {
        rule: undefined,
        issues: ["error invalid-option rules[0]"],
      });
  });
  test("exactly one pattern key: otherwise invalid-option, and nothing else of the pattern is checked", () => {
    assert.deepEqual(compile({}), { rule: undefined, issues: ["error invalid-option rules[0]"] });
    assert.deepEqual(compile({ weekday: 9, dayOfMonth: 99 }), {
      rule: undefined,
      issues: ["error invalid-option rules[0]"],
    });
  });
  test("renamed keys are read with a warning at the written position; unknown keys get a warning", () => {
    const { rule, issues: found } = compile(
      { day: 20, onHolidayRule: "over-holiday", extra: 1 },
      "calendar",
      "old[0]",
    );
    assert.deepEqual(found, [
      "warning deprecated-option old[0].day",
      "warning deprecated-option old[0].onHolidayRule",
      "warning unknown-option rules[0].extra",
    ]);
    assert.deepEqual([[...rule!.days!], rule!.holidayOverlapPolicy], [[20], "over-holiday"]);
  });
  test("an explicit undefined is an omission", () => {
    const { rule, issues: found } = compile({
      weekday: 3,
      nth: undefined,
      months: undefined,
      dayOfMonth: undefined,
    });
    assert.deepEqual(found, []);
    assert.equal(rule!.nth, null);
  });
  test("every problem of the pattern, the filters, the policy, skipWeekdays and the period is reported; no rule is returned", () => {
    const { rule, issues: found } = compile({
      weekday: 9,
      positions: [1],
      holidayOverlapPolicy: "skip",
      skipWeekdays: [0],
      effectiveFrom: "2026-02-30",
    });
    assert.equal(rule, undefined);
    assert.deepEqual(found, [
      "error invalid-weekday rules[0].weekday",
      "error invalid-option rules[0].positions",
      "error invalid-option rules[0].holidayOverlapPolicy",
      "error invalid-option rules[0].skipWeekdays",
      "error invalid-date rules[0].effectiveFrom",
    ]);
  });
  test("a wrong name alone still returns the rule", () => {
    const { rule, issues: found } = compile({ weekday: 3, name: 5 });
    assert.deepEqual(found, ["error invalid-option rules[0].name"]);
    assert.equal(rule!.name, undefined);
  });
  test("no rule when the entry has no value", () => {
    const c = new IssueCollector();
    const rule = compileRecurringRule(
      c,
      "r",
      "r",
      { weekday: 3 },
      () => undefined,
      RECURRING_RULE_KEYS,
      "calendar",
      "none",
    );
    assert.equal(rule, undefined);
  });
  test("in a schedule an nth-business-day rule carries its calendar and basis", () => {
    const { rule, issues: found } = compile({ businessDayOfMonth: -1, calendar }, "schedule");
    assert.deepEqual(found, []);
    assert.equal(rule!.calendar, calendar);
    assert.equal(rule!.basis!(2026, 11).at(-1), 30);
  });
});
