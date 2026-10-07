import { useMemo } from 'react';
import { getGroupMembers } from '../api/stockGroup';
import { useAsyncData } from './useAsyncData';

/**
 * 代號 → 所屬族群名稱。給表格多一欄「族群」用。
 *
 * 走 /stocks/groups/members：它完全不打上游，整份族群一次拿也很快。
 * 一檔可以屬於多個族群，所以值是陣列；不屬於任何族群是常態（族群得自己建），
 * 查不到就回 undefined，畫面顯示破折號。
 *
 * 載入失敗不擋主表：族群只是附加資訊，拿不到時那一欄是破折號而已。
 */
export function useSymbolGroups(): Map<string, string[]> {
  const { data } = useAsyncData(() => getGroupMembers(), []);
  return useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { group, members } of data?.items ?? []) {
      for (const member of members) {
        const names = map.get(member.symbol);
        if (names) names.push(group.name);
        else map.set(member.symbol, [group.name]);
      }
    }
    return map;
  }, [data]);
}
