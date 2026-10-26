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
// 日単位の周期の規則 { cycle, anchor, positions }
// ---------------------------------------------------------------------------

const shift = {
  holidays: jp,
  holidayPolicy: "ignore",
  closedWeekdays: [],
  closedRecurring: [{ cycle: 6, anchor: "2026-01-05", positions: [5, 6], name: "班 A の休日" }],
} as const;

test("cycle: 起点を 1 日目として、周期の中の何日目かに当てはまる（4 勤 2 休）", () => {
  const a = createCalendar(shift);
  const closed = ["2026-01-09", "2026-01-10", "2026-01-15", "2026-01-16"];
  const open = ["2026-01-05", "2026-01-08", "2026-01-11", "2026-01-14", "2026-01-17"];
  for (const d of closed) assert.equal(a.isBusinessDay(d), false, d);
  for (const d of open) assert.equal(a.isBusinessDay(d), true, d);
  // 起点より前の日にも当てはまる
  assert.equal(a.isBusinessDay("2026-01-04"), false);
  assert.equal(a.isBusinessDay("2026-01-03"), false);
  assert.equal(a.isBusinessDay("2026-01-02"), true);
  assert.equal(a.addBusinessDays("2026-01-08", 1), "2026-01-11");
  const info = a.dayInfo("2026-01-09");
  assert.equal(info.reason, "closed-recurring");
  assert.equal(info.name, "班 A の休日");
  assert.equal(info.rulePath, "closedRecurring[0]");
});

test("cycle: 班の合成（どちらかが動く日・両方がそろう日）", () => {
  const a = createCalendar(shift);
  const b = createCalendar({
    ...shift,
    closedRecurring: [{ cycle: 6, anchor: "2026-01-08", positions: [5, 6] }],
  });
  const any = combineCalendars([a, b], { businessDay: "any" });
  const all = combineCalendars([a, b], { businessDay: "all" });
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
    closedRecurring: [
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
  assert.equal(c.isBusinessDay("2026-03-22"), true); // 有効期間の前
  assert.equal(c.isBusinessDay("2026-06-10"), true); // 月の外（位置は 1）
  // 祝日の下（既定）では祝日が先、"over-holiday" なら祝日でも当てはまる
  const under = createCalendar({
    holidays: jp,
    openRecurring: [{ cycle: 7, anchor: "2026-01-01", positions: [1] }],
  });
  assert.equal(under.isBusinessDay("2026-01-01"), false);
  const over = createCalendar({
    holidays: jp,
    openRecurring: [
      { cycle: 7, anchor: "2026-01-01", positions: [1], onHolidayRule: "over-holiday" },
    ],
  });
  assert.equal(over.isBusinessDay("2026-01-01"), true);
  const s = createSchedule({
    weekly: ["-", "-", "-", "-", "-", "-", "-"],
    recurring: [{ cycle: 3, anchor: "2026-01-01", positions: [2], value: "点検" }],
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
      /closedRecurring\[0\]\.cycle: must be an integer of 2 or more/,
    ],
    [{ cycle: 2.5, anchor: "2026-01-05", positions: [1] }, /closedRecurring\[0\]\.cycle/],
    [{ cycle: 6, positions: [5] }, /closedRecurring\[0\]: "anchor" is required with "cycle"/],
    [{ cycle: 6, anchor: "2026-02-30", positions: [5] }, /closedRecurring\[0\]\.anchor/],
    [
      { cycle: 6, anchor: "2026-01-05" },
      /closedRecurring\[0\]\.positions: must be a non-empty array/,
    ],
    [{ cycle: 6, anchor: "2026-01-05", positions: [] }, /closedRecurring\[0\]\.positions/],
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
      { cycle: 6, anchor: "2026-01-05", positions: [5], onHolidayRule: "after-holiday" },
      /onHolidayRule: "after-holiday" cannot be used with "cycle"/,
    ],
    [{ cycle: 6, anchor: "2026-01-05", positions: [5], weekday: 1 }, /must have exactly one of/],
    [
      { cycle: 6, anchor: "2026-01-05", positions: [5], weekdays: [1] },
      /closedRecurring\[0\]\.weekdays/,
    ],
    [
      { cycle: 6, anchor: "2026-01-05", positions: [5], interval: 2 },
      /closedRecurring\[0\]\.interval/,
    ],
    [
      { day: 1, positions: [1] },
      /closedRecurring\[0\]\.positions: "positions" can be used only with "cycle"/,
    ],
    [{ day: 1, anchor: "2026-01-05" }, /"anchor" can be used only with "weekday" or "cycle"/],
  ];
  for (const [rule, message] of cases) {
    assert.throws(
      () => createCalendar({ closedRecurring: [rule] } as never),
      (e: Error) => message.test(e.message),
      JSON.stringify(rule),
    );
  }
});

test("cycle: 診断（覆われている・当てはまる日がない）", () => {
  // 周期 12 の規則は、同じ起点の周期 6 の規則に覆われる。起点がずれると覆われない
  assert.deepEqual(
    codes({
      closedWeekdays: [],
      closedRecurring: [
        { cycle: 6, anchor: "2026-01-05", positions: [5, 6] },
        { cycle: 12, anchor: "2026-01-05", positions: [5, 12] },
        { cycle: 12, anchor: "2026-01-06", positions: [5, 6] },
      ],
    }).filter(([code]) => code === "shadowed"),
    [["shadowed", "closedRecurring[1]", "closedRecurring[0]"]],
  );
  // 有効期間の中に当てはまる日がない
  assert.deepEqual(
    codes({
      closedRecurring: [
        {
          cycle: 10,
          anchor: "2026-01-01",
          positions: [1],
          effectiveFrom: "2026-02-01",
          effectiveTo: "2026-02-03",
        },
      ],
    }),
    [["never-matches", "closedRecurring[0]", null]],
  );
});

