/**
 * The checks of the published dist (shared by Node.js, browsers and Cloudflare Workers; RELEASING.md, reasons
 * for the quality mechanisms, "runtimes that are checked").
 *
 * Written in standard JavaScript only, to run in any runtime (no node:test, node:assert or the like).
 * Loading differs by environment, so the caller passes the modules of the subpaths.
 * Where a real Temporal exists, checks with Temporal objects as input run too.
 * Apart from pass or fail, it returns the record of how time zone names are handled (timeZones). The caller
 * logs each line with the prefix "TimeZone: " and fails when there is none (never silently skipped).
 *
 * @param {{ root: any, jp: any, uk: any, sg: any, fr: any, diagnose: any, provider: any }} modules
 * @returns {{ results: { name: string, ok: boolean, error?: string }[], temporal: "native" | "absent", timeZones: string[] }}
 */
export function smoke({ root, jp, uk, sg, fr, diagnose, provider }) {
  const results = [];
  const check = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };
  const equal = (actual, expected, label) => {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
  };

  check("日本の祝日（Date は日本時間で判定する）", () => {
    equal(jp.isHoliday("2026-11-23"), true, "isHoliday");
    equal(jp.isHoliday(new Date("2026-11-22T15:30:00Z")), true, "isHoliday(Date)");
    equal(jp.holidayOn("2026-09-22")?.kind, "citizens", "holidayOn");
  });

  // Date-time strings with an offset (ECMAScript defines the reading only for upper-case T and Z and 3 fraction
  // digits. Up to 0.31.0 this was left to Date.parse, and Firefox and Safari could not read lower-case t and z).
  // Split by form, to see which passes in each runtime
  check("日時文字列: 小文字の t・z", () => {
    equal(jp.isHoliday("2026-11-22t15:30:00z"), true, "lowercase t and z");
  });
  check("日時文字列: 9 桁の小数秒", () => {
    equal(jp.isHoliday("2026-11-22T15:30:00.123456789Z"), true, "9-digit fraction");
  });
  check("日時文字列: 小文字の t とオフセット", () => {
    equal(
      jp.toJapanDateTime("2026-11-22t23:59:59.999999999-09:00"),
      { date: "2026-11-23", time: "17:59" },
      "lowercase t with offset",
    );
  });

  check("営業日カレンダー（年末年始の休業・タイムゾーンの変換・期日）", () => {
    const calendar = root.createCalendar({
      holidayProvider: jp.jp,
      closedWeekdays: [0],
      closedAnnualDates: [{ from: "12-31", to: "01-03" }],
    });
    equal(calendar.addBusinessDays("2026-12-30", 1), "2027-01-04", "addBusinessDays");
    equal(
      calendar.civilOf(new Date("2026-11-22T15:30:00Z")),
      { date: "2026-11-23", time: "00:30" },
      "civilOf",
    );
    const due = calendar.dueDate(root.monthOf(root.closingMonth("2026-10-21", 20), 1), {
      dayOfMonth: -1,
      convention: "preceding",
    });
    equal(due, "2026-12-30", "dueDate");
  });

  check("英国の地域ごとの祝日（Europe/London の夏時間）", () => {
    const edinburgh = root.createCalendar({ holidayProvider: uk.scotland, closedWeekdays: [0, 6] });
    equal(edinburgh.addBusinessDays("2026-06-12", 1), "2026-06-16", "addBusinessDays");
    equal(uk.wales.holidaysInYear(2026)[0]?.names?.cy, "Dydd Calan", "names.cy");
    const ukWide = root.createCalendar({ holidayProvider: [uk.england, uk.northernIreland] });
    equal(ukWide.isHoliday("2026-07-13"), true, "union");
    equal(
      root
        .createCalendar({ holidayProvider: uk.england })
        .isHoliday(new Date("2026-08-30T23:30:00Z")),
      true,
      "BST",
    );
  });

  check("日ごとの値・診断・エラーコード", () => {
    const schedule = root.createSchedule({
      holidayProvider: jp.jp,
      weekdayValues: [0, 1, 1, 1, 1, 1, 0],
      holidayPolicy: { sameAs: 0 },
    });
    equal(schedule.valueOn("2026-11-03"), 0, "valueOn");
    equal(
      diagnose.diagnoseCalendar({ holidayProvider: jp.jp, closedWeekdays: [0] }),
      [],
      "diagnose",
    );
    let code;
    try {
      root.createCalendar({ closedDates: ["2026-12-32"] });
    } catch (e) {
      code = root.isBizdaysError(e) ? e.code : "not a bizdays error";
    }
    equal(code, "invalid-date", "error code");
  });

  check("フランスの祝日（本土と Alsace-Moselle、Europe/Paris での判定、連帯の日）", () => {
    const paris = root.createCalendar({ holidayProvider: fr.metropole, closedWeekdays: [0, 6] });
    equal(paris.isBusinessDay("2026-05-14"), false, "Ascension");
    equal(
      paris.isHoliday(new Date("2026-05-24T22:30:00Z")),
      true,
      "CEST (May 25 Lundi de Pentecôte)",
    );
    equal(fr.alsaceMoselle.holidaysInYear(2026).length, 13, "Alsace-Moselle");
    equal(fr.metropole.holidaysInYear(2026).length, 11, "metropole");
    const solidarity = root.createCalendar({
      holidayProvider: fr.metropole,
      closedWeekdays: [0, 6],
      openRecurringRules: [{ holiday: true, keys: ["pentecost-monday"] }],
    });
    equal(solidarity.isBusinessDay("2026-05-25"), true, "Journée de solidarité");
  });

  check("シンガポールの祝日（振替と Asia/Singapore での判定）、未確定の祝日のガード", () => {
    const calendar = root.createCalendar({ holidayProvider: sg.sg, closedWeekdays: [0, 6] });
    equal(calendar.isBusinessDay("2026-08-10"), false, "National Day (Observed)");
    equal(calendar.isHoliday(new Date("2026-08-09T17:00:00Z")), true, "SGT");
    const strict = root.createCalendar({
      holidayProvider: jp.jp,
      unconfirmedHolidayPolicy: "throw",
    });
    let code;
    try {
      strict.isBusinessDay(`${jp.jp.confirmedThrough + 1}-03-20`);
    } catch (e) {
      code = root.isBizdaysError(e) ? e.code : "not a bizdays error";
    }
    equal(code, "unconfirmed-holiday", "unconfirmedHolidayPolicy");
    equal(
      diagnose
        .diagnoseCalendar({ closedDates: ["2020-01-02"] }, { asOf: "2026-01-01" })
        .map((d) => d.code),
      ["expired"],
      "asOf",
    );
  });

  check("提供元の実装者向けの暦の計算（第 n 何曜日・復活祭）", () => {
    equal(provider.nthWeekdayOfMonth(2026, 11, 4, 4), "2026-11-26", "nthWeekdayOfMonth");
    equal(provider.nthWeekdayOfMonth(2026, 5, 1, -1), "2026-05-25", "last Monday");
    equal(root.addDays(provider.easterSunday(2026), -2), "2026-04-03", "Good Friday");
    equal(provider.isLeapYear(2028) && provider.lengthOfMonth(2028, 2) === 29, true, "leap year");
  });

  const T = globalThis.Temporal;
  if (T !== undefined) {
    check("本物の Temporal を入力にする", () => {
      equal(jp.isHoliday(T.PlainDate.from("2026-11-23")), true, "PlainDate");
      equal(jp.isHoliday(T.Instant.from("2026-11-22T15:30:00Z")), true, "Instant");
      equal(
        jp.isHoliday(T.ZonedDateTime.from("2026-11-23T00:30:00+09:00[Asia/Tokyo]")),
        true,
        "ZonedDateTime",
      );
      const calendar = root.createCalendar({ holidayProvider: jp.jp });
      equal(
        calendar.civilOf(T.PlainDateTime.from("2026-11-23T10:00")),
        {
          date: "2026-11-23",
          time: "10:00",
        },
        "PlainDateTime",
      );
    });
  }

  // Time zones: what gives the same result in every runtime is a pass-or-fail check, not a record (decisions.md
  // #18; confirmed with the CI records of 0.31.9). Whether aliases become one name, and the result of Temporal's
  // comparison, differ by runtime and stay a record (timeZoneReport)
  check("タイムゾーン: オフセット形式", () => {
    const instant = new Date("2026-11-22T15:30:00Z");
    for (const [written, timeZone, date] of [
      ["+09:00", "+09:00", "2026-11-23"],
      ["+0900", "+09:00", "2026-11-23"],
      ["+09", "+09:00", "2026-11-23"],
      ["-05:00", "-05:00", "2026-11-22"],
      ["+05:30", "+05:30", "2026-11-22"],
    ]) {
      const calendar = root.createCalendar({ timeZone: written });
      equal([calendar.timeZone, calendar.dateOf(instant)], [timeZone, date], written);
    }
    let code;
    try {
      root.createCalendar({ timeZone: "UTC+9" });
    } catch (e) {
      code = root.isBizdaysError(e) ? e.code : String(e);
    }
    equal(code, "invalid-time-zone", "UTC+9");
    const combined = root.combineCalendars(
      [root.createCalendar({ timeZone: "+09:00" }), root.createCalendar({ timeZone: "+0900" })],
      { open: "all" },
    );
    equal(combined.timeZone, "+09:00", "combine +09:00 and +0900");
  });
  // The cache of time zone formatters (from 0.32.3. decisions.md #16) merges spellings that differ only in case
  // into one key, so it assumes that the runtime's Intl returns the same name for such spellings (if that broke,
  // the returned name would depend on which spelling was passed first). Intl is checked directly, without the
  // library's cache, and the name the library returns must equal it
  check("タイムゾーン: 大文字・小文字だけが違う綴りに同じ名前", () => {
    const intlName = (timeZone) =>
      new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
    for (const spellings of [
      ["Asia/Tokyo", "asia/tokyo", "ASIA/TOKYO", "aSIA/tOKYO"],
      ["America/New_York", "america/new_york", "AMERICA/NEW_YORK"],
      ["Europe/London", "europe/london", "EUROPE/LONDON"],
      ["UTC", "utc", "Utc"],
    ]) {
      const expected = intlName(spellings[0]);
      equal(
        spellings.map((s) => [intlName(s), root.createCalendar({ timeZone: s }).timeZone]),
        spellings.map(() => [expected, expected]),
        spellings[0],
      );
    }
  });
  // Two aliases are the same time zone by Temporal's comparison in a runtime with Temporal (from 0.32.0; it
  // works even where Intl does not canonicalize aliases). Without Temporal the name returned by Intl decides, so
  // this stays a record only
  if (T !== undefined) {
    check("タイムゾーン: 別名どうしの合成（本物の Temporal）", () => {
      const of = (timeZone) => root.createCalendar({ timeZone });
      root.combineCalendars([of("UTC"), of("Etc/UTC")], { open: "all" });
      root.combineCalendars([root.createCalendar({ holidayProvider: jp.jp }), of("Japan")], {
        open: "all",
      });
      root.combineCalendars([of("Asia/Kolkata"), of("Asia/Calcutta")], { open: "all" });
    });
  }

  return {
    results,
    temporal: T === undefined ? "absent" : "native",
    timeZones: timeZoneReport(root, jp),
  };
}

