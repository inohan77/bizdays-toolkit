/**
 * Validation of a holiday's names in other languages (Holiday.names). Shared by the validation of provider data
 * (schedule.ts) and the substitute-day calculation (withSubstituteDays of bizdays-toolkit/provider). Kept apart
 * from errors.ts because the country providers do not use it.
 */

import { describeValue } from "./errors.ts";

/**
 * Validates `Holiday.names` (names in other languages).
 * @param names - Expected: a plain object whose keys are BCP 47 language tags in canonical form and whose values are
 *   non-empty strings.
 * @returns undefined when valid; otherwise the reason, as the end of an error message.
 * @internal
 */
export function checkNames(names: unknown): string | undefined {
  // A plain object (one from another realm is accepted). An object with inherited entries is rejected
  const isObject = typeof names === "object" && names !== null && !Array.isArray(names);
  const proto: unknown = isObject ? Object.getPrototypeOf(names) : undefined;
  if (!isObject || (proto !== null && Object.getPrototypeOf(proto) !== null)) {
    return "must be a plain object of { [language tag]: name }";
  }
  for (const [tag, value] of Object.entries(names as object)) {
    let canonical: string | undefined;
    try {
      canonical = Intl.getCanonicalLocales(tag)[0];
    } catch {
      return `${describeValue(tag)} is not a BCP 47 language tag`;
    }
    if (canonical !== tag) {
      return `${describeValue(tag)} must be written in canonical form ${describeValue(canonical)}`;
    }
    if (typeof value !== "string" || value === "") {
      return `${describeValue(tag)} must be a non-empty string`;
    }
  }
  return undefined;
}
