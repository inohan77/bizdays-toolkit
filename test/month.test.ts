import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  closingMonth,
  closingPeriod,
  createCalendar,
  isBizdaysError,
  monthOf,
  type BusinessDayConvention,
} from "../src/index.ts";
import { jp } from "../src/jp/index.ts";

const office = createCalendar({ holidayProvider: jp, closedWeekdays: [0, 6] });

test("monthOf: 日付・月の n か月後", () => {
  assert.equal(monthOf("2026-10-16"), "2026-10");
  assert.equal(monthOf("2026-10-16", 1), "2026-11");
  assert.equal(monthOf("2026-12", 1), "2027-01");
  assert.equal(monthOf("2026-01", -1), "2025-12");
  assert.equal(monthOf("2026-01-31", -13), "2024-12");
  assert.throws(() => monthOf("2026-13"), { code: "invalid-month" });
  assert.throws(() => monthOf("2026/10"), { code: "invalid-month" });
  assert.throws(() => monthOf("2026-02-30"), { code: "invalid-date" });
  assert.throws(() => monthOf("2026-10", 1.5), { code: "invalid-argument" });
  assert.throws(() => monthOf("9999-12", 1), { code: "out-of-range" });
});

test("closingMonth: 締め日の翌日から次の締め日までが、次の締め日の月", () => {
  assert.equal(closingMonth("2026-10-20", 20), "2026-10");
  assert.equal(closingMonth("2026-10-21", 20), "2026-11");
  assert.equal(closingMonth("2026-12-21", 20), "2027-01", "年をまたぐ");
  assert.equal(closingMonth("2026-10-31", -1), "2026-10", "末日締めは常にその月");
  assert.equal(closingMonth("2027-02-28", 31), "2027-02", "31 日締めの 2 月は末日締め");
  assert.equal(closingMonth("2027-02-28", 28), "2027-02");
  assert.equal(closingMonth("2028-02-29", 28), "2028-03", "うるう年の 29 日は翌月分");
  assert.throws(() => closingMonth("2026-10-21", 0), { code: "invalid-argument" });
  assert.throws(() => closingMonth("2026-10-21", 32), { code: "invalid-argument" });
});

test("adjust: 4 つの方法（月をまたぐかは調整前の日付の月で判定）", () => {
  const adjust = (date: string, convention: BusinessDayConvention) =>
    office.adjust(date, { convention });
  // 営業日はそのまま
  for (const c of ["following", "preceding", "modified-following", "modified-preceding"] as const) {
    assert.equal(adjust("2026-10-16", c), "2026-10-16");
  }
  // 2026-10-31（土）: 翌営業日は 11/2、前営業日は 10/30
  assert.equal(adjust("2026-10-31", "following"), "2026-11-02");
  assert.equal(adjust("2026-10-31", "preceding"), "2026-10-30");
  assert.equal(adjust("2026-10-31", "modified-following"), "2026-10-30", "月が変わるので前へ");
  assert.equal(adjust("2026-10-31", "modified-preceding"), "2026-10-30");
  // 2026-11-01（日）: 前営業日は 10/30（月が変わる）
  assert.equal(adjust("2026-11-01", "modified-preceding"), "2026-11-02", "月が変わるので後へ");
  assert.equal(adjust("2026-11-01", "modified-following"), "2026-11-02");
  // 祝日（2026-11-23 勤労感謝の日・月曜）
  assert.equal(adjust("2026-11-23", "following"), "2026-11-24");
  assert.equal(adjust("2026-11-23", "preceding"), "2026-11-20");
  // 瞬間の入力はカレンダーのタイムゾーンで暦日にしてから調整する
  assert.equal(
    office.adjust(new Date("2026-10-30T15:30:00Z"), { convention: "preceding" }),
    "2026-10-30",
  );
});

test("adjust: 同じ月に営業日がなければ、月が変わっても調整する", () => {
  const closedInOctober = createCalendar({
    closedDates: [{ from: "2026-10-01", to: "2026-10-31" }],
  });
  assert.equal(
    closedInOctober.adjust("2026-10-15", { convention: "modified-following" }),
    "2026-11-01",
  );
  assert.equal(
    closedInOctober.adjust("2026-10-15", { convention: "modified-preceding" }),
    "2026-09-30",
  );
});

test("adjust・dueDate: convention の誤りは invalid-argument", () => {
  assert.throws(() => office.adjust("2026-10-31", { convention: "nearest" as never }), {
    code: "invalid-argument",
  });
  assert.throws(() => office.adjust("2026-10-31", undefined as never), {
    code: "invalid-argument",
  });
  assert.throws(() => office.dueDate("2026-10", { dayOfMonth: 10 } as never), {
    code: "invalid-argument",
  });
  assert.throws(
    () => office.dueDate("2026-10", { dayOfMonth: 0 as never, convention: "following" }),
    {
      code: "invalid-argument",
    },
  );
});

