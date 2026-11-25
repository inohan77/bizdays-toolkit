// Omission and an explicit undefined are the same (decisions.md #6): checked for the options of methods and
// functions. The options of createCalendar / createSchedule (options, rules, specific dates, annual dates) are
// checked by transformation 7 of test/metamorphic.test.ts with the catalog options.
// The option types are read from etc/api.md, and an Options type missing in the table here fails (so that a new
// type does not silently drop out).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { withSubstituteDays } from "../src/provider/index.ts";
import { RENAMED_KEYS, type RenamedPlace } from "../src/core/renamed.ts";
import { jp } from "../src/jp/index.ts";

type Obj = Record<string, unknown>;

/** The outcome of a call (the error code when it throws) */
function outcome(call: () => unknown): string {
  try {
    return JSON.stringify(call());
  } catch (e) {
    if (!isBizdaysError(e)) throw e;
    return `error ${e.code}`;
  }
}

const calendar = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
const other = createCalendar({ holidayProvider: jp, closedWeekdays: [0] });
const schedule = createSchedule({
  holidayProvider: jp,
  weekdayValues: ["closed", "open", "open", "open", "open", "open", "closed"],
  holidayPolicy: { value: "closed" },
});
const opensOf = (c: { daysBetween(a: string, b: string): readonly { open: boolean }[] }) =>
  c.daysBetween("2026-12-25", "2027-01-10").map((d) => d.open);
const holidays = [
  { date: "2026-01-04", name: "X", nameEn: "X", kind: "regular", confirmed: true },
] as const;
const rename = () => ({ name: "振替", nameEn: "Substitute" });

/** Per option type: the call, the ways of writing tried (including old names), and the place of the old names */
const CASES: readonly {
  readonly type: string;
  readonly places: readonly RenamedPlace[];
  readonly bases: readonly Obj[];
  readonly call: (options: Obj) => unknown;
  /**
   * A type with neither an optional property nor an old name (listed only for the completeness of the table; it
   * is checked that nothing can be added)
   */
  readonly nothingToAdd?: true;
}[] = [
  {
    type: "AdjustOptions",
    places: [],
    nothingToAdd: true,
    bases: [{ convention: "modified-following" }],
    call: (o) => [
      calendar.adjust("2026-12-31", o as never),
      calendar.closingMonth("2026-12-31", 20, o as never),
      calendar.closingPeriod("2026-12", 20, o as never),
    ],
  },
  {
    type: "BusinessDayOnOrAfterOptions",
    places: [],
    bases: [{}],
    call: (o) => calendar.businessDayOnOrAfter("2026-11-03", o as never),
  },
  {
    type: "CalendarFromScheduleOptions",
    places: ["fromSchedule"],
    bases: [{}, { searchDayLimit: 30 }, { maxSearchDays: 30 }],
    call: (o) => opensOf(createCalendarFromSchedule(schedule, (v) => v === "open", o as never)),
  },
  {
    type: "CombineCalendarsOptions",
    places: ["combine"],
    bases: [{ open: "all" }, { open: "any", searchDayLimit: 30 }, { businessDay: "all" }],
    call: (o) => opensOf(combineCalendars([calendar, other], o as never)),
  },
  {
    type: "DiagnoseOptions",
    places: [],
    bases: [{}],
    call: (o) => [
      diagnoseCalendar({ holidayProvider: jp, closedDates: [{ date: "2026-01-05" }] }, o as never),
      diagnoseSchedule({ weekdayValues: [0, 1, 1, 1, 1, 1, 0] }, o as never),
    ],
  },
  {
    type: "DueDateOptions",
    places: ["dueDate"],
    bases: [
      { dayOfMonth: 31, convention: "preceding" },
      { day: 31, convention: "preceding" },
    ],
    call: (o) => calendar.dueDate("2027-01", o as never),
  },
  {
    type: "WithSubstituteDaysOptions",
    places: ["substitute"],
    bases: [
      { directions: { 0: "next" }, kind: "substitute" },
      {
        directions: { 0: "next" },
        kind: "substitute",
        renameSubstitute: rename,
        originalPolicy: "drop",
      },
      { rules: { 0: "next" }, kind: "substitute", name: rename, original: "drop" },
    ],
    call: (o) => withSubstituteDays([...holidays], o as never),
  },
];

/** The Options types of etc/api.md (without `type` aliases) and their properties */
function optionTypes(): Map<string, string[]> {
  const api = readFileSync(new URL("../etc/api.md", import.meta.url), "utf8");
  const out = new Map<string, string[]>();
  for (const m of api.matchAll(/^export interface (\w+Options)\b[^{]*\{\n([\s\S]*?)^\}/gm))
    out.set(
      m[1]!,
      [...m[2]!.matchAll(/^ {4}readonly (\w+)\??:/gm)].map((k) => k[1]!),
    );
  return out;
}

/** The option types checked by transformation 7 */
const COVERED_BY_METAMORPHIC = ["CalendarOptions", "ScheduleOptions", "HolidaySourceOptions"];

test("明示的な undefined: メソッド・関数のオプションの表は、etc/api.md の Options の型をすべて含む", () => {
  const types = [...optionTypes().keys()].filter((t) => !COVERED_BY_METAMORPHIC.includes(t));
  assert.deepEqual(
    [...types].sort(),
    CASES.map((c) => c.type).sort(),
    "表にない Options の型、または etc/api.md にない型",
  );
});

test("明示的な undefined: メソッド・関数のオプションに書いていない項目（旧名を含む）を undefined で書いても、結果が同じ", () => {
  const types = optionTypes();
  let tried = 0;
  for (const c of CASES) {
    const keys = [
      ...(types.get(c.type) ?? []),
      ...RENAMED_KEYS.filter((r) => c.places.includes(r.place)).map((r) => r.from),
    ];
    assert.ok(keys.length > 0, `${c.type}: 項目が読めない`);
    for (const base of c.bases) {
      const filled: Obj = { ...base };
      for (const key of keys) if (!Object.hasOwn(filled, key)) filled[key] = undefined;
      // Without an added property nothing was checked, which is allowed only for types listed so (nothingToAdd)
      assert.equal(
        Object.keys(filled).length === Object.keys(base).length,
        c.nothingToAdd === true,
        `${c.type} ${JSON.stringify(base)}: 足した項目の有無が表と違う`,
      );
      assert.equal(
        outcome(() => c.call(filled)),
        outcome(() => c.call(base)),
        `${c.type} ${JSON.stringify(base)}: 結果が変わった`,
      );
      tried++;
    }
  }
  console.log(`# 試した書き方: ${tried} 件`);
});
