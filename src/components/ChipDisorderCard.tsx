import { ChipDisorder, DirectionFlips, FalseBreakouts } from '../api/types';
import { DASH, formatNumber } from '../utils/format';
import PageState from './PageState';

const cardClass = 'bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm';

// 反轉率的分級文字。分級只用中性色，不用紅綠：混亂不是壞事也不是好事（趨勢中的換手很正常），
// 紅綠留給漲跌。
const FLIP_LEVEL: Record<string, string> = {
  stable: '方向相對穩定',
  changing: '方向有變化',
  repeating: '方向反覆',
  high: '高度反覆',
};

// 假突破率的最少樣本：只有一兩次突破時的比例沒有意義，但次數照列，讓人自己判斷。
const MIN_BREAKOUTS_NOTE = 3;

interface ChipDisorderCardProps {
  data?: ChipDisorder;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * 籌碼混亂度：法人買賣方向反轉率、箱型假突破率，各看 20 與 60 個交易日。
 *
 * 兩個指標各自獨立顯示，不合成分數：原本設想的第三個指標（前 5 大買超分點集中度）要券商分點資料，
 * 我們沒有，缺一個權重 30% 的指標合成分數就沒有依據；分級與權重也都沒有回測驗證過。
 * 「主力」在這裡是三大法人合計。
 */
export default function ChipDisorderCard({ data, loading, error, onRetry }: ChipDisorderCardProps) {
  if (loading) return <PageState kind="loading" />;
  if (error) return <PageState kind="error" message={error} onRetry={onRetry} />;
  if (!data) return null;

  return (
    <section className={`${cardClass} p-6 flex flex-col gap-stack-md`}>
      <div className="flex flex-col gap-1">
        <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">shuffle</span>
          籌碼混亂度
        </h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          兩個獨立指標，各看近 20 與 60 個交易日，不合成分數。「主力」是三大法人合計（沒有券商分點資料）。
          {data.as_of && `法人資料到 ${data.as_of}。`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-stack-md">
        <div className="flex flex-col gap-stack-sm">
          <h4 className="font-body-md text-body-md text-on-surface font-semibold">法人買賣方向反轉率</h4>
          {data.has_institutional ? (
            <div className="grid grid-cols-2 gap-stack-sm">
              <FlipBox flips={data.flips_20} />
              <FlipBox flips={data.flips_60} />
            </div>
          ) : (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              這一檔沒有三大法人資料（只落地自選股），算不出方向反轉率。
            </p>
          )}
        </div>

        <div className="flex flex-col gap-stack-sm">
          <h4 className="font-body-md text-body-md text-on-surface font-semibold">箱型假突破率</h4>
          <div className="grid grid-cols-2 gap-stack-sm">
            <BreakoutBox breakouts={data.breakouts_20} />
            <BreakoutBox breakouts={data.breakouts_60} />
          </div>
        </div>
      </div>

      <div className="font-body-sm text-body-sm text-on-surface-variant flex flex-col gap-1">
        <p>
          <span className="text-on-surface">方向反轉率</span>＝相鄰兩個「有明確方向」的交易日方向不同的比例。法人合計買賣超小於
          {formatNumber(data.neutral_shares)} 股（集保總庫存的 0.02%，拿不到時用 100 張）的日子設為中性，涉及中性日的相鄰組不計入，
          避免把微小的交易誤判成反轉；有效次數不到 5 組不給比例。分級：&lt; 30% 穩定、30～50% 有變化、50～70% 反覆、&gt; 70% 高度反覆
          （研究用的初始假設，沒有回測驗證過）。
        </p>
        <p>
          <span className="text-on-surface">假突破率</span>＝近期箱型整理的突破（收盤超出箱頂或跌破箱底）裡，突破後三根內收盤又收回箱內的比例。
          箱型邊界在突破前就由轉折點固定，不會事後調整；剛突破、後面還沒滿三根的列為待觀察，不算成功也不算失敗；
          這段期間沒有箱型突破就沒有比例（不是 0%）。
        </p>
        <p>
          混亂不等於壞事：價格趨勢明確時的高反轉率常只是趨勢中的換手；箱型穩定而反轉率高，才比較像買賣力量分歧。
          這是現況描述，不是買賣訊號。
        </p>
      </div>
    </section>
  );
}

function FlipBox({ flips }: { flips: DirectionFlips }) {
  return (
    <div className="rounded-lg bg-surface-container-low p-3 flex flex-col gap-1">
      <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">近 {flips.window} 日</span>
      {flips.rate_pct != null ? (
        <>
          <span className="font-data-lg text-data-lg text-on-surface">{formatNumber(flips.rate_pct, 1)}%</span>
          <span className="font-body-md text-body-md text-on-surface">{FLIP_LEVEL[flips.level] ?? flips.level}</span>
        </>
      ) : (
        <>
          <span className="font-data-lg text-data-lg text-outline">{DASH}</span>
          <span className="font-body-sm text-body-sm text-outline">
            樣本不足（有效 {flips.pairs} 組，至少 5 組）
          </span>
        </>
      )}
      <span className="font-body-sm text-body-sm text-on-surface-variant">
        有資料 {flips.days} 天：買超 {flips.buy}／賣超 {flips.sell}／中性 {flips.neutral}；有效 {flips.pairs} 組、反轉{' '}
        {flips.reversals} 次
      </span>
    </div>
  );
}

function BreakoutBox({ breakouts }: { breakouts: FalseBreakouts }) {
  return (
    <div className="rounded-lg bg-surface-container-low p-3 flex flex-col gap-1">
      <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
        近 {breakouts.window} 日
      </span>
      {breakouts.rate_pct != null ? (
        <>
          <span className="font-data-lg text-data-lg text-on-surface">{formatNumber(breakouts.rate_pct, 0)}%</span>
          <span className="font-body-md text-body-md text-on-surface">
            {breakouts.judged} 次突破、{breakouts.failed} 次收回箱內
          </span>
          {breakouts.judged < MIN_BREAKOUTS_NOTE && (
            <span className="font-body-sm text-body-sm text-outline">只有 {breakouts.judged} 次，比例僅供參考</span>
          )}
        </>
      ) : (
        <>
          <span className="font-data-lg text-data-lg text-outline">{DASH}</span>
          <span className="font-body-sm text-body-sm text-outline">
            {breakouts.pending > 0 ? `${breakouts.pending} 次剛突破，還沒滿三根` : '這段期間沒有可判斷的箱型突破'}
          </span>
        </>
      )}
      {breakouts.pending > 0 && breakouts.rate_pct != null && (
        <span className="font-body-sm text-body-sm text-on-surface-variant">另有 {breakouts.pending} 次待觀察</span>
      )}
      {breakouts.events.map((event) => (
        <span key={event.date} className="font-body-sm text-body-sm text-on-surface-variant">
          {event.date.slice(5)} {event.direction === 'up' ? '向上突破' : '向下跌破'} {formatNumber(event.level, 2)}：
          {event.held == null ? '待觀察' : event.held ? '站穩' : '收回箱內'}
        </span>
      ))}
    </div>
  );
}
