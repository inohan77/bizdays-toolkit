import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  combineCalendars,
  createCalendar,
  createCalendarFromSchedule,
  createSchedule,
  isBizdaysError,
  type Calendar,
  type CalendarOptions,
  type HolidayProvider,
} from "../src/index.ts";
import { diagnoseSchedule } from "../src/diagnose/index.ts";
import { jp } from "../src/jp/index.ts";
import { sg } from "../src/sg/index.ts";
import { random } from "./support/catalog.ts";
import { withoutStackTraces } from "./support/stack.ts";

// 第 n 営業日の規則の基準のカレンダーの中（有効期間・個別の日付・周期・提供元の対応年。合成・スケジュールから作ったもの・
// 入れ子・作成関数で作っていないもの）が走査の範囲の外で変わっても、診断が出した項目をまとめて取り除いて、元の設定で値を
// 返した日の結果が変わらないこと（decisions.md の 31 番）。比べる期間は、診断の走査の範囲から独立させる（1900〜2150 年。
// test/removal.test.ts の乱数の 2 件と同じ考え方）。時間がかかるので、test/removal.test.ts と別のファイルにして並べて動かす

type Options = Record<string, unknown>;
type Reported = { readonly severity: string; readonly code: string; readonly path: string };
/** 取り除いても結果が変わらない・使われない、と診断が知らせる code */
const REMOVABLE = new Set(["redundant", "shadowed", "never-matches"]);
const brief = (list: readonly Reported[]) => list.map((d) => [d.severity, d.code, d.path]);
/** 診断が取り除けると出した項目（設定の配列の要素）を、まとめて取り除いた設定 */
function withoutReported(o: Options, list: readonly Reported[]): Options {
  const drop = new Map<string, Set<number>>();
  for (const d of list) {
    const m = /^(\w+)\[(\d+)\]$/.exec(d.path);
    if (!REMOVABLE.has(d.code) || !m) continue;
    const set = drop.get(m[1]!) ?? new Set<number>();
    set.add(Number(m[2]));
    drop.set(m[1]!, set);
  }
  const out: Options = { ...o };
  for (const [key, indexes] of drop)
    out[key] = (o[key] as readonly unknown[]).filter((_, i) => !indexes.has(i));
  return out;
}

/** 1900〜2150 年の 1 月と 9 月の全日（乱数の設定の規則は、1 月か 9 月の日だけを決める。ほかの月は取り除いても変わらない） */
const JAN_SEP: readonly string[] = (() => {
  const out: string[] = [];
  for (let y = 1900; y <= 2150; y++)
    for (const m of ["01", "09"]) {
      const last = m === "01" ? 31 : 30;
      for (let d = 1; d <= last; d++) out.push(`${y}-${m}-${String(d).padStart(2, "0")}`);
    }
  return out;
})();
/** 日の一覧の結果（例外は "E:" と code）。1 日ずつ呼ぶ繰り返しの間だけ、スタックの記録を止める（code だけを見るため） */
function valuesOn(o: Options, days: readonly string[]): Map<string, string> {
  const schedule = createSchedule(o as never);
  const out = new Map<string, string>();
  withoutStackTraces(() => {
    for (const date of days)
      try {
        out.set(date, JSON.stringify(schedule.valueOn(date)));
      } catch (e) {
        out.set(date, `E:${isBizdaysError(e) ? e.code : String(e)}`);
      }
  });
  return out;
}

/** 対応年 from〜to。1 月 1 日は毎年、1 月 2〜3 日は last 年まで祝日（基準の提供元の祝日が、年によって変わる。形 E） */
const changingProvider = (from: number, to: number, last: number): HolidayProvider => ({
  id: `changing-${from}-${to}-${last}`,
  timeZone: "UTC",
  supportedYears: { from, to },
  dataVersion: "1",
  holidaysInYear: (year) =>
    [1, 2, 3]
      .filter((d) => d === 1 || year <= last)
      .map((d) => ({
        date: `${year}-01-0${d}`,
        name: `H${d}`,
        nameEn: `H${d}`,
        kind: "regular",
        confirmed: true,
      })),
});

