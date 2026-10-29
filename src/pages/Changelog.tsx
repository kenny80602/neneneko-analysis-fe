import PageHeader from '../components/PageHeader';
import { CHANGELOG, ChangeKind, CURRENT_VERSION } from '../changelog';

// 更版歷程。內容在 src/changelog.ts 手寫維護，這一頁只負責排版，不打 API。

const KIND_LABEL: Record<ChangeKind, string> = {
  new: '新增',
  change: '調整',
};

// 刻意不用 secondary / error：那兩個色票在這個站台是「買入區間」與「警示」，
// 拿來標「新增」會被讀成買點。兩種標籤只靠框線與底色的差別區分。
const KIND_CLASS: Record<ChangeKind, string> = {
  new: 'border border-primary text-primary',
  change: 'border border-outline-variant bg-surface-container text-on-surface-variant',
};

const cardClass = 'bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm';

export default function Changelog() {
  return (
    <>
      <PageHeader title="更版歷程" icon="history" subtitle={`目前版本 v${CURRENT_VERSION}`} />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這裡寫的是
          <span className="text-on-surface">畫面上變了什麼、為什麼</span>
          ，不是逐筆 commit。版本號是上線日期加當天的第幾次（20261029-A 就是 10 月 29 日第一次）。
          型態、壓力與支撐這類規則的門檻調整也會記在這裡，數字前後對不上的時候先來看這一頁。
        </p>

        {CHANGELOG.map((entry) => (
          <section key={entry.version} className={`${cardClass} p-4 flex flex-col gap-stack-md`}>
            <div className="flex flex-wrap items-baseline justify-between gap-stack-sm">
              <h2 className="font-headline-md text-headline-md text-primary">{entry.title}</h2>
              <div className="flex items-baseline gap-stack-sm">
                <span className="font-data-md text-data-md text-on-surface">v{entry.version}</span>
                <span className="font-data-md text-data-md text-on-surface-variant">
                  {entry.date}
                </span>
              </div>
            </div>

            <ul className="flex flex-col gap-stack-sm">
              {entry.items.map((item) => (
                <li key={item.text} className="flex items-start gap-stack-sm">
                  <span
                    className={`shrink-0 mt-0.5 px-2 py-0.5 rounded font-label-caps text-label-caps ${KIND_CLASS[item.kind]}`}
                  >
                    {KIND_LABEL[item.kind]}
                  </span>
                  <span className="font-body-md text-body-md text-on-surface">{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
