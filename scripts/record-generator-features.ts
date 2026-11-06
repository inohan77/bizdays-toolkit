import "./strict-warnings.ts";
/**
 * 生成器が実際に作った設定の特徴を記録する（test/fixtures/generator-features-0.30.3/ の作り方。
 * test/generator-features.test.ts がこの記録との包含を確かめる）。
 *
 * 記録の作り方: 指定した版（--ref。既定 v0.30.3）の 3 つの生成器の呼び出し側を、その版のファイルのまま
 * （種と試行の数を変えずに）作業用ディレクトリで動かし、作成・診断の関数に渡された設定の特徴（test/support/features.ts の
 * featuresOf）と、作ったカレンダー・スケジュールに問い合わせた日付の範囲（scanFeatures）を集める。
 *
 * - properties      … test/properties.test.ts を node で実行する
 * - diagnose-properties … test/diagnose-properties.test.ts を node で実行する
 * - result-compare  … scripts/result-compare.ts を、その版の公開時の比べ方（前の版との比較と、0.22.2 との旧名の比較）で
 *   2 回実行する（比べる版のパッケージは作業用ディレクトリの仮のもので、版の番号だけを持つ）
 *
 * 呼び出し側が読み込む src/・dist/ は、読み込みのフック（module.registerHooks）で、このリポジトリの今の src/ を包んだ部品に
 * 差し替える（設定を記録してから本物に渡す）。判定の結果は使わないので、テストの合否は記録に影響しない。
 *
 * 使い方:
 *   node scripts/record-generator-features.ts --update --ref v0.30.3  # v0.30.3 を記録して test/fixtures/generator-features-0.30.3/ に書く
 *   node scripts/record-generator-features.ts --ref v0.30.4 --check   # v0.30.4 の呼び出し側が記録の特徴を作るかを確かめる
 *   node scripts/record-generator-features.ts --worktree --check      # 作業ツリーの呼び出し側で同じことを確かめる（CI の generator-features ジョブ）
 * --check は、記録との差を test/generator-features.test.ts と同じ関数（test/support/features-compare.ts の missingFeatures）で比べ、
 * 落ちた特徴があれば終了コード 1。呼び出し側ごとに拾えた特徴が記録の半分に満たなければ、比べる前に失敗にする
 * （呼び出し側が関数の呼び方を変えて、差し替えた部品が何も拾わないまま合格するのを防ぐ）。--worktree は作業ツリーのファイル（コミットしていない変更を含む）を使う。--ref HEAD は使い方の誤り（git の HEAD はコミットを指すため）。
 * 記録はコミットしておき、作り直す（--update）のは比べ方（特徴の取り出し方。test/support/features.ts）を変えたときだけにする
 * （RELEASING.md の「品質の確認」）。
 * --update は --ref v0.30.3 でだけ動く（今の版から作ると、包含の検査が自分自身との比較になるため）。
 * 呼び出し側は strict-warnings を読み込んで動かし、Node.js の警告が出たら失敗にする（フックの警告を見落とさないため）。
 * --update では呼び出し側の終了コード 0 を必須にする（途中で止まった呼び出し側の特徴で基準が小さくなるのを防ぐ）。
 * --check では終了コードを見ない（途中で止まれば、拾えない特徴が落ちた特徴として出て、比べた結果が失敗になる）。
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { importArgs } from "./import-args.ts";
import {
  RECORD_DIR,
  RECORD_REF,
  missingFeatures,
  readRecord,
  type FeatureRecord,
} from "../test/support/features-compare.ts";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const worktree = args.includes("--worktree");
const check = args.includes("--check");
const update = args.includes("--update");
const usage =
  "usage: node scripts/record-generator-features.ts (--update --ref v0.30.3 | --check (--ref <git ref> | --worktree)) [--out <dir>]";
// HEAD は git ではコミットを指すので、作業ツリーを指す名前には使わない（取り違えを防ぐため、黙って読み替えずに案内する）
if (argValue("--ref") === "HEAD") {
  console.error(
    "--ref HEAD is not accepted: use --worktree to check the working tree (uncommitted files included)",
  );
  console.error(usage);
  process.exit(2);
}
const givenRef = argValue("--ref");
if (check === update || (givenRef === undefined) === !worktree || (update && worktree)) {
  console.error(usage);
  process.exit(2);
}
// 参照は最初に確かめる（存在しない参照で git show などのエラーのまま止まらず、何を指せばよいかを案内する）
if (givenRef !== undefined) {
  const found = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${givenRef}^{commit}`], {
    cwd: resolve("."),
    encoding: "utf8",
  });
  if (found.status !== 0) {
    console.error(
      `--ref ${givenRef}: not a commit in this repository (use a tag such as v0.30.4, or --worktree for the working tree)`,
    );
    console.error(usage);
    process.exit(2);
  }
}
/** 呼び出し側を読む git の参照（作業ツリーのときは使わない。作業ツリーは真偽値 worktree で持ち、"worktree" という名前の参照と取り違えない） */
const ref = givenRef ?? "";
/** 報告に出す名前 */
const label = worktree ? "作業ツリー" : ref;
// 記録は基準の版（v0.30.3）からだけ作る。今の版から作ると、包含の検査が今の生成器と自分自身の比較になって意味を失う
if (update && ref !== RECORD_REF) {
  console.error(`--update records only from ${RECORD_REF} (the baseline), not from ${ref}`);
  process.exit(2);
}
const out = resolve(argValue("--out") ?? RECORD_DIR);

