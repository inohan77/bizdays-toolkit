/**
 * 祝日のほかの言語の名称（Holiday.names）の検証。提供元のデータの検証（schedule.ts）と、振替日の計算（bizdays-toolkit/provider の
 * withSubstituteDays）が同じ検証を使う（国の提供元は使わないので、errors.ts とは分ける）。
 */

import { describeValue } from "./errors.ts";

/** @internal 祝日のほかの言語の名称を検証する（誤りがあれば理由を返す） */
export function checkNames(names: unknown): string | undefined {
  // 普通のオブジェクト（別の実行環境で作られたものも可）。継承した項目を持つものは受け付けない
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
