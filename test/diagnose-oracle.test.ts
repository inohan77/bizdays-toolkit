/**
 * 診断の総当たりのオラクルテスト（テスト拡充案の T1）。診断は「最適化した判定」なので、正しさを素朴な定義と突き合わせる:
 * 診断が shadowed・never-matches・redundant と出した項目を、設定から実際に取り除き、対応年の短い自作の提供元の全日で
 * 結果を比べる。項目は明示した一覧（test/fixtures/oracle-items.json。目録の規則の形の代表と、個別の日付・毎年の月日）で、
 * その 2 つまでの組み合わせを総当たりする（乱数の種による当たり外れがなく、目録を変えても項目は変わらない）。
 *
 * - 判定の条件は診断にそろえる（outOfRangePolicy: "ignore"。docs/decisions.md の 31 番）
 * - pnpm check では決まった抜き出しだけを試す。すべての組み合わせは ORACLE_FULL=1 で（CI の oracle ジョブ。時間の決まりと
 *   行列の分け方は RELEASING.md の「品質の確認」）
 * - 出た項目はまとめて取り除けること（逐次除去の定義）と、取り除いた後に取り除ける項目が残らないこと（完全性）を確かめる。
 *   完全性は、対応年で取り除けた項目を、診断が規則どうしを調べる期間（診断と同じ関数 rulesScanWindow で求める）でも
 *   確かめ直してから数え、既知の項目の一覧（KNOWN_INCOMPLETE）と合わなければ失敗にする
 * - ORACLE_TARGET=<パッケージのディレクトリ> で、ビルド済みの別の版（公開済みの版など）を試せる。ORACLE_SHARD=k/n で、
 *   全件の組み合わせを n 個に分けた k 番目だけを試せる（長い実行を分けるため。ORACLE_FULL=1 と組み合わせたときだけ。
 *   書式の誤り・k >= n・ORACLE_FULL なしは例外）
 */

import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { COMMON_RULE_KEYS, SHAPES, random, shapeOf, type Obj } from "./support/catalog.ts";
import { type DayLike, linesOf } from "./support/compare.ts";
import { SHORT_DAYS, SHORT_PROVIDER } from "./support/provider.ts";
import { flagEnv } from "./support/env.ts";

type Fn = (...args: unknown[]) => unknown;
const target = process.env["ORACLE_TARGET"];
const lib = (await import(
  target ? pathToFileURL(resolve(target, "dist/index.js")).href : "../src/index.ts"
)) as Record<string, Fn>;
const diag = (await import(
  target
    ? pathToFileURL(resolve(target, "dist/diagnose/index.js")).href
    : "../src/diagnose/index.ts"
)) as Record<string, Fn>;
/**
 * 診断が規則どうしを調べる期間（日付の範囲の並び。設定の作成に失敗するときと、期間が求まらないときは undefined）。診断と
 * 同じ関数で求める: 設定の組み立ては診断と同じ compileCalendarOptions、期間は analyzeRules が使う rulesScanWindow。
 * ORACLE_TARGET の版に rulesScanWindow がない（0.30.6 まで）なら、今のソースの関数を使う（期間の決め方は 0.30.x の間、
 * 変えていない）
 */
type Core = Record<string, Fn>;
const coreOf = async (dir: string | undefined, name: string): Promise<Core> =>
  (await import(
    dir ? pathToFileURL(resolve(dir, `dist/core/${name}.js`)).href : `../src/core/${name}.ts`
  )) as Core;
