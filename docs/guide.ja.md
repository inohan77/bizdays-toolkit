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

4 か国は、週末に当たった祝日の扱いと、後の年を予測するかが違います。

| 国           | 週末に当たった祝日                              | 振替                                                                             | 予測（`confirmed: false`）                       | `confirmedThrough`       |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------ |
| 日本         | 返す（土曜日・日曜日とも）                      | 日曜日の祝日は翌日（1973-04-12 から。2007 年からは、その後の祝日でない最初の日） | `confirmedThrough` より後の春分・秋分の日        | あり                     |
| 英国         | **返さない**。振替日だけを返す（GOV.UK と同じ） | 土曜日・日曜日の祝日は、その後の祝日でない最初の平日                             | `confirmedThrough` より後のすべての bank holiday | あり                     |
| フランス     | 返す（土曜日・日曜日とも）                      | なし                                                                             | なし（日付は法令で決まる）                       | なし                     |
| シンガポール | 返す（土曜日・日曜日とも）                      | 日曜日の祝日だけ、その後の祝日でない最初の日                                     | なし（後の年は対応年の外）                       | あり（対応年の最後の年） |

そのため `{ holiday: true, weekdays: [6] }`（土曜日の祝日）のような規則は、英国の提供元では当てはまる日がなく、診断が `never-matches` で知らせます。

### 日本の祝日

```ts
import { holidayOn, holidaysInYear, isHoliday } from "bizdays-toolkit/jp";

isHoliday("2026-11-23"); // true
holidayOn("2026-09-22");
// { date: "2026-09-22", name: "国民の休日", nameEn: "Citizens' Holiday", kind: "citizens", confirmed: true }
holidaysInYear(2027);

// 瞬間（Date）は日本時間で判定する
isHoliday(new Date("2026-11-22T15:30:00Z")); // true（日本時間では 11/23）
```

`kind` は `regular`（国民の祝日）・`substitute`（振替休日）・`citizens`（国民の休日）・`special`（皇室行事などによる休日）のいずれかです。

`confirmed` は、その日付が公式に確定しているかを表します。春分・秋分の日は前年 2 月の官報で確定するため、それより先の年は近似式による予測（`confirmed: false`）です。

### 英国の bank holidays

```ts
import { createCalendar } from "bizdays-toolkit";
import { england, northernIreland, scotland, wales } from "bizdays-toolkit/uk";

const edinburgh = createCalendar({ holidayProvider: scotland, closedWeekdays: [0, 6] });
edinburgh.isBusinessDay("2026-01-02"); // false（2nd January）
edinburgh.addBusinessDays("2026-06-12", 1); // "2026-06-16"（6/15 は World Cup bank holiday）

scotland.holidaysInYear(2026)[0];
// { date: "2026-01-01", name: "New Year’s Day", nameEn: "New Year’s Day", kind: "regular", confirmed: true, key: "new-year" }
wales.holidaysInYear(2026)[0]?.names; // { cy: "Dydd Calan" }

// 複数の地域にまたがる場合は和集合（いずれかの地域の祝日を祝日とする）
const ukWide = createCalendar({ holidayProvider: [england, scotland, northernIreland] });
```

| 提供元            | ID       | GOV.UK の区分     | 備考                                       |
| ----------------- | -------- | ----------------- | ------------------------------------------ |
| `england`         | `GB-ENG` | England and Wales |                                            |
| `wales`           | `GB-WLS` | England and Wales | ウェールズ語の名称（`names.cy`）が付く     |
| `scotland`        | `GB-SCT` | Scotland          | 2nd January・St Andrew’s Day など          |
| `northernIreland` | `GB-NIR` | Northern Ireland  | St Patrick’s Day・Battle of the Boyne など |

- `kind` は `regular`（毎年の祝日。布告で日付が移動した年を含む）・`substitute`（土曜日・日曜日に当たった祝日の振替）・`special`（記念式典・国葬などの布告による臨時の祝日）のいずれかです。振替の `name` は元の祝日の名称です（GOV.UK と同じ）
- England と Wales は GOV.UK では 1 つの区分で、日付は現在同じですが、別の提供元にしています。将来分かれても、コードを変えずに済みます
- 対応年は 1974〜2099 年です。GOV.UK が日付を公表している年（`confirmedThrough`、現在は 2028 年）より後は、規則による予測（`confirmed: false`）です。臨時の祝日は発表されるまで分からないため、予測の年には含まれません
- 2000〜2011 年は GOV.UK のデータがない年です。この期間は、当時の政府が公表した一覧（DTI・BERR・directgov・Scottish Executive/Government・nidirect。Wayback Machine の保存）を正とし、The Gazette の国王の布告と北アイルランドの Order で全日を照合しています（出典は [docs/sources/uk-bank-holidays-2000-2011.md](./sources/uk-bank-holidays-2000-2011.md)）。Scotland の 3 日（2010 年 1 月 4 日・2010 年 12 月 27 日・2011 年 1 月 4 日）は当時の政府の一覧にはあるものの布告がなく、1971 年法の文言どおりなら bank holiday ではありませんが、提供元は政府の一覧に従って振替日として返します。
- 1974〜1999 年は Web 以前で、当時の政府の一覧は残っていないので、The Gazette の国王の布告と北アイルランドの Order が正です（Hansard の書面答弁がある年はそれを第二の出典とし、日付の食い違いはありません）。この期間の祝日はすべて、1971 年法 Schedule 1 の日か、[docs/sources/uk-bank-holidays-1974-1999.md](./sources/uk-bank-holidays-1974-1999.md) に記録した布告で指定された日です。布告が見つからなかった少数の日（The Gazette のオンラインにない号に載っている 1986〜1990 年の北アイルランドの Order、見つからず、出るはずの時期に The London Gazette のオンラインにない号がある 1987 年分の毎年の布告、見つからなかった 1975 年の北アイルランドの Order）は規則どおりに返し、フィクスチャに `unverified` として記録しています。下限が 1974 年なのは、England・Wales・NI の New Year's Day が 1974 年から毎年布告されているためです（Early May は 1978 年から、Scotland の Spring も 1978 年から。提供元はこの始まりを符号化しているのであって、法の附則の変更ではありません）。名称も当時の一覧に従うので、振替日の割り当てが今の GOV.UK と違う年があります（2004 年は 12 月 27 日が Boxing Day で 28 日が Christmas Day、2000 年・2005 年の Scotland は 1 月 3 日が 2nd January で 4 日が New Year’s Day）
- Scotland の地域（council）ごとの休日は含みません。また、bank holiday に休むかどうかは雇用契約などによります
- 臨時の祝日は 10 日ほど前に発表されることがあります。GOV.UK との差分を毎日監視し、見つけたらパッチ版で反映します

### フランスの祝日

```ts
import { createCalendar } from "bizdays-toolkit";
import { alsaceMoselle, metropole } from "bizdays-toolkit/fr";

const paris = createCalendar({ holidayProvider: metropole, closedWeekdays: [0, 6] });
paris.isBusinessDay("2026-05-14"); // false（Ascension）
paris.addBusinessDays("2026-05-22", 1); // "2026-05-26"（5 月 25 日は Lundi de Pentecôte）
metropole.holidaysInYear(2026)[1];
// { date: "2026-04-06", name: "Lundi de Pâques", nameEn: "Easter Monday", kind: "regular", confirmed: true, key: "easter-monday" }
alsaceMoselle.holidaysInYear(2026).length; // 13（全国の 11 日に Vendredi saint と 12 月 26 日が加わる）

// Lundi de Pentecôte を「連帯の日」として出勤日にする企業。法律上は祝日のまま
const company = createCalendar({
  holidayProvider: metropole,
  closedWeekdays: [0, 6],
  openRecurringRules: [
    { holiday: true, keys: ["pentecost-monday"], name: "Journée de solidarité" },
  ],
});
company.isBusinessDay("2026-05-25"); // true
```

| 提供元          | ID      | data.gouv.fr のゾーン | 祝日                                                                                      |
| --------------- | ------- | --------------------- | ----------------------------------------------------------------------------------------- |
| `metropole`     | `FR`    | Métropole             | 労働法典 L3133-1 の 11 日                                                                 |
| `alsaceMoselle` | `FR-AM` | Alsace-Moselle        | 11 日に Vendredi saint（`good-friday`）と 12 月 26 日（`saint-stephens`。地方法）が加わる |

