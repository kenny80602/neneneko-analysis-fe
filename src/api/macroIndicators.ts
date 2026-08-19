import request from './request';
import {
  ApiResponse,
  Economy,
  FOMCSchedule,
  FOMCStatementList,
  MacroIndicators,
  MeetingTrend,
  RateExpectationSnapshot,
} from './types';

// MacroHandler — /macro，影響台股但不屬於台股的外部指標：
// VIX、布蘭特原油、Fed 升息機率、美國經濟統計與 FOMC 日程。
//
// ⚠️ 檔名刻意不叫 macro.ts：CRA 內建的 babel-plugin-macros 會把任何以 `/macro`
// 結尾的 import 當成**編譯期巨集**，在 build 時真的去載入執行這個模組，
// 然後在解析它自己的 import 時炸掉（Cannot find module './request'）。
// tsc 完全看不出問題，只有 npm run build 會失敗，而錯誤訊息指向呼叫端，
// 跟真正的原因差很遠。路徑本身是 /macro 沒問題，只有檔名不能是。
//
// 這幾支都不是台股資料，交易時段、時區與休市日都跟台股不同，所以每一支各自帶
// as_of／period，畫面不能拿台股的「資料日期」去套。
//
// 同組還沒接的端點（有需要再補，不要先寫一堆沒人呼叫的函式）：
//   GET  /macro/rates/history  逐日的完整快照。畫面要的是單一次會議的走勢，
//                              那個 rates/trend 已經給了，這支的量大得多
//   POST /macro/rates/collect  手動補跑升息機率的收集
//   POST /macro/collect        手動補跑總經資料的收集

// VIX 與布蘭特原油的當下報價。
//
// ⚠️ 只有這兩支，沒有美元兌新台幣——後端的日 K 序列有收 USDTWD（連同美元指數、
// 美國 10 年期、費半），但那份是給建模用的、沒有開查詢端點，畫面拿不到。
export const getMacroIndicators = () =>
  request.get<ApiResponse<MacroIndicators>>('/macro/indicators').then((res) => res.data.data);

// 美國經濟統計：政策利率區間、PCE、核心 PCE、失業率、實質 GDP。
//
// 原封不動轉述 FRED，未經加工。但它們**永遠是回頭看的**（失業率是上個月、
// GDP 是上一季、PCE 有兩個月延遲），所以每一列的 period 一定要顯示。
export const getEconomy = () =>
  request.get<ApiResponse<Economy>>('/macro/economy').then((res) => res.data.data);

// FOMC 會議日程。limit 省略時由後端決定要回幾次。
//
// 這是手動維護的靜態表（Fed 沒有提供 API），過時的方式跟其他端點不同：
// 它不會回舊數字，而是直接少掉未來的會議，所以要看 stale。
export const getFOMCMeetings = (limit?: number) =>
  request
    .get<ApiResponse<FOMCSchedule>>('/macro/meetings', { params: { limit } })
    .then((res) => res.data.data);

// Fed 升息機率。
//
// ⚠️ 這是**推算值**不是 Fed 的官方預告，也不是 CME FedWatch 的官方數值——
// 是後端自己由聯邦基金期貨與 EFFR 反推的。回應的 assumptions 與 source
// 要顯示在機率旁邊，不要收進說明區。
export const getRateExpectations = () =>
  request.get<ApiResponse<RateExpectationSnapshot>>('/macro/rates').then((res) => res.data.data);

// 最近幾次 FOMC 會議的決策聲明（英文原文）。
//
// 沒帶 limit 時後端回最近 4 次（約半年），上限 20 次。
//
// 這一支只讀後端的資料庫、不打 Fed 官網：聲明公布後就不會再改，
// 現抓等於每個訪客都去打一次上游。空清單代表後端還沒收集過
// （跑 POST /macro/statements/collect 或等排程），不是「Fed 沒有發聲明」。
export const getFOMCStatements = (limit?: number) =>
  request
    .get<ApiResponse<FOMCStatementList>>('/macro/statements', { params: { limit } })
    .then((res) => res.data.data);

// 某一次會議的機率走勢。meeting 省略時後端落到最近一次會議。
//
// 單看今天的機率是一個沒有脈絡的數字，看它在 CPI 公布前後從 30% 跳到 70%，
// 才讀得出市場在反應什麼。
export const getMeetingTrend = (params?: { meeting?: string; days?: number }) =>
  request
    .get<ApiResponse<MeetingTrend>>('/macro/rates/trend', { params })
    .then((res) => res.data.data);
