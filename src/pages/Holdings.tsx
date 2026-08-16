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
import { getBrokerFees, getLedgerReport } from '../api/ledger';
import { apiErrorMessage } from '../api/request';
import { Holding, LedgerFees, LedgerLot, PortfolioRow } from '../api/types';
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
  today,
} from '../utils/format';

// 這一頁跟「自選股」的差別：那邊看的是行情與買入時機，這邊看的是部位。
//
// 版面是兩層：先照**帳戶**分組（部位散在不同券商，看總數看不出哪一個帳戶在賺），
// 組內再把**同一檔**併成一列，點開才看逐筆明細——就是券商 App（元大）的做法。
//
// 曾經刻意不併，理由是「併起來看不出哪一筆是哪個帳戶的，賣出時對不起來」。
// 那個顧慮針對的是跨帳戶合併；先分組之後組內合併就沒有這個問題，
// 而且展開的明細仍然是逐筆的，編輯與刪除也都對那些做。
// 跨帳戶**不併**，這一條沒有變。
//
// 合併列的成本是加權平均，且只要有任何一筆沒填成本就整檔顯示破折號——
// 拿有成本的那幾筆去平均，得到的是「部分部位的平均」卻掛在整檔上，比破折號更誤導。
//
// 之所以要打兩支 API：股數與成本只有 /portfolio/holdings 有，
// 現價只有 /portfolio/valuation 有——後端的試算結果沒有帶股數。
// 展開後的「買進明細」則來自 /ledger（自訂沖銷帳），唯讀，兩邊各記各的。

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
  /** 成交日 YYYY-MM-DD。空字串代表不知道（舊資料與從 LINE 加進來的都沒有）。 */
  tradeDate: string;
  price: number | null;
  priceSource: string;
  /** 取價失敗的原因，成功時是空字串。 */
  error: string;

  /** 市值與損益金額要股數才算得出來；報酬率不用。 */
  marketValue: number | null;
  costValue: number | null;
  profit: number | null;
  profitPercent: number | null;

  /** 一股損益＝現價 − 成本。決定要認賠幾股時看這個，不必自己除。 */
  perShare: number | null;
  /** 現在全部賣掉會被扣的賣出手續費與證交稅。買進手續費已經含在成本裡，不重複算。 */
  fees: { sell: number; tax: number } | null;
  /** 扣掉上面那些之後真正落袋的損益。 */
  netProfit: number | null;
  netProfitPercent: number | null;
}

function toPositionRows(
  holdings: Holding[],
  priceBySymbol: Map<string, PortfolioRow>,
  brokerFees: LedgerFees | null
): PositionRow[] {
  return holdings
    .map((h) => {
      const valuation = priceBySymbol.get(h.symbol);
      const price = valuation?.price ?? null;
      const marketValue = price != null && h.shares != null ? price * h.shares : null;
      const costValue = h.cost != null && h.shares != null ? h.cost * h.shares : null;

      // 費率還沒載回來、或算不出金額時一律 null，不要先用 0 頂著——
      // 0 元手續費會讓淨損益看起來剛好等於毛損益，那是假的。
      const breakdown =
        brokerFees != null && marketValue != null && costValue != null
          ? sellCost(marketValue, brokerFees)
          : null;
      const netProfit =
        breakdown != null && marketValue != null && costValue != null
          ? marketValue - costValue - breakdown.sell - breakdown.tax
          : null;

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
        tradeDate: h.trade_date,
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
        perShare: h.cost != null && price != null ? price - h.cost : null,
        fees: breakdown,
        netProfit,
        // 分母用成本，跟毛報酬率同一個基準，兩個數字才比得出「費用吃掉多少」。
        netProfitPercent:
          netProfit != null && costValue != null && costValue > 0
            ? (netProfit / costValue) * 100
            : null,
      };
    })
    .sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1));
}

/** 沒填帳戶時的顯示名稱。空字串與 null 都算同一組——兩者都是「沒指定」。 */
const NO_ACCOUNT = '未指定帳戶';

