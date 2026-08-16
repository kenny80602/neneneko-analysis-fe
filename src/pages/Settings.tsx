import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getBrokerFees, removeAccountFees, setAccountFees } from '../api/ledger';
import { getHoldings } from '../api/portfolio';
import { apiErrorMessage } from '../api/request';
import { getStockGroups, removeStockGroup, saveStockGroup } from '../api/stockGroup';
import { AccountFee, FeeBook, StockGroup } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatNumber, formatPrice } from '../utils/format';

// 各券商帳戶的手續費設定，以及自己維護的主題族群。
//
// 兩件事放同一頁，是因為它們的共通點是「只有你知道答案，系統推不出來」：
// 談到的折數、哪幾檔算同一個族群，都不在任何一支公開資料裡。
//
// ---- 手續費 ----
//
// 為什麼需要這一頁：部位散在不同券商，談到的折數不一樣。全站共用一個值的話，
// 其中一邊的淨損益一定是錯的，而錯的方向是「看起來比較賺」——那是最糟的錯法。
//
// 只讓改折數與最低收費。手續費率 0.1425% 與證交稅 0.3% 是台股的公開規則，
// 不會因為換一家券商而改變，做成可改只會多一個能被改壞的地方。
//
// 帳戶清單來自自選股持股表的 account 欄位，而不是讓使用者自己打——
// 打錯一個字就會變成一個永遠對不到任何部位的孤兒設定。

// ---- 主題族群 ----
//
// 為什麼要自己維護一份：官方產業別在「同類放一起」這件事上兩個方向都失敗。
// 矽晶圓的中美晶、環球晶、台勝科官方全歸「半導體業」（一百多家，台積電也在裡面，
// 比不出東西）；散熱的雙鴻、高力、奇鋐則分屬其他電子業、電機機械、電腦及週邊設備業，
// 永遠不會出現在同一張表。族群是人工歸類的概念，免費資料源沒有任何一家提供。

/** 族群編輯中的原始字串。代號用一格文字輸入而不是逐個 chip：貼一整串是最常見的用法。 */
interface GroupDraft {
  // 伺服器上的 id。空字串代表「還沒建的新族群」那一列。
  id: string;
  name: string;
  symbolText: string;
  sortOrder: string;
}

const NEW_GROUP: GroupDraft = { id: '', name: '', symbolText: '', sortOrder: '' };

function toGroupDraft(group: StockGroup): GroupDraft {
  return {
    id: group.id,
    name: group.name,
    symbolText: group.symbols.join(' '),
    sortOrder: String(group.sort_order),
  };
}

/** 逗號、頓號、空白、換行都當分隔——貼上來的東西什麼格式都有。 */
function parseSymbols(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,，、;；]+/)) {
    const symbol = raw.trim().toUpperCase();
    // 這裡不排序：使用者可能刻意把龍頭放第一個，後端也照原順序存。
    if (symbol) seen.add(symbol);
  }
  return Array.from(seen);
}

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
        subtitle="只有你知道答案的那些設定：各券商帳戶的手續費折數，以及自己歸類的主題族群。"
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

        <GroupPanel />
      </div>
    </>
  );
}

/**
 * 主題族群的維護介面。
 *
 * 刻意跟手續費那張表分開成一個元件：兩者除了「都是人工設定」之外沒有共用狀態，
 * 混在同一個 component 裡只會讓 busy／notice 互相干擾。
 */
