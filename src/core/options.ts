/**
 * Test for an object received as options (docs/decisions.md #8). Every function that takes options uses it.
 * Kept apart from errors.ts because the country providers do not use it.
 */

/**
 * Whether a value is accepted as an options object: a non-null, non-array object whose Object.prototype.toString tag
 * is "[object Object]" (so Date, Map, Set, RegExp, functions and boxed primitives are rejected, and objects from
 * another realm are accepted).
 * @internal
 * @see decisions.md #8
 */
export const isOptionsObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.prototype.toString.call(v) === "[object Object]";
