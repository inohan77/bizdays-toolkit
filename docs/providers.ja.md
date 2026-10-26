# 他の国・地域の祝日

<p><a href="./providers.md">English</a> | <b>日本語</b></p>

同梱されていない国・地域（同梱は日本・英国・フランス・シンガポール。[ガイド](./guide.ja.md)の「同梱の祝日の提供元」）の祝日の提供元を書く方法と、そのために `bizdays-toolkit/provider` が公開する暦の計算です。

## 祝日の提供元を書く

`HolidayProvider` を実装して `holidays` に渡します。複数渡すと和集合になります（タイムゾーンが異なる場合は `timeZone` の指定が必要です）。

```ts
import { createCalendar, type HolidayProvider } from "bizdays-toolkit";

const myCountry: HolidayProvider = {
  id: "XX",
  timeZone: "Europe/Paris",
  supportedYears: { from: 2000, to: 2100 },
  dataVersion: "2026-10",
  holidaysInYear: (year) => [
    {
      date: `${year}-12-25`,
      name: "Noël",
      nameEn: "Christmas Day",
      kind: "public",
      confirmed: true,
    },
  ],
};
const calendar = createCalendar({ holidays: myCountry, closedWeekdays: [0, 6] });
```

他の国・地域の祝日の多くは「月の第 n 何曜日」（米国の連邦祝日）か「復活祭からの日数」（ヨーロッパの多くの国）で決まります。`bizdays-toolkit/provider` は、同梱の提供元が使っているこの暦の計算をそのまま公開するもので、提供元を書く人が各自に実装して検証し直す必要がなくなります。`nthWeekdayOfMonth(year, month, weekday, n)`（`n` は 1〜5 と -1（最後））、`easterSunday(year)`（グレゴリオ暦。同梱の提供元の公式データと照合済み）、`daysInMonth(year, month)`、`isLeapYear(year)`、`substituteDays`（下記）があり、ルートの `addDays`・`weekdayOf` と組み合わせます。

```ts
import { addDays, createCalendar, type HolidayProvider } from "bizdays-toolkit";
import { easterSunday, nthWeekdayOfMonth } from "bizdays-toolkit/provider";

const bavaria: HolidayProvider<"public"> = {
  id: "DE-BY",
  timeZone: "Europe/Berlin",
  supportedYears: { from: 2000, to: 2100 },
  dataVersion: "example",
  holidaysInYear: (year) => {
    const easter = easterSunday(year);
    const day = (date: string, name: string, nameEn: string) => ({
      date,
      name,
      nameEn,
      kind: "public" as const,
      confirmed: true,
    });
    return [
      day(addDays(easter, -2), "Karfreitag", "Good Friday"),
      day(addDays(easter, 1), "Ostermontag", "Easter Monday"),
      day(addDays(easter, 60), "Fronleichnam", "Corpus Christi"),
    ];
  },
};
createCalendar({ holidays: bavaria }).isHoliday("2026-06-04"); // true（Fronleichnam）
nthWeekdayOfMonth(2026, 11, 4, 4); // "2026-11-26"（11 月第 4 木曜: 米国の Thanksgiving Day）
nthWeekdayOfMonth(2026, 5, 1, -1); // "2026-05-25"（5 月最終月曜: 米国の Memorial Day）
```

週末に当たった祝日は別の日に振り替えられることが多くあります（日本の振替休日、英国の substitute day、シンガポールの翌日の休日、米国の連邦祝日の observed）。`substituteDays(holidays, options)` は、1 年分の祝日に振替日を足して返します。定義は同梱の提供元と同じで、`rules` に書いた曜日に当たる祝日ごとに、指定の向きで「入力の祝日でも、それまでに決めた振替日でも、`rules` に書いた曜日でもない最初の日」を振替日にします（Christmas Day と Boxing Day のように 1 つの週末に 2 つの祝日が重なれば、日付順に先へ送られます）。振替日は元の祝日の `key`・`names`・`confirmed` を引き継ぎ、`kind` は設定で与え、名称は `name` を省略すれば元の祝日のまま（GOV.UK・シンガポールの告示の流儀）です。`original: "drop"` にすると、GOV.UK の一覧と同じく週末の日そのものを結果から外します。この関数が同梱の日本（2007 年以降）・英国・シンガポールの提供元の振替日を再現することをテストで確かめています。日本の国民の休日（2 つの祝日に挟まれた日）のような国に固有の規則は含みません。

```ts
import { substituteDays } from "bizdays-toolkit/provider";

const federal = [
  {
    date: "2026-07-04",
    name: "Independence Day",
    nameEn: "Independence Day",
    kind: "federal",
    confirmed: true,
  },
];
// 米国の連邦祝日: 土曜日なら前の金曜日、日曜日なら次の月曜日に observed
substituteDays(federal, {
  rules: { 6: "previous", 0: "next" },
  kind: "observed",
  name: (h) => ({ name: `${h.name} (observed)`, nameEn: `${h.nameEn} (observed)` }),
}).map((h) => `${h.date} ${h.kind}`);
// ["2026-07-03 observed", "2026-07-04 federal"]

// 日本・シンガポール: 日曜日の祝日だけを、次の祝日でない日へ
substituteDays(federal, { rules: { 0: "next" }, kind: "substitute" }).length; // 1（2026 年 7 月 4 日は土曜日）
// 英国: 土曜日・日曜日とも振り替え、GOV.UK の一覧は振替日だけを載せる
substituteDays(federal, {
  rules: { 6: "next", 0: "next" },
  kind: "substitute",
  original: "drop",
}).map((h) => h.date);
// ["2026-07-06"]
```

提供元は、祝日ごとに安定した識別子を `key` で付けられます（小文字の英字・数字・ハイフン。`/^[a-z0-9][a-z0-9-]*$/`）。規則の `{ holiday: true, keys: [...] }` で祝日を個別に指すためのものです。同梱の提供元は、最初に付けるときに英語名から導き（小文字にし、空白をハイフンに、アポストロフィと冠詞を除き、末尾の "Day"・"bank holiday" を落とす: `coming-of-age`・`good-friday`・`hari-raya-puasa`）、以後は公式の名称や日付が変わっても変えません。振替日は元の祝日の `key` を持ち、一度きりの祝日と日本の国民の休日は持ちません。検証するのは形式だけで、同じ `key` が同じ年に複数回現れることがあります。同梱の `key` の一覧はガイドの[祝日の識別子](./guide.ja.md#祝日の識別子)にあります。

祝日には、ほかの言語の名称を `names` で付けられます。キーは BCP 47 の言語タグの正規の形（`"zh-Hant"`・`"ko"` など）です。同梱の日本の祝日は `names` を持ちません（公式の出典がある日本語・英語だけを同梱しています）。英国では Wales だけがウェールズ語の名称を持ちます。必要な場合は、提供元を包んで付けます。

```ts
import { jp } from "bizdays-toolkit/jp";

const zhHant: Record<string, string> = { "2026-01-01": "元日" /* … 利用者が用意した訳 */ };
const jpWithNames = {
  ...jp,
  holidaysInYear: (year: number) =>
    jp.holidaysInYear(year).map((h) => {
      const name = zhHant[h.date];
      return name === undefined ? h : { ...h, names: { "zh-Hant": name } };
    }),
};
createCalendar({ holidays: jpWithNames }).getHoliday("2026-01-01")?.names; // { "zh-Hant": "元日" }
```
