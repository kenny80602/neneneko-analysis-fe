import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import { getFinancialRanks } from '../api/financial';
import { Market } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatNumber,
  formatPrice,
  formatSignedPercent,
  formatThousandTWD,
  marketLabel,
  quoteColor,
} from '../utils/format';

// 全市場 ROE 排行。
//
// 跟「市場概況」那幾張排行榜刻意分開：那些是當日的成交量與漲跌幅，天天換、
// 來自交易所；這一張是一季才換一次的公司體質，來自公開資訊觀測站。
// 更新頻率差了六十倍，混在同一頁會讓人以為 ROE 也是今天的數字。
//
// 名次與篩選全部在後端算（min_roe 篩的是年化值、名次的母體看有沒有指定市場），
// 前端只負責送參數與顯示。

/** 市場篩選。空字串代表兩個市場一起排。 */
const MARKETS: { label: string; value: '' | Market }[] = [
  { label: '全部市場', value: '' },
  { label: '僅上市', value: 'TWSE' },
  { label: '僅上櫃', value: 'TPEx' },
];

/** 名次要看幾筆。上限 500 是後端定的。 */
const LIMITS = [50, 100, 200, 500];

/**
 * 年化 ROE 的門檻。
 *
 * 篩的是年化值而不是累計值：講「ROE 15% 以上」講的是年度水準，
 * 拿上半年的累計 ROE 去比 15% 會把一堆好公司篩掉。
 */
const MIN_ROES = [
  { label: '不限', value: 0 },
  { label: '≥ 10%', value: 10 },
  { label: '≥ 15%', value: 15 },
  { label: '≥ 20%', value: 20 },
  { label: '≥ 30%', value: 30 },
];

const headCell =
  'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
const numberCell = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';
const selectClass =
  'px-3 py-2 bg-surface-container border border-outline-variant rounded font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary';

