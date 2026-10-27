# 移行ガイド

マイナー版の間を移るときに、利用者がする作業をまとめます（1.0.0 までは、マイナー版で破壊的変更を行うことがあります）。版を飛ばして移るときは、移り先までの各版の作業をすべて行ってください。変更の全体は [CHANGELOG](../CHANGELOG.md) を見てください。0.9.0 以降は、CHANGELOG の各マイナー版にも「移行」の小見出しで同じ内容を書きます。

パッチ版（0.x.y の y）は、公式データの反映と不具合の修正なので、作業は要りません。

## 1.0.0 で削除する予定の API

次の非推奨の API は 1.0.0 で削除します。使っている場合は、移行先に書き換えてください。設定の旧名のキーと値は、1.0.0 以降は黙って無視されず `invalid-option` になるので、保存した設定は 1.0.0 より前に `migrateCalendarOptions`・`migrateScheduleOptions`（`bizdays-toolkit/diagnose`）で書き換えてください。

| 非推奨の API                                                                                                                                                                                                            | 非推奨になった版 | 移行先                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toJapanDate`・`toJapanDateTime`（`bizdays-toolkit/jp`）                                                                                                                                                                | 0.10.0           | ルートの `toDateString(input, "Asia/Tokyo")`・`toDateTimeParts(input, "Asia/Tokyo")`、または営業日カレンダー・スケジュールの `dateOf`・`civilOf`                                                                                                                                                                                                                                                                                                                                                                                    |
| モジュールの定数 `dataVersion`・`confirmedThrough`（`bizdays-toolkit/jp`・`bizdays-toolkit/uk`）                                                                                                                        | 0.12.0           | 提供元の項目 `jp.dataVersion`・`england.confirmedThrough` など                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `HolidaySourceOptions.holidays`・`HolidaySourceOptions.outOfRange`・`HolidaySourceOptions.unconfirmedHolidays`（営業日カレンダー・スケジュールの設定）                                                                  | 0.30.0           | `holidays` → `holidayProvider`、`outOfRange` → `outOfRangePolicy`、`unconfirmedHolidays` → `unconfirmedHolidayPolicy`                                                                                                                                                                                                                                                                                                                                                                                                               |
| `CalendarOptions.closedAnnual`・`CalendarOptions.closedRecurring`・`CalendarOptions.openRecurring`・`CalendarOptions.maxSearchDays`                                                                                     | 0.30.0           | `closedAnnual` → `closedAnnualDates`、`closedRecurring` → `closedRecurringRules`、`openRecurring` → `openRecurringRules`、`maxSearchDays` → `searchDayLimit`                                                                                                                                                                                                                                                                                                                                                                        |
| `ScheduleOptions.holiday`・`ScheduleOptions.recurring`・`ScheduleOptions.annual`                                                                                                                                        | 0.30.0           | `holiday` → `holidayPolicy`、`recurring` → `recurringRules`、`annual` → `annualDates`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `RecurringRule.onHolidayRule`・`ScheduleRecurringRule.onHolidayRule`                                                                                                                                                    | 0.30.0           | どちらも `onHolidayRule` → `holidayOverlapPolicy`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CombineCalendarsOptions.maxSearchDays`・`CalendarFromScheduleOptions.maxSearchDays`                                                                                                                                    | 0.30.0           | どちらも `maxSearchDays` → `searchDayLimit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `WithSubstituteDaysOptions.name`・`WithSubstituteDaysOptions.original`                                                                                                                                                  | 0.30.0           | `name` → `renameSubstitute`、`original` → `originalPolicy`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `DayInfo.businessDay`・`DayInfo.rulePath`・`ScheduleDayInfo.rulePath`                                                                                                                                                   | 0.30.0           | `businessDay` → `open`、`rulePath` → `optionPath`（2 つの型とも）                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `HolidayLookup.outOfRange`・`HolidayLookup.unconfirmedHolidays`・`HolidayLookup.getHoliday`                                                                                                                             | 0.30.0           | `outOfRange` → `outOfRangePolicy`、`unconfirmedHolidays` → `unconfirmedHolidayPolicy`、`getHoliday` → `holidayOn`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Calendar.dayInfo`・`Calendar.businessDaysBetween`・`Calendar.listBusinessDays`・`Schedule.dayInfo`                                                                                                                     | 0.30.0           | `dayInfo` → `dayInfoOn`（2 つの型とも）、`businessDaysBetween` → `diffBusinessDays`、`listBusinessDays` → `businessDatesBetween`                                                                                                                                                                                                                                                                                                                                                                                                    |
| `BusinessDayOptions`・`CombineOptions`・`HolidayValueRule`・`OnHolidayRule`・`RecurringValue`・`AnnualValue`・`AnnualRangeValue`・`DateValue`・`DateRangeValue`・`ScheduleDay`・`ScheduleReason`・`KnownScheduleReason` | 0.30.0           | `BusinessDayOptions` → `BusinessDayOnOrAfterOptions`、`CombineOptions` → `CombineCalendarsOptions`、`HolidayValueRule` → `ScheduleHolidayPolicy`、`OnHolidayRule` → `HolidayOverlapPolicy`、`RecurringValue` → `ScheduleRecurringRule`、`AnnualValue` → `ScheduleAnnualDate`、`AnnualRangeValue` → `ScheduleAnnualRange`、`DateValue` → `ScheduleSpecificDate`、`DateRangeValue` → `ScheduleDateRange`、`ScheduleDay` → `ScheduleDayInfo`、`ScheduleReason` → `ScheduleDayReason`、`KnownScheduleReason` → `KnownScheduleDayReason` |
| `getHoliday`・`JapaneseHoliday`・`JapaneseHolidayKind`・`KnownJapaneseHolidayKind`・`KnownJapaneseHolidayKey`（`bizdays-toolkit/jp`）                                                                                   | 0.30.0           | `getHoliday` → `holidayOn`、`JapaneseHoliday` → `JpHoliday`、`JapaneseHolidayKind` → `JpHolidayKind`、`KnownJapaneseHolidayKind` → `KnownJpHolidayKind`、`KnownJapaneseHolidayKey` → `KnownJpHolidayKey`                                                                                                                                                                                                                                                                                                                            |
| `substituteDays`・`daysInMonth`・`SubstituteDaysOptions`（`bizdays-toolkit/provider`）                                                                                                                                  | 0.30.0           | `substituteDays` → `withSubstituteDays`、`daysInMonth` → `lengthOfMonth`、`SubstituteDaysOptions` → `WithSubstituteDaysOptions`                                                                                                                                                                                                                                                                                                                                                                                                     |

