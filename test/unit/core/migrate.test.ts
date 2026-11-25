// Unit tests of src/core/migrate.ts. One describe per function, named after the function; each test is one
// statement of the function's specification (its TSDoc)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  clone,
  join,
  migrate,
  migrateCalendarOptions,
  migrateScheduleOptions,
  onlyJp,
  renameObject,
  renameValues,
  type OptionChange,
} from "../../../src/core/migrate.ts";

const JP = { id: "JP" };
const SG = { id: "SG" };

describe("clone", () => {
  test("arrays and options objects are copied recursively", () => {
    const input = { a: [{ b: 1 }, [2]], c: { d: { e: 3 } } };
    const copy = clone(input) as typeof input;
    assert.deepEqual(copy, input);
    assert.notEqual(copy, input);
    assert.notEqual(copy.a, input.a);
    assert.notEqual(copy.a[0], input.a[0]);
    assert.notEqual(copy.c.d, input.c.d);
  });
  test("other values are returned as they are", () => {
    const date = new Date(0);
    const fn = (): number => 0;
    assert.equal(clone(date), date);
    assert.equal(clone(fn), fn);
    assert.equal(clone("x"), "x");
    assert.equal(clone(null), null);
    assert.equal(clone(undefined), undefined);
  });
  test("the values of holidayProvider, holidays, calendar and value are shared", () => {
    const shared = { nested: {} };
    for (const key of ["holidayProvider", "holidays", "calendar", "value"]) {
      const copy = clone({ [key]: shared, list: [{ [key]: shared }] }) as Record<string, unknown>;
      assert.equal(copy[key], shared, key);
      assert.equal((copy["list"] as Record<string, unknown>[])[0]![key], shared, key);
    }
  });
  test("for weekdayValues and weekly only the array is copied", () => {
    const element = { x: 1 };
    for (const key of ["weekdayValues", "weekly"]) {
      const input = { [key]: [element, element] };
      const copy = clone(input) as Record<string, unknown[]>;
      assert.notEqual(copy[key], input[key]);
      assert.equal(copy[key]![0], element);
    }
    const notArray = clone({ weekdayValues: { a: {} } }) as { weekdayValues: { a: object } };
    assert.deepEqual(notArray, { weekdayValues: { a: {} } });
  });
});

describe("join", () => {
  test("path.key, or just the key for an empty path", () => {
    assert.equal(join("a[0]", "b"), "a[0].b");
    assert.equal(join("", "b"), "b");
  });
});

describe("onlyJp", () => {
  test("true when every provider is an object with id JP", () => {
    assert.equal(onlyJp({ holidayProvider: JP }), true);
    assert.equal(onlyJp({ holidayProvider: [JP, JP] }), true);
  });
  test("false without a provider", () => {
    assert.equal(onlyJp({}), false);
    assert.equal(onlyJp({ holidayProvider: [] }), false);
    assert.equal(onlyJp({ holidayProvider: undefined }), false);
  });
  test("false when one provider has another id or is not an object", () => {
    assert.equal(onlyJp({ holidayProvider: SG }), false);
    assert.equal(onlyJp({ holidayProvider: [JP, SG] }), false);
    assert.equal(onlyJp({ holidayProvider: "JP" }), false);
    assert.equal(onlyJp({ holidayProvider: null }), false);
    assert.equal(onlyJp({ holidayProvider: [JP, null] }), false);
  });
  test("a hole in the array is read as an undefined element", () => {
    // eslint-disable-next-line no-sparse-arrays
    assert.equal(onlyJp({ holidayProvider: [JP, , JP] }), false);
  });
  test("the old key holidays is read only when holidayProvider is undefined", () => {
    assert.equal(onlyJp({ holidays: JP }), true);
    assert.equal(onlyJp({ holidayProvider: undefined, holidays: JP }), true);
    assert.equal(onlyJp({ holidayProvider: SG, holidays: JP }), false);
    assert.equal(onlyJp({ holidayProvider: null, holidays: JP }), false);
  });
});

