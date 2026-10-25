# 英国の bank holidays 1974〜1999 年の出典

`bizdays-toolkit/uk` の 1974〜1999 年（GOV.UK のデータも当時の政府の Web の一覧もない年）の根拠となる出典の記録。1971 年法 Schedule 1 と The Gazette の国王の布告・北アイルランドの Order を正とし、Hansard の書面答弁がある年はそれを第二の出典とする（docs/decisions.md の 49 番）。1978〜1999 年は年ごとの節に、1974〜1977 年は末尾の節にまとめる。年ごとの節が、テスト用フィクスチャ `test/fixtures/uk-1974-1999-proclamations.json` の出典（号・頁または notice ID）に対応する。収集日は 2026-10-25。

- 布告・答弁の転記は原文のまま（英語）。OCR の誤りは直さず、明らかな誤読に [sic] を付けている。operative part の日付に判読不能の箇所はない。
- 推測で補った日付はない。出典で確かめられなかったものは「見つからない」と書き、第 2 節にまとめている。
- 「布告」は Royal Proclamation のほか、Northern Ireland の Secretary of State の Order（Belfast Gazette の "PROCLAMATION BY THE SECRETARY OF STATE"）を含む。
- 1978〜1997 年には政府の Web の一覧がない（第 1 節）。第二の出典は Hansard（書面答弁）で、見つかった年だけ「両者の食い違い」の節がある。

## 0. 前提

### 0.1 1971 年法 Schedule 1 の当時の本文

https://www.legislation.gov.uk/ukpga/1971/80/schedule/1/1978-01-01 は **1991-02-01 版に転送される**（legislation.gov.uk の改正履歴の基準日が 1991-02-01 のため、それより前の時点の本文は出ない）。制定時版（`/enacted`）の Schedule 1 は本文が入っていない（`NumberOfProvisions="0"`）。したがって 1978-01-01 時点の本文は legislation.gov.uk からは取れない。

1991-02-01 版（https://www.legislation.gov.uk/ukpga/1971/80/schedule/1/1991-02-01/data.xml ）の本文:

> 1 The following are to be bank holidays in England and Wales:— Easter Monday. The last Monday in May. The last Monday in August. 26th December, if it be not a Sunday. 27th December in a year in which 25th or 26th December is a Sunday.
>
> 2 The following are to be bank holidays in Scotland:— New Year's Day, if it be not a Sunday or, if it be a Sunday, 3rd January. 2nd January, if it be not a Sunday or, if it be a Sunday, 3rd January. Good Friday. The first Monday in May. The first Monday in August. Christmas Day, if it be not a Sunday or, if it be a Sunday, 26th December.
>
> 3 The following are to be bank holidays in Northern Ireland:— 17th March, if it be not a Sunday or, if it be a Sunday, 18th March. Easter Monday. The last Monday in May. The last Monday in August. 26th December, if it be not a Sunday. 27th December in a year in which 25th or 26th December is a Sunday.

1991-02-01 版には St Andrew's Day の行がない（2007 年法で加わるまで）点を除き、2011-12-31 版（docs/sources/uk-bank-holidays-2000-2011.md の第 0 節）と同じ。

1978 年当時の本文の代わりの証拠として、**Hansard の 1976-12-08 の書面答弁**（第 3 節 H1）が、当時の Schedule 1 の内容を地域ごとに列挙している。その列挙は上の 1991-02-01 版と一致する。したがって、1976 年末の時点の Schedule 1 は 1991-02-01 版と同じだったと、政府答弁から読める（1976〜1991 年の間に改正がなかったことまでは、legislation.gov.uk からは確かめられない）。

1971 年法 1 条（1991-02-01 版、https://www.legislation.gov.uk/ukpga/1971/80/section/1/6/1991-02-01/data.xml ほか）のうち、関係する項:

> (5) The powers conferred on Her Majesty by subsections (2) and (3) above may, as respects Northern Ireland, be exercised by the Secretary of State .
>
> (6) The provision made by this section for January 2nd or 3rd to be a bank holiday in Scotland shall have effect for the year 1973 and subsequent years.

布告はすべて "in pursuance of section 1(3)"（追加）または "section 1(2)"（振替）を根拠として挙げている。

### 0.2 1978 年の時点の毎年の祝日の構成

Schedule 1（上）に加え、毎年の布告・Order で次が指定される構成は、**1978 年から 1999 年まで同じで、2000 年とも同じ**（布告の題名と本文、Hansard 1976-12-08・1977-01-27・1977-07-28 から）。

| 地域             | Schedule 1                                                                                                              | 毎年の布告・Order で指定                                                             | コモン・ロー               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| England・Wales   | Easter Monday、5 月最終月曜、8 月最終月曜、12/26（日曜でなければ）、12/27（25 か 26 が日曜の年）                        | New Year's Day（1974 年〜）、Early May（1978 年〜）                                  | Good Friday、Christmas Day |
| Northern Ireland | 3/17（日曜なら 3/18）、Easter Monday、5 月最終月曜、8 月最終月曜、12/26、12/27（同上）                                  | New Year's Day、Early May（Royal Proclamation）、7/12（Secretary of State の Order） | Good Friday、Christmas Day |
| Scotland         | 1/1（日曜なら 1/3）、1/2（日曜なら 1/3。1973 年〜）、Good Friday、5 月第 1 月曜、8 月第 1 月曜、12/25（日曜なら 12/26） | Boxing Day（1974 年〜。1971〜1977 年の節）、5 月最終月曜（1978 年〜）                | —                          |

2000 年以降との違いは Scotland の St Andrew's Day（2007 年〜）だけである。

## 1. 出典の所在と検索方法

### The Gazette（布告・Order）

1. 版ごとの検索（通知の種類は指定しない。紙面の頁の OCR に当たる）。期間は 1970-01-01〜1999-12-31。
   - `https://www.thegazette.co.uk/all-notices/London/notice/data.feed?text=%22bank+holiday%22+proclamation&start-publish-date=01%2F01%2F1970&end-publish-date=31%2F12%2F1999&results-page-size=100`（37 件）
   - 同じ形の `/Edinburgh/`（29 件）、`/Belfast/`（46 件）
   - `text=%22bank+holiday%22`（London 7,173 件・Edinburgh 55 件・Belfast 72 件。Edinburgh と Belfast は全件を見た）
   - `text=%22Banking+and+Financial+Dealings+Act%22`、`%22bank+holidays+in+Scotland%22`、`%22bank+holiday+in+Northern+Ireland%22`、`%22St.+Patrick%27s+Day%22+%22bank+holiday%22`、`%22bank+holidays+in+England%22`（3 版それぞれ、3 ページまで）
   - 年ごとの検索（1984・1986〜1990・1994 年）: `text=%22bank+holiday%22`、`text=Proclamation`（1982〜1987 年）
   - notice code 1101（Proclamations）の通知: `https://www.thegazette.co.uk/all-notices/notice/data.feed?text=%22bank+holiday%22&noticetypes=1101&start-publish-date=01%2F01%2F1970&end-publish-date=31%2F12%2F1998` → 1 件（L-55182-5SI、1998-06-30）。1999 年の 2 件（L-55364-1SI・L-55541-3）は docs/sources/uk-bank-holidays-2000-2011.md の第 3 節。
2. 紙面の PDF: 1 の検索結果に出た頁（"The Edinburgh Gazette, Issue N, Page P" の形）から号と頁を取り、`https://www.thegazette.co.uk/<Edition>/issue/<号>/page/<頁>/data.pdf`（London の Supplement は `/London/issue/<号>/supplement/<頁>/data.pdf`）の OCR テキストによる（全 76 か所・152 頁。続きの頁を含む）。号は検索結果に出た頁によるもので、近い年からの推定ではない。
3. **索引の欠け**: Belfast Gazette は **1986〜1990 年の分が検索の索引に入っていない**（`text=the` でも `text=Proclamation` でも 0 件。1985 年は 1,232 件、1991 年は 1,172 件）。このため、この 5 年の NI の Order（7 月 12 日、1990 年 3 月 17 日）は見つからない。

### Hansard（第二の出典）

- Historic Hansard（https://api.parliament.uk/historic-hansard/ ）にはサイト内検索がないため、1970〜1999 年のすべての会期日の目次（`https://api.parliament.uk/historic-hansard/sittings/<年>/<月>/<日>`、5,135 日）を取得し、節の URL に "holiday" を含むもの（689 件）と、"may-day"・"new-year"・"jubilee"・"boxing"・"christmas"・"royal-wedding"・"millennium"・"ve-day"・"bank-hol"・"public-hol"・"st-patrick"・"proclamation" を含む書面答弁を拾い、関係する節（約 300）の本文を参照した。会期日の目次のうち 2 日分は取得できていない。
- 現行の Hansard の検索 API（`https://hansard-api.parliament.uk/search/contributions/Written.json?...`）は、1977〜1999 年の書面答弁を返さない（口頭の発言だけが対象）。

### Wayback Machine（1996〜1999 年の政府の一覧）

- `http://web.archive.org/cdx/search/cdx?url=dti.gov.uk/er/bankhol*&to=1999` → 0 件（最初の保存は 2000-05-10。docs/sources/uk-bank-holidays-2000-2011.md）。
- `url=open.gov.uk/dti*`（URL に "hol" を含むもの、1999 年まで）→ 0 件。`url=open.gov.uk*`（"bankhol" を含むもの）→ 0 件。
- `url=nics.gov.uk*`（"hol" を含むもの）→ bank holidays のページはない（hollymo.htm などの無関係なものだけ）。
- `url=dti.gov.uk*`・`url=scotland.gov.uk*`（"hol" を含むもの、1999 年まで）→ Internet Archive の障害（"Temporarily Offline"）で照会できていない。
- `hmso.gov.uk/*`・`scottish-office.gov.uk/*`・`number-10.gov.uk/*` → 結果が空（同じ障害と重なっており、0 件とは断定できない）。

## 2. 出典で確かめられなかったもの

| 何を                                                                                                                                    | 結果                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1987 年分の布告**（1986 年に出るはず。England・Wales・NI の 1987-01-01 と Early May、Scotland の 1986-12-26 と 1987 年 5 月最終月曜） | **見つからない**。1986 年の London・Edinburgh・Belfast の検索で該当なし。Hansard（1985-06-13）は 1987-01-01 を "To be declared by royal proclamation" としている                                                                                                                                                                              |
| 1982・1983・1984・1987 年に出た布告の**本文**                                                                                           | 見つからない。Privy Council Office の告示（「Her Majesty in Council was pleased on … by Proclamation to appoint …」）だけが載っている。これらの年の日付は告示の文言から記録した                                                                                                                                                               |
| NI の 7 月 12 日の Order（1986・1987・1988・1989・1990 年）                                                                             | 見つからない（Belfast Gazette の 1986〜1990 年は索引に入っていない）                                                                                                                                                                                                                                                                          |
| NI の 1990-03-17（土）の振替の Order                                                                                                    | 見つからない（同上）                                                                                                                                                                                                                                                                                                                          |
| 政府の Web の一覧（1978〜1999 年）                                                                                                      | 見つからない（第 1 節の Wayback。DTI の一覧の最初の保存は 2000-05-10）                                                                                                                                                                                                                                                                        |
| Hansard の翌年の日付の一覧                                                                                                              | 1981〜84 年（1980-08-08 の答弁）と 1987〜89 年（1985-06-13 の答弁）の**クリスマス・新年の分だけ**見つかった。そのほかに、1977/78 年末年始（1977-03-31）、1978 年の May Day（1976-07-27）、1979・1980 年の Early May（1978-06-29）、1992 年の全日（1992-10-26）。1995 年の全日の表（1994-07-12 の答弁）は、Historic Hansard に表が入っていない |
| legislation.gov.uk の 1978-01-01 時点の Schedule 1                                                                                      | 取れない（1991-02-01 版に転送される）                                                                                                                                                                                                                                                                                                         |

## 3. Hansard の主な答弁（年をまたぐもの）

年ごとの節で引用するものを、ここにまとめて転記する。

**H1. 1976-12-08 書面答弁**（https://api.parliament.uk/historic-hansard/written_answers/1976/dec/08/bank-holidays 、HC Deb 08 December 1976 vol 922 cc262-3W）

> Under the Banking and Financial Dealings Act 1971 the following days are Bank holidays in any year: England and Wales Easter Monday. The last Monday in May. The last Monday in August. 26th December if not a Sunday. 27th December in a year in which 25th or 26th December is a Sunday. Scotland New Year's Day, if not a Sunday, or, if a Sunday, 3rd January, 2nd January, if not a Sunday or, if a Sunday, 3rd January. Good Friday. The first Monday in May. The first Monday in August. Christmas Day, if not a Sunday, or, if a Sunday, 26th December. Northern Ireland 17th March, if not a Sunday or, if a Sunday, 18th March. Easter Monday. The last Monday in May. The last Monday in August. 26th December, if not a Sunday. 27th December in a year in which 25th or 26th December is a Sunday. In addition, Good Friday and Christmas Day are Common Law holidays in England, Wales and Northern Ireland and in Northern Ireland 12th July is proclaimed as a Bank and public holiday. Since January 1974 a New Year's Day Bank holiday has been proclaimed each year under the 1971 Act in England, Wales and Northern Ireland and similarly a Boxing Day Bank holiday was introduced in Scotland in 1973. … The Government have also announced this year that there will be a May Day Bank holiday starting in 1978. In that year the holiday will be taken on 1st May in England, Wales and Northern Ireland; a further announcement will be made about the arrangements in 1979 and subsequent years. My right hon. Friend the Secretary of State for Scotland will announce soon the date of the May Day Bank holiday in Scotland, where the first Monday in May is already a Bank holiday.

**H2. 1976-07-27 書面答弁**（https://api.parliament.uk/historic-hansard/written_answers/1976/jul/27/christmas-and-bank-holidays 、vol 916 cc161-2W）

> The May Day holiday in England, Wales and Northern Ireland will be taken on Monday 1st May in 1978. … Tuesday 28th December 1976 will be designated as a bank holiday in England, Wales and Northern Ireland, in substitution for Christmas Day; similarly Monday 3rd January 1977, not New Year's Day itself, which falls on a Saturday, will be designated as bank holiday in England, Wales and Northern Ireland. Under the Banking and Financial Dealings Act 1971 , Monday 27th December will be taken as a bank holiday in place of Boxing Day. In Scotland, … Monday 27th December 1976 and Tuesday 4th January 1977 will be designated as bank holidays in substitution for Christmas Day and New Year's Day respectively; similarly Tuesday 28th December 1976, not Boxing Day itself, which falls on a Sunday, will be designated as a bank holiday. Under the Banking and Financial Dealings Act 1971 , Monday 3rd January 1977 will be taken as a bank holiday in place of 2nd January.

**H3. 1977-01-27 書面答弁（Scotland）**（https://api.parliament.uk/historic-hansard/written_answers/1977/jan/27/may-day-1978 、vol 924 cc732-3W）

