import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { encodeCanvas, formatBytes, renderTo, type Encoded } from '../core/export';
import { MIN_BAND, clamp, type Placed } from '../core/layout';
import { t } from '../i18n';
import { activeId, frames, plan, setBand, setFrameBand, settings, showGuides } from '../state';
import type { Frame } from '../types';
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
      onClick={() => (activeId.value = frame.id)}
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

export function Preview() {
  const p = plan.value;
  const list = frames.value;
  const s = settings.value;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const [estimate, setEstimate] = useState<Encoded | null>(null);

  useLayoutEffect(() => {
    if (p && canvasRef.current) renderTo(canvasRef.current, p, list);
  }, [p, list]);

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
  }, [p, list]);

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
      <div class="preview-scroll">
        <div class="sheet" style={zoom === 'fit' ? { width: `min(100%, ${Math.min(width, 900)}px)` } : { width: `${width}px` }}>
          <canvas ref={canvasRef} />
          <div class="overlay">
            {p.layout.items.map((item) => {
              const f = byId.get(item.id);
              return f ? (
                <ItemOverlay key={item.id} item={item} frame={f} width={width} height={height} count={list.length} primary={item.id === firstFull} />
              ) : null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
