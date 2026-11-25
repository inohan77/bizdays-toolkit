import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createSchedule,
  isBizdaysError,
  type RecurringRule,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";

const brief = (options: object) =>
  diagnoseCalendar(options).map((d) => [d.severity, d.code, d.path, d.relatedPath ?? ""]);

test("祝日の規則: 祝日の既定の扱いの例外を、期間・月・種別で書ける", () => {
  // Open on holidays from April 2027 (closed until then)
  const shop = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0],
    openRecurringRules: [{ holiday: true, effectiveFrom: "2027-04-01", name: "祝日営業" }],
  });
  assert.equal(shop.isBusinessDay("2026-11-23"), false, "期間の前は祝日休業");
  assert.deepEqual(shop.dayInfoOn("2027-05-03"), {
    date: "2027-05-03",
    weekday: 1,
    open: true,
    businessDay: true,
    reason: "open-recurring",
    name: "祝日営業",
    holiday: jp.holidaysInYear(2027).find((h) => h.date === "2027-05-03"),
    optionPath: "openRecurringRules[0]",
    rulePath: "openRecurringRules[0]",
  });
  assert.equal(shop.isBusinessDay("2027-05-02"), false, "日曜定休は変わらない");
  // A calculation across the switch date is right with one calendar (the holiday 2027-04-29 is open)
  assert.equal(shop.addBusinessDays("2027-04-28", 2), "2027-04-30");

  // Consultations on substitute holidays and citizens' holidays
  const clinic = createCalendar({
    holidayProvider: jp,
    closedWeekdays: [0],
    openRecurringRules: [
      { holiday: true, kinds: ["substitute", "citizens"], name: "振替休日・国民の休日は診療" },
    ],
  });
  assert.equal(clinic.dayInfoOn("2026-09-22").reason, "open-recurring", "国民の休日");
  assert.equal(clinic.dayInfoOn("2026-05-06").reason, "open-recurring", "振替休日");
  assert.equal(clinic.dayInfoOn("2026-05-05").reason, "holiday", "国民の祝日は休診");
  assert.equal(
    clinic.dayInfoOn("2026-05-06").holiday?.kind,
    "substitute",
    "holiday は祝日のまま付く",
  );

  // Closed only on holidays in December (open on holidays)
  const december = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedRecurringRules: [{ holiday: true, months: [12] }],
  });
  assert.equal(december.isBusinessDay("2026-11-23"), true);
  // A year with a holiday in December (the Emperor's Birthday, 12-23, until 2018)
  assert.equal(december.isBusinessDay("2018-12-23"), false);
  assert.equal(december.isBusinessDay("2018-12-24"), false, "振替休日も 12 月の祝日");
});

test("祝日の規則: 判定は「祝日の上」の段階で、holidayPolicy より先。同じ段階は配列順", () => {
  // With holidayPolicy: "ignore" too, a rule aimed at holidays works as written
  const ignore = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "ignore",
    closedRecurringRules: [{ holiday: true, kinds: ["regular"] }],
  });
  assert.equal(ignore.dayInfoOn("2026-11-23").reason, "closed-recurring");
  assert.equal(
    ignore.dayInfoOn("2026-09-22").reason,
    "default",
    "国民の休日は対象外で、祝日は無視",
  );
  // The same stage as "over-holiday" weekday rules. The one written first in the array wins
  const first = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedRecurringRules: [
      { weekday: 1, holidayOverlapPolicy: "over-holiday", name: "月曜休館" },
      { holiday: true, name: "祝日休館" },
    ],
  });
  assert.equal(first.dayInfoOn("2026-11-23").name, "月曜休館");
  assert.equal(first.dayInfoOn("2026-11-03").name, "祝日休館");
  // openRecurringRules take priority over closedRecurringRules
  const open = createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ holiday: true, kinds: ["substitute"] }],
    closedRecurringRules: [{ holiday: true }],
  });
  assert.equal(open.isBusinessDay("2026-05-06"), true);
  assert.equal(open.isBusinessDay("2026-05-05"), false);
  // Specific dates and annual closed days come first
  const annual = createCalendar({
    holidayProvider: jp,
    closedAnnualDates: ["05-05"],
    openRecurringRules: [{ holiday: true }],
  });
  assert.equal(annual.dayInfoOn("2026-05-05").reason, "closed-annual");
  // Does not match a day that is not a holiday
  assert.equal(open.dayInfoOn("2026-05-07").reason, "default");
});