- 全国の 11 日は固定日 8 日（1/1・5/1・5/8・7/14・8/15・11/1・11/11・12/25）と復活祭から決まる 3 日（Lundi de Pâques、Ascension = +39 日、Lundi de Pentecôte = +50 日）です。振替はなく、週末に当たった祝日はそのまま週末です。`kind` は常に `regular`
- `name` は data.gouv.fr の表記（フランス語。`1er mai`・`Lundi de Pentecôte`）、`nameEn` は英訳、`key` は安定した識別子（`labour-day`・`pentecost-monday` など。[祝日の識別子](#祝日の識別子)）
- 2 つの祝日が同じ日に当たる年（2008 年の 5 月 1 日と 2059 年の 5 月 8 日が Ascension）は、data.gouv.fr の JSON と同じく復活祭から決まる祝日の名称・`key` で 1 件を返します。`keys: ["labour-day"]` は 2008 年の 5 月 1 日には当てはまりません
- Lundi de Pentecôte は多くの企業が出勤日にしています（連帯の日）が、法律上は祝日のままなので、提供元は祝日として返します。出勤日にするなら上のように祝日の規則 `keys: ["pentecost-monday"]` で書きます。祝日を休みにするかどうかは利用者が決める、というこのライブラリ全体の分担です
- 対応年は 2000〜2099 年です。祝日は法令で定まり年ごとの告示はないので、すべての年が `confirmed: true` で、提供元は `confirmedThrough` を持ちません。労働法典の改正はパッチ版で反映します。日付は data.gouv.fr の「Jours fériés en France」（DINUM。2 つのゾーンの JSON エクスポート。過去 20 年・未来 5 年の窓で現在 2006〜2031 年）と照合しています。差分は毎日監視しています
- `FR-AM` は Alsace-Moselle（Bas-Rhin・Haut-Rhin・Moselle の 3 県）に対するこのライブラリの ID です（ISO 3166-2 に 1 つのコードがないため）。祝日もタイムゾーンも違う海外県・海外領土は同梱していません

### シンガポールの祝日

```ts
import { createCalendar } from "bizdays-toolkit";
import { sg } from "bizdays-toolkit/sg";

const singapore = createCalendar({ holidayProvider: sg, closedWeekdays: [0, 6] });
singapore.isBusinessDay("2026-08-10"); // false（National Day が日曜日に当たり、翌月曜日が振替）
singapore.addBusinessDays("2026-02-16", 1); // "2026-02-19"（2 月 17・18 日は旧正月）
sg.holidaysInYear(2026).find((h) => h.kind === "substitute");
// { date: "2026-06-01", name: "Vesak Day", nameEn: "Vesak Day", kind: "substitute", confirmed: true, key: "vesak" }
```

- 提供元は `sg`（ID `SG`、タイムゾーン `Asia/Singapore`）の 1 つで、地域ごとの祝日はありません。`kind` は `regular`（毎年の祝日）・`substitute`（日曜日に当たった祝日の翌日。Holidays Act により祝日になり、名称は元の祝日と同じ）・`special`（政府が告示する臨時の祝日。Polling Day など）です。土曜日に当たった祝日は振り替えません
- 旧正月・Hari Raya Puasa・Hari Raya Haji・Vesak Day・Deepavali は太陰暦・イスラム暦・ヒンドゥー暦で決まるため、規則では計算できません。日付は MOM（Ministry of Manpower）が年ごとに告示したもので、振替は Holidays Act の規則で計算します。対応年は MOM が告示した年（現在は 2020〜2027 年。`confirmedThrough` は対応年の最後の年と同じ）で、それより後の年は予測せず対応年の外（`out-of-range`）です。`sg` が `confirmed: false` を返すことはありません
- 日付は data.gov.sg の「Singapore Public Holidays」コレクション（MOM）と照合しています。そのデータが告示と食い違う箇所（2022 年の Hari Raya の改定後の日付と、振替 2 日の欠落）は告示に従います。data.gov.sg との差分を毎日監視し、見つけたらパッチ版で反映します

### 祝日の識別子

同梱の、毎年繰り返す祝日には安定した識別子 `key` が付いています。規則の `{ holiday: true, keys: [...] }` で祝日を、`{ dayAfterHoliday: true, keys: [...] }`・`{ dayBeforeHoliday: true, keys: [...] }` でその前後の日を個別に指すためのもので（[繰り返しの規則](#繰り返しの規則)）、公式データに従ってパッチ版で変わりうる名称に依存せずに済みます。`key` は祝日の日付や公式の名称が変わっても変わりません（天皇誕生日は 4 月 29 日・12 月 23 日・2 月 23 日とも `emperors-birthday`、体育の日とスポーツの日はどちらも `sports`）。振替日は元の祝日の `key` を持つので、`keys: ["coming-of-age"]` は成人の日とその振替休日を指します。当日だけなら `kinds: ["regular"]` を併せて指定します。一度きりの祝日（皇室行事の休日、英国の布告による臨時の bank holiday、シンガポールの Polling Day）と日本の国民の休日は `key` を持たないので、`kinds` か `dates` で指します。

```ts
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

// 花屋: 祝日は定休だが、春分の日・秋分の日（彼岸の中日）だけは営業
const florist = createCalendar({
  holidayProvider: jp,
  openRecurringRules: [
    { holiday: true, keys: ["vernal-equinox", "autumnal-equinox"], name: "彼岸は営業" },
  ],
});
florist.isBusinessDay("2026-03-20"); // true（春分の日）
florist.isBusinessDay("2026-05-04"); // false（みどりの日）
jp.holidaysInYear(2020).find((h) => h.date === "2020-02-24")?.key; // "emperors-birthday"（振替休日）
```

| 提供元                       | 識別子                                                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jp`                         | `new-year`、`coming-of-age`、`national-foundation`、`emperors-birthday`、`vernal-equinox`、`showa`、`constitution-memorial`、`greenery`、`childrens`、`marine`、`mountain`、`respect-for-the-aged`、`autumnal-equinox`、`sports`、`culture`、`labor-thanksgiving` |
| `england` ほか（英国）       | `new-year`、`2nd-january`、`st-patricks`、`good-friday`、`easter-monday`、`early-may`、`spring`、`battle-of-the-boyne`、`summer`、`st-andrews`、`christmas`、`boxing-day`                                                                                         |
| `metropole` ほか（フランス） | `new-year`、`easter-monday`、`labour-day`、`victory-in-europe`、`ascension`、`pentecost-monday`、`bastille`、`assumption`、`all-saints`、`armistice`、`christmas`。Alsace-Moselle は `good-friday`・`saint-stephens` が加わる                                     |
| `sg`                         | `new-year`、`chinese-new-year`、`good-friday`、`labour-day`、`hari-raya-puasa`、`vesak`、`hari-raya-haji`、`national-day`、`deepavali`、`christmas`                                                                                                               |

型 `KnownJpHolidayKey`・`KnownUkHolidayKey`・`KnownSgHolidayKey`・`KnownFrHolidayKey` がこの一覧を持ち、エディターの補完に使えます。識別子は英語名から 1 度だけ導いたもので、綴りは提供元の英語名に従い（日本は `labor-thanksgiving`、シンガポールは `labour-day`）、以後は変わりません。自作の提供元にも `key` を付けられます。同梱の提供元が従う導き方は[祝日の提供元を書く](./providers.ja.md#祝日の提供元を書く)にあります。

## 営業日カレンダー

```ts
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const shipping = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0], // 日曜日（0 = 日曜 … 6 = 土曜）
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "年末年始" }],
  closedDates: [{ from: "2027-08-12", to: "2027-08-16", name: "夏季休業" }],
  openDates: ["2026-12-27"], // 臨時営業日
  holidayPolicy: "closed", // 祝日は休み（"open": 営業 / "ignore": 判定に使わない）
});

shipping.isBusinessDay("2026-11-23"); // false（勤労感謝の日）
shipping.addBusinessDays("2026-12-30", 1); // "2027-01-04"
shipping.diffBusinessDays("2026-09-01", "2026-10-01"); // from 以上 to 未満の営業日数

// 14 時より前の注文は当日、それ以降は翌営業日に出荷
shipping.businessDayOnOrAfter(new Date(), { cutoff: "14:00" }); // 入力は時刻を持つもの

