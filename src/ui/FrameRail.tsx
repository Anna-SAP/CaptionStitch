import { useState } from 'preact/hooks';
import { isFull } from '../core/layout';
import { t } from '../i18n';
import { activeId, clearAll, frames, reorder, settings } from '../state';
import { FrameTools } from './FrameTools';
import { Icon } from './icons';

/** The ordered list of screenshots: click to locate, drag to reorder. */
export function FrameRail({ onAdd }: { onAdd: () => void }) {
  const list = frames.value;
  const mode = settings.value.layout;
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const active = list.findIndex((f) => f.id === activeId.value);

  const locate = (id: string) => {
    activeId.value = id;
    document.querySelector(`[data-item="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <aside class="rail" aria-label={t('frames')}>
      <header class="rail-head">
        <h2>
          {t('frames')} <span class="count">{list.length}</span>
        </h2>
        <button type="button" class="link" onClick={clearAll}>
          {t('clearAll')}
        </button>
      </header>
      <ol class="rail-list" onDragLeave={() => setDropAt(null)}>
        {list.map((f, i) => (
          <li
            key={f.id}
            class={`thumb${activeId.value === f.id ? ' active' : ''}${dragId === f.id ? ' dragging' : ''}${dropAt === i ? ' drop-before' : ''}${dropAt === i + 1 && i === list.length - 1 ? ' drop-after' : ''}`}
            draggable
            onDragStart={(e) => {
              setDragId(f.id);
              e.dataTransfer!.effectAllowed = 'move';
              e.dataTransfer!.setData('text/x-captionstitch', f.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              const el = e.currentTarget as HTMLElement;
              const rect = el.getBoundingClientRect();
              const horizontal = getComputedStyle(el.parentElement!).flexDirection === 'row';
              const after = horizontal ? e.clientX > rect.left + rect.width / 2 : e.clientY > rect.top + rect.height / 2;
              setDropAt(after ? i + 1 : i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragId && dropAt !== null) {
                const from = list.findIndex((x) => x.id === dragId);
                reorder(dragId, dropAt > from ? dropAt - 1 : dropAt);
              }
              setDragId(null);
              setDropAt(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropAt(null);
            }}
          >
            <button type="button" onClick={() => locate(f.id)} title={f.name}>
              <img src={f.thumb} alt="" draggable={false} />
              <span class="thumb-index">{i + 1}</span>
              {mode === 'captions' && <span class="thumb-tag">{isFull(f, i, mode) ? t('fullTag') : t('stripTag')}</span>}
            </button>
          </li>
        ))}
        <li class="thumb add">
          <button type="button" onClick={onAdd} aria-label={t('addShots')} title={t('addShots')}>
            <Icon name="plus" size={20} />
          </button>
        </li>
      </ol>
      {active >= 0 && (
        <div class="rail-tools">
          <span class="muted">{active + 1}</span>
          <FrameTools frame={list[active]} index={active} count={list.length} full={isFull(list[active], active, mode)} />
        </div>
      )}
    </aside>
  );
}
