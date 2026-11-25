import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  type CalendarOptions,
  type HolidayProvider,
  type HolidayOverlapPolicy,
  type RecurringRule,
  type ScheduleOptions,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { SHORT_PROVIDER } from "./support/provider.ts";
import { PARTS, partsOf } from "../src/core/schedule.ts";
import { diagnoseCalendar, diagnoseSchedule, type Diagnostic } from "../src/diagnose/index.ts";
import { DIAGNOSTIC_YEARS } from "../src/core/diagnose.ts";

/** The diagnostic range as written in messages (the years are defined in one place, in src/core/diagnose.ts) */
const RANGE = `${DIAGNOSTIC_YEARS.from}-${DIAGNOSTIC_YEARS.to}`;

/** Keeps only the properties used for judging (message is not part of the API) */
const brief = (list: readonly Diagnostic[]) =>
  list.map((d) => {
    const r: { severity: string; code: string; path: string; relatedPath?: string } = {
      severity: d.severity,
      code: d.code,
      path: d.path,
    };
    if (d.relatedPath !== undefined) r.relatedPath = d.relatedPath;
    return r;
  });

// The default is the short provider (2025-2027). shadowed and the like follow from the shape of the rules, not
// from the years of the holidays, so the whole range of Japan (1955-2099) is not scanned. Checks that depend on
// Japan's supported years pass holidayProvider: jp explicitly in `extra`
const recurring = (rules: RecurringRule[], extra: object = {}) =>
  brief(
    diagnoseCalendar({ holidayProvider: SHORT_PROVIDER, closedRecurringRules: rules, ...extra }),
  );

test("問題のない設定は空の配列", () => {
  const options = {
    holidayProvider: jp,
    closedWeekdays: [0] as const,
    closedAnnualDates: [{ from: "12-31", to: "01-03" }],
    closedDates: [{ from: "2027-08-12", to: "2027-08-16" }],
    openDates: ["2026-12-27" as const],
    closedRecurringRules: [{ weekday: 3, nth: 3 } as const],
  };
  assert.deepEqual(diagnoseCalendar(options), []);
  assert.deepEqual(diagnoseCalendar(), []);
  assert.deepEqual(diagnoseSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0] }), []);
});

test("結果は変更できない", () => {
  const list = diagnoseCalendar({ closeWeekdays: [0] });
  assert.ok(Object.isFrozen(list));
  assert.ok(Object.isFrozen(list[0]));
});

test("error: 作成で例外になる誤りを、最初の 1 件だけでなくすべて返す", () => {
  const options = { closedDates: ["2026-13-01"], holidayPolicy: "x", closedWeekdays: [7] };
  assert.deepEqual(brief(diagnoseCalendar(options)), [
    { severity: "error", code: "invalid-weekday", path: "closedWeekdays[0]" },
    { severity: "error", code: "invalid-option", path: "holidayPolicy" },
    { severity: "error", code: "invalid-date", path: "closedDates[0].date" },
  ]);
  // The same code as the error at creation
  assert.throws(() => createCalendar(options as object), { code: "invalid-weekday" });
  assert.deepEqual(brief(diagnoseCalendar(null as unknown as object)), [
    { severity: "error", code: "invalid-option", path: "" },
  ]);
  assert.deepEqual(brief(diagnoseSchedule({ weekdayValues: [1, 2, 3] })), [
    { severity: "error", code: "invalid-option", path: "weekdayValues" },
  ]);
});

test("error があるときは、規則どうしの診断を行わない", () => {
  const list = brief(
    diagnoseCalendar({ closedWeekdays: [0, 1, 2, 3, 4, 5, 6], holidayPolicy: "x" }),
  );
  assert.deepEqual(
    list.map((d) => d.code),
    ["invalid-option"],
    "no-business-day は出さない",
  );
});

test("unknown-option: 近い既知のキーを候補に挙げる（判定は code で行う）", () => {
  const list = diagnoseCalendar({
    closeWeekdays: [0], // a typo
    timezone: "Asia/Tokyo", // a difference in case
    closedRecurringRules: [{ weekday: 1, onHoliday: "after-holiday" }], // a prefix
    color: "red", // no similar key
  });
  assert.deepEqual(
    list.map((d) => [d.code, d.path, d.severity]),
    [
      ["unknown-option", "closeWeekdays", "warning"],
      ["unknown-option", "timezone", "warning"],
      ["unknown-option", "color", "warning"],
      ["unknown-option", "closedRecurringRules[0].onHoliday", "warning"],
    ],
  );
  assert.match(list[0]!.message, /"closedWeekdays"/);
  assert.match(list[1]!.message, /"timeZone"/);
  assert.doesNotMatch(list[2]!.message, /did you mean/);
  assert.match(list[3]!.message, /"holidayOverlapPolicy"/);
  // Ignored at creation (forward compatibility)
  assert.doesNotThrow(() => createCalendar({ closeWeekdays: [0] } as object));
});

test("shadowed: 個別の日付・毎年の月日（年をまたぐ期間）", () => {
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedDates: [{ from: "2026-12-01", to: "2026-12-31" }, "2026-12-24", "2027-01-05"],
        closedAnnualDates: [
          { from: "12-29", to: "01-03" },
          "01-01",
          { from: "12-30", to: "01-04" },
        ],
      }),
    ),
    [
      {
        severity: "warning",
        code: "shadowed",
        path: "closedDates[1]",
        relatedPath: "closedDates[0]",
      },
      {
        severity: "warning",
        code: "shadowed",
        path: "closedAnnualDates[1]",
        relatedPath: "closedAnnualDates[0]",
      },
    ],
  );
});

test("shadowed: 臨時営業日に覆われた臨時休業日（同じ種類の個別の日付）", () => {
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [0, 6], // makes it an extra business day that opens a weekend (used)
        openDates: [{ from: "2026-12-26", to: "2026-12-28" }],
        closedDates: ["2026-12-27"],
      }),
    ),
    [
      {
        severity: "warning",
        code: "shadowed",
        path: "closedDates[0]",
        relatedPath: "openDates[0]",
      },
    ],
  );
});

test("shadowed と redundant: 定休日のない設定では、覆われた休業日を取り除いた後に、覆っていた営業日の規則・日付も redundant になる（まとめて取り除ける）", () => {
  // Opening rules and extra business days exist to open closed days. Without closed weekdays, once the covered
  // closed day is removed they only open a business day and change no result, so both can be removed
  // (sequential removal. decisions.md #31)
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        openDates: [{ from: "2026-12-26", to: "2026-12-28" }],
        closedDates: ["2026-12-27"],
      }),
    ),
    [
      {
        severity: "warning",
        code: "shadowed",
        path: "closedDates[0]",
        relatedPath: "openDates[0]",
      },
      { severity: "info", code: "redundant", path: "openDates[0]" },
    ],
  );
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        openRecurringRules: [{ weekday: 6 }],
        closedRecurringRules: [{ weekday: 6, nth: 2 }],
      }),
    ),
    [
      {
        severity: "warning",
        code: "shadowed",
        path: "closedRecurringRules[0]",
        relatedPath: "openRecurringRules[0]",
      },
      { severity: "info", code: "redundant", path: "openRecurringRules[0]" },
    ],
  );
});

test("shadowed: 繰り返しの規則（当てはまる日の包含で判定する）", () => {
  const shadowed = (rules: RecurringRule[]) =>
    recurring(rules)
      .filter((d) => d.code === "shadowed")
      .map((d) => `${d.path}<${d.relatedPath}`);
  assert.deepEqual(shadowed([{ weekday: 3 }, { weekday: 3, nth: 3, months: [1, 2] }]), [
    "closedRecurringRules[1]<closedRecurringRules[0]",
  ]);
  assert.deepEqual(
    shadowed([{ dayOfMonth: [1, 2, 3, 4, 5, 6, 7] }, { weekday: 2, nth: 1 }]),
    ["closedRecurringRules[1]<closedRecurringRules[0]"],
    "1〜7 日は、第 1 の曜日をすべて含む",
  );
  assert.deepEqual(
    shadowed([
      { weekday: 5, nth: [4, 5] },
      { weekday: 5, nth: -1 },
    ]),
    ["closedRecurringRules[1]<closedRecurringRules[0]"],
    "最終の金曜日は、第 4 か第 5 の金曜日",
  );
  assert.deepEqual(
    shadowed([
      { weekday: 5, nth: -1 },
      { weekday: 5, nth: [4, 5] },
    ]),
    [],
  );
  assert.deepEqual(shadowed([{ weekday: 3, nth: 3 }, { weekday: 3 }]), [], "後の規則のほうが広い");
});

