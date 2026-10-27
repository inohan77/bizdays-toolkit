# bizdays-toolkit API report

<!-- 自動生成のファイル。直接編集せず、pnpm api:update で更新する。 -->
<!-- 差分は、RELEASING.md の「互換性の約束」に沿った変更かをレビューで確かめる。 -->

## bizdays-toolkit

### addDays (@public)

```ts
export declare function addDays(date: DateString, n: number): DateString;
```

### AdjustOptions (@public)

```ts
export interface AdjustOptions {
    readonly convention: BusinessDayConvention;
}
```

### AnnualDate (@public)

```ts
export type AnnualDate = string | ({
    readonly date: string;
    readonly name?: string;
} & EffectivePeriod);
```

### AnnualRange (@public)

```ts
export interface AnnualRange extends EffectivePeriod {
    readonly from: string;
    readonly to: string;
    readonly name?: string;
}
```

### AnnualRangeValue (@public, @deprecated)

```ts
export type AnnualRangeValue<Value> = ScheduleAnnualRange<Value>;
```

### AnnualValue (@public, @deprecated)

```ts
export type AnnualValue<Value> = ScheduleAnnualDate<Value>;
```

### BusinessDayConvention (@public)

```ts
export type BusinessDayConvention = "following" | "preceding" | "modified-following" | "modified-preceding";
```

### BusinessDayOfMonth (@public)

```ts
export type BusinessDayOfMonth = number;
```

### BusinessDayOfMonthPattern (@public)

```ts
export interface BusinessDayOfMonthPattern {
    readonly businessDayOfMonth: BusinessDayOfMonth | readonly BusinessDayOfMonth[];
    readonly months?: readonly Month[];
    readonly calendar?: Calendar;
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly dayOfMonth?: never;
    readonly dayAfterHoliday?: never;
    readonly dayBeforeHoliday?: never;
    readonly holiday?: never;
    readonly weekdays?: never;
    readonly kinds?: never;
    readonly keys?: never;
    readonly skipWeekdays?: never;
    readonly cycle?: never;
    readonly positions?: never;
    readonly businessDayOfWeek?: never;
    readonly weekStart?: never;
    readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
}
```

### BusinessDayOfWeek (@public)

```ts
export type BusinessDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7 | -1 | -2 | -3 | -4 | -5 | -6 | -7;
```

### BusinessDayOfWeekPattern (@public)

```ts
export interface BusinessDayOfWeekPattern {
    readonly businessDayOfWeek: BusinessDayOfWeek | readonly BusinessDayOfWeek[];
    readonly weekStart: Weekday;
    readonly months?: readonly Month[];
    readonly calendar?: Calendar;
    readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly dayOfMonth?: never;
    readonly businessDayOfMonth?: never;
    readonly dayAfterHoliday?: never;
    readonly dayBeforeHoliday?: never;
    readonly holiday?: never;
    readonly weekdays?: never;
    readonly kinds?: never;
    readonly keys?: never;
    readonly skipWeekdays?: never;
    readonly cycle?: never;
    readonly positions?: never;
}
```

### BusinessDayOnOrAfterOptions (@public)

```ts
export interface BusinessDayOnOrAfterOptions {
    readonly cutoff?: string;
}
```

### BusinessDayOptions (@public, @deprecated)

```ts
export type BusinessDayOptions = BusinessDayOnOrAfterOptions;
```

### Calendar (@public)

```ts
export interface Calendar<Kind extends string = string> extends HolidayLookup<Kind> {
    dayInfoOn(input: DateInput): DayInfo<Kind>;
    dayInfo(input: DateInput): DayInfo<Kind>;
    daysBetween(from: DateInput, to: DateInput): readonly DayInfo<Kind>[];
    isBusinessDay(input: DateInput): boolean;
    nextBusinessDay(input: DateInput): DateString;
    previousBusinessDay(input: DateInput): DateString;
    businessDayOnOrAfter(input: DateInput, options?: BusinessDayOnOrAfterOptions): DateString;
    businessDayOnOrBefore(input: DateInput): DateString;
    addBusinessDays(input: DateInput, n: number): DateString;
    diffBusinessDays(from: DateInput, to: DateInput): number;
    businessDatesBetween(from: DateInput, to: DateInput): readonly DateString[];
    businessDaysBetween(from: DateInput, to: DateInput): number;
    listBusinessDays(from: DateInput, to: DateInput): readonly DateString[];
    adjust(input: DateInput, options: AdjustOptions): DateString;
    nthBusinessDayOfMonth(month: MonthString, n: number): DateString;
    firstBusinessDayOfMonth(month: MonthString): DateString;
    lastBusinessDayOfMonth(month: MonthString): DateString;
    dueDate(month: MonthString, options: DueDateOptions): DateString;
    closingMonth(input: DateInput, closingDayOfMonth: number, options: AdjustOptions): MonthString;
    closingPeriod(input: DateInput | MonthString, closingDayOfMonth: number, options: AdjustOptions): {
        readonly from: DateString;
        readonly to: DateString;
    };
}
```

