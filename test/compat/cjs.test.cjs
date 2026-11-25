// Checks the published dist with require() of CommonJS (backs the README's statement that Node.js 22.12 and
// later can load it with require()).
// In Node.js 22.12, require() of an ES module can print an experimental warning; this checks behaviour in a
// user's environment, so warnings are not judged.
// Needs pnpm build before running (done by the compat job of CI and by pnpm check)
const assert = require("node:assert/strict");
const { test } = require("node:test");

test("すべてのサブパスを require() で読み込める", () => {
  const root = require("bizdays-toolkit");
  const jp = require("bizdays-toolkit/jp");
  const uk = require("bizdays-toolkit/uk");
  const diagnose = require("bizdays-toolkit/diagnose");
  const provider = require("bizdays-toolkit/provider");
  const sg = require("bizdays-toolkit/sg");
  const fr = require("bizdays-toolkit/fr");

  const calendar = root.createCalendar({ holidayProvider: jp.jp, closedWeekdays: [0, 6] });
  assert.equal(calendar.isBusinessDay("2026-11-23"), false);
  assert.equal(uk.scotland.holidaysInYear(2026).length, 10);
  assert.deepEqual(diagnose.diagnoseCalendar({ holidayProvider: jp.jp }), []);
  assert.equal(provider.easterSunday(2026), "2026-04-05");
  assert.equal(sg.sg.holidaysInYear(2026).length, 14);
  assert.equal(fr.metropole.holidaysInYear(2026).length, 11);
});

test("require() と import は同じモジュールを返す（二重に読み込まれない）", async () => {
  const required = require("bizdays-toolkit");
  const imported = await import("bizdays-toolkit");
  assert.equal(required.createCalendar, imported.createCalendar);
});
