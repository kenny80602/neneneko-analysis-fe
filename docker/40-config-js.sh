#!/bin/sh
set -e

# nginx 官方 image 啟動時會自動執行 /docker-entrypoint.d/*.sh，再啟動 nginx。
# 這支在啟動前產生 /config.js：讓「同一顆 image 依環境變數 API_BASE 指向不同後端」（int/beta/prod）。
# 位址來源：API_BASE > 建置期寫入的 REACT_APP_API_BASE > 本機預設。
API_BASE="${API_BASE:-${REACT_APP_API_BASE:-http://localhost:8081}}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = { "apiBase": "${API_BASE}" };
EOF

echo "[40-config-js] wrote /config.js apiBase=${API_BASE}"
