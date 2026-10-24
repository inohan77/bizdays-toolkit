# bizdays-toolkit ガイド

<p><a href="./guide.md">English</a> | <b>日本語</b></p>

bizdays-toolkit の詳しい使い方です。同梱の祝日の提供元・営業日カレンダー・繰り返しの規則・月の期日・スケジュール・入力・エラー・設定の診断を扱います。短い説明は [README](./README.ja.md) に、他の国・地域の祝日の提供元を書く方法は [providers.ja.md](./providers.ja.md) にあります。このガイドのコード例はすべて CI で実行し、コメントの結果と比べています。

- [同梱の祝日の提供元](#同梱の祝日の提供元)
- [営業日カレンダー](#営業日カレンダー)
- [繰り返しの規則](#繰り返しの規則)
- [カレンダーの合成](#カレンダーの合成)
- [よくある設定の例](#よくある設定の例)
- [月の期日と日付の調整](#月の期日と日付の調整)
- [日ごとの値（営業時間など）](#日ごとの値（営業時間など）)
- [スケジュールから営業日カレンダーを作る](#スケジュールから営業日カレンダーを作る)
- [日付・日時の入力](#日付・日時の入力)
- [対応年の外](#対応年の外)
- [未確定の祝日](#未確定の祝日)
- [エラー](#エラー)
- [設定の診断](#設定の診断)

## 同梱の祝日の提供元

### 日本の祝日

```ts
import { getHoliday, holidaysInYear, isHoliday } from "bizdays-toolkit/jp";

isHoliday("2026-11-23"); // true
getHoliday("2026-09-22");
// { date: "2026-09-22", name: "国民の休日", nameEn: "Citizens' Holiday", kind: "citizens", confirmed: true }
holidaysInYear(2027);

// 瞬間（Date）は日本時間で判定する
isHoliday(new Date("2026-11-22T15:30:00Z")); // true（日本時間では 11/23）
```

`kind` は `national`（国民の祝日）・`substitute`（振替休日）・`citizens`（国民の休日）・`special`（皇室行事などによる休日）のいずれかです。

`confirmed` は、その日付が公式に確定しているかを表します。春分・秋分の日は前年 2 月の官報で確定するため、それより先の年は近似式による予測（`confirmed: false`）です。

### 英国の bank holidays

```ts
import { createCalendar } from "bizdays-toolkit";
import { england, northernIreland, scotland, wales } from "bizdays-toolkit/uk";

const edinburgh = createCalendar({ holidays: scotland, closedWeekdays: [0, 6] });
edinburgh.isBusinessDay("2026-01-02"); // false（2nd January）
edinburgh.addBusinessDays("2026-06-12", 1); // "2026-06-16"（6/15 は World Cup bank holiday）

scotland.holidaysInYear(2026)[0];
// { date: "2026-01-01", name: "New Year’s Day", nameEn: "New Year’s Day", kind: "regular", confirmed: true }
wales.holidaysInYear(2026)[0]?.names; // { cy: "Dydd Calan" }

// 複数の地域にまたがる場合は和集合（いずれかの地域の祝日を祝日とする）
const ukWide = createCalendar({ holidays: [england, scotland, northernIreland] });
```

| 提供元            | ID       | GOV.UK の区分     | 備考                                       |
| ----------------- | -------- | ----------------- | ------------------------------------------ |
| `england`         | `GB-ENG` | England and Wales |                                            |
| `wales`           | `GB-WLS` | England and Wales | ウェールズ語の名称（`names.cy`）が付く     |
| `scotland`        | `GB-SCT` | Scotland          | 2nd January・St Andrew’s Day など          |
| `northernIreland` | `GB-NIR` | Northern Ireland  | St Patrick’s Day・Battle of the Boyne など |

- `kind` は `regular`（毎年の祝日。布告で日付が移動した年を含む）・`substitute`（土曜日・日曜日に当たった祝日の振替）・`special`（記念式典・国葬などの布告による臨時の祝日）のいずれかです。振替の `name` は元の祝日の名称です（GOV.UK と同じ）
- England と Wales は GOV.UK では 1 つの区分で、日付は現在同じですが、別の提供元にしています。将来分かれても、コードを変えずに済みます
- 対応年は 2012〜2099 年です。GOV.UK が日付を公表している年（`confirmedThrough`、現在は 2028 年）より後は、規則による予測（`confirmed: false`）です。臨時の祝日は発表されるまで分からないため、予測の年には含まれません
- Scotland の地域（council）ごとの休日は含みません。また、bank holiday に休むかどうかは雇用契約などによります
- 臨時の祝日は 10 日ほど前に発表されることがあります。GOV.UK との差分を毎日監視し、見つけたらパッチ版で反映します

### シンガポールの祝日

```ts
import { createCalendar } from "bizdays-toolkit";
import { sg } from "bizdays-toolkit/sg";

const singapore = createCalendar({ holidays: sg, closedWeekdays: [0, 6] });
singapore.isBusinessDay("2026-08-10"); // false（National Day が日曜日に当たり、翌月曜日が振替）
singapore.addBusinessDays("2026-02-16", 1); // "2026-02-19"（2 月 17・18 日は旧正月）
sg.holidaysInYear(2026).find((h) => h.kind === "substitute");
// { date: "2026-06-01", name: "Vesak Day", nameEn: "Vesak Day", kind: "substitute", confirmed: true }
```

- 提供元は `sg`（ID `SG`、タイムゾーン `Asia/Singapore`）の 1 つで、地域ごとの祝日はありません。`kind` は `regular`（毎年の祝日）・`substitute`（日曜日に当たった祝日の翌日。Holidays Act により祝日になり、名称は元の祝日と同じ）・`special`（政府が告示する臨時の祝日。Polling Day など）です。土曜日に当たった祝日は振り替えません
- 旧正月・Hari Raya Puasa・Hari Raya Haji・Vesak Day・Deepavali は太陰暦・イスラム暦・ヒンドゥー暦で決まるため、規則では計算できません。日付は MOM（Ministry of Manpower）が年ごとに告示したもので、振替は Holidays Act の規則で計算します。対応年は MOM が告示した年（現在は 2020〜2027 年。`confirmedThrough` は対応年の最後の年と同じ）で、それより後の年は予測せず対応年の外（`out-of-range`）です。`sg` が `confirmed: false` を返すことはありません
- 日付は data.gov.sg の「Singapore Public Holidays」コレクション（MOM）と照合しています。そのデータが告示と食い違う箇所（2022 年の Hari Raya の改定後の日付と、振替 2 日の欠落）は告示に従います。data.gov.sg との差分を毎日監視し、見つけたらパッチ版で反映します

## 営業日カレンダー

```ts
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const shipping = createCalendar({
  holidays: jp,
  closedWeekdays: [0], // 日曜日（0 = 日曜 … 6 = 土曜）
  closedAnnual: [{ from: "12-31", to: "01-03", name: "年末年始" }],
  closedDates: [{ from: "2027-08-12", to: "2027-08-16", name: "夏季休業" }],
  openDates: ["2026-12-27"], // 臨時営業日
  holidayPolicy: "closed", // 祝日は休み（"open": 営業 / "ignore": 判定に使わない）
});

shipping.isBusinessDay("2026-11-23"); // false（勤労感謝の日）
shipping.addBusinessDays("2026-12-30", 1); // "2027-01-04"
shipping.businessDaysBetween("2026-09-01", "2026-10-01"); // from 以上 to 未満の営業日数

// 14 時より前の注文は当日、それ以降は翌営業日に出荷
shipping.businessDayOnOrAfter(new Date(), { cutoff: "14:00" }); // 入力は時刻を持つもの

shipping.dayInfo("2027-01-01");
// { date: "2027-01-01", weekday: 5, businessDay: false, reason: "closed-annual", name: "年末年始", holiday: {…}, rulePath: "closedAnnual[0]" }
shipping.daysBetween("2026-12-30", "2027-01-04").map((d) => d.businessDay); // [true, false, false, false, false, true]
```

`daysBetween(from, to)` は、期間のすべての日の `dayInfo` を返します（両端を含む）。 `listBusinessDays`・`holidaysBetween` も両端を含みます。`businessDaysBetween(from, to)` だけは `from` 以上 `to` 未満の営業日の数で、`businessDaysBetween(a, b) + businessDaysBetween(b, c)` が `businessDaysBetween(a, c)` と等しくなり、`a` が営業日なら `businessDaysBetween(a, addBusinessDays(a, n))` が `n` になります（`addBusinessDays` の逆算）。起点が休業日のときは、`addBusinessDays` は翌営業日を 1 と数える（`n = 0` は `businessDayOnOrAfter` と同じなので `+0` と `+1` が同じ日）一方、`businessDaysBetween` は休業日の起点を数えないので、1 だけずれます。

`createCalendar`・`createSchedule` は作る時点で設定を検証するので、作ったものを使い回すのが基本です。作成も軽く（開発用の機械で、日本の祝日を使う営業日カレンダーが約 0.02 ミリ秒、スケジュールが約 0.04 ミリ秒）、呼び出しのたびに作っても実用上の問題はありません。

1 日の判定は次の優先順位で行います（上が優先）。

1. `openDates`（臨時営業日）
2. `closedDates`（臨時休業日）
3. `closedAnnual`（毎年の休業日）
4. `openRecurring`・`closedRecurring` のうち `onHolidayRule: "over-holiday"` の規則（祝日でも当てはめる）と、祝日の規則（`{ holiday: true }`）
5. 祝日（`holidayPolicy` に従う。`"open"` は定休日の曜日より優先して営業日にする）
6. `openRecurring`・`closedRecurring`（既定の `"under-holiday"` と、`"after-holiday"` の振替先）
7. `closedWeekdays`（定休日の曜日）
8. それ以外は営業日

この順番は固定です。繰り返しの規則と祝日の関係だけは、規則ごとに `onHolidayRule` で選べます（次の節）。

## 繰り返しの規則

「第 3 水曜定休」「第 2・第 4 土曜休業」「隔週水曜定休」「毎月末日は棚卸」「月曜休館（祝日の場合は翌平日）」「振替休日は営業」「祝日の翌日は休館」「祝前日は夜間営業」のような繰り返しの休業日・営業日は、`closedRecurring`・`openRecurring` で指定します。

```ts
const museum = createCalendar({
  holidays: jp,
  holidayPolicy: "open", // 祝日は開館
  closedRecurring: [
    { weekday: 1, name: "月曜休館", onHolidayRule: "after-holiday" }, // 祝日の場合は翌平日に休館
    { weekday: 3, nth: 3, months: [2, 8], name: "2 月・8 月の第 3 水曜は臨時休館" },
    { day: -1, name: "月末棚卸", onHolidayRule: "over-holiday" }, // 祝日でも休館
    { dayAfterHoliday: true, name: "祝日の翌日休館" },
  ],
});

museum.isBusinessDay("2026-10-12"); // true（スポーツの日の月曜は開館）
museum.dayInfo("2026-10-13");
// { date: "2026-10-13", weekday: 2, businessDay: false, reason: "closed-recurring",
//   name: "月曜休館", shiftedFrom: "2026-10-12", rulePath: "closedRecurring[0]" }
museum.dayInfo("2026-02-12").name; // "祝日の翌日休館"（2 月 11 日は建国記念の日）
museum.isBusinessDay("2026-05-07"); // false（5 月 3〜6 日の連休の翌日）
```

| 書き方                                              | 意味                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `{ weekday: 1 }`                                    | 毎週月曜日                                                                                   |
| `{ weekday: 3, nth: 3 }`                            | 第 3 水曜日。`nth` は 1〜5 と -1（最終）。`[2, 4]` のように配列で複数指定できる              |
| `{ weekday: 3, interval: 2, anchor: "2026-01-07" }` | 隔週水曜日。`anchor` から偶数週の水曜日（周期は 2 週以上。下記）                             |
| `{ day: 20 }`                                       | 毎月 20 日。`day` は 1〜31 と -1（末日）。配列で複数指定できる                               |
| `{ holiday: true, kinds: ["substitute"] }`          | 祝日。`kinds` でその種別（`Holiday.kind`）に絞れる。`holidayPolicy` より先に判定する（下記） |
| `{ dayAfterHoliday: true }`                         | 祝日の翌日。祝日（連休なら連休）が明けた最初の祝日でない日（提供元の祝日だけで判定）         |
| `{ dayBeforeHoliday: true }`                        | 祝前日。祝日（連休なら連休）の直前の祝日でない日（提供元の祝日だけで判定）                   |
| `months: [8, 12]`                                   | どの書き方にも付けられる、月の絞り込み                                                       |
| `effectiveFrom: "2027-04-01"`・`effectiveTo: "…"`   | 規則の有効期間（両端を含む）。期間の外では、その規則は書かれていないのと同じになる（下記）   |

- **第 n 何曜日**は「その月で n 回目のその曜日」です（1〜7 日が第 1）。カレンダーの第 n 週の行にある曜日ではありません
- **その月にない日**（`nth: 5` がない月、`day: 31` がない月）は当てはまりません。末日は `day: -1` で指定します
- **隔週**（`interval: 2`）は「第 1・第 3 水曜」（`nth: [1, 3]`）とは別物です。水曜日が 5 回ある月で、後者は 1 週ずれます。`interval` は周期の週数（2 以上の整数）、`anchor` は周期が通る日付（`weekday` と同じ曜日）で、その日と、その日から `interval` 週おきの前後の日に当てはまります。店舗は「1 月 7 日から隔週水曜」のように告知するので、その日付をそのまま書きます。起点より前の日に当てはめず起点から始めるには、`effectiveFrom` を併せて指定します。`interval` は `nth` とは併用できません
- **祝日の規則**（`{ holiday: true }`）は、祝日の既定の扱いの例外を書きます。「2027 年 4 月から祝日も営業」は `holidayPolicy: "closed"` のまま `openRecurring: [{ holiday: true, effectiveFrom: "2027-04-01" }]`、「振替休日と国民の休日は営業」は `openRecurring: [{ holiday: true, kinds: ["substitute", "citizens"] }]`、スケジュールの「5 月の祝日は特別営業時間」は `recurring: [{ holiday: true, months: [5], value: … }]` です。`kinds` はその種別（`Holiday.kind`。種別は提供元の一覧を参照。`holidays: jp` ならエディターで補完が効きます）の祝日に、`weekdays` はその曜日（「土曜の祝日は午前診療」は `{ holiday: true, weekdays: [6], value: … }`）に、`months` はその月に絞り、省略すればすべての祝日です。判定は「祝日の上」の段階で、`holidayPolicy`・スケジュールの `holiday` より先に行い、`holidayPolicy: "ignore"` でも当てはまります。当てはまる日は祝日なので、この規則に `onHolidayRule` は指定できません（`invalid-option`）。`holiday` には祝日がそのまま付きます
- **祝日の翌日**は定義上祝日でないので、その規則に `onHolidayRule` は指定できません（`invalid-option`）。「祝日」は提供元の祝日で、毎年の休業日などは含みません。提供元のない設定では 1 日も当てはまりません。`weekdays` でその曜日に絞れます。美術館の「祝日の翌日は休館（土曜・日曜に当たる場合は開館）」は `{ dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] }` です（代わりに `openRecurring` で土日を開けると、ほかの土日の休館まで打ち消してしまいます）
- **祝前日**（`{ dayBeforeHoliday: true }`）はその鏡像で、翌日が祝日でその日自身は祝日でない日です。連休の前は連休の初日の前日だけが当てはまります（2026 年 5 月なら 5 月 2 日（土）だけで、5 月 4 日・5 日は祝日なので当てはまりません）。扱いは祝日の翌日と同じです（`weekdays`・`months`・有効期間を付けられ、`onHolidayRule` は指定できず、提供元がなければ当てはまりません）。スケジュールの「祝前日料金」、「祝前日は深夜 2 時まで営業」（`weekdays: [1, 2, 3, 4, 5]` で土日に当たる祝前日は通常どおり）、「祝前日は当日出荷の受付を正午まで」（締め時刻をスケジュールの値にして `cutoffs.valueOn(date)` を `cutoff` に渡す）のように書きます
- 繰り返しの規則どうしは配列で先に書いたものが優先で、`openRecurring` は `closedRecurring` より優先です。月曜の勤労感謝の日（2026-11-23）の翌日は、月曜の規則の振替先でもあり祝日の翌日でもあります。先に書いた規則が決め、どちらが決めたかは `dayInfo` で分かります

**有効期間**（`effectiveFrom`・`effectiveTo`）を付けると、規則の変更を 1 つのカレンダーで表しながら、過去の日付の判定も変えずに再現できます。繰り返しの規則と、毎年の休業日（`closedAnnual` のオブジェクトの形）に付けられます。

```ts
const shop = createCalendar({
  holidays: jp,
  closedRecurring: [
    { weekday: 1, name: "月曜定休", effectiveTo: "2027-03-31" },
    { weekday: 2, name: "火曜定休", effectiveFrom: "2027-04-01" },
    { weekday: 3, interval: 2, anchor: "2026-01-07", name: "隔週水曜定休" },
  ],
  closedAnnual: [{ from: "08-13", to: "08-16", name: "夏季休業", effectiveTo: "2026-12-31" }],
});

shop.isBusinessDay("2027-03-29"); // false（変更前の月曜）
shop.isBusinessDay("2027-04-06"); // false（変更後の火曜）
shop.addBusinessDays("2027-03-30", 3); // "2027-04-03"（切り替えをまたいで数える。3 月 31 日は隔週の水曜）
shop.isBusinessDay("2027-08-13"); // true（夏季休業は 2026 年で終了）
```

- 期間の外では規則を当てはめないだけで、判定の優先順位は変わりません。`effectiveFrom`・`effectiveTo` の一方だけなら、もう一方は期限なしです
- `"after-holiday"` の規則は、本来当てはまる日（振替元）で期間を判定します。振替元が期間の中なら、振替先が期間の外でも振り替えます
- 定休日の曜日の変更は、上の例のように期間付きの毎週の規則 2 つで書きます（`closedWeekdays` には期間を付けられません）

**祝日に当たったときの扱い**（`onHolidayRule`）は、規則ごとに選べます。

| 値                        | 意味                                                     | 店舗の告知での書き方                  |
| ------------------------- | -------------------------------------------------------- | ------------------------------------- |
| `"under-holiday"`（既定） | 祝日の下。祝日の扱い（`holidayPolicy`）に従う            | 「第 3 水曜定休（祝日の場合は営業）」 |
| `"over-holiday"`          | 祝日の上。祝日でも当てはめる                             | 「第 3 水曜定休（祝日も休み）」       |
| `"after-holiday"`         | 祝日の後。祝日には当てはめず、祝日でない翌日に振り替える | 「月曜休館（祝日の場合は翌平日）」    |

- `"under-holiday"` の規則は、`holidayPolicy: "ignore"`（祝日を判定に使わない）なら祝日にも当てはまります
- `"after-holiday"` の振替先は「その日以降で最初の祝日でない日」です。祝日が続く場合（GW など）は連休が明けた日になります。振替先の日に臨時営業日・臨時休業日・毎年の休業日があれば、そちらが優先です。振替で決まった日の `dayInfo()` には、振替の元の日付 `shiftedFrom` が付きます
- 振替の判断に使う「祝日」は、祝日の提供元（`jp` など）の祝日だけです（毎年の休業日などは含みません）
- `openDates`・`closedDates`・`closedAnnual`・`openRecurring`・`closedRecurring`（振替先を含む）で決まった日の `dayInfo()` には、その規則の設定の中の位置 `rulePath` が、規則の診断の `path` と同じ形（`"closedRecurring[0]"` など）で付きます。同じ `name` の規則も区別できます。祝日・`closedWeekdays` で決まった日には付きません

スケジュールでは、同じ書き方の規則に `value` を付けて `recurring` に指定します。

```ts
const hours = createSchedule<Hours>({
  holidays: jp,
  weekly: [sunday, weekday, weekday, weekday, weekday, weekday, weekday],
  recurring: [
    { weekday: 1, value: null, name: "月曜休業", onHolidayRule: "after-holiday" },
    { day: -1, value: { open: "10:00", close: "17:00" }, name: "月末は短縮営業" },
    { dayBeforeHoliday: true, value: { open: "10:00", close: "23:00" }, name: "祝前日は夜間営業" },
  ],
});
hours.valueOn("2026-05-02"); // { open: "10:00", close: "23:00" }（5 月 3〜6 日の連休の前日）
hours.dayInfo("2026-05-04").reason; // "weekday"（連休の中の祝日は祝前日ではない）
```

## カレンダーの合成

`combineCalendars` は、複数のカレンダーから 1 つのカレンダーを作ります。**すべて**が営業している日（`businessDay: "all"`）か、**いずれか**が営業している日（`"any"`）を営業日にします。結果は通常のカレンダーなので、営業日の加減算・`adjust`・`dueDate` などが合成結果で動きます。

```ts
import { combineCalendars, createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const company = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedAnnual: [{ from: "12-29", to: "01-03", name: "年末年始休業" }],
});
const bank = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedAnnual: [{ from: "12-31", to: "01-03", name: "銀行休業日" }],
});

// 振込は、自社と銀行の両方が営業している日に処理される
const remittance = combineCalendars([company, bank], { businessDay: "all" });
remittance.addBusinessDays("2026-12-28", 2); // "2027-01-05"
remittance.dayInfo("2026-12-29");
// { date: "2026-12-29", weekday: 2, businessDay: false, reason: "closed-annual", name: "年末年始休業", rulePath: "closedAnnual[0]", decidedBy: 0, decidedByPath: [0] }

// 複数の店舗のどこかが開いている日
const anyStore = combineCalendars([company, bank], { businessDay: "any" });
anyStore.isBusinessDay("2026-12-29"); // true
```

- `dayInfo` の `reason`・`name`・`shiftedFrom`・`rulePath` は、合成結果と同じ判定をした最初のカレンダーの結果で、そのカレンダーの番号（渡した配列の位置）を `decidedBy` で返します（`rulePath` はそのカレンダーの設定の中の位置です）。`"all"` なら、休業日は最初に休みだったカレンダー、営業日は 0 番（すべて営業）です。`"any"` はその逆です
- `decidedByPath` は、判定を決めたカレンダーまでの番号の列（外側から順）です。合成したカレンダーをさらに合成したとき、`rulePath` がどのカレンダーの設定の位置かを結果だけから辿れます。入れ子でない合成では `[0]` のように長さ 1 で `decidedBy` と同じ、入れ子では `[0, 1]`（0 番のカレンダーの中の 1 番）のようになります。`decidedBy` は外側の番号のままです
- `holiday`・`isHoliday`・`holidaysInYear` などは、すべてのカレンダーの祝日の提供元の和集合で判定します。同じ提供元のオブジェクトは 1 つに数え、包んだ提供元（`jp` から一部の種別を除いたものなど）は別の提供元として残り、同じ日付に祝日のある提供元が 2 つあれば、先のカレンダーの提供元の祝日を `holiday` に付けます。そのため、包んだ `jp` のカレンダーと `jp` そのもののカレンダーを合成すると、営業日の判定は変わらないまま、除いたはずの祝日が `holiday` に付きます。`outOfRange` は、どれかのカレンダーが対応年の外で例外になるなら `"throw"` です
- タイムゾーンはすべてのカレンダーで同じでなければなりません（違えば `time-zone-conflict`）。2 つ未満、同じカレンダーを 2 回渡すと `invalid-argument` です。`maxSearchDays`（既定 3660）をオプションで指定できます
- 合成したカレンダーをさらに合成することもできます。設定の診断は設定に対して行うものなので、合成したカレンダーではなく、元のカレンダーの設定をそれぞれ診断してください

設定を結合して 1 つのカレンダーを作る方法では意味が保てません。片方の臨時営業日（`openDates`）がもう片方の休業日より優先されてしまい、片方のカレンダーをもう片方の祝日の提供元として包むと、相手の休業日が「祝日」になります（`isHoliday` が true になり、`holidayPolicy: "open"` でその日に営業してしまいます）。

## よくある設定の例

**国民の休日（祝日に挟まれた日）を営業日として扱う**：祝日の提供元を包んで、種別で除外します。

```ts
import { jp } from "bizdays-toolkit/jp";

const jpWithoutCitizensHoliday = {
  ...jp,
  holidaysInYear: (year: number) => jp.holidaysInYear(year).filter((h) => h.kind !== "citizens"),
};
const calendar = createCalendar({ holidays: jpWithoutCitizensHoliday, closedWeekdays: [0, 6] });
```

**1 つの配列で持っている特別営業日を振り分ける**：年月日（`"YYYY-MM-DD"`）は `dates`、毎年の月日（`"MM-DD"`）は `annual` に渡します。

```ts
type Hours = { open: string; close: string } | null;
const regular: Hours = { open: "10:00", close: "19:00" };
const specialDays: { date: string; value: Hours }[] = [
  { date: "2026-12-31", value: { open: "10:00", close: "17:00" } },
  { date: "01-01", value: null },
];
const special = createSchedule<Hours>({
  weekly: [regular, regular, regular, regular, regular, regular, regular],
  dates: specialDays.filter((d) => d.date.length === 10),
  annual: specialDays.filter((d) => d.date.length === 5),
});
special.valueOn("2027-01-01"); // null
```

**その日が月の第何営業日か**：月初からその日の前日までの営業日数に 1 を足します。`businessDaysBetween` は `to` を含まないので、その日の分が `+ 1` です。`nthBusinessDayOfMonth` の逆算になります。

```ts
import { monthOf } from "bizdays-toolkit";

const calendar = createCalendar({ holidays: jp, closedWeekdays: [0, 6] });
const businessDayIndex = (date: string): number =>
  calendar.isBusinessDay(date) ? calendar.businessDaysBetween(`${monthOf(date)}-01`, date) + 1 : 0;
businessDayIndex("2026-10-07"); // 5（10 月の第 5 営業日）
businessDayIndex("2026-10-03"); // 0（土曜日は営業日でない）
calendar.nthBusinessDayOfMonth("2026-10", 5); // "2026-10-07"
```

**次の休業日と、その理由**：`nextClosedDay` はありませんが、`daysBetween` が毎日の `dayInfo` を返すので、営業日でない最初の日を取ります。

```ts
import { addDays } from "bizdays-toolkit";

const calendar = createCalendar({ holidays: jp, closedWeekdays: [0, 6] });
const nextClosedDay = (date: string) =>
  calendar.daysBetween(addDays(date, 1), addDays(date, 60)).find((d) => !d.businessDay);
nextClosedDay("2026-10-05")?.date; // "2026-10-10"
nextClosedDay("2026-10-05")?.reason; // "closed-weekday"
nextClosedDay("2026-10-11")?.reason; // "holiday"（10 月 12 日のスポーツの日）
```

**銀行の営業日**：銀行は土日・祝日と 12 月 31 日〜1 月 3 日が休みなので、3 行で書けます。振込の着金日は、自社のカレンダーと合成して求めます（「カレンダーの合成」）。

```ts
const bank = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedAnnual: [{ from: "12-31", to: "01-03", name: "銀行休業日" }],
});
bank.isBusinessDay("2026-12-30"); // true
bank.nextBusinessDay("2026-12-30"); // "2027-01-04"
```

**共通の設定から店舗ごとのカレンダーを作る**：設定は普通のオブジェクトなので、展開して足します。

```ts
const base = {
  holidays: jp,
  closedWeekdays: [0],
  closedAnnual: [{ from: "12-31", to: "01-03" }],
} as const;
const shibuya = createCalendar({ ...base, openDates: ["2026-12-27"] });
const yokohama = createCalendar({ ...base, closedRecurring: [{ weekday: 3, nth: 3 }] });
```

## 月の期日と日付の調整

休業日に当たった日付を、指定した方法で営業日に調整します。月の第 n 営業日や、「毎月 n 日（休業日なら翌営業日）」のような期日も求められます。

```ts
import { closingMonth, createCalendar, monthOf } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const calendar = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedAnnual: [{ from: "12-31", to: "01-03", name: "年末年始" }],
});

calendar.adjust("2026-10-31", { convention: "following" }); // "2026-11-02"（10/31 は土曜日）
calendar.adjust("2026-10-31", { convention: "modified-following" }); // "2026-10-30"（月が変わるので前へ）

calendar.firstBusinessDayOfMonth("2027-01"); // "2027-01-04"
calendar.lastBusinessDayOfMonth("2026-12"); // "2026-12-30"
calendar.nthBusinessDayOfMonth("2026-10", 5); // "2026-10-07"（-1 は最終、-2 は最後から 2 番目）

// 毎月 10 日払い（休業日なら翌営業日）
calendar.dueDate("2026-10", { day: 10, convention: "following" }); // "2026-10-13"（12 日はスポーツの日）

// 20 日締め・翌月末払い（休業日なら前営業日）
const billing = closingMonth("2026-10-21", 20); // "2026-11"（10/21〜11/20 が 11 月分）
calendar.dueDate(monthOf(billing, 1), { day: -1, convention: "preceding" }); // "2026-12-30"
```

**調整の方法**（`convention`、必須）

| 方法                   | 休業日のとき                           |
| ---------------------- | -------------------------------------- |
| `"following"`          | 翌営業日                               |
| `"preceding"`          | 前営業日                               |
| `"modified-following"` | 翌営業日。ただし月が変わるなら前営業日 |
| `"modified-preceding"` | 前営業日。ただし月が変わるなら翌営業日 |

- 営業日ならどの方法でもその日のままです
- 月が変わるかは、**調整する前の日付の月**と比べます。`dueDate` では、末日に読み替えた後の日付の月です（例: 2 月の 31 日払いは 2 月末日を基準にし、`"modified-following"` なら 2 月の中で調整します）
- `modified-…` で、同じ月に反対向きの営業日もない（その月が全部休業日）ときは、月が変わっても元の向きに調整します
- 「最も近い営業日」（nearest）はありません。前後が同じ距離のときの決め方が業種ごとに違うためです

**月の計算**（ルートの関数。営業日は考えません）

- `monthOf(dateOrMonth, offset?)`: 日付または月 `"YYYY-MM"` の、`offset` か月後（負なら前）の月
- `closingMonth(date, closingDay)`: 締め日（1〜31、`-1` は末日）で区切ったときに日付が属する月。締め日の翌日から次の締め日までを、次の締め日の月とします。締め日がその月にない日（31 日締めの 2 月など）は末日締めです
- `closingPeriod(monthOrDate, closingDay)`: その逆算で、その月分の期間 `{ from, to }`（両端を含む。前月の締め日の翌日から締め日まで）。暦日を渡すと、その日が属する期間です。日付の期間の形なので、`closedDates` や `listBusinessDays` にそのまま渡せます

```ts
closingPeriod("2026-11", 20); // { from: "2026-10-21", to: "2026-11-20" }
closingPeriod("2026-03", 31); // { from: "2026-03-01", to: "2026-03-31" }（2 月の 31 日締めは 28 日締め）
const { from, to } = closingPeriod("2026-11-05", 20); // "2026-11-05" が属する期間
const office = createCalendar({ holidays: jp, closedWeekdays: [0, 6] });
office.listBusinessDays(from, to).length; // 22（11 月分の営業日数）
```

**営業日に動く締め日**: 「20 日締め、締め日が休業日なら前営業日締め」のような契約は、カレンダーの `closingMonth(date, closingDay, { convention })`・`closingPeriod(monthOrDate, closingDay, { convention })` で扱います。各月の締め日（その月にない日は末日）を `adjust` と同じ `convention`（必須、既定値なし）で営業日に調整し、日付は「調整後の締め日がその日以降になる最初の月」に属します。ルートの関数は暦日のまま区切ります。

```ts
const office = createCalendar({ holidays: jp, closedWeekdays: [0, 6] });
// 締め日の 2026-09-20 は日曜。"preceding" なら 9 月の締め日は金曜の 18 日
office.closingMonth("2026-09-19", 20, { convention: "preceding" }); // "2026-10"（19 日は 9 月の締めのあと）
closingMonth("2026-09-19", 20); // "2026-09"（暦日の締め）
office.closingPeriod("2026-10", 20, { convention: "preceding" }); // { from: "2026-09-19", to: "2026-10-20" }
```

前月の締め日から当月の締め日までに営業日が 1 日もない月（改装などの長期休業）は、固有の期間を持ちません。その日は次の月に属し、`closingMonth` はその月を返さず、その月の `closingPeriod` は `no-business-day` を投げます。`"following"` では締め日が長期休業を越えて後の月に動くことがあり、そのときは期間が空になるのではなく長くなります。

`dueDate` の `day` も、その月にない日（2 月 30 日など）は末日に読み替えます。繰り返しの規則（`{ day: 31 }`）はその月にない日に当てはまらないので、扱いが異なります。期日は「その月のどこか」に必ず決まる必要があるためです。

## 日ごとの値（営業時間など）

`createSchedule` は、曜日・祝日・特定日の規則から、日ごとに任意の値を返します。値の型は自由なので、営業時間のほか、受付枠や配送料の区分などにも使えます。

```ts
import { createSchedule } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

type Hours = { open: string; close: string } | null; // null は休業
const weekday = { open: "10:00", close: "21:00" };
const sunday = { open: "10:00", close: "19:00" };

const storeHours = createSchedule<Hours>({
  holidays: jp,
  weekly: [sunday, weekday, null, weekday, weekday, weekday, weekday], // [日, 月, …, 土]。火曜定休
  holiday: { sameAs: 0 }, // 祝日は日曜の値（"weekday": 曜日どおり / { value: … }: 指定の値）
  annual: [{ date: "01-01", value: null, name: "元日休業" }], // 毎年の月日（期間も可）
  dates: [{ date: "2026-12-31", value: { open: "10:00", close: "17:00" }, name: "大晦日" }],
});

storeHours.valueOn("2026-11-03"); // { open: "10:00", close: "19:00" }（文化の日は日曜の営業時間）
storeHours.dayInfo("2027-01-01");
// { date: "2027-01-01", weekday: 5, value: null, reason: "annual", name: "元日休業", holiday: {…}, rulePath: "annual[0]" }

// 期間の祝日と営業時間: daysBetween を holiday で絞る
storeHours
  .daysBetween("2026-11-01", "2026-11-30")
  .filter((d) => d.holiday)
  .map((d) => d.date); // ["2026-11-03", "2026-11-23"]

// 個別の日付・毎年の月日で値を決めた日を除く祝日（元日は毎年の月日の規則で休業）
storeHours
  .daysBetween("2026-12-28", "2027-01-11")
  .filter((d) => d.holiday && d.reason !== "date" && d.reason !== "annual")
  .map((d) => d.date); // ["2027-01-11"]
```

`reason` は値を決めた規則で、`rulePath`（`dates`・`annual`・`recurring`）はその設定の中の位置です。`holiday: "weekday"`（祝日も曜日どおり）のときは、祝日でも `reason` は `"weekday"` になるので、祝日かどうかは `holiday` の有無で判定します。`holiday` だけで絞ると、`dates`・`annual` で値を決めた祝日（元日の特別営業など）も含まれます。祝日の扱いに従う祝日だけを一覧にする場合は、最後の例のように、`reason` が `"date"`・`"annual"` の日も除きます。祝日かどうかは `holiday` で、どの規則が値を決めたかは `reason` で見る、という分担です。

値は `dates`（個別の日付・期間）→ `annual`（毎年の月日・期間）→ `recurring`（`"over-holiday"`）→ 祝日 → `recurring`（既定・振替先）→ `weekly`（曜日）の順に決まります。同じ種類の規則が重なる場合は、配列で先に書いたものが優先です。

「今、営業時間内か」のような時刻の範囲の判定は、業種ごとの決まり（深夜をまたぐ営業、休憩時間など）があるためライブラリでは行いません。`civilOf` でタイムゾーンでの暦日と時刻を取り出せば、アプリ側で簡単に書けます。

```ts
const { date, time } = storeHours.civilOf(new Date()); // { date: "2026-10-14", time: "16:30" }（日本時間）
const hours = storeHours.valueOn(date);
const isOpen = hours !== null && hours.open <= time && time < hours.close;
```

時刻を必ず持つ入力（`Date`、Temporal の `Instant`・`ZonedDateTime`・`PlainDateTime`、`"YYYY-MM-DDTHH:mm"` の文字列）では、`time` の型が `string` になるので、`null` の確認は要りません。`civilOf` は営業日カレンダーにもあり、ルートの `toDateTimeParts(input, timeZone)` でも同じ変換ができます（`bizdays-toolkit/jp` の `toJapanDate`・`toJapanDateTime` は 0.10.0 で非推奨です。`toDateString(input, "Asia/Tokyo")`・`toDateTimeParts(input, "Asia/Tokyo")`、またはカレンダーの `dateOf`・`civilOf` に移行してください。1.0.0 で削除します）。

## スケジュールから営業日カレンダーを作る

営業時間表のようなスケジュールが設定の正本なら、`createCalendarFromSchedule(schedule, isOpen)` でそこから営業日カレンダーを作れます。営業日の規則をもう一式書いて同期を取る必要がなくなります。`isOpen` は値だけから営業日かどうかを決める関数で、結果は通常のカレンダーなので、営業日の加減算・`adjust`・`dueDate` などがそのまま使えます。

```ts
import { createCalendarFromSchedule } from "bizdays-toolkit";

const hours = createSchedule<Hours>({
  holidays: jp,
  weekly: [null, weekday, weekday, weekday, weekday, weekday, { open: "10:00", close: "17:00" }],
  holiday: { sameAs: 0 },
  annual: [
    { from: "12-31", to: "01-03", value: null, name: "年末年始休業" },
    { date: "01-04", value: { open: "11:00", close: "15:00" }, name: "仕事始め" },
  ],
});
const calendar = createCalendarFromSchedule(hours, (v) => v !== null);
calendar.addBusinessDays("2026-12-29", 2); // "2027-01-04"
calendar.dayInfo("2027-01-04");
// { date: "2027-01-04", weekday: 1, businessDay: true, reason: "open-annual", name: "仕事始め", rulePath: "annual[1]" }
```

- `isOpen` は値だけで決まる純粋な関数にしてください。受け取るのは値だけ（日付は渡されません）で、カレンダーは営業日を探す間に `isOpen` を繰り返し呼ぶので、日付・時刻・外部の状態を見る関数を渡すと、結果が呼ぶたびに変わってしまいます。日付で変えたい条件は、スケジュールの規則（`dates`・`recurring`）に書きます
- `dayInfo` の `reason` は、スケジュールの `reason` をカレンダーの `reason` に対応させたものです。`date` → `"open-date"`/`"closed-date"`、`annual` → `"open-annual"`/`"closed-annual"`、`recurring` → `"open-recurring"`/`"closed-recurring"`、`holiday` → `"holiday"`（祝日が営業でも。`holidayPolicy: "open"` と同じ）、`weekday` → `"regular"`/`"closed-weekday"`。`"open-annual"` はこの作り方のカレンダーにだけ現れます（`createCalendar` の `closedAnnual` は休業だけのため）。`name`・`holiday`・`shiftedFrom`・`rulePath` はスケジュールの結果のままです
- 祝日・タイムゾーン・`outOfRange` はスケジュールのものです。設定の診断は `diagnoseSchedule` でスケジュールの設定に対して行います（カレンダー自体は診断しません）。`maxSearchDays`（既定 3660）をオプションで指定できます
- 営業・休業だけが要るなら `createCalendar`、スケジュールがどのみちあるならこちら、という使い分けです

## 日付・日時の入力

すべてのメソッドは次の入力を受け付けます。戻り値の日付は常に `"YYYY-MM-DD"` 文字列です。

| 入力                                                 | 扱い                                           |
| ---------------------------------------------------- | ---------------------------------------------- |
| `"2026-11-23"`                                       | 暦日                                           |
| `"2026-11-23T10:00"`                                 | カレンダーのタイムゾーンでの日時（壁時計）     |
| `"2026-11-22T15:30:00Z"`・`"2026-11-23T00:30+09:00"` | 瞬間。カレンダーのタイムゾーンで暦日に変換する |
| `Date`                                               | 瞬間                                           |
| Temporal の `PlainDate`・`PlainDateTime`             | 暦日・日時（Temporal への依存はありません）    |
| Temporal の `Instant`・`ZonedDateTime`               | 瞬間                                           |

日付と時刻の区切りは `T`（大文字・小文字）だけで、型 `DateTimeInput` と同じです。空白で区切った文字列（`"2026-11-23 10:00"`）は `invalid-time` の例外になります。Temporal のオブジェクトは形で判別するので、Temporal には依存しません。CI では、Temporal を備えた実行環境で、本物の Temporal のオブジェクトでも確かめています（どの環境に Temporal があったかは CI のログに出ます）。

カレンダーのタイムゾーンは、`timeZone` オプション、祝日の提供元のタイムゾーン、`"UTC"` の順に決まります。

**暦日と時刻から瞬間へ**: `toInstant(date, time, timeZone)` と `calendar.instantOf(date, time)`（スケジュールにもあります）は、`civilOf` の逆向きです。暦日 `"YYYY-MM-DD"` と時刻（`"HH:mm"` または `"HH:mm:ss"`）から、そのタイムゾーンでの瞬間を `Date` で返します。受け付けるのは暦日の文字列だけで（`Date` を渡すとどの日の時刻か曖昧になるため）、結果の `Date` は ISO 文字列（`.toISOString()`）にも Temporal の `Instant`（`Temporal.Instant.fromEpochMilliseconds(d.getTime())`）にも 1 行でできます。

```ts
import { toInstant } from "bizdays-toolkit";

toInstant("2026-11-23", "10:00", "Asia/Tokyo").toISOString(); // "2026-11-23T01:00:00.000Z"
const store = createCalendar({ holidays: jp, closedWeekdays: [0] });
const opensAt = store.instantOf(store.nextBusinessDay(store.today()), "10:00"); // 次に開く瞬間（Date）
```

夏時間の切り替えでは、Temporal の既定（`disambiguation: "compatible"`）と同じです。存在しない時刻（英国の 3 月最終日曜の 01:00〜01:59）は飛んだ分だけ後ろにずらし、2 回ある時刻（10 月最終日曜の 01:00〜01:59）は先のほうです。

```ts
import { england } from "bizdays-toolkit/uk";

const uk = createCalendar({ holidays: england });
uk.instantOf("2026-03-29", "01:30").toISOString(); // "2026-03-29T01:30:00.000Z"（02:30 BST。01:30 は存在しない）
uk.instantOf("2026-10-25", "01:30").toISOString(); // "2026-10-25T00:30:00.000Z"（1 回目の 01:30。まだ BST）
```

## 対応年の外

祝日の提供元の対応年（日本は 1955〜2099 年、英国は 2012〜2099 年、シンガポールは 2020〜2027 年）を外れた日付を判定すると `RangeError` になります。祝日がない日として扱いたい場合は `outOfRange: "ignore"` を指定してください。

## 未確定の祝日

提供元の `confirmedThrough` より後の年には、予測の祝日（`confirmed: false`）が含まれることがあります。日本の春分の日・秋分の日（翌年分が毎年 2 月の官報で公表される）と、GOV.UK が公表している最後の年より後の英国の bank holidays です。既定では予測をそのまま使います。`unconfirmedHolidays: "throw"`（`outOfRange` と同じ場所。カレンダー・スケジュール共通）にすると、未確定の祝日を引いた判定は `code: "unconfirmed-holiday"` の `RangeError` になり、5 年の返済予定の期日や契約書に書く日付のように、予測に依存した結果が黙って出ることがなくなります。「引いた判定」には、求めた日だけでなく、探索が途中で通る日（`addBusinessDays`・`adjust`・`dueDate`・`closingMonth` など）や、`dayAfterHoliday`・`dayBeforeHoliday` の規則が見る隣の日も含みます。`holidaysInYear`・`holidaysBetween` は投げないので、例外を受けたあとに影響する日を列挙する逃げ道になります。

```ts
import { createCalendar, isBizdaysError } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const strict = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  unconfirmedHolidays: "throw",
});
try {
  strict.dueDate("2028-03", { day: 20, convention: "following" });
} catch (e) {
  if (isBizdaysError(e) && e.code === "unconfirmed-holiday") {
    // 2028 年 2 月の官報公表後に計算し直す。影響する日はこれ
    strict
      .holidaysBetween("2028-01-01", "2028-12-31")
      .filter((h) => !h.confirmed)
      .map((h) => h.date); // ["2028-03-20", "2028-09-22"]
  }
}
```

- 意味があるのは、判定に祝日を使う設定だけです。`holidayPolicy: "ignore"`（スケジュールなら `holiday: "weekday"`）で祝日に従属する規則（`holiday`・`dayAfterHoliday`・`dayBeforeHoliday`・`"after-holiday"`）もない設定では結果は変わりませんが、`dayInfo` は `holiday` を付けるために祝日を引くので投げます。設定の診断はそのような設定を `redundant` にします
- 合成したカレンダーは、どれかのカレンダーが投げるなら投げます。スケジュールから作ったカレンダーはスケジュールに従います
- 捕まえるのは「予測された祝日」で、「まだ知らない祝日」ではありません。あとから発表される英国の臨時の祝日は予測に含まれず、シンガポールには予測がありません（後の年は `out-of-range`）

## エラー

設定や入力の誤りは、従来どおり `RangeError`・`TypeError` などの例外になり、`code` を持ちます。メッセージの文言は変わることがあるので、判定には `code` を使ってください。

```ts
import { createCalendar, isBizdaysError } from "bizdays-toolkit";

try {
  createCalendar({ closedDates: ["2026-12-32"] });
} catch (error) {
  if (isBizdaysError(error) && error.code === "invalid-date") {
    // 日付の誤り（メッセージには設定の中の位置 "closedDates[0].date" が入る）
  }
}
```

主なコード: `invalid-date`・`invalid-input`・`invalid-month`・`invalid-month-day`・`invalid-time`・`invalid-range`・`invalid-weekday`・`invalid-time-zone`・`invalid-option`・`out-of-range`・`invalid-provider`・`invalid-provider-data`・`no-business-day`。将来の版でコードが増えることがあります。

## 設定の診断

`bizdays-toolkit/diagnose` の `diagnoseCalendar`・`diagnoseSchedule` は、設定を調べて問題を一覧で返します。設定の問題では例外を投げません（問題がなければ空の配列）。例外になるのは第 2 引数の誤り（下記の `asOf`）だけです。

```ts
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

diagnoseCalendar({
  holidays: jp,
  closedWeekdays: [0],
  closedRecurring: [
    { weekday: 3, nth: 3, name: "第 3 水曜定休" },
    { weekday: 3, nth: 3, months: [8], name: "8 月の第 3 水曜" }, // 先の規則に含まれる
    { weekday: 0, name: "日曜休み" }, // 定休日の曜日と同じ
  ],
  closedDates: ["2100-01-05"], // 日本の祝日の対応年（1955〜2099 年）の外
  closeAnnual: ["12-31"], // 打ち間違い
});
// [
//   { severity: "warning", code: "unknown-option", path: "closeAnnual", message: '… (did you mean "closedAnnual"?)' },
//   { severity: "warning", code: "out-of-range", path: "closedDates[0]", relatedPath: "holidays", message: "…" },
//   { severity: "warning", code: "shadowed", path: "closedRecurring[1]", relatedPath: "closedRecurring[0]", message: "…" },
//   { severity: "info", code: "redundant", path: "closedRecurring[2]", message: "…" },
// ]
```

| 重さ（`severity`） | `code`                  | 内容                                                                                                                                                                                        |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error`            | 例外と同じコード        | `createCalendar`・`createSchedule` で例外になる誤り。作成時は最初の 1 件で止まりますが、診断ではすべて返します                                                                              |
| `error`            | `invalid-provider-data` | 祝日の提供元が返したデータの誤り。作成時は使った年だけを調べますが、診断では対応年のすべての年を調べます                                                                                    |
| `warning`          | `unknown-option`        | 知らないキー（作成時は無視されます）。近い既知のキーがあれば `message` に候補を挙げます                                                                                                     |
| `warning`          | `shadowed`              | 同じ種類の先の規則（`relatedPath`）に完全に含まれ、決して使われない規則                                                                                                                     |
| `warning`          | `never-matches`         | 当てはまる日がない繰り返しの規則（`{ day: 30, months: [2] }`、有効期間の中に第 5 水曜日がない、提供元のない設定の `dayAfterHoliday`、など）                                                 |
| `warning`          | `out-of-range`          | 個別の日付、または規則の有効期間が、祝日の提供元（`relatedPath`）の対応年の外                                                                                                               |
| `warning`          | `no-business-day`       | 営業日が 1 日もない設定（営業日カレンダーのみ。営業日を探すと例外になります）                                                                                                               |
| `info`             | `redundant`             | 取り除いても結果が変わらない規則（先の規則の組み合わせに覆われる、定休日の曜日と同じ、スケジュールで曜日の値と同じ値など）、または判定に祝日を使わない設定の `unconfirmedHolidays: "throw"` |
| `info`             | `expired`               | `asOf`（下記）を渡したときだけ。基準日より前に終わった規則・日付                                                                                                                            |

- 判定には `code` を使ってください。`message` は英語で、文言は変わることがあります。`code` は将来の版で増えることがあります
- `error` があるときは、規則どうしの診断（`shadowed`・`redundant` など）は行いません
- `shadowed` は同じ種類の規則どうし（個別の日付どうし、毎年の月日どうし、繰り返しの規則どうし）だけを調べます。判定の順番は固定なので、種類をまたいで使われない規則は `redundant` として見つかります。臨時営業日（`openDates`）と臨時休業日（`closedDates`）は同じ種類で、先の臨時営業日に含まれる臨時休業日は `shadowed` です
- 繰り返しの規則の `shadowed` は、祝日の扱い（`onHolidayRule`）も見ます。たとえば `"under-holiday"` の規則は、同じ日に当たる `"over-holiday"` の規則を覆いません（祝日には後の規則が当たるため）
- `dayAfterHoliday` の規則の `shadowed` は、`dayAfterHoliday` の規則どうし（`months` と期間）でだけ調べます。当てはまる日が年ごとの祝日で変わるためで、曜日の規則との重なりは `redundant` で見つかります
- 有効期間のある規則の `shadowed` は、先の規則の期間が後の規則の期間を含むことも条件です。周期（`interval`）のある規則は、先の規則の周期が後の規則を含むことも条件です（毎週は隔週を覆う。位相の違う隔週どうしは互いを覆わない）
- `redundant` は、規則を取り除いた結果と 1 日ずつ比べます。個別の日付はその期間を、毎年の月日と繰り返しの規則は個別の日付を除いた設定で、祝日の提供元の対応年（日本は 1955〜2099 年）を、提供元がなければ 2001〜2028 年（曜日と月日の組み合わせが一巡する 28 年。周期のある規則があれば、その周期がそろう長さ。隔週なら 56 年）を調べます。その範囲の外にある有効期間も調べます（`outOfRange: "throw"` では対応年の中だけ）。調べた年は `message` に書かれます。スケジュールの値は、配列と普通のオブジェクトなら中身で、それ以外（`Date` など）は同じものかで比べます
- 日本の祝日を使う設定では、全日を調べるため数百ミリ秒かかります。リクエストごとではなく、テストや起動時の確認で使ってください。開発・テスト用の道具なので、アプリの本体のバンドルに入らないようサブパスに分けています

**終わった規則を見つける**（`asOf`）: 店舗ごとの設定を JSON で持つ多店舗のサービスなどでは、設定が年を追って溜まります。第 2 引数に `{ asOf: "YYYY-MM-DD" }` を渡すと、`effectiveTo` がその日より前の規則と、その日より前に終わる個別の日付・期間を、`info` の `expired` で返します（`redundant` とは独立です。過去には効いていた規則なので）。`asOf` を渡さなければ `expired` は返さないので、`assert.deepEqual(diagnoseCalendar(options), [])` のようなテストが日付で変わることはありません。`asOf` は暦日の文字列だけを受け付けます（`Date` だとタイムゾーンが要るため）。それ以外の値は `invalid-date`、第 2 引数がオブジェクトでなければ `invalid-argument` の例外になり、知らないキーは無視します。

```ts
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

diagnoseCalendar(
  {
    holidays: jp,
    closedRecurring: [
      { weekday: 1, name: "月曜定休", effectiveTo: "2027-03-31" },
      { weekday: 2, name: "火曜定休", effectiveFrom: "2027-04-01" },
    ],
    closedDates: ["2026-02-10"],
  },
  { asOf: "2028-01-01" },
).map((d) => [d.code, d.path]); // [["expired", "closedDates[0]"], ["expired", "closedRecurring[0]"]]
```

テストで設定を守る例:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { shippingOptions } from "../src/calendar.ts";

test("出荷カレンダーの設定に問題がない", () => {
  assert.deepEqual(diagnoseCalendar(shippingOptions), []);
});
```
