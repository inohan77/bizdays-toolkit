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

Most holidays of other countries are an nth weekday of a month (the US federal holidays) or a fixed number of days from Easter Sunday (much of Europe). `bizdays-toolkit/provider` exposes the calendar arithmetic the bundled providers use for these, so a provider does not have to reimplement and verify it: `nthWeekdayOfMonth(year, month, weekday, n)` (`n` is 1–5 or -1 for the last), `easterSunday(year)` (Gregorian; verified against GOV.UK for the UK providers), `daysInMonth(year, month)`, `isLeapYear(year)` and `substituteDays` (below). Combine them with `addDays` and `weekdayOf` from the root. These functions are `@beta` (they may change in a minor version while their use settles).

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

Holidays that fall on a weekend are often moved to another day (a substitute day in the UK, the day in lieu in Singapore, 振替休日 in Japan, the observed day of a US federal holiday). `substituteDays(holidays, options)` adds the substitute days to a year's holidays with the same definition the bundled providers use: for each holiday on a weekday listed in `rules`, the substitute is the first day in the given direction that is not one of the input holidays, not an already assigned substitute day and not itself a weekday listed in `rules` (so two holidays on one weekend are pushed forward in date order, as Christmas Day and Boxing Day are). A substitute day keeps the original's `key`, `names` and `confirmed`, takes `kind` from the options and, unless `name` is given, the original's names (as on GOV.UK and the Singapore gazette). `original: "drop"` leaves the weekend day itself out, as GOV.UK does. Tests check that this function reproduces the substitute days of the bundled Japanese (2007 onwards), UK and Singapore providers. Rules specific to one country, such as Japan's citizens' holiday between two holidays, are not included.

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
// US federal holidays: a Saturday is observed on the Friday before, a Sunday on the Monday after
substituteDays(federal, {
  rules: { 6: "previous", 0: "next" },
  kind: "observed",
  name: (h) => ({ name: `${h.name} (observed)`, nameEn: `${h.nameEn} (observed)` }),
}).map((h) => `${h.date} ${h.kind}`);
// ["2026-07-03 observed", "2026-07-04 federal"]

// Japan and Singapore: only a Sunday holiday moves, to the next day that is not a holiday
substituteDays(federal, { rules: { 0: "next" }, kind: "substitute" }).length; // 1 (July 4, 2026 is a Saturday)
// The UK: Saturday and Sunday both move, and GOV.UK lists only the substitute day
substituteDays(federal, {
  rules: { 6: "next", 0: "next" },
  kind: "substitute",
  original: "drop",
}).map((h) => h.date);
// ["2026-07-06"]
```

A provider may give each holiday a stable identifier in `key` (lowercase letters, digits and hyphens, matching `/^[a-z0-9][a-z0-9-]*$/`), so that rules can select individual holidays with `{ holiday: true, keys: [...] }`. The bundled providers derive it once from the English name (lowercase, hyphens, no apostrophes or articles, the trailing "Day" or "bank holiday" dropped: `coming-of-age`, `good-friday`, `hari-raya-puasa`) and never change it afterwards, even when the official name or date changes; a substitute day carries the original holiday's key, and one-off holidays and Japan's citizens' holidays have none. Only the format is checked; the same key may appear several times in a year. See [Holiday keys](./guide.md#holiday-keys) in the guide for the bundled keys.

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
