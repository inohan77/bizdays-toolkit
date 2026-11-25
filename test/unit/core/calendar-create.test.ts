// Unit tests of the functions of src/core/calendar.ts that create and combine calendars. One describe per
// function, named after the function; each test is one statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  adjustOptions,
  buildCalendar,
  checkCombineArguments,
  combineCalendars,
  combinedDayInfo,
  combinedOpen,
  compileCalendarOptions,
  createCalendar,
  createCalendarFromSchedule,
  dayInfoFromScheduleDay,
  isCalendarLike,
  mergeHolidayLists,
  optionsObject,
  type DayInfo,
} from "../../../src/core/calendar.ts";
import { weekdayOf } from "../../../src/core/date.ts";
import { InternalError, IssueCollector } from "../../../src/core/errors.ts";
import { createHolidayLookup, createSchedule } from "../../../src/core/schedule.ts";
import type { Holiday, HolidayProvider } from "../../../src/core/types.ts";

/** A provider of 2025-2027 whose only holidays are January 1 and, in 2026, November 3 */
const provider: HolidayProvider = Object.freeze({
  id: "T",
  timeZone: "UTC",
  supportedYears: Object.freeze({ from: 2025, to: 2027 }),
  dataVersion: "1",
  holidaysInYear: (year: number): readonly Holiday[] =>
    Object.freeze(
      [`${year}-01-01`, ...(year === 2026 ? ["2026-11-03"] : [])].map((date) =>
        Object.freeze({
          date,
          name: `H ${date}`,
          nameEn: `H ${date}`,
          kind: "regular",
          confirmed: true,
        }),
      ),
    ),
});
const issues = (c: IssueCollector): string[] =>
  c.issues.map((i) => `${i.severity} ${i.code} ${i.path}`);
const weekend = { closedWeekdays: [0, 6] } as const;

