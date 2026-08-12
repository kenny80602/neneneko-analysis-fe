import request from './request';
import { ApiResponse, Holding, PortfolioRow } from './types';

// PortfolioHandler — /portfolio，自選股與持股試算。
// 增刪主要走 LINE 聊天室（「加 2330」），這裡目前只開讀取與試算。

// 試算與推播的逾時。這兩支要逐檔去取即時報價、半年日 K 與 EPS，
// 二十幾檔跑下來實測熱機約 10 秒，冷啟動（Yahoo 要先換 crumb 與 cookie）會超過
// request.ts 的預設 20 秒而被判成「無法連線到伺服器」，所以單獨放寬。
const VALUATION_TIMEOUT_MS = 60000;

// 列出自選股，依顯示順序排。only_enabled 只回啟用中的列。
export const getHoldings = (onlyEnabled?: boolean) =>
  request
    .get<ApiResponse<Holding[]>>('/portfolio/holdings', {
      params: { only_enabled: onlyEnabled },
    })
    .then((res) => res.data.data ?? []);

// 持股試算：逐檔取即時行情、半年最高與 EPS，現算回檔幅度、建議買入區間與四個本益比。
// 純讀，想看幾次看幾次。單一檔失敗不影響其他列，那一列以 error 欄說明原因。
export const getPortfolioValuation = () =>
  request
    .get<ApiResponse<PortfolioRow[]>>('/portfolio/valuation', { timeout: VALUATION_TIMEOUT_MS })
    .then((res) => res.data.data ?? []);

// 試算後推播到 LINE，回傳這次推播的內容。
// ⚠️ 會真的送出訊息並吃掉 LINE 計費額度（按送達人數計，推到 5 人群組就扣 5 則），
// 畫面上務必做二次確認再呼叫。
export const notifyPortfolio = (format: 'FLEX' | 'TEXT' = 'FLEX') =>
  request
    .post<ApiResponse<PortfolioRow[]>>('/portfolio/notify', null, {
      params: { format },
      timeout: VALUATION_TIMEOUT_MS,
    })
    .then((res) => res.data.data ?? []);
