import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../api/request';

interface UseAsyncDataOptions {
  /**
   * false 時不發請求（例如尚未選取股票代號），狀態維持 idle。
   * 預設 true。
   */
  enabled?: boolean;
  /** 自動重抓的間隔（毫秒）。即時報價那類會用到；不給就不輪詢。 */
  pollingMs?: number;
}

interface UseAsyncDataResult<T> {
  data: T | undefined;
  /** 首次載入或重抓中。輪詢造成的重抓不會把畫面打回載入狀態。 */
  loading: boolean;
  /** 可直接顯示的錯誤訊息，成功時為空字串。 */
  error: string;
  /** 手動重抓（例如按下重新整理、送出查詢條件後）。 */
  reload: () => void;
}

/**
 * 各頁抓資料的共同流程：載入中／錯誤訊息／結果三態，外加可選的輪詢與手動重抓。
 *
 * 每頁自己寫 useState + useEffect 也做得到，但十幾頁重複同一段樣板，
 * 漏掉「元件卸載後不要 setState」或「切換代號時舊請求慢回來覆蓋新結果」的那一頁不會有人發現。
 *
 * deps 的用法同 useEffect：查詢條件（代號、日期、筆數）放進去，條件一變就重抓。
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: UseAsyncDataOptions
): UseAsyncDataResult<T> {
  const { enabled = true, pollingMs } = options ?? {};

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 每次請求配一個序號，只有最新那次的結果可以寫進 state：
  // 快速切換代號時，先發的請求可能後回來，不擋的話畫面會顯示上一檔的資料。
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  // fetcher 幾乎都是行內箭頭函式，每次 render 都是新的，不能放進 deps。
  // 用 ref 存最新一版，實際觸發時機交給呼叫端給的 deps 決定。
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (showLoading: boolean) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setData(result);
      setError('');
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(apiErrorMessage(err, '載入失敗，請稍後再試'));
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // 停用時清掉上一次的結果，避免切到未選取狀態還留著舊資料。
      requestIdRef.current++;
      setData(undefined);
      setError('');
      setLoading(false);
      return;
    }
    run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  useEffect(() => {
    if (!enabled || !pollingMs) return;
    // 輪詢不帶 loading：每次都閃一下載入中，畫面會一直跳。
    const timer = setInterval(() => run(false), pollingMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pollingMs, run, ...deps]);

  const reload = useCallback(() => {
    run(true);
  }, [run]);

  return { data, loading, error, reload };
}
