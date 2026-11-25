/**
 * Diagnostics of rules (bizdays-toolkit/diagnose).
 *
 * Examines the options of a business calendar or schedule and returns errors, unused rules, typos and so on.
 * A tool for development and tests, kept in a subpath so that it stays out of the application bundle.
 */

export {
  diagnoseCalendar,
  diagnoseSchedule,
  type DiagnoseOptions,
  type Diagnostic,
  type DiagnosticCode,
  type DiagnosticSeverity,
  type KnownDiagnosticCode,
} from "../core/diagnose.ts";
export {
  migrateCalendarOptions,
  migrateScheduleOptions,
  type OptionChange,
  type OptionsMigration,
} from "../core/migrate.ts";
