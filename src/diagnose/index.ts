/**
 * 規則の診断（bizdays-toolkit/diagnose）。
 *
 * 営業日カレンダー・スケジュールの設定を調べ、誤り・使われない規則・打ち間違いなどを返す。
 * 開発やテストで使う道具なので、アプリの本体のバンドルに入らないようサブパスに分けている。
 */

export {
  diagnoseCalendar,
  diagnoseSchedule,
  type Diagnostic,
  type DiagnosticCode,
  type DiagnosticSeverity,
  type KnownDiagnosticCode,
} from "../core/diagnose.ts";
