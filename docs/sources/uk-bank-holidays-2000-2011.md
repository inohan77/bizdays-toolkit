# 英国の bank holidays 2000〜2011 年の出典

`bizdays-toolkit/uk` の 2000〜2011 年（GOV.UK のデータがない年）の根拠となる出典の記録。当時の政府の公表一覧を正とし、The Gazette の布告で全日を照合する（docs/decisions.md の 28 番）。年ごとの節が、テスト用フィクスチャ `test/fixtures/uk-2000-2011-government-lists.json` の各年の `record` から参照される。収集日は 2026-10-25。

- 布告・一覧の転記は原文のまま（英語）。OCR の誤りは直さず、明らかな誤読・誤記に [sic] を付けている。
- 推測で補った日付はない。出典で確かめられなかったものは「見つからない」と書き、第 2 節にまとめている。
- 「布告」は Royal Proclamation のほか、Northern Ireland の Secretary of State の Order（Belfast Gazette に載る 7 月 12 日と、土曜日に当たった 3 月 17 日の振替）を含む。

## 0. 前提: 1971 年法 Schedule 1 の本文

出典: https://www.legislation.gov.uk/ukpga/1971/80/schedule/1/2011-12-31/data.xml （2011-12-31 時点版。Scotland の 30th November の行は St Andrew's Day Bank Holiday (Scotland) Act 2007 で加わったもの）

> 1 The following are to be bank holidays in England and Wales:— Easter Monday. The last Monday in May. The last Monday in August. 26th December, if it be not a Sunday. 27th December in a year in which 25th or 26th December is a Sunday.
>
> 2 The following are to be bank holidays in Scotland:— New Year's Day, if it be not a Sunday or, if it be a Sunday, 3rd January. 2nd January, if it be not a Sunday or, if it be a Sunday, 3rd January. Good Friday. The first Monday in May. The first Monday in August. 30th November, if it is not a Saturday or Sunday or, if it is a Saturday or Sunday, the first Monday following that day. Christmas Day, if it be not a Sunday or, if it be a Sunday, 26th December.
>
> 3 The following are to be bank holidays in Northern Ireland:— 17th March, if it be not a Sunday or, if it be a Sunday, 18th March. Easter Monday. The last Monday in May. The last Monday in August. 26th December, if it be not a Sunday. 27th December in a year in which 25th or 26th December is a Sunday.

照合の前提（Schedule 1 から導かれること）:

- England・Wales・NI の New Year's Day と Early May は Schedule 1 にないので、毎年布告で指定される。
- Scotland の Boxing Day（12 月 26 日）と Spring（5 月の最終月曜日）も Schedule 1 にないので、毎年布告で指定される。
- Scotland では、1 月 1 日・2 日・12 月 25 日が「日曜日」なら法律で振り替わるが、「土曜日」は振り替わらない。土曜日の分の振替には布告が要る。
- NI の 7 月 12 日は Schedule 1 にないので、毎年 Secretary of State の Order で指定される（2011 年分は Royal Proclamation に入った）。3 月 17 日も、土曜日なら Order が要る。

## 1. 出典の所在と検索方法

### The Gazette（布告・Order）

通知（notice）と紙面（issue）の両方を、次の検索で網羅した。

1. 通知検索（通知の種類 Proclamations = notice code 1101、キーワード "bank holiday"、期間 1999-01-01〜2011-12-31）。
   - https://www.thegazette.co.uk/all-notices/notice?text=%22bank+holiday%22&noticetypes=1101&start-publish-date=01%2F01%2F1999&end-publish-date=31%2F12%2F2011
   - 同じ条件の Atom: https://www.thegazette.co.uk/all-notices/notice/data.feed?text=%22bank+holiday%22&noticetypes=1101&start-publish-date=01%2F01%2F1999&end-publish-date=31%2F12%2F2011&results-page-size=100
   - 結果は 56 件（1 ページ）。56 件すべての本文を参照した。
2. 取りこぼしの確認: notice code 1101 をキーワードなしで検索（同じ期間で 378 件）。1 の 56 件以外の 322 件に "holiday" を含むものはない。
3. 版ごとの検索（通知の種類を指定しない）。これは紙面の頁単位の OCR にも当たる。
   - `https://www.thegazette.co.uk/all-notices/Edinburgh/notice/data.feed?text=%22bank+holiday%22&start-publish-date=01%2F01%2F1999&end-publish-date=31%2F12%2F2011`（134 件）
   - 同じく `/Belfast/`（73 件）と `/London/`（3,254 件。`text=%22bank+holiday%22+proclamation` で 23 件に絞った）
   - 句の検索 `text=%22bank+holidays+in+Scotland%22`、`%22bank+holiday+in+Scotland%22`、`%22bank+holiday+in+Northern+Ireland%22`、`%22Public+Holiday+in+Northern+Ireland%22`（版は指定しない）
   - ここで、1 に出ない布告が見つかった。紙面の頁（"The Edinburgh Gazette, Issue N, Page P" の形の結果）と、notice code 1106（Privy Council Office）で登録されていた E-26642-1106-204 である。
4. `noticetypes=1106` に "bank holiday" を付けた検索: 1 件（E-26642-1106-204）。
5. 紙面の PDF（OCR テキスト）。号と頁は、3 のサイト内検索の結果に出た頁による（近い年の号からの推定ではない）。
   - Edinburgh 24921 頁 2551: https://www.thegazette.co.uk/Edinburgh/issue/24921/page/2551/data.pdf
   - Edinburgh 25205 頁 961: https://www.thegazette.co.uk/Edinburgh/issue/25205/page/961/data.pdf
   - Belfast 6117 頁 211、6209 頁 45、6219 頁 201、6329 頁 233: https://www.thegazette.co.uk/Belfast/issue/<号>/page/<頁>/data.pdf
   - Edinburgh 24633 頁 1433・1434（1999 年の布告の Edinburgh 版）。

### Wayback Machine（当時の政府の一覧）

- directgov:
  - `http://web.archive.org/cdx/search/cdx?url=direct.gov.uk/en/Employment/Employees/Timeoffandholidays/DG_073741&output=json&from=2004&to=2012`: 2011-10-30 以降だけ。
  - `url=direct.gov.uk/en/Governmentcitizensandrights/LivingintheUK/DG_073741`: 2008-09-06〜2012-09-21。2011 年秋までは、この URL が bank holidays のページだった。
  - これより前の directgov の bank holidays の URL は見つからない（direct.gov.uk のドメイン全体を検索する CDX の照会は 504 で失敗した）。
- DTI / BERR:
  - `url=dti.gov.uk/er/bankhol*`: 2000-05-10〜2006-04-15 の bankhol.htm と bankholhist.htm。
  - `url=dti.gov.uk/employment/bank-public-holidays*`: 2006 年 5 月以降。
  - `url=berr.gov.uk/employment/bank-public-holidays*`: 2007-07〜2008-07。
  - `url=berr.gov.uk/whatwedo/employment/bank-public-holidays*`: 2008-09〜2009-03。
- ukonline: `url=ukonline.gov.uk*`（URL に bank か holiday を含むもの）は 0 件。
- Scotland:
  - `url=scotland.gov.uk/faq/bankhol*`: 2000-12〜2003-04 と 2008-12。
  - `url=scotland.gov.uk/library3/employment/bankhol*`: 2003-04〜2009-02 の PDF。ただし中身は 6 回の取得ともすべて同じファイル（2002〜2005 年の表）。
  - `url=scotland.gov.uk/Publications/2005/01/bankholidays*`: 2008-05 以降。
  - `url=scotland.gov.uk/Topics/People/bank-holidays*`: 2011-05 以降。
- Northern Ireland:
  - `url=nidirect.gov.uk/bank-holidays*`: 2011-05-02 以降。
  - directgov が 2010 年にリンクしていた `nidirect.gov.uk/index/government-citizens-and-rights/living-in-northern-ireland/bank-holidays.htm` は、保存がない。
  - `detini.gov.uk/*bank*`・`deti.gov.uk/*bank*` は 0 件。

## 2. 出典で確かめられなかったもの

| 何を                                                                | 結果                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scotland の 2010-01-04 を指定する布告                               | 見つからない（Matthew Somerville 氏が 2014 年にスコットランド政府の確認を得た事実と一致）                                                                                                                                                   |
| Scotland の 2011-01-04 を指定する布告                               | 見つからない（同上）                                                                                                                                                                                                                        |
| **Scotland の 2010-12-27（月）を指定する布告**                      | **見つからない**。2010 年 6 月の布告（E-26799-1）は 12 月 28 日だけを指定している。政府の一覧は 2010-12-27 を "Christmas Day 27 December*" としている（2010 年の節）。新たに見つかった食い違い                                              |
| Scotland の 2002-05-27（Spring）を指定する布告                      | 見つからない。Scotland では 6 月 3 日・4 日を指定する布告だけがある（2002 年の節）。政府の一覧も 5 月 27 日を載せていない                                                                                                                   |
| 2001 年の Scotland の政府の一覧                                     | 見つからない。DTI は "DTI agreed to publicise Scottish dates up to 2000" と書いて 2001 年分を載せていない。Scottish Executive の FAQ（2001-03-30 の保存）は "Dates can be obtained by telephoning 0131 244 2180" とだけ書き、日付の表がない |
| 2004・2006・2007 年の Scotland の政府の一覧で、その年に取られた保存 | 見つからない（最も近い保存を出典とした）                                                                                                                                                                                                    |
| 2010 年の NI の政府の一覧で、その年に取られた保存                   | 見つからない（directgov 2009-06 の保存を出典とした）                                                                                                                                                                                        |
| 2008 年より前の directgov の bank holidays のページ                 | Wayback には見つからない（2000〜2007 年は DTI・BERR のページを出典とした）                                                                                                                                                                  |
| 布告の "Number 1"・"Number 2" という番号                            | The Gazette の通知の題名・本文にその表記はない。2010 年に出た布告は 3 本（2010 年の節）                                                                                                                                                     |

## 3. 同じ日を出し直した布告（1998 年末）

1998 年 12 月 28 日は、最初「追加」として布告され、後に「振替」として再布告された。対象期間の直前の例として記録する。

- L-55364-1SI（London、1999-01-04 発行、issue 55364）

題名: APPOINTING MONDAY, 28TH DECEMBER 1998 AS A BANK HOLIDAY IN ENGLAND, WALES AND NORTHERN IRELAND IN THE PLACE OF SATURDAY, 26TH DECEMBER 1998 AND APPOINTING MONDAY, 4TH JANUARY 1999 AS A BANK HOLIDAY IN SCOTLAND IN PLACE OF SATURDAY, 2ND JANUARY 1999.

> Whereas We did by Proclamation given on the twenty-fourth day of June in the year 1998 appoint Monday, the twenty-eighth day of December in the year 1998, to be a bank holiday in England, Wales and Northern Ireland, and Monday, the fourth day of January in the year 1999, to be a bank holiday in Scotland: … Now, therefore, We, in pursuance of section 1(2) of the Banking and Financial Dealings Act 1971, declare that Saturday, the twenty-sixth day of December in the year 1998, shall not be a bank holiday in England, Wales and Northern Ireland and do hereby appoint in place of it Monday, the twenty-eighth day of December in the year 1998, and declare that Saturday, the second day of January in the year 1999, shall not be a bank holiday in Scotland and do hereby appoint in place of it Monday, the fourth day of January in the year 1999.

