// 日本の提供元とほかの提供元の和集合での、kinds の旧名 "national"（docs/decisions.md の 54 番）。
// 主の検査は、日本の提供元を包んで種別を付け替えた設定との関係（祝日データに依存しないので、データの反映で壊れない）。
// 錨は公開済みの 0.22.2 で作ったフィクスチャ（0.22.x の意味を正とする。確定した年だけ）。データのパッチ版が錨の範囲の
// 過去の祝日を変えたとき（法改正・臨時の祝日）は、0.22.2 では作り直せないので、影響する日付を錨から外し、CHANGELOG の「開発」に記録する
import assert from "node:assert/strict";
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
/** 1.0.0 以降の書き方: 日本の提供元を包み、毎年の祝日の種別を付け替える（ID は "JP" のまま） */
const jpOnly: HolidayProvider<string> = {
  ...jp,
  holidaysInYear: (year) =>
    jp.holidaysInYear(year).map((h) => (h.kind === "regular" ? { ...h, kind: "jp-regular" } : h)),
};
const providers: Record<string, HolidayProvider> = { jp, england, other };

const daysOf = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
};
const closedDays = (options: object, days: readonly string[]): string[] => {
  const calendar = createCalendar({ timeZone: "Asia/Tokyo", ...options } as CalendarOptions);
  return days.filter((d) => !calendar.isBusinessDay(d));
};

// --- 錨: 0.22.2 の結果と同じ ---

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

// --- 主の検査: 包んだ提供元の ["jp-regular", "national"] と同じ（日本の対応年のすべて） ---

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

// --- 診断と移行 ---

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
  // 祝日の翌日・祝前日の規則も同じ（種別の集合の包含として比べる）
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
  // 提供元のない設定では添えない（原因は提供元の付け忘れのほうが多い）
  const none = diagnoseCalendar({
    closedRecurringRules: [{ holiday: true, kinds: ["national"] }],
  }).find((d) => d.code === "never-matches")!;
  assert.doesNotMatch(none.message, /"national"/);
});
