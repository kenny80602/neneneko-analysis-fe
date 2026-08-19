import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import MacroCard from '../components/MacroIndicatorCard';
import TrendChart from '../components/TrendChart';
import {
  getEconomy,
  getFOMCMeetings,
  getFOMCStatements,
  getMacroIndicators,
  getMeetingTrend,
  getRateExpectations,
} from '../api/macroIndicators';
import { FOMCStatement, RateExpectation } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import { DASH, formatNumber, formatPercent, formatSigned } from '../utils/format';

// Fed 與美國總經：升息機率、FOMC 會議日程、經濟統計。
//
// 為什麼跟市場概況的「國際指標」分成兩頁：那兩張卡是觀測值（上游給什麼就是什麼），
// 這一頁三塊的性質完全不同，混在同一頁會被用同一種語氣讀：
//
//   升息機率  **推算值**，由聯邦基金期貨反推，依賴一整組假設
//   會議日程  行事曆，不會出錯，但表是手動維護的，會用完
//   經濟統計  官方統計的原樣轉述，但永遠是回頭看的（上個月、上一季）
//
// 三塊各自一個 useAsyncData：升息機率要打 Yahoo 的期貨報價、經濟統計打 FRED、
// 日程是後端寫死的表，失敗模式完全不同，任何一塊掛掉不該讓另外兩塊跟著空白。

/** 機率走勢預設回看幾天。 */
const TREND_DAYS = 90;

const headCell =
  'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
const numCell = 'p-2 py-3 text-right font-data-md text-data-md';

export default function Macro() {
  return (
    <>
      <PageHeader
        title="Fed 與總經"
        icon="account_balance"
        subtitle="VIX 與油價、市場對 Fed 的定價、會議日程，以及美國的通膨、就業與成長"
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這一頁的數字<span className="text-on-surface font-semibold">沒有一個是台股資料</span>
          ，時區、交易時段與公布節奏都跟台股不同。Fed 的決策在台北時間凌晨兩三點公布，
          台股要到再下一個交易日才反應得到。破折號代表「沒有這個數字」而不是 0。
        </p>

        <IndicatorsSection />
        <RatesSection />
        <StatementsSection />
        <MeetingsSection />
        <EconomySection />
      </div>
    </>
  );
}

/**
 * 國際指標：VIX 與布蘭特原油。
 *
 * 市場概況也有同一組卡（那裡是掃一眼大盤的脈絡），這裡則是「總經」這件事的完整版
 * ——同一份資料兩個入口，但卡片是共用元件，說明只有一份不會分岔。
 */
