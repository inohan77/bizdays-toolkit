// 公開する dist を、CommonJS の require() で確かめる（README の「Node.js 22.12 以降は require() で読み込める」の裏付け）。
// Node.js 22.12 では、ESM を require() で読み込むと実験的な機能の警告が出ることがあるが、利用者の環境での動作の確認なので警告は問わない。
// 実行の前に pnpm build が必要（CI の compat ジョブと pnpm check が行う）
const assert = require("node:assert/strict");
const { test } = require("node:test");

test("すべてのサブパスを require() で読み込める", () => {
  const root = require("bizdays-toolkit");
  const jp = require("bizdays-toolkit/jp");
  const uk = require("bizdays-toolkit/uk");
  const diagnose = require("bizdays-toolkit/diagnose");
  const provider = require("bizdays-toolkit/provider");

  const calendar = root.createCalendar({ holidays: jp.jp, closedWeekdays: [0, 6] });
  assert.equal(calendar.isBusinessDay("2026-11-23"), false);
  assert.equal(uk.scotland.holidaysInYear(2026).length, 10);
  assert.deepEqual(diagnose.diagnoseCalendar({ holidays: jp.jp }), []);
  assert.equal(provider.easterSunday(2026), "2026-04-05");
});

test("require() と import は同じモジュールを返す（二重に読み込まれない）", async () => {
  const required = require("bizdays-toolkit");
  const imported = await import("bizdays-toolkit");
  assert.equal(required.createCalendar, imported.createCalendar);
});
