/** @type {import('tailwindcss').Config} */
// 設計系統的單一來源（Material 3 色彩角色 + 自訂字級 / 間距 / 圓角）。
// 元件裡一律用語意化 token（bg-surface、text-on-surface-variant、text-body-md…），
// 不要寫死色碼，也不要用 Tailwind 內建色階（gray-800、red-500 這種）。
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 漲跌專用色（台股慣例漲紅跌綠）。刻意不直接沿用 error / secondary：
        // 那兩個角色同時是「錯誤／警示」與「買入區間」，混用的話「想調漲跌色」
        // 會一併改到取價失敗、注意股徽章與買區那些不相干的地方。
        // 只有 utils/format.ts 的 quoteColor / quoteBadge、K 線的 K 棒與成交量、
        // 市場概況的漲跌家數卡會用到這兩個。
        "quote-up": "#ba1a1a",
        "quote-down": "#005228",

        "on-background": "#191c1d",
        "surface-variant": "#e1e3e4",
        background: "#f8f9fa",
        "inverse-primary": "#b7c8de",
        "on-primary-fixed": "#0b1d2d",
        "outline-variant": "#c4c6cd",
        "tertiary-fixed": "#ffdad5",
        "on-tertiary": "#ffffff",
        "secondary-container": "#7bf8a1",
        "on-surface": "#191c1d",
        error: "#ba1a1a",
        "on-error-container": "#93000a",
        "on-tertiary-fixed": "#410000",
        secondary: "#006d37",
        "primary-fixed-dim": "#b7c8de",
        "secondary-fixed": "#7efba4",
        "on-surface-variant": "#44474c",
        "surface-container-highest": "#e1e3e4",
        tertiary: "#350000",
        "on-tertiary-container": "#fb5a48",
        "on-secondary-fixed": "#00210c",
        "surface-container-high": "#e7e8e9",
        "primary-fixed": "#d2e4fb",
        "inverse-on-surface": "#f0f1f2",
        outline: "#74777d",
        "error-container": "#ffdad6",
        "surface-dim": "#d9dadb",
        "on-secondary": "#ffffff",
        "surface-container": "#edeeef",
        "primary-container": "#1a2b3c",
        "on-primary-fixed-variant": "#38485a",
        "tertiary-fixed-dim": "#ffb4a9",
        "surface-tint": "#4f6073",
        "surface-bright": "#f8f9fa",
        "on-error": "#ffffff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f3f4f5",
        "on-primary-container": "#8192a7",
        "inverse-surface": "#2e3132",
        surface: "#f8f9fa",
        "on-secondary-container": "#007239",
        "on-tertiary-fixed-variant": "#910807",
        primary: "#041627",
        "secondary-fixed-dim": "#61de8a",
        "on-secondary-fixed-variant": "#005228",
        "tertiary-container": "#5c0001",
        "on-primary": "#ffffff",
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
