<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inohan77/bizdays-toolkit/main/docs/assets/logo-dark.svg">
    <img src="https://raw.githubusercontent.com/inohan77/bizdays-toolkit/main/docs/assets/logo-light.svg" alt="bizdays-toolkit" width="400">
  </picture>
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/bizdays-toolkit"><img src="https://img.shields.io/npm/v/bizdays-toolkit" alt="npm version"></a>
  <a href="https://github.com/inohan77/bizdays-toolkit/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/inohan77/bizdays-toolkit/ci.yml?branch=main&amp;label=CI" alt="CI status"></a>
  <a href="https://github.com/inohan77/bizdays-toolkit/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/bizdays-toolkit" alt="license"></a>
  <img src="https://img.shields.io/node/v/bizdays-toolkit" alt="Node.js version">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="zero dependencies">
  <img src="https://img.shields.io/badge/types-included-blue" alt="TypeScript types included">
</p>

<p align="center"><b>English</b> | <a href="https://github.com/inohan77/bizdays-toolkit/blob/main/docs/README.ja.md">日本語</a></p>

A business-day calendar that combines public holidays with company or store closures.

- **Japanese holidays verified day by day against the Cabinet Office data**: from 1955 through the latest year announced in the Official Gazette, every date in the Cabinet Office "National Holidays" CSV is checked in the tests (substitute holidays, citizens' holidays, holidays for imperial ceremonies and the Olympic moves included)
- **UK bank holidays verified day by day against GOV.UK**: choose England, Wales, Scotland or Northern Ireland. From 2012 through the last year GOV.UK has published, every date and name is checked against the GOV.UK data in the tests, and differences are watched daily
- **Recurring rules**: rules such as "closed on the 3rd Wednesday", "closed every other Wednesday", "stocktaking on the last day of the month" or "closed on Mondays (on the next weekday if Monday is a holiday)", together with what happens when they fall on a holiday (follow the holiday, apply anyway, or move to the next day). Rules can have an effective period, so "closed on Tuesdays instead of Mondays from April 2027" is one calendar
- **Day-by-day values (e.g. store hours)**: values that change by weekday, holiday and specific date, such as "closed on Tuesdays, Sunday hours on holidays, closed on New Year's Day, short hours on New Year's Eve", are looked up with the same rules
- **Option diagnostics**: `diagnoseCalendar` and `diagnoseSchedule` from `bizdays-toolkit/diagnose` list rules that can never apply, rules whose removal changes nothing, typos in option keys, calendars with no business day and more, without throwing. One line in your tests keeps a change of settings from silently killing a rule
- **Month-based due dates**: due dates such as "closing on the 20th, paid on the 10th of the next month (next business day if closed)" or "the last business day of the month", with the four adjustment conventions used in finance (following, preceding, modified-following, modified-preceding)
- **Business-day arithmetic**: closed weekdays, annual closures (including ranges across the new year), specific closed and open dates, and holidays combine to compute "N business days later", "next business day after the cut-off time" and more
- **Time-zone safe**: instants such as `Date` are converted to a civil date in the calendar's time zone (`Asia/Tokyo` for Japan, `Europe/London` for the UK) before evaluation. A server running in UTC does not treat 00:00–09:00 in Japan as the previous day
- **Lightweight, zero dependencies**: about 7.9 KB min+gzip (about 9.8 KB with Japanese holidays, about 9.6 KB with UK bank holidays; measured for 0.10.0). ESM, bundled types and `sideEffects: false`. Written in standard JavaScript and `Intl` only (no Node.js APIs); CI tests it on Node.js, Chrome, Firefox, Edge, Safari and Cloudflare Workers
- **Extensible to other countries and regions**: holiday providers are pluggable through the `HolidayProvider` interface. Japan and the UK are bundled

## Installation

```sh
pnpm add bizdays-toolkit
```

Node.js 22.12 or later. CI tests the package on Node.js 22.12, 22, 24 and 26, on Chrome, Firefox and Edge (Linux) and Safari (macOS), and on Cloudflare Workers (workerd, the open-source Workers runtime). The browsers are the latest stable versions on GitHub's runners, so their versions change as the runners are updated. The package is ESM only, but it can also be loaded from CommonJS with `require()` (tested in CI as well; on Node.js 22.12, `require()` prints an experimental-feature warning, which does not affect the result, and Node.js 26 prints none). Other runtimes (such as Deno, Bun or Vercel's Edge Runtime) are not tested.

