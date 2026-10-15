/**
 * コード付きの例外と、入力の問題を集める仕組み。
 *
 * 例外は従来どおり RangeError・TypeError・Error のインスタンスで、code プロパティを持つ。
 * 例外のメッセージの文言は API に含まない（変わることがある）。判定には code を使う。
 * 問題を集める仕組み（IssueCollector）は、作成時のチェックと規則の診断（diagnose）で共通。
 */

/**
 * 既知のエラーコード（増えることがある）。
 * @public
 */
export type KnownErrorCode =
  /** 日付 "YYYY-MM-DD" の形式・値の誤り */
  | "invalid-date"
  /** 月 "YYYY-MM" の形式・値の誤り */
  | "invalid-month"
  /** 毎年の月日 "MM-DD" の形式・値の誤り */
  | "invalid-month-day"
  /** 時刻・日時の形式・値の誤り */
  | "invalid-time"
  /** 受け付けない種類の入力 */
  | "invalid-input"
  /** IANA タイムゾーン名の誤り */
  | "invalid-time-zone"
  /** 期間の開始が終了より後 */
  | "invalid-range"
  /** 曜日の番号（0〜6）の誤り */
  | "invalid-weekday"
  /** 引数の値の誤り（整数でない日数など） */
  | "invalid-argument"
  /** 設定の値の誤り */
  | "invalid-option"
  /** 祝日の提供元どうしのタイムゾーンが異なり、timeZone の指定が必要 */
  | "time-zone-conflict"
  /** 対応している年の範囲の外 */
  | "out-of-range"
  /** 祝日の提供元の形式の誤り */
  | "invalid-provider"
  /** 祝日の提供元が返したデータの誤り */
  | "invalid-provider-data"
  /** 指定した日数の範囲に営業日がない */
  | "no-business-day";

/**
 * エラーコード。将来の版で値が増えることがある。
 * @public
 */
export type ErrorCode = KnownErrorCode | (string & {});

/**
 * このライブラリが投げた例外（code 付き）か。
 * @public
 */
export function isBizdaysError(error: unknown): error is Error & { readonly code: ErrorCode } {
  return (
    error instanceof Error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { bizdays?: unknown }).bizdays === true
  );
}

function withCode<E extends Error>(
  error: E,
  code: KnownErrorCode,
): E & { readonly code: ErrorCode } {
  Object.defineProperty(error, "code", { value: code, enumerable: true });
  Object.defineProperty(error, "bizdays", { value: true, enumerable: false });
  return error as E & { readonly code: ErrorCode };
}

/** @internal */
export function rangeError(code: KnownErrorCode, message: string): RangeError {
  return withCode(new RangeError(message), code);
}

/** @internal */
export function typeError(code: KnownErrorCode, message: string): TypeError {
  return withCode(new TypeError(message), code);
}

/** @internal */
export function plainError(code: KnownErrorCode, message: string): Error {
  return withCode(new Error(message), code);
}

// ------------------------------------------------------------
// 問題を集める仕組み（作成時のチェックと、規則の診断で共通）
// ------------------------------------------------------------

/** @internal 問題の重さ */
export type IssueSeverity = "error" | "warning" | "info";

/** @internal 設定の問題 1 件 */
export interface Issue {
  readonly severity: IssueSeverity;
  readonly code: string;
  /** 設定の中の位置（例: "dates[1].from"）。設定全体なら "" */
  readonly path: string;
  readonly message: string;
  /** 関係する別の位置（例: 覆っている先の規則） */
  readonly relatedPath?: string;
  /** unknown-option の知らないキーと既知のキー（診断で候補を挙げるため。結果には出さない） */
  readonly unknownKey?: string;
  readonly knownKeys?: readonly string[];
}

/** @internal 問題を集める */
export class IssueCollector {
  readonly issues: Issue[] = [];

  error(code: KnownErrorCode, path: string, message: string): void {
    this.issues.push({ severity: "error", code, path, message });
  }

  warning(code: string, path: string, message: string, relatedPath?: string): void {
    this.add("warning", code, path, message, relatedPath);
  }

  info(code: string, path: string, message: string, relatedPath?: string): void {
    this.add("info", code, path, message, relatedPath);
  }

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

  get hasErrors(): boolean {
    return this.issues.some((i) => i.severity === "error");
  }

  /** 最初の誤りを例外にして投げる（誤りがなければ何もしない） */
  throwFirstError(): void {
    const first = this.issues.find((i) => i.severity === "error");
    if (!first) return;
    const message = first.path ? `${first.path}: ${first.message}` : first.message;
    throw rangeError(first.code as KnownErrorCode, message);
  }
}

/**
 * @internal 設定のオブジェクトに、知らないキーがあれば警告として記録する。
 * 近い既知のキーを候補に挙げるのは規則の診断で行う（作成時は警告を使わないので、ここでは既知のキーを渡すだけ）
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
