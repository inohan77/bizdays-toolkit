// The old name "national" of kinds in a union of the Japanese provider with other providers (docs/decisions.md
// #10).
// The main check is the relation to options that wrap the Japanese provider and replace its kinds (independent
// of holiday data, so reflecting new data does not break it).
// The anchor is a fixture made with the published 0.22.2 (the meaning of 0.22.x is the authority; confirmed
// years only). When a data patch version changes past holidays in the anchor's range (a change in the law, a
// special holiday), it cannot be rebuilt with 0.22.2, so the affected dates are taken out of the anchor and
// recorded in the development log (docs/development-log.md)
import assert from "node:assert/strict";
import { daysOf } from "./support/compare.ts";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createCalendar,
  createSchedule,
  type CalendarOptions,
  type HolidayProvider,
  type ScheduleOptions,
} from "../src/index.ts";
import { diagnoseCalendar, migrateCalendarOptions } from "../src/diagnose/index.ts";
import { jp } from "../src/jp/index.ts";
import { sg } from "../src/sg/index.ts";
import { england } from "../src/uk/index.ts";

interface Case {
  readonly name: string;
  readonly providers: readonly string[];
  readonly options: Record<string, unknown>;
  readonly closedDates?: readonly string[];
  readonly zeroDates?: readonly string[];
}
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/national-union-0.22.2.json", import.meta.url), "utf8"),
) as { from: string; to: string; cases: readonly Case[] };

const other: HolidayProvider = {
  id: "XX",
  timeZone: "Asia/Tokyo",
  supportedYears: { from: 2000, to: 2099 },
  dataVersion: "test",
  holidaysInYear: (y) => [
    { date: `${y}-06-10`, name: "X", nameEn: "X national", kind: "national", confirmed: true },
    { date: `${y}-08-11`, name: "Y", nameEn: "Y regular", kind: "regular", confirmed: true },
  ],
};
/**
 * The way to write it from 1.0.0: wrap the Japanese provider and give the annual holidays another kind (the ID
 * stays "JP")
 */
const jpOnly: HolidayProvider<string> = {
  ...jp,
  holidaysInYear: (year) =>
    jp.holidaysInYear(year).map((h) => (h.kind === "regular" ? { ...h, kind: "jp-regular" } : h)),
};
const providers: Record<string, HolidayProvider> = { jp, england, other };

const closedDays = (options: object, days: readonly string[]): string[] => {
  const calendar = createCalendar({ timeZone: "Asia/Tokyo", ...options } as CalendarOptions);
  return days.filter((d) => !calendar.isBusinessDay(d));
};

// --- Anchor: the same as the results of 0.22.2 ---

const anchorDays = daysOf(fixture.from, fixture.to);
for (const c of fixture.cases) {
  test(`和集合の "national" は 0.22.2 と同じ日に当たる: ${c.name}`, () => {
    const holidayProvider = c.providers.map((k) => providers[k]!);
    if (c.zeroDates) {
      const schedule = createSchedule({
        holidayProvider,
        timeZone: "Asia/Tokyo",
        ...c.options,
      } as unknown as ScheduleOptions<number>);
      assert.deepEqual(
        anchorDays.filter((d) => schedule.valueOn(d) === 0),
        c.zeroDates,
      );
      return;
    }
    assert.deepEqual(closedDays({ holidayProvider, ...c.options }, anchorDays), c.closedDates);
  });
}

// --- Main check: the same as ["jp-regular", "national"] of the wrapped provider (all of Japan's supported years) ---

