# リリースとバージョン番号

この文書には、版の付け方・互換性の約束・手順・検査の一覧（規則）を書きます。理由と退けた案は [docs/decisions.md](./docs/decisions.md) に書き、同じことを 2 か所に書きません（decisions.md の 36 番）。

## バージョン番号の方針

[Semantic Versioning 2.0.0](https://semver.org/lang/ja/) に厳密に従います。npm の利用者は `^1.2.0` のような範囲で指定し、「メジャーが同じなら互換」という前提で自動的に更新されるためです。番号自体には日付やデータの版の意味を持たせず、「どの時点の法令・官報まで反映したか」は番号とは別の `dataVersion` で示します。

### 区分

| 区分     | 対象                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| メジャー | 関数・オプション・エクスポートの削除や改名、戻り値の形の変更、既定値の変更（既定のタイムゾーン・`holidayPolicy` など）、営業日判定の優先順位の変更、対応年の範囲の縮小、サポートする Node.js の打ち切り、コンパイルが通らなくなる型の変更                                                                                                                                                                                                                          |
| マイナー | 機能の追加（国・地域の提供元、オプション、関数）、規則で計算する提供元（日本・英国・フランス）の対応年の拡大（過去への拡大を含む）、約束していなかった挙動の変更、新たに例外を投げるようにする変更（1.0.0 以降はメジャー）、非推奨にすること、誤った祝日の `key` の修正（decisions.md の 25 番）                                                                                                                                                                   |
| パッチ   | 公式データの反映（法改正・官報公表・布告による祝日の新設・移動・臨時の祝日、春分・秋分の日の確定、GOV.UK の新しい年の公表、シンガポールの新しい年の告示・日付の改定。年ごとの表で持つ提供元に告示済みの新しい年を足すことも、対応年の終わりが延びるがここに含める）、文書・決定・型の説明で約束した挙動から外れていた不具合の修正（入った版を問わない。法令・公式データと食い違っていた計算の誤りを含む。decisions.md の 32 番）、ドキュメント、性能・サイズの改善 |

- **公式データの反映はパッチ**とします。出力を固定したい利用者には、版の完全一致での固定を README で案内しています（理由は decisions.md の 32 番）
- 公式データの反映と同時に API を足す場合は、マイナーにします（データの反映だけを急ぐ場合は、先にパッチで出します）
- **年ごとの表で持つ提供元（シンガポール）に新しい年を足すのはパッチ**です。マイナーに置く「対応年の拡大」は、規則で計算する提供元（日本・英国・フランス）が計算の範囲そのものを広げる場合です（理由は decisions.md の 32 番）
- **不具合の修正はパッチ**とします。文書・決定・型の説明で約束した挙動から外れていたものを約束どおりに戻す修正で、その不具合がどの版で入ったかを問いません（法令・公式データと食い違っていた計算の誤りも含む）。CHANGELOG の Fixed に、どの約束から外れていたかを書き、古い結果に頼った利用者がいそうなら影響も書きます。約束していなかった挙動を変える修正と、例外を新たに投げるようにする修正はマイナー版です（例外を新たに投げる修正は、1.0.0 以降はメジャー版）。公開から複数のマイナー版を経た挙動が文書と違うときは、パッチで直す前に、文書を挙動に合わせるか、挙動の変更としてマイナー版で扱うかを決めます（理由は decisions.md の 32 番）
- **誤った祝日の `key` の修正はマイナー**とします。旧い `key` を `keys` で受け付ける期間を置き（診断の `deprecated-option` で知らせる）、移行ガイドに書きます。その仕組みと前の版との祝日データの比較（`data-compare`）での扱いは、実際に必要になった版で作ります（理由は decisions.md の 25 番）
- 判断に迷う変更は、利用者のコードや結果が壊れうるかで決め、壊れうるならメジャーにします
- マイナー版の CHANGELOG には「移行」の小見出しを設け、利用者がする作業（改名・既定値の変更など）だけを書きます。作業がなければ「作業は要りません」と書きます。同じ内容を `docs/migration.md` にも足します（decisions.md の 38 番）

### 互換性の約束

マイナー版・パッチ版では、次のことだけが起こりえます。利用者はこれを前提にコードを書けます。（理由は decisions.md の 33 番）

- **出力の列挙に値が増える**: ライブラリが返す列挙の型（`Known…` の型がある開いた型。理由・祝日の種別・エラーコード・診断コードなど）は、値が増えることがあります。値を列挙して分岐するときは「その他」の分岐も書いてください（網羅を型で確かめたい場合は `Known…` の型を使えますが、値が増えたときに型エラーになることを受け入れることになります）
- **返すオブジェクトに項目が増える**: ライブラリが返すオブジェクト（`dayInfoOn` の結果や祝日など）に項目が足されることがあります
- **設定・引数に省略可能な項目が増える**: 既存の設定の意味は変わりません
- **例外・診断のメッセージの文言が変わる**: メッセージは API に含みません。判定には `isBizdaysError()` と `code`（診断では各結果の `code`）を使ってください
- **診断の結果が増える**: 規則の診断（`bizdays-toolkit/diagnose`）は、新しい種類の問題を見つけるようになることがあります。テストで `[]` と比べている場合、新しい版で警告が増えて失敗することがありますが、ライブラリの判定の結果は変わりません。前の版が返した結果は新しい版でも返します（CI の `result-compare` ジョブで確かめる）。ただし、誤った診断を直したときは消えることがあり、CHANGELOG の Fixed に書きます
- **不具合の修正と公式データの反映で結果が変わる**: 判定の結果が変わるのは、この 2 つだけです（上の「区分」。decisions.md の 33 番）

次のことはメジャー版でしか行いません（0.x の期間はマイナー版で行うことがあります）。

- 公開している関数・型・設定の削除や改名、意味の変更
- 利用者が実装するインターフェース（`HolidayProvider`）への必須の項目の追加
- 既存の `code` の値の削除や意味の変更

削除する場合は、先に非推奨（`@deprecated`）にし、少なくとも 1 つのマイナー版のあいだ残します。

### 安定度の表示

公開しているものには TSDoc の `@public`（安定）か `@beta`（マイナー版で変わりうる）が付いています。新しい機能は `@beta` で出すことがあり、使い込んで API が固まったら `@public` にします。公開しているものの一覧と安定度は `etc/api.md` にあり、`pnpm check` が意図しない変化を検出します。

### 0.x の期間

1.0.0 までは SemVer の規定どおり、**マイナーで破壊的変更を行うことがあります**（`0.1.x` → `0.2.0`）。パッチは 0.x でも互換の修正のみです。実際のアプリに組み込んで API が固まったら 1.0.0 にします。1.0.0 以降は、破壊的変更はメジャーのみです。

0.22.2 の次は 0.30.0 です。公開する名前を規則に合わせて改めた版を区切るため番号を飛ばしました（0.23.0〜0.29.0 は欠番。decisions.md の 9 番）。SemVer は番号を飛ばすことを禁じておらず、npm でも普通のマイナー版の更新です。

### プレリリース

`1.1.0-rc.1` の形式とし、npm の dist-tag は `next` で公開します（`latest` には載せません）。

### dataVersion

国ごとの提供元が `dataVersion`（日本は反映済みの官報の年月、英国・フランス・シンガポールは反映済みの GOV.UK・data.gouv.fr・data.gov.sg のデータの年月。例: `"2026-02"`）と `confirmedThrough`（公式に確定している最後の年）を公開します。データを更新したら CHANGELOG の **Data** 区分にも記載します。

## 日本のデータの更新

翌年の春分・秋分の日は、毎年 2 月 1 日ごろの官報で公表され、内閣府の CSV も更新されます。同じワークフロー（`data-watch.yml`）が毎日内閣府の CSV（<https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>）と照合し、差分があればラベル `cao-data` の issue を立てます（0.18.0 で追加。それまでは 2 月に手で `pnpm verify:cao` を実行していました）。

| 差分の種類                                    | 対応                                                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New years published in the Cabinet Office CSV | 翌年の春分・秋分の日が公表された。下の毎年の作業の引き金                                                                                                       |
| Library does not match the Cabinet Office CSV | 法改正による祝日の新設・移動（特別法による移動を含む）、春分・秋分の日が近似式と食い違った。`src/jp/rules.ts` を直し、**その日より前に届くようパッチ版を出す** |
| Fixture differs from the Cabinet Office CSV   | フィクスチャの更新が必要。上と同じコミットで更新する                                                                                                           |
| ERROR（The check itself failed）              | 取得・解析の失敗（CSV の形式・文字コードの変更など）。監視が機能していないので、`scripts/verify-cao.ts` を直す                                                 |

毎年の作業（New years published が来たら）:

1. `pnpm verify:cao` で照合する（新しい年の行が増えている）
2. 差分がなければ `pnpm verify:cao --write` でテスト用フィクスチャを更新する
3. `src/jp/rules.ts` の `CONFIRMED_THROUGH`（例: 2028）と `DATA_VERSION`（例: `"2027-02"`）を更新する
4. 春分・秋分の日が近似式と食い違っていた場合は、`rules.ts` に例外を追加する
5. CHANGELOG の **Data** に記載して、パッチ版として公開する

## 英国のデータの更新

1974〜2011 年（GOV.UK のデータがない年）は、The Gazette の布告と当時の政府の公表一覧から作ったフィクスチャ（`test/fixtures/uk-1974-1999-proclamations.json`・`test/fixtures/uk-2000-2011-government-lists.json`。出典は `docs/sources/uk-bank-holidays-1974-1999.md`・`docs/sources/uk-bank-holidays-2000-2011.md`）で検証していて、出典が過去の記録なので監視の対象ではありません。出典の読み違いが見つかったときだけ、フィクスチャと `src/uk/rules.ts` の表（`RENAMED`・`SPECIAL_DAYS`・`MOVED`）を直してパッチ版を出します（decisions.md の 28 番）。

英国の bank holidays は、布告による臨時の祝日が 10 日ほど前に発表されることがあり、日本のように時期が決まっていません。そのため、GitHub Actions（`.github/workflows/data-watch.yml`。0.17.0 で `govuk-watch.yml` から改名し、シンガポール（0.17.0）・日本（0.18.0）・フランス（0.20.0）の照合も同じ起動で行う）が毎日 GOV.UK と照合し、差分があればラベル `govuk-data` の issue を立てます（Actions の実行も失敗になります）。issue の本文には、`pnpm verify:govuk` の結果と、GOV.UK の公式リポジトリ（alphagov/frontend）の該当ファイルの最新のコミット（変更の理由の手がかり）が入ります。

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

差分があったときの経路（issue の作成・更新・コメント）を確かめるには、Actions の「Run workflow」で **simulate** に印を付けて実行します。GOV.UK・data.gov.sg・内閣府・data.gouv.fr のデータにそれぞれ架空の祝日を 1 件足して照合するので、ラベル `govuk-data-simulation`・`datagovsg-data-simulation`・`cao-data-simulation`・`datagouv-data-simulation`、題名に `[Simulation]` の付いた issue が 4 つ作られ、実行は失敗になります（想定どおり）。もう一度実行すると、内容が同じなので issue は更新されません。確かめたら issue を閉じてください。監視の仕組み（`scripts/verify-govuk.ts`・`scripts/verify-datagovsg.ts`・`scripts/verify-cao.ts`・`scripts/verify-datagouv.ts` やワークフロー）を変えたときにも行います。

## フランスのデータの更新

フランスの祝日は労働法典 L3133-1（Alsace-Moselle は地方法）で定まり、固定日と復活祭からの日数で計算できるので、英国と同じく規則で計算します（`src/fr/rules.ts`）。年ごとの告示はなく、変わるのは法改正のときだけです（2025 年 7 月には政府が Lundi de Pâques と 8 mai を祝日から外す案を示し、実現しませんでした）。同じワークフロー（`data-watch.yml`）が毎日 data.gouv.fr「Jours fériés en France」（DINUM）の JSON（<https://etalab.github.io/jours-feries-france-data/json/metropole.json> と `alsace-moselle.json`。data.gouv.fr が「安定した URL」として案内する公式のエクスポートで、Licence Ouverte 2.0）と照合し、差分があればラベル `datagouv-data` の issue を立てます。JSON は過去 20 年・未来 5 年の窓で公開され、毎年 1 月に 1 年ずつ動きます。

| 差分の種類                          | 対応                                                                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library does not match data.gouv.fr | 法改正による祝日の新設・廃止・移動（または data.gouv.fr の生成の変更）。Légifrance で労働法典 L3133-1 を確かめ、法改正なら `src/fr/rules.ts` を直して**施行日より前に届くようパッチ版を出す**                        |
| Fixture differs from data.gouv.fr   | 毎年 1 月に窓が動いたとき（古い年が消え、新しい年が増える）は想定どおり。`pnpm verify:datagouv --write` でフィクスチャを更新してコミットする（公開するものは変わらないので版は要らない）。上と同時なら同じコミットで |
| ERROR（The check itself failed）    | 取得・解析の失敗（URL・形式の変更など）。監視が機能していないので、`scripts/verify-datagouv.ts` を直す                                                                                                               |

1. `pnpm verify:datagouv` で手元でも差分を確かめる
2. 法改正なら Légifrance（<https://www.legifrance.gouv.fr/>）の労働法典で確かめ、`src/fr/rules.ts` を直す
3. `pnpm verify:datagouv` が合格したら、`pnpm verify:datagouv --write` でフィクスチャを更新する
4. 法改正の反映は 1 つのコミットにまとめ、CHANGELOG の **Data** に記載して、パッチ版として公開する。窓の移動だけならフィクスチャの更新をコミットして issue を閉じる
5. 公開したら issue を閉じる

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

GitHub の schedule は高負荷時に遅れたり落ちたりし、このリポジトリでは追加してから一度も動きませんでした。そこで、監視は次の 3 つで支えます（decisions.md の 29 番）。

| 仕組み             | 役割                                                                           | 設定の場所                                                       |
| ------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| cron-job.org       | 主の起動。毎日 06:00（日本時間）に `workflow_dispatch` を API で呼ぶ           | cron-job.org のジョブ（下記）                                    |
| GitHub の schedule | 予備の起動。毎日 18:17（日本時間）                                             | `data-watch.yml` の `cron`                                       |
| healthchecks.io    | 監視が動いたことの確認。最後のステップで知らせ、知らせが途絶えたらメールが届く | healthchecks.io のチェックと、Secrets の `HEALTHCHECKS_PING_URL` |

ハートビートは、すべての照合まで動いたとき（一致・差分あり）は成功を、どれかの照合そのものが失敗したとき（取得の失敗など）やそれより前で止まったときは `/fail` を知らせます。差分は、これまでどおり GitHub の失敗の通知と issue で知らせます。

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

## README のサイズの値

README の minify + gzip のサイズは、手で測った値です（測った版を README に添えています）。マイナー版を出すときと、`src` を大きく変えたときに測り直します。`pnpm check` は、README（英日）に書いた「測った版」が今のマイナー系列であることを確かめます（マイナー版を出すときの測り直し忘れを止める。decisions.md の 39 番）。

測り方は `scripts/measure-bundle.ts` に固定しています。ルートのすべてと、国の提供元（サブパスごとに、その提供元の export だけ）を読み込む入口を esbuild で bundle・minify し、gzip（レベル 9）で測ります。1 KB は 1,000 バイトで、小数第 1 位に丸めます。esbuild はリポジトリの依存にしないため（decisions.md の 34 番）、熟成ゲートを過ぎた版を一時的なディレクトリに入れて使います（例: `npm install --prefix <一時ディレクトリ> esbuild@0.28.2` のあと、`pnpm build` して `node scripts/measure-bundle.ts --esbuild <一時ディレクトリ>/node_modules/esbuild`）。出力の表の「README の値」を README（英日）に写し、「測った版」も改めます。

## 品質の確認

納品（ZIP）の手順は「すべての編集 → `pnpm fmt` → `pnpm check` → check の出力から CHANGELOG の測定値を転記 → ZIP」の順に固定し、`pnpm check` の後に何かを変えたら check からやり直す。`pnpm check` は、CHANGELOG の今の版の「測定 N」が実測と一致すること、`docs/sources/*.md` が README（英日）からリンクされていること、フィクスチャの `record` が実在することも確かめる（decisions.md の 36 番）。ドキュメントの数値・一覧（対応年など）も `dist` と照合し（下の表の「ドキュメントの数値」。39 番）、コメントと文書に書いたファイルのパスと決定の番号が実在すること、決定の文書の目次が見出しと一致することも確かめる（36 番）。コメントには、その場所でしか分からないこと（その行の理由・使い方）と、詳しい説明の場所（決定の番号）を書き、設計の理由の説明・版の経緯・利用元の一覧・国の数や件数のような機能を足すと変わる事実は書かない。国や機能を足す版では、既存のコメント・文書の国名や件数の記述を `git grep` で探して読み直す（36 番）。名前を置換した版では、置換した後の名前が英文・和文の中に現れる行を `git grep` で洗い、コードでない文脈（英語の普通名詞など）まで置換していないかを読む。旧名の値（`"national"` など）と、和文の中の旧名の語（`recurring` など）は `check-names` が見ないので、同じく `git grep` で読む（36 番）。名前を置換した版では、`docs/decisions.md` の本文も新しい名前に書き換える（決定の文書は今の決定を書くもので、追記を重ねない。`check-names` の対象外なので人が読む。36 番）。返す値（祝日の種別など）を改めた版では、その値を設定に書いた利用者の結果が変わらないかを考え、変わるなら移行ガイドで知らせる（10 番）。

黙って外れる検査・黙って合格になる確認は作りません。照合が 0 件・対象が見つからない・環境に機能がなくて飛ばしたときは、合格にせず知らせるかログに出し、わざと失敗する入力で検査が働くことも確かめます（decisions.md の 36 番）。

`pnpm check` は、次をすべて行います（CI も同じ）。

| 確認                           | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 型チェック                     | `tsc`。strict に加えて、未使用の変数・引数、戻り値の漏れ、省略可能な項目への `undefined` の代入も検出する。型のテスト（`test/types.check.ts`）も含む                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| lint                           | `oxlint`（`.oxlintrc.json`）。正しさの分類の規則に加え、`eqeqeq`・`no-explicit-any`・`src` での `console` の禁止などを有効にしている。警告も失敗として扱う                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| テスト                         | `node --test`。性質のテスト（`test/properties.test.ts`、種を固定した乱数）も含む                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| タイムゾーンを変えたテスト     | 環境変数 `TZ` を UTC・Asia/Tokyo・America/Los_Angeles・Pacific/Chatham に変えて、テストをすべて実行する                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ビルドと整形                   | `tsc -p tsconfig.build.json` を 2 段で実行し、`.js` はコメントを除き（`--removeComments`）、`.d.ts` は TSDoc を残す（decisions.md の 36 番）。`oxfmt --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| パッケージの中身               | 公開するファイル（実際の `npm pack --dry-run` の結果）・exports・依存ゼロ。CHANGELOG の版の節（並び・日付）と末尾のリンク定義がそろっていること。英語と日本語のドキュメントの対（README・`docs/guide`・`docs/providers`）の見出しの数とコードブロックの数がそろい、見出しへのリンクが実在すること                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| サイズの上限                   | エントリーごとの gzip のサイズを `size-limits.json` の上限と比べる。上限を上げる（エントリーを足す）ときは、CHANGELOG の「開発」に「サイズの上限」という言葉を含めて理由を書く。前の版のタグの上限より上がっているのに記載がなければ失敗する。上限を変えた版は CHANGELOG に測定値を「（測定 N）」の形で書き、照合できた測定値が 1 つもなければ失敗する（CI とリリースのワークフローは履歴とタグを取得して確かめる。手元でタグがなければ、この確認だけ飛ばすので `git fetch --tags` しておく）                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 名前の規則                     | `scripts/check-names.ts` で、公開する名前（export・型の項目とメソッド・引数・型引数・文字列の値）をビルド済みの型定義から集め、`etc/naming.md` の規則 N1〜N9（用語集・外部の名前の出典）と `docs/migration.md` の削除予定の表に照らす。名前を許す一覧は持たない。形を分けるための `?: never` の項目に TSDoc が付いていないこと（C13）と、今の状態を書いた文書・スクリプト・型定義の TSDoc に 0.30.0 の旧名（設定のキー・関数・メソッド・型・返す項目・引数）が残っていないこと（C14）も確かめる。名前が約束する意味（区間・符号・含むか）は `test/naming.test.ts` の性質のテストで確かめる（decisions.md の 9 番）                                                                                                                                                                                                                                                                                                                                  |
| ドキュメントの数値             | `scripts/check-package.ts` で、README（英日）の提供元の表の対応年とタイムゾーン、ガイド（英日）の国の節の対応年（「Supported years are …」「対応年は …」）・`confirmedThrough`、国名を伴う対応年（「Outside the supported years」の節など）、祝日の識別子の表の key、エラーコードの一覧と診断の表のコードを、ビルド済みの `dist` とソースの型（`KnownErrorCode`・`KnownDiagnosticCode`）と照合する。README の「測った版」が今のマイナー系列であることと、英日の対の文書で節ごとの数値（32 以上の整数と小数点を含む数）がそろうことも確かめる（decisions.md の 39 番）。国を足したら、スクリプトの `COUNTRY_NAMES` に国名を足す。あわせて、今の状態を書いたファイルのファイルのパスと、すべての文書の「decisions.md の N 番」が実在することを確かめる（対象のファイルは `checkReferences` のとおり。履歴の CHANGELOG・decisions.md・migration.md はパスを見ない。CHANGELOG の 0.30.2 までの節の番号は、決定の文書の旧番号の対応表で確かめる。36 番） |
| 利用者の型チェック             | `scripts/check-consumer-types.ts` で、公開する型定義を利用者のプロジェクト（`test/consumer/consumer.mts`）として `moduleResolution` の `node16`・`nodenext`・`bundler` で型チェックし、わざと型エラーを含む `consumer-error.mts` が失敗として報告されることも確かめる。`pnpm check` は開発用の TypeScript（6.0）で、CI の `consumer-types` ジョブは 5.0.4・5.5.4・5.8.3・7.0.2 で実行する（decisions.md の 35 番）。CI の版は依存にせず、版と SHA-256 を `ci.yml` に固定して tgz から一時的に入れる。版を上げるときは、各系列（約束する下限・`bundler` が安定した 5.5・5 系の最終・ネイティブ版）の最終パッチを、公開から 48 時間を過ぎたものから選び、`npm pack` した tgz の SHA-256（7.0 以降は `@typescript/typescript-linux-x64` の tgz も）を書き換える                                                                                                                                                                                        |
| 公開物の互換性                 | `test/compat` の ESM（`import`）と CommonJS（`require()`）の確認を、`pnpm check` では手元・CI の版で、CI の `compat` ジョブでは engines の下限（22.12.0）で、ビルド済みの `dist` に対して実行する                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Node.js の警告                 | 自前のスクリプトとテストで、Node.js の警告（非推奨の API・実験的な機能など）が出たら失敗にする（`scripts/strict-warnings.ts`）。`test/compat` は対象外                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ブラウザー・Workers・Bun・Deno | CI のみ。`browsers` ジョブ（Chrome・Firefox・Edge）・`safari` ジョブ（macOS）・`workerd` ジョブ・`bun` ジョブ・`deno` ジョブで、ビルド済みの `dist` に `test/compat/smoke.mjs` を実行する。止まったときのやり直しは結果を受け取る前の段階だけ（FAIL ではやり直さない）。本物の Temporal がない環境では、飛ばしたことをログに出す。`pnpm check` は、`src` が Node.js 固有の機能を使っていないことを確かめる                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ドキュメントのコード例         | README と `docs/guide`・`docs/providers`（英語・日本語）の ts のコード例を実行し、コメントに書いた結果と比べる（`scripts/check-readme-examples.ts`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ワークフローの検査             | CI のみ（`ci.yml` の `workflows` ジョブ）。`actionlint` で `.github/workflows` の構文・式・コンテキストの使い方と、`run:` のシェルスクリプト（ランナーの `shellcheck`）を検査する。`pnpm check` には含まない（ワークフローの誤りは GitHub に読み込まれるまで分からないため、CI で止める）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 性能の退行                     | CI のみ（`ci.yml` の `bench` ジョブ）。公開済みの前の版（npm の `latest`）と今回の `dist` を同じランナー・同じ Node.js で `scripts/bench.ts` にかけ、`scripts/bench-compare.ts` で比率を比べる。どれかの計測が 2 倍より遅ければ失敗（ランナーの性能は実行ごとにぶれるので、絶対値では判定しない）。正しさのために遅くなることを受け入れる版は、CHANGELOG の今の版（または `[Unreleased]`）の「開発」に「性能の退行」という言葉を含めて理由を書けば、表に記録したうえで合格にする（decisions.md の 37 番）。絶対値は Job Summary に残り、リリースごとの傾向を追える。`pnpm check` には含まない                                                                                                                                                                                                                                                                                                                                                       |
| 祝日データの差分               | CI のみ（`ci.yml` の `data-compare` ジョブ）。公開済みの前の版（npm の `latest`）と今回の `dist` の同梱の提供元を、対応年が重なるすべての年で 1 日ずつ比べる（`scripts/data-compare.ts`）。差分は Job Summary に出る。`key` が変わったとき、差分があるのに CHANGELOG の今の版（または `[Unreleased]`）に **Data** がないとき、提供元がなくなったか対応年が狭まったときに失敗する。同梱の提供元の内部を置き換えた版は、この比較で差分がないことを確かめる（decisions.md の 26 番）。誤った `key` を直すときは「区分」の手順で行う。同梱の提供元の内部の置き換えは、ほかの変更と同じ版で出す（区分を設けない）。前の版にない提供元・前の版の対応年の外の年は比べない。`pnpm check` には含まない（npm への接続が要るため。decisions.md の 37 番）                                                                                                                                                                                                      |
| 設定の結果の差分               | CI のみ（`ci.yml` の `result-compare` ジョブ）。種で決まる設定の集まりと、過去の退行を再現する固定の設定を、公開済みの前の版（npm の `latest`）と今回の `dist` に渡し、カレンダー（直接・合成・スケジュールから）とスケジュールの結果を 1 日ずつ比べる（`scripts/result-compare.ts`）。診断は前の版の結果がすべて今回の結果に含まれることを確かめる。意図した差分は `etc/result-changes.json` に設定の特徴・入った版・出典を書いたものだけを許し、ほかの差分があれば失敗する。結果を変える修正（不具合の修正・誤った診断の修正）をしたら、特徴を `scripts/result-compare.ts` の `traitsOf` に、項目を `etc/result-changes.json` に足す（比較は意図しない変化を見つけるもので、動作を固定するものではない）。0.30.x の間は改名の前の 0.22.2 とも旧名の設定で比べる（1.0.0 で外す）。`pnpm check` には含まない（npm への接続が要るため。decisions.md の 37 番）                                                                                       |
| API のスナップショット         | 公開している名前と型を `etc/api.md` と比べる。意図した変更なら `pnpm api:update` で更新してコミットする                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 開発環境の版

Node.js・npm・pnpm は、手元の開発環境と CI で同じ版を使います。CI の版は次の場所で管理しています。

- `.github/actions/setup-toolchain/action.yml`: npm と pnpm の版
- `.github/workflows/ci.yml`・`release.yml`・`data-watch.yml`: Node.js の版とランナー（`ubuntu-24.04`）
- `.github/workflows/ci.yml` の `compat` ジョブ: 公開物を確かめる Node.js の版（engines の下限と、LTS の系列・LTS 入りを控えた系列のうち `check` で使わないもの。decisions.md の 35 番）
- `.github/workflows/ci.yml` の `workerd` ジョブ: workerd の版と SHA-256（公式のリリースの `workerd-linux-64.gz` を取得して計算する。熟成ゲートを過ぎた版を指定する）。`safari` ジョブの macOS のランナーの版（`macos-15`）
- `.github/workflows/ci.yml` の `bun`・`deno` ジョブ: Bun の版と SHA-256（公式のリリースの `SHASUMS256.txt` の `bun-linux-x64.zip` の行）、Deno の版と SHA-256（公式のリリースの `deno-x86_64-unknown-linux-gnu.zip.sha256sum`）。どちらも熟成ゲートを過ぎた版を指定する
- `.github/workflows/ci.yml` の `workflows` ジョブ: actionlint の版と SHA-256（公式のリリースの `actionlint_<版>_checksums.txt` の `linux_amd64` の行）

`pnpm check` は最初に `scripts/check-toolchain.ts` で、ワークフローどうしの Node.js の版がそろっていること、compat の行列に engines の下限が入っていること、実行している Node.js・npm・pnpm が固定版と同じことを確かめます（固定版との違いは、CI ではエラー、手元では注意の表示）。

スクリプトからレジストリに接続する npm の操作（`install` など）はしません（decisions.md の 35 番）。

npm 12 の動作要件は Node.js `^22.22.2 || ^24.15.0 || >=26.0.0` です。版を上げるときは、公開から 48 時間を過ぎた版を指定し、手元の環境もそろえてください。開発用の依存（devDependencies）は版の完全一致で指定し、更新時は `pnpm install` で `pnpm-lock.yaml` も更新してコミットします。

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
- staged publishing には npm CLI 11.15.0 以上が必要です。CI では `.github/actions/setup-toolchain` で固定した npm を使います

### 利用者に届く時刻

ステージした版は、承認するまでインストールできません。npm 上の公開時刻（`npm view bizdays-toolkit time`）は、ステージした時刻ではなく承認した時刻になります（0.1.2 で確認: ステージ 2026-10-12T08:02:23Z、承認による公開時刻 08:05:51Z）。熟成期間（公開から一定時間待ってから取り込む運用）を設けている利用者にとっては、承認した時刻から数え始めることになります。
