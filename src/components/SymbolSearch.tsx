import { FormEvent, useEffect, useState } from 'react';
import { useSymbol } from '../context/SymbolContext';

/**
 * 頁內的代號輸入框：送出後寫回 SymbolContext，個股各頁共用同一個代號。
 * 放在 PageHeader 的 right 區；頁首那個全站搜尋（Topbar）走的是同一份 context。
 */
export default function SymbolSearch() {
  const { symbol, setSymbol } = useSymbol();
  const [draft, setDraft] = useState(symbol);

  // 從頁首搜尋或其他頁改了代號時，輸入框要跟著更新。
  useEffect(() => {
    setDraft(symbol);
  }, [symbol]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSymbol(draft);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-stack-sm">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
          sell
        </span>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="股票代號"
          inputMode="numeric"
          className="w-32 pl-8 pr-3 py-2 bg-surface-container border border-outline-variant rounded font-body-sm text-body-sm text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <button
        type="submit"
        className="px-4 py-2 bg-primary text-on-primary rounded font-body-md text-body-md hover:bg-primary-container transition-colors"
      >
        查詢
      </button>
    </form>
  );
}
