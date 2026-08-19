import { MacroIndicator } from '../api/types';
import { formatNumber, formatPercent, formatSigned, formatSignedPercent } from '../utils/format';

// VIX 與布蘭特都習慣看兩位小數。後端沒有回 digits，由前端統一決定；
// 之後多回一支不同精度的指標時再改成逐指標判斷。
const MACRO_DIGITS = 2;

// 一個總經指標的卡片：VIX 與布蘭特原油。市場概況與 Fed 與總經兩頁都用同一份。
//
// 抽成共用元件而不是兩頁各寫一次：這兩張卡的重點是那幾句「上漲代表什麼」的說明，
// 各寫一份的話只要有一邊改了措辭，同一個指標在站上就會有兩種說法。

/**
 * 各指標的顯示語意，以上游 ticker 為鍵。
 *
 * ⚠️ 這幾個的「上漲」都不是好消息，所以**不套 quoteColor**。台股的紅漲綠跌在這裡
 * 會直接說反話：恐慌升高畫成紅色，在台股語彙裡紅是好事。所以數值一律走中性色，
 * 方向用文字講——跟大戶散戶那頁「散戶增加不能配紅色」是同一個決定。
 *
 * 後端之後多回一支指標時，這裡沒有對應的 meta 也照樣顯示（方向文字退成漲跌），
 * 不要因為沒寫說明就把那一列藏起來。
 */
const MACRO_META: Record<string, { icon: string; up: string; down: string; note: string }> = {
  '^VIX': {
    icon: 'crisis_alert',
    up: '恐慌升高',
    down: '恐慌降溫',
    note: 'VIX 是標普 500 選擇權隱含波動率，俗稱恐慌指數，反映的是「美股未來 30 天預期波動」而不是漲跌方向。它通常在股市下跌時竄升，20 以下算平靜、30 以上算恐慌。它是美股的溫度計，台股隔天開盤常跟著反應。',
  },
  'BZ=F': {
    icon: 'local_gas_station',
    up: '油價上漲',
    down: '油價下跌',
    note: '布蘭特是北海原油，國際油價的主要基準之一（美國那邊看的是西德州 WTI）。台灣的油幾乎全靠進口，油價上漲是輸入型通膨壓力，對塑化、航運、航空的成本影響最直接。',
  },
};

/** 一個指標的卡片：現值、對前一收盤的變化，以及它落在 52 週區間的哪裡。 */
export default function MacroCard({ item }: { item: MacroIndicator }) {
  const meta = MACRO_META[item.symbol];
  // 方向用文字講而不是用顏色：這幾個漲都不是好事，套漲紅跌綠會說反話。
  // 沒有 meta 的新指標退成中性的「上漲／下跌」，而不是不顯示。
  const direction =
    item.change == null || item.change === 0
      ? ''
      : item.change > 0
        ? (meta?.up ?? '上漲')
        : (meta?.down ?? '下跌');

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm flex flex-col gap-1">
      <div className="flex items-center gap-2 text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px]">{meta?.icon ?? 'public'}</span>
        <span className="font-label-caps text-label-caps uppercase">{item.name}</span>
        <span className="ml-auto font-data-md text-data-md text-outline">{item.symbol}</span>
      </div>

      <p className="font-data-lg text-data-lg text-on-surface">
        {formatNumber(item.price, MACRO_DIGITS)}
        {item.unit && (
          <span className="ml-1 font-body-sm text-body-sm text-on-surface-variant">
            {item.unit}
          </span>
        )}
      </p>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {item.change == null ? (
          '沒有前一個收盤可以比'
        ) : (
          <>
            {formatSigned(item.change, MACRO_DIGITS)}（{formatSignedPercent(item.change_percent)}）
            {direction && <span className="text-on-surface font-semibold">　{direction}</span>}
          </>
        )}
      </p>

      <Range52Week item={item} />

      {meta && <p className="font-body-sm text-body-sm text-outline mt-1">{meta.note}</p>}

      <p className="font-body-sm text-body-sm text-outline">
        {item.as_of ? item.as_of.slice(0, 16).replace('T', ' ') : '沒有時間資訊'}
      </p>
    </div>
  );
}

/**
 * 52 週區間裡的位置。
 *
 * 這才是這兩個指標有意義的讀法：「VIX 15.8」本身沒有資訊，
 * 「落在一年區間的 11%，接近一年來最平靜」才有。
 */
function Range52Week({ item }: { item: MacroIndicator }) {
  const percentile = item.percentile_in_52_week;
  if (percentile == null || item.week_low_52 == null || item.week_high_52 == null) {
    // 三個值缺任何一個就整條不畫：畫一條沒有標記的軌道只會讓人以為在載入。
    return (
      <p className="font-body-sm text-body-sm text-outline">沒有 52 週區間可以對照</p>
    );
  }
  return (
    <div className="flex flex-col gap-1 mt-1">
      <div className="relative h-1.5 rounded-[9999px] bg-surface-container">
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-[9999px] bg-primary"
          style={{ left: `${Math.min(100, Math.max(0, percentile))}%` }}
        />
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        52 週 {formatNumber(item.week_low_52, MACRO_DIGITS)} ～{' '}
        {formatNumber(item.week_high_52, MACRO_DIGITS)}，現在落在{' '}
        <span className="text-on-surface font-semibold">{formatPercent(percentile, 0)}</span> 的位置
      </p>
    </div>
  );
}
