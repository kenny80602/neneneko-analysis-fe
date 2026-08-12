import request from './request';
import { ApiResponse, RealtimeQuote } from './types';

// RealtimeQuoteHandler — /stocks/realtime，台股即時報價（證交所 MIS，不落地）。
// 代號格式不符回 400，查無此股回 404。適合輪詢，但別太密集：上游有限流。
export const getRealtimeQuote = (symbol: string) =>
  request
    .get<ApiResponse<RealtimeQuote>>(`/stocks/realtime/${symbol}`)
    .then((res) => res.data.data);
