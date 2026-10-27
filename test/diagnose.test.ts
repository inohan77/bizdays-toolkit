import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCalendar,
  createSchedule,
  type HolidayProvider,
  type HolidayOverlapPolicy,
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
  brief(diagnoseCalendar({ holidayProvider: jp, closedRecurringRules: rules, ...extra }));

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
  // 作成時の例外の code と同じ
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
    closeWeekdays: [0], // 打ち間違い
    timezone: "Asia/Tokyo", // 大文字・小文字の違い
    closedRecurringRules: [{ weekday: 1, onHoliday: "after-holiday" }], // 先頭部分
    color: "red", // 近いキーなし
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
  // 作成時は無視される（前方互換）
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
    recurring([
      { dayOfMonth: 30, months: [2] },
      { dayOfMonth: [30, 31], months: [2] },
    ]),
    [
      { severity: "warning", code: "never-matches", path: "closedRecurringRules[0]" },
      { severity: "warning", code: "never-matches", path: "closedRecurringRules[1]" },
    ],
  );
  // うるう年の 2 月 29 日・2 月の第 5 曜日はありうる
  assert.deepEqual(recurring([{ dayOfMonth: 29, months: [2] }]), []);
  assert.deepEqual(recurring([{ weekday: 0, nth: 5, months: [2] }]), []);
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
  // 臨時営業日・繰り返しの営業日・祝日は営業なら、営業日がある
  assert.deepEqual(codes({ closedWeekdays: all, openDates: ["2026-12-27"] }), []);
  assert.deepEqual(codes({ closedWeekdays: all, openRecurringRules: [{ dayOfMonth: 1 }] }), []);
  assert.deepEqual(codes({ holidayProvider: jp, closedWeekdays: all, holidayPolicy: "open" }), []);
  // 実際に営業日を探すと例外になる
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
        closedDates: ["2026-11-01", "2026-11-02"], // 日曜日・月曜日
      }),
    ),
    [
      { severity: "info", code: "redundant", path: "closedDates[0]" },
      { severity: "info", code: "redundant", path: "closedRecurringRules[0]" },
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
        holidayProvider: jp,
        weekdayValues: weekly,
        holidayPolicy: { sameAs: 0 },
        recurringRules: [
          { weekday: 1, value: { open: "10:00", close: "19:00" } }, // 曜日の値と同じ
          { weekday: 2, nth: 1, value: null }, // 第 1 火曜日は休み
          { weekday: 3, value: { close: "19:00", open: "10:00" } }, // キーの順番は問わない
          { weekday: 4, value: { open: "10:00", close: "20:00" } },
        ],
      }),
    ),
    [
      { severity: "info", code: "redundant", path: "recurringRules[0]" },
      { severity: "info", code: "redundant", path: "recurringRules[2]" },
    ],
  );
  // 普通のオブジェクトでない値は同じものかで比べる
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
  // 作成はでき、その年を使ったときに例外になる
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
    recurring(rules, extra)
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
  // 毎年の月日も同じ
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
  // 期間の中に当てはまる日がない
  assert.deepEqual(
    recurring([{ weekday: 3, nth: 5, effectiveFrom: "2027-04-01", effectiveTo: "2027-04-20" }]),
    [{ severity: "warning", code: "never-matches", path: "closedRecurringRules[0]" }],
  );
  assert.deepEqual(
    recurring([{ weekday: 3, nth: 5, effectiveFrom: "2027-03-01", effectiveTo: "2027-03-31" }]),
    [],
    "2027 年 3 月には第 5 水曜日（3/31）がある",
  );
  assert.deepEqual(
    recurring([
      { dayOfMonth: 29, months: [2], effectiveFrom: "2029-01-01", effectiveTo: "2031-12-31" },
    ]),
    [{ severity: "warning", code: "never-matches", path: "closedRecurringRules[0]" }],
    "期間にうるう年がない",
  );
  // 有効期間が提供元の対応年の外（対応年の外で例外になる設定では、その規則は使われない）
  assert.deepEqual(
    recurring([{ weekday: 1, effectiveTo: "1950-12-31" }], {
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
    recurring([{ weekday: 1, effectiveFrom: "2100-01-01" }], { outOfRangePolicy: "ignore" }),
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

test("redundant: 走査の範囲は、固定の範囲と規則の有効期間を合わせたもの", () => {
  // 提供元がない設定の固定範囲（2001〜2028 年）の外にある規則を、使われないと誤診しない
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
  // 期限のない側は、当てはまり方がそろう周期（28 年）の長さを調べる
  assert.deepEqual(
    brief(
      diagnoseCalendar({
        closedRecurringRules: [{ weekday: 3, nth: 5, effectiveTo: "1990-12-31" }],
      }),
    ),
    [],
  );
  assert.ok(
    /checked 1963-1990, 2001-2028/.test(
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
  // 周期のある規則の redundant は、28 年の固定範囲では確かめられない（隔週の位相は 28 年で反転する）ので 56 年を調べる
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
