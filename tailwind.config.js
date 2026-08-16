/** @type {import('tailwindcss').Config} */
// 設計系統的單一來源（Material 3 色彩角色 + 自訂字級 / 間距 / 圓角）。
// 元件裡一律用語意化 token（bg-surface、text-on-surface-variant、text-body-md…），
// 不要寫死色碼，也不要用 Tailwind 內建色階（gray-800、red-500 這種）。
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // 色票的實際值在 src/index.css 的 CSS 變數裡（淺色 :root、深色 .dark）。
      // 這裡只做對應，所以切主題不必動任何一個 className。
      // 通道值 + <alpha-value> 是為了讓 bg-surface-container-low/50 這類透明度修飾詞還能用。
      //
      // 漲跌色（quote-up／quote-down）兩個主題各有一組，淺色下刻意做成對比相當
      // （5.50 對 5.48），才不會一邊壓過另一邊——舊的跌色 #005228 對比 9.39，
      // 深到跟黑字分不出來，整片虧損看起來就像沒上色。
      //
      // nav 那組是導覽列專用，兩個主題都維持深底，不隨主題翻轉。
      colors: {
        "background": "rgb(var(--c-background) / <alpha-value>)",
        "error": "rgb(var(--c-error) / <alpha-value>)",
        "error-container": "rgb(var(--c-error-container) / <alpha-value>)",
        "inverse-on-surface": "rgb(var(--c-inverse-on-surface) / <alpha-value>)",
        "inverse-primary": "rgb(var(--c-inverse-primary) / <alpha-value>)",
        "inverse-surface": "rgb(var(--c-inverse-surface) / <alpha-value>)",
        "nav": "rgb(var(--c-nav) / <alpha-value>)",
        "nav-active": "rgb(var(--c-nav-active) / <alpha-value>)",
        "on-background": "rgb(var(--c-on-background) / <alpha-value>)",
        "on-error": "rgb(var(--c-on-error) / <alpha-value>)",
        "on-error-container": "rgb(var(--c-on-error-container) / <alpha-value>)",
        "on-nav": "rgb(var(--c-on-nav) / <alpha-value>)",
        "on-nav-muted": "rgb(var(--c-on-nav-muted) / <alpha-value>)",
        "on-primary": "rgb(var(--c-on-primary) / <alpha-value>)",
        "on-primary-container": "rgb(var(--c-on-primary-container) / <alpha-value>)",
        "on-primary-fixed": "rgb(var(--c-on-primary-fixed) / <alpha-value>)",
        "on-primary-fixed-variant": "rgb(var(--c-on-primary-fixed-variant) / <alpha-value>)",
        "on-secondary": "rgb(var(--c-on-secondary) / <alpha-value>)",
        "on-secondary-container": "rgb(var(--c-on-secondary-container) / <alpha-value>)",
        "on-secondary-fixed": "rgb(var(--c-on-secondary-fixed) / <alpha-value>)",
        "on-secondary-fixed-variant": "rgb(var(--c-on-secondary-fixed-variant) / <alpha-value>)",
        "on-surface": "rgb(var(--c-on-surface) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--c-on-surface-variant) / <alpha-value>)",
        "on-tertiary": "rgb(var(--c-on-tertiary) / <alpha-value>)",
        "on-tertiary-container": "rgb(var(--c-on-tertiary-container) / <alpha-value>)",
        "on-tertiary-fixed": "rgb(var(--c-on-tertiary-fixed) / <alpha-value>)",
        "on-tertiary-fixed-variant": "rgb(var(--c-on-tertiary-fixed-variant) / <alpha-value>)",
        "outline": "rgb(var(--c-outline) / <alpha-value>)",
        "outline-variant": "rgb(var(--c-outline-variant) / <alpha-value>)",
        "primary": "rgb(var(--c-primary) / <alpha-value>)",
        "primary-container": "rgb(var(--c-primary-container) / <alpha-value>)",
        "primary-fixed": "rgb(var(--c-primary-fixed) / <alpha-value>)",
        "primary-fixed-dim": "rgb(var(--c-primary-fixed-dim) / <alpha-value>)",
        "quote-down": "rgb(var(--c-quote-down) / <alpha-value>)",
        "quote-up": "rgb(var(--c-quote-up) / <alpha-value>)",
        "secondary": "rgb(var(--c-secondary) / <alpha-value>)",
        "secondary-container": "rgb(var(--c-secondary-container) / <alpha-value>)",
        "secondary-fixed": "rgb(var(--c-secondary-fixed) / <alpha-value>)",
        "secondary-fixed-dim": "rgb(var(--c-secondary-fixed-dim) / <alpha-value>)",
        "surface": "rgb(var(--c-surface) / <alpha-value>)",
        "surface-bright": "rgb(var(--c-surface-bright) / <alpha-value>)",
        "surface-container": "rgb(var(--c-surface-container) / <alpha-value>)",
        "surface-container-high": "rgb(var(--c-surface-container-high) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--c-surface-container-highest) / <alpha-value>)",
        "surface-container-low": "rgb(var(--c-surface-container-low) / <alpha-value>)",
        "surface-container-lowest": "rgb(var(--c-surface-container-lowest) / <alpha-value>)",
        "surface-dim": "rgb(var(--c-surface-dim) / <alpha-value>)",
        "surface-tint": "rgb(var(--c-surface-tint) / <alpha-value>)",
        "surface-variant": "rgb(var(--c-surface-variant) / <alpha-value>)",
        "tertiary": "rgb(var(--c-tertiary) / <alpha-value>)",
        "tertiary-container": "rgb(var(--c-tertiary-container) / <alpha-value>)",
        "tertiary-fixed": "rgb(var(--c-tertiary-fixed) / <alpha-value>)",
        "tertiary-fixed-dim": "rgb(var(--c-tertiary-fixed-dim) / <alpha-value>)",
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        // 註：設計稿刻意把 full 定成 0.75rem，rounded-full 不是正圓而是大圓角。
        // 需要正圓（頭像、狀態點）請用 rounded-[9999px]。
        full: "0.75rem",
      },
      spacing: {
        "stack-lg": "24px",
        unit: "4px",
        "stack-md": "16px",
        "stack-sm": "8px",
        "container-margin": "16px",
        gutter: "12px",
      },
      fontFamily: {
        // 設計稿只列 Inter / JetBrains Mono，兩者都沒有中文字符，
        // 這裡補上 Noto Sans TC 當 fallback，中文才不會掉到瀏覽器預設字體。
        sans: ["Inter", "Noto Sans TC", "sans-serif"],
        "data-md": ["JetBrains Mono", "ui-monospace", "monospace"],
        "data-lg": ["JetBrains Mono", "ui-monospace", "monospace"],
        display: ["Inter", "Noto Sans TC", "sans-serif"],
        "headline-lg": ["Inter", "Noto Sans TC", "sans-serif"],
        "headline-md": ["Inter", "Noto Sans TC", "sans-serif"],
        "body-lg": ["Inter", "Noto Sans TC", "sans-serif"],
        "body-md": ["Inter", "Noto Sans TC", "sans-serif"],
        "body-sm": ["Inter", "Noto Sans TC", "sans-serif"],
        "label-caps": ["Inter", "Noto Sans TC", "sans-serif"],
      },
      fontSize: {
        "data-md": ["14px", { lineHeight: "20px", fontWeight: "500" }],
        display: ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-sm": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "label-caps": ["11px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "700" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "headline-md": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "data-lg": ["18px", { lineHeight: "24px", fontWeight: "500" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
