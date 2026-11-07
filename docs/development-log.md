# 開発の記録

版ごとの品質の仕組みの変更（公開物の変わらない変更）の記録です。1 項目 1 行で、何を足した・やめた・変えたかと、動かし方が変わるなら環境変数・コマンドを書きます（RELEASING.md の「区分」）。利用者向けの変更は CHANGELOG.md にあります。このファイルは npm の公開物に含めません。

0.30.0 から 0.31.0 までの分は、0.31.0 で CHANGELOG.md の各版の「開発」から移しました（移動で、文は変えていない）。0.29.x 以前の「開発」は CHANGELOG.md の各版にあります。

## [Unreleased]

- 予算の基準値を直近 3 回の main の CI の中央値にし、超過はぶれと比べてから判断する（0.31.0 の ZIP-F の取り込みで、同じコードの値が 1.7 倍ぶれた）

- 0.32.0 の検討: `@internal` の宣言を `.d.ts` から落とす（`stripInternal`）か、dist の内部を読むテスト（`result-compare`・診断の整合）を src 直読みにするか

## [0.31.0]

- 診断のオラクル: 出た項目をまとめて取り除くテストを既定にし（`ORACLE_JOINT` と飛ばしの理由 `oracle-joint` をやめた）、完全性を「まとめて取り除いた後に取り除ける項目が残らない」にした
- 前の版との比較: 特徴 `redundant-sequential`（規則・日付を 2 つ以上持つ設定）を足し、`etc/result-changes.json` で消える `redundant` を許す
- 診断の性質のテスト: `redundant` を、出た項目（`shadowed`・`never-matches` を含む）とまとめて取り除いて確かめるようにした
- サイズの上限（0.31.x の間はこの値）: `./diagnose` を 26,800 → 30,000 にした（測定 28,089）。ルート `.` を 18,500 → 19,000 にした（測定 18,594。休業日の探索・`isOpen` の確かめ・例外の形の追加）。`./jp` を 21,000 → 21,500 にした（測定 20,822。ルートと同じ理由）
- 逐次除去の費用: 目録で項目が最も多い設定（11 項目）の `diagnoseCalendar` は 0.30.9 の 201 ms に対して 194 ms、診断のオラクル全件の 6 分割の 1 つ（健全性と完全性のテスト）は 75.7 秒に対して 79.3 秒（手元の 1 コア）
- README（英日）のサイズの値を 0.31.0 で測り直した
- `catch-coverage`: 逐次除去で決める日を判定し直す箇所の `catch` を消した（判定できなかった日を記録して飛ばす。到達しない `catch` を残さない）
- 到達しない箇所の例外を、`code` を持たない `InternalError`（`internalError`）の 1 つの形にした。診断は、これを提供元の誤りとして報告せずにそのまま投げる（逐次除去の走査の上限を超えたとき・判定できない月の見張り）
- `test/robustness.test.ts`: すべての `code` について、実際に投げさせた例外のクラスが表と一致することを確かめる（表の `code` と `KnownErrorCode` が一致しなければ失敗）
- `test/diagnose-unjudgeable.test.ts`: 判定できない月と逐次除去の関係（分からない規則は出ず取り除かない・並べ替えても同じ・まとめて取り除ける）を足した
- API どうしの整合の整合 10: 出た規則をまとめて取り除いても、判定できる日の結果が変わらないことを確かめる（`redundant` を 1 つずつ取り除く確かめをやめた）
- 診断のオラクル: スケジュールの項目（`recurringRules`・`annualDates`、基準のカレンダー 4 種）の総当たりを足した。判定できない月にかかわる規則への約束は素朴な定義（`valueOn` で投げる日がある月）で確かめ、実装の求めすぎ（素朴な定義では判定できるのに出さない項目）の数を出す
- 診断のオラクル: CI の `oracle` ジョブの行列を `ORACLE_SHARD` 3 → 4 にした（3 つの分割のうち 2 つが 480 秒を超えたため）
- 診断: 第 n 営業日の規則では、規則の形を調べる代表の 28 年間の当てはまる日の印を求めないようにした（`shadowed` は形の包含で決まり、印はどの診断も使わない）。スケジュールのオラクルの全件が手元で 119 秒 → 42 秒
- 診断のオラクル: スケジュールの素朴な定義を日の単位にし、診断の窓（`rulesScanWindow`）の全日の `valueOn` を見るようにした（0.31.0-D の素朴な定義は比べる 2025〜2027 年だけを見ていて、窓の外で本当に分からない項目を求めすぎに数えていた）。素朴な定義でも分からない項目は全件で 58 → 106 件（定義の誤りの修正と、窓の中だけで投げる基準 `BASIS_INSIDE` の追加の分）、求めすぎは 28 → 0 件で、0 件を確かめる形にした。抜き出しを 5 件に 1 件 → 20 件に 1 件にし、固定の設定の形は常に含める
- 判定できない日を求める途中で、週の 7 日が属する月のうち最初に投げた月で止まり（`some`）、後の月を見張りの入力に記録し損ねる誤りを、整合 10 の全件で見張り（`dropUnsure`）が捕まえた（取り込みの前に直した）
- 開発環境の版: npm を 12.2.1 → 12.2.2、pnpm を 12.16.1 → 12.18.0 にした（`.github/actions/setup-toolchain/action.yml`。`pnpm-lock.yaml` は変わらない）

