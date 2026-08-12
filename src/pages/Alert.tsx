import { useState } from 'react';
import LineMessagePreview from '../components/LineMessagePreview';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { notifyPortfolio, getPortfolioValuation } from '../api/portfolio';
import { apiErrorMessage } from '../api/request';
import { PortfolioRow } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import { DASH, formatNumber, formatPrice, formatSignedPercent } from '../utils/format';

// 訊息上哪些數字要標紅的門檻。這兩個值是後端的（ioc/portfolio.go 的
// defaultPullbackAlertPercent／defaultPeAlertThreshold），而且是可設定的，
// API 沒有把它們吐出來，所以這裡是抄的一份——後端調了設定，這裡要跟著改。
// 之所以還是抄一份：Flex 訊息的備註本身就印著「紅字: PE≥90 或 回檔≥25%」，
// 畫面上的清單如果不標紅，跟送出去的訊息會對不起來。
const PULLBACK_ALERT_PERCENT = 25;
const PE_ALERT_THRESHOLD = 90;

const headerGroupClass =
  'p-2 text-center font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap border-b border-outline-variant';
const headerCellClass =
  'p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap align-bottom';
const numberCellClass = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';
// 群組之間用比較重的分隔線，欄位一多才看得出哪幾欄是一組的。
const groupEdge = 'border-r border-outline-variant';

/** 欄位標題下方那行小字（計算方式）。 */
function subLabel(text: string) {
  return <span className="block font-body-sm text-body-sm text-outline normal-case">{text}</span>;
}

