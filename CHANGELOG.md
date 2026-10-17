# Changelog

この形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、版の付け方は [Semantic Versioning](https://semver.org/lang/ja/) と [RELEASING.md](./RELEASING.md) の方針に従います。区分には Keep a Changelog の Added / Changed / Deprecated / Removed / Fixed / Security に加えて、祝日データの更新を表す **Data** を使います。

## [Unreleased]

### 開発

- GOV.UK の監視を、外部の cron サービス（cron-job.org）から `workflow_dispatch` で起動する形にした（毎日 06:00 日本時間）。GitHub の schedule は予備として 18:17（日本時間）に移した。GitHub の schedule は高負荷時に遅れたり落ちたりし、追加してから一度も動かなかったため。動いたことは最後に healthchecks.io へ知らせ（Secrets の `HEALTHCHECKS_PING_URL`。照合そのものが失敗したときは `/fail`）、知らせが途絶えたらメールが届くようにした（RELEASING.md の「監視の起動とハートビート」）

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

[Unreleased]: https://github.com/inohan77/bizdays-toolkit/compare/v0.8.1...HEAD
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
