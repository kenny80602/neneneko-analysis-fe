import request from './request';
import {
  AddHoldingResult,
  ApiResponse,
  Holding,
  PortfolioRow,
  RemoveHoldingResult,
  RemovePositionResult,
  UpdatePositionResult,
} from './types';

// PortfolioHandler — /portfolio，自選股與持股試算。
// 增刪跟 LINE 聊天室的「/加 2330」走同一個 service，兩邊操作的是同一份全域清單。

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

// 加入自選股。只送代號，名稱與市場由後端向報價來源確認後決定。
//
// 代號不存在會 404、格式不對會 400，兩種都會 throw。
// 但「這一檔本來就在清單裡」不是錯誤：那會正常回傳且 already_exists 為 true，
// 呼叫端要自己判斷這一欄，否則使用者重複加同一檔會以為加成功了。
export const addHolding = (symbol: string) =>
  request
    .post<ApiResponse<AddHoldingResult>>('/portfolio/holdings', { symbol })
    .then((res) => res.data.data);

// 從自選股移除某一檔的所有列（同一檔可能有多列）。
//
// 清單裡本來就沒有這一檔時回 removed=0 而不是 404，所以重複刪不會噴錯。
export const removeHolding = (symbol: string) =>
  request
    .delete<ApiResponse<RemoveHoldingResult>>(`/portfolio/holdings/${symbol}`)
    .then((res) => res.data.data);

// 填上某一列的成本與股數。id 取自 getHoldings 的每一列。
//
// ⚠️ 這是整組部位覆寫，不是部分更新：null 代表「清掉那個值」而不是「不要動」，
// 所以只想改股數時，原本的成本也要一起送回來，否則成本會被清掉。
// 用 id 而不是代號，因為同一檔可能有多列（分批買、成本不同）。
//
// 成本或股數送 0 以下會 400——沒有值請送 null，那才是「不知道」的正確表達；
// 成本填 0 會讓損益算出 -100%。那一列不存在回 404。
export const updateHoldingPosition = (
  id: string,
  cost: number | null,
  shares: number | null,
  account = ''
) =>
  request
    .put<ApiResponse<UpdatePositionResult>>(`/portfolio/positions/${id}`, {
      cost,
      shares,
      account,
    })
    .then((res) => res.data.data);

// 為「已經在自選股清單裡」的一檔再加一筆部位。
//
// 同一檔可以有好幾筆：分批買，或分散在不同券商帳戶，各自有自己的股數與成本。
// 這一支刻意不驗證代號（加入清單時已經驗過），所以即時報價掛掉時照樣加得了部位；
// 但代號不在清單裡會回 404，要先用 addHolding 把它加進自選股。
export const addPosition = (
  symbol: string,
  cost: number | null,
  shares: number | null,
  account = ''
) =>
  request
    .post<ApiResponse<Holding>>('/portfolio/positions', { symbol, cost, shares, account })
    .then((res) => res.data.data);

// 刪掉單獨一筆部位。同一檔的其他筆（其他帳戶）不受影響。
// 要把整檔從自選股移除請用 removeHolding。
export const removePosition = (id: string) =>
  request
    .delete<ApiResponse<RemovePositionResult>>(`/portfolio/positions/${id}`)
    .then((res) => res.data.data);

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
