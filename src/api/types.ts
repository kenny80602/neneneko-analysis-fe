// 後端統一回應格式（internal/pkg/ginx/response.go 的 Response）。
// 三個欄位都是 omitempty：成功時只會有 data，code / msg 不存在；
// 失敗時 HTTP 狀態非 200，axios 會 throw，錯誤訊息取自 msg（見 request.ts 的 apiErrorMessage）。
export interface ApiResponse<T> {
  code?: number;
  msg?: string;
  data?: T;
}

// ===== 共用 =====

// 資料落地與歷史查詢用的市場別（後端 domain.Market）。
export type Market = 'TWSE' | 'TPEx';
// 即時報價與自選股用的市場別（來自證交所 MIS，小寫）。
export type QuoteMarket = 'tse' | 'otc' | '';

// 單檔歷史查詢共用的查詢字串。六支歷史端點（收盤、法人、融資券、估值、月營收、重大訊息）
// 參數語意完全一致：from / to 為 YYYY-MM-DD 且可省略，limit 未指定時後端預設 60、上限 1000。
export interface HistoryParams {
  from?: string;
  to?: string;
  limit?: number;
}

// ===== 每日收盤行情（/stocks/daily）=====

export interface DailyQuote {
  symbol: string;
  name: string;
  market: Market;
  // 交易日，YYYY-MM-DD。
  date: string;
  // 當天有沒有成交。false 時下面的價格全是 0，不代表真的跌到零。
  traded: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
  // 對前一個交易日的漲跌。
  change: number;
  // 當天是不是除權息日。是的話 change 會是 0——除權息後與前一日沒有可比性，不是平盤。
  ex_dividend: boolean;
  volume: number;
  trade_value: number;
  transaction_count: number;
  // 當日全市場名次，1 起算，分母是同市場的普通股家數（上市跟上市比、上櫃跟上櫃比）。
  //
  // null 是「這一天沒有名次」而不是排最後：當天沒成交、不是普通股（ETF、權證、
  // 特別股不納入排名），或這一列是回補進來的——回補走單檔歷史端點，
  // 那裡問不到全市場，所以 2026-08-16 以前的資料一律是 null。
  trade_value_rank: number | null;
  trade_value_rank_total: number | null;
  // 漲跌幅名次，第 1 名是當天漲最多的。除權息當天額外是 null——那天的漲跌跟前一日
  // 沒有可比性，所以這一組的分母會比成交金額那一組少幾檔（實測上市 1,087 對 1,085），
  // 不是算錯。
  change_rank: number | null;
  change_rank_total: number | null;
}

export interface DailyQuoteHistory {
  symbol: string;
  count: number;
  quotes: DailyQuote[];
}

export interface DailyQuoteByDate {
  // 實際查到的交易日。沒帶 date 時是目前收集到最新的那一天。
  date: string;
  count: number;
  quotes: DailyQuote[];
}

// ===== 即時報價（/stocks/realtime/:symbol）=====

// 現價的來源。不是 TRADE 就代表這不是本次快照的成交價，顯示時應標示出來。
export type PriceSource =
  | 'TRADE'
  | 'MID'
  | 'LAST_KNOWN'
  | 'DELAYED'
  | 'PREVIOUS_CLOSE'
  | '';

// price 為 null 不等於當日未成交：來源只在「最近一次撮合有成交」時給價，
// 冷門股盤中常常沒有。當日有無成交看 traded，畫面顯示「暫無報價」而不是 0。
export interface RealtimeQuote {
  symbol: string;
  name: string;
  full_name: string;
  market: QuoteMarket;
  price: number | null;
  price_source: PriceSource;
  // 現價實際成交的時間，RFC3339。早於 quote_time 表示這個價不是本次快照拿到的。
  price_as_of: string;
  previous_close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  change_percent: number | null;
  volume: number | null;
  traded: boolean;
  // 報價時間（來源提供），RFC3339。
  quote_time: string;
}

// ===== 三大法人（/stocks/institutional）=====

// 單位都是股。
export interface TradingFlow {
  buy: number;
  sell: number;
  net: number;
}

export interface InstitutionalTrading {
  date: string;
  symbol: string;
  name: string;
  foreign_excluding_dealers: TradingFlow;
  foreign_dealers: TradingFlow;
  investment_trust: TradingFlow;
  dealers_proprietary: TradingFlow;
  dealers_hedge: TradingFlow;
  // 自營商買賣超合計（自行買賣 + 避險）。上游只給買賣超。
  dealers_net: number;
  // 三大法人買賣超合計，不含外資自營商（已計入自營商）。
  total_net: number;
}

export interface InstitutionalHistory {
  symbol: string;
  // 固定是 TWSE：上櫃三大法人上游沒有日期參數，收不了歷史。
  market: Market;
  count: number;
  // 逐日明細，日期由新到舊。
  items: InstitutionalTrading[];
}

// ===== 融資融券（/stocks/margin）=====

// 數量單位都是張。使用率／券資比為 null 代表「這個市場沒有這個數字」，不是 0。
export interface MarginBalance {
  symbol: string;
  name: string;
  market: Market;
  date: string;

  margin_purchase: number;
  margin_sale: number;
  cash_redemption: number;
  margin_previous_balance: number;
  margin_balance: number;
  margin_quota: number;
  // 融資增減（今日 − 前日）。正數代表散戶加碼。
  margin_change: number;
  // 融資使用率（%）。只有上櫃公布，上市是 null。
  margin_utilization_rate: number | null;
  margin_balance_by_securities_finance: number | null;

  short_sale: number;
  short_covering: number;
  stock_redemption: number;
  short_previous_balance: number;
  short_balance: number;
  short_quota: number;
  // 融券增減（今日 − 前日）。正數代表看空的人變多。
  short_change: number;
  // 融券使用率（%）。只有上櫃公布。
  short_utilization_rate: number | null;
  short_balance_by_securities_finance: number | null;

  // 券資比（%）＝ 融券餘額 ÷ 融資餘額 × 100，判斷軋空的常用指標。
  // 融資餘額為 0 時是 null，沒有分母算不出比率。
  short_margin_ratio: number | null;

  // 資券互抵。
  offsetting: number;
  // 上游的備註代碼，只有上市有。
  note: string;
}

export interface MarginHistory {
  symbol: string;
  count: number;
  balances: MarginBalance[];
}

export interface MarginByDate {
  date: string;
  count: number;
  balances: MarginBalance[];
}

// 大盤（整個市場合計）的融資融券（/stocks/margin/summaries）。
//
// 欄位比個股那份少是上游決定的，不是這裡漏抄：大盤沒有限額、使用率與資券互抵，
// 融券也只有張數——兩個市場的上游都沒有公布融券金額。
export interface MarketMarginSummary {
  market: Market;
  date: string;

  // 融資，單位張。
  margin_lots: number;
  margin_previous_lots: number;
  // 今日 − 前日。正數代表整個市場的融資部位變多（散戶加碼）。
  margin_lots_change: number;
  // 融資金額，單位元（上游給仟元，後端已換算）。
  margin_amount: number;
  margin_previous_amount: number;
  margin_amount_change: number;

  // 融券，單位張。沒有金額欄位。
  short_lots: number;
  short_previous_lots: number;
  // 正數代表看空的部位變多。
  short_lots_change: number;
}

export interface MarketMarginSummaries {
  count: number;
  // 兩個市場的逐日餘額攤平在一起，日期由新到舊、同一天上市在前。
  items: MarketMarginSummary[];
}

// ===== 估值指標（/stocks/valuation）=====

// 數值為 null 代表「沒有這個值」：虧損的公司算不出本益比、沒配息的沒有殖利率。
// 顯示破折號，不要畫成 0。
export interface Valuation {
  date: string;
  pe_ratio: number | null;
  dividend_yield: number | null;
  pb_ratio: number | null;
  // 每股股利，單位元。只有上櫃有這一欄，上市固定是 null。
  dividend_per_share: number | null;
}

export interface ValuationHistory {
  symbol: string;
  name: string;
  market: Market | '';
  count: number;
  items: Valuation[];
}

// ===== 月營收（/stocks/revenue）=====

// 金額單位一律新台幣千元，跟上游一致；百分比欄位單位為 %。
export interface MonthlyRevenue {
  // 資料月份，YYYY-MM。
  month: string;
  // 上游出表日期，YYYY-MM-DD。是「這份內容哪天產出」，不是營收月份。
  report_date: string;
  revenue: number;
  last_month_revenue: number;
  last_year_revenue: number;
  // 上月比較增減（%）。
  mom: number;
  // 去年同月增減（%）。
  yoy: number;
  accumulated: number;
  last_year_accumulated: number;
  accumulated_yoy: number;
  note: string;
}

export interface RevenueHistory {
  symbol: string;
  name: string;
  market: Market | '';
  // 產業別，例如「水泥工業」。
  industry: string;
  count: number;
  // 逐月明細，月份由新到舊。
  items: MonthlyRevenue[];
}

