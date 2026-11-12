// null・配列の穴・単日と期間の併記の種類のテスト（decisions.md の 6 番・8 番）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
  monthOf,
  closingPeriod,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { jp } from "../src/jp/index.ts";
import { COMMON_RULE_KEYS, CONTEXTS, picker, random, SHAPES } from "./support/catalog.ts";

type Obj = Record<string, unknown>;

/** 作成の例外の code（作成できれば undefined） */
const codeOf = (f: () => unknown): string | undefined => {
  try {
    f();
    return undefined;
  } catch (error) {
    assert.ok(isBizdaysError(error), `code のない例外: ${String(error)}`);
    return error.code;
  }
};
const errorCodes = (diagnostics: readonly { severity: string; code: string }[]): string[] =>
  diagnostics.filter((d) => d.severity === "error").map((d) => d.code);

/** etc/api.md の公開の型のキー（突き合わせのため。改名した旧名は 10 番どおり読み替えるので、同じく確かめる） */
function apiKeys(name: string): string[] {
  const api = readFileSync(new URL("../etc/api.md", import.meta.url), "utf8");
  const body = new RegExp(`export interface ${name}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(api)?.[1];
  assert.ok(body, name);
  return [...body.matchAll(/readonly (\w+)\??:/g)].map((m) => m[1]!);
}

test("null は省略ではなく値の誤り: 設定・規則・メソッドのオプションのどのキーに null を書いても、作成は code 付きの例外、診断は同じ code の error（decisions.md の 6 番）", () => {
  const schedule = createSchedule({ weekdayValues: [1, 1, 1, 1, 1, 1, 1] });
  const cases: [
    label: string,
    create: () => unknown,
    diagnose: () => readonly { severity: string; code: string }[],
  ][] = [];
  const calendarKeys = [...apiKeys("HolidaySourceOptions"), ...apiKeys("CalendarOptions")];
  for (const key of calendarKeys)
    cases.push([
      `createCalendar.${key}`,
      () => createCalendar({ [key]: null } as never),
      () => diagnoseCalendar({ [key]: null } as never),
    ]);
  // スケジュールの weekdayValues の要素と value は値（null も値）なので、キーそのものの null だけを確かめる
  for (const key of [...apiKeys("HolidaySourceOptions"), ...apiKeys("ScheduleOptions")]) {
    const options = { weekdayValues: [1, 1, 1, 1, 1, 1, 1], [key]: null };
    cases.push([
      `createSchedule.${key}`,
      () => createSchedule(options as never),
      () => diagnoseSchedule(options as never),
    ]);
  }
  for (const key of apiKeys("CombineCalendarsOptions"))
    cases.push([
      `combineCalendars.${key}`,
      () =>
        combineCalendars([createCalendar(), createCalendar()], {
          open: "all",
          [key]: null,
        } as never),
      () => [],
    ]);
  for (const key of apiKeys("CalendarFromScheduleOptions"))
    cases.push([
      `createCalendarFromSchedule.${key}`,
      () => createCalendarFromSchedule(schedule, (v) => v === 1, { [key]: null } as never),
      () => [],
    ]);
  // 規則の形ごとのキー（目録の形の一覧は、etc/api.md の型と test/tools/catalog.test.ts で突き合わせている）
  const p = picker(random(20261112));
  for (const shape of SHAPES)
    for (const key of [...shape.keys, ...COMMON_RULE_KEYS]) {
      const rule = { ...shape.make(p, CONTEXTS.properties), [key]: null };
      const options = { holidayProvider: jp, closedRecurringRules: [rule] };
      cases.push([
        `${shape.pattern}.${key}`,
        () => createCalendar(options as never),
        () => diagnoseCalendar(options as never),
      ]);
    }
  assert.ok(cases.length > 60, `確かめた組み合わせが少ない: ${cases.length}`);
  for (const [label, create, diagnose] of cases) {
    const code = codeOf(create);
    assert.ok(code !== undefined, `${label}: null を黙って通した`);
    const errors = errorCodes(diagnose());
    if (errors.length > 0)
      assert.ok(errors.includes(code), `${label}: 作成は ${code}、診断は ${errors.join(", ")}`);
  }
  // 時刻の分の null も値の誤り（省略と同じなのは undefined だけ）
  assert.equal(
    codeOf(() =>
      createCalendar().civilOf({ year: 2026, month: 1, day: 1, hour: 1, minute: null } as never),
    ),
    "invalid-time",
  );
  // 文字列にできない分の値も、code 付きの invalid-time（メッセージの組み立てで落ちない。decisions.md の 3 番）
  assert.equal(
    codeOf(() =>
      createCalendar().civilOf({
        year: 2026,
        month: 1,
        day: 1,
        hour: 1,
        minute: [Symbol("s")],
      } as never),
    ),
    "invalid-time",
  );
});

test("単日と期間の併記: 個別の日付・毎年の月日の 5 つの配列で、date と from・to を併記すると作成は invalid-option、診断も同じ error。片方が明示的な undefined なら通る（decisions.md の 8 番）", () => {
  const calendarLists: [string, Obj][] = [
    ["closedDates", { date: "2026-12-31", from: "2026-12-29", to: "2027-01-03" }],
    ["openDates", { date: "2026-12-31", from: "2026-12-29" }],
    ["closedAnnualDates", { date: "12-31", to: "01-03" }],
  ];
  for (const [key, entry] of calendarLists) {
    assert.equal(
      codeOf(() => createCalendar({ [key]: [entry] } as never)),
      "invalid-option",
      key,
    );
    assert.deepEqual(
      errorCodes(diagnoseCalendar({ [key]: [entry] } as never)),
      ["invalid-option"],
      key,
    );
    const single = { ...entry, from: undefined, to: undefined };
    assert.equal(
      codeOf(() => createCalendar({ [key]: [single] } as never)),
      undefined,
      `${key} undefined`,
    );
  }
  const scheduleLists: [string, Obj][] = [
    ["dates", { date: "2026-12-31", from: "2026-12-29", to: "2027-01-03", value: 0 }],
    ["annualDates", { date: "12-31", from: "12-29", to: "01-03", value: 0 }],
  ];
  for (const [key, entry] of scheduleLists) {
    const options = { weekdayValues: [1, 1, 1, 1, 1, 1, 1], [key]: [entry] };
    assert.equal(
      codeOf(() => createSchedule(options as never)),
      "invalid-option",
      key,
    );
    assert.deepEqual(errorCodes(diagnoseSchedule(options as never)), ["invalid-option"], key);
    const range = { ...entry, date: undefined };
    assert.equal(
      codeOf(() => createSchedule({ ...options, [key]: [range] } as never)),
      undefined,
      `${key} undefined`,
    );
  }
});

test("配列の穴は undefined の要素と同じ: 設定の配列・holidayProvider・combineCalendars の引数で、穴と明示的な undefined の要素は同じ code（decisions.md の 6 番）。weekdayValues の穴は値 undefined", () => {
  const hole = (before: unknown[], after: unknown[]): unknown[] => {
    const list: unknown[] = [...before];
    list.length = before.length + 1; // 穴を 1 つ空ける
    list.push(...after);
    return list;
  };
  const rule = (extra: Obj): Obj => ({ weekday: 1, ...extra });
  const cases: [string, (v: unknown[]) => () => unknown][] = [
    ["closedDates", (v) => () => createCalendar({ closedDates: v } as never)],
    ["openDates", (v) => () => createCalendar({ openDates: v } as never)],
    ["closedAnnualDates", (v) => () => createCalendar({ closedAnnualDates: v } as never)],
    ["closedRecurringRules", (v) => () => createCalendar({ closedRecurringRules: v } as never)],
    ["closedWeekdays", (v) => () => createCalendar({ closedWeekdays: v } as never)],
    [
      "months",
      (v) => () => createCalendar({ closedRecurringRules: [rule({ months: v })] } as never),
    ],
    ["nth", (v) => () => createCalendar({ closedRecurringRules: [rule({ nth: v })] } as never)],
    [
      "holidayProvider",
      (v) => () => createCalendar({ holidayProvider: v, timeZone: "Asia/Tokyo" } as never),
    ],
    ["combineCalendars", (v) => () => combineCalendars(v as never, { open: "all" })],
  ];
  const valid: Record<string, unknown> = {
    closedDates: "2026-01-01",
    openDates: "2026-01-02",
    closedAnnualDates: "01-01",
    closedRecurringRules: { weekday: 0 },
    closedWeekdays: 0,
    months: 1,
    nth: 1,
    holidayProvider: jp,
    combineCalendars: createCalendar({ timeZone: "Asia/Tokyo" }),
  };
  for (const [label, make] of cases) {
    const v = valid[label];
    const withHole = codeOf(make(hole([v], [v])));
    const withUndefined = codeOf(make([v, undefined, v]));
    assert.ok(withHole !== undefined, `${label}: 穴を黙って飛ばした`);
    assert.equal(withHole, withUndefined, label);
  }
  const values: unknown[] = [1];
  values.length = 7;
  values.fill(1, 2);
  assert.equal(createSchedule({ weekdayValues: values as never }).valueOn("2026-11-09"), undefined); // 月曜日
});

test("monthOf の月と暦日の読み分けは closingPeriod と同じ（ハイフンで区切った部分が 3 つ以上なら暦日。decisions.md の 8 番）", () => {
  for (const input of [
    "2026-11-05T10:00-05:00",
    "2026-1-1-1",
    "2026-11-05T10:00",
    "2026-1",
    "2026/11",
    "2026-13",
    "2026-11-31",
  ]) {
    const a = codeOf(() => monthOf(input as never));
    const b = codeOf(() => closingPeriod(input as never, 20));
    assert.equal(a, b, input);
  }
  assert.equal(monthOf("2026-11-05"), "2026-11");
  assert.equal(monthOf("2026-11"), "2026-11");
});

test("holidayPolicy のオブジェクトの中の知らないキーは、診断の unknown-option（作成の結果は変わらない。decisions.md の 8 番）", () => {
  const options = {
    holidayProvider: jp,
    weekdayValues: [0, 1, 1, 1, 1, 1, 1],
    holidayPolicy: { value: null, sameAS: 0 },
  };
  assert.deepEqual(
    diagnoseSchedule(options as never).map((d) => `${d.severity} ${d.code} ${d.path}`),
    ["warning unknown-option holidayPolicy.sameAS"],
  );
  assert.equal(createSchedule(options as never).valueOn("2026-11-23"), null);
});
