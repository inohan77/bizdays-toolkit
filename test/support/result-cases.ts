// result-compare（scripts/result-compare.ts）が比べる設定の集まり。種で決まる設定と、過去の退行を書き留めた固定の設定。
// 生成範囲の包含の検査（test/tools/generator-features.test.ts）も、同じ関数で同じ設定を作って特徴を数える。
// 提供元は名前のまま持ち、比べるときに読み込んだバージョンの提供元に置き換える。

import {
  CALENDAR_REF,
  CONTEXTS,
  beforeRename,
  picker,
  random,
  randomCalendarOptions,
  randomScheduleOptions,
  withoutHolidays,
  type Context,
  type Obj,
} from "./catalog.ts";

/** 提供元の名前（読み込んだバージョンの提供元に置き換える前の形） */
export type ProviderName = "jp" | "england" | "scotland" | "metropole" | "sg";
export const PROVIDERS: readonly ProviderName[] = ["jp", "england", "scotland", "metropole", "sg"];
export const TIME_ZONES: Record<ProviderName, string> = {
  jp: "Asia/Tokyo",
  england: "Europe/London",
  scotland: "Europe/London",
  metropole: "Europe/Paris",
  sg: "Asia/Singapore",
};
export const YEARS: Record<ProviderName, readonly [number, number]> = {
  jp: [1955, 2099],
  england: [1974, 2099],
  scotland: [1974, 2099],
  metropole: [2000, 2099],
  sg: [2020, 2027],
};

export interface Case {
  readonly id: string;
  readonly kind: "calendar" | "schedule";
  readonly providers: readonly ProviderName[];
  /** 提供元は名前のまま。比べるときに読み込んだバージョンの提供元に置き換える */
  readonly options: Obj;
  readonly from: string;
  readonly to: string;
  /** このバージョンより前のバージョンとは比べない（そのバージョンで入った形を使う固定の設定） */
  readonly minBase?: string;
  /** 合成するときのもう 1 つのカレンダー */
  readonly partner?: Case;
  readonly combine?: "all" | "any";
}

/** 種で決まる乱数（result-compare の既定の種は 20261030） */
export class Gen {
  readonly next: () => number;
  constructor(start: number) {
    this.next = random(start);
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
  some<T>(items: readonly T[], max: number): T[] {
    const n = this.int(1, Math.min(max, items.length));
    const pool = [...items];
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]!);
    return out;
  }
}

const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/** 比べる期間: 提供元の対応年が重なる範囲の内側（隣の日を見る規則が対応年の端に触れない）を、最大 6 年 */
export function rangeOf(providers: readonly ProviderName[]): [string, string] {
  let from = 2021;
  let to = 2026;
  for (const p of providers) {
    from = Math.max(from, YEARS[p][0] + 1);
    to = Math.min(to, YEARS[p][1] - 1);
  }
  return [iso(from, 1, 1), iso(to, 12, 31)];
}

/** 文脈（提供元があるか・改名の前のバージョンと比べるか）。名前は生成器の到達性のテストの名前に出る */
export function contextOf(
  withHolidays: boolean,
  newShapes: boolean,
): { name: string; ctx: Context } {
  let ctx: Context = CONTEXTS["result-compare"];
  if (!withHolidays) ctx = withoutHolidays(ctx);
  if (!newShapes) ctx = beforeRename(ctx);
  const notes = [
    ...(newShapes ? [] : ["0.22.2 と比べる"]),
    ...(withHolidays ? [] : ["提供元なし"]),
  ];
  return { name: `result-compare${notes.length > 0 ? `（${notes.join("・")}）` : ""}`, ctx };
}

function providersOf(g: Gen): ProviderName[] {
  const n = g.pick([0, 1, 1, 2, 2]);
  return n === 0 ? [] : g.some(PROVIDERS, n);
}

function sourceOptions(g: Gen, providers: readonly ProviderName[]): Obj {
  const o: Obj = {};
  if (providers.length > 0) {
    o["holidayProvider"] = providers.length === 1 && g.chance(0.5) ? providers[0] : [...providers];
    o["timeZone"] = TIME_ZONES[providers[0]!];
  }
  return o;
}

export function calendarCase(g: Gen, id: string, newShapes: boolean): Case {
  const providers = providersOf(g);
  const { ctx } = contextOf(providers.length > 0, newShapes);
  const options = { ...sourceOptions(g, providers), ...randomCalendarOptions(picker(g.next), ctx) };
  const [from, to] = rangeOf(providers);
  return { id, kind: "calendar", providers, options, from, to };
}