次の旧名は型にはなく、実行時だけ 1.0.0 まで受け付けます: スケジュールの `weekly`（→ `weekdayValues`）、規則の `day`（→ `dayOfMonth`）、合成の `businessDay`（→ `open`）、期日の `day`（→ `dayOfMonth`）、振替の `rules`（→ `directions`）、値では、スケジュールの `holidayPolicy` の `"weekday"`（→ `"ignore"`）と日本の祝日を使う設定の `kinds` の `"national"`（→ `"regular"`）。

## 0.30.0

0.30.0 は、公開する名前を 1 つの規則（`etc/naming.md`。decisions.md の 54 番）に合わせて改めた版です。0.23.0〜0.29.0 は欠番です。旧名は 1.0.0 まで実行時に受け付けます。ただし、次の 4 つは 0.30.0 に上げた時点で対応が要ります: 返す値の変更（下の「返す値」）、対応年の端の挙動（「対応年の端で隣の日を見る規則」）、TypeScript で必須のキーの旧名（「設定のキーと値」の 2 つ目の箇条）、`dayInfoOn` の結果を丸ごと比べるテスト（「関数・メソッド・型・返す項目」の表の下）。それ以外の旧名は、TypeScript の取り消し線と診断の `deprecated-option` が書き換え先を示します。保存した設定（JSON など）は `migrateCalendarOptions`・`migrateScheduleOptions`（`bizdays-toolkit/diagnose`）で書き換えられます。

### 設定のキーと値

