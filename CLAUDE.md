# CLAUDE.md

`stock-market-analysis-fe` 的開發規範。動手改任何檔案前先看完這份。

## 專案定位

台股資料分析平台「**精準資本**」的前端，對接同層目錄的 Go 後端
[`stock-market-analysis`](../stock-market-analysis)。
專案骨架、工具鏈與版本一律對齊 [`minecraft-server-fe`](../minecraft-server-fe)（同一套 CRA 模板），
視覺則走自己的設計稿（見下方樣式規範）。

需要確認後端行為時**直接去讀 Go 原始碼**，不要猜：

- 路由與回應形狀：`internal/interface/web/**/*.go`（handler 上的 doc comment 寫得很清楚，包含 query 參數與邊界情況）
- 統一回應格式：`internal/pkg/ginx/response.go`
- 認證：`internal/pkg/ginx/jwt_handler/`、`internal/pkg/ginx/middlewares/auth_guard/`、CORS 在 `ioc/web.go`

---

## 語言規範

**只接受繁體中文與英文，不要出現簡體中文。**

適用範圍（全部）：

- 程式碼註解、JSDoc
- commit message、PR 標題與內容
- 對話回覆
- 文件、設定檔註解（json、yml、md）
- 畫面上的所有文案

技術術語維持英文原文，不要硬翻：`context`、`hook`、`state`、`props`、`token`、`interceptor`、`polling` 等。

寫完檔案後自我檢查一次有沒有殘留簡體字，常見誤用：

| 簡體 | 繁體 |
|---|---|
| 连线 / 连接 | 連線 / 連接 |
| 设定 / 设置 | 設定 / 設置 |
| 预设 | 預設 |
| 参数 | 參數 |
| 测试 | 測試 |
| 网路 / 网络 | 網路 |
| 请求 | 請求 |
| 数据 / 资料 | 資料 |
| 错误 | 錯誤 |
| 检查 | 檢查 |
| 时间 / 超时 | 時間 / 逾時 |
| 帐密 / 账号 | 帳密 / 帳號 |
| 日志 | 日誌 |
| 组件 | 元件 |
| 加载 | 載入 |
| 缓存 | 快取 |
| 状态 | 狀態 |

---

## 技術棧與版本

| 項目 | 版本 | 說明 |
|---|---|---|
| React | 19 | |
| React Router | 7 | |
| TypeScript | 5（strict） | |
| Tailwind CSS | 3 | 含 `@tailwindcss/forms` |
| Axios | 1.x | |
| 建置工具 | CRA（react-scripts 5） | 不是 Vite |

**不要自作主張升級或抽換依賴**（例如改用 Vite、換掉 CRA、加狀態管理套件）。版本刻意與
`minecraft-server-fe` 對齊，兩個專案要能互相參照。要動請先問。

安裝依賴一律加 `--legacy-peer-deps`：`react-scripts@5` 的 peer 仍鎖 `typescript ^3||^4`，
本專案用 TS 5，npm 7+ 會 ERESOLVE 失敗。

```bash
npm install --legacy-peer-deps
```

---

## 目錄結構與各層職責

```
src/
├── api/          # 只負責「打哪支 API、回什麼型別」，不做畫面邏輯、不吞錯誤
├── components/   # 跨頁共用元件。只被單一頁面用到的就留在該頁檔案裡
├── context/      # 跨頁共享狀態（目前只有選取的股票代號）
├── hooks/        # 可複用的資料抓取 / 狀態邏輯
├── utils/        # 純函式（格式化、換算），不得 import api 或元件
└── pages/        # 一個路由一個檔案，負責組合以上各層
```

新增檔案前先想清楚放哪一層。**api 層不要出現 `alert`、不要 `catch` 後回預設值把錯誤吞掉**——
錯誤要讓頁面看得到才有機會顯示給使用者。

---

## API 層寫法

### 一支端點一個 arrow function，回傳已解包的 `data`

