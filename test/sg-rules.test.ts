import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, createCalendar, isBizdaysError, weekdayOf } from "../src/index.ts";
import { sg } from "../src/sg/index.ts";

test("シンガポール: 提供元の項目と対応年の外", () => {
  assert.equal(sg.id, "SG");
  assert.equal(sg.timeZone, "Asia/Singapore");
  assert.deepEqual(sg.supportedYears, { from: 2020, to: 2027 });
  assert.equal(sg.confirmedThrough, 2027);
  assert.ok(
    sg.holidaysInYear(2027).every((h) => h.confirmed),
    "表のある年はすべて確定",
  );
  for (const year of [2019, 2028]) {
    assert.throws(
      () => sg.holidaysInYear(year),
      (e: unknown) => isBizdaysError(e) && e.code === "out-of-range",
      String(year),
    );
  }
  assert.ok(Object.isFrozen(sg.holidaysInYear(2026)));
  assert.equal(sg.holidaysInYear(2026), sg.holidaysInYear(2026), "同じ年は同じ配列");
});

test("シンガポール: 振替は日曜日に当たった祝日だけ（土曜日は振り替えない）。振替先は祝日でない最初の日", () => {
  for (let year = 2020; year <= 2027; year++) {
    const list = sg.holidaysInYear(year);
    assert.equal(new Set(list.map((h) => h.date)).size, list.length, "同じ日付は 1 件");
    const originals = list.filter((h) => h.kind !== "substitute");
    const substitutes = list.filter((h) => h.kind === "substitute");
    // 振替は、日曜日に当たった祝日と 1 対 1 に対応し、その日以降で祝日でない最初の日
    const sundays = originals.filter((h) => weekdayOf(h.date) === 0);
    assert.equal(substitutes.length, sundays.length, `${year} 振替の数`);
    for (const h of sundays) {
      const s = substitutes.find((x) => x.name === h.name && x.date > h.date);
      assert.ok(s, `${h.date} ${h.name} の振替`);
      for (let d = addDays(h.date, 1); d < s.date; d = addDays(d, 1)) {
        assert.ok(
          originals.some((x) => x.date === d),
          `${h.date} の振替先 ${s.date} より前の ${d} は祝日`,
        );
      }
    }
    // 土曜日に当たった祝日は振り替えない
    for (const h of originals.filter((h) => weekdayOf(h.date) === 6)) {
      assert.ok(
        !sundays.some((x) => x.name === h.name)
          ? !substitutes.some((x) => x.name === h.name)
          : true,
        `${h.date} 土曜日`,
      );
    }
  }
  // 2022-05-01（日）Labour Day の翌日 5/2 が振替。5/3 の Hari Raya Puasa が重ならないのは、告示が 5/3 と定めたため
  const may = sg.holidaysInYear(2022).filter((h) => h.date.startsWith("2022-05-0"));
  assert.deepEqual(
    may.map((h) => [h.date, h.kind]),
    [
      ["2022-05-01", "regular"],
      ["2022-05-02", "substitute"],
      ["2022-05-03", "regular"],
    ],
  );
  // 2020 年の旧正月: 1/25（土）は振り替えず、1/26（日）が 1/27（月）に振り替わる
  const cny = sg.holidaysInYear(2020).filter((h) => h.name === "Chinese New Year");
  assert.deepEqual(
    cny.map((h) => [h.date, h.kind]),
    [
      ["2020-01-25", "regular"],
      ["2020-01-26", "regular"],
      ["2020-01-27", "substitute"],
    ],
  );
});

test("シンガポール: 種別は regular・substitute・special（Polling Day）で、営業日カレンダーで使える", () => {
  const kinds = new Set<string>();
  for (let year = 2020; year <= 2027; year++)
    for (const h of sg.holidaysInYear(year)) kinds.add(h.kind);
  assert.deepEqual([...kinds].sort(), ["regular", "special", "substitute"]);
  assert.deepEqual(
    [2020, 2023, 2025].map((y) => sg.holidaysInYear(y).find((h) => h.kind === "special")?.date),
    ["2020-07-10", "2023-09-01", "2025-05-03"],
  );
  const calendar = createCalendar({ holidayProvider: sg, closedWeekdays: [0, 6] });
  assert.equal(calendar.isBusinessDay("2026-08-10"), false, "National Day の振替");
  assert.equal(calendar.addBusinessDays("2026-08-07", 1), "2026-08-11");
  assert.equal(
    calendar.isHoliday(new Date("2026-08-09T17:00:00Z")),
    true,
    "日本時間ではなくシンガポール時間で判定",
  );
  assert.equal(calendar.timeZone, "Asia/Singapore");
});
