/**
 * 性能の退行の許可（scripts/bench-compare.ts が使う）。開発の記録（docs/development-log.md）の今のバージョン（または [Unreleased]）に、
 * 計測ごとに次の形の行を書くと、その計測が上限を超えても、書いた倍率までは受け入れる。
 *
 *   - 性能の退行: <計測の名前> は <数>x まで受け入れる（<理由>）
 *
 * 「性能の退行」という言葉があるだけの行と、理由（括弧の中）のない行は、許可にならない（0.31.9 で、速くなったことを書いた行の見出しにこの言葉を使い、上限を
 * 超えても合格になる状態で公開の直前まで進んだ。tool-selftest が見つけた）。どの計測を何倍まで受け入れるかを書かせるのは、
 * 受け入れたつもりより大きい退行を止めるためでもある（RELEASING.md の「品質の確認」の表の「性能の退行」の行）
 */

/** 許可の行の頭。この後に、計測の名前・「 は 」・倍率・「x まで受け入れる」が続く */
export const ALLOWANCE_PREFIX = "- 性能の退行: ";

/**
 * 記録の節の本文から、その計測に許した倍率を読む。許可の行がなければ undefined。
 * 計測の名前は全角の括弧を含むので（「createCalendar（店舗の設定）」）、正規表現で読み分けず、行の頭との完全一致で探す
 */
export function allowedRatio(sections: readonly string[], name: string): number | undefined {
  const head = `${ALLOWANCE_PREFIX}${name} は `;
  for (const section of sections) {
    for (const line of section.split("\n")) {
      if (!line.startsWith(head)) continue;
      // 理由（全角の括弧の中に 1 文字以上）まで書いた行だけを許可にする（理由のない許可を残さない）
      const m = /^(\d+(?:\.\d+)?)x まで受け入れる（.+）/.exec(line.slice(head.length));
      if (m) return Number(m[1]);
    }
  }
  return undefined;
}