shipping.dayInfoOn("2027-01-01");
// { date: "2027-01-01", weekday: 5, open: false, reason: "closed-annual", name: "年末年始", holiday: {…}, optionPath: "closedAnnualDates[0]" }
shipping.daysBetween("2026-12-30", "2027-01-04").map((d) => d.open); // [true, false, false, false, false, true]
```

`daysBetween(from, to)` は、期間のすべての日の `dayInfoOn` を返します（両端を含む）。 `businessDatesBetween`・`holidaysBetween` も両端を含みます。`diffBusinessDays(from, to)` だけは `from` 以上 `to` 未満の営業日の数で、`diffBusinessDays(a, b) + diffBusinessDays(b, c)` が `diffBusinessDays(a, c)` と等しくなり、`a` が営業日なら `diffBusinessDays(a, addBusinessDays(a, n))` が `n` になります（`addBusinessDays` の逆算）。起点が休業日のときは、`addBusinessDays` は翌営業日を 1 と数える（`n = 0` は `businessDayOnOrAfter` と同じなので `+0` と `+1` が同じ日）一方、`diffBusinessDays` は休業日の起点を数えないので、1 だけずれます。

`createCalendar`・`createSchedule` は作る時点で設定を検証するので、作ったものを使い回すのが基本です。作成も軽く（日本の祝日を使う営業日カレンダー・スケジュールとも 1 ミリ秒を大きく下回る）、呼び出しのたびに作っても実用上の問題はありません。

1 日の判定は次の優先順位で行います（上が優先）。

1. `openDates`（臨時営業日）
2. `closedDates`（臨時休業日）
3. `closedAnnualDates`（毎年の休業日）
4. `openRecurringRules`・`closedRecurringRules` のうち `holidayOverlapPolicy: "over-holiday"` の規則（祝日でも当てはめる）と、祝日の規則（`{ holiday: true }`）
5. 祝日（`holidayPolicy` に従う。`"open"` は定休日の曜日より優先して営業日にする）
6. `openRecurringRules`・`closedRecurringRules`（既定の `"under-holiday"` と、`"after-holiday"` の振替先）
7. `closedWeekdays`（定休日の曜日）
8. それ以外は営業日

この順番は固定です。繰り返しの規則と祝日の関係だけは、規則ごとに `holidayOverlapPolicy` で選べます（次の節）。

## 繰り返しの規則

「第 3 水曜定休」「第 2・第 4 土曜休業」「隔週水曜定休」「毎月末日は棚卸」「月曜休館（祝日の場合は次の祝日でない日）」「振替休日は営業」「祝日の翌日は休館」「祝前日は夜間営業」のような繰り返しの休業日・営業日は、`closedRecurringRules`・`openRecurringRules` で指定します。

```ts
const museum = createCalendar({
  holidayProvider: jp,
  holidayPolicy: "open", // 祝日は開館
  closedRecurringRules: [
    { weekday: 1, name: "月曜休館", holidayOverlapPolicy: "after-holiday" }, // 祝日の場合は次の祝日でない日に休館
    { weekday: 3, nth: 3, months: [2, 8], name: "2 月・8 月の第 3 水曜は臨時休館" },
    { dayOfMonth: -1, name: "月末棚卸", holidayOverlapPolicy: "over-holiday" }, // 祝日でも休館
    { dayAfterHoliday: true, name: "祝日の翌日休館" },
  ],
});

museum.isBusinessDay("2026-10-12"); // true（スポーツの日の月曜は開館）
museum.dayInfoOn("2026-10-13");
// { date: "2026-10-13", weekday: 2, open: false, reason: "closed-recurring",
//   name: "月曜休館", shiftedFrom: "2026-10-12", optionPath: "closedRecurringRules[0]" }
museum.dayInfoOn("2026-02-12").name; // "祝日の翌日休館"（2 月 11 日は建国記念の日）
museum.isBusinessDay("2026-05-07"); // false（5 月 3〜6 日の連休の翌日）
```

| 書き方                                                          | 意味                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{ weekday: 1 }`                                                | 毎週月曜日                                                                                                                                       |
| `{ weekday: 3, nth: 3 }`                                        | 第 3 水曜日。`nth` は 1〜5 と -1（最終）。`[2, 4]` のように配列で複数指定できる                                                                  |
| `{ weekday: 3, interval: 2, anchor: "2026-01-07" }`             | 隔週水曜日。`anchor` から偶数週の水曜日（周期は 2 週以上。下記）                                                                                 |
| `{ dayOfMonth: 20 }`                                            | 毎月 20 日。`dayOfMonth` は 1〜31 と -1（末日）。配列で複数指定できる                                                                            |
| `{ businessDayOfMonth: -1 }`                                    | 月の第 n 営業日（1〜31、-1 は最後、-2 はその前、…。配列で複数指定できる）。繰り返しの規則を除いた判定で数える（下記）                            |
| `{ businessDayOfWeek: -1, weekStart: 1 }`                       | `weekStart` の曜日から始まる週の第 n 営業日（1〜7、-1 は最後、…。配列で複数）。数え方は `businessDayOfMonth` と同じ（下を参照）                  |
| `{ holiday: true, kinds: ["substitute"] }`                      | 祝日。`kinds` でその種別（`Holiday.kind`）に、`keys` で個別の祝日（`Holiday.key`）に絞れる。`holidayPolicy` より先に判定する（下記）             |
| `{ dayAfterHoliday: true }`                                     | 祝日の翌日。祝日（連休なら連休）が明けた最初の祝日でない日（提供元の祝日だけで判定）。`kinds`・`keys`・`skipWeekdays` で絞り・広げられる（下記） |
| `{ dayBeforeHoliday: true }`                                    | 祝前日。祝日（連休なら連休）の直前の祝日でない日（提供元の祝日だけで判定）。`kinds`・`keys`・`skipWeekdays` は祝日の翌日と同じ                   |
| `{ cycle: 6, anchor: "2026-01-05", positions: [5, 6] }`         | 日単位の周期。`anchor` を 1 日目として 6 日ごとの 5・6 日目（4 勤 2 休のような交替制。下記）                                                     |
| `months: [8, 12]`                                               | どの書き方にも付けられる、月の絞り込み                                                                                                           |
| `effectiveFrom: "2027-04-01"`・`effectiveTo: "…"`               | 規則の有効期間（両端を含む）。期間の外では、その規則は書かれていないのと同じになる（下記）                                                       |
| `holidayOverlapPolicy: "after-holiday"`・`skipWeekdays: [0, 6]` | 振替で祝日に加えてその曜日も飛ばす。「6 月 15 日。土日祝なら翌営業日」（下記）                                                                   |