export function scheduleCase(g: Gen, id: string, newShapes: boolean): Case {
  const providers = providersOf(g);
  const { ctx } = contextOf(providers.length > 0, newShapes);
  const options = { ...sourceOptions(g, providers), ...randomScheduleOptions(picker(g.next), ctx) };
  const [from, to] = rangeOf(providers);
  return { id, kind: "schedule", providers, options, from, to };
}

/** 種で決まる設定の集まり（カレンダー 240 件・スケジュール 100 件に倍率を掛ける。合成の組は 4 件に 1 件） */
export function generateCases(seed: number, scale: number, newShapes: boolean): Case[] {
  const g = new Gen(seed);
  const cases: Case[] = [];
  const counts = { calendars: Math.round(240 * scale), schedules: Math.round(100 * scale) };
  for (let i = 0; i < counts.calendars; i++) {
    const c = calendarCase(g, `calendar-${i}`, newShapes);
    if (g.chance(0.25)) {
      cases.push({
        ...c,
        partner: calendarCase(g, `calendar-${i}-partner`, newShapes),
        combine: g.pick(["all", "any"]),
      });
    } else cases.push(c);
  }
  for (let i = 0; i < counts.schedules; i++)
    cases.push(scheduleCase(g, `schedule-${i}`, newShapes));
  return cases;
}

/**
 * 過去の退行を書き留めた固定の設定（乱数では当たりにくい形）。新しい退行を見つけたら、その最小の設定を足す
 * （直したバージョンを出した後も残す。同じ退行が戻ったら止めるため）
 */
