// Unit tests of the functions of src/core/schedule.ts that convert day numbers and validate the entries of
// specific dates and annual dates. One describe per function, named after the function; each test is one
// statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { toDayNumber } from "../../../src/core/date.ts";
import { IssueCollector } from "../../../src/core/errors.ts";
import {
  checkDate,
  checkMonthDay,
  checkName,
  checkPeriod,
  compileAnnualRules,
  compileDateRules,
  dateOfDayNumber,
  dayNumberOf,
  inPeriod,
  isObject,
  isValidMonthDay,
  isWeekday,
  weekdayOfDate,
  weekdayOfDayNumber,
} from "../../../src/core/schedule.ts";

const issues = (c: IssueCollector): string[] =>
  c.issues.map((i) => `${i.severity} ${i.code} ${i.path}`);
const day = toDayNumber;
/** The value reader of a schedule: the entry's `value`, or an error when it has none */
const valueOf = (c: IssueCollector) => (entry: Record<string, unknown>, path: string) => {
  if (!("value" in entry)) {
    c.error("invalid-option", path, "must have a value");
    return undefined;
  }
  return { value: entry["value"] };
};
/** The value reader of a calendar: always the same value */
const closed = () => ({ value: false });

describe("dayNumberOf", () => {
  test("days since 1970-01-01, as toDayNumber", () => {
    assert.equal(dayNumberOf("1970-01-01"), 0);
    assert.equal(dayNumberOf("2026-11-23"), day("2026-11-23"));
    assert.equal(dayNumberOf("2026-11-23"), day("2026-11-23"));
    assert.equal(dayNumberOf("1955-01-01"), day("1955-01-01"));
  });
  test("invalid-date for an invalid date; the cache is left unchanged", () => {
    assert.equal(dayNumberOf("2026-11-23"), day("2026-11-23"));
    assert.throws(() => dayNumberOf("2026-02-30"), { name: "RangeError", code: "invalid-date" });
    assert.equal(dayNumberOf("2026-11-23"), day("2026-11-23"));
    assert.throws(() => dayNumberOf("2026-02-30"), { code: "invalid-date" });
  });
});

describe("dateOfDayNumber", () => {
  test("the date of a day number, as fromDayNumber", () => {
    assert.equal(dateOfDayNumber(0), "1970-01-01");
    assert.equal(dateOfDayNumber(day("2026-11-23")), "2026-11-23");
    assert.equal(dateOfDayNumber(-1), "1969-12-31");
  });
  test("the pair is stored in the cache of dayNumberOf", () => {
    const n = day("2031-03-04");
    assert.equal(dateOfDayNumber(n), "2031-03-04");
    assert.equal(dayNumberOf("2031-03-04"), n);
  });
  test("out-of-range outside the years 1000-9999", () => {
    assert.throws(() => dateOfDayNumber(day("9999-12-31") + 1), {
      name: "RangeError",
      code: "out-of-range",
    });
    assert.throws(() => dateOfDayNumber(day("1000-01-01") - 1), { code: "out-of-range" });
  });
});

describe("weekdayOfDayNumber", () => {
  test("0 for Sunday to 6 for Saturday", () => {
    assert.equal(weekdayOfDayNumber(0), 4);
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6].map((i) => weekdayOfDayNumber(day("2026-11-22") + i)),
      [0, 1, 2, 3, 4, 5, 6],
    );
  });
  test("valid for negative day numbers", () => {
    assert.equal(weekdayOfDayNumber(-1), 3);
    assert.equal(weekdayOfDayNumber(-4), 0);
    assert.equal(weekdayOfDayNumber(day("1955-01-01")), 6);
  });
});

describe("weekdayOfDate", () => {
  test("the weekday of a date string", () => {
    assert.equal(weekdayOfDate("2026-11-22"), 0);
    assert.equal(weekdayOfDate("2026-11-23"), 1);
    assert.equal(weekdayOfDate("1969-12-31"), 3);
  });
});

