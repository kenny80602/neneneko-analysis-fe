import { Fragment, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getSchedules } from '../api/schedule';
import { Schedule } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import { DASH, formatDateTime } from '../utils/format';

// 排程清單：這個站的資料是誰、幾點、去哪裡收回來的。
//
// 為什麼需要這一頁：這個站上大半的數字不是即時打上游，而是排程收下來的
// （收盤行情、法人、股權分散、展覽、總經）。所以「某一頁的資料是舊的」有兩種
// 完全不同的原因——上游那天沒有新資料，或那支排程根本沒在跑。前者沒事，
// 後者要處理，而在這一頁之前兩者長得一模一樣。
//
// ⚠️ 這一頁只看得到「上一次」的離開碼，沒有歷史。要知道某一次到底做了什麼，
// 得去讀後端的 logs/notify.log，那不是這一頁的工作。

/** 一支排程的狀態。三種顏色分別對應「該處理」「刻意沒掛」「正常」。 */
function statusOf(item: Schedule): { label: string; className: string; hint: string } {
  if (!item.installed) {
    // 沒掛上不算不正常：有些是還在做，或刻意不自動跑的。
    return {
      label: '未掛上',
      className: 'bg-surface-container text-on-surface-variant',
      hint: '樣板寫好了但沒有放進 LaunchAgents，所以不會自動跑。多半是刻意的。',
    };
  }
  if (!item.loaded) {
    return {
      label: '未載入',
      className: 'bg-error-container/40 text-error',
      hint: 'plist 放好了但 launchd 不認得，這支一次都不會跑——而且從檔案上看不出來。',
    };
  }
  if (item.last_exit_code != null && item.last_exit_code !== 0) {
    return {
      label: `上次失敗（${item.last_exit_code}）`,
      className: 'bg-error-container/40 text-error',
      hint: '上一次跑完的離開碼不是 0，那一次有東西沒做完。詳情要看後端的 logs/notify.log。',
    };
  }
  return {
    label: '正常',
    className: 'bg-secondary-container/50 text-secondary',
    hint: '已掛上、launchd 認得、上一次不是失敗。',
  };
}

const headCell =
  'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';

export default function Schedules() {
  // 不輪詢：排程的狀態一天內幾乎不變，要看最新的按重新整理。
  const { data, loading, error, reload } = useAsyncData(() => getSchedules(), []);
  const [openLabel, setOpenLabel] = useState('');

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="排程"
        icon="schedule"
        subtitle={
          data
            ? `共 ${data.count} 支，已掛上 ${data.installed} 支${
                data.unhealthy > 0 ? `，${data.unhealthy} 支要處理` : ''
              }`
            : '這個站的資料是誰、幾點、去哪裡收回來的'
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
          這個站大半的數字不是即時打上游，而是排程收下來的（收盤行情、法人、股權分散、
          展覽、總經）。所以
          <span className="text-on-surface font-semibold">「某一頁的資料是舊的」有兩種原因</span>
          ——上游那天沒有新資料，或那支排程根本沒在跑。前者沒事，後者要處理，
          而在這一頁之前兩者長得一模一樣。
          <span className="text-on-surface font-semibold">「未掛上」不算不正常</span>
          ，有些是刻意不自動跑的；真正要處理的是「未載入」與「上次失敗」。
        </p>

        {data != null && data.unhealthy > 0 && (
          <p className="rounded-xl border border-error/40 bg-error/10 p-3 font-body-sm text-body-sm text-error">
            有 {data.unhealthy} 支掛上了卻不正常（沒載入，或上一次是失敗的）。
            那幾支的資料會停在上一次成功的時間點，而畫面上看不出來。
          </p>
        )}

        {loading && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reload} />}

        {!loading && !error && items.length === 0 && (
          <PageState
            kind="empty"
            message="沒有任何排程"
            hint="清單來自後端 deploy/launchd 底下的樣板目錄。那裡是空的，或後端讀不到那個目錄。"
          />
        )}

        {items.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className={`${headCell} pl-4 text-left`}>排程</th>
                    <th className={`${headCell} text-left`}>時刻表</th>
                    <th className={`${headCell} text-left`}>下次觸發</th>
                    <th className={`${headCell} pr-4 text-left`}>狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {items.map((item) => {
                    const status = statusOf(item);
                    const open = openLabel === item.label;
                    return (
                      <Fragment key={item.label}>
                        <tr
                          onClick={() => setOpenLabel(open ? '' : item.label)}
                          className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                        >
                          <td className="p-2 pl-4 py-3">
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[18px] text-outline">
                                {open ? 'expand_more' : 'chevron_right'}
                              </span>
                              <span className="font-body-md text-body-md text-on-surface">
                                {item.summary || item.label}
                              </span>
                            </span>
                            <span className="block pl-6 font-data-md text-data-md text-outline">
                              {item.label}
                            </span>
                          </td>
                          <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant">
                            {/* 常駐服務沒有時刻表，cadence 會是空的。 */}
                            {item.cadence || (item.kind === 'DAEMON' ? '常駐' : DASH)}
                          </td>
                          <td className="p-2 py-3 font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                            {item.next_run_at ? formatDateTime(item.next_run_at) : DASH}
                          </td>
                          <td className="p-2 pr-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded font-body-sm text-body-sm whitespace-nowrap ${status.className}`}
                            >
                              {status.label}
                            </span>
                            {item.running_pid != null && (
                              <span className="ml-2 font-body-sm text-body-sm text-primary">
                                跑動中
                              </span>
                            )}
                          </td>
                        </tr>

                        {open && (
                          <tr className="bg-surface-container-low/30">
                            <td colSpan={4} className="p-4 pl-10">
                              <div className="flex flex-col gap-stack-sm">
                                <p className="font-body-sm text-body-sm text-on-surface-variant">
                                  {status.hint}
                                </p>

                                {/* 樣板註解通常寫著「為什麼是這個時間」與「漏跑會怎樣」，
                                    那正是判斷一支排程壞掉要不要緊的依據。 */}
                                {item.description && (
                                  <p className="font-body-sm text-body-sm text-on-surface whitespace-pre-wrap">
                                    {item.description}
                                  </p>
                                )}

                                {item.args.length > 0 && (
                                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                                    帶的旗標：
                                    <span className="ml-1 font-data-md text-data-md text-on-surface">
                                      {item.args.join(' ')}
                                    </span>
                                  </p>
                                )}

                                <p className="font-body-sm text-body-sm text-outline">
                                  上一次離開碼{' '}
                                  {item.last_exit_code == null ? '（從沒跑過或剛重新註冊）' : item.last_exit_code}
                                  ．只有上一次沒有歷史，要歷史請看後端的 logs/notify.log
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              清單來自後端 <span className="font-data-md text-data-md">deploy/launchd</span>{' '}
              底下的樣板目錄，
              <span className="text-on-surface font-semibold">不是另外維護的一份</span>
              ——新增一支排程就會自己出現在這裡。
              <span className="text-on-surface font-semibold">下次觸發不管國定假日</span>
              ：launchd 也不管，那天照樣會跑，只是上游沒有新資料。
            </p>
          </>
        )}
      </div>
    </>
  );
}
