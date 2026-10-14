# Security Policy

## Reporting a vulnerability

脆弱性は、公開の Issue ではなく、GitHub の **Private vulnerability reporting** で報告してください（リポジトリの Security タブ → "Report a vulnerability"）。報告内容はメンテナーだけが見られます。

Please report vulnerabilities privately through GitHub's **Private vulnerability reporting** (Security tab → "Report a vulnerability"), not through public issues.

## Supported versions

最新のマイナー版だけを修正の対象にします（1.0.0 までは 0.x の最新）。

Only the latest minor release receives fixes.

## Supply chain

- ランタイムの依存はありません（dependencies は空です）
- npm への公開は GitHub Actions から staged publishing で行い、メンテナーが 2FA 付きで承認してから利用者に届きます。すべての版に provenance（ビルド元の証明）が付きます
- npm のアクセストークンは使いません（Trusted Publishing）
