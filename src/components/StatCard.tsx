import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  /** 主要數值。已格式化的字串，null 的處理交給 utils/format。 */
  value: ReactNode;
  /** 數值下方的補充說明（單位、資料時間、來源…）。 */
  hint?: ReactNode;
  /** material symbol 圖示名稱。 */
  icon?: string;
  /** 覆寫數值顏色，漲跌請用 utils/format 的 quoteColor。 */
  valueClassName?: string;
}

/** 指標卡。統一內距、圓角與邊框，讓一排卡片高度一致。 */
export default function StatCard({
  label,
  value,
  hint,
  icon,
  valueClassName = 'text-on-surface',
}: StatCardProps) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm flex flex-col gap-1">
      <div className="flex items-center gap-2 text-on-surface-variant">
        {icon && <span className="material-symbols-outlined text-[18px]">{icon}</span>}
        <span className="font-label-caps text-label-caps uppercase">{label}</span>
      </div>
      <p className={`font-data-lg text-data-lg ${valueClassName}`}>{value}</p>
      {hint && <p className="font-body-sm text-body-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}
