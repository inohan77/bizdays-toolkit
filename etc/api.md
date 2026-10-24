# bizdays-toolkit API report

<!-- 自動生成のファイル。直接編集せず、pnpm api:update で更新する。 -->
<!-- 差分は、RELEASING.md の「互換性の約束」に沿った変更かをレビューで確かめる。 -->

## bizdays-toolkit

### addDays (@public)

```ts
export declare function addDays(date: DateString, days: number): DateString;
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

### AnnualRangeValue (@public)

```ts
export interface AnnualRangeValue<T> extends EffectivePeriod {
    readonly from: string;
    readonly to: string;
    readonly value: T;
    readonly name?: string;
}
```

### AnnualValue (@public)

```ts
export interface AnnualValue<T> extends EffectivePeriod {
    readonly date: string;
    readonly value: T;
    readonly name?: string;
}
```

### BusinessDayConvention (@public)

```ts
export type BusinessDayConvention = "following" | "preceding" | "modified-following" | "modified-preceding";
```

### BusinessDayOptions (@public)

```ts
export interface BusinessDayOptions {
    readonly cutoff?: string;
}
```

### Calendar (@public)

```ts
export interface Calendar<Kind extends string = string> extends HolidayLookup<Kind> {
    dayInfo(input: DateInput): DayInfo<Kind>;
    daysBetween(from: DateInput, to: DateInput): readonly DayInfo<Kind>[];
    isBusinessDay(input: DateInput): boolean;
    nextBusinessDay(input: DateInput): DateString;
    previousBusinessDay(input: DateInput): DateString;
    businessDayOnOrAfter(input: DateInput, options?: BusinessDayOptions): DateString;
    businessDayOnOrBefore(input: DateInput): DateString;
    addBusinessDays(input: DateInput, n: number): DateString;
    businessDaysBetween(from: DateInput, to: DateInput): number;
    listBusinessDays(from: DateInput, to: DateInput): readonly DateString[];
    adjust(input: DateInput, options: AdjustOptions): DateString;
    nthBusinessDayOfMonth(month: MonthString, n: number): DateString;
    firstBusinessDayOfMonth(month: MonthString): DateString;
    lastBusinessDayOfMonth(month: MonthString): DateString;
    dueDate(month: MonthString, options: DueDateOptions): DateString;
    closingMonth(input: DateInput, closingDay: number, options: AdjustOptions): MonthString;
    closingPeriod(input: DateInput | MonthString, closingDay: number, options: AdjustOptions): {
        readonly from: DateString;
        readonly to: DateString;
    };
}
```

### CalendarOptions (@public)

```ts
export interface CalendarOptions<Kind extends string = string> extends HolidaySourceOptions<Kind> {
    readonly closedWeekdays?: readonly Weekday[];
    readonly closedAnnual?: readonly (AnnualDate | AnnualRange)[];
    readonly closedDates?: readonly (SpecificDate | DateRange)[];
    readonly openDates?: readonly (SpecificDate | DateRange)[];
    readonly closedRecurring?: readonly RecurringRule<Kind>[];
    readonly openRecurring?: readonly RecurringRule<Kind>[];
    readonly holidayPolicy?: HolidayPolicy;
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
export declare function closingMonth(date: DateString, closingDay: number): MonthString;
```

### closingPeriod (@public)

```ts
export declare function closingPeriod(input: DateString | MonthString, closingDay: number): {
    readonly from: DateString;
    readonly to: DateString;
};
```

### combineCalendars (@public)

```ts
export declare function combineCalendars<Kind extends string = string>(calendars: readonly Calendar<Kind>[], options: CombineOptions): Calendar<Kind>;
```

### CombineOptions (@public)

```ts
export interface CombineOptions {
    readonly businessDay: "all" | "any";
    readonly maxSearchDays?: number;
}
```

### createCalendar (@public)

```ts
export declare function createCalendar<Kind extends string = string>(options?: CalendarOptions<Kind>): Calendar<Kind>;
```

### createCalendarFromSchedule (@public)

```ts
export declare function createCalendarFromSchedule<T, Kind extends string = string>(schedule: Schedule<T, Kind>, isOpen: (value: T) => boolean, options?: {
    readonly maxSearchDays?: number;
}): Calendar<Kind>;
```

### createSchedule (@public)

```ts
export declare function createSchedule<T, Kind extends string = string>(options: ScheduleOptions<T, Kind>): Schedule<T, Kind>;
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

### DateRangeValue (@public)

```ts
export interface DateRangeValue<T> {
    readonly from: DateString;
    readonly to: DateString;
    readonly value: T;
    readonly name?: string;
}
```

### DateString (@public)

```ts
export type DateString = string;
```

### DateTimeInput (@public)

```ts
export type DateTimeInput = Date | TemporalInstantLike | TemporalDateTimeLike | `${number}-${number}-${number}T${string}`;
```

### DateValue (@public)

```ts
export interface DateValue<T> {
    readonly date: DateString;
    readonly value: T;
    readonly name?: string;
}
```

### DayAfterHolidayPattern (@public)

```ts
export interface DayAfterHolidayPattern {
    readonly dayAfterHoliday: true;
    readonly weekdays?: readonly Weekday[];
    readonly months?: readonly Month[];
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly day?: never;
    readonly dayBeforeHoliday?: never;
    readonly holiday?: never;
    readonly kinds?: never;
}
```

### DayBeforeHolidayPattern (@public)

```ts
export interface DayBeforeHolidayPattern {
    readonly dayBeforeHoliday: true;
    readonly weekdays?: readonly Weekday[];
    readonly months?: readonly Month[];
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly day?: never;
    readonly dayAfterHoliday?: never;
    readonly holiday?: never;
    readonly kinds?: never;
}
```

### DayInfo (@public)

```ts
export interface DayInfo<Kind extends string = string> {
    readonly date: DateString;
    readonly weekday: Weekday;
    readonly businessDay: boolean;
    readonly reason: DayReason;
    readonly name?: string;
    readonly holiday?: Holiday<Kind>;
    readonly shiftedFrom?: DateString;
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
    readonly day: DayOfMonth | readonly DayOfMonth[];
    readonly months?: readonly Month[];
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly dayAfterHoliday?: never;
    readonly dayBeforeHoliday?: never;
    readonly holiday?: never;
    readonly weekdays?: never;
    readonly kinds?: never;
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
    readonly day: DayOfMonth;
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
    readonly confirmed: boolean;
}
```

### HolidayLookup (@public)

```ts
export interface HolidayLookup<Kind extends string = string> {
    readonly timeZone: string;
    readonly providers: readonly HolidayProvider<Kind>[];
    readonly outOfRange: "throw" | "ignore";
    readonly unconfirmedHolidays: "accept" | "throw";
    dateOf(input: DateInput): DateString;
    civilOf(input: DateTimeInput): CivilDateTimeParts<string>;
    civilOf(input: DateInput): CivilDateTimeParts;
    instantOf(date: DateString, time: string): Date;
    today(now?: Date): DateString;
    isHoliday(input: DateInput): boolean;
    getHoliday(input: DateInput): Holiday<Kind> | undefined;
    holidaysInYear(year: number): readonly Holiday<Kind>[];
    holidaysBetween(from: DateInput, to: DateInput): readonly Holiday<Kind>[];
}
```

### HolidayPattern (@public)

```ts
export interface HolidayPattern<Kind extends string = string> {
    readonly holiday: true;
    readonly kinds?: readonly Kind[];
    readonly weekdays?: readonly Weekday[];
    readonly months?: readonly Month[];
    readonly weekday?: never;
    readonly nth?: never;
    readonly interval?: never;
    readonly anchor?: never;
    readonly day?: never;
    readonly dayAfterHoliday?: never;
    readonly dayBeforeHoliday?: never;
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
    readonly holidays?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
    readonly timeZone?: string;
    readonly outOfRange?: "throw" | "ignore";
    readonly unconfirmedHolidays?: "accept" | "throw";
}
```

### HolidayValueRule (@public)

```ts
export type HolidayValueRule<T> = "weekday" | {
    readonly sameAs: Weekday;
} | {
    readonly value: T;
};
```

### isBizdaysError (@public)

```ts
export declare function isBizdaysError(error: unknown): error is Error & {
    readonly code: ErrorCode;
};
```

### isValidDate (@public)

```ts
export declare function isValidDate(value: unknown): value is DateString;
```

### KnownDayReason (@public)

```ts
export type KnownDayReason = "open-date" | "closed-date" | "open-annual" | "closed-annual" | "open-recurring" | "closed-recurring" | "holiday" | "closed-weekday" | "regular";
```

### KnownErrorCode (@public)

```ts
export type KnownErrorCode = "invalid-date" | "invalid-month" | "invalid-month-day" | "invalid-time" | "invalid-input" | "invalid-time-zone" | "invalid-range" | "invalid-weekday" | "invalid-argument" | "invalid-option" | "time-zone-conflict" | "out-of-range" | "unconfirmed-holiday" | "invalid-provider" | "invalid-provider-data" | "no-business-day";
```

### KnownScheduleReason (@public)

```ts
export type KnownScheduleReason = "date" | "annual" | "recurring" | "holiday" | "weekday";
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

### OnHolidayRule (@public)

```ts
export type OnHolidayRule = "under-holiday" | "over-holiday" | "after-holiday";
```

### RecurringPattern (@public)

```ts
export type RecurringPattern<Kind extends string = string> = WeekdayPattern | DayOfMonthPattern | DayAfterHolidayPattern | DayBeforeHolidayPattern | HolidayPattern<Kind>;
```

### RecurringRule (@public)

```ts
export type RecurringRule<Kind extends string = string> = RecurringPattern<Kind> & EffectivePeriod & {
    readonly name?: string;
    readonly onHolidayRule?: OnHolidayRule;
};
```

### RecurringValue (@public)

```ts
export type RecurringValue<T, Kind extends string = string> = RecurringRule<Kind> & {
    readonly value: T;
};
```

### Schedule (@public)

```ts
export interface Schedule<T, Kind extends string = string> extends HolidayLookup<Kind> {
    valueOn(input: DateInput): T;
    dayInfo(input: DateInput): ScheduleDay<T, Kind>;
    daysBetween(from: DateInput, to: DateInput): readonly ScheduleDay<T, Kind>[];
}
```

### ScheduleDay (@public)

```ts
export interface ScheduleDay<T, Kind extends string = string> {
    readonly date: DateString;
    readonly weekday: Weekday;
    readonly value: T;
    readonly reason: ScheduleReason;
    readonly name?: string;
    readonly holiday?: Holiday<Kind>;
    readonly shiftedFrom?: DateString;
    readonly rulePath?: string;
}
```

### ScheduleOptions (@public)

```ts
export interface ScheduleOptions<T, Kind extends string = string> extends HolidaySourceOptions<Kind> {
    readonly weekly: readonly [
        T,
        T,
        T,
        T,
        T,
        T,
        T
    ];
    readonly holiday?: HolidayValueRule<T>;
    readonly recurring?: readonly RecurringValue<T, Kind>[];
    readonly annual?: readonly (AnnualValue<T> | AnnualRangeValue<T>)[];
    readonly dates?: readonly (DateValue<T> | DateRangeValue<T>)[];
}
```

### ScheduleReason (@public)

```ts
export type ScheduleReason = KnownScheduleReason | (string & {});
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
    readonly day?: never;
    readonly dayAfterHoliday?: never;
    readonly dayBeforeHoliday?: never;
    readonly holiday?: never;
    readonly weekdays?: never;
    readonly kinds?: never;
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

### getHoliday (@public)

```ts
export declare function getHoliday(input: DateInput): JapaneseHoliday | undefined;
```

### holidaysBetween (@public)

```ts
export declare function holidaysBetween(from: DateInput, to: DateInput): readonly JapaneseHoliday[];
```

### holidaysInYear (@public)

```ts
export declare function holidaysInYear(year: number): readonly JapaneseHoliday[];
```

### isHoliday (@public)

```ts
export declare function isHoliday(input: DateInput): boolean;
```

### JapaneseHoliday (@public)

```ts
export type JapaneseHoliday = Holiday<JapaneseHolidayKind>;
```

### JapaneseHolidayKind (@public)

```ts
export type JapaneseHolidayKind = KnownJapaneseHolidayKind | (string & {});
```

### jp (@public)

```ts
export declare const jp: HolidayProvider<JapaneseHolidayKind>;
```

### KnownJapaneseHolidayKind (@public)

```ts
export type KnownJapaneseHolidayKind = "national" | "substitute" | "citizens" | "special";
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
export type KnownDiagnosticCode = KnownErrorCode | "unknown-option" | "shadowed" | "never-matches" | "redundant" | "expired";
```

## bizdays-toolkit/provider

### daysInMonth (@beta)

```ts
export declare function daysInMonth(year: number, month: number): number;
```

### easterSunday (@beta)

```ts
export declare function easterSunday(year: number): DateString;
```

### isLeapYear (@beta)

```ts
export declare function isLeapYear(year: number): boolean;
```

### nthWeekdayOfMonth (@beta)

```ts
export declare function nthWeekdayOfMonth(year: number, month: number, weekday: Weekday, n: number): DateString;
```
