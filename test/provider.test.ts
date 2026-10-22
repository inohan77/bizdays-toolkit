import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, createCalendar, isBizdaysError, weekdayOf } from "../src/index.ts";
import { daysInMonth, easterSunday, isLeapYear, nthWeekdayOfMonth } from "../src/provider/index.ts";
import { england } from "../src/uk/index.ts";
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