export default function RoeRanks() {
  const { setSymbol } = useSymbol();
  const [market, setMarket] = useState<'' | Market>('');
  const [minRoe, setMinRoe] = useState(0);
  const [limit, setLimit] = useState(50);

  // deps 放原始值不放物件：物件每次 render 都是新的，會無限重抓。
  // 不輪詢——財報一季才換一次。
  const { data, loading, error, reload } = useAsyncData(
    () =>
      getFinancialRanks({
        market: market || undefined,
        min_roe: minRoe || undefined,
        limit,
      }),
    [market, minRoe, limit]
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  // 負淨值排不進榜的家數。這個差額本身就是資訊：那幾家不是 ROE 低，是算不出來。
  const unranked = data ? data.total - data.ranked : 0;

  return (
    <>
      <PageHeader
        title="ROE 排行"
        icon="leaderboard"
        subtitle={
          data?.period
            ? `${data.period}．年化股東權益報酬率由高到低`
            : '全市場的股東權益報酬率排行'
        }
        right={
          <>
            <select
              value={market}
              onChange={(event) => setMarket(event.target.value as '' | Market)}
              className={`${selectClass} w-32`}
            >
              {MARKETS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={minRoe}
              onChange={(event) => setMinRoe(Number(event.target.value))}
              className={`${selectClass} w-28`}
            >
              {MIN_ROES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className={`${selectClass} w-28`}
            >
              {LIMITS.map((value) => (
                <option key={value} value={value}>
                  前 {value} 名
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
          ROE ＝ 稅後淨利 ÷ 股東權益，衡量公司拿股東的錢賺回多少。這一頁排的是
          <span className="text-on-surface font-semibold">年化 ROE</span>
          ：上游的財報金額是<span className="text-on-surface font-semibold">累計數</span>
          （2026Q2 那一列指的是上半年），年化＝累計 ÷ 季數 × 4，才拿得去跟「一年賺幾成」比。
          <span className="text-on-surface font-semibold">
            年化是推估不是實績
          </span>
          ——旺季在下半年的公司用上半年推會低估，所以表上把累計值一起列出來。
          分子只取「歸屬母公司」的淨利、分母只取「歸屬母公司」的權益，兩邊口徑一致。
          資料一季才換一次，跟「市場概況」那幾張天天變的排行榜不是同一回事。
        </p>

        {loading && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reload} />}

        {!loading && !error && data && !data.period && (
          <PageState
            kind="empty"
            message="這張表還沒有任何資料"
            hint="財報是跟月營收同一個排程收集的（cmd/notify -collect-mops），而且從 2026-08-16 才開始收。當季各家陸續申報的期間，這裡本來就是從零筆長上來。"
          />
        )}

        {!loading && !error && data?.period && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
              <StatCard
                label="資料季別"
                icon="calendar_month"
                value={data.period}
                hint="財報一季換一次，不是今天的數字"
              />
              <StatCard
                label="收集到的家數"
                icon="domain"
                value={formatNumber(data.total)}
                hint="家，這一季已經申報並收下來的"
              />
              <StatCard
                label="排得出名次"
                icon="format_list_numbered"
                value={formatNumber(data.ranked)}
                hint={`家，名次的分母${unranked > 0 ? `；另有 ${formatNumber(unranked)} 家負淨值排不進榜` : ''}`}
              />
              <StatCard
                label="這次列出"
                icon="filter_list"
                value={formatNumber(data.count)}
                hint={`家${minRoe > 0 ? `，年化 ROE ≥ ${minRoe}%` : ''}${
                  market ? `，${marketLabel(market)}` : ''
                }`}
              />
            </div>

            {items.length === 0 ? (
              <PageState
                kind="empty"
                message="這個條件下沒有任何一家"
                hint="把門檻調低或改成全部市場看看。門檻篩的是年化 ROE，而多數公司的年度 ROE 落在 10% 以下。"
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
                <table className="w-full border-collapse">
                  <thead className="bg-surface-container-low border-b border-outline-variant">
                    <tr>
                      <th className={`${headCell} pl-4 text-right`}>名次</th>
                      <th className={`${headCell} text-left`}>股號 / 名稱</th>
                      <th className={`${headCell} text-left`}>市場</th>
                      <th className={`${headCell} text-right text-primary`}>ROE（年化）</th>
                      <th className={`${headCell} text-right`}>ROE（累計）</th>
                      <th className={`${headCell} text-right`}>EPS</th>
                      <th className={`${headCell} text-right`}>每股淨值</th>
                      <th className={`${headCell} text-right`}>稅後淨利</th>
                      <th className={`${headCell} pr-4 text-right`}>股東權益</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {items.map((item) => (
                      <tr
                        key={`${item.symbol}-${item.period}`}
                        onClick={() => setSymbol(item.symbol)}
                        title="點擊切換到這一檔"
                        className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                      >
                        <td className={`${numberCell} pl-4 text-on-surface-variant`}>
                          {item.rank}
                        </td>
                        <td className="p-2 py-3 whitespace-nowrap">
                          <span className="font-data-md text-data-md text-primary font-bold">
                            {item.symbol}
                          </span>
                          <span className="block font-body-sm text-body-sm text-on-surface-variant">
                            {item.name || DASH}
                          </span>
                        </td>
                        <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                          {marketLabel(item.market)}
                        </td>
                        <td className={`${numberCell} font-bold ${quoteColor(item.annualized_roe)}`}>
                          {formatSignedPercent(item.annualized_roe)}
                        </td>
                        {/* 累計值一起列：年化是拿累計推的，看得到原始值才知道推了幾倍。 */}
                        <td className={`${numberCell} ${quoteColor(item.roe)}`}>
                          {formatSignedPercent(item.roe)}
                        </td>
                        <td className={`${numberCell} text-on-surface`}>
                          {item.eps == null ? DASH : formatPrice(item.eps)}
                        </td>
                        <td className={`${numberCell} text-on-surface-variant`}>
                          {item.book_value_per_share == null
                            ? DASH
                            : formatPrice(item.book_value_per_share)}
                        </td>
                        {/* 上游單位是仟元，走跟月營收同一支換算，免得兩頁的量級不一致。 */}
                        <td className={`${numberCell} ${quoteColor(item.net_income)}`}>
                          {formatThousandTWD(item.net_income)}
                        </td>
                        <td className={`${numberCell} text-on-surface-variant`}>
                          {formatThousandTWD(item.equity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              名次是「這次查詢的母體」裡的名次——選了單一市場就是那個市場的名次，
              而門檻只篩掉排序後的尾端，
              <span className="text-on-surface font-semibold">不影響名次本身</span>
              （所以列出來的名次可能不連續）。
              {unranked > 0 && (
                <>
                  　有 {formatNumber(unranked)} 家排不進榜，那是
                  <span className="text-on-surface font-semibold">負淨值算不出 ROE</span>
                  ，不是 ROE 低——虧到淨值為負的公司除下去會得到「正的」ROE，比破折號更誤導人。
                </>
              )}
              　金融業（銀行、保險、證券、金控）不在上游的一般業報表裡，整個產業都不會出現在這張表上。
              點任何一列可以切換代號，再去個股總覽看那一檔的逐季 ROE。
            </p>
          </>
        )}
      </div>
    </>
  );
}
