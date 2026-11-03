# Security Policy

## Reporting a vulnerability

脆弱性は、公開の Issue ではなく、GitHub の **Private vulnerability reporting** で報告してください（リポジトリの Security タブ → "Report a vulnerability"）。報告内容はメンテナーだけが見られます。

Please report vulnerabilities privately through GitHub's **Private vulnerability reporting** (Security tab → "Report a vulnerability"), not through public issues. Only the maintainer can see the report.

## Supported versions

最新のマイナー版だけを修正の対象にします（1.0.0 までは 0.x の最新）。

Only the latest minor release receives fixes (until 1.0.0, the latest 0.x minor release).

## Supply chain

- 依存ゼロです。ランタイムの依存（`dependencies`）はありません
- npm への公開は GitHub Actions から staged publishing で行い、メンテナーが 2FA 付きで承認してから利用者に届きます。0.1.0 以降のすべての版に provenance（ビルド元の証明）が付いています
- npm のアクセストークンは使いません（Trusted Publishing）

- Zero dependencies: the package has no runtime dependencies (`dependencies`).
- Releases are published to npm from GitHub Actions with staged publishing, and reach users only after the maintainer approves them with 2FA. Every release from 0.1.0 onward carries provenance (an attestation of where it was built).
- No npm access token is used (Trusted Publishing).
