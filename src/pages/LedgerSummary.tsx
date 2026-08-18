import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import { getLedgerSummary } from '../api/ledger';
import { LedgerSummaryGroup, LedgerTotals } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatNumber,
  formatPrice,
  formatSigned,
  formatSignedPercent,
  priceSourceLabel,
  quoteColor,
} from '../utils/format';

// 沖銷帳總覽：每一檔在每一個帳戶的已實現與未實現，加上各帳戶小計與全部合計。
//
// 為什麼要有這一頁：/ledger 一次只看一檔，「我整體到底賺沒賺」在那裡問不到，
// 只能一檔一檔切過去自己加。
//
// ⚠️ 這一頁的合計橫跨不同股票，那是**投組層級的加總**，跟沖銷是兩件事——
// 沖銷是同一檔之內的批次配對。拿別檔的獲利去補這一檔的虧損，
// 不會改變這一檔的任何一個數字，畫面上要一直講清楚，不要在改版時拿掉。
//
// 數字一個都不在這裡算：列、各帳戶小計與全部合計全部來自 /ledger/summary。
// 前端自己加的話，「小計加起來不等於合計」這種問題會變成兩邊都要查。

const NO_ACCOUNT_LABEL = '未指定帳戶';

const headCell =
  'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
const numberCell = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';

export default function LedgerSummary() {
  // 不輪詢：這一支會逐檔打即時報價，比其他讀取端點慢得多，
  // 讓使用者按重新整理，跟大盤那幾支同一個理由。
  const { data, loading, error, reload } = useAsyncData(() => getLedgerSummary(), []);

  const groups = data?.accounts ?? [];
  const totals = data?.totals;

  return (
    <>
      <PageHeader
        title="沖銷帳總覽"
        icon="summarize"
        subtitle={
          data
            ? `${data.symbols} 檔 · ${data.totals.accounts} 個帳戶．全部沖銷帳的已實現與未實現`
            : '全部沖銷帳的已實現與未實現，逐檔逐帳戶列出'
        }
        right={
          <button
            type="button"
            onClick={reload}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            重新整理
          </button>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這一頁把每一檔沖銷帳的結果攤在一起。
          <span className="text-on-surface font-semibold">「已實現」是真的賣掉才產生的</span>
          ，已扣手續費與證交稅；「未實現」是還沒賣掉的部位照現價估的，也扣掉了估算的賣出費用，
          兩者口徑一致。賣出費用照「用現價一次全部賣光」估，最低收費按一張委託單收，
          所以逐帳戶各估一次。一檔一列是
          <span className="text-on-surface font-semibold">「這一檔在這個帳戶」</span>
          ——沖銷不跨帳戶，同一檔分散在兩家券商就是兩列。點代號可以跳去看那一檔的逐筆明細。
        </p>

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          <span className="text-on-surface font-semibold">
            合計橫跨不同股票，那是投組層級的加總，跟沖銷是兩件事。
          </span>
          沖銷是同一檔之內「賣掉的這幾股是哪幾筆買的」的配對；拿別檔賺的去補這一檔虧的，
          帳上不會改變這一檔的成本、剩餘股數或未實現損益，變的只有心裡的感受。
          台灣個人證券交易所得停徵，也沒有「這檔虧的抵那檔賺的」這種機制，
          所以這個合計是拿來看整體績效的，不是拿來報稅或做節稅規劃的。
        </p>

        {loading && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reload} />}

        {!loading && !error && groups.length === 0 && (
          <PageState
            kind="empty"
            message="還沒有任何沖銷帳"
            hint="這一頁列的是「自訂沖銷帳」裡已經建立的庫存與賣出紀錄。先到那一頁用「新增庫存」或「從自選股匯入」建立第一筆，這裡才有東西可以加總。"
          />
        )}

        {!loading && !error && totals && groups.length > 0 && (
          <>
            {data != null && data.unpriced > 0 && (
              <p className="font-body-sm text-body-sm text-error bg-error-container/30 border border-error rounded-xl px-4 py-3">
                有 {data.unpriced} 檔這次取不到現價（收盤後上游掛掉、冷門股盤中沒有撮合價都會這樣），
                那幾列的市值與未實現顯示破折號，
                <span className="text-on-surface font-semibold">合計的未實現也少算了它們</span>
                。已實現不受影響——那是真的賣掉時就結算好的，跟現價無關。
              </p>
            )}

            <TotalsCards totals={totals} label="全部帳戶合計" hint={`${data?.symbols ?? 0} 檔`} />

            {groups.map((group) => (
              <AccountSection key={group.account} group={group} />
            ))}
          </>
        )}
      </div>
    </>
  );
}

