import request from './request';
import { ApiResponse, HistoryParams, InstitutionalHistory } from './types';

// InstitutionalHandler — /stocks/institutional，個股每日三大法人買賣狀況。
// 與 /stocks/twse/institutional_tradings 的差別：那支即時打證交所、一次回全市場；
// 這支查已落地的資料，可指定單一檔往回翻歷史。目前只會有上市的資料。
export const getInstitutionalHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<InstitutionalHistory>>(`/stocks/institutional/${symbol}`, { params })
    .then((res) => res.data.data);
