// 変形しても結果が同じ（テスト拡充案の T4）。文書で同じ意味だと約束している書き換えで、全日の結果と、位置を読み替えた
// 診断が変わらないことを、目録の生成器（test/support/catalog.ts）の設定で確かめる。設定は、対応年の短い自作の提供元
// （2025〜2027 年）・その提供元と別の自作の提供元の和集合・提供元なしを含む。
// pnpm check は決まった抜き出しだけ（METAMORPHIC_FULL=1 で件数を増やせる）。どの関係も暦日だけで決まるので、タイムゾーンを
// 変えた実行では飛ばす。関係ごとに試した設定の数を出し、0 件なら失敗にする。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineCalendars,
  createCalendar,
  createSchedule,
  isBizdaysError,
  type CalendarOptions,
  type Holiday,
  type HolidayProvider,
  type ScheduleOptions,
} from "../src/index.ts";
import { diagnoseCalendar, diagnoseSchedule } from "../src/diagnose/index.ts";
import { RENAMED_KEYS, RENAMED_VALUES, type RenamedPlace } from "../src/core/renamed.ts";
import { jp } from "../src/jp/index.ts";
import {
  CALENDAR_REF,
  CONTEXTS,
  addDays,
  picker,
  random,
  randomCalendarOptions,
  randomScheduleOptions,
  withoutHolidays,
  type Context,
  type Obj,
} from "./support/catalog.ts";
import { flagEnv } from "./support/env.ts";
import { SHORT_DAYS, SHORT_PROVIDER } from "./support/provider.ts";
import { skipWhen } from "./support/skip.ts";

const SKIP = skipWhen("tz-run", flagEnv("BIZDAYS_TZ_RUN"));
/** 関係ごと・種類ごとの設定の数（期間の分割と並べ替えは、当てはまる設定が少なく軽いので 4 倍） */
const RUNS = flagEnv("METAMORPHIC_FULL") ? 40 : 5;
const RUNS_LIGHT = RUNS * 4;
type Kind = "calendar" | "schedule";

/** 和集合に使う 2 つ目の自作の提供元（対応年は同じ。8 月 15 日と 11 月 3 日を祝日にする） */
const SECOND_PROVIDER: HolidayProvider<string> = {
  id: "YY",
  timeZone: "UTC",
  supportedYears: { from: 2025, to: 2027 },
  dataVersion: "2026-10",
  holidaysInYear: (year) =>
    [
      [`${year}-08-15`, "obon"],
      [`${year}-11-03`, "culture"],
    ].map(([date, key]) => ({
      date: date!,
      name: key!,
      nameEn: key!,
      kind: "regular",
      key: key!,
      confirmed: true,
    })),
};
const SHORT_CTX: Context = CONTEXTS["diagnose-properties"];
/** 提供元の組み合わせ（自作の提供元・和集合・提供元なし） */
const SOURCES: readonly (readonly HolidayProvider<string>[] | undefined)[] = [
  [SHORT_PROVIDER],
  [SHORT_PROVIDER, SECOND_PROVIDER],
  undefined,
];
const sourceOf = (providers: readonly HolidayProvider<string>[] | undefined): Obj =>
  providers === undefined
    ? {}
    : {
        holidayProvider: providers.length === 1 ? providers[0] : [...providers],
        timeZone: "UTC",
      };

/** 目録の設定（提供元は run で回す。スケジュールの第 n 営業日の規則は、同じ提供元の土日休みのカレンダーで数える） */
function optionsOf(
  kind: Kind,
  rand: () => number,
  run: number,
  sources: readonly (readonly HolidayProvider<string>[] | undefined)[] = SOURCES,
): Obj {
  const providers = sources[run % sources.length];
  // 日本の提供元は、日本の種別とキーの文脈で作る
  const ctx =
    providers === undefined
      ? withoutHolidays(SHORT_CTX)
      : providers.some((p) => p.id === "JP")
        ? CONTEXTS.properties
        : SHORT_CTX;
  const p = picker(rand);
  const o: Obj = {
    ...sourceOf(providers),
    ...(kind === "calendar" ? randomCalendarOptions(p, ctx) : randomScheduleOptions(p, ctx)),
  };
  if (Array.isArray(o["recurringRules"])) {
    const basis = createCalendar({
      ...sourceOf(providers),
      closedWeekdays: [0, 6],
    } as CalendarOptions);
    o["recurringRules"] = (o["recurringRules"] as Obj[]).map((r) =>
      r["calendar"] === CALENDAR_REF ? { ...r, calendar: basis } : r,
    );
  }
  return o;
}

