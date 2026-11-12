import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, createCalendar, isBizdaysError, weekdayOf } from "../src/index.ts";
import {
  lengthOfMonth,
  easterSunday,
  isLeapYear,
  nthWeekdayOfMonth,
  withSubstituteDays,
} from "../src/provider/index.ts";
import { jp } from "../src/jp/index.ts";
import { england, northernIreland, scotland, wales } from "../src/uk/index.ts";
import { sg } from "../src/sg/index.ts";
import type { Holiday, HolidayProvider } from "../src/index.ts";

test("provider: 第 n 何曜日（1〜5 と -1）", () => {
  assert.equal(
    nthWeekdayOfMonth(2026, 1, 1, 3),
    "2026-01-19",
    "1 月第 3 月曜（米国 Martin Luther King Jr. Day）",
  );
  assert.equal(
    nthWeekdayOfMonth(2026, 5, 1, -1),
    "2026-05-25",
    "5 月最終月曜（米国 Memorial Day）",
  );
  assert.equal(
    nthWeekdayOfMonth(2026, 11, 4, 4),
    "2026-11-26",
    "11 月第 4 木曜（米国 Thanksgiving）",
  );
  assert.equal(nthWeekdayOfMonth(2026, 2, 0, 1), "2026-02-01", "月の 1 日がその曜日なら第 1");
  assert.equal(nthWeekdayOfMonth(2026, 2, 6, 4), "2026-02-28", "月末がその曜日");
  // -1 は、その月にある最後の回（4 回目か 5 回目）と一致し、曜日は指定どおり
  for (let year = 2024; year <= 2030; year++) {
    for (let month = 1; month <= 12; month++) {
      for (let weekday = 0; weekday <= 6; weekday++) {
        const w = weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6;
        const last = nthWeekdayOfMonth(year, month, w, -1);
        let fifth: string | undefined;
        try {
          fifth = nthWeekdayOfMonth(year, month, w, 5);
        } catch {
          fifth = undefined;
        }
        assert.equal(last, fifth ?? nthWeekdayOfMonth(year, month, w, 4));
        assert.equal(weekdayOf(last), w);
        assert.ok(last.slice(8) >= "22" && last <= `${year}-${String(month).padStart(2, "0")}-31`);
      }
    }
  }
});

test("provider: 復活祭と、その日数差で決まる祝日（英国の提供元と一致する）", () => {
  assert.equal(easterSunday(2024), "2024-03-31");
  assert.equal(easterSunday(2025), "2025-04-20");
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2038), "2038-04-25", "最も遅い日");
  assert.equal(easterSunday(2285), "2285-03-22", "最も早い日");
  for (let year = 2012; year <= 2028; year++) {
    const easter = easterSunday(year);
    const dates = england.holidaysInYear(year).map((h) => h.date);
    assert.ok(dates.includes(addDays(easter, -2)), `Good Friday ${year}`);
    assert.ok(dates.includes(addDays(easter, 1)), `Easter Monday ${year}`);
  }
});

test("provider: 月の日数・うるう年", () => {
  assert.equal(lengthOfMonth(2028, 2), 29);
  assert.equal(lengthOfMonth(2100, 2), 28);
  assert.equal(lengthOfMonth(2026, 4), 30);
  assert.deepEqual([2000, 2024, 2026, 2100].map(isLeapYear), [true, true, false, false]);
});

test("provider: 入力の誤りは code 付きの例外", () => {
  const cases: [() => unknown, string][] = [
    [() => nthWeekdayOfMonth(2026, 2, 0, 5), "invalid-argument"],
    [() => nthWeekdayOfMonth(2026, 13, 0, 1), "invalid-argument"],
    [() => nthWeekdayOfMonth(2026, 1, 7 as never, 1), "invalid-weekday"],
    [() => nthWeekdayOfMonth(2026, 1, 1, 0), "invalid-argument"],
    [() => nthWeekdayOfMonth(2026, 1, 1, 6), "invalid-argument"],
    [() => nthWeekdayOfMonth(2026, 1, 1, 1.5), "invalid-argument"],
    [() => easterSunday(999), "invalid-argument"],
    [() => easterSunday(2026.5), "invalid-argument"],
    [() => lengthOfMonth(2026, 0), "invalid-argument"],
    [() => isLeapYear(Number.NaN), "invalid-argument"],
  ];
  for (const [fn, code] of cases) {
    assert.throws(fn, (e: unknown) => isBizdaysError(e) && e.code === code, fn.toString());
  }
});

