// 対応年の短い自作の提供元（テスト拡充案の T1・T2）。全日を比べるテストを速く回すため、対応年を 2025〜2027 年に絞る。
// 元日・5 月の連休（日曜日に当たれば 5 月 6 日が振替）・7 月の第 3 月曜日・12 月 25 日を祝日にする。
import type { Holiday, HolidayProvider } from "../../src/index.ts";
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

/** 対応年のすべての日 */
export const SHORT_DAYS: readonly string[] = daysOf("2025-01-01", "2027-12-31");

/**
 * 日本の提供元の対応年を 2020〜2030 年に絞った写し（id は "JP" のまま。kinds の "national" の扱いも同じ経路を通る）。
 * 診断は提供元の対応年の全日を走査するので、全範囲（1955〜2099 年）に依存しないテストはこれを使い、時間を短くする
 * （提案書 bizdays-toolkit-0.31.8-proposal の T-1。日本の全範囲の診断は、CI の diagnose-consistency ジョブと、
 * 全範囲に依存するテストに残す）
 */
export const JP_NARROW: HolidayProvider<JpHolidayKind> = Object.freeze({
  ...jp,
  supportedYears: Object.freeze({ from: 2020, to: 2030 }),
  holidaysInYear: (year: number) => jp.holidaysInYear(year),
});
