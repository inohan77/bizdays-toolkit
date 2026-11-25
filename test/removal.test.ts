import { DIAGNOSTIC_YEARS } from "../src/core/diagnose.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  createCalendar,
  createSchedule,
  isBizdaysError,
  type Calendar,
  type CalendarOptions,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { jp } from "../src/jp/index.ts";
import { sg } from "../src/sg/index.ts";
import { random } from "./support/catalog.ts";
import { holidayRun, holidaysOn } from "./support/provider.ts";
import { withoutStackTraces } from "./support/stack.ts";

// Removing together the items the diagnostics report as "removal changes no result / never used" (redundant,
// shadowed, never-matches) does not change the result of a day the original options could judge (decisions.md
// #31): checked for business calendars and schedules.
// The options centre on moves out of reach (decisions.md #24): 0.32.0 reported an item that decides the day after
// the run first as redundant, and removing it made the judgement of that day throw. The diagnostics oracle
// (test/diagnose-oracle.test.ts) uses a provider with short runs of holidays, so this is checked here

const CODE = "holiday-run-too-long";
const AFTER = { holidayOverlapPolicy: "after-holiday" } as const;
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return isBizdaysError(e) ? e.code : `not a bizdays error: ${String(e)}`;
  }
};
const brief = (list: readonly { severity: string; code: string; path: string }[]) =>
  list.map((d) => [d.severity, d.code, d.path]);

/** The codes with which the diagnostics say "removal changes no result / never used" */
const REMOVABLE = new Set(["redundant", "shadowed", "never-matches"]);
type Options = Record<string, unknown>;
type Reported = { readonly severity: string; readonly code: string; readonly path: string };
/** The diagnostics and the judgement of one day of what is checked (a business calendar or a schedule) */
interface Subject {
  readonly diagnose: (o: Options) => readonly Reported[];
  /** From options, builds the function that returns the result of one day */
  readonly judge: (o: Options) => (date: string) => unknown;
}
const CALENDAR: Subject = {
  diagnose: (o) => diagnoseCalendar(o as CalendarOptions),
  judge: (o) => {
    const calendar = createCalendar(o as CalendarOptions);
    return (date) => calendar.isBusinessDay(date);
  },
};
/** Makes a created calendar itself the subject of the judgement of one day (to find days on which a basis calendar throws) */
const CALENDAR_OBJECT = (calendar: Calendar): Subject => ({
  diagnose: () => [],
  judge: () => (date) => calendar.isBusinessDay(date),
});
const SCHEDULE: Subject = {
  diagnose: (o) => diagnoseSchedule(o as never),
  judge: (o) => {
    const schedule = createSchedule(o as never);
    return (date) => schedule.valueOn(date);
  },
};
/** The options without the items (elements of the options' arrays) the diagnostics reported as removable */
function withoutReported(o: Options, list: readonly Reported[]): Options {
  const drop = new Map<string, Set<number>>();
  for (const d of list) {
    const m = /^(\w+)\[(\d+)\]$/.exec(d.path);
    if (!REMOVABLE.has(d.code) || !m) continue;
    const set = drop.get(m[1]!) ?? new Set<number>();
    set.add(Number(m[2]));
    drop.set(m[1]!, set);
  }
  const out: Options = { ...o };
  for (const [key, indexes] of drop)
    out[key] = (o[key] as readonly unknown[]).filter((_, i) => !indexes.has(i));
  return out;
}
/**
 * The results of all days of a period (an error is "E:" plus its code). Only during the loop that calls day by
 * day, the recording of stacks is turned off (only the code is needed)
 */
function judgements(subject: Subject, o: Options, from: string, to: string): Map<string, string> {
  const judge = subject.judge(o);
  const out = new Map<string, string>();
  withoutStackTraces(() => {
    for (let date = from; date <= to; date = addDays(date, 1)) {
      try {
        out.set(date, JSON.stringify(judge(date)));
      } catch (e) {
        out.set(date, `E:${isBizdaysError(e) ? e.code : String(e)}`);
      }
    }
  });
  return out;
}
/**
 * The days whose result changed after the removal, among the days the original options could judge ("date:
 * before → after"). Days on which the original options threw are not compared
 */
function changedAfterRemoval(
  subject: Subject,
  o: Options,
  from: string,
  to: string,
  before = judgements(subject, o, from, to),
  list = subject.diagnose(o),
): string[] {
  // Without a removable item, the options after removal equal the original ones (not judged again)
  if (!list.some((d) => REMOVABLE.has(d.code))) return [];
  const after = judgements(subject, withoutReported(o, list), from, to);
  const changed: string[] = [];
  for (const [date, value] of before)
    if (!value.startsWith("E:") && after.get(date) !== value)
      changed.push(`${date}: ${value} → ${after.get(date)}`);
  return changed;
}

/** The keys that hold items (array elements) of the options. Completeness removes these elements one by one */
const ITEM_KEYS = [
  "closedDates",
  "openDates",
  "closedAnnualDates",
  "closedRecurringRules",
  "openRecurringRules",
] as const;
/**
 * Whether the results of the days the original options (before) could judge are the same in `after` (days on
 * which `before` threw are not compared; the scope of the promise of decision #31)
 */
const sameOnJudgeable = (before: Map<string, string>, after: Map<string, string>): boolean =>
  [...before].every(([date, value]) => value.startsWith("E:") || after.get(date) === value);
/**
 * Completeness: whether the options without the items reported as removable still have an item whose removal
 * does not change whether a day is a business day (the same definition as the completeness of the diagnostics
 * oracle; only business day or not is compared: comparing reasons too would count fewer items as removable and
 * hide misses). The items left are returned split into those with a known reason (known) and the others
 * (unknown).
 *
 * There is one kind of known: an annual date or recurring rule all of whose matching days are decided by
 * specific dates (extra business days, extra closed days). The diagnostics judge annual dates and recurring
 * rules on the options without specific dates (decisions.md #31), so a rule that changes a result once the
 * specific dates are left out is not reported as removable. Here it is recognised by "on the options without
 * specific dates, removing it changes a result".
 * In options with an nth-business-day rule the diagnostics keep the specific dates when judging (the same #31),
 * so this kind does not occur. Every item left in such options is unknown (a miss unrelated to specific dates
 * must not slip into known)
 *
 * wide (0.32.6): an item that looks removable within the supported years is also checked over a wider period
 * (independentWindow), and an item that changes a result there is not counted as removable (an annual date that
 * takes effect only outside the supported years of an "ignore" provider, ...; all days of the supported years
 * alone cannot tell)
 */
