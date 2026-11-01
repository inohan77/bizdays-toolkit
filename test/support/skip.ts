// 飛ばしの決まり（テスト拡充案の T3）。前提がそろわないときに飛ばす箇所（テストの skip・todo、スクリプトの SKIP の行）は、
// この関数を通し、理由を下の意図した飛ばしの一覧から引く。CI（環境変数 CI が設定されている）では、一覧にない理由や、
// CI では飛ばさない理由（ci: false）の飛ばしを失敗にする。この関数を通さない飛ばしは test/skip-policy.test.ts が止める。

interface IntendedSkip {
  /** 出力に出す理由 */
  readonly reason: string;
  /** CI でも飛ばしてよいか */
  readonly ci: boolean;
  /** 既知の不具合のテスト（todo）か */
  readonly todo?: boolean;
}

/** 意図した飛ばしの一覧。足すときは判断を仰ぐ（RELEASING.md の「品質の確認」） */
export const INTENDED_SKIPS: Readonly<Record<string, IntendedSkip>> = {
  "tz-run": {
    reason: "暦日だけで決まるので、タイムゾーンを変えた実行（scripts/test-tz.ts）では飛ばす",
    ci: true,
  },
  "oracle-joint": { reason: "0.31.0（P1）で有効にする。ORACLE_JOINT=1 で試せる", ci: true },
  "temporal-unavailable-runtime": { reason: "no Temporal in this runtime", ci: true },
  "temporal-unavailable-browser": { reason: "no Temporal in this browser", ci: true },
  "no-release-tag": {
    reason: "no release tag readable with git (run git fetch --tags)",
    ci: false,
  },
  "known-bug-combine-short-circuit": {
    reason:
      "既知の不具合（0.31.0 で直す）: 合成の営業日の判定は、先のカレンダーで結果が決まると後のカレンダーを判定しない",
    ci: true,
    todo: true,
  },
};

const inCI = (): boolean => (process.env["CI"] ?? "") !== "" && process.env["CI"] !== "false";

function entryOf(id: string, todo: boolean): IntendedSkip | undefined {
  const entry = INTENDED_SKIPS[id];
  const problem =
    entry === undefined
      ? `意図した飛ばしの一覧（test/support/skip.ts）にない理由: ${id}`
      : (entry.todo ?? false) !== todo
        ? `${id} は${todo ? "既知の不具合（todo）" : "飛ばし（skip）"}の理由ではない`
        : inCI() && !entry.ci
          ? `CI では飛ばさない理由: ${id}（${entry.reason}）`
          : undefined;
  if (problem !== undefined) {
    if (inCI() || entry !== undefined) throw new Error(problem);
    return undefined;
  }
  return entry;
}

/**
 * active なら飛ばす理由（node:test の skip に渡す）、そうでなければ false。理由（id）が一覧にあるかは、active にかかわらず
 * いつも確かめる（打ち間違いを、飛ばす条件がそろう前に見つけるため。一覧にない理由は CI でなくても失敗）
 */
export function skipWhen(id: string, active: boolean): string | false {
  const entry = INTENDED_SKIPS[id];
  if (entry === undefined)
    throw new Error(`意図した飛ばしの一覧（test/support/skip.ts）にない理由: ${id}`);
  if (!active) return false;
  return entryOf(id, false)?.reason ?? entry.reason;
}

/** 既知の不具合のテストの理由（node:test の todo に渡す） */
export function todoFor(id: string): string {
  return entryOf(id, true)?.reason ?? `意図した飛ばしの一覧にない理由: ${id}`;
}
