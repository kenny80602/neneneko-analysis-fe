import { ScoreFacet, ScoreLevel, StockScore } from '../api/types';
import { DASH, quoteBadge } from '../utils/format';

export const LEVEL_LABEL: Record<ScoreLevel, string> = {
  BULLISH: '偏多',
  NEUTRAL: '中性',
  BEARISH: '偏空',
  INSUFFICIENT: DASH,
};

// 台股慣例漲紅跌綠，沿用 quoteBadge 讓這一欄跟漲跌幅欄是同一組顏色。
// 資料不足刻意不給底色：它不是一種「結論」，畫成灰底膠囊會被當成中性。
export function levelClass(level: ScoreLevel): string {
  switch (level) {
    case 'BULLISH':
      return quoteBadge(1);
    case 'BEARISH':
      return quoteBadge(-1);
    case 'NEUTRAL':
      return quoteBadge(0);
    default:
      return 'text-outline';
  }
}

const FACETS: { key: 'fundamental' | 'chip' | 'technical'; short: string; name: string }[] = [
  { key: 'fundamental', short: '基', name: '基本面' },
  { key: 'chip', short: '籌', name: '籌碼面' },
  { key: 'technical', short: '技', name: '技術面' },
];

function facetTitle(name: string, facet: ScoreFacet): string {
  const head = facet.level === 'INSUFFICIENT' ? `${name}：資料不足` : `${name}：${LEVEL_LABEL[facet.level]}`;
  return [head, ...facet.reasons.map((reason) => `・${reason}`)].join('\n');
}

/**
 * 一檔的基本面／籌碼面／技術面三個小徽章，滑鼠移上去看判斷依據。
 *
 * score 為 undefined 時三格都是破折號：評分還在載入、評分那支失敗、或這檔不在回應裡，
 * 對使用者來說都是「這一欄沒有東西」，榜單本身照常可讀。
 */
export default function ScoreBadges({ score, title }: { score?: StockScore; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={title}>
      {FACETS.map(({ key, short, name }) => {
        const facet = score?.[key];
        const level: ScoreLevel = facet?.level ?? 'INSUFFICIENT';
        return (
          <span
            key={key}
            title={facet ? facetTitle(name, facet) : `${name}：沒有評分`}
            className={`rounded px-1 py-0.5 font-data-md text-[11px] leading-none ${levelClass(level)}`}
          >
            {short}
            {LEVEL_LABEL[level]}
          </span>
        );
      })}
    </span>
  );
}
