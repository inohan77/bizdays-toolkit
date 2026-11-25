// The parts of the checks that keep the promises of the diagnostics (scripts/promise-parts.ts): the dimensions of
// the promise inventory and their table, the table of lines the promise checks do not reach, and the table of
// what is not verified. Each check is shown to fail on the mistake it is for (G7 of the plan)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  allCells,
  cellKey,
  checkCoverageTable,
  checkConditions,
  checkDimensions,
  checkUnverified,
  hasCountingRule,
  periodClass,
  providerClass,
  yearClass,
  type CoverageBlock,
  type UnverifiedRow,
} from "../../scripts/promise-parts.ts";
import { canonical, compareRemoval, resultsOf } from "../support/promise-days.ts";

const RANGE = { from: 1955, to: 2099 };

test("次元: 提供元の対応年を、診断の範囲と比べて分ける", () => {
  assert.equal(providerClass(null, RANGE), "none");
  assert.equal(providerClass({ from: 1955, to: 2099 }, RANGE), "same");
  assert.equal(providerClass({ from: 2020, to: 2027 }, RANGE), "inside");
  assert.equal(providerClass({ from: 2000, to: 2100 }, RANGE), "straddle");
  assert.equal(providerClass({ from: 1800, to: 2400 }, RANGE), "cover");
  assert.equal(providerClass({ from: 2099, to: 2200 }, RANGE), "straddle");
  assert.equal(providerClass({ from: 2200, to: 2300 }, RANGE), "outside");
});

test("次元: 個別の日付・有効期間を、診断の範囲の中・またぐ・外に分ける（片側だけの有効期間は暦日の範囲の端まで）", () => {
  assert.equal(periodClass("2026-01-01", "2026-12-31", RANGE), "inside");
  assert.equal(periodClass("1954-12-31", "1955-01-01", RANGE), "straddle");
  assert.equal(periodClass("2100-01-01", "2100-01-01", RANGE), "outside");
  assert.equal(periodClass("1000-01-01", "1954-12-31", RANGE), "outside");
  assert.equal(yearClass({}, RANGE), "no items");
  assert.equal(yearClass({ closedDates: ["2026-01-05"] }, RANGE), "inside");
  assert.equal(
    yearClass({ closedDates: ["2026-01-05", { from: "2099-12-30", to: "2100-01-02" }] }, RANGE),
    "straddle",
  );
  assert.equal(
    yearClass({ closedRecurringRules: [{ weekday: 1, effectiveFrom: "2206-01-01" }] }, RANGE),
    "outside",
  );
  assert.equal(
    yearClass({ closedRecurringRules: [{ weekday: 1, effectiveTo: "2000-01-01" }] }, RANGE),
    "straddle",
  );
  assert.equal(yearClass({ dates: [{ date: "1950-05-01", value: "X" }] }, RANGE), "outside");
});

test("次元: 営業日を数える規則があるか", () => {
  assert.equal(hasCountingRule({ closedRecurringRules: [{ businessDayOfMonth: 1 }] }), true);
  assert.equal(
    hasCountingRule({ recurringRules: [{ businessDayOfWeek: 1, weekStart: 1, value: "A" }] }),
    true,
  );
  assert.equal(hasCountingRule({ closedRecurringRules: [{ weekday: 1 }] }), false);
});

test("次元の表: 外していない組が 0 件なら失敗し、外した組は理由・実在・0 件を確かめる", () => {
  const all = allCells();
  assert.equal(all.length, 176);
  const counts = new Map(all.map((k) => [k, 1]));
  assert.deepEqual(checkDimensions(counts, { excluded: {} }), []);
  const missing = cellKey({
    kind: "calendar",
    provider: "cover",
    policy: "throw",
    counting: "counting rule",
    years: "straddle",
  });
  counts.delete(missing);
  assert.deepEqual(checkDimensions(counts, { excluded: {} }), [
    `no options were made for the cell: ${missing}`,
  ]);
  assert.deepEqual(checkDimensions(counts, { excluded: { [missing]: "理由" } }), []);
  assert.deepEqual(checkDimensions(counts, { excluded: { [missing]: " " } }), [
    `excluded cell without a reason: ${missing}`,
  ]);
  counts.set(missing, 2);
  assert.deepEqual(checkDimensions(counts, { excluded: { [missing]: "理由" } }), [
    `excluded cell was made 2 time(s) (remove the entry): ${missing}`,
  ]);
  assert.deepEqual(checkDimensions(counts, { excluded: { "calendar | x": "理由" } }), [
    "excluded cell does not exist: calendar | x",
  ]);
});

