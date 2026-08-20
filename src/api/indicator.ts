import request from './request';
import { ApiResponse, HistoryParams, StockIndicators } from './types';

// IndicatorHandler — /stocks/indicators，個股技術指標。
//
// 跟 /stocks/daily 分開的理由在後端寫得很清楚：那一支回的是落地的原始資料，
// 這一支回的是「原始資料 + 一組參數」現算出來的東西。指標刻意不落地，
// 所以參數是查詢字串的一部分——換一組參數就是換一次呼叫，不是重跑一次回填。
//
// 純讀、只吃 Mongo、不打上游，想查幾次都行，沒有上游限流的問題。
//
// 這一組同樣只接畫面用得到的。端點還算得出 ma／ema／bollinger／bias，
// 那四種是疊在 K 線上的東西（個股總覽那張 K 線圖自己用 utils/chart.ts 算均線），
// 不是獨立一張圖，所以這裡沒有接。

// 算某一檔的技術指標，日期由舊到新。
//
// indicators 是逗號分隔的種類：kd／ma／ema／rsi／macd／bollinger／bias／cci／dmi，
// 省略代表全部算。各指標的參數（kd=9,3,3、rsi=14…）也都可以帶，省略時用台股券商
// 軟體的預設值，實際用了什麼參數會原樣回在 params 裡。帶不認得的種類會回 400。
//
// from／to／limit 的語意跟 /stocks/daily/:symbol 一致，而且前置期會另外多撈、
// 不佔 limit——要 60 個 KD 就給 60 個，不會被開頭那幾根算不出來的吃掉。
//
// 空序列不是錯誤：可能是這一檔沒收集過（看 bars 是不是 0），也可能是日 K 根數
// 還不夠長到算得出這個週期。
export const getIndicators = (
  symbol: string,
  params?: HistoryParams & { indicators?: string }
) =>
  request
    .get<ApiResponse<StockIndicators>>(`/stocks/indicators/${symbol}`, { params })
    .then((res) => res.data.data);
