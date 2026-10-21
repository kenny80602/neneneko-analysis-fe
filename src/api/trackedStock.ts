import request from './request';
import {
  AddTrackedStockResult,
  ApiResponse,
  BackfillTrackedStockResult,
  RemoveTrackedStockResult,
  TrackedStock,
  TrackedStockList,
} from './types';

// TrackedStockHandler — /stocks/tracked，個股清單（要持續收集資料的檔）。
// 自選股一定在這裡，這裡的不一定在自選股。收集與回補的名單是「自選股 ∪ 個股清單」。

// 全部個股，依代號遞增。後端讀到「在自選股、卻還沒登記」的舊資料時會順手補登記。
export const getTrackedStocks = (): Promise<TrackedStock[]> =>
  request
    .get<ApiResponse<TrackedStockList>>('/stocks/tracked')
    .then((res) => res.data.data?.items ?? []);

// 登記一檔個股。會先向報價來源驗證代號（不存在 404、格式不對 400），
// 新登記的檔立刻在背景補歷史（日 K、逐檔法人、逐檔融資融券），打上游、寫資料庫，約五到十分鐘。
// 重複登記不是錯誤，看回傳的 already_exists。
export const addTrackedStock = (symbol: string) =>
  request
    .post<ApiResponse<AddTrackedStockResult>>('/stocks/tracked', { symbol })
    .then((res) => res.data.data);

// 移出個股清單，只停止之後的收集，已落地的歷史不刪。
// 這一檔還在自選股裡會 409（自選股一定要是個股），要先移出自選股。
export const removeTrackedStock = (symbol: string) =>
  request
    .delete<ApiResponse<RemoveTrackedStockResult>>(`/stocks/tracked/${encodeURIComponent(symbol)}`)
    .then((res) => res.data.data);

// 重新補一檔的歷史資料，立刻回來、補的動作在後端背景跑。會打上游、寫資料庫。
// 只補沒有的日子，重按是安全的；別檔正在補時 started 為 false。
export const backfillTrackedStock = (symbol: string) =>
  request
    .post<ApiResponse<BackfillTrackedStockResult>>(
      `/stocks/tracked/${encodeURIComponent(symbol)}/backfill`
    )
    .then((res) => res.data.data);
