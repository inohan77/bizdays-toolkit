/**
 * 全日の結果を並べて比べるための補助（テストどうしで同じ処理を別々に持たないための置き場）。
 *
 * - daysOf: 期間の全日（"YYYY-MM-DD"。両端を含む）
 * - dayLine: 1 日の結果を 1 行の文字列にする（open だけか、理由・名前・振替元まで）
 * - linesOf: カレンダーの期間の全日を dayLine で並べる（投げた日は "E:<code>"）
 * - removeItem: "closedRecurringRules[2]" のような位置の項目を設定から取り除く
 *
 * 比べる定義（open だけか、理由まで見るか）は呼ぶ側が full で選ぶ。変形のテスト（test/metamorphic.test.ts）の全項目の比較、
 * 整合のテスト（test/consistency.test.ts）の valueOn の結果の比較、失敗の注入のテスト（test/faulty-provider.test.ts）の
 * isBusinessDay と例外の有無の比較は、比べる約束が違うので、この補助には寄せない
 */
import type { Obj } from "./catalog.ts";

/** 期間の全日（両端を含む）。日付の文字列から Date.UTC で数えるので、実行環境のタイムゾーンに依存しない */
export function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** dayInfoOn の結果のうち、比べる項目 */
export interface DayLike {
  readonly open: boolean;
  readonly reason: string;
  readonly name?: string | undefined;
  readonly shiftedFrom?: string | undefined;
}

/** 1 日の結果（full なら理由・名前・振替元まで。位置は項目を取り除くとずれるので含めない） */
export const dayLine = (d: DayLike, full: boolean): string =>
  full ? `${d.open}|${d.reason}|${d.name ?? ""}|${d.shiftedFrom ?? ""}` : String(d.open);

/** 期間の全日の結果。投げた日は "E:<code>"（対応年の外などを比べられるように） */
export function linesOf(
  calendar: { dayInfoOn(day: string): DayLike },
  days: readonly string[],
  full: boolean,
): string[] {
  return days.map((d) => {
    try {
      return dayLine(calendar.dayInfoOn(d), full);
    } catch (error) {
      return `E:${String((error as { code?: unknown } | null)?.code)}`;
    }
  });
}

/** "closedRecurringRules[2]" の位置の項目を取り除いた設定（配列の要素の位置だけを受け付ける） */
export function removeItem(options: Obj, path: string): Obj {
  const m = /^(\w+)\[(\d+)\]$/.exec(path);
  if (!m) throw new Error(`unexpected path ${path}`);
  const key = m[1]!;
  const index = Number(m[2]);
  return { ...options, [key]: (options[key] as unknown[]).filter((_, i) => i !== index) };
}
