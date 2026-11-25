// The environment variables tests read (a value that is not a number, or not one of the defined values, throws
// instead of silently falling back to the default. The quality checks of RELEASING.md).

/** An integer environment variable (`fallback` when unset or empty) */
export function intEnv(name: string, fallback: number): number {
  const text = process.env[name];
  if (text === undefined || text === "") return fallback;
  if (!/^-?\d+$/.test(text))
    throw new Error(`${name} must be an integer, got ${JSON.stringify(text)}`);
  return Number(text);
}

/** An environment variable that is true for "1" and false when unset, empty or "0" (any other value throws) */
export function flagEnv(name: string): boolean {
  const text = process.env[name];
  if (text === undefined || text === "" || text === "0") return false;
  if (text === "1") return true;
  throw new Error(`${name} must be "1" or "0", got ${JSON.stringify(text)}`);
}
