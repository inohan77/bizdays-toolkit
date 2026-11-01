// テストが読む環境変数（数でない値や決めた値以外を黙って既定に戻さず、例外にする。RELEASING.md の「品質の確認」）。

/** 整数の環境変数（未設定・空なら fallback） */
export function intEnv(name: string, fallback: number): number {
  const text = process.env[name];
  if (text === undefined || text === "") return fallback;
  if (!/^-?\d+$/.test(text))
    throw new Error(`${name} must be an integer, got ${JSON.stringify(text)}`);
  return Number(text);
}

/** "1" なら true、未設定・空・"0" なら false の環境変数（ほかの値は例外） */
export function flagEnv(name: string): boolean {
  const text = process.env[name];
  if (text === undefined || text === "" || text === "0") return false;
  if (text === "1") return true;
  throw new Error(`${name} must be "1" or "0", got ${JSON.stringify(text)}`);
}
