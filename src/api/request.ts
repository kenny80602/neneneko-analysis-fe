import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE } from '../config';
import { ApiResponse } from './types';

// 後端位址；非 axios 的請求（如直接開檔下載）需用此絕對位址自行組 URL。
// 位址於執行期解析（見 src/config.ts），支援一顆 image 走多環境。
export const baseURL = API_BASE;

const request = axios.create({
  baseURL,
  // 大盤那幾支是即時打交易所的 OpenAPI，上游慢的時候 10 秒會不夠。
  timeout: 20000,
});

// ── Token ──
//
// 後端走 JWT：登入成功後 access / refresh token 由「回應標頭」帶回
// （x-jwt-token / x-refresh-token，CORS 的 ExposeHeaders 已放行），
// 請求時以 Authorization: Bearer <access token> 送出。
// 存 localStorage 讓重整後仍保持登入；access token 30 分鐘、refresh 7 天。
const ACCESS_TOKEN_KEY = 'stock:accessToken';
const REFRESH_TOKEN_KEY = 'stock:refreshToken';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAccessToken(token: string | null | undefined) {
  if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
  else localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function setRefreshToken(token: string | null | undefined) {
  if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
  else localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearTokens() {
  setAccessToken(null);
  setRefreshToken(null);
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

// 從回應標頭撈 token 寫回 localStorage。登入、簡訊登入與換發都靠這個，
// 因為後端這幾支的 body 是空的（data 為 null），token 只在標頭裡。
function captureTokens(headers: unknown) {
  const h = headers as Record<string, string | undefined> | undefined;
  // axios 會把標頭名轉小寫，直接取小寫即可。
  const access = h?.['x-jwt-token'];
  const refresh = h?.['x-refresh-token'];
  if (access) setAccessToken(access);
  if (refresh) setRefreshToken(refresh);
}

// 請求攔截：帶上 Authorization。換發那一支要送的是 refresh token，
// 由呼叫端自行覆寫 Authorization（見 doRefresh），這裡不特別處理。
request.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// 後端錯誤一律以非 200 的 HTTP 狀態回傳（見 ginx.WriteResponse），axios 會 throw，
// 錯誤訊息放在 body 的 msg。呼叫端 catch 後用這支取可直接顯示的字串。
export function apiErrorMessage(err: unknown, fallback = '操作失敗，請稍後再試'): string {
  const res = (err as AxiosError<ApiResponse<unknown>>)?.response;
  if (!res) return '無法連線到伺服器，請確認後端是否啟動';
  return res.data?.msg || fallback;
}

/**
 * 後端回的錯誤碼（對應 internal/pkg/errcode）。連不上或對方沒給 code 時回 0。
 *
 * 用途是分辨「重試有用」與「重試永遠沒用」：例如 LINE 沒設定 channel token
 * 屬於部署設定問題，畫面上不該顯示成紅色錯誤再配一顆重試鈕。
 * 只在需要分流的地方用，一般顯示錯誤還是走 apiErrorMessage。
 */
export function apiErrorCode(err: unknown): number {
  const res = (err as AxiosError<ApiResponse<unknown>>)?.response;
  return res?.data?.code ?? 0;
}

// 單一進行中的換發，避免多個 401 同時觸發多次 refresh。
// refresh token 是一次性的（後端以 Redis 記 ssid），併發換發會讓後面的直接失效。
let refreshPromise: Promise<unknown> | null = null;

function doRefresh(): Promise<unknown> {
  if (!refreshPromise) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return Promise.reject(new Error('no refresh token'));
    // 用原生 axios 呼叫，避開本攔截器造成遞迴；這一支的 Authorization 要帶 refresh token。
    refreshPromise = axios
      .post(`${baseURL}/users/refresh_token`, null, {
        headers: { Authorization: `Bearer ${refreshToken}` },
      })
      .then((res) => {
        captureTokens(res.headers);
        return res;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function redirectToLogin() {
  clearTokens();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// 回應攔截：
//   1) 成功時撈標頭裡的 token（登入 / 換發都靠這個）。
//   2) access token 過期（401）時自動換發並重試一次原請求；換發也失敗就導回登入頁。
request.interceptors.response.use(
  (res) => {
    captureTokens(res.headers);
    return res;
  },
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = config?.url ?? '';

    if (error.response?.status !== 401 || !config) {
      return Promise.reject(error);
    }
    // 登入 / 換發本身 401（帳密錯、refresh 過期），或已重試過：不再換發。
    if (config._retry || url.includes('/users/login') || url.includes('/users/refresh_token')) {
      if (!url.includes('/users/login')) redirectToLogin();
      return Promise.reject(error);
    }

    config._retry = true;
    try {
      await doRefresh();
      // 換發後標頭已更新，清掉舊的讓請求攔截器重新帶上新 token。
      config.headers.delete('Authorization');
      return request(config);
    } catch (refreshErr) {
      redirectToLogin();
      return Promise.reject(refreshErr);
    }
  }
);

export default request;
