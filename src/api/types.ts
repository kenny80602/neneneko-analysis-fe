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
