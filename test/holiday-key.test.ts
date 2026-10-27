import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCalendar,
  createSchedule,
  isBizdaysError,
  type Holiday,
  type HolidayProvider,
} from "../src/index.ts";
import { jp, type KnownJpHolidayKey } from "../src/jp/index.ts";
import {
  england,
  northernIreland,
  scotland,
  wales,
  type KnownUkHolidayKey,
} from "../src/uk/index.ts";
import { sg, type KnownSgHolidayKey } from "../src/sg/index.ts";
import { alsaceMoselle, metropole } from "../src/fr/index.ts";
import { diagnoseCalendar } from "../src/diagnose/index.ts";

const JP_KEYS: readonly KnownJpHolidayKey[] = [
  "new-year",
  "coming-of-age",
  "national-foundation",
  "emperors-birthday",
  "vernal-equinox",
  "showa",
  "constitution-memorial",
  "greenery",
  "childrens",
  "marine",
  "mountain",
  "respect-for-the-aged",
  "autumnal-equinox",
  "sports",
  "culture",
  "labor-thanksgiving",
];
const UK_KEYS: readonly KnownUkHolidayKey[] = [
  "new-year",
  "2nd-january",
  "st-patricks",
  "good-friday",
  "easter-monday",
  "early-may",
  "spring",
  "battle-of-the-boyne",
  "summer",
  "st-andrews",
  "christmas",
  "boxing-day",
];
const SG_KEYS: readonly KnownSgHolidayKey[] = [
  "new-year",
  "chinese-new-year",
  "good-friday",
  "labour-day",
  "hari-raya-puasa",
  "vesak",
  "hari-raya-haji",
  "national-day",
  "deepavali",
  "christmas",
];
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

test("key: 日本の祝日法の祝日は 1 つずつ key を持ち、振替休日は元の祝日の key、国民の休日・特例の休日は持たない", () => {
  const seen = new Set<string>();
  for (let y = 1955; y <= 2099; y++) {
    for (const h of jp.holidaysInYear(y)) {
      if (h.kind === "citizens" || h.kind === "special") {
        assert.equal(h.key, undefined, `${h.date} ${h.name}`);
        continue;
      }
      assert.ok(h.key !== undefined && KEY_PATTERN.test(h.key), `${h.date} ${h.name}`);
      assert.ok(JP_KEYS.includes(h.key as KnownJpHolidayKey), `${h.date} ${h.key}`);
      if (h.kind === "regular") seen.add(h.key);
    }
  }
  assert.deepEqual([...seen].sort(), [...JP_KEYS].sort(), "既知の key はすべて現れる");
  // 日付の移動・改名があっても同じ祝日なら同じ key
  const keyOn = (date: string) =>
    jp.holidaysInYear(Number(date.slice(0, 4))).find((h) => h.date === date)?.key;
  assert.equal(keyOn("1988-04-29"), "emperors-birthday", "昭和の天皇誕生日");
  assert.equal(keyOn("2018-12-23"), "emperors-birthday", "平成の天皇誕生日");
  assert.equal(keyOn("2026-02-23"), "emperors-birthday", "令和の天皇誕生日");
  assert.equal(keyOn("1999-10-10"), "sports", "体育の日");
  assert.equal(keyOn("2026-10-12"), "sports", "スポーツの日");
  assert.equal(keyOn("2006-04-29"), "greenery", "4 月 29 日のみどりの日");
  assert.equal(keyOn("2026-05-04"), "greenery", "5 月 4 日のみどりの日");
  // 振替休日は元の祝日の key（2020-02-24 は天皇誕生日の振替、2020-05-06 は憲法記念日の振替）
  assert.equal(keyOn("2020-02-24"), "emperors-birthday");
  assert.equal(keyOn("2020-05-06"), "constitution-memorial");
  // 同じ年に同じ key が複数回現れることは正当（振替休日と元の祝日）
  assert.equal(jp.holidaysInYear(2020).filter((h) => h.key === "emperors-birthday").length, 2);
});

