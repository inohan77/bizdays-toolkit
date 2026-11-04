// 規則と設定の目録（テスト拡充案の T2）。乱数のテスト・オラクル・result-compare の生成器は、ここから設定を作る。
// 公開の型（etc/api.md）の設定のキー・規則の形・選択肢の値が、すべてここにあるか、理由付きで除外されていることを
// test/catalog.test.ts が確かめる。規則の形やキーを足したら、ここにも足す（足さないと pnpm check が止まる）。
// 値の候補を狭めると、test/generator-features.test.ts が「前の版の生成器が作っていた特徴を作らない」で止める。

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

/** 生成の文脈（呼び出し側ごとの値は CONTEXTS） */
export interface Context {
  /** 祝日に従属する規則（祝日・祝日の翌日・祝前日）を作るか（提供元があるときだけ意味がある） */
  readonly holidays: boolean;
  /** 祝日の種別と識別子の候補（提供元に合わせる。提供元にない値も混ぜてよい） */
  readonly kinds: readonly string[];
  readonly keys: readonly string[];
  /** 日付の候補（起点・個別の日付）を作る年の範囲 */
  readonly years: readonly [from: number, to: number];
  /** 有効期間の始まりを作る年の範囲（終わりは始まりから 400 日まで） */
  readonly effectiveYears: readonly [from: number, to: number];
  /** 0.30.0 で入った形（週の第 n 営業日）を作るか（改名の前の版と比べるときは作らない） */
  readonly newShapes: boolean;
  /** 入力の誤りの規則（曜日に合わない起点・自分の曜日を含む飛ばす曜日）を混ぜるか（前の版とエラーコードを比べる） */
  readonly invalid: boolean;
}

/**
 * 生成器が意図して入力の誤りにした規則（作成が invalid-option になる）の印。印は規則のオブジェクトに付け、設定のキーは
 * 変えない。result-compare は、印のある規則を含む設定の作成の失敗を「意図した入力の誤り」、印のない設定の作成の失敗を
 * 「意図せず作成に失敗した設定」として分ける（エラーコードでは分けない。意図しない失敗が同じコードでも見分けるため）
 */
const INTENDED_INVALID = new WeakSet<object>();
const markInvalid = (rule: Obj): Obj => {
  INTENDED_INVALID.add(rule);
  return rule;
};
/** 規則に、生成器が意図して入力の誤りにした印があるか */
export const isIntendedInvalid = (rule: unknown): boolean =>
  typeof rule === "object" && rule !== null && INTENDED_INVALID.has(rule);

/** 呼び出し側の文脈。生成器の到達性（test/catalog.test.ts）は、ここに載せた文脈ごとに確かめる */
export const CONTEXTS = {
  /** test/properties.test.ts（日本の提供元） */
  properties: {
    holidays: true,
    kinds: ["regular", "substitute", "citizens"],
    keys: ["new-year", "vernal-equinox", "culture"],
    years: [2026, 2026],
    effectiveYears: [2026, 2027],
    newShapes: true,
    invalid: false,
  },
  /** test/diagnose-properties.test.ts（対応年の短い自作の提供元。提供元にない種別も混ぜる） */
  "diagnose-properties": {
    holidays: true,
    kinds: ["regular", "substitute", "citizens", "x"],
    keys: ["new-year", "b", "mon", "xmas"],
    years: [2026, 2026],
    effectiveYears: [2026, 2031],
    newShapes: true,
    invalid: false,
  },
  /** test/diagnose-properties.test.ts（提供元なし） */
  "diagnose-properties（提供元なし）": {
    holidays: false,
    kinds: [],
    keys: [],
    years: [2026, 2026],
    effectiveYears: [2026, 2031],
    newShapes: true,
    invalid: false,
  },
  /** test/diagnose-properties.test.ts（日本の提供元の全範囲を走査する） */
  "diagnose-properties（日本の全範囲）": {
    holidays: true,
    kinds: ["regular", "substitute", "citizens", "x"],
    keys: ["new-year", "vernal-equinox", "culture"],
    years: [2026, 2026],
    effectiveYears: [2026, 2031],
    newShapes: true,
    invalid: false,
  },
  /** scripts/result-compare.ts（前の版との比較。提供元あり） */
  "result-compare": {
    holidays: true,
    kinds: ["national", "regular", "substitute", "citizens", "special"],
    keys: [
      "new-year",
      "christmas",
      "boxing-day",
      "labor-thanksgiving",
      "culture",
      "spring",
      "easter-monday",
      "labour-day",
      "national-day",
      "st-andrews",
    ],
    years: [2021, 2026],
    effectiveYears: [2021, 2026],
    newShapes: true,
    invalid: true,
  },
} as const satisfies Record<string, Context>;

