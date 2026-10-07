import request from './request';
import { ApiResponse, StockScore, StockScores } from './types';

// StockScoreHandler — /stocks/scores，個股三面向評分（基本面／籌碼面／技術面）。
//
// 規則在後端（service/stock/stock_score.go），前端一個都不自己算：
// 門檻是估值判斷，前後端各寫一份，調整時一定會漏改一邊。
//
// 一次送一批代號（上限 40），回傳順序與傳入一致；沒資料的面向是 INSUFFICIENT，不是錯誤。
// 只讀 Mongo、不打上游，可以放心在榜單上每列都問。
export const SCORE_MAX_SYMBOLS = 40;

export const getStockScores = (symbols: string[]) =>
  request
    .get<ApiResponse<StockScores>>('/stocks/scores', {
      params: { symbols: symbols.slice(0, SCORE_MAX_SYMBOLS).join(',') },
    })
    .then((res): StockScore[] => res.data.data?.items ?? []);
