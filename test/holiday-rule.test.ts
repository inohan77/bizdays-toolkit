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
  // 2027 年 4 月から祝日も営業（それまでは休業）
  const shop = createCalendar({
    holidays: jp,
    closedWeekdays: [0],
    openRecurring: [{ holiday: true, effectiveFrom: "2027-04-01", name: "祝日営業" }],
  });
  assert.equal(shop.isBusinessDay("2026-11-23"), false, "期間の前は祝日休業");
  assert.deepEqual(shop.dayInfo("2027-05-03"), {
    date: "2027-05-03",
    weekday: 1,
    businessDay: true,
    reason: "open-recurring",
    name: "祝日営業",
    holiday: jp.holidaysInYear(2027).find((h) => h.date === "2027-05-03"),
    rulePath: "openRecurring[0]",
  });
  assert.equal(shop.isBusinessDay("2027-05-02"), false, "日曜定休は変わらない");
  // 切り替え日をまたぐ計算も 1 つのカレンダーで正しい（2027-04-29 の祝日は営業）
  assert.equal(shop.addBusinessDays("2027-04-28", 2), "2027-04-30");

  // 振替休日と国民の休日は診療する
  const clinic = createCalendar({
    holidays: jp,
    closedWeekdays: [0],
    openRecurring: [
      { holiday: true, kinds: ["substitute", "citizens"], name: "振替休日・国民の休日は診療" },
    ],
  });
  assert.equal(clinic.dayInfo("2026-09-22").reason, "open-recurring", "国民の休日");
  assert.equal(clinic.dayInfo("2026-05-06").reason, "open-recurring", "振替休日");
  assert.equal(clinic.dayInfo("2026-05-05").reason, "holiday", "国民の祝日は休診");
  assert.equal(
    clinic.dayInfo("2026-05-06").holiday?.kind,
    "substitute",
    "holiday は祝日のまま付く",
  );

  // 12 月の祝日だけ休業（祝日は営業）
  const december = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [{ holiday: true, months: [12] }],
  });
  assert.equal(december.isBusinessDay("2026-11-23"), true);
  // 12 月に祝日のあった年（天皇誕生日 12-23。2018 年まで）
  assert.equal(december.isBusinessDay("2018-12-23"), false);
  assert.equal(december.isBusinessDay("2018-12-24"), false, "振替休日も 12 月の祝日");
});

test("祝日の規則: 判定は「祝日の上」の段階で、holidayPolicy より先。同じ段階は配列順", () => {
  // holidayPolicy: "ignore" でも、祝日を対象にする規則は書いたとおりに効く
  const ignore = createCalendar({
    holidays: jp,
    holidayPolicy: "ignore",
    closedRecurring: [{ holiday: true, kinds: ["national"] }],
  });
  assert.equal(ignore.dayInfo("2026-11-23").reason, "closed-recurring");
  assert.equal(ignore.dayInfo("2026-09-22").reason, "regular", "国民の休日は対象外で、祝日は無視");
  // "over-holiday" の曜日の規則と同じ段階。配列で先に書いたものが優先
  const first = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedRecurring: [
      { weekday: 1, onHolidayRule: "over-holiday", name: "月曜休館" },
      { holiday: true, name: "祝日休館" },
    ],
  });
  assert.equal(first.dayInfo("2026-11-23").name, "月曜休館");
  assert.equal(first.dayInfo("2026-11-03").name, "祝日休館");
  // openRecurring は closedRecurring より優先
  const open = createCalendar({
    holidays: jp,
    openRecurring: [{ holiday: true, kinds: ["substitute"] }],
    closedRecurring: [{ holiday: true }],
  });
  assert.equal(open.isBusinessDay("2026-05-06"), true);
  assert.equal(open.isBusinessDay("2026-05-05"), false);
  // 個別の日付・毎年の休業日のほうが先
  const annual = createCalendar({
    holidays: jp,
    closedAnnual: ["05-05"],
    openRecurring: [{ holiday: true }],
  });
  assert.equal(annual.dayInfo("2026-05-05").reason, "closed-annual");
  // 祝日でない日には当てはまらない
  assert.equal(open.dayInfo("2026-05-07").reason, "regular");
});

