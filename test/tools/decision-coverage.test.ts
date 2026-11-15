import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decisionCoverage,
  decisionSections,
  mentions,
  optionKeysOf,
  publicNamesOf,
} from "../../scripts/decision-coverage.ts";

// 決定の文書が公開の設定の項目と名前を決めているかの検査（scripts/decision-coverage.ts）を、小さな入力で確かめる

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
// コメントの中の引用符の語（"throw"・"not-a-code"）は、code と数えない
const ERRORS = `export type KnownErrorCode =\n  /** 説明の中の "throw" は code ではない */\n  | "no-thing"\n  // "not-a-code"\n  | "bad-thing";\n`;
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
  // バッククォートの外の語と、別の名前の一部は数えない
  assert.equal(mentions("policy の既定", "policy"), false);
  assert.equal(mentions("`holidayPolicy` の既定", "policy"), false);
  assert.equal(mentions("`no-thing-else`", "no-thing"), false);
  assert.equal(mentions("`policy2`・`my_policy`", "policy"), false);
  // 2 つのコード片の間にある、コード片の外の語は数えない
  assert.equal(mentions("`a` policy `b`", "policy"), false);
  assert.equal(mentions("`a` と `policy` と `b`", "policy"), true);
  // 位置の書き方（`rules[0].policy`）の中の名前は数える
  assert.equal(mentions("`rules[0].policy`", "policy"), true);
});

test("decision-coverage: そろっていれば合格し、欠けた行・名前のない決定・要らない行を失敗にする", () => {
  assert.deepEqual(check(OPTIONS, {}), { failures: [], optionKeys: 5, names: 4, mentioned: 4 });
  const fails = (o: Record<string, unknown>, u: Record<string, unknown> = {}): string[] =>
    check(o, u).failures;
  // 0.30.0 の旧名（maxSearchDays。同じ型に新しい名前がある）は数えない
  // 一覧にない項目
  const { "BOptions.policy": _dropped, ...withoutB } = OPTIONS;
  assert.match(fails(withoutB).join("\n"), /BOptions\.policy is not listed/);
  // 指した決定に、項目の名前がない（searchDayLimit は 2 番に現れない）
  assert.match(
    fails({ ...OPTIONS, "AOptions.searchDayLimit": 2 }).join("\n"),
    /AOptions\.searchDayLimit points to decision 2, but that decision does not mention `searchDayLimit`/,
  );
  // ない番号
  assert.match(
    fails({ ...OPTIONS, "AOptions.searchDayLimit": 9 }).join("\n"),
    /AOptions\.searchDayLimit points to 9, which is not a decision/,
  );
  // 公開の型にない項目
  assert.match(
    fails({ ...OPTIONS, "AOptions.gone": 1 }).join("\n"),
    /AOptions\.gone is listed, but it is not an option/,
  );
  // 決定に現れる名前を、理由を書かない一覧に載せている
  assert.match(
    fails(OPTIONS, { addThings: "x" }).join("\n"),
    /addThings is listed, but a decision mentions it now/,
  );
  // 公開の名前でないものを載せている
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
  // 提供元の契約は省略できる項目だけ、祝日の値はすべての項目。結果の型（DayInfo）の項目は数えない
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