test("key: 英国の毎年の祝日は GOV.UK の区分名の key を持ち、振替日は元の祝日の key、臨時の祝日は持たない", () => {
  for (const provider of [england, wales, scotland, northernIreland]) {
    for (let y = 2012; y <= 2099; y++) {
      for (const h of provider.holidaysInYear(y)) {
        if (h.kind === "special") {
          assert.equal(h.key, undefined, `${provider.id} ${h.date} ${h.name}`);
          continue;
        }
        assert.ok(
          h.key !== undefined && UK_KEYS.includes(h.key as KnownUkHolidayKey),
          `${provider.id} ${h.date} ${h.name} ${h.key}`,
        );
      }
    }
  }
  const on = (p: HolidayProvider, date: string) =>
    p.holidaysInYear(Number(date.slice(0, 4))).find((h) => h.date === date);
  assert.equal(on(england, "2020-05-08")?.key, "early-may", "布告で移った年も同じ key");
  assert.equal(on(england, "2021-12-27")?.key, "christmas", "振替日は元の祝日の key");
  assert.equal(on(england, "2021-12-28")?.key, "boxing-day");
  assert.equal(on(scotland, "2023-01-02")?.key, "new-year", "GOV.UK の割り当てに合わせた年");
  assert.equal(on(scotland, "2023-01-03")?.key, "2nd-january");
  assert.equal(on(scotland, "2026-06-15")?.key, undefined, "World Cup bank holiday は臨時");
  assert.equal(on(northernIreland, "2026-07-13")?.key, "battle-of-the-boyne", "振替日");
  assert.equal(on(wales, "2026-01-01")?.names?.cy, "Dydd Calan", "names は key と両立する");
});

test("key: シンガポールの 11 の祝日は 1 つずつ key を持ち、振替日は元の祝日の key、Polling Day は持たない", () => {
  const seen = new Set<string>();
  for (let y = sg.supportedYears.from; y <= sg.supportedYears.to; y++) {
    for (const h of sg.holidaysInYear(y)) {
      if (h.kind === "special") {
        assert.equal(h.key, undefined, `${h.date} ${h.name}`);
        continue;
      }
      assert.ok(
        h.key !== undefined && SG_KEYS.includes(h.key as KnownSgHolidayKey),
        `${h.date} ${h.name} ${h.key}`,
      );
      seen.add(h.key);
    }
  }
  assert.deepEqual([...seen].sort(), [...SG_KEYS].sort());
  const h2026 = sg.holidaysInYear(2026);
  assert.deepEqual(
    h2026.filter((h) => h.key === "chinese-new-year").map((h) => h.date),
    ["2026-02-17", "2026-02-18"],
    "旧正月の 2 日は同じ key",
  );
  assert.equal(h2026.find((h) => h.date === "2026-08-10")?.key, "national-day", "振替日");
});

test("key: 規則の keys で祝日を個別に指せる（kinds・weekdays・months との AND）", () => {
  // 花屋: 祝日は定休だが、春分の日・秋分の日（彼岸の中日）だけは営業
  const florist = createCalendar({
    holidayProvider: jp,
    openRecurringRules: [
      { holiday: true, keys: ["vernal-equinox", "autumnal-equinox"], name: "彼岸は営業" },
    ],
  });
  assert.equal(florist.dayInfoOn("2026-03-20").reason, "open-recurring");
  assert.equal(florist.dayInfoOn("2026-09-23").reason, "open-recurring");
  assert.equal(florist.dayInfoOn("2026-05-04").reason, "holiday", "ほかの祝日は休業のまま");
  assert.equal(florist.dayInfoOn("2026-05-06").reason, "holiday", "振替休日も休業のまま");

  // 英国のパブ: bank holiday は営業するが Good Friday と Easter Monday だけ休む
  const pub = createCalendar({
    holidayProvider: england,
    holidayPolicy: "open",
    closedRecurringRules: [{ holiday: true, keys: ["good-friday", "easter-monday"] }],
    closedAnnualDates: ["12-25"],
  });
  assert.equal(pub.isBusinessDay("2026-04-03"), false, "Good Friday");
  assert.equal(pub.isBusinessDay("2026-04-06"), false, "Easter Monday");
  assert.equal(pub.isBusinessDay("2026-05-04"), true, "Early May bank holiday は営業");
  assert.equal(pub.isBusinessDay("2026-12-25"), false, "Christmas は毎年の月日で休業");

  // 振替休日は元の祝日の key を持つので「成人の日とその振替」を 1 つの規則で指せる
  const both = createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ holiday: true, keys: ["sports"] }],
  });
  assert.equal(both.isBusinessDay("2020-07-24"), true, "スポーツの日（2020 年は移動）");
  // 当日だけなら kinds を併せて指定する（2020-02-24 は天皇誕生日の振替休日）
  const onlyDay = createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ holiday: true, keys: ["emperors-birthday"], kinds: ["regular"] }],
  });
  assert.equal(onlyDay.isBusinessDay("2020-02-23"), true, "当日");
  assert.equal(onlyDay.isBusinessDay("2020-02-24"), false, "振替休日は対象外");

  // スケジュール: 特定の祝日だけ値を変える
  const pool = createSchedule<string>({
    holidayProvider: jp,
    weekdayValues: ["regular", "regular", "regular", "regular", "regular", "regular", "regular"],
    recurringRules: [
      { holiday: true, keys: ["marine", "mountain"], value: "summer", name: "夏季料金" },
    ],
  });
  assert.equal(pool.valueOn("2026-07-20"), "summer", "海の日");
  assert.equal(pool.valueOn("2026-08-11"), "summer", "山の日");
  assert.equal(pool.valueOn("2026-11-03"), "regular", "文化の日は通常");

  // key を持たない祝日（国民の休日）には当てはまらない（kinds で指す）
  const none = createCalendar({
    holidayProvider: jp,
    openRecurringRules: [{ holiday: true, keys: ["new-year"] }],
  });
  assert.equal(none.isBusinessDay("2026-09-22"), false, "国民の休日は key を持たない");
});

