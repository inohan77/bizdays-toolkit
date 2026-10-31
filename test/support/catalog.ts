// 規則と設定の目録（テスト拡充案の T2）。乱数のテスト・オラクル・result-compare の生成器は、ここから設定を作る。
// 公開の型（etc/api.md）の設定のキー・規則の形・選択肢の値が、すべてここにあるか、理由付きで除外されていることを
// test/catalog.test.ts が確かめる。規則の形やキーを足したら、ここにも足す（足さないと pnpm check が止まる）。

/** mulberry32: 種から決まる、再現可能な乱数（新しい依存を足さない。docs/decisions.md の 34 番） */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Obj = Record<string, unknown>;

/** 乱数から値を選ぶ道具 */
export interface Picker {
  readonly rand: () => number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** 重複のない 1〜max 個 */
  some<T>(items: readonly T[], max: number): T[];
}

export function picker(rand: () => number): Picker {
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  return {
    rand,
    int,
    chance: (p) => rand() < p,
    pick: (items) => items[int(0, items.length - 1)]!,
    some: (items, max) => {
      const pool = [...items];
      const n = int(1, Math.min(max, pool.length));
      return Array.from({ length: n }, () => pool.splice(int(0, pool.length - 1), 1)[0]!);
    },
  };
}

/** 生成の文脈 */
export interface Context {
  /** 祝日に従属する規則（祝日・祝日の翌日・祝前日）を作るか（提供元があるときだけ意味がある） */
  readonly holidays: boolean;
  /** 祝日の種別と識別子の候補（提供元に合わせる） */
  readonly kinds: readonly string[];
  readonly keys: readonly string[];
  /** 日付の候補を作る基準の年 */
  readonly year: number;
  /** 0.30.0 で入った形（週の第 n 営業日）を作るか（改名の前の版と比べるときは作らない） */
  readonly newShapes: boolean;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** 規則の形（公開の型の名前ごと）。make は、その形が持てるキーを確率で付けた規則を作る */
export interface Shape {
  /** etc/api.md の型の名前 */
  readonly pattern: string;
  /** 形を見分けるキー */
  readonly discriminator: string;
  /** この形の規則に付けるキー（公開の型の never でないキーと突き合わせる） */
  readonly keys: readonly string[];
  /** 祝日に従属する形か */
  readonly holiday?: boolean;
  /** 0.30.0 で入った形か */
  readonly sinceRename?: boolean;
  make(p: Picker, ctx: Context): Obj;
}

const overlap = (p: Picker, rule: Obj, values: readonly string[]): void => {
  if (p.chance(0.5)) rule["holidayOverlapPolicy"] = p.pick(values);
  // 飛ばす曜日に、曜日の規則のその曜日自身は含められない（毎回振り替わる。invalid-option）
  const own = rule["weekday"];
  if (rule["holidayOverlapPolicy"] === "after-holiday" && p.chance(0.4))
    rule["skipWeekdays"] = p.some(
      [0, 6, 3].filter((d) => d !== own),
      2,
    );
};
const months = (p: Picker, rule: Obj): void => {
  if (p.chance(0.25)) rule["months"] = p.some(MONTHS, 4);
};
const holidayFilters = (p: Picker, rule: Obj, ctx: Context): void => {
  if (p.chance(0.5)) rule["kinds"] = p.some(ctx.kinds, 2);
  if (p.chance(0.2) && ctx.keys.length > 0) rule["keys"] = p.some(ctx.keys, 2);
  if (p.chance(0.25)) rule["weekdays"] = p.some(WEEKDAYS, 3);
  months(p, rule);
};
const date = (p: Picker, ctx: Context, from = 1): string => {
  const d = new Date(Date.UTC(ctx.year, 0, from + p.int(0, 364)));
  return d.toISOString().slice(0, 10);
};

export const SHAPES: readonly Shape[] = [
  {
    pattern: "WeekdayPattern",
    discriminator: "weekday",
    keys: [
      "weekday",
      "nth",
      "interval",
      "anchor",
      "months",
      "holidayOverlapPolicy",
      "skipWeekdays",
    ],
    make: (p, ctx) => {
      const rule: Obj = { weekday: p.int(0, 6) };
      if (p.chance(0.4))
        rule["nth"] = p.chance(0.5) ? p.pick([1, 2, 3, -1]) : p.some([1, 2, 3, 4, 5, -1], 2);
      else if (p.chance(0.3)) {
        rule["interval"] = p.pick([2, 3]);
        // 起点は曜日に合わせる
        const anchor = new Date(Date.UTC(ctx.year, 0, 1 + p.int(0, 6)));
        anchor.setUTCDate(
          anchor.getUTCDate() + (((rule["weekday"] as number) - anchor.getUTCDay() + 7) % 7),
        );
        rule["anchor"] = anchor.toISOString().slice(0, 10);
      }
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday", "after-holiday"]);
      return rule;
    },
  },
  {
    pattern: "DayOfMonthPattern",
    discriminator: "dayOfMonth",
    keys: ["dayOfMonth", "months", "holidayOverlapPolicy", "skipWeekdays"],
    make: (p) => {
      const rule: Obj = {
        dayOfMonth: p.chance(0.6)
          ? p.pick([1, 5, 15, 29, 30, 31, -1])
          : p.some([1, 2, 3, 30, 31, -1], 3),
      };
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday", "after-holiday"]);
      return rule;
    },
  },
  {
    pattern: "BusinessDayOfMonthPattern",
    discriminator: "businessDayOfMonth",
    keys: ["businessDayOfMonth", "months", "holidayOverlapPolicy"],
    make: (p) => {
      const rule: Obj = {
        businessDayOfMonth: p.chance(0.7) ? p.pick([1, 2, -1, -2]) : p.some([1, 2, -1], 2),
      };
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday"]);
      return rule;
    },
  },
  {
    pattern: "BusinessDayOfWeekPattern",
    discriminator: "businessDayOfWeek",
    keys: ["businessDayOfWeek", "weekStart", "months", "holidayOverlapPolicy"],
    sinceRename: true,
    make: (p) => {
      const rule: Obj = {
        businessDayOfWeek: p.chance(0.7) ? p.pick([1, 2, -1]) : p.some([1, 2, -1], 2),
        weekStart: p.pick([0, 1]),
      };
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday"]);
      return rule;
    },
  },
  {
    pattern: "CyclePattern",
    discriminator: "cycle",
    keys: ["cycle", "anchor", "positions", "months", "holidayOverlapPolicy"],
    make: (p, ctx) => {
      const cycle = p.pick([3, 4, 6, 10]);
      const rule: Obj = {
        cycle,
        anchor: date(p, ctx),
        positions: p.some(
          Array.from({ length: cycle - 1 }, (_, i) => i + 1),
          2,
        ),
      };
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday"]);
      return rule;
    },
  },
  {
    pattern: "HolidayPattern",
    discriminator: "holiday",
    keys: ["holiday", "kinds", "keys", "weekdays", "months"],
    holiday: true,
    make: (p, ctx) => {
      const rule: Obj = { holiday: true };
      holidayFilters(p, rule, ctx);
      return rule;
    },
  },
  {
    pattern: "DayAfterHolidayPattern",
    discriminator: "dayAfterHoliday",
    keys: ["dayAfterHoliday", "kinds", "keys", "weekdays", "months", "skipWeekdays"],
    holiday: true,
    make: (p, ctx) => {
      const rule: Obj = { dayAfterHoliday: true };
      holidayFilters(p, rule, ctx);
      if (p.chance(0.3)) rule["skipWeekdays"] = p.some([0, 6], 2);
      return rule;
    },
  },
  {
    pattern: "DayBeforeHolidayPattern",
    discriminator: "dayBeforeHoliday",
    keys: ["dayBeforeHoliday", "kinds", "keys", "weekdays", "months", "skipWeekdays"],
    holiday: true,
    make: (p, ctx) => {
      const rule: Obj = { dayBeforeHoliday: true };
      holidayFilters(p, rule, ctx);
      if (p.chance(0.3)) rule["skipWeekdays"] = p.some([0, 6], 2);
      return rule;
    },
  },
];

/** すべての形に付けるキー（有効期間・名前。スケジュールでは値も） */
export const COMMON_RULE_KEYS = ["effectiveFrom", "effectiveTo", "name"] as const;

/**
 * 公開の型にあるが生成器が作らないキーと、その理由。目録の検査（test/catalog.test.ts）はここに載っていないキーを
 * 漏れとして止める
 */
export const EXCLUDED_KEYS: Readonly<Record<string, string>> = {
  calendar:
    "スケジュールの第 n 営業日の規則が数える基準のカレンダー。カレンダーの規則には付けられず、スケジュールの生成器が別に付ける",
  value: "スケジュールの規則の値。スケジュールの生成器が別に付ける",
  timeZone: "提供元に合わせて生成器の呼び出し側が付ける（判定の規則ではない）",
  holidayProvider: "生成器の呼び出し側が渡す（提供元の生成は別の部品）",
  searchDayLimit: "探索の上限で、判定の結果を変えない（探索の関数の引数の検査は別のテスト）",
  weekdayValues: "スケジュールの必須のキー。スケジュールの生成器が別に付ける",
  sameAs:
    "スケジュールの祝日の扱い（ScheduleHolidayPolicy の形）。スケジュールの生成器が別に付ける",
  outOfRangePolicy: '対応年の外の扱い。オラクルは診断にそろえて "ignore" に固定する（診断の前提）',
  unconfirmedHolidayPolicy: '予測の祝日のガード。診断は常に "accept" で評価する（17 番）',
};

/** 選択肢の値の目録（公開の型の文字列の合併） */
export const POLICY_VALUES: Readonly<Record<string, readonly string[]>> = {
  HolidayPolicy: ["closed", "open", "ignore"],
  HolidayOverlapPolicy: ["under-holiday", "over-holiday", "after-holiday"],
  outOfRangePolicy: ["throw", "ignore"],
  unconfirmedHolidayPolicy: ["accept", "throw"],
};

/** 規則の形を見分ける */
export const shapeOf = (rule: Obj): Shape | undefined =>
  SHAPES.find((s) => s.discriminator in rule);

/** 繰り返しの規則を 1 つ作る */
export function randomRule(p: Picker, ctx: Context): Obj {
  const shapes = SHAPES.filter(
    (s) => (ctx.holidays || !s.holiday) && (ctx.newShapes || !s.sinceRename),
  );
  const rule = p.pick(shapes).make(p, ctx);
  if (p.chance(0.15)) rule["effectiveFrom"] = date(p, ctx);
  if (p.chance(0.15)) rule["effectiveTo"] = date(p, ctx, 180);
  if (
    typeof rule["effectiveFrom"] === "string" &&
    typeof rule["effectiveTo"] === "string" &&
    rule["effectiveFrom"] > rule["effectiveTo"]
  )
    delete rule["effectiveTo"];
  if (p.chance(0.2)) rule["name"] = `r${p.int(1, 9)}`;
  return rule;
}

/**
 * 規則の並び。覆う関係（shadowed）や数え方の重なりを作るため、前の規則の写し（そのまま・月や種別を絞ったもの）も混ぜる
 */
export function randomRules(p: Picker, ctx: Context, max: number): Obj[] {
  const out: Obj[] = [];
  for (let i = 0, n = p.int(1, max); i < n; i++) {
    if (out.length > 0 && p.chance(0.3)) {
      const copy: Obj = { ...p.pick(out) };
      const r = p.rand();
      if (r < 0.4) out.push(copy);
      else if (r < 0.7) out.push({ ...copy, months: p.some(MONTHS, 3) });
      else if (shapeOf(copy)?.holiday) out.push({ ...copy, kinds: p.some(ctx.kinds, 2) });
      else {
        const from = date(p, ctx);
        const shifted: Obj = { ...copy, effectiveFrom: from };
        if (typeof shifted["effectiveTo"] === "string" && shifted["effectiveTo"] < from)
          delete shifted["effectiveTo"];
        out.push(shifted);
      }
    } else out.push(randomRule(p, ctx));
  }
  return out;
}

/** 営業日カレンダーの設定（提供元とタイムゾーンは呼び出し側が足す） */
export function randomCalendarOptions(p: Picker, ctx: Context): Obj {
  const o: Obj = { holidayPolicy: p.pick(POLICY_VALUES["HolidayPolicy"]!) };
  if (p.chance(0.6)) o["closedWeekdays"] = p.some([0, 6, 3], 2);
  if (p.chance(0.8)) o["closedRecurringRules"] = randomRules(p, ctx, 4);
  if (p.chance(0.35)) o["openRecurringRules"] = randomRules(p, ctx, 2);
  if (p.chance(0.35))
    o["closedAnnualDates"] = [
      p.pick<unknown>(["12-31", "01-02", "05-01", { from: "12-29", to: "01-03" }]),
    ];
  if (p.chance(0.35)) {
    const from = date(p, ctx);
    o["closedDates"] = [p.chance(0.6) ? from : { from, to: addDays(from, p.int(0, 10)) }];
  }
  if (p.chance(0.25)) o["openDates"] = [date(p, ctx)];
  return o;
}

/** スケジュールの設定（提供元とタイムゾーンは呼び出し側が足す）。値は "A"・"B"・"C"・"closed" */
export function randomScheduleOptions(p: Picker, ctx: Context): Obj {
  const values = ["A", "B", "C", "closed"];
  const o: Obj = {
    weekdayValues: WEEKDAYS.map((d) => (d === 0 || d === 6 ? "closed" : p.pick(values))),
    holidayPolicy: p.pick<unknown>(["ignore", { sameAs: 0 }, { value: "H" }]),
  };
  if (p.chance(0.85))
    o["recurringRules"] = randomRules(p, ctx, 4)
      // スケジュールの第 n 営業日の規則は、数える基準のカレンダーが要る（呼び出し側が calendar を足す）
      .filter((r) => !("businessDayOfMonth" in r) && !("businessDayOfWeek" in r))
      .map((r) => ({ ...r, value: p.pick(values) }));
  if (p.chance(0.3)) o["annualDates"] = [{ date: "12-31", value: "closed" }];
  if (p.chance(0.25)) o["dates"] = [{ date: date(p, ctx), value: "X" }];
  return o;
}

/** "YYYY-MM-DD" に日数を足す */
export const addDays = (d: string, n: number): string =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 生成した設定に現れた規則の形とキー（生成器の到達性の検査に使う） */
export function shapesAndKeysIn(options: Obj): { shapes: Set<string>; keys: Set<string> } {
  const shapes = new Set<string>();
  const keys = new Set<string>(Object.keys(options));
  for (const k of ["closedRecurringRules", "openRecurringRules", "recurringRules"]) {
    const list = options[k];
    if (!Array.isArray(list)) continue;
    for (const r of list as Obj[]) {
      const s = shapeOf(r);
      if (s) shapes.add(s.pattern);
      for (const key of Object.keys(r)) keys.add(key);
    }
  }
  return { shapes, keys };
}
