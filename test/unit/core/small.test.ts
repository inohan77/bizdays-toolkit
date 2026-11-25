// Unit tests of the small modules of src/core: names.ts, options.ts, renamed.ts and errors.ts. One describe per
// function (a method is "<Class>.<member>"), named after it; each test is one statement of its specification
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  checkUnknownKeys,
  describeValue,
  internalError,
  InternalError,
  isBizdaysError,
  IssueCollector,
  rangeError,
  typeError,
  withCode,
  withoutUndefined,
} from "../../../src/core/errors.ts";
import { checkNames } from "../../../src/core/names.ts";
import { isOptionsObject } from "../../../src/core/options.ts";
import { conflict, join, renameKeys, renameValue, writtenKey } from "../../../src/core/renamed.ts";

describe("checkNames", () => {
  test("undefined for a plain object of canonical language tags and non-empty names", () => {
    assert.equal(checkNames({}), undefined);
    assert.equal(checkNames({ ja: "元日", en: "New Year's Day", "zh-Hant": "元旦" }), undefined);
    assert.equal(checkNames(Object.assign(Object.create(null), { cy: "Dydd Calan" })), undefined);
  });
  test("a reason for a value that is not a plain object", () => {
    for (const value of [
      null,
      undefined,
      "ja",
      1,
      [],
      new Map(),
      new Date(0),
      Object.create({ ja: "x" }),
    ])
      assert.equal(checkNames(value), "must be a plain object of { [language tag]: name }");
  });
  test("a reason for a key that is not a BCP 47 language tag", () => {
    assert.equal(checkNames({ "not a tag": "x" }), '"not a tag" is not a BCP 47 language tag');
  });
  test("a reason for a tag that is not in canonical form, naming the canonical form", () => {
    assert.equal(checkNames({ JA: "x" }), '"JA" must be written in canonical form "ja"');
    assert.equal(
      checkNames({ "zh-hant": "x" }),
      '"zh-hant" must be written in canonical form "zh-Hant"',
    );
  });
  test("a reason for a name that is not a non-empty string", () => {
    assert.equal(checkNames({ ja: "" }), '"ja" must be a non-empty string');
    assert.equal(checkNames({ ja: 1 }), '"ja" must be a non-empty string');
    assert.equal(checkNames({ en: "x", ja: null }), '"ja" must be a non-empty string');
  });
});

describe("isOptionsObject", () => {
  test("true for plain objects, also without a prototype", () => {
    assert.equal(isOptionsObject({}), true);
    assert.equal(isOptionsObject({ a: 1 }), true);
    assert.equal(isOptionsObject(Object.create(null)), true);
  });
  test("false for null, arrays, primitives and functions", () => {
    for (const value of [null, undefined, [], "x", 1, true, () => 0, Symbol("x")])
      assert.equal(isOptionsObject(value), false);
  });
  test("false for Date, Map, Set, RegExp and boxed primitives", () => {
    for (const value of [new Date(0), new Map(), new Set(), /x/, new String("x"), new Number(1)])
      assert.equal(isOptionsObject(value), false);
  });
});

describe("join", () => {
  test("path.key, or just the key for an empty path", () => {
    assert.equal(join("rules[0]", "day"), "rules[0].day");
    assert.equal(join("", "day"), "day");
  });
});

describe("conflict", () => {
  test("a collector records an invalid-option error at the path", () => {
    const c = new IssueCollector();
    conflict(c, "holidays", "holidays", "holidayProvider");
    assert.deepEqual(c.issues, [
      {
        severity: "error",
        code: "invalid-option",
        path: "holidays",
        message: 'use only "holidayProvider" ("holidays" was renamed in 0.30.0)',
      },
    ]);
  });
  test("throw: throws the same as a RangeError with the path in the message", () => {
    assert.throws(() => conflict("throw", "holidays", "holidays", "holidayProvider"), {
      name: "RangeError",
      code: "invalid-option",
      message: 'holidays: use only "holidayProvider" ("holidays" was renamed in 0.30.0)',
    });
  });
});

