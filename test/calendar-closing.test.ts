import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  closingMonth,
  closingPeriod,
  createCalendar,
  isBizdaysError,
  monthOf,
  type BusinessDayConvention,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";

const office = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });

test("営業日を考慮した締め日: 締め日が休業日なら convention で調整した日が締め日", () => {
  // 2026-09-20 is a Sunday. "preceding" closes on 9/18 (Fri), "following" on 9/21 (Mon)
  assert.equal(office.closingMonth("2026-09-18", 20, { convention: "preceding" }), "2026-09");
  assert.equal(
    office.closingMonth("2026-09-19", 20, { convention: "preceding" }),
    "2026-10",
    "9/19 は 9/18 締めの翌日なので 10 月分",
  );
  assert.equal(closingMonth("2026-09-19", 20), "2026-09", "暦日の締めでは 9 月分");
  assert.equal(
    office.closingMonth("2026-09-24", 20, { convention: "following" }),
    "2026-09",
    "9/24 締めなので 9 月分",
  );
  assert.equal(office.closingMonth("2026-09-25", 20, { convention: "following" }), "2026-10");
  assert.deepEqual(office.closingPeriod("2026-10", 20, { convention: "preceding" }), {
    from: "2026-09-19",
    to: "2026-10-20",
  });
  assert.deepEqual(office.closingPeriod("2026-09", 20, { convention: "preceding" }), {
    from: "2026-08-21",
    to: "2026-09-18",
  });
  assert.deepEqual(office.closingPeriod("2026-10", 20, { convention: "following" }), {
    from: "2026-09-25",
    to: "2026-10-20",
  });
  // A date, a date-time string, a Date or a Temporal value gives the period that day (the calendar date in the
  // calendar's time zone) belongs to. A month is "YYYY-MM" only
  for (const input of [
    "2026-09-19",
    "2026-09-19T10:00",
    "2026-09-19T10:00:00+09:00",
    new Date("2026-09-19T01:00:00Z"),
    { year: 2026, month: 9, day: 19 },
  ]) {
    assert.deepEqual(
      office.closingPeriod(input, 20, { convention: "preceding" }),
      { from: "2026-09-19", to: "2026-10-20" },
      String(input),
    );
  }
  // A broken string with one hyphen is a wrong month (read like the root closingPeriod. decisions.md #8)
  assert.throws(
    () => office.closingPeriod("2026-9", 20, { convention: "preceding" }),
    (e: unknown) => isBizdaysError(e) && e.code === "invalid-month",
  );
  // A date gives the period that day belongs to
  assert.deepEqual(office.closingPeriod("2026-09-19", 20, { convention: "preceding" }), {
    from: "2026-09-19",
    to: "2026-10-20",
  });
  // Closing on the last day and the reading of a missing day (closing on the 31st in February) happen in the
  // same one place as for the calendar-date functions
  assert.deepEqual(
    office.closingPeriod("2026-03", 31, { convention: "preceding" }),
    { from: "2026-02-28", to: "2026-03-31" },
    "2 月の締めは 2/28（土）→ 2/27（金）。3/31 は火曜",
  );
  assert.ok(Object.isFrozen(office.closingPeriod("2026-10", 20, { convention: "preceding" })));
  // Wrong inputs
  for (const fn of [
    () => office.closingMonth("2026-09-21", 0, { convention: "preceding" }),
    () => office.closingPeriod("2026-09", 32, { convention: "preceding" }),
    () => office.closingMonth("2026-09-21", 20, { convention: "nearest" as never }),
    () => office.closingPeriod("2026-09", 20, {} as never),
  ]) {
    assert.throws(fn, (e: unknown) => isBizdaysError(e) && e.code === "invalid-argument");
  }
  assert.throws(
    () => office.closingPeriod("2026-13", 20, { convention: "preceding" }),
    (e: unknown) => isBizdaysError(e) && e.code === "invalid-month",
  );
});

test("営業日を考慮した締め日: 長期休業で固有の期間がない月は no-business-day、その日は次の月に属する", () => {
  // Closed from 2026-12-15 to 2027-02-10 (renovation). Closing on the 20th, "preceding"
  const reno = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedDates: [{ from: "2026-12-15", to: "2027-02-10" }],
  });
  const opts = { convention: "preceding" } as const;
  assert.deepEqual(
    reno.closingPeriod("2026-12", 20, opts),
    { from: "2026-11-21", to: "2026-12-14" },
    "12 月の締め日は 12/14（月）",
  );
  assert.throws(
    () => reno.closingPeriod("2027-01", 20, opts),
    (e: unknown) =>
      isBizdaysError(e) &&
      e.code === "no-business-day" &&
      /2027-01 has no closing period/.test(e.message),
    "1 月は 12/14 から 1/20 までに営業日がない",
  );
  assert.deepEqual(
    reno.closingPeriod("2027-02", 20, opts),
    { from: "2026-12-15", to: "2027-02-19" },
    "1 月分は 2 月分に吸収される",
  );
  assert.equal(
    reno.closingMonth("2027-01-10", 20, opts),
    "2027-02",
    "closingMonth は空の月を返さない",
  );
  assert.deepEqual(reno.closingPeriod("2027-01-10", 20, opts), {
    from: "2026-12-15",
    to: "2027-02-19",
  });
  // With "following" the closing day of December moves past the closure to 2/12 (2/11 is National Foundation Day)
  const fol = { convention: "following" } as const;
  assert.deepEqual(reno.closingPeriod("2026-12", 20, fol), {
    from: "2026-11-21",
    to: "2027-02-12",
  });
  assert.equal(reno.closingMonth("2027-01-24", 20, fol), "2026-12");
  assert.throws(
    () => reno.closingPeriod("2027-01", 20, fol),
    (e: unknown) => isBizdaysError(e) && e.code === "no-business-day",
  );
});

