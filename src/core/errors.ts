/**
 * コード付きの例外と、入力の問題を集める仕組み。
 *
 * 例外のクラスと code の対応、メッセージの扱いは decisions.md の 3 番、どの誤りがどの code になるかは 8 番。
 * 到達しない箇所の例外（作りの誤り）だけは code を持たない InternalError（internalError で作る）。
 * 問題を集める仕組み（IssueCollector）は、作成時のチェックと規則の診断（diagnose）で共通。
 */

/**
 * 既知のエラーコード（増えることがある）。
 * @public
 */
export type KnownErrorCode =
  /** 日付の形式・値の誤り（"YYYY-MM-DD" の文字列と、Temporal の形の年月日。年が 1000〜9999 の外も含む。decisions.md の 1 番） */
  | "invalid-date"
  /** 月 "YYYY-MM" の形式・値の誤り */
  | "invalid-month"
  /** 毎年の月日 "MM-DD" の形式・値の誤り */
  | "invalid-annual-date"
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
  /** 設定以外の引数の誤り（メソッドのオプションの誤り、整数でない日数など） */
  | "invalid-argument"
  /** 設定の誤り。設定は営業日カレンダー・スケジュールを作る関数が検証するオブジェクトで、オブジェクトでないことも含む（decisions.md の 8 番） */
  | "invalid-option"
  /**
   * 同じタイムゾーンでなければならないものが食い違う（1 つの設定の祝日の提供元どうしで、timeZone の指定がない。
   * 合成するカレンダーどうし。スケジュールと、第 n 営業日の規則の数える基準のカレンダー）。実行環境の Intl が返す名前が
   * 同じかで比べるので、別名どうし（"UTC" と "Etc/UTC" など）は、別名を同じ名前に直さない実行環境では食い違いになる
   */
  | "time-zone-conflict"
  /**
   * 対応している年の範囲の外（提供元の対応年、日付の計算や瞬間の変換が 1000〜9999 年の外に出た、祝日の一覧に渡した年が
   * 1000〜9999 の外）。bizdays-toolkit/provider の関数の年の引数の誤りは invalid-argument
   */
  | "out-of-range"
  /** 判定が未確定の祝日（confirmed: false）に触れた（unconfirmedHolidayPolicy: "throw"） */
  | "unconfirmed-holiday"
  /** 祝日の提供元の形式の誤り */
  | "invalid-provider"
  /** 祝日の提供元が返したデータの誤り */
  | "invalid-provider-data"
  /**
   * 営業日が見つからない（探索が searchDayLimit 日を超えた、月の営業日が第 n 営業日の n に足りない、カレンダーの締めの月に
   * 固有の期間がない）
   */
  | "no-business-day"
  /** searchDayLimit の日数のうちに休業日が見つからない（nextClosedDay・previousClosedDay） */
  | "no-closed-day";

/**
 * エラーコード。将来のバージョンで値が増えることがある。
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

/**
 * @internal 作りの誤り（到達しないはずの箇所・保証が破れたとき）の例外。code を持たず（isBizdaysError は false）、
 * 診断は提供元の誤りとして報告せずにそのまま投げる。設定や入力の誤りには使わない
 */
export class InternalError extends Error {
  override readonly name = "InternalError";
}

/** @internal 作りの誤りの例外を作る（到達しない箇所の例外は、すべてこの形にする） */
export function internalError(message: string): InternalError {
  return new InternalError(`bizdays-toolkit internal error: ${message}`);
}

/**
 * @internal 例外のメッセージに値を埋め込むときの表し方。Symbol・BigInt でもメッセージを組み立てられる（テンプレート文字列と
 * JSON.stringify は、これらで TypeError を投げるか undefined を返す）。数は String の形（NaN・Infinity を JSON の null にしない）、
 * 文字列は引用符付き（空文字列や空白を見分けられる）、Date・Map などは種類（"[object Date]"）、ほかの値は JSON の形
 */
export function describeValue(value: unknown): string {
  if (typeof value === "number" || typeof value === "symbol") return String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return "a function";
  // Date・Map などは種類で表す（JSON の形だと、Date が文字列に、Map が {} に見える）
  const tag = Object.prototype.toString.call(value);
  if (value && typeof value === "object" && !/^\[object (Object|Array)\]$/.test(tag)) return tag;
  try {
    // 前のバージョンと同じ表し方（JSON の形）。undefined などの JSON にならない値は String の形
    return JSON.stringify(value) ?? String(value);
  } catch {
    // JSON にできないオブジェクト（循環・BigInt を含むもの・読むと投げるもの）
    return tag;
  }
}

/** @internal */
export function typeError(code: KnownErrorCode, message: string): TypeError {
  return withCode(new TypeError(message), code);
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
  /** 和集合の設定の kinds の "national"（診断で、当てている祝日と 1.0.0 での扱いを添えるため。結果には出さない） */
  readonly nationalInUnion?: true;
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
 * @internal 値が undefined の項目を除いた複製（なければ元のオブジェクト）。設定の明示的な undefined は省略と同じ
 * （decisions.md の 6 番）。知らないキーの検査（checkUnknownKeys）は除く前のオブジェクトに対して行う。
 * スケジュールの value は undefined も値として持てるので除かない
 */
export function withoutUndefined(
  value: Record<string, unknown>,
  /** 除く項目を限るとき、その項目 */
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