type Made = { dayInfoOn(d: string): unknown; isBusinessDay?(d: string): boolean };
/** 作成（設定の誤りで作成できなければ、エラーコードの文字列） */
function make(kind: Kind, options: Obj): Made | string {
  try {
    return kind === "calendar"
      ? createCalendar(options as CalendarOptions)
      : createSchedule(options as unknown as ScheduleOptions<unknown>);
  } catch (e) {
    if (!isBizdaysError(e)) throw e;
    return `error ${e.code}`;
  }
}
/** 結果と診断の読み替え（変形した側の位置と祝日の種別を、元の設定の位置と種別にする） */
interface Mapping {
  readonly mapPath?: (path: string) => string;
  readonly fixKind?: (k: string) => string;
}
/** 1 日の結果（dayInfoOn の結果。合成の decidedBy・decidedByPath は除き、位置と祝日の種別は読み替える。投げればエラーコード） */
function dayOf(made: Made, day: string, mapping: Mapping): string {
  try {
    const info = made.dayInfoOn(day) as Obj;
    const { decidedBy: _decidedBy, decidedByPath: _decidedByPath, ...rest } = info;
    const holiday = rest["holiday"] as Obj | null | undefined;
    if (holiday && mapping.fixKind)
      rest["holiday"] = { ...holiday, kind: mapping.fixKind(holiday["kind"] as string) };
    for (const key of ["rulePath", "optionPath"])
      if (typeof rest[key] === "string" && mapping.mapPath)
        rest[key] = mapping.mapPath(rest[key] as string);
    return JSON.stringify(rest);
  } catch (e) {
    if (!isBizdaysError(e)) throw e;
    return `error ${e.code}`;
  }
}
/** 対応年の全日の結果 */
function resultsOf(made: Made | string, mapping: Mapping = {}): string[] {
  if (typeof made === "string") return [made];
  return SHORT_DAYS.map((d) => dayOf(made, d, mapping));
}

/**
 * 診断の要点（重さ・コード・読み替えた位置と、関わる項目の位置 relatedPath）。旧名の deprecated-option は除く（旧名で
 * 書いたことだけを知らせる）。relatedPath にも、位置と同じ読み替えを当てる
 */
function diagnosticsOf(kind: Kind, options: Obj, mapPath: (path: string) => string = (p) => p) {
  const issues = kind === "calendar" ? diagnoseCalendar(options) : diagnoseSchedule(options);
  return [
    ...new Set(
      issues
        .filter((d) => d.code !== "deprecated-option")
        .map(
          (d) =>
            `${d.severity} ${d.code} ${mapPath(d.path)}` +
            (d.relatedPath === undefined ? "" : ` -> ${mapPath(d.relatedPath)}`),
        ),
    ),
  ].sort();
}

/** 元の設定の結果と診断（同じ設定を複数の変形と比べるので、1 回だけ求める） */
const baselines = new WeakMap<Obj, { results: string[]; diagnostics: string[] }>();
function baselineOf(kind: Kind, original: Obj): { results: string[]; diagnostics: string[] } {
  let b = baselines.get(original);
  if (b === undefined) {
    b = {
      results: resultsOf(make(kind, original)),
      diagnostics: diagnosticsOf(kind, original),
    };
    baselines.set(original, b);
  }
  return b;
}

/** 変形した設定の結果と、位置を読み替えた診断が、元の設定と同じことを確かめる */
function assertSame(
  kind: Kind,
  context: string,
  original: Obj,
  changed: Obj,
  mapping: Mapping = {},
): void {
  const base = baselineOf(kind, original);
  assert.deepEqual(
    resultsOf(make(kind, changed), mapping),
    base.results,
    `${context}: 結果が変わった`,
  );
  assert.deepEqual(
    diagnosticsOf(kind, changed, mapping.mapPath),
    base.diagnostics,
    `${context}: 診断が変わった`,
  );
}

const tried: Record<string, number> = {};
/** 件数の行を出し、0 件なら失敗にする（unit は数えたもの） */
const report = (relation: string, unit = "設定"): void => {
  console.log(`# ${relation}: 試した${unit} ${tried[relation] ?? 0} 件`);
  assert.ok((tried[relation] ?? 0) > 0, `${relation}: 試した${unit}が 0 件（空振り）`);
};
const count = (relation: string): void => {
  tried[relation] = (tried[relation] ?? 0) + 1;
};

/** 関係ごとに、カレンダーとスケジュールの目録の設定で試す */
function eachOptions(
  seed: number,
  kinds: readonly Kind[],
  body: (kind: Kind, o: Obj, context: string, run: number) => void,
  runs = RUNS,
  sources: readonly (readonly HolidayProvider<string>[] | undefined)[] = SOURCES,
) {
  const rand = random(seed);
  for (let run = 0; run < runs; run++)
    for (const kind of kinds)
      body(kind, optionsOf(kind, rand, run, sources), `run=${run} ${kind}`, run);
}

// ------------------------------------------------------------
// 1. 旧名と新しい名前
// ------------------------------------------------------------

const renamedTo = (places: readonly RenamedPlace[], from: string): string | undefined =>
  RENAMED_KEYS.find((r) => places.includes(r.place) && r.from === from)?.to;
const renamedFrom = (places: readonly RenamedPlace[], to: string): string | undefined =>
  RENAMED_KEYS.find((r) => places.includes(r.place) && r.to === to)?.from;
/** 改名した値の新しい値 → 旧い値（場所とキーで引く） */
const oldValueOf = (place: RenamedPlace, key: string, to: unknown): string | undefined =>
  RENAMED_VALUES.find((r) => r.place === place && r.key === key && r.to === to)?.from;
const RULE_LISTS = ["closedRecurringRules", "openRecurringRules", "recurringRules"];
const OLD_RULE_LISTS = RULE_LISTS.map(
  (list) => renamedFrom(["calendar", "schedule"], list) ?? list,
);

