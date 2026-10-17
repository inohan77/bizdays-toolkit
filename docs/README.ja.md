<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inohan77/bizdays-toolkit/main/docs/assets/logo-dark.svg">
    <img src="https://raw.githubusercontent.com/inohan77/bizdays-toolkit/main/docs/assets/logo-light.svg" alt="bizdays-toolkit" width="400">
  </picture>
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/bizdays-toolkit"><img src="https://img.shields.io/npm/v/bizdays-toolkit" alt="npm version"></a>
  <a href="https://github.com/inohan77/bizdays-toolkit/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/inohan77/bizdays-toolkit/ci.yml?branch=main&amp;label=CI" alt="CI status"></a>
  <a href="https://github.com/inohan77/bizdays-toolkit/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/bizdays-toolkit" alt="license"></a>
  <img src="https://img.shields.io/node/v/bizdays-toolkit" alt="Node.js version">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="zero dependencies">
  <img src="https://img.shields.io/badge/types-included-blue" alt="TypeScript types included">
</p>

<p align="center"><a href="../README.md">English</a> | <b>日本語</b></p>

祝日と、会社・店舗の休業日を組み合わせた営業日カレンダーです。

- **日本の祝日を内閣府のデータで全日照合**: 1955 年〜官報公表済みの年まで、内閣府「国民の祝日」CSV のすべての日付と一致することをテストで確かめています（振替休日・国民の休日・皇室行事による休日・五輪特措法による移動を含む）
- **英国の bank holidays を GOV.UK のデータで全日照合**: England・Wales・Scotland・Northern Ireland を地域ごとに選べます。2012 年から GOV.UK が公表している最後の年まで、すべての日付と名称が GOV.UK のデータと一致することをテストで確かめ、差分は毎日監視しています
- **繰り返しの規則**: 「第 3 水曜定休」「毎月末日は棚卸」「月曜休館（祝日の場合は翌平日）」のような規則を、祝日に当たったときの扱い（祝日に従う・祝日でも当てはめる・翌日に振り替える）とあわせて指定できます
- **日ごとの値（営業時間など）**: 「火曜定休、祝日は日曜の営業時間、元日は休業、大晦日は短縮営業」のように、曜日・祝日・特定日で変わる値を同じ規則で引けます
- **設定の診断**: `bizdays-toolkit/diagnose` の `diagnoseCalendar`・`diagnoseSchedule` が、決して使われない規則・取り除いても結果が変わらない規則・キーの打ち間違い・営業日が 1 日もない設定などを、例外を投げずに一覧で返します。テストに 1 行足せば、設定の変更で規則が死んでいないかを確かめられます
- **月の期日**: 「20 日締め翌月 10 日払い（休業日なら翌営業日）」「月末の最終営業日」のような期日を、金融で使われる 4 つの調整方法（following・preceding・modified-following・modified-preceding）で計算します
- **営業日の計算**: 定休日の曜日・毎年の休業日（年末年始のような年をまたぐ期間も可）・臨時休業日・臨時営業日と祝日を組み合わせ、「N 営業日後」「締め時刻を過ぎたら翌営業日」などを計算します
- **タイムゾーンを間違えない**: `Date` などの瞬間は、カレンダーのタイムゾーン（日本は `Asia/Tokyo`）で暦日に変換してから判定します。UTC で動くサーバーでも、日本時間 0〜9 時が前日扱いになりません
- **軽量・依存ゼロ**: minify + gzip で約 7.4KB（日本の祝日込みで約 9.0KB、英国の祝日込みで約 9.0KB）。ESM・型定義同梱・`sideEffects: false` で、Node.js・ブラウザー・Edge ランタイムで動作します
- **他の国・地域に拡張できる**: 祝日の提供元はインターフェース（`HolidayProvider`）で差し替えられます。日本と英国を同梱しています

## インストール

```sh
pnpm add bizdays-toolkit
```