### CalendarFromScheduleOptions (@public)

```ts
export interface CalendarFromScheduleOptions {
    readonly searchDayLimit?: number;
    readonly maxSearchDays?: number;
}
```

### CalendarOptions (@public)

```ts
export interface CalendarOptions<Kind extends string = string> extends HolidaySourceOptions<Kind> {
    readonly closedWeekdays?: readonly Weekday[];
    readonly closedAnnualDates?: readonly (AnnualDate | AnnualRange)[];
    readonly closedDates?: readonly (SpecificDate | DateRange)[];
    readonly openDates?: readonly (SpecificDate | DateRange)[];
    readonly closedRecurringRules?: readonly RecurringRule<Kind>[];
    readonly openRecurringRules?: readonly RecurringRule<Kind>[];
    readonly holidayPolicy?: HolidayPolicy;
    readonly searchDayLimit?: number;
    readonly closedAnnual?: readonly (AnnualDate | AnnualRange)[];
    readonly closedRecurring?: readonly RecurringRule<Kind>[];
    readonly openRecurring?: readonly RecurringRule<Kind>[];
    readonly maxSearchDays?: number;
}
```

### CivilDateTimeParts (@public)

```ts
export interface CivilDateTimeParts<Time extends string | null = string | null> {
    readonly date: DateString;
    readonly time: Time;
}
```

### closingMonth (@public)

```ts
export declare function closingMonth(date: DateString, closingDayOfMonth: number): MonthString;
```

### closingPeriod (@public)

```ts
export declare function closingPeriod(input: DateString | MonthString, closingDayOfMonth: number): {
    readonly from: DateString;
    readonly to: DateString;
};
```

### combineCalendars (@public)

```ts
export declare function combineCalendars<Kind extends string = string>(calendars: readonly Calendar<Kind>[], options: CombineCalendarsOptions): Calendar<Kind>;
```

### CombineCalendarsOptions (@public)

```ts
export interface CombineCalendarsOptions {
    readonly open: "all" | "any";
    readonly searchDayLimit?: number;
    readonly maxSearchDays?: number;
}
```

### CombineOptions (@public, @deprecated)

```ts
export type CombineOptions = CombineCalendarsOptions;
```

### createCalendar (@public)

```ts
export declare function createCalendar<Kind extends string = string>(options?: CalendarOptions<Kind>): Calendar<Kind>;
```

### createCalendarFromSchedule (@public)

```ts
export declare function createCalendarFromSchedule<Value, Kind extends string = string>(schedule: Schedule<Value, Kind>, isOpen: (value: Value) => boolean, options?: CalendarFromScheduleOptions): Calendar<Kind>;
```

### createSchedule (@public)

```ts
export declare function createSchedule<Value, Kind extends string = string>(options: ScheduleOptions<Value, Kind>): Schedule<Value, Kind>;
```

### CyclePattern (@public)

```ts
export interface CyclePattern {
    readonly cycle: number;
    readonly anchor: DateString;
    readonly positions: readonly number[];
    readonly months?: readonly Month[];
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly dayOfMonth?: never;
    readonly businessDayOfMonth?: never;
    readonly calendar?: never;
    readonly dayAfterHoliday?: never;
    readonly dayBeforeHoliday?: never;
    readonly holiday?: never;
    readonly weekdays?: never;
    readonly kinds?: never;
    readonly keys?: never;
    readonly skipWeekdays?: never;
    readonly businessDayOfWeek?: never;
    readonly weekStart?: never;
    readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
}
```

### DateInput (@public)

```ts
export type DateInput = string | Date | TemporalDateLike | TemporalInstantLike;
```

### DateRange (@public)