```ts
import request from './request';
import { ApiResponse, HistoryParams, MarginHistory } from './types';

// MarginHandler — /stocks/margin，個股融資融券（上市上櫃合併）。
export const getMarginHistory = (symbol: string, params?: HistoryParams) =>
  request
    .get<ApiResponse<MarginHistory>>(`/stocks/margin/${symbol}`, { params })
    .then((res) => res.data.data);
```

規則：

1. 檔名對應後端 handler（`margin.ts` ↔ `MarginHandler`），檔案開頭用註解標明對應的後端範圍與這組 API 的性質。
2. 泛型一律寫成 `ApiResponse<T>`，回傳 `res.data.data`。回陣列的端點補 `?? []`，讓呼叫端不必再判斷 undefined。
3. 路徑**不加前綴**，直接 `/stocks/...`、`/portfolio/...`、`/users/...`。
4. 有副作用的端點（`collect`、`notify`）在註解裡明講代價：會打上游、會寫資料庫、會花 LINE 額度。
5. 只接畫面用得到的端點；同組但還沒接的，在檔案開頭以註解列清單（見 `twse.ts`），不要先寫一堆沒人呼叫的函式。

### 錯誤處理

後端錯誤一律以**非 200 的 HTTP 狀態**回傳，axios 會 throw，訊息在 body 的 `msg`。
呼叫端 `catch` 後用 `apiErrorMessage(err)` 取可直接顯示的字串，不要自己拆 `err.response.data`。

### 認證

- 登入成功後，token 由**回應標頭** `x-jwt-token` / `x-refresh-token` 帶回，`request.ts` 的回應攔截器
  會自動寫進 `localStorage`。API 函式拿不到也不需要 token。
- 請求攔截器自動帶 `Authorization: Bearer <access token>`。
- access token 30 分鐘、refresh 7 天；401 時攔截器會自動換發並重試一次，換發失敗才導回 `/login`。
- **refresh token 是一次性的**（後端以 Redis 記 ssid），所以換發做了單一化（`refreshPromise`）。
  改 `request.ts` 時別把這個拿掉，併發換發會讓使用者莫名被登出。
- 除了 `/users/login`、`/users/signup`、`/users/refresh_token` 等少數路徑，**所有端點都需要登入**
  （含 `/stocks/*`、`/portfolio/*`），別以為行情是公開的。

---

## 型別規範

`src/api/types.ts` 的介面**逐欄對齊後端 VO 的 json tag**，欄位名維持 snake_case，不要轉成 camelCase。
好處是出問題時可以拿 Go 的 struct 直接對照。

抄型別時連同**後端註解裡的語意一起帶過來**（單位、null 的意思、哪個市場才有）。這些是踩過坑才寫下的，
沒帶過來的話下一個人會重踩一次。

### null 與 0 是兩回事

這是本專案最容易出錯的地方。後端大量欄位刻意用指標（`*float64`）就是為了區分：

- 本益比 `null` = 公司虧損算不出來，畫成 0 會被讀成「本益比 0 倍」
- 使用率 `null` = 這個市場沒有公布這個數字，不是「使用率 0%」
- 成本 `null` = 這檔沒填成本，填 0 會讓損益算出 -100%
- 收盤價 0 且 `traded === false` = 當天沒成交，不是跌到零

所以：

- **絕對不要寫 `value ?? 0`**。
- 顯示一律走 `utils/format.ts`，它們遇到 null / undefined / NaN 會回破折號（`—`）。
- 頁面上要說清楚破折號的意思（各頁最上方那行 `text-[11px] text-slate-600` 說明文字就是幹這個的）。

---

## 資料抓取

各頁**一律用 `useAsyncData`**，不要自己寫 useState + useEffect：

```ts
const [params, setParams] = useState<HistoryParams>({ limit: 60 });

const { data, loading, error, reload } = useAsyncData(
  () => getMarginHistory(symbol, params),
  [symbol, params.from, params.to, params.limit], // 查詢條件放這裡，變了就重抓
  { enabled: !!symbol }                            // 沒選股就不發請求
);
```