- **第 n 何曜日**は「その月で n 回目のその曜日」です（1〜7 日が第 1）。カレンダーの第 n 週の行にある曜日ではありません
- **その月にない日**（`nth: 5` がない月、`dayOfMonth: 31` がない月）は当てはまりません。末日は `dayOfMonth: -1` で指定します
- **隔週**（`interval: 2`）は「第 1・第 3 水曜」（`nth: [1, 3]`）とは別物です。水曜日が 5 回ある月で、後者は 1 週ずれます。`interval` は周期の週数（2 以上の整数）、`anchor` は周期が通る日付（`weekday` と同じ曜日）で、その日と、その日から `interval` 週おきの前後の日に当てはまります。店舗は「1 月 7 日から隔週水曜」のように告知するので、その日付をそのまま書きます。起点より前の日に当てはめず起点から始めるには、`effectiveFrom` を併せて指定します。`interval` は `nth` とは併用できません
- **祝日の規則**（`{ holiday: true }`）は、祝日の既定の扱いの例外を書きます。「2027 年 4 月から祝日も営業」は `holidayPolicy: "closed"` のまま `openRecurringRules: [{ holiday: true, effectiveFrom: "2027-04-01" }]`、「振替休日と国民の休日は営業」は `openRecurringRules: [{ holiday: true, kinds: ["substitute", "citizens"] }]`、スケジュールの「5 月の祝日は特別営業時間」は `recurringRules: [{ holiday: true, months: [5], value: … }]` です。`kinds` はその種別（`Holiday.kind`。種別は提供元の一覧を参照。`holidayProvider: jp` ならエディターで補完が効きます）の祝日に、`keys` は個別の祝日（`Holiday.key`。「春分の日・秋分の日は営業」は `{ holiday: true, keys: ["vernal-equinox", "autumnal-equinox"] }`。[祝日の識別子](#祝日の識別子)）に、`weekdays` はその曜日（「土曜の祝日は午前診療」は `{ holiday: true, weekdays: [6], value: … }`）に、`months` はその月に絞り、省略すればすべての祝日です。判定は「祝日の上」の段階で、`holidayPolicy` より先に行い、`holidayPolicy: "ignore"` でも当てはまります。当てはまる日は祝日なので、この規則に `holidayOverlapPolicy` は指定できません（`invalid-option`）。`holiday` には祝日がそのまま付きます
- **祝日の翌日**は定義上祝日でないので、その規則に `holidayOverlapPolicy` は指定できません（`invalid-option`）。「祝日」は提供元の祝日で、毎年の休業日などは含みません。提供元のない設定では 1 日も当てはまりません。`weekdays` でその曜日に絞れます。美術館の「祝日の翌日は休館（土曜・日曜に当たる場合は開館）」は `{ dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] }` です（代わりに `openRecurringRules` で土日を開けると、ほかの土日の休館まで打ち消してしまいます）
- **月の第 n 営業日**（`{ businessDayOfMonth: n }`）は、「月末最終営業日は棚卸しで休業」「四半期初の第 1・第 5 営業日は予約を止める」、スケジュールなら「最終営業日は短縮営業」を規則として書くためのものです。`{ dayOfMonth: -1 }`（暦の末日）や `{ weekday: 5, nth: -1 }`（最終金曜日）では数日ずれます。営業日を数える基準は、そのカレンダーの**繰り返しの規則をすべて除いた判定**（個別の日付・毎年の休業日・祝日（`holidayPolicy` の扱いどおり）・`closedWeekdays`）です。`closedAnnualDates: [{ from: "12-31", to: "01-03" }]` の年末年始休業があれば 2026 年 12 月の最終営業日は 30 日、31 日が土曜日の 10 月は 30 日です。繰り返しの規則を基準に入れないのは、この規則自身が繰り返しの規則で、入れると定義が循環するためです。そのため `closedRecurringRules` の `{ weekday: 0 }` で書いた定休日は営業日として数えられます。定休日は `closedWeekdays` で書いてください（そのような設定は診断が `counting-basis` で知らせます）。メソッドの `nthBusinessDayOfMonth`・`lastBusinessDayOfMonth` は規則を適用した後の実際の営業日を返すので、`{ businessDayOfMonth: -1 }` を休業にすると `lastBusinessDayOfMonth` はその前日になります。営業日が n 日に満たない月には当てはまりません（どの月にもない n は `never-matches`）。`holidayOverlapPolicy` は既定の `"under-holiday"` と `"over-holiday"` を受け、`"after-holiday"` は `invalid-option` です。`holidayPolicy: "open"` では祝日も営業日として数えるので第 n 営業日が祝日に当たることがあり、既定ではその日は祝日の段階が先に決めます（曜日の規則と同じ優先順位）。「第 1 営業日は祝日でも休業」は `holidayOverlapPolicy: "over-holiday"` で書きます（祝日が休業の設定では結果を変えず、診断が `redundant` で知らせます）。スケジュールには営業・休業の概念がないので、数える基準のカレンダーを `calendar` で指定します: `{ businessDayOfMonth: -1, calendar: branch, value: … }`（必須。タイムゾーンはスケジュールと同じ。そのカレンダーの実際の営業日で数える。カレンダーの側に `calendar` を書くと `invalid-option`）
- **週の第 n 営業日**（`{ businessDayOfWeek: n, weekStart }`）は、同じ規則の週版です。「週の最終営業日は週次棚卸しで出荷停止」は、金曜日が祝日の週は木曜日、火曜日から年末年始の週は月曜日に動き、`{ weekday: 5 }` でも祝日の前後の規則でも書けません。週は `weekStart` の曜日（0 = 日曜日〜6 = 土曜日）から 7 日間で、週の始まりは地域・業種で違うので省略できません。`n` は 1〜7 と -1〜-7 で、数え方・`calendar`・`holidayOverlapPolicy` は `businessDayOfMonth` とまったく同じです。`months` は当てはまる日の月で絞るので、月をまたぐ週も 1 つの週として数えます

```ts
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const warehouse = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-29", to: "01-03", name: "年末年始" }],
  closedRecurringRules: [{ businessDayOfWeek: -1, weekStart: 1, name: "週次棚卸しで出荷停止" }],
});
warehouse.isBusinessDay("2026-10-30"); // false（金曜日。週の最終営業日）
warehouse.isBusinessDay("2026-03-19"); // false（3 月 20 日（金）が春分の日）
warehouse.isBusinessDay("2026-12-28"); // false（29 日から年末年始）
```

- **規則の形ごとに受ける設定は、実行時に加えて TypeScript でも確かめます**: 祝日と祝日の前後の規則は `holidayOverlapPolicy` を受けず、周期と月・週の第 n 営業日は `"under-holiday"`・`"over-holiday"` だけを受けます。`skipWeekdays` は曜日・日の規則の `holidayOverlapPolicy: "after-holiday"` とだけ書け、第 n 営業日の規則の `calendar` はスケジュールでだけ受けます（スケジュールでは必須）
- **振替で曜日も飛ばす**（`skipWeekdays`。曜日・日の規則の `holidayOverlapPolicy: "after-holiday"` と組で使う。祝日の翌日・祝前日の規則では別の意味になる。下記）は、振替で飛ばす日に祝日のほかその曜日を足します。これがないと、月曜日の規則は祝日が続いた後に土曜日に落ちることがあり（金曜日の規則なら、金曜日が祝日のたびに土曜日に落ちる）、言葉どおりの「翌平日」は `skipWeekdays: [6]`（日曜日も避けるなら `[0, 6]`）です。また、「6 月 15 日は創立記念日。土日祝なら翌営業日」はそもそも書けません（土曜日の 6 月 15 日はもともと休みで、規則は振り替わらない）。`skipWeekdays: [0, 6]` を付けると、本来の日が祝日かその曜日なら、その日以降で最初の「祝日でもその曜日でもない日」に当てはまります。`shiftedFrom` は本来の日で、有効期間も本来の日で判定します。規則自身の曜日は `skipWeekdays` に含められません
- **祝前日**（`{ dayBeforeHoliday: true }`）はその鏡像で、翌日が祝日でその日自身は祝日でない日です。連休の前は連休の初日の前日だけが当てはまります（2026 年 5 月なら 5 月 2 日（土）だけで、5 月 4 日・5 日は祝日なので当てはまりません）。扱いは祝日の翌日と同じです（`weekdays`・`months`・有効期間を付けられ、`holidayOverlapPolicy` は指定できず、提供元がなければ当てはまりません）。スケジュールの「祝前日料金」、「祝前日は深夜 2 時まで営業」（`weekdays: [1, 2, 3, 4, 5]` で土日に当たる祝前日は通常どおり）、「祝前日は当日出荷の受付を正午まで」（締め時刻をスケジュールの値にして `cutoffs.valueOn(date)` を `cutoff` に渡す）のように書きます
- **祝日の翌日・祝前日の絞り込み**（`kinds`・`keys`）: `{ dayBeforeHoliday: true, keys: ["chinese-new-year"] }` はシンガポールの旧正月の前日で、毎年日付が動く日です。絞り込みは、その日の隣の祝日（祝前日なら連休の初日）に当てます。ゴールデンウィークの前では、`keys: ["childrens"]` は 5 月 2 日に当てはまりません（翌日は憲法記念日）。`{ dayAfterHoliday: true, kinds: ["substitute"] }` は振替休日の翌日です
- **祝日の前の最終平日**（祝日の翌日・祝前日の `skipWeekdays`）: これがないと、月曜日の祝日の祝前日は日曜日になり、英国の bank holiday の大半や日本の月曜日の祝日では役に立ちません。`skipWeekdays: [0, 6]` を付けると、祝日とその曜日が続く塊（祝日を 1 日以上含む）の前（後）の日に当てはまります。月曜日の祝日の前の金曜日や、Good Friday から Easter Monday までが明けた火曜日です。祝日を含まない普通の週末は塊になりません。`kinds`・`keys` は、塊の中でその日に最も近い祝日に当てます。飛ばすのは書いた曜日だけで、カレンダー自身の休業日は見ません。すべての曜日は飛ばせません
- **日単位の周期**（`{ cycle, anchor, positions }`）は、週や月にそろわない規則を書きます。4 勤 2 休のような交替制や、10 日に 1 度の点検日です。`cycle` は周期の日数（2 以上）、`anchor` は 1 日目、`positions` は当てはまる周期の中の何日目か（1〜`cycle`。すべての日は指定できない）です。`interval` と同じく `anchor` より前の日にも当てはまるので、起点から始めるには `effectiveFrom` を付けます。`holidayOverlapPolicy` は `"under-holiday"`（既定）と `"over-holiday"` で、`"after-holiday"` は `invalid-option` です。交替制はふつう祝日に関係なく回るので、`holidayPolicy: "ignore"` と `closedWeekdays: []` を指定します
- 繰り返しの規則どうしは配列で先に書いたものが優先で、`openRecurringRules` は `closedRecurringRules` より優先です。月曜の勤労感謝の日（2026-11-23）の翌日は、月曜の規則の振替先でもあり祝日の翌日でもあります。先に書いた規則が決め、どちらが決めたかは `dayInfoOn` で分かります

```ts
// 銀行の支店: 月末最終営業日は来店予約を止める。創立記念日は土日祝なら翌営業日
const branch = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-31", to: "01-03" }],
  closedRecurringRules: [
    { businessDayOfMonth: -1, name: "月末最終営業日は来店予約を停止" },
    {
      dayOfMonth: 15,
      months: [6],
      name: "創立記念日",
      holidayOverlapPolicy: "after-holiday",
      skipWeekdays: [0, 6],
    },
  ],
});
branch.isBusinessDay("2026-10-30"); // false（10 月 31 日は土曜日なので、30 日が最終営業日）
branch.isBusinessDay("2026-12-30"); // false（12 月 31 日から休業なので、30 日が最終営業日）
branch.lastBusinessDayOfMonth("2026-10"); // "2026-10-29"（規則を適用した後の実際の最終営業日）
branch.dayInfoOn("2030-06-17").shiftedFrom; // "2030-06-15"（2030 年 6 月 15 日は土曜日）

// スケジュールは、数える基準のカレンダーを指定する
const hours = createSchedule({
  holidayProvider: jp,
  weekdayValues: [null, "9-17", "9-17", "9-17", "9-17", "9-17", null],
  recurringRules: [
    { businessDayOfMonth: -1, calendar: branch, value: "9-15", name: "締め作業で短縮" },
  ],
});
hours.valueOn("2026-10-29"); // "9-15"（支店の 10 月の最終営業日）
```

```ts
// 4 勤 2 休の製造ライン
const lineA = createCalendar({
  holidayProvider: jp,
  holidayPolicy: "ignore", // 交替制は祝日に関係なく回る
  closedWeekdays: [],
  closedRecurringRules: [
    { cycle: 6, anchor: "2026-01-05", positions: [5, 6], name: "班 A の休日" },
  ],
});
lineA.isBusinessDay("2026-01-09"); // false（周期の 5 日目）
lineA.addBusinessDays("2026-01-08", 1); // "2026-01-11"

// bank holiday の前の最終平日は締め時刻を繰り上げる
const cutoffs = createSchedule({
  holidayProvider: england,
  weekdayValues: [null, "16:00", "16:00", "16:00", "16:00", "16:00", null],
  recurringRules: [{ dayBeforeHoliday: true, skipWeekdays: [0, 6], value: "12:00" }],
});
cutoffs.valueOn("2026-05-22"); // "12:00"（5 月 25 日の Spring bank holiday の前の金曜日）
cutoffs.valueOn("2026-05-15"); // "16:00"
```

**有効期間**（`effectiveFrom`・`effectiveTo`）を付けると、規則の変更を 1 つのカレンダーで表しながら、過去の日付の判定も変えずに再現できます。繰り返しの規則と、毎年の休業日（`closedAnnualDates` のオブジェクトの形）に付けられます。

```ts
const shop = createCalendar({
  holidayProvider: jp,
  closedRecurringRules: [
    { weekday: 1, name: "月曜定休", effectiveTo: "2027-03-31" },
    { weekday: 2, name: "火曜定休", effectiveFrom: "2027-04-01" },
    { weekday: 3, interval: 2, anchor: "2026-01-07", name: "隔週水曜定休" },
  ],
  closedAnnualDates: [{ from: "08-13", to: "08-16", name: "夏季休業", effectiveTo: "2026-12-31" }],
});

shop.isBusinessDay("2027-03-29"); // false（変更前の月曜）
shop.isBusinessDay("2027-04-06"); // false（変更後の火曜）
shop.addBusinessDays("2027-03-30", 3); // "2027-04-03"（切り替えをまたいで数える。3 月 31 日は隔週の水曜）
shop.isBusinessDay("2027-08-13"); // true（夏季休業は 2026 年で終了）
```

- 期間の外では規則を当てはめないだけで、判定の優先順位は変わりません。`effectiveFrom`・`effectiveTo` の一方だけなら、もう一方は期限なしです
- `"after-holiday"` の規則は、本来当てはまる日（振替元）で期間を判定します。振替元が期間の中なら、振替先が期間の外でも振り替えます
- 定休日の曜日の変更は、上の例のように期間付きの毎週の規則 2 つで書きます（`closedWeekdays` には期間を付けられません）

**祝日に当たったときの扱い**（`holidayOverlapPolicy`）は、規則ごとに選べます。

| 値                        | 意味                                                       | 店舗の告知での書き方                     |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| `"under-holiday"`（既定） | 祝日の下。祝日の扱い（`holidayPolicy`）に従う              | 「第 3 水曜定休（祝日の場合は営業）」    |
| `"over-holiday"`          | 祝日の上。祝日でも当てはめる                               | 「第 3 水曜定休（祝日も休み）」          |
| `"after-holiday"`         | 祝日の後。祝日には当てはめず、次の祝日でない日に振り替える | 「月曜休館（祝日なら次の祝日でない日）」 |

- `"under-holiday"` の規則は、`holidayPolicy: "ignore"`（祝日を判定に使わない）なら祝日にも当てはまります
- `"after-holiday"` の振替先は「その日以降で最初の祝日でない日」で、土曜日のこともあります（週末も飛ばすなら `skipWeekdays`）。祝日が続く場合（GW など）は連休が明けた日になります。振替先の日に臨時営業日・臨時休業日・毎年の休業日があれば、そちらが優先です。振替で決まった日の `dayInfoOn()` には、振替の元の日付 `shiftedFrom` が付きます
- 振替の判断に使う「祝日」は、祝日の提供元（`jp` など）の祝日だけです（毎年の休業日などは含みません）
- `openDates`・`closedDates`・`closedAnnualDates`・`openRecurringRules`・`closedRecurringRules`（振替先を含む）で決まった日の `dayInfoOn()` には、その規則の設定の中の位置 `optionPath` が、規則の診断の `path` と同じ形（`"closedRecurringRules[0]"` など）で付きます。同じ `name` の規則も区別できます。祝日・`closedWeekdays` で決まった日には付きません

スケジュールでは、同じ書き方の規則に `value` を付けて `recurringRules` に指定します。

```ts
const hours = createSchedule<Hours>({
  holidayProvider: jp,
  weekdayValues: [sunday, weekday, weekday, weekday, weekday, weekday, weekday],
  recurringRules: [
    { weekday: 1, value: null, name: "月曜休業", holidayOverlapPolicy: "after-holiday" },
    { dayOfMonth: -1, value: { open: "10:00", close: "17:00" }, name: "月末は短縮営業" },
    { dayBeforeHoliday: true, value: { open: "10:00", close: "23:00" }, name: "祝前日は夜間営業" },
  ],
});
hours.valueOn("2026-05-02"); // { open: "10:00", close: "23:00" }（5 月 3〜6 日の連休の前日）
hours.dayInfoOn("2026-05-04").reason; // "weekday"（連休の中の祝日は祝前日ではない）
```

## カレンダーの合成

`combineCalendars` は、複数のカレンダーから 1 つのカレンダーを作ります。**すべて**が営業している日（`open: "all"`）か、**いずれか**が営業している日（`"any"`）を営業日にします。結果は通常のカレンダーなので、営業日の加減算・`adjust`・`dueDate` などが合成結果で動きます。

```ts
import { combineCalendars, createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const company = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-29", to: "01-03", name: "年末年始休業" }],
});
const bank = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "銀行休業日" }],
});

// 振込は、自社と銀行の両方が営業している日に処理される
const remittance = combineCalendars([company, bank], { open: "all" });
remittance.addBusinessDays("2026-12-28", 2); // "2027-01-05"
remittance.dayInfoOn("2026-12-29");
// { date: "2026-12-29", weekday: 2, open: false, reason: "closed-annual", name: "年末年始休業", optionPath: "closedAnnualDates[0]", decidedBy: 0, decidedByPath: [0] }

// 複数の店舗のどこかが開いている日
const anyStore = combineCalendars([company, bank], { open: "any" });
anyStore.isBusinessDay("2026-12-29"); // true
```

- `dayInfoOn` の `reason`・`name`・`shiftedFrom`・`optionPath` は、合成結果と同じ判定をした最初のカレンダーの結果で、そのカレンダーの番号（渡した配列の位置）を `decidedBy` で返します（`optionPath` はそのカレンダーの設定の中の位置です）。`"all"` なら、休業日は最初に休みだったカレンダー、営業日は 0 番（すべて営業）です。`"any"` はその逆です
- `decidedByPath` は、判定を決めたカレンダーまでの番号の列（外側から順）です。合成したカレンダーをさらに合成したとき、`optionPath` がどのカレンダーの設定の位置かを結果だけから辿れます。入れ子でない合成では `[0]` のように長さ 1 で `decidedBy` と同じ、入れ子では `[0, 1]`（0 番のカレンダーの中の 1 番）のようになります。`decidedBy` は外側の番号のままです
- `holiday`・`isHoliday`・`holidaysInYear` などは、すべてのカレンダーの祝日の提供元の和集合で判定します。同じ提供元のオブジェクトは 1 つに数え、包んだ提供元（`jp` から一部の種別を除いたものなど）は別の提供元として残り、同じ日付に祝日のある提供元が 2 つあれば、先のカレンダーの提供元の祝日を `holiday` に付けます。そのため、包んだ `jp` のカレンダーと `jp` そのもののカレンダーを合成すると、営業日の判定は変わらないまま、除いたはずの祝日が `holiday` に付きます。`outOfRangePolicy` は、どれかのカレンダーが対応年の外で例外になるなら `"throw"` です
- タイムゾーンはすべてのカレンダーで同じでなければなりません（違えば `time-zone-conflict`）。2 つ未満、同じカレンダーを 2 回渡すと `invalid-argument` です。`searchDayLimit`（既定 3660）をオプションで指定できます
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
const calendar = createCalendar({
  holidayProvider: jpWithoutCitizensHoliday,
  closedWeekdays: [0, 6],
});
```

**1 つの配列で持っている特別営業日を振り分ける**：年月日（`"YYYY-MM-DD"`）は `dates`、毎年の月日（`"MM-DD"`）は `annualDates` に渡します。

```ts
type Hours = { open: string; close: string } | null;
const regular: Hours = { open: "10:00", close: "19:00" };
const specialDays: { date: string; value: Hours }[] = [
  { date: "2026-12-31", value: { open: "10:00", close: "17:00" } },
  { date: "01-01", value: null },
];
const special = createSchedule<Hours>({
  weekdayValues: [regular, regular, regular, regular, regular, regular, regular],
  dates: specialDays.filter((d) => d.date.length === 10),
  annualDates: specialDays.filter((d) => d.date.length === 5),
});
special.valueOn("2027-01-01"); // null
```

**その日が月の第何営業日か**：月初からその日の前日までの営業日数に 1 を足します。`diffBusinessDays` は `to` を含まないので、その日の分が `+ 1` です。`nthBusinessDayOfMonth` の逆算になります。

```ts
import { monthOf } from "bizdays-toolkit";

const calendar = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
const businessDayIndex = (date: string): number =>
  calendar.isBusinessDay(date) ? calendar.diffBusinessDays(`${monthOf(date)}-01`, date) + 1 : 0;
businessDayIndex("2026-10-07"); // 5（10 月の第 5 営業日）
businessDayIndex("2026-10-03"); // 0（土曜日は営業日でない）
calendar.nthBusinessDayOfMonth("2026-10", 5); // "2026-10-07"
```

**次の休業日と、その理由**：`nextClosedDay` はありませんが、`daysBetween` が毎日の `dayInfoOn` を返すので、営業日でない最初の日を取ります。

```ts
import { addDays } from "bizdays-toolkit";

const calendar = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
const nextClosedDay = (date: string) =>
  calendar.daysBetween(addDays(date, 1), addDays(date, 60)).find((d) => !d.open);
nextClosedDay("2026-10-05")?.date; // "2026-10-10"
nextClosedDay("2026-10-05")?.reason; // "closed-weekday"
nextClosedDay("2026-10-11")?.reason; // "holiday"（10 月 12 日のスポーツの日）
```

**銀行の営業日**：銀行は土日・祝日と 12 月 31 日〜1 月 3 日が休みなので、3 行で書けます。振込の着金日は、自社のカレンダーと合成して求めます（「カレンダーの合成」）。

```ts
const bank = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "銀行休業日" }],
});
bank.isBusinessDay("2026-12-30"); // true
bank.nextBusinessDay("2026-12-30"); // "2027-01-04"
```

**共通の設定から店舗ごとのカレンダーを作る**：設定は普通のオブジェクトなので、展開して足します。

```ts
const base = {
  holidayProvider: jp,
  closedWeekdays: [0],
  closedAnnualDates: [{ from: "12-31", to: "01-03" }],
} as const;
const shibuya = createCalendar({ ...base, openDates: ["2026-12-27"] });
const yokohama = createCalendar({ ...base, closedRecurringRules: [{ weekday: 3, nth: 3 }] });
```

## 月の期日と日付の調整

休業日に当たった日付を、指定した方法で営業日に調整します。月の第 n 営業日や、「毎月 n 日（休業日なら翌営業日）」のような期日も求められます。

```ts
import { closingMonth, createCalendar, monthOf } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const calendar = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "年末年始" }],
});

