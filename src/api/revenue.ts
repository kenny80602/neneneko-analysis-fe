import request from './request';
import { ApiResponse, HistoryParams, IndustryPeers, RevenueHistory } from './types';

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