- deps 放**原始值**（字串、數字），不要放物件——物件每次 render 都是新的，會無限重抓。
- `enabled: false` 時不發請求並清空舊資料，用於「尚未選取股票」。
- 需要輪詢給 `pollingMs`；輪詢造成的重抓不會把畫面打回載入狀態。
- 它已處理「元件卸載後不 setState」與「舊請求後回來覆蓋新結果」，不要繞過它自己 fetch。

**輪詢間隔別亂調短**。即時報價與大盤那幾支是直接打證交所 / 櫃買中心，上游有限流：
即時報價 30 秒是下限，大盤那幾支乾脆不輪詢（按重新整理）。

---

## 版面與頁面結構

版面由 `DashboardLayout` 組成：側邊欄（`Sidebar`）+ 頁首（`Topbar`）+ 內容區 + 頁尾（`AppFooter`）。
**捲動、內距與 `max-w-[1200px]` 置中都在 layout 處理**，頁面不要再自己包 `overflow-y-auto` 或 `p-8`。

每一頁長這樣，順序不要變：

```tsx
export default function Xxx() {
  const { symbol } = useSymbol();          // 需要代號的頁才有
  const [params, setParams] = useState<HistoryParams>({ limit: 60 });
  const { data, loading, error, reload } = useAsyncData(...);

  return (
    <>
      <PageHeader
        title="頁面名稱"
        subtitle={...}                      // 目前代號、資料日期、這頁在看什麼
        right={<><RangeFilter .../><SymbolSearch /></>}
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這頁資料的單位、涵蓋範圍與陷阱說明
        </p>

        {!symbol && <PageState kind="idle" hint="..." />}
        {loading && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reload} />}
        {!loading && !error && items.length === 0 && (
          <PageState kind="empty" message="..." hint="這一頁的空資料代表什麼" />
        )}

        {items.length > 0 && (/* 表格或卡片 */)}
      </div>
    </>
  );
}
```

**空資料的 `hint` 每頁都要寫，而且要寫對**。這個專案的「沒有資料」有好幾種完全不同的意思：

- 收盤 / 法人 / 融資券 / 估值：這檔不在自選股清單、區間內都是非交易日、或那幾天還沒收集
- 融資融券：這檔沒有信用交易資格（新上市未滿六個月、全額交割股）
- 估值：ETF 與剛上市的個股本來就沒有本益比
- 注意股：**空的是好消息**，多數個股從來沒被列過注意
- 重大訊息：多數公司一個月發不到一則

只丟一句「沒有資料」會讓人以為系統壞了。

---

## 樣式規範

設計系統是 Material 3 色彩角色 + 自訂字級的淺色主題，全部定義在 `tailwind.config.js`
（來自設計稿，品牌名「精準資本」）。

### 顏色

一律用語意化 token，**不要在元件裡寫死色碼，也不要用 Tailwind 內建色階**
（`bg-gray-800`、`text-red-500` 這種）：

| 用途 | class |
|---|---|
| 頁面底色 / 文字 | `bg-background` / `text-on-background` |
| 側邊欄（深色） | `bg-primary` `text-on-primary`，選中項 `bg-primary-container` |
| 卡片 / 表格容器 | `bg-surface-container-lowest` + `border-outline-variant` |
| 表頭 / 次要區塊 | `bg-surface-container-low` |
| 輸入框 | `bg-surface-container` + `border-outline-variant` |
| 主要文字 / 次要文字 / 更淡 | `text-on-surface` / `text-on-surface-variant` / `text-outline` |
| 上漲、買超（台股慣例漲紅） | `quote-up` |
| 下跌、賣超 | `quote-down` |
| 買入區間、正向狀態 | `secondary` |
| 錯誤、警示（取價失敗、注意股、達門檻） | `error` |

漲跌顏色不要自己判斷正負，用 `utils/format.ts` 的 `quoteColor(value)`（文字色）或
`quoteBadge(value)`（膠囊徽章），它們同時處理了 null 與 0。

`quote-up` / `quote-down` 是這個專案自己加的兩個色票，不在設計稿的 M3 色彩角色裡。
**刻意不沿用 `error` / `secondary`**：那兩個角色同時是「錯誤／警示」與「買入區間」，
共用的話「想調漲跌色」會一併改到取價失敗、注意股徽章與買區那些不相干的地方。

