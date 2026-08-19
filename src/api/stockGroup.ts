import request from './request';
import {
  ApiResponse,
  GroupMembersList,
  GroupPeers,
  RemoveGroupResult,
  StockGroup,
} from './types';

// GroupHandler — /stocks/groups，自己維護的主題族群（散熱、矽晶圓…）。
//
// 跟 revenue.ts 的 getIndustryPeers 是兩回事，兩支都要接：
// 那支是證交所的官方產業別，這支是人工整理的族群。官方產業別在「同類放一起」
// 這件事上兩個方向都失敗——矽晶圓三家全歸「半導體業」（一百多家，太粗），
// 散熱三家分屬三個產業別（永遠不會放在一起）。畫面上兩塊要分得出來，
// 所以刻意不在前端把兩支的結果併成一張表。
//
// 成員不必在自選股裡，也不必同市場。

export const getStockGroups = () =>
  request
    .get<ApiResponse<StockGroup[]>>('/stocks/groups')
    .then((res) => res.data.data ?? []);

// 寫入或覆蓋一個族群。同名視為覆蓋——畫面上是「新增一個叫散熱的族群」，
// 使用者手上沒有 id，改名要走「刪掉再建」。
export const saveStockGroup = (group: Pick<StockGroup, 'name' | 'symbols' | 'sort_order'>) =>
  request
    .put<ApiResponse<StockGroup>>('/stocks/groups', group)
    .then((res) => res.data.data);

// 只刪這個族群的分類，不影響任何一檔的自選股或持股。
export const removeStockGroup = (id: string) =>
  request
    .delete<ApiResponse<RemoveGroupResult>>(`/stocks/groups/${id}`)
    .then((res) => res.data.data);

// 全部族群與各自的成員，只有代號、名稱、產業別與在不在自選股。
//
// 跟下面的 getGroupPeers 是兩支，維護畫面用這一支：**它完全不打上游**
// （只讀族群表、月營收與自選股三張表），所以整份族群一次拿也很快。
// peers 那支每一檔都要去問 Yahoo 的日 K 來算週漲跌幅，一次問完整份會被限流。
//
// name 是空字串代表那一檔不在月營收那份資料裡——ETF、剛上市，或代號打錯。
// 回應的 unnamed 是這種檔的檔數（跨族群去重），畫面要拿它解釋那幾個只有代號的 chip。
export const getGroupMembers = () =>
  request
    .get<ApiResponse<GroupMembersList>>('/stocks/groups/members')
    .then((res) => res.data.data);

// 這一檔所屬的每一個族群，各自帶出成員與月營收。
//
// 回空陣列是常態：多數股票不屬於任何族群，因為族群得自己建。
// 一檔可以屬於多個族群（中美晶既是矽晶圓也是太陽能），所以回的是陣列。
export const getGroupPeers = (symbol: string) =>
  request
    .get<ApiResponse<GroupPeers[]>>(`/stocks/groups/peers/${symbol}`)
    .then((res) => res.data.data ?? []);
