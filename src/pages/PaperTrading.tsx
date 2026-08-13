import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import { getPortfolioValuation } from '../api/portfolio';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatAmount,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPrice,
  formatSigned,
  formatSignedPercent,
  quoteColor,
} from '../utils/format';
import {
  BROKER_FEE_MINIMUM,
  BROKER_FEE_RATE,
  DEFAULT_INITIAL_CASH,
  PaperState,
  TRANSACTION_TAX_RATE,
  TradeSide,
  applyTrade,
  brokerFee,
  emptyState,
  loadState,
  realizedTotal,
  saveState,
  transactionTax,
} from '../utils/paperTrading';

// 模擬買賣：拿真實行情練習下單，不會碰到任何真的錢或真的部位。
//
// 狀態整包存在瀏覽器的 localStorage，後端完全不知道這一頁的存在——
// 後端沒有下單、現金與委託的概念，為了練習功能開一組端點不划算。
// 代價是換一台電腦或清掉瀏覽器資料就歸零，畫面上要講清楚。
//
// 報價沿用自選股試算那一支：它已經處理好即時報價掛掉時退到延遲報價，
// 這裡不必再自己接一套取價邏輯。

export default function PaperTrading() {
  const [state, setState] = useState<PaperState>(() => loadState());
  const [side, setSide] = useState<TradeSide>('BUY');
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('1000');
  const [price, setPrice] = useState('');
  const [notice, setNotice] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [cashInput, setCashInput] = useState(String(DEFAULT_INITIAL_CASH));
  // 折數輸入中的原始字串。合法才寫回 state，不合法就在失焦時退回原值。
  const [feeDiscountText, setFeeDiscountText] = useState(String(state.feeDiscount));

  const commitFeeDiscount = () => {
    const value = Number(feeDiscountText.trim());
    if (Number.isFinite(value) && value > 0 && value <= 1) {
      setState((prev) => ({ ...prev, feeDiscount: value }));
      return;
    }
    // 打到一半就切走、或打了 0 與大於 1 的值：退回目前生效的折數，不要留一個假的數字在畫面上。
    setFeeDiscountText(String(state.feeDiscount));
    setNotice('手續費折數要介於 0 與 1 之間（1 代表不打折）');
  };

  const valuation = useAsyncData(() => getPortfolioValuation(), []);

  // 每次狀態變動就寫回 localStorage。這一頁的資料量很小（幾十筆交易），
  // 不必為了效能做延遲寫入，反而是「關掉分頁就掉了一筆」比較難解釋。
  useEffect(() => {
    saveState(state);
  }, [state]);

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, { name: string; price: number | null }>();
    for (const row of valuation.data ?? []) {
      if (!map.has(row.symbol)) map.set(row.symbol, { name: row.name, price: row.price });
    }
    return map;
  }, [valuation.data]);

  /** 可以下單的標的：自選股清單裡有報價的那些。 */
  const tradableSymbols = useMemo(
    () =>
      (valuation.data ?? [])
        .filter((row) => row.price != null)
        // 同一檔在試算結果裡會有多列（一列對一筆部位），下單清單只要出現一次。
        .filter((row, index, all) => all.findIndex((r) => r.symbol === row.symbol) === index)
        .map((row) => ({ symbol: row.symbol, name: row.name })),
    [valuation.data]
  );

  // 選了代號就把現價帶進價格欄，讓使用者只要改股數就能送出。
  const pickSymbol = (next: string) => {
    setSymbol(next);
    setNotice('');
    const quote = priceBySymbol.get(next);
    if (quote?.price != null) setPrice(String(quote.price));
  };

  const positionsWithValue = useMemo(
    () =>
      state.positions.map((p) => {
        const current = priceBySymbol.get(p.symbol)?.price ?? null;
        const marketValue = current != null ? current * p.shares : null;
        const costValue = p.avgCost * p.shares;
        return {
          ...p,
          current,
          marketValue,
          costValue,
          profit: marketValue != null ? marketValue - costValue : null,
          profitPercent: marketValue != null ? ((marketValue - costValue) / costValue) * 100 : null,
        };
      }),
    [state.positions, priceBySymbol]
  );

  const summary = useMemo(() => {
    // 有任何一檔取不到現價，總市值就是不完整的，總資產與報酬率跟著失真。
    // 這種時候回 null 顯示破折號，而不是拿部分市值假裝是全部。
    const priced = positionsWithValue.filter((p) => p.marketValue != null);
    const complete = priced.length === positionsWithValue.length;
    const holdingsValue = priced.reduce((sum, p) => sum + (p.marketValue as number), 0);
    const totalAsset = complete ? state.cash + holdingsValue : null;
    return {
      complete,
      missing: positionsWithValue.length - priced.length,
      holdingsValue: complete ? holdingsValue : null,
      totalAsset,
      unrealized: complete
        ? priced.reduce((sum, p) => sum + (p.profit as number), 0)
        : null,
      realized: realizedTotal(state.trades),
      returnPercent:
        totalAsset != null && state.initialCash > 0
          ? ((totalAsset - state.initialCash) / state.initialCash) * 100
          : null,
    };
  }, [positionsWithValue, state.cash, state.initialCash, state.trades]);

  /** 這一筆送出去會付多少費用、動用多少現金。送出前就算給使用者看。 */
  const preview = useMemo(() => {
    const s = Number(shares);
    const p = Number(price);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(p) || p <= 0) return null;
    const amount = s * p;
    const fee = brokerFee(amount, state.feeDiscount);
    const tax = transactionTax(amount, side);
    return {
      amount,
      fee,
      tax,
      cashDelta: side === 'BUY' ? -(amount + fee) : amount - fee - tax,
    };
  }, [shares, price, side, state.feeDiscount]);

  const handleTrade = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    const quote = priceBySymbol.get(symbol);
    try {
      const { state: next, trade } = applyTrade(state, {
        side,
        symbol,
        name: quote?.name ?? symbol,
        shares: Number(shares),
        price: Number(price),
        // 時鐘留在這一層，算式那一層不碰時間，測試才好寫。
        at: new Date().toISOString(),
      });
      setState(next);
      setNotice(
        `${side === 'BUY' ? '買進' : '賣出'} ${trade.symbol} ${formatNumber(
          trade.shares
        )} 股 @ ${formatPrice(trade.price)}，手續費 ${formatNumber(trade.fee)}${
          trade.tax > 0 ? `、交易稅 ${formatNumber(trade.tax)}` : ''
        }`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '下單失敗');
    }
  };

  const handleReset = () => {
    const amount = Number(cashInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice('起始資金要大於 0');
      return;
    }
    if (
      state.trades.length > 0 &&
      !window.confirm('重設會清掉所有模擬持股與交易紀錄，確定嗎？')
    ) {
      return;
    }
    setState({ ...emptyState(amount), feeDiscount: state.feeDiscount });
    setNotice(`已重設，起始資金 ${formatAmount(amount)} 元`);
    setShowSettings(false);
  };

  const fieldClass =
    'px-3 py-2 bg-surface-container border border-outline-variant rounded font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary';
  const headCell =
    'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
  const numberCell = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';

  return (
    <>
      <PageHeader
        title="模擬買賣"
        icon="school"
        subtitle="用真實行情練習下單，不會動到任何真的錢或真的部位。"
        right={
          <>
            {notice && (
              <span className="font-body-sm text-body-sm text-on-surface-variant">{notice}</span>
            )}
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
              資金與費率
            </button>
            <button
              type="button"
              onClick={valuation.reload}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              更新報價
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這一頁完全是練習用的：下單只會改變這台瀏覽器裡的紀錄，
          <span className="text-on-surface font-semibold">
            不會下真的單，也不會動到「我的持股」
          </span>
          。資料存在瀏覽器本機，換一台電腦或清掉瀏覽器資料就會歸零。
          費用照台股規則計算——手續費 {(BROKER_FEE_RATE * 100).toFixed(4)}%（最低{' '}
          {BROKER_FEE_MINIMUM} 元，可設折數）、賣出加收證交稅{' '}
          {(TRANSACTION_TAX_RATE * 100).toFixed(1)}%。成交價預設帶入現價，你也可以自己改成想練習的價位。
        </p>

        {showSettings && (
          <section className="flex flex-wrap items-end gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4">
            <div className="flex flex-col gap-1">
              <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                起始資金（元）
              </label>
              <input
                value={cashInput}
                onChange={(event) => setCashInput(event.target.value)}
                inputMode="numeric"
                className={`${fieldClass} w-40 font-data-md text-data-md text-right`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                手續費折數
              </label>
              {/*
                輸入中的字串留在自己的 state，離開欄位才寫回。
                直接把 state.feeDiscount 當 value 又在 onChange 驗證的話，
                從 1 打到 0.6 的每一個中間值（""、"0"、"0."）都不合法而被擋掉，
                state 不動、React 又把畫面重繪回 1——結果是整個欄位打不進任何東西。
              */}
              <input
                value={feeDiscountText}
                onChange={(event) => setFeeDiscountText(event.target.value)}
                onBlur={commitFeeDiscount}
                inputMode="decimal"
                placeholder="1 = 不打折"
                className={`${fieldClass} w-32 font-data-md text-data-md text-right`}
              />
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 bg-error rounded text-on-error font-body-md text-body-md hover:opacity-90 transition-opacity"
            >
              重設並套用起始資金
            </button>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              重設會清掉所有模擬持股與交易紀錄。折數 0.6 代表六折，1 代表不打折。
            </span>
          </section>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-stack-md">
          <StatCard
            label="總資產"
            icon="account_balance"
            value={summary.totalAsset == null ? DASH : formatAmount(summary.totalAsset)}
            hint={summary.complete ? '元，現金 + 持股市值' : `元，有 ${summary.missing} 檔取不到現價`}
          />
          <StatCard
            label="現金"
            icon="payments"
            value={formatAmount(state.cash)}
            hint={`元，起始 ${formatAmount(state.initialCash)}`}
          />
          <StatCard
            label="持股市值"
            icon="savings"
            value={summary.holdingsValue == null ? DASH : formatAmount(summary.holdingsValue)}
            hint={`元，${state.positions.length} 檔`}
          />
          <StatCard
            label="未實現損益"
            icon="trending_up"
            value={summary.unrealized == null ? DASH : formatSigned(summary.unrealized, 0)}
            hint="元，尚未賣出的帳面盈虧"
            valueClassName={quoteColor(summary.unrealized)}
          />
          <StatCard
            label="已實現損益"
            icon="done_all"
            value={formatSigned(summary.realized, 0)}
            hint="元，賣出時鎖定的盈虧（已扣費用與稅）"
            valueClassName={quoteColor(summary.realized)}
          />
        </div>

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          總報酬率{' '}
          <span className={`font-data-md text-data-md ${quoteColor(summary.returnPercent)}`}>
            {formatSignedPercent(summary.returnPercent)}
          </span>{' '}
          ＝（總資產 − 起始資金）÷ 起始資金。有任何一檔取不到現價時，總資產與報酬率都顯示破折號——
          拿部分市值當成全部，算出來的報酬率是錯的。
        </p>

        {/* ── 下單 ── */}
        <form
          onSubmit={handleTrade}
          className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4"
        >
          <div className="flex flex-wrap items-end gap-stack-md">
            <div className="flex p-1 rounded bg-surface-container">
              {(
                [
                  ['BUY', '買進'],
                  ['SELL', '賣出'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSide(value)}
                  className={`px-4 py-1.5 rounded font-body-md text-body-md transition-colors ${
                    side === value
                      ? value === 'BUY'
                        ? 'bg-quote-up text-on-primary font-semibold'
                        : 'bg-quote-down text-on-primary font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                股票
              </label>
              <select
                value={symbol}
                onChange={(event) => pickSymbol(event.target.value)}
                className={`${fieldClass} w-52`}
              >
                <option value="">選一檔…</option>
                {tradableSymbols.map((item) => (
                  <option key={item.symbol} value={item.symbol}>
                    {item.symbol} {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                股數
              </label>
              <input
                value={shares}
                onChange={(event) => setShares(event.target.value)}
                inputMode="numeric"
                className={`${fieldClass} w-28 font-data-md text-data-md text-right`}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                成交價
              </label>
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                className={`${fieldClass} w-28 font-data-md text-data-md text-right`}
              />
            </div>

            <button
              type="submit"
              disabled={!symbol || !preview}
              className={`px-5 py-2 rounded text-on-primary font-body-md text-body-md font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed ${
                side === 'BUY' ? 'bg-quote-up' : 'bg-quote-down'
              }`}
            >
              送出{side === 'BUY' ? '買進' : '賣出'}
            </button>
          </div>

          {preview && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              價金 {formatAmount(preview.amount)} 元 · 手續費 {formatNumber(preview.fee)} 元
              {preview.tax > 0 && ` · 交易稅 ${formatNumber(preview.tax)} 元`} ·{' '}
              {side === 'BUY' ? '需動用現金' : '可入帳'}{' '}
              <span className="font-data-md text-data-md text-on-surface">
                {formatAmount(Math.abs(preview.cashDelta))}
              </span>{' '}
              元
              {side === 'BUY' && state.cash + preview.cashDelta < 0 && (
                <span className="text-error"> · 現金不足</span>
              )}
            </p>
          )}

          {tradableSymbols.length === 0 && !valuation.loading && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              目前沒有可以下單的標的：這一頁的報價來自自選股試算，
              自選股是空的、或每一檔都取不到現價時就沒有東西可選。
            </p>
          )}
        </form>

        {valuation.loading && <PageState kind="loading" />}
        {valuation.error && (
          <PageState kind="error" message={valuation.error} onRetry={valuation.reload} />
        )}

        {/* ── 模擬持股 ── */}
        <section className="flex flex-col gap-stack-md">
          <h2 className="font-headline-md text-headline-md text-primary">模擬持股</h2>
          {positionsWithValue.length === 0 ? (
            <PageState
              kind="empty"
              message="還沒有模擬持股"
              hint="用上面的表單買進一檔就會出現在這裡。成本會把買進手續費攤進去，跟實際對帳一致。"
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className={`${headCell} pl-4 text-left`}>股號 / 名稱</th>
                    <th className={`${headCell} text-right`}>股數</th>
                    <th className={`${headCell} text-right`}>平均成本</th>
                    <th className={`${headCell} text-right`}>現價</th>
                    <th className={`${headCell} text-right`}>市值</th>
                    <th className={`${headCell} text-right`}>未實現損益</th>
                    <th className={`${headCell} pr-4 text-right`}>報酬率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {positionsWithValue.map((p) => (
                    <tr key={p.symbol} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="p-2 pl-4 py-3">
                        <span className="font-data-md text-data-md text-primary font-bold">
                          {p.symbol}
                        </span>
                        <span className="block font-body-sm text-body-sm text-on-surface-variant">
                          {p.name}
                        </span>
                      </td>
                      <td className={`${numberCell} text-on-surface-variant`}>
                        {formatNumber(p.shares)}
                      </td>
                      <td className={`${numberCell} text-on-surface-variant`}>
                        {formatPrice(p.avgCost)}
                      </td>
                      <td className={`${numberCell} text-on-surface`}>{formatPrice(p.current)}</td>
                      <td className={`${numberCell} text-on-surface font-bold`}>
                        {p.marketValue == null ? DASH : formatAmount(p.marketValue)}
                      </td>
                      <td className={`${numberCell} ${quoteColor(p.profit)}`}>
                        {p.profit == null ? DASH : formatSigned(p.profit, 0)}
                      </td>
                      <td className={`${numberCell} pr-4 ${quoteColor(p.profitPercent)}`}>
                        {formatSignedPercent(p.profitPercent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            平均成本用移動加權平均，並把買進手續費攤進去——不攤的話損益會虛胖一個手續費。
            賣出時的已實現損益也是扣掉手續費與交易稅之後的淨額。
          </p>
        </section>

        {/* ── 交易紀錄 ── */}
        {state.trades.length > 0 && (
          <section className="flex flex-col gap-stack-md">
            <h2 className="font-headline-md text-headline-md text-primary">
              交易紀錄（{state.trades.length} 筆）
            </h2>
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className={`${headCell} pl-4 text-left`}>時間</th>
                    <th className={`${headCell} text-left`}>買賣</th>
                    <th className={`${headCell} text-left`}>股票</th>
                    <th className={`${headCell} text-right`}>股數</th>
                    <th className={`${headCell} text-right`}>成交價</th>
                    <th className={`${headCell} text-right`}>價金</th>
                    <th className={`${headCell} text-right`}>手續費</th>
                    <th className={`${headCell} text-right`}>交易稅</th>
                    <th className={`${headCell} pr-4 text-right`}>已實現損益</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {state.trades.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="p-2 pl-4 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                        {formatDateTime(t.at)}
                      </td>
                      <td className="p-2 py-3 whitespace-nowrap">
                        <span
                          className={`font-body-sm text-body-sm px-2 py-0.5 rounded ${
                            t.side === 'BUY'
                              ? 'text-quote-up bg-error-container/20'
                              : 'text-quote-down bg-secondary-container/20'
                          }`}
                        >
                          {t.side === 'BUY' ? '買進' : '賣出'}
                        </span>
                      </td>
                      <td className="p-2 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">
                        <span className="font-data-md text-data-md text-primary">{t.symbol}</span>{' '}
                        {t.name}
                      </td>
                      <td className={`${numberCell} text-on-surface-variant`}>
                        {formatNumber(t.shares)}
                      </td>
                      <td className={`${numberCell} text-on-surface`}>{formatPrice(t.price)}</td>
                      <td className={`${numberCell} text-on-surface-variant`}>
                        {formatAmount(t.amount)}
                      </td>
                      <td className={`${numberCell} text-on-surface-variant`}>
                        {formatNumber(t.fee)}
                      </td>
                      <td className={`${numberCell} text-on-surface-variant`}>
                        {/* 買進不收證交稅，那一格是「不適用」不是 0 元。 */}
                        {t.side === 'BUY' ? DASH : formatNumber(t.tax)}
                      </td>
                      <td className={`${numberCell} pr-4 ${quoteColor(t.realized)}`}>
                        {t.realized == null ? DASH : formatSigned(t.realized, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              買進那幾列的已實現損益是破折號而不是 0——買進不會實現損益，兩者意思不同。
              手續費佔比可以在「資金與費率」裡調折數；目前是{' '}
              {formatPercent(state.feeDiscount * 100, 0)} 費率
              （{state.feeDiscount === 1 ? '不打折' : `約 ${(state.feeDiscount * 10).toFixed(1)} 折`}）。
            </p>
          </section>
        )}
      </div>
    </>
  );
}