// 全市場月營收排行的一列：月營收明細再加名次與公司識別。
export interface RevenueRankItem extends MonthlyRevenue {
  // 名次，1 起算。是「這一次查詢的母體」裡的名次——有指定 market 就是那個市場的。
  // min_yoy 不影響名次，門檻篩掉的是排序後的尾端。
  rank: number;
  symbol: string;
  name: string;
  market: Market;
  // 官方產業別，例如「水泥工業」。不是「散熱」那種主題族群。
  industry: string;
}

export interface RevenueRanks {
  // 實際查的月份 YYYY-MM。空字串代表這張表還沒有任何資料。
  month: string;
  // 實際用的排序鍵。
  sort: 'yoy' | 'mom' | 'revenue';
  // total 這個月收集到的家數，ranked 其中排得出名次的家數（名次的分母），
  // count 實際回了幾筆（套用 min_yoy 與 limit 之後）。
  //
  // total − ranked 是「沒有比較基期」的家數：去年同月還沒上市的算不出年增率。
  // 排序鍵是 revenue 時兩者相等，因為金額不需要基期。
  total: number;
  ranked: number;
  count: number;
  items: RevenueRankItem[];
}

// 同產業的一家公司（/stocks/revenue/peers/:symbol）。
//
// 只有月營收相關欄位：收盤價與本益比那幾張表只收自選股，同產業動輒兩百家，
// 多數拿不到價格，後端不給一個大部分是 null 的欄位。
export interface IndustryPeer {
  // 產業內的月營收名次，1 起算。
  rank: number;
  symbol: string;
  name: string;
  market: Market;
  // 單月營收，單位新台幣千元。
  revenue: number;
  // 單位 %。
  mom: number;
  yoy: number;
}

export interface IndustryPeers {
  // 官方產業別。
  //
  // ⚠️ 這是證交所的產業分類，不是「散熱」「AI」那種主題族群——主題族群是人工整理的
  // 選股清單，免費資料源沒有。同樣做散熱的三家可能分屬電機機械、
  // 電腦及週邊設備業、其他電子業，這一支不會把它們放在一起。
  industry: string;
  // 這份排名的資料月份，YYYY-MM。查無資料時是空字串。
  month: string;
  // 這一檔在產業內的月營收名次。那個月沒公告時是 0。
  rank: number;
  // 這個產業有幾家公司公告了這個月的營收。
  total: number;
  peers: IndustryPeer[];
}

// ===== 主題族群（/stocks/groups）=====

export interface StockGroup {
  id: string;
  // 族群名稱，同時也是鍵：同名視為覆蓋而不是新增。
  name: string;
  // 成員代號，順序照當初輸入的（可能刻意把龍頭放第一個），後端不會重排。
  symbols: string[];
  sort_order: number;
}

export interface GroupPeer {
  symbol: string;
  name: string;
  // 官方產業別。刻意顯示出來，好讓「族群跟官方分類不是同一回事」看得見：
  // 散熱族群的三家分屬電機機械、電腦及週邊設備業、其他電子業。
  industry: string;
  // 不在自選股裡的成員只有月營收，價格、法人、融資券那幾支沒收，畫面上是破折號。
  in_watchlist: boolean;
  // 營收月份 YYYY-MM。沒有營收資料時是空字串。
  year_month: string;
  // 單月營收，單位新台幣千元。沒有資料時是 null，不是 0。
  revenue: number | null;
  // 單位 %。revenue 是 null 時這兩個沒有意義。
  yoy: number;
  mom: number;
  // 最近 5 個交易日的漲跌幅（%）。
  //
  // 滾動 5 個交易日而不是「本週一到今天」：後者在週一只涵蓋一天，而這個數字是
  // 拿來讓族群成員互比的，區間長度不一樣就比不出東西。
  //
  // 來源是 Yahoo 日 K 不是站上落地的收盤——收盤只收自選股，而族群成員多半不在
  // 清單裡。所以它跟其他頁的收盤價可能差一個延遲（台股約 20 分鐘）。
  //
  // null 是「這次沒取到」（上游掛掉、查無代號、不滿六個交易日），不是 0——
  // 0 代表這五天剛好持平。
  week_change: number | null;
}

export interface GroupPeers {
  group: StockGroup;
  // 這份營收的資料月份 YYYY-MM。整個族群都沒有資料時是空字串。
  month: string;
  // 成員，月營收由大到小；沒有營收的排最後。
  peers: GroupPeer[];
}

/** 族群裡的一家公司，只有身分資料沒有行情。 */
export interface GroupMember {
  symbol: string;
  // 公司名稱。空字串代表這一檔從來沒公告過月營收——ETF、剛上市、或代號根本打錯。
  // 維護畫面就是靠這個看出代號有沒有打錯，所以後端查不到時不補任何替代值。
  name: string;
  // 官方產業別。同樣可能是空字串。
  industry: string;
  in_watchlist: boolean;
}

export interface GroupMembers {
  group: StockGroup;
  // 成員，**照族群裡儲存的順序**，不重排——順序本身就是使用者編出來的資料。
  // 跟 GroupPeers 不同，那邊是比較用的表所以照營收由大到小排。
  members: GroupMember[];
}

export interface GroupMembersList {
  count: number;
  items: GroupMembers[];
  // 有幾檔查不到名稱（跨族群去重後）。
  // 給畫面解釋「為什麼有幾檔只有代號」用：不是壞掉，是那幾檔不在月營收那份資料裡。
  unnamed: number;
}

export interface RemoveGroupResult {
  id: string;
  // 刪掉幾列（0 或 1）。0 代表本來就不在了，不是錯誤。
  removed: number;
}

// ===== 族群熱度榜（/stocks/groups/heat）=====
//
// 跟上面那組是兩回事：上面管的是「誰屬於散熱」（人工維護的成員清單），
// 這一組管的是「散熱今天有沒有在動」。後端也是兩支 handler。

export interface GroupHeatLeader {
  symbol: string;
  name: string;
  // 當日報酬（%）。
  return_pct: number;
  // 當日成交值，單位元。
  trade_value: number;
}

export interface GroupHeat {
  // 族群名稱。這一支不回 id，要跟族群清單對起來只能靠名稱——
  // 名稱本來就是後端的鍵（同名視為覆蓋），所以對得起來。
  name: string;
  // 族群有幾檔、其中幾檔今天算得出報酬。
  //
  // ⚠️ 兩個數字差很多時，下面每一個指標都只代表算得到的那幾檔。
  member_count: number;
  covered_count: number;
  // 涵蓋到的檔數少於三檔，這一列的中位數幾乎由單一檔決定。
  // 仍然可能是真的，但更可能是個股事件被誤讀成題材，後端排序時已經降級。
  thin: boolean;

  // 族群成交值（元）與占全市場成交值的比重（%）。
  trade_value: number;
  share_of_market: number;
  // 比重相對前一個交易日的變化（百分點）。
  //
  // null 是「還沒有前一天的資料」，不是「沒有變化」。橫斷面那張表從落地那天起
  // 才有，而且補不回來（上游問不到全市場的歷史）。
  share_change: number | null;

  // 族群中位數報酬（%）。用中位數不用平均：一檔漲停就能把平均拉起來。
  median_return: number;
  // 減掉全市場中位數之後的超額報酬（百分點）。族群強弱看這一欄。
  excess_return: number;
  // 上漲家數比（%）。擴散度——真正的題材是整群一起動。
  advance_ratio: number;
  // 平均單筆成交金額（元）與相對市場平均的倍數（1.0 代表跟市場一樣）。
  avg_trade_size: number;
  avg_trade_size_ratio: number;

  // 成立了哪幾個訊號。signals 是機器讀的代號、signal_labels 是對應的中文。
  // 中文由後端給而不是前端各寫一份，散在各處會跟定義走散。
  signals: string[];
  signal_labels: string[];
  // 成立幾個。榜的排序鍵就是它，不是加權分數。
  signal_count: number;

  // 族群裡漲最多的幾檔，最多三檔。
  leaders: GroupHeatLeader[];
}

export interface MarketBreadth {
  // 全市場中位數報酬（%）。族群的超額報酬是跟它比出來的。
  median_return: number;
  trade_value: number;
  avg_trade_size: number;
  // 算進基準的檔數。
  counted: number;
}

export interface GroupHeatBoard {
  // 各市場的資料日期，key 是 twse / tpex。
  //
  // ⚠️ 兩邊常常差一天（上市收盤那包的上游慢一天），畫面要兩個日期都顯示，
  // 不要挑一個當「今天」。
  as_of: Record<string, string>;
  // 這次用到幾個交易日。1 表示只有當天，此時 share_change 全是 null。
  days_covered: number;

  market: MarketBreadth;
  count: number;
  items: GroupHeat[];

  // 指標是怎麼算的。後端給的字串，原樣顯示。
  method: string;
  // 讀這份榜之前必須知道的事。這一欄不是裝飾——「哪個題材在發酵」極容易被讀成
  // 「買哪個會賺」，而兩者之間還隔著一個沒做過的檢定，所以畫面上一定要照著標。
  caveats: string[];
}

// ===== 重大訊息（/stocks/announcement）=====

