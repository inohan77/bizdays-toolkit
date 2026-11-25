/**
 * The parts of the checks that keep the promises of the diagnostics that need no run of the library: the
 * dimensions of the options the promise inventory makes, and the table of dimensions (etc/promise-dimensions.json).
 * Used by scripts/promise-inventory.ts and checked by test/tools/promise-parts.test.ts.
 *
 * A cell is one combination of the dimensions:
 *   kind      ... "calendar" or "schedule"
 *   provider  ... the supported years of the holiday providers (their common part) against the diagnostic range:
 *                 "none", "inside" (shorter than the range and inside it), "same" (equal to it), "straddle" (has
 *                 years inside and outside it), "cover" (contains it and more), "outside" (no year in it)
 *   policy    ... outOfRangePolicy: "-" (no provider), "throw", "ignore"
 *   counting  ... whether a rule counts business days ("counting rule": businessDayOfMonth or businessDayOfWeek)
 *   years     ... where the specific dates and the effective periods of rules lie against the diagnostic range:
 *                 "no items" (none of them), "inside" (all of them have every day in it), "straddle" (some have days
 *                 inside and outside it, none is outside it), "outside" (some have no day in it)
 */

/** A range of years (both ends included) */
export interface Years {
  readonly from: number;
  readonly to: number;
}

export const KINDS = ["calendar", "schedule"] as const;
export const PROVIDER_CLASSES = ["none", "inside", "same", "straddle", "cover", "outside"] as const;
export const POLICIES = ["-", "throw", "ignore"] as const;
export const COUNTING = ["counting rule", "no counting rule"] as const;
export const YEAR_CLASSES = ["no items", "inside", "straddle", "outside"] as const;

/**
 * The class of the supported years of the providers against the diagnostic range.
 * @param span - The common part of the supported years of the providers, or null without a provider.
 * @param range - The diagnostic range.
 * @returns One of PROVIDER_CLASSES.
 */
export function providerClass(span: Years | null, range: Years): (typeof PROVIDER_CLASSES)[number] {
  if (span === null) return "none";
  if (span.to < range.from || span.from > range.to) return "outside";
  if (span.from === range.from && span.to === range.to) return "same";
  if (span.from >= range.from && span.to <= range.to) return "inside";
  if (span.from <= range.from && span.to >= range.to) return "cover";
  return "straddle";
}

/**
 * The class of one period of days against the diagnostic range.
 * @param from - The first day ("YYYY-MM-DD").
 * @param to - The last day ("YYYY-MM-DD").
 * @param range - The diagnostic range.
 * @returns "inside" (every day in it), "outside" (no day in it) or "straddle".
 */
export function periodClass(
  from: string,
  to: string,
  range: Years,
): "inside" | "straddle" | "outside" {
  const first = `${String(range.from).padStart(4, "0")}-01-01`;
  const last = `${String(range.to).padStart(4, "0")}-12-31`;
  if (to < first || from > last) return "outside";
  if (from >= first && to <= last) return "inside";
  return "straddle";
}

/**
 * The periods of the specific dates and of the effective periods of rules in options (an effective period open on
 * one side runs to the end of the calendar range on that side).
 * @param options - Calendar or schedule options (rules may hold a basis calendar; it is not looked into).
 * @returns One [from, to] per specific date and per rule with an effective period.
 */
export function periodsOf(options: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  for (const key of ["closedDates", "openDates", "dates"]) {
    const list = options[key];
    if (!Array.isArray(list)) continue;
    for (const d of list) {
      if (typeof d === "string") out.push([d, d]);
      else if (typeof d === "object" && d !== null) {
        const o = d as Record<string, unknown>;
        const from = (o["from"] ?? o["date"]) as string | undefined;
        const to = (o["to"] ?? o["date"] ?? o["from"]) as string | undefined;
        if (typeof from === "string" && typeof to === "string") out.push([from, to]);
      }
    }
  }
  for (const key of [
    "closedRecurringRules",
    "openRecurringRules",
    "recurringRules",
    "closedAnnualDates",
    "openAnnualDates",
    "annualDates",
  ]) {
    const list = options[key];
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (typeof r !== "object" || r === null) continue;
      const o = r as Record<string, unknown>;
      const from = o["effectiveFrom"] as string | undefined;
      const to = o["effectiveTo"] as string | undefined;
      if (from === undefined && to === undefined) continue;
      out.push([from ?? "1000-01-01", to ?? "9999-12-31"]);
    }
  }
  return out;
}

/**
 * The class of the years of the items of options.
 * @param options - Calendar or schedule options.
 * @param range - The diagnostic range.
 * @returns One of YEAR_CLASSES.
 */
export function yearClass(
  options: Record<string, unknown>,
  range: Years,
): (typeof YEAR_CLASSES)[number] {
  const classes = periodsOf(options).map(([from, to]) => periodClass(from, to, range));
  if (classes.length === 0) return "no items";
  if (classes.includes("outside")) return "outside";
  if (classes.includes("straddle")) return "straddle";
  return "inside";
}

