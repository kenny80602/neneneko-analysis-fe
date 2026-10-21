import { ChartPattern, ChartPatterns } from '../api/types';
import { DASH, formatNumber, formatPrice, formatSignedPercent, quoteColor } from '../utils/format';
import {
  directionClasses,
  directionLabel,
  FAMILIES,
  gapClasses,
  gapHint,
  gapName,
  PatternFamily,
  patternFamily,
  patternName,
  volumeNote,
} from '../utils/patterns';

const TH = 'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
const TD = 'p-2 py-2 text-right font-data-md text-data-md whitespace-nowrap';
const TABLE_WRAP = 'overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm';

// 缺口表最多列幾個。全列的話一年下來幾十個，把型態表擠到看不見。
const GAP_ROWS = 12;

interface PatternPanelProps {
  patterns: ChartPatterns;
  /** 目前顯示範圍內畫得出來的型態（patterns.patterns 的索引）。其餘標「不在目前顯示範圍」。 */
  visibleIds: Set<number>;
  family: PatternFamily | 'all';
  onFamily: (family: PatternFamily | 'all') => void;
  selected: number | null;
  onSelect: (id: number | null) => void;
}

/**
 * 型態清單與缺口清單。圖上只畫得出目前視窗裡的，這裡列出整段資料偵測到的全部；
 * 點一列會在圖上加粗那個型態（不在視窗內的要先縮放或拖曳過去）。
 */