const repo = resolve(".");
const git = (...a: string[]): string => execFileSync("git", a, { encoding: "utf8", cwd: repo });

/** 版の番号（"a.b.c"）を比べる */
const cmp = (a: string, b: string): number => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

// 実際のパスにそろえる（Windows の短い名前・macOS の /tmp のリンクのままだと、Node.js が実際のパスで読む入口の
// ファイルの URL と、差し替えの判定に使う作業用ディレクトリの URL が食い違う）
const work = realpathSync.native(mkdtempSync(join(tmpdir(), "generator-features-")));
try {
  // ------------------------------------------------------------
  // 1. 呼び出し側のファイルを作業用ディレクトリに写す
  // ------------------------------------------------------------
  const files = [
    "package.json",
    "etc/result-changes.json",
    "scripts/strict-warnings.ts",
    "scripts/result-compare.ts",
    "test/properties.test.ts",
    "test/diagnose-properties.test.ts",
  ];
  const support = worktree
    ? ["test/support"]
    : git("ls-tree", "-r", "--name-only", ref, "test/support").split("\n").filter(Boolean);
  // 呼び出し側が読み込む、版によってはないファイル（result-compare の予期しない例外の登録は 0.30.7 から）
  const optional = ["scripts/exit-on-unexpected.ts"].filter((file) =>
    worktree
      ? existsSync(join(repo, file))
      : git("ls-tree", "--name-only", ref, file).trim() !== "",
  );
  for (const file of [...files, ...optional, ...support]) {
    const dest = join(work, file);
    mkdirSync(dirname(dest), { recursive: true });
    if (worktree) cpSync(join(repo, file), dest, { recursive: true });
    else writeFileSync(dest, git("show", `${ref}:${file}`));
  }
  const version = (
    JSON.parse(readFileSync(join(work, "package.json"), "utf8")) as { version: string }
  ).version;
  // その版を公開したときの「前の版」（CI の result-compare が比べた npm の latest）
  const previous = git("tag", "--list", "v*")
    .split("\n")
    .map((t) => t.replace(/^v/, ""))
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && cmp(v, version) < 0)
    .sort(cmp)
    .at(-1)!;

  // ------------------------------------------------------------
  // 2. 読み込みのフック（作業用ディレクトリの src/・仮のパッケージの dist/ を、今の src/ を包んだ部品に差し替える）
  // ------------------------------------------------------------
  const src = (p: string): string => pathToFileURL(join(repo, "src", p)).href;
  const features = pathToFileURL(join(repo, "test/support/features.ts")).href;
  const shim = (realUrl: string, wraps: string[]): string =>
    [
      `import * as real from ${JSON.stringify(realUrl)};`,
      `import { diagnoseRangeOf, featuresOf, providerKey, scanFeatures } from ${JSON.stringify(features)};`,
      `import { appendFileSync } from "node:fs";`,
      `export * from ${JSON.stringify(realUrl)};`,
      `const g = globalThis;`,
      `if (!g.__features) {`,
      `  g.__features = new Set(); g.__scans = [];`,
      `  process.on("exit", () => {`,
      `    for (const s of g.__scans) if (s.min) for (const f of scanFeatures(s.provider, s.min, s.max, s.range)) g.__features.add(f);`,
      `    appendFileSync(process.env.FEATURES_FILE, JSON.stringify([...g.__features]) + "\\n");`,
      `  });`,
      `}`,
      // 基準のカレンダー（test/support/result-cases.ts の BASIS_MARK の印）は、定休日の特徴を「basis.」を付けて別にも数える
      `const BASIS = Symbol.for("bizdays-toolkit.result-compare.basis");`,
      `const record = (o, kind) => { try { const fs = featuresOf(o, kind); for (const f of fs) g.__features.add(f); if (o && o[BASIS]) for (const f of fs) if (f.startsWith("closedWeekdays")) g.__features.add("basis." + f); } catch (e) { g.__features.add("record-error=" + e.message); } };`,
      `const DATE = /^\\d{4}-\\d{2}-\\d{2}/;`,
      `const watch = (made, o) => {`,
      `  if (typeof made !== "object" || made === null) return made;`,
      `  const s = { provider: providerKey(o), range: diagnoseRangeOf(o), min: undefined, max: undefined }; g.__scans.push(s);`,
      `  const copy = { ...made };`,
      `  for (const [k, v] of Object.entries(made)) if (typeof v === "function") copy[k] = (...a) => {`,
      `    for (const x of a) if (typeof x === "string" && DATE.test(x)) { const d = x.slice(0, 10); if (!s.min || d < s.min) s.min = d; if (!s.max || d > s.max) s.max = d; }`,
      `    return v(...a);`,
      `  };`,
      `  return Object.freeze(copy);`,
      `};`,
      ...wraps,
    ].join("\n");
  const shims: Record<string, string> = {
    "index.ts": shim(src("index.ts"), [
      `export const createCalendar = (o, ...r) => { record(o, "calendar"); return watch(real.createCalendar(o, ...r), o); };`,
      `export const createSchedule = (o, ...r) => { record(o, "schedule"); return watch(real.createSchedule(o, ...r), o); };`,
    ]),
    "diagnose.ts": shim(src("diagnose/index.ts"), [
      `export const diagnoseCalendar = (o, ...r) => { record(o, "calendar"); return real.diagnoseCalendar(o, ...r); };`,
      `export const diagnoseSchedule = (o, ...r) => { record(o, "schedule"); return real.diagnoseSchedule(o, ...r); };`,
    ]),
  };
  mkdirSync(join(work, "__shim__"));
  for (const [name, text] of Object.entries(shims))
    writeFileSync(join(work, "__shim__", name), text);
  const workUrl = pathToFileURL(work).href;
  // 読み込みのフック（module.registerHooks。同じスレッドで同期に動く）
  writeFileSync(
    join(work, "register.mjs"),
    `import { registerHooks } from "node:module";
const work = ${JSON.stringify(workUrl)};
const repoSrc = ${JSON.stringify(pathToFileURL(join(repo, "src")).href)};
const dist = new RegExp("^" + work.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&") + "/pkg-[^/]+/dist/(.+)\\\\.js$");
/** 作業用ディレクトリの src/<p> と、仮のパッケージの dist/<p>.js を、差し替え先の URL にする */
function target(url) {
  let m = url.startsWith(work + "/src/") ? url.slice((work + "/src/").length) : undefined;
  if (m === undefined) {
    const d = dist.exec(url);
    if (d) m = d[1] + ".ts";
  }
  if (m === undefined) return undefined;
  if (m === "index.ts") return work + "/__shim__/index.ts";
  if (m === "diagnose/index.ts") return work + "/__shim__/diagnose.ts";
  return repoSrc + "/" + m;
}
registerHooks({
  resolve(specifier, context, next) {
    let url;
    try { url = new URL(specifier, context.parentURL).href; } catch { return next(specifier, context); }
    const t = target(url);
    return t ? { url: t, shortCircuit: true } : next(specifier, context);
  },
});
`,
  );

  // 仮のパッケージ（result-compare が版の番号を読む。dist はフックで差し替える）
  const pkg = (name: string, v: string): string => {
    const dir = join(work, `pkg-${name}`);
    mkdirSync(join(dir, "etc"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: v }));
    return dir;
  };
  const head = pkg("head", version);
  const base = pkg("base", previous);
  const legacy = pkg("legacy", "0.22.2");
  // 意図した差分の一覧は使わない（差分の合否は記録に関係しない）
  writeFileSync(join(work, "no-changes.json"), JSON.stringify({ changes: [] }));

  // ------------------------------------------------------------
  // 3. 呼び出し側を動かして特徴を集める
  // ------------------------------------------------------------
  const record: FeatureRecord = {};
  const runSite = (site: string, argv: string[]): void => {
    const file = join(work, `${site}.jsonl`);
    writeFileSync(file, "");
    const started = Date.now();
    // 種と試行の数はその版の既定のまま（種を変える PROPERTY_SEED と、TZ を変えた実行の印は渡さない）。
    // 特徴はカレンダーを作るときに集めるので、抜き出し（pnpm check）ではなく全件を動かす（DIAGNOSE_PROPERTY_FULL）
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      FEATURES_FILE: file,
      DIAGNOSE_PROPERTY_FULL: "1",
    };
    delete env["PROPERTY_SEED"];
    delete env["BIZDAYS_TZ_RUN"];
    const r = spawnSync(
      process.execPath,
      [
        ...importArgs([join(repo, "scripts/strict-warnings.ts"), join(work, "register.mjs")]),
        ...argv,
      ],
      {
        cwd: work,
        encoding: "utf8",
        env,
        maxBuffer: 1 << 28,
      },
    );
    // 記録を作るときは、呼び出し側が最後まで動いたこと（終了コード 0）を必須にする（途中で止まった呼び出し側の特徴で、
    // 基準が黙って小さくなるのを防ぐ）。比べるとき（--check）は終了コードを見ない（今の呼び出し側のテストの合否は
    // pnpm check が見る。途中で止まれば拾えない特徴が落ちた特徴として出るので、比べた結果も失敗になる）
    if (update && r.status !== 0) {
      console.error(r.stdout.slice(-2000), r.stderr.slice(-2000));
      throw new Error(
        `${site}: the caller exited with ${r.status} (--update needs every caller to finish)`,
      );
    }
    const warned = r.stderr
      .split("\n")
      .filter((l) => l.includes("Node.js warning treated as an error"));
    if (warned.length > 0) throw new Error(`${site}: Node.js warnings\n${warned.join("\n")}`);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (lines.length === 0) {
      console.error(r.stdout.slice(-2000), r.stderr.slice(-2000));
      throw new Error(`${site}: no features recorded (exit ${r.status})`);
    }
    const set = new Set(record[site] ?? []);
    for (const line of lines) for (const f of JSON.parse(line) as string[]) set.add(f);
    record[site] = [...set].sort();
    console.error(
      `${site}: ${argv.slice(-6).join(" ")} … exit ${r.status}, ${set.size} features, ${Math.round((Date.now() - started) / 1000)}s`,
    );
  };
  runSite("properties", ["test/properties.test.ts"]);
  runSite("diagnose-properties", ["test/diagnose-properties.test.ts"]);
  const compare = (b: string, label: string): string[] => [
    "scripts/result-compare.ts",
    "--base",
    b,
    "--head",
    head,
    "--base-label",
    label,
    "--changes",
    join(work, "no-changes.json"),
  ];
  runSite("result-compare", compare(base, previous));
  runSite("result-compare", compare(legacy, "0.22.2"));

  // ------------------------------------------------------------
  // 4. 書き出す、または記録と比べる
  // ------------------------------------------------------------
  if (check) {
    const recorded = readRecord(repo);
    // 空振りの検査: 拾えた特徴が記録の半分に満たない呼び出し側があれば失敗
    const thin = Object.entries(recorded).filter(
      ([site, list]) => (record[site]?.length ?? 0) < list.length / 2,
    );
    if (thin.length > 0) {
      for (const [site, list] of thin)
        console.log(
          `- ${site}: 拾えた特徴 ${record[site]?.length ?? 0} 件（記録 ${list.length} 件の半分未満）`,
        );
      console.log(
        "\n**失敗**（呼び出し側から設定を拾えていない。差し替えの部品が呼び出しを捕まえているかを確かめる）",
      );
      process.exitCode = 1;
    } else {
      const missing = missingFeatures(recorded, record);
      const total = Object.values(missing).reduce((n, list) => n + list.length, 0);
      console.log(`## ${label}（${version}）の呼び出し側と、v0.30.3 の記録の比較\n`);
      for (const [site, list] of Object.entries(missing))
        console.log(
          `- ${site}: 拾えた特徴 ${record[site]?.length ?? 0} 件、落ちた特徴 ${list.length} 件` +
            (list.length > 0 ? `\n  - ${list.join("\n  - ")}` : ""),
        );
      console.log(
        total > 0 ? `\n**失敗**（落ちた特徴 ${total} 件）` : "\n**合格**（落ちた特徴なし）",
      );
      process.exitCode = total > 0 ? 1 : 0;
    }
  } else {
    mkdirSync(out, { recursive: true });
    for (const [site, features] of Object.entries(record)) {
      const body = {
        note: `${ref}（${version}）の ${site} が作った設定の特徴（基準の記録。今の版からは作り直さない）。作り方は scripts/record-generator-features.ts の冒頭`,
        ref,
        version,
        site,
        features,
      };
      writeFileSync(join(out, `${site}.json`), `${JSON.stringify(body, null, 2)}\n`);
    }
    console.error(`wrote ${out}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
