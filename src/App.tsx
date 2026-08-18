import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import RequireAuth from './components/RequireAuth';
import { SymbolProvider } from './context/SymbolContext';
import Alert from './pages/Alert';
import Announcements from './pages/Announcements';
import Calendar from './pages/Calendar';
import DailyQuotes from './pages/DailyQuotes';
import Dashboard from './pages/Dashboard';
import Holdings from './pages/Holdings';
import Institutional from './pages/Institutional';
import LedgerSummary from './pages/LedgerSummary';
import Login from './pages/Login';
import LotLedger from './pages/LotLedger';
import Margin from './pages/Margin';
import Market from './pages/Market';
import PaperTrading from './pages/PaperTrading';
import Portfolio from './pages/Portfolio';
import Reports from './pages/Reports';
import Revenue from './pages/Revenue';
import Settings from './pages/Settings';
import Valuation from './pages/Valuation';
import Warnings from './pages/Warnings';

function App() {
  // basename 取 PUBLIC_URL：GitHub Pages 的專案站台掛在以 repo 名為名的子路徑下
  // （目前是 /neneneko-analysis-fe/），不給 basename 的話所有路由都會少算這一段而對不到。
  // 不寫死 repo 名是因為 workflow 是用 github.event.repository.name 動態注入的，
  // repo 改名會自動跟上。該值只在 CI 建置時注入，本機開發是空字串，等同沒設。
  return (
    <BrowserRouter basename={process.env.PUBLIC_URL}>
      <SymbolProvider>
        <Routes>
          {/* 公開路由 */}
          <Route path="/login" element={<Login />} />

          {/* 受保護路由：未登入一律導回 /login */}
          <Route element={<RequireAuth />}>
            <Route element={<DashboardLayout />}>
              {/* 市場：不綁股票代號 */}
              <Route path="/market" element={<Market />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/holdings" element={<Holdings />} />
              <Route path="/quotes" element={<DailyQuotes />} />
              <Route path="/paper" element={<PaperTrading />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/ledger" element={<LotLedger />} />
              <Route path="/ledger/summary" element={<LedgerSummary />} />
              <Route path="/alert" element={<Alert />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />

              {/* 個股：共用 SymbolContext 的代號 */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/institutional" element={<Institutional />} />
              <Route path="/margin" element={<Margin />} />
              <Route path="/valuation" element={<Valuation />} />
              <Route path="/revenue" element={<Revenue />} />
              <Route path="/announcements" element={<Announcements />} />
              <Route path="/warnings" element={<Warnings />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/market" replace />} />
        </Routes>
      </SymbolProvider>
    </BrowserRouter>
  );
}

export default App;
