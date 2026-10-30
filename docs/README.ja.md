<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inohan77/bizdays-toolkit/main/docs/assets/logo-dark.svg">
    <img src="https://raw.githubusercontent.com/inohan77/bizdays-toolkit/main/docs/assets/logo-light.svg" alt="bizdays-toolkit" width="400">
  </picture>
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/bizdays-toolkit"><img src="https://img.shields.io/npm/v/bizdays-toolkit" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/bizdays-toolkit"><img src="https://img.shields.io/npm/d18m/bizdays-toolkit" alt="npm downloads"></a>
  <a href="https://github.com/inohan77/bizdays-toolkit/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/inohan77/bizdays-toolkit/ci.yml?branch=main&amp;label=CI" alt="CI status"></a>
  <a href="https://github.com/inohan77/bizdays-toolkit/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/bizdays-toolkit" alt="license"></a>
  <img src="https://img.shields.io/node/v/bizdays-toolkit" alt="Node.js version">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="zero dependencies">
  <img src="https://img.shields.io/badge/types-included-blue" alt="TypeScript types included">
</p>

<p align="center"><a href="../README.md">English</a> | <b>日本語</b></p>

祝日と、会社・店舗の休業日を組み合わせた営業日カレンダーです。

- **祝日を公式データで全日照合**: 日本（内閣府。1955 年〜官報公表済みの年）・英国（GOV.UK。1974〜2011 年は The Gazette の布告、2000 年からは当時の政府の一覧も。England・Wales・Scotland・Northern Ireland）・フランス（data.gouv.fr。本土と Alsace-Moselle。2006〜2031 年を照合）・シンガポール（data.gov.sg の MOM のデータ。2020 年〜）のすべての日付をテストで確かめ、差分を毎日監視してパッチ版で反映します
- **営業日の計算**: 定休日の曜日・毎年の休業日（年末年始のような年をまたぐ期間も可）・臨時休業日・臨時営業日と祝日を組み合わせ、「N 営業日後」「締め時刻を過ぎたら翌営業日」「20 日締め翌月 10 日払い」のような期日を、金融で使われる 4 つの調整方法で計算します
- **繰り返しの規則**: 「第 3 水曜定休」「隔週水曜定休」「毎月末日は棚卸」「月曜休館（祝日の場合は次の祝日でない日）」「祝日の翌日（前日）は休館」「bank holiday の前の最終平日」「4 勤 2 休の交替制」を、祝日に当たったときの扱いと有効期間つきで書けます
- **日ごとの値と合成**: 曜日・祝日・特定日で変わる営業時間のようなスケジュール、そこから作る営業日カレンダー、複数のカレンダーがすべて（またはどれか）営業している日の合成
- **設定の診断**: `bizdays-toolkit/diagnose` が、決して使われない規則・覆われた規則・取り除いても結果が変わらない規則・終わった規則・キーの打ち間違い・営業日が 1 日もない設定を、例外を投げずに一覧で返します。テストに 1 行足すだけで設定を守れます
- **軽量・依存ゼロ・タイムゾーンを間違えない**: minify + gzip で約 12.9KB（日本の祝日込みで約 14.6KB、英国の祝日込みで約 15.1KB、フランスの祝日込みで約 13.8KB、シンガポールの祝日込みで約 13.8KB。0.30.2 で測定）。標準の JavaScript と `Intl` だけ、ESM・型定義同梱。Node.js・Chrome・Firefox・Edge・Safari・Cloudflare Workers・Bun・Deno で確認。`Date` などの瞬間はカレンダーのタイムゾーンで暦日に変換してから判定します
- **他の国・地域に拡張できる**: 祝日の提供元はインターフェース（`HolidayProvider`）で差し替えられ、多くの国の祝日の元になる暦の計算（月の第 n 何曜日・復活祭・週末に当たった祝日の振替）を `bizdays-toolkit/provider` が公開します

## インストール

```sh
pnpm add bizdays-toolkit
```

Node.js 22.12 以上。CI で Node.js 22.12・22・24・26、Chrome・Firefox・Edge（Linux）と Safari（macOS）、Cloudflare Workers（Workers のオープンソースの実行環境 workerd）、Bun（1.4）・Deno（2.9）を確認しています。ブラウザーは GitHub のランナーに入っている最新の安定版なので、ランナーの更新で版が変わります。ESM のみですが、CommonJS からも `require()` で読み込めます（これも CI で確認しています。Node.js 22.12 では `require()` での読み込みに実験的な機能の警告が出ますが、結果には影響しません。Node.js 26 では出ません）。Vercel の Edge Runtime は確認していません。

