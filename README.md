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

祝日と、会社・店舗の休業日を組み合わせた営業日カレンダーです。

- **日本の祝日を内閣府のデータで全日照合**: 1955 年〜官報公表済みの年まで、内閣府「国民の祝日」CSV のすべての日付と一致することをテストで確かめています（振替休日・国民の休日・皇室行事による休日・五輪特措法による移動を含む）
- **日ごとの値（営業時間など）**: 「火曜定休、祝日は日曜の営業時間、元日は休業、大晦日は短縮営業」のように、曜日・祝日・特定日で変わる値を同じ規則で引けます
- **営業日の計算**: 定休日の曜日・毎年の休業日（年末年始のような年をまたぐ期間も可）・臨時休業日・臨時営業日と祝日を組み合わせ、「N 営業日後」「締め時刻を過ぎたら翌営業日」などを計算します
- **タイムゾーンを間違えない**: `Date` などの瞬間は、カレンダーのタイムゾーン（日本は `Asia/Tokyo`）で暦日に変換してから判定します。UTC で動くサーバーでも、日本時間 0〜9 時が前日扱いになりません
- **軽量・依存ゼロ**: minify + gzip で約 5.5KB（日本の祝日込みで約 7KB）。ESM・型定義同梱・`sideEffects: false` で、Node.js・ブラウザー・Edge ランタイムで動作します
- **他の国・地域に拡張できる**: 祝日の提供元はインターフェース（`HolidayProvider`）で差し替えられます。現在は日本のみ同梱しています

[English](#english)

## インストール

```sh
pnpm add bizdays-toolkit
```

Node.js 22.12 以上。ESM のみですが、Node.js 22.12 以降は CommonJS からも `require()` で読み込めます。

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
4. 祝日（`holidayPolicy` に従う。`"open"` は定休日の曜日より優先して営業日にする）
5. `closedWeekdays`（定休日の曜日）
6. それ以外は営業日

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

値は `dates`（個別の日付・期間）→ `annual`（毎年の月日・期間）→ 祝日 → `weekly`（曜日）の順に決まります。同じ種類の規則が重なる場合は、配列で先に書いたものが優先です。

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
  timeZone: "Europe/London",
  supportedYears: { from: 2000, to: 2100 },
  dataVersion: "2026-10",
  holidaysInYear: (year) => [
    {
      date: `${year}-12-25`,
      name: "Christmas Day",
      nameEn: "Christmas Day",
      kind: "public",
      confirmed: true,
    },
  ],
};
const calendar = createCalendar({ holidays: myCountry, closedWeekdays: [0, 6] });
```

### 対応年の外

祝日の提供元の対応年（日本は 1955〜2099 年）を外れた日付を判定すると `RangeError` になります。祝日がない日として扱いたい場合は `outOfRange: "ignore"` を指定してください。

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

主なコード: `invalid-date`・`invalid-month-day`・`invalid-time`・`invalid-range`・`invalid-weekday`・`invalid-time-zone`・`invalid-option`・`out-of-range`・`invalid-provider`・`invalid-provider-data`・`no-business-day`。将来の版でコードが増えることがあります。

## バージョン番号とデータの更新

[Semantic Versioning](https://semver.org/lang/ja/) に従います。詳しくは [RELEASING.md](./RELEASING.md) を参照してください。

- 法改正・官報公表の反映（祝日の新設・移動、春分・秋分の日の確定）は**マイナー版**です。`^` で指定していれば自動で届きます
- 祝日の判定結果を固定したい場合は、版を完全一致で指定してください（例: `"bizdays-toolkit": "0.1.0"`）
- 反映済みのデータは `dataVersion`（日本は反映済みの官報の年月）と `confirmedThrough` で確認できます
- 1.0.0 までは、マイナー版で破壊的変更を行うことがあります
- 判定の理由（`reason`）・祝日の種別（`kind`）・エラーコードは、将来の版で値が増えることがあります。値を列挙して分岐するときは「その他」も扱ってください（[RELEASING.md](./RELEASING.md) の「互換性の約束」）

## 出典

日本の祝日の検証には、内閣府ホームページで公開されている「国民の祝日」の CSV（<https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>） を利用しています（テスト用フィクスチャのみ。パッケージには含みません）。

## ライセンス

MIT

---

## English

A business-day calendar that combines public holidays with company or store closures.

- **Japanese holidays verified day by day** against the Cabinet Office CSV, from 1955 through the latest year officially announced (substitute holidays, citizens' holidays, imperial ceremonies, and the Olympic moves included)
- **Day-by-day schedules**: `createSchedule` returns any value per day (e.g. store hours) from weekly values, a holiday rule (`"weekday"`, `{ sameAs: 0 }`, or `{ value }`), annual dates and specific dates
- **Business-day arithmetic**: closed weekdays, annual closures (including ranges across the new year), specific closed/open dates, holiday policy, `addBusinessDays`, cut-off times, and more
- **Time-zone safe**: instants (`Date`, ISO strings with offsets, Temporal) are converted to a civil date in the calendar's time zone before evaluation
- **Lightweight, zero dependencies**: about 5.5 KB min+gzip (about 7 KB with Japanese holidays), ESM, bundled types, `sideEffects: false`
- **Extensible** through the `HolidayProvider` interface (only Japan is bundled for now)

```ts
import { createCalendar } from "bizdays-toolkit";
import { jp, isHoliday } from "bizdays-toolkit/jp";

isHoliday("2026-11-23"); // true

const office = createCalendar({ holidays: jp, closedWeekdays: [0, 6] });
office.addBusinessDays("2026-09-18", 1); // "2026-09-24"
office.businessDayOnOrAfter(new Date(), { cutoff: "14:00" });
```

Versioning follows SemVer. Updates that reflect law amendments or official announcements are released as **minor** versions; pin an exact version if you need frozen results. Before 1.0.0, minor versions may contain breaking changes. See [RELEASING.md](./RELEASING.md) (Japanese) for details.
