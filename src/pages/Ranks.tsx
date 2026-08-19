import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import { getFinancialRanks } from '../api/financial';
import { getRevenueRanks } from '../api/revenue';
import { Market, RevenueRanks } from '../api/types';
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

/** 這一頁的兩張排行。 */
type Tab = 'revenue' | 'roe';

const TABS: { value: Tab; label: string; hint: string }[] = [
  { value: 'revenue', label: '月營收排行', hint: '誰在長．一個月換一次' },
  { value: 'roe', label: 'ROE 排行', hint: '誰賺得有效率．一季換一次' },
];

/** 月營收的排序鍵。門檻一律篩年增率，不論排哪一個。 */
const REVENUE_SORTS: { value: RevenueRanks['sort']; label: string }[] = [
  { value: 'yoy', label: '年增率' },
  { value: 'mom', label: '月增率' },
  { value: 'revenue', label: '營收金額' },
];

/** 年增率門檻（%）。 */
const MIN_YOYS = [
  { label: '不限', value: 0 },
  { label: '≥ 20%', value: 20 },
  { label: '≥ 30%', value: 30 },
  { label: '≥ 50%', value: 50 },
  { label: '≥ 100%', value: 100 },
];

// 全市場排行：月營收（成長）與 ROE（體質）。
//
// 兩張併一頁而不是各開一頁：它們回答的是同一個問題的兩半——「誰在長」與
// 「誰賺得有效率」——而且形狀幾乎一樣（全市場、可篩市場、有門檻、有名次分母）。
// 分頁切換而不是上下堆疊：兩張的篩選列不同（月份 vs 季別、排序鍵 vs ROE 門檻），
// 堆在一起會有兩排控制項，使用者不知道哪一排管哪一張表。
//
// 跟「市場概況」那幾張排行榜刻意分開：那些是當日的成交量與漲跌幅，天天換、
// 來自交易所；這兩張一個月換一次、一個季換一次，來自公開資訊觀測站。
// 更新頻率差了幾十倍，混在同一頁會讓人以為它們也是今天的數字。
//
// 名次與篩選全部在後端算（門檻篩的是排序後的尾端、不影響名次；名次的母體看有沒有
// 指定市場），前端只負責送參數與顯示。

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


interface TableProps {
  market: '' | Market;
  limit: number;
  onPick: (symbol: string) => void;
}

export default function Ranks() {
  const { setSymbol } = useSymbol();
  const [tab, setTab] = useState<Tab>('revenue');
  // 市場與筆數兩張表都吃，放在頁首；排序鍵與門檻各屬各的，放在各自的表格上方。
  const [market, setMarket] = useState<'' | Market>('');
  const [limit, setLimit] = useState(50);

  return (
    <>
      <PageHeader
        title="全市場排行"
        icon="leaderboard"
        subtitle="月營收看誰在長，ROE 看誰賺得有效率"
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
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        {/* 分頁。兩張表的資料期間不同（月 vs 季），所以標籤上直接寫出換頻率。 */}
        <div className="flex flex-wrap gap-stack-sm border-b border-outline-variant">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
                tab === item.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="font-body-md text-body-md font-semibold">{item.label}</span>
              <span className="block font-body-sm text-body-sm text-on-surface-variant">
                {item.hint}
              </span>
            </button>
          ))}
        </div>

        {tab === 'revenue' ? (
          <RevenueRankTable market={market} limit={limit} onPick={setSymbol} />
        ) : (
          <RoeRankTable market={market} limit={limit} onPick={setSymbol} />
        )}
      </div>
    </>
  );
}