/** 文脈の変形（result-compare の提供元なし・改名の前の版との比較） */
export const withoutHolidays = (ctx: Context): Context => ({ ...ctx, holidays: false });
export const beforeRename = (ctx: Context): Context => ({ ...ctx, newShapes: false });

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
  /** スケジュールの規則でだけ付けるキー（数える基準のカレンダー） */
  readonly scheduleKeys?: readonly string[];
  /** 祝日に従属する形か */
  readonly holiday?: boolean;
  /** 0.30.0 で入った形か */
  readonly sinceRename?: boolean;
  make(p: Picker, ctx: Context): Obj;
}

/** 祝日と重なったときの扱い（values はその形が受け付ける値） */
const overlap = (p: Picker, rule: Obj, values: readonly string[]): void => {
  if (p.chance(0.5)) rule["holidayOverlapPolicy"] = p.pick(values);
};
/** "after-holiday" のときの飛ばす曜日（own は曜日の規則のその曜日。含めると invalid-option になるので除く） */
const skipWeekdays = (p: Picker, own?: number): number[] => {
  const pool = [0, 6, 3].filter((d) => d !== own);
  return p.some(pool, 2);
};
/** 月の絞り込み（規則どうしが重なりやすいよう、よくある組み合わせも混ぜる） */
const months = (p: Picker, rule: Obj): void => {
  if (p.chance(0.5))
    rule["months"] = p.chance(0.6)
      ? [...p.pick([[2], [1, 2], [4], [2, 4, 6, 9, 11]])]
      : p.some(MONTHS, 5);
};
/** 祝日の規則の曜日の絞り込み（平日・土曜・週末のよくある形も混ぜる） */
const weekdays = (p: Picker): number[] =>
  p.chance(0.5) ? [...p.pick([[1, 2, 3, 4, 5], [6], [0, 6]])] : p.some(WEEKDAYS, 3);