| 場所                                      | 旧名                                                                | 新しい名前                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 営業日カレンダー・スケジュール            | `holidays`・`outOfRange`・`unconfirmedHolidays`                     | `holidayProvider`・`outOfRangePolicy`・`unconfirmedHolidayPolicy`                   |
| 営業日カレンダー                          | `closedAnnual`・`closedRecurring`・`openRecurring`・`maxSearchDays` | `closedAnnualDates`・`closedRecurringRules`・`openRecurringRules`・`searchDayLimit` |
| スケジュール                              | `weekly`・`holiday`・`annual`・`recurring`                          | `weekdayValues`・`holidayPolicy`・`annualDates`・`recurringRules`                   |
| スケジュールの `holidayPolicy` の値       | `"weekday"`                                                         | `"ignore"`                                                                          |
| 繰り返しの規則                            | `day`・`onHolidayRule`                                              | `dayOfMonth`・`holidayOverlapPolicy`                                                |
| 日本の祝日を使う設定の規則の `kinds` の値 | `"national"`                                                        | `"regular"`                                                                         |
| `combineCalendars`                        | `businessDay`・`maxSearchDays`                                      | `open`・`searchDayLimit`                                                            |
| `createCalendarFromSchedule`              | `maxSearchDays`                                                     | `searchDayLimit`                                                                    |
| `dueDate`                                 | `day`                                                               | `dayOfMonth`                                                                        |
| `withSubstituteDays`                      | `rules`・`name`・`original`                                         | `directions`・`renameSubstitute`・`originalPolicy`                                  |

- 旧名と新しい名前の両方を書くと `invalid-option` です（どちらを使うか読み取れないため）
- TypeScript の型が旧名を持つのは、省略可能なキーだけです。必須のキー（スケジュールの `weekly`・合成の `businessDay`・期日の `day`・振替の `rules`）と規則の `day` は、型では新しい名前に書き換える必要があります（実行時は受け付けます）。旧名の `onHolidayRule` に `skipWeekdays` を組み合わせた規則も同じです（`skipWeekdays` は `holidayOverlapPolicy: "after-holiday"` とだけ書けるため）
- `kinds` の `"national"` を読み替えるのは、ID が `"JP"` の提供元（包んだ `jp` を含む）を使う設定だけです

### 関数・メソッド・型・返す項目

| 旧名                                                                                            | 新しい名前                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `businessDaysBetween`（from 以上 to 未満の営業日の数。逆順なら負の値）                          | `diffBusinessDays`                                                                                                |
| `listBusinessDays`（期間内の営業日の一覧）                                                      | `businessDatesBetween`                                                                                            |
| `dayInfo`・`getHoliday`（カレンダー・スケジュール・`bizdays-toolkit/jp`）                       | `dayInfoOn`・`holidayOn`                                                                                          |
| `daysInMonth`・`substituteDays`（`bizdays-toolkit/provider`）                                   | `lengthOfMonth`・`withSubstituteDays`                                                                             |
| `DayInfo.businessDay`・`DayInfo.rulePath`（スケジュールの `rulePath` も）                       | `open`・`optionPath`                                                                                              |
| `HolidayLookup.outOfRange`・`unconfirmedHolidays`                                               | `outOfRangePolicy`・`unconfirmedHolidayPolicy`                                                                    |
| `JapaneseHoliday`・`JapaneseHolidayKind`・`KnownJapaneseHolidayKind`・`KnownJapaneseHolidayKey` | `JpHoliday`・`JpHolidayKind`・`KnownJpHolidayKind`・`KnownJpHolidayKey`                                           |
| `CombineOptions`・`BusinessDayOptions`・`SubstituteDaysOptions`                                 | `CombineCalendarsOptions`・`BusinessDayOnOrAfterOptions`・`WithSubstituteDaysOptions`                             |
| `HolidayValueRule`・`OnHolidayRule`                                                             | `ScheduleHolidayPolicy`・`HolidayOverlapPolicy`                                                                   |
| `RecurringValue`・`AnnualValue`・`AnnualRangeValue`・`DateValue`・`DateRangeValue`              | `ScheduleRecurringRule`・`ScheduleAnnualDate`・`ScheduleAnnualRange`・`ScheduleSpecificDate`・`ScheduleDateRange` |
| `ScheduleDay`・`ScheduleReason`・`KnownScheduleReason`                                          | `ScheduleDayInfo`・`ScheduleDayReason`・`KnownScheduleDayReason`                                                  |

