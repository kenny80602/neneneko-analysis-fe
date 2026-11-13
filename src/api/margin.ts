import request from './request';
import {
  ApiResponse,
  HistoryParams,
  MarginByDate,
  MarginHistory,
  Market,
  MarketCredit,
  IndexKD,
  MarketMarginSummaries,
} from './types';

// MarginHandler — /stocks/margin，個股融資融券（上市上櫃合在一起，不必先知道在哪個市場）
// 與大盤合計。沒有 collect：個股那份跟著收盤行情一起收（POST /stocks/daily/collect），
// 大盤那份由另一支排程收（cmd/notify -collect-margin），上游要等當日晚間才公布。

export const getMarginHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<MarginHistory>>(`/stocks/margin/${symbol}`, { params })
    .then((res) => res.data.data);

// 不帶 date 時回目前收集到最新的那一天。
export const getMarginByDate = (date?: string) =>
  request
    .get<ApiResponse<MarginByDate>>('/stocks/margin', { params: { date } })
    .then((res) => res.data.data);

// 大盤（整個市場合計）的融資融券。兩個市場攤平在同一個陣列，日期由新到舊。
// 不帶 from／to 時後端回最近 90 天；只要最新狀況的話取前兩筆即可。
export const getMarketMarginSummaries = (params?: { from?: string; to?: string }) =>
  request
    .get<ApiResponse<MarketMarginSummaries>>('/stocks/margin/summaries', { params })
    .then((res) => res.data.data);

// 大盤信用交易走勢：指數（上市＝加權、上櫃＝櫃買）、融資餘額、融券餘額、當日沖銷，日期由舊到新。
// market 預設 TWSE。當日沖銷只有上市有，上櫃的 offset_lots 一律是 null。
// 不帶 from／to 時後端回最近一年。只讀已落地的資料不打上游；空清單代表後端還沒收，
// 要先跑 cmd/notify 的 -backfill-margin 與 -backfill-market-index。
export const getMarketCredit = (params?: { market?: Market; from?: string; to?: string }) =>
  request
    .get<ApiResponse<MarketCredit>>('/stocks/margin/credit', { params })
    .then((res) => res.data.data);

// 指數（上市＝加權、上櫃＝櫃買）的 KD(9,3,3)，日期由舊到新。
// 路徑掛在 /credit 底下是因為「大盤信用交易」那一區本來就畫指數，後端沒有另開 handler。
// 日期軸是指數自己的交易日，上櫃的融資融券只有約半年也不影響 KD。
// 只讀已落地的資料不打上游；空清單代表指數日 K 還沒收。
export const getMarketIndexKD = (params?: { market?: Market; from?: string; to?: string }) =>
  request
    .get<ApiResponse<IndexKD>>('/stocks/margin/credit/kd', { params })
    .then((res) => res.data.data);