> Since the first Monday in May is already a statutory bank holiday in Scotland, the last Monday in May will be designated as an additional bank holiday in 1978 and subsequent years.

**H4. 1977-07-28 書面答弁**（https://api.parliament.uk/historic-hansard/written_answers/1977/jul/28/may-day 、vol 936 c454W）

> I have already announced that the May Day Bank holiday in England, Wales and Northern Ireland will be taken on Monday 1st May in 1978. After consultations with the TUC, the CBI and the banks, the Government has decided to designate the first Monday in May as the May Day Bank holiday in 1979 and subsequent years in England, Wales and Northern Ireland. My right hon. Friend the Secretary of State for Scotland has already announced that in Scotland the last Monday in May will be designated a Bank holiday in 1978 and subsequent years.

**H5. 1980-08-08 書面答弁**（https://api.parliament.uk/historic-hansard/written_answers/1980/aug/08/christmas-and-new-year-bank-holidays 、HC Deb 08 August 1980 vol 990 c411W）

> In the years 1981–84 certain bank holidays in the Christmas period fall on Saturdays and Sundays. Some a [sic] these are automatically transferred to weekdays under the Banking and Financial Dealings Act 1971 . In other cases it is our intention to declare alternative holidays on weekdays subject to the necessary orders being made by Royal Proclamation.

表（Historic Hansard の HTML の表の列のまま）:

| 年   | In England, Wales, and Northern Ireland:                                              | In Scotland                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1981 | Thursday 1 January* / Friday 25 December / Saturday 26 December / Monday 28 December* | Thursday 1 January / Friday 2 January / Friday 25 December / Monday 28 December*                                              |
| 1982 | Friday 1 January* / Saturday 25 December / Monday 27 December / Tuesday 28 December*  | Friday 1 January / Saturday 2 January / Monday 4 January* / Saturday 25 December / Monday 27 December* / Tuesday 28 December* |
| 1983 | Monday 3 January* / Monday 26 December / Tuesday 27 December                          | Saturday 1 January / Monday 3 January / Tuesday 4 January* / Monday 26 December / Tuesday 27 December*                        |
| 1984 | Monday 2 January* / Tuesday 25 December / Wednesday 26 December                       | Monday 2 January / Tuesday 3 January / Tuesday 25 December / Wednesday 26 December*                                           |

注: "*To be declared by Royal Proclamation."

**H6. 1985-06-13 書面答弁**（https://api.parliament.uk/historic-hansard/written_answers/1985/jun/13/bank-holidays 、HC Deb 13 June 1985 vol 80 cc523-4W）

> In the years 1987–89 certain bank holidays in the Christmas period fall on Saturdays and Sundays. Some of these are automatically transferred to weekdays under the Banking and Financial Dealings Act 1971 . In the other cases it is our intention to declare substitute holidays on weekdays subject to the necessary orders being made by royal proclamation. … the banks, the only organisations bound by the arrangements we make, require three working days to meet the needs of their customers during that very busy period.

表:

| 年   | In England, Wales and Northern Ireland                         | In Scotland                                                                      |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1987 | Thursday 1 January* / Friday 25 December / Monday 28 December* | Thursday 1 January / Friday 2 January / Monday 28 December*                      |
| 1988 | Friday 1 January* / Monday 26 December / Tuesday 27 December   | Friday 1 January / Monday 4 January* / Monday 26 December / Tuesday 27 December* |
| 1989 | Monday 2 January* / Monday 25 December / Tuesday 26 December   | Monday 2 January / Tuesday 3 January / Monday 25 December / Tuesday 26 December* |

注: "* To be declared by royal proclamation."

---

## 4. 1987 年分の布告の再調査と、The Gazette のオンラインの欠け

### 1987 年分の布告（1986 年に出たはずのもの）

1982〜84 年・1987 年の布告が本文ではなく Privy Council Office の告示（"Her Majesty in Council was pleased on … by Proclamation to appoint …"）の形で載っていたことから、1986 年分も同じ形で "bank holiday" の句が OCR で崩れている可能性を見て、London と Edinburgh の 1986 年（と 1985-08〜1987-06）を次の語で検索した: "pleased" "Proclamation"、appoint、"first day of January"、1987、"Privy Council"、"Bank Holidays"、"Banking and Financial Dealings"、"twenty-sixth day of December" Scotland。該当する布告・告示はない（1986 年の Privy Council Office の告示で見つかるのは Universities of Oxford and Cambridge Act 1923 に基づく学寮規約などだけ。London 50490 頁 5295、50598 頁 9349、50722 頁 14881）。

The Gazette の「Missing Gazette issues」（https://www.thegazette.co.uk/all-notices/content/100344 ）は、オンラインにない号を公式に一覧している。London Gazette の 50761〜50763（1986-12-30）と 50779〜50790（1986-12-30〜1987-01-02）がその一覧にあり、1987 年分の告示が載った可能性のある号と時期が重なる。欠けている号は請求できると案内されているが、本記録の時点では請求していない。

間接的な記録として、Edinburgh Gazette 22050 頁 1781（1986-11-25）の休刊の告示は、1986 年 12 月 26 日（金）と 1987 年 1 月 1 日・2 日に Gazette Office が閉まることを載せている（他の調査の報告による。本記録では原文を再確認していない）。これは官報の事務所の休業の告示であって bank holiday の指定ではない。

### Belfast Gazette 1986〜1990 年

- 号の PDF（`https://www.thegazette.co.uk/Belfast/issue/<号>/data.pdf`）を 4600 から 5180 まで 1 号ずつ当てると、4659（1985-12-27）までは取れ、**4660〜5171 の 512 号はすべて HTTP 200 で本文が 0 バイト**、5172（1991-01-04）から取れる。頁の PDF も 404 を返す
- 上の「Missing Gazette issues」は Belfast Gazette の 4660〜5171（1985-12-27〜1991-01-04）を 1 つの欠落の範囲として挙げ、オフラインでは保有している（請求できる）と表示している。索引の欠けではなく、オンラインに置かれていない号である
- Belfast Gazette の頁番号は号ごとではなく年の通し番号で（1985 年 1 月 18 日の 4518 号の巻頭は頁 37）、Order は金曜本号の巻頭（State Intelligence 欄の先頭）に載る。号が復元されれば、各年 1〜3 月の本号の巻頭 1 頁ずつ（5 年で 15〜65 頁）を読めば足りる
- この 5 年分の NI の Order（7 月 12 日、1990 年 3 月 17 日の振替）は、フィクスチャの `unverified` に、振替先の推定を含む日（1986-07-14・1987-07-13・1990-03-19。1975-07-14 も同じ）とそうでない日を分けて記録している。推定の根拠は、見つかった Order がすべて土曜日・日曜日を翌月曜日に振り替えていること（3 月 19 日: 1979・1984 年、7 月: 1980・1981・1992・1997・1998 年）

## 5. 臨時の祝日の名称の出典

布告の題名（APPOINTING … で始まる部分）と本文は、どの日も日付と地域だけを指定し、"Jubilee"・"Royal Wedding"・"VE"・"Millennium" の語を含まない。提供元の `name` は公式の出典の呼び方に限る方針なので、名称の根拠を日ごとに記す。

| 日                               | 政府の文書での呼び方                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 採った名称                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1977-06-07（England・Wales・NI） | Hansard 1975-12-18（首相。https://hansard.parliament.uk/html/Commons/1975-12-18/WrittenAnswers ）の公式プログラムの表 "Tuesday 7th (Silver Jubilee Bank Holiday)"、1977-01-19（https://hansard.parliament.uk/html/Commons/1977-01-19/WrittenAnswers ）"a special Silver Jubilee Bank Holiday will be held on Tuesday 7th June"、1976-12-08（H1）"the special Silver Jubilee Bank holiday"、1977-06-13 "the Silver Jubilee Special Bank Holiday"                                                                                                                                                                                                                                                                                 | Silver Jubilee bank holiday                       |
| 1977-06-06（Scotland）           | Hansard 1976-06-28 "Consultations about the date for a Jubilee holiday in Scotland are continuing"、1976-07-28 "Monday, 6th June 1977 will be designated as a bank holiday in Scotland"、1977-05-11 "the additional holiday this year to mark the Queen's Silver Jubilee"                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Silver Jubilee bank holiday                       |
| 1981-07-29（全地域）             | The London Gazette 48690（1981-07-27）巻頭の官報事務所の告示の見出し "ROYAL WEDDING BANK HOLIDAY PUBLISHING ARRANGEMENTS 1981"（https://thegazette.co.uk/London/issue/48690/data.pdf 。官報を 7 月 29 日に発行しない旨）、Hansard 1981-07-30（環境大臣 King。https://api.parliament.uk/historic-hansard/written-answers/1981/jul/30/royal-wedding 、HC Deb 30 July 1981 vol 9 c533W）の答弁本文 "the public holiday on 29 July for the Royal Wedding"、1981-03-12 "The wedding day on Wednesday 29 July will be a public holiday throughout the United Kingdom"、1981-05-06（見出し "Royal Wedding (Public Holiday)"）"The bank holiday on 29 July will have the same status as other bank holidays made by Royal Proclamation" | Royal Wedding bank holiday                        |
| 1995-05-08（Scotland）           | Hansard 1993-12-16 "In Scotland the anniversary will be marked by an additional day's bank holiday, also on the second Monday in May and for 1995 only"（理由は同じ答弁の "commemorating the 50th anniversary of the ending of the second world war"）、1995-03-02 "In Scotland, 8 May will be a bank holiday in addition to 1 May 1995"。固有の名称はない                                                                                                                                                                                                                                                                                                                                                                      | Additional bank holiday (VE Day 50th anniversary) |
| 1995-05-08（England・Wales・NI） | Hansard 1993-12-16・1994-07-12 "the early May bank holiday … moved from the first Monday in May to the second Monday, 8 May"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Early May bank holiday（移動）                    |
| 1999-12-31（全地域）             | Hansard 1998-06-03 "a one-off additional Bank Holiday throughout the United Kingdom on Friday, 31 December 1999"（理由は同じ答弁の "the year 2000 will be heralded by"）、1998-12-16 "an additional Bank Holiday on 31 December 1999"。"Millennium" は質問（"to mark the Millennium"）と Hansard の見出し（"Millennium Holiday"）にあり、答弁の本文の名称ではない                                                                                                                                                                                                                                                                                                                                                               | Additional bank holiday (Millennium)              |

Hansard の節の見出し（"Millennium Holiday"・"Royal Wedding (Public Holiday)" など）は Hansard の編集による付記で、答弁の文言ではない。固有の名称のない 2 日の括弧内は名称ではなく、政府の答弁が述べた理由を添えたもので、GOV.UK が 2020 年に用いた "Early May bank holiday (VE day)" と同じ形である（0.21.1）。2002 年以降の臨時の祝日（Golden Jubilee bank holiday・Royal Wedding bank holiday）は当時の政府の一覧（DTI・directgov）の名称による（docs/sources/uk-bank-holidays-2000-2011.md）。

## 6. 復活祭の日付の表（1974〜1999 年）

テストが 1971 年法 Schedule 1 の日（Good Friday、Easter Monday）をライブラリとは独立に計算するための表。フィクスチャの `easterSunday` に転記している。

- 出典: 米国海軍天文台（USNO）Astronomical Applications Department の "Selected Christian Observances"（https://aa.usno.navy.mil/data/christian_observances 。年ごとのページ `https://aa.usno.navy.mil/calculated/observances/christian?year=<年>`）。USNO はグレゴリオ暦の教会暦の規則で計算すると説明している（https://aa.usno.navy.mil/faq/easter ）
- 第二の出典: 米国国勢調査局の "Easter Dates from 1600 to 2099"（https://www.census.gov/data/software/x13as/genhol/easter-dates.html ）と、NOAA/NWS Peoria の "Easter Weather History" の一覧。26 年分がいずれも USNO と一致する
- 英国の記録との照合: Hansard 1976-07-12（1977 年の Good Friday 8 April・Easter Monday 11 April）と 1992-10-26（Good Friday 17 April・Easter Monday 20 April）が、USNO の 1977-04-10・1992-04-19 と矛盾しない
- 英国法における復活祭の日付の根拠は Calendar (New Style) Act 1750 の第 3 条と Book of Common Prayer の表（Golden Number と Sunday Letter から引く形で、年ごとの一覧ではない）。Easter Act 1928 は施行されていない

| 年   | Easter Sunday | 年   | Easter Sunday |
| ---- | ------------- | ---- | ------------- |
| 1974 | 1974-04-14    | 1987 | 1987-04-19    |
| 1975 | 1975-03-30    | 1988 | 1988-04-03    |
| 1976 | 1976-04-18    | 1989 | 1989-03-26    |
| 1977 | 1977-04-10    | 1990 | 1990-04-15    |
| 1978 | 1978-03-26    | 1991 | 1991-03-31    |
| 1979 | 1979-04-15    | 1992 | 1992-04-19    |
| 1980 | 1980-04-06    | 1993 | 1993-04-11    |
| 1981 | 1981-04-19    | 1994 | 1994-04-03    |
| 1982 | 1982-04-11    | 1995 | 1995-04-16    |
| 1983 | 1983-04-03    | 1996 | 1996-04-07    |
| 1984 | 1984-04-22    | 1997 | 1997-03-30    |
| 1985 | 1985-04-07    | 1998 | 1998-04-12    |
| 1986 | 1986-03-30    | 1999 | 1999-04-04    |

## 7. 週末に当たった祝日の扱い

提供元は土曜日・日曜日に当たった祝日を結果に載せない。これは GOV.UK の一覧の慣行（2015 年 12 月 26 日の件。docs/sources/uk-bank-holidays-2000-2011.md）に合わせたライブラリの約束で、附則の帰結ではない。附則は 12 月 26 日を「日曜日でなければ」としか書かず、土曜日の 26 日は bank holiday のまま残る。追加（section 1(3)）としてしか布告されなかった年の土曜日（Scotland の 1988 年 1 月 2 日、1993 年 12 月 25 日、1994 年 1 月 1 日、1976 年 12 月 25 日）も同じである。テストの「附則を独立に計算する」規則もこの約束を共有している（decisions.md の 49 番）。

## 1978

### 布告

**Belfast issue 3441 頁 571（1977-08-05）／Edinburgh issue 20127 頁 891（1977-08-05）**

題名（Belfast）: Appointing Monday, 2nd January, 1978, and Monday, 1st May, 1978, as Bank Holidays in England, Wales and Northern Ireland, and Tuesday, 27th December, 1977, and Monday, 29th May, 1978, as Bank Holidays in Scotland.

> We, therefore, in pursuance of Section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Monday, the second day of January, and Monday, the first day of May in the year 1978 to be Bank Holidays in England, Wales and Northern Ireland, and Tuesday, the twenty-seventh day of December in the year 1977, and Monday, the twenty-ninth day of May in the year 1978, to be Bank Holidays in Scotland. Given at Our Court at Windsor Castle this twentyninth day of July in the year of our Lord One thousand nine hundred and seventy-seven and in the twenty-sixth year of Our Reign.