test("provider: 提供元を書く例（米国の連邦祝日の一部）がカレンダーで使える", () => {
  const us: HolidayProvider<"federal"> = {
    id: "US-EXAMPLE",
    timeZone: "America/New_York",
    supportedYears: { from: 2000, to: 2099 },
    dataVersion: "example",
    holidaysInYear(year): readonly Holiday<"federal">[] {
      const h = (date: string, name: string): Holiday<"federal"> => ({
        date,
        name,
        nameEn: name,
        kind: "federal",
        confirmed: true,
      });
      return [
        h(nthWeekdayOfMonth(year, 1, 1, 3), "Birthday of Martin Luther King, Jr."),
        h(nthWeekdayOfMonth(year, 5, 1, -1), "Memorial Day"),
        h(nthWeekdayOfMonth(year, 11, 4, 4), "Thanksgiving Day"),
      ];
    },
  };
  const calendar = createCalendar({ holidayProvider: us, closedWeekdays: [0, 6] });
  assert.equal(calendar.isHoliday("2026-11-26"), true);
  assert.equal(calendar.addBusinessDays("2026-11-25", 1), "2026-11-27");
  assert.equal(calendar.dayInfoOn("2026-05-25").holiday?.name, "Memorial Day");
});

const label = (h: Holiday) => `${h.date} ${h.name} ${h.kind} ${h.key ?? "-"} ${h.confirmed}`;

test("provider: withSubstituteDays が返す配列と、入力のまま返す祝日・振替日は、どれも凍結している", () => {
  // 返す配列と、入力のまま返す祝日・振替日は、どれも凍結している（4 番）。入力のまま返す祝日も入力とは別のもの
  const input = [
    { date: "2026-01-04", name: "X", nameEn: "X", kind: "regular", confirmed: true },
    { date: "2026-01-07", name: "Y", nameEn: "Y", kind: "regular", confirmed: true },
  ] as const;
  const result = withSubstituteDays([...input], { directions: { 0: "next" }, kind: "substitute" });
  assert.deepEqual(
    result.map((h) => h.date),
    ["2026-01-04", "2026-01-05", "2026-01-07"],
  );
  for (const h of result) assert.ok(Object.isFrozen(h), h.date);
  assert.ok(!input.some((h) => result.includes(h as never)));
  assert.ok(Object.isFrozen(result));
  assert.throws(() => (result as unknown as unknown[]).push(input[0]), TypeError);
});

test("provider: withSubstituteDays は日本の振替休日（2007 年以降の祝日法）を再現する", () => {
  for (let y = 2007; y <= 2099; y++) {
    const all = jp.holidaysInYear(y);
    const base = all.filter((h) => h.kind !== "substitute" && h.kind !== "citizens");
    const result = withSubstituteDays(base, {
      directions: { 0: "next" },
      kind: "substitute",
      renameSubstitute: () => ({ name: "振替休日", nameEn: "Substitute Holiday" }),
    });
    assert.deepEqual(
      result.map(label),
      all.filter((h) => h.kind !== "citizens").map(label),
      String(y),
    );
  }
  // 連鎖: 2020 年は 5 月 3 日（日）の振替が 4 日・5 日を飛ばして 6 日になる
  const may = withSubstituteDays(
    jp.holidaysInYear(2020).filter((h) => h.kind === "regular" && h.date.startsWith("2020-05")),
    { directions: { 0: "next" }, kind: "substitute" },
  );
  assert.deepEqual(
    may.map((h) => `${h.date} ${h.kind}`),
    ["2020-05-03 regular", "2020-05-04 regular", "2020-05-05 regular", "2020-05-06 substitute"],
  );
  assert.equal(may[3]!.key, "constitution-memorial", "振替日は元の祝日の key を引き継ぐ");
  assert.equal(may[3]!.name, "憲法記念日", "name を省略すると元の祝日の名称");
});