Types are bundled. CI type-checks a consumer project against the published type definitions with `moduleResolution` set to `node16`, `nodenext` and `bundler` (TypeScript 6); TypeScript 5.0, 5.5 and 5.8 were also checked by hand for 0.9.0.

## Usage

### Looking up holidays

```ts
import { getHoliday, holidaysInYear, isHoliday } from "bizdays-toolkit/jp";

isHoliday("2026-11-23"); // true
getHoliday("2026-09-22");
// { date: "2026-09-22", name: "国民の休日", nameEn: "Citizens' Holiday", kind: "citizens", confirmed: true }
holidaysInYear(2027);

// Instants (Date) are evaluated in Japan time
isHoliday(new Date("2026-11-22T15:30:00Z")); // true (Nov 23 in Japan time)
```

`kind` is one of `national` (national holiday), `substitute` (substitute holiday), `citizens` (citizens' holiday, a day between two holidays) and `special` (holidays for imperial ceremonies and similar events).

`confirmed` tells whether the date is officially fixed. The vernal and autumnal equinox days are fixed in the Official Gazette in February of the previous year, so later years are predictions from an approximation formula (`confirmed: false`).

### UK bank holidays

```ts
import { createCalendar } from "bizdays-toolkit";
import { england, northernIreland, scotland, wales } from "bizdays-toolkit/uk";

const edinburgh = createCalendar({ holidays: scotland, closedWeekdays: [0, 6] });
edinburgh.isBusinessDay("2026-01-02"); // false (2nd January)
edinburgh.addBusinessDays("2026-06-12", 1); // "2026-06-16" (June 15 is the World Cup bank holiday)

scotland.holidaysInYear(2026)[0];
// { date: "2026-01-01", name: "New Year’s Day", nameEn: "New Year’s Day", kind: "regular", confirmed: true }
wales.holidaysInYear(2026)[0]?.names; // { cy: "Dydd Calan" }

// Across several regions, use the union (a holiday in any of them is a holiday)
const ukWide = createCalendar({ holidays: [england, scotland, northernIreland] });
```

| Provider          | ID       | GOV.UK division   | Notes                                            |
| ----------------- | -------- | ----------------- | ------------------------------------------------ |
| `england`         | `GB-ENG` | England and Wales |                                                  |
| `wales`           | `GB-WLS` | England and Wales | Welsh names (`names.cy`) included                |
| `scotland`        | `GB-SCT` | Scotland          | 2nd January, St Andrew’s Day and others          |
| `northernIreland` | `GB-NIR` | Northern Ireland  | St Patrick’s Day, Battle of the Boyne and others |

- `kind` is one of `regular` (an annual bank holiday, including years when a proclamation moved it), `substitute` (a substitute day for a bank holiday on a Saturday or Sunday) and `special` (a one-off bank holiday by proclamation, such as a jubilee or a state funeral). A substitute day has the name of the original holiday, as on GOV.UK
- England and Wales are one division on GOV.UK and currently have the same dates, but they are separate providers, so your code keeps working if they ever differ
- Supported years are 2012–2099. Years after the last year GOV.UK has published (`confirmedThrough`, currently 2028) are predictions from the rules (`confirmed: false`). One-off bank holidays are unknown until announced, so predicted years never contain them
- Local holidays set by Scottish councils are not included. Whether a bank holiday is a day off depends on the employment contract and similar arrangements
- One-off bank holidays may be announced only about ten days ahead. Differences from GOV.UK are watched daily and released as patch versions

### Business-day calendars

```ts
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const shipping = createCalendar({
  holidays: jp,
  closedWeekdays: [0], // Sunday (0 = Sunday … 6 = Saturday)
  closedAnnual: [{ from: "12-31", to: "01-03", name: "New Year closure" }],
  closedDates: [{ from: "2027-08-12", to: "2027-08-16", name: "Summer closure" }],
  openDates: ["2026-12-27"], // a specific open day
  holidayPolicy: "closed", // closed on holidays ("open": open / "ignore": not used)
});

shipping.isBusinessDay("2026-11-23"); // false (Labor Thanksgiving Day)
shipping.addBusinessDays("2026-12-30", 1); // "2027-01-04"
shipping.businessDaysBetween("2026-09-01", "2026-10-01"); // business days from (inclusive) to (exclusive)

// Orders before 14:00 ship today, later orders on the next business day
shipping.businessDayOnOrAfter(new Date(), { cutoff: "14:00" });

shipping.dayInfo("2027-01-01");
// { date: "2027-01-01", weekday: 5, businessDay: false, reason: "closed-annual", name: "New Year closure", holiday: {…} }
shipping.daysBetween("2026-12-30", "2027-01-04").map((d) => d.businessDay); // [true, false, false, false, false, true]
```

`daysBetween(from, to)` returns `dayInfo` for every day in the period (both ends included). `listBusinessDays` and `holidaysBetween` include both ends too; only `businessDaysBetween(from, to)` counts from `from` (inclusive) to `to` (exclusive), so that `businessDaysBetween(a, b) + businessDaysBetween(b, c)` equals `businessDaysBetween(a, c)` and it is the inverse of `addBusinessDays`.

`createCalendar` and `createSchedule` validate the options when they are created, so the usual pattern is to create them once and reuse them. Creating is also cheap (about 0.02 ms for a calendar and 0.04 ms for a schedule with Japanese holidays on a development machine), so creating one per request is not a problem in practice.

Each day is decided in this order of priority (top first).

1. `openDates` (specific open days)
2. `closedDates` (specific closed days)
3. `closedAnnual` (annual closures)
4. `openRecurring` and `closedRecurring` rules with `onHolidayRule: "over-holiday"` (applied even on holidays)
5. Holidays (according to `holidayPolicy`; `"open"` makes them business days even on closed weekdays)
6. `openRecurring` and `closedRecurring` (the default `"under-holiday"`, and the days moved to by `"after-holiday"`)
7. `closedWeekdays` (closed weekdays)
8. Otherwise a business day

This order is fixed. Only the relation between a recurring rule and holidays can be chosen per rule with `onHolidayRule` (next section).

### Recurring rules (weekly, every other week, nth weekday, day of month)

Recurring closed and open days such as "closed on the 3rd Wednesday", "closed on the 2nd and 4th Saturdays", "closed every other Wednesday", "stocktaking on the last day of the month" or "closed on Mondays (on the next weekday if Monday is a holiday)" go in `closedRecurring` and `openRecurring`.

```ts
const museum = createCalendar({
  holidays: jp,
  holidayPolicy: "open", // open on holidays
  closedRecurring: [
    { weekday: 1, name: "Closed on Mondays", onHolidayRule: "after-holiday" }, // closed on the next weekday instead
    {
      weekday: 3,
      nth: 3,
      months: [2, 8],
      name: "Closed on the 3rd Wednesday in February and August",
    },
    { day: -1, name: "Stocktaking", onHolidayRule: "over-holiday" }, // closed even on holidays
  ],
});

museum.isBusinessDay("2026-10-12"); // true (open on Monday, Sports Day)
museum.dayInfo("2026-10-13");
// { date: "2026-10-13", weekday: 2, businessDay: false, reason: "closed-recurring",
//   name: "Closed on Mondays", shiftedFrom: "2026-10-12" }
```

| Pattern                                             | Meaning                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `{ weekday: 1 }`                                    | Every Monday                                                                                                         |
| `{ weekday: 3, nth: 3 }`                            | The 3rd Wednesday. `nth` is 1–5 or -1 (last); an array such as `[2, 4]` gives several                                |
| `{ weekday: 3, interval: 2, anchor: "2026-01-07" }` | Every other Wednesday: the Wednesdays an even number of weeks from `anchor` (2 or more weeks; see below)             |
| `{ day: 20 }`                                       | The 20th of every month. `day` is 1–31 or -1 (last day); an array gives several                                      |
| `months: [8, 12]`                                   | Narrows any pattern to these months                                                                                  |
| `effectiveFrom: "2027-04-01"`, `effectiveTo: "…"`   | The period the rule is in effect (both ends included). Outside it, the rule is as if it were not written (see below) |

- **The nth weekday** is the nth occurrence of that weekday in the month (days 1–7 hold the 1st). It is not the weekday in the nth row of a printed calendar
- **Days that do not exist in a month** (`nth: 5` or `day: 31` in a month without one) do not match. Use `day: -1` for the last day
- **Every other week** (`interval: 2`) is not the same as the 1st and 3rd weekdays (`nth: [1, 3]`): a month with five Wednesdays shifts the latter by a week. `interval` is the number of weeks (an integer of 2 or more) and `anchor` is a date on the same weekday that the cycle passes through; the rule matches that date and every `interval` weeks before and after it. Stores announce "every other Wednesday from January 7", so copy that date. To start at the anchor rather than also matching earlier dates, add `effectiveFrom`. `interval` cannot be combined with `nth`
- Among recurring rules, the one written first in the array wins, and `openRecurring` wins over `closedRecurring`

**Effective periods** (`effectiveFrom`, `effectiveTo`) let one calendar represent a change of rules and still reproduce past dates. They go on recurring rules and on annual closures (`closedAnnual` in object form).

```ts
const shop = createCalendar({
  holidays: jp,
  closedRecurring: [
    { weekday: 1, name: "Closed on Mondays", effectiveTo: "2027-03-31" },
    { weekday: 2, name: "Closed on Tuesdays", effectiveFrom: "2027-04-01" },
    { weekday: 3, interval: 2, anchor: "2026-01-07", name: "Closed every other Wednesday" },
  ],
  closedAnnual: [{ from: "08-13", to: "08-16", name: "Summer closure", effectiveTo: "2026-12-31" }],
});

shop.isBusinessDay("2027-03-29"); // false (Monday, before the change)
shop.isBusinessDay("2027-04-06"); // false (Tuesday, after the change)
shop.addBusinessDays("2027-03-30", 3); // "2027-04-03" (counts across the change; March 31 is an every-other-week Wednesday)
shop.isBusinessDay("2027-08-13"); // true (the summer closure ended in 2026)
```

- Outside its period a rule is simply not applied; the order of priority does not change. A rule with only `effectiveFrom` or only `effectiveTo` is open-ended on the other side
- An `"after-holiday"` rule is judged by the date it would originally apply to: if that date is within the period, the rule is moved to the next non-holiday even when that day is outside the period
- Changing the closed weekday is written as two weekly rules with periods, as above, rather than with `closedWeekdays` (which has no period)

**What happens on a holiday** (`onHolidayRule`) is chosen per rule.

| Value                       | Meaning                                                                   | How a store would announce it                           |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| `"under-holiday"` (default) | Under the holiday: follows the holiday handling (`holidayPolicy`)         | "Closed on the 3rd Wednesday (open if it is a holiday)" |
| `"over-holiday"`            | Over the holiday: applies even on holidays                                | "Closed on the 3rd Wednesday (holidays included)"       |
| `"after-holiday"`           | After the holiday: not applied on holidays, moved to the next non-holiday | "Closed on Mondays (on the next weekday if a holiday)"  |

- With `holidayPolicy: "ignore"` (holidays not used), `"under-holiday"` rules also apply on holidays
- The day an `"after-holiday"` rule moves to is the first non-holiday on or after that day. After a run of holidays (such as Golden Week) it is the day after the run. Specific open or closed days and annual closures on that day take priority. `dayInfo()` for a moved day includes the original date as `shiftedFrom`
- The "holidays" used for moving are only those of the holiday provider (such as `jp`), not annual closures

In a schedule, the same patterns with a `value` go in `recurring`.

```ts
const hours = createSchedule<Hours>({
  holidays: jp,
  weekly: [sunday, weekday, weekday, weekday, weekday, weekday, weekday],
  recurring: [
    { weekday: 1, value: null, name: "Closed on Mondays", onHolidayRule: "after-holiday" },
    { day: -1, value: { open: "10:00", close: "17:00" }, name: "Short hours at month end" },
  ],
});
```

### Common recipes

**Treat citizens' holidays (days between two holidays) as business days**: wrap the holiday provider and filter by kind.

```ts
import { jp } from "bizdays-toolkit/jp";

const jpWithoutCitizensHoliday = {
  ...jp,
  holidaysInYear: (year: number) => jp.holidaysInYear(year).filter((h) => h.kind !== "citizens"),
};
const calendar = createCalendar({ holidays: jpWithoutCitizensHoliday, closedWeekdays: [0, 6] });
```

**Split special days kept in one list**: dates (`"YYYY-MM-DD"`) go in `dates` and annual dates (`"MM-DD"`) in `annual`.

```ts
type Hours = { open: string; close: string } | null;
const regular: Hours = { open: "10:00", close: "19:00" };
const specialDays: { date: string; value: Hours }[] = [
  { date: "2026-12-31", value: { open: "10:00", close: "17:00" } },
  { date: "01-01", value: null },
];
const special = createSchedule<Hours>({
  weekly: [regular, regular, regular, regular, regular, regular, regular],
  dates: specialDays.filter((d) => d.date.length === 10),
  annual: specialDays.filter((d) => d.date.length === 5),
});
special.valueOn("2027-01-01"); // null
```

**Build per-store calendars from shared options**: options are plain objects, so spread and extend them.

```ts
const base = {
  holidays: jp,
  closedWeekdays: [0],
  closedAnnual: [{ from: "12-31", to: "01-03" }],
} as const;
const shibuya = createCalendar({ ...base, openDates: ["2026-12-27"] });
const yokohama = createCalendar({ ...base, closedRecurring: [{ weekday: 3, nth: 3 }] });
```

### Month-based due dates and date adjustment

Dates that fall on closed days are adjusted to business days with the convention you choose. The nth business day of a month and due dates such as "the nth of every month (next business day if closed)" are also available.

```ts
import { closingMonth, createCalendar, monthOf } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const calendar = createCalendar({
  holidays: jp,
  closedWeekdays: [0, 6],
  closedAnnual: [{ from: "12-31", to: "01-03", name: "New Year closure" }],
});

calendar.adjust("2026-10-31", { convention: "following" }); // "2026-11-02" (Oct 31 is a Saturday)
calendar.adjust("2026-10-31", { convention: "modified-following" }); // "2026-10-30" (the month would change, so backwards)

calendar.firstBusinessDayOfMonth("2027-01"); // "2027-01-04"
calendar.lastBusinessDayOfMonth("2026-12"); // "2026-12-30"
calendar.nthBusinessDayOfMonth("2026-10", 5); // "2026-10-07" (-1 is the last, -2 the second to last)

// Paid on the 10th of every month (next business day if closed)
calendar.dueDate("2026-10", { day: 10, convention: "following" }); // "2026-10-13" (Oct 12 is Sports Day)

// Closing on the 20th, paid at the end of the next month (previous business day if closed)
const billing = closingMonth("2026-10-21", 20); // "2026-11" (Oct 21 to Nov 20 belongs to November)
calendar.dueDate(monthOf(billing, 1), { day: -1, convention: "preceding" }); // "2026-12-30"
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

- `monthOf(dateOrMonth, offset?)`: the month `offset` months after (before, if negative) a date or a month `"YYYY-MM"`
- `closingMonth(date, closingDay)`: the month a date belongs to when months are closed on `closingDay` (1–31, `-1` for the last day). The day after a closing day up to the next closing day belongs to the month of the next closing day. If the closing day does not exist in a month (closing on the 31st in February), the last day is used

The `day` of `dueDate` also maps days that do not exist in a month (such as February 30) to the last day. Recurring rules (`{ day: 31 }`) do not match such days, so the two behave differently: a due date must always fall somewhere in its month.

### Day-by-day values (e.g. store hours)

`createSchedule` returns any value per day from weekday, holiday and specific-date rules. The value type is up to you, so it also fits booking slots, delivery fee classes and more.

```ts
import { createSchedule } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

type Hours = { open: string; close: string } | null; // null means closed
const weekday = { open: "10:00", close: "21:00" };
const sunday = { open: "10:00", close: "19:00" };

const storeHours = createSchedule<Hours>({
  holidays: jp,
  weekly: [sunday, weekday, null, weekday, weekday, weekday, weekday], // [Sun, Mon, …, Sat]; closed on Tuesdays
  holiday: { sameAs: 0 }, // Sunday hours on holidays ("weekday": by weekday / { value: … }: a fixed value)
  annual: [{ date: "01-01", value: null, name: "Closed on New Year's Day" }], // annual dates (ranges too)
  dates: [{ date: "2026-12-31", value: { open: "10:00", close: "17:00" }, name: "New Year's Eve" }],
});

storeHours.valueOn("2026-11-03"); // { open: "10:00", close: "19:00" } (Culture Day uses Sunday hours)
storeHours.dayInfo("2027-01-01");
// { date: "2027-01-01", weekday: 5, value: null, reason: "annual", name: "Closed on New Year's Day", holiday: {…} }

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

`reason` is the rule that decided the value. With `holiday: "weekday"` (holidays follow the weekday rule), a holiday has `reason: "weekday"`, so check `holiday` to know whether a day is a holiday. Filtering by `holiday` alone also keeps holidays whose value is set by `dates` or `annual` (such as special hours on New Year's Day). To list only holidays that follow the holiday handling, also exclude `reason` `"date"` and `"annual"`, as in the last example: `holiday` tells whether the day is a holiday, and `reason` tells which rule decided the value.

Values are decided in the order `dates` (specific dates and ranges) → `annual` (annual dates and ranges) → `recurring` (`"over-holiday"`) → holidays → `recurring` (default and moved days) → `weekly` (weekday). When rules of the same type overlap, the one written first in the array wins.

Checking a time range such as "is the store open now" is left to your app, because industries differ (opening past midnight, breaks and so on). With `civilOf` you get the civil date and time in the time zone, and the check is short.

```ts
const { date, time } = storeHours.civilOf(new Date()); // { date: "2026-10-14", time: "16:30" } (Japan time)
const hours = storeHours.valueOn(date);
const isOpen = hours !== null && hours.open <= time && time < hours.close;
```

For inputs that always carry a time (a `Date`, Temporal `Instant`, `ZonedDateTime` or `PlainDateTime`, or a `"YYYY-MM-DDTHH:mm"` string), `time` is typed as `string`, so no `null` check is needed. `civilOf` is also on business-day calendars, and the same conversion is available as `toDateTimeParts(input, timeZone)` in the root. (`toJapanDate` and `toJapanDateTime` in `bizdays-toolkit/jp` are deprecated since 0.10.0: use `toDateString(input, "Asia/Tokyo")`, `toDateTimeParts(input, "Asia/Tokyo")` or `dateOf`/`civilOf` on a calendar instead. They will be removed in 1.0.0.)

### Date and date-time inputs

Every method accepts the following inputs. Returned dates are always `"YYYY-MM-DD"` strings.

| Input                                                | Treated as                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `"2026-11-23"`                                       | A civil date                                                      |
| `"2026-11-23T10:00"`                                 | A date and time in the calendar's time zone (wall clock)          |
| `"2026-11-22T15:30:00Z"`, `"2026-11-23T00:30+09:00"` | An instant, converted to a civil date in the calendar's time zone |
| `Date`                                               | An instant                                                        |
| Temporal `PlainDate`, `PlainDateTime`                | A civil date or date and time (no dependency on Temporal)         |
| Temporal `Instant`, `ZonedDateTime`                  | An instant                                                        |

Temporal objects are recognized by their shape, so the package does not depend on Temporal. CI also checks real Temporal objects in the runtimes that provide Temporal (the CI log shows whether each runtime had it).

The calendar's time zone is the `timeZone` option, then the holiday provider's time zone, then `"UTC"`.

### Holidays of other countries and regions

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

### Outside the supported years

Evaluating a date outside the holiday provider's supported years (1955–2099 for Japan, 2012–2099 for the UK) throws a `RangeError`. To treat such dates as having no holidays, set `outOfRange: "ignore"`.

### Errors

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

Main codes: `invalid-date`, `invalid-input`, `invalid-month`, `invalid-month-day`, `invalid-time`, `invalid-range`, `invalid-weekday`, `invalid-time-zone`, `invalid-option`, `out-of-range`, `invalid-provider`, `invalid-provider-data`, `no-business-day`. Future versions may add codes.

### Option diagnostics

`diagnoseCalendar` and `diagnoseSchedule` from `bizdays-toolkit/diagnose` examine options and return a list of problems. They never throw (an empty array means no problems).

```ts
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { jp } from "bizdays-toolkit/jp";

diagnoseCalendar({
  holidays: jp,
  closedWeekdays: [0],
  closedRecurring: [
    { weekday: 3, nth: 3, name: "Closed on the 3rd Wednesday" },
    { weekday: 3, nth: 3, months: [8], name: "3rd Wednesday in August" }, // covered by the previous rule
    { weekday: 0, name: "Closed on Sundays" }, // same as the closed weekday
  ],
  closedDates: ["2100-01-05"], // outside the supported years of Japanese holidays (1955–2099)
  closeAnnual: ["12-31"], // a typo
});
// [
//   { severity: "warning", code: "unknown-option", path: "closeAnnual", message: '… (did you mean "closedAnnual"?)' },
//   { severity: "warning", code: "out-of-range", path: "closedDates[0]", relatedPath: "holidays", message: "…" },
//   { severity: "warning", code: "shadowed", path: "closedRecurring[1]", relatedPath: "closedRecurring[0]", message: "…" },
//   { severity: "info", code: "redundant", path: "closedRecurring[2]", message: "…" },
// ]
```

| `severity` | `code`                       | Meaning                                                                                                                                                            |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error`    | The same codes as exceptions | Errors that make `createCalendar` or `createSchedule` throw. Creation stops at the first one; diagnostics return them all                                          |
| `error`    | `invalid-provider-data`      | Errors in the data returned by a holiday provider. Creation checks only the years used; diagnostics check every supported year                                     |
| `warning`  | `unknown-option`             | Unknown keys (ignored at creation). If a close known key exists, `message` suggests it                                                                             |
| `warning`  | `shadowed`                   | A rule fully covered by an earlier rule of the same type (`relatedPath`) and never used                                                                            |
| `warning`  | `never-matches`              | A recurring rule that matches no day (such as `{ day: 30, months: [2] }`, or a 5th Wednesday with an effective period that has none)                               |
| `warning`  | `out-of-range`               | A specific date, or the effective period of a rule, outside the supported years of the holiday provider (`relatedPath`)                                            |
| `warning`  | `no-business-day`            | No business day at all (calendars only; searching for a business day throws)                                                                                       |
| `info`     | `redundant`                  | A rule whose removal changes nothing (covered by a combination of earlier rules, same as a closed weekday, the same value as the weekday in a schedule, and so on) |

- Branch on `code`. `message` is in English and its wording may change. Future versions may add codes
- When there is an `error`, the rule relation checks (`shadowed`, `redundant` and so on) are skipped
- `shadowed` compares only rules of the same type (specific dates, annual dates, recurring rules). The order of evaluation is fixed, so rules unused across types are found as `redundant`. Specific open days (`openDates`) and specific closed days (`closedDates`) are of the same type, and a closed day covered by an earlier open day is `shadowed`
- `shadowed` for recurring rules also considers `onHolidayRule`. For example, an `"under-holiday"` rule does not cover an `"over-holiday"` rule on the same days (the later rule applies on holidays)
- `shadowed` for rules with effective periods also requires the earlier rule's period to contain the later rule's period, and for `interval` rules the earlier rule's cycle to contain the later one (a weekly rule covers an every-other-week rule; two every-other-week rules with opposite phases do not cover each other)
- `redundant` compares the results with and without the rule day by day. Specific dates are checked over their range; annual dates and recurring rules are checked, with specific dates removed, over the holiday provider's supported years (1955–2099 for Japan), or 2001–2028 without a provider (28 years cover every combination of weekday and date; with `interval` rules the range is extended to the length of their cycle, such as 56 years for every other week). Effective periods outside that range are checked as well (with `outOfRange: "throw"`, only within the supported years). `message` names the years checked. Schedule values are compared by content for arrays and plain objects, and by identity otherwise (such as `Date`)
- With Japanese holidays, checking every day takes a few hundred milliseconds. Use it in tests or at startup, not per request. As a development and test tool, it lives in a subpath so it stays out of your app's main bundle

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

## Versioning and data updates

Versioning follows [Semantic Versioning](https://semver.org/). See [RELEASING.md](https://github.com/inohan77/bizdays-toolkit/blob/main/RELEASING.md) (Japanese) for details.

- Official data updates (new, moved and one-off holidays by law, Official Gazette or proclamation, fixed equinox days in Japan, newly published years on GOV.UK) are released as **patch** versions, so they reach you with either `^` or `~`
- To freeze the holiday results, pin an exact version (for example `"bizdays-toolkit": "0.8.0"`)
- The reflected data is shown by `dataVersion` (for Japan, the year and month of the Official Gazette reflected; for the UK, the year and month of the GOV.UK data reflected) and `confirmedThrough`
- Before 1.0.0, minor versions may contain breaking changes. What you need to change when moving between minor versions is listed in the [migration guide](https://github.com/inohan77/bizdays-toolkit/blob/main/docs/migration.md) (Japanese) and in the "移行" (migration) part of each version in the CHANGELOG
- Decision reasons (`reason`), holiday kinds (`kind`), error codes and diagnostic codes may gain values in future versions. When you branch on their values, handle "anything else" too (see "互換性の約束", the compatibility promise, in [RELEASING.md](https://github.com/inohan77/bizdays-toolkit/blob/main/RELEASING.md))

## Data sources

Japanese holidays are verified with the "National Holidays" CSV published on the Cabinet Office website (<https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>) (as a test fixture only; not included in the package).

UK bank holidays are verified with the GOV.UK bank holidays data (<https://www.gov.uk/bank-holidays.json>, and for earlier years the history of the official GOV.UK repositories [alphagov/calendars](https://github.com/alphagov/calendars) and [alphagov/frontend](https://github.com/alphagov/frontend)), and the Welsh names of the Wales holidays with the Welsh version of GOV.UK (the verification data is a test fixture only; not included in the package).

Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

## License

MIT