export function fixedCases(): Case[] {
  const holiday = (kinds: string[]): Obj => ({ holiday: true, kinds });
  const cal = (id: string, providers: ProviderName[], options: Obj): Case => {
    const [from, to] = rangeOf(providers);
    return {
      id,
      kind: "calendar",
      providers,
      options: { holidayProvider: providers, timeZone: TIME_ZONES[providers[0]!], ...options },
      from,
      to,
    };
  };
  const sch = (id: string, providers: ProviderName[], options: Obj): Case => {
    const [from, to] = rangeOf(providers);
    return {
      id,
      kind: "schedule",
      providers,
      options: { holidayProvider: providers, timeZone: TIME_ZONES[providers[0]!], ...options },
      from,
      to,
    };
  };
  /** 提供元のないカレンダー */
  const cal0 = (id: string, options: Obj): Case => ({
    id,
    kind: "calendar",
    providers: [],
    options,
    from: "2021-01-01",
    to: "2026-12-31",
  });
  return [
    // 和集合の旧名 "national" は、日本の提供元の毎年の祝日だけに当たる（ほかの提供元の "regular" には当たらない）
    cal("fixed-union-national", ["jp", "england"], {
      holidayPolicy: "open",
      closedRecurringRules: [holiday(["national"])],
    }),
    // 日本を含む和集合の "regular" は、日本の国民の祝日にも当たる（改名で意味が広がった。etc/result-changes.json で許す）
    cal("fixed-union-regular", ["jp", "england"], {
      holidayPolicy: "open",
      closedRecurringRules: [holiday(["regular"])],
    }),
    // 日本の提供元だけの設定の "regular" と旧名の "national" の同じ規則は、後の規則が shadowed になる
    cal("fixed-jp-regular-national", ["jp"], {
      closedRecurringRules: [holiday(["regular"]), holiday(["national"])],
    }),
    cal("fixed-jp-national-regular", ["jp"], {
      closedRecurringRules: [holiday(["national"]), holiday(["regular"])],
    }),
    // 第 n 営業日を数える規則があると、数え方を変える個別の日付・毎年の月日は redundant にならない
    cal0("fixed-counting-date", {
      closedDates: ["2026-05-01"],
      closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: 1 }],
    }),
    cal0("fixed-counting-annual", {
      closedAnnualDates: ["05-01"],
      closedRecurringRules: [{ dayOfMonth: 1 }, { businessDayOfMonth: 1 }],
    }),
    // 基準のカレンダーを持つ月の規則だけの設定は、窓の外の月で基準を求めず、判定できない月を作らない（0.31.0-B の作り直しの
    // 途中で、窓の外の月を数えて never-matches・redundant を消した退行の形。規則 1 つの診断の消失はどの特徴でも許されない）
    sch("fixed-unjudgeable-month-rule-day25", ["jp"], {
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      recurringRules: [{ businessDayOfMonth: 25, calendar: CALENDAR_REF, value: "x" }],
    }),
    sch("fixed-unjudgeable-month-rules-january", ["jp"], {
      weekdayValues: ["a", "a", "a", "a", "a", "a", "a"],
      recurringRules: [
        { businessDayOfMonth: 1, months: [1], calendar: CALENDAR_REF, value: "x" },
        { businessDayOfMonth: 1, calendar: CALENDAR_REF, value: "x" },
      ],
    }),
    // スケジュールの第 n 営業日の規則の基準のカレンダーは、スケジュールの outOfRangePolicy を受け継ぐ（basisOutOfRangePolicy）。
    // "ignore" の基準は対応年の外で投げないので、診断は判定できない月を作らない。旧名の比較では outOfRange として渡る。
    // 比べる期間はシンガポールの対応年（2020〜2027 年）の外まで広げる（対応年の内側では "ignore" と "throw" の結果が同じため）
    {
      ...sch("fixed-schedule-basis-ignore", ["sg"], {
        outOfRangePolicy: "ignore",
        weekdayValues: ["closed", "A", "A", "A", "A", "A", "closed"],
        recurringRules: [
          { businessDayOfMonth: 1, calendar: CALENDAR_REF, value: "B" },
          { businessDayOfMonth: -1, months: [12], calendar: CALENDAR_REF, value: "C" },
        ],
      }),
      from: "2018-01-01",
      to: "2029-12-31",
    },
    {
      ...cal0("fixed-counting-week", {
        closedDates: ["2026-05-04"],
        closedRecurringRules: [{ weekday: 1 }, { businessDayOfWeek: 1, weekStart: 1 }],
      }),
      minBase: "0.30.0",
    },
    // 第 n 営業日の規則と有効期間が重ならない曜日の規則には counting-basis を出さない（0.30.7 までは出していた）
    cal("fixed-counting-basis-no-overlap", ["jp"], {
      closedWeekdays: [0, 6],
      closedRecurringRules: [
        { weekday: 3, effectiveTo: "2026-12-31" },
        { businessDayOfMonth: 1, effectiveFrom: "2027-01-01" },
      ],
    }),
    // 曜日の規則が 2 つなら counting-basis を 2 件出す（0.30.7 までは最初の 1 つだけ）
    cal("fixed-counting-basis-two-weekly", ["jp"], {
      closedWeekdays: [0],
      closedRecurringRules: [{ weekday: 3 }, { weekday: 6 }, { businessDayOfMonth: 1 }],
    }),
    // 開く規則と閉じる規則に曜日の規則が 1 つずつなら counting-basis を 2 件出す（0.30.7 までは開く規則の 1 件だけ）
    cal("fixed-counting-basis-open-closed-weekly", ["jp"], {
      closedWeekdays: [0, 6],
      openRecurringRules: [{ weekday: 6 }],
      closedRecurringRules: [{ weekday: 3 }, { businessDayOfMonth: 1 }],
    }),
    // 第 n 営業日の規則より後ろの曜日の規則が shadowed なら、使われている規則だけを数える（unused が確定する前に判定すると、使われない規則の分も数えて 2 件になる）
    cal("fixed-counting-basis-shadowed-weekly", ["jp"], {
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ businessDayOfMonth: 1 }, { weekday: 3 }, { weekday: 3 }],
    }),
    // カレンダーの個別の日付に書いた value は unknown-option（0.30.7 までは黙って通っていた）
    cal("fixed-calendar-date-with-value", ["jp"], {
      closedDates: [{ date: "2026-12-01", value: true }],
    }),
  ];
}

/** 祝日に従属する規則の形（同じ形の規則どうしを比べるため） */
const holidayShape = (r: Obj): string | undefined =>
  r["holiday"] === true
    ? "holiday"
    : r["dayAfterHoliday"] === true
      ? "dayAfterHoliday"
      : r["dayBeforeHoliday"] === true
        ? "dayBeforeHoliday"
        : undefined;

/**
 * スケジュールの第 n 営業日の規則が数える基準のカレンダー（CALENDAR_REF を置き換えたもの）の outOfRangePolicy。
 * スケジュールの設定のものを受け継ぐ（省略なら既定の "throw"）。result-compare の基準のカレンダーの作り方と、特徴の付け方が使う
 */
export const basisOutOfRangePolicy = (c: Case): unknown => c.options["outOfRangePolicy"];

/**
 * 1 つの設定の特徴（意図した差分を許す単位。etc/result-changes.json の trait）。合成の組の特徴は、呼び出し側が
 * 両方の設定の特徴を合わせる
 */
