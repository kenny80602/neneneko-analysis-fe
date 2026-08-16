import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import {
  SellPayload,
  addLedgerLot,
  addLedgerSell,
  getLedgerReport,
  getLedgerSymbols,
  importLedgerFromHoldings,
  previewLedgerSell,
  removeLedgerLot,
  removeLedgerSell,
} from '../api/ledger';
import { getHoldings } from '../api/portfolio';
import { apiErrorMessage } from '../api/request';
import {
  Holding,
  LedgerMatchedSell,
  LedgerPick,
  LedgerReconcileRow,
  LedgerSellPreview,
  MatchRule,
} from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatDate,
  formatNumber,
  formatPrice,
  formatSigned,
  formatSignedPercent,
  quoteColor,
  today,
} from '../utils/format';

// 自訂沖銷帳：把券商的 FIFO 帳與自己的策略帳擺在同一張表上對照。
//
// 沖銷算式整包在後端（internal/service/ledger/matcher.go），這一頁只負責顯示與送出。
// 剩餘股數、平均成本、已實現損益全部來自 /ledger/reports/:symbol，前端一個都不自己算——
// 這個功能的產出就是「兩本帳的差額」，前後端各算一份的話那個差額沒有意義。
//
// 費率同理：手續費率、折數、最低收費與證交稅率由後端定義，回應會原樣帶回來供顯示。
//
// 全站唯一同時顯示「同一件事的兩種算法」的頁面，所以顏色分工固定：
// 策略帳走 primary、券商帳走 on-surface-variant，只有差異才用漲跌色。

/** 使用者填一列指定沖銷時，輸入框裡的原始字串。key 是批次 id。 */
type PickDraft = Record<string, string>;

const MATCH_RULES: MatchRule[] = ['LIFO', 'HIGHEST_COST', 'FIFO'];

const MATCH_RULE_LABELS: Record<MatchRule, string> = {
  LIFO: '後進先出（LIFO）',
  HIGHEST_COST: '高成本優先',
  FIFO: '先進先出（同券商）',
};

/** 把輸入框的字串轉成沖銷指定，0 與空白視為沒指定。 */
function toPicks(draft: PickDraft): LedgerPick[] {
  return Object.entries(draft)
    .map(([lot_id, text]) => ({ lot_id, shares: Math.trunc(Number(text)) }))
    .filter((p) => Number.isFinite(p.shares) && p.shares > 0);
}

