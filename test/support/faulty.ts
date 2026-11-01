// 失敗を注入する祝日の提供元（テスト拡充案の T3）。対応年の短い自作の提供元（test/support/provider.ts）を包み、
// 決まった年だけ、例外を投げる・不正なデータを返す・祝日を未確定にする。全日を調べる検査も速く回るよう、対応年は 2025〜2027 年。
import type { Holiday, HolidayProvider } from "../../src/index.ts";
import { SHORT_PROVIDER } from "./provider.ts";

type Provider = HolidayProvider<string>;
const base = SHORT_PROVIDER;
const wrap = (
  id: string,
  holidaysInYear: Provider["holidaysInYear"],
  extra: Partial<Provider> = {},
): Provider => ({
  ...base,
  id,
  holidaysInYear,
  ...extra,
});

/** year の年を引くと例外（RangeError）を投げる */
export function throwingInYear(year: number): Provider {
  return wrap(`THROW-${year}`, (y) => {
    if (y === year) throw new RangeError(`injected failure for ${y}`);
    return base.holidaysInYear(y);
  });
}

/** 不正なデータの種類: 日付の書式の誤り・同じ日の重複・オブジェクトでない項目 */
export type InvalidData = "format" | "duplicate" | "type";

/** year の年だけ、不正なデータ（種類は kind）を返す */
export function invalidDataInYear(year: number, kind: InvalidData): Provider {
  return wrap(`BAD-${kind}-${year}`, (y) => {
    const list = base.holidaysInYear(y);
    if (y !== year) return list;
    if (kind === "format")
      return [
        ...list,
        { date: `${y}/07/01`, name: "x", nameEn: "x", kind: "regular", key: "x", confirmed: true },
      ];
    if (kind === "duplicate") return [...list, list[0]!];
    return [...list, 42 as unknown as Holiday<string>];
  });
}

/** year の年の祝日だけを未確定（confirmed: false）にする（前後の年は確定のまま。confirmedThrough は year の前の年） */
export function unconfirmedInYear(year: number): Provider {
  return wrap(
    `UNCONFIRMED-${year}`,
    (y) => base.holidaysInYear(y).map((h) => (y === year ? { ...h, confirmed: false } : h)),
    { confirmedThrough: year - 1 },
  );
}

/**
 * 年ごとに、calls 回目の呼び出しまでは正しいデータを返し、その後は例外を投げる（year を渡せばその年だけ。code を渡せば
 * 例外に code を付ける）。提供元の約束（同じ年に同じ結果を返す）の外の提供元で、診断の最初の検査（対応年のすべての年を
 * 1 回ずつ引く）は通り、規則どうしの診断の途中で投げる。診断の catch 節に届くことを確かめるテスト（test/catch-paths.test.ts）で使う
 */
export function throwingAfter(
  calls: number,
  options: { year?: number; code?: string } = {},
): Provider {
  const count = new Map<number, number>();
  return wrap(`LATE-${calls}-${options.year ?? "all"}`, (y) => {
    const n = (count.get(y) ?? 0) + 1;
    count.set(y, n);
    if (n > calls && (options.year === undefined || y === options.year)) {
      const error = new RangeError(`injected late failure for ${y}`) as RangeError & {
        code?: string;
      };
      if (options.code !== undefined) error.code = options.code;
      throw error;
    }
    return base.holidaysInYear(y);
  });
}

/** 注入した年（2026 年）の日・祝日・前後の年の日 */
export const INJECTED_YEAR = 2026;
export const DAY_IN_INJECTED_YEAR = "2026-03-03";
export const HOLIDAY_IN_INJECTED_YEAR = "2026-05-04";
export const DAY_BEFORE = "2025-03-03";
export const HOLIDAY_AFTER = "2027-05-04";
