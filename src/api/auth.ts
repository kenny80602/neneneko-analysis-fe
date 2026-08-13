import request, { baseURL, clearTokens } from './request';
import { ApiResponse } from './types';

// UserHandler — /users，登入與帳號。
// 登入成功後 token 由回應標頭帶回，request.ts 的回應攔截器會自動寫進 localStorage，
// 所以這裡不需要（也拿不到）body 裡的 token。

// 帳密登入。密碼後端限制為剛好 10 碼（validate:"len=10"），不符會回 400。
export const login = (email: string, password: string) =>
  request
    .post<ApiResponse<null>>('/users/login', { email, password })
    .then((res) => res.data);

// 註冊。
export const signup = (email: string, password: string, confirmPassword: string) =>
  request
    .post<ApiResponse<null>>('/users/signup', {
      email,
      password,
      confirmPassword,
    })
    .then((res) => res.data);

// 簡訊登入的重送間隔（秒）。後端 set_code.lua 只在驗證碼 ttl < 540 時才換新的
// （有效期 600 秒），所以送出後 60 秒內再送一定會被判定為過於頻繁而回 429。
// 畫面上的倒數就是照這個數字走，讓使用者知道還要等多久而不是按了沒反應。
export const SMS_CODE_RESEND_SECONDS = 60;

// 簡訊驗證碼有效期（分鐘），同樣來自 set_code.lua 的 expire 600。
export const SMS_CODE_VALID_MINUTES = 10;

// 送出簡訊驗證碼。同一組門號 60 秒內重送會回 429。
// ⚠️ 會真的發簡訊並產生費用，畫面上務必用倒數擋住連點。
export const sendLoginSMSCode = (phone: string) =>
  request
    .post<ApiResponse<null>>('/users/login_sms/code/send', { phone })
    .then((res) => res.data);

// 簡訊登入。這個門號沒註冊過時後端會直接建帳號（FindOrCreate），不需要先註冊。
// 驗證碼最多讓使用者輸錯三次，超過就要重新發送。
export const loginSMS = (phone: string, code: string) =>
  request
    .post<ApiResponse<null>>('/users/login_sms', { phone, code })
    .then((res) => res.data);

// LINE Login 的進入點。這支不是用 axios 呼叫，而是把瀏覽器整個導過去——
// 後端會先種下 state cookie 再 302 到 LINE 的授權頁。
//
// 為什麼不走 XHR 拿 /oauth2/line/authurl 再自己跳轉：那支回的 Set-Cookie 是跨來源的，
// 除非開 withCredentials 否則會被瀏覽器丟掉，等使用者從 LINE 回來時 state 驗不過。
// 頂層導覽沒有這個問題。
export const lineLoginUrl = () => `${baseURL}/oauth2/line/login`;

// 取得目前登入者。順便可當作「token 還有效嗎」的探針。
export const getProfile = () =>
  request.get<ApiResponse<unknown>>('/users/profile').then((res) => res.data.data);

// 登出。後端會作廢 ssid，前端無論成敗都要清掉本地 token。
export const logout = async () => {
  try {
    await request.post<ApiResponse<null>>('/users/logout');
  } finally {
    clearTokens();
  }
};
