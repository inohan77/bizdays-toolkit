// 例外の code だけを見る繰り返しの間、実行環境のスタックの記録を止める（テストの時間のため）。
// 取り除いて比べるテストは、広い期間の全日について公開の関数を 1 日ずつ呼び、対応年の外の日などで例外を受ける。例外を作るたびに
// スタックを記録する時間がかかるので、その繰り返しの間だけ記録を止める。ライブラリは今までどおり例外を投げ、テストは今までどおり
// 受ける。全体で止める形（--stack-trace-limit=0）は、テストが失敗したときのスタックが出なくなるので取らない

/**
 * fn の間だけ Error.stackTraceLimit を 0 にし、抜けるとき（例外で抜けたときも）元の値に戻す。
 * 例外のメッセージと code だけを見る同期の繰り返しにだけ使う（同期なので、ほかのテストの例外が止めている間に作られることはない）
 */
export function withoutStackTraces<T>(fn: () => T): T {
  const saved = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    return fn();
  } finally {
    Error.stackTraceLimit = saved;
  }
}
