// Helpers shared by the unit tests of src/core/diagnose.ts: providers, compiled options and the context of the
// rule diagnostics
import assert from "node:assert/strict";
import { createRuleContext, type RuleContext } from "../../../src/core/diagnose.ts";
import { IssueCollector } from "../../../src/core/errors.ts";
import {
  compileRecurringRule,
  compileScheduleOptions,
  dateOfDayNumber,
  dayNumberOf,
  RECURRING_RULE_KEYS,
  type CompiledSchedule,
} from "../../../src/core/schedule.ts";
import type { Holiday, HolidayProvider } from "../../../src/core/types.ts";

export type Week = [unknown, unknown, unknown, unknown, unknown, unknown, unknown];
/** Weekday values of a schedule: the name of each weekday */
export const WEEK: Week = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
/** Weekday values of a calendar that is closed on Saturday and Sunday */
export const OPEN_WEEK: Week = [false, true, true, true, true, true, false];
export const day = dayNumberOf;

export const holiday = (date: string, extra: Partial<Holiday<string>> = {}): Holiday<string> => ({
  date,
  name: `N ${date}`,
  nameEn: `E ${date}`,
  kind: "regular",
  confirmed: true,
  ...extra,
});

/** A provider that returns the holidays of the list that are in the asked year */
export const provider = (
  id: string,
  from: number,
  to: number,
  list: readonly Holiday<string>[] = [],
  extra: Record<string, unknown> = {},
): HolidayProvider<string> =>
  ({
    id,
    timeZone: "UTC",
    supportedYears: { from, to },
    dataVersion: "1",
    holidaysInYear: (year: number) => list.filter((h) => h.date.startsWith(`${year}-`)),
    ...extra,
  }) as unknown as HolidayProvider<string>;

/** Holidays on consecutive days */
export const holidayRun = (from: string, length: number): Holiday<string>[] =>
  Array.from({ length }, (_, i) => holiday(dateOfDayNumber(day(from) + i)));

/** Compiled valid schedule options (weekdayValues default to the names of the weekdays) */
export function compiledOf(options: Record<string, unknown>): CompiledSchedule<unknown, string> {
  const c = new IssueCollector();
  const compiled = compileScheduleOptions<unknown, string>(c, { weekdayValues: WEEK, ...options })!;
  assert.deepEqual(
    c.issues.filter((i) => i.severity === "error"),
    [],
  );
  return compiled;
}

/**
 * Compiled options of a business calendar: boolean values (closed on Saturday and Sunday by default) and
 * recurring rules compiled as those of a calendar, so that nth-business-day rules count the options' own
 * business days. An entry's `value` (default false) is the value of the rule; its path is
 * `closedRecurringRules[i]`
 */
export function calendarOf(
  options: Record<string, unknown>,
  ...entries: Record<string, unknown>[]
): CompiledSchedule<unknown, string> {
  const c = new IssueCollector();
  const base = compiledOf({ weekdayValues: OPEN_WEEK, ...options });
  const recurring = entries.map(({ value = false, ...entry }, i) => {
    const path = `closedRecurringRules[${i}]`;
    return compileRecurringRule(
      c,
      path,
      path,
      entry,
      () => ({ value }),
      RECURRING_RULE_KEYS,
      "calendar",
      "none",
    )!;
  });
  assert.deepEqual(c.issues, []);
  return { ...base, recurring };
}

/** The context of the rule diagnostics of compiled options, with a new collector */
export const contextOf = (
  compiled: CompiledSchedule<unknown, string>,
  unsure?: (code: string, path: string) => boolean,
): RuleContext<unknown, string> => createRuleContext(new IssueCollector(), compiled, unsure);

/** The issues of a context as "severity code path" and, when present, " <- relatedPath" */
export const issuesOf = (ctx: { readonly c: IssueCollector }): string[] =>
  ctx.c.issues.map(
    (i) =>
      `${i.severity} ${i.code} ${i.path}${i.relatedPath === undefined ? "" : ` <- ${i.relatedPath}`}`,
  );

/** The paths of the rules in the set of unused rules, sorted */
export const unusedOf = (ctx: RuleContext<unknown, string>): string[] =>
  [...ctx.unused].map((r) => r.path).sort();
