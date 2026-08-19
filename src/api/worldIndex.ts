import request from './request';
import { ApiResponse, WorldIndices } from './types';

// WorldIndexHandler — /markets/indices，日股、韓股、美股的指數看板。
//
// 路徑前綴是 /markets 不是 /macro 也不是 /stocks：股價指數不是總經指標
// （那一組是 VIX、油價、升息機率），也不是台股個股。三組分開才看得出
// 一個數字是哪一類的東西。
//
// ⚠️ 回的是**收盤值不是即時報價**，而且三個市場的日期本來就不同步——
// 台北週三下午看到的是日韓週三收盤、美股週二收盤。畫面一定要標每一列的日期，
// 不然會被當成漏收。
//
// 後端讀的是每日排程收下來的日 K、不打上游，所以這一支不會因為 Yahoo 掛掉而失敗，
// 最壞的情況是資料停在前一個交易日——而那件事從 date 看得出來。
export const getWorldIndices = () =>
  request.get<ApiResponse<WorldIndices>>('/markets/indices').then((res) => res.data.data);
