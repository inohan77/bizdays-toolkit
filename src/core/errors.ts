/**
 * Errors with a code, and the collector of problems in the input.
 *
 * Error classes, their codes and the handling of messages: decisions.md #3. Which mistake gets which code:
 * decisions.md #8. Only errors at unreachable places (defects) are an InternalError without a code (created
 * with internalError). The collector (IssueCollector) is shared by the checks at creation and the diagnostics.
 */

/**
 * Known error codes (more may be added).
 * @public
 */
export type KnownErrorCode =
  /**
   * Wrong format or value of a date (a "YYYY-MM-DD" string or a Temporal-shaped year, month and day; includes a
   * year outside 1000-9999. decisions.md #1)
   */
  | "invalid-date"
  /** Wrong format or value of a month "YYYY-MM" */
  | "invalid-month"
  /** Wrong format or value of an annual month-day "MM-DD" */
  | "invalid-annual-date"
  /** Wrong format or value of a time or date-time */
  | "invalid-time"
  /** An input of a kind that is not accepted */
  | "invalid-input"
  /** Wrong IANA time zone name */
  | "invalid-time-zone"
  /** The start of a range is after its end */
  | "invalid-range"
  /** Wrong weekday number (0-6) */
  | "invalid-weekday"
  /** A wrong argument other than options (wrong method options, a number of days that is not an integer, ...) */
  | "invalid-argument"
  /**
   * Wrong options. Options are the object validated by the functions that create a business calendar or
   * schedule; a value that is not an object is included (decisions.md #8)
   */
  | "invalid-option"
  /**
   * Things that must share a time zone differ (the holiday providers of one set of options without `timeZone`;
   * calendars being combined; a schedule and the basis calendar of an nth-business-day rule). Zones are the same
   * when the runtime's Intl returns the same name; otherwise, when the runtime has Temporal, Temporal's
   * comparison decides (decisions.md #18). Without Temporal, in a runtime that does not canonicalize aliases,
   * two aliases ("UTC" and "Etc/UTC", ...) conflict
   */
  | "time-zone-conflict"
  /**
   * Outside the supported range (a provider's supported years; a date calculation or the conversion of an
   * instant left the years 1000-9999; a year outside 1000-9999 passed to a holiday list). A wrong year argument
   * of the functions of bizdays-toolkit/provider is invalid-argument
   */
  | "out-of-range"
  /** The judgement touched an unconfirmed holiday (confirmed: false) with unconfirmedHolidayPolicy: "throw" */
  | "unconfirmed-holiday"
  /** Wrong shape of a holiday provider */
  | "invalid-provider"
  /** Wrong data returned by a holiday provider */
  | "invalid-provider-data"
  /**
   * A run of holidays is too long to move the day of an "after-holiday" rule to the day after the run (the run
   * is longer than 31 days and out of reach, or lasts more than 367 days so the original day cannot be checked).
   * Thrown by the judgement of that day, by searches that pass it and by calculations over a period containing
   * it. Write a long closure with closedDates / closedAnnualDates, not as holidays
   */
  | "holiday-run-too-long"
  /**
   * No business day was found (the search exceeded searchDayLimit days; a month has fewer business days than
   * the n of an nth business day; a closing month of the calendar has no days of its own)
   */
  | "no-business-day"
  /** No closed day within searchDayLimit days (nextClosedDay, previousClosedDay) */
  | "no-closed-day";

/**
 * Error code. Later versions may add values.
 * @public
 */
export type ErrorCode = KnownErrorCode | (string & {});

/**
 * Whether a value is an error thrown by this library with a `code`.
 * @param error - Any caught value.
 * @returns true for an Error with a string `code` created by this library; false for other errors, including the
 *   library's InternalError.
 * @public
 */
export function isBizdaysError(error: unknown): error is Error & { readonly code: ErrorCode } {
  return (
    error instanceof Error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { bizdays?: unknown }).bizdays === true
  );
}

/**
 * Marks an error as thrown by this library.
 * @param error - The error to mark (mutated).
 * @param code - Error code; set as an enumerable `code` property. A non-enumerable `bizdays: true` is set too.
 * @returns The same error.
 * @internal
 */
export function withCode<E extends Error>(
  error: E,
  code: KnownErrorCode,
): E & { readonly code: ErrorCode } {
  Object.defineProperty(error, "code", { value: code, enumerable: true });
  Object.defineProperty(error, "bizdays", { value: true, enumerable: false });
  return error as E & { readonly code: ErrorCode };
}

/**
 * Creates a RangeError with a code.
 * @param code - Error code.
 * @param message - Message.
 * @returns The error (not thrown).
 * @internal
 */
export function rangeError(code: KnownErrorCode, message: string): RangeError {
  return withCode(new RangeError(message), code);
}

/**
 * @internal Error for a defect (a place that should be unreachable, a broken guarantee). It has no code
 * (isBizdaysError is false); the diagnostics rethrow it instead of reporting a provider error. Not used for
 * wrong options or input
 */
export class InternalError extends Error {
  override readonly name = "InternalError";
}

/**
 * Creates the error for a defect of the library itself (an unreachable branch or a broken guarantee).
 * @param message - Description; prefixed with "bizdays-toolkit internal error: ".
 * @returns An InternalError: it has no `code`, so {@link isBizdaysError} is false. Never used for invalid options or
 *   input.
 * @internal
 */
export function internalError(message: string): InternalError {
  return new InternalError(`bizdays-toolkit internal error: ${message}`);
}