/** 祝日の提供元がすべて ID "JP" か（kinds の旧い値 "national" は、この設定でだけ "regular" と同じ意味になる。docs/decisions.md の 10 番） */
function onlyJapan(options: Obj): boolean {
  const p = options["holidayProvider"];
  const list = (Array.isArray(p) ? p : p === undefined ? [] : [p]) as HolidayProvider<string>[];
  return list.length > 0 && list.every((x) => x.id === "JP");
}

/**
 * 新しい名前の設定を、0.30.0 の改名の前の名前と値で書く。キーは旧名の表（RENAMED_KEYS）の場所で引き、値は改名した値の表
 * （RENAMED_VALUES）で戻す: スケジュールの holidayPolicy の "ignore" → "weekday" と、日本の提供元だけの設定の規則の
 * kinds の "regular" → "national"。旧い値に戻した数も返す
 */
function toOld(options: Obj, kind: Kind): { options: Obj; oldValues: number } {
  const out: Obj = {};
  let oldValues = 0;
  const japan = onlyJapan(options);
  for (const [k, v] of Object.entries(options)) {
    const value = RULE_LISTS.includes(k)
      ? (v as Obj[]).map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([rk, rv]) => {
              let old = rv;
              if (japan && rk === "kinds" && Array.isArray(rv)) {
                old = rv.map((x: unknown) => {
                  const o = oldValueOf("rule", "kinds", x);
                  if (o === undefined) return x;
                  oldValues++;
                  return o;
                });
              }
              return [renamedFrom(["rule"], rk) ?? rk, old];
            }),
          ),
        )
      : v;
    out[renamedFrom(["source", kind], k) ?? k] = value;
  }
  if (kind === "schedule") {
    const old = oldValueOf("schedule", "holidayPolicy", out["holiday"]);
    if (old !== undefined) {
      out["holiday"] = old;
      oldValues++;
    }
  }
  return { options: out, oldValues };
}

/**
 * 診断の位置の旧名を新しい名前にする。位置の各段を、その段の場所の旧名で引く: 先頭は設定の場所（source と、カレンダー・
 * スケジュール）、繰り返しの規則の一覧の要素の直下は規則の場所。ほかの段（毎年の日付の中など）は読み替えない
 */
function pathToNew(kind: Kind): (path: string) => string {
  return (path) => {
    const segments = path.split(".");
    let parent = "";
    return segments
      .map((segment, i) => {
        const name = /^[A-Za-z]+/.exec(segment)?.[0] ?? "";
        const places: readonly RenamedPlace[] =
          i === 0
            ? ["source", kind]
            : i === 1 && (RULE_LISTS.includes(parent) || OLD_RULE_LISTS.includes(parent))
              ? ["rule"]
              : [];
        const to = renamedTo(places, name);
        if (i === 0) parent = name;
        return to === undefined ? segment : to + segment.slice(name.length);
      })
      .join(".");
  };
}

test("変形 1 の位置の読み替え: 位置の各段を、その段の場所の旧名で引く", () => {
  const cal = pathToNew("calendar");
  const sch = pathToNew("schedule");
  assert.equal(cal("closedRecurring[0].day"), "closedRecurringRules[0].dayOfMonth");
  assert.equal(cal("openRecurring[2].onHolidayRule"), "openRecurringRules[2].holidayOverlapPolicy");
  assert.equal(cal("closedAnnual[1]"), "closedAnnualDates[1]");
  assert.equal(cal("holidays"), "holidayProvider");
  // 規則の場所の旧名（day・onHolidayRule）は、規則の一覧の要素の直下でだけ読み替える
  assert.equal(cal("closedAnnualDates[0].day"), "closedAnnualDates[0].day");
  assert.equal(cal("closedDates[0].day"), "closedDates[0].day");
  assert.equal(cal("closedRecurringRules[0].kinds[0].day"), "closedRecurringRules[0].kinds[0].day");
  // スケジュールの旧名 holiday は先頭でだけ読み替え、規則の holiday（祝日の規則）は読み替えない
  assert.equal(sch("holiday"), "holidayPolicy");
  assert.equal(sch("recurring[1].holiday"), "recurringRules[1].holiday");
  assert.equal(sch("annual[0].day"), "annualDates[0].day");
  // カレンダーの旧名はスケジュールでは読み替えない（逆も）
  assert.equal(sch("closedRecurring[0]"), "closedRecurring[0]");
  assert.equal(cal("weekly"), "weekly");
});

/** 関係 1 で使う提供元の組み合わせ（日本の提供元だけの設定を加える。kinds の旧い値 "national" を試すため） */
const SOURCES_WITH_JAPAN: readonly (readonly HolidayProvider<string>[] | undefined)[] = [
  ...SOURCES,
  [jp as HolidayProvider<string>],
];

/**
 * 関係 1 の決まった設定（日本の提供元だけ。規則の kinds に "regular" を持ち、毎回旧い値 "national" を試す）。
 * どちらも、祝日の種別が "regular" の日にだけ当たる規則なので、"regular" を誤った値に変えると結果が変わる
 * （変形 1 のテストの中で、"regular" を "substitute" に変えた結果と比べて確かめる）。スケジュールは holidayPolicy の "ignore"（旧い値 "weekday"）も試す
 */
