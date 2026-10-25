# Changelog

この形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、版の付け方は [Semantic Versioning](https://semver.org/lang/ja/) と [RELEASING.md](./RELEASING.md) の方針に従います。区分には Keep a Changelog の Added / Changed / Deprecated / Removed / Fixed / Security に加えて、祝日データの更新を表す **Data** を使います。

## [Unreleased]

### Changed

- ドキュメントの国の記述順を、対応年数の多い順（日本 → フランス → 英国 → シンガポール）に揃えた。README（提供元の表・節の見出し・照合のデータの説明・ライセンスの表記・箇条書き）、`docs/guide.md`・`docs/guide.ja.md`（各国の節の順・識別子の表・対応年の例）、`docs/providers.md`・`docs/providers.ja.md`、`RELEASING.md`（各国のデータの更新の節の順。「README のサイズの値」と「監視の起動とハートビート」は各国の節の後ろに置いた）、`package.json` の description。`data-watch.yml` の照合の順（英国 → シンガポール → 日本 → フランス）は実行順なので変えていない

## [0.20.0] - 2026-10-25

### 移行

動作が変わる既存の API はない。サブパス `bizdays-toolkit/fr` が増える。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- フランスの祝日の提供元 `bizdays-toolkit/fr` を追加した。`metropole`（ID `FR`。労働法典 L3133-1 の 11 日）と `alsaceMoselle`（ID `FR-AM`。Vendredi saint と 12 月 26 日が加わる）で、タイムゾーンは `Europe/Paris`、対応年は 2000〜2099 年。固定日と復活祭からの日数で計算し、振替はない。名称は data.gouv.fr の表記（フランス語）、`nameEn` は英訳、`key` は英語名から（`labour-day`・`pentecost-monday` など 13 個。型 `KnownFrHolidayKey`）。2 つの祝日が同じ日に当たる年（2008 年・2059 年の Ascension）は復活祭の側の名称で 1 件。祝日は法令で定まり年ごとの告示がないので、すべて `confirmed: true` で `confirmedThrough` は持たない。型 `FrHoliday`・`FrHolidayKind`・`KnownFrHolidayKind` を追加した
- data.gouv.fr の「Jours fériés en France」（DINUM。Métropole と Alsace-Moselle のゾーンの JSON）の 2006〜2031 年のすべての日付と名称に一致することをテストで確かめる（`test/fixtures/datagouv-jours-feries.json`）

### Changed

- README: 提供元の表にフランスを足し、min+gzip のサイズの値を 0.20.0 で測り直した（ルート 10.0 → 11.0 KB。0.18.0・0.19.0 の追加分を含む）
- `docs/guide.md`・`docs/guide.ja.md`: 「French public holidays / フランスの祝日」の節と、識別子の表のフランスの行を足した
- `RELEASING.md`: 「フランスのデータの更新」の節を足し、区分の表の「規則で計算する提供元」にフランスを含めた
- `docs/decisions.md`: 48 番（フランスの提供元と、4 か国目の選び方の基準）を追加した
- `package.json`: `exports` に `./fr`、keywords に `france` を足した

### 開発

- 監視のワークフロー `data-watch.yml` に data.gouv.fr の照合を足した（issue のラベル `datagouv-data`。ハートビートは 4 つの照合がすべて動いたときだけ）。`scripts/verify-datagouv.ts` を英国・シンガポール・日本と同じ形で追加した（`pnpm verify:datagouv`）
- テスト: `test/fr-rules.test.ts`・`test/fr-datagouv.test.ts` を追加し、`test/holiday-key.test.ts`・ESM/CJS/ブラウザー/workerd の確認・利用者の型チェックにフランスを足した
- サイズの上限（`size-limits.json`）に `./fr` 6,500（測定 5,404）を足した（gzip）

## [0.19.0] - 2026-10-25

### 移行

動作が変わる既存の API はない（`"after-holiday"` の規則に `skipWeekdays` を付けなければ振替先はこれまでどおり）。繰り返しの規則の形 `{ businessDayOfMonth }` と項目 `skipWeekdays`・`calendar`、診断コード `counting-basis` が増える。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 繰り返しの規則に月の第 n 営業日の形 `{ businessDayOfMonth: n }` を追加した（型 `BusinessDayOfMonthPattern`・`BusinessDayOfMonth`。n は 1〜31 と -1（最後）〜-31、配列可、`months` で絞れる）。「月末最終営業日は棚卸しで休業」「四半期初の第 1・第 5 営業日は予約を止める」を規則として書ける。数える基準はそのカレンダーの繰り返しの規則をすべて除いた判定（個別の日付・毎年の休業日・祝日・定休日の曜日）で、`nthBusinessDayOfMonth`・`lastBusinessDayOfMonth` は規則を適用した後の実際の営業日を返す。`onHolidayRule` は `"under-holiday"`（既定）と `"over-holiday"`（`holidayPolicy: "open"` で第 n 営業日が祝日に当たるときも適用する）を受け、`"after-holiday"` は `invalid-option`。スケジュールでは数える基準のカレンダーを `calendar` で指定する（必須。タイムゾーンが違えば `time-zone-conflict`。カレンダーの側に書くと `invalid-option`）
- `"after-holiday"` の曜日・日の規則に `skipWeekdays` を追加した。本来の日が祝日かその曜日なら、以降で最初の「祝日でもその曜日でもない日」に振り替える（「6 月 15 日は創立記念日。土日祝なら翌営業日」は `{ day: 15, months: [6], onHolidayRule: "after-holiday", skipWeekdays: [0, 6] }`、「月曜定休。祝日なら翌平日（土曜日には落とさない）」は `{ weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: [6] }`）。`"after-holiday"` 以外の規則や規則自身の曜日に付けると `invalid-option`
- 診断コード `counting-basis`（info）を追加した。`businessDayOfMonth` の規則と、同じ設定の毎週の曜日の規則（`{ weekday }`）が同居する設定で、その曜日が営業日として数えられることを知らせる。`businessDayOfMonth` の規則は `never-matches`（その月にない回）・`shadowed`（n・months・基準のカレンダーの包含）・`redundant` の対象。`holidayPolicy: "closed"` の `businessDayOfMonth` の規則の `"over-holiday"` は `redundant`（info）。`skipWeekdays` が違う規則どうしは `shadowed` にしない

### Changed

- `docs/guide.md`・`docs/guide.ja.md`: 繰り返しの規則の表と本文に第 n 営業日と `skipWeekdays` を足し、コード例（銀行の支店とスケジュール）を足した
- README: 規則の表に `businessDayOfMonth`・`skipWeekdays` を足した
- `docs/decisions.md`: 47 番（第 n 営業日の規則・`skipWeekdays`・監視の報告書の日付）を追加し、14 番に `skipWeekdays` の追記をした

### 開発

- 監視の照合スクリプト（`scripts/verify-govuk.ts`・`verify-datagovsg.ts`・`verify-cao.ts`）の「確認した日付」を UTC から日本時間に揃えた（issue のコメントの日付と同じ基準）
- テスト: `test/business-day-of-month.test.ts`・`test/skip-weekdays.test.ts` を追加し、`test/types.check.ts`・利用者の型チェックに新しい規則を足した
- サイズの上限（`size-limits.json`）を上げた。ルート 25,000 → 26,500（測定 25,100）、`./jp` 28,000 → 29,500（測定 28,128）、`./diagnose` 33,000 → 35,500（測定 34,038）（gzip）。第 n 営業日の規則の判定・基準のキャッシュ・検証と、`skipWeekdays` の振替、診断の追加のため

## [0.18.0] - 2026-10-25

### 移行

動作が変わる既存の API はない。同梱の提供元が返す祝日に省略可能な項目 `key` が加わるので、`dayInfo` の結果や `holidaysInYear` の要素を `deepEqual` で比べているテストは期待値に足す（国民の休日・臨時の祝日には付かない）。祝日の規則に省略可能な `keys` が加わる。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 祝日の識別子 `Holiday.key`（省略可能。`/^[a-z0-9][a-z0-9-]*$/`）と、祝日の規則の絞り込み `{ holiday: true, keys: [...] }`（`kinds`・`weekdays`・`months` との AND）を追加した。春分の日・復活祭に連動する日・太陰暦の祝日のように月日や曜日では書けない祝日を、名称に依存せず個別に指せる。同梱の提供元は毎年繰り返す祝日に `key` を付け（日本 16・英国 12・シンガポール 10。`docs/guide.md` の「Holiday keys」）、振替日は元の祝日の `key` を持ち、国民の休日・一度きりの祝日は持たない。`key` は日付の移動や公式の改名があっても変えない。補完用の型 `KnownJapaneseHolidayKey`・`KnownUkHolidayKey`・`KnownSgHolidayKey` を追加した（`@beta`）。利用者の提供元が付けた `key` は形式だけ検証し、複製・凍結して返す。診断は対応年に現れない `key` を `never-matches`、`key` の集合の包含を `shadowed` で扱う
- `bizdays-toolkit/provider` に、週末に当たった祝日の振替日を計算する `substituteDays(holidays, { rules, kind, name?, original? })` を追加した（`@beta`。型 `SubstituteDaysOptions`・`SubstituteDirection`）。`rules` は曜日ごとの向き（`"next"`・`"previous"`）で、振替先は「入力の祝日でも、決めた振替日でも、`rules` の曜日でもない最初の日」。振替日は元の祝日の `key`・`names`・`confirmed` を引き継ぐ。日本（2007 年以降）・英国・シンガポールの同梱の提供元の振替日を再現することをテストで確かめている（内部の実装は置き換えていない）

### Changed

- `docs/guide.md`・`docs/guide.ja.md`: 「Holiday keys」（祝日の識別子）の節と、繰り返しの規則の `keys` を足した。コード例の結果に `key` が増えた
- `docs/providers.md`・`docs/providers.ja.md`: `substituteDays` と、自作の提供元に `key` を付ける方法を足した
- README: 規則の表と機能の箇条書きに `key`・振替の計算を足し、クイックスタートのコメントの "Labour Thanksgiving Day" を `nameEn` の綴り "Labor Thanksgiving Day" に直した
- `RELEASING.md`: 区分の表で「対応年の拡大」を規則で計算する提供元（日本・英国）に限り、年ごとの表で持つ提供元（シンガポール）に告示済みの新しい年を足すことはパッチに置く、と線を引いた（これまでは 2 つの行が同時に当てはまる状態だった）。「毎年の作業（日本）」を「日本のデータの更新」に改め、監視の差分の種類と対応の表を足した
- `docs/decisions.md`: 46 番（祝日の識別子と絞り込み、`substituteDays`、内閣府 CSV の毎日の照合、区分の線引き）を追加し、37 番の理由（存在しない「将来の非純粋な判定関数」を前提にしていた）と 44 番の `asOf` の理由（`Date` を断る理由としてタイムゾーンは成り立たなかった）を改めた

### 開発

- 監視のワークフロー `data-watch.yml` に内閣府「国民の祝日」CSV の照合を足した（issue のラベル `cao-data`。ハートビートは 3 つの照合がすべて動いたときだけ）。`scripts/verify-cao.ts` を英国・シンガポールと同じ形（`--report`・`--simulate`、終了コード 0・1・2、取得の再試行、「New years published」・フィクスチャの差分の節）にした。翌年の春分・秋分の日の公表が issue で届くので、2 月の作業を記憶に頼らない
- テスト: `test/holiday-key.test.ts` を追加し、`test/provider.test.ts` に `substituteDays`（同梱の 3 か国との同値・向き・名称・入力の検証）を足した。`test/types.check.ts`・利用者の型チェックに `keys`・既知の `key` の型・`substituteDays` を足した
- サイズの上限（`size-limits.json`）を上げた。`./provider` 4,500 → 6,500（`substituteDays` と入力の検証のため。測定 6,019）、`./diagnose` 32,000 → 33,000（`keys` の判定と診断のため。測定 31,645）（gzip）

## [0.17.1] - 2026-10-25

### Changed

- README（英語・日本語）を入口に絞り、詳しい説明を `docs/guide.md`・`docs/guide.ja.md`（同梱の提供元・営業日カレンダー・繰り返しの規則・合成・よくある設定の例・月の期日・日ごとの値・スケジュールからのカレンダー・入力・対応年の外・未確定の祝日・エラー・設定の診断）と `docs/providers.md`・`docs/providers.ja.md`（他の国・地域の祝日の提供元の書き方）に移した。README には機能の箇条書き（7 項目）・インストール・クイックスタート・できることの一覧（提供元の表・規則の表・診断の例）・ドキュメントの索引を残した。本文の内容は変えていない（`docs/decisions.md` の 45 番）

### 開発

- `pnpm check`: 英語と日本語のドキュメントの対（README・`docs/guide`・`docs/providers`）の見出しの数とコードブロックの数の一致、互いへのリンク、`docs/*.md` の見出しへのリンク（`#…`）の実在を確かめる（`scripts/check-package.ts`）。コード例の実行（`scripts/check-readme-examples.ts`）も docs のガイドを対象に含めた
- `RELEASING.md`・`docs/decisions.md` の 22・27 番に、ドキュメントの対が増えたことを書いた

## [0.17.0] - 2026-10-25

### 移行

動作が変わる既存の API はない（既定値はこれまでどおり）。`Calendar`・`Schedule`・`HolidayLookup` に項目 `unconfirmedHolidays` が加わり、`createCalendar`・`createSchedule` の設定と `diagnoseCalendar`・`diagnoseSchedule` の第 2 引数が増える。監視のワークフローの改名（`govuk-watch.yml` → `data-watch.yml`）により、cron-job.org の URL を直す（RELEASING.md）。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 未確定の祝日のガード `unconfirmedHolidays: "accept" | "throw"`（カレンダー・スケジュール共通。既定 `"accept"`）を追加した。`"throw"` では、評価した日（探索が途中で通る日、祝日の翌日・祝前日の規則が見る隣の日を含む）が未確定の祝日（`confirmed: false`）なら `code: "unconfirmed-holiday"` の `RangeError` を投げる。`holidaysInYear`・`holidaysBetween` は投げないので、影響する日を列挙できる。合成はどれかが `"throw"` なら `"throw"`。エラーコードに `unconfirmed-holiday` を追加した
- 診断の第 2 引数 `{ asOf: "YYYY-MM-DD" }`（型 `DiagnoseOptions`）を追加した。基準日より前に終わった規則・個別の日付を `info` の `expired` で返す。省略時の結果は変わらない。診断コードに `expired` を追加した
- シンガポールの祝日 `bizdays-toolkit/sg`（提供元 `sg`。ID `SG`、`Asia/Singapore`、種別 `regular`・`substitute`・`special`、型 `SgHoliday`・`SgHolidayKind`・`KnownSgHolidayKind`）を追加した。MOM が告示した 2020〜2027 年の日付を表で持ち、日曜日に当たった祝日の振替を Holidays Act の規則で計算する。それより後の年は予測せず `out-of-range`。data.gov.sg のコレクション 691（MOM）で全日照合し、2022 年の既知の差分（改定後の告示との食い違い）はフィクスチャに出典付きで記録した

### Changed

- 診断: 判定に祝日を使わない設定（提供元がない、または `holidayPolicy: "ignore"` / `holiday: "weekday"` で祝日に従属する規則もない）の `unconfirmedHolidays: "throw"` を `info` の `redundant` にする。診断は未確定の祝日を `"accept"` で評価する
- 診断: 第 2 引数がオブジェクトでなければ `invalid-argument`、`asOf` が暦日の文字列でなければ `invalid-date` の例外を投げる（設定の誤りは診断結果で返す現状のまま）
- 振替元をさかのぼるときに祝日の例外を飲み込む範囲を `out-of-range` だけにした（`unconfirmed-holiday` などは投げ直す。これまでは提供元の例外も飲み込んでいた）
- README: シンガポールの節、「未確定の祝日」の節（レシピ付き）、診断の `asOf` と `expired`、出典にシンガポールと Singapore Open Data Licence を足した。サイズの値を測り直した（ルート約 10.0KB・日本の祝日込み約 11.8KB・英国の祝日込み約 11.7KB・シンガポールの祝日込み約 10.9KB。0.17.0 で測定）
- `RELEASING.md`: 「シンガポールのデータの更新」の節を足し、監視のワークフローの改名と cron-job.org の URL の修正を書いた
- `docs/decisions.md`: 44 番（未確定の祝日のガード・診断の基準日・シンガポールの祝日）を追加し、15・28 番に監視のワークフローの改名を書いた

### 開発

- 監視のワークフローを `govuk-watch.yml` から `data-watch.yml` に改名し、英国とシンガポールの照合を 1 回の起動で順に行う（issue のラベルは `govuk-data`・`datagovsg-data`。ハートビートは両方が動いたときだけ）。`scripts/verify-datagovsg.ts`（`pnpm verify:datagovsg`。`--file`・`--write`・`--report`・`--simulate`）とフィクスチャ `test/fixtures/datagovsg-public-holidays.json`（既知の差分を含む）を追加した
- テスト: `test/unconfirmed-holidays.test.ts`・`test/diagnose-as-of.test.ts`・`test/sg-rules.test.ts`・`test/sg-datagovsg.test.ts` を追加し、`smoke.mjs`・CJS・利用者の型チェックにシンガポールと新しい設定を足した
- サイズの上限（`size-limits.json`）を上げ、`./sg` のエントリーを足した。ルート 24,000 → 25,000、`./jp` 27,000 → 28,000、`./uk` 6,700 → 7,500、`./diagnose` 30,500 → 32,000（gzip）。未確定の祝日のガードと診断の基準日のため。`./sg` は 6,000（日付とエラーの共通の実装を含む）

## [0.16.0] - 2026-10-23

### 移行

日時の文字列の区切りは `T` だけになり、空白で区切った文字列（`"2026-11-23 10:00"`）は `invalid-time` の Error になる（これまでは実行時だけ受け付けていた。型 `DateTimeInput` は以前から `T` 区切りだけ）。合成した `dayInfo` に `decidedByPath` が加わるので、`deepEqual` で比べているテストは期待値に足す。ほかは動作が変わらない（祝前日の規則・サブパス・合成の項目の追加）。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 繰り返しの規則に祝前日の形 `{ dayBeforeHoliday: true }` を追加した（型 `DayBeforeHolidayPattern`）。翌日が提供元の祝日でその日自身は祝日でない日に当てはまり、連休なら連休の初日の前日だけ。`{ dayAfterHoliday: true }` の鏡像で、`weekdays`・`months`・有効期間を付けられ、`onHolidayRule` は `invalid-option`。宿泊の祝前日料金・飲食店の祝前日の営業時間・祝前日の出荷の締めの繰り上げを規則として書ける。診断の `never-matches`・`shadowed` も扱う
- 祝日の提供元を実装する人向けのサブパス `bizdays-toolkit/provider` を追加した（`@beta`）。内部で使っている暦の計算 `easterSunday(year)`（グレゴリオ暦の復活祭。英国の祝日で GOV.UK のデータと照合済み）、`nthWeekdayOfMonth(year, month, weekday, n)`（`n` は 1〜5 と -1（最後））、`daysInMonth`、`isLeapYear` を、入力の検証を付けて公開する。米国の連邦祝日やドイツ・豪州の州の祝日のように、第 n 曜日と復活祭で決まる提供元が書ける
- 合成したカレンダーの `dayInfo` に `decidedByPath`（判定を決めたカレンダーまでの番号の列。外側から順）を追加した。合成したカレンダーをさらに合成したとき、`rulePath` がどのカレンダーの設定の位置かを結果だけから辿れる。`decidedBy` は外側の番号のまま

### Changed

- 日時の文字列の区切りを `T` だけにし、空白で区切った文字列は `invalid-time` にした（上の「移行」）
- README: 繰り返しの規則の節に祝前日、他の国・地域の祝日の節に `bizdays-toolkit/provider` と復活祭で決まる提供元の例、合成の節に `decidedByPath`、日付・日時の入力の節に区切りの条件、確かめている環境に Bun・Deno を足した。サイズの値を測り直した（ルート約 9.8KB・日本の祝日込み約 11.6KB・英国の祝日込み約 11.5KB。0.16.0 で測定）
- `docs/decisions.md`: 14 番に年ごとの列挙で足りる理由、26 番に Bun・Deno、29 番に空白区切りの廃止、33 番に祝前日を足した経緯、36 番に曜日の日に `rulePath` を付けない理由の書き直し（位置は書けるが冗長）、41 番に次の月に併合する側を選んだ理由を書き、43 番（祝前日・provider・`decidedByPath`・空白区切りの廃止・Bun と Deno の確認）を追加した
- `RELEASING.md`: 確認の表と固定する版の一覧に `bun`・`deno` ジョブを足した

### 開発

- CI に `bun`・`deno` ジョブを追加した。公開する `dist` を Bun 1.4.3 と Deno 2.9.7（`--unstable-temporal`。本物の Temporal も確かめる）で、`test/compat/runtime.mjs` から `smoke.mjs` を実行して確かめる。どちらも版と SHA-256 を固定した公式のリリースを取得する（workerd と同じ方式）。`smoke.mjs` に `bizdays-toolkit/provider` の確認を足した（Node.js・ブラウザー・workerd・CJS の確認も同じものを呼ぶ）
- `easterSunday` を `src/uk/rules.ts` から `src/core/date.ts` に移した（結果は変わらない。provider のサブパスが英国のデータを引き込まないため）
- 規則の診断の性質のテストの生成器に祝前日を加えた。`test/day-before-holiday.test.ts`・`test/provider.test.ts` を新規に足し、利用者の型チェックに祝前日・`decidedByPath`・provider を足した
- サイズの上限（`size-limits.json`）を上げ、`./provider` のエントリーを足した。ルート 23,000 → 24,000、`./jp` 26,000 → 27,000、`./diagnose` 29,500 → 30,500（gzip）。祝前日の検証・判定・診断と `decidedByPath` のため。`./provider` は 4,500（日付とエラーの共通の実装を含む）

## [0.15.0] - 2026-10-21

### 移行

`businessDayOnOrAfter` に `cutoff` を指定するときは、時刻を持つ入力（`Date`・日時の文字列・時刻を持つ Temporal の値）を渡す。時刻のない入力（暦日の文字列・`PlainDate`）との組み合わせは、これまで暦日を 0 時として扱い締め時刻を黙って無視していたが、`invalid-argument` の Error になる。ほかは動作が変わらない（規則の絞り込み・カレンダーのメソッド・型の追加）。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 祝日の規則（`{ holiday: true }`）と祝日の翌日の規則（`{ dayAfterHoliday: true }`）に、曜日の絞り込み `weekdays`（`months`・`kinds` と同じ絞り込みの配列）を追加した。「祝日の翌日は休館（土日に当たる場合は開館）」は `{ dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] }`、「土曜の祝日は午前診療」は `{ holiday: true, weekdays: [6], value: … }`。曜日・日の規則に `weekdays` を付けると `invalid-option`。診断の `never-matches`・`shadowed` も曜日の絞り込みを扱う
- 営業日カレンダーに、営業日を考慮した締め日 `closingMonth(input, closingDay, { convention })`・`closingPeriod(monthOrDate, closingDay, { convention })` を追加した。各月の締め日を `adjust` と同じ `convention`（必須）で営業日に調整し、日付は調整後の締め日がその日以降になる最初の月に属する。前月の締め日から当月の締め日までに営業日がない月（長期休業）は固有の期間を持たず、その日は次の月に属し、その月の `closingPeriod` は `no-business-day`。合成したカレンダー・スケジュールからのカレンダーにも付く。ルートの `closingMonth`・`closingPeriod` は暦日のまま
- `HolidayPattern`・`RecurringPattern`・`RecurringRule`・`RecurringValue` に祝日の種別の型引数 `Kind`（既定 `string`）を追加し、`kinds` を `readonly Kind[]` にした。`holidays: jp` のカレンダー・スケジュールでは `kinds` に日本の祝日の種別の補完が効く（型は開いているので、ほかの文字列も通る）。型引数なしの利用はこれまでどおり

### Changed

- `businessDayOnOrAfter` の `cutoff` を、時刻を持たない入力と組み合わせると `invalid-argument` にした（上の「移行」）
- README: `businessDaysBetween` が `addBusinessDays` の逆算になるのは起点が営業日のときで、休業日の起点では `addBusinessDays` が翌営業日を 1 と数える（`+0` と `+1` が同じ日）ことを明記した。`weekdays`、営業日を考慮した締め日、`cutoff` の入力の条件、バッジに npm のダウンロード数（直近 18 か月）を足した。サイズの値を測り直した（ルート約 9.7KB・日本の祝日込み約 11.5KB・英国の祝日込み約 11.4KB。0.15.0 で測定）
- `docs/decisions.md`: 31 番に「起点が営業日のとき」の条件と休業日の起点の定義を、37 番に「別名」と「文脈を持つ経路」の線引きを、30 番に `reason`・`rulePath`・診断の違いを足した。41 番（`weekdays`・営業日を考慮した締め日と空の月の扱い）・42 番（`kinds` の型・`cutoff` の例外）を追加した

### 開発

- 性質のテストに、休業日を起点にした `addBusinessDays`（`addBusinessDays(a, n) = addBusinessDays(businessDayOnOrAfter(a), n − 1)`、n ≥ 1）と、営業日を考慮した締め日（複数のカレンダー × 4 つの方法 × 締め日 1〜31・−1 で、空でない期間が敷き詰められ `closingMonth` と往復する）を足した。規則の診断の性質のテストに `weekdays` を加えた
- サイズの上限（`size-limits.json`）を上げた。ルート 22,000 → 23,000、`./jp` 25,000 → 26,000、`./diagnose` 28,500 → 29,500（gzip）。`weekdays` の検証・判定と営業日を考慮した締め日のため

## [0.14.1] - 2026-10-20

ライブラリの結果は 0.14.0 と同じ（内部の改善と文書だけ）。

### 開発

- `createCalendar`・`createSchedule` の作成が 0.13.0 で約 30% 遅くなっていた（CI の `bench` で 1.26 倍。手元では 14.0 → 18.5µs）のを直した。原因は、`createCalendarFromSchedule` のためにスケジュールの内部の判定を `WeakMap` に登録していたこと。`Object.freeze` 済みのオブジェクトに後から印（`WeakMap` のキーのハッシュや `defineProperty` の項目）を付けると、V8 がオブジェクトを遅い形に落とす。内部の判定を Symbol の項目としてオブジェクトリテラルに最初から含める形に変え、作成のコストは 0.12.0 の水準（手元で 14.9µs）に戻った。公開 API・結果は変わらない。Symbol の項目は `Object.keys`・`JSON.stringify` に出ない
- `docs/decisions.md`: 38 番にこの原因と「作ったあとに印を付けず、リテラルに含める」知見を追記した

## [0.14.0] - 2026-10-20

### 移行

動作は変わりません（締め期間と、暦日と時刻から瞬間への変換の追加）。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 締め日で区切ったときのその月分の期間を返す `closingPeriod(monthOrDate, closingDay)` を追加した（`closingMonth` の逆算。前月の締め日の翌日からその月の締め日まで、両端を含む `{ from, to }`）。暦日を渡すとその日が属する期間。返す値は変更できず、日付の期間の形なので `closedDates` や `listBusinessDays` にそのまま渡せる。締め日がその月にない場合の読み替え（末日）は `closingMonth` と同じ内部関数で行い、期間が隙間も重なりもなく敷き詰められることをテストで確かめた
- 暦日と時刻（`"HH:mm"` または `"HH:mm:ss"`）からタイムゾーンでの瞬間を `Date` で返す `toInstant(date, time, timeZone)` と、営業日カレンダー・スケジュールのメソッド `instantOf(date, time)`（そのタイムゾーンで。合成したカレンダー・スケジュールからのカレンダーにも付く）を追加した。`civilOf`・`toDateTimeParts` の逆向き。夏時間で存在しない時刻は飛んだ分だけ後ろに、2 回ある時刻は先のほう（Temporal の `disambiguation: "compatible"` と同じ）。`Intl` だけで実装し、オフセットの差が 1 時間でないゾーン（`Australia/Lord_Howe`）と南半球（`Pacific/Auckland`）でも確かめた。受け付けるのは暦日の文字列だけ（`invalid-date`）。時刻の誤りは `invalid-time`

### Changed

- README: 月のヘルパーの節に `closingPeriod` を、日付・日時の入力の節に `toInstant`・`instantOf` と夏時間の例を足した。サイズの値を測り直した（ルート約 9.3KB・日本の祝日込み約 11.1KB・英国の祝日込み約 11.1KB。0.14.0 で測定）
- `docs/decisions.md`: 39 番（`closingPeriod`）・40 番（`toInstant`）を追加した
- `src/core/schedule.ts` の `buildSchedule` の注釈の位置を直した（0.13.0 で関数の間に別の定義が入り、注釈が離れていた。動作は変わらない）

### 開発

- サイズの上限（`size-limits.json`）を上げた。ルート 20,500 → 22,000、`./jp` 23,500 → 25,000、`./diagnose` 27,000 → 28,500（gzip）。`closingPeriod` と瞬間への変換（ルートで約 1.3KB）のため。0.13.0 で上限に近づいていた分も含めて余裕を持たせた

## [0.13.0] - 2026-10-20

### 移行

動作は変わりません（スケジュールから営業日カレンダーを作る関数と、判定の理由の新しい値の追加。CI の改善）。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- スケジュールから営業日カレンダーを作る `createCalendarFromSchedule(schedule, isOpen, { maxSearchDays? })` を追加した。`isOpen` が true を返す値の日を営業日とする通常のカレンダーを返し、営業時間表のようなスケジュールが唯一の設定になる。`isOpen` は値だけを受け取る純粋な関数（日付は渡さない。営業日の探索で繰り返し呼ぶため）。`dayInfo` の `reason` はスケジュールの `reason` と営業・休業の組み合わせで、`name`・`holiday`・`shiftedFrom`・`rulePath` はスケジュールの結果を引き継ぐ。祝日・タイムゾーン・`outOfRange` はスケジュールのもの。`createSchedule` が作ったスケジュール以外は `invalid-argument`
- 判定の理由（`DayReason`）に `"open-annual"`（スケジュールの `annual` の値で営業になる日）を追加した。`createCalendar` の結果には現れない（`closedAnnual` は休業だけ）

### Changed

- README: 「スケジュールから営業日カレンダーを作る」の節を足した。型定義の確認の範囲を、CI で確かめる TypeScript の版（5.0・5.5・5.8・6.0・7.0）に改めた。サイズの値を測り直した（ルート約 9.0KB・日本の祝日込み約 10.8KB・英国の祝日込み約 10.7KB。0.13.0 で測定）
- `docs/decisions.md`: 38 番（スケジュールからのカレンダー・`"open-annual"`・利用者の TypeScript の版の確認）を追加した

### 開発

- CI に `consumer-types` ジョブを追加した。公開する型定義を、利用者が使う TypeScript 5.0.4・5.5.4・5.8.3・7.0.2（ネイティブ版）のそれぞれで、`moduleResolution` の `node16`・`nodenext`・`bundler` で型チェックする。各版は依存にせず、版と SHA-256 を固定した tgz から一時ディレクトリに入れる（7.0 はランナー向けの実行形式 `@typescript/typescript-linux-x64` も固定）。`pnpm check` は従来どおり開発用の 6.0.3 で確かめる
- `scripts/check-consumer-types.ts` に `--tsc <path>` を足し、わざと型エラーを含む `test/consumer/consumer-error.mts` が各版で失敗として報告されること（検査が機能していること）も確かめるようにした。リポジトリの `@types` を読まないよう `--typeRoots` を空にした（古い TypeScript では `@types/node` の新しい構文を読めないため）。`--ignoreConfig` は 6.0 以降でだけ渡す
- `createCalendar` の `dayInfo` の変換を `createCalendarFromSchedule` と共用の内部関数に切り出した。結果は変わらない

## [0.12.0] - 2026-10-20

### 移行

動作は変わりません（繰り返しの規則の新しい形・`dayInfo` の新しい項目の追加と、診断・CI の改善）。`bizdays-toolkit/jp`・`bizdays-toolkit/uk` の定数 `dataVersion`・`confirmedThrough` が非推奨になったので、使っていれば提供元の項目（`jp.dataVersion`・`england.confirmedThrough` など）に書き換える。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 繰り返しの規則に、祝日の形 `{ holiday: true, kinds?, months? }`（型 `HolidayPattern`）を追加した。祝日の既定の扱い（`holidayPolicy`・スケジュールの `holiday`）の例外を、「2027 年 4 月から祝日も営業」（`openRecurring: [{ holiday: true, effectiveFrom: "2027-04-01" }]`）、「振替休日と国民の休日は営業」（`kinds: ["substitute", "citizens"]`）、「5 月の祝日は特別営業時間」（スケジュールの `recurring`）のように書ける。`kinds` は `months` と同じ絞り込みの配列（省略時はすべての祝日）。判定は「祝日の上」の段階（`"over-holiday"` の規則と同じ）で、`holidayPolicy: "ignore"` でも当てはまる。当てはまる日は祝日なので `onHolidayRule` は指定できない（`invalid-option`）。`kinds` は `holiday` の規則でだけ使える
- `DayInfo`・`ScheduleDay` に `rulePath`（値を決めた規則の設定の中の位置。規則の診断の `path` と同じ形。例: `"closedRecurring[0]"`）を追加した。`dates`・`annual`・`recurring`（振替先を含む）で決まった日にだけ付き、祝日・曜日で決まった日には付かない。合成したカレンダーは決めたカレンダーの `rulePath` を引き継ぐ

### Deprecated

- `bizdays-toolkit/jp`・`bizdays-toolkit/uk` の定数 `dataVersion`・`confirmedThrough` を非推奨にした（`@deprecated`）。提供元の項目（`jp.dataVersion`・`jp.confirmedThrough`、英国は `england.dataVersion` など 4 つの提供元で同じ値）と同じ値で、経路を 1 つにするため。1.0.0 で削除する

### Changed

- 規則の診断で、祝日の規則を扱えるようにした。提供元のない設定、または `kinds`・`months`・有効期間に当てはまる祝日がない規則は `never-matches`。`shadowed` は祝日の規則どうし（`kinds`・`months`・有効期間の包含）でだけ調べ、既定の扱いと同じ向きの規則は `redundant` で見つける
- 規則の診断の `unknown-option` の候補（did you mean）で、既知のキーの先頭部分（`onHoliday` → `onHolidayRule`）を、短い別のキー（`holiday`）との編集距離より優先するようにした
- 繰り返しの規則の形の誤りのメッセージを、`"weekday"`・`"day"`・`"dayAfterHoliday"`・`"holiday"` のうち 1 つだけを持つ、に改めた（code は `invalid-option` のまま）
- README: 繰り返しの規則の節に祝日の規則を、`rulePath` の説明を、合成の節に祝日の提供元の和集合の意味（同じ提供元は 1 つ、包んだ提供元は別物、同じ日付は先のカレンダーの提供元）を足した。`dataVersion`・`confirmedThrough` の案内を提供元の項目に改めた。サイズの値を測り直した（ルート約 8.8KB・日本の祝日込み約 10.6KB・英国の祝日込み約 10.5KB。0.12.0 で測定）
- `docs/decisions.md`: 4 番に「知っているキーの無効な組み合わせは例外にする」境界を、34 番に和集合の意味を足した。35 番（祝日の規則）・36 番（`rulePath`）・37 番（定数の一本化と性能の検証）を追加した

### 開発

- CI に `bench` ジョブを追加した。公開済みの前の版（npm の `latest`）と今回の `dist` を同じランナーで `scripts/bench.ts` にかけ、`scripts/bench-compare.ts` で比率を比べる。どれかの計測が 2 倍より遅ければ失敗し、絶対値は Job Summary に残す（`pnpm check` には含めない）。`scripts/bench.ts` に `--package <dir>`・`--json <file>` を足した
- サイズの上限（`size-limits.json`）を上げた。ルート 19,500 → 20,500、`./jp` 22,500 → 23,500、`./diagnose` 26,000 → 27,000（gzip）。祝日の規則の検証・判定と `rulePath`（ルートで約 0.5KB）、診断の祝日の規則への対応と候補の改善（約 0.7KB）のため
- 性質のテストに祝日の規則を加えた。規則を取り除いた結果との比較では、位置がずれる `rulePath` を除いて比べる
- ライブラリ内のテストとスクリプトで、非推奨にした定数 `confirmedThrough` の代わりに提供元の項目を使うようにした

## [0.11.1] - 2026-10-19

ライブラリのコードは 0.11.0 と同じ。

### Changed

- README: よくある設定の例に、「その日が月の第何営業日か」（`businessDaysBetween` + 1。`nthBusinessDayOfMonth` の逆算）、「次の休業日と、その理由」（`daysBetween` で営業日でない最初の日）、「銀行の営業日」（3 行の設定。着金日は合成で求める）の 3 件を足した
- CHANGELOG: 0.11.0 の「移行」に `docs/migration.md` への案内を足した（GitHub Release の本文は公開後に直してあり、これでリポジトリ側もそろう）

## [0.11.0] - 2026-10-19

### 移行

作業は要りません（繰り返しの規則の新しい形と、カレンダーを合成する関数の追加）。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 繰り返しの規則（`closedRecurring`・`openRecurring`・スケジュールの `recurring`）に、祝日の翌日の形 `{ dayAfterHoliday: true }` を追加した。前日が祝日でその日自身は祝日でない日（連休なら連休が明けた日）に当てはまる。「祝日」は提供元の祝日だけで、休業日の設定は含めない。当てはまる日は祝日でないので `onHolidayRule` は指定できない（`invalid-option`）。`months`・`name`・有効期間と組み合わせられる。型 `DayAfterHolidayPattern` を追加した
- 作成済みの営業日カレンダーを合成する `combineCalendars(calendars, { businessDay: "all" | "any", maxSearchDays? })` を追加した。すべてが営業している日（`"all"`）、またはいずれかが営業している日（`"any"`）を営業日とする通常のカレンダーを返し、営業日の加減算・調整・期日などが合成結果で動く。`dayInfo` の `reason`・`name`・`shiftedFrom` は合成結果と同じ判定をした最初のカレンダーの結果で、その番号を新しい項目 `decidedBy` で返す。祝日は各カレンダーの提供元の和集合で判定する。タイムゾーンが違えば `time-zone-conflict`、2 つ未満・同じカレンダーの重複は `invalid-argument`。型 `CombineOptions` を追加した
- `DayInfo` に省略可能な `decidedBy`（合成したカレンダーで判定を決めたカレンダーの番号）を追加した。合成していないカレンダーでは付かない
- `HolidayLookup`（営業日カレンダー・スケジュール）に `outOfRange`（設定の値）を追加した。合成するときに引き継ぐため

### Changed

- 規則の診断で、祝日の翌日の規則を扱えるようにした。提供元のない設定では `never-matches`。`shadowed` は祝日の翌日の規則どうし（`months` と有効期間）でだけ調べ、曜日の規則との重なりは `redundant` で見つける
- 繰り返しの規則の形の誤りのメッセージを、`"weekday"`・`"day"`・`"dayAfterHoliday"` のうち 1 つだけを持つ、に改めた（code は `invalid-option` のまま）
- README: 繰り返しの規則の節に祝日の翌日を、新しい節「カレンダーの合成」を足した。サイズの値を測り直した（ルート約 8.6KB・日本の祝日込み約 10.3KB・英国の祝日込み約 10.2KB。0.11.0 で測定）

### 開発

- サイズの上限（`size-limits.json`）を上げた。ルート 17,500 → 19,500、`./jp` 20,500 → 22,500、`./diagnose` 24,000 → 26,000（gzip）。祝日の翌日の規則と `combineCalendars`（ルートで約 1.7KB）と、診断の祝日の翌日への対応（約 1.9KB）のため
- `createCalendar` の営業日の探索・調整・月の営業日の実装を、祝日を調べる機能と 1 日分の判定を引数に取る内部関数（`buildCalendar`）に切り出し、`combineCalendars` と共用した。公開 API と結果は変わらない
- 性質のテストに祝日の翌日の規則を加えた

## [0.10.0] - 2026-10-19

### 移行

動作は変わりません（繰り返しの規則・毎年の月日の規則への省略可能な項目の追加と、診断の改善）。`bizdays-toolkit/jp` の `toJapanDate`・`toJapanDateTime` が非推奨になったので、使っていれば `toDateString(input, "Asia/Tokyo")`・`toDateTimeParts(input, "Asia/Tokyo")`（または営業日カレンダー・スケジュールの `dateOf`・`civilOf`）に書き換える。書き換え方は [docs/migration.md](./docs/migration.md)。

### Added

- 繰り返しの規則（`closedRecurring`・`openRecurring`・スケジュールの `recurring`）と毎年の月日の規則（`closedAnnual` のオブジェクトの形・スケジュールの `annual`）に、有効期間 `effectiveFrom`・`effectiveTo`（両端を含む `"YYYY-MM-DD"`。一方だけなら、もう一方は期限なし）を付けられるようにした。期間の外では、その規則は書かれていないのと同じに扱う（判定の順番は変わらない）。「2027 年 4 月から定休日を月曜から火曜に変える」「夏季休業を今年限りでやめる」を 1 つのカレンダーで表せ、切り替え日をまたぐ営業日の計算（`addBusinessDays` など）も正しくなる。`"after-holiday"` の振替は振替元の日で期間を判定する。型 `EffectivePeriod` を追加した。`effectiveFrom` が `effectiveTo` より後なら `invalid-range`
- 曜日の規則に周期 `interval`（週数。2 以上の整数）と起点 `anchor`（`weekday` と同じ曜日の日付）を付けて、「隔週水曜定休」のような規則を書けるようにした。`anchor` と同じ曜日で、`anchor` との日数の差が 7 × `interval` の倍数の日（起点より前の日も）に当てはまる。`nth` とは併用できず、`months`・`onHolidayRule`・有効期間とは組み合わせられる。「第 1・第 3 水曜」（`nth: [1, 3]`）は水曜が 5 回ある月で隔週からずれるため、別の書き方にした。`interval` と `anchor` の片方だけ、`anchor` の曜日違い、`day` の規則への指定は `invalid-option`

### Deprecated

- `bizdays-toolkit/jp` の `toJapanDate`・`toJapanDateTime` を非推奨にした（`@deprecated`）。同じ変換がルートの `toDateString(input, "Asia/Tokyo")`・`toDateTimeParts(input, "Asia/Tokyo")` と、営業日カレンダー・スケジュールの `dateOf`・`civilOf` にあり、国ごとの関数は日本だけの特別扱い（英国には対応物がない）だったため。少なくとも 1 つのマイナー版は残し、1.0.0 で削除する。`etc/api.md` に `@deprecated` を記録するようにした

### Changed

- 規則の診断（`bizdays-toolkit/diagnose`）を、有効期間と周期に対応させた。`shadowed` は先の規則の期間が後の規則の期間を含み、周期も含む（毎週は隔週を覆う。位相の違う隔週どうしは覆わない）ときだけ出す。有効期間の中に当てはまる日がない規則は `never-matches`。規則の有効期間が祝日の提供元の対応年の外にあれば `out-of-range`（新しい code は足していない）
- `redundant`・`no-business-day` の走査の範囲を見直した。周期のある規則があれば、提供元がない設定の 2001〜2028 年を周期がそろう長さ（隔週なら 56 年。上限 200 年）に広げ、規則の有効期間が範囲の外にあれば、その期間も調べる（`outOfRange: "throw"` では対応年の中だけ）。これまでは固定の範囲の外にある期間の規則を「使われない」と誤診した。調べた年は `message` に書く
- README: 繰り返しの規則の節に、有効期間と隔週の書き方・例を足した。`businessDaysBetween` だけが `to` を含まない理由（区間を足し合わせられ、`addBusinessDays` の逆算になる）を書いた
- README のサイズの値を測り直した（ルート約 7.9KB・日本の祝日込み約 9.8KB・英国の祝日込み約 9.6KB。0.10.0 で測定）
- `docs/decisions.md`: 有効期間と周期の設計（30 番）と `businessDaysBetween` の範囲（31 番）を足し、6 番（契約の項目に `names` を追記）・13 番と 16 番（その月にない日の扱いが `dueDate`・`closingMonth` と繰り返しの規則で違うことの相互参照）・14 番（土曜日を避ける方法は個別の日付での上書き、振替と有効期間）・15 番（走査の範囲）の記述を直した

### 開発

- サイズの上限（`size-limits.json`）を上げた。ルート 16,500 → 17,500、`./jp` 19,500 → 20,500、`./diagnose` 22,000 → 24,000（gzip）。有効期間と周期の検証・判定（ルートで約 0.8KB）と、診断の走査範囲・包含判定の見直し（約 2.3KB）のため
- 性質のテスト（`test/diagnose-properties.test.ts`）で、有効期間と周期のある規則も作るようにした。固定の走査範囲（2001〜2028 年）の外や、28 年の周期をまたぐ年の日付も比べる

## [0.9.1] - 2026-10-18

ライブラリのコードは 0.9.0 と同じ。

### Changed

- README: スケジュールの `daysBetween` を `holiday` だけで絞ると、`dates`・`annual` で値を決めた祝日（特別営業日など）も含まれることと、それを除く絞り込み（`reason` が `"date"`・`"annual"` の日を除く）の例を足した

### 開発

- ブラウザーでの確認の Edge の起動オプションに、`--disable-dev-shm-usage` と `--disable-gpu` を足した。CI のランナーで Edge のページの読み込みが止まり、やり直し（`RETRY`）がほぼ毎回起きていたため

## [0.9.0] - 2026-10-18

### 移行

作業は要りません（機能の追加だけ）。時刻を必ず持つ入力では `time` の型が `string` になったので、これまでの `null` の分岐は不要になります（残しても動く）。版ごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 期間の日ごとの情報を返す `daysBetween(from, to)` を、スケジュール（`ScheduleDay` の配列）と営業日カレンダー（`DayInfo` の配列）に追加した。両端を含み、`from` が `to` より後なら `invalid-range`。祝日だけ欲しい場合は、結果を `holiday` で絞る
- 時刻を必ず持つ入力の型 `DateTimeInput`（`Date`・Temporal の `Instant`・`ZonedDateTime`・`PlainDateTime`・`"YYYY-MM-DDTHH:mm…"` の文字列）と、`TemporalDateTimeLike` を追加した

### Changed

- `civilOf`（スケジュール・営業日カレンダー）・`toDateTimeParts`・`toJapanDateTime` に、`DateTimeInput` を渡したときは `time` の型を `string` とするオーバーロードを加えた。返す値は変わらない。`CivilDateTimeParts` は時刻の型を引数に取る型になった（省略時はこれまでと同じ `string | null`）
- README: スケジュールの `dayInfo` の `reason` は値を決めた規則であり、祝日の規則が `"weekday"` のときは祝日でも `"weekday"` になること（祝日かどうかは `holiday` で判定する）を書いた。`createCalendar`・`createSchedule` は作ったものを使い回すのが基本で、作成のコストも小さいこと（測った値）を書いた。1 つの配列で持つ特別営業日を `dates` と `annual` に振り分ける例と、型定義の確認の範囲（CI で `moduleResolution` の `node16`・`nodenext`・`bundler`、0.9.0 の時点で TypeScript 5.0・5.5・5.8 も手作業で確認）を足した
- README のサイズの値を測り直した（ルート約 7.5KB・日本の祝日込み約 9.0KB・英国の祝日込み約 9.1KB。0.9.0 で測定）
- 移行ガイド（`docs/migration.md`）を追加した。0.2.0〜0.9.0 で利用者がする作業を版ごとにまとめた

### 開発

- `pnpm check` で、利用者のプロジェクトとして公開する型定義を型チェックするようにした（`scripts/check-consumer-types.ts`・`test/consumer/consumer.mts`。`moduleResolution` を `node16`・`nodenext`・`bundler` に変え、ライブラリの型定義の検査も有効にする）

- GOV.UK の監視を、外部の cron サービス（cron-job.org）から `workflow_dispatch` で起動する形にした（毎日 06:00 日本時間）。GitHub の schedule は予備として 18:17（日本時間）に移した。GitHub の schedule は高負荷時に遅れたり落ちたりし、追加してから一度も動かなかったため。動いたことは最後に healthchecks.io へ知らせ（Secrets の `HEALTHCHECKS_PING_URL`。照合そのものが失敗したときは `/fail`）、知らせが途絶えたらメールが届くようにした（RELEASING.md の「監視の起動とハートビート」。cron-job.org からの呼び出しは REST API の 2026-03-10 版を指定する）

- ブラウザーでの確認（`scripts/test-browsers.ts`）に時間制限を設けた。ページの読み込みとスクリプトの実行は 30 秒（WebDriver の `timeouts`）、ドライバーへの各呼び出しは 60 秒。結果を受け取る前の段階（ドライバーの起動・セッションの作成・ページの読み込み・結果の待ち）で止まったときだけ、ドライバーを起動し直して 1 回だけやり直し、その理由を `RETRY` としてログに出す。確認の結果が FAIL のときはやり直さない。CI でランナー上の Edge がページの読み込みで応答しなくなり、既定の 300 秒を待って失敗したため

## [0.8.1] - 2026-10-18

ライブラリのコードは 0.8.0 と同じ。動作を確かめる環境を広げ、README の記述を確かめた範囲に合わせた。

### Changed

- README の動作環境の記述を、CI で確かめた範囲に合わせた。「Node.js・ブラウザー・エッジランタイムで動作」を、確かめている環境（Node.js・Chrome・Firefox・Edge・Safari・Cloudflare Workers）の明記に改め、確かめていない環境（Deno・Bun・Vercel の Edge Runtime など）も書いた。Temporal は形で判別していることと、本物の Temporal を備えた環境では CI で確かめていることを書いた。サイズの値に測った版（0.8.1）を添えた。エラーコードの一覧に `invalid-input` を足した
- README に、CI で確かめている Node.js の版（22.12・22・24・26）と、CommonJS の `require()` で読み込めることを CI で確かめていることを書いた。Node.js 22.12 では `require()` での読み込みに実験的な機能の警告が出ることも書いた（結果には影響しない）。`engines`（`>=22.12`）は変わらない

### 開発

- 公開する `dist` を ESM（`import`）と CommonJS（`require()`）で確かめるテスト（`test/compat`、`pnpm test:compat`）を追加し、`pnpm check` に含めた。CI に `compat` ジョブを追加し、engines の下限の Node.js 22.12.0 と 26.12.0 でも確かめる（これらの版ではテストの `.ts` と npm 12 が動かないため、ビルドは Node.js 24 で行い、Node.js を切り替えて `dist` だけを確かめる）

- CI に、公開する `dist` をブラウザーと Cloudflare Workers で確かめるジョブを追加した。`browsers`（Chrome・Firefox・Edge。ランナーのドライバーを WebDriver で操作する `scripts/test-browsers.ts`）・`safari`（macOS）・`workerd`（版と SHA-256 を固定した公式のリリースの workerd で動かす `scripts/test-workerd.ts`）。確認の中身は `test/compat/smoke.mjs` に共通化し、本物の Temporal を備えた環境では Temporal のオブジェクトでも確かめる
- `pnpm check` で、README（英語・日本語）のコード例を実行し、コメントに書いた結果と比べるようにした（`scripts/check-readme-examples.ts`）
- `pnpm check`（`scripts/check-package.ts`）で、`src` が Node.js 固有の機能（`node:` のモジュール・`process`・`Buffer` など）を使っていないことを確かめるようにした
- 自前のスクリプトとテストで Node.js の警告が出たら失敗にするようにした（`scripts/strict-warnings.ts`。`test/compat` は対象外）
- `pnpm check` の最初に、開発用のツールの版を確かめる `scripts/check-toolchain.ts` を追加した（ワークフローどうしの Node.js の版、compat の行列の engines の下限、実行している Node.js・npm・pnpm と固定版の比較。固定版との違いは CI ではエラー、手元では注意の表示）
- GOV.UK の監視のワークフローに、手動実行の入力 `simulate` を追加した。架空の祝日を 1 件足して照合し（`pnpm verify:govuk --simulate`）、ラベル `govuk-data-simulation` の issue で差分の経路を確かめられる
- `pnpm check` のパッケージの中身の検査（`npm pack --dry-run`）を、Windows で Node.js の非推奨の警告（DEP0190）が出ない形で npm を起動するようにした

## [0.8.0] - 2026-10-17

### Added

- 英国の bank holidays の提供元を `bizdays-toolkit/uk` に追加した。地域ごとに `england`（`GB-ENG`）・`wales`（`GB-WLS`）・`scotland`（`GB-SCT`）・`northernIreland`（`GB-NIR`）の 4 つで、タイムゾーンは `Europe/London`、対応年は 2012〜2099 年。2012 年から GOV.UK が公表している最後の年（2028 年）までのすべての日付と名称が、GOV.UK のデータ（現在の `https://www.gov.uk/bank-holidays.json` と、それより前の年は GOV.UK の公式リポジトリ alphagov/calendars・alphagov/frontend の履歴）と一致することをテストで確かめている。それより後の年は規則による予測（`confirmed: false`）。GOV.UK では England と Wales が 1 つの区分だが、別の提供元にした（日付は現在同じ）。Wales の祝日には、GOV.UK のウェールズ語版の名称を `names.cy` に付ける。種別（`kind`）は `"regular"`（毎年の祝日。布告で移動した年を含む）・`"substitute"`（振替）・`"special"`（布告による臨時の祝日）で、型は `UkHolidayKind`・`KnownUkHolidayKind`・`UkHoliday`
- `pnpm verify:govuk`（`scripts/verify-govuk.ts`）を追加した。GOV.UK の JSON とウェールズ語の名称（alphagov/frontend の翻訳ファイル）を取得し、ライブラリの計算結果・テスト用フィクスチャと照合する

### Changed

- 公式データの反映（法改正・官報公表・布告による祝日の新設・移動・臨時の祝日、春分・秋分の日の確定、GOV.UK の新しい年の公表）を、マイナー版ではなく**パッチ版**で公開する方針に改めた（RELEASING.md）。0.x の期間は `^0.8.0` が 0.9.0 を受け取らないため、マイナー版では臨時の祝日が利用者に届かない。パッチ版なら 0.x でも 1.0.0 以降でも、`^`・`~` のどちらの指定にも届く
- README を英語を既定にした（`README.md`）。日本語版は `docs/README.ja.md` に移し、それぞれの冒頭に切り替えのリンクを置いた。npm に公開するファイルは変わらない（日本語版はパッケージに含めない。npm はルートの `README*` を `files` の指定にかかわらず含めるため、`docs/` に置く）。README に書いている minify + gzip のサイズを測り直し、日本の祝日込みを約 8.5KB から約 9.0KB に直した（0.7.0 までの記載が実際より小さかった）。英国の祝日込みは約 9.0KB

### 開発

- `bizdays-toolkit/uk` のサイズの上限（gzip 6,700 バイト）を `size-limits.json` に追加した（エントリーの追加。計測は 6,225 バイト）。README の minify + gzip のサイズは、ルートのすべてと国の提供元（`jp`、または英国の 4 つ）を読み込む入口を esbuild で bundle・minify して gzip で測った（ルート 7,394 バイト、日本 8,953 バイト、英国 9,043 バイト）
- GOV.UK の bank holidays を毎日照合するワークフロー（`.github/workflows/govuk-watch.yml`）を追加した。差分があれば `pnpm verify:govuk` の結果と alphagov/frontend の該当ファイルの最新のコミットを本文にした issue（ラベル `govuk-data`）を立て、同じ issue が開いていれば内容が変わったときだけ本文を更新してコメントする。取得に失敗した場合も、監視が機能していないことを issue で知らせる。60 日間動きのないリポジトリで定期実行が止まらないよう、実行のたびにワークフローを有効化し直す。フィクスチャはワークフローでは更新せず、規則の修正と同じコミットで更新する
- CI に、ワークフローを actionlint（1.7.12。版と SHA-256 を固定した公式のリリースを取得）で検査するジョブを追加した。`run:` のシェルスクリプトもランナーの shellcheck で検査する。ワークフローの誤りは `pnpm check` では見つからないため
- CI・リリース・監視のワークフローの Node.js を 24.21.0 から 24.22.0 に、pnpm を 12.11.2 から 12.14.0 に上げた（手元の開発環境に合わせる）
- `pnpm check`（`scripts/check-package.ts`）で、`README.md` と `docs/README.ja.md` の見出しの数（段ごと）とコードブロックの数が一致し、互いへの切り替えのリンクがあることを確かめるようにした
- `pnpm check` が、パッケージの中身を `files` の指定からの推定ではなく、実際の `npm pack --dry-run --json` の結果で確かめるようにした（npm が指定にかかわらず含めるファイルを見落とさないため）。ルートに `README.ja.md` があれば失敗する

## [0.7.0] - 2026-10-16

### Added

- 祝日（`Holiday`）に、ほかの言語の名称 `names`（省略可能。キーは BCP 47 の言語タグの正規の形。例: `{ "zh-Hant": "…", ko: "…" }`）を追加した。利用者が実装した提供元が付けた `names` を、提供元のデータの検証で確かめ（誤りは `invalid-provider-data`）、複製・凍結して返す。同梱の日本の祝日は `names` を持たない（公式の出典がある日本語・英語の名称だけを同梱する）

### 開発

- `size-limits.json` の値を上げるときの理由は、コミットメッセージではなく CHANGELOG の「開発」に書く取り決めにした。`pnpm check`（`scripts/check-size.ts`）が前の版のタグの `size-limits.json` と比べ、値が上がっているのに記載がなければ失敗する（0.6.0 で理由をコミットメッセージに書き漏らしたため）。CI とリリースのワークフローは履歴とタグを取得して（`fetch-depth: 0`）この確認を行い、リリースのワークフローではタグを付けたコミットを 1 つ前の版のタグと比べる

## [0.6.0] - 2026-10-16

### Added

- 日付の調整 `adjust(input, { convention })`（営業日カレンダー）: 休業日を `"following"`（翌営業日）・`"preceding"`（前営業日）・`"modified-following"`（翌営業日。月が変わるなら前営業日）・`"modified-preceding"`（前営業日。月が変わるなら翌営業日）で調整する。月が変わるかは調整する前の日付の月と比べる
- 月の営業日（営業日カレンダー）: `nthBusinessDayOfMonth(month, n)`（負なら月末から数える。-1 は最終営業日）・`firstBusinessDayOfMonth(month)`・`lastBusinessDayOfMonth(month)`
- 月の期日 `dueDate(month, { day, convention })`（営業日カレンダー）: その月の `day` 日（-1 は末日。その月にない日は末日に読み替える）を `convention` で調整する
- 月の計算（ルート）: `monthOf(dateOrMonth, offset?)`（n か月後の月 `"YYYY-MM"`）・`closingMonth(date, closingDay)`（締め日で区切ったときの月）
- 例外のコード `invalid-month`（月 `"YYYY-MM"` の誤り）
- 型: `BusinessDayConvention`・`AdjustOptions`・`DueDateOptions`・`MonthString`

### 開発

- `pnpm check`（`scripts/check-package.ts`）で、CHANGELOG の版の節の並び・日付と、末尾のリンク定義が節とそろっていることを確かめるようにした（0.5.0 でリンク定義の更新漏れがあったため）
- リリースのワークフローで、CHANGELOG の日付が `YYYY-MM-DD` のまま・見出しがないときの表示を分かりやすくした（止まる条件は変わらない）
- 月の計算と日付の調整の性質のテストを追加
- サイズの上限を上げた（`.` 16500・`./jp` 19500・`./diagnose` 22000。月の計算の追加。minify + gzip ではルートが約 7.2KB、日本の祝日込みで約 8.3KB）
- `docs/decisions.md` に 16 番目（日付の調整と月の期日の設計）を追加

## [0.5.0] - 2026-10-16

### Added

- 規則の診断（サブパス `bizdays-toolkit/diagnose`）: `diagnoseCalendar(options)`・`diagnoseSchedule(options)`。例外を投げず、`{ severity, code, path, message, relatedPath? }` の配列を返す
  - `error`: 作成で例外になる誤り（`code` は例外と同じ）。作成時は最初の 1 件で止まるが、診断ではすべて返す。祝日の提供元が返すデータは、対応年のすべての年を調べる（`invalid-provider-data`）
  - `warning`: `unknown-option`（知らないキー。近い既知のキーを候補に挙げる）・`shadowed`（同じ種類の先の規則に完全に含まれる。`relatedPath` に先の規則）・`never-matches`（当てはまる日がない繰り返しの規則）・`out-of-range`（個別の日付が祝日の提供元の対応年の外）・`no-business-day`（営業日が 1 日もない設定）
  - `info`: `redundant`（取り除いても結果が変わらない規則）
- 型: `Diagnostic`・`DiagnosticSeverity`・`DiagnosticCode`・`KnownDiagnosticCode`

### Removed

- `HolidayRule` 型（0.4.0 で非推奨）: `HolidayValueRule` を使う

### 開発

- 診断の性質のテスト（`test/diagnose-properties.test.ts`）: 使われない・取り除いても変わらないと診断した規則を実際に取り除き、結果が変わらないことを乱数の設定で確かめる
- サイズの上限に `./diagnose` を追加
- `docs/decisions.md` に 15 番目（規則の診断の設計）を追加

## [0.4.0] - 2026-10-15

### Added

- 繰り返しの規則: 毎週（`{ weekday }`）・毎月の第 n 曜日（`{ weekday, nth }`。`nth` は 1〜5 と -1（最終））・毎月の日（`{ day }`。`day` は 1〜31 と -1（末日））。どれにも月の絞り込み（`months`）を付けられる。営業日カレンダーの `closedRecurring`・`openRecurring`、スケジュールの `recurring`
- 祝日に当たったときの扱いを規則ごとに選ぶ `onHolidayRule`: `"under-holiday"`（祝日の扱いに従う。既定）・`"over-holiday"`（祝日でも当てはめる）・`"after-holiday"`（祝日でない翌日に振り替える。「月曜休館（祝日の場合は翌平日）」など）
- `dayInfo()` の `shiftedFrom`: 振替で決まった日の、振替の元の日付
- 判定の理由に `"recurring"`（スケジュール）・`"open-recurring"`・`"closed-recurring"`（営業日カレンダー）を追加
- 型: `RecurringRule`・`RecurringValue`・`RecurringPattern`・`WeekdayPattern`・`DayOfMonthPattern`・`OnHolidayRule`・`Nth`・`DayOfMonth`・`Month`・`HolidayValueRule`

### Deprecated

- `HolidayRule` 型: `HolidayValueRule` に改名した（繰り返しの規則の `onHolidayRule` と紛れないため）。旧名は同じ型の別名として残し、次以降のマイナー版で削除する

### 開発

- 性能の計測（`pnpm bench`、依存なし）を追加
- README に繰り返しの規則の節と、よくある設定の例（国民の休日を営業日として扱う、共通の設定から店舗ごとのカレンダーを作る）を追加。`docs/decisions.md` に 12〜14 番目（判定の順番を固定する理由、「第 n 何曜日」の定義、振替先の定義）を追加

## [0.3.1] - 2026-10-15

ライブラリのコード・公開する API・祝日データに変更はありません。開発の検査を強めた版です。

### 開発

- lint に oxlint（1.88.0）を導入し、`pnpm check` と CI で実行するようにした（`.oxlintrc.json`）
- 型チェックを強めた（`noUnusedLocals`・`noUnusedParameters`・`noImplicitReturns`・`exactOptionalPropertyTypes`）
- oxfmt を 0.73.0 に更新
- 改行コードを LF に統一した（`.gitattributes`）

## [0.3.0] - 2026-10-15

1.0.0 に向けて、将来の機能追加で利用者のコードが壊れにくい作りにしました。機能の追加はありません。

### Added

- 例外に `code` を付けた（`invalid-date`・`invalid-range`・`no-business-day` など）。例外は従来どおり `RangeError`・`TypeError`・`Error` のインスタンス。`isBizdaysError()` で判定できる
- `KnownDayReason`・`KnownScheduleReason`・`KnownJapaneseHolidayKind`・`KnownErrorCode`: 既知の値だけの閉じた型（網羅を型で確かめたい場合に使う）
- 祝日の提供元（`HolidayProvider`）の形式を作る時点で、返したデータを年ごとに初めて使うときに検証する（誤りは `invalid-provider`・`invalid-provider-data`）

### Changed

- `DayReason`・`ScheduleReason`・`JapaneseHolidayKind` を「開いた型」にした（将来の版で値が増えても、利用者のコードがコンパイルエラーにならない）。値を列挙して分岐しているコードは「その他」の分岐が必要になる
- 設定の誤りのメッセージに、設定の中の位置（例: `closedDates[1].date`）を入れた
- 設定は作る時点で複製するようにした（作ったあとに元の配列を書き換えても、結果が変わらない）
- 提供元が返した祝日は、契約の項目だけを持つ変更できないオブジェクトにして返す
- 別の実行環境（iframe・`vm`）で作られた `Date` も受け付けるようにした

### Removed

- `vernalEquinoxDay`・`autumnalEquinoxDay`（`bizdays-toolkit/jp`）: 祝日の計算の内部の手段のため非公開にした
- `nthWeekdayOfMonth`: 内部の関数のため非公開にした

### 開発

- 品質の確認を追加: タイムゾーン（`TZ`）を変えたテスト、性質のテスト、型のテスト、サイズの上限（`size-limits.json`）、公開 API のスナップショット（`etc/api.md`）
- 互換性の約束と安定度の表示（`@public`・`@beta`）を RELEASING.md に、設計上の決定を `docs/decisions.md` に記載
- `SECURITY.md` を追加（脆弱性の非公開の報告先）

## [0.2.0] - 2026-10-14

### Added

- `createSchedule()`: 曜日・祝日・毎年の月日・個別の日付の規則から、日ごとに任意の値（営業時間など）を返すスケジュール。祝日の値は `"weekday"`（曜日どおり）・`{ sameAs: 曜日 }`（その曜日の値）・`{ value }`（指定の値）から選べる。`valueOn`・`dayInfo`（値を決めた規則と祝日の情報付き）
- `civilOf()`（営業日カレンダー・スケジュール）、`toDateTimeParts()`、`toJapanDateTime()`（`bizdays-toolkit/jp`）: 入力を、タイムゾーンでの暦日と時刻（`"HH:mm"`）に変換する

### Changed

- 営業日カレンダー（`createCalendar`）を、スケジュールの真偽値版として作り直した。判定の優先順位と結果は変わらない

## [0.1.2] - 2026-10-12

ライブラリのコードと祝日データに変更はありません。

### Changed

- npm への公開を staged publishing に変更した。GitHub Actions は版をステージするだけで、メンテナーが npmjs.com で 2FA 付きで承認するまで利用者には届かない。npm の Trusted Publisher の設定でも直接公開（npm publish）を許可しないようにした。GitHub Release は下書きで作成し、承認後に公開する
- README のロゴの配色を変更した。文字（「bizdays」の緑と「-toolkit」の灰色）とカレンダーの留め具は、ライト・ダークどちらの背景でも読める両テーマ共通の中間色にし、アイコンの配色だけを `<picture>` でテーマに合わせて切り替える。`<picture>` の切り替えは GitHub のテーマ設定ではなく OS の設定に従うため、両者が食い違うと反対の背景にロゴが表示されて読みにくかった

## [0.1.1] - 2026-10-12

ライブラリのコードと祝日データに変更はありません。

### Changed

- README の先頭にロゴとバッジ（npm の版・CI・ライセンス・Node.js の対応版・依存ゼロ・型定義同梱）を追加
- CI・リリースのワークフローで Node.js・npm・pnpm・ランナーの版を固定（Node.js 22.23.3 / 24.21.0、npm 12.2.0、pnpm 12.11.2、ubuntu-24.04）。セットアップは共通のアクション（`.github/actions/setup-toolchain`）にまとめた
- リリースのワークフローで、同じ版がすでに npm にある場合は公開前に止めるようにした
- 開発用の依存（devDependencies）を版の完全一致で固定

## [0.1.0] - 2026-10-11

### Added

- `createCalendar()`: 祝日・定休日の曜日・毎年の休業日（年をまたぐ期間を含む）・臨時休業日・臨時営業日を組み合わせた営業日カレンダー
- 営業日の判定と計算: `isBusinessDay`・`dayInfo`（判定の理由付き）・`nextBusinessDay`・`previousBusinessDay`・`businessDayOnOrAfter`（締め時刻 `cutoff`）・`businessDayOnOrBefore`・`addBusinessDays`・`businessDaysBetween`・`listBusinessDays`
- 祝日の扱い `holidayPolicy`（`closed` / `open` / `ignore`）
- 日時の入力: `YYYY-MM-DD`・ISO 8601 日時（オフセット付きは瞬間）・`Date`・Temporal 互換オブジェクト。カレンダーのタイムゾーンで暦日に変換
- 祝日の提供元のインターフェース `HolidayProvider`（他の国・地域を追加できる）
- `bizdays-toolkit/jp`: 日本の祝日（1955〜2099 年）。国民の祝日・振替休日・国民の休日・皇室行事による休日

### Data

- 日本: 2026 年 2 月の官報（2027 年の春分・秋分の日）まで反映（`dataVersion: "2026-02"`、`confirmedThrough: 2027`）

[Unreleased]: https://github.com/inohan77/bizdays-toolkit/compare/v0.20.0...HEAD
[0.20.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.17.1...v0.18.0
[0.17.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.14.1...v0.15.0
[0.14.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/inohan77/bizdays-toolkit/releases/tag/v0.1.0