calendar.adjust("2026-10-31", { convention: "following" }); // "2026-11-02"（10/31 は土曜日）
calendar.adjust("2026-10-31", { convention: "modified-following" }); // "2026-10-30"（月が変わるので前へ）

calendar.firstBusinessDayOfMonth("2027-01"); // "2027-01-04"
calendar.lastBusinessDayOfMonth("2026-12"); // "2026-12-30"
calendar.nthBusinessDayOfMonth("2026-10", 5); // "2026-10-07"（-1 は最終、-2 は最後から 2 番目）

// 毎月 10 日払い（休業日なら翌営業日）
calendar.dueDate("2026-10", { dayOfMonth: 10, convention: "following" }); // "2026-10-13"（12 日はスポーツの日）

// 20 日締め・翌月末払い（休業日なら前営業日）
const billing = closingMonth("2026-10-21", 20); // "2026-11"（10/21〜11/20 が 11 月分）
calendar.dueDate(monthOf(billing, 1), { dayOfMonth: -1, convention: "preceding" }); // "2026-12-30"
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

- `monthOf(input, offset?)`: 日付または月 `"YYYY-MM"` の、`offset` か月後（負なら前）の月
- `closingMonth(date, closingDayOfMonth)`: 締め日（1〜31、`-1` は末日）で区切ったときに日付が属する月。締め日の翌日から次の締め日までを、次の締め日の月とします。締め日がその月にない日（31 日締めの 2 月など）は末日締めです
- `closingPeriod(input, closingDayOfMonth)`: その逆算で、その月分の期間 `{ from, to }`（両端を含む。前月の締め日の翌日から締め日まで）。暦日を渡すと、その日が属する期間です。日付の期間の形なので、`closedDates` や `businessDatesBetween` にそのまま渡せます

