import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCalendar,
  createSchedule,
  type CalendarOptions,
  type HolidayProvider,
  type HolidayOverlapPolicy,
  type RecurringRule,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { SHORT_PROVIDER } from "./support/provider.ts";
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

// 既定は短い提供元（2025〜2027 年）。shadowed などは規則の形で決まり、祝日の年に依存しないので、日本の全範囲（1955〜2099 年）を
// 走査しない。日本の対応年に依存する確かめは、extra で holidayProvider: jp を明示する
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
        closedWeekdays: [0, 6], // 土日を開く臨時営業日にする（使われる）
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
  // 営業日の規則・臨時営業日は、休業日を開くためにある。定休日がなければ、覆われた休業日を取り除いた後は営業日を開くだけで
  // 結果を変えないので、両方とも取り除ける（逐次除去。31 番）
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
        // 土曜を定休日にして、営業日の規則が使われるようにする（定休日でなければ、休業日の規則を取り除いた後に
        // 営業日の規則も redundant になる。31 番）
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
  // うるう年の 2 月 29 日・2 月の第 5 曜日はありうる
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

test("redundant: 出た規則はまとめて取り除ける（逐次除去）。relatedPath は代わりに決める規則で、1 つに定まるときだけ付く", () => {
  // 同じ曜日の under・over・after の 3 つの規則: [0] と [1] はそれぞれ単独では取り除けるが、両方を外すと祝日の月曜が
  // 変わる。逐次除去では [0] だけが出る（[0] を外した設定では [1] が祝日の月曜を決める）
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
  // 同じ規則を 2 つ書くと、後が shadowed で、前は出ない（shadowed の規則を先に取り除く）
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
  // 定休日の曜日が代わりに決める日は、規則ではないので relatedPath を付けない
  assert.deepEqual(
    brief(diagnoseCalendar({ closedWeekdays: [0], closedRecurringRules: [{ weekday: 0 }] })),
    [{ severity: "info", code: "redundant", path: "closedRecurringRules[0]" }],
  );
  // 毎年の元日を、毎月 1 日の規則が代わりに決める
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
  // 有効期間が提供元の対応年の外（対応年の外で例外になる設定では、その規則は使われない）
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

test("第 n 営業日の規則があると、数え方を変える個別の日付・毎年の月日は redundant にしない", () => {
  const brief = (options: Parameters<typeof diagnoseCalendar>[0]) =>
    diagnoseCalendar(options)
      .filter((d) => d.code === "redundant" || d.code === "shadowed")
      .map((d) => [d.code, d.path]);
  // 個別の日付・毎年の月日を取り除くと、第 n 営業日がずれて同じ月・週の別の日が変わる（5 月 2 日・5 日など）
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
  // 開く規則の第 n 営業日も、同じく数え方を使う
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
// 期限が片側だけの有効期間と、100 で割り切れて 400 で割り切れない年（1900 年・2100 年など）
// ------------------------------------------------------------

/** うるう年か（ライブラリを使わない素朴な定義） */
const leapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** 曜日（0 = 日曜日。ライブラリも Date も使わない素朴な定義。坂本智彦の方法） */
const weekdayByArithmetic = (y: number, m: number, d: number): number => {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  return (
    (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1]! + d) % 7
  );
};
const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** 2 月だけに当てはまる規則の形（当てはまる年が、年の種類で決まるもの） */
type FebruaryShape =
  | { readonly weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; readonly nth: 5 }
  | { readonly dayOfMonth: 29 | 30 };
/** 期限が片側だけの有効期間 */
type OneSided = { readonly effectiveFrom: string } | { readonly effectiveTo: string };

/**
 * 素朴な定義: 2 月の規則の形が、期限が片側だけの有効期間の中で当てはまる日（期限に近い順）。ライブラリを使わずに、
 * 期限から 400 年ぶんの 2 月の日を 1 日ずつ調べる（暦は 400 年 = 146,097 日 = 20,871 週で一巡するので、400 年で
 * 当てはまらなければ、その先でも当てはまらない）。暦日の範囲（1000〜9999 年）の外は調べない
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
 * 期限の日。期限から 28 年の範囲が 1900 年・2100 年にかかるもの（前の 4 つ）と、かからないもの（対照）、暦日の範囲の端
 * （1000 年も 100 で割り切れて 400 で割り切れない年）
 */
const ONE_SIDED: readonly OneSided[] = [
  { effectiveFrom: "2073-01-01" },
  { effectiveFrom: "2096-03-01" },
  { effectiveTo: "1927-12-31" },
  { effectiveTo: "1903-02-28" },
  { effectiveFrom: "2101-01-01" },
  { effectiveTo: "1899-12-31" },
  { effectiveTo: "1020-12-31" },
  { effectiveFrom: "9975-01-01" },
];

interface OneSidedCase {
  readonly label: string;
  readonly rule: RecurringRule;
  /** 素朴な定義で当てはまる日（期限に近い順） */
  readonly matches: readonly string[];
  /** 当てはまる日のうち期限に最も近い日が、期限の年から 28 年を超えて離れている（28 年だけを調べると見落とす） */
  readonly late: boolean;
  readonly codes: readonly string[];
}
let oneSidedCases: readonly OneSidedCase[] | undefined;
/** 規則の形 × 期限のすべての組み合わせを 1 回だけ診断する（下の 2 つのテストが同じ結果を別の観点で確かめる） */
function oneSided(): readonly OneSidedCase[] {
  oneSidedCases ??= FEBRUARY_SHAPES.flatMap((shape) =>
    ONE_SIDED.map((period): OneSidedCase => {
      const rule = { ...shape, months: [2], ...period } as RecurringRule;
      const matches = februaryMatches(shape, period);
      const edge = "effectiveFrom" in period ? period.effectiveFrom : period.effectiveTo;
      const yearsApart = Math.abs(Number(matches[0]?.slice(0, 4)) - Number(edge.slice(0, 4)));
      const late = matches.length > 0 && yearsApart > 28;
      return {
        label: JSON.stringify(rule),
        rule,
        matches,
        late,
        codes: diagnoseCalendar({ closedWeekdays: [], closedRecurringRules: [rule] }).map(
          (d) => d.code,
        ),
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

test("never-matches: 期限が片側だけの有効期間が 1900 年・2100 年にかかっても、400 年を調べた素朴な定義と一致する", () => {
  const cases = oneSided();
  for (const c of cases) {
    assert.equal(c.codes.includes("never-matches"), c.matches.length === 0, c.label);
    // 素朴な定義の当てはまる日は、ライブラリの判定でも休業日（素朴な定義の側の誤りを見張る）
    if (c.matches.length > 0) {
      const calendar = createCalendar({ closedWeekdays: [], closedRecurringRules: [c.rule] });
      assert.equal(calendar.isBusinessDay(c.matches[0]!), false, c.label);
    }
  }
  // 28 年の中では当てはまらず、その先で当てはまる規則（28 年だけを調べると never-matches になる形）を含むこと
  const late = cases.filter((c) => c.late).length;
  const never = cases.filter((c) => c.matches.length === 0).length;
  console.log(
    `# 片側だけの有効期間: ${cases.length} 件（28 年の先で当てはまる ${late}、当てはまらない ${never}）`,
  );
  assert.ok(late > 0 && never > 0);
});

test("redundant: 期限が片側だけの有効期間が 1900 年・2100 年にかかっても、後で当てはまる規則を redundant にしない", () => {
  const cases = oneSided().filter((c) => c.matches.length > 0);
  assert.ok(cases.some((c) => c.late));
  // 定休日のない設定なので、当てはまる日のある閉じる規則は、取り除くとその日が変わる
  for (const c of cases) assert.equal(c.codes.includes("redundant"), false, c.label);
});

test("never-matches: 第 n 営業日の規則でも、2100 年にかかる期限のない有効期間の先で当てはまる月を見落とさない", () => {
  // 月曜日だけが営業日の設定で、2 月の第 5 営業日があるのは 2 月 29 日が月曜日の年だけ（2073 年以降で最初は 2112 年）
  assert.deepEqual(
    februaryMatches({ weekday: 1, nth: 5 }, { effectiveFrom: "2073-01-01" }).slice(0, 1),
    ["2112-02-29"],
  );
  const options: CalendarOptions = {
    closedWeekdays: [0, 2, 3, 4, 5, 6],
    closedRecurringRules: [{ businessDayOfMonth: 5, months: [2], effectiveFrom: "2073-01-01" }],
  };
  assert.deepEqual(brief(diagnoseCalendar(options)), []);
  assert.equal(createCalendar(options).isBusinessDay("2112-02-29"), false);
  assert.equal(createCalendar(options).isBusinessDay("2112-02-22"), true);
});

test("diagnoseSchedule: タイムゾーンが決まらない設定では、基準のカレンダーとの time-zone-conflict を重ねて出さない", () => {
  const tokyo = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
  const rules = [{ businessDayOfMonth: 1, calendar: tokyo, value: 2 }];
  const weekdayValues = [1, 1, 1, 1, 1, 1, 1] as const;
  // timeZone の値の誤り: 仮の値（"UTC"）との食い違いを出さない
  assert.deepEqual(
    brief(diagnoseSchedule({ timeZone: "Bad/Zone", weekdayValues, recurringRules: rules })),
    [{ severity: "error", code: "invalid-time-zone", path: "timeZone" }],
  );
  // 提供元どうしの食い違い: 仮の値（先の提供元のタイムゾーン）との食い違いを出さない
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
  // 作成は、どちらも最初の誤りで止まる（診断の 1 件目と同じ code）
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
