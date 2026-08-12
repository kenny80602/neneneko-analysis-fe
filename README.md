# stock-market-analysis-fe — 精準資本

台股資料分析平台「精準資本」的前端介面，對接 [`stock-market-analysis`](../stock-market-analysis)（Go + Gin）後端：
大盤概況、自選股試算與個股的收盤 / 法人 / 融資券 / 估值 / 營收 / 重大訊息 / 注意股。

## 功能頁面

> 完成度說明：✅ 已串接後端 API、可實際操作｜🟡 部分串接（核心功能已串，部分區塊仍為畫面）｜🚧 僅有 UI 畫面（無對應後端 API）

| 頁面 | 路由 | 說明 | 完成度 |
|------|------|------|:------:|
| 登入 | `/login` | 帳密（email + 密碼）登入。密碼後端限制剛好 10 碼；token 由回應標頭 `x-jwt-token` / `x-refresh-token` 帶回 | ✅ |
| 市場概況 | `/market` | 集中市場加權指數 / 成交量值 / 漲跌家數、上櫃市場現況、三大法人買賣金額統計（BFI82U）。即時打交易所，不輪詢 | ✅ |
| 自選股 | `/portfolio` | 持股試算表：現價（含來源）、最近收盤漲跌與成交量、損益、買入區間狀態；支援排序、只看買入區間、分頁，可推播到 LINE（會消耗計費額度，已做二次確認）。增刪走 LINE 聊天室，刪除鈕依設計稿排版但停用（後端無 API） | 🟡 |
| 每日收盤 | `/quotes` | 某交易日的全部收盤行情（不帶日期時回最新收集到的那天），可手動觸發收集（順帶收法人 / 融資券 / 估值） | ✅ |
| 頁尾政策頁 | — | 隱私權政策 / 服務條款 / 監管聲明 / 聯絡客服，設計稿有連結但尚無頁面，目前指向 `#` | 🚧 |
| 個股總覽 | `/dashboard` | 選取個股的即時報價（每 30 秒輪詢）與最近十個交易日收盤 | ✅ |
| 三大法人 | `/institutional` | 單檔每日三大法人買賣超（單位張），支援日期區間與筆數。目前僅上市有歷史 | ✅ |
| 融資融券 | `/margin` | 單檔融資融券餘額 / 增減 / 使用率 / 券資比 / 資券互抵 | ✅ |
| 估值指標 | `/valuation` | 單檔每日本益比、殖利率、股價淨值比、每股股利（僅上櫃） | ✅ |
| 月營收 | `/revenue` | 單檔月營收、月增率、年增率與累計營收。全市場都有，不限自選股 | ✅ |
| 重大訊息 | `/announcements` | 單檔重大訊息列表，可展開說明全文，顯示符合條款與事實發生日 | ✅ |
| 注意股 | `/warnings` | 單檔被列注意的紀錄與觸發原因、累計次數，可手動觸發收集 | ✅ |

## 技術棧

- **React** 19 + React Router 7
- **TypeScript** 5（strict 模式），`src/` 底下全為 `.ts` / `.tsx`
- **Tailwind CSS** 3（含 `@tailwindcss/forms` 插件），設計 token 集中於 `tailwind.config.js`
- **Inter** + **JetBrains Mono**（數字）+ **Noto Sans TC**（中文 fallback）
- **Material Symbols Outlined**（Google 圖示字型）
- **Axios**（HTTP 請求；request 攔截器自動帶上 `Authorization: Bearer`，401 時以 refresh token 自動換發並重試）
- 建置工具為 **CRA（react-scripts 5）**，與 `minecraft-server-fe` 同一套（版本亦對齊）

## 版面

`DashboardLayout` 組成全站骨架，登入頁以外的所有頁面都在裡面：

```
┌────────┬──────────────────────────────────┐
│Sidebar │ Topbar（搜尋標的 / 登出）        │
│（深色）├──────────────────────────────────┤
│市場概況│ main（捲動、p-8、max-w-1200 置中）│
│自選股  │   PageHeader（標題 + 動作區）     │
│每日收盤│   頁面內容                        │
│─個股─  │   AppFooter                       │
└────────┴──────────────────────────────────┘
```

捲動、內距與內容寬度都由 layout 負責，頁面只要依序放 `PageHeader` 與內容即可。

## 股票代號選取狀態

