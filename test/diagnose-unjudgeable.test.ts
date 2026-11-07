// 判定できない月（スケジュールの第 n 営業日の規則の基準のカレンダーが投げた月）がある設定の診断。
// 判定できない月の影響を受けない診断は出し、影響を受けうる診断（never-matches・redundant）は出さないことを確かめる。
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, createSchedule, type HolidayProvider } from "../src/index.ts";
import { diagnoseSchedule } from "../src/diagnose/index.ts";
import { dropUnsure, unsureOf } from "../src/core/diagnose.ts";
import { InternalError, IssueCollector } from "../src/core/errors.ts";
import { toDayNumber } from "../src/core/date.ts";
import { compileScheduleOptions } from "../src/core/schedule.ts";
import { sg } from "../src/sg/index.ts";
import { jp } from "../src/jp/index.ts";

/** シンガポールの祝日（2020〜2027 年）の土日休みのカレンダー。対応年の外の月では投げる */
const basis = createCalendar({
  holidayProvider: sg,
  timeZone: "Asia/Singapore",
  closedWeekdays: [0, 6],
});
const base = {
  timeZone: "Asia/Singapore",
  weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
};
const brief = (options: object) =>
  diagnoseSchedule(options).map((d) => [d.severity, d.code, d.path]);
/** 対応年の外の月を評価させる基準のカレンダーの規則（有効期間なし） */
const everyMonth = { businessDayOfMonth: 1, calendar: basis, value: "b" };

test("判定できない月があっても、基準のカレンダーを持たない規則の never-matches は出す", () => {
  const never = { dayOfMonth: 31, months: [2], value: "x" };
  assert.deepEqual(brief({ ...base, recurringRules: [never] }), [
    ["warning", "never-matches", "recurringRules[0]"],
  ]);
  assert.deepEqual(brief({ ...base, recurringRules: [everyMonth, never] }), [
    ["warning", "never-matches", "recurringRules[1]"],
  ]);
  // 旧名のキーで書いても、規則どうしの診断の path は新しい名前で出る（旧名で出るのは deprecated-option だけ）
  assert.deepEqual(
    brief({ ...base, recurring: [everyMonth, { day: 31, months: [2], value: "x" }] }),
    [
      ["warning", "deprecated-option", "recurring"],
      ["warning", "deprecated-option", "recurring[1].day"],
      ["warning", "never-matches", "recurringRules[1]"],
    ],
  );
});

test("基準のカレンダーを持つ規則の never-matches・redundant は、有効期間に判定できない月があれば出さない", () => {
  // 2019 年は対応年の外。3 月の第 1 営業日は実際にはあるが、基準のカレンダーが投げるので判定できない
  const march2019 = {
    businessDayOfMonth: 1,
    months: [3],
    calendar: basis,
    value: "b",
    effectiveFrom: "2019-01-01",
    effectiveTo: "2019-12-31",
  };
  assert.deepEqual(brief({ ...base, recurringRules: [march2019] }), []);
  // 曜日の決まりと同じ値の規則は redundant だが、有効期間がないので判定できない月を含み、出さない
  const sameValue = { businessDayOfMonth: 1, calendar: basis, value: "a" };
  assert.deepEqual(brief({ ...base, recurringRules: [sameValue] }), []);
  // 有効期間がすべて対応年の中なら出す
  assert.deepEqual(
    brief({
      ...base,
      recurringRules: [{ ...sameValue, effectiveFrom: "2021-01-01", effectiveTo: "2021-12-31" }],
    }),
    [["info", "redundant", "recurringRules[0]"]],
  );
});

test("週の第 n 営業日の規則は、投げた月の次の月も判定できない月にする（2020 年の最初の週は 2019 年 12 月にかかる）", () => {
  // 2019-12-30（月）〜2020-01-05（日）の週。実際の第 3 営業日は 2020-01-02 だが、2019 年 12 月が対応年の外で数えられない
  for (const n of [3, 4]) {
    assert.deepEqual(
      brief({
        ...base,
        recurringRules: [
          {
            businessDayOfWeek: n,
            weekStart: 1,
            calendar: basis,
            value: "b",
            effectiveFrom: "2020-01-01",
            effectiveTo: "2020-01-05",
          },
        ],
      }),
      [],
      `businessDayOfWeek: ${n}`,
    );
  }
});

