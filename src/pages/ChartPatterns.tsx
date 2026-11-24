import { ReactNode, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { PatternKind } from '../api/types';
import { DASH, formatNumber, formatPercent, formatPrice } from '../utils/format';
import {
  bandwidth,
  boxTargets,
  depthRatio,
  measuredTarget,
  moveToTarget,
  parseInput,
  percentB,
  rangeRatio,
  reversalTarget,
  VOLUME_HEAVY,
  volumeRatio,
} from '../utils/patternFormula';
import { directionClasses, GAP_CLASSES, PatternFamily } from '../utils/patterns';

// 技術型態圖鑑。這一頁不打 API，是把個股總覽「價格走勢」疊出來的那十八種型態與四種跳空缺口講清楚：
// 長什麼樣子、傳統怎麼解讀、我們的程式用什麼規則偵測、目標價怎麼算。
//
// 規則裡的數字抄自後端 domain.PatternParams／GapParams 的預設值，門檻是經驗值、沒有檢定過；
// 後端調了門檻要記得回來改這裡，不然畫面上講的跟程式實際做的對不上。

type Point = [number, number];

interface Schematic {
  /** 價格折線，座標系 100 × 50，y 往下。 */
  points: Point[];
  /** 水平線的 y（頸線、壓力、支撐…），每條一個值。 */
  flat?: number[];
  /** 斜線（三角形上下緣、旗桿通道…）。 */
  slanted?: [Point, Point][];
  /** 圓弧用的曲線，給的話不畫 points 折線。 */
  curve?: 'bowl' | 'dome';
  /** 示意圖的顏色方向。 */
  direction: 'up' | 'down' | 'neutral';
}

interface PatternDoc {
  kind: PatternKind;
  family: PatternFamily;
  name: string;
  tagline: string;
  schematic: Schematic;
  /** 傳統的特徵與解讀。 */
  traits: string;
  /** 量能的說法；沒有特別的就不寫。 */
  volume?: string;
  /** 我們的程式怎麼偵測（門檻是經驗值）。 */
  detect: string;
  /** 目標價；沒有慣用目標的寫原因。 */
  target: string;
  /** 容易誤判的地方。 */
  caution?: string;
}

const bowl = (): Point[] =>
  Array.from({ length: 19 }, (_, i) => {
    const x = 5 + i * 5;
    const t = (x - 50) / 45;
    return [x, 10 + 32 * (1 - t * t)] as Point;
  });
const dome = (): Point[] => bowl().map(([x, y]) => [x, 52 - y] as Point);

const PATTERNS: PatternDoc[] = [
  // ===== 底部反轉 =====
  {
    kind: 'double_bottom',
    family: 'bottom',
    name: 'W 底（雙重底）',
    tagline: '兩次下探相近低點，突破中間高點（頸線）轉強',
    schematic: {
      points: [[5, 8], [20, 40], [40, 18], [60, 40], [78, 12], [95, 5]],
      flat: [18],
      direction: 'up',
    },
    traits: '股價下跌到某一低點反彈，再回落到前低附近（第二隻腳）獲得支撐，收盤突破中間那個高點（頸線）才算確認。',
    volume: '第二隻腳的量通常比第一隻小；突破頸線時要放量才是真突破。',
    detect:
      '兩隻腳差距 ≤ 4%、頸線比腳高 ≥ 6%、兩隻腳隔 7～120 根日 K、之前往回 60 根內曾經比第一隻腳高出 ≥ 10%（先跌下來）。兩隻腳不必是相鄰的轉折點，頸線取中間最高的高點。確認後最多等 40 根。',
    target: '頸線 + （頸線 − 腳的價位）。',
    caution: '沒有前一段下跌的「雙底」只是盤整；突破前先跌破第二隻腳就失效。',
  },
  {
    kind: 'head_shoulders_bottom',
    family: 'bottom',
    name: '頭肩底',
    tagline: '左肩、頭（最低）、右肩，突破頸線',
    schematic: {
      points: [[2, 8], [15, 30], [28, 18], [42, 44], [56, 18], [70, 30], [84, 18], [98, 6]],
      slanted: [[[28, 18], [56, 18]]],
      direction: 'up',
    },
    traits: '由三個低點組成，中間的頭最低；兩個反彈高點連成頸線，收盤突破後常有一波漲勢。',
    volume: '右肩反彈突破頸線時要有明顯的波段大量。',
    detect:
      '頭要比兩肩低 ≥ 3%、兩肩差距 ≤ 10%、頸線兩端差距 ≤ 10%（可略傾斜，突破跟「那一根的頸線價位」比）、落差 ≥ 6%、全長 20～160 根、之前有下跌。',
    target: '頸線在確認日的價位 + （頭到頸線的距離）。',
    caution: '三個低點如果高度都很接近，會被歸成三重底而不是頭肩底。',
  },
  {
    kind: 'triple_bottom',
    family: 'bottom',
    name: '三重底',
    tagline: '三次測試同一支撐區都沒跌破',
    schematic: {
      points: [[2, 8], [14, 38], [28, 18], [42, 38], [56, 18], [70, 38], [84, 18], [98, 6]],
      flat: [18, 38],
      direction: 'up',
    },
    traits: '股價三次回到同一個水平支撐區都撐住，型態比 W 底更穩固，突破頸線後力道通常較強。',
    detect: '三個低點高低差 ≤ 4%，頸線取兩個反彈高點中較高的那個；其餘同 W 底。',
    target: '頸線 + （頸線 − 三個低點平均）。',
  },
  {
    kind: 'rounded_bottom',
    family: 'bottom',
    name: '圓弧底（鍋底）',
    tagline: '漫長的 U 型盤整，賣壓逐漸耗盡',
    schematic: { points: [], curve: 'bowl', flat: [10], direction: 'up' },
    traits: '股價在底部歷經漫長的 U 型整理，賣壓慢慢消化，常被解讀為資金長時間默默布局。',
    volume: '底部量能通常最小，越往右量能越增加。',
    detect:
      '沒有明確轉折點可抓，改用二次曲線擬合一段收盤價（視窗 40～90 根）：拋物線開口朝上、頂點在視窗中段、擬合度 R² ≥ 0.85、深度 ≥ 8%、左右兩端高度差 ≤ 15%。收盤回到左緣價位以上算確認。',
    target: '沒有慣用的量測算式，不給目標價。',
    caution: '曲線擬合容易把一般的緩跌緩漲認成圓弧，要自己看圖。',
  },
  {
    kind: 'v_bottom',
    family: 'bottom',
    name: 'V 型反轉',
    tagline: '急速暴跌後以同樣的速度拉回',
    schematic: { points: [[5, 6], [40, 44], [75, 8]], direction: 'up' },
    traits: '受突發利空刺激急跌，隨後強力買盤介入、原路拉回。事前幾乎無法預測（最低點是事後才知道的）。',
    volume: '需要單日爆量才可信。',
    detect:
      '急跌 ≥ 20%、單程 ≤ 15 根、走回跌幅的 80% 以上，而且轉折日前後最大的量比 ≥ 2 倍才標出來——沒有爆量的急跌急漲太常見。',
    target: '沒有慣用的量測算式，不給目標價。',
  },
  {
    kind: 'spring',
    family: 'bottom',
    name: '破底翻（假跌破）',
    tagline: '刻意跌破支撐、洗出停損後快速拉回',
    schematic: {
      points: [[5, 12], [20, 30], [35, 16], [50, 30], [62, 40], [72, 28], [92, 10]],
      flat: [30],
      direction: 'up',
    },
    traits: '股價跌破前期關鍵支撐，誘使散戶停損，隨即在幾天內收盤站回支撐之上，常接著發動攻勢。',
    detect:
      '支撐取一個低點轉折，而且之前已有另一個低點落在它 3% 以內（被測試過兩次以上）；支撐先守住 ≥ 10 根；收盤跌破的幅度 ≤ 10%（超過就是真的崩了）；5 根之內收盤站回。',
    target: '沒有慣用的量測算式，不給目標價。',
    caution: '跌破之後沒站回來就是真跌破，要自己停損，不能因為叫「破底翻」就預設會翻。',
  },
  // ===== 頭部反轉 =====
  {
    kind: 'double_top',
    family: 'top',
    name: 'M 頭（雙重頂）',
    tagline: '兩次衝高失敗，跌破中間低點（頸線）轉弱',
    schematic: {
      points: [[5, 40], [20, 10], [40, 32], [60, 10], [78, 38], [95, 46]],
      flat: [32],
      direction: 'down',
    },
    traits: '股價兩次衝擊相近高點失敗形成雙峰，收盤跌破中間低點（頸線）才確認轉為弱勢。',
    volume: '第二個峰頂的量通常明顯萎縮，顯示買盤後勁不足；頭部型態跌破不需要量，無量下跌更可怕。',
    detect: '規則同 W 底、方向相反：兩個高點差距 ≤ 4%、頸線比高點低 ≥ 6%、之前有 ≥ 10% 的上漲。',
    target: '頸線 − （高點 − 頸線）。',
    caution: '多頭行情裡 M 頭常常失敗（價格跌破後又拉回），要看收盤是否站穩。',
  },
  {
    kind: 'head_shoulders_top',
    family: 'top',
    name: '頭肩頂',
    tagline: '左肩、頭（最高）、右肩，跌破頸線',
    schematic: {
      points: [[2, 42], [15, 20], [28, 32], [42, 6], [56, 32], [70, 20], [84, 32], [98, 44]],
      slanted: [[[28, 32], [56, 32]]],
      direction: 'down',
    },
    traits: '三個高點中間的頭最高，兩個回檔低點連成頸線，跌破頸線被視為多頭結束的強烈訊號。',
    detect: '規則同頭肩底、方向相反：頭比兩肩高 ≥ 3%、兩肩差距 ≤ 10%、頸線可略傾斜。',
    target: '頸線在確認日的價位 − （頭到頸線的距離）。',
  },
  {
    kind: 'triple_top',
    family: 'top',
    name: '三重頂',
    tagline: '三次衝擊同一壓力區都失敗',
    schematic: {
      points: [[2, 42], [14, 12], [28, 32], [42, 12], [56, 32], [70, 12], [84, 32], [98, 44]],
      flat: [12, 32],
      direction: 'down',
    },
    traits: '三次衝擊同一高檔壓力區都失敗，通常暗示賣壓沉重，跌破頸線後下殺力道大。',
    detect: '三個高點高低差 ≤ 4%，頸線取兩個回檔低點中較低的那個；其餘同 M 頭。',
    target: '頸線 − （三個高點平均 − 頸線）。',
  },
  {
    kind: 'rounded_top',
    family: 'top',
    name: '圓弧頂（倒扣鍋）',
    tagline: '高檔上漲乏力，多空緩慢拉鋸成弧形',
    schematic: { points: [], curve: 'dome', flat: [42], direction: 'down' },
    traits: '股價在高檔上漲乏力，多空慢慢拉鋸形成弧形頂部，之後量能漸縮並轉為盤跌。',
    detect: '擬合方式同圓弧底、開口朝下；收盤回到左緣價位以下算確認。',
    target: '沒有慣用的量測算式，不給目標價。',
  },
  {
    kind: 'spire_top',
    family: 'top',
    name: '倒 V 型反轉（A 轉）',
    tagline: '瘋狂飆漲後同樣急促地崩跌',
    schematic: { points: [[5, 44], [40, 6], [75, 42]], direction: 'down' },
    traits: '股價不講理地急漲（資金行情），隨後同樣不講理地崩跌，常見於暴漲暴跌的投機股。',
    detect: '急漲 ≥ 30%、單程 ≤ 15 根、跌回漲幅的 80% 以上。下殺常常是無量崩跌，所以不要求量。',
    target: '沒有慣用的量測算式，不給目標價。',
  },
  // ===== 中繼整理 =====
  {
    kind: 'rectangle',
    family: 'continuation',
    name: '箱型整理（矩形）',
    tagline: '在水平的壓力與支撐之間來回',
    schematic: {
      points: [[5, 30], [18, 12], [32, 30], [46, 12], [60, 30], [74, 12], [95, 2]],
      flat: [12, 30],
      direction: 'neutral',
    },
    traits: '股價在特定高點（壓力）與低點（支撐）之間水平震盪。突破前不預設立場：實質突破箱頂偏多、跌破箱底偏空。',
    volume: '箱內量能通常遞減；突破箱頂要量增且收盤站穩，無量突破要防假突破。',
    detect:
      '上下緣各至少碰兩次，高點彼此、低點彼此的差距 ≤ 4% 且不超過箱高的 30%，箱高 3%～45%，持續 ≥ 10 根。另外用較細的轉折尺度再找一次，才抓得到窄幅箱型。依箱高分四級（見下表）。',
    target: '突破：箱頂 + 箱高；跌破：箱底 − 箱高。',
    caution: '不要直接拿布林通道的上下軌當箱頂箱底；通道走平、收窄只能輔助確認是盤整。',
  },
  {
    kind: 'triangle_symmetrical',
    family: 'continuation',
    name: '對稱三角收斂',
    tagline: '高點越來越低、低點越來越高，面臨變盤',
    schematic: {
      points: [[5, 8], [18, 40], [32, 14], [44, 34], [56, 20], [66, 30], [85, 2]],
      slanted: [[[5, 8], [56, 20]], [[18, 40], [66, 30]]],
      direction: 'neutral',
    },
    traits: '多空力道拉鋸、波動與量能同步向右側尖端萎縮，須靜待方向突破確立。',
    volume: '收斂期間量能遞減，突破時最好放量。',
    detect:
      '用兩條趨勢線描述：高點連成上緣（逐點不回升超過 1%）、低點連成下緣（逐點不回落超過 1%），總變化各 > 3%，結束時開口 < 開始時的 80%。收盤突破上緣或跌破下緣確認。',
    target: '突破點 ± 三角形一開始的開口寬度。',
    caution: '突破前方向是未定的；三角形的趨勢線是延伸出來的，剛跌破又拉回的假突破常見。',
  },
  {
    kind: 'triangle_ascending',
    family: 'continuation',
    name: '上升三角形',
    tagline: '上緣水平壓力、下緣低點墊高',
    schematic: {
      points: [[5, 40], [20, 10], [32, 32], [46, 10], [58, 24], [72, 10], [90, 2]],
      slanted: [[[5, 40], [58, 24]]],
      flat: [10],
      direction: 'up',
    },
    traits: '上方有一條水平壓力線，下方低點不斷墊高，代表買方積極承接，屬蓄勢偏多的型態。',
    detect: '高點差距在 3% 內（水平）、低點逐步墊高，且開口收斂。',
    target: '突破點 + 三角形一開始的開口寬度。',
    caution: '偏多只是慣用的傾向，收盤突破之前不算確立；向下跌破下緣同樣會被標成「確認」，方向是下。',
  },
  {
    kind: 'triangle_descending',
    family: 'continuation',
    name: '下降三角形',
    tagline: '下緣水平支撐、上緣高點壓低',
    schematic: {
      points: [[5, 6], [20, 40], [32, 16], [46, 40], [58, 26], [72, 40], [90, 48]],
      slanted: [[[5, 6], [58, 26]]],
      flat: [40],
      direction: 'down',
    },
    traits: '下方有一條水平支撐線，上方高點不斷壓低，代表賣方急於脫手，屬蓄勢偏空的型態。',
    detect: '低點差距在 3% 內（水平）、高點逐步壓低，且開口收斂。',
    target: '跌破點 − 三角形一開始的開口寬度。',
  },
  {
    kind: 'flag_bull',
    family: 'continuation',
    name: '上升旗型',
    tagline: '急漲之後短暫的小幅回檔整理',
    schematic: {
      points: [[5, 46], [25, 8], [36, 18], [46, 12], [56, 22], [80, 2]],
      flat: [8],
      direction: 'up',
    },
    traits: '一波強勢急漲（旗桿）後展開短暫、方向相反的小幅整理，屬強勢股的休息站，突破後常複製前一波的幅度。',
    detect:
      '旗桿漲 ≥ 15%、≤ 15 根；整理 4～25 根、回檔不超過旗桿的一半、整理期間至少離開旗桿頂 2%；收盤突破旗桿頂確認。太快就突破的只是續漲，不算旗型。',
    target: '突破價 + 旗桿高度。',
  },
  {
    kind: 'flag_bear',
    family: 'continuation',
    name: '下降旗型',
    tagline: '急跌之後短暫的小幅反彈整理',
    schematic: {
      points: [[5, 4], [25, 42], [36, 32], [46, 38], [56, 28], [80, 48]],
      flat: [42],
      direction: 'down',
    },
    traits: '一波急跌後出現短暫的小幅反彈整理，之後常延續跌勢。',
    detect: '規則同上升旗型、方向相反：旗桿跌 ≥ 15%，反彈不超過旗桿的一半，收盤跌破旗桿底確認。',
    target: '跌破價 − 旗桿高度。',
  },
  {
    kind: 'broadening',
    family: 'continuation',
    name: '喇叭波（擴散三角形）',
    tagline: '高點越來越高、低點越來越低，向外擴散',
    schematic: {
      points: [[5, 26], [18, 18], [30, 34], [42, 10], [54, 42], [66, 4], [78, 48]],
      slanted: [[[18, 18], [66, 4]], [[30, 34], [78, 48]]],
      direction: 'neutral',
    },
    traits: '市場情緒狂熱而混亂，多出現在投機行情末端，暗示崩跌風險高。',
    detect: '高點逐步墊高、低點逐步降低，結束時開口 > 開始時的 120%。',
    target: '沒有慣用的量測算式，不給目標價。',
    caution: '波動變大本身就代表不確定，不要拿它當買進理由。',
  },
];

// 每個型態的偵測與目標價算式（符號版）。門檻同 PatternParams 預設值；
// 「差距」一律除以較低的那個價位，跟後端 chart_pattern_reversal.go 的口徑一致。
// 獨立成一張表而不是塞進 PATTERNS：算式是給想核對程式行為的人看的，用等寬字排版，跟敘述文字分開。
const FORMULAS: Record<PatternKind, string> = {
  double_bottom: [
    '腳差 = |腳2 − 腳1| ÷ min(腳1, 腳2) ≤ 4%',
    '落差 = (頸線 − 較高的腳) ÷ 較高的腳 ≥ 6%',
    '先跌 = 往回 60 根內最高價 ≥ 腳1 × 1.10',
    '確認：40 根內收盤 > 頸線',
    '目標價 = 頸線 + (頸線 − 腳)',
  ].join('\n'),
  double_top: [
    '峰差 = |峰2 − 峰1| ÷ min(峰1, 峰2) ≤ 4%',
    '落差 = (較低的峰 − 頸線) ÷ 較低的峰 ≥ 6%',
    '先漲 = 往回 60 根內最低價 ≤ 峰1 × 0.90',
    '確認：40 根內收盤 < 頸線',
    '目標價 = 頸線 − (高點 − 頸線)',
  ].join('\n'),
  head_shoulders_bottom: [
    '頭 ≤ 較低的肩 × (1 − 3%)',
    '肩差 = (高肩 − 低肩) ÷ 低肩 ≤ 10%',
    '頸線斜率 = (頸線高端 − 頸線低端) ÷ 頸線低端 ≤ 10%',
    '落差 = (頸線低端 − 頭) ÷ 頸線低端 ≥ 6%；全長 20～160 根；之前有下跌',
    '確認：收盤 > 確認日的頸線價位',
    '目標價 = 確認日頸線價位 + (頸線 − 頭)',
  ].join('\n'),
  head_shoulders_top: [
    '頭 ≥ 較高的肩 × (1 + 3%)',
    '肩差 = (高肩 − 低肩) ÷ 低肩 ≤ 10%',
    '頸線斜率 ≤ 10%；落差 = (頭 − 頸線高端) ÷ 頭 ≥ 6%；全長 20～160 根；之前有上漲',
    '確認：收盤 < 確認日的頸線價位',
    '目標價 = 確認日頸線價位 − (頭 − 頸線)',
  ].join('\n'),
  triple_bottom: [
    '三低點差 = (最高的低點 − 最低的低點) ÷ 最低的低點 ≤ 4%',
    '頸線 = 兩個反彈高點中較高的',
    '落差 = (頸線 − 最高的低點) ÷ 最高的低點 ≥ 6%；全長 20～160 根；之前有下跌',
    '目標價 = 頸線 + (頸線 − 三個低點平均)',
  ].join('\n'),
  triple_top: [
    '三高點差 = (最高的高點 − 最低的高點) ÷ 最低的高點 ≤ 4%',
    '頸線 = 兩個回檔低點中較低的',
    '落差 = (最低的高點 − 頸線) ÷ 最低的高點 ≥ 6%；全長 20～160 根；之前有上漲',
    '目標價 = 頸線 − (三個高點平均 − 頸線)',
  ].join('\n'),
  rounded_bottom: [
    '擬合：收盤 = a·t² + b·t + c，視窗 40～90 根',
    'a > 0（開口朝上）、頂點在視窗中段',
    'R² ≥ 0.85；深度 ≥ 8%；左右端高度差 ≤ 15%',
    '確認：收盤 ≥ 左緣價位',
    '目標價：無',
  ].join('\n'),
  rounded_top: [
    '擬合：收盤 = a·t² + b·t + c，視窗 40～90 根',
    'a < 0（開口朝下）、頂點在視窗中段',
    'R² ≥ 0.85；深度 ≥ 8%；左右端高度差 ≤ 15%',
    '確認：收盤 ≤ 左緣價位',
    '目標價：無',
  ].join('\n'),
  v_bottom: [
    '急跌 ≥ 20%，單程 ≤ 15 根',
    '走回水位 = 谷 + 0.8 × (起點 − 谷)，收盤到達才算',
    '量比 = 轉折日前後最大量 ÷ 前 20 日均量 ≥ 2.0',
    '目標價：無',
  ].join('\n'),
  spire_top: [
    '急漲 ≥ 30%，單程 ≤ 15 根',
    '走回水位 = 峰 − 0.8 × (峰 − 起點)，收盤到達才算',
    '不要求量',
    '目標價：無',
  ].join('\n'),
  spring: [
    '支撐 S：低點轉折，且之前另一低點在 S 的 3% 內',
    '先守住 ≥ 10 根',
    '跌破幅度 = (S − 最低價) ÷ S ≤ 10%',
    '確認：5 根內收盤 > S',
    '目標價：無',
  ].join('\n'),
  rectangle: [
    '壓力 R、支撐 S；高點彼此、低點彼此差距 ≤ min(4%, 0.3 × 箱高占比)',
    '箱高 H = R − S；H ÷ S 在 3%～45%；持續 ≥ 10 根',
    '細尺度另找一次（反轉門檻 × 0.5、下限 2.5%），抓窄幅箱型',
    '突破目標 = R + H；跌破目標 = S − H',
  ].join('\n'),
  triangle_symmetrical: [
    '上緣：高點逐點不回升超過 1%；下緣：低點逐點不回落超過 1%',
    '總變化各 > 3%',
    '開口 W = 上緣 − 下緣；結束 W < 開始 W × 0.8',
    '突破目標 = 上緣突破價 + 開始 W；跌破目標 = 下緣跌破價 − 開始 W',
  ].join('\n'),
  triangle_ascending: [
    '高點差距 ≤ 3%（上緣水平）；低點逐步墊高',
    '結束 W < 開始 W × 0.8',
    '突破目標 = 上緣突破價 + 開始 W',
  ].join('\n'),
  triangle_descending: [
    '低點差距 ≤ 3%（下緣水平）；高點逐步壓低',
    '結束 W < 開始 W × 0.8',
    '跌破目標 = 下緣跌破價 − 開始 W',
  ].join('\n'),
  flag_bull: [
    '旗桿高度 P = 桿頂 − 桿底；P ÷ 桿底 ≥ 15%，桿長 ≤ 15 根',
    '整理 4～25 根；回檔低點 ≥ 桿頂 − 0.5 × P；離開桿頂 ≥ 2%',
    '確認：收盤 > 桿頂',
    '目標價 = 突破價 + P',
  ].join('\n'),
  flag_bear: [
    '旗桿高度 P = 桿頂 − 桿底；跌幅 ≥ 15%，桿長 ≤ 15 根',
    '整理 4～25 根；反彈高點 ≤ 桿底 + 0.5 × P',
    '確認：收盤 < 桿底',
    '目標價 = 跌破價 − P',
  ].join('\n'),
  broadening: [
    '高點逐步墊高、低點逐步降低',
    '開口 W：結束 W > 開始 W × 1.2',
    '目標價：無',
  ].join('\n'),
};

const FAMILY_SECTIONS: { key: PatternFamily; title: string; note: string }[] = [
  { key: 'bottom', title: '底部反轉', note: '下跌趨勢可能結束，預期往上。' },
  { key: 'top', title: '頭部反轉', note: '上漲趨勢可能結束，預期往下。' },
  { key: 'continuation', title: '中繼整理', note: '趨勢中的暫停，突破的方向決定接下來怎麼走。' },
];

const BOX_SIZES = [
  { name: '窄幅箱型', range: '約 3～8%', time: '數天～數週' },
  { name: '一般箱型', range: '約 8～15%', time: '2～8 週' },
  { name: '寬幅箱型', range: '約 15～25%', time: '1～3 個月' },
  { name: '大型箱型', range: '25% 以上', time: '數個月以上' },
];

const GAPS = [
  {
    name: '突破缺口',
    tag: 'breakaway',
    text: '最具參考價值：整理箱之後，伴隨大成交量直接跳過箱頂（箱底）或關鍵壓力區，暗示新一波趨勢啟動。',
    rule: '缺口前 20 根在整理箱裡（箱高 ≤ 18%、淨變動 ≤ 8%），缺口跳過箱頂（箱底），當天量 ≥ 前 20 日平均的 1.5 倍。',
  },
  {
    name: '逃逸缺口（中繼缺口）',
    tag: 'runaway',
    text: '出現在波段漲勢或跌勢的中途，通常代表行情正處於主升段或主跌段。',
    rule: '缺口之前 20 根已朝同方向走了 ≥ 8%。',
  },
  {
    name: '竭盡缺口',
    tag: 'exhaustion',
    text: '出現在長期趨勢末端（末升段跳空暴漲、末跌段跳空暴跌），隨後幾天缺口若被快速回補，暗示行情正式見頂或見底。',
    rule: '缺口之前 60 根同方向走了 ≥ 25%，而且 5 根之內缺口被回補。要等幾天才分得出來，太新的缺口之後可能改判。',
  },
  {
    name: '普通缺口',
    tag: 'common',
    text: '出現在盤整箱型中，不具趨勢意義，短期內極易被回補。',
    rule: '不符合以上三種的缺口（至少 1%）。除權息當天的缺口不算——收盤價沒有還原權值，那是價格調整不是市場行為。',
  },
];

// 回測快照。數字抄自後端 `cmd/patternstudy` 的 -launch 與 -downtrend，跑的時間與條件寫在畫面上：
// 資料一更新數字就會不一樣，這是「那一天跑出來的結果」不是會自己更新的統計，重跑要回來改。
const BACKTEST_DATE = '2026-10-21';

const LAUNCH_ROWS = [
  { name: '全部', n: '約 1,300', x5: '-0.10%', w5: '44%', x20: '+0.19%', w20: '41%' },
  { name: '突破日有量（量比 ≥ 1.5 倍）', n: '約 830', x5: '-0.14%', w5: '43%', x20: '+0.17%', w20: '41%' },
  { name: '突破日量比 ≥ 2 倍', n: '約 660', x5: '-0.16%', w5: '42%', x20: '-0.19%', w20: '40%' },
  { name: '突破日沒量（量比 < 1.5 倍）', n: '約 490', x5: '-0.07%', w5: '44%', x20: '+0.04%', w20: '41%' },
];

const BREAK_ROWS = [
  { name: '全部跌破前低', n: '約 1,150', x5: '-0.66%', w5: '59%', x20: '-1.74%', w20: '62%' },
  { name: '跌破時已在下跌趨勢中', n: '約 155', x5: '-1.19%', w5: '59%', x20: '-5.01%', w20: '73%' },
  { name: '跌破時還不在下跌趨勢', n: '約 990', x5: '-0.57%', w5: '59%', x20: '-1.23%', w20: '61%' },
];

// 目標價命中率快照。數字抄自後端 `cmd/patternstudy`（不加旗標的預設模式）的「碰到量測目標」，
// 同樣是「那一天跑出來的結果」：資料更新後要重跑再回來改，日期與條件不能拿掉。
const TARGET_HIT_DATE = '2026-11-23';

const TARGET_HIT_ROWS = [
  { name: 'W 底（雙重底）', direction: '看漲', hit: 333, n: 536 },
  { name: '頭肩底', direction: '看漲', hit: 53, n: 114 },
  { name: '三重底', direction: '看漲', hit: 34, n: 59 },
  { name: 'M 頭（雙重頂）', direction: '看跌', hit: 414, n: 662 },
  { name: '頭肩頂', direction: '看跌', hit: 65, n: 136 },
  { name: '三重頂', direction: '看跌', hit: 36, n: 66 },
];

const cardClass = 'bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm';

/** 示意圖：100 × 50 的小圖，顏色跟個股總覽疊圖用同一組（看漲青藍、看跌橘、方向未定紫）。 */
function Diagram({ schematic }: { schematic: Schematic }) {
  const color = directionClasses(schematic.direction);
  const line: Point[] = schematic.curve === 'bowl' ? bowl() : schematic.curve === 'dome' ? dome() : schematic.points;
  return (
    <svg viewBox="0 0 100 52" className="w-full h-auto" role="img" aria-hidden="true">
      {(schematic.flat ?? []).map((y) => (
        <line
          key={y}
          x1="2"
          x2="98"
          y1={y}
          y2={y}
          strokeWidth="0.8"
          strokeDasharray="2 2"
          className="stroke-outline"
        />
      ))}
      {(schematic.slanted ?? []).map(([a, b], i) => (
        <line
          key={i}
          x1={a[0]}
          y1={a[1]}
          x2={b[0] + (b[0] - a[0]) * 0.25}
          y2={b[1] + (b[1] - a[1]) * 0.25}
          strokeWidth="0.8"
          strokeDasharray="2 2"
          className="stroke-outline"
        />
      ))}
      <polyline
        points={line.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={color.stroke}
      />
      {!schematic.curve &&
        schematic.points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" className={color.fill} />)}
    </svg>
  );
}

interface BacktestRow {
  name: string;
  n: string;
  x5: string;
  w5: string;
  x20: string;
  w20: string;
}

function BacktestTable({
  title,
  rows,
  note,
  weakColumns = false,
}: {
  title: string;
  rows: BacktestRow[];
  note: string;
  weakColumns?: boolean;
}) {
  const th = 'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right';
  const td = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';
  const winLabel = weakColumns ? '弱於大盤' : '贏大盤';
  return (
    <div className="flex flex-col gap-stack-sm">
      <h3 className="font-body-md text-body-md text-on-surface font-semibold">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-container-low border-b border-outline-variant">
            <tr>
              <th className="p-2 pl-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">
                分組
              </th>
              <th className={th}>件數</th>
              <th className={th}>5 日超額</th>
              <th className={th}>{winLabel}</th>
              <th className={th}>20 日超額</th>
              <th className={th}>{winLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {rows.map((row) => (
              <tr key={row.name} className="hover:bg-surface-container-low/50 transition-colors">
                <td className="p-2 pl-4 py-3 font-body-md text-body-md">{row.name}</td>
                <td className={td}>{row.n}</td>
                <td className={td}>{row.x5}</td>
                <td className={td}>{row.w5}</td>
                <td className={td}>{row.x20}</td>
                <td className={td}>{row.w20}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{note}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">{label}</span>
      <span className="font-body-sm text-body-sm text-on-surface">{children}</span>
    </div>
  );
}

function PatternCard({ doc }: { doc: PatternDoc }) {
  const color = directionClasses(doc.schematic.direction);
  return (
    <article className={`${cardClass} p-4 flex flex-col gap-stack-sm`}>
      <div className="flex gap-stack-md items-start">
        <div className="w-32 sm:w-40 shrink-0 rounded-lg bg-surface-container-low p-2">
          <Diagram schematic={doc.schematic} />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className={`font-headline-md text-headline-md ${color.text}`}>{doc.name}</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{doc.tagline}</p>
        </div>
      </div>
      <Field label="特徵與解讀">{doc.traits}</Field>
      {doc.volume && <Field label="量能">{doc.volume}</Field>}
      <Field label="我們怎麼偵測">{doc.detect}</Field>
      <div className="flex flex-col gap-0.5">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">公式</span>
        <pre className="m-0 rounded-lg bg-surface-container-low p-2 font-data-md text-data-md text-on-surface whitespace-pre-wrap break-words">
          {FORMULAS[doc.kind]}
        </pre>
      </div>
      <Field label="目標價">{doc.target}</Field>
      {doc.caution && <Field label="容易誤判">{doc.caution}</Field>}
    </article>
  );
}

type CalcKey = 'reversal' | 'box' | 'triangle' | 'flag' | 'volume' | 'bollinger' | 'range';

const CALCS: { key: CalcKey; label: string }[] = [
  { key: 'reversal', label: '反轉型態目標價（W 底、M 頭、頭肩、三重）' },
  { key: 'box', label: '箱型整理目標價' },
  { key: 'triangle', label: '三角形目標價' },
  { key: 'flag', label: '旗型目標價' },
  { key: 'volume', label: '量比' },
  { key: 'bollinger', label: '布林 %b 與頻寬' },
  { key: 'range', label: '盤整區間比' },
];

const inputClass =
  'w-full rounded border border-outline-variant bg-surface-container px-3 py-2 font-data-md text-data-md text-on-surface';

// 輸入框用字串存：空字串是「還沒填」，不能先轉成 0，否則算出來的目標價與比例都是假的。
function NumInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">{label}</span>
      <input
        className={inputClass}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
      />
    </label>
  );
}

function ResultRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-outline-variant/50 py-2 last:border-b-0">
      <span className="font-body-md text-body-md text-on-surface-variant">{label}</span>
      <span className="font-data-md text-data-md text-on-surface">
        {value}
        {note && <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">{note}</span>}
      </span>
    </div>
  );
}

const pct = (ratio: number | null) => (ratio === null ? DASH : formatPercent(ratio * 100, 2));
const move = (price: number | null, target: number | null) => {
  const m = moveToTarget(price, target);
  return m === null ? DASH : `${m > 0 ? '+' : ''}${formatNumber(m, 1)}%`;
};

function FormulaCalculator() {
  const [calc, setCalc] = useState<CalcKey>('reversal');
  const [v, setV] = useState<Record<string, string>>({});
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const set = (k: string) => (x: string) => setV((prev) => ({ ...prev, [k]: x }));
  const n = (k: string) => parseInput(v[k] ?? '');
  const price = n('price');

  let body: ReactNode = null;
  if (calc === 'reversal') {
    const neck = n('neck');
    const ext = n('ext');
    const target = reversalTarget(neck, ext);
    const up = neck !== null && ext !== null && ext < neck;
    const depth = depthRatio(neck, ext);
    body = (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-stack-sm">
          <NumInput label="頸線" hint="110" value={v.neck ?? ''} onChange={set('neck')} />
          <NumInput label="極值（腳、頭、或三點平均）" hint="100" value={v.ext ?? ''} onChange={set('ext')} />
          <NumInput label="現價（選填）" hint="108" value={v.price ?? ''} onChange={set('price')} />
        </div>
        <div className="flex flex-col">
          <ResultRow label="方向" value={target === null ? DASH : up ? '往上（底部型態）' : '往下（頭部型態）'} />
          <ResultRow
            label="型態高度占極值"
            value={pct(depth)}
            note={depth !== null && depth < 0.06 ? '低於 6%，後端不會把它標成型態' : undefined}
          />
          <ResultRow label="目標價" value={target === null ? DASH : formatPrice(target)} note="頸線 ± (頸線 − 極值)" />
          <ResultRow label="現價到目標價" value={move(price, target)} />
        </div>
      </>
    );
  } else if (calc === 'box') {
    const r = boxTargets(n('top'), n('bottom'));
    body = (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-stack-sm">
          <NumInput label="箱頂（壓力）" hint="110" value={v.top ?? ''} onChange={set('top')} />
          <NumInput label="箱底（支撐）" hint="100" value={v.bottom ?? ''} onChange={set('bottom')} />
          <NumInput label="現價（選填）" hint="105" value={v.price ?? ''} onChange={set('price')} />
        </div>
        <div className="flex flex-col">
          <ResultRow
            label="箱高"
            value={r === null ? DASH : formatPrice(r.height)}
            note={r === null ? undefined : `占箱底 ${pct(r.heightPct)}${r.heightPct < 0.03 || r.heightPct > 0.45 ? '，超出 3%～45%' : ''}`}
          />
          <ResultRow label="突破目標價" value={r === null ? DASH : formatPrice(r.up)} note="箱頂 + 箱高" />
          <ResultRow label="現價到突破目標" value={move(price, r?.up ?? null)} />
          <ResultRow label="跌破目標價" value={r === null ? DASH : formatPrice(r.down)} note="箱底 − 箱高" />
          <ResultRow label="現價到跌破目標" value={move(price, r?.down ?? null)} />
        </div>
      </>
    );
  } else if (calc === 'triangle' || calc === 'flag') {
    const isFlag = calc === 'flag';
    const start = n('start');
    const end = n('end');
    const width = isFlag ? (start !== null && end !== null ? Math.abs(end - start) : null) : n('width');
    const flagDir = start !== null && end !== null ? (end > start ? 'up' : 'down') : dir;
    const useDir = isFlag ? flagDir : dir;
    const target = measuredTarget(n('breakout'), width, useDir);
    body = (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-stack-sm">
          {isFlag ? (
            <>
              <NumInput label="旗桿起點" hint="100" value={v.start ?? ''} onChange={set('start')} />
              <NumInput label="旗桿終點" hint="120" value={v.end ?? ''} onChange={set('end')} />
            </>
          ) : (
            <NumInput label="一開始的開口寬度（上緣 − 下緣）" hint="20" value={v.width ?? ''} onChange={set('width')} />
          )}
          <NumInput label="突破（跌破）價" hint="118" value={v.breakout ?? ''} onChange={set('breakout')} />
          <NumInput label="現價（選填）" hint="118" value={v.price ?? ''} onChange={set('price')} />
          {!isFlag && (
            <label className="flex flex-col gap-0.5">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">方向</span>
              <select className={inputClass} value={dir} onChange={(e) => setDir(e.target.value as 'up' | 'down')}>
                <option value="up">向上突破</option>
                <option value="down">向下跌破</option>
              </select>
            </label>
          )}
        </div>
        <div className="flex flex-col">
          {isFlag && (
            <ResultRow
              label="旗桿高度"
              value={width === null ? DASH : formatPrice(width)}
              note={
                width !== null && start !== null && end !== null && Math.min(start, end) > 0 && width / Math.min(start, end) < 0.15
                  ? '桿高占比低於 15%，後端不會標成旗型'
                  : undefined
              }
            />
          )}
          <ResultRow label="目標價" value={target === null ? DASH : formatPrice(target)} note={isFlag ? '突破 ± 旗桿高度' : '突破 ± 開口寬度'} />
          <ResultRow label="現價到目標價" value={move(price, target)} />
        </div>
      </>
    );
  } else if (calc === 'volume') {
    const ratio = volumeRatio(n('vol'), n('avg'));
    body = (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-stack-sm">
          <NumInput label="當日成交量" hint="30000" value={v.vol ?? ''} onChange={set('vol')} />
          <NumInput label="前 20 日平均量（同單位）" hint="20000" value={v.avg ?? ''} onChange={set('avg')} />
        </div>
        <div className="flex flex-col">
          <ResultRow label="量比" value={ratio === null ? DASH : `${formatNumber(ratio, 2)} 倍`} />
          <ResultRow
            label={`是否達 ${VOLUME_HEAVY} 倍（有量）`}
            value={ratio === null ? DASH : ratio >= VOLUME_HEAVY ? '有量' : '沒有達門檻'}
          />
        </div>
      </>
    );
  } else if (calc === 'bollinger') {
    const pb = percentB(n('close'), n('upper'), n('lower'));
    const bw = bandwidth(n('upper'), n('lower'), n('mid'));
    body = (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-stack-sm">
          <NumInput label="收盤" hint="105" value={v.close ?? ''} onChange={set('close')} />
          <NumInput label="上軌" hint="110" value={v.upper ?? ''} onChange={set('upper')} />
          <NumInput label="下軌" hint="90" value={v.lower ?? ''} onChange={set('lower')} />
          <NumInput label="中軌（算頻寬用）" hint="100" value={v.mid ?? ''} onChange={set('mid')} />
        </div>
        <div className="flex flex-col">
          <ResultRow label="%b" value={pb === null ? DASH : formatNumber(pb, 2)} note="（收盤 − 下軌）÷（上軌 − 下軌）" />
          <ResultRow label="頻寬" value={pct(bw)} note="（上軌 − 下軌）÷ 中軌" />
        </div>
      </>
    );
  } else {
    const r = rangeRatio(n('high'), n('low'), n('avg'));
    body = (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-stack-sm">
          <NumInput label="區間最高價" hint="110" value={v.high ?? ''} onChange={set('high')} />
          <NumInput label="區間最低價" hint="95" value={v.low ?? ''} onChange={set('low')} />
          <NumInput label="區間平均收盤" hint="102" value={v.avg ?? ''} onChange={set('avg')} />
        </div>
        <div className="flex flex-col">
          <ResultRow
            label="區間比"
            value={pct(r)}
            note={r === null ? undefined : r <= 0.2 ? '≤ 20%，算盤整' : '> 20%，不算盤整'}
          />
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這條不是型態偵測的門檻，是 2026-11-24 檢定「盤整＋帶量突破＋大戶增持」時用的定義（前 30 個交易日、20%）。
          264 檔、約兩年的結果：這個組合之後 40 日先漲 20% 的比例（32%）沒有比隨便挑一天（35%）高，大戶增持也沒有加分，
          所以這個算式只用來量「這段有多窄」，不是進場條件。
        </p>
      </>
    );
  }

  return (
    <section className={`${cardClass} p-6 flex flex-col gap-stack-md`}>
      <div className="flex flex-col gap-1">
        <h2 className="font-headline-md text-headline-md text-primary">公式試算</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          填入價位自己算一次，核對圖上型態的目標價與量比。算式同上面各型態的「公式」；缺一個欄位就顯示破折號，不會補 0。
          這是幾何算術，不是預測：目標價沒有驗證過價格真的會走到。
        </p>
      </div>
      <label className="flex flex-col gap-0.5 max-w-md">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">要算什麼</span>
        <select className={inputClass} value={calc} onChange={(e) => setCalc(e.target.value as CalcKey)}>
          {CALCS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {body}
    </section>
  );
}

export default function ChartPatterns() {
  return (
    <>
      <PageHeader
        title="技術型態圖鑑"
        subtitle="個股總覽「價格走勢」疊出來的十八種型態與四種跳空缺口，怎麼看、怎麼偵測、目標價怎麼算"
      />

      <div className="flex flex-col gap-stack-lg">
        <section className={`${cardClass} p-6 flex flex-col gap-stack-sm`}>
          <h2 className="font-headline-md text-headline-md text-primary">先讀這三條</h2>
          <ol className="list-decimal pl-5 flex flex-col gap-1 font-body-md text-body-md text-on-surface">
            <li>
              <span className="font-semibold">確認之前不預設立場。</span>
              型態畫得再漂亮，沒有「帶量、收盤實質突破（跌破）頸線」之前都還沒確立。畫面上實線是已確認、虛線加問號是形成中。
            </li>
            <li>
              <span className="font-semibold">量價配合。</span>
              底部型態突破要有量才是真突破（量比 ≥ 1.5 倍）；頭部型態跌破不需要量，無量下跌更可怕。
              突破後再看收盤有沒有站穩，收回線內要防範假突破。
            </li>
            <li>
              <span className="font-semibold">這是機械規則抓的現況描述，不是買賣訊號。</span>
              所有門檻都是經驗值、沒有檢定過出現後的表現。全市場回測（262 檔、同一段多頭期間）各型態結果參差：W 底、三重底等底部型態確認後的超額報酬多半沒有正面表現，
              部分整理型態（旗型、三角形）略好，但樣本互相重疊也沒做顯著性檢定，不能當結論，請把它當輔助標記。
            </li>
          </ol>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            偵測方式：先用反轉幅度法（ZigZag）把日 K 化簡成高低交替的轉折點，門檻跟著那一檔自己的波動走（細、粗兩個尺度各抓一次），
            再在轉折點上套各型態的規則。
            同一段走勢常被好幾個型態名稱重複認出來，所以個股總覽預設只列「主要判讀」（同一類別同一方向、涵蓋日期重疊過半的只留最晚結束的一個）；
            確認之後 10 個交易日內收盤又回到突破線另一側（超過一個跟該檔波動連動的門檻）的標「失敗」，收起來不當成有效型態。日 K 沒有還原權值，型態期間有除權息日的會標「含除權息」，轉折點與落差會失真。
          </p>
        </section>

        {FAMILY_SECTIONS.map((section) => (
          <section key={section.key} className="flex flex-col gap-stack-md">
            <div className="flex flex-wrap items-baseline gap-stack-sm">
              <h2 className="font-headline-md text-headline-md text-primary">{section.title}</h2>
              <span className="font-body-sm text-body-sm text-on-surface-variant">{section.note}</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-stack-md">
              {PATTERNS.filter((doc) => doc.family === section.key).map((doc) => (
                <PatternCard key={doc.kind} doc={doc} />
              ))}
            </div>
          </section>
        ))}

        <section className="flex flex-col gap-stack-md">
          <h2 className="font-headline-md text-headline-md text-primary">箱型整理的一般範圍</h2>
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="p-2 pl-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">類型</th>
                  <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">箱高（高低點價差）</th>
                  <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">常見整理時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {BOX_SIZES.map((box) => (
                  <tr key={box.name} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-2 pl-4 py-3 font-body-md text-body-md">{box.name}</td>
                    <td className="p-2 py-3 font-data-md text-data-md">{box.range}</td>
                    <td className="p-2 py-3 font-body-md text-body-md">{box.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            這是實務上的粗略參考，不是固定的技術分析標準；高波動個股、題材股或小型股的箱型可能更寬。圖上箱型標籤會寫箱高百分比與整理了幾個交易日。
            找箱型的流程：先用日 K 高低點結構定箱頂箱底（至少兩個相近高點、兩個相近低點），再用布林通道輔助確認盤整
            （走平、寬度收窄，<span className="text-on-surface">不要直接拿上下軌當箱頂箱底</span>），最後看突破箱頂時有沒有量增、收盤有沒有站穩。
          </p>
        </section>

        <section className="flex flex-col gap-stack-md">
          <h2 className="font-headline-md text-headline-md text-primary">跳空缺口</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-stack-md">
            {GAPS.map((gap) => (
              <article key={gap.tag} className={`${cardClass} p-4 flex flex-col gap-stack-sm`}>
                <h3 className={`font-headline-md text-headline-md ${GAP_CLASSES.text}`}>{gap.name}</h3>
                <Field label="特徵與解讀">{gap.text}</Field>
                <Field label="我們怎麼分類">{gap.rule}</Field>
              </article>
            ))}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            缺口分類是機械規則判斷的，邊界很主觀（多久算長期趨勢、多少算帶量），門檻沒有檢定過。圖上缺口用琥珀色塊標出範圍，已回補的用虛線淡化，箭頭表示方向（↑ 向上、↓ 向下）。
          </p>
        </section>

        <FormulaCalculator />

        <section className="flex flex-col gap-stack-md">
          <h2 className="font-headline-md text-headline-md text-primary">
            全市場回測
            <span className="font-body-sm text-body-sm text-on-surface-variant font-normal">　{BACKTEST_DATE} 快照</span>
          </h2>
          <BacktestTable
            title="看漲型態確認當天（「剛突破」）"
            rows={LAUNCH_ROWS}
            note="事件＝看漲型態收盤突破確認的那一天，同一檔同一天只算一次，共約 1,350 件。用確認當天收盤往後看第 5、20 個交易日的報酬，扣掉同一天全部股票往後同樣天數的平均（超額）。「贏大盤」是事件中超額為正的比例。"
          />
          <BacktestTable
            title="跌破前低（「破底」）"
            rows={BREAK_ROWS}
            note="事件＝收盤跌破最近一個已確認的波段低點（第一次跌破）。超額為負代表之後比大盤弱，「弱於大盤」欄位是超額為負的比例，數字越高越偏弱。"
            weakColumns
          />
          <div className="font-body-sm text-body-sm text-on-surface-variant flex flex-col gap-1">
            <p>
              <span className="text-on-surface">怎麼讀：</span>
              剛突破的事件，有量與沒量的差別很小（20 日超額 +0.17% 對 +0.04%），量比 ≥ 2 倍反而是 -0.19%；
              全部事件的「贏大盤」比例（41%～44%）跟一般股票隨便挑一天的基準差不多——這段資料偏多頭、報酬右偏，
              隨便挑一檔股票的一天，贏過當天平均的機率本來就只有約 41%。所以看不出「型態確認＋有量」能事先挑出之後比較強的股票。
              相對有區別的只有「已經在下跌趨勢中又跌破前低」：之後 20 日平均弱於大盤約 5%，73% 的事件偏弱（一般日子約 59%）。
            </p>
            <p>
              <span className="text-on-surface">另一份較新的檢定（2026-11-24）：</span>
              改成同檔 10 日內只算一次、同一週的事件合成一群再重抽樣，看跌反轉型態（M 頭、頭肩頂等）確認後 20 日平均弱於大盤約 1.9%
              （95% 區間 +0.7%～+3.4%，前後半期方向一致），看漲反轉型態反而略差於大盤（約 −1.2%）。也就是「續弱」比「反轉」有證據，
              但幅度小、只有約兩年的單一行情、沒控制 beta、也沒扣成本，不能當成進出場規則。完整數字與圖在「研究報告」的〈技術型態與技術位置〉。
            </p>
            <p>
              <span className="text-on-surface">限制：</span>
              自選股 262 檔、同一段多頭期間、只有現在還有資料的股票（存活者偏誤）、同一檔的事件互相重疊、沒做顯著性檢定，
              不能當結論。只用確認當天看得到的條件，沒有拿「突破後三根站穩」分組，因為那要等三天，拿來分組會偷看未來。
              這是快照，資料更新後數字會變，重跑用後端的 <code>patternstudy -launch</code> 與 <code>-downtrend</code>。
            </p>
          </div>
        </section>

        <section className={`${cardClass} p-6 flex flex-col gap-stack-sm`}>
          <h2 className="font-headline-md text-headline-md text-primary">布林通道與 %b</h2>
          <p className="font-body-md text-body-md text-on-surface">
            個股總覽「價格走勢」的「布林」按鈕畫的是 20 日、2 倍標準差的通道：中軌是 20 日收盤均線，上下軌是中軌加減 2 倍標準差
            （母體公式，除以 n，跟券商軟體一致）。開著的時候圖上方多一行 <span className="font-semibold">%b</span>。
          </p>
          <div className="font-body-sm text-body-sm text-on-surface-variant flex flex-col gap-1">
            <p>
              <span className="text-on-surface">%b ＝ （收盤 − 下軌）÷（上軌 − 下軌）。</span>
              0 在下軌、0.5 在中軌、1 在上軌，可以小於 0 或大於 1（收在軌道之外）。
              例：下軌 90、上軌 110，收 105，%b = (105 − 90) ÷ 20 = <span className="font-data-md text-data-md text-on-surface">0.75</span>。
            </p>
            <p>
              它是乖離的一種，只是尺子換成波動：乖離率量「離均線幾 %」，%b 量「離均線幾個標準差」，所以高波動股的通道自然比較寬，
              同樣是 %b = 1，極端程度比固定百分比更可比。代價是波動剛放大時下軌被拉遠，%b 不容易小於 0。
            </p>
            <p>
              <span className="text-on-surface">頻寬</span>＝（上軌 − 下軌）÷ 中軌，量通道有多寬。頻寬收窄、中軌走平是盤整的特徵，
              %b 再告訴你價格偏向通道的哪一側。
            </p>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            <span className="text-on-surface">怎麼讀、不怎麼讀：</span>
            有兩種互相矛盾的讀法——盤整時把「大於 1」當過熱、「小於 0」當超跌；趨勢時強勢股會長時間貼著上軌（%b 持續大於 0.8），
            那是強的特徵不是賣訊。要看當下是盤整還是趨勢才選得出讀法，單看 %b 分不出來。
            前 19 根與 20 日收盤完全沒變（上下軌重合）時算不出來，畫面顯示破折號，不是 0。
            這個數值<span className="text-on-surface">沒有檢定過</span>，只當位置描述，不是進出場訊號；本站檢定過的其他技術訊號（站回月線、W 底與 M 頭、KD）都沒有穩定的優勢。
          </p>
        </section>

        <section className={`${cardClass} p-6 flex flex-col gap-stack-sm`}>
          <h2 className="font-headline-md text-headline-md text-primary">目標價與同期籌碼</h2>
          <p className="font-body-md text-body-md text-on-surface">
            目標價是傳統的量測算式：<span className="font-semibold">突破線再往突破方向走一個型態高度</span>，
            只是幾何算術，沒有驗證過價格真的會走到，也不是分析師目標價。V 型、倒 V、圓弧、破底翻與喇叭波沒有慣用算式，不給目標價。
          </p>
          <div className="font-body-sm text-body-sm text-on-surface-variant flex flex-col gap-1">
            <p>
              <span className="text-on-surface">算式與例子：</span>
              W 底＝頸線 +（頸線 − 腳的價位）。兩隻腳在 100、頸線在 110，型態高度是 10，目標價 = 110 + 10 = <span className="font-data-md text-data-md text-on-surface">120</span>。
            </p>
            <p>
              M 頭＝頸線 −（高點 − 頸線）。兩個高點在 100、頸線在 90，目標價 = 90 − 10 = <span className="font-data-md text-data-md text-on-surface">80</span>。
              頭肩型取頭到頸線的距離，三重型用三個極值的平均，細節見上面各型態的「目標價」。
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-body-md text-body-md text-on-surface font-semibold">
              實測有多少碰到目標價
              <span className="font-body-sm text-body-sm text-on-surface-variant font-normal">　{TARGET_HIT_DATE} 快照</span>
            </h3>
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className="p-2 pl-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">型態</th>
                    <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">方向</th>
                    <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">已確認</th>
                    <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">碰到目標</th>
                    <th className="p-2 pr-4 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">比例</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {TARGET_HIT_ROWS.map((row) => (
                    <tr key={row.name} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="p-2 pl-4 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">{row.name}</td>
                      <td className="p-2 py-3 font-body-md text-body-md text-on-surface-variant">{row.direction}</td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md">{row.n}</td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md">{row.hit}</td>
                      <td className="p-2 pr-4 py-3 text-right font-data-md text-data-md">{Math.round((row.hit / row.n) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              口徑：確認日之後，盤中最高（看跌是最低）<span className="text-on-surface">曾經</span>碰到目標價就算，
              <span className="text-on-surface">沒有時間限制</span>，看到資料最後一天為止。所以越早確認的型態有越多時間碰到，
              比例會偏高；它回答「有沒有碰過」，不是「幾天內會到」，也不是「碰到之後賺不賺」。
              自選股 262 檔、2024-09～2026-11、同一段多頭、只有現在還有資料的股票（存活者偏誤），型態之間互相重疊，沒做顯著性檢定。
              沒有慣用目標價的型態不列。這是快照，重跑用後端 <code>patternstudy</code>（不加旗標）。
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              <span className="text-on-surface">怎麼讀：</span>
              碰到目標價的比例約 46%～63%，但同一份資料裡這幾種型態確認後 20 日「順著預期方向」的超額報酬並不一致
              （W 底 −1.55%、M 頭 +2.64%，正數代表之後比大盤更偏向預期方向）。碰到目標價不等於型態有預測力：
              目標價離確認價多遠、期間股價自然漲跌多少都會影響，沒有扣掉。
            </p>
          </div>
          <p className="font-body-md text-body-md text-on-surface">
            型態清單的「同期籌碼」站在型態確認那天看這一檔算不算<span className="font-semibold">籌碼亂</span>：集保近 4 週大戶（400 張以上）持股減少、
            散戶（50 張以下）增加，各 ≥ 總庫存 0.3%，而且有法人近 5 日賣超（≥ 總庫存 0.1%）或融資近 5 日增加（≥ 3%）佐證。
            籌碼資料的歷史很短（集保約十週、法人與融資只落地自選股），型態確認得更早的會顯示「資料不足」，那不是籌碼穩。
          </p>
        </section>
      </div>
    </>
  );
}
