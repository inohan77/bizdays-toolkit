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
  closingMonth,
  createCalendar,
  monthOf,
  createSchedule,
  type Calendar,
  type Month,
  type RecurringRule,
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

property(
  "休業日を起点にした addBusinessDays は、翌営業日を 1 と数える（businessDaysBetween は起点が営業日のときだけ逆算になる）",
  (g) => {
    const { calendar, describe } = randomCalendar(g);
    const day = g.date();
    if (calendar.isBusinessDay(day)) return `${describe} ${day} は営業日（対象外）`;
    const n = g.int(1, 20);
    const onOrAfter = calendar.businessDayOnOrAfter(day);
    const context = `${describe} start=${day}（休業日） n=${n}`;
    // +0 と +1 は同じ日（翌営業日）で、n ≥ 1 は「翌営業日から n − 1 営業日後」
    assert.equal(calendar.addBusinessDays(day, 0), onOrAfter, context);
    assert.equal(
      calendar.addBusinessDays(day, n),
      calendar.addBusinessDays(onOrAfter, n - 1),
      context,
    );
    // 休業日の起点は数えないので、businessDaysBetween は n − 1（decisions.md の 31 番）
    assert.equal(
      calendar.businessDaysBetween(day, calendar.addBusinessDays(day, n)),
      n - 1,
      context,
    );
    // 負の方向は、前営業日を −1 と数える
    assert.equal(calendar.addBusinessDays(day, -1), calendar.previousBusinessDay(day), context);
    return context;
  },
);

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

// ------------------------------------------------------------
// 繰り返しの規則と振替（0.4.0）
// ------------------------------------------------------------

const ON_HOLIDAY = ["under-holiday", "over-holiday", "after-holiday"] as const;

/** 乱数で繰り返しの規則を作る */
function randomRecurring(g: Gen): RecurringRule[] {
  return Array.from({ length: g.int(1, 3) }, (): RecurringRule => {
    const onHolidayRule = g.pick(ON_HOLIDAY);
    const months = g.int(0, 3) === 0 ? { months: [g.int(1, 12) as Month] } : {};
    if (g.int(0, 1) === 0) {
      const nth = g.int(0, 2) === 0 ? {} : { nth: g.pick([1, 2, 3, 4, 5, -1] as const) };
      return { weekday: g.int(0, 6) as Weekday, ...nth, ...months, onHolidayRule };
    }
    return { day: g.pick([1, 10, 15, 20, 28, 31, -1] as const), ...months, onHolidayRule };
  });
}

property("振替先は振替元より後の祝日でない日で、その間はすべて祝日", (g) => {
  const rules = randomRecurring(g).map((r) => ({ ...r, onHolidayRule: "after-holiday" as const }));
  const calendar = createCalendar({
    holidays: jp,
    holidayPolicy: g.pick(["open", "closed"] as const),
    closedRecurring: rules,
  });
  const day = g.date();
  const info = calendar.dayInfo(day);
  const context = `rules=${JSON.stringify(rules)} day=${day}`;
  if (info.shiftedFrom !== undefined) {
    assert.ok(info.shiftedFrom < day, context);
    assert.equal(calendar.isHoliday(day), false, context);
    for (let d = info.shiftedFrom; d < day; d = addDays(d, 1))
      assert.ok(calendar.isHoliday(d), `${context} ${d}`);
  }
  if (calendar.isHoliday(day))
    assert.notEqual(info.reason, "closed-recurring", `${context}: 祝日には当てはめない`);
  return context;
});

property("繰り返しの規則があっても、営業日の移動と数え上げの性質は保たれる", (g) => {
  const calendar = createCalendar({
    holidays: jp,
    holidayPolicy: g.pick(["open", "closed", "ignore"] as const),
    closedRecurring: randomRecurring(g),
    openRecurring: g.int(0, 2) === 0 ? randomRecurring(g) : [],
  });
  const start = calendar.businessDayOnOrAfter(g.date());
  const n = g.int(1, 30);
  const forward = calendar.addBusinessDays(start, n);
  const context = `start=${start} n=${n}`;
  assert.ok(calendar.isBusinessDay(forward), context);
  assert.equal(calendar.addBusinessDays(forward, -n), start, context);
  assert.equal(calendar.businessDaysBetween(start, forward), n, context);
  return context;
});

property("繰り返しの規則でも、営業日カレンダーと真偽値のスケジュールは一致する", (g) => {
  const open = g.int(0, 1) ? randomRecurring(g) : [];
  const closed = randomRecurring(g);
  const holidayOpen = g.int(0, 1) === 1;
  const calendar = createCalendar({
    holidays: jp,
    holidayPolicy: holidayOpen ? "open" : "closed",
    openRecurring: open,
    closedRecurring: closed,
  });
  const schedule = createSchedule({
    holidays: jp,
    weekly: [true, true, true, true, true, true, true],
    holiday: { value: holidayOpen },
    recurring: [
      ...open.map((r) => ({ ...r, value: true })),
      ...closed.map((r) => ({ ...r, value: false })),
    ],
  });
  const day = g.date();
  const context = `open=${JSON.stringify(open)} closed=${JSON.stringify(closed)} holidayOpen=${holidayOpen} day=${day}`;
  assert.equal(calendar.isBusinessDay(day), schedule.valueOn(day), context);
  assert.equal(calendar.dayInfo(day).shiftedFrom, schedule.dayInfo(day).shiftedFrom, context);
  return context;
});