Node.js 22.12 以上。CI で Node.js 22.12・22・24・26 を確認しています。ESM のみですが、CommonJS からも `require()` で読み込めます（これも CI で確認しています）。

## 使い方

### 祝日を調べる

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

### 営業日カレンダー

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
shipping.businessDayOnOrAfter(new Date(), { cutoff: "14:00" });

shipping.dayInfo("2027-01-01");
// { date: "2027-01-01", weekday: 5, businessDay: false, reason: "closed-annual", name: "年末年始", holiday: {…} }
```

1 日の判定は次の優先順位で行います（上が優先）。

1. `openDates`（臨時営業日）
2. `closedDates`（臨時休業日）
3. `closedAnnual`（毎年の休業日）
4. `openRecurring`・`closedRecurring` のうち `onHolidayRule: "over-holiday"` の規則（祝日でも当てはめる）
5. 祝日（`holidayPolicy` に従う。`"open"` は定休日の曜日より優先して営業日にする）
6. `openRecurring`・`closedRecurring`（既定の `"under-holiday"` と、`"after-holiday"` の振替先）
7. `closedWeekdays`（定休日の曜日）
8. それ以外は営業日

この順番は固定です。繰り返しの規則と祝日の関係だけは、規則ごとに `onHolidayRule` で選べます（次の節）。

### 繰り返しの規則（毎週・毎月の第 n 曜日・毎月の日）

「第 3 水曜定休」「第 2・第 4 土曜休業」「毎月末日は棚卸」「月曜休館（祝日の場合は翌平日）」のような繰り返しの休業日・営業日は、`closedRecurring`・`openRecurring` で指定します。

```ts
const museum = createCalendar({
  holidays: jp,
  holidayPolicy: "open", // 祝日は開館
  closedRecurring: [
    { weekday: 1, name: "月曜休館", onHolidayRule: "after-holiday" }, // 祝日の場合は翌平日に休館
    { weekday: 3, nth: 3, months: [2, 8], name: "2 月・8 月の第 3 水曜は臨時休館" },
    { day: -1, name: "月末棚卸", onHolidayRule: "over-holiday" }, // 祝日でも休館
  ],
});

museum.isBusinessDay("2026-10-12"); // true（スポーツの日の月曜は開館）
museum.dayInfo("2026-10-13");
// { date: "2026-10-13", weekday: 2, businessDay: false, reason: "closed-recurring",
//   name: "月曜休館", shiftedFrom: "2026-10-12" }
```

| 書き方                   | 意味                                                                            |
| ------------------------ | ------------------------------------------------------------------------------- |
| `{ weekday: 1 }`         | 毎週月曜日                                                                      |
| `{ weekday: 3, nth: 3 }` | 第 3 水曜日。`nth` は 1〜5 と -1（最終）。`[2, 4]` のように配列で複数指定できる |
| `{ day: 20 }`            | 毎月 20 日。`day` は 1〜31 と -1（末日）。配列で複数指定できる                  |
| `months: [8, 12]`        | どの書き方にも付けられる、月の絞り込み                                          |

- **第 n 何曜日**は「その月で n 回目のその曜日」です（1〜7 日が第 1）。カレンダーの第 n 週の行にある曜日ではありません
- **その月にない日**（`nth: 5` がない月、`day: 31` がない月）は当てはまりません。末日は `day: -1` で指定します
- 繰り返しの規則どうしは配列で先に書いたものが優先で、`openRecurring` は `closedRecurring` より優先です

**祝日に当たったときの扱い**（`onHolidayRule`）は、規則ごとに選べます。

| 値                        | 意味                                                     | 店舗の告知での書き方                  |
| ------------------------- | -------------------------------------------------------- | ------------------------------------- |
| `"under-holiday"`（既定） | 祝日の下。祝日の扱い（`holidayPolicy`）に従う            | 「第 3 水曜定休（祝日の場合は営業）」 |
| `"over-holiday"`          | 祝日の上。祝日でも当てはめる                             | 「第 3 水曜定休（祝日も休み）」       |
| `"after-holiday"`         | 祝日の後。祝日には当てはめず、祝日でない翌日に振り替える | 「月曜休館（祝日の場合は翌平日）」    |

- `"under-holiday"` の規則は、`holidayPolicy: "ignore"`（祝日を判定に使わない）なら祝日にも当てはまります
- `"after-holiday"` の振替先は「その日以降で最初の祝日でない日」です。祝日が続く場合（GW など）は連休が明けた日になります。振替先の日に臨時営業日・臨時休業日・毎年の休業日があれば、そちらが優先です。振替で決まった日の `dayInfo()` には、振替の元の日付 `shiftedFrom` が付きます
- 振替の判断に使う「祝日」は、祝日の提供元（`jp` など）の祝日だけです（毎年の休業日などは含みません）

スケジュールでは、同じ書き方の規則に `value` を付けて `recurring` に指定します。

```ts
const hours = createSchedule<Hours>({
  holidays: jp,
  weekly: [sunday, weekday, weekday, weekday, weekday, weekday, weekday],
  recurring: [
    { weekday: 1, value: null, name: "月曜休業", onHolidayRule: "after-holiday" },
    { day: -1, value: { open: "10:00", close: "17:00" }, name: "月末は短縮営業" },
  ],
});
```

### よくある設定の例

**国民の休日（祝日に挟まれた日）を営業日として扱う**：祝日の提供元を包んで、種別で除外します。

```ts
import { jp } from "bizdays-toolkit/jp";

