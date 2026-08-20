import { ChartViewport } from '../hooks/useChartViewport';

interface ChartControlsProps {
  viewport: ChartViewport;
  /** 目前看的是哪一段，例如「05/02 ～ 08/20」。由呼叫端算，這裡不認識日期。 */
  rangeLabel?: string;
}

/**
 * 圖表的縮放與平移控制列。
 *
 * 為什麼要有按鈕，拖曳與滾輪不夠嗎——不夠：
 *  - 拖曳與 Shift + 滾輪都是**看不見的**功能，沒有人會去試。按鈕本身就是說明書。
 *  - 觸控裝置上沒有滾輪，捏合縮放也還沒做。
 *  - 鍵盤使用者只有按鈕能用。
 *
 * 「全部」永遠可按（即使已經是全部），它同時是「我不知道自己現在在看哪裡」時的逃生門。
 */
export default function ChartControls({ viewport, rangeLabel }: ChartControlsProps) {
  // 資料少到不必縮放時整條不顯示：一排全部反灰的按鈕只是雜訊。
  if (viewport.total <= 5) return null;

  const buttonClass =
    'p-1 rounded border border-outline-variant bg-surface text-on-surface-variant ' +
    'hover:bg-surface-container-low hover:text-primary transition-colors ' +
    'disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-on-surface-variant';

  return (
    // 拖曳與 Shift + 滾輪都看不出來，掛在整條控制列上當提示：
    // 會想放大的人游標本來就會往這幾顆按鈕移動，剛好會經過這裡。
    <div
      className="flex items-center gap-1.5"
      title="也可以直接拖曳圖表左右移動，按住 Shift 滾輪縮放"
    >
      <span className="font-body-sm text-body-sm text-outline whitespace-nowrap">
        {viewport.count}/{viewport.total} 點
        {rangeLabel && <span className="ml-1 font-data-md text-data-md">{rangeLabel}</span>}
      </span>

      <button
        type="button"
        onClick={viewport.panLeft}
        disabled={!viewport.canPanLeft}
        title="往前（看更早的資料）"
        aria-label="往前"
        className={buttonClass}
      >
        <span className="material-symbols-outlined text-[18px] block">chevron_left</span>
      </button>
      <button
        type="button"
        onClick={viewport.panRight}
        disabled={!viewport.canPanRight}
        title="往後（看更近的資料）"
        aria-label="往後"
        className={buttonClass}
      >
        <span className="material-symbols-outlined text-[18px] block">chevron_right</span>
      </button>
      <button
        type="button"
        onClick={viewport.zoomOut}
        disabled={!viewport.canZoomOut}
        title="縮小（看更長的期間）"
        aria-label="縮小"
        className={buttonClass}
      >
        <span className="material-symbols-outlined text-[18px] block">zoom_out</span>
      </button>
      <button
        type="button"
        onClick={viewport.zoomIn}
        disabled={!viewport.canZoomIn}
        title="放大（看更短的期間）"
        aria-label="放大"
        className={buttonClass}
      >
        <span className="material-symbols-outlined text-[18px] block">zoom_in</span>
      </button>
      <button
        type="button"
        onClick={viewport.reset}
        title="回到預設範圍"
        aria-label="重設範圍"
        className={buttonClass}
      >
        <span className="material-symbols-outlined text-[18px] block">restart_alt</span>
      </button>
    </div>
  );
}