test("provider: withSubstituteDays はシンガポールの振替（Holidays Act 第 4 条）を再現する", () => {
  for (let y = sg.supportedYears.from; y <= sg.supportedYears.to; y++) {
    const all = sg.holidaysInYear(y);
    const result = withSubstituteDays(
      all.filter((h) => h.kind !== "substitute"),
      { directions: { 0: "next" }, kind: "substitute" },
    );
    assert.deepEqual(result.map(label), all.map(label), String(y));
  }
});

test("provider: withSubstituteDays は英国の振替（土日に当たる固定日の祝日。GOV.UK の一覧は週末の日を載せない）を再現する", () => {
  const FIXED: Record<string, string> = {
    "new-year": "01-01",
    "2nd-january": "01-02",
    "st-patricks": "03-17",
    "battle-of-the-boyne": "07-12",
    "st-andrews": "11-30",
    christmas: "12-25",
    "boxing-day": "12-26",
  };
  // 2023 年の Scotland は振替の割り当てだけ GOV.UK に合わせている（1/2 が New Year’s Day、1/3 が 2nd January）ので、
  // 附則どおりの計算（1/2 は 2nd January の当日、1/3 が New Year’s Day の振替）と名前・種別・key が入れ替わる。日付は同じ
  const renamed = (h: Holiday) => `${h.date} ${h.confirmed}`;
  for (const provider of [england, wales, scotland, northernIreland]) {
    for (let y = 2012; y <= 2099; y++) {
      const all = provider.holidaysInYear(y);
      // 振替日を元の固定日に戻した「振替前の一覧」を作る
      const before = all.map((h) =>
        h.kind === "substitute" ? { ...h, date: `${y}-${FIXED[h.key!]!}`, kind: "regular" } : h,
      ) as Holiday[];
      const result = withSubstituteDays(before, {
        directions: { 6: "next", 0: "next" },
        kind: "substitute",
        originalPolicy: "drop",
      });
      const compare = provider === scotland && y === 2023 ? renamed : label;
      assert.deepEqual(result.map(compare), all.map(compare), `${provider.id} ${y}`);
    }
  }
  assert.equal(
    wales.holidaysInYear(2021).find((h) => h.date === "2021-12-27")?.names?.cy,
    "Dydd Nadolig",
  );
  // 振替日は元の祝日の names も引き継ぐ
  const [first] = withSubstituteDays(
    [
      {
        date: "2021-12-25",
        name: "Christmas Day",
        nameEn: "Christmas Day",
        names: { cy: "Dydd Nadolig" },
        kind: "regular",
        confirmed: true,
        key: "christmas",
      },
    ],
    { directions: { 6: "next", 0: "next" }, kind: "substitute", originalPolicy: "drop" },
  );
  assert.deepEqual(first, {
    date: "2021-12-27",
    name: "Christmas Day",
    nameEn: "Christmas Day",
    names: { cy: "Dydd Nadolig" },
    kind: "substitute",
    confirmed: true,
    key: "christmas",
  });
  assert.ok(Object.isFrozen(first));
});

