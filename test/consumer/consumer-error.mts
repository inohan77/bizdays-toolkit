// 利用者の型チェック（scripts/check-consumer-types.ts）が機能していることを確かめるための、わざと型エラーを含む入力。
// 公開する型定義を通して検出されるエラーであること（ライブラリの型が読めていなければ別のエラーになる）
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const calendar = createCalendar({ holidays: jp });
// 戻り値は boolean なので、string には代入できない
const wrong: string = calendar.isBusinessDay("2026-10-20");
void wrong;