/** 月營收排行：誰在長。 */
function RevenueRankTable({ market, limit, onPick }: TableProps) {
  const [sort, setSort] = useState<RevenueRanks['sort']>('yoy');
  const [minYoy, setMinYoy] = useState(0);

  // deps 放原始值不放物件：物件每次 render 都是新的，會無限重抓。
  // 不輪詢——月營收一個月才換一份。
  const { data, loading, error, reload } = useAsyncData(
    () =>
      getRevenueRanks({
        sort,
        market: market || undefined,
        min_yoy: minYoy || undefined,
        limit,
      }),
    [sort, minYoy, market, limit]
  );

  const items = data?.items ?? [];
  // 排不進名次的家數。排序鍵是營收金額時這個差額會是 0——金額不需要基期。
  const unranked = data ? data.total - data.ranked : 0;

  return (
    <>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        月營收是<span className="text-on-surface font-semibold">唯一涵蓋全市場的落地資料</span>
        （一千九百多家，每一筆都帶官方產業別），所以這一頁才排得出真正的全市場名次——
        收盤價與估值只收自選股，拿來排會變成「自選股內排名」。
        月份預設是<span className="text-on-surface font-semibold">目前收集到最新的那個月</span>
        而不是當月：公司要到每月 10 日前才陸續公告，月初查當月只會拿到搶先公告的那幾家。
        門檻一律篩<span className="text-on-surface font-semibold">年增率</span>
        ，不論排序鍵選哪一個。金額單位為新台幣千元。
      </p>

      <div className="flex flex-wrap items-center gap-stack-sm">
        <span className="font-body-sm text-body-sm text-on-surface-variant">排序：</span>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as RevenueRanks['sort'])}
          className={`${selectClass} w-32`}
        >
          {REVENUE_SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="font-body-sm text-body-sm text-on-surface-variant">年增率門檻：</span>
        <select
          value={minYoy}
          onChange={(event) => setMinYoy(Number(event.target.value))}
          className={`${selectClass} w-28`}
        >
          {MIN_YOYS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={reload}
          className="flex items-center justify-center gap-2 px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          重新整理
        </button>
      </div>

      {loading && <PageState kind="loading" />}
      {error && <PageState kind="error" message={error} onRetry={reload} />}

      {!loading && !error && data && !data.month && (
        <PageState
          kind="empty"
          message="這張表還沒有任何資料"
          hint="月營收跟財報、重大訊息同一個排程收集（cmd/notify -collect-mops）。月初還沒有人公告的期間，這裡本來就是空的。"
        />
      )}

      {!loading && !error && data?.month && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
            <StatCard
              label="資料月份"
              icon="calendar_month"
              value={data.month}
              hint="營收一個月換一次，不是今天的數字"
            />
            <StatCard
              label="收集到的家數"
              icon="domain"
              value={formatNumber(data.total)}
              hint="家，這個月已經公告並收下來的"
            />
            <StatCard
              label="排得出名次"
              icon="format_list_numbered"
              value={formatNumber(data.ranked)}
              hint={`家，名次的分母${
                unranked > 0 ? `；另有 ${formatNumber(unranked)} 家沒有比較基期` : ''
              }`}
            />
            <StatCard
              label="這次列出"
              icon="filter_list"
              value={formatNumber(data.count)}
              hint={`家${minYoy > 0 ? `，年增率 ≥ ${minYoy}%` : ''}${
                market ? `，${marketLabel(market)}` : ''
              }`}
            />
          </div>

          {items.length === 0 ? (
            <PageState
              kind="empty"
              message="這個條件下沒有任何一家"
              hint="把年增率門檻調低或改成全部市場看看。"
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className={`${headCell} pl-4 text-right`}>名次</th>
                    <th className={`${headCell} text-left`}>股號 / 名稱</th>
                    <th className={`${headCell} text-left`}>市場</th>
                    <th className={`${headCell} text-left`}>官方產業別</th>
                    <th className={`${headCell} text-right text-primary`}>單月營收</th>
                    <th className={`${headCell} text-right`}>月增率</th>
                    <th className={`${headCell} text-right`}>年增率</th>
                    <th className={`${headCell} text-right`}>累計營收</th>
                    <th className={`${headCell} pr-4 text-right`}>累計年增率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {items.map((item) => (
                    <tr
                      key={`${item.symbol}-${item.month}`}
                      onClick={() => onPick(item.symbol)}
                      title="點擊切換到這一檔"
                      className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                    >
                      <td className={`${numberCell} pl-4 text-on-surface-variant`}>{item.rank}</td>
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
                      <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                        {item.industry || DASH}
                      </td>
                      <td className={`${numberCell} font-bold text-on-surface`}>
                        {formatThousandTWD(item.revenue)}
                      </td>
                      <td className={`${numberCell} ${quoteColor(item.mom)}`}>
                        {formatSignedPercent(item.mom)}
                      </td>
                      <td className={`${numberCell} ${quoteColor(item.yoy)}`}>
                        {formatSignedPercent(item.yoy)}
                      </td>
                      <td className={`${numberCell} text-on-surface-variant`}>
                        {formatThousandTWD(item.accumulated)}
                      </td>
                      <td className={`${numberCell} ${quoteColor(item.accumulated_yoy)}`}>
                        {formatSignedPercent(item.accumulated_yoy)}
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
                　有 {formatNumber(unranked)} 家排不進名次，那是
                <span className="text-on-surface font-semibold">沒有比較基期</span>
                ——去年同月還沒上市就算不出年增率。排序鍵改成「營收金額」的話這個數字會是 0，
                因為金額不需要基期。
              </>
            )}
            　單月營收高不等於賺錢：那是營業收入不是獲利，要看賺得有不有效率請切到 ROE 排行。
            點任何一列可以切換代號，再去個股總覽看那一檔的逐月營收。
          </p>
        </>
      )}
    </>
  );
}

/** ROE 排行：誰賺得有效率。 */
function RoeRankTable({ market, limit, onPick }: TableProps) {
  const [minRoe, setMinRoe] = useState(0);

  // 不輪詢——財報一季才換一次。
  const { data, loading, error, reload } = useAsyncData(
    () =>
      getFinancialRanks({
        market: market || undefined,
        min_roe: minRoe || undefined,
        limit,
      }),
    [minRoe, market, limit]
  );

  const items = data?.items ?? [];
  // 負淨值排不進榜的家數。這個差額本身就是資訊：那幾家不是 ROE 低，是算不出來。
  const unranked = data ? data.total - data.ranked : 0;

  return (
    <>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        ROE ＝ 稅後淨利 ÷ 股東權益，衡量公司拿股東的錢賺回多少。這一頁排的是
        <span className="text-on-surface font-semibold">年化 ROE</span>
        ：上游的財報金額是<span className="text-on-surface font-semibold">累計數</span>
        （2026Q2 那一列指的是上半年），年化＝累計 ÷ 季數 × 4，才拿得去跟「一年賺幾成」比。
        <span className="text-on-surface font-semibold">年化是推估不是實績</span>
        ——旺季在下半年的公司用上半年推會低估，所以表上把累計值一起列出來。
        分子只取「歸屬母公司」的淨利、分母只取「歸屬母公司」的權益，兩邊口徑一致。
      </p>

      <div className="flex flex-wrap items-center gap-stack-sm">
        <span className="font-body-sm text-body-sm text-on-surface-variant">年化 ROE 門檻：</span>
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
        <button
          type="button"
          onClick={reload}
          className="flex items-center justify-center gap-2 px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          重新整理
        </button>
      </div>

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
              hint={`家，名次的分母${
                unranked > 0 ? `；另有 ${formatNumber(unranked)} 家負淨值排不進榜` : ''
              }`}
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
                      onClick={() => onPick(item.symbol)}
                      title="點擊切換到這一檔"
                      className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                    >
                      <td className={`${numberCell} pl-4 text-on-surface-variant`}>{item.rank}</td>
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
                      {/* 上游單位是仟元，走跟月營收同一支換算，免得兩張表的量級不一致。 */}
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
    </>
  );
}
