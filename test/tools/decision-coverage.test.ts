import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decisionCoverage,
  decisionSections,
  mentions,
  optionKeysOf,
  publicNamesOf,
} from "../../scripts/decision-coverage.ts";

// Checks, with small inputs, the check that the decisions document decides the public option keys and names
// (scripts/decision-coverage.ts)

const API = `### AOptions (@public)

\`\`\`ts
export interface AOptions<Kind extends string = string> extends BOptions<Kind> {
    readonly searchDayLimit?: number;
    readonly policy?: "x" | "y";
    readonly maxSearchDays?: number;
    readonly rename?: (input: {
        readonly name: string;
    }) => string;
    readonly holidaysInYear?: never;
}
\`\`\`

\`\`\`ts
export interface BOptions {
    readonly policy?: "p" | "q";
}
\`\`\`

\`\`\`ts
export interface WeekdayPattern {
    readonly weekday: number;
    readonly cycle?: undefined;
}
\`\`\`

\`\`\`ts
export interface Calendar {
    readonly timeZone: string;
    isOpen(input: string): boolean;
    isOpen(input: Date): boolean;
}
\`\`\`

\`\`\`ts
export declare function addThings(a: number): number;
\`\`\`
`;
// Quoted words in comments ("throw", "not-a-code") are not counted as codes
const ERRORS = `export type KnownErrorCode =\n  /** 説明の中の "throw" は code ではない; 「;」があっても型は切れない */\n  | "no-thing"\n  // "not-a-code"\n  | "bad-thing";\n`;
const DECISIONS = `## 章

### 1. 上限

\`searchDayLimit\` の既定は 10 です。\`{ policy: "x" }\` が既定です。\`addThings\` と \`no-thing\`。

### 2. 別の型の方針

\`policy\` の既定は \`"p"\` です。\`rename\`・\`weekday\`・\`isOpen\`・\`bad-thing\`。
`;
const OPTIONS = {
  "AOptions.searchDayLimit": 1,
  "AOptions.policy": 1,
  "AOptions.rename": 2,
  "BOptions.policy": 2,
  "RecurringRule.weekday": 2,
};
const check = (optionDecisions: Record<string, unknown>, undocumented: Record<string, unknown>) =>
  decisionCoverage({
    api: API,
    errorsSource: ERRORS,
    decisions: DECISIONS,
    optionDecisions,
    undocumented,
  });

test("decision-coverage: 設定の項目は、型ごとに数え、入れ子の項目・never・undefined の項目は数えない", () => {
  assert.deepEqual(optionKeysOf(API), {
    keys: [
      "AOptions.policy",
      "AOptions.rename",
      "AOptions.searchDayLimit",
      "BOptions.policy",
      "RecurringRule.weekday",
    ],
    unclassified: [],
  });
  assert.deepEqual(publicNamesOf(API, ERRORS), ["addThings", "bad-thing", "isOpen", "no-thing"]);
  assert.deepEqual([...decisionSections(DECISIONS).keys()], [1, 2]);
  assert.equal(mentions('`{ policy: "x" }` が既定', "policy"), true);
  // A word outside backticks, and a part of another name, are not counted
  assert.equal(mentions("policy の既定", "policy"), false);
  assert.equal(mentions("`holidayPolicy` の既定", "policy"), false);
  assert.equal(mentions("`no-thing-else`", "no-thing"), false);
  assert.equal(mentions("`policy2`・`my_policy`", "policy"), false);
  // A word outside code spans, between two code spans, is not counted
  assert.equal(mentions("`a` policy `b`", "policy"), false);
  assert.equal(mentions("`a` と `policy` と `b`", "policy"), true);
  // A name inside a written position (`rules[0].policy`) is counted
  assert.equal(mentions("`rules[0].policy`", "policy"), true);
});

