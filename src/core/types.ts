import type { DateString } from "./date.ts";

/** 祝日・休日 1 日分 */
export interface Holiday<Kind extends string = string> {
  /** 暦日 "YYYY-MM-DD" */
  readonly date: DateString;
  /** 現地語の名称 */
  readonly name: string;
  /** 英語の名称 */
  readonly nameEn: string;
  /** 種別（国ごとに定義。日本は JapaneseHolidayKind） */
  readonly kind: Kind;
  /**
   * 公式に確定しているか。
   * 例: 日本の春分・秋分の日は前年 2 月の官報で確定するため、それより先の年は false（計算による予測）
   */
  readonly confirmed: boolean;
}

/**
 * 祝日の提供元（国・地域ごとのルール）。
 *
 * 他の国・地域の祝日はこのインターフェースを実装して createCalendar に渡す。
 */
export interface HolidayProvider<Kind extends string = string> {
  /** ISO 3166-1 alpha-2（国）または ISO 3166-2（地域）のコード。例: "JP", "US-CA" */
  readonly id: string;
  /** 祝日を判定する基準のタイムゾーン（IANA 名）。例: "Asia/Tokyo" */
  readonly timeZone: string;
  /** 対応している年の範囲（両端を含む） */
  readonly supportedYears: { readonly from: number; readonly to: number };
  /** 反映済みのデータの版（例: 反映済みの官報の年月 "2026-02"） */
  readonly dataVersion: string;
  /** この年までは公式に確定している（それより後は confirmed: false を含みうる） */
  readonly confirmedThrough?: number;
  /** その年の祝日・休日を日付順に返す */
  holidaysInYear(year: number): readonly Holiday<Kind>[];
}