/**
 * 賣出時券商會扣掉的錢：手續費 + 證交稅。
 *
 * 費率一律由後端給（見 getBrokerFees），這裡只做「無條件捨去到整數元、
 * 套用最低收費」這段算術——那是券商實務，不是可調的政策。
 *
 * 買進手續費不在這裡，也不另外估：成本欄位存的是**含買進手續費的持有成本**，
 * 跟券商 App 的「持有成本」同一個定義。再扣一次會重複計算。
 *
 * 這也是為什麼賣出手續費用全額而不打折——實測元大的損益就是這樣算的：
 * 買進手續費是已經發生的事實（記在成本裡），賣出手續費是還沒發生的估計，
 * 它保守地用牌價估。折數要調就調後端的 BROKER_FEE_DISCOUNT。
 */
function sellCost(amount: number, fees: LedgerFees): { sell: number; tax: number } {
  return {
    sell: Math.max(Math.floor(amount * fees.rate * fees.discount), fees.minimum),
    tax: Math.floor(amount * fees.tax_rate),
  };
}

/**
 * 從成交日到今天幾天。沒填成交日回 null，呼叫端顯示破折號。
 *
 * 用日曆天而不是交易日：交易日要有行事曆（後端也沒有），而「持有多久」
 * 這個問題本來就是問日曆天。以台北時區的日界為準，跟成交日同一個基準。
 */
function holdingDays(tradeDate: string): string | null {
  if (!tradeDate) return null;
  const from = new Date(`${tradeDate}T00:00:00+08:00`);
  if (Number.isNaN(from.getTime())) return null;
  const to = new Date(`${today()}T00:00:00+08:00`);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000);
  // 補登未來日期時會是負數，那是輸入錯誤，直接照實顯示比藏起來好。
  return `${days} 天`;
}

/**
 * 同一個帳戶裡同一檔的合併結果，也就是表上實際看到的那一列。
 *
 * 為什麼要併：券商 App（元大）就是一檔一列，點進去才看明細。分批買同一檔會產生
 * 好幾列部位，攤在表上會讓「我到底有多少張台積電」要自己心算。
 *
 * 只在**同一個帳戶內**併。跨帳戶併起來就看不出哪一筆是哪個帳戶的，賣出時對不起來——
 * 這也是這一頁原本刻意不併的理由；先照帳戶分組之後，組內合併才變得安全。
 */
interface SymbolRow {
  key: string;
  symbol: string;
  name: string;
  market: string;
  account: string;
  /** 併進來的那幾筆部位，展開時逐筆顯示，編輯與刪除都對這些做。 */
  positions: PositionRow[];
  /** 這一檔在這個帳戶的總股數。 */
  shares: number;
  /**
   * 加權平均成本。
   *
   * 只要有任何一筆沒填成本就是 null——拿有成本的那幾筆去平均，得到的是
   * 「部分部位的平均」卻掛在整檔上，比顯示破折號更誤導人。
   */
  cost: number | null;
  price: number | null;
  priceSource: string;
  /** 取價失敗的原因，成功時是空字串。 */
  error: string;
  /** 這一檔在這個帳戶的每一筆都停用了。 */
  disabled: boolean;

  marketValue: number | null;
  costValue: number | null;
  profit: number | null;
  profitPercent: number | null;
}

/** 把同一個帳戶裡同一檔的部位併成一列。順序沿用市值由大到小。 */
function mergeBySymbol(rows: PositionRow[], account: string): SymbolRow[] {
  const bySymbol = new Map<string, PositionRow[]>();
  for (const row of rows) {
    const list = bySymbol.get(row.symbol) ?? [];
    list.push(row);
    bySymbol.set(row.symbol, list);
  }

  return Array.from(bySymbol, ([symbol, positions]) => {
    const first = positions[0];
    const shares = positions.reduce((sum, p) => sum + (p.shares ?? 0), 0);
    // 有任何一筆缺成本，整檔的成本與損益就算不出來（見 SymbolRow.cost 的說明）。
    const allCosted = positions.every((p) => p.cost != null);
    const costValue = allCosted
      ? positions.reduce((sum, p) => sum + (p.cost as number) * (p.shares ?? 0), 0)
      : null;
    const price = first.price;
    const marketValue = price != null ? price * shares : null;
    const cost = costValue != null && shares > 0 ? costValue / shares : null;
    return {
      key: `${account}::${symbol}`,
      symbol,
      name: first.name,
      market: first.market,
      account,
      // 組內也照市值排，讓展開後的順序跟外面一致。
      positions: [...positions].sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1)),
      shares,
      cost,
      price,
      priceSource: first.priceSource,
      error: first.error,
      disabled: positions.every((p) => p.disabled),
      marketValue,
      costValue,
      profit: marketValue != null && costValue != null ? marketValue - costValue : null,
      profitPercent:
        cost != null && cost !== 0 && price != null ? ((price - cost) / cost) * 100 : null,
    };
  }).sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1));
}