test("shadowed: 祝日の扱いの組み合わせ", () => {
  const shadowedBy = (earlier: HolidayOverlapPolicy, later: HolidayOverlapPolicy) =>
    recurring([
      { weekday: 1, holidayOverlapPolicy: earlier },
      { weekday: 1, nth: 2, holidayOverlapPolicy: later },
    ]).some((d) => d.code === "shadowed");
  assert.equal(shadowedBy("over-holiday", "over-holiday"), true);
  assert.equal(shadowedBy("over-holiday", "under-holiday"), true);
  assert.equal(shadowedBy("under-holiday", "under-holiday"), true);
  assert.equal(shadowedBy("after-holiday", "after-holiday"), true);
  assert.equal(shadowedBy("under-holiday", "over-holiday"), false, "祝日には後の規則が当たる");
  assert.equal(shadowedBy("after-holiday", "under-holiday"), false);
  assert.equal(shadowedBy("under-holiday", "after-holiday"), false, "振替先は覆われない");
});

test("shadowed: 繰り返しの営業日は、同じ日の繰り返しの休業日を覆う", () => {
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        // Saturday is a closed weekday, so that the opening rule is used (otherwise the opening rule becomes
        // redundant too once the closing rule is removed. decisions.md #31)
        closedWeekdays: [0, 6],
        openRecurringRules: [{ weekday: 6 }],
        closedRecurringRules: [{ weekday: 6, nth: 2 }],
      }),
    ),
    [
      {
        severity: "warning",
        code: "shadowed",
        path: "closedRecurringRules[0]",
        relatedPath: "openRecurringRules[0]",
      },
    ],
  );
});

test("never-matches: 当てはまる日がない繰り返しの規則", () => {
  assert.deepEqual(
    recurring(
      [
        { dayOfMonth: 30, months: [2] },
        { dayOfMonth: [30, 31], months: [2] },
      ],
      { holidayProvider: jp },
    ),
    [
      { severity: "warning", code: "never-matches", path: "closedRecurringRules[0]" },
      { severity: "warning", code: "never-matches", path: "closedRecurringRules[1]" },
    ],
  );
  // February 29 of a leap year and a fifth weekday in February can exist
  assert.deepEqual(recurring([{ dayOfMonth: 29, months: [2] }], { holidayProvider: jp }), []);
  assert.deepEqual(recurring([{ weekday: 0, nth: 5, months: [2] }], { holidayProvider: jp }), []);
});

test("out-of-range: 個別の日付が祝日の提供元の対応年の外", () => {
  assert.deepEqual(brief(diagnoseCalendar({ holidayProvider: jp, closedDates: ["2100-01-05"] })), [
    {
      severity: "warning",
      code: "out-of-range",
      path: "closedDates[0]",
      relatedPath: "holidayProvider",
    },
  ]);
  const ignore = diagnoseCalendar({
    holidayProvider: jp,
    outOfRangePolicy: "ignore",
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    openDates: [{ from: "2099-12-30", to: "2100-01-02" }],
  });
  assert.deepEqual(
    ignore.map((d) => [d.code, d.path]),
    [["out-of-range", "openDates[0]"]],
  );
  assert.notEqual(
    ignore[0]!.message,
    diagnoseCalendar({ holidayProvider: jp, closedDates: ["2100-01-05"] })[0]!.message,
    "例外になるか、祝日を考えないかで説明が変わる",
  );
  const other: HolidayProvider = {
    id: "XX",
    timeZone: "Asia/Tokyo",
    supportedYears: { from: 2000, to: 2200 },
    dataVersion: "1",
    holidaysInYear: () => [],
  };
  assert.deepEqual(
    brief(diagnoseCalendar({ holidayProvider: [other, jp], closedDates: ["2150-01-05"] })).map(
      (d) => d.relatedPath,
    ),
    ["holidayProvider[1]"],
  );
  // Without a provider: a date in the diagnostic range gets nothing; a date without a day in the range is not
  // examined and gets out-of-range (no relatedPath: no provider is involved). A provider that already reported
  // the date is not repeated
  assert.deepEqual(diagnoseCalendar({ closedDates: ["2099-01-05"] }), []);
  assert.deepEqual(diagnoseCalendar({ closedDates: ["2100-01-05"] }), [
    {
      severity: "warning",
      code: "out-of-range",
      path: "closedDates[0]",
      message: `The date has no day in ${RANGE}, the years the diagnostics examine, so it was not examined; check the year`,
    },
  ]);
  assert.deepEqual(
    diagnoseCalendar({
      closedRecurringRules: [{ weekday: 1, effectiveTo: "1954-12-31" }, { weekday: 2 }],
    }).map((d) => `${d.code} ${d.path} ${d.message}`),
    [
      `out-of-range closedRecurringRules[0] The effective period has no day in ${RANGE}, the years the diagnostics examine, so it was not examined; check the year`,
    ],
  );
  // A date or period with one day in the range is examined
  assert.deepEqual(
    diagnoseCalendar({ closedDates: [{ from: "2099-12-31", to: "2100-01-05" }] }),
    [],
  );
});

test("no-business-day: 営業日が 1 日もない設定", () => {
  const all = [0, 1, 2, 3, 4, 5, 6] as const;
  const codes = (options: object) => diagnoseCalendar(options).map((d) => d.code);
  assert.deepEqual(codes({ closedWeekdays: all }), ["no-business-day"]);
  assert.deepEqual(
    codes({
      holidayProvider: jp,
      closedWeekdays: [0, 1, 2, 3, 4, 5],
      closedRecurringRules: [{ weekday: 6 }],
    }),
    ["no-business-day"],
  );
  assert.deepEqual(codes({ closedAnnualDates: [{ from: "01-01", to: "12-31" }] }), [
    "no-business-day",
  ]);
  // With an extra business day, a recurring business day or open holidays, there are business days
  assert.deepEqual(codes({ closedWeekdays: all, openDates: ["2026-12-27"] }), []);
  assert.deepEqual(codes({ closedWeekdays: all, openRecurringRules: [{ dayOfMonth: 1 }] }), []);
  assert.deepEqual(codes({ holidayProvider: jp, closedWeekdays: all, holidayPolicy: "open" }), []);
  // Really searching for a business day throws
  assert.throws(() => createCalendar({ closedWeekdays: all }).nextBusinessDay("2026-10-16"), {
    code: "no-business-day",
  });
});

test("redundant: 取り除いても結果が変わらない規則（info）", () => {
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidayProvider: jp,
        closedWeekdays: [0, 6],
        closedRecurringRules: [{ weekday: 0 }, { weekday: 1, nth: 2 }],
        closedDates: ["2026-11-01", "2026-11-02"], // a Sunday and a Monday
      }),
    ),
    [
      { severity: "info", code: "redundant", path: "closedDates[0]" },
      { severity: "info", code: "redundant", path: "closedRecurringRules[0]" },
    ],
  );
  // A specific date covered by several earlier rules together
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedDates: [
          { from: "2026-12-01", to: "2026-12-10" },
          { from: "2026-12-11", to: "2026-12-20" },
          { from: "2026-12-05", to: "2026-12-15" },
        ],
      }),
    ),
    [{ severity: "info", code: "redundant", path: "closedDates[2]" }],
  );
});

