import { Link, useLocation } from 'react-router-dom';

// 側邊欄用 nav / on-nav 這組專屬色票，而不是 primary——它在淺色與深色模式
// 都維持深底，是整個版面的定錨。primary 則會隨主題翻轉（深色下變亮藍），
// 拿它當大面積底色的話，切到深色模式側邊欄會整片變亮。

// 導覽分兩段：上面是不綁代號的市場頁，下面是吃 SymbolContext 代號的個股頁。
const marketNavItems = [
  { icon: 'monitoring', label: '市場概況', path: '/market' },
  { icon: 'star', label: '自選股', path: '/portfolio' },
  { icon: 'account_balance_wallet', label: '我的持股', path: '/holdings' },
  { icon: 'table_rows', label: '每日收盤', path: '/quotes' },
  { icon: 'school', label: '模擬買賣', path: '/paper' },
  { icon: 'compare_arrows', label: '自訂沖銷帳', path: '/ledger' },
  { icon: 'notifications_active', label: '多喵 Alert', path: '/alert' },
  { icon: 'menu_book', label: '研究報告', path: '/reports' },
  { icon: 'settings', label: '設定', path: '/settings' },
];

const symbolNavItems = [
  { icon: 'candlestick_chart', label: '個股總覽', path: '/dashboard' },
  { icon: 'groups', label: '三大法人', path: '/institutional' },
  { icon: 'account_balance', label: '融資融券', path: '/margin' },
  { icon: 'calculate', label: '估值指標', path: '/valuation' },
  { icon: 'receipt_long', label: '月營收', path: '/revenue' },
  { icon: 'campaign', label: '重大訊息', path: '/announcements' },
  { icon: 'warning', label: '注意股', path: '/warnings' },
];

export default function Sidebar() {
  const location = useLocation();

  const renderNav = (items: typeof marketNavItems) =>
    items.map((item) => {
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
    });

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

      <nav className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto scrollbar-on-primary">
        {renderNav(marketNavItems)}

        <p className="px-3 pt-4 pb-1 font-label-caps text-label-caps uppercase text-on-nav-muted">
          個股
        </p>
        {renderNav(symbolNavItems)}
      </nav>
    </aside>
  );
}