test("週の第 n 営業日の規則は、投げた月の前の月も判定できない月にする（2027 年の最後の週は 2028 年 1 月にかかる）", () => {
  // 2027-12-29（水）〜2028-01-04（火）の週の最後の営業日は、2028 年 1 月の祝日次第（シンガポールの 2028 年の祝日は
  // まだ発表されていない。祝日がなければ 2028-01-04）。2028 年 1 月を数えられないと 2027-12-31 に見え、同じ日を同じ値で
  // 決める基準のない規則（2 つ目）を redundant と誤って言ってしまう
  assert.deepEqual(
    brief({
      ...base,
      recurringRules: [
        {
          businessDayOfWeek: -1,
          weekStart: 3,
          calendar: basis,
          value: "b",
          effectiveFrom: "2027-12-27",
          effectiveTo: "2027-12-31",
        },
        {
          dayOfMonth: 31,
          months: [12],
          value: "b",
          effectiveFrom: "2027-12-01",
          effectiveTo: "2027-12-31",
        },
      ],
    }),
    [],
  );
});

test("月の第 n 営業日の規則は、投げた月の前後の月を判定できない月にしない（その月の基準だけで決まる）", () => {
  // 2019 年 12 月は判定できない月だが、2020 年 1 月は判定できる。第 25 営業日はない
  assert.deepEqual(
    brief({
      ...base,
      recurringRules: [
        everyMonth,
        {
          businessDayOfMonth: 25,
          calendar: basis,
          value: "c",
          effectiveFrom: "2020-01-01",
          effectiveTo: "2020-01-31",
        },
      ],
    }),
    [["warning", "never-matches", "recurringRules[1]"]],
  );
});

test("unsureOf: 規則の位置は前方一致でも番号の途中で切らない（recurringRules[11] を recurringRules[1] と取り違えない）", () => {
  // 1 番は基準のカレンダーを持つ規則（有効期間なし）、11 番は基準のない規則。11 番の診断を 1 番の規則で引くと、
  // 判定できない月の影響を受けると誤って取り除く
  const rules: object[] = Array.from({ length: 12 }, (_, i) => ({ weekday: i % 7, value: "b" }));
  rules[1] = everyMonth;
  const compiled = compileScheduleOptions<unknown, string>(new IssueCollector(), {
    ...base,
    recurringRules: rules,
  })!;
  const c = new IssueCollector();
  c.warning("never-matches", "recurringRules[1]", "with a basis");
  c.warning("never-matches", "recurringRules[11]", "basis-less");
  c.info("redundant", "recurringRules[1].holidayOverlapPolicy", "with a basis");
  c.info("redundant", "recurringRules[11].holidayOverlapPolicy", "basis-less");
  // 2019 年 12 月の全日が判定できない日
  const december = Array.from({ length: 31 }, (_, i) =>
    toDayNumber(`2019-12-${String(i + 1).padStart(2, "0")}`),
  );
  const unknown = { days: new Set(december), months: new Set([2019 * 12 + 11]) };
  const unsure = unsureOf(compiled, unknown);
  const kept = c.issues.filter((d) => !unsure(d.code, d.path));
  // 見張り（dropUnsure）は、分からない診断が残っていれば作りの誤りとして投げる
  assert.throws(() => dropUnsure(c, 0, unsure, new Set(), unknown), InternalError);
  c.issues.length = 0;
  c.issues.push(...kept);
  dropUnsure(c, 0, unsure, new Set(), unknown);
  assert.deepEqual(
    c.issues.map((d) => [d.code, d.path]),
    [
      ["never-matches", "recurringRules[11]"],
      ["redundant", "recurringRules[11].holidayOverlapPolicy"],
    ],
  );
});