```ts
export interface DateRange {
    readonly from: DateString;
    readonly to: DateString;
    readonly name?: string;
}
```

### DateRangeValue (@public, @deprecated)

```ts
export type DateRangeValue<Value> = ScheduleDateRange<Value>;
```

### DateString (@public)

```ts
export type DateString = string;
```

### DateTimeInput (@public)

```ts
export type DateTimeInput = Date | TemporalInstantLike | TemporalDateTimeLike | `${number}-${number}-${number}T${string}`;
```

### DateValue (@public, @deprecated)

```ts
export type DateValue<Value> = ScheduleSpecificDate<Value>;
```

### DayAfterHolidayPattern (@public)

```ts
export interface DayAfterHolidayPattern<Kind extends string = string> {
    readonly dayAfterHoliday: true;
    readonly weekdays?: readonly Weekday[];
    readonly months?: readonly Month[];
    readonly kinds?: readonly Kind[];
    readonly keys?: readonly string[];
    readonly skipWeekdays?: readonly Weekday[];
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly dayOfMonth?: never;
    readonly businessDayOfMonth?: never;
    readonly calendar?: never;
    readonly dayBeforeHoliday?: never;
    readonly holiday?: never;
    readonly cycle?: never;
    readonly positions?: never;
    readonly businessDayOfWeek?: never;
    readonly weekStart?: never;
    readonly holidayOverlapPolicy?: never;
}
```

### DayBeforeHolidayPattern (@public)

```ts
export interface DayBeforeHolidayPattern<Kind extends string = string> {
    readonly dayBeforeHoliday: true;
    readonly weekdays?: readonly Weekday[];
    readonly months?: readonly Month[];
    readonly kinds?: readonly Kind[];
    readonly keys?: readonly string[];
    readonly skipWeekdays?: readonly Weekday[];
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly dayOfMonth?: never;
    readonly businessDayOfMonth?: never;
    readonly calendar?: never;
    readonly dayAfterHoliday?: never;
    readonly holiday?: never;
    readonly cycle?: never;
    readonly positions?: never;
    readonly businessDayOfWeek?: never;
    readonly weekStart?: never;
    readonly holidayOverlapPolicy?: never;
}
```

### DayInfo (@public)

```ts
export interface DayInfo<Kind extends string = string> {
    readonly date: DateString;
    readonly weekday: Weekday;
    readonly open: boolean;
    readonly businessDay: boolean;
    readonly reason: DayReason;
    readonly name?: string;
    readonly holiday?: Holiday<Kind>;
    readonly shiftedFrom?: DateString;
    readonly optionPath?: string;
    readonly rulePath?: string;
    readonly decidedBy?: number;
    readonly decidedByPath?: readonly number[];
}
```

### DayOfMonth (@public)

```ts
export type DayOfMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | -1;
```

### DayOfMonthPattern (@public)

```ts
export interface DayOfMonthPattern {
    readonly dayOfMonth: DayOfMonth | readonly DayOfMonth[];
    readonly months?: readonly Month[];
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly businessDayOfMonth?: never;
    readonly calendar?: never;
    readonly dayAfterHoliday?: never;
    readonly dayBeforeHoliday?: never;
    readonly holiday?: never;
    readonly weekdays?: never;
    readonly kinds?: never;
    readonly keys?: never;
    readonly cycle?: never;
    readonly positions?: never;
    readonly businessDayOfWeek?: never;
    readonly weekStart?: never;
}
```

### DayReason (@public)

```ts
export type DayReason = KnownDayReason | (string & {});
```

### diffDays (@public)

```ts
export declare function diffDays(from: DateString, to: DateString): number;
```

### DueDateOptions (@public)

```ts
export interface DueDateOptions {
    readonly dayOfMonth: DayOfMonth;
    readonly convention: BusinessDayConvention;
}
```

### EffectivePeriod (@public)

```ts
export interface EffectivePeriod {
    readonly effectiveFrom?: DateString;
    readonly effectiveTo?: DateString;
}
```

### ErrorCode (@public)

```ts
export type ErrorCode = KnownErrorCode | (string & {});
```

### Holiday (@public)

```ts
export interface Holiday<Kind extends string = string> {
    readonly date: DateString;
    readonly name: string;
    readonly nameEn: string;
    readonly names?: Readonly<Record<string, string>>;
    readonly kind: Kind;
    readonly key?: string;
    readonly confirmed: boolean;
}
```

