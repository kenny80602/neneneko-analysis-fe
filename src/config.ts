// 執行期 API 位址解析 —— 讓「同一顆 image 走多環境（int/beta/prod）」。
// 來源優先序：
//   1) window.__APP_CONFIG__.apiBase：部署時由容器啟動腳本產生的 /config.js 提供，
//      各環境注入不同後端位址。
//   2) REACT_APP_API_BASE：build 期環境變數（本機開發 / 未走 runtime config 時的 fallback）。
//   3) 本機預設 http://localhost:8081（stock-market-analysis 後端的預設埠）。
declare global {
  interface Window {
    __APP_CONFIG__?: { apiBase?: string };
  }
}

export const API_BASE: string =
  window.__APP_CONFIG__?.apiBase ||
  process.env.REACT_APP_API_BASE ||
  'http://localhost:8081';
