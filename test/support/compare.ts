/**
 * Helpers for laying out and comparing the results of all days (a place so that tests do not each keep the same
 * processing).
 *
 * - daysOf: all days of a period ("YYYY-MM-DD", both ends included)
 * - dayLine: the result of one day as one line (only `open`, or also reason, name and the original day of a move)
 * - linesOf: all days of a period of a calendar as dayLine lines (a day that throws is "E:<code>")
 * - removeItem: removes the item at a position such as "closedRecurringRules[2]" from options
 * - shiftDays, weekdayOfDay: add days to a date, the weekday of a date (so that tests need not write Date)
 *
 * The caller chooses the definition of the comparison (only `open`, or reasons too) with `full`. The comparison
 * of all properties in the metamorphic tests (test/metamorphic.test.ts), of the results of valueOn in the
 * consistency tests (test/consistency.test.ts) and of isBusinessDay and thrown-or-not in the fault-injection
 * tests (test/faulty-provider.test.ts) keep other promises and are not moved into these helpers
 */
import type { Obj } from "./catalog.ts";

/**
 * All days of a period (both ends included). Counted with Date.UTC from the date strings, so independent of the
 * runtime's time zone
 */
export function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Adds days to a date ("YYYY-MM-DD"; counted with Date.UTC, so independent of the runtime's time zone) */
export const shiftDays = (d: string, n: number): string =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The weekday of a date (0 is Sunday; computed in UTC, so independent of the runtime's time zone) */
export const weekdayOfDay = (d: string): number => new Date(`${d}T00:00:00Z`).getUTCDay();

/** The properties of a dayInfoOn result that are compared */
export interface DayLike {
  readonly open: boolean;
  readonly reason: string;
  readonly name?: string | undefined;
  readonly shiftedFrom?: string | undefined;
}

/**
 * The result of one day (with `full`, also reason, name and the original day of a move; the position is not
 * included because it shifts when an item is removed)
 */
export const dayLine = (d: DayLike, full: boolean): string =>
  full ? `${d.open}|${d.reason}|${d.name ?? ""}|${d.shiftedFrom ?? ""}` : String(d.open);

/** The results of all days of a period. A day that throws is "E:<code>" (so that e.g. outside the supported years can be compared) */
export function linesOf(
  calendar: { dayInfoOn(day: string): DayLike },
  days: readonly string[],
  full: boolean,
): string[] {
  return days.map((d) => {
    try {
      return dayLine(calendar.dayInfoOn(d), full);
    } catch (error) {
      return `E:${String((error as { code?: unknown } | null)?.code)}`;
    }
  });
}

/** The options without the item at the position "closedRecurringRules[2]" (only positions of array elements are accepted) */
export function removeItem(options: Obj, path: string): Obj {
  const m = /^(\w+)\[(\d+)\]$/.exec(path);
  if (!m) throw new Error(`unexpected path ${path}`);
  const key = m[1]!;
  const index = Number(m[2]);
  return { ...options, [key]: (options[key] as unknown[]).filter((_, i) => i !== index) };
}
