import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isLoggedIn } from '../api/request';

/**
 * 路由守衛：沒有 access token 就直接導回登入頁。
 *
 * 只看 token 存在與否，不打 API 驗證——後端 access token 只有 30 分鐘，
 * 過期的情況一律由 request.ts 的 401 攔截器自動換發；換發也失敗時它會導回 /login。
 * 在這裡再驗一次只會讓每次切頁多一個請求，而且結果還是一樣。
 */
export default function RequireAuth() {
  const location = useLocation();

  if (!isLoggedIn()) {
    // 帶上原本要去的位置，登入後可以送回去。
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