### HolidayLookup (@public)

```ts
export interface HolidayLookup<Kind extends string = string> {
    readonly timeZone: string;
    readonly providers: readonly HolidayProvider<Kind>[];
    readonly outOfRangePolicy: "throw" | "ignore";
    readonly unconfirmedHolidayPolicy: "accept" | "throw";
    readonly outOfRange: "throw" | "ignore";
    readonly unconfirmedHolidays: "accept" | "throw";
    dateOf(input: DateInput): DateString;
    civilOf(input: DateTimeInput): CivilDateTimeParts<string>;
    civilOf(input: DateInput): CivilDateTimeParts;
    instantOf(date: DateString, time: string): Date;
    today(now?: Date): DateString;
    isHoliday(input: DateInput): boolean;
    holidayOn(input: DateInput): Holiday<Kind> | undefined;
    getHoliday(input: DateInput): Holiday<Kind> | undefined;
    holidaysInYear(year: number): readonly Holiday<Kind>[];
    holidaysBetween(from: DateInput, to: DateInput): readonly Holiday<Kind>[];
}
```

### HolidayOverlapPolicy (@public)

```ts
export type HolidayOverlapPolicy = "under-holiday" | "over-holiday" | "after-holiday";
```

### HolidayPattern (@public)

```ts
export interface HolidayPattern<Kind extends string = string> {
    readonly holiday: true;
    readonly kinds?: readonly Kind[];
    readonly keys?: readonly string[];
    readonly weekdays?: readonly Weekday[];
    readonly months?: readonly Month[];
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly dayOfMonth?: never;
    readonly businessDayOfMonth?: never;
    readonly calendar?: never;
    readonly dayAfterHoliday?: never;
    readonly dayBeforeHoliday?: never;
    readonly skipWeekdays?: never;
    readonly cycle?: never;
    readonly positions?: never;
    readonly businessDayOfWeek?: never;
    readonly weekStart?: never;
    readonly holidayOverlapPolicy?: never;
}
```

### HolidayPolicy (@public)

```ts
export type HolidayPolicy = "closed" | "open" | "ignore";
```

### HolidayProvider (@public)

```ts
export interface HolidayProvider<Kind extends string = string> {
    readonly id: string;
    readonly timeZone: string;
    readonly supportedYears: {
        readonly from: number;
        readonly to: number;
    };
    readonly dataVersion: string;
    readonly confirmedThrough?: number;
    holidaysInYear(year: number): readonly Holiday<Kind>[];
}
```

### HolidaySourceOptions (@public)

```ts
export interface HolidaySourceOptions<Kind extends string = string> {
    readonly holidayProvider?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
    readonly holidays?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
    readonly outOfRange?: "throw" | "ignore";
    readonly unconfirmedHolidays?: "accept" | "throw";
    readonly timeZone?: string;
    readonly outOfRangePolicy?: "throw" | "ignore";
    readonly unconfirmedHolidayPolicy?: "accept" | "throw";
}
```

### HolidayValueRule (@public, @deprecated)

```ts
export type HolidayValueRule<Value> = ScheduleHolidayPolicy<Value> | "weekday";
```

### isBizdaysError (@public)

```ts
export declare function isBizdaysError(error: unknown): error is Error & {
    readonly code: ErrorCode;
};
```

### isValidDate (@public)

```ts
export declare function isValidDate(input: unknown): input is DateString;
```

### KnownDayReason (@public)

```ts
export type KnownDayReason = "open-date" | "closed-date" | "open-annual" | "closed-annual" | "open-recurring" | "closed-recurring" | "holiday" | "closed-weekday" | "default" | "open-weekday";
```

### KnownErrorCode (@public)

```ts
export type KnownErrorCode = "invalid-date" | "invalid-month" | "invalid-annual-date" | "invalid-time" | "invalid-input" | "invalid-time-zone" | "invalid-range" | "invalid-weekday" | "invalid-argument" | "invalid-option" | "time-zone-conflict" | "out-of-range" | "unconfirmed-holiday" | "invalid-provider" | "invalid-provider-data" | "no-business-day";
```

### KnownScheduleDayReason (@public)

```ts
export type KnownScheduleDayReason = "date" | "annual" | "recurring" | "holiday" | "weekday";
```

### KnownScheduleReason (@public, @deprecated)

