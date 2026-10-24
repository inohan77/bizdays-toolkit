# リリースとバージョン番号

## バージョン番号の方針

[Semantic Versioning 2.0.0](https://semver.org/lang/ja/) に厳密に従います。npm の利用者は `^1.2.0` のような範囲で指定し、「メジャーが同じなら互換」という前提で自動的に更新されるためです。番号自体には日付やデータの版の意味を持たせず、「どの時点の法令・官報まで反映したか」は番号とは別の `dataVersion` で示します。

### 区分

| 区分     | 対象                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| メジャー | 関数・オプション・エクスポートの削除や改名、戻り値の形の変更、既定値の変更（既定のタイムゾーン・`holidayPolicy` など）、営業日判定の優先順位の変更、対応年の範囲の縮小、サポートする Node.js の打ち切り、コンパイルが通らなくなる型の変更         |
| マイナー | 機能の追加（国・地域の提供元、オプション、関数）、対応年の拡大                                                                                                                                                                                    |
| パッチ   | 公式データの反映（法改正・官報公表・布告による祝日の新設・移動・臨時の祝日、春分・秋分の日の確定、GOV.UK の新しい年の公表、シンガポールの新しい年の告示・日付の改定）、法令・公式データと食い違っていた計算の誤りの修正、ドキュメント、性能の改善 |

- **公式データの反映はパッチ**とします。API は変わらなくても出力は変わりますが、`^`・`~` のどちらの指定の利用者にも自動で届けるためです。0.x の期間は `^0.8.0` が 0.9.0 を受け取らないので、マイナーにすると、臨時の祝日がまさに必要な利用者に届きません（メジャーにすると、古い祝日のまま動き続ける利用者が出ます）。出力を固定したい利用者には、版の完全一致での固定を README で案内しています
- 公式データの反映と同時に API を足す場合は、マイナーにします（データの反映だけを急ぐ場合は、先にパッチで出します）
- **計算の誤りの修正はパッチ**とします。公式データに合わせる修正であり、正しい出力を前提にした利用者に影響がないためです
- 判断に迷う変更は、利用者のコードや結果が壊れうるかで決め、壊れうるならメジャーにします
- マイナー版の CHANGELOG には「移行」の小見出しを設け、利用者がする作業（改名・既定値の変更など）だけを書きます。作業がなければ「作業は要りません」と書きます。同じ内容を `docs/migration.md` にも足します（版を飛ばして移る利用者のため。decisions.md の 29 番）

### 互換性の約束

マイナー版・パッチ版では、次のことだけが起こりえます。利用者はこれを前提にコードを書けます。

- **出力の列挙に値が増える**: `DayReason`・`ScheduleReason`・`JapaneseHolidayKind`・`ErrorCode`・`DiagnosticCode` など、ライブラリが返す列挙の型は「開いた型」で、値が増えることがあります。値を列挙して分岐するときは「その他」の分岐も書いてください（網羅を型で確かめたい場合は `Known…` の型を使えますが、値が増えたときに型エラーになることを受け入れることになります）
- **返すオブジェクトに項目が増える**: `dayInfo()` の結果や祝日などに項目が足されることがあります
- **設定・引数に省略可能な項目が増える**: 既存の設定の意味は変わりません
- **例外・診断のメッセージの文言が変わる**: メッセージは API に含みません。判定には `isBizdaysError()` と `code`（診断では各結果の `code`）を使ってください
- **診断の結果が増える**: 規則の診断（`bizdays-toolkit/diagnose`）は、新しい種類の問題を見つけるようになることがあります。テストで `[]` と比べている場合、新しい版で警告が増えて失敗することがありますが、ライブラリの判定の結果は変わりません

次のことはメジャー版でしか行いません（0.x の期間はマイナー版で行うことがあります）。

- 公開している関数・型・設定の削除や改名、意味の変更
- 利用者が実装するインターフェース（`HolidayProvider`）への必須の項目の追加
- 既存の `code` の値の削除や意味の変更

削除する場合は、先に非推奨（`@deprecated`）にし、少なくとも 1 つのマイナー版のあいだ残します。

### 安定度の表示

公開しているものには TSDoc の `@public`（安定）か `@beta`（マイナー版で変わりうる）が付いています。新しい機能は `@beta` で出すことがあり、使い込んで API が固まったら `@public` にします。公開しているものの一覧と安定度は `etc/api.md` にあり、`pnpm check` が意図しない変化を検出します。

### 0.x の期間

1.0.0 までは SemVer の規定どおり、**マイナーで破壊的変更を行うことがあります**（`0.1.x` → `0.2.0`）。パッチは 0.x でも互換の修正のみです。実際のアプリに組み込んで API が固まったら 1.0.0 にします。1.0.0 以降は、破壊的変更はメジャーのみです。

### プレリリース

`1.1.0-rc.1` の形式とし、npm の dist-tag は `next` で公開します（`latest` には載せません）。

### dataVersion

国ごとの提供元が `dataVersion`（日本は反映済みの官報の年月、英国・シンガポールは反映済みの GOV.UK・data.gov.sg のデータの年月。例: `"2026-02"`）と `confirmedThrough`（公式に確定している最後の年）を公開します。データを更新したら CHANGELOG の **Data** 区分にも記載します。

## 毎年の作業（日本）

翌年の春分・秋分の日は、毎年 2 月 1 日ごろの官報で公表され、内閣府の CSV も更新されます。

1. `pnpm verify:cao` で照合する（新しい年の行が増えている）
2. 差分がなければ `pnpm verify:cao --write` でテスト用フィクスチャを更新する
3. `src/jp/rules.ts` の `CONFIRMED_THROUGH`（例: 2028）と `DATA_VERSION`（例: `"2027-02"`）を更新する
4. 春分・秋分の日が近似式と食い違っていた場合は、`rules.ts` に例外を追加する
5. CHANGELOG の **Data** に記載して、パッチ版として公開する

## README のサイズの値

README の minify + gzip のサイズは、手で測った値です（測った版を README に添えています）。マイナー版を出すときと、`src` を大きく変えたときに測り直します。測り方は、ルートのすべてと国の提供元（`jp`、英国の 4 つ、または `sg`）を読み込む入口を esbuild で bundle・minify して gzip で測ります。esbuild はリポジトリの依存にしないため、熟成ゲートを通る手元の環境で一時的に使います。

## 英国のデータの更新

英国の bank holidays は、布告による臨時の祝日が 10 日ほど前に発表されることがあり、日本のように時期が決まっていません。そのため、GitHub Actions（`.github/workflows/data-watch.yml`。0.17.0 で `govuk-watch.yml` から改名し、シンガポールの照合も同じ起動で行う）が毎日 GOV.UK と照合し、差分があればラベル `govuk-data` の issue を立てます（Actions の実行も失敗になります）。issue の本文には、`pnpm verify:govuk` の結果と、GOV.UK の公式リポジトリ（alphagov/frontend）の該当ファイルの最新のコミット（変更の理由の手がかり）が入ります。

| 差分の種類                       | 対応                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| New years published by GOV.UK    | 新しい年が載った。規則の計算と一致していれば、`CONFIRMED_THROUGH`・`DATA_VERSION` を上げる（急がない）   |
| Library does not match GOV.UK    | 臨時の祝日の追加・移動など。**その日より前に届くよう、すぐにパッチ版を出す**（利用者の熟成期間も考える） |
| Fixture differs from GOV.UK      | フィクスチャの更新が必要。上の 2 つと同じコミットで更新する                                              |
| Welsh names differ               | ウェールズ語の名称が変わった。`src/uk/index.ts` の名称を直す                                             |
| ERROR（The check itself failed） | 取得・解析の失敗（GOV.UK の形式の変更など）。監視が機能していないので、`scripts/verify-govuk.ts` を直す  |

1. `pnpm verify:govuk` で手元でも差分を確かめる
2. `src/uk/rules.ts` を直す（移動は `MOVED`、臨時の祝日は `SPECIAL_DAYS`、振替の割り当てだけが異なる場合は `RENAMED`）。`CONFIRMED_THROUGH`・`DATA_VERSION`（反映した GOV.UK のデータの年月）も更新する
3. `pnpm verify:govuk` が合格したら、`pnpm verify:govuk --write` でフィクスチャを更新する（GOV.UK から消えた古い年は残し、内容が変わった年だけ出典を書き換える）
4. 1 つのコミットにまとめ、CHANGELOG の **Data** に記載して、パッチ版として公開する
5. 公開したら issue を閉じる

差分があったときの経路（issue の作成・更新・コメント）を確かめるには、Actions の「Run workflow」で **simulate** に印を付けて実行します。GOV.UK と data.gov.sg のデータにそれぞれ架空の祝日を 1 件足して照合するので、ラベル `govuk-data-simulation`・`datagovsg-data-simulation`、題名に `[Simulation]` の付いた issue が 2 つ作られ、実行は失敗になります（想定どおり）。もう一度実行すると、内容が同じなので issue は更新されません。確かめたら issue を閉じてください。監視の仕組み（`scripts/verify-govuk.ts`・`scripts/verify-datagovsg.ts` やワークフロー）を変えたときにも行います。

## シンガポールのデータの更新

シンガポールの祝日は規則で計算できないので（旧正月・Hari Raya・Vesak Day・Deepavali）、MOM（Ministry of Manpower）が年ごとに告示する日付を `src/sg/rules.ts` の表で持ちます。翌年の祝日は 4〜7 月ごろに告示され、Hari Raya の日付はあとから改定されることがあります。同じワークフロー（`data-watch.yml`）が毎日 data.gov.sg のコレクション 691（MOM）と照合し、差分があればラベル `datagovsg-data` の issue を立てます。照合は data.gov.sg を使いますが、**正は MOM の告示（報道発表）**です。data.gov.sg の 2022 年分は改定後の告示と食い違っており（フィクスチャの `knownDifferences`。出典付き）、照合ではその差分だけを許します。

| 差分の種類                                            | 対応                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New years published on data.gov.sg                    | 新しい年が載った。MOM の報道発表で日付を確かめ、`MOVABLE`（動く祝日）・`SPECIAL_DAYS`（Polling Day など）に足し、`SUPPORTED_YEARS.to`・`CONFIRMED_THROUGH`・`DATA_VERSION` を上げる                                          |
| Library does not match data.gov.sg                    | 日付の改定など。MOM の報道発表で確かめ、告示どおりなら表を直してパッチ版を出す。data.gov.sg の側の誤りなら `knownDifferences` に出典付きで足す。既知の差分が消えた（data.gov.sg が直った）ときは `knownDifferences` から外す |
| Consolidated dataset differs from the yearly datasets | data.gov.sg の複数年のデータセットと年ごとのデータセットの不一致。data.gov.sg 側の問題なので、年ごとのデータセットを正として様子を見る                                                                                       |
| Fixture differs from data.gov.sg                      | フィクスチャの更新が必要。上と同じコミットで更新する                                                                                                                                                                         |
| ERROR（The check itself failed）                      | 取得・解析の失敗（API の形式の変更など）。監視が機能していないので、`scripts/verify-datagovsg.ts` を直す                                                                                                                     |

1. `pnpm verify:datagovsg` で手元でも差分を確かめる
2. MOM の報道発表（<https://www.mom.gov.sg/newsroom/press-releases>）で日付を確かめ、`src/sg/rules.ts` を直す（振替は規則で計算するので表に書かない）
3. `pnpm verify:datagovsg` が合格したら、`pnpm verify:datagovsg --write` でフィクスチャを更新する
4. 1 つのコミットにまとめ、CHANGELOG の **Data** に記載して、パッチ版として公開する
5. 公開したら issue を閉じる

### 監視の起動とハートビート

GitHub の schedule は高負荷時に遅れたり落ちたりし、このリポジトリでは追加してから一度も動きませんでした。そこで、監視は次の 3 つで支えます（decisions.md の 28 番）。

| 仕組み             | 役割                                                                           | 設定の場所                                                       |
| ------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| cron-job.org       | 主の起動。毎日 06:00（日本時間）に `workflow_dispatch` を API で呼ぶ           | cron-job.org のジョブ（下記）                                    |
| GitHub の schedule | 予備の起動。毎日 18:17（日本時間）                                             | `data-watch.yml` の `cron`                                       |
| healthchecks.io    | 監視が動いたことの確認。最後のステップで知らせ、知らせが途絶えたらメールが届く | healthchecks.io のチェックと、Secrets の `HEALTHCHECKS_PING_URL` |

ハートビートは、照合まで動いたとき（一致・差分あり）は成功を、照合そのものが失敗したとき（取得の失敗など）やそれより前で止まったときは `/fail` を知らせます。差分は、これまでどおり GitHub の失敗の通知と issue で知らせます。

**cron-job.org のジョブ**

- URL: `https://api.github.com/repos/inohan77/bizdays-toolkit/actions/workflows/data-watch.yml/dispatches`（POST。0.17.0 で `govuk-watch.yml` から改名したので、cron-job.org の URL も直す）
- ヘッダー: `Accept: application/vnd.github+json`、`Authorization: Bearer <トークン>`、`Content-Type: application/json`、`X-GitHub-Api-Version: 2026-03-10`（REST API の版。指定しないと 2022-11-28 版になり、その版は 2028 年 3 月 10 日に提供が終わる。出典: https://docs.github.com/en/rest/about-the-rest-api/api-versions の Supported API versions）
- 本文: `{"ref":"main"}`
- 時刻: 毎日 06:00（タイムゾーン Asia/Tokyo）。失敗したときのメール通知を有効にする
- トークン: Fine-grained のトークンを、このリポジトリだけ・**Actions の Read and write だけ**で作る（Contents は不要）。このトークンで起動できるのは `workflow_dispatch` のある data-watch だけで、コードの変更や npm への公開はできない。期限を設け（1 年など）、切れる前に作り直して cron-job.org のヘッダーを差し替える（切れると呼び出しが 401 で失敗し、cron-job.org の失敗の通知と、healthchecks.io の知らせの途絶の両方で分かる）

**healthchecks.io のチェック**

- 種類は Simple、Period は 1 day、Grace は 6 hours（最後の知らせから 30 時間来なければメールが届く）
- チェックの Ping URL を、リポジトリの Secrets に `HEALTHCHECKS_PING_URL` として登録する（URL を知っていれば誰でも知らせを送れるため、公開しない）

監視の仕組みを変えたときや、トークンを作り直したときは、cron-job.org の Test Run で data-watch が起動し、healthchecks.io に知らせが届くことを確かめてください。2026-03-10 版では、成功すると `200` と起動した実行の ID（`workflow_run_id`）が返ります（2022-11-28 版では本文のない `204`）。応答のヘッダーに `Deprecation`・`Sunset` があれば、指定している API の版の提供の終わりが決まっているので、トークンを作り直すときなどに、GitHub の API の版のページで新しい版を確かめて `X-GitHub-Api-Version` を更新します。

監視のワークフローは、リポジトリに 60 日間動きがないと GitHub が定期実行を止めるのを防ぐため、実行のたびに自分を有効化し直します（予備の schedule のため）。

## 品質の確認

`pnpm check` は、次をすべて行います（CI も同じ）。

| 確認                           | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 型チェック                     | `tsc`。strict に加えて、未使用の変数・引数、戻り値の漏れ、省略可能な項目への `undefined` の代入も検出する。型のテスト（`test/types.check.ts`）も含む                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| lint                           | `oxlint`（`.oxlintrc.json`）。正しさの分類の規則に加え、`eqeqeq`・`no-explicit-any`・`src` での `console` の禁止などを有効にしている。警告も失敗として扱う                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| テスト                         | `node --test`。性質のテスト（`test/properties.test.ts`、種を固定した乱数）も含む                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| タイムゾーンを変えたテスト     | 環境変数 `TZ` を UTC・Asia/Tokyo・America/Los_Angeles・Pacific/Chatham に変えて、テストをすべて実行する                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ビルドと整形                   | `tsc -p tsconfig.build.json`、`oxfmt --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| パッケージの中身               | 公開するファイル（実際の `npm pack --dry-run` の結果）・exports・依存ゼロ。CHANGELOG の版の節（並び・日付）と末尾のリンク定義がそろっていること。英語と日本語のドキュメントの対（README・`docs/guide`・`docs/providers`）の見出しの数とコードブロックの数がそろい、見出しへのリンクが実在すること                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| サイズの上限                   | エントリーごとの gzip のサイズを `size-limits.json` の上限と比べる。上限を上げる（エントリーを足す）ときは、CHANGELOG の「開発」に「サイズの上限」という言葉を含めて理由を書く。前の版のタグの上限より上がっているのに記載がなければ失敗する（CI とリリースのワークフローは履歴とタグを取得して確かめる。手元でタグがなければ、この確認だけ飛ばすので `git fetch --tags` しておく）                                                                                                                                                                                                                                                                                                                                                                          |
| 利用者の型チェック             | `scripts/check-consumer-types.ts` で、公開する型定義を利用者のプロジェクト（`test/consumer/consumer.mts`）として `moduleResolution` の `node16`・`nodenext`・`bundler` で型チェックし、わざと型エラーを含む `consumer-error.mts` が失敗として報告されることも確かめる。`pnpm check` は開発用の TypeScript（6.0）で、CI の `consumer-types` ジョブは 5.0.4・5.5.4・5.8.3・7.0.2 で実行する（decisions.md の 38 番）。CI の版は依存にせず、版と SHA-256 を `ci.yml` に固定して tgz から一時的に入れる。版を上げるときは、各系列（約束する下限・`bundler` が安定した 5.5・5 系の最終・ネイティブ版）の最終パッチを、公開から 48 時間を過ぎたものから選び、`npm pack` した tgz の SHA-256（7.0 以降は `@typescript/typescript-linux-x64` の tgz も）を書き換える |
| 公開物の互換性                 | `test/compat` の ESM（`import`）と CommonJS（`require()`）の確認を、`pnpm check` では手元・CI の版で、CI の `compat` ジョブでは engines の下限（22.12.0）と 26 系で、ビルド済みの `dist` に対して実行する                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Node.js の警告                 | 自前のスクリプトとテストで、Node.js の警告（非推奨の API・実験的な機能など）が出たら失敗にする（`scripts/strict-warnings.ts`）。`test/compat` は対象外                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ブラウザー・Workers・Bun・Deno | CI のみ。`browsers` ジョブ（Chrome・Firefox・Edge）・`safari` ジョブ（macOS）・`workerd` ジョブ・`bun` ジョブ・`deno` ジョブで、ビルド済みの `dist` に `test/compat/smoke.mjs` を実行する。`pnpm check` は、`src` が Node.js 固有の機能を使っていないことを確かめる                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ドキュメントのコード例         | README と `docs/guide`・`docs/providers`（英語・日本語）の ts のコード例を実行し、コメントに書いた結果と比べる（`scripts/check-readme-examples.ts`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ワークフローの検査             | CI のみ（`ci.yml` の `workflows` ジョブ）。`actionlint` で `.github/workflows` の構文・式・コンテキストの使い方と、`run:` のシェルスクリプト（ランナーの `shellcheck`）を検査する。`pnpm check` には含まない（ワークフローの誤りは GitHub に読み込まれるまで分からないため、CI で止める）                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 性能の退行                     | CI のみ（`ci.yml` の `bench` ジョブ）。公開済みの前の版（npm の `latest`）と今回の `dist` を同じランナー・同じ Node.js で `scripts/bench.ts` にかけ、`scripts/bench-compare.ts` で比率を比べる。どれかの計測が 2 倍より遅ければ失敗（ランナーの性能は実行ごとにぶれるので、絶対値では判定しない）。絶対値は Job Summary に残り、リリースごとの傾向を追える。`pnpm check` には含まない                                                                                                                                                                                                                                                                                                                                                                        |
| API のスナップショット         | 公開している名前と型を `etc/api.md` と比べる。意図した変更なら `pnpm api:update` で更新してコミットする                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 開発環境の版

Node.js・npm・pnpm は、手元の開発環境と CI で同じ版を使います。CI の版は次の 2 か所で管理しています。

- `.github/actions/setup-toolchain/action.yml`: npm と pnpm の版
- `.github/workflows/ci.yml`・`release.yml`・`data-watch.yml`: Node.js の版とランナー（`ubuntu-24.04`）
- `.github/workflows/ci.yml` の `compat` ジョブ: 公開物を確かめる Node.js の版（engines の下限と、LTS の系列・LTS 入りを控えた系列のうち `check` で使わないもの。decisions.md の 23 番）
- `.github/workflows/ci.yml` の `workerd` ジョブ: workerd の版と SHA-256（公式のリリースの `workerd-linux-64.gz` を取得して計算する。熟成ゲートを過ぎた版を指定する）。`safari` ジョブの macOS のランナーの版（`macos-15`）
- `.github/workflows/ci.yml` の `bun`・`deno` ジョブ: Bun の版と SHA-256（公式のリリースの `SHASUMS256.txt` の `bun-linux-x64.zip` の行）、Deno の版と SHA-256（公式のリリースの `deno-x86_64-unknown-linux-gnu.zip.sha256sum`）。どちらも熟成ゲートを過ぎた版を指定する
- `.github/workflows/ci.yml` の `workflows` ジョブ: actionlint の版と SHA-256（公式のリリースの `actionlint_<版>_checksums.txt` の `linux_amd64` の行）

`pnpm check` は最初に `scripts/check-toolchain.ts` で、ワークフローどうしの Node.js の版がそろっていること、compat の行列に engines の下限が入っていること、実行している Node.js・npm・pnpm が固定版と同じことを確かめます（固定版との違いは、CI ではエラー、手元では注意の表示）。

npm 12 の動作要件は Node.js `^22.22.2 || ^24.15.0` です。版を上げるときは、公開から 48 時間を過ぎた版を指定し、手元の環境もそろえてください。開発用の依存（devDependencies）は版の完全一致で指定し、更新時は `pnpm install` で `pnpm-lock.yaml` も更新してコミットします。

## 公開の手順

公開は staged publishing で行います。GitHub Actions（`.github/workflows/release.yml`）は版を npm に**ステージ**するだけで、メンテナーが 2FA 付きで**承認**するまで利用者には届きません。GitHub のアカウントやワークフローが乗っ取られても、承認なしに公開されることはありません。手元の端末から `npm publish` はしません（provenance を付けるため）。

1. `package.json` の `version` を更新する
2. `CHANGELOG.md` の `[Unreleased]` を新しい版の節に移し、末尾のリンク定義（`[Unreleased]` の比較元と新しい版の行）を更新する（`pnpm check` は、現在の版の節やリンク定義が合わないと失敗します）。見出しの日付は、タグをプッシュする日（日本時間）にする。リリースのワークフローが、タグを付けたコミットの日から実行した日までの範囲にあるかを確かめ、範囲の外ならステージする前に止まる
3. `pnpm check` が通ることを確かめてコミットし、main をプッシュして CI の合格を確認する
4. `v<version>` のタグを付けてプッシュする（例: `git tag v0.1.2 && git push origin v0.1.2`）
5. ワークフローが、タグと `package.json` の版の一致と、同じ版が npm にまだないことを確かめ、`pnpm check` のあと npm にステージし、CHANGELOG の節を本文にした GitHub Release を**下書き**で作ります。ワークフローの実行結果の Summary に、承認の手順が表示されます
6. npm のパッケージページの **Staged Packages** タブで、ステージされた版の中身（ファイル一覧・provenance）を確認し、**Approve** する（2FA を求められます）。CLI では `npm stage list bizdays-toolkit` で stage ID を調べ、`npm stage approve <stage-id>` でも承認できます
7. `npm view bizdays-toolkit dist-tags` で新しい版になったことを確かめてから、GitHub Release の下書きを公開する（`gh release edit v<version> --draft=false`）

ステージした内容に問題があった場合は、承認せずに Staged Packages タブ（または `npm stage reject <stage-id>`）で却下し、修正した新しい版で出し直します。ステージした版の番号は公開済みの版と同じ扱いになり、同じ番号でステージし直すには先に却下が必要です。

### npm 側の設定

- **Trusted Publishing**: npm のパッケージ設定でこのリポジトリとワークフロー（`release.yml`）を登録しています。npm のアクセストークンは GitHub に保存しません。許可する操作は `npm stage publish` だけにし、「Allow npm publish」と「Allow npm dist-tag」は無効にします
- **Publishing access**: 「Require two-factor authentication and disallow tokens」にします
- staged publishing には npm CLI 11.15.0 以上が必要です。CI では `.github/actions/setup-toolchain` で固定した npm（12.2.0）を使います

### 利用者に届く時刻

ステージした版は、承認するまでインストールできません。npm 上の公開時刻（`npm view bizdays-toolkit time`）は、ステージした時刻ではなく承認した時刻になります（0.1.2 で確認: ステージ 2026-10-12T08:02:23Z、承認による公開時刻 08:05:51Z）。熟成期間（公開から一定時間待ってから取り込む運用）を設けている利用者にとっては、承認した時刻から数え始めることになります。