/**
 * The record of how time zone names are handled (not pass or fail; to compare the differences between runtimes
 * in the CI logs. decisions.md #18).
 * One fact per line: whether aliases are canonicalized (name), whether a combination of aliases can be created
 * (combine), the result of Temporal's comparison (temporal equals), whether the offset form is accepted
 * (offset). An error is written as "throws <code>"
 * @returns {string[]}
 */
function timeZoneReport(root, jp) {
  const lines = [];
  const attempt = (fn) => {
    try {
      return JSON.stringify(fn());
    } catch (e) {
      return `throws ${root.isBizdaysError(e) ? e.code : String(e)}`;
    }
  };
  const of = (timeZone) => root.createCalendar({ timeZone });
  for (const name of ["Asia/Kolkata", "Asia/Calcutta", "Etc/UTC", "Japan", "CST6CDT"])
    lines.push(`name ${name} -> ${attempt(() => of(name).timeZone)}`);
  const combine = (a, b) =>
    attempt(() => root.combineCalendars([a(), b()], { open: "all" }).timeZone);
  lines.push(
    `combine UTC + Etc/UTC -> ${combine(
      () => of("UTC"),
      () => of("Etc/UTC"),
    )}`,
  );
  lines.push(
    `combine jp + Japan -> ${combine(
      () => root.createCalendar({ holidayProvider: jp.jp }),
      () => of("Japan"),
    )}`,
  );
  lines.push(
    `combine +09:00 + +0900 -> ${combine(
      () => of("+09:00"),
      () => of("+0900"),
    )}`,
  );
  const T = globalThis.Temporal;
  if (T === undefined) lines.push("temporal equals -> no Temporal");
  else {
    for (const [a, b] of [
      ["UTC", "Etc/UTC"],
      ["Asia/Kolkata", "Asia/Calcutta"],
      ["Japan", "Asia/Tokyo"],
      ["Europe/Paris", "Europe/Berlin"],
      ["CST6CDT", "America/Chicago"],
      ["+09:00", "+0900"],
      ["+09:00", "Asia/Tokyo"],
    ])
      lines.push(
        `temporal equals ${a} / ${b} -> ${attempt(() => {
          const at = T.Instant.fromEpochMilliseconds(0);
          return at.toZonedDateTimeISO(a).equals(at.toZonedDateTimeISO(b));
        })}`,
      );
  }
  const instant = new Date("2026-11-22T15:30:00Z");
  for (const offset of ["+09:00", "+0900", "+09", "-05:00", "+05:30", "UTC+9"])
    lines.push(
      `offset ${offset} -> ${attempt(() => of(offset).timeZone)} / ${attempt(() => of(offset).dateOf(instant))}`,
    );
  return lines;
}
