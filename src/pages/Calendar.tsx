import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getMarketCalendar } from '../api/calendar';
import {
  ExRightPreview,
  InvestorConference,
  MarketCalendar,
} from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import { DASH, formatDate, formatNumber, formatPrice, marketLabel, today } from '../utils/format';

// 台股行事曆：這段期間會發生什麼。
//
// 資料有三種來源，語意不同，畫面上一定要分得出來，否則使用者會把推算值當成公告值：
//
//   1. 上游公告：休市日（證交所）、除權息預告（兩個市場各一份）。
//   2. 已落地的紀錄：法說會。兩個交易所的 OpenAPI 都沒有法說會資料集，
//      公司是用重大訊息公告的，所以是從已經收下來的重大訊息撈出來的。
//   3. 規則推算：期貨結算日（第三個星期三）、財報申報期限（法規統一期限）。
//
// 推算的那兩種在畫面上標「推算」徽章並在說明文字裡講清楚。混在一起而不標的話，
// 某年因為連假調整而不準時，使用者會以為是資料錯了。
//
// 數字與日期一個都不在這裡算：全部來自 GET /stocks/calendar。

/** 可選的區間長度。除權息預告表上游本來就只有未來幾個月，再長也沒東西。 */
const RANGES = [
  { label: '未來 30 天', days: 30 },
  { label: '未來 60 天', days: 60 },
  { label: '未來 90 天', days: 90 },
];

const headCell =
  'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
const numberCell = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';
const tableWrap =
  'overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm';

const EX_RIGHT_LABELS: Record<ExRightPreview['kind'], string> = {
  DIVIDEND: '除息',
  RIGHT: '除權',
  BOTH: '除權息',
};

/** 從 YYYY-MM-DD 往後推 n 天，回同樣格式。用台北時區的日界，跟後端一致。 */
function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00+08:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

/** 這一天是星期幾。休市日那份上游有給，其餘要自己標。 */
function weekdayOf(date: string): string {
  const day = new Date(`${date}T00:00:00+08:00`).getDay();
  return '日一二三四五六'[day] ?? '';
}

/** 市場層級的一則事件。休市、結算、財報期限攤成同一條時間軸。 */
interface MarketEvent {
  date: string;
  weekday: string;
  /** 徽章文字。 */
  kind: string;
  /** 徽章配色。 */
  tone: 'closed' | 'trading' | 'settlement' | 'deadline';
  title: string;
  note: string;
  /** 這一則是照規則推算的，不是上游公告的。 */
  derived: boolean;
}

/**
 * 把休市日、期貨結算日與財報期限併成一條時間軸。
 *
 * 分三張表的話，使用者要在三個地方各看一次才知道「下週三會發生什麼」，
 * 而這一頁問的就是那個問題。每一列自己帶著徽章與「推算」標記，來源仍然分得出來。
 */