export interface MaterialAnnouncement {
  // 發言時間，YYYY-MM-DD HH:MM:SS，台北時區。
  announced_at: string;
  // 事實發生日，YYYY-MM-DD。可能早於發言日很多（補公告），上游沒給時是空字串。
  occurred_on: string;
  // 符合條款，例如「第51款」。要篩掉例行公告（更名、法說會）時看這一欄。
  clause: string;
  subject: string;
  // 說明全文，公司填的制式問答，通常好幾百字並帶換行。
  detail: string;
}

export interface AnnouncementHistory {
  symbol: string;
  name: string;
  market: Market | '';
  count: number;
  // 逐則明細，發言時間由新到舊。
  items: MaterialAnnouncement[];
}

// ===== 注意股（/stocks/warning）=====

export interface TradingWarning {
  date: string;
  // 注意交易資訊，一段中文敘述，裡面會帶觸發的款次。
  // 這一欄比「有沒有被列」重要——是連續大漲、周轉率過高，還是本益比異常。
  reason: string;
  close_price: number;
  pe_ratio: number | null;
  // 累計第幾次被列注意。只有上市有，上櫃固定是 null。
  announcement_count: number | null;
}

export interface WarningHistory {
  symbol: string;
  name: string;
  market: Market | '';
  count: number;
  items: TradingWarning[];
}

// ===== 自選股 / 持股（/portfolio）=====

// 成本與 EPS 可能是 null：從 LINE 聊天室加進來的只有代號跟名稱。
// null 跟 0 差很多——成本填 0 會讓損益算出 -100%。
export interface Holding {
  id: string;
  symbol: string;
  name: string;
  market: QuoteMarket;
  cost: number | null;
  shares: number | null;
  // 這一筆是哪一天買的，YYYY-MM-DD。
  //
  // 空字串代表不知道，不是今天——多數列是從 xlsx 匯入的，當時沒有這個資訊。
  // 不要拿 ctime 頂替：那是「這一列什麼時候被建出來」，對匯入的資料來說是匯入那天。
  trade_date: string;
  // 這筆部位放在哪個券商帳戶。同一檔可以有好幾筆，分別對應不同帳戶；空字串代表沒指定。
  account: string;
  // 近四季 EPS（TTM）。
  trailing_eps: number | null;
  // 預估整年 EPS。
  full_year_eps: number | null;
  // 最新一季的實際 EPS。
  latest_quarter_eps: number | null;
  // false 的列不納入試算與推播。
  enabled: boolean;
  sort_order: number;
  note: string;
  // RFC3339。
  ctime: string;
  utime: string;
}

// 持股試算的一列。幾乎每一欄都是 null 可能：外部來源隨時可能取不到，
// 而 null 跟 0 在這裡差很多——回檔 0 會被讀成「沒有回檔」，本益比 0 根本不成立。
export interface PortfolioRow {
  symbol: string;
  name: string;
  market: QuoteMarket;
  cost: number | null;
  price: number | null;
  // 現價來源。回檔、損益與四個本益比全部以現價現算，這一欄決定那些數字的可信度。
  price_source: PriceSource;
  price_as_of: string;
  today_high: number | null;
  today_low: number | null;
  // 回看區間（半年）內的最高價。
  recent_high: number | null;
  // 建議買入區間＝半年最高 × 0.65 ~ 0.70。
  buy_zone_low: number | null;
  buy_zone_high: number | null;
  // 現價是否已達建議買入區間（含跌破下緣）。
  in_buy_zone: boolean;
  // 回檔幅度（%）＝（半年最高 − 現價）／半年最高 × 100。
  pullback_percent: number | null;
  // 相對成本損益（%）。沒有成本就算不出來。
  profit_percent: number | null;
  trailing_eps: number | null;
  full_year_eps: number | null;
  latest_quarter_eps: number | null;
  // 四個本益比一律現算不存值：股價每天變，存下來的固定值馬上過期。
  historical_pe: number | null;
  high_pe: number | null;
  estimated_pe: number | null;
  annualized_pe: number | null;
  // 這一列取得行情失敗的原因，成功時是空字串。
  error: string;
}

// 加入自選股的結果（POST /portfolio/holdings）。
export interface AddHoldingResult {
  // 正規化後的代號，不一定等於送出去的那串。
  symbol: string;
  // 股票簡稱，取自行情來源而不是使用者輸入。
  name: string;
  // 這一檔本來就在清單裡，這次沒有新增。不是錯誤，但畫面要跟「新增成功」講不一樣的話。
  already_exists: boolean;
}

// 移除自選股的結果（DELETE /portfolio/holdings/:symbol）。
export interface RemoveHoldingResult {
  symbol: string;
  // 實際刪掉幾列。同一檔可能有多列（分批買、成本不同），所以不一定是 1；
  // 0 代表清單裡本來就沒有這一檔，後端不當成錯誤。
  removed: number;
}

// 更新部位的結果（PUT /portfolio/positions/:id）。
export interface UpdatePositionResult {
  id: string;
  cost: number | null;
  shares: number | null;
  account: string;
}

// 刪除單一筆部位的結果（DELETE /portfolio/positions/:id）。
export interface RemovePositionResult {
  id: string;
  // 刪掉幾列（0 或 1）。0 代表那一筆本來就不在了，不是錯誤。
  removed: number;
}

// ===== LINE 推播（/line）=====

// 推播對象的種類。群組 C 開頭／聊天室 R 開頭／個人 U 開頭。
export type LineTargetType = 'group' | 'room' | 'user';

// 一個推播對象（後端 LineTargetVo）。
//
// LINE 的事件不帶群組名稱，所以清單上只有 ID——認不認得出是哪個群靠 note 這個人工標記。
export interface LineTarget {
  // 填進後端的 LINE_TARGET_ID 就會推播到這個對象。
  target_id: string;
  target_type: LineTargetType;
  // 最後一次見到這個對象時是什麼事件。
  last_event_type: string;
  // 累計出現次數，用來分辨還在用的群跟早就退掉的群。
  event_count: number;
  // 人工標記，沒標時是空字串。
  note: string;
  // 皆為 RFC3339；後端零值時給空字串。
  first_seen_at: string;
  last_seen_at: string;
}

// 本月推播額度（後端 LineQuotaVo）。
//
// 三個布林旗標的組合要一起看，不能只讀 remaining：
// unlimited 為 true 時 value / remaining 都沒有意義（後端就是填 0），
// 這時顯示剩餘則數會變成「還剩 0 則」，跟事實正好相反。
export interface LineQuota {
  // 這個帳號有沒有月上限。免費方案是 true。
  limited: boolean;
  // 本月上限則數。limited 為 false 時是 0。
  value: number;
  // 本月已使用的計費訊息則數。
  // 只算主動推播（push／multicast／broadcast／narrowcast）；聊天室指令的回覆不計費。
  used: number;
  // 還能發幾則。limited 為 false 時是 0，那時要看 unlimited 而不是這一欄。
  remaining: number;
  // 無上限方案。為 true 時 value／remaining 都沒有意義。
  unlimited: boolean;
}

// ===== 大盤（/stocks/twse、/stocks/tpex）=====
//
// 這兩組是「即時打交易所」的整包資料，不落地且受上游限流影響。
// 這裡只放已接進畫面的端點；其餘端點要用時再依後端 VO 補上型別，不要先抄一堆用不到的。

// 集中市場每日市場成交資訊（/stocks/twse/market_tradings，回陣列）。
export interface TWSEMarketTrading {
  date: string;
  // 成交股數。
  trade_volume: number;
  // 成交金額，單位元。
  trade_value: number;
  transaction_count: number;
  // 發行量加權股價指數。
  taiex: number;
  index_change: number;
}

// 集中市場漲跌證券數統計（/stocks/twse/advance_decline_summaries，回陣列）。
export interface TWSEAdvanceDeclineSummary {
  date: string;
  // 統計範圍。「整體市場」那列含權證與 ETF，別跟「股票」那列相加。
  category: string;
  rise_count: number;
  limit_up_count: number;
  decline_count: number;
  limit_down_count: number;
  flat_count: number;
  unmatched_count: number;
  no_comparison_count: number;
}

// 三大法人買賣金額統計表（BFI82U）的單列。金額單位元。
export interface InstitutionalSummary {
  date: string;
  investor: string;
  // 這一列是上游算好的合計。前五列相加不等於它——外資自營商已計入自營商，上游不重複計算。
  total: boolean;
  purchase_amount: number;
  sale_amount: number;
  net: number;
}

// /stocks/twse/institutional_summaries 的回應（物件，不是陣列）。
export interface TWSEInstitutionalSummaries {
  date: string;
  count: number;
  items: InstitutionalSummary[];
}

// 集中市場每日成交量前二十名證券（/stocks/twse/volume_ranks，回陣列）。
// 上游只給當天，沒有日期參數；也沒有漲跌幅，要自己用 change ÷ 昨收算。
export interface TWSEVolumeRank {
  date: string;
  rank: number;
  symbol: string;
  name: string;
  // 成交股數。
  trade_volume: number;
  transaction_count: number;
  open: number;
  high: number;
  low: number;
  close: number;
  // 對前一個交易日的漲跌。上游把正負號跟數值拆兩欄給，後端已合併成帶號數字。
  change: number;
  last_best_bid_price: number;
  last_best_ask_price: number;
}

