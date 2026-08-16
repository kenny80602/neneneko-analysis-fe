import request from './request';
import {
  ApiResponse,
  TWSEAdvanceDeclineSummary,
  TWSEInstitutionalSummaries,
  TWSEMarketTrading,
  TWSEVolumeRank,
} from './types';

// TWSEHandler — /stocks/twse，集中市場（上市）即時打證交所 OpenAPI 的整包資料。
// 這一組不落地、受上游限流影響，且多數端點一次回全市場數千筆；
// 要看單一檔的歷史請改用 /stocks/daily、/stocks/institutional 等已落地的端點。
//
// 尚未接進畫面的端點（需要時再補對應函式與型別）：
//   /off_market_quotes、/margin_balances、/short_sale_quotas、/margin_suspensions、
//   /trading_warnings、/trading_warning_notes、/valuations、/institutional_tradings

// 每日市場成交資訊（大盤成交量值與加權指數）。
export const getTWSEMarketTradings = () =>
  request
    .get<ApiResponse<TWSEMarketTrading[]>>('/stocks/twse/market_tradings')
    .then((res) => res.data.data ?? []);

// 漲跌證券數統計表（上漲 / 下跌 / 持平家數，依統計範圍分列）。
export const getTWSEAdvanceDeclineSummaries = () =>
  request
    .get<ApiResponse<TWSEAdvanceDeclineSummary[]>>('/stocks/twse/advance_decline_summaries')
    .then((res) => res.data.data ?? []);

// 每日成交量前二十名證券。上游只回當天，沒有日期參數，假日回空清單。
// 附了收盤價與漲跌點數但沒有漲跌幅，需要百分比得自己用 change ÷ 昨收算。
export const getTWSEVolumeRanks = () =>
  request
    .get<ApiResponse<TWSEVolumeRank[]>>('/stocks/twse/volume_ranks')
    .then((res) => res.data.data ?? []);

// 三大法人買賣金額統計表（BFI82U），大盤層級的買賣超金額，單位元。
// 不帶 date 就是今天；假日或收盤資料還沒出來時回空清單而不是錯誤。
export const getTWSEInstitutionalSummaries = (date?: string) =>
  request
    .get<ApiResponse<TWSEInstitutionalSummaries>>('/stocks/twse/institutional_summaries', {
      params: { date },
    })
    .then((res) => res.data.data);

// 往回試幾個交易日。國定假日連休最長的是春節（休到九個日曆天），
// 扣掉中間的週末大約是五到六個交易日，抓 7 次留一點餘裕。
// 再往回就不是「今天休市」而是上游壞了，多打只是浪費上游額度。
const INSTITUTIONAL_LOOKBACK_TRIES = 7;

/**
 * 台北時間的今天（YYYY-MM-DD）。
 *
 * 不能直接用瀏覽器本機日期：使用者人在別的時區時會差一天，
 * 而交易日是台北時間定義的。`en-CA` 的格式剛好就是 YYYY-MM-DD。
 */
function taipeiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}

/**
 * 三大法人買賣金額，自動退回最近一個有資料的交易日。
 *
 * 上游只認「某一天」，週末、國定假日與收盤後約一小時內查當天都回空清單，
 * 後端也分不出是休市還是還沒更新（上游給的回應一模一樣）。
 * 所以從台北時間今天往回一天一天問，第一個有資料的那天就是最近交易日。
 *
 * 週六日直接跳過不發請求——那兩天必定沒有，問了只是白白多兩次上游請求。
 * 請求是串列的（要看前一次的結果才知道要不要再往回），最壞情況會慢上幾倍，
 * 但只有連假才會走到底，平常收盤後第一次就中。
 *
 * 全部試完仍是空的就回第一次的空回應，讓頁面照常顯示空狀態而不是錯誤——
 * 錯誤（連不上、500）仍然照常往外丟，不在這裡吞掉。
 */
export const getLatestTWSEInstitutionalSummaries = async (
  tries = INSTITUTIONAL_LOOKBACK_TRIES
): Promise<TWSEInstitutionalSummaries | undefined> => {
  // 拿 UTC 午夜當游標做日期加減：只是用來數天數，不是真的時刻，
  // 這樣就不會被本機時區與日光節約影響到跨日的判斷。
  const cursor = new Date(`${taipeiToday()}T00:00:00Z`);
  let firstEmpty: TWSEInstitutionalSummaries | undefined;

  for (let asked = 0; asked < tries; cursor.setUTCDate(cursor.getUTCDate() - 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    asked += 1;
    const data = await getTWSEInstitutionalSummaries(cursor.toISOString().slice(0, 10));
    if (data?.items?.length) return data;
    firstEmpty = firstEmpty ?? data;
  }

  return firstEmpty;
};
