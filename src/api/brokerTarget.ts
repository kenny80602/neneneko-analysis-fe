import request from './request';
import { ApiResponse, BrokerTarget, BrokerTargetList } from './types';

// BrokerTargetHandler — /stocks/broker-targets，券商目標價（網路公開資訊整理，未經驗證）。
// 只讀：資料用後端的 cmd/targetimport 匯入。跟 target.ts 的「自己設定的目標價」是兩件事，
// 不要合併顯示成同一個數字。

// 全部券商目標價，依代號遞增、發布日由新到舊。沒資料是空陣列，不是錯誤。
export const getBrokerTargets = () =>
  request
    .get<ApiResponse<BrokerTargetList>>('/stocks/broker-targets')
    .then((res): BrokerTarget[] => res.data.data?.items ?? []);
