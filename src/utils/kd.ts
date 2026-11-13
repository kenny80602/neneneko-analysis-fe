// 指數 KD 的提示等級。純函式，不 import api 或元件。
//
// ⚠️ 這是「提示」不是預測：2026-11-13 對加權指數做過事件研究（2016-10～2026-11、2,453 個交易日），
// K≥80 之後 20 日的下跌機率是 33%，比全部交易日的 36% 還低；多頭時 KD 會長時間停在 80 以上（高檔鈍化）。
// 門檻（70 以上算接近、80 以上算高檔）是使用者指定的使用習慣，不是檢定出來的最佳切點。
// 數字抄自後端 analysis/taiex_kd_study.py，是帶日期的快照，不會自己更新。

/** K 值到這個數字算「接近 80」。 */
export const KD_NEAR = 70;
/** K 值到這個數字算「進入高檔區」。 */
export const KD_HIGH = 80;

export type KdLevel = 'high' | 'near' | 'none';

/**
 * 依 K 值決定提示等級。K 是 null／NaN 時回 none：算不出來就不提示，不當成 0。
 * 只看 K 不看 D：K 比 D 快，是「接近 80」的先行訊號，使用者也是這樣描述的。
 */
export function kdLevel(k: number | null | undefined): KdLevel {
  if (k == null || !Number.isFinite(k)) return 'none';
  if (k >= KD_HIGH) return 'high';
  if (k >= KD_NEAR) return 'near';
  return 'none';
}