describe("renameObject", () => {
  const run = (value: Record<string, unknown>, places = ["source"] as const, path = "") => {
    const changes: OptionChange[] = [];
    const out = renameObject(value, places, path, changes);
    return { out, changes };
  };
  test("an old key is written under its new name, with one change", () => {
    const value = { holidays: "p", other: 1 };
    const { out, changes } = run(value);
    assert.deepEqual(out, { holidayProvider: "p", other: 1 });
    assert.deepEqual(changes, [{ path: "holidays", from: "holidays", to: "holidayProvider" }]);
    assert.deepEqual(value, { holidays: "p", other: 1 });
    assert.ok(Object.isFrozen(changes[0]));
  });
  test("the change's path is under the given position", () => {
    const changes: OptionChange[] = [];
    renameObject({ day: 5 }, ["rule"], "recurring[1]", changes);
    assert.deepEqual(changes, [{ path: "recurring[1].day", from: "day", to: "dayOfMonth" }]);
  });
  test("only the tables of the given places apply, and unknown keys are copied", () => {
    const { out, changes } = run({ holiday: "x", extra: true }, ["calendar"] as never);
    assert.deepEqual(out, { holiday: "x", extra: true });
    assert.deepEqual(changes, []);
  });
  test("both names with a value: both are kept and the change is conflicting", () => {
    const { out, changes } = run({ holidays: "a", holidayProvider: "b" });
    assert.deepEqual(out, { holidays: "a", holidayProvider: "b" });
    assert.deepEqual(changes, [
      { path: "holidays", from: "holidays", to: "holidayProvider", conflicting: true },
    ]);
  });
  test("an undefined new name next to the old name: the old value is kept under the new name, in either key order", () => {
    for (const value of [
      { holidays: "a", holidayProvider: undefined },
      { holidayProvider: undefined, holidays: "a" },
    ]) {
      const { out, changes } = run(value);
      assert.deepEqual(out, { holidayProvider: "a" });
      assert.equal(changes.length, 1);
      assert.equal(changes[0]!.conflicting, undefined);
    }
  });
  test("an undefined old name next to a new name with a value: only the old name is removed", () => {
    for (const value of [
      { holidays: undefined, holidayProvider: "b" },
      { holidayProvider: "b", holidays: undefined },
    ]) {
      const { out, changes } = run(value);
      assert.deepEqual(out, { holidayProvider: "b" });
      assert.deepEqual(Object.keys(out), ["holidayProvider"]);
      assert.equal(changes.length, 1);
    }
  });
  test("an undefined old name alone is written as an undefined new name", () => {
    const { out } = run({ holidays: undefined });
    assert.deepEqual(Object.keys(out), ["holidayProvider"]);
    assert.equal(out["holidayProvider"], undefined);
  });
  test("an undefined new name without the old name is copied", () => {
    const { out, changes } = run({ holidayProvider: undefined });
    assert.deepEqual(Object.keys(out), ["holidayProvider"]);
    assert.deepEqual(changes, []);
  });
});

describe("renameValues", () => {
  const run = (value: unknown, place = "schedule", key = "holidayPolicy", path = "p") => {
    const changes: OptionChange[] = [];
    return { out: renameValues(value, place as never, key, path, changes), changes };
  };
  test("a renamed string becomes the new name, with one change at the path", () => {
    const { out, changes } = run("weekday");
    assert.equal(out, "ignore");
    assert.deepEqual(changes, [{ path: "p", from: "weekday", to: "ignore" }]);
    assert.ok(Object.isFrozen(changes[0]));
  });
  test("each element of an array is replaced in a new array, with the index in the path", () => {
    const value = ["national", "substitute", "national"];
    const { out, changes } = run(value, "rule", "kinds", "r.kinds");
    assert.deepEqual(out, ["regular", "substitute", "regular"]);
    assert.notEqual(out, value);
    assert.deepEqual(changes, [
      { path: "r.kinds[0]", from: "national", to: "regular" },
      { path: "r.kinds[2]", from: "national", to: "regular" },
    ]);
  });
  test("any other value is returned unchanged, also for a place and key without a rename", () => {
    const object = {};
    assert.equal(run("closed").out, "closed");
    assert.equal(run(object).out, object);
    assert.equal(run(undefined).out, undefined);
    assert.equal(run("weekday", "calendar").out, "weekday");
    assert.deepEqual(run("weekday", "schedule", "other").changes, []);
  });
});