個股各頁（總覽 / 法人 / 融資券 / 估值 / 營收 / 重大訊息 / 注意股）共用「目前選取的股票」：

- `src/context/SymbolContext.tsx` 提供 `useSymbol()`，以 `symbol` 為核心並持久化於 `localStorage`（key：`stock:selectedSymbol`）。
- 三個入口都寫進同一份 context：頁首 `Topbar` 的搜尋框（送出後導向個股總覽）、
  個股各頁右上角的 `SymbolSearch`、以及自選股 / 每日收盤表格點擊任一列。
- 未選取時，相關頁面顯示「請先選取股票」提示，不會發出無效請求。

## 後端 API 對應

`src/api/` 各模組對應一組後端 Handler，回應統一為 `ApiResponse<T>`（`{ code?, msg?, data? }`，型別集中於 `types.ts`）。
後端錯誤一律以非 200 的 HTTP 狀態回傳，axios 會 throw，錯誤訊息取自 `msg`（用 `apiErrorMessage()` 取可顯示字串）。

> 路徑不加前綴，完整 URL = `REACT_APP_API_BASE` + 端點。

| 模組 | 後端範圍 | 主要功能 |
|------|----------|----------|
| `auth.ts` | `/users` | 登入 / 註冊 / 取得個人資料 / 登出。token 走回應標頭 |
| `dailyQuote.ts` | `/stocks/daily` | 單檔收盤歷史、某日全部收盤、手動觸發收集 |
| `realtimeQuote.ts` | `/stocks/realtime` | 台股即時報價（證交所 MIS，不落地） |
| `institutional.ts` | `/stocks/institutional` | 單檔每日三大法人買賣超（僅上市有歷史） |
| `margin.ts` | `/stocks/margin` | 單檔融資融券歷史、某日全部（上市上櫃合併） |
| `valuation.ts` | `/stocks/valuation` | 單檔每日本益比 / 殖利率 / 股價淨值比 |
| `revenue.ts` | `/stocks/revenue` | 單檔月營收（全市場，不限自選股） |
| `announcement.ts` | `/stocks/announcement` | 單檔重大訊息（公開資訊觀測站） |
| `warning.ts` | `/stocks/warning` | 單檔注意股紀錄、手動觸發收集 |
| `portfolio.ts` | `/portfolio` | 自選股清單、持股試算、推播到 LINE |
| `twse.ts` | `/stocks/twse` | 集中市場即時整包：市場成交、漲跌家數、法人買賣金額 |
| `tpex.ts` | `/stocks/tpex` | 上櫃市場即時整包：市場現況 |

`twse.ts` / `tpex.ts` 只接了畫面用得到的端點，其餘端點（排行、盤後定價、停資停券…）在檔案開頭以註解列出，需要時再補。

## 專案結構

```
src/
├── api/
│   ├── request.ts            # Axios 實例、token 存取、401 自動換發、錯誤訊息萃取
│   ├── types.ts              # 共用型別與 ApiResponse<T>（對齊後端 VO 的 json tag）
│   ├── auth.ts               # 登入 / 註冊 / 登出
│   ├── dailyQuote.ts         # 每日收盤行情
│   ├── realtimeQuote.ts      # 即時報價
│   ├── institutional.ts      # 三大法人
│   ├── margin.ts             # 融資融券
│   ├── valuation.ts          # 估值指標
│   ├── revenue.ts            # 月營收
│   ├── announcement.ts       # 重大訊息
│   ├── warning.ts            # 注意股
│   ├── portfolio.ts          # 自選股 / 持股試算 / LINE 推播
│   ├── twse.ts               # 集中市場整包
│   └── tpex.ts               # 上櫃市場整包
├── components/
│   ├── DashboardLayout.tsx   # 版面（Sidebar + Topbar + 內容區 + AppFooter），捲動與寬度都在這
│   ├── Sidebar.tsx           # 側邊欄導覽（深色）
│   ├── Topbar.tsx            # 頁首：全站標的搜尋、登出
│   ├── AppFooter.tsx         # 頁尾
│   ├── PageHeader.tsx        # 各頁標題區塊 + 動作區
│   ├── PageState.tsx         # 載入中 / 錯誤 / 空資料 / 未選取 的統一畫面
│   ├── SymbolSearch.tsx      # 頁內代號輸入框
│   ├── RangeFilter.tsx       # 歷史查詢共用的 from / to / limit
│   ├── StatCard.tsx          # 指標卡
│   └── RequireAuth.tsx       # 路由守衛
├── context/
│   └── SymbolContext.tsx     # 目前選取股票代號的共享狀態
├── hooks/
│   └── useAsyncData.ts       # 抓資料三態 + 輪詢 + 手動重抓（各頁都走這支）
├── utils/
│   └── format.ts             # 數字 / 百分比 / 日期格式化與漲跌配色
├── pages/                    # 各功能頁面（見上方功能頁面表）
├── config.ts                 # 執行期 API 位址解析
├── App.tsx                   # 路由設定 + SymbolProvider
└── react-app-env.d.ts        # CRA 型別宣告
```