const JAPAN_FIXED: readonly { kind: Kind; options: Obj }[] = [
  {
    kind: "calendar",
    options: {
      holidayProvider: jp,
      timeZone: "Asia/Tokyo",
      holidayPolicy: "open",
      closedWeekdays: [0, 6],
      closedRecurringRules: [{ holiday: true, kinds: ["regular"] }],
    },
  },
  {
    kind: "schedule",
    options: {
      holidayProvider: jp,
      timeZone: "Asia/Tokyo",
      weekdayValues: ["closed", "A", "A", "A", "A", "A", "closed"],
      holidayPolicy: "ignore",
      recurringRules: [{ holiday: true, kinds: ["regular"], value: "closed" }],
    },
  },
];
/** 規則の kinds の "regular" を、別の値に変える（決まった設定が "regular" に頼っていることを確かめるため） */
function withKind(options: Obj, kind: string): Obj {
  const out: Obj = { ...options };
  for (const list of RULE_LISTS)
    if (Array.isArray(out[list]))
      out[list] = (out[list] as Obj[]).map((r) =>
        Array.isArray(r["kinds"])
          ? { ...r, kinds: (r["kinds"] as string[]).map((k) => (k === "regular" ? kind : k)) }
          : r,
      );
  return out;
}

test(
  "変形 1: 旧名・旧い値で書いた設定は、新しい名前の設定と結果・診断が同じ（和集合を含む）",
  { skip: SKIP },
  () => {
    const check = (kind: Kind, o: Obj, context: string): void => {
      const { options: old, oldValues } = toOld(o, kind);
      // 旧名・旧い値に書き換わる項目のない設定は数えない
      if (JSON.stringify(old) === JSON.stringify(o)) return;
      assertSame(kind, context, o, old, { mapPath: pathToNew(kind) });
      count("変形 1（旧名）");
      if (oldValues > 0) count("変形 1（旧い値）");
    };
    JAPAN_FIXED.forEach(({ kind, options }, i) => {
      const context = `fixed=${i} ${kind}`;
      // "regular" を誤った値（"substitute"）に変えると結果が変わる（旧い値の戻し方の誤りを見逃さない設定であること）
      assert.notDeepEqual(
        resultsOf(make(kind, withKind(options, "substitute"))),
        baselineOf(kind, options).results,
        `${context}: "regular" を変えても結果が変わらない（旧い値を試す設定にならない）`,
      );
      check(kind, options, context);
      count("変形 1（日本の提供元の決まった設定）");
    });
    eachOptions(20261121, ["calendar", "schedule"], check, RUNS, SOURCES_WITH_JAPAN);
    report("変形 1（旧名）");
    report("変形 1（旧い値）");
    report("変形 1（日本の提供元の決まった設定）");
  },
);

// ------------------------------------------------------------
// 2. 同じ id で包み直した提供元・種別を付け替えた提供元
// ------------------------------------------------------------

/** 提供元を包み直す（同じ id。holidaysInYear は元の結果を写し、kind を付け替える） */
function wrapProvider(
  p: HolidayProvider<string>,
  kindOf: (k: string) => string = (k) => k,
): HolidayProvider<string> {
  return {
    id: p.id,
    timeZone: p.timeZone,
    supportedYears: { ...p.supportedYears },
    dataVersion: p.dataVersion,
    holidaysInYear: (year: number) =>
      p.holidaysInYear(year).map((h): Holiday<string> => ({ ...h, kind: kindOf(h.kind) })),
  };
}
/** 設定の提供元（スケジュールの第 n 営業日の規則の基準のカレンダーも）を包み直し、規則の kinds も付け替える */
function rewrap(options: Obj, kindOf?: (k: string) => string): Obj {
  const providers = options["holidayProvider"];
  if (providers === undefined) return options;
  const wrapped = Array.isArray(providers)
    ? providers.map((p: HolidayProvider<string>) => wrapProvider(p, kindOf))
    : wrapProvider(providers as HolidayProvider<string>, kindOf);
  const out: Obj = { ...options, holidayProvider: wrapped };
  const basis = createCalendar({
    holidayProvider: wrapped,
    timeZone: "UTC",
    closedWeekdays: [0, 6],
  } as CalendarOptions);
  for (const list of RULE_LISTS) {
    if (!Array.isArray(out[list])) continue;
    out[list] = (out[list] as Obj[]).map((r) => {
      const rule: Obj = { ...r };
      if (kindOf && Array.isArray(rule["kinds"]))
        rule["kinds"] = (rule["kinds"] as string[]).map(kindOf);
      if ("calendar" in rule && rule["calendar"] !== undefined) rule["calendar"] = basis;
      return rule;
    });
  }
  return out;
}

test(
  "変形 2: 同じ id で包み直した提供元と、種別を付け替えて kinds も直した提供元は、結果・診断が同じ",
  { skip: SKIP },
  () => {
    const renamed = (k: string): string => `renamed-${k}`;
    const back = (k: string): string => k.replace(/^renamed-/, "");
    eachOptions(20261122, ["calendar", "schedule"], (kind, o, context, run) => {
      if (o["holidayProvider"] === undefined) return;
      // 1 つの設定に 2 つの変形を試すと重いので、試行ごとに交互に試す
      if (run % 2 === 0) {
        assertSame(kind, `${context} 包み直し`, o, rewrap(o));
        count("変形 2（包み直し）");
      } else {
        assertSame(kind, `${context} 種別の付け替え`, o, rewrap(o, renamed), { fixKind: back });
        count("変形 2（種別の付け替え）");
      }
    });
    report("変形 2（包み直し）");
    report("変形 2（種別の付け替え）");
  },
);

