import request from './request';
import {
  ApiResponse,
  HistoryParams,
  IndustryPeers,
  Market,
  RevenueHistory,
  RevenueRanks,
} from './types';

// RevenueHandler — /stocks/revenue，公司每月營業收入。
// 全市場都有落地，不限自選股；金額單位為新台幣千元。
// from / to 一樣收 YYYY-MM-DD，但比對的是月份：from 落在哪個月，那整個月都包含進來。
export const getRevenueHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<RevenueHistory>>(`/stocks/revenue/${symbol}`, { params })
    .then((res) => res.data.data);

// 同產業比較：這一檔的產業別、產業內月營收排名，以及同產業全部公司。
//
// 排名依「最新月份的單月營收」——那是目前唯一涵蓋全市場的數字。收盤價與本益比
// 只收自選股那幾檔，拿來排名會變成「自選股內排名」，不是產業排名。
//
// 回空結果是常態：剛上市、還沒公告當月營收，或這一檔不在月營收表裡。
export const getIndustryPeers = (symbol: string) =>
  request
    .get<ApiResponse<IndustryPeers>>(`/stocks/revenue/peers/${symbol}`)
    .then((res) => res.data.data);

// 某一個月全市場的營收排行。
//
// 五個參數都可以省略：month 是 YYYY-MM（不給就是目前收集到最新的那個月——
// 不預設「當月」是因為公司要到每月 10 日前才陸續公告，月初查當月只會拿到搶先
// 公告的那幾家），sort 是 yoy／mom／revenue，market 不給就兩個市場一起排，
// min_yoy 篩年增率（不論 sort 是哪一個都篩年增率），limit 預設 50、上限 500。
//
// 空清單不是錯誤：月初還沒有人公告的期間本來就是空的。
export const getRevenueRanks = (params?: {
  month?: string;
  sort?: RevenueRanks['sort'];
  market?: Market;
  min_yoy?: number;
  limit?: number;
}) =>
  request
    .get<ApiResponse<RevenueRanks>>('/stocks/revenue/ranks', { params })
    .then((res) => res.data.data);
