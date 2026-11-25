/**
 * The days on which the promises of the option diagnostics are checked, and the definition of the days outside
 * the promise. The promise tests (test/diagnose-properties.test.ts and scripts/promise-inventory.ts) decide the
 * days they compare here only.
 *
 * The promises (decisions.md #31 and the guide, "Option diagnostics"), both about the days of the diagnostic
 * range (DIAGNOSTIC_YEARS of src/core/diagnose.ts):
 *   (1) removing all reported rules together (shadowed, never-matches, redundant, and out-of-range whose message
 *       ends with "so this rule is never used") does not change the result of a day that could be judged before
 *       the removal;
 *   (2) when no-business-day is reported, no day is a business day.
 * A day outside the promise is a day of the diagnostic range whose evaluation throws before the removal (its
 * result is "E:<code>" in resultsOf). It is not compared: it may be judged after the removal.
 * With asOf (the expired check), only the days from asOf on are compared: removing the expired items does not
 * change those days.
 *
 * The days are decided from DIAGNOSTIC_YEARS alone, never from the scan ranges of the diagnostics (rulesScanWindow
 * and the like): comparing only the days the diagnostics scan would miss, in the same way, what the diagnostics
 * miss outside them (RELEASING.md, "Checks that keep the promises of the diagnostics";
 * test/tools/promise-independence.test.ts checks the imports).
 */
import { DIAGNOSTIC_YEARS } from "../../src/core/diagnose.ts";

/** The first and the last day of the diagnostic range */
export const PROMISE_RANGE = Object.freeze({
  from: `${DIAGNOSTIC_YEARS.from}-01-01`,
  to: `${DIAGNOSTIC_YEARS.to}-12-31`,
});

const DAY = 86_400_000;
/** All days of the diagnostic range, built once ("YYYY-MM-DD"; the years have four digits) */
const ALL_DAYS: readonly string[] = (() => {
  const out: string[] = [];
  const to = Date.parse(`${PROMISE_RANGE.to}T00:00:00Z`);
  for (let t = Date.parse(`${PROMISE_RANGE.from}T00:00:00Z`); t <= to; t += DAY)
    out.push(new Date(t).toISOString().slice(0, 10));
  return Object.freeze(out);
})();

/**
 * The days on which the promises are checked.
 * @param asOf - With the expired check, the reference day: only the days from it on are returned.
 * @returns Every day of the diagnostic range (from asOf on), in order.
 */
export function promiseDays(asOf?: string): readonly string[] {
  return asOf === undefined ? ALL_DAYS : ALL_DAYS.filter((d) => d >= asOf);
}

/**
 * The result of every day: the text of what `judge` returns (canonical), or "E:<code>" on a day where it throws.
 * @param judge - Evaluates one day (isBusinessDay of a calendar, valueOn of a schedule).
 * @param days - The days, usually promiseDays().
 * @returns One string per day.
 */
export function resultsOf(judge: (day: string) => unknown, days: readonly string[]): string[] {
  return days.map((d) => {
    let value: unknown;
    try {
      value = judge(d);
    } catch (error) {
      return `E:${String((error as { code?: unknown } | null)?.code)}`;
    }
    return canonical(value);
  });
}

/** The numbers that stand for objects (other than arrays and plain objects), functions and symbols */
const identities = new WeakMap<object, number>();
const symbolIdentities = new Map<symbol, number>();
let nextIdentity = 0;
/**
 * The number that stands for one object, function or symbol (the same one each time it is asked for).
 * @param v - The object, function or symbol.
 * @returns Its number.
 */
function identityOf(v: object | symbol): number {
  const map = (typeof v === "symbol" ? symbolIdentities : identities) as Map<
    object | symbol,
    number
  >;
  let n = map.get(v);
  if (n === undefined) map.set(v, (n = nextIdentity++));
  return n;
}

/**
 * Whether an object is compared by content: an array, or an object whose prototype is Object.prototype or null
 * (the same objects as the diagnostics compare by content; sameValue of src/core/diagnose.ts).
 * @param v - The object.
 * @returns true for such objects.
 */