const scanCore = await (async () => {
  const fromTarget = target ? await coreOf(target, "diagnose") : undefined;
  const dir = fromTarget?.["rulesScanWindow"] ? target : undefined;
  return {
    compile: (await coreOf(dir, "calendar"))["compileCalendarOptions"]!,
    collector: (await coreOf(dir, "errors"))["IssueCollector"] as unknown as new () => unknown,
    window: (fromTarget?.["rulesScanWindow"] ??
      (await coreOf(undefined, "diagnose"))["rulesScanWindow"])!,
    fromDay: (await coreOf(dir, "date"))["fromDayNumber"]!,
  };
})();
const calendarScanWindow = (
  options: object,
): readonly { from: string; to: string }[] | undefined => {
  const compiled = (
    scanCore.compile(new scanCore.collector(), options) as { schedule?: unknown } | undefined
  )?.schedule;
  if (compiled === undefined) return undefined;
  const window = scanCore.window(compiled) as
    | { ranges: { from: number; to: number }[] }
    | undefined;
  return window?.ranges.map((r) => ({
    from: scanCore.fromDay(r.from) as string,
    to: scanCore.fromDay(r.to) as string,
  }));
};

const FULL = flagEnv("ORACLE_FULL");
/**
 * "k/n": 全件の組み合わせを n 個に分けた k 番目（0 始まり）だけを試す（長い実行を分けるため。CI の oracle ジョブ）。
 * 書式の誤り・k >= n・ORACLE_FULL なしは、何も試さずに合格しないよう例外にする
 */
const SHARD = ((): { k: number; n: number } | undefined => {
  const text = process.env["ORACLE_SHARD"];
  if (text === undefined || text === "") return undefined;
  const m = /^(\d+)\/(\d+)$/.exec(text);
  if (!m) throw new Error(`ORACLE_SHARD must be "k/n" (e.g. 0/4), got ${JSON.stringify(text)}`);
  const k = Number(m[1]);
  const n = Number(m[2]);
  if (n === 0 || k >= n)
    throw new Error(`ORACLE_SHARD ${text}: k must be less than n (0 <= k < n)`);
  // 全件なしの分け方は例外にする: pnpm check の決まった抜き出し（111 件に 1 件）をさらに分けると、間隔と n の公約数で
  // 分が 0 件になりうる（111 と 3 なら 1/3・2/3 が 0 件）。分けるのは全件（CI の oracle ジョブ）のときだけ
  if (!FULL)
    throw new Error(
      `ORACLE_SHARD ${text} needs ORACLE_FULL=1 (the sample of pnpm check is not split)`,
    );
  return { k, n };
})();
const AS_OF = "2026-07-01";

// ------------------------------------------------------------
// 項目の一覧（test/fixtures/oracle-items.json に明示した一覧。閉じる・開く規則の両方に置く）
// ------------------------------------------------------------

type Item = readonly [key: string, value: unknown];
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/oracle-items.json", import.meta.url), "utf8"),
) as {
  items: Item[];
  jointFixed: { items: Item[]; policy: string; weekdays: number[] }[];
};
const items: readonly Item[] = fixture.items;

/**
 * 項目の一覧がまだ持っていない形のキーと、その理由。test/catalog.test.ts の到達性と同じ形で、一覧が目録のすべての形と
 * キーを含むかを確かめ、ここに載っていない不足は失敗にする（載っているのに不足していない項目も、古い記載として失敗）
 */
const ITEM_GAPS: Readonly<Record<string, string>> = {};

const build = (
  list: readonly Item[],
  holidayPolicy: string,
  closedWeekdays: readonly number[] = [0, 6],
): Obj => {
  const o: Obj = {
    holidayProvider: SHORT_PROVIDER,
    timeZone: "UTC",
    closedWeekdays: [...closedWeekdays],
    holidayPolicy,
    outOfRangePolicy: "ignore",
  };
  for (const [k, v] of list) ((o[k] ??= []) as unknown[]).push(v);
  return o;
};
/** 期間（日付の範囲の並び）の全日の営業日かどうか（投げた日はエラーコード） */
const openOver = (o: Obj, ranges: readonly { from: string; to: string }[]): string => {
  const calendar = lib["createCalendar"]!(o) as { dayInfoOn: (d: string) => Obj };
  const out: string[] = [];
  for (const { from, to } of ranges)
    for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      try {
        out.push(String(calendar.dayInfoOn(d)["open"]));
      } catch (error) {
        out.push(`E:${String((error as { code?: unknown }).code)}`);
      }
    }
  return out.join(",");
};
/**
 * 対応年で取り除けた項目を、診断が規則どうしを調べる期間（calendarScanWindow）でも取り除けるか確かめ直す。診断は有効期間が
 * 対応年の外に続く規則を、その外まで調べるので、対応年だけで比べると、取り除けない項目を「何も出ない」と数えてしまう
 */
