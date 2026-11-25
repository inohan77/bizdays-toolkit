// Unit tests of the functions of src/core/calendar.ts that work on a per-day judgement (CalendarCore): searches,
// adjustment, closing months, nth business days. One describe per function, named after the function; each test
// is one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addBusinessDaysTo,
  adjustDate,
  businessDatesIn,
  businessDaysOfMonth,
  closingDate,
  closingMonthOf,
  closingPeriodOfMonth,
  countOpen,
  dueDateOf,
  noBusinessDay,
  nthOfMonth,
  searchDay,
  searchInMonth,
  startAfterCutoff,
  type CalendarCore,
} from "../../../src/core/calendar.ts";
import { weekdayOf } from "../../../src/core/date.ts";
import { dayNumberOf } from "../../../src/core/schedule.ts";

/** A judgement: weekends and the listed dates are closed; `seen` records the evaluated dates */
function core(
  closed: readonly string[] = [],
  searchDayLimit = 366,
): CalendarCore & { seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    searchDayLimit,
    isOpen: (date) => {
      seen.push(date);
      return weekdayOf(date) % 6 !== 0 && !closed.includes(date);
    },
  };
}
/** A judgement in which only the listed dates are open */
const onlyOpen = (open: readonly string[], searchDayLimit = 366): CalendarCore => ({
  searchDayLimit,
  isOpen: (date) => open.includes(date),
});
/** A judgement that throws on a date */
const throwingOn = (bad: string): CalendarCore => ({
  searchDayLimit: 366,
  isOpen: (date) => {
    if (date === bad) throw new RangeError("boom");
    return weekdayOf(date) % 6 !== 0;
  },
});
/** Every day of a month */
const monthDays = (month: string, days: number): string[] =>
  Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
const following = { convention: "following" } as const;
const preceding = { convention: "preceding" } as const;

// November 2026: the 1st is a Sunday; weekdays 2-6, 9-13, 16-20, 23-27, 30

describe("noBusinessDay", () => {
  test("a no-business-day RangeError that names the limit and the start", () => {
    const error = noBusinessDay(core([], 30), "2026-11-07");
    assert.ok(error instanceof RangeError);
    assert.equal((error as unknown as { code: string }).code, "no-business-day");
    assert.equal(error.message, "No business day found within 30 days from 2026-11-07");
  });
});

describe("searchDay", () => {
  test("the start itself when it has the wanted status", () => {
    assert.equal(searchDay(core(), "2026-11-06", 1), "2026-11-06");
    assert.equal(searchDay(core(), "2026-11-07", 1, false), "2026-11-07");
  });
  test("the first business day forward or backward", () => {
    assert.equal(searchDay(core(), "2026-11-07", 1), "2026-11-09");
    assert.equal(searchDay(core(), "2026-11-07", -1), "2026-11-06");
    assert.equal(searchDay(core(["2026-11-09"]), "2026-11-07", 1), "2026-11-10");
  });
  test("with open false, the first closed day", () => {
    assert.equal(searchDay(core(), "2026-11-04", 1, false), "2026-11-07");
    assert.equal(searchDay(core(), "2026-11-04", -1, false), "2026-11-01");
  });
  test("exactly searchDayLimit days are examined, the start included", () => {
    const three = core([], 3);
    assert.equal(searchDay(three, "2026-11-07", 1), "2026-11-09");
    assert.deepEqual(three.seen, ["2026-11-07", "2026-11-08", "2026-11-09"]);
    const two = core([], 2);
    assert.throws(() => searchDay(two, "2026-11-07", 1), {
      name: "RangeError",
      code: "no-business-day",
    });
    assert.deepEqual(two.seen, ["2026-11-07", "2026-11-08"]);
  });
  test("no-closed-day when no closed day is found within the limit", () => {
    assert.throws(() => searchDay(core([], 5), "2026-11-02", 1, false), {
      name: "RangeError",
      code: "no-closed-day",
      message: "No closed day found within 5 days from 2026-11-02",
    });
  });
  test("out-of-range when the search leaves the years 1000-9999", () => {
    assert.throws(() => searchDay(onlyOpen([]), "9999-12-30", 1), {
      name: "RangeError",
      code: "out-of-range",
    });
    assert.throws(() => searchDay(onlyOpen([]), "1000-01-02", -1), { code: "out-of-range" });
  });
  test("an error of isOpen is passed on", () => {
    assert.throws(() => searchDay(throwingOn("2026-11-08"), "2026-11-07", 1), { message: "boom" });
  });
});

