import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import RangeFilter from '../components/RangeFilter';
import SymbolSearch from '../components/SymbolSearch';
import { getAnnouncementHistory } from '../api/announcement';
import { HistoryParams } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatDate, marketLabel } from '../utils/format';

export default function Announcements() {
  const { symbol } = useSymbol();
  const [params, setParams] = useState<HistoryParams>({ limit: 30 });
  // 說明全文常常好幾百字，預設收合，點開才展開那一則。
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    () => getAnnouncementHistory(symbol, params),
    [symbol, params.from, params.to, params.limit],
    { enabled: !!symbol }
  );

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="重大訊息"
        icon="campaign"
        subtitle={
          symbol
            ? `${symbol}${data?.name ? ` ${data.name}` : ''}${
                data?.market ? ` · ${marketLabel(data.market)}` : ''
              }`
            : undefined
        }
        right={
          <>
            <RangeFilter value={params} onChange={setParams} />
            <SymbolSearch />
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          涵蓋範圍是「開始收集之後的每一天」：上游只回最近一兩個交易日且沒有日期參數，
          排程停掉的那幾天補不回來。要篩掉例行公告（更名、法說會）可看「條款」欄。
        </p>

        {!symbol && <PageState kind="idle" hint="在右上角輸入股票代號，或從左側自選股清單挑一檔。" />}
        {symbol && loading && <PageState kind="loading" />}
        {symbol && error && <PageState kind="error" message={error} onRetry={reload} />}
        {symbol && !loading && !error && items.length === 0 && (
          <PageState
            kind="empty"
            message="這段期間沒有重大訊息"
            hint="一則都沒有是常態：多數公司一個月發不到一則。"
          />
        )}

        <div className="space-y-3">
          {items.map((row) => {
            const key = `${row.announced_at}-${row.subject}`;
            const isOpen = expanded === key;
            return (
              <article
                key={key}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-sm"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full text-left px-5 py-4 hover:bg-surface-container-low/50 transition-colors"
                >
                  <div className="flex items-center gap-3 font-body-sm text-body-sm text-on-surface-variant mb-1.5">
                    <span className="tabular">{row.announced_at}</span>
                    {row.clause && (
                      <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">
                        {row.clause}
                      </span>
                    )}
                    {row.occurred_on && <span>事實發生日 {formatDate(row.occurred_on)}</span>}
                    <span className="material-symbols-outlined text-[16px] ml-auto">
                      {isOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                  <h3 className="font-body-md text-body-md font-medium text-on-surface">{row.subject}</h3>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-outline-variant pt-4">
                    {/* 說明是公司填的制式問答，原文帶換行，用 whitespace-pre-wrap 保留。 */}
                    <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap leading-relaxed">
                      {row.detail}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