export function traitsOfCase(one: Case): string[] {
  const traits = new Set<string>();
  const hasJp = one.providers.includes("jp");
  const jpOnly = hasJp && one.providers.every((p) => p === "jp");
  // 自分の設定を基準に第 n 営業日を数える規則と、数え方を変える個別の日付・毎年の月日を持つカレンダー
  const counts = ["closedRecurringRules", "openRecurringRules"].some(
    (key) =>
      Array.isArray(one.options[key]) &&
      (one.options[key] as Obj[]).some(
        (r) => "businessDayOfMonth" in r || "businessDayOfWeek" in r,
      ),
  );
  if (
    one.kind === "calendar" &&
    counts &&
    ["closedDates", "openDates", "closedAnnualDates"].some(
      (k) => Array.isArray(one.options[k]) && (one.options[k] as unknown[]).length > 0,
    )
  )
    traits.add("counting-rules-with-dates");
  // 規則・日付を 2 つ以上持つ設定。redundant を逐次除去で判定し（後の規則を取り除いた後の判定）、代わりに決める規則を
  // relatedPath に付けるので、redundant の結果が変わりうる（0.31.0。1 つだけなら、ほかの規則に依存しない）
  const RULE_LISTS = [
    "closedDates",
    "openDates",
    "dates",
    "closedAnnualDates",
    "annualDates",
    "closedRecurringRules",
    "openRecurringRules",
    "recurringRules",
  ];
  const ruleCount = RULE_LISTS.reduce(
    (n, k) => n + (Array.isArray(one.options[k]) ? (one.options[k] as unknown[]).length : 0),
    0,
  );
  if (ruleCount >= 2) traits.add("redundant-sequential");
  // スケジュールの第 n 営業日の規則の基準のカレンダー（同じ提供元）の対応年が、診断の規則の形を調べる代表の 28 年間
  // （2001〜2028 年）を覆わず、基準のカレンダーが対応年の外で投げる（outOfRangePolicy が "ignore" でない）。
  // 診断が基準のカレンダーの投げた月を判定できない月として扱い、error の out-of-range を出さなくなった差分を許す
  if (
    one.kind === "schedule" &&
    basisOutOfRangePolicy(one) !== "ignore" &&
    Array.isArray(one.options["recurringRules"]) &&
    (one.options["recurringRules"] as Obj[]).some((r) => r["calendar"] === CALENDAR_REF) &&
    one.providers.some((p) => YEARS[p][0] > 2001 || YEARS[p][1] < 2028)
  )
    traits.add("schedule-counting-basis-narrower-than-scan");
  // 上の設定のうち、基準のカレンダーで週の第 n 営業日を数える規則があるもの。診断は、基準のカレンダーが投げた月の前後の月も
  // 判定できない月にする（月をまたぐ週は隣の月の基準で決まるため。0.30.7）。0.30.6 が出していた誤った never-matches・
  // redundant を出さなくなった差分を許す
  if (
    traits.has("schedule-counting-basis-narrower-than-scan") &&
    (one.options["recurringRules"] as Obj[]).some(
      (r) => r["calendar"] === CALENDAR_REF && "businessDayOfWeek" in r,
    )
  )
    traits.add("schedule-week-counting-basis-narrower-than-scan");
  // 基準のカレンダーを持たない第 n 営業日の規則があり、有効期間を持つ毎週の曜日の規則か、毎週の曜日の規則が 2 つ以上ある。
  // counting-basis を、有効期間が重なり使われている曜日の規則ごとに出すようにした差分を許す（0.30.8）
  const ownRules = ["closedRecurringRules", "openRecurringRules"].flatMap((key) =>
    Array.isArray(one.options[key]) ? (one.options[key] as Obj[]) : [],
  );
  const weeklyRules = ownRules.filter(
    (r) => "weekday" in r && !("nth" in r) && !("interval" in r) && !("months" in r),
  );
  if (
    ownRules.some(
      (r) => ("businessDayOfMonth" in r || "businessDayOfWeek" in r) && !("calendar" in r),
    ) &&
    (weeklyRules.some((r) => "effectiveFrom" in r || "effectiveTo" in r) || weeklyRules.length >= 2)
  )
    traits.add("counting-rule-with-period-weekly-rule");
  // カレンダーの個別の日付・毎年の月日の要素に value（スケジュールの書き方）がある。診断の unknown-option が増える（0.30.8）
  if (
    one.kind === "calendar" &&
    ["closedDates", "openDates", "closedAnnualDates"].some(
      (k) =>
        Array.isArray(one.options[k]) &&
        (one.options[k] as unknown[]).some(
          (e) => typeof e === "object" && e !== null && "value" in e,
        ),
    )
  )
    traits.add("calendar-date-with-value");
  for (const key of ["closedRecurringRules", "openRecurringRules", "recurringRules"]) {
    const list = one.options[key];
    if (!Array.isArray(list)) continue;
    const kindsOf = (r: Obj): string[] =>
      Array.isArray(r["kinds"]) ? (r["kinds"] as string[]) : [];
    for (const r of list as Obj[]) {
      if (hasJp && kindsOf(r).includes("regular")) traits.add("kinds-regular-with-jp");
      if (hasJp && !jpOnly && kindsOf(r).includes("national"))
        traits.add("kinds-national-in-union-with-jp");
      // 同じ配列に、同じ形で "regular" を含む規則もあるときだけ（覆う関係を比べる組）
      const shape = holidayShape(r);
      if (
        jpOnly &&
        shape !== undefined &&
        kindsOf(r).includes("national") &&
        (list as Obj[]).some(
          (x) => x !== r && holidayShape(x) === shape && kindsOf(x).includes("regular"),
        )
      )
        traits.add("kinds-national-and-regular-with-jp-only");
    }
  }
  return [...traits];
}

