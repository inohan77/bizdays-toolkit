// 判定できない月（スケジュールの第 n 営業日の規則の基準のカレンダーが投げた月）がある設定の診断。
// 判定できない月の影響を受けない診断は出し、影響を受けうる診断（never-matches・redundant）は出さないことを確かめる。
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar } from "../src/index.ts";
import { diagnoseSchedule } from "../src/diagnose/index.ts";
import { dropUnsure } from "../src/core/diagnose.ts";
import { IssueCollector } from "../src/core/errors.ts";
import { compileScheduleOptions } from "../src/core/schedule.ts";
import { sg } from "../src/sg/index.ts";

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

test("dropUnsure: 規則の位置は前方一致でも番号の途中で切らない（recurringRules[11] を recurringRules[1] と取り違えない）", () => {
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
  dropUnsure(c, 0, compiled, new Set([2019 * 12 + 11]));
  assert.deepEqual(
    c.issues.map((d) => [d.code, d.path]),
    [
      ["never-matches", "recurringRules[11]"],
      ["redundant", "recurringRules[11].holidayOverlapPolicy"],
    ],
  );
});

test("dropUnsure: 規則の中のオプションの位置は、path の先頭の規則で引く", () => {
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
  dropUnsure(c, 0, compiled, new Set([2019 * 12 + 11]));
  assert.deepEqual(
    c.issues.map((d) => [d.code, d.path, d.message]),
    [
      ["redundant", "recurringRules[1].holidayOverlapPolicy", "basis-less rule"],
      ["shadowed", "recurringRules[0]", "shape only"],
    ],
  );
});
