import { Fragment, FormEvent, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import {
  addPosition,
  getHoldings,
  getPortfolioValuation,
  removePosition,
  updateHoldingPosition,
} from '../api/portfolio';
import { getLedgerReport } from '../api/ledger';
import { apiErrorMessage } from '../api/request';
import { Holding, LedgerLot, PortfolioRow } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatAmount,
  formatNumber,
  formatPercent,
  formatPrice,
  formatSigned,
  formatSignedPercent,
  marketLabel,
  priceSourceLabel,
  quoteColor,
} from '../utils/format';

// 這一頁跟「自選股」的差別：那邊看的是行情與買入時機，這邊看的是部位。
//
// 一列 = 持股表的一列 = 一個帳戶的一筆部位，不併成一檔。
// 同一檔分散在多個券商時，各家的股數與成本不一樣，併起來就看不出哪一筆是哪個帳戶的，
// 賣出時也對不起來。合計則橫跨所有帳戶，那才是「我總共持有多少」。
//
// 之所以要打兩支 API：股數與成本只有 /portfolio/holdings 有，
// 現價只有 /portfolio/valuation 有——後端的試算結果沒有帶股數。

/** 一筆部位（持股表的一列）加上以現價算出來的欄位。 */
interface PositionRow {
  id: string;
  symbol: string;
  name: string;
  market: string;
  /** 券商帳戶。空字串代表沒指定。 */
  account: string;
  /** 這一筆沒有啟用時不納入試算，所以拿不到現價。 */
  disabled: boolean;

  shares: number | null;
  cost: number | null;
  price: number | null;
  priceSource: string;
  /** 取價失敗的原因，成功時是空字串。 */
  error: string;

  /** 市值與損益金額要股數才算得出來；報酬率不用。 */
  marketValue: number | null;
  costValue: number | null;
  profit: number | null;
  profitPercent: number | null;
}

function toPositionRows(
  holdings: Holding[],
  priceBySymbol: Map<string, PortfolioRow>
): PositionRow[] {
  return holdings
    .map((h) => {
      const valuation = priceBySymbol.get(h.symbol);
      const price = valuation?.price ?? null;
      const marketValue = price != null && h.shares != null ? price * h.shares : null;
      const costValue = h.cost != null && h.shares != null ? h.cost * h.shares : null;
      return {
        id: h.id,
        symbol: h.symbol,
        // 名稱以試算結果為準，那邊是跟行情來源要的，會跟著改名更新。
        name: valuation?.name || h.name,
        market: valuation?.market || h.market,
        account: h.account,
        disabled: !h.enabled,
        shares: h.shares,
        cost: h.cost,
        price,
        priceSource: valuation?.price_source ?? '',
        error: valuation?.error ?? '',
        marketValue,
        costValue,
        profit: marketValue != null && costValue != null ? marketValue - costValue : null,
        // 報酬率只需要成本與現價，跟持有幾股無關——綁在損益金額上會讓
        // 「有成本、還沒填股數」的部位明明算得出來卻顯示破折號。
        profitPercent:
          h.cost != null && h.cost !== 0 && price != null ? ((price - h.cost) / h.cost) * 100 : null,
      };
    })
    .sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1));
}

/** 沒填帳戶時的顯示名稱。空字串與 null 都算同一組——兩者都是「沒指定」。 */
const NO_ACCOUNT = '未指定帳戶';

/** 一個帳戶的小計。欄位語意與全站合計一致，只是範圍縮到單一帳戶。 */
interface AccountGroup {
  account: string;
  rows: PositionRow[];
  /** 股數、成本、現價都齊的筆數。四個數字都只算這一群，範圍才內部一致。 */
  counted: number;
  marketValue: number;
  costValue: number;
  profit: number;
  profitPercent: number | null;
  /** 這個帳戶的市值佔全部帳戶的比重。 */
  weight: number | null;
}

/**
 * 依帳戶分組。
 *
 * 為什麼要分：同一個人的部位散在不同券商，看總數看不出「哪一個帳戶在賺」。
 * 分完之後每一組的市值、成本、損益、報酬率都是那個帳戶自己的，可以直接當報表看。
 *
 * 組內順序沿用市值由大到小；組的順序也照市值排，但「未指定帳戶」一律墊底——
 * 那不是一個真的帳戶，是還沒填的資料，排在中間會讓人以為它是一組部位。
 */
