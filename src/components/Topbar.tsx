import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { useSymbol } from '../context/SymbolContext';

/**
 * 全站頁首：品牌（行動版）、標的搜尋、通知 / 設定與登出。
 *
 * 搜尋框直接寫回 SymbolContext——個股各頁共用同一個代號，所以這裡搜完，
 * 切到任何個股頁看到的都是同一檔。
 */
export default function Topbar() {
  const navigate = useNavigate();
  const { symbol, setSymbol } = useSymbol();
  const [draft, setDraft] = useState(symbol);

  // 從其他地方（側邊欄、表格點列）改了代號時，搜尋框要跟著更新。
  useEffect(() => {
    setDraft(symbol);
  }, [symbol]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSymbol(trimmed);
    navigate('/dashboard');
  };

  const handleLogout = async () => {
    // logout 內部已保證清掉本地 token，後端失敗也照樣導回登入頁。
    await logout().catch((err) => console.error('登出失敗:', err));
    navigate('/login', { replace: true });
  };

  return (
    <header className="bg-surface border-b border-outline-variant flex justify-between items-center w-full px-6 h-16 shrink-0 z-30">
      <div className="md:hidden flex items-center gap-4">
        <Link
          to="/market"
          className="font-display text-headline-md font-bold text-primary tracking-tight whitespace-nowrap"
        >
          精準資本
        </Link>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        <form onSubmit={handleSearch} className="relative hidden sm:block">
          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="搜尋標的..."
            inputMode="numeric"
            className="pl-8 pr-3 py-1 bg-surface-container border border-outline-variant rounded font-body-sm text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none text-on-surface w-48"
          />
        </form>

        {/* 通知與設定尚無對應後端，先停用而不是給一個按了沒反應的按鈕。 */}
        <button
          type="button"
          disabled
          title="尚未實作"
          className="text-outline-variant cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
        </button>
        <button
          type="button"
          disabled
          title="尚未實作"
          className="text-outline-variant cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[20px]">settings</span>
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-outline-variant">
          {/* 後端目前沒有使用者頭像，用代表字圓形頭像取代設計稿的圖片佔位。 */}
          <div className="w-8 h-8 rounded-[9999px] bg-primary-container text-on-primary flex items-center justify-center font-body-sm text-body-sm font-bold">
            <span className="material-symbols-outlined text-[18px]">person</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="登出"
            className="text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
