# 移行ガイド

マイナー版の間を移るときに、利用者がする作業をまとめます（1.0.0 までは、マイナー版で破壊的変更を行うことがあります）。版を飛ばして移るときは、移り先までの各版の作業をすべて行ってください。変更の全体は [CHANGELOG](../CHANGELOG.md) を見てください。0.9.0 以降は、CHANGELOG の各マイナー版にも「移行」の小見出しで同じ内容を書きます。

パッチ版（0.x.y の y）は、公式データの反映と不具合の修正なので、作業は要りません。

## 0.13.0

作業は要りません（スケジュールから営業日カレンダーを作る `createCalendarFromSchedule` と、判定の理由 `"open-annual"` の追加。CI の改善）。

- `DayReason` に `"open-annual"` が加わりました。`createCalendarFromSchedule` で作ったカレンダーの `dayInfo` にだけ現れます。`reason` の値で分岐しているコードは「その他」も扱う約束（RELEASING.md の互換性の約束）どおりなら、そのまま動きます。`KnownDayReason` を `switch` で網羅しているコードは、`"open-annual"` の分岐を足してください

## 0.12.0

動作は変わりません（繰り返しの規則の祝日の形 `{ holiday: true, kinds?, months? }` と、`dayInfo` の `rulePath` の追加。診断・CI の改善）。`bizdays-toolkit/jp`・`bizdays-toolkit/uk` の 2 つの定数が非推奨になったので、使っていれば書き換えてください（1.0.0 で削除します）。

| 非推奨                                              | 移行先（同じ値）                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `jp` モジュールの `dataVersion`・`confirmedThrough` | 提供元の項目 `jp.dataVersion`・`jp.confirmedThrough`                                                                   |
| `uk` モジュールの `dataVersion`・`confirmedThrough` | 提供元の項目 `england.dataVersion`・`england.confirmedThrough` など（`scotland`・`wales`・`northernIreland` も同じ値） |

```ts
// 0.11.x
import { confirmedThrough, dataVersion } from "bizdays-toolkit/jp";

// 0.12.0 から
import { jp } from "bizdays-toolkit/jp";
jp.dataVersion;
jp.confirmedThrough;
```

- 同じ値が定数と提供元の項目の 2 経路にあり、英国は 4 つの提供元に 1 組の定数という歪みがあったため、提供元の項目に集約します（decisions.md の 37 番）
- `DayInfo`・`ScheduleDay` に省略可能な `rulePath` が加わりました。読む側には影響しません

## 0.11.0

作業は要りません（繰り返しの規則の祝日の翌日の形 `{ dayAfterHoliday: true }` と、カレンダーを合成する `combineCalendars` の追加）。

- `DayInfo` に省略可能な `decidedBy` が、`HolidayLookup`（営業日カレンダー・スケジュール）に `outOfRange` が加わりました。読む側には影響しません。`DayInfo` を自分で組み立てて `DayInfo` 型に代入しているコードも、どちらも省略可能・読み取り専用の項目なのでそのまま通ります

## 0.10.0

動作は変わりません（繰り返しの規則・毎年の月日の規則への有効期間 `effectiveFrom`・`effectiveTo` と、曜日の規則への周期 `interval`・`anchor` の追加。診断の改善）。`bizdays-toolkit/jp` の 2 つの関数が非推奨になったので、使っていれば書き換えてください（1.0.0 で削除します）。

| 非推奨                   | 移行先（同じ変換・同じ型）                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `toJapanDate(input)`     | ルートの `toDateString(input, "Asia/Tokyo")`、または営業日カレンダー・スケジュールの `dateOf(input)`     |
| `toJapanDateTime(input)` | ルートの `toDateTimeParts(input, "Asia/Tokyo")`、または営業日カレンダー・スケジュールの `civilOf(input)` |

```ts
// 0.9.x
import { toJapanDate, toJapanDateTime } from "bizdays-toolkit/jp";
toJapanDate(new Date());
toJapanDateTime(new Date()).time;

// 0.10.0 から
import { toDateString, toDateTimeParts } from "bizdays-toolkit";
toDateString(new Date(), "Asia/Tokyo");
toDateTimeParts(new Date(), "Asia/Tokyo").time;
// 営業日カレンダーを作っているなら、そのタイムゾーンで同じ変換ができる
calendar.dateOf(new Date());
calendar.civilOf(new Date()).time;
```