export default function LotLedger() {
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const [showLotForm, setShowLotForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 賣出面板
  const [sellDate, setSellDate] = useState(today());
  const [sellShares, setSellShares] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [fallback, setFallback] = useState<MatchRule>('LIFO');
  const [pickDraft, setPickDraft] = useState<PickDraft>({});
  const [preview, setPreview] = useState<LedgerSellPreview | null>(null);
  const [previewError, setPreviewError] = useState('');

  // 新增庫存
  const [lotSymbol, setLotSymbol] = useState('');
  const [lotName, setLotName] = useState('');
  const [lotAccount, setLotAccount] = useState('');
  const [lotDate, setLotDate] = useState(today());
  const [lotShares, setLotShares] = useState('');
  const [lotPrice, setLotPrice] = useState('');
  // 留白代表「照後端費率幫我算」，填 0 才是「這筆真的沒收手續費」。
  const [lotFee, setLotFee] = useState('');

  const symbolList = useAsyncData(() => getLedgerSymbols(), []);
  const symbols = useMemo(() => symbolList.data ?? [], [symbolList.data]);

  // 自選股清單，只給「從自選股匯入」那張面板用。
  //
  // 匯入的來源不能是 /ledger/symbols——那是「已經有沖銷帳的代號」，
  // 而匯入正是為了空帳準備的，拿它當來源等於「要先有資料才能匯入」。
  const watchlist = useAsyncData(() => getHoldings(false), []);

  // 沒選就用第一檔。用衍生值而不是 useEffect 補寫回 state，
  // 免得「刪光庫存 → effect 又把舊代號寫回去」這種來回。
  const symbol = selected || symbols[0] || '';

  const report = useAsyncData(() => getLedgerReport(symbol), [symbol], { enabled: !!symbol });
  const strategy = report.data?.strategy;
  const broker = report.data?.broker;
  const recon = report.data?.reconcile;
  const fees = report.data?.fees;

  // 換一檔股票時，上一檔的指定沖銷完全沒有意義（批次 id 都不一樣），整個清掉。
  useEffect(() => {
    setPickDraft({});
    setExpanded(null);
    setPreview(null);
    setPreviewError('');
  }, [symbol]);

  const sharesNum = Math.trunc(Number(sellShares));
  const priceNum = Number(sellPrice);
  const picks = useMemo(() => toPicks(pickDraft), [pickDraft]);
  const pickedTotal = picks.reduce((sum, p) => sum + p.shares, 0);
  const sellReady =
    !!symbol && Number.isFinite(sharesNum) && sharesNum > 0 && Number.isFinite(priceNum) && priceNum > 0;

  const sellPayload: SellPayload = useMemo(
    () => ({
      symbol,
      trade_date: sellDate,
      shares: sharesNum,
      price: priceNum,
      picks,
      fallback,
    }),
    [symbol, sellDate, sharesNum, priceNum, picks, fallback]
  );

  // 試算打後端而不是在前端算：跟寫入走同一支重播，預覽的數字就是送出後會看到的數字。
  //
  // 這裡刻意不塞進 useAsyncData：它的錯誤會讓整頁進入錯誤狀態，而試算失敗
  // （例如指定超過剩餘）只是這一張表單的問題，其他區塊照樣要能看。
  useEffect(() => {
    if (!sellReady) {
      setPreview(null);
      setPreviewError('');
      return;
    }
    let stale = false;
    previewLedgerSell(sellPayload)
      .then((result) => {
        if (stale) return;
        setPreview(result);
        setPreviewError('');
      })
      .catch((err) => {
        if (stale) return;
        setPreview(null);
        setPreviewError(apiErrorMessage(err));
      });
    // 打字打到一半就換條件時，舊的回應不要覆蓋新的。
    return () => {
      stale = true;
    };
  }, [sellReady, sellPayload]);

  /** 券商帳的沖銷明細，展開賣出紀錄時要跟策略帳並排。 */
  const brokerBySellId = useMemo(
    () => new Map((broker?.sells ?? []).map((m) => [m.id, m])),
    [broker]
  );

  /** 歷史紀錄裡指定不掉或庫存不夠的那幾筆。正常是空的。 */
  const brokenSells = useMemo(
    () => (strategy?.sells ?? []).filter((m) => m.unhonored > 0 || m.shortfall > 0),
    [strategy]
  );

  /** 送出後把清單與報表一起重抓。兩本帳都是後端重播出來的，本地不留任何衍生狀態。 */
  const refresh = () => {
    symbolList.reload();
    report.reload();
  };

  const setPick = (lotId: string, value: string) =>
    setPickDraft((prev) => ({ ...prev, [lotId]: value }));

  /** 這一列填到滿：剩餘股數與「這次還沒指定的股數」取小。 */
  const fillRow = (lotId: string, remaining: number) => {
    const others = picks.filter((p) => p.lot_id !== lotId).reduce((sum, p) => sum + p.shares, 0);
    const room = Number.isFinite(sharesNum) && sharesNum > 0 ? sharesNum - others : remaining;
    setPick(lotId, String(Math.max(0, Math.min(remaining, room))));
  };

  /**
   * 照規則自動填好指定欄位。
   *
   * 這是純粹的輸入輔助，不是沖銷結果——真正的沖銷順序由後端決定。
   * 兩邊的規則名稱一致，所以填出來的跟後端會沖的是同一批；不放心就看下面的試算。
   */
  const autoFill = (rule: MatchRule) => {
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) {
      setNotice('先填要賣幾股，才知道要自動填多少');
      return;
    }
    const rows = [...(recon?.rows ?? [])].filter((r) => r.strategy_remaining > 0);
    if (rule === 'LIFO') rows.reverse();
    if (rule === 'HIGHEST_COST') rows.sort((a, b) => b.unit_cost - a.unit_cost);

    const next: PickDraft = {};
    let left = sharesNum;
    for (const row of rows) {
      if (left <= 0) break;
      const take = Math.min(row.strategy_remaining, left);
      next[row.lot_id] = String(take);
      left -= take;
    }
    setPickDraft(next);
    setNotice(`已照${MATCH_RULE_LABELS[rule]}填好，還是可以逐格改`);
  };

  /** 送出並在成功後重抓。busy 期間擋住重複送出——事件流會真的多長出一筆。 */
  const submit = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      setNotice(await action());
      refresh();
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSell = (event: FormEvent) => {
    event.preventDefault();
    void submit(async () => {
      const matched = await addLedgerSell(sellPayload);
      setPickDraft({});
      setSellShares('');
      return (
        `已記錄賣出 ${formatNumber(matched.shares)} 股 @ ${formatPrice(matched.price)}，` +
        `成交總額 ${formatNumber(matched.amount)} 元，` +
        `實現 ${formatSigned(matched.realized, 0)} 元（${formatSignedPercent(matched.return_rate)}）` +
        (matched.auto_filled > 0
          ? `（其中 ${formatNumber(matched.auto_filled)} 股由${MATCH_RULE_LABELS[fallback]}自動補）`
          : '')
      );
    });
  };

  const handleAddLot = (event: FormEvent) => {
    event.preventDefault();
    const shares = Math.trunc(Number(lotShares));
    const price = Number(lotPrice);
    const code = lotSymbol.trim();
    if (!code) {
      setNotice('請填股票代號');
      return;
    }
    const feeText = lotFee.trim();
    void submit(async () => {
      const lot = await addLedgerLot({
        symbol: code,
        name: lotName.trim() || undefined,
        trade_date: lotDate,
        shares,
        price,
        // 留白就不送這一欄，讓後端照費率算。送 0 是「真的沒收手續費」，語意不同。
        fee: feeText === '' ? undefined : Number(feeText),
        account: lotAccount.trim() || undefined,
      });
      setSelected(lot.symbol);
      setLotShares('');
      setLotPrice('');
      setLotFee('');
      return (
        `已新增 ${lot.symbol} ${formatNumber(lot.shares)} 股 @ ${formatPrice(lot.price)}，` +
        `每股成本 ${formatPrice(lot.unit_cost)}（已攤入手續費 ${formatNumber(lot.fee)} 元）`
      );
    });
  };

  /**
   * 自選股裡可以匯入的檔，依代號併起來。
   *
   * 同一檔在持股表可能有好幾列（分批買、不同帳戶），匯入是整檔一起搬，
   * 所以這裡也整檔顯示，並列出它包含哪幾筆，讓使用者按下去之前就知道會進來什麼。
   * 沒填股數或成本的列匯不進來（從 LINE 加進來的就是那樣），不是錯誤，標示出來即可。
   */
  const importable = useMemo(() => {
    const bySymbol = new Map<
      string,
      { symbol: string; name: string; positions: Holding[]; skipped: number }
    >();
    for (const h of watchlist.data ?? []) {
      const entry = bySymbol.get(h.symbol) ?? {
        symbol: h.symbol,
        name: h.name,
        positions: [],
        skipped: 0,
      };
      if (h.shares != null && h.shares > 0 && h.cost != null && h.cost > 0) {
        entry.positions.push(h);
      } else {
        entry.skipped += 1;
      }
      bySymbol.set(h.symbol, entry);
    }
    return Array.from(bySymbol.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [watchlist.data]);

  const handleImport = (code: string, count: number) => {
    if (
      !window.confirm(
        `把自選股裡 ${code} 的 ${count} 筆部位匯入沖銷帳？\n\n` +
          '匯入是單向且一次性的：之後兩邊各走各的，這裡的賣出不會改動「我的持股」。\n' +
          '持股表沒有成交日，會用建立時間頂替，而沖銷順序完全靠成交日——匯入後要逐筆確認。\n' +
          '重複匯入會重複長出批次。'
      )
    ) {
      return;
    }
    void submit(async () => {
      const result = await importLedgerFromHoldings(code);
      setSelected(code);
      setShowImport(false);
      if (result.lots.length === 0) {
        return `${code} 沒有可匯入的部位——只有同時填了股數與成本的列才匯得進來`;
      }
      return (
        `已匯入 ${code} ${result.lots.length} 筆` +
        (result.dates_unknown > 0
          ? `，其中 ${result.dates_unknown} 筆是拿建立時間當成交日的，請逐筆確認日期`
          : '')
      );
    });
  };

  const handleRemoveLot = (row: LedgerReconcileRow) => {
    if (!window.confirm(`刪掉 ${row.trade_date} 那筆買進？`)) return;
    void submit(async () => {
      await removeLedgerLot(row.lot_id);
      return '已刪除該筆庫存';
    });
  };

  const handleRemoveSell = (id: string) => {
    if (!window.confirm('刪掉這筆賣出？被它沖掉的股數會回到庫存，後面幾筆的沖銷結果也會重算。')) {
      return;
    }
    void submit(async () => {
      await removeLedgerSell(id);
      return '已刪除該筆賣出，兩本帳都重算了';
    });
  };

  const fieldClass =
    'px-3 py-2 bg-surface-container border border-outline-variant rounded font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary';
  const headCell =
    'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
  const numberCell = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';
  const ghostButton =
    'px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-40';

  const hasLots = (recon?.rows.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="自訂沖銷帳"
        icon="compare_arrows"
        subtitle={
          symbol
            ? `${symbol}${report.data?.name ? ` ${report.data.name}` : ''}．我的策略帳與券商 FIFO 帳並排對照`
            : '指定要沖銷哪一筆庫存，同時看券商 FIFO 會記成什麼樣子'
        }
        right={
          <>
            {symbols.length > 0 && (
              <select
                value={symbol}
                onChange={(event) => setSelected(event.target.value)}
                className={`${fieldClass} w-40`}
              >
                {symbols.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setShowLotForm((prev) => !prev)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary rounded text-on-primary font-body-md text-body-md hover:bg-primary-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              新增庫存
            </button>
            <button
              type="button"
              onClick={() => setShowImport((prev) => !prev)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              從自選股匯入
            </button>
            <button
              type="button"
              onClick={refresh}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              重新整理
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          券商與集保的結算一律先進先出，賣出時系統會自動沖掉最早買進的那一筆。這一頁讓你
          <span className="text-on-surface font-semibold">自己指定要沖哪一筆</span>
          ，並把券商 FIFO 的結果算在旁邊對照。
          <span className="text-on-surface font-semibold">
            它不會、也不可能改變券商端的結算或交割結果
          </span>
          ——這是一本自用的策略帳。沖銷方法只改變損益認列在哪一筆、哪一天，
          <span className="text-on-surface font-semibold">不改變總額</span>
          ：同一批庫存全部出清後，兩本帳的已實現損益完全相同，差額必然歸零。
          個人證券交易所得目前停徵，證交稅按成交金額課，跟沖銷方法無關，這本帳不影響任何稅務申報。
          {fees && (
            <>
              {' '}
              費用照後端設定的費率計算：手續費 {(fees.rate * 100).toFixed(4)}%
              {fees.discount !== 1 && `（${(fees.discount * 10).toFixed(1)} 折）`}、最低{' '}
              {formatNumber(fees.minimum)} 元，賣出加收證交稅 {(fees.tax_rate * 100).toFixed(1)}%。
            </>
          )}
        </p>

        {notice && (
          <p className="font-body-sm text-body-sm text-primary bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2">
            {notice}
          </p>
        )}

        {showImport && (
          <section className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4">
            <h2 className="font-headline-md text-headline-md text-primary">從自選股匯入</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              把「我的持股」某一檔的部位搬過來當沖銷帳的起點。
              <span className="text-on-surface font-semibold">單向且一次性</span>
              ：搬完之後兩邊各走各的，這裡記的賣出不會回頭改動「我的持股」。
              持股表沒有成交日與手續費 ——
              <span className="text-on-surface font-semibold">
                成交日會用那一列的建立時間頂替，而沖銷順序完全靠成交日
              </span>
              ，匯入後務必逐筆改成真正的成交日；手續費一律當 0，用現在的費率回推只會得到
              一個看起來很精確、實際上跟對帳單無關的數字。重複匯入會重複長出批次。
            </p>

            {watchlist.loading && <PageState kind="loading" />}
            {watchlist.error && (
              <PageState kind="error" message={watchlist.error} onRetry={watchlist.reload} />
            )}
            {!watchlist.loading && !watchlist.error && importable.length === 0 && (
              <PageState
                kind="empty"
                message="自選股是空的"
                hint="先到「自選股」或「我的持股」建立部位，這裡才有東西可以搬。"
              />
            )}

            {importable.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-outline-variant">
                <table className="w-full border-collapse">
                  <thead className="bg-surface-container-low border-b border-outline-variant">
                    <tr>
                      <th className={`${headCell} pl-4 text-left`}>股號 / 名稱</th>
                      <th className={`${headCell} text-left`}>會匯入的部位</th>
                      <th className={`${headCell} pr-4 text-right`}>動作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {importable.map((item) => (
                      <tr key={item.symbol} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="p-2 pl-4 py-3 whitespace-nowrap">
                          <span className="font-data-md text-data-md text-primary font-bold">
                            {item.symbol}
                          </span>
                          <span className="block font-body-sm text-body-sm text-on-surface-variant">
                            {item.name}
                          </span>
                        </td>
                        <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant">
                          {item.positions.length === 0 ? (
                            <span className="text-outline">沒有填了股數與成本的部位</span>
                          ) : (
                            item.positions.map((p) => (
                              <span key={p.id} className="block">
                                {p.account || '未指定帳戶'} ·{' '}
                                <span className="font-data-md text-data-md text-on-surface">
                                  {formatNumber(p.shares)}
                                </span>{' '}
                                股 @{' '}
                                <span className="font-data-md text-data-md text-on-surface">
                                  {formatPrice(p.cost)}
                                </span>
                              </span>
                            ))
                          )}
                          {item.skipped > 0 && (
                            <span className="block text-outline">
                              另有 {item.skipped} 筆缺股數或成本，匯不進來
                            </span>
                          )}
                        </td>
                        <td className="p-2 pr-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleImport(item.symbol, item.positions.length)}
                            disabled={busy || item.positions.length === 0}
                            className={ghostButton}
                          >
                            匯入 {item.positions.length} 筆
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {showLotForm && (
          <form
            onSubmit={handleAddLot}
            className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4"
          >
            <h2 className="font-headline-md text-headline-md text-primary">新增買進明細</h2>
            <div className="flex flex-wrap items-end gap-stack-md">
              {[
                { label: '代號', value: lotSymbol, set: setLotSymbol, width: 'w-28', type: 'text' },
                { label: '名稱', value: lotName, set: setLotName, width: 'w-32', type: 'text' },
                {
                  label: '券商／帳戶',
                  value: lotAccount,
                  set: setLotAccount,
                  width: 'w-32',
                  type: 'text',
                },
                { label: '成交日', value: lotDate, set: setLotDate, width: 'w-40', type: 'date' },
              ].map((field) => (
                <div key={field.label} className="flex flex-col gap-1">
                  <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    {field.label}
                  </label>
                  <input
                    value={field.value}
                    onChange={(event) => field.set(event.target.value)}
                    type={field.type}
                    max={field.type === 'date' ? today() : undefined}
                    className={`${fieldClass} ${field.width}`}
                  />
                </div>
              ))}
              {[
                { label: '股數', value: lotShares, set: setLotShares, ph: '50', w: 'w-24' },
                { label: '買價', value: lotPrice, set: setLotPrice, ph: '1020', w: 'w-28' },
                { label: '手續費', value: lotFee, set: setLotFee, ph: '自動', w: 'w-24' },
              ].map((field) => (
                <div key={field.label} className="flex flex-col gap-1">
                  <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    {field.label}
                  </label>
                  <input
                    value={field.value}
                    onChange={(event) => field.set(event.target.value)}
                    inputMode="decimal"
                    placeholder={field.ph}
                    className={`${fieldClass} ${field.w} font-data-md text-data-md text-right`}
                  />
                </div>
              ))}
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 bg-primary rounded text-on-primary font-body-md text-body-md font-semibold hover:bg-primary-container transition-colors disabled:opacity-40"
              >
                加入庫存
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              手續費留白就照後端目前的費率自動算，也可以直接填對帳單上的實際金額；
              <span className="text-on-surface font-semibold">填 0 代表這一筆真的沒收手續費</span>
              ，跟留白不是同一件事。買進手續費會攤進每股成本——不攤的話損益會虛胖一個手續費。
              買進明細存下來之後不再修改，賣出只會改變它的剩餘股數。
            </p>
          </form>
        )}

        {!symbol && !symbolList.loading && (
          <PageState
            kind="empty"
            message="還沒有任何沖銷帳"
            hint={
              <>
                這一頁的庫存要自己輸入：自選股那張表一列只有股數與平均成本，沒有逐筆買進批次
                （也沒有成交日與手續費），而沖銷非得有批次不可。用右上角「新增庫存」照對帳單逐筆填，
                或用「從自選股匯入」把現有部位搬過來當起點——匯入的沒有成交日，記得回頭補。
              </>
            }
          />
        )}
        {symbolList.error && (
          <PageState kind="error" message={symbolList.error} onRetry={symbolList.reload} />
        )}
        {symbol && report.loading && <PageState kind="loading" />}
        {symbol && report.error && (
          <PageState kind="error" message={report.error} onRetry={report.reload} />
        )}

        {symbol && !report.loading && !report.error && strategy && broker && recon && (
          <>
            {!hasLots && (
              <PageState
                kind="empty"
                message={`${symbol} 還沒有庫存明細`}
                hint="這一檔的買進紀錄是空的。用右上角「新增庫存」把對帳單上的每一筆買進填進來。"
              />
            )}

            {brokenSells.length > 0 && (
              <p className="font-body-sm text-body-sm text-error bg-error-container/30 border border-error rounded-xl px-4 py-3">
                有 {brokenSells.length} 筆賣出的指定沖銷對不上目前的庫存
                （指定的批次已被更早的賣出吃光、或被刪掉了）。
                這幾筆的損益是後端用自動規則補出來的，請在下方展開紀錄後刪掉重記。
              </p>
            )}

            {hasLots && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-stack-md">
                  <StatCard
                    label="剩餘股數"
                    icon="inventory_2"
                    value={formatNumber(strategy.shares)}
                    hint={`股，共 ${recon.rows.length} 筆買進明細`}
                  />
                  <StatCard
                    label="策略帳平均成本"
                    icon="target"
                    value={strategy.avg_cost == null ? DASH : formatPrice(strategy.avg_cost)}
                    hint="元，我指定沖銷後剩下的"
                  />
                  <StatCard
                    label="券商帳平均成本"
                    icon="account_balance"
                    value={broker.avg_cost == null ? DASH : formatPrice(broker.avg_cost)}
                    hint="元，FIFO 結算後 App 上會顯示的"
                  />
                  <StatCard
                    label="策略已實現"
                    icon="target"
                    value={formatSigned(strategy.realized, 0)}
                    hint="元，已扣手續費與證交稅"
                    valueClassName={quoteColor(strategy.realized)}
                  />
                  <StatCard
                    label="兩帳差額"
                    icon="difference"
                    value={formatSigned(recon.realized_diff, 0)}
                    hint={`元，券商認列 ${formatSigned(broker.realized, 0)}`}
                    valueClassName={quoteColor(recon.realized_diff)}
                  />
                </div>

                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  「兩帳差額」＝策略帳已實現 − 券商帳已實現，是
                  <span className="text-on-surface font-semibold">認列時間的差</span>
                  ，不是多賺或少賺的錢。剩餘股數的總和兩邊永遠相同，差別只在
                  <span className="text-on-surface font-semibold">哪一筆被沖掉</span>
                  ；這批庫存全部出清那一刻，差額會回到 0。平均成本沒有部位時顯示破折號——0 元成本是另一個意思。
                </p>

                {/* ── 庫存對照表 ── */}
                <section className="flex flex-col gap-stack-md">
                  <h2 className="font-headline-md text-headline-md text-primary">
                    庫存明細對照（{symbol}）
                  </h2>
                  <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
                    <table className="w-full border-collapse">
                      <thead className="bg-surface-container-low border-b border-outline-variant">
                        <tr>
                          <th className={`${headCell} pl-4 text-left`}>買進日</th>
                          <th className={`${headCell} text-left`}>帳戶</th>
                          <th className={`${headCell} text-right`}>買價</th>
                          <th className={`${headCell} text-right`}>每股成本</th>
                          <th className={`${headCell} text-right`}>原始股數</th>
                          <th className={`${headCell} text-right text-primary`}>策略帳剩餘</th>
                          <th className={`${headCell} text-right`}>券商帳剩餘</th>
                          <th className={`${headCell} text-right`}>差異</th>
                          <th className={`${headCell} pr-4 text-right`}>本次指定沖銷</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/50">
                        {recon.rows.map((row) => {
                          const position = strategy.positions.find((p) => p.lot.id === row.lot_id);
                          const lot = position?.lot;
                          const cleared = row.strategy_remaining === 0;
                          return (
                            <tr
                              key={row.lot_id}
                              className={`hover:bg-surface-container-low/50 transition-colors ${
                                cleared ? 'opacity-50' : ''
                              }`}
                            >
                              <td className="p-2 pl-4 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">
                                {formatDate(row.trade_date)}
                                {cleared && (
                                  <span className="ml-2 font-body-sm text-body-sm text-outline">
                                    已出清
                                  </span>
                                )}
                              </td>
                              <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                                {lot?.account || DASH}
                              </td>
                              <td className={`${numberCell} text-on-surface-variant`}>
                                {formatPrice(lot?.price)}
                              </td>
                              <td className={`${numberCell} text-on-surface`}>
                                {formatPrice(row.unit_cost)}
                              </td>
                              <td className={`${numberCell} text-on-surface-variant`}>
                                {formatNumber(lot?.shares)}
                              </td>
                              <td className={`${numberCell} text-primary font-bold`}>
                                {formatNumber(row.strategy_remaining)}
                              </td>
                              <td className={`${numberCell} text-on-surface-variant`}>
                                {formatNumber(row.broker_remaining)}
                              </td>
                              <td className={`${numberCell} ${quoteColor(row.diff)}`}>
                                {row.diff === 0 ? DASH : formatSigned(row.diff, 0)}
                              </td>
                              <td className="p-2 pr-4 py-3 text-right whitespace-nowrap">
                                {row.strategy_remaining > 0 ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      value={pickDraft[row.lot_id] ?? ''}
                                      onChange={(event) => setPick(row.lot_id, event.target.value)}
                                      inputMode="numeric"
                                      placeholder="0"
                                      className={`${fieldClass} w-20 px-2 py-1 font-data-md text-data-md text-right`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        fillRow(row.lot_id, row.strategy_remaining)
                                      }
                                      title="填滿這一筆"
                                      className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">
                                        keyboard_double_arrow_up
                                      </span>
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLot(row)}
                                    disabled={busy}
                                    title="刪除這筆庫存"
                                    className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors disabled:opacity-40"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">
                                      delete
                                    </span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    「差異」是策略帳剩餘 − 券商帳剩餘。正數代表
                    <span className="text-on-surface font-semibold">
                      券商已經把這一筆沖掉了，但我的策略帳還留著
                    </span>
                    ；負數則相反。每股成本已含買進手續費。
                    {recon.has_diff
                      ? '兩邊目前對不上是正常的——那正是這一頁存在的理由，對帳時看這一欄就知道差在哪。'
                      : '目前兩邊完全一致：還沒賣過，或每一次都剛好指定了 FIFO 會沖的那一筆。'}
                    已經被沖銷掉一部分的批次不能刪（後端會擋），要先刪掉相關的賣出紀錄。
                  </p>
                </section>

                {/* ── 賣出（指定沖銷） ── */}
                <form
                  onSubmit={handleSell}
                  className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4"
                >
                  <h2 className="font-headline-md text-headline-md text-primary">記錄一筆賣出</h2>

                  <div className="flex flex-wrap items-end gap-stack-md">
                    <div className="flex flex-col gap-1">
                      <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        成交日
                      </label>
                      <input
                        value={sellDate}
                        onChange={(event) => setSellDate(event.target.value)}
                        type="date"
                        max={today()}
                        className={`${fieldClass} w-40`}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        股數
                      </label>
                      <input
                        value={sellShares}
                        onChange={(event) => setSellShares(event.target.value)}
                        inputMode="numeric"
                        placeholder="5"
                        className={`${fieldClass} w-24 font-data-md text-data-md text-right`}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        成交價
                      </label>
                      <input
                        value={sellPrice}
                        onChange={(event) => setSellPrice(event.target.value)}
                        inputMode="decimal"
                        placeholder="850"
                        className={`${fieldClass} w-28 font-data-md text-data-md text-right`}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        沒指定的部分照
                      </label>
                      <select
                        value={fallback}
                        onChange={(event) => setFallback(event.target.value as MatchRule)}
                        className={`${fieldClass} w-52`}
                      >
                        {MATCH_RULES.map((rule) => (
                          <option key={rule} value={rule}>
                            {MATCH_RULE_LABELS[rule]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={busy || !preview}
                      className="px-5 py-2 bg-quote-down rounded text-on-primary font-body-md text-body-md font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      記錄賣出
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-stack-sm">
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      自動填：
                    </span>
                    {MATCH_RULES.map((rule) => (
                      <button
                        key={rule}
                        type="button"
                        onClick={() => autoFill(rule)}
                        className={ghostButton}
                      >
                        {MATCH_RULE_LABELS[rule]}
                      </button>
                    ))}
                    <button type="button" onClick={() => setPickDraft({})} className={ghostButton}>
                      清空指定
                    </button>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      已指定{' '}
                      <span className="font-data-md text-data-md text-on-surface">
                        {formatNumber(pickedTotal)}
                      </span>{' '}
                      /{' '}
                      <span className="font-data-md text-data-md text-on-surface">
                        {Number.isFinite(sharesNum) && sharesNum > 0
                          ? formatNumber(sharesNum)
                          : DASH}
                      </span>{' '}
                      股
                    </span>
                  </div>

                  {previewError && (
                    <p className="font-body-sm text-body-sm text-error">{previewError}</p>
                  )}

                  {preview && (
                    <div className="flex flex-col gap-1 rounded-xl bg-surface-container-low p-3">
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        價金 {formatNumber(preview.strategy.amount)} 元 · 手續費{' '}
                        {formatNumber(preview.strategy.fee)} 元 · 證交稅{' '}
                        {formatNumber(preview.strategy.tax)} 元 · 淨收入{' '}
                        <span className="font-data-md text-data-md text-on-surface">
                          {formatNumber(preview.strategy.net_proceeds)}
                        </span>{' '}
                        元
                        {preview.strategy.auto_filled > 0 &&
                          ` · 其中 ${formatNumber(preview.strategy.auto_filled)} 股由${
                            MATCH_RULE_LABELS[fallback]
                          }自動補上`}
                      </p>
                      <p className="font-body-md text-body-md text-on-surface">
                        我的策略帳會實現{' '}
                        <span
                          className={`font-data-lg text-data-lg ${quoteColor(
                            preview.strategy.realized
                          )}`}
                        >
                          {formatSigned(preview.strategy.realized, 0)}
                        </span>{' '}
                        元（
                        <span
                          className={`font-data-md text-data-md ${quoteColor(
                            preview.strategy.return_rate
                          )}`}
                        >
                          {formatSignedPercent(preview.strategy.return_rate)}
                        </span>
                        ），同一張單券商 FIFO 會記成{' '}
                        <span
                          className={`font-data-md text-data-md ${quoteColor(
                            preview.broker.realized
                          )}`}
                        >
                          {formatSigned(preview.broker.realized, 0)}
                        </span>{' '}
                        元（{formatSignedPercent(preview.broker.return_rate)}）
                      </p>
                      {/* 報酬率的分母是這一筆沖掉的成本，不是價金——同樣賺 227 元，
                          沖 800 那筆是 +5.7%，沖 1020 那筆會是負的。講清楚才不會被誤讀。 */}
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        報酬率＝已實現 ÷ 這一筆沖掉的成本（
                        {formatNumber(preview.strategy.cost)} 元，含當初的買進手續費），
                        不是除以價金。沖掉哪幾批不同，報酬率就不同，這正是兩本帳要對照的地方。
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        沖銷明細：
                        {preview.strategy.allocations.map((alloc, index) => {
                          const row = recon.rows.find((r) => r.lot_id === alloc.lot_id);
                          return (
                            <span key={`${alloc.lot_id}-${index}`}>
                              {index > 0 && '、'}
                              {row ? `${row.trade_date} 成本 ${formatPrice(row.unit_cost)}` : alloc.lot_id}{' '}
                              {formatNumber(alloc.shares)} 股
                              {alloc.source === 'AUTO' && '（自動）'}
                            </span>
                          );
                        })}
                      </p>
                    </div>
                  )}

                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    在上面那張表的「本次指定沖銷」直接填股數，或用自動填的按鈕。指定不滿的部分會照下拉選的規則補齊
                    ——全部留白就等於整筆照該規則沖。試算與送出走後端同一支算式，
                    <span className="text-on-surface font-semibold">上面預覽的數字就是送出後會看到的數字</span>
                    。指定超過那一筆的剩餘、或超過這次要賣的股數都會被後端擋下來，不會默默調成剛好。
                  </p>
                </form>

                {/* ── 賣出紀錄 ── */}
                {strategy.sells.length > 0 && (
                  <section className="flex flex-col gap-stack-md">
                    <h2 className="font-headline-md text-headline-md text-primary">
                      賣出紀錄（{strategy.sells.length} 筆）
                    </h2>
                    <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
                      <table className="w-full border-collapse">
                        <thead className="bg-surface-container-low border-b border-outline-variant">
                          <tr>
                            <th className={`${headCell} pl-4 text-left`}>成交日</th>
                            <th className={`${headCell} text-right`}>股數</th>
                            <th className={`${headCell} text-right`}>成交價</th>
                            <th className={`${headCell} text-right`}>成交總額</th>
                            <th className={`${headCell} text-right`}>手續費</th>
                            <th className={`${headCell} text-right`}>證交稅</th>
                            <th className={`${headCell} text-right text-primary`}>策略已實現</th>
                            <th className={`${headCell} text-right text-primary`}>報酬率</th>
                            <th className={`${headCell} text-right`}>券商已實現</th>
                            <th className={`${headCell} text-right`}>差額</th>
                            <th className={`${headCell} pr-4 text-right`}>明細</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/50">
                          {[...strategy.sells].reverse().map((matched) => {
                            const brokerMatched = brokerBySellId.get(matched.id);
                            const diff = matched.realized - (brokerMatched?.realized ?? 0);
                            const open = expanded === matched.id;
                            return (
                              <SellRow
                                key={matched.id}
                                matched={matched}
                                brokerMatched={brokerMatched}
                                diff={diff}
                                open={open}
                                rows={recon.rows}
                                busy={busy}
                                onToggle={() => setExpanded(open ? null : matched.id)}
                                onDelete={() => handleRemoveSell(matched.id)}
                                numberCell={numberCell}
                              />
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      「券商已實現」是同一張單在 FIFO 下會認列的金額，用來跟券商 App
                      當天結算後的畫面對帳——兩個數字都對得上，才代表這本帳沒記錯。
                      展開明細可以看到兩邊各沖掉了哪幾筆。
                      「報酬率」的分母是<span className="text-on-surface">這一筆沖掉的成本</span>
                      （含當初的買進手續費）而不是成交總額，所以它會隨著你指定沖哪幾批而改變；
                      成交總額是價金，還沒扣手續費與證交稅。
                    </p>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

interface SellRowProps {
  matched: LedgerMatchedSell;
  brokerMatched?: LedgerMatchedSell;
  diff: number;
  open: boolean;
  rows: LedgerReconcileRow[];
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
  numberCell: string;
}

/** 賣出紀錄的一列＋展開後的兩帳沖銷明細。只有這一頁用得到，留在本檔。 */
function SellRow({
  matched,
  brokerMatched,
  diff,
  open,
  rows,
  busy,
  onToggle,
  onDelete,
  numberCell,
}: SellRowProps) {
  const broken = matched.unhonored > 0 || matched.shortfall > 0;

  return (
    <>
      <tr className="hover:bg-surface-container-low/50 transition-colors">
        <td className="p-2 pl-4 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">
          {formatDate(matched.trade_date)}
          {broken && <span className="ml-2 font-body-sm text-body-sm text-error">指定對不上</span>}
        </td>
        <td className={`${numberCell} text-on-surface-variant`}>{formatNumber(matched.shares)}</td>
        <td className={`${numberCell} text-on-surface`}>{formatPrice(matched.price)}</td>
        {/* 成交總額是價金（股數 × 成交價），還沒扣手續費與證交稅——
            實際入帳的是它減掉右邊那兩欄，展開明細看得到淨收入。 */}
        <td className={`${numberCell} text-on-surface`} title={`淨收入 ${formatNumber(matched.net_proceeds)} 元`}>
          {formatNumber(matched.amount)}
        </td>
        <td className={`${numberCell} text-on-surface-variant`}>{formatNumber(matched.fee)}</td>
        <td className={`${numberCell} text-on-surface-variant`}>{formatNumber(matched.tax)}</td>
        <td className={`${numberCell} font-bold ${quoteColor(matched.realized)}`}>
          {formatSigned(matched.realized, 0)}
        </td>
        {/* 報酬率的分母是這一筆沖掉的成本，不是成交總額。後端算好的，不在這裡除。 */}
        <td
          className={`${numberCell} font-bold ${quoteColor(matched.return_rate)}`}
          title={`成本 ${formatNumber(matched.cost)} 元`}
        >
          {formatSignedPercent(matched.return_rate)}
        </td>
        <td className={`${numberCell} ${quoteColor(brokerMatched?.realized ?? null)}`}>
          {brokerMatched == null ? DASH : formatSigned(brokerMatched.realized, 0)}
        </td>
        <td className={`${numberCell} ${quoteColor(diff)}`}>
          {diff === 0 ? DASH : formatSigned(diff, 0)}
        </td>
        <td className="p-2 pr-4 py-3 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            title={open ? '收合' : '展開沖銷明細'}
            className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {open ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title="刪除這筆賣出"
            className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </td>
      </tr>

      {open && (
        <tr className="bg-surface-container-low/40">
          <td colSpan={11} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
              <AllocationList
                title="我的策略帳"
                accent="text-primary"
                matched={matched}
                rows={rows}
              />
              <AllocationList
                title="券商 FIFO 帳"
                accent="text-on-surface-variant"
                matched={brokerMatched}
                rows={rows}
              />
            </div>
            {broken && (
              <p className="font-body-sm text-body-sm text-error mt-3">
                這筆有 {formatNumber(matched.unhonored)} 股指定不到（批次已被更早的賣出吃光或被刪除）
                {matched.shortfall > 0 &&
                  `，另有 ${formatNumber(matched.shortfall)} 股整批庫存都不夠沖`}
                。上面的損益是後端用自動規則補出來的，刪掉重記才會正確。
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/** 一本帳在某一筆賣出裡的沖銷明細。 */
function AllocationList({
  title,
  accent,
  matched,
  rows,
}: {
  title: string;
  accent: string;
  matched?: LedgerMatchedSell;
  rows: LedgerReconcileRow[];
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <p className={`font-label-caps text-label-caps uppercase mb-2 ${accent}`}>{title}</p>
      {matched == null || matched.allocations.length === 0 ? (
        <p className="font-body-sm text-body-sm text-outline">沒有沖銷到任何批次</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {matched.allocations.map((alloc, index) => {
            const row = rows.find((r) => r.lot_id === alloc.lot_id);
            return (
              <li
                key={`${alloc.lot_id}-${index}`}
                className="flex items-baseline justify-between gap-2 font-body-sm text-body-sm text-on-surface-variant"
              >
                <span>
                  {row ? formatDate(row.trade_date) : '已刪除的批次'} · 成本{' '}
                  <span className="font-data-md text-data-md text-on-surface">
                    {formatPrice(alloc.unit_cost)}
                  </span>{' '}
                  ×{' '}
                  <span className="font-data-md text-data-md text-on-surface">
                    {formatNumber(alloc.shares)}
                  </span>{' '}
                  股{alloc.source === 'AUTO' && '（自動）'}
                </span>
                <span className={`font-data-md text-data-md ${quoteColor(alloc.realized)}`}>
                  {formatSigned(alloc.realized, 0)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
