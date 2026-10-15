import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createCalendar, type HolidayProvider } from "../src/index.ts";
import { holidaysInYear, jp } from "../src/jp/index.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";

/** 12 月 25 日だけを祝日にし、names を付ける提供元 */
const provider = (names: unknown): HolidayProvider => ({
  id: "XX",
  timeZone: "UTC",
  supportedYears: { from: 2000, to: 2100 },
  dataVersion: "1",
  holidaysInYear: (year) => [
    {
      date: `${year}-12-25`,
      name: "Christmas Day",
      nameEn: "Christmas Day",
      kind: "public",
      confirmed: true,
      names: names as Record<string, string>,
    },
  ],
});

test("names: 提供元が付けたほかの言語の名称を、複製・凍結して返す", () => {
  const source = { "zh-Hant": "聖誕節", ko: "크리스마스" };
  const calendar = createCalendar({ holidays: provider(source) });
  const holiday = calendar.getHoliday("2026-12-25")!;
  assert.deepEqual(holiday.names, { "zh-Hant": "聖誕節", ko: "크리스마스" });
  assert.ok(Object.isFrozen(holiday.names));
  source.ko = "changed";
  assert.equal(holiday.names?.["ko"], "크리스마스", "元のオブジェクトを書き換えても変わらない");
  // 別の実行環境（vm）で作られた普通のオブジェクトも受け付ける
  const foreign = runInNewContext('({ "zh-Hant": "聖誕節" })') as unknown;
  assert.deepEqual(
    createCalendar({ holidays: provider(foreign) }).getHoliday("2026-12-25")?.names,
    { "zh-Hant": "聖誕節" },
  );
});

test("names: 省略した祝日には項目自体がない（同梱の日本の祝日も持たない）", () => {
  const calendar = createCalendar({ holidays: provider(undefined) });
  assert.equal("names" in calendar.getHoliday("2026-12-25")!, false);
  assert.ok(holidaysInYear(2026).every((h) => !("names" in h)));
  assert.ok(
    createCalendar({ holidays: jp })
      .holidaysInYear(2026)
      .every((h) => !("names" in h)),
  );
});

test("names: 誤りは invalid-provider-data（言語タグは正規の形で書く）", () => {
  const bad: unknown[] = [
    { "zh-hant": "聖誕節" }, // 正規の形は zh-Hant
    { "not a tag": "x" },
    { ko: "" },
    { ko: 1 },
    ["x"],
    "x",
    null,
    Object.create({ ko: "継承した項目" }) as unknown,
  ];
  for (const names of bad) {
    const calendar = createCalendar({ holidays: provider(names) });
    assert.throws(
      () => calendar.getHoliday("2026-12-25"),
      { code: "invalid-provider-data" },
      String(JSON.stringify(names)),
    );
  }
  // 診断では、使っていない年も含めて error として見つかる
  assert.deepEqual(
    diagnoseCalendar({ holidays: provider({ "zh-hant": "聖誕節" }) }).map((d) => d.code),
    ["invalid-provider-data"],
  );
});
