// 顯示格式化工具。
//
// 核心原則：後端大量欄位是 null，而 null 與 0 在金融資料裡差很多——
// 本益比 null 是「算不出來」（虧損），畫成 0 會被讀成「本益比 0 倍」。
// 所以所有格式化函式遇到 null / undefined / NaN 一律回破折號，不要在頁面各自寫 ?? 0。

/** 資料缺漏時的統一顯示。 */
export const DASH = '—';

function isBlank(value: number | null | undefined): value is null | undefined {
  return value == null || Number.isNaN(value);
}

/** 一般數字，預設不帶小數並加千分位。 */
export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (isBlank(value)) return DASH;
  return value.toLocaleString('zh-TW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 價格，台股慣例兩位小數。 */
export function formatPrice(value: number | null | undefined): string {
  return formatNumber(value, 2);
}

/** 百分比，回傳已含 % 的字串。後端百分比欄位單位已經是 %，不要再乘 100。 */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (isBlank(value)) return DASH;
  return `${formatNumber(value, digits)}%`;
}

/** 帶正負號的數字（漲跌、買賣超）。0 不加號。 */
export function formatSigned(value: number | null | undefined, digits = 2): string {
  if (isBlank(value)) return DASH;
  const text = formatNumber(Math.abs(value), digits);
  if (value > 0) return `+${text}`;
  if (value < 0) return `-${text}`;
  return text;
}

/** 帶正負號的百分比。 */
export function formatSignedPercent(value: number | null | undefined, digits = 2): string {
  if (isBlank(value)) return DASH;
  return `${formatSigned(value, digits)}%`;
}

/** 大額金額縮寫（元 → 億 / 萬）。大盤成交值動輒上千億，逐位顯示沒人讀得出來。 */
export function formatAmount(value: number | null | undefined): string {
  if (isBlank(value)) return DASH;
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${formatNumber(value / 1e8, 2)} 億`;
  if (abs >= 1e4) return `${formatNumber(value / 1e4, 1)} 萬`;
  return formatNumber(value);
}

/** 千元金額（月營收上游單位）縮寫成億 / 萬元。 */
export function formatThousandTWD(value: number | null | undefined): string {
  if (isBlank(value)) return DASH;
  return formatAmount(value * 1000);
}

/** 股數 → 張（1 張 = 1000 股）。三大法人買賣超上游單位是股。 */
export function formatShareToLot(value: number | null | undefined, digits = 0): string {
  if (isBlank(value)) return DASH;
  return formatNumber(value / 1000, digits);
}

/**
 * 漲跌對應的文字色。台股慣例漲紅跌綠。
 *
 * 用的是 quote-up / quote-down 這組漲跌專用色，而不是 error / secondary——
 * 那兩個角色同時也是「錯誤／警示」與「買入區間」，共用的話調漲跌色會改到不相干的地方。
 * 要換回設計稿的漲綠跌紅，把下面這一行的 up 與 down 對調；要調深淺則改
 * tailwind.config.js 裡那兩個色票，全站（含徽章、K 線的 K 棒與成交量、漲跌家數卡）跟著變。
 */
export function quoteColor(value: number | null | undefined): string {
  if (isBlank(value) || value === 0) return 'text-on-surface-variant';
  return value > 0 ? 'text-quote-up' : 'text-quote-down';
}

/** 漲跌用的膠囊徽章樣式（文字色 + 對應的淡底色）。 */
export function quoteBadge(value: number | null | undefined): string {
  if (isBlank(value) || value === 0) {
    return 'text-on-surface-variant bg-surface-container';
  }
  return value > 0
    ? 'text-quote-up bg-error-container/20'
    : 'text-quote-down bg-secondary-container/20';
}

/** RFC3339 / 帶時間的字串 → YYYY-MM-DD HH:MM。空字串維持破折號。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** 空字串的日期欄位（後端零值時會給空字串）統一顯示破折號。 */
export function formatDate(value: string | null | undefined): string {
  return value ? value : DASH;
}

/** 今天（台北時區）的 YYYY-MM-DD，給日期輸入框當上限用。 */
export function today(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

/** 幾天前的 YYYY-MM-DD，給預設查詢區間用。 */
export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

/** 市場別顯示文字。落地資料是 TWSE / TPEx，即時報價與自選股是 tse / otc。 */
export function marketLabel(market: string | null | undefined): string {
  switch ((market ?? '').toLowerCase()) {
    case 'twse':
    case 'tse':
      return '上市';
    case 'tpex':
    case 'otc':
      return '上櫃';
    default:
      return DASH;
  }
}

/** 現價來源顯示文字。不是 TRADE 就代表這不是本次快照的成交價，畫面要標示出來。 */
export function priceSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'TRADE':
      return '成交價';
    case 'MID':
      return '五檔中間價';
    case 'LAST_KNOWN':
      return '前次報價';
    case 'DELAYED':
      return '延遲報價';
    case 'PREVIOUS_CLOSE':
      return '昨收';
    default:
      return DASH;
  }
}
