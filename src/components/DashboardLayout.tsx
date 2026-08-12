import { Outlet } from 'react-router-dom';
import AppFooter from './AppFooter';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * 全站版面：側邊欄 + 頁首 + 內容區 + 頁尾。
 *
 * 捲動由這裡的 <main> 負責，內容區固定 max-w-[1200px] 置中——
 * 各頁只要照順序放 <PageHeader> 與內容，不必自己處理捲動與寬度。
 */
export default function DashboardLayout() {
  return (
    <div className="h-screen flex bg-background text-on-background antialiased overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <Topbar />
        <main className="flex-1 p-8 overflow-y-auto flex flex-col gap-stack-lg">
          <div className="max-w-[1200px] w-full mx-auto flex flex-col gap-stack-lg flex-1">
            <Outlet />
            <AppFooter />
          </div>
        </main>
      </div>
    </div>
  );
}