const jpWithoutCitizensHoliday = {
  ...jp,
  holidaysInYear: (year: number) => jp.holidaysInYear(year).filter((h) => h.kind !== "citizens"),
};
const calendar = createCalendar({ holidays: jpWithoutCitizensHoliday, closedWeekdays: [0, 6] });
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

### 月の期日と日付の調整

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

`dueDate` の `day` も、その月にない日（2 月 30 日など）は末日に読み替えます。繰り返しの規則（`{ day: 31 }`）はその月にない日に当てはまらないので、扱いが異なります。期日は「その月のどこか」に必ず決まる必要があるためです。

### 日ごとの値（営業時間など）

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
// { date: "2027-01-01", weekday: 5, value: null, reason: "annual", name: "元日休業", holiday: {…} }
```

値は `dates`（個別の日付・期間）→ `annual`（毎年の月日・期間）→ `recurring`（`"over-holiday"`）→ 祝日 → `recurring`（既定・振替先）→ `weekly`（曜日）の順に決まります。同じ種類の規則が重なる場合は、配列で先に書いたものが優先です。

「今、営業時間内か」のような時刻の範囲の判定は、業種ごとの決まり（深夜をまたぐ営業、休憩時間など）があるためライブラリでは行いません。`civilOf` でタイムゾーンでの暦日と時刻を取り出せば、アプリ側で簡単に書けます。

```ts
const { date, time } = storeHours.civilOf(new Date()); // { date: "2026-10-14", time: "16:30" }（日本時間）
const hours = storeHours.valueOn(date);
const isOpen = hours !== null && time !== null && hours.open <= time && time < hours.close;
```

`civilOf` は営業日カレンダーにもあり、`bizdays-toolkit/jp` の `toJapanDateTime`、ルートの `toDateTimeParts(input, timeZone)` でも同じ変換ができます。

### 日付・日時の入力

すべてのメソッドは次の入力を受け付けます。戻り値の日付は常に `"YYYY-MM-DD"` 文字列です。

| 入力                                                 | 扱い                                           |
| ---------------------------------------------------- | ---------------------------------------------- |
| `"2026-11-23"`                                       | 暦日                                           |
| `"2026-11-23T10:00"`                                 | カレンダーのタイムゾーンでの日時（壁時計）     |
| `"2026-11-22T15:30:00Z"`・`"2026-11-23T00:30+09:00"` | 瞬間。カレンダーのタイムゾーンで暦日に変換する |
| `Date`                                               | 瞬間                                           |
| Temporal の `PlainDate`・`PlainDateTime`             | 暦日・日時（Temporal への依存はありません）    |
| Temporal の `Instant`・`ZonedDateTime`               | 瞬間                                           |

カレンダーのタイムゾーンは、`timeZone` オプション、祝日の提供元のタイムゾーン、`"UTC"` の順に決まります。

### 他の国・地域の祝日

`HolidayProvider` を実装して `holidays` に渡します。複数渡すと和集合になります（タイムゾーンが異なる場合は `timeZone` の指定が必要です）。

```ts
import { createCalendar, type HolidayProvider } from "bizdays-toolkit";