test("祝日の規則: スケジュールの値（営業時間の改定を 1 つのスケジュールで表す）", () => {
  type Hours = string;
  const hours = createSchedule<Hours>({
    holidayProvider: jp,
    weekdayValues: ["10-18", "10-20", "10-20", "10-20", "10-20", "10-20", "10-19"],
    holidayPolicy: { sameAs: 0 },
    recurringRules: [
      { holiday: true, months: [5], value: "9-20", name: "GW 営業" },
      // Shorter hours on Sundays and holidays from April 2027
      { weekday: 0, value: "10-17", effectiveFrom: "2027-04-01" },
      { holiday: true, value: "10-17", effectiveFrom: "2027-04-01" },
    ],
  });
  assert.equal(hours.valueOn("2026-05-05"), "9-20");
  assert.equal(hours.valueOn("2026-11-23"), "10-18", "祝日は日曜と同じ");
  assert.equal(hours.valueOn("2027-11-23"), "10-17", "改定後の祝日");
  assert.equal(hours.valueOn("2027-11-21"), "10-17", "改定後の日曜");
  assert.deepEqual(
    hours.dayInfoOn("2027-05-05").optionPath,
    "recurringRules[0]",
    "5 月の祝日は先に書いた GW 営業",
  );
});

test("祝日の規則: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { holiday: true, holidayOverlapPolicy: "over-holiday" },
      /closedRecurringRules\[0\]\.holidayOverlapPolicy: cannot be used with "holiday"/,
    ],
    [{ holiday: false }, /closedRecurringRules\[0\]\.holiday: must be true/],
    [{ holiday: true, kinds: [] }, /closedRecurringRules\[0\]\.kinds: must be a non-empty string/],
    [{ holiday: true, kinds: ["regular", 1] }, /closedRecurringRules\[0\]\.kinds/],
    [{ holiday: true, kinds: "regular" }, /closedRecurringRules\[0\]\.kinds/],
    [
      { weekday: 1, kinds: ["regular"] },
      /closedRecurringRules\[0\]\.kinds: "kinds" can be used only with "holiday"/,
    ],
    [
      { holiday: true, weekday: 1 },
      /must have exactly one of "weekday", "dayOfMonth", "businessDayOfMonth", "businessDayOfWeek", "dayAfterHoliday", "dayBeforeHoliday", "holiday" or "cycle"/,
    ],
    [{ holiday: true, dayAfterHoliday: true }, /must have exactly one of/],
    [{ holiday: true, nth: 1 }, /closedRecurringRules\[0\]\.nth/],
    [{ holiday: true, interval: 2, anchor: "2026-01-07" }, /closedRecurringRules\[0\]\.interval/],
  ];
  for (const [entry, message] of cases) {
    assert.throws(
      () => createCalendar({ holidayProvider: jp, closedRecurringRules: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-option" && message.test(e.message),
      JSON.stringify(entry),
    );
  }
  // kinds is an open type, so creation works with a kind the provider lacks (never-matches in the diagnostics)
  const cal = createCalendar({
    holidayProvider: jp,
    closedRecurringRules: [{ holiday: true, kinds: ["x"] }],
  });
  assert.equal(cal.isBusinessDay("2026-11-24"), true);
});