/** 一個帳戶的小計。欄位語意與全站合計一致，只是範圍縮到單一帳戶。 */
interface AccountGroup {
  account: string;
  /** 合併後的列，也就是表上看到的。 */
  symbols: SymbolRow[];
  /** 這個帳戶底下的原始部位筆數，用來說明「3 檔 / 4 筆」。 */
  positionCount: number;
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
    const symbols = mergeBySymbol(list, account);
    // 小計從「合併後的列」算，不是從原始部位算：表上看得到的幾列加起來
    // 必須等於這裡的小計，否則使用者拿計算機一加就對不上。
    //
    // 只累加三個值都齊的那幾列——市值算 A 群、成本算 B 群的話，
    // 相減得到的損益不對應任何真實部位。
    const complete = symbols.filter((s) => s.marketValue != null && s.costValue != null);
    const marketValue = complete.reduce((sum, s) => sum + (s.marketValue as number), 0);
    const costValue = complete.reduce((sum, s) => sum + (s.costValue as number), 0);
    // 比重的分母比可完整計算的那群寬，用「有市值」的：
    // 只差成本的部位仍然佔著倉，不該從分布裡消失。
    const groupMarketValue = symbols.reduce((sum, s) => sum + (s.marketValue ?? 0), 0);
    return {
      account,
      symbols,
      positionCount: list.length,
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
  // 費率來自後端，前端不寫死。載不回來時淨損益顯示破折號而不是退回毛損益。
  const brokerFees = useAsyncData(() => getBrokerFees(), []);

  const [editingId, setEditingId] = useState('');
  const [editShares, setEditShares] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editAccount, setEditAccount] = useState('');
  const [editTradeDate, setEditTradeDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // 新增一筆部位的表單。
  const [newSymbol, setNewSymbol] = useState('');
  const [newShares, setNewShares] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [newTradeDate, setNewTradeDate] = useState('');

  const allRows = useMemo(() => {
    const priceBySymbol = new Map<string, PortfolioRow>();
    // 同一檔在試算結果裡也有多列（一列對一筆部位），價格都一樣，取第一列即可。
    for (const row of valuation.data ?? []) {
      if (!priceBySymbol.has(row.symbol)) priceBySymbol.set(row.symbol, row);
    }
    return toPositionRows(holdings.data ?? [], priceBySymbol, brokerFees.data ?? null);
  }, [holdings.data, valuation.data, brokerFees.data]);

  // 有填股數的才算持股，沒填的只是放著觀察。
  // 後端只有一張表，自選與持股混在一起，沒有「是不是持股」的欄位，
  // 股數是唯一可用而且語意剛好正確的判準。
  const rows = useMemo(() => allRows.filter((row) => row.shares != null), [allRows]);
  const watchOnlyRows = useMemo(() => allRows.filter((row) => row.shares == null), [allRows]);

  // 比重的分母。合併不影響它——一檔的市值就是它各筆部位市值的和。
  const weightBase = useMemo(
    () => rows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0),
    [rows]
  );

  const groups = useMemo(() => groupByAccount(rows, weightBase), [rows, weightBase]);

  /**
   * 全站合計，從各帳戶的小計加起來。
   *
   * 不另外從原始部位算一次：那樣算出來的數字在邊界情況（同一檔有一筆有成本、
   * 一筆沒有）會跟畫面上幾列的加總對不上，而使用者一定會拿計算機驗。
   */
  const totals = useMemo(() => {
    const marketValue = groups.reduce((sum, g) => sum + g.marketValue, 0);
    const costValue = groups.reduce((sum, g) => sum + g.costValue, 0);
    return {
      counted: groups.reduce((sum, g) => sum + g.counted, 0),
      /** 合併後的列數（幾檔），跟部位筆數不同。 */
      symbolCount: groups.reduce((sum, g) => sum + g.symbols.length, 0),
      marketValue,
      costValue,
      profit: marketValue - costValue,
      profitPercent: costValue > 0 ? ((marketValue - costValue) / costValue) * 100 : null,
      weightBase,
    };
  }, [groups, weightBase]);