旧名は `@deprecated` の別名として残り、新しい名前と同じ結果を返します。`DayInfo` などの返す項目は 0.30.x の間、新旧の両方を同じ値で持つので、`dayInfoOn` の結果を `deepEqual` で比べているテストは、期待値に `open` と、`rulePath` があれば `optionPath` を足し、`reason` が `"regular"` なら `"default"`（`createCalendarFromSchedule` のカレンダーでは `"open-weekday"`）に直す必要があります。

### 返す値（移行期間なし）

2 つの値を同時には返せないので、次の値は 0.30.0 で変わります。TypeScript では `KnownDayReason`・`KnownJpHolidayKind`・`KnownErrorCode` から旧値が消えて型エラーになります。JavaScript では `"regular"`・`"national"`・`"invalid-month-day"` を検索してください。

| 変わるもの                                                            | 0.22.x                   | 0.30.0                                                                                                          |
| --------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 営業日カレンダーの `reason`（どの設定にも当たらなかった営業日）       | `"regular"`              | `"default"`                                                                                                     |
| `createCalendarFromSchedule` の `reason`（曜日の値で営業日）          | `"regular"`              | `"open-weekday"`                                                                                                |
| 日本の祝日の `kind`（国民の祝日）                                     | `"national"`             | `"regular"`                                                                                                     |
| エラーコード（毎年の月日 `"MM-DD"` の誤り）                           | `"invalid-month-day"`    | `"invalid-annual-date"`                                                                                         |
| 設定の中の位置（`optionPath`・診断の `path`・例外のメッセージの先頭） | `"closedAnnual[0]"` など | `"closedAnnualDates[0]"` など（旧名で書いた設定でも新しい名前。`deprecated-option` の `path` だけは旧名の位置） |

### 対応年の端で隣の日を見る規則（挙動の変更）

`outOfRangePolicy: "throw"`（既定）のとき、隣の日を見る規則（`dayAfterHoliday`・`dayBeforeHoliday`・`skipWeekdays`・`"after-holiday"` の振替元）が対応年の外の日を見ると、`out-of-range` を投げるようになりました。0.22.x までは外を黙って「祝日でない」とみなしていました。シンガポール（対応年の終わりが毎年動く）の最後の 12 月 31 日の祝前日などが該当します。これまでの結果のままでよければ `outOfRangePolicy: "ignore"` にしてください。

### 型の整理

規則の形ごとに受ける項目を型で分けました（実行時の検証はこれまでどおり）。0.22.x では型が通って実行時に `invalid-option` になっていた次の書き方が、型エラーになります: 祝日・祝日の前後の規則の `holidayOverlapPolicy`、周期・第 n 営業日の `"after-holiday"`、`"after-holiday"` のない `skipWeekdays`、カレンダーの第 n 営業日の規則の `calendar`。スケジュールの第 n 営業日の規則は、型でも `calendar` が必須です。この型の約束は新しい名前についてのもので、旧名の `onHolidayRule` は形を問わず受けます（1.0.0 で削除）。

### 新しい機能

- 週の第 n 営業日の規則 `{ businessDayOfWeek, weekStart }`（ガイドの「繰り返しの規則」）
- `migrateCalendarOptions`・`migrateScheduleOptions`（ガイドの「設定の診断」）

## 0.22.0

動作が変わる既存の API はありません（日単位の周期の規則 `{ cycle, anchor, positions }`、祝日の翌日・祝前日の `kinds`・`keys`・`skipWeekdays` の追加。提供元向けの関数と祝日の識別子の型を `@public` にした）。

