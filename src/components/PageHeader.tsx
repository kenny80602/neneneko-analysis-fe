import { ReactNode } from 'react';

interface PageHeaderProps {
  /** 頁面主標題。 */
  title: ReactNode;
  /** 標題下方的說明行（目前代號、資料日期、這頁在看什麼）。 */
  subtitle?: ReactNode;
  /** 標題前置 material symbol 圖示名稱。 */
  icon?: string;
  /** 提供時於標題左側顯示返回箭頭。 */
  onBack?: () => void;
  /** 返回鈕的 title（無障礙提示）。 */
  backTitle?: string;
  /** 右側動作區（查詢條件、按鈕…）。手機版會換行到標題下方並撐滿寬度。 */
  right?: ReactNode;
}

/**
 * 各頁共用的標題區塊。捲動與寬度由 DashboardLayout 負責，這裡只排標題與動作。
 * 標題一律 font-display text-display，讓各頁的視覺起點一致。
 */
export default function PageHeader({
  title,
  subtitle,
  icon,
  onBack,
  backTitle,
  right,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-stack-md">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              title={backTitle}
              className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
          )}
          <h1 className="font-display text-display text-primary flex items-center gap-2">
            {icon && <span className="material-symbols-outlined text-[28px]">{icon}</span>}
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">{subtitle}</p>
        )}
      </div>

      {right && (
        <div className="flex flex-wrap items-center gap-stack-sm w-full sm:w-auto">{right}</div>
      )}
    </div>
  );
}