## 快速開始

### 安裝依賴

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` 是必要的：`react-scripts@5` 的 peer 仍鎖 `typescript ^3||^4`，本專案用 TS 5，
> npm 7+ 會因 peer 衝突 ERESOLVE 失敗。與 `minecraft-server-fe` 的做法一致。

### 設定環境變數

複製範本後填入後端 API 位址（`.env` 已被 gitignore 排除，不進版控）：

```bash
cp .env.example .env
# .env 內容（本機開發預設指向本機後端）：
REACT_APP_API_BASE=http://localhost:8080
```

後端啟動方式見 `stock-market-analysis` 的 README（`docker-compose up -d` 起依賴後再跑 `cmd`）。
未啟動後端時，登入會顯示「無法連線到伺服器」，各資料頁則顯示載入失敗。

### 啟動開發伺服器

```bash
npm start
```

開啟 [http://localhost:3000](http://localhost:3000) 即可瀏覽。後端 CORS 已放行所有 `http://localhost` 來源。

### 建置生產版本

```bash
npm run build
```

輸出至 `build/` 資料夾。

## 執行期 API 位址

CRA 的 `REACT_APP_*` 是**建置期**寫死進 bundle 的。為了讓多環境共用同一顆 image，位址改為**執行期**解析：

- `public/index.html` 於 bundle 前載入 `<script src="%PUBLIC_URL%/config.js"></script>`。
- `src/config.ts` 依序解析 `window.__APP_CONFIG__?.apiBase` → build 期 `REACT_APP_API_BASE` → `http://localhost:8080`。
- 本機開發時 `public/config.js` 是空物件，會退回 `.env` 的值。

部署時由容器啟動腳本依環境變數 `API_BASE` 產生 `/config.js` 覆寫該檔（Dockerfile / nginx / CI 尚未建立，
做法可參考 `minecraft-server-fe` 的 `docker/40-config-js.sh`）。

## 設計風格

依設計稿建立的 Material 3 淺色主題，token 全部集中在 `tailwind.config.js`：

- 品牌：精準資本
- 頁面底色 `#f8f9fa`、文字 `#191c1d`、卡片 `#ffffff` + `#c4c6cd` 邊框
- 側邊欄為深色 `primary #041627`，選中項 `primary-container #1a2b3c`
- 正向 `secondary #006d37`、負向 `error #ba1a1a`
- 漲跌配色：目前依設計稿為**漲綠跌紅**；台股慣例是漲紅跌綠，要對調只需改
  `utils/format.ts` 的 `quoteColor` / `quoteBadge`
- 字型：Inter（介面）+ JetBrains Mono（數字）+ Noto Sans TC（中文 fallback）
- 圖示：[Material Symbols Outlined](https://fonts.google.com/icons)
- 注意：設計稿把 `rounded-full` 定成 `0.75rem`，不是正圓；要正圓請用 `rounded-[9999px]`

## 尚未實作

設計稿有、但後端沒有對應功能，畫面上一律停用或標示，不做假的：

- 自選股表格的**刪除鈕**（增刪走 LINE 聊天室，後端只開讀取）
- 設計稿的**「高估」狀態徽章**（後端沒有這個欄位，要先定義判斷規則；目前只有買入區間 / 觀察中 / 取價失敗）
- 頁首的**通知與設定**按鈕
- 頁尾的四個政策連結
- 註冊頁與簡訊登入頁（後端 `/users/signup`、`/users/login_sms` 已就緒）
- 部署檔：Dockerfile / nginx / GitHub Actions（前端側的執行期注入已備妥，見上方「執行期 API 位址」）

開發慣例（命名、API 模組寫法、null 處理、樣式 token、註解語氣等）見 [CLAUDE.md](CLAUDE.md)。
# stock-market-analysis-fe
