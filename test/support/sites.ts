// 乱数のテストの呼び出し側（test/properties.test.ts・test/diagnose-properties.test.ts）が使う設定の作り方と、
// 3 つの呼び出し側（result-compare を含む）が作る設定の一覧。呼び出し側はここの関数で設定を作り、
// 生成範囲の包含の検査（test/tools/generator-features.test.ts）は、同じ関数を同じ種と試行の数で呼んで特徴を数える
// （3 つの呼び出し側とも、設定の並びまで呼び出し側と同じ）。
// 提供元は名前（"jp"）か、自作の提供元のオブジェクトで持つ（呼び出し側が本物の提供元に置き換える）。

import {
  CONTEXTS,
  addDays,
  picker,
  random,
  randomCalendarOptions,
  randomRules,
  randomScheduleOptions,
  type Context,
  type Obj,
} from "./catalog.ts";
import { scanFeatures, providerKey, diagnoseRangeOf } from "./features.ts";
import { contextOf, fixedCases, generateCases } from "./result-cases.ts";
import { SHORT_PROVIDER } from "./provider.ts";

// ------------------------------------------------------------
// test/properties.test.ts（日本の提供元）
// ------------------------------------------------------------

/** 性質のテストの既定の種と試行の数 */
export const PROPERTY = { seed: 20261015, runs: 300 } as const;
/**
 * 飛ばした試行の件数を上限と比べる（性質の前提を満たさない試行を飛ばすテストが使う）。上限を超えたら例外にする。
 * 件数の行（「飛ばした試行: n / N（理由）」）は呼び出し側がいつも出す
 */
export function checkSkipped(skipped: number, runs: number, limit: number, reason: string): string {
  const line = `飛ばした試行: ${skipped} / ${runs}（${reason}）`;
  if (skipped > limit)
    throw new Error(`飛ばした試行が上限（${limit}）を超えた: ${skipped} / ${runs}（${reason}）`);
  return line;
}

/** 性質のテストが問い合わせる日付（日本の祝日の対応年に収め、端で探索が範囲を出ないよう余裕を取る） */
export const PROPERTY_DATES = { from: "1960-01-01", days: 365 * 130 } as const;

/** 性質のテストの乱数（日付を作る date を持つ） */
export interface PropertyGen {
  readonly rand: () => number;
  int(min: number, max: number): number;
  date(): string;
  pick<T>(items: readonly T[]): T;
}

export function propertyGen(rand: () => number): PropertyGen {
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  return {
    rand,
    int,
    date: () => addDays(PROPERTY_DATES.from, int(0, PROPERTY_DATES.days)),
    pick: (items) => items[int(0, items.length - 1)]!,
  };
}

/** 営業日カレンダーの設定（定休日は最大 5 曜日。繰り返しの規則は目録から作る） */
export function propertyCalendarOptions(g: PropertyGen): Obj {
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter(() => g.int(0, 3) === 0).slice(0, 5);
  const closedDates = Array.from({ length: g.int(0, 5) }, () => {
    const from = g.date();
    return { from, to: addDays(from, g.int(0, 10)) };
  });
  const openDates = Array.from({ length: g.int(0, 3) }, () => g.date());
  const closedAnnualDates = g.int(0, 1) ? [{ from: "12-29", to: "01-03" }] : [];
  const holidayPolicy = g.pick(["closed", "open", "ignore"] as const);
  const p = picker(g.rand);
  const ctx: Context = CONTEXTS.properties;
  return {
    closedWeekdays: weekdays,
    closedDates,
    openDates,
    closedAnnualDates,
    holidayPolicy,
    ...(g.int(0, 2) > 0 ? { closedRecurringRules: randomRules(p, ctx, 3) } : {}),
    ...(g.int(0, 3) === 0 ? { openRecurringRules: randomRules(p, ctx, 2) } : {}),
  };
}

/** 曜日ごとの営業の真偽値から、同じ規則の営業日カレンダーとスケジュールの設定を作る */
export function propertyWeeklyOptions(g: PropertyGen): { calendar: Obj; schedule: Obj } {
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map(() => g.int(0, 2) > 0);
  const holidayValue = g.int(0, 1) === 1;
  return {
    calendar: {
      closedWeekdays: [0, 1, 2, 3, 4, 5, 6].filter((w) => !weekdays[w]),
      holidayPolicy: holidayValue ? "open" : "closed",
    },
    schedule: { weekdayValues: weekdays, holidayPolicy: { value: holidayValue } },
  };
}

