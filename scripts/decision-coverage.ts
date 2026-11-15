/**
 * 公開の名前が、決定の文書（docs/decisions.md）のどこで決まっているかを確かめる（check-claims.ts が呼ぶ）。
 *
 * 設定の項目を足したのに、その既定値や扱いの理由が決定の文書にない、という漏れを防ぐ。確かめるのは 2 つ:
 *
 * 1. 利用者が書く入力の項目は、etc/option-decisions.json に「型.項目 → 決定の番号」があり、その番号の節に、項目の
 *    名前がバッククォートの中で現れること。番号は、その項目の扱い（省略したときの扱い、必須にしたこと、受ける値）を
 *    決めている決定を 1 つ書く。対象は、設定の型（名前が Options で終わる型・繰り返しの規則の型・有効期間）のすべての
 *    項目と、そのほかの入力の型（提供元の契約・Temporal の形の入力・スケジュールの祝日の値・日付の項目）の省略できる
 *    項目。同じ名前の項目でも型ごとに行が分かれるので、片方の型の扱いだけが書かれている場合を見つけられる（0.32.2 の
 *    後の点検で、スケジュールの holidayPolicy の既定の理由が、営業日カレンダーの側にしかなかった）。項目を持つ公開の型は、
 *    入力か結果かをこのファイルで分類する（分類のない型は失敗にする。新しい入力の型が、対象から黙って外れない）
 * 2. 関数・メソッド・例外の code は、決定の文書のどこかにバッククォートの中で現れるか、etc/undocumented-names.json に
 *    理由付きで載っていること（新しい公開の名前を足したときに、決定を書くか、書かない理由を書くかを選ばせる）
 *
 * どちらの一覧も、載っているのに要らなくなった行（公開の型にない項目・決定の文書に現れるようになった名前）は失敗にする。
 * 限界: 確かめるのは名前が現れることまでで、理由が十分に書かれているか、指した番号が本当にその型の項目を決めているかは、
 * 人が読んで確かめる。繰り返しの規則は形ごとの型（8 つ）を RecurringRule に、日付の項目の型を DateEntry にまとめるので、
 * 形をまたぐ同じ名前の項目（months・skipWeekdays・calendar・anchor など）は 1 行で確かめる（形ごとに扱いが違っても
 * 見つけられない）。結果の型の項目は対象にしていない。2 の検査は、同じ名前が複数の型にあるメソッドの漏れを見つけられない。
 */

import { RENAMED_KEYS } from "../src/core/renamed.ts";

/** 型の項目（公開の API の記録 etc/api.md の interface から読む） */
interface Member {
  readonly name: string;
  /** 省略できるか */
  readonly optional: boolean;
  readonly type: string;
}