- England・Wales・NI（追加）: 1978-01-02（月）、1978-05-01（月）
- Scotland（追加）: 1978-05-29（月）。1977-12-27（火）も指定しているが範囲外。

Edinburgh 版の題名は "MONDAY,, IST [sic] MAY 1978" "27ra [sic] DECEMBER" と OCR が崩れるが、本文は同じ。

**Belfast issue 3575 頁 585 ／ Edinburgh issue 20332 頁 785（1978-08-04）**（1979 年の節に転記）

- Scotland（追加）: 1978-12-26（火）

**NI の Order: Belfast issue 3521 頁 173（1978-03-10）**

> 12 JULY 1978--BANK HOLIDAY The Rt. Hon. Roy Mason, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Wednesday 12th July 1978 a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1978-07-12（水）

### Hansard

- H1（1976-12-08）、H2（1976-07-27）: 1978 年の May Day は England・Wales・NI で 5 月 1 日。
- H3（1977-01-27）: Scotland は 1978 年から 5 月最終月曜を追加。
- 1977-03-31 書面答弁（https://api.parliament.uk/historic-hansard/written_answers/1977/mar/31/bank-holidays 、vol 929 c266W）:

> I am now able to announce that Monday 2nd January will be designated a Bank holiday in England, Wales and Northern Ireland, as New Year's Day itself falls on a Sunday. In Scotland a Bank holiday will be designated on 27th December. The Bank holidays at Christmas 1977 and New Year 1978, including those already fixed under the Banking and Financial Dealings Act 1971 , will therefore be as follows: In England, Wales and Northern Ireland: Monday 26th December 1977. Tuesday 27th December 1977. Monday 2nd January 1978. In Scotland: Monday 26th December 1977. Tuesday 27th December 1977. Monday 2nd January 1978. Tuesday 3rd January 1978.

### 両者の食い違い

なし。1978 年 1 月の England・Wales・NI（1 月 2 日）と Scotland（1 月 2・3 日）は、布告と Schedule 1（Scotland の 1 月 1 日は日曜日なので 1 月 3 日）と一致する。

### 補記

- **Early May の最初の年**: 1978 年分の布告（1977-07-29 に作られた）は、"Monday, the first day of May in the year 1978" を England・Wales・NI に追加している。布告の文言には "May Day" も "Early May" も出てこず、日付だけが書かれている。May Day の名前は Hansard（H1・H2・H4）にある。
- 1977 年分には Early May がない（1977 年は 1971〜1977 年の節の範囲。1976-09 の布告と 1977-01 の布告のどちらにも 5 月第 1 月曜の指定がなく、Hansard 1976-07-12 の 1977 年の祝日一覧も England・Wales・NI に 5 月 2 日を入れていない。付録 D）。
- Scotland の 5 月最終月曜も、1978 年分の布告が最初（1976-09・1977-01 の布告には Scotland の 5 月の指定がない）。

## 1979

### 布告

**Belfast issue 3575 頁 585 ／ Edinburgh issue 20332 頁 785（1978-08-04）**

女王の不在中に Counsellors of State（Elizabeth The Queen Mother と Margaret, Countess of Snowdon）が署名した布告。

題名（Edinburgh）: APPOINTING MONDAY, Isx [sic] JANUARY 1979 AND MONDAY, 7TH MAY 1979 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND AND TUESDAY, 26iH [sic] DECEMBER 1978 ANDMONDAY, 28ra [sic] MAY 1979AS BANK HOLIDAYS IN SCOTLAND.

> We, therefore, Elizabeth The Queen Mother and Margaret, Countess of Snowdon, being authorised thereto by the said Letters Patent and in pursuance of the powers conferred on Her Majesty by section 1(3) of the Banking and Financial Dealings Act 1971, do by and with the advice of Her Majesty's Privy Council on Her Majesty's behalf hereby appoint Monday, the first day of January and Monday, the seventh day of May in the year 1979 to be bank holidays in England, Wales and Northern Ireland and Tuesday, the twenty-sixth day of December in the year 1978 and Monday, the twenty-eighth day of May in the year 1979 to be bank holidays in Scotland. Given at the Court of Saint James, this thirty-first day of July in the year of our Lord One thousand nine hundred and seventy-eight and in the twenty-seventh year of Her Majesty's Reign.

（Belfast 版の本文。Belfast 版の題名は "Isr [sic] JANUARY" "TTH [sic] MAY"。）

- England・Wales・NI（追加）: 1979-01-01（月）、1979-05-07（月）
- Scotland（追加）: 1979-05-28（月）（1978-12-26 は 1978 年分）

**Belfast issue 3738 頁 853 ／ Edinburgh issue 20585 頁 1187（1979-10-26）**（1980 年の節に転記）

- Scotland（追加）: 1979-12-26（水）

**NI の Order（2 本）**

Belfast issue 3638 頁 54（1979-01-26）:

> ST. PATRICK'S DAY 1979 -- BANK HOLIDAY The Rt. Hon. Roy Mason, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday, 19th March, 1979, a Bank Holiday in Northern Ireland.

Belfast issue 3648 頁 145（1979-02-23）:

> PROCLAMATION BY THE SECRETARY OF STATE - 12th JULY, 1979 -- BANK HOLIDAY The, Rt.' Hon. Roy Mason, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by .the Banking and Financial Dealings Act 1971, has signed an Order appointing Thursday, 12th July, 1979,-a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1979-03-19（月）（3 月 17 日は土曜日。Order は「in place of」と書かない）、1979-07-12（木）

### Hansard

- H4（1977-07-28）: 1979 年以降の England・Wales・NI の May Day は 5 月第 1 月曜。
- 1978-06-29 書面答弁（https://api.parliament.uk/historic-hansard/written_answers/1978/jun/29/may-day-bank-holiday 、vol 952 c644W）:

> My right hon. Friend announced on 28th July last year that the first Monday in May would be designated as the May Day bank holiday in 1979 and subsequent years.—[Vol. 936, c. 454]. The relevant dates are 7th May 1979 and 5th May 1980.

### 両者の食い違い

なし（1979-05-07 は布告と一致）。

### 補記

- **NI の 1979-03-17（土）**: Secretary of State の Order が 3 月 19 日（月）を指定している。

## 1980

### 布告

**Edinburgh issue 20585 頁 1187 ／ Belfast issue 3738 頁 853（1979-10-26）**

題名（Edinburgh）: APPOINTING TUESDAY, IST [sic] JANUARY 1980 AND MONDAY, STH [sic] MAY 1980 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND AND WEDNESDAY, 26ra [sic] DECEMBER 1979ANDMONDAY, 26ra [sic] MAY 1980AS BANK HOLIDAYS IN SCOTLAND.

> We, therefore, in pursuance of section 1(3} of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the first day of January and Monday, the fifth day of May in the year 1980 to be bank holidays in England, Wales and NorthernIreland and Wednesday, 'the twenty-sixth day of December in the year 1979 and Monday, the (twenty-sixth day of May in the year 1980 to be bank holidays in Scotland. Given ait Our Court ait Buckingham Palace this nineteenth day of October in the year of our !Lord <Dne thousand nine hundred and seventy-nine and in the twenty-eighth year of Our Reign.

- England・Wales・NI（追加）: 1980-01-01（火）、1980-05-05（月）
- Scotland（追加）: 1980-05-26（月）（1979-12-26 は 1979 年分）

**Edinburgh issue 20815 頁 1579 ／ Belfast issue 3886 頁 1053（1980-12-05）**（1981 年の節に転記）

- Scotland（追加）: 1980-12-26（金）

**NI の Order: Belfast issue 3830 頁 547（1980-07-04）**

> CENTRAL SECRETARIAT 14th JULY 1980 - .BANK HOLIDAY The Rt. Hon. Humphrey .Atkins, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has* signed an Order appointing Monday, 14th July, 1980, a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1980-07-14（月）（7 月 12 日は土曜日）

### Hansard

- 1978-06-29 書面答弁（1979 年の節）: "5th May 1980"。

### 両者の食い違い

なし。

### 補記

## 1981

### 布告

**Edinburgh issue 20815 頁 1579 ／ Belfast issue 3886 頁 1053（1980-12-05）**

題名（Belfast）: APPOINTING THURSDAY, Isr [sic] JANUARY 1981 AND MONDAY, 4TH MAY 1981 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND AND FRIDAY, 26TH DECEMBER 1980 AND MONDAY, 25TM [sic] MAY 1981 AS BANK HOLIDAYS IN SCOTLAND.

> We, therefore, in pursuance of Section 1(3} of the Banking and Financial Dealings Act 1971, db [sic] hereby appoint Thursday, the 1st day of January and Monday, the 4th day of May in the year 1981 to be Bank Holidays in England, Wales and Northern Ireland and Friday, the 26th day of December in the year 1980 and Monday., the 25ith [sic] day of May in the year 1981, to be Bank Holidays in Scotland. Given at Our Court at Buckingham Palace this 13th day of October in the year of our.Lord One thousand nine hundred and eighty and in the twenty-ninth year of Our Reign.

（Edinburgh 版の本文。）

- England・Wales・NI（追加）: 1981-01-01（木）、1981-05-04（月）
- Scotland（追加）: 1981-05-25（月）（1980-12-26 は 1980 年分）

**Royal Wedding: Edinburgh issue 20889 頁 493（1981-04-14）／ Belfast issue 3938 頁 407（1981-04-24）**

題名（Belfast）: APPOINTING WEDNESDAY, 29m [sic] JULY 1981 AS A BANK HOLIDAY IN ENGLAND, WALES, SCOTLAND AND NORTHERN IRELAND

> We, therefore, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Wednesday, the twenty-ninth day of July in the year 1981 to be a bank holiday in England, Wales, Scotland and Northern Ireland. Given at Our Court at Windsor Castle this thirteenth day of April in the year of our Lord One thousand nine hundred and eighty-one and in the thirtieth year of Our Reign.

- 全地域（追加）: 1981-07-29（水）。本文に "Royal Wedding" の語はない。

**Edinburgh issue 20923 頁 778–779 ／ Belfast issue 3956 頁 547–548（1981-06-12）**

題名（Edinburgh）: APPOINTING MONDAY, 28TH DECEMBER 1981 AS A Bank HOLIDAY IN ENGLAND, WALES AND NORTHERN IRELAND IN THE PLACE OF SATURDAY, 26TH DECEMBER 1981 AND APPOINTING FRIDAY, IST [sic] JANUARY ANDMONDAY, 3RD MAY 1982 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND AND APPOINTING MONDAY, 28TH DECEMBER 1981 AS A BANK . HOLIDAY IN SCOTLAND AND APPOINTING MONDAY, 4TH JANUARY 1982 AS A BANK HOLIDAY IN SCOTLAND IN THE PLACE OF SATURDAY, 2ND JANUARY 1982 AND APPOINTING MONDAY, 3IST [sic] MAY 1982 AS A BANK HOLIDAY IN SCOTLAND.

> We therefore, in pursuance of section 1(2) and (3) of the Banking and Financial Dealings Act 1971, declare that Saturday, the twenty-sixth day of December in the year 1981 shall not be a bank holiday in England, Wales and Northern Ireland and do hereby appoint in place of it Monday, the twenty-eighth day of December in the year 1981 and do hereby appoint Friday, the first day of January and Monday, the third day of May in the year 1982 to be bank holidays in England, Wales and Northern Ireland and Monday, the twenty-eighth day of December in the year 1981 to be a bank holiday in Scotland and declare that Saturday, the second day of January in the year 1982 shall not be a bank holiday in Scotland and do hereby appoint in place of it Monday, the fourth day of January in the year 1982 and do hereby appoint Monday, the thirty-first day of May in the year 1982 to be a bank holiday in Scotland. Given at Our Court at BuckinghamPalace this tenth day of June in the year of our Lord One thousand nine hundred and eighty-one and in the thirtieth year of Our Reign.

この布告が指定する 1981 年の日:

- England・Wales・NI（振替）: 1981-12-28（月）を 1981-12-26（土）の代わりに
- Scotland（追加）: 1981-12-28（月）

**NI の Order: Belfast issue 3915 頁 171（1981-02-20）**

> PROCLAMATION BY THE ,, SECRETARY OF STATE 13th JULY 1981 - BANK HOLIDAY The Rt. Hon. Humphrey Atkins, Secretary of State for Northern Ireland, in pursuance of the* powers conferred on him by the Banking and Financial Dealings Act 1971, .has signed an Order appointing Monday 13th July 1981 a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1981-07-13（月）（7 月 12 日は日曜日）

### Hansard

H5（1980-08-08）の 1981 年: England・Wales・NI は Thursday 1 January* / Friday 25 December / Saturday 26 December / Monday 28 December*、Scotland は Thursday 1 January / Friday 2 January / Friday 25 December / Monday 28 December*。

### 両者の食い違い

- 日付の食い違いはない（1 月 1 日、12 月 28 日とも一致）。
- 表記の違い: Hansard は England・Wales・NI の欄に "Saturday 26 December" を挙げているが、布告は 12 月 26 日を "shall not be a bank holiday" とし、28 日を代わりに指定している。Hansard の表は「その日（Boxing Day）と、Royal Proclamation で宣言する日（*）」を並べたもので、26 日が bank holiday のままだとは書いていない。

### 補記

- **Royal Wedding（1981-07-29）**: 全地域（England, Wales, Scotland and Northern Ireland）への追加。
- **同じ日の出し直し**: なし（1981 年 12 月 28 日は最初から「in the place of」で指定）。

## 1982

### 布告

**Edinburgh 20923 頁 778–779 ／ Belfast 3956 頁 547–548（1981-06-12）**（1981 年の節に転記）

- England・Wales・NI（追加）: 1982-01-01（金）、1982-05-03（月）
- Scotland:
  - 振替: 1982-01-04（月）を 1982-01-02（土）の代わりに
  - 追加: 1982-05-31（月）

**1982-06-23 の布告（本文は見つからない。Privy Council Office の告示）**

Edinburgh issue 21139 頁 933（1982-06-25）。同文が Belfast issue 4108 頁 585（1982-06-25）と London Supplement 49033 頁 8403（1982-06-25）にもある。

> PRIVY COUNCIL OFFICE BANKING AND FINANCIAL DEALINGS ACT 1971 NOTICE is hereby given that Her Majesty in Council was pleased on 23rd June 1982 by Proclamation to appoint Tuesday, 28th December 1982, Monday, 3rd January 1983 and Monday, 2nd May 1983 as bank holidays in England, Wales and Northern Ireland and to appoint Monday, 27th December 1982 as a bank holiday in Scotland, and to appoint Tuesday, 28th December 1982 as a bank holiday in Scotland in place of Saturday, 25th December 1982, and to appoint Tuesday, 4th January 1983 as a bank holiday in Scotland in place of Saturday, 1st January 1983, and to appoint Monday, 30th May 1983 as a bank holiday in Scotland.