test("unsureOf: 規則の中のオプションの位置は、path の先頭の規則で引く", () => {
  const compiled = compileScheduleOptions<unknown, string>(new IssueCollector(), {
    ...base,
    recurringRules: [everyMonth, { weekday: 1, value: "b" }],
  })!;
  const c = new IssueCollector();
  c.info("redundant", "recurringRules[1].holidayOverlapPolicy", "basis-less rule");
  c.info("redundant", "recurringRules[0].holidayOverlapPolicy", "rule with a basis");
  c.warning("never-matches", "recurringRules[0]", "rule with a basis");
  c.info("redundant", "recurringRules[1]", "basis-less rule, no period");
  c.info("redundant", "somewhere", "not a rule");
  c.warning("shadowed", "recurringRules[0]", "shape only");
  // 2019 年 12 月の全日が判定できない日
  const december = Array.from({ length: 31 }, (_, i) =>
    toDayNumber(`2019-12-${String(i + 1).padStart(2, "0")}`),
  );
  const unknown = { days: new Set(december), months: new Set([2019 * 12 + 11]) };
  const unsure = unsureOf(compiled, unknown);
  const kept = c.issues.filter((d) => !unsure(d.code, d.path));
  // 見張り（dropUnsure）は、分からない診断が残っていれば作りの誤りとして投げる
  assert.throws(() => dropUnsure(c, 0, unsure, new Set(), unknown), InternalError);
  c.issues.length = 0;
  c.issues.push(...kept);
  dropUnsure(c, 0, unsure, new Set(), unknown);
  assert.deepEqual(
    c.issues.map((d) => [d.code, d.path, d.message]),
    [
      ["redundant", "recurringRules[1].holidayOverlapPolicy", "basis-less rule"],
      ["shadowed", "recurringRules[0]", "shape only"],
    ],
  );
});

// ------------------------------------------------------------
// 逐次除去との関係（31 番）: 分からない規則は走査の前に決め、出さず、逐次除去でも取り除かない
// ------------------------------------------------------------

/** 2026 年 6 月 15 日だけが未確定の祝日の提供元（基準のカレンダーを unconfirmedHolidayPolicy: "throw" にすると、6 月だけ投げる） */
const oneUnconfirmed: HolidayProvider = {
  id: "ONE-UNCONFIRMED",
  timeZone: "UTC",
  dataVersion: "1",
  supportedYears: { from: 2025, to: 2027 },
  holidaysInYear: (year) =>
    year === 2026
      ? [{ date: "2026-06-15", name: "X", nameEn: "X", kind: "regular", confirmed: false }]
      : [],
};
const juneThrows = createCalendar({
  holidayProvider: oneUnconfirmed,
  closedWeekdays: [0, 6],
  unconfirmedHolidayPolicy: "throw",
});
const sequential = (list: readonly object[]) => ({
  holidayProvider: oneUnconfirmed,
  outOfRangePolicy: "ignore" as const,
  weekdayValues: ["c", "o", "o", "o", "o", "o", "c"] as const,
  recurringRules: list as never,
});
/** 基準のカレンダーが 2026 年 6 月だけ投げる規則、X（期間なし。6 月に重なる）、Y（2027 年から。6 月に重ならない） */
const SEQUENTIAL_RULES: readonly object[] = [
  { businessDayOfMonth: 1, value: "first", calendar: juneThrows },
  { weekday: 2, value: "o" },
  { weekday: 2, nth: 1, value: "o", effectiveFrom: "2027-01-01" },
];

test("判定できない月と逐次除去: 有効期間がその月に重なる規則（X）は redundant を出さず、取り除かない。X を外した設定で判定した診断も出ない", () => {
  const list = diagnoseSchedule(sequential(SEQUENTIAL_RULES));
  // X（recurringRules[1]）は曜日の値と同じ値なので、分からない月がなければ redundant。分からない規則なので出ない。
  // Y（recurringRules[2]）は X に覆われる（形で決まり、分からない月に左右されない）ので shadowed だけが出る
  assert.deepEqual(
    list.map((d) => [d.code, d.path]),
    [["shadowed", "recurringRules[2]"]],
  );
});

test("判定できない月と逐次除去: 分からない月の集合は規則の並びに左右されない（並べ替えても、分からない規則への診断が出ない）", () => {
  const reversed = [...SEQUENTIAL_RULES].reverse();
  const list = diagnoseSchedule(sequential(reversed));
  assert.deepEqual(
    list.filter((d) => d.code === "never-matches" || d.code === "redundant").map((d) => d.path),
    [],
  );
});

