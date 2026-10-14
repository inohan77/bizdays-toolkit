import assert from "node:assert/strict";
import { test } from "node:test";
import { getHoliday, holidaysBetween, holidaysInYear, isHoliday, jp } from "../src/jp/index.ts";
// 近似式は公開しない内部の関数なので、モジュールから直接読み込んで確かめる
import { autumnalEquinoxDay, vernalEquinoxDay } from "../src/jp/rules.ts";

const pick = (date: string) => {
  const h = getHoliday(date);
  return h && { name: h.name, kind: h.kind };
};

test("国民の祝日の名前と種別", () => {
  assert.deepEqual(pick("2026-11-23"), { name: "勤労感謝の日", kind: "national" });
  assert.deepEqual(pick("1988-04-29"), { name: "天皇誕生日", kind: "national" });
  assert.deepEqual(pick("1989-04-29"), { name: "みどりの日", kind: "national" });
  assert.deepEqual(pick("2007-04-29"), { name: "昭和の日", kind: "national" });
  assert.deepEqual(pick("2019-10-14"), { name: "体育の日", kind: "national" });
  assert.deepEqual(pick("2020-07-24"), { name: "スポーツの日", kind: "national" });
  assert.equal(getHoliday("2026-11-23")?.nameEn, "Labor Thanksgiving Day");
});

test("振替休日（1973-04-12 以降。2007 年からは最も近い祝日でない日）", () => {
  assert.equal(getHoliday("1973-04-30")?.kind, "substitute");
  assert.equal(isHoliday("1973-02-12"), false, "制度開始前の日曜の祝日は振替なし");
  assert.equal(getHoliday("2008-05-06")?.kind, "substitute", "5/4(日) → 5/5 は祝日 → 5/6");
  assert.equal(getHoliday("2021-08-09")?.kind, "substitute", "五輪で移動した山の日 8/8(日)");
});

test("国民の休日（祝日に挟まれた日）", () => {
  assert.equal(getHoliday("1988-05-04")?.kind, "citizens");
  assert.equal(getHoliday("2009-09-22")?.kind, "citizens");
  assert.equal(getHoliday("2026-09-22")?.kind, "citizens");
});

test("2019 年の改元に伴う休日", () => {
  assert.deepEqual(
    holidaysBetween("2019-04-27", "2019-05-06").map((h) => `${h.date} ${h.kind}`),
    [
      "2019-04-29 national",
      "2019-04-30 citizens",
      "2019-05-01 special",
      "2019-05-02 citizens",
      "2019-05-03 national",
      "2019-05-04 national",
      "2019-05-05 national",
      "2019-05-06 substitute",
    ],
  );
  assert.equal(getHoliday("2019-10-22")?.name, "即位礼正殿の儀の行われる日");
  assert.equal(isHoliday("2019-12-23"), false, "2019 年は天皇誕生日がない");
});

test("春分・秋分の日は官報公表済みの年まで確定、それ以降は予測", () => {
  const confirmed = (date: string) => getHoliday(date)?.confirmed;
  assert.equal(confirmed("2027-03-21"), true);
  assert.equal(confirmed("2028-03-20"), false);
  assert.equal(confirmed("2028-01-01"), true, "規則で決まる祝日は確定扱い");
  assert.equal(jp.confirmedThrough, 2027);
});

test("近似式（1979 年以前は 0 方向への切り捨て）", () => {
  assert.equal(vernalEquinoxDay(1960), 20);
  assert.equal(vernalEquinoxDay(1956), 21);
  assert.equal(autumnalEquinoxDay(1979), 24);
  assert.equal(autumnalEquinoxDay(2012), 22);
});

test("対応年の外は RangeError", () => {
  assert.throws(() => holidaysInYear(1954), RangeError);
  assert.throws(() => holidaysInYear(2100), RangeError);
  assert.equal(holidaysInYear(2099).length > 0, true);
});

test("返す配列と要素は変更できない", () => {
  const list = holidaysInYear(2026);
  assert.ok(Object.isFrozen(list));
  assert.ok(Object.isFrozen(list[0]));
});
