import { CSSProperties, ReactNode } from 'react';
import { FlexComponent } from '../api/types';

// LINE Flex 訊息的算繪器。
//
// 為什麼要寫這一個而不是逐個樣板刻版面：後端有六個推播樣板，各自幾百行的 bubble 樹，
// 前端照著再排一次的話，後端每改一次字級或顏色，預覽就會偷偷跟實際訊息分岔——
// 而分岔的預覽比沒有預覽更糟，因為它看起來是對的。這裡照 LINE 的規格畫「任何一棵樹」，
// 所以後端改版面、加樣板，這個檔案都不用動。
//
// ⚠️ 這裡的顏色與尺寸刻意**不用**本站的設計 token（同 LineMessagePreview 的取捨）：
// 預覽的重點是「LINE 上會長怎樣」，套本站色票只會讓預覽跟實際訊息對不起來。
//
// 沒有做的部分（後端目前一個都沒用到，用到再加）：image、video、icon、button、
// action（點擊行為預覽不了）、carousel 的滑動。

// LINE 聊天室的底色，跟 LineMessagePreview 同一個值。
const LINE_BACKGROUND = '#8cabd0';

// 字級關鍵字 → px。取自 LINE 的 Flex 規格，md 是預設值。
const FONT_SIZE: Record<string, number> = {
  xxs: 11,
  xs: 13,
  sm: 14,
  md: 16,
  lg: 19,
  xl: 22,
  xxl: 27,
  '3xl': 29,
  '4xl': 33,
  '5xl': 38,
};

// 間距關鍵字 → px。margin、spacing、padding 共用同一組。
const SPACE: Record<string, number> = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
};

// bubble 寬度關鍵字 → px。mega 是預設值。
const BUBBLE_WIDTH: Record<string, number> = {
  nano: 120,
  micro: 160,
  deca: 220,
  hecto: 241,
  kilo: 260,
  mega: 300,
  giga: 386,
};

/** 關鍵字或 "12px" 都吃。認不得就回 undefined，交給 CSS 用預設值。 */
function space(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value in SPACE) return `${SPACE[value]}px`;
  // LINE 允許直接給 px，例如 paddingAll: "10px"。
  return /^\d+(\.\d+)?px$/.test(value) ? value : undefined;
}

function fontSize(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value in FONT_SIZE) return `${FONT_SIZE[value]}px`;
  return /^\d+(\.\d+)?px$/.test(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * box 的 flex 屬性。
 *
 * LINE 的預設值跟 CSS 不一樣：horizontal box 裡的子元件預設 flex: 1（會平分寬度），
 * vertical box 裡預設 flex: 0（各自佔自己的高度）。照抄這條規則，
 * 不然所有橫排的表格欄位都會擠成一團。
 */
function flexStyle(component: FlexComponent, parentLayout: string): CSSProperties {
  const raw = component.flex;
  const value = typeof raw === 'number' ? raw : undefined;
  if (value === 0) return { flexGrow: 0, flexShrink: 0 };
  if (value != null) return { flexGrow: value, flexShrink: 1, flexBasis: 0 };
  if (parentLayout === 'horizontal' || parentLayout === 'baseline') {
    return { flexGrow: 1, flexShrink: 1, flexBasis: 0 };
  }
  return { flexGrow: 0, flexShrink: 0 };
}

/** margin 是「跟前一個元件之間」的距離，方向由父層的 layout 決定。 */
function marginStyle(component: FlexComponent, parentLayout: string): CSSProperties {
  const margin = space(component.margin);
  if (!margin) return {};
  return parentLayout === 'vertical' ? { marginTop: margin } : { marginLeft: margin };
}

function offsetStyle(component: FlexComponent): CSSProperties {
  const top = space(component.offsetTop);
  const start = space(component.offsetStart);
  if (!top && !start) return {};
  return { position: 'relative', top, left: start };
}

const ALIGN: Record<string, CSSProperties['textAlign']> = {
  start: 'left',
  center: 'center',
  end: 'right',
};

function renderText(component: FlexComponent, parentLayout: string): ReactNode {
  const style: CSSProperties = {
    fontSize: fontSize(component.size) ?? `${FONT_SIZE.md}px`,
    color: str(component.color) ?? '#000000',
    fontWeight: component.weight === 'bold' ? 700 : 400,
    textAlign: ALIGN[str(component.align) ?? ''] ?? undefined,
    // wrap 為 false（預設）時 LINE 會把過長的字截掉並補 …，不是換行。
    whiteSpace: component.wrap === true ? 'pre-wrap' : 'nowrap',
    overflow: component.wrap === true ? undefined : 'hidden',
    textOverflow: component.wrap === true ? undefined : 'ellipsis',
    lineHeight: 1.35,
    ...flexStyle(component, parentLayout),
    ...marginStyle(component, parentLayout),
    ...offsetStyle(component),
  };

  // 帶 contents 的 text 是由 span 組成的（同一行裡混不同顏色／字級），
  // 後端的表格列大量在用。這時 text 自己的 text 欄位不會出現。
  const spans = Array.isArray(component.contents) ? (component.contents as FlexComponent[]) : null;
  if (spans) {
    return (
      <div style={style}>
        {spans.map((span, index) => (
          <span
            key={index}
            style={{
              fontSize: fontSize(span.size),
              color: str(span.color),
              fontWeight: span.weight === 'bold' ? 700 : undefined,
              textDecoration: str(span.decoration),
            }}
          >
            {str(span.text)}
          </span>
        ))}
      </div>
    );
  }
  return <div style={style}>{str(component.text)}</div>;
}

function renderBox(component: FlexComponent, parentLayout: string): ReactNode {
  const layout = str(component.layout) ?? 'vertical';
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: layout === 'vertical' ? 'column' : 'row',
    // baseline 是 LINE 專用的橫排：子元件的文字基線對齊，做數字表格用的。
    alignItems: layout === 'baseline' ? 'baseline' : undefined,
    gap: space(component.spacing),
    backgroundColor: str(component.backgroundColor),
    borderRadius: space(component.cornerRadius) ?? str(component.cornerRadius),
    padding: space(component.paddingAll),
    paddingTop: space(component.paddingTop),
    paddingBottom: space(component.paddingBottom),
    paddingLeft: space(component.paddingStart),
    paddingRight: space(component.paddingEnd),
    height: str(component.height),
    width: str(component.width),
    minWidth: 0,
    ...flexStyle(component, parentLayout),
    ...marginStyle(component, parentLayout),
    ...offsetStyle(component),
  };
  const children = Array.isArray(component.contents) ? (component.contents as FlexComponent[]) : [];
  return (
    <div style={style}>
      {children.map((child, index) => (
        <FlexNode key={index} component={child} parentLayout={layout} />
      ))}
    </div>
  );
}