> 全站採**台股慣例漲紅跌綠**（設計稿原本畫的是歐美的漲綠跌紅）。
> 要調深淺，改 `tailwind.config.js` 的那兩個色票即可；要整個對調，改 `quoteColor` /
> `quoteBadge` 這兩個函式。K 線的 K 棒與成交量、市場概況的「上漲 / 下跌」家數卡
> 都吃同一組色票，會一起變。

### 字級

字體與字級是成對的 token，`font-*` 給字族與字重、`text-*` 給大小行高，**兩個要一起用**：

| 用途 | class |
|---|---|
| 頁面主標 | `font-display text-display` |
| 區塊標題 | `font-headline-md text-headline-md` |
| 內文 | `font-body-md text-body-md`（小字 `body-sm`、大字 `body-lg`） |
| 表頭標籤 | `font-label-caps text-label-caps uppercase` |
| 數字（價格、量、比率） | `font-data-md text-data-md`（大字 `data-lg`），JetBrains Mono 等寬 |

所有數字欄位一律用 `font-data-*`：等寬字才不會讓逐列比對時的小數點跳來跳去。

### 間距

用設計稿的間距 token 而不是任意數字：`gap-stack-sm`（8px）、`gap-stack-md`（16px）、
`gap-stack-lg`（24px）。

### 常用 class 組合

保持一致，不要每頁自創：

- 表格容器：`overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm`
- 表頭：`bg-surface-container-low border-b border-outline-variant`
- `th`：`p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap`（第一欄加 `pl-4`）
- `tbody`：`divide-y divide-outline-variant/50`
- 資料列：`hover:bg-surface-container-low/50 transition-colors`
- 數字欄：`p-2 py-3 text-right font-data-md text-data-md`
- 主要按鈕：`px-4 py-2 bg-primary rounded text-on-primary font-body-md text-body-md hover:bg-primary-container`
- 次要按鈕：`px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low`
- 說明文字：`font-body-sm text-body-sm text-on-surface-variant`

### 圓角的坑

設計稿把 `borderRadius.full` 定成 `0.75rem`，所以 **`rounded-full` 不是正圓**。
需要正圓（頭像、狀態點）請寫 `rounded-[9999px]`。

### 圖示

Material Symbols Outlined，用法 `<span className="material-symbols-outlined">icon_name</span>`。
不要引入其他圖示庫。

---

## 註解語氣

沿用後端那套：**註解寫「為什麼」，不寫「做了什麼」**。程式碼自己會說做了什麼。

值得寫的：這個值為什麼可能是 null、為什麼選這個間隔、為什麼不用看起來更直覺的做法、
上游的哪個怪癖逼我們這樣寫、這個空清單代表什麼。

不值得寫的：`// 設定 loading 為 true`。

---

## Commit 規範

**不要加 `Co-Authored-By:` trailer，也不要加「Generated with ...」這類工具署名。**
PR 內容同理。

2026-08-14 已經把 `main` 上全部 19 個 commit 的 `Co-Authored-By: Claude` 改寫掉並 force push，
舊物件也清乾淨了。再加回去等於白做一次歷史改寫。

訊息本身沿用現有格式（`git log` 看得到）：標題一行講「做了什麼」，空行後條列**為什麼這樣做**，
最後一行標品質狀態。語言吃上面的「語言規範」——繁中或英文，不要簡體。

---

## 驗證

改完一定要跑過，兩個都要綠：

```bash
npx tsc --noEmit     # 型別
npm run build        # 完整編譯（CRA 的 lint 警告會一起顯示）
```

要實際看畫面：

```bash
cp .env.example .env          # 首次
BROWSER=none npm start        # http://localhost:3000
```

後端要一起起（見 `stock-market-analysis` 的 README），否則只有登入頁能看。

---

## 產業排名與同產業個股

`/stocks/revenue/peers/:symbol` 回這一檔的官方產業別、產業內排名與同產業清單。