test("取り除いて比べる（基準のカレンダー）: 乱数で作った基準のカレンダーを持つスケジュールでも、診断が出した項目をまとめて取り除いて、1900〜2150 年の 1 月と 9 月の値を返した日の結果が変わらない（種は固定）", () => {
  const next = random(20261119);
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;
  const pad = (n: number): string => String(n).padStart(2, "0");
  const day = (y0: number, y1: number): string =>
    `${int(y0, y1)}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
  const period = (p: number): Options => {
    if (next() > p) return {};
    const r = next();
    if (r < 0.4) return { effectiveTo: day(1940, 2090) };
    if (r < 0.8) return { effectiveFrom: day(1940, 2090) };
    const [a, b] = [day(1940, 2060), day(1960, 2100)];
    return a <= b ? { effectiveFrom: a, effectiveTo: b } : { effectiveFrom: b, effectiveTo: a };
  };
  /** 基準のカレンダーの中の形（実際に現れた数を数える） */
  type Kind =
    | "有効期間"
    | "個別の日付"
    | "周期"
    | "合成"
    | "スケジュールから"
    | "入れ子"
    | "throw の提供元"
    | "ignore の提供元"
    | "印なし";
  const genBasis = (depth: number, kinds: Set<Kind>): Calendar => {
    const k = next();
    if (depth < 2 && k < 0.12) {
      kinds.add("合成");
      if (depth > 0) kinds.add("入れ子");
      return combineCalendars([genBasis(depth + 1, kinds), genBasis(depth + 1, kinds)], {
        open: pick(["all", "any"] as const),
      });
    }
    if (depth < 2 && k < 0.24) {
      kinds.add("スケジュールから");
      const annual = { from: "01-01", to: pick(["01-02", "01-03"]), value: 0, ...period(0.9) };
      if ("effectiveFrom" in annual || "effectiveTo" in annual) kinds.add("有効期間");
      const s: Options = {
        timeZone: "UTC",
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        annualDates: [annual],
      };
      if (next() < 0.4) {
        kinds.add("入れ子");
        s["recurringRules"] = [
          { businessDayOfMonth: 1, months: [1], calendar: genBasis(depth + 1, kinds), value: 0 },
        ];
      }
      return createCalendarFromSchedule(createSchedule(s as never), (v) => v === 1);
    }
    const o: Options = { timeZone: "UTC", closedWeekdays: pick([[], [0], [0, 6]]) };
    const pr = next();
    if (pr < 0.12) {
      o["holidayProvider"] = jp;
      kinds.add("throw の提供元");
    } else if (pr < 0.22) {
      o["holidayProvider"] = changingProvider(1990, 2060, int(2010, 2050));
      kinds.add("throw の提供元");
    } else if (pr < 0.34) {
      o["holidayProvider"] = pick([sg, changingProvider(2001, 2028, 9999)]);
      o["outOfRangePolicy"] = "ignore";
      kinds.add("ignore の提供元");
    }
    if (next() < 0.5) {
      const p = period(0.8);
      if (Object.keys(p).length > 0) kinds.add("有効期間");
      o["closedAnnualDates"] = [{ from: "01-01", to: pick(["01-01", "01-02", "01-03"]), ...p }];
    }
    if (next() < 0.3) {
      const r = next();
      if (r < 0.66) kinds.add("周期");
      o["closedRecurringRules"] = [
        r < 0.33
          ? (() => {
              const w = int(1, 5);
              const anchor = addDays("2026-01-04", w + 7 * int(0, 20));
              return { weekday: w, interval: int(2, 6), anchor };
            })()
          : r < 0.66
            ? { cycle: int(10, 400), anchor: day(2000, 2030), positions: [1] }
            : (() => {
                const p = period(0.7);
                if (Object.keys(p).length > 0) kinds.add("有効期間");
                return { weekday: int(1, 5), nth: [1], months: [1, 9], ...p };
              })(),
      ];
    }
    if (next() < 0.25) {
      kinds.add("個別の日付");
      const y = int(1950, 2080);
      o["closedDates"] =
        next() < 0.5
          ? [{ from: `${y}-01-01`, to: `${y + int(0, 40)}-01-03` }]
          : Array.from({ length: int(1, 30) }, (_, i) => ({
              from: `${y + i}-01-01`,
              to: `${y + i}-01-0${int(1, 3)}`,
            }));
    }
    const calendar = createCalendar(o as CalendarOptions);
    // 1 割は、作成関数で作っていないカレンダーの形のオブジェクト（スプレッドで写したもの）にする
    if (depth === 0 && next() < 0.1) {
      kinds.add("印なし");
      return { ...calendar };
    }
    return calendar;
  };
  const seen = new Map<Kind | "取り除ける項目が出た", number>();
  const COUNTED = 3;
  const TRIALS = 300;
  let compared = 0;
  for (let trial = 0; trial < TRIALS; trial++) {
    const kinds = new Set<Kind>();
    const basis = genBasis(0, kinds);
    const [month, choices] = pick([
      ["01", [1, 2, 3, 4, 5]],
      ["09", [1, 2, 3, 4]],
    ] as const);
    const months = [Number(month)];
    const o: Options = {
      timeZone: "UTC",
      weekdayValues: [1, 1, 1, 1, 1, 1, 1],
      ...(next() < 0.15 ? { holidayProvider: sg, outOfRangePolicy: "ignore" } : {}),
      annualDates: Array.from({ length: int(1, 2) }, () => ({
        date: `${month}-${pad(pick(choices))}`,
        value: 0,
        ...period(0.2),
      })),
      recurringRules: [
        { businessDayOfMonth: pick([1, 2, -1]), months, calendar: basis, value: 0, ...period(0.2) },
        ...(next() < 0.3
          ? [{ weekday: int(0, 6), nth: [1], months, value: 0, ...period(0.3) }]
          : []),
      ],
    };
    const context = `試行 ${trial}: ${[...kinds].join("・")} ${JSON.stringify({ ...o, recurringRules: "…" })}`;
    const list = diagnoseSchedule(o as never) as readonly Reported[];
    assert.deepEqual(
      list.filter((d) => d.severity === "error"),
      [],
      context,
    );
    const removable = list.some((d) => REMOVABLE.has(d.code));
    if (removable) seen.set("取り除ける項目が出た", (seen.get("取り除ける項目が出た") ?? 0) + 1);
    // 形が実際に現れた数: 診断が出さなかった毎年の月日のうち、取り除くと 2001〜2028 年（提供元のないスケジュールの、
    // 基準の中を見ない走査の範囲）の外の日だけが変わるもの。基準の中を見なければ、取り除けると見える
    const want = [...kinds].filter((k) => (seen.get(k) ?? 0) < COUNTED);
    if (!removable && want.length === 0) continue;
    compared++;
    const before = valuesOn(o, JAN_SEP);
    if (removable) {
      const after = valuesOn(withoutReported(o, list), JAN_SEP);
      const changed = [...before].filter(([d, v]) => !v.startsWith("E:") && after.get(d) !== v);
      assert.deepEqual(changed.slice(0, 3), [], `${context} ${JSON.stringify(brief(list))}`);
    }
    if (want.length === 0) continue;
    const annual = o["annualDates"] as readonly unknown[];
    const shown = annual.some((_, i) => {
      if (list.some((d) => d.path === `annualDates[${i}]`)) return false;
      const after = valuesOn({ ...o, annualDates: annual.filter((_, j) => j !== i) }, JAN_SEP);
      const changed = [...before].filter(([d, v]) => !v.startsWith("E:") && after.get(d) !== v);
      return changed.length > 0 && changed.every(([d]) => d < "2001-01-01" || d > "2028-12-31");
    });
    if (shown) for (const k of want) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const kindsAll: readonly Kind[] = [
    "有効期間",
    "個別の日付",
    "周期",
    "合成",
    "スケジュールから",
    "入れ子",
    "throw の提供元",
    "ignore の提供元",
    "印なし",
  ];
  console.log(
    `# 取り除いて比べる（基準のカレンダー）: ${TRIALS} 件（取り除ける項目が出た ${seen.get("取り除ける項目が出た") ?? 0}、比べた ${compared}。基準の中に次の形があり、取り除くと 2001〜2028 年の外だけが変わる毎年の月日を診断が出さなかった設定（${COUNTED} 件まで数える）: ${kindsAll.map((k) => `${k} ${seen.get(k) ?? 0}`).join("、")}）`,
  );
  assert.ok((seen.get("取り除ける項目が出た") ?? 0) > 0, "取り除ける項目が出た が 0 件");
  for (const k of kindsAll) assert.ok((seen.get(k) ?? 0) > 0, `${k} が 0 件`);
});