test("祝日の規則: 診断（never-matches・shadowed・redundant）", () => {
  assert.deepEqual(brief({ closedRecurringRules: [{ holiday: true }] }), [
    ["warning", "never-matches", "closedRecurringRules[0]", ""],
  ]);
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      holidayPolicy: "open",
      closedRecurringRules: [
        { holiday: true, kinds: ["citizens"] },
        { holiday: true, kinds: ["citizens"], months: [9] },
        { holiday: true, kinds: ["nonexistent"] },
        { holiday: true, months: [6], effectiveFrom: "2000-01-01" },
        { holiday: true },
      ],
    }),
    [
      ["warning", "shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"],
      ["warning", "never-matches", "closedRecurringRules[2]", ""],
      ["warning", "never-matches", "closedRecurringRules[3]", ""],
      ["info", "redundant", "closedRecurringRules[0]", "closedRecurringRules[4]"],
    ],
    "種別・月で覆われる。提供元にない種別、2000 年以降の 6 月に祝日はない。後の広い規則は覆われず、先の狭い規則は取り除いても変わらない",
  );
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      holidayPolicy: "open",
      closedRecurringRules: [{ holiday: true, months: [6] }],
    }),
    [],
    "1993-06-09（皇太子徳仁親王の結婚の儀）が対応年にある",
  );
  // A rule in the same direction as holidayPolicy is redundant
  assert.deepEqual(brief({ holidayProvider: jp, closedRecurringRules: [{ holiday: true }] }), [
    ["info", "redundant", "closedRecurringRules[0]", ""],
  ]);
  // Not compared with weekday rules for shadowed
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      holidayPolicy: "open",
      closedRecurringRules: [
        { weekday: 1, holidayOverlapPolicy: "over-holiday" },
        { holiday: true, kinds: ["substitute"] },
      ],
    }),
    [],
  );
  assert.deepEqual(
    diagnoseSchedule({
      holidayProvider: jp,
      weekdayValues: [1, 1, 1, 1, 1, 1, 1],
      holidayPolicy: { value: 2 },
      recurringRules: [{ holiday: true, value: 2 }],
    }).map((d) => d.code),
    ["redundant"],
    "祝日の規則の値が祝日の既定と同じなら redundant",
  );
});

test("optionPath: 値を決めた規則の位置を、診断の path と同じ形で返す", () => {
  const museum = createCalendar({
    holidayProvider: jp,
    holidayPolicy: "open",
    closedWeekdays: [2],
    closedRecurringRules: [{ weekday: 1, name: "休館日", holidayOverlapPolicy: "after-holiday" }],
    closedAnnualDates: ["12-31", { from: "01-01", to: "01-03", name: "休館日" }],
    closedDates: ["2026-10-21"],
    openDates: ["2027-01-03"],
  });
  assert.equal(
    museum.dayInfoOn("2026-10-13").optionPath,
    "closedRecurringRules[0]",
    "振替先も規則の位置",
  );
  assert.equal(museum.dayInfoOn("2026-10-19").optionPath, "closedRecurringRules[0]");
  assert.equal(museum.dayInfoOn("2026-12-31").optionPath, "closedAnnualDates[0]");
  assert.equal(
    museum.dayInfoOn("2027-01-02").optionPath,
    "closedAnnualDates[1]",
    "同じ name でも位置で区別できる",
  );
  assert.equal(museum.dayInfoOn("2026-10-21").optionPath, "closedDates[0]");
  assert.equal(museum.dayInfoOn("2027-01-03").optionPath, "openDates[0]");
  assert.equal(
    museum.dayInfoOn("2026-10-12").optionPath,
    undefined,
    "祝日で決まった日には付かない",
  );
  assert.equal(museum.dayInfoOn("2026-10-20").optionPath, undefined, "定休日の曜日には付かない");
  assert.equal(museum.dayInfoOn("2026-10-14").optionPath, undefined, "通常の営業日には付かない");
  assert.equal("optionPath" in museum.dayInfoOn("2026-10-14"), false);

  const hours = createSchedule({
    holidayProvider: jp,
    weekdayValues: [0, 1, 1, 1, 1, 1, 1],
    holidayPolicy: { sameAs: 0 },
    dates: [{ date: "2026-12-31", value: 2 }],
    annualDates: [{ date: "01-02", value: 0 }],
  });
  assert.equal(hours.dayInfoOn("2026-12-31").optionPath, "dates[0]");
  assert.equal(hours.dayInfoOn("2027-01-02").optionPath, "annualDates[0]");
  assert.equal(hours.dayInfoOn("2027-01-01").optionPath, undefined, "祝日");
  assert.equal(hours.dayInfoOn("2027-01-04").optionPath, undefined, "曜日");

  // A combination inherits optionPath of the deciding calendar (the position within the options of the calendar
  // before combining)
  const combined = combineCalendars(
    [museum, createCalendar({ holidayProvider: jp, closedWeekdays: [3] })],
    {
      open: "all",
    },
  );
  assert.equal(combined.dayInfoOn("2026-12-31").optionPath, "closedAnnualDates[0]");
  assert.equal(combined.dayInfoOn("2026-12-31").decidedBy, 0);
  assert.equal(combined.dayInfoOn("2026-10-14").optionPath, undefined, "1 番の定休日の曜日");
  assert.equal(combined.dayInfoOn("2026-10-14").decidedBy, 1);
});