function groupByAccount(rows: PositionRow[], weightBase: number): AccountGroup[] {
  const byAccount = new Map<string, PositionRow[]>();
  for (const row of rows) {
    const key = row.account.trim() || NO_ACCOUNT;
    const list = byAccount.get(key) ?? [];
    list.push(row);
    byAccount.set(key, list);
  }

  const groups = Array.from(byAccount, ([account, list]) => {
    // 跟全站合計同一個規則：只累加三個值都齊的那幾筆。
    // 市值算 A 群、成本算 B 群的話，相減得到的損益不對應任何真實部位。
    const complete = list.filter((r) => r.marketValue != null && r.costValue != null);
    const marketValue = complete.reduce((sum, r) => sum + (r.marketValue as number), 0);
    const costValue = complete.reduce((sum, r) => sum + (r.costValue as number), 0);
    // 比重的分母跟全站合計一致，用「有市值」的那群（比可完整計算的寬）：
    // 只差成本的部位仍然佔著倉，不該從分布裡消失。
    const groupMarketValue = list.reduce((sum, r) => sum + (r.marketValue ?? 0), 0);
    return {
      account,
      rows: list,
      counted: complete.length,
      marketValue,
      costValue,
      profit: marketValue - costValue,
      profitPercent: costValue > 0 ? ((marketValue - costValue) / costValue) * 100 : null,
      weight: weightBase > 0 ? (groupMarketValue / weightBase) * 100 : null,
    };
  });

  return groups.sort((a, b) => {
    if (a.account === NO_ACCOUNT) return 1;
    if (b.account === NO_ACCOUNT) return -1;
    return b.marketValue - a.marketValue;
  });
}