この布告が指定する 1982 年の日:

- England・Wales・NI（追加）: 1982-12-28（火）。12 月 27 日（月）は Schedule 1 の 27th December 規定による（26 日が日曜日）。
- Scotland:
  - 追加: 1982-12-27（月）
  - 振替: 1982-12-28（火）を 1982-12-25（土）の代わりに

**NI の Order: Belfast issue 4071 頁 309（1982-03-26）**

> PROCLAMATION BY THE SECRETARY OF STATE 12th JULY 1982 -- BANK HOLIDAY The Rt. Hon. James Prior, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday 12th July, 1982, a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1982-07-12（月）

### Hansard

H5 の 1982 年: England・Wales・NI は Friday 1 January* / Saturday 25 December / Monday 27 December / Tuesday 28 December*、Scotland は Friday 1 January / Saturday 2 January / Monday 4 January* / Saturday 25 December / Monday 27 December* / Tuesday 28 December*。

### 両者の食い違い

- 日付の食い違いはない。
- 表記の違い: Hansard は Scotland の欄に "Saturday 2 January" と "Saturday 25 December" を挙げるが、布告はどちらも "shall not be a bank holiday"／"in place of" として振り替えている（1981 年と同じ形の表記）。

### 補記

- **Scotland の 1 月 2 日が土曜日（1982）**: 振替の布告が見つかった（Edinburgh 20923 頁 779、上の原文 "declare that Saturday, the second day of January in the year 1982 shall not be a bank holiday in Scotland and do hereby appoint in place of it Monday, the fourth day of January in the year 1982"）。
- **Scotland の 12 月 25 日が土曜日（1982）**: 振替の布告が見つかった（本文は見つからず、Privy Council Office の告示 Edinburgh 21139 頁 933 の "to appoint Tuesday, 28th December 1982 as a bank holiday in Scotland in place of Saturday, 25th December 1982"）。
- **12 月の割り当て（25 日が土曜日）**: Scotland は 28 日を Christmas Day の代わり、27 日を追加（Boxing Day 分）とする。England・Wales・NI は 28 日を追加とするだけで、どの日の代わりかを書かない（Christmas Day は England・Wales・NI では bank holiday ではなくコモン・ローの休日なので、振替の対象にならない）。

## 1983

### 布告

**1982-06-23 の布告（告示。1982 年の節に転記）**

- England・Wales・NI（追加）: 1983-01-03（月）、1983-05-02（月）
- Scotland:
  - 振替: 1983-01-04（火）を 1983-01-01（土）の代わりに
  - 追加: 1983-05-30（月）
- Scotland の 1 月 3 日（月）は Schedule 1（1 月 2 日が日曜日）。

**1983-06-22 の布告（本文は見つからない。Privy Council Office の告示）**

Edinburgh issue 21345 頁 978（1983-06-24）。同文が Belfast issue 4269 頁 565（1983-06-24）にもある。

> PRIVY COUNCIL OFFICE BANKING AND FINANCIAL DEALINGS ACT 1971 NOTICE is hereby given that Her Majesty in Council was pleased on 22nd June 1983 by Proclamation to appoint Tuesday, 27th December 1983 and Monday, 28th May 1984 as bank holidays in Scotland, and to appoint Monday, 2nd January and Monday, 7th May 1984 as bank holidays in England, Wales and Northern Ireland.

- Scotland（追加）: 1983-12-27（火）
- 12 月 25 日（日）の Scotland の振替は Schedule 1 により 12 月 26 日。England・Wales・NI の 12 月 26 日（月）・27 日（火）は Schedule 1。

**NI の Order: Belfast issue 4228 頁 267（1983-03-25）**

> PROCLAMATION BY THE SECRETARY OF STATE 12th JULY 1983- BANK HOLIDAY The Rt. Hon. James Prior, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Tuesday 12th July 1983 a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1983-07-12（火）

### Hansard

H5 の 1983 年: England・Wales・NI は Monday 3 January* / Monday 26 December / Tuesday 27 December、Scotland は Saturday 1 January / Monday 3 January / Tuesday 4 January* / Monday 26 December / Tuesday 27 December*。

1982-02-10 書面答弁（https://api.parliament.uk/historic-hansard/written_answers/1982/feb/10/public-holiday 、vol 17 c375W）:

> Mr. Bob Dunn asked the Secretary of State for Employment if, in order to assist industry, he will designate Friday 31 December 1982 as opposed to Monday 3 January 1983 as a public holiday in place of Saturday 1 January 1983. § Mr. Alison No. Friday 31 December 1982 would make difficulties for the financial institutions, which are the organisations primarily bound by bank holiday arrangements.

### 両者の食い違い

- 日付の食い違いはない。
- 表記の違い: Hansard は Scotland の欄に "Saturday 1 January" を挙げるが、布告は 1 月 4 日を "in place of Saturday, 1st January 1983" としている。

### 補記

- **Scotland の 1 月 1 日が土曜日（1983）**: 振替の布告が見つかった（本文は見つからず、告示 Edinburgh 21139 頁 933 の "to appoint Tuesday, 4th January 1983 as a bank holiday in Scotland in place of Saturday, 1st January 1983"）。
- **12 月の割り当て（25 日が日曜日）**: Scotland は 12 月 26 日が Schedule 1 の Christmas Day の振替、27 日を布告で追加。England・Wales・NI は 26・27 日とも Schedule 1 で、布告はない。

## 1984

### 布告

**1983-06-22 の布告（告示。1983 年の節に転記）**

- England・Wales・NI（追加）: 1984-01-02（月）、1984-05-07（月）
- Scotland（追加）: 1984-05-28（月）

**1984-06-25 の布告（本文は見つからない。Privy Council Office の告示）**

Edinburgh issue 21555 頁 939（1984-06-29）。同文が London issue 49792 頁 8947（1984-06-29）と Belfast issue 4432 頁 455（1984-06-29）にもある。

> PRIVY COUNCIL OFFICE BANKING AND FINANCIAL DEALINGS ACT 1971 NOTICE is hereby given that her Majesty in Council was pleased on the 25th June 1984 by Proclamation to appoint Tuesday, 1st January and Monday, 6th May 1985 as bank holidays in England, Wales and Northern Ireland, and to appoint Wednesday, 26th December 1984 and Monday, 27th May 1985 as bank holidays in Scotland.

- Scotland（追加）: 1984-12-26（水）

**NI の Order: Belfast issue 4367 頁 67（1984-02-03）**

> PROCLAMATION BY THE SECRETARY OF STATE ST. PATRICK'S DAY 1984 - BANK HOLIDAY The Rt. Hon. James Prior, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed a Proclamation appointing Monday, 19th March, 1984 a Bank Holiday in Northern Ireland in place of Saturday, 17th March, 1984. 12th JULY 1984 - BANK HOLIDAY The Rt. Hon. James Prior, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealing Act 1971, has signed a Proclamation appointing Thursday, 12th July, 1984 a Bank and a Public Holiday in Northern Ireland.

- NI だけ:
  - 振替: 1984-03-19（月）を 1984-03-17（土）の代わりに（"in place of Saturday, 17th March, 1984"。St Patrick's Day の振替で「in place of」と書いた唯一の例）
  - 追加: 1984-07-12（木）

### Hansard

H5 の 1984 年: England・Wales・NI は Monday 2 January* / Tuesday 25 December / Wednesday 26 December、Scotland は Monday 2 January / Tuesday 3 January / Tuesday 25 December / Wednesday 26 December*。

### 両者の食い違い

なし。

### 補記

- **NI の 1984-03-17（土）**: Secretary of State が 3 月 19 日を「in place of」で指定している。

## 1985

### 布告

**1984-06-25 の布告（告示。1984 年の節に転記）**

- England・Wales・NI（追加）: 1985-01-01（火）、1985-05-06（月）
- Scotland（追加）: 1985-05-27（月）

**Edinburgh issue 21780 頁 1143 ／ London issue 50218 頁 10661 ／ Belfast issue 4601 頁 723（1985-08-02）**（1986 年の節に転記）

- Scotland（追加）: 1985-12-26（木）

**NI の Order: Belfast issue 4518 頁 37（1985-01-18）**

> PROCLAMATION BY THE SECRETARY OF STATE 12th JULY, 1985 -- BANK HOLIDAY The Rt. Hon. Douglas Richard Kurd [sic], C.B.E., M.P., Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Friday, 12th July, 1985, a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1985-07-12（金）
- 3 月 17 日は日曜日で、Schedule 1 により 3 月 18 日。

### Hansard

Hansard に見つからない（1985 年の日付の一覧はない。H5 は 1984 年まで、H6 は 1987 年から）。

### 補記

## 1986

### 布告

**Edinburgh issue 21780 頁 1143 ／ London issue 50218 頁 10661 ／ Belfast issue 4601 頁 723（1985-08-02）**

題名（Edinburgh）: APPOINTING WEDNESDAY, 1st JANUARY 1986 AND MONDAY, 5th MAY 1986 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND, AND THURSDAY, 26th DECEMBER 1985, AND MONDAY, 26th MAY 1986 AS BANK HOLIDAYS IN SCOTLAND

> We, therefore, in pursuance of Section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Wednesday, the first day of January, and Monday, the fifth day of May in the year 1986 to be bank holidays in England, Wales and Northern Ireland, and Thursday, the twenty-sixth day of December in the year 1985, and Monday, the twenty-sixth day of May in the year 1986 to be bank holidays in Scotland. Given at Our Court at Buckingham Palace this thirty-first day of July in the year of our Lord One thousand nine hundred and eighty-five and in the thirty-fourth year of Our Reign.

- England・Wales・NI（追加）: 1986-01-01（水）、1986-05-05（月）
- Scotland（追加）: 1986-05-26（月）（1985-12-26 は 1985 年分）

**Scotland の 1986-12-26（金）を指定する布告**: 見つからない（1987 年分の布告が見つからないため）。

**NI の 1986-07-12（土）の Order**: 見つからない（Belfast Gazette の 1986 年は索引にない）。

### Hansard

Hansard に見つからない。

### 補記

- 1986 年 12 月の Scotland の Boxing Day（26 日、金）と、NI の 7 月 12 日（土。振替があれば 14 日）は、出典が見つからない。

## 1987

### 布告

**1987 年分の布告（1986 年に出るはず）**: **見つからない**。England・Wales・NI の 1987-01-01（木）と Early May（5 月第 1 月曜は 1987-05-04）、Scotland の 5 月最終月曜（1987-05-25）を指定する布告は、The Gazette の検索で見つからなかった。日付は補わない。

**1987-06-10 の布告（本文は見つからない。Privy Council Office の告示）**

Edinburgh issue 22161 頁 879（1987-06-12）。同文が London issue 50964 頁 7607（1987-06-15）にもある。

> PRIVY COUNCIL OFFICE BANKING AND FINANCIAL DEALINGS ACT 1971 NOTICE is hereby given that Her Majesty in Council was pleased on the 10th June 1987 by Proclamation to appoint Monday 28th December 1987, Friday 1st January and Monday 2nd May 1988, as Bank Holidays in England, Wales and Northern Ireland, and to appoint Monday 28th December 1987, Monday 4th January and Monday 30th May 1988 as Bank Holidays in Scotland.

この布告が指定する 1987 年の日:

- England・Wales・NI: 1987-12-28（月）。告示の文言は "to appoint" だけで、12 月 26 日（土）の代わりかどうかは書いていない。
- Scotland: 1987-12-28（月）（追加。告示の文言は "to appoint" だけ）

**NI の 1987-07-12（日）の Order**: 見つからない（Belfast Gazette の 1987 年は索引にない）。

### Hansard

H6（1985-06-13）の 1987 年: England・Wales・NI は Thursday 1 January* / Friday 25 December / Monday 28 December*、Scotland は Thursday 1 January / Friday 2 January / Monday 28 December*。

### 両者の食い違い

- 1987-01-01（England・Wales・NI）: Hansard は "To be declared by royal proclamation" とするが、その布告は見つからない（食い違いではなく、照合できない）。
- 1987-12-28: 告示と一致。
- Hansard の Scotland の欄に "Friday 25 December" がない（Christmas Day は Scotland では Schedule 1 の bank holiday）。England・Wales・NI の欄には Saturday 26 December が挙がっていない。Hansard の表の記載漏れか、意図した省略かは分からない。

### 補記

- 1987 年の Early May（England・Wales・NI）と Scotland の 5 月最終月曜は、布告も Hansard も見つからない。

## 1988

### 布告

**1987-06-10 の布告（告示。1987 年の節に転記）**

- England・Wales・NI（追加）: 1988-01-01（金）、1988-05-02（月）
- Scotland: 1988-01-04（月）、1988-05-30（月）。告示の文言は "to appoint" だけで、1 月 4 日が 1 月 2 日（土）の代わりかどうかは書いていない。

**Edinburgh issue 22415 頁 1333（1988-09-06）**（1989 年の節に転記）

- Scotland（追加）: 1988-12-27（火）

**NI の 1988-07-12（火）の Order**: 見つからない（索引にない）。

### Hansard

H6 の 1988 年: England・Wales・NI は Friday 1 January* / Monday 26 December / Tuesday 27 December、Scotland は Friday 1 January / Monday 4 January* / Monday 26 December / Tuesday 27 December*。

### 両者の食い違い

なし（1 月 4 日、12 月 27 日とも一致）。

### 補記

- **Scotland の 1 月 2 日が土曜日（1988）**: 1 月 4 日を指定する布告は**見つかった**が、本文は見つからず、告示には「in place of」の文言がない（"to appoint … Monday 4th January … 1988 as Bank Holidays in Scotland"）。Hansard（H6）も 1 月 4 日を "*"（Royal Proclamation で宣言）としている。
- **12 月の割り当て（25 日が日曜日）**: Scotland は 26 日が Schedule 1、27 日を布告で追加。England・Wales・NI は 26・27 日とも Schedule 1。

## 1989

### 布告

**Edinburgh issue 22415 頁 1333（1988-09-06）**

題名: APPOINTING TUESDAY, 27TH DECEMBER 1988 AND MONDAY 29TH MAY 1989 AS BANK HOLIDAYS IN SCOTLAND AND APPOINTING MONDAY, 2ND JANUARY 1989 AND MONDAY, 1ST MAY 1989 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND

> We, therefore, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twentyseventh day of December in the year 1988 and Monday, the twentyninth day of May in the year 1989 to be bank holidays in Scotland, and Monday, the second day of January and Monday,the first day of May in the year 1989 to be bank holidays in England, Wales and Northern Ireland. Given at Our Court at BuckinghamPalace this twenty-second day of June in the year of Our Lord One thousand nine hundred and eightyeight in the thirty-seventh year our [sic] Our Reign.

- England・Wales・NI（追加）: 1989-01-02（月）、1989-05-01（月）
- Scotland（追加）: 1989-05-29（月）（1988-12-27 は 1988 年分）