test("営業日を考慮した締め日: 空でない期間を順に並べると隙間も重なりもなく敷き詰められ、closingMonth と往復する", () => {
  const calendars = [
    office,
    createCalendar({
      holidayProvider: jp,
      closedWeekdays: [0, 6],
      closedDates: [{ from: "2026-12-15", to: "2027-02-10" }],
    }),
    createCalendar({
      holidayProvider: jp,
      closedWeekdays: [0],
      closedAnnualDates: [
        { from: "12-29", to: "01-03" },
        { from: "08-10", to: "08-20" },
      ],
    }),
  ];
  const conventions: BusinessDayConvention[] = [
    "following",
    "preceding",
    "modified-following",
    "modified-preceding",
  ];
  for (const cal of calendars) {
    for (const convention of conventions) {
      for (const closingDay of [1, 15, 20, 28, 29, 30, 31, -1]) {
        let month = "2026-01";
        let previousTo: string | null = null;
        for (let k = 0; k < 30; k++) {
          let period: { from: string; to: string } | undefined;
          try {
            period = cal.closingPeriod(month, closingDay, { convention });
          } catch (e) {
            assert.ok(
              isBizdaysError(e) && e.code === "no-business-day",
              `${month} ${closingDay} ${convention}`,
            );
          }
          if (period) {
            if (previousTo !== null)
              assert.equal(
                addDays(previousTo, 1),
                period.from,
                `${month} の締め日 ${closingDay}（${convention}）: 前の期間と隙間なく続く`,
              );
            assert.ok(period.from <= period.to);
            for (const d of [
              period.from,
              period.to,
              addDays(period.from, 3),
              addDays(period.to, -3),
            ]) {
              if (d >= period.from && d <= period.to) {
                assert.equal(
                  cal.closingMonth(d, closingDay, { convention }),
                  month,
                  `${d} は ${month} 分（締め日 ${closingDay}・${convention}）`,
                );
              }
            }
            previousTo = period.to;
          }
          month = monthOf(month, 1);
        }
      }
    }
  }
});

test("closingPeriod の月と暦日の読み分け: 形の崩れた文字列の code は、ルートの関数とメソッドで同じ（ハイフンで区切った部分が 3 つ以上なら暦日、それ以外は月。decisions.md の 8 番）", () => {
  const calendar = createCalendar();
  const codeOf = (f: () => unknown): unknown => {
    try {
      return JSON.stringify(f());
    } catch (e) {
      assert.ok(isBizdaysError(e), String(e));
      return e.code;
    }
  };
  // Broken month forms (fewer than 2 hyphens), broken date forms (3 or more), and correct months and dates
  const cases: [string, string][] = [
    ["2026-1", "invalid-month"],
    ["2026-001", "invalid-month"],
    ["202611", "invalid-month"],
    ["2026/11", "invalid-month"],
    ["2026/11/05", "invalid-month"],
    ["26-11", "invalid-month"],
    ["2026", "invalid-month"],
    ["", "invalid-month"],
    ["2026-13", "invalid-month"],
    ["2026-11-31", "invalid-date"],
    ["2026-1-5", "invalid-date"],
    ["2026-11-05-01", "invalid-date"],
    ["2026-11", '{"from":"2026-10-21","to":"2026-11-20"}'],
    ["2026-11-05", '{"from":"2026-10-21","to":"2026-11-20"}'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(
      codeOf(() => closingPeriod(input as never, 20)),
      expected,
      `関数 ${input}`,
    );
    assert.equal(
      codeOf(() => calendar.closingPeriod(input as never, 20, { convention: "following" })),
      expected,
      `メソッド ${input}`,
    );
  }
  // A date-time string is read as a calendar date by the methods (the root functions accept date strings only)
  assert.equal(
    codeOf(() => calendar.closingPeriod("2026-11-05T10:00-05:00", 20, { convention: "following" })),
    '{"from":"2026-10-21","to":"2026-11-20"}',
  );
  assert.equal(
    codeOf(() => closingPeriod("2026-11-05T10:00-05:00" as never, 20)),
    "invalid-date",
  );
});
