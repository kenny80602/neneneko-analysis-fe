import { PortfolioRow, PriceSource } from '../api/types';

interface LineMessagePreviewProps {
  rows: PortfolioRow[];
  /** 回檔達這個百分比在訊息裡會轉紅。 */
  pullbackAlert: number;
  /** 本益比達這個值在訊息裡會轉紅。 */
  peAlert: number;
}

// 這一塊刻意不用設計系統的語意色，改用後端 Flex 訊息裡寫死的那三個色碼
// （internal/service/portfolio/flex.go 的 colorLabel／colorAlert／colorBuy）。
// 預覽的重點是「LINE 上會長怎樣」，套本站的色票只會讓預覽跟實際訊息對不起來。
const FLEX_LABEL = '#999999';
const FLEX_ALERT = '#D32F2F';
const FLEX_BUY = '#00A63E';
// LINE 聊天室的底色與氣泡，同理照抄而不是用 surface token。
const LINE_BACKGROUND = '#8cabd0';

const DASH = '—';

// 現價來源的標記與圖例文字。跟 utils/format.ts 的 priceSourceLabel 是兩套：
// 那個是給本站畫面用的，這裡必須逐字對齊訊息裡的措辭。
const SOURCE_MARK: Record<PriceSource, string> = {
  DELAYED: '~',
  MID: '*',
  LAST_KNOWN: '!',
  PREVIOUS_CLOSE: '^',
  TRADE: '',
  '': '',
};

const SOURCE_LABEL: Record<PriceSource, string> = {
  DELAYED: '延遲報價(約20分)',
  MID: '五檔中間價',
  LAST_KNOWN: '前次報價',
  PREVIOUS_CLOSE: '昨收',
  TRADE: '',
  '': '',
};

// 圖例的列舉順序，同時也是後端取價的優先序（domain.MarkedPriceSources）。
const MARKED_SOURCES: PriceSource[] = ['DELAYED', 'MID', 'LAST_KNOWN', 'PREVIOUS_CLOSE'];