describe("renameKeys", () => {
  test("an old key is replaced by its new name, with a deprecated-option warning at the old key", () => {
    const c = new IssueCollector();
    const value = { holidays: "p", closedWeekdays: [0] };
    assert.deepEqual(renameKeys(c, ["source"], "", value), {
      holidayProvider: "p",
      closedWeekdays: [0],
    });
    assert.deepEqual(c.issues, [
      {
        severity: "warning",
        code: "deprecated-option",
        path: "holidays",
        message: '"holidays" was renamed to "holidayProvider" in 0.30.0',
      },
    ]);
    assert.deepEqual(value, { holidays: "p", closedWeekdays: [0] });
  });
  test("the warning's path is under writtenPath", () => {
    const c = new IssueCollector();
    renameKeys(c, ["rule"], "recurringRules[2]", { day: 5 });
    assert.equal(c.issues[0]!.path, "recurringRules[2].day");
  });
  test("only the tables of the given places apply", () => {
    const c = new IssueCollector();
    assert.deepEqual(renameKeys(c, ["calendar"], "", { holiday: "x", day: 1 }), {
      holiday: "x",
      day: 1,
    });
    assert.deepEqual(c.issues, []);
    assert.deepEqual(renameKeys(c, ["schedule", "rule"], "", { holiday: "x", day: 1 }), {
      holidayPolicy: "x",
      dayOfMonth: 1,
    });
  });
  test("an old key whose value is undefined is dropped (with the warning)", () => {
    const c = new IssueCollector();
    const out = renameKeys(c, ["source"], "", { holidays: undefined });
    assert.deepEqual(Object.keys(out), []);
    assert.equal(c.issues.length, 1);
  });
  test("an old key with undefined next to its new name is no conflict", () => {
    const c = new IssueCollector();
    assert.deepEqual(renameKeys(c, ["source"], "", { holidays: undefined, holidayProvider: "p" }), {
      holidayProvider: "p",
    });
    assert.equal(c.hasErrors, false);
    assert.deepEqual(renameKeys(c, ["source"], "", { holidays: "p", holidayProvider: undefined }), {
      holidayProvider: "p",
    });
    assert.equal(c.hasErrors, false);
  });
  test("an old key and its new name both with a value: invalid-option, and the old key is dropped", () => {
    const c = new IssueCollector();
    assert.deepEqual(renameKeys(c, ["source"], "", { holidays: "a", holidayProvider: "b" }), {
      holidayProvider: "b",
    });
    assert.deepEqual(
      c.issues.map((i) => [i.severity, i.code, i.path]),
      [["error", "invalid-option", "holidays"]],
    );
  });
  test("throw: records nothing for a rename and throws the conflict", () => {
    assert.deepEqual(renameKeys("throw", ["combine"], "", { businessDay: "any" }), { open: "any" });
    assert.throws(
      () => renameKeys("throw", ["combine"], "options", { businessDay: "any", open: "all" }),
      {
        name: "RangeError",
        code: "invalid-option",
      },
    );
  });
});

describe("writtenKey", () => {
  test("the old name when the user wrote it with a value", () => {
    assert.equal(writtenKey(["source"], { holidays: "p" }, "holidayProvider"), "holidays");
    assert.equal(writtenKey(["rule", "dueDate"], { day: 5 }, "dayOfMonth"), "day");
  });
  test("the new name otherwise", () => {
    assert.equal(
      writtenKey(["source"], { holidayProvider: "p" }, "holidayProvider"),
      "holidayProvider",
    );
    assert.equal(
      writtenKey(["source"], { holidays: undefined }, "holidayProvider"),
      "holidayProvider",
    );
    assert.equal(writtenKey(["calendar"], { holidays: "p" }, "holidayProvider"), "holidayProvider");
    assert.equal(writtenKey(["source"], {}, "closedWeekdays"), "closedWeekdays");
  });
});

describe("renameValue", () => {
  test("a renamed string becomes the new name, with a deprecated-option warning at the path", () => {
    const c = new IssueCollector();
    assert.equal(renameValue(c, "schedule", "holidayPolicy", "holiday", "weekday"), "ignore");
    assert.deepEqual(c.issues, [
      {
        severity: "warning",
        code: "deprecated-option",
        path: "holiday",
        message: '"weekday" was renamed to "ignore" in 0.30.0',
      },
    ]);
  });
  test("each element of an array is replaced, with the element's index in the path", () => {
    const c = new IssueCollector();
    const value = ["national", "substitute", "national"];
    assert.deepEqual(renameValue(c, "rule", "kinds", "r.kinds", value), [
      "regular",
      "substitute",
      "regular",
    ]);
    assert.deepEqual(
      c.issues.map((i) => i.path),
      ["r.kinds[0]", "r.kinds[2]"],
    );
    assert.deepEqual(value, ["national", "substitute", "national"]);
  });
  test("other values, and values of a place and key without a rename, are returned unchanged", () => {
    const c = new IssueCollector();
    const object = { a: 1 };
    assert.equal(renameValue(c, "schedule", "holidayPolicy", "p", "closed"), "closed");
    assert.equal(renameValue(c, "schedule", "holidayPolicy", "p", object), object);
    assert.equal(renameValue(c, "calendar", "holidayPolicy", "p", "weekday"), "weekday");
    assert.equal(renameValue(c, "schedule", "weekdayValues", "p", "weekday"), "weekday");
    assert.deepEqual(c.issues, []);
  });
  test("throw: replaces without recording", () => {
    assert.equal(renameValue("throw", "schedule", "holidayPolicy", "p", "weekday"), "ignore");
  });
});

