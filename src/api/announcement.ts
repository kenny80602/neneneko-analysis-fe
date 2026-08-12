import request from './request';
import { AnnouncementHistory, ApiResponse, HistoryParams } from './types';

// AnnouncementHandler — /stocks/announcement，公司重大訊息（公開資訊觀測站）。
// 涵蓋範圍是「開始收集之後的每一天」：上游只回最近一兩個交易日且沒有日期參數，
// 排程停掉的那幾天補不回來。一則都沒有是常態，不代表資料沒收到。
export const getAnnouncementHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<AnnouncementHistory>>(`/stocks/announcement/${symbol}`, { params })
    .then((res) => res.data.data);