export default function PatternPanel({
  patterns,
  visibleIds,
  family,
  onFamily,
  selected,
  onSelect,
}: PatternPanelProps) {
  const rows = patterns.patterns
    .map((pattern, id) => ({ pattern, id }))
    .filter(({ pattern }) => family === 'all' || patternFamily(pattern.kind) === family)
    .reverse();
  const gaps = [...patterns.gaps].reverse();

  return (
    <div className="flex flex-col gap-stack-md">
      <div className="flex flex-col gap-stack-sm">
        <div className="flex flex-wrap items-center justify-between gap-stack-sm">
          <h4 className="font-body-md text-body-md text-on-surface font-semibold">
            價格型態
            <span className="font-body-sm text-body-sm text-on-surface-variant font-normal">
              　分析 {patterns.bars} 根日 K{patterns.from && `（${patterns.from} ～ ${patterns.to}）`}
            </span>
          </h4>
          <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant">
            {FAMILIES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onFamily(item.key)}
                aria-pressed={family === item.key}
                className={
                  family === item.key
                    ? 'px-3 py-1 rounded font-body-sm text-body-sm bg-primary text-on-primary transition-colors'
                    : 'px-3 py-1 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors'
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {patterns.count === 0
              ? '這段資料沒有偵測到型態。這很常見，不代表系統壞了：型態動輒幾十到上百根日 K 才成形，落地的收盤行情又只有自選股、且從開始收集那天才有，根數不夠或這段走勢本來就沒有符合規則的型態，都會是空的。'
              : '這個分類沒有偵測到型態，換一個分類看看。'}
          </p>
        ) : (
          <div className={TABLE_WRAP}>
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className={`${TH} pl-4`}>型態</th>
                  <th className={TH}>期間</th>
                  <th className={`${TH} text-right`}>關鍵價</th>
                  <th className={`${TH} text-right`}>高度</th>
                  <th className={TH}>確認日</th>
                  <th className={TH}>量能</th>
                  <th className={`${TH} text-right`}>確認後 5 日</th>
                  <th className={`${TH} text-right`}>確認後 20 日</th>
                  <th className={`${TH} text-right`}>量測目標</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {rows.map(({ pattern, id }) => (
                  <PatternRow
                    key={id}
                    pattern={pattern}
                    visible={visibleIds.has(id)}
                    selected={selected === id}
                    onClick={() => onSelect(selected === id ? null : id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {gaps.length > 0 && (
        <div className="flex flex-col gap-stack-sm">
          <h4 className="font-body-md text-body-md text-on-surface font-semibold">
            跳空缺口
            <span className="font-body-sm text-body-sm text-on-surface-variant font-normal">
              　共 {gaps.length} 個{gaps.length > GAP_ROWS && `，列最近 ${GAP_ROWS} 個`}
            </span>
          </h4>
          <div className={TABLE_WRAP}>
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className={`${TH} pl-4`}>日期</th>
                  <th className={TH}>種類</th>
                  <th className={`${TH} text-right`}>缺口範圍</th>
                  <th className={`${TH} text-right`}>量比</th>
                  <th className={TH}>回補</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {gaps.slice(0, GAP_ROWS).map((gap) => {
                  const color = gapClasses(gap);
                  return (
                    <tr key={gap.date} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="p-2 pl-4 py-2 font-data-md text-data-md whitespace-nowrap">{gap.date}</td>
                      <td className="p-2 py-2 font-body-md text-body-md whitespace-nowrap" title={gapHint(gap.kind)}>
                        <span className={color.text}>{gap.direction === 'up' ? '↑' : '↓'}</span> {gapName(gap.kind)}
                      </td>
                      <td className={TD}>
                        {formatPrice(gap.low)} ～ {formatPrice(gap.high)}
                      </td>
                      <td className={TD}>{gap.volume_ratio != null ? `${gap.volume_ratio.toFixed(1)} 倍` : DASH}</td>
                      <td className="p-2 py-2 font-body-sm text-body-sm whitespace-nowrap text-on-surface-variant">
                        {gap.filled ? `${gap.filled_at} 回補` : '尚未回補'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="font-body-sm text-body-sm text-on-surface-variant flex flex-col gap-1">
        <p>
          型態是後端用機械規則從日 K 的轉折點偵測的。<span className="text-on-surface">確認之前不預設立場</span>
          ：實線是已收盤突破（跌破）關鍵線，虛線加問號是形成中，圖畫得再漂亮，沒有收盤突破之前都還沒確立。圓圈是確認那天的收盤。
          顏色看預期方向（紅看漲、綠看跌、灰是方向未定的整理）。
        </p>
        <p>
          量價紀律：底部型態突破要<span className="text-on-surface">有量</span>才算真突破（量比 ≥ 1.5 倍）；頭部型態跌破不需要量，
          無量下跌更可怕。量能只陳述數字與傳統說法，沒有拿它當確認條件。
        </p>
        <p>
          這是現況描述，不是買賣訊號：門檻是經驗值、沒有檢定過出現後的表現（全市場回測見後端
          <code>cmd/patternstudy</code>，底部型態確認後的超額報酬多數沒有正面表現），單一檔的幾次結果沒有統計意義，
          「量測目標」只是慣例上的算術。破折號代表資料還沒走到那麼遠、尚未確認或這個型態沒有慣用目標，不是 0。
        </p>
        <p>
          缺口分類也是機械規則：突破缺口要整理箱之後帶量；竭盡缺口要長期趨勢之後幾天內被回補，太新的缺口之後可能改判；
          除權息當天的缺口不算（收盤價沒有還原權值，那是價格調整不是市場行為）。
        </p>
      </div>
    </div>
  );
}

interface PatternRowProps {
  pattern: ChartPattern;
  visible: boolean;
  selected: boolean;
  onClick: () => void;
}

function PatternRow({ pattern, visible, selected, onClick }: PatternRowProps) {
  const color = directionClasses(pattern.direction);
  const confirmed = pattern.status === 'confirmed';
  const outcome = pattern.outcome;
  const volume = volumeNote(pattern);
  const first = pattern.pivots[0];
  const last = pattern.pivots[pattern.pivots.length - 1];

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer hover:bg-surface-container-low/50 transition-colors ${
        selected ? 'bg-surface-container-low' : ''
      }`}
    >
      <td className="p-2 pl-4 py-2 font-body-md text-body-md whitespace-nowrap">
        <span className={color.text}>{patternName(pattern.kind)}</span>
        <span className="text-on-surface-variant font-body-sm text-body-sm">（{directionLabel(pattern.direction)}）</span>
        {!confirmed && (
          <span className="ml-2 px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-body-sm text-body-sm">
            形成中
          </span>
        )}
        {pattern.spans_ex_dividend && (
          <span
            className="ml-2 px-1.5 py-0.5 rounded bg-surface-container text-error font-body-sm text-body-sm"
            title="收盤價未還原權值，除息的跳空會被當成一次下跌，轉折點與落差會失真"
          >
            含除權息
          </span>
        )}
        {!visible && <span className="ml-2 text-outline font-body-sm text-body-sm">不在目前顯示範圍</span>}
      </td>
      <td className="p-2 py-2 font-data-md text-data-md whitespace-nowrap">
        {first.date.slice(5)} ～ {last.date.slice(5)}
      </td>
      <td className={TD}>{formatPrice(pattern.neckline)}</td>
      <td className={TD}>{formatNumber(pattern.depth_pct, 1)}%</td>
      <td className="p-2 py-2 font-data-md text-data-md whitespace-nowrap">{confirmed ? pattern.confirmed_at : DASH}</td>
      <td className="p-2 py-2 font-body-sm text-body-sm whitespace-nowrap">
        {volume ? (
          <span className={volume.warn ? 'text-error' : 'text-on-surface-variant'} title={volume.text}>
            {volume.text.length > 16 ? `${volume.text.slice(0, 16)}…` : volume.text}
          </span>
        ) : (
          DASH
        )}
        {pattern.volume?.second_lighter != null && (
          <span className="ml-2 text-on-surface-variant" title="後一個峰（腳、肩）附近的量跟前一個比">
            {pattern.volume.second_lighter ? '第二峰量縮' : '第二峰量增'}
          </span>
        )}
      </td>
      <td className={`${TD} ${outcome ? quoteColor(outcome.after_5_pct) : ''}`}>
        {outcome ? formatSignedPercent(outcome.after_5_pct) : DASH}
      </td>
      <td className={`${TD} ${outcome ? quoteColor(outcome.after_20_pct) : ''}`}>
        {outcome ? formatSignedPercent(outcome.after_20_pct) : DASH}
      </td>
      <td className={TD}>
        {pattern.target == null ? (
          DASH
        ) : (
          <>
            {formatPrice(pattern.target)}
            <span className="text-on-surface-variant font-body-sm text-body-sm">
              {!outcome ? '' : outcome.target_hit ? `　${outcome.target_hit_at.slice(5)} 達成` : '　未達成'}
            </span>
          </>
        )}
      </td>
    </tr>
  );
}
