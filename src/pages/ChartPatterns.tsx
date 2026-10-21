import { ReactNode } from 'react';
import PageHeader from '../components/PageHeader';
import { PatternKind } from '../api/types';
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
      <Field label="目標價">{doc.target}</Field>
      {doc.caution && <Field label="容易誤判">{doc.caution}</Field>}
    </article>
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
              <span className="text-on-surface">限制：</span>
              自選股 262 檔、同一段多頭期間、只有現在還有資料的股票（存活者偏誤）、同一檔的事件互相重疊、沒做顯著性檢定，
              不能當結論。只用確認當天看得到的條件，沒有拿「突破後三根站穩」分組，因為那要等三天，拿來分組會偷看未來。
              這是快照，資料更新後數字會變，重跑用後端的 <code>patternstudy -launch</code> 與 <code>-downtrend</code>。
            </p>
          </div>
        </section>

        <section className={`${cardClass} p-6 flex flex-col gap-stack-sm`}>
          <h2 className="font-headline-md text-headline-md text-primary">目標價與同期籌碼</h2>
          <p className="font-body-md text-body-md text-on-surface">
            目標價是傳統的量測算式：<span className="font-semibold">突破線再往突破方向走一個型態高度</span>，
            只是幾何算術，沒有驗證過價格真的會走到，也不是分析師目標價。V 型、倒 V、圓弧、破底翻與喇叭波沒有慣用算式，不給目標價。
          </p>
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
