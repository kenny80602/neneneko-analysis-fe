import request, { clearTokens } from './request';
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