| 変更                                                                                    | 対応                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 年ごとに `closedDates` で列挙していた交替制の休日・点検日                               | 任意: `{ cycle, anchor, positions }` に書き換えると年ごとの更新が要らなくなる。判定の段階が個別の日付（ガイドの[営業日カレンダー](./guide.ja.md#営業日カレンダー)の優先順位の 2 番目）から繰り返しの規則（6 番目）に移るので、`holidayPolicy: "open"` なら `onHolidayRule: "over-holiday"` を付ける（付けないと、祝日に当たった休みが営業日になる）。`openRecurring` の規則と重なる日は営業日になる（祝日では、その `openRecurring` の規則も `"over-holiday"` の場合だけ）。書き換えの前後で `daysBetween` の結果を比べる |
| 年ごとに列挙していた「旧正月の前日」「月曜日の祝日の前の金曜日」                        | 任意: `{ dayBeforeHoliday: true, keys: [...] }`・`{ dayBeforeHoliday: true, skipWeekdays: [0, 6] }`。`closedDates` から書き換える場合は判定の段階が 6 番目に移るので、`openRecurring` の規則と重なる日は営業日になる（祝前日は祝日でない日なので、祝日での順番の違いは関係しない）                                                                                                                                                                                                                                        |
| 祝日の翌日・祝前日の規則に `kinds`・`keys`・`skipWeekdays` を付けて例外を確かめるテスト | 例外にならなくなる。テストを書き換える                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| エラーの `message` の文字列で分岐しているコード                                         | 形の数の誤りの文に `"cycle"` が増える。`code`・`path` で分岐していれば変更不要                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 0.21.0

動作が変わる既存の API はありません（英国の 4 つの提供元の対応年を 1974 年まで広げた）。

| 変更                                                                  | 対応                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 英国の `supportedYears.from` が 2012 → 1974                           | 1974〜2011 年の日付が `out-of-range` にならず結果を返す。`outOfRange: "ignore"` でその年を「祝日なし」として扱っていたなら、祝日が付くようになる |
| 1974〜2011 年の振替日の名称・`key` が今の GOV.UK の流儀と違う年がある | `keys` でその年の 12 月 27・28 日や Scotland の 1 月 3・4 日を指す場合は、ガイドの英国の節の説明を参照                                           |

## 0.20.0

動作が変わる既存の API はありません（フランスの祝日の提供元 `bizdays-toolkit/fr` の追加）。

| 変更                                   | 対応                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| サブパス `bizdays-toolkit/fr` が増える | 使う場合だけ `import { metropole, alsaceMoselle } from "bizdays-toolkit/fr"`。既存のコードは変更不要 |

## 0.19.0

動作が変わる既存の API はありません（月の第 n 営業日の規則 `businessDayOfMonth`、振替で曜日も飛ばす `skipWeekdays`、診断コード `counting-basis` の追加）。

| 変更                                                                      | 対応                                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 年ごとに `closedDates` で列挙していた「月末最終営業日」「第 n 営業日」    | 任意: `{ businessDayOfMonth: -1 }` などに書き換えると年ごとの更新が要らなくなる                     |
| 年ごとに `closedDates` で列挙していた「創立記念日（土日祝なら翌営業日）」 | 任意: `{ day: 15, months: [6], onHolidayRule: "after-holiday", skipWeekdays: [0, 6] }` に書き換える |
| 診断のコードで分岐しているコード                                          | `counting-basis`（info）が増える。「その他」を扱う分岐なら変更不要                                  |

```ts
const branch = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedRecurring: [
    { businessDayOfMonth: -1, name: "月末最終営業日は来店予約を停止" },
    {
      day: 15,
      months: [6],
      name: "創立記念日",
      onHolidayRule: "after-holiday",
      skipWeekdays: [0, 6],
    },
  ],
});
```

## 0.18.0

動作が変わる既存の API はありません（祝日の識別子 `key` と規則の `keys`、`bizdays-toolkit/provider` の `substituteDays` の追加）。

| 変更                                                                                     | 対応                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同梱の提供元が返す祝日（`holidaysInYear`・`dayInfo` の `holiday` など）に `key` が加わる | `deepEqual` で祝日のオブジェクトを比べているテストは期待値に `key` を足す（国民の休日・臨時の祝日には付かない）。`name` や `kind` で分岐しているコードは変えなくてよい |
| 年ごとに `dates` で列挙していた「特定の祝日だけの例外」                                  | 任意: `{ holiday: true, keys: [...] }` に書き換えると年ごとの更新が要らなくなる（下の例）                                                                              |

```ts
// 祝日は定休だが、春分の日・秋分の日だけは営業（これまでは年ごとに openDates に列挙していた）
const florist = createCalendar({
  holidays: jp,
  openRecurring: [{ holiday: true, keys: ["vernal-equinox", "autumnal-equinox"] }],
});
```

## 0.17.0

動作が変わる既存の API はありません（未確定の祝日のガード `unconfirmedHolidays`、診断の第 2 引数 `asOf`、サブパス `bizdays-toolkit/sg` の追加）。

| 変更                                                                                | 対応                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Calendar`・`Schedule`・`HolidayLookup` に項目 `unconfirmedHolidays` が加わる       | 自前で `Calendar` の形のオブジェクトを作っている場合（モックなど）は項目を足す。`dayInfo` の結果は変わらない |
| 監視のワークフロー `govuk-watch.yml` が `data-watch.yml` になる（リポジトリの運用） | cron-job.org のジョブの URL を `…/actions/workflows/data-watch.yml/dispatches` に直す（RELEASING.md）        |

```ts
// 予測の祝日に依存した結果を出したくない計算では
const strict = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  unconfirmedHolidays: "throw",
});
```

## 0.16.0

日時の文字列の区切りが 1 点変わります。ほかは動作が変わりません（祝前日の規則 `dayBeforeHoliday`、サブパス `bizdays-toolkit/provider`、合成の `dayInfo` の `decidedByPath` の追加）。

| 変更                                                                                                                                                                          | 対応                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 空白で区切った日時の文字列（`"2026-11-23 10:00"`）を渡すと `invalid-time` の Error になる（これまでは実行時だけ受け付けていた。型 `DateTimeInput` は以前から `T` 区切りだけ） | `"2026-11-23T10:00"` のように `T` で区切る（小文字の `t` も可）。`Date` や Temporal の値を渡している呼び出しは変わらない |

```ts
// 0.15.x: 実行時には受け付けていた（型では string | null になっていた）
calendar.civilOf("2026-11-23 10:00");

