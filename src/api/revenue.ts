import request from './request';
import { ApiResponse, HistoryParams, RevenueHistory } from './types';

// RevenueHandler — /stocks/revenue，公司每月營業收入。
// 全市場都有落地，不限自選股；金額單位為新台幣千元。
// from / to 一樣收 YYYY-MM-DD，但比對的是月份：from 落在哪個月，那整個月都包含進來。
export const getRevenueHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<RevenueHistory>>(`/stocks/revenue/${symbol}`, { params })
    .then((res) => res.data.data);
