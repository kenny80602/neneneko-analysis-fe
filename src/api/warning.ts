import request from './request';
import { ApiResponse, HistoryParams, WarningCollectResult, WarningHistory } from './types';

// WarningHandler — /stocks/warning，個股被列為注意股票的紀錄（上市上櫃合在一起）。
// 「注意股」是交易所對異常交易的公開提醒，不是處置股——不影響交易方式，
// 但短期內 announcement_count 往上跳就離處置（分盤交易）不遠了。

// 回空清單是常態而且是好消息：多數個股從來沒被列過注意。
export const getWarningHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<WarningHistory>>(`/stocks/warning/${symbol}`, { params })
    .then((res) => res.data.data);

// 立刻抓一次當日注意股並全部落地。上游收盤後才更新，盤中打會拿到前一個交易日的內容。
export const collectWarnings = () =>
  request
    .post<ApiResponse<WarningCollectResult>>('/stocks/warning/collect')
    .then((res) => res.data.data);