test("祝日の規則: スケジュールの値（営業時間の改定を 1 つのスケジュールで表す）", () => {
  type Hours = string;
  const hours = createSchedule<Hours>({
    holidays: jp,
    weekly: ["10-18", "10-20", "10-20", "10-20", "10-20", "10-20", "10-19"],
    holiday: { sameAs: 0 },
    recurring: [
      { holiday: true, months: [5], value: "9-20", name: "GW 営業" },
      // 2027 年 4 月から日曜・祝日は短縮
      { weekday: 0, value: "10-17", effectiveFrom: "2027-04-01" },
      { holiday: true, value: "10-17", effectiveFrom: "2027-04-01" },
    ],
  });
  assert.equal(hours.valueOn("2026-05-05"), "9-20");
  assert.equal(hours.valueOn("2026-11-23"), "10-18", "祝日は日曜と同じ");
  assert.equal(hours.valueOn("2027-11-23"), "10-17", "改定後の祝日");
  assert.equal(hours.valueOn("2027-11-21"), "10-17", "改定後の日曜");
  assert.deepEqual(
    hours.dayInfo("2027-05-05").rulePath,
    "recurring[0]",
    "5 月の祝日は先に書いた GW 営業",
  );
});

test("祝日の規則: 入力の誤り", () => {
  const cases: [unknown, RegExp][] = [
    [
      { holiday: true, onHolidayRule: "over-holiday" },
      /closedRecurring\[0\]\.onHolidayRule: cannot be used with "holiday"/,
    ],
    [{ holiday: false }, /closedRecurring\[0\]\.holiday: must be true/],
    [{ holiday: true, kinds: [] }, /closedRecurring\[0\]\.kinds: must be a non-empty string/],
    [{ holiday: true, kinds: ["national", 1] }, /closedRecurring\[0\]\.kinds/],
    [{ holiday: true, kinds: "national" }, /closedRecurring\[0\]\.kinds/],
    [
      { weekday: 1, kinds: ["national"] },
      /closedRecurring\[0\]\.kinds: "kinds" can be used only with "holiday"/,
    ],
    [
      { holiday: true, weekday: 1 },
      /must have exactly one of "weekday", "day", "dayAfterHoliday", "dayBeforeHoliday" or "holiday"/,
    ],
    [{ holiday: true, dayAfterHoliday: true }, /must have exactly one of/],
    [{ holiday: true, nth: 1 }, /closedRecurring\[0\]\.nth/],
    [{ holiday: true, interval: 2, anchor: "2026-01-07" }, /closedRecurring\[0\]\.interval/],
  ];
  for (const [entry, message] of cases) {
    assert.throws(
      () => createCalendar({ holidays: jp, closedRecurring: [entry as RecurringRule] }),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-option" && message.test(e.message),
      JSON.stringify(entry),
    );
  }
  // 種別は開いた型なので、提供元にない種別でも作成はできる（診断で never-matches）
  const cal = createCalendar({ holidays: jp, closedRecurring: [{ holiday: true, kinds: ["x"] }] });
  assert.equal(cal.isBusinessDay("2026-11-24"), true);
});