const holidayFilters = (p: Picker, rule: Obj, ctx: Context): void => {
  if (p.chance(0.5)) rule["kinds"] = p.some(ctx.kinds, 2);
  if (p.chance(0.2) && ctx.keys.length > 0) rule["keys"] = p.some(ctx.keys, 3);
  if (p.chance(0.4)) rule["weekdays"] = weekdays(p);
  months(p, rule);
};
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
/** 文脈の年の範囲の日付 */
const date = (p: Picker, years: readonly [number, number]): string => {
  const from = Date.UTC(years[0], 0, 1);
  return iso(
    from +
      p.int(0, Math.round((Date.UTC(years[1] + 1, 0, 1) - from) / 86_400_000) - 1) * 86_400_000,
  );
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
      const weekday = p.int(0, 6);
      const rule: Obj = { weekday };
      if (p.chance(0.4))
        rule["nth"] = p.chance(0.5) ? p.pick([1, 2, 3, 4, 5, -1]) : p.some([1, 2, 3, 4, 5, -1], 2);
      else if (p.chance(0.35)) {
        rule["interval"] = p.pick([2, 3, 4]);
        // 起点は曜日に合わせる（誤りを混ぜる文脈では、合わない起点も作る）
        const anchor = Date.parse(`${date(p, ctx.years)}T00:00:00Z`);
        const shift = ctx.invalid && p.chance(0.2) ? p.int(1, 6) : 0;
        const day = new Date(anchor).getUTCDay();
        rule["anchor"] = iso(anchor + (((weekday - day + 7) % 7) + shift) * 86_400_000);
        if (shift > 0) markInvalid(rule);
      }
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday", "after-holiday"]);
      if (rule["holidayOverlapPolicy"] === "after-holiday" && p.chance(0.4))
        rule["skipWeekdays"] = skipWeekdays(p, weekday);
      // 誤りを混ぜる文脈では、自分の曜日を含む飛ばす曜日（invalid-option）も作る
      if (ctx.invalid && p.chance(0.1)) {
        rule["holidayOverlapPolicy"] = "after-holiday";
        rule["skipWeekdays"] = [weekday, ...(p.chance(0.5) ? [weekday === 0 ? 6 : 0] : [])];
        markInvalid(rule);
      }
      return rule;
    },
  },
  {
    pattern: "DayOfMonthPattern",
    discriminator: "dayOfMonth",
    keys: ["dayOfMonth", "months", "holidayOverlapPolicy", "skipWeekdays"],
    make: (p) => {
      const rule: Obj = {
        dayOfMonth: p.chance(0.5)
          ? p.pick([1, 5, 7, 10, 15, 20, 25, 28, 29, 30, 31, -1])
          : p.some([1, 2, 3, 4, 5, 6, 7, 10, 20, 30, 31, -1], 7),
      };
      months(p, rule);
      overlap(p, rule, ["under-holiday", "over-holiday", "after-holiday"]);
      if (rule["holidayOverlapPolicy"] === "after-holiday" && p.chance(0.4))
        rule["skipWeekdays"] = skipWeekdays(p);
      return rule;
    },
  },
  {
    pattern: "BusinessDayOfMonthPattern",
    discriminator: "businessDayOfMonth",
    keys: ["businessDayOfMonth", "months", "holidayOverlapPolicy"],
    scheduleKeys: ["calendar"],
    make: (p) => {
      const rule: Obj = {
        businessDayOfMonth: p.chance(0.7) ? p.pick([1, 2, 3, 5, -1, -2]) : p.some([1, 2, -1], 2),
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
    scheduleKeys: ["calendar"],
    sinceRename: true,
    make: (p) => {
      const rule: Obj = {
        businessDayOfWeek: p.chance(0.7) ? p.pick([1, 2, -1]) : p.some([1, 2, 3, -1], 2),
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
      const cycle = p.pick([3, 4, 5, 6, 10]);
      const rule: Obj = {
        cycle,
        anchor: date(p, ctx.years),
        // 周期の最後の日（cycle）も含める
        positions: p.some(
          Array.from({ length: cycle }, (_, i) => i + 1),
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

/** すべての形に付けるキー（有効期間・名前） */
export const COMMON_RULE_KEYS = ["effectiveFrom", "effectiveTo", "name"] as const;

/**
 * 公開の型にあるが生成器が作らないキー（"型.キー"）と、その理由。test/catalog.test.ts は、ここに載っていないキーを漏れとして、
 * 載っているのに etc/api.md にないキー・生成器が実際に作っているキーを、食い違いとして止める
 */
export const EXCLUDED_KEYS: Readonly<Record<string, string>> = {
  "CalendarOptions.searchDayLimit":
    "作らない。理由: 探索の上限で、判定の結果を変えない（上限の検査は探索の関数のテストで確かめる）",
  "HolidaySourceOptions.unconfirmedHolidayPolicy":
    '作らない。理由: 未確定の祝日のガードで、診断は常に "accept" で評価する（17 番）。"throw" の挙動は単体のテストで確かめる',
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

/** 文脈で作る形 */
export const shapesIn = (ctx: Context): Shape[] =>
  SHAPES.filter((s) => (ctx.holidays || !s.holiday) && (ctx.newShapes || !s.sinceRename));

/** 有効期間（始まりだけ・終わりだけ・両方。終わりは始まりから 400 日まで。年をまたぐ期間も作る） */
function effective(p: Picker, ctx: Context, rule: Obj): void {
  const r = p.rand();
  if (r >= 0.4) return;
  const from = date(p, ctx.effectiveYears);
  if (r < 0.15) rule["effectiveFrom"] = from;
  else if (r < 0.25) rule["effectiveTo"] = from;
  else {
    rule["effectiveFrom"] = from;
    rule["effectiveTo"] = iso(Date.parse(`${from}T00:00:00Z`) + p.int(0, 400) * 86_400_000);
  }
}

/** 繰り返しの規則を 1 つ作る */
export function randomRule(p: Picker, ctx: Context): Obj {
  const rule = p.pick(shapesIn(ctx)).make(p, ctx);
  effective(p, ctx, rule);
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
      const source = p.pick(out);
      const copy: Obj = { ...source };
      const r = p.rand();
      let made: Obj;
      if (r < 0.4) made = copy;
      else if (r < 0.7) made = { ...copy, months: p.some(MONTHS, 3) };
      else if (shapeOf(copy)?.holiday) made = { ...copy, kinds: p.some(ctx.kinds, 2) };
      else {
        const from = date(p, ctx.effectiveYears);
        made = { ...copy, effectiveFrom: from };
        if (typeof made["effectiveTo"] === "string" && made["effectiveTo"] < from)
          delete made["effectiveTo"];
      }
      // 写しは元の規則の誤りを引き継ぐ
      out.push(isIntendedInvalid(source) ? markInvalid(made) : made);
    } else out.push(randomRule(p, ctx));
  }
  return out;
}

/** 毎年の月日の候補（うるう日・年をまたぐ期間・{ date } の形も混ぜる） */
const ANNUAL: readonly unknown[] = [
  "01-01",
  "01-02",
  "02-29",
  "05-01",
  "05-05",
  "08-13",
  "12-31",
  { from: "12-29", to: "01-03" },
  { from: "12-30", to: "01-02" },
  { from: "05-01", to: "05-06" },
  { date: "01-01" },
  { date: "05-05" },
];
const annualDate = (p: Picker, ctx: Context): unknown => {
  const a = p.pick(ANNUAL);
  if (typeof a === "string" || !p.chance(0.3)) return a;
  const withPeriod: Obj = { ...(a as Obj), effectiveFrom: date(p, ctx.effectiveYears) };
  if (p.chance(0.5))
    withPeriod["effectiveTo"] = addDays(withPeriod["effectiveFrom"] as string, p.int(0, 400));
  return withPeriod;
};
/** 個別の日付（日付か、21 日までの期間） */
const specificDate = (p: Picker, ctx: Context): unknown => {
  const from = date(p, ctx.years);
  return p.chance(0.5) ? from : { from, to: addDays(from, p.int(0, 20)) };
};

/** 営業日カレンダーの設定（提供元とタイムゾーンは呼び出し側が足す） */
export function randomCalendarOptions(p: Picker, ctx: Context): Obj {
  const o: Obj = { holidayPolicy: p.pick(POLICY_VALUES["HolidayPolicy"]!) };
  // 定休日は省略（既定の土日）・空・どの曜日の組み合わせも作る
  if (p.chance(0.85)) o["closedWeekdays"] = WEEKDAYS.filter(() => p.chance(0.25));
  if (p.chance(0.8)) o["closedRecurringRules"] = randomRules(p, ctx, 4);
  if (p.chance(0.4)) o["openRecurringRules"] = randomRules(p, ctx, 2);
  if (p.chance(0.45))
    o["closedAnnualDates"] = Array.from({ length: p.int(1, 3) }, () => annualDate(p, ctx));
  if (p.chance(0.45))
    o["closedDates"] = Array.from({ length: p.int(1, 4) }, () => specificDate(p, ctx));
  if (p.chance(0.3))
    o["openDates"] = Array.from({ length: p.int(1, 2) }, () => specificDate(p, ctx));
  return o;
}

/**
 * スケジュールの設定（提供元とタイムゾーンは呼び出し側が足す）。値は "A"・"B"・"C"・"closed"。
 * 第 n 営業日の規則には、数える基準のカレンダーとして calendar に CALENDAR_REF を置く（呼び出し側が本物のカレンダーに置き換える）。
 * 誤りを混ぜる文脈では、calendar のない第 n 営業日の規則（invalid-option）も作る
 */
export function randomScheduleOptions(p: Picker, ctx: Context): Obj {
  const values = ["A", "B", "C", "closed"];
  const o: Obj = {
    weekdayValues: WEEKDAYS.map((d) => (d === 0 || d === 6 ? "closed" : p.pick(values))),
    holidayPolicy: p.pick<unknown>(["ignore", { sameAs: 0 }, { value: "H" }]),
  };
  if (p.chance(0.85))
    o["recurringRules"] = randomRules(p, ctx, 4).map((r) => {
      const rule: Obj = { ...r, value: p.pick(values) };
      if (isIntendedInvalid(r)) markInvalid(rule);
      if (shapeOf(r)?.scheduleKeys !== undefined) {
        if (ctx.invalid && p.chance(0.2)) markInvalid(rule);
        else rule["calendar"] = CALENDAR_REF;
      }
      return rule;
    });
  if (p.chance(0.3)) o["annualDates"] = [{ date: "12-31", value: "closed" }];
  if (p.chance(0.25)) {
    const d = date(p, ctx.years);
    o["dates"] = [ctx.newShapes ? scheduleDate(d) : { date: d, value: "X" }];
  }
  return o;
}

/**
 * スケジュールの個別の日付。半分ほどを期間（{ from, to }。同じ年の中の 2〜7 日）にする。期間にするかと長さは、日付から
 * 決める別の乱数で選ぶ（呼び出し側の乱数の流れを変えないため。変えると、ほかのテストが試す設定がすべて変わる）
 */
function scheduleDate(d: string): Obj {
  let seed = 0;
  for (const ch of d) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const side = random(seed ^ 0x5bd1e995);
  if (side() < 0.5) return { date: d, value: "X" };
  const to = addDays(d, 1 + Math.floor(side() * 6));
  return to.slice(0, 4) === d.slice(0, 4) ? { from: d, to, value: "X" } : { date: d, value: "X" };
}

/**
 * スケジュールの第 n 営業日の規則が数える基準のカレンダーの印。呼び出し側が、同じ提供元のカレンダーに置き換える（整合の検査と
 * 変形のテストは土日休み、result-compare は設定ごとに basisClosedWeekdays で選んだ定休日）
 */
export const CALENDAR_REF: Readonly<Obj> = Object.freeze({ calendarRef: "weekends-and-holidays" });

/** "YYYY-MM-DD" に日数を足す */
export const addDays = (d: string, n: number): string =>
  iso(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000);

/** 生成した設定に現れた規則の形と、形ごとのキー（生成器の到達性の検査に使う） */
export function shapeKeysIn(options: Obj): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const k of ["closedRecurringRules", "openRecurringRules", "recurringRules"]) {
    const list = options[k];
    if (!Array.isArray(list)) continue;
    for (const r of list as Obj[]) {
      const s = shapeOf(r);
      if (!s) continue;
      const keys = out.get(s.pattern) ?? new Set<string>();
      for (const key of Object.keys(r)) keys.add(key);
      out.set(s.pattern, keys);
    }
  }
  return out;
}