// ------------------------------------------------------------
// 3. 期間の個別の日付と、それを分けた複数の日付
// ------------------------------------------------------------

/** 期間を持てる個別の日付の一覧（カレンダーの closedDates・openDates と、スケジュールの dates） */
const DATE_LISTS = ["closedDates", "openDates", "dates"];

/** 期間を分けた結果: 分けた後の設定、分けた後の位置 → 元の位置の表、分けた期間の元の位置 → 分けた 2 つの位置 */
interface Split {
  readonly options: Obj;
  readonly origin: Record<string, number[]>;
  readonly pieces: Map<string, [string, string]>;
}

/** 期間の個別の日付（from と to が違うもの）を、真ん中で 2 つに分ける（only を渡したら、その位置の期間だけを分ける） */
function splitPeriods(options: Obj, only?: ReadonlySet<string>): Split | undefined {
  const out: Obj = { ...options };
  const origin: Record<string, number[]> = {};
  const pieces = new Map<string, [string, string]>();
  for (const list of DATE_LISTS) {
    if (!Array.isArray(options[list])) continue;
    const entries: unknown[] = [];
    origin[list] = [];
    (options[list] as unknown[]).forEach((entry, i) => {
      const e = entry as Obj;
      if (
        typeof entry === "object" &&
        typeof e["from"] === "string" &&
        e["to"] !== e["from"] &&
        (only === undefined || only.has(`${list}[${i}]`))
      ) {
        const from = e["from"] as string;
        const to = e["to"] as string;
        const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
        const mid = addDays(from, Math.floor(days / 2));
        pieces.set(`${list}[${i}]`, [
          `${list}[${entries.length}]`,
          `${list}[${entries.length + 1}]`,
        ]);
        entries.push({ ...e, from, to: mid }, { ...e, from: addDays(mid, 1), to });
        origin[list]!.push(i, i);
      } else {
        entries.push(entry);
        origin[list]!.push(i);
      }
    });
    out[list] = entries;
  }
  return pieces.size > 0 ? { options: out, origin, pieces } : undefined;
}

/**
 * 分けた期間の元の診断が、分けた 2 つにどう出るか（コードごとの向きと、分けた後にどのコードとして出てよいか）。
 * - redundant: 元の期間が取り除けるなら、その一部も取り除けるので、両方に出る。ただし片方が同じ一覧のほかの期間に
 *   含まれると、その片方には redundant の代わりに shadowed が出る（取り除けることを、覆う項目まで示して言う診断）
 * - expired: どちらも元の終わり以前に終わるので、両方に出る
 * - out-of-range: 元の期間の一部が対応年の外にあるので、その部分を含む少なくとも一方に出る
 * - shadowed: 元の期間がほかの期間に含まれるなら、その一部も含まれるので、両方に出る。ただし覆っていた期間も分けると、
 *   片方がどちらにもすっかりは含まれなくなり、shadowed の代わりに redundant が出る（取り除けることは変わらない）
 */
const ORIGINAL_SPREAD: Readonly<
  Record<string, { readonly spread: "both" | "either"; readonly as: readonly string[] }>
> = {
  redundant: { spread: "both", as: ["redundant", "shadowed"] },
  expired: { spread: "both", as: ["expired"] },
  "out-of-range": { spread: "either", as: ["out-of-range"] },
  shadowed: { spread: "both", as: ["shadowed", "redundant"] },
};
/**
 * relatedPath を比べない場合と理由。元の診断が、分けた後に ORIGINAL_SPREAD の別のコードとして出たとき（元の redundant が
 * shadowed として出る、元の shadowed が redundant として出る）は、関わる項目があるかどうかがコードで決まるので、
 * relatedPath は比べない（件数の行「コードが変わり relatedPath を比べない項目」）
 */
const RELATED_NOT_COMPARED = {
  label: "変形 3（コードが変わり relatedPath を比べない項目）",
  reason:
    "診断のコードが変わると、関わる項目（relatedPath）があるかどうかも変わる（shadowed は覆う項目を指し、redundant は指さない）",
} as const;

/** 分けた後に、元の期間になかった診断が新しく出てよいコードと理由 */
const NEW_AFTER_SPLIT: Readonly<Record<string, string>> = {
  redundant: "分けた片方だけが、ほかの設定（定休日など）で休業日の日だけからなり、取り除ける",
  "out-of-range":
    "分けた片方だけが対応年の外の日を含む（元の期間の out-of-range は少なくとも一方に出る）",
  shadowed:
    "分けた片方が、同じ一覧のほかの期間に含まれる（元の期間は、ほかの期間と一部だけが重なっていた）",
};

type Issue = { severity: string; code: string; path: string; relatedPath?: string | undefined };
const issuesOf = (kind: Kind, options: Obj): Issue[] =>
  (kind === "calendar" ? diagnoseCalendar(options) : diagnoseSchedule(options))
    .filter((d) => d.code !== "deprecated-option")
    .map((d) => ({ severity: d.severity, code: d.code, path: d.path, relatedPath: d.relatedPath }));
