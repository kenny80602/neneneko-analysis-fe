import { useState } from 'react';
import { apiErrorMessage } from '../api/request';
import { TargetStore } from '../hooks/useTargets';
import { formatPrice } from '../utils/format';

interface TargetPriceEditorProps {
  symbol: string;
  store: TargetStore;
  /** 緊湊版：小卡片與面板裡用，沒設定時只顯示「設目標」。 */
  compact?: boolean;
}

/**
 * 一檔的目標價：點一下就地編輯，Enter 或離開輸入框存檔，Esc 取消，清空存檔等於刪除。
 * 目標價是使用者自己的判斷，這裡只擋不合理的輸入（非數字、小於等於 0），其餘後端會再驗一次。
 */
export default function TargetPriceEditor({ symbol, store, compact = false }: TargetPriceEditorProps) {
  const current = store.get(symbol);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = (event: { stopPropagation: () => void }) => {
    // 放在可點擊的列或卡片裡，點擊不能冒泡成「選取這一檔」之類的動作。
    event.stopPropagation();
    setText(current ? String(current.target_price) : '');
    setError('');
    setEditing(true);
  };

  const commit = async () => {
    if (busy) return;
    const trimmed = text.trim();
    if (trimmed === '' && !current) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      if (trimmed === '') {
        await store.clear(symbol);
      } else {
        const price = Number(trimmed);
        if (!Number.isFinite(price) || price <= 0) {
          setError('目標價要大於 0');
          return;
        }
        if (!current || price !== current.target_price) await store.save(symbol, price, current?.note ?? '');
      }
      setEditing(false);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <span className="inline-flex flex-col items-end" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          inputMode="decimal"
          value={text}
          disabled={busy}
          aria-label={`${symbol} 的目標價`}
          placeholder="目標價"
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit();
            if (event.key === 'Escape') setEditing(false);
          }}
          className={`w-20 px-1 py-0.5 text-right bg-surface-container border rounded font-data-md text-data-md text-on-surface outline-none focus:ring-1 focus:ring-primary ${
            error ? 'border-error' : 'border-outline-variant focus:border-primary'
          }`}
        />
        {error && <span className="font-body-sm text-[11px] text-error">{error}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title={
        current
          ? `目標價 ${formatPrice(current.target_price)}${current.note ? `（${current.note}）` : ''}，點一下修改，清空刪除`
          : '點一下設定目標價（自己的判斷，不是券商目標價）'
      }
      className={`rounded px-1 hover:bg-surface-container ${
        current ? 'font-data-md text-data-md text-on-surface' : 'text-outline'
      }`}
    >
      {current ? formatPrice(current.target_price) : compact ? '設目標' : '—'}
    </button>
  );
}
