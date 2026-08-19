import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getBrokerFees, removeAccountFees, setAccountFees } from '../api/ledger';
import { getHoldings } from '../api/portfolio';
import { apiErrorMessage } from '../api/request';
import { AccountFee, FeeBook } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatNumber, formatPrice } from '../utils/format';

// 各券商帳戶的手續費設定：只有你知道答案、系統推不出來的那一種設定。
//
// 主題族群本來也在這一頁，2026-08-19 搬到 /groups 自己一頁——它是天天在調整的
// 工作區，而費率設好幾乎不會再動，兩者除了「都得人工填」之外沒有任何共通點。
//
// 為什麼需要這一頁：部位散在不同券商，談到的折數不一樣。全站共用一個值的話，
// 其中一邊的淨損益一定是錯的，而錯的方向是「看起來比較賺」——那是最糟的錯法。
//
// 只讓改折數與最低收費。手續費率 0.1425% 與證交稅 0.3% 是台股的公開規則，
// 不會因為換一家券商而改變，做成可改只會多一個能被改壞的地方。
//
// 帳戶清單來自自選股持股表的 account 欄位，而不是讓使用者自己打——
// 打錯一個字就會變成一個永遠對不到任何部位的孤兒設定。

/** 折數輸入中的原始字串。合法才送出，不合法在失焦時退回原值。 */
interface Draft {
  buy: string;
  sell: string;
  buyMin: string;
  sellMin: string;
}

function toDraft(fee: AccountFee): Draft {
  return {
    buy: String(fee.buy_discount),
    sell: String(fee.sell_discount),
    buyMin: String(fee.buy_minimum),
    sellMin: String(fee.sell_minimum),
  };
}

/** 折數要落在 (0, 1]，最低收費不能是負的。不合法回 null。 */
function parseDraft(account: string, draft: Draft): AccountFee | null {
  const buy = Number(draft.buy);
  const sell = Number(draft.sell);
  const buyMin = Number(draft.buyMin);
  const sellMin = Number(draft.sellMin);
  if (!Number.isFinite(buy) || buy <= 0 || buy > 1) return null;
  if (!Number.isFinite(sell) || sell <= 0 || sell > 1) return null;
  if (!Number.isFinite(buyMin) || buyMin < 0) return null;
  if (!Number.isFinite(sellMin) || sellMin < 0) return null;
  return {
    account,
    buy_discount: buy,
    sell_discount: sell,
    buy_minimum: buyMin,
    sell_minimum: sellMin,
  };
}

