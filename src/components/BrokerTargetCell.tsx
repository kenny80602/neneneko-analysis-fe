import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBrokerTargets } from '../context/BrokerTargetContext';
import { DASH, formatPrice } from '../utils/format';

const MARGIN = 16;
const WIDTH = 520;

/**
 * 一檔的券商目標價：格子顯示各家中位數與家數，點一下展開每家券商的目標價、發布日與出處連結。
 *
 * 資料是網路公開資訊整理來的，不是官方資料，可能搜錯或過期，所以：
 *  - 一律標「未驗證」（verified 為 true 才不標）。
 *  - 日期多半是新聞日，不一定是報告日。
 *  - 沒查到顯示破折號，不是「券商沒有給目標價」。
 */
export default function BrokerTargetCell({ symbol }: { symbol: string }) {
  const summary = useBrokerTargets(symbol);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(
    (event: { stopPropagation: () => void }) => {
      // 放在可點擊的列裡，點擊不能冒泡成「選取這一檔」或「展開這一列」。
      event.stopPropagation();
      if (open) {
        setOpen(false);
        return;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(WIDTH, window.innerWidth - MARGIN * 2);
      const left = Math.max(MARGIN, Math.min(rect.right - width, window.innerWidth - width - MARGIN));
      const top = Math.min(rect.bottom + 6, window.innerHeight - MARGIN - 160);
      setBox({ left, top: Math.max(MARGIN, top), maxHeight: window.innerHeight - MARGIN - Math.max(MARGIN, top) });
      setOpen(true);
    },
    [open]
  );

  // 點外面、按 Esc、頁面捲動或縮放都收起來（浮層自己內部的捲動不算）。
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  if (!summary) return <span className="text-outline">{DASH}</span>;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        title={`${summary.items.length} 家券商目標價的中位數（未驗證），點一下看每家與出處`}
        className="rounded px-1 font-data-md text-data-md text-on-surface hover:bg-surface-container whitespace-nowrap"
      >
        {formatPrice(summary.median)}
        <span className="ml-1 font-body-sm text-body-sm text-on-surface-variant">（{summary.items.length}）</span>
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`${symbol} 的券商目標價`}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'fixed',
              left: box.left,
              top: box.top,
              maxHeight: box.maxHeight,
              width: Math.min(WIDTH, window.innerWidth - MARGIN * 2),
            }}
            className="z-50 flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-lg"
          >
            <p className="font-body-md text-body-md text-on-surface font-semibold">
              {symbol} 券商目標價
              <span className="ml-2 font-body-sm text-body-sm font-normal text-on-surface-variant">
                中位數 {formatPrice(summary.median)}・{summary.items.length} 家・最新 {summary.newestDate}
              </span>
            </p>
            <p className="mt-1 mb-2 font-body-sm text-body-sm text-error">
              網路公開資訊整理，未經驗證，可能搜錯或過期；日期多半是新聞日，請點出處自己對照。這不是建議。
            </p>
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-surface-container-lowest">
                  <tr className="border-b border-outline-variant font-label-caps text-label-caps text-on-surface-variant uppercase">
                    <th className="py-1 pr-2">券商</th>
                    <th className="py-1 pr-2 text-right">目標價</th>
                    <th className="py-1 pr-2">日期</th>
                    <th className="py-1">出處</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {summary.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1 pr-2 font-body-sm text-body-sm text-on-surface whitespace-nowrap">
                        {item.broker}
                        {!item.verified && <span className="ml-1 text-[11px] text-outline">未驗證</span>}
                      </td>
                      <td className="py-1 pr-2 text-right font-data-md text-data-md text-on-surface">
                        {formatPrice(item.target_price)}
                      </td>
                      <td className="py-1 pr-2 font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                        {item.report_date}
                      </td>
                      <td className="py-1 font-body-sm text-body-sm">
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          title={item.note || item.source_url}
                        >
                          原文
                        </a>
                        {item.note && <span className="ml-2 text-outline">{item.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