```ts
closingPeriod("2026-11", 20); // { from: "2026-10-21", to: "2026-11-20" }
closingPeriod("2026-03", 31); // { from: "2026-03-01", to: "2026-03-31" }（2 月の 31 日締めは 28 日締め）
const { from, to } = closingPeriod("2026-11-05", 20); // "2026-11-05" が属する期間
const office = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
office.businessDatesBetween(from, to).length; // 22（11 月分の営業日数）
```

**営業日に動く締め日**: 「20 日締め、締め日が休業日なら前営業日締め」のような契約は、カレンダーの `closingMonth(date, closingDayOfMonth, { convention })`・`closingPeriod(input, closingDayOfMonth, { convention })` で扱います。各月の締め日（その月にない日は末日）を `adjust` と同じ `convention`（必須、既定値なし）で営業日に調整し、日付は「調整後の締め日がその日以降になる最初の月」に属します。ルートの関数は暦日のまま区切ります。

```ts
const office = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
// 締め日の 2026-09-20 は日曜。"preceding" なら 9 月の締め日は金曜の 18 日
office.closingMonth("2026-09-19", 20, { convention: "preceding" }); // "2026-10"（19 日は 9 月の締めのあと）
closingMonth("2026-09-19", 20); // "2026-09"（暦日の締め）
office.closingPeriod("2026-10", 20, { convention: "preceding" }); // { from: "2026-09-19", to: "2026-10-20" }
```

前月の締め日から当月の締め日までに営業日が 1 日もない月（改装などの長期休業）は、固有の期間を持ちません。その日は次の月に属し、`closingMonth` はその月を返さず、その月の `closingPeriod` は `no-business-day` を投げます。`"following"` では締め日が長期休業を越えて後の月に動くことがあり、そのときは期間が空になるのではなく長くなります。

`dueDate` の `dayOfMonth` も、その月にない日（2 月 30 日など）は末日に読み替えます。繰り返しの規則（`{ dayOfMonth: 31 }`）はその月にない日に当てはまらないので、扱いが異なります。期日は「その月のどこか」に必ず決まる必要があるためです。

## 日ごとの値（営業時間など）

`createSchedule` は、曜日・祝日・特定日の規則から、日ごとに任意の値を返します。値の型は自由なので、営業時間のほか、受付枠や配送料の区分などにも使えます。

```ts
import { createSchedule } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

type Hours = { open: string; close: string } | null; // null は休業
const weekday = { open: "10:00", close: "21:00" };
const sunday = { open: "10:00", close: "19:00" };

const storeHours = createSchedule<Hours>({
  holidayProvider: jp,
  weekdayValues: [sunday, weekday, null, weekday, weekday, weekday, weekday], // [日, 月, …, 土]。火曜定休
  holidayPolicy: { sameAs: 0 }, // 祝日は日曜の値（"ignore": 曜日どおり / { value: … }: 指定の値）
  annualDates: [{ date: "01-01", value: null, name: "元日休業" }], // 毎年の月日（期間も可）
  dates: [{ date: "2026-12-31", value: { open: "10:00", close: "17:00" }, name: "大晦日" }],
});

storeHours.valueOn("2026-11-03"); // { open: "10:00", close: "19:00" }（文化の日は日曜の営業時間）
storeHours.dayInfoOn("2027-01-01");
// { date: "2027-01-01", weekday: 5, value: null, reason: "annual", name: "元日休業", holiday: {…}, optionPath: "annualDates[0]" }

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

`reason` は値を決めた規則で、`optionPath`（`dates`・`annualDates`・`recurringRules`）はその設定の中の位置です。`holidayPolicy: "ignore"`（祝日も曜日どおり）のときは、祝日でも `reason` は `"weekday"` になるので、祝日かどうかは `holiday` の有無で判定します。`holiday` だけで絞ると、`dates`・`annualDates` で値を決めた祝日（元日の特別営業など）も含まれます。祝日の扱いに従う祝日だけを一覧にする場合は、最後の例のように、`reason` が `"date"`・`"annual"` の日も除きます。祝日かどうかは `holiday` で、どの規則が値を決めたかは `reason` で見る、という分担です。

値は `dates`（個別の日付・期間）→ `annualDates`（毎年の月日・期間）→ `recurringRules`（`"over-holiday"`）→ 祝日 → `recurringRules`（既定・振替先）→ `weekdayValues`（曜日）の順に決まります。同じ種類の規則が重なる場合は、配列で先に書いたものが優先です。

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
  holidayProvider: jp,
  weekdayValues: [
    null,
    weekday,
    weekday,
    weekday,
    weekday,
    weekday,
    { open: "10:00", close: "17:00" },
  ],
  holidayPolicy: { sameAs: 0 },
  annualDates: [
    { from: "12-31", to: "01-03", value: null, name: "年末年始休業" },
    { date: "01-04", value: { open: "11:00", close: "15:00" }, name: "仕事始め" },
  ],
});
const calendar = createCalendarFromSchedule(hours, (v) => v !== null);
calendar.addBusinessDays("2026-12-29", 2); // "2027-01-04"
calendar.dayInfoOn("2027-01-04");
// { date: "2027-01-04", weekday: 1, open: true, reason: "open-annual", name: "仕事始め", optionPath: "annualDates[1]" }
```