describe("isBizdaysError", () => {
  test("true for an error created by this library with a code", () => {
    assert.equal(isBizdaysError(rangeError("invalid-date", "x")), true);
    assert.equal(isBizdaysError(typeError("invalid-argument", "x")), true);
  });
  test("false for other errors, also with a code, for InternalError and for other values", () => {
    assert.equal(isBizdaysError(new RangeError("x")), false);
    assert.equal(isBizdaysError(Object.assign(new Error("x"), { code: "invalid-date" })), false);
    assert.equal(isBizdaysError(internalError("x")), false);
    assert.equal(isBizdaysError({ code: "invalid-date", bizdays: true }), false);
    assert.equal(isBizdaysError(null), false);
    assert.equal(isBizdaysError("invalid-date"), false);
  });
});

describe("withCode", () => {
  test("returns the same error with an enumerable code and a non-enumerable bizdays: true", () => {
    const error = new Error("x");
    const marked = withCode(error, "invalid-date");
    assert.equal(marked, error);
    assert.equal(marked.code, "invalid-date");
    assert.deepEqual(Object.keys(marked), ["code"]);
    assert.equal((marked as unknown as { bizdays: boolean }).bizdays, true);
    assert.equal(isBizdaysError(marked), true);
  });
});

describe("rangeError", () => {
  test("a RangeError with the code and the message, not thrown", () => {
    const error = rangeError("out-of-range", "the message");
    assert.ok(error instanceof RangeError);
    assert.equal(error.message, "the message");
    assert.equal((error as unknown as { code: string }).code, "out-of-range");
  });
});

describe("typeError", () => {
  test("a TypeError with the code and the message, not thrown", () => {
    const error = typeError("invalid-argument", "the message");
    assert.ok(error instanceof TypeError);
    assert.equal(error.message, "the message");
    assert.equal((error as unknown as { code: string }).code, "invalid-argument");
  });
});

describe("internalError", () => {
  test("an InternalError with the prefixed message and without a code", () => {
    const error = internalError("broken");
    assert.ok(error instanceof InternalError);
    assert.equal(error.name, "InternalError");
    assert.equal(error.message, "bizdays-toolkit internal error: broken");
    assert.equal("code" in error, false);
  });
});

describe("describeValue", () => {
  test("numbers and symbols by String()", () => {
    assert.equal(describeValue(1.5), "1.5");
    assert.equal(describeValue(Number.NaN), "NaN");
    assert.equal(describeValue(-Infinity), "-Infinity");
    assert.equal(describeValue(Symbol("s")), "Symbol(s)");
  });
  test("bigint with an n suffix, and functions as a function", () => {
    assert.equal(describeValue(10n), "10n");
    assert.equal(
      describeValue(() => 0),
      "a function",
    );
  });
  test("the toString tag for objects other than plain objects and arrays", () => {
    assert.equal(describeValue(new Date(0)), "[object Date]");
    assert.equal(describeValue(new Map()), "[object Map]");
    assert.equal(describeValue(/x/), "[object RegExp]");
  });
  test("the JSON form for strings, booleans, null, plain objects and arrays", () => {
    assert.equal(describeValue("a"), '"a"');
    assert.equal(describeValue(true), "true");
    assert.equal(describeValue(null), "null");
    assert.equal(describeValue({ a: [1, "b"] }), '{"a":[1,"b"]}');
    assert.equal(describeValue([]), "[]");
  });
  test("String() when JSON has no form", () => {
    assert.equal(describeValue(undefined), "undefined");
  });
  test("the toString tag for objects JSON cannot serialize, without throwing", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    assert.equal(describeValue(circular), "[object Object]");
    assert.equal(describeValue({ n: 1n }), "[object Object]");
    assert.equal(
      describeValue({
        get x(): never {
          throw new Error("no");
        },
      }),
      "[object Object]",
    );
    assert.equal(describeValue([1n]), "[object Array]");
  });
});

describe("IssueCollector.error", () => {
  test("appends an issue with severity error", () => {
    const c = new IssueCollector();
    c.error("invalid-option", "a.b", "the message");
    assert.deepEqual(c.issues, [
      { severity: "error", code: "invalid-option", path: "a.b", message: "the message" },
    ]);
  });
});

