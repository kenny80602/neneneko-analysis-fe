import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { Theme, resolveTheme, setTheme } from '../utils/theme';
import SymbolPicker from './SymbolPicker';

/**
 * 全站頁首：品牌（行動版）、標的搜尋、通知 / 設定與登出。
 *
 * 搜尋框直接寫回 SymbolContext——個股各頁共用同一個代號，所以這裡搜完，
 * 切到任何個股頁看到的都是同一檔。
 */
export default function Topbar() {
  const navigate = useNavigate();
  // 初值直接讀已解析好的主題：index.tsx 在掛載前就套上去了，
  // 這裡再讀一次只是為了讓按鈕圖示對得上，不會造成閃爍。
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
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
        <div className="hidden sm:block">
          {/* 選定後跳到個股總覽：從頁首搜尋的人要的就是那一頁。 */}
          <SymbolPicker
            placeholder="搜尋標的…"
            inputClassName="w-48"
            onSelect={() => navigate('/dashboard')}
          />
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? '切換到淺色模式' : '切換到深色模式'}
          className="text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

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