**Edinburgh issue 22613 頁 1411（1989-08-25）／ London issue 51855 頁 9961（1989-08-29）**（1990 年の節に転記）

- Scotland（追加）: 1989-12-26（火）

**NI の 1989-07-12（水）の Order**: 見つからない（索引にない）。

### Hansard

H6 の 1989 年: England・Wales・NI は Monday 2 January* / Monday 25 December / Tuesday 26 December、Scotland は Monday 2 January / Tuesday 3 January / Monday 25 December / Tuesday 26 December*。

### 両者の食い違い

なし。

### 補記

## 1990

### 布告

**Edinburgh issue 22613 頁 1411（1989-08-25）／ London issue 51855 頁 9961（1989-08-29）**

題名（London）: Appointing Tuesday, 26th December 1989 and Monday, 28th May 1990 as Bank Holidays in Scotland and Appointing Monday, 1st January 1990 and Monday, 7th May 1990 as Bank Holidays in England, Wales and Northern Ireland.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-sixth day of December in the year 1989 and Monday, the twenty-eighth day of May in the year 1990 to be bank holidays in Scotland and Monday, the first day of January and Monday, the seventh day of May in the year 1990 to be bank holidays in England, Wales and Northern Ireland. Given at Our Court at Buckingham Palace this second day of August in the year of our Lord One thousand nine hundred and eighty-nine and in the thirty-eighth year of Our Reign.

- England・Wales・NI（追加）: 1990-01-01（月）、1990-05-07（月）
- Scotland（追加）: 1990-05-28（月）（1989-12-26 は 1989 年分）

**Edinburgh issue 22787 頁 1255（1990-07-03）／ London issue 52202 頁 11411（1990-07-04）**（1991 年の節に転記）

- Scotland（追加）: 1990-12-26（水）

**NI の Order**: 1990-03-17（土）の振替と 1990-07-12（木）は、どちらも見つからない（索引にない）。

### Hansard

Hansard に見つからない。

### 補記

- **NI の 1990-03-17（土）**: 振替の Order は見つからない。Hansard にもない。

## 1991

### 布告

**Edinburgh issue 22787 頁 1255 ／ London issue 52202 頁 11411（1990-07-03／04）**

題名（London）: APPOINTING WEDNESDAY 26th DECEMBER 1990 AND MONDAY 27th MAY 1991 AS BANK HOLIDAYS IN SCOTLAND AND TUESDAY 1st JANUARY 1991 AND MONDAY 6th MAY 1991 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Wednesday, the twenty-sixth day of December in the year 1990 and Monday, the twenty-seventh day of May in the year 1991 to be bank holidays in Scotland and Tuesday, the first day of January and Monday, the sixth day of May in the year 1991 to be bank holidays in England, Wales and Northern Ireland. Given at Our Court at Buckingham Palace this seventh day of June in the year or [sic] our Lord One thousand nine hundred and ninety and in the thirty-ninth year of Our Reign.

- England・Wales・NI（追加）: 1991-01-01（火）、1991-05-06（月）
- Scotland（追加）: 1991-05-27（月）（1990-12-26 は 1990 年分）

**Edinburgh issue 22989 頁 1767 ／ Belfast issue 5222 頁 647（1991-06-28）**（1992 年の節に転記）

- Scotland（追加）: 1991-12-26（木）

**NI の Order: Belfast issue 5180 頁 110（1991-02-01）**

> CENTRAL SECRETARIAT PROCLAMATION BY THE SECRETARY OF STATE 12th July 1991 BANK HOLIDAY The Rt. Hon. Peter Brooke MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Friday, 12th July, 1991, a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1991-07-12（金）

### Hansard

Hansard に見つからない。

### 補記

## 1992

### 布告

**Edinburgh issue 22989 頁 1767 ／ Belfast issue 5222 頁 647（1991-06-28）**

題名（Belfast）: APPOINTING THURSDAY 26th DECEMBER 1991 AND MONDAY 25th MAY 1992 AS BANK HOLIDAYS IN SCOTLAND AND WEDNESDAY 1st JANUARY 1992 AND MONDAY 4th MAY 1992 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Thursday, the twenty-sixth day of December in the year 1991, and Monday, the twenty-fifth day of May in the year 1992, to be bank holidays in Scotland and Wednesday, the first day of January, and Monday, the fourth day of May, in the year 1992 to be bank holidays in England, Wales and Northern Ireland. Given at Our Court at Buckingham Palace this twenty-sixth day of June in the year of our Lord one thousand, nine hundredand ninety one and in the fortieth year of Our Reign.

（Edinburgh 版の本文。）

- England・Wales・NI（追加）: 1992-01-01（水）、1992-05-04（月）
- Scotland（追加）: 1992-05-25（月）（1991-12-26 は 1991 年分）

**Belfast issue 5317 頁 529（1992-06-05）／ London Supplement 52944 頁 9671（1992-06-08）／ Edinburgh issue 23183 頁 1827（1992-06-09）**

題名（Belfast）: Appointing Monday, 28th December, 1992 as a Bank Holiday in England, Wales and Northern Ireland in the place of Saturday, 26th December, 1992 and appointing Friday, 1st January and Monday, 3rd May, 1993 as Bank Holidays in England, Wales and Nor them [sic] Ireland and appointing Monday, 4th January, 1993 as a Bank Holiday in Scotland in the place of Saturday, 2nd January, 1993 and appointing Monday, 31st May, 1993 as a Bank Holiday in Scotland.

> Now, therefore, we, in pursuance of section 1(2) and (3) of the Banking and Financial Dealings Act 1971, declare that Saturday, the twenty-sixth day of December in the year 1992, shall not be a bank holiday in England, Wales and Northern Ireland and do hereby appoint in place of it Monday the twenty-eighth day of December in the year 1992, and do hereby appoint Friday, the first day of January and Monday, the third day of May in the year 1993, to be bank holidays in England, Wales and Northern Ireland and Monday, the twenty-eighth day of December in the year 1992, to be a bank holiday in Scotland and declare that Saturday, the second day of January in the year 1993; shall not be a bank holiday in Scotland and do hereby appoint in place of it Monday, the fourth day of January in the year 1993 and do hereby appoint Monday, the thirty-first day of May in the year 1993, to be a bank holiday in Scotland. Given at Our Court at Buckingham Palace this fourth day of June in the year of our Lord one thousand nine hundred and ninety-two and in the forty-first year of Our Reign.

この布告が指定する 1992 年の日:

- England・Wales・NI（振替）: 1992-12-28（月）を 1992-12-26（土）の代わりに
- Scotland（追加）: 1992-12-28（月）

**NI の Order: Belfast issue 5291 頁 205（1992-03-06）**

> PROCLAMATION BY THE SECRETARY OF STATE 13TH JULY 1992 -- BANK HOLIDAY The Rt. Hon. Peter Brooke, MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday, 13th July, 1992, a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1992-07-13（月）（7 月 12 日は日曜日）

### Hansard

1992-10-26 書面答弁（https://api.parliament.uk/historic-hansard/written_answers/1992/oct/26/public-holidays 、HC Deb 26 October 1992 vol 212 c500W）:

> The table following gives United Kingdom bank holidays for 1992. Bank holidays in the United Kingdom 1992 Date New Year's Day 1 January Bank Holiday (Scotland) 2 January St. Patrick's Day (Northern Ireland) 17 March Good Friday 17 April Easter Monday (except Scotland) 20 April May Day Bank Holiday 4 May Spring Bank Holiday 25 May Battle of the Boyne (Northern Ireland) 13 July Summer Bank Holiday (Scotland) 3 August Summer Bank Holiday (except Scotland) 31 August Christmas Day 25 December Boxing Day 26 December Bank Holiday 28 December

地域の別は、項目名の括弧（"(Scotland)"・"(Northern Ireland)"・"(except Scotland)"）で示されている。

### 両者の食い違い

- 日付の食い違いはない。
- 表記の違い: Hansard は "Boxing Day 26 December" と "Bank Holiday 28 December" を並べ、地域を書いていないが、布告は England・Wales・NI の 26 日（土）を "shall not be a bank holiday" とし、28 日を代わりに指定している（Scotland の 28 日は追加）。Hansard の "Spring Bank Holiday 25 May" は地域を書いていないが、England・Wales・NI の 5 月最終月曜（Schedule 1）と Scotland の 5 月 25 日（布告）がどちらも 25 日なので、日付は一致する。

### 補記

- **同じ日の出し直し**: なし（1992 年 12 月 28 日は最初から「in the place of」で指定）。

## 1993

### 布告

**Belfast 5317 頁 529 ほか（1992-06。1992 年の節に転記）**

- England・Wales・NI（追加）: 1993-01-01（金）、1993-05-03（月）
- Scotland:
  - 振替: 1993-01-04（月）を 1993-01-02（土）の代わりに
  - 追加: 1993-05-31（月）

**Edinburgh issue 23399 頁 2381（1993-06-29）／ Belfast issue 5431 頁 631（1993-07-02）**

題名（Edinburgh）: Appointing Tuesday, 28th December 1993, Monday, 3rd January 1994 and Monday, 2nd May 1994 as Bank Holidays in England, Wales and Northern Ireland and Appointing Monday, 27th December 1993, Tuesday 28th December 1993, Tuesday 4th January 1994 and Monday 30th May 1994 as Bank Holidays in Scotland.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-eighth day of December in the year 1993, and Monday, the third day of January and Monday, the second day of May in the year 1994 to be bank holidays in England, Wales and Northern Ireland and Monday, the twenty-seventh day of December and Tuesday, the twenty-eighth day of December in the year 1993, and Tuesday, the fourth day of January and Monday, the thirtieth day of May in the year 1994, to be bank holidays in Scotland. Given at Our Court at Buckingham Palace this twenty-third day of June in the year of Our Lord one thousand nine hundred and ninety-three and in the forty-second year of Our Reign.

この布告が指定する 1993 年の日:

- England・Wales・NI（追加）: 1993-12-28（火）。12 月 27 日（月）は Schedule 1（26 日が日曜日）。
- Scotland（追加）: 1993-12-27（月）、1993-12-28（火）。**section 1(3) だけを根拠とし、12 月 25 日（土）の代わりとは書いていない**。

**NI の Order: Belfast issue 5388 頁 103（1993-02-05）**

> PROCLAMATION BY THE SECRETARY OF STATE 12TH JULY, 1993 -- BANK HOLIDAY The Rt. Hon. Sir Patrick Mayhew, QC, MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday, 12th July, 1993, a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1993-07-12（月）

### Hansard

Hansard に見つからない。

### 補記

- **Scotland の 1 月 2 日が土曜日（1993）**: 振替の布告が見つかった（上の原文 "declare that Saturday, the second day of January in the year 1993; shall not be a bank holiday in Scotland and do hereby appoint in place of it Monday, the fourth day of January in the year 1993"）。
- **Scotland の 12 月 25 日が土曜日（1993）**: 12 月 27・28 日を指定する布告は**見つかった**が、**振替（in place of）ではなく追加（section 1(3)）として**書かれている。12 月 25 日（土）を "shall not be a bank holiday" とする文言はない。
- **12 月の割り当て（25 日が土曜日）**: Scotland は 27・28 日のどちらも Christmas Day の代わりと書かない。England・Wales・NI は 28 日を追加とするだけ。

## 1994

### 布告

**Edinburgh 23399 頁 2381 ／ Belfast 5431 頁 631（1993-06。1993 年の節に転記）**

- England・Wales・NI（追加）: 1994-01-03（月）、1994-05-02（月）
- Scotland（追加）: 1994-01-04（火）、1994-05-30（月）。1 月 4 日は section 1(3) の追加として書かれ、1 月 1 日（土）の代わりとは書いていない。Scotland の 1 月 3 日（月）は Schedule 1（1 月 2 日が日曜日）。

**London issue 53715 頁 9221（1994-06-27）／ Edinburgh issue 23603 頁 1549（1994-06-28）／ Belfast issue 5533 頁 631（1994-07-01）**（1995 年の節に転記）

- Scotland（追加）: 1994-12-27（火）

**NI の Order: Belfast issue 5494 頁 149（1994-02-18）**

> PROCLAMATION BY THE SECRETARY OF STATE 12th JULY 1994 -- BANK HOLIDAY The Rt. Hon. Sir Patrick Mayhew, QC, MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an order appointing Tuesday, 12th July, 1994 a Bank and a Public Holiday in Northern Ireland.

- NI だけ（追加）: 1994-07-12（火）

### Hansard

Hansard に見つからない（1994-07-12 の答弁は 1995 年分。1995 年の節）。

### 補記

- **Scotland の 1 月 1 日が土曜日（1994）**: 1 月 4 日を指定する布告は**見つかった**（Edinburgh 23399 頁 2381）が、**追加（section 1(3)）として**書かれ、「in place of Saturday, 1st January」の文言はない。
- **12 月の割り当て（25 日が日曜日）**: Scotland は 26 日が Schedule 1、27 日を布告で追加。England・Wales・NI は 26・27 日とも Schedule 1。

## 1995

### 布告

**London issue 53715 頁 9221（1994-06-27）／ Edinburgh issue 23603 頁 1549（1994-06-28）／ Belfast issue 5533 頁 631（1994-07-01）**

題名（London）: Appointing Monday, 2nd January 1995, and Monday, 8th May 1995 as Bank Holidays in England, Wales and Northern Ireland and appointing Tuesday, 27th December 1994, Monday, 8th May 1995, and Monday, 29th May 1995, as Bank Holidays in Scotland.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Monday, the second day of January and Monday, the eighth day of May in the year 1995 to be bank holidays in England, Wales and Northern Ireland and Tuesday, the twenty-seventh day of December in the year 1994 and Monday, the eighth day of May and Monday, the twenty-ninth day of May in the year 1995 to be bank holidays in Scotland. Given at Our Court at Buckingham Palace this twenty-second day of June in the year of our Lord one thousand nine hundred and ninety-four and in the forty-third year of Our Reign.

（London 版。改頁をまたぐ部分は頁 9221 の続きで読んだ。）

- England・Wales・NI（追加）: 1995-01-02（月）、1995-05-08（月）
- Scotland（追加）: 1995-05-08（月）、1995-05-29（月）（1994-12-27 は 1994 年分）。Scotland の 5 月 1 日（月）は Schedule 1 のままで、布告は触れていない。

**Edinburgh issue 23811 頁 1715 ／ Belfast issue 5638 頁 613（1995-07-04／07）**（1996 年の節に転記）

- Scotland（追加）: 1995-12-26（火）

**NI の Order: Belfast issue 5594 頁 97（1995-02-03）**

> PROCLAMATION BY THE SECRETARY OF STATE I2TH [sic] JULY 1995 - BANK HOLIDAY The Right Honourable Sir Patrick Mayhew QC, MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Wednesday, 12th July, 1995, a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 1995-07-12（水）

### Hansard

