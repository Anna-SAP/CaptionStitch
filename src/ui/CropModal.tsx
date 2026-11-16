import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { detectCrop } from '../core/detect';
import { clamp } from '../core/layout';
import { t } from '../i18n';
import { frames, modal, setCrop } from '../state';
import { FULL_RECT, type Rect } from '../types';
import { useDrag } from './controls';
import { Icon } from './icons';

const MIN = 0.05;
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const pct = (v: number) => `${v * 100}%`;

/** Crop editor: drag the edges, or let black bars be detected; the result can apply to every same-sized shot. */
export function CropModal({ id }: { id: string }) {
  const all = frames.value;
  const origin = all.find((f) => f.id === id);
  const group = origin ? all.filter((f) => f.w === origin.w && f.h === origin.h) : [];
  const [shown, setShown] = useState(Math.max(0, group.findIndex((f) => f.id === id)));
  const [rect, setRect] = useState<Rect>(origin?.crop ?? FULL_RECT);
  const [applyAll, setApplyAll] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const frame = group[Math.min(shown, group.length - 1)];
  const close = () => (modal.value = null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !frame) return;
    c.width = frame.work.width;
    c.height = frame.work.height;
    c.getContext('2d')!.drawImage(frame.work, 0, 0);
  }, [frame]);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const drag = (h: Handle) =>
    useDrag(() => {
      const box = boxRef.current!.getBoundingClientRect();
      const start = rect;
      return (dx, dy) => {
        const fx = dx / box.width;
        const fy = dy / box.height;
        let { x, y, w, h: hh } = start;
        if (h.includes('w')) {
          const nx = clamp(start.x + fx, 0, start.x + start.w - MIN);
          w = start.x + start.w - nx;
          x = nx;
        }
        if (h.includes('e')) w = clamp(start.w + fx, MIN, 1 - start.x);
        if (h.includes('n')) {
          const ny = clamp(start.y + fy, 0, start.y + start.h - MIN);
          hh = start.y + start.h - ny;
          y = ny;
        }
        if (h.includes('s')) hh = clamp(start.h + fy, MIN, 1 - start.y);
        setRect({ x, y, w, h: hh });
      };
    });
  const handles = HANDLES.map((h) => ({ h, props: drag(h) }));
  const move = useDrag(() => {
    const box = boxRef.current!.getBoundingClientRect();
    const start = rect;
    return (dx, dy) =>
      setRect({
        ...start,
        x: clamp(start.x + dx / box.width, 0, 1 - start.w),
        y: clamp(start.y + dy / box.height, 0, 1 - start.h),
      });
  });

  if (!origin || !frame) return null;
  const px = `${Math.round(rect.w * frame.w)} × ${Math.round(rect.h * frame.h)}`;

  return (
    <div class="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={t('cropTitle')}>
        <header class="modal-head">
          <h2>{t('cropTitle')}</h2>
          <span class="muted">{px}</span>
          <button type="button" class="icon-btn" aria-label={t('cancel')} onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div class="crop-stage">
          <div class="crop-box" ref={boxRef} style={{ aspectRatio: `${frame.w} / ${frame.h}`, maxWidth: `calc((100vh - 260px) * ${frame.w / frame.h})` }}>
            <canvas ref={canvasRef} />
            <div class="crop-dim" style={{ left: 0, top: 0, right: 0, height: pct(rect.y) }} />
            <div class="crop-dim" style={{ left: 0, bottom: 0, right: 0, height: pct(1 - rect.y - rect.h) }} />
            <div class="crop-dim" style={{ left: 0, top: pct(rect.y), width: pct(rect.x), height: pct(rect.h) }} />
            <div class="crop-dim" style={{ right: 0, top: pct(rect.y), width: pct(1 - rect.x - rect.w), height: pct(rect.h) }} />
            <div class="crop-rect" style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }} {...move}>
              {handles.map(({ h, props }) => (
                <span key={h} class={`crop-handle ${h}`} {...props} />
              ))}
            </div>
          </div>
        </div>
        <footer class="modal-foot">
          <div class="row wrap">
            <button
              type="button"
              class="btn"
              onClick={() => setRect(detectCrop((applyAll ? group : [frame]).map((f) => f.stats), frame.w, frame.h))}
            >
              <Icon name="wand" size={16} />
              {t('cropAuto')}
            </button>
            <button type="button" class="btn" onClick={() => setRect(FULL_RECT)}>
              {t('cropReset')}
            </button>
            {group.length > 1 && (
              <>
                <span class="pager">
                  <button type="button" class="icon-btn" aria-label={t('prev')} title={t('prev')} onClick={() => setShown((shown + group.length - 1) % group.length)}>
                    <Icon name="stepBack" size={16} />
                  </button>
                  {shown + 1} / {group.length}
                  <button type="button" class="icon-btn" aria-label={t('next')} title={t('next')} onClick={() => setShown((shown + 1) % group.length)}>
                    <Icon name="stepFwd" size={16} />
                  </button>
                </span>
                <label class="check">
                  <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll((e.target as HTMLInputElement).checked)} />
                  {t('cropApplyAll')}
                </label>
              </>
            )}
          </div>
          <div class="row">
            <button type="button" class="btn" onClick={close}>
              {t('cancel')}
            </button>
            <button
              type="button"
              class="btn primary"
              onClick={() => {
                setCrop(applyAll ? origin.id : frame.id, rect, applyAll);
                close();
              }}
            >
              {t('apply')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
