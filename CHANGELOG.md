# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/) and the policy in [RELEASING.md](./RELEASING.md). Besides the Keep a Changelog sections (Added / Changed / Deprecated / Removed / Fixed / Security), **Data** lists updates of the holiday data and **Migration** lists the work users need to do for a minor version.

Entries from 0.31.0 are in English. Earlier entries remain in Japanese (their **Migration** headings were renamed from 移行 in 0.31.0, and their section **開発** corresponds to the development notes). Development notes for 0.30.x and later (changes to the quality tooling that do not change the published package: checks, CI, release steps) are in [docs/development-log.md](./docs/development-log.md) (in Japanese; not published to npm). For versions before 0.30.0 (0.22.x and earlier), they are in the 開発 section of each version below.

## [Unreleased]

## [0.32.0] - 2026-11-14

This minor version stops one silent loss of closed days, makes aliases of a time zone the same time zone on runtimes with Temporal, and makes one mistaken call a type error. Some code needs a check; see Migration.

### Changed

- A day of a `holidayOverlapPolicy: "after-holiday"` rule that cannot be moved past a long run of holidays now throws instead of being silently lost. When a holiday provider returns holidays on more than 31 consecutive days and the rule's own day is more than 31 days before the first day after the run, the rule was not moved and the closed day did not appear at all (documented since 0.31.8). Evaluating that first day now throws a `RangeError` with the new code `holiday-run-too-long`, as do searches that pass the day (`addBusinessDays`, `nextBusinessDay` and the like) and calculations over a range that contains it (`diffBusinessDays`, `daysBetween`, `businessDatesBetween`, `nthBusinessDayOfMonth` and the like). Days inside the run and other days are evaluated as before, a rule whose day is within 31 days is moved as before, and weekly rules and rules for the day before or after a holiday are not affected. The same code is thrown when a run goes on for more than 367 days, because the day to move cannot be determined. Because the search for that day now goes further back than 31 days, the first day after a run of 31 or more days that starts on the first day of the provider's supported years throws `out-of-range` with `outOfRangePolicy: "throw"` (the default), even when no day is lost: the days before the run are not known. Shorter runs there already did. The bundled providers are not affected (their longest run is 8 days). Write a long closure with `closedDates` or `closedAnnualDates`, not as holidays (design decisions 24)
- Whether two time zones are the same (calendars combined with `combineCalendars`, the holiday providers of one set of options, and a schedule and the counting calendar of its nth-business-day rule) is now decided with the runtime's `Temporal` when their names differ and the runtime has one. Aliases of one time zone, such as `"UTC"` and `"Etc/UTC"` or `"Asia/Kolkata"` and `"Asia/Calcutta"`, are therefore the same time zone on every runtime with Temporal: Bun no longer throws `time-zone-conflict` for them, and on Node.js 26, Chrome and Edge a few more pairs are accepted (such as `"CST6CDT"` and `"America/Chicago"`). Runtimes without Temporal compare the names `Intl` reports, as before; on Safari without Temporal, aliases remain a `time-zone-conflict`. The name `timeZone` returns is unchanged. Only exceptions disappear; no result of a calendar or schedule changes (design decisions 18)
- TypeScript: passing a holiday provider, a calendar or a schedule itself as the options of `createCalendar` (`createCalendar(jp)`) is now a type error. It compiled until 0.31.9 and made a calendar without holidays. The options types have `holidaysInYear?: never` for this; at run time such a key is still an unknown option that the diagnostics report (design decisions 8). Pass the provider as `createCalendar({ holidayProvider: jp })`

### Added

- The error code `holiday-run-too-long` (`KnownErrorCode`), and the same code as a `warning` of the option diagnostics: `diagnoseCalendar` and `diagnoseSchedule` report each `"after-holiday"` rule that loses a day this way, at the rule, with `relatedPath` pointing to the holiday provider when there is only one. The options can still be created, as with `out-of-range` and `no-business-day`

### Fixed

- Documentation: the guide and the design decisions (18) now describe offsets from UTC as time zones. `"+09:00"`, `"+0900"` and `"+09"` are accepted and returned as `"+09:00"` on every runtime tested (Node.js, Chrome, Firefox, Edge, Safari, Cloudflare Workers, Bun and Deno); other forms such as `"UTC+9"` are an `invalid-time-zone`, and an offset and a named time zone are different time zones. The README now notes the Safari limitation above. The design decisions (18) now say that duplicate providers and duplicate calendars are deliberately treated differently. Results are unchanged

### Migration

Check your code if one of these applies; otherwise no work is needed. The same steps are in [docs/migration.md](./docs/migration.md) (in Japanese).

- **You use your own holiday provider that returns holidays on more than 31 consecutive days, together with `"after-holiday"` rules.** Run `diagnoseCalendar` or `diagnoseSchedule` on your options and look for a `warning` with code `holiday-run-too-long`. If there is one, the first day after the run now throws, and so does every search that passes it and every calculation over a range that contains it: one lost day stops a count over the whole year. Write the long closure with `closedDates` or `closedAnnualDates` instead of returning it as holidays
- **You branch on `time-zone-conflict`.** Aliases of one time zone no longer throw on runtimes with Temporal. Remove code that relies on the exception
- **You pass a holiday provider, a calendar or a schedule directly to `createCalendar` in TypeScript.** Pass the provider as `{ holidayProvider: provider }`; a calendar or schedule was never read as options
- **You branch on error codes.** Make sure the new `holiday-run-too-long` falls into your default branch

## [0.31.9] - 2026-11-14

This version removes two wrong diagnostics, makes evaluation and the option diagnostics faster, and documents how time zone names are compared. Results of calendars and schedules do not change.

### Fixed

- The option diagnostics reported `never-matches` (a warning) for a recurring rule that does match, when its effective period is open on one side and the 28 years scanned from the other end reach a year divisible by 100 but not by 400 (such as 1900 or 2100). For example, `{ weekday: 1, nth: 5, months: [2], effectiveFrom: "2073-01-01" }` first matches on 2112-02-29, and removing the rule as the warning suggested changed that day. Such a period is now scanned for 56 years, which contain every combination of weekday and date, and `redundant` is decided over the same range. The guide and the design decisions (31) described this as a limit in 0.31.7 and now describe the new range; rules with `interval` or `cycle` remain an approximation across such a year. Only the wrong warning disappears (a wrong diagnostic may disappear in a patch version; design decisions 33)
- `diagnoseSchedule` returned a second `error`, a `time-zone-conflict` at the `calendar` of an nth-business-day rule, when the time zone of the schedule itself could not be determined (an invalid `timeZone`, or holiday providers with different time zones and no `timeZone`). It compared the calendar with a placeholder that the options do not mention (`"UTC"`, or the time zone of the first provider). It now returns only the error at `timeZone`, the one that `createSchedule` throws (design decisions 30). A conflict with a valid `timeZone` is reported as before
- Documentation: the guide, the type descriptions of `HolidayLookup.timeZone` and of `time-zone-conflict` in `KnownErrorCode`, and the design decisions (18) now say that `timeZone` returns the name the runtime's `Intl` reports, which can differ from the spelling in the options and from one runtime to another, and that time zones are compared by that name. Aliases of one time zone (such as `"UTC"` and `"Etc/UTC"`, or `"Asia/Kolkata"` and `"Asia/Calcutta"`) are therefore accepted on Node.js but are a `time-zone-conflict` on a runtime that does not turn aliases into one name (confirmed on Bun 1.4.3 and Safari 27.2). Results are unchanged. Write the same spelling wherever time zones must match; which time zones count as the same will be defined in the next minor version
- Documentation: the design decisions said that a mistyped option is a type error in TypeScript (8). That holds only for options written as an object literal: passing a holiday provider or a calendar itself as the options (`createCalendar(jp)`) compiles and makes a calendar without holidays, and the diagnostics report `unknown-option`. The design decisions also said that the supported years do not matter to the diagnostics (17) and that effective periods outside the scanned range are scanned (31); with `outOfRangePolicy: "throw"` only the supported years are scanned, as the guide said. The design decisions (18) now give the reasons why `combineCalendars` throws for fewer than two calendars and for the same calendar twice, and the guide says to remove duplicates before handling the case of one calendar. The bundle sizes in the README were measured again for 0.31.9

### Changed

- Evaluating a day and the option diagnostics are faster. The date string of the day was parsed again by every step of the evaluation and by every rule; the last parsed date is now remembered. The parsed result depends only on the string, so results are unchanged (design decisions 16)

## [0.31.8] - 2026-11-13

This version fixes one input that was silently accepted and corrects type descriptions and documents. Results of calls that were written correctly do not change.

### Fixed

- A Temporal-like date-time whose `hour` was `null`, a string or another value that is not a number (such as `{ year: 2026, month: 12, day: 28, hour: "15", minute: 30 }`) was read as a date without a time, so `civilOf` returned `time: null` and a check such as `open <= time` was silently false. It now throws `invalid-time`, as `minute: null` does since 0.31.7 (design decisions 6). A Temporal-like value with `minute` but without `hour` is still read as a date. If you build the value from a form or a database, convert `hour` to a number first
- Type descriptions: `KnownErrorCode` now says that `no-business-day` also covers an nth business day that the month does not have and a calendar's closing month without its own period, and that `time-zone-conflict` also covers calendars combined with `combineCalendars` and the basis calendar of a schedule's nth-business-day rule (where the fix is to make them with the same time zone, not to set `timeZone`). `HolidayProvider` now describes long runs of holidays as below
- Documentation: the provider guide, the description of `HolidayProvider` and the design decisions (24) said that within a run of holidays longer than 31 days, rules for the day before or after a holiday do not match and `"after-holiday"` rules are not moved. In fact rules for the day before or after a holiday match the day before and the day after a run of any length, and an `"after-holiday"` rule is not moved only when its own day is more than 31 days before the first day after the run. The documents now say so; results are unchanged
- Documentation: the guide listed 2008 and 2059 as the years when two French holidays fall on the same day; Ascension Day also falls on May 8 in 2070, 2081 and 2092. The English README said that years after a provider's supported range are an error; years before it are too. The provider guide said that the four exceptional keys keep a word the rule would drop; `new-year` drops the possessive "s" as well. The design decisions (1, 3, 9) now list every case of `out-of-range`, describe `invalid-input` as a value in none of the accepted forms, and describe the functions that fix an argument of another by what they are rather than by name. Results are unchanged

## [0.31.7] - 2026-11-12

This version makes three kinds of options that were silently accepted throw, as the design decisions (6, 8) promise, gives a code to the remaining exceptions without one, and corrects documents. Options that were written correctly give the same results as before. Options that write both a single date and a range in one entry, write `null` in one of seven options, or have a hole in an array now throw; each item below says how to rewrite them.

### Fixed

