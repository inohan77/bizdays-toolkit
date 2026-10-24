# Holidays of other countries and regions

<p><b>English</b> | <a href="./providers.ja.md">日本語</a></p>

How to write a holiday provider for a country or region that is not bundled (Japan, the UK and Singapore are; see the [guide](./guide.md#bundled-holiday-providers)), and the calendar arithmetic that `bizdays-toolkit/provider` exposes for it.

## Writing a holiday provider

Implement `HolidayProvider` and pass it as `holidays`. Several providers give their union (if their time zones differ, `timeZone` is required).

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

Most holidays of other countries are an nth weekday of a month (the US federal holidays) or a fixed number of days from Easter Sunday (much of Europe). `bizdays-toolkit/provider` exposes the calendar arithmetic the bundled providers use for these, so a provider does not have to reimplement and verify it: `nthWeekdayOfMonth(year, month, weekday, n)` (`n` is 1–5 or -1 for the last), `easterSunday(year)` (Gregorian; verified against GOV.UK for the UK providers), `daysInMonth(year, month)` and `isLeapYear(year)`. Combine them with `addDays` and `weekdayOf` from the root. These functions are `@beta` (they may change in a minor version while their use settles).

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
createCalendar({ holidays: bavaria }).isHoliday("2026-06-04"); // true (Corpus Christi)
nthWeekdayOfMonth(2026, 11, 4, 4); // "2026-11-26" (the 4th Thursday of November: Thanksgiving Day)
nthWeekdayOfMonth(2026, 5, 1, -1); // "2026-05-25" (the last Monday of May: Memorial Day)
```

Holidays can carry names in other languages in `names`. The keys are canonical BCP 47 language tags (`"zh-Hant"`, `"ko"` and so on). The bundled Japanese holidays have no `names` (only the officially sourced Japanese and English names are bundled); among the UK providers, only Wales has Welsh names. If you need more, wrap the provider.

```ts
import { jp } from "bizdays-toolkit/jp";

const zhHant: Record<string, string> = { "2026-01-01": "元日" /* … your own translations */ };
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
