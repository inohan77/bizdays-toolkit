import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, createCalendar, isBizdaysError, weekdayOf } from "../src/index.ts";
import {
  daysInMonth,
  easterSunday,
  isLeapYear,
  nthWeekdayOfMonth,
  substituteDays,
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
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2100, 2), 28);
  assert.equal(daysInMonth(2026, 4), 30);
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
    [() => daysInMonth(2026, 0), "invalid-argument"],
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
  const calendar = createCalendar({ holidays: us, closedWeekdays: [0, 6] });
  assert.equal(calendar.isHoliday("2026-11-26"), true);
  assert.equal(calendar.addBusinessDays("2026-11-25", 1), "2026-11-27");
  assert.equal(calendar.dayInfo("2026-05-25").holiday?.name, "Memorial Day");
});

const label = (h: Holiday) => `${h.date} ${h.name} ${h.kind} ${h.key ?? "-"} ${h.confirmed}`;

test("provider: substituteDays は日本の振替休日（2007 年以降の祝日法）を再現する", () => {
  for (let y = 2007; y <= 2099; y++) {
    const all = jp.holidaysInYear(y);
    const base = all.filter((h) => h.kind !== "substitute" && h.kind !== "citizens");
    const result = substituteDays(base, {
      rules: { 0: "next" },
      kind: "substitute",
      name: () => ({ name: "振替休日", nameEn: "Substitute Holiday" }),
    });
    assert.deepEqual(
      result.map(label),
      all.filter((h) => h.kind !== "citizens").map(label),
      String(y),
    );
  }
  // 連鎖: 2020 年は 5 月 3 日（日）の振替が 4 日・5 日を飛ばして 6 日になる
  const may = substituteDays(
    jp.holidaysInYear(2020).filter((h) => h.kind === "national" && h.date.startsWith("2020-05")),
    { rules: { 0: "next" }, kind: "substitute" },
  );
  assert.deepEqual(
    may.map((h) => `${h.date} ${h.kind}`),
    ["2020-05-03 national", "2020-05-04 national", "2020-05-05 national", "2020-05-06 substitute"],
  );
  assert.equal(may[3]!.key, "constitution-memorial", "振替日は元の祝日の key を引き継ぐ");
  assert.equal(may[3]!.name, "憲法記念日", "name を省略すると元の祝日の名称");
});

test("provider: substituteDays はシンガポールの振替（Holidays Act 第 4 条）を再現する", () => {
  for (let y = sg.supportedYears.from; y <= sg.supportedYears.to; y++) {
    const all = sg.holidaysInYear(y);
    const result = substituteDays(
      all.filter((h) => h.kind !== "substitute"),
      { rules: { 0: "next" }, kind: "substitute" },
    );
    assert.deepEqual(result.map(label), all.map(label), String(y));
  }
});

test("provider: substituteDays は英国の振替（土日に当たる固定日の祝日。GOV.UK の一覧は週末の日を載せない）を再現する", () => {
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
      const result = substituteDays(before, {
        rules: { 6: "next", 0: "next" },
        kind: "substitute",
        original: "drop",
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
  const [first] = substituteDays(
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
    { rules: { 6: "next", 0: "next" }, kind: "substitute", original: "drop" },
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

test("provider: substituteDays の向き（米国式: 土曜日は前日、日曜日は翌日）と名称の関数", () => {
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
    substituteDays(list, {
      rules: { 6: "previous", 0: "next" },
      kind: "observed",
      name: (h) => ({ name: `${h.name} (observed)`, nameEn: `${h.nameEn} (observed)` }),
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
  const dec = substituteDays(
    [{ date: "2028-12-31", name: "X", nameEn: "X", kind: "regular", confirmed: false }],
    { rules: { 0: "next" }, kind: "substitute" },
  );
  assert.deepEqual(
    dec.map((h) => `${h.date} ${h.kind} ${h.confirmed}`),
    ["2028-12-31 regular false", "2029-01-01 substitute false"],
    "confirmed も引き継ぐ",
  );
});

test("provider: substituteDays の入力の誤りは code 付きの例外", () => {
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
  const opts = { rules: { 0: "next" as const }, kind: "substitute" };
  assert.equal(
    code(() => substituteDays("x" as never, opts)),
    "invalid-argument",
  );
  assert.equal(
    code(() => substituteDays([h("2026-13-01")], opts)),
    "invalid-date",
  );
  assert.equal(
    code(() => substituteDays([h("2026-01-01"), h("2027-01-01")], opts)),
    "invalid-argument",
    "同じ年",
  );
  assert.equal(
    code(() => substituteDays([h("2026-01-01"), h("2026-01-01")], opts)),
    "invalid-argument",
    "重複",
  );
  assert.equal(
    code(() => substituteDays([{ ...h("2026-01-01"), key: "Bad" } as never], opts)),
    "invalid-argument",
  );
  assert.equal(
    code(() => substituteDays([], { ...opts, rules: { 7: "next" } as never })),
    "invalid-weekday",
  );
  assert.equal(
    code(() => substituteDays([], { ...opts, rules: { 0: "nearest" } as never })),
    "invalid-argument",
  );
  assert.equal(
    code(() => substituteDays([], { ...opts, kind: "" })),
    "invalid-argument",
  );
  assert.equal(
    code(() => substituteDays([], { ...opts, original: "omit" as never })),
    "invalid-argument",
  );
  assert.equal(
    code(() => substituteDays([], { ...opts, name: "x" as never })),
    "invalid-argument",
  );
  assert.deepEqual(substituteDays([], opts), [], "空の入力は空");
});