// ------------------------------------------------------------
// 月の計算と日付の調整（0.6.0）
// ------------------------------------------------------------

const CONVENTIONS = ["following", "preceding", "modified-following", "modified-preceding"] as const;

property("adjust の結果は営業日で、方法ごとの定義どおり。もう一度調整しても変わらない", (g) => {
  const { calendar, describe } = randomCalendar(g);
  const day = g.date();
  const month = day.slice(0, 7);
  const following = calendar.businessDayOnOrAfter(day);
  const preceding = calendar.businessDayOnOrBefore(day);
  const context = `${describe} day=${day}`;
  for (const convention of CONVENTIONS) {
    const result = calendar.adjust(day, { convention });
    const c = `${context} ${convention}=${result}`;
    assert.ok(calendar.isBusinessDay(result), c);
    assert.equal(calendar.adjust(result, { convention }), result, c);
    if (convention === "following") assert.equal(result, following, c);
    if (convention === "preceding") assert.equal(result, preceding, c);
    if (convention === "modified-following") {
      // 翌営業日が同じ月ならそれ、違えば同じ月の前営業日、それもなければ翌営業日
      const expected = following.startsWith(month)
        ? following
        : preceding.startsWith(month)
          ? preceding
          : following;
      assert.equal(result, expected, c);
    }
    if (convention === "modified-preceding") {
      const expected = preceding.startsWith(month)
        ? preceding
        : following.startsWith(month)
          ? following
          : preceding;
      assert.equal(result, expected, c);
    }
  }
  return context;
});

property("月の第 n 営業日は、その月の営業日の一覧の n 番目（負なら後ろから）", (g) => {
  const { calendar, describe } = randomCalendar(g);
  const month = g.date().slice(0, 7);
  const last = addDays(monthOf(month, 1) + "-01", -1);
  const days = calendar.listBusinessDays(`${month}-01`, last);
  const context = `${describe} month=${month} days=${days.length}`;
  if (days.length === 0) {
    assert.throws(() => calendar.firstBusinessDayOfMonth(month), { code: "no-business-day" });
    return context;
  }
  const n = g.int(1, days.length);
  assert.equal(calendar.nthBusinessDayOfMonth(month, n), days[n - 1], context);
  assert.equal(calendar.nthBusinessDayOfMonth(month, -n), days[days.length - n], context);
  assert.equal(calendar.firstBusinessDayOfMonth(month), days[0], context);
  assert.equal(calendar.lastBusinessDayOfMonth(month), days[days.length - 1], context);
  assert.throws(() => calendar.nthBusinessDayOfMonth(month, days.length + 1), {
    code: "no-business-day",
  });
  return context;
});

property("dueDate は、末日に読み替えた日付を adjust したもの", (g) => {
  const { calendar, describe } = randomCalendar(g);
  const month = g.date().slice(0, 7);
  const day = g.pick([1, 10, 15, 20, 25, 28, 29, 30, 31, -1] as const);
  const convention = g.pick(CONVENTIONS);
  const lastDay = Number(addDays(monthOf(month, 1) + "-01", -1).slice(8));
  const date = `${month}-${String(day === -1 || day > lastDay ? lastDay : day).padStart(2, "0")}`;
  const context = `${describe} month=${month} day=${day} ${convention}`;
  assert.equal(
    calendar.dueDate(month, { day, convention }),
    calendar.adjust(date, { convention }),
    context,
  );
  return context;
});

property("closingMonth は、日付が進むと同じか後の月になり、締め日の範囲に収まる", (g) => {
  const date = g.date();
  const closingDay = g.pick([1, 5, 10, 15, 20, 25, 28, 29, 30, 31, -1] as const);
  const next = addDays(date, 1);
  const month = closingMonth(date, closingDay);
  const context = `date=${date} closingDay=${closingDay} month=${month}`;
  assert.ok(closingMonth(next, closingDay) >= month, context);
  // 締め日（その月にない日は末日）を、結果の月と前の月で求めると、date はその間に入る
  const closingOf = (m: string) => {
    const last = Number(addDays(monthOf(m, 1) + "-01", -1).slice(8));
    const d = closingDay === -1 || closingDay > last ? last : closingDay;
    return `${m}-${String(d).padStart(2, "0")}`;
  };
  assert.ok(date <= closingOf(month), context);
  assert.ok(date > closingOf(monthOf(month, -1)), context);
  // monthOf は足し算になる
  const a = g.int(-30, 30);
  const b = g.int(-30, 30);
  assert.equal(monthOf(monthOf(date, a), b), monthOf(date, a + b), `${context} a=${a} b=${b}`);
  return context;
});