function byContent(v: object): boolean {
  if (Array.isArray(v)) return true;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * A text of a value, written without recursion, that tells apart every two values the diagnostics tell apart
 * (sameValue of src/core/diagnose.ts): primitives as by Object.is (-0 and 0, NaN and null, undefined and a missing
 * key are different), strings in JSON, arrays and plain objects by content (keys sorted), and other objects (such
 * as Date), functions and symbols by identity. An object held twice is written twice (the diagnostics compare
 * content, not sharing); an object inside itself is written as a reference to the depth at which it was entered.
 * For cycles this is finer than the diagnostics, which take two cycles as the same when no difference is found
 * (sameValueIn): two cycles of the same content with a different shape (one unrolled once) are written
 * differently. The promise checks make only objects that refer to themselves directly. A value whose reading throws (a getter or a proxy that throws) is written by the identity of the
 * value, so it equals only itself.
 * @param value - The value.
 * @returns The same text for values with the same content.
 */
export function canonical(value: unknown): string {
  try {
    return canonicalOf(value);
  } catch {
    return typeof value === "object" && value !== null
      ? `unreadable#${identityOf(value)}`
      : "unreadable";
  }
}

/**
 * The text of canonical, without the guard for values whose reading throws.
 * @param value - The value.
 * @returns The text.
 */
function canonicalOf(value: unknown): string {
  const out: string[] = [];
  /** The objects being written (an object inside itself) → the depth at which each was entered */
  const path = new Map<object, number>();
  const stack: ({ v: unknown } | { t: string } | { leave: object })[] = [{ v: value }];
  while (stack.length > 0) {
    const item = stack.pop()!;
    if ("t" in item) {
      out.push(item.t);
      continue;
    }
    if ("leave" in item) {
      path.delete(item.leave);
      continue;
    }
    const v = item.v;
    switch (typeof v) {
      case "string":
        out.push(JSON.stringify(v));
        continue;
      case "number":
        out.push(Object.is(v, -0) ? "-0" : String(v));
        continue;
      case "bigint":
        out.push(`${v}n`);
        continue;
      case "boolean":
      case "undefined":
        out.push(String(v));
        continue;
      case "symbol":
        out.push(`symbol#${identityOf(v)}`);
        continue;
      case "function":
        out.push(`function#${identityOf(v)}`);
        continue;
    }
    if (v === null) {
      out.push("null");
      continue;
    }
    const o = v as object;
    if (!byContent(o)) {
      out.push(`object#${identityOf(o)}`);
      continue;
    }
    if (path.has(o)) {
      out.push(`#${path.get(o)!}`);
      continue;
    }
    path.set(o, path.size);
    stack.push({ leave: o });
    if (Array.isArray(o)) {
      out.push("[");
      stack.push({ t: "]" });
      for (let i = o.length - 1; i >= 0; i--) {
        stack.push({ v: o[i] });
        if (i > 0) stack.push({ t: "," });
      }
    } else {
      const keys = Object.keys(o).sort();
      out.push("{");
      stack.push({ t: "}" });
      for (let i = keys.length - 1; i >= 0; i--) {
        stack.push({ v: (o as Record<string, unknown>)[keys[i]!] });
        stack.push({ t: `${i > 0 ? "," : ""}${JSON.stringify(keys[i])}:` });
      }
    }
  }
  return out.join("");
}

/**
 * Whether a day is outside the promise: its evaluation threw before the removal.
 * @param before - The result of the day before the removal (from resultsOf).
 * @returns true for "E:<code>".
 */
export const outsidePromise = (before: string): boolean => before.startsWith("E:");

/** What a removal changed on the days compared */
export interface RemovalDifference {
  /** Indexes of days inside the promise whose result changed to another value */
  readonly changed: readonly number[];
  /** Indexes of days inside the promise that throw after the removal */
  readonly throws: readonly number[];
  /** Days outside the promise whose result changed (allowed; counted to show that the case occurs) */
  readonly outside: number;
}

/**
 * Compares the results of the same days before and after removing the reported items.
 * @param before - Results before the removal (resultsOf).
 * @param after - Results after the removal, of the same days.
 * @returns The days that break promise (1) (changed, throws) and the number of changed days outside the promise.
 */
export function compareRemoval(
  before: readonly string[],
  after: readonly string[],
): RemovalDifference {
  const changed: number[] = [];
  const throws: number[] = [];
  let outside = 0;
  before.forEach((v, i) => {
    const w = after[i]!;
    if (v === w) return;
    if (outsidePromise(v)) outside++;
    else if (w.startsWith("E:")) throws.push(i);
    else changed.push(i);
  });
  return { changed, throws, outside };
}

/**
 * The paths of the items the diagnostics call removable together (promise (1)): array elements of the options
 * reported as shadowed, never-matches or redundant, or as out-of-range "so this rule is never used"; with asOf,
 * also expired.
 * @param list - The diagnostics.
 * @param withExpired - Whether expired items are removed too (the expired check with asOf).
 * @returns The distinct paths, such as "closedRecurringRules[2]".
 */
export function removablePaths(
  list: readonly { code: string; path: string; message: string }[],
  withExpired = false,
): string[] {
  const codes = ["shadowed", "never-matches", "redundant", ...(withExpired ? ["expired"] : [])];
  return [
    ...new Set(
      list
        .filter(
          (d) =>
            /^\w+\[\d+\]$/.test(d.path) &&
            (codes.includes(d.code) ||
              (d.code === "out-of-range" && d.message.includes("so this rule is never used"))),
        )
        .map((d) => d.path),
    ),
  ];
}

/**
 * The options without the items at some paths.
 * @param options - The options (not changed).
 * @param paths - Paths of array elements, such as "closedRecurringRules[2]".
 * @returns A copy in which those elements are removed from their arrays.
 */
export function removePaths(
  options: Record<string, unknown>,
  paths: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...options };
  const byKey = new Map<string, Set<number>>();
  for (const path of paths) {
    const m = /^(\w+)\[(\d+)\]$/.exec(path);
    if (!m) throw new Error(`unexpected path ${path}`);
    const set = byKey.get(m[1]!) ?? new Set<number>();
    set.add(Number(m[2]));
    byKey.set(m[1]!, set);
  }
  for (const [key, gone] of byKey)
    out[key] = (options[key] as unknown[]).filter((_, i) => !gone.has(i));
  return out;
}