describe("countOpen", () => {
  test("the business days from the first day number up to, not including, the last", () => {
    const from = dayNumberOf("2026-11-02");
    assert.equal(countOpen(core(), from, from + 7), 5);
    assert.equal(countOpen(core(), from, from + 5), 5);
    assert.equal(countOpen(core(), from, from + 4), 4);
    assert.equal(countOpen(core(["2026-11-03"]), from, from + 7), 4);
  });
  test("0 for an empty range", () => {
    const from = dayNumberOf("2026-11-02");
    assert.equal(countOpen(core(), from, from), 0);
    assert.equal(countOpen(core(), from, from - 3), 0);
  });
});

describe("searchInMonth", () => {
  test("the first business day from the start in the direction, the start included", () => {
    assert.equal(searchInMonth(core(), "2026-11-06", 1, true), "2026-11-06");
    assert.equal(searchInMonth(core(), "2026-11-07", 1, true), "2026-11-09");
    assert.equal(searchInMonth(core(), "2026-11-07", -1, true), "2026-11-06");
  });
  test("undefined when the end of the month is reached; days outside the month are not evaluated", () => {
    // 2026-10-31 is a Saturday, 2026-11-01 a Sunday
    const forward = core();
    assert.equal(searchInMonth(forward, "2026-10-31", 1, true), undefined);
    assert.deepEqual(forward.seen, ["2026-10-31"]);
    const backward = core();
    assert.equal(searchInMonth(backward, "2026-11-01", -1, true), undefined);
    assert.deepEqual(backward.seen, ["2026-11-01"]);
  });
  test("limited: no-business-day after searchDayLimit days were examined inside the month", () => {
    const closed = monthDays("2026-11", 30);
    assert.throws(() => searchInMonth(core(closed, 5), "2026-11-03", 1, true), {
      name: "RangeError",
      code: "no-business-day",
      message: "No business day found within 5 days from 2026-11-03",
    });
    // The 3rd to the 6th are closed and the 7th and 8th are a weekend: the 9th is the seventh day examined
    const week = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
    assert.equal(searchInMonth(core(week, 7), "2026-11-03", 1, true), "2026-11-09");
    assert.throws(() => searchInMonth(core(week, 6), "2026-11-03", 1, true), {
      code: "no-business-day",
    });
  });
  test("not limited: the whole rest of the month is examined", () => {
    const closed = monthDays("2026-11", 29);
    assert.equal(searchInMonth(core(closed, 5), "2026-11-03", 1, false), "2026-11-30");
    assert.equal(
      searchInMonth(core(monthDays("2026-11", 30), 5), "2026-11-03", 1, false),
      undefined,
    );
  });
  test("an error of isOpen is passed on", () => {
    assert.throws(() => searchInMonth(throwingOn("2026-11-08"), "2026-11-07", 1, true), {
      message: "boom",
    });
  });
});