export default function Alert() {
  const valuation = useAsyncData(() => getPortfolioValuation(), []);
  const [notifying, setNotifying] = useState(false);
  const [notice, setNotice] = useState('');

  const rows = valuation.data ?? [];

  const handleNotify = async () => {
    // 推播會真的送出 LINE 訊息並吃掉計費額度（按送達人數計），所以要二次確認。
    if (!window.confirm(`確定要把這 ${rows.length} 檔推播到 LINE？這會消耗 LINE 訊息額度。`)) {
      return;
    }
    setNotifying(true);
    setNotice('');
    try {
      const pushed = await notifyPortfolio('FLEX');
      setNotice(`已推播 ${pushed.length} 檔`);
    } catch (err) {
      setNotice(apiErrorMessage(err, '推播失敗'));
    } finally {
      setNotifying(false);
    }
  };

  const isPeAlert = (value: number | null) => value != null && value >= PE_ALERT_THRESHOLD;
  const peCellClass = (value: number | null) =>
    `${numberCellClass} ${isPeAlert(value) ? 'text-error font-bold' : 'text-on-surface-variant'}`;

  const pullbackCellClass = (row: PortfolioRow) =>
    `${numberCellClass} ${
      row.pullback_percent != null && row.pullback_percent >= PULLBACK_ALERT_PERCENT
        ? 'text-error font-bold'
        : 'text-on-surface-variant'
    }`;

  return (
    <>
      <PageHeader
        title="多喵 Alert 發送清單"
        icon="notifications_active"
        subtitle="推播前先核對一次：這張表就是等一下要送進 LINE 的內容。"
        right={
          <>
            {notice && (
              <span className="font-body-sm text-body-sm text-on-surface-variant">{notice}</span>
            )}
            <button
              type="button"
              onClick={handleNotify}
              disabled={notifying || rows.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-secondary rounded text-on-secondary font-body-md text-body-md hover:bg-secondary-container hover:text-on-secondary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">chat</span>
              {notifying ? '發送中…' : '發送 LINE 訊息'}
            </button>
            <button
              type="button"
              onClick={valuation.reload}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              重新試算
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <div className="flex flex-wrap items-center gap-stack-md">
          <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
            <span className="w-2.5 h-2.5 rounded-[9999px] bg-secondary" />
            買入區間（現價 ≤ 買入高點）
          </span>
          <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
            <span className="w-2.5 h-2.5 rounded-[9999px] bg-error" />
            警示：回檔 ≥ {PULLBACK_ALERT_PERCENT}% 或 PE ≥ {PE_ALERT_THRESHOLD}
          </span>
        </div>

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          每次開啟這一頁都會重新試算：逐檔取即時行情、半年最高與 EPS 現算，不是讀快取。
          破折號代表那個值算不出來（沒填成本、公司虧損、EPS 抓不到），不是 0——
          成本填 0 會讓損益變成 -100%。
        </p>

        {valuation.loading && <PageState kind="loading" />}
        {valuation.error && (
          <PageState kind="error" message={valuation.error} onRetry={valuation.reload} />
        )}
        {!valuation.loading && !valuation.error && rows.length === 0 && (
          <PageState
            kind="empty"
            message="自選股清單是空的"
            hint="沒有自選股就沒有東西可以推播。增刪目前走 LINE 聊天室，輸入「加 2330」即可加入。"
          />
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full border-collapse">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className={`${headerGroupClass} ${groupEdge}`} colSpan={2}>
                    基本資訊
                  </th>
                  <th className={`${headerGroupClass} ${groupEdge}`} colSpan={4}>
                    即時行情與成本
                  </th>
                  <th className={`${headerGroupClass} ${groupEdge}`} colSpan={4}>
                    價格位階與安全邊際
                  </th>
                  <th className={`${headerGroupClass} ${groupEdge}`} colSpan={2}>
                    近四季 EPS（歷史）
                  </th>
                  <th className={`${headerGroupClass} ${groupEdge}`} colSpan={2}>
                    預估整年 EPS
                  </th>
                  <th className={headerGroupClass} colSpan={2}>
                    最新一季 EPS（年化）
                  </th>
                </tr>
                <tr className="border-b border-outline-variant">
                  <th className={`${headerCellClass} pl-4 text-left`}>代號</th>
                  <th className={`${headerCellClass} text-left ${groupEdge}`}>股票名稱</th>
                  <th className={headerCellClass}>持股成本</th>
                  <th className={headerCellClass}>目前股價</th>
                  <th className={headerCellClass}>今日最高</th>
                  <th className={`${headerCellClass} ${groupEdge}`}>今日最低</th>
                  <th className={headerCellClass}>
                    半年最高{subLabel('回看半年')}
                  </th>
                  <th className={headerCellClass}>
                    回檔幅度{subLabel('(半年高−現價)÷半年高')}
                  </th>
                  <th className={headerCellClass}>
                    建議買入低點{subLabel('半年高 × 0.65')}
                  </th>
                  <th className={`${headerCellClass} ${groupEdge}`}>
                    建議買入高點{subLabel('半年高 × 0.70')}
                  </th>
                  <th className={headerCellClass}>近四季 EPS</th>
                  <th className={`${headerCellClass} ${groupEdge}`}>
                    歷史本益比{subLabel('現價 ÷ 近四季')}
                  </th>
                  <th className={headerCellClass}>預估整年 EPS</th>
                  <th className={`${headerCellClass} ${groupEdge}`}>
                    預估本益比{subLabel('現價 ÷ 本年預估')}
                  </th>
                  <th className={headerCellClass}>最新一季 EPS</th>
                  <th className={headerCellClass}>
                    年化本益比{subLabel('現價 ÷ (最新季 × 4)')}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-outline-variant/50">
                {rows.map((row) => (
                  <tr key={row.symbol} className="hover:bg-surface-container-low/50 transition-colors">
                    <td
                      className={`p-2 pl-4 py-3 font-data-md text-data-md text-on-surface font-bold whitespace-nowrap ${
                        // 已達買入區間的列在最左邊加一條綠邊，掃一眼就知道這次推播誰進場了。
                        row.in_buy_zone ? 'border-l-[3px] border-l-secondary' : ''
                      }`}
                    >
                      {row.symbol}
                    </td>
                    <td className={`p-2 py-3 font-body-md text-body-md text-primary whitespace-nowrap ${groupEdge}`}>
                      {row.name}
                      {/* 取價失敗時後面每個數字都是拿現價算的，不標出來會被當成真的。 */}
                      {row.error && (
                        <span className="block font-body-sm text-body-sm text-error" title={row.error}>
                          取價失敗
                        </span>
                      )}
                    </td>

                    <td className={`${numberCellClass} text-on-surface-variant`}>
                      {formatPrice(row.cost)}
                    </td>
                    <td className={`${numberCellClass} text-on-surface font-bold`}>
                      {formatPrice(row.price)}
                    </td>
                    <td className={`${numberCellClass} text-on-surface-variant`}>
                      {formatPrice(row.today_high)}
                    </td>
                    <td className={`${numberCellClass} text-on-surface-variant ${groupEdge}`}>
                      {formatPrice(row.today_low)}
                    </td>

                    <td className={`${numberCellClass} text-on-surface-variant`}>
                      {formatPrice(row.recent_high)}
                    </td>
                    {/*
                      後端的回檔是正數（跌得越深越大），這裡取負號顯示成「離高點 -x%」。
                      直接串 '-' 會在剛好持平時印出 -0.00%，盤中創新高（負回檔）還會變成 --x%。
                    */}
                    <td className={pullbackCellClass(row)}>
                      {row.pullback_percent == null
                        ? DASH
                        : formatSignedPercent(-row.pullback_percent)}
                    </td>
                    <td
                      className={`${numberCellClass} ${
                        row.in_buy_zone ? 'text-secondary font-bold' : 'text-on-surface'
                      }`}
                    >
                      {formatPrice(row.buy_zone_low)}
                    </td>
                    <td
                      className={`${numberCellClass} ${groupEdge} ${
                        row.in_buy_zone ? 'text-secondary font-bold' : 'text-on-surface'
                      }`}
                    >
                      {formatPrice(row.buy_zone_high)}
                    </td>

                    <td className={`${numberCellClass} text-on-surface-variant`}>
                      {formatNumber(row.trailing_eps, 2)}
                    </td>
                    <td className={`${peCellClass(row.historical_pe)} ${groupEdge}`}>
                      {formatNumber(row.historical_pe, 2)}
                    </td>

                    <td className={`${numberCellClass} text-on-surface-variant`}>
                      {formatNumber(row.full_year_eps, 2)}
                    </td>
                    <td className={`${peCellClass(row.estimated_pe)} ${groupEdge}`}>
                      {formatNumber(row.estimated_pe, 2)}
                    </td>

                    <td className={`${numberCellClass} text-on-surface-variant`}>
                      {formatNumber(row.latest_quarter_eps, 2)}
                    </td>
                    <td className={peCellClass(row.annualized_pe)}>
                      {formatNumber(row.annualized_pe, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <section className="flex flex-col gap-stack-md">
            <h2 className="font-headline-md text-headline-md text-primary">LINE 訊息預覽</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              照後端的 Flex 版型重排出來的預覽，不是後端回傳的訊息（推播端點只回試算結果）。
              標題時間是現在的時間，實際送出時會換成推播當下的時間。價格在訊息裡四捨五入到整數，
              完整精度看上面的表格。
            </p>
            <LineMessagePreview
              rows={rows}
              pullbackAlert={PULLBACK_ALERT_PERCENT}
              peAlert={PE_ALERT_THRESHOLD}
            />
          </section>
        )}
      </div>
    </>
  );
}
