import { ReactNode } from 'react';

type StateKind = 'loading' | 'error' | 'empty' | 'idle';

interface PageStateProps {
  kind: StateKind;
  /** 主要說明文字。不給時用各狀態的預設文案。 */
  message?: ReactNode;
  /** 次要提示，例如「請先選取股票」的操作指引。 */
  hint?: ReactNode;
  /** 錯誤狀態的重試動作；提供時顯示重試按鈕。 */
  onRetry?: () => void;
}

const presets: Record<StateKind, { icon: string; message: string; className: string }> = {
  loading: { icon: 'progress_activity', message: '載入中…', className: 'text-on-surface-variant' },
  error: { icon: 'error', message: '載入失敗', className: 'text-error' },
  empty: { icon: 'inbox', message: '沒有資料', className: 'text-outline' },
  idle: { icon: 'search', message: '請先選取股票', className: 'text-outline' },
};

/**
 * 資料頁的三態（載入中／錯誤／空資料）與未選取狀態的統一畫面。
 *
 * 空資料在這個專案有多種語意——沒收集到、非交易日、或這檔本來就沒有紀錄（注意股就是這樣），
 * 所以 hint 請由呼叫端補上該頁的正確說法，不要只丟一個「沒有資料」讓人以為壞了。
 */
export default function PageState({ kind, message, hint, onRetry }: PageStateProps) {
  const preset = presets[kind];
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-surface-container-lowest border border-outline-variant rounded-xl">
      <span
        className={`material-symbols-outlined text-[40px] mb-3 ${preset.className} ${
          kind === 'loading' ? 'animate-spin' : ''
        }`}
      >
        {preset.icon}
      </span>
      <p className={`font-body-md text-body-md font-medium ${preset.className}`}>
        {message ?? preset.message}
      </p>
      {hint && (
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 max-w-md">{hint}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded bg-primary text-on-primary font-body-md text-body-md hover:bg-primary-container transition-colors"
        >
          重試
        </button>
      )}
    </div>
  );
}