/** 合計卡片。全部帳戶與單一帳戶共用同一組欄位，語意才一致。 */
function TotalsCards({
  totals,
  label,
  hint,
}: {
  totals: LedgerTotals;
  label: string;
  hint: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
      <StatCard
        label={`${label} · 已實現`}
        icon="target"
        value={formatSigned(totals.realized, 0)}
        hint="元，已扣手續費與證交稅"
        valueClassName={quoteColor(totals.realized)}
      />
      <StatCard
        label={`${label} · 未實現`}
        icon="trending_up"
        value={totals.unrealized == null ? DASH : formatSigned(totals.unrealized, 0)}
        hint={
          totals.unrealized_rate == null
            ? '元，取不到現價'
            : `元，報酬率 ${formatSignedPercent(totals.unrealized_rate)}`
        }
        valueClassName={quoteColor(totals.unrealized)}
      />
      <StatCard
        label={`${label} · 原本金額`}
        icon="savings"
        value={totals.shares > 0 ? formatNumber(totals.cost) : DASH}
        hint={`元，剩餘 ${formatNumber(totals.shares)} 股（${hint}）`}
      />
      <StatCard
        label={`${label} · 目前市值`}
        icon="paid"
        value={totals.net_value == null ? DASH : formatNumber(totals.net_value)}
        hint={
          totals.sell_fee == null || totals.sell_tax == null
            ? '元，取不到現價'
            : `元，毛額 ${formatNumber(totals.market_value)} 已扣賣出費用 ${formatNumber(
                totals.sell_fee + totals.sell_tax
              )}`
        }
      />
    </div>
  );
}

