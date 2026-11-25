// The rule for skipping (T3 of the test expansion plan). A place that skips when a premise is missing (skip and
// todo of tests, SKIP lines of scripts) goes through these functions and takes its reason from the list of
// intended skips below. In CI (the environment variable CI is neither empty nor "false"), a reason missing in the
// list, or a skip whose reason is not skipped in CI (ci: false), fails. A skip that does not go through these
// functions is stopped by test/tools/skip-policy.test.ts.

export interface IntendedSkip {
  /** The reason shown in the output */
  readonly reason: string;
  /** Whether it may be skipped in CI too */
  readonly ci: boolean;
  /** Whether it is a test of a known issue (todo) */
  readonly todo?: boolean;
}

/** The list of intended skips. Ask for a decision before adding one (the quality checks of RELEASING.md) */
export const INTENDED_SKIPS: Readonly<Record<string, IntendedSkip>> = {
  "ci-full-only": {
    reason:
      "pnpm check では動かさない。CI の diagnose-consistency ジョブが全件の環境変数（DIAGNOSE_PROPERTY_FULL・CONSISTENCY_API_FULL）で動かす",
    ci: true,
  },
  "temporal-unavailable-runtime": { reason: "no Temporal in this runtime", ci: true },
  "temporal-unavailable-browser": { reason: "no Temporal in this browser", ci: true },
  "no-git": {
    reason:
      "not in a git work tree, so the Markdown files cannot be classified (run it in a clone)",
    ci: false,
  },
  "no-release-tag": {
    reason: "no release tag readable with git (run git fetch --tags)",
    ci: false,
  },
};

const inCI = (): boolean => (process.env["CI"] ?? "") !== "" && process.env["CI"] !== "false";

/**
 * Takes a list and builds skipWhen and todoFor (so that the rule itself can be checked with a substituted list
 * also at times without a known issue)
 */
export function createSkipPolicy(table: Readonly<Record<string, IntendedSkip>>): {
  skipWhen(id: string, active: boolean): string | false;
  todoFor(id: string): string;
} {
  /**
   * Checks, in CI or not, that the reason (id) is in the list and that a skip is not mistaken for a known issue
   * (todo) or vice versa
   */
  function entryOf(id: string, todo: boolean): IntendedSkip {
    const entry = table[id];
    if (entry === undefined)
      throw new Error(`意図した飛ばしの一覧（test/support/skip.ts）にない理由: ${id}`);
    if ((entry.todo ?? false) !== todo)
      throw new Error(`${id} は${todo ? "既知の不具合（todo）" : "飛ばし（skip）"}の理由ではない`);
    return entry;
  }
  /** A reason that is not skipped in CI (ci: false) fails in CI */
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
 * A sample list for checking the rule itself (used only by test/tools/skip-policy.test.ts). To check the
 * handling of todo also at times without a known issue, it has one of each of the three kinds (skipped in CI
 * too, not skipped in CI, known issue). Writing todo: in a test file would trigger the skip check, so it is here
 */
export const POLICY_SAMPLE: Readonly<Record<string, IntendedSkip>> = {
  "sample-skip": { reason: "sample skip", ci: true },
  "sample-local-only": { reason: "sample local-only skip", ci: false },
  "sample-known-bug": { reason: "sample known bug", ci: true, todo: true },
};

/**
 * The reason for skipping when `active` (passed to skip of node:test), otherwise false. Whether the reason (id)
 * is in the list, and a mix-up of skip and todo, are always checked whatever `active` is (to find a typo before
 * the condition for skipping is met; it fails outside CI too)
 */
export const skipWhen = (id: string, active: boolean): string | false =>
  policy.skipWhen(id, active);

/**
 * The reason of a test of a known issue (passed to todo of node:test). A reason missing in the list throws
 * outside CI too (as skipWhen).
 * A known issue added to the list has todo: true
 */
export const todoFor = (id: string): string => policy.todoFor(id);
