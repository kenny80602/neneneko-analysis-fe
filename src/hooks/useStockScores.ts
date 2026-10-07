import { useMemo } from 'react';
import { getStockScores, SCORE_MAX_SYMBOLS } from '../api/score';
import { StockScore } from '../api/types';
import { useAsyncData } from './useAsyncData';

/**
 * 一批代號的三面向評分，回成「代號 → 評分」的 Map 方便每列查。
 *
 * 評分失敗不該擋住榜單本身：榜單是主角，這一欄是附加資訊。所以這裡不回傳錯誤訊息的
 * 版位，只回 failed 讓格子顯示破折號並在 title 說明（呼叫端自己決定怎麼講）。
 *
 * deps 用代號串接成的字串：陣列每次 render 都是新的，放進去會無限重抓。
 */
export function useStockScores(symbols: string[]) {
  const unique = useMemo(
    () => Array.from(new Set(symbols)).slice(0, SCORE_MAX_SYMBOLS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbols.join(',')]
  );
  const key = unique.join(',');

  const { data, loading, error } = useAsyncData(() => getStockScores(unique), [key], {
    enabled: unique.length > 0,
  });

  const bySymbol = useMemo(() => {
    const map = new Map<string, StockScore>();
    (data ?? []).forEach((score) => map.set(score.symbol, score));
    return map;
  }, [data]);

  return { bySymbol, loading, failed: !!error };
}
