import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCalendar,
  createSchedule,
  type HolidayProvider,
  type OnHolidayRule,
  type RecurringRule,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { diagnoseCalendar, diagnoseSchedule, type Diagnostic } from "../src/diagnose/index.ts";

/** 判定に使う項目だけにする（message は API に含まない） */
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

const recurring = (rules: RecurringRule[], extra: object = {}) =>
  brief(diagnoseCalendar({ holidays: jp, closedRecurring: rules, ...extra }));

test("問題のない設定は空の配列", () => {
  const options = {
    holidays: jp,
    closedWeekdays: [0] as const,
    closedAnnual: [{ from: "12-31", to: "01-03" }],
    closedDates: [{ from: "2027-08-12", to: "2027-08-16" }],
    openDates: ["2026-12-27" as const],
    closedRecurring: [{ weekday: 3, nth: 3 } as const],
  };
  assert.deepEqual(diagnoseCalendar(options), []);
  assert.deepEqual(diagnoseCalendar(), []);
  assert.deepEqual(diagnoseSchedule({ weekly: [0, 1, 1, 1, 1, 1, 0] }), []);
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
  // 作成時の例外の code と同じ
  assert.throws(() => createCalendar(options as object), { code: "invalid-weekday" });
  assert.deepEqual(brief(diagnoseCalendar(null as unknown as object)), [
    { severity: "error", code: "invalid-option", path: "" },
  ]);
  assert.deepEqual(brief(diagnoseSchedule({ weekly: [1, 2, 3] })), [
    { severity: "error", code: "invalid-option", path: "weekly" },
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
    closeWeekdays: [0], // 打ち間違い
    timezone: "Asia/Tokyo", // 大文字・小文字の違い
    closedRecurring: [{ weekday: 1, onHoliday: "after-holiday" }], // 先頭部分
    color: "red", // 近いキーなし
  });
  assert.deepEqual(
    list.map((d) => [d.code, d.path, d.severity]),
    [
      ["unknown-option", "closeWeekdays", "warning"],
      ["unknown-option", "timezone", "warning"],
      ["unknown-option", "color", "warning"],
      ["unknown-option", "closedRecurring[0].onHoliday", "warning"],
    ],
  );
  assert.match(list[0]!.message, /"closedWeekdays"/);
  assert.match(list[1]!.message, /"timeZone"/);
  assert.doesNotMatch(list[2]!.message, /did you mean/);
  assert.match(list[3]!.message, /"onHolidayRule"/);
  // 作成時は無視される（前方互換）
  assert.doesNotThrow(() => createCalendar({ closeWeekdays: [0] } as object));
});

test("shadowed: 個別の日付・毎年の月日（年をまたぐ期間）", () => {
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedDates: [{ from: "2026-12-01", to: "2026-12-31" }, "2026-12-24", "2027-01-05"],
        closedAnnual: [{ from: "12-29", to: "01-03" }, "01-01", { from: "12-30", to: "01-04" }],
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
        path: "closedAnnual[1]",
        relatedPath: "closedAnnual[0]",
      },
    ],
  );
});

test("shadowed: 臨時営業日に覆われた臨時休業日（同じ種類の個別の日付）", () => {
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
    ],
  );
});

test("shadowed: 繰り返しの規則（当てはまる日の包含で判定する）", () => {
  const shadowed = (rules: RecurringRule[]) =>
    recurring(rules)
      .filter((d) => d.code === "shadowed")
      .map((d) => `${d.path}<${d.relatedPath}`);
  assert.deepEqual(shadowed([{ weekday: 3 }, { weekday: 3, nth: 3, months: [1, 2] }]), [
    "closedRecurring[1]<closedRecurring[0]",
  ]);
  assert.deepEqual(
    shadowed([{ day: [1, 2, 3, 4, 5, 6, 7] }, { weekday: 2, nth: 1 }]),
    ["closedRecurring[1]<closedRecurring[0]"],
    "1〜7 日は、第 1 の曜日をすべて含む",
  );
  assert.deepEqual(
    shadowed([
      { weekday: 5, nth: [4, 5] },
      { weekday: 5, nth: -1 },
    ]),
    ["closedRecurring[1]<closedRecurring[0]"],
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
  const shadowedBy = (earlier: OnHolidayRule, later: OnHolidayRule) =>
    recurring([
      { weekday: 1, onHolidayRule: earlier },
      { weekday: 1, nth: 2, onHolidayRule: later },
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
        openRecurring: [{ weekday: 6 }],
        closedRecurring: [{ weekday: 6, nth: 2 }],
      }),
    ),
    [
      {
        severity: "warning",
        code: "shadowed",
        path: "closedRecurring[0]",
        relatedPath: "openRecurring[0]",
      },
    ],
  );
});

test("never-matches: 当てはまる日がない繰り返しの規則", () => {
  assert.deepEqual(
    recurring([
      { day: 30, months: [2] },
      { day: [30, 31], months: [2] },
    ]),
    [
      { severity: "warning", code: "never-matches", path: "closedRecurring[0]" },
      { severity: "warning", code: "never-matches", path: "closedRecurring[1]" },
    ],
  );
  // うるう年の 2 月 29 日・2 月の第 5 曜日はありうる
  assert.deepEqual(recurring([{ day: 29, months: [2] }]), []);
  assert.deepEqual(recurring([{ weekday: 0, nth: 5, months: [2] }]), []);
});