describe("migrate", () => {
  const calendar = (input: unknown) =>
    migrate<Record<string, unknown>>(
      input,
      ["source", "calendar"],
      ["closedRecurringRules", "openRecurringRules"],
      null,
    );
  const schedule = (input: unknown) =>
    migrate<Record<string, unknown>>(
      input,
      ["source", "schedule"],
      ["recurringRules"],
      "holidayPolicy",
    );
  test("invalid-argument when the input is not an options object", () => {
    for (const input of [null, undefined, "x", 1, [], new Map(), new Date(0)])
      assert.throws(() => calendar(input), { name: "RangeError", code: "invalid-argument" });
  });
  test("the result and changes are frozen; options is a new object that is not frozen", () => {
    const input = { closedWeekdays: [0, 6] };
    const result = calendar(input);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.changes));
    assert.equal(Object.isFrozen(result.options), false);
    assert.notEqual(result.options, input);
    assert.notEqual(result.options["closedWeekdays"], input.closedWeekdays);
    assert.deepEqual(result.options, input);
    assert.deepEqual(result.changes, []);
  });
  test("top-level keys of the given places are renamed", () => {
    const result = calendar({ holidays: SG, maxSearchDays: 10, closedAnnual: [] });
    assert.deepEqual(result.options, {
      holidayProvider: SG,
      searchDayLimit: 10,
      closedAnnualDates: [],
    });
    assert.deepEqual(
      result.changes.map((c) => `${c.path}: ${c.from} -> ${c.to}`),
      [
        "holidays: holidays -> holidayProvider",
        "maxSearchDays: maxSearchDays -> searchDayLimit",
        "closedAnnual: closedAnnual -> closedAnnualDates",
      ],
    );
  });
  test("keys of the rules in the rule lists are renamed; paths use the names as written", () => {
    const result = calendar({
      closedRecurring: [{ day: 5, onHolidayRule: "skip" }, "not an object"],
    });
    assert.deepEqual(result.options, {
      closedRecurringRules: [{ dayOfMonth: 5, holidayOverlapPolicy: "skip" }, "not an object"],
    });
    assert.deepEqual(
      result.changes.map((c) => c.path),
      ["closedRecurring", "closedRecurring[0].day", "closedRecurring[0].onHolidayRule"],
    );
    const written = calendar({ openRecurringRules: [{ day: 1 }] });
    assert.deepEqual(
      written.changes.map((c) => c.path),
      ["openRecurringRules[0].day"],
    );
  });
  test("kinds national becomes regular only when every provider has the ID JP", () => {
    const rules = [{ holiday: true, kinds: ["national", "substitute"] }];
    const jp = calendar({ holidayProvider: JP, closedRecurringRules: rules });
    assert.deepEqual(jp.options["closedRecurringRules"], [
      { holiday: true, kinds: ["regular", "substitute"] },
    ]);
    assert.deepEqual(jp.changes, [
      { path: "closedRecurringRules[0].kinds[0]", from: "national", to: "regular" },
    ]);
    for (const provider of [SG, [JP, SG], undefined]) {
      const other = calendar({ holidayProvider: provider, closedRecurringRules: rules });
      assert.deepEqual((other.options["closedRecurringRules"] as unknown[])[0], rules[0]);
      assert.deepEqual(other.changes, []);
    }
  });
  test("the value of policyValueKey is renamed, with the key as written in the path", () => {
    const old = schedule({ holiday: "weekday" });
    assert.deepEqual(old.options, { holidayPolicy: "ignore" });
    assert.deepEqual(old.changes, [
      { path: "holiday", from: "holiday", to: "holidayPolicy" },
      { path: "holiday", from: "weekday", to: "ignore" },
    ]);
    const current = schedule({ holidayPolicy: "weekday" });
    assert.deepEqual(current.changes, [{ path: "holidayPolicy", from: "weekday", to: "ignore" }]);
    assert.deepEqual(calendar({ holidayPolicy: "weekday" }).options, { holidayPolicy: "weekday" });
  });
  test("a key written under both names is kept on both sides and marked conflicting", () => {
    const result = calendar({ holidays: JP, holidayProvider: SG });
    assert.deepEqual(result.options, { holidays: JP, holidayProvider: SG });
    assert.deepEqual(result.changes, [
      { path: "holidays", from: "holidays", to: "holidayProvider", conflicting: true },
    ]);
  });
});