test("redundant: 出た規則はまとめて取り除ける（逐次除去）。relatedPath は代わりに決める規則で、1 つに定まるときだけ付く", () => {
  // Three rules of the same weekday, under / over / after: [0] and [1] can each be removed alone, but without
  // both a holiday Monday changes. The sequential removal reports only [0] (in the options without [0], [1]
  // decides the holiday Monday)
  const rules = [
    { weekday: 1, holidayOverlapPolicy: "under-holiday" },
    { weekday: 1, holidayOverlapPolicy: "over-holiday" },
    { weekday: 1, holidayOverlapPolicy: "after-holiday" },
  ] as const;
  const options = {
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    holidayPolicy: "ignore",
    closedRecurringRules: rules,
  } as const;
  assert.deepEqual(brief(diagnoseCalendar(options)), [
    {
      severity: "info",
      code: "redundant",
      path: "closedRecurringRules[0]",
      relatedPath: "closedRecurringRules[1]",
    },
  ]);
  const opens = (o: CalendarOptions) =>
    createCalendar({ ...o, outOfRangePolicy: "ignore" })
      .daysBetween("1955-01-01", "2099-12-31")
      .map((d) => d.open);
  assert.deepEqual(opens({ ...options, closedRecurringRules: rules.slice(1) }), opens(options));
  // The same rule written twice: the later one is shadowed and the earlier one is not reported (shadowed rules
  // are removed first)
  assert.deepEqual(
    brief(diagnoseCalendar({ closedRecurringRules: [{ weekday: 3 }, { weekday: 3 }] })),
    [
      {
        severity: "warning",
        code: "shadowed",
        path: "closedRecurringRules[1]",
        relatedPath: "closedRecurringRules[0]",
      },
    ],
  );
  // A day decided instead by a closed weekday gets no relatedPath (that is not a rule)
  assert.deepEqual(
    brief(diagnoseCalendar({ closedWeekdays: [0], closedRecurringRules: [{ weekday: 0 }] })),
    [{ severity: "info", code: "redundant", path: "closedRecurringRules[0]" }],
  );
  // New Year's Day every year is decided instead by the rule of the 1st of every month
  assert.deepEqual(
    brief(
      diagnoseCalendar({ closedAnnualDates: ["01-01"], closedRecurringRules: [{ dayOfMonth: 1 }] }),
    ),
    [
      {
        severity: "info",
        code: "redundant",
        path: "closedAnnualDates[0]",
        relatedPath: "closedRecurringRules[0]",
      },
    ],
  );
});

test("redundant: スケジュールの値は配列・普通のオブジェクトなら中身で比べる", () => {
  const open = { open: "10:00", close: "19:00" };
  const weekly = [null, open, open, open, open, open, null] as const;
  assert.deepEqual(
    brief(
      diagnoseSchedule({
        holidayProvider: jp,
        weekdayValues: weekly,
        holidayPolicy: { sameAs: 0 },
        recurringRules: [
          { weekday: 1, value: { open: "10:00", close: "19:00" } }, // the same as the weekday's value
          { weekday: 2, nth: 1, value: null }, // closed on the first Tuesday
          { weekday: 3, value: { close: "19:00", open: "10:00" } }, // the key order does not matter
          { weekday: 4, value: { open: "10:00", close: "20:00" } },
        ],
      }),
    ),
    [
      { severity: "info", code: "redundant", path: "recurringRules[0]" },
      { severity: "info", code: "redundant", path: "recurringRules[2]" },
    ],
  );
  // Values that are not plain objects are compared by identity
  const day = new Date(0);
  assert.deepEqual(
    diagnoseSchedule({
      weekdayValues: [day, day, day, day, day, day, day],
      recurringRules: [{ dayOfMonth: 1, value: new Date(0) }],
    }).map((d) => d.code),
    [],
  );
});

test("提供元が返したデータの誤りを、使っていない年も含めて error にする", () => {
  const broken: HolidayProvider = {
    ...jp,
    id: "XX",
    holidaysInYear: (year) =>
      year === 2000 ? ([{ date: "2000-01-01" }] as never) : jp.holidaysInYear(year),
  };
  const list = diagnoseCalendar({ holidayProvider: broken });
  assert.deepEqual(brief(list), [
    { severity: "error", code: "invalid-provider-data", path: "holidayProvider" },
  ]);
  assert.match(list[0]!.message, /2000/);
  // Creation works, and using that year throws
  const calendar = createCalendar({ holidayProvider: broken });
  assert.equal(calendar.isBusinessDay("2026-10-16"), true);
  assert.throws(() => calendar.isBusinessDay("2000-01-04"), { code: "invalid-provider-data" });

  const throwing: HolidayProvider = {
    ...jp,
    holidaysInYear: () => {
      throw new Error("boom");
    },
  };
  assert.deepEqual(
    diagnoseSchedule({ holidayProvider: throwing, weekdayValues: [0, 0, 0, 0, 0, 0, 0] }).map(
      (d) => d.code,
    ),
    ["invalid-provider-data"],
    "提供元が例外を投げても、診断は例外を投げない",
  );
});

test("診断した設定でも、作成の結果は変わらない", () => {
  const options = {
    holidayProvider: jp,
    closedWeekdays: [0] as const,
    closedRecurringRules: [{ weekday: 0 } as const],
  };
  diagnoseCalendar(options);
  assert.equal(createCalendar(options).isBusinessDay("2026-10-18"), false);
  assert.equal(createSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0] }).valueOn("2026-10-18"), 0);
});

test("shadowed・never-matches・out-of-range: 有効期間", () => {
  const shadowed = (rules: RecurringRule[], extra: object = {}) =>
    recurring(rules, { holidayProvider: jp, ...extra })
      .filter((d) => d.code === "shadowed")
      .map((d) => `${d.path}<${d.relatedPath}`);
  assert.deepEqual(
    shadowed([
      { weekday: 1, effectiveTo: "2027-03-31" },
      { weekday: 1, effectiveFrom: "2027-04-01" },
    ]),
    [],
    "期間が重ならない同じ曜日の規則は互いを覆わない",
  );
  assert.deepEqual(
    shadowed([{ weekday: 1 }, { weekday: 1, effectiveFrom: "2027-04-01" }]),
    ["closedRecurringRules[1]<closedRecurringRules[0]"],
    "期限のない規則は、期間付きの同じ規則を覆う",
  );
  assert.deepEqual(
    shadowed([{ weekday: 1, effectiveFrom: "2027-04-01" }, { weekday: 1 }]),
    [],
    "期間付きの規則は、期限のない規則を覆わない",
  );
  assert.deepEqual(
    shadowed([
      { weekday: 1, effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31" },
      { weekday: 1, nth: 1, effectiveFrom: "2026-04-01", effectiveTo: "2027-03-31" },
    ]),
    ["closedRecurringRules[1]<closedRecurringRules[0]"],
    "期間と形の両方で含まれる",
  );
  // The same for annual dates
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedAnnualDates: [
          { from: "12-29", to: "01-03", effectiveTo: "2027-12-31" },
          { date: "01-02", effectiveFrom: "2027-01-01", effectiveTo: "2027-12-31" },
          { date: "01-03", effectiveFrom: "2028-01-01" },
        ],
      }),
    ),
    [
      {
        severity: "warning",
        code: "shadowed",
        path: "closedAnnualDates[1]",
        relatedPath: "closedAnnualDates[0]",
      },
    ],
  );
  // No matching day within the period
  assert.deepEqual(
    recurring([{ weekday: 3, nth: 5, effectiveFrom: "2027-04-01", effectiveTo: "2027-04-20" }], {
      holidayProvider: jp,
    }),
    [{ severity: "warning", code: "never-matches", path: "closedRecurringRules[0]" }],
  );
  assert.deepEqual(
    recurring([{ weekday: 3, nth: 5, effectiveFrom: "2027-03-01", effectiveTo: "2027-03-31" }], {
      holidayProvider: jp,
    }),
    [],
    "2027 年 3 月には第 5 水曜日（3/31）がある",
  );
  assert.deepEqual(
    recurring(
      [{ dayOfMonth: 29, months: [2], effectiveFrom: "2029-01-01", effectiveTo: "2031-12-31" }],
      { holidayProvider: jp },
    ),
    [{ severity: "warning", code: "never-matches", path: "closedRecurringRules[0]" }],
    "期間にうるう年がない",
  );
  // The effective period is outside the provider's supported years (in options that throw outside the supported
  // years, the rule is never used)
  assert.deepEqual(
    recurring([{ weekday: 1, effectiveTo: "1950-12-31" }], {
      holidayProvider: jp,
      closedAnnualDates: [{ date: "01-02", effectiveFrom: "2100-01-01" }],
    }),
    [
      {
        severity: "warning",
        code: "out-of-range",
        path: "closedAnnualDates[0]",
        relatedPath: "holidayProvider",
      },
      {
        severity: "warning",
        code: "out-of-range",
        path: "closedRecurringRules[0]",
        relatedPath: "holidayProvider",
      },
    ],
  );
  assert.deepEqual(
    recurring([{ weekday: 1, effectiveFrom: "2100-01-01" }], {
      holidayProvider: jp,
      outOfRangePolicy: "ignore",
    }),
    [
      {
        severity: "warning",
        code: "out-of-range",
        path: "closedRecurringRules[0]",
        relatedPath: "holidayProvider",
      },
    ],
  );
});