test("out-of-range: 個別の日付が祝日の提供元の対応年の外", () => {
  assert.deepEqual(brief(diagnoseCalendar({ holidays: jp, closedDates: ["2100-01-05"] })), [
    {
      severity: "warning",
      code: "out-of-range",
      path: "closedDates[0]",
      relatedPath: "holidays",
    },
  ]);
  const ignore = diagnoseCalendar({
    holidays: jp,
    outOfRange: "ignore",
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    openDates: [{ from: "2099-12-30", to: "2100-01-02" }],
  });
  assert.deepEqual(
    ignore.map((d) => [d.code, d.path]),
    [["out-of-range", "openDates[0]"]],
  );
  assert.notEqual(
    ignore[0]!.message,
    diagnoseCalendar({ holidays: jp, closedDates: ["2100-01-05"] })[0]!.message,
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
    brief(diagnoseCalendar({ holidays: [other, jp], closedDates: ["2150-01-05"] })).map(
      (d) => d.relatedPath,
    ),
    ["holidays[1]"],
  );
  assert.deepEqual(
    diagnoseCalendar({ closedDates: ["2100-01-05"] }),
    [],
    "提供元がなければ範囲もない",
  );
});

test("no-business-day: 営業日が 1 日もない設定", () => {
  const all = [0, 1, 2, 3, 4, 5, 6] as const;
  const codes = (options: object) => diagnoseCalendar(options).map((d) => d.code);
  assert.deepEqual(codes({ closedWeekdays: all }), ["no-business-day"]);
  assert.deepEqual(
    codes({ holidays: jp, closedWeekdays: [0, 1, 2, 3, 4, 5], closedRecurring: [{ weekday: 6 }] }),
    ["no-business-day"],
  );
  assert.deepEqual(codes({ closedAnnual: [{ from: "01-01", to: "12-31" }] }), ["no-business-day"]);
  // 臨時営業日・繰り返しの営業日・祝日は営業なら、営業日がある
  assert.deepEqual(codes({ closedWeekdays: all, openDates: ["2026-12-27"] }), []);
  assert.deepEqual(codes({ closedWeekdays: all, openRecurring: [{ day: 1 }] }), []);
  assert.deepEqual(codes({ holidays: jp, closedWeekdays: all, holidayPolicy: "open" }), []);
  // 実際に営業日を探すと例外になる
  assert.throws(() => createCalendar({ closedWeekdays: all }).nextBusinessDay("2026-10-16"), {
    code: "no-business-day",
  });
});

test("redundant: 取り除いても結果が変わらない規則（info）", () => {
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        holidays: jp,
        closedWeekdays: [0, 6],
        closedRecurring: [{ weekday: 0 }, { weekday: 1, nth: 2 }],
        closedDates: ["2026-11-01", "2026-11-02"], // 日曜日・月曜日
      }),
    ),
    [
      { severity: "info", code: "redundant", path: "closedDates[0]" },
      { severity: "info", code: "redundant", path: "closedRecurring[0]" },
    ],
  );
  // 複数の先の規則を合わせると覆われる個別の日付
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

test("redundant: スケジュールの値は配列・普通のオブジェクトなら中身で比べる", () => {
  const open = { open: "10:00", close: "19:00" };
  const weekly = [null, open, open, open, open, open, null] as const;
  assert.deepEqual(
    brief(
      diagnoseSchedule({
        holidays: jp,
        weekly,
        holiday: { sameAs: 0 },
        recurring: [
          { weekday: 1, value: { open: "10:00", close: "19:00" } }, // 曜日の値と同じ
          { weekday: 2, nth: 1, value: null }, // 第 1 火曜日は休み
          { weekday: 3, value: { close: "19:00", open: "10:00" } }, // キーの順番は問わない
          { weekday: 4, value: { open: "10:00", close: "20:00" } },
        ],
      }),
    ),
    [
      { severity: "info", code: "redundant", path: "recurring[0]" },
      { severity: "info", code: "redundant", path: "recurring[2]" },
    ],
  );
  // 普通のオブジェクトでない値は同じものかで比べる
  const day = new Date(0);
  assert.deepEqual(
    diagnoseSchedule({
      weekly: [day, day, day, day, day, day, day],
      recurring: [{ day: 1, value: new Date(0) }],
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
  const list = diagnoseCalendar({ holidays: broken });
  assert.deepEqual(brief(list), [
    { severity: "error", code: "invalid-provider-data", path: "holidays" },
  ]);
  assert.match(list[0]!.message, /2000/);
  // 作成はでき、その年を使ったときに例外になる
  const calendar = createCalendar({ holidays: broken });
  assert.equal(calendar.isBusinessDay("2026-10-16"), true);
  assert.throws(() => calendar.isBusinessDay("2000-01-04"), { code: "invalid-provider-data" });

  const throwing: HolidayProvider = {
    ...jp,
    holidaysInYear: () => {
      throw new Error("boom");
    },
  };
  assert.deepEqual(
    diagnoseSchedule({ holidays: throwing, weekly: [0, 0, 0, 0, 0, 0, 0] }).map((d) => d.code),
    ["invalid-provider-data"],
    "提供元が例外を投げても、診断は例外を投げない",
  );
});

test("診断した設定でも、作成の結果は変わらない", () => {
  const options = {
    holidays: jp,
    closedWeekdays: [0] as const,
    closedRecurring: [{ weekday: 0 } as const],
  };
  diagnoseCalendar(options);
  assert.equal(createCalendar(options).isBusinessDay("2026-10-18"), false);
  assert.equal(createSchedule({ weekly: [0, 1, 1, 1, 1, 1, 0] }).valueOn("2026-10-18"), 0);
});