対象期間（布告は 1999〜2011 年）の中に、同じ日を「追加」から「振替」に出し直した布告はない。同じ年に布告が 2 回以上出ている年は 2000・2004（同じ日に 2 本）・2009・2010 年で、各年の節に両方を記録している。NI の Order の告示は 2003 年に 2 回出ている（曜日の訂正。2003 年の節）。

---

## 2000

### 布告

**L-55541-3（London、1999-07-02 発行、issue 55541）**

同じ布告の Edinburgh 版は issue 24633 頁 1433–1434（1999-07-06）、Belfast 版は issue 6048 頁 617–618（1999-07-02）に載っている。

題名: APPOINTING TUESDAY, 28TH DECEMBER 1999, FRIDAY, 31ST DECEMBER 1999, MONDAY, 3RD JANUARY 2000 AND MONDAY, 1ST MAY 2000 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND AND APPOINTING MONDAY, 27TH DECEMBER 1999 AS A BANK HOLIDAY IN SCOTLAND AND APPOINTING TUESDAY, 28TH DECEMBER 1999 AS A BANK HOLIDAY IN SCOTLAND IN PLACE OF SATURDAY, 25TH DECEMBER 1999, AND APPOINTING FRIDAY, 31ST DECEMBER 1999 AS A BANK HOLIDAY IN SCOTLAND AND APPOINTING TUESDAY, 4TH JANUARY 2000 AS A BANK HOLIDAY IN SCOTLAND IN PLACE OF SATURDAY, 1ST JANUARY 2000 AND APPOINTING MONDAY, 29TH MAY 2000 AS A BANK HOLIDAY IN SCOTLAND