test("redundant: 走査の範囲は、固定の範囲と規則の有効期間と、有効期間の外側の 1 周期を合わせたもの", () => {
  // A rule outside the fixed range (2001-2028) of options without a provider is not wrongly diagnosed as unused
  assert.deepEqual(
    brief(
      diagnoseCalendar({ closedRecurringRules: [{ weekday: 1, effectiveFrom: "2030-01-01" }] }),
    ),
    [],
  );
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedWeekdays: [1],
        closedRecurringRules: [
          { weekday: 1, effectiveFrom: "2030-01-01", effectiveTo: "2031-12-31" },
        ],
      }),
    ),
    [{ severity: "info", code: "redundant", path: "closedRecurringRules[0]" }],
  );
  // On the side without a limit, the length of the cycle in which the matching repeats (28 years) is examined
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedRecurringRules: [{ weekday: 3, nth: 5, effectiveTo: "1990-12-31" }],
      }),
    ),
    [],
  );
  // The effective period within the diagnostic range (from 1955) and its outside (one cycle from 1991) are
  // examined, so the ranges join
  assert.ok(
    /checked 1955-2028\)/.test(
      diagnoseCalendar({
        closedWeekdays: [3],
        closedRecurringRules: [{ weekday: 3, nth: 5, effectiveTo: "1990-12-31" }],
      })[0]!.message,
    ),
  );
});

test("shadowed・never-matches・redundant: 周期（interval）", () => {
  const shadowed = (rules: RecurringRule[], extra: object = {}) =>
    recurring(rules, extra)
      .filter((d) => d.code === "shadowed")
      .map((d) => `${d.path}<${d.relatedPath}`);
  const wed = (interval: number, anchor: string): RecurringRule => ({
    weekday: 3,
    interval,
    anchor,
  });
  assert.deepEqual(
    shadowed([{ weekday: 3 }, wed(2, "2026-01-07")]),
    ["closedRecurringRules[1]<closedRecurringRules[0]"],
    "毎週は隔週を覆う",
  );
  assert.deepEqual(shadowed([wed(2, "2026-01-07"), { weekday: 3 }]), [], "隔週は毎週を覆わない");
  assert.deepEqual(
    shadowed([wed(2, "2026-01-07"), wed(2, "2026-01-14")]),
    [],
    "位相の違う隔週は互いに素",
  );
  assert.deepEqual(
    shadowed([wed(2, "2026-01-07"), wed(2, "2026-01-21")]),
    ["closedRecurringRules[1]<closedRecurringRules[0]"],
    "同じ位相の隔週",
  );
  assert.deepEqual(
    shadowed([wed(2, "2026-01-07"), wed(4, "2026-02-04")]),
    ["closedRecurringRules[1]<closedRecurringRules[0]"],
    "4 週おきは、同じ位相の隔週に覆われる",
  );
  assert.deepEqual(shadowed([wed(2, "2026-01-07"), wed(4, "2026-01-14")]), []);
  assert.deepEqual(
    shadowed([wed(2, "2026-01-07"), wed(3, "2026-01-07")]),
    [],
    "3 週おきは隔週に覆われない",
  );
  assert.deepEqual(
    shadowed([{ weekday: 3, nth: [1, 3] }, wed(2, "2026-01-07")]),
    [],
    "第 1・3 水曜は隔週を覆わない（5 回ある月でずれる）",
  );
  // redundant of a rule with a cycle cannot be checked in the fixed range of 28 years (the phase of every other
  // week flips after 28 years), so 56 years are examined
  const list = diagnoseCalendar({
    closedWeekdays: [3],
    closedRecurringRules: [wed(2, "2026-01-07")],
  });
  assert.deepEqual(brief(list), [
    { severity: "info", code: "redundant", path: "closedRecurringRules[0]" },
  ]);
  assert.ok(/checked 2001-2056/.test(list[0]!.message), list[0]!.message);
  assert.deepEqual(
    brief(diagnoseCalendar({ closedRecurringRules: [wed(2, "2026-01-07"), wed(2, "2026-01-14")] })),
    [],
    "位相の違う隔週を 2 つ書いても、毎週とは別の規則として扱う（どちらも使われる）",
  );
  assert.deepEqual(
    recurring([
      {
        weekday: 3,
        interval: 6,
        anchor: "2026-01-07",
        months: [2],
        effectiveFrom: "2027-02-01",
        effectiveTo: "2027-02-28",
      },
    ]),
    [{ severity: "warning", code: "never-matches", path: "closedRecurringRules[0]" }],
    "2027 年 2 月の水曜は起点から 56〜59 週で、6 週おきの日がない",
  );
  assert.deepEqual(
    recurring([
      {
        weekday: 3,
        interval: 2,
        anchor: "2026-01-07",
        months: [2],
        effectiveFrom: "2027-02-01",
        effectiveTo: "2027-02-28",
      },
    ]),
    [],
    "隔週なら 2027-02-03（56 週後）が当てはまる",
  );
});

test("第 n 営業日の規則があると、数え方を変える個別の日付・毎年の月日は redundant にしない", () => {
  const brief = (options: Parameters<typeof diagnoseCalendar>[0]) =>
    diagnoseCalendar(options)
      .filter((d) => d.code === "redundant" || d.code === "shadowed")
      .map((d) => [d.code, d.path]);
  // Removing a specific date or annual date shifts the nth business day and changes another day of the same
  // month or week (May 2, May 5, ...)
  assert.deepEqual(
    brief({
      closedDates: ["2026-05-01"],
      closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: 1 }],
    }),
    [["redundant", "closedRecurringRules[0]"]],
  );
  assert.deepEqual(
    brief({
      closedAnnualDates: ["05-01"],
      closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: 1 }],
    }),
    [["redundant", "closedRecurringRules[0]"]],
  );
  assert.deepEqual(
    brief({
      closedDates: ["2026-05-04"],
      closedRecurringRules: [{ weekday: 1 }, { businessDayOfWeek: 1, weekStart: 1 }],
    }),
    [["redundant", "closedRecurringRules[0]"]],
  );
  // The nth business day of an opening rule uses the count in the same way
  assert.deepEqual(
    brief({
      closedDates: ["2026-05-01"],
      openRecurringRules: [{ businessDayOfMonth: 2 }],
      closedRecurringRules: [{ dayOfMonth: [1, 2, 3, 4, 5] }],
    }),
    [],
  );
});

test("スケジュールの第 n 営業日の規則は別のカレンダーで数えるので、個別の日付の redundant は変わらない", () => {
  const calendar = createCalendar({ closedWeekdays: [0, 6] });
  assert.deepEqual(
    diagnoseSchedule({
      weekdayValues: ["closed", "A", "A", "A", "A", "A", "closed"],
      dates: [{ date: "2026-05-01", value: "B" }],
      recurringRules: [{ businessDayOfMonth: 1, calendar, value: "B" }],
    }).map((d) => [d.code, d.path]),
    [["redundant", "dates[0]"]],
  );
});

test("unknown-option: カレンダーの個別の日付・毎年の月日に書いた value（スケジュールの書き方の流用）", () => {
  for (const [key, entry] of [
    ["closedDates", { date: "2026-12-01", value: true }],
    ["openDates", { date: "2026-12-01", value: true }],
    ["closedAnnualDates", { date: "12-01", value: true }],
  ] as const) {
    const list = diagnoseCalendar({ [key]: [entry] } as never).filter(
      (d) => d.code === "unknown-option",
    );
    assert.deepEqual(
      list.map((d) => [d.path, d.severity]),
      [[`${key}[0].value`, "warning"]],
      key,
    );
  }
});

// ------------------------------------------------------------
// Effective periods limited on one side, and years divisible by 100 but not by 400 (1900, 2100, ...)
// ------------------------------------------------------------

/** Whether a year is a leap year (a naive definition that does not use the library) */
const leapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** The weekday (0 = Sunday; a naive definition without the library or Date: Tomohiko Sakamoto's method) */
const weekdayByArithmetic = (y: number, m: number, d: number): number => {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  return (
    (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1]! + d) % 7
  );
};
const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Shapes of rules that match in February only (whose matching years follow from the kind of year) */
type FebruaryShape =
  | { readonly weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; readonly nth: 5 }
  | { readonly dayOfMonth: 29 | 30 };
/** An effective period limited on one side */
type OneSided = { readonly effectiveFrom: string } | { readonly effectiveTo: string };

