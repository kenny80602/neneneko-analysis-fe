import request from './request';
import { ApiResponse, MarketCalendar } from './types';

// CalendarHandler — /stocks/calendar，台股行事曆。
//
// 一支端點回五組資料（休市日、期貨結算日、除權息預告、法說會、財報期限），
// 而不是拆成五支讓這一層自己併：它們共用同一個區間與同一份自選股標記，
// 拆開的話畫面要發五個請求、自己對齊區間，還要決定五個載入狀態怎麼組合。
//
// 三種來源混在一起，語意不同（見 types.ts 的說明）：上游公告的、從已落地的
// 重大訊息撈的、照規則推算的。推算那兩種畫面上要標明「以主管機關公告為準」。

// 取一段期間的行事曆。兩端都含。
//
// 兩個參數都可以省略：後端預設今天起 60 天，上限一年（超過回 400）。
// 這一支會打兩個交易所的 OpenAPI，比其他讀取端點慢，不要輪詢。
export const getMarketCalendar = (params?: { from?: string; to?: string }) =>
  request
    .get<ApiResponse<MarketCalendar>>('/stocks/calendar', { params })
    .then((res) => res.data.data as MarketCalendar);