test("仕様の条件の一覧: 一覧の条件が 0 件なら失敗し、一覧にない条件が出ても失敗する（表の一覧は、4 つの分のどれにも出る条件）", () => {
  const table = { conditions: ["rule: weekday", "basis: throws TypeError"] };
  assert.deepEqual(
    checkConditions({ "rule: weekday": 3, "basis: throws TypeError": 1 }, table),
    [],
  );
  assert.deepEqual(checkConditions({ "rule: weekday": 3 }, table), [
    "no options were checked with the condition: basis: throws TypeError",
  ]);
  assert.deepEqual(checkConditions({ "rule: weekday": 3, "basis: throws TypeError": 0 }, table), [
    "no options were checked with the condition: basis: throws TypeError",
  ]);
  assert.deepEqual(
    checkConditions(
      { "rule: weekday": 3, "basis: throws TypeError": 1, "value: a Date": 2 },
      table,
    ),
    ["condition not listed in etc/promise-dimensions.json: value: a Date"],
  );
  assert.deepEqual(
    checkConditions({ "rule: weekday": 1 }, { conditions: ["rule: weekday", "rule: weekday"] }),
    ["a condition is listed twice"],
  );
  // The list of the repository: no name twice, and the conditions of the inputs that 0.32.9 changed the
  // handling of are listed
  const listed = (
    JSON.parse(readFileSync("etc/promise-dimensions.json", "utf8")) as { conditions: string[] }
  ).conditions;
  assert.equal(new Set(listed).size, listed.length);
  for (const name of [
    "basis: throws TypeError",
    "basis: throws null",
    "basis: a copy of a created calendar",
    "basis: supported years differ from those of the schedule",
    "basis: unconfirmedHolidayPolicy throw",
    "value: a getter that throws",
    "value: a proxy whose reading throws",
  ])
    assert.ok(listed.includes(name), name);
});

const block = (first: string, lines = 1): CoverageBlock => ({
  function: "reportRedundant",
  first,
  lines,
  at: 10,
  detail: "10",
});
const entry = (first: string, lines = 1, kind = "unreachable", reason = "理由") => ({
  function: "reportRedundant",
  first,
  lines,
  kind,
  reason,
});

