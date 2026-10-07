import { useCallback, useMemo } from 'react';
import { getTargets, removeTarget, setTarget } from '../api/target';
import { StockTarget } from '../api/types';
import { useAsyncData } from './useAsyncData';

/** 目標價的讀寫入口。同一頁的表格、關聯圖面板與整群逐檔共用同一份，改一處到處都更新。 */
export interface TargetStore {
  /** 這一檔的目標價；沒設定是 undefined（不是 0）。 */
  get: (symbol: string) => StockTarget | undefined;
  save: (symbol: string, price: number, note?: string) => Promise<void>;
  clear: (symbol: string) => Promise<void>;
}

/**
 * 使用者自己設定的目標價。載入失敗不擋主表：那幾欄只是顯示破折號，之後按設定仍然寫得進去。
 * 存檔與刪除成功後重抓整份，畫面一律以伺服器為準，不在本地猜。
 */
export function useTargets(): TargetStore {
  const { data, reload } = useAsyncData(() => getTargets(), []);
  const map = useMemo(() => new Map((data ?? []).map((target) => [target.symbol, target])), [data]);

  const save = useCallback(
    async (symbol: string, price: number, note = '') => {
      await setTarget(symbol, price, note);
      reload();
    },
    [reload]
  );
  const clear = useCallback(
    async (symbol: string) => {
      await removeTarget(symbol);
      reload();
    },
    [reload]
  );

  return useMemo(() => ({ get: (symbol: string) => map.get(symbol), save, clear }), [map, save, clear]);
}
