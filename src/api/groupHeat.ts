import request from './request';
import { ApiResponse, GroupHeatBoard } from './types';

// GroupHeatHandler — /stocks/groups/heat，每日題材熱度榜。
//
// 跟 stockGroup.ts 分成兩個檔，理由同後端分成兩支 handler：那邊管的是族群的增刪查
// （誰屬於散熱），這一支管的是族群的當日表現（散熱今天有沒有在動）。
// 兩者的資料來源與失敗模式都不同——族群清單讀 Mongo 一定成功，
// 這一支要有當天的全市場橫斷面才算得出來。
//
// ⚠️ 回的是現況描述不是預測。回應裡的 caveats 就是為此存在，畫面上一定要照著標。

// 空的 items 代表還沒有橫斷面資料（看 days_covered），不是「今天沒有族群在動」。
export const getGroupHeat = () =>
  request.get<ApiResponse<GroupHeatBoard>>('/stocks/groups/heat').then((res) => res.data.data);