test("通らない行の表: 表にないかたまり、どのかたまりとも合わない行、理由・種類の誤りで失敗する", () => {
  assert.deepEqual(checkCoverageTable([block("throw x;")], { blocks: [entry("throw x;")] }), []);
  assert.match(
    checkCoverageTable([block("throw x;")], { blocks: [] })[0]!,
    /^NOT IN TABLE reportRedundant line 10/,
  );
  assert.match(
    checkCoverageTable([], { blocks: [entry("throw x;")] })[0]!,
    /matches no block \(it ran or changed/,
  );
  // The number of lines is part of the match
  assert.equal(
    checkCoverageTable([block("throw x;", 2)], { blocks: [entry("throw x;")] }).length,
    2,
  );
  // One entry stands for one block
  assert.equal(
    checkCoverageTable([block("throw x;"), block("throw x;")], { blocks: [entry("throw x;")] })
      .length,
    1,
  );
  assert.match(
    checkCoverageTable([block("throw x;")], { blocks: [entry("throw x;", 1, "result")] })[0]!,
    /has the kind "result"/,
  );
  assert.match(
    checkCoverageTable([block("throw x;")], {
      blocks: [entry("throw x;", 1, "unreachable", "")],
    })[0]!,
    /without a reason/,
  );
});

const row = (state: string, evidence = "確かめた"): UnverifiedRow => ({
  id: "U1",
  content: "内容",
  foundIn: "0.32.9",
  state,
  evidence,
});

test("確かめていないことの表: open はリリースの前の確認で失敗し、形だけの確認では通る", () => {
  const exists = (f: string): boolean => f === "docs/guide.md";
  assert.deepEqual(checkUnverified([row("verified")], exists, false), []);
  assert.deepEqual(checkUnverified([row("open", "")], exists, false), ["U1: OPEN 内容"]);
  assert.deepEqual(checkUnverified([row("open", "")], exists, true), []);
  assert.deepEqual(checkUnverified([row("verified", "")], exists, false), [
    "U1: the state verified without evidence",
  ]);
  assert.deepEqual(checkUnverified([row("closed")], exists, false), [
    'U1: unknown state "closed" (open, verified, no-options, documented)',
  ]);
  assert.deepEqual(
    checkUnverified([row("documented", "`docs/guide.md` の項目")], exists, false),
    [],
  );
  assert.deepEqual(checkUnverified([row("documented", "ガイド")], exists, false), [
    "U1: documented, but the evidence names no file (write it in backquotes)",
  ]);
  // The missing path is built from parts (written whole, the check of the paths in the repository would stop it)
  const missing = ["docs", "nothing.md"].join("/");
  assert.deepEqual(checkUnverified([row("documented", `\`${missing}\``)], exists, false), [
    `U1: the evidence names ${missing}, which does not exist`,
  ]);
  assert.deepEqual(checkUnverified([row("verified"), row("verified")], exists, false), [
    "two rows with the id U1",
  ]);
});

test("比べる値の文字列（test/support/promise-days.ts の resultsOf）: 診断が区別する値を区別し、同じ中身の値は同じになる", () => {
  const date = new Date(0);
  const fn = (): number => 1;
  const different: [unknown, unknown][] = [
    [Number.NaN, null],
    [undefined, fn],
    [{ a: undefined }, {}],
    [date, date.toISOString()],
    [date, new Date(0)],
    [-0, 0],
    [1, 1n],
    [true, "true"],
    [fn, (): number => 1],
    [Symbol("s"), Symbol("s")],
    [
      [1, [2]],
      [1, [3]],
    ],
  ];
  for (const [a, b] of different)
    assert.notEqual(canonical(a), canonical(b), `${String(a)} / ${String(b)}`);
  const same: [unknown, unknown][] = [
    [
      { b: 1, a: [2, { c: "x" }] },
      { a: [2, { c: "x" }], b: 1 },
    ],
    [Object.assign(Object.create(null) as object, { k: 1 }), { k: 1 }],
    [date, date],
    [fn, fn],
    [Number.NaN, Number.NaN],
    // The same object held twice, and two equal objects (the diagnostics compare content, not sharing)
    [((one) => ({ x: one, y: one }))({ k: "S" }), { x: { k: "S" }, y: { k: "S" } }],
  ];
  for (const [a, b] of same) assert.equal(canonical(a), canonical(b));
  // Values that refer to themselves, nested deeper than the stack, and whose reading throws
  const self = (): object => {
    const o: Record<string, unknown> = { k: 1 };
    o["self"] = o;
    return o;
  };
  assert.equal(canonical(self()), canonical(self()));
  let deep: unknown = "x";
  for (let i = 0; i < 20_000; i++) deep = [deep];
  assert.equal(canonical(deep).length, 2 * 20_000 + 3);
  const hostile = {
    get x(): number {
      throw new Error("boom");
    },
  };
  assert.equal(canonical(hostile), canonical(hostile));
  assert.notEqual(
    canonical(hostile),
    canonical({
      get x(): number {
        throw new Error("boom");
      },
    }),
  );
  // A value of undefined before the removal and another value after it is a change, not an error
  const values = [undefined, "A"];
  let n = 0;
  const before = resultsOf(() => values[0], ["2026-01-05"]);
  const after = resultsOf(() => values[n++ + 1], ["2026-01-05"]);
  assert.deepEqual(compareRemoval(before, after), { changed: [0], throws: [], outside: 0 });
  assert.deepEqual(
    resultsOf(() => {
      throw Object.assign(new Error("x"), { code: "out-of-range" });
    }, ["2026-01-05"]),
    ["E:out-of-range"],
  );
});