const allDays = daysOf(`${jp.supportedYears.from}-01-01`, `${jp.supportedYears.to}-12-31`);
const patterns: readonly [string, Record<string, unknown>][] = [
  ["祝日", { holiday: true }],
  ["祝日の翌日", { dayAfterHoliday: true }],
  ["祝前日（土日を飛ばす）", { dayBeforeHoliday: true, skipWeekdays: [0, 6] }],
];
for (const [label, pattern] of patterns) {
  test(`"national" は、包んだ日本の提供元の ["jp-regular", "national"] と同じ日に当たる: ${label}`, () => {
    for (const rest of [
      [england, other],
      [other, england],
    ]) {
      const base = { outOfRangePolicy: "ignore", holidayPolicy: "open" } as const;
      assert.deepEqual(
        closedDays(
          {
            ...base,
            holidayProvider: [jp, ...rest],
            closedRecurringRules: [{ ...pattern, kinds: ["national"] }],
          },
          allDays,
        ),
        closedDays(
          {
            ...base,
            holidayProvider: [jpOnly, ...rest],
            closedRecurringRules: [{ ...pattern, kinds: ["jp-regular", "national"] }],
          },
          allDays,
        ),
      );
    }
  });
}

test('対応年がそろわない和集合でも、"national" は日本の提供元の毎年の祝日に当たる', () => {
  for (const holidayProvider of [
    [jp, sg],
    [sg, jp],
  ]) {
    const days = daysOf(`${sg.supportedYears.to + 1}-01-01`, `${sg.supportedYears.to + 1}-12-31`);
    assert.deepEqual(
      closedDays(
        {
          holidayProvider,
          outOfRangePolicy: "ignore",
          holidayPolicy: "open",
          closedRecurringRules: [{ holiday: true, kinds: ["national"] }],
        },
        days,
      ),
      jp
        .holidaysInYear(sg.supportedYears.to + 1)
        .filter((h) => h.kind === "regular")
        .map((h) => h.date),
    );
  }
});

test('"national" は、日本の毎年の祝日でない日（国民の休日・特別な休日・振替休日）には当たらない', () => {
  const calendar = createCalendar({
    holidayProvider: [jp, england],
    timeZone: "Asia/Tokyo",
    holidayPolicy: "open",
    closedRecurringRules: [{ holiday: true, kinds: ["national" as "regular"] }],
  });
  const others = jp.holidaysInYear(2019).filter((h) => h.kind !== "regular");
  assert.ok(others.length > 0);
  for (const h of others) assert.equal(calendar.isBusinessDay(h.date), true, h.date);
});

// --- Diagnostics and migration ---