function toEvents(calendar: MarketCalendar): MarketEvent[] {
  const events: MarketEvent[] = [];

  for (const h of calendar.holidays) {
    events.push({
      date: h.date,
      weekday: h.weekday || weekdayOf(h.date),
      // 有交易的提醒日（春節前最後交易日）不能畫成休市——那天是可以下單的。
      kind: h.trading ? '交易提醒' : h.settlement_only ? '僅結算交割' : '休市',
      tone: h.trading ? 'trading' : 'closed',
      title: h.name,
      note: h.settlement_only
        ? '市場無交易，但券商照樣辦理結算交割，扣款會照常發生'
        : h.description,
      derived: false,
    });
  }

  for (const s of calendar.settlements) {
    events.push({
      date: s.date,
      weekday: weekdayOf(s.date),
      kind: '期貨結算',
      tone: 'settlement',
      title: '台指期／選擇權月契約結算',
      note: s.shifted
        ? '原本的第三個星期三遇休市，這是順延後的日期，請再對一次期交所公告'
        : '每月第三個星期三',
      derived: true,
    });
  }

  for (const d of calendar.deadlines) {
    events.push({
      date: d.date,
      weekday: weekdayOf(d.date),
      kind: '申報期限',
      tone: 'deadline',
      title: d.label,
      note: d.note,
      derived: true,
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

const TONE_CLASS: Record<MarketEvent['tone'], string> = {
  closed: 'bg-error-container/40 text-error',
  trading: 'bg-secondary-container/50 text-secondary',
  settlement: 'bg-primary-container/40 text-primary',
  deadline: 'bg-surface-container text-on-surface-variant',
};

export default function Calendar() {
  const [days, setDays] = useState(60);

  // 不輪詢：這一支要打兩個交易所的 OpenAPI，而行事曆一天內不會變。
  // 區間變了才重抓，deps 放原始值（數字）不放物件。
  const from = today();
  const to = useMemo(() => addDays(from, days), [from, days]);
  const { data, loading, error, reload } = useAsyncData(
    () => getMarketCalendar({ from, to }),
    [from, to]
  );

  const events = useMemo(() => (data ? toEvents(data) : []), [data]);
  const failures = Object.entries(data?.failures ?? {});

  return (
    <>
      <PageHeader
        title="台股行事曆"
        icon="event"
        subtitle={
          data
            ? `${formatDate(data.from)} ～ ${formatDate(data.to)}．休市、結算、除權息、法說會`
            : '休市與結算日、除權除息、法人說明會、財報申報期限'
        }
        right={
          <>
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="px-3 py-2 bg-surface-container border border-outline-variant rounded font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary w-36"
            >
              {RANGES.map((range) => (
                <option key={range.days} value={range.days}>
                  {range.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={reload}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              重新整理
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這一頁的資料有三種來源，語意不一樣：
          <span className="text-on-surface font-semibold">休市日與除權息預告</span>
          是交易所公告的；
          <span className="text-on-surface font-semibold">法人說明會</span>
          是從已經收下來的重大訊息撈出來的——兩個交易所的 OpenAPI
          都沒有法說會資料集，公司是用重大訊息公告的，所以主旨是自由文字，
          解不出舉行日期的那幾筆只會顯示公告日與原文；
          <span className="text-on-surface font-semibold">期貨結算日與財報申報期限</span>
          則是照規則推算的（標了「推算」徽章）。
          推算的那兩種<span className="text-on-surface font-semibold">以主管機關公告為準</span>
          ，遇連假調整或另行公告時可能不準。
        </p>

        {loading && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reload} />}

        {!loading && !error && data && (
          <>
            {failures.length > 0 && (
              <p className="font-body-sm text-body-sm text-error bg-error-container/30 border border-error rounded-xl px-4 py-3">
                有 {failures.length} 個來源這次沒取到（{failures.map(([key]) => key).join('、')}），
                對應的區塊會是空的。
                <span className="text-on-surface font-semibold">
                  那不代表這段期間沒有事情發生
                </span>
                ，是上游沒回應——按重新整理再試一次。
              </p>
            )}

            {/* ── 市場行事曆 ── */}
            <section className="flex flex-col gap-stack-md">
              <h2 className="font-headline-md text-headline-md text-primary">
                市場行事曆（{events.length} 則）
              </h2>
              {events.length === 0 ? (
                <PageState
                  kind="empty"
                  message="這段期間沒有休市日、結算日或申報期限"
                  hint="把區間拉長看看。台股一年只有二十幾個休市日，短區間裡沒有是正常的。"
                />
              ) : (
                <div className={tableWrap}>
                  <table className="w-full border-collapse">
                    <thead className="bg-surface-container-low border-b border-outline-variant">
                      <tr>
                        <th className={`${headCell} pl-4 text-left`}>日期</th>
                        <th className={`${headCell} text-left`}>類型</th>
                        <th className={`${headCell} text-left`}>事件</th>
                        <th className={`${headCell} pr-4 text-left`}>說明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {events.map((event, index) => (
                        <tr
                          key={`${event.date}-${event.kind}-${index}`}
                          className="hover:bg-surface-container-low/50 transition-colors"
                        >
                          <td className="p-2 pl-4 py-3 whitespace-nowrap">
                            <span className="font-data-md text-data-md text-on-surface">
                              {formatDate(event.date)}
                            </span>
                            <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">
                              （{event.weekday}）
                            </span>
                          </td>
                          <td className="p-2 py-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded font-body-sm text-body-sm ${
                                TONE_CLASS[event.tone]
                              }`}
                            >
                              {event.kind}
                            </span>
                            {event.derived && (
                              <span
                                className="ml-2 font-body-sm text-body-sm text-outline"
                                title="依公開規則推算，不是上游公告的日期"
                              >
                                推算
                              </span>
                            )}
                          </td>
                          <td className="p-2 py-3 font-body-md text-body-md text-on-surface">
                            {event.title}
                          </td>
                          <td className="p-2 pr-4 py-3 font-body-sm text-body-sm text-on-surface-variant">
                            {event.note || DASH}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                「休市」是不能買賣的日子；
                <span className="text-on-surface font-semibold">「僅結算交割」那幾天雖然不能下單，券商仍會扣款交割</span>
                ，帳上的錢會動。「交易提醒」是有交易的日子（例如農曆春節前最後交易日），
                不要當成休市。股票交割是成交日後第二個交易日（T+2），所以連假前買進的
                扣款日要往後數兩個交易日，看上面這張表比較準。
                期貨結算只列月契約；週選擇權每週三都結算，全列出來會把這張表塞滿。
              </p>
            </section>

            {/* ── 除權除息 ── */}
            <ExRightSection rows={data.ex_rights} watchlist={data.watchlist} />

            {/* ── 法人說明會 ── */}
            <ConferenceSection rows={data.conferences} watchlist={data.watchlist} />
          </>
        )}
      </div>
    </>
  );
}

/** 自選股的標記。全市場一次一百多列，沒有這個要自己找自己那幾檔。 */
function WatchedMark({ watched }: { watched: boolean }) {
  if (!watched) return null;
  return (
    <span
      className="material-symbols-outlined text-[16px] text-primary align-middle ml-1"
      title="這一檔在你的自選股清單裡"
    >
      star
    </span>
  );
}

function ExRightSection({ rows, watchlist }: { rows: ExRightPreview[]; watchlist: number }) {
  const watched = rows.filter((row) => row.watched).length;

  return (
    <section className="flex flex-col gap-stack-md">
      <h2 className="font-headline-md text-headline-md text-primary">
        除權除息預告（{rows.length} 檔{watched > 0 && `，其中 ${watched} 檔在自選股`}）
      </h2>
      {rows.length === 0 ? (
        <PageState
          kind="empty"
          message="這段期間沒有公司除權息"
          hint="台股的除權息旺季集中在 6～8 月，其他月份本來就很少，這不是系統沒抓到。上游只給「接下來會發生的」，過去的除權息不在這份預告表裡。"
        />
      ) : (
        <div className={tableWrap}>
          <table className="w-full border-collapse">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className={`${headCell} pl-4 text-left`}>除權息日</th>
                <th className={`${headCell} text-left`}>股號 / 名稱</th>
                <th className={`${headCell} text-left`}>市場</th>
                <th className={`${headCell} text-left`}>類型</th>
                <th className={`${headCell} text-right`}>現金股利</th>
                <th className={`${headCell} text-right`}>配股率</th>
                <th className={`${headCell} pr-4 text-right`}>增資認購價</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {rows.map((row) => (
                <tr
                  key={`${row.date}-${row.market}-${row.symbol}`}
                  className={`hover:bg-surface-container-low/50 transition-colors ${
                    row.watched ? 'bg-primary-container/10' : ''
                  }`}
                >
                  <td className="p-2 pl-4 py-3 font-data-md text-data-md text-on-surface whitespace-nowrap">
                    {formatDate(row.date)}
                  </td>
                  <td className="p-2 py-3 whitespace-nowrap">
                    <span className="font-data-md text-data-md text-primary font-bold">
                      {row.symbol}
                    </span>
                    <WatchedMark watched={row.watched} />
                    <span className="block font-body-sm text-body-sm text-on-surface-variant">
                      {row.name}
                    </span>
                  </td>
                  <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                    {marketLabel(row.market)}
                  </td>
                  <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface whitespace-nowrap">
                    {EX_RIGHT_LABELS[row.kind]}
                  </td>
                  <td className={`${numberCell} text-on-surface`}>
                    {row.cash_dividend == null ? DASH : formatPrice(row.cash_dividend)}
                  </td>
                  {/* 配股率的單位是「每一股配幾股」不是元，跟左邊那一欄擺在一起
                      最容易被讀成金額，所以直接把單位寫在數字旁邊。 */}
                  <td className={`${numberCell} text-on-surface-variant`}>
                    {row.stock_dividend_ratio == null ? (
                      DASH
                    ) : (
                      <>
                        {formatNumber(row.stock_dividend_ratio * 1000, 2)}
                        <span className="ml-1 font-body-sm text-body-sm">股/千股</span>
                      </>
                    )}
                  </td>
                  <td className={`${numberCell} text-on-surface-variant`}>
                    {row.subscription_price_per_share == null
                      ? DASH
                      : formatPrice(row.subscription_price_per_share)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        除權息當天<span className="text-on-surface font-semibold">開盤參考價會扣掉權值</span>
        ，那不是下跌——股價從你手上換成現金或股票而已，帳面總值不變。
        現金股利單位是元／股，配股率是
        <span className="text-on-surface font-semibold">每千股配幾股</span>
        （上游給的是每股的比率，這裡乘一千比較好讀）。破折號代表這次沒配那一種，不是 0。
        {watchlist === 0 && '　目前自選股是空的，所以沒有任何一列被標記。'}
      </p>
    </section>
  );
}

function ConferenceSection({
  rows,
  watchlist,
}: {
  rows: InvestorConference[];
  watchlist: number;
}) {
  const watched = rows.filter((row) => row.watched).length;

  return (
    <section className="flex flex-col gap-stack-md">
      <h2 className="font-headline-md text-headline-md text-primary">
        法人說明會（{rows.length} 場{watched > 0 && `，其中 ${watched} 場在自選股`}）
      </h2>
      {rows.length === 0 ? (
        <PageState
          kind="empty"
          message="這段期間沒有公司公告法說會"
          hint="法說會是從重大訊息撈出來的，而重大訊息只收得到最近一兩個交易日的量（上游沒有歷史）。旺季在財報公布前後，平常一天只有幾場。"
        />
      ) : (
        <div className={tableWrap}>
          <table className="w-full border-collapse">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className={`${headCell} pl-4 text-left`}>舉行日</th>
                <th className={`${headCell} text-left`}>股號 / 名稱</th>
                <th className={`${headCell} text-left`}>市場</th>
                <th className={`${headCell} text-left`}>公告時間</th>
                <th className={`${headCell} pr-4 text-left`}>主旨</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {rows.map((row, index) => (
                <tr
                  key={`${row.symbol}-${row.announced_at}-${index}`}
                  className={`hover:bg-surface-container-low/50 transition-colors ${
                    row.watched ? 'bg-primary-container/10' : ''
                  }`}
                >
                  {/* 解不出舉行日期時顯示破折號，不要拿公告日頂替——
                      那會把「這天公告的」讀成「這天開的」。 */}
                  <td className="p-2 pl-4 py-3 font-data-md text-data-md text-on-surface whitespace-nowrap">
                    {row.event_date ? formatDate(row.event_date) : DASH}
                  </td>
                  <td className="p-2 py-3 whitespace-nowrap">
                    <span className="font-data-md text-data-md text-primary font-bold">
                      {row.symbol}
                    </span>
                    <WatchedMark watched={row.watched} />
                    <span className="block font-body-sm text-body-sm text-on-surface-variant">
                      {row.name}
                    </span>
                  </td>
                  <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                    {marketLabel(row.market)}
                  </td>
                  <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                    {formatDate(row.announced_at)}
                  </td>
                  <td className="p-2 pr-4 py-3 font-body-sm text-body-sm text-on-surface">
                    {row.subject}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        兩個交易所的 OpenAPI
        <span className="text-on-surface font-semibold">都沒有法說會的資料集</span>
        ，公司是用重大訊息公告的，所以這一段是從重大訊息裡撈關鍵字來的。
        主旨是公司自己寫的自由文字，
        <span className="text-on-surface font-semibold">
          「舉行日」欄位是從主旨解出來的，解不出來就顯示破折號
        </span>
        ——那時請直接看主旨原文，硬猜一個日期比不給更容易誤事。
        受邀參加券商舉辦的場次通常不對外開放，要不要參加請看公司自己的公告。
        {watchlist === 0 && '　目前自選股是空的，所以沒有任何一列被標記。'}
      </p>
    </section>
  );
}
