/**
 * 性質のテスト。種を固定した乱数で日付とカレンダーの設定を大量に作り、
 * 「どの入力でも成り立つべき性質」を確かめる。
 *
 * 失敗したときは、種・試行の番号・入力をメッセージに出すので、同じ条件で再現できる。
 * 種を変えて試すには: PROPERTY_SEED=123 node --test test/properties.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  createCalendar,
  createSchedule,
  type Calendar,
  type Weekday,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";

const SEED = Number(process.env["PROPERTY_SEED"] ?? 20261015);
const RUNS = 300;

/** mulberry32: 種から決まる、再現可能な乱数 */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Gen {
  int(min: number, max: number): number;
  date(): string;
  pick<T>(items: readonly T[]): T;
}

function gen(rand: () => number): Gen {
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  return {
    int,
    // 日本の祝日の対応年に収め、端で探索が範囲を出ないよう余裕を取る
    date: () => addDays("1960-01-01", int(0, 365 * 130)),
    pick: (items) => items[int(0, items.length - 1)]!,
  };
}

/** 乱数で営業日カレンダーの設定を作る（営業日が必ず残るよう、定休日は最大 5 曜日） */
function randomCalendar(g: Gen): { calendar: Calendar; describe: string } {
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter(() => g.int(0, 3) === 0).slice(0, 5) as Weekday[];
  const closedDates = Array.from({ length: g.int(0, 5) }, () => {
    const from = g.date();
    return { from, to: addDays(from, g.int(0, 10)) };
  });
  const openDates = Array.from({ length: g.int(0, 3) }, () => g.date());
  const closedAnnual = g.int(0, 1) ? [{ from: "12-29", to: "01-03" }] : [];
  const holidayPolicy = g.pick(["closed", "open", "ignore"] as const);
  const options = {
    holidays: jp,
    closedWeekdays: weekdays,
    closedDates,
    openDates,
    closedAnnual,
    holidayPolicy,
  };
  return {
    calendar: createCalendar(options),
    describe: JSON.stringify({ ...options, holidays: "jp" }),
  };
}

/** 性質を RUNS 回確かめる。失敗したら種・試行・入力を出す */
function property(name: string, check: (g: Gen) => string | void): void {
  test(`性質: ${name}`, () => {
    const g = gen(random(SEED));
    for (let run = 0; run < RUNS; run++) {
      let context = "";
      try {
        context = check(g) ?? "";
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        assert.fail(`seed=${SEED} run=${run} ${context}\n${detail}`);
      }
    }
  });
}

property("addBusinessDays の結果は営業日で、n 進めて −n 戻ると元の営業日に戻る", (g) => {
  const { calendar, describe } = randomCalendar(g);
  const start = calendar.businessDayOnOrAfter(g.date());
  const n = g.int(1, 40);
  const forward = calendar.addBusinessDays(start, n);
  const context = `${describe} start=${start} n=${n}`;
  assert.ok(calendar.isBusinessDay(forward), context);
  assert.equal(calendar.addBusinessDays(forward, -n), start, context);
  assert.equal(calendar.businessDaysBetween(start, forward), n, context);
  assert.equal(calendar.businessDaysBetween(forward, start), -n, context);
  return context;
});

property("nextBusinessDay との間に営業日はなく、previousBusinessDay で戻る", (g) => {
  const { calendar, describe } = randomCalendar(g);
  const day = g.date();
  const next = calendar.nextBusinessDay(day);
  const context = `${describe} day=${day} next=${next}`;
  assert.ok(next > day, context);
  assert.ok(calendar.isBusinessDay(next), context);
  assert.deepEqual(calendar.listBusinessDays(addDays(day, 1), next), [next], context);
  assert.equal(
    calendar.previousBusinessDay(next),
    calendar.businessDayOnOrBefore(addDays(next, -1)),
    context,
  );
  return context;
});

property("listBusinessDays の件数は businessDaysBetween と一致する", (g) => {
  const { calendar, describe } = randomCalendar(g);
  const from = g.date();
  const to = addDays(from, g.int(0, 120));
  const context = `${describe} from=${from} to=${to}`;
  assert.equal(
    calendar.listBusinessDays(from, to).length,
    calendar.businessDaysBetween(from, addDays(to, 1)),
    context,
  );
  return context;
});

property("営業日カレンダーと、同じ規則の真偽値のスケジュールは一致する", (g) => {
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map(() => g.int(0, 2) > 0);
  const holidayValue = g.int(0, 1) === 1;
  const calendar = createCalendar({
    holidays: jp,
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6].filter((w) => !weekdays[w]) as Weekday[],
    holidayPolicy: holidayValue ? "open" : "closed",
  });
  const schedule = createSchedule({
    holidays: jp,
    weekly: weekdays as [boolean, boolean, boolean, boolean, boolean, boolean, boolean],
    holiday: { value: holidayValue },
  });
  const day = g.date();
  const context = `weekly=${JSON.stringify(weekdays)} holiday=${holidayValue} day=${day}`;
  assert.equal(calendar.isBusinessDay(day), schedule.valueOn(day), context);
  return context;
});

property("瞬間の入力は、カレンダーのタイムゾーンで暦日になる", (g) => {
  const day = g.date();
  const minutes = g.int(0, 24 * 60 - 1);
  const wall = `${day}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const calendar = createCalendar({ holidays: jp });
  // 日本時間の壁時計の日時と、それを +09:00 の瞬間にしたものは同じ暦日・時刻になる
  const context = `wall=${wall}`;
  assert.deepEqual(calendar.civilOf(new Date(`${wall}:00+09:00`)), calendar.civilOf(wall), context);
  return context;
});
