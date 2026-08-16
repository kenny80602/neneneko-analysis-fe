// 主題切換（淺色／深色）。
//
// 實作方式是在 <html> 上掛 .dark，色票本身是 src/index.css 的 CSS 變數，
// tailwind.config.js 只做對應。所以切主題不會動到任何一頁的 className——
// 十幾頁、上千個 bg-surface / text-on-surface 都自動跟著變。
//
// 為什麼不用 Tailwind 的 dark: 變體：那要在每一個用到顏色的地方寫兩份
// （bg-white dark:bg-slate-900），十幾頁改下來必然有漏，而且漏掉的地方
// 在淺色模式看起來完全正常，只有切到深色才發現。

/** localStorage 的鍵。 */
const THEME_KEY = 'stock:theme';

export type Theme = 'light' | 'dark';

/**
 * 目前該用哪個主題。
 *
 * 優先序：使用者選過的 > 系統偏好 > 淺色。跟著系統走是為了讓第一次開啟就對，
 * 但一旦手動選過就以選過的為準——使用者在深色系統下想看淺色是合理的。
 */
export function resolveTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // 隱私模式下 localStorage 會丟例外，往下走系統偏好即可。
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 把主題套到 <html> 上。 */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  // 拉桿式表單元件（date picker、捲軸）會看這個屬性決定要用哪一套原生樣式。
  document.documentElement.style.colorScheme = theme;
}

/** 記住使用者的選擇並立即套用。 */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // 存不了就只有這次生效，不值得為它擋掉切換。
  }
}
