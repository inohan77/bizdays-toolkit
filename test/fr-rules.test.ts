import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalendar, isBizdaysError } from "../src/index.ts";
import { alsaceMoselle, metropole, type KnownFrHolidayKey } from "../src/fr/index.ts";
import { easterSunday } from "../src/provider/index.ts";

test("フランス: 本土は 11 日、Alsace-Moselle は 13 日。振替はなく、すべて confirmed: true", () => {
  assert.equal(metropole.id, "FR");
  assert.equal(alsaceMoselle.id, "FR-AM");
  assert.equal(metropole.timeZone, "Europe/Paris");
  assert.equal(metropole.confirmedThrough, undefined, "年ごとの告示がないので持たない");
  for (let y = 2000; y <= 2099; y++) {
    const m = metropole.holidaysInYear(y);
    const a = alsaceMoselle.holidaysInYear(y);
    // 復活祭が 3 月 23 日なら Ascension が 5 月 1 日（2008 年）、3 月 30 日なら 5 月 8 日（2059 年）に重なる
    const coincide = /-03-(23|30)$/.test(easterSunday(y)) ? 1 : 0;
    assert.equal(m.length, 11 - coincide, `metropole ${y}`);
    assert.equal(a.length, 13 - coincide, `alsace-moselle ${y}`);
    for (const h of [...m, ...a]) {
      assert.equal(h.kind, "regular");
      assert.equal(h.confirmed, true);
      assert.ok(h.key !== undefined);
    }
    // Alsace-Moselle は本土の祝日をすべて含む
    const mDates = new Set(m.map((h) => h.date));
    assert.ok(
      m.every((h) => a.some((x) => x.date === h.date && x.name === h.name)),
      String(y),
    );
    const extra = a.filter((h) => !mDates.has(h.date)).map((h) => h.key);
    assert.deepEqual(extra, ["good-friday", "saint-stephens"], String(y));
  }
});

test("フランス: 2 つの祝日が同じ日に当たる年は復活祭から決まる祝日の名称で 1 件（2008 年の 5 月 1 日）", () => {
  const may = metropole.holidaysInYear(2008).filter((h) => h.date === "2008-05-01");
  assert.deepEqual(
    may.map((h) => [h.name, h.key]),
    [["Ascension", "ascension"]],
  );
  // keys: ["labour-day"] は 2008 年には当てはまらない（key は 1 つだけ）
  const c = createCalendar({
    holidayProvider: metropole,
    openRecurringRules: [{ holiday: true, keys: ["labour-day"] }],
  });
  assert.equal(c.isBusinessDay("2008-05-01"), false);
  assert.equal(c.isBusinessDay("2009-05-01"), true);
});

test("フランス: 識別子と英語名、復活祭から決まる日付の例", () => {
  const keys: KnownFrHolidayKey[] = [
    "new-year",
    "easter-monday",
    "labour-day",
    "victory-in-europe",
    "ascension",
    "pentecost-monday",
    "bastille",
    "assumption",
    "all-saints",
    "armistice",
    "christmas",
  ];
  assert.deepEqual(
    metropole.holidaysInYear(2026).map((h) => h.key),
    keys,
  );
  const by = (p: typeof metropole, date: string) =>
    p.holidaysInYear(Number(date.slice(0, 4))).find((h) => h.date === date);
  assert.deepEqual(by(metropole, "2026-04-06"), {
    date: "2026-04-06",
    name: "Lundi de Pâques",
    nameEn: "Easter Monday",
    kind: "regular",
    confirmed: true,
    key: "easter-monday",
  });
  assert.equal(by(metropole, "2026-05-14")?.key, "ascension");
  assert.equal(by(metropole, "2026-05-25")?.key, "pentecost-monday");
  assert.equal(by(alsaceMoselle, "2026-04-03")?.name, "Vendredi saint");
  assert.equal(by(alsaceMoselle, "2026-12-26")?.name, "2ème jour de Noël");
  assert.equal(by(metropole, "2026-04-03"), undefined, "本土に Vendredi saint はない");
});

test("フランス: 連帯の日（Lundi de Pentecôte を出勤日にする企業）は祝日の規則で書く", () => {
  const company = createCalendar({
    holidayProvider: metropole,
    closedWeekdays: [0, 6],
    openRecurringRules: [
      { holiday: true, keys: ["pentecost-monday"], name: "Journée de solidarité" },
    ],
  });
  assert.equal(company.dayInfoOn("2026-05-25").reason, "open-recurring");
  assert.equal(
    company.dayInfoOn("2026-05-25").holiday?.name,
    "Lundi de Pentecôte",
    "法律上は祝日のまま",
  );
  assert.equal(company.isBusinessDay("2026-05-14"), false, "Ascension は休業のまま");
  // Date は Europe/Paris で判定する（夏時間: 5 月 24 日 22:30Z は 25 日 00:30）
  assert.equal(company.isHoliday(new Date("2026-05-24T22:30:00Z")), true);
});

test("フランス: 対応年の外は out-of-range", () => {
  for (const y of [1999, 2100]) {
    assert.throws(
      () => metropole.holidaysInYear(y),
      (e: unknown) => isBizdaysError(e) && e.code === "out-of-range",
    );
  }
  assert.ok(Object.isFrozen(metropole.holidaysInYear(2026)));
  assert.ok(Object.isFrozen(metropole.holidaysInYear(2026)[0]));
});