```ts
export type KnownScheduleReason = KnownScheduleDayReason;
```

### Month (@public)

```ts
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
```

### monthOf (@public)

```ts
export declare function monthOf(input: DateString | MonthString, offset?: number): MonthString;
```

### MonthString (@public)

```ts
export type MonthString = string;
```

### Nth (@public)

```ts
export type Nth = 1 | 2 | 3 | 4 | 5 | -1;
```

### OnHolidayRule (@public, @deprecated)

```ts
export type OnHolidayRule = HolidayOverlapPolicy;
```

### RecurringPattern (@public)

```ts
export type RecurringPattern<Kind extends string = string> = (WeekdayPattern & ({
    readonly holidayOverlapPolicy: "after-holiday";
    readonly skipWeekdays?: readonly Weekday[];
} | {
    readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
    readonly skipWeekdays?: never;
})) | (DayOfMonthPattern & ({
    readonly holidayOverlapPolicy: "after-holiday";
    readonly skipWeekdays?: readonly Weekday[];
} | {
    readonly holidayOverlapPolicy?: "under-holiday" | "over-holiday";
    readonly skipWeekdays?: never;
})) | BusinessDayOfMonthPattern | BusinessDayOfWeekPattern | DayAfterHolidayPattern<Kind> | DayBeforeHolidayPattern<Kind> | HolidayPattern<Kind> | CyclePattern;
```

### RecurringRule (@public)

```ts
export type RecurringRule<Kind extends string = string> = (Exclude<RecurringPattern<Kind>, BusinessDayOfMonthPattern | BusinessDayOfWeekPattern> | ((BusinessDayOfMonthPattern | BusinessDayOfWeekPattern) & {
    readonly calendar?: never;
})) & EffectivePeriod & {
    readonly name?: string;
    readonly onHolidayRule?: HolidayOverlapPolicy;
};
```

### RecurringValue (@public, @deprecated)

```ts
export type RecurringValue<Value, Kind extends string = string> = ScheduleRecurringRule<Value, Kind>;
```

### Schedule (@public)

```ts
export interface Schedule<Value, Kind extends string = string> extends HolidayLookup<Kind> {
    valueOn(input: DateInput): Value;
    dayInfoOn(input: DateInput): ScheduleDayInfo<Value, Kind>;
    dayInfo(input: DateInput): ScheduleDayInfo<Value, Kind>;
    daysBetween(from: DateInput, to: DateInput): readonly ScheduleDayInfo<Value, Kind>[];
}
```

### ScheduleAnnualDate (@public)

```ts
export interface ScheduleAnnualDate<Value> extends EffectivePeriod {
    readonly date: string;
    readonly value: Value;
    readonly name?: string;
}
```

### ScheduleAnnualRange (@public)

```ts
export interface ScheduleAnnualRange<Value> extends EffectivePeriod {
    readonly from: string;
    readonly to: string;
    readonly value: Value;
    readonly name?: string;
}
```

### ScheduleDateRange (@public)

```ts
export interface ScheduleDateRange<Value> {
    readonly from: DateString;
    readonly to: DateString;
    readonly value: Value;
    readonly name?: string;
}
```

### ScheduleDay (@public, @deprecated)

```ts
export type ScheduleDay<Value, Kind extends string = string> = ScheduleDayInfo<Value, Kind>;
```

### ScheduleDayInfo (@public)

```ts
export interface ScheduleDayInfo<Value, Kind extends string = string> {
    readonly date: DateString;
    readonly weekday: Weekday;
    readonly value: Value;
    readonly reason: ScheduleDayReason;
    readonly name?: string;
    readonly holiday?: Holiday<Kind>;
    readonly shiftedFrom?: DateString;
    readonly optionPath?: string;
    readonly rulePath?: string;
}
```

### ScheduleDayReason (@public)

```ts
export type ScheduleDayReason = KnownScheduleDayReason | (string & {});
```

### ScheduleHolidayPolicy (@public)

```ts
export type ScheduleHolidayPolicy<Value> = "ignore" | {
    readonly sameAs: Weekday;
} | {
    readonly value: Value;
};
```

### ScheduleOptions (@public)

