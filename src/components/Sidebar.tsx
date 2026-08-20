import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSymbol } from '../context/SymbolContext';

// 側邊欄用 nav / on-nav 這組專屬色票，而不是 primary——它在淺色與深色模式
// 都維持深底，是整個版面的定錨。primary 則會隨主題翻轉（深色下變亮藍），
// 拿它當大面積底色的話，切到深色模式側邊欄會整片變亮。

interface NavItem {
  icon: string;
  label: string;
  path: string;
}

interface NavGroup {
  /** 折疊狀態的鍵，存進 localStorage 用，改了會讓使用者原本收起來的那幾組全部展開。 */
  key: string;
  title: string;
  items: NavItem[];
}

// 導覽分四組。分組的依據是「這一頁在回答誰的問題」，不是資料來源——
// 收盤行情同時餵了市場概況與個股總覽，照來源分的話兩邊都得放一次。
//
//   市場      不綁代號，看的是整個盤
//   我的投資  只跟自己的部位有關，換一個人看到的完全不同
//   個股      吃 SymbolContext 的代號，這一組看的都是同一檔
//   工具      不看行情：練習、推播、報告與設定
//
// 模擬買賣刻意放在「工具」而不是「我的投資」：它整包存在 localStorage、
// 跟真實部位一點關係都沒有，混在持股與沖銷帳中間會被當成真的帳。
const NAV_GROUPS: NavGroup[] = [
  {
    key: 'market',
    title: '市場',
    items: [
      { icon: 'monitoring', label: '市場概況', path: '/market' },
      { icon: 'table_rows', label: '每日收盤', path: '/quotes' },
      { icon: 'leaderboard', label: '全市場排行', path: '/ranks' },
      { icon: 'workspaces', label: '主題族群', path: '/groups' },
      { icon: 'event', label: '台股行事曆', path: '/calendar' },
      { icon: 'account_balance', label: 'Fed 與總經', path: '/macro' },
    ],
  },
  {
    key: 'mine',
    title: '我的投資',
    items: [
      { icon: 'star', label: '自選股', path: '/portfolio' },
      { icon: 'account_balance_wallet', label: '我的持股', path: '/holdings' },
      { icon: 'compare_arrows', label: '自訂沖銷帳', path: '/ledger' },
      { icon: 'summarize', label: '沖銷帳總覽', path: '/ledger/summary' },
    ],
  },
  {
    key: 'symbol',
    title: '個股',
    items: [
      { icon: 'candlestick_chart', label: '個股總覽', path: '/dashboard' },
      { icon: 'show_chart', label: '技術指標', path: '/indicators' },
      { icon: 'groups', label: '三大法人', path: '/institutional' },
      { icon: 'account_balance', label: '融資融券', path: '/margin' },
      { icon: 'groups_2', label: '大戶散戶', path: '/shareholding' },
      { icon: 'calculate', label: '估值指標', path: '/valuation' },
      { icon: 'receipt_long', label: '月營收', path: '/revenue' },
      { icon: 'campaign', label: '重大訊息', path: '/announcements' },
      { icon: 'warning', label: '注意股', path: '/warnings' },
    ],
  },
  {
    key: 'tools',
    title: '工具',
    items: [
      { icon: 'school', label: '模擬買賣', path: '/paper' },
      { icon: 'notifications_active', label: '多喵 Alert', path: '/alert' },
      { icon: 'menu_book', label: '研究報告', path: '/reports' },
      { icon: 'schedule', label: '排程', path: '/schedules' },
      { icon: 'settings', label: '設定', path: '/settings' },
    ],
  },
];

/** 收起來的群組。存的是「收起來的」而不是「展開的」：預設全展開，新增群組才不會被誤收。 */
const COLLAPSED_KEY = 'stock:navCollapsed';

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key): key is string => typeof key === 'string');
  } catch {
    // 隱私模式會丟例外，存不了就是這次全部展開，不值得為它擋掉整個側邊欄。
    return [];
  }
}

function writeCollapsed(keys: string[]): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(keys));
  } catch {
    // 同上：存不了就只有這次生效。
  }
}

export default function Sidebar() {
  const location = useLocation();
  const { symbol } = useSymbol();
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);

  const toggle = (key: string) => {
    const next = collapsed.includes(key)
      ? collapsed.filter((k) => k !== key)
      : [...collapsed, key];
    setCollapsed(next);
    writeCollapsed(next);
  };

  return (
    <aside className="w-64 bg-nav text-on-nav flex-col hidden md:flex h-full z-40 shrink-0 shadow-lg">
      <div className="h-16 flex items-center px-6 shrink-0 border-b border-nav-active">
        <Link
          to="/market"
          className="font-display text-headline-md font-bold tracking-tight whitespace-nowrap"
        >
          精準資本
        </Link>
      </div>

      <nav className="flex-1 py-3 px-3 flex flex-col overflow-y-auto scrollbar-on-primary">
        {NAV_GROUPS.map((group) => {
          const hasActive = group.items.some((item) => item.path === location.pathname);
          // 目前所在的那一組一律展開：收起來的話畫面上會找不到自己在哪一頁。
          const isCollapsed = collapsed.includes(group.key) && !hasActive;
          // 個股那一組看的都是同一個代號，把它標在組名旁邊，省得逐頁打開才知道在看哪一檔。
          const badge =
            group.key === 'symbol' ? symbol || '未選取' : String(group.items.length);

          return (
            <div key={group.key} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggle(group.key)}
                title={isCollapsed ? `展開${group.title}` : `收合${group.title}`}
                className="flex items-center gap-1 px-2 pt-4 pb-1 font-label-caps text-label-caps uppercase text-on-nav-muted hover:text-on-nav transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isCollapsed ? 'chevron_right' : 'expand_more'}
                </span>
                {group.title}
                <span
                  className={`ml-auto px-1.5 rounded bg-nav-active normal-case ${
                    group.key === 'symbol' && symbol
                      ? 'font-data-md text-data-md text-on-nav'
                      : 'font-body-sm text-body-sm text-on-nav-muted'
                  }`}
                >
                  {badge}
                </span>
              </button>

              {!isCollapsed && (
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg font-body-md text-body-md transition-colors ${
                          isActive
                            ? 'text-on-nav bg-nav-active font-semibold'
                            : 'text-on-nav-muted hover:text-on-nav hover:bg-nav-active font-medium'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