> Now, therefore, We, in pursuance of section 1(2) and (3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-eighth day of December, Friday, the thirty-first day of December in the year 1999, Monday, the third day of January and Monday, the first day of May in the year 2000 to be bank holidays in England, Wales and Northern Ireland and Monday, the twenty-seventh day of December in the year 1999 to be a bank holiday in Scotland and declare that Saturday, the twenty-fifth day of December in the year 1999 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the twenty-eighth day of December in the year 1999 and do hereby appoint Friday, the thirty-first day of December in the year 1999 to be a bank holiday in Scotland and declare that Saturday, the first day of January in the year 2000 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the fourth day of January in the year 2000 and do hereby appoint Monday, the twenty-ninth day of May in the year 2000 to be a bank holiday in Scotland.

この布告が指定する 2000 年の日:

- England・Wales・NI（追加）: 2000-01-03（月）、2000-05-01（月）
- Scotland:
  - 振替: 2000-01-04（火）を 2000-01-01（土）の代わりに
  - 追加: 2000-05-29（月）

1999 年 12 月の 27・28・31 日も指定しているが、対象外。

**L-55890-1001（London、2000-06-21 発行、issue 55890 頁 6737）**

同じ布告の Edinburgh 版は issue 24829 頁 1301–1302（2000-06-20）、Belfast 版は issue 6147 頁 613（2000-06-16）に載っている。

題名: APPOINTING TUESDAY, 26TH DECEMBER 2000 AND MONDAY, 28TH MAY 2001 AS BANK HOLIDAYS IN SCOTLAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenth-sixth [sic] day of December in the year 2000, and Monday, the twenth-eighth [sic] day of May in the year 2001 to be bank holidays in Scotland.

この布告が指定する 2000 年の日:

- Scotland（追加）: 2000-12-26（火）

**NI の Order: Belfast issue 6117 頁 211（2000-03-03、紙面 PDF の OCR）**

> Proclamation by the Secretary of State 12TH JULY 2000 - BANK HOLIDAY The Rt. Hon. Peter Mandelson, MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Wednesday, 12th July 2000 as a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 2000-07-12（水）

2000 年に出た布告は、このほかに 2002 年分の L-56043-1001 がある（2002 年の節に記録した）。

### 政府の一覧

**DTI「UNITED KINGDOM BANK AND PUBLIC HOLIDAYS: 2000-2003」**

http://web.archive.org/web/20000510192732/http://www.dti.gov.uk:80/er/bankhol.htm （2000-05-10 取得）

前書き:

> The expected dates of bank and public holidays in the United Kingdom for the years 2000-2003 inclusive, and in Scotland for 2000 only, are listed below. Dates in red are subject to Royal Proclamation; dates in blue are subject to Proclamation by the Secretary of State for Northern Ireland and are not included in the Royal Proclamation. Dates requiring proclamation up to 29 May 2000 were proclaimed in 1999.

England and Wales（2000 年の列）:

| Holiday                              | 2000   |
| ------------------------------------ | ------ |
| New Year's Day (or in lieu of 1 Jan) | 3 Jan  |
| Good Friday                          | 21 Apr |
| Easter Monday                        | 24 Apr |
| Early May Bank Holiday               | 1 May  |
| Spring Bank Holiday                  | 29 May |
| Summer Bank Holiday                  | 28 Aug |
| Christmas Day                        | 25 Dec |
| Boxing Day                           | 26 Dec |

Scotland（2000 年の列）:

| Holiday                              | 2000   |
| ------------------------------------ | ------ |
| New Year's Day (or in lieu of 1 Jan) | 4 Jan  |
| New Year (or in lieu of 2 Jan)       | 3 Jan  |
| Good Friday                          | 21 Apr |
| Early May Bank Holiday               | 1 May  |
| Spring Bank Holiday                  | 29 May |
| Summer Bank Holiday                  | 7 Aug  |
| Christmas Day                        | 25 Dec |
| Boxing Day                           | 26 Dec |

注記: "Note: Dates for Scotland are a matter for the Scottish Executive. DTI agreed to publicise Scottish dates up to 2000."

Northern Ireland（2000 年の列）:

| Holiday                               | 2000    |
| ------------------------------------- | ------- |
| New Year's Day (or in lieu of 1 Jan)  | 3 Jan   |
| St Patrick's Day                      | 17 Mar  |
| Good Friday                           | 21 Apr  |
| Easter Monday                         | 24 Apr  |
| Early May Bank Holiday                | 1 May   |
| Spring Bank Holiday                   | 29 May  |
| Battle of the Boyne (Orangemen's Day) | 12 July |
| Summer Bank Holiday                   | 28 Aug  |
| Christmas Day                         | 25 Dec  |
| Boxing Day                            | 26 Dec  |

Scottish Executive の FAQ: http://web.archive.org/web/20001215130300/http://www.scotland.gov.uk:80/faq/bankhol.asp （2000-12-15 取得）

日付の表はない。"How do I find out the dates of the Statutory bank holidays? Dates can be obtained by telephoning 0131 244 2180" と書いてあるだけ。

### 両者の食い違い

なし。

- England・Wales・NI の 1 月 3 日と 5 月 1 日、Scotland の 1 月 4 日・5 月 29 日・12 月 26 日は、布告どおり。
- Scotland の 1 月 3 日は Schedule 1 の「2nd January … if it be a Sunday, 3rd January」による。
- NI の 7 月 12 日は Order どおり。

### 補記

- **2000 年の Scotland（1 月 1 日が土曜日、2 日が日曜日）**: 1999 年 6 月 22 日に作られた布告（L-55541-3、1999-07-02 発行）が、"declare that Saturday, the first day of January in the year 2000 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the fourth day of January in the year 2000" と書いている。2000 年の 1 月 4 日（火）は、布告で振替として指定されている。2011 年（1 月 1 日が土曜日、2 日が日曜日。同じ曜日の並び）は布告がないので、2011 年が例外である。

## 2001

### 布告

**L-55890-1002（London、2000-06-21 発行、issue 55890 頁 6737）**

題名: APPOINTING MONDAY, 1ST JANUARY 2001 AND MONDAY, 7TH MAY 2001 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Monday, the first day of January and Monday, the seventh day of May in the year 2001, to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2001-01-01（月）、2001-05-07（月）

**L-55890-1001（2000 年の節に転記）**

- Scotland（追加）: 2001-05-28（月）

**L-56207-1005（London、2001-05-17 発行、issue 56207 頁 5919）**

この notice には、次の 2 本の布告が続けて入っている。

Scotland 分の Edinburgh 版は issue 25013 頁 1095–1096（2001-05-15、"Privy Council Office"）、Belfast 版は issue 6244 頁 537（2001-05-18）に載っている。

- 1 本目（2002 年分の England・Wales・NI）: 2002 年の節に転記した。
- 2 本目の題名: APPOINTING WEDNESDAY, 26TH DECEMBER 2001 AS A BANK HOLIDAY IN SCOTLAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Wednesday, the twenty-sixth day of December in the year 2001 to be a bank holiday in Scotland.

- Scotland（追加）: 2001-12-26（水）

**NI の Order（2 本）**

Belfast issue 6209 頁 45（2001-01-19、紙面 PDF の OCR）:

> 19th March 2001 - Bank Holiday The Rt. Hon. Peter Mandelson MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday, 19th March, 200J [sic], as a Bank Holiday in Northern Ireland. The Proclamation of a Bank Holiday directly affects only the banks and other financial institutions. Any questions of a holiday on 19th March, in other sectors of commerce and industry will be a matter for the individual firm to decide, taking into account its past practice in relation to Bank Holidays.

Belfast issue 6219 頁 201（2001-02-23、紙面 PDF の OCR）:

> Proclamation By The Secretary of State 12th July 2001 - Bank Holiday The Rt. Hon. Dr. John Reid MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Thursday, 12th July, 2001 as a Bank and Public Holiday in Northern Ireland.

- NI だけ: 2001-03-19（月）を追加。Order の文面は「in place of」とは書いておらず、単に指定している。3 月 17 日は土曜日。
- NI だけ（追加）: 2001-07-12（木）

### 政府の一覧

**DTI「UNITED KINGDOM BANK AND PUBLIC HOLIDAYS: 2000-2003」**

http://web.archive.org/web/20010306060835/http://www.dti.gov.uk:80/ER/bankhol.htm （2001-03-06 取得、"Last updated 12 December 2000"）

England and Wales（2001 年の列）:

| Holiday                              | 2001   |
| ------------------------------------ | ------ |
| New Year's Day (or in lieu of 1 Jan) | 1 Jan  |
| Good Friday                          | 13 Apr |
| Easter Monday                        | 16 Apr |
| Early May Bank Holiday               | 7 May  |
| Spring Bank Holiday                  | 28 May |
| Summer Bank Holiday                  | 27 Aug |
| Christmas Day                        | 25 Dec |
| Boxing Day                           | 26 Dec |

Scotland: 2001 年の列は "see note" で、日付がない。

Northern Ireland（2001 年の列）:

| Holiday                               | 2001    |
| ------------------------------------- | ------- |
| New Year's Day (or in lieu of 1 Jan)  | 1 Jan   |
| St Patrick's Day                      | 19 Mar  |
| Good Friday                           | 13 Apr  |
| Easter Monday                         | 16 Apr  |
| Early May Bank Holiday                | 7 May   |
| Spring Bank Holiday                   | 28 May  |
| Battle of the Boyne (Orangemen's Day) | 12 July |
| Summer Bank Holiday                   | 27 Aug  |
| Christmas Day                         | 25 Dec  |
| Boxing Day                            | 26 Dec  |

Scotland の政府の一覧は**見つからない**。

- Scottish Executive の FAQ（http://web.archive.org/web/20010330020644/http://www.scotland.gov.uk:80/faq/bankhol.asp 、2001-03-30 取得）は、電話番号を案内するだけ。
- 2003 年 4 月に取られた PDF（2002〜2005 年）にも 2001 年分はない。

### 両者の食い違い

- England・Wales・NI: なし。
- Scotland: 照合する政府の一覧がない。布告からは、Scotland の 2001 年の布告による日が 5 月 28 日と 12 月 26 日だと分かる。1 月 1 日（月）と 2 日（火）は Schedule 1 による。

### 補記

- **NI の 2001 年 3 月 17 日（土）**: Secretary of State の Order が 3 月 19 日（月）を指定している（Belfast 6209 頁 45）。DTI の一覧も "St Patrick's Day 19 Mar" としている。両者は一致する。

## 2002

### 布告

**L-56043-1001（London、2000-11-28 発行、issue 56043 頁 13411）**

Belfast 版は issue 6191 頁 1173（2000-11-17）と issue 6195 頁 1231–1232（2000-12-01）に載っている。

題名: APPOINTING TUESDAY, 4TH JUNE AS A BANK HOLIDAY IN ENGLAND, WALES, AND NORTHERN IRELAND INSTEAD OF MONDAY, 27TH MAY 2002 AND APPOINTING MONDAY, 3RD JUNE 2002 AS A BANK HOLIDAY IN ENGLAND, WALES, AND NORTHERN IRELAND

> We, therefore, in pursuance of section 1(2) of the Banking and Financial Dealings Act 1971, declare that Monday, the twenty-seventh day of May in the year 2002 shall not be a bank holiday in England, Wales, and Northern Ireland and do hereby appoint in its stead Tuesday, the fourth day of June in the year 2002 and, in pursuance of section 1(3) of the said Act, do hereby appoint Monday, the third day of June in the year 2002 to be a bank holiday in England, Wales, and Northern Ireland.

前文: "And whereas, to mark the Fiftieth Anniversary of Our Accession to the Throne, We consider it desirable that Monday, the third day of June in the year 2002 should be a bank holiday in England, Wales, and Northern Ireland"

- England・Wales・NI:
  - 移動: 2002-06-04（火）を 2002-05-27（月）の代わりに（"in its stead"）
  - 追加: 2002-06-03（月）

**Scotland の Golden Jubilee の布告: Edinburgh issue 24921 頁 2551（2000-11-28、紙面 PDF の OCR、"(1106/53)"）**

notice としては検索に出ない。

題名: APPOINTING MONDAY, 3RD JUNE 2002 AND TUESDAY, 4TH JUNE 2002 AS BANK HOLIDAYS IN SCOTLAND,

> Whereas, to mark the Fiftieth Anniversary of Our Accession to the Throne, We consider it desirable that Monday, the third day of June and Tuesday, the fourth day of June in the year 2002 should be bank holidays in Scotland: Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Monday, the third day of June and Tuesday, the fourth day of June in the year 2002 to be bank holidays in Scotland. Given at Our Court at Buckingham Palace this fifteenth day of November in the year of our Lord two thousand and in the forty-ninth year of Our Reign.

- Scotland（追加）: 2002-06-03（月）、2002-06-04（火）
  - 「in place of」の文言はなく、section 1(2)（振替）には触れていない。
  - Scotland の 5 月 27 日を指定する布告は見つからない。

**L-56207-1005（London、2001-05-17 発行、issue 56207 頁 5919）の 1 本目**

題名: APPOINTING TUESDAY, 1ST JANUARY 2002 AND MONDAY, 6TH MAY 2002 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the first day of January and Monday, the sixth day of May in the year 2002, to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2002-01-01（火）、2002-05-06（月）

**Edinburgh issue 25205 頁 961（2002-04-19、紙面 PDF の OCR、"(1106/50)"）**

notice としては検索に出ない。

題名: APPOINTING THURSDAY, 26TH DECEMBER 2002 AND MONDAY, 26TH MAY 2003 AS BANK HOLIDAYS IN SCOTLAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Thursday, the twenty-sixth day of December in the year 2002, and Monday, the twenty-sixth day of May in the year 2003 to be bank holidays in Scotland.

末尾: "Given at Our Court at Windsor Castle this seventeenth day of April in the year of our Lord two thousand and two and in the fifty-first year of Our Reign."

- Scotland（追加）: 2002-12-26（木）

**NI の Order: Belfast issue 6329 頁 233（2002-03-08、紙面 PDF の OCR）**

> Proclamation by the Secretary of State 12th July 2002 - Bank Holiday The Rt. Hon. Dr. John Reid MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Friday, 12th July, 2002 as a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 2002-07-12（金）
- NI の 3 月 17 日は日曜日で、Schedule 1 により 3 月 18 日になる。布告・Order は見つからず、要らない。

### 政府の一覧

**DTI「BANK AND PUBLIC HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND: 2002-2005」**

http://web.archive.org/web/20020603070723/http://www.dti.gov.uk:80/er/bankhol.htm （2002-06-03 取得、"Last updated 17 May 2002"）

前書きの一部: "NB: Dates for Scotland are a matter for the Scottish Executive."

England and Wales（2002 年の列）:

| Holiday                     | 2002   |
| --------------------------- | ------ |
| New Year's Day              | 1 Jan  |
| Good Friday                 | 29 Mar |
| Easter Monday               | 1 Apr  |
| Early May Bank Holiday      | 6 May  |
| Golden Jubilee Bank Holiday | 3 June |
| Spring Bank Holiday         | 4 June |
| Summer Bank Holiday         | 26 Aug |
| Christmas Day               | 25 Dec |
| Boxing Day                  | 26 Dec |

Northern Ireland（2002 年の列）:

| Holiday                               | 2002    |
| ------------------------------------- | ------- |
| New Year's Day                        | 1 Jan   |
| St Patrick's Day                      | 18 Mar  |
| Good Friday                           | 29 Mar  |
| Easter Monday                         | 1 Apr   |
| Early May Bank Holiday                | 6 May   |
| Golden Jubilee Bank Holiday           | 3 June  |
| Spring Bank Holiday                   | 4 June  |
| Battle of the Boyne (Orangemen's Day) | 12 July |
| Summer Bank Holiday                   | 26 Aug  |
| Christmas Day                         | 25 Dec  |
| Boxing Day                            | 26 Dec  |

**Scottish Executive「STATUTORY BANK HOLIDAYS IN SCOTLAND 2002-2005」（PDF）**

http://web.archive.org/web/20030423201428/http://www.scotland.gov.uk:80/library3/employment/bankhol.pdf （2003-04-23 取得。2002 年に取られた保存はない）

FAQ の 2003-04-16 の保存は "Statutory Bank Holidays for Scotland 2002-2005" という文言でリンクしているが、リンク先は `faq/bankholidays.pdf` で、2003-04-24 に取られたその PDF の題は「2003-2005」である（2003 年の節）。この library3 の PDF（2002〜2005 年）のリンク元は不明。

表の列は pdftotext の -raw 出力の順で組み直したもの。2002 年の列:

| Holiday                                          | 2002    |
| ------------------------------------------------ | ------- |
| New Years Day (or in lieu of 1 Jan)              | 1 Jan   |
| 2nd January (or day in lieu of 2 Jan)            | 2 Jan   |
| Good Friday                                      | 29 Mar  |
| Early May Bank Holiday                           | 6 May   |
| Spring Bank Holiday                              | -       |
| Golden Jubilee Holiday (2002 only)               | *3 June |
| Golden Jubilee Holiday (in place of 27 May 2002) | *4 June |
| Summer Bank Holiday                              | 5 Aug   |
| Christmas Day (or in lieu of 25 Dec)             | 25 Dec  |
| Boxing Day (or in lieu of 26 Dec)                | *26 Dec |

注記: "*The dates shown in bold are days set subject to Royal Proclamation, as they are in addition to those set out in Schedule 1 to the Financial Dealings Act 1971."

### 両者の食い違い

- 日付の食い違いはない。
- 名称の違いが 1 つある。Scotland の政府の一覧は、6 月 4 日を "Golden Jubilee Holiday (in place of 27 May 2002)" と書く。一方、Scotland の布告（Edinburgh 24921 頁 2551）は 6 月 3 日・4 日を単に追加しており、「in place of」の文言も 5 月 27 日の指定もない。Scotland の Spring は Schedule 1 にないので、5 月 27 日を指定する布告がない以上、5 月 27 日は bank holiday ではない。政府の一覧の "Spring Bank Holiday -" とは日付として一致する。

### 補記

- **Golden Jubilee（England・Wales・NI）**: L-56043-1001 が、6 月 3 日（月）を追加し、Spring を 5 月 27 日から 6 月 4 日（火）に移動している（"declare that Monday, the twenty-seventh day of May … shall not be a bank holiday … and do hereby appoint in its stead Tuesday, the fourth day of June"）。
- **Golden Jubilee（Scotland）**: Edinburgh 24921 頁 2551 が、6 月 3 日・4 日の 2 日を追加している。これは「移動」の形ではない（上記）。
- **NI の 2002 年 3 月 17 日（日）**: Schedule 1 により 3 月 18 日。DTI の一覧も "18 Mar" としている。

## 2003

### 布告

**L-56583-1005（London、2002-05-31 発行、issue 56583 頁 6663）**

Belfast 版は issue 6354 頁 573（2002-05-31）に載っている。

題名: APPOINTING WEDNESDAY 1 JANUARY 2003 AND MONDAY 5 MAY 2003 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Wednesday, the first day of January and Monday, the fifth day of May in the year 2003, to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2003-01-01（水）、2003-05-05（月）

**Edinburgh issue 25205 頁 961（2002 年の節に転記）**

- Scotland（追加）: 2003-05-26（月）

**E-25443-1101-213（Edinburgh、2003-06-13 発行、issue 25443 頁 1591）**

題名: APPOINTING FRIDAY, 26TH DECEMBER 2003 AND MONDAY, 31sT MAY 2004 AS BANK HOLIDAYS IN SCOTLAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Friday, the twenty-sixth day of December in the year 2003 and Monday, the thirty-first day of May in the year 2004 to be bank holidays in Scotland.

- Scotland（追加）: 2003-12-26（金）

**NI の Order（同じ年に告示が 2 回）**

B-6432-1101-56（Belfast、2003-02-28）:

> 14th July 2003 – Bank Holiday The Rt. Hon. Paul Murphy MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed and [sic] Order appointing Friday [sic], 14th July 2003, as a Bank and Public Holiday in Northern Ireland.

B-6439-1101-11（Belfast、2003-03-21）:

> 14th July 2003 - Bank Holiday The Rt. Hon. Paul Murphy MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday, 14th July 2003, as a Bank and Public Holiday in Northern Ireland.

2003-07-14 は月曜日。1 回目の "Friday" は曜日の誤りで、2 回目で訂正されたと読める。

- NI だけ（追加）: 2003-07-14（月）。7 月 12 日は土曜日。Order は「in place of」と書かず、14 日を指定している。

### 政府の一覧

**DTI「BANK AND PUBLIC HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND: 2003-2006」**

http://web.archive.org/web/20030207145629/http://www.dti.gov.uk:80/er/bankhol.htm （2003-02-07 取得、"Last updated 17 January 2003"）

England and Wales（2003 年の列）:

| Holiday                | 2003   |
| ---------------------- | ------ |
| New Year's Day         | 1 Jan  |
| Good Friday            | 18 Apr |
| Easter Monday          | 21 Apr |
| Early May Bank Holiday | 5 May  |
| Spring Bank Holiday    | 26 May |
| Summer Bank Holiday    | 25 Aug |
| Christmas Day          | 25 Dec |
| Boxing Day             | 26 Dec |

Northern Ireland（2003 年の列）:

| Holiday                               | 2003    |
| ------------------------------------- | ------- |
| New Year's Day                        | 1 Jan   |
| St Patrick's Day                      | 17 Mar  |
| Good Friday                           | 18 Apr  |
| Easter Monday                         | 21 Apr  |
| Early May Bank Holiday                | 5 May   |
| Spring Bank Holiday                   | 26 May  |
| Battle of the Boyne (Orangemen's Day) | 14 July |
| Summer Bank Holiday                   | 25 Aug  |
| Christmas Day                         | 25 Dec  |
| Boxing Day                            | 26 Dec  |

**Scottish Executive「STATUTORY BANK HOLIDAYS IN SCOTLAND 2003-2005」（PDF）**

http://web.archive.org/web/20030424140946/http://www.scotland.gov.uk:80/faq/bankholidays.pdf （2003-04-24 取得）

2003 年の列（太字の印は PDF のテキストでは読み取れない）:

| Holiday                               | 2003   |
| ------------------------------------- | ------ |
| New Years Day (or in lieu of 1 Jan)   | 1 Jan  |
| 2nd January (or day in lieu of 2 Jan) | 2 Jan  |
| Good Friday                           | 18 Apr |
| Early May Bank Holiday                | 5 May  |
| Spring Bank Holiday                   | 26 May |
| Summer Bank Holiday                   | 4 Aug  |
| Christmas Day (or in lieu of 25 Dec)  | 25 Dec |
| Boxing Day (or in lieu of 26 Dec)     | 26 Dec |

同じ日に取られた 2002〜2005 年の PDF（library3/employment/bankhol.pdf）の 2003 年の列も、同じ日付である（Spring と Boxing Day に * が付く）。

### 両者の食い違い

なし。

### 補記

- **NI の 2003 年 7 月 12 日（土）**: Order は 7 月 14 日（月）を指定している。告示は 2 回あり、1 回目は "Friday" の誤り。DTI の一覧も "14 July" としている。

## 2004

### 布告

**L-56962-1003（London、2003-06-13 発行、issue 56962 頁 7289）**

Belfast 版は B-6463-1101-6（2003-06-13）に載っている。

題名: APPOINTING THURSDAY, 1ST JANUARY 2004 AND MONDAY, 3RD MAY 2004 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Thursday, the first day of January and Monday, the third day of May in the year 2004 to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2004-01-01（木）、2004-05-03（月）

**E-25443-1101-213（2003 年の節に転記）**

- Scotland（追加）: 2004-05-31（月）

**同じ日（2004-06-11 発行）に出た 2 本の布告: その 1（England・Wales・NI）**

L-57314-1111（London、issue 57314 頁 7319）。同文が B-6568-1101-11（Belfast）と E-25648-1101-206（Edinburgh）にもある。

題名: APPOINTING TUESDAY 28TH DECEMBER 2004, MONDAY 3RD JANUARY 2005 AND MONDAY 2ND MAY 2005 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-eighth day of December in the year 2004, and Monday, the third day of January and Monday, the second day of May in the year 2005, to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2004-12-28（火）
- 12 月 27 日（月）は Schedule 1 の "27th December in a year in which 25th or 26th December is a Sunday" による。

**その 2（Scotland）**

L-57314-1112（London、issue 57314 頁 7320）。同文が E-25648-1101-207（Edinburgh、issue 25648 頁 1612）と B-6568-1101-12（Belfast）にもある。

題名: APPOINTING MONDAY, 27TH DECEMBER 2004, AND APPOINTING TUESDAY, 28TH DECEMBER 2004, IN PLACE OF SATURDAY, 25TH DECEMBER 2004 AND APPOINTING TUESDAY, 4TH JANUARY 2005 IN PLACE OF SATURDAY, 1ST JANUARY 2005 AND APPOINTING MONDAY, 30TH MAY 2005 AS BANK HOLIDAYS IN SCOTLAND.

> Now, therefore, We, in pursuance of section 1(2) and (3) of the Banking and Financial Dealings Act 1971, do hereby appoint Monday, the twenty-seventh day of December in the year 2004 to be a bank holiday in Scotland and declare that Saturday the twenty-fifth day of December in the year 2004 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the twenty-eighth day of December in the year 2004 and declare that Saturday, the first day of January in the year 2005 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the fourth day of January in the year 2005 and do hereby appoint Monday, the thirtieth day of May in the year 2005 to be a bank holiday in Scotland.

この布告が指定する 2004 年の日（Scotland）:

- 追加: 2004-12-27（月）
- 振替: 2004-12-28（火）を 2004-12-25（土）の代わりに

**NI の Order: B-6525-1101-75（Belfast、2004-01-16）**

> 12th July 2004 - Bank Holiday The Rt. Hon. Paul Murphy MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday, 12th July 2004 as a Bank and Public and Public [sic] Holiday in Northern Ireland.

- NI だけ（追加）: 2004-07-12（月）

### 政府の一覧

**DTI「BANK AND PUBLIC HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND: 2003-2006」**

http://web.archive.org/web/20040105003142/http://www.dti.gov.uk/er/bankhol.htm （2004-01-05 取得、"Last updated 9 June 2003"）

England and Wales（2004 年の列）:

| Holiday                                 | 2004   |
| --------------------------------------- | ------ |
| New Year's Day                          | 1 Jan  |
| Good Friday                             | 9 Apr  |
| Easter Monday                           | 12 Apr |
| Early May Bank Holiday                  | 3 May  |
| Spring Bank Holiday                     | 31 May |
| Summer Bank Holiday                     | 30 Aug |
| Christmas Day                           | 25 Dec |
| Boxing Day                              | 26 Dec |
| Substitute Bank Holiday in lieu of 26th | 27 Dec |
| Substitute Bank Holiday in lieu of 25th | 28 Dec |

Northern Ireland（2004 年の列）:

| Holiday                                 | 2004    |
| --------------------------------------- | ------- |
| New Year's Day                          | 1 Jan   |
| St Patrick's Day                        | 17 Mar  |
| Good Friday                             | 9 Apr   |
| Easter Monday                           | 12 Apr  |
| Early May Bank Holiday                  | 3 May   |
| Spring Bank Holiday                     | 31 May  |
| Battle of the Boyne (Orangemen's Day)   | 12 July |
| Summer Bank Holiday                     | 30 Aug  |
| Christmas Day                           | 25 Dec  |
| Boxing Day                              | 26 Dec  |
| Substitute Bank Holiday in lieu of 26th | 27 Dec  |
| Substitute Bank Holiday in lieu of 25th | 28 Dec  |

参考: http://web.archive.org/web/20050102020458/http://www.dti.gov.uk:80/er/bankhol.htm （2005-01-02 取得、2004〜2007 年、"Last updated 9 November 2004"）は、2004 年の列を "Christmas Day 28 Dec▲"・"Boxing Day 27 Dec ◊" と書き換えている。凡例は "▲ Substitute Bank Holiday in lieu of 25th Dec"・"◊ Substitute Bank Holiday in lieu of 26th Dec"。

**Scotland**

2004 年に取られた保存はない。最も近い 2 つ:

- 2003-04-24 取得の「STATUTORY BANK HOLIDAYS IN SCOTLAND 2003-2005」（URL は 2003 年の節）の 2004 年の列: New Years Day 1 Jan / 2nd January 2 Jan / Good Friday 9 Apr / Early May 3 May / Spring 31 May / Summer 2 Aug / Christmas Day (or in lieu of 25 Dec) **27 Dec** / Boxing Day (or in lieu of 26 Dec) **28 Dec**
- 2002〜2005 年の PDF の 2004 年の列（-raw の順）: 1 Jan / 2 Jan / 9 Apr / 3 May / *31 May / - / - / 2 Aug / *28 Dec / *27 Dec（それぞれ Christmas Day 行・Boxing Day 行）
  - 2005 年に取られた同じファイル: http://web.archive.org/web/20051105022102/http://www.scotland.gov.uk:80/library3/employment/bankhol.pdf

### 両者の食い違い

- 日付の食い違いはない。England・Wales・NI の 12 月 27・28 日、Scotland の 12 月 27・28 日とも、布告と一覧で揃っている。
- 名称の違い（どちらの日を「Christmas の代わり」と呼ぶか）がある。
  - Scotland の布告は、28 日を 25 日の代わり（in place of）、27 日を単なる追加としている。
  - 2003-04-24 の Scotland の一覧は Christmas を 27 日、Boxing Day を 28 日とし、布告と逆。
  - 2002〜2005 年の PDF と、後の 2004〜2010 年の一覧（2005 年の節）は、Christmas を 28 日、Boxing Day を 27 日とし、布告と同じ。
  - England・Wales・NI の布告は 28 日を追加するだけで、どの日の代わりかを書いていない。

### 補記

2004 年の Scotland の布告は、2005 年 1 月の割り当ての出典でもある（2005 年の節）。

## 2005

### 布告

**L-57314-1111 ほか（2004 年の節に転記）**

- England・Wales・NI（追加）: 2005-01-03（月）、2005-05-02（月）

**L-57314-1112 / E-25648-1101-207 ほか（2004 年の節に転記）**

- Scotland:
  - 振替: 2005-01-04（火）を 2005-01-01（土）の代わりに
  - 追加: 2005-05-30（月）
- Scotland の 1 月 3 日（月）は、Schedule 1 の 2nd January の日曜日の振替による。

**L-57662-1012（London、2005-06-08 発行、issue 57662 頁 7429）**

同文が E-25853-1101-280（Edinburgh、2005-06-10）と B-6669-1101-13（Belfast、2005-06-10）にもある。

題名: APPOINTING TUESDAY, 27TH DECEMBER 2005 AND MONDAY 29TH MAY 2006 AS BANK HOLIDAYS IN SCOTLAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-seventh day of December in the year 2005 and Monday, the twenty ninth day of May in the year 2006 to be bank holidays in Scotland.

- Scotland（追加）: 2005-12-27（火）
- 12 月 25 日は日曜日で、Schedule 1 により 26 日になる。

**L-57664-1011（London、2005-06-10 発行、issue 57664 頁 7557）**

同文が E-25853-1101-279（Edinburgh）と B-6669-1101-14（Belfast）にもある。

題名: APPOINTING MONDAY, 2ND JANUARY 2006 AND MONDAY, 1ST MAY 2006 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND

2006 年分なので、2006 年の節に記録した。

**NI の Order: B-6633-1101-49（Belfast、2005-02-04）**

> Proclamation by the Secretary of State 12 JULY 2005 – BANK HOLIDAY The Rt. Hon. Paul Murphy MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Tuesday 12 July 2005 as a Bank and Public and Public [sic] Holiday in Northern Ireland.

- NI だけ（追加）: 2005-07-12（火）

England・Wales・NI の 2005 年 12 月 27 日（火）は、Schedule 1 の 27th December 規定による（12 月 25 日が日曜日）。布告はない。

### 政府の一覧

**DTI「BANK AND PUBLIC HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND: 2004-2007」**

http://web.archive.org/web/20050102020458/http://www.dti.gov.uk:80/er/bankhol.htm （2005-01-02 取得、"Last updated 9 November 2004"）

England and Wales（2005 年の列）:

| Holiday                | 2005    |
| ---------------------- | ------- |
| New Year's Day         | 3 Jan ■ |
| Good Friday            | 25 Mar  |
| Easter Monday          | 28 Mar  |
| Early May Bank Holiday | 2 May   |
| Spring Bank Holiday    | 30 May  |
| Summer Bank Holiday    | 29 Aug  |
| Christmas Day          | 27 Dec▲ |
| Boxing Day             | 26 Dec  |

凡例: "■ Substitute Bank Holiday in lieu of 1st Jan"、"▲ Substitute Bank Holiday in lieu of 25th Dec"、"◊ Substitute Bank Holiday in lieu of 26th Dec"

Northern Ireland（2005 年の列）:

| Holiday                               | 2005    |
| ------------------------------------- | ------- |
| New Year's Day                        | 3 Jan ■ |
| St Patrick's Day                      | 17 Mar  |
| Good Friday                           | 25 Mar  |
| Easter Monday                         | 28 Mar  |
| Early May Bank Holiday                | 2 May   |
| Spring Bank Holiday                   | 30 May  |
| Battle of the Boyne (Orangemen's Day) | 12 July |
| Summer Bank Holiday                   | 29 Aug  |
| Christmas Day                         | 27 Dec▲ |
| Boxing Day                            | 26 Dec  |

**Scotland（2005 年に取られたもの）**

http://web.archive.org/web/20051105022102/http://www.scotland.gov.uk:80/library3/employment/bankhol.pdf （2005-11-05 取得。中身は 2002〜2005 年の PDF と同じファイル）

2005 年の列: New Years Day (or in lieu of 1 Jan) 3 Jan / 2nd January (or day in lieu of 2 Jan) 4 Jan / Good Friday 25 Mar / Early May 2 May / Spring *30 May / Summer 1 Aug / Christmas Day (or in lieu of 25 Dec) 26 Dec / Boxing Day (or in lieu of 26 Dec) *27 Dec

**Scotland（後の一覧）「STATUTORY BANK HOLIDAYS FOR SCOTLAND 2004-2010」**

http://web.archive.org/web/20080511182514/http://www.scotland.gov.uk/Publications/2005/01/bankholidays （2008-05-11 取得、"Website Publication Date January 14, 2005"）

2005 年の列: New Years Day (or in lieu of 1 Jan) **Jan 4** / 2nd January (or in lieu of 2 Jan) **Jan 3** / Good Friday Mar 25 / Early May May 2 / Spring May 30 / Summer Aug 1 / Christmas Day Dec 26 / Boxing Day Dec 27

### 両者の食い違い

- 日付の食い違いはない。Scotland の 1 月 3・4 日、12 月 26・27 日とも揃っている。
- 名称の違いがある。
  - 2002〜2005 年の PDF は、1 月 3 日を New Year's Day、4 日を 2nd January の代わりとしている。
  - 布告と 2004〜2010 年の一覧は、4 日を 1 月 1 日の代わり（New Year's Day）としている。

### 補記

- **2005 年の Scotland**: 2004 年 6 月 10 日に作られた布告（L-57314-1112 / E-25648-1101-207、2004-06-11 発行）が、"declare that Saturday, the first day of January in the year 2005 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the fourth day of January in the year 2005" と書いている。「1 月 4 日（火）を 1 月 1 日（土）の代わりに」指定していることを、原文で確かめた（Somerville 氏の記述と一致する）。

## 2006

### 布告

**L-57664-1011（London、2005-06-10 発行、issue 57664 頁 7557）**

同文が E-25853-1101-279（Edinburgh、issue 25853）と B-6669-1101-14（Belfast）にもある。

題名: APPOINTING MONDAY, 2ND JANUARY 2006 AND MONDAY, 1ST MAY 2006 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Monday, the second day of January and Monday, the first day of May in the year 2006, to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2006-01-02（月）、2006-05-01（月）

**L-57662-1012 ほか（2005 年の節に転記）**

- Scotland（追加）: 2006-05-29（月）

**E-26058-1101-52（Edinburgh、2006-06-09 発行、issue 26058）**

題名: APPOINTING TUESDAY 26TH DECEMBER 2006, AND MONDAY 28TH MAY 2007, AS BANK HOLIDAYS IN SCOTLAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-sixth day of December in the year 2006 and Monday, the twenty eighth day of May in the year 2007 to be bank holidays in Scotland.

- Scotland（追加）: 2006-12-26（火）

**NI の Order: B-6739-1101-6（Belfast、2006-02-03）**

> Proclamation By The Secretary of State 12 JULY 2006 – BANK HOLIDAY The Rt. Hon. Peter Hain MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Wednesday 12 July 2006 as a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 2006-07-12（水）

Scotland の 2006 年 1 月 1 日は日曜日で、Schedule 1 により 1 月 3 日になる（2 日は月曜日でそのまま）。布告はなく、要らない。

### 政府の一覧

**DTI「BANK AND PUBLIC HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND: 2005-2008」**

http://web.archive.org/web/20060101021711/http://www.dti.gov.uk:80/er/bankhol.htm （2006-01-01 取得、"Last updated 30 March 2005"）

England and Wales（2006 年の列）:

| Holiday                | 2006    |
| ---------------------- | ------- |
| New Year's Day         | 2 Jan ■ |
| Good Friday            | 14 Apr  |
| Easter Monday          | 17 Apr  |
| Early May Bank Holiday | 1 May   |
| Spring Bank Holiday    | 29 May  |
| Summer Bank Holiday    | 28 Aug  |
| Christmas Day          | 25 Dec  |
| Boxing Day             | 26 Dec  |

Northern Ireland（2006 年の列）:

| Holiday                               | 2006    |
| ------------------------------------- | ------- |
| New Year's Day                        | 2 Jan ■ |
| St Patrick's Day                      | 17 Mar  |
| Good Friday                           | 14 Apr  |
| Easter Monday                         | 17 Apr  |
| Early May Bank Holiday                | 1 May   |
| Spring Bank Holiday                   | 29 May  |
| Battle of the Boyne (Orangemen's Day) | 12 July |
| Summer Bank Holiday                   | 28 Aug  |
| Christmas Day                         | 25 Dec  |
| Boxing Day                            | 26 Dec  |

**Scotland**

2006 年に取られた一覧はない。2006-01-07 に取られた library3 の PDF は 2002〜2005 年のもので、2006 年を含まない。最も近いのは「STATUTORY BANK HOLIDAYS FOR SCOTLAND 2004-2010」（2008-05-11 取得、URL は 2005 年の節）で、2006 年の列は次のとおり。

New Years Day (or in lieu of 1 Jan) Jan 3 / 2nd January Jan 2 / Good Friday Apr 14 / Early May May 1 / Spring May 29 / Summer Aug 7 / Christmas Day Dec 25 / Boxing Day Dec 26

### 両者の食い違い

なし。

### 補記

## 2007

### 布告

**L-58005-1007（London、2006-06-08 発行、issue 58005）**

同文が B-6774-1101-24（Belfast、2006-06-09）にもある。

題名: APPOINTING MONDAY, 1ST JANUARY 2007, AND MONDAY, 7TH MAY 2007 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint: Monday, the first day of January and Monday, the seventh day of May in the year 2007, to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2007-01-01（月）、2007-05-07（月）

**E-26058-1101-52（2006 年の節に転記）**

- Scotland（追加）: 2007-05-28（月）

**E-26267-1101-7（Edinburgh、2007-06-15 発行）**

題名: APPOINTING WEDNESDAY, 26TH DECEMBER 2007, AND MONDAY, 26TH MAY 2008, AS BANK HOLIDAYS IN SCOTLAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Wednesday, the twenty-sixth day of December in the year 2007 and Monday, the twenty-sixth day of May in the year 2008 to be bank holidays in Scotland.

- Scotland（追加）: 2007-12-26（水）

**NI の Order（2 本）**

B-6828-1101-20（Belfast、2006-12-15、issue 6828 頁 6403）:

> A Proclamation by the Secretary of State 19 MARCH 2007 – BANK HOLIDAY The Rt. Hon. Peter Hain MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday, 19th March 2007, as a Bank Holiday in Northern Ireland. The Proclamation of a Bank Holiday directly affects only the banks and other financial institutions. The granting of a holiday on 19th March in other sectors of commerce and industry will be a matter for the individual firm to decide, taking into account its past practice in relation to Bank Holidays.

B-6842-1101-20（Belfast、2007-02-02）:

> Proclamation by the Secretary of State 12th July 2007 – bank holiday The Rt. Hon. Peter Hain MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Thursday 12th July 2007 as a Bank and Public Holiday in Northern Ireland.

- NI だけ: 2007-03-19（月）を追加。3 月 17 日は土曜日。Order は「in place of」と書かず、19 日を指定している。
- NI だけ（追加）: 2007-07-12（木）

**St Andrew's Day**: 2007 年からは Schedule 1 の規定による。布告には出ない（補記を参照）。

### 政府の一覧

**BERR「Bank and public holidays in England, Wales and Northern Ireland for the years 2007-2010」**

http://web.archive.org/web/20070716003703/http://www.berr.gov.uk:80/employment/bank-public-holidays/index.html （2007-07-16 取得）

England and Wales（2007 年の列）:

| Holiday                | 2007   |
| ---------------------- | ------ |
| New Year's Day         | 1 Jan  |
| Good Friday            | 6 Apr  |
| Easter Monday          | 9 Apr  |
| Early May Bank Holiday | 7 May  |
| Spring Bank Holiday    | 28 May |
| Summer Bank Holiday    | 27 Aug |
| Christmas Day          | 25 Dec |
| Boxing Day             | 26 Dec |

Northern Ireland（2007 年の列）:

| Holiday                               | 2007    |
| ------------------------------------- | ------- |
| New Year's Day                        | 1 Jan   |
| St Patrick's Day                      | 19 Mar  |
| Good Friday                           | 6 Apr   |
| Easter Monday                         | 9 Apr   |
| Early May Bank Holiday                | 7 May   |
| Spring Bank Holiday                   | 28 May  |
| Battle of the Boyne (Orangemen's Day) | 12 July |
| Summer Bank Holiday                   | 27 Aug  |
| Christmas Day                         | 25 Dec  |
| Boxing Day                            | 26 Dec  |

注記: "Dates in bold are bank holidays which have been introduced since the 1971 Banking and Financial Dealings Act, and are routinely proclaimed each year by the Queen; dates in italics are subject to Proclamation by the Secretary of State for Northern Ireland and are not included in the Royal Proclamation. All other dates have been designated bank holidays under the Banking and Financial Dealings Act 1971."

**Scotland**

2007 年に取られた一覧はない。2007-01-03 と 2007-09-30 に取られた library3 の PDF は、2002〜2005 年の同じファイル。最も近いのは「STATUTORY BANK HOLIDAYS FOR SCOTLAND 2004-2010」（2008-05-11 取得）で、2007 年の列は次のとおり。

New Years Day Jan 1 / 2nd January Jan 2 / Good Friday Apr 6 / Early May May 7 / Spring May 28 / Summer Aug 6 / St Andrew's Day# Nov 30 / Christmas Day Dec 25 / Boxing Day Dec 26

### 両者の食い違い

なし。

### 補記

- **NI の 2007 年 3 月 17 日（土）**: Order が 3 月 19 日（月）を指定している（B-6828-1101-20）。BERR の一覧も "19 Mar" としている。両者は一致する。
- **St Andrew's Day**: 1999〜2011 年に出た Edinburgh・London・Belfast の布告（第 1 節の検索で見つかったすべて）に、30 November・St Andrew's Day を指定するものはない。Scotland の一覧は 2007 年から "St Andrew's Day#" の行を設け、2007 年を Nov 30 としている。

## 2008

### 布告

**L-58354-276018（London、2007-06-14 発行、issue 58354 頁 8543）**

同文が B-6880-1101-9（Belfast、2007-06-15）にもある。

題名: APPOINTING TUESDAY, 1ST JANUARY 2008, AND MONDAY, 5TH MAY 2008 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the first day of January and Monday, the fifth day of May in the year 2008, to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2008-01-01（火）、2008-05-05（月）

**E-26267-1101-7（2007 年の節に転記）**

- Scotland（追加）: 2008-05-26（月）

**E-26472-1101-106（Edinburgh、2008-06-13 発行、issue 26472 頁 2215）**

題名: APPOINTING FRIDAY, 26TH DECEMBER 2008, AND MONDAY, 25TH MAY 2009, AS BANK HOLIDAYS IN SCOTLAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Friday, the twenty-sixth day of December in the year 2008 and Monday, the twenty-fifth day of May in the year 2009 to be bank holidays in Scotland.

- Scotland（追加）: 2008-12-26（金）

**NI の Order: B-6950-1101-24（Belfast、2008-02-08）**

> Proclamation by the Secretary of State 14 JULY 2008 – BANK HOLIDAY The Rt. Hon. Shaun Woodward MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday 14 July 2008 as a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 2008-07-14（月）。7 月 12 日は土曜日。

**St Andrew's Day**: Schedule 1 により、11 月 30 日（日）の翌月曜日である 12 月 1 日。布告はない。

### 政府の一覧

**directgov「Bank holidays」**

http://web.archive.org/web/20081023150954/http://www.direct.gov.uk/en/Governmentcitizensandrights/LivingintheUK/DG_073741 （2008-10-23 取得）

前書きの一部:

> The expected dates of bank and public holidays in England and Wales, Northern Ireland and Scotland for the next three years are listed below. When the usual date falls on a Saturday or Sunday, the 'substitute day' is normally the following Monday. For example in 2009, the actual Boxing Day is on Saturday, 26 December, so the substitute bank holiday is Monday, 28 December.

England and Wales（2008 年の列）:

| Holiday                | 2008        |
| ---------------------- | ----------- |
| New Year's Day         | 1 January   |
| Good Friday            | 21 March    |
| Easter Monday          | 24 March    |
| Early May Bank Holiday | 5 May       |
| Spring Bank Holiday    | 26 May      |
| Summer Bank Holiday    | 25 August   |
| Christmas Day          | 25 December |
| Boxing Day             | 26 December |

Northern Ireland（2008 年の列）:

| Holiday                               | 2008        |
| ------------------------------------- | ----------- |
| New Year's Day                        | 1 January   |
| St Patrick's Day                      | 17 March    |
| Good Friday                           | 21 March    |
| Easter Monday                         | 24 March    |
| Early May Bank Holiday                | 5 May       |
| Spring Bank Holiday                   | 26 May      |
| Battle of the Boyne (Orangemen's Day) | 14 July     |
| Summer Bank Holiday                   | 25 August   |
| Christmas Day                         | 25 December |
| Boxing Day                            | 26 December |

Scotland（2008 年の列）:

| Holiday                | 2008        |
| ---------------------- | ----------- |
| New Year's Day         | 1 January   |
| 2nd January            | 2 January   |
| Good Friday            | 21 March    |
| Early May Bank Holiday | 5 May       |
| Spring Bank Holiday    | 26 May      |
| Summer Bank Holiday    | 4 August    |
| St Andrew's Day        | 1 December  |
| Christmas Day          | 25 December |
| Boxing Day             | 26 December |

Scotland の前書き: "Since 2007, St Andrew's Day has been an alternative, voluntary public holiday, which can replace an existing local holiday."

**Scottish Government「STATUTORY BANK HOLIDAYS FOR SCOTLAND 2004-2010」**

http://web.archive.org/web/20080511182514/http://www.scotland.gov.uk/Publications/2005/01/bankholidays （2008-05-11 取得）

2008 年の列: New Years Day Jan 1 / 2nd January Jan 2 / Good Friday Mar 21 / Early May May 5 / Spring May 26 / Summer Aug 4 / St Andrew's Day# **Dec 1** / Christmas Day Dec 25 / Boxing Day Dec 26

注記: "*The dates shown in bold are days set subject to Royal Proclamation. The other dates are those prescribed in Schedule 1 to the Banking and Financial Dealings Act 1971."

### 両者の食い違い

なし。

### 補記

- **2008 年の St Andrew's Day**: directgov（2008-10-23）も Scottish Government（2008-05-11）も "1 December" / "Dec 1" としている。布告はない。
- **NI の 2008 年 7 月 12 日（土）**: Order が 7 月 14 日を指定している。directgov も "14 July" としている。

## 2009

### 布告

**L-58726-542804（London、2008-06-12 発行、issue 58726 頁 8833）**

同文が B-6987-1101-4（Belfast、2008-06-13、issue 6987 頁 885）にもある。

題名: APPOINTING THURSDAY, 1ST JANUARY 2009, AND MONDAY, 4TH MAY 2009 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Thursday, the first day of January and Monday, the fourth day of May in the year of 2009, to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2009-01-01（木）、2009-05-04（月）

**E-26472-1101-106（2008 年の節に転記）**

- Scotland（追加）: 2009-05-25（月）

**2009 年に出た布告: その 1、L-59088-838377（London、2009-06-11 発行、issue 59088）**

同文が B-7092-1101-4（Belfast、2009-06-12、issue 7092 頁 337）にもある。

題名: Appointing Friday, 1st January 2010, and Monday, 3rd May 2010 as bank holidays in England, Wales and Northern Ireland

2010 年分なので、2010 年の節に記録した。

**その 2、E-26642-1106-204（Edinburgh、2009-06-12 発行、issue 26642 頁 2783、notice code 1106 "Privy Council Office"）**

code 1101 の検索には出ない。

題名: APPOINTING MONDAY, 28TH DECEMBER 2009, AND MONDAY, 31ST MAY 2010, AS BANK HOLIDAYS IN SCOTLAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Monday, the twenty-eighth day of December in the year 2009 and Monday, the thirty-first day of May in the year 2010 to be bank holidays in Scotland.

- Scotland（追加）: 2009-12-28（月）

**その 3、L-59248-979134（London、2009-11-23 発行、issue 59248）**

同文が B-7139-1101-18（Belfast、2009-11-20、issue 7139 頁 649）にもある。

題名: APPOINTING MONDAY 28TH DECEMBER 2009 AS A BANK HOLIDAY IN ENGLAND, WALES AND NORTHERN IRELAND IN PLACE OF SATURDAY 26TH DECEMBER 2009 AND APPOINTING TUESDAY 28TH DECEMBER 2010 AS A BANK HOLIDAY IN ENGLAND, WALES AND NORTHERN IRELAND.

> Now, therefore, We, in pursuance of sections 1(2) and 1(3) of the Banking and Financial Dealings Act 1971, declare that Saturday, the twenty-sixth day of December in the year 2009 shall not be a bank holiday in England, Wales and Northern Ireland and do hereby appoint in place of it Monday, the twenty-eighth day of December in the year 2009, and do hereby appoint Tuesday, the twenty-eighth day of December in the year 2010 to be a bank holiday in England, Wales and Northern Ireland.

- England・Wales・NI（振替）: 2009-12-28（月）を 2009-12-26（土）の代わりに

**NI の Order: B-7059-1101-14（Belfast、2009-02-20、issue 7059 頁 93）**

> Proclamation by the Secretary of State 13 JULY 2009 – BANK HOLIDAY The Rt. Hon. Shaun Woodward MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday 13 July 2009 as a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 2009-07-13（月）。7 月 12 日は日曜日。

### 政府の一覧

**directgov「Bank holidays」**

http://web.archive.org/web/20090604175612/http://www.direct.gov.uk/en/Governmentcitizensandrights/LivingintheUK/DG_073741 （2009-06-04 取得）

England and Wales（2009 年の列）:

| Holiday                | 2009         |
| ---------------------- | ------------ |
| New Year's Day         | 1 January    |
| Good Friday            | 10 April     |
| Easter Monday          | 13 April     |
| Early May Bank Holiday | 4 May        |
| Spring Bank Holiday    | 25 May       |
| Summer Bank Holiday    | 31 August    |
| Christmas Day          | 25 December  |
| Boxing Day             | 28 December* |

注: "* substitute day"

Northern Ireland（2009 年の列）:

| Holiday                               | 2009         |
| ------------------------------------- | ------------ |
| New Year's Day                        | 1 January    |
| St Patrick's Day                      | 17 March     |
| Good Friday                           | 10 April     |
| Easter Monday                         | 13 April     |
| Early May Bank Holiday                | 4 May        |
| Spring Bank Holiday                   | 25 May       |
| Battle of the Boyne (Orangemen's Day) | 13 July*     |
| Summer Bank Holiday                   | 31 August    |
| Christmas Day                         | 25 December  |
| Boxing Day                            | 28 December* |

Scotland（2009 年の列）:

| Holiday                | 2009         |
| ---------------------- | ------------ |
| New Year's Day         | 1 January    |
| 2nd January            | 2 January    |
| Good Friday            | 10 April     |
| Early May Bank Holiday | 4 May        |
| Spring Bank Holiday    | 25 May       |
| Summer Bank Holiday    | 3 August     |
| St Andrew's Day        | 30 November  |
| Christmas Day          | 25 December  |
| Boxing Day             | 28 December* |

**Scottish Government（同じ 2004〜2010 年の表の別の保存）**

http://web.archive.org/web/20081205010953/http://www.scotland.gov.uk/faq/bankhol.asp （2008-12-05 取得）

2009 年の列: Jan 1 / Jan 2 / Apr 10 / May 4 / May 25 / Aug 3 / St Andrew's Day# Nov 30 / Christmas Day Dec 25 / Boxing Day Dec 28

### 両者の食い違い

- 日付の食い違いはない。
- 時期の注記が 1 つある。England・Wales・NI の 12 月 28 日（振替）の布告は 2009-11-17 に作られ、11-20／23 に発行された。一方、政府の一覧は、それより前（BERR 2007-07、directgov 2008-10・2009-06）から 28 日を載せている。

### 補記

- **2009 年に出た布告が 2010 年 1 月の Scotland に触れていないこと**: 2009 年に出た布告は L-59088-838377（2009-06-11）、E-26642-1106-204（2009-06-12）、L-59248-979134（2009-11-23）の 3 本（Belfast の同文 2 本を除く）。どれも 2010 年 1 月の Scotland に触れていない。
  - L-59088 は England・Wales・NI の 2010 年 1 月 1 日と 5 月 3 日だけ。
  - E-26642 は Scotland の 2009 年 12 月 28 日と 2010 年 5 月 31 日だけ。
  - L-59248 は England・Wales・NI の 2009 年 12 月 28 日と 2010 年 12 月 28 日だけ。
- **NI の 2009 年 7 月 12 日（日）**: Order が 7 月 13 日を指定している。directgov も "13 July*" としている。

## 2010

### 布告

**L-59088-838377（London、2009-06-11 発行、issue 59088）**

同文が B-7092-1101-4（Belfast）にもある。

題名: Appointing Friday, 1st January 2010, and Monday, 3rd May 2010 as bank holidays in England, Wales and Northern Ireland

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Friday, the first day of January and Monday, the third day of May in the year 2010, to be bank holidays in England, Wales and Northern Ireland.

- England・Wales・NI（追加）: 2010-01-01（金）、2010-05-03（月）

**E-26642-1106-204（2009 年の節に転記）**

- Scotland（追加）: 2010-05-31（月）

**L-59248-979134（2009 年の節に転記）**

- England・Wales・NI（追加）: 2010-12-28（火）
- 12 月 27 日（月）は Schedule 1 の 27th December 規定による（26 日が日曜日）。

**2010 年に出た布告（3 本）: その 1、E-26799-1（Edinburgh、2010-06-11 発行、issue 26799 頁 2237）**

題名: APPOINTING TUESDAY, 28TH DECEMBER 2010, AND MONDAY, 30TH MAY 2011, AS BANK HOLIDAYS IN SCOTLAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-eighth day of December in the year 2010 and Monday, the thirtieth day of May in the year 2011 to be bank holidays in Scotland.

- Scotland（追加）: 2010-12-28（火）
- 12 月 25 日（土）の代わりの日を指定する文言はない。12 月 27 日（月）の指定もない。

**その 2、L-59496-1170066（London、2010-07-23 発行、issue 59496）**

同文が B-7211-1101-7（Belfast、2010-07-23）にもある。2011 年分なので、2011 年の節に転記した。

**その 3、L-59637-1268656（London、2010-12-17 発行、issue 59637）**

同文が B-7253-1101-1（Belfast、issue 7253 頁 733）、Scotland 分が E-26880-2（Edinburgh、issue 26880 頁 4723）にある。2011 年分なので、2011 年の節に転記した。

**NI の Order: B-7164-1101-24（Belfast、2010-02-19、issue 7164 頁 89）**

> Proclamation by the Secretary of State 12 July 2010 – Bank Holiday The Rt. Hon. Shaun Woodward MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday 12 July 2010 as a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 2010-07-12（月）

### 政府の一覧

**directgov「Bank holidays」**

http://web.archive.org/web/20101007234850/http://www.direct.gov.uk/en/Governmentcitizensandrights/LivingintheUK/DG_073741 （2010-10-07 取得）

この版から NI の表はなくなり、nidirect へのリンクになっている。

England and Wales（2010 年の列）:

| Holiday                | 2010         |
| ---------------------- | ------------ |
| New Year's Day         | 1 January    |
| Good Friday            | 2 April      |
| Easter Monday          | 5 April      |
| Early May Bank Holiday | 3 May        |
| Spring Bank Holiday    | 31 May       |
| Summer Bank Holiday    | 30 August    |
| Christmas Day          | 27 December* |
| Boxing Day             | 28 December* |

Scotland（2010 年の列）:

| Holiday                | 2010         |
| ---------------------- | ------------ |
| New Year's Day         | 1 January    |
| 2nd January            | 4 January*   |
| Good Friday            | 2 April      |
| Early May Bank Holiday | 3 May        |
| Spring Bank Holiday    | 31 May       |
| Summer Bank Holiday    | 2 August     |
| St Andrew's Day        | 30 November  |
| Christmas Day          | 27 December* |
| Boxing Day             | 28 December* |

注: "* substitute day"

**Northern Ireland（2010 年に取られた保存はない）**

最も近い directgov 2009-06-04（URL は 2009 年の節）の 2010 年の列: New Year's Day 1 January / St Patrick's Day 17 March / Good Friday 2 April / Easter Monday 5 April / Early May 3 May / Spring 31 May / Battle of the Boyne 12 July / Summer 30 August / Christmas Day 27 December* / Boxing Day 28 December*

**Scottish Government**

2010 年に取られた保存はない。2008-05-11 と 2008-12-05 の保存（2004〜2010 年の表）の 2010 年の列:

New Years Day Jan 1 / 2nd January **Jan 4** / Good Friday Apr 2 / Early May May 3 / Spring May 31 / Summer Aug 2 / St Andrew's Day# Nov 30 / Christmas Day **Dec 27** / Boxing Day Dec 28

2011-05-14 に取られた http://web.archive.org/web/20110514092048/http://www.scotland.gov.uk/Topics/People/bank-holidays （"Page updated: Tuesday, January 11, 2011"）の 2010 年の列も、Jan 1 / Jan 4* / Apr 2 / May 3 / May 31 / Aug 2 / Nov 30 / Dec 27* / Dec 28*。

### 両者の食い違い

- **Scotland 2010-01-04（月）**: 政府の一覧はすべて "2nd January 4 January*" とする。2009 年に出た布告に、これを指定するものはない。1 月 2 日が土曜日なので、Schedule 1 では振り替わらない。
- **Scotland 2010-12-27（月）**: 政府の一覧はすべて "Christmas Day 27 December*" とする。
  - 布告で見つかったのは E-26799-1 の 12 月 28 日の追加だけ。12 月 25 日（土）の代わりとして 27 日を指定する布告は見つからない。
  - Schedule 1 の Scotland の Christmas Day は日曜日だけを 26 日に振り替えるので、土曜日の 25 日は振り替わらない。
  - 1 月 4 日と同じ形の食い違いである。「布告がない」とは、第 1 節の検索 1〜4 で見つからなかったという意味である。
- England・Wales・NI: 食い違いはない。

### 補記

- **2010 年に出た布告が 2011 年 1 月の Scotland に触れていないこと**: 2010 年に出た布告は E-26799-1（6 月、Scotland）、L-59496-1170066（7 月、England・Wales・NI と NI）、L-59637-1268656 / E-26880-2（12 月、Royal Wedding）の 3 本で、どれも 2011 年 1 月の Scotland に触れていない。
  - E-26799-1 は 2010 年 12 月 28 日と 2011 年 5 月 30 日だけ。
  - L-59496 は England・Wales・NI の 2011 年 1 月 3 日・5 月 2 日と、NI の 7 月 12 日だけ。
  - L-59637 / E-26880-2 は 2011 年 4 月 29 日だけ。
  - 布告の題名・本文に "Number 1"・"Number 2" という番号の表記はない。

## 2011

### 布告

**L-59496-1170066（London、2010-07-23 発行、issue 59496）**

同文が B-7211-1101-7（Belfast）にもある。

題名: APPOINTING MONDAY 3RD JANUARY AND MONDAY 2ND MAY 2011 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND, AND APPOINTING TUESDAY 12TH JULY 2011 AS A BANK HOLIDAY IN NORTHERN IRELAND.

> Now, therefore, We in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Monday, the third day of January and Monday, the second day of May in the year 2011, to be Bank Holidays in England, Wales and Northern Ireland and appoint Tuesday the twelfth day of July in the year 2011 to be a Bank Holiday in Northern Ireland.

- England・Wales・NI（追加）: 2011-01-03（月）、2011-05-02（月）
- NI だけ（追加）: 2011-07-12（火）。この年から、7 月 12 日は Secretary of State の Order ではなく Royal Proclamation に入っている。2011 年分の Order の告示は見つからない。

**E-26799-1（2010 年の節に転記）**

- Scotland（追加）: 2011-05-30（月）

**Royal Wedding: L-59637-1268656（London、2010-12-17 発行、issue 59637）**

同文が B-7253-1101-1（Belfast、issue 7253 頁 733）にもある。

題名: APPOINTING FRIDAY 29TH APRIL 2011 AS A BANK HOLIDAY IN ENGLAND, WALES AND NORTHERN IRELAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Friday, the twenty-ninth day of April in the year 2011 to be a bank holiday in England, Wales and Northern Ireland.

**Royal Wedding: E-26880-2（Edinburgh、2010-12-17 発行、issue 26880 頁 4723）**

題名: APPOINTING FRIDAY 29TH APRIL 2011 AS A BANK HOLIDAY IN SCOTLAND

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Friday, the twenty-ninth day of April in the year 2011 to be a bank holiday in Scotland.

- England・Wales・NI と Scotland（追加）: 2011-04-29（金）
- 布告の本文に "Royal Wedding" の語はない（前文は "Whereas We consider it desirable that …" だけ）。

**E-26950-1（Edinburgh、2011-06-10 発行、issue 26950 頁 1579）**

題名: APPOINTING TUESDAY, 27TH DECEMBER 2011, MONDAY, 4TH JUNE 2012 AND TUESDAY, 5TH JUNE 2012, AS BANK HOLIDAYS IN SCOTLAND.

> Now, therefore, We, in pursuance of section 1(2) and section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-seventh day of December in the year 2011, Monday, the fourth day of June in the year 2012 and Tuesday, the fifth day of June in the year 2012 to be bank holidays in Scotland.

- Scotland（追加）: 2011-12-27（火）
- 12 月 25 日は日曜日で、Schedule 1 により 26 日になる。

参考: 同じ日に出た L-59806-1377705（London、2011-06-09）と B-7301-1（Belfast、2011-06-10）は 2012 年分で、対象外。

Scotland の 2011 年 1 月: 1 月 1 日（土）を振り替える布告も、1 月 4 日を指定する布告も、見つからない。1 月 3 日（月）は Schedule 1 の 2nd January の日曜日の振替による。

### 政府の一覧

**directgov「Bank holidays」**

http://web.archive.org/web/20110605171618/http://www.direct.gov.uk/en/Governmentcitizensandrights/LivingintheUK/DG_073741 （2011-06-05 取得）

England and Wales（2011 年の列）:

| Holiday                | 2011         |
| ---------------------- | ------------ |
| New Year's Day         | 3 January*   |
| Good Friday            | 22 April     |
| Easter Monday          | 25 April     |
| Royal wedding          | 29 April     |
| Early May Bank Holiday | 2 May        |
| Spring Bank Holiday    | 30 May       |
| Summer Bank Holiday    | 29 August    |
| Christmas Day          | 26 December* |
| Boxing Day             | 27 December* |

Scotland（2011 年の列）:

| Holiday                | 2011         |
| ---------------------- | ------------ |
| New Year's Day         | 3 January*   |
| 2nd January            | 4 January*   |
| Good Friday            | 22 April     |
| Royal wedding          | 29 April     |
| Early May Bank Holiday | 2 May        |
| Spring Bank Holiday    | 30 May       |
| Summer Bank Holiday    | 1 August     |
| St Andrew's Day        | 30 November  |
| Christmas Day          | 26 December* |
| Boxing Day             | 27 December* |

本文: "29 April 2011 was also a special bank holiday to celebrate the royal wedding." / "There are seven permanent bank holidays across the whole of Scotland. Christmas Day and Good Friday are public holidays." / "There was an additional bank holiday on 29 April 2011 for the royal wedding."

**Scottish Government「Bank holidays」**

http://web.archive.org/web/20110514092048/http://www.scotland.gov.uk/Topics/People/bank-holidays （2011-05-14 取得、"Page updated: Tuesday, January 11, 2011"）

2011 年の列:

| Holidays                   | 2011     |
| -------------------------- | -------- |
| New Years Day              | Jan 3*   |
| 2nd January                | Jan 4*   |
| Good Friday                | Apr 22   |
| Early May Bank Holiday     | May 2    |
| Royal Wedding Bank Holiday | April 29 |
| Spring Bank Holiday        | May 30   |
| Summer Bank Holiday        | Aug 1    |
| St Andrew's Day #          | Nov 30   |
| Christmas Day              | Dec 26*  |
| Boxing Day                 | Dec 27*  |

注: "* substitute day"

**nidirect「Bank holidays」**

http://web.archive.org/web/20110502070528/http://www.nidirect.gov.uk:80/bank-holidays （2011-05-02 取得）

Northern Ireland（2011 年の列）:

| Holiday                               | 2011         |
| ------------------------------------- | ------------ |
| New Year's Day                        | 3 January*   |
| St Patrick's Day                      | 17 March     |
| Good Friday                           | 22 April     |
| Easter Monday                         | 25 April     |
| Royal Wedding                         | 29 April     |
| Early May Bank Holiday                | 2 May        |
| Spring Bank Holiday                   | 30 May       |
| Battle of the Boyne (Orangemen's Day) | 12 July      |
| Summer Bank Holiday                   | 29 August    |
| Christmas Day                         | 26 December* |
| Boxing Day                            | 27 December* |

### 両者の食い違い

- **Scotland 2011-01-04（火）**: 政府の一覧（directgov・Scottish Government）は "2nd January 4 January*" / "Jan 4*" とする。2010 年に出た布告に、これを指定するものはない。
- England・Wales・NI・Scotland のその他の日: 食い違いはない。
  - Scotland の 12 月 26 日（Christmas の日曜日の振替）は Schedule 1 による。27 日は E-26950-1 による。
  - England・Wales・NI の 12 月 26 日（Boxing Day、月曜日）と 27 日は、Schedule 1 による。

### 補記

- **Royal Wedding（2011-04-29、金）**: England・Wales・NI は L-59637-1268656（および Belfast の B-7253-1101-1）、Scotland は E-26880-2 で、全地域に追加の bank holiday として指定されている。3 つの政府の一覧（directgov・Scottish Government・nidirect）すべてに "Royal wedding 29 April" の行がある。

---

## 付録: NI の 3 月 17 日・7 月 12 日が土日に当たった年のまとめ

| 年   | 日（曜日） | Schedule 1                         | 布告・Order                                                                | 政府の一覧           |
| ---- | ---------- | ---------------------------------- | -------------------------------------------------------------------------- | -------------------- |
| 2001 | 3/17（土） | 振り替わらない（日曜日だけ 18 日） | Order で 3/19（月）を指定（Belfast 6209 頁 45）                            | DTI "19 Mar"         |
| 2002 | 3/17（日） | 3/18                               | なし（要らない）                                                           | DTI "18 Mar"         |
| 2007 | 3/17（土） | 振り替わらない                     | Order で 3/19（月）を指定（B-6828-1101-20）                                | BERR "19 Mar"        |
| 2003 | 7/12（土） | 7/12 は Schedule 1 にない          | Order で 7/14（月）を指定（B-6432 で "Friday" と誤記、B-6439 で "Monday"） | DTI "14 July"        |
| 2008 | 7/12（土） | 同上                               | Order で 7/14（月）を指定（B-6950-1101-24）                                | directgov "14 July"  |
| 2009 | 7/12（日） | 同上                               | Order で 7/13（月）を指定（B-7059-1101-14）                                | directgov "13 July*" |

どの年も、Order は「in place of」とは書かず、振替の日をそのまま指定している。

## 付録: 布告・Order の一覧（対象期間に関係するもの）

| notice ID または issue・頁                                         | 発行日                  | Edition          | 対象                                              |
| ------------------------------------------------------------------ | ----------------------- | ---------------- | ------------------------------------------------- |
| L-55364-1SI                                                        | 1999-01-04              | London           | 1998 年末の出し直し（第 3 節）                    |
| L-55541-3（Edinburgh 24633 頁 1433–1434、Belfast 6048 頁 617–618） | 1999-07-02              | London           | 1999 年末・2000 年                                |
| Belfast 6117 頁 211                                                | 2000-03-03              | Belfast          | NI 2000-07-12                                     |
| L-55890-1001（Edinburgh 24829 頁 1301–1302、Belfast 6147 頁 613）  | 2000-06-21              | London           | Scotland 2000-12-26・2001-05-28                   |
| L-55890-1002                                                       | 2000-06-21              | London           | England・Wales・NI 2001 年                        |
| L-56043-1001（Belfast 6191 頁 1173、6195 頁 1231–1232）            | 2000-11-28              | London           | England・Wales・NI 2002 年 Jubilee                |
| Edinburgh 24921 頁 2551                                            | 2000-11-28              | Edinburgh        | Scotland 2002 年 Jubilee                          |
| Belfast 6209 頁 45                                                 | 2001-01-19              | Belfast          | NI 2001-03-19                                     |
| Belfast 6219 頁 201                                                | 2001-02-23              | Belfast          | NI 2001-07-12                                     |
| L-56207-1005（Edinburgh 25013 頁 1095–1096、Belfast 6244 頁 537）  | 2001-05-17              | London           | England・Wales・NI 2002 年、Scotland 2001-12-26   |
| Belfast 6329 頁 233                                                | 2002-03-08              | Belfast          | NI 2002-07-12                                     |
| Edinburgh 25205 頁 961                                             | 2002-04-19              | Edinburgh        | Scotland 2002-12-26・2003-05-26                   |
| L-56583-1005（Belfast 6354 頁 573）                                | 2002-05-31              | London           | England・Wales・NI 2003 年                        |
| B-6432-1101-56 / B-6439-1101-11                                    | 2003-02-28 / 2003-03-21 | Belfast          | NI 2003-07-14                                     |
| L-56962-1003 / B-6463-1101-6                                       | 2003-06-13              | London / Belfast | England・Wales・NI 2004 年                        |
| E-25443-1101-213                                                   | 2003-06-13              | Edinburgh        | Scotland 2003-12-26・2004-05-31                   |
| B-6525-1101-75                                                     | 2004-01-16              | Belfast          | NI 2004-07-12                                     |
| L-57314-1111 / B-6568-1101-11 / E-25648-1101-206                   | 2004-06-11              | 3 版             | England・Wales・NI 2004-12-28・2005 年            |
| L-57314-1112 / B-6568-1101-12 / E-25648-1101-207                   | 2004-06-11              | 3 版             | Scotland 2004 年 12 月・2005 年                   |
| B-6633-1101-49                                                     | 2005-02-04              | Belfast          | NI 2005-07-12                                     |
| L-57662-1012 / B-6669-1101-13 / E-25853-1101-280                   | 2005-06-08 / 06-10      | 3 版             | Scotland 2005-12-27・2006-05-29                   |
| L-57664-1011 / B-6669-1101-14 / E-25853-1101-279                   | 2005-06-10              | 3 版             | England・Wales・NI 2006 年                        |
| B-6739-1101-6                                                      | 2006-02-03              | Belfast          | NI 2006-07-12                                     |
| L-58005-1007 / B-6774-1101-24                                      | 2006-06-08 / 06-09      | London / Belfast | England・Wales・NI 2007 年                        |
| E-26058-1101-52                                                    | 2006-06-09              | Edinburgh        | Scotland 2006-12-26・2007-05-28                   |
| B-6828-1101-20                                                     | 2006-12-15              | Belfast          | NI 2007-03-19                                     |
| B-6842-1101-20                                                     | 2007-02-02              | Belfast          | NI 2007-07-12                                     |
| L-58354-276018 / B-6880-1101-9                                     | 2007-06-14 / 06-15      | London / Belfast | England・Wales・NI 2008 年                        |
| E-26267-1101-7                                                     | 2007-06-15              | Edinburgh        | Scotland 2007-12-26・2008-05-26                   |
| B-6950-1101-24                                                     | 2008-02-08              | Belfast          | NI 2008-07-14                                     |
| L-58726-542804 / B-6987-1101-4                                     | 2008-06-12 / 06-13      | London / Belfast | England・Wales・NI 2009 年                        |
| E-26472-1101-106                                                   | 2008-06-13              | Edinburgh        | Scotland 2008-12-26・2009-05-25                   |
| B-7059-1101-14                                                     | 2009-02-20              | Belfast          | NI 2009-07-13                                     |
| L-59088-838377 / B-7092-1101-4                                     | 2009-06-11 / 06-12      | London / Belfast | England・Wales・NI 2010 年                        |
| E-26642-1106-204（code 1106）                                      | 2009-06-12              | Edinburgh        | Scotland 2009-12-28・2010-05-31                   |
| L-59248-979134 / B-7139-1101-18                                    | 2009-11-23 / 11-20      | London / Belfast | England・Wales・NI 2009-12-28（振替）・2010-12-28 |
| B-7164-1101-24                                                     | 2010-02-19              | Belfast          | NI 2010-07-12                                     |
| E-26799-1                                                          | 2010-06-11              | Edinburgh        | Scotland 2010-12-28・2011-05-30                   |
| L-59496-1170066 / B-7211-1101-7                                    | 2010-07-23              | London / Belfast | England・Wales・NI 2011 年、NI 2011-07-12         |
| L-59637-1268656 / B-7253-1101-1                                    | 2010-12-17              | London / Belfast | England・Wales・NI 2011-04-29                     |
| E-26880-2                                                          | 2010-12-17              | Edinburgh        | Scotland 2011-04-29                               |
| E-26950-1                                                          | 2011-06-10              | Edinburgh        | Scotland 2011-12-27（ほか 2012 年）               |