describe("adjustDate", () => {
  test("the date itself when it is a business day, with every convention", () => {
    for (const convention of [
      "following",
      "preceding",
      "modified-following",
      "modified-preceding",
    ] as const)
      assert.equal(adjustDate(core(), "2026-11-06", { convention }), "2026-11-06");
  });
  test("following: the next business day; preceding: the previous one", () => {
    assert.equal(adjustDate(core(), "2026-11-07", following), "2026-11-09");
    assert.equal(adjustDate(core(), "2026-11-07", preceding), "2026-11-06");
    assert.equal(adjustDate(core(), "2026-10-31", following), "2026-11-02");
    assert.equal(adjustDate(core(), "2026-11-01", preceding), "2026-10-30");
  });
  test("modified-following: the next business day of the month, else the previous one of the month", () => {
    assert.equal(
      adjustDate(core(), "2026-11-07", { convention: "modified-following" }),
      "2026-11-09",
    );
    assert.equal(
      adjustDate(core(), "2026-10-31", { convention: "modified-following" }),
      "2026-10-30",
    );
  });
  test("modified-preceding: the previous business day of the month, else the next one of the month", () => {
    assert.equal(
      adjustDate(core(), "2026-11-07", { convention: "modified-preceding" }),
      "2026-11-06",
    );
    assert.equal(
      adjustDate(core(), "2026-11-01", { convention: "modified-preceding" }),
      "2026-11-02",
    );
  });
  test("modified conventions cross the month in their own direction when the month has no business day", () => {
    const closed = monthDays("2026-11", 30);
    assert.equal(
      adjustDate(core(closed), "2026-11-15", { convention: "modified-following" }),
      "2026-12-01",
    );
    assert.equal(
      adjustDate(core(closed), "2026-11-15", { convention: "modified-preceding" }),
      "2026-10-30",
    );
  });
  test("modified conventions: the first search is limited by searchDayLimit, the opposite one is not", () => {
    // Closed from the 10th to the end of the month: with a limit of 5 the forward search throws
    const closed = monthDays("2026-11", 30).slice(9);
    assert.throws(
      () => adjustDate(core(closed, 5), "2026-11-10", { convention: "modified-following" }),
      {
        code: "no-business-day",
      },
    );
    // Closed from the 1st to the 25th: the forward search ends at the end of the month within the limit
    const early = monthDays("2026-11", 25);
    assert.equal(
      adjustDate(core(early, 400), "2026-11-28", { convention: "modified-following" }),
      "2026-11-30",
    );
    // The backward search of modified-following is not limited: the 28th (a Saturday) goes back past 5 days
    const late = [
      "2026-11-30",
      "2026-11-27",
      "2026-11-26",
      "2026-11-25",
      "2026-11-24",
      "2026-11-23",
    ];
    assert.equal(
      adjustDate(core(late, 3), "2026-11-28", { convention: "modified-following" }),
      "2026-11-20",
    );
  });
  test("invalid-argument for a missing or unknown convention, before the date is judged", () => {
    const c = core();
    for (const options of [undefined, {}, { convention: "nearest" }, { convention: null }])
      assert.throws(() => adjustDate(c, "2026-11-07", options as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
    assert.deepEqual(c.seen, []);
  });
  test("the errors of the search", () => {
    assert.throws(() => adjustDate(onlyOpen([], 10), "2026-11-07", following), {
      code: "no-business-day",
    });
    assert.throws(() => adjustDate(onlyOpen([]), "9999-12-31", following), {
      code: "out-of-range",
    });
  });
});

describe("closingDate", () => {
  test("the closing day of the month, adjusted to a business day", () => {
    assert.equal(closingDate(core(), { year: 2026, month: 11 }, 20, following), "2026-11-20");
    assert.equal(closingDate(core(), { year: 2026, month: 11 }, 15, following), "2026-11-16");
    assert.equal(closingDate(core(), { year: 2026, month: 11 }, 15, preceding), "2026-11-13");
  });
  test("-1 and a day beyond the end of the month are the last day of the month", () => {
    assert.equal(closingDate(core(), { year: 2026, month: 11 }, -1, following), "2026-11-30");
    assert.equal(closingDate(core(), { year: 2026, month: 2 }, 31, preceding), "2026-02-27");
    assert.equal(closingDate(core(), { year: 2026, month: 2 }, 31, following), "2026-03-02");
  });
});

describe("closingMonthOf", () => {
  test("the earliest month whose adjusted closing date is on or after the date", () => {
    assert.deepEqual(closingMonthOf(core(), "2026-11-20", 20, following), {
      year: 2026,
      month: 11,
    });
    assert.deepEqual(closingMonthOf(core(), "2026-11-21", 20, following), {
      year: 2026,
      month: 12,
    });
    // December 20 is a Sunday: the closing date of December is the 21st
    assert.deepEqual(closingMonthOf(core(), "2026-12-21", 20, following), {
      year: 2026,
      month: 12,
    });
    assert.deepEqual(closingMonthOf(core(), "2026-12-22", 20, following), { year: 2027, month: 1 });
  });
  test("following: a day after the calendar closing day still belongs to the month whose closing date moved forward", () => {
    // The 15th is a Sunday: the closing date is the 16th
    assert.deepEqual(closingMonthOf(core(), "2026-11-16", 15, following), {
      year: 2026,
      month: 11,
    });
    assert.deepEqual(closingMonthOf(core(), "2026-11-17", 15, following), {
      year: 2026,
      month: 12,
    });
  });
  test("preceding: a day after the moved closing date belongs to the next month", () => {
    // The closing date is the 13th
    assert.deepEqual(closingMonthOf(core(), "2026-11-13", 15, preceding), {
      year: 2026,
      month: 11,
    });
    assert.deepEqual(closingMonthOf(core(), "2026-11-14", 15, preceding), {
      year: 2026,
      month: 12,
    });
    assert.deepEqual(closingMonthOf(core(), "2026-11-15", 15, preceding), {
      year: 2026,
      month: 12,
    });
  });
  test("a closing date moved past a long closure into a later month takes the days up to it", () => {
    // Closed from October 20 to November 25: the closing date of October (the 20th) is November 26
    const closed = [...monthDays("2026-10", 31).slice(19), ...monthDays("2026-11", 25)];
    assert.deepEqual(closingMonthOf(core(closed), "2026-11-26", 20, following), {
      year: 2026,
      month: 10,
    });
    assert.deepEqual(closingMonthOf(core(closed), "2026-11-27", 20, following), {
      year: 2026,
      month: 12,
    });
  });
  test("invalid-argument for an invalid closing day, and the errors of the adjustment", () => {
    assert.throws(() => closingMonthOf(core(), "2026-11-20", 0, following), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.throws(() => closingMonthOf(core(), "2026-11-20", 20, {} as never), {
      code: "invalid-argument",
    });
    assert.throws(() => closingMonthOf(onlyOpen([], 10), "2026-11-20", 20, following), {
      code: "no-business-day",
    });
  });
});

describe("closingPeriodOfMonth", () => {
  test("from the day after the previous month's closing date through the month's closing date, frozen", () => {
    const period = closingPeriodOfMonth(core(), { year: 2026, month: 11 }, 20, following);
    assert.deepEqual(period, { from: "2026-10-21", to: "2026-11-20" });
    assert.ok(Object.isFrozen(period));
    // The 15th of November is a Sunday: following moves both ends
    assert.deepEqual(closingPeriodOfMonth(core(), { year: 2026, month: 12 }, 15, following), {
      from: "2026-11-17",
      to: "2026-12-15",
    });
    assert.deepEqual(closingPeriodOfMonth(core(), { year: 2026, month: 11 }, 15, preceding), {
      from: "2026-10-16",
      to: "2026-11-13",
    });
  });
  test("no-business-day when the month has no days of its own", () => {
    // Closed from October 20 to November 25: October and November close on the same day
    const closed = [...monthDays("2026-10", 31).slice(19), ...monthDays("2026-11", 25)];
    assert.throws(
      () => closingPeriodOfMonth(core(closed), { year: 2026, month: 11 }, 20, following),
      {
        name: "RangeError",
        code: "no-business-day",
      },
    );
    assert.deepEqual(closingPeriodOfMonth(core(closed), { year: 2026, month: 12 }, 20, following), {
      from: "2026-11-27",
      to: "2026-12-21",
    });
  });
});

describe("businessDaysOfMonth", () => {
  test("the business days of the month in date order, in a new array", () => {
    const days = businessDaysOfMonth(core(["2026-02-11"]), "2026-02");
    assert.equal(days.length, 19);
    assert.equal(days[0], "2026-02-02");
    assert.equal(days.at(-1), "2026-02-27");
    assert.equal(days.includes("2026-02-11"), false);
    assert.equal(Object.isFrozen(days), false);
    assert.deepEqual(businessDaysOfMonth(onlyOpen([]), "2026-02"), []);
  });
  test("only the days of the month are evaluated", () => {
    const c = core();
    businessDaysOfMonth(c, "2024-02");
    assert.equal(c.seen.length, 29);
    assert.equal(c.seen[0], "2024-02-01");
    assert.equal(c.seen.at(-1), "2024-02-29");
  });
  test("invalid-month, and an error of isOpen is passed on", () => {
    assert.throws(() => businessDaysOfMonth(core(), "2026-13"), {
      name: "RangeError",
      code: "invalid-month",
    });
    assert.throws(() => businessDaysOfMonth(core(), "2026-02-01"), { code: "invalid-month" });
    assert.throws(() => businessDaysOfMonth(throwingOn("2026-11-08"), "2026-11"), {
      message: "boom",
    });
  });
});

describe("nthOfMonth", () => {
  test("the n-th business day; a negative n counts from the end", () => {
    assert.equal(nthOfMonth(core(), "2026-11", 1), "2026-11-02");
    assert.equal(nthOfMonth(core(), "2026-11", 5), "2026-11-06");
    assert.equal(nthOfMonth(core(), "2026-11", 21), "2026-11-30");
    assert.equal(nthOfMonth(core(), "2026-11", -1), "2026-11-30");
    assert.equal(nthOfMonth(core(), "2026-11", -21), "2026-11-02");
  });
  test("invalid-argument when n is 0 or not an integer", () => {
    for (const n of [0, 1.5, Number.NaN, "1", null])
      assert.throws(() => nthOfMonth(core(), "2026-11", n as never), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("invalid-month for an invalid month", () => {
    assert.throws(() => nthOfMonth(core(), "2026-00", 1), { code: "invalid-month" });
  });
  test("no-business-day when the month has fewer business days", () => {
    assert.throws(() => nthOfMonth(core(), "2026-11", 22), {
      name: "RangeError",
      code: "no-business-day",
      message: "2026-11 has 21 business day(s); requested #22",
    });
    assert.throws(() => nthOfMonth(core(), "2026-11", -22), {
      code: "no-business-day",
      message: "2026-11 has 21 business day(s); requested last #22",
    });
  });
});

describe("startAfterCutoff", () => {
  test("the input's date without a cutoff", () => {
    assert.equal(startAfterCutoff({ date: "2026-11-06", minutes: 1000 }, undefined), "2026-11-06");
    assert.equal(startAfterCutoff({ date: "2026-11-06", minutes: null }, undefined), "2026-11-06");
  });
  test("the next day when the input's time is at or after the cutoff", () => {
    assert.equal(startAfterCutoff({ date: "2026-11-06", minutes: 899 }, "15:00"), "2026-11-06");
    assert.equal(startAfterCutoff({ date: "2026-11-06", minutes: 900 }, "15:00"), "2026-11-07");
    assert.equal(startAfterCutoff({ date: "2026-11-06", minutes: 901 }, "15:00"), "2026-11-07");
    assert.equal(startAfterCutoff({ date: "2026-12-31", minutes: 0 }, "00:00"), "2027-01-01");
  });
  test("the start of the input's minute is compared: with seconds in the cutoff, the same minute is before it", () => {
    assert.equal(startAfterCutoff({ date: "2026-11-06", minutes: 900 }, "15:00:30"), "2026-11-06");
    assert.equal(startAfterCutoff({ date: "2026-11-06", minutes: 901 }, "15:00:30"), "2026-11-07");
  });
  test("invalid-time for a wrong cutoff", () => {
    for (const cutoff of ["15", "25:00", 900, null])
      assert.throws(() => startAfterCutoff({ date: "2026-11-06", minutes: 900 }, cutoff), {
        name: "RangeError",
        code: "invalid-time",
      });
  });
  test("invalid-argument for a cutoff with a date-only input", () => {
    assert.throws(() => startAfterCutoff({ date: "2026-11-06", minutes: null }, "15:00"), {
      name: "RangeError",
      code: "invalid-argument",
    });
  });
});

describe("addBusinessDaysTo", () => {
  test("0: the first business day on or after the start", () => {
    assert.equal(addBusinessDaysTo(core(), "2026-11-06", 0), "2026-11-06");
    assert.equal(addBusinessDaysTo(core(), "2026-11-07", 0), "2026-11-09");
  });
  test("n business days after the start", () => {
    assert.equal(addBusinessDaysTo(core(), "2026-11-06", 1), "2026-11-09");
    assert.equal(addBusinessDaysTo(core(), "2026-11-07", 1), "2026-11-09");
    assert.equal(addBusinessDaysTo(core(), "2026-11-02", 5), "2026-11-09");
    assert.equal(addBusinessDaysTo(core(["2026-11-03"]), "2026-11-02", 5), "2026-11-10");
  });
  test("|n| business days before the start for a negative n", () => {
    assert.equal(addBusinessDaysTo(core(), "2026-11-09", -1), "2026-11-06");
    assert.equal(addBusinessDaysTo(core(), "2026-11-08", -1), "2026-11-06");
    assert.equal(addBusinessDaysTo(core(), "2026-11-09", -5), "2026-11-02");
  });
  test("the errors of the search", () => {
    assert.throws(() => addBusinessDaysTo(onlyOpen(["2026-11-02"], 10), "2026-11-02", 1), {
      name: "RangeError",
      code: "no-business-day",
    });
    assert.throws(() => addBusinessDaysTo(onlyOpen([], 10), "2026-11-02", 0), {
      code: "no-business-day",
    });
  });
});

describe("businessDatesIn", () => {
  test("the business days of the period, both ends inclusive, frozen and in date order", () => {
    const dates = businessDatesIn(core(["2026-11-04"]), "2026-11-02", "2026-11-09");
    assert.deepEqual(dates, ["2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06", "2026-11-09"]);
    assert.ok(Object.isFrozen(dates));
    assert.deepEqual(businessDatesIn(core(), "2026-11-06", "2026-11-06"), ["2026-11-06"]);
    assert.deepEqual(businessDatesIn(core(), "2026-11-07", "2026-11-08"), []);
  });
  test("invalid-range when the first day is after the last", () => {
    assert.throws(() => businessDatesIn(core(), "2026-11-09", "2026-11-02"), {
      name: "RangeError",
      code: "invalid-range",
    });
  });
  test("an error of isOpen is passed on", () => {
    assert.throws(() => businessDatesIn(throwingOn("2026-11-08"), "2026-11-02", "2026-11-09"), {
      message: "boom",
    });
  });
});

describe("dueDateOf", () => {
  test("the day of the month, adjusted by the convention", () => {
    assert.equal(
      dueDateOf(core(), "2026-11", { dayOfMonth: 10, convention: "following" }),
      "2026-11-10",
    );
    assert.equal(
      dueDateOf(core(), "2026-11", { dayOfMonth: 15, convention: "following" }),
      "2026-11-16",
    );
    assert.equal(
      dueDateOf(core(), "2026-11", { dayOfMonth: 15, convention: "preceding" }),
      "2026-11-13",
    );
  });
  test("-1 and a day the month lacks are the last day of the month", () => {
    assert.equal(
      dueDateOf(core(), "2026-11", { dayOfMonth: -1, convention: "following" }),
      "2026-11-30",
    );
    assert.equal(
      dueDateOf(core(), "2026-11", { dayOfMonth: 31, convention: "following" }),
      "2026-11-30",
    );
    assert.equal(
      dueDateOf(core(), "2026-02", { dayOfMonth: 31, convention: "modified-following" }),
      "2026-02-27",
    );
  });
  test("the old key day is read as dayOfMonth", () => {
    assert.equal(dueDateOf(core(), "2026-11", { day: 10, convention: "following" }), "2026-11-10");
    assert.throws(
      () => dueDateOf(core(), "2026-11", { day: 10, dayOfMonth: 11, convention: "following" }),
      {
        name: "RangeError",
        code: "invalid-option",
      },
    );
  });
  test("invalid-argument for options that are not an object and for a wrong dayOfMonth or convention", () => {
    for (const options of [undefined, null, "x", 10])
      assert.throws(() => dueDateOf(core(), "2026-11", options), {
        name: "RangeError",
        code: "invalid-argument",
      });
    for (const dayOfMonth of [0, 32, 1.5, "10", undefined])
      assert.throws(() => dueDateOf(core(), "2026-11", { dayOfMonth, convention: "following" }), {
        name: "RangeError",
        code: "invalid-argument",
      });
    assert.throws(() => dueDateOf(core(), "2026-11", { dayOfMonth: 10 }), {
      code: "invalid-argument",
    });
  });
  test("invalid-month for an invalid month", () => {
    assert.throws(() => dueDateOf(core(), "2026-13", { dayOfMonth: 10, convention: "following" }), {
      name: "RangeError",
      code: "invalid-month",
    });
  });
});