function removableInScanWindow(full: Obj, rest: Obj): boolean {
  const ranges = calendarScanWindow(full);
  if (ranges === undefined) return true;
  return openOver(rest, ranges) === openOver(full, ranges);
}

/** 対応年の全日の結果（test/support/compare.ts の linesOf。full なら理由・名前・振替元まで） */
const snapshot = (o: Obj, full: boolean): string[] =>
  linesOf(lib["createCalendar"]!(o) as { dayInfoOn: (d: string) => DayLike }, SHORT_DAYS, full);
const same = (a: readonly string[], b: readonly string[], from = 0) =>
  a.every((x, i) => i < from || x === b[i]);
const pathsOf = (list: readonly Item[]): string[] => {
  const count: Record<string, number> = {};
  return list.map(([k]) => `${k}[${(count[k] = (count[k] ?? -1) + 1)}]`);
};

/** 休業日の扱いの方針と定休日（項目 1 つの設定は 3 × 3 通りすべて、項目 2 つの設定は方針 3 通り × 土日） */
const POLICIES = ["closed", "open", "ignore"] as const;
const WEEKDAY_SETS: readonly (readonly number[])[] = [[0, 6], [0], []];
/** 項目 2 つの設定で、定休日 [0]・[] と組み合わせるものは、種で決まる抜き出し（この割合） */
const OTHER_WEEKDAYS_RATE = 1 / 8;
/** pnpm check（ORACLE_FULL なし）は、全件の設定から、この間隔の決まった抜き出しだけを試す */
const SAMPLE_EVERY = 111;

interface Config {
  readonly list: readonly Item[];
  readonly policy: string;
  readonly weekdays: readonly number[];
}

/**
 * 失敗のメッセージに入れる、設定を作り直せる情報（項目・休業日の扱いの方針・定休日・取り除いた項目）。
 * build(items, holidayPolicy, closedWeekdays) に渡せば、同じ設定ができる
 */
function describeConfig(
  list: readonly Item[],
  policy: string,
  weekdays: readonly number[],
  removed?: string | readonly string[],
): string {
  return JSON.stringify({
    items: list,
    holidayPolicy: policy,
    closedWeekdays: weekdays,
    ...(removed === undefined ? {} : { removed }),
  });
}

/** 全件の設定（決まった順。定休日 [0]・[] との 2 つの組み合わせは、種で決まる抜き出し）と、その内訳 */
const plan = (() => {
  const all: Config[] = [];
  const pick = random(20261102);
  let other = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i; j < items.length; j++) {
      const list = i === j ? [items[i]!] : [items[i]!, items[j]!];
      for (const policy of POLICIES)
        for (const weekdays of WEEKDAY_SETS) {
          if (i !== j && weekdays.length !== 2) {
            other++;
            if (pick() >= OTHER_WEEKDAYS_RATE) continue;
          }
          all.push({ list, policy, weekdays });
        }
    }
  const chosen = all.filter(
    (_, n) => (FULL || n % SAMPLE_EVERY === 0) && (!SHARD || n % SHARD.n === SHARD.k),
  );
  const count = (f: (c: Config) => string) => {
    const out: Record<string, number> = {};
    for (const c of chosen) out[f(c)] = (out[f(c)] ?? 0) + 1;
    return out;
  };
  const sampledOther = all.filter((c) => c.list.length === 2 && c.weekdays.length !== 2).length;
  return {
    chosen,
    lines: [
      `項目 ${items.length} 件、全件の設定 ${all.length} 件（${FULL ? "全件" : `${SAMPLE_EVERY} 件に 1 件の抜き出し`}${SHARD ? `、${SHARD.n} 個に分けた ${SHARD.k} 番目` : ""}）。試す設定 ${chosen.length} 件`,
      `方針ごと: ${JSON.stringify(count((c) => c.policy))}`,
      `定休日ごと: ${JSON.stringify(count((c) => JSON.stringify(c.weekdays)))}`,
      `項目 2 つと定休日 [0]・[] の組み合わせの抜き出し: ${sampledOther} / ${other} 件（割合 ${OTHER_WEEKDAYS_RATE}）`,
    ],
  };
})();

