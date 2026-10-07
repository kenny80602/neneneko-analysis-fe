import { useMemo } from 'react';
import { getValuationsByDate } from '../api/valuation';
import { ValuationBySymbol } from '../api/types';
import { useAsyncData } from './useAsyncData';

/**
 * 代號 → 估值（本益比、殖利率、股價淨值比），給表格多一欄用。
 *
 * date 空字串表示每一檔取自己最新的一筆；有值則是那一天的全部。
 * 查不到就是 undefined，畫面顯示破折號：估值只收集器落地的那批，而且沒有回補，
 * 收集之前的日期整天都沒有。pe_ratio 為 null 則是虧損算不出來——兩者都不是 0。
 *
 * 載入失敗不擋主表，只是那一欄是破折號。
 */
export function useSymbolValuations(date = ''): Map<string, ValuationBySymbol> {
  const { data } = useAsyncData(() => getValuationsByDate(date || undefined), [date]);
  return useMemo(() => new Map((data?.items ?? []).map((item) => [item.symbol, item])), [data]);
}
