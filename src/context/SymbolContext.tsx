import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

// 個股各頁（總覽 / 法人 / 融資券 / 估值 / 營收 / 重大訊息 / 注意股）共用「目前選取的股票代號」。
// 切頁時不必重打代號，重整後也還在（持久化於 localStorage）。
const STORAGE_KEY = 'stock:selectedSymbol';

interface SymbolContextValue {
  /** 目前選取的股票代號，未選取時為空字串。 */
  symbol: string;
  /** 設定代號；傳空字串等於清除選取。 */
  setSymbol: (symbol: string) => void;
}

const SymbolContext = createContext<SymbolContextValue>({
  symbol: '',
  setSymbol: () => {},
});

export function SymbolProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbolState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? ''
  );

  const setSymbol = useCallback((next: string) => {
    const trimmed = next.trim();
    setSymbolState(trimmed);
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ symbol, setSymbol }), [symbol, setSymbol]);

  return <SymbolContext.Provider value={value}>{children}</SymbolContext.Provider>;
}

export function useSymbol() {
  return useContext(SymbolContext);
}