/** 試す設定 */
const configs = (): readonly Config[] => plan.chosen;

interface Report {
  configs: number;
  unsound: string[];
  incomplete: Map<string, number>;
  codes: Record<string, number>;
  /** 対応年では取り除けたが、診断の期間で確かめ直して取り除けなかった項目の数と、確かめ直しの時間（ミリ秒） */
  rechecked: number;
  recheckMs: number;
}

function run(
  check: (
    list: readonly Item[],
    policy: string,
    d: Obj[],
    report: Report,
    weekdays: readonly number[],
  ) => void,
  list: readonly Config[] = configs(),
): Report {
  const report: Report = {
    configs: 0,
    unsound: [],
    incomplete: new Map(),
    codes: {},
    rechecked: 0,
    recheckMs: 0,
  };
  for (const { list: items, policy, weekdays } of list) {
    const o = build(items, policy, weekdays);
    const d = diag["diagnoseCalendar"]!(o) as Obj[];
    if (d.some((x) => x["severity"] === "error")) continue;
    report.configs++;
    for (const x of d)
      report.codes[x["code"] as string] = (report.codes[x["code"] as string] ?? 0) + 1;
    check(items, policy, d, report, weekdays);
  }
  return report;
}

const summarize = (name: string, report: Report): void => {
  const top = [...report.incomplete].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const lines = [
    `### ${name}`,
    "",
    ...plan.lines,
    "",
    `設定 ${report.configs} 件（作成の誤りの設定を除く）、誤り ${report.unsound.length} 件、診断のコード: ${JSON.stringify(report.codes)}`,
    "",
    `対応年では取り除けたが、診断の期間で確かめ直して取り除けなかった項目: ${report.rechecked} 件（確かめ直し ${Math.round(report.recheckMs)} ms）`,
    "",
    "取り除いても変わらないのに何も出ない項目（完全性。既知の項目の一覧 KNOWN_INCOMPLETE と合わなければ失敗）:",
    ...(top.length > 0 ? top.map(([k, v]) => `- ${v} 件 ${k}`) : ["- なし"]),
    "",
  ];
  console.log(lines.join("\n"));
  if (FULL && process.env["GITHUB_STEP_SUMMARY"])
    appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `${lines.join("\n")}\n`);
};

test("オラクル: 項目の一覧は目録のすべての形とキーを含む（不足は ITEM_GAPS に理由付きで載せたものだけ）", () => {
  const made = new Map<string, Set<string>>();
  for (const [key, value] of items) {
    if (!key.endsWith("RecurringRules")) continue;
    const shape = shapeOf(value as Obj);
    assert.ok(shape, `形の分からない項目: ${JSON.stringify(value)}`);
    const set = made.get(shape.pattern) ?? new Set<string>();
    for (const k of Object.keys(value as Obj)) set.add(k);
    made.set(shape.pattern, set);
  }
  const all = new Set([...made.values()].flatMap((s) => [...s]));
  const gaps: string[] = [];
  for (const s of SHAPES) {
    if (!made.has(s.pattern)) gaps.push(`${s.pattern}`);
    for (const k of s.keys) if (!made.get(s.pattern)?.has(k)) gaps.push(`${s.pattern}.${k}`);
  }
  for (const k of COMMON_RULE_KEYS) if (!all.has(k)) gaps.push(`*.${k}`);
  assert.deepEqual(gaps, Object.keys(ITEM_GAPS), "項目の一覧の不足と ITEM_GAPS が食い違う");
});