describe("compileCalendarOptions", () => {
  test("undefined and an invalid-option error when the options are not an options object", () => {
    for (const options of [null, undefined, "x", [], new Map()]) {
      const c = new IssueCollector();
      assert.equal(compileCalendarOptions(c, options), undefined);
      assert.deepEqual(issues(c), ["error invalid-option "]);
    }
  });
  test("empty options: every weekday open, holidays closed, searchDayLimit 3660, no rules", () => {
    const c = new IssueCollector();
    const compiled = compileCalendarOptions(c, {})!;
    assert.deepEqual(issues(c), []);
    assert.deepEqual(compiled.schedule.weekly, [true, true, true, true, true, true, true]);
    assert.ok(Object.isFrozen(compiled.schedule.weekly));
    assert.deepEqual(compiled.schedule.holiday, { value: false });
    assert.equal(compiled.searchDayLimit, 3660);
    assert.deepEqual(
      [compiled.schedule.annual, compiled.schedule.dates, compiled.schedule.recurring].map(
        (x) => x.length,
      ),
      [0, 0, 0],
    );
  });
  test("closedWeekdays close their weekdays", () => {
    const c = new IssueCollector();
    assert.deepEqual(compileCalendarOptions(c, { closedWeekdays: [0, 6, 6] })!.schedule.weekly, [
      false,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    assert.deepEqual(issues(c), []);
  });
  test("closedWeekdays: invalid-option when not an array; invalid-weekday per wrong element, a hole included", () => {
    const c = new IssueCollector();
    compileCalendarOptions(c, { closedWeekdays: "0,6" });
    assert.deepEqual(issues(c), ["error invalid-option closedWeekdays"]);
    const d = new IssueCollector();
    // eslint-disable-next-line no-sparse-arrays
    compileCalendarOptions(d, { closedWeekdays: [0, 7, , "1", 1.5] });
    assert.deepEqual(issues(d), [
      "error invalid-weekday closedWeekdays[1]",
      "error invalid-weekday closedWeekdays[2]",
      "error invalid-weekday closedWeekdays[3]",
      "error invalid-weekday closedWeekdays[4]",
    ]);
  });
  test("holidayPolicy: closed, open and ignore; anything else, null included, is invalid-option", () => {
    const policy = (holidayPolicy: unknown) => {
      const c = new IssueCollector();
      return [compileCalendarOptions(c, { holidayPolicy })!.schedule.holiday, issues(c)];
    };
    assert.deepEqual(policy("closed"), [{ value: false }, []]);
    assert.deepEqual(policy(undefined), [{ value: false }, []]);
    assert.deepEqual(policy("open"), [{ value: true }, []]);
    assert.deepEqual(policy("ignore"), ["ignore", []]);
    assert.deepEqual(policy(null)[1], ["error invalid-option holidayPolicy"]);
    assert.deepEqual(policy("weekday")[1], ["error invalid-option holidayPolicy"]);
  });
  test("searchDayLimit: a positive integer; otherwise invalid-option and 3660", () => {
    const limit = (searchDayLimit: unknown) => {
      const c = new IssueCollector();
      return [compileCalendarOptions(c, { searchDayLimit })!.searchDayLimit, issues(c)];
    };
    assert.deepEqual(limit(10), [10, []]);
    assert.deepEqual(limit(1), [1, []]);
    for (const value of [0, -1, 1.5, "10", null])
      assert.deepEqual(limit(value)[1], ["error invalid-option searchDayLimit"], String(value));
    assert.equal(limit(1.5)[0], 3660);
    assert.equal(limit(0)[0], 0);
  });
  test("open dates come before closed dates, and open recurring rules before closed recurring rules", () => {
    const c = new IssueCollector();
    const { schedule } = compileCalendarOptions(c, {
      closedDates: ["2026-11-09"],
      openDates: ["2026-11-07"],
      closedRecurringRules: [{ weekday: 3 }],
      openRecurringRules: [{ weekday: 6, nth: [1] }],
      closedAnnualDates: [{ date: "12-31" }],
    })!;
    assert.deepEqual(
      schedule.dates.map((d) => [d.path, d.value]),
      [
        ["openDates[0]", true],
        ["closedDates[0]", false],
      ],
    );
    assert.deepEqual(
      schedule.recurring.map((r) => [r.path, r.value]),
      [
        ["openRecurringRules[0]", true],
        ["closedRecurringRules[0]", false],
      ],
    );
    assert.deepEqual(
      schedule.annual.map((a) => [a.path, a.value]),
      [["closedAnnualDates[0]", false]],
    );
    assert.deepEqual(issues(c), []);
  });
  test("unknown keys get unknown-option warnings; renamed keys are read with deprecated-option warnings", () => {
    const c = new IssueCollector();
    const compiled = compileCalendarOptions(c, {
      maxSearchDays: 10,
      closedRecurring: [{ weekday: 3 }],
      zzz: 1,
    })!;
    assert.equal(compiled.searchDayLimit, 10);
    assert.equal(compiled.schedule.recurring.length, 1);
    assert.deepEqual(issues(c).sort(), [
      "warning deprecated-option closedRecurring",
      "warning deprecated-option maxSearchDays",
      "warning unknown-option zzz",
    ]);
  });
  test("a result is returned even when errors were recorded", () => {
    const c = new IssueCollector();
    const compiled = compileCalendarOptions(c, {
      closedDates: ["2026-02-30"],
      closedWeekdays: [0],
    });
    assert.ok(c.hasErrors);
    assert.equal(compiled!.schedule.weekly[0], false);
  });
  test("an explicit undefined is an omission", () => {
    const c = new IssueCollector();
    const compiled = compileCalendarOptions(c, {
      closedWeekdays: undefined,
      holidayPolicy: undefined,
      searchDayLimit: undefined,
      closedDates: undefined,
    })!;
    assert.deepEqual(issues(c), []);
    assert.equal(compiled.searchDayLimit, 3660);
  });
});

describe("createCalendar", () => {
  test("without options: no weekday is closed", () => {
    const calendar = createCalendar();
    assert.ok(Object.isFrozen(calendar));
    assert.equal(calendar.isBusinessDay("2026-11-07"), true);
    assert.equal(calendar.isBusinessDay("2026-11-08"), true);
  });
  test("holidays and the closing rules decide business days", () => {
    const calendar = createCalendar({
      holidayProvider: provider,
      closedWeekdays: [0, 6],
      closedDates: ["2026-11-10"],
      openDates: ["2026-11-07"],
    });
    assert.equal(calendar.isBusinessDay("2026-11-02"), true);
    assert.equal(calendar.isBusinessDay("2026-11-03"), false);
    assert.equal(calendar.isBusinessDay("2026-11-07"), true);
    assert.equal(calendar.isBusinessDay("2026-11-08"), false);
    assert.equal(calendar.isBusinessDay("2026-11-10"), false);
    assert.equal(calendar.dayInfoOn("2026-11-03").reason, "holiday");
    assert.equal(calendar.dayInfoOn("2026-11-07").reason, "open-date");
    assert.equal(calendar.dayInfoOn("2026-11-02").reason, "default");
  });
  test("the options are copied at creation", () => {
    const closedDates = ["2026-11-10"];
    const calendar = createCalendar({ closedDates });
    closedDates.push("2026-11-11");
    assert.equal(calendar.isBusinessDay("2026-11-11"), true);
  });
  test("a RangeError with the code of the first invalid option and its path in the message", () => {
    assert.throws(() => createCalendar({ closedDates: ["2026-02-30"] }), {
      name: "RangeError",
      code: "invalid-date",
      message: /^closedDates\[0\]\.date: /,
    });
    assert.throws(() => createCalendar({ closedWeekdays: [7 as never] }), {
      code: "invalid-weekday",
    });
    assert.throws(() => createCalendar(null as never), { code: "invalid-option" });
    assert.throws(() => createCalendar({ searchDayLimit: 0 }), {
      code: "invalid-option",
      message: /^searchDayLimit: /,
    });
  });
});

describe("dayInfoFromScheduleDay", () => {
  const day = (reason: string, more: Record<string, unknown> = {}) =>
    ({ date: "2026-11-03", weekday: 2, value: true, reason, ...more }) as never;
  test("reason combines the schedule reason with open or closed", () => {
    const reason = (r: string, open: boolean, fromSchedule = false) =>
      dayInfoFromScheduleDay(day(r), open, fromSchedule).reason;
    assert.deepEqual([reason("date", true), reason("date", false)], ["open-date", "closed-date"]);
    assert.deepEqual(
      [reason("annual", true), reason("annual", false)],
      ["open-annual", "closed-annual"],
    );
    assert.deepEqual(
      [reason("recurring", true), reason("recurring", false)],
      ["open-recurring", "closed-recurring"],
    );
    assert.deepEqual([reason("holiday", true), reason("holiday", false)], ["holiday", "holiday"]);
    assert.deepEqual(
      [
        reason("weekday", true),
        reason("weekday", true, true),
        reason("weekday", false),
        reason("weekday", false, true),
      ],
      ["default", "open-weekday", "closed-weekday", "closed-weekday"],
    );
  });
  test("a frozen DayInfo: businessDay mirrors open, rulePath mirrors optionPath", () => {
    const holiday = {
      date: "2026-11-03",
      name: "H",
      nameEn: "H",
      kind: "regular",
      confirmed: true,
    };
    const info = dayInfoFromScheduleDay(
      day("recurring", {
        name: "N",
        holiday,
        shiftedFrom: "2026-11-01",
        optionPath: "closedRecurringRules[0]",
      }),
      false,
      false,
    );
    assert.ok(Object.isFrozen(info));
    assert.deepEqual(info, {
      date: "2026-11-03",
      weekday: 2,
      open: false,
      businessDay: false,
      reason: "closed-recurring",
      name: "N",
      holiday,
      shiftedFrom: "2026-11-01",
      optionPath: "closedRecurringRules[0]",
      rulePath: "closedRecurringRules[0]",
    });
  });
  test("optional properties are omitted when the schedule's day has none", () => {
    assert.deepEqual(Object.keys(dayInfoFromScheduleDay(day("date"), true, false)), [
      "date",
      "weekday",
      "open",
      "businessDay",
      "reason",
    ]);
  });
  test("name is omitted for a weekday reason", () => {
    const info = dayInfoFromScheduleDay(day("weekday", { name: "N" }), true, true);
    assert.equal("name" in info, false);
  });
  test("InternalError for an unknown schedule reason", () => {
    assert.throws(() => dayInfoFromScheduleDay(day("other"), true, false), InternalError);
  });
});

describe("buildCalendar", () => {
  const lookup = createHolidayLookup({
    providers: Object.freeze([provider]),
    providerIndexes: Object.freeze([0]),
    timeZone: "UTC",
    outOfRangePolicy: "throw",
    unconfirmedHolidayPolicy: "accept",
  } as never);
  const isOpen = (date: string): boolean => weekdayOf(date) % 6 !== 0 && !lookup.isHoliday(date);
  const info = (date: string): DayInfo =>
    Object.freeze({
      date,
      weekday: weekdayOf(date),
      open: isOpen(date),
      businessDay: isOpen(date),
      reason: "default",
    });
  const calendar = buildCalendar(lookup, isOpen, info, 30);
  // November 2026: the 1st is a Sunday and the 3rd a holiday
  test("a frozen calendar that exposes the members of the lookup unchanged", () => {
    assert.ok(Object.isFrozen(calendar));
    assert.equal(calendar.timeZone, "UTC");
    assert.equal(calendar.providers, lookup.providers);
    assert.equal(calendar.outOfRangePolicy, "throw");
    assert.equal(calendar.unconfirmedHolidayPolicy, "accept");
    assert.equal(calendar.outOfRange, "throw");
    assert.equal(calendar.unconfirmedHolidays, "accept");
    for (const key of [
      "dateOf",
      "civilOf",
      "instantOf",
      "today",
      "isHoliday",
      "holidayOn",
      "holidaysInYear",
      "holidaysBetween",
    ] as const)
      assert.equal(calendar[key], lookup[key], key);
    assert.equal(calendar.getHoliday, lookup.holidayOn);
  });
  test("dayInfoOn, dayInfo and daysBetween return the DayInfo of the dates", () => {
    assert.deepEqual(calendar.dayInfoOn("2026-11-03"), info("2026-11-03"));
    assert.deepEqual(calendar.dayInfo(new Date("2026-11-03T12:00:00Z")), info("2026-11-03"));
    assert.deepEqual(
      calendar.daysBetween("2026-11-02", "2026-11-04").map((d) => d.date),
      ["2026-11-02", "2026-11-03", "2026-11-04"],
    );
  });
  test("isBusinessDay judges the calendar date of the input", () => {
    assert.equal(calendar.isBusinessDay("2026-11-02"), true);
    assert.equal(calendar.isBusinessDay("2026-11-03"), false);
    assert.equal(calendar.isBusinessDay(new Date("2026-11-02T23:59:00Z")), true);
  });
  test("next and previous business and closed days exclude the day itself", () => {
    assert.equal(calendar.nextBusinessDay("2026-11-02"), "2026-11-04");
    assert.equal(calendar.previousBusinessDay("2026-11-04"), "2026-11-02");
    assert.equal(calendar.nextClosedDay("2026-11-03"), "2026-11-07");
    assert.equal(calendar.previousClosedDay("2026-11-03"), "2026-11-01");
  });
  test("businessDayOnOrAfter and businessDayOnOrBefore include the day itself; cutoff moves the start", () => {
    assert.equal(calendar.businessDayOnOrAfter("2026-11-02"), "2026-11-02");
    assert.equal(calendar.businessDayOnOrAfter("2026-11-03"), "2026-11-04");
    assert.equal(calendar.businessDayOnOrBefore("2026-11-03"), "2026-11-02");
    assert.equal(
      calendar.businessDayOnOrAfter("2026-11-02T14:59", { cutoff: "15:00" }),
      "2026-11-02",
    );
    assert.equal(
      calendar.businessDayOnOrAfter("2026-11-02T15:00", { cutoff: "15:00" }),
      "2026-11-04",
    );
    assert.throws(() => calendar.businessDayOnOrAfter("2026-11-02", 1 as never), {
      code: "invalid-argument",
    });
  });
  test("addBusinessDays validates n; diffBusinessDays counts [from, to) and negates a reversed range without -0", () => {
    assert.equal(calendar.addBusinessDays("2026-11-02", 1), "2026-11-04");
    assert.throws(() => calendar.addBusinessDays("2026-11-02", 1.5), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.equal(calendar.diffBusinessDays("2026-11-02", "2026-11-09"), 4);
    assert.equal(calendar.diffBusinessDays("2026-11-09", "2026-11-02"), -4);
    assert.ok(Object.is(calendar.diffBusinessDays("2026-11-08", "2026-11-07"), 0));
    assert.equal(calendar.businessDaysBetween("2026-11-02", "2026-11-09"), 4);
  });
  test("businessDatesBetween and listBusinessDays list the business days of the period", () => {
    assert.deepEqual(calendar.businessDatesBetween("2026-11-01", "2026-11-05"), [
      "2026-11-02",
      "2026-11-04",
      "2026-11-05",
    ]);
    assert.deepEqual(calendar.listBusinessDays("2026-11-01", "2026-11-05"), [
      "2026-11-02",
      "2026-11-04",
      "2026-11-05",
    ]);
  });
  test("adjust needs options with a convention", () => {
    assert.equal(calendar.adjust("2026-11-03", { convention: "following" }), "2026-11-04");
    assert.equal(calendar.adjust("2026-11-03", { convention: "preceding" }), "2026-11-02");
    assert.throws(() => calendar.adjust("2026-11-03", undefined as never), {
      code: "invalid-argument",
    });
  });
  test("the nth, first and last business day of a month", () => {
    assert.equal(calendar.nthBusinessDayOfMonth("2026-11", 2), "2026-11-04");
    assert.equal(calendar.firstBusinessDayOfMonth("2026-11"), "2026-11-02");
    assert.equal(calendar.lastBusinessDayOfMonth("2026-11"), "2026-11-30");
  });
  test("closingMonth and closingPeriod check the closing day, then the options, then the input", () => {
    assert.equal(calendar.closingMonth("2026-11-16", 15, { convention: "following" }), "2026-11");
    assert.equal(calendar.closingMonth("2026-11-17", 15, { convention: "following" }), "2026-12");
    assert.deepEqual(calendar.closingPeriod("2026-11", 15, { convention: "following" }), {
      from: "2026-10-16",
      to: "2026-11-16",
    });
    assert.deepEqual(calendar.closingPeriod("2026-11-17", 15, { convention: "following" }), {
      from: "2026-11-17",
      to: "2026-12-15",
    });
    assert.deepEqual(
      calendar.closingPeriod(new Date("2026-11-17T00:00:00Z"), 15, { convention: "following" }),
      {
        from: "2026-11-17",
        to: "2026-12-15",
      },
    );
    for (const method of ["closingMonth", "closingPeriod"] as const) {
      assert.throws(() => calendar[method]("bad", 0, undefined as never), {
        code: "invalid-argument",
        message: /closingDayOfMonth/,
      });
      assert.throws(() => calendar[method]("bad-x-y", 15, undefined as never), {
        code: "invalid-argument",
        message: /options/,
      });
      assert.throws(() => calendar[method]("2026-02-30", 15, { convention: "following" }), {
        code: "invalid-date",
      });
    }
    assert.throws(() => calendar.closingPeriod("2026-13", 15, { convention: "following" }), {
      code: "invalid-month",
    });
  });
  test("dueDate adjusts the day of the month", () => {
    assert.equal(
      calendar.dueDate("2026-11", { dayOfMonth: 3, convention: "following" }),
      "2026-11-04",
    );
  });
  test("the search limit is the given number of days", () => {
    const closed = buildCalendar(lookup, () => false, info, 30);
    assert.throws(() => closed.nextBusinessDay("2026-11-02"), {
      code: "no-business-day",
      message: "No business day found within 30 days from 2026-11-03",
    });
  });
});

describe("optionsObject", () => {
  test("{} for undefined when not required", () => {
    assert.deepEqual(optionsObject(undefined, "x"), {});
  });
  test("a copy of the object without the properties that are undefined", () => {
    const options = { a: 1, b: undefined };
    const out = optionsObject(options, "x");
    assert.deepEqual(Object.keys(out), ["a"]);
    assert.notEqual(out, options);
  });
  test("rename is applied to the object before use", () => {
    assert.deepEqual(
      optionsObject({ old: 1 }, "x", (v) => ({ renamed: v["old"] })),
      { renamed: 1 },
    );
  });
  test("a RangeError with the code when the value is not an options object; the message names what", () => {
    for (const value of [null, 1, "x", [], new Date(0), new Map()])
      assert.throws(() => optionsObject(value, "the options"), {
        name: "RangeError",
        code: "invalid-argument",
        message: /^the options must be an object: /,
      });
    assert.throws(() => optionsObject(null, "x", undefined, false, "invalid-option"), {
      code: "invalid-option",
    });
  });
  test("required: undefined is reported too", () => {
    assert.throws(() => optionsObject(undefined, "x", undefined, true), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.deepEqual(optionsObject({}, "x", undefined, true), {});
  });
});

describe("adjustOptions", () => {
  test("the options object", () => {
    assert.deepEqual(
      adjustOptions({ convention: "following", other: undefined }, "adjust options"),
      {
        convention: "following",
      },
    );
  });
  test("invalid-argument when it is not an options object, undefined included", () => {
    for (const value of [undefined, null, "following", []])
      assert.throws(() => adjustOptions(value, "adjust options"), {
        name: "RangeError",
        code: "invalid-argument",
        message: /^adjust options must be an object/,
      });
  });
});

describe("isCalendarLike", () => {
  const shape = { dayInfoOn: () => 0, isBusinessDay: () => true, timeZone: "UTC", providers: [] };
  test("true for a calendar and for any object of that shape", () => {
    assert.equal(isCalendarLike(createCalendar()), true);
    assert.equal(isCalendarLike(shape), true);
  });
  test("false when a member is missing or of another type, and for values that are not objects", () => {
    assert.equal(isCalendarLike({ ...shape, dayInfoOn: undefined }), false);
    assert.equal(isCalendarLike({ ...shape, isBusinessDay: true }), false);
    assert.equal(isCalendarLike({ ...shape, timeZone: 9 }), false);
    assert.equal(isCalendarLike({ ...shape, providers: {} }), false);
    for (const value of [null, undefined, "calendar", 1, () => 0])
      assert.equal(isCalendarLike(value), false);
  });
});

describe("checkCombineArguments", () => {
  const a = createCalendar(weekend);
  const b = createCalendar({ closedWeekdays: [3] });
  test("a frozen copy of the calendars, the mode, the search limit (default 3660) and the common time zone", () => {
    const calendars = [a, b];
    const checked = checkCombineArguments(calendars, { open: "all" });
    assert.deepEqual(checked.list, calendars);
    assert.notEqual(checked.list, calendars);
    assert.ok(Object.isFrozen(checked.list));
    assert.equal(checked.mode, "all");
    assert.equal(checked.searchDayLimit, 3660);
    assert.equal(checked.zone, a.timeZone);
    assert.deepEqual(
      [checkCombineArguments(calendars, { open: "any", searchDayLimit: 5 })].map((c) => [
        c.mode,
        c.searchDayLimit,
      ]),
      [["any", 5]],
    );
  });
  test("the old key names are read", () => {
    const checked = checkCombineArguments([a, b], {
      businessDay: "any",
      maxSearchDays: 7,
    } as never);
    assert.deepEqual([checked.mode, checked.searchDayLimit], ["any", 7]);
  });
  test("invalid-argument when calendars is not an array of two or more calendars", () => {
    for (const calendars of [undefined, null, a, [], [a], [a, {}], [a, null]])
      assert.throws(() => checkCombineArguments(calendars as never, { open: "all" }), {
        name: "RangeError",
        code: "invalid-argument",
      });
    // eslint-disable-next-line no-sparse-arrays
    assert.throws(() => checkCombineArguments([a, , b] as never, { open: "all" }), {
      code: "invalid-argument",
      message: "calendars[1] is not a calendar",
    });
  });
  test("invalid-argument when the same calendar is given twice", () => {
    assert.throws(() => checkCombineArguments([a, b, a], { open: "all" }), {
      code: "invalid-argument",
      message: "calendars[2] is the same calendar as calendars[0]",
    });
  });
  test("invalid-option for options that are not an object or have a wrong open or searchDayLimit", () => {
    for (const options of [undefined, null, "all", []])
      assert.throws(() => checkCombineArguments([a, b], options as never), {
        name: "RangeError",
        code: "invalid-option",
      });
    for (const options of [
      {},
      { open: "both" },
      { open: "all", searchDayLimit: 0 },
      { open: "all", searchDayLimit: 1.5 },
    ])
      assert.throws(() => checkCombineArguments([a, b], options as never), {
        code: "invalid-option",
      });
    assert.throws(
      () => checkCombineArguments([a, b], { open: "all", businessDay: "any" } as never),
      {
        code: "invalid-option",
      },
    );
  });
  test("time-zone-conflict when the time zones differ", () => {
    const tokyo = createCalendar({ timeZone: "Asia/Tokyo" });
    const london = createCalendar({ timeZone: "Europe/London" });
    assert.throws(() => checkCombineArguments([tokyo, london], { open: "all" }), {
      name: "RangeError",
      code: "time-zone-conflict",
    });
  });
});

describe("mergeHolidayLists", () => {
  const h = (date: string, name: string): Holiday => ({
    date,
    name,
    nameEn: name,
    kind: "regular",
    confirmed: true,
  });
  test("per date the holiday of the earliest list wins; the result is frozen and sorted by date", () => {
    const first = [h("2026-05-01", "a"), h("2026-01-01", "a")];
    const second = [h("2026-01-01", "b"), h("2026-03-01", "b")];
    const merged = mergeHolidayLists([first, second]);
    assert.deepEqual(
      merged.map((x) => `${x.date} ${x.name}`),
      ["2026-01-01 a", "2026-03-01 b", "2026-05-01 a"],
    );
    assert.ok(Object.isFrozen(merged));
    assert.equal(merged[0], first[1]);
  });
  test("an empty result for no lists or empty lists", () => {
    assert.deepEqual(mergeHolidayLists([]), []);
    assert.deepEqual(mergeHolidayLists([[], []]), []);
  });
});

describe("combinedOpen", () => {
  test("all: every result must be true", () => {
    assert.equal(combinedOpen([true, true], "all"), true);
    assert.equal(combinedOpen([true, false], "all"), false);
  });
  test("any: at least one must be true", () => {
    assert.equal(combinedOpen([false, true], "any"), true);
    assert.equal(combinedOpen([false, false], "any"), false);
  });
});

describe("combinedDayInfo", () => {
  const holiday = { date: "2026-11-03", name: "H", nameEn: "H", kind: "regular", confirmed: true };
  const info = (open: boolean, reason: string, more: Record<string, unknown> = {}): DayInfo =>
    ({ date: "2026-11-03", weekday: 2, open, businessDay: open, reason, ...more }) as DayInfo;
  test("all: closed when one is closed; decided by the first closed calendar", () => {
    const combined = combinedDayInfo(
      "2026-11-03",
      [
        info(true, "default"),
        info(false, "closed-date", {
          name: "N",
          optionPath: "closedDates[0]",
          shiftedFrom: "2026-11-01",
        }),
        info(false, "holiday", { holiday }),
      ],
      "all",
    );
    assert.ok(Object.isFrozen(combined));
    assert.ok(Object.isFrozen(combined.decidedByPath));
    assert.deepEqual(combined, {
      date: "2026-11-03",
      weekday: 2,
      open: false,
      businessDay: false,
      reason: "closed-date",
      name: "N",
      holiday,
      shiftedFrom: "2026-11-01",
      optionPath: "closedDates[0]",
      rulePath: "closedDates[0]",
      decidedBy: 1,
      decidedByPath: [1],
    });
  });
  test("all: open when all are open; decided by the first calendar", () => {
    const combined = combinedDayInfo(
      "2026-11-03",
      [info(true, "default"), info(true, "open-date")],
      "all",
    );
    assert.deepEqual([combined.open, combined.reason, combined.decidedBy], [true, "default", 0]);
    assert.deepEqual(Object.keys(combined), [
      "date",
      "weekday",
      "open",
      "businessDay",
      "reason",
      "decidedBy",
      "decidedByPath",
    ]);
  });
  test("any: open when one is open, decided by the first open calendar; closed when all are closed", () => {
    const open = combinedDayInfo(
      "2026-11-03",
      [info(false, "holiday", { holiday }), info(true, "open-date")],
      "any",
    );
    assert.deepEqual(
      [open.open, open.reason, open.decidedBy, open.holiday],
      [true, "open-date", 1, holiday],
    );
    const closed = combinedDayInfo(
      "2026-11-03",
      [info(false, "closed-weekday"), info(false, "holiday")],
      "any",
    );
    assert.deepEqual([closed.open, closed.reason, closed.decidedBy], [false, "closed-weekday", 0]);
  });
  test("decidedByPath prepends the index to the path of a nested combination", () => {
    const nested = info(false, "closed-date", { decidedBy: 2, decidedByPath: [2, 0] });
    const combined = combinedDayInfo("2026-11-03", [info(true, "default"), nested], "all");
    assert.deepEqual(combined.decidedByPath, [1, 2, 0]);
    assert.equal(combined.decidedBy, 1);
  });
});

describe("combineCalendars", () => {
  const office = createCalendar({ holidayProvider: provider, closedWeekdays: [0, 6] });
  const shop = createCalendar({ closedWeekdays: [3], timeZone: "UTC" });
  test("all: a business day when every calendar is open; any: when at least one is", () => {
    const all = combineCalendars([office, shop], { open: "all" });
    const any = combineCalendars([office, shop], { open: "any" });
    assert.ok(Object.isFrozen(all));
    // 2026-11-03 (Tue) is a holiday of the office, the 4th (Wed) is closed in the shop, the 7th is a Saturday
    assert.deepEqual(
      ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-07"].map((d) => all.isBusinessDay(d)),
      [true, false, false, false],
    );
    assert.deepEqual(
      ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-07"].map((d) => any.isBusinessDay(d)),
      [true, true, true, true],
    );
  });
  test("dayInfoOn reports the deciding calendar", () => {
    const all = combineCalendars([office, shop], { open: "all" });
    const info = all.dayInfoOn("2026-11-04");
    assert.deepEqual([info.reason, info.decidedBy, info.decidedByPath], ["closed-weekday", 1, [1]]);
    assert.equal(all.dayInfoOn("2026-11-03").holiday?.date, "2026-11-03");
    const nested = combineCalendars([createCalendar({ timeZone: "UTC" }), all], { open: "all" });
    assert.deepEqual(nested.dayInfoOn("2026-11-04").decidedByPath, [1, 1]);
  });
  test("holidays are taken per date from the first calendar that has one", () => {
    const all = combineCalendars([shop, office], { open: "all" });
    assert.equal(all.isHoliday("2026-11-03"), true);
    assert.equal(all.isHoliday("2026-11-04"), false);
    assert.equal(all.holidayOn("2026-11-03")?.date, "2026-11-03");
    assert.equal(all.getHoliday("2026-11-03")?.date, "2026-11-03");
    assert.deepEqual(
      all.holidaysInYear(2026).map((h) => h.date),
      ["2026-01-01", "2026-11-03"],
    );
    assert.deepEqual(
      all.holidaysBetween("2026-11-01", "2026-11-30").map((h) => h.date),
      ["2026-11-03"],
    );
    assert.deepEqual(all.providers, [provider]);
  });
  test("a day throws when any calendar throws; the policies are summarized", () => {
    const all = combineCalendars([office, shop], { open: "any" });
    assert.throws(() => all.isBusinessDay("2030-01-07"), {
      name: "RangeError",
      code: "out-of-range",
    });
    assert.equal(all.outOfRangePolicy, "throw");
    assert.equal(all.unconfirmedHolidayPolicy, "accept");
    const ignoring = createCalendar({
      holidayProvider: provider,
      outOfRangePolicy: "ignore",
      unconfirmedHolidayPolicy: "throw",
    });
    // "ignore" only when every calendar ignores; "throw" for unconfirmed holidays when any calendar throws
    const both = combineCalendars(
      [ignoring, createCalendar({ timeZone: "UTC", outOfRangePolicy: "ignore" })],
      { open: "all" },
    );
    assert.equal(both.outOfRangePolicy, "ignore");
    assert.equal(both.unconfirmedHolidayPolicy, "throw");
  });
  test("the array is copied, and searchDayLimit limits the searches", () => {
    const calendars = [office, shop];
    const all = combineCalendars(calendars, { open: "all", searchDayLimit: 3 });
    calendars.pop();
    assert.equal(all.isBusinessDay("2026-11-04"), false);
    const closed = combineCalendars(
      [createCalendar({ closedWeekdays: [0, 1, 2, 3, 4, 5, 6] }), shop],
      {
        open: "all",
        searchDayLimit: 3,
      },
    );
    assert.throws(() => closed.nextBusinessDay("2026-11-04"), {
      code: "no-business-day",
      message: /within 3 days/,
    });
  });
  test("the errors of the arguments", () => {
    assert.throws(() => combineCalendars([office], { open: "all" }), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.throws(() => combineCalendars([office, office], { open: "all" }), {
      code: "invalid-argument",
    });
    assert.throws(() => combineCalendars([office, shop], {} as never), { code: "invalid-option" });
    assert.throws(
      () => combineCalendars([office, createCalendar({ timeZone: "Asia/Tokyo" })], { open: "all" }),
      {
        code: "time-zone-conflict",
      },
    );
  });
});

describe("createCalendarFromSchedule", () => {
  const schedule = createSchedule<string>({
    holidayProvider: provider,
    weekdayValues: ["closed", "open", "open", "open", "open", "open", "half"],
    holidayPolicy: { value: "closed" },
    dates: [{ date: "2026-11-10", value: "closed", name: "Inventory" }],
  });
  const isOpen = (value: string): boolean => value !== "closed";
  test("a day is a business day when isOpen returns true for its value", () => {
    const calendar = createCalendarFromSchedule(schedule, isOpen);
    assert.ok(Object.isFrozen(calendar));
    assert.deepEqual(
      ["2026-11-02", "2026-11-03", "2026-11-07", "2026-11-08", "2026-11-10"].map((d) =>
        calendar.isBusinessDay(d),
      ),
      [true, false, true, false, false],
    );
  });
  test("reason combines the schedule reason with open or closed; name, holiday and optionPath are the schedule's", () => {
    const calendar = createCalendarFromSchedule(schedule, isOpen);
    assert.equal(calendar.dayInfoOn("2026-11-02").reason, "open-weekday");
    assert.equal(calendar.dayInfoOn("2026-11-08").reason, "closed-weekday");
    assert.equal(calendar.dayInfoOn("2026-11-03").reason, "holiday");
    assert.equal(calendar.dayInfoOn("2026-11-03").holiday?.date, "2026-11-03");
    const closed = calendar.dayInfoOn("2026-11-10");
    assert.deepEqual(
      [closed.reason, closed.name, closed.optionPath],
      ["closed-date", "Inventory", "dates[0]"],
    );
  });
  test("holidays, time zone and policies are the schedule's", () => {
    const calendar = createCalendarFromSchedule(schedule, isOpen);
    assert.equal(calendar.timeZone, schedule.timeZone);
    assert.equal(calendar.providers, schedule.providers);
    assert.equal(calendar.isHoliday("2026-11-03"), true);
    assert.equal(calendar.outOfRangePolicy, schedule.outOfRangePolicy);
  });
  test("searchDayLimit, under its old name too", () => {
    const never = (): boolean => false;
    const limited = createCalendarFromSchedule(schedule, never, { searchDayLimit: 4 });
    assert.throws(() => limited.nextBusinessDay("2026-11-02"), {
      code: "no-business-day",
      message: /within 4 days/,
    });
    const old = createCalendarFromSchedule(schedule, never, { maxSearchDays: 5 });
    assert.throws(() => old.nextBusinessDay("2026-11-02"), { message: /within 5 days/ });
  });
  test("invalid-argument when schedule is not a schedule", () => {
    for (const value of [null, undefined, 1, "schedule", {}, createCalendar()])
      assert.throws(() => createCalendarFromSchedule(value as never, isOpen), {
        name: "RangeError",
        code: "invalid-argument",
      });
  });
  test("invalid-argument when isOpen is not a function", () => {
    assert.throws(() => createCalendarFromSchedule(schedule, "open" as never), {
      name: "RangeError",
      code: "invalid-argument",
    });
  });
  test("invalid-argument when isOpen returns a non-boolean: at creation for the weekday and holiday values, later at the judgement", () => {
    assert.throws(
      () =>
        createCalendarFromSchedule(schedule, ((v: string) => (v === "half" ? 1 : true)) as never),
      {
        name: "RangeError",
        code: "invalid-argument",
      },
    );
    let late = false;
    const calendar = createCalendarFromSchedule(schedule, ((v: string) =>
      late ? "yes" : v !== "closed") as never);
    late = true;
    assert.throws(() => calendar.isBusinessDay("2026-11-02"), { code: "invalid-argument" });
    assert.throws(() => calendar.dayInfoOn("2026-11-02"), { code: "invalid-argument" });
  });
  test("invalid-option for invalid options", () => {
    for (const options of [
      null,
      5,
      "x",
      { searchDayLimit: 0 },
      { searchDayLimit: 1.5 },
      { searchDayLimit: 5, maxSearchDays: 5 },
    ])
      assert.throws(() => createCalendarFromSchedule(schedule, isOpen, options as never), {
        name: "RangeError",
        code: "invalid-option",
      });
  });
});