/** 空字串轉 null（代表不知道），有填就轉數字；填了非正數回 undefined 表示不合法。 */
function parsePositive(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export default function Holdings() {
  const { setSymbol } = useSymbol();
  // 停用的列也一起拿：它們不在試算結果裡，但使用者仍該知道自己有這些部位。
  const holdings = useAsyncData(() => getHoldings(false), []);
  const valuation = useAsyncData(() => getPortfolioValuation(), []);

  const [editingId, setEditingId] = useState('');
  const [editShares, setEditShares] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editAccount, setEditAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // 新增一筆部位的表單。
  const [newSymbol, setNewSymbol] = useState('');
  const [newShares, setNewShares] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newAccount, setNewAccount] = useState('');

  const allRows = useMemo(() => {
    const priceBySymbol = new Map<string, PortfolioRow>();
    // 同一檔在試算結果裡也有多列（一列對一筆部位），價格都一樣，取第一列即可。
    for (const row of valuation.data ?? []) {
      if (!priceBySymbol.has(row.symbol)) priceBySymbol.set(row.symbol, row);
    }
    return toPositionRows(holdings.data ?? [], priceBySymbol);
  }, [holdings.data, valuation.data]);

  // 有填股數的才算持股，沒填的只是放著觀察。
  // 後端只有一張表，自選與持股混在一起，沒有「是不是持股」的欄位，
  // 股數是唯一可用而且語意剛好正確的判準。
  const rows = useMemo(() => allRows.filter((row) => row.shares != null), [allRows]);
  const watchOnlyRows = useMemo(() => allRows.filter((row) => row.shares == null), [allRows]);

  // 這一檔在幾個帳戶裡有部位，用來提示「同一檔有多筆」。
  const lotsBySymbol = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.symbol, (counts.get(row.symbol) ?? 0) + 1);
    return counts;
  }, [rows]);

  // 合計只累加「股數、成本、現價都齊」的那幾筆。
  //
  // 四個數字用同一個子集：總市值算 A 群、總成本算 B 群的話，
  // 兩者相減得到的損益不對應任何真實部位。寧可涵蓋範圍小一點，也要內部一致。
  const totals = useMemo(() => {
    const complete = rows.filter((row) => row.marketValue != null && row.costValue != null);
    const marketValue = complete.reduce((sum, row) => sum + (row.marketValue as number), 0);
    const costValue = complete.reduce((sum, row) => sum + (row.costValue as number), 0);
    return {
      counted: complete.length,
      marketValue,
      costValue,
      profit: marketValue - costValue,
      profitPercent: costValue > 0 ? ((marketValue - costValue) / costValue) * 100 : null,
      // 比重的分母用「有市值」的那群，比可完整計算的那群寬：
      // 只差成本的部位仍然佔著倉，不該從分布裡消失。
      weightBase: rows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0),
    };
  }, [rows]);

  const groups = useMemo(() => groupByAccount(rows, totals.weightBase), [rows, totals.weightBase]);

  /**
   * 展開某一列時去撈那一檔的沖銷帳買進明細。
   *
   * 持股表一列只有「目前股數與平均成本」，沒有逐筆買進紀錄——那些在沖銷帳
   * （ledger_lots）裡，是另一張刻意獨立的表。這裡只讀不寫，兩邊的數字各記各的：
   * 沖銷帳的剩餘不會等於這一列的股數，除非兩邊都有好好維護。
   *
   * 一檔一個 key 快取，收合再展開不重打；換頁重進才會重抓。
   */
  const [expandedId, setExpandedId] = useState('');
  const [lotsBySymbolCache, setLotsBySymbolCache] = useState<
    Record<string, { loading: boolean; error: string; lots: LedgerLot[] }>
  >({});

  const toggleExpand = (row: PositionRow) => {
    if (expandedId === row.id) {
      setExpandedId('');
      return;
    }
    setExpandedId(row.id);
    if (lotsBySymbolCache[row.symbol]) return;
    setLotsBySymbolCache((prev) => ({
      ...prev,
      [row.symbol]: { loading: true, error: '', lots: [] },
    }));
    getLedgerReport(row.symbol)
      .then((report) => {
        setLotsBySymbolCache((prev) => ({
          ...prev,
          [row.symbol]: {
            loading: false,
            error: '',
            // 用策略帳的部位：那是使用者眼中的真相，券商 FIFO 帳沖掉的批次不一定是同一筆。
            lots: report.strategy.positions.map((p) => p.lot),
          },
        }));
      })
      .catch((err) => {
        setLotsBySymbolCache((prev) => ({
          ...prev,
          [row.symbol]: { loading: false, error: apiErrorMessage(err), lots: [] },
        }));
      });
  };

  const loading = holdings.loading || valuation.loading;
  const error = holdings.error || valuation.error;

  const reloadAll = () => {
    holdings.reload();
    valuation.reload();
  };

  const startEdit = (row: PositionRow) => {
    setEditingId(row.id);
    // 空字串代表「沒有值」，送出時轉回 null——不要預填 0，那是另一個意思。
    setEditShares(row.shares == null ? '' : String(row.shares));
    setEditCost(row.cost == null ? '' : String(row.cost));
    setEditAccount(row.account);
    setNotice('');
  };

  const cancelEdit = () => {
    setEditingId('');
    setNotice('');
  };

  const saveEdit = async (row: PositionRow) => {
    const shares = parsePositive(editShares);
    const cost = parsePositive(editCost);
    if (shares === undefined || cost === undefined) {
      setNotice('股數與成本要填大於 0 的數字；沒有值請留空白，不要填 0');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      // 這支是整組部位覆寫，三個值一定要一起送，不能只送有改的那個。
      await updateHoldingPosition(row.id, cost, shares, editAccount.trim());
      setEditingId('');
      setNotice(`已更新 ${row.symbol} 的部位`);
      holdings.reload();
    } catch (err) {
      setNotice(apiErrorMessage(err, '更新失敗'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (row: PositionRow) => {
    const label = row.account ? `${row.symbol}（${row.account}）` : row.symbol;
    if (!window.confirm(`確定要刪掉 ${label} 這一筆部位？同一檔的其他帳戶不受影響。`)) return;
    setBusy(true);
    setNotice('');
    try {
      await removePosition(row.id);
      setNotice(`已刪除 ${label} 這一筆部位`);
      holdings.reload();
    } catch (err) {
      setNotice(apiErrorMessage(err, '刪除失敗'));
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const symbol = newSymbol.trim();
    if (!symbol) return;
    const shares = parsePositive(newShares);
    const cost = parsePositive(newCost);
    if (shares === undefined || cost === undefined) {
      setNotice('股數與成本要填大於 0 的數字；沒有值請留空白，不要填 0');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      await addPosition(symbol, cost, shares, newAccount.trim());
      setNewSymbol('');
      setNewShares('');
      setNewCost('');
      setNewAccount('');
      setNotice(`已為 ${symbol} 新增一筆部位`);
      reloadAll();
    } catch (err) {
      setNotice(apiErrorMessage(err, '新增失敗，這一檔要先在自選股清單裡'));
    } finally {
      setBusy(false);
    }
  };

  const numberCell = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';
  const headCell =
    'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
  const editFieldClass =
    'w-24 px-2 py-1 bg-surface-container border border-outline-variant rounded font-data-md text-data-md text-on-surface text-right outline-none focus:border-primary focus:ring-1 focus:ring-primary';
  const formFieldClass =
    'px-3 py-2 bg-surface-container border border-outline-variant rounded font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary';

  /** 代號欄：代號、名稱、市場，外加狀態標記。 */
  const symbolCell = (row: PositionRow, lots: number) => (
    <td className="p-2 pl-4 py-3">
      <div className="flex flex-col">
        <span className="font-data-md text-data-md text-primary font-bold">{row.symbol}</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {row.name}
          <span className="text-outline"> · {marketLabel(row.market)}</span>
        </span>
        {row.error && (
          <span className="font-body-sm text-body-sm text-error" title={row.error}>
            取價失敗
          </span>
        )}
        {row.disabled && (
          <span className="font-body-sm text-body-sm text-outline">已停用，不納入試算</span>
        )}
        {lots > 1 && (
          <span className="font-body-sm text-body-sm text-outline">這一檔共 {lots} 筆部位</span>
        )}
      </div>
    </td>
  );

  return (
    <>
      <PageHeader
        title="我的持股"
        icon="account_balance_wallet"
        subtitle="逐筆列出各帳戶的部位，計算市值、未實現損益與各筆佔比。"
        right={
          <>
            {notice && (
              <span className="font-body-sm text-body-sm text-on-surface-variant">{notice}</span>
            )}
            <button
              type="button"
              onClick={reloadAll}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              重新計算
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這一頁跟「自選股」不是同一份清單：
          <span className="text-on-surface font-semibold">有填股數的才算持股</span>
          ，沒填的只是放著觀察，列在頁面下方。
          <span className="text-on-surface font-semibold">一列＝一個帳戶的一筆部位</span>
          ，同一檔分散在多家券商時分開列，合計則橫跨所有帳戶。市值＝現價 × 股數，
          未實現損益＝（現價 − 成本）× 股數，以即時報價現算，不含手續費與交易稅。
          缺成本的部位算得出市值但算不出損益，會顯示破折號並且不計入合計——
          把沒填的成本當成 0 會讓報酬率變成 +∞。
        </p>

        {/* 新增一筆部位。代號必須已經在自選股清單裡，後端才知道它的名稱與市場。 */}
        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-end gap-stack-sm bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              新增部位 · 代號
            </label>
            <input
              value={newSymbol}
              onChange={(event) => setNewSymbol(event.target.value)}
              placeholder="例如 2330"
              className={`${formFieldClass} w-32 font-data-md text-data-md`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              股數
            </label>
            <input
              value={newShares}
              onChange={(event) => setNewShares(event.target.value)}
              inputMode="numeric"
              placeholder="2000"
              className={`${formFieldClass} w-28 font-data-md text-data-md text-right`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              成本
            </label>
            <input
              value={newCost}
              onChange={(event) => setNewCost(event.target.value)}
              inputMode="decimal"
              placeholder="留空=未知"
              className={`${formFieldClass} w-28 font-data-md text-data-md text-right`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              帳戶
            </label>
            <input
              value={newAccount}
              onChange={(event) => setNewAccount(event.target.value)}
              placeholder="例如 永豐"
              className={`${formFieldClass} w-32`}
            />
          </div>
          <button
            type="submit"
            disabled={!newSymbol.trim() || busy}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary rounded text-on-primary font-body-md text-body-md hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增部位
          </button>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            同一檔可以加好幾筆（每個券商帳戶一筆）。代號要先在自選股清單裡。
          </span>
        </form>

        {loading && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reloadAll} />}

        {/*
          「一筆部位都沒有」跟「清單是空的」是兩回事：後者要去加自選股，
          前者只要在下面的觀察清單填股數就好，說錯會讓人跑錯地方。
        */}
        {!loading && !error && rows.length === 0 && (
          <PageState
            kind="empty"
            message={watchOnlyRows.length > 0 ? '還沒有建立任何部位' : '清單是空的，也還沒有任何部位'}
            hint={
              watchOnlyRows.length > 0
                ? `自選股清單裡有 ${watchOnlyRows.length} 檔，但都還沒填股數，所以不算持股。用上面的表單新增，或在下面的「觀察中」表格按「建立部位」。`
                : '先到「自選股」頁加一檔，或在 LINE 聊天室輸入「/加 2330」，再回來填股數。'
            }
          />
        )}

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
              <StatCard
                label="總市值"
                icon="savings"
                value={totals.counted > 0 ? formatAmount(totals.marketValue) : DASH}
                hint={`元，涵蓋 ${totals.counted} / ${rows.length} 筆部位`}
              />
              <StatCard
                label="總成本"
                icon="receipt_long"
                value={totals.counted > 0 ? formatAmount(totals.costValue) : DASH}
                hint="元，同上述涵蓋範圍"
              />
              <StatCard
                label="未實現損益"
                icon="trending_up"
                value={totals.counted > 0 ? formatSigned(totals.profit, 0) : DASH}
                hint="元，尚未賣出的帳面盈虧"
                valueClassName={quoteColor(totals.counted > 0 ? totals.profit : null)}
              />
              <StatCard
                label="總報酬率"
                icon="percent"
                value={formatSignedPercent(totals.counted > 0 ? totals.profitPercent : null)}
                hint="未實現損益 ÷ 總成本"
                valueClassName={quoteColor(totals.counted > 0 ? totals.profitPercent : null)}
              />
            </div>

            {totals.counted < rows.length && (
              <p className="font-body-sm text-body-sm text-on-surface-variant bg-surface-container border border-outline-variant rounded px-3 py-2">
                有 {rows.length - totals.counted} 筆因為缺成本或取不到現價而沒有納入上面的合計，
                在下表中對應欄位顯示破折號。補上成本，合計才會涵蓋全部部位。
              </p>
            )}

            {/* ── 各帳戶總覽 ── */}
            {groups.length > 1 && (
              <section className="flex flex-col gap-stack-md">
                <h2 className="font-headline-md text-headline-md text-primary">各帳戶總覽</h2>
                <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
                  <table className="w-full border-collapse">
                    <thead className="bg-surface-container-low border-b border-outline-variant">
                      <tr>
                        <th className={`${headCell} pl-4 text-left`}>帳戶</th>
                        <th className={`${headCell} text-right`}>部位數</th>
                        <th className={`${headCell} text-right`}>總市值</th>
                        <th className={`${headCell} text-right`}>總成本</th>
                        <th className={`${headCell} text-right`}>未實現損益</th>
                        <th className={`${headCell} text-right`}>報酬率</th>
                        <th className={`${headCell} pr-4 text-right`}>佔比</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {groups.map((group) => (
                        <tr
                          key={group.account}
                          className="hover:bg-surface-container-low/50 transition-colors"
                        >
                          <td className="p-2 pl-4 py-3 font-body-md text-body-md whitespace-nowrap">
                            {group.account === NO_ACCOUNT ? (
                              <span className="text-outline">{NO_ACCOUNT}</span>
                            ) : (
                              <span className="text-on-surface font-semibold">{group.account}</span>
                            )}
                          </td>
                          <td className={`${numberCell} text-on-surface-variant`}>
                            {group.counted < group.rows.length
                              ? `${group.counted} / ${group.rows.length}`
                              : formatNumber(group.rows.length)}
                          </td>
                          <td className={`${numberCell} text-on-surface font-bold`}>
                            {group.counted > 0 ? formatAmount(group.marketValue) : DASH}
                          </td>
                          <td className={`${numberCell} text-on-surface-variant`}>
                            {group.counted > 0 ? formatAmount(group.costValue) : DASH}
                          </td>
                          <td
                            className={`${numberCell} ${quoteColor(
                              group.counted > 0 ? group.profit : null
                            )}`}
                          >
                            {group.counted > 0 ? formatSigned(group.profit, 0) : DASH}
                          </td>
                          <td
                            className={`${numberCell} ${quoteColor(
                              group.counted > 0 ? group.profitPercent : null
                            )}`}
                          >
                            {formatSignedPercent(group.counted > 0 ? group.profitPercent : null)}
                          </td>
                          <td className={`${numberCell} pr-4 text-on-surface-variant`}>
                            {formatPercent(group.weight)}
                          </td>
                        </tr>
                      ))}
                      {/* 合計列擺在最後，數字跟上面那排指標卡是同一份。 */}
                      <tr className="bg-surface-container-low font-semibold">
                        <td className="p-2 pl-4 py-3 font-body-md text-body-md text-on-surface">
                          合計
                        </td>
                        <td className={`${numberCell} text-on-surface-variant`}>
                          {totals.counted < rows.length
                            ? `${totals.counted} / ${rows.length}`
                            : formatNumber(rows.length)}
                        </td>
                        <td className={`${numberCell} text-on-surface`}>
                          {totals.counted > 0 ? formatAmount(totals.marketValue) : DASH}
                        </td>
                        <td className={`${numberCell} text-on-surface-variant`}>
                          {totals.counted > 0 ? formatAmount(totals.costValue) : DASH}
                        </td>
                        <td
                          className={`${numberCell} ${quoteColor(
                            totals.counted > 0 ? totals.profit : null
                          )}`}
                        >
                          {totals.counted > 0 ? formatSigned(totals.profit, 0) : DASH}
                        </td>
                        <td
                          className={`${numberCell} ${quoteColor(
                            totals.counted > 0 ? totals.profitPercent : null
                          )}`}
                        >
                          {formatSignedPercent(totals.counted > 0 ? totals.profitPercent : null)}
                        </td>
                        <td className={`${numberCell} pr-4 text-on-surface-variant`}>
                          {formatPercent(totals.weightBase > 0 ? 100 : null)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  每一組的四個數字只累加「股數、成本、現價都齊」的部位，跟合計同一個規則——
                  市值算一群、成本算另一群的話，相減得到的損益不對應任何真實部位。
                  「部位數」寫成 A / B 時，代表這個帳戶有 B 筆部位但只有 A 筆納得進計算。
                  {groups.some((g) => g.account === NO_ACCOUNT) && (
                    <>
                      {' '}
                      「{NO_ACCOUNT}」不是一個真的帳戶，是那幾筆還沒填 account 欄位；
                      在下表按編輯補上券商名稱就會歸到對的組。
                    </>
                  )}
                </p>
              </section>
            )}

            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className={`${headCell} pl-4 text-left`}>股號 / 名稱</th>
                    <th className={`${headCell} text-left`}>帳戶</th>
                    <th className={`${headCell} text-right`}>股數</th>
                    <th className={`${headCell} text-right`}>成本</th>
                    <th className={`${headCell} text-right`}>現價</th>
                    <th className={`${headCell} text-right`}>市值</th>
                    <th className={`${headCell} text-right`}>未實現損益</th>
                    <th className={`${headCell} text-right`}>報酬率</th>
                    <th className={`${headCell} text-right`}>比重</th>
                    <th className={`${headCell} pr-4 text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {groups.map((group) => (
                    <Fragment key={group.account}>
                      {/*
                        帳戶分隔列。小計直接寫在這一列上，不必回頭對照上面那張總覽——
                        往下捲到一半時最想知道的就是「我現在看的是哪個帳戶、它賺多少」。
                      */}
                      <tr className="bg-surface-container-low/70 border-y border-outline-variant">
                        <td colSpan={2} className="px-4 py-2 whitespace-nowrap">
                          <span className="material-symbols-outlined text-[16px] align-middle mr-1 text-on-surface-variant">
                            account_balance_wallet
                          </span>
                          {group.account === NO_ACCOUNT ? (
                            <span className="font-body-md text-body-md text-outline">
                              {NO_ACCOUNT}
                            </span>
                          ) : (
                            <span className="font-body-md text-body-md text-on-surface font-semibold">
                              {group.account}
                            </span>
                          )}
                          <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">
                            {group.rows.length} 筆
                          </span>
                        </td>
                        <td colSpan={3} className="px-2 py-2 text-right">
                          <span className="font-body-sm text-body-sm text-on-surface-variant">
                            市值小計
                          </span>
                        </td>
                        <td className={`${numberCell} text-on-surface font-bold`}>
                          {group.counted > 0 ? formatAmount(group.marketValue) : DASH}
                        </td>
                        <td
                          className={`${numberCell} font-bold ${quoteColor(
                            group.counted > 0 ? group.profit : null
                          )}`}
                        >
                          {group.counted > 0 ? formatSigned(group.profit, 0) : DASH}
                        </td>
                        <td
                          className={`${numberCell} font-bold ${quoteColor(
                            group.counted > 0 ? group.profitPercent : null
                          )}`}
                        >
                          {formatSignedPercent(group.counted > 0 ? group.profitPercent : null)}
                        </td>
                        <td className={`${numberCell} text-on-surface-variant`}>
                          {formatPercent(group.weight)}
                        </td>
                        <td className="px-4 py-2" />
                      </tr>
                      {group.rows.map((row) => {
                        const weight =
                          row.marketValue != null && totals.weightBase > 0
                            ? (row.marketValue / totals.weightBase) * 100
                            : null;
                        const editing = editingId === row.id;
                        const expanded = expandedId === row.id;
                        const lots = lotsBySymbolCache[row.symbol];
                        return (
                          <Fragment key={row.id}>
                      <tr
                        onClick={() => setSymbol(row.symbol)}
                        title="點擊設為目前選取的股票"
                        className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                      >
                        {symbolCell(row, lotsBySymbol.get(row.symbol) ?? 1)}

                        <td className="p-2 py-3 font-body-md text-body-md text-on-surface-variant">
                          {editing ? (
                            <input
                              value={editAccount}
                              onChange={(event) => setEditAccount(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              placeholder="帳戶"
                              className={`${editFieldClass} text-left`}
                            />
                          ) : (
                            row.account || <span className="text-outline">未指定</span>
                          )}
                        </td>

                        <td className={`${numberCell} text-on-surface-variant`}>
                          {editing ? (
                            <input
                              value={editShares}
                              onChange={(event) => setEditShares(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              inputMode="numeric"
                              className={editFieldClass}
                            />
                          ) : (
                            formatNumber(row.shares)
                          )}
                        </td>
                        <td className={`${numberCell} text-on-surface-variant`}>
                          {editing ? (
                            <input
                              value={editCost}
                              onChange={(event) => setEditCost(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              inputMode="decimal"
                              placeholder="留空=未知"
                              className={editFieldClass}
                            />
                          ) : (
                            formatPrice(row.cost)
                          )}
                        </td>
                        <td className={`${numberCell} text-on-surface`}>
                          {formatPrice(row.price)}
                          <span className="block font-body-sm text-body-sm text-outline">
                            {row.price == null ? '' : priceSourceLabel(row.priceSource)}
                          </span>
                        </td>
                        <td className={`${numberCell} text-on-surface font-bold`}>
                          {row.marketValue == null ? DASH : formatAmount(row.marketValue)}
                        </td>
                        <td className={`${numberCell} ${quoteColor(row.profit)}`}>
                          {row.profit == null ? DASH : formatSigned(row.profit, 0)}
                        </td>
                        <td className={`${numberCell} ${quoteColor(row.profitPercent)}`}>
                          {formatSignedPercent(row.profitPercent)}
                        </td>
                        <td className="p-2 py-3 text-right">
                          <span className="font-data-md text-data-md text-on-surface-variant">
                            {formatPercent(weight)}
                          </span>
                          {/* 佔比用一條長度成比例的橫條，掃一眼就知道倉位有沒有過度集中。 */}
                          {weight != null && (
                            <span className="block mt-1 h-1 w-full rounded-[9999px] bg-surface-container overflow-hidden">
                              <span
                                className="block h-full bg-primary"
                                style={{ width: `${Math.min(100, weight)}%` }}
                              />
                            </span>
                          )}
                        </td>
                        <td
                          className="p-2 pr-4 py-3 text-right whitespace-nowrap"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {editing ? (
                            <span className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => saveEdit(row)}
                                disabled={busy}
                                title="儲存"
                                className="p-1 rounded text-secondary hover:bg-surface-container transition-colors disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[20px]">
                                  {busy ? 'hourglass_empty' : 'check'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={busy}
                                title="取消"
                                className="p-1 rounded text-outline hover:bg-surface-container transition-colors disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-1">
                              {/*
                                展開看這一檔的逐筆買進。持股表一列只有「目前股數與平均成本」，
                                沒有買進明細——那些在自訂沖銷帳那張獨立的表裡。
                              */}
                              <button
                                type="button"
                                onClick={() => toggleExpand(row)}
                                title={expanded ? '收合買進明細' : '展開買進明細（自訂沖銷帳）'}
                                className="p-1 rounded text-outline hover:text-primary hover:bg-surface-container transition-colors"
                              >
                                <span className="material-symbols-outlined text-[20px]">
                                  {expanded ? 'expand_less' : 'expand_more'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                title="編輯這一筆部位"
                                className="p-1 rounded text-outline hover:text-primary hover:bg-surface-container transition-colors"
                              >
                                <span className="material-symbols-outlined text-[20px]">edit</span>
                              </button>
                              {/* 只刪這一筆，同一檔的其他帳戶不受影響。 */}
                              <button
                                type="button"
                                onClick={() => handleRemove(row)}
                                disabled={busy}
                                title="刪除這一筆部位"
                                className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>

                            {expanded && (
                              <tr className="bg-surface-container-low/40">
                                <td colSpan={10} className="p-4">
                                  <p className="font-label-caps text-label-caps uppercase text-primary mb-2">
                                    {row.symbol} 的買進明細（自訂沖銷帳）
                                  </p>
                                  {lots?.loading && (
                                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                                      載入中…
                                    </p>
                                  )}
                                  {lots?.error && (
                                    <p className="font-body-sm text-body-sm text-error">
                                      {lots.error}
                                    </p>
                                  )}
                                  {lots && !lots.loading && !lots.error && lots.lots.length === 0 && (
                                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                                      這一檔在沖銷帳裡還沒有任何買進紀錄。持股表存的是「目前股數與平均成本」，
                                      沒有逐筆明細；要看每一筆幾號、幾股、多少錢買的，得到
                                      <span className="text-on-surface font-semibold">
                                        「自訂沖銷帳」
                                      </span>
                                      逐筆輸入，或用那一頁的「從自選股匯入」把這一檔的部位先搬過去當起點。
                                    </p>
                                  )}
                                  {lots && lots.lots.length > 0 && (
                                    <>
                                      <table className="w-full border-collapse">
                                        <thead>
                                          <tr>
                                            <th className={`${headCell} text-left`}>成交日</th>
                                            <th className={`${headCell} text-left`}>帳戶</th>
                                            <th className={`${headCell} text-right`}>股數</th>
                                            <th className={`${headCell} text-right`}>買價</th>
                                            <th className={`${headCell} text-right`}>手續費</th>
                                            <th className={`${headCell} text-right`}>每股成本</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-outline-variant/50">
                                          {lots.lots.map((lot) => (
                                            <tr key={lot.id}>
                                              <td className="p-2 py-2 font-body-sm text-body-sm text-on-surface whitespace-nowrap">
                                                {lot.trade_date}
                                              </td>
                                              <td className="p-2 py-2 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                                                {lot.account || DASH}
                                              </td>
                                              <td
                                                className={`${numberCell} text-on-surface-variant`}
                                              >
                                                {formatNumber(lot.shares)}
                                              </td>
                                              <td
                                                className={`${numberCell} text-on-surface-variant`}
                                              >
                                                {formatPrice(lot.price)}
                                              </td>
                                              <td
                                                className={`${numberCell} text-on-surface-variant`}
                                              >
                                                {formatNumber(lot.fee)}
                                              </td>
                                              <td className={`${numberCell} text-on-surface`}>
                                                {formatPrice(lot.unit_cost)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                                        這是自訂沖銷帳的紀錄，
                                        <span className="text-on-surface font-semibold">
                                          跟上面那一列的股數各記各的、不會自動同步
                                        </span>
                                        ——兩邊對不上就是有一邊沒維護。每股成本已含買進手續費。
                                      </p>
                                    </>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              比重的分母是所有算得出市值的部位，跟上面合計的涵蓋範圍不一定相同——
              只缺成本的部位仍然佔著倉，不該從分布裡消失。金額以「億／萬」縮寫顯示。
            </p>
          </>
        )}

        {/*
          觀察中的檔列在最後而不是混進上面的表：它們沒有部位，市值、損益、比重全部算不出來，
          混在一起只會讓整張表看起來半殘。放這裡的用途是「一鍵把它變成持股」。
        */}
        {!loading && !error && watchOnlyRows.length > 0 && (
          <section className="flex flex-col gap-stack-md">
            <h2 className="font-headline-md text-headline-md text-primary">觀察中（尚未建立部位）</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              在自選股清單裡但沒填股數的 {watchOnlyRows.length} 檔。它們不計入上面的持股與合計。
              按「建立部位」填入股數與成本，這一筆就會移到上面的持股表。
            </p>

            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className={`${headCell} pl-4 text-left`}>股號 / 名稱</th>
                    <th className={`${headCell} text-left`}>帳戶</th>
                    <th className={`${headCell} text-right`}>股數</th>
                    <th className={`${headCell} text-right`}>成本</th>
                    <th className={`${headCell} text-right`}>現價</th>
                    <th className={`${headCell} text-right`}>報酬率</th>
                    <th className={`${headCell} pr-4 text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {watchOnlyRows.map((row) => {
                    const editing = editingId === row.id;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSymbol(row.symbol)}
                        title="點擊設為目前選取的股票"
                        className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                      >
                        {symbolCell(row, 1)}
                        <td className="p-2 py-3 font-body-md text-body-md text-on-surface-variant">
                          {editing ? (
                            <input
                              value={editAccount}
                              onChange={(event) => setEditAccount(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              placeholder="帳戶"
                              className={`${editFieldClass} text-left`}
                            />
                          ) : (
                            row.account || <span className="text-outline">未指定</span>
                          )}
                        </td>
                        <td className={`${numberCell} text-on-surface-variant`}>
                          {editing ? (
                            <input
                              value={editShares}
                              onChange={(event) => setEditShares(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              inputMode="numeric"
                              placeholder="股數"
                              className={editFieldClass}
                            />
                          ) : (
                            DASH
                          )}
                        </td>
                        <td className={`${numberCell} text-on-surface-variant`}>
                          {editing ? (
                            <input
                              value={editCost}
                              onChange={(event) => setEditCost(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              inputMode="decimal"
                              placeholder="留空=未知"
                              className={editFieldClass}
                            />
                          ) : (
                            formatPrice(row.cost)
                          )}
                        </td>
                        <td className={`${numberCell} text-on-surface`}>{formatPrice(row.price)}</td>
                        <td className={`${numberCell} ${quoteColor(row.profitPercent)}`}>
                          {formatSignedPercent(row.profitPercent)}
                        </td>
                        <td
                          className="p-2 pr-4 py-3 text-right whitespace-nowrap"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {editing ? (
                            <span className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => saveEdit(row)}
                                disabled={busy}
                                className="px-2 py-1 rounded bg-primary text-on-primary font-body-sm text-body-sm hover:bg-primary-container transition-colors disabled:opacity-50"
                              >
                                {busy ? '儲存中…' : '儲存'}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={busy}
                                className="px-2 py-1 rounded border border-outline-variant text-on-surface-variant font-body-sm text-body-sm hover:bg-surface-container transition-colors disabled:opacity-50"
                              >
                                取消
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              title="填入股數與成本，讓它成為持股"
                              className="px-2 py-1 rounded border border-outline-variant text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors"
                            >
                              建立部位
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
