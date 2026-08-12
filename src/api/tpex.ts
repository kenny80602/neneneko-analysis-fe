import request from './request';
import { ApiResponse, TPExMarketHighlight, TPExPriceMover } from './types';

// TPExHandler — /stocks/tpex，上櫃市場即時打櫃買中心 OpenAPI 的整包資料。
// 性質同 twse.ts：不落地、受上游限流，路徑刻意與 /stocks/twse 對齊，方便兩個市場共用同一套呼叫。
//
// 尚未接進畫面的端點（需要時再補對應函式與型別）：
//   /quotes、/off_market_quotes、/margin_balances、/short_sale_balances、
//   /margin_ratio_adjustments、/margin_change_ranks、/trading_warnings、
//   /trading_warning_notes、/institutional_tradings、/dealer_tradings、
//   /institutional_summaries、/market_value_ranks、/average_volume_ranks、
//   /average_amount_ranks、/pe_ratio_ranks、/volume_ranks、/amount_ranks

// 上櫃股票市場現況（櫃買指數、成交量值與漲跌家數）。回單一物件，不是陣列。
export const getTPExMarketHighlight = () =>
  request
    .get<ApiResponse<TPExMarketHighlight>>('/stocks/tpex/market_highlight')
    .then((res) => res.data.data);

// 盤中漲幅排行。上游是盤中即時的榜單，收盤後不會再變動，假日回空清單。
// 這一組只有上櫃有：集中市場沒有對應的漲跌幅排行端點，上市那邊只能用成交量排行。
export const getTPExPriceAdvanced = () =>
  request
    .get<ApiResponse<TPExPriceMover[]>>('/stocks/tpex/price_advanced')
    .then((res) => res.data.data ?? []);

// 盤中跌幅排行。change 與 change_percent 是負數。
export const getTPExPriceDeclined = () =>
  request
    .get<ApiResponse<TPExPriceMover[]>>('/stocks/tpex/price_declined')
    .then((res) => res.data.data ?? []);