1994-07-12 書面答弁（https://api.parliament.uk/historic-hansard/written_answers/1994/jul/12/may-day-bank-holiday 、vol 246 c538W）:

> On 16 December 1993 I announced that, for 1995 only, the early May bank holiday in England, Wales and Northern Ireland will be moved from the first Monday in May to the second Monday, 8 May, to link with events on and near VE day commemorating the 50th anniversary of the ending of the second world war. In Scotland, the anniversary will be marked by an additional day's bank holiday on the second Monday in May for 1995 only. In 1996, the early May bank holiday will revert to the first Monday in May. The bank and public holidays fixed for 1995 are set out in the following table:

この後の表は、Historic Hansard のページに入っていない（"following table:" の直後でページが終わる）。

1995-03-02 書面答弁（https://api.parliament.uk/historic-hansard/written_answers/1995/mar/02/public-holidays 、vol 255 c709W）:

> For 1995 only, the early May bank holiday in England, Wales and Northern Ireland has been moved from the first to the second Monday in May—from 1 to 8 May 1995—to link with commemorative events for the 50th anniversary of VE day. In Scotland, 8 May will be a bank holiday in addition to 1 May 1995; unlike other parts of the United Kingdom, the first Monday in May in Scotland, which is specified as a hank [sic] holiday in schedule 1 to the Banking and Financial Dealings Act 1971 , has a long tradition going back to 1871.

### 両者の食い違い

なし。Hansard は England・Wales・NI について "moved from the first to the second Monday in May—from 1 to 8 May 1995" と書くが、布告は 5 月 8 日を追加（section 1(3)）として指定するだけで、5 月 1 日には触れない。England・Wales・NI の Early May は Schedule 1 になく毎年布告で指定されるので、1995 年は 5 月 1 日を指定せず 8 日を指定したことが「移動」に当たり、両者は日付として一致する。

### 補記

- **VE Day 50 周年（1995-05-08）**: 全地域の bank holiday。England・Wales・NI は Early May を 8 日に指定（1 日は指定しない）。Scotland は 5 月 1 日（Schedule 1）に加えて 8 日を追加。布告の文言に「in place of」「instead of」はなく、"VE" の語もない。

## 1996

### 布告

**Edinburgh issue 23811 頁 1715 ／ Belfast issue 5638 頁 613（1995-07-04／07）**

題名（Belfast）: APPOINTING MONDAY, 1ST JANUARY 1996, AND MONDAY, 6TH MAY 1996 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND AND APPOINTING TUESDAY, 26TH DECEMBER 1995, AND MONDAY, 27TH MAY 1996, AS BANK, HOLIDAYS IN SCOTLAND.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Monday, the first day of January and Monday, the sixth day of May in the year 1996 to be bank holidays in England, Wales and Northern Ireland and Tuesday, the twenty-sixth day of December in the year 1995 and Monday, the twenty-seventh day of May in the year 1996 to be bank holidays in Scotland. Given at Our Court at Buckingham Palace this twenty-eighth day of June in the year of our Lord one thousand nine hundred and ninety-five and in the forty-fourth year of Our Reign.

- England・Wales・NI（追加）: 1996-01-01（月）、1996-05-06（月）
- Scotland（追加）: 1996-05-27（月）（1995-12-26 は 1995 年分）

**Edinburgh issue 24019 頁 1669 ／ Belfast issue 5742 頁 667（1996-07-09／12）**（1997 年の節に転記）

- Scotland（追加）: 1996-12-26（木）

**NI の Order: Belfast issue 5702 頁 183（1996-02-23）**

> PROCLAMATION BY THE SECRETARY OF STATE 12th JULY 1996 - BANK HOLIDAY The Rt. Honourable Sir Patrick Mayhew, QC, MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and Financial Dealings Act 1971, has signed an Order appointing Friday, 12th July, 1996, a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 1996-07-12（金）
- 3 月 17 日は日曜日で、Schedule 1 により 3 月 18 日。

### Hansard

1996-12-10 書面答弁（https://api.parliament.uk/historic-hansard/written_answers/1996/dec/10/public-holidays 、vol 287 c87W）は祝日の数だけ（England 8、Scotland 8、N.Ireland 10。1995 年の Scotland は注で "There was an additional bank holiday on the 8 May 1995 … This was in addition to the existing 1 May 1995 bank holiday"）。日付の一覧はない。

### 補記

## 1997

### 布告

**Edinburgh issue 24019 頁 1669 ／ Belfast issue 5742 頁 667（1996-07-09／12）**

題名（Edinburgh）: Appointing Wednesday 1st January 1997 and Monday 5th May 1997, as Bank Holidays in England, Wales and Northern Ireland and Appointing Thursday 26th December 1996, and Monday 26th May 1997, as Bank Holidays in Scotland.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Wednesday, the first day of January and Monday, the fifth day of May in the year 1997 to be bank holidays in England, Wales and Northern Ireland and Thursday, the twenty-sixth day of December in the year 1996 and Monday, the twenty-sixth day of May in the year 1997 to be bank holidays in Scotland. Given at Our Court at Buckingham Palace this twenty-sixth day of June in the year of our Lord one thousand nine hundred and ninety-six and in the forty-fifth year of Our Reign.

- England・Wales・NI（追加）: 1997-01-01（水）、1997-05-05（月）
- Scotland（追加）: 1997-05-26（月）（1996-12-26 は 1996 年分）

**Edinburgh issue 24230 頁 1785 ／ Belfast issue 5845 頁 669（1997-07-18）**（1998 年の節に転記）

- Scotland（追加）: 1997-12-26（金）

**NI の Order: Belfast issue 5804 頁 183（1997-02-28）**

> PROCLAMATION BY THE SECRETARY OF STATE 14 JULY 1997 - BANK HOLIDAY ' The Riflht [sic] Honourable Sir Patrick Mayhew, QC, MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on him by the Banking and.Financial Dealings Act 1971, has signed an Order appointing Monday 14th July 1997 a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 1997-07-14（月）（7 月 12 日は土曜日）

### Hansard

Hansard に見つからない。

### 補記

## 1998

### 布告

**Edinburgh issue 24230 頁 1785–1786 ／ Belfast issue 5845 頁 669（1997-07-18）**

Counsellors of State（Prince of Wales と Duke of York）が署名した布告。

題名（Edinburgh）: APPOINTING THURSDAY, 1st JANUARY 1998, AND MONDAY, 4th MAY 1998, AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND AND APPOINTING FRIDAY, 26th DECEMBER 1997, AND MONDAY, 25th MAY 1998, AS BANK HOLIDAYS IN SCOTLAND

> We, therefore, His Royal Highness The Prince Charles, Prince of Wales, and His Royal Highness The Prince Andrew, Duke of York, being authorised thereto by the said Letters Patent and in pursuance of the powers conferred on Her Majesty by section 1(3) of the Banking ard [sic] Financial Dealings Act 1971, do, by and with the advice of Her Majesty's Privy Council, on Her Majesty's behalf hereby appoint Thursday, the first day of January and Monday, the fourth day of May in the year 1998 to be bank holidays in England, Wales and Northern Ireland and Friday, the twenty-sixth day of December in the year 1997 and Monday, the twenty-fifth day of May in the year 1998 to be bank holidays in Scotland. Given at the Court of Saint James's this twenty-sixth day of June in the year of Our Lord one thousand nine hundred and ninety-seven and in the forty-sixth year of Her Majesty's Reign.

- England・Wales・NI（追加）: 1998-01-01（木）、1998-05-04（月）
- Scotland（追加）: 1998-05-25（月）（1997-12-26 は 1997 年分）

**同じ年の 2 回の布告（追加 → 振替）**

1 回目: **L-55182-5SI（London、1998-06-30、issue 55182）**。同文が Edinburgh issue 24425 頁 1783（1998-06-30）と Belfast issue 5945 頁 635（1998-07-03）にもある。

題名: Appointing Monday, 28th December 1998, Friday, 1st January 1999, and Monday, 3rd May 1999, as Bank Holidays in England, Wales and Northern Ireland and appointing Monday, 28th December 1998, Monday, 4th January 1999, and Monday, 31st May 1999, as Bank Holidays in Scotland.

> Now, therefore, We, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971 do hereby appoint Monday, the twenty-eighth day of December in the year 1998, and Friday, the first day of January and Monday, the third day of May in the year 1999 to be bank holidays in England, Wales, and Northern Ireland and Monday, the twenty-eighth day of December in the year 1998, and Monday, the fourth day of January and Monday, the thirty-first day of May in the year 1999 to be bank holidays in Scotland. Given at Our Court at Buckingham Palace this twenty-fourth day of June in the year of our Lord one thousand nine hundred and ninety-eight and in the forty-seventh year of Our Reign.

- England・Wales・NI（追加）: 1998-12-28（月）
- Scotland（追加）: 1998-12-28（月）

2 回目: **L-55364-1SI（London、1999-01-04、issue 55364）**。同文が Belfast issue 5995 頁 1227–1228（1998-12-31）と Edinburgh issue 24531 頁 19–20（1999-01-08）にもある（前回の調査の再掲）。

題名: APPOINTING MONDAY, 28TH DECEMBER 1998 AS A BANK HOLIDAY IN ENGLAND, WALES AND NORTHERN IRELAND IN THE PLACE OF SATURDAY, 26TH DECEMBER 1998 AND APPOINTING MONDAY, 4TH JANUARY 1999 AS A BANK HOLIDAY IN SCOTLAND IN PLACE OF SATURDAY, 2ND JANUARY 1999.

> Now, therefore, We, in pursuance of section 1(2) of the Banking and Financial Dealings Act 1971, declare that Saturday, the twenty-sixth day of December in the year 1998, shall not be a bank holiday in England, Wales and Northern Ireland and do hereby appoint in place of it Monday, the twenty-eighth day of December in the year 1998, and declare that Saturday, the second day of January in the year 1999, shall not be a bank holiday in Scotland and do hereby appoint in place of it Monday, the fourth day of January in the year 1999.

（Given at Our Court at Buckingham Palace this sixteenth day of December … 1998。）

- England・Wales・NI（振替）: 1998-12-28（月）を 1998-12-26（土）の代わりに（6 月の追加を出し直した）

**NI の Order: Belfast issue 5902 頁 115（1998-02-06）**

> PROCLAMATION BY THE SECRETARY OF STATE 13th JULY 1998 - BANK HOLIDAY The Rt. Hon. Dr. Marjorie Mowlam MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on her by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday, 13th July, 1998, a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 1998-07-13（月）（7 月 12 日は日曜日）

### Hansard

Hansard に見つからない。

### 補記

- **同じ日の出し直し（追加 → 振替）**: 1998-12-28（England・Wales・NI）と 1999-01-04（Scotland）。6 月の布告（L-55182-5SI）が section 1(3) の追加として指定し、12 月の布告（L-55364-1SI）が section 1(2) の振替として出し直した。1978〜1999 年で、同じ日を出し直した例はこれだけ。

## 1999

### 布告

**L-55182-5SI ほか（1998-06-30。1998 年の節に転記）**

- England・Wales・NI（追加）: 1999-01-01（金）、1999-05-03（月）
- Scotland（追加）: 1999-01-04（月）（12 月に振替として出し直し）、1999-05-31（月）

**L-55364-1SI ほか（1999-01-04。1998 年の節に転記）**

- Scotland（振替）: 1999-01-04（月）を 1999-01-02（土）の代わりに

**L-55541-3（London、1999-07-02、issue 55541）**（docs/sources/uk-bank-holidays-2000-2011.md の 2000 年の節にも転記）。同文が Edinburgh issue 24633 頁 1433–1434（1999-07-06）と Belfast issue 6048 頁 617–618（1999-07-02）にもある。

題名: APPOINTING TUESDAY, 28TH DECEMBER 1999, FRIDAY, 31ST DECEMBER 1999, MONDAY, 3RD JANUARY 2000 AND MONDAY, 1ST MAY 2000 AS BANK HOLIDAYS IN ENGLAND, WALES AND NORTHERN IRELAND AND APPOINTING MONDAY, 27TH DECEMBER 1999 AS A BANK HOLIDAY IN SCOTLAND AND APPOINTING TUESDAY, 28TH DECEMBER 1999 AS A BANK HOLIDAY IN SCOTLAND IN PLACE OF SATURDAY, 25TH DECEMBER 1999, AND APPOINTING FRIDAY, 31ST DECEMBER 1999 AS A BANK HOLIDAY IN SCOTLAND AND APPOINTING TUESDAY, 4TH JANUARY 2000 AS A BANK HOLIDAY IN SCOTLAND IN PLACE OF SATURDAY, 1ST JANUARY 2000 AND APPOINTING MONDAY, 29TH MAY 2000 AS A BANK HOLIDAY IN SCOTLAND

