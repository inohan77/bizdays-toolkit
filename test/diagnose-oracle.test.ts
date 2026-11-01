/**
 * 診断の総当たりのオラクルテスト（テスト拡充案の T1）。診断は「最適化した判定」なので、正しさを素朴な定義と突き合わせる:
 * 診断が shadowed・never-matches・redundant と出した項目を、設定から実際に取り除き、対応年の短い自作の提供元の全日で
 * 結果を比べる。項目は明示した一覧（test/fixtures/oracle-items.json。目録の規則の形の代表と、個別の日付・毎年の月日）で、
 * その 2 つまでの組み合わせを総当たりする（乱数の種による当たり外れがなく、目録を変えても項目は変わらない）。
 *
 * - 判定の条件は診断にそろえる（outOfRangePolicy: "ignore"。docs/decisions.md の 31 番）
 * - pnpm check では決まった抜き出しだけを試す。すべての組み合わせは ORACLE_FULL=1 で（CI の oracle ジョブ。時間の決まりと
 *   行列の分け方は RELEASING.md の「品質の確認」）
 * - 判定は暦日でタイムゾーンに依存しないので、タイムゾーンを変えた実行（scripts/test-tz.ts）では飛ばす
 * - ORACLE_TARGET=<パッケージのディレクトリ> で、ビルド済みの別の版（公開済みの版など）を試せる。ORACLE_SHARD=k/n で、
 *   試す組み合わせを n 個に分けた k 番目だけを試せる（長い実行を分けるため。書式の誤りと k >= n は例外）
 */

import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { COMMON_RULE_KEYS, SHAPES, random, shapeOf, type Obj } from "./support/catalog.ts";
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

const FULL = flagEnv("ORACLE_FULL");
/**
 * "k/n": 試す組み合わせを n 個に分けた k 番目（0 始まり）だけを試す（長い実行を分けるため）。ORACLE_FULL=1 なら
 * すべての組み合わせを、そうでなければ決まった抜き出しを、さらに n 個に分ける。書式の誤りと k >= n は、何も試さずに
 * 合格しないよう例外にする
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
  return { k, n };
})();
const SKIP = flagEnv("BIZDAYS_TZ_RUN") && "タイムゾーンに依存しないので、TZ を変えた実行では飛ばす";
const AS_OF = "2026-07-01";

// ------------------------------------------------------------
// 項目の一覧（test/fixtures/oracle-items.json に明示した一覧。閉じる・開く規則の両方に置く）
// ------------------------------------------------------------

type Item = readonly [key: string, value: unknown];
const items: readonly Item[] = (
  JSON.parse(readFileSync(new URL("./fixtures/oracle-items.json", import.meta.url), "utf8")) as {
    items: Item[];
  }
).items;

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
/** 全日の結果（full なら理由・名前・振替元まで） */
const snapshot = (o: Obj, full: boolean): string[] => {
  const calendar = lib["createCalendar"]!(o) as { dayInfoOn: (d: string) => Obj };
  return SHORT_DAYS.map((d) => {
    try {
      const i = calendar.dayInfoOn(d);
      return full
        ? `${i["open"]}|${i["reason"]}|${i["name"] ?? ""}|${i["shiftedFrom"] ?? ""}`
        : String(i["open"]);
    } catch (error) {
      return `E:${String((error as { code?: unknown }).code)}`;
    }
  });
};
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
  const report: Report = { configs: 0, unsound: [], incomplete: new Map(), codes: {} };
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
    "取り除いても変わらないのに何も出ない項目（完全性の報告。失敗にはしない）:",
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

/** 設定の項目を 1 つずつ取り除き、健全性（出た項目は取り除いても変わらない）と完全性（変わらないのに何も出ない項目）を数える */
function checkRemovals(
  list: readonly Item[],
  policy: string,
  d: Obj[],
  r: Report,
  weekdays: readonly number[],
): void {
  const paths = pathsOf(list);
  const baseOpen = snapshot(build(list, policy, weekdays), false);
  const baseFull = snapshot(build(list, policy, weekdays), true);
  paths.forEach((path, p) => {
    const codes = d.filter((x) => x["path"] === path).map((x) => x["code"] as string);
    const rest = build(
      list.filter((_, q) => q !== p),
      policy,
      weekdays,
    );
    const restOpen = snapshot(rest, false);
    const where = `${policy} ${JSON.stringify(weekdays)} ${JSON.stringify(list)}`;
    if (
      (codes.includes("shadowed") || codes.includes("never-matches")) &&
      !same(snapshot(rest, true), baseFull)
    )
      r.unsound.push(`${codes.join(",")} ${path} ${where}`);
    if (codes.includes("redundant") && !same(restOpen, baseOpen))
      r.unsound.push(`redundant ${path} ${where}`);
    if (
      same(restOpen, baseOpen) &&
      !codes.some((c) => ["redundant", "shadowed", "never-matches", "expired"].includes(c))
    ) {
      const key = `${list[p]![0]} ${JSON.stringify(list[p]![1])}`;
      r.incomplete.set(key, (r.incomplete.get(key) ?? 0) + 1);
    }
  });
}

/**
 * 完全性の報告に必ず出る設定（カナリア）。開く規則「5・7 月の月曜」は、定休日が土日なので月曜を開く意味がなく、
 * 閉じる規則「2026 年からの毎月 1 日」と重なる日（5・7 月の 1 日が月曜）も、対応年（2025〜2027 年）にない。
 * そのため取り除いても全日の結果は変わらないが、診断は redundant と言わない。redundant は、祝日・暦の並びの
 * 偶然で取り除ける項目まで見つけることを約束していないため（docs/decisions.md の 31 番）。報告の仕組みが壊れて
 * 何も数えなくなれば、ここで止まる
 */
