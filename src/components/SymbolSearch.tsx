import SymbolPicker from './SymbolPicker';

/**
 * 頁內的代號輸入框：可以直接打代號，也可以從自選股下拉挑一檔。
 * 送出後寫回 SymbolContext，個股各頁共用同一個代號；
 * 頁首那個全站搜尋（Topbar）走的是同一個元件與同一份 context。
 */
export default function SymbolSearch() {
  return <SymbolPicker icon="sell" placeholder="股票代號" inputClassName="w-32" submitLabel="查詢" />;
}
