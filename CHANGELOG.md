# Changelog

この形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、版の付け方は [Semantic Versioning](https://semver.org/lang/ja/) と [RELEASING.md](./RELEASING.md) の方針に従います。区分には Keep a Changelog の Added / Changed / Deprecated / Removed / Fixed / Security に加えて、祝日データの更新を表す **Data** を使います。

## [Unreleased]

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

[Unreleased]: https://github.com/inohan77/bizdays-toolkit/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/inohan77/bizdays-toolkit/releases/tag/v0.1.0
