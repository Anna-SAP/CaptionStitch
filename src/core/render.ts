import type { Settings } from '../types';
import { computeLayout, fitWidth, outputWidth, type Layout, type LayoutFrame, type Placed } from './layout';
import { footerBlock, headerBlock, textColors, type Measure, type TextBlock } from './text';

export interface RenderPlan {
  layout: Layout;
  header: TextBlock;
  footer: TextBlock;
  settings: Settings;
  /** True when the requested size had to be reduced to fit browser canvas limits. */
  reduced: boolean;
}

let measureCtx: CanvasRenderingContext2D | null = null;
export const canvasMeasure: Measure = (text, font) => {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
};

function planAt(frames: LayoutFrame[], s: Settings, width: number, measure: Measure) {
  const unit = width / 1080;
  const pad = Math.round(s.padding * unit);
  const header = headerBlock(s, width, unit, pad, measure);
  const footer = footerBlock(s, width, unit, pad, measure);
  const layout = computeLayout(frames, s, width, { header: header.height, footer: footer.height });
  return { layout, header, footer };
}

/** Work out the complete picture: frame positions, wrapped text and final size. */
export function planRender(
  frames: LayoutFrame[],
  s: Settings,
  measure: Measure = canvasMeasure,
  widthOverride?: number,
): RenderPlan {
  const wanted = Math.max(16, Math.round(widthOverride ?? outputWidth(frames, s)));
  let plan = planAt(frames, s, wanted, measure);
  const fitted = fitWidth(plan.layout.width, plan.layout.height);
  const reduced = fitted < wanted;
  if (reduced) plan = planAt(frames, s, fitted, measure);
  return { ...plan, settings: s, reduced };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function paintText(ctx: CanvasRenderingContext2D, block: TextBlock, top: number, bg: string) {
  const colors = textColors(bg);
  ctx.textBaseline = 'middle';
  for (const line of block.lines) {
    ctx.font = line.font;
    ctx.textAlign = line.align;
    ctx.fillStyle = line.muted ? colors.muted : colors.fg;
    ctx.fillText(line.text, line.x, top + line.y + line.lineHeight / 2);
  }
}

/** Background and text; frames are painted separately so they can be streamed in. */
export function paintBase(ctx: CanvasRenderingContext2D, plan: RenderPlan) {
  const { layout, settings } = plan;
  ctx.fillStyle = settings.bg;
  ctx.fillRect(0, 0, layout.width, layout.height);
  paintText(ctx, plan.header, layout.pad, settings.bg);
  paintText(ctx, plan.footer, layout.body.y + layout.body.h, settings.bg);
}

/**
 * Paint one frame. `scaleX/scaleY` convert original pixels to the pixels of `img`
 * (the working copy is usually smaller than the original file).
 */
export function paintItem(
  ctx: CanvasRenderingContext2D,
  plan: RenderPlan,
  item: Placed,
  img: CanvasImageSource,
  scaleX: number,
  scaleY: number,
) {
  const { layout } = plan;
  ctx.save();
  if (layout.radius > 0) {
    // With gaps every frame is its own card; without, the stack is one rounded block.
    if (layout.gap > 0 || plan.settings.layout === 'grid') {
      roundRect(ctx, item.dx, item.dy, item.dw, item.dh, layout.radius);
    } else {
      roundRect(ctx, layout.body.x, layout.body.y, layout.body.w, layout.body.h, layout.radius);
    }
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    item.sx * scaleX,
    item.sy * scaleY,
    Math.max(1, item.sw * scaleX),
    Math.max(1, item.sh * scaleY),
    item.dx,
    item.dy,
    item.dw,
    item.dh,
  );
  ctx.restore();
}
