/**
 * Property tests. With seeded random numbers, many dates and calendar options are built, and "properties that
 * must hold for any input" are checked.
 *
 * A failure prints the seed, the trial number and the input, so it can be reproduced under the same conditions.
 * To try another seed: PROPERTY_SEED=123 node --test test/properties.test.ts
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
  type CalendarOptions,
  type ScheduleOptions,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";
import { random } from "./support/catalog.ts";
import { intEnv } from "./support/env.ts";
import {
  PROPERTY,
  PROPERTY_CONFIGS,
  checkSkipped,
  propertyConfig,
  propertyConfigSeed,
  propertyGen,
  type PropertyConfigKind,
  type PropertyGen as Gen,
} from "./support/sites.ts";

const SEED = intEnv("PROPERTY_SEED", PROPERTY.seed);
const RUNS = PROPERTY.runs;
/**
 * The limit of trials that may be skipped because no business day is found (10% of the trials). The catalog
 * rules can produce calendars with (almost) no business day; such a trial does not meet the premise of the
 * property and is skipped. With more than 10% skipped, fewer than 90% of the trials checked the property, which
 * fails
 */
const SKIP_LIMIT = RUNS / 10;

/**
 * The tool that builds a property's options. Options come from a random sequence seeded by the property's name,
 * apart from the generator (g) that draws dates and so on.
 * The way used is remembered and must equal PROPERTY_CONFIGS of test/support/sites.ts (the inclusion check of
 * the generated range builds the same options in the same order as the property)
 */
interface Configs {
  calendar(): { calendar: Calendar; describe: string };
  weekly(): { calendar: Obj; schedule: Obj };
  shift(): Obj;
  move(): Obj;
  pair(): { calendar: Obj; schedule: Obj };
}
type Obj = Record<string, unknown>;

function configsFor(name: string, used: Set<PropertyConfigKind>, made: { count: number }): Configs {
  const g = propertyGen(random(propertyConfigSeed(SEED, name)));
  const make = (kind: PropertyConfigKind) => {
    used.add(kind);
    made.count++;
    return propertyConfig(kind, g);
  };
  return {
    calendar: () => {
      const options = { holidayProvider: jp, ...make("calendar").calendar };
      return {
        calendar: createCalendar(options as CalendarOptions),
        describe: JSON.stringify({ ...options, holidayProvider: "jp" }),
      };
    },
    weekly: () => make("weekly") as { calendar: Obj; schedule: Obj },
    shift: () => make("shift").calendar,
    move: () => make("move").calendar,
    pair: () => make("pair") as { calendar: Obj; schedule: Obj },
  };
}

test("飛ばした試行の上限: 件数が上限以下なら件数の行を返し、上限を超えたら失敗する（種に頼らずに確かめる）", () => {
  assert.equal(checkSkipped(0, 300, 30, "理由"), "飛ばした試行: 0 / 300（理由）");
  assert.equal(checkSkipped(30, 300, 30, "理由"), "飛ばした試行: 30 / 300（理由）");
  assert.throws(() => checkSkipped(31, 300, 30, "理由"), /上限（30）を超えた: 31 \/ 300/);
  assert.throws(() => checkSkipped(1, 300, 0, "理由"), /上限（0）を超えた/);
});

/**
 * The names of the registered properties (the last test of the file checks that no stale name is left in
 * PROPERTY_CONFIGS)
 */
const declared = new Set<string>();