```ts
export interface ScheduleOptions<Value, Kind extends string = string> extends HolidaySourceOptions<Kind> {
    readonly weekdayValues: readonly [
        Value,
        Value,
        Value,
        Value,
        Value,
        Value,
        Value
    ];
    readonly holidayPolicy?: ScheduleHolidayPolicy<Value>;
    readonly recurringRules?: readonly ScheduleRecurringRule<Value, Kind>[];
    readonly annualDates?: readonly (ScheduleAnnualDate<Value> | ScheduleAnnualRange<Value>)[];
    readonly holiday?: ScheduleHolidayPolicy<Value> | "weekday";
    readonly recurring?: readonly ScheduleRecurringRule<Value, Kind>[];
    readonly annual?: readonly (ScheduleAnnualDate<Value> | ScheduleAnnualRange<Value>)[];
    readonly dates?: readonly (ScheduleSpecificDate<Value> | ScheduleDateRange<Value>)[];
}
```

### ScheduleReason (@public, @deprecated)

```ts
export type ScheduleReason = ScheduleDayReason;
```

### ScheduleRecurringRule (@public)

```ts
export type ScheduleRecurringRule<Value, Kind extends string = string> = (Exclude<RecurringPattern<Kind>, BusinessDayOfMonthPattern | BusinessDayOfWeekPattern> | ((BusinessDayOfMonthPattern | BusinessDayOfWeekPattern) & {
    readonly calendar: Calendar;
})) & EffectivePeriod & {
    readonly name?: string;
    readonly onHolidayRule?: HolidayOverlapPolicy;
    readonly value: Value;
};
```

### ScheduleSpecificDate (@public)

```ts
export interface ScheduleSpecificDate<Value> {
    readonly date: DateString;
    readonly value: Value;
    readonly name?: string;
}
```

### SpecificDate (@public)

```ts
export type SpecificDate = DateString | {
    readonly date: DateString;
    readonly name?: string;
};
```

### TemporalDateLike (@public)

```ts
export interface TemporalDateLike {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour?: number;
    readonly minute?: number;
    readonly calendarId?: string;
}
```

### TemporalDateTimeLike (@public)

```ts
export interface TemporalDateTimeLike extends TemporalDateLike {
    readonly hour: number;
    readonly minute: number;
}
```

### TemporalInstantLike (@public)

```ts
export interface TemporalInstantLike {
    readonly epochMilliseconds: number;
}
```

### toDateString (@public)

```ts
export declare function toDateString(input: DateInput, timeZone: string): DateString;
```

### toDateTimeParts (@public)

```ts
export declare function toDateTimeParts(input: DateTimeInput, timeZone: string): CivilDateTimeParts<string>;
export declare function toDateTimeParts(input: DateInput, timeZone: string): CivilDateTimeParts;
```

### toInstant (@public)

```ts
export declare function toInstant(date: DateString, time: string, timeZone: string): Date;
```

### Weekday (@public)

```ts
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
```

### weekdayOf (@public)

```ts
export declare function weekdayOf(date: DateString): Weekday;
```

### WeekdayPattern (@public)

```ts
export interface WeekdayPattern {
    readonly weekday: Weekday;
    readonly nth?: Nth | readonly Nth[];
    readonly interval?: number;
    readonly anchor?: DateString;
    readonly months?: readonly Month[];
    readonly dayOfMonth?: never;
    readonly businessDayOfMonth?: never;
    readonly calendar?: never;
    readonly dayAfterHoliday?: never;
    readonly dayBeforeHoliday?: never;
    readonly holiday?: never;
    readonly weekdays?: never;
    readonly kinds?: never;
    readonly keys?: never;
    readonly cycle?: never;
    readonly positions?: never;
    readonly businessDayOfWeek?: never;
    readonly weekStart?: never;
}
```

## bizdays-toolkit/jp

### confirmedThrough (@public, @deprecated)

```ts
export declare const confirmedThrough: number;
```

### dataVersion (@public, @deprecated)

```ts
export declare const dataVersion: string;
```

### getHoliday (@public, @deprecated)

```ts
export declare function getHoliday(input: DateInput): JpHoliday | undefined;
```

### holidayOn (@public)

```ts
export declare function holidayOn(input: DateInput): JpHoliday | undefined;
```

### holidaysBetween (@public)

```ts
export declare function holidaysBetween(from: DateInput, to: DateInput): readonly JpHoliday[];
```

### holidaysInYear (@public)

```ts
export declare function holidaysInYear(year: number): readonly JpHoliday[];
```

### isHoliday (@public)

```ts
export declare function isHoliday(input: DateInput): boolean;
```

