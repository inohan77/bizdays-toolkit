/**
 * Checks where in the decisions document (docs/decisions.md) the public names are decided (called by
 * check-claims.ts).
 *
 * Prevents the omission of adding an option key without its default or the reason for its handling in the
 * decisions document. Two checks:
 *
 * 1. Every input property users write has "Type.property → decision number" in etc/option-decisions.json, and
 *    the section of that number mentions the property's name inside backticks. The number is the one decision
 *    that decides the property's handling (what omission means, why it is required, the accepted values).
 *    Covered: every property of the option types (types whose name ends with Options, the recurring-rule types,
 *    the effective period) and the optional properties of the other input types (the provider contract,
 *    Temporal-shaped inputs, the holiday value of schedules, date entries). A property of the same name has one
 *    row per type, which finds the case where only one type's handling is written (a review after 0.32.2 found
 *    the reason for the default of a schedule's holidayPolicy only on the business-calendar side). Public types
 *    with properties are classified as input or result in this file (an unclassified type fails, so a new input
 *    type cannot silently fall outside)
 * 2. Every function, method and error code is mentioned inside backticks somewhere in the decisions document, or
 *    is listed with a reason in etc/undocumented-names.json (adding a public name forces a choice between
 *    writing a decision and writing why not)
 *
 * In both lists a row that is no longer needed (a property the public types lack, a name the decisions document
 * now mentions) fails.
 * Limits: only the presence of the name is checked; whether the reason is sufficient and whether the number
 * really decides that type's property is checked by a person. The recurring rules' per-shape types (8) are
 * merged into RecurringRule and the date-entry types into DateEntry, so properties of the same name across
 * shapes (months, skipWeekdays, calendar, anchor, ...) are checked with one row (a difference between shapes is
 * not found). Properties of result types are not covered. Check 2 cannot find the omission of a method whose
 * name exists on several types.
 */

import { RENAMED_KEYS } from "../src/core/renamed.ts";

/** A property of a type (read from the interfaces of etc/api.md, the record of the public API) */
interface Member {
  readonly name: string;
  /** Whether it can be omitted */
  readonly optional: boolean;
  readonly type: string;
}