/**
 * Naive definition: the days on which a February rule shape matches within an effective period limited on one
 * side (nearest to the limit first). Without the library, the February days of 400 years from the limit are
 * examined one by one (the calendar repeats after 400 years = 146,097 days = 20,871 weeks, so what does not
 * match in 400 years never matches). Days outside the calendar range (years 1000-9999) are not examined
 */
function februaryMatches(shape: FebruaryShape, period: OneSided): string[] {
  const forward = "effectiveFrom" in period;
  const edge = forward ? period.effectiveFrom : period.effectiveTo;
  const edgeYear = Number(edge.slice(0, 4));
  const years: number[] = [];
  for (let k = 0; k <= 400; k++) {
    const y = forward ? edgeYear + k : edgeYear - k;
    if (y >= 1000 && y <= 9999) years.push(y);
  }
  const found: string[] = [];
  for (const y of years) {
    for (let d = 1; d <= (leapYear(y) ? 29 : 28); d++) {
      const date = iso(y, 2, d);
      if (forward ? date < edge : date > edge) continue;
      const hit =
        "weekday" in shape
          ? weekdayByArithmetic(y, 2, d) === shape.weekday && Math.ceil(d / 7) === shape.nth
          : d === shape.dayOfMonth;
      if (hit) found.push(date);
    }
  }
  return found;
}

const FEBRUARY_SHAPES: readonly FebruaryShape[] = [
  ...([0, 1, 2, 3, 4, 5, 6] as const).map((weekday) => ({ weekday, nth: 5 }) as const),
  { dayOfMonth: 29 },
  { dayOfMonth: 30 },
];
/**
 * The limit days: those with fewer than 28 years between the limit and the end of the diagnostic range (the
 * first 4: the part of the period in the range is shorter than one cycle), those with 28 years or more
 * (controls), and those without a day in the diagnostic range (the last 4: not examined)
 */
const ONE_SIDED: readonly OneSided[] = [
  { effectiveFrom: "2073-01-01" },
  { effectiveFrom: "2096-03-01" },
  { effectiveTo: "1982-12-31" },
  { effectiveTo: "1958-02-28" },
  { effectiveFrom: "2030-01-01" },
  { effectiveTo: "1999-12-31" },
  { effectiveFrom: "2101-01-01" },
  { effectiveTo: "1954-12-31" },
  { effectiveTo: "1020-12-31" },
  { effectiveFrom: "9975-01-01" },
];
/** Whether a date is in the diagnostic range */
const inRange = (date: string): boolean =>
  Number(date.slice(0, 4)) >= DIAGNOSTIC_YEARS.from &&
  Number(date.slice(0, 4)) <= DIAGNOSTIC_YEARS.to;

interface OneSidedCase {
  readonly label: string;
  readonly rule: RecurringRule;
  /** The matching days by the naive definition that are in the diagnostic range (nearest to the limit first) */
  readonly matches: readonly string[];
  /** The rule matches only on days outside the diagnostic range (400 years from the limit were examined) */
  readonly late: boolean;
  /** The effective period has a day in the diagnostic range */
  readonly examined: boolean;
  readonly codes: readonly string[];
  readonly messages: readonly string[];
}
let oneSidedCases: readonly OneSidedCase[] | undefined;
/**
 * Diagnoses every combination of rule shape × limit once (the two tests below check the same results from two
 * points of view)
 */
function oneSided(): readonly OneSidedCase[] {
  oneSidedCases ??= FEBRUARY_SHAPES.flatMap((shape) =>
    ONE_SIDED.map((period): OneSidedCase => {
      const rule = { ...shape, months: [2], ...period } as RecurringRule;
      const everywhere = februaryMatches(shape, period);
      const matches = everywhere.filter(inRange);
      const examined =
        "effectiveFrom" in period
          ? Number(period.effectiveFrom.slice(0, 4)) <= DIAGNOSTIC_YEARS.to
          : Number(period.effectiveTo.slice(0, 4)) >= DIAGNOSTIC_YEARS.from;
      const diagnostics = diagnoseCalendar({ closedWeekdays: [], closedRecurringRules: [rule] });
      return {
        label: JSON.stringify(rule),
        rule,
        matches,
        late: examined && matches.length === 0 && everywhere.length > 0,
        examined,
        codes: diagnostics.map((d) => d.code),
        messages: diagnostics.map((d) => d.message),
      };
    }),
  );
  return oneSidedCases;
}

test("素朴な定義の曜日は、暦の知られた日と合う", () => {
  assert.equal(weekdayByArithmetic(2026, 11, 13), 5);
  assert.equal(weekdayByArithmetic(1970, 1, 1), 4);
  assert.equal(weekdayByArithmetic(2000, 2, 29), 2);
  assert.equal(weekdayByArithmetic(2112, 2, 29), 1);
  assert.equal(weekdayByArithmetic(1000, 1, 1), 3);
  assert.equal(weekdayByArithmetic(9999, 12, 31), 5);
});

test("never-matches: 期限が片側だけの有効期間でも、診断の範囲の日を 1 日ずつ調べた素朴な定義と一致する（範囲に日のない規則は調べない）", () => {
  const cases = oneSided();
  for (const c of cases) {
    if (!c.examined) {
      assert.deepEqual(c.codes, ["out-of-range"], c.label);
      continue;
    }
    assert.equal(c.codes.includes("never-matches"), c.matches.length === 0, c.label);
    // The matching days of the naive definition are closed days in the library's judgement too (a watch over
    // mistakes on the naive side)
    if (c.matches.length > 0) {
      const calendar = createCalendar({ closedWeekdays: [], closedRecurringRules: [c.rule] });
      assert.equal(calendar.isBusinessDay(c.matches[0]!), false, c.label);
    }
    // A rule that matches only outside the diagnostic range says which years were examined; a rule that
    // matches nowhere (a whole cycle was examined, or no February 30 exists) needs no note only in the first case
    if (c.late) assert.match(c.messages[0]!, new RegExp(`\\(checked ${RANGE} only\\)`), c.label);
  }
  const late = cases.filter((c) => c.late).length;
  const never = cases.filter((c) => c.examined && c.matches.length === 0).length;
  const skipped = cases.filter((c) => !c.examined).length;
  console.log(
    `# 片側だけの有効期間: ${cases.length} 件（範囲の外でだけ当てはまる ${late}、範囲の中で当てはまらない ${never}、範囲に日がない ${skipped}）`,
  );
  assert.ok(late > 0 && never > late && skipped > 0);
});

test("redundant: 期限が片側だけの有効期間でも、診断の範囲の中で当てはまる規則を redundant にしない", () => {
  const cases = oneSided().filter((c) => c.matches.length > 0);
  assert.ok(cases.length > 0);
  // The options have no closed weekday, so removing a closing rule with a matching day changes that day
  for (const c of cases) assert.equal(c.codes.includes("redundant"), false, c.label);
});

test("never-matches: 第 n 営業日の規則が診断の範囲の外でだけ当てはまるなら、調べた年を添えて出す（範囲の中で当てはまるなら出さない）", () => {
  // With only Mondays as business days, February has a fifth business day only in years in which February 29 is
  // a Monday (2044, 2072; the first from 2073 is 2112, outside the diagnostic range)
  assert.deepEqual(
    februaryMatches({ weekday: 1, nth: 5 }, { effectiveFrom: "2073-01-01" }).slice(0, 1),
    ["2112-02-29"],
  );
  const options = (effectiveFrom: string): CalendarOptions => ({
    closedWeekdays: [0, 2, 3, 4, 5, 6],
    closedRecurringRules: [{ businessDayOfMonth: 5, months: [2], effectiveFrom }],
  });
  assert.deepEqual(brief(diagnoseCalendar(options("2045-01-01"))), []);
  assert.equal(createCalendar(options("2045-01-01")).isBusinessDay("2072-02-29"), false);
  const late = diagnoseCalendar(options("2073-01-01"));
  assert.deepEqual(brief(late), [
    { severity: "warning", code: "never-matches", path: "closedRecurringRules[0]" },
  ]);
  assert.match(late[0]!.message, new RegExp(`\\(checked ${RANGE} only\\)$`));
  assert.equal(createCalendar(options("2073-01-01")).isBusinessDay("2112-02-29"), false);
});

