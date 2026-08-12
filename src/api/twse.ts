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