const ON_HOLIDAY = ["under-holiday", "over-holiday", "after-holiday"] as const;

/** 曜日・日付の繰り返しの規則（振替の性質のテスト用） */
export function propertyRecurringRules(g: PropertyGen): Obj[] {
  return Array.from({ length: g.int(1, 3) }, (): Obj => {
    const holidayOverlapPolicy = g.pick(ON_HOLIDAY);
    const months = g.int(0, 3) === 0 ? { months: [g.int(1, 12)] } : {};
    if (g.int(0, 1) === 0) {
      const nth = g.int(0, 2) === 0 ? {} : { nth: g.pick([1, 2, 3, 4, 5, -1] as const) };
      return { weekday: g.int(0, 6), ...nth, ...months, holidayOverlapPolicy };
    }
    return {
      dayOfMonth: g.pick([1, 10, 15, 20, 28, 31, -1] as const),
      ...months,
      holidayOverlapPolicy,
    };
  });
}

/** 振替の性質: 規則をすべて "after-holiday" にした営業日カレンダー */
export function propertyShiftOptions(g: PropertyGen): Obj {
  const rules = propertyRecurringRules(g).map((r) => ({
    ...r,
    holidayOverlapPolicy: "after-holiday",
  }));
  return { holidayPolicy: g.pick(["open", "closed"] as const), closedRecurringRules: rules };
}

/** 営業日の移動の性質: 閉じる規則と、ときどき開く規則 */
export function propertyMoveOptions(g: PropertyGen): Obj {
  return {
    holidayPolicy: g.pick(["open", "closed", "ignore"] as const),
    closedRecurringRules: propertyRecurringRules(g),
    openRecurringRules: g.int(0, 2) === 0 ? propertyRecurringRules(g) : [],
  };
}

/** カレンダーとスケジュールの一致の性質: 同じ規則の営業日カレンダーと真偽値のスケジュール */
export function propertyPairOptions(g: PropertyGen): { calendar: Obj; schedule: Obj } {
  const open = g.int(0, 1) ? propertyRecurringRules(g) : [];
  const closed = propertyRecurringRules(g);
  const holidayOpen = g.int(0, 1) === 1;
  return {
    calendar: {
      holidayPolicy: holidayOpen ? "open" : "closed",
      openRecurringRules: open,
      closedRecurringRules: closed,
    },
    schedule: {
      weekdayValues: [true, true, true, true, true, true, true],
      holidayPolicy: { value: holidayOpen },
      recurringRules: [
        ...open.map((r) => ({ ...r, value: true })),
        ...closed.map((r) => ({ ...r, value: false })),
      ],
    },
  };
}

/** 性質のテストの設定の作り方の種類（性質ごとに 1 つ） */
export type PropertyConfigKind = "calendar" | "weekly" | "shift" | "move" | "pair";

/**
 * 設定を作る性質と、その設定の作り方。性質は、設定を作る乱数（性質の名前から決まる種の列）と、日付などを引く乱数を
 * 分けて持つので、siteTrials はこの一覧から、性質と同じ設定を同じ並びで作れる。test/properties.test.ts は、
 * 性質が実際に使った作り方がこの一覧と同じかを確かめる（一覧にない性質が設定を作ると失敗する）
 */
export const PROPERTY_CONFIGS: Readonly<Record<string, PropertyConfigKind>> = {
  "休業日を起点にした addBusinessDays は、翌営業日を 1 と数える（diffBusinessDays は起点が営業日のときだけ逆算になる）":
    "calendar",
  "businessDatesBetween の件数は diffBusinessDays と一致する": "calendar",
  "営業日カレンダーと、同じ規則の真偽値のスケジュールは一致する": "weekly",
  "振替先は振替元より後の祝日でない日で、その間はすべて祝日": "shift",
  "繰り返しの規則があっても、営業日の移動と数え上げの性質は保たれる": "move",
  "繰り返しの規則でも、営業日カレンダーと真偽値のスケジュールは一致する": "pair",
  "adjust の結果は営業日で、方法ごとの定義どおり。もう一度調整しても変わらない": "calendar",
  "月の第 n 営業日は、その月の営業日の一覧の n 番目（負なら後ろから）": "calendar",
  "dueDate は、末日に読み替えた日付を adjust したもの": "calendar",
};