/**
 * Whether options have a rule that counts business days.
 * @param options - Calendar or schedule options.
 * @returns true when a recurring rule has businessDayOfMonth or businessDayOfWeek.
 */
export function hasCountingRule(options: Record<string, unknown>): boolean {
  return ["closedRecurringRules", "openRecurringRules", "recurringRules"].some((key) => {
    const list = options[key];
    return (
      Array.isArray(list) &&
      list.some(
        (r) =>
          typeof r === "object" &&
          r !== null &&
          ("businessDayOfMonth" in r || "businessDayOfWeek" in r),
      )
    );
  });
}

/** The values of the dimensions of one set of options */
export interface Cell {
  readonly kind: (typeof KINDS)[number];
  readonly provider: (typeof PROVIDER_CLASSES)[number];
  readonly policy: (typeof POLICIES)[number];
  readonly counting: (typeof COUNTING)[number];
  readonly years: (typeof YEAR_CLASSES)[number];
}

/**
 * The key of a cell, as written in etc/promise-dimensions.json.
 * @param cell - The values of the dimensions.
 * @returns "<kind> | <provider> | <policy> | <counting> | <years>".
 */
export const cellKey = (cell: Cell): string =>
  `${cell.kind} | ${cell.provider} | ${cell.policy} | ${cell.counting} | ${cell.years}`;

/**
 * Every cell that can be written: a provider class other than "none" goes with "throw" or "ignore", "none" with
 * "-".
 * @returns The keys of all cells, in the order of the dimensions.
 */
export function allCells(): string[] {
  const out: string[] = [];
  for (const kind of KINDS)
    for (const provider of PROVIDER_CLASSES)
      for (const policy of provider === "none" ? (["-"] as const) : (["throw", "ignore"] as const))
        for (const counting of COUNTING)
          for (const years of YEAR_CLASSES)
            out.push(cellKey({ kind, provider, policy, counting, years }));
  return out;
}

/** The table of dimensions (etc/promise-dimensions.json) */
export interface DimensionTable {
  /** Cells the generator need not make: key → reason (a fact: why such options cannot be made) */
  readonly excluded: Readonly<Record<string, string>>;
  /**
   * The conditions the specification of the diagnostics names (in options and in results) that the inventory
   * must make: the names conditionsOf of scripts/promise-inventory.ts gives. A full run fails when a listed
   * condition was never made (the sentences about it would go unchecked) and when a condition that is not listed
   * was made (the list follows the generator)
   */
  readonly conditions: readonly string[];
}

/**
 * Checks the conditions that were made against the list of the table.
 * @param counts - How many options were checked per condition.
 * @param table - The table of dimensions.
 * @returns The problems (empty when the check passes).
 */
export function checkConditions(
  counts: Readonly<Record<string, number>>,
  table: Pick<DimensionTable, "conditions">,
): string[] {
  const problems: string[] = [];
  const listed = new Set(table.conditions);
  if (listed.size !== table.conditions.length) problems.push("a condition is listed twice");
  for (const name of table.conditions)
    if ((counts[name] ?? 0) === 0)
      problems.push(`no options were checked with the condition: ${name}`);
  for (const name of Object.keys(counts).sort())
    if (!listed.has(name))
      problems.push(`condition not listed in etc/promise-dimensions.json: ${name}`);
  return problems;
}

/**
 * Checks the counts of the cells against the table: every cell that is not excluded must have been made at least
 * once, an excluded cell must have a reason, must exist, and must not have been made (the table follows the
 * generator).
 * @param counts - How many options were made per cell key.
 * @param table - The table of dimensions.
 * @returns The problems (empty when the check passes).
 */
export function checkDimensions(
  counts: ReadonlyMap<string, number>,
  table: Pick<DimensionTable, "excluded">,
): string[] {
  const problems: string[] = [];
  const cells = new Set(allCells());
  for (const [key, reason] of Object.entries(table.excluded)) {
    if (!cells.has(key)) problems.push(`excluded cell does not exist: ${key}`);
    else if (reason.trim() === "") problems.push(`excluded cell without a reason: ${key}`);
    else if ((counts.get(key) ?? 0) > 0)
      problems.push(
        `excluded cell was made ${counts.get(key)!} time(s) (remove the entry): ${key}`,
      );
  }
  for (const key of cells)
    if (!(key in table.excluded) && (counts.get(key) ?? 0) === 0)
      problems.push(`no options were made for the cell: ${key}`);
  for (const key of counts.keys())
    if (!cells.has(key)) problems.push(`options were made for an unknown cell: ${key}`);
  return problems;
}

// ------------------------------------------------------------
// The table of lines the promise checks do not reach (etc/promise-coverage.json)
// ------------------------------------------------------------

