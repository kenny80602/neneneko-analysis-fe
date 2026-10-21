import { ChartPattern, ChartPatterns } from '../api/types';
import { DASH, formatNumber, formatPrice, formatSignedPercent, quoteColor } from '../utils/format';
import {
  directionClasses,
  directionLabel,
  FAMILIES,
  GAP_CLASSES,
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
                  <th className={TH}>同期籌碼</th>
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
                  return (
                    <tr key={gap.date} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="p-2 pl-4 py-2 font-data-md text-data-md whitespace-nowrap">{gap.date}</td>
                      <td className="p-2 py-2 font-body-md text-body-md whitespace-nowrap" title={gapHint(gap.kind)}>
                        <span className={GAP_CLASSES.text}>{gap.direction === 'up' ? '↑' : '↓'}</span> {gapName(gap.kind)}
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
          找箱型的流程：先用日 K 的高低點結構定箱頂與箱底（至少兩個相近高點、兩個相近低點），再用「布林」按鈕開通道看是否走平、
          收窄來輔助確認是盤整——<span className="text-on-surface">不要直接拿布林上下軌當箱頂與箱底</span>；
          最後看突破箱頂時有沒有量增、收盤有沒有站穩，突破無量或收回箱內，要防範假突破。
        </p>
        <p>
          這是現況描述，不是買賣訊號：門檻是經驗值、沒有檢定過出現後的表現（全市場回測見後端
          <code>cmd/patternstudy</code>，底部型態確認後的超額報酬多數沒有正面表現），單一檔的幾次結果沒有統計意義，
          「量測目標」只是慣例上的算術。破折號代表資料還沒走到那麼遠、尚未確認或這個型態沒有慣用目標，不是 0。
        </p>
        <p>
          「同期籌碼」站在型態確認那天（形成中的是最新一天）看這一檔算不算<span className="text-on-surface">籌碼亂</span>
          ：集保大戶減、散戶增，而且有法人賣超或融資增加佐證，規則同個股三面向。籌碼資料的歷史很短（集保只有約十週、
          法人與融資只落地自選股），型態確認得更早的會顯示「資料不足」——那是沒資料可判斷，不是籌碼穩。
        </p>
        <p>
          缺口分類也是機械規則：突破缺口要整理箱之後帶量；竭盡缺口要長期趨勢之後幾天內被回補，太新的缺口之後可能改判；
          除權息當天的缺口不算（收盤價沒有還原權值，那是價格調整不是市場行為）。
        </p>
      </div>
    </div>
  );
}

/**
 * 一句話交代「用了幾天」：箱型整理看從頭到突破（或到今天）整理了幾個交易日，其他型態看成形用了幾個交易日。
 * 交易日不是日曆天——週末與休市不算，所以比兩個日期相減的天數少。
 */
function durationText(pattern: ChartPattern): string {
  if (pattern.kind === 'rectangle') {
    return pattern.status === 'confirmed'
      ? `整理 ${pattern.span_bars} 個交易日後突破`
      : `已整理 ${pattern.span_bars} 個交易日`;
  }
  return `成形 ${pattern.duration_bars} 個交易日`;
}

function durationHint(pattern: ChartPattern): string {
  return `轉折點之間 ${pattern.duration_bars} 個交易日；從第一個轉折點算到${
    pattern.status === 'confirmed' ? '確認日' : '資料最後一天'
  }共 ${pattern.span_bars} 個交易日（交易日，不含週末與休市）`;
}

/**
 * 型態同期的籌碼：籌碼亂／沒有跡象／資料不足三態分開顯示。
 * 資料不足（null）要說出來而且不能畫成「沒問題」：籌碼資料的歷史很短，型態確認得早就沒資料可判斷。
 * 籌碼亂跟型態方向的關係只陳述事實：頭部型態配籌碼亂是同向，底部型態配籌碼亂是背離。
 */
function ChipCell({ pattern }: { pattern: ChartPattern }) {
  const chip = pattern.chip;
  if (!chip) return <span>{DASH}</span>;
  const title = `${chip.as_of} 當天的籌碼：${chip.reasons.join('；') || '沒有細項'}`;
  if (chip.messy == null) {
    return (
      <span className="text-outline" title={title}>
        資料不足
      </span>
    );
  }
  if (!chip.messy) {
    return (
      <span className="text-on-surface-variant" title={title}>
        沒有籌碼亂的跡象
      </span>
    );
  }
  const relation =
    pattern.direction === 'down' ? '與看跌型態同向' : pattern.direction === 'up' ? '與看漲型態背離' : '';
  return (
    <span title={title}>
      <span className="text-error font-semibold">籌碼亂</span>
      {relation && <span className="ml-1 text-on-surface-variant">{relation}</span>}
    </span>
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
        <span className={color.text}>{patternName(pattern.kind, pattern.box_size)}</span>
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
        <div className="font-body-sm text-body-sm text-on-surface-variant" title={durationHint(pattern)}>
          {durationText(pattern)}
        </div>
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
        {pattern.held != null && (
          <div
            className={pattern.held ? 'text-on-surface-variant' : 'text-error'}
            title="確認之後最多看三根收盤有沒有站穩在突破線外側"
          >
            {pattern.held
              ? `突破後 ${pattern.held_bars} 日站穩`
              : '突破後收回線內，假突破跡象'}
          </div>
        )}
        {pattern.bands && (
          <div
            className="text-on-surface-variant"
            title={`布林通道寬度 ${pattern.bands.width_start.toFixed(1)}% → ${pattern.bands.width_end.toFixed(1)}%，中軌變化 ${pattern.bands.mid_slope_pct.toFixed(1)}%`}
          >
            布林：{pattern.bands.narrowing ? '收窄' : '未收窄'}、中軌{pattern.bands.flat ? '走平' : '有斜率'}
          </div>
        )}
        {pattern.volume?.second_lighter != null && (
          <span className="ml-2 text-on-surface-variant" title="後一個峰（腳、肩）附近的量跟前一個比">
            {pattern.volume.second_lighter ? '第二峰量縮' : '第二峰量增'}
          </span>
        )}
      </td>
      <td className="p-2 py-2 font-body-sm text-body-sm whitespace-nowrap">
        <ChipCell pattern={pattern} />
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
