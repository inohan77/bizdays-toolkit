/**
 * パッケージ（ビルド済みの dist）が同梱する祝日の提供元を、package.json の exports から集める。
 * 国のサブパスは、exports からルート・診断・提供元向けの道具・package.json を除いたもの。
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** 比べる・照合するのに使う祝日の項目（提供元の契約の項目。decisions.md の 6・7・46 番） */
export interface BundledHoliday {
  readonly date: string;
  readonly name: string;
  readonly nameEn: string;
  readonly kind: string;
  readonly confirmed: boolean;
  readonly key?: string;
  readonly names?: Readonly<Record<string, string>>;
}

export interface BundledProvider {
  readonly id: string;
  readonly timeZone: string;
  readonly supportedYears: { readonly from: number; readonly to: number };
  readonly confirmedThrough?: number;
  readonly dataVersion: string;
  holidaysInYear(year: number): readonly BundledHoliday[];
}

export interface BundledEntry {
  /** exports のサブパス（"./jp" など） */
  readonly subpath: string;
  /** モジュールの export 名（"jp"・"england" など） */
  readonly exportName: string;
  readonly provider: BundledProvider;
}

/** 国の提供元ではないサブパス */
const NON_COUNTRY = new Set([".", "./diagnose", "./provider", "./package.json"]);

function isProvider(value: unknown): value is BundledProvider {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const years = v["supportedYears"] as Record<string, unknown> | undefined;
  return (
    typeof v["id"] === "string" &&
    typeof v["timeZone"] === "string" &&
    typeof v["holidaysInYear"] === "function" &&
    typeof years === "object" &&
    years !== null &&
    typeof years["from"] === "number" &&
    typeof years["to"] === "number"
  );
}

/** packageDir（package.json と dist のあるディレクトリ）の同梱の提供元を、サブパス・export 名の順に返す */
export async function loadBundledProviders(packageDir: string): Promise<BundledEntry[]> {
  const pkg = JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8")) as {
    exports: Record<string, string | { default: string }>;
  };
  const entries: BundledEntry[] = [];
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    if (NON_COUNTRY.has(subpath) || typeof target === "string") continue;
    const file = resolve(packageDir, target.default);
    if (!existsSync(file))
      throw new Error(`${packageDir}: ${subpath} の ${target.default} がない（ビルド前？）`);
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    for (const [exportName, value] of Object.entries(mod).sort(([a], [b]) => a.localeCompare(b))) {
      if (isProvider(value)) entries.push({ subpath, exportName, provider: value });
    }
  }
  return entries;
}
