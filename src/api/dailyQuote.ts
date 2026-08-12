import request from './request';
import {
  ApiResponse,
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