- 決定の文書の 34〜37・39 番（品質の仕組みの理由）を 40 番にまとめ、理由を RELEASING.md の「品質の仕組みの理由」に移した。新しい品質の仕組みは、目的と根拠を PR か開発の記録の 1 行に書いてから入れる
- CHANGELOG を 0.31.0 から英語にし、0.30.x と 0.31.0 の「開発」をこのファイルに移した（`scripts/release-sections.ts` で、`check-size`・`bench-compare`・決定の参照が両方を読む）
- テストのテスト 7 ファイルを `test/tools/` に移し、`pnpm test:tools` にした（`pnpm check` と CI の `tool-selftest` ジョブで動かす）。`pnpm test` は `test/*.test.ts` だけ
- `test/deprecated.test.ts` を 7 → 4 件にした（設定の旧名の同じ結果は変形 1 が確かめる）。`test/faulty-provider.test.ts` を約束ごとの 4 件と診断と判定の一致に組み直した（注入の種類は中で回す。作成の確かめを 5 組み合わせ足した）
- RELEASING.md に、0.x の区分・先送りの扱い・記録の書き分け・品質の仕組みの予算・品質の確認の表の「最後に見つけた不具合」の列を足した
- README（英日）のサイズの値を 0.31.0 の最後の状態で測り直した

- ZIP-C の取り込みで見つけた軽微 4 件を直した（「開発」の書き場所を開発の記録にそろえた、ワークフローと test/compat の決定の旧番号への参照を置き換えた、`deprecated.test.ts` に旧名の設定の `optionPath` と `outOfRangePolicy` の確かめを戻した、CHANGELOG の冒頭の重複をまとめた）。決定 38 番の「開発」の箇条を開発の記録に合わせ、CHANGELOG の過去の版の見出し「### 移行」を「### Migration」に機械的に置き換えた（本文は日本語のまま。読んでいた箇所も合わせた）

## [0.30.9]

- RELEASING.md の区分: 約束した例外が出ていなかった不具合の修正は、新たに投げる向きでもパッチにした（「新たに例外を投げる変更はマイナー」は約束していなかった呼び出しを止める場合に限る）
- RELEASING.md: CHANGELOG の「開発」は 1 項目 1 行にする決まりを足し、0.30.8 までの「開発」を縮めた
- RELEASING.md のサイズの上限: 上限はマイナー版ごとに決め、パッチ版の中では上げない決まりを足した（0.31.0 から適用）
- サイズの上限: `./diagnose` を 26,500 → 26,800 に上げた（測定 26,503）。明示的な `undefined` の扱いと旧名の読み替えの直しで増えた
- タイムゾーンを変えたテストを、瞬間・時刻を渡すテスト（`scripts/test-tz.ts` の `TZ_FILES`）だけの再実行にし、一覧に載っていない瞬間・時刻を書いたテストがあれば失敗にした（手元で約 95 秒 → 約 17 秒）。テストの `tz-run` の飛ばしは外した
- 合成の既知の不具合の `todo` 2 件を、並び順 × `"all"`・`"any"` の通常のテストにした。飛ばしの決まりの自己テストは見本の一覧（`POLICY_SAMPLE`）で確かめる形にした
- 変形しても結果が同じ: 変形 7（書いていない既知の項目を明示的な `undefined` で書いても、結果・診断が同じ）を足した
- 明示的な `undefined` のテスト（`test/explicit-undefined.test.ts`）を足した: メソッド・関数のオプション（`etc/api.md` の Options の型。設定の型は変形 7）で、書いていない項目と旧名を `undefined` で書いても結果が同じ。表にない Options の型があれば失敗する
- API どうしの整合: 事例のテストの整合 9 を、整合 8（`never-matches` も確かめ、有効期間 3 通り）に吸収した。整合 10 は全件（CI）だけで動かす
- 診断の性質のテスト: `pnpm check` では短い提供元・提供元なしの性質だけを動かし、第 n 営業日の規則のある設定と日本の全範囲は全件（CI）だけにした（飛ばしの理由 `ci-full-only`）
- `test/counting-basis.test.ts`: オラクルが確かめる形（有効期間が重ならない組）のテストを 1 件消した
- 診断のオラクル: 項目 3 つの固定の設定 `jointFixed`（同じ曜日の under・over・after の規則。品質改善提案 11 通目の反例）を `test/fixtures/oracle-items.json` に足し、まとめて取り除くテスト（`ORACLE_JOINT=1`）で試す（0.31.0 の作り直しの正解の定義。今は失敗する）
- `src/core/schedule.ts`: 第 n 営業日の基準のキャッシュの上限（240 か月）の意味をコメントに書いた

