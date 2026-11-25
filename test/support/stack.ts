// Turns off the runtime's recording of stacks during a loop that looks only at error codes (for the time of the
// tests).
// The tests that remove and compare call the public functions day by day over all days of a wide period and
// catch errors on days outside the supported years and the like. Recording a stack takes time for every error
// created, so the recording is off only during that loop. The library throws as before and the tests catch as
// before. Turning it off globally (--stack-trace-limit=0) is not used: a failing test would have no stack

/**
 * Sets Error.stackTraceLimit to 0 only during `fn` and restores the value on leaving (also when leaving by an
 * error).
 * Only for synchronous loops that look at the message and code of errors (being synchronous, no error of
 * another test is created while it is off)
 */
export function withoutStackTraces<T>(fn: () => T): T {
  const saved = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    return fn();
  } finally {
    Error.stackTraceLimit = saved;
  }
}