型定義を同梱しています。CI で、利用者のプロジェクトとして公開する型定義を、TypeScript 5.0・5.5・5.8・6.0・7.0（ネイティブ版）のそれぞれで、`moduleResolution` を `node16`・`nodenext`・`bundler` にして型チェックし、わざと入れた型エラーが各版で報告されることも確かめています。

## すぐに使う

```ts
import { createCalendar } from "bizdays-toolkit";
import { isHoliday, jp } from "bizdays-toolkit/jp";

isHoliday("2026-11-23"); // true（勤労感謝の日）

const calendar = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-29", to: "01-03", name: "年末年始休業" }],
});
calendar.isBusinessDay("2026-12-30"); // false
calendar.addBusinessDays("2026-12-28", 1); // "2027-01-04"
calendar.businessDayOnOrAfter("2026-12-28T15:30", { cutoff: "14:00" }); // "2027-01-04"（締め時刻を過ぎているので翌営業日）
calendar.dueDate("2026-11", { dayOfMonth: 23, convention: "following" }); // "2026-11-24"（23 日は祝日）
```

以下の内容は[ガイド](./guide.ja.md)に、CI で実行しているコード例つきで詳しく書いています。この README は短い版です。

## できること

### 日本・英国・フランス・シンガポールの祝日

| 提供元                                            | サブパス             | タイムゾーン     | 対応年     | 照合しているデータ                                                                             |
| ------------------------------------------------- | -------------------- | ---------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `jp`                                              | `bizdays-toolkit/jp` | `Asia/Tokyo`     | 1955〜2099 | 内閣府「国民の祝日」CSV                                                                        |
| `england`・`wales`・`scotland`・`northernIreland` | `bizdays-toolkit/uk` | `Europe/London`  | 1974〜2099 | GOV.UK の bank holidays（1974〜2011 年は The Gazette の布告。2000 年からは当時の政府の一覧も） |
| `metropole`・`alsaceMoselle`                      | `bizdays-toolkit/fr` | `Europe/Paris`   | 2000〜2099 | data.gouv.fr「Jours fériés en France」                                                         |
| `sg`                                              | `bizdays-toolkit/sg` | `Asia/Singapore` | 2020〜2027 | data.gov.sg（Ministry of Manpower）                                                            |

