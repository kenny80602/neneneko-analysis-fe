import { useState } from 'react';
import FlexMessage from '../components/FlexMessage';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getLinePreview, getLinePreviews } from '../api/line';
import { useAsyncData } from '../hooks/useAsyncData';

// LINE 推播樣板的預覽：把排程會推出去的每一則**組出來但不送**。
//
// 為什麼需要這一頁：改推播版面原本只能真的推一則出去驗證，而免費方案每月 200 則
// （排程本身一天就吃三四則），試三輪就是十幾則；更麻煩的是推出去群組裡每個人都看得到。
//
// ⚠️ 這裡畫的是**後端回的訊息物件**，不是前端照著版型重排一份。
// 六個樣板全部由後端呼叫推播自己那條路徑上的建構方法組出來，所以預覽跟實際推播
// 不可能分岔。/alert 那一頁的「LINE 訊息預覽」是舊的做法（前端照抄 Flex 版型），
// 只涵蓋持股試算一個樣板，而且後端改版面它不會跟著變。

const cardClass =
  'rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4 flex flex-col gap-stack-sm';

export default function LinePreview() {
  const list = useAsyncData(() => getLinePreviews(), []);
  const templates = list.data?.items ?? [];

  // 一次只組一個。持股試算那一支要逐檔取行情（正常一兩秒，上游退到 Yahoo 時十幾秒），
  // 六個一起組會讓整頁卡在最慢的那一支。
  const [key, setKey] = useState('');
  const preview = useAsyncData(() => getLinePreview(key), [key], { enabled: !!key });

  return (
    <>
      <PageHeader
        title="LINE 訊息預覽"
        icon="preview"
        subtitle="排程會推出去的每一則，組出來但不送出，也不吃推播額度"
      />

      <div className="flex flex-col gap-stack-lg">
        <div className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-4 flex flex-col gap-stack-sm">
          <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            這一頁在做什麼
          </p>
          <ul className="flex flex-col gap-1 font-body-sm text-body-sm text-on-surface-variant list-disc pl-5">
            {(list.data?.notice ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {list.loading && <PageState kind="loading" />}
        {list.error && <PageState kind="error" message={list.error} onRetry={list.reload} />}

        {templates.length > 0 && (
          <div className="grid gap-stack-md md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => {
              const active = key === template.key;
              return (
                <div
                  key={template.key}
                  className={`${cardClass} ${active ? 'border-primary' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <h3 className="font-headline-md text-headline-md text-primary">
                      {template.title}
                    </h3>
                    <span className="ml-auto px-2 py-0.5 rounded bg-surface-container border border-outline-variant font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                      {template.trigger}
                    </span>
                  </div>

                  {/* 預覽與實際推播的已知差異。這一欄不是裝飾——「看起來一模一樣」
                      的預覽最危險的就是那些看不出來的差異。 */}
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {template.note}
                  </p>

                  {/* 想真的送一則出去時照抄這一行。放在這裡是因為看完預覽的下一步
                      多半就是「那就真的推一次」。 */}
                  <code className="block rounded bg-surface-container-low px-2 py-1 font-data-md text-data-md text-on-surface-variant overflow-x-auto">
                    notify {template.command}
                  </code>

                  <button
                    type="button"
                    onClick={() => setKey(active ? '' : template.key)}
                    className={
                      active
                        ? 'px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors'
                        : 'px-4 py-2 bg-primary rounded text-on-primary font-body-md text-body-md hover:bg-primary-container transition-colors'
                    }
                  >
                    {active ? '收合' : '組出這一則'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {key && (
          <section className="flex flex-col gap-stack-md">
            <h2 className="font-headline-md text-headline-md text-primary flex flex-wrap items-center gap-2">
              {preview.data?.title ?? templates.find((t) => t.key === key)?.title}
              {preview.data != null && (
                <>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {preview.data.messages.length} 則
                  </span>
                  <span className="font-body-sm text-body-sm text-outline">
                    組出來花了 {preview.data.elapsed_ms} ms
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={preview.reload}
                className="ml-auto px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
              >
                重新組一次
              </button>
            </h2>

            {preview.loading && <PageState kind="loading" />}
            {preview.error && (
              <PageState kind="error" message={preview.error} onRetry={preview.reload} />
            )}

            {/* available 為 false 不是錯誤：資料還沒到齊時排程本來就不推。
                訊息要講清楚是哪一種，不然會被當成功能壞了。 */}
            {!preview.loading && !preview.error && preview.data && !preview.data.available && (
              <PageState
                kind="empty"
                message="這一則現在推不出去"
                hint={`${preview.data.reason}。排程遇到同樣的狀況也不會推——推一則空的只會讓人以為今天沒事發生。`}
              />
            )}

            {preview.data?.available && (
              <div className="flex flex-col gap-stack-md">
                {preview.data.messages.map((message, index) => (
                  <div key={index} className="flex flex-col gap-stack-sm">
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      第 {index + 1} / {preview.data?.messages.length} 則
                      {message.altText && (
                        <>
                          　通知列顯示：
                          <span className="text-on-surface">{message.altText}</span>
                        </>
                      )}
                    </p>
                    <FlexMessage contents={message.contents} text={message.text} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