  /**
   * 展開某一列時去撈那一檔的沖銷帳買進明細。
   *
   * 持股表一列只有「目前股數與平均成本」，沒有逐筆買進紀錄——那些在沖銷帳
   * （ledger_lots）裡，是另一張刻意獨立的表。這裡只讀不寫，兩邊的數字各記各的：
   * 沖銷帳的剩餘不會等於這一列的股數，除非兩邊都有好好維護。
   *
   * 一檔一個 key 快取，收合再展開不重打；換頁重進才會重抓。
   */
  // 展開狀態用「帳戶::代號」當 key，跟合併後那一列一致。
  // 用部位 id 的話，同一檔的兩筆部位會各自被當成可展開的目標。
  const [expandedKey, setExpandedKey] = useState('');
  const [lotsBySymbolCache, setLotsBySymbolCache] = useState<
    Record<string, { loading: boolean; error: string; lots: LedgerLot[] }>
  >({});

  const toggleExpand = (row: { key: string; symbol: string }) => {
    if (expandedKey === row.key) {
      setExpandedKey('');
      return;
    }
    setExpandedKey(row.key);
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
    setEditTradeDate(row.tradeDate);
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
      await updateHoldingPosition(row.id, cost, shares, editAccount.trim(), editTradeDate.trim());
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
      await addPosition(symbol, cost, shares, newAccount.trim(), newTradeDate.trim());
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
        subtitle="依帳戶分組，同一檔併成一列；展開看逐筆部位與買進明細。"
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
          <div className="flex flex-col gap-1">
            <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              成交日
            </label>
            {/* 不預填今天：留空代表「不知道」，預填會讓人以為系統知道你哪天買的。 */}
            <input
              value={newTradeDate}
              onChange={(event) => setNewTradeDate(event.target.value)}
              type="date"
              max={today()}
              className={`${formFieldClass} w-40`}
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
                hint={`元，涵蓋 ${totals.counted} / ${totals.symbolCount} 檔`}
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

            {totals.counted < totals.symbolCount && (
              <p className="font-body-sm text-body-sm text-on-surface-variant bg-surface-container border border-outline-variant rounded px-3 py-2">
                有 {totals.symbolCount - totals.counted} 檔因為缺成本或取不到現價而沒有納入上面的合計，
                在下表中對應欄位顯示破折號。一檔只要有任何一筆部位沒填成本，整檔就算不出成本與損益——
                展開那一列就看得出是哪一筆缺。
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
                            {group.counted < group.symbols.length
                              ? `${group.counted} / ${group.symbols.length}`
                              : formatNumber(group.symbols.length)}
                            {group.positionCount > group.symbols.length && (
                              <span className="block font-body-sm text-body-sm text-outline">
                                {group.positionCount} 筆部位
                              </span>
                            )}
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
                          {totals.counted < totals.symbolCount
                            ? `${totals.counted} / ${totals.symbolCount}`
                            : formatNumber(totals.symbolCount)}
                          {rows.length > totals.symbolCount && (
                            <span className="block font-body-sm text-body-sm text-outline">
                              {rows.length} 筆部位
                            </span>
                          )}
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
                            {group.symbols.length} 檔
                            {group.positionCount > group.symbols.length &&
                              `／${group.positionCount} 筆部位`}
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
                      {group.symbols.map((item) => {
                        const weight =
                          item.marketValue != null && totals.weightBase > 0
                            ? (item.marketValue / totals.weightBase) * 100
                            : null;
                        const expanded = expandedKey === item.key;
                        const lots = lotsBySymbolCache[item.symbol];
                        const split = item.positions.length > 1;
                        return (
                          <Fragment key={item.key}>
                            <tr
                              onClick={() => setSymbol(item.symbol)}
                              title="點擊設為目前選取的股票"
                              className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                            >
                              <td className="p-2 pl-4 py-3">
                                <div className="flex flex-col">
                                  <span className="font-data-md text-data-md text-primary font-bold">
                                    {item.symbol}
                                  </span>
                                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                                    {item.name}
                                    <span className="text-outline">
                                      {' '}
                                      · {marketLabel(item.market)}
                                    </span>
                                  </span>
                                  {item.error && (
                                    <span
                                      className="font-body-sm text-body-sm text-error"
                                      title={item.error}
                                    >
                                      取價失敗
                                    </span>
                                  )}
                                  {item.disabled && (
                                    <span className="font-body-sm text-body-sm text-outline">
                                      已停用，不納入試算
                                    </span>
                                  )}
                                  {/* 分批買的才提示，一筆的不用——多一行雜訊。 */}
                                  {split && (
                                    <span className="font-body-sm text-body-sm text-outline">
                                      {item.positions.length} 筆分批買進，展開看明細
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="p-2 py-3 font-body-md text-body-md text-on-surface-variant">
                                {item.account === NO_ACCOUNT ? (
                                  <span className="text-outline">未指定</span>
                                ) : (
                                  item.account
                                )}
                              </td>

                              <td className={`${numberCell} text-on-surface-variant`}>
                                {formatNumber(item.shares)}
                              </td>
                              <td className={`${numberCell} text-on-surface-variant`}>
                                {formatPrice(item.cost)}
                                {/* 併起來的成本是加權平均，標一下免得被當成某一筆的買價。 */}
                                {split && item.cost != null && (
                                  <span className="block font-body-sm text-body-sm text-outline">
                                    加權平均
                                  </span>
                                )}
                              </td>
                              <td className={`${numberCell} text-on-surface`}>
                                {formatPrice(item.price)}
                                <span className="block font-body-sm text-body-sm text-outline">
                                  {item.price == null ? '' : priceSourceLabel(item.priceSource)}
                                </span>
                              </td>
                              <td className={`${numberCell} text-on-surface font-bold`}>
                                {item.marketValue == null ? DASH : formatAmount(item.marketValue)}
                              </td>
                              <td className={`${numberCell} ${quoteColor(item.profit)}`}>
                                {item.profit == null ? DASH : formatSigned(item.profit, 0)}
                              </td>
                              <td className={`${numberCell} ${quoteColor(item.profitPercent)}`}>
                                {formatSignedPercent(item.profitPercent)}
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
                                {/*
                                  編輯與刪除移到展開後的明細裡：那些動作是對「某一筆部位」做的，
                                  掛在合併列上會讓人不知道按下去會改到哪一筆。
                                */}
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(item)}
                                  title={expanded ? '收合明細' : '展開股票明細'}
                                  className="p-1 rounded text-outline hover:text-primary hover:bg-surface-container transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[20px]">
                                    {expanded ? 'expand_less' : 'expand_more'}
                                  </span>
                                </button>
                              </td>
                            </tr>

                            {expanded && (
                              <tr className="bg-surface-container-low/40">
                                <td colSpan={10} className="p-4">
                                  <div className="flex flex-col gap-stack-md">
                                    {/* ── 這一檔的各筆部位 ── */}
                                    <div>
                                      <p className="font-label-caps text-label-caps uppercase text-primary mb-2">
                                        {item.symbol} 在「
                                        {item.account === NO_ACCOUNT ? '未指定帳戶' : item.account}
                                        」的 {item.positions.length} 筆部位（依成交日與市值）
                                      </p>
                                      <div className="overflow-x-auto">
                                      <table className="w-full border-collapse">
                                        <thead>
                                          <tr>
                                            <th className={`${headCell} text-left`}>成交日</th>
                                            <th className={`${headCell} text-right`}>持有</th>
                                            <th className={`${headCell} text-right`}>股數</th>
                                            <th className={`${headCell} text-right`}>成本</th>
                                            <th className={`${headCell} text-right`}>一股損益</th>
                                            <th className={`${headCell} text-right`}>市值</th>
                                            <th className={`${headCell} text-right`}>未實現損益</th>
                                            <th className={`${headCell} text-right`}>報酬率</th>
                                            <th className={`${headCell} text-right`}>賣出費用</th>
                                            <th className={`${headCell} text-right`}>淨損益</th>
                                            <th className={`${headCell} text-right`}>淨報酬率</th>
                                            <th className={`${headCell} text-left`}>帳戶</th>
                                            <th className={`${headCell} text-right`}>操作</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-outline-variant/50">
                                          {item.positions.map((row) => {
                                            const editing = editingId === row.id;
                                            return (
                                              <tr key={row.id}>
                                                <td className="p-2 py-2 font-body-sm text-body-sm text-on-surface whitespace-nowrap">
                                                  {editing ? (
                                                    <input
                                                      value={editTradeDate}
                                                      onChange={(event) =>
                                                        setEditTradeDate(event.target.value)
                                                      }
                                                      type="date"
                                                      max={today()}
                                                      className={`${editFieldClass} w-36 text-left`}
                                                    />
                                                  ) : (
                                                    row.tradeDate || (
                                                      <span className="text-outline">未填</span>
                                                    )
                                                  )}
                                                </td>
                                                <td
                                                  className={`${numberCell} text-on-surface-variant`}
                                                >
                                                  {holdingDays(row.tradeDate) ?? DASH}
                                                </td>
                                                <td
                                                  className={`${numberCell} text-on-surface-variant`}
                                                >
                                                  {editing ? (
                                                    <input
                                                      value={editShares}
                                                      onChange={(event) =>
                                                        setEditShares(event.target.value)
                                                      }
                                                      inputMode="numeric"
                                                      className={editFieldClass}
                                                    />
                                                  ) : (
                                                    formatNumber(row.shares)
                                                  )}
                                                </td>
                                                <td
                                                  className={`${numberCell} text-on-surface-variant`}
                                                >
                                                  {editing ? (
                                                    <input
                                                      value={editCost}
                                                      onChange={(event) =>
                                                        setEditCost(event.target.value)
                                                      }
                                                      inputMode="decimal"
                                                      placeholder="留空=未知"
                                                      className={editFieldClass}
                                                    />
                                                  ) : (
                                                    formatPrice(row.cost)
                                                  )}
                                                </td>
                                                <td
                                                  className={`${numberCell} ${quoteColor(
                                                    row.perShare
                                                  )}`}
                                                  title="現價 − 成本，決定要認賠幾股時看這個"
                                                >
                                                  {row.perShare == null
                                                    ? DASH
                                                    : formatSigned(row.perShare, 2)}
                                                </td>
                                                <td className={`${numberCell} text-on-surface`}>
                                                  {row.marketValue == null
                                                    ? DASH
                                                    : formatAmount(row.marketValue)}
                                                </td>
                                                <td
                                                  className={`${numberCell} ${quoteColor(
                                                    row.profit
                                                  )}`}
                                                >
                                                  {row.profit == null
                                                    ? DASH
                                                    : formatSigned(row.profit, 0)}
                                                </td>
                                                <td
                                                  className={`${numberCell} ${quoteColor(
                                                    row.profitPercent
                                                  )}`}
                                                >
                                                  {formatSignedPercent(row.profitPercent)}
                                                </td>
                                                <td
                                                  className={`${numberCell} text-on-surface-variant`}
                                                  title={
                                                    row.fees == null
                                                      ? undefined
                                                      : `賣出手續費 ${formatNumber(
                                                          row.fees.sell
                                                        )}＋證交稅 ${formatNumber(row.fees.tax)}`
                                                  }
                                                >
                                                  {row.fees == null
                                                    ? DASH
                                                    : `-${formatNumber(row.fees.sell + row.fees.tax)}`}
                                                </td>
                                                <td
                                                  className={`${numberCell} font-bold ${quoteColor(
                                                    row.netProfit
                                                  )}`}
                                                >
                                                  {row.netProfit == null
                                                    ? DASH
                                                    : formatSigned(row.netProfit, 0)}
                                                </td>
                                                <td
                                                  className={`${numberCell} ${quoteColor(
                                                    row.netProfitPercent
                                                  )}`}
                                                >
                                                  {formatSignedPercent(row.netProfitPercent)}
                                                </td>
                                                <td className="p-2 py-2 font-body-sm text-body-sm text-on-surface-variant">
                                                  {editing ? (
                                                    <input
                                                      value={editAccount}
                                                      onChange={(event) =>
                                                        setEditAccount(event.target.value)
                                                      }
                                                      placeholder="帳戶"
                                                      className={`${editFieldClass} text-left`}
                                                    />
                                                  ) : (
                                                    row.account || (
                                                      <span className="text-outline">未指定</span>
                                                    )
                                                  )}
                                                </td>
                                                <td className="p-2 py-2 text-right whitespace-nowrap">
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
                                                        <span className="material-symbols-outlined text-[20px]">
                                                          close
                                                        </span>
                                                      </button>
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex gap-1">
                                                      <button
                                                        type="button"
                                                        onClick={() => startEdit(row)}
                                                        title="編輯這一筆部位"
                                                        className="p-1 rounded text-outline hover:text-primary hover:bg-surface-container transition-colors"
                                                      >
                                                        <span className="material-symbols-outlined text-[20px]">
                                                          edit
                                                        </span>
                                                      </button>
                                                      {/* 只刪這一筆，同一檔的其他筆不受影響。 */}
                                                      <button
                                                        type="button"
                                                        onClick={() => handleRemove(row)}
                                                        disabled={busy}
                                                        title="刪除這一筆部位"
                                                        className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors disabled:opacity-50"
                                                      >
                                                        <span className="material-symbols-outlined text-[20px]">
                                                          delete
                                                        </span>
                                                      </button>
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                      </div>
                                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                                        <span className="text-on-surface font-semibold">一股損益</span>
                                        ＝現價 − 成本，要決定認賠幾股時直接乘股數就好。
                                        <span className="text-on-surface font-semibold">淨損益</span>
                                        ＝市值 − 持有成本 − 賣出手續費 − 證交稅，也就是現在全部賣掉真正落袋的金額，
                                        算法與券商 App 一致；滑到「賣出費用」上看得到兩項拆解。
                                        <span className="text-on-surface font-semibold">
                                          成本欄請填含買進手續費的持有成本
                                        </span>
                                        ——買進手續費已經付掉了，含在成本裡，這裡不再扣第二次。
                                        {brokerFees.data && (
                                          <>
                                            {' '}
                                            費率用手續費 {(brokerFees.data.rate * 100).toFixed(4)}%
                                            {brokerFees.data.discount !== 1 &&
                                              `（${(brokerFees.data.discount * 10).toFixed(2)} 折）`}
                                            、最低 {formatNumber(brokerFees.data.minimum)} 元、
                                            證交稅 {(brokerFees.data.tax_rate * 100).toFixed(1)}%。
                                            賣出手續費刻意用牌價不打折——那是還沒發生的估計，
                                            實測元大也是這樣算的。要調在後端 .env.json 的 BROKER_FEE_DISCOUNT。
                                          </>
                                        )}
                                        {brokerFees.error && (
                                          <span className="text-error"> 費率載入失敗，淨損益顯示破折號。</span>
                                        )}
                                      </p>
                                      {item.cost == null && (
                                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                                          上面那一列的成本與損益是破折號，因為這幾筆裡有沒填成本的——
                                          加權平均少算一筆就不是這一檔真正的成本了。補齊就會算出來。
                                        </p>
                                      )}
                                    </div>

                                    {/* ── 沖銷帳的逐筆買進 ── */}
                                    <div>
                                      <p className="font-label-caps text-label-caps uppercase text-primary mb-2">
                                        買進明細（自訂沖銷帳）
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
                                      {lots &&
                                        !lots.loading &&
                                        !lots.error &&
                                        lots.lots.length === 0 && (
                                          <p className="font-body-sm text-body-sm text-on-surface-variant">
                                            這一檔在沖銷帳裡還沒有任何買進紀錄。上面那張表是「目前部位」，
                                            沒有成交日與手續費；要逐筆記錄幾號、幾股、多少錢買的，
                                            到
                                            <span className="text-on-surface font-semibold">
                                              「自訂沖銷帳」
                                            </span>
                                            輸入，或用那一頁的「從自選股匯入」把這一檔先搬過去當起點。
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
                                                <th className={`${headCell} text-right`}>
                                                  每股成本
                                                </th>
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
                                              跟上面的部位各記各的、不會自動同步
                                            </span>
                                            ——兩邊對不上就是有一邊沒維護。每股成本已含買進手續費。
                                          </p>
                                        </>
                                      )}
                                    </div>
                                  </div>
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