## [0.30.8]

- 診断のオラクル: `counting-basis` の確かめを、第 n 営業日の規則と毎週の曜日の規則の有効期間が重なる組を前提にし、前提があるのに出ないとき・出た件数が組の数と違うときも失敗にした
- 前の版との比較: 特徴 `counting-rule-with-period-weekly-rule`（`etc/result-changes.json` で `counting-basis` が消える差分を許す）と `calendar-date-with-value`（増える向きなので許可は足さない）を足し、固定の設定 4 つを足した
- 決定の文書: 3 番に「同じ `code` は同じクラスで投げる」を足した
- `counting-basis` の判定を、規則どうしの走査の後の第 2 の走査にした（規則の並び順で結果が変わらないように）
- `./diagnose` の gzip のサイズ（測定 26,322。上限 26,500）
- 決定の文書: 「版と互換性」の章の見出しの直後にあった番号のない箇条 2 つを 31 番に移した
- 「0.31.0 の P1」を「診断の判定の作り直し（0.31.0）」と言葉で書いた
- API どうしの整合のテスト（`test/consistency.test.ts`）の名前の番号を整合 1〜11 に振り直した
- `bizdays-toolkit/jp` の `jp` の TSDoc に 0.30.0 の旧名 `holidays` が残っていたのを `holidayProvider` に直した
- `src/core/input.ts` の到達しない `replace(" ", "T")` を消した
- `check-package`: `src` が実行環境のタイムゾーンに依存する API を使っていないことを確かめるようにし、`tool-selftest` にその誤りを 2 件足した
- タイムゾーンを変えたテスト（`scripts/test-tz.ts`）を UTC・Asia/Tokyo・America/Los_Angeles・Pacific/Chatham の 4 ゾーンから America/Los_Angeles・Pacific/Chatham の 2 ゾーンにした
- `check-names`: 報告のパスの区切りを `/` にそろえた
- 前の版との比較（`scripts/result-compare.ts`）: 意図した差分として許した設定の `id` と対象を一覧に出すようにした（意図しない差分が出たときに、許した側と見比べるため）
- `src/core/input.ts`: `Date.parse` にオフセット付きの文字列だけを渡している理由をコメントに書いた
- 開発用のツールを更新: oxlint 1.88.0 → 1.91.0、oxfmt 0.73.0 → 0.76.0、`@types/node` 24.19.2 → 26.6.6
- `check-package` の実行環境のタイムゾーンに依存する API の検査を直した
- 診断の性質のテストを、ほかの全件のテストと同じ「`pnpm check` は抜き出し、全件は CI」の形にした（全件は `DIAGNOSE_PROPERTY_FULL=1`）
- 変形しても結果が同じ（`test/metamorphic.test.ts`）の全件（`METAMORPHIC_FULL=1`）を CI の `diagnose-consistency` ジョブで動かすようにした
- 全日の結果を比べる補助を `test/support/compare.ts` に 1 つにした
- 同じ恒等式を 3 か所で確かめていたのを 1 か所にした
- `check-package` の実行環境のタイムゾーンに依存する API の検査: 文字列の中身を先に空にしてから `//` のコメントを除くようにした

## [0.30.7]

