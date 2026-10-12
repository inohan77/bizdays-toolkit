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
- **営業日の計算**: 定休日の曜日・毎年の休業日（年末年始のような年をまたぐ期間も可）・臨時休業日・臨時営業日と祝日を組み合わせ、「N 営業日後」「締め時刻を過ぎたら翌営業日」などを計算します
- **タイムゾーンを間違えない**: `Date` などの瞬間は、カレンダーのタイムゾーン（日本は `Asia/Tokyo`）で暦日に変換してから判定します。UTC で動くサーバーでも、日本時間 0〜9 時が前日扱いになりません
- **軽量・依存ゼロ**: minify + gzip で約 3KB（日本の祝日込みで約 5KB）。ESM・型定義同梱・`sideEffects: false` で、Node.js・ブラウザー・Edge ランタイムで動作します
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

## バージョン番号とデータの更新

[Semantic Versioning](https://semver.org/lang/ja/) に従います。詳しくは [RELEASING.md](./RELEASING.md) を参照してください。

- 法改正・官報公表の反映（祝日の新設・移動、春分・秋分の日の確定）は**マイナー版**です。`^` で指定していれば自動で届きます
- 祝日の判定結果を固定したい場合は、版を完全一致で指定してください（例: `"bizdays-toolkit": "0.1.0"`）
- 反映済みのデータは `dataVersion`（日本は反映済みの官報の年月）と `confirmedThrough` で確認できます
- 1.0.0 までは、マイナー版で破壊的変更を行うことがあります

## 出典

日本の祝日の検証には、内閣府ホームページで公開されている「国民の祝日」の CSV（<https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>） を利用しています（テスト用フィクスチャのみ。パッケージには含みません）。

## ライセンス

MIT

---

## English

A business-day calendar that combines public holidays with company or store closures.

- **Japanese holidays verified day by day** against the Cabinet Office CSV, from 1955 through the latest year officially announced (substitute holidays, citizens' holidays, imperial ceremonies, and the Olympic moves included)
- **Business-day arithmetic**: closed weekdays, annual closures (including ranges across the new year), specific closed/open dates, holiday policy, `addBusinessDays`, cut-off times, and more
- **Time-zone safe**: instants (`Date`, ISO strings with offsets, Temporal) are converted to a civil date in the calendar's time zone before evaluation
- **Lightweight, zero dependencies**: about 3 KB min+gzip (about 5 KB with Japanese holidays), ESM, bundled types, `sideEffects: false`
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