test("祝日の規則: 診断（never-matches・shadowed・redundant）", () => {
  assert.deepEqual(brief({ closedRecurring: [{ holiday: true }] }), [
    ["warning", "never-matches", "closedRecurring[0]", ""],
  ]);
  assert.deepEqual(
    brief({
      holidays: jp,
      holidayPolicy: "open",
      closedRecurring: [
        { holiday: true, kinds: ["citizens"] },
        { holiday: true, kinds: ["citizens"], months: [9] },
        { holiday: true, kinds: ["nonexistent"] },
        { holiday: true, months: [6], effectiveFrom: "2000-01-01" },
        { holiday: true },
      ],
    }),
    [
      ["warning", "shadowed", "closedRecurring[1]", "closedRecurring[0]"],
      ["warning", "never-matches", "closedRecurring[2]", ""],
      ["warning", "never-matches", "closedRecurring[3]", ""],
      ["info", "redundant", "closedRecurring[0]", ""],
    ],
    "種別・月で覆われる。提供元にない種別、2000 年以降の 6 月に祝日はない。後の広い規則は覆われず、先の狭い規則は取り除いても変わらない",
  );
  assert.deepEqual(
    brief({
      holidays: jp,
      holidayPolicy: "open",
      closedRecurring: [{ holiday: true, months: [6] }],
    }),
    [],
    "1993-06-09（皇太子徳仁親王の結婚の儀）が対応年にある",
  );
  // holidayPolicy と同じ向きの規則は redundant
  assert.deepEqual(brief({ holidays: jp, closedRecurring: [{ holiday: true }] }), [
    ["info", "redundant", "closedRecurring[0]", ""],
  ]);
  // 曜日の規則とは shadowed で比べない
  assert.deepEqual(
    brief({
      holidays: jp,
      holidayPolicy: "open",
      closedRecurring: [
        { weekday: 1, onHolidayRule: "over-holiday" },
        { holiday: true, kinds: ["substitute"] },
      ],
    }),
    [],
  );
  assert.deepEqual(
    diagnoseSchedule({
      holidays: jp,
      weekly: [1, 1, 1, 1, 1, 1, 1],
      holiday: { value: 2 },
      recurring: [{ holiday: true, value: 2 }],
    }).map((d) => d.code),
    ["redundant"],
    "祝日の規則の値が祝日の既定と同じなら redundant",
  );
});

test("rulePath: 値を決めた規則の位置を、診断の path と同じ形で返す", () => {
  const museum = createCalendar({
    holidays: jp,
    holidayPolicy: "open",
    closedWeekdays: [2],
    closedRecurring: [{ weekday: 1, name: "休館日", onHolidayRule: "after-holiday" }],
    closedAnnual: ["12-31", { from: "01-01", to: "01-03", name: "休館日" }],
    closedDates: ["2026-10-21"],
    openDates: ["2027-01-03"],
  });
  assert.equal(museum.dayInfo("2026-10-13").rulePath, "closedRecurring[0]", "振替先も規則の位置");
  assert.equal(museum.dayInfo("2026-10-19").rulePath, "closedRecurring[0]");
  assert.equal(museum.dayInfo("2026-12-31").rulePath, "closedAnnual[0]");
  assert.equal(
    museum.dayInfo("2027-01-02").rulePath,
    "closedAnnual[1]",
    "同じ name でも位置で区別できる",
  );
  assert.equal(museum.dayInfo("2026-10-21").rulePath, "closedDates[0]");
  assert.equal(museum.dayInfo("2027-01-03").rulePath, "openDates[0]");
  assert.equal(museum.dayInfo("2026-10-12").rulePath, undefined, "祝日で決まった日には付かない");
  assert.equal(museum.dayInfo("2026-10-20").rulePath, undefined, "定休日の曜日には付かない");
  assert.equal(museum.dayInfo("2026-10-14").rulePath, undefined, "通常の営業日には付かない");
  assert.equal("rulePath" in museum.dayInfo("2026-10-14"), false);

  const hours = createSchedule({
    holidays: jp,
    weekly: [0, 1, 1, 1, 1, 1, 1],
    holiday: { sameAs: 0 },
    dates: [{ date: "2026-12-31", value: 2 }],
    annual: [{ date: "01-02", value: 0 }],
  });
  assert.equal(hours.dayInfo("2026-12-31").rulePath, "dates[0]");
  assert.equal(hours.dayInfo("2027-01-02").rulePath, "annual[0]");
  assert.equal(hours.dayInfo("2027-01-01").rulePath, undefined, "祝日");
  assert.equal(hours.dayInfo("2027-01-04").rulePath, undefined, "曜日");

  // 合成は決めたカレンダーの rulePath を引き継ぐ（位置は合成前のカレンダーの設定の中の位置）
  const combined = combineCalendars(
    [museum, createCalendar({ holidays: jp, closedWeekdays: [3] })],
    {
      businessDay: "all",
    },
  );
  assert.equal(combined.dayInfo("2026-12-31").rulePath, "closedAnnual[0]");
  assert.equal(combined.dayInfo("2026-12-31").decidedBy, 0);
  assert.equal(combined.dayInfo("2026-10-14").rulePath, undefined, "1 番の定休日の曜日");
  assert.equal(combined.dayInfo("2026-10-14").decidedBy, 1);
});