function FlexNode({
  component,
  parentLayout,
}: {
  component: FlexComponent;
  parentLayout: string;
}): ReactNode {
  switch (component.type) {
    case 'box':
      return renderBox(component, parentLayout);
    case 'text':
      return renderText(component, parentLayout);
    case 'separator':
      return (
        <div
          style={{
            borderTop: `1px solid ${str(component.color) ?? '#E0E0E0'}`,
            ...marginStyle(component, parentLayout),
          }}
        />
      );
    case 'filler':
      // filler 是「把剩下的空間吃掉」的空元件，橫排時用來把右邊的欄位推到底。
      return <div style={{ flexGrow: 1, ...flexStyle(component, parentLayout) }} />;
    default:
      // 沒對應的元件不要整棵樹爆掉：畫一個標示出來，其他部分照樣看得到。
      return (
        <div style={{ fontSize: 11, color: '#B00020' }}>
          [尚未支援的 Flex 元件：{String(component.type)}]
        </div>
      );
  }
}

/** 一顆 bubble。header／hero／footer 目前後端沒用到，但一併畫，以後加了不必再改。 */
function Bubble({ contents }: { contents: FlexComponent }) {
  const width = BUBBLE_WIDTH[str(contents.size) ?? 'mega'] ?? BUBBLE_WIDTH.mega;
  const sections = ['header', 'hero', 'body', 'footer'] as const;
  return (
    <div
      style={{
        width,
        maxWidth: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
      }}
    >
      {sections.map((section) => {
        const node = contents[section] as FlexComponent | undefined;
        if (!node) return null;
        return <FlexNode key={section} component={node} parentLayout="vertical" />;
      })}
    </div>
  );
}

/**
 * 一則 LINE 訊息（flex 或 text），畫在聊天室底色上。
 *
 * carousel 會排成一排橫向捲動，跟 LINE 上滑動的行為一致。
 */
export default function FlexMessage({
  contents,
  text,
}: {
  contents?: FlexComponent;
  text?: string;
}) {
  return (
    <div style={{ backgroundColor: LINE_BACKGROUND, padding: 12, borderRadius: 12 }}>
      {text != null && (
        <div
          style={{
            display: 'inline-block',
            maxWidth: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            padding: '8px 12px',
            fontSize: 15,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
          }}
        >
          {text}
        </div>
      )}
      {contents?.type === 'carousel' && Array.isArray(contents.contents) && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {(contents.contents as FlexComponent[]).map((bubble, index) => (
            <Bubble key={index} contents={bubble} />
          ))}
        </div>
      )}
      {contents?.type === 'bubble' && <Bubble contents={contents} />}
    </div>
  );
}
