import { HistoryParams } from '../api/types';
import { today } from '../utils/format';

interface RangeFilterProps {
  value: HistoryParams;
  onChange: (next: HistoryParams) => void;
}

// 六支歷史端點（收盤、法人、融資券、估值、月營收、重大訊息）的查詢參數語意完全一致，
// 所以查詢條件也共用同一個元件：哪天要多支援一個參數，改這裡就好。
const limitOptions = [30, 60, 120, 250, 500];

const fieldClass =
  'px-2 py-2 bg-surface-container border border-outline-variant rounded font-body-sm text-body-sm text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary';

export default function RangeFilter({ value, onChange }: RangeFilterProps) {
  const max = today();

  return (
    <div className="flex items-center gap-stack-sm">
      <input
        type="date"
        value={value.from ?? ''}
        max={value.to || max}
        onChange={(event) => onChange({ ...value, from: event.target.value })}
        className={fieldClass}
      />
      <span className="font-body-sm text-body-sm text-on-surface-variant">至</span>
      <input
        type="date"
        value={value.to ?? ''}
        min={value.from || undefined}
        max={max}
        onChange={(event) => onChange({ ...value, to: event.target.value })}
        className={fieldClass}
      />
      <select
        value={value.limit ?? 60}
        onChange={(event) => onChange({ ...value, limit: Number(event.target.value) })}
        className={fieldClass}
      >
        {limitOptions.map((limit) => (
          <option key={limit} value={limit}>
            {limit} 筆
          </option>
        ))}
      </select>
    </div>
  );
}
