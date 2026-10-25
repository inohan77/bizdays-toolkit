<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inohan77/bizdays-toolkit/main/docs/assets/logo-dark.svg">
    <img src="https://raw.githubusercontent.com/inohan77/bizdays-toolkit/main/docs/assets/logo-light.svg" alt="bizdays-toolkit" width="400">
  </picture>
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/bizdays-toolkit"><img src="https://img.shields.io/npm/v/bizdays-toolkit" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/bizdays-toolkit"><img src="https://img.shields.io/npm/d18m/bizdays-toolkit" alt="npm downloads"></a>
  <a href="https://github.com/inohan77/bizdays-toolkit/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/inohan77/bizdays-toolkit/ci.yml?branch=main&amp;label=CI" alt="CI status"></a>
  <a href="https://github.com/inohan77/bizdays-toolkit/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/bizdays-toolkit" alt="license"></a>
  <img src="https://img.shields.io/node/v/bizdays-toolkit" alt="Node.js version">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="zero dependencies">
  <img src="https://img.shields.io/badge/types-included-blue" alt="TypeScript types included">
</p>

<p align="center"><b>English</b> | <a href="https://github.com/inohan77/bizdays-toolkit/blob/main/docs/README.ja.md">日本語</a></p>

A business-day calendar that combines public holidays with company or store closures.

- **Holidays verified day by day against official data**: Japan (Cabinet Office, 1955 to the latest year in the Official Gazette), France (data.gouv.fr; metropolitan France and Alsace-Moselle, verified for 2006–2031), the UK (GOV.UK; England, Wales, Scotland and Northern Ireland, 2012 onwards) and Singapore (Ministry of Manpower on data.gov.sg, 2020 onwards). Every date is checked in the tests, differences are watched daily and shipped as patch versions
- **Business-day arithmetic**: closed weekdays, annual closures (across the new year too), specific closed and open dates and holidays combine into "N business days later", "next business day after the cutoff" and month-based due dates with the four adjustment conventions used in finance
- **Recurring rules**: "closed on the 3rd Wednesday", "every other Wednesday", "stocktaking on the last day of the month", "closed on Mondays, or the next weekday when Monday is a holiday", "the day after (or before) a holiday", each with its own behaviour on holidays and an optional effective period
- **Day-by-day values and combined calendars**: store hours that change by weekday, holiday and date; a business-day calendar made from such a schedule; and the days on which all (or any) of several calendars are open
- **Option diagnostics**: `bizdays-toolkit/diagnose` lists rules that never apply, rules that are shadowed or redundant, rules that have ended, typos in option names and options with no business day at all, without throwing. One line in a test keeps options honest
- **Lightweight, zero dependencies, time-zone safe**: about 11.0 KB min+gzip (about 12.9 KB with Japanese holidays, about 11.9 KB with French holidays, about 12.8 KB with UK bank holidays, about 11.9 KB with Singapore holidays; measured for 0.20.0). Standard JavaScript and `Intl` only, ESM with bundled types; tested on Node.js, Chrome, Firefox, Edge, Safari, Cloudflare Workers, Bun and Deno. Instants such as `Date` are converted to a civil date in the calendar's time zone before evaluation
- **Extensible to other countries and regions**: holiday providers are pluggable through the `HolidayProvider` interface, and `bizdays-toolkit/provider` exposes the calendar arithmetic (nth weekday of a month, Easter, substitute days for holidays on a weekend) that most countries' holidays are built from

## Installation

```sh
pnpm add bizdays-toolkit
```

Node.js 22.12 or later. CI tests the package on Node.js 22.12, 22, 24 and 26, on Chrome, Firefox and Edge (Linux) and Safari (macOS), on Cloudflare Workers (workerd, the open-source Workers runtime), and on Bun (1.4) and Deno (2.9). The browsers are the latest stable versions on GitHub's runners, so their versions change as the runners are updated. The package is ESM only, but it can also be loaded from CommonJS with `require()` (tested in CI as well; on Node.js 22.12, `require()` prints an experimental-feature warning, which does not affect the result, and Node.js 26 prints none). Vercel's Edge Runtime is not tested.

Types are bundled. CI type-checks a consumer project against the published type definitions with TypeScript 5.0, 5.5, 5.8, 6.0 and 7.0 (the native compiler), each with `moduleResolution` set to `node16`, `nodenext` and `bundler`, and confirms that an intentional type error is reported by each.

## Quick start

```ts
import { createCalendar } from "bizdays-toolkit";
import { isHoliday, jp } from "bizdays-toolkit/jp";

isHoliday("2026-11-23"); // true (Labor Thanksgiving Day)

const calendar = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedAnnual: [{ from: "12-29", to: "01-03", name: "New Year closure" }],
});
calendar.isBusinessDay("2026-12-30"); // false
calendar.addBusinessDays("2026-12-28", 1); // "2027-01-04"
calendar.businessDayOnOrAfter("2026-12-28T15:30", { cutoff: "14:00" }); // "2027-01-04" (after the cutoff, so the next business day)
calendar.dueDate("2026-11", { day: 23, convention: "following" }); // "2026-11-24" (the 23rd is a holiday)
```

