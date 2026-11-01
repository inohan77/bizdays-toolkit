/**
 * 診断の総当たりのオラクルテスト（テスト拡充案の T1）。診断は「最適化した判定」なので、正しさを素朴な定義と突き合わせる:
 * 診断が shadowed・never-matches・redundant と出した項目を、設定から実際に取り除き、対応年の短い自作の提供元の全日で
 * 結果を比べる。項目は明示した一覧（test/fixtures/oracle-items.json。目録の規則の形の代表と、個別の日付・毎年の月日）で、
 * その 2 つまでの組み合わせを総当たりする（乱数の種による当たり外れがなく、目録を変えても項目は変わらない）。
 *
 * - 判定の条件は診断にそろえる（outOfRangePolicy: "ignore"。docs/decisions.md の 31 番）
 * - pnpm check では決まった抜き出しだけを試す。すべての組み合わせ（約 2.5 分）は ORACLE_FULL=1 で（CI の test:oracle ジョブ）
 * - 判定は暦日でタイムゾーンに依存しないので、タイムゾーンを変えた実行（scripts/test-tz.ts）では飛ばす
 * - ORACLE_TARGET=<パッケージのディレクトリ> で、ビルド済みの別の版（公開済みの版など）を試せる。ORACLE_SHARD=k/n で、
 *   試す組み合わせを n 個に分けた k 番目だけを試せる（長い実行を分けるため。書式の誤りと k >= n は例外）
 */

import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { COMMON_RULE_KEYS, SHAPES, shapeOf, type Obj } from "./support/catalog.ts";
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
const ITEM_GAPS: Readonly<Record<string, string>> = {
  "WeekdayPattern.nth":
    "項目を足すと組み合わせが約 1.4 倍になり、全件の実行が CI の時間（10 分）を超えるため、全件の実行を行列に分けてから足す",
  "WeekdayPattern.months": "同上",
  "WeekdayPattern.skipWeekdays": "同上",
  "BusinessDayOfWeekPattern.months": "同上",
  "HolidayPattern.months": "同上",
  "DayBeforeHolidayPattern.weekdays": "同上",
  "*.effectiveFrom": "同上",
  "*.name": "同上",
};

const build = (list: readonly Item[], holidayPolicy: string): Obj => {
  const o: Obj = {
    holidayProvider: SHORT_PROVIDER,
    timeZone: "UTC",
    closedWeekdays: [0, 6],
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

/** 試す設定（すべての組み合わせ、または決まった抜き出し） */
function* configs(): Generator<{ list: Item[]; policy: string }> {
  let n = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i; j < items.length; j++)
      for (const policy of i === j ? ["closed"] : ["closed", "open"]) {
        n++;
        if (!FULL && n % 37 !== 0) continue;
        if (SHARD && n % SHARD.n !== SHARD.k) continue;
        yield { list: i === j ? [items[i]!] : [items[i]!, items[j]!], policy };
      }
}

interface Report {
  configs: number;
  unsound: string[];
  incomplete: Map<string, number>;
  codes: Record<string, number>;
}

function run(check: (list: Item[], policy: string, d: Obj[], report: Report) => void): Report {
  const report: Report = { configs: 0, unsound: [], incomplete: new Map(), codes: {} };
  for (const { list, policy } of configs()) {
    const o = build(list, policy);
    const d = diag["diagnoseCalendar"]!(o) as Obj[];
    if (d.some((x) => x["severity"] === "error")) continue;
    report.configs++;
    for (const x of d)
      report.codes[x["code"] as string] = (report.codes[x["code"] as string] ?? 0) + 1;
    check(list, policy, d, report);
  }
  return report;
}

const summarize = (name: string, report: Report): void => {
  const top = [...report.incomplete].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const lines = [
    `### ${name}`,
    "",
    `設定 ${report.configs} 件、誤り ${report.unsound.length} 件、診断のコード: ${JSON.stringify(report.codes)}`,
    "",
    "取り除いても変わらないのに何も出ない項目（完全性の報告。失敗にはしない）:",
    ...top.map(([k, v]) => `- ${v} 件 ${k}`),
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

test(
  "オラクル: shadowed・never-matches・redundant と出た項目は、取り除いても全日の結果が変わらない",
  { skip: SKIP },
  () => {
    const report = run((list, policy, d, r) => {
      const paths = pathsOf(list);
      const baseOpen = snapshot(build(list, policy), false);
      const baseFull = snapshot(build(list, policy), true);
      paths.forEach((path, p) => {
        const codes = d.filter((x) => x["path"] === path).map((x) => x["code"] as string);
        const rest = build(
          list.filter((_, q) => q !== p),
          policy,
        );
        const restOpen = snapshot(rest, false);
        if (
          (codes.includes("shadowed") || codes.includes("never-matches")) &&
          !same(snapshot(rest, true), baseFull)
        )
          r.unsound.push(`${codes.join(",")} ${path} ${policy} ${JSON.stringify(list)}`);
        if (codes.includes("redundant") && !same(restOpen, baseOpen))
          r.unsound.push(`redundant ${path} ${policy} ${JSON.stringify(list)}`);
        if (
          same(restOpen, baseOpen) &&
          !codes.some((c) => ["redundant", "shadowed", "never-matches", "expired"].includes(c))
        ) {
          const key = `${list[p]![0]} ${JSON.stringify(list[p]![1])}`;
          r.incomplete.set(key, (r.incomplete.get(key) ?? 0) + 1);
        }
      });
    });
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
    run((list, policy, _d, r) => {
      const d = diag["diagnoseCalendar"]!(build(list, policy), { asOf: AS_OF }) as Obj[];
      const paths = pathsOf(list);
      const base = snapshot(build(list, policy), false);
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
    run((list, policy, d, r) => {
      if (
        d.some((x) => x["code"] === "no-business-day") &&
        snapshot(build(list, policy), false).includes("true")
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
    const report = run((list, policy, d, r) => {
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
      );
      if (!same(snapshot(rest, false), snapshot(build(list, policy), false)))
        r.unsound.push(`${[...removable].join(",")} ${policy} ${JSON.stringify(list)}`);
    });
    assert.deepEqual(report.unsound, []);
  },
);
