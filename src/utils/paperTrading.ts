// 模擬買賣（紙上交易）的狀態與算式。
//
// 為什麼整包放前端、存 localStorage：後端沒有下單、現金或委託的概念，
// 為了一個練習功能在那邊開一張新表與一組端點不划算。代價是換一台電腦或
// 清掉瀏覽器資料就會歸零，畫面上要講清楚，不要讓人以為這是真的帳戶。
//
// 這裡的費率是台股的公開規則，不是這個專案自己定的估值假設：
// 手續費 0.1425%（買賣都收，多數券商有折扣，最低 20 元），
// 證券交易稅 0.3%（只有賣出收）。兩者都可以在畫面上調整。

/** localStorage 的鍵。改這個等於讓既有的模擬紀錄消失，不要隨意動。 */
export const PAPER_STORAGE_KEY = 'stock:paperTrading';

/** 手續費率。券商公告的標準費率。 */
export const BROKER_FEE_RATE = 0.001425;
/** 手續費最低收費（元）。小額交易佔比會很高，不能只算比例。 */
export const BROKER_FEE_MINIMUM = 20;
/** 證券交易稅率，只有賣出收。 */
export const TRANSACTION_TAX_RATE = 0.003;

export type TradeSide = 'BUY' | 'SELL';

export interface PaperTrade {
  /** 用時間戳當 id，同一毫秒內不會有第二筆手動交易。 */
  id: string;
  /** 成交時間，RFC3339。 */
  at: string;
  side: TradeSide;
  symbol: string;
  name: string;
  shares: number;
  price: number;
  /** 股數 × 價格，未含費用。 */
  amount: number;
  fee: number;
  /** 證交稅，買進是 0。 */
  tax: number;
  /** 現金實際變動：買進為負（含費用），賣出為正（扣掉費用與稅）。 */
  cashDelta: number;
  /** 這一筆賣出實現的損益。買進固定是 null——買進不會實現損益，0 是另一個意思。 */
  realized: number | null;
}

export interface PaperPosition {
  symbol: string;
  name: string;
  shares: number;
  /**
   * 每股平均成本，已把買進手續費攤進去。
   *
   * 用移動加權平均而不是先進先出：台股個人記帳普遍用平均成本，
   * 而且 FIFO 要保留每一筆買進的批次，狀態會複雜好幾倍。
   */
  avgCost: number;
}

export interface PaperState {
  /** 起始資金，用來算總報酬率。 */
  initialCash: number;
  /** 目前現金。 */
  cash: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  /** 手續費折數（0.1 ~ 1）。1 代表不打折。 */
  feeDiscount: number;
}

export const DEFAULT_INITIAL_CASH = 1000000;

export function emptyState(initialCash = DEFAULT_INITIAL_CASH): PaperState {
  return {
    initialCash,
    cash: initialCash,
    positions: [],
    trades: [],
    feeDiscount: 1,
  };
}

/** 手續費。無條件捨去到整數元，並套用最低收費，跟券商實務一致。 */
export function brokerFee(amount: number, discount: number): number {
  const raw = Math.floor(amount * BROKER_FEE_RATE * discount);
  return Math.max(raw, BROKER_FEE_MINIMUM);
}

/** 證券交易稅，只有賣出收。無條件捨去到整數元。 */
export function transactionTax(amount: number, side: TradeSide): number {
  return side === 'SELL' ? Math.floor(amount * TRANSACTION_TAX_RATE) : 0;
}

export interface TradeRequest {
  side: TradeSide;
  symbol: string;
  name: string;
  shares: number;
  price: number;
  /** 成交時間，由呼叫端給——這一層不碰時鐘，測試才好寫。 */
  at: string;
}

export interface TradeOutcome {
  state: PaperState;
  trade: PaperTrade;
}

/**
 * 送出一筆模擬交易，回傳新的狀態。
 *
 * 不合法的請求丟 Error 而不是默默調整數量：現金不夠卻幫忙買少一點、
 * 股數不足卻幫忙全賣，都會讓使用者以為自己下的單成交了。
 */
export function applyTrade(state: PaperState, req: TradeRequest): TradeOutcome {
  if (!Number.isFinite(req.shares) || req.shares <= 0) {
    throw new Error('股數要大於 0');
  }
  if (!Number.isFinite(req.price) || req.price <= 0) {
    throw new Error('價格要大於 0');
  }

  const amount = req.shares * req.price;
  const fee = brokerFee(amount, state.feeDiscount);
  const tax = transactionTax(amount, req.side);
  const positions = state.positions.map((p) => ({ ...p }));
  const index = positions.findIndex((p) => p.symbol === req.symbol);

  let cashDelta: number;
  let realized: number | null = null;

  if (req.side === 'BUY') {
    cashDelta = -(amount + fee);
    if (state.cash + cashDelta < 0) {
      throw new Error('現金不足，這一筆買不下去');
    }
    if (index >= 0) {
      const held = positions[index];
      // 買進手續費攤進成本：實際付出的是「價金 + 手續費」，
      // 不攤進去的話損益會虛胖一個手續費。
      const totalCost = held.avgCost * held.shares + amount + fee;
      const totalShares = held.shares + req.shares;
      positions[index] = {
        ...held,
        name: req.name || held.name,
        shares: totalShares,
        avgCost: totalCost / totalShares,
      };
    } else {
      positions.push({
        symbol: req.symbol,
        name: req.name,
        shares: req.shares,
        avgCost: (amount + fee) / req.shares,
      });
    }
  } else {
    if (index < 0 || positions[index].shares < req.shares) {
      throw new Error('持股不足，不能賣超過手上的股數');
    }
    cashDelta = amount - fee - tax;
    // 實現損益＝賣出淨收入 − 這些股數的平均成本。
    realized = cashDelta - positions[index].avgCost * req.shares;
    const remaining = positions[index].shares - req.shares;
    if (remaining === 0) {
      positions.splice(index, 1);
    } else {
      positions[index] = { ...positions[index], shares: remaining };
    }
  }

  const trade: PaperTrade = {
    id: req.at,
    at: req.at,
    side: req.side,
    symbol: req.symbol,
    name: req.name,
    shares: req.shares,
    price: req.price,
    amount,
    fee,
    tax,
    cashDelta,
    realized,
  };

  return {
    state: {
      ...state,
      cash: state.cash + cashDelta,
      positions,
      // 最新的排前面，跟站上其他歷史清單一致。
      trades: [trade, ...state.trades],
    },
    trade,
  };
}

/** 已實現損益合計。只加賣出那幾筆。 */
export function realizedTotal(trades: PaperTrade[]): number {
  return trades.reduce((sum, t) => sum + (t.realized ?? 0), 0);
}

/**
 * 從 localStorage 讀回狀態。
 *
 * 結構不合就整包丟掉重來，不要嘗試修補：這是練習用的資料，
 * 修補一個半殘的狀態算出來的損益比歸零更誤導人。
 */
export function loadState(): PaperState {
  try {
    const raw = localStorage.getItem(PAPER_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as PaperState;
    if (
      typeof parsed.cash !== 'number' ||
      typeof parsed.initialCash !== 'number' ||
      !Array.isArray(parsed.positions) ||
      !Array.isArray(parsed.trades)
    ) {
      return emptyState();
    }
    return { ...emptyState(parsed.initialCash), ...parsed };
  } catch {
    return emptyState();
  }
}

export function saveState(state: PaperState): void {
  try {
    localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隱私模式下 localStorage 會丟例外。存不了就算了，這一頁的資料本來就不保證留著，
    // 為了它把整頁弄壞不值得。
  }
}