test("diagnoseSchedule: タイムゾーンが決まらない設定では、基準のカレンダーとの time-zone-conflict を重ねて出さない", () => {
  const tokyo = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const rules = [{ businessDayOfMonth: 1, calendar: tokyo, value: 2 }];
  const weekdayValues = [1, 1, 1, 1, 1, 1, 1] as const;
  // A wrong timeZone value: no conflict with the provisional value ("UTC") is reported
  assert.deepEqual(
    brief(diagnoseSchedule({ timeZone: "Bad/Zone", weekdayValues, recurringRules: rules })),
    [{ severity: "error", code: "invalid-time-zone", path: "timeZone" }],
  );
  // Conflicting providers: no conflict with the provisional value (the first provider's time zone) is reported
  const london: HolidayProvider = { ...SHORT_PROVIDER, id: "X-LON", timeZone: "Europe/London" };
  assert.deepEqual(
    brief(
      diagnoseSchedule({
        holidayProvider: [london, SHORT_PROVIDER],
        holidayPolicy: "ignore",
        weekdayValues,
        recurringRules: rules,
      }),
    ),
    [{ severity: "error", code: "time-zone-conflict", path: "timeZone" }],
  );
  // Creation stops at the first mistake in both cases (the same code as the first diagnostic)
  assert.throws(
    () => createSchedule({ timeZone: "Bad/Zone", weekdayValues, recurringRules: rules }),
    { code: "invalid-time-zone" },
  );
});

test("diagnoseSchedule: タイムゾーンが決まっていて基準のカレンダーだけが違うときは、time-zone-conflict を出す", () => {
  const tokyo = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const rules = [{ businessDayOfMonth: 1, calendar: tokyo, value: 2 }];
  const weekdayValues = [1, 1, 1, 1, 1, 1, 1] as const;
  assert.deepEqual(
    brief(diagnoseSchedule({ timeZone: "UTC", weekdayValues, recurringRules: rules })),
    [{ severity: "error", code: "time-zone-conflict", path: "recurringRules[0].calendar" }],
  );
  assert.deepEqual(
    brief(diagnoseSchedule({ timeZone: "Asia/Tokyo", weekdayValues, recurringRules: rules })),
    [],
  );
});

// ---- 0.32.6: the outer side of the boundaries of inputs that make results differ by year (decisions.md #31) ----

import { sg } from "../src/sg/index.ts";

/** A provider with supported years from-to whose holidays are January 1-3 every year (the basis of form B') */
const januaryProvider = (from: number, to: number): HolidayProvider => ({
  id: `january-${from}-${to}`,
  timeZone: "UTC",
  supportedYears: { from, to },
  dataVersion: "1",
  holidaysInYear: (year) =>
    [1, 2, 3].map((d) => ({
      date: `${year}-01-0${d}`,
      name: `H${d}`,
      nameEn: `H${d}`,
      kind: "regular",
      confirmed: true,
    })),
});

/** Removes the rule at a position of the given array from options */
const without = <O extends object>(options: O, key: keyof O & string, index: number): O => ({
  ...options,
  [key]: (options[key] as unknown as unknown[]).filter((_, i) => i !== index),
});

test("境目の外側（有効期間）: 有効期間の外側だけで効く規則を redundant と出さない（0.32.5 までは出て、取り除くと判定が変わった）", () => {
  // [name, options, the position 0.32.5 reported as redundant, a day whose judgement changes when it is removed]
  const cases: [
    string,
    CalendarOptions,
    "closedRecurringRules" | "closedAnnualDates",
    number,
    string,
  ][] = [
    [
      "終わった後に効く規則",
      {
        closedRecurringRules: [
          { weekday: 3, effectiveTo: "2030-03-31" },
          { weekday: 3, nth: [1, 3] },
        ],
      },
      "closedRecurringRules",
      1,
      "2030-04-03",
    ],
    [
      "毎年の月日",
      {
        closedAnnualDates: [
          { from: "08-10", to: "08-20", effectiveTo: "2031-12-31" },
          { date: "08-15" },
        ],
      },
      "closedAnnualDates",
      1,
      "2032-08-15",
    ],
    [
      "提供元の外と重なる",
      {
        holidayProvider: sg,
        outOfRangePolicy: "ignore",
        closedRecurringRules: [
          { weekday: 3, effectiveTo: "2028-03-31" },
          { weekday: 3, nth: [1, 3] },
        ],
      },
      "closedRecurringRules",
      1,
      "2028-04-05",
    ],
    [
      "始まる前に効く規則",
      {
        closedRecurringRules: [
          { weekday: 3, effectiveFrom: "1995-04-01" },
          { weekday: 3, nth: [1, 3] },
        ],
      },
      "closedRecurringRules",
      1,
      "1995-03-01",
    ],
  ];
  for (const [name, options, key, index, day] of cases) {
    const path = `${key}[${index}]`;
    assert.deepEqual(
      diagnoseCalendar(options).filter((d) => d.path === path),
      [],
      name,
    );
    assert.notEqual(
      createCalendar(options).isBusinessDay(day),
      createCalendar(without(options, key, index)).isBusinessDay(day),
      `${name}: ${path} を取り除くと ${day} が変わる`,
    );
  }
  // The same for a schedule
  const schedule: ScheduleOptions<number> = {
    weekdayValues: [1, 1, 1, 1, 1, 1, 1],
    recurringRules: [
      { weekday: 3, value: 0, effectiveTo: "2030-03-31" },
      { weekday: 3, nth: 1, value: 0 },
    ],
  };
  assert.deepEqual(diagnoseSchedule(schedule), []);
  assert.notEqual(
    createSchedule(schedule).valueOn("2030-04-03"),
    createSchedule(without(schedule, "recurringRules", 1)).valueOn("2030-04-03"),
  );
});

test("境目の外側（有効期間）: 有効期間が終わった後に営業日のある設定を no-business-day と出さない", () => {
  const options: CalendarOptions = {
    closedWeekdays: [0, 6],
    closedRecurringRules: [
      { weekday: 1 },
      { weekday: 2 },
      { weekday: 3 },
      { weekday: 4 },
      { weekday: 5, effectiveTo: "2030-03-31" },
    ],
  };
  assert.deepEqual(diagnoseCalendar(options), []);
  assert.equal(createCalendar(options).nextBusinessDay("2026-11-17"), "2030-04-05");
});

test("境目の外側（有効期間）: 診断の範囲の外まで続く個別の日付は、範囲の中の日だけで判定し、調べた年を添える", () => {
  const options: CalendarOptions = {
    closedWeekdays: [],
    closedDates: [{ from: "2026-04-01", to: "9999-12-31" }],
    closedRecurringRules: ([0, 1, 2, 3, 4, 5, 6] as const).map((weekday) => ({
      weekday,
      effectiveTo: "2300-12-31",
    })),
  };
  // Within the diagnostic range every day is closed by the rules, so the date changes nothing there. The
  // statements are about the range (from 2301, outside it, only the specific date closes the day)
  assert.deepEqual(
    diagnoseCalendar(options).map((d) => `${d.code} ${d.path} ${d.message}`),
    [
      `no-business-day  No day is a business day with these options (checked ${RANGE}); searching for a business day throws`,
      `redundant closedDates[0] Removing this rule does not change any result (checked ${RANGE} only)`,
    ],
  );
  assert.equal(createCalendar(options).isBusinessDay("2301-01-05"), false);
  assert.equal(
    createCalendar(without(options, "closedDates", 0)).isBusinessDay("2301-01-05"),
    true,
  );
  // With the rules ending inside the range, the date decides days of the range and is not reported.
  // no-business-day is not reported either: it is judged without the specific dates (reported only when no day
  // is a business day, never the other way round)
  const inside: CalendarOptions = {
    ...options,
    closedRecurringRules: options.closedRecurringRules!.map((r) => ({
      ...r,
      effectiveTo: "2050-12-31",
    })),
  };
  assert.deepEqual(diagnoseCalendar(inside), []);
});

test('境目の外側（"ignore" の提供元）: "ignore" の提供元の対応年の外だけで効く規則を redundant と出さない', () => {
  const options: CalendarOptions = {
    holidayProvider: sg,
    outOfRangePolicy: "ignore",
    closedAnnualDates: [{ date: "08-09" }],
  };
  assert.deepEqual(diagnoseCalendar(options), []);
  for (const day of ["2028-08-09", "2019-08-09"]) {
    assert.equal(createCalendar(options).isBusinessDay(day), false, day);
    assert.equal(
      createCalendar(without(options, "closedAnnualDates", 0)).isBusinessDay(day),
      true,
      day,
    );
  }
});