- サイズ（gzip）: `./diagnose` 26,158 → 26,218
- 判定できない月の診断のテストを足した
- API どうしの整合の検査（`test/consistency.test.ts`）の直し: 作成を試す関数は、bizdays のエラーコードを持つ例外だけを「作成できない」とみなし、ほかの例外は投げ直す
- `scripts/result-compare.ts`: スケジュールの第 n 営業日の規則の基準のカレンダーに、スケジュールの設定の `outOfRangePolicy` を受け継がせた
- `scripts/tool-selftest.ts`: 表のセルの `|` を `\|` にし、写しの途中で例外が出ても、そこまでに写したファイルを表の後に出し、`Error` でない値の例外も文にする
- 飛ばしの決まり（`test/support/skip.ts`）: 事前の確認で届かなくなった枝を消した
- ガイド（英日）の「対応年の外」: スケジュールの第 n 営業日の規則の文を独立させ、「結果が分からない年の祝日に依存するため」の理由とシンガポールの例が、隣の日を見る規則と週の第 n 営業日の規則の説明として読めるようにした
- 変形しても結果が同じ: 文書で同じ意味だと約束している書き換えで、全日の結果と、位置を読み替えた診断が変わらないことを、目録の設定で確かめる
- 文書の例の検査を厳しくした（テスト拡充案の T6）: 例で `createCalendar`・`createSchedule` に渡した設定を自動で診断にもかけ、`error`・`warning` があれば失敗にする
- ガイド（英日）の「カレンダーの合成」に、2 つ以上の別々のカレンダーを渡すことを書き足した（コードにだけあった決まり）
- `SECURITY.md` の Supply chain と Supported versions を英日の併記にそろえ、依存ゼロ（`dependencies` を持たない）と、provenance が付く版を 0.1.0 以降と正確に書いた
- 文章の主張の検査（`scripts/check-claims.ts`。`pnpm check`）を足した。前の版から変わった決定の参照の表は `--decisions --since v<前の版>` で出す
- テスト拡充案の T8（設定の結果の差分の定期実行）は、定期実行としては入れず、種と倍率を指定して広い比較を手動で動かすワークフローとして入れた
- 設定の結果の差分（`scripts/result-compare.ts`）の直し: 診断の結果が増えた設定を一覧に出す
- 目録の生成器（`test/support/catalog.ts`）が、スケジュールの個別の日付の半分ほどを期間（`dates` の `{ from, to }`）にする
- 診断のオラクルの完全性（取り除いても結果が変わらないのに診断が何も言わない項目）を、報告から失敗に切り替えた
- 設定の結果の差分（`scripts/result-compare.ts`）の穴を直した: `latest` との比較の旧名の回が、旧名に書き換わっていなかった
- 設定の結果の差分の意図した差分（`etc/result-changes.json`）に、上の Fixed の 2 件目の項目を足した
- `RELEASING.md` の監視の節: GitHub の失敗の知らせの届き先と、有効にし直すステップの影響を、事実に合わせて書いた
- 飛ばしの決まりの検査（`test/skip-policy.test.ts`）: 省略記法・分割代入・`skip`・`todo` の import・export と変数・引数の宣言を、TypeScript のコンパイラーの API で読んで拾うようにした
- `RELEASING.md` の確認の表: 変形しても結果が同じ（T4）と文章の主張（T7）の行を足し、ドキュメントのコード例（T6）・設定の結果の差分（T8）の行を今の検査に合わせた

## [0.30.6]

