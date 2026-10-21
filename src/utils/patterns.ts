// 價格型態與跳空缺口的顯示用常數與判斷。純函式，不碰畫面也不碰 api。

import { ChartPattern, GapKind, PatternKind } from '../api/types';

export type PatternFamily = 'bottom' | 'top' | 'continuation';

export const FAMILIES: { key: PatternFamily | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'bottom', label: '底部反轉' },
  { key: 'top', label: '頭部反轉' },
  { key: 'continuation', label: '中繼整理' },
];

/**
 * 每種型態的中文名稱、所屬分類，以及圖上的畫法。
 *
 * line＝要不要把轉折點連成折線：反轉型態與旗型連起來才看得出形狀；箱型、三角形、喇叭
 * 是用兩條邊界線描述的，再連折線只會跟邊界線疊在一起，所以只畫轉折點的圓點。
 */
export const PATTERN_INFO: Record<PatternKind, { name: string; family: PatternFamily; line: boolean }> = {
  double_bottom: { name: 'W 底', family: 'bottom', line: true },
  head_shoulders_bottom: { name: '頭肩底', family: 'bottom', line: true },
  triple_bottom: { name: '三重底', family: 'bottom', line: true },
  rounded_bottom: { name: '圓弧底', family: 'bottom', line: false },
  v_bottom: { name: 'V 型反轉', family: 'bottom', line: true },
  spring: { name: '破底翻', family: 'bottom', line: true },
  double_top: { name: 'M 頭', family: 'top', line: true },
  head_shoulders_top: { name: '頭肩頂', family: 'top', line: true },
  triple_top: { name: '三重頂', family: 'top', line: true },
  rounded_top: { name: '圓弧頂', family: 'top', line: false },
  spire_top: { name: '倒 V 型反轉', family: 'top', line: true },
  rectangle: { name: '箱型整理', family: 'continuation', line: false },
  triangle_symmetrical: { name: '對稱三角收斂', family: 'continuation', line: false },
  triangle_ascending: { name: '上升三角形', family: 'continuation', line: false },
  triangle_descending: { name: '下降三角形', family: 'continuation', line: false },
  flag_bull: { name: '上升旗型', family: 'continuation', line: true },
  flag_bear: { name: '下降旗型', family: 'continuation', line: true },
  broadening: { name: '喇叭波', family: 'continuation', line: false },
};

const BOX_SIZE_LABEL: Record<string, string> = {
  narrow: '窄幅',
  normal: '一般',
  wide: '寬幅',
  large: '大型',
};

/**
 * 型態名稱。箱型整理帶大小分級（例如「箱型整理·寬幅」）。
 * 後端新增了前端還不認得的種類時照原碼顯示，不要因為沒翻譯就藏起來。
 */
export function patternName(kind: string, boxSize?: string): string {
  const name = PATTERN_INFO[kind as PatternKind]?.name ?? kind;
  const size = boxSize ? BOX_SIZE_LABEL[boxSize] : undefined;
  return size ? `${name}·${size}` : name;
}

/**
 * 依預期方向決定型態的顏色：看漲青藍、看跌橘、方向未定紫。
 *
 * 刻意不用漲跌的紅綠：型態疊在紅綠 K 棒上，同樣是紅綠的話分不出哪條線是型態、哪根是 K 棒。
 * 回傳 stroke／fill／text 三種 class，圖上與表格共用。
 */
export function directionClasses(direction: string): { stroke: string; fill: string; text: string } {
  if (direction === 'up') return { stroke: 'stroke-pattern-up', fill: 'fill-pattern-up', text: 'text-pattern-up' };
  if (direction === 'down') {
    return { stroke: 'stroke-pattern-down', fill: 'fill-pattern-down', text: 'text-pattern-down' };
  }
  return { stroke: 'stroke-pattern-neutral', fill: 'fill-pattern-neutral', text: 'text-pattern-neutral' };
}

export function directionLabel(direction: string): string {
  if (direction === 'up') return '看漲';
  if (direction === 'down') return '看跌';
  return '方向未定';
}

/** 這個型態屬於哪個分類；不認得的種類歸到中繼整理（至少不會被篩掉）。 */
export function patternFamily(kind: string): PatternFamily {
  return PATTERN_INFO[kind as PatternKind]?.family ?? 'continuation';
}

/**
 * 量能的一句話：只描述事實與傳統的量價紀律，不下買賣結論。
 *
 * 底部型態（預期往上）突破要有量才算真突破；頭部型態（預期往下）跌破不需要量，
 * 無量下跌更可怕——所以同樣是「沒量」，底部型態會標警語，頭部型態只陳述數字。
 */
export function volumeNote(pattern: ChartPattern): { text: string; warn: boolean } | null {
  const v = pattern.volume;
  if (!v || v.key_ratio == null) return null;
  const ratio = `${v.key_ratio.toFixed(1)} 倍`;
  if (pattern.direction === 'up' && pattern.status === 'confirmed') {
    return v.heavy
      ? { text: `突破有量（${ratio}）`, warn: false }
      : { text: `突破無量（${ratio}），底部型態缺量的突破可信度較低`, warn: true };
  }
  if (pattern.direction === 'down' && pattern.status === 'confirmed') {
    return { text: `跌破量 ${ratio}（頭部型態跌破不需要量）`, warn: false };
  }
  return { text: `量比 ${ratio}`, warn: false };
}

export const GAP_INFO: Record<GapKind, { name: string; hint: string }> = {
  breakaway: { name: '突破缺口', hint: '整理之後帶量跳過箱頂（箱底），暗示新一波趨勢啟動' },
  runaway: { name: '逃逸缺口', hint: '趨勢中途的缺口，行情正走在主升段（主跌段）' },
  exhaustion: { name: '竭盡缺口', hint: '長期趨勢末端的缺口，幾天內就被回補，暗示趨勢到頭' },
  common: { name: '普通缺口', hint: '盤整裡的缺口，沒有趨勢意義，通常很快被回補' },
};

export function gapName(kind: string): string {
  return GAP_INFO[kind as GapKind]?.name ?? kind;
}

export function gapHint(kind: string): string {
  return GAP_INFO[kind as GapKind]?.hint ?? '';
}

/** 缺口一律用琥珀色，方向用箭頭區分；跟型態的青藍、橘、紫與 K 棒的紅綠都不同色。 */
export const GAP_CLASSES = { stroke: 'stroke-pattern-gap', fill: 'fill-pattern-gap', text: 'text-pattern-gap' };
