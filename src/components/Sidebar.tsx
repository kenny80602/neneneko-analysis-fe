import { Link, useLocation } from 'react-router-dom';

// 導覽分兩段：上面是不綁代號的市場頁，下面是吃 SymbolContext 代號的個股頁。
const marketNavItems = [
  { icon: 'monitoring', label: '市場概況', path: '/market' },
  { icon: 'star', label: '自選股', path: '/portfolio' },
  { icon: 'table_rows', label: '每日收盤', path: '/quotes' },
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
              ? 'text-on-primary bg-primary-container font-semibold'
              : 'text-primary-fixed-dim hover:text-on-primary hover:bg-primary-container font-medium'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
          {item.label}
        </Link>
      );
    });

  return (
    <aside className="w-64 bg-primary text-on-primary flex-col hidden md:flex h-full z-40 shrink-0 shadow-lg">
      <div className="h-16 flex items-center px-6 shrink-0 border-b border-primary-container">
        <Link
          to="/market"
          className="font-display text-headline-md font-bold tracking-tight whitespace-nowrap"
        >
          精準資本
        </Link>
      </div>

      <nav className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto scrollbar-on-primary">
        {renderNav(marketNavItems)}

        <p className="px-3 pt-4 pb-1 font-label-caps text-label-caps uppercase text-on-primary-container">
          個股
        </p>
        {renderNav(symbolNavItems)}
      </nav>
    </aside>
  );
}