const CANARY: Config = {
  list: [
    ["openRecurringRules", { weekday: 1, months: [5, 7] }],
    ["closedRecurringRules", { dayOfMonth: 1, effectiveFrom: "2026-01-01" }],
  ],
  policy: "closed",
  weekdays: [0, 6],
};
const CANARY_KEY = `openRecurringRules ${JSON.stringify({ weekday: 1, months: [5, 7] })}`;

test("オラクル: 完全性の報告は、取り除けるのに何も出ない既知の設定（カナリア）を数える", () => {
  const report = run(checkRemovals, [CANARY]);
  assert.equal(report.configs, 1, "カナリアの設定が作成できない");
  assert.deepEqual(report.unsound, []);
  assert.equal(
    report.incomplete.get(CANARY_KEY),
    1,
    `完全性の報告がカナリアを数えない: ${JSON.stringify([...report.incomplete])}`,
  );
});

// ------------------------------------------------------------

test(
  "オラクル: shadowed・never-matches・redundant と出た項目は、取り除いても全日の結果が変わらない",
  { skip: SKIP },
  () => {
    const report = run(checkRemovals);
    summarize("健全性と完全性", report);
    assert.deepEqual(
      report.unsound,
      [],
      "診断が取り除いても変わらないと言った項目で、結果が変わった",
    );
    assert.ok(
      report.configs > 0 && (report.codes["redundant"] ?? 0) > 0,
      "オラクルが空振りしている",
    );
    // 全件では、取り除ける項目の 3 つのコードがどれも出ている（expired は次のテストが確かめる）
    if (FULL)
      for (const code of ["shadowed", "never-matches", "redundant"])
        assert.ok(
          (report.codes[code] ?? 0) > 0,
          `${code} が 1 件も出ていない（オラクルが空振りしている）`,
        );
  },
);

// ------------------------------------------------------------
// 診断のコードごとの約束
// ------------------------------------------------------------

test(
  "オラクル: expired は、終わりが基準日より前で、基準日以降の結果に影響しない",
  { skip: SKIP },
  () => {
    const fromIndex = SHORT_DAYS.indexOf(AS_OF);
    let checked = 0;
    run((list, policy, _d, r, weekdays) => {
      const d = diag["diagnoseCalendar"]!(build(list, policy, weekdays), { asOf: AS_OF }) as Obj[];
      const paths = pathsOf(list);
      const base = snapshot(build(list, policy, weekdays), false);
      paths.forEach((path, p) => {
        if (!d.some((x) => x["path"] === path && x["code"] === "expired")) return;
        checked++;
        const v = list[p]![1] as Obj | string;
        const end =
          typeof v === "string" ? v : ((v["effectiveTo"] ?? v["to"]) as string | undefined);
        if (end === undefined || end >= AS_OF)
          r.unsound.push(`expired の終わりが基準日以降 ${path} ${JSON.stringify(list)}`);
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
          r.unsound.push(`expired を取り除くと基準日以降が変わる ${path} ${JSON.stringify(list)}`);
      });
      assert.deepEqual(r.unsound, []);
    });
    assert.ok(checked > 0, "expired が 1 件も出ていない（オラクルが空振りしている）");
  },
);

test(
  "オラクル: no-business-day は営業日が本当にない設定だけ、counting-basis は数え方の限界がある設定だけに出る",
  { skip: SKIP },
  () => {
    run((list, policy, d, r, weekdays) => {
      if (
        d.some((x) => x["code"] === "no-business-day") &&
        snapshot(build(list, policy, weekdays), false).includes("true")
      )
        r.unsound.push(`no-business-day なのに営業日がある ${JSON.stringify(list)}`);
      if (d.some((x) => x["code"] === "counting-basis")) {
        // 数え方の限界: 第 n 営業日の規則があり、毎週の曜日（第 n 曜日・隔週・月の絞り込みのない曜日の規則）を
        // 繰り返しの規則で閉じている・開いている（数える基準は繰り返しの規則を除くので、その曜日は数え方に入らない。16 番）
        const rules = list.filter(([k]) => k.endsWith("RecurringRules")).map(([, v]) => v as Obj);
        const counts = rules.some((v) => "businessDayOfMonth" in v || "businessDayOfWeek" in v);
        const weekly = rules.some(
          (v) => "weekday" in v && !("nth" in v) && !("interval" in v) && !("months" in v),
        );
        if (!counts || !weekly)
          r.unsound.push(`counting-basis の前提がない ${JSON.stringify(list)}`);
      }
      assert.deepEqual(r.unsound, []);
    });
  },
);

// ------------------------------------------------------------
// 0.31.0 で有効にする: 出た項目をすべてまとめて取り除いても、結果が変わらない（P1 の正解の定義）
// ------------------------------------------------------------

test(
  "オラクル: 出た項目をまとめて取り除いても、全日の結果が変わらない",
  {
    skip: SKIP || (!flagEnv("ORACLE_JOINT") && "0.31.0（P1）で有効にする。ORACLE_JOINT=1 で試せる"),
  },
  () => {
    const report = run((list, policy, d, r, weekdays) => {
      const paths = pathsOf(list);
      const removable = new Set(
        d
          .filter((x) => ["shadowed", "never-matches", "redundant"].includes(x["code"] as string))
          .map((x) => x["path"]),
      );
      if (removable.size < 2) return;
      const rest = build(
        list.filter((_, p) => !removable.has(paths[p])),
        policy,
        weekdays,
      );
      if (!same(snapshot(rest, false), snapshot(build(list, policy, weekdays), false)))
        r.unsound.push(`${[...removable].join(",")} ${policy} ${JSON.stringify(list)}`);
    });
    assert.deepEqual(report.unsound, []);
  },
);
