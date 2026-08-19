import request from './request';
import {
  ApiResponse,
  FinancialHistory,
  FinancialPeers,
  FinancialRanks,
  HistoryParams,
  Market,
} from './types';

// FinancialHandler — /stocks/financial，每季財報摘要與 ROE。
// 資料來自公開資訊觀測站的綜合損益表與資產負債表，跟月營收同一個排程收集
// （cmd/notify -collect-mops）。
//
// 跟 /stocks/valuation 的差別：那一組是「市場給的評價」（本益比、殖利率、
// 股價淨值比，天天變、來自交易所），這一組是「公司自己的體質」（淨利、權益、ROE，
// 一季換一次）。兩者的更新頻率、資料源與空值語意都不同，所以是兩支端點。

// 單檔的財報摘要，年季由新到舊。沒指定 limit 時後端回全部。
export const getFinancialHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<FinancialHistory>>(`/stocks/financial/${symbol}`, { params })
    .then((res) => res.data.data);

// 某一季全市場的 ROE 排行，年化 ROE 由高到低。
//
// 四個參數都可以省略：year／quarter 要嘛一起給要嘛都不給（不給就是目前收集到最新
// 的那一季），market 不給就兩個市場一起排，min_roe 篩的是**年化** ROE（講
// 「ROE 15% 以上」講的是年度水準），limit 預設 50、上限 500。
//
// 空清單不是錯誤：財報一季才換一份，各家陸續申報的期間本來就是從零筆長上來。
export const getFinancialRanks = (params?: {
  year?: number;
  quarter?: number;
  market?: Market;
  min_roe?: number;
  limit?: number;
}) =>
  request
    .get<ApiResponse<FinancialRanks>>('/stocks/financial/ranks', { params })
    .then((res) => res.data.data);

// 一檔所屬主題族群的成員與各自的 ROE。
//
// 用的是自訂族群而不是官方產業別：ROE 要比的是「同一門生意誰的資本效率高」，
// 而官方分類在這件事上分不對——矽晶圓三家全歸「半導體業」（含台積電，比不出東西），
// 散熱三家則分屬三個產業。想看官方產業別的營收排名走 getIndustryPeers。
//
// 回空陣列是常態：多數股票不屬於任何族群。
export const getFinancialPeers = (symbol: string) =>
  request
    .get<ApiResponse<FinancialPeers>>(`/stocks/financial/peers/${symbol}`)
    .then((res) => res.data.data);