// ------------------------------------------------------------
// 健全性: 出た項目を取り除いても、結果が変わらない
// ------------------------------------------------------------

/**
 * 健全性と完全性を数える（docs/decisions.md の 31 番の逐次除去の定義）。
 * - 健全性: shadowed・never-matches と出た項目は、1 つだけ取り除いても全日の結果が変わらない（決して使われない）。
 *   shadowed・never-matches・redundant と出た項目をまとめて取り除いても、全日の結果が変わらない
 * - 完全性: 出た項目をまとめて取り除いた設定で、残りのどの項目を 1 つ取り除いても結果が変わる（これ以上取り除けない）。
 *   変わらない項目は、診断が規則どうしを調べる期間でも確かめ直してから数える
 */
function checkRemovals(
  list: readonly Item[],
  policy: string,
  d: Obj[],
  r: Report,
  weekdays: readonly number[],
): void {
  const paths = pathsOf(list);
  const codesOf = (path: string): string[] =>
    d.filter((x) => x["path"] === path).map((x) => x["code"] as string);
  const original = build(list, policy, weekdays);
  const baseOpen = snapshot(original, false);
  const baseFull = snapshot(original, true);
  paths.forEach((path, p) => {
    const codes = codesOf(path);
    if (!codes.includes("shadowed") && !codes.includes("never-matches")) return;
    const rest = build(
      list.filter((_, q) => q !== p),
      policy,
      weekdays,
    );
    if (!same(snapshot(rest, true), baseFull))
      r.unsound.push(`${codes.join(",")} ${describeConfig(list, policy, weekdays, path)}`);
  });
  const removed = paths.filter((path) =>
    codesOf(path).some((c) => ["shadowed", "never-matches", "redundant"].includes(c)),
  );
  const remaining = list.filter((_, p) => !removed.includes(paths[p]!));
  const restConfig = build(remaining, policy, weekdays);
  const restOpen = snapshot(restConfig, false);
  if (!same(restOpen, baseOpen)) {
    r.unsound.push(`まとめて取り除くと変わる ${describeConfig(list, policy, weekdays, removed)}`);
    return;
  }
  remaining.forEach((item, q) => {
    const smaller = build(
      remaining.filter((_, k) => k !== q),
      policy,
      weekdays,
    );
    if (!same(snapshot(smaller, false), restOpen)) return;
    const started = performance.now();
    const removable = removableInScanWindow(restConfig, smaller);
    r.recheckMs += performance.now() - started;
    if (!removable) {
      r.rechecked++;
      return;
    }
    const key = `${item[0]} ${JSON.stringify(item[1])}`;
    r.incomplete.set(key, (r.incomplete.get(key) ?? 0) + 1);
  });
}

/**
 * 取り除いても変わらないのに診断が何も言わない項目（完全性の報告に出る項目）のうち、理由が分かっていて受け入れるもの
 * （項目 → 理由）。ここにない項目が出たら失敗、ここにある項目が出なくなっても失敗（一覧が古くなるのを防ぐ）。
 * 0.30.7 で、対応年だけで比べていたために出ていた 2 件（どちらも診断の期間では取り除けない）を確かめ直しで外したので、空
 */
const KNOWN_INCOMPLETE: Readonly<Record<string, string>> = {};

/**
 * 完全性の数え方の見張り。診断の結果を空にして渡し、(1) 本当に取り除ける項目（定休日の土曜の個別の日付）を数えること、
 * (2) 対応年では取り除けるが診断の期間では取り除けない項目（2026 年からの毎月 1 日を閉じる規則と、5・7 月の月曜を開く規則。
 * 2028-05-01 などで結果が変わる）は確かめ直しで数えないこと、を確かめる。報告の仕組みが壊れて何も数えなくなっても、
 * 確かめ直しがいつも「取り除けない」と答えて取りこぼしを隠すように壊れても、ここで止まる
 */
