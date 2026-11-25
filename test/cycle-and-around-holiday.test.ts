import assert from "node:assert/strict";
import test from "node:test";
import { combineCalendars, createCalendar, createSchedule } from "../src/index.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";
import { jp } from "../src/jp/index.ts";
import { sg } from "../src/sg/index.ts";
import { england } from "../src/uk/index.ts";

const codes = (options: Parameters<typeof diagnoseCalendar>[0]) =>
  diagnoseCalendar(options).map((d) => [d.code, d.path, d.relatedPath ?? null]);

// ---------------------------------------------------------------------------
// The day-cycle rule { cycle, anchor, positions }
// ---------------------------------------------------------------------------

const shift = {
  holidayProvider: jp,
  holidayPolicy: "ignore",
  closedWeekdays: [],
  closedRecurringRules: [
    { cycle: 6, anchor: "2026-01-05", positions: [5, 6], name: "班 A の休日" },
  ],
} as const;

test("cycle: 起点を 1 日目として、周期の中の何日目かに当てはまる（4 勤 2 休）", () => {
  const a = createCalendar(shift);
  const closed = ["2026-01-09", "2026-01-10", "2026-01-15", "2026-01-16"];
  const open = ["2026-01-05", "2026-01-08", "2026-01-11", "2026-01-14", "2026-01-17"];
  for (const d of closed) assert.equal(a.isBusinessDay(d), false, d);
  for (const d of open) assert.equal(a.isBusinessDay(d), true, d);
  // Days before the anchor match too
  assert.equal(a.isBusinessDay("2026-01-04"), false);
  assert.equal(a.isBusinessDay("2026-01-03"), false);
  assert.equal(a.isBusinessDay("2026-01-02"), true);
  assert.equal(a.addBusinessDays("2026-01-08", 1), "2026-01-11");
  const info = a.dayInfoOn("2026-01-09");
  assert.equal(info.reason, "closed-recurring");
  assert.equal(info.name, "班 A の休日");
  assert.equal(info.optionPath, "closedRecurringRules[0]");
});

test("cycle: 班の合成（どちらかが動く日・両方がそろう日）", () => {
  const a = createCalendar(shift);
  const b = createCalendar({
    ...shift,
    closedRecurringRules: [{ cycle: 6, anchor: "2026-01-08", positions: [5, 6] }],
  });
  const any = combineCalendars([a, b], { open: "any" });
  const all = combineCalendars([a, b], { open: "all" });
  for (let d = 5; d <= 16; d++) {
    const date = `2026-01-${String(d).padStart(2, "0")}`;
    assert.equal(any.isBusinessDay(date), true, date);
  }
  assert.deepEqual(
    ["2026-01-05", "2026-01-08", "2026-01-11", "2026-01-14"].map((d) => all.isBusinessDay(d)),
    [true, true, true, true],
  );
  assert.equal(all.isBusinessDay("2026-01-06"), false);
});

test("cycle: 月・有効期間・祝日の扱い・スケジュール", () => {
  const c = createCalendar({
    closedWeekdays: [],
    closedRecurringRules: [
      {
        cycle: 10,
        anchor: "2026-04-01",
        positions: [1],
        months: [4, 5],
        effectiveFrom: "2026-04-01",
      },
    ],
  });
  assert.equal(c.isBusinessDay("2026-04-01"), false);
  assert.equal(c.isBusinessDay("2026-04-11"), false);
  assert.equal(c.isBusinessDay("2026-03-22"), true); // before the effective period
  assert.equal(c.isBusinessDay("2026-06-10"), true); // outside the months (position 1)
  // Under the holiday (default) the holiday comes first; with "over-holiday" the rule applies on a holiday too
  const under = createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ cycle: 7, anchor: "2026-01-01", positions: [1] }],
  });
  assert.equal(under.isBusinessDay("2026-01-01"), false);
  const over = createCalendar({
    holidayProvider: jp,
    openRecurringRules: [
      { cycle: 7, anchor: "2026-01-01", positions: [1], holidayOverlapPolicy: "over-holiday" },
    ],
  });
  assert.equal(over.isBusinessDay("2026-01-01"), true);
  const s = createSchedule({
    weekdayValues: ["-", "-", "-", "-", "-", "-", "-"],
    recurringRules: [{ cycle: 3, anchor: "2026-01-01", positions: [2], value: "点検" }],
  });
  assert.deepEqual(
    ["2026-01-01", "2026-01-02", "2026-01-05", "2025-12-30"].map((d) => s.valueOn(d)),
    ["-", "点検", "点検", "点検"],
  );
});