- An entry of `closedDates`, `openDates` and `closedAnnualDates` (and of a schedule's `dates` and `annualDates`) with both a single date (`date`) and a range (`from`/`to`), such as `{ date: "12-31", from: "12-29", to: "01-03" }`, was accepted and used only `date` (the diagnostics reported `from` and `to` as unknown options). It now throws `invalid-option` ("cannot have both"), and the diagnostics return it as an `error`, as the design decisions (8) say for conflicting options. Keep the form you mean and remove the other; an explicit `undefined` is still the same as leaving the key out
- `null` in seven options was silently replaced with the default, while `null` in every other option threw: `holidayPolicy` and `searchDayLimit` of `createCalendar`, `searchDayLimit` of `combineCalendars` and `createCalendarFromSchedule`, `outOfRangePolicy`, `unconfirmedHolidayPolicy`, and `holidayOverlapPolicy` of a recurring rule. They now throw `invalid-option` like other values the types do not accept, and the diagnostics return it as an `error`; the minute of a Temporal-like date-time (`minute: null`) now throws `invalid-time` instead of reading as 0. The design decisions (6) now say that `null` is not the same as leaving an option out (only `undefined` is; a schedule's `value: null` is still a value). If you wrote `null`, remove the key or write `undefined`
- A hole in an array (`[a, , b]`) was skipped in the options (`closedDates`, `openDates`, `closedAnnualDates`, the rules, `closedWeekdays`, `months`, `nth`, `weekdays`, `skipWeekdays` and the like, and a list of holiday providers), so a date or a rule left out of the array was silently lost, and `combineCalendars` with a hole threw `time-zone-conflict` instead of `invalid-argument`. A hole is now checked like an explicit `undefined` element and throws the same code; the design decisions (6) now say so. A hole in a schedule's `weekdayValues` is still the value `undefined`. If you build arrays by index, fill every element
- `monthOf` read only a string with exactly three hyphen-separated parts as a date, so a date-time string with an offset (such as `"2026-11-05T10:00-05:00"`) or `"2026-1-1-1"` threw `invalid-month`, while `closingPeriod` threw `invalid-date` for the same string (0.31.6). `monthOf` now reads strings the same way (three or more parts are a date); the design decisions (8) now list it. Valid months and dates give the same results
- The minute of a Temporal-like date-time that cannot be turned into a string (such as an array with a symbol) threw a `TypeError` without a `code` while building the message. It now throws `invalid-time`
- `diagnoseSchedule` did not report unknown keys inside the object of `holidayPolicy` (such as `{ value: null, sameAS: 0 }`, a typo of `sameAs`), although the design decisions (8) say that typos are found as `unknown-option`. It now reports them; the results are unchanged. The design decisions (31) now say that adding such a check where it was missing is a fix, not a new kind of diagnostic
- Type descriptions: `Diagnostic.relatedPath` now also describes `redundant` (the rule that decides instead) and `counting-basis` (the weekday rule that the count leaves out). `toInstant` and `instantOf` now say that the offset from UTC is used to the minute (in a period whose offset is not a whole number of minutes, such as local mean time or Liberia until 1972, the result can be up to 59 seconds off). The first sentence of `createCalendarFromSchedule` now ends with a full stop
- Documentation: the guide says the same about `toInstant`, and the guide and the design decisions (31) now say that the 28 years scanned by the diagnostics cover every combination of weekday and date only when they do not cross a year such as 2100 (which holds within 1901–2099); a rule with an open-ended effective period starting after 2072 can be reported as `never-matches` when it matches only in a later leap year. Results are unchanged

### Changed

- The npm keywords now also include `public-holidays`, `timezone` and `typescript`

## [0.31.6] - 2026-11-12

This version fixes option diagnostics that returned an `error` for options that can be created, exceptions without a `code`, and the code for malformed strings in `closingPeriod`, and corrects documents. Results of calls that already succeeded do not change; some calls that threw an exception without a `code` now throw one with a `code`, and a calendar's `closingPeriod` now reports a malformed month string as `invalid-month`.

### Fixed

- `diagnoseCalendar` and `diagnoseSchedule` returned an `error` (`out-of-range`, at `holidayProvider` even without a provider) for options with an effective period that starts or ends near the edge of the years 1000–9999 and is open on the other side (such as `effectiveFrom: "9999-12-31"` or `effectiveTo: "1000-06-01"`), although `createCalendar` and `createSchedule` accept such options. The diagnostics widened the period by the rule's cycle beyond those years. `diagnoseSchedule` returned the same `error` for a schedule with a `businessDayOfWeek` rule and a holiday provider whose supported years reach 1000 or 9999, because the first and last weeks run past those years. The diagnostics now keep the scan within 1000–9999; a day at the edge whose rule looks at a day outside those years does not match, and in a schedule the days of such a week are treated as days whose rules cannot be judged; the design decisions (17) now say so. An `out-of-range` thrown by a provider elsewhere is still reported as before
- `diagnoseSchedule` returned an `error` (`invalid-provider-data`, "Maximum call stack size exceeded") for a schedule whose values contain a cycle (such as an object that refers to itself), although `createSchedule` accepts it. Values are now compared with cycles taken into account (two cyclic values of the same shape are the same); values nested too deeply to compare are treated as different, so the diagnostics never report them as `redundant`
- A holiday provider that returned an array with holes, and `withSubstituteDays` given such an array, threw a `TypeError` without a `code` ("Cannot read properties of undefined"). A hole is now checked like an item that is not an object: evaluations throw `invalid-provider-data`, the diagnostics return it as an `error`, and `withSubstituteDays` throws `invalid-argument`, each as a `RangeError` (it was a `TypeError`); use `isBizdaysError` and `code` rather than `instanceof TypeError`
- An instant written as `{ epochMilliseconds }` beyond the range of `Date` (more than 8.64e15 milliseconds from 1970, such as `1e20`) threw `RangeError: Invalid time value` without a `code`; it now throws `out-of-range`. A Temporal-like date whose `calendarId` is not a string (such as a symbol) threw a `TypeError` without a `code`; it now throws `invalid-input` like other calendars (the message shows the value as other messages do)
- A calendar's `closingPeriod` read only `"YYYY-MM"` as a month and any other string as a date, so a malformed month (such as `"2026-1"`) threw `invalid-date`, while the function `closingPeriod` threw `invalid-month`. Both now read a string with three or more parts separated by hyphens as a date (or date-time) and any other string as a month, so `"2026-1"`, `"202611"` and `"2026/11"` throw `invalid-month` in both; the rule is now written in the design decisions (8). The function `closingPeriod` now throws `invalid-date` instead of `invalid-month` for a date-time string with an offset (such as `"2026-11-05T10:00-05:00"`), which it does not accept. Valid months, dates and date-times give the same results as before. If you branch on `invalid-date` for a malformed month passed to the method, branch on `invalid-month`
- Documentation: the provider guide, the description of `HolidayProvider` and the design decisions (24) now say that, within a run of holidays longer than 31 days, `"after-holiday"` rules are not moved and rules for the day before or after a holiday do not match (write a long closure with `closedDates` or `closedAnnualDates`); the guide already said that 31 days is the furthest a move reaches. The README now gives the bundle sizes measured for 0.31.6 (they were measured for 0.31.1). The guide and the design decisions (1) now say that evaluating a day inside the years 1000–9999 throws `out-of-range` when the evaluation needs a day outside them (the neighbouring day of a rule for the day before or after a holiday, the days an `"after-holiday"` rule looks back on, the week of `businessDayOfWeek`, the start of a closing period), with or without a holiday provider and with `outOfRangePolicy: "ignore"` too, because those days do not exist as dates; the guide described only searches that leave those years. Results are unchanged

## [0.31.5] - 2026-11-11

This version fixes results and errors that did not keep the guide, the type descriptions and the design decisions, and corrects documents. Schedules with `value: undefined` in a specific date, an annual date or a recurring rule now return `undefined` on those days, a wrong weekday number in three places now throws `invalid-weekday` instead of `invalid-option`, a schedule with both `sameAs` and `value` in `holidayPolicy` now throws, and calls that took an instant in the years BC or a year outside 1000–9999 now throw `out-of-range`. Other results do not change.

### Fixed

- Schedules: a specific date, an annual date or a recurring rule written with `value: undefined` was dropped, so the day took the value of its weekday (for example, `dates: [{ date: "2026-12-31", value: undefined }]` returned the usual weekday value on 31 December, and a calendar made from the schedule with `(v) => v !== undefined` treated the day as open), while the guide says that `value: undefined` is the value `undefined` (as it already was in `weekdayValues` and `holidayPolicy`). These rules now apply and return `undefined` with their `reason` and `optionPath`. A rule without a `value` key still throws `invalid-option`. If you wrote `value: undefined` to mean "no rule", remove the rule
- A wrong weekday number in `weekStart`, and in an element of `weekdays` or `skipWeekdays` of a recurring rule (such as `7`, `-1`, `1.5` or `"1"`), threw `invalid-option`, while the same mistake in `closedWeekdays`, `weekday` and `holidayPolicy.sameAs` threw `invalid-weekday`. They now all throw `invalid-weekday` (the diagnostics report the same code); an empty array, a missing `weekStart` and a list with every weekday or with the rule's own weekday are still `invalid-option`. The rule is now written in the design decisions (8). If you branch on `invalid-option` for these, branch on `invalid-weekday`
- Schedules: `holidayPolicy` with both `sameAs` and `value` (such as `{ sameAs: 0, value: 99 }`, which can come from merging shared options deeply) silently used `sameAs`. It now throws `invalid-option`, as the design decisions (8) say for conflicting options. An explicit `sameAs: undefined` is now the same as leaving it out (design decisions 6): `{ sameAs: undefined, value: 9 }` uses the value, and `{ sameAs: undefined }` alone throws `invalid-option` (it threw `invalid-weekday`). `value: undefined` is still a value
- A Temporal-like date with a calendar other than ISO (such as `{ year: 2026, month: 11, day: 23, calendarId: "japanese" }`) threw `invalid-input` as a `RangeError`, while the design decisions (3) and the guide say that `invalid-input` is a `TypeError`. It is now a `TypeError` (the code is unchanged). If you caught it with `instanceof RangeError`, use `isBizdaysError` and `code`
- `migrateCalendarOptions` and `migrateScheduleOptions` treated an old name and its new name as a conflict when one of them was an explicit `undefined` (such as `{ closedAnnual: ["12-31"], closedAnnualDates: undefined }`), so they left the old name, which `createCalendar` reads without a conflict (design decisions 6). They now keep the one with a value under the new name, in either order of the keys. The elements of `changes` are now frozen, as the design decisions (4) say for returned objects
- An instant (a `Date` or a Temporal `Instant`) in the years 1000–9999 BC was converted to a date in the same year AD (for example, 15 January 1501 BC became `"1501-01-15"`), because the year was read without its era. It now throws `out-of-range`, as the design decisions (1) say. This affects every call that takes an instant, such as `toDateString`, `today`, `dateOf` and `isBusinessDay`, also with `outOfRangePolicy: "ignore"`
- `toInstant` and `instantOf` threw `out-of-range` for 1000-01-01 and 9999-12-31 (and, in some time zones, 1000-01-02 and 9999-12-30), although the date is within the years 1000–9999 (design decisions 1 limit dates; the instant itself may fall just outside those years in UTC, such as `+010000-01-01T10:59:00.000Z` for 9999-12-31 23:59 in `Pacific/Pago_Pago`). They now return the instant
- `holidaysInYear` of a calendar or a schedule without a holiday provider, or with `outOfRangePolicy: "ignore"` (and of calendars combined from them or made from such a schedule), returned an empty list for a year outside 1000–9999, while a calendar with the default policy threw `out-of-range`. It now throws `out-of-range` in every case; the rule is now written in the design decisions (1). If you relied on the empty list, check the year first
- Type descriptions: `searchDayLimit` (of `createCalendar`, `combineCalendars` and `createCalendarFromSchedule`) mentioned only the search for a business day; it now also says that `nextClosedDay` and `previousClosedDay` throw `no-closed-day` past the limit. `KnownErrorCode` now says that `out-of-range` also covers an instant outside the years 1000–9999 and a year outside them passed to `holidaysInYear`. `AnnualDate`, `AnnualRange`, `ScheduleAnnualDate` and `ScheduleAnnualRange` now say that a month and day that exists in no year (such as `"11-31"`) is `invalid-annual-date` and that `"02-29"` matches only in leap years. `wales` said that every holiday has a Welsh name; one-off bank holidays without a Welsh name on GOV.UK (such as the 2002 Golden Jubilee) have no `names.cy`
- Documentation: the README did not list `dataVersion` among the members of a holiday provider, although it is required (a provider without it throws `invalid-provider`). The guide and the design decisions (17) said that, with `unconfirmedHolidayPolicy: "throw"`, an nth-business-day rule evaluates every day of its month unless the options do not use holidays at all; in fact the count follows the calendar it is made on: a calendar counts on its options without its recurring rules, so its count looks up holidays only when `holidayPolicy` is not `"ignore"`, and a schedule's rule follows its `calendar`. The documents now say so; the behaviour is kept because it is the one that does not throw on days a prediction cannot affect (results are unchanged)
- Documentation: the design decisions (12) could be read as moving an annual date `"02-29"` to February 28 in other years; they now say that annual dates are not moved (as before, `"02-29"` matches only in leap years, and a month and day that exists in no year is `invalid-annual-date`), and the guide says the same. The guide's table of UK providers now says that Welsh names are included where GOV.UK has them, and the guide's section on the supported years now covers instants and the year of `holidaysInYear`. The design decisions (28) gave 1998 instead of 2000 as the first year of the government lists, and (4) now lists the returned objects that are not frozen (the `options` of the migration functions and the `Date` of `toInstant`). Results are unchanged

## [0.31.4] - 2026-11-10

This version fixes calls that threw on days that do not affect their result, makes duplicate holiday providers count once as the design decisions say, and corrects type descriptions, messages and documents. Results of calls that did not throw do not change.

### Fixed

- `adjust` with `"modified-following"` or `"modified-preceding"`, and `dueDate`, `closingMonth` and `closingPeriod` that use these conventions, looked at the next (or previous) month before searching the current month, so they threw on a day outside the month that cannot change the result: for example, `adjust("2028-12-30", { convention: "modified-following" })` on an English calendar with `unconfirmedHolidayPolicy: "throw"` threw `unconfirmed-holiday` for 1 January 2029, and on a Japanese calendar closed from 29 December to 3 January the same call for 2099-12-31 threw `out-of-range`; with a small `searchDayLimit`, a call threw `no-business-day` while searching a closed next month although the current month had a business day. They now search the current month first and cross the month only when it has no business day (design decisions 21). Returned dates are unchanged. A call that still throws may now throw a different code (`unconfirmed-holiday`, `out-of-range` or `no-business-day`), because the days are evaluated in a different order
- A calendar or a schedule given the same holiday provider object more than once (such as `[jp, jp]`) counted it twice, while the design decisions (24) say it is counted once: `providers` listed it twice and the option diagnostics reported the same provider error for each occurrence. Duplicates are now removed; diagnostics keep the position you wrote (`holidayProvider[2]` for the third entry), and when only one provider remains, as with `[jp, jp]`, they use `holidayProvider` as for a single provider. Holidays and business days are unchanged
- Error messages: `unconfirmed-holiday` said that "the result would depend on a predicted holiday", which is not always true (a search or an nth-business-day rule may look up a predicted holiday that does not change the result); it now says that the evaluation looked up a predicted holiday. The guide lists the days an nth-business-day rule evaluates
- Type descriptions: `unconfirmedHolidayPolicy` described when it matters with an outdated condition; it now refers to the guide. `ScheduleDayInfo.name` and `holiday` used option names from before 0.30.0. `outOfRangePolicy` and `unconfirmedHolidayPolicy` of `HolidayLookup` now say that a combined calendar shows a summary. `closedRecurringRules` and `recurringRules` listed only some of the rule forms; they now refer to the guide. `renameSubstitute` now says that `names` are kept even when the names are changed, as the design decisions (26) say
- Documentation: the provider guide and `withSubstituteDays` said only that a substitute day can move into the next year; with `"previous"` it can also move into the previous year, and the provider returns it as part of the year it falls in. The design decisions (2) now explain why the policies of a combined calendar have the closed type of the options
- Documentation: the type description of `combineCalendars` and the design decisions (18) still described the holidays of a combined calendar as the union of the providers; they now describe the current behaviour (each calendar is asked, and the holiday of the earlier calendar is taken). The design decisions (24) now state that the holidays of several providers given to one calendar are their union, keeping the holiday of the earlier provider on the same date. Results are unchanged

## [0.31.3] - 2026-11-09

This version fixes results that did not keep what the guide, the type descriptions and the design decisions promise. The results of valid calendars and schedules do not change, except that combined calendars no longer throw on days when none of their calendars throws.

### Fixed

- Combined calendars (`combineCalendars`) threw on days when none of their calendars throws: the holidays were looked up in the union of the providers with one policy ("throw" if any calendar throws), so the policy of one calendar was applied to the providers of another. For example, a calendar with `unconfirmedHolidayPolicy: "throw"` and Japanese holidays combined with an English calendar threw `unconfirmed-holiday` in `dayInfoOn` for a predicted English holiday, while `isBusinessDay` returned a result. `dayInfoOn`, `isHoliday`, `holidayOn`, `holidaysInYear` and `holidaysBetween` now ask each calendar and throw only when one of them throws, as the guide says (the holiday shown is still the one of the earlier calendar). The rule is now written in the design decisions (17). Calls that threw now return values; other results are unchanged. When two calendars throw for different reasons on the same day, the code is now the one of the earlier calendar
- `adjust`, `closingMonth` and `closingPeriod` took an array, a function or a `Date` carrying a `convention` as their options; like `dueDate`, they now take only a plain object and throw `invalid-argument` otherwise (design decisions 8). If you passed such a value, pass a plain object
- `withSubstituteDays` (`bizdays-toolkit/provider`): `directions` with an explicit `undefined` weekday (such as `{ 0: "next", 6: undefined }`) threw; it is now the same as leaving the weekday out (design decisions 6). `directions` given as a `Map` or an array was taken as empty and added no substitute days; it now throws `invalid-argument`. `directions` with all seven weekdays searched until the end of the supported years and threw `out-of-range`; it now throws `invalid-argument` at once. The `names` of the returned holidays were the input objects; they are now frozen copies, as the type description says. `names` of the input holidays and the `name` and `nameEn` returned by `renameSubstitute` are now checked (`invalid-argument`) instead of being returned as they are
- A Temporal-like date (`{ year, month, day }`) with a year that is not an integer from 1000 to 9999 threw `out-of-range`, while the same date as a string, and a wrong month or day, threw `invalid-date`. It now throws `invalid-date`; `out-of-range` is left for dates computed from an instant or by date arithmetic outside the years 1000–9999 (design decisions 1). If you branch on `out-of-range` for such input, branch on `invalid-date`
- Error messages: the `month`, `weekday` and `n` of `bizdays-toolkit/provider`, the `dayOfMonth` of `dueDate` and the `date` of `toInstant` are shown in quotes when they are strings, like the other values (the codes are unchanged)
- Documentation: the guide said that the separator `t` in date-time strings is part of the `DateTimeInput` type; the type has only the upper-case `T`, and a lower-case `t` is accepted at run time (the `time` returned by `civilOf` is then typed `string | null`). The guide now also says that the policies of a combined calendar are a summary and that it throws only when one of its calendars throws

## [0.31.2] - 2026-11-09

This version fixes results that were not consistent between functions or did not match the type descriptions, and corrects the documentation. The results of valid calendars and schedules do not change.

### Fixed

- The bundled providers' `holidaysInYear` (`jp`, the UK providers, the French providers and `sg`) threw `out-of-range` for a year that is not an integer (such as the string `"2026"`), while `KnownErrorCode` describes `out-of-range` as a year outside the supported range and the calendars and `bizdays-toolkit/jp` already threw `invalid-argument`. They now throw `invalid-argument`; an integer outside the supported years is still `out-of-range`. If you branch on `out-of-range` for a non-integer year passed to a provider, branch on `invalid-argument`
- `createCalendarFromSchedule` now throws `invalid-option` (was `invalid-argument`) when its options are not an object, like the other functions that create a calendar or a schedule, and like the errors inside its options. The rule is now written in the design decisions (8). If you branch on `invalid-argument` for this case, branch on `invalid-option`
- Options and option arguments given a `Date`, a `Map`, a `Set`, a `RegExp` or a boxed primitive were not handled in one way: `createCalendar` and `diagnoseCalendar` took such a value as empty options, and `diagnoseCalendar` and `diagnoseSchedule` took it as empty diagnose options, while `createSchedule`, the methods and `migrateCalendarOptions` rejected it. They are now all rejected like other values that are not an object: `invalid-option` for the options of a function that creates a calendar or a schedule (an `invalid-option` error in the result of the diagnostics), `invalid-argument` for other arguments. The functions that rewrite saved options (`migrateCalendarOptions`, `migrateScheduleOptions`) now also accept options created in another realm and objects created by a class, as the other functions do, and rename the rules inside them as well. The rule is in the design decisions (8). If you passed such a value to `createCalendar` to get a calendar with no options, pass `{}` or nothing
- Error messages: the functions of `bizdays-toolkit/provider` given a year that is not a number show it in quotes (`"2026"`), so that it does not read as the number 2026 (the code is unchanged)
- Type descriptions: `KnownErrorCode` now says which errors are `invalid-option` (the options of a calendar or a schedule, including options that are not an object) and which are `invalid-argument` (other arguments, including the options of a method), and that `out-of-range` is for dates computed outside the years 1000–9999, while a wrong year given to the functions of `bizdays-toolkit/provider` is `invalid-argument`. The `HolidayProvider` description promised that no required member would be added before a major version, which is stronger than the versioning policy for 0.x; it now refers to the policy (from 1.0.0, members added in a minor version are optional)
- Documentation: the migration guide and the guide did not say that the diagnostic code `deprecated-option` is removed in 1.0.0; the guide now explains which errors are `invalid-option` and which are `invalid-argument`, and that until 1.0.0 the result of `dayInfoOn` also carries the deprecated `businessDay` and `rulePath`; the provider guide now says that a substitute day can fall in the next year. The migration guide now says that patch versions need no work when you use the documented results, and that breaking changes before 1.0.0 come in minor versions

### Changed

- The type definitions no longer include internal declarations (`@internal`) that cannot be imported through the package exports

## [0.31.1] - 2026-11-08

This version fixes behaviour that did not match the documentation and corrects the documentation. The results of valid calendars and schedules do not change.

### Fixed

- Option diagnostics: `expired` (with `asOf`) was reported for a rule with `holidayOverlapPolicy: "after-holiday"` whose last day was moved past `effectiveTo` onto or after `asOf`, with a message saying that the rule no longer affects results (for example, a Monday rule ending on a Monday holiday still closes the Tuesday after). Such a rule is now `expired` only once more than 31 days have passed since `effectiveTo` (31 days is the furthest a day can be moved). Likewise, with a rule for the nth business day of the month or week counted on the calendar itself, a specific date or an annual date that ended could still move that nth business day later in its month or week; such an item is now `expired` only after the end of its month (with a monthly rule) or six days after its end (with a weekly rule). Fewer `expired` may be reported
- Date-time strings with an offset were read with the runtime's `Date.parse`, which differs between runtimes for forms that ECMAScript leaves to the implementation: Firefox and Safari threw `invalid-time` for a lowercase `t` or `z` (such as `"2026-11-22t15:30:00z"`), which the documented pattern accepts. The instant is now computed from the parts of the string, so every runtime gives the same result (fractions of up to 9 digits too)
- `diffBusinessDays` returned `-0` when `from` was after `to` and there was no business day between them; it now returns `0` (combined calendars and calendars made from a schedule too)
- Wrong arguments threw a `TypeError` without `code` instead of a `RangeError` with `code: "invalid-argument"`: `today` given something other than a `Date`, `businessDayOnOrAfter` given options that are not an object, and `createCalendarFromSchedule` given a schedule that is not an object or options that are not an object (these options were silently ignored before). Error messages for a Symbol or a BigInt argument no longer fail while being built (they threw a `TypeError` without `code`)
- Error messages: an hour of 24 is shown as written ("24:00", not "24:0"); a date-time string with seconds of 60 or more is reported as an invalid date-time string, like other malformed strings (the code is unchanged); the bundled providers' `holidaysInYear` given a year that is not an integer says so instead of reporting the year as out of range (the code is unchanged); `dueDate` and `combineCalendars` given options that are not an object say so (the codes are unchanged). Values in messages are written in one way: numbers as written (`NaN`, `Infinity`), strings in quotes, objects such as a `Date` or a `Map` by their kind, Symbols and BigInts readable
- Documentation: the `cutoff` TSDoc named the error class as `Error` (it is a `RangeError`); the guide and `KnownErrorCode` now mention that dates are limited to the years 1000–9999 (`out-of-range` outside them, also with `outOfRangePolicy: "ignore"`)

## [0.31.0] - 2026-11-08

This version rebuilds the `redundant` diagnostic so that the reported rules can be removed all together, narrows the days the diagnostics cannot judge, and brings in the changes postponed in 0.30.x that throw where nothing was thrown before or narrow a type (the return value of `isOpen`, the error classes, the frozen result of `withSubstituteDays`). It also adds the search for closed days.

### Added

- `Calendar.nextClosedDay(input)` and `previousClosedDay(input)`: return the next day after the input, or the previous day before it, that is not a business day. If none is found within `searchDayLimit` days, they throw a `RangeError` with the new code `no-closed-day`. Combined calendars and calendars made from a schedule have them too
- `BusinessDayOnOrAfterOptions.cutoff` accepts `"HH:mm:ss"`. The time of the input is taken to the minute (seconds are dropped) and compared at the start of that minute (with `"14:00:30"`, an input at 14:00 is before the cutoff)

### Changed

- Option diagnostics (`diagnoseCalendar`, `diagnoseSchedule`): `redundant` is now judged by sequential removal. Rules that are never used (`shadowed`, `never-matches` and the like) are removed first; then each rule (annual dates and recurring rules in array order, then specific dates) is judged with the rules already reported removed, and the pass is repeated until no other rule can be removed. The reported rules can be removed all together without changing any result (before, each rule was judged as if only that rule were removed: with the same rule written twice, the later one was `shadowed` and the earlier one `redundant`, and removing both changed the result). Impact: fewer `redundant` may be reported (for example, no `redundant` for the earlier of two identical rules), and in some settings more (for example, without closed weekdays, an open date that covers a closed date becomes `redundant` once the covered date is removed)
- Option diagnostics: `redundant` now has `relatedPath`, the rule that decides the days instead when the rule is removed, set only when one rule decides all of them (not when a closed weekday or the holiday handling decides some of them)
- Option diagnostics: the days the diagnostics cannot judge (where the counting calendar of a schedule's nth-business-day rule throws) are now found day by day and before the rules are compared: for a monthly rule, the days of the month where the calendar throws; for an nth business day of the week, the seven days of a week that touches such a month. Only rules whose effective period contains such a day get no `never-matches` or `redundant`, and they are not removed in the sequential removal. Before, the months next to such a month and the months of the 28 years used to compare rule shapes (2001–2028) were also treated as unknown, and the diagnostics were dropped after the comparison. Impact: in schedules with counting calendars, more `never-matches` and `redundant` may be reported
- `createCalendarFromSchedule`: if `isOpen` returns something other than a boolean, it throws a `RangeError` with code `invalid-argument` (before, a day with a value other than `true` was closed). It calls `isOpen` with the weekday values and the value of `holidayPolicy: { value }` when the calendar is created, and checks other values when such a day is evaluated
- Error classes follow one table by `code`: only `invalid-input` is a `TypeError`; every other code is a `RangeError`. The errors that were `TypeError` (`invalid-argument` for a wrong argument type in the functions of `bizdays-toolkit/provider`, `invalid-argument` from `migrateCalendarOptions` and `migrateScheduleOptions` given a value that is not an object, and `invalid-date` from `toInstant` given a date that is not a string) are now `RangeError`
- `withSubstituteDays` (`bizdays-toolkit/provider`): the returned array is frozen, and its type is `readonly Holiday<Kind>[]`

### Migration

- Tests that compare the whole result of the diagnostics (for example with `deepEqual`) need the new results as expected values: `redundant` may decrease or increase, `relatedPath` is added, and in schedules with counting calendars more `never-matches` and `redundant` may be reported. Removing the reported rules one at a time and diagnosing again is no longer needed; they can be removed together
- If `isOpen` of `createCalendarFromSchedule` returns values such as `1` or `"open"`, make it return a boolean (otherwise it throws when the calendar is created or when a day with that value is evaluated)
- If you catch the errors with `instanceof TypeError`, use `isBizdaysError(e)` and `e.code` instead (every code except `invalid-input` is now a `RangeError`)
- If you change the result of `withSubstituteDays` (for example with `push`), copy it first (`[...result]`). In TypeScript, if you assign it to a mutable array type (`Holiday[]`), use `readonly Holiday[]`
- Code that branches on `code` should handle the new `no-closed-day` in its default branch (usually no work is needed)
- No work is needed for `cutoff` with seconds or for `nextClosedDay` and `previousClosedDay`. The old option names are still accepted until 1.0.0

## [0.30.9] - 2026-11-07

品質改善提案（11 通目）の分です。文書で約束していた挙動から外れていた不具合を 2 件直しました。合成したカレンダーが、後のカレンダーが投げる日に投げるようになります（約束の回復。新たに投げる向きですが、RELEASING.md の区分を改めてパッチとしました）。省略可能な項目に明示的に書いた `undefined` は、どの項目でも省略と同じになります（作成できなかった設定が作成できるようになる向き）。正しい設定のカレンダー・スケジュールの判定の結果は変わりません。

### Fixed

- `combineCalendars`: 営業日の判定（`isBusinessDay`・探索・営業日の数え）が、`open: "all"` では先のカレンダーが休業日、`open: "any"` では営業日と決めた時点で後のカレンダーを判定せず、後のカレンダーが投げる日（`unconfirmedHolidayPolicy: "throw"` の予測の祝日、対応年の外）でも投げないことがあった。すべてのカレンダーを判定するようにした。ガイドの「合成したカレンダーは、どれかのカレンダーが投げるなら投げる」の約束から外れていた既知の不具合（0.30.x のガイドに記載）。影響: 後のカレンダーが投げる日に、今まで値を返していた呼び出しが `unconfirmed-holiday`・`out-of-range` を投げる。判定の費用は合成したカレンダーの数に比例する（今までは先のカレンダーで決まれば残りを省いていた）。`dayInfoOn` は今までもすべてのカレンダーを判定していたので変わらない
- 省略可能な項目に明示的に書いた `undefined` の扱いが項目ごとに違い、型は通るのに作成が `invalid-option` で失敗することがあった（例: 繰り返しの規則の `keys`・`weekdays`・`interval`・`anchor`・`skipWeekdays`・`calendar`、個別の日付の `{ date: undefined, from, to }`、旧名と新しい名前の片方が `undefined`）。設定・規則・個別の日付・毎年の月日・合成・スケジュールから作るカレンダー・期日のオプションのどこでも、省略と同じにした（決定の文書の 6 番「型と実行時を一致させる」から外れていた。利用者向けの型は `exactOptionalPropertyTypes` なしでは `undefined` を通す）。知らないキーは、値が `undefined` でも今までどおり診断の `unknown-option` で知らせる
- 文書を直した（コードの挙動は変わらない）:
  - `CalendarOptions`・`CombineCalendarsOptions`・`CalendarFromScheduleOptions` の `searchDayLimit` の TSDoc: 超えたときを `Error` と書いていた（0.30.8 から `code: "no-business-day"` の `RangeError`）
  - `createCalendarFromSchedule` の TSDoc とガイド（英日）: `isOpen` が boolean でない値（`1`・`"open"`）を返した日は休業日になることを書いた
  - ガイド（英日）の「繰り返しの規則」: 配列の順が効くのは優先順位の同じ段階の中だけで、`holidayPolicy: "ignore"` でも祝日の日は `"over-holiday"` の規則が `"under-holiday"` の規則より先に当たることを書いた
  - ガイド（英日）: 明示的な `undefined` は省略と同じ、を書き、「未確定の祝日」の合成の既知の不具合の記載を消した
  - 決定の文書: 17 番を実態に合わせて書き換えた（結果が祝日に依存しない設定の値だけの判定は未確定の祝日で投げない、を 0.30.6 から入れていたのに、「実行時に特別扱いを入れない」と書いていた）。6 番に明示的な `undefined` を、32 番に約束の回復の区分を、38 番に CHANGELOG の「開発」の書き方の理由を足した

## [0.30.8] - 2026-11-06

品質改善提案（10 通目）の分です。文書・決定の文書・コメントが実装と食い違っていた箇所を直し、不具合を 4 件直しました。カレンダー・スケジュールの判定の結果は変わりません。変わるのは、診断の結果（カレンダーの個別の日付・毎年の月日の `value` に `unknown-option` が増える。誤った `counting-basis` が消え、曜日の規則ごとに出る）、`no-business-day` の例外のクラス（`Error` → `RangeError`。広がる向き）、`withSubstituteDays` が返す祝日の凍結です。あわせて、品質の仕組みを軽くしました（タイムゾーンを変えたテストを 4 ゾーンから 2 ゾーンに、診断の性質のテストを抜き出しに、全日の結果を比べる補助を 1 つに、同じ恒等式を確かめるテストを 1 か所に。詳しくは「開発」）。公開物の `.js` が変わるのは Fixed の 4 件と、到達しないコードを消した 1 行（`core/input.js`。「開発」）の分だけで、カレンダー・スケジュール・提供元の判定の結果は変わらないので、利用者の作業は要りません。

### Fixed

- 診断: 第 n 営業日の規則（`businessDayOfMonth`・`businessDayOfWeek`）の `counting-basis` を、同じ設定の最初の毎週の曜日の規則だけを見て出していた。有効期間が重ならない曜日の規則（例: `{ weekday: 3, effectiveTo: "2026-12-31" }` と `{ businessDayOfMonth: 1, effectiveFrom: "2027-01-01" }`）や、対応年の外で決して使われない曜日の規則（例: 既定の `outOfRangePolicy: "throw"` で `{ weekday: 3, effectiveTo: "1950-12-31" }`。`out-of-range` だけが出る）を理由にも出し、曜日の規則が 2 つ以上あっても最初の 1 つしか `relatedPath` に出さなかった。有効期間が重なり、使われている曜日の規則ごとに 1 件出すようにした。減る形: 上の 2 つの例（どちらも `counting-basis` が出なくなる。`outOfRangePolicy: "ignore"` では 1950 年の数え方に影響するので、2 つ目の例でも出す）と、第 n 営業日の規則より後ろにある曜日の規則が `shadowed`・`never-matches` のとき（判定の順番で、使われないと分かる前に見ていた。例: `[{ businessDayOfMonth: 1 }, { weekday: 3 }, { weekday: 3 }]` は 2 件ではなく 1 件）。増える形: `{ weekday: 3 }`・`{ weekday: 6 }`・`{ businessDayOfMonth: 1 }` のように曜日の規則が 2 つ（2 件）、開く規則 `{ weekday: 6 }` と閉じる規則 `{ weekday: 3 }` に 1 つずつ（2 件。0.30.7 までは開く規則の 1 件だけ）。誤った診断を直す修正で、判定の結果は変わらない（オラクルは `counting-basis` を「出たら前提があるか」の一方向だけで、有効期間を見ずに確かめていたので見つけなかった。逆向きと件数も確かめるようにした。種類は正解と突き合わせる仕組みの不足）
- 診断: カレンダーの個別の日付・毎年の月日（`closedDates`・`openDates`・`closedAnnualDates`）の要素に書いた `value`（スケジュールの書き方の流用）を、黙って通していた。作成時は今までどおり無視し、診断で `unknown-option`（`path` は `closedDates[0].value` の形）を出す（打ち間違いは診断で見つかるという 8 番の約束のとおりにする。スケジュールの `dates`・`annualDates` の `value` は今までどおり既知のキー）
- `bizdays-toolkit/provider` の `withSubstituteDays`: 入力のまま返す祝日を凍結していなかった（振替日だけ凍結していた。4 番の「返すものはすべて凍結」から外れていた）。契約の項目だけを持つ凍結した複製にした。返す配列の凍結と戻り値の型の `readonly` は、`push` していたコードや可変の配列の型に代入しているコードが通らなくなるので、パッチではなく 0.31.0 で行う（RELEASING.md の区分）
- `no-business-day` の例外のクラスが経路で違っていた（探索と第 n 営業日は `Error`、`closingPeriod` は `RangeError`）。どれも `RangeError` にした。`RangeError` は `Error` でもあるので、`instanceof Error` で受けていたコードはそのまま通り、`instanceof RangeError` で受けていたコードは新たに捕まる（広がる向き）
- 文書を直した（コードの挙動は変わらない）:
  - ガイド（英日）の「設定の診断」の `redundant` の説明: 「毎年の月日と繰り返しの規則は個別の日付を除いた設定で調べる」と無条件に書いていた。0.30.3 から、自分の設定を基準に第 n 営業日を数える規則があれば、個別の日付は数え方を変えるので残し、毎年の月日は取り除いて変わりうる月・週の日をすべて調べる（0.30.3 の Fixed のとおり。例は `test/diagnose.test.ts` の「第 n 営業日の規則があると、数え方を変える個別の日付・毎年の月日は redundant にしない」）
  - ガイド（英日）の診断の表の `counting-basis` の行と `src/core/diagnose.ts` の冒頭のコメント: `businessDayOfMonth` の規則だけを書いていたが、週の第 n 営業日の規則（`businessDayOfWeek`）でも出る。`{ businessDayOfWeek: -1, weekStart: 1 }` と `{ weekday: 0 }` の設定の単体テストを `test/counting-basis.test.ts` に足した
  - ガイド（英日）の「未確定の祝日」: 「`holidaysInYear`・`holidaysBetween` は投げない」を、未確定の祝日では投げない、に限った（対応年の外の `out-of-range` と、提供元のデータの誤りの `invalid-provider-data` は投げる）
  - ガイド（英日）と `BusinessDayOnOrAfterOptions.cutoff` の TSDoc: `cutoff` が `"HH:mm"` だけを受け付ける理由（入力の時刻は分の精度で比べるので、秒を持つ締め時刻は入力の秒と比べられない）を書いた。秒の受け付けは 0.31.0 で扱う

## [0.30.7] - 2026-11-05

テスト拡充案の第 3 段です。0.30.6 の取り込みで持ち越した項目を片付け、そこで見つけた診断の不具合を 2 つ直したので、公開物の `.js` は 0.30.6 から変わります（Fixed。変わるのは `./diagnose` だけで、カレンダー・スケジュールの判定の結果は変わりません）。テストと道具では、変形しても結果が同じことの検査、文書の例と文章の主張の検査、オラクルの完全性を失敗にする切り替えを入れ、設定の結果の差分の旧名の比較の穴を直しました。設定の結果の差分の定期実行（テスト拡充案の T8）は入れず、手動の広い比較として入れました。自前の変異テスト（T9）は、0.31.0 の診断の作り直しの前に行います。

### Fixed

- 診断: スケジュールの第 n 営業日の規則の基準のカレンダー（`calendar`）が投げる月（判定できない月）がある設定で、判定できない月の影響を受けない診断まで取り除いていた。例: シンガポールの祝日（2020〜2027 年）の基準のカレンダーを持つ規則 `{ businessDayOfMonth: 1, calendar, value }` と、当てはまる日がない規則 `{ dayOfMonth: 31, months: [2], value }` を並べた設定で、後の規則の `never-matches` が出なかった（後の規則だけの設定では出る）。0.30.6 の Fixed の 3 件目（判定できない月の扱い）の取りこぼしで、0.30.5 以前はこの設定で誤った `error` の `out-of-range` を出していた。診断の結果が増える向きの修正。項目は診断の `path` の先頭が規則の位置と一致するもので引き（規則の中のオプションの位置も同じ規則に当たる）、基準のカレンダーを持たない繰り返しの規則の `never-matches` と、その規則の中のオプションの診断は、規則の形と設定だけで決まるので残す。規則そのものの `redundant` は、取り除いた設定と元の設定の結果を比べるので、ほかの規則の基準のカレンダーにも依存し、今までどおり有効期間に判定できない月があれば出さない。旧名のキー（`recurring`・`day` など）で書いても、規則どうしの診断の `path` は新しい名前で出る（API どうしの整合の検査の持ち越しを調べて見つけた。種類は API どうしの食い違い）
- 診断: 週の第 n 営業日の規則（`businessDayOfWeek`）で、月をまたぐ週の隣の月が判定できない月のとき、規則の有効期間がその月にかからなければ `never-matches` などを出していた。例: シンガポールの祝日の基準のカレンダーで `{ businessDayOfWeek: 3, weekStart: 1 }` を 2020-01-01〜2020-01-05 に当てると、2019-12-30 から始まる週の 2019 年の日を数えられないのに、`never-matches` を出していた（実際の第 3 営業日は 2020-01-02）。逆向きの例: `{ businessDayOfWeek: -1, weekStart: 3 }` を 2027-12-27〜2027-12-31 に当て、同じ値で 12 月 31 日を決める基準のない規則と並べると、2027-12-29 から始まる週の最後の営業日（2028 年 1 月の祝日次第で、シンガポールの 2028 年の祝日はまだ発表されていない。祝日がなければ 2028-01-04）を 2027-12-31 と数え、後の規則に誤った `redundant` を出していた。週の第 n 営業日の規則では、投げた月の前の月と次の月も判定できない月にする（安全側の扱いなので、隣の月の確かな診断も出さなくなる場合がある）。月の第 n 営業日の規則はその月の基準だけで決まるので、前後の月は記録しない。これも 0.30.6 の Fixed の 3 件目の取りこぼし（0.30.6 の取り込みで見つけた。種類は API どうしの食い違い）

## [0.30.6] - 2026-11-02

テスト拡充案の第 2 段です。失敗を注入した祝日の提供元と API どうしの整合の検査で見つけた不具合を 3 つ（判定 1・診断 2）直したので、公開物の `.js` は 0.30.5 から変わります（Fixed）。合成したカレンダーの既知の不具合（0.31.0 で直す）を文書に書きました。

### Fixed

- `holidayPolicy: "ignore"` で、祝日に従属する規則（`holiday`・`dayAfterHoliday`・`dayBeforeHoliday`・`"after-holiday"`）も祝日の上で先に判定する規則（`"over-holiday"`）もない設定で、`unconfirmedHolidayPolicy: "throw"` のとき、営業日の判定・第 n 営業日の数え方・探索（`isBusinessDay`・`valueOn`・`addBusinessDays` など。スケジュールから作ったカレンダーも）が未確定の祝日で `unconfirmed-holiday` を投げていた。そのような設定の結果は祝日に依存せず、ガイドは「結果は変わらない」、設定の診断もその `unconfirmedHolidayPolicy` を `redundant`（効き目がない）と言っているので、文書と診断に合わせてコードを直す。複数のマイナーバージョンを経た挙動だが、投げていた判定が投げなくなる向きの修正で、結果の値は変わらない。`dayInfoOn`・`daysBetween` は `holiday` を付けるために祝日を引くので、今までどおり投げる。対応年の外（`out-of-range`）と提供元のデータの誤り（`invalid-provider-data`）は、今までどおり投げる（失敗を注入した祝日の提供元のテストで見つけた。種類は例外の経路の未検証）
- 診断: `holidayPolicy: "ignore"` で祝日の上で先に判定する規則（`"over-holiday"`）がある設定でも、`unconfirmedHolidayPolicy: "throw"` を `redundant`（結果に影響しない）と出していた。祝日の日だけ `"over-holiday"` の規則が先に判定されるので、そのような設定の結果は祝日に依存し、`"throw"` は判定を投げさせる。「結果が祝日に依存しない設定」の判定を 1 つの関数にまとめ、判定（未確定の祝日で投げるか）と診断（`redundant` か）の両方がそれを使うようにした。誤った診断を直す修正で、判定の結果は変わらない（上の修正の条件を決めるときに見つけた。診断が `redundant` と出した設定で `"throw"` を `"accept"` に変えても全日の判定が変わらないことを、目録の設定で確かめるテストを足した。種類は正解と突き合わせる仕組みの不足）
- 診断: スケジュールの第 n 営業日の規則の数える基準のカレンダー（`calendar`）が投げる月（対応年の外、`unconfirmedHolidayPolicy: "throw"` の未確定の祝日）を、診断が誤って `error`・`never-matches` にしていた。`createSchedule` は成功し、基準のカレンダーが投げない月の判定も投げないのに、対応年が診断の走査の範囲（提供元のないスケジュールの 2001 年からの周期や、規則の形を調べる代表の 28 年間）を覆わない基準（同梱のシンガポール（2020 年〜）など）では `error` の `out-of-range`（`path` は `holidayProvider`）を、未確定の祝日で投げる基準では `error` の `invalid-provider-data` を出していた。診断は、基準のカレンダーを評価して投げた月だけを「判定できない月」として扱い（その月は規則が当てはまらないとみなす）、有効期間に判定できない月がある項目には `never-matches`・`redundant` を出さないようにした（分からないことは言わない）。`shadowed` は規則の形だけで決まり、基準のカレンダーを評価しないので、今までどおり出す。範囲を前もって計算しないので、合成したカレンダーなどの基準でも、基準のカレンダーが判定できる月は今までどおり診断する。誤った診断をなくす修正で、判定の結果は変わらない（result-compare の意図した差分 `schedule-counting-basis-narrower-than-scan` に登録した）。提供元のないスケジュールに提供元のある基準のカレンダーを使う設定の判定が、基準のカレンダーの対応年の外の月で投げることをガイドの「対応年の外」に書いた（診断で知らせるかは 0.31.0 以降で判断する）（API どうしの整合の検査で見つけた。取り込みで見つかった、合成した基準での誤った never-matches の退行もあわせて直した。種類は API どうしの食い違い）

### 既知の不具合

- 合成したカレンダーの営業日の判定（`isBusinessDay` や探索）は、`open: "all"` では先のカレンダーが休業日、`open: "any"` では先のカレンダーが営業日と決めた時点で後のカレンダーを判定しないので、後のカレンダーが投げる日（未確定の祝日・提供元の誤りなど）でも投げないことがある（並び順で変わる）。ガイドの「合成したカレンダーは、どれかのカレンダーが投げるなら投げます」から外れる。直すと新たに投げる判定ができるので、0.31.0（マイナーバージョン）で直す。ガイドの該当の箇条に注を足し、確かめるテストは `todo` にした

## [0.30.5] - 2026-11-01

0.30.4 の品質基盤の補修です。公開物の `.js` は 0.30.4 と同じです。0.30.4 で、品質基盤が「動いているように見えて、実は見ていない」箇所と、乱数のテストの生成範囲が縮んだ箇所が見つかったので、それだけを直しました。テスト拡充案の段の番号を 1 つずつずらし、第 2 段は 0.30.6、第 3 段は 0.30.7 で出します。

## [0.30.4] - 2026-11-01

品質基盤の整備の第 1 段（正解の定義）です。規則と設定の目録と、診断の総当たりのオラクルを入れました。オラクルで見つけた診断の文の誤りを 1 つ直しました（判定の結果は変わりません）。

### Fixed

- 診断: 第 n 営業日の規則と、毎週の曜日を開く繰り返しの規則がある設定で、`counting-basis` の文が「その曜日の規則は数を減らさない」と、閉じる規則のときの説明をしていた。開く規則のときは「その規則が開いた日は数えない」と説明する。メッセージは API ではないので、診断の `code`・`path` は変わらない（総当たりのオラクルで約束を確かめるときに見つけた。種類は文章の主張の未検証）

## [0.30.3] - 2026-11-01

診断の不具合を直すパッチバージョンです。あわせて、0.30.2 の後に main で整えた決定の文書・規約・CI を含みます。カレンダー・スケジュールの判定の結果は変わりません。

### Fixed

- 診断: 営業日カレンダーの繰り返しの規則（閉じる・開くの両方）に第 n 営業日の規則（`businessDayOfMonth`・`businessDayOfWeek`）がある設定で、数え方を変える個別の日付・毎年の月日（とそれに関わる規則）を、取り除くと同じ月・週の別の日の結果が変わるのに `redundant` としていた。`docs/decisions.md` の 16 番（第 n 営業日を数える基準には個別の日付と毎年の月日が入る）から外れていた、0.30.2 以前からある不具合。取り除いて変わりうる月・週の日をすべて調べ、規則の判定の基準にも個別の日付を残すようにした。判定できない日は、取り除ける側に倒さない（31 番）。これまでは規則どうしの診断の途中で判定が例外になると、その結果を捨てて祝日の提供元の誤り（`invalid-provider-data` など）として報告していたが、その項目を `redundant` にしないで診断を続けるようにした（判定が例外になる設定は、手元では作れていない）。該当する設定では診断の結果から `redundant` が減るので、診断の結果を `deepEqual` で比べているテストは期待値が変わることがある。減ったのは取り除くと結果が変わる項目なので、新しい結果を期待値にする。入ったバージョンを問わず不具合の修正はパッチ、という規約（`RELEASING.md` の「区分」）の最初の適用

### Changed

- 旧名を受け付ける期間を「0.30.x の間」と書いていた箇所（決定の文書の 10・37 番、`RELEASING.md` の設定の結果の差分の行、移行ガイド、テストとスクリプトのコメント）を「1.0.0 より前のバージョン」に直した。0.31.0 以降のマイナーバージョンでも旧名は受け付け、1.0.0 で `invalid-option` にする（移行ガイドの冒頭の「1.0.0 まで」と同じ）。長く続いた挙動の扱いで CHANGELOG に書くものを「決めた結果と理由」にそろえた
- README（英日）から npm のダウンロード数のバッジを外した（shields.io が npm の API のレート制限を受け、「rate limited by upstream service」と表示されていたため）
- `docs/decisions.md` を、時系列に並んだ 56 の番号から、話題ごとの 11 章・39 の番号に整理し直した。各決定は今の決定・理由・退けた案だけにし、バージョンごとの追記・提案書の番号・測定値は CHANGELOG と git の履歴に任せた。冒頭に目次と番号の付け方（番号は ID で振り直さない、新しい決定は章の中に置いて通しの番号を振る、追記を重ねず本文を書き換える）を、末尾に旧番号との対応表（残し続ける）を置いた。ソース・スクリプト・テスト・ワークフロー・文書の番号の参照を新しい番号に直した。CHANGELOG の 0.30.2 までの節の番号は旧番号のまま
- `docs/decisions.md` の整理で落ちていた決定を戻した: ウェールズ語の名称を GOV.UK のリポジトリの翻訳ファイルで照合する例外（29 番）、`src` が Node.js 固有の機能を使わない検査（35 番）、和集合の `"regular"` で退けた 2 案（10 番）と結果の比較で退けた案（37 番）、`withSubstituteDays` の定義（26 番）、スケジュールの第 n 営業日の基準と `"over-holiday"` の `redundant`（16 番）、英国の臨時の祝日の名前の付け方（28 番）、時刻を数値で受けない理由（7 番）、0.23.0〜0.29.0 を欠番にした理由（9 番）。新たに例外を投げる変更は 1.0.0 以降はメジャーバージョンであることを 6・32 番と `RELEASING.md` に書き、旧番号の対応表の行き先の漏れを足した。あわせて、整理で省いた細部のうち決定にあたるもの（`decidedByPath`・`asOf`・ID `"JP"` の判定の細部、`Policy` の選択肢の部分集合、`?: never` の項目に TSDoc を付けないことなど）を本文に戻し、誤った `key` の修正をマイナーバージョン、性能・サイズの改善をパッチと `RELEASING.md` の区分に書いた
- `RELEASING.md` と `docs/decisions.md` の役割を分けた: バージョンの区分・互換性の約束・手順・検査の一覧は `RELEASING.md` だけに書き、決定の文書の 32・33・35〜37・39 番はその理由と退けた案だけにした（同じ規則を 2 か所に書かない。36 番）。`RELEASING.md` の箇条からは理由を除き、決定の番号を指すようにした。残っていた重複（誤った `key` の直し方、提供元の内部の置き換えの条件、黙って外れる検査を作らないこと、`src` の移植性の検査）も規則を `RELEASING.md` に、理由を決定の文書に分けた
- 外部のレビューを受けて直した: 決定の文書の 27 番に 4 か国目を選んだときに見送った候補（香港・米国・ドイツ）と理由を戻した。公開から複数のマイナーバージョンを経た挙動が文書と違うときは、直す前にコードを直す（パッチ）・文書を挙動に合わせる・マイナーバージョンで扱うのどれにするかを決め、その結果を CHANGELOG に書くことを `RELEASING.md` の「区分」と 32 番に足した。`scripts/result-compare.ts` の冒頭のコメントを、診断の結果が誤った診断の修正で消えうるという今の約束に合わせた
- 規約を見直した（`docs/decisions.md` の 25・26・32・33・37 番、`RELEASING.md`）: 約束した挙動から外れていた不具合の修正は、入ったバージョンを問わずパッチにする（これまでは直前のバージョンで入った退行だけ）。誤った診断を直したときは、前のバージョンの診断の結果が消えることがある。性能の比較は、正しさのために遅くなることを CHANGELOG に書いたバージョンを通す。同梱の提供元の内部は、前のバージョンとの祝日データの比較で差分がなければ置き換えてよい。誤った祝日の `key` を直す手順を決めた
- ガイド（英日）の「0.30.0 より前に保存した設定」に 0.30.2 で足した、書き換えた後に診断を実行する例の設定が、`timeZone` を書いていないので `time-zone-conflict`（error）になっていた（日本と英国の提供元はタイムゾーンが違う）。例は `deprecated-option` だけを取り出していたので、コード例の検査は通っていた。`timeZone: "Asia/Tokyo"` と `holidayPolicy: "open"` を足し、診断の結果をすべて示す形にした（誤りがあれば例の検査で止まる）

## [0.30.2] - 2026-10-30

0.30.0・0.30.1 の改名の後始末の続きのバージョンです。新しい設定・関数・診断コードはありません。公開物の `.js` の挙動が変わるのは Fixed の 1 つ（診断の結果）で、カレンダー・スケジュールの判定の結果は変わりません。

### Fixed

- 診断: 日本の提供元だけの設定で、`"regular"` と旧名の `"national"` の同じ規則（祝日・祝日の翌日・祝前日の規則）が `shadowed` にならず、両方が `redundant` と出ていた。0.30.1 の退行で、`RELEASING.md` の互換性の約束（診断の結果は増えるだけ）から外れていた。0.30.0 と同じく、後の規則を `shadowed`（`relatedPath` は前の規則）として出す。ID `"JP"` の提供元が種別 `"national"` の祝日を返す設定では、意味が一致しないので同じものとして比べない。和集合では今までどおり `redundant` で見つかる。パッチで出す根拠は `docs/decisions.md` の 55 番（このバージョンで、パッチバージョンで入った退行も対象にした）

### Changed

- `docs/migration.md` の 0.30.0: 日本の提供元とほかの提供元を合わせた設定の `kinds` の `"regular"` が、0.30.0 から日本の国民の祝日にも当たることを「返す値」の注 2 に書いた（`"regular"` を検索する手順と、0.22.x と同じ結果にする書き方）。旧名を使っていない設定なので診断も `migrate…` も知らせず、0.30.0 の節の「移行」にも欠けていた。冒頭の検索の案内に、`withSubstituteDays` の呼び出しの `name:` を足した
- 0.30.1 の節の補足: 冒頭の「`.js` の挙動が変わるのは Fixed の 1 つだけ」は誤りだった。ほかに、`migrate…` が和集合で `"national"` を書き換えなくなったこと（Changed に記載。0.30.0 の約束に戻す修正なので、本来は Fixed）と、上の診断の退行も `.js` の挙動の変化だった
- ガイド（英日）: 書き換えた設定を診断にかけ、`deprecated-option` が残っていないことを確かめる手順と例を足した（和集合の `"national"` は `migrate…` が書き換えない）。`shadowed` と `redundant` は規則を 1 つずつ外したときの判定で、複数の規則が出たら 1 つ外すたびに診断をやり直すことを足した
- 和集合の `"national"` の `deprecated-option` の長いメッセージを、作成時ではなく診断のときに組み立てるようにした。診断が返すメッセージは変わらない（作成時は警告を使わないので、ルートのバンドルから文を外した）
- README（英日）のバージョンの固定の例を、具体的なバージョンから `"x.y.z"` にした。minify + gzip のサイズを測り直した（ルート 13.0 → 12.9 KB、日本込み 14.7 → 14.6 KB、フランス込み・シンガポール込み 13.9 → 13.8 KB）
- ソースのコメントとテストで、`"national"` の扱いの根拠を 55 番としていたのを 54 番に直した
- `docs/decisions.md`: 54 番に 0.30.2 の追記（返す値の改名は「改名は結果を変えない」の例外であること、規則どうしの診断の項を実際の挙動に合わせた）を足し、55 番の対象を「直前のバージョン（マイナーバージョン・パッチバージョン）」に改め、56 番（同じ設定の結果を前のバージョンと CI で比べる）を足した。旧名を本文に持つ 14・16・36・43・44 番に、0.30.0 の改名の追記を足した。`RELEASING.md`: パッチの区分を「直前のバージョン」に改め、互換性の約束の診断の項に前のバージョンの結果は新しいバージョンでも返すことを、品質の確認に決定の文書の旧名と返す値の改名の確かめ方を足した

## [0.30.1] - 2026-10-30

0.30.0 の改名の後始末のバージョンです。新しい設定・関数・診断コードはありません。公開物の `.js` の挙動が変わるのは Fixed の 1 つだけです。

### Fixed

- 日本の祝日の提供元とほかの提供元を合わせた設定（`holidayProvider: [jp, england]` など）で、旧名の `kinds: ["national"]` が、ほかの提供元の `"regular"` の祝日（英国の bank holidays など）にも当たっていた。0.30.0 の退行で、改名は結果を変えないという約束（`docs/decisions.md` の 54 番）から外れていた。0.22.x と同じく、「種別が `"national"` の祝日、または ID が `"JP"` の提供元が返した `"regular"` の祝日」に当てる。日本の提供元だけの設定の結果は変わらない。パッチで出す根拠は `docs/decisions.md` の 55 番。`id` を変えて包んだ日本の提供元は ID `"JP"` の提供元とみなさないので、`"national"` は 0.30.0 と同じく何にも当たらない（下の Changed の診断のメッセージが理由を示す。`docs/migration.md`）

### Changed

- 診断: 和集合の設定の `"national"` の `deprecated-option` のメッセージに、当てている祝日と、1.0.0 で ID `"JP"` の提供元を含む設定の `"national"` が `invalid-option` になることを添えた。ID `"JP"` の提供元がない設定で `"national"` の規則が何にも当たらないときは、`never-matches` のメッセージに改名の前の名前の可能性を添えた（`code` は変わらない）
- `migrateCalendarOptions`・`migrateScheduleOptions`: `kinds` の `"national"` は、祝日の提供元がすべて ID `"JP"` のときだけ書き換える。和集合では、新しい名前の `"regular"` がほかの提供元の祝日にも当たるので書き換えず、`changes` にも出さない（0.30.0 は和集合でも書き換えていた）
- ガイド（英日）: 保存した設定の `"national"` を `migrate…` で書き換えるには、読み込み時に付ける提供元を入れてから呼ぶこと（提供元がなければ書き換えない）、週の第 n 営業日（`businessDayOfWeek`）も週が対応年の外にかかる日は `out-of-range` になることを足した。月の関数の引数名を `closingDayOfMonth`・`input` に直した
- `docs/migration.md`: 和集合での `"national"` の扱いと 1.0.0 以降の書き方（日本の提供元を包んで種別を付け替える）、`id` を変えて包んだ提供元の注、週の第 n 営業日と対応年の端、0.30.0 の引数の名前の表を足した。「旧名は取り消し線と診断が示す」を、`combineCalendars`・`createCalendarFromSchedule`・`dueDate`・`withSubstituteDays` の設定の旧名は示さないので検索すること、に直した
- 型定義の説明: `skipWeekdays` の説明が書けない項目（`WeekdayPattern.dayOfMonth`・`DayOfMonthPattern.weekday`）に付いていたのを正しい項目に移し、例の旧名 `day` を `dayOfMonth` に直した。`@example`・TSDoc の旧名（`holidays`・`recurring` など）を直し、`BusinessDayOfWeekPattern` に対応年の端の挙動を、`HolidayProvider.id` に ISO にない地域の ID（`"FR-AM"`）を書いた。`.js` は変わらない
- README の祝日の種別の説明を今の値に直した。README（英日）の minify + gzip のサイズを測り直した（ルート 12.7 → 13.0 KB、日本込み 14.4 → 14.7 KB、英国込み 14.8 → 15.1 KB、フランス込み・シンガポール込み 13.6 → 13.9 KB）。`docs/providers.md` のコード例のコメントに残っていた置き換えの取り残し（"US federal holidayProvider:" → "US federal holidays:"）を直した
- `docs/decisions.md`: 55 番（直前のバージョンで入った退行の修正はパッチ）を足し、42・50・52・54 番に追記した。`RELEASING.md`: パッチの区分に退行の修正を足し、互換性の約束から型の名前の列挙をやめ、旧名（`outOfRange`）を直した。`src/core/schedule.ts`・`calendar.ts` の冒頭の判定の順番の写しを削り、ガイドと 12 番を指すようにした

## [0.30.0] - 2026-10-27

公開する名前を 1 つの規則に合わせて改めたバージョンです（`docs/decisions.md` の 54 番）。名前の整理のバージョンを区切るため、バージョンの番号を 0.30.0 にしました（0.23.0〜0.29.0 は欠番）。旧名は 1.0.0 まで受け付けます。作業は「移行」と `docs/migration.md` の 0.30.0 の節にあります。

### Added

- 週の第 n 営業日の規則 `{ businessDayOfWeek, weekStart }`（繰り返しの規則。数え方・`calendar`・`holidayOverlapPolicy` は `businessDayOfMonth` と同じ）と、型 `BusinessDayOfWeek`・`BusinessDayOfWeekPattern`
- `migrateCalendarOptions`・`migrateScheduleOptions`（`bizdays-toolkit/diagnose`）: 保存した設定の旧名のキーと値を新しい名前に書き換え、書き換えたもの（`OptionChange`）を元の位置で返す。型 `OptionsMigration`・`OptionChange`
- 診断コード `deprecated-option`（0.30.0 で改名した旧名を、書いた位置で知らせる warning。1.0.0 で削除する）
- `CalendarFromScheduleOptions`（`createCalendarFromSchedule` の第 3 引数の型に名前を付けた）

### Changed

- 公開する名前を、規則 N1〜N9（`etc/naming.md`）に合わせて改めた。設定のキー 18 個・値 2 つ、関数・メソッド 6 つ、型 17 個、返す項目 4 つ、型引数（`T` → `Value`）、引数（`addDays` の `n`、`isValidDate` の `input`、`closingMonth`・`closingPeriod` の `closingDayOfMonth`）。一覧は `docs/migration.md` の 0.30.0 の節。旧名は `@deprecated` の別名として残り、設定の旧名は読み替える（両方を書くと `invalid-option`）
- 返す値: 営業日カレンダーの理由 `"regular"` → `"default"`（`createCalendarFromSchedule` は `"open-weekday"`）、エラーコード `"invalid-month-day"` → `"invalid-annual-date"`、設定の中の位置を表す文字列は新しいキー名（日本の祝日の `kind` は Data）
- 規則の形ごとに受ける項目を型で分けた（`holidayOverlapPolicy`・`skipWeekdays`・`calendar`）。実行時に `invalid-option` になる書き方が型でも通らない（`docs/decisions.md` の 33 番の見直し）
- `outOfRangePolicy: "throw"` のとき、隣の日を見る規則（祝日の翌日・祝前日・`skipWeekdays`・`"after-holiday"` の振替元）が対応年の外の日を見ると `out-of-range` を投げる（これまでは外を黙って祝日でないとみなしていた）。診断は外を祝日なしとして扱う
- 打ち間違いの候補（`unknown-option` の `message`）は、旧名に近いキーなら新しい名前を挙げる

### Deprecated

- 0.30.0 で改名した旧名のすべて（`docs/migration.md` の「1.0.0 で削除する予定の API」）。1.0.0 で削除し、設定の旧名は `invalid-option` にする

### Data

- 日本の祝日の `kind` の `"national"` を `"regular"` にした（日付・名称・`key` は変わらない）

### Migration

- 実行時は旧名のままでも動くが、返す値の変更・対応年の端の挙動・TypeScript で必須のキーの旧名・`dayInfoOn` の結果を丸ごと比べるテストは 0.30.0 に上げた時点で対応が要る（下の箇条）。それ以外は TypeScript の取り消し線と診断の `deprecated-option` を手がかりに新しい名前に書き換える。保存した設定は `migrateCalendarOptions`・`migrateScheduleOptions` で書き換えられる
- 型が旧名を持つのは省略可能なキーだけなので、スケジュールの `weekly`・合成の `businessDay`・期日の `day`・振替の `rules`・規則の `day` は、TypeScript では新しい名前に書き換える
- 返す値（`reason` の `"regular"`、日本の `kind` の `"national"`、エラーコード `"invalid-month-day"`、設定の中の位置の文字列）と比べているコードを改める
- `dayInfoOn` の結果を `deepEqual` で比べているテストは、期待値に `open` と、`rulePath` があれば `optionPath` を足し、`reason` が `"regular"` なら `"default"`（`createCalendarFromSchedule` では `"open-weekday"`）に直す
- 対応年の最後の日付の近くで祝前日・祝日の翌日・振替の規則を使っていて例外になったら、`outOfRangePolicy: "ignore"` にするか、対応年の中で使う

## [0.22.2] - 2026-10-27

### Changed

- ガイド（英日）の「未確定の祝日」で、祝日の翌日・祝前日の規則が見る日を 0.22.1 で「隣の日（`skipWeekdays` があれば塊の全体）」としたのは実装と違っていたので、「隣の日。`skipWeekdays` があれば、そこから飛ばす曜日を越えて最も近い祝日まで」に直した（0.22.1 の節の「実装どおり」は誤り。塊の中で最も近い祝日より遠い日は見ないので、その日が未確定の祝日でも `unconfirmed-holiday` にならない。動作は変わらない）
- 型定義のコメント（`OnHolidayRule` の `"after-holiday"`）の「祝日でない翌日に振り替える」を「その日以降で最初の祝日でない日（土曜日のこともある）に振り替える」にした（0.22.1 でガイドを直した説明と揃える。`.js` は変わらない）
- `docs/migration.md`: 0.22.0 の `cycle` への書き換えの注意の「`openRecurring` の規則と重なる日は営業日になる」に、祝日ではその `openRecurring` の規則も `"over-holiday"` の場合だけであることを足した（祝日には `"over-holiday"` の休業の規則が、既定の `"under-holiday"` の `openRecurring` より先に決まる）。祝前日の行に、祝前日は祝日でないので祝日での順番の違いは関係しないことを足した
- 0.22.1 の節の補足: 言葉どおりの翌平日を `skipWeekdays` で書けると示したのはガイド（英日）だけ。README（英日）は「翌平日」を「次の祝日でない日」に置き換え、規則の表に「土曜日のこともある」を足した（`skipWeekdays` での書き方は示していない）。`scripts/bench.ts` のコメントと `test/recurring.test.ts` のテスト名の「翌平日」も直していた（どちらも公開物に含まれない）

## [0.22.1] - 2026-10-27

### Changed

- 祝日の識別子（`key`）の付け方の説明を、同梱の提供元に実際に付いている `key` と合わせた（公開物の動作・`key` は変わらない）。冠詞は先頭の "The" だけを除き、途中の冠詞は残す（`respect-for-the-aged`・`battle-of-the-boyne`）。例外は `new-year`・`boxing-day`・`labour-day`・`national-day` の 4 つ。規則は `docs/providers.md`（英日）にだけ書き、ガイド（英日）はそこを指す形にした（ガイド・`docs/providers.md`・決定の文書が、それぞれ別の不正確な規則を書いていた）
- README（英日）・ガイド（英日）の `onHolidayRule: "after-holiday"` の説明を「翌平日」「next weekday」から「次の祝日でない日（土曜日のこともある）」に改め、言葉どおりの翌平日は `skipWeekdays` で書けることを示した（振替先は decisions.md の 14 番のとおり「祝日でない日」で、金曜日の規則は金曜日が祝日のたびに土曜日に振り替わる。動作は変わらない）
- ガイド（英日）の「未確定の祝日」で、祝日の翌日・祝前日の規則が見る日を「隣の日」から「隣の日（`skipWeekdays` があれば塊の全体）」に改めた（実装どおり）
- ガイド（英日）の作成時間の具体値（開発用の機械での測定値）を「1 ミリ秒を大きく下回る」に改めた（機械に依存する値は照合できないため）
- `docs/migration.md`: 0.22.0 の `cycle`・祝前日の規則への書き換えに、判定の段階が変わる注意（`holidayPolicy: "open"` なら `onHolidayRule: "over-holiday"` を付ける、`openRecurring` の規則と重なる日は営業日になる、書き換えの前後で `daysBetween` を比べる）を足した
- `docs/decisions.md`: 46 番の `key` の付け方の規則を、自身の例（`respect-for-the-aged`）と矛盾しない形に改めた（「冠詞」→「先頭の冠詞」、例外を 4 つに整理）。14 番に、土曜日への振替が「年に 0〜1 回」なのは月曜日の規則の場合だけであることを追記した

## [0.22.0] - 2026-10-27

### Added

- 日単位の周期の規則 `{ cycle, anchor, positions }`（型 `CyclePattern`）。週や月にそろわない周期（4 勤 2 休のような交替制、10 日に 1 度の点検日）を、起点（`anchor`）を 1 日目として周期の中の何日目か（`positions`。1 始まり）で書く。`closedRecurring`・`openRecurring`・スケジュールの `recurring` で使え、`months`・有効期間・`name` を付けられる。`onHolidayRule` は `"under-holiday"`（既定）と `"over-holiday"`。`cycle` は 2 以上の整数、`positions` は 1〜`cycle` の重複のない配列で、空とすべての日は `invalid-option`。`"after-holiday"`・`anchor` の省略・ほかの形の項目との同居も `invalid-option`
- 祝日の翌日・祝前日の規則（`dayAfterHoliday`・`dayBeforeHoliday`）に `kinds`・`keys` を足した。隣の祝日（祝前日なら翌日の祝日、祝日の翌日なら前日の祝日）の種別・識別子で絞る（例: シンガポールの旧正月の前日は `{ dayBeforeHoliday: true, keys: ["chinese-new-year"] }`）。型 `DayAfterHolidayPattern`・`DayBeforeHolidayPattern` に既定値付きの型引数 `Kind` を足した
- 祝日の翌日・祝前日の規則に `skipWeekdays` を足した。祝日と書いた曜日が続く塊（祝日を 1 日以上含む）の前後の日に当てはまる（例: 月曜日の祝日の前の最終平日は `{ dayBeforeHoliday: true, skipWeekdays: [0, 6] }` で金曜日）。`kinds`・`keys` は塊の中でその日に最も近い祝日に当てる。すべての曜日は `invalid-option`
- 診断: 周期の規則どうしの `shadowed`（後の周期が先の周期の倍数で、後の規則のどの日も先の規則の日に当たるとき）、祝日の翌日・祝前日の規則どうしの `shadowed` に `kinds`・`keys` の包含を加えた。`redundant` の走査の範囲を、周期の規則の周期がそろう長さまで広げる（最長 200 年）

### Changed

- 提供元向けの関数（`bizdays-toolkit/provider` の `easterSunday`・`nthWeekdayOfMonth`・`daysInMonth`・`isLeapYear`・`substituteDays` と型 `SubstituteDaysOptions`・`SubstituteDirection`）と、祝日の識別子の型（`KnownJapaneseHolidayKey`・`KnownUkHolidayKey`・`KnownSgHolidayKey`・`KnownFrHolidayKey`）を `@beta` から `@public` にした。公開してから（0.16.0〜0.20.0）形が変わっておらず、同梱の 4 か国の実装で使われ方が固まったため（`key` は 46 番でバージョンをまたいで変えないと約束済み）
- エラーのメッセージ: 繰り返しの規則の形の数の誤り（`must have exactly one of …`）に `"cycle"` を、`kinds`・`keys`・`skipWeekdays` を使える規則の説明に祝日の翌日・祝前日を加えた（`code` と `path` は変わらない）
- README（英日）の minify + gzip のサイズを測り直した（0.22.0 で測定）
- `docs/decisions.md`: 53 番（日単位の周期の規則、祝日の翌日・祝前日の絞り込みと `skipWeekdays`、前への振替を足さない判断、`@public` への格上げ）を追加し、15・33・35・43・46・47 番に追記した
- `docs/migration.md`: 1.0.0 で削除する非推奨の API の一覧を足した

### Migration

- 動作が変わる既存の API はない。祝日の翌日・祝前日の規則に `kinds`・`keys`・`skipWeekdays` を付けて `invalid-option` になることを確かめていたテストは、例外が出なくなるので失敗する。テストを書き換える（`docs/migration.md`）

### 開発

- サイズの上限（`size-limits.json`）を上げた

## [0.21.4] - 2026-10-26

### Changed

- 公開する `dist` の `.js` からコメントを除いた（`tsc --removeComments`）。型定義（`.d.ts`）の TSDoc はこれまでどおり残すので、エディターの説明は変わらない。コメントは保守する人のためのもので、利用者には型定義の TSDoc だけが要る。`dist` の `.js` の gzip が全体で約 48 KB から約 28 KB に減った（エントリーごとは下の「開発」）。動作は変わらない（`data-compare` で前のバージョンと祝日データの差分がないこと、テスト・README のコード例・公開物の互換性の確認が通ることを確かめた）。README の minify + gzip のサイズは minify でコメントが消えるので変わらない
- 型定義に出るコメント（TSDoc）の、現状に追いついていない記述を、国の列挙や件数を書かない形で直した。`Holiday.names` の「同梱の提供元（日本）は持たない」（Wales は持つ）を「同梱の提供元は、公式の出典がある言語の名称だけを付ける」に、`KnownSgHolidayKey` の「11 の祝日に 1 つずつ」（key は 10 種類）を「毎年の祝日に 1 つずつ（旧正月の 2 日は同じ key）」に、`bizdays-toolkit/provider` の「同梱の 3 つの提供元」（フランスが加わった）を「振替のある同梱の提供元」に、`easterSunday` の「英国の祝日の計算に使い」（フランスも使う）を「復活祭から日数で決まる祝日の計算に使い」にした
- `docs/decisions.md`: 52 番（コメントと文書の参照の検査、コメントに書くことと書かないこと、`.js` からコメントを除くこと、取り込み時の重点確認）を追加した。34 番の「決めたのは 0 番」を「0 番目のカレンダー」にした（決定の番号と紛れないように）
- `RELEASING.md`: 「品質の確認」に参照の検査とコメントの書き方の規則を、「ビルドと整形」にコメントを除くビルドを足した。ハートビートの説明の「4 つの照合」を「すべての照合」にした

### 開発

- `pnpm check`（`scripts/check-package.ts`）に、コメントと文書の参照の検査を足した（decisions.md の 52 番）
- スクリプト・ワークフロー・テスト・`src` のコメント（型定義に出る TSDoc を含む）から、決定の文書と重複する理由の説明、バージョンの経緯（「0.18.0 で追加」など）、利用元の一覧、変わりうる事実を削り、何をするか・使い方・決定の文書の番号だけを残した（52 番）
- サイズの上限（`size-limits.json`）を、コメントを除いた `.js` の実測に合わせて下げた

## [0.21.3] - 2026-10-26

### Changed

- ドキュメントの食い違いを直した（公開物の動作は変わらない）。ガイド（英日）のフランスの対応年を 1974〜2099 年から正しい 2000〜2099 年に、README（英日）の minify + gzip のサイズを測り直して英国込み 12.8 → 13.2 KB・日本込み 12.9 → 12.8 KB・シンガポール込み 11.9 → 12.0 KB に（測り方を `scripts/measure-bundle.ts` に固定した。0.20.0 の値は日本とシンガポールで測り方が揃っていなかった）、ガイドの診断の表に `counting-basis` を、エラーコードの一覧に `invalid-argument`・`time-zone-conflict`・`unconfirmed-holiday` を足した。英国の `unverified` の理由を「The Gazette の索引の欠け」から、1986〜1990 年の北アイルランドの Order は「オンラインにない号（Missing Gazette issues）」、1987 年分の布告と 1975 年の北アイルランドの Order は「見つかっていない」に改めた（ガイド・README・出典の記録・フィクスチャの reason。README と decisions.md の 49 番は 13 日すべてをオンラインにない号としていた）。README のバージョンの固定の例を英日で揃え、出典の記録に付いていた「テスト用フィクスチャのみ」の誤った括弧書きを外した
- ガイド（英日）の「同梱の祝日の提供元」の冒頭に、4 か国の比較表（週末に当たった祝日を返すか・振替・予測・`confirmedThrough`）を足した。英国の提供元は週末に当たった祝日を返さないので、`{ holiday: true, weekdays: [6] }` のような規則は当てはまらない
- `docs/decisions.md`: 決定の文書の現状に追いついていない記述を直した。18 番（対応年は 1974 年から。49 番）・6 番（契約の項目に `key`）・10 番（CI でだけ使う道具は actionlint のほかにもある）・29 番（古い TypeScript は 0.13.0 から CI で確かめている）・45 番（`docs/` のファイルの数の数え方と、README からガイドに移った説明）に追記し、12 番に判定の順番の番号（ガイドの 1〜8）を明記して 47 番の「12 番の 5・6」を「6（`"over-holiday"` なら 4）」に、13・31 番の「README に明記」を「ガイドに明記」に、28 番の監視の範囲を 4 か国に直した。22・49 番の脱字を直した。51 番（ドキュメントの数値の検査と、前のバージョンとの祝日データの差分）を追加した
- `RELEASING.md`: 「CI のバージョンは次の 2 か所で管理」を直し（実際は 6 項目）、README のサイズの値の測り方を `scripts/measure-bundle.ts` に改めた。CHANGELOG の冒頭の区分の説明に「移行」「開発」を足した

### 開発

- `pnpm check`（`scripts/check-package.ts`）に、ドキュメントの数値・一覧を `dist` とソースの型と照合する検査を足した（decisions.md の 51 番）
- CI に `data-compare` ジョブを足した
- README のサイズを測る `scripts/measure-bundle.ts` を足した

## [0.21.2] - 2026-10-26

### Changed

- `src/uk/rules.ts`: `SPECIAL_DAYS`・`RENAMED` の出典のコメントを、`docs/sources/` の記録の節への参照に短くした（根拠の本文は記録にあり、`dist` にはコメントが残るため）。`./uk` の gzip が 8,743 → 7,969 に減った（測定 7,969）。動作は変わらない

### 開発

- 納品の検査を `pnpm check` に 3 つ足した（decisions.md の 50 番）

## [0.21.1] - 2026-10-26

### Data

- 英国の臨時の祝日のうち固有の名称が公式の文書にない 2 日の `name` を、政府の答弁が述べた理由を括弧で添えた形にした: 1995-05-08（Scotland）"Additional bank holiday" → "Additional bank holiday (VE Day 50th anniversary)"、1999-12-31（全地域）"Additional bank holiday" → "Additional bank holiday (Millennium)"。括弧で理由を添える形は GOV.UK の 2020 年 "Early May bank holiday (VE day)" と同じ。日付・種別・`key` は変わらない（decisions.md の 49 番、`docs/sources/uk-bank-holidays-1974-1999.md` の第 5 節）

### Changed

- README: Data sources の英国の段落に `docs/sources/uk-bank-holidays-1974-1999.md` へのリンクを足した（0.21.0 では 2000〜2011 年の記録だけを指していた）

## [0.21.0] - 2026-10-25

### Migration

動作が変わる既存の API はない（2012 年以降の英国の祝日は変わらない）。英国の 4 つの提供元の `supportedYears.from` が 2012 から 1974 になり、これまで `out-of-range` だった 1974〜2011 年の日付が結果を返すようになる。

### Added

- 英国の 4 つの提供元（`england`・`wales`・`scotland`・`northernIreland`）の対応年を 1974 年まで広げた（これまで 2012 年から）。GOV.UK のデータがない年は、2000〜2011 年は当時の政府が公表した一覧（DTI・BERR・directgov・Scottish Executive/Government・nidirect の Web Archive）を正として The Gazette の国王の布告と北アイルランドの Order で全日を照合し（`test/fixtures/uk-2000-2011-government-lists.json`）、1974〜1999 年は一覧が存在しないので Schedule 1 と The Gazette の布告・Order を正とし、Hansard の書面答弁がある年はそれを第二の出典とした（`test/fixtures/uk-1974-1999-proclamations.json`。テストは Schedule 1 を別に書いた規則で計算し（復活祭は米国海軍天文台の表）、布告の日と合わせて提供元の結果と一致することを確かめる）。出典の記録は `docs/sources/uk-bank-holidays-1974-1999.md`・`docs/sources/uk-bank-holidays-2000-2011.md`。Scotland の 3 日（2010-01-04・2010-12-27・2011-01-04）は当時の一覧にあるが布告がなく、一覧に従って振替日として返す。布告が見つからなかった 1987 年分の毎年の布告と 1975 年・1986〜1990 年の北アイルランドの Order（The Gazette の索引の欠け）は規則どおりに返し、フィクスチャの `unverified` に記録した。臨時の祝日と移動: 1977 年 Silver Jubilee bank holiday（England・Wales・NI は 6 月 7 日、Spring は 6 月 6 日に移動。Scotland は 6 月 6 日）、1981 年 Royal Wedding bank holiday（7 月 29 日）、1995 年の VE Day 50 周年（England・Wales・NI は Early May を 5 月 8 日に移動、Scotland は 5 月 8 日を "Additional bank holiday" として追加）、1999 年 12 月 31 日（"Additional bank holiday"。名称は政府の答弁の呼び方に限り、固有の名称がない日は中立の名称）、2002 年 Golden Jubilee（6 月 3 日。Spring は 6 月 4 日に移動）、2011 年 Royal Wedding（4 月 29 日）。毎年布告される日の始まり（England・Wales・NI の Early May と Scotland の Spring は 1978 年から、St Andrew's Day は 2007 年から）を符号化した。振替日の名称の割り当てが当時の一覧・布告と今の GOV.UK で違う年（12 月 25 日が土曜日の 1976・1982・1993・1999・2004 年、Scotland の 1 月 1 日が土曜日の 1977・1983・1994・2000・2005 年、Scotland の 12 月 25 日が日曜日の 1977・1983・1988・1994・2005 年、2011 年の 12 月）は当時の出典に合わせた

### Changed

- README・`docs/guide.md`・`docs/guide.ja.md`: 英国の対応年を 1974〜2099 年に改め、1974〜1999 年と 2000〜2011 年の出典、布告のない 3 日・`unverified`・振替日の割り当ての違いの説明を足した。国の記述順を対応年数の多い順（日本 → 英国 → フランス → シンガポール）に揃えた（README の提供元の表・節の見出し・照合のデータの説明・ライセンスの表記・箇条書き、ガイドの各国の節・識別子の表、providers、`RELEASING.md` の各国の節、`package.json` の description。`data-watch.yml` の照合の順は実行順なので変えていない）
- README: ライセンスの節を「MIT License。全文は LICENSE（リンク）」の形にした
- `RELEASING.md`: 英国の 1974〜2011 年は監視の対象外で、出典の読み違いが見つかったときだけ直す、と書いた
- `docs/decisions.md`: 49 番（英国の対応年の拡大と、GOV.UK のない年の正の決め方。一覧のない年は布告が正、`unverified`、`year >= N` の条件の意味）を追加した

### 開発

- テスト: `test/uk-1974-1999.test.ts`・`test/uk-2000-2011.test.ts` と、フィクスチャ `test/fixtures/uk-1974-1999-proclamations.json`・`test/fixtures/uk-2000-2011-government-lists.json` を追加した
- サイズの上限（`size-limits.json`）を上げた

## [0.20.0] - 2026-10-25

### Migration

動作が変わる既存の API はない。サブパス `bizdays-toolkit/fr` が増える。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- フランスの祝日の提供元 `bizdays-toolkit/fr` を追加した。`metropole`（ID `FR`。労働法典 L3133-1 の 11 日）と `alsaceMoselle`（ID `FR-AM`。Vendredi saint と 12 月 26 日が加わる）で、タイムゾーンは `Europe/Paris`、対応年は 2000〜2099 年。固定日と復活祭からの日数で計算し、振替はない。名称は data.gouv.fr の表記（フランス語）、`nameEn` は英訳、`key` は英語名から（`labour-day`・`pentecost-monday` など 13 個。型 `KnownFrHolidayKey`）。2 つの祝日が同じ日に当たる年（2008 年・2059 年の Ascension）は復活祭の側の名称で 1 件。祝日は法令で定まり年ごとの告示がないので、すべて `confirmed: true` で `confirmedThrough` は持たない。型 `FrHoliday`・`FrHolidayKind`・`KnownFrHolidayKind` を追加した
- data.gouv.fr の「Jours fériés en France」（DINUM。Métropole と Alsace-Moselle のゾーンの JSON）の 2006〜2031 年のすべての日付と名称に一致することをテストで確かめる（`test/fixtures/datagouv-jours-feries.json`）

### Changed

- README: 提供元の表にフランスを足し、min+gzip のサイズの値を 0.20.0 で測り直した（ルート 10.0 → 11.0 KB。0.18.0・0.19.0 の追加分を含む）
- `docs/guide.md`・`docs/guide.ja.md`: 「French public holidays / フランスの祝日」の節と、識別子の表のフランスの行を足した
- `RELEASING.md`: 「フランスのデータの更新」の節を足し、区分の表の「規則で計算する提供元」にフランスを含めた
- `docs/decisions.md`: 48 番（フランスの提供元と、4 か国目の選び方の基準）を追加した
- `package.json`: `exports` に `./fr`、keywords に `france` を足した

### 開発

- 監視のワークフロー `data-watch.yml` に data.gouv.fr の照合を足した。`scripts/verify-datagouv.ts`（`pnpm verify:datagouv`）を追加した
- テスト: `test/fr-rules.test.ts`・`test/fr-datagouv.test.ts` を追加し、`test/holiday-key.test.ts`・ESM/CJS/ブラウザー/workerd の確認・利用者の型チェックにフランスを足した
- サイズの上限（`size-limits.json`）に `./fr` 6,500（測定 5,404）を足した（gzip）

## [0.19.0] - 2026-10-25

### Migration

動作が変わる既存の API はない（`"after-holiday"` の規則に `skipWeekdays` を付けなければ振替先はこれまでどおり）。繰り返しの規則の形 `{ businessDayOfMonth }` と項目 `skipWeekdays`・`calendar`、診断コード `counting-basis` が増える。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 繰り返しの規則に月の第 n 営業日の形 `{ businessDayOfMonth: n }` を追加した（型 `BusinessDayOfMonthPattern`・`BusinessDayOfMonth`。n は 1〜31 と -1（最後）〜-31、配列可、`months` で絞れる）。「月末最終営業日は棚卸しで休業」「四半期初の第 1・第 5 営業日は予約を止める」を規則として書ける。数える基準はそのカレンダーの繰り返しの規則をすべて除いた判定（個別の日付・毎年の休業日・祝日・定休日の曜日）で、`nthBusinessDayOfMonth`・`lastBusinessDayOfMonth` は規則を適用した後の実際の営業日を返す。`onHolidayRule` は `"under-holiday"`（既定）と `"over-holiday"`（`holidayPolicy: "open"` で第 n 営業日が祝日に当たるときも適用する）を受け、`"after-holiday"` は `invalid-option`。スケジュールでは数える基準のカレンダーを `calendar` で指定する（必須。タイムゾーンが違えば `time-zone-conflict`。カレンダーの側に書くと `invalid-option`）
- `"after-holiday"` の曜日・日の規則に `skipWeekdays` を追加した。本来の日が祝日かその曜日なら、以降で最初の「祝日でもその曜日でもない日」に振り替える（「6 月 15 日は創立記念日。土日祝なら翌営業日」は `{ day: 15, months: [6], onHolidayRule: "after-holiday", skipWeekdays: [0, 6] }`、「月曜定休。祝日なら翌平日（土曜日には落とさない）」は `{ weekday: 1, onHolidayRule: "after-holiday", skipWeekdays: [6] }`）。`"after-holiday"` 以外の規則や規則自身の曜日に付けると `invalid-option`
- 診断コード `counting-basis`（info）を追加した。`businessDayOfMonth` の規則と、同じ設定の毎週の曜日の規則（`{ weekday }`）が同居する設定で、その曜日が営業日として数えられることを知らせる。`businessDayOfMonth` の規則は `never-matches`（その月にない回）・`shadowed`（n・months・基準のカレンダーの包含）・`redundant` の対象。`holidayPolicy: "closed"` の `businessDayOfMonth` の規則の `"over-holiday"` は `redundant`（info）。`skipWeekdays` が違う規則どうしは `shadowed` にしない

### Changed

- `docs/guide.md`・`docs/guide.ja.md`: 繰り返しの規則の表と本文に第 n 営業日と `skipWeekdays` を足し、コード例（銀行の支店とスケジュール）を足した
- README: 規則の表に `businessDayOfMonth`・`skipWeekdays` を足した
- `docs/decisions.md`: 47 番（第 n 営業日の規則・`skipWeekdays`・監視の報告書の日付）を追加し、14 番に `skipWeekdays` の追記をした

### 開発

- 監視の照合スクリプトの「確認した日付」を UTC から日本時間に揃えた（issue のコメントの日付と同じ基準）
- テスト: `test/business-day-of-month.test.ts`・`test/skip-weekdays.test.ts` を追加し、`test/types.check.ts`・利用者の型チェックに新しい規則を足した
- サイズの上限（`size-limits.json`）を上げた

## [0.18.0] - 2026-10-25

### Migration

動作が変わる既存の API はない。同梱の提供元が返す祝日に省略可能な項目 `key` が加わるので、`dayInfo` の結果や `holidaysInYear` の要素を `deepEqual` で比べているテストは期待値に足す（国民の休日・臨時の祝日には付かない）。祝日の規則に省略可能な `keys` が加わる。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 祝日の識別子 `Holiday.key`（省略可能。`/^[a-z0-9][a-z0-9-]*$/`）と、祝日の規則の絞り込み `{ holiday: true, keys: [...] }`（`kinds`・`weekdays`・`months` との AND）を追加した。春分の日・復活祭に連動する日・太陰暦の祝日のように月日や曜日では書けない祝日を、名称に依存せず個別に指せる。同梱の提供元は毎年繰り返す祝日に `key` を付け（日本 16・英国 12・シンガポール 10。`docs/guide.md` の「Holiday keys」）、振替日は元の祝日の `key` を持ち、国民の休日・一度きりの祝日は持たない。`key` は日付の移動や公式の改名があっても変えない。補完用の型 `KnownJapaneseHolidayKey`・`KnownUkHolidayKey`・`KnownSgHolidayKey` を追加した（`@beta`）。利用者の提供元が付けた `key` は形式だけ検証し、複製・凍結して返す。診断は対応年に現れない `key` を `never-matches`、`key` の集合の包含を `shadowed` で扱う
- `bizdays-toolkit/provider` に、週末に当たった祝日の振替日を計算する `substituteDays(holidays, { rules, kind, name?, original? })` を追加した（`@beta`。型 `SubstituteDaysOptions`・`SubstituteDirection`）。`rules` は曜日ごとの向き（`"next"`・`"previous"`）で、振替先は「入力の祝日でも、決めた振替日でも、`rules` の曜日でもない最初の日」。振替日は元の祝日の `key`・`names`・`confirmed` を引き継ぐ。日本（2007 年以降）・英国・シンガポールの同梱の提供元の振替日を再現することをテストで確かめている（内部の実装は置き換えていない）

### Changed

- `docs/guide.md`・`docs/guide.ja.md`: 「Holiday keys」（祝日の識別子）の節と、繰り返しの規則の `keys` を足した。コード例の結果に `key` が増えた
- `docs/providers.md`・`docs/providers.ja.md`: `substituteDays` と、自作の提供元に `key` を付ける方法を足した
- README: 規則の表と機能の箇条書きに `key`・振替の計算を足し、クイックスタートのコメントの "Labour Thanksgiving Day" を `nameEn` の綴り "Labor Thanksgiving Day" に直した
- `RELEASING.md`: 区分の表で「対応年の拡大」を規則で計算する提供元（日本・英国）に限り、年ごとの表で持つ提供元（シンガポール）に告示済みの新しい年を足すことはパッチに置く、と線を引いた（これまでは 2 つの行が同時に当てはまる状態だった）。「毎年の作業（日本）」を「日本のデータの更新」に改め、監視の差分の種類と対応の表を足した
- `docs/decisions.md`: 46 番（祝日の識別子と絞り込み、`substituteDays`、内閣府 CSV の毎日の照合、区分の線引き）を追加し、37 番の理由（存在しない「将来の非純粋な判定関数」を前提にしていた）と 44 番の `asOf` の理由（`Date` を断る理由としてタイムゾーンは成り立たなかった）を改めた

### 開発

- 監視のワークフロー `data-watch.yml` に内閣府「国民の祝日」CSV の照合を足した（`scripts/verify-cao.ts`。`--report`・`--simulate`）
- テスト: `test/holiday-key.test.ts` を追加し、`test/provider.test.ts` に `substituteDays`（同梱の 3 か国との同値・向き・名称・入力の検証）を足した
- サイズの上限（`size-limits.json`）を上げた

## [0.17.1] - 2026-10-25

### Changed

- README（英語・日本語）を入口に絞り、詳しい説明を `docs/guide.md`・`docs/guide.ja.md`（同梱の提供元・営業日カレンダー・繰り返しの規則・合成・よくある設定の例・月の期日・日ごとの値・スケジュールからのカレンダー・入力・対応年の外・未確定の祝日・エラー・設定の診断）と `docs/providers.md`・`docs/providers.ja.md`（他の国・地域の祝日の提供元の書き方）に移した。README には機能の箇条書き（7 項目）・インストール・クイックスタート・できることの一覧（提供元の表・規則の表・診断の例）・ドキュメントの索引を残した。本文の内容は変えていない（`docs/decisions.md` の 45 番）

### 開発

- `pnpm check`: 英語と日本語のドキュメントの対の見出しの数とコードブロックの数の一致、互いへのリンク、`docs/*.md` の見出しへのリンク（`#…`）の実在を確かめる（`scripts/check-package.ts`）
- `RELEASING.md`・`docs/decisions.md` の 22・27 番に、ドキュメントの対が増えたことを書いた

## [0.17.0] - 2026-10-25

### Migration

動作が変わる既存の API はない（既定値はこれまでどおり）。`Calendar`・`Schedule`・`HolidayLookup` に項目 `unconfirmedHolidays` が加わり、`createCalendar`・`createSchedule` の設定と `diagnoseCalendar`・`diagnoseSchedule` の第 2 引数が増える。監視のワークフローの改名（`govuk-watch.yml` → `data-watch.yml`）により、cron-job.org の URL を直す（RELEASING.md）。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 未確定の祝日のガード `unconfirmedHolidays: "accept" | "throw"`（カレンダー・スケジュール共通。既定 `"accept"`）を追加した。`"throw"` では、評価した日（探索が途中で通る日、祝日の翌日・祝前日の規則が見る隣の日を含む）が未確定の祝日（`confirmed: false`）なら `code: "unconfirmed-holiday"` の `RangeError` を投げる。`holidaysInYear`・`holidaysBetween` は投げないので、影響する日を列挙できる。合成はどれかが `"throw"` なら `"throw"`。エラーコードに `unconfirmed-holiday` を追加した
- 診断の第 2 引数 `{ asOf: "YYYY-MM-DD" }`（型 `DiagnoseOptions`）を追加した。基準日より前に終わった規則・個別の日付を `info` の `expired` で返す。省略時の結果は変わらない。診断コードに `expired` を追加した
- シンガポールの祝日 `bizdays-toolkit/sg`（提供元 `sg`。ID `SG`、`Asia/Singapore`、種別 `regular`・`substitute`・`special`、型 `SgHoliday`・`SgHolidayKind`・`KnownSgHolidayKind`）を追加した。MOM が告示した 2020〜2027 年の日付を表で持ち、日曜日に当たった祝日の振替を Holidays Act の規則で計算する。それより後の年は予測せず `out-of-range`。data.gov.sg のコレクション 691（MOM）で全日照合し、2022 年の既知の差分（改定後の告示との食い違い）はフィクスチャに出典付きで記録した

### Changed

- 診断: 判定に祝日を使わない設定（提供元がない、または `holidayPolicy: "ignore"` / `holiday: "weekday"` で祝日に従属する規則もない）の `unconfirmedHolidays: "throw"` を `info` の `redundant` にする。診断は未確定の祝日を `"accept"` で評価する
- 診断: 第 2 引数がオブジェクトでなければ `invalid-argument`、`asOf` が暦日の文字列でなければ `invalid-date` の例外を投げる（設定の誤りは診断結果で返す現状のまま）
- 振替元をさかのぼるときに祝日の例外を飲み込む範囲を `out-of-range` だけにした（`unconfirmed-holiday` などは投げ直す。これまでは提供元の例外も飲み込んでいた）
- README: シンガポールの節、「未確定の祝日」の節（レシピ付き）、診断の `asOf` と `expired`、出典にシンガポールと Singapore Open Data Licence を足した。サイズの値を測り直した（ルート約 10.0KB・日本の祝日込み約 11.8KB・英国の祝日込み約 11.7KB・シンガポールの祝日込み約 10.9KB。0.17.0 で測定）
- `RELEASING.md`: 「シンガポールのデータの更新」の節を足し、監視のワークフローの改名と cron-job.org の URL の修正を書いた
- `docs/decisions.md`: 44 番（未確定の祝日のガード・診断の基準日・シンガポールの祝日）を追加し、15・28 番に監視のワークフローの改名を書いた

### 開発

- 監視のワークフローを `govuk-watch.yml` から `data-watch.yml` に改名し、英国とシンガポールの照合を 1 回の起動で順に行う。`scripts/verify-datagovsg.ts`（`pnpm verify:datagovsg`。`--file`・`--write`・`--report`・`--simulate`）を追加した
- テスト: `test/unconfirmed-holidays.test.ts`・`test/diagnose-as-of.test.ts`・`test/sg-rules.test.ts`・`test/sg-datagovsg.test.ts` を追加し、`smoke.mjs`・CJS・利用者の型チェックにシンガポールと新しい設定を足した
- サイズの上限（`size-limits.json`）を上げ、`./sg` のエントリーを足した

## [0.16.0] - 2026-10-23

### Migration

日時の文字列の区切りは `T` だけになり、空白で区切った文字列（`"2026-11-23 10:00"`）は `invalid-time` の Error になる（これまでは実行時だけ受け付けていた。型 `DateTimeInput` は以前から `T` 区切りだけ）。合成した `dayInfo` に `decidedByPath` が加わるので、`deepEqual` で比べているテストは期待値に足す。ほかは動作が変わらない（祝前日の規則・サブパス・合成の項目の追加）。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 繰り返しの規則に祝前日の形 `{ dayBeforeHoliday: true }` を追加した（型 `DayBeforeHolidayPattern`）。翌日が提供元の祝日でその日自身は祝日でない日に当てはまり、連休なら連休の初日の前日だけ。`{ dayAfterHoliday: true }` の鏡像で、`weekdays`・`months`・有効期間を付けられ、`onHolidayRule` は `invalid-option`。宿泊の祝前日料金・飲食店の祝前日の営業時間・祝前日の出荷の締めの繰り上げを規則として書ける。診断の `never-matches`・`shadowed` も扱う
- 祝日の提供元を実装する人向けのサブパス `bizdays-toolkit/provider` を追加した（`@beta`）。内部で使っている暦の計算 `easterSunday(year)`（グレゴリオ暦の復活祭。英国の祝日で GOV.UK のデータと照合済み）、`nthWeekdayOfMonth(year, month, weekday, n)`（`n` は 1〜5 と -1（最後））、`daysInMonth`、`isLeapYear` を、入力の検証を付けて公開する。米国の連邦祝日やドイツ・豪州の州の祝日のように、第 n 曜日と復活祭で決まる提供元が書ける
- 合成したカレンダーの `dayInfo` に `decidedByPath`（判定を決めたカレンダーまでの番号の列。外側から順）を追加した。合成したカレンダーをさらに合成したとき、`rulePath` がどのカレンダーの設定の位置かを結果だけから辿れる。`decidedBy` は外側の番号のまま

### Changed

- 日時の文字列の区切りを `T` だけにし、空白で区切った文字列は `invalid-time` にした（上の「移行」）
- README: 繰り返しの規則の節に祝前日、他の国・地域の祝日の節に `bizdays-toolkit/provider` と復活祭で決まる提供元の例、合成の節に `decidedByPath`、日付・日時の入力の節に区切りの条件、確かめている環境に Bun・Deno を足した。サイズの値を測り直した（ルート約 9.8KB・日本の祝日込み約 11.6KB・英国の祝日込み約 11.5KB。0.16.0 で測定）
- `docs/decisions.md`: 14 番に年ごとの列挙で足りる理由、26 番に Bun・Deno、29 番に空白区切りの廃止、33 番に祝前日を足した経緯、36 番に曜日の日に `rulePath` を付けない理由の書き直し（位置は書けるが冗長）、41 番に次の月に併合する側を選んだ理由を書き、43 番（祝前日・provider・`decidedByPath`・空白区切りの廃止・Bun と Deno の確認）を追加した
- `RELEASING.md`: 確認の表と固定するバージョンの一覧に `bun`・`deno` ジョブを足した

### 開発

- CI に `bun`・`deno` ジョブを追加した（Deno は `--unstable-temporal` で本物の Temporal も確かめる）
- `easterSunday` を `src/uk/rules.ts` から `src/core/date.ts` に移した
- 規則の診断の性質のテストの生成器に祝前日を加えた
- サイズの上限（`size-limits.json`）を上げ、`./provider` のエントリーを足した

## [0.15.0] - 2026-10-21

### Migration

`businessDayOnOrAfter` に `cutoff` を指定するときは、時刻を持つ入力（`Date`・日時の文字列・時刻を持つ Temporal の値）を渡す。時刻のない入力（暦日の文字列・`PlainDate`）との組み合わせは、これまで暦日を 0 時として扱い締め時刻を黙って無視していたが、`invalid-argument` の Error になる。ほかは動作が変わらない（規則の絞り込み・カレンダーのメソッド・型の追加）。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 祝日の規則（`{ holiday: true }`）と祝日の翌日の規則（`{ dayAfterHoliday: true }`）に、曜日の絞り込み `weekdays`（`months`・`kinds` と同じ絞り込みの配列）を追加した。「祝日の翌日は休館（土日に当たる場合は開館）」は `{ dayAfterHoliday: true, weekdays: [1, 2, 3, 4, 5] }`、「土曜の祝日は午前診療」は `{ holiday: true, weekdays: [6], value: … }`。曜日・日の規則に `weekdays` を付けると `invalid-option`。診断の `never-matches`・`shadowed` も曜日の絞り込みを扱う
- 営業日カレンダーに、営業日を考慮した締め日 `closingMonth(input, closingDay, { convention })`・`closingPeriod(monthOrDate, closingDay, { convention })` を追加した。各月の締め日を `adjust` と同じ `convention`（必須）で営業日に調整し、日付は調整後の締め日がその日以降になる最初の月に属する。前月の締め日から当月の締め日までに営業日がない月（長期休業）は固有の期間を持たず、その日は次の月に属し、その月の `closingPeriod` は `no-business-day`。合成したカレンダー・スケジュールからのカレンダーにも付く。ルートの `closingMonth`・`closingPeriod` は暦日のまま
- `HolidayPattern`・`RecurringPattern`・`RecurringRule`・`RecurringValue` に祝日の種別の型引数 `Kind`（既定 `string`）を追加し、`kinds` を `readonly Kind[]` にした。`holidays: jp` のカレンダー・スケジュールでは `kinds` に日本の祝日の種別の補完が効く（型は開いているので、ほかの文字列も通る）。型引数なしの利用はこれまでどおり

### Changed

- `businessDayOnOrAfter` の `cutoff` を、時刻を持たない入力と組み合わせると `invalid-argument` にした（上の「移行」）
- README: `businessDaysBetween` が `addBusinessDays` の逆算になるのは起点が営業日のときで、休業日の起点では `addBusinessDays` が翌営業日を 1 と数える（`+0` と `+1` が同じ日）ことを明記した。`weekdays`、営業日を考慮した締め日、`cutoff` の入力の条件、バッジに npm のダウンロード数（直近 18 か月）を足した。サイズの値を測り直した（ルート約 9.7KB・日本の祝日込み約 11.5KB・英国の祝日込み約 11.4KB。0.15.0 で測定）
- `docs/decisions.md`: 31 番に「起点が営業日のとき」の条件と休業日の起点の定義を、37 番に「別名」と「文脈を持つ経路」の線引きを、30 番に `reason`・`rulePath`・診断の違いを足した。41 番（`weekdays`・営業日を考慮した締め日と空の月の扱い）・42 番（`kinds` の型・`cutoff` の例外）を追加した

### 開発

- 性質のテストに、休業日を起点にした `addBusinessDays` と、営業日を考慮した締め日を足した
- サイズの上限（`size-limits.json`）を上げた

## [0.14.1] - 2026-10-20

ライブラリの結果は 0.14.0 と同じ（内部の改善と文書だけ）。

### 開発

- `createCalendar`・`createSchedule` の作成が 0.13.0 で約 30% 遅くなっていたのを直した
- `docs/decisions.md`: 38 番にこの原因と「作ったあとに印を付けず、リテラルに含める」知見を追記した

## [0.14.0] - 2026-10-20

### Migration

動作は変わりません（締め期間と、暦日と時刻から瞬間への変換の追加）。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 締め日で区切ったときのその月分の期間を返す `closingPeriod(monthOrDate, closingDay)` を追加した（`closingMonth` の逆算。前月の締め日の翌日からその月の締め日まで、両端を含む `{ from, to }`）。暦日を渡すとその日が属する期間。返す値は変更できず、日付の期間の形なので `closedDates` や `listBusinessDays` にそのまま渡せる。締め日がその月にない場合の読み替え（末日）は `closingMonth` と同じ内部関数で行い、期間が隙間も重なりもなく敷き詰められることをテストで確かめた
- 暦日と時刻（`"HH:mm"` または `"HH:mm:ss"`）からタイムゾーンでの瞬間を `Date` で返す `toInstant(date, time, timeZone)` と、営業日カレンダー・スケジュールのメソッド `instantOf(date, time)`（そのタイムゾーンで。合成したカレンダー・スケジュールからのカレンダーにも付く）を追加した。`civilOf`・`toDateTimeParts` の逆向き。夏時間で存在しない時刻は飛んだ分だけ後ろに、2 回ある時刻は先のほう（Temporal の `disambiguation: "compatible"` と同じ）。`Intl` だけで実装し、オフセットの差が 1 時間でないゾーン（`Australia/Lord_Howe`）と南半球（`Pacific/Auckland`）でも確かめた。受け付けるのは暦日の文字列だけ（`invalid-date`）。時刻の誤りは `invalid-time`

### Changed

- README: 月のヘルパーの節に `closingPeriod` を、日付・日時の入力の節に `toInstant`・`instantOf` と夏時間の例を足した。サイズの値を測り直した（ルート約 9.3KB・日本の祝日込み約 11.1KB・英国の祝日込み約 11.1KB。0.14.0 で測定）
- `docs/decisions.md`: 39 番（`closingPeriod`）・40 番（`toInstant`）を追加した
- `src/core/schedule.ts` の `buildSchedule` の注釈の位置を直した（0.13.0 で関数の間に別の定義が入り、注釈が離れていた。動作は変わらない）

### 開発

- サイズの上限（`size-limits.json`）を上げた

## [0.13.0] - 2026-10-20

### Migration

動作は変わりません（スケジュールから営業日カレンダーを作る関数と、判定の理由の新しい値の追加。CI の改善）。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- スケジュールから営業日カレンダーを作る `createCalendarFromSchedule(schedule, isOpen, { maxSearchDays? })` を追加した。`isOpen` が true を返す値の日を営業日とする通常のカレンダーを返し、営業時間表のようなスケジュールが唯一の設定になる。`isOpen` は値だけを受け取る純粋な関数（日付は渡さない。営業日の探索で繰り返し呼ぶため）。`dayInfo` の `reason` はスケジュールの `reason` と営業・休業の組み合わせで、`name`・`holiday`・`shiftedFrom`・`rulePath` はスケジュールの結果を引き継ぐ。祝日・タイムゾーン・`outOfRange` はスケジュールのもの。`createSchedule` が作ったスケジュール以外は `invalid-argument`
- 判定の理由（`DayReason`）に `"open-annual"`（スケジュールの `annual` の値で営業になる日）を追加した。`createCalendar` の結果には現れない（`closedAnnual` は休業だけ）

### Changed

- README: 「スケジュールから営業日カレンダーを作る」の節を足した。型定義の確認の範囲を、CI で確かめる TypeScript のバージョン（5.0・5.5・5.8・6.0・7.0）に改めた。サイズの値を測り直した（ルート約 9.0KB・日本の祝日込み約 10.8KB・英国の祝日込み約 10.7KB。0.13.0 で測定）
- `docs/decisions.md`: 38 番（スケジュールからのカレンダー・`"open-annual"`・利用者の TypeScript のバージョンの確認）を追加した

### 開発

- CI に `consumer-types` ジョブを追加した
- `scripts/check-consumer-types.ts` に `--tsc <path>` を足し、わざと型エラーを含む `test/consumer/consumer-error.mts` が各バージョンで失敗として報告されること（検査が機能していること）も確かめるようにした
- `createCalendar` の `dayInfo` の変換を `createCalendarFromSchedule` と共用の内部関数に切り出した

## [0.12.0] - 2026-10-20

### Migration

動作は変わりません（繰り返しの規則の新しい形・`dayInfo` の新しい項目の追加と、診断・CI の改善）。`bizdays-toolkit/jp`・`bizdays-toolkit/uk` の定数 `dataVersion`・`confirmedThrough` が非推奨になったので、使っていれば提供元の項目（`jp.dataVersion`・`england.confirmedThrough` など）に書き換える。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 繰り返しの規則に、祝日の形 `{ holiday: true, kinds?, months? }`（型 `HolidayPattern`）を追加した。祝日の既定の扱い（`holidayPolicy`・スケジュールの `holiday`）の例外を、「2027 年 4 月から祝日も営業」（`openRecurring: [{ holiday: true, effectiveFrom: "2027-04-01" }]`）、「振替休日と国民の休日は営業」（`kinds: ["substitute", "citizens"]`）、「5 月の祝日は特別営業時間」（スケジュールの `recurring`）のように書ける。`kinds` は `months` と同じ絞り込みの配列（省略時はすべての祝日）。判定は「祝日の上」の段階（`"over-holiday"` の規則と同じ）で、`holidayPolicy: "ignore"` でも当てはまる。当てはまる日は祝日なので `onHolidayRule` は指定できない（`invalid-option`）。`kinds` は `holiday` の規則でだけ使える
- `DayInfo`・`ScheduleDay` に `rulePath`（値を決めた規則の設定の中の位置。規則の診断の `path` と同じ形。例: `"closedRecurring[0]"`）を追加した。`dates`・`annual`・`recurring`（振替先を含む）で決まった日にだけ付き、祝日・曜日で決まった日には付かない。合成したカレンダーは決めたカレンダーの `rulePath` を引き継ぐ

### Deprecated

- `bizdays-toolkit/jp`・`bizdays-toolkit/uk` の定数 `dataVersion`・`confirmedThrough` を非推奨にした（`@deprecated`）。提供元の項目（`jp.dataVersion`・`jp.confirmedThrough`、英国は `england.dataVersion` など 4 つの提供元で同じ値）と同じ値で、経路を 1 つにするため。1.0.0 で削除する

### Changed

- 規則の診断で、祝日の規則を扱えるようにした。提供元のない設定、または `kinds`・`months`・有効期間に当てはまる祝日がない規則は `never-matches`。`shadowed` は祝日の規則どうし（`kinds`・`months`・有効期間の包含）でだけ調べ、既定の扱いと同じ向きの規則は `redundant` で見つける
- 規則の診断の `unknown-option` の候補（did you mean）で、既知のキーの先頭部分（`onHoliday` → `onHolidayRule`）を、短い別のキー（`holiday`）との編集距離より優先するようにした
- 繰り返しの規則の形の誤りのメッセージを、`"weekday"`・`"day"`・`"dayAfterHoliday"`・`"holiday"` のうち 1 つだけを持つ、に改めた（code は `invalid-option` のまま）
- README: 繰り返しの規則の節に祝日の規則を、`rulePath` の説明を、合成の節に祝日の提供元の和集合の意味（同じ提供元は 1 つ、包んだ提供元は別物、同じ日付は先のカレンダーの提供元）を足した。`dataVersion`・`confirmedThrough` の案内を提供元の項目に改めた。サイズの値を測り直した（ルート約 8.8KB・日本の祝日込み約 10.6KB・英国の祝日込み約 10.5KB。0.12.0 で測定）
- `docs/decisions.md`: 4 番に「知っているキーの無効な組み合わせは例外にする」境界を、34 番に和集合の意味を足した。35 番（祝日の規則）・36 番（`rulePath`）・37 番（定数の一本化と性能の検証）を追加した

### 開発

- CI に `bench` ジョブを追加した。`scripts/bench.ts` に `--package <dir>`・`--json <file>` を足した
- サイズの上限（`size-limits.json`）を上げた
- 性質のテストに祝日の規則を加えた
- ライブラリ内のテストとスクリプトで、非推奨にした定数 `confirmedThrough` の代わりに提供元の項目を使うようにした

## [0.11.1] - 2026-10-19

ライブラリのコードは 0.11.0 と同じ。

### Changed

- README: よくある設定の例に、「その日が月の第何営業日か」（`businessDaysBetween` + 1。`nthBusinessDayOfMonth` の逆算）、「次の休業日と、その理由」（`daysBetween` で営業日でない最初の日）、「銀行の営業日」（3 行の設定。着金日は合成で求める）の 3 件を足した
- CHANGELOG: 0.11.0 の「移行」に `docs/migration.md` への案内を足した（GitHub Release の本文は公開後に直してあり、これでリポジトリ側もそろう）

## [0.11.0] - 2026-10-19

### Migration

作業は要りません（繰り返しの規則の新しい形と、カレンダーを合成する関数の追加）。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 繰り返しの規則（`closedRecurring`・`openRecurring`・スケジュールの `recurring`）に、祝日の翌日の形 `{ dayAfterHoliday: true }` を追加した。前日が祝日でその日自身は祝日でない日（連休なら連休が明けた日）に当てはまる。「祝日」は提供元の祝日だけで、休業日の設定は含めない。当てはまる日は祝日でないので `onHolidayRule` は指定できない（`invalid-option`）。`months`・`name`・有効期間と組み合わせられる。型 `DayAfterHolidayPattern` を追加した
- 作成済みの営業日カレンダーを合成する `combineCalendars(calendars, { businessDay: "all" | "any", maxSearchDays? })` を追加した。すべてが営業している日（`"all"`）、またはいずれかが営業している日（`"any"`）を営業日とする通常のカレンダーを返し、営業日の加減算・調整・期日などが合成結果で動く。`dayInfo` の `reason`・`name`・`shiftedFrom` は合成結果と同じ判定をした最初のカレンダーの結果で、その番号を新しい項目 `decidedBy` で返す。祝日は各カレンダーの提供元の和集合で判定する。タイムゾーンが違えば `time-zone-conflict`、2 つ未満・同じカレンダーの重複は `invalid-argument`。型 `CombineOptions` を追加した
- `DayInfo` に省略可能な `decidedBy`（合成したカレンダーで判定を決めたカレンダーの番号）を追加した。合成していないカレンダーでは付かない
- `HolidayLookup`（営業日カレンダー・スケジュール）に `outOfRange`（設定の値）を追加した。合成するときに引き継ぐため

### Changed

- 規則の診断で、祝日の翌日の規則を扱えるようにした。提供元のない設定では `never-matches`。`shadowed` は祝日の翌日の規則どうし（`months` と有効期間）でだけ調べ、曜日の規則との重なりは `redundant` で見つける
- 繰り返しの規則の形の誤りのメッセージを、`"weekday"`・`"day"`・`"dayAfterHoliday"` のうち 1 つだけを持つ、に改めた（code は `invalid-option` のまま）
- README: 繰り返しの規則の節に祝日の翌日を、新しい節「カレンダーの合成」を足した。サイズの値を測り直した（ルート約 8.6KB・日本の祝日込み約 10.3KB・英国の祝日込み約 10.2KB。0.11.0 で測定）

### 開発

- サイズの上限（`size-limits.json`）を上げた
- `createCalendar` の営業日の探索・調整・月の営業日の実装を、祝日を調べる機能と 1 日分の判定を引数に取る内部関数（`buildCalendar`）に切り出し、`combineCalendars` と共用した
- 性質のテストに祝日の翌日の規則を加えた

## [0.10.0] - 2026-10-19

### Migration

動作は変わりません（繰り返しの規則・毎年の月日の規則への省略可能な項目の追加と、診断の改善）。`bizdays-toolkit/jp` の `toJapanDate`・`toJapanDateTime` が非推奨になったので、使っていれば `toDateString(input, "Asia/Tokyo")`・`toDateTimeParts(input, "Asia/Tokyo")`（または営業日カレンダー・スケジュールの `dateOf`・`civilOf`）に書き換える。書き換え方は [docs/migration.md](./docs/migration.md)。

### Added

- 繰り返しの規則（`closedRecurring`・`openRecurring`・スケジュールの `recurring`）と毎年の月日の規則（`closedAnnual` のオブジェクトの形・スケジュールの `annual`）に、有効期間 `effectiveFrom`・`effectiveTo`（両端を含む `"YYYY-MM-DD"`。一方だけなら、もう一方は期限なし）を付けられるようにした。期間の外では、その規則は書かれていないのと同じに扱う（判定の順番は変わらない）。「2027 年 4 月から定休日を月曜から火曜に変える」「夏季休業を今年限りでやめる」を 1 つのカレンダーで表せ、切り替え日をまたぐ営業日の計算（`addBusinessDays` など）も正しくなる。`"after-holiday"` の振替は振替元の日で期間を判定する。型 `EffectivePeriod` を追加した。`effectiveFrom` が `effectiveTo` より後なら `invalid-range`
- 曜日の規則に周期 `interval`（週数。2 以上の整数）と起点 `anchor`（`weekday` と同じ曜日の日付）を付けて、「隔週水曜定休」のような規則を書けるようにした。`anchor` と同じ曜日で、`anchor` との日数の差が 7 × `interval` の倍数の日（起点より前の日も）に当てはまる。`nth` とは併用できず、`months`・`onHolidayRule`・有効期間とは組み合わせられる。「第 1・第 3 水曜」（`nth: [1, 3]`）は水曜が 5 回ある月で隔週からずれるため、別の書き方にした。`interval` と `anchor` の片方だけ、`anchor` の曜日違い、`day` の規則への指定は `invalid-option`

### Deprecated

- `bizdays-toolkit/jp` の `toJapanDate`・`toJapanDateTime` を非推奨にした（`@deprecated`）。同じ変換がルートの `toDateString(input, "Asia/Tokyo")`・`toDateTimeParts(input, "Asia/Tokyo")` と、営業日カレンダー・スケジュールの `dateOf`・`civilOf` にあり、国ごとの関数は日本だけの特別扱い（英国には対応物がない）だったため。少なくとも 1 つのマイナーバージョンは残し、1.0.0 で削除する。`etc/api.md` に `@deprecated` を記録するようにした

### Changed

- 規則の診断（`bizdays-toolkit/diagnose`）を、有効期間と周期に対応させた。`shadowed` は先の規則の期間が後の規則の期間を含み、周期も含む（毎週は隔週を覆う。位相の違う隔週どうしは覆わない）ときだけ出す。有効期間の中に当てはまる日がない規則は `never-matches`。規則の有効期間が祝日の提供元の対応年の外にあれば `out-of-range`（新しい code は足していない）
- `redundant`・`no-business-day` の走査の範囲を見直した。周期のある規則があれば、提供元がない設定の 2001〜2028 年を周期がそろう長さ（隔週なら 56 年。上限 200 年）に広げ、規則の有効期間が範囲の外にあれば、その期間も調べる（`outOfRange: "throw"` では対応年の中だけ）。これまでは固定の範囲の外にある期間の規則を「使われない」と誤診した。調べた年は `message` に書く
- README: 繰り返しの規則の節に、有効期間と隔週の書き方・例を足した。`businessDaysBetween` だけが `to` を含まない理由（区間を足し合わせられ、`addBusinessDays` の逆算になる）を書いた
- README のサイズの値を測り直した（ルート約 7.9KB・日本の祝日込み約 9.8KB・英国の祝日込み約 9.6KB。0.10.0 で測定）
- `docs/decisions.md`: 有効期間と周期の設計（30 番）と `businessDaysBetween` の範囲（31 番）を足し、6 番（契約の項目に `names` を追記）・13 番と 16 番（その月にない日の扱いが `dueDate`・`closingMonth` と繰り返しの規則で違うことの相互参照）・14 番（土曜日を避ける方法は個別の日付での上書き、振替と有効期間）・15 番（走査の範囲）の記述を直した

### 開発

- サイズの上限（`size-limits.json`）を上げた
- 性質のテストで、有効期間と周期のある規則も作るようにした

## [0.9.1] - 2026-10-18

ライブラリのコードは 0.9.0 と同じ。

### Changed

- README: スケジュールの `daysBetween` を `holiday` だけで絞ると、`dates`・`annual` で値を決めた祝日（特別営業日など）も含まれることと、それを除く絞り込み（`reason` が `"date"`・`"annual"` の日を除く）の例を足した

### 開発

- ブラウザーでの確認の Edge の起動オプションに、`--disable-dev-shm-usage` と `--disable-gpu` を足した

## [0.9.0] - 2026-10-18

### Migration

作業は要りません（機能の追加だけ）。時刻を必ず持つ入力では `time` の型が `string` になったので、これまでの `null` の分岐は不要になります（残しても動く）。バージョンごとの作業は [docs/migration.md](./docs/migration.md) にまとめた。

### Added

- 期間の日ごとの情報を返す `daysBetween(from, to)` を、スケジュール（`ScheduleDay` の配列）と営業日カレンダー（`DayInfo` の配列）に追加した。両端を含み、`from` が `to` より後なら `invalid-range`。祝日だけ欲しい場合は、結果を `holiday` で絞る
- 時刻を必ず持つ入力の型 `DateTimeInput`（`Date`・Temporal の `Instant`・`ZonedDateTime`・`PlainDateTime`・`"YYYY-MM-DDTHH:mm…"` の文字列）と、`TemporalDateTimeLike` を追加した

### Changed

- `civilOf`（スケジュール・営業日カレンダー）・`toDateTimeParts`・`toJapanDateTime` に、`DateTimeInput` を渡したときは `time` の型を `string` とするオーバーロードを加えた。返す値は変わらない。`CivilDateTimeParts` は時刻の型を引数に取る型になった（省略時はこれまでと同じ `string | null`）
- README: スケジュールの `dayInfo` の `reason` は値を決めた規則であり、祝日の規則が `"weekday"` のときは祝日でも `"weekday"` になること（祝日かどうかは `holiday` で判定する）を書いた。`createCalendar`・`createSchedule` は作ったものを使い回すのが基本で、作成のコストも小さいこと（測った値）を書いた。1 つの配列で持つ特別営業日を `dates` と `annual` に振り分ける例と、型定義の確認の範囲（CI で `moduleResolution` の `node16`・`nodenext`・`bundler`、0.9.0 の時点で TypeScript 5.0・5.5・5.8 も手作業で確認）を足した
- README のサイズの値を測り直した（ルート約 7.5KB・日本の祝日込み約 9.0KB・英国の祝日込み約 9.1KB。0.9.0 で測定）
- 移行ガイド（`docs/migration.md`）を追加した。0.2.0〜0.9.0 で利用者がする作業をバージョンごとにまとめた

### 開発

- `pnpm check` で、利用者のプロジェクトとして公開する型定義を型チェックするようにした
- GOV.UK の監視を、外部の cron サービス（cron-job.org）から `workflow_dispatch` で起動する形にした（毎日 06:00 日本時間）
- ブラウザーでの確認（`scripts/test-browsers.ts`）に時間制限を設けた

## [0.8.1] - 2026-10-18

ライブラリのコードは 0.8.0 と同じ。動作を確かめる環境を広げ、README の記述を確かめた範囲に合わせた。

### Changed

- README の動作環境の記述を、CI で確かめた範囲に合わせた。「Node.js・ブラウザー・エッジランタイムで動作」を、確かめている環境（Node.js・Chrome・Firefox・Edge・Safari・Cloudflare Workers）の明記に改め、確かめていない環境（Deno・Bun・Vercel の Edge Runtime など）も書いた。Temporal は形で判別していることと、本物の Temporal を備えた環境では CI で確かめていることを書いた。サイズの値に測ったバージョン（0.8.1）を添えた。エラーコードの一覧に `invalid-input` を足した
- README に、CI で確かめている Node.js のバージョン（22.12・22・24・26）と、CommonJS の `require()` で読み込めることを CI で確かめていることを書いた。Node.js 22.12 では `require()` での読み込みに実験的な機能の警告が出ることも書いた（結果には影響しない）。`engines`（`>=22.12`）は変わらない

### 開発

- 公開する `dist` を ESM（`import`）と CommonJS（`require()`）で確かめるテスト（`pnpm test:compat`）を追加し、`pnpm check` に含めた
- CI に、公開する `dist` をブラウザーと Cloudflare Workers で確かめるジョブを追加した
- `pnpm check` で、README（英語・日本語）のコード例を実行し、コメントに書いた結果と比べるようにした
- `pnpm check`（`scripts/check-package.ts`）で、`src` が Node.js 固有の機能を使っていないことを確かめるようにした
- 自前のスクリプトとテストで Node.js の警告が出たら失敗にするようにした
- `pnpm check` の最初に、開発用のツールのバージョンを確かめる `scripts/check-toolchain.ts` を追加した
- GOV.UK の監視のワークフローに、手動実行の入力 `simulate` を追加した（`pnpm verify:govuk --simulate`）
- `pnpm check` のパッケージの中身の検査（`npm pack --dry-run`）を、Windows で Node.js の非推奨の警告（DEP0190）が出ない形で npm を起動するようにした

## [0.8.0] - 2026-10-17

### Added

- 英国の bank holidays の提供元を `bizdays-toolkit/uk` に追加した。地域ごとに `england`（`GB-ENG`）・`wales`（`GB-WLS`）・`scotland`（`GB-SCT`）・`northernIreland`（`GB-NIR`）の 4 つで、タイムゾーンは `Europe/London`、対応年は 2012〜2099 年。2012 年から GOV.UK が公表している最後の年（2028 年）までのすべての日付と名称が、GOV.UK のデータ（現在の `https://www.gov.uk/bank-holidays.json` と、それより前の年は GOV.UK の公式リポジトリ alphagov/calendars・alphagov/frontend の履歴）と一致することをテストで確かめている。それより後の年は規則による予測（`confirmed: false`）。GOV.UK では England と Wales が 1 つの区分だが、別の提供元にした（日付は現在同じ）。Wales の祝日には、GOV.UK のウェールズ語版の名称を `names.cy` に付ける。種別（`kind`）は `"regular"`（毎年の祝日。布告で移動した年を含む）・`"substitute"`（振替）・`"special"`（布告による臨時の祝日）で、型は `UkHolidayKind`・`KnownUkHolidayKind`・`UkHoliday`
- `pnpm verify:govuk`（`scripts/verify-govuk.ts`）を追加した。GOV.UK の JSON とウェールズ語の名称（alphagov/frontend の翻訳ファイル）を取得し、ライブラリの計算結果・テスト用フィクスチャと照合する

### Changed

- 公式データの反映（法改正・官報公表・布告による祝日の新設・移動・臨時の祝日、春分・秋分の日の確定、GOV.UK の新しい年の公表）を、マイナーバージョンではなく**パッチバージョン**で公開する方針に改めた（RELEASING.md）。0.x の期間は `^0.8.0` が 0.9.0 を受け取らないため、マイナーバージョンでは臨時の祝日が利用者に届かない。パッチバージョンなら 0.x でも 1.0.0 以降でも、`^`・`~` のどちらの指定にも届く
- README を英語を既定にした（`README.md`）。日本語版は `docs/README.ja.md` に移し、それぞれの冒頭に切り替えのリンクを置いた。npm に公開するファイルは変わらない（日本語版はパッケージに含めない。npm はルートの `README*` を `files` の指定にかかわらず含めるため、`docs/` に置く）。README に書いている minify + gzip のサイズを測り直し、日本の祝日込みを約 8.5KB から約 9.0KB に直した（0.7.0 までの記載が実際より小さかった）。英国の祝日込みは約 9.0KB

### 開発

- `bizdays-toolkit/uk` のサイズの上限（gzip 6,700 バイト）を `size-limits.json` に追加した（エントリーの追加。計測は 6,225 バイト）
- GOV.UK の bank holidays を毎日照合するワークフロー（`.github/workflows/govuk-watch.yml`。`pnpm verify:govuk`）を追加した
- CI に、ワークフローを actionlint で検査するジョブを追加した
- CI・リリース・監視のワークフローの Node.js を 24.21.0 から 24.22.0 に、pnpm を 12.11.2 から 12.14.0 に上げた（手元の開発環境に合わせる）
- `pnpm check`（`scripts/check-package.ts`）で、`README.md` と `docs/README.ja.md` の見出しの数（段ごと）とコードブロックの数が一致し、互いへの切り替えのリンクがあることを確かめるようにした
- `pnpm check` が、パッケージの中身を `files` の指定からの推定ではなく、実際の `npm pack --dry-run --json` の結果で確かめるようにした

## [0.7.0] - 2026-10-16

### Added

- 祝日（`Holiday`）に、ほかの言語の名称 `names`（省略可能。キーは BCP 47 の言語タグの正規の形。例: `{ "zh-Hant": "…", ko: "…" }`）を追加した。利用者が実装した提供元が付けた `names` を、提供元のデータの検証で確かめ（誤りは `invalid-provider-data`）、複製・凍結して返す。同梱の日本の祝日は `names` を持たない（公式の出典がある日本語・英語の名称だけを同梱する）

### 開発

- `size-limits.json` の値を上げるときの理由は、コミットメッセージではなく CHANGELOG の「開発」に書く取り決めにした

## [0.6.0] - 2026-10-16

### Added

- 日付の調整 `adjust(input, { convention })`（営業日カレンダー）: 休業日を `"following"`（翌営業日）・`"preceding"`（前営業日）・`"modified-following"`（翌営業日。月が変わるなら前営業日）・`"modified-preceding"`（前営業日。月が変わるなら翌営業日）で調整する。月が変わるかは調整する前の日付の月と比べる
- 月の営業日（営業日カレンダー）: `nthBusinessDayOfMonth(month, n)`（負なら月末から数える。-1 は最終営業日）・`firstBusinessDayOfMonth(month)`・`lastBusinessDayOfMonth(month)`
- 月の期日 `dueDate(month, { day, convention })`（営業日カレンダー）: その月の `day` 日（-1 は末日。その月にない日は末日に読み替える）を `convention` で調整する
- 月の計算（ルート）: `monthOf(dateOrMonth, offset?)`（n か月後の月 `"YYYY-MM"`）・`closingMonth(date, closingDay)`（締め日で区切ったときの月）
- 例外のコード `invalid-month`（月 `"YYYY-MM"` の誤り）
- 型: `BusinessDayConvention`・`AdjustOptions`・`DueDateOptions`・`MonthString`

### 開発

- `pnpm check`（`scripts/check-package.ts`）で、CHANGELOG のバージョンの節の並び・日付と、末尾のリンク定義が節とそろっていることを確かめるようにした（0.5.0 でリンク定義の更新漏れがあったため）
- リリースのワークフローで、CHANGELOG の日付が `YYYY-MM-DD` のまま・見出しがないときの表示を分かりやすくした（止まる条件は変わらない）
- 月の計算と日付の調整の性質のテストを追加
- サイズの上限を上げた
- `docs/decisions.md` に 16 番目（日付の調整と月の期日の設計）を追加

## [0.5.0] - 2026-10-16

### Added

- 規則の診断（サブパス `bizdays-toolkit/diagnose`）: `diagnoseCalendar(options)`・`diagnoseSchedule(options)`。例外を投げず、`{ severity, code, path, message, relatedPath? }` の配列を返す
  - `error`: 作成で例外になる誤り（`code` は例外と同じ）。作成時は最初の 1 件で止まるが、診断ではすべて返す。祝日の提供元が返すデータは、対応年のすべての年を調べる（`invalid-provider-data`）
  - `warning`: `unknown-option`（知らないキー。近い既知のキーを候補に挙げる）・`shadowed`（同じ種類の先の規則に完全に含まれる。`relatedPath` に先の規則）・`never-matches`（当てはまる日がない繰り返しの規則）・`out-of-range`（個別の日付が祝日の提供元の対応年の外）・`no-business-day`（営業日が 1 日もない設定）
  - `info`: `redundant`（取り除いても結果が変わらない規則）
- 型: `Diagnostic`・`DiagnosticSeverity`・`DiagnosticCode`・`KnownDiagnosticCode`

### Removed

- `HolidayRule` 型（0.4.0 で非推奨）: `HolidayValueRule` を使う

### 開発

- 診断の性質のテスト: 使われない・取り除いても変わらないと診断した規則を実際に取り除き、結果が変わらないことを乱数の設定で確かめる
- サイズの上限に `./diagnose` を追加
- `docs/decisions.md` に 15 番目（規則の診断の設計）を追加

## [0.4.0] - 2026-10-15

### Added

- 繰り返しの規則: 毎週（`{ weekday }`）・毎月の第 n 曜日（`{ weekday, nth }`。`nth` は 1〜5 と -1（最終））・毎月の日（`{ day }`。`day` は 1〜31 と -1（末日））。どれにも月の絞り込み（`months`）を付けられる。営業日カレンダーの `closedRecurring`・`openRecurring`、スケジュールの `recurring`
- 祝日に当たったときの扱いを規則ごとに選ぶ `onHolidayRule`: `"under-holiday"`（祝日の扱いに従う。既定）・`"over-holiday"`（祝日でも当てはめる）・`"after-holiday"`（祝日でない翌日に振り替える。「月曜休館（祝日の場合は翌平日）」など）
- `dayInfo()` の `shiftedFrom`: 振替で決まった日の、振替の元の日付
- 判定の理由に `"recurring"`（スケジュール）・`"open-recurring"`・`"closed-recurring"`（営業日カレンダー）を追加
- 型: `RecurringRule`・`RecurringValue`・`RecurringPattern`・`WeekdayPattern`・`DayOfMonthPattern`・`OnHolidayRule`・`Nth`・`DayOfMonth`・`Month`・`HolidayValueRule`

### Deprecated

- `HolidayRule` 型: `HolidayValueRule` に改名した（繰り返しの規則の `onHolidayRule` と紛れないため）。旧名は同じ型の別名として残し、次以降のマイナーバージョンで削除する

### 開発

- 性能の計測（`pnpm bench`、依存なし）を追加
- README に繰り返しの規則の節と、よくある設定の例を追加

## [0.3.1] - 2026-10-15

ライブラリのコード・公開する API・祝日データに変更はありません。開発の検査を強めたバージョンです。

### 開発

- lint に oxlint（1.88.0）を導入し、`pnpm check` と CI で実行するようにした（`.oxlintrc.json`）
- 型チェックを強めた
- oxfmt を 0.73.0 に更新
- 改行コードを LF に統一した（`.gitattributes`）

## [0.3.0] - 2026-10-15

1.0.0 に向けて、将来の機能追加で利用者のコードが壊れにくい作りにしました。機能の追加はありません。

### Added

- 例外に `code` を付けた（`invalid-date`・`invalid-range`・`no-business-day` など）。例外は従来どおり `RangeError`・`TypeError`・`Error` のインスタンス。`isBizdaysError()` で判定できる
- `KnownDayReason`・`KnownScheduleReason`・`KnownJapaneseHolidayKind`・`KnownErrorCode`: 既知の値だけの閉じた型（網羅を型で確かめたい場合に使う）
- 祝日の提供元（`HolidayProvider`）の形式を作る時点で、返したデータを年ごとに初めて使うときに検証する（誤りは `invalid-provider`・`invalid-provider-data`）

### Changed

- `DayReason`・`ScheduleReason`・`JapaneseHolidayKind` を「開いた型」にした（将来のバージョンで値が増えても、利用者のコードがコンパイルエラーにならない）。値を列挙して分岐しているコードは「その他」の分岐が必要になる
- 設定の誤りのメッセージに、設定の中の位置（例: `closedDates[1].date`）を入れた
- 設定は作る時点で複製するようにした（作ったあとに元の配列を書き換えても、結果が変わらない）
- 提供元が返した祝日は、契約の項目だけを持つ変更できないオブジェクトにして返す
- 別の実行環境（iframe・`vm`）で作られた `Date` も受け付けるようにした

### Removed

- `vernalEquinoxDay`・`autumnalEquinoxDay`（`bizdays-toolkit/jp`）: 祝日の計算の内部の手段のため非公開にした
- `nthWeekdayOfMonth`: 内部の関数のため非公開にした

### 開発

- 品質の確認を追加: タイムゾーン（`TZ`）を変えたテスト、性質のテスト、型のテスト、サイズの上限（`size-limits.json`）、公開 API のスナップショット（`etc/api.md`）
- 互換性の約束と安定度の表示（`@public`・`@beta`）を RELEASING.md に、設計上の決定を `docs/decisions.md` に記載
- `SECURITY.md` を追加（脆弱性の非公開の報告先）

## [0.2.0] - 2026-10-14

### Added

- `createSchedule()`: 曜日・祝日・毎年の月日・個別の日付の規則から、日ごとに任意の値（営業時間など）を返すスケジュール。祝日の値は `"weekday"`（曜日どおり）・`{ sameAs: 曜日 }`（その曜日の値）・`{ value }`（指定の値）から選べる。`valueOn`・`dayInfo`（値を決めた規則と祝日の情報付き）
- `civilOf()`（営業日カレンダー・スケジュール）、`toDateTimeParts()`、`toJapanDateTime()`（`bizdays-toolkit/jp`）: 入力を、タイムゾーンでの暦日と時刻（`"HH:mm"`）に変換する

### Changed

- 営業日カレンダー（`createCalendar`）を、値が真偽値のスケジュールとして作り直した。判定の優先順位と結果は変わらない

## [0.1.2] - 2026-10-12

ライブラリのコードと祝日データに変更はありません。

### Changed

- npm への公開を staged publishing に変更した。GitHub Actions はバージョンをステージするだけで、メンテナーが npmjs.com で 2FA 付きで承認するまで利用者には届かない。npm の Trusted Publisher の設定でも直接公開（npm publish）を許可しないようにした。GitHub Release は下書きで作成し、承認後に公開する
- README のロゴの配色を変更した。文字（「bizdays」の緑と「-toolkit」の灰色）とカレンダーの留め具は、ライト・ダークどちらの背景でも読める両テーマ共通の中間色にし、アイコンの配色だけを `<picture>` でテーマに合わせて切り替える。`<picture>` の切り替えは GitHub のテーマ設定ではなく OS の設定に従うため、両者が食い違うと反対の背景にロゴが表示されて読みにくかった

## [0.1.1] - 2026-10-12

ライブラリのコードと祝日データに変更はありません。

### Changed

- README の先頭にロゴとバッジ（npm のバージョン・CI・ライセンス・Node.js の対応バージョン・依存ゼロ・型定義同梱）を追加
- CI・リリースのワークフローで Node.js・npm・pnpm・ランナーのバージョンを固定（Node.js 22.23.3 / 24.21.0、npm 12.2.0、pnpm 12.11.2、ubuntu-24.04）。セットアップは共通のアクション（`.github/actions/setup-toolchain`）にまとめた
- リリースのワークフローで、同じバージョンがすでに npm にある場合は公開前に止めるようにした
- 開発用の依存（devDependencies）をバージョンの完全一致で固定

## [0.1.0] - 2026-10-11

### Added

- `createCalendar()`: 祝日・定休日の曜日・毎年の休業日（年をまたぐ期間を含む）・臨時休業日・臨時営業日を組み合わせた営業日カレンダー
- 営業日の判定と計算: `isBusinessDay`・`dayInfo`（判定の理由付き）・`nextBusinessDay`・`previousBusinessDay`・`businessDayOnOrAfter`（締め時刻 `cutoff`）・`businessDayOnOrBefore`・`addBusinessDays`・`businessDaysBetween`・`listBusinessDays`
- 祝日の扱い `holidayPolicy`（`closed` / `open` / `ignore`）
- 日時の入力: `YYYY-MM-DD`・ISO 8601 日時（オフセット付きは瞬間）・`Date`・Temporal 互換オブジェクト。カレンダーのタイムゾーンで暦日に変換
- 祝日の提供元のインターフェース `HolidayProvider`（他の国・地域を追加できる）
- `bizdays-toolkit/jp`: 日本の祝日（1955〜2099 年）。国民の祝日・振替休日・国民の休日・皇室行事による休日

### Data

- 日本: 2026 年 2 月の官報（2027 年の春分・秋分の日）まで反映（`dataVersion: "2026-02"`、`confirmedThrough: 2027`）

[Unreleased]: https://github.com/inohan77/bizdays-toolkit/compare/v0.32.0...HEAD
[0.32.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.9...v0.32.0
[0.31.9]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.8...v0.31.9
[0.31.8]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.7...v0.31.8
[0.31.7]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.6...v0.31.7
[0.31.6]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.5...v0.31.6
[0.31.5]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.4...v0.31.5
[0.31.4]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.3...v0.31.4
[0.31.3]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.2...v0.31.3
[0.31.2]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.1...v0.31.2
[0.31.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.31.0...v0.31.1
[0.31.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.9...v0.31.0
[0.30.9]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.8...v0.30.9
[0.30.8]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.7...v0.30.8
[0.30.7]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.6...v0.30.7
[0.30.6]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.5...v0.30.6
[0.30.5]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.4...v0.30.5
[0.30.4]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.3...v0.30.4
[0.30.3]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.2...v0.30.3
[0.30.2]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.1...v0.30.2
[0.30.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.30.0...v0.30.1
[0.30.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.22.2...v0.30.0
[0.22.2]: https://github.com/inohan77/bizdays-toolkit/compare/v0.22.1...v0.22.2
[0.22.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.22.0...v0.22.1
[0.22.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.21.4...v0.22.0
[0.21.4]: https://github.com/inohan77/bizdays-toolkit/compare/v0.21.3...v0.21.4
[0.21.3]: https://github.com/inohan77/bizdays-toolkit/compare/v0.21.2...v0.21.3
[0.21.2]: https://github.com/inohan77/bizdays-toolkit/compare/v0.21.1...v0.21.2
[0.21.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.21.0...v0.21.1
[0.21.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.17.1...v0.18.0
[0.17.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.14.1...v0.15.0
[0.14.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/inohan77/bizdays-toolkit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/inohan77/bizdays-toolkit/releases/tag/v0.1.0