// 後端用 math.Round（四捨五入、遇 .5 往遠離 0 的方向），JS 的 Math.round 是一律往上，
// 兩者在負數的 .5 會差一。回檔在盤中創新高時會是負的，所以照抄後端的行為。
function roundLikeGo(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** 價格一律四捨五入到整數，跟訊息一致（完整精度留在表格）。 */
function messagePrice(value: number | null): string {
  return value == null ? DASH : String(roundLikeGo(value));
}

function messagePercent(value: number | null): string {
  return value == null ? DASH : `${roundLikeGo(value)}%`;
}

/** 本益比保留原有小數並去掉尾端多餘的零，例如 17.80 → 17.8。 */
function messagePe(value: number | null): string {
  return value == null ? DASH : String(value);
}

function buyZone(row: PortfolioRow): string {
  if (row.buy_zone_low == null || row.buy_zone_high == null) return DASH;
  return `${messagePrice(row.buy_zone_low)}~${messagePrice(row.buy_zone_high)}`;
}

/** 台北時區的 MM/DD HH:MM，對應訊息標題的 headerTimeLayout。 */
function headerTime(now: Date): string {
  return now.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function clockTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * 「這批價格有多新、從哪來」的一行註記，規則同後端的 priceNote。
 *
 * 全部都是即時成交價（或根本沒有價）時回空字串——正常狀態不該佔版面。
 */
function priceNote(rows: PortfolioRow[]): string {
  const used = new Set(rows.map((row) => row.price_source));
  const legend = MARKED_SOURCES.filter((source) => used.has(source)).map(
    (source) => `${SOURCE_MARK[source]} ${SOURCE_LABEL[source]}`
  );
  if (legend.length === 0) return '';

  const parts: string[] = [];
  // 取最舊的一筆：多檔混用不同來源時，該看到的是最壞情況而不是平均值。
  const stamps = rows.map((row) => row.price_as_of).filter(Boolean).sort();
  if (stamps.length > 0) {
    const oldest = clockTime(stamps[0]);
    if (oldest) parts.push(`報價 ${oldest} 起`);
  }
  parts.push(legend.join('　'));
  return parts.join('｜');
}

// 底部備註，逐字對齊後端的 flexFootnote——包含買區係數與紅字門檻。
const FOOTNOTE = [
  'PE ＝ 歷史／高點／預估／年化（皆 股價÷EPS）',
  '歷史:現價÷近四季　高點:半年最高÷近四季',
  '預估:現價÷本年預估　年化:現價÷(最新季×4)',
  '買區 ＝ 半年最高 ×0.65~0.70　　紅字: PE≥90 或 回檔≥25%',
];

/**
 * 推播訊息預覽。
 *
 * 內容是前端照後端的 Flex 版型重排出來的，不是後端回傳的訊息——
 * `/portfolio/notify` 只回試算結果，拿不到組好的訊息。所以版型改了兩邊要一起改，
 * 對照的是 internal/service/portfolio/flex.go。
 *
 * 字級與間距用寫死的 px 而不是設計系統的字級 token：這裡模擬的是 LINE 的排版，
 * 跟著本站字級走就不像了。
 */
export default function LineMessagePreview({
  rows,
  pullbackAlert,
  peAlert,
}: LineMessagePreviewProps) {
  const note = priceNote(rows);
  const isPeAlert = (value: number | null) => value != null && value >= peAlert;

  return (
    <div
      className="rounded-xl p-4 sm:p-6 flex justify-center"
      style={{ backgroundColor: LINE_BACKGROUND }}
    >
      <div className="w-full max-w-[420px] bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-outline-variant">
          <p className="text-[14px] font-bold text-on-surface">
            📊 持股試算 {headerTime(new Date())}
          </p>
          {note && (
            <p className="text-[11px] mt-0.5" style={{ color: FLEX_LABEL }}>
              {note}
            </p>
          )}
        </div>

        <div className="px-4 py-3 flex flex-col gap-3">
          {rows.map((row) => {
            const label = `${row.symbol} ${row.name || DASH}`;

            // 取價失敗的那一列只印代號與原因：後面每個數字都是拿現價算的，
            // 沒有現價就沒有一個數字是真的。
            if (row.error) {
              return (
                <div key={row.symbol} className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-on-surface">{label}</span>
                  <span className="text-[11px]" style={{ color: FLEX_LABEL }}>
                    {row.error}
                  </span>
                </div>
              );
            }

            const pullbackAlerted =
              row.pullback_percent != null && row.pullback_percent >= pullbackAlert;

            return (
              <div key={row.symbol} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2 text-[13px]">
                  <span className="font-bold text-on-surface shrink-0">{label}</span>
                  <span
                    className={`flex-1 ${row.in_buy_zone ? 'font-bold' : ''}`}
                    style={row.in_buy_zone ? { color: FLEX_BUY } : undefined}
                  >
                    買 {buyZone(row)}
                    {row.in_buy_zone ? '✅' : ''}
                  </span>
                  <span className="font-bold text-on-surface whitespace-nowrap">
                    現{messagePrice(row.price)}
                    {SOURCE_MARK[row.price_source]}/
                    <span style={pullbackAlerted ? { color: FLEX_ALERT } : undefined}>
                      回{messagePercent(row.pullback_percent)}
                    </span>
                  </span>
                </div>

                <div className="text-[11px] pl-4">
                  <span style={{ color: FLEX_LABEL }}>PE </span>
                  {[row.historical_pe, row.high_pe, row.estimated_pe, row.annualized_pe].map(
                    (value, index) => (
                      <span key={index}>
                        {index > 0 && <span style={{ color: FLEX_LABEL }}> / </span>}
                        <span
                          className={isPeAlert(value) ? 'font-bold' : ''}
                          style={{ color: isPeAlert(value) ? FLEX_ALERT : FLEX_LABEL }}
                        >
                          {messagePe(value)}
                        </span>
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-outline-variant">
          {FOOTNOTE.map((line) => (
            <p key={line} className="text-[11px] leading-relaxed" style={{ color: FLEX_LABEL }}>
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
