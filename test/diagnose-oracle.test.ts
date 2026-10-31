/**
 * 診断の総当たりのオラクルテスト（テスト拡充案の T1）。診断は「最適化した判定」なので、正しさを素朴な定義と突き合わせる:
 * 診断が shadowed・never-matches・redundant と出した項目を、設定から実際に取り除き、対応年の短い自作の提供元の全日で
 * 結果を比べる。項目は目録（test/support/catalog.ts）の規則の形の代表と、個別の日付・毎年の月日で、その 2 つまでの
 * 組み合わせを総当たりする（乱数の種による当たり外れがない）。
 *
 * - 判定の条件は診断にそろえる（outOfRangePolicy: "ignore"。docs/decisions.md の 31 番）
 * - pnpm check では決まった抜き出しだけを試す。すべての組み合わせ（約 2.5 分）は ORACLE_FULL=1 で（CI の test:oracle ジョブ）
 * - 判定は暦日でタイムゾーンに依存しないので、タイムゾーンを変えた実行（scripts/test-tz.ts）では飛ばす
 * - ORACLE_TARGET=<パッケージのディレクトリ> で、ビルド済みの別の版（公開済みの版など）を試せる。ORACLE_SHARD=k/n で、
 *   組み合わせを n 個に分けた k 番目だけを試せる（長い実行を分けるため）
 */

import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { SHAPES, picker, random, type Context, type Obj } from "./support/catalog.ts";
import { SHORT_DAYS, SHORT_KEYS, SHORT_KINDS, SHORT_PROVIDER } from "./support/provider.ts";

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

const FULL = process.env["ORACLE_FULL"] === "1";
/** "k/n": 組み合わせを n 個に分けた k 番目（0 始まり）だけを試す（長い実行を分けるため） */
const SHARD = /^(\d+)\/(\d+)$/.exec(process.env["ORACLE_SHARD"] ?? "");
const SKIP =
  process.env["BIZDAYS_TZ_RUN"] === "1" &&
  "タイムゾーンに依存しないので、TZ を変えた実行では飛ばす";
const AS_OF = "2026-07-01";

// ------------------------------------------------------------
// 項目の一覧（目録の規則の形ごとに、種で決まる代表を 3 つずつ。閉じる・開く規則の両方に置く）
// ------------------------------------------------------------

const ctx: Context = {
  holidays: true,
  kinds: SHORT_KINDS,
  keys: SHORT_KEYS,
  year: 2026,
  newShapes: true,
};
type Item = readonly [key: string, value: unknown];
const items: Item[] = [];
{
  const p = picker(random(20261101));
  for (const shape of SHAPES) {
    const seen = new Set<string>();
    for (let i = 0; seen.size < 3 && i < 50; i++) {
      const rule = shape.make(p, ctx);
      const text = JSON.stringify(rule);
      if (seen.has(text)) continue;
      seen.add(text);
      items.push(["closedRecurringRules", rule], ["openRecurringRules", rule]);
    }
  }
  // 終わった規則（expired の約束を試すため）
  items.push(["closedRecurringRules", { dayOfMonth: 1, effectiveTo: "2025-12-31" }]);
  for (const d of ["2026-05-01", "2026-05-04", "2026-07-20"])
    items.push(["closedDates", d], ["openDates", d]);
  items.push(["closedDates", { from: "2026-04-30", to: "2026-05-06" }]);
  for (const a of ["05-01", "12-31", { from: "12-29", to: "01-03" }])
    items.push(["closedAnnualDates", a]);
}

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
        if (SHARD && n % Number(SHARD[2]) !== Number(SHARD[1])) continue;
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
    skip:
      SKIP ||
      (process.env["ORACLE_JOINT"] !== "1" && "0.31.0（P1）で有効にする。ORACLE_JOINT=1 で試せる"),
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
