import request from './request';
import { ApiResponse, ExhibitionList } from './types';

// ExhibitionHandler — /stocks/exhibitions，台灣的大型專業展檔期。
//
// 為什麼一個看台股的站要有展覽：半導體展、自動化展、COMPUTEX 前後是相關族群
// 最常被提起的時候，展前的拉貨與展中的發表都會反映在報價上。這一份回答的是
// 「什麼時候會有題材」，跟休市日那種「哪天不能交易」是兩回事。
//
// ⚠️ 分類是照展覽名稱的關鍵字貼的標籤，不是上游給的分類。畫面上不要寫成官方分類。

// 查展覽檔期，開展日由近到遠。
//
// 預設只回「還沒結束」的檔期（展期橫跨今天的那幾檔會留著），要看已經結束的帶
// include_past。category 可以逗號分隔多個：semiconductor／computer／robot／display／other，
// 帶不認得的值後端會回 400 而不是靜靜回空清單。
//
// 空清單有兩種可能而且分不出來：後端還沒收集過，或這段區間本來就沒有展。
export const getExhibitions = (params?: {
  category?: string;
  from?: string;
  to?: string;
  include_past?: boolean;
  limit?: number;
}) =>
  request
    .get<ApiResponse<ExhibitionList>>('/stocks/exhibitions', { params })
    .then((res) => res.data.data);
