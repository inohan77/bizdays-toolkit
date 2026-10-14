# Changelog

この形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、版の付け方は [Semantic Versioning](https://semver.org/lang/ja/) と [RELEASING.md](./RELEASING.md) の方針に従います。区分には Keep a Changelog の Added / Changed / Deprecated / Removed / Fixed / Security に加えて、祝日データの更新を表す **Data** を使います。

## [Unreleased]

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

[Unreleased]: https://github.com/inohan77/bizdays-toolkit/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/inohan77/bizdays-toolkit/releases/tag/v0.1.0
