import request from './request';
import { ApiResponse, LineQuota, LineTarget } from './types';

// 後端 errcode.ErrLineNotConfigured。少了 channel access token 屬於部署設定問題，
// 不是執行期錯誤——沒設定的環境（例如 .env.test.json）每一次都會回這個碼。
// 畫面上要跟一般錯誤分開處理：顯示成紅字加重試鈕會讓人一直按，而重試永遠不會成功。
export const ERR_LINE_NOT_CONFIGURED = 130001;

// LineHandler — /line，推播對象與額度。
// 兩支都是唯讀且不計費，看幾次都不會吃掉額度。
//
// 同組還沒接的端點：
//   POST /line/webhook  LINE 平台專用（驗簽後才收），前端不該呼叫。

// 列出所有見過的推播對象，最近有動靜的排前面。
//
// 這份清單只會有「bot 收過事件」的對象：群組 ID 在 LINE 後台查不到，
// 唯一的取得方式就是把 bot 邀進群組後讓它收到一則事件。所以空清單的意思是
// 「還沒有人把 bot 邀進任何群」，不是壞掉。
export const getLineTargets = () =>
  request
    .get<ApiResponse<LineTarget[]>>('/line/targets')
    .then((res) => res.data.data ?? []);

// 查本月還能發幾則推播。額度每月 1 號重置。
//
// 查詢本身不計費也不佔額度，後端 LINE_ENABLED 關掉時照樣問得到真實數字。
export const getLineQuota = () =>
  request.get<ApiResponse<LineQuota>>('/line/quota').then((res) => res.data.data);
