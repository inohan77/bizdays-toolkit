// 省略と明示的な undefined は同じ（decisions.md の 6 番）を、メソッド・関数のオプションで確かめる。設定（createCalendar・
// createSchedule の設定・規則・個別の日付・毎年の月日）は test/metamorphic.test.ts の変形 7 が目録の設定で確かめる。
// オプションの型は etc/api.md から読み、ここの表にない Options の型があれば失敗にする（型を足したときに黙って外れないため）。
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

/** 呼び出しの結果（投げればエラーコード） */
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

/** オプションの型ごとに、呼び出しと、試す書き方（旧名を含む）と、旧名を引く場所 */
const CASES: readonly {
  readonly type: string;
  readonly places: readonly RenamedPlace[];
  readonly bases: readonly Obj[];
  readonly call: (options: Obj) => unknown;
  /** 省略できる項目も旧名もない型（表の完全性のためだけに載せる。足す項目がないことを確かめる） */
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

/** etc/api.md の Options の型（別名の type を除く）と、その項目 */
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

/** 設定の型は変形 7 が確かめる */
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
      // 足した項目がなければ何も確かめていないので、そう載せた型（nothingToAdd）だけに許す
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