// 上櫃盤中漲幅／跌幅排行（/stocks/tpex/price_advanced、/price_declined，回陣列）。
// 跌幅榜的 change 與 change_percent 是負數。
export interface TPExPriceMover {
  date: string;
  symbol: string;
  name: string;
  close_price: number;
  change: number;
  change_percent: number;
}

// 上櫃股票市場現況（/stocks/tpex/market_highlight，回單一物件）。
export interface TPExMarketHighlight {
  date: string;
  listed_company_numbers: number;
  // 總資本額，單位百萬元。
  authorized_capital: number;
  // 總市值，單位百萬元。
  market_capitalization: number;
  // 本日總成交值，單位百萬元。
  daily_trading_value: number;
  // 本日總成交股數，單位千股。
  daily_trading_volume: number;
  // 櫃買指數。
  close_index: number;
  index_change: number;
  rise_count: number;
  limit_up_count: number;
  decline_count: number;
  limit_down_count: number;
  flat_count: number;
  unmatched_count: number;
}

// ===== 收集結果（POST /stocks/daily/collect、/stocks/warning/collect）=====

export interface CollectResult {
  // 這批資料的交易日。上游一筆都沒給時是空字串。
  date: string;
  saved: number;
  wanted: number;
  // 清單裡有、但上游沒給的代號。不是錯誤：可能剛下市，也可能是興櫃。
  missing: string[] | null;
  // 哪些市場抓失敗了。一邊失敗不影響另一邊。
  failures: Record<string, string> | null;
  institutional: {
    skipped: boolean;
    tradings: number;
    summaries: number;
    tradings_failure: string;
    summaries_failure: string;
  };
  margin: {
    skipped: boolean;
    saved: number;
    missing: string[] | null;
    failures: Record<string, string> | null;
  };
  valuation: {
    saved: number;
    missing: string[] | null;
    failures: Record<string, string> | null;
  };
}

export interface WarningCollectResult {
  // 存了幾檔（全市場，不是自選股）。0 是常態不是失敗：市場平靜的日子本來就沒有任何一檔被列注意。
  saved: number;
  failures: Record<string, string> | null;
}

// ===== 自訂沖銷帳（/ledger）=====
//
// 券商與集保的結算一律先進先出。這一組端點讓使用者自己指定要沖哪一筆買進，
// 同時把券商 FIFO 的結果一起算出來對照。
//
// 三件事後端的 doc comment 有寫，前端顯示時不要弄丟：
//   1. 這本帳不會、也不可能改變券商端的結算與交割。
//   2. 沖銷方法只改變損益認列在哪一筆、哪一天，不改變總額——出清後兩帳差額必然歸零。
//   3. 個人證券交易所得目前停徵，證交稅按成交金額課，跟沖銷方法無關。

// 沒有逐筆指定時，剩下的股數照哪一種順序沖銷。
// HIGHEST_COST 常常跟 LIFO 給出相反答案：往下攤平時最近買的反而最便宜。
export type MatchRule = 'LIFO' | 'HIGHEST_COST' | 'FIFO';

// 這幾股是使用者指定的，還是規則自動補的。
export type AllocationSource = 'PICKED' | 'AUTO';

// 哪一本帳。
export type LedgerView = 'STRATEGY' | 'BROKER';

// 一筆買進。存進去之後不再修改，賣出只會改變它的剩餘。
export interface LedgerLot {
  id: string;
  symbol: string;
  name: string;
  // 成交日 YYYY-MM-DD。沖銷順序完全靠它。
  trade_date: string;
  shares: number;
  price: number;
  // 買進手續費，當時實際付的錢（不是用現在的費率回推）。
  fee: number;
  // 每股成本，後端已把買進手續費攤進去。不要在前端再攤一次。
  unit_cost: number;
  // 券商帳戶。空字串代表沒有指定。
  account: string;
  seq: number;
}

// 一筆買進在某一本帳裡的剩餘。
export interface LedgerPosition {
  lot: LedgerLot;
  // 這本帳裡還剩幾股。0 代表已出清。
  remaining: number;
  cost_remaining: number;
}

// 一次賣出中，某一筆買進被沖掉的部分。
export interface LedgerAllocation {
  lot_id: string;
  shares: number;
  unit_cost: number;
  cost: number;
  // 整張單的費用按股數比例攤到這一筆，各筆加總會剛好等於整張單。
  fee: number;
  tax: number;
  proceeds: number;
  realized: number;
  source: AllocationSource;
}

// 使用者當初指定了哪幾筆，原樣回送。
export interface LedgerPick {
  lot_id: string;
  shares: number;
}

// 一筆賣出在某一本帳裡的沖銷結果。
export interface LedgerMatchedSell {
  id: string;
  symbol: string;
  trade_date: string;
  shares: number;
  price: number;
  picks: LedgerPick[];
  fallback: MatchRule;
  // 這筆從哪一個帳戶賣的。沖銷只在同一帳戶內進行。
  account: string;
  seq: number;

  // 成交金額，未含費用。
  amount: number;
  fee: number;
  tax: number;
  net_proceeds: number;
  realized: number;
  // 這一筆賣掉的部位當初花了多少（每股成本已含買進手續費）。它是 realized 的分母。
  cost: number;
  // 報酬率（%）＝ realized ÷ cost × 100。
  //
  // null 是「算不出來」而不是 0%：庫存整批不夠賣時一股都沒沖到，成本是 0。
  // 顯示要走破折號——0% 會被讀成「不賺不賠」，那是完全不同的意思。
  return_rate: number | null;

  // 由規則自動補上的股數。0 代表完全照使用者指定。
  auto_filled: number;
  // 指定了但庫存不夠而沒沖成的股數。不是 0 就代表這筆該刪掉重記，畫面要提示。
  unhonored: number;
  // 整批庫存都不夠賣而少沖的股數。正常是 0。
  shortfall: number;

  allocations: LedgerAllocation[];
}

// 一檔在某一個視角下的完整帳。全部是後端重播算出來的，沒有任何一個數字落地。
export interface Ledger {
  view: LedgerView;
  // 全部批次，含已出清的（remaining 為 0），順序照買進時序。
  positions: LedgerPosition[];
  sells: LedgerMatchedSell[];
  shares: number;
  cost: number;
  // 剩餘部位的每股平均成本。沒有部位時是 null，不是 0——0 元成本會讓損益算出 -100%。
  avg_cost: number | null;
  realized: number;

  // 剩餘部位的毛市值＝剩餘股數 × 現價，沒有扣任何費用。
  //
  // 下面五個一起有一起沒有：取不到現價（收盤後上游掛掉、冷門股盤中沒撮合價）
  // 或手上沒有部位時都是 null。null 是「不知道」不是 0——
  // 0 元市值會被讀成「這批部位變成壁紙了」。
  market_value: number | null;
  // 現在把剩餘部位全部賣掉要付的手續費與證交稅（估算）。
  //
  // 假設是「用現價、一張單一次賣光」，最低收費只收一次；實際分幾筆賣會更多。
  // 畫面上要標明這是估算，不是保證值。
  sell_fee: number | null;
  sell_tax: number | null;
  // 現在賣掉真的拿得回來的錢＝market_value − sell_fee − sell_tax。
  net_value: number | null;
  // 未實現損益＝net_value − 剩餘部位成本。
  //
  // 成本含買進手續費、這裡扣掉估算的賣出費用，所以跟 realized 同一個口徑。
  unrealized: number | null;
  // 未實現報酬率（%）。分母是這一本帳自己的成本，
  // 所以策略帳與券商帳的數字不一樣——那正是這一頁要對照的東西。
  unrealized_rate: number | null;
}

// 一筆買進在兩本帳裡的剩餘對照。
export interface LedgerReconcileRow {
  lot_id: string;
  trade_date: string;
  unit_cost: number;
  strategy_remaining: number;
  broker_remaining: number;
  // 策略帳剩餘 − 券商帳剩餘。正數＝券商已經沖掉但策略帳還留著。
  diff: number;
}

export interface LedgerReconcile {
  rows: LedgerReconcileRow[];
  // 已實現損益的差額（策略 − 券商）。
  // 這是認列時間的差不是多賺的錢：同一批庫存全部出清後必然歸零。
  realized_diff: number;
  // 平均成本的差額。兩邊都沒有部位時是 null。
  avg_cost_diff: number | null;
  // 有沒有任何一筆的剩餘股數對不上。
  has_diff: boolean;
}