The [guide](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md) explains everything below in full, with examples that are run in CI. This README is the short version.

## What you can do

### Holidays of Japan, France, the UK and Singapore

| Provider                                          | Subpath              | Time zone        | Supported years | Verified against                       |
| ------------------------------------------------- | -------------------- | ---------------- | --------------- | -------------------------------------- |
| `jp`                                              | `bizdays-toolkit/jp` | `Asia/Tokyo`     | 1955–2099       | Cabinet Office "National Holidays" CSV |
| `metropole`, `alsaceMoselle`                      | `bizdays-toolkit/fr` | `Europe/Paris`   | 2000–2099       | data.gouv.fr "Jours fériés en France"  |
| `england`, `wales`, `scotland`, `northernIreland` | `bizdays-toolkit/uk` | `Europe/London`  | 2012–2099       | GOV.UK bank holidays                   |
| `sg`                                              | `bizdays-toolkit/sg` | `Asia/Singapore` | 2020–2027       | data.gov.sg (Ministry of Manpower)     |

Each holiday carries its date, name (and English name), `kind` (national, substitute, citizens' holiday, bank holiday and so on, by country) and `confirmed` (whether the date is officially fixed; the Japanese equinox days and UK bank holidays after the last published year are predictions). Years after the supported range are an error unless `outOfRange: "ignore"` is set, and `unconfirmedHolidays: "throw"` stops any result that would depend on a predicted holiday. Details: [Bundled holiday providers](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#bundled-holiday-providers), [Unconfirmed holidays](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#unconfirmed-holidays).

### Business-day calendars and recurring rules

A calendar is built from the holiday provider and your closures: `closedWeekdays`, `closedAnnual` (month-day ranges, across the new year too), `closedDates` and `openDates`, and recurring rules in `closedRecurring` / `openRecurring`:

| Rule                                                      | Meaning                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `{ weekday: 3, nth: 3 }`                                  | The 3rd Wednesday (`nth` is 1–5 or -1 for the last; an array for several)        |
| `{ weekday: 3, interval: 2, anchor: "2026-01-07" }`       | Every other Wednesday, counted from the anchor                                   |
| `{ day: 20 }`, `{ day: -1 }`                              | The 20th, the last day of the month                                              |
| `{ businessDayOfMonth: -1 }`, `{ businessDayOfMonth: 5 }` | The last business day of the month, the 5th business day                         |
| `{ holiday: true, kinds: ["substitute"] }`                | Holidays, optionally narrowed by kind or by key (`keys: ["vernal-equinox"]`)     |
| `{ dayAfterHoliday: true }`, `{ dayBeforeHoliday: true }` | The day after (or before) a holiday or a run of holidays                         |
| `onHolidayRule: "after-holiday"`                          | "Closed on Mondays, or the next weekday when Monday is a holiday" (museum rule)  |
| `skipWeekdays: [0, 6]`                                    | With `"after-holiday"`: also skip weekends ("June 15, or the next business day") |
| `effectiveFrom`, `effectiveTo`                            | The period the rule is in effect                                                 |

`dayInfo` tells you why a day is open or closed (`reason`, `name`, `rulePath`). Every bundled holiday that recurs each year has a stable `key` (`vernal-equinox`, `good-friday`, `hari-raya-puasa`, …), so a rule can select individual holidays that no date pattern can express. Details: [Business-day calendars](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#business-day-calendars), [Recurring rules](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#recurring-rules), [Holiday keys](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#holiday-keys), [Common recipes](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#common-recipes).

### Due dates, schedules and combined calendars

- `dueDate("2026-11", { day: 23, convention: "following" })`, `adjust`, `closingMonth` and `closingPeriod` compute month-based due dates and closing periods with the `following`, `preceding`, `modified-following` and `modified-preceding` conventions ([Month-based due dates](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#month-based-due-dates-and-date-adjustment))
- `createSchedule` gives a value per day (store hours, a shipping cutoff, a price band) from the same kinds of rules, and `createCalendarFromSchedule` turns such a schedule into a calendar so the hours are the only configuration ([Day-by-day values](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#day-by-day-values-eg-store-hours), [A calendar from a schedule](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#a-business-day-calendar-from-a-schedule))
- `combineCalendars` builds the days on which all (or any) of several calendars are open, such as your company and the bank for a remittance date ([Combining calendars](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#combining-calendars))
- Dates can be given as `"YYYY-MM-DD"`, `"YYYY-MM-DDTHH:mm"`, `Date` or Temporal objects; instants are converted in the calendar's time zone ([Date and date-time inputs](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#date-and-date-time-inputs))

### Option diagnostics

```ts
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

diagnoseCalendar({
  holidays: jp,
  closedWeekdays: [0],
  closedRecurring: [{ weekday: 0 }],
  closeAnnual: ["12-31"],
}).map((d) => [d.severity, d.code, d.path]);
// [["warning", "unknown-option", "closeAnnual"], ["info", "redundant", "closedRecurring[0]"]]
```

`diagnoseCalendar` and `diagnoseSchedule` return every problem in the options without throwing: typos (with a suggestion), rules that never match, rules shadowed by earlier ones, rules whose removal changes nothing, options with no business day, and, with `{ asOf }`, rules that have ended. `assert.deepEqual(diagnoseCalendar(options), [])` in a test keeps options honest. Details: [Option diagnostics](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#option-diagnostics), [Errors](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md#errors).

### Other countries and regions

A holiday provider is an object with `id`, `timeZone`, `supportedYears` and `holidaysInYear(year)`. `bizdays-toolkit/provider` exposes `nthWeekdayOfMonth` and `easterSunday`, which most countries' holidays are built from. See [providers.md](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/providers.md).

## Documentation

- [Guide](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/guide.md): the full description of every feature, with examples run in CI
- [Writing a holiday provider](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/providers.md)
- [Migration guide](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/migration.md) (Japanese) and [CHANGELOG](https://github.com/inohan77/bizdays-toolkit/blob/main/CHANGELOG.md)
- [Design decisions](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/decisions.md) (Japanese): why things are the way they are
- [RELEASING.md](https://github.com/inohan77/bizdays-toolkit/blob/main/RELEASING.md) (Japanese): versioning, compatibility promise, data updates and monitoring

## Versioning and data updates

Versioning follows [Semantic Versioning](https://semver.org/). See [RELEASING.md](https://github.com/inohan77/bizdays-toolkit/blob/main/RELEASING.md) (Japanese) for details.

- Official data updates (new, moved and one-off holidays by law, Official Gazette or proclamation, fixed equinox days in Japan, newly published years on GOV.UK, newly gazetted years and revised dates in Singapore, changes to the French Labour Code) are released as **patch** versions, so they reach you with either `^` or `~`
- To freeze the holiday results, pin an exact version (for example `"bizdays-toolkit": "0.8.0"`)
- The reflected data is shown by the provider's `dataVersion` (for Japan, the year and month of the Official Gazette reflected; for the UK and Singapore, the year and month of the GOV.UK or data.gov.sg data reflected) and `confirmedThrough` (`jp.dataVersion`, `england.confirmedThrough` and so on). The module-level constants `dataVersion` and `confirmedThrough` in `bizdays-toolkit/jp` and `bizdays-toolkit/uk` are deprecated since 0.12.0 and will be removed in 1.0.0
- Before 1.0.0, minor versions may contain breaking changes. What you need to change when moving between minor versions is listed in the [migration guide](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/migration.md) (Japanese) and in the "移行" (migration) part of each version in the CHANGELOG
- Decision reasons (`reason`), holiday kinds (`kind`), error codes and diagnostic codes may gain values in future versions. When you branch on their values, handle "anything else" too (see "互換性の約束", the compatibility promise, in [RELEASING.md](https://github.com/inohan77/bizdays-toolkit/blob/main/RELEASING.md))

## Data sources

Japanese holidays are verified with the "National Holidays" CSV published on the Cabinet Office website (<https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>) (as a test fixture only; not included in the package).

UK bank holidays are verified with the GOV.UK bank holidays data (<https://www.gov.uk/bank-holidays.json>, and for earlier years the history of the official GOV.UK repositories [alphagov/calendars](https://github.com/alphagov/calendars) and [alphagov/frontend](https://github.com/alphagov/frontend)), and the Welsh names of the Wales holidays with the Welsh version of GOV.UK (the verification data is a test fixture only; not included in the package).

Singapore public holidays are verified with the "Singapore Public Holidays" collection published by the Ministry of Manpower on data.gov.sg (<https://data.gov.sg/collections/691/view>), with the Ministry's press releases as the authority where the two differ (the verification data is a test fixture only; not included in the package).

French public holidays are verified with the "Jours fériés en France" dataset published by DINUM on data.gouv.fr (<https://www.data.gouv.fr/datasets/jours-feries-en-france>, JSON exports for the Métropole and Alsace-Moselle zones; the verification data is a test fixture only; not included in the package).

Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/), data from data.gov.sg made available under the [Singapore Open Data Licence](https://data.gov.sg/open-data-licence), and data from data.gouv.fr made available under the [Licence Ouverte / Open Licence 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence).

## License

MIT