排名依「最新月份的單月營收」，因為**月營收是唯一涵蓋全市場的資料**（1,900 多家、36 個產業，
每一筆都帶產業別）；收盤價、估值、融資券那幾張表只收自選股，拿來排名會變成「自選股內排名」。
同理，同產業表只給營收與增減率，不給價格與本益比——同產業動輒兩百家，多數沒有落地價格。

## 自選股與「我的持股」的界線

後端只有一張 `portfolio_holdings` 表，自選與持股混在一起，**沒有「是不是持股」的欄位**。
前端用股數區分，這是唯一可用而且語意剛好正確的判準：

| | 條件 | 頁面 | 在看什麼 |
|---|---|---|---|
| 自選股 | 全部 | `/portfolio` | 行情與買點（現價、回檔、買入區間） |
| 我的持股 | `shares != null` | `/holdings` | 部位（市值、損益、比重） |

沒填股數的檔會列在 `/holdings` 最下方的「觀察中」區塊，按「建立部位」填入股數即可升級成持股。
兩頁列出同一份清單的話，`/holdings` 就只是自選股頁多幾欄，沒有存在意義。

⚠️ `/portfolio/valuation` 是**逐列**回的（持股表一列一筆），不是逐檔。同一檔分散在多個帳戶時
那支會回好幾筆同代號的資料，`/portfolio` 要先依代號併起來才 render——直接拿來跑會出現
重複的列與重複的 React key。併起來之後「這一檔的損益」在多筆成本不同時沒有單一答案
（要加權就得有股數，而那一頁沒有），一律顯示破折號，逐筆看 `/holdings`。

`/holdings` 的一列 = 持股表的一列 = **一個帳戶的一筆部位**，不併成一檔。同一檔分散在多家券商時
各家的股數與成本不同，併起來就看不出哪一筆是哪個帳戶的，賣出時也對不起來；合計則橫跨所有帳戶。
帳戶名稱存在 `account` 欄位，**不要用 `note`**——那一欄已經被匯入程序寫成來源說明。

後端若之後加了明確的欄位（例如 `is_position`），改判斷式即可，不要兩套並存。

## 模擬買賣（`/paper`）

唯一一頁**完全不碰後端**的功能：後端沒有下單、現金與委託的概念，為了練習功能開一組端點不划算。
狀態整包存在 localStorage（`stock:paperTrading`），算式在 `utils/paperTrading.ts`，
畫面上已標明「換一台電腦或清掉瀏覽器資料就歸零」。

費率是台股的公開規則不是本專案的假設：手續費 0.1425%（最低 20 元、折數可調）、
賣出加收證交稅 0.3%。買進手續費會攤進平均成本，不攤的話損益會虛胖一個手續費。
報價沿用 `/portfolio/valuation`，那支已經處理好即時報價掛掉時退到延遲報價。

## 已知的執行期限制

- **加入自選股需要即時報價來源活著**。後端 `service.Add` 會先向證交所 MIS 確認代號真的存在，
  MIS 連不上時（收盤後常見）整支會回 500 `stock service is temporarily unavailable`，
  加不進去。這是後端刻意的驗證，LINE 聊天室的「/加 2330」也一樣，不是前端的問題。
- **融資融券與估值指標畫不出走勢圖**。上游取數 `GetMarginBalances(ctx)` / `GetValuations(ctx)`
  不吃日期，只收得到當天，也沒有回補指令，所以那兩頁的圖只有一個點（畫面會直接說明）。
  要補歷史得先在 TWSE/TPEx service 介面加上吃日期的變體，再寫兩支 backfill 收集器。
  收盤行情與個股三大法人則有回補：`cmd/notify -backfill-quotes=N`（月）、`-backfill-tradings=N`（天）。
- **持股試算（`/portfolio/valuation`）本來就慢**。二十檔要逐檔取行情、半年最高與 EPS，
  正常約 1.5～2 秒；MIS 掛掉而全部退到 Yahoo 時會拉到 15～20 秒。
  `api/portfolio.ts` 為此把逾時單獨放寬到 60 秒，不要把它調回預設值。

## 尚未建立的東西

以下還沒做，需要時參考 `minecraft-server-fe` 的對應檔案：

