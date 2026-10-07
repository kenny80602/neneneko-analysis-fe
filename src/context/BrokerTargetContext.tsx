import { createContext, ReactNode, useContext, useMemo } from 'react';
import { getBrokerTargets } from '../api/brokerTarget';
import { BrokerTarget } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';

/** 一檔的券商目標價整理：每家券商只留最新一筆。 */
export interface BrokerTargetSummary {
  symbol: string;
  /** 每家券商最新的一筆，發布日由新到舊。 */
  items: BrokerTarget[];
  /** 各家目標價的中位數。用中位數不用平均：一家喊天價就能把平均拉歪。 */
  median: number;
  /** 最新一筆的發布日 YYYY-MM-DD。 */
  newestDate: string;
}

/** 每家券商只留最新一筆，再算中位數。純函式，方便測試。 */
export function summarizeBrokerTargets(items: BrokerTarget[]): Map<string, BrokerTargetSummary> {
  const latest = new Map<string, BrokerTarget>();
  for (const item of items) {
    const key = `${item.symbol}|${item.broker}`;
    const current = latest.get(key);
    if (!current || item.report_date > current.report_date) latest.set(key, item);
  }
  const bySymbol = new Map<string, BrokerTarget[]>();
  latest.forEach((item) => {
    const list = bySymbol.get(item.symbol) ?? [];
    list.push(item);
    bySymbol.set(item.symbol, list);
  });
  const result = new Map<string, BrokerTargetSummary>();
  bySymbol.forEach((list, symbol) => {
    list.sort((a, b) => b.report_date.localeCompare(a.report_date) || b.target_price - a.target_price);
    const prices = list.map((i) => i.target_price).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    result.set(symbol, { symbol, items: list, median, newestDate: list[0].report_date });
  });
  return result;
}

// 沒包 Provider（例如登入頁、單元測試）時是空的：券商目標價欄顯示破折號，不報錯。
const BrokerTargetContext = createContext<Map<string, BrokerTargetSummary>>(new Map());

/**
 * 券商目標價整份只載入一次，所有頁面共用：十幾個地方（表格、關聯圖面板、整群逐檔）都要顯示，
 * 一路用 props 傳下去太長。載入失敗不擋畫面，那一欄就是破折號。
 */
export function BrokerTargetProvider({ children }: { children: ReactNode }) {
  const { data } = useAsyncData(() => getBrokerTargets(), []);
  const value = useMemo(() => summarizeBrokerTargets(data ?? []), [data]);
  return <BrokerTargetContext.Provider value={value}>{children}</BrokerTargetContext.Provider>;
}

/** 這一檔的券商目標價整理；沒查到是 undefined。 */
export function useBrokerTargets(symbol: string): BrokerTargetSummary | undefined {
  return useContext(BrokerTargetContext).get(symbol);
}
