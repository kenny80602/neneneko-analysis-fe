import request from './request';
import { ApiResponse, TPExMarketHighlight } from './types';

// TPExHandler — /stocks/tpex，上櫃市場即時打櫃買中心 OpenAPI 的整包資料。
// 性質同 twse.ts：不落地、受上游限流，路徑刻意與 /stocks/twse 對齊，方便兩個市場共用同一套呼叫。
//
// 尚未接進畫面的端點（需要時再補對應函式與型別）：
//   /quotes、/off_market_quotes、/margin_balances、/short_sale_balances、
//   /margin_ratio_adjustments、/margin_change_ranks、/trading_warnings、
//   /trading_warning_notes、/institutional_tradings、/dealer_tradings、
//   /institutional_summaries、/price_advanced、/price_declined、/market_value_ranks、
//   /average_volume_ranks、/average_amount_ranks、/pe_ratio_ranks、/volume_ranks、/amount_ranks

// 上櫃股票市場現況（櫃買指數、成交量值與漲跌家數）。回單一物件，不是陣列。
export const getTPExMarketHighlight = () =>
  request
    .get<ApiResponse<TPExMarketHighlight>>('/stocks/tpex/market_highlight')
    .then((res) => res.data.data);