test("cycle: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { cycle: 1, anchor: "2026-01-05", positions: [1] },
      /closedRecurringRules\[0\]\.cycle: must be an integer of 2 or more/,
    ],
    [{ cycle: 2.5, anchor: "2026-01-05", positions: [1] }, /closedRecurringRules\[0\]\.cycle/],
    [{ cycle: 6, positions: [5] }, /closedRecurringRules\[0\]: "anchor" is required with "cycle"/],
    [{ cycle: 6, anchor: "2026-02-30", positions: [5] }, /closedRecurringRules\[0\]\.anchor/],
    [
      { cycle: 6, anchor: "2026-01-05" },
      /closedRecurringRules\[0\]\.positions: must be a non-empty array/,
    ],
    [{ cycle: 6, anchor: "2026-01-05", positions: [] }, /closedRecurringRules\[0\]\.positions/],
    [{ cycle: 6, anchor: "2026-01-05", positions: [0] }, /positions: must be integers from 1 to 6/],
    [{ cycle: 6, anchor: "2026-01-05", positions: [7] }, /positions: must be integers from 1 to 6/],
    [
      { cycle: 6, anchor: "2026-01-05", positions: [5, 5] },
      /positions: must not contain the same day twice/,
    ],
    [
      { cycle: 2, anchor: "2026-01-05", positions: [1, 2] },
      /positions: must not contain every day of the cycle/,
    ],
    [
      { cycle: 6, anchor: "2026-01-05", positions: [5], holidayOverlapPolicy: "after-holiday" },
      /holidayOverlapPolicy: "after-holiday" cannot be used with "cycle"/,
    ],
    [{ cycle: 6, anchor: "2026-01-05", positions: [5], weekday: 1 }, /must have exactly one of/],
    [
      { cycle: 6, anchor: "2026-01-05", positions: [5], weekdays: [1] },
      /closedRecurringRules\[0\]\.weekdays/,
    ],
    [
      { cycle: 6, anchor: "2026-01-05", positions: [5], interval: 2 },
      /closedRecurringRules\[0\]\.interval/,
    ],
    [
      { dayOfMonth: 1, positions: [1] },
      /closedRecurringRules\[0\]\.positions: "positions" can be used only with "cycle"/,
    ],
    [
      { dayOfMonth: 1, anchor: "2026-01-05" },
      /"anchor" can be used only with "weekday" or "cycle"/,
    ],
  ];
  for (const [rule, message] of cases) {
    assert.throws(
      () => createCalendar({ closedRecurringRules: [rule] } as never),
      (e: Error) => message.test(e.message),
      JSON.stringify(rule),
    );
  }
});

test("cycle: 診断（覆われている・当てはまる日がない）", () => {
  // A rule with cycle 12 is covered by a rule with cycle 6 and the same anchor. With a shifted anchor it is not
  assert.deepEqual(
    codes({
      closedWeekdays: [],
      closedRecurringRules: [
        { cycle: 6, anchor: "2026-01-05", positions: [5, 6] },
        { cycle: 12, anchor: "2026-01-05", positions: [5, 12] },
        { cycle: 12, anchor: "2026-01-06", positions: [5, 6] },
      ],
    }).filter(([code]) => code === "shadowed"),
    [["shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"]],
  );
  // No matching day within the effective period
  assert.deepEqual(
    codes({
      closedRecurringRules: [
        {
          cycle: 10,
          anchor: "2026-01-01",
          positions: [1],
          effectiveFrom: "2026-02-01",
          effectiveTo: "2026-02-03",
        },
      ],
    }),
    [["never-matches", "closedRecurringRules[0]", null]],
  );
});

// ---------------------------------------------------------------------------
// kinds and keys of day-after and day-before-holiday rules (filtering by the neighbouring holiday)
// ---------------------------------------------------------------------------