test('境目の外側（基準のカレンダー）: 第 n 営業日の規則の基準のカレンダーが "ignore" のとき、その対応年の外だけで効く規則を redundant と出さない', () => {
  const basis = createCalendar({
    timeZone: "UTC",
    closedWeekdays: [],
    holidayProvider: januaryProvider(2001, 2028),
    outOfRangePolicy: "ignore",
  });
  const options: ScheduleOptions<number> = {
    timeZone: "UTC",
    weekdayValues: [1, 1, 1, 1, 1, 1, 1],
    annualDates: [{ date: "01-04", value: 0 }],
    recurringRules: [{ businessDayOfMonth: 1, months: [1], calendar: basis, value: 0 }],
  };
  assert.deepEqual(diagnoseSchedule(options), []);
  // In years outside the supported years January 1 is the first business day, so only the annual date makes
  // January 4 a 0
  assert.equal(createSchedule(options).valueOn("2029-01-04"), 0);
  assert.equal(createSchedule(without(options, "annualDates", 0)).valueOn("2029-01-04"), 1);
});

test('境目の外側（端の形）: 足した範囲が基準のカレンダー（"throw"）の対応年の外に出ても、診断は投げず、出た項目を取り除いても判定できる日の値は変わらない', () => {
  const basis = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const options: ScheduleOptions<number> = {
    timeZone: "Asia/Tokyo",
    weekdayValues: [1, 1, 1, 1, 1, 1, 1],
    recurringRules: [
      { weekday: 3, value: 0, effectiveTo: "2090-03-31" },
      { businessDayOfMonth: 1, calendar: basis, value: 0 },
      { weekday: 3, nth: 1, value: 0 },
      { weekday: 3, nth: 2, value: 0, effectiveTo: "2080-12-31" },
    ],
  };
  const items = diagnoseSchedule(options);
  // The first Wednesday takes effect from April 2090 (it cannot be removed). The second Wednesday (until 2080) is
  // contained in the weekly Wednesday (until March 2090)
  assert.deepEqual(
    items.map((d) => [d.code, d.path]),
    [["shadowed", "recurringRules[3]"]],
  );
  const before = createSchedule(options);
  const after = createSchedule(without(options, "recurringRules", 3));
  const value = (s: typeof before, day: string): string => {
    try {
      return String(s.valueOn(day));
    } catch (e) {
      return `throws ${(e as { code?: string }).code}`;
    }
  };
  for (let y = 2050; y <= 2120; y++)
    for (const md of ["-01-01", "-03-08", "-06-11", "-12-10"]) {
      const day = `${y}${md}`;
      const [a, b] = [value(before, day), value(after, day)];
      if (!a.startsWith("throws")) assert.equal(b, a, day);
    }
});

test('境目の外側（端の形）: 対応年が診断の範囲より広い提供元を "ignore" で使う設定では、範囲に日のない規則は調べず、範囲の中の日だけで判定する', () => {
  const long: HolidayProvider = {
    id: "long",
    timeZone: "UTC",
    supportedYears: { from: 1800, to: 2200 },
    dataVersion: "1",
    holidaysInYear: (year) => [
      { date: `${year}-01-01`, name: "N", nameEn: "N", kind: "regular", confirmed: true },
    ],
  };
  const options: CalendarOptions = {
    holidayProvider: long,
    outOfRangePolicy: "ignore",
    closedRecurringRules: [
      { weekday: 3, effectiveTo: "1850-12-31" },
      { weekday: 3, nth: [1, 3] },
    ],
    closedAnnualDates: [{ date: "01-01" }],
  };
  // Within the diagnostic range January 1 is always a holiday, so the annual date changes nothing there (from
  // 2201, outside the supported years and outside the range, only the annual date closes January 1)
  assert.deepEqual(
    diagnoseCalendar(options).map((d) => `${d.code} ${d.path}`),
    ["out-of-range closedRecurringRules[0]", "redundant closedAnnualDates[0]"],
  );
  assert.match(diagnoseCalendar(options)[1]!.message, new RegExp(`\\(checked ${RANGE}\\)$`));
  assert.equal(createCalendar(options).isBusinessDay("2201-01-01"), false);
  assert.equal(
    createCalendar(without(options, "closedAnnualDates", 0)).isBusinessDay("2201-01-01"),
    true,
  );
});

// ---- 0.32.6: inside the basis calendar of an nth-business-day rule (decisions.md #31) ----

/** Supported years from-to. January 1 is a holiday every year, January 2-3 until the year `last` */
const janProvider = (from: number, to: number, last: number): HolidayProvider => ({
  id: `jan-${from}-${to}-${last}`,
  timeZone: "UTC",
  supportedYears: { from, to },
  dataVersion: "1",
  holidaysInYear: (year) =>
    [1, 2, 3]
      .filter((d) => d === 1 || year <= last)
      .map((d) => ({
        date: `${year}-01-0${d}`,
        name: `H${d}`,
        nameEn: `H${d}`,
        kind: "regular",
        confirmed: true,
      })),
});
/**
 * Supported years from-to. Only in the year `special`, January 1-3 are holidays (no holidays in other years or
 * outside the supported years)
 */
const oneYearProvider = (from: number, to: number, special: number): HolidayProvider => ({
  id: `one-year-${from}-${to}-${special}`,
  timeZone: "UTC",
  supportedYears: { from, to },
  dataVersion: "1",
  holidaysInYear: (year) =>
    [1, 2, 3]
      .filter(() => year === special)
      .map((d) => ({
        date: `${year}-01-0${d}`,
        name: `H${d}`,
        nameEn: `H${d}`,
        kind: "regular",
        confirmed: true,
      })),
});
const UTC_OPEN = { timeZone: "UTC", closedWeekdays: [] as number[] };
/** January 1-3 are closed until 2030 (the rule inside has an effective period) */
const basisC = () =>
  createCalendar({
    ...UTC_OPEN,
    closedAnnualDates: [{ from: "01-01", to: "01-03", effectiveTo: "2030-12-31" }],
  } as CalendarOptions);
/** A schedule without a provider: one annual date and one nth-business-day rule counted on a basis calendar */
const onBasis = (
  basis: object,
  annual: string,
  rule: Record<string, unknown> = { businessDayOfMonth: 1, months: [1] },
): ScheduleOptions<number> =>
  ({
    timeZone: "UTC",
    weekdayValues: [1, 1, 1, 1, 1, 1, 1],
    annualDates: [{ date: annual, value: 0 }],
    recurringRules: [{ ...rule, calendar: basis, value: 0 }],
  }) as unknown as ScheduleOptions<number>;
const valueAt = (o: ScheduleOptions<number>, day: string): string => {
  try {
    return String(createSchedule(o).valueOn(day));
  } catch (e) {
    return `throws ${(e as { code?: string }).code}`;
  }
};

