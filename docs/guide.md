# bizdays-toolkit guide

<p><b>English</b> | <a href="./guide.ja.md">日本語</a></p>

The full guide to bizdays-toolkit: the bundled holiday providers, business-day calendars, recurring rules, due dates, schedules, inputs, errors and option diagnostics. The [README](../README.md) is the short version; [providers.md](./providers.md) covers writing a holiday provider for another country or region. Every code example in this guide is run in CI and the results in the comments are checked.

- [Bundled holiday providers](#bundled-holiday-providers)
- [Business-day calendars](#business-day-calendars)
- [Recurring rules](#recurring-rules)
- [Combining calendars](#combining-calendars)
- [Common recipes](#common-recipes)
- [Month-based due dates and date adjustment](#month-based-due-dates-and-date-adjustment)
- [Day-by-day values (e.g. store hours)](#day-by-day-values-eg-store-hours)
- [A business-day calendar from a schedule](#a-business-day-calendar-from-a-schedule)
- [Date and date-time inputs](#date-and-date-time-inputs)
- [Outside the supported years](#outside-the-supported-years)
- [Unconfirmed holidays](#unconfirmed-holidays)
- [Errors](#errors)
- [Option diagnostics](#option-diagnostics)

## Bundled holiday providers

The four countries differ in how a holiday on a weekend is handled and in whether later years are predicted:

| Country   | A holiday on a weekend                                      | Substitute days                                                                                      | Predictions (`confirmed: false`)                   | `confirmedThrough`            |
| --------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------- |
| Japan     | Returned (Saturday and Sunday)                              | For a Sunday holiday, the next day (since 1973-04-12; from 2007, the next day that is not a holiday) | The equinox days after `confirmedThrough`          | Yes                           |
| UK        | **Not returned**: only the substitute day is (as on GOV.UK) | For a Saturday or Sunday holiday, the next weekday that is not a holiday                             | All bank holidays after `confirmedThrough`         | Yes                           |
| France    | Returned (Saturday and Sunday)                              | None                                                                                                 | None (the dates follow from the law)               | No                            |
| Singapore | Returned (Saturday and Sunday)                              | For a Sunday holiday only, the next day that is not a holiday                                        | None (later years are outside the supported years) | Yes (the last supported year) |

So a rule such as `{ holiday: true, weekdays: [6] }` (holidays on a Saturday) never matches with the UK providers, and the diagnostics report it as `never-matches`.

### Japan

```ts
import { holidayOn, holidaysInYear, isHoliday } from "bizdays-toolkit/jp";

isHoliday("2026-11-23"); // true
holidayOn("2026-09-22");
// { date: "2026-09-22", name: "国民の休日", nameEn: "Citizens' Holiday", kind: "citizens", confirmed: true }
holidaysInYear(2027);

// Instants (Date) are evaluated in Japan time
isHoliday(new Date("2026-11-22T15:30:00Z")); // true (Nov 23 in Japan time)
```

`kind` is one of `regular` (national holiday), `substitute` (substitute holiday), `citizens` (citizens' holiday, a day between two holidays) and `special` (holidays for imperial ceremonies and similar events).

`confirmed` tells whether the date is officially fixed. The vernal and autumnal equinox days are fixed in the Official Gazette in February of the previous year, so later years are predictions from an approximation formula (`confirmed: false`).

### UK bank holidays

```ts
import { createCalendar } from "bizdays-toolkit";
import { england, northernIreland, scotland, wales } from "bizdays-toolkit/uk";

const edinburgh = createCalendar({ holidayProvider: scotland, closedWeekdays: [0, 6] });
edinburgh.isBusinessDay("2026-01-02"); // false (2nd January)
edinburgh.addBusinessDays("2026-06-12", 1); // "2026-06-16" (June 15 is the World Cup bank holiday)

scotland.holidaysInYear(2026)[0];
// { date: "2026-01-01", name: "New Year’s Day", nameEn: "New Year’s Day", kind: "regular", confirmed: true, key: "new-year" }
wales.holidaysInYear(2026)[0]?.names; // { cy: "Dydd Calan" }

// Across several regions, use the union (a holiday in any of them is a holiday)
const ukWide = createCalendar({ holidayProvider: [england, scotland, northernIreland] });
```

| Provider          | ID       | GOV.UK division   | Notes                                            |
| ----------------- | -------- | ----------------- | ------------------------------------------------ |
| `england`         | `GB-ENG` | England and Wales |                                                  |
| `wales`           | `GB-WLS` | England and Wales | Welsh names (`names.cy`) included                |
| `scotland`        | `GB-SCT` | Scotland          | 2nd January, St Andrew’s Day and others          |
| `northernIreland` | `GB-NIR` | Northern Ireland  | St Patrick’s Day, Battle of the Boyne and others |

- `kind` is one of `regular` (an annual bank holiday, including years when a proclamation moved it), `substitute` (a substitute day for a bank holiday on a Saturday or Sunday) and `special` (a one-off bank holiday by proclamation, such as a jubilee or a state funeral). A substitute day has the name of the original holiday, as on GOV.UK
- England and Wales are one division on GOV.UK and currently have the same dates, but they are separate providers, so your code keeps working if they ever differ
- Supported years are 1974–2099. Years after the last year GOV.UK has published (`confirmedThrough`, currently 2028) are predictions from the rules (`confirmed: false`). One-off bank holidays are unknown until announced, so predicted years never contain them
- 2000–2011 predate GOV.UK's data. For those years the authority is the list the government published at the time (DTI and BERR, directgov, the Scottish Executive and Government, nidirect; as archived by the Wayback Machine), checked day by day against the Royal Proclamations and the Northern Ireland Orders in The Gazette (the sources are listed in [docs/sources/uk-bank-holidays-2000-2011.md](./sources/uk-bank-holidays-2000-2011.md)). Three days in Scotland (4 January 2010, 27 December 2010 and 4 January 2011) appear in every government list of the time but in no proclamation, so by the letter of the 1971 Act they were not bank holidays; the providers follow the government lists and return them as substitute days.
- 1974–1999 predate the web: no government list survives, so for those years the Royal Proclamations and Northern Ireland Orders in The Gazette are the authority (Hansard written answers are the second source where they exist, and never differ). Every holiday in those years is either a day fixed by Schedule 1 of the 1971 Act or a day appointed in a proclamation recorded in [docs/sources/uk-bank-holidays-1974-1999.md](./sources/uk-bank-holidays-1974-1999.md); the few days for which no proclamation could be found (the Northern Ireland Orders of 1986–1990, which are in issues of The Gazette that are not online; the 1987 annual proclamation, which was not found and was due when some issues of The London Gazette are not online; and the Northern Ireland Order of 1975, which was not found) are kept by rule and listed as `unverified` in the fixture. The lower bound is 1974 because New Year's Day has been proclaimed each year in England, Wales and Northern Ireland since 1974 (Early May since 1978, Scotland's spring bank holiday since 1978); the providers encode these starts, not changes to the Act. Names follow the lists of the time, which assign substitute days differently from today's GOV.UK in a few years (in 2004, 27 December is Boxing Day and 28 December Christmas Day; in 2000 and 2005 in Scotland, 3 January is 2nd January and 4 January New Year's Day)
- Local holidays set by Scottish councils are not included. Whether a bank holiday is a day off depends on the employment contract and similar arrangements
- One-off bank holidays may be announced only about ten days ahead. Differences from GOV.UK are watched daily and released as patch versions

### French public holidays

```ts
import { createCalendar } from "bizdays-toolkit";
import { alsaceMoselle, metropole } from "bizdays-toolkit/fr";

const paris = createCalendar({ holidayProvider: metropole, closedWeekdays: [0, 6] });
paris.isBusinessDay("2026-05-14"); // false (Ascension Day)
paris.addBusinessDays("2026-05-22", 1); // "2026-05-26" (May 25 is Whit Monday, Lundi de Pentecôte)
metropole.holidaysInYear(2026)[1];
// { date: "2026-04-06", name: "Lundi de Pâques", nameEn: "Easter Monday", kind: "regular", confirmed: true, key: "easter-monday" }
alsaceMoselle.holidaysInYear(2026).length; // 13 (the 11 national holidays plus Good Friday and December 26)

// A company that makes Whit Monday a working day (the "journée de solidarité"): the day stays a public holiday
const company = createCalendar({
  holidayProvider: metropole,
  closedWeekdays: [0, 6],
  openRecurringRules: [
    { holiday: true, keys: ["pentecost-monday"], name: "Journée de solidarité" },
  ],
});
company.isBusinessDay("2026-05-25"); // true
```

| Provider        | ID      | Zone on data.gouv.fr | Holidays                                                                              |
| --------------- | ------- | -------------------- | ------------------------------------------------------------------------------------- |
| `metropole`     | `FR`    | Métropole            | The 11 holidays of the Labour Code (article L3133-1)                                  |
| `alsaceMoselle` | `FR-AM` | Alsace-Moselle       | The 11 plus Good Friday (`good-friday`) and December 26 (`saint-stephens`, local law) |

- The 11 national holidays are 8 fixed dates (January 1, May 1, May 8, July 14, August 15, November 1, November 11, December 25) and 3 days counted from Easter Sunday (Easter Monday, Ascension Day at +39 days, Whit Monday at +50 days). There are no substitute days: a holiday on a weekend is simply a weekend. `kind` is always `regular`
- `name` is the French name as written on data.gouv.fr (`1er mai`, `Lundi de Pentecôte`), `nameEn` an English rendering, and `key` the stable identifier (`labour-day`, `pentecost-monday`, …; see [Holiday keys](#holiday-keys))
- When two holidays fall on the same day (Ascension Day on May 1 in 2008, on May 8 in 2059), the provider returns one holiday for that day with the name and key of the Easter-based holiday, as the data.gouv.fr JSON does, so `keys: ["labour-day"]` does not match May 1, 2008
- Whit Monday is a working day in many companies (the _journée de solidarité_), but it remains a public holiday by law, so the provider returns it as a holiday; write the exception as a holiday rule with `keys: ["pentecost-monday"]`, as above. Whether a holiday is a day off is the user's decision, as everywhere in this library
- Supported years are 2000–2099. The dates follow from the law, not from a yearly publication, so every year is `confirmed: true` and the providers have no `confirmedThrough`; a change to the Labour Code would be shipped as a patch version. The dates are verified against the "Jours fériés en France" dataset on data.gouv.fr (DINUM; JSON exports for the two zones, 20 years back and 5 years ahead, currently 2006–2031). Differences are watched daily
- `FR-AM` is this library's identifier for Alsace-Moselle (the departments of Bas-Rhin, Haut-Rhin and Moselle), which has no single ISO 3166-2 code. The overseas departments and territories, whose holidays and time zones differ, are not bundled

### Singapore public holidays

```ts
import { createCalendar } from "bizdays-toolkit";
import { sg } from "bizdays-toolkit/sg";

const singapore = createCalendar({ holidayProvider: sg, closedWeekdays: [0, 6] });
singapore.isBusinessDay("2026-08-10"); // false (National Day falls on a Sunday; Monday is the holiday in lieu)
singapore.addBusinessDays("2026-02-16", 1); // "2026-02-19" (Chinese New Year on February 17 and 18)
sg.holidaysInYear(2026).find((h) => h.kind === "substitute");
// { date: "2026-06-01", name: "Vesak Day", nameEn: "Vesak Day", kind: "substitute", confirmed: true, key: "vesak" }
```

- `sg` (ID `SG`, time zone `Asia/Singapore`) is one provider; Singapore has no regional holidays. `kind` is `regular` (an annual public holiday), `substitute` (the day after a public holiday that falls on a Sunday, which the Holidays Act makes a public holiday; it has the name of the original holiday) or `special` (a one-off holiday declared by the Government, such as Polling Day). A public holiday on a Saturday has no substitute day
- Chinese New Year, Hari Raya Puasa, Hari Raya Haji, Vesak Day and Deepavali follow the lunar, Islamic and Hindu calendars, so they cannot be computed from rules. The dates are the ones gazetted by the Ministry of Manpower (MOM), year by year, and the substitute days follow the rule of the Holidays Act. Supported years are the years MOM has gazetted (currently 2020–2027; `confirmedThrough` is the same as the last supported year). Later years are not predicted and are outside the supported years (`out-of-range`), so `sg` never returns `confirmed: false`
- The dates are verified against the "Singapore Public Holidays" collection on data.gov.sg (MOM). Where that data differs from the gazetted dates (2022: the revised Hari Raya dates and two missing substitute days), the gazetted dates are used. Differences from data.gov.sg are watched daily and released as patch versions

### Holiday keys

Each bundled holiday that recurs every year has a stable identifier in `key`, so that a rule can select individual holidays with `{ holiday: true, keys: [...] }`, or the days after or before them with `{ dayAfterHoliday: true, keys: [...] }` and `{ dayBeforeHoliday: true, keys: [...] }` (see [Recurring rules](#recurring-rules)) without depending on the official name, which follows the source data and may change in a patch version. A key never changes, even when the holiday's date or official name does (the Emperor's Birthday is `emperors-birthday` on April 29, December 23 and February 23 alike; Health and Sports Day and Sports Day are both `sports`). A substitute day carries the key of the original holiday, so `keys: ["coming-of-age"]` selects Coming of Age Day and its substitute; add `kinds: ["regular"]` for the day itself only. One-off holidays (imperial ceremonies, proclaimed UK bank holidays, Singapore's Polling Day) and Japan's citizens' holidays have no key; select them with `kinds` or `dates`.

```ts
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

// A florist: closed on holidays, except the two equinox days (the middle of the higan weeks)
const florist = createCalendar({
  holidayProvider: jp,
  openRecurringRules: [
    { holiday: true, keys: ["vernal-equinox", "autumnal-equinox"], name: "彼岸は営業" },
  ],
});
florist.isBusinessDay("2026-03-20"); // true (Vernal Equinox Day)
florist.isBusinessDay("2026-05-04"); // false (Greenery Day)
jp.holidaysInYear(2020).find((h) => h.date === "2020-02-24")?.key; // "emperors-birthday" (a substitute holiday)
```

| Provider               | Keys                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jp`                   | `new-year`, `coming-of-age`, `national-foundation`, `emperors-birthday`, `vernal-equinox`, `showa`, `constitution-memorial`, `greenery`, `childrens`, `marine`, `mountain`, `respect-for-the-aged`, `autumnal-equinox`, `sports`, `culture`, `labor-thanksgiving` |
| `england` … (UK)       | `new-year`, `2nd-january`, `st-patricks`, `good-friday`, `easter-monday`, `early-may`, `spring`, `battle-of-the-boyne`, `summer`, `st-andrews`, `christmas`, `boxing-day`                                                                                         |
| `metropole` … (France) | `new-year`, `easter-monday`, `labour-day`, `victory-in-europe`, `ascension`, `pentecost-monday`, `bastille`, `assumption`, `all-saints`, `armistice`, `christmas`; Alsace-Moselle adds `good-friday`, `saint-stephens`                                            |
| `sg`                   | `new-year`, `chinese-new-year`, `good-friday`, `labour-day`, `hari-raya-puasa`, `vesak`, `hari-raya-haji`, `national-day`, `deepavali`, `christmas`                                                                                                               |

The types `KnownJpHolidayKey`, `KnownUkHolidayKey`, `KnownSgHolidayKey` and `KnownFrHolidayKey` list them for editor completion. Keys are derived once from the English name, spelled as the provider spells it (`labor-thanksgiving` in Japan, `labour-day` in Singapore), and never change afterwards. A provider you write can give its holidays keys too; the rule the bundled providers follow is in [Writing a holiday provider](./providers.md#writing-a-holiday-provider).

## Business-day calendars

```ts
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const shipping = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0], // Sunday (0 = Sunday … 6 = Saturday)
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "New Year closure" }],
  closedDates: [{ from: "2027-08-12", to: "2027-08-16", name: "Summer closure" }],
  openDates: ["2026-12-27"], // a specific open day
  holidayPolicy: "closed", // closed on holidays ("open": open / "ignore": not used)
});

shipping.isBusinessDay("2026-11-23"); // false (Labor Thanksgiving Day)
shipping.addBusinessDays("2026-12-30", 1); // "2027-01-04"
shipping.diffBusinessDays("2026-09-01", "2026-10-01"); // business days from (inclusive) to (exclusive)

// Orders before 14:00 ship today, later orders on the next business day
shipping.businessDayOnOrAfter(new Date(), { cutoff: "14:00" }); // the input must carry a time of day

shipping.dayInfoOn("2027-01-01");
// { date: "2027-01-01", weekday: 5, open: false, reason: "closed-annual", name: "New Year closure", holiday: {…}, optionPath: "closedAnnualDates[0]" }
shipping.daysBetween("2026-12-30", "2027-01-04").map((d) => d.open); // [true, false, false, false, false, true]
```

`daysBetween(from, to)` returns `dayInfoOn` for every day in the period (both ends included). `businessDatesBetween` and `holidaysBetween` include both ends too; only `diffBusinessDays(from, to)` counts from `from` (inclusive) to `to` (exclusive), so that `diffBusinessDays(a, b) + diffBusinessDays(b, c)` equals `diffBusinessDays(a, c)` and, when `a` is a business day, `diffBusinessDays(a, addBusinessDays(a, n))` is `n` (the inverse of `addBusinessDays`). From a closed day, `addBusinessDays` counts the next business day as 1 (so `+0` and `+1` give the same day, as `n = 0` is `businessDayOnOrAfter`), while `diffBusinessDays` does not count the closed start, so the two differ by one there.

`createCalendar` and `createSchedule` validate the options when they are created, so the usual pattern is to create them once and reuse them. Creating is also cheap (well under a millisecond for a calendar or a schedule with Japanese holidays), so creating one per request is not a problem in practice.

Each day is decided in this order of priority (top first).

1. `openDates` (specific open days)
2. `closedDates` (specific closed days)
3. `closedAnnualDates` (annual closures)
4. `openRecurringRules` and `closedRecurringRules` rules with `holidayOverlapPolicy: "over-holiday"` (applied even on holidays), and holiday rules (`{ holiday: true }`)
5. Holidays (according to `holidayPolicy`; `"open"` makes them business days even on closed weekdays)
6. `openRecurringRules` and `closedRecurringRules` (the default `"under-holiday"`, and the days moved to by `"after-holiday"`)
7. `closedWeekdays` (closed weekdays)
8. Otherwise a business day

This order is fixed. Only the relation between a recurring rule and holidays can be chosen per rule with `holidayOverlapPolicy` (next section).

## Recurring rules

Recurring closed and open days such as "closed on the 3rd Wednesday", "closed on the 2nd and 4th Saturdays", "closed every other Wednesday", "stocktaking on the last day of the month", "closed on Mondays (on the next non-holiday if Monday is a holiday)", "open on substitute holidays", "closed on the day after a holiday" or "late opening on the day before a holiday" go in `closedRecurringRules` and `openRecurringRules`.

```ts
const museum = createCalendar({
  holidayProvider: jp,
  holidayPolicy: "open", // open on holidays
  closedRecurringRules: [
    { weekday: 1, name: "Closed on Mondays", holidayOverlapPolicy: "after-holiday" }, // on a holiday, closed on the next non-holiday instead
    {
      weekday: 3,
      nth: 3,
      months: [2, 8],
      name: "Closed on the 3rd Wednesday in February and August",
    },
    { dayOfMonth: -1, name: "Stocktaking", holidayOverlapPolicy: "over-holiday" }, // closed even on holidays
    { dayAfterHoliday: true, name: "Closed on the day after a holiday" },
  ],
});

museum.isBusinessDay("2026-10-12"); // true (open on Monday, Sports Day)
museum.dayInfoOn("2026-10-13");
// { date: "2026-10-13", weekday: 2, open: false, reason: "closed-recurring",
//   name: "Closed on Mondays", shiftedFrom: "2026-10-12", optionPath: "closedRecurringRules[0]" }
museum.dayInfoOn("2026-02-12").name; // "Closed on the day after a holiday" (National Foundation Day is February 11)
museum.isBusinessDay("2026-05-07"); // false (the day after the May 3–6 run of holidays)
```

| Pattern                                                       | Meaning                                                                                                                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ weekday: 1 }`                                              | Every Monday                                                                                                                                                                             |
| `{ weekday: 3, nth: 3 }`                                      | The 3rd Wednesday. `nth` is 1–5 or -1 (last); an array such as `[2, 4]` gives several                                                                                                    |
| `{ weekday: 3, interval: 2, anchor: "2026-01-07" }`           | Every other Wednesday: the Wednesdays an even number of weeks from `anchor` (2 or more weeks; see below)                                                                                 |
| `{ dayOfMonth: 20 }`                                          | The 20th of every month. `dayOfMonth` is 1–31 or -1 (last day); an array gives several                                                                                                   |
| `{ businessDayOfMonth: -1 }`                                  | The nth business day of the month (1–31, -1 the last, -2 the one before, …; an array gives several), counted without recurring rules (see below)                                         |
| `{ businessDayOfWeek: -1, weekStart: 1 }`                     | The nth business day of the week starting on `weekStart` (1–7, -1 the last, …; an array gives several), counted like `businessDayOfMonth` (see below)                                    |
| `{ holiday: true, kinds: ["substitute"] }`                    | Holidays, optionally narrowed to the given kinds (`Holiday.kind`) or keys (`keys`, `Holiday.key`); judged before `holidayPolicy` (see below)                                             |
| `{ dayAfterHoliday: true }`                                   | The day after a holiday: the first non-holiday after a holiday or a run of holidays (holidays of the provider only); `kinds`, `keys` and `skipWeekdays` narrow and extend it (see below) |
| `{ dayBeforeHoliday: true }`                                  | The day before a holiday: the non-holiday just before a holiday or a run of holidays (holidays of the provider only); `kinds`, `keys` and `skipWeekdays` as for the day after            |
| `{ cycle: 6, anchor: "2026-01-05", positions: [5, 6] }`       | A cycle of days: days 5 and 6 of every 6 days, counting `anchor` as day 1 (shift work such as four days on, two days off; see below)                                                     |
| `months: [8, 12]`                                             | Narrows any pattern to these months                                                                                                                                                      |
| `effectiveFrom: "2027-04-01"`, `effectiveTo: "…"`             | The period the rule is in effect (both ends included). Outside it, the rule is as if it were not written (see below)                                                                     |
| `holidayOverlapPolicy: "after-holiday", skipWeekdays: [0, 6]` | Moves the rule past the given weekdays as well as holidays: "June 15, or the next weekday when it falls on a weekend or holiday" (see below)                                             |

- **The nth weekday** is the nth occurrence of that weekday in the month (days 1–7 hold the 1st). It is not the weekday in the nth row of a printed calendar
- **Days that do not exist in a month** (`nth: 5` or `dayOfMonth: 31` in a month without one) do not match. Use `dayOfMonth: -1` for the last day
- **Every other week** (`interval: 2`) is not the same as the 1st and 3rd weekdays (`nth: [1, 3]`): a month with five Wednesdays shifts the latter by a week. `interval` is the number of weeks (an integer of 2 or more) and `anchor` is a date on the same weekday that the cycle passes through; the rule matches that date and every `interval` weeks before and after it. Stores announce "every other Wednesday from January 7", so copy that date. To start at the anchor rather than also matching earlier dates, add `effectiveFrom`. `interval` cannot be combined with `nth`
- **Holiday rules** (`{ holiday: true }`) write exceptions to the default holiday handling: "open on holidays from April 2027" is `openRecurringRules: [{ holiday: true, effectiveFrom: "2027-04-01" }]` with `holidayPolicy: "closed"` kept for the past, "open on substitute holidays and citizens' holidays" is `openRecurringRules: [{ holiday: true, kinds: ["substitute", "citizens"] }]`, and "special hours on the May holidays" in a schedule is `recurringRules: [{ holiday: true, months: [5], value: … }]`. `kinds` narrows to those `Holiday.kind` values (see the provider's list; with `holidayProvider: jp` the editor completes them), `keys` to individual holidays by their `Holiday.key` ("open on the equinox days" is `{ holiday: true, keys: ["vernal-equinox", "autumnal-equinox"] }`; see [Holiday keys](#holiday-keys)), `weekdays` to those weekdays ("morning hours on a Saturday holiday" is `{ holiday: true, weekdays: [6], value: … }`), `months` to those months; omit them for all holidays. The rule is judged at the "over the holiday" step, before `holidayPolicy`, and also with `holidayPolicy: "ignore"`. Its days are holidays, so `holidayOverlapPolicy` cannot be set on it (`invalid-option`); `holiday` still shows the holiday
- **The day after a holiday** is never itself a holiday, so `holidayOverlapPolicy` cannot be set on such a rule (it is an `invalid-option`). "Holidays" are those of the holiday provider, not annual closures. A rule of this kind matches no day without a holiday provider. `weekdays` narrows it to those weekdays: a museum "closed on the day after a holiday, except when that day is a Saturday or Sunday" is `{ dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] }` (opening the weekend with `openRecurringRules` instead would override every other weekend closure)
- **The nth business day of the month** (`{ businessDayOfMonth: n }`) writes "closed for stocktaking on the last business day of the month", "no appointments on the 1st and 5th business days of a quarter" or, in a schedule, "shorter hours on the last business day" as a rule, where `{ dayOfMonth: -1 }` (the calendar's last day) or `{ weekday: 5, nth: -1 }` (the last Friday) would be days off by several days. Business days are counted on the calendar's options **without its recurring rules**: specific dates, annual closures, holidays (as `holidayPolicy` treats them) and `closedWeekdays`, so a year-end closure such as `closedAnnualDates: [{ from: "12-31", to: "01-03" }]` makes December 30 the last business day of December 2026, and a Saturday 31st makes October 30. Recurring rules are left out of the count because the rule itself is one of them (counting them would make the definition circular), so a closed weekday written as `{ weekday: 0 }` in `closedRecurringRules` is still counted; write regular closed weekdays as `closedWeekdays`, and the diagnostics report such a setup as `counting-basis`. The methods `nthBusinessDayOfMonth` and `lastBusinessDayOfMonth` return the actual business days after all rules, so with `{ businessDayOfMonth: -1 }` closed, `lastBusinessDayOfMonth` is the day before. The rule matches no day in a month with fewer business days than `n` (`never-matches` for an `n` no month reaches). `holidayOverlapPolicy` is `"under-holiday"` by default or `"over-holiday"`; `"after-holiday"` is an `invalid-option`. With `holidayPolicy: "open"`, holidays are counted and an nth business day can be a holiday: by default the holiday step decides that day first (as for a weekday rule), so "closed on the first business day even when it is a holiday" is written with `holidayOverlapPolicy: "over-holiday"`, which does nothing (and is reported as `redundant`) when holidays are closed. In a schedule there is no notion of a business day, so the rule names the calendar to count on: `{ businessDayOfMonth: -1, calendar: branch, value: … }` (required, same time zone as the schedule, counted on that calendar's actual business days; in a calendar, `calendar` is an `invalid-option`)
- **The nth business day of the week** (`{ businessDayOfWeek: n, weekStart }`) is the same rule for a week: "shipping stops for the weekly stocktaking on the last business day of the week" moves to Thursday when Friday is a holiday and to Monday when the year-end closure starts on Tuesday, which neither `{ weekday: 5 }` nor the rules around holidays can write. The week is the 7 days from `weekStart` (0 = Sunday … 6 = Saturday); it is required because the first day of the week differs between regions and trades. `n` is 1–7 or -1 to -7, and counting, `calendar` and `holidayOverlapPolicy` work exactly as for `businessDayOfMonth`; `months` narrows by the month of the matching day, so a week across two months is counted as one week

```ts
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const warehouse = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-29", to: "01-03", name: "Year-end closure" }],
  closedRecurringRules: [{ businessDayOfWeek: -1, weekStart: 1, name: "Weekly stocktaking" }],
});
warehouse.isBusinessDay("2026-10-30"); // false (Friday, the last business day of the week)
warehouse.isBusinessDay("2026-03-19"); // false (March 20, Friday, is the Vernal Equinox Day)
warehouse.isBusinessDay("2026-12-28"); // false (the year-end closure starts on the 29th)
```

- **Which settings a pattern accepts is checked by TypeScript** as well as at run time: the rules on holidays and around them take no `holidayOverlapPolicy`, a cycle and the nth business day of the month or week take `"under-holiday"` or `"over-holiday"` only, `skipWeekdays` is written only with `holidayOverlapPolicy: "after-holiday"` on a weekday or day-of-month rule, and the nth business day rules take `calendar` only in a schedule, where it is required
- **Skipping weekdays when moving a rule** (`skipWeekdays` with `holidayOverlapPolicy: "after-holiday"` on a weekday or day-of-month rule; on the day after or before a holiday it has its own meaning, below) adds weekdays to the days the rule moves past. Without it, a Monday rule can land on a Saturday after a run of holidays (and a Friday rule does so whenever Friday is a holiday), so "the next weekday" in the strict sense is `skipWeekdays: [6]` (`[0, 6]` to avoid Sundays too); and "the company anniversary on June 15, or the next business day when it falls on a weekend or holiday" cannot be written at all (a Saturday June 15 is already closed, and the rule does not move). With `skipWeekdays: [0, 6]`, a rule whose day is a holiday or one of those weekdays moves to the first later day that is neither; `shiftedFrom` is the original day, and the effective period is judged on the original day. The rule's own weekday cannot be in `skipWeekdays`
- **The day before a holiday** (`{ dayBeforeHoliday: true }`) is the mirror image: the day whose next day is a holiday and which is not a holiday itself, so before a run of holidays it is only the day before the run (in May 2026 it is Saturday May 2; May 4 and 5 are holidays themselves). The same rules apply (`weekdays`, `months`, effective periods, no `holidayOverlapPolicy`, no match without a provider). It writes "eve-of-holiday rates" in a schedule, "open until 2 a.m. on the day before a holiday" (`weekdays: [1, 2, 3, 4, 5]` keeps weekends as usual), or an earlier shipping cutoff on the day before a holiday (put the cutoff time in a schedule and pass `cutoffs.valueOn(date)` as `cutoff`)
- **Narrowing the day after or before a holiday** (`kinds`, `keys`): `{ dayBeforeHoliday: true, keys: ["chinese-new-year"] }` is the eve of Chinese New Year in Singapore, a date that moves every year. The filters are applied to the holiday next to the day (for the day before a holiday, the first holiday of the run), so before Golden Week `keys: ["childrens"]` does not match May 2 (the next day is Constitution Memorial Day). `{ dayAfterHoliday: true, kinds: ["substitute"] }` is the day after a substitute holiday
- **The last weekday before a holiday** (`skipWeekdays` on the day after or before a holiday): without it, the day before a Monday holiday is a Sunday, which is useless for most UK bank holidays and Japan's Monday holidays. With `skipWeekdays: [0, 6]`, the rule matches the day before (or after) a block of holidays and those weekdays that contains at least one holiday: the Friday before a Monday holiday, or the Tuesday after Good Friday to Easter Monday. An ordinary weekend without a holiday is not a block. `kinds` and `keys` then look at the holiday in the block closest to the day. Only the given weekdays are skipped, not the calendar's own closed days; every weekday cannot be skipped
- **A cycle of days** (`{ cycle, anchor, positions }`) writes rules that do not follow the week or the month: shift work such as four days on and two days off, or an inspection every 10 days. `cycle` is the length in days (2 or more), `anchor` is day 1, and `positions` lists the days of the cycle the rule matches (1 to `cycle`, not all of them). Like `interval`, the rule also matches days before `anchor`; add `effectiveFrom` to start there. `holidayOverlapPolicy` is `"under-holiday"` by default or `"over-holiday"`; `"after-holiday"` is an `invalid-option`. Shift work usually runs regardless of holidays, so set `holidayPolicy: "ignore"` and `closedWeekdays: []`
- Among recurring rules, the one written first in the array wins, and `openRecurringRules` wins over `closedRecurringRules`. The day after Labor Thanksgiving Day on a Monday (2026-11-23) is both the day the Monday rule moves to and the day after a holiday; the rule written first decides, and `dayInfoOn` shows which

```ts
// A bank branch: no appointments on the last business day of the month; a company anniversary moved past weekends
const branch = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-31", to: "01-03" }],
  closedRecurringRules: [
    { businessDayOfMonth: -1, name: "No appointments on the last business day" },
    {
      dayOfMonth: 15,
      months: [6],
      name: "Company anniversary",
      holidayOverlapPolicy: "after-holiday",
      skipWeekdays: [0, 6],
    },
  ],
});
branch.isBusinessDay("2026-10-30"); // false (October 31 is a Saturday, so the 30th is the last business day)
branch.isBusinessDay("2026-12-30"); // false (closed from December 31, so the 30th is the last business day)
branch.lastBusinessDayOfMonth("2026-10"); // "2026-10-29" (the actual last business day, after the rule)
branch.dayInfoOn("2030-06-17").shiftedFrom; // "2030-06-15" (June 15, 2030 is a Saturday)

// A schedule counts on a calendar you name
const hours = createSchedule({
  holidayProvider: jp,
  weekdayValues: [null, "9-17", "9-17", "9-17", "9-17", "9-17", null],
  recurringRules: [
    { businessDayOfMonth: -1, calendar: branch, value: "9-15", name: "Closing work" },
  ],
});
hours.valueOn("2026-10-29"); // "9-15" (the branch's last business day of October)
```

```ts
// A production line on four days on, two days off
const lineA = createCalendar({
  holidayProvider: jp,
  holidayPolicy: "ignore", // the shifts run regardless of holidays
  closedWeekdays: [],
  closedRecurringRules: [{ cycle: 6, anchor: "2026-01-05", positions: [5, 6], name: "Team A off" }],
});
lineA.isBusinessDay("2026-01-09"); // false (day 5 of the cycle)
lineA.addBusinessDays("2026-01-08", 1); // "2026-01-11"

// An earlier cutoff on the last weekday before a bank holiday
const cutoffs = createSchedule({
  holidayProvider: england,
  weekdayValues: [null, "16:00", "16:00", "16:00", "16:00", "16:00", null],
  recurringRules: [{ dayBeforeHoliday: true, skipWeekdays: [0, 6], value: "12:00" }],
});
cutoffs.valueOn("2026-05-22"); // "12:00" (the Friday before the Spring bank holiday on May 25)
cutoffs.valueOn("2026-05-15"); // "16:00"
```

**Effective periods** (`effectiveFrom`, `effectiveTo`) let one calendar represent a change of rules and still reproduce past dates. They go on recurring rules and on annual closures (`closedAnnualDates` in object form).

```ts
const shop = createCalendar({
  holidayProvider: jp,
  closedRecurringRules: [
    { weekday: 1, name: "Closed on Mondays", effectiveTo: "2027-03-31" },
    { weekday: 2, name: "Closed on Tuesdays", effectiveFrom: "2027-04-01" },
    { weekday: 3, interval: 2, anchor: "2026-01-07", name: "Closed every other Wednesday" },
  ],
  closedAnnualDates: [
    { from: "08-13", to: "08-16", name: "Summer closure", effectiveTo: "2026-12-31" },
  ],
});

shop.isBusinessDay("2027-03-29"); // false (Monday, before the change)
shop.isBusinessDay("2027-04-06"); // false (Tuesday, after the change)
shop.addBusinessDays("2027-03-30", 3); // "2027-04-03" (counts across the change; March 31 is an every-other-week Wednesday)
shop.isBusinessDay("2027-08-13"); // true (the summer closure ended in 2026)
```

- Outside its period a rule is simply not applied; the order of priority does not change. A rule with only `effectiveFrom` or only `effectiveTo` is open-ended on the other side
- An `"after-holiday"` rule is judged by the date it would originally apply to: if that date is within the period, the rule is moved to the next non-holiday even when that day is outside the period
- Changing the closed weekday is written as two weekly rules with periods, as above, rather than with `closedWeekdays` (which has no period)

**What happens on a holiday** (`holidayOverlapPolicy`) is chosen per rule.

| Value                       | Meaning                                                                   | How a store would announce it                           |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| `"under-holiday"` (default) | Under the holiday: follows the holiday handling (`holidayPolicy`)         | "Closed on the 3rd Wednesday (open if it is a holiday)" |
| `"over-holiday"`            | Over the holiday: applies even on holidays                                | "Closed on the 3rd Wednesday (holidays included)"       |
| `"after-holiday"`           | After the holiday: not applied on holidays, moved to the next non-holiday | "Closed on Mondays (the next non-holiday if a holiday)" |

- With `holidayPolicy: "ignore"` (holidays not used), `"under-holiday"` rules also apply on holidays
- The day an `"after-holiday"` rule moves to is the first non-holiday on or after that day, a Saturday included (add `skipWeekdays` to move past weekends too). After a run of holidays (such as Golden Week) it is the day after the run. Specific open or closed days and annual closures on that day take priority. `dayInfoOn()` for a moved day includes the original date as `shiftedFrom`
- The "holidays" used for moving are only those of the holiday provider (such as `jp`), not annual closures
- `dayInfoOn()` for a day decided by `openDates`, `closedDates`, `closedAnnualDates`, `openRecurringRules` or `closedRecurringRules` (including the day a rule moved to) includes `optionPath`, the position of that rule in the options in the same form as the diagnostics' `path` (such as `"closedRecurringRules[0]"`), so rules with the same `name` can be told apart. Days decided by holidays or `closedWeekdays` have no `optionPath`

In a schedule, the same patterns with a `value` go in `recurringRules`.

```ts
const hours = createSchedule<Hours>({
  holidayProvider: jp,
  weekdayValues: [sunday, weekday, weekday, weekday, weekday, weekday, weekday],
  recurringRules: [
    { weekday: 1, value: null, name: "Closed on Mondays", holidayOverlapPolicy: "after-holiday" },
    { dayOfMonth: -1, value: { open: "10:00", close: "17:00" }, name: "Short hours at month end" },
    {
      dayBeforeHoliday: true,
      value: { open: "10:00", close: "23:00" },
      name: "Late on the eve of a holiday",
    },
  ],
});
hours.valueOn("2026-05-02"); // { open: "10:00", close: "23:00" } (the day before the May 3–6 holidays)
hours.dayInfoOn("2026-05-04").reason; // "weekday" (a holiday in the run is not the day before a holiday)
```

## Combining calendars

`combineCalendars` makes one calendar out of several: the days on which **all** of them are open (`open: "all"`), or on which **any** of them is open (`"any"`). The result is an ordinary calendar, so business-day arithmetic, `adjust`, `dueDate` and the rest work on the combination.

```ts
import { combineCalendars, createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const company = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-29", to: "01-03", name: "New Year closure" }],
});
const bank = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "Bank holiday period" }],
});

// A remittance is processed only on days when both the company and the bank are open
const remittance = combineCalendars([company, bank], { open: "all" });
remittance.addBusinessDays("2026-12-28", 2); // "2027-01-05"
remittance.dayInfoOn("2026-12-29");
// { date: "2026-12-29", weekday: 2, open: false, reason: "closed-annual", name: "New Year closure", optionPath: "closedAnnualDates[0]", decidedBy: 0, decidedByPath: [0] }

// Any of several stores is open
const anyStore = combineCalendars([company, bank], { open: "any" });
anyStore.isBusinessDay("2026-12-29"); // true
```

- `dayInfoOn` reports `reason`, `name`, `shiftedFrom` and `optionPath` from the first calendar whose result equals the combined result, and the index of that calendar in `decidedBy` (`optionPath` is a position in that calendar's options). With `"all"`, a closed day is explained by the first calendar that is closed, and an open day by calendar 0 (all are open). With `"any"` it is the other way round
- `decidedByPath` is the list of indexes down to the calendar that decided, outermost first, so that `optionPath` can be traced from the result alone when combined calendars are combined again: `[0]` for a plain combination (the same as `decidedBy`), `[0, 1]` for calendar 1 inside calendar 0. `decidedBy` stays the outer index
- `holiday`, `isHoliday`, `holidaysInYear` and so on use the union of the calendars' holiday providers: the same provider object counts once, a wrapped provider (such as `jp` with some kinds filtered out) counts as a different one, and when two providers have a holiday on the same date, the provider of the earlier calendar decides the holiday shown. Combining a calendar with a wrapped `jp` and one with `jp` itself therefore keeps the business-day results but still shows the filtered-out holidays in `holiday`. `outOfRangePolicy` is `"throw"` if any calendar throws outside its supported years
- All calendars must share a time zone (`time-zone-conflict` otherwise). Passing fewer than two calendars, or the same calendar twice, is an `invalid-argument`. `searchDayLimit` (default 3660) can be given in the options
- A combined calendar can be combined again. Option diagnostics work on options, not on calendars, so diagnose each calendar's options separately

Combining options instead would not work: a specific open day (`openDates`) in one set of options would override closures in the other, and wrapping one calendar as a holiday provider of the other would turn its closures into "holidays" (`isHoliday` would be true, and `holidayPolicy: "open"` would open on them).

## Common recipes

**Treat citizens' holidays (days between two holidays) as business days**: wrap the holiday provider and filter by kind.

```ts
import { jp } from "bizdays-toolkit/jp";

const jpWithoutCitizensHoliday = {
  ...jp,
  holidaysInYear: (year: number) => jp.holidaysInYear(year).filter((h) => h.kind !== "citizens"),
};
const calendar = createCalendar({
  holidayProvider: jpWithoutCitizensHoliday,
  closedWeekdays: [0, 6],
});
```

**Split special days kept in one list**: dates (`"YYYY-MM-DD"`) go in `dates` and annual dates (`"MM-DD"`) in `annualDates`.

```ts
type Hours = { open: string; close: string } | null;
const regular: Hours = { open: "10:00", close: "19:00" };
const specialDays: { date: string; value: Hours }[] = [
  { date: "2026-12-31", value: { open: "10:00", close: "17:00" } },
  { date: "01-01", value: null },
];
const special = createSchedule<Hours>({
  weekdayValues: [regular, regular, regular, regular, regular, regular, regular],
  dates: specialDays.filter((d) => d.date.length === 10),
  annualDates: specialDays.filter((d) => d.date.length === 5),
});
special.valueOn("2027-01-01"); // null
```

**Which business day of the month a date is**: count the business days from the first of the month up to (and excluding) the date, then add one. `diffBusinessDays` excludes `to`, so the date itself is the `+ 1`. This is the inverse of `nthBusinessDayOfMonth`.

```ts
import { monthOf } from "bizdays-toolkit";

const calendar = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
const businessDayIndex = (date: string): number =>
  calendar.isBusinessDay(date) ? calendar.diffBusinessDays(`${monthOf(date)}-01`, date) + 1 : 0;
businessDayIndex("2026-10-07"); // 5 (the 5th business day of October)
businessDayIndex("2026-10-03"); // 0 (Saturday: not a business day)
calendar.nthBusinessDayOfMonth("2026-10", 5); // "2026-10-07"
```

**The next closed day and why**: there is no `nextClosedDay`, but `daysBetween` returns `dayInfoOn` for every day, so take the first one that is not a business day.

```ts
import { addDays } from "bizdays-toolkit";

const calendar = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
const nextClosedDay = (date: string) =>
  calendar.daysBetween(addDays(date, 1), addDays(date, 60)).find((d) => !d.open);
nextClosedDay("2026-10-05")?.date; // "2026-10-10"
nextClosedDay("2026-10-05")?.reason; // "closed-weekday"
nextClosedDay("2026-10-11")?.reason; // "holiday" (Sports Day, October 12)
```

**Business days of Japanese banks**: banks are closed on weekends, holidays and December 31 to January 3, so a bank calendar is three lines. Combine it with your own calendar for a remittance date (see "Combining calendars").

```ts
const bank = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "Bank holiday period" }],
});
bank.isBusinessDay("2026-12-30"); // true
bank.nextBusinessDay("2026-12-30"); // "2027-01-04"
```

**Build per-store calendars from shared options**: options are plain objects, so spread and extend them.

```ts
const base = {
  holidayProvider: jp,
  closedWeekdays: [0],
  closedAnnualDates: [{ from: "12-31", to: "01-03" }],
} as const;
const shibuya = createCalendar({ ...base, openDates: ["2026-12-27"] });
const yokohama = createCalendar({ ...base, closedRecurringRules: [{ weekday: 3, nth: 3 }] });
```

## Month-based due dates and date adjustment

Dates that fall on closed days are adjusted to business days with the convention you choose. The nth business day of a month and due dates such as "the nth of every month (next business day if closed)" are also available.

```ts
import { closingMonth, createCalendar, monthOf } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const calendar = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  closedAnnualDates: [{ from: "12-31", to: "01-03", name: "New Year closure" }],
});

calendar.adjust("2026-10-31", { convention: "following" }); // "2026-11-02" (Oct 31 is a Saturday)
calendar.adjust("2026-10-31", { convention: "modified-following" }); // "2026-10-30" (the month would change, so backwards)

calendar.firstBusinessDayOfMonth("2027-01"); // "2027-01-04"
calendar.lastBusinessDayOfMonth("2026-12"); // "2026-12-30"
calendar.nthBusinessDayOfMonth("2026-10", 5); // "2026-10-07" (-1 is the last, -2 the second to last)

// Paid on the 10th of every month (next business day if closed)
calendar.dueDate("2026-10", { dayOfMonth: 10, convention: "following" }); // "2026-10-13" (Oct 12 is Sports Day)

// Closing on the 20th, paid at the end of the next month (previous business day if closed)
const billing = closingMonth("2026-10-21", 20); // "2026-11" (Oct 21 to Nov 20 belongs to November)
calendar.dueDate(monthOf(billing, 1), { dayOfMonth: -1, convention: "preceding" }); // "2026-12-30"
```

**Adjustment conventions** (`convention`, required)

| Convention             | On a closed day                                                      |
| ---------------------- | -------------------------------------------------------------------- |
| `"following"`          | The next business day                                                |
| `"preceding"`          | The previous business day                                            |
| `"modified-following"` | The next business day, or the previous one if the month would change |
| `"modified-preceding"` | The previous business day, or the next one if the month would change |

- On a business day, every convention returns the same day
- Whether the month changes is judged against **the month of the date before adjustment**. For `dueDate` it is the date after mapping to the last day of the month (for example, payment on the 31st in February uses the last day of February, and `"modified-following"` adjusts within February)
- With `modified-…`, if the month has no business day in the opposite direction either (the whole month is closed), the date is adjusted in the original direction even though the month changes
- There is no "nearest business day" (nearest), because the tie-breaking rule for equal distances differs by industry

**Month helpers** (root functions; business days are not considered)

- `monthOf(input, offset?)`: the month `offset` months after (before, if negative) a date or a month `"YYYY-MM"`
- `closingMonth(date, closingDayOfMonth)`: the month a date belongs to when months are closed on `closingDayOfMonth` (1–31, `-1` for the last day). The day after a closing day up to the next closing day belongs to the month of the next closing day. If the closing day does not exist in a month (closing on the 31st in February), the last day is used
- `closingPeriod(input, closingDayOfMonth)`: the inverse: the period `{ from, to }` (both ends included) that belongs to the month, from the day after the previous closing day to the closing day. Given a date, the period that date belongs to. The result has the shape of a date range, so it can go straight into `closedDates` or `businessDatesBetween`

```ts
closingPeriod("2026-11", 20); // { from: "2026-10-21", to: "2026-11-20" }
closingPeriod("2026-03", 31); // { from: "2026-03-01", to: "2026-03-31" } (closing on the 31st in February means the 28th)
const { from, to } = closingPeriod("2026-11-05", 20); // the period "2026-11-05" belongs to
const office = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
office.businessDatesBetween(from, to).length; // 22 (business days in the November period)
```

**Closing days that move to a business day**: when the contract says "closed on the 20th, or the previous business day if the 20th is not one", use the calendar's `closingMonth(date, closingDayOfMonth, { convention })` and `closingPeriod(input, closingDayOfMonth, { convention })`. Each month's closing day (the last day when it does not exist) is adjusted with the `convention` of `adjust` (required, no default), and a date belongs to the first month whose adjusted closing day is on or after it. The root functions keep closing on calendar days.

```ts
const office = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });
// September 20, 2026 is a Sunday: with "preceding" the September closing day is Friday the 18th
office.closingMonth("2026-09-19", 20, { convention: "preceding" }); // "2026-10" (the 19th is after the September closing)
closingMonth("2026-09-19", 20); // "2026-09" (closing on calendar days)
office.closingPeriod("2026-10", 20, { convention: "preceding" }); // { from: "2026-09-19", to: "2026-10-20" }
```

A month whose closing day is not preceded by any business day since the previous closing day (a long closure for renovation, say) has no period of its own: its days belong to the next month, `closingMonth` never returns that month, and `closingPeriod` for that month throws `no-business-day`. With `"following"` a closing day can move past a long closure into a later month; the period is then longer, not empty.

The `dayOfMonth` of `dueDate` also maps days that do not exist in a month (such as February 30) to the last day. Recurring rules (`{ dayOfMonth: 31 }`) do not match such days, so the two behave differently: a due date must always fall somewhere in its month.

## Day-by-day values (e.g. store hours)

`createSchedule` returns any value per day from weekday, holiday and specific-date rules. The value type is up to you, so it also fits booking slots, delivery fee classes and more.

```ts
import { createSchedule } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

type Hours = { open: string; close: string } | null; // null means closed
const weekday = { open: "10:00", close: "21:00" };
const sunday = { open: "10:00", close: "19:00" };

const storeHours = createSchedule<Hours>({
  holidayProvider: jp,
  weekdayValues: [sunday, weekday, null, weekday, weekday, weekday, weekday], // [Sun, Mon, …, Sat]; closed on Tuesdays
  holidayPolicy: { sameAs: 0 }, // Sunday hours on holidays ("ignore": by weekday / { value: … }: a fixed value)
  annualDates: [{ date: "01-01", value: null, name: "Closed on New Year's Day" }], // annual dates (ranges too)
  dates: [{ date: "2026-12-31", value: { open: "10:00", close: "17:00" }, name: "New Year's Eve" }],
});

storeHours.valueOn("2026-11-03"); // { open: "10:00", close: "19:00" } (Culture Day uses Sunday hours)
storeHours.dayInfoOn("2027-01-01");
// { date: "2027-01-01", weekday: 5, value: null, reason: "annual", name: "Closed on New Year's Day", holiday: {…}, optionPath: "annualDates[0]" }

// Holidays in a period with their hours: filter daysBetween by holiday
storeHours
  .daysBetween("2026-11-01", "2026-11-30")
  .filter((d) => d.holiday)
  .map((d) => d.date); // ["2026-11-03", "2026-11-23"]

// Holidays not overridden by specific or annual dates (New Year's Day is closed by the annual rule)
storeHours
  .daysBetween("2026-12-28", "2027-01-11")
  .filter((d) => d.holiday && d.reason !== "date" && d.reason !== "annual")
  .map((d) => d.date); // ["2027-01-11"]
```

`reason` is the rule that decided the value, and `optionPath` (for `dates`, `annualDates` and `recurringRules`) its position in the options. With `holidayPolicy: "ignore"` (holidays follow the weekday rule), a holiday has `reason: "weekday"`, so check `holiday` to know whether a day is a holiday. Filtering by `holiday` alone also keeps holidays whose value is set by `dates` or `annualDates` (such as special hours on New Year's Day). To list only holidays that follow the holiday handling, also exclude `reason` `"date"` and `"annual"`, as in the last example: `holiday` tells whether the day is a holiday, and `reason` tells which rule decided the value.

Values are decided in the order `dates` (specific dates and ranges) → `annualDates` (annual dates and ranges) → `recurringRules` (`"over-holiday"`) → holidays → `recurringRules` (default and moved days) → `weekdayValues` (weekday). When rules of the same type overlap, the one written first in the array wins.

Checking a time range such as "is the store open now" is left to your app, because industries differ (opening past midnight, breaks and so on). With `civilOf` you get the civil date and time in the time zone, and the check is short.

```ts
const { date, time } = storeHours.civilOf(new Date()); // { date: "2026-10-14", time: "16:30" } (Japan time)
const hours = storeHours.valueOn(date);
const isOpen = hours !== null && hours.open <= time && time < hours.close;
```

For inputs that always carry a time (a `Date`, Temporal `Instant`, `ZonedDateTime` or `PlainDateTime`, or a `"YYYY-MM-DDTHH:mm"` string), `time` is typed as `string`, so no `null` check is needed. `civilOf` is also on business-day calendars, and the same conversion is available as `toDateTimeParts(input, timeZone)` in the root. (`toJapanDate` and `toJapanDateTime` in `bizdays-toolkit/jp` are deprecated since 0.10.0: use `toDateString(input, "Asia/Tokyo")`, `toDateTimeParts(input, "Asia/Tokyo")` or `dateOf`/`civilOf` on a calendar instead. They will be removed in 1.0.0.)

## A business-day calendar from a schedule

When the schedule (store hours, say) is the real configuration, `createCalendarFromSchedule(schedule, isOpen)` makes a business-day calendar from it, so you do not write a second set of rules to keep in sync. `isOpen` decides from the value alone whether the day is a business day; the result is an ordinary calendar with business-day arithmetic, `adjust`, `dueDate` and the rest.

```ts
import { createCalendarFromSchedule } from "bizdays-toolkit";

const hours = createSchedule<Hours>({
  holidayProvider: jp,
  weekdayValues: [
    null,
    weekday,
    weekday,
    weekday,
    weekday,
    weekday,
    { open: "10:00", close: "17:00" },
  ],
  holidayPolicy: { sameAs: 0 },
  annualDates: [
    { from: "12-31", to: "01-03", value: null, name: "New Year closure" },
    { date: "01-04", value: { open: "11:00", close: "15:00" }, name: "First day of the year" },
  ],
});
const calendar = createCalendarFromSchedule(hours, (v) => v !== null);
calendar.addBusinessDays("2026-12-29", 2); // "2027-01-04"
calendar.dayInfoOn("2027-01-04");
// { date: "2027-01-04", weekday: 1, open: true, reason: "open-annual", name: "First day of the year", optionPath: "annualDates[1]" }
```

- `isOpen` must be a pure function of the value: it receives only the value (not the date), and the calendar calls it repeatedly while searching for business days, so a function that looks at the date, the time or outside state would make the result change from call to call. Conditions that depend on the date belong in the schedule's rules (`dates`, `recurringRules`)
- `dayInfoOn` maps the schedule's `reason` to the calendar's: `date` → `"open-date"`/`"closed-date"`, `annual` → `"open-annual"`/`"closed-annual"`, `recurring` → `"open-recurring"`/`"closed-recurring"`, `holiday` → `"holiday"` (whether or not the holiday is open, as with `holidayPolicy: "open"`), `weekday` → `"open-weekday"`/`"closed-weekday"`. `"open-annual"` exists only for calendars made this way, since `closedAnnualDates` of `createCalendar` only closes. `name`, `holiday`, `shiftedFrom` and `optionPath` are the schedule's
- Holidays, the time zone and `outOfRangePolicy` are the schedule's. Diagnose the schedule's options with `diagnoseSchedule`; the calendar itself is not diagnosed. `searchDayLimit` (default 3660) can be given in the options
- Use `createCalendar` when you only need open or closed; use this when you have a schedule anyway

## Date and date-time inputs

Every method accepts the following inputs. Returned dates are always `"YYYY-MM-DD"` strings.

| Input                                                | Treated as                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `"2026-11-23"`                                       | A civil date                                                      |
| `"2026-11-23T10:00"`                                 | A date and time in the calendar's time zone (wall clock)          |
| `"2026-11-22T15:30:00Z"`, `"2026-11-23T00:30+09:00"` | An instant, converted to a civil date in the calendar's time zone |
| `Date`                                               | An instant                                                        |
| Temporal `PlainDate`, `PlainDateTime`                | A civil date or date and time (no dependency on Temporal)         |
| Temporal `Instant`, `ZonedDateTime`                  | An instant                                                        |

The separator between the date and the time is `T` (upper or lower case), as in the `DateTimeInput` type; a space (`"2026-11-23 10:00"`) is an `invalid-time` error. Temporal objects are recognized by their shape, so the package does not depend on Temporal. CI also checks real Temporal objects in the runtimes that provide Temporal (the CI log shows whether each runtime had it).

The calendar's time zone is the `timeZone` option, then the holiday provider's time zone, then `"UTC"`.

**From a civil date and time to an instant**: `toInstant(date, time, timeZone)` and `calendar.instantOf(date, time)` (also on schedules) go the other way from `civilOf`: a civil date `"YYYY-MM-DD"` and a time `"HH:mm"` or `"HH:mm:ss"` become a `Date` for that instant in the time zone. Only a date string is accepted (a `Date` would be ambiguous about which day it means), and the result is a `Date`, which is one line from an ISO string (`.toISOString()`) or a Temporal `Instant` (`Temporal.Instant.fromEpochMilliseconds(d.getTime())`).

```ts
import { toInstant } from "bizdays-toolkit";

toInstant("2026-11-23", "10:00", "Asia/Tokyo").toISOString(); // "2026-11-23T01:00:00.000Z"
const store = createCalendar({ holidayProvider: jp, closedWeekdays: [0] });
const opensAt = store.instantOf(store.nextBusinessDay(store.today()), "10:00"); // the next opening, as a Date
```

Around daylight-saving changes the result follows Temporal's default (`disambiguation: "compatible"`): a time that does not exist (in the UK, 01:00–01:59 on the last Sunday of March) is moved forward by the length of the gap, and a time that occurs twice (01:00–01:59 on the last Sunday of October) is the earlier one.

```ts
import { england } from "bizdays-toolkit/uk";

const uk = createCalendar({ holidayProvider: england });
uk.instantOf("2026-03-29", "01:30").toISOString(); // "2026-03-29T01:30:00.000Z" (02:30 BST; 01:30 does not exist)
uk.instantOf("2026-10-25", "01:30").toISOString(); // "2026-10-25T00:30:00.000Z" (the first 01:30, still BST)
```

## Outside the supported years

Evaluating a date outside the holiday provider's supported years (1955–2099 for Japan, 1974–2099 for the UK, 2000–2099 for France, 2020–2027 for Singapore) throws a `RangeError`. To treat such dates as having no holidays, set `outOfRangePolicy: "ignore"`. The rules that look at a neighbouring day (`dayAfterHoliday`, `dayBeforeHoliday`, `skipWeekdays` and the days an `"after-holiday"` rule looks back on) also throw when that day is outside the supported years, and so does the nth business day of the week (`businessDayOfWeek`) when its week runs past them, since the result would depend on unknown holidays (with Singapore's provider, the last December 31 with a rule on the day before New Year's Day, and the last week of December of the last supported year and the first week of 2020 with a `businessDayOfWeek` rule, for example). With `"ignore"`, days outside have no holidays. The option diagnostics treat days outside as having no holidays so that the edges of their scan do not throw.

## Unconfirmed holidays

Years after the provider's `confirmedThrough` may contain predicted holidays (`confirmed: false`): the Japanese equinox days, whose dates are published in the Official Gazette every February for the next year, and UK bank holidays after the last year GOV.UK has published. By default the predictions are used. With `unconfirmedHolidayPolicy: "throw"` (next to `outOfRangePolicy`, on calendars and schedules), any evaluation that looks up an unconfirmed holiday throws a `RangeError` with `code: "unconfirmed-holiday"`, so that a result which would depend on a prediction, such as a due date in a five-year repayment schedule or a date written into a contract, is never produced silently. "Any evaluation" includes the days a search passes through (`addBusinessDays`, `adjust`, `dueDate`, `closingMonth` and so on) and the days a `dayAfterHoliday` or `dayBeforeHoliday` rule looks at (the neighbouring day, or with `skipWeekdays` the days from there across the skipped weekdays up to the nearest holiday), not only the day asked about. `holidaysInYear` and `holidaysBetween` never throw, so they are the way out: after catching the error, list the days that are affected.

```ts
import { createCalendar, isBizdaysError } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const strict = createCalendar({
  holidayProvider: jp,
  closedWeekdays: [0, 6],
  unconfirmedHolidayPolicy: "throw",
});
try {
  strict.dueDate("2028-03", { dayOfMonth: 20, convention: "following" });
} catch (e) {
  if (isBizdaysError(e) && e.code === "unconfirmed-holiday") {
    // Recompute after the Official Gazette of February 2028; these are the days involved
    strict
      .holidaysBetween("2028-01-01", "2028-12-31")
      .filter((h) => !h.confirmed)
      .map((h) => h.date); // ["2028-03-20", "2028-09-22"]
  }
}
```

- It matters only when the results depend on holidays. With `holidayPolicy: "ignore"` (in a calendar or a schedule) and no holiday-based rule (`holiday`, `dayAfterHoliday`, `dayBeforeHoliday`, `"after-holiday"`), the results do not change, but `dayInfoOn` still looks up the holiday it reports and throws. Option diagnostics flag such options as `redundant`
- Combined calendars throw if any of their calendars throws; a calendar made from a schedule follows the schedule
- The option catches holidays that are predicted, not holidays that are unknown: a one-off UK bank holiday announced later is absent from the predictions, and Singapore has no predictions at all (later years are `out-of-range`)

## Errors

Invalid options and inputs throw ordinary exceptions such as `RangeError` and `TypeError`, with a `code`. Messages may change, so branch on `code`.

```ts
import { createCalendar, isBizdaysError } from "bizdays-toolkit";

try {
  createCalendar({ closedDates: ["2026-12-32"] });
} catch (error) {
  if (isBizdaysError(error) && error.code === "invalid-date") {
    // An invalid date (the message includes the location in the options, "closedDates[0].date")
  }
}
```

Codes: `invalid-date`, `invalid-input`, `invalid-month`, `invalid-annual-date`, `invalid-time`, `invalid-range`, `invalid-weekday`, `invalid-time-zone`, `invalid-argument`, `invalid-option`, `time-zone-conflict`, `out-of-range`, `unconfirmed-holiday`, `invalid-provider`, `invalid-provider-data`, `no-business-day`. Future versions may add codes.

## Option diagnostics

`diagnoseCalendar` and `diagnoseSchedule` from `bizdays-toolkit/diagnose` examine options and return a list of problems. They never throw for a problem in the options (an empty array means no problems); only a wrong second argument (see `asOf` below) throws.

```ts
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

diagnoseCalendar({
  holidayProvider: jp,
  closedWeekdays: [0],
  closedRecurringRules: [
    { weekday: 3, nth: 3, name: "Closed on the 3rd Wednesday" },
    { weekday: 3, nth: 3, months: [8], name: "3rd Wednesday in August" }, // covered by the previous rule
    { weekday: 0, name: "Closed on Sundays" }, // same as the closed weekday
  ],
  closedDates: ["2100-01-05"], // outside the supported years of Japanese holidays (1955–2099)
  closeAnnual: ["12-31"], // a typo
});
// [
//   { severity: "warning", code: "unknown-option", path: "closeAnnual", message: '… (did you mean "closedAnnualDates"?)' },
//   { severity: "warning", code: "out-of-range", path: "closedDates[0]", relatedPath: "holidayProvider", message: "…" },
//   { severity: "warning", code: "shadowed", path: "closedRecurringRules[1]", relatedPath: "closedRecurringRules[0]", message: "…" },
//   { severity: "info", code: "redundant", path: "closedRecurringRules[2]", message: "…" },
// ]
```

| `severity` | `code`                       | Meaning                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error`    | The same codes as exceptions | Errors that make `createCalendar` or `createSchedule` throw. Creation stops at the first one; diagnostics return them all                                                                                                                               |
| `error`    | `invalid-provider-data`      | Errors in the data returned by a holiday provider. Creation checks only the years used; diagnostics check every supported year                                                                                                                          |
| `warning`  | `unknown-option`             | Unknown keys (ignored at creation). If a close known key exists, `message` suggests it                                                                                                                                                                  |
| `warning`  | `deprecated-option`          | A key or value renamed in 0.30.0 (accepted as the new name until 1.0.0). `path` is where you wrote the old name and `message` names the new one; `migrateCalendarOptions` and `migrateScheduleOptions` rewrite saved options                            |
| `warning`  | `shadowed`                   | A rule fully covered by an earlier rule of the same type (`relatedPath`) and never used                                                                                                                                                                 |
| `warning`  | `never-matches`              | A recurring rule that matches no day (such as `{ dayOfMonth: 30, months: [2] }`, a 5th Wednesday with an effective period that has none, or `dayAfterHoliday` without a holiday provider)                                                               |
| `warning`  | `out-of-range`               | A specific date, or the effective period of a rule, outside the supported years of the holiday provider (`relatedPath`)                                                                                                                                 |
| `warning`  | `no-business-day`            | No business day at all (calendars only; searching for a business day throws)                                                                                                                                                                            |
| `info`     | `redundant`                  | A rule whose removal changes nothing (covered by a combination of earlier rules, same as a closed weekday, the same value as the weekday in a schedule, and so on), or `unconfirmedHolidayPolicy: "throw"` in options whose results do not use holidays |
| `info`     | `counting-basis`             | A `businessDayOfMonth` rule together with a weekly weekday rule in the same options: that weekday is counted as a business day (see [Recurring rules](#recurring-rules))                                                                                |
| `info`     | `expired`                    | Only with `asOf` (below): a rule or date that ended before the given day                                                                                                                                                                                |

- Branch on `code`. `message` is in English and its wording may change. Future versions may add codes
- When there is an `error`, the rule relation checks (`shadowed`, `redundant` and so on) are skipped
- `shadowed` compares only rules of the same type (specific dates, annual dates, recurring rules). The order of evaluation is fixed, so rules unused across types are found as `redundant`. Specific open days (`openDates`) and specific closed days (`closedDates`) are of the same type, and a closed day covered by an earlier open day is `shadowed`
- `shadowed` for recurring rules also considers `holidayOverlapPolicy`. For example, an `"under-holiday"` rule does not cover an `"over-holiday"` rule on the same days (the later rule applies on holidays)
- `shadowed` for `dayAfterHoliday` and `dayBeforeHoliday` rules is checked only against rules of the same kind (by `kinds`, `keys`, `weekdays`, `months`, period and the same `skipWeekdays`), because which days they match depend on the holidays of each year; overlap with weekday rules is found as `redundant`. `shadowed` for `cycle` rules is checked only against other `cycle` rules: an earlier rule covers a later one when the later cycle is a multiple of the earlier one and every day of the later rule falls on a day of the earlier one
- `shadowed` for rules with effective periods also requires the earlier rule's period to contain the later rule's period, and for `interval` rules the earlier rule's cycle to contain the later one (a weekly rule covers an every-other-week rule; two every-other-week rules with opposite phases do not cover each other)
- `redundant` compares the results with and without the rule day by day. Specific dates are checked over their range; annual dates and recurring rules are checked, with specific dates removed, over the holiday provider's supported years (1955–2099 for Japan), or 2001–2028 without a provider (28 years cover every combination of weekday and date; with `interval` or `cycle` rules the range is extended to the length of their cycle, such as 56 years for every other week, up to 200 years). Effective periods outside that range are checked as well (with `outOfRangePolicy: "throw"`, only within the supported years). `message` names the years checked. Schedule values are compared by content for arrays and plain objects, and by identity otherwise (such as `Date`)
- `shadowed` and `redundant` judge each rule as if only that rule were removed. If you write the same rule twice, the later one is reported as `shadowed` and the earlier one as `redundant`, but removing both changes the results. When several rules are reported, remove one at a time and run the diagnostics again
- With Japanese holidays, checking every day takes a few hundred milliseconds. Use it in tests or at startup, not per request. As a development and test tool, it lives in a subpath so it stays out of your app's main bundle

**Finding rules that have ended** (`asOf`): options accumulate over the years, for example in a multi-store service that stores each store's options as JSON. Pass `{ asOf: "YYYY-MM-DD" }` as the second argument and every rule with an `effectiveTo` before that day, and every specific date or range that ends before it, is returned as `info` with code `expired` (independent of `redundant`: these rules did affect the past). Without `asOf` nothing is returned as `expired`, so a test such as `assert.deepEqual(diagnoseCalendar(options), [])` does not drift with the date. `asOf` takes only a date string (a `Date` would need a time zone); other values throw `invalid-date`, a second argument that is not an object throws `invalid-argument`, and unknown keys in it are ignored.

```ts
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

diagnoseCalendar(
  {
    holidayProvider: jp,
    closedRecurringRules: [
      { weekday: 1, name: "Closed on Mondays", effectiveTo: "2027-03-31" },
      { weekday: 2, name: "Closed on Tuesdays", effectiveFrom: "2027-04-01" },
    ],
    closedDates: ["2026-02-10"],
  },
  { asOf: "2028-01-01" },
).map((d) => [d.code, d.path]); // [["expired", "closedDates[0]"], ["expired", "closedRecurringRules[0]"]]
```

Keeping options safe with a test:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { shippingOptions } from "../src/calendar.ts";

test("the shipping calendar options have no problems", () => {
  assert.deepEqual(diagnoseCalendar(shippingOptions), []);
});
```

### Options saved before 0.30.0

Version 0.30.0 renamed keys and values to follow one set of naming rules (`closedAnnual` → `closedAnnualDates`, `holidays` → `holidayProvider`, the rule `day` → `dayOfMonth` and so on; the full list is in the migration guide). Until 1.0.0 the old names are still accepted, and the diagnostics report each as `deprecated-option` at the place you wrote it. `migrateCalendarOptions` and `migrateScheduleOptions` rewrite saved options to the new names without validating them, and return what they changed with the old positions:

```ts
import { migrateCalendarOptions } from "bizdays-toolkit/diagnose";

const { options, changes } = migrateCalendarOptions({
  closedAnnual: [{ date: "12-31" }],
  closedRecurring: [{ day: 25 }],
});
options; // { closedAnnualDates: [{ date: "12-31" }], closedRecurringRules: [{ dayOfMonth: 25 }] }
changes.map((c) => c.path); // ["closedAnnual", "closedRecurring", "closedRecurring[0].day"]
```

Saved options rarely contain the holiday provider (it is an object with functions). The Japanese kind `"national"` (now `"regular"`) is rewritten only when every holiday provider in the options has the ID `"JP"`, so add the provider you attach when loading before migrating, and take it out again before saving. Without a provider, `"national"` is left as it is and is not listed in `changes`. With other providers as well, it is not rewritten either, since `"regular"` would also match their holidays (see the migration guide for how to write such options):

```ts
import { migrateCalendarOptions } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

const stored = '{"closedRecurring":[{"holiday":true,"kinds":["national"]}]}'; // saved before 0.30.0
const migrated = migrateCalendarOptions({ ...JSON.parse(stored), holidayProvider: jp });
const { holidayProvider, ...toSave } = migrated.options; // take the provider out before saving
toSave; // { closedRecurringRules: [{ holiday: true, kinds: ["regular"] }] }
```

Old names that were not rewritten show up as `deprecated-option` when you diagnose the migrated options. When you migrate saved options in bulk, run the diagnostics afterwards and check that no `deprecated-option` is left. `"national"` in options with other providers has to be rewritten by hand:

```ts
import { diagnoseCalendar, migrateCalendarOptions } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";
import { england } from "bizdays-toolkit/uk";

const { options } = migrateCalendarOptions({
  holidayProvider: [jp, england],
  timeZone: "Asia/Tokyo",
  holidayPolicy: "open",
  closedRecurring: [{ holiday: true, kinds: ["national"] }],
});
diagnoseCalendar(options).map((d) => `${d.code} ${d.path}`); // ["deprecated-option closedRecurringRules[0].kinds[0]"]
```