/** 一個帳戶：小計加上它底下的每一檔。 */
function AccountSection({ group }: { group: LedgerSummaryGroup }) {
  return (
    <section className="flex flex-col gap-stack-md">
      <div className="flex flex-wrap items-baseline gap-stack-sm border-b border-outline-variant pb-2">
        <h2 className="font-headline-md text-headline-md text-primary">
          {group.account || NO_ACCOUNT_LABEL}
        </h2>
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {group.rows.length} 檔 · 已實現{' '}
          <span className={`font-data-md text-data-md ${quoteColor(group.totals.realized)}`}>
            {formatSigned(group.totals.realized, 0)}
          </span>{' '}
          · 未實現{' '}
          <span className={`font-data-md text-data-md ${quoteColor(group.totals.unrealized)}`}>
            {group.totals.unrealized == null ? DASH : formatSigned(group.totals.unrealized, 0)}
          </span>{' '}
          元
        </span>
        {!group.account && (
          <span className="font-body-sm text-body-sm text-outline">
            這幾筆還沒填帳戶。填上之後它們才會跟對應券商的部位一起沖銷。
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <table className="w-full border-collapse">
          <thead className="bg-surface-container-low border-b border-outline-variant">
            <tr>
              <th className={`${headCell} pl-4 text-left`}>股號 / 名稱</th>
              <th className={`${headCell} text-right`}>剩餘股數</th>
              <th className={`${headCell} text-right`}>平均成本</th>
              <th className={`${headCell} text-right`}>現價</th>
              <th className={`${headCell} text-right`}>原本金額</th>
              <th className={`${headCell} text-right`}>目前市值</th>
              <th className={`${headCell} text-right`}>未實現</th>
              <th className={`${headCell} text-right`}>報酬率</th>
              <th className={`${headCell} text-right text-primary`}>策略已實現</th>
              <th className={`${headCell} text-right`}>券商已實現</th>
              <th className={`${headCell} text-right`}>差額</th>
              <th className={`${headCell} pr-4 text-right`}>筆數</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {group.rows.map((row) => (
              <tr
                key={`${row.account}::${row.symbol}`}
                className="hover:bg-surface-container-low/50 transition-colors"
              >
                <td className="p-2 pl-4 py-3 whitespace-nowrap">
                  {/* 點代號跳去那一檔的沖銷帳。總覽只有合計，逐筆明細在那一頁。 */}
                  <Link
                    to={`/ledger?symbol=${row.symbol}`}
                    className="font-data-md text-data-md text-primary font-bold hover:underline"
                  >
                    {row.symbol}
                  </Link>
                  <span className="block font-body-sm text-body-sm text-on-surface-variant">
                    {row.name}
                  </span>
                </td>
                <td className={`${numberCell} text-on-surface`}>
                  {row.shares === 0 ? (
                    <span className="text-outline">已出清</span>
                  ) : (
                    formatNumber(row.shares)
                  )}
                </td>
                <td className={`${numberCell} text-on-surface-variant`}>
                  {row.avg_cost == null ? DASH : formatPrice(row.avg_cost)}
                </td>
                <td
                  className={`${numberCell} text-on-surface-variant`}
                  title={
                    row.price_source && row.price_source !== 'TRADE'
                      ? priceSourceLabel(row.price_source)
                      : undefined
                  }
                >
                  {row.price == null ? DASH : formatPrice(row.price)}
                  {row.price != null && row.price_source && row.price_source !== 'TRADE' && (
                    <span className="ml-1 font-body-sm text-body-sm text-outline">*</span>
                  )}
                </td>
                <td className={`${numberCell} text-on-surface-variant`}>
                  {row.shares > 0 ? formatNumber(row.cost) : DASH}
                </td>
                <td className={`${numberCell} text-on-surface`}>
                  {row.net_value == null ? DASH : formatNumber(row.net_value)}
                </td>
                <td className={`${numberCell} ${quoteColor(row.unrealized)}`}>
                  {row.unrealized == null ? DASH : formatSigned(row.unrealized, 0)}
                </td>
                <td className={`${numberCell} ${quoteColor(row.unrealized_rate)}`}>
                  {formatSignedPercent(row.unrealized_rate)}
                </td>
                <td className={`${numberCell} font-bold ${quoteColor(row.realized)}`}>
                  {row.realized === 0 ? DASH : formatSigned(row.realized, 0)}
                </td>
                <td className={`${numberCell} ${quoteColor(row.broker_realized)}`}>
                  {row.broker_realized === 0 ? DASH : formatSigned(row.broker_realized, 0)}
                </td>
                <td className={`${numberCell} ${quoteColor(row.realized_diff)}`}>
                  {row.realized_diff === 0 ? DASH : formatSigned(row.realized_diff, 0)}
                </td>
                <td className="p-2 pr-4 py-3 text-right font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                  買 {row.lots} / 賣 {row.sells}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        「策略已實現」是照你指定的批次沖銷算出來的，「券商已實現」是同一批賣出在 FIFO
        下會認列的金額——兩者的差額是
        <span className="text-on-surface font-semibold">認列時間的差，不是多賺的錢</span>
        ，這一檔全部出清那一刻會回到 0。已實現顯示破折號代表這一檔在這個帳戶還沒賣過，
        不是 0 元損益。現價旁邊的 * 代表那不是本次快照的成交價（收盤後或冷門股），
        由它算出來的市值與報酬率同樣不是即時的。
      </p>
    </section>
  );
}
