// 本機開發用的空設定：留空物件，讓 src/config.ts 退回 .env 的 REACT_APP_API_BASE。
// 部署時這支會被容器啟動腳本依環境變數 API_BASE 覆寫，不要在這裡寫死正式位址。
window.__APP_CONFIG__ = {};
