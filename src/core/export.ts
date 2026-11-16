import type { Frame, OutFormat, Settings } from '../types';
import { paintBase, paintItem, paintStickers, planRender, type Decor, type RenderPlan } from './render';

export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality);
  });
}

/** Paint a plan with the in-memory working copies. Synchronous, used for the live preview. */
export function renderTo(canvas: HTMLCanvasElement, plan: RenderPlan, frames: Frame[], decor?: Decor) {
  const { layout } = plan;
  if (canvas.width !== layout.width) canvas.width = layout.width;
  if (canvas.height !== layout.height) canvas.height = layout.height;
  const ctx = canvas.getContext('2d')!;
  paintBase(ctx, plan);
  const byId = new Map(frames.map((f) => [f.id, f]));
  for (const item of layout.items) {
    const f = byId.get(item.id);
    if (!f) continue;
    paintItem(ctx, plan, item, f.work, f.work.width / f.w, f.work.height / f.h);
  }
  if (decor) paintStickers(ctx, plan, decor);
}

/** True when the output is larger than what the working copies can supply sharply. */
export function needsOriginals(plan: RenderPlan, frames: Frame[]): boolean {
  const byId = new Map(frames.map((f) => [f.id, f]));
  return plan.layout.items.some((item) => {
    const f = byId.get(item.id);
    if (!f || f.work.width >= f.w) return false;
    return item.dw > item.sw * (f.work.width / f.w) * 1.01;
  });
}

/** Render the final image, decoding original files one at a time when extra resolution is needed. */
export async function renderFinal(
  frames: Frame[],
  settings: Settings,
  decor?: Decor,
): Promise<{ canvas: HTMLCanvasElement; plan: RenderPlan }> {
  const plan = planRender(frames, settings);
  const canvas = document.createElement('canvas');
  if (!needsOriginals(plan, frames)) {
    renderTo(canvas, plan, frames, decor);
    return { canvas, plan };
  }
  canvas.width = plan.layout.width;
  canvas.height = plan.layout.height;
  const ctx = canvas.getContext('2d')!;
  paintBase(ctx, plan);
  const byId = new Map(frames.map((f) => [f.id, f]));
  for (const item of plan.layout.items) {
    const f = byId.get(item.id);
    if (!f) continue;
    if (f.work.width >= f.w) {
      paintItem(ctx, plan, item, f.work, 1, 1);
      continue;
    }
    const original = await createImageBitmap(f.blob);
    paintItem(ctx, plan, item, original, 1, 1);
    original.close();
  }
  if (decor) paintStickers(ctx, plan, decor);
  return { canvas, plan };
}

export interface Encoded {
  blob: Blob;
  width: number;
  height: number;
  /** Quality actually used (0..100), or null for lossless. */
  quality: number | null;
  /** True when quality or size had to be lowered to respect the size limit. */
  adjusted: boolean;
}

const MIME: Record<OutFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const EXT: Record<OutFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

function scaled(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * factor));
  c.height = Math.max(1, Math.round(src.height * factor));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * Encode a canvas. With a size limit, quality is lowered first (lossy formats),
 * then the image is scaled down until it fits.
 */
export async function encodeCanvas(
  source: HTMLCanvasElement,
  format: OutFormat,
  quality: number,
  maxBytes: number,
): Promise<Encoded> {
  const mime = MIME[format];
  const lossy = format !== 'png';
  let canvas = source;
  let q = quality / 100;
  let blob = await toBlob(canvas, mime, lossy ? q : undefined);
  let adjusted = false;

  if (maxBytes > 0 && blob.size > maxBytes) {
    adjusted = true;
    if (lossy) {
      let lo = 0.4;
      let hi = q;
      let best: Blob | null = null;
      let bestQ = lo;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        const b = await toBlob(canvas, mime, mid);
        if (b.size <= maxBytes) {
          best = b;
          bestQ = mid;
          lo = mid;
        } else hi = mid;
      }
      if (best) {
        blob = best;
        q = bestQ;
      } else {
        q = lo;
        blob = await toBlob(canvas, mime, q);
      }
    }
    for (let i = 0; i < 6 && blob.size > maxBytes; i++) {
      const factor = Math.min(0.95, Math.sqrt(maxBytes / blob.size) * 0.97);
      canvas = scaled(canvas, factor);
      blob = await toBlob(canvas, mime, lossy ? q : undefined);
    }
  }
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    quality: lossy ? Math.round(q * 100) : null,
    adjusted,
  };
}

export const canCopyImage = () =>
  typeof navigator !== 'undefined' && !!navigator.clipboard && typeof ClipboardItem !== 'undefined';

/** Put a PNG of the canvas on the clipboard, ready to paste into a chat or post. */
export async function copyCanvas(canvas: HTMLCanvasElement): Promise<void> {
  if (!canCopyImage()) throw new Error('clipboard-unsupported');
  const pending = toBlob(canvas, 'image/png');
  try {
    // Passing the promise keeps the write inside the user gesture (required by Safari).
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pending })]);
  } catch {
    const blob = await pending;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([new Blob(['x'])], 'a.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

export async function shareBlob(blob: Blob, filename: string, text: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  await navigator.share({ files: [file], text: text || undefined });
}

/** A tidy file name built from the title and the current time. */
export function fileName(settings: Settings, type: string, now = new Date()): string {
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const title = settings.title
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 40)
    .trim();
  return `${title || 'CaptionStitch'}-${stamp}.${ext}`;
}

/** The text that accompanies the image when sharing or copying the caption. */
export function shareText(settings: Settings): string {
  return [settings.title.trim(), settings.note.trim()].filter(Boolean).join('\n\n');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