test("判定できない月と逐次除去: 出た規則をまとめて取り除いても、判定できる日の結果が変わらない", () => {
  const list = diagnoseSchedule(sequential(SEQUENTIAL_RULES));
  const removable = new Set(
    list
      .filter((d) => ["shadowed", "never-matches", "redundant"].includes(d.code))
      .map((d) => Number(/\[(\d+)\]$/.exec(d.path)![1])),
  );
  const before = createSchedule(sequential(SEQUENTIAL_RULES));
  const after = createSchedule(sequential(SEQUENTIAL_RULES.filter((_, i) => !removable.has(i))));
  let compared = 0;
  const days: string[] = [];
  for (let d = Date.UTC(2025, 0, 1); d <= Date.UTC(2027, 11, 31); d += 86_400_000)
    days.push(new Date(d).toISOString().slice(0, 10));
  for (const date of days) {
    let value: unknown;
    try {
      value = before.valueOn(date);
    } catch {
      continue;
    }
    assert.deepEqual(after.valueOn(date), value, date);
    compared++;
  }
  assert.ok(compared > 300, `比べた日が少ない: ${compared}`);
});

// ------------------------------------------------------------
// 0.31.0-A と同じ結果になることの固定の設定（基準は日本の祝日の土日休みのカレンダー。窓は 1955〜2099 年）
// ------------------------------------------------------------

test("判定できない月の範囲: 月の規則は窓の外の月に左右されず、週の規則は窓の両端で隣の月に巻き込まれる（0.31.0-A と同じ）", () => {
  const jpBasis = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const flat = createCalendar({ timeZone: "Asia/Tokyo", closedWeekdays: [0, 6] });
  const run = (recurringRules: object[]) =>
    diagnoseSchedule({
      holidayProvider: jp,
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      recurringRules: recurringRules as never,
    }).map((d) => [d.code, d.path, d.relatedPath ?? null]);
  const day25 = { businessDayOfMonth: 25, calendar: jpBasis, value: "x" };
  const week = { businessDayOfWeek: 1, weekStart: 1, calendar: jpBasis, value: "a" };
  const cases: [string, object[], unknown[]][] = [
    [
      "月の規則 2 つ",
      [
        { businessDayOfMonth: 1, months: [1], calendar: jpBasis, value: "x" },
        { businessDayOfMonth: 1, calendar: jpBasis, value: "x" },
      ],
      [["redundant", "recurringRules[0]", "recurringRules[1]"]],
    ],
    ["第 25 営業日", [day25], [["never-matches", "recurringRules[0]", null]]],
    [
      "第 25 営業日（1955-02 から）",
      [{ ...day25, effectiveFrom: "1955-02-01" }],
      [["never-matches", "recurringRules[0]", null]],
    ],
    [
      "第 25 営業日（2099-11 まで）",
      [{ ...day25, effectiveTo: "2099-11-30" }],
      [["never-matches", "recurringRules[0]", null]],
    ],
    [
      "第 25 営業日（両方）",
      [{ ...day25, effectiveFrom: "1955-02-01", effectiveTo: "2099-11-30" }],
      [["never-matches", "recurringRules[0]", null]],
    ],
    // 週の規則は、窓の最初の週（1955 年 1 月）が 1954 年 12 月の基準を見るので、窓の両端で巻き込まれる（安全側。狭めるのは
    // 0.32.0 以降）
    ["週の規則（有効期間なし）", [week], []],
    [
      "週の規則（1956〜2098 年）",
      [{ ...week, effectiveFrom: "1956-01-01", effectiveTo: "2098-12-31" }],
      [["redundant", "recurringRules[0]", null]],
    ],
    // 巻き込みは「窓の端」ではなく「基準が投げる」ことで起きる（投げない基準なら、有効期間なしでも出る）
    [
      "週の規則（投げない基準）",
      [{ ...week, calendar: flat }],
      [["redundant", "recurringRules[0]", null]],
    ],
  ];
  for (const [label, rules, expected] of cases) assert.deepEqual(run(rules), expected, label);
});