/**
 * Text form of any value for error messages. Never throws.
 * @param value - Any value.
 * @returns Numbers and symbols by String(); bigint with an `n` suffix; "a function" for functions; the
 *   Object.prototype.toString tag (e.g. "[object Date]") for objects other than plain objects and arrays, and for
 *   objects JSON cannot serialize; otherwise the JSON form (strings are quoted), or String() when JSON has none
 *   (undefined).
 * @internal
 */
export function describeValue(value: unknown): string {
  if (typeof value === "number" || typeof value === "symbol") return String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return "a function";
  // Date, Map and the like are shown by their kind (as JSON a Date looks like a string and a Map like {})
  const tag = Object.prototype.toString.call(value);
  if (value && typeof value === "object" && !/^\[object (Object|Array)\]$/.test(tag)) return tag;
  try {
    // The same form as earlier versions (JSON). Values without a JSON form, such as undefined, use String
    return JSON.stringify(value) ?? String(value);
  } catch {
    // An object without a JSON form (circular, containing a BigInt, throwing when read)
    return tag;
  }
}

/**
 * Creates a TypeError with a code.
 * @param code - Error code.
 * @param message - Message.
 * @returns The error (not thrown).
 * @internal
 */
export function typeError(code: KnownErrorCode, message: string): TypeError {
  return withCode(new TypeError(message), code);
}

// ------------------------------------------------------------
// Collecting problems (shared by the checks at creation and the diagnostics)
// ------------------------------------------------------------

/** @internal Severity of a problem */
export type IssueSeverity = "error" | "warning" | "info";

/** @internal One problem in the options */
export interface Issue {
  readonly severity: IssueSeverity;
  readonly code: string;
  /** Position in the options (e.g. "dates[1].from"); "" for the options as a whole */
  readonly path: string;
  readonly message: string;
  /** Another related position (e.g. the rule that covers this one) */
  readonly relatedPath?: string;
  /** The unknown key and the known keys of unknown-option (for suggestions in the diagnostics; not in results) */
  readonly unknownKey?: string;
  readonly knownKeys?: readonly string[];
  /**
   * "national" in kinds of options with a union of providers (the diagnostics add the matched holidays and the
   * handling in 1.0.0; not in results)
   */
  readonly nationalInUnion?: true;
}

/** @internal Collects problems */
export class IssueCollector {
  readonly issues: Issue[] = [];

  /**
   * Records an error.
   * @param code - Error code.
   * @param path - Position in the options ("" for the whole options).
   * @param message - Message.
   */
  error(code: KnownErrorCode, path: string, message: string): void {
    this.issues.push({ severity: "error", code, path, message });
  }

  /**
   * Records a warning.
   * @param code - Diagnostic code.
   * @param path - Position in the options.
   * @param message - Message.
   * @param relatedPath - Related position; the property is omitted when undefined.
   */
  warning(code: string, path: string, message: string, relatedPath?: string): void {
    this.add("warning", code, path, message, relatedPath);
  }

  /**
   * Records an info item. Parameters as {@link IssueCollector.warning}.
   */
  info(code: string, path: string, message: string, relatedPath?: string): void {
    this.add("info", code, path, message, relatedPath);
  }

  /**
   * Appends an issue; `relatedPath` is omitted from the issue when undefined.
   */
  private add(
    severity: IssueSeverity,
    code: string,
    path: string,
    message: string,
    relatedPath: string | undefined,
  ): void {
    this.issues.push(
      relatedPath === undefined
        ? { severity, code, path, message }
        : { severity, code, path, message, relatedPath },
    );
  }

  /**
   * Whether any recorded issue has severity "error".
   */
  get hasErrors(): boolean {
    return this.issues.some((i) => i.severity === "error");
  }

  /**
   * Throws the first recorded error as a RangeError with its code and the message "path: message" (just the message
   * when the path is empty). Does nothing without errors.
   */
  throwFirstError(): void {
    const first = this.issues.find((i) => i.severity === "error");
    if (!first) return;
    const message = first.path ? `${first.path}: ${first.message}` : first.message;
    throw rangeError(first.code as KnownErrorCode, message);
  }
}

/**
 * Copy of an options object without the properties whose value is undefined (an explicit undefined means "omitted").
 * @param value - Options object; not changed.
 * @param keys - When given, only these keys are dropped.
 * @returns A new object. The key `value` is never dropped (a schedule value may be undefined).
 * @internal
 * @see decisions.md #6
 */
export function withoutUndefined(
  value: Record<string, unknown>,
  /** The properties to omit, when limited */
  keys?: readonly string[],
): Record<string, unknown> {
  const out = { ...value };
  for (const key of Object.keys(value)) {
    const limited = keys !== undefined && !keys.includes(key);
    if (value[key] === undefined && key !== "value" && !limited) delete out[key];
  }
  return out;
}

/**
 * Records an `unknown-option` warning for every own enumerable key of `value` that is not in `known`.
 * @param collector - Receives the warnings (with the unknown key and the known keys, used later for suggestions).
 * @param path - Position of `value` in the options ("" for the top level).
 * @param value - The object to check.
 * @param known - Valid keys at that position.
 * @internal
 */
export function checkUnknownKeys(
  collector: IssueCollector,
  path: string,
  value: object,
  known: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      collector.issues.push({
        severity: "warning",
        code: "unknown-option",
        path: path ? `${path}.${key}` : key,
        message: `Unknown option ${JSON.stringify(key)} is ignored`,
        unknownKey: key,
        knownKeys: known,
      });
    }
  }
}
