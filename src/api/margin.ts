import request from './request';
import {
  ApiResponse,
  HistoryParams,
  MarginByDate,
  MarginHistory,
  MarketCredit,
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

// 大盤信用交易走勢（上市）：加權指數、融資餘額、融券餘額、當日沖銷，日期由舊到新。
// 不帶 from／to 時後端回最近一年。只讀已落地的資料不打上游；空清單代表後端還沒收，
// 要先跑 cmd/notify 的 -backfill-margin 與 -backfill-market-index。
export const getMarketCredit = (params?: { from?: string; to?: string }) =>
  request
    .get<ApiResponse<MarketCredit>>('/stocks/margin/credit', { params })
    .then((res) => res.data.data);