- サイズの上限: 上限を 25,800 から 26,500 に上げた `./diagnose`（測定 26,158）
- 診断のオラクル: カナリア（完全性の報告に必ず出る設定）が取り除ける理由を確かめた
- 診断のオラクル: `ORACLE_FULL` なしの `ORACLE_SHARD` を例外にした
- 生成範囲: 危険の分かっている組み合わせの一覧を作り、呼び出し側ごとに 1 回以上作ることを確かめる（作れない組み合わせは事実の理由を付けて除く）
- 生成範囲: `test/properties.test.ts` の性質は、設定を作る乱数（性質の名前から決まる種の列）と、日付などを引く乱数を分けた
- API どうしの整合の検査（`test/consistency.test.ts`）を入れた（全件は `CONSISTENCY_API_FULL=1` で CI の `diagnose-consistency` ジョブ）
- 検査のスクリプトの検査の直し: 取り込み中の変更を `git status -z` で読む（日本語・スペースを含むパスを写せなかった）
- 検査のスクリプトそのものの検査（`scripts/tool-selftest.ts`。CI の `tool-selftest` ジョブ。写しを作る場所は `TOOL_SELFTEST_DIR`）を入れた
- `catch` 節の到達の検査: 除外の一覧の名前が 2 つ以上の節で重なるときと、節の文が `try` と同じ行にあるとき（行で数える lcov では判定できない）を失敗にした。`--lcov` は検査そのものを試すための引数で、CI は使わない
- `catch` 節の到達の検査を入れた
- 飛ばしの決まり: 前提がそろわないときに飛ばす箇所を補助の関数に集め、理由を意図した飛ばしの一覧から引くようにした
- 診断と判定の一致のテストの全件（150 件）を、`CONSISTENCY_FULL=1` で CI の `diagnose-consistency` ジョブで動かす（`pnpm check` は 12 件）
- 失敗を注入する祝日の提供元を作り、判定・診断・合成の結果が文書のとおりかを確かめるテストを足した
- 診断のオラクル: カナリアの理由のテストで、`"over-holiday"` の開く規則を実際に取り除くと全日の結果が変わることまで確かめる
- `scripts/record-generator-features.ts`: 作業ツリーは `--worktree` で指すようにした（`--ref HEAD` は使い方の誤り。CI の `generator-features` ジョブは `--worktree --check`）
- `RELEASING.md`: オラクルと生成範囲の行を実装と 1 文ずつ突き合わせ、消えていた「タイムゾーンを変えた実行では、オラクルと日本の全範囲の走査を飛ばす」を戻し、組み合わせの一覧の検査・カナリアの理由の確認・0 件の検査・`ORACLE_SHARD` の条件・CI の実測の時間を書いた

## [0.30.5]

- 生成範囲を減らさない検査を入れた（`test/generator-features.test.ts`。記録は `scripts/record-generator-features.ts --update --ref v0.30.3` でだけ作る）
- 呼び出し側の設定の作り方を `test/support/sites.ts`・`test/support/result-cases.ts` の関数にまとめ、呼び出し側と検査が同じ関数を使うようにした
- 生成器の到達性を、呼び出し側の文脈ごと・規則の形ごとに確かめるようにした（`test/catalog.test.ts`）
- 目録の除外の一覧を `"型.キー"` で引くようにし、除外したキーが `etc/api.md` に実在すること、呼び出し側が実際には作らないことも確かめる
- `scripts/result-compare.ts`: スケジュールの第 n 営業日の規則に、数える基準のカレンダー（`calendar`）を付けるようにした
- 診断のオラクルの項目を、目録の乱数から切り離して明示した一覧にした
- 黙って飛ばさない: `test/properties.test.ts` は飛ばした試行の件数をいつも「飛ばした試行: n / N（理由）」で出し、上限（1 割）を超えたら失敗にする。誤った値が黙って既定になっていた `ORACLE_SHARD`・`PROPERTY_SEED`・`ORACLE_FULL`・`ORACLE_JOINT` と、`result-compare.ts` の `--seed`・`--scale`、`bench-compare.ts` の `--ratio` を、例外か使い方の誤りにした
- 診断のオラクルの完全性の報告（取り除けるのに何も出ない項目）を確かめられるようにした
- 診断のオラクルの範囲を広げた（全件の設定 3,481 → 9,976 件。CI の `oracle` ジョブを `ORACLE_SHARD` で 3 つの行列に分けた）
- 診断の `counting-basis` の文を、毎週の曜日の規則が開く規則か閉じる規則かの両側で確かめる単体テストを足した（文の分岐を確かめていなかった穴。種類 C）
- 生成範囲の検査の補修: 特徴の取り出しの診断の走査の範囲（`diagnoseRangeOf`）に、対応年が 1900〜2099 年と重ならないときに先頭の 200 年にする扱いを入れ、単体テストで確かめる（`test/features.test.ts`）
- `RELEASING.md`: 診断のオラクルの環境変数（`ORACLE_FULL`・`ORACLE_SHARD`・`ORACLE_TARGET`・`ORACLE_JOINT`）と、全件の実行の時間の決まりを書いた
- `test/diagnose-properties.test.ts` の冒頭に二重に残っていた古い説明のコメントを消した
- `RELEASING.md`: 品質の確認に生成範囲の行を足し、目録・オラクルの行を今の検査に合わせた

## [0.30.4]

