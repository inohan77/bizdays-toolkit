# Changelog

この形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、版の付け方は [Semantic Versioning](https://semver.org/lang/ja/) と [RELEASING.md](./RELEASING.md) の方針に従います。区分には Keep a Changelog の Added / Changed / Deprecated / Removed / Fixed / Security に加えて、祝日データの更新を表す **Data** を使います。

## [Unreleased]

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

[Unreleased]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/inohan77/bizdays-toolkit/releases/tag/v0.1.0