// 一個券商帳戶的手續費設定。
export interface AccountFee {
  // 帳戶名稱。空字串是「全站預設」那一列，沒有單獨設定的帳戶都吃它。
  account: string;
  // 買進手續費折數。0.35 代表 3.5 折（不是 3.5%）——牌價 0.1425% 的 0.35 倍。
  buy_discount: number;
  // 賣出手續費折數。
  //
  // 跟買進分開不是多此一舉：券商 App 的參考損益，買進手續費用實際收的折數
  // （已經發生的事實），賣出卻用牌價保守估（還沒發生）。想跟 App 對得起來就得分開設。
  sell_discount: number;
  // 最低收費（元），買賣分開。0 是合法的。
  //
  // 實測元大零股買進最低 1 元，但 App 顯示參考損益時，賣出那一邊是用整股的 20 元估的。
  // 共用一個值的話小額零股會跟 App 差幾塊錢——27 筆逐筆比對，12 筆對不上。
  buy_minimum: number;
  sell_minimum: number;
}

// 全部帳戶的費率設定。
export interface FeeBook {
  // 手續費率與證交稅率。台股公開規則，不因帳戶而異，所以不可設定。
  rate: number;
  tax_rate: number;
  default: AccountFee;
  // 有單獨設定的帳戶。空陣列代表全部都吃預設。
  accounts: AccountFee[];
}

// 這次計算用的費率。由後端定義，前端只顯示不自己算——
// 紅字門檻那組已經因為前後端各存一份而要記得同時改，不要再多一組。
export interface LedgerFees {
  // 手續費率，買賣都收。台股公開規則 0.001425。
  rate: number;
  // 折數，1 代表不打折。
  discount: number;
  // 手續費最低收費（元）。零股各家差很多，而零股單筆金額小，最低收費會主導損益。
  minimum: number;
  // 證券交易稅率，只有賣出收。台股公開規則 0.003。
  tax_rate: number;
}

// 一個券商帳戶的兩本帳與對帳結果。
//
// 沖銷的單位是「一檔 × 一個帳戶」而不是一檔：券商的結算是逐帳戶的，元大不會拿
// 富邦的庫存去交割。混在一起排一次 FIFO，算出來的券商帳不等於任何一家 App 的畫面，
// 「兩帳差額」也就不再只是認列時間的差。
export interface LedgerAccountBook {
  // 帳戶名稱。空字串代表這幾筆還沒填帳戶——那不是一個真的帳戶，
  // 畫面上要標成「未指定帳戶」並排在最後。
  account: string;
  // 這個帳戶實際生效的賣出費率（各家的折數與最低收費不同）。
  fees: LedgerFees;
  strategy: Ledger;
  broker: Ledger;
  reconcile: LedgerReconcile;
}

// 全部帳戶的合計。後端逐帳戶算完再相加，不是把批次混在一起重播。
//
// 只有加得起來的數字。平均成本刻意沒有：跨帳戶加權平均沒有券商會顯示，
// 卻很容易被當成「我這一檔的成本」。
export interface LedgerTotals {
  // 有幾個帳戶。1 的時候畫面不必分組。
  accounts: number;
  shares: number;
  cost: number;
  realized: number;
  // 各帳戶「策略 − 券商」的差額總和。
  realized_diff: number;

  // 下面這組跟 Ledger 的同名欄位一樣是一起有一起沒有，取不到現價時全是 null。
  market_value: number | null;
  sell_fee: number | null;
  sell_tax: number | null;
  net_value: number | null;
  unrealized: number | null;
  unrealized_rate: number | null;
}

// 跨檔總覽的一列：一檔在一個帳戶裡的合計。
//
// 沒有逐筆的買進與賣出：總覽問的是「這一檔賺了多少、還剩多少」，
// 明細去 /ledger/reports/:symbol 看。
export interface LedgerSummaryRow {
  symbol: string;
  name: string;
  // 帳戶名稱。空字串代表這幾筆還沒填帳戶。
  account: string;
  // 這一檔在這個帳戶有幾筆買進、幾筆賣出。
  lots: number;
  sells: number;

  shares: number;
  cost: number;
  // 剩餘部位的每股平均成本。沒有部位時是 null，不是 0。
  avg_cost: number | null;
  // 策略帳已實現，broker_realized 是同一批賣出在 FIFO 下會認列的。
  realized: number;
  broker_realized: number;
  // 策略 − 券商。認列時間的差，全部出清後必然歸零。
  realized_diff: number;

  // 現價。null 代表這一檔這次取不到，下面那組跟著全是 null。
  price: number | null;
  price_source: PriceSource;

  market_value: number | null;
  sell_fee: number | null;
  sell_tax: number | null;
  net_value: number | null;
  unrealized: number | null;
  unrealized_rate: number | null;
}

// 一個帳戶底下的全部代號。
export interface LedgerSummaryGroup {
  account: string;
  // 依代號遞增。不照金額排：這是一本帳的索引，順序每次重整都該一樣。
  rows: LedgerSummaryRow[];
  // 這個帳戶的小計。accounts 固定是 1。
  totals: LedgerTotals;
}

// 跨檔的沖銷帳總覽。
//
// ⚠️ 合計橫跨不同股票，那是投組層級的加總，跟沖銷（同一檔之內的批次配對）
// 是兩件事：拿別檔的獲利去補這一檔的虧損，不會改變這一檔的任何一個數字。
export interface LedgerSummary {
  // 依帳戶名遞增，沒填帳戶的墊底。空陣列代表還沒開始記帳。
  accounts: LedgerSummaryGroup[];
  // 全部帳戶的合計，accounts 是去重後的帳戶數。
  totals: LedgerTotals;
  // 一共幾檔（去重）。
  symbols: number;
  // 有幾列因為取不到現價而沒有市值。不是 0 的話畫面要說明合計的未實現
  // 少算了那幾檔，否則使用者會以為總額就是全部。
  unpriced: number;
}

export interface LedgerReport {
  symbol: string;
  // 取最後一筆買進的名稱。完全沒有紀錄時是空字串。
  name: string;
  // 全站預設費率。個別帳戶實際生效的那一組在 accounts[].fees。
  fees: LedgerFees;
  // 逐帳戶的帳，依帳戶名遞增、未指定帳戶墊底。
  // 完全沒有紀錄時是空陣列——「還沒開始記」是正常狀態，不是錯誤。
  accounts: LedgerAccountBook[];
  // 全部帳戶的合計。只有一個帳戶時它等於那一本。
  totals: LedgerTotals;

  // 現價，兩本帳的市值都是拿它算的。
  // null 代表這次取不到——沖銷帳本身跟現價無關，取價失敗不會讓整份報表失敗。
  price: number | null;
  // 現價的來源。不是 TRADE 就代表這不是本次快照的成交價，畫面要標示出來。
  price_source: PriceSource;
  // 現價實際成交的時間，RFC3339。來源沒給時是空字串。
  price_as_of: string;
}

// 送出前的試算：同一張單在兩本帳裡各會變成什麼樣子。
export interface LedgerSellPreview {
  strategy: LedgerMatchedSell;
  broker: LedgerMatchedSell;
  realized_diff: number;
}

// 從自選股持股匯入的結果。
export interface LedgerImportResult {
  symbol: string;
  lots: LedgerLot[];
  // 有幾筆是拿持股表的建立時間當成交日的。持股表沒有成交日欄位，
  // 而沖銷順序完全靠成交日——不是 0 就要提醒使用者回去確認那幾筆的日期。
  dates_unknown: number;
  // 有幾筆的手續費是當成 0 匯進來的。持股表同樣沒有這一欄。
  fees_unknown: number;
}

// ===== 台股行事曆（/stocks/calendar）=====
//
// 一支端點回五組資料，來源有三種，語意不同，畫面上要分得出來：
//   1. 上游公告：休市日、除權息預告。
//   2. 已落地的紀錄：法說會（從重大訊息撈——兩個交易所都沒有法說會資料集）。
//   3. 規則推算：期貨結算日、財報申報期限。這兩種要標明「以主管機關公告為準」。

// 一個非交易日，或提醒用的交易日。
export interface MarketHoliday {
  date: string;
  // 例如「中華民國開國紀念日」。
  name: string;
  // 上游給的中文星期（「四」）。
  weekday: string;
  // 例如「依規定放假1日。」，可能是空字串。
  description: string;
  // ⚠️ 這份清單不全是休市日：它同時標出「農曆春節前最後交易日」這種**有交易**的
  // 提醒日。把 trading 為 true 的畫成休市會讓人以為那天不能下單。
  trading: boolean;
  // 市場無交易、僅辦理結算交割作業。那幾天不能買賣，但券商照樣扣款交割。
  settlement_only: boolean;
}

// 期貨／選擇權的月結算日。
//
// ⚠️ 推算值：期交所沒有未來結算日的資料集，這是照「第三個星期三」算出來的。
export interface SettlementDay {
  date: string;
  // 目前只有 MONTHLY。週選擇權每週三都結算，列進來會塞滿行事曆。
  kind: 'MONTHLY' | 'WEEKLY';
  // 第三個星期三遇休市而順延過。true 的話特別需要用期交所公告確認。
  shifted: boolean;
}

