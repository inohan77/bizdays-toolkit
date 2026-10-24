# 他の国・地域の祝日

<p><a href="./providers.md">English</a> | <b>日本語</b></p>

同梱されていない国・地域（同梱は日本・英国・シンガポール。[ガイド](./guide.ja.md)の「同梱の祝日の提供元」）の祝日の提供元を書く方法と、そのために `bizdays-toolkit/provider` が公開する暦の計算です。

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

他の国・地域の祝日の多くは「月の第 n 何曜日」（米国の連邦祝日）か「復活祭からの日数」（ヨーロッパの多くの国）で決まります。`bizdays-toolkit/provider` は、同梱の提供元が使っているこの暦の計算をそのまま公開するもので、提供元を書く人が各自に実装して検証し直す必要がなくなります。`nthWeekdayOfMonth(year, month, weekday, n)`（`n` は 1〜5 と -1（最後））、`easterSunday(year)`（グレゴリオ暦。英国の提供元で GOV.UK のデータと照合済み）、`daysInMonth(year, month)`、`isLeapYear(year)` があり、ルートの `addDays`・`weekdayOf` と組み合わせます。これらの関数は `@beta` です（使われ方が固まるまで、マイナー版で変わることがあります）。

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
