import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  SMS_CODE_RESEND_SECONDS,
  SMS_CODE_VALID_MINUTES,
  lineLoginUrl,
  login,
  loginSMS,
  sendLoginSMSCode,
} from '../api/auth';
import { apiErrorMessage, setAccessToken, setRefreshToken } from '../api/request';

// LINE 授權完成後，後端會把瀏覽器導回這一頁，token 放在 fragment。
// 用 fragment 而不是 query 是後端刻意的：# 後面的內容不會送到伺服器，
// 所以不會留在 nginx／後端的存取紀錄裡，也不會被當成 Referer 外洩。
const LINE_ERROR_MESSAGES: Record<string, string> = {
  cancelled: '已取消 LINE 登入',
  verify_failed: 'LINE 授權驗證失敗，請重新登入一次',
  user_failed: '建立帳號失敗，請稍後再試',
  token_failed: '登入憑證簽發失敗，請稍後再試',
  state_failed: '登入流程初始化失敗，請重新整理後再試',
};

type LoginMode = 'password' | 'sms';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<LoginMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 重送倒數。後端擋 60 秒，按鈕不鎖住的話使用者只會收到 429 而不知道要等。
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);

    const failure = params.get('error');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!failure && !accessToken) return;

    // 無論成功失敗都先把 fragment 清掉：token 留在網址列會被寫進瀏覽器歷史，
    // 使用者按上一頁還會重新觸發一次這段邏輯。
    window.history.replaceState(null, '', window.location.pathname);

    if (failure) {
      setError(LINE_ERROR_MESSAGES[failure] ?? 'LINE 登入失敗，請改用帳號密碼');
      return;
    }
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    navigate('/market', { replace: true });
  }, [navigate]);

  // 兩種登入方式成功後的去向一樣：token 都由回應標頭帶回，
  // 攔截器已寫進 localStorage（見 api/request.ts）。
  const goAfterLogin = () => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from ?? '/market', { replace: true });
  };

  const switchMode = (next: LoginMode) => {
    setMode(next);
    // 訊息是針對前一種方式的，留著會對不上現在的表單。
    setError('');
    setNotice('');
  };

  const handleSendCode = async () => {
    setError('');
    setNotice('');
    setSendingCode(true);
    try {
      await sendLoginSMSCode(phone);
      setCodeSent(true);
      setResendIn(SMS_CODE_RESEND_SECONDS);
      setNotice(`驗證碼已送出，${SMS_CODE_VALID_MINUTES} 分鐘內有效`);
    } catch (err) {
      setError(apiErrorMessage(err, '驗證碼發送失敗，請稍後再試'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      if (mode === 'sms') {
        await loginSMS(phone, smsCode);
      } else {
        await login(email, password);
      }
      goAfterLogin();
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          mode === 'sms' ? '登入失敗，請確認驗證碼' : '登入失敗，請確認帳號密碼'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    'w-full px-3 py-2 bg-surface-container border border-outline-variant rounded font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background text-on-background">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-1 mb-8">
          <span className="font-display text-display text-primary tracking-tight">精準資本</span>
          <p className="font-body-md text-body-md text-on-surface-variant">台股資料分析平台</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col gap-stack-md"
        >
          <div className="flex p-1 rounded bg-surface-container">
            {(
              [
                ['password', '帳號密碼'],
                ['sms', '手機簡訊'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => switchMode(value)}
                className={`flex-1 py-1.5 rounded font-body-md text-body-md transition-colors ${
                  mode === value
                    ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'password' ? (
            <>
              <div>
                <label className="block font-label-caps text-label-caps uppercase text-on-surface-variant mb-1.5">
                  電子郵件
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="block font-label-caps text-label-caps uppercase text-on-surface-variant mb-1.5">
                  密碼
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  className={fieldClass}
                />
                {/* 後端 loginReq 的驗證是 len=10（剛好十碼），不是最少十碼；不先講會被 400 擋掉還看不出原因。 */}
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5">
                  密碼為 10 碼
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block font-label-caps text-label-caps uppercase text-on-surface-variant mb-1.5">
                  手機號碼
                </label>
                <div className="flex gap-stack-sm">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                    autoComplete="tel"
                    placeholder="09xxxxxxxx"
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={!phone || sendingCode || resendIn > 0}
                    className="shrink-0 px-3 py-2 rounded bg-surface border border-outline-variant text-primary font-body-md text-body-md whitespace-nowrap hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resendIn > 0
                      ? `${resendIn} 秒後可重送`
                      : sendingCode
                      ? '發送中…'
                      : codeSent
                      ? '重新發送'
                      : '發送驗證碼'}
                  </button>
                </div>
                {/* 這個門號沒註冊過時後端會直接建帳號，不必先去註冊。 */}
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5">
                  首次使用會直接以這個號碼建立帳號
                </p>
              </div>

              <div>
                <label className="block font-label-caps text-label-caps uppercase text-on-surface-variant mb-1.5">
                  驗證碼
                </label>
                <input
                  type="text"
                  value={smsCode}
                  onChange={(event) => setSmsCode(event.target.value)}
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={`${fieldClass} font-data-md text-data-md tracking-widest`}
                />
                {/* 後端 verify_code.lua 的可驗證次數是 3，用完就得重發，不講的話會一直試到被鎖。 */}
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5">
                  最多可輸入 3 次，錯 3 次要重新發送
                </p>
              </div>
            </>
          )}

          {notice && (
            <p className="font-body-sm text-body-sm text-on-surface-variant bg-surface-container border border-outline-variant rounded px-3 py-2">
              {notice}
            </p>
          )}

          {error && (
            <p className="font-body-sm text-body-sm text-error bg-error-container/40 border border-error/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || (mode === 'sms' && !codeSent)}
            className="w-full py-2.5 rounded bg-primary text-on-primary font-body-md text-body-md font-semibold hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '登入中…' : '登入'}
          </button>

          <div className="flex items-center gap-stack-sm">
            <span className="h-px flex-1 bg-outline-variant" />
            <span className="font-body-sm text-body-sm text-outline">或</span>
            <span className="h-px flex-1 bg-outline-variant" />
          </div>

          {/*
            用 <a> 而不是 onClick + navigate：這是離開本站到 LINE 的頂層導覽，
            交給瀏覽器原生處理，state cookie 才會被正確種下（見 api/auth.ts 的說明）。
            type="button" 的 <button> 包在 <form> 裡還得防止它觸發送出。
          */}
          <a
            href={lineLoginUrl()}
            className="w-full py-2.5 rounded bg-secondary text-on-secondary font-body-md text-body-md font-semibold hover:bg-secondary-container hover:text-on-secondary-container transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px] leading-none">chat</span>
            以 LINE 登入
          </a>
        </form>
      </div>
    </div>
  );
}