// 除權除息預告表的一列。上游只有接下來會發生的，沒有歷史。
export interface ExRightPreview {
  // 除權息交易日。這一天開盤價會扣掉權值，不是跌停。
  date: string;
  symbol: string;
  name: string;
  market: Market;
  kind: 'DIVIDEND' | 'RIGHT' | 'BOTH';
  // 每股現金股利（元）。null 是「這次沒配現金」而不是 0 元。
  cash_dividend: number | null;
  // 每股無償配股率，單位是「每一股配幾股」不是元（0.032 代表每千股配 32 股）。
  // 跟現金股利擺在一起很容易誤讀，畫面要標單位。
  stock_dividend_ratio: number | null;
  // 現金增資認購價（元）。多數是 null。
  subscription_price_per_share: number | null;
  // 這一檔在自選股清單裡。全市場一次一百多檔，靠這一欄把自己那幾檔排前面。
  watched: boolean;
}

// 一場法人說明會。
//
// ⚠️ 來源是**重大訊息**：兩個交易所的 OpenAPI 都沒有法說會資料集。主旨是自由文字，
// 所以 event_date 解不出來時是空字串，那時只顯示公告日與主旨原文。
export interface InvestorConference {
  // 公告時間，RFC3339。這一定有。
  announced_at: string;
  // 法說會實際舉行的日期。解不出來時是空字串。
  event_date: string;
  symbol: string;
  name: string;
  market: Market;
  // 重大訊息的主旨原文。
  subject: string;
  watched: boolean;
}

// 財報或營收的法定申報期限。
//
// ⚠️ 推算值，只涵蓋一般業。台灣的財報申報是法規統一期限而不是逐檔公告，
// 某一家實際哪天公布由它自己的董事會決定。
export interface FinancialDeadline {
  date: string;
  label: string;
  note: string;
}

export interface MarketCalendar {
  from: string;
  to: string;

  // 五組各自可能是空陣列，空的意思不一樣：休市日空代表這段期間沒有假日，
  // 除權息空代表沒有公司在這段期間除權息（旺季在 6～8 月），
  // 法說會空多半是那幾天剛好沒有公司公告。
  holidays: MarketHoliday[];
  settlements: SettlementDay[];
  ex_rights: ExRightPreview[];
  conferences: InvestorConference[];
  deadlines: FinancialDeadline[];

  // 自選股有幾檔。0 代表清單是空的，那時所有 watched 都是 false——
  // 畫面要能區分「沒有自選股」與「這段期間都沒中」。
  watchlist: number;
  // 這次取不到的來源，key 是來源名稱、value 是原因。空物件代表全部拿到了。
  //
  // 一定要顯示：某一區塊是空的可能是「本來就沒有」，也可能是「上游掛了」，
  // 兩者長得一樣，但後者使用者會想重新整理。
  failures: Record<string, string>;
}

// ===== 研究報告（/reports、/docs）=====

// docs/ 底下的一篇報告。內容是一整頁做好的 HTML，前端只列目錄不 render 內容。
export interface Report {
  // 對外路徑，例如 /docs/market/lead-lag.html。要接上 API_BASE 才是完整網址。
  path: string;
  // 取自 HTML 的 <title>。後端抓不到時會退回檔名，不會是空字串。
  title: string;
  // 檔案所在的子目錄（maps／market／audit／design），中文分類名由前端決定。
  // 直接放在 docs/ 底下的檔案是空字串。
  category: string;
  // 檔案最後修改時間，RFC3339。報告是 commit 進 repo 的靜態檔，
  // 沒有「資料日期」可言，這是唯一問得出來的時間。
  updated_at: string;
}

export interface ReportCatalog {
  count: number;
  items: Report[];
  // 人工整理的總目錄（docs/index.html），有分類說明與每篇摘要。
  // 檔案不存在時是空字串。
  index_path: string;
}

// ===== 總經指標（/macro）=====
//
// 影響台股但不屬於台股的外部指標：VIX、布蘭特原油、Fed 升息機率與美國經濟統計。
//
// 路徑前綴是 /macro 不是 /stocks/macro：這幾支的標的不是台股，
// 掛在 /stocks 底下會讓「查一檔股票」跟「查全球風險胃納」看起來是同一組東西。
//
// ⚠️ 四組端點的資料性質完全不同，畫面不要用同一種語氣呈現：
//   - indicators 是觀測值，上游給什麼就是什麼
//   - economy 是官方統計的轉述，未經加工，但永遠是回頭看的（上個月、上一季）
//   - rates 是**推算值**，由聯邦基金期貨反推，依賴一組假設（assumptions 要照著標）
//   - meetings 是行事曆，不會過時到出錯，但它是手動維護的表（stale 要提示）
//
// ⚠️ 這幾個指標的「上漲」都不是好消息，不能套台股漲紅跌綠的直覺：
// VIX 上升＝恐慌升高、布蘭特上升＝輸入型通膨壓力。所以畫面用中性色＋文字講方向。

/** 一個總經指標的當下報價。 */
export interface MacroIndicator {
  // 上游的 ticker，例如 ^VIX、BZ=F。留著讓人能自己去對一次價。
  symbol: string;
  name: string;
  // 單位。VIX 是無單位的指數（空字串），布蘭特是 USD/bbl。
  unit: string;

  // 現價。null 代表取不到，不是 0——這兩個指標的 0 都是不可能的值。
  price: number | null;
  previous_close: number | null;
  change: number | null;
  change_percent: number | null;

  week_high_52: number | null;
  week_low_52: number | null;
  // 現價落在 52 週區間的位置（0~100）。
  //
  // VIX 唯一有意義的讀法：「VIX 15.8」沒有資訊，
  // 「落在 52 週區間的 11%，接近一年來最平靜」才有。
  percentile_in_52_week: number | null;

  // 報價時間，RFC3339。
  //
  // ⚠️ 一定要顯示：美股與紐約商品交易所收盤時台灣是清晨，台灣人盤中看到的
  // 永遠是昨晚的收盤價。不標時間會被讀成即時值。
  as_of: string;
}

export interface MacroIndicators {
  count: number;
  items: MacroIndicator[];
}

/** 一個總體經濟指標。 */
export interface EconomicIndicator {
  // 上游的序列代號（FRED），例如 UNRATE。留著讓人能自己去對一次數字。
  id: string;
  name: string;
  unit: string;

  // 數值。是區間時這裡是上緣。
  value: number;
  // 區間下緣。只有政策利率有，其他都是 null。
  value_low: number | null;
  // 直接可以印的字串：「3.50% ~ 3.75%」「4.1%」。
  // 後端算好而不是前端組：區間與單點的組法不同，各寫一次一定有人漏掉區間那種。
  display: string;

  // 參考期間的人話說法：「2026 年 6 月」「2026 Q2」。
  //
  // ⚠️ 必須顯示。這一組數字**永遠是回頭看的**——失業率是上個月的、
  // GDP 是上一季的、PCE 有兩個月的延遲。不標期間會被讀成當下的數字。
  period: string;
  // 參考期間的起點，YYYY-MM-DD。不是發布日。
  as_of: string;
}

export interface Economy {
  count: number;
  items: EconomicIndicator[];
  // 資料來源。這一組是原封不動轉述官方統計，跟自己算的升息機率可信度不同。
  source: string;
}

/** 一種可能的決策結果與它的機率。 */
export interface RateOutcome {
  // 調整幾碼。正數升息、0 不動、負數降息。
  steps: number;
  // 對應的基點數，等於 steps × 25。
  change_bps: number;
  // 給畫面直接用的說法：「升 1 碼」「不動」「降 1 碼」。
  label: string;
  // 機率（%）。
  probability: number;
}

/** 對某一次 FOMC 會議的定價。 */
export interface RateExpectation {
  // 決策公布日，YYYY-MM-DD。
  meeting_date: string;
  // 這次是否附經濟預測摘要（點陣圖）與主席記者會。有的那四次市場反應通常大得多。
  has_projection: boolean;

  // 會議前後的隱含 EFFR（%）。
  rate_before: number;
  rate_after: number;
  // 隱含變動基點數。
  //
  // ⚠️ 這是期望值不是任何一種結果：「+12.5bp」的意思是「一半機率升一碼」，
  // 不是「會升 0.5 碼」。畫面上要嘛顯示機率、要嘛把這個數字講成「隱含」。
  change_bps: number;

  // 三個方向的總機率（%）。
  hike_probability: number;
  hold_probability: number;
  cut_probability: number;

  // 逐格的機率，由大到小。相加為 100（四捨五入後可能是 99.99）。
  outcomes: RateOutcome[];

  // 反推所用的期貨合約，例如 ZQU26.CBT。
  // 推算值一定要留得下驗證的路——拿這個代碼去 Yahoo 查得到同一個價格。
  contract_symbol: string;
}

export interface RateExpectationSnapshot {
  // 計算日，YYYY-MM-DD。
  date: string;
  // 當下的有效聯邦基金利率（%），來自 FRED。整條推算的起點。
  current_effr: number;
  // 目標區間上緣（%）。只為顯示，不參與計算。
  target_upper: number;

  // 由近到遠的各次會議定價。
  //
  // ⚠️ 越後面的越不可靠：每一次的會前利率是前一次算出來的會後利率，
  // 誤差會一路累積，而且遠月合約成交稀疏。
  expectations: RateExpectation[];

  // 內建 FOMC 日程涵蓋到哪一天。日程表是寫死的（Fed 沒有提供 API），
  // expectations 比預期少時對照這一欄就看得出是表該更新了，而不是市場沒在定價。
  schedule_through: string;

