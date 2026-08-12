import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { apiErrorMessage } from '../api/request';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      // token 由回應標頭帶回，攔截器已寫進 localStorage（見 api/request.ts）。
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/market', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, '登入失敗，請確認帳號密碼'));
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
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5">密碼為 10 碼</p>
          </div>

          {error && (
            <p className="font-body-sm text-body-sm text-error bg-error-container/40 border border-error/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded bg-primary text-on-primary font-body-md text-body-md font-semibold hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '登入中…' : '登入'}
          </button>
        </form>
      </div>
    </div>
  );
}