### JapaneseHoliday (@public, @deprecated)

```ts
export type JapaneseHoliday = JpHoliday;
```

### JapaneseHolidayKind (@public, @deprecated)

```ts
export type JapaneseHolidayKind = JpHolidayKind;
```

### jp (@public)

```ts
export declare const jp: HolidayProvider<JpHolidayKind>;
```

### JpHoliday (@public)

```ts
export type JpHoliday = Holiday<JpHolidayKind>;
```

### JpHolidayKind (@public)

```ts
export type JpHolidayKind = KnownJpHolidayKind | (string & {});
```

### KnownJapaneseHolidayKey (@public, @deprecated)

```ts
export type KnownJapaneseHolidayKey = KnownJpHolidayKey;
```

### KnownJapaneseHolidayKind (@public, @deprecated)

```ts
export type KnownJapaneseHolidayKind = KnownJpHolidayKind;
```

### KnownJpHolidayKey (@public)

```ts
export type KnownJpHolidayKey = "new-year" | "coming-of-age" | "national-foundation" | "emperors-birthday" | "vernal-equinox" | "showa" | "constitution-memorial" | "greenery" | "childrens" | "marine" | "mountain" | "respect-for-the-aged" | "autumnal-equinox" | "sports" | "culture" | "labor-thanksgiving";
```

### KnownJpHolidayKind (@public)

```ts
export type KnownJpHolidayKind = "regular" | "substitute" | "citizens" | "special";
```

### toJapanDate (@public, @deprecated)

```ts
export declare function toJapanDate(input: DateInput): DateString;
```

### toJapanDateTime (@public, @deprecated)

```ts
export declare function toJapanDateTime(input: DateTimeInput): CivilDateTimeParts<string>;
export declare function toJapanDateTime(input: DateInput): CivilDateTimeParts;
```

## bizdays-toolkit/uk

### confirmedThrough (@public, @deprecated)

```ts
export declare const confirmedThrough: number;
```

### dataVersion (@public, @deprecated)

```ts
export declare const dataVersion: string;
```

### england (@public)

```ts
export declare const england: HolidayProvider<UkHolidayKind>;
```

### KnownUkHolidayKey (@public)

```ts
export type KnownUkHolidayKey = "new-year" | "2nd-january" | "st-patricks" | "good-friday" | "easter-monday" | "early-may" | "spring" | "battle-of-the-boyne" | "summer" | "st-andrews" | "christmas" | "boxing-day";
```

### KnownUkHolidayKind (@public)

```ts
export type KnownUkHolidayKind = "regular" | "substitute" | "special";
```

### northernIreland (@public)

```ts
export declare const northernIreland: HolidayProvider<UkHolidayKind>;
```

### scotland (@public)

```ts
export declare const scotland: HolidayProvider<UkHolidayKind>;
```

### UkHoliday (@public)

```ts
export type UkHoliday = Holiday<UkHolidayKind>;
```

### UkHolidayKind (@public)

```ts
export type UkHolidayKind = KnownUkHolidayKind | (string & {});
```

### wales (@public)

```ts
export declare const wales: HolidayProvider<UkHolidayKind>;
```

## bizdays-toolkit/sg

### KnownSgHolidayKey (@public)

```ts
export type KnownSgHolidayKey = "new-year" | "chinese-new-year" | "good-friday" | "labour-day" | "hari-raya-puasa" | "vesak" | "hari-raya-haji" | "national-day" | "deepavali" | "christmas";
```

### KnownSgHolidayKind (@public)

```ts
export type KnownSgHolidayKind = "regular" | "substitute" | "special";
```

### sg (@public)

```ts
export declare const sg: HolidayProvider<SgHolidayKind>;
```

### SgHoliday (@public)

```ts
export type SgHoliday = Holiday<SgHolidayKind>;
```

### SgHolidayKind (@public)

```ts
export type SgHolidayKind = KnownSgHolidayKind | (string & {});
```

## bizdays-toolkit/fr

### alsaceMoselle (@public)

```ts
export declare const alsaceMoselle: HolidayProvider<FrHolidayKind>;
```

### FrHoliday (@public)

```ts
export type FrHoliday = Holiday<FrHolidayKind>;
```

### FrHolidayKind (@public)

```ts
export type FrHolidayKind = KnownFrHolidayKind | (string & {});
```

### KnownFrHolidayKey (@public)

