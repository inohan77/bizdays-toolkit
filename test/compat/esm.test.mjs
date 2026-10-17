// 公開する dist を、ESM（import）で確かめる。TypeScript を使わないので、engines の下限（Node.js 22.12）でも動く。
// パッケージ名での自己参照（package.json の exports）で読み込むので、利用者と同じ経路で確かめられる。
// 実行の前に pnpm build が必要（CI の compat ジョブと pnpm check が行う）
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  closingMonth,
  createCalendar,
  createSchedule,
  isBizdaysError,
  monthOf,
} from "bizdays-toolkit";
import { diagnoseCalendar } from "bizdays-toolkit/diagnose";
import { getHoliday, isHoliday, jp } from "bizdays-toolkit/jp";
import { england, northernIreland, scotland, wales } from "bizdays-toolkit/uk";

test("日本の祝日（Date は日本時間で判定する）", () => {
  assert.equal(isHoliday("2026-11-23"), true);
  assert.equal(isHoliday(new Date("2026-11-22T15:30:00Z")), true);
  assert.equal(getHoliday("2026-09-22")?.kind, "citizens");
});

test("営業日カレンダー（年末年始の休業・タイムゾーンの変換）", () => {
  const calendar = createCalendar({
    holidays: jp,
    closedWeekdays: [0],
    closedAnnual: [{ from: "12-31", to: "01-03" }],
  });
  assert.equal(calendar.addBusinessDays("2026-12-30", 1), "2027-01-04");
  assert.deepEqual(calendar.civilOf(new Date("2026-11-22T15:30:00Z")), {
    date: "2026-11-23",
    time: "00:30",
  });
  assert.equal(
    calendar.dueDate(monthOf(closingMonth("2026-10-21", 20), 1), {
      day: -1,
      convention: "preceding",
    }),
    "2026-12-30",
  );
});

test("英国の地域ごとの祝日", () => {
  const edinburgh = createCalendar({ holidays: scotland, closedWeekdays: [0, 6] });
  assert.equal(edinburgh.addBusinessDays("2026-06-12", 1), "2026-06-16");
  assert.equal(wales.holidaysInYear(2026)[0]?.names?.cy, "Dydd Calan");
  assert.equal(
    createCalendar({ holidays: [england, northernIreland] }).isHoliday("2026-07-13"),
    true,
  );
});

test("日ごとの値・診断・エラーコード", () => {
  const schedule = createSchedule({
    holidays: jp,
    weekly: [0, 1, 1, 1, 1, 1, 0],
    holiday: { sameAs: 0 },
  });
  assert.equal(schedule.valueOn("2026-11-03"), 0);
  assert.deepEqual(diagnoseCalendar({ holidays: jp, closedWeekdays: [0] }), []);
  assert.throws(
    () => createCalendar({ closedDates: ["2026-12-32"] }),
    (e) => isBizdaysError(e) && e.code === "invalid-date",
  );
});
