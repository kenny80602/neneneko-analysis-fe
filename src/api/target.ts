import request from './request';
import { ApiResponse, RemoveStockTargetResult, StockTarget, StockTargetList } from './types';

// StockTargetHandler — /stocks/targets，使用者自己設定的目標價。
// 不是券商目標價：價格完全由使用者決定，後端只驗格式（代號四到六碼、價格大於 0 且不超過
// 100000、備註最多 100 字）。跟持股、自選股無關，沒買的股票也能設。

// 全部目標價，依代號遞增。沒設定過是空陣列，不是錯誤。
export const getTargets = () =>
  request
    .get<ApiResponse<StockTargetList>>('/stocks/targets')
    .then((res) => res.data.data?.items ?? []);

// 設定或覆蓋某一檔的目標價。
export const setTarget = (symbol: string, targetPrice: number, note = '') =>
  request
    .put<ApiResponse<StockTarget>>(`/stocks/targets/${encodeURIComponent(symbol)}`, {
      target_price: targetPrice,
      note,
    })
    .then((res) => res.data.data);

// 刪掉某一檔的目標價。本來就沒設定回 removed=0，不是錯誤。
export const removeTarget = (symbol: string) =>
  request
    .delete<ApiResponse<RemoveStockTargetResult>>(`/stocks/targets/${encodeURIComponent(symbol)}`)
    .then((res) => res.data.data);