/** 性質の設定を作る乱数の種（テストの種と性質の名前から決まる。FNV-1a） */
export function propertyConfigSeed(seed: number, name: string): number {
  let h = 0x811c9dc5;
  for (const ch of name) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ seed) >>> 0;
}

/** 設定の作り方の種類ごとの、1 回分の設定（カレンダーとスケジュール。提供元は持たない） */
export function propertyConfig(
  kind: PropertyConfigKind,
  g: PropertyGen,
): { calendar: Obj; schedule?: Obj } {
  switch (kind) {
    case "calendar":
      return { calendar: propertyCalendarOptions(g) };
    case "weekly":
      return propertyWeeklyOptions(g);
    case "shift":
      return { calendar: propertyShiftOptions(g) };
    case "move":
      return { calendar: propertyMoveOptions(g) };
    case "pair":
      return propertyPairOptions(g);
  }
}

// ------------------------------------------------------------
// test/diagnose-properties.test.ts
// ------------------------------------------------------------

/** 診断の性質のテストの種と試行の数（全日を比べる・第 n 営業日を入れる・日本の提供元の全範囲を走査する） */
export const DIAGNOSE_PROPERTY = {
  seed: 20261016,
  runs: 100,
  countingRuns: 30,
  fullRangeRuns: 6,
  /**
   * pnpm check で確かめる試行の抜き出し（run をこの数で割った余りが 0 の試行だけ確かめる。設定は毎回作って乱数の列を変えない）。
   * 全件は DIAGNOSE_PROPERTY_FULL=1（CI の diagnose-consistency ジョブ）。3 は 100・30・6 のどれでも抜き出しが 0 件にならない
   */
  sampleEvery: 3,
} as const;
/** 日本の提供元の全範囲（src/jp の対応年。test/tools/generator-features.test.ts が対応年と一致することを確かめる） */
export const JP_FULL_RANGE = { from: "1955-01-01", to: "2099-12-31" } as const;
/** 対応年の短い自作の提供元の全日 */
export const SHORT_RANGE = { from: "2025-01-01", to: "2027-12-31" } as const;

/** 診断の性質のテストの提供元: 対応年の短い自作の提供元・なし・日本（呼び出し側が本物に置き換える "jp"） */
export type DiagnoseSource = "short" | "none" | "jp";

const DIAGNOSE_CONTEXT: Record<DiagnoseSource, Context> = {
  short: CONTEXTS["diagnose-properties"],
  none: CONTEXTS["diagnose-properties（提供元なし）"],
  jp: CONTEXTS["diagnose-properties（日本の全範囲）"],
};

/**
 * 目録から診断の性質のテストの設定を作る。判定の条件は診断にそろえる（outOfRangePolicy: "ignore"。31 番）。
 * 配列のキーは空でも書く（空の配列と省略を両方試すため、目録の設定で上書きされなかったものは空のまま残る）
 */
export function diagnoseOptions(rand: () => number, source: DiagnoseSource): Obj {
  const options = randomCalendarOptions(picker(rand), DIAGNOSE_CONTEXT[source]);
  return {
    ...(source === "short" ? { holidayProvider: SHORT_PROVIDER, timeZone: "UTC" } : {}),
    ...(source === "jp" ? { holidayProvider: "jp", timeZone: "Asia/Tokyo" } : {}),
    outOfRangePolicy: "ignore",
    closedDates: [],
    openDates: [],
    closedAnnualDates: [],
    openRecurringRules: [],
    closedRecurringRules: [],
    ...options,
  };
}

/** 第 n 営業日の規則（月・週）と、それが当てはまりやすい月初・週の始まりの近くの個別の日付を足す */
export function withCountingRule(rand: () => number, options: Obj): Obj {
  const counting = [
    { businessDayOfMonth: [1, 2, -1][Math.floor(rand() * 3)]! },
    { businessDayOfWeek: [1, -1][Math.floor(rand() * 2)]!, weekStart: Math.floor(rand() * 2) },
  ][Math.floor(rand() * 2)]!;
  const key = rand() < 0.5 ? "closedRecurringRules" : "openRecurringRules";
  return {
    ...options,
    [key]: [...(options[key] as unknown[]), counting],
    closedDates: [
      ...(options["closedDates"] as unknown[]),
      addDays("2026-01-01", 30 * Math.floor(rand() * 12) + Math.floor(rand() * 7)),
    ],
  };
}