/** Names and members of the interfaces of etc/api.md (only the members written directly in the interface) */
export function interfacesOf(api: string): Map<string, { fields: Member[]; methods: string[] }> {
  const out = new Map<string, { fields: Member[]; methods: string[] }>();
  for (const m of api.matchAll(
    /^export interface (\w+)(?:<[^{]*?>)?(?: extends [^{]*)? \{\n([\s\S]*?)\n\}/gm,
  )) {
    const body = m[2]!;
    out.set(m[1]!, {
      // Only lines starting with four spaces (members of nested types are not counted).
      // A member's type can span several lines, so only its first line is read (enough to recognise never and
      // undefined)
      fields: [...body.matchAll(/^ {4}readonly (\w+)(\??): ([^\n]*)$/gm)].map((f) => ({
        name: f[1]!,
        optional: f[2] === "?",
        type: f[3]!.replace(/;$/, "").trim(),
      })),
      methods: [...new Set([...body.matchAll(/^ {4}(\w+)(?:<[^(\n]*>)?\(/gm)].map((f) => f[1]!))],
    });
  }
  return out;
}

/** Option types (decided by name). Every property is checked */
const isOptionType = (name: string): boolean =>
  name.endsWith("Options") || name.endsWith("Pattern") || name === "EffectivePeriod";
/** Type names in the list. The per-shape types of recurring rules and the date-entry types are each merged into one */
const RULE = "RecurringRule";
const DATE_ENTRY = "DateEntry";
/**
 * Input types users write besides the option types (names as in the list). Their optional properties are checked
 * (a required property defines the shape and leaves no choice about omission). `all` marks a type whose every
 * property is checked (which properties are written changes the meaning)
 */
const INPUT_TYPES: Readonly<Record<string, { readonly listed: string; readonly all?: true }>> = {
  HolidayProvider: { listed: "HolidayProvider" },
  // Also a result type, but people who write providers return it from holidaysInYear and pass it to
  // withSubstituteDays
  Holiday: { listed: "Holiday" },
  TemporalDateLike: { listed: "TemporalDateLike" },
  TemporalDateTimeLike: { listed: "TemporalDateLike" },
  TemporalInstantLike: { listed: "TemporalDateLike" },
  ScheduleHolidayPolicy: { listed: "ScheduleHolidayPolicy", all: true },
  RecurringRule: { listed: RULE },
  RecurringPattern: { listed: RULE },
  ScheduleRecurringRule: { listed: RULE },
  SpecificDate: { listed: DATE_ENTRY },
  DateRange: { listed: DATE_ENTRY },
  AnnualDate: { listed: DATE_ENTRY },
  AnnualRange: { listed: DATE_ENTRY },
  ScheduleSpecificDate: { listed: DATE_ENTRY },
  ScheduleDateRange: { listed: DATE_ENTRY },
  ScheduleAnnualDate: { listed: DATE_ENTRY },
  ScheduleAnnualRange: { listed: DATE_ENTRY },
};
/** Result types and types with methods (properties are not checked; methods are examined by publicNamesOf) */
const RESULT_TYPES: ReadonlySet<string> = new Set([
  "Calendar",
  "Schedule",
  "HolidayLookup",
  "DayInfo",
  "ScheduleDayInfo",
  "CivilDateTimeParts",
  "Diagnostic",
  "OptionChange",
  "OptionsMigration",
]);

/** Names and members of the types with properties in etc/api.md (interfaces and type aliases with properties) */
export function typesWithMembers(api: string): Map<string, Member[]> {
  const out = new Map<string, Member[]>();
  for (const [name, { fields }] of interfacesOf(api)) out.set(name, fields);
  // For a type alias every readonly property in the definition is taken (without telling which shape of the
  // union it belongs to)
  for (const m of api.matchAll(/^export type (\w+)(?:<[^\n]*?>)? = ([\s\S]*?);\n```/gm)) {
    const seen = new Map<string, Member>();
    for (const f of m[2]!.matchAll(/readonly (\w+)(\??): ([^;\n]*)/g)) {
      const prior = seen.get(f[1]!);
      // When the same name is in several shapes, it is optional if it can be omitted in any of them
      seen.set(f[1]!, {
        name: f[1]!,
        optional: f[2] === "?" || prior?.optional === true,
        type: f[3]!.trim(),
      });
    }
    if (seen.size > 0) out.set(m[1]!, [...seen.values()]);
  }
  return out;
}

/**
 * Whether a key is an old name of 0.30.0 (the same type has the new name, or an old name of a merged type).
 * Decision #10 decides them together
 */
const isOldName = (key: string, siblings: ReadonlySet<string>, listed: string): boolean =>
  RENAMED_KEYS.some(
    (r) => r.from === key && (siblings.has(r.to) || (listed === RULE && r.place === "rule")),
  );

/**
 * The input properties to check ("Type.property") and the unclassified types. never / undefined properties that
 * only separate shapes and the old names of 0.30.0 are left out
 */
export function optionKeysOf(api: string): { keys: string[]; unclassified: string[] } {
  const keys = new Set<string>();
  const unclassified: string[] = [];
  for (const [name, fields] of typesWithMembers(api)) {
    const input = INPUT_TYPES[name];
    const listed = isOptionType(name) ? (name.endsWith("Pattern") ? RULE : name) : input?.listed;
    if (listed === undefined) {
      if (!RESULT_TYPES.has(name)) unclassified.push(name);
      continue;
    }
    const everything = isOptionType(name) || input?.all === true;
    const siblings = new Set(fields.map((f) => f.name));
    for (const f of fields) {
      if (f.type === "never" || f.type === "undefined") continue;
      if (isOldName(f.name, siblings, listed)) continue;
      if (everything || f.optional) keys.add(`${listed}.${f.name}`);
    }
  }
  return { keys: [...keys].sort(), unclassified: unclassified.sort() };
}

/** Names of the public functions, methods and error codes */
export function publicNamesOf(api: string, errorsSource: string): string[] {
  const names = new Set<string>();
  for (const m of api.matchAll(/^export declare function (\w+)/gm)) names.add(m[1]!);
  const interfaces = interfacesOf(api);
  for (const owner of ["Calendar", "Schedule", "HolidayLookup"])
    for (const method of interfaces.get(owner)?.methods ?? []) names.add(method);
  // Comments are removed before reading, so that quoted words in comments (a "throw" in a description, ...) are
  // not counted as codes (and before looking for the ";" that ends the type: a ";" inside a comment must not
  // cut the type short)
  const source = errorsSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const codes = /export type KnownErrorCode =([\s\S]*?);/.exec(source)?.[1] ?? "";
  for (const m of codes.matchAll(/"([a-z-]+)"/g)) names.add(m[1]!);
  return [...names].sort();
}

/** Sections of the decisions document (number → body) */
export function decisionSections(decisions: string): Map<number, string> {
  const heads = [...decisions.matchAll(/^### (\d+)\. .+$/gm)];
  const out = new Map<number, string>();
  for (const m of heads) {
    const rest = decisions.slice(m.index + m[0].length);
    const end = /^#{2,3} /m.exec(rest);
    out.set(Number(m[1]), end ? rest.slice(0, end.index) : rest);
  }
  return out;
}

/**
 * Whether a name occurs in the text inside a code span (a part of one line between backticks). Other characters
 * may accompany it, as in `{ sameAs: 0 }`. Code spans are cut out in pairs from the left (words outside code
 * spans, between a closing backtick and the next opening one, are not counted). An occurrence continued by a
 * letter, digit, underscore or hyphen on either side (part of another name) is not counted. Code spans across
 * lines and the contents of code blocks are not read
 */
export function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`);
  for (const line of text.split("\n"))
    for (const span of line.matchAll(/`([^`]*)`/g)) if (word.test(span[1]!)) return true;
  return false;
}

export interface Coverage {
  readonly failures: string[];
  readonly optionKeys: number;
  readonly names: number;
  /** Public names that occur in the decisions document (the rest are in the list of reasons for not writing one) */
  readonly mentioned: number;
}

/**
 * The result of the check. optionDecisions is "Type.property → decision number"; undocumented is "name → reason
 * for no decision"
 */
export function decisionCoverage(input: {
  readonly api: string;
  readonly errorsSource: string;
  readonly decisions: string;
  readonly optionDecisions: Readonly<Record<string, unknown>>;
  readonly undocumented: Readonly<Record<string, unknown>>;
}): Coverage {
  const failures: string[] = [];
  const sections = decisionSections(input.decisions);
  // 1. Option keys
  const { keys, unclassified } = optionKeysOf(input.api);
  for (const name of unclassified)
    failures.push(
      `scripts/decision-coverage.ts: the public type ${name} has members but is not classified (add it to INPUT_TYPES if users write it, or to RESULT_TYPES if the library returns it)`,
    );
  for (const key of keys) {
    const decision = input.optionDecisions[key];
    const name = key.slice(key.indexOf(".") + 1);
    if (decision === undefined) {
      failures.push(
        `etc/option-decisions.json: ${key} is not listed (add the number of the decision that decides how it is handled)`,
      );
    } else if (typeof decision !== "number" || !sections.has(decision)) {
      failures.push(
        `etc/option-decisions.json: ${key} points to ${JSON.stringify(decision)}, which is not a decision in docs/decisions.md`,
      );
    } else if (!mentions(sections.get(decision)!, name)) {
      failures.push(
        `etc/option-decisions.json: ${key} points to decision ${decision}, but that decision does not mention \`${name}\``,
      );
    }
  }
  for (const key of Object.keys(input.optionDecisions))
    if (!keys.includes(key))
      failures.push(
        `etc/option-decisions.json: ${key} is listed, but it is not an option in etc/api.md (remove the entry)`,
      );
  // 2. Functions, methods and error codes
  const names = publicNamesOf(input.api, input.errorsSource);
  let mentioned = 0;
  for (const name of names) {
    const reason = input.undocumented[name];
    const found = mentions(input.decisions, name);
    if (reason === undefined) {
      if (found) mentioned++;
      else
        failures.push(
          `docs/decisions.md: ${name} is public but no decision mentions it (write the decision, or list it in etc/undocumented-names.json with the reason)`,
        );
    } else if (typeof reason !== "string" || reason.trim() === "") {
      failures.push(`etc/undocumented-names.json: ${name} needs a reason`);
    } else if (found) {
      failures.push(
        `etc/undocumented-names.json: ${name} is listed, but a decision mentions it now (remove the entry)`,
      );
    }
  }
  for (const name of Object.keys(input.undocumented))
    if (!names.includes(name))
      failures.push(
        `etc/undocumented-names.json: ${name} is listed, but it is not a public function, method or error code (remove the entry)`,
      );
  return { failures, optionKeys: keys.length, names: names.length, mentioned };
}
