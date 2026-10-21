import request from './request';
import {
  ApiResponse,
  BelowMA,
  ChartPatterns,
  CollectResult,
  DailyQuoteByDate,
  DailyQuoteHistory,
  HistoryParams,
} from './types';

// DailyQuoteHandler — /stocks/daily，每日收盤行情（已收集落地的資料，可往回翻歷史）。
// 與 /stocks/realtime 的差別：那支是盤中即時價、不落地。

// 查單一檔的歷史收盤，日期由新到舊。涵蓋範圍是「自選股 × 已收集的交易日」，
// 沒收過的代號回空清單而不是 404。
export const getDailyQuoteHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<DailyQuoteHistory>>(`/stocks/daily/${symbol}`, { params })
    .then((res) => res.data.data);

// 偵測單一檔的 W 底與 M 頭（含已確認的歷史型態與目前形成中的）。讀已落地的日 K，不打上游。
// 後端是機械規則，結果是現況描述不是買賣訊號。limit 要跟畫面上 K 線載入的根數一致，
// 不然型態的日期會對不上圖；不帶時後端用 500 根，上限 1000。
export const getChartPatterns = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<ChartPatterns>>(`/stocks/daily/${symbol}/patterns`, { params })
    .then((res) => res.data.data);

// 查某一個交易日的全部收盤行情。不帶 date 時回目前收集到最新的那一天
// （用「今天」的話，假日與收集之前都會是空的，看起來像沒資料）。
export const getDailyQuotesByDate = (date?: string) =>
  request
    .get<ApiResponse<DailyQuoteByDate>>('/stocks/daily', { params: { date } })
    .then((res) => res.data.data);

// 立刻抓一次最近交易日的收盤行情並落地（順帶收三大法人、融資融券、估值）。
// 會打上游、會寫資料庫；同一天重跑是覆蓋而不是新增，補資料可以放心重跑。
export const collectDailyQuotes = () =>
  request
    .post<ApiResponse<CollectResult>>('/stocks/daily/collect')
    .then((res) => res.data.data);

// 掃描要逐檔讀 150 筆歷史，超過 request.ts 預設 20 秒就會被判成「無法連線到伺服器」，
// 所以單獨放寬。後端已並行讀取；這裡是檔數變多或資料庫變慢時的餘裕。
const BELOW_MA_TIMEOUT_MS = 60000;

// 收盤在季線（60 日均）以下的股票，離季線最遠的排最前面。
// 後端逐檔讀最近 60 個成交日，回應時間跟 daily_quotes 的檔數成正比，不要輪詢。
export const getBelowMA = () =>
  request
    .get<ApiResponse<BelowMA>>('/stocks/daily/below-ma', { timeout: BELOW_MA_TIMEOUT_MS })
    .then((res) => res.data.data);