/**
 * 0.32.8 の診断の性質のテストの種と試行の数。全日（1901〜2099 年、"throw" では日本の提供元の対応年）を比べるので 1 件が重い
 * （0.2〜1 秒）。pnpm check は sampleEvery 件に 1 件の抜き出しで、全件は DIAGNOSE_PROPERTY_FULL=1（CI の diagnose-consistency）。
 * 数は、0.32.7 の src/core/diagnose.ts のまま全件を動かすと、範囲の外と長い日付の性質が失敗する数にした（開発の記録の 0.32.8）
 */
export const DIAGNOSE_WIDE = {
  seed: 20261122,
  /** 範囲の外と長い日付（自作の短い提供元・提供元なし） */
  runs: 240,
  /** 日本の提供元で outOfRangePolicy: "throw" と unconfirmedHolidayPolicy: "throw"（カレンダー・スケジュール） */
  throwRuns: 120,
  /** 240 と 120 のどちらでも、抜き出しが 0 件にならない */
  sampleEvery: 20,
} as const;
/** 範囲の外と長い日付の性質で比べる期間（周期の規則も含めて約束が成り立つ範囲。decisions.md の 31 番の「限界」） */
export const WIDE_RANGE = { from: "1901-01-01", to: "2099-12-31" } as const;

const WIDE_CONTEXT: Record<"short" | "none", Context> = {
  short: CONTEXTS["diagnose-properties（範囲の外と長い日付）"],
  none: { ...CONTEXTS["diagnose-properties（範囲の外と長い日付）"], holidays: false },
};

/**
 * 自分の設定を基準に数える第 n 営業日の規則（月・週。数え方の端に当たりやすい位置も）を 1 つ足し、半分の設定では、
 * 数える規則と同じ日を決めうる日・曜日の規則も前に足す（取り除いて比べる組を作るため）
 */
export function withOwnCountingRule(rand: () => number, options: Obj): Obj {
  const p = picker(rand);
  const counting = p.pick<Obj>([
    { businessDayOfMonth: p.pick([1, 2, 3, -1, -2, 20, 22, 23, 26]) },
    { businessDayOfMonth: [1, 2] },
    { businessDayOfWeek: p.pick([1, 2, 5, 6, -1]), weekStart: p.pick([0, 1]) },
  ]);
  const key = p.chance(0.7) ? "closedRecurringRules" : "openRecurringRules";
  const out: Obj = { ...options, [key]: [...((options[key] as unknown[]) ?? []), counting] };
  if (p.chance(0.5))
    out["closedRecurringRules"] = [
      p.pick<Obj>([{ weekday: p.int(0, 6) }, { dayOfMonth: p.pick([1, 2, 3, -1]) }]),
      ...((out["closedRecurringRules"] as unknown[]) ?? []),
    ];
  return out;
}

/**
 * 範囲の外と長い日付の性質の設定（自作の短い提供元か提供元なし。outOfRangePolicy: "ignore"。数える規則をいつも入れ、
 * 3 割は全曜日を閉じるか空にして、営業日の少ない設定（no-business-day の確かめ）も作る）
 */
export function diagnoseWideOptions(rand: () => number, source: "short" | "none"): Obj {
  const p = picker(rand);
  const options = withOwnCountingRule(rand, randomCalendarOptions(p, WIDE_CONTEXT[source]));
  if (p.chance(0.3)) {
    if (p.chance(0.5)) options["closedWeekdays"] = [0, 1, 2, 3, 4, 5, 6];
    else {
      options["closedWeekdays"] = [];
      options["closedRecurringRules"] = [
        ...((options["closedRecurringRules"] as unknown[]) ?? []),
        { dayOfMonth: 1 },
        { businessDayOfMonth: Array.from({ length: 30 }, (_, i) => i + 2) },
      ];
    }
  }
  if (source === "none") delete options["holidayPolicy"];
  return {
    ...(source === "short" ? { holidayProvider: SHORT_PROVIDER, timeZone: "UTC" } : {}),
    outOfRangePolicy: "ignore",
    ...options,
  };
}

/** 日本の提供元の "throw" の性質の設定の種類（outOfRangePolicy・unconfirmedHolidayPolicy のどちらを "throw" にするか） */
export type ThrowKind = "out-of-range" | "unconfirmed";
/** "throw" の性質の試行の種類（カレンダーの out-of-range・unconfirmed、スケジュールの unconfirmed を順に） */
export const throwKindOf = (run: number): { kind: ThrowKind; schedule: boolean } =>
  [
    { kind: "out-of-range" as const, schedule: false },
    { kind: "unconfirmed" as const, schedule: false },
    { kind: "unconfirmed" as const, schedule: true },
  ][run % 3]!;