  // 資料來源，讓人看得出這個數字是自己算的、不是抄來的。
  source: string;
  // 推算所依賴的假設。
  //
  // 這一欄不是裝飾：這幾個數字是推算值，不標假設就會被當成 Fed 的官方預告。
  // 要放在機率旁邊，不要收進「關於」區。
  assumptions: string[];
}

/** 某一天對某次會議的定價。 */
export interface MeetingTrendPoint {
  date: string;
  hike_probability: number;
  hold_probability: number;
  cut_probability: number;
  implied_rate: number;
}

/**
 * 一次會議的機率走勢。
 *
 * 這支才是那份歷史真正的用途：單看今天的機率是一個沒有脈絡的數字，
 * 看它在 CPI 公布前後從 30% 跳到 70%，才讀得出市場在反應什麼。
 */
export interface MeetingTrend {
  meeting_date: string;
  count: number;
  points: MeetingTrendPoint[];
}

/** 一次會議的決策聲明（英文原文）。 */
export interface FOMCStatement {
  // 決策公布日（美東），YYYY-MM-DD。對得上 FOMCMeeting.end 與 RateExpectation.meeting_date。
  meeting_date: string;
  // 新聞稿發布時刻，RFC3339（台北時區）。台灣人看到的是凌晨兩三點。
  released_at: string;

  // 新聞稿標題（英文原文）。
  title: string;
  // 聲明全文，一段一個元素，**英文原文**。
  //
  // ⚠️ 後端刻意不翻譯也不摘要，畫面也不要加：市場在意的是「somewhat elevated」
  // 變成「elevated」這種一兩個字的差異，翻譯或摘要一定會把那個差異抹平，
  // 而抹平之後看起來仍然很像原文，沒有人會發現。
  paragraphs: string[];

  // 官方原文網址。解析壞掉時使用者點得到原文，不必相信我們解出來的內容。
  url: string;
  // 會議紀要網址。紀要在會後三週才公布，所以最近一次一定是空字串——那不是漏抓。
  minutes_url: string;
}

export interface FOMCStatementList {
  count: number;
  items: FOMCStatement[];
  source: string;
}

/** 一次 FOMC 會議。 */
export interface FOMCMeeting {
  // 會期首日與末日，都是**美東日期**，不轉台北——FOMC 的「9 月會議」指的是
  // 美東的 9/15-9/16，轉成台北會變成 9/16-9/17，跟財經媒體與 Fed 官網對不起來。
  start: string;
  end: string;

  // 決策公布時刻的台北時間，RFC3339。
  //
  // 這一欄才回答「台股哪一天開盤會反應」——美東 14:00 對台北是隔天凌晨 2、3 點
  // （夏令時間差一小時），公布時台股已經收盤，要到再下一個交易日才反應得到。
  // 系統缺時區資料庫時是空字串，顯示破折號即可。
  announcement_at_tw: string;

  // 這次是否附經濟預測摘要（SEP，即市場說的點陣圖）與主席記者會。
  // 一年八次裡有四次有，市場反應通常大得多。
  has_projection: boolean;

  // 距離決策公布還有幾個日曆天。會期中是 0。
  days_until: number;
  // 是否正在開會（首日已過、決策未公布）。
  in_progress: boolean;

  // 可以直接印的說法：「2026 年 9 月 16 日（附點陣圖）」。
  // 後端組而不是前端拼：「附點陣圖」漏掉的話，四次大場會議會被看成跟另外四次一樣。
  label: string;
}

export interface FOMCSchedule {
  count: number;
  items: FOMCMeeting[];
  // 最近一次還沒公布決策的會議。沒有時是 null。
  // 跟 items[0] 是同一筆，重複帶是因為九成的畫面只要這一筆。
  next: FOMCMeeting | null;

  // 這份日程涵蓋到哪一天。
  schedule_through: string;
  // 這份表是不是快用完了（剩不到半年）。
  //
  // ⚠️ 為 true 時畫面要提示：這份表也是升息機率的輸入，
  // 表過期時 /macro/rates 會跟著算不出遠月的機率。
  stale: boolean;

  source: string;
}

// ===== 排程清單（/schedules）=====
//
// 這個專案有哪些排程、幾點跑、在做什麼、有沒有真的掛上。
//
// ⚠️ 回的是「專案定義了哪些排程」，不是「launchd 現在的狀態」。後端讀的是
// deploy/launchd 底下的 plist 樣板，所以新增一支排程就會自己出現在這裡。

export interface ScheduleRun {
  // 0 是星期日、6 是星期六，跟 JavaScript 的 Date.getDay() 一致。
  weekday: number;
  weekday_name: string;
  hour: number;
  minute: number;
  // HH:MM，直接顯示用。
  time: string;
}

export interface Schedule {
  // launchd 的識別，例如 com.webook.exhibition-collect。
  label: string;
  // JOB（到點跑一次）或 DAEMON（常駐服務，沒有時刻表）。
  kind: string;
  // 一句話說明，取自 plist 樣板開頭註解的第一行。
  summary: string;
  // 完整的樣板註解。裡面通常寫著「為什麼是這個時間」與「漏跑會怎樣」——
  // 那是判斷一支排程壞掉要不要緊的依據。
  description: string;
  // 人話版時刻表：「週一至週五 09:30」。
  cadence: string;
  runs: ScheduleRun[];
  // 下一次觸發，RFC3339（台北時間）。常駐服務是空字串。
  //
  // ⚠️ 不管國定假日——launchd 也不管，那天照樣會跑，只是上游沒有新資料。
  next_run_at: string;
  // 這支排程實際帶的旗標。
  args: string[];

  // ~/Library/LaunchAgents 底下有沒有這一支。
  //
  // ⚠️ 是「檔案在不在」不是「真的會跑」。false 多半是刻意的（還在做，或還沒決定
  // 要不要自動跑），所以沒掛上的不該在畫面上亮紅燈。
  installed: boolean;
  // launchd 現在認不認得這一支。installed 是 true 而這裡是 false，
  // 代表 plist 放好了但沒註冊——那支排程一次都不會跑，而且從檔案上看不出來。
  loaded: boolean;
  // 正在跑的行程編號，沒在跑是 null。
  running_pid: number | null;
  // 上一次結束的離開碼：0 成功、非 0 那次有東西沒做完、
  // null 是從沒跑過或剛重新註冊過。⚠️ 只有「上一次」沒有歷史。
  last_exit_code: number | null;
  // 掛上了、載入了、上一次不是失敗。
  healthy: boolean;
}

export interface ScheduleList {
  count: number;
  // 其中已經掛上的有幾支。
  installed: number;
  // 其中看起來有問題的有幾支：掛上了但沒載入，或上一次是失敗的。
  unhealthy: number;
  // 排程，下一次觸發早的排前面；常駐服務排最後。
  items: Schedule[];
}

// ===== 世界股市指數（/markets/indices）=====
//
// 日股、韓股、美股的收盤看板。台股開盤前最想知道的就是這一組。
//
// ⚠️ 這是**收盤值不是即時報價**，而且三個市場的日期本來就不同步：台北時間週三下午
// 看這個看板，日韓是週三收盤、美股是週二收盤——那是正確的，不是漏收。
// 所以每一列的 date 一定要顯示出來。

/** 市場別。美國有三支指數，所以這個值會重複出現。 */
export type WorldMarket = 'JP' | 'KR' | 'US';

export interface WorldIndex {
  market: WorldMarket | string;
  // 上游的 ticker，例如 ^N225。留著讓人能自己去對一次價。
  symbol: string;
  name: string;

  close: number;
  // 只收到一根日 K 時是 null。
  //
  // null 代表「算不出來」不是 0——顯示成 0.00% 會被讀成「今天平盤」。
  previous_close: number | null;
  change: number | null;
  change_percent: number | null;

  // 這一筆是哪一個交易日的收盤，YYYY-MM-DD。⚠️ 必須顯示，見上面的說明。
  date: string;
}

export interface WorldIndices {
  count: number;
  items: WorldIndex[];
}

// ===== 展覽檔期（/stocks/exhibitions）=====
//
// 台灣的大型專業展：半導體、電腦、機器人、顯示。兩個上游合併（南港展覽館的展會 API
// 與外貿協會的檔期表），不分主辦單位。
//
// ⚠️ 只有日期沒有時間。南港那支其實有時分，但幾乎每一筆都是 10:00~18:00——
// 那是展館的制式時段而不是各展真正的開放時間，照抄會是假的精確。每天幾點開放看 url。

export type ExhibitionStatus = 'SCHEDULED' | 'ONGOING' | 'ENDED';

