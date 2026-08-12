import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import RequireAuth from './components/RequireAuth';
import { SymbolProvider } from './context/SymbolContext';
import Alert from './pages/Alert';
import Announcements from './pages/Announcements';
import DailyQuotes from './pages/DailyQuotes';
import Dashboard from './pages/Dashboard';
import Institutional from './pages/Institutional';
import Login from './pages/Login';
import Margin from './pages/Margin';
import Market from './pages/Market';
import Portfolio from './pages/Portfolio';
import Revenue from './pages/Revenue';
import Valuation from './pages/Valuation';
import Warnings from './pages/Warnings';

function App() {
  return (
    <BrowserRouter>
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
              <Route path="/quotes" element={<DailyQuotes />} />
              <Route path="/alert" element={<Alert />} />

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