/** Checks a property RUNS times. A failure prints the seed, the trial and the input */
function property(name: string, check: (g: Gen, c: Configs) => string | void): void {
  declared.add(name);
  test(`性質: ${name}`, () => {
    // The generator for dates and so on is apart from the one for options (seeded by the property's name)
    const g = propertyGen(random(SEED));
    const used = new Set<PropertyConfigKind>();
    const made = { count: 0 };
    const c = configsFor(name, used, made);
    let skipped = 0;
    for (let run = 0; run < RUNS; run++) {
      let context = "";
      try {
        context = check(g, c) ?? "";
      } catch (error) {
        // The catalog rules can produce calendars with (almost) no business day. Such a trial does not meet the
        // premise of the property and is skipped without being counted
        if ((error as { code?: unknown } | null)?.code === "no-business-day") {
          skipped++;
          continue;
        }
        const detail = error instanceof Error ? error.message : String(error);
        assert.fail(`seed=${SEED} run=${run} ${context}\n${detail}`);
      }
    }
    // The number of skipped trials is always printed, and above the limit it fails (never silently skipped. The
    // quality checks of RELEASING.md)
    let line: string;
    try {
      line = checkSkipped(skipped, RUNS, SKIP_LIMIT, "営業日が見つからない設定");
    } catch (error) {
      assert.fail((error as Error).message);
    }
    console.log(`# ${name}: ${line}`);
    // The way the options were built equals the list of the inclusion check of the generated range
    // (PROPERTY_CONFIGS)
    assert.deepEqual(
      [...used],
      PROPERTY_CONFIGS[name] === undefined ? [] : [PROPERTY_CONFIGS[name]],
      `性質「${name}」の設定の作り方が test/support/sites.ts の PROPERTY_CONFIGS と違う`,
    );
    // A property that builds options builds them once per trial (the check of the generated range counts on one
    // per trial)
    if (used.size > 0)
      assert.equal(
        made.count,
        RUNS,
        `性質「${name}」が作った設定の数が試行の数（${RUNS}）と違う: ${made.count}`,
      );
  });
}

property(
  "休業日を起点にした addBusinessDays は、翌営業日を 1 と数える（diffBusinessDays は起点が営業日のときだけ逆算になる）",
  (g, c) => {
    const { calendar, describe } = c.calendar();
    const day = g.date();
    if (calendar.isBusinessDay(day)) return `${describe} ${day} は営業日（対象外）`;
    const n = g.int(1, 20);
    const onOrAfter = calendar.businessDayOnOrAfter(day);
    const context = `${describe} start=${day}（休業日） n=${n}`;
    // +0 and +1 are the same day (the next business day), and n ≥ 1 is "n − 1 business days after the next
    // business day"
    assert.equal(calendar.addBusinessDays(day, 0), onOrAfter, context);
    assert.equal(
      calendar.addBusinessDays(day, n),
      calendar.addBusinessDays(onOrAfter, n - 1),
      context,
    );
    // A closed starting day is not counted, so diffBusinessDays is n − 1 (decisions.md #22)
    assert.equal(calendar.diffBusinessDays(day, calendar.addBusinessDays(day, n)), n - 1, context);
    // In the negative direction the previous business day counts as −1
    assert.equal(calendar.addBusinessDays(day, -1), calendar.previousBusinessDay(day), context);
    return context;
  },
);

property("businessDatesBetween の件数は diffBusinessDays と一致する", (g, c) => {
  const { calendar, describe } = c.calendar();
  const from = g.date();
  const to = addDays(from, g.int(0, 120));
  const context = `${describe} from=${from} to=${to}`;
  assert.equal(
    calendar.businessDatesBetween(from, to).length,
    calendar.diffBusinessDays(from, addDays(to, 1)),
    context,
  );
  return context;
});

property("営業日カレンダーと、同じ規則の真偽値のスケジュールは一致する", (g, configs) => {
  const { calendar: c, schedule: s } = configs.weekly();
  const calendar = createCalendar({ holidayProvider: jp, ...c } as CalendarOptions);
  const schedule = createSchedule({ holidayProvider: jp, ...s } as ScheduleOptions<boolean>);
  const day = g.date();
  const context = `calendar=${JSON.stringify(c)} schedule=${JSON.stringify(s)} day=${day}`;
  assert.equal(calendar.isBusinessDay(day), schedule.valueOn(day), context);
  return context;
});

// ------------------------------------------------------------
// Recurring rules and moves
// ------------------------------------------------------------

