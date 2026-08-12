import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { getHoldings } from '../api/portfolio';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { DASH, marketLabel } from '../utils/format';

interface SymbolPickerProps {
  /** 輸入框左側的 material symbol 名稱。 */
  icon?: string;
  placeholder?: string;
  /** 輸入框的寬度等外觀差異，由呼叫端決定。 */
  inputClassName?: string;
  /** 給了就在輸入框右邊顯示送出按鈕（頁內版有「查詢」，頁首版沒有）。 */
  submitLabel?: string;
  /** 選定代號後的額外動作，例如頁首要跳到個股總覽。 */
  onSelect?: (symbol: string) => void;
}

/**
 * 代號輸入框 + 自選股下拉。
 *
 * 兩種用法並存是刻意的：清單裡的檔用選的（多數情況），不在清單裡的直接打代號查
 * ——行情與 K 線只有自選股才落地，但即時報價任何代號都查得到。
 *
 * 選定後一律寫回 SymbolContext，所以頁首選的跟頁內選的是同一個代號。
 */
export default function SymbolPicker({
  icon = 'search',
  placeholder = '搜尋標的…',
  inputClassName = 'w-48',
  submitLabel,
  onSelect,
}: SymbolPickerProps) {
  const { symbol, setSymbol } = useSymbol();
  const [draft, setDraft] = useState(symbol);
  const [open, setOpen] = useState(false);
  // 使用者沒打開過下拉就不抓清單。這個元件同一頁會有兩個（頁首一個、頁內一個），
  // 一進站就抓等於白打兩次；而且開過一次之後就留著，不要每次開合都重抓。
  const [everOpened, setEverOpened] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // 這次打開之後有沒有動過鍵盤。輸入框平常預帶目前選取的代號，
  // 若一展開就拿它當關鍵字過濾，清單只會剩那一檔，等於沒得挑。
  const [filtering, setFiltering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const holdings = useAsyncData(() => getHoldings(), [], { enabled: everOpened });

  // 從頁首搜尋或其他頁改了代號時，輸入框要跟著更新。
  useEffect(() => {
    setDraft(symbol);
  }, [symbol]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      // 沒送出就關掉的話把輸入框還原成目前選取的代號：
      // 留著沒生效的字，會讓人以為畫面上那些數字是那一檔的。
      setDraft(symbol);
      setFiltering(false);
      setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, symbol]);

  // 代號與名稱都能比對：記得「聯發科」但想不起 2454 的情況比想像中常見。
  const matches = useMemo(() => {
    const keyword = draft.trim().toLowerCase();
    const rows = holdings.data ?? [];
    if (!filtering || !keyword) return rows;
    return rows.filter(
      (row) =>
        row.symbol.toLowerCase().includes(keyword) || row.name.toLowerCase().includes(keyword)
    );
  }, [holdings.data, draft, filtering]);

  const openDropdown = () => {
    setEverOpened(true);
    setOpen(true);
  };

  /** 由展開鈕或聚焦打開：先回到「看全部」，不要被預帶的代號過濾掉。 */
  const browseAll = () => {
    setFiltering(false);
    setActiveIndex(-1);
    openDropdown();
  };

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    // 也把輸入框寫回去。同步 draft 的 effect 只在代號「變了」才跑，
    // 選到的剛好就是目前這一檔時不會觸發，輸入框會留著剛才打的關鍵字。
    setDraft(trimmed);
    setSymbol(trimmed);
    setOpen(false);
    setActiveIndex(-1);
    setFiltering(false);
    onSelect?.(trimmed);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // 鍵盤選到某一列時 Enter 是「選這一列」，否則才是「查我打的字」。
    commit(activeIndex >= 0 && matches[activeIndex] ? matches[activeIndex].symbol : draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openDropdown();
      if (matches.length === 0) return;
      // 起始值是 -1（沒選任何一列），所以往下要落在 0、往上要落在最後一列，
      // 用取餘數會從 -1 直接跳到第二列。
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === 'Escape') {
      setDraft(symbol);
      setFiltering(false);
      setActiveIndex(-1);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit} className="flex items-center gap-stack-sm">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
            {icon}
          </span>
          <input
            type="text"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setActiveIndex(-1);
              setFiltering(true);
              openDropdown();
            }}
            onFocus={browseAll}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            role="combobox"
            aria-expanded={open}
            aria-controls="symbol-picker-list"
            aria-autocomplete="list"
            className={`pl-8 pr-8 py-2 bg-surface-container border border-outline-variant rounded font-body-sm text-body-sm text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary ${inputClassName}`}
          />
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : browseAll())}
            title="自選股清單"
            aria-label="展開自選股清單"
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-outline hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {open ? 'arrow_drop_up' : 'arrow_drop_down'}
            </span>
          </button>
        </div>

        {submitLabel && (
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-on-primary rounded font-body-md text-body-md hover:bg-primary-container transition-colors"
          >
            {submitLabel}
          </button>
        )}
      </form>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-72 max-w-[calc(100vw-2rem)] bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
          <p className="px-3 py-2 font-label-caps text-label-caps uppercase text-on-surface-variant bg-surface-container-low border-b border-outline-variant">
            自選股
          </p>

          {holdings.loading && (
            <p className="px-3 py-3 font-body-sm text-body-sm text-on-surface-variant">載入中…</p>
          )}
          {holdings.error && (
            <p className="px-3 py-3 font-body-sm text-body-sm text-error">{holdings.error}</p>
          )}

          {!holdings.loading && !holdings.error && (holdings.data?.length ?? 0) === 0 && (
            <p className="px-3 py-3 font-body-sm text-body-sm text-on-surface-variant">
              自選股清單是空的。增刪目前走 LINE 聊天室，輸入「加 2330」即可加入。
            </p>
          )}

          {!holdings.loading && !!holdings.data?.length && matches.length === 0 && filtering && (
            <p className="px-3 py-3 font-body-sm text-body-sm text-on-surface-variant">
              自選股裡沒有符合「{draft.trim()}」的檔。按 Enter 仍可直接查這個代號——
              即時報價任何代號都查得到，只是 K 線與法人只有自選股才有。
            </p>
          )}

          {matches.length > 0 && (
            <ul id="symbol-picker-list" role="listbox" className="max-h-72 overflow-y-auto">
              {matches.map((row, index) => (
                <li key={row.symbol} role="option" aria-selected={row.symbol === symbol}>
                  <button
                    type="button"
                    onClick={() => commit(row.symbol)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                      index === activeIndex ? 'bg-surface-container-low' : ''
                    } ${row.symbol === symbol ? 'border-l-[3px] border-l-primary' : ''}`}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="font-data-md text-data-md text-primary font-bold">
                        {row.symbol}
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {row.name}
                      </span>
                    </span>
                    {/* 從 LINE 或匯入進來的自選股常常沒有市場別，孤零零一個破折號只是噪音。 */}
                    {marketLabel(row.market) !== DASH && (
                      <span className="font-body-sm text-body-sm text-outline shrink-0">
                        {marketLabel(row.market)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
