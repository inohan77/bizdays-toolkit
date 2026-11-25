/**
 * Allowance for a performance regression (used by scripts/bench-compare.ts). A line in the development log
 * (docs/development-log.md) of the current version (or [Unreleased]), one per measurement, in the form
 *
 *   <ALLOWANCE_PREFIX><measurement name> <particle> <number>x <accepting phrase> <(reason, full-width parentheses)>
 *
 * (see ALLOWANCE_PREFIX and the regular expression in allowedRatio) accepts that measurement up to the written
 * ratio even when it exceeds the limit.
 *
 * A line that merely contains the prefix words, or a line without a reason in parentheses, is not an allowance
 * (in 0.31.9 a line about a speed-up used these words as its heading, and the work went on until just before
 * publication in a state that would pass over the limit; tool-selftest found it). Writing which measurement and
 * up to what ratio also stops a regression larger than the one meant to be accepted (the "performance
 * regression" row of the quality table of RELEASING.md)
 */

/**
 * Head of an allowance line. The measurement name, a particle, the ratio and the accepting phrase follow (the line is
 * written in Japanese, the language of the development log)
 */
export const ALLOWANCE_PREFIX = "- 性能の退行: ";

/**
 * Reads the ratio allowed for a measurement from the bodies of the log sections; undefined without an allowance
 * line. Measurement names contain full-width parentheses, so the line is not parsed by a regular expression
 * but found by an exact match of its head
 */
export function allowedRatio(sections: readonly string[], name: string): number | undefined {
  const head = `${ALLOWANCE_PREFIX}${name} は `;
  for (const section of sections) {
    for (const line of section.split("\n")) {
      if (!line.startsWith(head)) continue;
      // Only a line with a reason (one or more characters in full-width parentheses) is an allowance (no
      // allowance without a reason)
      const m = /^(\d+(?:\.\d+)?)x まで受け入れる（.+）/.exec(line.slice(head.length));
      if (m) return Number(m[1]);
    }
  }
  return undefined;
}