test("provider: withSubstituteDays の向き（米国式: 土曜日は前日、日曜日は翌日）と名称の関数", () => {
  const federal: Holiday[] = [
    {
      date: "2026-07-04",
      name: "Independence Day",
      nameEn: "Independence Day",
      kind: "federal",
      confirmed: true,
    },
    {
      date: "2027-12-25",
      name: "Christmas Day",
      nameEn: "Christmas Day",
      kind: "federal",
      confirmed: true,
    },
  ];
  const observed = (list: Holiday[]) =>
    withSubstituteDays(list, {
      directions: { 6: "previous", 0: "next" },
      kind: "observed",
      renameSubstitute: (h) => ({ name: `${h.name} (observed)`, nameEn: `${h.nameEn} (observed)` }),
    });
  assert.deepEqual(
    observed([federal[0]!]).map((h) => `${h.date} ${h.name} ${h.kind}`),
    ["2026-07-03 Independence Day (observed) observed", "2026-07-04 Independence Day federal"],
    "土曜日は前の金曜日。元の祝日は既定で残る",
  );
  assert.deepEqual(
    observed([federal[1]!]).map((h) => `${h.date} ${h.kind}`),
    ["2027-12-24 observed", "2027-12-25 federal"],
  );
  // 日曜日は次の月曜日。振替日自身は別の振替の対象にならず、年をまたぐことがある
  const dec = withSubstituteDays(
    [{ date: "2028-12-31", name: "X", nameEn: "X", kind: "regular", confirmed: false }],
    { directions: { 0: "next" }, kind: "substitute" },
  );
  assert.deepEqual(
    dec.map((h) => `${h.date} ${h.kind} ${h.confirmed}`),
    ["2028-12-31 regular false", "2029-01-01 substitute false"],
    "confirmed も引き継ぐ",
  );
});

test("provider: withSubstituteDays の入力の誤りは code 付きの例外", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
      return undefined;
    } catch (e) {
      return isBizdaysError(e) ? e.code : `not a bizdays error: ${String(e)}`;
    }
  };
  const h = (date: string): Holiday => ({
    date,
    name: "X",
    nameEn: "X",
    kind: "regular",
    confirmed: true,
  });
  const opts = { directions: { 0: "next" as const }, kind: "substitute" };
  assert.equal(
    code(() => withSubstituteDays("x" as never, opts)),
    "invalid-argument",
  );
  assert.equal(
    code(() => withSubstituteDays([h("2026-13-01")], opts)),
    "invalid-date",
  );
  assert.equal(
    code(() => withSubstituteDays([h("2026-01-01"), h("2027-01-01")], opts)),
    "invalid-argument",
    "同じ年",
  );
  assert.equal(
    code(() => withSubstituteDays([h("2026-01-01"), h("2026-01-01")], opts)),
    "invalid-argument",
    "重複",
  );
  assert.equal(
    code(() => withSubstituteDays([{ ...h("2026-01-01"), key: "Bad" } as never], opts)),
    "invalid-argument",
  );
  assert.equal(
    code(() => withSubstituteDays([], { ...opts, directions: { 7: "next" } as never })),
    "invalid-weekday",
  );
  assert.equal(
    code(() => withSubstituteDays([], { ...opts, directions: { 0: "nearest" } as never })),
    "invalid-argument",
  );
  assert.equal(
    code(() => withSubstituteDays([], { ...opts, kind: "" })),
    "invalid-argument",
  );
  assert.equal(
    code(() => withSubstituteDays([], { ...opts, originalPolicy: "omit" as never })),
    "invalid-argument",
  );
  assert.equal(
    code(() => withSubstituteDays([], { ...opts, name: "x" as never })),
    "invalid-argument",
  );
  assert.deepEqual(withSubstituteDays([], opts), [], "空の入力は空");
});