> Now, therefore, We, in pursuance of section 1(2) and (3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-eighth day of December, Friday, the thirty-first day of December in the year 1999, Monday, the third day of January and Monday, the first day of May in the year 2000 to be bank holidays in England, Wales and Northern Ireland and Monday, the twenty-seventh day of December in the year 1999 to be a bank holiday in Scotland and declare that Saturday, the twenty-fifth day of December in the year 1999 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the twenty-eighth day of December in the year 1999 and do hereby appoint Friday, the thirty-first day of December in the year 1999 to be a bank holiday in Scotland and declare that Saturday, the first day of January in the year 2000 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the fourth day of January in the year 2000 and do hereby appoint Monday, the twenty-ninth day of May in the year 2000 to be a bank holiday in Scotland.

この布告が指定する 1999 年の日:

- England・Wales・NI（追加）: 1999-12-28（火）、1999-12-31（金）。12 月 27 日（月）は Schedule 1（26 日が日曜日）。
- Scotland:
  - 追加: 1999-12-27（月）、1999-12-31（金）
  - 振替: 1999-12-28（火）を 1999-12-25（土）の代わりに

**NI の Order: Belfast issue 6004 頁 63（1999-01-29）**

> Proclamation by The Secretary of State 12th JULY 1999 - BANK HOLIDAY The Rt. Hon. Dr. Marjorie Mowlam MP, Secretary of State for Northern Ireland, in pursuance of the powers conferred on her by the Banking and Financial Dealings Act 1971, has signed an Order appointing Monday, 12th July, 1999, a Bank and Public Holiday in Northern Ireland.

- NI だけ（追加）: 1999-07-12（月）

### Hansard

1998-12-16 書面答弁（https://api.parliament.uk/historic-hansard/written_answers/1998/dec/16/millennium-holiday 、vol 322 c575W）:

> The Government Departments referred to, and the CBI, were among the many organisations included in a consultation exercise carried out by my Department early this year, in order to establish that the proposal for an additional Bank Holiday on 31 December 199 [sic] was widely supported. The additional holiday was announced in the House on 3 June 1998, Official Report, column 218, and a press notice was issued on the same day.

翌年の日付の一覧の答弁は見つからない。

### 両者の食い違い

なし（12 月 31 日は布告と一致）。

### 補記

- **ミレニアム（1999-12-31）**: 全地域（England・Wales・NI と Scotland）への追加。
- **Scotland の 1 月 2 日が土曜日（1999）**: 振替の布告が見つかった（L-55364-1SI。6 月の追加を 12 月に振替として出し直し）。
- **Scotland の 12 月 25 日が土曜日（1999）**: 振替の布告が見つかった（L-55541-3、"declare that Saturday, the twenty-fifth day of December in the year 1999 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the twenty-eighth day of December in the year 1999"）。
- **12 月の割り当て（25 日が土曜日）**: Scotland は 28 日を Christmas Day の代わり、27 日を追加（Boxing Day 分）。England・Wales・NI は 28 日を追加とするだけ。

---

## 1971〜1977 年

1974〜1977 年は対応年に含める（`SUPPORTED_YEARS.from` = 1974）。1971〜1973 年は含めない（1971 年は 1871 年法の下にあり、1972・1973 年は England・Wales・NI と Scotland 向けの Royal Proclamation が見つからない）。この節は、見つかった布告と、規則が 1978 年以降と違う点を記録する。

### 布告の所在（The Gazette）

| 年（祝日の年） | 見つかったもの                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 判定                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1971           | London Supplement 45407 頁 6757（1971-06-24）: "A PROCLAMATION ALTERING THE DAY APPOINTED FOR THE AUGUST BANK HOLIDAY IN ENGLAND AND WALES IN THE YEAR 1971"（8 月第 1 月曜を 8 月 30 日に。根拠は Bank Holidays Act 1871 第 5 条）。Belfast issue 2702 頁 241（1971-04-30）: Governor の布告で 1971-07-12 を NI の bank holiday に（Bank Holidays Act 1871 等が根拠）。Belfast issue 2722 頁 393（1971-07-23）: NI の 8 月第 1 月曜を 8 月 30 日に                                                   | 見つかった・読める。1971 年はまだ 1871 年法による（1971 年法の施行前）                                         |
| 1972           | Belfast issue 2776 頁 129（1972-04-07）: Governor の布告で 1972-07-12 を NI の bank holiday に（"in pursuance of the Banking and Financial Dealings Act 1971" を根拠に挙げる最初の例）                                                                                                                                                                                                                                                                                                                | 見つかった・読める。England・Wales・NI と Scotland 向けの Royal Proclamation は見つからない                    |
| 1973           | Belfast issue 2895 頁 393（1973-06-22）: Secretary of State の Order で 1973-07-12                                                                                                                                                                                                                                                                                                                                                                                                                    | 見つかった・読める。Royal Proclamation は見つからない（Scotland の 1973 年の Boxing Day の布告も見つからない） |
| 1974           | Belfast issue 2941 頁 751（1973-10-26）／London issue 46113 頁 12735（1973-10-26）: "Appointing New Year's Day 1974 a Bank Holiday in England and Wales and Northern Ireland"。Belfast issue 3011 頁 267（1974-05-10）: 1974-07-12。Belfast issue 3070 頁 647 ／Edinburgh issue 19546 頁 1321 ／London issue 46377 頁 9343（1974-10-18）: "APPOINTING THURSDAY, 26TM [sic] DECEMBER 1974 A BANK HOLIDAY IN SCOTLAND AND NEW YEAR'S DAY 1975 A BANK HOLIDAY IN ENGLAND AND WALES AND NORTHERN IRELAND" | 見つかった・読める                                                                                             |
| 1975           | 1974-10-18 の布告（New Year's Day 1975）。Edinburgh issue 19740 頁 1217 ／London issue 46690 頁 11810（1975-09-19）: Scotland の 1975-12-26 と New Year's Day 1976。NI の 1975 年 7 月 12 日の Order は見つからない                                                                                                                                                                                                                                                                                   | 見つかった・読める（NI の Order を除く）                                                                       |
| 1976           | 1975-09-19 の布告。Belfast issue 3256 頁 203（1976-03-12）: 1976-07-12。Edinburgh issue 19947 頁 1253 ／Belfast issue 3326 頁 709 ／London issue 47017 頁 12669（1976-09-17）: England・Wales・NI の 1976-12-28 と 1977-01-03、Scotland の 1976-12-27・28 と 1977-01-04                                                                                                                                                                                                                               | 見つかった・読める                                                                                             |
| 1977           | 1976-09-17 の布告。Silver Jubilee: Edinburgh issue 20015 頁 75 ／Belfast issue 3370 頁 35（1977-01-21）。Belfast issue 3383 頁 153（1977-02-25）: 1977-07-12。Belfast 3441 頁 571 ／Edinburgh 20127 頁 891（1977-08-05）: Scotland の 1977-12-27                                                                                                                                                                                                                                                      | 見つかった・読める                                                                                             |

OCR の品質は 1978 年以降と同程度である（題名の序数が "26TM" "26ra" のように崩れるが、本文の日付は語で書かれているので読める）。

1974 年の New Year's Day の布告の operative part（Belfast issue 2941 頁 751）:

> We, therefore, in pursuance of section 1 (3) of the Banking and Financial Dealings Act 1971, do hereby appoint New Year's Day in the year 1974 to be, in England and Wales and Northern Ireland, a bank holiday under the said Act. Given at Our Court at Buckingham Palace this twentyfourth day of October, in the year of our Lord one thousand nine hundred and seventy-three, and in the twenty-second year of Our Redgn [sic].

1977 年の Silver Jubilee の布告の operative part（Edinburgh issue 20015 頁 75）:

> We, therefore, in pursuance of Section 1(2) and 1(3) of the Banking and Financial Dealings Act 1971, declare that Monday, the thirtieth day of May 1977 shall not be a bank holiday in England, Wales and Northern Ireland and do hereby appoint in its stead Monday, the sixth day of June 1977 and do hereby appoint Tuesday, the seventh day of June 1977 also to be a bank holiday in England and Wales and Northern Ireland and Monday, the sixth day of June 1977 to be a bank holiday in Scotland.

- **Silver Jubilee（1977-06-07）**: England・Wales・NI だけの追加。Spring（5 月 30 日）を 6 月 6 日に移動（"in its stead"）。Scotland は 6 月 6 日（月）を追加し、6 月 7 日は指定していない（一部の地域）。

1976 年の布告の operative part（Belfast issue 3326 頁 709）:

> We, therefore, in pursuance of section 1(3) of the Banking and Financial Dealings Act 1971, do hereby appoint Tuesday, the twenty-eighth day of December in the year 1976 and Monday the third day of January in the year 1977 to be bank holidays in England and Wales and Northern Ireland and Monday, the twenty-seventh day of December and Tuesday, the twenty-eighth day of December in the year 1976 and Tuesday, the fourth day of January in the year 1977 to be bank holidays in Scotland.

### Hansard

- **1971-08-04 書面答弁**（https://api.parliament.uk/historic-hansard/written_answers/1971/aug/04/bank-holidays 、vol 822 c316W）: "The dates for 1972, 1973 and 1974 are: 1972 England and Wales May 29th August 28th Scotland May 1st August 7th 1973 England and Wales May 28th August 27th Scotland May 7th August 6th 1974 England and Wales May 27th August 26th Scotland May 6th August 5th"。1972〜1974 年の Spring と August の日付を地域別に答弁している。
- **1971-11-09 書面答弁**（https://api.parliament.uk/historic-hansard/written_answers/1971/nov/09/bank-holidays ）: "The hon. Member will be aware that the Bank Holidays Act, 1871 , already provides for a bank holiday in Scotland on 1st January."（1972 年 5 月 1 日・1973 年 1 月 1 日を bank holiday にする提案に "No"）
- **1973-01-23・1973-03-08 書面答弁**: TUC から 1 月 1 日と 5 月 1 日を休日にする要望があり、検討中（"no decision has yet been reached"）。
- **1973-10-25 書面答弁**（May Day）: "No action is under consideration at present."
- New Year's Day 1974 を決めた答弁（1973-06-20 の答弁が参照する "the answer given to the hon. Member for Liverpool, Exchange (Mr. Parry) on 7th May.—[Vol. 856, c. 40–41.]"）は、節名に "holiday" を含まず、第 1 節の巡回では拾えていない。
- **H1（1976-12-08）**: "Since January 1974 a New Year's Day Bank holiday has been proclaimed each year under the 1971 Act in England, Wales and Northern Ireland and similarly a Boxing Day Bank holiday was introduced in Scotland in 1973."
- **1976-07-12 書面答弁**（https://api.parliament.uk/historic-hansard/written_answers/1976/jul/12/public-holidays 、vol 915 c113W）: 1977 年の祝日の一覧（"17th March (Northern Ireland only). 8th April. 11th April (England, Wales and Northern Ireland only). 2nd May (Scotland only). 6th June (England, Wales and Northern Ireland only). 7th June (England, Wales and Northern Ireland only). 1st August (Scotland only). 29th August (England, Wales and Northern Ireland only). 26th December."）。

### 規則が今と違う点（布告・Hansard の文言から分かる範囲）

| 項目                                                      | 分かったこと                                                                                                                                                                                                                                                                                      | 出典                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| England・Wales・NI の New Year's Day が布告された最初の年 | 1974 年（"Appointing New Year's Day 1974 a Bank Holiday in England and Wales and Northern Ireland"、1973-10-24 に作られた）                                                                                                                                                                       | Belfast issue 2941 頁 751 ／London issue 46113 頁 12735。H1 も "Since January 1974" |
| Scotland の Boxing Day が布告された最初の年               | **布告で見つかった最初は 1974 年**（1974-10-16 に作られた "APPOINTING THURSDAY, 26TH DECEMBER 1974 A BANK HOLIDAY IN SCOTLAND"）。H1 は "a Boxing Day Bank holiday was introduced in Scotland in 1973" と書いており、**1973 年の布告は見つからない**（食い違い。1973 年の布告がある可能性は残る） | Edinburgh issue 19546 頁 1321 ほか、H1                                              |
| Scotland の 1 月 2 日                                     | 1971 年法 1 条 6 項 "shall have effect for the year 1973 and subsequent years"。1971-11-09 の答弁は、それ以前は 1871 年法で 1 月 1 日だけが Scotland の bank holiday だったことを示す                                                                                                             | legislation.gov.uk（1991-02-01 版）、Hansard 1971-11-09                             |
| Early May 以前の 5 月の祝日                               | England・Wales・NI は 5 月最終月曜（Spring）だけ。Scotland は 5 月第 1 月曜（Schedule 1）。England・Wales・NI の 5 月第 1 月曜は 1978 年から布告（May Day）。Scotland の 5 月最終月曜も 1978 年から布告                                                                                           | Hansard 1971-08-04、H1〜H4、1977-08-05 の布告                                       |
| NI の 7 月 12 日                                          | 1971・1972 年は Governor の布告（1871 年法・1875 年法、1972 年は 1971 年法が根拠）、1973 年からは Secretary of State の Order                                                                                                                                                                     | Belfast 2702 頁 241、2776 頁 129、2895 頁 393                                       |
| 1971 年の 8 月の bank holiday                             | England・Wales と NI とも、8 月第 1 月曜を 8 月 30 日に移した（1871 年法による最後の年）                                                                                                                                                                                                          | London Supplement 45407 頁 6757、Belfast 2722 頁 393                                |

Scotland の 1973 年の Boxing Day について、1972〜1973 年の London と Edinburgh を "pleased" "Proclamation"、Proclamation、appoint December Scotland、"bank holiday" Scotland、"twenty-sixth day of December"、"Banking and Financial Dealings"、"Privy Council" Proclamation、"Boxing Day" で検索した。見つかる布告は非常事態（Emergency Powers Act 1920）、硬貨、Counsellors of State の Letters Patent と、1973-10-26 の New Year's Day 1974 の布告（London 46113 頁 12735。Scotland の指定はない）だけで、1973-12-26 を Scotland の bank holiday に指定する布告・告示はない。Hansard の 1972〜1974 年の答弁（public-holidays 1972-11-07・1973-01-23・1973-06-20・1973-11-27・1974-04-30・1974-05-24・1974-07-31、local-public-holidays 1973-12-06）にも Scotland の Boxing Day への言及はない。H1（1976-12-08）の "a Boxing Day Bank holiday was introduced in Scotland in 1973" と、布告で見つかった最初の年（1974 年分、Edinburgh 19546 頁 1321）との食い違いは未解決である。

要約: 1974〜1977 年は布告が揃い、OCR も読める。1972・1973 年は England・Wales・NI と Scotland 向けの Royal Proclamation が見つからない（New Year's Day と Scotland の Boxing Day がまだ布告されていなかった時期と重なる。ただし Scotland の 1973 年の Boxing Day については Hansard と布告が食い違う）。1971 年は 1871 年法の下にあり、1971 年法の Schedule 1 とは前提が違う。

---

## 付録 A: 布告・Order の一覧（1978〜1999 年の祝日に関係するもの）

| 号・頁（または notice ID）                                                         | 発行日                               | Edition                      | 対象                                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Belfast 3441 頁 571 ／ Edinburgh 20127 頁 891 ／ London 47292 頁 10153             | 1977-08-05                           | Belfast / Edinburgh / London | E・W・NI 1978-01-02・05-01、Scotland 1977-12-27・1978-05-29                                                         |
| Belfast 3521 頁 173                                                                | 1978-03-10                           | Belfast                      | NI 1978-07-12                                                                                                       |
| Belfast 3575 頁 585 ／ Edinburgh 20332 頁 785                                      | 1978-08-04                           | Belfast / Edinburgh          | E・W・NI 1979-01-01・05-07、Scotland 1978-12-26・1979-05-28                                                         |
| Belfast 3638 頁 54                                                                 | 1979-01-26                           | Belfast                      | NI 1979-03-19                                                                                                       |
| Belfast 3648 頁 145                                                                | 1979-02-23                           | Belfast                      | NI 1979-07-12                                                                                                       |
| Edinburgh 20585 頁 1187 ／ Belfast 3738 頁 853                                     | 1979-10-26                           | Edinburgh / Belfast          | E・W・NI 1980-01-01・05-05、Scotland 1979-12-26・1980-05-26                                                         |
| Belfast 3830 頁 547                                                                | 1980-07-04                           | Belfast                      | NI 1980-07-14                                                                                                       |
| Edinburgh 20815 頁 1579 ／ Belfast 3886 頁 1053                                    | 1980-12-05                           | Edinburgh / Belfast          | E・W・NI 1981-01-01・05-04、Scotland 1980-12-26・1981-05-25                                                         |
| Belfast 3915 頁 171                                                                | 1981-02-20                           | Belfast                      | NI 1981-07-13                                                                                                       |
| Edinburgh 20889 頁 493 ／ Belfast 3938 頁 407                                      | 1981-04-14 / 04-24                   | Edinburgh / Belfast          | 全地域 1981-07-29                                                                                                   |
| Edinburgh 20923 頁 778–779 ／ Belfast 3956 頁 547–548                              | 1981-06-12                           | Edinburgh / Belfast          | E・W・NI 1981-12-28（振替）・1982-01-01・05-03、Scotland 1981-12-28・1982-01-04（振替）・05-31                      |
| Belfast 4071 頁 309                                                                | 1982-03-26                           | Belfast                      | NI 1982-07-12                                                                                                       |
| Edinburgh 21139 頁 933 ／ Belfast 4108 頁 585 ／ London Supp 49033 頁 8403（告示） | 1982-06-25                           | 3 版                         | E・W・NI 1982-12-28・1983-01-03・05-02、Scotland 1982-12-27・12-28（振替）・1983-01-04（振替）・05-30               |
| Belfast 4228 頁 267                                                                | 1983-03-25                           | Belfast                      | NI 1983-07-12                                                                                                       |
| Edinburgh 21345 頁 978 ／ Belfast 4269 頁 565（告示）                              | 1983-06-24                           | Edinburgh / Belfast          | Scotland 1983-12-27・1984-05-28、E・W・NI 1984-01-02・05-07                                                         |
| Belfast 4367 頁 67                                                                 | 1984-02-03                           | Belfast                      | NI 1984-03-19（振替）・07-12                                                                                        |
| Edinburgh 21555 頁 939 ／ London 49792 頁 8947 ／ Belfast 4432 頁 455（告示）      | 1984-06-29                           | 3 版                         | E・W・NI 1985-01-01・05-06、Scotland 1984-12-26・1985-05-27                                                         |
| Belfast 4518 頁 37                                                                 | 1985-01-18                           | Belfast                      | NI 1985-07-12                                                                                                       |
| Edinburgh 21780 頁 1143 ／ London 50218 頁 10661 ／ Belfast 4601 頁 723            | 1985-08-02                           | 3 版                         | E・W・NI 1986-01-01・05-05、Scotland 1985-12-26・1986-05-26                                                         |
| （1987 年分の布告）                                                                | —                                    | —                            | 見つからない                                                                                                        |
| Edinburgh 22161 頁 879 ／ London 50964 頁 7607（告示）                             | 1987-06-12 / 06-15                   | Edinburgh / London           | E・W・NI 1987-12-28・1988-01-01・05-02、Scotland 1987-12-28・1988-01-04・05-30                                      |
| Edinburgh 22415 頁 1333                                                            | 1988-09-06                           | Edinburgh                    | Scotland 1988-12-27・1989-05-29、E・W・NI 1989-01-02・05-01                                                         |
| Edinburgh 22613 頁 1411 ／ London 51855 頁 9961                                    | 1989-08-25 / 08-29                   | Edinburgh / London           | Scotland 1989-12-26・1990-05-28、E・W・NI 1990-01-01・05-07                                                         |
| Edinburgh 22787 頁 1255 ／ London 52202 頁 11411                                   | 1990-07-03 / 07-04                   | Edinburgh / London           | Scotland 1990-12-26・1991-05-27、E・W・NI 1991-01-01・05-06                                                         |
| Belfast 5180 頁 110                                                                | 1991-02-01                           | Belfast                      | NI 1991-07-12                                                                                                       |
| Edinburgh 22989 頁 1767 ／ Belfast 5222 頁 647                                     | 1991-06-28                           | Edinburgh / Belfast          | Scotland 1991-12-26・1992-05-25、E・W・NI 1992-01-01・05-04                                                         |
| Belfast 5291 頁 205                                                                | 1992-03-06                           | Belfast                      | NI 1992-07-13                                                                                                       |
| Belfast 5317 頁 529 ／ London Supp 52944 頁 9671 ／ Edinburgh 23183 頁 1827        | 1992-06-05 / 06-08 / 06-09           | 3 版                         | E・W・NI 1992-12-28（振替）・1993-01-01・05-03、Scotland 1992-12-28・1993-01-04（振替）・05-31                      |
| Belfast 5388 頁 103                                                                | 1993-02-05                           | Belfast                      | NI 1993-07-12                                                                                                       |
| Edinburgh 23399 頁 2381 ／ Belfast 5431 頁 631                                     | 1993-06-29 / 07-02                   | Edinburgh / Belfast          | E・W・NI 1993-12-28・1994-01-03・05-02、Scotland 1993-12-27・12-28・1994-01-04・05-30（すべて追加）                 |
| Belfast 5494 頁 149                                                                | 1994-02-18                           | Belfast                      | NI 1994-07-12                                                                                                       |
| London 53715 頁 9221 ／ Edinburgh 23603 頁 1549 ／ Belfast 5533 頁 631             | 1994-06-27 / 06-28 / 07-01           | 3 版                         | E・W・NI 1995-01-02・05-08、Scotland 1994-12-27・1995-05-08・05-29                                                  |
| Belfast 5594 頁 97                                                                 | 1995-02-03                           | Belfast                      | NI 1995-07-12                                                                                                       |
| Edinburgh 23811 頁 1715 ／ Belfast 5638 頁 613                                     | 1995-07-04 / 07-07                   | Edinburgh / Belfast          | E・W・NI 1996-01-01・05-06、Scotland 1995-12-26・1996-05-27                                                         |
| Belfast 5702 頁 183                                                                | 1996-02-23                           | Belfast                      | NI 1996-07-12                                                                                                       |
| Edinburgh 24019 頁 1669 ／ Belfast 5742 頁 667                                     | 1996-07-09 / 07-12                   | Edinburgh / Belfast          | E・W・NI 1997-01-01・05-05、Scotland 1996-12-26・1997-05-26                                                         |
| Belfast 5804 頁 183                                                                | 1997-02-28                           | Belfast                      | NI 1997-07-14                                                                                                       |
| Edinburgh 24230 頁 1785–1786 ／ Belfast 5845 頁 669                                | 1997-07-18                           | Edinburgh / Belfast          | E・W・NI 1998-01-01・05-04、Scotland 1997-12-26・1998-05-25                                                         |
| Belfast 5902 頁 115                                                                | 1998-02-06                           | Belfast                      | NI 1998-07-13                                                                                                       |
| L-55182-5SI ／ Edinburgh 24425 頁 1783 ／ Belfast 5945 頁 635                      | 1998-06-30 / 07-03                   | 3 版                         | E・W・NI 1998-12-28・1999-01-01・05-03、Scotland 1998-12-28・1999-01-04・05-31（すべて追加）                        |
| L-55364-1SI ／ Belfast 5995 頁 1227–1228 ／ Edinburgh 24531 頁 19–20               | 1999-01-04 / 1998-12-31 / 1999-01-08 | 3 版                         | E・W・NI 1998-12-28（振替に出し直し）、Scotland 1999-01-04（振替に出し直し）                                        |
| Belfast 6004 頁 63                                                                 | 1999-01-29                           | Belfast                      | NI 1999-07-12                                                                                                       |
| L-55541-3 ／ Edinburgh 24633 頁 1433–1434 ／ Belfast 6048 頁 617–618               | 1999-07-02 / 07-06                   | 3 版                         | E・W・NI 1999-12-28・12-31・2000-01-03・05-01、Scotland 1999-12-27・12-28（振替）・12-31・2000-01-04（振替）・05-29 |

## 付録 B: Scotland の土曜日の年

| 年   | 土曜日に当たった日 | 振替を指定する布告                                                                                           | 文言                                                                                                                                                                                                                | 一覧・Hansard                                                                             |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1982 | 1 月 2 日（土）    | 見つかった（Edinburgh 20923 頁 779 ／Belfast 3956 頁 548）                                                   | "declare that Saturday, the second day of January in the year 1982 shall not be a bank holiday in Scotland and do hereby appoint in place of it Monday, the fourth day of January in the year 1982"                 | Hansard H5: "Saturday 2 January / Monday 4 January*"                                      |
| 1982 | 12 月 25 日（土）  | 見つかった（本文なし。告示 Edinburgh 21139 頁 933）                                                          | "to appoint Tuesday, 28th December 1982 as a bank holiday in Scotland in place of Saturday, 25th December 1982"                                                                                                     | Hansard H5: "Saturday 25 December / Monday 27 December* / Tuesday 28 December*"           |
| 1983 | 1 月 1 日（土）    | 見つかった（本文なし。告示 Edinburgh 21139 頁 933）                                                          | "to appoint Tuesday, 4th January 1983 as a bank holiday in Scotland in place of Saturday, 1st January 1983"                                                                                                         | Hansard H5: "Saturday 1 January / Monday 3 January / Tuesday 4 January*"                  |
| 1988 | 1 月 2 日（土）    | 1 月 4 日の指定は見つかった（本文なし。告示 Edinburgh 22161 頁 879）が、「in place of」の文言はない          | "to appoint Monday 28th December 1987, Monday 4th January and Monday 30th May 1988 as Bank Holidays in Scotland"                                                                                                    | Hansard H6: "Friday 1 January / Monday 4 January*"（"Saturday 2 January" は挙げていない） |
| 1993 | 1 月 2 日（土）    | 見つかった（Belfast 5317 頁 529 ／Edinburgh 23183 頁 1827 ／London Supp 52944 頁 9671）                      | "declare that Saturday, the second day of January in the year 1993; shall not be a bank holiday in Scotland and do hereby appoint in place of it Monday, the fourth day of January in the year 1993"                | 一覧・Hansard はない                                                                      |
| 1993 | 12 月 25 日（土）  | 12 月 27・28 日の指定は見つかった（Edinburgh 23399 頁 2381）が、**追加（section 1(3)）で、振替の文言はない** | "Monday, the twenty-seventh day of December and Tuesday, the twenty-eighth day of December in the year 1993 … to be bank holidays in Scotland"                                                                      | 一覧・Hansard はない                                                                      |
| 1994 | 1 月 1 日（土）    | 1 月 4 日の指定は見つかった（Edinburgh 23399 頁 2381）が、**追加（section 1(3)）で、振替の文言はない**       | "Tuesday, the fourth day of January … in the year 1994, to be bank holidays in Scotland"                                                                                                                            | 一覧・Hansard はない                                                                      |
| 1999 | 1 月 2 日（土）    | 見つかった（6 月 L-55182-5SI で追加、12 月 L-55364-1SI で振替に出し直し）                                    | "declare that Saturday, the second day of January in the year 1999, shall not be a bank holiday in Scotland and do hereby appoint in place of it Monday, the fourth day of January in the year 1999"                | Hansard 1998-12-16 は 12 月 31 日だけ                                                     |
| 1999 | 12 月 25 日（土）  | 見つかった（L-55541-3）                                                                                      | "declare that Saturday, the twenty-fifth day of December in the year 1999 shall not be a bank holiday in Scotland and do hereby appoint in place of it Tuesday, the twenty-eighth day of December in the year 1999" | 一覧・Hansard はない                                                                      |

1976 年 12 月 25 日（土）と 1977 年 1 月 1 日（土）も、Edinburgh 19947 頁 1253 が 12 月 27・28 日と 1 月 4 日を**追加（section 1(3)）**として指定している（Hansard H2 は 27 日と 1 月 4 日を "in substitution for Christmas Day and New Year's Day" と書く）。

1978〜1999 年で、Scotland の土曜日の 1 月 1 日・2 日・12 月 25 日について**日付の指定そのものが見つからない年はない**。ただし、1988・1993（12 月）・1994 年は振替ではなく追加として指定されている（1988 年は告示だけで本文が見つからない）。

## 付録 C: 12 月の振替の割り当て

| 年           | 12/25 | 12/26 | England・Wales・NI                                                                      | Scotland                                                                                       |
| ------------ | ----- | ----- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1976（参考） | 土    | 日    | 12/27 Schedule 1、12/28 布告（追加。Hansard H2 は "in substitution for Christmas Day"） | 12/27・12/28 布告（追加。Hansard H2 は 27 日を Christmas Day の代わり、28 日を Boxing Day 分） |
| 1981         | 金    | 土    | 12/28 を 12/26 の代わりに（"in the place of Saturday, 26th December"）                  | 12/28 追加                                                                                     |
| 1982         | 土    | 日    | 12/27 Schedule 1、12/28 布告（追加。どの日の代わりかは書かない）                        | 12/27 追加、**12/28 を 12/25 の代わりに**（告示）                                              |
| 1983         | 日    | 月    | 12/26・12/27 とも Schedule 1                                                            | 12/26 Schedule 1（Christmas Day の日曜日の振替）、12/27 追加                                   |
| 1987         | 金    | 土    | 12/28 布告（告示の文言は "to appoint" だけ）                                            | 12/28 追加（告示）                                                                             |
| 1988         | 日    | 月    | 12/26・12/27 とも Schedule 1                                                            | 12/26 Schedule 1、12/27 追加                                                                   |
| 1992         | 金    | 土    | 12/28 を 12/26 の代わりに（"in the place of Saturday, 26th December"）                  | 12/28 追加                                                                                     |
| 1993         | 土    | 日    | 12/27 Schedule 1、12/28 布告（追加）                                                    | 12/27・12/28 とも追加（どちらも Christmas Day の代わりとは書かない）                           |
| 1994         | 日    | 月    | 12/26・12/27 とも Schedule 1                                                            | 12/26 Schedule 1、12/27 追加                                                                   |
| 1998         | 金    | 土    | 12/28 を 6 月に追加、12 月に 12/26 の代わりに出し直し                                   | 12/28 追加                                                                                     |
| 1999         | 土    | 日    | 12/27 Schedule 1、12/28・12/31 布告（追加）                                             | 12/27 追加、**12/28 を 12/25 の代わりに**、12/31 追加                                          |

まとめ:

- England・Wales・NI では、Christmas Day はコモン・ローの休日で bank holiday ではないため、布告が「Christmas Day の代わり」と書くことはない。12 月 26 日（土）だけが振替（in place of）の対象になり、1981・1992・1998（12 月の出し直し）年に「in place of」で指定されている（1987 年は告示だけで不明）。
- Scotland で 25 日が土曜日の年は、1982・1999 年は 28 日を Christmas Day の代わり、27 日を追加とする。1993 年は 27・28 日ともに追加とし、割り当てを書かない。
- 25 日が日曜日の年（1983・1988・1994）は、どの地域も 26 日（Scotland では Christmas Day の振替、England・Wales・NI では Boxing Day）と 27 日が Schedule 1 か布告の追加で埋まり、「in place of」の布告はない。

## 付録 D: 1977 年に Early May がないこと

- 1977 年分の布告は、Edinburgh 19947 頁 1253（1976-09-17）が England・Wales・NI の 1976-12-28 と 1977-01-03、Scotland の 1976-12-27・28 と 1977-01-04 だけを指定し、Silver Jubilee の布告（Edinburgh 20015 頁 75）が 6 月 6・7 日を指定する。どちらにも 5 月第 1 月曜（1977-05-02）の England・Wales・NI への指定はない。
- Hansard 1976-07-12 の 1977 年の祝日一覧は、"2nd May (Scotland only)" としている（Scotland の Schedule 1 の 5 月第 1 月曜）。