function GroupPanel() {
  const groups = useAsyncData(() => getStockGroups(), []);
  const [drafts, setDrafts] = useState<GroupDraft[]>([]);
  const [creating, setCreating] = useState<GroupDraft>(NEW_GROUP);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  // 存檔後重抓，本地編輯一律以伺服器為準蓋回去。族群沒有「未儲存草稿」的需求，
  // 留著反而會出現「畫面上有但其實沒存到」。
  useEffect(() => {
    if (groups.data) setDrafts(groups.data.map(toGroupDraft));
  }, [groups.data]);

  const patch = (id: string, next: Partial<GroupDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...next } : d)));

  const save = async (draft: GroupDraft, isNew: boolean) => {
    const name = draft.name.trim();
    if (!name) {
      setNotice('族群要有名稱');
      return;
    }
    const order = Number(draft.sortOrder);
    if (draft.sortOrder !== '' && !Number.isFinite(order)) {
      setNotice('排序要填數字');
      return;
    }
    setBusy(draft.id || '__new__');
    setNotice('');
    try {
      await saveStockGroup({
        name,
        symbols: parseSymbols(draft.symbolText),
        sort_order: draft.sortOrder === '' ? 0 : Math.trunc(order),
      });
      if (isNew) setCreating(NEW_GROUP);
      groups.reload();
      setNotice(`已儲存「${name}」`);
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const remove = async (draft: GroupDraft) => {
    if (!window.confirm(`刪掉族群「${draft.name}」？只刪分類，不影響自選股與持股。`)) return;
    setBusy(draft.id);
    setNotice('');
    try {
      await removeStockGroup(draft.id);
      groups.reload();
      setNotice(`已刪掉「${draft.name}」`);
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const inputClass =
    'px-2 py-1.5 bg-surface-container border border-outline-variant rounded font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary';

  /** 一個族群的編輯卡。新增用的那張除了按鈕文案之外長得一樣。 */
  const renderCard = (draft: GroupDraft, isNew: boolean) => {
    const symbols = parseSymbols(draft.symbolText);
    const key = isNew ? '__new__' : draft.id;
    const update = (next: Partial<GroupDraft>) =>
      isNew ? setCreating((prev) => ({ ...prev, ...next })) : patch(draft.id, next);
    return (
      <div
        key={key}
        className={`rounded-xl border p-4 flex flex-col gap-stack-sm ${
          isNew
            ? 'border-dashed border-outline-variant bg-surface-container-low/40'
            : 'border-outline-variant bg-surface-container-lowest'
        }`}
      >
        <div className="flex flex-wrap items-end gap-stack-sm">
          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              族群名稱
            </span>
            <input
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="散熱"
              className={`${inputClass} w-40`}
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[16rem]">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              成員代號
            </span>
            <input
              value={draft.symbolText}
              onChange={(event) => update({ symbolText: event.target.value })}
              placeholder="3324 8996 3017"
              className={`${inputClass} w-full font-data-md text-data-md`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              排序
            </span>
            <input
              value={draft.sortOrder}
              onChange={(event) => update({ sortOrder: event.target.value })}
              inputMode="numeric"
              placeholder="0"
              className={`${inputClass} w-20 font-data-md text-data-md text-right`}
            />
          </label>
          <span className="inline-flex gap-2 pb-0.5">
            <button
              type="button"
              onClick={() => save(draft, isNew)}
              disabled={busy !== ''}
              className="px-3 py-1.5 bg-primary rounded text-on-primary font-body-sm text-body-sm hover:bg-primary-container transition-colors disabled:opacity-40"
            >
              {busy === key ? '儲存中…' : isNew ? '新增' : '儲存'}
            </button>
            {!isNew && (
              <button
                type="button"
                onClick={() => remove(draft)}
                disabled={busy !== ''}
                className="px-3 py-1.5 bg-surface border border-outline-variant rounded text-error font-body-sm text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-40"
              >
                刪除
              </button>
            )}
          </span>
        </div>

        {/* 把解析結果攤開，才知道貼進去那一串真的被拆成幾檔。 */}
        <p className="font-body-sm text-body-sm text-on-surface-variant flex flex-wrap items-center gap-1.5">
          {symbols.length === 0 ? (
            <span className="text-outline">
              還沒有成員。逗號、空白、換行都可以當分隔，直接貼一整串進來就行。
            </span>
          ) : (
            <>
              <span>{symbols.length} 檔：</span>
              {symbols.map((symbol) => (
                <span
                  key={symbol}
                  className="px-2 py-0.5 rounded bg-surface-container-low border border-outline-variant font-data-md text-data-md text-on-surface"
                >
                  {symbol}
                </span>
              ))}
            </>
          )}
        </p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-stack-md">
      <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px]">workspaces</span>
        主題族群
        {notice && <span className="font-body-sm text-body-sm text-primary">{notice}</span>}
      </h3>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        個股總覽的「主題族群」區塊吃這裡的設定。
        <span className="text-on-surface font-semibold">這是官方產業別做不到的事</span>
        ：矽晶圓的中美晶、環球晶、台勝科官方全歸「半導體業」（一百多家，台積電也在裡面）；
        散熱的雙鴻、高力、奇鋐則分屬其他電子業、電機機械、電腦及週邊設備業，
        官方分類永遠不會把它們放在一起。族群是人工歸類的，免費資料源沒有現成的。
      </p>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        <span className="text-on-surface font-semibold">成員不必在自選股裡</span>
        ——台勝科不在清單也該出現在矽晶圓族群。這種成員只比得了月營收（那是唯一涵蓋全市場的數字，
        1,900 多家），收盤價、法人、融資券只收自選股，畫面上會標「非自選股」。
        <span className="text-on-surface font-semibold">一檔可以屬於多個族群</span>
        ，中美晶同時是矽晶圓與太陽能，直接把它加進兩個族群就好。
        排序小的排前面。名稱就是鍵，
        <span className="text-on-surface">改名等於另外建一個</span>
        ，舊的要自己刪掉。
      </p>

      {groups.loading && <PageState kind="loading" />}
      {groups.error && (
        <PageState kind="error" message={groups.error} onRetry={groups.reload} />
      )}

      {!groups.loading && !groups.error && (
        <>
          {drafts.length === 0 && (
            <PageState
              kind="empty"
              message="還沒建過任何族群"
              hint="空的很正常，這一份完全靠自己維護。從下面那張卡開始，例如名稱填「散熱」、成員填 3324 8996 3017。"
            />
          )}
          {drafts.map((draft) => renderCard(draft, false))}
          {renderCard(creating, true)}
        </>
      )}
    </div>
  );
}