test("基準のカレンダーの中: 中の有効期間・個別の日付・周期・提供元・合成・スケジュールから作ったもの・入れ子・作成関数で作っていないものの形で、取り除くと結果が変わる毎年の月日を redundant と出さない（0.32.5 までは出た）", () => {
  const fromSchedule = (annual: Record<string, unknown>, basis?: object) =>
    createCalendarFromSchedule(
      createSchedule({
        timeZone: "UTC",
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        annualDates: [annual],
        ...(basis
          ? { recurringRules: [{ businessDayOfMonth: 1, months: [1], calendar: basis, value: 0 }] }
          : {}),
      } as unknown as ScheduleOptions<number>),
      (v) => v === 1,
    );
  const sep = (n: number) => ({ businessDayOfMonth: n, months: [9] });
  // [name of the form, options, a day whose value changes when it is removed]
  const cases: [string, ScheduleOptions<number>, string][] = [
    ["中の有効期間", onBasis(basisC(), "01-04"), "2031-01-04"],
    [
      "スケジュールから作ったもの",
      onBasis(
        fromSchedule({ from: "01-01", to: "01-03", value: 0, effectiveTo: "2030-12-31" }),
        "01-04",
      ),
      "2031-01-04",
    ],
    [
      "合成",
      onBasis(
        combineCalendars([basisC(), createCalendar(UTC_OPEN as CalendarOptions)], { open: "all" }),
        "01-04",
      ),
      "2031-01-04",
    ],
    [
      "個別の日付（走査の範囲を覆う）",
      onBasis(
        createCalendar({
          ...UTC_OPEN,
          closedDates: Array.from({ length: 30 }, (_, i) => ({
            from: `${2001 + i}-01-01`,
            to: `${2001 + i}-01-03`,
          })),
        } as CalendarOptions),
        "01-04",
      ),
      "1990-01-04",
    ],
    [
      "周期（cycle 324 日）",
      onBasis(
        createCalendar({
          ...UTC_OPEN,
          closedRecurringRules: [{ cycle: 324, anchor: "2012-06-16", positions: [25] }],
        } as CalendarOptions),
        "09-02",
        sep(2),
      ),
      "1940-09-02",
    ],
    [
      "周期（cycle 126 日。走査が 2100 年をまたぐ）",
      onBasis(
        createCalendar({
          ...UTC_OPEN,
          closedRecurringRules: [{ cycle: 126, anchor: "2024-06-14", positions: [63] }],
        } as CalendarOptions),
        "09-01",
        sep(1),
      ),
      "1966-09-01",
    ],
    [
      "周期（6 週ごと）",
      onBasis(
        createCalendar({
          ...UTC_OPEN,
          closedRecurringRules: [{ weekday: 5, interval: 6, anchor: "2026-09-18" }],
        } as CalendarOptions),
        "01-01",
      ),
      "1943-01-01",
    ],
    [
      '"throw" の提供元の祝日が年で変わる',
      onBasis(
        createCalendar({
          ...UTC_OPEN,
          holidayProvider: janProvider(1990, 2060, 2030),
        } as CalendarOptions),
        "01-04",
      ),
      "2031-01-04",
    ],
    [
      '"ignore" の提供元の祝日が、対応年の中の 1 年だけ違う（境目から離れている）',
      onBasis(
        createCalendar({
          ...UTC_OPEN,
          holidayProvider: oneYearProvider(1990, 2060, 2030),
          outOfRangePolicy: "ignore",
        } as CalendarOptions),
        "01-01",
      ),
      "2030-01-01",
    ],
    [
      "入れ子（スケジュールから作ったものの規則の基準）",
      onBasis(fromSchedule({ date: "12-31", value: 1 }, basisC()), "01-01"),
      "2031-01-01",
    ],
    ["作成関数で作っていないもの", onBasis({ ...basisC() }, "01-04"), "2031-01-04"],
  ];
  for (const [name, options, day] of cases) {
    assert.deepEqual(diagnoseSchedule(options), [], name);
    assert.notEqual(
      valueAt(options, day),
      valueAt({ ...options, annualDates: [] }, day),
      `${name}: 毎年の月日を取り除くと ${day} が変わる`,
    );
  }
});

test('基準のカレンダーの中: "throw" の提供元の対応年の外で基準が投げるとき、その日を決めている毎年の月日を redundant と出さない（取り除くと、値を返した日が例外になる）', () => {
  for (const basis of [
    createCalendar({
      ...UTC_OPEN,
      holidayProvider: SHORT_PROVIDER,
      holidayPolicy: "open",
    } as CalendarOptions),
    combineCalendars(
      [
        createCalendar({ timeZone: "UTC", holidayProvider: SHORT_PROVIDER, closedWeekdays: [0] }),
        createCalendar(UTC_OPEN as CalendarOptions),
      ],
      { open: "any" },
    ),
  ]) {
    // The provider supports 2025-2027 only: in the other years of the diagnostic range the basis throws
    const options = onBasis(basis, "09-01", { businessDayOfMonth: 1, months: [9] });
    assert.deepEqual(diagnoseSchedule(options), []);
    assert.equal(valueAt(options, "1990-09-01"), "0");
    assert.equal(valueAt({ ...options, annualDates: [] }, "1990-09-01"), "throws out-of-range");
  }
});

test("基準のカレンダーの中: 作成関数で作っていないカレンダーの形のオブジェクトの項目が欠けていても、診断は error を出さない（作成は成功する）", () => {
  const plain = createCalendar(UTC_OPEN as CalendarOptions);
  for (const extra of [{ providers: undefined }, { providers: null }, { providers: [{}] }]) {
    const like: Record<string, unknown> = { ...plain, outOfRangePolicy: "ignore", ...extra };
    if (extra.providers === undefined) delete like["providers"];
    const options = onBasis(like, "01-04");
    assert.doesNotThrow(() => createSchedule(options));
    assert.deepEqual(diagnoseSchedule(options), [], JSON.stringify(extra));
  }
});

test("基準のカレンダーの中: 作成関数の結果の公開の形（列挙・JSON.stringify・凍結）は変わらず、中身は Symbol の項目の入れ物にあり、スプレッドで写したオブジェクトからは読めない", () => {
  const schedule = createSchedule({ timeZone: "UTC", weekdayValues: [1, 1, 1, 1, 1, 1, 1] });
  const made = {
    createCalendar: basisC(),
    combineCalendars: combineCalendars([basisC(), basisC()], { open: "all" }),
    createCalendarFromSchedule: createCalendarFromSchedule(schedule, (v) => v === 1),
    createSchedule: schedule,
  };
  for (const [name, value] of Object.entries(made)) {
    assert.ok(Object.isFrozen(value), name);
    // The only Symbol properties are the holder of the parts (PARTS) and the existing internal properties of a
    // schedule. They do not appear in Object.keys, for...in or JSON
    assert.deepEqual(
      Object.getOwnPropertySymbols(value).map(String),
      name === "createSchedule"
        ? [
            "Symbol(bizdays-toolkit.scheduleInfo)",
            "Symbol(bizdays-toolkit.scheduleValues)",
            "Symbol(bizdays-toolkit.parts)",
          ]
        : ["Symbol(bizdays-toolkit.parts)"],
      name,
    );
    assert.ok(!Object.keys(value).some((k) => k.includes("parts")), name);
    assert.equal(JSON.stringify(value), JSON.stringify({ ...value }), name);
    // The parts can be read only from the created object, not from an object copied with spread (the holder is
    // copied, but its owner differs)
    const copy = { ...value };
    assert.notEqual(partsOf(value), undefined, name);
    assert.ok(Object.getOwnPropertySymbols(copy).includes(PARTS), name);
    assert.equal(partsOf(copy), undefined, name);
  }
});

test("周期の規則を含む設定の限界: 提供元のない設定で、2 月 29 日の規則は 2004-02-29 からの 1,461 日の周期の規則と同じ日に当たるとして redundant と出て、取り除いても 1901〜2099 年の結果は変わらないが、その外（2104-02-29 など）では変わる（決定 31 番の限界。今の挙動の見張りで、望ましい挙動としてではない）", () => {
  const leapDay: RecurringRule = { dayOfMonth: 29, months: [2] };
  const everyFourYears: RecurringRule = { cycle: 1461, anchor: "2004-02-29", positions: [1] };
  const options: CalendarOptions = { closedRecurringRules: [leapDay, everyFourYears] };
  assert.deepEqual(brief(diagnoseCalendar(options)), [
    {
      severity: "info",
      code: "redundant",
      path: "closedRecurringRules[0]",
      relatedPath: "closedRecurringRules[1]",
    },
  ]);
  const before = createCalendar(options);
  const after = createCalendar({ closedRecurringRules: [everyFourYears] });
  const changed: string[] = [];
  for (let d = "1890-01-01"; d <= "2210-12-31"; d = addDays(d, 1)) {
    if (before.isBusinessDay(d) !== after.isBusinessDay(d)) changed.push(d);
  }
  assert.deepEqual(
    changed.filter((d) => d >= "1901-01-01" && d <= "2099-12-31"),
    [],
  );
  assert.ok(changed.includes("2104-02-29"));
  assert.ok(changed.includes("1896-02-29"));
});

test("スケジュールの値: 読むと例外になる値（ゲッター・プロキシ）は違う値とみなし、invalid-provider-data を出さない（0.32.8 までは出していた）", () => {
  // A getter that throws; the date and the weekday value are such values, so the diagnostics compare them
  const hostile = (): object => ({
    k: 1,
    get x(): number {
      throw new Error("boom");
    },
  });
  const proxy = (): object =>
    new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new TypeError("boom");
        },
      },
    );
  for (const make of [hostile, proxy]) {
    const options = {
      weekdayValues: Array.from({ length: 7 }, make),
      dates: [{ date: "2026-01-05", value: make() }],
    };
    // Creation accepts these options, so the diagnostics return no error
    assert.doesNotThrow(() => createSchedule(options as never));
    assert.deepEqual(
      diagnoseSchedule(options as never).map((d) => `${d.severity} ${d.code} ${d.path}`),
      [],
    );
  }
});
