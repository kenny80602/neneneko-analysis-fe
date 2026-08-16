import request from './request';
import {
  ApiResponse,
  Ledger,
  LedgerFees,
  LedgerImportResult,
  LedgerLot,
  LedgerMatchedSell,
  LedgerPick,
  LedgerReport,
  LedgerSellPreview,
  MatchRule,
} from './types';

// LedgerHandler — /ledger，自訂沖銷帳（LIFO／指定明細）。
//
// 資料存在後端的 ledger_lots 與 ledger_sells 兩張表，都是不可變的事件流：
// 只有新增與刪除，沒有更新。記錯的那一筆要刪掉重記——就地改會讓它後面每一筆的
// 沖銷結果跟著變，而使用者看不到那個連鎖反應。
//
// 沖銷算式整包在後端（internal/service/ledger/matcher.go），前端不要再算一份：
// 這個功能的產出就是「兩本帳的差額」，用兩份程式碼算出來的差額沒有意義。
// 剩餘股數、平均成本、已實現損益全部由 getLedgerReport 回傳，前端只負責顯示。

/** 送出賣出（或試算）時的請求內容。picks 為空代表整筆交給 fallback。 */
export interface SellPayload {
  symbol: string;
  /** 成交日 YYYY-MM-DD。 */
  trade_date: string;
  shares: number;
  price: number;
  picks: LedgerPick[];
  fallback: MatchRule;
}

// 目前生效的券商費率：手續費率、折數、最低收費、證交稅率。
//
// 前端拿它算「現在賣掉會被扣多少、淨損益是多少」，**不要自己寫死費率**——
// 定義只有後端那一份，折數與最低收費各家券商不同，在後端 .env.json 調整
// （BROKER_FEE_DISCOUNT／BROKER_FEE_MINIMUM）。
//
// 費率其實不只沖銷帳在用（「我的持股」也吃它），端點掛在 /ledger 下面
// 只是因為設定放在那個 service。
export const getBrokerFees = () =>
  request.get<ApiResponse<LedgerFees>>('/ledger/fees').then((res) => res.data.data as LedgerFees);

// 有沖銷帳的代號清單。只看買進，空陣列代表還沒開始記帳。
export const getLedgerSymbols = () =>
  request
    .get<ApiResponse<{ symbols: string[] }>>('/ledger/symbols')
    .then((res) => res.data.data?.symbols ?? []);

// 一檔的完整沖銷帳：策略帳、券商 FIFO 帳，以及兩者的逐筆對帳。
//
// 這一檔完全沒有紀錄時回一本空帳而不是 404——「還沒開始記」是正常狀態，
// 呼叫端要自己判斷 strategy.positions 是不是空的，不要當成錯誤。
export const getLedgerReport = (symbol: string) =>
  request
    .get<ApiResponse<LedgerReport>>(`/ledger/reports/${symbol}`)
    .then((res) => res.data.data as LedgerReport);

// 新增一筆買進。
//
// fee 省略代表「照後端目前的費率幫我算」，傳 0 則是「這一筆真的沒收手續費」——
// 兩者差很多，不要為了少一個判斷就固定送 0，那會讓每股成本少算一個手續費。
export const addLedgerLot = (payload: {
  symbol: string;
  name?: string;
  trade_date: string;
  shares: number;
  price: number;
  fee?: number;
  account?: string;
}) =>
  request
    .post<ApiResponse<LedgerLot>>('/ledger/lots', payload)
    .then((res) => res.data.data as LedgerLot);

// 刪掉一筆買進。
//
// 已經被賣出沖銷掉一部分的會回 409（ledger lot already matched by a sell）：
// 硬刪的話那幾筆賣出會失去成本依據。呼叫端要把這個錯誤顯示出來，
// 使用者才知道該先去刪賣出紀錄。找不到那一筆是 404。
export const removeLedgerLot = (id: string) =>
  request.delete<ApiResponse<{ id: string }>>(`/ledger/lots/${id}`).then((res) => res.data.data);

// 試算一筆賣出，不寫入。回的是同一張單在策略帳與券商 FIFO 帳裡各自的結果。
//
// 跟寫入走後端同一支重播，所以預覽的數字就是送出後會看到的數字。
export const previewLedgerSell = (payload: SellPayload) =>
  request
    .post<ApiResponse<LedgerSellPreview>>('/ledger/sells/preview', payload)
    .then((res) => res.data.data as LedgerSellPreview);

// 記錄一筆賣出，回傳它在策略帳裡的沖銷結果。
//
// 指定的股數超過那一筆的剩餘、超過這次要賣的股數、或整批庫存不夠賣都會 400，
// 後端不會默默把數量調到剛好——幫忙少賣幾股會讓人以為自己下的單成立了。
export const addLedgerSell = (payload: SellPayload) =>
  request
    .post<ApiResponse<LedgerMatchedSell>>('/ledger/sells', payload)
    .then((res) => res.data.data as LedgerMatchedSell);

// 刪掉一筆賣出。被它沖掉的股數會回到庫存，它後面每一筆的沖銷結果跟著重算。
// 那一筆本來就不在時回 removed=0 而不是 404。
export const removeLedgerSell = (id: string) =>
  request
    .delete<ApiResponse<{ id: string; removed: number }>>(`/ledger/sells/${id}`)
    .then((res) => res.data.data);

// 把自選股持股表裡某一檔的部位轉成沖銷帳的買進批次。
//
// ⚠️ 單向且一次性：匯入之後兩邊各走各的，沖銷帳的賣出不會回頭改動 /portfolio 的持股。
// 重複呼叫會重複匯入（事件流本來就允許同一檔多筆買進），畫面上要做二次確認。
//
// 持股表沒有成交日與手續費：回應的 dates_unknown / fees_unknown 是「有幾筆缺這個值」，
// 不是 0 就要提醒使用者回去補——沖銷順序完全靠成交日。
export const importLedgerFromHoldings = (symbol: string) =>
  request
    .post<ApiResponse<LedgerImportResult>>('/ledger/imports', { symbol })
    .then((res) => res.data.data as LedgerImportResult);

/** 一本空帳。後端在沒有紀錄時回的就是這個形狀，前端組預設值時沿用同一份。 */
export const emptyLedger = (view: Ledger['view']): Ledger => ({
  view,
  positions: [],
  sells: [],
  shares: 0,
  cost: 0,
  avg_cost: null,
  realized: 0,
});
