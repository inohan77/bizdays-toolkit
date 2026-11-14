import assert from "node:assert/strict";
import { test } from "node:test";
import { combineCalendars, createCalendar, createSchedule, isBizdaysError } from "../src/index.ts";
import { diagnoseSchedule } from "../src/diagnose/index.ts";

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return isBizdaysError(e) ? e.code : `not a bizdays error: ${String(e)}`;
  }
};

/** Temporal を差し替えて fn を実行する（undefined なら Temporal のない実行環境） */
function withTemporal(fake: unknown, fn: () => void): void {
  const g = globalThis as { Temporal?: unknown };
  const had = "Temporal" in g;
  const saved = g.Temporal;
  if (fake === undefined) delete g.Temporal;
  else g.Temporal = fake;
  try {
    fn();
  } finally {
    if (had) g.Temporal = saved;
    else delete g.Temporal;
  }
}

/** 名前の組を同じとみなす Temporal の代わり（equals が呼ばれたかも数える） */
function fakeTemporal(same: (a: string, b: string) => boolean | never) {
  const calls = { equals: 0 };
  return {
    calls,
    Temporal: {
      Instant: {
        fromEpochMilliseconds: () => ({
          toZonedDateTimeISO: (zone: string) => ({
            zone,
            equals(other: { zone: string }) {
              calls.equals++;
              return same(zone, other.zone);
            },
          }),
        }),
      },
    },
  };
}

// 実行環境が正規化しない名前の組（どの実行環境でも、Intl が返す名前が違う）
const paris = createCalendar({ timeZone: "Europe/Paris" });
const berlin = createCalendar({ timeZone: "Europe/Berlin" });
const provider = (id: string, timeZone: string) => ({
  id,
  timeZone,
  supportedYears: { from: 2020, to: 2030 },
  dataVersion: "test",
  holidaysInYear: () => [],
});

test("同じタイムゾーン: 名前が同じなら Temporal を使わない", () => {
  const fake = fakeTemporal(() => {
    throw new Error("must not be called");
  });
  withTemporal(fake.Temporal, () => {
    combineCalendars([paris, createCalendar({ timeZone: "Europe/Paris" })], { open: "all" });
  });
  assert.equal(fake.calls.equals, 0);
});

test("同じタイムゾーン: 名前が違えば、Temporal がない実行環境では time-zone-conflict", () => {
  withTemporal(undefined, () => {
    assert.equal(
      codeOf(() => combineCalendars([paris, berlin], { open: "all" })),
      "time-zone-conflict",
    );
  });
});

test("同じタイムゾーン: 名前が違っても、Temporal が同じとすれば 3 か所とも作れる（返す timeZone は先の名前）", () => {
  const fake = fakeTemporal(() => true);
  withTemporal(fake.Temporal, () => {
    assert.equal(combineCalendars([paris, berlin], { open: "all" }).timeZone, "Europe/Paris");
    assert.equal(
      createCalendar({
        holidayProvider: [provider("A", "Europe/Paris"), provider("B", "Europe/Berlin")],
      }).timeZone,
      "Europe/Paris",
    );
    const schedule = createSchedule({
      timeZone: "Europe/Berlin",
      weekdayValues: [1, 1, 1, 1, 1, 1, 1],
      recurringRules: [{ businessDayOfMonth: 1, calendar: paris, value: 2 }],
    });
    assert.equal(schedule.timeZone, "Europe/Berlin");
    assert.equal(schedule.valueOn("2026-10-01"), 2);
  });
  assert.ok(fake.calls.equals >= 3);
});

test("同じタイムゾーン: Temporal が違うとすれば time-zone-conflict（診断も同じ code）", () => {
  const fake = fakeTemporal(() => false);
  withTemporal(fake.Temporal, () => {
    assert.equal(
      codeOf(() => combineCalendars([paris, berlin], { open: "all" })),
      "time-zone-conflict",
    );
    assert.equal(
      codeOf(() =>
        createCalendar({
          holidayProvider: [provider("A", "Europe/Paris"), provider("B", "Europe/Berlin")],
        }),
      ),
      "time-zone-conflict",
    );
    assert.deepEqual(
      diagnoseSchedule({
        timeZone: "Europe/Berlin",
        weekdayValues: [1, 1, 1, 1, 1, 1, 1],
        recurringRules: [{ businessDayOfMonth: 1, calendar: paris, value: 2 }],
      }).map((d) => d.code),
      ["time-zone-conflict"],
    );
  });
});

test("同じタイムゾーン: Temporal が投げる・真偽値でない値を返すときは、同じとしない", () => {
  for (const same of [
    () => {
      throw new RangeError("unknown time zone");
    },
    () => 1 as unknown as boolean,
  ]) {
    withTemporal(fakeTemporal(same).Temporal, () => {
      assert.equal(
        codeOf(() => combineCalendars([paris, berlin], { open: "all" })),
        "time-zone-conflict",
      );
    });
  }
  // 形の違う Temporal（項目がない）でも、例外をそのまま出さない
  withTemporal({}, () => {
    assert.equal(
      codeOf(() => combineCalendars([paris, berlin], { open: "all" })),
      "time-zone-conflict",
    );
  });
});

test("同じタイムゾーン: 3 つ以上のカレンダーは、どれか 1 組でも違えば time-zone-conflict", () => {
  const rome = createCalendar({ timeZone: "Europe/Rome" });
  const fake = fakeTemporal((a, b) => [a, b].sort().join() === "Europe/Berlin,Europe/Paris");
  withTemporal(fake.Temporal, () => {
    assert.equal(
      codeOf(() => combineCalendars([paris, berlin, rome], { open: "all" })),
      "time-zone-conflict",
    );
  });
});