- 同じ変換が `bizdays-toolkit/jp` の関数・ルートの関数・カレンダーのメソッドの 3 経路にあり、国ごとの関数は日本だけの特別扱い（英国には対応物がない）だったため、国に依らない 2 経路に集約します（decisions.md の 32 番）
- 規則の診断（`diagnoseCalendar`・`diagnoseSchedule`）で、規則の有効期間が祝日の提供元の対応年の外にあるときも `out-of-range` の warning になります。新しい `code` はありません

## 0.9.0

作業は要りません（機能の追加だけ）。

- 時刻を必ず持つ入力（`Date`、Temporal の `Instant`・`ZonedDateTime`・`PlainDateTime`、`"YYYY-MM-DDTHH:mm…"` の文字列）では、`civilOf`・`toDateTimeParts`・`toJapanDateTime` の `time` の型が `string` になりました。これまで書いていた `?? "00:00"` のような `null` の分岐は、不要になります（残しても動きます）。lint の設定によっては、通らない分岐として指摘されることがあります
- `CivilDateTimeParts` は、時刻の型を引数に取る型（`CivilDateTimeParts<string>` など）になりました。引数を省略すると、これまでと同じ `string | null` です

## 0.8.0

作業は要りません（英国の提供元 `bizdays-toolkit/uk` の追加）。

- 公式データの反映（祝日の新設・移動、春分・秋分の日の確定など）は、これまでのマイナー版ではなく、パッチ版で公開します。`^0.8.0` のように指定していれば、0.x の間も自動で届きます

## 0.7.0

ほとんどの場合、作業は要りません。

- 祝日に、ほかの言語の名称 `names` が加わりました。**自分で提供元（`HolidayProvider`）を実装していて、祝日に `names` という項目を付けている場合**は、キーが BCP 47 の言語タグの正規の形（`"zh-Hant"`・`"ko"` など）になっていることを確かめてください。正しくないと、提供元のデータの誤り（`invalid-provider-data`）になります

## 0.6.0

作業は要りません（日付の調整・月の期日・月の計算の追加）。

## 0.5.0

- `HolidayRule` 型を削除しました。`HolidayValueRule` に書き換えてください（0.4.0 で改名し、旧名を残していました）

## 0.4.0

- `HolidayRule` 型を `HolidayValueRule` に改名しました（旧名は 0.4.0 では別名として使えます）。0.5.0 で旧名を削除したので、このときに書き換えておくのがおすすめです

## 0.3.0

- **判定の理由（`DayReason`・`ScheduleReason`）と祝日の種別（`JapaneseHolidayKind`）が「開いた型」になりました**。将来の版で値が増えても、コンパイルエラーにはなりません。値を列挙して分岐している（`switch` ですべての値を書いている）コードは、「その他」の分岐を足してください。すべての値を網羅したことを型で確かめたい場合は、`KnownDayReason`・`KnownScheduleReason`・`KnownJapaneseHolidayKind` を使います
- `vernalEquinoxDay`・`autumnalEquinoxDay`（`bizdays-toolkit/jp`）と `nthWeekdayOfMonth` を非公開にしました。使っていた場合は、春分・秋分の日は `holidaysInYear` の結果から、第 n 曜日は繰り返しの規則（`{ weekday, nth }`）で求めてください
- 設定は作る時点で複製するようになりました。作ったあとに元の配列やオブジェクトを書き換えても、カレンダー・スケジュールの結果は変わりません。設定を後から書き換えて反映させていた場合は、作り直してください
- 提供元が返した祝日は、契約の項目（`date`・`name`・`nameEn`・`kind`・`confirmed`。0.7.0 から `names`）だけを持つ、変更できないオブジェクトとして返します。自分の提供元で独自の項目を付けていた場合は、`getHoliday` などの結果からは取り出せなくなります

## 0.2.0

作業は要りません（スケジュール `createSchedule` の追加。営業日カレンダーの判定の優先順位と結果は変わらない）。