- 規則と設定の目録 `test/support/catalog.ts` を置き、乱数のテストと `scripts/result-compare.ts` の生成器を目録に切り替えた
- `test/properties.test.ts` のカレンダーに、目録の繰り返しの規則を入れた（これまでは繰り返しの規則のないカレンダーだけを試していた）
- `test/diagnose-properties.test.ts` は、対応年の短い自作の提供元（`test/support/provider.ts`）で全日を比べる（400 日の抜き出しをやめた）
- 診断の総当たりのオラクル `test/diagnose-oracle.test.ts` を入れた（出た項目をまとめて取り除く性質は `ORACLE_JOINT=1` で試せる）
- `scripts/test-tz.ts`: タイムゾーンを変えた実行では、オラクルを飛ばす（暦日だけで決まるので）
- `RELEASING.md`: 品質の確認に目録とオラクルを足し、手元の確認は前の版のタグを読める状態で通すことを書いた
- サイズ（gzip）: `./diagnose` 25,321 → 25,360（測定 25,360。上の Fixed の文の分）

## [0.30.3]

- `test/diagnose.test.ts`・`test/diagnose-properties.test.ts`: 上の Fixed の 4 例（月・週の第 n 営業日、閉じる・開く規則）と、スケジュールの第 n 営業日の規則では結果が変わらないことのテストを足した
- `scripts/result-compare.ts`: 意図した差分を、診断の消えた結果のコード（`removedCodes`）で絞れるようにした
- サイズの上限: `./diagnose` を 25,000 から 25,800 に上げた
- サイズ（gzip）: `./diagnose` 24,753 → 25,321（測定 25,321）
- Node.js 26 が LTS に入ったので、CI の `check` の行列を 22.23.4・24.22.2・26.13.0 に上げ、ビルド・ブラウザー・ランタイム・比較・公開・監視のジョブの固定の版を 26.13.0 にした
- `scripts/check-package.ts`: 決定の文書の目次が本文の章・見出しと一致すること（番号の重複も）を確かめる
- `scripts/bench-compare.ts`: CHANGELOG の今の版（または [Unreleased]）の「開発」に決まった言葉で理由を書いた版は、2 倍を超えて遅くなっても表に記録して合格にする（言葉は `RELEASING.md` の品質の確認の表）
- `etc/result-changes.json` に 0.30.1 の修正（和集合の旧名 `"national"`）を足した
- `scripts/result-compare.ts`: 意図した差分を許す特徴を、比べた対象ごとに付けるようにした
- `test/fixtures/national-union-0.22.2.json` の出典の説明で、`"national"` の扱いの根拠を旧 55 番としていたのを旧 54 番（今の 10 番）に直した

## [0.30.2]

- CI に `result-compare` ジョブを足した（`scripts/result-compare.ts`）
- `scripts/check-names.ts`: 前の版を動かす `scripts/result-compare.ts` を、旧名の検査（C14）の対象から外した
- `test/national-union.test.ts` に、日本の提供元だけの設定の `shadowed` の確認を足した
- サイズ（gzip）: ルート 18,054 → 17,997（測定 17,997）、`./jp` 20,288 → 20,226（測定 20,226）、`./diagnose` 24,492 → 24,753（測定 24,753）

## [0.30.1]

- `scripts/check-names.ts` に、形を分けるための `?: never` の項目に TSDoc が付いていないこと（C13）と、今の状態を書いた文書・スクリプト・型定義の TSDoc に 0.30.0 の旧名が残っていないこと（C14）の検査を足した
- `scripts/check-size.ts`: 上限を変えた版で、CHANGELOG の測定値（「（測定 N）」の形）を 1 つも照合できなければ失敗にし、照合した件数を出すようにした
- 和集合の `"national"` のテストを足した
- サイズ（gzip）: ルート 17,646 → 18,054（測定 18,054）、`./jp` 19,890 → 20,288（測定 20,288）、`./diagnose` 23,919 → 24,492（測定 24,492）

## [0.30.0]

- 名前の規則の検査 `scripts/check-names.ts` を `pnpm check` に足した
- 改名の表を `src/core/renamed.ts` の 1 か所に置き、読み替え・診断・`migrate…` がこの表だけを使う
- `scripts/bench.ts` は、前の版が新しい名前を知らないときは設定を旧名に戻して渡す（CI の bench が同じ場面を比べるため）
- `scripts/check-readme-examples.ts` は、0.30.x の間だけ返す旧名の項目（削除予定の表から決める）を比べない
- サイズの上限を上げた
- README のサイズの値を 0.30.0 で測り直した
