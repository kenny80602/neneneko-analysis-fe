import request from './request';
import { ApiResponse, HistoryParams, ValuationHistory } from './types';

// ValuationHandler — /stocks/valuation，個股每日本益比、殖利率與股價淨值比。
// 數值可能為 null（虧損算不出本益比、沒配息沒有殖利率），顯示破折號不要畫成 0。
export const getValuationHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<ValuationHistory>>(`/stocks/valuation/${symbol}`, { params })
    .then((res) => res.data.data);