test("オラクル: 完全性の数え方は、診断が何も言わない取り除ける項目を数え、診断の期間で取り除けない項目は数えない", () => {
  const report: Report = {
    configs: 1,
    unsound: [],
    incomplete: new Map(),
    codes: {},
    rechecked: 0,
    recheckMs: 0,
  };
  const saturday: Item = ["closedDates", "2025-03-01"];
  checkRemovals([saturday], "closed", [], report, [0, 6]);
  assert.equal(
    report.incomplete.get(`closedDates ${JSON.stringify("2025-03-01")}`),
    1,
    `取り除ける項目を数えない: ${JSON.stringify([...report.incomplete])}`,
  );
  const openMondays: Item = ["openRecurringRules", { weekday: 1, months: [5, 7] }];
  const firstDays: Item = ["closedRecurringRules", { dayOfMonth: 1, effectiveFrom: "2026-01-01" }];
  checkRemovals([openMondays, firstDays], "closed", [], report, [0, 6]);
  assert.equal(
    report.incomplete.get(`openRecurringRules ${JSON.stringify({ weekday: 1, months: [5, 7] })}`),
    undefined,
    "診断の期間では取り除けない項目を数えた",
  );
  assert.ok(report.rechecked >= 1, "確かめ直しが働いていない");
});

// ------------------------------------------------------------

test("オラクル: shadowed・never-matches・redundant と出た項目は、まとめて取り除いても全日の結果が変わらず、取り除いた後にこれ以上取り除ける項目がない（既知の項目を除く）", () => {
  const report = run(checkRemovals, [
    ...configs(),
    // 項目 3 つの固定の設定（oracle-items.json の jointFixed。組み合わせの総当たりは 2 項目までなので、ここで足す）
    ...fixture.jointFixed.map((c) => ({ list: c.items, policy: c.policy, weekdays: c.weekdays })),
  ]);
  summarize("健全性と完全性", report);
  assert.deepEqual(
    report.unsound,
    [],
    "診断が取り除いても変わらないと言った項目（1 つずつ、またはまとめて）で、結果が変わった",
  );
  // 完全性: 一覧にない「取り除けるのに何も出ない」項目は失敗。一覧の項目が出なくなったら失敗（全件を 1 回で試すときだけ。
  // 分けた実行では、一覧の項目がほかの分にある）
  assert.deepEqual(
    [...report.incomplete.keys()].filter((k) => !(k in KNOWN_INCOMPLETE)),
    [],
    "出た項目をまとめて取り除いた後に、まだ取り除いても結果が変わらない項目がある（診断の取りこぼし。理由が分かって受け入れるなら KNOWN_INCOMPLETE に載せる）",
  );
  if (FULL && SHARD === undefined)
    assert.deepEqual(
      Object.keys(KNOWN_INCOMPLETE).filter((k) => !report.incomplete.has(k)),
      [],
      "KNOWN_INCOMPLETE の項目が出なくなった（直ったか、網から外れた。一覧から外す）",
    );
  assert.ok(report.configs > 0 && (report.codes["redundant"] ?? 0) > 0, "オラクルが空振りしている");
  // 全件では、取り除ける項目の 3 つのコードがどれも出ている（expired は次のテストが確かめる）
  if (FULL)
    for (const code of ["shadowed", "never-matches", "redundant"])
      assert.ok(
        (report.codes[code] ?? 0) > 0,
        `${code} が 1 件も出ていない（オラクルが空振りしている）`,
      );
});

// ------------------------------------------------------------
// 診断のコードごとの約束
// ------------------------------------------------------------