function leftRemovable(
  o: Options,
  from: string,
  to: string,
  wide?: readonly [string, string],
  list = CALENDAR.diagnose(o),
): { known: string[]; unknown: string[] } {
  const rest = withoutReported(o, list);
  const restOpen = judgements(CALENDAR, rest, from, to);
  const withoutDates = (x: Options): Options => ({ ...x, closedDates: [], openDates: [] });
  const countsBusinessDays = [...ITEM_KEYS].some((key) =>
    ((rest[key] as readonly Options[] | undefined) ?? []).some(
      (item) =>
        typeof item === "object" && ("businessDayOfMonth" in item || "businessDayOfWeek" in item),
    ),
  );
  let restWide: Map<string, string> | undefined;
  const known: string[] = [];
  const unknown: string[] = [];
  for (const key of ITEM_KEYS) {
    const list = (rest[key] as readonly unknown[] | undefined) ?? [];
    for (let i = 0; i < list.length; i++) {
      const smaller = { ...rest, [key]: list.filter((_, k) => k !== i) };
      if (!sameOnJudgeable(restOpen, judgements(CALENDAR, smaller, from, to))) continue;
      if (
        wide !== undefined &&
        !sameOnJudgeable(
          (restWide ??= judgements(CALENDAR, rest, ...wide)),
          judgements(CALENDAR, smaller, ...wide),
        )
      )
        continue;
      const hiddenByDates =
        !countsBusinessDays &&
        key !== "closedDates" &&
        key !== "openDates" &&
        !sameOnJudgeable(
          judgements(CALENDAR, withoutDates(rest), from, to),
          judgements(CALENDAR, withoutDates(smaller), from, to),
        );
      (hiddenByDates ? known : unknown).push(`${key}[${i}] ${JSON.stringify(list[i])}`);
    }
  }
  return { known, unknown };
}

test("取り除いて比べる: スタックの記録を止めるのは 1 日ずつ呼ぶ繰り返しの間だけで、抜けた後は（例外で抜けたときも）元に戻る", () => {
  const limit = Error.stackTraceLimit;
  const frames = (): number => (new Error("frames").stack ?? "").split("\n").length;
  assert.ok(limit > 0 && frames() > 1);
  assert.equal(
    withoutStackTraces(() => Error.stackTraceLimit),
    0,
  );
  assert.equal(Error.stackTraceLimit, limit);
  assert.throws(
    () =>
      withoutStackTraces(() => {
        throw new Error("thrown while stopped");
      }),
    /thrown while stopped/,
  );
  assert.equal(Error.stackTraceLimit, limit);
  // Judging a period whose days outside the supported years throw still gives the code as before, and an error
  // after leaving the loop has a stack
  const days = judgements(
    CALENDAR,
    { holidayProvider: holidaysOn([], { from: 2025, to: 2027 }) },
    "2024-12-30",
    "2025-01-02",
  );
  assert.deepEqual([...days.values()], ["E:out-of-range", "E:out-of-range", "true", "true"]);
  assert.equal(Error.stackTraceLimit, limit);
  assert.ok(frames() > 1);
});

test("取り除いて比べる（カレンダー）: 取り除くと明けた日の判定が例外になる項目を、redundant にしない（決まった設定）", () => {
  // 40 days of holidays from 2026-07-01. The rules of July 1 and 5 do not reach August 10 (a Monday), the day
  // after the run
  const lost = { dayOfMonth: [1, 5], months: [7], ...AFTER };
  const base = { holidayProvider: holidayRun(40), holidayPolicy: "open", closedWeekdays: [1] };
  // Items that decide the day after the run first (removing one lets the judgement go on to the stage of the
  // move out of reach and throw)
  const deciding: readonly (readonly [string, Options])[] = [
    ["臨時休業日", { closedDates: ["2026-08-10"], closedRecurringRules: [lost] }],
    ["臨時営業日", { openDates: ["2026-08-10"], closedRecurringRules: [lost] }],
    ["毎年の休業日", { closedAnnualDates: ["08-10"], closedRecurringRules: [lost] }],
    ["先に書いた毎週の規則", { closedRecurringRules: [{ weekday: 1 }, lost] }],
  ];
  for (const [label, extra] of deciding) {
    const o = { ...base, ...extra };
    // The original options can judge the day after the run
    assert.equal(
      codeOf(() => createCalendar(o as CalendarOptions).isBusinessDay("2026-08-10")),
      undefined,
      label,
    );
    assert.deepEqual(changedAfterRemoval(CALENDAR, o, "2026-06-01", "2026-09-30"), [], label);
  }
  // The diagnostics of options that throw once the extra closed day is removed (0.32.0 reported this extra closed
  // day as redundant)
  assert.deepEqual(brief(diagnoseCalendar({ ...base, ...deciding[0]![1] } as CalendarOptions)), []);
  // Control: an extra closed day on a day unrelated to the move out of reach (a Monday with Mondays closed) is
  // redundant as before
  const control = { ...base, closedDates: ["2026-08-17"], closedRecurringRules: [lost] };
  assert.deepEqual(brief(diagnoseCalendar(control as CalendarOptions)), [
    ["warning", CODE, "closedRecurringRules[0]"],
    ["info", "redundant", "closedDates[0]"],
  ]);
  assert.deepEqual(changedAfterRemoval(CALENDAR, control, "2026-06-01", "2026-09-30"), []);
});