const line = (d: Issue): string =>
  `${d.severity} ${d.code} ${d.path}` + (d.relatedPath === undefined ? "" : ` -> ${d.relatedPath}`);
/** 診断の位置の先頭の項目（closedDates[3] など）と、その下の位置 */
const headOf = (path: string): { head: string; rest: string } => {
  const m = /^([A-Za-z]+\[\d+\])(.*)$/.exec(path);
  return m ? { head: m[1]!, rest: m[2]! } : { head: path, rest: "" };
};

/**
 * 分けた期間のほかの位置で、診断が変わってよい場合と理由。元の診断が、分けた期間を覆う側として指す shadowed
 * （relatedPath が分けた期間）なら、分けた後は redundant になってよい。覆っていた期間が分かれると、どちらの片方にも
 * すっかりは含まれなくなることがあるが、取り除けることは変わらないため
 */
const OTHERS_MAY_CHANGE = {
  from: "shadowed",
  to: "redundant",
  reason:
    "覆っていた期間が分かれて、どちらの片方にもすっかりは含まれなくなった（取り除けることは変わらない）",
} as const;

/**
 * 決まった設定（定休日の土日と、期間の個別の日付）。分けた片方だけ・両方が取り除ける場合、対応年の外の場合、
 * 分けた期間に覆われていたほかの期間がある場合と、スケジュールの期間（目録の生成器はスケジュールの期間を作らない）を必ず含める
 */
const SPLIT_FIXED: readonly { kind: Kind; options: Obj; only?: ReadonlySet<string> }[] = [
  ...[
    // 土日だけの期間（元が redundant → 分けた両方が redundant）
    { closedDates: [{ from: "2025-03-01", to: "2025-03-02" }] },
    // 土曜日〜火曜日（元は取り除けない → 分けた前半の土日だけが新しく redundant）
    { closedDates: [{ from: "2025-03-01", to: "2025-03-04" }] },
    // 対応年の終わりをまたぐ期間（元が out-of-range → 後半だけに out-of-range）
    { closedDates: [{ from: "2027-12-29", to: "2028-01-03" }] },
    // 2 つ目の期間は 1 つ目に含まれ（shadowed）、1 つ目の真ん中（03-05 と 03-06 の間）をまたぐ
    {
      closedDates: [
        { from: "2025-03-03", to: "2025-03-07" },
        { from: "2025-03-04", to: "2025-03-06" },
      ],
    },
  ].map((o) => ({
    kind: "calendar" as Kind,
    options: {
      holidayProvider: SHORT_PROVIDER,
      timeZone: "UTC",
      closedWeekdays: [0, 6],
      ...o,
    } as Obj,
  })),
  // 上の 2 つの期間で、1 つ目だけを分ける（分けていない 2 つ目は、shadowed から redundant になる。OTHERS_MAY_CHANGE）
  {
    kind: "calendar",
    options: {
      holidayProvider: SHORT_PROVIDER,
      timeZone: "UTC",
      closedWeekdays: [0, 6],
      closedDates: [
        { from: "2025-03-03", to: "2025-03-07" },
        { from: "2025-03-04", to: "2025-03-06" },
      ],
    },
    only: new Set(["closedDates[0]"]),
  },
  // 分けた期間の後ろにある、分けていない期間どうしの shadowed（分けると番号がずれるので、relatedPath も読み替えて比べる）
  {
    kind: "calendar",
    options: {
      holidayProvider: SHORT_PROVIDER,
      timeZone: "UTC",
      closedWeekdays: [0, 6],
      closedDates: [
        { from: "2025-03-03", to: "2025-03-07" },
        { from: "2025-03-10", to: "2025-03-14" },
        "2025-03-12",
      ],
    },
    only: new Set(["closedDates[0]"]),
  },
  ...[
    // スケジュールの土日だけの期間（元が redundant → 分けた両方が redundant）
    [{ from: "2025-03-01", to: "2025-03-02", value: "closed" }],
    // スケジュールの土曜日〜火曜日（分けた前半の土日だけが新しく redundant）
    [{ from: "2025-03-01", to: "2025-03-04", value: "closed" }],
  ].map((dates) => ({
    kind: "schedule" as Kind,
    options: {
      holidayProvider: SHORT_PROVIDER,
      timeZone: "UTC",
      weekdayValues: ["closed", "A", "A", "A", "A", "A", "closed"],
      holidayPolicy: { sameAs: 0 },
      dates,
    } as Obj,
  })),
];