祝日には日付・名称（と英語名）・`kind`（国民の祝日・振替休日・国民の休日・bank holiday など。国ごとに違う）・`confirmed`（公式に確定した日付か。日本の春分の日・秋分の日と、GOV.UK が公表している最後の年より後の英国の bank holidays は予測）が付きます。対応年の外は `outOfRangePolicy: "ignore"` を指定しない限りエラーで、`unconfirmedHolidayPolicy: "throw"` にすると予測の祝日に依存する結果を止められます。詳しくは[同梱の祝日の提供元](./guide.ja.md#同梱の祝日の提供元)・[未確定の祝日](./guide.ja.md#未確定の祝日)。

### 営業日カレンダーと繰り返しの規則

カレンダーは、祝日の提供元と、`closedWeekdays`（定休日の曜日）・`closedAnnualDates`（毎年の月日の期間。年またぎも可）・`closedDates`・`openDates`（臨時休業・臨時営業）・`closedRecurringRules` / `openRecurringRules`（繰り返しの規則）から作ります:

| 規則                                                      | 意味                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `{ weekday: 3, nth: 3 }`                                  | 第 3 水曜日（`nth` は 1〜5 と -1（最終）。配列で複数指定できる）       |
| `{ weekday: 3, interval: 2, anchor: "2026-01-07" }`       | 隔週水曜日（`anchor` から数える）                                      |
| `{ cycle: 6, anchor: "2026-01-05", positions: [5, 6] }`   | `anchor` から 6 日ごとの 5・6 日目（4 勤 2 休）                        |
| `{ dayOfMonth: 20 }`・`{ dayOfMonth: -1 }`                | 毎月 20 日・毎月末日                                                   |
| `{ businessDayOfMonth: -1 }`・`{ businessDayOfMonth: 5 }` | 月末最終営業日・第 5 営業日                                            |
| `{ businessDayOfWeek: -1, weekStart: 1 }`                 | 月曜始まりの週の最終営業日                                             |
| `{ holiday: true, kinds: ["substitute"] }`                | 祝日（種別や識別子 `keys: ["vernal-equinox"]` で絞れる）               |
| `{ dayAfterHoliday: true }`・`{ dayBeforeHoliday: true }` | 祝日（連休）の翌日・前日                                               |
| `holidayOverlapPolicy: "after-holiday"`                   | 「月曜休館（祝日なら次の祝日でない日。土曜日もある）」のような振替     |
| `skipWeekdays: [0, 6]`                                    | `"after-holiday"` で土日も飛ばす（「6 月 15 日。土日祝なら翌営業日」） |
| `effectiveFrom`・`effectiveTo`                            | 規則の有効期間                                                         |

`dayInfoOn` で、その日が営業か休業かの理由（`reason`・`name`・`optionPath`）が分かります。同梱の毎年繰り返す祝日には安定した識別子 `key`（`vernal-equinox`・`good-friday`・`hari-raya-puasa` など）が付いていて、月日や曜日では書けない祝日を規則から個別に指せます。詳しくは[営業日カレンダー](./guide.ja.md#営業日カレンダー)・[繰り返しの規則](./guide.ja.md#繰り返しの規則)・[祝日の識別子](./guide.ja.md#祝日の識別子)・[よくある設定の例](./guide.ja.md#よくある設定の例)。

### 期日・スケジュール・合成

- `dueDate("2026-11", { dayOfMonth: 23, convention: "following" })`・`adjust`・`closingMonth`・`closingPeriod` が、`following`・`preceding`・`modified-following`・`modified-preceding` の調整方法で月の期日と締め期間を計算します（[月の期日と日付の調整](./guide.ja.md#月の期日と日付の調整)）
- `createSchedule` は、同じ種類の規則で日ごとの値（営業時間・出荷の締め時刻・料金区分）を引き、`createCalendarFromSchedule` でそのスケジュールから営業日カレンダーを作れます。営業時間表が唯一の設定になります（[日ごとの値](./guide.ja.md#日ごとの値営業時間など)・[スケジュールから営業日カレンダーを作る](./guide.ja.md#スケジュールから営業日カレンダーを作る)）
- `combineCalendars` は、複数のカレンダーがすべて（またはどれか）営業している日を合成します。自社と銀行の両方が営業している送金日など（[カレンダーの合成](./guide.ja.md#カレンダーの合成)）
- 日付は `"YYYY-MM-DD"`・`"YYYY-MM-DDTHH:mm"`・`Date`・Temporal のオブジェクトで渡せ、瞬間はカレンダーのタイムゾーンで暦日に変換します（[日付・日時の入力](./guide.ja.md#日付日時の入力)）

### 設定の診断

```ts
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

diagnoseCalendar({
  holidayProvider: jp,
  closedWeekdays: [0],
  closedRecurringRules: [{ weekday: 0 }],
  closeAnnual: ["12-31"],
}).map((d) => [d.severity, d.code, d.path]);
// [["warning", "unknown-option", "closeAnnual"], ["info", "redundant", "closedRecurringRules[0]"]]
```

`diagnoseCalendar`・`diagnoseSchedule` は、設定の問題を例外を投げずにすべて返します。キーの打ち間違い（候補つき）、決して当てはまらない規則、先の規則に覆われた規則、取り除いても結果が変わらない規則、営業日が 1 日もない設定、`{ asOf }` を渡せば終わった規則。テストに `assert.deepEqual(diagnoseCalendar(options), [])` と書くだけで設定を守れます。詳しくは[設定の診断](./guide.ja.md#設定の診断)・[エラー](./guide.ja.md#エラー)。

### 他の国・地域

祝日の提供元は `id`・`timeZone`・`supportedYears`・`holidaysInYear(year)` を持つオブジェクトです。多くの国の祝日の元になる `nthWeekdayOfMonth`・`easterSunday` を `bizdays-toolkit/provider` が公開しています。[providers.ja.md](./providers.ja.md) を参照してください。

## ドキュメント

- [ガイド](./guide.ja.md): すべての機能の詳しい説明（コード例は CI で実行）
- [祝日の提供元を書く](./providers.ja.md)
- [移行ガイド](./migration.md)と [CHANGELOG](../CHANGELOG.md)
- [設計の決定](./decisions.md): なぜそうなっているか
- [RELEASING.md](../RELEASING.md): バージョン番号・互換性の約束・データの更新と監視

## バージョン番号とデータの更新

[Semantic Versioning](https://semver.org/lang/ja/) に従います。詳しくは [RELEASING.md](../RELEASING.md) を参照してください。

- 公式データの反映（法改正・官報公表・布告による祝日の新設・移動・臨時の祝日、春分・秋分の日の確定、GOV.UK の新しい年の公表、フランスの労働法典の改正、シンガポールの新しい年の告示と日付の改定）は**パッチ版**です。`^`・`~` のどちらで指定していても自動で届きます
- 祝日の判定結果を固定したい場合は、版を完全一致で指定してください（例: `"bizdays-toolkit": "x.y.z"`）
- 反映済みのデータは、提供元の `dataVersion`（日本は反映済みの官報の年月、英国・フランス・シンガポールは反映済みの GOV.UK・data.gouv.fr・data.gov.sg のデータの年月）と `confirmedThrough` で確認できます（`jp.dataVersion`・`england.confirmedThrough` など）。`bizdays-toolkit/jp`・`bizdays-toolkit/uk` のモジュールの定数 `dataVersion`・`confirmedThrough` は 0.12.0 で非推奨で、1.0.0 で削除します
- 1.0.0 までは、マイナー版で破壊的変更を行うことがあります。マイナー版の間を移るときに利用者がする作業は、[移行ガイド](./migration.md)と、CHANGELOG の各版の「移行」にまとめています
- 判定の理由（`reason`）・祝日の種別（`kind`）・エラーコード・診断のコードは、将来の版で値が増えることがあります。値を列挙して分岐するときは「その他」も扱ってください（[RELEASING.md](../RELEASING.md) の「互換性の約束」）

## 出典

日本の祝日の検証には、内閣府ホームページで公開されている「国民の祝日」の CSV（<https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>） を利用しています（テスト用フィクスチャのみ。パッケージには含みません）。

英国の祝日の検証には、GOV.UK の bank holidays のデータ（<https://www.gov.uk/bank-holidays.json>、それより前の年は GOV.UK の公式リポジトリ [alphagov/calendars](https://github.com/alphagov/calendars)・[alphagov/frontend](https://github.com/alphagov/frontend) の履歴）を、Wales の祝日のウェールズ語の名称には GOV.UK のウェールズ語版の表記を利用しています（照合のデータはテスト用フィクスチャのみ。パッケージには含みません）。

GOV.UK のデータがない 2000〜2011 年は、当時の政府が公表した bank holidays の一覧（DTI・BERR・directgov・Scottish Executive/Government・nidirect。Wayback Machine の保存）を正とし、The Gazette（<https://www.thegazette.co.uk/>）の国王の布告と北アイルランドの Order で照合しています（1974〜1999 年は布告が正）。1975〜1990 年の 13 日は照合できておらず、規則どおりに返したうえでテスト用フィクスチャに `unverified` として理由つきで記録しています（1986〜1990 年の北アイルランドの Order は The Gazette のオンラインにない号に載っており、1987 年分の毎年の布告と 1975 年の北アイルランドの Order は見つかっていない）。出典は [docs/sources/uk-bank-holidays-1974-1999.md](./sources/uk-bank-holidays-1974-1999.md) と [docs/sources/uk-bank-holidays-2000-2011.md](./sources/uk-bank-holidays-2000-2011.md) にあります（パッケージには含みません）。

フランスの祝日の検証には、DINUM が data.gouv.fr で公開している「Jours fériés en France」（<https://www.data.gouv.fr/datasets/jours-feries-en-france>。Métropole と Alsace-Moselle のゾーンの JSON エクスポート）を利用しています（テスト用フィクスチャのみ。パッケージには含みません）。

シンガポールの祝日の検証には、MOM（Ministry of Manpower）が data.gov.sg で公開している「Singapore Public Holidays」コレクション（<https://data.gov.sg/collections/691/view>）を利用し、両者が食い違う箇所は MOM の報道発表を正としています（テスト用フィクスチャのみ。パッケージには含みません）。

Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/), data from data.gouv.fr made available under the [Licence Ouverte / Open Licence 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence), and data from data.gov.sg made available under the [Singapore Open Data Licence](https://data.gov.sg/open-data-licence).

## ライセンス

MIT License です。全文は [LICENSE](https://github.com/inohan77/bizdays-toolkit/blob/main/LICENSE) を参照してください。