/**
 * 日本の提供元の "throw" の性質の設定（提供元は名前 "jp"。呼び出し側が本物に置き換える）。カレンダーは半分に数える規則を
 * 入れる。unconfirmed は unconfirmedHolidayPolicy: "throw" と outOfRangePolicy: "ignore"、out-of-range は既定の "throw"。
 * スケジュールの第 n 営業日の規則の基準は CALENDAR_REF のまま（呼び出し側が置き換える）
 */
export function diagnoseThrowOptions(rand: () => number, run: number): Obj {
  const p = picker(rand);
  const { kind, schedule } = throwKindOf(run);
  const ctx = CONTEXTS["diagnose-properties（日本・throw）"];
  const source: Obj = {
    holidayProvider: "jp",
    timeZone: "Asia/Tokyo",
    ...(kind === "unconfirmed"
      ? { unconfirmedHolidayPolicy: "throw", outOfRangePolicy: "ignore" }
      : {}),
  };
  const made = schedule ? randomScheduleOptions(p, ctx) : randomCalendarOptions(p, ctx);
  const options = !schedule && p.chance(0.5) ? withOwnCountingRule(rand, made) : made;
  // unconfirmed の半分は、曜日の規則を前に、振替（"after-holiday"）の曜日の規則を後ろに足す（取り除いた規則の代わりに、
  // 残りの規則が未確定の祝日を引く組を作るため）
  if (kind === "unconfirmed" && p.chance(0.5)) {
    // スケジュールの前の規則は、土日（目録の weekdayValues の "closed"）を同じ値にする
    options[schedule ? "recurringRules" : "closedRecurringRules"] = [
      schedule ? { weekday: p.pick([0, 6]), value: "closed" } : { weekday: p.int(0, 6) },
      ...((options[schedule ? "recurringRules" : "closedRecurringRules"] as unknown[]) ?? []),
      {
        weekday: p.int(1, 5),
        holidayOverlapPolicy: "after-holiday",
        ...(schedule ? { value: p.pick(["A", "B"]) } : {}),
      },
    ];
  }
  return { ...source, ...options };
}

/** 全日を比べるテストの提供元（4 件に 3 件は対応年の短い提供元、残りは提供元なし） */
export const diagnoseSourceOf = (run: number): DiagnoseSource => (run % 4 === 3 ? "none" : "short");
/** 全範囲を走査するテストの提供元（日本と、提供元なしを交互に） */
export const fullRangeSourceOf = (run: number): DiagnoseSource => (run % 2 === 0 ? "jp" : "none");

// ------------------------------------------------------------
// 3 つの呼び出し側が作る設定（生成範囲の包含の検査）
// ------------------------------------------------------------

export interface Trial {
  readonly kind: "calendar" | "schedule";
  readonly options: Obj;
  /** その設定で問い合わせる日付の範囲。wide でなければ、試行ごとに範囲の中の一部の日付だけを問い合わせる */
  readonly scan?: { readonly from: string; readonly to: string; readonly wide: boolean };
}