property("振替先は振替元より後の祝日でない日で、その間はすべて祝日", (g, c) => {
  const options = c.shift();
  const calendar = createCalendar({ holidayProvider: jp, ...options } as CalendarOptions);
  const day = g.date();
  const info = calendar.dayInfoOn(day);
  const context = `options=${JSON.stringify(options)} day=${day}`;
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

property("繰り返しの規則があっても、営業日の移動と数え上げの性質は保たれる", (g, c) => {
  const options = c.move();
  const calendar = createCalendar({ holidayProvider: jp, ...options } as CalendarOptions);
  const start = calendar.businessDayOnOrAfter(g.date());
  const n = g.int(1, 30);
  const forward = calendar.addBusinessDays(start, n);
  const context = `options=${JSON.stringify(options)} start=${start} n=${n}`;
  assert.ok(calendar.isBusinessDay(forward), context);
  assert.equal(calendar.addBusinessDays(forward, -n), start, context);
  assert.equal(calendar.diffBusinessDays(start, forward), n, context);
  return context;
});

property("繰り返しの規則でも、営業日カレンダーと真偽値のスケジュールは一致する", (g, configs) => {
  const { calendar: c, schedule: s } = configs.pair();
  const calendar = createCalendar({ holidayProvider: jp, ...c } as CalendarOptions);
  const schedule = createSchedule({ holidayProvider: jp, ...s } as ScheduleOptions<boolean>);
  const day = g.date();
  const context = `calendar=${JSON.stringify(c)} day=${day}`;
  assert.equal(calendar.isBusinessDay(day), schedule.valueOn(day), context);
  assert.equal(calendar.dayInfoOn(day).shiftedFrom, schedule.dayInfoOn(day).shiftedFrom, context);
  return context;
});

// ------------------------------------------------------------
// Month calculations and adjusting dates
// ------------------------------------------------------------

const CONVENTIONS = ["following", "preceding", "modified-following", "modified-preceding"] as const;

property("adjust の結果は営業日で、方法ごとの定義どおり。もう一度調整しても変わらない", (g, c) => {
  const { calendar, describe } = c.calendar();
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
      // The next business day when it is in the same month, otherwise the previous business day of the same
      // month, otherwise the next business day
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

property("月の第 n 営業日は、その月の営業日の一覧の n 番目（負なら後ろから）", (g, c) => {
  const { calendar, describe } = c.calendar();
  const month = g.date().slice(0, 7);
  const last = addDays(monthOf(month, 1) + "-01", -1);
  const days = calendar.businessDatesBetween(`${month}-01`, last);
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

property("dueDate は、末日に読み替えた日付を adjust したもの", (g, c) => {
  const { calendar, describe } = c.calendar();
  const month = g.date().slice(0, 7);
  const day = g.pick([1, 10, 15, 20, 25, 28, 29, 30, 31, -1] as const);
  const convention = g.pick(CONVENTIONS);
  const lastDay = Number(addDays(monthOf(month, 1) + "-01", -1).slice(8));
  const date = `${month}-${String(day === -1 || day > lastDay ? lastDay : day).padStart(2, "0")}`;
  const context = `${describe} month=${month} day=${day} ${convention}`;
  assert.equal(
    calendar.dueDate(month, { dayOfMonth: day, convention }),
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
  // With the closing days (the last day when the month lacks the day) of the resulting month and of the month
  // before, `date` lies between them
  const closingOf = (m: string) => {
    const last = Number(addDays(monthOf(m, 1) + "-01", -1).slice(8));
    const d = closingDay === -1 || closingDay > last ? last : closingDay;
    return `${m}-${String(d).padStart(2, "0")}`;
  };
  assert.ok(date <= closingOf(month), context);
  assert.ok(date > closingOf(monthOf(month, -1)), context);
  // monthOf is additive
  const a = g.int(-30, 30);
  const b = g.int(-30, 30);
  assert.equal(monthOf(monthOf(date, a), b), monthOf(date, a + b), `${context} a=${a} b=${b}`);
  return context;
});

test("PROPERTY_CONFIGS の名前は、すべて実際の性質（古い名前が残っていない）", () => {
  assert.deepEqual(
    Object.keys(PROPERTY_CONFIGS).filter((name) => !declared.has(name)),
    [],
    "test/support/sites.ts の PROPERTY_CONFIGS に、test/properties.test.ts にない性質の名前がある",
  );
});
