/**
 * 予期しない例外（uncaughtException・unhandledRejection）で、終了コード 2 で止める。読み込むだけで効く。
 *
 * result-compare（scripts/result-compare.ts）の終了コードは、0 = 合格、1 = 許していない差分・意図せず作成に失敗した設定、
 * 2 = 引数・読み込みの誤り・予期しない例外。Node.js の既定の 1 は「許していない差分」と区別できないので、2 にそろえる。
 * 比較が終わらなかったこと（道具の故障）と、差分が出たことを、終了コードで見分けられるようにするため（CI の result-compare
 * ジョブ・手動の広い比較 .github/workflows/result-compare-wide.yml・手元のどれで動かしても、結果を読み違えない）。
 *
 * ES モジュールでは、静的な import がすべて本体より先に評価される。そのため、この登録は読み込むスクリプトの最初の import に
 * 置く（ほかの import の評価の途中で投げた例外も、ここで受けるため）。
 */
for (const event of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(event, (error: unknown) => {
    console.error(
      `stopped by an unexpected exception: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    process.exit(2);
  });
}