// ---------------------------------------------------------------------------
// 祝日の翌日・祝前日の kinds・keys（隣の祝日で絞る）
// ---------------------------------------------------------------------------

test("祝前日・祝日の翌日: keys・kinds は隣の祝日で絞る", () => {
  // シンガポールの旧正月（2026 年は 2/17・2/18）の前日
  const cny = createCalendar({
    holidays: sg,
    closedRecurring: [{ dayBeforeHoliday: true, keys: ["chinese-new-year"] }],
  });
  assert.equal(cny.isBusinessDay("2026-02-16"), false);
  assert.equal(cny.isBusinessDay("2026-02-13"), true);
  // Hari Raya Puasa（2026-03-21）の前日は当てはまらない
  assert.equal(cny.isBusinessDay("2026-03-20"), true);
  // 振替休日（2026-05-06）の翌日だけ
  const afterSubstitute = createCalendar({
    holidays: jp,
    closedRecurring: [{ dayAfterHoliday: true, kinds: ["substitute"] }],
  });
  assert.equal(afterSubstitute.isBusinessDay("2026-05-07"), false);
  assert.equal(afterSubstitute.isBusinessDay("2026-01-02"), true); // 元日の翌日
  // key を持たない祝日（国民の休日）は keys に当てはまらない。連休の前日は、隣の祝日（連休の初日）で絞る
  const beforeChildrens = createCalendar({
    holidays: jp,
    closedRecurring: [{ dayBeforeHoliday: true, keys: ["childrens"] }],
  });
  assert.equal(beforeChildrens.isBusinessDay("2026-05-02"), true); // 翌日は憲法記念日
});

// ---------------------------------------------------------------------------
// 祝日の翌日・祝前日の skipWeekdays（祝日と書いた曜日の塊の前後）
// ---------------------------------------------------------------------------

test("祝前日・祝日の翌日: skipWeekdays で塊の前後の日になる", () => {
  const before = createCalendar({
    holidays: england,
    closedWeekdays: [],
    closedRecurring: [{ dayBeforeHoliday: true, skipWeekdays: [0, 6] }],
  });
  // Spring bank holiday（2026-05-25 月）の前の最終平日は 5/22（金）
  assert.equal(before.isBusinessDay("2026-05-22"), false);
  assert.equal(before.isBusinessDay("2026-05-23"), true); // 飛ばす曜日には当てはまらない
  assert.equal(before.isBusinessDay("2026-05-24"), true);
  assert.equal(before.isBusinessDay("2026-05-15"), true); // 普通の週末の前は当てはまらない
  // 祝日の翌日: Good Friday（4/3）から Easter Monday（4/6）までの塊が明けた 4/7（火）
  const after = createCalendar({
    holidays: england,
    closedRecurring: [{ dayAfterHoliday: true, skipWeekdays: [0, 6] }],
  });
  assert.equal(after.isBusinessDay("2026-04-07"), false);
  assert.equal(after.dayInfo("2026-04-04").rulePath, undefined); // 飛ばす曜日には当てはまらない
});

test("祝前日・祝日の翌日: skipWeekdays と keys は、塊の中で最も近い祝日で絞る", () => {
  // 2027 年のクリスマス（土）と Boxing Day（日）は、振替の 12/27（christmas）・12/28（boxing-day）になる
  const lastPosting = createCalendar({
    holidays: england,
    closedRecurring: [{ dayBeforeHoliday: true, keys: ["christmas"], skipWeekdays: [0, 6] }],
  });
  assert.equal(lastPosting.isBusinessDay("2027-12-24"), false);
  assert.equal(lastPosting.isBusinessDay("2027-12-23"), true);
  const afterEasterMonday = createCalendar({
    holidays: england,
    closedRecurring: [{ dayAfterHoliday: true, keys: ["easter-monday"], skipWeekdays: [0, 6] }],
  });
  const afterGoodFriday = createCalendar({
    holidays: england,
    closedRecurring: [{ dayAfterHoliday: true, keys: ["good-friday"], skipWeekdays: [0, 6] }],
  });
  assert.equal(afterEasterMonday.isBusinessDay("2026-04-07"), false);
  assert.equal(afterGoodFriday.isBusinessDay("2026-04-07"), true);
});

test("祝前日・祝日の翌日: 診断（絞り込みと飛ばす曜日の包含）", () => {
  assert.deepEqual(
    codes({
      holidays: england,
      closedRecurring: [
        { dayBeforeHoliday: true, skipWeekdays: [0, 6] },
        { dayBeforeHoliday: true, skipWeekdays: [0, 6], keys: ["christmas"] },
        { dayBeforeHoliday: true, keys: ["christmas"] },
      ],
    }),
    [["shadowed", "closedRecurring[1]", "closedRecurring[0]"]],
  );
  assert.deepEqual(
    codes({
      holidays: england,
      closedRecurring: [{ dayAfterHoliday: true, keys: ["no-such-key"] }],
    }),
    [["never-matches", "closedRecurring[0]", null]],
  );
});