- `isOpen` は値だけで決まる純粋な関数にしてください。受け取るのは値だけ（日付は渡されません）で、カレンダーは営業日を探す間に `isOpen` を繰り返し呼ぶので、日付・時刻・外部の状態を見る関数を渡すと、結果が呼ぶたびに変わってしまいます。日付で変えたい条件は、スケジュールの規則（`dates`・`recurringRules`）に書きます
- `dayInfoOn` の `reason` は、スケジュールの `reason` をカレンダーの `reason` に対応させたものです。`date` → `"open-date"`/`"closed-date"`、`annual` → `"open-annual"`/`"closed-annual"`、`recurring` → `"open-recurring"`/`"closed-recurring"`、`holiday` → `"holiday"`（祝日が営業でも。`holidayPolicy: "open"` と同じ）、`weekday` → `"open-weekday"`/`"closed-weekday"`。`"open-annual"` はこの作り方のカレンダーにだけ現れます（`createCalendar` の `closedAnnualDates` は休業だけのため）。`name`・`holiday`・`shiftedFrom`・`optionPath` はスケジュールの結果のままです
- 祝日・タイムゾーン・`outOfRangePolicy` はスケジュールのものです。設定の診断は `diagnoseSchedule` でスケジュールの設定に対して行います（カレンダー自体は診断しません）。`searchDayLimit`（既定 3660）をオプションで指定できます
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
const store = createCalendar({ holidayProvider: jp, closedWeekdays: [0] });
const opensAt = store.instantOf(store.nextBusinessDay(store.today()), "10:00"); // 次に開く瞬間（Date）
```

夏時間の切り替えでは、Temporal の既定（`disambiguation: "compatible"`）と同じです。存在しない時刻（英国の 3 月最終日曜の 01:00〜01:59）は飛んだ分だけ後ろにずらし、2 回ある時刻（10 月最終日曜の 01:00〜01:59）は先のほうです。

```ts
import { england } from "bizdays-toolkit/uk";

