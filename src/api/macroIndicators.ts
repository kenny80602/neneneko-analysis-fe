import request from './request';
import { ApiResponse, MacroSnapshot } from './types';

// MacroHandler — /stocks/macro，國際指標：布蘭特原油、VIX、美元兌新台幣。
//
// ⚠️ 檔名刻意不叫 macro.ts：CRA 內建的 babel-plugin-macros 會把任何以 `/macro`
// 結尾的 import 當成**編譯期巨集**，在 build 時真的去載入執行這個模組，
// 然後在解析它自己的 import 時炸掉（Cannot find module './request'）。
// tsc 完全看不出問題，只有 npm run build 會失敗，而錯誤訊息指向 Market.tsx，
// 跟真正的原因差很遠。
//
// ⚠️ 這一支目前後端還沒上線，畫面已經照這份契約做好了。接的時候請對齊
// types.ts 的 MacroSnapshot：三個 key 是 BRENT／VIX／USDTWD，points 由舊到新，
// 取不到的值一律 null 不要給 0（那三個指標 0 都是不可能的值，會被畫成崩盤）。
//
// 這三個都不是台股資料，交易時段與休市日跟台股不同，所以每一個要各自帶 as_of，
// 不能共用一個「資料日期」。
//
// range 對應回看區間：1mo／3mo／6mo／1y。省略時後端自己決定預設。
export const getMacroIndicators = (range?: string) =>
  request
    .get<ApiResponse<MacroSnapshot>>('/stocks/macro', { params: { range } })
    .then((res) => res.data.data as MacroSnapshot);