test("取り除いて比べる（カレンダー）: 長く続く祝日のある決まった設定で、診断の出力・正しさ・完全性を確かめる", () => {
  // 40 days of holidays from 2026-07-01. The "after-holiday" rules of July 1 and 5 do not reach August 10 (a
  // Monday), the day after the run. Mondays are closed
  const lost = { dayOfMonth: [1, 5], months: [7], ...AFTER };
  const in2026 = { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" };
  const base = (days = 40): Options => ({
    holidayProvider: holidayRun(days),
    holidayPolicy: "open",
    closedWeekdays: [1],
  });
  const WARNING = ["warning", CODE, "closedRecurringRules[0]"];
  /**
   * Options, expected diagnostics, and the number of known items that are removable but not reported (known of
   * leftRemovable)
   */
  const cases: readonly (readonly [string, Options, readonly (readonly string[])[], number])[] = [
    // The direction left in 0.32.1: a rule all of whose matching days are inside the long run is reported as
    // redundant, and removing it turns the judgement of August 10 from an error into a value (following the
    // advice breaks nothing. decisions.md #31). When this direction is fixed, change this expectation
    [
      "届かない規則だけ（有効期間は 2026 年だけ）",
      { ...base(), closedRecurringRules: [{ ...lost, ...in2026 }] },
      [WARNING, ["info", "redundant", "closedRecurringRules[0]"]],
      0,
    ],
    // Control for the above: without an effective period the rule closes July 1 and 5 of other years, so it
    // cannot be removed
    ["届かない規則だけ（有効期間なし）", { ...base(), closedRecurringRules: [lost] }, [WARNING], 0],
    // Another item decides the day after the run first (the judgement does not throw, so there is no warning
    // either). 0.32.0 reported this item as redundant
    [
      "届かない規則 + 明けた日の臨時休業日",
      { ...base(), closedDates: ["2026-08-10"], closedRecurringRules: [lost] },
      [],
      0,
    ],
    [
      "届かない規則 + 明けた日の臨時営業日",
      { ...base(), openDates: ["2026-08-10"], closedRecurringRules: [lost] },
      [],
      0,
    ],
    [
      "届かない規則 + 明けた日に当たる毎年の休業日",
      { ...base(), closedAnnualDates: ["08-10"], closedRecurringRules: [lost] },
      [],
      0,
    ],
    [
      "先に書いた毎週の月曜の規則 + 届かない規則",
      { ...base(), closedRecurringRules: [{ weekday: 1 }, lost] },
      [],
      0,
    ],
    [
      "届かない規則 + 第 n 営業日の規則",
      { ...base(), closedRecurringRules: [lost, { businessDayOfMonth: 1 }] },
      [WARNING],
      0,
    ],
    [
      "届く振替だけ（31 日の連続）",
      { ...base(31), closedRecurringRules: [{ dayOfMonth: 1, months: [7], ...AFTER }] },
      [],
      0,
    ],
    [
      "土日を飛ばす届かない規則（7 月 6 日から 30 日の連続、7 月 4 日の規則）",
      {
        holidayProvider: holidayRun(30, "2026-07-06"),
        holidayPolicy: "open",
        closedWeekdays: [],
        closedRecurringRules: [{ dayOfMonth: 4, months: [7], skipWeekdays: [0, 6], ...AFTER }],
      },
      [WARNING],
      0,
    ],
    // A known item (unrelated to the long run): a rule all of whose matching days are opened by extra business
    // days. Removing it changes no result, but the diagnostics judge rules without specific dates and report
    // nothing (known of leftRemovable)
    [
      "2026 年 4 月 23 日だけを閉じる規則 + その日の臨時営業日（提供元なし）",
      {
        closedRecurringRules: [{ dayOfMonth: 23, months: [4], ...in2026 }],
        openDates: ["2026-04-23"],
      },
      [],
      1,
    ],
  ];
  for (const [label, o, expected, known] of cases) {
    assert.deepEqual(brief(CALENDAR.diagnose(o)), expected, label);
    // All days of the provider's supported years (a rule without an effective period also matches the same day
    // of other years)
    const [from, to] = ["2020-01-01", "2030-12-31"];
    assert.deepEqual(changedAfterRemoval(CALENDAR, o, from, to), [], label);
    const left = leftRemovable(o, from, to);
    assert.deepEqual(left.unknown, [], `取り除けるのに、診断が何も言わない項目がある: ${label}`);
    assert.equal(left.known.length, known, `${label}: ${JSON.stringify(left.known)}`);
  }
});

test("取り除いて比べる（カレンダー）: 対応年の端の日で、取り除くと判定が out-of-range になる項目を、redundant にしない", () => {
  // The supported years are 2025-2027. When a neighbouring day or the original day of a move that a rule looks
  // at lies outside them, the judgement is out-of-range (decisions.md #17), unless an earlier item decides the
  // day. The diagnostics up to 0.32.1 evaluated the outside of the supported years as without holidays, so they
  // reported the earlier item as redundant, and removing it made the judgement of the edge day throw
  const years = { from: 2025, to: 2027 };
  const provider = holidaysOn(["2025-05-05", "2026-05-05", "2027-05-05"], years);
  const [from, to] = ["2025-01-01", "2027-12-31"];
  const afterHoliday = { dayOfMonth: 8, months: [3], ...AFTER };
  const unreported: readonly (readonly [string, Options, string])[] = [
    // 2025-01-01 is a Wednesday. The later "after-holiday" rule looks at the day before (outside the supported
    // years) for the original day
    [
      "最初の日・先に書いた毎週の規則",
      {
        holidayProvider: provider,
        closedWeekdays: [3],
        closedRecurringRules: [{ weekday: 3 }, afterHoliday],
      },
      "2025-01-01",
    ],
    [
      "最初の日・臨時休業日",
      {
        holidayProvider: provider,
        closedWeekdays: [3],
        closedDates: ["2025-01-01"],
        closedRecurringRules: [afterHoliday],
      },
      "2025-01-01",
    ],
    // 2027-12-31 is a Friday. The day-before-holiday rule looks at the next day (outside the supported years)
    [
      "最後の日・祝前日の規則",
      {
        holidayProvider: provider,
        closedWeekdays: [5],
        closedRecurringRules: [{ weekday: 5 }, { dayBeforeHoliday: true }],
      },
      "2027-12-31",
    ],
    // An nth-business-day-of-week rule counts days outside the supported years in the edge week that sticks out
    // of them
    [
      "最初の日・週の第 n 営業日の規則",
      {
        holidayProvider: provider,
        closedWeekdays: [3],
        closedRecurringRules: [{ weekday: 3 }, { businessDayOfWeek: 1, weekStart: 1 }],
      },
      "2025-01-01",
    ],
  ];
  for (const [label, o, day] of unreported) {
    // The original options can judge the edge day
    assert.equal(
      codeOf(() => createCalendar(o as CalendarOptions).isBusinessDay(day)),
      undefined,
      label,
    );
    assert.deepEqual(
      CALENDAR.diagnose(o).filter((d) => REMOVABLE.has(d.code)),
      [],
      label,
    );
    assert.deepEqual(changedAfterRemoval(CALENDAR, o, from, to), [], label);
  }
  // Control: in options that treat the outside of the supported years as without holidays, the removal does not
  // throw, so it is redundant as before
  const ignoring = { ...unreported[0]![1], outOfRangePolicy: "ignore" };
  assert.deepEqual(brief(CALENDAR.diagnose(ignoring)), [
    ["info", "redundant", "closedRecurringRules[0]"],
  ]);
  assert.deepEqual(changedAfterRemoval(CALENDAR, ignoring, from, to), []);
});

test("取り除いて比べる（カレンダー）: 対応年の最初の日から祝日が続いても、作成できる設定の診断は error を返さない", () => {
  // The detection of a move out of reach goes back up to 367 days from the day after the run. When holidays last
  // from the first supported day, it looks beyond the start of the run, outside the supported years, so the
  // judgement of the day after the run is out-of-range (up to 366 days). With 367 days or more the limit of the
  // search is reached first and it is holiday-run-too-long. The options can be created in both cases, so the
  // diagnostics return no error (decisions.md #17)
  const years = { from: 2025, to: 2027 };
  // The effective period starts in June 2026, so that the rule does not match December 20 inside the run
  const rule = { dayOfMonth: 20, months: [12], effectiveFrom: "2026-06-01", ...AFTER };
  for (const [days, code, expected] of [
    [46, "out-of-range", []],
    [366, "out-of-range", []],
    [367, CODE, [["warning", CODE, "closedRecurringRules[0]"]]],
    [400, CODE, [["warning", CODE, "closedRecurringRules[0]"]]],
  ] as const) {
    const o: Options = {
      holidayProvider: holidayRun(days, "2025-01-01", "XX", years),
      holidayPolicy: "open",
      closedWeekdays: [],
      closedRecurringRules: [rule],
    };
    const landing = addDays("2025-01-01", days);
    assert.equal(
      codeOf(() => createCalendar(o as CalendarOptions).isBusinessDay(landing)),
      code,
      `${days} 日`,
    );
    assert.deepEqual(brief(CALENDAR.diagnose(o)), expected, `${days} 日`);
  }
});

test("取り除いて比べる（カレンダー）: 同梱の提供元でも、対応年の端の日に当たる項目は redundant に出ない", () => {
  // Japan (1955-2099): 1955-01-02 is a Sunday. The Monday "after-holiday" rule looks from New Year's Day (a
  // holiday) on the day before further back (outside the supported years). The weekly Sunday rule (duplicating
  // the closed weekday) decides this day, so removing it gives out-of-range. It could be removed on other days,
  // but one changed judgement is enough not to report redundant
  const monday = { weekday: 1, ...AFTER };
  const sunday: Options = {
    holidayProvider: jp,
    closedWeekdays: [0, 6],
    closedRecurringRules: [{ weekday: 0 }, monday],
  };
  assert.deepEqual(brief(CALENDAR.diagnose(sunday)), []);
  assert.equal(createCalendar(sunday as CalendarOptions).isBusinessDay("1955-01-02"), false);
  assert.equal(
    codeOf(() =>
      createCalendar({
        ...sunday,
        closedRecurringRules: [monday],
      } as CalendarOptions).isBusinessDay("1955-01-02"),
    ),
    "out-of-range",
  );
  // Control: the Saturday rule does not match the edge day and is redundant as before
  assert.deepEqual(
    brief(CALENDAR.diagnose({ ...sunday, closedRecurringRules: [{ weekday: 6 }, monday] })),
    [["info", "redundant", "closedRecurringRules[0]"]],
  );
  // Singapore (2020-2027): 2027-12-31 is a Friday. The day-before-holiday rule looks at the next day (outside
  // the supported years)
  const friday: Options = {
    holidayProvider: sg,
    closedWeekdays: [5],
    closedRecurringRules: [{ weekday: 5 }, { dayBeforeHoliday: true }],
  };
  assert.deepEqual(brief(CALENDAR.diagnose(friday)), []);
  assert.equal(
    codeOf(() =>
      createCalendar({
        ...friday,
        closedRecurringRules: [{ dayBeforeHoliday: true }],
      } as CalendarOptions).isBusinessDay("2027-12-31"),
    ),
    "out-of-range",
  );
});

/**
 * The period compared (T2 of the proposal. 0.32.6): the supported years plus 28 years before and after each
 * boundary taken directly from the options (the start of a rule's effective period and the day after its end,
 * the ends of the supported years of an "ignore" provider). The scan range of the diagnostics (rulesScanWindow)
 * is not used: comparing only the range the diagnostics use cannot catch mistakes outside it (the three families
 * of tests up to 0.32.5 could not catch the mistake of reporting as redundant a rule that takes effect only
 * outside an effective period).
 * Unless the provider is "ignore", every day outside the supported years throws (out-of-range) and there is no
 * day to compare, so only the supported years are returned.
 * The period is clipped to the diagnostic range (DIAGNOSTIC_YEARS of src/core/diagnose.ts): the diagnostics
 * speak about the days of that range only
 */
function independentWindow(
  o: Options,
  years: { readonly from: number; readonly to: number },
  ignore: boolean,
): [string, string] {
  const edges: number[] = [years.from, years.to];
  const yearOf = (date: string): number => Number(date.slice(0, 4));
  for (const value of Object.values(o))
    if (Array.isArray(value))
      for (const item of value)
        if (typeof item === "object" && item !== null) {
          const { effectiveFrom, effectiveTo } = item as {
            effectiveFrom?: string;
            effectiveTo?: string;
          };
          if (effectiveFrom !== undefined) edges.push(yearOf(effectiveFrom));
          if (effectiveTo !== undefined) edges.push(yearOf(addDays(effectiveTo, 1)));
        }
  const clip = (from: number, to: number): [string, string] => [
    `${Math.max(from, DIAGNOSTIC_YEARS.from)}-01-01`,
    `${Math.min(to, DIAGNOSTIC_YEARS.to)}-12-31`,
  ];
  if (!ignore) return clip(years.from, years.to);
  edges.push(years.from, years.to + 1);
  return clip(Math.min(...edges) - 28, Math.max(...edges) + 28);
}
/**
 * The days whose result changes, among those the original options could judge, when one item alone is removed
 * (the days on which the item takes effect; counts whether a form really occurred)
 */
function changedWithout(
  subject: Subject,
  o: Options,
  key: string,
  index: number,
  before: Map<string, string>,
): string[] {
  const dates = [...before.keys()];
  const smaller = { ...o, [key]: (o[key] as readonly unknown[]).filter((_, i) => i !== index) };
  const after = judgements(subject, smaller, dates[0]!, dates[dates.length - 1]!);
  return dates.filter(
    (date) => !before.get(date)!.startsWith("E:") && after.get(date) !== before.get(date),
  );
}
/**
 * The random generator of pairs of form A and form B (shared by the two random tests). `value` gives the values
 * of a schedule (undefined for calendars)
 */
function outsidePairs(
  next: () => number,
  int: (min: number, max: number) => number,
  years: { readonly from: number; readonly to: number },
  value: (() => string) | undefined,
) {
  // In a schedule both rules of a pair get the same value (inside the effective period the nth-week rule looks
  // removable)
  const shared = value === undefined ? {} : { value: value() };
  const v = (): Options => shared;
  // 20% use an "ignore" provider (the outside of the supported years can be judged as without holidays; the
  // compared period grows to about 60 years, hence 20% for the sake of time)
  const ignore = next() < 0.2;
  // 40% are a pair of form A: a weekly rule with an effective period and an nth-week rule of the same weekday
  // (taking effect only outside the effective period)
  const weekday = int(0, 6);
  const month = String(int(1, 12)).padStart(2, "0");
  const pairA =
    next() < 0.4
      ? [
          {
            weekday,
            ...(next() < 0.5
              ? { effectiveTo: `2026-${month}-28` }
              : { effectiveFrom: `2026-${month}-01` }),
            ...v(),
          },
          { weekday, nth: [1, 3], ...v() },
        ]
      : [];
  // Half of the "ignore" ones are a pair of form B: the same day of every November of the supported years is a
  // holiday, and the same month-day is written as an annual date (inside the supported years the holiday
  // decides, outside only the annual date)
  const day = `11-0${int(1, 9)}`;
  const pairB = ignore && next() < 0.5;
  const yearly: string[] = [];
  if (pairB) for (let y = years.from; y <= years.to; y++) yearly.push(`${y}-${day}`);
  return { ignore, pairA, pairB: pairB ? day : undefined, yearly };
}

test("取り除いて比べる（カレンダー）: 乱数で作った設定でも、診断が出した項目をまとめて取り除いて、判定できた日の結果が変わらない（種は固定）", () => {
  const next = random(20261115);
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const years = { from: 2025, to: 2027 };
  let removed = 0;
  let withLost = 0;
  let decidedAtLanding = 0;
  let hiddenByDates = 0;
  let edgeDecided = 0;
  let formA = 0;
  let formB = 0;
  const COUNTED = 10;
  for (let trial = 0; trial < 300; trial++) {
    // One or two blocks of holidays (the first of 32-40 days). The rule days are near the start of the first
    // block, a form in which moves out of reach occur easily
    const first = addDays("2026-03-01", int(0, 14));
    const dates: string[] = [];
    let day = first;
    for (let b = 0, blocks = int(1, 2); b < blocks; b++) {
      const length = b === 0 ? int(32, 40) : int(1, 20);
      for (let i = 0; i < length; i++) dates.push(addDays(day, i));
      day = addDays(day, length + int(1, 8));
    }
    const end = dates[dates.length - 1]!;
    // A day near the day after the run (1-8 days later). Specific dates and annual dates are added as items that
    // decide this day
    const near = (): string => addDays(end, int(1, 8));
    const candidates = [0, 1, 2, 3, 4, 5, 6].filter(() => next() < 0.2).slice(0, 2);
    const lost = {
      dayOfMonth: Number(addDays(first, int(0, 4)).slice(8)),
      months: [Number(first.slice(5, 7))],
      // 30% limit the effective period to the year of the run (the rule then matches only in that year, and the
      // form hidden by specific dates occurs)
      ...(next() < 0.3 ? { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" } : {}),
      ...(candidates.length > 0 ? { skipWeekdays: candidates } : {}),
      ...AFTER,
    };
    const weekly = { weekday: int(0, 6) };
    // 20% add a rule that closes one day of September 2026 only, and half of those open the same day with an
    // extra business day (a rule all of whose matching days are decided by specific dates; the diagnostics judge
    // rules without specific dates and do not report it as removable)
    const oneDay = next() < 0.2 ? `2026-09-${int(10, 20)}` : undefined;
    const oneDayRule =
      oneDay === undefined
        ? []
        : [
            {
              dayOfMonth: Number(oneDay.slice(8)),
              months: [9],
              effectiveFrom: "2026-01-01",
              effectiveTo: "2026-12-31",
            },
          ];
    const opened = oneDay !== undefined && next() < 0.5 ? [oneDay] : [];
    // 30% put extra business days on edge days of the supported years (one of the first 3 and of the last 3
    // days), and half of those add a day-before-holiday rule. The judgement of an edge day is out-of-range when
    // a rule looks at a neighbouring day or original day outside the supported years, unless an extra business
    // day decides it first
    const edgeDates = next() < 0.3 ? [`2025-01-0${int(1, 3)}`, `2027-12-${int(29, 31)}`] : [];
    const beforeHoliday = edgeDates.length > 0 && next() < 0.5 ? [{ dayBeforeHoliday: true }] : [];
    const outside = outsidePairs(next, int, years, undefined);
    const o: Options = {
      holidayProvider: holidaysOn([...dates, ...outside.yearly], years),
      ...(outside.ignore ? { outOfRangePolicy: "ignore" } : {}),
      holidayPolicy: next() < 0.5 ? "open" : "closed",
      closedWeekdays: [0, 1, 2, 3, 4, 5, 6].filter(() => next() < 0.25),
      closedRecurringRules: [
        ...(next() < 0.5 ? [lost] : next() < 0.5 ? [weekly, lost] : [lost, weekly]),
        ...oneDayRule,
        // 40% add an nth-business-day rule (the scan that finds which rule decided a day judges every day of the
        // month of the day after the run; if this scan did not handle the move out of reach, the diagnostics
        // would return an error)
        ...(next() < 0.4 ? [{ businessDayOfMonth: [1, 2, -1][int(0, 2)]! }] : []),
        ...beforeHoliday,
        ...outside.pairA,
      ],
      ...(next() < 0.5 ? { closedDates: [near(), ...(next() < 0.3 ? [near()] : [])] } : {}),
      ...(next() < 0.3 || opened.length > 0 || edgeDates.length > 0
        ? { openDates: [...(next() < 0.3 ? [near()] : []), ...opened, ...edgeDates] }
        : {}),
      ...(next() < 0.3 || outside.pairB !== undefined
        ? {
            closedAnnualDates: [
              ...(next() < 0.3 ? [near().slice(5)] : []),
              ...(outside.pairB !== undefined ? [outside.pairB] : []),
            ],
          }
        : {}),
    };
    // Options with the same day as both an extra business day and an extra closed day pass as they are (the
    // extra business day, which comes first, decides)
    const list = diagnoseCalendar(o as CalendarOptions);
    const context = `試行 ${trial}: ${JSON.stringify({ ...o, holidayProvider: [dates[0], dates.length] })}`;
    assert.deepEqual(
      list.filter((d) => d.severity === "error"),
      [],
      context,
    );
    // Before and after the removal are compared on all days of the supported years plus 28 years around each
    // boundary (independentWindow). Completeness is checked on all days of the supported years (annual dates and
    // rules without an effective period match other years too; the rule of one September day is included)
    const [from, to] = [`${years.from}-01-01`, `${years.to}-12-31`];
    const [wideFrom, wideTo] = independentWindow(o, years, outside.ignore);
    const wide = judgements(CALENDAR, o, wideFrom, wideTo);
    assert.deepEqual(changedAfterRemoval(CALENDAR, o, wideFrom, wideTo, wide, list), [], context);
    const before = new Map([...wide].filter(([date]) => date >= from && date <= to));
    // Form A: removing the nth-week rule changes only days outside the effective period of the weekly rule. Form
    // B: removing the annual date changes only days outside the supported years
    const rules = o["closedRecurringRules"] as readonly Options[];
    // At most COUNTED of each are counted (counting judges the options without one item again over the wide
    // period; it is enough to see that the count is not 0)
    if (outside.pairA.length > 0 && formA < COUNTED) {
      const [weekly] = outside.pairA as unknown as [
        { effectiveFrom?: string; effectiveTo?: string },
      ];
      const inside = (date: string): boolean =>
        (weekly.effectiveFrom === undefined || date >= weekly.effectiveFrom) &&
        (weekly.effectiveTo === undefined || date <= weekly.effectiveTo);
      const changed = changedWithout(CALENDAR, o, "closedRecurringRules", rules.length - 1, wide);
      if (changed.length > 0 && !changed.some(inside)) formA++;
    }
    if (outside.pairB !== undefined && formB < COUNTED) {
      const annual = o["closedAnnualDates"] as readonly string[];
      const changed = changedWithout(CALENDAR, o, "closedAnnualDates", annual.length - 1, wide);
      if (changed.length > 0 && changed.every((date) => date < from || date > to)) formB++;
    }
    const left = leftRemovable(o, from, to, outside.ignore ? [wideFrom, wideTo] : undefined, list);
    assert.deepEqual(left.unknown, [], `取り除けるのに、診断が何も言わない項目がある。${context}`);
    if (left.known.length > 0) hiddenByDates++;
    if (list.some((d) => REMOVABLE.has(d.code))) removed++;
    if ([...before.values()].includes(`E:${CODE}`)) withLost++;
    // Options that the original can judge and that throw for a move out of reach once specific dates and annual
    // dates are left out (the form 0.32.0 missed)
    const bare = judgements(
      CALENDAR,
      { ...o, closedDates: [], openDates: [], closedAnnualDates: [] },
      from,
      to,
    );
    if ([...bare].some(([date, v]) => v === `E:${CODE}` && !before.get(date)!.startsWith("E:")))
      decidedAtLanding++;
    // Options with a day that the original can judge and that is out-of-range once specific dates are left out
    // (an edge of the supported years; the form 0.32.1 missed)
    if (
      [...bare].some(([date, v]) => v === "E:out-of-range" && !before.get(date)!.startsWith("E:"))
    )
      edgeDecided++;
  }
  console.log(
    `# 取り除いて比べる（カレンダー）: 300 件（取り除ける項目が出た ${removed}、判定が投げる日がある ${withLost}、明けた日を個別の日付・毎年の月日が決めている ${decidedAtLanding}、個別の日付に隠れて診断が出さない規則がある ${hiddenByDates}、対応年の端の日を個別の日付が決めている ${edgeDecided}、有効期間の外側だけで効く規則がある（形 A） ${formA}、"ignore" の提供元の対応年の外だけで効く毎年の月日がある（形 B） ${formB}。形 A・B は ${COUNTED} 件まで数える）`,
  );
  assert.ok(
    removed > 0 &&
      withLost > 0 &&
      decidedAtLanding > 0 &&
      hiddenByDates > 0 &&
      edgeDecided > 0 &&
      formA > 0 &&
      formB > 0,
  );
});

test("取り除いて比べる（スケジュール）: 取り除くと明けた日の値が例外になる項目を、redundant にしない（決まった設定）", () => {
  // 40 days of holidays from 2026-07-01. The rules of July 1 and 5 do not reach August 10, the day after the
  // run. The value of every weekday is "w"
  const lost = { dayOfMonth: [1, 5], months: [7], value: "x", ...AFTER };
  const base = {
    holidayProvider: holidayRun(40),
    weekdayValues: ["w", "w", "w", "w", "w", "w", "w"],
  };
  // Items that decide the day after the run first (the same value as the weekday's, so they could be removed if
  // there were no move out of reach)
  const deciding: readonly (readonly [string, Options])[] = [
    ["個別の日付", { dates: [{ date: "2026-08-10", value: "w" }], recurringRules: [lost] }],
    ["毎年の月日", { annualDates: [{ date: "08-10", value: "w" }], recurringRules: [lost] }],
    ["先に書いた毎週の規則", { recurringRules: [{ weekday: 1, value: "w" }, lost] }],
  ];
  for (const [label, extra] of deciding) {
    const o = { ...base, ...extra };
    assert.equal(
      codeOf(() => createSchedule(o as never).valueOn("2026-08-10")),
      undefined,
      label,
    );
    assert.deepEqual(changedAfterRemoval(SCHEDULE, o, "2026-06-01", "2026-09-30"), [], label);
    assert.deepEqual(
      diagnoseSchedule(o as never).filter((d) => d.severity === "error"),
      [],
      label,
    );
  }
  // Control: a specific date on a day unrelated to the move out of reach is redundant as before
  const control = {
    ...base,
    dates: [{ date: "2026-08-17", value: "w" }],
    recurringRules: [lost],
  };
  assert.deepEqual(brief(diagnoseSchedule(control as never)), [
    ["warning", CODE, "recurringRules[0]"],
    ["info", "redundant", "dates[0]"],
  ]);
  assert.deepEqual(changedAfterRemoval(SCHEDULE, control, "2026-06-01", "2026-09-30"), []);
});

test("取り除いて比べる（スケジュール）: 乱数で作った設定でも、診断が出した項目をまとめて取り除いて、値を返した日の結果が変わらない（種は固定）", () => {
  const next = random(20261116);
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = (): string => ["a", "b", "c"][int(0, 2)]!;
  const years = { from: 2025, to: 2027 };
  // How often the sequences meant to be exercised really occurred (not how many options were built for them; 0
  // fails)
  const seen = {
    /** The diagnostics reported a removable item */
    removed: 0,
    /** A day whose value is the error of a move out of reach exists */
    withLost: 0,
    /** There is an nth-business-day rule and its basis calendar (no move out of reach) can judge every day */
    nthWithPlainBasis: 0,
    /** There is an nth-business-day rule and its basis calendar throws a move out of reach within the compared period */
    nthWithThrowingBasis: 0,
    /** There is an nth-business-day rule and its basis calendar has another provider */
    nthWithOtherBasis: 0,
    /** There is a rule that takes effect only outside an effective period (form A; counted up to COUNTED) */
    formA: 0,
    /**
     * There is an annual date that takes effect only outside the supported years of an "ignore" provider (form B;
     * counted up to COUNTED)
     */
    formB: 0,
    /**
     * A day on which the original options return a value and which throws a move out of reach once specific dates
     * and annual dates are left out (the form 0.32.0 missed)
     */
    decidedAtLanding: 0,
    /**
     * An edge day of the supported years on which the original options return a value and which is out-of-range
     * once specific dates are left out (the form 0.32.1 missed)
     */
    edgeDecided: 0,
  };
  const TRIALS = 240;
  const COUNTED = 10;
  for (let trial = 0; trial < TRIALS; trial++) {
    // One or two blocks of holidays (the first of 32-40 days). The rule days are near the start of the first block
    const first = addDays("2026-03-01", int(0, 14));
    const dates: string[] = [];
    let day = first;
    for (let b = 0, blocks = int(1, 2); b < blocks; b++) {
      const length = b === 0 ? int(32, 40) : int(1, 20);
      for (let i = 0; i < length; i++) dates.push(addDays(day, i));
      day = addDays(day, length + int(1, 8));
    }
    const end = dates[dates.length - 1]!;
    const near = (): string => addDays(end, int(1, 8));
    const outside = outsidePairs(next, int, years, pick);
    const provider = holidaysOn([...dates, ...outside.yearly], years);
    const candidates = [0, 1, 2, 3, 4, 5, 6].filter(() => next() < 0.2).slice(0, 2);
    const lostDay = Number(addDays(first, int(0, 4)).slice(8));
    const lostMonths = [Number(first.slice(5, 7))];
    const lost = {
      dayOfMonth: lostDay,
      months: lostMonths,
      value: pick(),
      ...(candidates.length > 0 ? { skipWeekdays: candidates } : {}),
      ...AFTER,
    };
    const weekly = { weekday: int(0, 6), value: pick() };
    // The basis calendar of the nth-business-day rule (required in a schedule): one without a move out of reach,
    // one whose judgement of the day after the run throws, one with another provider
    const basisKind = int(0, 2);
    const basis: Calendar =
      basisKind === 0
        ? createCalendar({ closedWeekdays: [0, 6] })
        : basisKind === 1
          ? createCalendar({
              holidayProvider: provider,
              holidayPolicy: "open",
              closedWeekdays: [],
              closedRecurringRules: [{ dayOfMonth: lostDay, months: lostMonths, ...AFTER }],
            } as CalendarOptions)
          : createCalendar({
              holidayProvider: holidayRun(3, "2026-05-01", "YY", years),
              closedWeekdays: [0],
            });
    const nth =
      next() < 0.6
        ? [{ businessDayOfMonth: [1, 2, -1][int(0, 2)]!, calendar: basis, value: pick() }]
        : [];
    // A pair of form B makes the holiday value "h" (inside the supported years the holiday decides the same
    // value as the annual date)
    const policy = outside.pairB !== undefined ? 2 : int(0, 3);
    // 30% put specific dates on edge days of the supported years (one of the first 3 and of the last 3 days) (with
    // the weekday's value they look removable; when a later "after-holiday" rule looks at the day before,
    // outside the supported years, the value of the edge day is out-of-range)
    const edgeDates = next() < 0.3 ? [`2025-01-0${int(1, 3)}`, `2027-12-${int(29, 31)}`] : [];
    const withDates = next() < 0.5;
    const withAnnual = next() < 0.3;
    const o: Options = {
      holidayProvider: provider,
      ...(outside.ignore ? { outOfRangePolicy: "ignore" } : {}),
      weekdayValues: Array.from({ length: 7 }, pick),
      ...(policy === 1
        ? { holidayPolicy: "ignore" }
        : policy === 2
          ? { holidayPolicy: { value: "h" } }
          : policy === 3
            ? { holidayPolicy: { sameAs: int(0, 6) } }
            : {}),
      recurringRules: [
        ...(next() < 0.5 ? [lost] : next() < 0.5 ? [weekly, lost] : [lost, weekly]),
        ...nth,
        ...outside.pairA,
      ],
      ...(withDates || edgeDates.length > 0
        ? {
            dates: [
              ...(withDates ? [{ date: near(), value: pick() }] : []),
              ...edgeDates.map((date) => ({ date, value: pick() })),
            ],
          }
        : {}),
      ...(withAnnual || outside.pairB !== undefined
        ? {
            annualDates: [
              ...(withAnnual ? [{ date: near().slice(5), value: pick() }] : []),
              ...(outside.pairB !== undefined ? [{ date: outside.pairB, value: "h" }] : []),
            ],
          }
        : {}),
    };
    const describe = {
      ...o,
      holidayProvider: [dates[0], dates.length],
      recurringRules: (o["recurringRules"] as Options[]).map((r) =>
        "calendar" in r ? { ...r, calendar: `basis ${basisKind}` } : r,
      ),
    };
    const context = `試行 ${trial}: ${JSON.stringify(describe)}`;
    const list = SCHEDULE.diagnose(o);
    assert.deepEqual(
      list.filter((d) => d.severity === "error"),
      [],
      context,
    );
    // All days of the supported years plus 28 years around each boundary are compared (independentWindow; annual
    // dates match other years too)
    const [from, to] = [`${years.from}-01-01`, `${years.to}-12-31`];
    const [wideFrom, wideTo] = independentWindow(o, years, outside.ignore);
    const wide = judgements(SCHEDULE, o, wideFrom, wideTo);
    assert.deepEqual(changedAfterRemoval(SCHEDULE, o, wideFrom, wideTo, wide, list), [], context);
    const before = new Map([...wide].filter(([date]) => date >= from && date <= to));
    const rules = o["recurringRules"] as readonly Options[];
    if (outside.pairA.length > 0 && seen.formA < COUNTED) {
      const [weekly] = outside.pairA as unknown as [
        { effectiveFrom?: string; effectiveTo?: string },
      ];
      const inside = (date: string): boolean =>
        (weekly.effectiveFrom === undefined || date >= weekly.effectiveFrom) &&
        (weekly.effectiveTo === undefined || date <= weekly.effectiveTo);
      const changed = changedWithout(SCHEDULE, o, "recurringRules", rules.length - 1, wide);
      if (changed.length > 0 && !changed.some(inside)) seen.formA++;
    }
    if (outside.pairB !== undefined && seen.formB < COUNTED) {
      const annual = o["annualDates"] as readonly unknown[];
      const changed = changedWithout(SCHEDULE, o, "annualDates", annual.length - 1, wide);
      if (changed.length > 0 && changed.every((date) => date < from || date > to)) seen.formB++;
    }
    if (list.some((d) => REMOVABLE.has(d.code))) seen.removed++;
    if ([...before.values()].includes(`E:${CODE}`)) seen.withLost++;
    if (nth.length > 0) {
      // Whether the basis calendar really throws within the compared period (even when built so that the day
      // after the run throws, it does not when a rule day is within reach)
      const basisThrows = [...judgements(CALENDAR_OBJECT(basis), {}, from, to).values()].includes(
        `E:${CODE}`,
      );
      if (basisKind === 0) seen.nthWithPlainBasis++;
      else if (basisKind === 2) seen.nthWithOtherBasis++;
      else if (basisThrows) seen.nthWithThrowingBasis++;
    }
    const bare = judgements(SCHEDULE, { ...o, dates: [], annualDates: [] }, from, to);
    if ([...bare].some(([date, v]) => v === `E:${CODE}` && !before.get(date)!.startsWith("E:")))
      seen.decidedAtLanding++;
    if (
      [...bare].some(([date, v]) => v === "E:out-of-range" && !before.get(date)!.startsWith("E:"))
    )
      seen.edgeDecided++;
  }
  console.log(
    `# 取り除いて比べる（スケジュール）: ${TRIALS} 件（取り除ける項目が出た ${seen.removed}、値が例外になる日がある ${seen.withLost}、第 n 営業日の規則の基準: 届かない振替なし ${seen.nthWithPlainBasis}・実際に例外を投げる ${seen.nthWithThrowingBasis}・別の提供元 ${seen.nthWithOtherBasis}、明けた日を個別の日付・毎年の月日が決めている ${seen.decidedAtLanding}、対応年の端の日を個別の日付が決めている ${seen.edgeDecided}、有効期間の外側だけで効く規則がある（形 A） ${seen.formA}、"ignore" の提供元の対応年の外だけで効く毎年の月日がある（形 B） ${seen.formB}。形 A・B は ${COUNTED} 件まで数える）`,
  );
  for (const [name, count] of Object.entries(seen)) assert.ok(count > 0, `${name} が 0 件`);
});
