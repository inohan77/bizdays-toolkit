import "./strict-warnings.ts";
/**
 * Records the features of the options the generators actually produced (how test/fixtures/generator-features-0.30.3/
 * is made; test/tools/generator-features.test.ts checks inclusion against this record).
 *
 * How a record is made: the three callers of the generators at a given version (--ref; default v0.30.3) run in a
 * work directory as the files of that version (same seeds and numbers of trials), and the features of the options
 * passed to the creating and diagnosing functions (featuresOf of test/support/features.ts) and the date ranges
 * asked of the created calendars and schedules (scanFeatures) are collected.
 *
 * - properties      ... runs test/properties.test.ts with node
 * - diagnose-properties ... runs test/diagnose-properties.test.ts with node
 * - result-compare  ... runs scripts/result-compare.ts twice, the way that version was compared at publication
 *   (with the previous version, and the old-name comparison with 0.22.2) (the compared packages are stand-ins in
 *   the work directory that have only a version number)
 *
 * The src/ and dist/ the callers load are replaced, with a load hook (module.registerHooks), by parts wrapping the
 * current src/ of this repository (they record the options and pass them on to the real thing). Results of
 * judgements are not used, so passing or failing tests do not affect the record.
 *
 * Usage:
 *   node scripts/record-generator-features.ts --update --ref v0.30.3  # record 0.30.3 into the fixture directory
 *   node scripts/record-generator-features.ts --ref v0.30.4 --check   # do the callers of v0.30.4 produce the
 *                                                                     # recorded features?
 *   node scripts/record-generator-features.ts --worktree --check      # the same with the callers of the work tree
 *                                                                     # (the generator-features job of CI)
 * --check compares with the record using the same function as test/tools/generator-features.test.ts
 * (missingFeatures of test/support/features-compare.ts) and exits with 1 when a feature was lost. When a caller
 * yields fewer than half of the recorded features, it fails before comparing (so that a caller that changed how
 * it calls the functions does not pass with the replaced parts catching nothing). --worktree uses the files of
 * the work tree (including uncommitted changes). --ref HEAD is a usage error (HEAD of git points at a commit).
 * The record is committed and is rebuilt (--update) only when the way of comparing (how features are extracted;
 * test/support/features.ts) changes (the quality checks of RELEASING.md).
 * --update works only with --ref v0.30.3 (made from the current version, the inclusion check would compare the
 * generators with themselves).
 * The callers run with strict-warnings loaded and a Node.js warning fails (so that a warning of the hook is not
 * missed).
 * --update requires exit code 0 of the callers (so that the features of a caller that stopped half-way do not
 * shrink the baseline).
 * --check does not look at the exit code (a caller that stops half-way loses features, which shows as lost
 * features and fails the comparison).
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
// HEAD points at a commit in git, so it is not used as a name for the work tree (to prevent a mix-up it is not
// silently reinterpreted; a hint is printed)
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
// The ref is checked first (instead of stopping with an error of git show or the like for a ref that does not
// exist, a hint says what to point at)
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
/**
 * The git ref from which the callers are read (unused for the work tree; the work tree is the boolean `worktree`,
 * so it cannot be confused with a ref named "worktree")
 */
const ref = givenRef ?? "";
/** The name shown in the report */
const label = worktree ? "作業ツリー" : ref;
// A record is made only from the baseline version (0.30.3). Made from the current version, the inclusion check
// would compare the current generators with themselves and lose its meaning
if (update && ref !== RECORD_REF) {
  console.error(`--update records only from ${RECORD_REF} (the baseline), not from ${ref}`);
  process.exit(2);
}
const out = resolve(argValue("--out") ?? RECORD_DIR);

const repo = resolve(".");
const git = (...a: string[]): string => execFileSync("git", a, { encoding: "utf8", cwd: repo });

/** Compares version numbers ("a.b.c") */
const cmp = (a: string, b: string): number => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

// Use the real path (with a Windows short name or the /tmp link of macOS, the URL of the entry file, which
// Node.js reads by its real path, would differ from the URL of the work directory used to decide the replacement)
const work = realpathSync.native(mkdtempSync(join(tmpdir(), "generator-features-")));
try {
  // ------------------------------------------------------------
  // 1. Copy the callers' files into the work directory
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
  // Files the callers load that some versions lack (result-compare registers unexpected errors from 0.30.7)
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
  // The "previous version" when that version was published (the npm latest that result-compare of CI compared)
  const previous = git("tag", "--list", "v*")
    .split("\n")
    .map((t) => t.replace(/^v/, ""))
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && cmp(v, version) < 0)
    .sort(cmp)
    .at(-1)!;

  // ------------------------------------------------------------
  // 2. The load hook (replaces src/ of the work directory and dist/ of the stand-in packages by parts wrapping
  //    the current src/)
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
      // For a basis calendar (the mark BASIS_MARK of test/support/result-cases.ts), the closed-weekday features
      // are also counted separately with the prefix "basis."
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
  // The load hook (module.registerHooks; runs synchronously in the same thread)
  writeFileSync(
    join(work, "register.mjs"),
    `import { registerHooks } from "node:module";
const work = ${JSON.stringify(workUrl)};
const repoSrc = ${JSON.stringify(pathToFileURL(join(repo, "src")).href)};
const dist = new RegExp("^" + work.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&") + "/pkg-[^/]+/dist/(.+)\\\\.js$");
/** Turns src/<p> of the work directory and dist/<p>.js of a stand-in package into the URL of the replacement */
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

  // The stand-in packages (result-compare reads the version number; dist is replaced by the hook)
  const pkg = (name: string, v: string): string => {
    const dir = join(work, `pkg-${name}`);
    mkdirSync(join(dir, "etc"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: v }));
    return dir;
  };
  const head = pkg("head", version);
  const base = pkg("base", previous);
  const legacy = pkg("legacy", "0.22.2");
  // The list of intended differences is not used (passing or failing differences do not matter for the record)
  writeFileSync(join(work, "no-changes.json"), JSON.stringify({ changes: [] }));

  // ------------------------------------------------------------
  // 3. Run the callers and collect the features
  // ------------------------------------------------------------
  const record: FeatureRecord = {};
  const runSite = (site: string, argv: string[]): void => {
    const file = join(work, `${site}.jsonl`);
    writeFileSync(file, "");
    const started = Date.now();
    // Seeds and numbers of trials stay at that version's defaults (PROPERTY_SEED, which changes the seed, and
    // the mark of a run with another TZ are not passed).
    // Features are collected when calendars are created, so the full set runs, not the sample of pnpm check
    // (DIAGNOSE_PROPERTY_FULL)
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
    // Making a record requires that the callers ran to the end (exit code 0) (so that the features of a caller
    // that stopped half-way do not silently shrink the baseline). Comparing (--check) does not look at the exit
    // code (pnpm check sees whether the current callers' tests pass; a caller that stops half-way loses
    // features, which show as lost features, so the comparison fails too)
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
  // 4. Write the record, or compare with it
  // ------------------------------------------------------------
  if (check) {
    const recorded = readRecord(repo);
    // The check against an empty run: a caller that yields fewer than half of the recorded features fails
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
      console.log(`## ${label}（${version}）の呼び出し側と、0.30.3 の記録の比較\n`);
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
        note: `${ref}（${version}）の ${site} が作った設定の特徴（基準の記録。今のバージョンからは作り直さない）。作り方は scripts/record-generator-features.ts の冒頭`,
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
