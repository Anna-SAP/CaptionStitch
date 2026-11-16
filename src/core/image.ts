import type { Frame, FrameStats, Rect } from '../types';
import { FULL_RECT } from '../types';
import { darkCols, darkRows, detectBandInFrame, type BandHit } from './detect';

/** Working copies are capped at this width to keep memory in check. */
export const WORK_MAX_WIDTH = 1920;

let scratch: HTMLCanvasElement | null = null;
function scratchCtx(w: number, h: number): CanvasRenderingContext2D {
  scratch ??= document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  return scratch.getContext('2d', { willReadFrequently: true })!;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Row and column darkness, sampled at exact source resolution along the measured axis. */
function analyse(bitmap: ImageBitmap): FrameStats {
  const { width: w, height: h } = bitmap;
  const SAMPLES = 256;
  let ctx = scratchCtx(SAMPLES, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, SAMPLES, h);
  const rowDark = darkRows(ctx.getImageData(0, 0, SAMPLES, h));
  // Columns are judged on the middle half only, so letterbox bars do not count as dark columns.
  ctx = scratchCtx(w, 96);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, h * 0.25, w, h * 0.5, 0, 0, w, 96);
  const colDark = darkCols(ctx.getImageData(0, 0, w, 96));
  return { rowDark, colDark };
}

function makeThumb(bitmap: ImageBitmap): string {
  const tw = 240;
  const th = Math.max(1, Math.round((bitmap.height / bitmap.width) * tw));
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, tw, th);
  return c.toDataURL('image/jpeg', 0.72);
}

/** Decode an image file and prepare everything the editor needs from it. */
export async function importBlob(blob: Blob, name: string, id = newId()): Promise<Frame> {
  const bitmap = await createImageBitmap(blob);
  const { width: w, height: h } = bitmap;
  const stats = analyse(bitmap);
  let work = bitmap;
  if (w > WORK_MAX_WIDTH) {
    const c = document.createElement('canvas');
    c.width = WORK_MAX_WIDTH;
    c.height = Math.round((h / w) * WORK_MAX_WIDTH);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    work = await createImageBitmap(c);
    bitmap.close();
  }
  return {
    id,
    name,
    blob,
    w,
    h,
    work,
    thumb: makeThumb(work),
    stats,
    crop: FULL_RECT,
    cropAuto: true,
    full: null,
    band: null,
  };
}

const bandCache = new WeakMap<ImageBitmap, { key: string; hit: BandHit | null }>();

/** Look for subtitle text inside the frame's content area (cached per crop). */
export function analyseBand(frame: Frame): BandHit | null {
  const key = cropKey(frame.crop);
  const cached = bandCache.get(frame.work);
  if (cached && cached.key === key) return cached.hit;
  const sx = frame.crop.x * frame.work.width;
  const sy = frame.crop.y * frame.work.height;
  const sw = frame.crop.w * frame.work.width;
  const sh = frame.crop.h * frame.work.height;
  const aw = Math.max(40, Math.min(960, Math.round(sw)));
  const ah = Math.max(40, Math.round((sh / sw) * aw));
  const ctx = scratchCtx(aw, ah);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(frame.work, sx, sy, sw, sh, 0, 0, aw, ah);
  const hit = detectBandInFrame(ctx.getImageData(0, 0, aw, ah));
  bandCache.set(frame.work, { key, hit });
  return hit;
}

export function cropKey(r: Rect): string {
  return [r.x, r.y, r.w, r.h].map((v) => v.toFixed(5)).join(',');
}

export const IMAGE_TYPES = /^image\/(png|jpe?g|webp|avif|gif|bmp)$/i;
export const isImageFile = (f: File | Blob) => IMAGE_TYPES.test(f.type);
export const isVideoFile = (f: File | Blob) => /^video\//i.test(f.type);
