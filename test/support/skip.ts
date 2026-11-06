// 飛ばしの決まり（テスト拡充案の T3）。前提がそろわないときに飛ばす箇所（テストの skip・todo、スクリプトの SKIP の行）は、
// この関数を通し、理由を下の意図した飛ばしの一覧から引く。CI（環境変数 CI が空でも "false" でもないとき）では、一覧にない理由や、
// CI では飛ばさない理由（ci: false）の飛ばしを失敗にする。この関数を通さない飛ばしは test/skip-policy.test.ts が止める。

export interface IntendedSkip {
  /** 出力に出す理由 */
  readonly reason: string;
  /** CI でも飛ばしてよいか */
  readonly ci: boolean;
  /** 既知の不具合のテスト（todo）か */
  readonly todo?: boolean;
}

/** 意図した飛ばしの一覧。足すときは判断を仰ぐ（RELEASING.md の「品質の確認」） */
export const INTENDED_SKIPS: Readonly<Record<string, IntendedSkip>> = {
  "oracle-joint": {
    reason: "診断の判定の作り直し（0.31.0）で有効にする。ORACLE_JOINT=1 で試せる",
    ci: true,
  },
  "ci-full-only": {
    reason:
      "pnpm check では動かさない。CI の diagnose-consistency ジョブが全件の環境変数（DIAGNOSE_PROPERTY_FULL・CONSISTENCY_API_FULL）で動かす",
    ci: true,
  },
  "temporal-unavailable-runtime": { reason: "no Temporal in this runtime", ci: true },
  "temporal-unavailable-browser": { reason: "no Temporal in this browser", ci: true },
  "no-release-tag": {
    reason: "no release tag readable with git (run git fetch --tags)",
    ci: false,
  },
};

const inCI = (): boolean => (process.env["CI"] ?? "") !== "" && process.env["CI"] !== "false";

/** 一覧を受け取って skipWhen・todoFor を作る（決まりそのものを、既知の不具合がない時期にも一覧を差し替えて確かめるため） */
export function createSkipPolicy(table: Readonly<Record<string, IntendedSkip>>): {
  skipWhen(id: string, active: boolean): string | false;
  todoFor(id: string): string;
} {
  /** 理由（id）が一覧にあり、飛ばし（skip）と既知の不具合（todo）を取り違えていないことを、CI かどうかにかかわらず確かめる */
  function entryOf(id: string, todo: boolean): IntendedSkip {
    const entry = table[id];
    if (entry === undefined)
      throw new Error(`意図した飛ばしの一覧（test/support/skip.ts）にない理由: ${id}`);
    if ((entry.todo ?? false) !== todo)
      throw new Error(`${id} は${todo ? "既知の不具合（todo）" : "飛ばし（skip）"}の理由ではない`);
    return entry;
  }
  /** CI では飛ばさない理由（ci: false）なら、CI で失敗にする */
  function checkCI(id: string, entry: IntendedSkip): void {
    if (inCI() && !entry.ci) throw new Error(`CI では飛ばさない理由: ${id}（${entry.reason}）`);
  }
  return {
    skipWhen(id, active) {
      const entry = entryOf(id, false);
      if (!active) return false;
      checkCI(id, entry);
      return entry.reason;
    },
    todoFor(id) {
      const entry = entryOf(id, true);
      checkCI(id, entry);
      return entry.reason;
    },
  };
}

const policy = createSkipPolicy(INTENDED_SKIPS);

/**
 * 決まりそのものを確かめる見本の一覧（test/skip-policy.test.ts だけが使う）。既知の不具合がない時期にも todo の扱いを
 * 確かめるため、3 つの種類（CI でも飛ばす・CI では飛ばさない・既知の不具合）を 1 つずつ持つ。テストのファイルに
 * todo: と書くと飛ばしの検査に当たるので、ここに置く
 */
export const POLICY_SAMPLE: Readonly<Record<string, IntendedSkip>> = {
  "sample-skip": { reason: "sample skip", ci: true },
  "sample-local-only": { reason: "sample local-only skip", ci: false },
  "sample-known-bug": { reason: "sample known bug", ci: true, todo: true },
};

/**
 * active なら飛ばす理由（node:test の skip に渡す）、そうでなければ false。理由（id）が一覧にあるかと、skip と todo の
 * 取り違えは、active にかかわらずいつも確かめる（打ち間違いを、飛ばす条件がそろう前に見つけるため。CI でなくても失敗）
 */
export const skipWhen = (id: string, active: boolean): string | false =>
  policy.skipWhen(id, active);

/**
 * 既知の不具合のテストの理由（node:test の todo に渡す）。一覧にない理由は、CI でなくても投げる（skipWhen と同じ）。
 * 既知の不具合を一覧に足すときは todo: true にする
 */
export const todoFor = (id: string): string => policy.todoFor(id);
