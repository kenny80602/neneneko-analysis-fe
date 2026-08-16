import request from './request';
import { ApiResponse, FinancialHistory, HistoryParams } from './types';

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
