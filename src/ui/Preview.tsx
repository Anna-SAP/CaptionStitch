import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { encodeCanvas, formatBytes, renderTo, type Encoded } from '../core/export';
import { MIN_BAND, clamp, type Placed } from '../core/layout';
import { t } from '../i18n';
import { anchorAt, stickerBox } from '../core/stickers';
import {
  activeId,
  activeSticker,
  decor,
  frames,
  plan,
  removeSticker,
  setBand,
  setFrameBand,
  settings,
  showGuides,
  stickers,
  updateSticker,
} from '../state';
import type { Frame, Sticker } from '../types';
import { useDrag } from './controls';
import { FrameTools } from './FrameTools';
import { Icon } from './icons';

const pct = (v: number) => `${v * 100}%`;

function ItemOverlay({ item, frame, width, height, count, primary }: { item: Placed; frame: Frame; width: number; height: number; count: number; primary: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const captions = settings.value.layout === 'captions';
  const active = activeId.value === frame.id;

  // Shared band: the lines sit on a whole frame, so the pointer position maps directly to a fraction.
  const guide = (edge: 'top' | 'bottom') =>
    useDrag(() => {
      const rect = ref.current!.getBoundingClientRect();
      return (_dx, _dy, e) => {
        const frac = clamp((e.clientY - rect.top) / rect.height, 0, 1);
        const b = settings.value.band;
        setBand(edge === 'top' ? { top: Math.min(frac, b.bottom - MIN_BAND), bottom: b.bottom } : { top: b.top, bottom: Math.max(frac, b.top + MIN_BAND) });
      };
    });
  const guideTop = guide('top');
  const guideBottom = guide('bottom');

  // One strip: its on-screen height stands for (bottom - top) of the content, so travel converts to a fraction.
  const edge = (which: 'top' | 'bottom') =>
    useDrag(() => {
      const rect = ref.current!.getBoundingClientRect();
      const start = item.band;
      const fullDisplay = rect.height / (start.bottom - start.top);
      return (_dx, dy) => {
        const d = dy / fullDisplay;
        setFrameBand(
          frame.id,
          which === 'top'
            ? { top: clamp(start.top + d, 0, start.bottom - MIN_BAND), bottom: start.bottom }
            : { top: start.top, bottom: clamp(start.bottom + d, start.top + MIN_BAND, 1) },
        );
      };
    });
  const edgeTop = edge('top');
  const edgeBottom = edge('bottom');

  const band = settings.value.band;
  return (
    <div
      ref={ref}
      class={`item${active ? ' active' : ''}${item.full ? ' full' : ' strip'}`}
      data-item={frame.id}
      style={{ left: pct(item.dx / width), top: pct(item.dy / height), width: pct(item.dw / width), height: pct(item.dh / height) }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && (activeId.value = frame.id)}
      onClick={() => {
        activeId.value = frame.id;
        activeSticker.value = null;
      }}
    >
      <span class="item-index">{item.index + 1}</span>
      <FrameTools frame={frame} index={item.index} count={count} full={item.full} />

      {captions && item.full && showGuides.value && (
        <div class={`guides${primary ? ' primary' : ''}`}>
          <div class="guide-line" style={{ top: pct(band.top) }} title={t('dragGuide')} {...guideTop}>
            <span class="guide-tag">{t('bandGuide')}</span>
          </div>
          <div class="guide-line" style={{ top: pct(band.bottom) }} title={t('dragGuide')} {...guideBottom} />
        </div>
      )}
      {captions && !item.full && (
        <>
          <div class="edge edge-top" title={t('dragTop')} {...edgeTop} />
          <div class="edge edge-bottom" title={t('dragBottom')} {...edgeBottom} />
        </>
      )}
    </div>
  );
}

/** A sticker's hit box in the preview: drag to move, drag the handle to resize and rotate. */
function StickerOverlay({ sticker }: { sticker: Sticker }) {
  const ref = useRef<HTMLDivElement>(null);
  const layout = plan.value!.layout;
  const box = stickerBox(sticker, layout);
  const active = activeSticker.value === sticker.id;
  // Output pixels per screen pixel.
  const scale = () => layout.width / ref.current!.parentElement!.getBoundingClientRect().width;

  const move = useDrag(() => {
    activeSticker.value = sticker.id;
    const k = scale();
    const start = box;
    return (dx, dy) => {
      const now = plan.value?.layout;
      if (now) updateSticker(sticker.id, anchorAt(start.cx + dx * k, start.cy + dy * k, now));
    };
  });

  const resize = useDrag((e) => {
    const sheet = ref.current!.parentElement!.getBoundingClientRect();
    const k = scale();
    const cx = sheet.left + box.cx / k;
    const cy = sheet.top + box.cy / k;
    const v0 = { x: e.clientX - cx, y: e.clientY - cy };
    const d0 = Math.hypot(v0.x, v0.y) || 1;
    const a0 = Math.atan2(v0.y, v0.x);
    const start = sticker;
    return (_dx, _dy, ev) => {
      const v = { x: ev.clientX - cx, y: ev.clientY - cy };
      let rot = start.rot + ((Math.atan2(v.y, v.x) - a0) * 180) / Math.PI;
      rot = ((rot + 540) % 360) - 180;
      // Settle on level when close to it.
      if (Math.abs(rot) < 4) rot = 0;
      updateSticker(sticker.id, { size: clamp((start.size * Math.hypot(v.x, v.y)) / d0, 0.03, 1.5), rot });
    };
  });

  return (
    <div
      ref={ref}
      class={`sticker${active ? ' active' : ''}`}
      data-sticker={sticker.id}
      style={{
        left: pct((box.cx - box.w / 2) / layout.width),
        top: pct((box.cy - box.h / 2) / layout.height),
        width: pct(box.w / layout.width),
        height: pct(box.h / layout.height),
        transform: `rotate(${sticker.rot}deg)`,
      }}
      onClick={(e) => e.stopPropagation()}
      {...move}
    >
      {active && (
        <>
          <button
            type="button"
            class="sticker-x"
            title={t('removeSticker')}
            aria-label={t('removeSticker')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => removeSticker(sticker.id)}
          >
            <Icon name="close" size={12} />
          </button>
          <span class="sticker-handle" title={t('resizeSticker')} {...resize} />
        </>
      )}
    </div>
  );
}

export function Preview() {
  const p = plan.value;
  const list = frames.value;
  const deco = decor.value;
  const s = settings.value;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const [estimate, setEstimate] = useState<Encoded | null>(null);

  useLayoutEffect(() => {
    if (p && canvasRef.current) renderTo(canvasRef.current, p, list, deco);
  }, [p, list, deco]);

  // File size estimate: encode with the export settings once things settle.
  useEffect(() => {
    if (!p) return;
    setEstimate(null);
    let stale = false;
    const timer = setTimeout(async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const result = await encodeCanvas(canvas, s.format, s.quality, s.maxBytes);
        if (!stale) setEstimate(result);
      } catch {
        /* estimate is optional */
      }
    }, 450);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [p, list, deco]);

  if (!p) return null;
  const { width, height } = p.layout;
  const byId = new Map(list.map((f) => [f.id, f]));
  const firstFull = p.layout.items.find((i) => i.full)?.id;

  return (
    <div class="preview">
      <div class="preview-bar">
        <div class="preview-info" aria-live="polite">
          <strong>
            {estimate ? `${estimate.width} × ${estimate.height}` : `${width} × ${height}`}
          </strong>
          <span>{s.format.toUpperCase().replace('JPEG', 'JPG')}</span>
          <span>{estimate ? formatBytes(estimate.blob.size) : t('estimating')}</span>
          {estimate?.adjusted && <span class="note">{t('adjusted')}</span>}
          {p.reduced && <span class="note">{t('reduced')}</span>}
        </div>
        <div class="preview-actions">
          {s.layout === 'captions' && (
            <button
              type="button"
              class={`chip${showGuides.value ? ' on' : ''}`}
              aria-pressed={showGuides.value}
              title={t('guides')}
              onClick={() => (showGuides.value = !showGuides.value)}
            >
              <Icon name="eye" size={15} />
              <span>{t('bandGuide')}</span>
            </button>
          )}
          <div class="seg small">
            <button type="button" class={zoom === 'fit' ? 'on' : ''} onClick={() => setZoom('fit')}>
              {t('zoomFit')}
            </button>
            <button type="button" class={zoom === 'actual' ? 'on' : ''} onClick={() => setZoom('actual')}>
              {t('zoomActual')}
            </button>
          </div>
        </div>
      </div>
      <div class="preview-scroll" onClick={() => (activeSticker.value = null)}>
        <div class="sheet" style={zoom === 'fit' ? { width: `min(100%, ${Math.min(width, 900)}px)` } : { width: `${width}px` }}>
          <canvas ref={canvasRef} />
          <div class="overlay">
            {p.layout.items.map((item) => {
              const f = byId.get(item.id);
              return f ? (
                <ItemOverlay key={item.id} item={item} frame={f} width={width} height={height} count={list.length} primary={item.id === firstFull} />
              ) : null;
            })}
            {stickers.value.map((s) => (
              <StickerOverlay key={s.id} sticker={s} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