describe("isObject", () => {
  test("true for a non-null object that is not an array", () => {
    assert.equal(isObject({}), true);
    assert.equal(isObject(new Date(0)), true);
    assert.equal(isObject(Object.create(null)), true);
  });
  test("false for null, arrays and primitives", () => {
    for (const value of [null, undefined, [], "x", 1, true, () => 0])
      assert.equal(isObject(value), false);
  });
});

describe("isValidMonthDay", () => {
  test("true for MM-DD that exists in some year", () => {
    for (const value of ["01-01", "12-31", "02-29", "04-30", "06-30", "09-30", "11-30"])
      assert.equal(isValidMonthDay(value), true, value);
  });
  test("false for a day no year has, another form, and values that are not strings", () => {
    for (const value of [
      "02-30",
      "04-31",
      "06-31",
      "09-31",
      "11-31",
      "00-10",
      "13-01",
      "01-00",
      "01-32",
      "1-1",
      "0101",
      "2026-01-01",
      "",
      101,
      null,
      undefined,
    ])
      assert.equal(isValidMonthDay(value), false, String(value));
  });
});

describe("isWeekday", () => {
  test("true for an integer 0-6", () => {
    for (const value of [0, 3, 6]) assert.equal(isWeekday(value), true);
  });
  test("false otherwise", () => {
    for (const value of [-1, 7, 1.5, Number.NaN, "1", null, undefined])
      assert.equal(isWeekday(value), false);
  });
});

describe("inPeriod", () => {
  test("both ends are included", () => {
    const rule = { effectiveFrom: 10, effectiveTo: 20 };
    assert.deepEqual(
      [9, 10, 15, 20, 21].map((n) => inPeriod(rule, n)),
      [false, true, true, true, false],
    );
  });
  test("a null end is open", () => {
    assert.equal(inPeriod({ effectiveFrom: null, effectiveTo: 20 }, -1e6), true);
    assert.equal(inPeriod({ effectiveFrom: null, effectiveTo: 20 }, 21), false);
    assert.equal(inPeriod({ effectiveFrom: 10, effectiveTo: null }, 1e6), true);
    assert.equal(inPeriod({ effectiveFrom: 10, effectiveTo: null }, 9), false);
    assert.equal(inPeriod({ effectiveFrom: null, effectiveTo: null }, 0), true);
  });
});