const myCountry: HolidayProvider = {
  id: "XX",
  timeZone: "Europe/Paris",
  supportedYears: { from: 2000, to: 2100 },
  dataVersion: "2026-10",
  holidaysInYear: (year) => [
    {
      date: `${year}-12-25`,
      name: "Noël",
      nameEn: "Christmas Day",
      kind: "public",
      confirmed: true,
    },
  ],
};
const calendar = createCalendar({ holidays: myCountry, closedWeekdays: [0, 6] });
```

祝日には、ほかの言語の名称を `names` で付けられます。キーは BCP 47 の言語タグの正規の形（`"zh-Hant"`・`"ko"` など）です。同梱の日本の祝日は `names` を持ちません（公式の出典がある日本語・英語だけを同梱しています）。英国では Wales だけがウェールズ語の名称を持ちます。必要な場合は、提供元を包んで付けます。

```ts
import { jp } from "bizdays-toolkit/jp";

const zhHant: Record<string, string> = { "2026-01-01": "元日" /* … 利用者が用意した訳 */ };
const jpWithNames = {
  ...jp,
  holidaysInYear: (year: number) =>
    jp.holidaysInYear(year).map((h) => {
      const name = zhHant[h.date];
      return name === undefined ? h : { ...h, names: { "zh-Hant": name } };
    }),
};
createCalendar({ holidays: jpWithNames }).getHoliday("2026-01-01")?.names; // { "zh-Hant": "元日" }
```

### 対応年の外

祝日の提供元の対応年（日本は 1955〜2099 年、英国は 2012〜2099 年）を外れた日付を判定すると `RangeError` になります。祝日がない日として扱いたい場合は `outOfRange: "ignore"` を指定してください。

### エラー

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

主なコード: `invalid-date`・`invalid-month`・`invalid-month-day`・`invalid-time`・`invalid-range`・`invalid-weekday`・`invalid-time-zone`・`invalid-option`・`out-of-range`・`invalid-provider`・`invalid-provider-data`・`no-business-day`。将来の版でコードが増えることがあります。

### 設定の診断

`bizdays-toolkit/diagnose` の `diagnoseCalendar`・`diagnoseSchedule` は、設定を調べて問題を一覧で返します。例外は投げません（問題がなければ空の配列）。

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

| 重さ（`severity`） | `code`                  | 内容                                                                                                                       |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `error`            | 例外と同じコード        | `createCalendar`・`createSchedule` で例外になる誤り。作成時は最初の 1 件で止まりますが、診断ではすべて返します             |
| `error`            | `invalid-provider-data` | 祝日の提供元が返したデータの誤り。作成時は使った年だけを調べますが、診断では対応年のすべての年を調べます                   |
| `warning`          | `unknown-option`        | 知らないキー（作成時は無視されます）。近い既知のキーがあれば `message` に候補を挙げます                                    |
| `warning`          | `shadowed`              | 同じ種類の先の規則（`relatedPath`）に完全に含まれ、決して使われない規則                                                    |
| `warning`          | `never-matches`         | 当てはまる日がない繰り返しの規則（`{ day: 30, months: [2] }` など）                                                        |
| `warning`          | `out-of-range`          | 個別の日付が祝日の提供元（`relatedPath`）の対応年の外                                                                      |
| `warning`          | `no-business-day`       | 営業日が 1 日もない設定（営業日カレンダーのみ。営業日を探すと例外になります）                                              |
| `info`             | `redundant`             | 取り除いても結果が変わらない規則（先の規則の組み合わせに覆われる、定休日の曜日と同じ、スケジュールで曜日の値と同じ値など） |

- 判定には `code` を使ってください。`message` は英語で、文言は変わることがあります。`code` は将来の版で増えることがあります
- `error` があるときは、規則どうしの診断（`shadowed`・`redundant` など）は行いません
- `shadowed` は同じ種類の規則どうし（個別の日付どうし、毎年の月日どうし、繰り返しの規則どうし）だけを調べます。判定の順番は固定なので、種類をまたいで使われない規則は `redundant` として見つかります。臨時営業日（`openDates`）と臨時休業日（`closedDates`）は同じ種類で、先の臨時営業日に含まれる臨時休業日は `shadowed` です
- 繰り返しの規則の `shadowed` は、祝日の扱い（`onHolidayRule`）も見ます。たとえば `"under-holiday"` の規則は、同じ日に当たる `"over-holiday"` の規則を覆いません（祝日には後の規則が当たるため）
- `redundant` は、規則を取り除いた結果と 1 日ずつ比べます。個別の日付はその期間を、毎年の月日と繰り返しの規則は個別の日付を除いた設定で、祝日の提供元の対応年（日本は 1955〜2099 年）を、提供元がなければ 2001〜2028 年（曜日と月日の組み合わせが一巡する 28 年）を調べます。スケジュールの値は、配列と普通のオブジェクトなら中身で、それ以外（`Date` など）は同じものかで比べます
- 日本の祝日を使う設定では、全日を調べるため数百ミリ秒かかります。リクエストごとではなく、テストや起動時の確認で使ってください。開発・テスト用の道具なので、アプリの本体のバンドルに入らないようサブパスに分けています

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

## バージョン番号とデータの更新

[Semantic Versioning](https://semver.org/lang/ja/) に従います。詳しくは [RELEASING.md](../RELEASING.md) を参照してください。

- 公式データの反映（法改正・官報公表・布告による祝日の新設・移動・臨時の祝日、春分・秋分の日の確定、GOV.UK の新しい年の公表）は**パッチ版**です。`^`・`~` のどちらで指定していても自動で届きます
- 祝日の判定結果を固定したい場合は、版を完全一致で指定してください（例: `"bizdays-toolkit": "0.1.0"`）
- 反映済みのデータは `dataVersion`（日本は反映済みの官報の年月、英国は反映済みの GOV.UK のデータの年月）と `confirmedThrough` で確認できます
- 1.0.0 までは、マイナー版で破壊的変更を行うことがあります
- 判定の理由（`reason`）・祝日の種別（`kind`）・エラーコード・診断のコードは、将来の版で値が増えることがあります。値を列挙して分岐するときは「その他」も扱ってください（[RELEASING.md](../RELEASING.md) の「互換性の約束」）

## 出典

日本の祝日の検証には、内閣府ホームページで公開されている「国民の祝日」の CSV（<https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>） を利用しています（テスト用フィクスチャのみ。パッケージには含みません）。

英国の祝日の検証には、GOV.UK の bank holidays のデータ（<https://www.gov.uk/bank-holidays.json>、それより前の年は GOV.UK の公式リポジトリ [alphagov/calendars](https://github.com/alphagov/calendars)・[alphagov/frontend](https://github.com/alphagov/frontend) の履歴）を、Wales の祝日のウェールズ語の名称には GOV.UK のウェールズ語版の表記を利用しています（照合のデータはテスト用フィクスチャのみ。パッケージには含みません）。

Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

## ライセンス

MIT
