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
  seq: number;

  // 成交金額，未含費用。
  amount: number;
  fee: number;
  tax: number;
  net_proceeds: number;
  realized: number;

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

export interface LedgerReport {
  symbol: string;
  // 取最後一筆買進的名稱。完全沒有紀錄時是空字串。
  name: string;
  fees: LedgerFees;
  strategy: Ledger;
  broker: Ledger;
  reconcile: LedgerReconcile;
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