/** etc/api.md の interface の名前と項目（項目は、その interface に直接書かれたものだけ） */
export function interfacesOf(api: string): Map<string, { fields: Member[]; methods: string[] }> {
  const out = new Map<string, { fields: Member[]; methods: string[] }>();
  for (const m of api.matchAll(
    /^export interface (\w+)(?:<[^{]*?>)?(?: extends [^{]*)? \{\n([\s\S]*?)\n\}/gm,
  )) {
    const body = m[2]!;
    out.set(m[1]!, {
      // 4 つの空白で始まる行だけ（入れ子の型の項目は数えない）
      // 型が複数の行にわたる項目もあるので、型は最初の行だけを読む（never・undefined を見分けるのに足りる）
      fields: [...body.matchAll(/^ {4}readonly (\w+)(\??): ([^\n]*)$/gm)].map((f) => ({
        name: f[1]!,
        optional: f[2] === "?",
        type: f[3]!.replace(/;$/, "").trim(),
      })),
      methods: [...new Set([...body.matchAll(/^ {4}(\w+)(?:<[^(\n]*>)?\(/gm)].map((f) => f[1]!))],
    });
  }
  return out;
}

/** 設定の型（名前で決まる）。すべての項目を確かめる */
const isOptionType = (name: string): boolean =>
  name.endsWith("Options") || name.endsWith("Pattern") || name === "EffectivePeriod";
/** 一覧での型の名前。繰り返しの規則の形ごとの型と、日付の項目の型は、それぞれ 1 つにまとめる */
const RULE = "RecurringRule";
const DATE_ENTRY = "DateEntry";
/**
 * 設定の型のほかに、利用者が書く入力の型（一覧での型の名前）。省略できる項目を確かめる（必須の項目は形の定義で、
 * 省略したときの扱いという選ぶ余地がない）。all は、すべての項目を確かめる型（項目のどれを書くかで意味が変わる）
 */
const INPUT_TYPES: Readonly<Record<string, { readonly listed: string; readonly all?: true }>> = {
  HolidayProvider: { listed: "HolidayProvider" },
  // 結果の型でもあるが、提供元を書く人が holidaysInYear で返し、withSubstituteDays にも渡す
  Holiday: { listed: "Holiday" },
  TemporalDateLike: { listed: "TemporalDateLike" },
  TemporalDateTimeLike: { listed: "TemporalDateLike" },
  TemporalInstantLike: { listed: "TemporalDateLike" },
  ScheduleHolidayPolicy: { listed: "ScheduleHolidayPolicy", all: true },
  RecurringRule: { listed: RULE },
  RecurringPattern: { listed: RULE },
  ScheduleRecurringRule: { listed: RULE },
  SpecificDate: { listed: DATE_ENTRY },
  DateRange: { listed: DATE_ENTRY },
  AnnualDate: { listed: DATE_ENTRY },
  AnnualRange: { listed: DATE_ENTRY },
  ScheduleSpecificDate: { listed: DATE_ENTRY },
  ScheduleDateRange: { listed: DATE_ENTRY },
  ScheduleAnnualDate: { listed: DATE_ENTRY },
  ScheduleAnnualRange: { listed: DATE_ENTRY },
};
/** 結果の型・メソッドを持つ型（項目は確かめない。メソッドは publicNamesOf が見る） */
const RESULT_TYPES: ReadonlySet<string> = new Set([
  "Calendar",
  "Schedule",
  "HolidayLookup",
  "DayInfo",
  "ScheduleDayInfo",
  "CivilDateTimeParts",
  "Diagnostic",
  "OptionChange",
  "OptionsMigration",
]);

/** etc/api.md の、項目を持つ型（interface と、項目を持つ型の別名）の名前と項目 */
export function typesWithMembers(api: string): Map<string, Member[]> {
  const out = new Map<string, Member[]>();
  for (const [name, { fields }] of interfacesOf(api)) out.set(name, fields);
  // 型の別名は、定義の中の readonly の項目をすべて拾う（共用体のどの形の項目かは区別しない）
  for (const m of api.matchAll(/^export type (\w+)(?:<[^\n]*?>)? = ([\s\S]*?);\n```/gm)) {
    const seen = new Map<string, Member>();
    for (const f of m[2]!.matchAll(/readonly (\w+)(\??): ([^;\n]*)/g)) {
      const prior = seen.get(f[1]!);
      // 同じ名前が複数の形にあるときは、どれかで省略できれば、省略できる項目として扱う
      seen.set(f[1]!, {
        name: f[1]!,
        optional: f[2] === "?" || prior?.optional === true,
        type: f[3]!.trim(),
      });
    }
    if (seen.size > 0) out.set(m[1]!, [...seen.values()]);
  }
  return out;
}

/** 0.30.0 の旧名か（同じ型に新しい名前があるか、まとめた型の旧名）。決定の 10 番がまとめて決めている */
const isOldName = (key: string, siblings: ReadonlySet<string>, listed: string): boolean =>
  RENAMED_KEYS.some(
    (r) => r.from === key && (siblings.has(r.to) || (listed === RULE && r.place === "rule")),
  );

/**
 * 確かめる入力の項目（「型.項目」）と、分類されていない型。形を分けるための never・undefined の項目と、
 * 0.30.0 の旧名は除く
 */
export function optionKeysOf(api: string): { keys: string[]; unclassified: string[] } {
  const keys = new Set<string>();
  const unclassified: string[] = [];
  for (const [name, fields] of typesWithMembers(api)) {
    const input = INPUT_TYPES[name];
    const listed = isOptionType(name) ? (name.endsWith("Pattern") ? RULE : name) : input?.listed;
    if (listed === undefined) {
      if (!RESULT_TYPES.has(name)) unclassified.push(name);
      continue;
    }
    const everything = isOptionType(name) || input?.all === true;
    const siblings = new Set(fields.map((f) => f.name));
    for (const f of fields) {
      if (f.type === "never" || f.type === "undefined") continue;
      if (isOldName(f.name, siblings, listed)) continue;
      if (everything || f.optional) keys.add(`${listed}.${f.name}`);
    }
  }
  return { keys: [...keys].sort(), unclassified: unclassified.sort() };
}

/** 公開の関数・メソッド・例外の code の名前 */
export function publicNamesOf(api: string, errorsSource: string): string[] {
  const names = new Set<string>();
  for (const m of api.matchAll(/^export declare function (\w+)/gm)) names.add(m[1]!);
  const interfaces = interfacesOf(api);
  for (const owner of ["Calendar", "Schedule", "HolidayLookup"])
    for (const method of interfaces.get(owner)?.methods ?? []) names.add(method);
  // コメントの中の引用符の語（説明に出てくる "throw" など）を code と数えないように、コメントを除いてから読む
  const codes = (/export type KnownErrorCode =([\s\S]*?);/.exec(errorsSource)?.[1] ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const m of codes.matchAll(/"([a-z-]+)"/g)) names.add(m[1]!);
  return [...names].sort();
}

/** 決定の文書の節（番号 → 本文） */
export function decisionSections(decisions: string): Map<number, string> {
  const heads = [...decisions.matchAll(/^### (\d+)\. .+$/gm)];
  const out = new Map<number, string>();
  for (const m of heads) {
    const rest = decisions.slice(m.index + m[0].length);
    const end = /^#{2,3} /m.exec(rest);
    out.set(Number(m[1]), end ? rest.slice(0, end.index) : rest);
  }
  return out;
}

/**
 * 文の中に、名前がコード片（1 行の中の、バッククォートで囲んだ部分）の中で現れるか。`{ sameAs: 0 }` のように、ほかの字と
 * 一緒でもよい。コード片は左から順に対で切り出す（閉じのバッククォートから次の開きまでの、コード片の外の語は数えない）。
 * 前後に英数字・下線・ハイフンが続くもの（別の名前の一部）は数えない。行をまたぐコード片と、コードブロックの中は読まない
 */
export function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`);
  for (const line of text.split("\n"))
    for (const span of line.matchAll(/`([^`]*)`/g)) if (word.test(span[1]!)) return true;
  return false;
}

export interface Coverage {
  readonly failures: string[];
  readonly optionKeys: number;
  readonly names: number;
  /** 公開の名前のうち、決定の文書に現れるもの（残りは、理由を書かない一覧に載っている） */
  readonly mentioned: number;
}

/**
 * 確かめた結果。optionDecisions は「型.項目 → 決定の番号」、undocumented は「名前 → 決定に書かない理由」
 */
export function decisionCoverage(input: {
  readonly api: string;
  readonly errorsSource: string;
  readonly decisions: string;
  readonly optionDecisions: Readonly<Record<string, unknown>>;
  readonly undocumented: Readonly<Record<string, unknown>>;
}): Coverage {
  const failures: string[] = [];
  const sections = decisionSections(input.decisions);
  // 1. 設定の項目
  const { keys, unclassified } = optionKeysOf(input.api);
  for (const name of unclassified)
    failures.push(
      `scripts/decision-coverage.ts: the public type ${name} has members but is not classified (add it to INPUT_TYPES if users write it, or to RESULT_TYPES if the library returns it)`,
    );
  for (const key of keys) {
    const decision = input.optionDecisions[key];
    const name = key.slice(key.indexOf(".") + 1);
    if (decision === undefined) {
      failures.push(
        `etc/option-decisions.json: ${key} is not listed (add the number of the decision that decides how it is handled)`,
      );
    } else if (typeof decision !== "number" || !sections.has(decision)) {
      failures.push(
        `etc/option-decisions.json: ${key} points to ${JSON.stringify(decision)}, which is not a decision in docs/decisions.md`,
      );
    } else if (!mentions(sections.get(decision)!, name)) {
      failures.push(
        `etc/option-decisions.json: ${key} points to decision ${decision}, but that decision does not mention \`${name}\``,
      );
    }
  }
  for (const key of Object.keys(input.optionDecisions))
    if (!keys.includes(key))
      failures.push(
        `etc/option-decisions.json: ${key} is listed, but it is not an option in etc/api.md (remove the entry)`,
      );
  // 2. 関数・メソッド・例外の code
  const names = publicNamesOf(input.api, input.errorsSource);
  let mentioned = 0;
  for (const name of names) {
    const reason = input.undocumented[name];
    const found = mentions(input.decisions, name);
    if (reason === undefined) {
      if (found) mentioned++;
      else
        failures.push(
          `docs/decisions.md: ${name} is public but no decision mentions it (write the decision, or list it in etc/undocumented-names.json with the reason)`,
        );
    } else if (typeof reason !== "string" || reason.trim() === "") {
      failures.push(`etc/undocumented-names.json: ${name} needs a reason`);
    } else if (found) {
      failures.push(
        `etc/undocumented-names.json: ${name} is listed, but a decision mentions it now (remove the entry)`,
      );
    }
  }
  for (const name of Object.keys(input.undocumented))
    if (!names.includes(name))
      failures.push(
        `etc/undocumented-names.json: ${name} is listed, but it is not a public function, method or error code (remove the entry)`,
      );
  return { failures, optionKeys: keys.length, names: names.length, mentioned };
}
