// An input with an intended type error, to check that the user-side type check
// (scripts/check-consumer-types.ts) works.
// The error must be detected through the published type definitions (if the library's types could not be read,
// it would be another error)
import { createCalendar } from "bizdays-toolkit";
import { jp } from "bizdays-toolkit/jp";

const calendar = createCalendar({ holidayProvider: jp });
// The return value is a boolean and cannot be assigned to string
const wrong: string = calendar.isBusinessDay("2026-10-20");
void wrong;