function IndicatorsSection() {
  // 不輪詢：這兩支的上游一天只更新一次收盤。
  const { data, loading, error, reload } = useAsyncData(() => getMacroIndicators(), []);
  const items = data?.items ?? [];

  return (
    <section className="flex flex-col gap-stack-md">
      <div className="flex flex-wrap items-baseline justify-between gap-stack-sm">
        <h2 className="font-headline-md text-headline-md text-primary">國際指標</h2>
        <button
          type="button"
          onClick={reload}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          重新整理
        </button>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        美股與紐約商品交易所收盤時台灣是清晨，所以盤中看到的
        <span className="text-on-surface font-semibold">永遠是昨晚的收盤</span>
        ，時間標在卡片下方。
        <span className="text-on-surface font-semibold">這兩個的「上漲」都不是好消息</span>
        ，所以不用台股的漲紅跌綠——數值走中性色，方向用文字講。
      </p>

      {loading && <PageState kind="loading" />}
      {error && <PageState kind="error" message={error} onRetry={reload} />}

      {!loading && !error && items.length === 0 && (
        <PageState
          kind="empty"
          message="這次沒取到國際指標"
          hint="這兩支直接打 Yahoo 與 FRED，上游限流或暫時掛掉時會是空的。跟「數值是 0」是兩回事——VIX 與油價的 0 都是不可能的值。"
        />
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-stack-md">
          {items.map((item) => (
            <MacroCard key={item.symbol} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * 升息機率。
 *
 * ⚠️ 這是**推算值**，不是 Fed 的官方預告，也不是 CME FedWatch 的官方數值。
 * 後端回的 source 與 assumptions 一定要顯示在機率旁邊，不能收進說明區——
 * 這幾個數字長得很像官方預測，不標的話會被那樣讀。
 */
function RatesSection() {
  const rates = useAsyncData(() => getRateExpectations(), []);
  const snapshot = rates.data;

  // 想看哪一次會議的機率走勢。空字串＝跟著後端的預設（最近一次會議）。
  const [meeting, setMeeting] = useState('');
  const trend = useAsyncData(
    () => getMeetingTrend({ meeting: meeting || undefined, days: TREND_DAYS }),
    [meeting]
  );

  // 三條線疊在同一張圖：單獨看「升息機率」看不出它是從誰那裡搶來的機率。
  const series = useMemo(() => {
    const points = trend.data?.points ?? [];
    if (points.length === 0) return [];
    return [
      {
        label: '不動',
        points: points.map((p) => ({ date: p.date, value: p.hold_probability })),
        className: 'stroke-on-surface-variant',
      },
      {
        label: '降息',
        points: points.map((p) => ({ date: p.date, value: p.cut_probability })),
        className: 'stroke-secondary',
      },
      {
        label: '升息',
        points: points.map((p) => ({ date: p.date, value: p.hike_probability })),
        className: 'stroke-error',
      },
    ];
  }, [trend.data]);

  const next = snapshot?.expectations[0];

  return (
    <section className="flex flex-col gap-stack-md">
      <div className="flex flex-wrap items-baseline justify-between gap-stack-sm">
        <h2 className="font-headline-md text-headline-md text-primary">升息機率</h2>
        <button
          type="button"
          onClick={rates.reload}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          重新整理
        </button>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        <span className="text-error font-semibold">這是推算值，不是 Fed 的官方預告。</span>
        由聯邦基金期貨的報價反推而來，反映的是市場的定價而不是任何人的承諾。
        機率會隨每天的期貨報價變動，CPI 或就業數據公布當天常常整排跳動。
      </p>

      {rates.loading && <PageState kind="loading" />}
      {rates.error && <PageState kind="error" message={rates.error} onRetry={rates.reload} />}

      {!rates.loading && !rates.error && snapshot && snapshot.expectations.length === 0 && (
        <PageState
          kind="empty"
          message="這次沒算出任何一次會議的機率"
          hint={`可能是上游的期貨報價取不到，也可能是內建的 FOMC 日程已經用完（涵蓋到 ${
            snapshot.schedule_through || '未知'
          }）。後者要更新後端那張表，不是資料錯了。`}
        />
      )}

      {snapshot && next && (
        <>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 flex flex-col gap-stack-sm shadow-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                下一次會議
              </span>
              <span className="font-data-md text-data-md text-on-surface">
                {next.meeting_date}
              </span>
              {next.has_projection && (
                <span className="px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant font-body-sm text-body-sm text-on-surface">
                  附點陣圖
                </span>
              )}
              <span className="ml-auto font-body-sm text-body-sm text-on-surface-variant">
                計算日 {snapshot.date || DASH}／目前 EFFR{' '}
                {formatPercent(snapshot.current_effr)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-stack-sm">
              <ProbabilityCell label="升息" value={next.hike_probability} tone="text-error" />
              <ProbabilityCell label="不動" value={next.hold_probability} tone="text-on-surface" />
              <ProbabilityCell label="降息" value={next.cut_probability} tone="text-secondary" />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {next.outcomes.map((outcome) => (
                <span
                  key={outcome.steps}
                  className="px-2 py-1 rounded bg-surface-container-low border border-outline-variant font-body-sm text-body-sm text-on-surface"
                >
                  {outcome.label} {formatPercent(outcome.probability, 1)}
                </span>
              ))}
            </div>

            {/* change_bps 是期望值不是任何一種結果，所以講成「隱含」而不是「會升幾碼」。 */}
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              隱含變動 {formatSigned(next.change_bps, 1)} 個基點（
              {formatPercent(next.rate_before, 2)} → {formatPercent(next.rate_after, 2)}）。
              這是期望值不是任何一種結果——「+12.5 個基點」的意思是「一半機率升一碼」，
              不是「會升半碼」。反推所用的合約：
              <span className="ml-1 font-data-md text-data-md text-on-surface">
                {next.contract_symbol || DASH}
              </span>
              。
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className={`${headCell} pl-4 text-left`}>會議日</th>
                  <th className={`${headCell} text-right`}>升息</th>
                  <th className={`${headCell} text-right`}>不動</th>
                  <th className={`${headCell} text-right`}>降息</th>
                  <th className={`${headCell} text-right`}>隱含變動</th>
                  <th className={`${headCell} text-right`}>會後利率</th>
                  <th className={`${headCell} pr-4 text-right`}>機率走勢</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {snapshot.expectations.map((item) => (
                  <ExpectationRow
                    key={item.meeting_date}
                    item={item}
                    selected={
                      meeting === item.meeting_date ||
                      (meeting === '' && item.meeting_date === trend.data?.meeting_date)
                    }
                    onSelect={() => setMeeting(item.meeting_date)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            <span className="text-on-surface font-semibold">越下面的越不可靠</span>
            ：每一次的會前利率是前一次算出來的會後利率，誤差會一路累積，而且遠月合約成交稀疏。
            內建日程涵蓋到 {snapshot.schedule_through || DASH}，會議數比預期少時多半是那張表該更新了。
          </p>

          <div className="flex flex-col gap-stack-sm">
            <h3 className="font-body-md text-body-md text-on-surface font-semibold">
              {trend.data?.meeting_date ?? next.meeting_date} 這一次的機率變化（近 {TREND_DAYS} 天）
            </h3>
            {trend.loading && <PageState kind="loading" />}
            {trend.error && (
              <PageState kind="error" message={trend.error} onRetry={trend.reload} />
            )}
            {!trend.loading && !trend.error && series.length === 0 && (
              <PageState
                kind="empty"
                message="這一次會議還沒有累積到機率歷史"
                hint="歷史是每天收一次存下來的，補不回來，所以剛開始收集時只有幾個點。換一次比較近的會議通常就有。"
              />
            )}
            {series.length > 0 && (
              <TrendChart
                series={series}
                unit="%"
                digits={0}
                footnote="三條加起來等於 100%：升息機率上升一定是從「不動」或「降息」那裡搬過來的。單看一條會把「重新分配」讀成「憑空多出來」。"
              />
            )}
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-4 flex flex-col gap-stack-sm">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              這組機率依賴的假設
            </p>
            <ul className="flex flex-col gap-1 font-body-sm text-body-sm text-on-surface-variant list-disc pl-5">
              {snapshot.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
            <p className="font-body-sm text-body-sm text-outline">{snapshot.source}</p>
          </div>
        </>
      )}
    </section>
  );
}

/** 三個方向其中一個的機率。 */
function ProbabilityCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-lg bg-surface-container-low p-3">
      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">{label}</p>
      <p className={`font-data-lg text-data-lg ${tone}`}>{formatPercent(value, 1)}</p>
    </div>
  );
}

/** 逐次會議那張表的一列。點下去換下面那張圖畫哪一次。 */
function ExpectationRow({
  item,
  selected,
  onSelect,
}: {
  item: RateExpectation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      className={`transition-colors ${
        selected ? 'bg-surface-container-low' : 'hover:bg-surface-container-low/50'
      }`}
    >
      <td className="p-2 py-3 pl-4 font-data-md text-data-md text-on-surface whitespace-nowrap">
        {item.meeting_date}
        {item.has_projection && (
          <span className="ml-2 px-1.5 py-0.5 rounded bg-surface-container font-body-sm text-body-sm text-on-surface-variant">
            點陣圖
          </span>
        )}
      </td>
      <td className={`${numCell} text-error`}>{formatPercent(item.hike_probability, 1)}</td>
      <td className={`${numCell} text-on-surface`}>{formatPercent(item.hold_probability, 1)}</td>
      <td className={`${numCell} text-secondary`}>{formatPercent(item.cut_probability, 1)}</td>
      <td className={`${numCell} text-on-surface-variant`}>
        {formatSigned(item.change_bps, 1)} bp
      </td>
      <td className={`${numCell} text-on-surface`}>{formatPercent(item.rate_after, 2)}</td>
      <td className="p-2 py-3 pr-4 text-right">
        <button
          type="button"
          onClick={onSelect}
          className="px-2 py-1 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors"
        >
          {selected ? '圖上這一次' : '看走勢'}
        </button>
      </td>
    </tr>
  );
}

/**
 * 決策聲明（英文原文）。
 *
 * ⚠️ 不翻譯也不摘要，這是刻意的：市場在意的是「somewhat elevated」變成
 * 「elevated」、「will be patient」被拿掉這種一兩個字的差異，翻譯或摘要一定會把
 * 那個差異抹平，而抹平之後看起來仍然很像原文，沒有人會發現。要中文的人請自己
 * 點原文連結去翻——那樣至少知道自己讀的是翻譯。
 */
function StatementsSection() {
  const statements = useAsyncData(() => getFOMCStatements(), []);
  const data = statements.data;
  // 預設只展開最新一次：一則聲明六到八段，全部展開要捲很久，
  // 而多數時候要看的就是最新那一次。
  const [openDate, setOpenDate] = useState('');

  return (
    <section className="flex flex-col gap-stack-md">
      <h2 className="font-headline-md text-headline-md text-primary">決策聲明</h2>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        會期最後一天美東 14:00 發布的官方聲明，
        <span className="text-on-surface font-semibold">英文原文，未翻譯也未摘要</span>
        ——市場在意的是「somewhat elevated」變成「elevated」這種一兩個字的差異，
        翻譯會把那個差異抹平。這是會議當下唯一拿得到的官方說法：點陣圖只有四次會議有、
        會議紀要要三週後才出、記者會沒有逐字稿。
        <span className="text-on-surface font-semibold">跟上一次比措辭改了什麼</span>
        才是這份文件的讀法，所以這裡一次列好幾次。
      </p>

      {statements.loading && <PageState kind="loading" />}
      {statements.error && (
        <PageState kind="error" message={statements.error} onRetry={statements.reload} />
      )}

      {!statements.loading && !statements.error && data && data.items.length === 0 && (
        <PageState
          kind="empty"
          message="還沒有收到任何一次的聲明"
          hint="這一份要後端先去 Fed 官網收一次才有（POST /macro/statements/collect 或等排程）。空的不代表 Fed 沒有開會。"
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="flex flex-col gap-stack-sm">
            {data.items.map((item, index) => (
              <StatementCard
                key={item.meeting_date}
                item={item}
                // 最新那一次預設展開，其餘要點才開。
                open={openDate === item.meeting_date || (openDate === '' && index === 0)}
                onToggle={() =>
                  setOpenDate(
                    openDate === item.meeting_date ? 'none' : item.meeting_date
                  )
                }
              />
            ))}
          </div>
          <p className="font-body-sm text-body-sm text-outline">{data.source}</p>
        </>
      )}
    </section>
  );
}

/** 一次會議的聲明。 */
function StatementCard({
  item,
  open,
  onToggle,
}: {
  item: FOMCStatement;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-wrap items-baseline gap-2 p-4 text-left"
      >
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
          {open ? 'expand_more' : 'chevron_right'}
        </span>
        <span className="font-data-md text-data-md text-on-surface">{item.meeting_date}</span>
        <span className="font-body-md text-body-md text-on-surface-variant">{item.title}</span>
        <span className="ml-auto font-body-sm text-body-sm text-outline">
          {/* 發布時刻是台北時間：台灣人看到的是凌晨兩三點，這才回答「什麼時候公布的」。 */}
          {item.released_at
            ? `台北 ${item.released_at.slice(0, 16).replace('T', ' ')} 公布`
            : DASH}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-stack-sm border-t border-outline-variant pt-3">
          {item.paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className="font-body-md text-body-md text-on-surface leading-relaxed"
            >
              {paragraph}
            </p>
          ))}

          <div className="flex flex-wrap gap-stack-md pt-1">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="font-body-sm text-body-sm text-primary underline"
            >
              Fed 官網原文
            </a>
            {item.minutes_url ? (
              <a
                href={item.minutes_url}
                target="_blank"
                rel="noreferrer"
                className="font-body-sm text-body-sm text-primary underline"
              >
                會議紀要全文
              </a>
            ) : (
              // 空字串是常態不是漏抓：紀要在會後三週才公布。
              <span className="font-body-sm text-body-sm text-outline">
                會議紀要要會後三週才公布
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * FOMC 會議日程。
 *
 * 這一份是後端手動維護的靜態表（Fed 沒有提供 API），過時的方式跟其他端點不同：
 * 它不會回舊數字，而是直接少掉未來的會議，所以 stale 一定要提示——
 * 那張表同時也是升息機率的輸入。
 */
function MeetingsSection() {
  const meetings = useAsyncData(() => getFOMCMeetings(), []);
  const schedule = meetings.data;

  return (
    <section className="flex flex-col gap-stack-md">
      <h2 className="font-headline-md text-headline-md text-primary">FOMC 會議日程</h2>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        會期日期是<span className="text-on-surface font-semibold">美東日期</span>
        （財經媒體講的「9 月會議」就是這個），
        <span className="text-on-surface font-semibold">台北公布時間</span>
        那一欄才回答「台股哪一天會反應」——決策在台北凌晨兩三點公布，當天台股早就收盤了，
        要到再下一個交易日才反應得到。一年八次裡有四次附點陣圖與記者會，那幾次的市場反應通常大得多。
      </p>

      {meetings.loading && <PageState kind="loading" />}
      {meetings.error && (
        <PageState kind="error" message={meetings.error} onRetry={meetings.reload} />
      )}

      {schedule?.stale && (
        <p className="rounded-xl border border-error/40 bg-error/10 p-3 font-body-sm text-body-sm text-error">
          內建日程只到 {schedule.schedule_through || DASH}，剩不到半年。
          這張表同時也是升息機率的輸入，過期之後遠月的機率會一起算不出來——要回後端補新的年度日程。
        </p>
      )}

      {schedule && schedule.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className={`${headCell} pl-4 text-left`}>會期（美東）</th>
                  <th className={`${headCell} text-left`}>台北公布時間</th>
                  <th className={`${headCell} text-left`}>點陣圖</th>
                  <th className={`${headCell} pr-4 text-right`}>還有幾天</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {schedule.items.map((item) => (
                  <tr
                    key={item.end}
                    className="hover:bg-surface-container-low/50 transition-colors"
                  >
                    <td className="p-2 py-3 pl-4 font-data-md text-data-md text-on-surface whitespace-nowrap">
                      {item.start === item.end ? item.end : `${item.start} ～ ${item.end}`}
                    </td>
                    <td className="p-2 py-3 font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                      {item.announcement_at_tw
                        ? item.announcement_at_tw.slice(0, 16).replace('T', ' ')
                        : DASH}
                    </td>
                    <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant">
                      {item.has_projection ? '附點陣圖與記者會' : DASH}
                    </td>
                    <td className={`${numCell} pr-4 text-on-surface`}>
                      {item.in_progress ? (
                        <span className="text-error font-semibold">開會中</span>
                      ) : (
                        `${formatNumber(item.days_until)} 天`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="font-body-sm text-body-sm text-outline">{schedule.source}</p>
        </>
      )}
    </section>
  );
}

/**
 * 美國經濟統計。
 *
 * ⚠️ 這一組**永遠是回頭看的**：失業率是上個月的、GDP 是上一季的、PCE 有兩個月延遲。
 * 每一列的參考期間一定要顯示，不然會被讀成當下的數字。
 */
function EconomySection() {
  const economy = useAsyncData(() => getEconomy(), []);
  const data = economy.data;

  return (
    <section className="flex flex-col gap-stack-md">
      <h2 className="font-headline-md text-headline-md text-primary">美國經濟數據</h2>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        <span className="text-on-surface font-semibold">每一個都是回頭看的數字</span>
        ：失業率是上個月的、GDP 是上一季的、PCE 通常有兩個月延遲，所以每一列都標了參考期間。
        政策利率是一個<span className="text-on-surface font-semibold">區間</span>不是單一數字——
        Fed 公布的就是「3.50% ~ 3.75%」，報成單一數字會失真。
      </p>

      {economy.loading && <PageState kind="loading" />}
      {economy.error && (
        <PageState kind="error" message={economy.error} onRetry={economy.reload} />
      )}

      {!economy.loading && !economy.error && data && data.items.length === 0 && (
        <PageState
          kind="empty"
          message="這次沒取到經濟數據"
          hint="這一組直接打 FRED，上游掛掉或限流時整包會是空的。按重新整理再試一次。"
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-stack-md">
            {data.items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm flex flex-col gap-1"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    {item.name}
                  </span>
                  <span className="ml-auto font-data-md text-data-md text-outline">{item.id}</span>
                </div>
                {/* display 由後端組：區間與單點的組法不同，前端各拼一次一定有人漏掉區間。 */}
                <p className="font-data-lg text-data-lg text-on-surface">{item.display}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  參考期間 {item.period || DASH}
                </p>
              </div>
            ))}
          </div>

          <p className="font-body-sm text-body-sm text-outline">{data.source}</p>
        </>
      )}
    </section>
  );
}