test('和集合の "national" の deprecated-option は、当てている祝日と 1.0.0 での扱いを添える', () => {
  const message = (holidayProvider: readonly HolidayProvider[]): string =>
    diagnoseCalendar({
      holidayProvider,
      closedRecurringRules: [{ holiday: true, kinds: ["national" as "regular"] }],
    }).find((d) => d.code === "deprecated-option")!.message;
  assert.match(message([jp, england]), /other providers' "national" holidays/);
  assert.match(message([jp, england]), /From 1\.0\.0/);
  assert.equal(message([jp]), '"national" was renamed to "regular" in 0.30.0');
});

test('先に "regular"、後に "national" の規則は、shadowed ではなく redundant で見つかる', () => {
  const list = diagnoseCalendar({
    holidayProvider: [jp, england],
    timeZone: "Asia/Tokyo",
    holidayPolicy: "open",
    closedRecurringRules: [
      { holiday: true, kinds: ["regular"] },
      { holiday: true, kinds: ["national" as "regular"] },
    ],
  }).filter((d) => d.code !== "deprecated-option");
  assert.deepEqual(
    list.map((d) => [d.code, d.path]),
    [["redundant", "closedRecurringRules[1]"]],
  );
});

test('日本の提供元だけの設定では、"regular" と旧名の "national" の同じ規則は shadowed で見つかる（0.30.0 と同じ結果）', () => {
  const codes = (closedRecurringRules: CalendarOptions["closedRecurringRules"]) =>
    diagnoseCalendar({ holidayProvider: jp, closedRecurringRules }).map((d) => [
      d.code,
      d.path,
      d.relatedPath,
    ]);
  const regular = { holiday: true, kinds: ["regular"] } as const;
  const national = { holiday: true, kinds: ["national" as "regular"] } as const;
  assert.deepEqual(codes([regular, national]), [
    ["deprecated-option", "closedRecurringRules[1].kinds[0]", undefined],
    ["shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"],
    ["redundant", "closedRecurringRules[0]", undefined],
  ]);
  assert.deepEqual(codes([national, regular]), [
    ["deprecated-option", "closedRecurringRules[0].kinds[0]", undefined],
    ["shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"],
    ["redundant", "closedRecurringRules[0]", undefined],
  ]);
  // The same for day-after and day-before-holiday rules (compared as containment of the sets of kinds)
  assert.deepEqual(
    codes([
      { dayAfterHoliday: true, kinds: ["national" as "regular", "substitute"] },
      { dayAfterHoliday: true, kinds: ["regular"] },
    ]),
    [
      ["deprecated-option", "closedRecurringRules[0].kinds[0]", undefined],
      ["shadowed", "closedRecurringRules[1]", "closedRecurringRules[0]"],
    ],
  );
});

test('ID "JP" の提供元が種別 "national" の祝日を返すなら、"national" と "regular" を同じものとして比べない', () => {
  const custom: HolidayProvider<string> = {
    ...jp,
    holidaysInYear: (y) =>
      jp.holidaysInYear(y).map((h) => (h.date.endsWith("-01-01") ? { ...h, kind: "national" } : h)),
  };
  const list = diagnoseCalendar({
    holidayProvider: custom,
    holidayPolicy: "open",
    closedRecurringRules: [
      { holiday: true, kinds: ["national"] },
      { holiday: true, kinds: ["regular"] },
    ],
  });
  assert.equal(
    list.some((d) => d.code === "shadowed"),
    false,
  );
});

test('migrateCalendarOptions: 和集合では "national" を書き換えず、changes にも出さない', () => {
  const { options, changes } = migrateCalendarOptions({
    holidayProvider: [jp, england],
    closedRecurringRules: [{ holiday: true, kinds: ["national"] }],
  });
  assert.deepEqual(changes, []);
  assert.deepEqual(options.closedRecurringRules, [{ holiday: true, kinds: ["national"] }]);
});

test('migrateCalendarOptions: 提供元のない設定では "national" を書き換えない（提供元を入れて呼べば書き換える）', () => {
  const stored = { closedRecurringRules: [{ holiday: true, kinds: ["national"] }] };
  assert.deepEqual(migrateCalendarOptions(stored).changes, []);
  const { options, changes } = migrateCalendarOptions({ ...stored, holidayProvider: jp });
  assert.deepEqual(changes, [
    { path: "closedRecurringRules[0].kinds[0]", from: "national", to: "regular" },
  ]);
  const { holidayProvider, ...toSave } = options;
  assert.equal(holidayProvider, jp);
  assert.deepEqual(toSave, { closedRecurringRules: [{ holiday: true, kinds: ["regular"] }] });
});

test('ID "JP" の提供元がない設定の "national" の never-matches は、改名が原因でありうることを添える', () => {
  const renamedJp: HolidayProvider<string> = { ...jp, id: "JP-company" };
  const patterns = [
    { holiday: true },
    { dayAfterHoliday: true },
    { dayBeforeHoliday: true, skipWeekdays: [0, 6] },
  ] as const;
  for (const pattern of patterns) {
    const found = diagnoseCalendar({
      holidayProvider: renamedJp,
      closedRecurringRules: [{ ...pattern, kinds: ["national"] }],
    }).filter((d) => d.code === "never-matches");
    assert.deepEqual(
      found.map((d) => d.path),
      ["closedRecurringRules[0]"],
    );
    assert.match(found[0]!.message, /"national"/);
    assert.match(found[0]!.message, /"regular"/);
  }
  // Not added for options without a provider (the cause is more often a forgotten provider)
  const none = diagnoseCalendar({
    closedRecurringRules: [{ holiday: true, kinds: ["national"] }],
  }).find((d) => d.code === "never-matches")!;
  assert.doesNotMatch(none.message, /"national"/);
});