test("withSubstituteDays: directions は普通のオブジェクトだけを受け、undefined の曜日は省略と同じ。すべての曜日は入口で止め、names は検証して凍結した複製を返す", () => {
  const holidays = [
    { date: "2026-01-04", name: "A", nameEn: "A", kind: "k", confirmed: true, names: { cy: "Aa" } },
    { date: "2026-03-07", name: "B", nameEn: "B", kind: "k", confirmed: true },
  ];
  const code = (c: string) => (e: unknown) => isBizdaysError(e) && e.code === c;
  // 明示的な undefined は省略と同じ（decisions.md の 6 番）
  assert.deepEqual(
    withSubstituteDays(holidays, {
      // exactOptionalPropertyTypes を使わない利用者の型は undefined を通す
      directions: { 0: "next", 6: undefined } as never,
      kind: "s",
    }).map((h) => h.date),
    withSubstituteDays(holidays, { directions: { 0: "next" }, kind: "s" }).map((h) => h.date),
  );
  // Map・配列を黙って空として受けない（8 番）
  for (const directions of [new Map([[0, "next"]]), ["next"]])
    assert.throws(
      () => withSubstituteDays(holidays, { directions: directions as never, kind: "s" }),
      code("invalid-argument"),
    );
  // すべての曜日に向きがあると振替日がない（年の範囲の外まで探さず、入口で止める）
  const all = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, "next"]));
  assert.throws(
    () => withSubstituteDays(holidays, { directions: all, kind: "s" }),
    code("invalid-argument"),
  );
  // names は凍結した複製（入力と共有しない。4 番）
  const out = withSubstituteDays(holidays, { directions: { 0: "next" }, kind: "s" });
  for (const h of out.filter((x) => x.names !== undefined)) {
    assert.ok(Object.isFrozen(h.names), h.date);
    assert.notEqual(h.names, holidays[0]!.names, h.date);
    assert.deepEqual(h.names, { cy: "Aa" });
  }
  // 入力の names と、renameSubstitute が返す名称も検証する（26 番）
  assert.throws(
    () =>
      withSubstituteDays([{ ...holidays[0]!, names: 123 as never }], {
        directions: { 0: "next" },
        kind: "s",
      }),
    code("invalid-argument"),
  );
  assert.throws(
    () =>
      withSubstituteDays(holidays, {
        directions: { 0: "next" },
        kind: "s",
        renameSubstitute: () => ({ name: 1 as never, nameEn: "x" }),
      }),
    code("invalid-argument"),
  );
});

test('長く続く祝日（40 日・年をまたぐ 42 日）: 祝日の前後の規則は連続の前日と明けた日に当たり、"after-holiday" は本来の日が明けた日の 31 日前までなら振り替わる（decisions.md の 24 番）', () => {
  // 2026-03-01〜04-09（40 日）と、2026-12-01〜2027-01-11（42 日）を祝日として返す提供元
  const runs: [string, number][] = [
    ["2026-03-01", 40],
    ["2026-12-01", 42],
  ];
  const dates = runs.flatMap(([from, n]) => Array.from({ length: n }, (_, i) => addDays(from, i)));
  const long = {
    id: "LONG",
    timeZone: "UTC",
    supportedYears: { from: 2025, to: 2028 },
    dataVersion: "x",
    holidaysInYear: (y: number) =>
      dates
        .filter((d) => d.startsWith(`${y}-`))
        .map((date) => ({
          date,
          name: "休",
          nameEn: "Break",
          kind: "regular",
          key: "break",
          confirmed: true,
        })),
  };
  const make = (rule: Record<string, unknown>) =>
    createCalendar({
      holidayProvider: long,
      holidayPolicy: "open",
      closedRecurringRules: [rule],
    } as never);
  const closed = (rule: Record<string, unknown>, date: string) => !make(rule).isBusinessDay(date);
  // 祝日の前後の規則は、連続の長さによらず当てはまる
  assert.equal(closed({ dayAfterHoliday: true }, "2026-04-10"), true);
  assert.equal(closed({ dayBeforeHoliday: true }, "2026-02-28"), true);
  assert.equal(closed({ dayAfterHoliday: true, skipWeekdays: [0, 6] }, "2026-04-10"), true);
  assert.equal(closed({ dayAfterHoliday: true }, "2027-01-12"), true);
  assert.equal(closed({ dayBeforeHoliday: true }, "2026-11-30"), true);
  // 振替: 本来の日（3 月 12 日）が明けた日の 29 日前なら振り替わる
  assert.equal(
    closed({ dayOfMonth: 12, months: [3], holidayOverlapPolicy: "after-holiday" }, "2026-04-10"),
    true,
  );
  // 振替: 本来の日（3 月 5 日）が明けた日の 36 日前なら振り替わらず、休業日が 1 日も出ない
  const far = make({ dayOfMonth: 5, months: [3], holidayOverlapPolicy: "after-holiday" });
  assert.deepEqual(
    far.daysBetween("2026-03-01", "2026-04-12").filter((d) => !d.open && d.reason !== "holiday"),
    [],
  );
});