describe("IssueCollector.warning", () => {
  test("appends a warning; relatedPath is a property only when given", () => {
    const c = new IssueCollector();
    c.warning("shadowed", "a", "m");
    c.warning("shadowed", "b", "m", "a");
    assert.deepEqual(c.issues, [
      { severity: "warning", code: "shadowed", path: "a", message: "m" },
      { severity: "warning", code: "shadowed", path: "b", message: "m", relatedPath: "a" },
    ]);
    assert.equal("relatedPath" in c.issues[0]!, false);
  });
});

describe("IssueCollector.info", () => {
  test("appends an info item; relatedPath is a property only when given", () => {
    const c = new IssueCollector();
    c.info("redundant", "a", "m");
    c.info("redundant", "b", "m", "a");
    assert.deepEqual(c.issues, [
      { severity: "info", code: "redundant", path: "a", message: "m" },
      { severity: "info", code: "redundant", path: "b", message: "m", relatedPath: "a" },
    ]);
  });
});

describe("IssueCollector.hasErrors", () => {
  test("true only when an issue has severity error", () => {
    const c = new IssueCollector();
    assert.equal(c.hasErrors, false);
    c.warning("shadowed", "a", "m");
    c.info("redundant", "a", "m");
    assert.equal(c.hasErrors, false);
    c.error("invalid-option", "a", "m");
    assert.equal(c.hasErrors, true);
  });
});

describe("IssueCollector.throwFirstError", () => {
  test("does nothing without errors", () => {
    const c = new IssueCollector();
    c.warning("shadowed", "a", "m");
    assert.equal(c.throwFirstError(), undefined);
  });
  test("throws the first error as a RangeError with its code and path: message", () => {
    const c = new IssueCollector();
    c.warning("shadowed", "w", "m");
    c.error("invalid-option", "a.b", "first");
    c.error("invalid-date", "c", "second");
    assert.throws(() => c.throwFirstError(), {
      name: "RangeError",
      code: "invalid-option",
      message: "a.b: first",
    });
  });
  test("just the message when the path is empty", () => {
    const c = new IssueCollector();
    c.error("invalid-option", "", "whole");
    assert.throws(() => c.throwFirstError(), { message: "whole" });
  });
});

describe("withoutUndefined", () => {
  test("a copy without the properties whose value is undefined", () => {
    const value = { a: 1, b: undefined, c: null };
    assert.deepEqual(withoutUndefined(value), { a: 1, c: null });
    assert.deepEqual(Object.keys(value), ["a", "b", "c"]);
  });
  test("the key value is never dropped", () => {
    assert.deepEqual(Object.keys(withoutUndefined({ value: undefined, x: undefined })), ["value"]);
  });
  test("with keys, only those keys are dropped", () => {
    assert.deepEqual(Object.keys(withoutUndefined({ a: undefined, b: undefined }, ["a"])), ["b"]);
    assert.deepEqual(
      Object.keys(withoutUndefined({ a: undefined, value: undefined }, ["a", "value"])),
      ["value"],
    );
  });
});

describe("checkUnknownKeys", () => {
  test("an unknown-option warning per key that is not known, with the key and the known keys", () => {
    const c = new IssueCollector();
    const known = ["a", "b"];
    checkUnknownKeys(c, "", { a: 1, x: 2, y: 3 }, known);
    assert.deepEqual(c.issues, [
      {
        severity: "warning",
        code: "unknown-option",
        path: "x",
        message: 'Unknown option "x" is ignored',
        unknownKey: "x",
        knownKeys: known,
      },
      {
        severity: "warning",
        code: "unknown-option",
        path: "y",
        message: 'Unknown option "y" is ignored',
        unknownKey: "y",
        knownKeys: known,
      },
    ]);
  });
  test("the path is under the given position, and known keys record nothing", () => {
    const c = new IssueCollector();
    checkUnknownKeys(c, "rules[1]", { x: 1 }, ["a"]);
    assert.equal(c.issues[0]!.path, "rules[1].x");
    const none = new IssueCollector();
    checkUnknownKeys(none, "", { a: 1 }, ["a"]);
    assert.deepEqual(none.issues, []);
  });
  test("only own enumerable keys are checked", () => {
    const c = new IssueCollector();
    const value = Object.create({ inherited: 1 }) as Record<string, unknown>;
    Object.defineProperty(value, "hidden", { value: 1, enumerable: false });
    checkUnknownKeys(c, "", value, []);
    assert.deepEqual(c.issues, []);
  });
});
