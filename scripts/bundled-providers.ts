/**
 * Collects the holiday providers bundled in the package (the built dist) from `exports` of package.json.
 * The country subpaths are the exports without the root, the diagnostics, the provider tools and package.json.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The properties of a holiday used for comparison and verification (the provider contract. decisions.md #24, #25) */
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
  /** Subpath of exports ("./jp", ...) */
  readonly subpath: string;
  /** Export name in the module ("jp", "england", ...) */
  readonly exportName: string;
  readonly provider: BundledProvider;
}

/** Subpaths that are not country providers */
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

/**
 * The bundled providers of packageDir (the directory with package.json and dist), ordered by subpath and
 * export name
 */
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