test(
  "変形 3: 期間の個別の日付を分けても結果が同じで、診断は分けた期間のほかは同じ、分けた期間はコードごとの向きに従う",
  { skip: SKIP },
  () => {
    const check = (kind: Kind, o: Obj, context: string, only?: ReadonlySet<string>): void => {
      const split = splitPeriods(o, only);
      if (split === undefined) return;
      const mapPath = (path: string): string =>
        path.replace(
          /^(closedDates|openDates|dates)\[(\d+)\]/,
          (_, list: string, i: string) => `${list}[${split.origin[list]![Number(i)]}]`,
        );
      assert.deepEqual(
        resultsOf(make(kind, split.options), { mapPath }),
        baselineOf(kind, o).results,
        `${context}: 結果が変わった`,
      );
      const before = issuesOf(kind, o);
      const after = issuesOf(kind, split.options);
      const pieceOf = new Map<string, string>();
      for (const [original, [a, b]] of split.pieces) {
        pieceOf.set(a, original);
        pieceOf.set(b, original);
      }
      // 分けた期間のほかの位置の診断は、完全に同じ（全日の結果が同じなので、変わる理由がない）。ただし、分けた期間を
      // 覆う側として指していた shadowed は、分けた後に redundant になってよい（OTHERS_MAY_CHANGE）
      const othersBefore = before
        .filter((d) => !split.pieces.has(headOf(d.path).head))
        .map(line)
        .sort();
      // 変わってよい項目の位置と、元の診断（戻すときは元の重さを使う）
      const mayChange = new Map(
        before
          .filter(
            (d) =>
              !split.pieces.has(headOf(d.path).head) &&
              d.code === OTHERS_MAY_CHANGE.from &&
              d.relatedPath !== undefined &&
              split.pieces.has(headOf(d.relatedPath).head),
          )
          .map((d) => [d.path, d] as const),
      );
      const othersAfter = after
        .filter((d) => !pieceOf.has(headOf(d.path).head))
        .map((d): string => {
          const mapped = {
            ...d,
            path: mapPath(d.path),
            relatedPath: d.relatedPath === undefined ? undefined : mapPath(d.relatedPath),
          };
          if (mapped.code === OTHERS_MAY_CHANGE.to && mayChange.has(mapped.path)) {
            count("変形 3（覆っていた期間が分かれて shadowed から redundant になった項目）");
            return line(mayChange.get(mapped.path)!);
          }
          return line(mapped);
        })
        .sort();
      assert.deepEqual(
        othersAfter,
        othersBefore,
        `${context}: 分けた期間のほかの位置の診断が変わった`,
      );
      // 分けた期間の診断は、コードごとの向きに従う
      for (const [original, [a, b]] of split.pieces) {
        // 分けた期間の診断は、コードと、その項目の下の位置と、relatedPath（分けた側は読み替える）で比べる
        // （shadowed と redundant は重さが違うので、重さは見ない）
        type Entry = { code: string; rest: string; rel: string };
        const at = (list: Issue[], head: string, mapped: boolean): Entry[] =>
          list
            .filter((d) => headOf(d.path).head === head)
            .map((d) => ({
              code: d.code,
              rest: headOf(d.path).rest,
              rel:
                d.relatedPath === undefined ? "" : mapped ? mapPath(d.relatedPath) : d.relatedPath,
            }));
        const show = (e: Entry): string => `${e.code}${e.rest}${e.rel ? ` -> ${e.rel}` : ""}`;
        const orig = at(before, original, false);
        const first = at(after, a, true);
        const second = at(after, b, true);
        const accepted = new Set<Entry>();
        for (const d of orig) {
          const rule = ORIGINAL_SPREAD[d.code];
          assert.ok(
            rule !== undefined,
            `${context}: ${original} の ${d.code} の向きを決めていない`,
          );
          // 同じコードなら relatedPath まで同じ。別のコードとして出た（RELATED_NOT_COMPARED）なら relatedPath は比べない
          const matches = (e: Entry): boolean =>
            e.rest === d.rest && (e.code === d.code ? e.rel === d.rel : rule.as.includes(e.code));
          const inA = first.filter(matches);
          const inB = second.filter(matches);
          for (const e of [...inA, ...inB]) {
            accepted.add(e);
            if (e.code !== d.code) count(RELATED_NOT_COMPARED.label);
          }
          assert.ok(
            rule.spread === "both" ? inA.length > 0 && inB.length > 0 : inA.length + inB.length > 0,
            `${context}: ${original} の「${show(d)}」が、分けた${rule.spread === "both" ? "両方" : "どちらか"}に出ない`,
          );
          if (d.code === "redundant") count("変形 3（元の redundant を分けた組）");
        }
        for (const [piece, list, other] of [
          [a, first, second],
          [b, second, first],
        ] as const) {
          for (const e of list.filter((x) => !accepted.has(x))) {
            assert.ok(
              e.code in NEW_AFTER_SPLIT,
              `${context}: 分けた ${piece} に、元の ${original} にない「${show(e)}」が出た（新しく出てよいコードではない）`,
            );
            if (!other.some((x) => show(x) === show(e)))
              count("変形 3（分けた片方だけの新しい診断）");
          }
        }
      }
      count(kind === "schedule" ? "変形 3（スケジュールの期間の分割）" : "変形 3（期間の分割）");
    };
    SPLIT_FIXED.forEach(({ kind, options, only }, i) =>
      check(kind, options, `fixed=${i} ${kind}`, only),
    );
    eachOptions(20261123, ["calendar"], (kind, o, context) => check(kind, o, context), RUNS_LIGHT);
    report("変形 3（期間の分割）");
    report("変形 3（元の redundant を分けた組）", "組");
    report("変形 3（分けた片方だけの新しい診断）", "診断の項目");
    report("変形 3（覆っていた期間が分かれて shadowed から redundant になった項目）", "診断の項目");
    report("変形 3（スケジュールの期間の分割）");
    report(RELATED_NOT_COMPARED.label, "診断の項目");
  },
);

// ------------------------------------------------------------
// 4. 順番が意味を持たない配列の並べ替え
// ------------------------------------------------------------

