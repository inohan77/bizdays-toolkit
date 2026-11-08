/**
 * 設定・オプションの引数として受けるオブジェクトの判定（docs/decisions.md の 8 番）。設定・オプションを受ける関数がすべて
 * この判定を使う（国の提供元は使わないので、errors.ts とは分ける）。
 */

/**
 * @internal 設定・オプションの引数として受けるオブジェクトか。Date・Map・Set・RegExp・配列・関数・包んだプリミティブなどは
 * 受けない。別の実行環境のオブジェクトも受けるよう、プロトタイプではなく種類で見る
 */
export const isOptionsObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.prototype.toString.call(v) === "[object Object]";
