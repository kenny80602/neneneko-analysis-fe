import { useMemo } from 'react';
import { getPriceLevels } from '../api/dailyQuote';
import { SymbolLevels } from '../api/types';
import { useAsyncData } from './useAsyncData';

/**
 * 一批代號的壓力與支撐，回成「代號 → 價位」的 Map 方便每列查。
 *
 * 跟 useStockScores 同一個取捨：價位失敗不該擋住表格本身，所以只回 failed，
 * 讓格子顯示破折號並在 title 說明。
 *
 * latestDate 是這一批裡最新的收盤日。個別代號的日 K 停在更早的日子時（剛登記、或收集漏跑），
 * 它的距離是相對舊收盤算的，畫面要標出來，不然會被讀成現在的。
 *
 * deps 用代號串接成的字串：陣列每次 render 都是新的，放進去會無限重抓。
 */
export function useSymbolLevels(symbols: string[]) {
  const unique = useMemo(
    () => Array.from(new Set(symbols)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbols.join(',')]
  );
  const key = unique.join(',');

  const { data, loading, error } = useAsyncData(() => getPriceLevels(unique), [key], {
    enabled: unique.length > 0,
  });

  const bySymbol = useMemo(() => {
    const map = new Map<string, SymbolLevels>();
    (data ?? []).forEach((item) => map.set(item.symbol, item));
    return map;
  }, [data]);

  const latestDate = useMemo(
    () => (data ?? []).reduce((latest, item) => (item.last_date > latest ? item.last_date : latest), ''),
    [data]
  );

  return { bySymbol, latestDate, loading, failed: !!error };
}