describe("checkPeriod", () => {
  test("the period as day numbers; null for an omitted end", () => {
    const c = new IssueCollector();
    assert.deepEqual(
      checkPeriod(c, "r", { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" }),
      {
        effectiveFrom: day("2026-01-01"),
        effectiveTo: day("2026-12-31"),
      },
    );
    assert.deepEqual(checkPeriod(c, "r", {}), { effectiveFrom: null, effectiveTo: null });
    assert.deepEqual(checkPeriod(c, "r", { effectiveFrom: undefined, effectiveTo: "2026-12-31" }), {
      effectiveFrom: null,
      effectiveTo: day("2026-12-31"),
    });
    assert.deepEqual(
      checkPeriod(c, "r", { effectiveFrom: "2026-06-01", effectiveTo: "2026-06-01" }),
      {
        effectiveFrom: day("2026-06-01"),
        effectiveTo: day("2026-06-01"),
      },
    );
    assert.deepEqual(issues(c), []);
  });
  test("invalid-date at path.key for an invalid date, for each invalid side; undefined is returned", () => {
    const c = new IssueCollector();
    assert.equal(
      checkPeriod(c, "r", { effectiveFrom: "2026-02-30", effectiveTo: null }),
      undefined,
    );
    assert.deepEqual(issues(c), [
      "error invalid-date r.effectiveFrom",
      "error invalid-date r.effectiveTo",
    ]);
  });
  test("invalid-range at the path when effectiveFrom is after effectiveTo; undefined is returned", () => {
    const c = new IssueCollector();
    assert.equal(
      checkPeriod(c, "r", { effectiveFrom: "2026-06-02", effectiveTo: "2026-06-01" }),
      undefined,
    );
    assert.deepEqual(issues(c), ["error invalid-range r"]);
  });
});

describe("checkName", () => {
  test("the name, or undefined when omitted", () => {
    const c = new IssueCollector();
    assert.equal(checkName(c, "p", "Inventory"), "Inventory");
    assert.equal(checkName(c, "p", ""), "");
    assert.equal(checkName(c, "p", undefined), undefined);
    assert.deepEqual(issues(c), []);
  });
  test("undefined and invalid-option at path.name when it is not a string", () => {
    for (const name of [1, null, {}, ["x"]]) {
      const c = new IssueCollector();
      assert.equal(checkName(c, "p", name), undefined);
      assert.deepEqual(issues(c), ["error invalid-option p.name"]);
    }
  });
});

describe("checkDate", () => {
  test("the day number of a valid date string", () => {
    const c = new IssueCollector();
    assert.equal(checkDate(c, "p", "2026-11-23"), day("2026-11-23"));
    assert.deepEqual(issues(c), []);
  });
  test("undefined and invalid-date at the path otherwise", () => {
    for (const value of ["2026-02-30", "2026/11/23", 20261123, null, undefined, new Date(0)]) {
      const c = new IssueCollector();
      assert.equal(checkDate(c, "p.date", value), undefined);
      assert.deepEqual(issues(c), ["error invalid-date p.date"]);
    }
  });
});

describe("checkMonthDay", () => {
  test("the string for a valid MM-DD", () => {
    const c = new IssueCollector();
    assert.equal(checkMonthDay(c, "p", "02-29"), "02-29");
    assert.deepEqual(issues(c), []);
  });
  test("undefined and invalid-annual-date at the path otherwise", () => {
    for (const value of ["02-30", "2026-01-01", "1-1", 101, null, undefined]) {
      const c = new IssueCollector();
      assert.equal(checkMonthDay(c, "p.date", value), undefined);
      assert.deepEqual(issues(c), ["error invalid-annual-date p.date"]);
    }
  });
});

describe("compileDateRules", () => {
  const compile = (entries: unknown, allowString = true, valueKey = false) => {
    const c = new IssueCollector();
    const rules = compileDateRules(
      c,
      "dates",
      entries,
      valueKey ? valueOf(c) : closed,
      allowString,
      valueKey,
    );
    return { rules, issues: issues(c) };
  };
  test("[] for undefined", () => {
    assert.deepEqual(compile(undefined), { rules: [], issues: [] });
  });
  test("invalid-option when it is not an array", () => {
    for (const entries of [null, "2026-11-23", {}])
      assert.deepEqual(compile(entries), { rules: [], issues: ["error invalid-option dates"] });
  });
  test("one rule per valid entry in array order: a date string, { date } and { from, to }, each with an optional name", () => {
    const { rules, issues: found } = compile([
      "2026-11-23",
      { date: "2026-11-24", name: "A" },
      { from: "2026-12-29", to: "2027-01-03", name: "B" },
    ]);
    assert.deepEqual(found, []);
    assert.deepEqual(rules, [
      {
        path: "dates[0]",
        from: day("2026-11-23"),
        to: day("2026-11-23"),
        value: false,
        name: undefined,
      },
      { path: "dates[1]", from: day("2026-11-24"), to: day("2026-11-24"), value: false, name: "A" },
      { path: "dates[2]", from: day("2026-12-29"), to: day("2027-01-03"), value: false, name: "B" },
    ]);
  });
  test("a bare string is accepted only with allowString", () => {
    assert.deepEqual(compile(["2026-11-23"], false), {
      rules: [],
      issues: ["error invalid-option dates[0]"],
    });
  });
  test("invalid-option for an entry that is not an object; a hole counts as an undefined entry", () => {
    // eslint-disable-next-line no-sparse-arrays
    const { rules, issues: found } = compile([null, 20261123, , ["2026-11-23"], "2026-11-23"]);
    assert.deepEqual(found, [
      "error invalid-option dates[0]",
      "error invalid-option dates[1]",
      "error invalid-option dates[2]",
      "error invalid-option dates[3]",
    ]);
    assert.deepEqual(
      rules.map((r) => r.path),
      ["dates[4]"],
    );
  });
  test("invalid-option for an entry with both date and from or to, and for one with neither date nor both from and to", () => {
    assert.deepEqual(
      compile([
        { date: "2026-11-23", from: "2026-11-23" },
        { date: "2026-11-23", to: "2026-11-24" },
      ]).issues,
      ["error invalid-option dates[0]", "error invalid-option dates[1]"],
    );
    assert.deepEqual(
      compile([{}, { from: "2026-11-23" }, { to: "2026-11-23" }, { name: "x" }]).issues,
      [
        "error invalid-option dates[0]",
        "error invalid-option dates[1]",
        "error invalid-option dates[2]",
        "error invalid-option dates[3]",
      ],
    );
  });
  test("an explicit undefined in date, from and to is an omission", () => {
    const { rules, issues: found } = compile([
      { date: "2026-11-23", from: undefined, to: undefined },
      { date: undefined, from: "2026-11-23", to: "2026-11-24" },
    ]);
    assert.deepEqual(found, []);
    assert.equal(rules.length, 2);
  });
  test("invalid-date at the property for an invalid date; the entry is skipped", () => {
    const { rules, issues: found } = compile([
      { date: "2026-02-30" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2026-03-01", to: 20260302 },
      "2026-13-01",
    ]);
    assert.deepEqual(found, [
      "error invalid-date dates[0].date",
      "error invalid-date dates[1].from",
      "error invalid-date dates[2].to",
      "error invalid-date dates[3].date",
    ]);
    assert.deepEqual(rules, []);
  });
  test("invalid-range when from is after to; the same day is valid", () => {
    assert.deepEqual(compile([{ from: "2026-11-24", to: "2026-11-23" }]), {
      rules: [],
      issues: ["error invalid-range dates[0]"],
    });
    assert.equal(compile([{ from: "2026-11-23", to: "2026-11-23" }]).rules.length, 1);
  });
  test("invalid-option at path.name for a name that is not a string; the rule is still made, without a name", () => {
    const { rules, issues: found } = compile([{ date: "2026-11-23", name: 5 }]);
    assert.deepEqual(found, ["error invalid-option dates[0].name"]);
    assert.equal(rules[0]!.name, undefined);
  });
  test("unknown keys get a warning; value is a known key only with valueKey", () => {
    assert.deepEqual(compile([{ date: "2026-11-23", extra: 1, value: 1 }]).issues, [
      "warning unknown-option dates[0].extra",
      "warning unknown-option dates[0].value",
    ]);
    assert.deepEqual(
      compile([{ from: "2026-11-23", to: "2026-11-24", extra: 1, value: 1 }], true, true).issues,
      ["warning unknown-option dates[0].extra"],
    );
    assert.deepEqual(compile([{ date: "2026-11-23", value: "v" }], true, true), {
      rules: [
        {
          path: "dates[0]",
          from: day("2026-11-23"),
          to: day("2026-11-23"),
          value: "v",
          name: undefined,
        },
      ],
      issues: [],
    });
  });
  test("an entry without a value (valueOf returns undefined) makes no rule", () => {
    const single = compile([{ date: "2026-11-23" }], true, true);
    assert.deepEqual(single, { rules: [], issues: ["error invalid-option dates[0]"] });
    const range = compile([{ from: "2026-11-23", to: "2026-11-24" }], true, true);
    assert.deepEqual(range, { rules: [], issues: ["error invalid-option dates[0]"] });
  });
});

describe("compileAnnualRules", () => {
  const compile = (entries: unknown, allowString = true, valueKey = false) => {
    const c = new IssueCollector();
    const rules = compileAnnualRules(
      c,
      "annual",
      entries,
      valueKey ? valueOf(c) : closed,
      allowString,
      valueKey,
    );
    return { rules, issues: issues(c) };
  };
  const open = { effectiveFrom: null, effectiveTo: null };
  test("[] for undefined, and invalid-option when it is not an array", () => {
    assert.deepEqual(compile(undefined), { rules: [], issues: [] });
    assert.deepEqual(compile("12-31"), { rules: [], issues: ["error invalid-option annual"] });
  });
  test("one rule per valid entry in array order: MM-DD, { date } and { from, to }, with name and effective period", () => {
    const { rules, issues: found } = compile([
      "12-31",
      { date: "01-02", name: "A", effectiveFrom: "2026-01-01" },
      { from: "08-13", to: "08-16", effectiveTo: "2030-12-31" },
    ]);
    assert.deepEqual(found, []);
    assert.deepEqual(rules, [
      { path: "annual[0]", from: "12-31", to: "12-31", value: false, name: undefined, ...open },
      {
        path: "annual[1]",
        from: "01-02",
        to: "01-02",
        value: false,
        name: "A",
        effectiveFrom: day("2026-01-01"),
        effectiveTo: null,
      },
      {
        path: "annual[2]",
        from: "08-13",
        to: "08-16",
        value: false,
        name: undefined,
        effectiveFrom: null,
        effectiveTo: day("2030-12-31"),
      },
    ]);
  });
  test("from later than to is valid: the period wraps over the year end", () => {
    const { rules, issues: found } = compile([{ from: "12-29", to: "01-03" }]);
    assert.deepEqual(found, []);
    assert.deepEqual([rules[0]!.from, rules[0]!.to], ["12-29", "01-03"]);
  });
  test("a bare string is accepted only with allowString; other entries that are not objects are invalid-option", () => {
    assert.deepEqual(compile(["12-31"], false), {
      rules: [],
      issues: ["error invalid-option annual[0]"],
    });
    // eslint-disable-next-line no-sparse-arrays
    assert.deepEqual(compile([null, 1231, ,]).issues, [
      "error invalid-option annual[0]",
      "error invalid-option annual[1]",
      "error invalid-option annual[2]",
    ]);
  });
  test("invalid-option for both date and from or to, and for neither date nor both from and to", () => {
    assert.deepEqual(compile([{ date: "12-31", from: "12-29" }, { from: "12-29" }, {}]).issues, [
      "error invalid-option annual[0]",
      "error invalid-option annual[1]",
      "error invalid-option annual[2]",
    ]);
    assert.equal(compile([{ date: "12-31", from: undefined, to: undefined }]).rules.length, 1);
  });
  test("invalid-annual-date at the property for an invalid month-day; the entry is skipped", () => {
    assert.deepEqual(
      compile([
        "02-30",
        { date: "2026-12-31" },
        { from: "13-01", to: "01-03" },
        { from: "12-29", to: "1-3" },
      ]),
      {
        rules: [],
        issues: [
          "error invalid-annual-date annual[0].date",
          "error invalid-annual-date annual[1].date",
          "error invalid-annual-date annual[2].from",
          "error invalid-annual-date annual[3].to",
        ],
      },
    );
    assert.equal(compile(["02-29"]).rules.length, 1);
  });
  test("an invalid effective period is reported and the entry is skipped", () => {
    assert.deepEqual(compile([{ date: "12-31", effectiveFrom: "2026-02-30" }]), {
      rules: [],
      issues: ["error invalid-date annual[0].effectiveFrom"],
    });
    assert.deepEqual(
      compile([
        { from: "12-29", to: "01-03", effectiveFrom: "2027-01-01", effectiveTo: "2026-01-01" },
      ]),
      {
        rules: [],
        issues: ["error invalid-range annual[0]"],
      },
    );
  });
  test("a name that is not a string is reported; the rule is still made", () => {
    const { rules, issues: found } = compile([{ date: "12-31", name: 5 }]);
    assert.deepEqual(found, ["error invalid-option annual[0].name"]);
    assert.equal(rules.length, 1);
  });
  test("unknown keys get a warning; value is a known key only with valueKey", () => {
    assert.deepEqual(compile([{ date: "12-31", extra: 1, value: 1 }]).issues, [
      "warning unknown-option annual[0].extra",
      "warning unknown-option annual[0].value",
    ]);
    assert.deepEqual(
      compile([{ from: "12-29", to: "01-03", extra: 1, value: "v" }], true, true).issues,
      ["warning unknown-option annual[0].extra"],
    );
    assert.equal(compile([{ date: "12-31", value: "v" }], true, true).rules[0]!.value, "v");
  });
  test("an entry without a value (valueOf returns undefined) makes no rule", () => {
    assert.deepEqual(compile([{ date: "12-31" }, { from: "12-29", to: "01-03" }], true, true), {
      rules: [],
      issues: ["error invalid-option annual[0]", "error invalid-option annual[1]"],
    });
  });
});