test("オラクル: expired は、終わりが基準日より前で、基準日以降の結果に影響しない", () => {
  const fromIndex = SHORT_DAYS.indexOf(AS_OF);
  let checked = 0;
  const report = run((list, policy, _d, r, weekdays) => {
    const d = diag["diagnoseCalendar"]!(build(list, policy, weekdays), { asOf: AS_OF }) as Obj[];
    const paths = pathsOf(list);
    const base = snapshot(build(list, policy, weekdays), false);
    paths.forEach((path, p) => {
      if (!d.some((x) => x["path"] === path && x["code"] === "expired")) return;
      checked++;
      const v = list[p]![1] as Obj | string;
      const end = typeof v === "string" ? v : ((v["effectiveTo"] ?? v["to"]) as string | undefined);
      if (end === undefined || end >= AS_OF)
        r.unsound.push(
          `expired の終わりが基準日以降 ${describeConfig(list, policy, weekdays, path)}`,
        );
      if (
        !same(
          snapshot(
            build(
              list.filter((_, q) => q !== p),
              policy,
              weekdays,
            ),
            false,
          ),
          base,
          fromIndex,
        )
      )
        r.unsound.push(
          `expired を取り除くと基準日以降が変わる ${describeConfig(list, policy, weekdays, path)}`,
        );
    });
    assert.deepEqual(r.unsound, []);
  });
  assert.ok(report.configs > 0, "試した設定が 0 件（オラクルが空振りしている）");
  assert.ok(checked > 0, "expired が 1 件も出ていない（オラクルが空振りしている）");
});

test("オラクル: no-business-day は営業日が本当にない設定だけ、counting-basis は数え方の限界がある設定だけに出る", () => {
  const report = run((list, policy, d, r, weekdays) => {
    if (
      d.some((x) => x["code"] === "no-business-day") &&
      snapshot(build(list, policy, weekdays), false).includes("true")
    )
      r.unsound.push(
        `no-business-day なのに営業日がある ${describeConfig(list, policy, weekdays)}`,
      );
    // 数え方の限界: 第 n 営業日の規則と、毎週の曜日（第 n 曜日・隔週・月の絞り込みのない曜日の規則）を閉じる・開く
    // 繰り返しの規則があり、その 2 つの有効期間が重なる（数える基準は繰り返しの規則を除くので、その曜日は数え方に入らない。
    // 16 番）。前提を満たす組（第 n 営業日の規則ごとに、重なる曜日の規則の数を足したもの）だけ counting-basis が出る。
    // オラクルは outOfRangePolicy: "ignore" なので、対応年の外で使われない曜日の規則はない
    const rules = list.filter(([k]) => k.endsWith("RecurringRules")).map(([, v]) => v as Obj);
    const from = (v: Obj): string => (v["effectiveFrom"] as string | undefined) ?? "0000-01-01";
    const to = (v: Obj): string => (v["effectiveTo"] as string | undefined) ?? "9999-12-31";
    const pairs = rules
      .filter((v) => "businessDayOfMonth" in v || "businessDayOfWeek" in v)
      .flatMap((n) =>
        rules.filter(
          (v) =>
            "weekday" in v &&
            !("nth" in v) &&
            !("interval" in v) &&
            !("months" in v) &&
            from(n) <= to(v) &&
            from(v) <= to(n),
        ),
      ).length;
    const found = d.filter((x) => x["code"] === "counting-basis").length;
    if (found > 0 && pairs === 0)
      r.unsound.push(`counting-basis の前提がない ${describeConfig(list, policy, weekdays)}`);
    else if (found === 0 && pairs > 0)
      r.unsound.push(
        `counting-basis の前提があるのに出ない ${describeConfig(list, policy, weekdays)}`,
      );
    else if (found !== pairs)
      r.unsound.push(
        `counting-basis が ${found} 件で、前提を満たす組の数 ${pairs} と違う ${describeConfig(list, policy, weekdays)}`,
      );
    assert.deepEqual(r.unsound, []);
  });
  assert.ok(report.configs > 0, "試した設定が 0 件（オラクルが空振りしている）");
});