/** 呼び出し側ごとの設定の一覧（呼び出し側と同じ関数・種・試行の数） */
export function siteTrials(site: string): Trial[] {
  const out: Trial[] = [];
  if (site === "properties") {
    const scan = {
      from: PROPERTY_DATES.from,
      to: addDays(PROPERTY_DATES.from, PROPERTY_DATES.days),
      wide: false,
    };
    const jp = (o: Obj): Obj => ({ holidayProvider: "jp", ...o });
    for (const [name, kind] of Object.entries(PROPERTY_CONFIGS)) {
      const g = propertyGen(random(propertyConfigSeed(PROPERTY.seed, name)));
      for (let run = 0; run < PROPERTY.runs; run++) {
        const made = propertyConfig(kind, g);
        out.push({ kind: "calendar", options: jp(made.calendar), scan });
        if (made.schedule) out.push({ kind: "schedule", options: jp(made.schedule), scan });
      }
    }
    out.push({ kind: "calendar", options: jp({}), scan });
  } else if (site === "diagnose-properties") {
    const short = { ...SHORT_RANGE, wide: true };
    let rand = random(DIAGNOSE_PROPERTY.seed);
    for (let run = 0; run < DIAGNOSE_PROPERTY.runs; run++)
      out.push({
        kind: "calendar",
        options: diagnoseOptions(rand, diagnoseSourceOf(run)),
        scan: short,
      });
    rand = random(DIAGNOSE_PROPERTY.seed + 2);
    for (let run = 0; run < DIAGNOSE_PROPERTY.countingRuns; run++) {
      const options = diagnoseOptions(rand, run % 2 === 0 ? "short" : "none");
      out.push({ kind: "calendar", options: withCountingRule(rand, options), scan: short });
    }
    rand = random(DIAGNOSE_PROPERTY.seed + 3);
    for (let run = 0; run < DIAGNOSE_PROPERTY.fullRangeRuns; run++)
      out.push({
        kind: "calendar",
        options: diagnoseOptions(rand, fullRangeSourceOf(run)),
        scan: { ...JP_FULL_RANGE, wide: true },
      });
    rand = random(DIAGNOSE_WIDE.seed);
    for (let run = 0; run < DIAGNOSE_WIDE.runs; run++)
      out.push({
        kind: "calendar",
        options: diagnoseWideOptions(rand, run % 2 === 0 ? "short" : "none"),
        scan: { ...WIDE_RANGE, wide: true },
      });
    rand = random(DIAGNOSE_WIDE.seed + 1);
    for (let run = 0; run < DIAGNOSE_WIDE.throwRuns; run++)
      out.push({
        kind: throwKindOf(run).schedule ? "schedule" : "calendar",
        options: diagnoseThrowOptions(rand, run),
        scan: { ...JP_FULL_RANGE, wide: true },
      });
  } else if (site === "result-compare") {
    const seen = new Set<string>();
    for (const newShapes of [true, false])
      for (const c of [...fixedCases(), ...generateCases(20261030, 1, newShapes)])
        for (const one of c.partner ? [c, c.partner] : [c]) {
          if (seen.has(`${newShapes}:${one.id}`)) continue;
          seen.add(`${newShapes}:${one.id}`);
          out.push({
            kind: one.kind,
            options: one.options,
            scan: { from: one.from, to: one.to, wide: true },
          });
        }
  } else throw new Error(`unknown site ${site}`);
  return out;
}

/** 設定の一覧の走査の特徴 */
export function trialScanFeatures(t: Trial): Set<string> {
  if (t.scan === undefined) return new Set();
  const f = scanFeatures(
    providerKey(t.options),
    t.scan.from,
    t.scan.to,
    diagnoseRangeOf(t.options),
  );
  if (!t.scan.wide) for (const x of f) if (x.endsWith(".span=decades")) f.delete(x);
  return f;
}

// ------------------------------------------------------------
// 呼び出し側の文脈（生成器の到達性は、この一覧の文脈ごとに確かめる）
// ------------------------------------------------------------

export interface ContextUse {
  readonly site: string;
  readonly name: string;
  readonly ctx: Context;
  /** その文脈で作る設定の種類 */
  readonly kinds: readonly ("calendar" | "schedule")[];
}

export const CONTEXT_USES: readonly ContextUse[] = [
  { site: "properties", name: "properties", ctx: CONTEXTS.properties, kinds: ["calendar"] },
  ...(["short", "none", "jp"] as const).map((source): ContextUse => ({
    site: "diagnose-properties",
    name: Object.entries(CONTEXTS).find(([, c]) => c === DIAGNOSE_CONTEXT[source])![0],
    ctx: DIAGNOSE_CONTEXT[source],
    kinds: ["calendar"],
  })),
  ...(["short", "none"] as const).map((source): ContextUse => ({
    site: "diagnose-properties",
    name: `diagnose-properties（範囲の外と長い日付${source === "none" ? "・提供元なし" : ""}）`,
    ctx: WIDE_CONTEXT[source],
    kinds: ["calendar"],
  })),
  {
    site: "diagnose-properties",
    name: "diagnose-properties（日本・throw）",
    ctx: CONTEXTS["diagnose-properties（日本・throw）"],
    kinds: ["calendar", "schedule"],
  },
  ...[true, false].flatMap((newShapes) =>
    [true, false].map((withHolidays): ContextUse => {
      const { name, ctx } = contextOf(withHolidays, newShapes);
      return { site: "result-compare", name, ctx, kinds: ["calendar", "schedule"] };
    }),
  ),
];