test("祝前日・祝日の翌日: keys・kinds は隣の祝日で絞る", () => {
  // The day before Chinese New Year in Singapore (2/17 and 2/18 in 2026)
  const cny = createCalendar({
    holidayProvider: sg,
    closedRecurringRules: [{ dayBeforeHoliday: true, keys: ["chinese-new-year"] }],
  });
  assert.equal(cny.isBusinessDay("2026-02-16"), false);
  assert.equal(cny.isBusinessDay("2026-02-13"), true);
  // The day before Hari Raya Puasa (2026-03-21) does not match
  assert.equal(cny.isBusinessDay("2026-03-20"), true);
  // Only the day after the substitute holiday (2026-05-06)
  const afterSubstitute = createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ dayAfterHoliday: true, kinds: ["substitute"] }],
  });
  assert.equal(afterSubstitute.isBusinessDay("2026-05-07"), false);
  assert.equal(afterSubstitute.isBusinessDay("2026-01-02"), true); // the day after New Year's Day
  // A holiday without a key (citizens' holiday) does not match keys. The day before a run of holidays is
  // filtered by the neighbouring holiday (the first day of the run)
  const beforeChildrens = createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ dayBeforeHoliday: true, keys: ["childrens"] }],
  });
  assert.equal(beforeChildrens.isBusinessDay("2026-05-02"), true); // the next day is Constitution Memorial Day
});

// ---------------------------------------------------------------------------
// skipWeekdays of day-after and day-before-holiday rules (around a block of holidays and the listed weekdays)
// ---------------------------------------------------------------------------

test("祝前日・祝日の翌日: skipWeekdays で塊の前後の日になる", () => {
  const before = createCalendar({
    holidayProvider: england,
    closedWeekdays: [],
    closedRecurringRules: [{ dayBeforeHoliday: true, skipWeekdays: [0, 6] }],
  });
  // The last weekday before the Spring bank holiday (2026-05-25, Mon) is 5/22 (Fri)
  assert.equal(before.isBusinessDay("2026-05-22"), false);
  assert.equal(before.isBusinessDay("2026-05-23"), true); // does not match a skipped weekday
  assert.equal(before.isBusinessDay("2026-05-24"), true);
  assert.equal(before.isBusinessDay("2026-05-15"), true); // does not match before an ordinary weekend
  // Day after a holiday: 4/7 (Tue), the day after the block from Good Friday (4/3) to Easter Monday (4/6)
  const after = createCalendar({
    holidayProvider: england,
    closedRecurringRules: [{ dayAfterHoliday: true, skipWeekdays: [0, 6] }],
  });
  assert.equal(after.isBusinessDay("2026-04-07"), false);
  assert.equal(after.dayInfoOn("2026-04-04").optionPath, undefined); // does not match a skipped weekday
});

test("祝前日・祝日の翌日: skipWeekdays と keys は、塊の中で最も近い祝日で絞る", () => {
  // Christmas (Sat) and Boxing Day (Sun) of 2027 become the substitutes 12/27 (christmas) and 12/28 (boxing-day)
  const lastPosting = createCalendar({
    holidayProvider: england,
    closedRecurringRules: [{ dayBeforeHoliday: true, keys: ["christmas"], skipWeekdays: [0, 6] }],
  });
  assert.equal(lastPosting.isBusinessDay("2027-12-24"), false);
  assert.equal(lastPosting.isBusinessDay("2027-12-23"), true);
  const afterEasterMonday = createCalendar({
    holidayProvider: england,
    closedRecurringRules: [
      { dayAfterHoliday: true, keys: ["easter-monday"], skipWeekdays: [0, 6] },
    ],
  });
  const afterGoodFriday = createCalendar({
    holidayProvider: england,
    closedRecurringRules: [{ dayAfterHoliday: true, keys: ["good-friday"], skipWeekdays: [0, 6] }],
  });
  assert.equal(afterEasterMonday.isBusinessDay("2026-04-07"), false);
  assert.equal(afterGoodFriday.isBusinessDay("2026-04-07"), true);
});

test("祝前日・祝日の翌日: 診断（絞り込みと飛ばす曜日の包含）", () => {
  assert.deepEqual(
    codes({
      holidayProvider: england,
      closedRecurringRules: [
        { dayBeforeHoliday: true, skipWeekdays: [0, 6] },
        { dayBeforeHoliday: true, skipWeekdays: [0, 6], keys: ["christmas"] },
        { dayBeforeHoliday: true, keys: ["christmas"] },
      ],
    }),
    [["shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"]],
  );
  assert.deepEqual(
    codes({
      holidayProvider: england,
      closedRecurringRules: [{ dayAfterHoliday: true, keys: ["no-such-key"] }],
    }),
    [["never-matches", "closedRecurringRules[0]", null]],
  );
});
