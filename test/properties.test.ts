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
 * 営業日が見つからない試行を飛ばしてよい上限（試行の 1 割）。目録の規則で営業日が（ほとんど）ないカレンダーもでき、
 * その試行は性質の前提を満たさないので飛ばす。飛ばした試行が 1 割を超えると、性質を確かめた試行が 9 割を切るので失敗にする
 */
const SKIP_LIMIT = RUNS / 10;

/**
 * 性質の設定を作る道具。設定は、性質の名前から決まる種の乱数の列で作り、日付などを引く乱数（g）とは分ける。
 * 使った作り方を覚えておき、test/support/sites.ts の PROPERTY_CONFIGS と同じかを確かめる
 * （生成範囲の包含の検査が、性質と同じ設定を同じ並びで作るため）
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

/** 登録した性質の名前（PROPERTY_CONFIGS に古い名前が残っていないかを、ファイルの最後のテストで確かめる） */
const declared = new Set<string>();

/** 性質を RUNS 回確かめる。失敗したら種・試行・入力を出す */
function property(name: string, check: (g: Gen, c: Configs) => string | void): void {
  declared.add(name);
  test(`性質: ${name}`, () => {
    // 日付などを引く乱数と、設定を作る乱数（性質の名前から決まる種）を分ける
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
        // 目録の規則で、営業日が（ほとんど）ないカレンダーもできる。その試行は性質の前提を満たさないので数えずに飛ばす
        if ((error as { code?: unknown } | null)?.code === "no-business-day") {
          skipped++;
          continue;
        }
        const detail = error instanceof Error ? error.message : String(error);
        assert.fail(`seed=${SEED} run=${run} ${context}\n${detail}`);
      }
    }
    // 飛ばした試行の件数はいつも出し、上限を超えたら失敗にする（黙って飛ばさない。RELEASING.md の「品質の確認」）
    let line: string;
    try {
      line = checkSkipped(skipped, RUNS, SKIP_LIMIT, "営業日が見つからない設定");
    } catch (error) {
      assert.fail((error as Error).message);
    }
    console.log(`# ${name}: ${line}`);
    // 使った設定の作り方が、生成範囲の包含の検査の一覧（PROPERTY_CONFIGS）と同じ
    assert.deepEqual(
      [...used],
      PROPERTY_CONFIGS[name] === undefined ? [] : [PROPERTY_CONFIGS[name]],
      `性質「${name}」の設定の作り方が test/support/sites.ts の PROPERTY_CONFIGS と違う`,
    );
    // 設定を作る性質は、1 回の試行で 1 回だけ作る（生成範囲の検査は、試行の数だけ作ると数えている）
    if (used.size > 0)
      assert.equal(
        made.count,
        RUNS,
        `性質「${name}」が作った設定の数が試行の数（${RUNS}）と違う: ${made.count}`,
      );
  });
}

property("addBusinessDays の結果は営業日で、n 進めて −n 戻ると元の営業日に戻る", (g, c) => {
  const { calendar, describe } = c.calendar();
  const start = calendar.businessDayOnOrAfter(g.date());
  const n = g.int(1, 40);
  const forward = calendar.addBusinessDays(start, n);
  const context = `${describe} start=${start} n=${n}`;
  assert.ok(calendar.isBusinessDay(forward), context);
  assert.equal(calendar.addBusinessDays(forward, -n), start, context);
  assert.equal(calendar.diffBusinessDays(start, forward), n, context);
  assert.equal(calendar.diffBusinessDays(forward, start), -n, context);
  return context;
});

property(
  "休業日を起点にした addBusinessDays は、翌営業日を 1 と数える（diffBusinessDays は起点が営業日のときだけ逆算になる）",
  (g, c) => {
    const { calendar, describe } = c.calendar();
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
    // 休業日の起点は数えないので、diffBusinessDays は n − 1（decisions.md の 22 番）
    assert.equal(calendar.diffBusinessDays(day, calendar.addBusinessDays(day, n)), n - 1, context);
    // 負の方向は、前営業日を −1 と数える
    assert.equal(calendar.addBusinessDays(day, -1), calendar.previousBusinessDay(day), context);
    return context;
  },
);

property("nextBusinessDay との間に営業日はなく、previousBusinessDay で戻る", (g, c) => {
  const { calendar, describe } = c.calendar();
  const day = g.date();
  const next = calendar.nextBusinessDay(day);
  const context = `${describe} day=${day} next=${next}`;
  assert.ok(next > day, context);
  assert.ok(calendar.isBusinessDay(next), context);
  assert.deepEqual(calendar.businessDatesBetween(addDays(day, 1), next), [next], context);
  assert.equal(
    calendar.previousBusinessDay(next),
    calendar.businessDayOnOrBefore(addDays(next, -1)),
    context,
  );
  return context;
});

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

property("瞬間の入力は、カレンダーのタイムゾーンで暦日になる", (g) => {
  const day = g.date();
  const minutes = g.int(0, 24 * 60 - 1);
  const wall = `${day}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const calendar = createCalendar({ holidayProvider: jp });
  // 日本時間の壁時計の日時と、それを +09:00 の瞬間にしたものは同じ暦日・時刻になる
  const context = `wall=${wall}`;
  assert.deepEqual(calendar.civilOf(new Date(`${wall}:00+09:00`)), calendar.civilOf(wall), context);
  return context;
});

// ------------------------------------------------------------
// 繰り返しの規則と振替
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
// 月の計算と日付の調整
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

test("PROPERTY_CONFIGS の名前は、すべて実際の性質（古い名前が残っていない）", () => {
  assert.deepEqual(
    Object.keys(PROPERTY_CONFIGS).filter((name) => !declared.has(name)),
    [],
    "test/support/sites.ts の PROPERTY_CONFIGS に、test/properties.test.ts にない性質の名前がある",
  );
});
