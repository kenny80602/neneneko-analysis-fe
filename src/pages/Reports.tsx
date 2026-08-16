import { useMemo } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getReportCatalog } from '../api/report';
import { Report } from '../api/types';
import { API_BASE } from '../config';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatDateTime } from '../utils/format';

// 研究報告。這一頁跟其他頁不一樣：它不畫資料，只列出後端 docs/ 底下那些
// 已經做好的單頁 HTML，點下去在新分頁開原本的報告。
//
// 為什麼不嵌在站內（iframe）：每篇報告自帶完整的設計系統——襯線標題、
// 自己的色票與深色模式——套在 DashboardLayout 裡會變成兩套系統疊在一起，
// 邊框、兩層捲軸與深淺色都會對不起來。

// 子目錄對應的中文分類。後端只回目錄名（那是檔案結構），翻譯是畫面的事。
//
// 沒對到的目錄直接顯示原名而不是丟掉：新增一個分類時報告還是要看得到，
// 補這張表只是讓標題好看一點。
const CATEGORY_LABEL: Record<string, string> = {
  maps: '產業地圖',
  market: '市場結構',
  audit: '報告稽核',
  design: '設計稿',
};

const cardClass = 'bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm';

/** 報告的完整網址。檔案由後端 serve，不是前端的靜態資源。 */
function reportUrl(report: Report): string {
  return `${API_BASE}${report.path}`;
}

export default function Reports() {
  const { data, loading, error, reload } = useAsyncData(() => getReportCatalog(), []);

  // 依分類分組。後端已經排好（分類、標題），這裡只是切段，不重排。
  const groups = useMemo(() => {
    const result: { category: string; label: string; items: Report[] }[] = [];
    (data?.items ?? []).forEach((item) => {
      const last = result[result.length - 1];
      if (last && last.category === item.category) {
        last.items.push(item);
        return;
      }
      result.push({
        category: item.category,
        label: CATEGORY_LABEL[item.category] ?? item.category ?? '其他',
        items: [item],
      });
    });
    return result;
  }, [data]);

  return (
    <>
      <PageHeader
        title="研究報告"
        icon="menu_book"
        subtitle={data?.count ? `共 ${data.count} 篇` : undefined}
        right={
          data?.index_path ? (
            <a
              href={`${API_BASE}${data.index_path}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">list</span>
              完整目錄
            </a>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這些是寫好之後放進後端 repo 的靜態報告，
          <span className="text-on-surface">不是這個系統即時算出來的</span>
          ——內容停在寫的那一天，日期就是檔案的更新時間。點任何一篇會在新分頁開啟，
          報告有自己的排版與深色模式。右上角的「完整目錄」是人工整理的版本，那一頁每篇都有摘要。
        </p>

        {loading && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reload} />}
        {!loading && !error && (data?.count ?? 0) === 0 && (
          <PageState
            kind="empty"
            message="沒有找到任何報告"
            hint="報告是跟著後端 repo 一起 checkout 出來的檔案。後端跑在沒有 docs/ 目錄的環境（例如只放了執行檔的容器）時，這裡就會是空的。"
          />
        )}

        {groups.map((group) => (
          <section key={group.category} className="flex flex-col gap-stack-md">
            <h2 className="font-headline-md text-headline-md text-primary">{group.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-gutter">
              {group.items.map((report) => (
                <a
                  key={report.path}
                  href={reportUrl(report)}
                  target="_blank"
                  rel="noreferrer"
                  className={`${cardClass} p-4 flex flex-col gap-stack-sm hover:bg-surface-container-low/50 transition-colors`}
                >
                  <div className="flex items-start justify-between gap-stack-sm">
                    <span className="font-body-lg text-body-lg text-on-surface font-semibold">
                      {report.title}
                    </span>
                    <span className="material-symbols-outlined text-[18px] text-outline shrink-0">
                      open_in_new
                    </span>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    更新於 {formatDateTime(report.updated_at)}
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
