import type { Band, Rect, Settings } from '../types';

/** What the layout engine needs to know about one frame. */
export interface LayoutFrame {
  id: string;
  /** Original pixel size. */
  w: number;
  h: number;
  crop: Rect;
  full: boolean | null;
  band: Band | null;
}

export interface Placed {
  id: string;
  index: number;
  /** Destination rectangle in output pixels. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Source rectangle in original pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Whether the whole content area is shown. */
  full: boolean;
  /** The band in effect for this frame (fractions of content height). */
  band: Band;
  /** Output height the whole content area would take at this width. */
  fullH: number;
}

export interface Layout {
  width: number;
  height: number;
  /** Rectangle that holds all frames (text blocks sit above and below it). */
  body: { x: number; y: number; w: number; h: number };
  items: Placed[];
  /** Output pixels per 1080-reference pixel. */
  unit: number;
  pad: number;
  gap: number;
  radius: number;
  headerH: number;
  footerH: number;
}

export const MIN_BAND = 0.02;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Keep a band inside 0..1 with a minimum height. */
export function normalizeBand(b: Band): Band {
  let top = clamp(b.top, 0, 1 - MIN_BAND);
  let bottom = clamp(b.bottom, MIN_BAND, 1);
  if (bottom - top < MIN_BAND) {
    if (top + MIN_BAND <= 1) bottom = top + MIN_BAND;
    else top = bottom - MIN_BAND;
  }
  return { top, bottom };
}

/** In captions mode the first frame is shown whole unless the user decided otherwise. */
export function isFull(frame: LayoutFrame, index: number, mode: Settings['layout']): boolean {
  if (mode !== 'captions') return true;
  return frame.full ?? index === 0;
}

/** Width of the widest content area in original pixels. */
export function sourceWidth(frames: LayoutFrame[]): number {
  let max = 0;
  for (const f of frames) max = Math.max(max, Math.round(f.w * f.crop.w));
  return max;
}

/** Final image width for the current settings. */
export function outputWidth(frames: LayoutFrame[], s: Settings): number {
  const src = sourceWidth(frames) || 1080;
  if (!s.width) return src;
  return s.width;
}

export interface TextHeights {
  header: number;
  footer: number;
}

/**
 * Compute where every frame goes. Pure: no canvas, no DOM.
 * `width` is the final image width; text heights are measured by the caller.
 */
export function computeLayout(
  frames: LayoutFrame[],
  s: Settings,
  width: number,
  text: TextHeights = { header: 0, footer: 0 },
): Layout {
  const unit = width / 1080;
  const pad = Math.round(s.padding * unit);
  const gap = Math.round(s.gap * unit);
  const radius = Math.round(s.radius * unit);
  const inner = Math.max(1, width - pad * 2);
  const items: Placed[] = [];
  const top = pad + text.header;
  let y = top;

  const base = (f: LayoutFrame, index: number) => {
    const cw = f.w * f.crop.w;
    const ch = f.h * f.crop.h;
    return { cw, ch, index, id: f.id };
  };

  if (s.layout === 'grid' && frames.length > 0) {
    const cols = clamp(Math.round(s.columns), 1, Math.max(1, frames.length));
    const cellW = Math.floor((inner - gap * (cols - 1)) / cols);
    const first = base(frames[0], 0);
    const cellH = Math.max(1, Math.round((cellW * first.ch) / first.cw));
    const cellAspect = cellW / cellH;
    frames.forEach((f, index) => {
      const { cw, ch } = base(f, index);
      const col = index % cols;
      const row = Math.floor(index / cols);
      // Centre-crop every frame to the cell's aspect ratio so the grid is even.
      let sw = cw;
      let sh = ch;
      if (cw / ch > cellAspect) sw = ch * cellAspect;
      else sh = cw / cellAspect;
      items.push({
        id: f.id,
        index,
        dx: pad + col * (cellW + gap),
        dy: top + row * (cellH + gap),
        dw: cellW,
        dh: cellH,
        sx: f.w * f.crop.x + (cw - sw) / 2,
        sy: f.h * f.crop.y + (ch - sh) / 2,
        sw,
        sh,
        full: true,
        band: normalizeBand(f.band ?? s.band),
        fullH: cellH,
      });
    });
    const rows = Math.ceil(frames.length / cols);
    y = top + rows * cellH + (rows - 1) * gap;
  } else {
    frames.forEach((f, index) => {
      const { cw, ch } = base(f, index);
      const band = normalizeBand(f.band ?? s.band);
      const full = isFull(f, index, s.layout);
      const fullH = (inner * ch) / cw;
      const frac = full ? 1 : band.bottom - band.top;
      const dh = Math.max(1, Math.round(fullH * frac));
      if (index > 0) y += gap;
      items.push({
        id: f.id,
        index,
        dx: pad,
        dy: y,
        dw: inner,
        dh,
        sx: f.w * f.crop.x,
        sy: f.h * f.crop.y + (full ? 0 : band.top * ch),
        sw: cw,
        sh: ch * frac,
        full,
        band,
        fullH,
      });
      y += dh;
    });
  }

  const bodyH = y - top;
  const height = Math.max(1, y + text.footer + pad);
  return {
    width,
    height,
    body: { x: pad, y: top, w: inner, h: bodyH },
    items,
    unit,
    pad,
    gap,
    radius,
    headerH: text.header,
    footerH: text.footer,
  };
}

/** Browsers refuse canvases beyond these bounds; stay inside them. */
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 120_000_000;

/** Largest width (≤ requested) whose layout still fits in a canvas. */
export function fitWidth(width: number, height: number): number {
  let scale = 1;
  if (height > MAX_CANVAS_SIDE) scale = Math.min(scale, MAX_CANVAS_SIDE / height);
  if (width > MAX_CANVAS_SIDE) scale = Math.min(scale, MAX_CANVAS_SIDE / width);
  if (width * height * scale * scale > MAX_CANVAS_AREA) {
    scale = Math.min(scale, Math.sqrt(MAX_CANVAS_AREA / (width * height)));
  }
  return Math.max(1, Math.floor(width * scale));
}