test("月の第 n 営業日・最初と最後の営業日", () => {
  // 2026 年 10 月: 1(木) 2(金) 5 6 7 8 9 13（12 日はスポーツの日）…
  assert.equal(office.firstBusinessDayOfMonth("2026-10"), "2026-10-01");
  assert.equal(office.nthBusinessDayOfMonth("2026-10", 5), "2026-10-07");
  assert.equal(office.nthBusinessDayOfMonth("2026-10", 8), "2026-10-13", "祝日を飛ばす");
  assert.equal(office.lastBusinessDayOfMonth("2026-10"), "2026-10-30");
  assert.equal(office.nthBusinessDayOfMonth("2026-10", -2), "2026-10-29");
  assert.equal(office.firstBusinessDayOfMonth("2027-01"), "2027-01-04");
  const count = office.businessDatesBetween("2026-10-01", "2026-10-31").length;
  assert.equal(office.nthBusinessDayOfMonth("2026-10", count), "2026-10-30");
  assert.equal(office.nthBusinessDayOfMonth("2026-10", -count), "2026-10-01");
  assert.throws(() => office.nthBusinessDayOfMonth("2026-10", count + 1), {
    code: "no-business-day",
  });
  assert.throws(() => office.nthBusinessDayOfMonth("2026-10", 0), { code: "invalid-argument" });
  assert.throws(() => office.nthBusinessDayOfMonth("2026-10-01", 1), { code: "invalid-month" });
  const closed = createCalendar({ closedDates: [{ from: "2026-10-01", to: "2026-10-31" }] });
  assert.throws(() => closed.firstBusinessDayOfMonth("2026-10"), { code: "no-business-day" });
});

test("dueDate: その月にない日は末日に読み替えてから調整する", () => {
  assert.equal(
    office.dueDate("2026-10", { dayOfMonth: 10, convention: "following" }),
    "2026-10-13",
  );
  assert.equal(
    office.dueDate("2026-10", { dayOfMonth: -1, convention: "preceding" }),
    "2026-10-30",
  );
  // 2027 年 2 月 28 日は日曜日
  assert.equal(
    office.dueDate("2027-02", { dayOfMonth: 30, convention: "following" }),
    "2027-03-01",
  );
  assert.equal(
    office.dueDate("2027-02", { dayOfMonth: 31, convention: "modified-following" }),
    "2027-02-26",
    "読み替えた末日（2 月）の月で判定する",
  );
  // 20 日締め・翌月 10 日払い（休業日なら翌営業日）
  const order = "2026-10-21";
  const pay = office.dueDate(monthOf(closingMonth(order, 20), 1), {
    dayOfMonth: 10,
    convention: "following",
  });
  assert.equal(pay, "2026-12-10");
});

test("closingPeriod: その月分の期間（前月の締め日の翌日からその月の締め日まで）", () => {
  assert.deepEqual(closingPeriod("2026-11", 20), { from: "2026-10-21", to: "2026-11-20" });
  assert.deepEqual(
    closingPeriod("2026-10", -1),
    { from: "2026-10-01", to: "2026-10-31" },
    "末日締め",
  );
  assert.deepEqual(
    closingPeriod("2026-03", 31),
    { from: "2026-03-01", to: "2026-03-31" },
    "2 月の 31 日締めは 2 月末日",
  );
  assert.deepEqual(closingPeriod("2026-03", 30), { from: "2026-03-01", to: "2026-03-30" });
  assert.deepEqual(
    closingPeriod("2024-03", 29),
    { from: "2024-03-01", to: "2024-03-29" },
    "うるう年の 2 月 29 日締め",
  );
  assert.deepEqual(
    closingPeriod("2025-03", 29),
    { from: "2025-03-01", to: "2025-03-29" },
    "平年の 2 月は 28 日締め",
  );
  assert.deepEqual(
    closingPeriod("2026-01", 20),
    { from: "2025-12-21", to: "2026-01-20" },
    "年をまたぐ",
  );
  // 暦日を渡すと、その日が属する期間
  assert.deepEqual(closingPeriod("2026-11-05", 20), { from: "2026-10-21", to: "2026-11-20" });
  assert.deepEqual(closingPeriod("2026-11-21", 20), { from: "2026-11-21", to: "2026-12-20" });
  assert.ok(Object.isFrozen(closingPeriod("2026-11", 20)));
  assert.equal("name" in closingPeriod("2026-11", 20), false);
  // closedDates にそのまま渡せる
  const cal = createCalendar({ holidayProvider: jp, closedDates: [closingPeriod("2026-11", 20)] });
  assert.equal(cal.isBusinessDay("2026-10-21"), false);
  assert.equal(cal.isBusinessDay("2026-11-20"), false);
  assert.equal(cal.isBusinessDay("2026-11-24"), true);
  for (const [input, day, code] of [
    ["2026-13", 20, "invalid-month"],
    ["2026/11", 20, "invalid-month"],
    ["2026-11", 0, "invalid-argument"],
    ["2026-11", 32, "invalid-argument"],
    ["2026-11", 1.5, "invalid-argument"],
    ["2026-02-30", 20, "invalid-date"],
  ] as const) {
    assert.throws(
      () => closingPeriod(input, day),
      (e: unknown) => isBizdaysError(e) && e.code === code,
      `${input} ${day}`,
    );
  }
});

test("closingPeriod: 期間は隙間も重なりもなく敷き詰められ、closingMonth と往復する", () => {
  for (const closingDay of [...Array.from({ length: 31 }, (_, i) => i + 1), -1]) {
    let month = "2023-01";
    for (let k = 0; k < 40; k++) {
      const period = closingPeriod(month, closingDay);
      const next = closingPeriod(monthOf(month, 1), closingDay);
      assert.equal(
        addDays(period.to, 1),
        next.from,
        `${month} の締め日 ${closingDay}: 次の期間と隙間なく続く`,
      );
      assert.ok(period.from <= period.to);
      for (let d = period.from; d <= period.to; d = addDays(d, 1)) {
        assert.equal(
          closingMonth(d, closingDay),
          month,
          `${d} は ${month} 分（締め日 ${closingDay}）`,
        );
        assert.deepEqual(closingPeriod(d, closingDay), period);
      }
      month = monthOf(month, 1);
    }
  }
});