test("decision-coverage: そろっていれば合格し、欠けた行・名前のない決定・要らない行を失敗にする", () => {
  assert.deepEqual(check(OPTIONS, {}), { failures: [], optionKeys: 5, names: 4, mentioned: 4 });
  const fails = (o: Record<string, unknown>, u: Record<string, unknown> = {}): string[] =>
    check(o, u).failures;
  // An old name of 0.30.0 (maxSearchDays; the same type has the new name) is not counted
  // A property missing in the list
  const { "BOptions.policy": _dropped, ...withoutB } = OPTIONS;
  assert.match(fails(withoutB).join("\n"), /BOptions\.policy is not listed/);
  // The decision pointed at does not mention the property's name (searchDayLimit does not occur in #2)
  assert.match(
    fails({ ...OPTIONS, "AOptions.searchDayLimit": 2 }).join("\n"),
    /AOptions\.searchDayLimit points to decision 2, but that decision does not mention `searchDayLimit`/,
  );
  // A number that does not exist
  assert.match(
    fails({ ...OPTIONS, "AOptions.searchDayLimit": 9 }).join("\n"),
    /AOptions\.searchDayLimit points to 9, which is not a decision/,
  );
  // A property the public types lack
  assert.match(
    fails({ ...OPTIONS, "AOptions.gone": 1 }).join("\n"),
    /AOptions\.gone is listed, but it is not an option/,
  );
  // A name that occurs in a decision is in the list of reasons for no decision
  assert.match(
    fails(OPTIONS, { addThings: "x" }).join("\n"),
    /addThings is listed, but a decision mentions it now/,
  );
  // Something that is not a public name is listed
  assert.match(fails(OPTIONS, { gone: "x" }).join("\n"), /gone is listed, but it is not a public/);
});

test("decision-coverage: 決定に現れない名前は、理由付きで一覧に載っていれば合格する", () => {
  const decisions = DECISIONS.replace("`addThings` と ", "");
  const run = (undocumented: Record<string, unknown>): string[] =>
    decisionCoverage({
      api: API,
      errorsSource: ERRORS,
      decisions,
      optionDecisions: OPTIONS,
      undocumented,
    }).failures;
  assert.match(run({}).join("\n"), /addThings is public but no decision mentions it/);
  assert.deepEqual(run({ addThings: "定義そのもの" }), []);
  assert.match(run({ addThings: "" }).join("\n"), /addThings needs a reason/);
});

test("decision-coverage: 設定の型でない入力の型は、省略できる項目を確かめ、分類のない型は失敗にする", () => {
  const api = `${API}
\`\`\`ts
export interface HolidayProvider {
    readonly id: string;
    readonly confirmedThrough?: number;
}
\`\`\`

\`\`\`ts
export type ScheduleHolidayPolicy<Value> = "ignore" | {
    readonly value: Value;
} | {
    readonly sameAs: number;
};
\`\`\`

\`\`\`ts
export interface DayInfo {
    readonly open: boolean;
}
\`\`\`

\`\`\`ts
export interface NewThing {
    readonly size?: number;
}
\`\`\`
`;
  const found = optionKeysOf(api);
  // For the provider contract only the optional properties; for the holiday value every property. Properties of
  // a result type (DayInfo) are not counted
  assert.deepEqual(
    found.keys.filter((k) => !k.startsWith("AOptions") && !k.startsWith("BOptions")),
    [
      "HolidayProvider.confirmedThrough",
      "RecurringRule.weekday",
      "ScheduleHolidayPolicy.sameAs",
      "ScheduleHolidayPolicy.value",
    ],
  );
  assert.deepEqual(found.unclassified, ["NewThing"]);
  const { failures } = decisionCoverage({
    api,
    errorsSource: ERRORS,
    decisions: DECISIONS,
    optionDecisions: OPTIONS,
    undocumented: {},
  });
  assert.match(failures.join("\n"), /the public type NewThing has members but is not classified/);
  assert.match(failures.join("\n"), /ScheduleHolidayPolicy\.sameAs is not listed/);
});