const UNORDERED = ["closedWeekdays", "kinds", "keys", "weekdays"];

/** closedWeekdays と、規則の kinds・keys・weekdays を逆順にする（並びが変わった配列があれば返す） */
function reverseUnordered(options: Obj): Obj | undefined {
  let changed = false;
  const reverse = (o: Obj): Obj => {
    const out: Obj = { ...o };
    for (const key of UNORDERED) {
      const list = o[key];
      if (Array.isArray(list) && list.length >= 2) {
        out[key] = [...list].reverse();
        changed = true;
      }
    }
    return out;
  };
  const out = reverse(options);
  for (const list of RULE_LISTS)
    if (Array.isArray(out[list])) out[list] = (out[list] as Obj[]).map(reverse);
  return changed ? out : undefined;
}
/** 並べ替えた配列の中の位置は数えない（closedWeekdays[2] → closedWeekdays[]） */
const withoutInnerIndex = (path: string): string =>
  path.replace(new RegExp(`\\b(${UNORDERED.join("|")})\\[\\d+\\]`, "g"), "$1[]");

test(
  "変形 4: 順番が意味を持たない配列（closedWeekdays・kinds・keys・weekdays）を並べ替えても、結果・診断が同じ",
  { skip: SKIP },
  () => {
    eachOptions(
      20261124,
      ["calendar", "schedule"],
      (kind, o, context) => {
        const reversed = reverseUnordered(o);
        if (reversed === undefined) return;
        assert.deepEqual(
          resultsOf(make(kind, reversed)),
          baselineOf(kind, o).results,
          `${context}: 結果が変わった`,
        );
        assert.deepEqual(
          diagnosticsOf(kind, reversed, withoutInnerIndex),
          baselineOf(kind, o).diagnostics.map(withoutInnerIndex),
          `${context}: 診断が変わった`,
        );
        count("変形 4（並べ替え）");
      },
      RUNS_LIGHT,
    );
    report("変形 4（並べ替え）");
  },
);

// ------------------------------------------------------------
// 5. 設定の JSON での往復
// ------------------------------------------------------------

/** 設定を JSON にして読み戻す（JSON にできない提供元と基準のカレンダーは、保存する利用者と同じく読み戻した後に付け直す） */
function viaJson(options: Obj): Obj {
  const { holidayProvider, ...rest } = options;
  const calendars: unknown[] = [];
  const stored = JSON.stringify(rest, (key, value: unknown) => {
    if (key === "calendar" && typeof value === "object" && value !== null) {
      calendars.push(value);
      return { calendarIndex: calendars.length - 1 };
    }
    return value;
  });
  const restored = JSON.parse(stored, (key, value: unknown) =>
    key === "calendar" && typeof value === "object" && value !== null
      ? calendars[(value as { calendarIndex: number }).calendarIndex]
      : value,
  ) as Obj;
  return holidayProvider === undefined ? restored : { ...restored, holidayProvider };
}

test(
  "変形 5: 設定を JSON で往復しても（提供元と基準のカレンダーは付け直す）、結果・診断が同じ",
  { skip: SKIP },
  () => {
    eachOptions(20261125, ["calendar", "schedule"], (kind, o, context) => {
      const back = viaJson(o);
      assertSame(kind, context, o, back);
      count("変形 5（JSON の往復）");
    });
    report("変形 5（JSON の往復）");
  },
);

// ------------------------------------------------------------
// 6. 同じ設定から作ったカレンダーの合成と元のカレンダー
// ------------------------------------------------------------

test(
  "変形 6: 同じ設定から作った 2 つのカレンダーの合成は、元のカレンダーと結果が同じ（decidedBy・decidedByPath を除く）",
  { skip: SKIP },
  () => {
    eachOptions(20261126, ["calendar"], (_kind, o, context) => {
      const calendar = make("calendar", o);
      const twin = make("calendar", o);
      if (typeof calendar === "string" || typeof twin === "string") return;
      for (const open of ["all", "any"] as const) {
        // 合成は 2 つ以上の別のカレンダーを受ける（1 つだけ・同じオブジェクトの 2 つは invalid-argument）ので、
        // 同じ設定から作った 2 つのカレンダーを合成する。比べる dayInfoOn の結果からは、合成したカレンダーにしかない
        // decidedBy・decidedByPath だけを外す（dayOf）。holiday は、同じ提供元のオブジェクトを 1 つに数えるので同じになり、比べる
        const combined = combineCalendars([calendar as never, twin as never], {
          open,
        }) as unknown as Made;
        assert.deepEqual(
          resultsOf(combined),
          baselineOf("calendar", o).results,
          `${context} open: ${open}: 結果が変わった`,
        );
        assert.deepEqual(
          SHORT_DAYS.map((d): string => tryBusinessDay(combined, d)),
          SHORT_DAYS.map((d): string => tryBusinessDay(calendar, d)),
          `${context} open: ${open}: isBusinessDay が変わった`,
        );
      }
      count("変形 6（同じ設定の合成）");
    });
    report("変形 6（同じ設定の合成）");
  },
);

function tryBusinessDay(made: Made, day: string): string {
  try {
    return String(made.isBusinessDay!(day));
  } catch (e) {
    if (!isBizdaysError(e)) throw e;
    return `error ${e.code}`;
  }
}