export interface Exhibition {
  name: string;
  // 展期第一天與最後一天，YYYY-MM-DD。最後一天當天仍在展。
  start_date: string;
  end_date: string;
  // 展期幾天，含頭尾。
  days: number;
  status: ExhibitionStatus;
  // 距離開展還有幾天。已經開展（含當天）是 null 而不是 0——
  // 「今天開展」跟「已經展到第三天」是兩件事。
  days_until: number | null;
  // 分類，一檔可以同時屬於多類：semiconductor／computer／robot／display／other。
  //
  // ⚠️ 這是照展覽名稱的關鍵字貼的標籤，不是上游給的分類。台灣機器人與智慧自動化展
  // （TAIROS）跟自動化工業大展同場同期，上游只列後者，所以 robot 那一類看到的是
  // 「台北國際自動化工業大展」。
  categories: string[];
  // 展館，可能不只一個（COMPUTEX 一次用四個場館）。
  venues: string[];
  // 官網。上游對自己主辦的展只給站內連結，那種情況是空字串。
  url: string;
  // 簡介，來自貿協那一份（已被上游截斷），多數是空字串。
  description: string;
  // 主辦單位，只有南港那支給，其餘是空字串。
  organizer: string;
  // 這一列來自哪幾個上游：tainex（南港展覽館）、taiwantradeshows（貿協）。
  //
  // 兩邊對同一檔展給的日期不一定一樣（國際半導體展貿協寫 8/31 起、南港寫 9/2 起，
  // 差的兩天是同期論壇），後端取的是南港的。
  sources: string[];
}

export interface ExhibitionList {
  count: number;
  // 檔期，開展日由近到遠。
  items: Exhibition[];
}

// ===== 集保股權分散：大戶與散戶持股（/stocks/shareholding）=====
//
// ⚠️ 這是**持股比例（存量）**不是**買量（流量）**。某一週大戶比例上升，代表週末
// 那個時點大戶手上的股數變多，但看不出是誰賣給他的、也看不出中間來回買賣過幾次。
// 「大戶今天買了幾張」這份資料答不出來。
//
// ⚠️ 週資料不是日資料，一週一筆（資料日期通常是週五）。要跟股價對照的話，
// 股價那條要先降頻成週，不要跟日 K 疊在同一個時間軸上。

// 分級 1~15 的原始人數與股數。上游定義的股數區間，不是我們分的。
export interface ShareholdingLevel {
  level: number;
  holders: number;
  shares: number;
}

// 某一週的股權分散。
export interface ShareholdingWeek {
  // 資料日期＝**該週基準日**（通常是週五），不是公布日——那一份實際上要到
  // 下週一至週三才拿得到。畫面上寫「資料日期」不要寫「更新於」。
  date: string;

  // 大戶（≥400 張）、千張大戶（≥1,000 張）、散戶（≤50 張）佔集保庫存的 %。
  //
  // ⚠️ 大戶 + 散戶 ≠ 100%：中間還有 50～400 張那一段（中實戶）。
  // 不要做成堆疊長條或圓餅，那會讓人以為兩者互補。
  //
  // null 代表那一檔那一週沒有集保庫存資料，顯示破折號。
  big_holder_ratio: number | null;
  thousand_lot_ratio: number | null;
  retail_ratio: number | null;

  // 跟**前一週**相比的增減，單位百分點。
  //
  // null 代表「沒有前一週可以比」——最舊那一筆一定是 null，資料剛開始收集時
  // 每一筆都是 null。畫面要顯示破折號，顯示 0.00 會被讀成「這週沒變」，
  // 意思完全相反。
  big_holder_change: number | null;
  thousand_lot_change: number | null;
  retail_change: number | null;

  // 大戶、千張大戶、散戶各自合計持有幾股。null 的意思同上面的比例欄位。
  big_holder_shares: number | null;
  thousand_lot_shares: number | null;
  retail_shares: number | null;

  // 跟前一週相比增減幾股。
  //
  // ⚠️ 這是**淨變化的存量差，不是成交量**。「大戶這週多了 300 張」的意思是週末
  // 那個時點大戶手上多了 300 張，中間可能來回買賣過好幾次，也看不出賣方是誰。
  // 集保只公布每週的持股分佈，台灣沒有免費的大戶逐筆買賣資料。
  //
  // 為什麼要看這一組而不是只看比例的百分點：比例的分母（集保庫存總股數）會變動
  // ——新股上市、實體股票匯入都會讓分母變大，此時大戶就算一張沒賣，比例也會下降。
  // 股數差沒有這個問題，「他們到底有沒有買」要看這一組。
  //
  // 最舊那一筆是 null 而不是 0（沒有前一週可比）。
  big_holder_shares_change: number | null;
  thousand_lot_shares_change: number | null;
  retail_shares_change: number | null;

  // 股東總人數，以及跟前一週的增減（人）。change 為 null 的意思同上。
  total_holders: number;
  holders_change: number | null;

  // 集保庫存總股數。
  //
  // ⚠️ **不是發行股數**：不含未匯入集保的實體股票與海外存託憑證，會略小於發行
  // 股數。不要拿它去算市值或週轉率，會高估。它的唯一用途是當比例的分母。
  total_shares: number;
  // 平均每人持有幾張。
  average_lots: number | null;

  levels: ShareholdingLevel[];
}

export interface ShareholdingHistory {
  symbol: string;
  count: number;
  // 逐週，日期由新到舊。
  items: ShareholdingWeek[];
}

// ===== 財報摘要與 ROE（/stocks/financial）=====

// 一季的財報摘要。
//
// ⚠️ 金額欄位是「累計數」不是單季：quarter 為 2 的那一列指的是上半年
// （台積電 2026Q2 的 eps 是 49.33，那是半年的），所以 roe 也是累計的。
export interface FinancialStatement {
  symbol: string;
  name: string;
  market: Market;
  // 西元年、季別 1～4，period 是兩者合起來的標示（例如 2026Q2）。
  year: number;
  quarter: number;
  period: string;
  // 上游出表日期，是「這份內容哪天產出」不是財報基準日。
  report_date: string;

  // 累計稅後淨利，只取歸屬於母公司業主的部分，單位仟元。ROE 的分子。
  net_income: number;
  // 歸屬於母公司業主之權益合計，單位仟元。ROE 的分母。
  //
  // 分子分母跟著比率一起回，畫面才解釋得了 ROE 是拿什麼算的。
  equity: number;
  // 基本每股盈餘、每股參考淨值，單位元。null 是上游沒給，不是 0。
  eps: number | null;
  book_value_per_share: number | null;

  // 累計股東權益報酬率（%）＝ 累計淨利 ÷ 期末權益 × 100。
  // null 代表算不出來（負淨值）——那時虧損公司會算出「正的」ROE，比破折號更誤導人。
  roe: number | null;
  // 年化 ROE（%）＝ roe × 4 ÷ quarter。
  //
  // ⚠️ 這是推估不是實績：獲利有季節性的公司（旺季在下半年）用上半年推會低估，
  // 所以畫面上要跟累計值與期間一起顯示。
  annualized_roe: number | null;
}

export interface FinancialHistory {
  symbol: string;
  count: number;
  // 逐季，年季由新到舊。
  items: FinancialStatement[];
}

// 全市場 ROE 排行的一列：財報摘要再加一個名次。
export interface FinancialRankItem extends FinancialStatement {
  // 名次，1 起算。是「這一次查詢的母體」裡的名次——有指定 market 就是那個市場的。
  // min_roe 不影響名次，門檻篩掉的是排序後的尾端。
  rank: number;
}

export interface FinancialRanks {
  // 實際查的那一季。全部是 0 與空字串代表這張表還沒有任何資料。
  year: number;
  quarter: number;
  period: string;
  // total 這一季收集到的家數，ranked 其中算得出 ROE 的家數（名次的分母），
  // count 實際回了幾筆（套用 min_roe 與 limit 之後）。
  //
  // 三個都要顯示，畫面才講得出「1,824 家裡有 1,791 家排得出名次，這裡列前 50 名」。
  // total − ranked 就是負淨值排不進榜的家數。
  total: number;
  ranked: number;
  count: number;
  items: FinancialRankItem[];
}

// 族群裡一家公司的 ROE。
export interface FinancialPeer {
  // 族群內的 ROE 名次，1 起算。算不出 ROE 的（沒財報、負淨值）是 0。
  rank: number;
  symbol: string;
  // 公司簡稱。沒有那一季財報時是空字串——族群表只存代號。
  name: string;
  // 那一季的財報摘要。null 代表這一檔沒有那一季的資料：金融業（不在上游的
  // 一般業報表裡）、還沒申報、或族群裡的代號打錯，三種分不出來，都該是破折號。
  statement: FinancialStatement | null;
}

export interface FinancialGroupPeers {
  group_id: string;
  group_name: string;
  // 這份比較的年季。全族群固定同一季，不各取各的最新一季——
  // 那會變成拿上半年的 ROE 比第一季的 ROE。
  year: number;
  quarter: number;
  period: string;
  // ranked 排得出 ROE 的家數（名次的分母），count 是成員總數。
  ranked: number;
  count: number;
  // 成員，ROE 由高到低；算不出 ROE 的排最後。
  peers: FinancialPeer[];
}

export interface FinancialPeers {
  symbol: string;
  count: number;
  // 這一檔所屬的每一個族群。一檔可以屬於多個（中美晶既是矽晶圓也是太陽能）。
  groups: FinancialGroupPeers[];
}