test("key: 利用者の提供元が付けた key を検証し、複製・凍結して返す", () => {
  const provider = (key: unknown): HolidayProvider => ({
    id: "XX",
    timeZone: "UTC",
    supportedYears: { from: 2026, to: 2026 },
    dataVersion: "test",
    holidaysInYear: () => [
      {
        date: "2026-12-25",
        name: "Christmas",
        nameEn: "Christmas",
        kind: "regular",
        confirmed: true,
        key,
      } as Holiday,
    ],
  });
  const ok = createCalendar({ holidayProvider: provider("christmas-2") });
  const holiday = ok.dayInfoOn("2026-12-25").holiday!;
  assert.equal(holiday.key, "christmas-2");
  assert.ok(Object.isFrozen(holiday));
  const noKey = createCalendar({ holidayProvider: provider(undefined) });
  assert.equal(
    "key" in noKey.dayInfoOn("2026-12-25").holiday!,
    false,
    "省略した key は項目ごと持たない",
  );
  for (const bad of ["", "Christmas", "-x", "christmas day", 1]) {
    assert.throws(
      () => createCalendar({ holidayProvider: provider(bad) }).dayInfoOn("2026-12-25"),
      (e: unknown) => isBizdaysError(e) && e.code === "invalid-provider-data",
      JSON.stringify(bad),
    );
  }
});

test("key: keys の検証（holiday 以外には付けられない・形式）と診断", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
      return undefined;
    } catch (e) {
      return isBizdaysError(e) ? e.code : undefined;
    }
  };
  assert.equal(
    code(() =>
      createCalendar({
        holidayProvider: jp,
        closedRecurringRules: [{ weekday: 1, keys: ["sports"] } as never],
      }),
    ),
    "invalid-option",
  );
  assert.equal(
    code(() =>
      createCalendar({ holidayProvider: jp, openRecurringRules: [{ holiday: true, keys: [] }] }),
    ),
    "invalid-option",
  );
  assert.equal(
    code(() =>
      createCalendar({
        holidayProvider: jp,
        openRecurringRules: [{ holiday: true, keys: ["Sports"] }],
      }),
    ),
    "invalid-option",
  );
  const brief = (options: object) =>
    diagnoseCalendar(options).map((d) => [d.severity, d.code, d.path, d.relatedPath ?? ""]);
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      openRecurringRules: [
        { holiday: true, keys: ["nonexistent"] },
        { holiday: true, keys: ["sports"] },
        { holiday: true, keys: ["sports"], kinds: ["regular"] },
        { holiday: true, keys: ["sports", "culture"] },
      ],
    }),
    [
      ["warning", "never-matches", "openRecurringRules[0]", ""],
      ["warning", "shadowed", "openRecurringRules[2]", "openRecurringRules[1]"],
      ["info", "redundant", "openRecurringRules[1]", ""],
    ],
    "対応年に現れない key は never-matches、key の集合の包含は shadowed（広い集合は覆われず、後の広い規則が同じ値なので先の規則は redundant）",
  );
  // 広い規則が先なら、狭い規則が shadowed
  assert.deepEqual(
    brief({
      holidayProvider: jp,
      openRecurringRules: [{ holiday: true }, { holiday: true, keys: ["sports"] }],
    }),
    [["warning", "shadowed", "openRecurringRules[1]", "openRecurringRules[0]"]],
  );
});

test("key: フランスの祝日は 13 の key を持ち、2 つの祝日が重なる年は復活祭の側の key", () => {
  const seen = new Set<string>();
  for (let y = 2000; y <= 2099; y++) {
    for (const h of alsaceMoselle.holidaysInYear(y)) {
      assert.ok(h.key !== undefined && KEY_PATTERN.test(h.key), `${h.date} ${h.name}`);
      seen.add(h.key);
    }
  }
  assert.equal(seen.size, 13);
  assert.equal(
    metropole.holidaysInYear(2008).find((h) => h.date === "2008-05-01")?.key,
    "ascension",
  );
});
