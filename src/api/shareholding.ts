import request from './request';
import { ApiResponse, ShareholdingHistory } from './types';

// ShareholdingHandler — /stocks/shareholding，集保股權分散（大戶與散戶持股比例）。
//
// 這是免費資料裡唯一能回答「大戶是不是在收」的來源：券商分點進出要過圖形驗證碼、
// 一次只能查一檔一天，三大法人只涵蓋法人，融資融券只涵蓋信用交易戶。
//
// ⚠️ 存量不是流量、週資料不是日資料，詳見 types.ts 的說明。
// ⚠️ 上游只提供「最新一週」，沒有日期參數也沒有歷史檔——漏收一週就是永久空白。
//    所以趨勢圖要等資料累積幾週才有東西看，count <= 1 時不要畫。

// 單檔的逐週股權分散，日期由新到舊。
// limit 省略是 52 週（一年），上限 260。
export const getShareholdingHistory = (symbol: string, limit?: number) =>
  request
    .get<ApiResponse<ShareholdingHistory>>(`/stocks/shareholding/${symbol}`, {
      params: { limit },
    })
    .then((res) => res.data.data);