- 註冊頁（後端 `/users/signup` 已就緒，`api/auth.ts` 也接了，只差畫面）。
  簡訊登入已完成，在登入頁用分頁切換
- 頁首的通知與設定按鈕（設計稿有，後端無對應功能，目前停用）
- 設計稿的「高估」狀態徽章：後端沒有這個欄位，要先定義判斷規則（目前只有
  買入區間 / 觀察中 / 取價失敗三種，全部直接來自後端）
- 頁尾的隱私權政策 / 服務條款 / 監管聲明 / 聯絡客服四個連結（目前指向 `#`）
- `/stocks/twse`、`/stocks/tpex` 的其餘端點（排行、盤後定價、停資停券…，清單見兩支 api 檔開頭）
- 個股總覽設計稿上仍然做不出來的區塊，整塊省略而不是畫空版位：
  - **周轉率**：要股本（發行股數）才算得出來，後端沒有這個欄位
  - **排行走勢圖**（成交量排行 / 漲幅排行的逐日名次）：`/stocks/twse/volume_ranks`
    只回當日前二十名，沒有逐日名次歷史可畫
  - **主題族群**（設計稿的「散熱族群個股」）：那是人工整理的選股清單，免費資料源沒有。
    已經做的是**官方產業別**的同業比較（`/stocks/revenue/peers/:symbol`），
    兩者不一樣——同樣做散熱的高力、奇鋐、雙鴻分屬電機機械、電腦及週邊設備業、其他電子業，
    不會出現在同一張表裡。畫面上已標明這件事，不要再把它當成族群分析
- 個股總覽的 K 線「年線」：落地的收盤行情從開始收集才有，湊不出幾根年 K，
  目前只做日 / 週 / 月三種（併週併月在 `utils/chart.ts`）
- 多喵 Alert 發送清單設計稿上三個 EPS 欄位，後端只存 `trailing_eps` / `full_year_eps` /
  `latest_quarter_eps` 三個數字，拆解與衍生值都沒有：
  - **前三季累計 EPS**、**預估下季 EPS**：後端沒存預估整年 EPS 的組成
  - **合理股價低點（預估 EPS × 15）**：×15 是估值規則不是格式化，跟買區係數、
    紅字門檻一樣該由後端定義後回傳，不要在前端各算一份
- 市場概況設計稿的兩個區塊：
  - **熱門板塊**（各產業漲跌幅與成交量）：後端沒有板塊／產業別的聚合資料，
    產業別只能逐檔從 `/stocks/revenue` 的回應附帶取得
  - **存入資金**按鈕：本專案沒有券商下單或金流功能
- 集中市場沒有漲跌幅排行端點（只有 `/stocks/twse/volume_ranks` 成交量前二十名），
  所以市場概況的上市榜只能把那 20 檔重新排序。上櫃那邊有 `price_advanced` /
  `price_declined` 但上游不給成交量。兩邊語意不同，標題與註腳都標清楚了，不要混為一談
- 推播訊息的紅字門檻（回檔 ≥ 25%、PE ≥ 90）目前在前端抄了一份（`pages/Alert.tsx`），
  後端那份在 `ioc/portfolio.go` 且可設定。後端若開了讀設定的端點就改成打 API，
  否則兩邊調整時要記得一起改

## API 位址的兩條注入路徑

`src/config.ts` 的優先序是 `window.__APP_CONFIG__.apiBase` > `REACT_APP_API_BASE` > 本機預設，
對應兩種部署方式，改位址前先確認自己走哪一條：

| 部署方式 | 走哪一層 | 怎麼改 |
|---|---|---|
| 容器（`Dockerfile`） | 執行期 `/config.js` | `docker run -e API_BASE=...`，同一顆 image 換環境變數就換後端 |
| GitHub Pages（`.github/workflows/gh-pages.yml`） | 建置期 bundle | repo Variable `REACT_APP_API_BASE`，改完要重跑 workflow |

Pages 只有靜態檔沒有啟動腳本，沒地方產生 `/config.js`，所以只能吃建置期那層——
這也表示位址會明文烤進 bundle，放 repo Variables 就好，放 Secrets 只是自我安慰。
