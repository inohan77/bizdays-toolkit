// A home-made provider with few supported years (T1 and T2 of the test expansion plan). The supported years are
// 2025-2027, so that tests comparing all days run fast.
// Holidays: New Year's Day, the holidays in May (May 6 is a substitute when one falls on a Sunday), the third
// Monday of July and December 25.
import { addDays, type Holiday, type HolidayProvider } from "../../src/index.ts";
import { jp, type JpHolidayKind } from "../../src/jp/index.ts";
import { daysOf } from "./compare.ts";

const holidaysIn = (year: number): Holiday[] => {
  const list: [string, string, string][] = [
    [`${year}-01-01`, "regular", "new-year"],
    [`${year}-05-03`, "regular", "a"],
    [`${year}-05-04`, "regular", "b"],
    [`${year}-05-05`, "regular", "c"],
    [`${year}-12-25`, "regular", "xmas"],
  ];
  const july = new Date(Date.UTC(year, 6, 1));
  let mondays = 0;
  while (true) {
    if (july.getUTCDay() === 1 && ++mondays === 3) break;
    july.setUTCDate(july.getUTCDate() + 1);
  }
  list.push([july.toISOString().slice(0, 10), "regular", "mon"]);
  if (["03", "04", "05"].some((d) => new Date(`${year}-05-${d}T00:00:00Z`).getUTCDay() === 0))
    list.push([`${year}-05-06`, "substitute", "c"]);
  return list
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, kind, key]) => ({ date, name: key, nameEn: key, kind, key, confirmed: true }));
};

export const SHORT_PROVIDER: HolidayProvider<string> = {
  id: "XX",
  timeZone: "UTC",
  supportedYears: { from: 2025, to: 2027 },
  dataVersion: "2026-10",
  holidaysInYear: holidaysIn,
};
export const SHORT_KINDS = ["regular", "substitute"] as const;
export const SHORT_KEYS = ["new-year", "b", "mon", "xmas"] as const;

/** Every day of the supported years */
export const SHORT_DAYS: readonly string[] = daysOf("2025-01-01", "2027-12-31");

/**
 * A copy of the Japanese provider with the supported years narrowed to 2020-2030 (the id stays "JP"; "national"
 * in kinds takes the same path).
 * The diagnostics scan every day of a provider's supported years, so tests that do not depend on the whole range
 * (1955-2099) use this to save time (T-1 of the proposal bizdays-toolkit-0.31.8-proposal; the diagnostics over
 * Japan's whole range stay in the diagnose-consistency job of CI and in the tests that depend on the whole range)
 */
export const JP_NARROW: HolidayProvider<JpHolidayKind> = Object.freeze({
  ...jp,
  supportedYears: Object.freeze({ from: 2020, to: 2030 }),
  holidaysInYear: (year: number) => jp.holidaysInYear(year),
});

/**
 * A provider that returns the given days as holidays (for checking long runs of holidays; the supported years
 * are 2020-2030 unless given)
 */
export const holidaysOn = (
  dates: readonly string[],
  supportedYears: { readonly from: number; readonly to: number } = { from: 2020, to: 2030 },
  id = "XX",
): HolidayProvider<string> => ({
  id,
  timeZone: "UTC",
  supportedYears,
  dataVersion: "test",
  holidaysInYear: (year) =>
    dates
      .filter((date) => Number(date.slice(0, 4)) === year)
      .map((date) => ({
        date,
        name: "shutdown",
        nameEn: "shutdown",
        kind: "regular",
        confirmed: true,
      })),
});

/**
 * A provider that returns holidays lasting `days` days from `start` (beyond 31 days the day of an
 * "after-holiday" rule can be out of reach. decisions.md #24)
 */
export const holidayRun = (
  days: number,
  start = "2026-07-01",
  id = "XX",
  supportedYears: { readonly from: number; readonly to: number } = { from: 2020, to: 2030 },
): HolidayProvider<string> =>
  holidaysOn(daysOf(start, addDays(start, days - 1)), supportedYears, id);
