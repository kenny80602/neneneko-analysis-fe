import { useState } from 'react';
import LineMessagePreview from '../components/LineMessagePreview';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { ERR_LINE_NOT_CONFIGURED, getLineQuota, getLineTargets } from '../api/line';
import { notifyPortfolio, getPortfolioValuation } from '../api/portfolio';
import { apiErrorMessage } from '../api/request';
import { LineTargetType, PortfolioRow } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatDateTime,
  formatNumber,
  formatPrice,
  formatSignedPercent,
} from '../utils/format';

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

/** 推播對象種類的顯示文字。ID 的開頭字母也對應同一件事（C／R／U）。 */
function targetTypeLabel(type: LineTargetType | string): string {
  switch (type) {
    case 'group':
      return '群組';
    case 'room':
      return '聊天室';
    case 'user':
      return '個人';
    default:
      return type || DASH;
  }
}

export default function Alert() {
  const valuation = useAsyncData(() => getPortfolioValuation(), []);
  // 額度與對象都是唯讀且不計費，跟試算並行抓即可，不必等試算回來。
  const quota = useAsyncData(() => getLineQuota(), []);
  const targets = useAsyncData(() => getLineTargets(), []);
  const [notifying, setNotifying] = useState(false);
  const [notice, setNotice] = useState('');

  const rows = valuation.data ?? [];
  const targetRows = targets.data ?? [];

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
      // 剛吃掉的額度要立刻反映，否則畫面上的剩餘則數會停在推播前的數字。
      quota.reload();
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

        {/*
          額度放在按鈕上方而不是頁尾：推播是不可逆且計費的動作，
          「還剩幾則」要在按下去之前就看得到。
        */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4 flex flex-col gap-stack-sm">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">data_usage</span>
            <span className="font-label-caps text-label-caps uppercase">本月 LINE 推播額度</span>
          </div>

          {quota.loading && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">額度查詢中…</p>
          )}
          {/*
            「這個環境沒接 LINE」與「查詢失敗」要分開講。前者是部署設定，
            重試永遠不會成功，配一顆重試鈕只會讓人一直按；後者才值得重試。
          */}
          {quota.errorCode === ERR_LINE_NOT_CONFIGURED && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              這個環境沒有設定 LINE Messaging（缺 channel access token），所以查不到額度，
              推播也不會真的送出。本機開發用 <code>.env.test.json</code> 時是正常現象；
              要看真實額度請改用有設定 LINE 的環境。
            </p>
          )}
          {quota.error && quota.errorCode !== ERR_LINE_NOT_CONFIGURED && (
            <p className="font-body-sm text-body-sm text-error">
              額度查詢失敗：{quota.error}
              <button
                type="button"
                onClick={quota.reload}
                className="ml-2 underline hover:text-on-surface"
              >
                重試
              </button>
            </p>
          )}
          {!quota.loading && !quota.error && quota.data && (
            <>
              {quota.data.unlimited ? (
                <p className="font-data-lg text-data-lg text-on-surface">無上限方案</p>
              ) : (
                <>
                  <p
                    className={`font-data-lg text-data-lg ${
                      quota.data.remaining === 0 ? 'text-error' : 'text-on-surface'
                    }`}
                  >
                    剩餘 {formatNumber(quota.data.remaining)} 則
                    <span className="ml-2 font-body-md text-body-md text-on-surface-variant">
                      已用 {formatNumber(quota.data.used)} / {formatNumber(quota.data.value)}
                    </span>
                  </p>
                  <div className="h-1.5 w-full rounded-[9999px] bg-surface-container overflow-hidden">
                    <div
                      className={quota.data.remaining === 0 ? 'h-full bg-error' : 'h-full bg-primary'}
                      style={{
                        // value 為 0 時除法會變成 Infinity／NaN，寬度算不出來就當作滿格。
                        width: `${
                          quota.data.value > 0
                            ? Math.min(100, (quota.data.used / quota.data.value) * 100)
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                </>
              )}
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                只計主動推播，聊天室指令的回覆不計費。一次推播按送達人數計——推到 5 人群組就扣 5
                則，所以剩餘則數不等於還能按幾次。額度每月 1 號重置。
              </p>
            </>
          )}
        </section>

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

        <section className="flex flex-col gap-stack-md">
          <h2 className="font-headline-md text-headline-md text-primary">LINE 推播對象</h2>
          {/*
            這是「bot 見過誰」而不是「這次會推給誰」：實際收訊的對象是後端的
            LINE_TARGET_ID 環境變數，只有一個，而且 API 沒有把它吐出來，
            所以前端無法標示清單裡哪一列是現行設定。標題與說明都要寫清楚，
            不然會被讀成「以下對象都會收到」。
          */}
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            bot 收過事件的所有對象，最近有動靜的排前面。實際推播只會送到後端設定的那一個
            （環境變數 LINE_TARGET_ID），這份清單是用來查對象 ID 的，不代表以下每一個都會收到。
            群組 ID 在 LINE 後台查不到，唯一取得方式就是把 bot 邀進群組後讓它收到一則事件。
          </p>

          {targets.loading && <PageState kind="loading" />}
          {targets.error && (
            <PageState kind="error" message={targets.error} onRetry={targets.reload} />
          )}
          {!targets.loading && !targets.error && targetRows.length === 0 && (
            <PageState
              kind="empty"
              message="還沒有任何推播對象"
              hint="代表 bot 從來沒收過事件：還沒被邀進任何群組，或被邀進去後沒有人在群裡說過話。"
            />
          )}

          {targetRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className="p-2 pl-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-left">
                      對象 ID
                    </th>
                    <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-left">
                      種類
                    </th>
                    <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-left">
                      備註
                    </th>
                    <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-left">
                      最後事件
                    </th>
                    <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                      累計次數
                    </th>
                    <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                      首次見到
                    </th>
                    <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                      最後見到
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {targetRows.map((target) => (
                    <tr
                      key={target.target_id}
                      className="hover:bg-surface-container-low/50 transition-colors"
                    >
                      <td className="p-2 pl-4 py-3 font-data-md text-data-md text-on-surface whitespace-nowrap">
                        {target.target_id}
                      </td>
                      <td className="p-2 py-3 font-body-md text-body-md text-on-surface-variant whitespace-nowrap">
                        {targetTypeLabel(target.target_type)}
                      </td>
                      {/* 沒標註的群只有一串 ID，認不出是哪個群，這裡明講而不是留白。 */}
                      <td className="p-2 py-3 font-body-md text-body-md text-on-surface-variant">
                        {target.note || (
                          <span className="text-outline">未標註</span>
                        )}
                      </td>
                      <td className="p-2 py-3 font-body-md text-body-md text-on-surface-variant whitespace-nowrap">
                        {target.last_event_type || DASH}
                      </td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                        {formatNumber(target.event_count)}
                      </td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                        {formatDateTime(target.first_seen_at)}
                      </td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                        {formatDateTime(target.last_seen_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