// 0.16.0 から
calendar.civilOf("2026-11-23T10:00"); // time の型も string になる
```

- 型で守れない入力を実行時だけ通していた不具合として直しました（decisions.md の 43 番）
- 合成した `dayInfo` に `decidedByPath` が加わりました。`dayInfo` の結果を `deepEqual` で比べているテストは期待値に足してください（`decidedBy` は変わりません）

## 0.15.0

`businessDayOnOrAfter` の `cutoff` の扱いが 1 点変わります。ほかは動作が変わりません（規則の絞り込み `weekdays`、営業日を考慮した締め日 `calendar.closingMonth`・`calendar.closingPeriod`、`kinds` の型引数の追加）。

| 変更                                                                                                                                                                                                                                       | 対応                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `businessDayOnOrAfter(input, { cutoff })` で、時刻を持たない `input`（暦日の文字列 `"YYYY-MM-DD"`、Temporal の `PlainDate`）を渡すと `invalid-argument` の Error になる（これまでは暦日を 0 時として扱い、締め時刻が黙って無視されていた） | 締め時刻で判定したい呼び出しには、時刻を持つ入力（`Date`、`"YYYY-MM-DDTHH:mm"`、時刻を持つ Temporal の値）を渡す。暦日だけで判定したい呼び出しは `cutoff` を外す |

```ts
// 0.14.x: 締め時刻は無視され、当日が返っていた
shipping.businessDayOnOrAfter("2026-10-21", { cutoff: "14:00" });

// 0.15.0 から
shipping.businessDayOnOrAfter(new Date(), { cutoff: "14:00" }); // 受付時刻で判定する
shipping.businessDayOnOrAfter("2026-10-21"); // 暦日だけで判定する
```

- 注文の受付時刻を `Date` で渡すつもりが、フォームの日付文字列をそのまま渡してしまう事故を、出荷が間に合わなかったあとではなく呼び出した時点で分かるようにするためです（decisions.md の 42 番）
- `RecurringRule` などに既定値付きの型引数 `Kind` が加わりました。型引数なしの `RecurringRule` は `RecurringRule<string>` と同じで、既存のコードは変わりません

## 0.14.0

作業は要りません（`closingPeriod` と、`toInstant`・`instantOf` の追加。どちらも新しい関数・メソッドで、既存の動作は変わりません）。

- 営業日カレンダー・スケジュール（`HolidayLookup`）に `instantOf` が加わりました。読む側には影響しません

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
