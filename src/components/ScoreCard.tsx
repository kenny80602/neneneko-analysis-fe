import { ChipMessy, ScoreFacet, StockScore } from '../api/types';
import { DASH } from '../utils/format';
import { LEVEL_LABEL, levelClass } from './ScoreBadges';

const FACETS: {
  key: 'fundamental' | 'chip' | 'technical';
  name: string;
  icon: string;
  question: string;
}[] = [
  { key: 'fundamental', name: '基本面', icon: 'account_balance', question: '這家公司賺不賺錢、貴不貴' },
  { key: 'chip', name: '籌碼面', icon: 'groups', question: '法人與散戶站在哪一邊' },
  { key: 'technical', name: '技術面', icon: 'show_chart', question: '價格走勢現在往哪走' },
];

// 三態：true 是亂、false 是沒有跡象、null 是資料不足。null 不能畫成 false，
// 那會把「集保還沒累積夠週數」讀成「籌碼穩定」。
function MessyRow({ messy }: { messy: ChipMessy }) {
  const label = messy.messy === true ? '籌碼亂' : messy.messy === false ? '沒有籌碼亂的跡象' : `${DASH} 籌碼亂：資料不足`;
  const tone = messy.messy === true ? 'bg-error/10 text-error' : 'text-outline';
  return (
    <div className="flex flex-col gap-1 border-t border-outline-variant/50 pt-2">
      <span className={`self-start rounded px-2 py-0.5 font-data-md text-[12px] ${tone}`}>{label}</span>
      <ul className="flex flex-col gap-1 font-body-sm text-body-sm text-on-surface-variant list-disc pl-4">
        {messy.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

function FacetColumn({
  name,
  icon,
  question,
  facet,
  loading,
  messy,
}: {
  name: string;
  icon: string;
  question: string;
  facet: ScoreFacet | undefined;
  loading: boolean;
  messy?: ChipMessy;
}) {
  // 還在載入時不能顯示「資料不足」：那是一個結論，載入中只是還沒有結論。
  const pending = !facet && loading;
  const level = facet?.level ?? 'INSUFFICIENT';
  const insufficient = level === 'INSUFFICIENT';
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-low/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-label-caps text-label-caps uppercase text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
          {name}
        </span>
        <span
          className={`px-3 py-1 rounded-[9999px] font-data-md text-data-md ${levelClass(level)}`}
          title={insufficient ? '沒有資料可評，不是中性' : undefined}
        >
          {pending ? '載入中…' : insufficient ? `${DASH} 資料不足` : LEVEL_LABEL[level]}
        </span>
      </div>
      <span className="font-body-sm text-body-sm text-outline">{question}</span>
      {/* 依據一條一行：使用者要的是「憑什麼這樣說」，不是只看一個結論。 */}
      <ul className="flex flex-col gap-1 font-body-sm text-body-sm text-on-surface-variant list-disc pl-4">
        {(facet?.reasons ?? []).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
        {!facet && !loading && <li>沒有取得評分</li>}
      </ul>
      {messy && <MessyRow messy={messy} />}
    </div>
  );
}

/**
 * 單一檔的基本面／籌碼面／技術面卡片：三欄各自一個結論，加上判斷依據。
 *
 * 跟榜單與清單裡的小徽章是同一份資料（/stocks/scores），差別只是這裡版面夠，
 * 所以把依據直接攤開，不必滑鼠移上去才看得到。
 */
export default function ScoreCard({
  score,
  failed,
  loading,
}: {
  score: StockScore | undefined;
  failed: boolean;
  loading: boolean;
}) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-6 flex flex-col gap-stack-md">
      <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px]">fact_check</span>
        三面向
      </h3>

      {failed && (
        <p className="font-body-sm text-body-sm text-error">
          評分載入失敗，其餘區塊不受影響。
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-stack-md">
        {FACETS.map(({ key, ...rest }) => (
          <FacetColumn
            key={key}
            {...rest}
            facet={score?.[key]}
            loading={loading}
            messy={key === 'chip' ? score?.chip_messy : undefined}
          />
        ))}
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        依規則算出的現況描述，不是買賣建議，也沒有檢定過「之後會不會漲」。破折號是沒有資料可評，
        不是中性：收盤行情、三大法人與融資融券只收自選股，不在自選股的檔籌碼面與技術面多半評不出來；
        技術面要 60 個交易日的收盤行情。基本面看月營收年增率與本益比，籌碼面看三大法人與融資餘額的變化，
        技術面看月線、季線的排列與斜率。
        「籌碼亂」是獨立的參考標記，看集保近 4 週大戶是否在減、散戶是否在增，再用法人賣超或融資增加佐證；
        集保只有週資料，累積不到 2 週時是資料不足，門檻是經驗值，之後會依實際分佈調整。
      </p>
    </section>
  );
}
