# bizdays-toolkit API report

<!-- 自動生成のファイル。直接編集せず、pnpm api:update で更新する。 -->
<!-- 差分は、RELEASING.md の「互換性の約束」に沿った変更かをレビューで確かめる。 -->

## bizdays-toolkit

### addDays (@public)

```ts
export declare function addDays(date: DateString, days: number): DateString;
```

### AnnualDate (@public)

```ts
export type AnnualDate = string | {
    readonly date: string;
    readonly name?: string;
};
```

### AnnualRange (@public)

```ts
export interface AnnualRange {
    readonly from: string;
    readonly to: string;
    readonly name?: string;
}
```

### AnnualRangeValue (@public)

```ts
export interface AnnualRangeValue<T> {
    readonly from: string;
    readonly to: string;
    readonly value: T;
    readonly name?: string;
}
```

### AnnualValue (@public)

```ts
export interface AnnualValue<T> {
    readonly date: string;
    readonly value: T;
    readonly name?: string;
}
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
    isBusinessDay(input: DateInput): boolean;
    nextBusinessDay(input: DateInput): DateString;
    previousBusinessDay(input: DateInput): DateString;
    businessDayOnOrAfter(input: DateInput, options?: BusinessDayOptions): DateString;
    businessDayOnOrBefore(input: DateInput): DateString;
    addBusinessDays(input: DateInput, n: number): DateString;
    businessDaysBetween(from: DateInput, to: DateInput): number;
    listBusinessDays(from: DateInput, to: DateInput): readonly DateString[];
}
```

### CalendarOptions (@public)

```ts
export interface CalendarOptions<Kind extends string = string> extends HolidaySourceOptions<Kind> {
    readonly closedWeekdays?: readonly Weekday[];
    readonly closedAnnual?: readonly (AnnualDate | AnnualRange)[];
    readonly closedDates?: readonly (SpecificDate | DateRange)[];
    readonly openDates?: readonly (SpecificDate | DateRange)[];
    readonly holidayPolicy?: HolidayPolicy;
    readonly maxSearchDays?: number;
}
```

### CivilDateTimeParts (@public)

```ts
export interface CivilDateTimeParts {
    readonly date: DateString;
    readonly time: string | null;
}
```

### createCalendar (@public)

```ts
export declare function createCalendar<Kind extends string = string>(options?: CalendarOptions<Kind>): Calendar<Kind>;
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

### DateValue (@public)

```ts
export interface DateValue<T> {
    readonly date: DateString;
    readonly value: T;
    readonly name?: string;
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
    readonly kind: Kind;
    readonly confirmed: boolean;
}
```

### HolidayLookup (@public)

```ts
export interface HolidayLookup<Kind extends string = string> {
    readonly timeZone: string;
    readonly providers: readonly HolidayProvider<Kind>[];
    dateOf(input: DateInput): DateString;
    civilOf(input: DateInput): CivilDateTimeParts;
    today(now?: Date): DateString;
    isHoliday(input: DateInput): boolean;
    getHoliday(input: DateInput): Holiday<Kind> | undefined;
    holidaysInYear(year: number): readonly Holiday<Kind>[];
    holidaysBetween(from: DateInput, to: DateInput): readonly Holiday<Kind>[];
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

### HolidayRule (@public)

```ts
export type HolidayRule<T> = "weekday" | {
    readonly sameAs: Weekday;
} | {
    readonly value: T;
};
```

### HolidaySourceOptions (@public)

```ts
export interface HolidaySourceOptions<Kind extends string = string> {
    readonly holidays?: HolidayProvider<Kind> | readonly HolidayProvider<Kind>[];
    readonly timeZone?: string;
    readonly outOfRange?: "throw" | "ignore";
}
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
export type KnownDayReason = "open-date" | "closed-date" | "closed-annual" | "holiday" | "closed-weekday" | "regular";
```

### KnownErrorCode (@public)

```ts
export type KnownErrorCode = "invalid-date" | "invalid-month-day" | "invalid-time" | "invalid-input" | "invalid-time-zone" | "invalid-range" | "invalid-weekday" | "invalid-argument" | "invalid-option" | "time-zone-conflict" | "out-of-range" | "invalid-provider" | "invalid-provider-data" | "no-business-day";
```

### KnownScheduleReason (@public)

```ts
export type KnownScheduleReason = "date" | "annual" | "holiday" | "weekday";
```

### Schedule (@public)

```ts
export interface Schedule<T, Kind extends string = string> extends HolidayLookup<Kind> {
    valueOn(input: DateInput): T;
    dayInfo(input: DateInput): ScheduleDay<T, Kind>;
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
    readonly holiday?: HolidayRule<T>;
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
export declare function toDateTimeParts(input: DateInput, timeZone: string): {
    readonly date: DateString;
    readonly time: string | null;
};
```

### Weekday (@public)

```ts
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
```

### weekdayOf (@public)

```ts
export declare function weekdayOf(date: DateString): Weekday;
```

## bizdays-toolkit/jp

### confirmedThrough (@public)

```ts
export declare const confirmedThrough: number;
```

### dataVersion (@public)

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

### toJapanDate (@public)

```ts
export declare function toJapanDate(input: DateInput): DateString;
```

### toJapanDateTime (@public)

```ts
export declare function toJapanDateTime(input: DateInput): {
    readonly date: DateString;
    readonly time: string | null;
};
```