const uk = createCalendar({ holidayProvider: england });
uk.instantOf("2026-03-29", "01:30").toISOString(); // "2026-03-29T01:30:00.000Z"（02:30 BST。01:30 は存在しない）
uk.instantOf("2026-10-25", "01:30").toISOString(); // "2026-10-25T00:30:00.000Z"（1 回目の 01:30。まだ BST）
```

## 対応年の外

祝日の提供元の対応年（日本は 1955〜2099 年、英国は 1974〜2099 年、フランスは 2000〜2099 年、シンガポールは 2020〜2027 年）を外れた日付を判定すると `RangeError` になります。祝日がない日として扱いたい場合は `outOfRangePolicy: "ignore"` を指定してください。隣の日を見る規則（`dayAfterHoliday`・`dayBeforeHoliday`・`skipWeekdays`、`"after-holiday"` の規則がさかのぼる日）も、その日が対応年の外なら投げます。週の第 n 営業日の規則（`businessDayOfWeek`）も、その週が対応年の外にかかれば投げます。結果が分からない年の祝日に依存するためです（シンガポールでは、対応年の最後の 12 月 31 日に元日の前日の規則を当てた場合や、対応年の最後の年の 12 月の最後の週と 2020 年の最初の週に `businessDayOfWeek` の規則を当てた場合など）。`"ignore"` では外は祝日なしです。設定の診断は、走査の端で例外にならないよう、外を祝日なしとして扱います。

## 未確定の祝日

提供元の `confirmedThrough` より後の年には、予測の祝日（`confirmed: false`）が含まれることがあります。日本の春分の日・秋分の日（翌年分が毎年 2 月の官報で公表される）と、GOV.UK が公表している最後の年より後の英国の bank holidays です。既定では予測をそのまま使います。`unconfirmedHolidayPolicy: "throw"`（`outOfRangePolicy` と同じ場所。カレンダー・スケジュール共通）にすると、未確定の祝日を引いた判定は `code: "unconfirmed-holiday"` の `RangeError` になり、5 年の返済予定の期日や契約書に書く日付のように、予測に依存した結果が黙って出ることがなくなります。「引いた判定」には、求めた日だけでなく、探索が途中で通る日（`addBusinessDays`・`adjust`・`dueDate`・`closingMonth` など）や、`dayAfterHoliday`・`dayBeforeHoliday` の規則が見る日（隣の日。`skipWeekdays` があれば、そこから飛ばす曜日を越えて最も近い祝日まで）も含みます。`holidaysInYear`・`holidaysBetween` は投げないので、例外を受けたあとに影響する日を列挙する逃げ道になります。

```ts
import { createCalendar, isBizdaysError } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const strict = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  unconfirmedHolidayPolicy: "throw",
});
try {
  strict.dueDate("2028-03", { dayOfMonth: 20, convention: "following" });
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

- 意味があるのは、判定に祝日を使う設定だけです。`holidayPolicy: "ignore"`（カレンダーでもスケジュールでも）で祝日に従属する規則（`holiday`・`dayAfterHoliday`・`dayBeforeHoliday`・`"after-holiday"`）もない設定では結果は変わりませんが、`dayInfoOn` は `holiday` を付けるために祝日を引くので投げます。設定の診断はそのような設定を `redundant` にします
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

コード: `invalid-date`・`invalid-input`・`invalid-month`・`invalid-annual-date`・`invalid-time`・`invalid-range`・`invalid-weekday`・`invalid-time-zone`・`invalid-argument`・`invalid-option`・`time-zone-conflict`・`out-of-range`・`unconfirmed-holiday`・`invalid-provider`・`invalid-provider-data`・`no-business-day`。将来の版でコードが増えることがあります。

## 設定の診断

`bizdays-toolkit/diagnose` の `diagnoseCalendar`・`diagnoseSchedule` は、設定を調べて問題を一覧で返します。設定の問題では例外を投げません（問題がなければ空の配列）。例外になるのは第 2 引数の誤り（下記の `asOf`）だけです。

```ts
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

diagnoseCalendar({
  holidayProvider: jp,
  closedWeekdays: [0],
  closedRecurringRules: [
    { weekday: 3, nth: 3, name: "第 3 水曜定休" },
    { weekday: 3, nth: 3, months: [8], name: "8 月の第 3 水曜" }, // 先の規則に含まれる
    { weekday: 0, name: "日曜休み" }, // 定休日の曜日と同じ
  ],
  closedDates: ["2100-01-05"], // 日本の祝日の対応年（1955〜2099 年）の外
  closeAnnual: ["12-31"], // 打ち間違い
});
// [
//   { severity: "warning", code: "unknown-option", path: "closeAnnual", message: '… (did you mean "closedAnnualDates"?)' },
//   { severity: "warning", code: "out-of-range", path: "closedDates[0]", relatedPath: "holidayProvider", message: "…" },
//   { severity: "warning", code: "shadowed", path: "closedRecurringRules[1]", relatedPath: "closedRecurringRules[0]", message: "…" },
//   { severity: "info", code: "redundant", path: "closedRecurringRules[2]", message: "…" },
// ]
```

| 重さ（`severity`） | `code`                  | 内容                                                                                                                                                                                                                           |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error`            | 例外と同じコード        | `createCalendar`・`createSchedule` で例外になる誤り。作成時は最初の 1 件で止まりますが、診断ではすべて返します                                                                                                                 |
| `error`            | `invalid-provider-data` | 祝日の提供元が返したデータの誤り。作成時は使った年だけを調べますが、診断では対応年のすべての年を調べます                                                                                                                       |
| `warning`          | `unknown-option`        | 知らないキー（作成時は無視されます）。近い既知のキーがあれば `message` に候補を挙げます                                                                                                                                        |
| `warning`          | `deprecated-option`     | 0.30.0 で改名した旧名のキー・値（1.0.0 までは新しい名前と同じに扱います）。`path` は旧名を書いた位置で、`message` に新しい名前を挙げます。保存した設定は `migrateCalendarOptions`・`migrateScheduleOptions` で書き換えられます |
| `warning`          | `shadowed`              | 同じ種類の先の規則（`relatedPath`）に完全に含まれ、決して使われない規則                                                                                                                                                        |
| `warning`          | `never-matches`         | 当てはまる日がない繰り返しの規則（`{ dayOfMonth: 30, months: [2] }`、有効期間の中に第 5 水曜日がない、提供元のない設定の `dayAfterHoliday`、など）                                                                             |
| `warning`          | `out-of-range`          | 個別の日付、または規則の有効期間が、祝日の提供元（`relatedPath`）の対応年の外                                                                                                                                                  |
| `warning`          | `no-business-day`       | 営業日が 1 日もない設定（営業日カレンダーのみ。営業日を探すと例外になります）                                                                                                                                                  |
| `info`             | `redundant`             | 取り除いても結果が変わらない規則（先の規則の組み合わせに覆われる、定休日の曜日と同じ、スケジュールで曜日の値と同じ値など）、または判定に祝日を使わない設定の `unconfirmedHolidayPolicy: "throw"`                               |
| `info`             | `counting-basis`        | `businessDayOfMonth` の規則と、同じ設定の毎週の曜日の規則が同居している。その曜日は営業日として数えられる（[繰り返しの規則](#繰り返しの規則)）                                                                                 |
| `info`             | `expired`               | `asOf`（下記）を渡したときだけ。基準日より前に終わった規則・日付                                                                                                                                                               |

- 判定には `code` を使ってください。`message` は英語で、文言は変わることがあります。`code` は将来の版で増えることがあります
- `error` があるときは、規則どうしの診断（`shadowed`・`redundant` など）は行いません
- `shadowed` は同じ種類の規則どうし（個別の日付どうし、毎年の月日どうし、繰り返しの規則どうし）だけを調べます。判定の順番は固定なので、種類をまたいで使われない規則は `redundant` として見つかります。臨時営業日（`openDates`）と臨時休業日（`closedDates`）は同じ種類で、先の臨時営業日に含まれる臨時休業日は `shadowed` です
- 繰り返しの規則の `shadowed` は、祝日に当たったときの扱い（`holidayOverlapPolicy`）も見ます。たとえば `"under-holiday"` の規則は、同じ日に当たる `"over-holiday"` の規則を覆いません（祝日には後の規則が当たるため）
- `dayAfterHoliday`・`dayBeforeHoliday` の規則の `shadowed` は、同じ種類の規則どうし（`kinds`・`keys`・`weekdays`・`months`・期間と、同じ `skipWeekdays`）でだけ調べます。当てはまる日が年ごとの祝日で変わるためで、曜日の規則との重なりは `redundant` で見つかります。`cycle` の規則の `shadowed` は `cycle` の規則どうしでだけ調べ、後の規則の周期が先の規則の周期の倍数で、後の規則のどの日も先の規則の日に当たるときに覆うとみなします
- 有効期間のある規則の `shadowed` は、先の規則の期間が後の規則の期間を含むことも条件です。周期（`interval`）のある規則は、先の規則の周期が後の規則を含むことも条件です（毎週は隔週を覆う。位相の違う隔週どうしは互いを覆わない）
- `redundant` は、規則を取り除いた結果と 1 日ずつ比べます。個別の日付はその期間を、毎年の月日と繰り返しの規則は個別の日付を除いた設定で、祝日の提供元の対応年（日本は 1955〜2099 年）を、提供元がなければ 2001〜2028 年（曜日と月日の組み合わせが一巡する 28 年。周期（`interval`・`cycle`）のある規則があれば、その周期がそろう長さ。隔週なら 56 年、最長 200 年）を調べます。その範囲の外にある有効期間も調べます（`outOfRangePolicy: "throw"` では対応年の中だけ）。調べた年は `message` に書かれます。スケジュールの値は、配列と普通のオブジェクトなら中身で、それ以外（`Date` など）は同じものかで比べます
- `shadowed` と `redundant` は、規則を 1 つずつ外したときの判定です。同じ規則を 2 つ書くと、後の規則が `shadowed`、前の規則が `redundant` と出ますが、両方を外すと結果が変わります。複数の規則が出たときは、1 つ外すたびに診断をやり直してください
- 日本の祝日を使う設定では、全日を調べるため数百ミリ秒かかります。リクエストごとではなく、テストや起動時の確認で使ってください。開発・テスト用の道具なので、アプリの本体のバンドルに入らないようサブパスに分けています

**終わった規則を見つける**（`asOf`）: 店舗ごとの設定を JSON で持つ多店舗のサービスなどでは、設定が年を追って溜まります。第 2 引数に `{ asOf: "YYYY-MM-DD" }` を渡すと、`effectiveTo` がその日より前の規則と、その日より前に終わる個別の日付・期間を、`info` の `expired` で返します（`redundant` とは独立です。過去には効いていた規則なので）。`asOf` を渡さなければ `expired` は返さないので、`assert.deepEqual(diagnoseCalendar(options), [])` のようなテストが日付で変わることはありません。`asOf` は暦日の文字列だけを受け付けます（`Date` だとタイムゾーンが要るため）。それ以外の値は `invalid-date`、第 2 引数がオブジェクトでなければ `invalid-argument` の例外になり、知らないキーは無視します。

```ts
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

diagnoseCalendar(
  {
    holidayProvider: jp,
    closedRecurringRules: [
      { weekday: 1, name: "月曜定休", effectiveTo: "2027-03-31" },
      { weekday: 2, name: "火曜定休", effectiveFrom: "2027-04-01" },
    ],
    closedDates: ["2026-02-10"],
  },
  { asOf: "2028-01-01" },
).map((d) => [d.code, d.path]); // [["expired", "closedDates[0]"], ["expired", "closedRecurringRules[0]"]]
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

### 0.30.0 より前に保存した設定

0.30.0 で、キーと値の名前を 1 つの規則に合わせて改めました（`closedAnnual` → `closedAnnualDates`、`holidays` → `holidayProvider`、規則の `day` → `dayOfMonth` など。すべては移行ガイドにあります）。1.0.0 までは旧名も受け付け、診断は旧名を書いた位置で `deprecated-option` を返します。`migrateCalendarOptions`・`migrateScheduleOptions` は、保存した設定を検証せずに新しい名前に書き換え、書き換えたものを元の位置で返します。

```ts
import { migrateCalendarOptions } from "bizdays-toolkit/diagnose";

const { options, changes } = migrateCalendarOptions({
  closedAnnual: [{ date: "12-31" }],
  closedRecurring: [{ day: 25 }],
});
options; // { closedAnnualDates: [{ date: "12-31" }], closedRecurringRules: [{ dayOfMonth: 25 }] }
changes.map((c) => c.path); // ["closedAnnual", "closedRecurring", "closedRecurring[0].day"]
```

保存した設定には、ふつう祝日の提供元が入っていません（関数を持つオブジェクトのため）。日本の祝日の種別 `"national"`（今は `"regular"`）は、設定のすべての祝日の提供元の ID が `"JP"` のときだけ書き換えるので、読み込み時に付ける提供元を書き換えの前に入れ、保存の前に外します。提供元がなければ `"national"` はそのまま残り、`changes` にも出ません。ほかの提供元と合わせて使う設定でも、`"regular"` がほかの提供元の祝日にも当たるので書き換えません（そのような設定の書き方は移行ガイド）:

```ts
import { migrateCalendarOptions } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

const stored = '{"closedRecurring":[{"holiday":true,"kinds":["national"]}]}'; // 0.30.0 より前に保存した設定
const migrated = migrateCalendarOptions({ ...JSON.parse(stored), holidayProvider: jp });
const { holidayProvider, ...toSave } = migrated.options; // 保存の前に提供元を外す
toSave; // { closedRecurringRules: [{ holiday: true, kinds: ["regular"] }] }
```

書き換えなかった旧名は、書き換えた設定を診断にかけると `deprecated-option` で見つかります。保存した設定を一括で移行するときは、書き換えた後に診断を実行し、`deprecated-option` が残っていないことを確かめてください。ほかの提供元と合わせた設定の `"national"` は、手で書き換える必要があります:

```ts
import { diagnoseCalendar, migrateCalendarOptions } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";
import { england } from "bizdays-toolkit/uk";

const { options } = migrateCalendarOptions({
  holidayProvider: [jp, england],
  timeZone: "Asia/Tokyo",
  holidayPolicy: "open",
  closedRecurring: [{ holiday: true, kinds: ["national"] }],
});
diagnoseCalendar(options).map((d) => `${d.code} ${d.path}`); // ["deprecated-option closedRecurringRules[0].kinds[0]"]
```