/** 基準のカレンダーを作るのに要る、バージョンの部品（作る関数と、提供元の名前 → 提供元） */
export interface BasisLib {
  readonly createCalendar: (options: Obj) => unknown;
  readonly providers: ReadonlyMap<string, unknown>;
}

/**
 * 基準のカレンダーの定休日（closedWeekdays。undefined は書かない）。設定の id から決める別の乱数で選ぶ（生成器の乱数の流れを
 * 変えないため）。目録の生成器が作る形（書かない・曜日の部分集合）にそろえ、実際の利用で多い土日休みを多めにする:
 * 書かない 3 割、土日 4 割、曜日ごとに 4 分の 1 で選んだ部分集合 3 割（0.30.7 までは、いつも書かなかった）
 */
export function basisClosedWeekdays(c: Case): number[] | undefined {
  let seed = 0;
  for (const ch of c.id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const r = random(seed ^ 0x2c1b3c6d);
  const pick = r();
  if (pick < 0.3) return undefined;
  if (pick < 0.7) return [0, 6];
  const days = [0, 1, 2, 3, 4, 5, 6].filter(() => r() < 0.25);
  return days.length === 7 ? [0, 6] : days; // 全曜日の定休日のカレンダーは作れないので、土日にする
}

/** 基準のカレンダーの設定に付ける印（生成範囲の検査が、基準のカレンダーの特徴を分けて数えるため。ライブラリは無視する） */
export const BASIS_MARK = Symbol.for("bizdays-toolkit.result-compare.basis");

/**
 * スケジュールの第 n 営業日の規則が数える基準のカレンダーの印（CALENDAR_REF）を、そのバージョンで作った同じ提供元の
 * カレンダーに置き換える（バージョンごとに作る。別のバージョンのカレンダーは受け付けないため）。定休日は basisClosedWeekdays。基準のカレンダーの
 * outOfRangePolicy は、スケジュールの設定のものを受け継ぐ（basisOutOfRangePolicy。特徴の付け方と同じ関数）。
 * result-compare（scripts/result-compare.ts）が前のバージョンと今回のバージョンの両方に使う。両方を同じ作り方で比べるので、この処理が壊れても
 * 差分にならない。そのため、ここに置いて test/tools/result-traits.test.ts で直接確かめる
 */
export function withCalendars(lib: BasisLib, c: Case, naming: "new" | "old", options: Obj): Obj {
  const key = naming === "old" ? "recurring" : "recurringRules";
  const list = options[key];
  if (!Array.isArray(list) || !list.some((r) => (r as Obj)["calendar"] === CALENDAR_REF))
    return options;
  const providers = c.providers.map((p) => lib.providers.get(p));
  const source: Obj =
    providers.length === 0
      ? {}
      : {
          [naming === "old" ? "holidays" : "holidayProvider"]: providers,
          timeZone: TIME_ZONES[c.providers[0]!],
        };
  const policy = basisOutOfRangePolicy(c);
  if (policy !== undefined) source[naming === "old" ? "outOfRange" : "outOfRangePolicy"] = policy;
  const closed = basisClosedWeekdays(c);
  if (closed !== undefined) source["closedWeekdays"] = closed;
  (source as Record<symbol, unknown>)[BASIS_MARK] = true;
  const calendar = lib.createCalendar(source);
  return {
    ...options,
    [key]: (list as Obj[]).map((r) => (r["calendar"] === CALENDAR_REF ? { ...r, calendar } : r)),
  };
}
