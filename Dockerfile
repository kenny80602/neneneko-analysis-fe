# syntax=docker/dockerfile:1

# ── 建置階段：用 Node 打包 CRA 靜態檔 ──
FROM node:20-alpine AS build
WORKDIR /build

# 先只複製 lockfile 裝依賴，讓這層可被快取（原始碼變動時不必重裝）。
# --legacy-peer-deps：react-scripts@5 的 peer 仍鎖 typescript ^3||^4，但本專案用 TS5，
# 與本機安裝方式一致（否則 npm7+ 會因 peer 衝突 ERESOLVE 失敗）
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --legacy-peer-deps

# 註：API 位址已改為「執行期」由 /config.js 注入（見 src/config.ts 與下方 runtime dropin），
# 一顆 image 即可走多環境。此 build arg 僅作為 bundle 內的最後 fallback，通常不需覆寫。
ARG REACT_APP_API_BASE=http://localhost:8081
ENV REACT_APP_API_BASE=$REACT_APP_API_BASE

COPY . .
RUN npm run build

# ── 執行階段：nginx 提供靜態檔 ──
FROM nginx:1.27-alpine AS runtime

# SPA 路由 fallback（React Router 用戶端路由，未知路徑要回 index.html）
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/build /usr/share/nginx/html

# 執行期產生 /config.js（依環境變數 API_BASE 指向不同後端）。
# nginx 官方 image 啟動時會自動跑 /docker-entrypoint.d/*.sh，故不需自訂 ENTRYPOINT。
COPY docker/40-config-js.sh /docker-entrypoint.d/40-config-js.sh
RUN chmod +x /docker-entrypoint.d/40-config-js.sh

EXPOSE 80

# TCP 探測 80 是否已接受連線（alpine 內建 wget）
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=6 \
  CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1