```ts
export type KnownFrHolidayKey = "new-year" | "easter-monday" | "labour-day" | "victory-in-europe" | "ascension" | "pentecost-monday" | "bastille" | "assumption" | "all-saints" | "armistice" | "christmas" | "good-friday" | "saint-stephens";
```

### KnownFrHolidayKind (@public)

```ts
export type KnownFrHolidayKind = "regular";
```

### metropole (@public)

```ts
export declare const metropole: HolidayProvider<FrHolidayKind>;
```

## bizdays-toolkit/diagnose

### diagnoseCalendar (@public)

```ts
export declare function diagnoseCalendar(options?: CalendarOptions | object, diagnoseOptions?: DiagnoseOptions): readonly Diagnostic[];
```

### DiagnoseOptions (@public)

```ts
export interface DiagnoseOptions {
    readonly asOf?: DateString;
}
```

### diagnoseSchedule (@public)

```ts
export declare function diagnoseSchedule(options: ScheduleOptions<unknown> | object, diagnoseOptions?: DiagnoseOptions): readonly Diagnostic[];
```

### Diagnostic (@public)

```ts
export interface Diagnostic {
    readonly severity: DiagnosticSeverity;
    readonly code: DiagnosticCode;
    readonly path: string;
    readonly message: string;
    readonly relatedPath?: string;
}
```

### DiagnosticCode (@public)

```ts
export type DiagnosticCode = KnownDiagnosticCode | (string & {});
```

### DiagnosticSeverity (@public)

```ts
export type DiagnosticSeverity = "error" | "warning" | "info";
```

### KnownDiagnosticCode (@public)

```ts
export type KnownDiagnosticCode = KnownErrorCode | "unknown-option" | "deprecated-option" | "shadowed" | "never-matches" | "redundant" | "expired" | "counting-basis";
```

### migrateCalendarOptions (@public)

```ts
export declare function migrateCalendarOptions(options: object): OptionsMigration<CalendarOptions>;
```

### migrateScheduleOptions (@public)

```ts
export declare function migrateScheduleOptions<Value>(options: object): OptionsMigration<ScheduleOptions<Value>>;
```

### OptionChange (@public)

```ts
export interface OptionChange {
    readonly path: string;
    readonly from: string;
    readonly to: string;
    readonly conflicting?: boolean;
}
```

### OptionsMigration (@public)

```ts
export interface OptionsMigration<Options> {
    readonly options: Options;
    readonly changes: readonly OptionChange[];
}
```

## bizdays-toolkit/provider

### daysInMonth (@public, @deprecated)

```ts
export declare const daysInMonth: typeof lengthOfMonth;
```

### easterSunday (@public)

```ts
export declare function easterSunday(year: number): DateString;
```

### isLeapYear (@public)

```ts
export declare function isLeapYear(year: number): boolean;
```

### lengthOfMonth (@public)

```ts
export declare function lengthOfMonth(year: number, month: number): number;
```

### nthWeekdayOfMonth (@public)

```ts
export declare function nthWeekdayOfMonth(year: number, month: number, weekday: Weekday, n: number): DateString;
```

### substituteDays (@public, @deprecated)

```ts
export declare const substituteDays: typeof withSubstituteDays;
```

### SubstituteDaysOptions (@public, @deprecated)

```ts
export type SubstituteDaysOptions<Kind extends string> = WithSubstituteDaysOptions<Kind>;
```

### SubstituteDirection (@public)

```ts
export type SubstituteDirection = "next" | "previous";
```

### withSubstituteDays (@public)

```ts
export declare function withSubstituteDays<Kind extends string>(holidays: readonly Holiday<Kind>[], options: WithSubstituteDaysOptions<Kind>): Holiday<Kind>[];
```

### WithSubstituteDaysOptions (@public)

```ts
export interface WithSubstituteDaysOptions<Kind extends string> {
    readonly directions: Readonly<Partial<Record<Weekday, SubstituteDirection>>>;
    readonly kind: Kind;
    readonly renameSubstitute?: (holiday: Holiday<Kind>) => {
        readonly name: string;
        readonly nameEn: string;
    };
    readonly originalPolicy?: "keep" | "drop";
    readonly name?: (holiday: Holiday<Kind>) => {
        readonly name: string;
        readonly nameEn: string;
    };
    readonly original?: "keep" | "drop";
}
```
