import { useMemo } from 'react';
import { getGroupMembers } from '../api/stockGroup';
import { GroupMembers } from '../api/types';
import { useAsyncData } from './useAsyncData';

interface GroupIndex {
  /** 全部族群與成員，順序照後端（成員順序是使用者編的）。 */
  groups: GroupMembers[];
  /** 代號 → 所屬族群名稱。 */
  names: Map<string, string[]>;
}

/**
 * 族群索引：整份族群，加上「代號 → 所屬族群名稱」。
 *
 * 走 /stocks/groups/members：它完全不打上游，整份族群一次拿也很快。
 * 一檔可以屬於多個族群，所以值是陣列；不屬於任何族群是常態（族群得自己建），
 * 查不到就回 undefined，畫面顯示破折號。
 *
 * 載入失敗不擋主表：族群只是附加資訊，拿不到時那一欄是破折號而已。
 */
export function useGroupIndex(): GroupIndex {
  const { data } = useAsyncData(() => getGroupMembers(), []);
  return useMemo(() => {
    const groups = data?.items ?? [];
    const names = new Map<string, string[]>();
    for (const { group, members } of groups) {
      for (const member of members) {
        const list = names.get(member.symbol);
        if (list) list.push(group.name);
        else names.set(member.symbol, [group.name]);
      }
    }
    return { groups, names };
  }, [data]);
}

/** 只要「代號 → 族群名稱」時用，給表格多一欄。 */
export function useSymbolGroups(): Map<string, string[]> {
  return useGroupIndex().names;
}
