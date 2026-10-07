import request from './request';
import { ApiResponse, HistoryParams, ValuationByDate, ValuationHistory } from './types';

// ValuationHandler — /stocks/valuation，個股每日本益比、殖利率與股價淨值比。
// 數值可能為 null（虧損算不出本益比、沒配息沒有殖利率），顯示破折號不要畫成 0。
export const getValuationHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<ValuationHistory>>(`/stocks/valuation/${symbol}`, { params })
    .then((res) => res.data.data);

// 全部代號的估值，不必逐檔問。不帶 date 時每一檔回「自己最新」的那筆（各筆日期可能不同）
// 而不是「最新那一天」：上市與上櫃上游日期常差一天，取單一日期會讓一個市場整批消失。
// 涵蓋範圍只有收集器落地的那批；pe_ratio 是 null 代表虧損算不出來，不是 0。
export const getValuationsByDate = (date?: string) =>
  request
    .get<ApiResponse<ValuationByDate>>('/stocks/valuation', { params: { date } })
    .then((res) => res.data.data);
