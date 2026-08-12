import request from './request';
import { ApiResponse, HistoryParams, MarginByDate, MarginHistory } from './types';

// MarginHandler — /stocks/margin，個股融資融券（上市上櫃合在一起，不必先知道在哪個市場）。
// 沒有 collect：融資融券跟著收盤行情一起收（POST /stocks/daily/collect）。

export const getMarginHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<MarginHistory>>(`/stocks/margin/${symbol}`, { params })
    .then((res) => res.data.data);

// 不帶 date 時回目前收集到最新的那一天。
export const getMarginByDate = (date?: string) =>
  request
    .get<ApiResponse<MarginByDate>>('/stocks/margin', { params: { date } })
    .then((res) => res.data.data);