test("判定できない月の範囲: 基準を求める月は、規則が基準を評価する月（months）に絞る。絞った外の月で基準が投げても数えない", () => {
  // 未確定の祝日で投げる日本の基準は、2028 年以降の春分の日・秋分の日の月（3 月・9 月）で投げる。2 月だけの規則は 3 月・9 月の
  // 基準を評価しないので、判定できない月はない（0.31.0-A と同じ。API どうしの整合の整合 10 の設定を簡略化したもの）
  const strict = createCalendar({ holidayProvider: jp, unconfirmedHolidayPolicy: "throw" });
  const run = (first: object) =>
    diagnoseSchedule({
      holidayProvider: jp,
      weekdayValues: ["closed", "a", "a", "a", "a", "a", "a"],
      recurringRules: [first, { weekday: 0, value: "closed" }] as never,
    }).map((d) => [d.code, d.path]);
  assert.deepEqual(run({ businessDayOfMonth: 1, months: [2], calendar: strict, value: "y" }), [
    ["redundant", "recurringRules[1]"],
  ]);
  // 月で絞らない規則は 3 月・9 月の基準を評価するので、判定できない月があり、どちらの規則にも出ない
  assert.deepEqual(run({ businessDayOfMonth: 1, calendar: strict, value: "y" }), []);
});

test("判定できない月の範囲: 窓の月は有効期間で絞る（1970 年からの基準を 1975 年から使う月の規則は、1955〜1969 年の月を数えない）", () => {
  // 対応年 1970〜2099 年の基準（日本の祝日）。スケジュールの窓は日本の対応年（1955〜2099 年）。月の規則が 1975 年からなら、
  // 基準を評価しうる月は 1975 年以降と代表の 28 年間で、どれも投げないので判定できない月はなく、毎年の月日の redundant が出る
  const from1970: HolidayProvider = {
    ...jp,
    id: "JP-1970",
    supportedYears: { from: 1970, to: 2099 },
  };
  const basis1970 = createCalendar({ holidayProvider: from1970, closedWeekdays: [0, 6] });
  const run = (rule: object) =>
    diagnoseSchedule({
      holidayProvider: jp,
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      annualDates: [{ date: "05-05", value: "a" }],
      recurringRules: [rule] as never,
    })
      .filter((d) => d.code === "redundant" || d.code === "never-matches")
      .map((d) => [d.code, d.path]);
  const rule = { businessDayOfMonth: 1, calendar: basis1970, value: "x" };
  assert.deepEqual(run({ ...rule, effectiveFrom: "1975-01-01" }), [
    ["redundant", "annualDates[0]"],
  ]);
  // 有効期間がなければ、1955〜1969 年の月で基準を評価しうるので（対応年の外で投げる）、判定できない月があり、出ない
  assert.deepEqual(run(rule), []);
});

test("判定できない日（日の単位）: 1970-01-05 始まりの週の規則は、週が 1969 年 12 月にまたがないので分かる（redundant が出る）", () => {
  // 対応年 1970〜2099 年の基準。月の単位（0.31.0-B）では、週の規則の前後 1 か月（1969 年 12 月）で基準が投げるので分からない
  // 規則だった。日の単位では、有効期間の最初の週（1970-01-05〜01-11）が 1970 年 1 月の中に収まるので、判定できない日はない
  const from1970: HolidayProvider = {
    ...jp,
    id: "JP-1970",
    supportedYears: { from: 1970, to: 2099 },
  };
  const basis1970 = createCalendar({ holidayProvider: from1970, closedWeekdays: [0, 6] });
  const run = (rule: object) =>
    diagnoseSchedule({
      holidayProvider: jp,
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      recurringRules: [rule] as never,
    })
      .filter((d) => d.code === "redundant" || d.code === "never-matches")
      .map((d) => [d.code, d.path]);
  // 終わりも、窓の最後の週（2099-12-28〜2100-01-03）が 2100 年にまたがないよう 2099-12-27（日曜）までにする
  const week = {
    businessDayOfWeek: 1,
    weekStart: 1,
    calendar: basis1970,
    value: "a",
    effectiveTo: "2099-12-27",
  };
  assert.deepEqual(run({ ...week, effectiveFrom: "1970-01-05" }), [
    ["redundant", "recurringRules[0]"],
  ]);
  // 1970-01-01 始まりなら、最初の週（1969-12-29〜1970-01-04）が 1969 年 12 月にまたぎ、そこで基準が投げるので出ない
  assert.deepEqual(run({ ...week, effectiveFrom: "1970-01-01" }), []);
  // 終わりを窓の最後まで延ばすと、最後の週が 2100 年 1 月にまたぎ、そこで基準が投げるので出ない
  assert.deepEqual(run({ ...week, effectiveFrom: "1970-01-05", effectiveTo: "2099-12-31" }), []);
});