export default function Settings() {
  const fees = useAsyncData(() => getBrokerFees(), []);
  // 帳戶清單取自持股表：設定要對得上實際的部位才有意義。
  const holdings = useAsyncData(() => getHoldings(false), []);

  const [book, setBook] = useState<FeeBook | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const current = book ?? fees.data ?? null;

  /** 表上要列出的帳戶：持股表有的，加上已經設定過但目前沒有部位的。 */
  const accounts = useMemo(() => {
    const names = new Set<string>();
    for (const h of holdings.data ?? []) {
      const name = h.account.trim();
      if (name) names.add(name);
    }
    for (const a of current?.accounts ?? []) names.add(a.account);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [holdings.data, current]);

  const ruleFor = (account: string): AccountFee =>
    current?.accounts.find((a) => a.account === account) ??
    // 沒單獨設定過就用預設當起點，但 account 換成自己的，存下去才會建出新的一列。
    { ...(current?.default as AccountFee), account };

  const draftFor = (account: string): Draft => drafts[account] ?? toDraft(ruleFor(account));

  const setDraft = (account: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [account]: { ...draftFor(account), ...patch } }));

  const save = async (account: string) => {
    const parsed = parseDraft(account, draftFor(account));
    if (!parsed) {
      setNotice('折數要大於 0 且不超過 1（0.35 代表 3.5 折），最低收費不能是負數');
      return;
    }
    setBusy(account);
    setNotice('');
    try {
      const updated = await setAccountFees(parsed);
      setBook(updated);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[account];
        return next;
      });
      setNotice(`已更新${account === '' ? '全站預設' : `「${account}」`}的費率`);
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const reset = async (account: string) => {
    if (!window.confirm(`「${account}」改回吃全站預設？`)) return;
    setBusy(account);
    setNotice('');
    try {
      const updated = await removeAccountFees(account);
      setBook(updated);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[account];
        return next;
      });
      setNotice(`「${account}」已改回吃全站預設`);
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const fieldClass =
    'px-2 py-1 w-24 bg-surface-container border border-outline-variant rounded font-data-md text-data-md text-right text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary';
  const headCell =
    'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
  const numberCell = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';

  /** 一列設定。預設那一列不給刪，所以 onReset 是可選的。 */
  const renderRow = (account: string, label: string, hint: string, onReset?: () => void) => {
    const draft = draftFor(account);
    const overridden = current?.accounts.some((a) => a.account === account) ?? false;
    const rate = current?.rate ?? 0;
    const buy = Number(draft.buy);
    const sell = Number(draft.sell);
    return (
      <tr key={account || '__default__'} className="hover:bg-surface-container-low/60 transition-colors">
        <td className="p-2 pl-4 py-3 whitespace-nowrap">
          <span className="font-body-md text-body-md text-on-surface font-semibold">{label}</span>
          <span className="block font-body-sm text-body-sm text-on-surface-variant">{hint}</span>
          {account !== '' && !overridden && (
            <span className="block font-body-sm text-body-sm text-outline">目前吃全站預設</span>
          )}
        </td>
        <td className={numberCell}>
          <input
            value={draft.buy}
            onChange={(event) => setDraft(account, { buy: event.target.value })}
            inputMode="decimal"
            className={fieldClass}
          />
          {/* 折數不直覺，把換算後的實際費率寫出來，才不會有人把 0.35 讀成 3.5%。 */}
          <span className="block font-body-sm text-body-sm text-outline mt-1">
            {Number.isFinite(buy) && buy > 0 ? `＝ ${(rate * buy * 100).toFixed(4)}%` : '—'}
          </span>
        </td>
        <td className={numberCell}>
          <input
            value={draft.buyMin}
            onChange={(event) => setDraft(account, { buyMin: event.target.value })}
            inputMode="numeric"
            className={fieldClass}
          />
        </td>
        <td className={numberCell}>
          <input
            value={draft.sell}
            onChange={(event) => setDraft(account, { sell: event.target.value })}
            inputMode="decimal"
            className={fieldClass}
          />
          <span className="block font-body-sm text-body-sm text-outline mt-1">
            {Number.isFinite(sell) && sell > 0 ? `＝ ${(rate * sell * 100).toFixed(4)}%` : '—'}
          </span>
        </td>
        <td className={numberCell}>
          <input
            value={draft.sellMin}
            onChange={(event) => setDraft(account, { sellMin: event.target.value })}
            inputMode="numeric"
            className={fieldClass}
          />
        </td>
        <td className="p-2 pr-4 py-3 text-right whitespace-nowrap">
          <span className="inline-flex gap-2">
            <button
              type="button"
              onClick={() => save(account)}
              disabled={busy !== ''}
              className="px-3 py-1.5 bg-primary rounded text-on-primary font-body-sm text-body-sm hover:bg-primary-container transition-colors disabled:opacity-40"
            >
              {busy === account ? '儲存中…' : '儲存'}
            </button>
            {onReset && overridden && (
              <button
                type="button"
                onClick={onReset}
                disabled={busy !== ''}
                className="px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-40"
              >
                改回預設
              </button>
            )}
          </span>
        </td>
      </tr>
    );
  };

  const loading = fees.loading || holdings.loading;
  const error = fees.error || holdings.error;

  return (
    <>
      <PageHeader
        title="設定"
        icon="settings"
        subtitle="只有你知道答案的那些設定：各券商帳戶的手續費折數與最低收費。"
        right={
          notice ? (
            <span className="font-body-sm text-body-sm text-primary">{notice}</span>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          <span className="text-on-surface font-semibold">折數不是百分比</span>
          ：0.35 代表「牌價的 3.5 折」，也就是 0.1425% × 0.35 ＝ 0.0499%，不是 3.5%。
          每一格下面都有換算後的實際費率可以對照。
          手續費率與證交稅率是台股的公開規則，不因券商而異，所以不開放修改。
        </p>

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          <span className="text-on-surface font-semibold">買進與賣出分開設定</span>
          是刻意的。買進手續費是已經發生的事實，用你實際談到的折數；賣出還沒發生，
          券商 App 顯示參考損益時是用牌價保守估的（實測元大就是這樣）。
          想讓畫面上的淨損益跟 App 逐元對得起來，賣出那格就填 1；
          想看「照實際折數賣掉會拿回多少」，就填跟買進一樣的值。
          <span className="text-on-surface font-semibold">最低收費同樣買賣分開</span>
          ——實測元大零股買進最低 1 元，但 App 估賣出時是用整股的 20 元。
          27 筆逐筆比對，只有這樣才會一元不差。
        </p>

        {loading && <PageState kind="loading" />}
        {error && (
          <PageState
            kind="error"
            message={error}
            onRetry={() => {
              fees.reload();
              holdings.reload();
            }}
          />
        )}

        {!loading && !error && current && (
          <>
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className={`${headCell} pl-4 text-left`}>帳戶</th>
                    <th className={`${headCell} text-right`}>買進折數</th>
                    <th className={`${headCell} text-right`}>買進最低</th>
                    <th className={`${headCell} text-right`}>賣出折數</th>
                    <th className={`${headCell} text-right`}>賣出最低</th>
                    <th className={`${headCell} pr-4 text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {renderRow('', '全站預設', '沒有單獨設定的帳戶都吃這一組')}
                  {accounts.map((account) =>
                    renderRow(account, account, '這個帳戶的部位用這一組', () => reset(account))
                  )}
                </tbody>
              </table>
            </div>

            {accounts.length === 0 && (
              <PageState
                kind="empty"
                message="還沒有任何券商帳戶"
                hint="帳戶名稱取自「我的持股」每一筆部位的帳戶欄位。先去那邊填上券商名稱（例如「喵咪」「貓咪」），這裡才會列出來。"
              />
            )}

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              目前生效：手續費率 {(current.rate * 100).toFixed(4)}%、證交稅{' '}
              {(current.tax_rate * 100).toFixed(1)}%（賣出才收）、預設折數買{' '}
              {formatPrice(current.default.buy_discount)}（最低{' '}
              {formatNumber(current.default.buy_minimum)} 元）、賣{' '}
              {formatPrice(current.default.sell_discount)}（最低{' '}
              {formatNumber(current.default.sell_minimum)} 元）。
              有單獨設定的帳戶共 {current.accounts.length} 個。
              改完之後「我的持股」的淨損益會立刻改用新費率算，已經記錄的買進手續費不受影響——
              那些存的是當時實際付的錢。
            </p>
          </>
        )}

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          在找主題族群（散熱、矽晶圓…）的設定？那一份搬到
          <Link to="/groups" className="mx-1 text-primary underline">
            主題族群
          </Link>
          自己一頁了：族群是天天在調整的工作區，跟這裡「設好幾乎不會再動」的費率性質差太遠，
          而且調完成員會想立刻看那一群今天的表現，熱度榜就在同一頁。
        </p>
      </div>
    </>
  );
}