describe("migrateCalendarOptions", () => {
  test("rewrites the names of business-calendar options", () => {
    const result = migrateCalendarOptions({
      holidays: JP,
      outOfRange: "ignore",
      closedRecurring: [{ day: 5, kinds: ["national"] }],
      openRecurring: [{ onHolidayRule: "apply" }],
      maxSearchDays: 30,
      unknownKey: 1,
    });
    assert.deepEqual(result.options, {
      holidayProvider: JP,
      outOfRangePolicy: "ignore",
      closedRecurringRules: [{ dayOfMonth: 5, kinds: ["regular"] }],
      openRecurringRules: [{ holidayOverlapPolicy: "apply" }],
      searchDayLimit: 30,
      unknownKey: 1,
    });
    assert.equal(result.changes.length, 8);
  });
  test("schedule-only names are not rewritten", () => {
    const result = migrateCalendarOptions({
      weekly: [],
      holiday: "weekday",
      recurring: [{ day: 1 }],
    });
    assert.deepEqual(result.options, { weekly: [], holiday: "weekday", recurring: [{ day: 1 }] });
    assert.deepEqual(result.changes, []);
  });
  test("options with only new names give no changes, and applying it again gives the same result", () => {
    const first = migrateCalendarOptions({ holidays: JP, closedRecurring: [{ day: 5 }] });
    const second = migrateCalendarOptions(first.options);
    assert.deepEqual(second.options, first.options);
    assert.deepEqual(second.changes, []);
  });
  test("invalid-argument when options is not a plain object", () => {
    assert.throws(() => migrateCalendarOptions([] as never), {
      name: "RangeError",
      code: "invalid-argument",
    });
    assert.throws(() => migrateCalendarOptions(null as never), { code: "invalid-argument" });
  });
});

describe("migrateScheduleOptions", () => {
  test("rewrites the names of schedule options, including the value of holidayPolicy", () => {
    const value = { shared: true };
    const result = migrateScheduleOptions({
      holidays: JP,
      weekly: [value, value],
      holiday: "weekday",
      annual: [{ date: "01-01", value }],
      recurring: [{ day: 5, kinds: ["national"], value }],
    });
    assert.deepEqual(result.options, {
      holidayProvider: JP,
      weekdayValues: [value, value],
      holidayPolicy: "ignore",
      annualDates: [{ date: "01-01", value }],
      recurringRules: [{ dayOfMonth: 5, kinds: ["regular"], value }],
    });
    const options = result.options as unknown as {
      weekdayValues: unknown[];
      recurringRules: { value: unknown }[];
    };
    assert.equal(options.weekdayValues[0], value);
    assert.equal(options.recurringRules[0]!.value, value);
  });
  test("calendar-only names are not rewritten", () => {
    const result = migrateScheduleOptions({ closedRecurring: [{ day: 1 }], maxSearchDays: 5 });
    assert.deepEqual(result.options, { closedRecurring: [{ day: 1 }], maxSearchDays: 5 });
    assert.deepEqual(result.changes, []);
  });
  test("invalid-argument when options is not a plain object", () => {
    assert.throws(() => migrateScheduleOptions("x" as never), {
      name: "RangeError",
      code: "invalid-argument",
    });
  });
});