/** A block of consecutive lines of one function that the promise checks did not run */
export interface CoverageBlock {
  readonly function: string;
  /** The text of the first line (trimmed) */
  readonly first: string;
  /** The number of lines with tokens in the block */
  readonly lines: number;
  /** The line number of the first line (for messages; the table does not hold it, so that lines may move) */
  readonly at: number;
  /** The lines and the parts that did not run (for messages) */
  readonly detail: string;
}

/** The kinds of blocks that may stay in the table */
export const COVERAGE_KINDS = ["option-error", "unreachable"] as const;

/** One entry of etc/promise-coverage.json */
export interface CoverageEntry {
  readonly function: string;
  readonly first: string;
  readonly lines: number;
  /** "option-error" (reports a mistake in the options) or "unreachable" (no input reaches it) */
  readonly kind: string;
  /** Why the block may stay unreached (a fact) */
  readonly reason: string;
}

/** The table of lines the promise checks do not reach */
export interface CoverageTable {
  readonly blocks: readonly CoverageEntry[];
}

/**
 * Checks the blocks the promise checks did not run against the table. One entry stands for one block (two blocks
 * with the same function, first line and length need two entries).
 * @param blocks - The blocks found.
 * @param table - The table.
 * @returns The problems (empty when the check passes).
 */
export function checkCoverageTable(
  blocks: readonly CoverageBlock[],
  table: CoverageTable,
): string[] {
  const problems: string[] = [];
  const used = new Set<number>();
  for (const b of blocks) {
    const i = table.blocks.findIndex(
      (e, k) =>
        !used.has(k) && e.function === b.function && e.first === b.first && e.lines === b.lines,
    );
    if (i >= 0) used.add(i);
    else
      problems.push(
        `NOT IN TABLE ${b.function} line ${b.at} (${b.lines} line(s)): ${b.first} [not run: ${b.detail}]`,
      );
  }
  table.blocks.forEach((e, k) => {
    if (!(COVERAGE_KINDS as readonly string[]).includes(e.kind))
      problems.push(
        `entry of ${e.function} has the kind "${e.kind}" (only ${COVERAGE_KINDS.join(", ")}): ${e.first}`,
      );
    if (e.reason.trim() === "")
      problems.push(`entry of ${e.function} without a reason: ${e.first}`);
    if (!used.has(k))
      problems.push(
        `entry of ${e.function} matches no block (it ran or changed; remove or update it): ${e.first} (${e.lines} line(s))`,
      );
  });
  return problems;
}

// ------------------------------------------------------------
// The table of what is not verified (etc/unverified.json)
// ------------------------------------------------------------

/**
 * The states of a row: "open" (not verified yet; the check before a release fails), "verified" (checked; the
 * evidence says how), "no-options" (no options reach it; the evidence says why), "documented" (left as it is and
 * written in a document; the evidence names the file)
 */
export const UNVERIFIED_STATES = ["open", "verified", "no-options", "documented"] as const;

/** One row of etc/unverified.json */
export interface UnverifiedRow {
  readonly id: string;
  /** What was not verified */
  readonly content: string;
  /** The version (or the work) in which it was found */
  readonly foundIn: string;
  readonly state: string;
  /** How it was settled (a fact; for "documented", the file that holds the text) */
  readonly evidence: string;
}

/**
 * Checks the rows of the table of what is not verified.
 * @param rows - The rows.
 * @param exists - Whether a file of the repository exists (for the evidence of "documented").
 * @param allowOpen - Whether rows in the state "open" are allowed (pnpm check checks the form only; the check
 *   before a release does not allow them).
 * @returns The problems (empty when the check passes).
 */
export function checkUnverified(
  rows: readonly UnverifiedRow[],
  exists: (file: string) => boolean,
  allowOpen: boolean,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const r of rows) {
    const name = r.id || "(no id)";
    if (r.id.trim() === "") problems.push("a row without an id");
    else if (ids.has(r.id)) problems.push(`two rows with the id ${r.id}`);
    ids.add(r.id);
    if (r.content.trim() === "") problems.push(`${name}: no content`);
    if (r.foundIn.trim() === "") problems.push(`${name}: no foundIn`);
    if (!(UNVERIFIED_STATES as readonly string[]).includes(r.state))
      problems.push(`${name}: unknown state "${r.state}" (${UNVERIFIED_STATES.join(", ")})`);
    else if (r.state === "open") {
      if (!allowOpen) problems.push(`${name}: OPEN ${r.content}`);
    } else if (r.evidence.trim() === "")
      problems.push(`${name}: the state ${r.state} without evidence`);
    else if (r.state === "documented") {
      const files = [...r.evidence.matchAll(/`([^`\s]+\.(?:md|ts|json))`/g)].map((m) => m[1]!);
      if (files.length === 0)
        problems.push(
          `${name}: documented, but the evidence names no file (write it in backquotes)`,
        );
      for (const f of files)
        if (!exists(f)) problems.push(`${name}: the evidence names ${f}, which does not exist`);
    }
  }
  return problems;
}
