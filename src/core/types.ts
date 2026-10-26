import type { DateString } from "./date.ts";

/** @internal 祝日の識別子（Holiday.key）の形式 */
export const HOLIDAY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * 祝日・休日 1 日分。
 * @public
 */
export interface Holiday<Kind extends string = string> {
  /** 暦日 "YYYY-MM-DD" */
  readonly date: DateString;
  /** 現地語の名称 */
  readonly name: string;
  /** 英語の名称 */
  readonly nameEn: string;
  /**
   * ほかの言語の名称（省略可能）。キーは BCP 47 の言語タグの正規の形（例: "zh-Hant", "ko"）。
   * 同梱の提供元は、公式の出典がある言語の名称だけを付ける。利用者が実装した提供元が付けた場合に、検証して複製・凍結して返す
   */
  readonly names?: Readonly<Record<string, string>>;
  /** 種別（国ごとに定義。日本は JapaneseHolidayKind） */
  readonly kind: Kind;
  /**
   * その日が観測している祝日の識別子（省略可能）。/^[a-z0-9][a-z0-9-]*$/ に限る。
   * name が公式データの呼び方を写すのに対し、key は規則（{ holiday: true, keys: [...] }）から祝日を指すための安定した
   * 識別子で、提供元が決め、版をまたいで変えない（日付の移動・公式の改名があっても同じ祝日なら同じ key）。
   * 振替日は元の祝日の key を持つ。種別と同じ情報しか持たない日（日本の国民の休日）や一度きりの日（臨時の祝日）は持たない。
   * 同じ年に同じ key が複数回現れることはある（振替日と元の祝日、年に 2 回ある振替休日）
   */
  readonly key?: string;
  /**
   * 公式に確定しているか。
   * 例: 日本の春分・秋分の日は前年 2 月の官報で確定するため、それより先の年は false（計算による予測）
   */
  readonly confirmed: boolean;
}

/**
 * 祝日の提供元（国・地域ごとのルール）。
 *
 * 他の国・地域の祝日はこのインターフェースを実装して createCalendar・createSchedule に渡す。
 * holidaysInYear が返すデータは、年ごとに初めて使うときに検証され、誤りがあれば
 * code: "invalid-provider-data" の例外になる。返した祝日は、契約の項目（date・name・nameEn・names・
 * kind・confirmed・key）だけを持つ変更できないオブジェクトに複製される。
 *
 * 互換性の約束: このインターフェースに項目を足すときは、メジャー版以外では省略可能な項目に限る。
 * @public
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
  /** その年の祝日・休日（同じ日付は 1 件まで。順序は問わない） */
  holidaysInYear(year: number): readonly Holiday<Kind>[];
}
